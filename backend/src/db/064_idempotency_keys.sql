-- Table centralisée d'idempotency pour toutes les routes POST critiques
CREATE TABLE IF NOT EXISTS idempotency_keys (
  id SERIAL PRIMARY KEY,
  key_hash VARCHAR(64) NOT NULL,
  route VARCHAR(100) NOT NULL,
  response_status INTEGER NOT NULL DEFAULT 200,
  response_body JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expired_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours'
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_idempotency_key_hash ON idempotency_keys(key_hash);

-- Nettoyage automatique des clés expirées
CREATE INDEX IF NOT EXISTS idx_idempotency_expired ON idempotency_keys(expired_at);
