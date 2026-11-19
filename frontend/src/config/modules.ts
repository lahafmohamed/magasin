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
export type ModuleCategorie =
  | 'Ventes'
  | 'Caisse'
  | 'Stock'
  | 'Achats'
  | 'Contacts'
  | 'Équipe'
  | 'Gestion'
  | 'Administration';

export interface ModuleDefinition {
  key: string;
  label: string;
  description: string;
  /** Regroupement affiché dans les paramètres (reprend les rubriques du menu). */
  categorie: ModuleCategorie;
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
    description: 'Devis à transformer en bon de livraison ou en facture.',
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
    description: 'Crédits accordés à vos clients : retours, erreurs de facturation et remises.',
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
    label: 'Suggestions d’achat',
    description: 'Produits sous leur stock minimum, à commander aux fournisseurs.',
    categorie: 'Achats',
    paths: ['/reapprovisionnement'],
  },
  {
    key: 'receptions',
    label: 'Réceptions',
    description: 'Entrée en stock des marchandises reçues du fournisseur.',
    categorie: 'Stock',
    paths: ['/receptions'],
  },
  {
    key: 'factures-fournisseur',
    label: 'Factures fournisseur',
    description: 'Ce que vous devez à vos fournisseurs, et leur paiement.',
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
    categorie: 'Ventes',
    paths: ['/relances'],
  },
  {
    key: 'analyse-clients',
    label: 'Analyse clients',
    description: 'Classement des clients par chiffre d’affaires.',
    categorie: 'Contacts',
    paths: ['/clients/analytics'],
  },
  {
    key: 'employes',
    label: 'Employés',
    description: 'Fiches du personnel et commissions sur ventes.',
    categorie: 'Équipe',
    paths: ['/employes'],
  },
  {
    key: 'paie',
    label: 'Paie',
    description: 'Cycles de paie, bulletins, cotisations CNPS et ITS.',
    categorie: 'Équipe',
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
    key: 'etiquettes',
    label: 'Étiquettes',
    description: 'Codes-barres à coller sur les articles : planche A4 ou imprimante d’étiquettes.',
    categorie: 'Stock',
    paths: ['/etiquettes'],
  },
  {
    key: 'inventaire-physique',
    label: 'Inventaire physique',
    description: 'Compter le stock d’un emplacement, puis ajuster les écarts en une fois.',
    categorie: 'Stock',
    paths: ['/inventaire-physique'],
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
    description: 'Déplacer du stock d’un emplacement à un autre.',
    categorie: 'Stock',
    paths: ['/stock-transfers'],
  },
  {
    key: 'demandes-reappro',
    label: 'Demandes de réapprovisionnement',
    description: 'Un magasin demande du stock au dépôt, qui approuve et exécute.',
    categorie: 'Stock',
    paths: ['/demandes'],
  },
  {
    key: 'affectations',
    label: 'Affectations',
    description: 'Attribuer des emplacements aux utilisateurs.',
    categorie: 'Administration',
    paths: ['/affectations-locations'],
  },
  {
    key: 'valorisation',
    label: 'Valorisation du stock',
    description: 'Ce que vaut le stock au prix d’achat et à la revente.',
    categorie: 'Gestion',
    paths: ['/stock-valuation'],
  },

  // ---- Finance ----
  {
    key: 'caisse',
    label: 'Caisse',
    description: 'Ouverture, mouvements et clôture de la caisse du magasin.',
    categorie: 'Caisse',
    paths: ['/caisse', '/caisse/historique'],
  },
  {
    key: 'vente-comptoir',
    label: 'Vente comptoir',
    description: 'Écran de caisse rapide : scan, encaissement, monnaie rendue et ticket 80 mm.',
    categorie: 'Caisse',
    paths: ['/vente-comptoir'],
  },
  {
    key: 'depenses',
    label: 'Dépenses',
    description: 'Sorties d’argent hors achats fournisseurs.',
    categorie: 'Caisse',
    paths: ['/depenses'],
  },
  {
    key: 'tresorerie',
    label: 'Trésorerie',
    description: 'Encaissements et décaissements prévus sur les semaines à venir.',
    categorie: 'Gestion',
    paths: ['/tresorerie'],
  },
  {
    key: 'audit-caisse',
    label: 'Audit caisse',
    description: 'Rapprochement des encaissements en espèces avec les sessions de caisse.',
    categorie: 'Caisse',
    paths: ['/caisse/audit'],
  },
  {
    key: 'comptabilite',
    label: 'Comptabilité',
    description: 'Écritures, grand-livre, balance, plan comptable et saisie manuelle (OHADA).',
    categorie: 'Gestion',
    paths: ['/general-ledger', '/comptabilite'],
  },
  {
    key: 'rapports',
    label: 'Rapports',
    description: 'Chiffre d’affaires, marges, créances clients.',
    categorie: 'Gestion',
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
    label: 'Journal d’audit',
    description: 'Historique des modifications faites dans le programme.',
    categorie: 'Administration',
    paths: ['/admin/audit'],
  },
  {
    key: 'parametres-finance',
    label: 'Paramètres paie et achats',
    description: 'Taux CNPS/ITS et tolérances de rapprochement fournisseur.',
    categorie: 'Administration',
    paths: ['/admin/parametres-finance'],
  },
];

export const CATEGORIES_MODULES: readonly ModuleCategorie[] = [
  'Ventes',
  'Caisse',
  'Stock',
  'Achats',
  'Contacts',
  'Équipe',
  'Gestion',
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
