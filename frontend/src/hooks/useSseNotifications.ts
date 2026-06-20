import { useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';

interface SseNotification {
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  link?: string;
  timestamp: string;
}

export function useSseNotifications() {
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const connect = useCallback(() => {
    // Only stream when logged in; auth is the httpOnly cookie (sent automatically
    // by EventSource for same-origin requests).
    if (!localStorage.getItem('auth_user')) return;

    const es = new EventSource('/api/notifications/stream', { withCredentials: true });
    eventSourceRef.current = es;

    es.addEventListener('notification', (event) => {
      try {
        const data: SseNotification = JSON.parse(event.data);
        switch (data.type) {
          case 'success':
            toast.success(data.message, { description: data.title });
            break;
          case 'warning':
            toast.warning(data.message, { description: data.title });
            break;
          case 'error':
            toast.error(data.message, { description: data.title });
            break;
          default:
            toast.info(data.message, { description: data.title });
        }
      } catch {}
    });

    es.addEventListener('low-stock', () => {
      toast.warning('Stock faible détecté', {
        description: 'Vérifiez le tableau de bord pour les détails',
      });
    });

    es.onopen = () => {
      console.debug('SSE connecté');
    };

    es.onerror = () => {
      es.close();
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
