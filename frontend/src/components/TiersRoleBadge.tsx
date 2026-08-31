import * as React from 'react';
import { cn } from '@/lib/utils';

export type TiersRole = 'client' | 'fournisseur' | 'mixte';

/**
 * Pastille de rôle d'un tiers. Le même badge était recopié à 12 endroits
 * (Tiers, TiersDetail, TiersPicker) en primitives Tailwind brutes — bleu/orange
 * avec leurs variantes `dark:` faites à la main — et rendu à trois tailles
 * différentes. Il passe désormais par les rampes sémantiques, qui s'inversent
 * seules en thème sombre.
 */
const ROLE: Record<TiersRole, { label: string; className: string }> = {
  client: {
    label: 'Client',
    className: 'border-info-200 bg-info-50 text-info-700',
  },
  fournisseur: {
    label: 'Fourn.',
    className: 'border-warning-200 bg-warning-50 text-warning-700',
  },
  // Tiers à la fois client et fournisseur : ni l'un ni l'autre des deux rôles,
  // donc une teinte catégorielle plutôt qu'une rampe de statut.
  mixte: {
    label: 'Mixte',
    className: 'border-chart-4/30 bg-chart-4/15 text-chart-4',
  },
};

export function TiersRoleBadge({
  role,
  className,
  children,
}: {
  role: TiersRole;
  className?: string;
  /** Remplace le libellé par défaut (ex. « Fournisseur » en entier, ou avec une icône). */
  children?: React.ReactNode;
}) {
  const { label, className: roleClassName } = ROLE[role];
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded border px-1.5 py-0.5 text-xs font-medium',
        roleClassName,
        className
      )}
    >
      {children ?? label}
    </span>
  );
}
