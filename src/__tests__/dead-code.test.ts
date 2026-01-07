import { describe, it, expect } from 'vitest';
import {
  findDeadCode,
  isEntryPointFile,
  isEntryPointFunction,
  shouldIgnoreFile,
  formatPrComment,
  DeadCodeResult,
} from '../dead-code';
import { CodeGraphNode, CodeGraphRelationship } from '@supermodeltools/sdk';

describe('isEntryPointFile', () => {
  it('should identify index files as entry points', () => {
    expect(isEntryPointFile('src/index.ts')).toBe(true);
    expect(isEntryPointFile('lib/index.js')).toBe(true);
  });

  it('should identify main files as entry points', () => {
    expect(isEntryPointFile('src/main.ts')).toBe(true);
    expect(isEntryPointFile('main.js')).toBe(true);
  });

  it('should identify app files as entry points', () => {
    expect(isEntryPointFile('src/app.ts')).toBe(true);
  });

  it('should identify test files as entry points', () => {
    expect(isEntryPointFile('src/utils.test.ts')).toBe(true);
    expect(isEntryPointFile('src/utils.spec.js')).toBe(true);
    expect(isEntryPointFile('src/__tests__/utils.ts')).toBe(true);
  });

  it('should not identify regular files as entry points', () => {
    expect(isEntryPointFile('src/utils.ts')).toBe(false);
    expect(isEntryPointFile('src/helpers/format.js')).toBe(false);
  });
});

describe('isEntryPointFunction', () => {
  it('should identify common entry point function names', () => {
    expect(isEntryPointFunction('main')).toBe(true);
    expect(isEntryPointFunction('run')).toBe(true);
    expect(isEntryPointFunction('start')).toBe(true);
    expect(isEntryPointFunction('init')).toBe(true);
    expect(isEntryPointFunction('handler')).toBe(true);
  });

  it('should be case-insensitive', () => {
    expect(isEntryPointFunction('Main')).toBe(true);
    expect(isEntryPointFunction('MAIN')).toBe(true);
    expect(isEntryPointFunction('Handler')).toBe(true);
  });

  it('should identify HTTP method handlers', () => {
    expect(isEntryPointFunction('GET')).toBe(true);
    expect(isEntryPointFunction('POST')).toBe(true);
    expect(isEntryPointFunction('PUT')).toBe(true);
    expect(isEntryPointFunction('DELETE')).toBe(true);
  });

  it('should not identify regular function names', () => {
    expect(isEntryPointFunction('processData')).toBe(false);
    expect(isEntryPointFunction('calculateTotal')).toBe(false);
  });
});

describe('shouldIgnoreFile', () => {
  it('should ignore node_modules', () => {
    expect(shouldIgnoreFile('node_modules/lodash/index.js')).toBe(true);
  });

  it('should ignore dist folder', () => {
    expect(shouldIgnoreFile('dist/index.js')).toBe(true);
  });

  it('should ignore build folder', () => {
    expect(shouldIgnoreFile('build/main.js')).toBe(true);
  });

  it('should ignore test files', () => {
    expect(shouldIgnoreFile('src/utils.test.ts')).toBe(true);
    expect(shouldIgnoreFile('src/utils.spec.js')).toBe(true);
  });

  it('should not ignore regular source files', () => {
    expect(shouldIgnoreFile('src/utils.ts')).toBe(false);
    expect(shouldIgnoreFile('lib/helpers.js')).toBe(false);
  });

  it('should respect custom ignore patterns', () => {
    expect(shouldIgnoreFile('src/generated/api.ts', ['**/generated/**'])).toBe(true);
    expect(shouldIgnoreFile('src/utils.ts', ['**/generated/**'])).toBe(false);
  });
});

