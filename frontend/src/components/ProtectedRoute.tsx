import { Navigate, Link, useLocation } from 'react-router-dom';
import { ReactNode } from 'react';
import { Lock, Compass } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { LoadingScreen } from '@/components/ui/loading';
import { PageShell } from '@/components/ui/page-shell';
import { EmptyState } from '@/components/ui/empty-state';
import { Card } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import type { AppRole } from '@/config/routeAccess';
import Layout from './Layout';

interface ProtectedRouteProps {
  children: ReactNode;
  /**
   * Rôles autorisés. Préférer `<RouteAccessGate>` à l'intérieur du `Layout`
   * (les routes de `App.tsx` le font) : le refus s'affiche alors dans le cadre
   * de l'application. Gardé pour compatibilité.
   */
  requiredRoles?: readonly AppRole[];
}

/**
 * Session et changement de mot de passe obligatoire. Le contrôle de rôle se
 * fait dans le `Layout` (`RouteAccessGate`), pour que le refus garde le menu
 * et un chemin de retour.
 */
export default function ProtectedRoute({ children, requiredRoles }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, hasRole, user } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <LoadingScreen message="Vérification de la session…" />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (user?.must_change_password && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  if (requiredRoles && !hasRole(...requiredRoles)) {
    return (
      <Layout>
        <AccessDenied />
      </Layout>
    );
  }

  return <>{children}</>;
}

/**
 * L'écran « Changement de mot de passe requis » n'existe que tant que le
 * changement est dû. Sans cette garde, quiconque y arrivait sans y être obligé
 * (adresse tapée à la main, ou retour automatique après reconnexion) lisait
 * qu'on lui réclamait encore un nouveau mot de passe. Le changement volontaire
 * se fait depuis « Mon profil ».
 */
export function ForcedPasswordChangeOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (user && !user.must_change_password) return <Navigate to="/" replace />;
  return <>{children}</>;
}

/**
 * Garde de rôle rendue **dans** le `Layout` : la page refusée garde le menu,
 * la barre du haut et un bouton de retour (avant : écran nu, seul le bouton
 * Précédent du navigateur permettait de repartir).
 */
export function RouteAccessGate({
  roles,
  children,
}: {
  /** `null` : tout utilisateur connecté. */
  roles: readonly AppRole[] | null | undefined;
  children: ReactNode;
}) {
  const { hasRole } = useAuth();
  if (roles && !hasRole(...roles)) return <AccessDenied />;
  return <>{children}</>;
}

/** Page « Accès réservé » — rendue dans le cadre habituel. */
export function AccessDenied() {
  return (
    <PageShell title="Accès réservé" width="narrow">
      <Card>
        <EmptyState
          icon={Lock}
          title="Cette page est réservée à d’autres rôles."
          description="Si vous en avez besoin, demandez l’accès à votre administrateur"
          action={
            <Link to="/" className={buttonVariants()}>
              Retour au tableau de bord
            </Link>
          }
        />
      </Card>
    </PageShell>
  );
}

/** Adresse sans page correspondante (lien périmé, faute de frappe). */
export function NotFoundPage() {
  return (
    <PageShell title="Page introuvable" width="narrow">
      <Card>
        <EmptyState
          icon={Compass}
          title="Cette adresse ne correspond à aucune page."
          description="Le lien est peut-être ancien ou mal recopié. Revenez au tableau de bord ou utilisez le menu."
          action={
            <Link to="/" className={buttonVariants()}>
              Retour au tableau de bord
            </Link>
          }
        />
      </Card>
    </PageShell>
  );
}
