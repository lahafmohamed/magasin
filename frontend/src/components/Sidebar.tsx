import { useCallback, useRef } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Link, useLocation } from 'react-router-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogClose,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  FocusReturnCapture,
} from '@/components/ui/dialog';
import { focusPageHeading, useFocusReturn } from '@/components/ui/focus-return';
import { useCompanyBrand } from '@/lib/brand';
import { useNavCategories, DASHBOARD_ITEM, type NavItem } from './navConfig';
import { BrandMark } from '@/components/BrandMark';

/** Marque de l'entreprise (logo ou monogramme) — aussi utilisée par la connexion. */
export { BrandMark };

function isPathActive(pathname: string, path: string) {
  if (path === '/') return pathname === '/';
  return pathname === path || pathname.startsWith(path + '/');
}

/**
 * Longest matching path wins: on /caisse/audit both /caisse (prefix) and
 * /caisse/audit (exact) match — only the most specific item may be active,
 * otherwise two entries light up at once.
 */
function bestMatchingPath(pathname: string, paths: string[]): string | null {
  let best: string | null = null;
  for (const p of paths) {
    if (isPathActive(pathname, p) && (best === null || p.length > best.length)) {
      best = p;
    }
  }
  return best;
}

function SideItem({
  item,
  active,
  collapsed,
  touch,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  /** Tiroir mobile : lignes de 44 px. */
  touch?: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      to={item.path}
      onClick={onNavigate}
      // Réduit, le lien n'a plus de texte visible : le nom passe par aria-label
      // (une infobulle `title` seule n'est pas lue de façon fiable).
      aria-label={collapsed ? item.label : undefined}
      title={collapsed ? item.label : undefined}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group flex items-center gap-2.5 rounded-md px-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        touch ? 'h-11' : 'h-8',
        active
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
        collapsed && 'justify-center px-0'
      )}
    >
      <Icon
        className={cn('h-4 w-4 shrink-0', !active && 'text-muted-foreground group-hover:text-foreground')}
        aria-hidden="true"
      />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );
}

function NavList({
  collapsed,
  touch,
  onNavigate,
}: {
  collapsed: boolean;
  touch?: boolean;
  onNavigate?: () => void;
}) {
  const location = useLocation();
  const categories = useNavCategories();
  const activePath = bestMatchingPath(location.pathname, [
    DASHBOARD_ITEM.path,
    ...categories.flatMap((cat) => cat.items.map((it) => it.path)),
  ]);
  const idPrefix = touch ? 'nav-mobile' : 'nav';

  return (
    <nav aria-label="Navigation principale" className="flex-1 space-y-4 overflow-y-auto px-2 py-3">
      <SideItem
        item={DASHBOARD_ITEM}
        active={activePath === DASHBOARD_ITEM.path}
        collapsed={collapsed}
        touch={touch}
        onNavigate={onNavigate}
      />
      {categories.map((cat) => {
        const labelId = `${idPrefix}-${cat.id}`;
        return (
          <div key={cat.id} className="space-y-1">
            {collapsed ? (
              <>
                <div className="mx-2 my-2 border-t" aria-hidden="true" />
                <span id={labelId} className="sr-only">{cat.label}</span>
              </>
            ) : (
              // Casse de phrase, 12 px : 24 px au-dessus (avec l'écart entre
              // groupes), 8 px au-dessous — l'intitulé appartient à sa liste.
              // Lignes de 32 px espacées de 2 px au bureau : le menu complet
              // (38 entrées) tient presque sur un écran au lieu de deux.
              <p id={labelId} className="px-2.5 pb-1 pt-2 text-xs font-medium text-muted-foreground">
                {cat.label}
              </p>
            )}
            <ul aria-labelledby={labelId} className={touch ? 'space-y-1' : 'space-y-0.5'}>
              {cat.items.map((it) => (
                <li key={it.path}>
                  <SideItem
                    item={it}
                    active={activePath === it.path}
                    collapsed={collapsed}
                    touch={touch}
                    onNavigate={onNavigate}
                  />
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function Brand({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const brand = useCompanyBrand();
  return (
    <Link
      to="/"
      onClick={onNavigate}
      aria-label={collapsed ? `${brand.name} — tableau de bord` : undefined}
      title={collapsed ? brand.name : undefined}
      className="flex min-w-0 items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <BrandMark />
      {!collapsed && (
        <span className="truncate text-sm font-semibold" title={brand.name}>
          {brand.name}
        </span>
      )}
    </Link>
  );
}

export function Sidebar({
  collapsed,
  mobileOpen,
  onCloseMobile,
}: {
  collapsed: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  return (
    <>
      {/* Rail desktop — fixe, repliable. Un <div> et non un <aside> : la
          navigation est le <nav> qu'il contient, pas un contenu annexe. */}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-sidebar hidden flex-col border-r bg-background lg:flex',
          collapsed ? 'w-16' : 'w-60'
        )}
      >
        <div className={cn('flex h-14 items-center border-b', collapsed ? 'justify-center px-2' : 'px-3')}>
          <Brand collapsed={collapsed} />
        </div>
        <NavList collapsed={collapsed} />
      </div>

      <MobileDrawer open={mobileOpen} onClose={onCloseMobile} />
    </>
  );
}

/**
 * Tiroir de navigation mobile. Monté via Radix Dialog pour hériter du piège de
 * focus, de la fermeture par Échap et du verrou de défilement — que la version
 * faite main n'avait pas. Radix ne rend le focus qu'à un `DialogTrigger` : le
 * tiroir s'ouvre depuis un état, d'où `useFocusReturn` (retour au bouton
 * « Ouvrir le menu » de la barre du haut).
 *
 * Exception au retour du focus : quand le tiroir se ferme parce qu'on a choisi
 * une page, le `Layout` place le focus sur le titre de la nouvelle page ;
 * rendre le focus au bouton « menu » l'en déloger.
 */
function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigating = useRef(false);
  const onNavigate = () => {
    navigating.current = true;
    onClose();
  };
  const keepFocusOnNewPage = useCallback((event: Event) => {
    if (navigating.current) {
      event.preventDefault();
      navigating.current = false;
      // Le Layout renonce tant que le focus est dans le tiroir qui s'efface.
      focusPageHeading();
    }
  }, []);
  const focusReturn = useFocusReturn(keepFocusOnNewPage);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogPortal>
        <DialogOverlay className="lg:hidden" />
        <DialogPrimitive.Content
          className="fixed inset-y-0 left-0 z-modal flex w-72 max-w-[80vw] flex-col border-r bg-background outline-none duration-200 data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left lg:hidden"
          aria-describedby={undefined}
          onCloseAutoFocus={focusReturn.onCloseAutoFocus}
        >
          <FocusReturnCapture opener={focusReturn.opener} />
          <DialogTitle className="sr-only">Menu de navigation</DialogTitle>
          <div className="flex h-14 items-center justify-between border-b px-3">
            <Brand collapsed={false} onNavigate={onNavigate} />
            <DialogClose
              aria-label="Fermer le menu"
              className="inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </DialogClose>
          </div>
          <NavList collapsed={false} touch onNavigate={onNavigate} />
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
