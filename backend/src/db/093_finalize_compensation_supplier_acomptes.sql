-- Supplier-side compensation rows are accounting netting instruments, not
-- refundable cash advances. Mark them consumed immediately while keeping the
-- original montant as the value used by calculer_solde_fournisseur().

UPDATE acomptes_fournisseur
SET statut = 'utilise',
    montant_restant = 0,
    date_utilisation = COALESCE(date_utilisation, date_acompte),
    updated_at = CURRENT_TIMESTAMP
WHERE methode_paiement = 'compensation'
  AND idempotency_key LIKE 'compensation:%:fournisseur'
  AND deleted_at IS NULL;
