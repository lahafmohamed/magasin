-- 070: Reconcile the audit_log schema fork (004 vs 063).
-- Canonical column is user_id (per 063). This migration makes the table converge
-- regardless of which earlier migration created it, preserves forensic columns
-- (ip_address, user_agent), and drops the over-restrictive action CHECK that was
-- silently rejecting most application actions (convert_to_facture, execute, send, ...).

-- 1. Ensure all canonical columns exist
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45);
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS old_values JSONB;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS new_values JSONB;

-- 2. If the legacy utilisateur_id column exists, copy its data into user_id then drop it
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'audit_log' AND column_name = 'utilisateur_id') THEN
    UPDATE audit_log SET user_id = utilisateur_id WHERE user_id IS NULL;
    ALTER TABLE audit_log DROP COLUMN utilisateur_id;
  END IF;
END $$;

-- 3. record_id may be absent for auth events (login/logout) — make it nullable
ALTER TABLE audit_log ALTER COLUMN record_id DROP NOT NULL;

-- 4. Drop the restrictive action CHECK constraint(s). The application emits many
--    action verbs; action stays a free-form VARCHAR.
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'audit_log' AND con.contype = 'c'
  LOOP
    EXECUTE format('ALTER TABLE audit_log DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE audit_log ALTER COLUMN action TYPE VARCHAR(50);

-- 5. Canonical indexes
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_table_name ON audit_log(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);
