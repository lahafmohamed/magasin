import { AlertTriangle, PackageCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DocumentCode } from '@/components/ui/document-code';
import { Spinner } from '@/components/ui/loading';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatNumber } from '@/utils/format';

interface Ligne {
  id: number;
  produit_id: number;
  produit_nom: string;
  reference: string | null;
  quantite_demandee: number;
  quantite_approuvee: number | null;
  quantite_livree: number | null;
}

interface DemandeClotureDialogProps {
  demande: {
    id: number;
    numero: string;
    magasin_nom: string;
    numero_transfer: string | null;
    lignes: Ligne[];
  };
  onClose: () => void;
  onSubmit: () => void;
  loading: boolean;
}

/**
 * Clôture d'une demande livrée : le magasin confirme la réception physique.
 * La clôture ne déplace pas de stock (il a bougé à l'exécution) ; elle termine
 * la demande. L'enregistrement d'un manquant à la réception reste à faire (U-42).
 */
export function DemandeClotureDialog({ demande, onClose, onSubmit, loading }: DemandeClotureDialogProps) {
  const lines = demande.lignes.map((l) => {
    const approved = l.quantite_approuvee ?? l.quantite_demandee;
    const delivered = l.quantite_livree ?? 0;
    return { ...l, approved, delivered, complete: delivered >= approved };
  });
  const hasDiscrepancy = lines.some((l) => !l.complete);

  return (
    <Dialog open onOpenChange={(open) => !open && !loading && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Clôturer la demande <span className="whitespace-nowrap">{demande.numero}</span>
          </DialogTitle>
          <DialogDescription>Confirmez que les produits livrés sont bien arrivés à {demande.magasin_nom}</DialogDescription>
        </DialogHeader>

        {demande.numero_transfer && (
          <p className="rounded-md border bg-muted/40 p-3 text-sm">
            Transfert associé : <DocumentCode>{demande.numero_transfer}</DocumentCode>
          </p>
        )}

        <section aria-labelledby="cloture-lines-title" className="space-y-2">
          <h3 id="cloture-lines-title" className="text-sm font-medium">
            Produits livrés
          </h3>
          <ul className="divide-y rounded-md border">
            {lines.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium" title={l.produit_nom}>
                    {l.produit_nom}
                  </p>
                  {l.reference && (
                    <DocumentCode className="block text-xs text-muted-foreground">{l.reference}</DocumentCode>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm tabular-nums">
                    Livré <span className="font-medium">{formatNumber(l.delivered)}</span> sur{' '}
                    {formatNumber(l.approved)}
                  </p>
                  {/* Pastille pour l'écart seulement : une ligne complète est l'état normal. */}
                  {!l.complete && (
                    <Badge variant="warning" className="mt-1">
                      Partiel
                    </Badge>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>

        {hasDiscrepancy && (
          <div className="flex gap-2 rounded-md border border-warning-200 bg-warning-50 p-3 text-sm text-warning-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>
              Certaines quantités livrées sont inférieures aux quantités approuvées. Vous pouvez quand même clôturer la
              demande.
            </p>
          </div>
        )}

        {/* Une note, pas une réussite : neutre, comme l'encadré du transfert. */}
        <p className="rounded-md border bg-muted/40 p-3 text-sm">
          En clôturant, vous confirmez avoir reçu physiquement ces produits. La clôture est définitive.
        </p>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" size="touch" onClick={onClose} disabled={loading}>
            Annuler
          </Button>
          <Button size="touch" onClick={onSubmit} disabled={loading} className="gap-2">
            {loading ? <Spinner /> : <PackageCheck className="h-4 w-4" aria-hidden="true" />}
            Clôturer la demande
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
