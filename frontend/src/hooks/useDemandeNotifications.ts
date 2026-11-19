import { useEffect, useState, useCallback, useRef } from 'react';
import { demandeService } from '../services/api';
import { useAuth } from '../lib/AuthContext';
import { usePermission, Permissions } from './usePermission';
import { DEMANDES_CHANGED_EVENT } from './useSseNotifications';

interface NotificationState {
  unreadCount: number;
  pendingDecisionCount: number;
  pendingExecutionCount: number;
  pendingClosureCount: number;
  lastUpdated: Date | null;
  isLoading: boolean;
  error: string | null;
}

/** Lignes d'une réponse paginée `{ data, pagination }` ou d'un tableau brut. */
function rowsOf(response: any): any[] {
  if (Array.isArray(response)) return response;
  return Array.isArray(response?.data) ? response.data : [];
}

/** Total réel (pagination) plutôt que le nombre de lignes reçues. */
function totalOf(response: any, rows: any[]): number {
  const total = Number(response?.pagination?.total);
  return Number.isFinite(total) && total >= rows.length ? total : rows.length;
}

interface DemandeNotification {
  id: number;
  numero: string;
  statut: string;
  type: 'awaiting_decision' | 'awaiting_execution' | 'awaiting_closure' | 'new_request';
  message: string;
  timestamp: string;
}

/**
 * Décompte des demandes de réapprovisionnement en attente, pour la cloche.
 *
 * Rafraîchi par le flux SSE (`demande-changed`) ; `pollInterval` n'est plus
 * qu'un filet de sécurité si le flux tombe, d'où les 5 minutes par défaut au
 * lieu des 30 secondes d'origine (jusqu'à 3 requêtes par tour et par poste).
 */
export function useDemandeNotifications(pollInterval = 300000) {
  const { user } = useAuth();
  const { hasPermission, userRole } = usePermission();
  
  const [notifications, setNotifications] = useState<DemandeNotification[]>([]);
  const [state, setState] = useState<NotificationState>({
    unreadCount: 0,
    pendingDecisionCount: 0,
    pendingExecutionCount: 0,
    pendingClosureCount: 0,
    lastUpdated: null,
    isLoading: false,
    error: null,
  });

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isActiveRef = useRef(true);
  const is429Ref = useRef(false);

  // Keep latest values in refs to avoid fetchNotifications identity changing
  const userRef = useRef(user);
  const hasPermissionRef = useRef(hasPermission);
  const userRoleRef = useRef(userRole);
  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => { hasPermissionRef.current = hasPermission; }, [hasPermission]);
  useEffect(() => { userRoleRef.current = userRole; }, [userRole]);

  const fetchNotifications = useCallback(async () => {
    if (!userRef.current || !isActiveRef.current || is429Ref.current) return;

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const now = new Date();
      const newNotifications: DemandeNotification[] = [];
      let pendingDecision = 0;
      let pendingExecution = 0;
      let pendingClosure = 0;

      // Fetch based on role
      if (hasPermissionRef.current(Permissions.DEMANDE_DECIDE) || userRoleRef.current === 'admin') {
        // Depot staff: demandes awaiting decision (envoyee)
        const decisionResponse = await demandeService.getAll({ statut: 'envoyee', limit: 10 });
        const decisionDemandes = rowsOf(decisionResponse);
        // Le décompte vient de la pagination : la liste est limitée à 10 lignes,
        // la cloche plafonnait donc à « 10 » au-delà.
        pendingDecision = totalOf(decisionResponse, decisionDemandes);
        
        decisionDemandes.forEach((d: any) => {
          newNotifications.push({
            id: d.id,
            numero: d.numero,
            statut: d.statut,
            type: 'awaiting_decision',
            message: d.magasin_nom
              ? `La demande ${d.numero} (${d.magasin_nom}) attend votre décision.`
              : `La demande ${d.numero} attend votre décision.`,
            timestamp: d.date_envoi || d.date_creation,
          });
        });
      }

      if (hasPermissionRef.current(Permissions.DEMANDE_EXECUTE) || userRoleRef.current === 'admin') {
        // Depot staff: demandes approved awaiting execution
        const execResponse = await demandeService.getAll({ 
          statut: ['approuvee', 'partiellement_approuvee'].join(','),
          limit: 10 
        });
        const execDemandes = rowsOf(execResponse);
        pendingExecution = totalOf(execResponse, execDemandes);
        
        execDemandes.forEach((d: any) => {
          newNotifications.push({
            id: d.id,
            numero: d.numero,
            statut: d.statut,
            type: 'awaiting_execution',
            message: `La demande ${d.numero} est approuvée — prête à être exécutée.`,
            timestamp: d.date_decision || d.date_creation,
          });
        });
      }

      if (hasPermissionRef.current(Permissions.DEMANDE_CLOSE) || userRoleRef.current === 'admin') {
        // Magasin staff: delivered demandes awaiting closure
        const closeResponse = await demandeService.getAll({ statut: 'livree', limit: 10 });
        const closeDemandes = rowsOf(closeResponse);
        pendingClosure = totalOf(closeResponse, closeDemandes);
        
        closeDemandes.forEach((d: any) => {
          newNotifications.push({
            id: d.id,
            numero: d.numero,
            statut: d.statut,
            type: 'awaiting_closure',
            message: `La demande ${d.numero} est livrée — en attente de clôture.`,
            timestamp: d.date_livraison || d.date_creation,
          });
        });
      }

      // Sort by timestamp (newest first)
      newNotifications.sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      setNotifications(newNotifications.slice(0, 20)); // Keep top 20
      setState({
        unreadCount: pendingDecision + pendingExecution + pendingClosure,
        pendingDecisionCount: pendingDecision,
        pendingExecutionCount: pendingExecution,
        pendingClosureCount: pendingClosure,
        lastUpdated: now,
        isLoading: false,
        error: null,
      });
    } catch (error: any) {
      if (error?.response?.status === 429) {
        is429Ref.current = true;
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        // Resume after 2 minutes
        setTimeout(() => { is429Ref.current = false; }, 120000);
      }
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error?.response?.status === 429 ? null : 'Impossible de charger les notifications.',
      }));
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Polling
  useEffect(() => {
    if (pollInterval > 0) {
      intervalRef.current = setInterval(fetchNotifications, pollInterval);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchNotifications, pollInterval]);

  // Rechargement piloté par le flux SSE : le serveur signale chaque transition
  // de demande, donc la cloche est à jour sans attendre le prochain sondage.
  // Le sondage subsiste en filet (flux coupé, onglet réveillé), mais à un rythme
  // lent — il tournait à 30 s et lançait jusqu'à trois requêtes à chaque tour.
  useEffect(() => {
    const onChanged = () => fetchNotifications();
    window.addEventListener(DEMANDES_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(DEMANDES_CHANGED_EVENT, onChanged);
  }, [fetchNotifications]);

  // Visibility change handler (refresh when tab becomes active)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        isActiveRef.current = true;
        fetchNotifications();
      } else {
        isActiveRef.current = false;
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchNotifications]);

  const refresh = useCallback(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const dismissNotification = useCallback((id: number) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    setState((prev) => ({ ...prev, unreadCount: Math.max(0, prev.unreadCount - 1) }));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
    setState((prev) => ({ ...prev, unreadCount: 0 }));
  }, []);

  return {
    notifications,
    ...state,
    refresh,
    dismissNotification,
    clearAll,
  };
}

export default useDemandeNotifications;
