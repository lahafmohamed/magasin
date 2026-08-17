/**
 * Catalogue des modules activables/désactivables de l'ERP.
 *
 * Chaque client n'utilise qu'une partie du programme : une boutique sans dépôt
 * n'a que faire des emplacements, des transferts ou des demandes de réappro ;
 * un commerce qui ne fait pas de crédit n'a pas besoin des relances. Masquer
 * ces modules allège le menu au lieu de laisser l'utilisateur naviguer entre
 * des écrans qu'il n'ouvrira jamais.
 *
 * Le stockage est une liste d'EXCLUSION (`company_settings.modules_desactives`,
 * migration 098) : tout module ajouté ici plus tard est donc actif par défaut
 * chez les clients existants.
 *
 * `paths` sert à deux choses : filtrer les entrées de menu et bloquer l'accès
 * direct par URL. Les chemins doivent correspondre à ceux déclarés dans
 * `navConfig.tsx` et `App.tsx`.
 */
export interface ModuleDefinition {
  key: string;
  label: string;
  description: string;
  /** Regroupement affiché dans les paramètres (reprend les sections du menu). */
  categorie: 'Ventes' | 'Achats' | 'Contacts' | 'Stock' | 'Finance' | 'Administration';
  /** Routes couvertes par ce module. La première sert de route « principale ». */
  paths: string[];
  /**
   * Module structurant : désactivable seulement si rien d'essentiel n'en dépend.
   * Les modules verrouillés ne peuvent pas être décochés (on se retrouverait
   * sans facturation, sans produits ou sans accès aux paramètres).
   */
  verrouille?: boolean;
}

