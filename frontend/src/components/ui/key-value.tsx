import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Liste libellé / valeur des fiches et détails (« Date », « Client », « Échéance »).
 * Remplace les quatre motifs coexistants (`<strong>Date:</strong>`, lignes
 * justifiées avec deux-points, InfoRow…). Pas de deux-points dans les libellés.
 *
 *   <KeyValueList>
 *     <KeyValue label="Date">{formatDate(f.date_facture)}</KeyValue>
 *     <KeyValue label="Total" numeric><Money value={f.total} /></KeyValue>
 *   </KeyValueList>
 */
export function KeyValueList({
  children,
  columns = 2,
  className,
  ...props
}: React.HTMLAttributes<HTMLDListElement> & {
  /** Colonnes à partir de 640 px (1 sur téléphone). */
  columns?: 1 | 2 | 3;
}) {
  return (
    <dl
      className={cn(
        'grid gap-x-6 gap-y-3',
        columns === 2 && 'sm:grid-cols-2',
        columns === 3 && 'sm:grid-cols-2 lg:grid-cols-3',
        className
      )}
      {...props}
    >
      {children}
    </dl>
  );
}

export function KeyValue({
  label,
  children,
  numeric = false,
  className,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  /** Montant / quantité : chiffres tabulaires. */
  numeric?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn('mt-0.5 break-words text-sm font-medium', numeric && 'tabular-nums')}>{children}</dd>
    </div>
  );
}
