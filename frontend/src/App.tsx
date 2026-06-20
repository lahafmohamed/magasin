import { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './lib/AuthContext';
import { Toaster } from 'sonner';
import { ErrorBoundary } from './components/ErrorBoundary';
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
const UserManagement = lazy(() => import('./pages/UserManagement'));
const PermissionsPage = lazy(() => import('./pages/PermissionsPage'));
// Phase 5 - New modules
const Devis = lazy(() => import('./pages/Devis'));
const NouveauDevis = lazy(() => import('./pages/NouveauDevis'));
const DevisDetail = lazy(() => import('./pages/DevisDetail'));
const BonsLivraison = lazy(() => import('./pages/BonsLivraison'));
const NouveauBonLivraison = lazy(() => import('./pages/NouveauBonLivraison'));
const BonLivraisonDetail = lazy(() => import('./pages/BonLivraisonDetail'));
const Avoirs = lazy(() => import('./pages/Avoirs'));
const NouvelAvoir = lazy(() => import('./pages/NouvelAvoir'));
const AvoirDetail = lazy(() => import('./pages/AvoirDetail'));
const Caisse = lazy(() => import('./pages/CaisseV2'));
const CaisseAudit = lazy(() => import('./pages/CaisseAudit'));
const Depenses = lazy(() => import('./pages/DepensesV2'));
const ChangePassword = lazy(() => import('./pages/ChangePassword'));
const TiersPage = lazy(() => import('./pages/Tiers'));
const TiersDetail = lazy(() => import('./pages/TiersDetail'));
const CompanySettings = lazy(() => import('./pages/CompanySettings'));
const AuditLog = lazy(() => import('./pages/AuditLog'));
const Comptabilite = lazy(() => import('./pages/Comptabilite'));
const Tresorerie = lazy(() => import('./pages/Tresorerie'));

function AppWithShortcuts() {
  useSseNotifications();
  const { shortcuts, helpOpen, setHelpOpen } = useERPShortcuts();

  useEffect(() => {
    if (helpOpen) {
      const handler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') setHelpOpen(false);
      };
      document.addEventListener('keydown', handler);
      return () => document.removeEventListener('keydown', handler);
    }
  }, [helpOpen, setHelpOpen]);

  return (
    <Suspense fallback={<LoadingScreen />}>
      {/* Shortcuts help modal */}
      {helpOpen && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4" onClick={() => setHelpOpen(false)}>
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4">Raccourcis clavier</h2>
            <div className="space-y-2">
              {shortcuts.map((s, i) => (
                <div key={i} className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">{s.description}</span>
                  <kbd className="inline-flex items-center gap-1 rounded border bg-muted px-2 py-0.5 font-mono text-xs">
                    {s.gKey ? <><Command className="h-3 w-3" />G puis {s.key.toUpperCase()}</> : s.key}
                  </kbd>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-4 text-center">Appuyez sur Échap pour fermer</p>
          </div>
        </div>
      )}

      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/change-password" element={
          <ProtectedRoute>
            <ChangePassword />
          </ProtectedRoute>
        } />

        <Route path="/" element={
          <ProtectedRoute>
            <ErrorBoundary>
              <Layout>
                <Dashboard />
              </Layout>
            </ErrorBoundary>
          </ProtectedRoute>
        } />
        <Route path="/inventaire" element={
          <ProtectedRoute>
            <Layout>
              <Inventaire />
            </Layout>
          </ProtectedRoute>
        } />
        {/* Tiers — admin/manager only */}
        <Route path="/tiers" element={
          <ProtectedRoute requiredRoles={['admin', 'manager']}>
            <Layout><TiersPage /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/tiers/:id" element={
          <ProtectedRoute requiredRoles={['admin', 'manager']}>
            <Layout><TiersDetail /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/clients/analytics" element={
          <ProtectedRoute requiredRoles={['admin', 'manager']}>
            <Layout><ClientAnalytics /></Layout>
          </ProtectedRoute>
        } />

        {/* Achats — depot_staff, admin, manager */}
        <Route path="/commandes" element={
          <ProtectedRoute requiredRoles={['admin', 'manager', 'depot_staff']}>
            <Layout><Commandes /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/commandes/:id" element={
          <ProtectedRoute requiredRoles={['admin', 'manager', 'depot_staff']}>
            <Layout><CommandeDetail /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/receptions" element={
          <ProtectedRoute requiredRoles={['admin', 'manager', 'depot_staff']}>
            <Layout><Receptions /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/factures-fournisseur" element={
          <ProtectedRoute requiredRoles={['admin', 'manager', 'depot_staff']}>
            <Layout><FacturesFournisseur /></Layout>
          </ProtectedRoute>
        } />

        {/* Ventes — magasin_staff, caissier, admin, manager */}
        <Route path="/factures" element={
          <ProtectedRoute requiredRoles={['admin', 'manager', 'magasin_staff', 'caissier']}>
            <Layout><Factures /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/factures/:id" element={
          <ProtectedRoute requiredRoles={['admin', 'manager', 'magasin_staff', 'caissier']}>
            <Layout><FactureDetail /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/factures/nouvelle" element={
          <ProtectedRoute requiredRoles={['admin', 'manager', 'magasin_staff', 'caissier']}>
            <Layout><NouvelleFacture /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/devis" element={
          <ProtectedRoute requiredRoles={['admin', 'manager', 'magasin_staff']}>
            <Layout><Devis /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/devis/nouveau" element={
          <ProtectedRoute requiredRoles={['admin', 'manager', 'magasin_staff']}>
            <Layout><NouveauDevis /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/devis/:id" element={
          <ProtectedRoute requiredRoles={['admin', 'manager', 'magasin_staff']}>
            <Layout><DevisDetail /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/devis/:id/edit" element={
          <ProtectedRoute requiredRoles={['admin', 'manager', 'magasin_staff']}>
            <Layout><NouveauDevis /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/bons-livraison" element={
          <ProtectedRoute requiredRoles={['admin', 'manager', 'magasin_staff']}>
            <Layout><BonsLivraison /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/bons-livraison/nouveau" element={
          <ProtectedRoute requiredRoles={['admin', 'manager', 'magasin_staff']}>
            <Layout><NouveauBonLivraison /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/bons-livraison/:id" element={
          <ProtectedRoute requiredRoles={['admin', 'manager', 'magasin_staff']}>
            <Layout><BonLivraisonDetail /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/avoirs" element={
          <ProtectedRoute requiredRoles={['admin', 'manager']}>
            <Layout><Avoirs /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/avoirs/nouveau" element={
          <ProtectedRoute requiredRoles={['admin', 'manager']}>
            <Layout><NouvelAvoir /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/avoirs/:id" element={
          <ProtectedRoute requiredRoles={['admin', 'manager']}>
            <Layout><AvoirDetail /></Layout>
          </ProtectedRoute>
        } />

        {/* Stock */}
        <Route path="/stock-valuation" element={
          <ProtectedRoute requiredRoles={['admin', 'manager']}>
            <Layout><StockValuation /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/stock-locations" element={
          <ProtectedRoute requiredRoles={['admin', 'manager', 'depot_staff']}>
            <Layout><StockLocations /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/stock-transfers" element={
          <ProtectedRoute requiredRoles={['admin', 'manager', 'depot_staff']}>
            <Layout><StockTransfers /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/affectations-locations" element={
          <ProtectedRoute requiredRoles={['admin', 'manager']}>
            <Layout><AffectationsLocations /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/demandes" element={
          <ProtectedRoute requiredRoles={['admin', 'manager', 'depot_staff', 'magasin_staff', 'caissier']}>
            <Layout><DemandesList /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/demandes/nouvelle" element={
          <ProtectedRoute requiredRoles={['admin', 'manager', 'depot_staff', 'magasin_staff', 'caissier']}>
            <Layout><DemandeForm /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/demandes/:id" element={
          <ProtectedRoute requiredRoles={['admin', 'manager', 'depot_staff', 'magasin_staff', 'caissier']}>
            <Layout><DemandeDetail /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/demandes/:id/edit" element={
          <ProtectedRoute requiredRoles={['admin', 'manager', 'depot_staff', 'magasin_staff', 'caissier']}>
            <Layout><DemandeForm /></Layout>
          </ProtectedRoute>
        } />

        {/* Finance */}
        <Route path="/caisse" element={
          <ProtectedRoute requiredRoles={['admin', 'manager', 'caissier', 'magasin_staff']}>
            <Layout><Caisse /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/caisse/audit" element={
          <ProtectedRoute requiredRoles={['admin', 'manager']}>
            <Layout><CaisseAudit /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/depenses" element={
          <ProtectedRoute requiredRoles={['admin', 'manager', 'caissier', 'magasin_staff']}>
            <Layout><Depenses /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/general-ledger" element={
          <ProtectedRoute requiredRoles={['admin', 'manager']}>
            <Layout><GeneralLedger /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/reporting" element={
          <ProtectedRoute requiredRoles={['admin', 'manager']}>
            <Layout><Reporting /></Layout>
          </ProtectedRoute>
        } />

        {/* Admin only */}
        <Route path="/employes" element={
          <ProtectedRoute requiredRoles={['admin', 'manager']}>
            <Layout><Employes /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/admin/users" element={
          <ProtectedRoute requiredRoles={['admin']}>
            <Layout><UserManagement /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/admin/permissions" element={
          <ProtectedRoute requiredRoles={['admin']}>
            <Layout><PermissionsPage /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/settings" element={
          <ProtectedRoute requiredRoles={['admin', 'manager']}>
            <Layout><CompanySettings /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/admin/audit" element={
          <ProtectedRoute requiredRoles={['admin']}>
            <Layout><AuditLog /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/comptabilite" element={
          <ProtectedRoute requiredRoles={['admin', 'manager']}>
            <Layout><Comptabilite /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/tresorerie" element={
          <ProtectedRoute requiredRoles={['admin', 'manager']}>
            <Layout><Tresorerie /></Layout>
          </ProtectedRoute>
        } />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Toaster position="top-right" richColors closeButton />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AppWithShortcuts />
      </BrowserRouter>
    </AuthProvider>
  );
}
