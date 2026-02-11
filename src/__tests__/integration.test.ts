import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Configuration, DefaultApi } from '@supermodeltools/sdk';
import type { DeadCodeAnalysisResponseAsync, DeadCodeAnalysisResponse } from '@supermodeltools/sdk';
import { filterByIgnorePatterns } from '../dead-code';

const API_KEY = process.env.SUPERMODEL_API_KEY;
const SKIP_INTEGRATION = !API_KEY;

async function pollForResult(
  api: DefaultApi,
  idempotencyKey: string,
  zipBlob: Blob,
  timeoutMs = 120_000
): Promise<DeadCodeAnalysisResponse> {
  const startTime = Date.now();

  for (let attempt = 1; attempt <= 30; attempt++) {
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

    if (Date.now() - startTime >= timeoutMs) {
      throw new Error(`Polling timed out after ${timeoutMs}ms`);
    }

    const retryMs = (response.retryAfter ?? 10) * 1000;
    await new Promise(resolve => setTimeout(resolve, retryMs));
  }

  throw new Error('Max polling attempts exceeded');
}

describe.skipIf(SKIP_INTEGRATION)('Integration Tests', () => {
  let api: DefaultApi;
  let zipPath: string;
  let idempotencyKey: string;

  beforeAll(async () => {
    const config = new Configuration({
      basePath: process.env.SUPERMODEL_BASE_URL || 'https://api.supermodeltools.com',
      apiKey: API_KEY!,
    });
    api = new DefaultApi(config);

    const repoRoot = path.resolve(__dirname, '../..');
    zipPath = '/tmp/dead-code-hunter-test.zip';

    execSync(`git archive -o ${zipPath} HEAD`, { cwd: repoRoot });

    const commitHash = execSync('git rev-parse --short HEAD', { cwd: repoRoot })
      .toString()
      .trim();
    idempotencyKey = `dead-code-hunter:analysis:deadcode:${commitHash}`;
  });

  it('should call the dead code analysis API and get results', async () => {
    const zipBuffer = await fs.readFile(zipPath);
    const zipBlob = new Blob([zipBuffer], { type: 'application/zip' });

    const result = await pollForResult(api, idempotencyKey, zipBlob);

    expect(result).toBeDefined();
    expect(result.metadata).toBeDefined();
    expect(result.deadCodeCandidates).toBeDefined();
    expect(result.aliveCode).toBeDefined();
    expect(result.entryPoints).toBeDefined();
    expect(result.metadata.totalDeclarations).toBeGreaterThan(0);

    console.log('Metadata:', result.metadata);
    console.log('Dead code candidates:', result.deadCodeCandidates.length);
    console.log('Alive code:', result.aliveCode.length);
    console.log('Entry points:', result.entryPoints.length);
  }, 120_000);

  it('should analyze dead code in the dead-code-hunter repo itself', async () => {
    const zipBuffer = await fs.readFile(zipPath);
    const zipBlob = new Blob([zipBuffer], { type: 'application/zip' });

    const result = await pollForResult(api, idempotencyKey, zipBlob);
    const candidates = filterByIgnorePatterns(result.deadCodeCandidates, []);

    console.log('\n=== Dead Code Hunter Self-Analysis ===');
    console.log(`Total declarations: ${result.metadata.totalDeclarations}`);
    console.log(`Dead code candidates: ${candidates.length}`);
    console.log(`Alive code: ${result.metadata.aliveCode}`);
    console.log(`Analysis method: ${result.metadata.analysisMethod}`);

    if (candidates.length > 0) {
      console.log('\nPotentially dead code:');
      for (const dc of candidates.slice(0, 10)) {
        console.log(`  - [${dc.confidence}] ${dc.name} (${dc.file}:${dc.line}) - ${dc.reason}`);
      }
    }

    expect(Array.isArray(candidates)).toBe(true);
  }, 120_000);
});

describe('Integration Test Prerequisites', () => {
  it('should have SUPERMODEL_API_KEY to run integration tests', () => {
    if (SKIP_INTEGRATION) {
      console.log('SUPERMODEL_API_KEY not set - skipping integration tests');
      console.log('   Set the environment variable to run integration tests');
    } else {
      console.log('SUPERMODEL_API_KEY is set');
    }
    expect(true).toBe(true);
  });
});
