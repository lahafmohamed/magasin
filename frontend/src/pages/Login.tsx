import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { useCompanyBrand } from '@/lib/brand';
import { BrandMark } from '@/components/BrandMark';
import { clearLoginNotice, readLoginNotice } from '@/lib/loginNotice';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import { FieldError, fieldErrorProps } from '@/components/ui/field-error';
import { Spinner } from '@/components/ui/loading';
import { getErrorMessage } from '@/utils/errors';

const loginSchema = z.object({
  username: z.string().min(1, 'Saisissez votre identifiant.'),
  password: z.string().min(1, 'Saisissez votre mot de passe.'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function Login() {
  useDocumentTitle('Connexion');
  const { login } = useAuth();
  const brand = useCompanyBrand();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  // Le message reste déposé jusqu'à la prochaine tentative de connexion. Le
  // retirer dès l'affichage le faisait disparaître presque à chaque fois : à la
  // déconnexion, cette page s'affiche une première fois par redirection, puis
  // la déconnexion recharge l'onglet — le second affichage ne trouvait plus rien.
  const [notice] = useState(readLoginNotice);

  const {
    register,
    handleSubmit,
    setFocus,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: '', password: '' },
  });

  // Retour à la page d'où l'on vient — sauf l'écran de changement de mot de
  // passe forcé : après ce changement, la déconnexion laisse cette adresse
  // comme « page d'origine », et la reconnexion y ramenait l'utilisateur, face
  // à un « Changement de mot de passe requis » qu'il venait de faire.
  const origine = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
  const from = origine && !['/change-password', '/login'].includes(origine) ? origine : '/';

  const onSubmit = async (data: LoginFormData) => {
    clearLoginNotice();
    setIsLoading(true);
    setError('');

    try {
      await login(data.username, data.password);
      navigate(from, { replace: true });
    } catch (err) {
      // 401 → « Identifiant ou mot de passe incorrect… », 403 → compte
      // désactivé, 429 → trop de tentatives (utils/errors). Jamais « Session
      // expirée » ni rechargement de la page.
      setError(getErrorMessage(err, 'Connexion impossible. Réessayez dans un instant.'));
      setFocus('password');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-8">
      <div className="w-full max-w-sm space-y-6">
        {/* Même en-tête que le changement de mot de passe : la marque et son nom,
            puis le titre de l'écran et ce qu'il ouvre. */}
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex flex-col items-center gap-1">
            <BrandMark size="lg" />
            <p className="text-sm font-medium">{brand.name}</p>
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-balance">Connexion</h1>
            <p className="text-sm text-muted-foreground text-pretty">Accédez à votre espace de gestion</p>
          </div>
        </div>

        <Card>
          <CardContent inset="standalone" className="space-y-4 sm:p-6">
            {notice && !error && (
              <div
                role="status"
                className="flex items-start gap-2 rounded-md border border-success-200 bg-success-50 p-3 text-sm"
              >
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success-700" aria-hidden="true" />
                <span>{notice}</span>
              </div>
            )}
            {error && (
              <div role="alert" className="flex items-start gap-2 rounded-md border border-danger-200 bg-danger-50 p-3 text-sm">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger-700" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="username">Identifiant</Label>
                <Input
                  id="username"
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  {...fieldErrorProps('username', errors.username)}
                  {...register('username')}
                />
                <FieldError id="username">{errors.username?.message}</FieldError>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Mot de passe</Label>
                <PasswordInput
                  id="password"
                  autoComplete="current-password"
                  {...fieldErrorProps('password', errors.password)}
                  {...register('password')}
                />
                <FieldError id="password">{errors.password?.message}</FieldError>
              </div>

              <Button type="submit" size="touch" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Spinner />
                    Connexion…
                  </>
                ) : (
                  'Se connecter'
                )}
              </Button>
            </form>

            <p className="text-center text-xs text-muted-foreground text-pretty">
              Mot de passe oublié ? Demandez à votre administrateur de le réinitialiser.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
