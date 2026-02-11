import { describe, it, expect } from 'vitest';
import { filterByIgnorePatterns, formatPrComment } from '../dead-code';
import type { DeadCodeCandidate, DeadCodeAnalysisMetadata } from '@supermodeltools/sdk';

function makeCandidate(overrides: Partial<DeadCodeCandidate> = {}): DeadCodeCandidate {
  return {
    file: 'src/utils.ts',
    name: 'unusedFn',
    line: 10,
    type: 'function' as const,
    confidence: 'high' as const,
    reason: 'No callers found in codebase',
    ...overrides,
  };
}

function makeMetadata(overrides: Partial<DeadCodeAnalysisMetadata> = {}): DeadCodeAnalysisMetadata {
  return {
    totalDeclarations: 100,
    deadCodeCandidates: 5,
    aliveCode: 95,
    analysisMethod: 'parse_graph + call_graph',
    ...overrides,
  };
}

describe('filterByIgnorePatterns', () => {
  it('should return all candidates when no patterns provided', () => {
    const candidates = [makeCandidate(), makeCandidate({ file: 'src/helpers.ts' })];
    const result = filterByIgnorePatterns(candidates, []);
    expect(result).toHaveLength(2);
  });

  it('should filter candidates matching ignore patterns', () => {
    const candidates = [
      makeCandidate({ file: 'src/generated/api.ts' }),
      makeCandidate({ file: 'src/utils.ts' }),
    ];
    const result = filterByIgnorePatterns(candidates, ['**/generated/**']);
    expect(result).toHaveLength(1);
    expect(result[0].file).toBe('src/utils.ts');
  });

  it('should support multiple ignore patterns', () => {
    const candidates = [
      makeCandidate({ file: 'src/generated/api.ts' }),
      makeCandidate({ file: 'src/migrations/001.ts' }),
      makeCandidate({ file: 'src/utils.ts' }),
    ];
    const result = filterByIgnorePatterns(candidates, ['**/generated/**', '**/migrations/**']);
    expect(result).toHaveLength(1);
    expect(result[0].file).toBe('src/utils.ts');
  });

  it('should not filter when patterns do not match', () => {
    const candidates = [makeCandidate({ file: 'src/utils.ts' })];
    const result = filterByIgnorePatterns(candidates, ['**/generated/**']);
    expect(result).toHaveLength(1);
  });
});

describe('formatPrComment', () => {
  it('should format empty results', () => {
    const comment = formatPrComment([]);
    expect(comment).toContain('No dead code found');
    expect(comment).toContain('codebase is clean');
  });

  it('should format single result with type and confidence', () => {
    const candidates = [makeCandidate()];
    const comment = formatPrComment(candidates);

    expect(comment).toContain('1** potentially unused code element:');
    expect(comment).toContain('`unusedFn`');
    expect(comment).toContain('function');
    expect(comment).toContain('src/utils.ts#L10');
    expect(comment).toContain('high');
  });

  it('should format multiple results', () => {
    const candidates = [
      makeCandidate({ name: 'fn1', file: 'src/a.ts', line: 1 }),
      makeCandidate({ name: 'fn2', file: 'src/b.ts', line: 2, type: 'class' as const }),
    ];
    const comment = formatPrComment(candidates);

    expect(comment).toContain('2** potentially unused code elements');
    expect(comment).toContain('`fn1`');
    expect(comment).toContain('`fn2`');
    expect(comment).toContain('class');
  });

  it('should truncate at 50 results', () => {
    const candidates = Array.from({ length: 60 }, (_, i) =>
      makeCandidate({ name: `fn${i}`, file: `src/file${i}.ts`, line: i + 1 })
    );
    const comment = formatPrComment(candidates);

    expect(comment).toContain('60** potentially unused code elements');
    expect(comment).toContain('and 10 more');
  });

  it('should include metadata details section when provided', () => {
    const candidates = [makeCandidate()];
    const metadata = makeMetadata({ transitiveDeadCount: 3, symbolLevelDeadCount: 7 });
    const comment = formatPrComment(candidates, metadata);

    expect(comment).toContain('Analysis summary');
    expect(comment).toContain('Total declarations analyzed');
    expect(comment).toContain('100');
    expect(comment).toContain('parse_graph + call_graph');
    expect(comment).toContain('Transitive dead');
    expect(comment).toContain('3');
    expect(comment).toContain('Symbol-level dead');
    expect(comment).toContain('7');
  });

  it('should omit optional metadata fields when not present', () => {
    const candidates = [makeCandidate()];
    const metadata = makeMetadata();
    const comment = formatPrComment(candidates, metadata);

    expect(comment).toContain('Analysis summary');
    expect(comment).not.toContain('Transitive dead');
    expect(comment).not.toContain('Symbol-level dead');
  });

  it('should show confidence badges', () => {
    const candidates = [
      makeCandidate({ confidence: 'high' as const }),
      makeCandidate({ name: 'fn2', file: 'src/b.ts', confidence: 'medium' as const }),
      makeCandidate({ name: 'fn3', file: 'src/c.ts', confidence: 'low' as const }),
    ];
    const comment = formatPrComment(candidates);

    expect(comment).toContain(':red_circle: high');
    expect(comment).toContain(':orange_circle: medium');
    expect(comment).toContain(':yellow_circle: low');
  });

  it('should include Supermodel attribution', () => {
    const candidates = [makeCandidate()];
    const comment = formatPrComment(candidates);
    expect(comment).toContain('Powered by [Supermodel]');
  });
});
