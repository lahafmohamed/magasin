import type { LucideIcon } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { useModules } from '../lib/ModulesContext';
import {
  canAccessPath,
  findRoute,
  type AppRole,
  type AppRoutePath,
} from '../config/routeAccess';
import { libelleParametresFinance } from '../config/modules';

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
}

export type NavGroupId =
  | 'caisse'
  | 'ventes'
  | 'stock'
  | 'achats'
  | 'contacts'
  | 'equipe'
  | 'gestion'
  | 'administration';

export interface NavCategory {
  id: NavGroupId;
  label: string;
  icon: LucideIcon;
  items: NavItem[];
}

interface NavEntry {
  path: AppRoutePath;
  /** Libellé de menu quand il diffère du nom de la page (« Demandes »). */
  label?: string;
  /**
   * Libellé qui dépend des modules actifs — « Paramètres paie et achats »
   * devient « Paramètres achats » quand la paie est masquée. Prime sur `label`.
   */
  labelSelonModules?: (estModuleActif: (key: string) => boolean) => string;
  /**
   * Rôles qui peuvent ouvrir la page mais pour qui l'entrée de menu serait
   * hors sujet (le caissier crée une demande sans pouvoir l'envoyer). La
   * route reste ouverte.
   */
  hiddenFor?: readonly AppRole[];
}

function routeOf(path: AppRoutePath) {
  const route = findRoute(path);
  if (!route) throw new Error(`Route inconnue dans le menu : ${path}`);
  return route;
}

/** Entrée isolée au-dessus des rubriques. */
export const DASHBOARD_ITEM: NavItem = {
  path: '/',
  label: routeOf('/').label,
  icon: routeOf('/').icon,
};

/**
 * Rubriques du menu, par métier (et non par module technique). Les rôles ne
 * sont pas répétés ici : ils viennent de `config/routeAccess.ts`, donc une
 * entrée n'apparaît que pour qui peut l'ouvrir.
 */
const NAV_GROUPS: Record<NavGroupId, { label: string; entries: readonly NavEntry[] }> = {
  caisse: {
    label: 'Caisse',
    entries: [
      { path: '/vente-comptoir' },
      { path: '/caisse' },
      { path: '/depenses' },
      { path: '/caisse/historique' },
      { path: '/caisse/audit' },
    ],
  },
  ventes: {
    label: 'Ventes',
    entries: [
      { path: '/factures' },
      { path: '/devis' },
      { path: '/bons-livraison' },
      { path: '/retours' },
      { path: '/avoirs' },
      { path: '/relances' },
    ],
  },
  stock: {
    label: 'Stock',
    entries: [
      { path: '/inventaire' },
      { path: '/etiquettes' },
      { path: '/inventaire-physique' },
      { path: '/demandes', label: 'Demandes', hiddenFor: ['caissier'] },
      { path: '/receptions' },
      { path: '/stock-transfers', label: 'Transferts' },
      { path: '/stock-locations' },
    ],
  },
  achats: {
    label: 'Achats',
    entries: [
      { path: '/commandes' },
      { path: '/reapprovisionnement' },
      { path: '/factures-fournisseur' },
    ],
  },
  contacts: {
    label: 'Contacts',
    entries: [{ path: '/tiers' }, { path: '/clients/analytics' }],
  },
  equipe: {
    label: 'Équipe',
    entries: [{ path: '/employes' }, { path: '/paie' }],
  },
  gestion: {
    label: 'Gestion',
    entries: [
      { path: '/tresorerie' },
      { path: '/general-ledger' },
      { path: '/reporting' },
      { path: '/stock-valuation' },
    ],
  },
  administration: {
    label: 'Administration',
    entries: [
      { path: '/admin/users' },
      { path: '/affectations-locations' },
      { path: '/settings' },
      {
        path: '/admin/parametres-finance',
        labelSelonModules: (estModuleActif) => libelleParametresFinance(estModuleActif('paie')),
      },
      { path: '/admin/audit' },
    ],
  },
};

const MANAGEMENT_ORDER: readonly NavGroupId[] = [
  'ventes',
  'caisse',
  'stock',
  'achats',
  'contacts',
  'equipe',
  'gestion',
  'administration',
];

/**
 * Ordre des rubriques par rôle : le premier métier de la journée en tête.
 * La caissière commence par la caisse, le dépôt par le stock.
 */
export const GROUP_ORDER: Record<AppRole, readonly NavGroupId[]> = {
  caissier: ['caisse', 'ventes', 'stock'],
  magasin_staff: ['ventes', 'caisse', 'stock'],
  // E2 (2026-10-24) : les achats sont des montants, réservés aux responsables ;
  // le dépôt réceptionne depuis « Stock › Réceptions ».
  depot_staff: ['stock'],
  manager: MANAGEMENT_ORDER,
  admin: MANAGEMENT_ORDER,
  viewer: ['stock'],
};

/** Icône du premier élément d'une rubrique — sert d'icône à la rubrique. */
function groupIcon(entries: readonly NavEntry[]): LucideIcon {
  return routeOf(entries[0].path).icon;
}

/**
 * Menu d'un rôle, sans tenir compte des modules désactivés. Fonction pure,
 * testée : chaque entrée doit être ouvrable par le rôle.
 */
export function buildNavCategories(
  role: AppRole | null | undefined,
  isPathActive: (path: string) => boolean = () => true,
  isModuleActive: (key: string) => boolean = () => true
): NavCategory[] {
  if (!role) return [];
  const order = GROUP_ORDER[role] ?? [];
  return order
    .map((id) => {
      const group = NAV_GROUPS[id];
      const items: NavItem[] = group.entries
        .filter(
          (entry) =>
            canAccessPath(entry.path, role) &&
            !entry.hiddenFor?.includes(role) &&
            isPathActive(entry.path)
        )
        .map((entry) => {
          const route = routeOf(entry.path);
          const label = entry.labelSelonModules?.(isModuleActive) ?? entry.label ?? route.label;
          return { path: entry.path, label, icon: route.icon };
        });
      return { id, label: group.label, icon: groupIcon(group.entries), items };
    })
    .filter((cat) => cat.items.length > 0);
}

/**
 * Menu filtré par rôle et par modules actifs. Source unique partagée par la
 * barre latérale, le tiroir mobile, la recherche globale et les liens rapides.
 */
export function useNavCategories(): NavCategory[] {
  const { user } = useAuth();
  const { estCheminActif, estModuleActif } = useModules();
  return buildNavCategories(user?.role as AppRole | undefined, estCheminActif, estModuleActif);
}
