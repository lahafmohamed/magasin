import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm, useFieldArray, useWatch, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { devisService, stockLocationService, ventesService, tiersService } from '@/services/api';
import { useDraft } from '@/hooks/useDraft';
import { TiersPicker } from '@/components/TiersPicker';
import { Tiers, Produit } from '@/types';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Check, FileText, Search, ShoppingCart, X } from 'lucide-react';
import { formatFCFA as formatXOF } from '@/utils/format';
import { toast } from 'sonner';

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

// --- zod schema -----------------------------------------------------------
// Required (matches the original handleSubmit guards): a client must be
// selected and at least one line item with quantité > 0 / prix >= 0.
// location_id, date_validite and notes are optional, exactly like before
// (the payload sent them as `value || undefined`).
const ligneSchema = z.object({
  produit_id: z.number(),
  produit_nom: z.string(),
  produit_reference: z.string(),
  quantite: z.number().int().min(1, 'Quantité invalide'),
  prix_unitaire: z.number().min(0, 'Prix invalide'),
  prix_revient: z.number(),
  stock_dispo: z.number(),
});

const devisSchema = z.object({
  client: z.custom<Tiers | null>((v) => v != null, 'Veuillez sélectionner un client'),
  location_id: z.number().nullable(),
  date_validite: z.string(),
  notes: z.string(),
  lignes: z.array(ligneSchema).min(1, 'Veuillez ajouter au moins un produit'),
});

type DevisFormValues = z.infer<typeof devisSchema>;

