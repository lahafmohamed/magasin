import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSearchParamsPatch } from '@/hooks/useUrlState';
import { toast } from 'sonner';
import { Minus, PackageCheck, Plus, Search } from 'lucide-react';
import { receptionService, stockLocationService, type ReceptionOrderLine } from '@/services/api';
import { usePermission } from '@/hooks/usePermission';
import { useDraft } from '@/hooks/useDraft';
import { PageShell } from '@/components/ui/page-shell';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RequiredMark } from '@/components/ui/required-mark';
import { Money } from '@/components/ui/money';
import { DocumentCode } from '@/components/ui/document-code';
import { Spinner } from '@/components/ui/loading';
import { CardSkeleton, TableSkeleton } from '@/components/ui/skeleton';
import { QueryErrorState, QueryState } from '@/components/ui/query-state';
import { KeyValue, KeyValueList } from '@/components/ui/key-value';
import { FieldError, fieldErrorProps } from '@/components/ui/field-error';
import { SortableHeader, toggleSort, type SortState } from '@/components/ui/sortable-header';
import { ResponsiveTable, DataCard, DataCardRow } from '@/components/ui/responsive-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useConfirm } from '@/components/ui/confirm-dialog';
import StatusBadge from '@/components/StatusBadge';
import { canSeePrices } from '@/utils/roles';
import { getErrorCode, getErrorMessage } from '@/utils/errors';
import { formatCurrency, formatDate, formatNumber, normalizeSearch, toNumber } from '@/utils/format';

interface PendingOrder {
  id: number;
  numero_commande: string;
  fournisseur_nom: string | null;
  date_commande: string;
  statut: string;
  sous_total: string | number;
  receptions_count: number | string;
}

interface OrderDetail {
  id: number;
  numero_commande: string;
  fournisseur_nom: string | null;
  date_commande: string;
  statut: string;
  lignes: ReceptionOrderLine[];
}

interface StockLocation {
  id: number;
  code: string;
  nom: string;
  est_principal: boolean;
  actif: boolean;
  location_type?: 'depot' | 'magasin' | null;
}

interface ReceptionDraft {
  quantities: Record<string, string>;
  notes: string;
  locationId: string;
}

type OrderSortKey = 'numero_commande' | 'fournisseur_nom' | 'date_commande' | 'sous_total';

/** Seules les commandes validées ou expédiées se réceptionnent (`/receptions/pending`). */
const RECEIVABLE = new Set(['validee', 'expediee']);

const plural = (n: number, one: string, many: string) => `${formatNumber(n)} ${n > 1 ? many : one}`;

/** Rôles autorisés par l'API (`authorize` des routes réceptions). */
const CAN_RECEIVE = new Set(['admin', 'manager', 'depot_staff']);

/** Quantité restante d'une ligne, bornée à 0. */
const resteOf = (l: ReceptionOrderLine) => Math.max(0, Number(l.quantite_restante) || 0);

/** Saisie → entier, `null` si ce n'en est pas un. */
function parseQty(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isInteger(n) ? n : null;
}

/** Erreur de saisie d'une ligne : plafond = reste à recevoir (U-20). */
function lineError(l: ReceptionOrderLine, raw: string | undefined): string | undefined {
  const reste = resteOf(l);
  const n = parseQty(raw);
  if (n === null || n < 0) return 'Saisissez une quantité entière (0 si rien n’est arrivé).';
  if (n > reste) return `Reste à recevoir : ${plural(reste, 'unité', 'unités')}.`;
  return undefined;
}

// ---------------------------------------------------------------------------
// Formulaire de réception d'une commande
// ---------------------------------------------------------------------------

interface ReceptionFormProps {
  orderId: number;
  /**
   * Valeur des marchandises et prix de revient : gérant et administrateur
   * seulement. Le personnel dépôt réceptionne en quantités (E2).
   */
  showValues: boolean;
  locations: StockLocation[];
  locationsError: unknown;
  onRetryLocations: () => void;
  onDone: () => void;
  onBack: () => void;
}

