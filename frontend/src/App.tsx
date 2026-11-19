import { Suspense, lazy, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './lib/AuthContext';
import { ModulesProvider } from './lib/ModulesContext';
import { useTheme } from './lib/ThemeContext';
import { useSingleKeyShortcuts } from './lib/shortcutPreferences';
import ModuleGuard from './components/ModuleGuard';
import { Toaster } from 'sonner';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ConfirmProvider } from './components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './components/ui/dialog';
import { Checkbox } from './components/ui/checkbox';
import ProtectedRoute, { NotFoundPage, RouteAccessGate } from './components/ProtectedRoute';
import Layout from './components/Layout';
import { SEARCH_SHORTCUT_LABEL } from './lib/platform';
import { shortcutKeysLabel, useERPShortcuts } from './hooks/useKeyboardShortcuts';
import { useSalesFormShortcutHelp, type ShortcutHelpRow } from './hooks/useSalesFormShortcutHelp';
import { useSseNotifications } from './hooks/useSseNotifications';
import { LoadingScreen } from './components/ui/loading';
import { APP_ROUTES, type AppRouteDef, type AppRoutePath } from './config/routeAccess';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Inventaire = lazy(() => import('./pages/Inventaire'));
const ClientAnalytics = lazy(() => import('./pages/ClientAnalytics'));
const Factures = lazy(() => import('./pages/Factures'));
const FactureDetail = lazy(() => import('./pages/FactureDetail'));
const NouvelleFacture = lazy(() => import('./pages/NouvelleFacture'));
const StockValuation = lazy(() => import('./pages/StockValuation'));
const Commandes = lazy(() => import('./pages/Commandes'));
const Reapprovisionnement = lazy(() => import('./pages/Reapprovisionnement'));
const CommandeDetail = lazy(() => import('./pages/CommandeDetail'));
const Login = lazy(() => import('./pages/Login'));
const Receptions = lazy(() => import('./pages/Receptions'));
const Reporting = lazy(() => import('./pages/Reporting'));
const StockLocations = lazy(() => import('./pages/StockLocations'));
const StockTransfers = lazy(() => import('./pages/StockTransfers'));
const AffectationsLocations = lazy(() => import('./pages/AffectationsLocations'));
const DemandesList = lazy(() => import('./pages/DemandesList'));
const DemandeDetail = lazy(() => import('./pages/DemandeDetail'));
const DemandeForm = lazy(() => import('./pages/DemandeForm'));
const FacturesFournisseur = lazy(() => import('./pages/FacturesFournisseur'));
const GeneralLedger = lazy(() => import('./pages/GeneralLedger'));
const Employes = lazy(() => import('./pages/Employes'));
const Payroll = lazy(() => import('./pages/Payroll'));
const UserManagement = lazy(() => import('./pages/UserManagement'));
const Devis = lazy(() => import('./pages/Devis'));
const NouveauDevis = lazy(() => import('./pages/NouveauDevis'));
const DevisDetail = lazy(() => import('./pages/DevisDetail'));
const BonsLivraison = lazy(() => import('./pages/BonsLivraison'));
const NouveauBonLivraison = lazy(() => import('./pages/NouveauBonLivraison'));
const BonLivraisonDetail = lazy(() => import('./pages/BonLivraisonDetail'));
const Avoirs = lazy(() => import('./pages/Avoirs'));
const Retours = lazy(() => import('./pages/Retours'));
const Relances = lazy(() => import('./pages/Relances'));
const NouvelAvoir = lazy(() => import('./pages/NouvelAvoir'));
const AvoirDetail = lazy(() => import('./pages/AvoirDetail'));
const Caisse = lazy(() => import('./pages/CaisseV2'));
const VenteComptoir = lazy(() => import('./pages/VenteComptoir'));
const Etiquettes = lazy(() => import('./pages/Etiquettes'));
const InventairesPhysiques = lazy(() => import('./pages/InventairesPhysiques'));
const InventairePhysiqueDetail = lazy(() => import('./pages/InventairePhysiqueDetail'));
const CaisseAudit = lazy(() => import('./pages/CaisseAudit'));
const CaisseHistorique = lazy(() => import('./pages/CaisseHistorique'));
const Depenses = lazy(() => import('./pages/DepensesV2'));
const ChangePassword = lazy(() => import('./pages/ChangePassword'));
const Profil = lazy(() => import('./pages/Profil'));
const TiersPage = lazy(() => import('./pages/Tiers'));
const TiersDetail = lazy(() => import('./pages/TiersDetail'));
const CompanySettings = lazy(() => import('./pages/CompanySettings'));
const ParametresFinance = lazy(() => import('./pages/ParametresFinance'));
const AuditLog = lazy(() => import('./pages/AuditLog'));
const Tresorerie = lazy(() => import('./pages/Tresorerie'));

