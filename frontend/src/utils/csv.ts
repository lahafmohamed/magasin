/**
 * Escape a single CSV cell: neutralize formula injection, then wrap in quotes and
 * double any embedded quotes so values with commas, quotes, or newlines don't
 * corrupt the file.
 *
 * Formula injection: Excel/Sheets execute a cell whose text starts with = + - @
 * (or a leading tab/CR) even when it is CSV-quoted. Prefix a single quote so the
 * value is rendered as literal text. User-entered names/notes reach these exports.
 */
function escapeCell(value: unknown): string {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) {
    s = `'${s}`;
  }
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
