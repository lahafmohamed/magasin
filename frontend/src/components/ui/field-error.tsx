import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Message d'erreur d'un champ, relié au champ par `aria-describedby`.
 *
 * Un `aria-invalid` seul ne sert à rien : le lecteur d'écran annonce « champ
 * invalide » sans jamais lire la raison. Les deux morceaux doivent porter le
 * même identifiant, d'où cette paire :
 *
 *   <Input id="facture-client" {...fieldErrorProps('facture-client', errors.client_id)} />
 *   <FieldError id="facture-client">{errors.client_id?.message}</FieldError>
 *
 * `FieldError` ne rend rien s'il n'y a pas de message, donc il peut rester en
 * place sans condition autour.
 */
export function fieldErrorProps(id: string, error: unknown) {
  const hasError = Boolean(error);
  return {
    'aria-invalid': hasError ? (true as const) : undefined,
    'aria-describedby': hasError ? `${id}-error` : undefined,
  };
}

export function FieldError({
  id,
  children,
  className,
}: {
  /** Identifiant du champ — le même que celui passé à `fieldErrorProps`. */
  id: string;
  children?: React.ReactNode;
  className?: string;
}) {
  if (!children) return null;
  return (
    <p
      id={`${id}-error`}
      role="alert"
      className={cn('mt-1 text-xs font-medium text-danger', className)}
    >
      {children}
    </p>
  );
}