/**
 * Page de chaque route. Le type exige une entrée par chemin de
 * `config/routeAccess.ts` — ni route oubliée, ni route sans règle d'accès.
 */
const PAGES: Record<AppRoutePath, ReactNode> = {
  '/': <Dashboard />,
  '/profil': <Profil />,
  '/inventaire': <Inventaire />,
  '/factures': <Factures />,
  '/factures/nouvelle': <NouvelleFacture />,
  '/factures/:id': <FactureDetail />,
  '/devis': <Devis />,
  '/devis/nouveau': <NouveauDevis />,
  '/devis/:id': <DevisDetail />,
  '/devis/:id/edit': <NouveauDevis />,
  '/bons-livraison': <BonsLivraison />,
  '/bons-livraison/nouveau': <NouveauBonLivraison />,
  '/bons-livraison/:id': <BonLivraisonDetail />,
  '/retours': <Retours />,
  '/avoirs': <Avoirs />,
  '/avoirs/nouveau': <NouvelAvoir />,
  '/avoirs/:id': <AvoirDetail />,
  '/relances': <Relances />,
  '/vente-comptoir': <VenteComptoir />,
  '/caisse': <Caisse />,
  '/depenses': <Depenses />,
  '/caisse/historique': <CaisseHistorique />,
  '/caisse/audit': <CaisseAudit />,
  '/demandes': <DemandesList />,
  '/demandes/nouvelle': <DemandeForm />,
  '/demandes/:id': <DemandeDetail />,
  '/demandes/:id/edit': <DemandeForm />,
  '/receptions': <Receptions />,
  '/stock-transfers': <StockTransfers />,
  '/stock-locations': <StockLocations />,
  '/etiquettes': <Etiquettes />,
  '/inventaire-physique': <InventairesPhysiques />,
  '/inventaire-physique/:id': <InventairePhysiqueDetail />,
  '/stock-valuation': <StockValuation />,
  '/commandes': <Commandes />,
  '/commandes/:id': <CommandeDetail />,
  '/reapprovisionnement': <Reapprovisionnement />,
  '/factures-fournisseur': <FacturesFournisseur />,
  '/tiers': <TiersPage />,
  '/tiers/:id': <TiersDetail />,
  '/clients/analytics': <ClientAnalytics />,
  '/employes': <Employes />,
  '/paie': <Payroll />,
  '/tresorerie': <Tresorerie />,
  '/general-ledger': <GeneralLedger />,
  '/reporting': <Reporting />,
  '/admin/users': <UserManagement />,
  '/affectations-locations': <AffectationsLocations />,
  '/settings': <CompanySettings />,
  '/admin/parametres-finance': <ParametresFinance />,
  '/admin/audit': <AuditLog />,
};

/**
 * Session → cadre (menu, barre du haut, filet d'erreur) → contrôle du rôle →
 * module actif → page. Le refus et le module masqué s'affichent DANS le cadre,
 * avec un chemin de retour.
 */
function protectedPage(route: AppRouteDef, page: ReactNode) {
  return (
    <ProtectedRoute>
      <Layout>
        <RouteAccessGate roles={route.roles}>
          <ModuleGuard>{page}</ModuleGuard>
        </RouteAccessGate>
      </Layout>
    </ProtectedRoute>
  );
}

