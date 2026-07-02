import * as React from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export interface ConfirmOptions {
  /** Titre du dialogue. */
  title: string;
  /** Message explicatif (peut décrire les conséquences). */
  description?: React.ReactNode;
  /** Libellé du bouton de confirmation. Défaut : « Confirmer ». */
  confirmLabel?: string;
  /** Libellé du bouton d'annulation. Défaut : « Annuler ». */
  cancelLabel?: string;
  /** Style destructif (rouge) pour les suppressions / actions irréversibles. */
  destructive?: boolean;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = React.createContext<ConfirmFn | null>(null);

interface PendingState extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

/**
 * Fournit une fonction `confirm()` basée sur une promesse, rendue via un
 * dialogue Radix thématisé (dark mode, focus-trap, Échap) — remplace le
 * `window.confirm()` natif pour les actions destructives.
 *
 * Monté une seule fois près de la racine (App). Consommé via `useConfirm()`.
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = React.useState<PendingState | null>(null);

  const confirm = React.useCallback<ConfirmFn>((opts) => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...opts, resolve });
    });
  }, []);

  const close = React.useCallback(
    (result: boolean) => {
      setPending((prev) => {
        prev?.resolve(result);
        return null;
      });
    },
    []
  );

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={!!pending} onOpenChange={(open) => !open && close(false)}>
        {pending && (
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {pending.destructive && (
                  <AlertTriangle
                    className="h-5 w-5 text-destructive shrink-0"
                    aria-hidden="true"
                  />
                )}
                {pending.title}
              </DialogTitle>
              {pending.description && (
                <DialogDescription>{pending.description}</DialogDescription>
              )}
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="outline" onClick={() => close(false)}>
                {pending.cancelLabel ?? 'Annuler'}
              </Button>
              <Button
                variant={pending.destructive ? 'destructive' : 'default'}
                onClick={() => close(true)}
                autoFocus
              >
                {pending.confirmLabel ?? 'Confirmer'}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </ConfirmContext.Provider>
  );
}

/**
 * Retourne `confirm(opts) => Promise<boolean>`.
 *
 *   const confirm = useConfirm();
 *   if (!(await confirm({ title: 'Supprimer ?', destructive: true }))) return;
 */
export function useConfirm(): ConfirmFn {
  const ctx = React.useContext(ConfirmContext);
  if (!ctx) {
    throw new Error('useConfirm must be used within a <ConfirmProvider>');
  }
  return ctx;
}
