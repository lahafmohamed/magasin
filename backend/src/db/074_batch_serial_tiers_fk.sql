-- Migration 074: Repoint batch/lot and serial-number FKs to unified tiers table
-- Migrations 015 (lots) and 016 (numeros_serie) were written before migration 043
-- replaced the legacy clients/fournisseurs tables with the unified `tiers` table.
-- Their FKs still target the dropped tables, leaving the columns orphaned.
-- This migration repoints them to `tiers(id)` WITHOUT dropping/recreating the tables.
-- All blocks are idempotent and guarded so the migration is safe to re-run.

-- ============================================================
-- 1. lots.fournisseur_id  ->  tiers(id)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lots' AND column_name = 'fournisseur_id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'tiers'
  ) THEN
    -- Drop the legacy FK (whatever its generated name was) if it still exists.
    ALTER TABLE lots DROP CONSTRAINT IF EXISTS lots_fournisseur_id_fkey;
    ALTER TABLE lots DROP CONSTRAINT IF EXISTS lots_tiers_id_fkey;
    -- Add the new FK to tiers, keeping the existing column name.
    ALTER TABLE lots ADD CONSTRAINT lots_tiers_id_fkey
      FOREIGN KEY (fournisseur_id) REFERENCES tiers(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_lots_fournisseur ON lots(fournisseur_id);

-- ============================================================
-- 2. numeros_serie.client_id  ->  tiers(id)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'numeros_serie' AND column_name = 'client_id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'tiers'
  ) THEN
    ALTER TABLE numeros_serie DROP CONSTRAINT IF EXISTS numeros_serie_client_id_fkey;
    ALTER TABLE numeros_serie DROP CONSTRAINT IF EXISTS numeros_serie_tiers_id_fkey;
    ALTER TABLE numeros_serie ADD CONSTRAINT numeros_serie_tiers_id_fkey
      FOREIGN KEY (client_id) REFERENCES tiers(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_numeros_serie_client ON numeros_serie(client_id);

-- ============================================================
-- 3. Recreate views dropped by migration 043 (CASCADE), now joining `tiers`
--    instead of the removed clients/fournisseurs tables.
-- ============================================================

-- Expiring lots (next 30 days). View name preserved from migration 015: lots_perimion.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'lots') THEN
    EXECUTE $v$
      CREATE OR REPLACE VIEW lots_perimion AS
      SELECT
        l.*,
        p.nom AS produit_nom,
        p.reference AS produit_reference,
        t.raison_sociale AS fournisseur_nom,
        (l.date_expiration - CURRENT_DATE) AS jours_restants
      FROM lots l
      LEFT JOIN produits p ON l.produit_id = p.id
      LEFT JOIN tiers t ON l.fournisseur_id = t.id
      WHERE l.date_expiration BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
        AND l.statut = 'actif'
        AND l.quantite_restante > 0
      ORDER BY l.date_expiration ASC
    $v$;
  END IF;
END $$;

-- Items under warranty. View name preserved from migration 016: articles_sous_garantie.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'numeros_serie') THEN
    EXECUTE $v$
      CREATE OR REPLACE VIEW articles_sous_garantie AS
      SELECT
        ns.*,
        p.nom AS produit_nom,
        p.reference AS produit_reference,
        t.raison_sociale AS client_nom,
        t.prenom AS client_prenom,
        t.telephone AS client_telephone,
        f.numero_facture,
        (ns.garantie_jusqu - CURRENT_DATE) AS jours_garantie_restants
      FROM numeros_serie ns
      LEFT JOIN produits p ON ns.produit_id = p.id
      LEFT JOIN tiers t ON ns.client_id = t.id
      LEFT JOIN factures f ON ns.facture_id = f.id
      WHERE ns.statut = 'vendu'
        AND ns.garantie_jusqu >= CURRENT_DATE
      ORDER BY ns.garantie_jusqu ASC
    $v$;
  END IF;
END $$;

SELECT '074_batch_serial_tiers_fk: migration completed' AS status;
