import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { bonLivraisonService, produitService } from '@/services/api';
import { useDraft } from '@/hooks/useDraft';
import { TiersPicker } from '@/components/TiersPicker';
import { Tiers, Produit } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Check, Search, Truck, Users, X } from 'lucide-react';
import { toast } from 'sonner';

const ligneSchema = z.object({
  produit_id: z.number(),
  produit_nom: z.string(),
  produit_reference: z.string(),
  quantite_commandee: z.number().positive('Quantité invalide'),
  quantite_livree: z.number().positive('Quantité invalide'),
  prix_unitaire: z.number().min(0, 'Prix invalide'),
  stock_dispo: z.number(),
});

const blSchema = z.object({
  tiers: z
    .custom<Tiers | null>()
    .refine((t) => !!t?.id, 'Veuillez selectionner un client'),
  devisId: z
    .string()
    .refine((v) => Number(v) > 0, 'Le numero de devis est obligatoire'),
  notes: z.string().optional(),
  lignes: z.array(ligneSchema).min(1, 'Veuillez ajouter au moins un produit'),
});

type BLFormValues = z.infer<typeof blSchema>;

export default function NouveauBonLivraison() {
  const navigate = useNavigate();

  // État UI de la recherche produit — non géré par le formulaire (trop entangled).
  const [produits, setProduits] = useState<Produit[]>([]);
  const [produitSearch, setProduitSearch] = useState('');
  const [showProduitDropdown, setShowProduitDropdown] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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
    if (getValues('lignes').some((l) => l.produit_id === produit.id)) {
      toast.warning('Ce produit est deja dans le bon de livraison');
      return;
    }

    const stock = typeof produit.stock === 'string' ? parseInt(produit.stock) : produit.stock;
    const prixVente = parseFloat(produit.prix_vente as any) || 0;

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
    (sum, l) => sum + Number(l.quantite_livree || 0) * Number(l.prix_unitaire || 0) * 1.19,
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
      toast.success(`Bon de livraison ${result.numero_bl || ''} cree avec succes`.trim());
      navigate('/bons-livraison');
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Erreur lors de la creation du bon de livraison');
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
            Nouveau Bon de Livraison
          </h1>
          <p className="text-muted-foreground mt-1">Creez un nouveau bon de livraison client</p>
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
            <CardDescription>Le bon de livraison doit être lié à un devis confirmé</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              <Label htmlFor="bl-devis-id">Devis<span className="text-destructive"> *</span></Label>
              <Input
                id="bl-devis-id"
                type="number"
                min={1}
                placeholder="ID du devis"
                aria-invalid={errors.devisId ? true : undefined}
                {...register('devisId')}
              />
              {errors.devisId && (
                <p role="alert" className="text-xs text-danger">
                  {errors.devisId.message}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Client<span className="text-destructive"> *</span></CardTitle>
            <CardDescription>Selectionnez le client</CardDescription>
          </CardHeader>
          <CardContent>
            <Controller
              control={control}
              name="tiers"
              render={({ field }) => (
                <TiersPicker role="client" value={field.value} onChange={field.onChange} />
              )}
            />
            {errors.tiers && (
              <p role="alert" className="text-xs text-danger mt-1.5">
                {errors.tiers.message}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Produits
            </CardTitle>
            <CardDescription>Ajoutez les produits a livrer</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Label htmlFor="bl-produit-search" className="block mb-1.5">
              Rechercher un produit
            </Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="bl-produit-search"
                className="pl-10 sm:pl-10"
                placeholder="Rechercher un produit..."
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
                  {produits.map((p) => (
                    <li
                      key={p.id}
                      className="px-4 py-3 hover:bg-muted cursor-pointer transition-colors flex justify-between border-b last:border-b-0"
                      onMouseDown={() => addProduit(p)}
                    >
                      <div>
                        <p className="font-semibold">{p.nom}</p>
                        <p className="text-sm text-muted-foreground font-mono">{p.reference}</p>
                      </div>
                      <p className="font-semibold">{parseFloat(p.prix_vente as any || 0).toFixed(2)} XOF</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produit</TableHead>
                    <TableHead className="w-28">Qte Commandee<span className="text-destructive"> *</span></TableHead>
                    <TableHead className="w-28">Qte Livree<span className="text-destructive"> *</span></TableHead>
                    <TableHead className="w-36">Prix Unitaire<span className="text-destructive"> *</span></TableHead>
                    <TableHead className="w-32">Total TTC</TableHead>
                    <TableHead className="w-16"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fields.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        Aucun produit ajoute
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
                              type="number"
                              min={1}
                              aria-invalid={errors.lignes?.[index]?.quantite_commandee ? true : undefined}
                              {...register(`lignes.${index}.quantite_commandee` as const, { valueAsNumber: true })}
                            />
                            {errors.lignes?.[index]?.quantite_commandee && (
                              <p role="alert" className="text-xs text-danger mt-1">
                                {errors.lignes[index]?.quantite_commandee?.message}
                              </p>
                            )}
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={1}
                              aria-invalid={errors.lignes?.[index]?.quantite_livree ? true : undefined}
                              {...register(`lignes.${index}.quantite_livree` as const, { valueAsNumber: true })}
                            />
                            {errors.lignes?.[index]?.quantite_livree && (
                              <p role="alert" className="text-xs text-danger mt-1">
                                {errors.lignes[index]?.quantite_livree?.message}
                              </p>
                            )}
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              aria-invalid={errors.lignes?.[index]?.prix_unitaire ? true : undefined}
                              {...register(`lignes.${index}.prix_unitaire` as const, { valueAsNumber: true })}
                            />
                            {errors.lignes?.[index]?.prix_unitaire && (
                              <p role="alert" className="text-xs text-danger mt-1">
                                {errors.lignes[index]?.prix_unitaire?.message}
                              </p>
                            )}
                          </TableCell>
                          <TableCell className="font-semibold">
                            {(Number(ligne.quantite_livree || 0) * Number(ligne.prix_unitaire || 0) * 1.19).toFixed(2)} XOF
                          </TableCell>
                          <TableCell>
                            <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}>
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
            {errors.lignes?.root && (
              <p role="alert" className="text-xs text-danger">
                {errors.lignes.root.message}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Informations complementaires</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="Notes internes ou instructions de livraison..."
              rows={4}
              {...register('notes')}
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total estime (TTC)</p>
              <p className="text-2xl font-bold">{total.toFixed(2)} XOF</p>
            </div>
            <Button type="submit" disabled={submitting || !selectedClient || fields.length === 0}>
              <Check className="h-4 w-4 mr-2" />
              {submitting ? 'Creation...' : 'Creer le bon de livraison'}
            </Button>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
