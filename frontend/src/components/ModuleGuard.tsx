import { Link, useLocation } from 'react-router-dom';
import { PackageX } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageShell } from '@/components/ui/page-shell';
import { useModules } from '@/lib/ModulesContext';
import { useRouteAccess } from '@/hooks/useRouteAccess';
import { cn } from '@/lib/utils';

/**
 * Bloque l'accès direct par URL à un module désactivé dans les paramètres.
 *
 * Masquer l'entrée de menu ne suffit pas : un lien mis en favori, une adresse
 * tapée à la main ou un ancien signet continueraient d'ouvrir l'écran. Le garde
 * s'appuie sur le même index chemin → module que la navigation, donc aucune
 * route n'est à recenser deux fois.
 *
 * Ce n'est pas une barrière de sécurité : l'API reste accessible et protégée,
 * elle, par les rôles. C'est une simplification de l'interface.
 */
export function ModuleGuard({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const { estCheminActif } = useModules();
  const canOpen = useRouteAccess();

  if (estCheminActif(pathname)) return <>{children}</>;

  const peutReactiver = canOpen('/settings');

  return (
    <PageShell title="Module désactivé" width="narrow">
      <Card>
        <EmptyState
          icon={PackageX}
          title="Cette partie du programme est masquée."
          description={
            peutReactiver
              ? 'Elle a été désactivée dans les paramètres de l’entreprise. Vous pouvez la réactiver à tout moment.'
              : 'Elle a été désactivée par votre administrateur. Demandez-lui de la réactiver si vous en avez besoin.'
          }
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {peutReactiver && (
                <Link to="/settings" className={cn(buttonVariants({ variant: 'outline' }))}>
                  Ouvrir les paramètres de l’entreprise
                </Link>
              )}
              <Link to="/" className={buttonVariants()}>
                Retour au tableau de bord
              </Link>
            </div>
          }
        />
      </Card>
    </PageShell>
  );
}

export default ModuleGuard;
