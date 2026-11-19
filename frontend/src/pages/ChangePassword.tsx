import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { AlertCircle, Check, Circle, LogOut } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { authService } from '../services/authService';
import { useCompanyBrand } from '@/lib/brand';
import { BrandMark } from '@/components/BrandMark';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { FieldError, fieldErrorProps } from '@/components/ui/field-error';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import { Spinner } from '@/components/ui/loading';
import { cn } from '@/lib/utils';
import { isStrongPassword, passwordRules, PASSWORD_POLICY_MESSAGE } from '../utils/password';
import { getErrorMessage, isCredentialError } from '@/utils/errors';
import { LOGIN_NOTICE_MESSAGES, leaveLoginNotice } from '@/lib/loginNotice';

type Field = 'current' | 'new' | 'confirm';
type Errors = Partial<Record<Field | 'form', string>>;

/**
 * Règles du nouveau mot de passe, cochées pendant la saisie. Une règle pas
 * encore remplie est un cercle neutre — la croix rouge affichée avant toute
 * saisie annonçait une faute qui n'avait pas eu lieu —, une règle remplie une
 * coche. Partagée avec « Mon profil » : les deux formulaires disent la même chose.
 */
export function PasswordRules({ id, password }: { id: string; password: string }) {
  return (
    <div id={id} className="space-y-1 pt-1">
      <p className="text-xs text-muted-foreground">Le mot de passe doit contenir :</p>
      <ul className="space-y-0.5">
        {passwordRules(password).map((rule) => (
          <li
            key={rule.label}
            className={cn('flex items-center gap-1.5 text-xs', rule.ok ? 'text-success-700' : 'text-muted-foreground')}
          >
            {rule.ok ? (
              <Check className="h-3.5 w-3.5 shrink-0 text-success-700" aria-hidden="true" />
            ) : (
              <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            )}
            {rule.label.charAt(0).toLocaleLowerCase('fr-FR') + rule.label.slice(1)}
            <span className="sr-only">{rule.ok ? ' : respecté' : ' : pas encore respecté'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Changement de mot de passe imposé à la première connexion (compte créé avec
 * un mot de passe provisoire). Hors du cadre de l'application : la session
 * existe, mais aucune autre page n'est ouverte tant que ce n'est pas fait.
 */
export default function ChangePassword() {
  useDocumentTitle('Changer le mot de passe');
  const { logout } = useAuth();
  const brand = useCompanyBrand();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const refs = {
    current: useRef<HTMLInputElement>(null),
    new: useRef<HTMLInputElement>(null),
    confirm: useRef<HTMLInputElement>(null),
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const next: Errors = {};
    if (!currentPassword) next.current = 'Saisissez votre mot de passe actuel.';
    if (!isStrongPassword(newPassword)) next.new = PASSWORD_POLICY_MESSAGE;
    else if (newPassword === currentPassword) next.new = 'Choisissez un mot de passe différent de l’actuel.';
    if (!next.new && newPassword !== confirm) next.confirm = 'Les deux mots de passe ne correspondent pas.';
    setErrors(next);
    const firstInvalid = (['current', 'new', 'confirm'] as const).find((f) => next[f]);
    if (firstInvalid) {
      refs[firstInvalid].current?.focus();
      return;
    }

    setLoading(true);
    try {
      await authService.changePassword(currentPassword, newPassword);
      leaveLoginNotice('mot-de-passe-modifie');
      toast.success(LOGIN_NOTICE_MESSAGES['mot-de-passe-modifie']);
      await logout();
    } catch (err) {
      // Mot de passe actuel incorrect : l'erreur va sous le champ concerné, et
      // la session reste ouverte (avant, ce 401 déconnectait le nouvel employé).
      if (isCredentialError(err)) {
        setErrors({ current: getErrorMessage(err) });
        refs.current.current?.focus();
      } else {
        setErrors({ form: getErrorMessage(err, 'Impossible de changer le mot de passe. Réessayez.') });
      }
    } finally {
      setLoading(false);
    }
  };

  const newDescribedBy = ['new-rules', errors.new && 'new-error'].filter(Boolean).join(' ');

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-8">
      <div className="w-full max-w-md space-y-6">
        {/* Même en-tête que la connexion : la marque et son nom, puis le titre. */}
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex flex-col items-center gap-1">
            <BrandMark size="lg" />
            <p className="text-sm font-medium">{brand.name}</p>
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-balance">Changement de mot de passe requis</h1>
            <p className="text-sm text-muted-foreground text-pretty">
              Remplacez le mot de passe provisoire par le vôtre pour continuer
            </p>
          </div>
        </div>

        <Card>
          <CardContent inset="standalone" className="space-y-4 sm:p-6">
            {errors.form && (
              <div role="alert" className="flex items-start gap-2 rounded-md border border-danger-200 bg-danger-50 p-3 text-sm">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger-700" aria-hidden="true" />
                <span>{errors.form}</span>
              </div>
            )}

            <form noValidate onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="current">Mot de passe actuel</Label>
                <PasswordInput
                  ref={refs.current}
                  id="current"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoFocus
                  autoComplete="current-password"
                  {...fieldErrorProps('current', errors.current)}
                />
                <FieldError id="current">{errors.current}</FieldError>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="new">Nouveau mot de passe</Label>
                <PasswordInput
                  ref={refs.new}
                  id="new"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  aria-invalid={errors.new ? true : undefined}
                  aria-describedby={newDescribedBy}
                />
                <PasswordRules id="new-rules" password={newPassword} />
                <FieldError id="new">{errors.new}</FieldError>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirm">Confirmer le nouveau mot de passe</Label>
                <PasswordInput
                  ref={refs.confirm}
                  id="confirm"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  {...fieldErrorProps('confirm', errors.confirm)}
                />
                <FieldError id="confirm">{errors.confirm}</FieldError>
              </div>

              <Button type="submit" size="touch" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Spinner />
                    Enregistrement…
                  </>
                ) : (
                  'Changer le mot de passe'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="flex justify-center">
          <Button variant="ghost" className="gap-2 text-muted-foreground" onClick={() => void logout()}>
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Se déconnecter
          </Button>
        </div>
      </div>
    </main>
  );
}
