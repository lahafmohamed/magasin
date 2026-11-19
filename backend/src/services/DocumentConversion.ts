import { assertPositiveSalePrices, computeLineTotals } from './PricingService';
import { generateDocumentNumber } from './NumberingService';
import {
  calculateDueDate,
  formatDateForPg,
  fetchClientPaymentTerm,
  ensureRequiredAccountsForInvoice,
} from '../utils/dueDate';

/**
 * Conversion BL → facture dans la transaction de l'appelant.
 *
 * Chemin unique pour les deux conversions (devis→facture et BL→facture) :
 * on facture ce qui a été livré (livraison partielle possible), avec échéance
 * dérivée du délai de paiement du tiers, auteur, coût d'achat et description
 * reportés sur chaque ligne. Le total de la facture est la somme des lignes
 * converties — pas une copie du total du BL.
 *
 * Les fonctions SQL legacy (convert_bl_to_facture / convert_devis_to_facture)
 * ont été retirées par la migration 113 : schéma périmé (factures.client_id),
 * 'net_30' hardcodé, numérotation par MAX(numero) sujette aux races.
 *
 * L'appelant valide l'état du document en amont et gère le relevé client /
 * les allocations en aval (comme FactureService.create).
 */
export async function convertBlToFactureInTx(
  client: any,
  blId: number,
  userId: number
): Promise<{ facture_id: number; numero_facture: string }> {
  const { rows: blRows } = await client.query(
    `SELECT id, tiers_id, devis_id, sous_total, tva, total, notes, location_id, facture_id
     FROM bons_livraison
     WHERE id = $1
     FOR UPDATE`,
    [blId]
  );

  if (blRows.length === 0) {
    throw new Error('Bon de livraison non trouvé');
  }

  const bl = blRows[0];
  if (bl.facture_id) {
    const { rows: existingRows } = await client.query(
      'SELECT numero_facture FROM factures WHERE id = $1',
      [bl.facture_id]
    );
    return {
      facture_id: bl.facture_id,
      numero_facture: existingRows[0]?.numero_facture || '',
    };
  }

  const numeroFacture = await generateDocumentNumber('facture', client);
  const delaiPaiement = await fetchClientPaymentTerm(client, bl.tiers_id);
  const dateEcheance = formatDateForPg(calculateDueDate(delaiPaiement));
  await ensureRequiredAccountsForInvoice(client);

  const { rows: lignesRows } = await client.query(
    `SELECT dl.id, dl.produit_id, dl.description, dl.quantite, dl.quantite_livree,
            dl.prix_unitaire, dl.remise_pct, dl.remise_montant,
            COALESCE(NULLIF(dl.prix_achat_unitaire, 0), p.prix_achat, 0) AS prix_achat_unitaire
     FROM document_lignes dl
     LEFT JOIN produits p ON p.id = dl.produit_id
     WHERE dl.document_type = 'bl' AND dl.document_id = $1
     ORDER BY dl.id`,
    [blId]
  );
  assertPositiveSalePrices(lignesRows);

  const delivered = lignesRows.map((l: any) => ({
    ...l,
    quantite: Number(l.quantite_livree ?? l.quantite),
  }));
  const { totalLignes, sousTotal } = computeLineTotals(
    delivered.map((l: any) => ({
      quantite: l.quantite,
      prix_unitaire: Number(l.prix_unitaire),
      remise_pct: Number(l.remise_pct || 0),
      remise_montant: Number(l.remise_montant || 0),
    }))
  );

  const { rows: factureRows } = await client.query(
    `INSERT INTO factures (
      numero_facture,
      tiers_id,
      bl_id,
      devis_id,
      date_facture,
      sous_total,
      tva,
      total,
      montant_paye,
      remaining_due,
      statut,
      notes,
      location_id,
      date_echeance,
      delai_paiement,
      cree_par
    ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    RETURNING id`,
    [
      numeroFacture,
      bl.tiers_id,
      blId,
      bl.devis_id || null,
      sousTotal,
      bl.tva,
      sousTotal,
      0,
      sousTotal,
      'en_attente',
      bl.notes || null,
      bl.location_id || null,
      dateEcheance,
      delaiPaiement,
      userId || null,
    ]
  );

  const factureId = factureRows[0].id;

  for (const [index, ligne] of delivered.entries()) {
    await client.query(
      `INSERT INTO document_lignes (
        document_type,
        document_id,
        produit_id,
        description,
        quantite,
        prix_unitaire,
        total_ligne,
        parent_ligne_id,
        prix_achat_unitaire
      ) VALUES ('facture', $1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        factureId,
        ligne.produit_id,
        ligne.description || null,
        ligne.quantite,
        ligne.prix_unitaire,
        totalLignes[index],
        ligne.id,
        ligne.prix_achat_unitaire,
      ]
    );
  }

  await client.query(
    "UPDATE bons_livraison SET statut = 'facture', facture_id = $1 WHERE id = $2",
    [factureId, blId]
  );

  return { facture_id: factureId, numero_facture: numeroFacture };
}
