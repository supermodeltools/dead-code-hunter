import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as github from '@actions/github';
import { filterByChangedFiles, formatPrComment } from './dead-code';
import type { DeadCodeResult } from './dead-code';

function processEnv(extra: Record<string, string> = {}): Record<string, string> {
  const base: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) base[k] = v;
  }
  return { ...base, ...extra };
}

async function installCLI(version: string): Promise<void> {
  const env = version !== 'latest'
    ? processEnv({ SUPERMODEL_VERSION: version })
    : processEnv();
  core.info(`Installing Supermodel CLI${version !== 'latest' ? ` ${version}` : ' (latest)'}...`);
  await exec.exec(
    'sh',
    ['-c', 'curl -fsSL https://raw.githubusercontent.com/supermodeltools/cli/main/install.sh | sh'],
    { env }
  );
}

async function runDeadCodeAnalysis(opts: {
  apiKey: string;
  minConfidence: string;
  ignorePatterns: string[];
  timeoutSeconds: number;
}): Promise<DeadCodeResult> {
  const args = ['dead-code', '-o', 'json'];

  if (opts.minConfidence) {
    args.push('--min-confidence', opts.minConfidence);
  }

  for (const pattern of opts.ignorePatterns) {
    args.push('--ignore', pattern);
  }

  core.info(`Running: supermodel ${args.join(' ')}`);

  const { stdout } = await exec.getExecOutput('supermodel', args, {
    env: processEnv({ SUPERMODEL_API_KEY: opts.apiKey }),
    ignoreReturnCode: false,
  });

  return JSON.parse(stdout.trim()) as DeadCodeResult;
}

async function getChangedFiles(token: string): Promise<Set<string> | null> {
  const pr = github.context.payload.pull_request;
  if (!pr) return null;

  const octokit = github.getOctokit(token);
  const changedFiles = new Set<string>();

  for (let page = 1; ; page++) {
    const { data: files } = await octokit.rest.pulls.listFiles({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      pull_number: pr.number,
      per_page: 100,
      page,
    });

    for (const file of files) {
      changedFiles.add(file.filename);
    }

    if (files.length < 100) break;
  }

  return changedFiles;
}

async function run(): Promise<void> {
  try {
    const apiKey = core.getInput('supermodel-api-key', { required: true }).trim();

    if (!apiKey.startsWith('smsk_')) {
      core.warning('API key format looks incorrect. Get your key at https://dashboard.supermodeltools.com');
    }

    const commentOnPr = core.getBooleanInput('comment-on-pr');
    const failOnDeadCode = core.getBooleanInput('fail-on-dead-code');
    const ignorePatterns: string[] = JSON.parse(core.getInput('ignore-patterns') || '[]');
    const minConfidence = core.getInput('min-confidence') || '';
    const timeoutSeconds = parseInt(core.getInput('timeout-seconds') || '7200', 10);
    const cliVersion = core.getInput('cli-version') || 'latest';

    // Step 1: Install the Supermodel CLI
    await installCLI(cliVersion);

    // Step 2: Run dead code analysis via CLI
    core.info('Analyzing codebase with Supermodel...');
    const result = await runDeadCodeAnalysis({
      apiKey,
      minConfidence,
      ignorePatterns,
      timeoutSeconds,
    });

    let candidates = result.deadCodeCandidates;

    // Step 3: Scope to PR diff when running on a pull request
    const token = core.getInput('github-token') || process.env.GITHUB_TOKEN;
    let changedFiles: Set<string> | null = null;

    if (github.context.payload.pull_request && token) {
      changedFiles = await getChangedFiles(token);
      if (changedFiles) {
        const totalBeforeScoping = candidates.length;
        candidates = filterByChangedFiles(candidates, changedFiles);
        core.info(`Scoped to PR: ${candidates.length} findings in changed files (${totalBeforeScoping} total across repo, ${changedFiles.size} files in PR)`);
      }
    }

    core.info(`Found ${candidates.length} potentially unused code elements (${result.metadata.totalDeclarations} declarations analyzed)`);
    core.info(`Analysis method: ${result.metadata.analysisMethod}`);
    core.info(`Alive: ${result.metadata.aliveCode}, Entry points: ${result.entryPoints.length}`);
    for (const dc of candidates) {
      core.info(`  [${dc.confidence}] ${dc.type} ${dc.name} @ ${dc.file}:${dc.line} — ${dc.reason}`);
    }

    // Step 4: Set outputs
    core.setOutput('dead-code-count', candidates.length);
    core.setOutput('dead-code-json', JSON.stringify(candidates));

    // Step 5: Post PR comment if enabled
    if (commentOnPr && github.context.payload.pull_request) {
      if (token) {
        const octokit = github.getOctokit(token);
        const comment = formatPrComment(candidates, result.metadata);

        await octokit.rest.issues.createComment({
          owner: github.context.repo.owner,
          repo: github.context.repo.repo,
          issue_number: github.context.payload.pull_request.number,
          body: comment,
        });

        core.info('Posted findings to PR');
      } else {
        core.warning('GITHUB_TOKEN not available, skipping PR comment');
      }
    }

    // Step 6: Fail if configured and dead code found
    if (candidates.length > 0 && failOnDeadCode) {
      core.setFailed(`Found ${candidates.length} potentially unused code elements`);
    }

  } catch (error: unknown) {
    let message = 'An unknown error occurred';

    if (error instanceof SyntaxError) {
      message = 'Failed to parse CLI output as JSON. Make sure the Supermodel CLI installed correctly.';
      core.error(message);
      core.debug(`Parse error: ${error.message}`);
    } else if (error instanceof Error) {
      const msg = error.message;
      core.debug(`Error: ${msg}`);

      if (msg.includes('not authenticated') || msg.includes('SUPERMODEL_API_KEY')) {
        message = 'Invalid or missing API key';
        core.error(`${message}. Get your key at https://dashboard.supermodeltools.com`);
      } else if (msg.includes('timed out') || msg.includes('ETIMEDOUT')) {
        message = `Analysis timed out. Increase timeout-seconds (current: ${core.getInput('timeout-seconds')})`;
        core.error(message);
      } else if (msg.includes('API error 401')) {
        message = 'Invalid API key';
        core.error(`${message}. Get your key at https://dashboard.supermodeltools.com`);
      } else if (msg.includes('API error 413')) {
        message = 'Repository archive too large';
        core.error(`${message}. Exclude large files using .gitattributes with export-ignore.`);
      } else if (msg.includes('API error 429')) {
        message = 'Rate limit exceeded. Please wait before retrying.';
        core.error(message);
      } else if (msg.includes('Nested archives')) {
        message = 'Repository contains nested archive files';
        core.error(`${message}. Add them to .gitattributes with "export-ignore".`);
      } else if (msg.includes('exceeds maximum')) {
        message = 'Repository or file exceeds size limits';
        core.error(`${message}. Exclude large files using .gitattributes with export-ignore.`);
      } else {
        message = msg;
        core.error(message);
      }
    } else {
      core.error(String(error));
    }

    core.setFailed(message);
  }
}

run();