export const MODULES: ModuleDefinition[] = [
  // ---- Ventes ----
  {
    key: 'factures',
    label: 'Factures',
    description: 'Facturation client. Cœur du programme, non désactivable.',
    categorie: 'Ventes',
    paths: ['/factures'],
    verrouille: true,
  },
  {
    key: 'devis',
    label: 'Devis',
    description: 'Proformas transformables en bon de livraison ou en facture.',
    categorie: 'Ventes',
    paths: ['/devis'],
  },
  {
    key: 'bons-livraison',
    label: 'Bons de livraison',
    description: 'Livrer avant de facturer. Inutile si vous facturez directement.',
    categorie: 'Ventes',
    paths: ['/bons-livraison'],
  },
  {
    key: 'retours',
    label: 'Retours clients',
    description: 'Marchandise rapportée par un client, remise en stock après approbation.',
    categorie: 'Ventes',
    paths: ['/retours'],
  },
  {
    key: 'avoirs',
    label: 'Avoirs',
    description: 'Notes de crédit : retours, erreurs de facturation, remises.',
    categorie: 'Ventes',
    paths: ['/avoirs'],
  },

  // ---- Achats ----
  {
    key: 'commandes',
    label: 'Commandes fournisseur',
    description: 'Bons de commande envoyés aux fournisseurs.',
    categorie: 'Achats',
    paths: ['/commandes'],
  },
  {
    key: 'reapprovisionnement',
    label: 'Réapprovisionnement',
    description: 'Suggestions d\'achat pour les produits sous leur seuil minimum.',
    categorie: 'Achats',
    paths: ['/reapprovisionnement'],
  },
  {
    key: 'receptions',
    label: 'Réceptions',
    description: 'Entrée en stock des marchandises reçues du fournisseur.',
    categorie: 'Achats',
    paths: ['/receptions'],
  },
  {
    key: 'factures-fournisseur',
    label: 'Factures fournisseurs',
    description: 'Ce que vous devez à vos fournisseurs, et leur règlement.',
    categorie: 'Achats',
    paths: ['/factures-fournisseur'],
  },

  // ---- Contacts ----
  {
    key: 'tiers',
    label: 'Contacts',
    description: 'Fiches clients et fournisseurs. Nécessaire à la facturation.',
    categorie: 'Contacts',
    paths: ['/tiers'],
    verrouille: true,
  },
  {
    key: 'relances',
    label: 'Relances clients',
    description: 'File de recouvrement des impayés, par ancienneté de créance.',
    categorie: 'Contacts',
    paths: ['/relances'],
  },
  {
    key: 'analyse-clients',
    label: 'Analyse clients',
    description: 'Classement des clients par chiffre d\'affaires.',
    categorie: 'Contacts',
    paths: ['/clients/analytics'],
  },
  {
    key: 'employes',
    label: 'Employés',
    description: 'Fiches du personnel et commissions sur ventes.',
    categorie: 'Contacts',
    paths: ['/employes'],
  },
  {
    key: 'paie',
    label: 'Paie',
    description: 'Cycles de paie, bulletins, cotisations CNPS et ITS.',
    categorie: 'Contacts',
    paths: ['/paie'],
  },

  // ---- Stock ----
  {
    key: 'inventaire',
    label: 'Inventaire',
    description: 'Catalogue produits et niveaux de stock. Non désactivable.',
    categorie: 'Stock',
    paths: ['/inventaire'],
    verrouille: true,
  },
  {
    key: 'emplacements',
    label: 'Emplacements',
    description: 'Gérer plusieurs magasins et dépôts. Inutile sur un point de vente unique.',
    categorie: 'Stock',
    paths: ['/stock-locations'],
  },
  {
    key: 'transferts',
    label: 'Transferts',
    description: 'Déplacer du stock d\'un emplacement à un autre.',
    categorie: 'Stock',
    paths: ['/stock-transfers'],
  },
  {
    key: 'demandes-reappro',
    label: 'Demandes de réappro',
    description: 'Un magasin demande du stock au dépôt, qui approuve et exécute.',
    categorie: 'Stock',
    paths: ['/demandes'],
  },
  {
    key: 'affectations',
    label: 'Affectations',
    description: 'Attribuer des emplacements aux utilisateurs.',
    categorie: 'Stock',
    paths: ['/affectations-locations'],
  },
  {
    key: 'valorisation',
    label: 'Valorisation du stock',
    description: 'Ce que vaut le stock au prix d\'achat et à la revente.',
    categorie: 'Stock',
    paths: ['/stock-valuation'],
  },

  // ---- Finance ----
  {
    key: 'caisse',
    label: 'Caisse',
    description: 'Ouverture, mouvements et clôture de la caisse du magasin.',
    categorie: 'Finance',
    paths: ['/caisse', '/caisse/historique'],
  },
  {
    key: 'depenses',
    label: 'Dépenses',
    description: 'Sorties d\'argent hors achats fournisseurs.',
    categorie: 'Finance',
    paths: ['/depenses'],
  },
  {
    key: 'tresorerie',
    label: 'Trésorerie',
    description: 'Encaissements et décaissements prévus sur les semaines à venir.',
    categorie: 'Finance',
    paths: ['/tresorerie'],
  },
  {
    key: 'audit-caisse',
    label: 'Audit caisse',
    description: 'Rapprochement des encaissements espèces avec les sessions de caisse.',
    categorie: 'Finance',
    paths: ['/caisse/audit'],
  },
  {
    key: 'comptabilite',
    label: 'Comptabilité',
    description: 'Grand livre, balance et plan comptable (OHADA).',
    categorie: 'Finance',
    paths: ['/general-ledger', '/comptabilite'],
  },
  {
    key: 'rapports',
    label: 'Rapports',
    description: 'Chiffre d\'affaires, marges, créances clients.',
    categorie: 'Finance',
    paths: ['/reporting'],
  },

  // ---- Administration ----
  {
    key: 'utilisateurs',
    label: 'Utilisateurs',
    description: 'Comptes et rôles. Non désactivable.',
    categorie: 'Administration',
    paths: ['/admin/users'],
    verrouille: true,
  },
  {
    key: 'journal-audit',
    label: "Journal d'audit",
    description: 'Historique des modifications faites dans le programme.',
    categorie: 'Administration',
    paths: ['/admin/audit'],
  },
  {
    key: 'parametres-finance',
    label: 'Paramètres paie & achats',
    description: 'Taux CNPS/ITS et tolérances de rapprochement fournisseur.',
    categorie: 'Administration',
    paths: ['/admin/parametres-finance'],
  },
];

export const CATEGORIES_MODULES = [
  'Ventes',
  'Achats',
  'Contacts',
  'Stock',
  'Finance',
  'Administration',
] as const;

/** Index chemin → clé de module, construit une fois. */
const PATH_INDEX: Record<string, string> = {};
for (const m of MODULES) {
  for (const p of m.paths) PATH_INDEX[p] = m.key;
}

/**
 * Module couvrant un chemin donné. Retient le préfixe le plus long pour que
 * `/caisse/audit` soit rattaché à « Audit caisse » et non à « Caisse ».
 */
export function moduleForPath(path: string): string | null {
  if (PATH_INDEX[path]) return PATH_INDEX[path];
  let meilleur: string | null = null;
  let longueur = 0;
  for (const [p, key] of Object.entries(PATH_INDEX)) {
    if (path.startsWith(p + '/') && p.length > longueur) {
      meilleur = key;
      longueur = p.length;
    }
  }
  return meilleur;
}

export const MODULES_VERROUILLES = MODULES.filter((m) => m.verrouille).map((m) => m.key);
