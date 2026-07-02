-- ============================================================
-- 082_three_way_match.sql
-- Three-way match (PO ↔ reception ↔ supplier invoice).
--
-- The 043 unification rebuilt factures_fournisseur WITHOUT the commande_id link
-- that the application code (CommandeController auto-draft invoice, getMatch,
-- FactureFournisseurService) still expects. This restores the column so a
-- supplier invoice can be reconciled against its purchase order and receptions,
-- and adds a tolerance config that gates invoice creation.
-- ============================================================

ALTER TABLE factures_fournisseur
  ADD COLUMN IF NOT EXISTS commande_id INTEGER REFERENCES commandes_fournisseur(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ff_commande ON factures_fournisseur(commande_id);

-- Backfill the link from the reception each invoice already points to.
UPDATE factures_fournisseur ff
   SET commande_id = r.commande_id
  FROM receptions r
 WHERE ff.reception_id = r.id
   AND ff.commande_id IS NULL;

-- Tolerance / enforcement config (single row).
CREATE TABLE IF NOT EXISTS three_way_match_config (
  id                 INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  qte_tolerance_pct  NUMERIC(6,4) NOT NULL DEFAULT 0.0000,  -- allowed over-invoicing vs received qty
  prix_tolerance_pct NUMERIC(6,4) NOT NULL DEFAULT 0.0500,  -- allowed unit-price deviation vs PO
  bloquer            BOOLEAN NOT NULL DEFAULT false,        -- true = block invoice on violation; false = warn only
  updated_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO three_way_match_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
