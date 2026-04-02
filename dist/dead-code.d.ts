export type Confidence = 'high' | 'medium' | 'low';
export type CodeType = 'function' | 'class' | 'method' | 'interface' | 'type' | 'variable' | 'constant';
export interface DeadCodeCandidate {
    file: string;
    name: string;
    line: number;
    type: CodeType;
    confidence: Confidence;
    reason: string;
}
export interface DeadCodeMetadata {
    totalDeclarations: number;
    deadCodeCandidates: number;
    aliveCode: number;
    analysisMethod: string;
    analysisStartTime?: string;
    analysisEndTime?: string;
    transitiveDeadCount?: number;
    symbolLevelDeadCount?: number;
}
export interface DeadCodeResult {
    metadata: DeadCodeMetadata;
    deadCodeCandidates: DeadCodeCandidate[];
    aliveCode: unknown[];
    entryPoints: unknown[];
}
/**
 * Scopes dead code candidates to only files present in the changed files set.
 * Used to limit PR comments to findings relevant to the current diff.
 */
export declare function filterByChangedFiles(candidates: DeadCodeCandidate[], changedFiles: Set<string>): DeadCodeCandidate[];
/**
 * Formats dead code analysis results as a GitHub PR comment.
 */
export declare function formatPrComment(candidates: DeadCodeCandidate[], metadata?: DeadCodeMetadata): string;
