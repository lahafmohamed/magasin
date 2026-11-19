import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeftRight,
  Barcode,
  Banknote,
  BookOpen,
  BookUser,
  Building2,
  ChartColumn,
  ClipboardCheck,
  ClipboardList,
  Coins,
  FileBarChart,
  FileCheck,
  FileMinus,
  FilePlus,
  FileText,
  History,
  IdCard,
  Landmark,
  LayoutDashboard,
  LineChart,
  MapPin,
  Package,
  PackageSearch,
  PhoneCall,
  ReceiptText,
  ScanBarcode,
  ScrollText,
  Settings2,
  ShieldCheck,
  ShoppingCart,
  Truck,
  Undo2,
  UserCog,
  UserRound,
  Users,
  Wallet,
} from 'lucide-react';

/**
 * Carte des accès par route — **source unique**.
 *
 * Qui peut ouvrir quelle page : le routeur (`App.tsx`), la garde d'accès, le
 * menu (`navConfig.tsx`), la recherche globale, les raccourcis clavier et les
 * liens rapides lisent tous cette table. Avant elle, chaque surface tenait sa
 * propre liste et elles divergeaient : le menu proposait au caissier des
 * écrans que la route lui refusait.
 *
 * Les rôles reprennent les `authorize([...])` des routeurs backend — c'est
 * l'API qui fait foi ; cette table ne fait qu'éviter de proposer un lien voué
 * au refus. Pas de dépendance à react-router ici : les tests de pages simulent
 * ce module-là et la correspondance de motifs reste triviale.
 */

export type AppRole = 'admin' | 'manager' | 'caissier' | 'depot_staff' | 'magasin_staff' | 'viewer';

export const ROLE_GROUPS = {
  managers: ['admin', 'manager'],
  /** Réceptions, transferts et emplacements : le travail du dépôt, en quantités. */
  stockOperations: ['admin', 'manager', 'depot_staff'],
  /**
   * Achats — commandes fournisseur, suggestions d'achat, factures
   * fournisseur : des montants par nature. Décision E2 (2026-10-24) : le
   * personnel dépôt ne voit que des quantités et ne crée plus de commande
   * (`POST /commandes` réservé au gérant et à l'administrateur) ; il
   * réceptionne depuis « Réceptions », qui liste les commandes à recevoir.
   */
  purchasing: ['admin', 'manager'],
  sales: ['admin', 'manager', 'magasin_staff', 'caissier'],
  salesDocuments: ['admin', 'manager', 'magasin_staff'],
  allStaff: ['admin', 'manager', 'depot_staff', 'magasin_staff', 'caissier'],
  cash: ['admin', 'manager', 'caissier', 'magasin_staff'],
  /**
   * Demandes de réapprovisionnement : ni le caissier (l'API lui refuse le
   * détail, l'envoi et la modification d'une demande), ni le lecteur.
   */
  demandes: ['admin', 'manager', 'depot_staff', 'magasin_staff'],
  /** Créer ou modifier une demande : le magasin et les responsables (`CAN_EDIT_OWN`). */
  demandeEdition: ['admin', 'manager', 'magasin_staff'],
  /**
   * Étiquettes code-barres : elles portent le prix de vente, que le dépôt ne
   * voit pas ; le caissier vend, il n'étiquette pas.
   */
  etiquettes: ['admin', 'manager', 'magasin_staff'],
  /**
   * Inventaire physique : ceux qui comptent (dépôt et magasin) et les
   * responsables. Ouvrir, valider et annuler restent au gérant et à
   * l'administrateur — l'API le garantit, la page masque ces actions.
   */
  comptage: ['admin', 'manager', 'depot_staff', 'magasin_staff'],
  admin: ['admin'],
} as const satisfies Record<string, readonly AppRole[]>;

export interface AppRouteDef {
  /** Motif react-router (`/factures/:id`). */
  readonly path: string;
  /** Nom de la page : titre d'onglet par défaut, entrée « Aller à ». */
  readonly label: string;
  /** Icône du concept (la même partout : menu, en-tête, recherche). */
  readonly icon: LucideIcon;
  /** `null` : tout utilisateur connecté. */
  readonly roles: readonly AppRole[] | null;
}

