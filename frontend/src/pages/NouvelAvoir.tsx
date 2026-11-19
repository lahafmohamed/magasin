import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm, useFieldArray, useWatch, Controller, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Info, Plus, X } from 'lucide-react';
import { creditNoteService, factureService, retourService, tiersService } from '@/services/api';
import { AVOIR_TYPES, AVOIR_TYPE_OPTIONS, formatAvoirType, type AvoirType } from '@/utils/avoirTypes';
import { DocumentPicker, type DocumentOption, type DocumentPickerHandle } from '@/components/DocumentPicker';
import { TiersPicker, type TiersPickerValue } from '@/components/TiersPicker';
import { NumericField } from '@/components/NumericField';
import { DocumentLines, type DocumentLineColumn } from '@/components/DocumentLines';
import { DocumentFormShell, DraftNotice, SummaryItem, SummaryList } from '@/components/DocumentFormShell';
import { InlineNotice } from '@/components/SalesFormParts';
import { useDraft } from '@/hooks/useDraft';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChoiceGroup } from '@/components/ui/choice-chips';
import { DocumentTotals } from '@/components/ui/document-totals';
import { DocumentCode } from '@/components/ui/document-code';
import { FieldError, fieldErrorProps } from '@/components/ui/field-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Money } from '@/components/ui/money';
import { RequiredMark } from '@/components/ui/required-mark';
import { Textarea } from '@/components/ui/textarea';
import { getErrorMessage } from '@/utils/errors';
import { toNumber } from '@/utils/format';
import { SALES_MESSAGES as M, lineFieldLabel, plural } from '@/validation/salesForms';

const ligneSchema = z.object({
  produit_id: z.number().nullable(),
  description: z.string().trim().min(1, M.description),
  quantite: z.number({ error: M.quantity }).int(M.quantityInteger).min(1, M.quantity),
  prix_unitaire: z.number({ error: M.price }).positive(M.price),
});

const CLIENT_MISSING = 'Le client de la facture n’a pas pu être chargé : choisissez à nouveau la facture.';

const avoirSchema = z.object({
  facture: z.custom<DocumentOption | null>((v) => v != null, { error: M.factureRequired }),
  tiers: z.custom<TiersPickerValue | null>((v) => v != null, { error: CLIENT_MISSING }),
  avoirType: z.enum(AVOIR_TYPES),
  retourId: z.number().nullable(),
  notes: z.string(),
  lignes: z.array(ligneSchema).min(1, M.avoirLinesRequired),
});

type AvoirFormValues = z.infer<typeof avoirSchema>;
type LigneAvoir = z.infer<typeof ligneSchema>;

const EMPTY_LINE: LigneAvoir = { produit_id: null, description: '', quantite: 1, prix_unitaire: Number.NaN };

/** Retour client (`GET /retours/:id`), champs utilisés ici. */
interface RetourApi {
  id: number;
  numero_retour: string;
  tiers_id: number;
  statut: 'en_attente' | 'traite' | 'annule' | string;
  avoir_id?: number | null;
  numero_avoir?: string | null;
  lignes?: Array<{
    facture_id: number;
    produit_id: number | null;
    produit_nom?: string | null;
    produit_reference?: string | null;
    quantite: number | string;
    prix_unitaire: number | string;
  }>;
}

const ID = {
  facture: 'avoir-facture-origine',
  factureHint: 'avoir-facture-origine-aide',
  lignes: 'avoir-lignes',
  notes: 'avoir-notes',
  description: (i: number) => `avoir-ligne-${i}-description`,
  quantite: (i: number) => `avoir-ligne-${i}-quantite`,
  prix: (i: number) => `avoir-ligne-${i}-prix`,
};

/** Colonnes des lignes : tableau quand la colonne du formulaire a la place, cartes sinon (`DocumentLines`). */
const LINE_COLUMNS: DocumentLineColumn[] = [
  { id: 'ligne', header: 'Ligne', mobile: 'title', desktop: false },
  { id: 'description', header: 'Description', mobile: 'full', cellClassName: 'min-w-[14rem]' },
  { id: 'quantite', header: 'Quantité', mobile: 'field', headClassName: 'w-24 text-right', cellClassName: 'text-right' },
  {
    id: 'prix',
    header: 'Prix unitaire',
    mobile: 'field',
    headClassName: 'w-40 text-right',
    cellClassName: 'min-w-[9rem] text-right',
  },
  { id: 'total', header: 'Total', numeric: true, mobile: 'full', headClassName: 'w-36' },
  {
    id: 'retirer',
    header: 'Retirer',
    srOnlyHeader: true,
    mobile: 'action',
    headClassName: 'w-10',
    cellClassName: 'px-1',
  },
];

