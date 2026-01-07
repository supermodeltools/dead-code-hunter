import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as github from '@actions/github';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Configuration, DefaultApi } from '@supermodeltools/sdk';
import { findDeadCode, formatPrComment } from './dead-code';

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

async function run(): Promise<void> {
  try {
    const apiKey = core.getInput('supermodel-api-key', { required: true }).trim();

    // Validate API key format
    if (!apiKey.startsWith('smsk_')) {
      core.warning('API key does not start with expected prefix "smsk_"');
    }
    // Log key details for debugging (safe - only shows prefix/suffix)
    core.info(`API key configured (${apiKey.length} chars, starts: ${apiKey.substring(0, 12)}..., ends: ...${apiKey.substring(apiKey.length - 4)})`);

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

  } catch (error: any) {
    // Log detailed error info for debugging
    if (error.response) {
      try {
        const body = await error.response.text();
        core.error(`API Error - Status: ${error.response.status}`);
        core.error(`API Error - Body: ${body}`);
      } catch {
        core.error(`API Error - Status: ${error.response.status}`);
      }
    }

    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed('An unknown error occurred');
    }
  }
}

run();
