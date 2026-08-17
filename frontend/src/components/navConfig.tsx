import {
  LayoutDashboard,
  Package,
  Users,
  FileText,
  TrendingUp,
  ShoppingCart,
  Truck,
  MapPin,
  ArrowLeftRight,
  FileBarChart,
  BookOpen,
  UserCheck,
  FilePlus,
  FileCheck,
  FileX,
  Wallet,
  Receipt,
  ClipboardList,
  PackageSearch,
  Settings2,
  ShieldCheck,
  Landmark,
  PenSquare,
  LineChart,
  History,
  Undo2,
  PhoneCall,
} from 'lucide-react';
import { useAuth } from '../lib/AuthContext';

export interface NavItem {
  path: string;
  label: string;
  icon: any;
}

export interface NavCategory {
  label: string;
  icon: any;
  items: NavItem[];
}

/** Standalone top entry, rendered above the grouped categories. */
export const DASHBOARD_ITEM: NavItem = {
  path: '/',
  label: 'Tableau de bord',
  icon: LayoutDashboard,
};

/**
 * Role-filtered navigation model. Single source of truth shared by the
 * desktop sidebar and the mobile drawer.
 */
export function useNavCategories(): NavCategory[] {
  const { hasRole } = useAuth();

  const isAdminOrManager = hasRole('admin', 'manager');
  const isDepotStaff = hasRole('depot_staff');
  const isMagasinStaff = hasRole('magasin_staff');
  const isCaissier = hasRole('caissier');

  return [
    // Ventes: magasin_staff, caissier, admin, manager
    ...((isAdminOrManager || isMagasinStaff || isCaissier) ? [{
      label: 'Ventes',
      icon: FileText,
      items: [
        { path: '/factures', label: 'Factures', icon: FileText },
        { path: '/devis', label: 'Devis', icon: FilePlus },
        { path: '/bons-livraison', label: 'Bons de Livraison', icon: FileCheck },
        ...((isAdminOrManager) ? [
          { path: '/retours', label: 'Retours clients', icon: Undo2 },
          { path: '/avoirs', label: 'Avoirs', icon: FileX },
        ] : []),
      ],
    }] : []),

    // Achats: depot_staff, admin, manager
    ...((isAdminOrManager || isDepotStaff) ? [{
      label: 'Achats',
      icon: ShoppingCart,
      items: [
        { path: '/commandes', label: 'Commandes', icon: ShoppingCart },
        { path: '/reapprovisionnement', label: 'Réapprovisionnement', icon: PackageSearch },
        { path: '/receptions', label: 'Réceptions', icon: Truck },
        { path: '/factures-fournisseur', label: 'Factures fournisseurs', icon: FileBarChart },
      ],
    }] : []),

    // Contacts (tiers): admin, manager only
    ...((isAdminOrManager) ? [{
      label: 'Contacts',
      icon: Users,
      items: [
        { path: '/tiers', label: 'Contacts', icon: UserCheck },
        { path: '/relances', label: 'Relances clients', icon: PhoneCall },
        { path: '/clients/analytics', label: 'Analyse clients', icon: LineChart },
        { path: '/employes', label: 'Employés', icon: UserCheck },
        { path: '/paie', label: 'Paie', icon: UserCheck },
      ],
    }] : []),

    // Stock
    {
      label: 'Stock',
      icon: Package,
      items: [
        { path: '/inventaire', label: 'Inventaire', icon: Package },
        ...((isAdminOrManager || isDepotStaff) ? [
          { path: '/stock-locations', label: 'Emplacements', icon: MapPin },
          { path: '/stock-transfers', label: 'Transferts', icon: ArrowLeftRight },
          { path: '/demandes', label: 'Demandes Réappro', icon: ClipboardList },
        ] : []),
        ...((isMagasinStaff || isCaissier) ? [
          { path: '/demandes', label: 'Demandes Réappro', icon: ClipboardList },
        ] : []),
        ...((isAdminOrManager) ? [
          { path: '/affectations-locations', label: 'Affectations', icon: UserCheck },
          { path: '/stock-valuation', label: 'Valorisation', icon: TrendingUp },
        ] : []),
      ],
    },

    // Finance
    {
      label: 'Finance',
      icon: Wallet,
      items: [
        ...((isAdminOrManager || isCaissier || isMagasinStaff) ? [{ path: '/caisse', label: 'Caisse', icon: Wallet }] : []),
        ...((isAdminOrManager || isCaissier || isMagasinStaff) ? [{ path: '/depenses', label: 'Dépenses', icon: Receipt }] : []),
        ...((isAdminOrManager) ? [
          { path: '/tresorerie', label: 'Trésorerie', icon: Landmark },
          { path: '/caisse/audit', label: 'Audit caisse', icon: ShieldCheck },
          { path: '/general-ledger', label: 'Comptabilité', icon: BookOpen },
          { path: '/comptabilite', label: 'Saisie comptable', icon: PenSquare },
          { path: '/reporting', label: 'Rapports', icon: TrendingUp },
        ] : []),
      ],
    },

    // Admin: admin only
    ...((hasRole('admin')) ? [{
      label: 'Admin',
      icon: ShieldCheck,
      items: [
        { path: '/admin/users', label: 'Utilisateurs', icon: Users },
        { path: '/admin/audit', label: "Journal d'audit", icon: History },
        { path: '/admin/parametres-finance', label: 'Paramètres paie & achats', icon: Settings2 },
      ],
    }] : []),
  ].filter(cat => cat.items.length > 0);
}
