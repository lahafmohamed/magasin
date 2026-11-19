import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, CircleAlert, Truck, Package, Clock, RefreshCw, X, type LucideIcon } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Spinner } from '@/components/ui/loading';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useDemandeNotifications } from '../hooks/useDemandeNotifications';
import { usePermission, Permissions } from '../hooks/usePermission';
import { useRouteAccess } from '../hooks/useRouteAccess';

const TYPE_CONFIG: Record<string, { icon: LucideIcon; label: string; color: string }> = {
  awaiting_decision: { icon: CircleAlert, label: 'Décision requise', color: 'text-warning-700' },
  // Seule la décision attend le lecteur : les autres étapes restent neutres
  // (le vert « succès » sur « Clôture requise » disait le contraire).
  awaiting_execution: { icon: Truck, label: 'Exécution requise', color: 'text-muted-foreground' },
  awaiting_closure: { icon: Package, label: 'Clôture requise', color: 'text-muted-foreground' },
  new_request: { icon: Clock, label: 'Nouvelle demande', color: 'text-muted-foreground' },
};

function formatNotificationDate(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Cloche des demandes de réapprovisionnement.
 *
 * Un `Popover` et non un menu : un menu Radix bloque la touche Tab, ce qui
 * rendait « Actualiser », « Ignorer » et « Voir toutes les demandes »
 * injoignables au clavier. Masquée pour les rôles qui n'ont aucune demande à
 * traiter (le caissier ne décide, n'exécute ni ne clôture : sa cloche restait
 * vide pour toujours).
 */
export function NotificationBell() {
  const { hasPermission, userRole } = usePermission();
  const canOpen = useRouteAccess();
  const concerned =
    userRole === 'admin' ||
    hasPermission(Permissions.DEMANDE_DECIDE) ||
    hasPermission(Permissions.DEMANDE_EXECUTE) ||
    hasPermission(Permissions.DEMANDE_CLOSE);

  if (!concerned || !canOpen('/demandes')) return null;
  return <NotificationBellPanel />;
}

function NotificationBellPanel() {
  const [open, setOpen] = useState(false);
  const navigating = useRef(false);
  const {
    notifications,
    unreadCount,
    pendingDecisionCount,
    pendingExecutionCount,
    pendingClosureCount,
    isLoading,
    refresh,
    dismissNotification,
  } = useDemandeNotifications(); // SSE pilote le rafraîchissement ; sondage lent en filet

  const followLink = () => {
    navigating.current = true;
    setOpen(false);
  };

  const hasAnyPending = pendingDecisionCount > 0 || pendingExecutionCount > 0 || pendingClosureCount > 0;
  const triggerLabel =
    unreadCount > 0
      ? `Notifications : ${unreadCount} demande${unreadCount > 1 ? 's' : ''} en attente`
      : 'Notifications';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="relative h-11 w-11 shrink-0 p-0 lg:h-10 lg:w-10" aria-label={triggerLabel}>
          <Bell className="h-4 w-4" aria-hidden="true" />
          {unreadCount > 0 && (
            <span
              aria-hidden="true"
              className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger-600 px-1 text-3xs font-semibold leading-4 text-danger-50 tabular-nums ring-2 ring-background lg:right-0.5 lg:top-0.5"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(22rem,calc(100vw-1rem))] p-0"
        aria-labelledby="notifications-titre"
        onCloseAutoFocus={(event) => {
          // Après un clic sur une demande, le Layout place le focus sur le titre
          // de la page ouverte : ne pas le renvoyer sur la cloche.
          if (navigating.current) {
            event.preventDefault();
            navigating.current = false;
          }
        }}
      >
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <h2 id="notifications-titre" className="text-sm font-semibold">
            Notifications
          </h2>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={refresh}
            disabled={isLoading}
            aria-label="Actualiser les notifications"
          >
            {isLoading ? <Spinner className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
          </Button>
        </div>

        {hasAnyPending && (
          <div className="grid grid-cols-3 gap-2 bg-muted/50 px-3 py-2 text-center text-xs">
            {pendingDecisionCount > 0 && (
              <p>
                <span className="block font-medium tabular-nums text-warning-700">{pendingDecisionCount}</span>
                <span className="text-muted-foreground">à décider</span>
              </p>
            )}
            {pendingExecutionCount > 0 && (
              <p>
                <span className="block font-medium tabular-nums text-foreground">{pendingExecutionCount}</span>
                <span className="text-muted-foreground">à exécuter</span>
              </p>
            )}
            {pendingClosureCount > 0 && (
              <p>
                <span className="block font-medium tabular-nums text-foreground">{pendingClosureCount}</span>
                <span className="text-muted-foreground">à clôturer</span>
              </p>
            )}
          </div>
        )}

        <div className="max-h-[300px] overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="px-3 py-8 text-center text-muted-foreground">
              <Bell className="mx-auto mb-2 h-8 w-8 opacity-50" aria-hidden="true" />
              <p className="text-sm font-medium text-foreground">Aucune notification</p>
              <p className="mt-1 text-xs">Les demandes qui attendent votre action apparaîtront ici</p>
            </div>
          ) : (
            <ul className="divide-y">
              {notifications.map((notification, index) => {
                const config = TYPE_CONFIG[notification.type] ?? {
                  icon: Bell,
                  label: 'Notification',
                  color: 'text-muted-foreground',
                };
                const Icon = config.icon;
                return (
                  <li key={`${notification.id}-${index}`} className="relative flex items-start gap-3 px-3 py-2.5 hover:bg-accent">
                    <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', config.color)} aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/demandes/${notification.id}`}
                        onClick={followLink}
                        className="block truncate rounded-sm font-mono text-sm after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        title={notification.numero}
                      >
                        {notification.numero}
                        <span className="sr-only"> — {config.label}</span>
                      </Link>
                      <p className="line-clamp-2 text-xs text-muted-foreground">{notification.message}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {config.label} · {formatNotificationDate(notification.timestamp)}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="relative z-10 h-8 w-8 shrink-0"
                      aria-label={`Ignorer la notification ${notification.numero}`}
                      onClick={() => dismissNotification(notification.id)}
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t p-2">
          <Link
            to="/demandes"
            onClick={followLink}
            className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'h-9 w-full')}
          >
            Voir toutes les demandes
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default NotificationBell;
