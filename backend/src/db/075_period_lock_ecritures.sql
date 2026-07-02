-- ============================================================
-- 075_period_lock_ecritures.sql
-- Single chokepoint: block ANY insert into ecritures_comptables whose
-- date_ecriture falls in a closed ('fermee') accounting period.
--
-- This guarantees closed-period integrity across EVERY posting path, not
-- just the app-layer PeriodService.checkPeriodIsOpen() calls:
--   * the 072 auto-post triggers (facture / facture_fournisseur)
--   * BL -> facture conversion (convert_bl_to_facture)
--   * POS invoice creation
--   * caisse -> GL posting (CaisseMagasinService.postMouvementToGL)
--   * ComptabiliteService.enregistrerPiece
--   * GeneralLedgerService.createManualEntry
--
-- A period with no row in periodes_comptables is treated as OPEN (only an
-- explicit 'fermee' row blocks), so historical backfill / seeding is not
-- affected unless a period was deliberately closed.
-- ============================================================

CREATE OR REPLACE FUNCTION assert_ecriture_period_open()
RETURNS TRIGGER AS $$
DECLARE
  v_statut TEXT;
BEGIN
  SELECT statut INTO v_statut
  FROM periodes_comptables
  WHERE exercice = EXTRACT(YEAR FROM NEW.date_ecriture)::int
    AND periode  = EXTRACT(MONTH FROM NEW.date_ecriture)::int;

  IF v_statut = 'fermee' THEN
    RAISE EXCEPTION 'Periode comptable %/% est cloturee. Aucune ecriture autorisee.',
      LPAD(EXTRACT(MONTH FROM NEW.date_ecriture)::text, 2, '0'),
      EXTRACT(YEAR FROM NEW.date_ecriture)::int
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ecriture_period_lock ON ecritures_comptables;
CREATE TRIGGER trg_ecriture_period_lock
  BEFORE INSERT ON ecritures_comptables
  FOR EACH ROW
  EXECUTE FUNCTION assert_ecriture_period_open();
