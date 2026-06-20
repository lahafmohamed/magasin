-- Module CRM : interactions clients, tâches, rappels
CREATE TABLE IF NOT EXISTS crm_interactions (
  id SERIAL PRIMARY KEY,
  tiers_id INTEGER NOT NULL REFERENCES tiers(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL DEFAULT 'appel',
  sujet VARCHAR(200) NOT NULL,
  description TEXT,
  date_interaction TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  date_rappel TIMESTAMPTZ,
  rappel_fait BOOLEAN DEFAULT FALSE,
  statut VARCHAR(20) NOT NULL DEFAULT 'termine',
  priorite VARCHAR(20) DEFAULT 'normale',
  cree_par INTEGER REFERENCES utilisateurs(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_tiers_id ON crm_interactions(tiers_id);
CREATE INDEX IF NOT EXISTS idx_crm_date_rappel ON crm_interactions(date_rappel);
CREATE INDEX IF NOT EXISTS idx_crm_type ON crm_interactions(type);
CREATE INDEX IF NOT EXISTS idx_crm_statut ON crm_interactions(statut);

-- Table des tâches CRM
CREATE TABLE IF NOT EXISTS crm_taches (
  id SERIAL PRIMARY KEY,
  tiers_id INTEGER REFERENCES tiers(id) ON DELETE CASCADE,
  titre VARCHAR(200) NOT NULL,
  description TEXT,
  priorite VARCHAR(20) DEFAULT 'normale',
  statut VARCHAR(20) DEFAULT 'a_faire',
  date_echeance DATE,
  assigne_a INTEGER REFERENCES utilisateurs(id),
  cree_par INTEGER REFERENCES utilisateurs(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_taches_tiers ON crm_taches(tiers_id);
CREATE INDEX IF NOT EXISTS idx_crm_taches_assigne ON crm_taches(assigne_a);
CREATE INDEX IF NOT EXISTS idx_crm_taches_statut ON crm_taches(statut);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_crm_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_crm_interactions_updated ON crm_interactions;
CREATE TRIGGER trg_crm_interactions_updated
  BEFORE UPDATE ON crm_interactions
  FOR EACH ROW
  EXECUTE FUNCTION update_crm_timestamp();

DROP TRIGGER IF EXISTS trg_crm_taches_updated ON crm_taches;
CREATE TRIGGER trg_crm_taches_updated
  BEFORE UPDATE ON crm_taches
  FOR EACH ROW
  EXECUTE FUNCTION update_crm_timestamp();
