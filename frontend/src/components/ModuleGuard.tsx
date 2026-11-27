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
import { cn } from '@/lib/utils';

/**
 * Bloque l'accès direct par URL à un module désactivé dans les paramètres.
 *
 * Masquer l'entrée de menu ne suffit pas : un lien mis en favori, une adresse
 * tapée à la main ou un ancien signet continueraient d'ouvrir l'écran. Le garde
 * s'appuie sur le même index chemin → module que la navigation, donc aucune
 * route n'est à recenser deux fois.
 *
 * Tant que les paramètres de l'entreprise ne sont pas arrivés, seules les pages
 * des modules hors périmètre v1 attendent : elles sont masquées par défaut, et
 * on ne sait pas encore si l'éditeur les a activées pour ce client. Toutes les
 * autres — factures, caisse, vente comptoir, stock — s'ouvrent sans attendre,
 * comme avant : une requête de paramètres lente (connexion faible, et le client
 * HTTP n'a pas de délai maximal) ne doit jamais laisser la caisse sur un écran
 * d'attente. Si l'une d'elles se révèle masquée par le client, elle est
 * remplacée à l'arrivée des paramètres.
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

  if (chargement && horsV1) {
    // On ne nomme pas le module avant de savoir s'il est activé.
    return (
      <PageShell title="Chargement">
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