/**
 * Marge de défilement sous chaque champ du formulaire : la barre d'action
 * collée en bas d'écran ne doit jamais cacher le champ qui reçoit le focus
 * (WCAG 2.4.11). Sur téléphone, la barre fait jusqu'à ~150 px (boutons sur
 * deux lignes à 320 px), une seule ligne (~70 px) à partir de 640 px.
 */
const FOCUS_CLEARANCE =
  '[&_button]:scroll-mb-40 [&_input]:scroll-mb-40 [&_textarea]:scroll-mb-40 sm:[&_button]:scroll-mb-24 sm:[&_input]:scroll-mb-24 sm:[&_textarea]:scroll-mb-24';

/** Soumission neutre des états de chargement (même racine `<form>` que le formulaire). */
const ignoreSubmit = (event: React.FormEvent) => event.preventDefault();

function ReceptionForm({
  orderId,
  showValues,
  locations,
  locationsError,
  onRetryLocations,
  onDone,
  onBack,
}: ReceptionFormProps) {
  const confirm = useConfirm();
  const { draft, save, clear } = useDraft<ReceptionDraft>(`reception:${orderId}`);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState(draft?.notes ?? '');
  const [locationId, setLocationId] = useState(draft?.locationId ?? '');
  const [restored, setRestored] = useState(false);
  /** Saisie modifiée par l'utilisateur : seule une vraie saisie est gardée en brouillon. */
  const [dirty, setDirty] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadOrder = useCallback(
    async (opts: { keepInput?: boolean } = {}) => {
      setLoading(true);
      setError(null);
      try {
        const detail = (await receptionService.getOrderDetails(orderId)) as OrderDetail;
        setOrder(detail);
        setQuantities((prev) => {
          const next: Record<string, string> = {};
          for (const l of detail.lignes) {
            const reste = resteOf(l);
            const kept = opts.keepInput ? prev[l.id] : draft?.quantities?.[l.id];
            const keptN = parseQty(kept);
            // Saisie conservée tant qu'elle reste dans le plafond ; sinon le reste.
            next[l.id] = keptN !== null && keptN >= 0 && keptN <= reste ? String(keptN) : String(reste);
          }
          return next;
        });
        if (!opts.keepInput && draft?.quantities && Object.keys(draft.quantities).length > 0) setRestored(true);
      } catch (err) {
        setOrder(null);
        setError(err);
      } finally {
        setLoading(false);
      }
    },
    // Le brouillon n'est lu qu'au montage (clé par commande) : pas une dépendance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orderId]
  );

  useEffect(() => {
    void loadOrder();
  }, [loadOrder]);

  // Emplacement par défaut : la marchandise fournisseur arrive au dépôt (le
  // principal s'il en est un), sinon l'emplacement principal, sinon le premier.
  useEffect(() => {
    if (locationId || locations.length === 0) return;
    const depots = locations.filter((l) => l.location_type === 'depot');
    const target =
      depots.find((l) => l.est_principal) ?? depots[0] ?? locations.find((l) => l.est_principal) ?? locations[0];
    if (target) setLocationId(String(target.id));
  }, [locations, locationId]);

  // La saisie survit à un retour arrière ou à un rafraîchissement.
  useEffect(() => {
    if (order && dirty) save({ quantities, notes, locationId });
  }, [order, dirty, quantities, notes, locationId, save]);

  const lines = order?.lignes ?? [];
  const openLines = lines.filter((l) => resteOf(l) > 0);
  const errors = useMemo(() => {
    const out: Record<number, string> = {};
    for (const l of openLines) {
      const msg = lineError(l, quantities[l.id]);
      if (msg) out[l.id] = msg;
    }
    return out;
  }, [openLines, quantities]);

  const receivedUnits = openLines.reduce((s, l) => s + Math.max(0, parseQty(quantities[l.id]) ?? 0), 0);
  const receivedValue = openLines.reduce(
    (s, l) => s + Math.max(0, parseQty(quantities[l.id]) ?? 0) * (toNumber(l.prix_unitaire) ?? 0),
    0
  );
  const completesOrder = openLines.every((l) => (parseQty(quantities[l.id]) ?? 0) >= resteOf(l));
  const location = locations.find((l) => String(l.id) === locationId);
  const locationError = submitted && !locationId ? 'Choisissez où ranger la marchandise reçue.' : undefined;

  const setQty = (lineId: number, value: string) => {
    setDirty(true);
    setQuantities((prev) => ({ ...prev, [lineId]: value }));
  };
  const step = (l: ReceptionOrderLine, delta: number) => {
    const current = Math.max(0, parseQty(quantities[l.id]) ?? 0);
    setQty(l.id, String(Math.min(resteOf(l), Math.max(0, current + delta))));
  };
  const resetToRemaining = () => {
    setQuantities(Object.fromEntries(lines.map((l) => [l.id, String(resteOf(l))])));
    setRestored(false);
    setDirty(false);
    clear();
  };
  const discard = async () => {
    // GV-30 : « Annuler » ne jette plus une saisie sans prévenir.
    if (dirty) {
      const ok = await confirm({
        title: 'Abandonner cette réception ?',
        description: 'Les quantités saisies seront perdues. Rien n’entre en stock.',
        confirmLabel: 'Abandonner la saisie',
        cancelLabel: 'Continuer la saisie',
        destructive: true,
      });
      if (!ok) return;
    }
    clear();
    onBack();
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!order) return;
    setSubmitted(true);
    if (!locationId) {
      document.getElementById('reception-location')?.focus();
      return;
    }
    const firstError = openLines.find((l) => errors[l.id]);
    if (firstError) {
      document.getElementById(`reception-qty-${firstError.id}`)?.focus();
      return;
    }
    if (receivedUnits === 0) {
      toast.error('Saisissez au moins une quantité reçue.');
      return;
    }

    // La réception écrit le stock (et, pour les responsables, recalcule le prix
    // de revient moyen) : on récapitule avant. Le dépôt lit des quantités (E2).
    const units = plural(receivedUnits, 'unité', 'unités');
    const verb = receivedUnits > 1 ? 'entreront' : 'entrera';
    const where = location?.nom ?? 'l’emplacement choisi';
    const reliquat = completesOrder ? '' : ' La commande restera ouverte pour le reliquat.';
    const confirmed = await confirm({
      title: `Valider la réception de ${order.numero_commande} ?`,
      description: showValues
        ? `${units} pour ${formatCurrency(receivedValue)} ${verb} dans le stock de ${where}. Le prix de revient moyen des produits sera recalculé.${reliquat}`
        : `${units} ${verb} dans le stock de ${where}.${reliquat}`,
      confirmLabel: 'Valider la réception',
    });
    if (!confirmed) return;

    setSubmitting(true);
    try {
      await receptionService.create({
        commande_id: order.id,
        location_id: Number(locationId),
        // Les lignes déjà entièrement reçues ne font pas partie de cette livraison.
        lignes: openLines.map((l) => ({
          produit_id: l.produit_id,
          quantite_commandee: Number(l.quantite) || 0,
          quantite_recue: parseQty(quantities[l.id]) ?? 0,
          // E2 : le dépôt ne reçoit plus le prix de la commande. Sans prix, le
          // serveur reprend celui de la ligne de commande — envoyer 0 fausserait
          // le coût de la réception.
          ...(toNumber(l.prix_unitaire) !== null ? { cout_unitaire: toNumber(l.prix_unitaire) ?? 0 } : {}),
        })),
        notes: notes.trim() || undefined,
      });
      clear();
      toast.success(
        completesOrder
          ? `Réception enregistrée : stock mis à jour à ${location?.nom ?? 'l’emplacement'}. Commande ${order.numero_commande} entièrement reçue.`
          : `Réception enregistrée : stock mis à jour à ${location?.nom ?? 'l’emplacement'}. La commande ${order.numero_commande} attend le reliquat.`
      );
      onDone();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible d’enregistrer la réception. Réessayez.'));
      // Un autre poste a peut-être réceptionné entre-temps : on relit « Déjà reçu ».
      if (getErrorCode(err) === 'OVER_RECEIPT') void loadOrder({ keepInput: true });
    } finally {
      setSubmitting(false);
    }
  };

  const title = order ? `Réception de la commande ${order.numero_commande}` : 'Réception de la commande';
  const backLabel = 'Retour aux commandes à réceptionner';

  if (loading && !order) {
    return (
      <PageShell
        as="form"
        onSubmit={ignoreSubmit}
        title={title}
        width="wide"
        onBack={onBack}
        backLabel={backLabel}
        focusOnMount
      >
        <Card>
          <CardContent inset="standalone">
            <CardSkeleton lines={6} />
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  if (error || !order) {
    return (
      <PageShell
        as="form"
        onSubmit={ignoreSubmit}
        title={title}
        width="wide"
        onBack={onBack}
        backLabel={backLabel}
        focusOnMount
      >
        <Card>
          <QueryErrorState error={error} title="Impossible de charger la commande" onRetry={() => void loadOrder()} />
        </Card>
      </PageShell>
    );
  }

  if (!RECEIVABLE.has(order.statut) || openLines.length === 0) {
    return (
      <PageShell
        as="form"
        onSubmit={ignoreSubmit}
        title={title}
        width="wide"
        onBack={onBack}
        backLabel={backLabel}
        focusOnMount
        meta={<StatusBadge type="commande" statut={order.statut} size="md" />}
      >
        <Card>
          <CardContent inset="standalone" className="space-y-2">
            <p className="font-medium">Rien à réceptionner sur cette commande</p>
            <p className="text-sm text-muted-foreground">
              {openLines.length === 0
                ? 'Tous les produits commandés ont déjà été reçus'
                : 'Seule une commande validée ou expédiée par le fournisseur se réceptionne'}
            </p>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell
      as="form"
      onSubmit={submit}
      noValidate
      title={title}
      width="wide"
      onBack={onBack}
      backLabel={backLabel}
      focusOnMount
      className={FOCUS_CLEARANCE}
      meta={<StatusBadge type="commande" statut={order.statut} size="md" />}
      description="Saisissez ce qui est réellement arrivé. Le reste peut être réceptionné lors d’une prochaine livraison."
    >
      <Card>
        <CardContent inset="standalone" className="space-y-4">
          {/* Le numéro de commande est déjà dans le titre de la page. */}
          <KeyValueList columns={2}>
            <KeyValue label="Fournisseur">{order.fournisseur_nom || '—'}</KeyValue>
            <KeyValue label="Date de commande">{formatDate(order.date_commande)}</KeyValue>
          </KeyValueList>
          <div className="max-w-sm space-y-1.5">
            <Label htmlFor="reception-location">
              Emplacement de réception <RequiredMark />
            </Label>
            {locationsError ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-danger-700">Impossible de charger les emplacements</span>
                <Button type="button" variant="outline" onClick={onRetryLocations}>
                  Réessayer
                </Button>
              </div>
            ) : (
              <Select
                value={locationId || undefined}
                onValueChange={(v) => {
                  setDirty(true);
                  setLocationId(v);
                }}
              >
                <SelectTrigger id="reception-location" className="h-11 sm:h-9" {...fieldErrorProps('reception-location', locationError)}>
                  <SelectValue placeholder="Choisir un emplacement" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((l) => (
                    <SelectItem key={l.id} value={String(l.id)}>
                      {l.nom}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <FieldError id="reception-location">{locationError}</FieldError>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-3">
          <CardTitle>Produits reçus</CardTitle>
          <Button type="button" variant="ghost" onClick={resetToRemaining}>
            Tout recevoir
          </Button>
        </CardHeader>
        <CardContent inset="flush">
          {restored && (
            <p className="mx-4 mb-3 rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground sm:mx-5" role="status">
              Votre saisie précédente a été restaurée
            </p>
          )}
          <ResponsiveTable
            className="px-4 pb-4 md:px-0 md:pb-0"
            table={
              <Table aria-label={`Produits de la commande ${order.numero_commande}`}>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produit</TableHead>
                    <TableHead numeric>Commandé</TableHead>
                    <TableHead numeric>Déjà reçu</TableHead>
                    <TableHead numeric>Reste</TableHead>
                    <TableHead numeric>Reçu maintenant</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((l) => {
                    const reste = resteOf(l);
                    const inputId = `reception-qty-${l.id}`;
                    const n = parseQty(quantities[l.id]);
                    const err = submitted || (n !== null && n > reste) ? errors[l.id] : undefined;
                    const partial = reste > 0 && n !== null && n < reste;
                    return (
                      <TableRow key={l.id}>
                        <TableCell>
                          <span className="block font-medium">{l.produit_nom}</span>
                          {l.produit_reference && (
                            <DocumentCode className="block text-xs text-muted-foreground">{l.produit_reference}</DocumentCode>
                          )}
                        </TableCell>
                        <TableCell numeric>{formatNumber(l.quantite)}</TableCell>
                        <TableCell numeric>{formatNumber(l.quantite_deja_recue)}</TableCell>
                        <TableCell numeric className="font-medium">
                          {formatNumber(reste)}
                        </TableCell>
                        <TableCell numeric className="w-48">
                          {reste === 0 ? (
                            <Badge variant="success">Reçu</Badge>
                          ) : (
                            <div className="flex flex-col items-end gap-1">
                              <div className="flex items-center justify-end gap-2">
                                {partial && <Badge variant="warning">Partiel</Badge>}
                                <Label htmlFor={inputId} className="sr-only">
                                  Reçu maintenant — {l.produit_nom}
                                </Label>
                                <Input
                                  id={inputId}
                                  type="number"
                                  inputMode="numeric"
                                  min={0}
                                  max={reste}
                                  step={1}
                                  value={quantities[l.id] ?? ''}
                                  onChange={(e) => setQty(l.id, e.target.value)}
                                  className="h-9 w-24 text-right tabular-nums"
                                  {...fieldErrorProps(inputId, err)}
                                />
                              </div>
                              <FieldError id={inputId} className="whitespace-normal text-right">
                                {err}
                              </FieldError>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            }
            cards={lines.map((l) => {
              const reste = resteOf(l);
              const inputId = `reception-qty-card-${l.id}`;
              const n = parseQty(quantities[l.id]);
              const err = submitted || (n !== null && n > reste) ? errors[l.id] : undefined;
              const partial = reste > 0 && n !== null && n < reste;
              return (
                <DataCard
                  key={l.id}
                  title={l.produit_nom}
                  badge={
                    reste === 0 ? (
                      <Badge variant="success">Reçu</Badge>
                    ) : partial ? (
                      <Badge variant="warning">Partiel</Badge>
                    ) : undefined
                  }
                >
                  {l.produit_reference && (
                    <DataCardRow label="Référence" value={<DocumentCode>{l.produit_reference}</DocumentCode>} />
                  )}
                  <DataCardRow label="Commandé" value={formatNumber(l.quantite)} numeric />
                  <DataCardRow label="Déjà reçu" value={formatNumber(l.quantite_deja_recue)} numeric />
                  <DataCardRow label="Reste" value={formatNumber(reste)} numeric />
                  {reste > 0 && (
                    <div className="mt-3 space-y-1">
                      <Label htmlFor={inputId}>Reçu maintenant</Label>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-touch"
                          aria-label={`Une unité de moins — ${l.produit_nom}`}
                          onClick={() => step(l, -1)}
                        >
                          <Minus className="h-4 w-4" aria-hidden="true" />
                        </Button>
                        <Input
                          id={inputId}
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={reste}
                          step={1}
                          value={quantities[l.id] ?? ''}
                          onChange={(e) => setQty(l.id, e.target.value)}
                          className="h-11 flex-1 text-center tabular-nums"
                          {...fieldErrorProps(inputId, err)}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-touch"
                          aria-label={`Une unité de plus — ${l.produit_nom}`}
                          onClick={() => step(l, 1)}
                          disabled={(n ?? 0) >= reste}
                        >
                          <Plus className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </div>
                      <FieldError id={inputId}>{err}</FieldError>
                    </div>
                  )}
                </DataCard>
              );
            })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent inset="standalone" className="space-y-1.5">
          <Label htmlFor="reception-notes">Notes</Label>
          <Textarea
            id="reception-notes"
            value={notes}
            onChange={(e) => {
              setDirty(true);
              setNotes(e.target.value);
            }}
            placeholder="Ex. : carton abîmé, numéro du bon de livraison du fournisseur"
            rows={3}
          />
        </CardContent>
      </Card>

      {/* Barre d'action : une ligne de boutons, qui ne passe sur deux lignes
          qu'en dessous de ~340 px (pas de libellé tronqué). */}
      <div className="sticky bottom-0 z-10 -mx-4 flex flex-col gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-6">
        <p className="text-sm text-muted-foreground" role="status">
          <span className="font-medium tabular-nums text-foreground">{plural(receivedUnits, 'unité', 'unités')}</span>
          {showValues && (
            <>
              {' · '}
              <Money value={receivedValue} />
            </>
          )}
          {completesOrder ? ' · commande soldée' : ' · reliquat à recevoir'}
        </p>
        <div className="flex flex-wrap gap-2 sm:flex-nowrap">
          <Button type="button" variant="outline" size="touch" onClick={() => void discard()} disabled={submitting}>
            Annuler
          </Button>
          <Button
            type="submit"
            size="touch"
            className="flex-1 basis-48 gap-2 sm:flex-none sm:basis-auto"
            disabled={submitting || !!locationsError}
          >
            {submitting ? <Spinner /> : <PackageCheck className="h-4 w-4" aria-hidden="true" />}
            Valider la réception
          </Button>
        </div>
      </div>
    </PageShell>
  );
}

// ---------------------------------------------------------------------------
// Page : commandes à réceptionner
// ---------------------------------------------------------------------------

export default function Receptions() {
  const { userRole } = usePermission();
  const canReceive = CAN_RECEIVE.has(userRole);
  /** Montant des commandes : gérant et administrateur ; le dépôt voit des quantités (E2). */
  const showValues = canSeePrices(userRole);
  const [searchParams] = useSearchParams();
  const patchParams = useSearchParamsPatch();
  const [orders, setOrders] = useState<PendingOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [locationsError, setLocationsError] = useState<unknown>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortState<OrderSortKey> | null>(null);

  const selectedParam = Number(searchParams.get('commande_id'));
  const selectedId = canReceive && Number.isInteger(selectedParam) && selectedParam > 0 ? selectedParam : null;

  const fetchPendingOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = (await receptionService.getPending()) as PendingOrder[] | null;
      setOrders(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchLocations = useCallback(async () => {
    setLocationsError(null);
    try {
      const data = (await stockLocationService.getAll()) as StockLocation[] | { data?: StockLocation[] };
      const all = Array.isArray(data) ? data : data?.data ?? [];
      setLocations(all.filter((l) => l.actif));
    } catch (err) {
      setLocationsError(err);
    }
  }, []);

  useEffect(() => {
    void fetchPendingOrders();
    void fetchLocations();
  }, [fetchPendingOrders, fetchLocations]);

  // Le formulaire vit dans l'adresse (`?commande_id=`) : retour arrière et rafraîchissement le gardent.
  const openOrder = (id: number) => patchParams({ commande_id: id }, { replace: false });
  const closeOrder = () => patchParams({ commande_id: null });

  // La liste des commandes à réceptionner est chargée en entier (pas de
  // pagination serveur) : recherche et tri restent locaux.
  const visibleOrders = useMemo(() => {
    const q = normalizeSearch(search);
    const filtered = q
      ? orders.filter((o) => normalizeSearch(`${o.numero_commande} ${o.fournisseur_nom ?? ''}`).includes(q))
      : orders;
    if (!sort) return filtered;
    return [...filtered].sort((a, b) => {
      let cmp: number;
      if (sort.key === 'sous_total') cmp = (toNumber(a.sous_total) ?? 0) - (toNumber(b.sous_total) ?? 0);
      else if (sort.key === 'date_commande') cmp = new Date(a.date_commande).getTime() - new Date(b.date_commande).getTime();
      else cmp = String(a[sort.key] ?? '').localeCompare(String(b[sort.key] ?? ''), 'fr');
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [orders, search, sort]);

  if (selectedId !== null) {
    return (
      <ReceptionForm
        key={selectedId}
        orderId={selectedId}
        showValues={showValues}
        locations={locations}
        locationsError={locationsError}
        onRetryLocations={() => void fetchLocations()}
        onBack={closeOrder}
        onDone={() => {
          closeOrder();
          void fetchPendingOrders();
        }}
      />
    );
  }

  const receiveButton = (o: PendingOrder) =>
    canReceive ? (
      <Button
        variant="outline"
        size="touch"
        onClick={() => openOrder(o.id)}
        aria-label={`Réceptionner la commande ${o.numero_commande}`}
      >
        Réceptionner
      </Button>
    ) : null;

  return (
    <PageShell
      title="Réceptions"
      description="Commandes fournisseur à réceptionner. Les quantités reçues entrent en stock à la validation."
      toolbar={
        <div className="relative w-full sm:max-w-md">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="N° de commande ou fournisseur…"
            aria-label="Rechercher une commande à réceptionner"
            className="h-11 pl-10 sm:h-9"
          />
        </div>
      }
    >
      <Card className="max-md:border-0 max-md:bg-transparent max-md:shadow-none">
        <CardContent inset="flush">
          <QueryState
            loading={loading}
            error={error}
            onRetry={() => void fetchPendingOrders()}
            errorTitle="Impossible de charger les commandes à réceptionner"
            skeleton={<TableSkeleton rows={6} columns={6} />}
            isEmpty={visibleOrders.length === 0}
            emptyIcon={PackageCheck}
            emptyTitle={
              search.trim()
                ? `Aucune commande ne correspond à « ${search.trim()} »`
                : 'Aucune commande en attente de réception'
            }
            emptyDescription={
              search.trim()
                ? 'Vérifiez le numéro de commande ou le nom du fournisseur'
                : 'Les commandes fournisseur validées ou expédiées apparaîtront ici'
            }
          >
            <ResponsiveTable
              table={
                <Table aria-label="Commandes fournisseur à réceptionner">
                  <TableHeader>
                    <TableRow>
                      <SortableHeader columnKey="numero_commande" sort={sort} onSort={(k: OrderSortKey) => setSort((s) => toggleSort(s, k))}>
                        N° de commande
                      </SortableHeader>
                      <SortableHeader columnKey="fournisseur_nom" sort={sort} onSort={(k: OrderSortKey) => setSort((s) => toggleSort(s, k))}>
                        Fournisseur
                      </SortableHeader>
                      <SortableHeader columnKey="date_commande" sort={sort} onSort={(k: OrderSortKey) => setSort((s) => toggleSort(s, k))}>
                        Date
                      </SortableHeader>
                      <TableHead>Statut</TableHead>
                      {showValues && (
                        <SortableHeader
                          columnKey="sous_total"
                          sort={sort}
                          onSort={(k: OrderSortKey) => setSort((s) => toggleSort(s, k))}
                          align="right"
                          numeric
                        >
                          Montant
                        </SortableHeader>
                      )}
                      <TableHead>
                        <span className="sr-only">Action</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleOrders.map((o) => (
                      <TableRow key={o.id}>
                        <TableCell>
                          <DocumentCode>{o.numero_commande}</DocumentCode>
                        </TableCell>
                        <TableCell>{o.fournisseur_nom || '—'}</TableCell>
                        <TableCell className="whitespace-nowrap">{formatDate(o.date_commande)}</TableCell>
                        <TableCell>
                          <StatusBadge type="commande" statut={o.statut} />
                        </TableCell>
                        {showValues && (
                          <TableCell numeric>
                            <Money value={o.sous_total} />
                          </TableCell>
                        )}
                        <TableCell className="text-right">{receiveButton(o)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              }
              cards={visibleOrders.map((o) => (
                <DataCard
                  key={o.id}
                  title={<DocumentCode>{o.numero_commande}</DocumentCode>}
                  badge={<StatusBadge type="commande" statut={o.statut} />}
                  actions={receiveButton(o)}
                >
                  <DataCardRow label="Fournisseur" value={o.fournisseur_nom || '—'} />
                  <DataCardRow label="Date" value={formatDate(o.date_commande)} />
                  {showValues && <DataCardRow label="Montant" value={<Money value={o.sous_total} />} numeric />}
                </DataCard>
              ))}
            />
          </QueryState>
        </CardContent>
      </Card>
    </PageShell>
  );
}
