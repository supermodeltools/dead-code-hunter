import type { DeadCodeCandidate, DeadCodeAnalysisResponse, DeadCodeAnalysisMetadata } from '@supermodeltools/sdk';
export type { DeadCodeCandidate, DeadCodeAnalysisResponse, DeadCodeAnalysisMetadata };
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
