import { Suspense, lazy, type ComponentProps, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './lib/AuthContext';
import { ModulesProvider } from './lib/ModulesContext';
import ModuleGuard from './components/ModuleGuard';
import { Toaster } from 'sonner';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ConfirmProvider } from './components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './components/ui/dialog';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import { useERPShortcuts } from './hooks/useKeyboardShortcuts';
import { useSseNotifications } from './hooks/useSseNotifications';
import { Command } from 'lucide-react';
import { LoadingScreen } from './components/ui/loading';

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
// ERP Modules
const StockLocations = lazy(() => import('./pages/StockLocations'));
const StockTransfers = lazy(() => import('./pages/StockTransfers'));
const AffectationsLocations = lazy(() => import('./pages/AffectationsLocations'));
// New Role-Based Access Demandes
const DemandesList = lazy(() => import('./pages/DemandesList'));
const DemandeDetail = lazy(() => import('./pages/DemandeDetail'));
const DemandeForm = lazy(() => import('./pages/DemandeForm'));
const FacturesFournisseur = lazy(() => import('./pages/FacturesFournisseur'));
const GeneralLedger = lazy(() => import('./pages/GeneralLedger'));
const Employes = lazy(() => import('./pages/Employes'));
const Payroll = lazy(() => import('./pages/Payroll'));
const UserManagement = lazy(() => import('./pages/UserManagement'));
// Phase 5 - New modules
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
const Comptabilite = lazy(() => import('./pages/Comptabilite'));
const Tresorerie = lazy(() => import('./pages/Tresorerie'));

type RequiredRoles = NonNullable<ComponentProps<typeof ProtectedRoute>['requiredRoles']>;

const ACCESS = {
  managers: ['admin', 'manager'],
  purchasing: ['admin', 'manager', 'depot_staff'],
  sales: ['admin', 'manager', 'magasin_staff', 'caissier'],
  salesDocuments: ['admin', 'manager', 'magasin_staff'],
  allStaff: ['admin', 'manager', 'depot_staff', 'magasin_staff', 'caissier'],
  cash: ['admin', 'manager', 'caissier', 'magasin_staff'],
  admin: ['admin'],
} satisfies Record<string, RequiredRoles>;

function protectedPage(
  page: ReactNode,
  requiredRoles?: RequiredRoles,
  withErrorBoundary = false,
) {
  // ModuleGuard à l'intérieur du Layout : un module désactivé affiche une page
  // d'explication dans le cadre habituel, au lieu d'un écran nu.
  const layout = <Layout><ModuleGuard>{page}</ModuleGuard></Layout>;
  return (
    <ProtectedRoute requiredRoles={requiredRoles}>
      {withErrorBoundary ? <ErrorBoundary>{layout}</ErrorBoundary> : layout}
    </ProtectedRoute>
  );
}

