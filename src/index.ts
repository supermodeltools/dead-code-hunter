import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as github from '@actions/github';
import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { Configuration, DefaultApi } from '@supermodeltools/sdk';
import type { DeadCodeAnalysisResponseAsync, DeadCodeAnalysisResponse } from '@supermodeltools/sdk';
import { filterByIgnorePatterns, filterByChangedFiles, formatPrComment } from './dead-code';

/** Fields that should be redacted from logs */
const SENSITIVE_KEYS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'access_token',
  'refresh_token',
  'api_key',
  'apikey',
  'password',
  'secret',
  'token',
  'x-api-key',
]);

const MAX_VALUE_LENGTH = 1000;
const MAX_POLL_ATTEMPTS = 90;
const DEFAULT_RETRY_INTERVAL_MS = 10_000;
const POLL_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * Safely serialize a value for logging, handling circular refs, BigInt, and large values.
 * Redacts sensitive fields.
 */
function safeSerialize(value: unknown, maxLength = MAX_VALUE_LENGTH): string {
  try {
    const seen = new WeakSet();

    const serialized = JSON.stringify(value, (key, val) => {
      if (key && SENSITIVE_KEYS.has(key.toLowerCase())) {
        return '[REDACTED]';
      }
      if (typeof val === 'bigint') {
        return val.toString();
      }
      if (typeof val === 'object' && val !== null) {
        if (seen.has(val)) {
          return '[Circular]';
        }
        seen.add(val);
      }
      return val;
    }, 2);

    if (serialized && serialized.length > maxLength) {
      return serialized.slice(0, maxLength) + '... [truncated]';
    }

    return serialized ?? '[undefined]';
  } catch {
    return '[unserializable]';
  }
}

/**
 * Redact sensitive fields from an object (shallow copy).
 */
function redactSensitive(obj: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!obj || typeof obj !== 'object') {
    return null;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      result[key] = '[REDACTED]';
    } else {
      result[key] = value;
    }
  }
  return result;
}

