import * as React from 'react';
import { toast } from 'sonner';
import { AlertCircle } from 'lucide-react';
import { tiersService } from '@/services/api';
import type { Tiers } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { FieldError, fieldErrorProps } from '@/components/ui/field-error';
import { RequiredMark } from '@/components/ui/required-mark';
import { Spinner } from '@/components/ui/loading';
import { getErrorMessage } from '@/utils/errors';

type FieldName = 'raison_sociale' | 'prenom' | 'telephone' | 'email' | 'adresse';

type Values = Record<FieldName, string>;

const EMPTY: Values = { raison_sociale: '', prenom: '', telephone: '', email: '', adresse: '' };

const FIELD_IDS: Record<FieldName, string> = {
  raison_sociale: 'nouveau-client-nom',
  prenom: 'nouveau-client-prenom',
  telephone: 'nouveau-client-telephone',
  email: 'nouveau-client-email',
  adresse: 'nouveau-client-adresse',
};

const ORDER: FieldName[] = ['raison_sociale', 'prenom', 'telephone', 'email', 'adresse'];

/** Mêmes règles et mêmes messages que `createTiersSchema` côté serveur. */
function validate(values: Values): Partial<Record<FieldName, string>> {
  const errors: Partial<Record<FieldName, string>> = {};
  if (!values.raison_sociale.trim()) errors.raison_sociale = 'Saisissez le nom ou la raison sociale.';
  else if (values.raison_sociale.trim().length > 255) errors.raison_sociale = '255 caractères au maximum.';
  if (values.prenom.trim().length > 100) errors.prenom = '100 caractères au maximum.';
  if (values.telephone.trim().length > 20) errors.telephone = '20 caractères au maximum.';
  const email = values.email.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Saisissez une adresse e-mail valide (ex. : nom@entreprise.ci).';
  if (values.adresse.trim().length > 1000) errors.adresse = '1 000 caractères au maximum.';
  return errors;
}

/** Erreurs par champ renvoyées par le middleware de validation (`details[]`). */
function serverFieldErrors(err: unknown): Partial<Record<FieldName, string>> {
  const details = (err as { response?: { data?: { details?: unknown } } })?.response?.data?.details;
  const out: Partial<Record<FieldName, string>> = {};
  if (!Array.isArray(details)) return out;
  for (const d of details) {
    const field = (d as { field?: unknown })?.field;
    const message = (d as { message?: unknown })?.message;
    if (typeof field === 'string' && typeof message === 'string' && (ORDER as string[]).includes(field)) {
      out[field as FieldName] ??= message;
    }
  }
  return out;
}

export interface NouveauClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Nom tapé dans la recherche : prérempli. */
  initialName?: string;
  /** Client créé (ligne complète renvoyée par l'API). */
  onCreated: (client: Tiers) => void;
}

/**
 * Création rapide d'un CLIENT depuis un formulaire de vente (D4) : nom,
 * prénom, téléphone, e-mail, adresse. Ouverte au caissier et au personnel du
 * magasin ; jamais de fournisseur ni de plafond de crédit (fixés par le
 * gérant). Le client créé est choisi pour le document en cours.
 */
export function NouveauClientDialog({ open, onOpenChange, initialName = '', onCreated }: NouveauClientDialogProps) {
  const [values, setValues] = React.useState<Values>(EMPTY);
  const [errors, setErrors] = React.useState<Partial<Record<FieldName, string>>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setValues({ ...EMPTY, raison_sociale: initialName.trim() });
      setErrors({});
      setFormError(null);
      setSubmitting(false);
    }
  }, [open, initialName]);

  const set = (name: FieldName) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = e.target.value;
    setValues((v) => ({ ...v, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const focusFirst = (errs: Partial<Record<FieldName, string>>) => {
    const first = ORDER.find((name) => errs[name]);
    if (first) document.getElementById(FIELD_IDS[first])?.focus();
  };

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    // La fenêtre vit dans un portail, mais l'événement remonte l'arbre React :
    // sans `stopPropagation`, il soumettrait aussi la facture en dessous.
    e.preventDefault();
    e.stopPropagation();
    if (submitting) return;
    const errs = validate(values);
    setErrors(errs);
    setFormError(null);
    if (Object.keys(errs).length > 0) {
      focusFirst(errs);
      return;
    }
    setSubmitting(true);
    try {
      const created = await tiersService.createClient({
        raison_sociale: values.raison_sociale.trim(),
        prenom: values.prenom.trim() || undefined,
        telephone: values.telephone.trim() || undefined,
        email: values.email.trim() || undefined,
        adresse: values.adresse.trim() || undefined,
      });
      const name = [created?.raison_sociale ?? values.raison_sociale.trim(), created?.prenom]
        .filter(Boolean)
        .join(' ');
      toast.success(`Client ${name} créé`);
      onCreated(created as Tiers);
      onOpenChange(false);
    } catch (err) {
      const fieldErrs = serverFieldErrors(err);
      if (Object.keys(fieldErrs).length > 0) {
        setErrors(fieldErrs);
        focusFirst(fieldErrs);
      } else {
        setFormError(getErrorMessage(err, 'Impossible de créer le client. Vérifiez votre connexion puis réessayez.'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const field = (name: FieldName) => ({
    id: FIELD_IDS[name],
    value: values[name],
    onChange: set(name),
    ...fieldErrorProps(FIELD_IDS[name], errors[name]),
  });

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nouveau client</DialogTitle>
          <DialogDescription>
            Le client est ajouté à vos contacts et choisi pour ce document. Son plafond de crédit est fixé par le
            gérant.
          </DialogDescription>
        </DialogHeader>

        <form noValidate onSubmit={submit} className="space-y-4">
          {formError && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-md border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {formError}
            </p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor={FIELD_IDS.raison_sociale}>
              Nom ou raison sociale
              <RequiredMark />
            </Label>
            <Input {...field('raison_sociale')} autoComplete="off" autoFocus />
            <FieldError id={FIELD_IDS.raison_sociale}>{errors.raison_sociale}</FieldError>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={FIELD_IDS.prenom}>Prénom</Label>
              <Input {...field('prenom')} autoComplete="off" />
              <FieldError id={FIELD_IDS.prenom}>{errors.prenom}</FieldError>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={FIELD_IDS.telephone}>Téléphone</Label>
              <Input {...field('telephone')} type="tel" inputMode="tel" autoComplete="off" />
              <FieldError id={FIELD_IDS.telephone}>{errors.telephone}</FieldError>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={FIELD_IDS.email}>Adresse e-mail</Label>
            <Input {...field('email')} type="email" inputMode="email" autoComplete="off" />
            <FieldError id={FIELD_IDS.email}>{errors.email}</FieldError>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={FIELD_IDS.adresse}>Adresse</Label>
            <Textarea {...field('adresse')} rows={2} />
            <FieldError id={FIELD_IDS.adresse}>{errors.adresse}</FieldError>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" size="touch" onClick={() => onOpenChange(false)} disabled={submitting}>
              Annuler
            </Button>
            <Button type="submit" size="touch" disabled={submitting}>
              {submitting ? (
                <>
                  <Spinner className="mr-2" />
                  Création du client…
                </>
              ) : (
                'Créer le client'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
