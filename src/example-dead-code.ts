/**
 * This file contains intentional dead code for testing the dead-code-hunter action.
 * These functions should be detected as unused.
 */

// This function is never called anywhere
function unusedHelperFunction(x: number): number {
  return x * 2;
}

// Another unused function
function formatUnusedData(data: string[]): string {
  return data.join(', ');
}

// Unused async function
async function fetchUnusedData(): Promise<void> {
  console.log('This is never called');
}

// Unused class method style function
const unusedProcessor = {
  process: (input: string) => input.toUpperCase(),
};
