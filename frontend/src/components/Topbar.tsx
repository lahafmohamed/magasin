import { Menu, PanelLeft, Search, Sun, Moon, User, LogOut, Command, KeyRound, ChevronDown, Monitor } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '../lib/AuthContext';
import { useTheme } from '../lib/ThemeContext';
import { NotificationBell } from './NotificationBell';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrateur',
  manager: 'Manager',
  caissier: 'Caissier',
  depot_staff: 'Personnel dépôt',
  magasin_staff: 'Personnel magasin',
  viewer: 'Consultation',
};

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
  const { theme, resolvedTheme, setTheme } = useTheme();
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

          {/* Menu utilisateur : profil, mot de passe, thème, déconnexion. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 px-2"
                aria-label="Menu utilisateur"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold uppercase text-primary">
                  {(user.nom_complet || user.username).slice(0, 2)}
                </span>
                <span className="hidden max-w-[10rem] truncate text-xs lg:inline">
                  {user.nom_complet || user.username}
                </span>
                <ChevronDown className="hidden h-3.5 w-3.5 text-muted-foreground sm:inline" />
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel className="font-normal">
                <p className="truncate text-sm font-medium">{user.nom_complet || user.username}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {user.email || user.username}
                </p>
                <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
                  {ROLE_LABELS[user.role] || user.role}
                </p>
              </DropdownMenuLabel>

              <DropdownMenuSeparator />

              <DropdownMenuItem asChild>
                <Link to="/profil" className="cursor-pointer">
                  <User className="h-4 w-4" />
                  Mon profil
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/profil" className="cursor-pointer">
                  <KeyRound className="h-4 w-4" />
                  Changer mon mot de passe
                </Link>
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem onSelect={() => setTheme('light')}>
                <Sun className="h-4 w-4" />
                Mode clair
                {theme === 'light' && <span className="ml-auto text-xs">✓</span>}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setTheme('dark')}>
                <Moon className="h-4 w-4" />
                Mode sombre
                {theme === 'dark' && <span className="ml-auto text-xs">✓</span>}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setTheme('system')}>
                <Monitor className="h-4 w-4" />
                Système
                {theme === 'system' && <span className="ml-auto text-xs">✓</span>}
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                onSelect={() => {
                  void logout();
                }}
                className="text-danger-600 focus:bg-danger-50 focus:text-danger-700"
              >
                <LogOut className="h-4 w-4" />
                Déconnexion
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </header>
  );
}
