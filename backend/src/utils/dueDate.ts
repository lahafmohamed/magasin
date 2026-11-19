/**
 * Échéance partagée par toutes les créations de facture (création directe,
 * conversion devis→facture, conversion BL→facture) : une seule règle, dérivée
 * du délai de paiement du tiers. Ces helpers étaient privés à FactureService ;
 * les conversions hardcodaient 'net_30' ou laissaient l'échéance vide.
 */

export function calculateDueDate(delaiPaiement?: string | null): Date {
  const now = new Date();
  const normalized = (delaiPaiement || 'immediat').toLowerCase();

  const daysByTerm: Record<string, number> = {
    immediat: 0,
    net_30: 30,
    net_60: 60,
    net_90: 90,
  };

  now.setDate(now.getDate() + (daysByTerm[normalized] ?? 0));
  return now;
}

export function formatDateForPg(date: Date): string {
  return date.toISOString().split('T')[0];
}

/** Délai de paiement du tiers, 'immediat' par défaut (règle FactureService.create). */
export async function fetchClientPaymentTerm(client: any, tiersId: number): Promise<string> {
  const { rows } = await client.query(
    `SELECT COALESCE(delai_paiement, 'immediat') AS delai FROM tiers WHERE id = $1`,
    [tiersId]
  );
  return rows[0]?.delai || 'immediat';
}

/**
 * Le trigger d'auto-posting (072) suppose ces comptes existants. Sur une base
 * neuve ils sont semés par ci-ref-data ; sur une base ancienne ce garde-fou
 * évite que le trigger n'échoue à l'INSERT de la facture.
 */
export async function ensureRequiredAccountsForInvoice(client: any): Promise<void> {
  await client.query(
    `INSERT INTO plan_comptable (numero, intitule, type_compte, categorie)
     VALUES
      ('411', 'Clients', 'actif', 'classe4'),
      ('701', 'Ventes de marchandises', 'produit', 'classe7'),
      ('4457', 'TVA collectée', 'passif', 'classe4')
     ON CONFLICT (numero) DO NOTHING`
  );
}
