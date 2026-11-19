import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { demandeService } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DocumentCode } from '@/components/ui/document-code';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/ui/loading';
import { RequiredMark } from '@/components/ui/required-mark';
import { FieldError, fieldErrorProps } from '@/components/ui/field-error';
import { ChoiceGroup } from '@/components/ui/choice-chips';
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
  notes: string | null;
}

interface DepotStockRow {
  produit_id: number;
  quantite_disponible: number | string;
}

export interface DecisionPayload {
  decision: 'approuvee' | 'refusee';
  lignes_decision?: { ligne_id: number; quantite_approuvee: number }[];
  raison_refus?: string;
}

interface DemandeDecisionDialogProps {
  demande: {
    id: number;
    numero: string;
    depot_id: number;
    depot_nom: string;
    magasin_nom: string;
    lignes: Ligne[];
  };
  onClose: () => void;
  onSubmit: (payload: DecisionPayload) => void;
  loading: boolean;
}

type Decision = 'approuvee' | 'refusee';

const plural = (n: number, one: string, many: string) => `${formatNumber(n)} ${n > 1 ? many : one}`;

/** Quantité saisie → entier, ou `null` si la saisie n'en est pas un. */
function parseQty(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isInteger(n) ? n : null;
}

/**
 * Stock du dépôt, produit par produit. L'API de la demande ne le renvoie pas
 * encore (« Needs from BE ») : une recherche par référence par produit, au
 * plus une requête par ligne.
 */
async function loadDepotStock(depotId: number, lignes: Ligne[]): Promise<Record<number, number | null>> {
  const unique = new Map<number, Ligne>();
  for (const l of lignes) unique.set(l.produit_id, l);
  const entries = await Promise.all(
    [...unique.values()].map(async (l) => {
      const rows = (await demandeService.getDepotStock(depotId, l.reference || l.produit_nom)) as
        | DepotStockRow[]
        | { data?: DepotStockRow[] };
      const list = Array.isArray(rows) ? rows : rows?.data ?? [];
      const row = list.find((r) => Number(r.produit_id) === l.produit_id);
      return [l.produit_id, row ? Number(row.quantite_disponible) || 0 : null] as const;
    })
  );
  return Object.fromEntries(entries);
}

/**
 * Décision du dépôt sur une demande (U-28) : le stock du dépôt est affiché par
 * ligne, les quantités approuvées sont pré-remplies au plus petit de « demandé »
 * et « disponible », la décision est un vrai groupe radio (A11Y-S03) et le
 * bouton final nomme le résultat (« Approuver 8 unités » / « Refuser la demande »).
 */
