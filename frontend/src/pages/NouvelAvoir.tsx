import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { ArrowLeft, Check, Plus, X } from 'lucide-react';
import { creditNoteService } from '@/services/api';
import { useDraft } from '@/hooks/useDraft';
import { TiersPicker } from '@/components/TiersPicker';
import { Tiers } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const ligneSchema = z.object({
  description: z.string().trim().min(1, 'Chaque ligne doit contenir une description'),
  quantite: z.number().positive('Quantité ou prix invalide'),
  prix_unitaire: z.number().min(0, 'Quantité ou prix invalide'),
});

const avoirSchema = z.object({
  tiers: z
    .custom<Tiers | null>()
    .refine((t) => !!t?.id, 'Le tiers (client) est obligatoire'),
  factureId: z
    .string()
    .refine((v) => Number(v) > 0, "La facture d origine est obligatoire"),
  notes: z.string().optional(),
  lignes: z.array(ligneSchema).min(1, 'Ajoutez au moins une ligne'),
});

type AvoirFormValues = z.infer<typeof avoirSchema>;

export default function NouvelAvoir() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  const {
    control,
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isDirty },
  } = useForm<AvoirFormValues>({
    resolver: zodResolver(avoirSchema),
    defaultValues: {
      tiers: null,
      factureId: '',
      notes: '',
      lignes: [{ description: '', quantite: 1, prix_unitaire: 0 }],
    },
  });

  // --- Draft autosave + unsaved-changes guard ------------------------------
  const { draft, save, clear, hasDraft } = useDraft<AvoirFormValues>('avoir:new');
  const [showDraftBanner, setShowDraftBanner] = useState(hasDraft);

  useEffect(() => {
    const sub = watch((v) => save(v as AvoirFormValues));
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

  // Total HT calculé en direct depuis les valeurs surveillées (identique).
  const watchedLignes = watch('lignes');
  const total = (watchedLignes ?? []).reduce(
    (sum, ligne) => sum + Number(ligne.quantite || 0) * Number(ligne.prix_unitaire || 0),
    0
  );

  const onValid = async (values: AvoirFormValues) => {
    setSubmitting(true);
    try {
      await creditNoteService.createManual({
        tiers_id: values.tiers!.id,
        facture_origine_id: Number(values.factureId),
        lignes: values.lignes.map((ligne) => ({
          description: ligne.description,
          quantite: Number(ligne.quantite),
          prix_unitaire: Number(ligne.prix_unitaire),
        })),
        notes: values.notes || undefined,
        avoir_type: 'erreur',
      });
      clear();
      toast.success('Avoir créé avec succès');
      navigate('/avoirs');
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Erreur lors de la création de l avoir');
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
          <h1 className="text-3xl font-bold tracking-tight">Nouvel Avoir</h1>
          <p className="text-muted-foreground mt-1">Créer un avoir lié à une facture validée</p>
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
            <CardTitle>Références</CardTitle>
            <CardDescription>Un avoir doit être lié à une facture d origine</CardDescription>
          </CardHeader>
          <CardContent className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Label className="block mb-1.5">
                Client (Tiers)<span className="text-destructive"> *</span>
              </Label>
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
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="avoir-facture-origine">Facture d origine<span className="text-destructive"> *</span></Label>
              <Input
                id="avoir-facture-origine"
                type="number"
                min={1}
                placeholder="ID Facture d origine"
                aria-invalid={errors.factureId ? true : undefined}
                {...register('factureId')}
              />
              {errors.factureId && (
                <p role="alert" className="text-xs text-danger">
                  {errors.factureId.message}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lignes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description<span className="text-destructive"> *</span></TableHead>
                  <TableHead className="w-32">Quantité<span className="text-destructive"> *</span></TableHead>
                  <TableHead className="w-40">Prix unitaire<span className="text-destructive"> *</span></TableHead>
                  <TableHead className="w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fields.map((field, index) => (
                  <TableRow key={field.id}>
                    <TableCell>
                      <Input
                        aria-label="Description"
                        placeholder="Motif / produit"
                        aria-invalid={errors.lignes?.[index]?.description ? true : undefined}
                        {...register(`lignes.${index}.description` as const)}
                      />
                      {errors.lignes?.[index]?.description && (
                        <p role="alert" className="text-xs text-danger mt-1">
                          {errors.lignes[index]?.description?.message}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <Input
                        aria-label="Quantité"
                        type="number"
                        min={1}
                        aria-invalid={errors.lignes?.[index]?.quantite ? true : undefined}
                        {...register(`lignes.${index}.quantite` as const, { valueAsNumber: true })}
                      />
                      {errors.lignes?.[index]?.quantite && (
                        <p role="alert" className="text-xs text-danger mt-1">
                          {errors.lignes[index]?.quantite?.message}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <Input
                        aria-label="Prix"
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
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => remove(index)}
                        disabled={fields.length === 1}
                        aria-label="Retirer cette ligne"
                        title="Retirer cette ligne"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {errors.lignes?.root && (
              <p role="alert" className="text-xs text-danger">
                {errors.lignes.root.message}
              </p>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => append({ description: '', quantite: 1, prix_unitaire: 0 })}
            >
              <Plus className="h-4 w-4 mr-2" />
              Ajouter une ligne
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea placeholder="Commentaires optionnels" rows={3} {...register('notes')} />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Montant estimé HT</p>
              <p className="text-2xl font-bold">{total.toFixed(2)} XOF</p>
            </div>
            <Button type="submit" disabled={submitting}>
              <Check className="h-4 w-4 mr-2" />
              {submitting ? 'Création...' : 'Créer avoir'}
            </Button>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
