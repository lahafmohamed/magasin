import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Teinte catégorielle (`chart-1` … `chart-8`, réglées par thème dans index.css).
 * `1` est le bleu de l'accent : à réserver aux graphiques qui ont besoin de
 * toutes les teintes, pas aux étiquettes qu'une liste répète à chaque ligne.
 */
export type TagHue = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

const DOT: Record<TagHue, string> = {
  1: 'bg-chart-1',
  2: 'bg-chart-2',
  3: 'bg-chart-3',
  4: 'bg-chart-4',
  5: 'bg-chart-5',
  6: 'bg-chart-6',
  7: 'bg-chart-7',
  8: 'bg-chart-8',
};

/**
 * Teinte stable dérivée d'une clé (catégorie de dépense, journal…) quand aucune
 * table de correspondance n'existe : la même clé garde la même pastille.
 */
export function hueFromKey(key: string): TagHue {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return ((h % 7) + 1) as TagHue;
}

export interface TagProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Pastille de couleur catégorielle. Sans `hue` (ni `icon`) : étiquette neutre. */
  hue?: TagHue;
  /** Icône à la place de la pastille (mode de paiement…), décorative. */
  icon?: LucideIcon;
  size?: 'sm' | 'md';
}

/**
 * Étiquette de CATÉGORIE (rôle d'un contact, mode de paiement, type de
 * mouvement, journal) — jamais de statut : pour un statut, `<StatusBadge>`.
 *
 * Le texte reste `text-foreground` (≥ 18:1) et la teinte vit dans une pastille :
 * l'ancienne recette `bg-chart-N/15 text-chart-N` passait sous 4,5:1 pour 5
 * teintes sur 7 en thème clair, et peindre un fournisseur en orange « alerte »
 * détournait les rampes de statut.
 *
 * Point + texte, sans cadre, à la taille du texte qui l'entoure : une catégorie
 * n'est pas un statut, elle n'a pas à se dessiner en pastille à côté des
 * vraies pastilles de statut (trois cadres par ligne dans les listes).
 *
 *   <Tag hue={3}>Client</Tag>
 *   <Tag hue={paymentMethodHue(m)}>{formatPaymentMethod(m)}</Tag>
 *   <Tag icon={Smartphone}>Wave</Tag>
 */
export const Tag = React.forwardRef<HTMLSpanElement, TagProps>(
  ({ hue, icon: Icon, size = 'sm', className, children, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        'inline-flex items-center whitespace-nowrap text-foreground',
        size === 'sm' ? 'gap-1.5' : 'gap-2 text-sm',
        className
      )}
      {...props}
    >
      {Icon ? (
        <Icon
          aria-hidden="true"
          className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
        />
      ) : hue ? (
        <span aria-hidden="true" className={cn('h-2 w-2 shrink-0 rounded-full', DOT[hue])} />
      ) : null}
      {children}
    </span>
  )
);
Tag.displayName = 'Tag';
