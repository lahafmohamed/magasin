import { Link, useLocation } from 'react-router-dom';
import { PackageX } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageShell } from '@/components/ui/page-shell';
import { PageLoading } from '@/components/ui/loading';
import { useModules } from '@/lib/ModulesContext';
import { useRouteAccess } from '@/hooks/useRouteAccess';
import { estHorsV1, moduleForPath } from '@/config/modules';
import { routeLabel } from '@/config/routeAccess';
import { cn } from '@/lib/utils';

/**
 * Bloque l'accès direct par URL à un module désactivé dans les paramètres.
 *
 * Masquer l'entrée de menu ne suffit pas : un lien mis en favori, une adresse
 * tapée à la main ou un ancien signet continueraient d'ouvrir l'écran. Le garde
 * s'appuie sur le même index chemin → module que la navigation, donc aucune
 * route n'est à recenser deux fois.
 *
 * Tant que les paramètres de l'entreprise ne sont pas arrivés, une page
 * couverte par un module attend : on ne sait pas encore si elle est masquée, et
 * la monter lançait ses requêtes avant de la remplacer par « Module désactivé ».
 * Les pages hors catalogue (profil, paramètres, tableau de bord) s'ouvrent sans
 * attendre.
 *
 * Deux cas, deux discours. Un module masqué par le client se réactive depuis
 * les paramètres : on le dit et on y mène. Un module hors périmètre v1 (paie,
 * employés, comptabilité, trésorerie) n'y a pas de case : promettre « vous
 * pouvez le réactiver à tout moment » et renvoyer aux paramètres menait à une
 * impasse. On dit seulement qu'il n'est pas inclus, et à qui s'adresser.
 *
 * Ce n'est pas une barrière de sécurité : l'API reste accessible et protégée,
 * elle, par les rôles. C'est une simplification de l'interface.
 */
export function ModuleGuard({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const { estCheminActif, chargement } = useModules();
  const canOpen = useRouteAccess();

  const cle = moduleForPath(pathname);
  const horsV1 = cle !== null && estHorsV1(cle);

  if (chargement && cle !== null) {
    // Le cadre porte déjà le nom de la page — sauf pour un module hors
    // périmètre v1, qu'on ne nomme pas avant de savoir s'il est activé.
    return (
      <PageShell title={(!horsV1 && routeLabel(pathname)) || 'Chargement'}>
        <PageLoading />
      </PageShell>
    );
  }

  if (estCheminActif(pathname)) return <>{children}</>;

  const retour = (
    <Link to="/" className={buttonVariants()}>
      Retour au tableau de bord
    </Link>
  );

  if (horsV1) {
    return (
      <PageShell title="Module non disponible" width="narrow">
        <Card>
          <EmptyState
            icon={PackageX}
            title="Cette partie du programme n’est pas incluse dans votre installation."
            description="Elle ne s’active pas depuis les paramètres de l’entreprise. Si vous en avez besoin, contactez l’éditeur du logiciel."
            action={retour}
          />
        </Card>
      </PageShell>
    );
  }

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
              {retour}
            </div>
          }
        />
      </Card>
    </PageShell>
  );
}

export default ModuleGuard;
