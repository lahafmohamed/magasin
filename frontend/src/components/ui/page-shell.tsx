import { useCallback, useEffect, useRef, type FormEventHandler, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { PageHeader, type PageHeaderProps } from '@/components/ui/page-header';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

const WIDTHS = {
  /** Listes, tableau de bord, caisse, comptabilité, rapports, inventaire. */
  full: 'max-w-screen-2xl',
  /** Détail et formulaire de document. */
  wide: 'max-w-6xl',
  /** Profil, paramètres, pages à une colonne. */
  narrow: 'max-w-3xl',
} as const;

export type PageShellWidth = keyof typeof WIDTHS;

export interface PageShellProps extends Omit<PageHeaderProps, 'titleRef' | 'className'> {
  /**
   * Titre d'onglet quand le `h1` est un code nu : `h1` « FAC-2026-00110 » →
   * onglet « Facture FAC-2026-00110 · Hitek ». Par défaut : `title`.
   */
  documentTitle?: string;
  /** Largeur maximale du contenu (défaut `full`). */
  width?: PageShellWidth;
  /**
   * Met le focus sur le `h1` au montage — pour une vue ouverte par une action
   * sans changement d'adresse (formulaire de réception, création de commande).
   * Les changements de route sont déjà gérés par le `Layout`. Le cadre
   * refocalise aussi son nouveau `h1` quand il est remplacé (voir plus bas).
   */
  focusOnMount?: boolean;
  /** `form` : toute la page est le formulaire (bouton de validation dans l'en-tête). */
  as?: 'div' | 'form';
  onSubmit?: FormEventHandler<HTMLFormElement>;
  noValidate?: boolean;
  /** Classes du conteneur racine — ni gouttière ni largeur : c'est le rôle du cadre. */
  className?: string;
  /** Classes de l'en-tête. */
  headerClassName?: string;
  children?: ReactNode;
}

/**
 * Cadre commun de toutes les pages authentifiées : gouttière (16 px mobile,
 * 24 px dès 640 px), largeur maximale, rythme vertical, l'unique `h1` et le
 * titre de l'onglet.
 *
 *   <PageShell
 *     title="Facture FAC-2026-00110"
 *     backTo="/factures"
 *     width="wide"
 *     meta={<StatusBadge type="facture" statut={facture.statut} />}
 *     actions={<Button variant="outline" onClick={print}>Imprimer</Button>}
 *     primaryAction={<Button onClick={openPayment}>Enregistrer un paiement</Button>}
 *     moreActions={[{ label: 'Annuler la facture', destructive: true, onSelect: cancel }]}
 *   >
 *     …
 *   </PageShell>
 *
 * Chaque branche de rendu (chargement, erreur, introuvable, vues) renvoie un
 * `PageShell`, pour que le titre, le retour et la gouttière ne disparaissent
 * jamais pendant un chargement.
 */
export function PageShell({
  title,
  documentTitle,
  width = 'full',
  focusOnMount = false,
  as = 'div',
  onSubmit,
  noValidate,
  className,
  headerClassName,
  children,
  ...header
}: PageShellProps) {
  useDocumentTitle(documentTitle ?? title);
  const headingRef = useRef<HTMLHeadingElement>(null);
  /** Dernier `h1` traité (focalisé ou laissé tel quel). */
  const handledHeading = useRef<HTMLHeadingElement | null>(null);
  /** Le focus était dans le cadre au moment où React l'a retiré. */
  const focusDropped = useRef(false);

  const rootEl = useRef<HTMLElement | null>(null);

  // Quand une branche passe de `<div>` à `<form>` (chargement → formulaire de
  // réception, devis en édition), React remonte tout le sous-arbre : le `h1`
  // focalisé disparaît et le focus tombe sur `<body>`. Le détachement de la
  // racine (avant son retrait du DOM) est le dernier moment où l'on voit encore
  // où était le focus.
  const setRoot = useCallback((node: HTMLElement | null) => {
    if (!node) {
      const root = rootEl.current;
      const active = document.activeElement;
      if (root && active && active !== document.body && root.contains(active)) focusDropped.current = true;
    }
    rootEl.current = node;
  }, []);

  // Vue qui demande le focus : au montage, et quand une même instance passe
  // d'une vue sans focus à une vue qui en demande (liste → cycle de paie).
  useEffect(() => {
    const heading = headingRef.current;
    handledHeading.current = heading;
    focusDropped.current = false;
    if (focusOnMount) heading?.focus();
  }, [focusOnMount]);

  // Sans tableau de dépendances : on compare seulement le nœud du titre. Il a
  // changé (racine `<div>` → `<form>`) et plus rien n'a le focus : on le rend
  // au nouveau titre si la vue le demande ou si le focus était dans le cadre.
  useEffect(() => {
    const heading = headingRef.current;
    if (!heading || heading === handledHeading.current) return;
    handledHeading.current = heading;
    const dropped = focusDropped.current;
    focusDropped.current = false;
    const active = document.activeElement;
    const nothingFocused = !active || active === document.body;
    if (nothingFocused && (focusOnMount || dropped)) heading.focus({ preventScroll: !focusOnMount });
  });

  const classes = cn(
    'mx-auto w-full space-y-4 px-4 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:space-y-6 sm:px-6 sm:py-6',
    WIDTHS[width],
    className
  );

  const content = (
    <>
      <PageHeader title={title} titleRef={headingRef} className={headerClassName} {...header} />
      {children}
    </>
  );

  if (as === 'form') {
    return (
      <form ref={setRoot} className={classes} onSubmit={onSubmit} noValidate={noValidate}>
        {content}
      </form>
    );
  }
  return (
    <div ref={setRoot} className={classes}>
      {content}
    </div>
  );
}