const R = ROLE_GROUPS;

export const APP_ROUTES = [
  { path: '/', label: 'Tableau de bord', icon: LayoutDashboard, roles: null },
  { path: '/profil', label: 'Mon profil', icon: UserRound, roles: null },
  { path: '/inventaire', label: 'Inventaire', icon: Package, roles: null },

  // Ventes
  { path: '/factures', label: 'Factures', icon: FileText, roles: R.sales },
  { path: '/factures/nouvelle', label: 'Nouvelle facture', icon: FileText, roles: R.sales },
  { path: '/factures/:id', label: 'Facture', icon: FileText, roles: R.sales },
  { path: '/devis', label: 'Devis', icon: FilePlus, roles: R.salesDocuments },
  { path: '/devis/nouveau', label: 'Nouveau devis', icon: FilePlus, roles: R.salesDocuments },
  { path: '/devis/:id', label: 'Devis', icon: FilePlus, roles: R.salesDocuments },
  { path: '/devis/:id/edit', label: 'Modifier le devis', icon: FilePlus, roles: R.salesDocuments },
  { path: '/bons-livraison', label: 'Bons de livraison', icon: FileCheck, roles: R.salesDocuments },
  { path: '/bons-livraison/nouveau', label: 'Nouveau bon de livraison', icon: FileCheck, roles: R.salesDocuments },
  { path: '/bons-livraison/:id', label: 'Bon de livraison', icon: FileCheck, roles: R.salesDocuments },
  { path: '/retours', label: 'Retours clients', icon: Undo2, roles: R.managers },
  { path: '/avoirs', label: 'Avoirs', icon: FileMinus, roles: R.managers },
  { path: '/avoirs/nouveau', label: 'Nouvel avoir', icon: FileMinus, roles: R.managers },
  { path: '/avoirs/:id', label: 'Avoir', icon: FileMinus, roles: R.managers },
  { path: '/relances', label: 'Relances clients', icon: PhoneCall, roles: R.managers },

  // Caisse
  { path: '/vente-comptoir', label: 'Vente comptoir', icon: ScanBarcode, roles: R.sales },
  { path: '/caisse', label: 'Caisse', icon: Wallet, roles: R.cash },
  { path: '/depenses', label: 'Dépenses', icon: ReceiptText, roles: R.cash },
  { path: '/caisse/historique', label: 'Historique des caisses', icon: History, roles: R.managers },
  { path: '/caisse/audit', label: 'Audit caisse', icon: ShieldCheck, roles: R.managers },

  // Stock
  { path: '/demandes', label: 'Demandes de réapprovisionnement', icon: ClipboardList, roles: R.demandes },
  { path: '/demandes/nouvelle', label: 'Nouvelle demande', icon: ClipboardList, roles: R.demandeEdition },
  { path: '/demandes/:id', label: 'Demande', icon: ClipboardList, roles: R.demandes },
  { path: '/demandes/:id/edit', label: 'Modifier la demande', icon: ClipboardList, roles: R.demandeEdition },
  { path: '/receptions', label: 'Réceptions', icon: Truck, roles: R.stockOperations },
  { path: '/stock-transfers', label: 'Transferts de stock', icon: ArrowLeftRight, roles: R.stockOperations },
  { path: '/stock-locations', label: 'Emplacements', icon: MapPin, roles: R.stockOperations },
  { path: '/etiquettes', label: 'Étiquettes', icon: Barcode, roles: R.etiquettes },
  { path: '/inventaire-physique', label: 'Inventaire physique', icon: ClipboardCheck, roles: R.comptage },
  { path: '/inventaire-physique/:id', label: 'Inventaire physique', icon: ClipboardCheck, roles: R.comptage },
  { path: '/stock-valuation', label: 'Valorisation du stock', icon: Coins, roles: R.managers },

  // Achats
  { path: '/commandes', label: 'Commandes fournisseur', icon: ShoppingCart, roles: R.purchasing },
  { path: '/commandes/:id', label: 'Commande fournisseur', icon: ShoppingCart, roles: R.purchasing },
  { path: '/reapprovisionnement', label: 'Suggestions d’achat', icon: PackageSearch, roles: R.purchasing },
  { path: '/factures-fournisseur', label: 'Factures fournisseur', icon: FileBarChart, roles: R.purchasing },

  // Contacts et équipe
  { path: '/tiers', label: 'Contacts', icon: BookUser, roles: R.managers },
  { path: '/tiers/:id', label: 'Fiche contact', icon: BookUser, roles: R.managers },
  { path: '/clients/analytics', label: 'Analyse clients', icon: LineChart, roles: R.managers },
  { path: '/employes', label: 'Employés', icon: IdCard, roles: R.managers },
  { path: '/paie', label: 'Paie', icon: Banknote, roles: R.managers },

  // Gestion
  { path: '/tresorerie', label: 'Trésorerie', icon: Landmark, roles: R.managers },
  { path: '/general-ledger', label: 'Comptabilité', icon: BookOpen, roles: R.managers },
  { path: '/reporting', label: 'Rapports', icon: ChartColumn, roles: R.managers },

  // Administration
  { path: '/admin/users', label: 'Utilisateurs', icon: Users, roles: R.admin },
  { path: '/affectations-locations', label: 'Affectations', icon: UserCog, roles: R.managers },
  { path: '/settings', label: 'Paramètres de l’entreprise', icon: Building2, roles: R.managers },
  { path: '/admin/parametres-finance', label: 'Paramètres paie et achats', icon: Settings2, roles: R.admin },
  { path: '/admin/audit', label: 'Journal d’audit', icon: ScrollText, roles: R.admin },
] as const satisfies readonly AppRouteDef[];

