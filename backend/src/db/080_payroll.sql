-- ============================================================
-- 080_payroll.sql
-- Payroll module: pay runs (cycles de paie) and payslips (bulletins de paie),
-- built on top of the existing employes / commissions_ventes tables.
--
-- A run covers one period [date_debut, date_fin]; generating it snapshots one
-- payslip per active employee with salaire_base + commissions earned in the
-- period. Adjustments (primes / déductions) are editable while the run is in
-- 'brouillon'. Validation locks amounts; "marquer payé" records disbursement.
-- ============================================================

CREATE SEQUENCE IF NOT EXISTS payroll_run_numero_seq START 1;

CREATE TABLE IF NOT EXISTS payroll_runs (
  id                SERIAL PRIMARY KEY,
  numero            VARCHAR(50) UNIQUE NOT NULL,
  periode           VARCHAR(7) NOT NULL,           -- 'YYYY-MM'
  date_debut        DATE NOT NULL,
  date_fin          DATE NOT NULL,
  statut            VARCHAR(20) NOT NULL DEFAULT 'brouillon'
                      CHECK (statut IN ('brouillon', 'valide', 'paye', 'annule')),
  total_brut        NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_commissions NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_primes      NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_deductions  NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_net         NUMERIC(15,2) NOT NULL DEFAULT 0,
  notes             TEXT,
  cree_par          INTEGER REFERENCES utilisateurs(id),
  valide_par        INTEGER REFERENCES utilisateurs(id),
  date_validation   TIMESTAMP,
  date_paiement     TIMESTAMP,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payslips (
  id              SERIAL PRIMARY KEY,
  payroll_run_id  INTEGER NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  employe_id      INTEGER NOT NULL REFERENCES employes(id) ON DELETE RESTRICT,
  salaire_base    NUMERIC(15,2) NOT NULL DEFAULT 0,
  commissions     NUMERIC(15,2) NOT NULL DEFAULT 0,
  primes          NUMERIC(15,2) NOT NULL DEFAULT 0,
  deductions      NUMERIC(15,2) NOT NULL DEFAULT 0,
  salaire_brut    NUMERIC(15,2) NOT NULL DEFAULT 0,  -- base + commissions + primes
  salaire_net     NUMERIC(15,2) NOT NULL DEFAULT 0,  -- brut - deductions
  statut          VARCHAR(20) NOT NULL DEFAULT 'en_attente'
                    CHECK (statut IN ('en_attente', 'paye')),
  methode_paiement VARCHAR(30),
  date_paiement   TIMESTAMP,
  notes           TEXT,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (payroll_run_id, employe_id)
);

CREATE INDEX IF NOT EXISTS idx_payslips_run ON payslips(payroll_run_id);
CREATE INDEX IF NOT EXISTS idx_payslips_employe ON payslips(employe_id);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_periode ON payroll_runs(periode);
