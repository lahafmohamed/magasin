import { useState } from 'react';
import { toast } from 'sonner';
import {
  User as UserIcon,
  ShieldCheck,
  KeyRound,
  Loader2,
  Check,
  X,
  Clock,
  Mail,
  BadgeCheck,
} from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { authService } from '../services/authService';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { PasswordInput } from '@/components/ui/password-input';
import { formatDate } from '../utils/format';
import { isStrongPassword, passwordRules, PASSWORD_POLICY_MESSAGE } from '../utils/password';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrateur',
  manager: 'Manager',
  caissier: 'Caissier',
  depot_staff: 'Personnel dépôt',
  magasin_staff: 'Personnel magasin',
  viewer: 'Consultation',
};

/** Ligne libellé / valeur de la carte identité. */
function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof UserIcon;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}

export default function Profil() {
  const { user, logout } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ newPassword?: string; confirm?: string }>({});

  const rules = passwordRules(newPassword);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    if (!isStrongPassword(newPassword)) {
      setErrors({ newPassword: PASSWORD_POLICY_MESSAGE });
      toast.error(PASSWORD_POLICY_MESSAGE);
      return;
    }
    if (newPassword !== confirm) {
      const msg = 'Les mots de passe ne correspondent pas.';
      setErrors({ confirm: msg });
      toast.error(msg);
      return;
    }

    setSubmitting(true);
    try {
      await authService.changePassword(currentPassword, newPassword);
      toast.success('Mot de passe mis à jour. Veuillez vous reconnecter.');
      await logout();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Erreur lors du changement de mot de passe.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mon profil"
        icon={UserIcon}
        description="Vos informations de compte et votre mot de passe"
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ---------- Identité ---------- */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BadgeCheck className="h-4 w-4" />
              Informations du compte
            </CardTitle>
            <CardDescription>
              Ces informations sont gérées par un administrateur.
            </CardDescription>
          </CardHeader>
          <CardContent className="divide-y">
            <InfoRow icon={UserIcon} label="Identifiant" value={user.username} />
            <InfoRow
              icon={UserIcon}
              label="Nom complet"
              value={user.nom_complet || <span className="text-muted-foreground">Non renseigné</span>}
            />
            <InfoRow
              icon={Mail}
              label="Adresse e-mail"
              value={user.email || <span className="text-muted-foreground">Non renseignée</span>}
            />
            <InfoRow
              icon={ShieldCheck}
              label="Rôle"
              value={
                <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs uppercase tracking-wide">
                  {ROLE_LABELS[user.role] || user.role}
                </span>
              }
            />
            <InfoRow
              icon={Clock}
              label="Dernière connexion"
              value={
                user.dernier_login ? (
                  formatDate(user.dernier_login)
                ) : (
                  <span className="text-muted-foreground">Première connexion</span>
                )
              }
            />
          </CardContent>
        </Card>

        {/* ---------- Sécurité ---------- */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="h-4 w-4" />
              Changer mon mot de passe
            </CardTitle>
            <CardDescription>
              Vous serez déconnecté après le changement et devrez vous reconnecter.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="profil-current">Mot de passe actuel</Label>
                <PasswordInput
                  id="profil-current"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="profil-new">Nouveau mot de passe</Label>
                <PasswordInput
                  id="profil-new"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  aria-invalid={!!errors.newPassword}
                  aria-describedby="profil-new-rules"
                />
                <ul id="profil-new-rules" className="space-y-0.5 pt-1">
                  {rules.map((rule) => (
                    <li
                      key={rule.label}
                      className={`flex items-center gap-1.5 text-xs ${
                        rule.ok ? 'text-success-600 dark:text-success-500' : 'text-muted-foreground'
                      }`}
                    >
                      {rule.ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                      {rule.label}
                    </li>
                  ))}
                </ul>
                {errors.newPassword && (
                  <p role="alert" className="text-xs text-danger-600">
                    {errors.newPassword}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="profil-confirm">Confirmer le nouveau mot de passe</Label>
                <PasswordInput
                  id="profil-confirm"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  autoComplete="new-password"
                  aria-invalid={!!errors.confirm}
                />
                {errors.confirm && (
                  <p role="alert" className="text-xs text-danger-600">
                    {errors.confirm}
                  </p>
                )}
              </div>

              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Mise à jour…
                  </>
                ) : (
                  'Changer le mot de passe'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
