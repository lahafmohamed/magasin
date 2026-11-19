import type { ReactNode, Ref } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, MoreHorizontal, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DocumentCodeText } from '@/components/ui/document-code';
import { routeLabel } from '@/config/routeAccess';

/** Action rangée dans le menu « Plus d’actions » de l'en-tête. */
export interface PageHeaderMenuAction {
  /** Libellé verbe + objet : « Supprimer le devis ». */
  label: string;
  /** Action au clic (une confirmation `useConfirm` reste à la charge de la page). */
  onSelect?: () => void;
  /** Ou une destination : l'entrée devient un lien. */
  to?: string;
  icon?: LucideIcon;
  /** Action destructrice : texte en rouge, regroupée en bas du menu. */
  destructive?: boolean;
  disabled?: boolean;
}

export interface PageHeaderProps {
  /**
   * Titre de la page — le seul `h1`. Sans icône : celle du menu latéral suffit,
   * et une icône devant le titre sur une page sur deux ne disait rien de plus.
   */
  title: string;
  /** Sous-titre affiché sous le titre (dire ce que la page apporte, pas répéter le titre). */
  description?: ReactNode;
  /** Pastilles de statut affichées à côté du titre (hors du `h1`). */
  meta?: ReactNode;
  /** Lien de retour au-dessus du titre (pages de détail). */
  backTo?: string;
  /** Retour vers une vue de la même page (formulaire ouvert dans la liste…). */
  onBack?: () => void;
  /** Destination du retour ; par défaut le nom de la page `backTo`, sinon « Retour ». */
  backLabel?: string;
  /** Actions secondaires (au plus deux, `variant="outline"`). */
  actions?: ReactNode;
  /** L'action principale de la page — un seul bouton plein, affiché en dernier. */
  primaryAction?: ReactNode;
  /** Actions rares ou destructrices, rangées dans « Plus d’actions ». */
  moreActions?: ReadonlyArray<PageHeaderMenuAction | false | null | undefined>;
  /** Rangée d'outils sous le titre : recherche, filtres, sélecteurs. */
  toolbar?: ReactNode;
  /** Référence vers le `h1` (focus après navigation, `PageShell`). */
  titleRef?: Ref<HTMLHeadingElement>;
  /** `id` du `h1`, pour `aria-labelledby`. */
  headingId?: string;
  className?: string;
}

/**
 * Boutons d'en-tête sous 640 px : 44 px de haut, le libellé long passe à la
 * ligne dans son bouton (WCAG 1.4.10 à 320 px), et les boutons d'une rangée se
 * partagent la largeur au lieu de garder chacun sa largeur naturelle.
 */
const phoneActionClass =
  'max-sm:[&>a]:h-auto max-sm:[&>a]:min-h-11 max-sm:[&>a]:flex-1 max-sm:[&>a]:whitespace-normal max-sm:[&>a]:py-2 max-sm:[&>button]:h-auto max-sm:[&>button]:min-h-11 max-sm:[&>button]:flex-1 max-sm:[&>button]:whitespace-normal max-sm:[&>button]:py-2';

const backControlClass =
  '-ml-2 inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:h-8';

/**
 * En-tête de page canonique.
 *
 * Disposition : retour au-dessus, titre (+ statut) à gauche, actions à droite
 * — secondaires, puis « Plus d’actions », puis l'action principale. Sous
 * 640 px les actions passent sous le titre : l'action principale d'abord, sur
 * toute la largeur, puis les secondaires qui se partagent la rangée suivante.
 *
 * Les pages passent par `PageShell`, qui rend cet en-tête ; `PageHeader` reste
 * exporté pour les pages pas encore migrées et pour `DocumentListPage`.
 */
export function PageHeader({
  title,
  description,
  meta,
  backTo,
  onBack,
  backLabel,
  actions,
  primaryAction,
  moreActions,
  toolbar,
  titleRef,
  headingId,
  className,
}: PageHeaderProps) {
  const menuItems = (moreActions ?? []).filter(Boolean) as PageHeaderMenuAction[];
  const safeItems = menuItems.filter((a) => !a.destructive);
  const dangerItems = menuItems.filter((a) => a.destructive);
  const hasActions = !!actions || !!primaryAction || menuItems.length > 0;
  const back = backLabel ?? (backTo ? routeLabel(backTo) : undefined) ?? 'Retour';

  // Une entrée sans icône garde la place de l'icône : les libellés s'alignent.
  const anyIcon = menuItems.some((a) => a.icon);
  const renderItem = (item: PageHeaderMenuAction) => {
    const ItemIcon = item.icon;
    const body = (
      <>
        {ItemIcon ? (
          <ItemIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
        ) : (
          anyIcon && <span className="h-4 w-4 shrink-0" aria-hidden="true" />
        )}
        {item.label}
      </>
    );
    const itemClass = cn(
      'gap-2',
      item.destructive && 'text-danger-700 focus:bg-danger-50 focus:text-danger-800'
    );
    if (item.to && !item.disabled) {
      return (
        <DropdownMenuItem key={item.label} asChild className={itemClass}>
          <Link to={item.to}>{body}</Link>
        </DropdownMenuItem>
      );
    }
    return (
      <DropdownMenuItem
        key={item.label}
        className={itemClass}
        disabled={item.disabled}
        onSelect={() => item.onSelect?.()}
      >
        {body}
      </DropdownMenuItem>
    );
  };

  return (
    <div className={cn('space-y-3', className)}>
      {(backTo || onBack) && (
        <div>
          {backTo ? (
            <Link to={backTo} className={backControlClass} aria-label={`Retour vers ${back}`}>
              <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
              {back}
            </Link>
          ) : (
            <button type="button" onClick={onBack} className={backControlClass}>
              <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
              {backLabel ?? 'Retour'}
            </button>
          )}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {/* 600 et non 700 : la taille porte la hiérarchie. */}
            <h1
              ref={titleRef}
              id={headingId}
              tabIndex={-1}
              className="min-w-0 scroll-mt-24 break-words rounded-sm text-2xl font-semibold tracking-title text-balance outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:text-3xl"
            >
              {/* Codes de document jamais coupés à leurs tirets (« FAC-2026-00110 »). */}
              <DocumentCodeText text={title} />
            </h1>
            {meta && <div className="flex flex-wrap items-center gap-2">{meta}</div>}
          </div>
          {description && (
            <p className="max-w-prose text-sm text-muted-foreground text-pretty">{description}</p>
          )}
        </div>

        {hasActions && (
          <div className={cn('flex flex-wrap items-center gap-2 sm:justify-end', phoneActionClass)}>
            {actions}
            {menuItems.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon-touch"
                    className="shrink-0 max-sm:!flex-none"
                    aria-label="Plus d’actions"
                    title="Plus d’actions"
                  >
                    <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                {/* À 16 px du bord sur téléphone, comme la gouttière de la page. */}
                <DropdownMenuContent align="end" collisionPadding={16} className="w-60">
                  {safeItems.map(renderItem)}
                  {safeItems.length > 0 && dangerItems.length > 0 && <DropdownMenuSeparator />}
                  {dangerItems.map(renderItem)}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {/* Sous 640 px l'action principale passe en tête, seule sur sa rangée ;
                au-delà l'enveloppe s'efface (`contents`) et le bouton reste le
                dernier de la rangée. */}
            {primaryAction && (
              <div className={cn('flex max-sm:order-first max-sm:basis-full sm:contents', phoneActionClass)}>
                {primaryAction}
              </div>
            )}
          </div>
        )}
      </div>

      {toolbar && (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">{toolbar}</div>
      )}
    </div>
  );
}
