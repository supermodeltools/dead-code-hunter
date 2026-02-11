import { minimatch } from 'minimatch';
import type { DeadCodeCandidate, DeadCodeAnalysisResponse, DeadCodeAnalysisMetadata } from '@supermodeltools/sdk';
import { escapeTableCell } from './markdown';

export type { DeadCodeCandidate, DeadCodeAnalysisResponse, DeadCodeAnalysisMetadata };

/**
 * Filters dead code candidates by user-provided ignore patterns.
 * The API handles all analysis server-side; this is purely for
 * client-side post-filtering on file paths.
 */
export function filterByIgnorePatterns(
  candidates: DeadCodeCandidate[],
  ignorePatterns: string[]
): DeadCodeCandidate[] {
  if (ignorePatterns.length === 0) return candidates;
  return candidates.filter(c => !ignorePatterns.some(p => minimatch(c.file, p)));
}

/**
 * Scopes dead code candidates to only files present in the changed files set.
 * Used to limit PR comments to findings relevant to the current diff.
 */
export function filterByChangedFiles(
  candidates: DeadCodeCandidate[],
  changedFiles: Set<string>
): DeadCodeCandidate[] {
  return candidates.filter(c => changedFiles.has(c.file));
}

/**
 * Formats dead code analysis results as a GitHub PR comment.
 */
export function formatPrComment(
  candidates: DeadCodeCandidate[],
  metadata?: DeadCodeAnalysisMetadata
): string {
  if (candidates.length === 0) {
    return `## Dead Code Hunter

No dead code found! Your codebase is clean.`;
  }

  const rows = candidates
    .slice(0, 50)
    .map(dc => {
      const lineInfo = dc.line ? `L${dc.line}` : '';
      const fileLink = dc.line ? `${dc.file}#L${dc.line}` : dc.file;
      const badge = dc.confidence === 'high' ? ':red_circle:' :
                    dc.confidence === 'medium' ? ':orange_circle:' : ':yellow_circle:';
      return `| \`${escapeTableCell(dc.name)}\` | ${dc.type} | ${fileLink} | ${lineInfo} | ${badge} ${dc.confidence} |`;
    })
    .join('\n');

  let comment = `## Dead Code Hunter

Found **${candidates.length}** potentially unused code element${candidates.length === 1 ? '' : 's'}:

| Name | Type | File | Line | Confidence |
|------|------|------|------|------------|
${rows}`;

  if (candidates.length > 50) {
    comment += `\n\n_...and ${candidates.length - 50} more. See action output for full list._`;
  }

  if (metadata) {
    comment += `\n\n<details><summary>Analysis summary</summary>\n\n`;
    comment += `- **Total declarations analyzed**: ${metadata.totalDeclarations}\n`;
    comment += `- **Dead code candidates**: ${metadata.deadCodeCandidates}\n`;
    comment += `- **Alive code**: ${metadata.aliveCode}\n`;
    comment += `- **Analysis method**: ${metadata.analysisMethod}\n`;
    if (metadata.transitiveDeadCount != null) {
      comment += `- **Transitive dead**: ${metadata.transitiveDeadCount}\n`;
    }
    if (metadata.symbolLevelDeadCount != null) {
      comment += `- **Symbol-level dead**: ${metadata.symbolLevelDeadCount}\n`;
    }
    comment += `\n</details>`;
  }

  comment += `\n\n---\n_Powered by [Supermodel](https://supermodeltools.com) dead code analysis_`;

  return comment;
}
