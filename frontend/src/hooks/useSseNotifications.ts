import { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useOptionalAuth } from '../lib/AuthContext';

interface SseNotification {
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  link?: string;
  timestamp: string;
}

/**
 * Pont entre le flux SSE (ouvert une fois dans App) et la cloche des demandes.
 * Le serveur émet `demande-changed` à chaque transition ; la cloche se contente
 * de recharger.
 */
export const DEMANDES_CHANGED_EVENT = 'demandes:changed';

interface SseLowStock {
  produit_id: number;
  nom: string;
  reference: string;
  stock: number;
  stock_min: number;
}

function hasCachedSession(): boolean {
  try {
    return !!localStorage.getItem('auth_user');
  } catch {
    return false;
  }
}

export function useSseNotifications() {
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const auth = useOptionalAuth();
  const userId = auth?.user?.id ?? null;
  // Tant que le changement de mot de passe est dû, le jeton n'ouvre que ce
  // changement : le flux répondrait 403 toutes les 5 s, puis afficherait
  // « Alertes temps réel interrompues » au nouvel employé qui choisit son mot
  // de passe sur son tout premier écran.
  const changementDu = !!auth?.user?.must_change_password;
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const failureCountRef = useRef(0);
  const offlineNotifiedRef = useRef(false);

  const connect = useCallback(() => {
    // Only stream when logged in; auth is the httpOnly cookie (sent automatically
    // by EventSource for same-origin requests).
    if (!hasCachedSession()) return;
    if (changementDu) return;
    if (eventSourceRef.current && eventSourceRef.current.readyState !== EventSource.CLOSED) return;

    const es = new EventSource('/api/notifications/stream', { withCredentials: true });
    eventSourceRef.current = es;

    es.addEventListener('notification', (event) => {
      try {
        const data: SseNotification = JSON.parse(event.data);
        const options: Parameters<typeof toast.info>[1] = { description: data.title };
        if (data.link) {
          options.action = {
            label: 'Ouvrir',
            onClick: () => navigateRef.current(data.link!),
          };
        }
        switch (data.type) {
          case 'success':
            toast.success(data.message, options);
            break;
          case 'warning':
            toast.warning(data.message, options);
            break;
          case 'error':
            toast.error(data.message, options);
            break;
          default:
            toast.info(data.message, options);
        }
      } catch {}
    });

    // L'alerte nomme le produit concerné et mène droit à sa fiche : « vérifiez le
    // tableau de bord » obligeait à retrouver soi-même l'article en rupture.
    es.addEventListener('low-stock', (event) => {
      try {
        const data: SseLowStock = JSON.parse(event.data);
        const rupture = data.stock <= 0;
        const restant = Number(data.stock) || 0;
        toast.warning(
          rupture
            ? `Rupture de stock : ${data.nom}`
            : `Stock bas : ${data.nom} — ${restant} restant${restant > 1 ? 's' : ''}`,
          {
            description: `Réf. ${data.reference} · stock minimum : ${data.stock_min}`,
            action: {
              label: 'Voir le produit',
              onClick: () =>
                navigateRef.current(`/inventaire?search=${encodeURIComponent(data.reference)}`),
            },
          }
        );
      } catch {
        toast.warning('Stock bas détecté sur un produit');
      }
    });

    // Une demande de réappro a changé d'état côté serveur. Le message ne porte
    // pas de données : la cloche recharge son propre décompte, filtré par rôle.
    // On repasse par un événement DOM plutôt que d'ouvrir un second EventSource
    // dans la cloche — les navigateurs plafonnent les connexions par origine.
    es.addEventListener('demande-changed', () => {
      window.dispatchEvent(new CustomEvent(DEMANDES_CHANGED_EVENT));
    });

    es.onopen = () => {
      failureCountRef.current = 0;
      if (offlineNotifiedRef.current) {
        offlineNotifiedRef.current = false;
        toast.success('Alertes temps réel rétablies');
      }
    };

    // Perdre le flux sans le dire laisse croire « aucune alerte » alors que plus
    // rien n'arrive. On prévient une seule fois, après quelques échecs (une
    // coupure réseau brève se répare toute seule et ne mérite pas d'alerte).
    es.onerror = () => {
      es.close();
      failureCountRef.current += 1;
      if (failureCountRef.current >= 3 && !offlineNotifiedRef.current) {
        offlineNotifiedRef.current = true;
        toast.warning('Alertes temps réel interrompues', {
          description: 'Les nouvelles alertes de stock et de paiement ne s’afficheront pas tant que la connexion n’est pas rétablie.',
        });
      }
      reconnectTimeoutRef.current = setTimeout(connect, 5000);
    };
  }, [changementDu]);

  // (Re)connexion à chaque changement d'utilisateur : ouvert une seule fois au
  // démarrage, le flux ne s'ouvrait jamais après une connexion faite sans
  // recharger la page.
  useEffect(() => {
    if (!userId) return;
    connect();
    return () => {
      if (eventSourceRef.current) eventSourceRef.current.close();
      eventSourceRef.current = null;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
  }, [connect, userId]);
}
