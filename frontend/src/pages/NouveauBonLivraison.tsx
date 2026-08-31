import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { bonLivraisonService, devisService, produitService } from '@/services/api';
import { formatCurrency } from '@/utils/format';
import { DocumentPicker, DocumentOption } from '@/components/DocumentPicker';
import { useDraft } from '@/hooks/useDraft';
import { TiersPicker } from '@/components/TiersPicker';
import { Tiers, Produit } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FieldError, fieldErrorProps } from '@/components/ui/field-error';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Check, Package, Search, Truck, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { getValidSalePrice } from '@/utils/salesPrice';
import { getErrorMessage } from '@/utils/errors';

const ligneSchema = z.object({
  produit_id: z.number(),
  produit_nom: z.string(),
  produit_reference: z.string(),
  quantite_commandee: z.number().positive('Quantité invalide'),
  quantite_livree: z.number().positive('Quantité invalide'),
  prix_unitaire: z.number().positive('Le prix doit être supérieur à zéro'),
  stock_dispo: z.number(),
});

const blSchema = z.object({
  tiers: z
    .custom<Tiers | null>()
    .refine((t) => !!t?.id, 'Veuillez sélectionner un client'),
  devisId: z
    .string()
    .refine((v) => Number(v) > 0, 'Le numéro de devis est obligatoire'),
  notes: z.string().optional(),
  lignes: z.array(ligneSchema).min(1, 'Veuillez ajouter au moins un produit'),
});

type BLFormValues = z.infer<typeof blSchema>;

const searchDevisAcceptes = async (q: string): Promise<DocumentOption[]> => {
  const res = await devisService.getAll(q, 'accepte', 1, 10);
  const rows: any[] = res?.data ?? [];
  return rows.map((d) => ({
    id: d.id,
    numero: d.numero_devis,
    tiers_nom: `${d.client_nom || ''} ${d.client_prenom || ''}`.trim() || null,
    montant: d.montant_total ?? d.total ?? null,
    date: d.date_devis,
    statut: d.statut,
  }));
};

