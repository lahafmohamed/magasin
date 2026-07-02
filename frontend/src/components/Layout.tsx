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
        {/* key forces the enter animation to replay on each route change */}
        <main key={location.pathname} className="page-enter flex-1 w-full">
          {children}
        </main>
      </div>
    </div>
  );
}
