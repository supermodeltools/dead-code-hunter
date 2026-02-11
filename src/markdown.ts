/**
 * Escapes pipe characters for safe rendering inside markdown tables.
 */
export function escapeTableCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}
