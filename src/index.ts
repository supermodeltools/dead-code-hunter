import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as github from '@actions/github';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { Configuration, DefaultApi, CodeGraphNode, CodeGraphRelationship } from '@supermodeltools/sdk';
import { minimatch } from 'minimatch';

interface DeadCodeResult {
  id: string;
  name: string;
  filePath: string;
  startLine?: number;
  endLine?: number;
}

// Default patterns to exclude from analysis
const DEFAULT_EXCLUDE_PATTERNS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.git/**',
  '**/vendor/**',
  '**/target/**',
  '**/*.test.ts',
  '**/*.test.tsx',
  '**/*.test.js',
  '**/*.test.jsx',
  '**/*.spec.ts',
  '**/*.spec.tsx',
  '**/*.spec.js',
  '**/*.spec.jsx',
  '**/__tests__/**',
  '**/__mocks__/**',
];

// Patterns that indicate a function is an entry point (not dead code)
const ENTRY_POINT_PATTERNS = [
  // Common entry point file names
  '**/index.ts',
  '**/index.js',
  '**/main.ts',
  '**/main.js',
  '**/app.ts',
  '**/app.js',
  // Test files (functions here aren't "dead")
  '**/*.test.*',
  '**/*.spec.*',
  '**/__tests__/**',
];

// Function names that are typically entry points
const ENTRY_POINT_FUNCTION_NAMES = [
  'main',
  'run',
  'start',
  'init',
  'setup',
  'bootstrap',
  'default', // default exports
  'handler', // serverless handlers
  'GET', 'POST', 'PUT', 'DELETE', 'PATCH', // HTTP method handlers
];

async function createZipArchive(workspacePath: string): Promise<string> {
  const zipPath = path.join(workspacePath, '.dead-code-hunter-repo.zip');

  core.info('Creating zip archive using git archive...');

  await exec.exec('git', ['archive', '-o', zipPath, 'HEAD'], {
    cwd: workspacePath,
  });

  const stats = await fs.stat(zipPath);
  core.info(`Created zip archive: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

  return zipPath;
}

async function generateIdempotencyKey(workspacePath: string): Promise<string> {
  let output = '';
  await exec.exec('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: workspacePath,
    listeners: {
      stdout: (data: Buffer) => {
        output += data.toString();
      },
    },
  });

  const commitHash = output.trim();
  const repoName = path.basename(workspacePath);

  return `${repoName}:call:${commitHash}`;
}

function isEntryPointFile(filePath: string): boolean {
  return ENTRY_POINT_PATTERNS.some(pattern => minimatch(filePath, pattern));
}

function isEntryPointFunction(name: string): boolean {
  const lowerName = name.toLowerCase();
  return ENTRY_POINT_FUNCTION_NAMES.some(ep => lowerName === ep.toLowerCase());
}

function shouldIgnoreFile(filePath: string, ignorePatterns: string[]): boolean {
  const allPatterns = [...DEFAULT_EXCLUDE_PATTERNS, ...ignorePatterns];
  return allPatterns.some(pattern => minimatch(filePath, pattern));
}

function findDeadCode(
  nodes: CodeGraphNode[],
  relationships: CodeGraphRelationship[],
  ignorePatterns: string[]
): DeadCodeResult[] {
  // Get all function nodes
  const functionNodes = nodes.filter(node =>
    node.labels?.includes('Function')
  );

  core.info(`Found ${functionNodes.length} functions in codebase`);

  // Get all "calls" relationships - these tell us which functions are called
  const callRelationships = relationships.filter(rel => rel.type === 'calls');

  core.info(`Found ${callRelationships.length} call relationships`);

  // Build a set of all function IDs that are called (endNode of a "calls" relationship)
  const calledFunctionIds = new Set(callRelationships.map(rel => rel.endNode));

  // Find functions that are never called
  const deadCode: DeadCodeResult[] = [];

  for (const node of functionNodes) {
    const props = node.properties || {};
    const filePath = props.filePath || props.file || '';
    const name = props.name || 'anonymous';

    // Skip if this function is called somewhere
    if (calledFunctionIds.has(node.id)) {
      continue;
    }

    // Skip if file matches ignore patterns
    if (shouldIgnoreFile(filePath, ignorePatterns)) {
      continue;
    }

    // Skip if this is an entry point file
    if (isEntryPointFile(filePath)) {
      continue;
    }

    // Skip if this is an entry point function name
    if (isEntryPointFunction(name)) {
      continue;
    }

    // Skip exported functions (they might be called externally)
    if (props.exported === true || props.isExported === true) {
      continue;
    }

    deadCode.push({
      id: node.id,
      name,
      filePath,
      startLine: props.startLine,
      endLine: props.endLine,
    });
  }

  return deadCode;
}

function formatPrComment(deadCode: DeadCodeResult[]): string {
  if (deadCode.length === 0) {
    return `## Dead Code Hunter

No dead code found! Your codebase is clean.`;
  }

  const rows = deadCode
    .slice(0, 50) // Limit to 50 to avoid huge comments
    .map(dc => {
      const lineInfo = dc.startLine ? `L${dc.startLine}` : '';
      const fileLink = dc.startLine
        ? `${dc.filePath}#L${dc.startLine}`
        : dc.filePath;
      return `| \`${dc.name}\` | ${fileLink} | ${lineInfo} |`;
    })
    .join('\n');

  let comment = `## Dead Code Hunter

Found **${deadCode.length}** potentially unused function${deadCode.length === 1 ? '' : 's'}:

| Function | File | Line |
|----------|------|------|
${rows}`;

  if (deadCode.length > 50) {
    comment += `\n\n_...and ${deadCode.length - 50} more. See action output for full list._`;
  }

  comment += `\n\n---\n_Powered by [Supermodel](https://supermodeltools.com) call graph analysis_`;

  return comment;
}

