import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm, useFieldArray, useWatch, Controller, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { AlertTriangle, Package, X } from 'lucide-react';
import { devisService, tiersService, ventesService } from '@/services/api';
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
import { PageShell } from '@/components/ui/page-shell';
import { PageLoading } from '@/components/ui/loading';
import { QueryErrorState } from '@/components/ui/query-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
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
import { formatDate, formatNumber, formatPercent, toNumber } from '@/utils/format';
import {
  computeSalesTotals,
  getValidSalePrice,
  isBelowCost,
  saleDisabledReason,
} from '@/utils/salesPrice';
import { SALES_MESSAGES as M, lineFieldLabel, plural } from '@/validation/salesForms';

const ligneSchema = z.object({
  produit_id: z.number(),
  produit_nom: z.string(),
  produit_reference: z.string(),
  quantite: z.number({ error: M.quantity }).int(M.quantityInteger).min(1, M.quantity),
  prix_unitaire: z.number({ error: M.price }).positive(M.price),
  prix_revient: z.number(),
  stock_dispo: z.number(),
});

const devisSchema = z.object({
  client: z.custom<TiersPickerValue | null>((v) => v != null, { error: M.clientRequired }),
  location_id: z.number().nullable(),
  date_validite: z.string(),
  notes: z.string(),
  lignes: z.array(ligneSchema).min(1, M.linesRequired),
});

type DevisFormValues = z.infer<typeof devisSchema>;
type LigneDevis = z.infer<typeof ligneSchema>;

/** Ligne de devis renvoyée par `GET /devis/:id`. */
interface DevisLigneApi {
  produit_id: number;
  produit_nom?: string | null;
  produit_reference?: string | null;
  reference?: string | null;
  description?: string | null;
  quantite: number | string;
  prix_unitaire: number | string;
  prix_revient?: number | string | null;
}

const ID = {
  client: 'devis-client',
  search: 'devis-produit-search',
  searchHint: 'devis-produit-aide',
  lignes: 'devis-lignes',
  location: 'devis-location',
  validite: 'devis-validite',
  validiteHint: 'devis-validite-aide',
  notes: 'devis-notes',
  quantite: (i: number) => `devis-ligne-${i}-quantite`,
  prix: (i: number) => `devis-ligne-${i}-prix`,
};

/** Colonnes des lignes : tableau quand la colonne du formulaire a la place, cartes sinon (`DocumentLines`). */
const LINE_COLUMNS: DocumentLineColumn[] = [
  { id: 'produit', header: 'Produit', mobile: 'title', cellClassName: 'min-w-[11rem]' },
  { id: 'quantite', header: 'Quantité', mobile: 'field', headClassName: 'text-right', cellClassName: 'text-right' },
  {
    id: 'prix',
    header: 'Prix unitaire',
    mobile: 'field',
    headClassName: 'text-right',
    cellClassName: 'min-w-[9rem] text-right',
  },
  { id: 'stock', header: 'Stock', numeric: true, mobile: 'field', mobileAlign: 'start' },
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

function firstErrorId(errors: FieldErrors<DevisFormValues>, lineCount: number): string | null {
  if (errors.client) return ID.client;
  for (let i = 0; i < lineCount; i++) {
    const le = errors.lignes?.[i];
    if (le?.quantite) return ID.quantite(i);
    if (le?.prix_unitaire) return ID.prix(i);
  }
  if (errors.lignes?.message || errors.lignes?.root?.message) return ID.search;
  return null;
}

function focusById(id: string | null) {
  if (!id) return;
  window.setTimeout(() => document.getElementById(id)?.focus(), 0);
}

function clientName(c: TiersPickerValue): string {
  return `${c.raison_sociale}${c.prenom ? ` ${c.prenom}` : ''}`;
}

/** Date `yyyy-MM-dd` d'une valeur d'API (date seule ou horodatage). */
function toDateInput(value: unknown): string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : '';
}

/** Sans date choisie, le serveur rend le devis valable 30 jours à partir de sa création. */
const DEFAULT_VALIDITY_DAYS = 30;

function defaultValidityDate(): Date {
  const d = new Date();
  d.setDate(d.getDate() + DEFAULT_VALIDITY_DAYS);
  return d;
}

const EMPTY_VALUES: DevisFormValues = {
  client: null,
  location_id: null,
  date_validite: '',
  notes: '',
  lignes: [],
};

