/**
 * Markdown formatting utilities for PR comments.
 */
/**
 * Wraps text in a collapsible details/summary block.
 */
export declare function collapsible(summary: string, body: string): string;
/**
 * Creates a markdown badge image link.
 */
export declare function badge(label: string, value: string, color: string): string;
/**
 * Renders a horizontal bar chart using unicode block characters.
 */
export declare function barChart(value: number, max: number, width?: number): string;
/**
 * Escapes pipe characters for safe rendering inside markdown tables.
 */
export declare function escapeTableCell(text: string): string;
/**
 * Converts a flat list into a markdown numbered list.
 */
export declare function numberedList(items: string[]): string;
