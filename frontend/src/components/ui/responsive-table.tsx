import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Affiche un tableau sur desktop (≥ md) et une liste de cartes sur mobile —
 * les tableaux larges (6+ colonnes) deviennent illisibles sur téléphone et
 * forcent un défilement horizontal (skill §5 horizontal-scroll).
 *
 * Chaque page conserve son `<Table>` existant et fournit un rendu `cards`
 * compact via <DataCard> / <DataCardRow>.
 *
 *   <ResponsiveTable
 *     table={<Table>…</Table>}
 *     cards={rows.map((r) => (
 *       <DataCard key={r.id} onClick={() => nav(r.id)} title={r.numero} badge={<StatusBadge …/>}>
 *         <DataCardRow label="Client" value={r.client} />
 *         <DataCardRow label="Total" value={<span className="num">{fmt(r.total)}</span>} />
 *       </DataCard>
 *     ))}
 *   />
 */
export function ResponsiveTable({
  table,
  cards,
  className,
}: {
  table: React.ReactNode;
  cards: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="hidden md:block">{table}</div>
      <div className="space-y-2 md:hidden">{cards}</div>
    </div>
  );
}

/** Carte mobile pour une ligne de données. Cliquable si `onClick` fourni. */
export function DataCard({
  title,
  badge,
  onClick,
  children,
  className,
}: {
  title?: React.ReactNode;
  badge?: React.ReactNode;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  const interactive = !!onClick;
  return (
    <div
      onClick={onClick}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick!();
              }
            }
          : undefined
      }
      className={cn(
        'rounded-lg border bg-card p-3 text-sm shadow-xs',
        // Survol de ligne = interaction haute fréquence : pas de transition.
        interactive &&
          'cursor-pointer hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className
      )}
    >
      {(title || badge) && (
        <div className="mb-2 flex items-center justify-between gap-2">
          {title && (
            // `title` natif : le libellé tronqué reste lisible en entier au survol.
            <div
              className="font-medium text-foreground truncate"
              title={typeof title === 'string' ? title : undefined}
            >
              {title}
            </div>
          )}
          {badge}
        </div>
      )}
      <dl className="space-y-1">{children}</dl>
    </div>
  );
}

/** Ligne label / valeur dans une <DataCard>. */
export function DataCardRow({
  label,
  value,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-muted-foreground shrink-0">{label}</dt>
      <dd
        className="text-right text-foreground min-w-0 truncate tabular-nums"
        title={typeof value === 'string' ? value : undefined}
      >
        {value}
      </dd>
    </div>
  );
}
