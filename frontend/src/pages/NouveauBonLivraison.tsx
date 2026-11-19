import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, useFieldArray, useWatch, Controller, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Package, RotateCcw, X } from 'lucide-react';
import { bonLivraisonService, devisService, produitService, tiersService } from '@/services/api';
import { DocumentPicker, type DocumentOption, type DocumentPickerHandle } from '@/components/DocumentPicker';
import { TiersPicker, type TiersPickerValue } from '@/components/TiersPicker';
import { ProductCombobox } from '@/components/ProductCombobox';
import { NumericField } from '@/components/NumericField';
import { DocumentLines, type DocumentLineColumn } from '@/components/DocumentLines';
import { DocumentFormShell, DraftNotice, SummaryItem, SummaryList } from '@/components/DocumentFormShell';
import { InlineNotice, SalesProductOption, type SalesSearchProduct } from '@/components/SalesFormParts';
import { useDraft } from '@/hooks/useDraft';
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
import { getErrorMessage } from '@/utils/errors';
import { toNumber } from '@/utils/format';
import { getValidSalePrice, saleDisabledReason } from '@/utils/salesPrice';
import { SALES_MESSAGES as M, lineFieldLabel, plural } from '@/validation/salesForms';

const ligneSchema = z.object({
  produit_id: z.number(),
  produit_nom: z.string(),
  produit_reference: z.string(),
  quantite_commandee: z.number({ error: M.quantity }).int(M.quantityInteger).min(1, M.quantity),
  quantite_livree: z
    .number({ error: M.deliveredQuantity })
    .int(M.quantityInteger)
    .min(0, M.deliveredQuantity),
  prix_unitaire: z.number({ error: M.price }).positive(M.price),
});

const CLIENT_MISSING = 'Le client du devis n’a pas pu être chargé : choisissez à nouveau le devis.';

const blSchema = z.object({
  devis: z.custom<DocumentOption | null>((v) => v != null, { error: M.devisRequired }),
  tiers: z.custom<TiersPickerValue | null>((v) => v != null, { error: CLIENT_MISSING }),
  notes: z.string(),
  lignes: z.array(ligneSchema).min(1, M.linesRequired),
});

type BLFormValues = z.infer<typeof blSchema>;
type LigneBL = z.infer<typeof ligneSchema>;

/** Ligne de devis (`GET /devis/:id`). */
interface DevisLigneApi {
  produit_id: number | null;
  produit_nom?: string | null;
  produit_reference?: string | null;
  description?: string | null;
  quantite: number | string;
  prix_unitaire: number | string;
}

const ID = {
  devis: 'bl-devis',
  devisHint: 'bl-devis-aide',
  search: 'bl-produit-search',
  searchHint: 'bl-produit-aide',
  lignes: 'bl-lignes',
  notes: 'bl-notes',
  commandee: (i: number) => `bl-ligne-${i}-quantite-commandee`,
  livree: (i: number) => `bl-ligne-${i}-quantite-livree`,
  prix: (i: number) => `bl-ligne-${i}-prix`,
};

