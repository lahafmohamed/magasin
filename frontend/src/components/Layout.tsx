import { ReactNode, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { GlobalSearch } from './GlobalSearch';
import { cn } from '@/lib/utils';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('sidebar-collapsed') === '1'
  );
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', collapsed ? '1' : '0');
  }, [collapsed]);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-background">
      {/* La navigation précède <main> dans le DOM sur toutes les routes : sans
          ce lien, atteindre le contenu au clavier impose de traverser les 29
          entrées du menu à chaque changement de page. */}
      <a
        href="#contenu-principal"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-skiplink focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        Aller au contenu principal
      </a>
      <Sidebar
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />
      <GlobalSearch />

      {/* Content column — offset by the fixed rail width on desktop */}
      <div
        className={cn(
          'flex min-h-screen flex-col transition-[padding] duration-200 ease-out',
          collapsed ? 'lg:pl-16' : 'lg:pl-60'
        )}
      >
        <Topbar
          onToggleSidebar={() => setCollapsed((c) => !c)}
          onOpenMobile={() => setMobileOpen(true)}
        />
        {import.meta.env.DEV && (
          <div
            role="status"
            className="border-b border-warning-300 bg-warning-50 px-3 py-1.5 text-center text-xs font-medium text-warning-900"
          >
            Environnement de développement — des données de test peuvent être présentes.
          </div>
        )}
        {/* key forces the enter animation to replay on each route change */}
        <main
          key={location.pathname}
          id="contenu-principal"
          tabIndex={-1}
          className="page-enter flex-1 w-full focus:outline-none"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
