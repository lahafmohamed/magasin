-- ============================================================
-- 072_ecritures_triggers_069.sql
-- Rewrite the auto-posting trigger functions so they INSERT into
-- ecritures_comptables using the canonical 069 columns
-- (journal, numero_piece, date_ecriture, compte_numero, tiers_id,
--  libelle, debit, credit, reference_type, reference_id) instead of the
-- legacy compte_id / ligne_numero / description columns.
--
-- Account numbers are inserted as literals (no plan_comptable.id lookup):
--   411 Clients (AR)          701 Ventes de marchandises (revenue)
--   401 Fournisseurs (AP)     601 Achats de marchandises (expense)
--
-- Journal codes match ComptabiliteService.ts conventions:
--   'VE' = ventes (sales)      'AC' = achats (purchases)
--
-- VAT is removed system-wide (business is VAT-exempt): NO 445 / 446 /
-- 4456 / 4457 lines are posted. Each piece is a single balanced
-- debit/credit pair on NEW.total, so debit = credit without any tax leg.
--
-- Must run AFTER 071_ecritures_unify.sql (which relaxes the legacy
-- NOT NULL columns and drops the restrictive journal CHECK so 'VE'/'AC'
-- are accepted).
-- ============================================================

-- ---- Customer invoice -> Dr 411 Clients / Cr 701 Ventes ----
CREATE OR REPLACE FUNCTION create_ecritures_facture_client()
RETURNS TRIGGER AS $$
BEGIN
  -- Débit : créance client (411)
  INSERT INTO ecritures_comptables
    (journal, numero_piece, date_ecriture, compte_numero, tiers_id, libelle,
     debit, credit, reference_type, reference_id)
  VALUES
    ('VE', NEW.numero_facture, NEW.date_facture, '411', NEW.tiers_id,
     'Vente client - ' || NEW.numero_facture,
     NEW.total, 0, 'facture', NEW.id);

  -- Crédit : chiffre d'affaires (701). VAT-exempt => credit = full total.
  INSERT INTO ecritures_comptables
    (journal, numero_piece, date_ecriture, compte_numero, tiers_id, libelle,
     debit, credit, reference_type, reference_id)
  VALUES
    ('VE', NEW.numero_facture, NEW.date_facture, '701', NEW.tiers_id,
     'CA - ' || NEW.numero_facture,
     0, NEW.total, 'facture', NEW.id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_facture_client_ecriture ON factures;
CREATE TRIGGER trg_facture_client_ecriture
  AFTER INSERT ON factures
  FOR EACH ROW
  EXECUTE FUNCTION create_ecritures_facture_client();

-- ---- Supplier invoice -> Dr 601 Achats / Cr 401 Fournisseurs ----
CREATE OR REPLACE FUNCTION create_ecritures_facture_fournisseur()
RETURNS TRIGGER AS $$
BEGIN
  -- Débit : achat de marchandises (601). VAT-exempt => debit = full total.
  INSERT INTO ecritures_comptables
    (journal, numero_piece, date_ecriture, compte_numero, tiers_id, libelle,
     debit, credit, reference_type, reference_id)
  VALUES
    ('AC', NEW.numero_facture_interne, NEW.date_facture, '601', NEW.tiers_id,
     'Achat - ' || NEW.numero_facture_fournisseur,
     NEW.total, 0, 'facture_fournisseur', NEW.id);

  -- Crédit : dette fournisseur (401)
  INSERT INTO ecritures_comptables
    (journal, numero_piece, date_ecriture, compte_numero, tiers_id, libelle,
     debit, credit, reference_type, reference_id)
  VALUES
    ('AC', NEW.numero_facture_interne, NEW.date_facture, '401', NEW.tiers_id,
     'Dette fourn. - ' || NEW.numero_facture_fournisseur,
     0, NEW.total, 'facture_fournisseur', NEW.id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_facture_fournisseur_ecriture ON factures_fournisseur;
CREATE TRIGGER trg_facture_fournisseur_ecriture
  AFTER INSERT ON factures_fournisseur
  FOR EACH ROW
  EXECUTE FUNCTION create_ecritures_facture_fournisseur();
