import { describe, it, expect } from 'vitest';
import { filterByChangedFiles, formatPrComment } from '../dead-code';
import { escapeTableCell } from '../markdown';
import type { DeadCodeCandidate, DeadCodeMetadata } from '../dead-code';

function makeCandidate(overrides: Partial<DeadCodeCandidate> = {}): DeadCodeCandidate {
  return {
    file: 'src/utils.ts',
    name: 'unusedFn',
    line: 10,
    type: 'function',
    confidence: 'high',
    reason: 'No callers found in codebase',
    ...overrides,
  };
}

function makeMetadata(overrides: Partial<DeadCodeMetadata> = {}): DeadCodeMetadata {
  return {
    totalDeclarations: 100,
    deadCodeCandidates: 5,
    aliveCode: 95,
    analysisMethod: 'parse_graph + call_graph',
    ...overrides,
  };
}

describe('escapeTableCell', () => {
  it('should escape pipe characters', () => {
    expect(escapeTableCell('a|b|c')).toBe('a\\|b\\|c');
  });

  it('should replace newlines with spaces', () => {
    expect(escapeTableCell('line1\nline2')).toBe('line1 line2');
  });

  it('should handle both pipes and newlines', () => {
    expect(escapeTableCell('a|b\nc|d')).toBe('a\\|b c\\|d');
  });

  it('should return unchanged string when no special characters', () => {
    expect(escapeTableCell('normalText')).toBe('normalText');
  });
});

describe('filterByChangedFiles', () => {
  it('should only keep candidates in changed files', () => {
    const candidates = [
      makeCandidate({ file: 'src/changed.ts', name: 'fn1' }),
      makeCandidate({ file: 'src/untouched.ts', name: 'fn2' }),
      makeCandidate({ file: 'src/also-changed.ts', name: 'fn3' }),
    ];
    const changedFiles = new Set(['src/changed.ts', 'src/also-changed.ts']);
    const result = filterByChangedFiles(candidates, changedFiles);

    expect(result).toHaveLength(2);
    expect(result.map(c => c.name)).toEqual(['fn1', 'fn3']);
  });

  it('should return empty array when no candidates match changed files', () => {
    const candidates = [
      makeCandidate({ file: 'src/unrelated.ts' }),
    ];
    const changedFiles = new Set(['src/changed.ts']);
    const result = filterByChangedFiles(candidates, changedFiles);

    expect(result).toHaveLength(0);
  });

  it('should return all candidates when all files are changed', () => {
    const candidates = [
      makeCandidate({ file: 'src/a.ts' }),
      makeCandidate({ file: 'src/b.ts' }),
    ];
    const changedFiles = new Set(['src/a.ts', 'src/b.ts', 'src/c.ts']);
    const result = filterByChangedFiles(candidates, changedFiles);

    expect(result).toHaveLength(2);
  });

  it('should handle empty changed files set', () => {
    const candidates = [makeCandidate()];
    const result = filterByChangedFiles(candidates, new Set());

    expect(result).toHaveLength(0);
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
      makeCandidate({ name: 'fn2', file: 'src/b.ts', line: 2, type: 'class' }),
    ];
    const comment = formatPrComment(candidates);

    expect(comment).toContain('2** potentially unused code elements');
    expect(comment).toContain('`fn1`');
    expect(comment).toContain('`fn2`');
    expect(comment).toContain('class');
  });

  it('should render all supported code types', () => {
    const types: DeadCodeCandidate['type'][] = ['function', 'class', 'method', 'interface', 'type', 'variable', 'constant'];
    const candidates = types.map((type, i) =>
      makeCandidate({ name: `item${i}`, file: `src/${type}.ts`, line: i + 1, type })
    );
    const comment = formatPrComment(candidates);

    for (const type of types) {
      expect(comment).toContain(`| ${type} |`);
    }
  });

  it('should escape pipe characters in candidate names', () => {
    const candidates = [makeCandidate({ name: 'fn|with|pipes' })];
    const comment = formatPrComment(candidates);

    expect(comment).toContain('fn\\|with\\|pipes');
    expect(comment).not.toContain('`fn|with|pipes`');
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
      makeCandidate({ confidence: 'high' }),
      makeCandidate({ name: 'fn2', file: 'src/b.ts', confidence: 'medium' }),
      makeCandidate({ name: 'fn3', file: 'src/c.ts', confidence: 'low' }),
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

  it('should render table header with all columns', () => {
    const candidates = [makeCandidate()];
    const comment = formatPrComment(candidates);

    expect(comment).toContain('| Name | Type | File | Line | Confidence |');
  });
});
