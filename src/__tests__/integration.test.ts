import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Configuration, DefaultApi } from '@supermodeltools/sdk';
import { findDeadCode } from '../dead-code';

const API_KEY = process.env.SUPERMODEL_API_KEY;
const SKIP_INTEGRATION = !API_KEY;

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

    // Create zip of this repo (dead-code-hunter testing itself!)
    const repoRoot = path.resolve(__dirname, '../..');
    zipPath = '/tmp/dead-code-hunter-test.zip';

    execSync(`git archive -o ${zipPath} HEAD`, { cwd: repoRoot });

    const commitHash = execSync('git rev-parse --short HEAD', { cwd: repoRoot })
      .toString()
      .trim();
    idempotencyKey = `dead-code-hunter:call:${commitHash}`;
  });

  it('should call the Supermodel API and get a call graph', async () => {
    const zipBuffer = await fs.readFile(zipPath);
    const zipBlob = new Blob([zipBuffer], { type: 'application/zip' });

    let response = await api.generateCallGraph({
      idempotencyKey,
      file: zipBlob,
    }) as any;

    // Poll until job completes
    while (response.status === 'pending' || response.status === 'processing') {
      const waitSeconds = response.retryAfter || 5;
      console.log(`Job ${response.jobId} is ${response.status}, waiting ${waitSeconds}s...`);
      await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
      response = await api.generateCallGraph({
        idempotencyKey,
        file: zipBlob,
      }) as any;
    }

    expect(response.status).toBe('completed');
    const graph = response.result?.graph || response.graph;
    expect(graph).toBeDefined();
    expect(graph?.nodes).toBeDefined();
    expect(graph?.relationships).toBeDefined();

    console.log('Nodes:', graph?.nodes?.length);
    console.log('Relationships:', graph?.relationships?.length);
  }, 120000); // 120 second timeout for async API

  it('should find dead code in the dead-code-hunter repo itself', async () => {
    const zipBuffer = await fs.readFile(zipPath);
    const zipBlob = new Blob([zipBuffer], { type: 'application/zip' });

    let response = await api.generateCallGraph({
      idempotencyKey,
      file: zipBlob,
    }) as any;

    // Poll until job completes
    while (response.status === 'pending' || response.status === 'processing') {
      const waitSeconds = response.retryAfter || 5;
      await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
      response = await api.generateCallGraph({
        idempotencyKey,
        file: zipBlob,
      }) as any;
    }

    expect(response.status).toBe('completed');
    const graph = response.result?.graph || response.graph;
    const nodes = graph?.nodes || [];
    const relationships = graph?.relationships || [];

    const deadCode = findDeadCode(nodes, relationships);

    console.log('\n=== Dead Code Hunter Self-Analysis ===');
    console.log(`Total functions: ${nodes.filter(n => n.labels?.includes('Function')).length}`);
    console.log(`Total call relationships: ${relationships.filter(r => r.type === 'calls').length}`);
    console.log(`Dead code found: ${deadCode.length}`);

    if (deadCode.length > 0) {
      console.log('\nPotentially dead functions:');
      for (const dc of deadCode.slice(0, 10)) {
        console.log(`  - ${dc.name} (${dc.filePath}:${dc.startLine || '?'})`);
      }
    }

    // The test passes regardless of dead code count - we just want to verify the flow works
    expect(Array.isArray(deadCode)).toBe(true);
  }, 120000);
});

describe('Integration Test Prerequisites', () => {
  it('should have SUPERMODEL_API_KEY to run integration tests', () => {
    if (SKIP_INTEGRATION) {
      console.log('⚠️  SUPERMODEL_API_KEY not set - skipping integration tests');
      console.log('   Set the environment variable to run integration tests');
    } else {
      console.log('✓ SUPERMODEL_API_KEY is set');
    }
    expect(true).toBe(true); // Always passes
  });
});
