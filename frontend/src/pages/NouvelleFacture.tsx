import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, useFieldArray, useWatch, Controller, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { AlertTriangle, Minus, Package, Plus, X } from 'lucide-react';
import { factureService, tiersService, ventesService } from '@/services/api';
import { TiersPicker, type TiersPickerValue } from '@/components/TiersPicker';
import { ProductCombobox } from '@/components/ProductCombobox';
import { NumericField } from '@/components/NumericField';
import { DocumentLines, type DocumentLineColumn } from '@/components/DocumentLines';
import {
  DocumentFormShell,
  DraftNotice,
  MarginSummary,
  SummaryItem,
  SummaryList,
} from '@/components/DocumentFormShell';
import {
  InlineNotice,
  SalesLocationField,
  SalesProductOption,
  type SalesSearchProduct,
} from '@/components/SalesFormParts';
import { defaultLocationId, useLocationStock, useSalesLocations } from '@/components/useSalesStock';
import { useDraft } from '@/hooks/useDraft';
import { useOptionalAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DocumentTotals } from '@/components/ui/document-totals';
import { DocumentCode } from '@/components/ui/document-code';
import { EmptyState } from '@/components/ui/empty-state';
import { FieldError, fieldErrorProps } from '@/components/ui/field-error';
import { Label } from '@/components/ui/label';
import { Money } from '@/components/ui/money';
import { RequiredMark } from '@/components/ui/required-mark';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { getErrorMessage } from '@/utils/errors';
import { formatPercent, toNumber } from '@/utils/format';
import {
  computeSalesTotals,
  getValidSalePrice,
  isBelowCost,
  netUnitPrice,
  saleDisabledReason,
} from '@/utils/salesPrice';
import {
  SALES_MESSAGES as M,
  describeDueDate,
  insufficientStockMessage,
  lineFieldLabel,
  plural,
} from '@/validation/salesForms';

/** Code du client de passage (`GET /tiers/comptoir`). */
const COMPTOIR_CODE = 'PASS';

const ligneSchema = z.object({
  produit_id: z.number(),
  produit_nom: z.string(),
  produit_reference: z.string(),
  quantite: z.number({ error: M.quantity }).int(M.quantityInteger).min(1, M.quantity),
  prix_unitaire: z.number({ error: M.price }).positive(M.price),
  /** Prix catalogue au moment de l'ajout (repère « prix modifié »). */
  prix_unitaire_default: z.number(),
  prix_revient: z.number(),
  remise_pct: z.number({ error: M.discount }).min(0, M.discount).max(100, M.discount),
  stock_dispo: z.number(),
});

const factureSchema = z.object({
  client: z.custom<TiersPickerValue | null>((v) => v != null, { error: M.clientRequired }),
  location_id: z.number().nullable(),
  notes: z.string(),
  lignes: z.array(ligneSchema).min(1, M.linesRequired),
});

type FactureFormValues = z.infer<typeof factureSchema>;
type LigneFacture = z.infer<typeof ligneSchema>;

const ID = {
  client: 'facture-client',
  search: 'facture-produit-search',
  searchHint: 'facture-produit-aide',
  lignes: 'facture-lignes',
  location: 'facture-location',
  notes: 'facture-notes',
  quantite: (i: number) => `facture-ligne-${i}-quantite`,
  prix: (i: number) => `facture-ligne-${i}-prix`,
  remise: (i: number) => `facture-ligne-${i}-remise`,
  stock: (i: number) => `facture-ligne-${i}-stock`,
};

/** Colonnes des lignes : tableau quand la colonne du formulaire a la place, cartes sinon (`DocumentLines`). */
/**
 * GV-52 : à 1 366 px la colonne du formulaire fait 692 px et le tableau en
 * demandait 690 — un total à sept chiffres suffisait à faire passer la vente
 * en cartes. Le produit passe à la ligne dès 10 rem et la cellule de prix ne
 * réserve plus que la largeur de son champ (`w-32`) : environ 32 px de marge.
 */
