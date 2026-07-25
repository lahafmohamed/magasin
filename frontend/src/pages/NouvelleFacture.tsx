import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, useFieldArray, useWatch, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { factureService, stockLocationService, ventesService } from '../services/api';
import { TiersPicker } from '../components/TiersPicker';
import { useDraft } from '@/hooks/useDraft';
import { Produit, Tiers } from '../types';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';
import { ArrowLeft, Search, Minus, Plus, X, AlertCircle, ScanLine } from 'lucide-react';
import { toast } from 'sonner';
import { getValidSalePrice } from '../utils/salesPrice';

interface StockLocation {
  id: number;
  code: string;
  nom: string;
  est_principal: boolean;
}

interface StockLevel {
  produit_id: number;
  quantite_disponible: number;
}

import { formatFCFA as formatXOF } from '../utils/format';

// --- Validation schema (react-hook-form + zod) -----------------------------
// Mirrors the fields that were previously validated manually before submit:
//  - a client (tiers) must be selected
//  - at least one line
//  - per line: quantité > 0, prix unitaire > 0, remise 0..100
// The stock-availability rule (quantité <= stock_dispo) stays in onValid so we
// keep the exact original toast UX (it depends on per-location live stock).
const ligneSchema = z.object({
  produit_id: z.number(),
  produit_nom: z.string(),
  produit_reference: z.string(),
  quantite: z.number().min(1, 'Quantité invalide'),
  prix_unitaire: z.number().positive('Le prix doit être supérieur à zéro'),
  prix_unitaire_default: z.number(),
  prix_revient: z.number(),
  remise_pct: z.number().min(0).max(100),
  stock_dispo: z.number(),
});

const factureSchema = z
  .object({
    client: z.custom<Tiers | null>(),
    location_id: z.number().nullable(),
    echeance: z.string().min(1, 'Échéance requise'),
    notes: z.string(),
    lignes: z.array(ligneSchema).min(1, 'Ajoutez au moins un produit'),
  })
  // Object-level check so the field output type stays `Tiers | null`
  // (a field-level type-guard refine would narrow it and break RHF typing).
  .superRefine((val, ctx) => {
    if (val.client == null) {
      ctx.addIssue({
        code: 'custom',
        path: ['client'],
        message: 'Sélectionnez un tiers (client)',
      });
    }
  });

type FactureFormValues = z.infer<typeof factureSchema>;
type LigneFacture = z.infer<typeof ligneSchema>;

function defaultEcheance(): string {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toISOString().slice(0, 10);
}

