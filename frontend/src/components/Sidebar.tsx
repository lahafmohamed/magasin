import { Link, useLocation } from 'react-router-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavCategories, DASHBOARD_ITEM, NavItem } from './navConfig';

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
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      to={item.path}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group flex items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
        active
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
        collapsed && 'justify-center px-0'
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed && <span className="truncate">{item.label}</span>}
      {!collapsed && active && (
        <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
      )}
    </Link>
  );
}

function NavList({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const location = useLocation();
  const categories = useNavCategories();
  const activePath = bestMatchingPath(location.pathname, [
    DASHBOARD_ITEM.path,
    ...categories.flatMap((cat) => cat.items.map((it) => it.path)),
  ]);

  return (
    <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
      <SideItem
        item={DASHBOARD_ITEM}
        active={activePath === DASHBOARD_ITEM.path}
        collapsed={collapsed}
        onNavigate={onNavigate}
      />
      {categories.map((cat) => (
        <div key={cat.label} className="space-y-1">
          {collapsed ? (
            <div className="mx-2 my-2 border-t" aria-hidden="true" />
          ) : (
            <p className="px-2.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              {cat.label}
            </p>
          )}
          {cat.items.map((it) => (
            <SideItem
              key={it.path + it.label}
              item={it}
              active={activePath === it.path}
              collapsed={collapsed}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      ))}
    </nav>
  );
}

function Brand({ collapsed }: { collapsed: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2 min-w-0">
      <img src="/logo.png" alt="Logo" className="h-8 w-auto object-contain shrink-0" />
      {!collapsed && (
        <span className="font-semibold text-sm truncate">Hitek-CI</span>
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
      {/* Desktop rail — fixed, collapsible */}
      <aside
        className={cn(
          'hidden lg:flex flex-col fixed inset-y-0 left-0 z-40 border-r bg-background transition-[width] duration-200 ease-out',
          collapsed ? 'w-16' : 'w-60'
        )}
      >
        <div className="flex h-14 items-center border-b px-3">
          <Brand collapsed={collapsed} />
        </div>
        <NavList collapsed={collapsed} />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div
            className="fixed inset-0 bg-black/50 animate-in fade-in-0 duration-200"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="fixed inset-y-0 left-0 w-72 max-w-[80vw] flex flex-col border-r bg-background animate-in slide-in-from-left duration-200">
            <div className="flex h-14 items-center justify-between border-b px-3">
              <Brand collapsed={false} />
              <button
                onClick={onCloseMobile}
                aria-label="Fermer le menu"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <NavList collapsed={false} onNavigate={onCloseMobile} />
          </aside>
        </div>
      )}
    </>
  );
}
