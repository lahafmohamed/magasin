/**
 * Libellé d'un mouvement de caisse lisible par la caissière (P-M4) : le
 * numéro du document et le nom du client, jamais un identifiant de base —
 * « Paiement FAC-2026-00113 — COULIBALY Jean-Pierre », « Acompte — Clinique
 * Les Palmiers ». `mouvements_caisse.libelle` est un VARCHAR(255).
 */
export function mouvementLibelle(base: string, tiersNom?: string | null): string {
  const nom = tiersNom?.trim();
  const libelle = nom ? `${base} — ${nom}` : base;
  return libelle.length > 255 ? `${libelle.slice(0, 254)}…` : libelle;
}

/**
 * Catégories de mouvement de caisse en mots (miroir de `CATEGORY_LABELS` de
 * `CaisseV2.tsx`) : jamais le code brut dans un libellé (CPG2-03).
 */
const CATEGORIE_LABELS: Record<string, string> = {
  paiement_client: 'paiement client',
  acompte_client: 'acompte client',
  apport: 'apport d’espèces',
  autre_entree: 'autre entrée',
  depense: 'dépense',
  paiement_fournisseur: 'paiement fournisseur',
  acompte_fournisseur: 'acompte fournisseur',
  retrait_banque: 'dépôt à la banque',
  remboursement_client: 'remboursement client',
  autre_sortie: 'autre sortie',
};

/** « Mouvement de caisse — apport d’espèces » ; catégorie inconnue → « Mouvement de caisse ». */
export function mouvementCaisseLibelleParDefaut(categorie?: string | null): string {
  const label = categorie ? CATEGORIE_LABELS[categorie] : undefined;
  return label ? `Mouvement de caisse — ${label}` : 'Mouvement de caisse';
}

/**
 * CPG2-02 — référence et notes d'un paiement pris sur un acompte, écrites
 * avant le 2026-10-24 avec des identifiants internes (« ACO-ALLOC-12 »,
 * « Affectation automatique acompte #12 sur facture #45 »), relues dans la
 * forme actuelle. Les nouvelles lignes sont déjà écrites ainsi.
 */
export function paiementAcompteLisible<T extends { reference?: string | null; notes?: string | null }>(p: T): T {
  const reference = p.reference?.replace(/^ACO-(?:ALLOC|APP)-(\d+)$/, 'Acompte n° $1') ?? p.reference;
  const notes =
    p.notes
      ?.replace(
        /^Affectation automatique acompte #(\d+) sur facture #\d+$/,
        'Acompte n° $1 déduit automatiquement (factures les plus anciennes d’abord)'
      )
      .replace(/^Application acompte #(\d+)$/, 'Acompte n° $1 appliqué') ?? p.notes;
  return reference === p.reference && notes === p.notes ? p : { ...p, reference, notes };
}

/**
 * SQL du nom affiché d'un contact (raison sociale, puis prénom s'il existe),
 * pour une table `tiers` aliasée `alias`.
 */
export function tiersNomSql(alias: string): string {
  return `NULLIF(TRIM(CONCAT_WS(' ', ${alias}.raison_sociale, NULLIF(${alias}.prenom, ''))), '')`;
}
