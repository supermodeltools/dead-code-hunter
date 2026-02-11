import type { DeadCodeCandidate, DeadCodeAnalysisResponse, DeadCodeAnalysisMetadata } from '@supermodeltools/sdk';
export type { DeadCodeCandidate, DeadCodeAnalysisResponse, DeadCodeAnalysisMetadata };
/**
 * Truncates a string to the given max length, appending an ellipsis if needed.
 */
export declare function truncateString(str: string, maxLen: number): string;
/**
 * Groups candidates by their containing directory.
 */
export declare function groupByDirectory(candidates: DeadCodeCandidate[]): Map<string, DeadCodeCandidate[]>;
/**
 * Returns a severity label based on how many dead code items are in a single file.
 */
export declare function fileSeverity(count: number): 'clean' | 'warning' | 'critical';
/**
 * Filters dead code candidates by user-provided ignore patterns.
 * The API handles all analysis server-side; this is purely for
 * client-side post-filtering on file paths.
 */
export declare function filterByIgnorePatterns(candidates: DeadCodeCandidate[], ignorePatterns: string[]): DeadCodeCandidate[];
/**
 * Formats dead code analysis results as a GitHub PR comment.
 */
export declare function formatPrComment(candidates: DeadCodeCandidate[], metadata?: DeadCodeAnalysisMetadata): string;