export default function NouveauDevis() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const auth = useOptionalAuth();
  const canSeeCost = !!auth?.hasRole('admin', 'manager');
  const clientTitleId = useId();

  const [submitting, setSubmitting] = useState(false);
  const [lineAnnounce, setLineAnnounce] = useState('');
  const [editState, setEditState] = useState<'idle' | 'loading' | 'ready' | 'error'>(isEdit ? 'loading' : 'idle');
  const [editError, setEditError] = useState<unknown>(null);
  const [numeroDevis, setNumeroDevis] = useState<string | null>(null);

  const {
    control,
    register,
    handleSubmit,
    setValue,
    getValues,
    watch,
    reset,
    formState: { errors, isDirty, isSubmitted },
  } = useForm<DevisFormValues>({
    resolver: zodResolver(devisSchema),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    shouldFocusError: false,
    defaultValues: EMPTY_VALUES,
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'lignes' });

  // --- Brouillon (création seulement) ------------------------------------------
  const { draft, save, clear, hasDraft } = useDraft<DevisFormValues>('devis:new');
  const [showDraftBanner, setShowDraftBanner] = useState(
    () => !isEdit && hasDraft && Array.isArray(draft?.lignes) && draft.lignes.length > 0
  );

  useEffect(() => {
    if (isEdit) return;
    const sub = watch((values, { name, type }) => {
      if (type === 'change' || name?.startsWith('lignes')) save(values as DevisFormValues);
    });
    return () => sub.unsubscribe();
  }, [watch, save, isEdit]);

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
  const dateValidite = useWatch({ control, name: 'date_validite' });
  const watchedLignes = useWatch({ control, name: 'lignes' });
  const lignes = useMemo(() => (watchedLignes ?? []) as LigneDevis[], [watchedLignes]);

  const sales = useSalesLocations((list) =>
    setValue('location_id', defaultLocationId(list, getValues('location_id')))
  );
  const stock = useLocationStock(selectedLocationId);

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

  // --- Modification : chargement du devis -------------------------------------
  const loadDevis = useCallback(async () => {
    if (!id) return;
    setEditState('loading');
    setEditError(null);
    try {
      const devis = await devisService.getById(Number(id));
      const tiers = devis?.tiers_id ? await tiersService.getById(devis.tiers_id) : null;
      const lignesApi: DevisLigneApi[] = Array.isArray(devis?.lignes) ? devis.lignes : [];
      reset({
        client: tiers ?? null,
        location_id: devis?.location_id ?? getValues('location_id'),
        date_validite: toDateInput(devis?.date_validite),
        notes: devis?.notes ?? '',
        lignes: lignesApi.map((l) => ({
          produit_id: Number(l.produit_id),
          produit_nom: l.produit_nom || l.description || '',
          produit_reference: l.produit_reference || l.reference || '',
          quantite: toNumber(l.quantite) ?? 1,
          prix_unitaire: toNumber(l.prix_unitaire) ?? 0,
          prix_revient: toNumber(l.prix_revient ?? null) ?? 0,
          stock_dispo: 0,
        })),
      });
      setNumeroDevis(devis?.numero_devis ?? null);
      setEditState('ready');
      window.setTimeout(syncLineStock, 0);
    } catch (err) {
      setEditError(err);
      setEditState('error');
    }
    // Rechargé seulement quand on change de devis.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    void loadDevis();
  }, [loadDevis]);

  // --- Produits ----------------------------------------------------------------
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
      // Même produit scanné deux fois : une unité de plus, comme sur la facture.
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
        prix_revient: toNumber(p.prix_achat) ?? 0,
        stock_dispo: stock.stockOf(p.id, p.stock),
      },
      { shouldFocus: false }
    );
  };

  const removeLigne = (index: number) => {
    const nom = getValues(`lignes.${index}.produit_nom`);
    remove(index);
    setLineAnnounce(`${nom} retiré du devis.`);
    document.getElementById(ID.search)?.focus();
  };

  const totals = useMemo(() => computeSalesTotals(lignes), [lignes]);

  // --- Envoi -------------------------------------------------------------------
  const onInvalid = (errs: FieldErrors<DevisFormValues>) => focusById(firstErrorId(errs, fields.length));

  const onValid = async (values: DevisFormValues) => {
    if (!values.client) return;
    // Le serveur lit `date_validite` (le champ `valid_until` envoyé jusqu'ici
    // était ignoré : la date choisie ne s'enregistrait jamais).
    const payload: Parameters<typeof devisService.create>[0] = {
      tiers_id: values.client.id,
      location_id: values.location_id ?? undefined,
      lignes: values.lignes.map((l) => ({
        produit_id: l.produit_id,
        quantite: l.quantite,
        prix_unitaire: l.prix_unitaire,
      })),
      date_validite: values.date_validite || undefined,
      notes: values.notes.trim() || undefined,
    };
    setSubmitting(true);
    try {
      if (isEdit && id) {
        await devisService.update(Number(id), payload);
        toast.success(numeroDevis ? `Devis ${numeroDevis} enregistré` : 'Devis enregistré');
        navigate(`/devis/${id}`, { replace: true });
      } else {
        const result = await devisService.create(payload);
        clear();
        toast.success(result?.numero_devis ? `Devis ${result.numero_devis} créé` : 'Devis créé');
        navigate(result?.id ? `/devis/${result.id}` : '/devis', { replace: true, state: { justCreated: true } });
      }
    } catch (error) {
      toast.error(getErrorMessage(error, 'Impossible d’enregistrer le devis. Réessayez.'));
      setSubmitting(false);
    }
  };

  const restoreDraft = () => {
    if (draft) {
      reset(
        {
          client: draft.client ?? null,
          location_id: draft.location_id ?? getValues('location_id'),
          date_validite: draft.date_validite ?? '',
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

  // --- Rendu -------------------------------------------------------------------
  const pageTitle = isEdit ? (numeroDevis ? `Modifier le devis ${numeroDevis}` : 'Modifier le devis') : 'Nouveau devis';
  const backTo = isEdit && id ? `/devis/${id}` : '/devis';

  if (isEdit && editState !== 'ready') {
    return (
      <PageShell title={pageTitle} backTo={backTo} width="wide">
        {editState === 'error' ? (
          <Card>
            <QueryErrorState
              error={editError}
              title="Impossible de charger le devis"
              onRetry={() => void loadDevis()}
            />
          </Card>
        ) : (
          <PageLoading message="Chargement du devis…" />
        )}
      </PageShell>
    );
  }

  const location = sales.locations.find((l) => l.id === selectedLocationId) ?? null;
  const lignesError = errors.lignes?.message ?? errors.lignes?.root?.message;

  const summary = (
    <>
      <SummaryList>
        <SummaryItem label="Client">
          {client ? clientName(client) : <span className="font-normal text-muted-foreground">Non choisi</span>}
        </SummaryItem>
        {location && <SummaryItem label="Emplacement">{location.nom}</SummaryItem>}
        {/* Sans date choisie : la date que le serveur appliquera, atténuée. */}
        <SummaryItem label="Valable jusqu’au">
          {dateValidite ? (
            formatDate(dateValidite)
          ) : (
            <span className="font-normal text-muted-foreground">{isEdit ? '—' : formatDate(defaultValidityDate())}</span>
          )}
        </SummaryItem>
        <SummaryItem label="Produits" numeric>
          {totals.lines === 0
            ? '—'
            : `${plural(totals.lines, 'ligne', 'lignes')} · ${plural(totals.units, 'unité', 'unités')}`}
        </SummaryItem>
      </SummaryList>
      <DocumentTotals
        className="mt-0 w-full pt-2 sm:w-full"
        aria-label="Total du devis"
        total={{ label: 'Total', value: totals.total }}
      />
      {/* Marge seulement une fois une ligne saisie : « 0 FCFA » de marge sur un devis vide ne dit rien. */}
      {canSeeCost && totals.lines > 0 && (
        <MarginSummary margin={totals.margin} cost={totals.cost} marginPct={totals.marginPct} />
      )}
    </>
  );

  return (
    <DocumentFormShell
      title={pageTitle}
      description="Le devis ne bloque pas le stock. Confirmez-le ensuite pour créer le bon de livraison."
      backTo={backTo}
      backLabel={isEdit ? (numeroDevis ? `Devis ${numeroDevis}` : 'Devis') : undefined}
      onSubmit={handleSubmit(onValid, onInvalid)}
      notice={showDraftBanner ? <DraftNotice onRestore={restoreDraft} onDiscard={discardDraft} /> : null}
      summary={summary}
      total={totals.total}
      submitLabel={isEdit ? 'Enregistrer le devis' : 'Créer le devis'}
      submittingLabel={isEdit ? 'Enregistrement du devis…' : 'Création du devis…'}
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
        <CardContent>
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
              addedMessage={(p) => `${p.nom} ajouté au devis.`}
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
            onChange={(locationId) => setValue('location_id', locationId, { shouldDirty: true })}
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
              <EmptyState compact icon={Package} title="Aucun produit sur le devis" />
            </div>
          ) : (
            <DocumentLines
              label="Lignes du devis"
              columns={LINE_COLUMNS}
              rows={fields.map((field, index) => {
                const l = (lignes[index] ?? field) as LigneDevis;
                const lineErrors = errors.lignes?.[index];
                const qty = Number.isFinite(l.quantite) ? l.quantite : 0;
                const price = Number.isFinite(l.prix_unitaire) ? l.prix_unitaire : 0;
                const lineTotal = qty * price;
                const marginAbs = qty * (price - l.prix_revient);
                const marginPct = price > 0 ? ((price - l.prix_revient) / price) * 100 : null;
                const belowCost = isBelowCost(l);
                const overstock = qty > l.stock_dispo;
                return {
                  key: field.id,
                  cells: {
                    produit: (
                      <>
                        <p className="font-medium">{l.produit_nom}</p>
                        {l.produit_reference && (
                          <DocumentCode className="block text-xs text-muted-foreground">{l.produit_reference}</DocumentCode>
                        )}
                        {overstock && (
                          <p className="mt-1 flex items-start gap-1 text-xs text-warning-700">
                            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                            Stock insuffisant dans cet emplacement pour le livrer aujourd’hui.
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
                        <Controller
                          control={control}
                          name={`lignes.${index}.quantite`}
                          render={({ field: f }) => (
                            <NumericField
                              ref={f.ref}
                              id={ID.quantite(index)}
                              mode="integer"
                              value={f.value}
                              onValueChange={f.onChange}
                              onBlur={f.onBlur}
                              aria-label={lineFieldLabel('Quantité', l.produit_nom)}
                              {...fieldErrorProps(ID.quantite(index), lineErrors?.quantite)}
                              containerClassName="w-full group-data-[layout=table]/lines:ms-auto group-data-[layout=table]/lines:w-20"
                              className="h-9 group-data-[layout=table]/lines:h-8"
                            />
                          )}
                        />
                        <FieldError id={ID.quantite(index)} className="group-data-[layout=table]/lines:max-w-[10rem]">
                          {lineErrors?.quantite?.message}
                        </FieldError>
                      </>
                    ),
                    prix: (
                      <>
                        <Controller
                          control={control}
                          name={`lignes.${index}.prix_unitaire`}
                          render={({ field: f }) => (
                            <NumericField
                              ref={f.ref}
                              id={ID.prix(index)}
                              mode="decimal"
                              value={f.value}
                              onValueChange={f.onChange}
                              onBlur={f.onBlur}
                              aria-label={lineFieldLabel('Prix unitaire', l.produit_nom)}
                              {...fieldErrorProps(ID.prix(index), lineErrors?.prix_unitaire)}
                              containerClassName="w-full group-data-[layout=table]/lines:ms-auto group-data-[layout=table]/lines:w-32"
                              className="h-9 group-data-[layout=table]/lines:h-8"
                            />
                          )}
                        />
                        <FieldError id={ID.prix(index)}>{lineErrors?.prix_unitaire?.message}</FieldError>
                        {canSeeCost && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Prix de revient : <Money value={l.prix_revient} />
                          </p>
                        )}
                      </>
                    ),
                    stock: (
                      <span className={overstock ? 'font-medium text-warning-700' : undefined}>
                        {formatNumber(l.stock_dispo)}
                      </span>
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
                        aria-label={`Retirer ${l.produit_nom} du devis`}
                        title="Retirer du devis"
                        onClick={() => removeLigne(index)}
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

      {/* Informations complémentaires : la validité */}
      <Card>
        <CardHeader>
          <CardTitle>Informations complémentaires</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-w-sm space-y-1.5">
            <Label htmlFor={ID.validite}>Date de validité</Label>
            <Controller
              control={control}
              name="date_validite"
              render={({ field }) => (
                <DatePicker
                  id={ID.validite}
                  value={field.value}
                  onChange={field.onChange}
                  aria-describedby={ID.validiteHint}
                />
              )}
            />
            <p id={ID.validiteHint} className="text-xs text-muted-foreground">
              Sans date, le devis est valable {DEFAULT_VALIDITY_DAYS} jours
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Notes : leur propre carte, comme sur la facture, le bon de livraison et l'avoir. */}
      <Card>
        <CardHeader>
          <CardTitle>
            <Label htmlFor={ID.notes} className="text-base">
              Notes
            </Label>
          </CardTitle>
          <CardDescription>Facultatif</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea id={ID.notes} rows={3} {...register('notes')} />
        </CardContent>
      </Card>
    </DocumentFormShell>
  );
}
