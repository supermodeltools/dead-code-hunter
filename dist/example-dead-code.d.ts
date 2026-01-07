/**
 * This file contains intentional dead code for testing the dead-code-hunter action.
 * These functions should be detected as unused.
 */
declare function unusedHelperFunction(x: number): number;
declare function formatUnusedData(data: string[]): string;
declare function fetchUnusedData(): Promise<void>;
declare const unusedProcessor: {
    process: (input: string) => string;
};
