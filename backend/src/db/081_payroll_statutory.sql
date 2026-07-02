-- ============================================================
-- 081_payroll_statutory.sql
-- Statutory payroll deductions engine (Côte d'Ivoire): CNPS social
-- contributions + ITS progressive income tax.
--
-- Two config tables drive the computation so rates can be changed without a
-- code deploy:
--   payroll_cotisations   - flat-rate contributions (CNPS, ...), salarial +
--                           patronal rates, optional monthly ceiling (plafond).
--   payroll_bareme_its    - progressive ITS brackets (marginal rates).
--
-- payslips/payroll_runs gain columns to store the computed breakdown.
--
-- NOTE: seeded rates below are DEFAULTS and MUST be verified against current
-- law before production use. They are editable rows, not hardcoded constants.
-- ============================================================

CREATE TABLE IF NOT EXISTS payroll_cotisations (
  id             SERIAL PRIMARY KEY,
  code           VARCHAR(20) UNIQUE NOT NULL,
  libelle        VARCHAR(120) NOT NULL,
  taux_salarial  NUMERIC(6,4) NOT NULL DEFAULT 0,   -- fraction, e.g. 0.0630 = 6.30%
  taux_patronal  NUMERIC(6,4) NOT NULL DEFAULT 0,
  plafond        NUMERIC(15,2),                      -- monthly ceiling on base; NULL = uncapped
  actif          BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payroll_bareme_its (
  id          SERIAL PRIMARY KEY,
  ordre       INTEGER NOT NULL,
  tranche_min NUMERIC(15,2) NOT NULL DEFAULT 0,
  tranche_max NUMERIC(15,2),                         -- NULL = +infinity (top bracket)
  taux        NUMERIC(6,4) NOT NULL,                 -- marginal fraction
  actif       BOOLEAN NOT NULL DEFAULT true
);

ALTER TABLE payslips
  ADD COLUMN IF NOT EXISTS retenue_cnps           NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retenue_its            NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cotisations_patronales NUMERIC(15,2) NOT NULL DEFAULT 0;

ALTER TABLE payroll_runs
  ADD COLUMN IF NOT EXISTS total_cnps               NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_its                NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_charges_patronales NUMERIC(15,2) NOT NULL DEFAULT 0;

-- ---- Seed defaults (verify against current law; editable) -------------------

-- CNPS retraite: employee 6.30%, employer 7.70%, monthly ceiling 1 647 315 XOF.
INSERT INTO payroll_cotisations (code, libelle, taux_salarial, taux_patronal, plafond)
VALUES ('CNPS_RET', 'CNPS Retraite', 0.0630, 0.0770, 1647315.00)
ON CONFLICT (code) DO NOTHING;

-- ITS progressive brackets (illustrative defaults).
INSERT INTO payroll_bareme_its (ordre, tranche_min, tranche_max, taux)
SELECT * FROM (VALUES
  (1, 0::numeric,        75000::numeric,   0.00::numeric),
  (2, 75000::numeric,    240000::numeric,  0.16::numeric),
  (3, 240000::numeric,   800000::numeric,  0.21::numeric),
  (4, 800000::numeric,   2400000::numeric, 0.24::numeric),
  (5, 2400000::numeric,  NULL::numeric,    0.32::numeric)
) AS v(ordre, tranche_min, tranche_max, taux)
WHERE NOT EXISTS (SELECT 1 FROM payroll_bareme_its);
