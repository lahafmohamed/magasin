import { useState, type ReactNode } from 'react';
import { Printer } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type PrintFormat = 'A4' | 'A5';

const STORAGE_KEY = 'print_format';

/**
 * Format d'impression retenu entre deux aperçus (partagé par tous les documents).
 */
export function usePrintFormat(): [PrintFormat, (f: PrintFormat) => void] {
  const [format, setFormat] = useState<PrintFormat>(
    () => (localStorage.getItem(STORAGE_KEY) as PrintFormat) || 'A4'
  );
  const update = (f: PrintFormat) => {
    setFormat(f);
    localStorage.setItem(STORAGE_KEY, f);
  };
  return [format, update];
}

interface PrintPreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  format: PrintFormat;
  onFormatChange: (format: PrintFormat) => void;
  /** Le document rendu (`DocumentPrint`), affiché sur la « feuille » blanche. */
  children: ReactNode;
}

/**
 * Aperçu avant impression des documents de vente.
 *
 * Remplace les quatre surcouches `fixed inset-0` recopiées dans AvoirDetail,
 * BonLivraisonDetail, DevisDetail et FactureDetail : celles-ci n'avaient ni
 * piège de focus, ni fermeture par Échap, ni `aria-modal`, et leur barre
 * d'outils `bg-white` (pourtant `print:hidden`, donc visible à l'écran
 * uniquement) devenait blanc sur blanc en thème sombre.
 *
 * La feuille reste blanche à dessein — c'est un WYSIWYG de la page imprimée —
 * mais l'habillage écran suit le thème.
 */
export function PrintPreview({
  open,
  onOpenChange,
  format,
  onFormatChange,
  children,
}: PrintPreviewProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* `print-layout` sort la feuille du flux en `position:absolute` : il faut
          donc neutraliser à l'impression le `fixed` ET le `translate` du
          dialogue, qui créeraient sinon un bloc conteneur pour cet absolu. */}
      <DialogContent className="max-w-4xl grid-rows-[auto_1fr] overflow-hidden p-0 gap-0 print:static print:max-w-none print:transform-none print:translate-x-0 print:translate-y-0 print:overflow-visible print:border-0 print:p-0 print:shadow-none">
        <DialogHeader className="flex-row items-center justify-between gap-4 space-y-0 border-b p-4 pr-12 print:hidden">
          <DialogTitle className="text-lg font-semibold">Aperçu d'impression</DialogTitle>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Format&nbsp;:</span>
              <Select value={format} onValueChange={(v) => onFormatChange(v as PrintFormat)}>
                <SelectTrigger className="h-8 w-auto px-2 text-xs" aria-label="Format d'impression">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="A4">A4</SelectItem>
                  <SelectItem value="A5">Ticket A5</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => window.print()} className="gap-2">
              <Printer className="h-4 w-4" aria-hidden="true" />
              Imprimer
            </Button>
          </div>
        </DialogHeader>
        {/* min-h-0 : sans lui la piste 1fr se dimensionne sur son contenu et
            c'est la barre d'outils qui défilerait hors de vue. */}
        <div className="min-h-0 overflow-auto bg-white print:overflow-visible">
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}