async function run(): Promise<void> {
  try {
    const apiKey = core.getInput('supermodel-api-key', { required: true });
    const commentOnPr = core.getBooleanInput('comment-on-pr');
    const failOnDeadCode = core.getBooleanInput('fail-on-dead-code');
    const ignorePatterns = JSON.parse(core.getInput('ignore-patterns') || '[]');

    const workspacePath = process.env.GITHUB_WORKSPACE || process.cwd();

    core.info('Dead Code Hunter starting...');
    core.info(`Workspace: ${workspacePath}`);

    // Step 1: Create zip archive
    const zipPath = await createZipArchive(workspacePath);

    // Step 2: Generate idempotency key
    const idempotencyKey = await generateIdempotencyKey(workspacePath);
    core.info(`Idempotency key: ${idempotencyKey}`);

    // Step 3: Call Supermodel API
    core.info('Calling Supermodel API for call graph...');

    const config = new Configuration({
      basePath: process.env.SUPERMODEL_BASE_URL || 'https://api.supermodeltools.com',
      apiKey: apiKey,
    });

    const api = new DefaultApi(config);

    const zipBuffer = await fs.readFile(zipPath);
    const zipBlob = new Blob([zipBuffer], { type: 'application/zip' });

    const response = await api.generateCallGraph({
      idempotencyKey,
      file: zipBlob,
    });

    core.info(`API response received. Stats: ${JSON.stringify(response.stats)}`);

    // Step 4: Analyze for dead code
    const nodes = response.graph?.nodes || [];
    const relationships = response.graph?.relationships || [];

    const deadCode = findDeadCode(nodes, relationships, ignorePatterns);

    core.info(`Found ${deadCode.length} potentially dead functions`);

    // Step 5: Set outputs
    core.setOutput('dead-code-count', deadCode.length);
    core.setOutput('dead-code-json', JSON.stringify(deadCode));

    // Step 6: Post PR comment if enabled
    if (commentOnPr && github.context.payload.pull_request) {
      const token = process.env.GITHUB_TOKEN;
      if (token) {
        const octokit = github.getOctokit(token);
        const comment = formatPrComment(deadCode);

        await octokit.rest.issues.createComment({
          owner: github.context.repo.owner,
          repo: github.context.repo.repo,
          issue_number: github.context.payload.pull_request.number,
          body: comment,
        });

        core.info('Posted PR comment');
      } else {
        core.warning('GITHUB_TOKEN not available, skipping PR comment');
      }
    }

    // Step 7: Clean up
    await fs.unlink(zipPath);

    // Step 8: Fail if configured and dead code found
    if (deadCode.length > 0 && failOnDeadCode) {
      core.setFailed(`Found ${deadCode.length} dead code functions`);
    }

  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed('An unknown error occurred');
    }
  }
}

run();
