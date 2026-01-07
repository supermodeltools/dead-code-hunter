import { CodeGraphNode, CodeGraphRelationship } from '@supermodeltools/sdk';
export interface DeadCodeResult {
    id: string;
    name: string;
    filePath: string;
    startLine?: number;
    endLine?: number;
}
export declare const DEFAULT_EXCLUDE_PATTERNS: string[];
export declare const ENTRY_POINT_PATTERNS: string[];
export declare const ENTRY_POINT_FUNCTION_NAMES: string[];
export declare function isEntryPointFile(filePath: string): boolean;
export declare function isEntryPointFunction(name: string): boolean;
export declare function shouldIgnoreFile(filePath: string, ignorePatterns?: string[]): boolean;
export declare function findDeadCode(nodes: CodeGraphNode[], relationships: CodeGraphRelationship[], ignorePatterns?: string[]): DeadCodeResult[];
export declare function formatPrComment(deadCode: DeadCodeResult[]): string;
