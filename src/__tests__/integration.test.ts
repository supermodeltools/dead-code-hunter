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
  let result: DeadCodeAnalysisResponse;

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
    idempotencyKey = `dead-code-hunter:integration:${commitHash}`;

    const zipBuffer = await fs.readFile(zipPath);
    const zipBlob = new Blob([zipBuffer], { type: 'application/zip' });
    result = await pollForResult(api, idempotencyKey, zipBlob);
  }, 120_000);

  it('should return a valid response shape', () => {
    expect(result).toBeDefined();
    expect(result.metadata).toBeDefined();
    expect(result.deadCodeCandidates).toBeDefined();
    expect(result.aliveCode).toBeDefined();
    expect(result.entryPoints).toBeDefined();
    expect(result.metadata.totalDeclarations).toBeGreaterThan(0);
    expect(typeof result.metadata.analysisMethod).toBe('string');
  });

  it('should detect dead code in this repo', () => {
    // We intentionally have uncalled functions in dead-code.ts and markdown.ts
    const candidates = result.deadCodeCandidates;

    console.log('\n=== Dead Code Analysis Results ===');
    console.log(`Total declarations: ${result.metadata.totalDeclarations}`);
    console.log(`Dead code candidates: ${candidates.length}`);
    console.log(`Alive code: ${result.metadata.aliveCode}`);
    console.log(`Analysis method: ${result.metadata.analysisMethod}`);

    for (const dc of candidates) {
      console.log(`  [${dc.confidence}] ${dc.type} ${dc.name} @ ${dc.file}:${dc.line} — ${dc.reason}`);
    }

    expect(candidates.length).toBeGreaterThan(0);
  });

  it('should include file, name, line, type, confidence, and reason on every candidate', () => {
    for (const dc of result.deadCodeCandidates) {
      expect(dc.file).toBeTruthy();
      expect(dc.name).toBeTruthy();
      expect(dc.line).toBeGreaterThan(0);
      expect(dc.type).toBeTruthy();
      expect(['high', 'medium', 'low']).toContain(dc.confidence);
      expect(dc.reason).toBeTruthy();
    }
  });

  it('should find known dead functions by name', () => {
    const names = result.deadCodeCandidates.map(c => c.name);

    // These exist in src/dead-code.ts and src/markdown.ts but are never called
    const knownDead = ['truncateString', 'groupByDirectory', 'fileSeverity',
                       'badge', 'barChart', 'numberedList'];
    const found = knownDead.filter(n => names.includes(n));

    console.log(`\nKnown dead functions found: ${found.join(', ')}`);
    console.log(`Known dead functions missed: ${knownDead.filter(n => !names.includes(n)).join(', ') || 'none'}`);

    // At least some of our intentionally dead code should be detected
    expect(found.length).toBeGreaterThanOrEqual(3);
  });

  it('should respect ignore-patterns filtering', () => {
    const all = result.deadCodeCandidates;
    const filtered = filterByIgnorePatterns(all, ['**/markdown.ts']);

    expect(filtered.length).toBeLessThan(all.length);
    expect(filtered.every(c => c.file !== 'src/markdown.ts')).toBe(true);
  });
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
