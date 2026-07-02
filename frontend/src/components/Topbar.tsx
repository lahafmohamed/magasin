import { Menu, PanelLeft, Search, Sun, Moon, User, LogOut, Command } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '../lib/AuthContext';
import { useTheme } from '../lib/ThemeContext';
import { NotificationBell } from './NotificationBell';

/** Opens the GlobalSearch command palette (it listens for Ctrl/Cmd+K on document). */
function openGlobalSearch() {
  document.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true })
  );
}

export function Topbar({
  onToggleSidebar,
  onOpenMobile,
}: {
  onToggleSidebar: () => void;
  onOpenMobile: () => void;
}) {
  const { user, logout } = useAuth();
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/60 sm:px-4">
      {/* Mobile: open drawer */}
      <Button
        variant="ghost"
        size="sm"
        className="lg:hidden h-8 w-8 p-0"
        onClick={onOpenMobile}
        aria-label="Ouvrir le menu"
      >
        <Menu className="h-4 w-4" />
      </Button>

      {/* Desktop: collapse/expand rail */}
      <Button
        variant="ghost"
        size="sm"
        className="hidden lg:inline-flex h-8 w-8 p-0"
        onClick={onToggleSidebar}
        aria-label="Réduire ou agrandir le menu"
        title="Réduire / agrandir"
      >
        <PanelLeft className="h-4 w-4" />
      </Button>

      {/* Search trigger */}
      <button
        onClick={openGlobalSearch}
        className="flex h-8 w-full max-w-xs items-center gap-2 rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Rechercher"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="hidden truncate sm:inline">Rechercher…</span>
        <kbd className="ml-auto hidden select-none items-center gap-1 rounded border bg-background px-1.5 font-mono text-[10px] text-muted-foreground sm:inline-flex">
          <Command className="h-3 w-3" />K
        </kbd>
      </button>

      <div className="flex-1" />

      {user && (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            aria-label={isDark ? 'Activer le mode clair' : 'Activer le mode sombre'}
            title={isDark ? 'Mode clair' : 'Mode sombre'}
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>

          <NotificationBell />

          <div className="hidden items-center gap-1.5 px-1.5 text-xs sm:flex">
            <User className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">{user.username}</span>
            <span className="inline-flex items-center rounded-full border px-1.5 text-xs uppercase tracking-wide text-muted-foreground">
              {user.role}
            </span>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={logout}
            className="h-8 gap-1 px-2 text-danger-600 hover:bg-danger-50 hover:text-danger-700 dark:text-danger-500 dark:hover:bg-danger-500/10"
            aria-label="Déconnexion"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden lg:inline text-xs">Déconnexion</span>
          </Button>
        </div>
      )}
    </header>
  );
}
