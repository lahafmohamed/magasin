import * as React from 'react';
import { Tag, type TagHue } from '@/components/ui/tag';
import { cn } from '@/lib/utils';

export type TiersRole = 'client' | 'fournisseur' | 'mixte';

/**
 * Rôle d'un contact (client, fournisseur). C'est une CATÉGORIE, pas un statut :
 * étiquette `Tag` (texte neutre + pastille de couleur), et non plus les rampes
 * info / alerte qui faisaient lire un fournisseur comme un avertissement.
 *
 * Teintes : client = chart-1, fournisseur = chart-6 (contact mixte = chart-4
 * quand un seul libellé est imposé via `children`). Un contact à la fois client
 * et fournisseur affiche les deux étiquettes « Client » + « Fournisseur »
 * (glossaire : plus de « Mixte » ni de « Fourn. »).
 */
// Pas la teinte 1 : c'est le bleu de l'accent (« on peut agir »), et la liste
// des contacts alignait un point bleu par client.
export const TIERS_ROLE_HUE: Record<TiersRole, TagHue> = {
  client: 3,
  fournisseur: 6,
  mixte: 4,
};

export const TIERS_ROLE_LABEL: Record<TiersRole, string> = {
  client: 'Client',
  fournisseur: 'Fournisseur',
  mixte: 'Client et fournisseur',
};

export function TiersRoleBadge({
  role,
  className,
  children,
}: {
  role: TiersRole;
  className?: string;
  /** Remplace le libellé par défaut (ex. avec une icône). */
  children?: React.ReactNode;
}) {
  if (role === 'mixte' && children === undefined) {
    return (
      <span className={cn('inline-flex flex-wrap items-center gap-1', className)}>
        <Tag hue={TIERS_ROLE_HUE.client}>{TIERS_ROLE_LABEL.client}</Tag>
        <Tag hue={TIERS_ROLE_HUE.fournisseur}>{TIERS_ROLE_LABEL.fournisseur}</Tag>
      </span>
    );
  }
  return (
    <Tag hue={TIERS_ROLE_HUE[role]} className={className}>
      {children ?? TIERS_ROLE_LABEL[role]}
    </Tag>
  );
}