function AppWithShortcuts() {
  useSseNotifications();
  const { shortcuts, helpOpen, setHelpOpen } = useERPShortcuts();

  return (
    <Suspense fallback={<LoadingScreen />}>
      {/* Shortcuts help modal */}
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Raccourcis clavier</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {shortcuts.map((s, i) => (
              <div key={i} className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">{s.description}</span>
                <kbd className="inline-flex items-center gap-1 rounded border bg-muted px-2 py-0.5 font-mono text-xs">
                  {s.gKey ? <><Command className="h-3 w-3" aria-hidden="true" />G puis {s.key.toUpperCase()}</> : s.key}
                </kbd>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground text-center">Appuyez sur Échap pour fermer</p>
        </DialogContent>
      </Dialog>

      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/change-password" element={
          <ProtectedRoute>
            <ChangePassword />
          </ProtectedRoute>
        } />

        <Route path="/" element={protectedPage(<Dashboard />, undefined, true)} />
        {/* Compte utilisateur — accessible à tous les rôles connectés */}
        <Route path="/profil" element={protectedPage(<Profil />)} />
        <Route path="/inventaire" element={protectedPage(<Inventaire />)} />
        {/* Tiers — admin/manager only */}
        <Route path="/tiers" element={protectedPage(<TiersPage />, ACCESS.managers)} />
        <Route path="/tiers/:id" element={protectedPage(<TiersDetail />, ACCESS.managers)} />
        <Route path="/clients/analytics" element={protectedPage(<ClientAnalytics />, ACCESS.managers)} />

        {/* Achats — depot_staff, admin, manager */}
        <Route path="/commandes" element={protectedPage(<Commandes />, ACCESS.purchasing)} />
        <Route path="/reapprovisionnement" element={protectedPage(<Reapprovisionnement />, ACCESS.purchasing)} />
        <Route path="/commandes/:id" element={protectedPage(<CommandeDetail />, ACCESS.purchasing)} />
        <Route path="/receptions" element={protectedPage(<Receptions />, ACCESS.purchasing)} />
        <Route path="/factures-fournisseur" element={protectedPage(<FacturesFournisseur />, ACCESS.purchasing)} />

        {/* Ventes — magasin_staff, caissier, admin, manager */}
        <Route path="/factures" element={protectedPage(<Factures />, ACCESS.sales)} />
        <Route path="/factures/:id" element={protectedPage(<FactureDetail />, ACCESS.sales)} />
        <Route path="/factures/nouvelle" element={protectedPage(<NouvelleFacture />, ACCESS.sales)} />
        <Route path="/devis" element={protectedPage(<Devis />, ACCESS.salesDocuments)} />
        <Route path="/devis/nouveau" element={protectedPage(<NouveauDevis />, ACCESS.salesDocuments)} />
        <Route path="/devis/:id" element={protectedPage(<DevisDetail />, ACCESS.salesDocuments)} />
        <Route path="/devis/:id/edit" element={protectedPage(<NouveauDevis />, ACCESS.salesDocuments)} />
        <Route path="/bons-livraison" element={protectedPage(<BonsLivraison />, ACCESS.salesDocuments)} />
        <Route path="/bons-livraison/nouveau" element={protectedPage(<NouveauBonLivraison />, ACCESS.salesDocuments)} />
        <Route path="/bons-livraison/:id" element={protectedPage(<BonLivraisonDetail />, ACCESS.salesDocuments)} />
        <Route path="/avoirs" element={protectedPage(<Avoirs />, ACCESS.managers)} />
        <Route path="/avoirs/nouveau" element={protectedPage(<NouvelAvoir />, ACCESS.managers)} />
        <Route path="/avoirs/:id" element={protectedPage(<AvoirDetail />, ACCESS.managers)} />
        <Route path="/retours" element={protectedPage(<Retours />, ACCESS.managers)} />
        <Route path="/relances" element={protectedPage(<Relances />, ACCESS.managers)} />

        {/* Stock */}
        <Route path="/stock-valuation" element={protectedPage(<StockValuation />, ACCESS.managers)} />
        <Route path="/stock-locations" element={protectedPage(<StockLocations />, ACCESS.purchasing)} />
        <Route path="/stock-transfers" element={protectedPage(<StockTransfers />, ACCESS.purchasing)} />
        <Route path="/affectations-locations" element={protectedPage(<AffectationsLocations />, ACCESS.managers)} />
        <Route path="/demandes" element={protectedPage(<DemandesList />, ACCESS.allStaff)} />
        <Route path="/demandes/nouvelle" element={protectedPage(<DemandeForm />, ACCESS.allStaff)} />
        <Route path="/demandes/:id" element={protectedPage(<DemandeDetail />, ACCESS.allStaff)} />
        <Route path="/demandes/:id/edit" element={protectedPage(<DemandeForm />, ACCESS.allStaff)} />

        {/* Finance */}
        <Route path="/caisse" element={protectedPage(<Caisse />, ACCESS.cash)} />
        <Route path="/caisse/audit" element={protectedPage(<CaisseAudit />, ACCESS.managers)} />
        <Route path="/caisse/historique" element={protectedPage(<CaisseHistorique />, ACCESS.managers)} />
        <Route path="/depenses" element={protectedPage(<Depenses />, ACCESS.cash)} />
        <Route path="/general-ledger" element={protectedPage(<GeneralLedger />, ACCESS.managers)} />
        <Route path="/reporting" element={protectedPage(<Reporting />, ACCESS.managers)} />

        {/* Admin only */}
        <Route path="/employes" element={protectedPage(<Employes />, ACCESS.managers)} />
        <Route path="/paie" element={protectedPage(<Payroll />, ACCESS.managers)} />
        <Route path="/admin/users" element={protectedPage(<UserManagement />, ACCESS.admin)} />
        <Route path="/settings" element={protectedPage(<CompanySettings />, ACCESS.managers)} />
        <Route path="/admin/parametres-finance" element={protectedPage(<ParametresFinance />, ACCESS.admin)} />
        <Route path="/admin/audit" element={protectedPage(<AuditLog />, ACCESS.admin)} />
        <Route path="/comptabilite" element={protectedPage(<Comptabilite />, ACCESS.managers)} />
        <Route path="/tresorerie" element={protectedPage(<Tresorerie />, ACCESS.managers)} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ModulesProvider>
        <ConfirmProvider>
          <Toaster position="top-right" richColors closeButton />
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <AppWithShortcuts />
          </BrowserRouter>
        </ConfirmProvider>
      </ModulesProvider>
    </AuthProvider>
  );
}
