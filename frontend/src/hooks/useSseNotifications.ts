import { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

interface SseNotification {
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  link?: string;
  timestamp: string;
}

interface SseLowStock {
  produit_id: number;
  nom: string;
  reference: string;
  stock: number;
  stock_min: number;
}

export function useSseNotifications() {
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const failureCountRef = useRef(0);
  const offlineNotifiedRef = useRef(false);

  const connect = useCallback(() => {
    // Only stream when logged in; auth is the httpOnly cookie (sent automatically
    // by EventSource for same-origin requests).
    if (!localStorage.getItem('auth_user')) return;

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
        toast.warning(
          rupture
            ? `Rupture de stock : ${data.nom}`
            : `Stock faible : ${data.nom} — ${data.stock} restant(s)`,
          {
            description: `Réf. ${data.reference} · seuil d'alerte : ${data.stock_min}`,
            action: {
              label: 'Voir le produit',
              onClick: () =>
                navigateRef.current(`/inventaire?search=${encodeURIComponent(data.reference)}`),
            },
          }
        );
      } catch {
        toast.warning('Stock faible détecté');
      }
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
          description: 'Les nouvelles alertes stock et paiements ne s\'afficheront pas tant que la connexion n\'est pas rétablie.',
        });
      }
      reconnectTimeoutRef.current = setTimeout(connect, 5000);
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (eventSourceRef.current) eventSourceRef.current.close();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
  }, [connect]);
}
