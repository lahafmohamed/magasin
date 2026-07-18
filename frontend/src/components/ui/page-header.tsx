import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, LucideIcon } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  icon?: LucideIcon;
  /** Sous-titre affiché sous le titre */
  description?: ReactNode;
  /** Lien "Retour" affiché au-dessus du titre (pages de détail) */
  backTo?: string;
  backLabel?: string;
  /** Boutons d'action alignés à droite */
  actions?: ReactNode;
  className?: string;
}

/**
 * En-tête de page canonique — même hiérarchie visuelle que DocumentListPage
 * (text-3xl font-bold tracking-tight). Toutes les pages doivent l'utiliser au
 * lieu de re-styler leur propre <h1>.
 */
export function PageHeader({
  title,
  icon: Icon,
  description,
  backTo,
  backLabel = 'Retour',
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div className={className}>
      {backTo && (
        <Link
          to={backTo}
          className="mb-2 inline-flex items-center gap-1 rounded-md px-2 py-1 -ml-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> {backLabel}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            {Icon && <Icon className="h-8 w-8" />} {title}
          </h1>
          {description && <p className="text-muted-foreground mt-1">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
