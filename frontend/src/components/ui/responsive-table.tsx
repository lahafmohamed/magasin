import * as React from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

/**
 * Affiche un tableau sur desktop (≥ md) et une liste de cartes sur mobile —
 * les tableaux larges (5+ colonnes) deviennent illisibles sur téléphone et
 * forcent un défilement horizontal qui cache montants, statut et actions.
 *
 * Chaque page conserve son `<Table>` existant et fournit un rendu `cards`
 * compact via <DataCard> / <DataCardRow>.
 *
 *   <ResponsiveTable
 *     table={<Table aria-label="Liste des factures">…</Table>}
 *     cards={rows.map((r) => (
 *       <DataCard key={r.id} href={`/factures/${r.id}`} title={r.numero}
 *         badge={<StatusBadge type="facture" statut={r.statut} />}
 *         actions={<Button variant="outline" size="sm">Imprimer</Button>}>
 *         <DataCardRow label="Client" value={r.client} />
 *         <DataCardRow label="Total" value={<Money value={r.total} />} numeric />
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

/**
 * Aplatit les fragments pour trier les enfants d'une carte, avec des clés
 * uniques (deux niveaux de `Children.toArray` produiraient des « .0 » en double).
 */
function flattenChildren(children: React.ReactNode, prefix = ''): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  React.Children.toArray(children).forEach((child, i) => {
    if (React.isValidElement(child) && child.type === React.Fragment) {
      out.push(...flattenChildren((child.props as { children?: React.ReactNode }).children, `${prefix}${i}-`));
    } else if (React.isValidElement(child)) {
      out.push(React.cloneElement(child, { key: `${prefix}${child.key ?? i}` }));
    } else {
      out.push(child);
    }
  });
  return out;
}

export interface DataCardProps {
  /** Titre de la carte (numéro de document, nom…). Devient le lien/bouton principal. */
  title?: React.ReactNode;
  /** Pastille à droite du titre (statut). */
  badge?: React.ReactNode;
  /** Navigation : la carte entière ouvre cette route (lien réel, Ctrl+clic possible). */
  href?: string;
  /** Action dans la page (ouvrir un panneau…) quand il n'y a pas de route. */
  onClick?: () => void;
  /** Nom accessible du lien/bouton principal si le titre seul ne suffit pas (« Ouvrir la facture FAC-… »). */
  linkLabel?: string;
  /** Boutons d'action : rendus hors de la liste de valeurs, au-dessus de la zone cliquable. */
  actions?: React.ReactNode;
  /** Lignes `<DataCardRow>`. Tout autre enfant est rendu après la liste, cliquable. */
  children?: React.ReactNode;
  /**
   * Niveau du titre. Défaut `h2` : sur une liste, les cartes suivent
   * directement le `h1` de la page (un `h3` sautait un niveau). `h3` pour des
   * cartes placées dans une section déjà titrée (lignes d'un document sous
   * « Lignes de la facture »).
   */
  titleAs?: 'h2' | 'h3';
  /**
   * Titre sur plusieurs lignes au lieu d'être tronqué : pour un texte libre
   * (ligne d'avoir « Correction de prix … », prestation d'un devis), dont la
   * fin se perdait sur téléphone — l'infobulle `title` ne s'ouvre pas au toucher.
   */
  wrapTitle?: boolean;
  className?: string;
}

/**
 * Carte mobile pour une ligne de données.
 *
 * C'est un `<article>` dont le TITRE est le seul élément interactif principal
 * (lien si `href`, bouton si `onClick`), étiré sur toute la carte par un
 * pseudo-élément : un clic n'importe où ouvre la ligne, mais les boutons
 * d'action restent des cibles distinctes (`relative z-10`). L'ancienne carte
 * `role="button"` contenait d'autres boutons (axe `nested-interactive`) et
 * glissait des `<div>` dans le `<dl>` (axe `definition-list`).
 */
export function DataCard({
  title,
  badge,
  href,
  onClick,
  linkLabel,
  actions,
  children,
  titleAs: TitleTag = 'h2',
  wrapTitle = false,
  className,
}: DataCardProps) {
  const interactive = !!href || !!onClick;
  const items = flattenChildren(children);
  const rows = items.filter((c) => React.isValidElement(c) && c.type === DataCardRow);
  // Contenu libre (anciens appels qui passaient leurs boutons en enfants) : hors
  // du <dl> et au-dessus de la zone cliquable étirée.
  const extras = items.filter((c) => !(React.isValidElement(c) && c.type === DataCardRow));

  const stretched =
    "rounded-sm text-left after:absolute after:inset-0 after:rounded-lg after:content-[''] focus-visible:outline-none";
  const titleNode = href ? (
    <Link to={href} className={stretched} aria-label={linkLabel} data-card-link="">
      {title}
    </Link>
  ) : onClick ? (
    <button type="button" onClick={onClick} className={stretched} aria-label={linkLabel} data-card-link="">
      {title}
    </button>
  ) : (
    title
  );

  return (
    <article
      className={cn(
        'relative rounded-lg border bg-card p-3 text-sm shadow-xs',
        // Survol de ligne = interaction haute fréquence : pas de transition.
        interactive &&
          'hover:bg-accent/50 [&:has([data-card-link]:focus-visible)]:ring-2 [&:has([data-card-link]:focus-visible)]:ring-ring',
        className
      )}
    >
      {(title || badge || (interactive && !title)) && (
        <div className={cn('mb-2 flex justify-between gap-2', wrapTitle ? 'items-start' : 'items-center')}>
          {title ? (
            // `title` natif : le libellé tronqué reste lisible en entier au survol.
            <TitleTag
              className={cn(
                'min-w-0 text-sm font-medium text-foreground',
                wrapTitle ? 'break-words text-pretty' : 'truncate'
              )}
              title={!wrapTitle && typeof title === 'string' ? title : undefined}
            >
              {titleNode}
            </TitleTag>
          ) : interactive ? (
            // Pas de titre : un contrôle nommé reste nécessaire pour ouvrir la ligne.
            href ? (
              <Link to={href} className={stretched} data-card-link="">
                <span className="sr-only">{linkLabel ?? 'Ouvrir'}</span>
              </Link>
            ) : (
              <button type="button" onClick={onClick} className={stretched} data-card-link="">
                <span className="sr-only">{linkLabel ?? 'Ouvrir'}</span>
              </button>
            )
          ) : null}
          {badge && <div className="shrink-0">{badge}</div>}
        </div>
      )}
      {rows.length > 0 && <dl className="space-y-1">{rows}</dl>}
      {extras.length > 0 && <div className="relative z-10">{extras}</div>}
      {actions && (
        <div className="relative z-10 mt-3 flex flex-wrap items-center justify-end gap-2">{actions}</div>
      )}
    </article>
  );
}

/** Ligne label / valeur dans une <DataCard>. */
export function DataCardRow({
  label,
  value,
  numeric = false,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  /** Montant / quantité : chiffres tabulaires, jamais coupés. */
  numeric?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'min-w-0 truncate text-right text-foreground',
          // Une valeur qui contient un lien ou un bouton passe au-dessus de la
          // zone cliquable étirée de la carte.
          '[&:has(a,button)]:relative [&:has(a,button)]:z-10',
          numeric && 'whitespace-nowrap tabular-nums'
        )}
        title={typeof value === 'string' ? value : undefined}
      >
        {value}
      </dd>
    </div>
  );
}