const LINE_COLUMNS: DocumentLineColumn[] = [
  { id: 'produit', header: 'Produit', mobile: 'title', cellClassName: 'min-w-[10rem]' },
  { id: 'quantite', header: 'Quantité', mobile: 'field', headClassName: 'text-center' },
  {
    id: 'prix',
    header: 'Prix unitaire',
    mobile: 'field',
    headClassName: 'text-right',
    cellClassName: 'text-right',
  },
  { id: 'remise', header: 'Remise', mobile: 'field', headClassName: 'text-right', cellClassName: 'text-right' },
  { id: 'total', header: 'Total', numeric: true, mobile: 'field' },
  {
    id: 'retirer',
    header: 'Retirer',
    srOnlyHeader: true,
    mobile: 'action',
    headClassName: 'w-10',
    cellClassName: 'px-1',
  },
];

/** Premier champ en erreur, dans l'ordre de lecture de la page. */
function firstErrorId(errors: FieldErrors<FactureFormValues>, lineCount: number): string | null {
  if (errors.client) return ID.client;
  for (let i = 0; i < lineCount; i++) {
    const le = errors.lignes?.[i];
    if (le?.quantite) return ID.quantite(i);
    if (le?.prix_unitaire) return ID.prix(i);
    if (le?.remise_pct) return ID.remise(i);
  }
  if (errors.lignes?.message || errors.lignes?.root?.message) return ID.search;
  return null;
}

/** Focus après le rendu des messages, pour que le lecteur d'écran les lise avec le champ. */
function focusById(id: string | null) {
  if (!id) return;
  window.setTimeout(() => document.getElementById(id)?.focus(), 0);
}

function clientName(c: TiersPickerValue): string {
  return `${c.raison_sociale}${c.prenom ? ` ${c.prenom}` : ''}`;
}

