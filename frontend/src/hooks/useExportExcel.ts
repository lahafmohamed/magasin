import { useCallback } from 'react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';

interface ExportColumn {
  key: string;
  label: string;
}

/**
 * Neutralize CSV/Excel formula injection: a cell whose text starts with = + - @
 * (or a leading tab/CR that shifts the first visible char) is executed as a
 * formula by Excel/Sheets. Prefix a single quote so it's rendered as literal
 * text. Applied to every string cell — user-entered names/notes reach exports.
 */
function sanitizeCell<T>(value: T): T | string {
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(value)) {
    return `'${value}`;
  }
  return value;
}

export function useExportExcel() {
  const exportToExcel = useCallback(<T extends Record<string, any>>(
    data: T[],
    columns: ExportColumn[],
    filename: string
  ) => {
    if (!data || data.length === 0) {
      toast.error('Aucune donnée à exporter');
      return;
    }

    try {
      const rows = data.map(item => {
        const row: Record<string, any> = {};
        columns.forEach(col => {
          let value = item[col.key];
          if (typeof value === 'number') {
            value = Math.round(value * 100) / 100;
          }
          if (value instanceof Date) {
            value = value.toLocaleDateString('fr-FR');
          }
          if (value === null || value === undefined) {
            value = '';
          }
          row[col.label] = sanitizeCell(value);
        });
        return row;
      });

      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Export');

      // Auto-fit column widths
      const colWidths = columns.map(col => ({
        wch: Math.max(col.label.length * 2, 12),
      }));
      worksheet['!cols'] = colWidths;

      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Export Excel réussi');
    } catch (error) {
      console.error('Export error:', error);
      toast.error("Erreur lors de l'export Excel");
    }
  }, []);

  return { exportToExcel };
}
