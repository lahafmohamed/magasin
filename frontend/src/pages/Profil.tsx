import { useEffect, useId, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { AlertCircle, Keyboard } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { authService } from '../services/authService';
import { useSingleKeyShortcuts } from '@/lib/shortcutPreferences';
import { openShortcutsHelp } from '@/hooks/useKeyboardShortcuts';
import { PageShell } from '@/components/ui/page-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { FieldError, fieldErrorProps } from '@/components/ui/field-error';
import { KeyValue, KeyValueList } from '@/components/ui/key-value';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import { Spinner } from '@/components/ui/loading';
import { formatDateTime } from '../utils/format';
import { getErrorMessage, isCredentialError } from '@/utils/errors';
import { LOGIN_NOTICE_MESSAGES, leaveLoginNotice } from '@/lib/loginNotice';
import { isStrongPassword, PASSWORD_POLICY_MESSAGE } from '../utils/password';
import { formatRole } from '../utils/roles';
import { PasswordRules } from './ChangePassword';

type Field = 'current' | 'new' | 'confirm';
type Errors = Partial<Record<Field | 'form', string>>;

/** Ancre du menu utilisateur « Changer mon mot de passe » (`/profil#mot-de-passe`). */
const PASSWORD_ANCHOR = 'mot-de-passe';

function NotSet({ children }: { children: string }) {
  return <span className="font-normal text-muted-foreground">{children}</span>;
}

/** Touche de raccourci, dessinée comme une touche de clavier. */
function Key({ children }: { children: string }) {
  return <kbd className="rounded border bg-muted px-1 font-sans text-xs">{children}</kbd>;
}

export default function Profil() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [singleKeyShortcuts, setSingleKeyShortcuts] = useSingleKeyShortcuts();
  const passwordTitleId = useId();
  const sectionRef = useRef<HTMLElement>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const refs = {
    current: useRef<HTMLInputElement>(null),
    new: useRef<HTMLInputElement>(null),
    confirm: useRef<HTMLInputElement>(null),
  };
  const currentRef = refs.current;

  // Arrivée par « Changer mon mot de passe » : la page se place sur le
  // formulaire et le premier champ prend le focus (le Layout ne le déplace
  // alors pas sur le titre).
  useEffect(() => {
    if (location.hash !== `#${PASSWORD_ANCHOR}`) return;
    sectionRef.current?.scrollIntoView?.({ block: 'start' });
    currentRef.current?.focus({ preventScroll: true });
  }, [location.hash, currentRef]);

  const newDescribedBy = ['profil-new-rules', errors.new && 'profil-new-error'].filter(Boolean).join(' ');

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

    setSubmitting(true);
    try {
      await authService.changePassword(currentPassword, newPassword);
      leaveLoginNotice('mot-de-passe-modifie');
      toast.success(LOGIN_NOTICE_MESSAGES['mot-de-passe-modifie']);
      await logout();
    } catch (err) {
      if (isCredentialError(err)) {
        setErrors({ current: getErrorMessage(err) });
        refs.current.current?.focus();
      } else {
        setErrors({ form: getErrorMessage(err, 'Impossible de changer le mot de passe. Réessayez.') });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageShell
      title="Mon profil"
      description="Vos informations de compte, votre mot de passe et vos préférences"
      width="narrow"
    >
      <Card>
        <CardHeader>
          <CardTitle>Informations du compte</CardTitle>
          <CardDescription>Ces informations sont gérées par votre administrateur</CardDescription>
        </CardHeader>
        <CardContent>
          <KeyValueList>
            <KeyValue label="Identifiant">{user?.username ?? '—'}</KeyValue>
            <KeyValue label="Nom complet">{user?.nom_complet || <NotSet>Non renseigné</NotSet>}</KeyValue>
            <KeyValue label="Adresse e-mail">
              <span className="break-all">{user?.email || <NotSet>Non renseignée</NotSet>}</span>
            </KeyValue>
            <KeyValue label="Rôle">{formatRole(user?.role)}</KeyValue>
            <KeyValue label="Dernière connexion">
              {user?.dernier_login ? formatDateTime(user.dernier_login) : <NotSet>Première connexion</NotSet>}
            </KeyValue>
          </KeyValueList>
        </CardContent>
      </Card>

      <section id={PASSWORD_ANCHOR} ref={sectionRef} aria-labelledby={passwordTitleId} className="scroll-mt-20">
        <Card>
          <CardHeader>
            <CardTitle id={passwordTitleId}>Changer mon mot de passe</CardTitle>
            <CardDescription>
              Après le changement, vous serez déconnecté : reconnectez-vous avec le nouveau mot de passe
            </CardDescription>
          </CardHeader>
          <CardContent>
            {errors.form && (
              <div
                role="alert"
                className="mb-4 flex items-start gap-2 rounded-md border border-danger-200 bg-danger-50 p-3 text-sm"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger-700" aria-hidden="true" />
                <span>{errors.form}</span>
              </div>
            )}
            <form noValidate onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="profil-current">Mot de passe actuel</Label>
                <PasswordInput
                  ref={refs.current}
                  id="profil-current"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                  {...fieldErrorProps('profil-current', errors.current)}
                />
                <FieldError id="profil-current">{errors.current}</FieldError>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="profil-new">Nouveau mot de passe</Label>
                <PasswordInput
                  ref={refs.new}
                  id="profil-new"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  aria-invalid={errors.new ? true : undefined}
                  aria-describedby={newDescribedBy}
                />
                <PasswordRules id="profil-new-rules" password={newPassword} />
                <FieldError id="profil-new">{errors.new}</FieldError>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="profil-confirm">Confirmer le nouveau mot de passe</Label>
                <PasswordInput
                  ref={refs.confirm}
                  id="profil-confirm"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  {...fieldErrorProps('profil-confirm', errors.confirm)}
                />
                <FieldError id="profil-confirm">{errors.confirm}</FieldError>
              </div>

              <Button type="submit" size="touch" disabled={submitting} className="w-full sm:w-auto">
                {submitting ? (
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
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Raccourcis clavier</CardTitle>
          <CardDescription>Préférence propre à votre compte, sur ce poste</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3">
            <Checkbox
              id="profil-raccourcis"
              checked={singleKeyShortcuts}
              onChange={(e) => setSingleKeyShortcuts(e.target.checked)}
              aria-describedby="profil-raccourcis-aide"
              className="mt-0.5 h-5 w-5"
            />
            <div className="space-y-1">
              <Label htmlFor="profil-raccourcis" className="leading-5">
                Activer les raccourcis à une touche
              </Label>
              <p id="profil-raccourcis-aide" className="text-sm text-muted-foreground text-pretty">
                <Key>G</Key> puis <Key>F</Key>, <Key>/</Key>, <Key>N</Key>… Désactivez-les si vous utilisez la dictée
                vocale ou si des touches se déclenchent par erreur.
              </p>
            </div>
          </div>
          <Button variant="outline" className="gap-2" onClick={openShortcutsHelp}>
            <Keyboard className="h-4 w-4" aria-hidden="true" />
            Afficher les raccourcis clavier
          </Button>
        </CardContent>
      </Card>
    </PageShell>
  );
}
