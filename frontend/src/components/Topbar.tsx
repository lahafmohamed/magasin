import { Menu, PanelLeft, Search, Sun, Moon, User, LogOut, KeyRound, ChevronDown, Monitor, Settings, Keyboard } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useAuth } from '../lib/AuthContext';
import { useTheme } from '../lib/ThemeContext';
import { NotificationBell } from './NotificationBell';
import { ROLE_LABELS } from '../utils/roles';
import { useRouteAccess } from '../hooks/useRouteAccess';
import { openShortcutsHelp } from '../hooks/useKeyboardShortcuts';
import { SEARCH_SHORTCUT_ARIA, SEARCH_SHORTCUT_LABEL } from '../lib/platform';

/** Opens the GlobalSearch command palette (it listens for Ctrl/Cmd+K on document). */
function openGlobalSearch() {
  document.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true })
  );
}


// Cibles tactiles : 44 px sous `lg` (téléphone, tablette du dépôt), 40 px au bureau.
const iconButtonClass = 'h-11 w-11 shrink-0 p-0 lg:h-10 lg:w-10';

export function Topbar({
  collapsed,
  mobileOpen,
  onToggleSidebar,
  onOpenMobile,
}: {
  collapsed: boolean;
  mobileOpen: boolean;
  onToggleSidebar: () => void;
  onOpenMobile: () => void;
}) {
  const { user, logout } = useAuth();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const canOpen = useRouteAccess();
  const isDark = resolvedTheme === 'dark';
  const displayName = user ? user.nom_complet || user.username : '';

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-1 border-b bg-background/95 px-2 backdrop-blur supports-[backdrop-filter]:bg-background/90 sm:gap-2 sm:px-4">
      {/* Mobile : ouvrir le tiroir */}
      <Button
        variant="ghost"
        size="sm"
        className={cn(iconButtonClass, 'lg:hidden')}
        onClick={onOpenMobile}
        aria-label="Ouvrir le menu"
        aria-haspopup="dialog"
        aria-expanded={mobileOpen}
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </Button>

      {/* Bureau : réduire / agrandir le rail */}
      <Button
        variant="ghost"
        size="sm"
        className={cn(iconButtonClass, 'hidden lg:inline-flex')}
        onClick={onToggleSidebar}
        aria-label={collapsed ? 'Agrandir le menu' : 'Réduire le menu'}
        aria-expanded={!collapsed}
        title={collapsed ? 'Agrandir le menu' : 'Réduire le menu'}
      >
        <PanelLeft className="h-4 w-4" aria-hidden="true" />
      </Button>

      {/* Déclencheur de la recherche globale */}
      <button
        type="button"
        onClick={openGlobalSearch}
        aria-haspopup="dialog"
        aria-keyshortcuts={SEARCH_SHORTCUT_ARIA}
        className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-md border border-transparent bg-muted px-3 text-sm text-muted-foreground transition-colors hover:border-border hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:max-w-xs lg:h-10"
      >
        <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="truncate">Rechercher…</span>
        <kbd className="ml-auto hidden select-none items-center rounded border bg-background px-1.5 font-sans text-2xs font-medium text-muted-foreground sm:inline-flex">
          {SEARCH_SHORTCUT_LABEL}
        </kbd>
      </button>

      <div className="hidden flex-1 sm:block" />

      {user && (
        <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
          <Button
            variant="ghost"
            size="sm"
            className={iconButtonClass}
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            aria-label={isDark ? 'Activer le mode clair' : 'Activer le mode sombre'}
            title={isDark ? 'Activer le mode clair' : 'Activer le mode sombre'}
          >
            {isDark ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
          </Button>

          <NotificationBell />

          {/* Menu utilisateur : profil, mot de passe, thème, déconnexion. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-11 gap-1.5 px-1.5 lg:h-10 lg:px-2"
                // Le nom visible doit figurer dans le nom accessible (WCAG 2.5.3).
                aria-label={`Menu utilisateur — ${displayName}`}
              >
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium uppercase text-foreground"
                >
                  {displayName.slice(0, 2)}
                </span>
                <span className="hidden max-w-[10rem] truncate text-sm lg:inline" title={displayName}>
                  {displayName}
                </span>
                <ChevronDown className="hidden h-3.5 w-3.5 text-muted-foreground sm:inline" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="font-normal">
                <p className="truncate text-sm font-medium">{displayName}</p>
                {user.email && (
                  <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  {ROLE_LABELS[user.role] || user.role}
                </p>
              </DropdownMenuLabel>

              <DropdownMenuSeparator />

              <DropdownMenuItem asChild>
                <Link to="/profil" className="cursor-pointer gap-2">
                  <User className="h-4 w-4" aria-hidden="true" />
                  Mon profil
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/profil#mot-de-passe" className="cursor-pointer gap-2">
                  <KeyRound className="h-4 w-4" aria-hidden="true" />
                  Changer mon mot de passe
                </Link>
              </DropdownMenuItem>
              {canOpen('/settings') && (
                <DropdownMenuItem asChild>
                  <Link to="/settings" className="cursor-pointer gap-2">
                    <Settings className="h-4 w-4" aria-hidden="true" />
                    Paramètres de l’entreprise
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => openShortcutsHelp()} className="gap-2">
                <Keyboard className="h-4 w-4" aria-hidden="true" />
                Raccourcis clavier
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Thème</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={theme}
                onValueChange={(value) => setTheme(value as 'light' | 'dark' | 'system')}
              >
                <DropdownMenuRadioItem value="light" className="gap-2">
                  <Sun className="h-4 w-4" aria-hidden="true" />
                  Clair
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="dark" className="gap-2">
                  <Moon className="h-4 w-4" aria-hidden="true" />
                  Sombre
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="system" className="gap-2">
                  <Monitor className="h-4 w-4" aria-hidden="true" />
                  Thème de l’appareil
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                onSelect={() => {
                  void logout();
                }}
                className="gap-2 text-danger-700 focus:bg-danger-50 focus:text-danger-800"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Se déconnecter
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </header>
  );
}
