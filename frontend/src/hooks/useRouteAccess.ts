import { useCallback } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useModules } from '../lib/ModulesContext';
import { canAccessPath } from '../config/routeAccess';

/**
 * « Ce lien peut-il s'ouvrir pour l'utilisateur courant ? » — rôle (carte
 * `config/routeAccess.ts`) **et** module actif (paramètres de l'entreprise).
 *
 * À utiliser pour tout lien ou bouton qui mène à une autre page : liens
 * rapides du tableau de bord, boutons « Historique », cartes d'action…
 *
 *   const canOpen = useRouteAccess();
 *   {canOpen('/caisse/historique') && <Link to="/caisse/historique">Historique</Link>}
 */
export function useRouteAccess(): (path: string) => boolean {
  const { user } = useAuth();
  const { estCheminActif } = useModules();
  const role = user?.role;
  return useCallback(
    (path: string) => canAccessPath(path, role) && estCheminActif(path.split(/[?#]/)[0]),
    [role, estCheminActif]
  );
}
