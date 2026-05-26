/**
 * Escape a single CSV cell: wrap in quotes and double any embedded quotes so that
 * values containing commas, quotes, or newlines do not corrupt the file.
 */
function escapeCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

/**
 * Build CSV text from a header row and data rows (every cell properly escaped).
 */
export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(escapeCell).join(',')];
  for (const row of rows) {
    lines.push(row.map(escapeCell).join(','));
  }
  return lines.join('\r\n');
}

/**
 * Trigger a browser download of CSV content. Prepends a UTF-8 BOM so Excel
 * renders accented characters correctly.
 */
export function downloadCsv(filename: string, headers: string[], rows: unknown[][]): void {
  const csv = '﻿' + toCsv(headers, rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