export default function NouvelleFacture() {
  const navigate = useNavigate();

  // --- Local (non-form) UI state -------------------------------------------
  // Product search / dropdown are pure UX; only the selected product becomes a
  // form line. Locations and the per-location stock map are loaded async and
  // feed calculations / line stock — not form inputs themselves.
  const [produits, setProduits] = useState<Produit[]>([]);
  const [produitSearch, setProduitSearch] = useState('');
  const [showProduitDropdown, setShowProduitDropdown] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [locationStockMap, setLocationStockMap] = useState<Record<number, number>>({});

  // --- react-hook-form ------------------------------------------------------
  const {
    control,
    register,
    handleSubmit,
    setValue,
    getValues,
    watch,
    reset,
    formState: { errors, isDirty },
  } = useForm<FactureFormValues>({
    resolver: zodResolver(factureSchema),
    mode: 'onChange',
    defaultValues: {
      client: null,
      location_id: null,
      echeance: defaultEcheance(),
      notes: '',
      lignes: [],
    },
  });

  // --- Draft autosave + unsaved-changes guard ------------------------------
  const { draft, save, clear, hasDraft } = useDraft<FactureFormValues>('facture:new');
  const [showDraftBanner, setShowDraftBanner] = useState(hasDraft);

  useEffect(() => {
    const sub = watch((v) => save(v as FactureFormValues));
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

  const { fields, append, remove } = useFieldArray({ control, name: 'lignes' });

  // Live watched values drive totals, stock loading and the submit button.
  const watchedClient = useWatch({ control, name: 'client' });
  const selectedLocationId = useWatch({ control, name: 'location_id' });
  const watchedLignesRaw = useWatch({ control, name: 'lignes' });
  const lignes = (watchedLignesRaw ?? []) as LigneFacture[];

  useEffect(() => {
    const loadLocations = async () => {
      try {
        const response = await ventesService.getLocations();
        const magasinLocations: StockLocation[] = response.data || response;
        setLocations(magasinLocations);
        const defaultLocation = magasinLocations.find((l) => l.est_principal) || magasinLocations[0];
        if (defaultLocation) {
          setValue('location_id', defaultLocation.id);
        } else {
          toast.error('Aucun magasin actif disponible pour la facturation');
        }
      } catch {
        toast.error('Impossible de charger les magasins');
      }
    };
    void loadLocations();
  }, [setValue]);

  useEffect(() => {
    if (!selectedLocationId) return;
    const loadLocationStock = async () => {
      try {
        const response = await stockLocationService.getStockLevels(selectedLocationId);
        const levels: StockLevel[] = response.data || response;
        const nextMap: Record<number, number> = {};
        for (const level of levels) {
          nextMap[level.produit_id] = Number(level.quantite_disponible || 0);
        }
        setLocationStockMap(nextMap);
      } catch {
        toast.error("Impossible de charger le stock de l'emplacement");
      }
    };
    void loadLocationStock();
  }, [selectedLocationId]);

  // Re-sync each line's stock_dispo when the location stock map changes
  // (preserves the original `stock_dispo: map[id] ?? 0` remap).
  useEffect(() => {
    if (!selectedLocationId) return;
    const current = getValues('lignes');
    current.forEach((ligne, i) => {
      setValue(`lignes.${i}.stock_dispo`, locationStockMap[ligne.produit_id] ?? 0);
    });
  }, [locationStockMap, selectedLocationId, getValues, setValue]);

  useEffect(() => {
    if (produitSearch.length < 2) {
      setProduits([]);
      return;
    }
    ventesService
      .searchFuzzy(produitSearch, 20, selectedLocationId || undefined)
      .then((data) => {
        setProduits(Array.isArray(data) ? data : []);
      })
      .catch(console.error);
  }, [produitSearch, selectedLocationId]);

  const addProduit = (p: Produit) => {
    const prixVente = getValidSalePrice(p.prix_vente);
    if (prixVente === null) {
      toast.error(
        'Prix de vente non renseigné. Corrigez la fiche produit avant de continuer.'
      );
      return;
    }

    const current = getValues('lignes');
    const existingIdx = current.findIndex((l) => l.produit_id === p.id);
    if (existingIdx >= 0) {
      setValue(`lignes.${existingIdx}.quantite`, current[existingIdx].quantite + 1, {
        shouldValidate: true,
        shouldDirty: true,
      });
      setProduitSearch('');
      setShowProduitDropdown(false);
      return;
    }
    const prixAchat = parseFloat(p.prix_achat as any) || 0;
    const fallbackStock =
      typeof p.stock === 'string' ? parseInt(p.stock, 10) : Number(p.stock || 0);
    const stock = selectedLocationId
      ? locationStockMap[p.id] ?? fallbackStock
      : fallbackStock;

    append({
      produit_id: p.id,
      produit_nom: p.nom,
      produit_reference: p.reference,
      quantite: 1,
      prix_unitaire: prixVente,
      prix_unitaire_default: prixVente,
      prix_revient: prixAchat,
      remise_pct: 0,
      stock_dispo: stock,
    });
    setProduitSearch('');
    setShowProduitDropdown(false);
  };

  const removeLigne = (idx: number) => remove(idx);

  const totals = useMemo(() => {
    const subtotal = lignes.reduce(
      (s, l) => s + l.quantite * l.prix_unitaire * (1 - l.remise_pct / 100),
      0,
    );
    const totalCost = lignes.reduce((s, l) => s + l.quantite * l.prix_revient, 0);
    const margin = subtotal - totalCost;
    const marginPct = subtotal > 0 ? (margin / subtotal) * 100 : 0;
    const totalUnits = lignes.reduce((s, l) => s + l.quantite, 0);
    return { subtotal, totalCost, margin, marginPct, total: subtotal, totalUnits };
  }, [lignes]);

  const isValid = !!watchedClient && lignes.length > 0;
  const disabledReason = !watchedClient
    ? 'Sélectionnez un tiers (client)'
    : lignes.length === 0
    ? 'Ajoutez au moins un produit'
    : null;

  const onValid = async (data: FactureFormValues) => {
    // Defensive guards kept identical to the original manual validation so the
    // exact toast messages are preserved (the schema already blocks these,
    // but we keep the UX 1:1).
    if (!data.client) {
      toast.error('Veuillez sélectionner un client');
      return;
    }
    if (data.lignes.length === 0) {
      toast.error('Veuillez ajouter au moins un produit');
      return;
    }
    for (const ligne of data.lignes) {
      if (ligne.quantite > ligne.stock_dispo) {
        toast.error(`Stock insuffisant pour "${ligne.produit_nom}" (disponible: ${ligne.stock_dispo})`);
        return;
      }
      if (ligne.quantite <= 0) {
        toast.error(`Quantité invalide pour "${ligne.produit_nom}"`);
        return;
      }
    }
    setSubmitting(true);
    try {
      const result = await factureService.create({
        tiers_id: data.client.id,
        location_id: data.location_id || undefined,
        lignes: data.lignes.map((l) => ({
          produit_id: l.produit_id,
          quantite: l.quantite,
          prix_unitaire: l.prix_unitaire * (1 - l.remise_pct / 100),
        })),
        notes: data.notes || undefined,
      });
      clear();
      toast.success(`Facture ${result.numero_facture} créée avec succès!`);
      navigate('/factures');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Erreur lors de la création de la facture');
    } finally {
      setSubmitting(false);
    }
  };

  const sectionLabel =
    'text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground';
  const cardCls = 'rounded-xl border bg-card p-5 shadow-sm';

  return (
    <form
      onSubmit={handleSubmit(onValid)}
      className="w-full p-4 sm:p-8 tabular-nums"
      style={{ fontFeatureSettings: '"tnum"' }}
    >
      {/* Page header */}
      <div className="flex items-center gap-4 mb-6">
        <Button type="button" variant="outline" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Retour
        </Button>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Nouvelle Facture</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Brouillon · <span className="font-mono">FAC-{new Date().getFullYear()}-XXXX</span>
          </p>
        </div>
      </div>

      {showDraftBanner && (
        <div className="rounded-lg border bg-muted/50 p-3 text-sm flex items-center justify-between gap-3 mb-5">
          <span>Un brouillon non enregistré a été récupéré.</span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                if (draft) reset(draft);
                setShowDraftBanner(false);
              }}
            >
              Restaurer
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                clear();
                setShowDraftBanner(false);
              }}
            >
              Ignorer
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-5 items-start">
        {/* Left column */}
        <div className="grid gap-4 min-w-0">
          {/* Client + meta */}
          <section className={cardCls}>
            <div className="flex items-baseline justify-between mb-3">
              <h2 className={sectionLabel}>Client (Tiers)<span className="text-destructive"> *</span></h2>
            </div>
            <Controller
              control={control}
              name="client"
              render={({ field, fieldState }) => (
                <>
                  <TiersPicker role="client" value={field.value} onChange={field.onChange} />
                  {fieldState.error && (
                    <p role="alert" className="text-xs font-medium text-danger mt-1.5">
                      {fieldState.error.message}
                    </p>
                  )}
                </>
              )}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
              <div>
                <Label
                  htmlFor="facture-location"
                  className="text-xs text-muted-foreground block mb-1.5 font-normal"
                >
                  Emplacement de vente
                </Label>
                <Controller
                  control={control}
                  name="location_id"
                  render={({ field }) => (
                    <Select
                      value={field.value ? String(field.value) : ''}
                      onValueChange={(v) => field.onChange(parseInt(v, 10))}
                    >
                      <SelectTrigger id="facture-location" className="w-full" aria-label="Emplacement de vente">
                        <SelectValue placeholder="Choisir un emplacement" />
                      </SelectTrigger>
                      <SelectContent>
                        {locations.map((l) => (
                          <SelectItem key={l.id} value={String(l.id)}>
                            {l.nom} ({l.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div>
                <Label
                  htmlFor="facture-echeance"
                  className="text-xs text-muted-foreground block mb-1.5 font-normal"
                >
                  Échéance<span className="text-destructive"> *</span>
                </Label>
                <Controller
                  control={control}
                  name="echeance"
                  render={({ field }) => (
                    <DatePicker
                      id="facture-echeance"
                      value={field.value}
                      onChange={field.onChange}
                      required
                    />
                  )}
                />
                {errors.echeance && (
                  <p role="alert" className="text-xs font-medium text-danger mt-1">
                    {errors.echeance.message}
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* Products */}
          <section className={cardCls}>
            <div className="flex items-baseline justify-between mb-3">
              <h2 className={sectionLabel}>
                Produits{' '}
                <span className="text-muted-foreground/60 font-medium normal-case tracking-normal">
                  · {lignes.length}
                </span>
              </h2>
              <button
                type="button"
                className="text-xs text-primary hover:underline inline-flex items-center gap-1"
              >
                <ScanLine className="h-3.5 w-3.5" /> Scanner code-barres
              </button>
            </div>

            <Label
              htmlFor="facture-produit-search"
              className="text-xs text-muted-foreground block mb-1.5 font-normal"
            >
              Rechercher un produit
            </Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                id="facture-produit-search"
                className="w-full pl-10 pr-3 py-2.5 text-sm rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Rechercher un produit par nom ou référence…"
                value={produitSearch}
                onChange={(e) => {
                  setProduitSearch(e.target.value);
                  setShowProduitDropdown(true);
                }}
                onFocus={() => setShowProduitDropdown(true)}
                onBlur={() => setTimeout(() => setShowProduitDropdown(false), 150)}
              />
              {showProduitDropdown && produitSearch.length >= 2 && produits.length === 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 z-20 bg-popover border rounded-lg shadow-lg px-3 py-3 text-sm text-muted-foreground">
                  <p>Aucun produit trouvé pour "{produitSearch}"</p>
                  <p className="text-xs mt-1">Essayez une orthographe différente ou vérifiez le stock en magasin</p>
                </div>
              )}
              {showProduitDropdown && produits.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 z-20 bg-popover border rounded-lg shadow-lg overflow-hidden max-h-80 overflow-y-auto">
                  {produits.map((p) => {
                    const prixVente = getValidSalePrice(p.prix_vente);
                    const prixManquant = prixVente === null;
                    const apiStock =
                      typeof p.stock === 'string' ? parseInt(p.stock, 10) : Number(p.stock || 0);
                    const stock = selectedLocationId
                      ? locationStockMap[p.id] ?? apiStock
                      : apiStock;
                    const stockMin =
                      typeof p.stock_min === 'string'
                        ? parseInt(p.stock_min, 10)
                        : Number(p.stock_min || 0);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        disabled={prixManquant}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          if (!prixManquant) addProduit(p);
                        }}
                        title={prixManquant ? 'Renseignez le prix de vente dans la fiche produit' : undefined}
                        className={`flex items-center gap-3 w-full px-3 py-2.5 text-left border-b last:border-b-0 ${
                          prixManquant
                            ? 'cursor-not-allowed bg-destructive/5 opacity-70'
                            : 'hover:bg-muted'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{p.nom}</div>
                          <div className="text-xs text-muted-foreground font-mono">
                            {p.reference} · stock: {stock}
                            {(p as any).similarity && (p as any).similarity < 0.5 && (
                              <span className="text-warning-500 ml-1">(résultat approximatif)</span>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold font-mono">
                            {prixManquant ? 'Prix non renseigné' : formatXOF(prixVente)}
                          </div>
                          <div
                            className={`text-[11px] ${
                              prixManquant || stock <= stockMin
                                ? 'text-destructive'
                                : 'text-success-600'
                            }`}
                          >
                            {prixManquant
                              ? 'Corriger dans l’inventaire'
                              : stock <= stockMin
                                ? 'Stock bas'
                                : 'Disponible'}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {fields.length > 0 ? (
              <div className="mt-4 border rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
                        <th className="text-left font-semibold px-3 py-2.5">Produit</th>
                        <th className="text-center font-semibold px-3 py-2.5 w-[110px]">Qté<span className="text-destructive"> *</span></th>
                        <th className="text-right font-semibold px-3 py-2.5 w-[150px]">
                          Prix unitaire<span className="text-destructive"> *</span>
                        </th>
                        <th className="text-right font-semibold px-3 py-2.5 w-[110px]">Marge</th>
                        <th className="text-right font-semibold px-3 py-2.5 w-[80px]">Remise</th>
                        <th className="text-right font-semibold px-3 py-2.5 w-[120px]">Total</th>
                        <th className="w-8 px-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {fields.map((field, i) => {
                        const l = (lignes[i] ?? field) as LigneFacture;
                        const lineErrors = errors.lignes?.[i];
                        const effPrice = l.prix_unitaire * (1 - l.remise_pct / 100);
                        const lineTotal = l.quantite * effPrice;
                        const lineCost = l.quantite * l.prix_revient;
                        const marginAbs = lineTotal - lineCost;
                        const marginPct =
                          effPrice > 0 ? ((effPrice - l.prix_revient) / effPrice) * 100 : 0;
                        const belowCost = l.prix_revient > 0 && effPrice < l.prix_revient;
                        const overstock = l.quantite > l.stock_dispo;
                        const priceOverridden = l.prix_unitaire !== l.prix_unitaire_default;
                        return (
                          <tr key={field.id} className="border-t align-middle">
                            <td className="px-3 py-3">
                              <div className="font-medium">{l.produit_nom}</div>
                              <div className="text-xs font-mono text-muted-foreground">
                                {l.produit_reference}
                              </div>
                              {overstock && (
                                <div className="inline-flex items-center gap-1 mt-1 text-[11px] text-destructive">
                                  <AlertCircle className="h-3 w-3" />
                                  Stock insuffisant ({l.stock_dispo} dispo)
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-3 text-center">
                              <div className="inline-flex items-center border rounded-md overflow-hidden">
                                <button
                                  type="button"
                                  className="px-2 py-1 text-muted-foreground hover:bg-muted"
                                  onClick={() =>
                                    setValue(`lignes.${i}.quantite`, Math.max(1, l.quantite - 1), {
                                      shouldValidate: true,
                                      shouldDirty: true,
                                    })
                                  }
                                >
                                  <Minus className="h-3.5 w-3.5" />
                                </button>
                                <Controller
                                  control={control}
                                  name={`lignes.${i}.quantite`}
                                  render={({ field: qField }) => (
                                    <input
                                      className="w-10 text-center text-sm border-x py-1 font-mono bg-background focus:outline-none"
                                      value={qField.value === 0 ? '' : qField.value}
                                      onChange={(e) => {
                                        const n = parseInt(e.target.value, 10);
                                        qField.onChange(Number.isNaN(n) ? 0 : n);
                                      }}
                                      onBlur={(e) => {
                                        if (!e.target.value || parseInt(e.target.value, 10) < 1) {
                                          qField.onChange(1);
                                        }
                                        qField.onBlur();
                                      }}
                                    />
                                  )}
                                />
                                <button
                                  type="button"
                                  className="px-2 py-1 text-muted-foreground hover:bg-muted"
                                  onClick={() =>
                                    setValue(`lignes.${i}.quantite`, l.quantite + 1, {
                                      shouldValidate: true,
                                      shouldDirty: true,
                                    })
                                  }
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                </button>
                              </div>
                              {lineErrors?.quantite && (
                                <p role="alert" className="text-[10px] font-medium text-danger mt-1">
                                  {lineErrors.quantite.message}
                                </p>
                              )}
                            </td>
                            <td className="px-3 py-3 text-right">
                              <Controller
                                control={control}
                                name={`lignes.${i}.prix_unitaire`}
                                render={({ field: pField }) => (
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={pField.value === 0 ? '' : pField.value}
                                    onChange={(e) => {
                                      const n = parseFloat(e.target.value);
                                      pField.onChange(Number.isNaN(n) ? 0 : Math.max(0, n));
                                    }}
                                    onBlur={pField.onBlur}
                                    className={`w-28 px-2 py-1 text-right text-sm border rounded font-mono focus:outline-none focus:ring-1 focus:ring-ring ${
                                      priceOverridden ? 'bg-primary/10 border-primary/30' : 'bg-background'
                                    }`}
                                  />
                                )}
                              />
                              <div className="text-[10px] text-muted-foreground mt-1 flex justify-end items-baseline gap-1">
                                <span className="uppercase tracking-wider">P. revient</span>
                                <span className="font-mono">{formatXOF(l.prix_revient)}</span>
                              </div>
                              {lineErrors?.prix_unitaire && (
                                <p role="alert" className="text-[10px] font-medium text-danger mt-1">
                                  {lineErrors.prix_unitaire.message}
                                </p>
                              )}
                            </td>
                            <td className="px-3 py-3 text-right">
                              <div
                                className={`inline-flex flex-col items-end px-2 py-1 rounded font-mono text-xs font-semibold leading-tight ${
                                  belowCost
                                    ? 'bg-destructive/10 text-destructive'
                                    : 'bg-success-500/10 text-success-700'
                                }`}
                              >
                                <span>
                                  {marginPct >= 0 ? '+' : ''}
                                  {marginPct.toFixed(1)}%
                                </span>
                                <span className="text-[10px] font-medium opacity-80">
                                  {marginAbs >= 0 ? '+' : '−'}
                                  {formatXOF(Math.abs(marginAbs))}
                                </span>
                              </div>
                            </td>
                            <td className="px-3 py-3 text-right">
                              <div className="inline-flex items-baseline gap-0.5">
                                <Controller
                                  control={control}
                                  name={`lignes.${i}.remise_pct`}
                                  render={({ field: rField }) => (
                                    <input
                                      type="number"
                                      min={0}
                                      max={100}
                                      value={rField.value}
                                      onChange={(e) =>
                                        rField.onChange(
                                          Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)),
                                        )
                                      }
                                      onBlur={rField.onBlur}
                                      className="w-12 px-1.5 py-1 text-right text-sm border rounded font-mono bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                                    />
                                  )}
                                />
                                <span className="text-xs text-muted-foreground">%</span>
                              </div>
                            </td>
                            <td className="px-3 py-3 text-right font-mono font-semibold">
                              {formatXOF(lineTotal)}
                            </td>
                            <td className="px-2 py-3 text-center">
                              <button
                                type="button"
                                className="text-muted-foreground hover:text-destructive p-1"
                                onClick={() => removeLigne(i)}
                                aria-label="Retirer cette ligne"
                                title="Retirer cette ligne"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="mt-4 py-8 text-center text-sm text-muted-foreground bg-muted/30 rounded-lg">
                Aucun article ajouté à la facture.
              </div>
            )}
            {errors.lignes?.message && (
              <p role="alert" className="text-xs font-medium text-danger mt-2">
                {errors.lignes.message}
              </p>
            )}
          </section>
        </div>

        {/* Right column */}
        <aside className="grid gap-4 lg:sticky lg:top-4">
          {/* Summary card */}
          <section className="rounded-md border bg-card p-5 shadow-sm">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              Résumé
            </h2>

            <SummaryRow label="Total" value={formatXOF(totals.total)} large />

            <div
              className={`mt-4 p-3 rounded-md border ${
                totals.margin >= 0
                  ? 'bg-success-50 border-success-200'
                  : 'bg-danger-50 border-danger-200'
              }`}
            >
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Marge brute
                </span>
                <span
                  className={`tabular-nums text-sm font-semibold ${
                    totals.margin >= 0 ? 'text-success-700' : 'text-danger-700'
                  }`}
                >
                  {totals.margin >= 0 ? '+' : '−'}
                  {formatXOF(Math.abs(totals.margin))}
                </span>
              </div>
              <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                <span className="tabular-nums">P. revient {formatXOF(totals.totalCost)}</span>
                <span className="tabular-nums">
                  {totals.marginPct >= 0 ? '+' : ''}
                  {totals.marginPct.toFixed(1)}%
                </span>
              </div>
            </div>

            <div className="mt-3 px-3 py-2 rounded-md bg-muted text-xs text-muted-foreground">
              {lignes.length} ligne{lignes.length > 1 ? 's' : ''} · {totals.totalUnits} unité
              {totals.totalUnits > 1 ? 's' : ''}
            </div>
          </section>

          {/* Notes */}
          <section className={cardCls}>
            <label className="text-sm font-semibold block mb-2">Notes</label>
            <textarea
              rows={3}
              placeholder="Notes optionnelles visibles sur la facture…"
              className="w-full px-3 py-2 text-sm rounded-md border bg-background resize-y focus:outline-none focus:ring-2 focus:ring-ring"
              {...register('notes')}
            />
          </section>

          <Button
            type="submit"
            disabled={!isValid || submitting}
            className="w-full h-12 text-base font-semibold"
          >
            {submitting ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent mr-2" />
                Création en cours…
              </>
            ) : (
              <>Créer la facture · {formatXOF(totals.total)}</>
            )}
          </Button>
          {disabledReason && !submitting && (
            <div className="text-xs text-muted-foreground text-center -mt-2">{disabledReason}</div>
          )}
        </aside>
      </div>
    </form>
  );
}

function SummaryRow({
  label,
  value,
  large = false,
}: {
  label: string;
  value: string;
  large?: boolean;
}) {
  return (
    <div
      className={`flex justify-between items-baseline ${
        large ? 'py-1 text-base font-semibold text-foreground' : 'py-1 text-sm text-muted-foreground'
      }`}
    >
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
