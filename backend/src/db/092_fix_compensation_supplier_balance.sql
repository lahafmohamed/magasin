-- A compensation must reduce both the client receivable and the supplier
-- payable. The original service created only the client-side acompte, leaving
-- calculer_solde_fournisseur() unchanged. Backfill the missing symmetric rows
-- and give historical client rows stable references where they can be matched.

UPDATE acomptes_clients ac
SET idempotency_key = COALESCE(ac.idempotency_key, 'compensation:' || c.id || ':client'),
    reference_number = COALESCE(ac.reference_number, ec.numero_piece)
FROM compensations c
JOIN ecritures_comptables ec ON ec.id = c.ecriture_id
WHERE c.statut = 'valide'
  AND ac.tiers_id = c.tiers_id
  AND ac.methode_paiement = 'compensation'
  AND ac.notes = 'Compensation ' || ec.numero_piece;

INSERT INTO acomptes_fournisseur (
  tiers_id,
  montant,
  montant_restant,
  methode_paiement,
  date_acompte,
  notes,
  cree_par,
  idempotency_key,
  reference_number
)
SELECT
  c.tiers_id,
  c.montant,
  c.montant,
  'compensation',
  c.date_compensation,
  'Compensation ' || COALESCE(ec.numero_piece, 'historique #' || c.id),
  c.cree_par,
  'compensation:' || c.id || ':fournisseur',
  ec.numero_piece
FROM compensations c
LEFT JOIN ecritures_comptables ec ON ec.id = c.ecriture_id
WHERE c.statut = 'valide'
  AND NOT EXISTS (
    SELECT 1
    FROM acomptes_fournisseur af
    WHERE af.idempotency_key = 'compensation:' || c.id || ':fournisseur'
  )
ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;