export type AppRoutePath = (typeof APP_ROUTES)[number]['path'];

/** Retire la query-string, le fragment et la barre finale (`/factures/?q=x` → `/factures`). */
export function normalizePathname(path: string): string {
  const cut = path.search(/[?#]/);
  let p = cut >= 0 ? path.slice(0, cut) : path;
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p || '/';
}

/**
 * Score de correspondance d'un motif : un segment fixe vaut 2, un paramètre 1,
 * -1 si le chemin ne correspond pas. `/factures/nouvelle` l'emporte ainsi sur
 * `/factures/:id`, comme dans react-router.
 */
function matchScore(pattern: string, pathname: string): number {
  const a = pattern.split('/');
  const b = pathname.split('/');
  if (a.length !== b.length) return -1;
  let score = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(':')) {
      if (!b[i]) return -1;
      score += 1;
    } else if (a[i] === b[i]) {
      score += 2;
    } else {
      return -1;
    }
  }
  return score;
}

/** Route déclarée qui sert ce chemin concret (`/factures/110` → `/factures/:id`). */
export function findRoute(pathname: string): AppRouteDef | undefined {
  const p = normalizePathname(pathname);
  let best: AppRouteDef | undefined;
  let bestScore = -1;
  for (const route of APP_ROUTES) {
    const score = matchScore(route.path, p);
    if (score > bestScore) {
      best = route;
      bestScore = score;
    }
  }
  return best;
}

/** Rôles autorisés pour un chemin ; `null` = tout utilisateur connecté, `undefined` = chemin inconnu. */
export function rolesForPath(pathname: string): readonly AppRole[] | null | undefined {
  const route = findRoute(pathname);
  return route ? route.roles : undefined;
}

/**
 * Le rôle peut-il ouvrir ce chemin ? Un chemin absent de la table est refusé :
 * mieux vaut un lien manquant qu'un lien qui mène à un refus.
 */
export function canAccessPath(pathname: string, role: string | null | undefined): boolean {
  if (!role) return false;
  const route = findRoute(pathname);
  if (!route) return false;
  return route.roles === null || (route.roles as readonly string[]).includes(role);
}

/** Nom de la page servie par ce chemin (titre d'onglet par défaut). */
export function routeLabel(pathname: string): string | undefined {
  return findRoute(pathname)?.label;
}

/** Icône du concept servi par ce chemin — la même que dans le menu. */
export function iconForPath(pathname: string): LucideIcon | undefined {
  return findRoute(pathname)?.icon;
}
