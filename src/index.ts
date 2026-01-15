import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as github from '@actions/github';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Configuration, DefaultApi } from '@supermodeltools/sdk';
import { findDeadCode, formatPrComment } from './dead-code';

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

  return `${repoName}:supermodel:${commitHash}`;
}

async function run(): Promise<void> {
  try {
    const apiKey = core.getInput('supermodel-api-key', { required: true }).trim();

    if (!apiKey.startsWith('smsk_')) {
      core.warning('API key format looks incorrect. Get your key at https://dashboard.supermodeltools.com');
    }

    const commentOnPr = core.getBooleanInput('comment-on-pr');
    const failOnDeadCode = core.getBooleanInput('fail-on-dead-code');
    const ignorePatterns = JSON.parse(core.getInput('ignore-patterns') || '[]');

    const workspacePath = process.env.GITHUB_WORKSPACE || process.cwd();

    core.info('Dead Code Hunter starting...');

    // Step 1: Create zip archive
    const zipPath = await createZipArchive(workspacePath);

    // Step 2: Generate idempotency key
    const idempotencyKey = await generateIdempotencyKey(workspacePath);

    // Step 3: Call Supermodel API
    core.info('Analyzing codebase with Supermodel...');

    const config = new Configuration({
      basePath: process.env.SUPERMODEL_BASE_URL || 'https://api.supermodeltools.com',
      apiKey: apiKey,
    });

    const api = new DefaultApi(config);

    const zipBuffer = await fs.readFile(zipPath);
    const zipBlob = new Blob([zipBuffer], { type: 'application/zip' });

    const response = await api.generateSupermodelGraph({
      idempotencyKey,
      file: zipBlob,
    });

    // Step 4: Analyze for dead code
    const nodes = response.graph?.nodes || [];
    const relationships = response.graph?.relationships || [];

    const deadCode = findDeadCode(nodes, relationships, ignorePatterns);

    core.info(`Found ${deadCode.length} potentially unused functions`);

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

        core.info('Posted findings to PR');
      } else {
        core.warning('GITHUB_TOKEN not available, skipping PR comment');
      }
    }

    // Step 7: Clean up
    await fs.unlink(zipPath);

    // Step 8: Fail if configured and dead code found
    if (deadCode.length > 0 && failOnDeadCode) {
      core.setFailed(`Found ${deadCode.length} potentially unused functions`);
    }

  } catch (error: any) {
    // Log full error details for debugging
    core.info('--- Error Debug Info ---');
    core.info(`Error type: ${error?.constructor?.name}`);
    core.info(`Error message: ${error?.message}`);
    core.info(`Error name: ${error?.name}`);

    // Check various error structures used by different HTTP clients
    if (error?.response) {
      core.info(`Response status: ${error.response.status}`);
      core.info(`Response statusText: ${error.response.statusText}`);
      core.info(`Response data: ${JSON.stringify(error.response.data, null, 2)}`);
      core.info(`Response headers: ${JSON.stringify(error.response.headers, null, 2)}`);
    }
    if (error?.body) {
      core.info(`Error body: ${JSON.stringify(error.body, null, 2)}`);
    }
    if (error?.status) {
      core.info(`Error status: ${error.status}`);
    }
    if (error?.statusCode) {
      core.info(`Error statusCode: ${error.statusCode}`);
    }
    if (error?.cause) {
      core.info(`Error cause: ${JSON.stringify(error.cause, null, 2)}`);
    }
    core.info('--- End Debug Info ---');

    let errorMessage = 'An unknown error occurred';
    let helpText = '';

    // Try multiple error structures
    const status = error?.response?.status || error?.status || error?.statusCode;
    let apiMessage = '';

    // Try to extract message from various locations
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
        apiMessage = JSON.stringify(apiMessage);
      }
    } catch {
      // Ignore parsing errors
    }

    if (status === 401) {
      errorMessage = 'Invalid API key';
      helpText = 'Get your key at https://dashboard.supermodeltools.com';
    } else if (status === 500) {
      errorMessage = apiMessage || 'Internal server error';

      // Check for common issues and provide guidance
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
