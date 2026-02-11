/**
 * Markdown formatting utilities for PR comments.
 */

/**
 * Wraps text in a collapsible details/summary block.
 */
export function collapsible(summary: string, body: string): string {
  return `<details><summary>${summary}</summary>\n\n${body}\n\n</details>`;
}

/**
 * Creates a markdown badge image link.
 */
export function badge(label: string, value: string, color: string): string {
  const encodedLabel = encodeURIComponent(label);
  const encodedValue = encodeURIComponent(value);
  return `![${label}](https://img.shields.io/badge/${encodedLabel}-${encodedValue}-${color})`;
}

/**
 * Renders a horizontal bar chart using unicode block characters.
 */
export function barChart(value: number, max: number, width = 20): string {
  const filled = Math.round((value / max) * width);
  const empty = width - filled;
  return '\u2588'.repeat(filled) + '\u2591'.repeat(empty);
}

/**
 * Escapes pipe characters for safe rendering inside markdown tables.
 */
export function escapeTableCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

/**
 * Converts a flat list into a markdown numbered list.
 */
export function numberedList(items: string[]): string {
  return items.map((item, i) => `${i + 1}. ${item}`).join('\n');
}