function firstErrorId(errors: FieldErrors<AvoirFormValues>, lineCount: number): string | null {
  for (let i = 0; i < lineCount; i++) {
    const le = errors.lignes?.[i];
    if (le?.description) return ID.description(i);
    if (le?.quantite) return ID.quantite(i);
    if (le?.prix_unitaire) return ID.prix(i);
  }
  return null;
}

function focusById(id: string | null) {
  if (!id) return;
  window.setTimeout(() => document.getElementById(id)?.focus(), 0);
}

/** Facture d'origine possible : toute facture non annulée (le serveur refuse les autres). */
const searchFactures = async (q: string): Promise<DocumentOption[]> => {
  const res = await factureService.getAll(q, undefined, 1, 10);
  const rows: Array<Record<string, unknown>> = res?.data ?? [];
  return rows
    .filter((f) => f.statut !== 'annulee')
    .map((f) => ({
      id: Number(f.id),
      numero: String(f.numero_facture ?? ''),
      tiers_nom: `${f.client_nom ?? ''} ${f.client_prenom ?? ''}`.trim() || null,
      montant: (f.montant_total ?? f.total ?? f.total_ttc ?? null) as number | string | null,
      date: (f.date_facture as string | null) ?? null,
      statut: (f.statut as string | null) ?? null,
    }));
};

/** Facture d'origine + son client, depuis l'API. */
async function loadFactureWithClient(factureId: number): Promise<{ doc: DocumentOption; client: TiersPickerValue | null }> {
  const facture = await factureService.getById(factureId);
  const doc: DocumentOption = {
    id: facture.id,
    numero: facture.numero_facture,
    tiers_nom: `${facture.client_nom ?? ''} ${facture.client_prenom ?? ''}`.trim() || null,
    montant: facture.total ?? null,
    date: facture.date_facture ?? null,
    statut: facture.statut ?? null,
  };
  const tiersId = facture.tiers_id ?? facture.client_id;
  const client = tiersId ? await tiersService.getById(tiersId) : null;
  return { doc, client: client ?? null };
}