async function createZipArchive(workspacePath: string): Promise<string> {
  const zipPath = path.join(workspacePath, '.dead-code-hunter-repo.zip');

  core.info('Creating zip archive...');

  await exec.exec('git', ['archive', '-o', zipPath, 'HEAD'], {
    cwd: workspacePath,
  });

  const stats = await fs.stat(zipPath);
  core.info(`Archive size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

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
    silent: true,
  });

  const commitHash = output.trim();
  const repoName = path.basename(workspacePath);

  return `${repoName}:analysis:deadcode:${commitHash}:${randomUUID()}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Polls the dead code analysis endpoint until the job completes or fails.
 * The API returns 202 while processing; re-submitting the same request
 * with the same idempotency key acts as a poll.
 */
async function pollForResult(
  api: DefaultApi,
  idempotencyKey: string,
  zipBlob: Blob
): Promise<DeadCodeAnalysisResponse> {
  const startTime = Date.now();

  for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
    const response: DeadCodeAnalysisResponseAsync = await api.generateDeadCodeAnalysis({
      idempotencyKey,
      file: zipBlob,
    });

    if (response.status === 'completed' && response.result) {
      return response.result;
    }

    if (response.status === 'failed') {
      throw new Error(`Analysis job failed: ${response.error || 'unknown error'}`);
    }

    const elapsed = Date.now() - startTime;
    if (elapsed >= POLL_TIMEOUT_MS) {
      throw new Error(`Analysis timed out after ${Math.round(elapsed / 1000)}s (job: ${response.jobId})`);
    }

    const retryMs = (response.retryAfter ?? DEFAULT_RETRY_INTERVAL_MS / 1000) * 1000;
    core.info(`Job ${response.jobId} status: ${response.status} (attempt ${attempt}/${MAX_POLL_ATTEMPTS}, retry in ${retryMs / 1000}s)`);
    await sleep(retryMs);
  }

  throw new Error(`Analysis did not complete within ${MAX_POLL_ATTEMPTS} polling attempts`);
}

/**
 * Fetches the list of files changed in the current PR.
 * Returns null if not running in a PR context.
 */
async function getChangedFiles(token: string): Promise<Set<string> | null> {
  const pr = github.context.payload.pull_request;
  if (!pr) return null;

  const octokit = github.getOctokit(token);
  const changedFiles = new Set<string>();

  // Paginate through all changed files (PRs can have 300+ files)
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

    const workspacePath = process.env.GITHUB_WORKSPACE || process.cwd();

    core.info('Dead Code Hunter starting...');

    // Step 1: Create zip archive
    const zipPath = await createZipArchive(workspacePath);

    // Step 2: Generate idempotency key
    const idempotencyKey = await generateIdempotencyKey(workspacePath);

    // Step 3: Call Supermodel dead code analysis API
    core.info('Analyzing codebase with Supermodel...');

    const config = new Configuration({
      basePath: process.env.SUPERMODEL_BASE_URL || 'https://api.supermodeltools.com',
      apiKey: apiKey,
    });

    const api = new DefaultApi(config);

    const zipBuffer = await fs.readFile(zipPath);
    const zipBlob = new Blob([zipBuffer], { type: 'application/zip' });

    const result = await pollForResult(api, idempotencyKey, zipBlob);

    // Step 4: Apply client-side ignore patterns
    let candidates = filterByIgnorePatterns(result.deadCodeCandidates, ignorePatterns);

    // Step 5: Scope to PR diff when running on a pull request
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
    core.info(`Alive: ${result.metadata.aliveCode}, Entry points: ${result.entryPoints.length}, Root files: ${result.metadata.rootFilesCount ?? 'n/a'}`);
    for (const dc of candidates) {
      core.info(`  [${dc.confidence}] ${dc.type} ${dc.name} @ ${dc.file}:${dc.line} — ${dc.reason}`);
    }

    // Step 6: Set outputs
    core.setOutput('dead-code-count', candidates.length);
    core.setOutput('dead-code-json', JSON.stringify(candidates));

    // Step 7: Post PR comment if enabled
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

    // Step 8: Clean up
    await fs.unlink(zipPath);

    // Step 9: Fail if configured and dead code found
    if (candidates.length > 0 && failOnDeadCode) {
      core.setFailed(`Found ${candidates.length} potentially unused code elements`);
    }

  } catch (error: any) {
    core.info('--- Error Debug Info ---');
    core.info(`Error type: ${error?.constructor?.name ?? 'unknown'}`);
    core.info(`Error message: ${error?.message ?? 'no message'}`);
    core.info(`Error name: ${error?.name ?? 'no name'}`);

    try {
      if (error?.response) {
        core.info(`Response status: ${error.response.status ?? 'unknown'}`);
        core.info(`Response statusText: ${error.response.statusText ?? 'unknown'}`);
        core.info(`Response data: ${safeSerialize(error.response.data)}`);
        core.debug(`Response headers: ${safeSerialize(redactSensitive(error.response.headers))}`);
      }
      if (error?.body) {
        core.info(`Error body: ${safeSerialize(error.body)}`);
      }
      if (error?.status) {
        core.info(`Error status: ${error.status}`);
      }
      if (error?.statusCode) {
        core.info(`Error statusCode: ${error.statusCode}`);
      }
      if (error?.cause) {
        core.debug(`Error cause: ${safeSerialize(error.cause)}`);
      }
    } catch {
      core.debug('Failed to serialize some error properties');
    }
    core.info('--- End Debug Info ---');

    let errorMessage = 'An unknown error occurred';
    let helpText = '';

    const status = error?.response?.status || error?.status || error?.statusCode;
    let apiMessage = '';

    try {
      apiMessage =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.response?.data ||
        error?.body?.message ||
        error?.body?.error ||
        error?.message ||
        '';
      if (typeof apiMessage !== 'string') {
        apiMessage = safeSerialize(apiMessage, 500);
      }
    } catch {
      apiMessage = '';
    }

    if (status === 401) {
      errorMessage = 'Invalid API key';
      helpText = 'Get your key at https://dashboard.supermodeltools.com';
    } else if (status === 500) {
      errorMessage = apiMessage || 'Internal server error';

      if (apiMessage.includes('Nested archives')) {
        helpText = 'Your repository contains nested archive files (.zip, .tar, etc.). ' +
          'Add them to .gitattributes with "export-ignore" to exclude from analysis. ' +
          'Example: tests/fixtures/*.zip export-ignore';
      } else if (apiMessage.includes('exceeds maximum')) {
        helpText = 'Your repository or a file within it exceeds size limits. ' +
          'Consider excluding large files using .gitattributes with "export-ignore".';
      }
    } else if (status === 413) {
      errorMessage = 'Repository archive too large';
      helpText = 'Reduce archive size by excluding large files in .gitattributes';
    } else if (status === 429) {
      errorMessage = 'Rate limit exceeded';
      helpText = 'Please wait before retrying';
    } else if (status) {
      errorMessage = apiMessage || `API error (${status})`;
    } else {
      errorMessage = apiMessage || error?.message || 'An unknown error occurred';
    }

    core.error(`Error: ${errorMessage}`);
    if (helpText) {
      core.error(`Help: ${helpText}`);
    }

    core.setFailed(errorMessage);
  }
}

run();
