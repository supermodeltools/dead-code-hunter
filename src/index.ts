import * as core from '@actions/core';
import * as github from '@actions/github';

async function run(): Promise<void> {
  try {
    const apiKey = core.getInput('supermodel-api-key', { required: true });
    const commentOnPr = core.getBooleanInput('comment-on-pr');
    const failOnDeadCode = core.getBooleanInput('fail-on-dead-code');
    const ignorePatterns = JSON.parse(core.getInput('ignore-patterns') || '[]');
    const autoPr = core.getBooleanInput('auto-pr');

    core.info('Dead Code Hunter starting...');

    // TODO: Implement
    // 1. Create zip archive of repository
    // 2. Call Supermodel /v1/graphs/call endpoint
    // 3. Analyze call graph for functions with no incoming calls
    // 4. Filter out entry points, exports, test files
    // 5. Report findings

    const deadCodeCount = 0;
    const deadCodeJson: string[] = [];

    core.setOutput('dead-code-count', deadCodeCount);
    core.setOutput('dead-code-json', JSON.stringify(deadCodeJson));

    if (deadCodeCount > 0 && failOnDeadCode) {
      core.setFailed(`Found ${deadCodeCount} dead code functions`);
    }
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    }
  }
}

run();