export default function NouvelAvoir() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const retourParam = Number(params.get('retour_id')) || null;
  const factureParam = Number(params.get('facture_id')) || null;
  const prefilled = retourParam !== null || factureParam !== null;
  const factureTitleId = useId();
  const pickerRef = useRef<DocumentPickerHandle>(null);
  const factureSeq = useRef(0);

  const [submitting, setSubmitting] = useState(false);
  const [factureState, setFactureState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [factureError, setFactureError] = useState<unknown>(null);
  const [retour, setRetour] = useState<RetourApi | null>(null);
  const [prefillState, setPrefillState] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    prefilled ? 'loading' : 'idle'
  );
  const [prefillError, setPrefillError] = useState<unknown>(null);

  const {
    control,
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isDirty, isSubmitted },
  } = useForm<AvoirFormValues>({
    resolver: zodResolver(avoirSchema),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    shouldFocusError: false,
    defaultValues: {
      facture: null,
      tiers: null,
      avoirType: 'retour',
      retourId: null,
      notes: '',
      lignes: [EMPTY_LINE],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'lignes' });

  // --- Brouillon (formulaire vierge seulement : un lien prérempli fait foi) -----
  const { draft, save, clear, hasDraft } = useDraft<AvoirFormValues>('avoir:new');
  const [showDraftBanner, setShowDraftBanner] = useState(() => !prefilled && hasDraft && !!draft?.facture);

  useEffect(() => {
    if (prefilled) return;
    const sub = watch((values, { name, type }) => {
      if (type === 'change' || name?.startsWith('lignes') || name === 'facture') save(values as AvoirFormValues);
    });
    return () => sub.unsubscribe();
  }, [watch, save, prefilled]);

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

  const facture = useWatch({ control, name: 'facture' });
  const tiers = useWatch({ control, name: 'tiers' });
  const avoirType = useWatch({ control, name: 'avoirType' });
  const watchedLignes = useWatch({ control, name: 'lignes' });
  const lignes = useMemo(() => (watchedLignes ?? []) as LigneAvoir[], [watchedLignes]);

  // --- Facture d'origine : elle fixe le client ------------------------------------
  const onFactureChange = async (doc: DocumentOption | null) => {
    const seq = ++factureSeq.current;
    setValue('facture', doc, { shouldDirty: true, shouldValidate: isSubmitted });
    setValue('tiers', null);
    if (!doc) {
      setFactureState('idle');
      return;
    }
    setFactureState('loading');
    setFactureError(null);
    try {
      const { client } = await loadFactureWithClient(doc.id);
      if (seq !== factureSeq.current) return;
      setValue('tiers', client, { shouldValidate: isSubmitted });
      setFactureState('ready');
    } catch (err) {
      if (seq !== factureSeq.current) return;
      setFactureError(err);
      setFactureState('error');
    }
  };

  // --- Préremplissage : ?retour_id= (retour approuvé) ou ?facture_id= -----------
  const prefill = useCallback(async () => {
    if (!prefilled) return;
    setPrefillState('loading');
    setPrefillError(null);
    try {
      if (retourParam) {
        const r: RetourApi = await retourService.getById(retourParam);
        setRetour(r);
        const lignesRetour = Array.isArray(r.lignes) ? r.lignes : [];
        const factureId = lignesRetour[0]?.facture_id ?? factureParam;
        const origin = factureId ? await loadFactureWithClient(factureId) : null;
        const client = origin?.client ?? (r.tiers_id ? await tiersService.getById(r.tiers_id) : null);
        reset(
          {
            facture: origin?.doc ?? null,
            tiers: client ?? null,
            avoirType: 'retour',
            retourId: r.id,
            notes: '',
            lignes:
              lignesRetour.length > 0
                ? lignesRetour.map((l) => ({
                    produit_id: l.produit_id ?? null,
                    description: [l.produit_nom, l.produit_reference ? `(${l.produit_reference})` : '']
                      .filter(Boolean)
                      .join(' '),
                    quantite: toNumber(l.quantite) ?? 1,
                    prix_unitaire: toNumber(l.prix_unitaire) ?? Number.NaN,
                  }))
                : [EMPTY_LINE],
          },
          { keepDefaultValues: true }
        );
      } else if (factureParam) {
        const origin = await loadFactureWithClient(factureParam);
        setValue('facture', origin.doc);
        setValue('tiers', origin.client);
      }
      setPrefillState('ready');
    } catch (err) {
      setPrefillError(err);
      setPrefillState('error');
    }
  }, [prefilled, retourParam, factureParam, reset, setValue]);

  useEffect(() => {
    void prefill();
  }, [prefill]);

  const restoreDraft = () => {
    if (draft) {
      reset(
        {
          facture: draft.facture ?? null,
          tiers: draft.tiers ?? null,
          avoirType: AVOIR_TYPES.includes(draft.avoirType) ? draft.avoirType : 'retour',
          retourId: null,
          notes: draft.notes ?? '',
          lignes: Array.isArray(draft.lignes) && draft.lignes.length > 0 ? draft.lignes : [EMPTY_LINE],
        },
        { keepDefaultValues: true }
      );
    }
    setShowDraftBanner(false);
  };

  const discardDraft = () => {
    clear();
    setShowDraftBanner(false);
  };

  const total = useMemo(
    () =>
      lignes.reduce((sum, l) => {
        const q = Number.isFinite(l.quantite) ? l.quantite : 0;
        const p = Number.isFinite(l.prix_unitaire) ? l.prix_unitaire : 0;
        return sum + q * p;
      }, 0),
    [lignes]
  );

  // --- Envoi -----------------------------------------------------------------------
  const onInvalid = (errs: FieldErrors<AvoirFormValues>) => {
    if (errs.facture || errs.tiers) {
      window.setTimeout(() => pickerRef.current?.focus(), 0);
      return;
    }
    focusById(firstErrorId(errs, fields.length));
  };

  const onValid = async (values: AvoirFormValues) => {
    if (!values.facture || !values.tiers) return;
    setSubmitting(true);
    try {
      const result = await creditNoteService.createManual({
        tiers_id: values.tiers.id,
        facture_origine_id: values.facture.id,
        lignes: values.lignes.map((l) => ({
          ...(l.produit_id ? { produit_id: l.produit_id } : {}),
          description: l.description.trim(),
          quantite: l.quantite,
          prix_unitaire: l.prix_unitaire,
        })),
        notes: values.notes.trim() || undefined,
        avoir_type: values.avoirType,
        retour_id: values.retourId ?? undefined,
      });
      clear();
      toast.success(result?.numero_avoir ? `Avoir ${result.numero_avoir} créé` : 'Avoir créé');
      navigate(result?.avoir_id ? `/avoirs/${result.avoir_id}` : '/avoirs', {
        replace: true,
        state: { justCreated: true },
      });
    } catch (error) {
      toast.error(getErrorMessage(error, 'Impossible de créer l’avoir. Réessayez.'));
      setSubmitting(false);
    }
  };

  // --- Rendu ------------------------------------------------------------------------
  const lignesError = errors.lignes?.message ?? errors.lignes?.root?.message;
  const factureFieldError = errors.facture?.message;
  const motifLabel = formatAvoirType(avoirType);
  const hasNotice =
    showDraftBanner || prefillState === 'loading' || prefillState === 'error' || (!!retour && prefillState === 'ready');

  const notice = (
    <>
      {showDraftBanner && <DraftNotice onRestore={restoreDraft} onDiscard={discardDraft} />}
      {prefillState === 'loading' && (
        <p role="status" className="text-sm text-muted-foreground">
          {retourParam ? 'Chargement du retour…' : 'Chargement de la facture…'}
        </p>
      )}
      {prefillState === 'error' && (
        <InlineNotice tone="danger" onRetry={() => void prefill()}>
          {getErrorMessage(
            prefillError,
            retourParam ? 'Impossible de charger le retour à créditer.' : 'Impossible de charger la facture d’origine.'
          )}
        </InlineNotice>
      )}
      {retour && prefillState === 'ready' && (
        <div className="space-y-2">
          <p role="status" className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-sm">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span>
              Avoir du retour <DocumentCode>{retour.numero_retour}</DocumentCode> : la facture, le client et les
              produits sont repris du retour
            </span>
          </p>
          {retour.avoir_id ? (
            <InlineNotice tone="warning">
              Ce retour a déjà son avoir :{' '}
              <Link to={`/avoirs/${retour.avoir_id}`} className="font-medium underline underline-offset-2">
                voir l’avoir <DocumentCode className="font-normal">{retour.numero_avoir}</DocumentCode>
              </Link>
              .
            </InlineNotice>
          ) : retour.statut !== 'traite' ? (
            <InlineNotice tone="warning">
              Le retour <DocumentCode>{retour.numero_retour}</DocumentCode> n’est pas encore approuvé : approuvez-le
              dans Retours clients avant de créer son avoir.
            </InlineNotice>
          ) : null}
        </div>
      )}
    </>
  );

  const summary = (
    <>
      <SummaryList>
        <SummaryItem label="Facture">
          {facture ? (
            <DocumentCode className="font-normal">{facture.numero}</DocumentCode>
          ) : (
            <span className="font-normal text-muted-foreground">Non choisie</span>
          )}
        </SummaryItem>
        {/* « Repris de la facture » est dit une fois, sous le titre « Facture d’origine ». */}
        <SummaryItem label="Client">
          {tiers ? (
            `${tiers.raison_sociale}${tiers.prenom ? ` ${tiers.prenom}` : ''}`
          ) : (
            <span className="font-normal text-muted-foreground">—</span>
          )}
        </SummaryItem>
        <SummaryItem label="Motif">{motifLabel}</SummaryItem>
        {retour && (
          <SummaryItem label="Retour">
            <DocumentCode className="font-normal">{retour.numero_retour}</DocumentCode>
          </SummaryItem>
        )}
        <SummaryItem label="Lignes" numeric>
          {plural(lignes.length, 'ligne', 'lignes')}
        </SummaryItem>
      </SummaryList>
      <DocumentTotals
        className="mt-0 w-full pt-2 sm:w-full"
        aria-label="Montant de l’avoir"
        total={{ label: 'Montant de l’avoir', value: total }}
      />
    </>
  );

  return (
    <DocumentFormShell
      title="Nouvel avoir"
      description="Créez un avoir sur une facture existante. Il est validé dès sa création et crédite le compte du client."
      backTo="/avoirs"
      onSubmit={handleSubmit(onValid, onInvalid)}
      notice={hasNotice ? notice : null}
      summary={summary}
      total={total}
      totalLabel="Montant de l’avoir"
      submitLabel="Créer l’avoir"
      submittingLabel="Création de l’avoir…"
      submitting={submitting}
      submitDisabled={prefillState === 'loading'}
    >
      {/* Facture d'origine + client */}
      <Card>
        <CardHeader>
          <CardTitle id={factureTitleId}>
            Facture d’origine
            <RequiredMark />
          </CardTitle>
          <CardDescription id={ID.factureHint}>Le client de l’avoir est celui de la facture</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Controller
              control={control}
              name="facture"
              render={({ field }) => (
                <DocumentPicker
                  ref={pickerRef}
                  inputId={ID.facture}
                  value={field.value}
                  onChange={(doc) => void onFactureChange(doc)}
                  search={searchFactures}
                  placeholder="Numéro ou client"
                  changeLabel="Changer de facture"
                  aria-labelledby={factureTitleId}
                  {...fieldErrorProps(ID.facture, factureFieldError)}
                  aria-describedby={[ID.factureHint, factureFieldError ? `${ID.facture}-error` : null]
                    .filter(Boolean)
                    .join(' ')}
                />
              )}
            />
            <FieldError id={ID.facture}>{factureFieldError}</FieldError>
          </div>

          {factureState === 'error' && facture && (
            <InlineNotice tone="danger" onRetry={() => void onFactureChange(facture)}>
              {getErrorMessage(factureError, 'Impossible de charger le client de la facture.')}
            </InlineNotice>
          )}

          {/* Le client n'apparaît qu'une fois repris de la facture : avant, la
              carte redisait « Repris de la facture » sous la consigne. */}
          {tiers && (
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Client</p>
              <TiersPicker role="client" value={tiers} onChange={() => undefined} disabled />
            </div>
          )}
          {facture && !tiers && <FieldError id="avoir-tiers">{errors.tiers?.message}</FieldError>}
        </CardContent>
      </Card>

      {/* Motif */}
      <Card>
        <CardHeader>
          <CardTitle>
            Motif de l’avoir
            <RequiredMark />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Controller
            control={control}
            name="avoirType"
            render={({ field }) => (
              <ChoiceGroup<AvoirType>
                label="Motif de l’avoir"
                hideLabel
                value={field.value}
                onValueChange={field.onChange}
                options={AVOIR_TYPE_OPTIONS}
                size="touch"
              />
            )}
          />
        </CardContent>
      </Card>

      {/* Lignes */}
      <Card>
        <CardHeader>
          <CardTitle>
            Lignes de l’avoir
            <RequiredMark />
          </CardTitle>
          <CardDescription>Ce que l’avoir rembourse ou crédite : produit ou motif, quantité, prix</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <DocumentLines
            label="Lignes de l’avoir"
            columns={LINE_COLUMNS}
            rows={fields.map((field, index) => {
              const l = (lignes[index] ?? field) as LigneAvoir;
              const lineErrors = errors.lignes?.[index];
              const name = l.description?.trim() || `ligne ${index + 1}`;
              const q = Number.isFinite(l.quantite) ? l.quantite : 0;
              const p = Number.isFinite(l.prix_unitaire) ? l.prix_unitaire : 0;
              return {
                key: field.id,
                cells: {
                  ligne: <p className="text-sm font-medium">Ligne {index + 1}</p>,
                  description: (
                    <>
                      <Input
                        id={ID.description(index)}
                        aria-label={lineFieldLabel('Description', null, index)}
                        placeholder="Produit ou motif"
                        {...fieldErrorProps(ID.description(index), lineErrors?.description)}
                        {...register(`lignes.${index}.description` as const)}
                        className="h-9 group-data-[layout=table]/lines:h-8"
                      />
                      <FieldError id={ID.description(index)}>{lineErrors?.description?.message}</FieldError>
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
                            aria-label={lineFieldLabel('Quantité', name)}
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
                            aria-label={lineFieldLabel('Prix unitaire', name)}
                            {...fieldErrorProps(ID.prix(index), lineErrors?.prix_unitaire)}
                            containerClassName="w-full group-data-[layout=table]/lines:ms-auto group-data-[layout=table]/lines:w-32"
                            className="h-9 group-data-[layout=table]/lines:h-8"
                          />
                        )}
                      />
                      <FieldError id={ID.prix(index)}>{lineErrors?.prix_unitaire?.message}</FieldError>
                    </>
                  ),
                  total: <Money value={q * p} className="font-medium" />,
                  retirer:
                    fields.length > 1 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-muted-foreground hover:text-danger-700 group-data-[layout=table]/lines:h-8 group-data-[layout=table]/lines:w-8"
                        aria-label={`Retirer la ${index + 1}${index === 0 ? 're' : 'e'} ligne de l’avoir`}
                        title="Retirer la ligne"
                        onClick={() => {
                          remove(index);
                          focusById(ID.description(Math.max(0, index - 1)));
                        }}
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    ) : null,
                },
              };
            })}
          />
          <FieldError id={ID.lignes}>{lignesError}</FieldError>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              append(EMPTY_LINE, { shouldFocus: false });
              focusById(ID.description(fields.length));
            }}
          >
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            Ajouter une ligne
          </Button>
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
          <CardDescription>Facultatif</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea id={ID.notes} rows={3} {...register('notes')} />
        </CardContent>
      </Card>
    </DocumentFormShell>
  );
}
