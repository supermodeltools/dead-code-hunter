import { minimatch } from 'minimatch';
import { CodeGraphNode, CodeGraphRelationship } from '@supermodeltools/sdk';

export interface DeadCodeResult {
  id: string;
  name: string;
  filePath: string;
  startLine?: number;
  endLine?: number;
}

export const DEFAULT_EXCLUDE_PATTERNS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.git/**',
  '**/vendor/**',
  '**/target/**',
  '**/*.test.ts',
  '**/*.test.tsx',
  '**/*.test.js',
  '**/*.test.jsx',
  '**/*.spec.ts',
  '**/*.spec.tsx',
  '**/*.spec.js',
  '**/*.spec.jsx',
  '**/__tests__/**',
  '**/__mocks__/**',
];

export const ENTRY_POINT_PATTERNS = [
  '**/index.ts',
  '**/index.js',
  '**/main.ts',
  '**/main.js',
  '**/app.ts',
  '**/app.js',
  '**/*.test.*',
  '**/*.spec.*',
  '**/__tests__/**',
];

export const ENTRY_POINT_FUNCTION_NAMES = [
  'main',
  'run',
  'start',
  'init',
  'setup',
  'bootstrap',
  'default',
  'handler',
  'GET', 'POST', 'PUT', 'DELETE', 'PATCH',
];

export function isEntryPointFile(filePath: string): boolean {
  return ENTRY_POINT_PATTERNS.some(pattern => minimatch(filePath, pattern));
}

export function isEntryPointFunction(name: string): boolean {
  const lowerName = name.toLowerCase();
  return ENTRY_POINT_FUNCTION_NAMES.some(ep => lowerName === ep.toLowerCase());
}

export function shouldIgnoreFile(filePath: string, ignorePatterns: string[] = []): boolean {
  const allPatterns = [...DEFAULT_EXCLUDE_PATTERNS, ...ignorePatterns];
  return allPatterns.some(pattern => minimatch(filePath, pattern));
}

export function findDeadCode(
  nodes: CodeGraphNode[],
  relationships: CodeGraphRelationship[],
  ignorePatterns: string[] = []
): DeadCodeResult[] {
  // Get all function nodes
  const functionNodes = nodes.filter(node =>
    node.labels?.includes('Function')
  );

  // Get all "calls" relationships
  const callRelationships = relationships.filter(rel => rel.type === 'calls');

  // Build a set of all function IDs that are called
  const calledFunctionIds = new Set(callRelationships.map(rel => rel.endNode));

  const deadCode: DeadCodeResult[] = [];

  for (const node of functionNodes) {
    const props = node.properties || {};
    const filePath = props.filePath || props.file || '';
    const name = props.name || 'anonymous';

    // Skip if this function is called somewhere
    if (calledFunctionIds.has(node.id)) {
      continue;
    }

    // Skip if file matches ignore patterns
    if (shouldIgnoreFile(filePath, ignorePatterns)) {
      continue;
    }

    // Skip if this is an entry point file
    if (isEntryPointFile(filePath)) {
      continue;
    }

    // Skip if this is an entry point function name
    if (isEntryPointFunction(name)) {
      continue;
    }

    // Skip exported functions (they might be called externally)
    if (props.exported === true || props.isExported === true) {
      continue;
    }

    deadCode.push({
      id: node.id,
      name,
      filePath,
      startLine: props.startLine,
      endLine: props.endLine,
    });
  }

  return deadCode;
}

export function formatPrComment(deadCode: DeadCodeResult[]): string {
  if (deadCode.length === 0) {
    return `## Dead Code Hunter

No dead code found! Your codebase is clean.`;
  }

  const rows = deadCode
    .slice(0, 50)
    .map(dc => {
      const lineInfo = dc.startLine ? `L${dc.startLine}` : '';
      const fileLink = dc.startLine
        ? `${dc.filePath}#L${dc.startLine}`
        : dc.filePath;
      return `| \`${dc.name}\` | ${fileLink} | ${lineInfo} |`;
    })
    .join('\n');

  let comment = `## Dead Code Hunter

Found **${deadCode.length}** potentially unused function${deadCode.length === 1 ? '' : 's'}:

| Function | File | Line |
|----------|------|------|
${rows}`;

  if (deadCode.length > 50) {
    comment += `\n\n_...and ${deadCode.length - 50} more. See action output for full list._`;
  }

  comment += `\n\n---\n_Powered by [Supermodel](https://supermodeltools.com) graph analysis_`;

  return comment;
}