export function DemandeDecisionDialog({ demande, onClose, onSubmit, loading }: DemandeDecisionDialogProps) {
  const [decision, setDecision] = useState<Decision>('approuvee');
  const [approved, setApproved] = useState<Record<number, string>>(() =>
    Object.fromEntries(demande.lignes.map((l) => [l.id, String(l.quantite_demandee)]))
  );
  const [touched, setTouched] = useState(false);
  const [stock, setStock] = useState<Record<number, number | null> | null>(null);
  const [stockLoading, setStockLoading] = useState(true);
  const [stockError, setStockError] = useState<unknown>(null);
  const [raisonRefus, setRaisonRefus] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const fetchStock = useCallback(async () => {
    setStockLoading(true);
    setStockError(null);
    try {
      setStock(await loadDepotStock(demande.depot_id, demande.lignes));
    } catch (err) {
      setStockError(err);
    } finally {
      setStockLoading(false);
    }
  }, [demande.depot_id, demande.lignes]);

  useEffect(() => {
    void fetchStock();
  }, [fetchStock]);

  // Pré-remplissage : min(demandé, disponible au dépôt), tant que rien n'a été saisi.
  useEffect(() => {
    if (!stock || touched) return;
    setApproved(
      Object.fromEntries(
        demande.lignes.map((l) => {
          const dispo = stock[l.produit_id];
          return [l.id, String(dispo == null ? l.quantite_demandee : Math.min(l.quantite_demandee, Math.max(0, dispo)))];
        })
      )
    );
  }, [stock, touched, demande.lignes]);

  const lineErrors = useMemo(() => {
    const errors: Record<number, string> = {};
    if (decision === 'refusee') return errors;
    for (const l of demande.lignes) {
      const n = parseQty(approved[l.id]);
      if (n === null || n < 0) errors[l.id] = 'Saisissez une quantité entière, 0 pour refuser la ligne.';
      else if (n > l.quantite_demandee) {
        errors[l.id] = `Au plus ${plural(l.quantite_demandee, 'unité', 'unités')} (quantité demandée).`;
      }
    }
    return errors;
  }, [approved, decision, demande.lignes]);

  const requestedUnits = demande.lignes.reduce((s, l) => s + l.quantite_demandee, 0);
  const approvedUnits =
    decision === 'refusee' ? 0 : demande.lignes.reduce((s, l) => s + Math.max(0, parseQty(approved[l.id]) ?? 0), 0);
  const isRefusal = decision === 'refusee' || approvedUnits === 0;
  const isFull = !isRefusal && demande.lignes.every((l) => parseQty(approved[l.id]) === l.quantite_demandee);
  const overStock = demande.lignes.filter((l) => {
    const dispo = stock?.[l.produit_id];
    const n = parseQty(approved[l.id]) ?? 0;
    return decision === 'approuvee' && dispo != null && n > dispo;
  });

  const motifError = submitted && isRefusal && !raisonRefus.trim() ? 'Saisissez le motif du refus.' : undefined;

  const submitLabel = isRefusal
    ? 'Refuser la demande'
    : isFull
      ? `Approuver ${plural(approvedUnits, 'unité', 'unités')}`
      : `Approuver ${formatNumber(approvedUnits)} sur ${plural(requestedUnits, 'unité', 'unités')}`;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (Object.keys(lineErrors).length > 0) {
      const first = demande.lignes.find((l) => lineErrors[l.id]);
      if (first) document.getElementById(`decision-qte-${first.id}`)?.focus();
      return;
    }
    if (isRefusal && !raisonRefus.trim()) {
      document.getElementById('decision-motif')?.focus();
      return;
    }
    if (decision === 'refusee') {
      onSubmit({ decision: 'refusee', raison_refus: raisonRefus.trim() });
      return;
    }
    onSubmit({
      decision: 'approuvee',
      lignes_decision: demande.lignes.map((l) => ({
        ligne_id: l.id,
        quantite_approuvee: parseQty(approved[l.id]) ?? 0,
      })),
      // Tout à 0 : le serveur enregistre un refus, avec ce motif.
      raison_refus: approvedUnits === 0 ? raisonRefus.trim() : undefined,
    });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !loading && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader className="pe-8">
          <DialogTitle>
            Décider de la demande <span className="whitespace-nowrap">{demande.numero}</span>
          </DialogTitle>
          <DialogDescription>
            {demande.magasin_nom} demande {plural(requestedUnits, 'unité', 'unités')}. Approuvez tout ou partie selon le
            stock de {demande.depot_nom}, ou refusez la demande.
          </DialogDescription>
        </DialogHeader>

        <form id="decision-form" onSubmit={handleSubmit} noValidate className="space-y-5">
          <ChoiceGroup<Decision>
            label="Décision"
            value={decision}
            onValueChange={(v) => {
              setDecision(v);
              setSubmitted(false);
            }}
            options={[
              { value: 'approuvee', label: 'Approuver', icon: CheckCircle2 },
              // Libellé court : « Refuser la demande » était tronqué à 390 px (K-m3).
              { value: 'refusee', label: 'Refuser', icon: XCircle },
            ]}
            layout="grid-2"
            shape="tile"
            size="touch"
          />

          {decision === 'approuvee' && (
            <section aria-labelledby="decision-lines-title" className="space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 id="decision-lines-title" className="text-sm font-medium">
                  Quantités approuvées
                </h3>
                {stockError ? (
                  <Button type="button" variant="outline" onClick={() => void fetchStock()}>
                    Recharger le stock du dépôt
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {stockLoading ? 'Lecture du stock du dépôt…' : 'Pré-remplies selon le stock du dépôt'}
                  </p>
                )}
              </div>
              {stockError ? (
                <p className="text-sm text-warning-700" role="status">
                  Stock du dépôt indisponible : vérifiez-le avant d’approuver.
                </p>
              ) : null}
              <ul className="divide-y rounded-md border">
                {demande.lignes.map((l) => {
                  const inputId = `decision-qte-${l.id}`;
                  const stockId = `decision-stock-${l.id}`;
                  const dispo = stock?.[l.produit_id];
                  const n = parseQty(approved[l.id]);
                  const err = submitted || (n !== null && n > l.quantite_demandee) ? lineErrors[l.id] : undefined;
                  const short = dispo != null && n !== null && n > dispo;
                  return (
                    <li
                      key={l.id}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]"
                    >
                      <div className="col-span-2 min-w-0 sm:col-span-1">
                        <p className="truncate text-sm font-medium" title={l.produit_nom}>
                          {l.produit_nom}
                        </p>
                        <p id={stockId} className="text-xs text-muted-foreground tabular-nums">
                          {l.reference && (
                            <>
                              <DocumentCode>{l.reference}</DocumentCode> ·{' '}
                            </>
                          )}
                          Demandée : {formatNumber(l.quantite_demandee)} · Au dépôt :{' '}
                          {stockLoading ? '…' : dispo == null ? 'inconnu' : formatNumber(dispo)}
                        </p>
                        {short && (
                          <p className="mt-1 flex items-center gap-1 text-xs text-warning-700">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            Le dépôt n’a que {plural(dispo ?? 0, 'unité', 'unités')} : l’exécution échouera
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Label htmlFor={inputId} className="whitespace-nowrap text-xs text-muted-foreground">
                          Quantité approuvée
                          {/* M2 : chaque champ porte le nom de son produit. */}
                          <span className="sr-only"> — {l.produit_nom}</span>
                        </Label>
                        <Input
                          id={inputId}
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={l.quantite_demandee}
                          step={1}
                          value={approved[l.id] ?? ''}
                          onChange={(e) => {
                            setTouched(true);
                            setApproved((prev) => ({ ...prev, [l.id]: e.target.value }));
                          }}
                          className="h-11 w-20 text-right tabular-nums sm:h-9"
                          aria-describedby={[stockId, err ? `${inputId}-error` : null].filter(Boolean).join(' ')}
                          aria-invalid={err ? true : undefined}
                        />
                      </div>
                      {/* Pastille pour l'écart seulement : une ligne complète est l'état normal. */}
                      <div className="justify-self-end">
                        {n === null ? null : n === 0 ? (
                          <Badge variant="destructive">Refusé</Badge>
                        ) : n < l.quantite_demandee ? (
                          <Badge variant="warning">Partiel</Badge>
                        ) : null}
                      </div>
                      <FieldError id={inputId} className="col-span-full">
                        {err}
                      </FieldError>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {isRefusal && (
            <div className="space-y-1.5">
              <Label htmlFor="decision-motif">
                Motif du refus <RequiredMark />
              </Label>
              <Textarea
                id="decision-motif"
                placeholder="Ex. : produit épuisé au dépôt, réassort prévu la semaine prochaine"
                value={raisonRefus}
                onChange={(e) => setRaisonRefus(e.target.value)}
                {...fieldErrorProps('decision-motif', motifError)}
              />
              <FieldError id="decision-motif">{motifError}</FieldError>
            </div>
          )}

          <p className="rounded-md border bg-muted/40 p-3 text-sm" role="status">
            {isRefusal
              ? 'Le magasin sera informé du refus et de son motif'
              : isFull
                ? `Toute la demande sera approuvée : ${plural(approvedUnits, 'unité', 'unités')} à transférer`
                : `Approbation partielle : ${formatNumber(approvedUnits)} sur ${plural(requestedUnits, 'unité', 'unités')} à transférer`}
            {!isRefusal && overStock.length > 0 && (
              <span className="mt-1 block text-warning-700">
                {plural(overStock.length, 'ligne dépasse', 'lignes dépassent')} le stock du dépôt
              </span>
            )}
          </p>
        </form>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" size="touch" onClick={onClose} disabled={loading}>
            Annuler
          </Button>
          <Button
            type="submit"
            form="decision-form"
            size="touch"
            variant={isRefusal ? 'destructive' : 'default'}
            disabled={loading}
            className="gap-2"
          >
            {loading ? (
              <Spinner />
            ) : isRefusal ? (
              <XCircle className="h-4 w-4" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            )}
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