export default function NouveauBonLivraison() {
  const navigate = useNavigate();

  // État UI de la recherche produit — non géré par le formulaire (trop entangled).
  const [produits, setProduits] = useState<Produit[]>([]);
  const [produitSearch, setProduitSearch] = useState('');
  const [showProduitDropdown, setShowProduitDropdown] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedDevis, setSelectedDevis] = useState<DocumentOption | null>(null);

  const {
    control,
    register,
    handleSubmit,
    watch,
    reset,
    getValues,
    formState: { errors, isDirty },
  } = useForm<BLFormValues>({
    resolver: zodResolver(blSchema),
    defaultValues: {
      tiers: null,
      devisId: '',
      notes: '',
      lignes: [],
    },
  });

  // --- Draft autosave + unsaved-changes guard ------------------------------
  const { draft, save, clear, hasDraft } = useDraft<BLFormValues>('bl:new');
  const [showDraftBanner, setShowDraftBanner] = useState(hasDraft);

  useEffect(() => {
    const sub = watch((v) => save(v as BLFormValues));
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

  useEffect(() => {
    if (produitSearch.length >= 2) {
      produitService.searchFuzzy(produitSearch, 10, 0.1).then(setProduits).catch(() => setProduits([]));
    } else {
      setProduits([]);
    }
  }, [produitSearch]);

  const addProduit = (produit: Produit) => {
    const prixVente = getValidSalePrice(produit.prix_vente);
    if (prixVente === null) {
      toast.error(
        'Prix de vente non renseigné. Corrigez la fiche produit avant de continuer.'
      );
      return;
    }

    if (getValues('lignes').some((l) => l.produit_id === produit.id)) {
      toast.warning('Ce produit est déjà dans le bon de livraison');
      return;
    }

    const stock = typeof produit.stock === 'string' ? parseInt(produit.stock) : produit.stock;

    append({
      produit_id: produit.id,
      produit_nom: produit.nom,
      produit_reference: produit.reference,
      quantite_commandee: 1,
      quantite_livree: 1,
      prix_unitaire: prixVente,
      stock_dispo: stock,
    });

    setProduitSearch('');
    setProduits([]);
    setShowProduitDropdown(false);
  };

  // Valeurs surveillées pour les totaux et l'état du bouton (calcul identique).
  const selectedClient = watch('tiers');
  const watchedLignes = watch('lignes');
  const total = (watchedLignes ?? []).reduce(
    (sum, l) => sum + Number(l.quantite_livree || 0) * Number(l.prix_unitaire || 0),
    0
  );

  const onValid = async (values: BLFormValues) => {
    setSubmitting(true);
    try {
      const result = await bonLivraisonService.create({
        tiers_id: values.tiers!.id,
        devis_id: Number(values.devisId),
        lignes: values.lignes.map((l) => ({
          produit_id: l.produit_id,
          quantite_commandee: l.quantite_commandee,
          quantite_livree: l.quantite_livree,
          prix_unitaire: l.prix_unitaire,
        })),
        notes: values.notes || undefined,
      });

      clear();
      toast.success(`Bon de livraison ${result.numero_bl || ''} créé avec succès`.trim());
      navigate('/bons-livraison');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Erreur lors de la création du bon de livraison'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-3 sm:p-6 w-full space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Retour
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Truck className="h-8 w-8" />
            Nouveau bon de livraison
          </h1>
          <p className="text-muted-foreground mt-1">Créez un nouveau bon de livraison client</p>
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
            <CardTitle>Devis parent</CardTitle>
            <CardDescription>Le bon de livraison doit être lié à un devis accepté</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              <Label htmlFor="bl-devis-id">Devis<span className="text-destructive"> *</span></Label>
              <Controller
                control={control}
                name="devisId"
                render={({ field }) => (
                  <DocumentPicker
                    inputId="bl-devis-id"
                    value={field.value ? selectedDevis : null}
                    fallbackId={field.value && !selectedDevis ? field.value : undefined}
                    onChange={(doc) => {
                      setSelectedDevis(doc);
                      field.onChange(doc ? String(doc.id) : '');
                    }}
                    search={searchDevisAcceptes}
                    placeholder="Rechercher un devis accepté (numéro, client)…"
                    {...fieldErrorProps('bl-devis-id', errors.devisId)}
                  />
                )}
              />
              <FieldError id="bl-devis-id">{errors.devisId?.message}</FieldError>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Client<span className="text-destructive"> *</span></CardTitle>
            <CardDescription>Sélectionnez le client</CardDescription>
          </CardHeader>
          <CardContent>
            <Controller
              control={control}
              name="tiers"
              render={({ field }) => (
                <TiersPicker
                  role="client"
                  value={field.value}
                  onChange={field.onChange}
                  {...fieldErrorProps('bl-tiers', errors.tiers)}
                />
              )}
            />
            <FieldError id="bl-tiers" className="mt-1.5">{errors.tiers?.message}</FieldError>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Produits
            </CardTitle>
            <CardDescription>Ajoutez les produits à livrer</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Label htmlFor="bl-produit-search" className="block mb-1.5">
              Rechercher un produit
            </Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="bl-produit-search"
                className="pl-10 sm:pl-10"
                placeholder="Rechercher un produit…"
                value={produitSearch}
                onChange={(e) => {
                  setProduitSearch(e.target.value);
                  setShowProduitDropdown(true);
                }}
                onFocus={() => setShowProduitDropdown(true)}
                onBlur={() => setTimeout(() => setShowProduitDropdown(false), 200)}
              />
              {showProduitDropdown && produits.length > 0 && (
                <ul className="absolute z-10 w-full mt-1 bg-background border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {produits.map((p) => {
                    const prixVente = getValidSalePrice(p.prix_vente);
                    const prixManquant = prixVente === null;
                    return (
                      <li key={p.id} className="border-b last:border-b-0">
                        <button
                          type="button"
                          disabled={prixManquant}
                          onMouseDown={(event) => {
                            event.preventDefault();
                            if (!prixManquant) addProduit(p);
                          }}
                          title={prixManquant ? 'Renseignez le prix de vente dans la fiche produit' : undefined}
                          className={`w-full px-4 py-3 transition-colors flex justify-between text-left ${
                            prixManquant
                              ? 'cursor-not-allowed bg-destructive/5 opacity-70'
                              : 'hover:bg-muted'
                          }`}
                        >
                          <div>
                            <p className="font-semibold">{p.nom}</p>
                            <p className="text-sm text-muted-foreground font-mono">{p.reference}</p>
                          </div>
                          <div className="text-right">
                            <p className={`font-semibold ${prixManquant ? 'text-destructive' : ''}`}>
                              {prixManquant ? 'Prix non renseigné' : formatCurrency(prixVente)}
                            </p>
                            {prixManquant && (
                              <p className="text-xs text-destructive">Corriger dans l’inventaire</p>
                            )}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produit</TableHead>
                    <TableHead className="w-28">Qté commandée<span className="text-destructive"> *</span></TableHead>
                    <TableHead className="w-28">Qté livrée<span className="text-destructive"> *</span></TableHead>
                    <TableHead className="w-36">Prix unitaire<span className="text-destructive"> *</span></TableHead>
                    <TableHead className="w-32">Total</TableHead>
                    <TableHead className="w-16"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fields.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="p-0 sm:p-0">
                        <EmptyState
                          icon={Package}
                          title="Aucun article ajouté au bon de livraison"
                          description="Recherchez un produit ci-dessus pour l'ajouter à la livraison."
                          className="py-8"
                        />
                      </TableCell>
                    </TableRow>
                  ) : (
                    fields.map((field, index) => {
                      const ligne = watchedLignes?.[index] ?? field;
                      return (
                        <TableRow key={field.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{field.produit_nom}</p>
                              <p className="text-xs text-muted-foreground font-mono">{field.produit_reference}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Input
                              id={`bl-ligne-${index}-quantite-commandee`}
                              type="number" inputMode="numeric"
                              min={1}
                              {...fieldErrorProps(
                                `bl-ligne-${index}-quantite-commandee`,
                                errors.lignes?.[index]?.quantite_commandee,
                              )}
                              {...register(`lignes.${index}.quantite_commandee` as const, { valueAsNumber: true })}
                            />
                            <FieldError id={`bl-ligne-${index}-quantite-commandee`}>
                              {errors.lignes?.[index]?.quantite_commandee?.message}
                            </FieldError>
                          </TableCell>
                          <TableCell>
                            <Input
                              id={`bl-ligne-${index}-quantite-livree`}
                              type="number" inputMode="numeric"
                              min={1}
                              {...fieldErrorProps(
                                `bl-ligne-${index}-quantite-livree`,
                                errors.lignes?.[index]?.quantite_livree,
                              )}
                              {...register(`lignes.${index}.quantite_livree` as const, { valueAsNumber: true })}
                            />
                            <FieldError id={`bl-ligne-${index}-quantite-livree`}>
                              {errors.lignes?.[index]?.quantite_livree?.message}
                            </FieldError>
                          </TableCell>
                          <TableCell>
                            <Input
                              id={`bl-ligne-${index}-prix`}
                              type="number" inputMode="decimal"
                              min={0}
                              step="0.01"
                              {...fieldErrorProps(
                                `bl-ligne-${index}-prix`,
                                errors.lignes?.[index]?.prix_unitaire,
                              )}
                              {...register(`lignes.${index}.prix_unitaire` as const, { valueAsNumber: true })}
                            />
                            <FieldError id={`bl-ligne-${index}-prix`}>
                              {errors.lignes?.[index]?.prix_unitaire?.message}
                            </FieldError>
                          </TableCell>
                          <TableCell className="font-semibold">
                            {formatCurrency(Number(ligne.quantite_livree || 0) * Number(ligne.prix_unitaire || 0))}
                          </TableCell>
                          <TableCell>
                            <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} aria-label="Retirer cette ligne">
                              <X className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
            <FieldError id="bl-lignes">{errors.lignes?.root?.message}</FieldError>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Informations complémentaires</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="Notes internes ou instructions de livraison…"
              rows={4}
              {...register('notes')}
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total estimé</p>
              <p className="text-2xl font-bold">{formatCurrency(total)}</p>
            </div>
            <Button type="submit" disabled={submitting || !selectedClient || fields.length === 0}>
              <Check className="h-4 w-4 mr-2" />
              {submitting ? 'Création…' : 'Créer le bon de livraison'}
            </Button>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
