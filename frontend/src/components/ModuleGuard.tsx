import { useLocation, useNavigate } from 'react-router-dom';
import { PackageX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { useModules } from '@/lib/ModulesContext';
import { useAuth } from '@/lib/AuthContext';

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
  const navigate = useNavigate();
  const { estCheminActif } = useModules();
  const { hasRole } = useAuth();

  if (estCheminActif(pathname)) return <>{children}</>;

  const estAdmin = hasRole('admin', 'manager');

  return (
    <div className="container mx-auto px-4 py-10 max-w-3xl">
      <EmptyState
        icon={PackageX}
        title="Ce module est désactivé"
        description={
          estAdmin
            ? "Cette partie du programme a été masquée dans les paramètres de l'entreprise. Vous pouvez la réactiver à tout moment."
            : "Cette partie du programme a été masquée par votre administrateur."
        }
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => navigate('/')}>Retour au tableau de bord</Button>
            {estAdmin && (
              <Button variant="outline" onClick={() => navigate('/settings')}>
                Ouvrir les paramètres
              </Button>
            )}
          </div>
        }
      />
    </div>
  );
}

export default ModuleGuard;
