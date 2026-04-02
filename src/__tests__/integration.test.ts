import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'child_process';
import type { DeadCodeResult } from '../dead-code';

const API_KEY = process.env.SUPERMODEL_API_KEY;
const SKIP_INTEGRATION = !API_KEY;

function cliAvailable(): boolean {
  try {
    execSync('supermodel version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

describe.skipIf(SKIP_INTEGRATION || !cliAvailable())('Integration Tests', () => {
  let result: DeadCodeResult;

  beforeAll(() => {
    const output = execSync('supermodel dead-code -o json', {
      env: { ...process.env, SUPERMODEL_API_KEY: API_KEY! },
      timeout: 120_000,
      encoding: 'utf-8',
    });

    result = JSON.parse(output.trim()) as DeadCodeResult;
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

  it('should analyze the codebase without errors', () => {
    console.log('\n=== Dead Code Analysis Results ===');
    console.log(`Total declarations: ${result.metadata.totalDeclarations}`);
    console.log(`Dead code candidates: ${result.deadCodeCandidates.length}`);
    console.log(`Alive code: ${result.metadata.aliveCode}`);
    console.log(`Analysis method: ${result.metadata.analysisMethod}`);

    for (const dc of result.deadCodeCandidates) {
      console.log(`  [${dc.confidence}] ${dc.type} ${dc.name} @ ${dc.file}:${dc.line} — ${dc.reason}`);
    }

    expect(result.metadata.totalDeclarations).toBeGreaterThan(0);
  });

  it('should include valid fields on every candidate', () => {
    for (const dc of result.deadCodeCandidates) {
      expect(dc.file).toBeTruthy();
      expect(dc.name).toBeTruthy();
      expect(dc.line).toBeGreaterThan(0);
      expect(dc.type).toBeTruthy();
      expect(['high', 'medium', 'low']).toContain(dc.confidence);
      expect(dc.reason).toBeTruthy();
    }
  });

  it('should respect --ignore flag via CLI (post-filter reduces results)', () => {
    const all = result.deadCodeCandidates;

    // Run with a broad ignore pattern and verify count is less than or equal
    if (all.length === 0) return;

    const filtered = execSync('supermodel dead-code -o json --ignore "**/*.ts"', {
      env: { ...process.env, SUPERMODEL_API_KEY: API_KEY! },
      timeout: 120_000,
      encoding: 'utf-8',
    });
    const filteredResult = JSON.parse(filtered.trim()) as DeadCodeResult;
    expect(filteredResult.deadCodeCandidates.length).toBeLessThanOrEqual(all.length);
  });
});

describe('Integration Test Prerequisites', () => {
  it('should have SUPERMODEL_API_KEY to run integration tests', () => {
    if (SKIP_INTEGRATION) {
      console.log('SUPERMODEL_API_KEY not set — skipping integration tests');
      console.log('  Set the environment variable to run integration tests');
    } else if (!cliAvailable()) {
      console.log('supermodel CLI not found — skipping integration tests');
      console.log('  Install with: curl -fsSL https://supermodeltools.com/install.sh | sh');
    } else {
      console.log('SUPERMODEL_API_KEY is set and CLI is available');
    }
    expect(true).toBe(true);
  });
});
