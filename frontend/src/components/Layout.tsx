import { ReactNode, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { GlobalSearch } from './GlobalSearch';
import { ErrorBoundary } from './ErrorBoundary';
import { cn } from '@/lib/utils';
import { routeLabel } from '@/config/routeAccess';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

interface LayoutProps {
  children: ReactNode;
}

const SIDEBAR_KEY = 'sidebar-collapsed';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === '1';
  } catch {
    return false;
  }
}

/** Délai maximal d'attente du titre d'une page chargée en différé. */
const HEADING_WAIT_MS = 3000;

/**
 * Après un changement de page, le focus passe sur le titre (`h1`) de la
 * nouvelle page : le lecteur d'écran annonce la page, et Tab repart du
 * contenu au lieu du lien de menu cliqué (WCAG 2.4.3).
 *
 * On ne touche pas au focus quand la page l'a déjà placé elle-même (champ
 * `autoFocus` d'un formulaire) ou quand une fenêtre modale est ouverte.
 */
function useFocusHeadingOnNavigate(mainRef: React.RefObject<HTMLElement>) {
  const location = useLocation();
  const navigationType = useNavigationType();
  // Chemin déjà traité : ni le premier affichage ni le double appel des effets
  // en mode strict ne doivent déplacer le focus.
  const handledPath = useRef(location.pathname);

  useEffect(() => {
    if (handledPath.current === location.pathname) return;
    handledPath.current = location.pathname;
    // Nouvelle page : on repart du haut. Retour arrière : la position est gardée.
    // Lien vers une ancre (`/profil#mot-de-passe`) : la page s'y place elle-même.
    if (navigationType !== 'POP' && !window.location.hash) window.scrollTo({ top: 0, left: 0 });

    const started = performance.now();
    let frame = 0;
    const tryFocus = () => {
      const main = mainRef.current;
      const heading = main?.querySelector<HTMLElement>('h1');
      if (!main || !heading) {
        if (performance.now() - started < HEADING_WAIT_MS) frame = requestAnimationFrame(tryFocus);
        return;
      }
      const active = document.activeElement;
      const focusAlreadyInPage = !!active && active !== main && main.contains(active);
      const inDialog = !!active?.closest('[role="dialog"], [role="alertdialog"]');
      if (focusAlreadyInPage || inDialog) return;
      if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: true });
    };
    frame = requestAnimationFrame(tryFocus);
    return () => cancelAnimationFrame(frame);
  }, [location.pathname, navigationType, mainRef]);
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0');
    } catch {
      /* stockage indisponible : la préférence ne survivra pas au rechargement */
    }
  }, [collapsed]);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Titre d'onglet par défaut tiré de la route ; `PageShell` le précise.
  useDocumentTitle(routeLabel(location.pathname), { priority: 0 });
  useFocusHeadingOnNavigate(mainRef);

  return (
    <div className="min-h-screen bg-canvas">
      {/* La navigation précède <main> dans le DOM sur toutes les routes : sans
          ce lien, atteindre le contenu au clavier impose de traverser toutes
          les entrées du menu à chaque changement de page. */}
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
          // Pas de transition : animer `padding` (et la largeur du rail) recalcule
          // la mise en page à chaque image — saccadé sur les postes du comptoir.
          'flex min-h-screen flex-col',
          collapsed ? 'lg:pl-16' : 'lg:pl-60'
        )}
      >
        <Topbar
          collapsed={collapsed}
          mobileOpen={mobileOpen}
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
          ref={mainRef}
          key={location.pathname}
          id="contenu-principal"
          tabIndex={-1}
          className="page-enter w-full flex-1 focus:outline-none"
        >
          {/* Une page qui plante reste dans le cadre : menu et barre du haut
              restent utilisables pour aller ailleurs. */}
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