describe('findDeadCode', () => {
  it('should find functions with no callers', () => {
    const nodes: CodeGraphNode[] = [
      { id: 'fn1', labels: ['Function'], properties: { name: 'usedFunction', filePath: 'src/utils.ts' } },
      { id: 'fn2', labels: ['Function'], properties: { name: 'unusedFunction', filePath: 'src/helpers.ts' } },
    ];

    const relationships: CodeGraphRelationship[] = [
      { id: 'rel1', type: 'calls', startNode: 'fn3', endNode: 'fn1' },
    ];

    const deadCode = findDeadCode(nodes, relationships);

    expect(deadCode).toHaveLength(1);
    expect(deadCode[0].name).toBe('unusedFunction');
  });

  it('should not report functions that are called', () => {
    const nodes: CodeGraphNode[] = [
      { id: 'fn1', labels: ['Function'], properties: { name: 'calledFunction', filePath: 'src/utils.ts' } },
    ];

    const relationships: CodeGraphRelationship[] = [
      { id: 'rel1', type: 'calls', startNode: 'fn2', endNode: 'fn1' },
    ];

    const deadCode = findDeadCode(nodes, relationships);

    expect(deadCode).toHaveLength(0);
  });

  it('should skip exported functions', () => {
    const nodes: CodeGraphNode[] = [
      { id: 'fn1', labels: ['Function'], properties: { name: 'exportedFn', filePath: 'src/utils.ts', exported: true } },
      { id: 'fn2', labels: ['Function'], properties: { name: 'notExported', filePath: 'src/helpers.ts' } },
    ];

    const relationships: CodeGraphRelationship[] = [];

    const deadCode = findDeadCode(nodes, relationships);

    expect(deadCode).toHaveLength(1);
    expect(deadCode[0].name).toBe('notExported');
  });

  it('should skip entry point functions', () => {
    const nodes: CodeGraphNode[] = [
      { id: 'fn1', labels: ['Function'], properties: { name: 'main', filePath: 'src/cli.ts' } },
      { id: 'fn2', labels: ['Function'], properties: { name: 'unusedHelper', filePath: 'src/helpers.ts' } },
    ];

    const relationships: CodeGraphRelationship[] = [];

    const deadCode = findDeadCode(nodes, relationships);

    expect(deadCode).toHaveLength(1);
    expect(deadCode[0].name).toBe('unusedHelper');
  });

  it('should skip functions in entry point files', () => {
    const nodes: CodeGraphNode[] = [
      { id: 'fn1', labels: ['Function'], properties: { name: 'someFunc', filePath: 'src/index.ts' } },
      { id: 'fn2', labels: ['Function'], properties: { name: 'unusedHelper', filePath: 'src/helpers.ts' } },
    ];

    const relationships: CodeGraphRelationship[] = [];

    const deadCode = findDeadCode(nodes, relationships);

    expect(deadCode).toHaveLength(1);
    expect(deadCode[0].name).toBe('unusedHelper');
  });

  it('should skip functions in ignored paths', () => {
    const nodes: CodeGraphNode[] = [
      { id: 'fn1', labels: ['Function'], properties: { name: 'testHelper', filePath: 'src/__tests__/helpers.ts' } },
      { id: 'fn2', labels: ['Function'], properties: { name: 'unusedHelper', filePath: 'src/helpers.ts' } },
    ];

    const relationships: CodeGraphRelationship[] = [];

    const deadCode = findDeadCode(nodes, relationships);

    expect(deadCode).toHaveLength(1);
    expect(deadCode[0].name).toBe('unusedHelper');
  });

  it('should only consider Function nodes', () => {
    const nodes: CodeGraphNode[] = [
      { id: 'file1', labels: ['File'], properties: { name: 'utils.ts', filePath: 'src/utils.ts' } },
      { id: 'fn1', labels: ['Function'], properties: { name: 'unusedFn', filePath: 'src/helpers.ts' } },
    ];

    const relationships: CodeGraphRelationship[] = [];

    const deadCode = findDeadCode(nodes, relationships);

    expect(deadCode).toHaveLength(1);
    expect(deadCode[0].name).toBe('unusedFn');
  });

  it('should include line numbers when available', () => {
    const nodes: CodeGraphNode[] = [
      { id: 'fn1', labels: ['Function'], properties: { name: 'unusedFn', filePath: 'src/helpers.ts', startLine: 10, endLine: 20 } },
    ];

    const deadCode = findDeadCode(nodes, []);

    expect(deadCode[0].startLine).toBe(10);
    expect(deadCode[0].endLine).toBe(20);
  });
});

describe('formatPrComment', () => {
  it('should format empty results', () => {
    const comment = formatPrComment([]);
    expect(comment).toContain('No dead code found');
    expect(comment).toContain('codebase is clean');
  });

  it('should format single result', () => {
    const deadCode: DeadCodeResult[] = [
      { id: 'fn1', name: 'unusedFn', filePath: 'src/utils.ts', startLine: 10 },
    ];

    const comment = formatPrComment(deadCode);

    expect(comment).toContain('1** potentially unused function');
    expect(comment).toContain('`unusedFn`');
    expect(comment).toContain('src/utils.ts#L10');
  });

  it('should format multiple results', () => {
    const deadCode: DeadCodeResult[] = [
      { id: 'fn1', name: 'unusedFn1', filePath: 'src/utils.ts', startLine: 10 },
      { id: 'fn2', name: 'unusedFn2', filePath: 'src/helpers.ts', startLine: 20 },
    ];

    const comment = formatPrComment(deadCode);

    expect(comment).toContain('2** potentially unused functions');
    expect(comment).toContain('`unusedFn1`');
    expect(comment).toContain('`unusedFn2`');
  });

  it('should truncate at 50 results', () => {
    const deadCode: DeadCodeResult[] = Array.from({ length: 60 }, (_, i) => ({
      id: `fn${i}`,
      name: `unusedFn${i}`,
      filePath: `src/file${i}.ts`,
    }));

    const comment = formatPrComment(deadCode);

    expect(comment).toContain('60** potentially unused functions');
    expect(comment).toContain('and 10 more');
  });

  it('should include Supermodel attribution when dead code found', () => {
    const deadCode: DeadCodeResult[] = [
      { id: 'fn1', name: 'unusedFn', filePath: 'src/utils.ts' },
    ];
    const comment = formatPrComment(deadCode);
    expect(comment).toContain('Powered by [Supermodel]');
  });
});
