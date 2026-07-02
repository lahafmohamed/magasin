-- ============================================================
-- 083_attachments.sql
-- Generic document attachments. Any record (invoice, supplier invoice, order,
-- tiers, employee, ...) can carry uploaded files (scanned supplier invoices,
-- delivery proofs, contracts). Bytes are stored in-row as BYTEA — consistent
-- with the existing base64-in-DB approach used for company logos — so no object
-- store / new dependency is required.
-- ============================================================

CREATE TABLE IF NOT EXISTS attachments (
  id           SERIAL PRIMARY KEY,
  entity_type  VARCHAR(50) NOT NULL,   -- 'facture' | 'facture_fournisseur' | 'commande' | 'tiers' | 'employe' | ...
  entity_id    INTEGER NOT NULL,
  filename     VARCHAR(255) NOT NULL,
  mime_type    VARCHAR(120) NOT NULL,
  taille       INTEGER NOT NULL,       -- bytes
  contenu      BYTEA NOT NULL,
  cree_par     INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_attachments_entity ON attachments(entity_type, entity_id);