export default function NouvelleFacture() {
  const navigate = useNavigate();
  const auth = useOptionalAuth();
  const canSeeCost = !!auth?.hasRole('admin', 'manager');
  const isCashier = !!auth?.hasRole('caissier');
  const clientTitleId = useId();

  const [submitting, setSubmitting] = useState(false);
  const [clientDelai, setClientDelai] = useState<{ id: number; delai: string | null } | null>(null);
  const [lineAnnounce, setLineAnnounce] = useState('');

  const {
    control,
    register,
    handleSubmit,
    setValue,
    getValues,
    setError,
    watch,
    reset,
    formState: { errors, isDirty, isSubmitted },
  } = useForm<FactureFormValues>({
    resolver: zodResolver(factureSchema),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    shouldFocusError: false,
    defaultValues: { client: null, location_id: null, notes: '', lignes: [] },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'lignes' });

  // --- Brouillon ------------------------------------------------------------
  // Enregistré seulement pour une saisie de l'utilisateur : la présélection du
  // client comptoir ou de l'emplacement par défaut ne crée pas de brouillon.
  const { draft, save, clear, hasDraft } = useDraft<FactureFormValues>('facture:new');
  const [showDraftBanner, setShowDraftBanner] = useState(
    () => hasDraft && Array.isArray(draft?.lignes) && draft.lignes.length > 0
  );

  useEffect(() => {
    const sub = watch((values, { name, type }) => {
      if (type === 'change' || name?.startsWith('lignes')) save(values as FactureFormValues);
    });
    return () => sub.unsubscribe();
  }, [watch, save]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const client = useWatch({ control, name: 'client' });
  const selectedLocationId = useWatch({ control, name: 'location_id' });
  const watchedLignes = useWatch({ control, name: 'lignes' });
  const lignes = useMemo(() => (watchedLignes ?? []) as LigneFacture[], [watchedLignes]);

  // --- Emplacement et stock -------------------------------------------------
  const sales = useSalesLocations((list) =>
    setValue('location_id', defaultLocationId(list, getValues('location_id')))
  );
  const stock = useLocationStock(selectedLocationId);

  // Le stock de chaque ligne suit l'emplacement choisi.
  const syncLineStock = useCallback(() => {
    if (stock.state !== 'ready') return;
    getValues('lignes').forEach((ligne, i) => {
      const available = stock.stockMap[ligne.produit_id] ?? 0;
      if (ligne.stock_dispo !== available) setValue(`lignes.${i}.stock_dispo`, available);
    });
  }, [stock.stockMap, stock.state, getValues, setValue]);

  useEffect(() => {
    syncLineStock();
  }, [syncLineStock]);

  // --- Client comptoir présélectionné pour le caissier (D4) ----------------
  useEffect(() => {
    if (!isCashier) return;
    let cancelled = false;
    tiersService
      .getComptoir()
      .then((comptoir) => {
        if (cancelled || !comptoir || getValues('client') != null) return;
        setValue('client', comptoir);
        // P-M5 : le client est choisi, la douchette part dans « Ajouter un
        // produit » — sauf si la caissière est déjà dans un autre champ.
        requestAnimationFrame(() => {
          if (cancelled) return;
          const active = document.activeElement;
          const idle = !active || active === document.body || active.matches('h1, main');
          if (idle) document.getElementById(ID.search)?.focus();
        });
      })
      .catch(() => {
        /* pas de présélection : le caissier choisit le client */
      });
    return () => {
      cancelled = true;
    };
  }, [isCashier, getValues, setValue]);

  // --- Échéance : fixée par le serveur d'après le délai de paiement du client
  const clientId = client?.id ?? null;
  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    tiersService
      .getById(clientId)
      .then((t) => {
        if (!cancelled) setClientDelai({ id: clientId, delai: t?.delai_paiement ?? null });
      })
      .catch(() => {
        if (!cancelled) setClientDelai(null);
      });
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  // --- Produits ------------------------------------------------------------
  const searchProducts = useCallback(
    async (q: string): Promise<SalesSearchProduct[]> => {
      const rows = await ventesService.searchFuzzy(q, 20, selectedLocationId ?? undefined);
      return Array.isArray(rows) ? (rows as SalesSearchProduct[]) : [];
    },
    [selectedLocationId]
  );

  const addProduit = (p: SalesSearchProduct) => {
    const prixVente = getValidSalePrice(p.prix_vente);
    if (prixVente === null) return;
    const current = getValues('lignes');
    const existing = current.findIndex((l) => l.produit_id === p.id);
    if (existing >= 0) {
      const qty = current[existing].quantite;
      setValue(`lignes.${existing}.quantite`, (Number.isFinite(qty) ? qty : 0) + 1, {
        shouldDirty: true,
        shouldValidate: isSubmitted,
      });
      return;
    }
    append(
      {
        produit_id: p.id,
        produit_nom: p.nom,
        produit_reference: p.reference ?? '',
        quantite: 1,
        prix_unitaire: prixVente,
        prix_unitaire_default: prixVente,
        prix_revient: toNumber(p.prix_achat) ?? 0,
        remise_pct: 0,
        stock_dispo: stock.stockOf(p.id, p.stock),
      },
      { shouldFocus: false }
    );
  };

  const removeLigne = (index: number) => {
    const nom = getValues(`lignes.${index}.produit_nom`);
    remove(index);
    setLineAnnounce(`${nom} retiré de la facture.`);
    document.getElementById(ID.search)?.focus();
  };

  const setQuantity = (index: number, quantite: number) =>
    setValue(`lignes.${index}.quantite`, quantite, { shouldDirty: true, shouldValidate: isSubmitted });

  const totals = useMemo(() => computeSalesTotals(lignes), [lignes]);

  // --- Envoi ---------------------------------------------------------------
  const onInvalid = (errs: FieldErrors<FactureFormValues>) => focusById(firstErrorId(errs, fields.length));

  const onValid = async (data: FactureFormValues) => {
    // Le stock dépend de l'emplacement chargé en direct : vérifié ici, affiché
    // sous la quantité de chaque ligne concernée.
    const overstock = data.lignes.flatMap((l, i) => (l.quantite > l.stock_dispo ? [i] : []));
    if (overstock.length > 0) {
      for (const i of overstock) {
        setError(`lignes.${i}.quantite`, {
          type: 'stock',
          message: insufficientStockMessage(data.lignes[i].stock_dispo),
        });
      }
      focusById(ID.quantite(overstock[0]));
      return;
    }
    if (!data.client) return;
    setSubmitting(true);
    try {
      const result = await factureService.create({
        tiers_id: data.client.id,
        location_id: data.location_id ?? undefined,
        lignes: data.lignes.map((l) => ({
          produit_id: l.produit_id,
          quantite: l.quantite,
          prix_unitaire: netUnitPrice(l.prix_unitaire, l.remise_pct),
        })),
        notes: data.notes.trim() || undefined,
      });
      clear();
      toast.success(`Facture ${result.numero_facture} créée`);
      navigate(`/factures/${result.id}`, { replace: true, state: { justCreated: true } });
    } catch (error) {
      toast.error(getErrorMessage(error, 'Impossible de créer la facture. Vérifiez les lignes puis réessayez.'));
      setSubmitting(false);
    }
  };

  const restoreDraft = () => {
    if (draft) {
      reset(
        {
          client: draft.client ?? null,
          location_id: draft.location_id ?? getValues('location_id'),
          notes: draft.notes ?? '',
          lignes: Array.isArray(draft.lignes) ? draft.lignes : [],
        },
        { keepDefaultValues: true }
      );
      window.setTimeout(syncLineStock, 0);
    }
    setShowDraftBanner(false);
  };

  const discardDraft = () => {
    clear();
    setShowDraftBanner(false);
  };

  // --- Rendu ---------------------------------------------------------------
  const location = sales.locations.find((l) => l.id === selectedLocationId) ?? null;
  const lignesError = errors.lignes?.message ?? errors.lignes?.root?.message;
  const isComptoir = client?.code === COMPTOIR_CODE;
  const dueLabel = !client
    ? '—'
    : clientDelai?.id === client.id
      ? describeDueDate(clientDelai.delai)
      : 'Selon le délai de paiement du client';

  const summary = (
    <>
      <SummaryList>
        <SummaryItem label="Client">
          {client ? clientName(client) : <span className="font-normal text-muted-foreground">Non choisi</span>}
        </SummaryItem>
        {location && <SummaryItem label="Emplacement">{location.nom}</SummaryItem>}
        <SummaryItem label="Échéance">{dueLabel}</SummaryItem>
        <SummaryItem label="Produits" numeric>
          {totals.lines === 0
            ? '—'
            : `${plural(totals.lines, 'ligne', 'lignes')} · ${plural(totals.units, 'unité', 'unités')}`}
        </SummaryItem>
      </SummaryList>
      <DocumentTotals
        className={cn('mt-0 w-full sm:w-full', totals.discount > 0 ? undefined : 'pt-2')}
        aria-label="Totaux de la facture"
        rows={
          totals.discount > 0
            ? [
                { label: 'Sous-total', value: totals.gross },
                { label: 'Remises', value: -totals.discount },
              ]
            : []
        }
        total={{ label: 'Total', value: totals.total }}
      />
      {/* Marge seulement une fois une ligne saisie : « 0 FCFA » de marge sur une facture vide ne dit rien. */}
      {canSeeCost && totals.lines > 0 && (
        <MarginSummary margin={totals.margin} cost={totals.cost} marginPct={totals.marginPct} />
      )}
    </>
  );

  return (
    <DocumentFormShell
      title="Nouvelle facture"
      description="Le stock sort de l’emplacement dès l’enregistrement. Le numéro de facture est attribué à ce moment-là."
      backTo="/factures"
      onSubmit={handleSubmit(onValid, onInvalid)}
      notice={showDraftBanner ? <DraftNotice onRestore={restoreDraft} onDiscard={discardDraft} /> : null}
      summary={summary}
      total={totals.total}
      submitLabel="Créer la facture"
      submittingLabel="Création de la facture…"
      submitting={submitting}
    >
      {/* Client */}
      <Card>
        <CardHeader>
          <CardTitle id={clientTitleId}>
            Client
            <RequiredMark />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Controller
            control={control}
            name="client"
            render={({ field, fieldState }) => (
              <TiersPicker
                ref={field.ref}
                id={ID.client}
                role="client"
                value={field.value}
                onChange={field.onChange}
                aria-labelledby={clientTitleId}
                {...fieldErrorProps(ID.client, fieldState.error)}
              />
            )}
          />
          <FieldError id={ID.client}>{errors.client?.message}</FieldError>
          {isComptoir && (
            <p className="text-sm text-muted-foreground">
              Vente au comptoir. Pour une facture au nom du client, choisissez-le ou créez-le.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Produits */}
      <Card>
        <CardHeader>
          <CardTitle>
            Produits
            <RequiredMark />
          </CardTitle>
          <CardDescription id={ID.searchHint}>
            Scannez un code-barres ou tapez au moins 2 caractères, puis Entrée pour ajouter le produit
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor={ID.search}>Ajouter un produit</Label>
            <ProductCombobox<SalesSearchProduct>
              id={ID.search}
              search={searchProducts}
              searchKey={selectedLocationId}
              onSelect={addProduit}
              describedBy={[ID.searchHint, lignesError ? `${ID.lignes}-error` : null].filter(Boolean).join(' ')}
              aria-invalid={lignesError ? true : undefined}
              getDisabledReason={saleDisabledReason}
              addedMessage={(p) => `${p.nom} ajouté à la facture.`}
              noResultsHint="Seuls les produits en stock sont proposés. Vérifiez l’orthographe ou le code-barres."
              renderOption={(p, { disabledReason }) => (
                <SalesProductOption product={p} stock={stock.stockOf(p.id, p.stock)} disabledReason={disabledReason} />
              )}
            />
            <FieldError id={ID.lignes}>{lignesError}</FieldError>
          </div>

          {/* Un seul magasin : rien ici, le récapitulatif le nomme. Plusieurs : la
              liste vient après la recherche, sans couper la consigne de son champ. */}
          <SalesLocationField
            id={ID.location}
            label="Emplacement de vente"
            locations={sales.locations}
            state={sales.state}
            error={sales.error}
            onRetry={() => void sales.reload()}
            value={selectedLocationId}
            onChange={(id) => setValue('location_id', id, { shouldDirty: true })}
          />
          {stock.state === 'error' && selectedLocationId && (
            <InlineNotice tone="warning" onRetry={() => void stock.reload()}>
              Stock de l’emplacement indisponible : les quantités affichées sont celles de tous les emplacements.
            </InlineNotice>
          )}

          <p role="status" className="sr-only">
            {lineAnnounce}
          </p>

          {/* La consigne est déjà sous le titre de la carte : l'état vide ne la répète pas. */}
          {fields.length === 0 ? (
            <div className="rounded-md bg-muted/40">
              <EmptyState compact icon={Package} title="Aucun produit sur la facture" />
            </div>
          ) : (
            <DocumentLines
              label="Lignes de la facture"
              columns={LINE_COLUMNS}
              rows={fields.map((field, i) => {
                const l = (lignes[i] ?? field) as LigneFacture;
                const lineErrors = errors.lignes?.[i];
                const net = netUnitPrice(l.prix_unitaire, l.remise_pct);
                const qty = Number.isFinite(l.quantite) ? l.quantite : 0;
                const lineTotal = qty * net;
                const marginAbs = qty * (net - l.prix_revient);
                const marginPct = net > 0 ? ((net - l.prix_revient) / net) * 100 : null;
                const belowCost = isBelowCost(l);
                const showStockHint = qty > l.stock_dispo && !lineErrors?.quantite;
                const priceChanged = Number.isFinite(l.prix_unitaire) && l.prix_unitaire !== l.prix_unitaire_default;
                const qtyDescribedBy =
                  [lineErrors?.quantite ? `${ID.quantite(i)}-error` : null, showStockHint ? ID.stock(i) : null]
                    .filter(Boolean)
                    .join(' ') || undefined;
                return {
                  key: field.id,
                  cells: {
                    produit: (
                      <>
                        <p className="font-medium">{l.produit_nom}</p>
                        {l.produit_reference && (
                          <DocumentCode className="block text-xs text-muted-foreground">{l.produit_reference}</DocumentCode>
                        )}
                        {showStockHint && (
                          <p id={ID.stock(i)} className="mt-1 flex items-start gap-1 text-xs text-warning-700">
                            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                            {insufficientStockMessage(l.stock_dispo)}
                          </p>
                        )}
                        {belowCost && (
                          <p className="mt-1 flex items-start gap-1 text-xs text-warning-700">
                            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                            {canSeeCost
                              ? 'Prix inférieur au prix de revient.'
                              : 'Prix inférieur au prix de revient : demandez l’accord d’un gérant avant d’enregistrer.'}
                          </p>
                        )}
                      </>
                    ),
                    quantite: (
                      <>
                        {/* −/+ sur les cartes (téléphone, gants) ; dans le tableau la saisie suffit et libère la place du total (GV-04). */}
                        <div className="flex items-center gap-1 group-data-[layout=table]/lines:justify-center">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-9 w-9 shrink-0 group-data-[layout=table]/lines:hidden"
                            aria-label={lineFieldLabel('Diminuer la quantité', l.produit_nom)}
                            disabled={qty <= 1}
                            onClick={() => setQuantity(i, Math.max(1, qty - 1))}
                          >
                            <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                          </Button>
                          <Controller
                            control={control}
                            name={`lignes.${i}.quantite`}
                            render={({ field: f }) => (
                              <NumericField
                                ref={f.ref}
                                id={ID.quantite(i)}
                                mode="integer"
                                value={f.value}
                                onValueChange={f.onChange}
                                onBlur={f.onBlur}
                                aria-label={lineFieldLabel('Quantité', l.produit_nom)}
                                aria-invalid={lineErrors?.quantite ? true : undefined}
                                aria-describedby={qtyDescribedBy}
                                className="h-9 w-14 px-2 text-center group-data-[layout=table]/lines:h-8"
                              />
                            )}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-9 w-9 shrink-0 group-data-[layout=table]/lines:hidden"
                            aria-label={lineFieldLabel('Augmenter la quantité', l.produit_nom)}
                            onClick={() => setQuantity(i, qty + 1)}
                          >
                            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                          </Button>
                        </div>
                        <FieldError id={ID.quantite(i)} className="group-data-[layout=table]/lines:max-w-[12rem] group-data-[layout=table]/lines:text-center">
                          {lineErrors?.quantite?.message}
                        </FieldError>
                      </>
                    ),
                    prix: (
                      <>
                        <Controller
                          control={control}
                          name={`lignes.${i}.prix_unitaire`}
                          render={({ field: f }) => (
                            <NumericField
                              ref={f.ref}
                              id={ID.prix(i)}
                              mode="decimal"
                              value={f.value}
                              onValueChange={f.onChange}
                              onBlur={f.onBlur}
                              aria-label={lineFieldLabel('Prix unitaire', l.produit_nom)}
                              {...fieldErrorProps(ID.prix(i), lineErrors?.prix_unitaire)}
                              containerClassName="w-full group-data-[layout=table]/lines:ms-auto group-data-[layout=table]/lines:w-32"
                              className="h-9 group-data-[layout=table]/lines:h-8"
                            />
                          )}
                        />
                        <FieldError id={ID.prix(i)}>{lineErrors?.prix_unitaire?.message}</FieldError>
                        {priceChanged && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Prix catalogue : <Money value={l.prix_unitaire_default} />
                          </p>
                        )}
                        {canSeeCost && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Prix de revient : <Money value={l.prix_revient} />
                          </p>
                        )}
                      </>
                    ),
                    remise: (
                      <>
                        <Controller
                          control={control}
                          name={`lignes.${i}.remise_pct`}
                          render={({ field: f }) => (
                            <NumericField
                              ref={f.ref}
                              id={ID.remise(i)}
                              mode="decimal"
                              suffix="%"
                              value={f.value}
                              onValueChange={f.onChange}
                              onBlur={f.onBlur}
                              aria-label={lineFieldLabel('Remise en %', l.produit_nom)}
                              {...fieldErrorProps(ID.remise(i), lineErrors?.remise_pct)}
                              containerClassName="w-full group-data-[layout=table]/lines:ms-auto group-data-[layout=table]/lines:w-20"
                              className="h-9 pr-7 group-data-[layout=table]/lines:h-8"
                            />
                          )}
                        />
                        <FieldError id={ID.remise(i)} className="group-data-[layout=table]/lines:max-w-[9rem]">
                          {lineErrors?.remise_pct?.message}
                        </FieldError>
                      </>
                    ),
                    total: (
                      <>
                        <Money value={lineTotal} className="font-medium" />
                        {canSeeCost && marginPct !== null && (
                          <span
                            className={cn(
                              'mt-1 block text-xs',
                              marginAbs < 0 ? 'font-medium text-danger-700' : 'text-muted-foreground'
                            )}
                          >
                            Marge {formatPercent(marginPct, 1)}
                          </span>
                        )}
                      </>
                    ),
                    retirer: (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-muted-foreground hover:text-danger-700 group-data-[layout=table]/lines:h-8 group-data-[layout=table]/lines:w-8"
                        aria-label={`Retirer ${l.produit_nom} de la facture`}
                        title="Retirer de la facture"
                        onClick={() => removeLigne(i)}
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    ),
                  },
                };
              })}
            />
          )}
        </CardContent>
      </Card>

      {/* Notes */}
      <Card>
        <CardHeader>
          <CardTitle>
            <Label htmlFor={ID.notes} className="text-base">
              Notes
            </Label>
          </CardTitle>
          <CardDescription>Facultatif. Notes internes : elles ne sont pas imprimées sur la facture.</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea id={ID.notes} rows={3} {...register('notes')} />
        </CardContent>
      </Card>
    </DocumentFormShell>
  );
}
