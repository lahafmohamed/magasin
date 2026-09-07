-- 101_reconcile_baselined_columns.sql
--
-- Rattrape deux colonnes que la base de production n'a jamais reçues.
--
-- Le 2026-06-20 à 13h35, **70 migrations ont été enregistrées dans
-- `schema_migrations` en une seule minute** : la base avait été construite à
-- partir d'un instantané de schéma legacy, puis baselinée d'un bloc. Tout ce que
-- ces migrations apportaient au-delà de l'instantané n'a donc jamais été
-- appliqué, alors qu'elles sont marquées « ✓ ». C'est le même incident que celui
-- déjà rattrapé par `090` pour `070` — mais il ne se limitait pas à `070`.
--
-- Deux colonnes manquaient encore, chacune cassant une fonctionnalité entière :
--
--   * `sessions_caisse.date_cloture` (migration `045`, qui renommait
--     `date_fermeture`) — `CaisseMagasinService.cloturerSession` écrit dedans :
--     **toute clôture de caisse remontait en 500**.
--   * `factures_avoir.facture_appliquee_id` (migration `033`) —
--     `CreditNoteService.applyToFacture` écrit dedans : l'imputation d'un avoir
--     sur une facture échouait de la même façon.
--
-- Une comparaison colonne à colonne entre la production et le schéma canonique
-- (`ci-baseline.sql`) ne fait apparaître que ces deux manques. Le reste de
-- l'écart est en trop côté production (tables et colonnes legacy : `camions`,
-- `ravitaillements_carburant`, `lignes_facture`, `three_way_matches`…), sans
-- effet sur le code.
--
-- Idempotent : sur une base canonique, les deux blocs ne font rien.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. sessions_caisse.date_cloture  (rattrape le RENAME de 045)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'sessions_caisse'
       AND column_name = 'date_cloture'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'sessions_caisse'
         AND column_name = 'date_fermeture'
    ) THEN
      -- Cas production : la colonne existe sous son ancien nom, on la renomme
      -- pour conserver les dates de clôture déjà enregistrées.
      ALTER TABLE sessions_caisse RENAME COLUMN date_fermeture TO date_cloture;
    ELSE
      -- Ni l'un ni l'autre : on crée la colonne attendue.
      ALTER TABLE sessions_caisse ADD COLUMN date_cloture TIMESTAMP WITHOUT TIME ZONE;
    END IF;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'sessions_caisse'
       AND column_name = 'date_fermeture'
  ) THEN
    -- Les deux coexistent (rename partiellement rejoué) : on récupère les
    -- valeurs de l'ancienne colonne avant de la retirer, sans écraser les neuves.
    UPDATE sessions_caisse
       SET date_cloture = date_fermeture
     WHERE date_cloture IS NULL AND date_fermeture IS NOT NULL;
    ALTER TABLE sessions_caisse DROP COLUMN date_fermeture;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. factures_avoir.facture_appliquee_id  (rejoue 033)
-- ---------------------------------------------------------------------------
ALTER TABLE factures_avoir
  ADD COLUMN IF NOT EXISTS facture_appliquee_id INTEGER REFERENCES factures(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_factures_avoir_appliquee
  ON factures_avoir(facture_appliquee_id);

COMMIT;