function ShortcutsHelpDialog({
  open,
  onOpenChange,
  shortcuts,
  extra = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shortcuts: ReturnType<typeof useERPShortcuts>['shortcuts'];
  /** Raccourcis propres à un écran, décrits ici (Ctrl + Entrée des formulaires de vente, P-M5). */
  extra?: ShortcutHelpRow[];
}) {
  const [singleKeyEnabled, setSingleKeyEnabled] = useSingleKeyShortcuts();
  // Une ligne par action : « G puis I ou F2 », « Ctrl + / ou Ctrl + H ».
  const byDescription = new Map<string, string[]>();
  byDescription.set('Rechercher dans toute l’application', [SEARCH_SHORTCUT_LABEL]);
  for (const s of shortcuts) {
    const keys = byDescription.get(s.description) ?? [];
    keys.push(shortcutKeysLabel(s));
    byDescription.set(s.description, keys);
  }
  for (const row of extra) {
    const keys = byDescription.get(row.description) ?? [];
    keys.push(row.keys);
    byDescription.set(row.description, keys);
  }
  const rows = [...byDescription].map(([description, keys]) => ({ description, keys: keys.join(' ou ') }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Raccourcis clavier</DialogTitle>
          <DialogDescription>
            Les raccourcis ne se déclenchent pas pendant la saisie dans un champ
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={`${row.keys}-${row.description}`} className="flex items-center justify-between gap-4 text-sm">
              <span>{row.description}</span>
              <kbd className="shrink-0 whitespace-nowrap rounded border bg-muted px-2 py-0.5 font-sans text-xs font-medium">
                {row.keys}
              </kbd>
            </li>
          ))}
          <li className="flex items-center justify-between gap-4 text-sm">
            <span>Dans une liste : aller à la recherche, créer un document</span>
            <kbd className="shrink-0 whitespace-nowrap rounded border bg-muted px-2 py-0.5 font-sans text-xs font-medium">
              / · N
            </kbd>
          </li>
        </ul>
        <div className="flex items-start gap-3 rounded-md border p-3">
          <Checkbox
            id="raccourcis-une-touche"
            checked={singleKeyEnabled}
            onChange={(e) => setSingleKeyEnabled(e.target.checked)}
            className="mt-0.5"
          />
          <label htmlFor="raccourcis-une-touche" className="text-sm">
            <span className="font-medium">Activer les raccourcis à une touche</span>
            <span className="block text-muted-foreground">
              « G puis F », « / », « N »… Désactivez-les si vous utilisez la dictée vocale ou si des
              touches se déclenchent par erreur.
            </span>
          </label>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AppWithShortcuts() {
  useSseNotifications();
  const { shortcuts, helpOpen, setHelpOpen } = useERPShortcuts();
  const salesFormShortcuts = useSalesFormShortcutHelp();

  return (
    <Suspense fallback={<LoadingScreen />}>
      <ShortcutsHelpDialog
        open={helpOpen}
        onOpenChange={setHelpOpen}
        shortcuts={shortcuts}
        extra={salesFormShortcuts}
      />

      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/change-password"
          element={
            <ProtectedRoute>
              <ChangePassword />
            </ProtectedRoute>
          }
        />

        {APP_ROUTES.map((route) => (
          <Route key={route.path} path={route.path} element={protectedPage(route, PAGES[route.path])} />
        ))}

        {/* « Saisie comptable » a fusionné avec le grand livre le 2026-09-07 :
            même table, mêmes onglets Balance et Plan comptable en double. La
            redirection garde vivants les favoris et les anciens liens. */}
        <Route path="/comptabilite" element={<Navigate to="/general-ledger" replace />} />

        <Route
          path="*"
          element={
            <ProtectedRoute>
              <Layout>
                <NotFoundPage />
              </Layout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </Suspense>
  );
}

/** Classes des toasts par type : nos rampes sémantiques, lisibles dans les deux thèmes. */
const TOAST_TONE = {
  success: '[--normal-bg:hsl(var(--success-50))] [--normal-border:hsl(var(--success-200))] [--normal-text:hsl(var(--success-800))]',
  error: '[--normal-bg:hsl(var(--danger-50))] [--normal-border:hsl(var(--danger-200))] [--normal-text:hsl(var(--danger-800))]',
  warning: '[--normal-bg:hsl(var(--warning-50))] [--normal-border:hsl(var(--warning-200))] [--normal-text:hsl(var(--warning-800))]',
  info: '[--normal-bg:hsl(var(--info-50))] [--normal-border:hsl(var(--info-200))] [--normal-text:hsl(var(--info-800))]',
} as const;

/**
 * Notifications éphémères : en bas à droite (en haut, elles masquaient la
 * cloche et le menu utilisateur), au thème de l'application, couleurs tirées
 * de nos tokens (la palette « richColors » de sonner tombait à 4,34:1), bouton
 * de fermeture en français, 6 s pour lire une erreur.
 */
function AppToaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      position="bottom-right"
      theme={resolvedTheme}
      closeButton
      containerAriaLabel="Notifications"
      toastOptions={{
        duration: 6000,
        closeButtonAriaLabel: 'Fermer la notification',
        classNames: {
          toast: 'font-sans shadow-lg',
          description: 'text-pretty',
          actionButton: 'font-medium',
          ...TOAST_TONE,
        },
      }}
    />
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ModulesProvider>
          <ConfirmProvider>
            <AppToaster />
            <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <AppWithShortcuts />
            </BrowserRouter>
          </ConfirmProvider>
        </ModulesProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
