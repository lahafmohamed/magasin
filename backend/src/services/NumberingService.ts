import pool from '../db/connection';

export type DocumentType = 'facture' | 'devis' | 'bl' | 'avoir' | 'commande' | 'facture_fournisseur' | 'inventaire';

const sequenceNames: Record<DocumentType, string> = {
  facture: 'facture_numero_seq',
  devis: 'devis_seq',
  bl: 'bl_seq',
  avoir: 'avoir_seq',
  commande: 'commande_numero_seq',
  facture_fournisseur: 'facture_fournisseur_numero_seq',
  inventaire: 'inventaire_numero_seq',
};

const prefixes: Record<DocumentType, string> = {
  facture: 'FAC',
  devis: 'DEV',
  bl: 'BL',
  avoir: 'AVOIR',
  commande: 'CMD',
  facture_fournisseur: 'FF',
  inventaire: 'INV',
};

/**
 * Generate a document number using the PostgreSQL sequence.
 * Format: PREFIX-YYYY-#####
 */
export async function generateDocumentNumber(
  type: DocumentType,
  client?: any
): Promise<string> {
  const pgClient = client || pool;
  const seqName = sequenceNames[type];
  const prefix = prefixes[type];
  const year = new Date().getFullYear();

  const { rows } = await pgClient.query(`SELECT nextval('${seqName}') as num`);
  const seq = String(rows[0].num).padStart(5, '0');

  return `${prefix}-${year}-${seq}`;
}

/** Clé de contrôle EAN-13 des 12 premiers chiffres (poids 1 et 3 en alternance). */
export function ean13CheckDigit(first12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

/**
 * Prochain EAN-13 interne (migration 110) : « 20 » + séquence sur 10 chiffres
 * + clé. Plage GS1 réservée à la circulation interne : aucun fabricant ne
 * l'utilise. Unicité du numéro garantie par la séquence ; un code saisi à la
 * main dans la même plage reste possible, l'appelant vérifie donc qu'il est
 * libre.
 */
export async function nextInternalBarcode(client?: any): Promise<string> {
  const pgClient = client || pool;
  const { rows } = await pgClient.query(`SELECT nextval('code_barre_interne_seq') AS num`);
  const first12 = `20${String(rows[0].num).padStart(10, '0')}`;
  return `${first12}${ean13CheckDigit(first12)}`;
}