/** Colonnes des lignes : tableau quand la colonne du formulaire a la place, cartes sinon (`DocumentLines`). */
const LINE_COLUMNS: DocumentLineColumn[] = [
  { id: 'produit', header: 'Produit', mobile: 'title', cellClassName: 'min-w-[10rem]' },
  { id: 'commandee', header: 'Qté commandée', mobile: 'field', headClassName: 'text-right', cellClassName: 'text-right' },
  { id: 'livree', header: 'Qté livrée', mobile: 'field', headClassName: 'text-right', cellClassName: 'text-right' },
  {
    id: 'prix',
    header: 'Prix unitaire',
    mobile: 'field',
    headClassName: 'text-right',
    cellClassName: 'text-right',
  },
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

function firstErrorId(errors: FieldErrors<BLFormValues>, lineCount: number): string | null {
  for (let i = 0; i < lineCount; i++) {
    const le = errors.lignes?.[i];
    if (le?.quantite_commandee) return ID.commandee(i);
    if (le?.quantite_livree) return ID.livree(i);
    if (le?.prix_unitaire) return ID.prix(i);
  }
  if (errors.lignes?.message || errors.lignes?.root?.message) return ID.search;
  return null;
}

function focusById(id: string | null) {
  if (!id) return;
  window.setTimeout(() => document.getElementById(id)?.focus(), 0);
}

const searchDevisConfirmes = async (q: string): Promise<DocumentOption[]> => {
  const res = await devisService.getAll(q, 'accepte', 1, 10);
  const rows: Array<Record<string, unknown>> = res?.data ?? [];
  return rows.map((d) => ({
    id: Number(d.id),
    numero: String(d.numero_devis ?? ''),
    tiers_nom: `${d.client_nom ?? ''} ${d.client_prenom ?? ''}`.trim() || null,
    montant: (d.montant_total ?? d.total ?? null) as number | string | null,
    date: (d.date_devis as string | null) ?? null,
    statut: (d.statut as string | null) ?? null,
  }));
};

const searchProducts = async (q: string): Promise<SalesSearchProduct[]> => {
  const rows = await produitService.searchFuzzy(q, 10, 0.1);
  return Array.isArray(rows) ? (rows as SalesSearchProduct[]) : [];
};

function toLines(lignes: DevisLigneApi[]): LigneBL[] {
  return lignes
    .filter((l) => l.produit_id != null)
    .map((l) => {
      const qty = toNumber(l.quantite) ?? 1;
      return {
        produit_id: Number(l.produit_id),
        produit_nom: l.produit_nom || l.description || '',
        produit_reference: l.produit_reference || '',
        quantite_commandee: qty,
        quantite_livree: qty,
        prix_unitaire: toNumber(l.prix_unitaire) ?? 0,
      };
    });
}

export default function NouveauBonLivraison() {
  const navigate = useNavigate();
  const devisTitleId = useId();
  const [submitting, setSubmitting] = useState(false);
  const [lineAnnounce, setLineAnnounce] = useState('');
  const [devisLines, setDevisLines] = useState<LigneBL[] | null>(null);
  const [devisState, setDevisState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [devisError, setDevisError] = useState<unknown>(null);
  const devisSeq = useRef(0);
  const devisPickerRef = useRef<DocumentPickerHandle>(null);

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
  } = useForm<BLFormValues>({
    resolver: zodResolver(blSchema),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    shouldFocusError: false,
    defaultValues: { devis: null, tiers: null, notes: '', lignes: [] },
  });

  const { fields, append, remove, replace } = useFieldArray({ control, name: 'lignes' });

  // --- Brouillon ------------------------------------------------------------------
  const { draft, save, clear, hasDraft } = useDraft<BLFormValues>('bl:new');
  const [showDraftBanner, setShowDraftBanner] = useState(
    () => hasDraft && (Array.isArray(draft?.lignes) && draft.lignes.length > 0)
  );

  useEffect(() => {
    const sub = watch((values, { name, type }) => {
      if (type === 'change' || name?.startsWith('lignes') || name === 'devis') save(values as BLFormValues);
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

  const devis = useWatch({ control, name: 'devis' });
  const tiers = useWatch({ control, name: 'tiers' });
  const watchedLignes = useWatch({ control, name: 'lignes' });
  const lignes = useMemo(() => (watchedLignes ?? []) as LigneBL[], [watchedLignes]);

  // --- Devis d'origine : il fixe le client et propose ses lignes -------------------
  const loadDevis = async (doc: DocumentOption) => {
    const seq = ++devisSeq.current;
    setDevisState('loading');
    setDevisError(null);
    try {
      const detail = await devisService.getById(doc.id);
      const client = detail?.tiers_id ? await tiersService.getById(detail.tiers_id) : null;
      if (seq !== devisSeq.current) return;
      const lines = toLines(Array.isArray(detail?.lignes) ? detail.lignes : []);
      setValue('tiers', client ?? null, { shouldValidate: isSubmitted });
      setDevisLines(lines);
      if (getValues('lignes').length === 0 && lines.length > 0) replace(lines);
      setDevisState('ready');
    } catch (err) {
      if (seq !== devisSeq.current) return;
      setValue('tiers', null);
      setDevisError(err);
      setDevisState('error');
    }
  };

  const onDevisChange = (doc: DocumentOption | null) => {
    setValue('devis', doc, { shouldDirty: true, shouldValidate: isSubmitted });
    if (doc) {
      void loadDevis(doc);
    } else {
      devisSeq.current += 1;
      setValue('tiers', null);
      setDevisLines(null);
      setDevisState('idle');
    }
  };

  // Brouillon restauré : on recharge le devis pour retrouver ses lignes.
  const restoreDraft = () => {
    if (draft) {
      reset(
        {
          devis: draft.devis ?? null,
          tiers: draft.tiers ?? null,
          notes: draft.notes ?? '',
          lignes: Array.isArray(draft.lignes) ? draft.lignes : [],
        },
        { keepDefaultValues: true }
      );
      if (draft.devis) void loadDevis(draft.devis);
    }
    setShowDraftBanner(false);
  };

  const discardDraft = () => {
    clear();
    setShowDraftBanner(false);
  };

  // --- Produits --------------------------------------------------------------------
  const addProduit = (p: SalesSearchProduct) => {
    const prixVente = getValidSalePrice(p.prix_vente);
    if (prixVente === null) return;
    const current = getValues('lignes');
    const existing = current.findIndex((l) => l.produit_id === p.id);
    if (existing >= 0) {
      // Même produit scanné deux fois : une unité de plus, commandée et livrée.
      const line = current[existing];
      const inc = (n: number) => (Number.isFinite(n) ? n : 0) + 1;
      setValue(`lignes.${existing}.quantite_commandee`, inc(line.quantite_commandee), { shouldDirty: true });
      setValue(`lignes.${existing}.quantite_livree`, inc(line.quantite_livree), {
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
        quantite_commandee: 1,
        quantite_livree: 1,
        prix_unitaire: prixVente,
      },
      { shouldFocus: false }
    );
  };

  const removeLigne = (index: number) => {
    const nom = getValues(`lignes.${index}.produit_nom`);
    remove(index);
    setLineAnnounce(`${nom} retiré du bon de livraison.`);
    document.getElementById(ID.search)?.focus();
  };

  const totals = useMemo(() => {
    let total = 0;
    let units = 0;
    for (const l of lignes) {
      const livree = Number.isFinite(l.quantite_livree) ? l.quantite_livree : 0;
      total += livree * (Number.isFinite(l.prix_unitaire) ? l.prix_unitaire : 0);
      units += livree;
    }
    return { total, units, lines: lignes.length };
  }, [lignes]);

  // --- Envoi -----------------------------------------------------------------------
  const onInvalid = (errs: FieldErrors<BLFormValues>) => {
    // Devis absent (ou client du devis non chargé) : focus sur le sélecteur de devis.
    if (errs.devis || errs.tiers) {
      window.setTimeout(() => devisPickerRef.current?.focus(), 0);
      return;
    }
    focusById(firstErrorId(errs, fields.length));
  };

  const onValid = async (values: BLFormValues) => {
    const over = values.lignes.flatMap((l, i) => (l.quantite_livree > l.quantite_commandee ? [i] : []));
    if (over.length > 0) {
      for (const i of over) {
        setError(`lignes.${i}.quantite_livree`, { type: 'max', message: M.deliveredOverOrdered });
      }
      focusById(ID.livree(over[0]));
      return;
    }
    if (!values.devis || !values.tiers) return;
    setSubmitting(true);
    try {
      const result = await bonLivraisonService.create({
        tiers_id: values.tiers.id,
        devis_id: values.devis.id,
        lignes: values.lignes.map((l) => ({
          produit_id: l.produit_id,
          quantite_commandee: l.quantite_commandee,
          quantite_livree: l.quantite_livree,
          prix_unitaire: l.prix_unitaire,
        })),
        notes: values.notes.trim() || undefined,
      });
      clear();
      toast.success(result?.numero_bl ? `Bon de livraison ${result.numero_bl} créé` : 'Bon de livraison créé');
      navigate(result?.id ? `/bons-livraison/${result.id}` : '/bons-livraison', {
        replace: true,
        state: { justCreated: true },
      });
    } catch (error) {
      toast.error(getErrorMessage(error, 'Impossible de créer le bon de livraison. Réessayez.'));
      setSubmitting(false);
    }
  };

  // --- Rendu ------------------------------------------------------------------------
  const lignesError = errors.lignes?.message ?? errors.lignes?.root?.message;
  const devisFieldError = errors.devis?.message ?? (devis ? undefined : errors.tiers?.message);

  const summary = (
    <>
      <SummaryList>
        <SummaryItem label="Devis">
          {devis ? (
            <DocumentCode className="font-normal">{devis.numero}</DocumentCode>
          ) : (
            <span className="font-normal text-muted-foreground">Non choisi</span>
          )}
        </SummaryItem>
        {/* « Repris du devis » est dit une fois, sous le titre « Devis d’origine ». */}
        <SummaryItem label="Client">
          {tiers ? (
            `${tiers.raison_sociale}${tiers.prenom ? ` ${tiers.prenom}` : ''}`
          ) : (
            <span className="font-normal text-muted-foreground">—</span>
          )}
        </SummaryItem>
        <SummaryItem label="Produits" numeric>
          {totals.lines === 0
            ? '—'
            : `${plural(totals.lines, 'ligne', 'lignes')} · ${plural(totals.units, 'unité livrée', 'unités livrées')}`}
        </SummaryItem>
      </SummaryList>
      <DocumentTotals
        className="mt-0 w-full pt-2 sm:w-full"
        aria-label="Total du bon de livraison"
        total={{ label: 'Total', value: totals.total }}
      />
    </>
  );

  return (
    <DocumentFormShell
      title="Nouveau bon de livraison"
      description="Le stock sort du magasin quand le bon est marqué livré, pas à sa création"
      backTo="/bons-livraison"
      onSubmit={handleSubmit(onValid, onInvalid)}
      notice={showDraftBanner ? <DraftNotice onRestore={restoreDraft} onDiscard={discardDraft} /> : null}
      summary={summary}
      total={totals.total}
      submitLabel="Créer le bon de livraison"
      submittingLabel="Création du bon de livraison…"
      submitting={submitting}
    >
      {/* Devis d'origine + client */}
      <Card>
        <CardHeader>
          <CardTitle id={devisTitleId}>
            Devis d’origine
            <RequiredMark />
          </CardTitle>
          <CardDescription id={ID.devisHint}>
            Choisissez le devis confirmé à livrer : son client et ses produits sont repris
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Controller
              control={control}
              name="devis"
              render={({ field }) => (
                <DocumentPicker
                  ref={devisPickerRef}
                  inputId={ID.devis}
                  value={field.value}
                  onChange={onDevisChange}
                  search={searchDevisConfirmes}
                  placeholder="Numéro ou client"
                  changeLabel="Changer de devis"
                  aria-labelledby={devisTitleId}
                  {...fieldErrorProps(ID.devis, devisFieldError)}
                  // La consigne complète (« devis confirmé à livrer ») reste lue avec le champ.
                  aria-describedby={[ID.devisHint, devisFieldError ? `${ID.devis}-error` : null]
                    .filter(Boolean)
                    .join(' ')}
                />
              )}
            />
            <FieldError id={ID.devis}>{devisFieldError}</FieldError>
          </div>

          {devisState === 'error' && devis && (
            <InlineNotice tone="danger" onRetry={() => void loadDevis(devis)}>
              {getErrorMessage(devisError, 'Impossible de charger le devis choisi.')}
            </InlineNotice>
          )}

          {/* Le client n'apparaît qu'une fois repris du devis : avant, la carte
              redisait « Repris du devis » sous la consigne qui le dit déjà. */}
          {tiers && (
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Client</p>
              <TiersPicker role="client" value={tiers} onChange={() => undefined} disabled />
            </div>
          )}
          {devis && !tiers && <FieldError id="bl-tiers">{errors.tiers?.message}</FieldError>}
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
            Les lignes du devis sont reprises ; ajustez les quantités livrées ou ajoutez un produit
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1 space-y-1.5">
              <Label htmlFor={ID.search}>Ajouter un produit</Label>
              <ProductCombobox<SalesSearchProduct>
                id={ID.search}
                search={searchProducts}
                onSelect={addProduit}
                describedBy={[ID.searchHint, lignesError ? `${ID.lignes}-error` : null].filter(Boolean).join(' ')}
                aria-invalid={lignesError ? true : undefined}
                getDisabledReason={saleDisabledReason}
                addedMessage={(p) => `${p.nom} ajouté au bon de livraison.`}
                noResultsHint="Vérifiez l’orthographe ou le code-barres."
                renderOption={(p, { disabledReason }) => (
                  <SalesProductOption product={p} stock={null} disabledReason={disabledReason} />
                )}
              />
            </div>
            {devisLines && devisLines.length > 0 && (
              <Button type="button" variant="outline" className="shrink-0" onClick={() => replace(devisLines)}>
                <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
                Reprendre les lignes du devis
              </Button>
            )}
          </div>
          <FieldError id={ID.lignes}>{lignesError}</FieldError>

          <p role="status" className="sr-only">
            {lineAnnounce}
          </p>

          {/* Les consignes sont déjà sous les titres des cartes : l'état vide ne les répète pas. */}
          {fields.length === 0 ? (
            <div className="rounded-md bg-muted/40">
              <EmptyState compact icon={Package} title="Aucun produit sur le bon de livraison" />
            </div>
          ) : (
            <DocumentLines
              label="Lignes du bon de livraison"
              columns={LINE_COLUMNS}
              rows={fields.map((field, index) => {
                const l = (lignes[index] ?? field) as LigneBL;
                const lineErrors = errors.lignes?.[index];
                const livree = Number.isFinite(l.quantite_livree) ? l.quantite_livree : 0;
                const price = Number.isFinite(l.prix_unitaire) ? l.prix_unitaire : 0;
                return {
                  key: field.id,
                  cells: {
                    produit: (
                      <>
                        <p className="font-medium">{l.produit_nom}</p>
                        {l.produit_reference && (
                          <DocumentCode className="block text-xs text-muted-foreground">{l.produit_reference}</DocumentCode>
                        )}
                      </>
                    ),
                    commandee: (
                      <>
                        <Controller
                          control={control}
                          name={`lignes.${index}.quantite_commandee`}
                          render={({ field: f }) => (
                            <NumericField
                              ref={f.ref}
                              id={ID.commandee(index)}
                              mode="integer"
                              value={f.value}
                              onValueChange={f.onChange}
                              onBlur={f.onBlur}
                              aria-label={lineFieldLabel('Quantité commandée', l.produit_nom)}
                              {...fieldErrorProps(ID.commandee(index), lineErrors?.quantite_commandee)}
                              containerClassName="w-full group-data-[layout=table]/lines:ms-auto group-data-[layout=table]/lines:w-16"
                              className="h-9 group-data-[layout=table]/lines:h-8"
                            />
                          )}
                        />
                        <FieldError id={ID.commandee(index)} className="group-data-[layout=table]/lines:max-w-[10rem]">
                          {lineErrors?.quantite_commandee?.message}
                        </FieldError>
                      </>
                    ),
                    livree: (
                      <>
                        <Controller
                          control={control}
                          name={`lignes.${index}.quantite_livree`}
                          render={({ field: f }) => (
                            <NumericField
                              ref={f.ref}
                              id={ID.livree(index)}
                              mode="integer"
                              value={f.value}
                              onValueChange={f.onChange}
                              onBlur={f.onBlur}
                              aria-label={lineFieldLabel('Quantité livrée', l.produit_nom)}
                              {...fieldErrorProps(ID.livree(index), lineErrors?.quantite_livree)}
                              containerClassName="w-full group-data-[layout=table]/lines:ms-auto group-data-[layout=table]/lines:w-16"
                              className="h-9 group-data-[layout=table]/lines:h-8"
                            />
                          )}
                        />
                        <FieldError id={ID.livree(index)} className="group-data-[layout=table]/lines:max-w-[10rem]">
                          {lineErrors?.quantite_livree?.message}
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
                              containerClassName="w-full group-data-[layout=table]/lines:ms-auto group-data-[layout=table]/lines:w-28"
                              className="h-9 group-data-[layout=table]/lines:h-8"
                            />
                          )}
                        />
                        <FieldError id={ID.prix(index)}>{lineErrors?.prix_unitaire?.message}</FieldError>
                      </>
                    ),
                    total: <Money value={livree * price} className="font-medium" />,
                    retirer: (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-muted-foreground hover:text-danger-700 group-data-[layout=table]/lines:h-8 group-data-[layout=table]/lines:w-8"
                        aria-label={`Retirer ${l.produit_nom} du bon de livraison`}
                        title="Retirer du bon de livraison"
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

      {/* Notes */}
      <Card>
        <CardHeader>
          <CardTitle>
            <Label htmlFor={ID.notes} className="text-base">
              Notes de livraison
            </Label>
          </CardTitle>
          <CardDescription>Facultatif. Instructions pour le livreur ou notes internes.</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea id={ID.notes} rows={3} {...register('notes')} />
        </CardContent>
      </Card>
    </DocumentFormShell>
  );
}