export default function NouveauDevis() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;

  // Local-only search / UI state (does not feed the payload directly).
  const [produits, setProduits] = useState<Produit[]>([]);
  const [produitSearch, setProduitSearch] = useState('');
  const [showProduitDropdown, setShowProduitDropdown] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [locationStockMap, setLocationStockMap] = useState<Record<number, number>>({});

  const {
    control,
    register,
    handleSubmit,
    setValue,
    getValues,
    watch,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<DevisFormValues>({
    resolver: zodResolver(devisSchema),
    defaultValues: {
      client: null,
      location_id: null,
      date_validite: '',
      notes: '',
      lignes: [],
    },
  });

  // --- Draft autosave + unsaved-changes guard (create mode only) -----------
  const { draft, save, clear, hasDraft } = useDraft<DevisFormValues>('devis:new');
  const [showDraftBanner, setShowDraftBanner] = useState(!isEdit && hasDraft);

  useEffect(() => {
    if (isEdit) return;
    const sub = watch((v) => save(v as DevisFormValues));
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

  const { fields, append, remove, replace } = useFieldArray({ control, name: 'lignes' });

  // Live values for computed totals / margins and effect dependencies.
  const selectedClient = useWatch({ control, name: 'client' });
  const selectedLocationId = useWatch({ control, name: 'location_id' });
  const watchedLignes = useWatch({ control, name: 'lignes' }) ?? [];

  useEffect(() => {
    const loadMagasins = async () => {
      try {
        const response = await ventesService.getLocations();
        const magasins: StockLocation[] = response.data || response;
        setLocations(magasins);
        const defaultMagasin = magasins.find((m) => m.est_principal) || magasins[0];
        if (defaultMagasin) {
          setValue('location_id', defaultMagasin.id);
        } else {
          toast.error('Aucun magasin actif disponible pour les devis');
        }
      } catch {
        toast.error('Impossible de charger les magasins');
      }
    };

    void loadMagasins();
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
        toast.error('Impossible de charger le stock du magasin');
      }
    };
    void loadLocationStock();
  }, [selectedLocationId]);

  useEffect(() => {
    if (!selectedLocationId) return;
    const current = getValues('lignes');
    if (current.length === 0) return;
    replace(
      current.map((ligne) => ({
        ...ligne,
        stock_dispo: locationStockMap[ligne.produit_id] ?? ligne.stock_dispo,
      })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationStockMap, selectedLocationId]);

  useEffect(() => {
    if (!isEdit || !id) return;
    const load = async () => {
      try {
        setEditLoading(true);
        const res = await devisService.getById(Number(id));
        const devis = res?.data || res;
        if (devis.tiers_id) {
          const tiersRes = await tiersService.getById(devis.tiers_id);
          setValue('client', tiersRes?.data || tiersRes);
        }
        setValue('location_id', devis.location_id || null);
        setValue('date_validite', devis.date_validite || '');
        setValue('notes', devis.notes || '');
        if (Array.isArray(devis.lignes)) {
          replace(
            devis.lignes.map((l: any) => ({
              produit_id: l.produit_id,
              produit_nom: l.produit_nom || '',
              produit_reference: l.reference || '',
              quantite: l.quantite,
              prix_unitaire: Number(l.prix_unitaire),
              prix_revient: Number(l.prix_revient || 0),
              stock_dispo: Number(l.stock_dispo || 0),
            })),
          );
        }
      } catch {
        toast.error('Impossible de charger le devis');
        navigate('/devis');
      } finally {
        setEditLoading(false);
      }
    };
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (produitSearch.length >= 2) {
      ventesService
        .searchFuzzy(produitSearch, 20, selectedLocationId || undefined)
        .then((data) => {
          setProduits(Array.isArray(data) ? data : []);
        })
        .catch(() => setProduits([]));
    } else {
      setProduits([]);
    }
  }, [produitSearch, selectedLocationId]);

  const addProduit = (produit: Produit) => {
    const current = getValues('lignes');
    if (current.some((l) => l.produit_id === produit.id)) {
      toast.warning('Ce produit est déjà dans le devis');
      return;
    }

    const prixVente = parseFloat(produit.prix_vente as any) || 0;
    const prixAchat = parseFloat(produit.prix_achat as any) || 0;
    const fallbackStock =
      typeof produit.stock === 'string' ? parseInt(produit.stock, 10) : Number(produit.stock || 0);
    const stock = selectedLocationId
      ? locationStockMap[produit.id] ?? fallbackStock
      : fallbackStock;

    append({
      produit_id: produit.id,
      produit_nom: produit.nom,
      produit_reference: produit.reference,
      quantite: 1,
      prix_unitaire: prixVente,
      prix_revient: prixAchat,
      stock_dispo: stock,
    });
    setProduitSearch('');
    setProduits([]);
    setShowProduitDropdown(false);
  };

  const updateQuantite = (index: number, quantite: number) => {
    setValue(`lignes.${index}.quantite`, quantite, { shouldValidate: true, shouldDirty: true });
  };

  const updatePrix = (index: number, prix: number) => {
    setValue(`lignes.${index}.prix_unitaire`, prix, { shouldValidate: true, shouldDirty: true });
  };

  const removeLigne = (index: number) => {
    remove(index);
  };

  // Identical math: montant total = Σ (quantité × prix_unitaire).
  const total = watchedLignes.reduce((sum, l) => sum + l.quantite * l.prix_unitaire, 0);

  const onValid = async (values: DevisFormValues) => {
    try {
      const payload = {
        tiers_id: values.client!.id,
        location_id: values.location_id || undefined,
        lignes: values.lignes.map((l) => ({
          produit_id: l.produit_id,
          quantite: l.quantite,
          prix_unitaire: l.prix_unitaire,
        })),
        valid_until: values.date_validite || undefined,
        notes: values.notes || undefined,
      };

      if (isEdit && id) {
        await devisService.update(Number(id), payload);
        toast.success('Devis modifié avec succès');
      } else {
        await devisService.create(payload);
        clear();
        toast.success('Devis créé avec succès');
      }
      navigate('/devis');
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Erreur lors de la sauvegarde du devis');
    }
  };

  if (editLoading) {
    return (
      <div className="p-3 sm:p-6 w-full space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Retour
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">Chargement du devis...</h1>
        </div>
      </div>
    );
  }

  const lignesError = errors.lignes?.message ?? errors.lignes?.root?.message;

  return (
    <div className="p-3 sm:p-6 w-full space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Retour
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <FileText className="h-8 w-8" />
            {isEdit ? 'Modifier le Devis' : 'Nouveau Devis'}
          </h1>
          <p className="text-muted-foreground mt-1">{isEdit ? 'Modifiez le devis client' : 'Créez un nouveau devis client'}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onValid)} className="space-y-6">
        {showDraftBanner && (
          <div className="rounded-lg border bg-muted/50 p-3 text-sm flex items-center justify-between gap-3">
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

        <Card>
          <CardHeader>
            <CardTitle>Client<span className="text-destructive"> *</span></CardTitle>
            <CardDescription>Sélectionnez le client</CardDescription>
          </CardHeader>
          <CardContent>
            <Controller
              control={control}
              name="client"
              render={({ field }) => (
                <TiersPicker role="client" value={field.value} onChange={field.onChange} />
              )}
            />
            {errors.client && (
              <p role="alert" className="mt-1.5 text-xs font-medium text-danger">
                {errors.client.message}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              Produits
            </CardTitle>
            <CardDescription>Ajoutez les produits au devis</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {locations.length > 1 && (
              <div className="max-w-xs">
                <Label
                  htmlFor="devis-location"
                  className="text-xs text-muted-foreground block mb-1.5 font-normal"
                >
                  Magasin (stock)
                </Label>
                <Controller
                  control={control}
                  name="location_id"
                  render={({ field }) => (
                    <Select
                      value={field.value ? String(field.value) : ''}
                      onValueChange={(v) => field.onChange(parseInt(v, 10))}
                    >
                      <SelectTrigger id="devis-location" className="w-full" aria-label="Magasin (stock)">
                        <SelectValue placeholder="Choisir un magasin" />
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
            )}

            <Label
              htmlFor="devis-produit-search"
              className="text-xs text-muted-foreground block mb-1.5 font-normal"
            >
              Rechercher un produit
            </Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                id="devis-produit-search"
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
                    const prixVente = parseFloat(p.prix_vente as any) || 0;
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
                        onMouseDown={() => addProduit(p)}
                        className="flex items-center gap-3 w-full px-3 py-2.5 text-left hover:bg-muted border-b last:border-b-0"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{p.nom}</div>
                          <div className="text-xs text-muted-foreground font-mono">
                            {p.reference} · stock: {stock}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold font-mono">{formatXOF(prixVente)}</div>
                          <div
                            className={`text-[11px] ${
                              stock <= stockMin ? 'text-destructive' : 'text-emerald-600'
                            }`}
                          >
                            {stock <= stockMin ? 'Stock bas' : 'Disponible'}
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
                  <table className="w-full text-sm tabular-nums">
                    <thead className="bg-muted/50">
                      <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
                        <th className="text-left font-semibold px-3 py-2.5">Produit</th>
                        <th className="text-right font-semibold px-3 py-2.5 w-[150px]">Prix unitaire<span className="text-destructive"> *</span></th>
                        <th className="text-center font-semibold px-3 py-2.5 w-[90px]">Qté<span className="text-destructive"> *</span></th>
                        <th className="text-center font-semibold px-3 py-2.5 w-[80px]">Stock</th>
                        <th className="text-right font-semibold px-3 py-2.5 w-[110px]">Marge</th>
                        <th className="text-right font-semibold px-3 py-2.5 w-[120px]">Total</th>
                        <th className="w-8 px-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {fields.map((field, index) => {
                        const ligne = watchedLignes[index] ?? field;
                        const lineTotal = ligne.quantite * ligne.prix_unitaire;
                        const marginPct =
                          ligne.prix_unitaire > 0
                            ? ((ligne.prix_unitaire - ligne.prix_revient) / ligne.prix_unitaire) * 100
                            : 0;
                        const marginAbs = (ligne.prix_unitaire - ligne.prix_revient) * ligne.quantite;
                        const belowCost = ligne.prix_revient > 0 && ligne.prix_unitaire < ligne.prix_revient;
                        const overstock = ligne.quantite > ligne.stock_dispo;
                        const prixError = errors.lignes?.[index]?.prix_unitaire?.message;
                        const qteError = errors.lignes?.[index]?.quantite?.message;
                        return (
                          <tr key={field.id} className="border-t align-middle">
                            <td className="px-3 py-3">
                              <div className="font-medium">{ligne.produit_nom}</div>
                              <div className="text-xs font-mono text-muted-foreground">
                                {ligne.produit_reference}
                              </div>
                            </td>
                            <td className="px-3 py-3 text-right">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={ligne.prix_unitaire === 0 ? '' : ligne.prix_unitaire}
                                onChange={(e) => {
                                  const n = parseFloat(e.target.value);
                                  updatePrix(index, Number.isNaN(n) ? 0 : n);
                                }}
                                className="w-28 px-2 py-1 text-right text-sm border rounded font-mono bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                              />
                              <div className="text-[10px] text-muted-foreground mt-1 flex justify-end items-baseline gap-1">
                                <span className="uppercase tracking-wider">P. revient</span>
                                <span className="font-mono">{formatXOF(ligne.prix_revient)}</span>
                              </div>
                              {prixError && (
                                <p role="alert" className="mt-1 text-[10px] font-medium text-danger">
                                  {prixError}
                                </p>
                              )}
                            </td>
                            <td className="px-3 py-3 text-center">
                              <input
                                type="number"
                                min="1"
                                value={ligne.quantite === 0 ? '' : ligne.quantite}
                                onChange={(e) => {
                                  const n = parseInt(e.target.value, 10);
                                  updateQuantite(index, Number.isNaN(n) ? 0 : n);
                                }}
                                onBlur={(e) => {
                                  if (!e.target.value || parseInt(e.target.value, 10) < 1) {
                                    updateQuantite(index, 1);
                                  }
                                }}
                                className="w-16 px-2 py-1 text-center text-sm border rounded font-mono bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                              />
                              {qteError && (
                                <p role="alert" className="mt-1 text-[10px] font-medium text-danger">
                                  {qteError}
                                </p>
                              )}
                            </td>
                            <td className={`px-3 py-3 text-center font-mono ${overstock ? 'text-destructive' : ''}`}>
                              {ligne.stock_dispo}
                            </td>
                            <td className="px-3 py-3 text-right">
                              <div
                                className={`inline-flex flex-col items-end px-2 py-1 rounded font-mono text-xs font-semibold leading-tight ${
                                  belowCost
                                    ? 'bg-destructive/10 text-destructive'
                                    : 'bg-emerald-500/10 text-emerald-700'
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
                            <td className="px-3 py-3 text-right font-mono font-semibold">
                              {formatXOF(lineTotal)}
                            </td>
                            <td className="px-2 py-3 text-center">
                              <button
                                type="button"
                                className="text-muted-foreground hover:text-destructive p-1"
                                onClick={() => removeLigne(index)}
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
                Aucun produit. Recherchez pour ajouter.
              </div>
            )}
            {lignesError && (
              <p role="alert" className="text-xs font-medium text-danger">
                {lignesError}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Informations complémentaires</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="devis-validite">Date de validité</Label>
              <Input id="devis-validite" type="date" {...register('date_validite')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="devis-notes">Notes</Label>
              <Textarea id="devis-notes" placeholder="Ajoutez une note..." {...register('notes')} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Montant total estimé</p>
              <p className="text-2xl font-bold">{formatXOF(total)}</p>
            </div>
            <Button type="submit" disabled={isSubmitting || editLoading || !selectedClient || fields.length === 0}>
              <Check className="h-4 w-4 mr-2" />
              {isSubmitting ? (isEdit ? 'Enregistrement...' : 'Création...') : (isEdit ? 'Enregistrer les modifications' : 'Créer le devis')}
            </Button>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
