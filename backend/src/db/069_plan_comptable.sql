-- Plan comptable OHADA (SYSCOHADA) — comptes de base
CREATE TABLE IF NOT EXISTS plan_comptable (
  id SERIAL PRIMARY KEY,
  numero VARCHAR(8) NOT NULL UNIQUE,
  intitule VARCHAR(150) NOT NULL,
  classe INTEGER NOT NULL CHECK (classe BETWEEN 1 AND 9),
  type_compte VARCHAR(30) NOT NULL DEFAULT 'actif',
  niveau INTEGER DEFAULT 1,
  compte_parent VARCHAR(8),
  actif BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pc_classe ON plan_comptable(classe);
CREATE INDEX IF NOT EXISTS idx_pc_parent ON plan_comptable(compte_parent);

-- Table des écritures comptables (double partie)
CREATE TABLE IF NOT EXISTS ecritures_comptables (
  id SERIAL PRIMARY KEY,
  journal VARCHAR(10) NOT NULL DEFAULT 'VT',
  numero_piece VARCHAR(50) NOT NULL,
  date_ecriture DATE NOT NULL DEFAULT CURRENT_DATE,
  compte_numero VARCHAR(8) NOT NULL REFERENCES plan_comptable(numero),
  tiers_id INTEGER REFERENCES tiers(id),
  libelle TEXT NOT NULL,
  debit NUMERIC(15,2) DEFAULT 0,
  credit NUMERIC(15,2) DEFAULT 0,
  reference_type VARCHAR(50),
  reference_id INTEGER,
  a_lettrer BOOLEAN DEFAULT FALSE,
  lettrage VARCHAR(50),
  date_saisie TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cree_par INTEGER REFERENCES utilisateurs(id)
);

CREATE INDEX IF NOT EXISTS idx_ecritures_date ON ecritures_comptables(date_ecriture);
CREATE INDEX IF NOT EXISTS idx_ecritures_compte ON ecritures_comptables(compte_numero);
CREATE INDEX IF NOT EXISTS idx_ecritures_piece ON ecritures_comptables(numero_piece);
CREATE INDEX IF NOT EXISTS idx_ecritures_reference ON ecritures_comptables(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_ecritures_journal ON ecritures_comptables(journal);

-- Séquence pour les numéros de pièce
CREATE SEQUENCE IF NOT EXISTS piece_comptable_seq START 1;

-- Insertion du plan comptable OHADA (comptes de base)
INSERT INTO plan_comptable (numero, intitule, classe, type_compte, niveau) VALUES
-- CLASSE 1 — Comptes de ressources durables
('101', 'Capital social', 1, 'passif', 2),
('106', 'Réserves', 1, 'passif', 2),
('12', 'Résultat net', 1, 'passif', 2),
('15', 'Provisions pour risques', 1, 'passif', 2),
('16', 'Emprunts', 1, 'passif', 2),
('168', 'Concours bancaires', 1, 'passif', 2),

-- CLASSE 2 — Comptes d'actif immobilisé
('21', 'Immobilisations incorporelles', 2, 'actif', 2),
('22', 'Terrains', 2, 'actif', 2),
('23', 'Bâtiments', 2, 'actif', 2),
('24', 'Matériel et outillage', 2, 'actif', 2),
('25', 'Matériel de transport', 2, 'actif', 2),
('26', 'Mobilier et matériel bureau', 2, 'actif', 2),
('28', 'Amortissements', 2, 'actif', 2),

-- CLASSE 3 — Comptes de stocks
('31', 'Marchandises', 3, 'actif', 2),
('32', 'Matières premières', 3, 'actif', 2),
('33', 'Produits finis', 3, 'actif', 2),

-- CLASSE 4 — Comptes de tiers
('401', 'Fournisseurs', 4, 'passif', 2),
('404', 'Fournisseurs d''immobilisations', 4, 'passif', 2),
('409', 'Acomptes fournisseurs', 4, 'passif', 2),
('411', 'Clients', 4, 'actif', 2),
('419', 'Acomptes clients', 4, 'passif', 2),
('421', 'Personnel', 4, 'passif', 2),
('431', 'Sécurité sociale', 4, 'passif', 2),
('441', 'État (TVA)', 4, 'passif', 2),
('444', 'État (Impôts)', 4, 'passif', 2),
('445', 'TVA déductible', 4, 'actif', 2),
('446', 'TVA collectée', 4, 'passif', 2),

-- CLASSE 5 — Comptes de trésorerie
('51', 'Banques', 5, 'actif', 2),
('53', 'Caisse', 5, 'actif', 2),
('54', 'Mobile Money', 5, 'actif', 2),
('58', 'Virements internes', 5, 'passif', 2),

-- CLASSE 6 — Comptes de charges
('601', 'Achats de marchandises', 6, 'charge', 2),
('602', 'Achats de matières premières', 6, 'charge', 2),
('603', 'Variation des stocks', 6, 'charge', 2),
('604', 'Achats non stockés', 6, 'charge', 2),
('61', 'Transports', 6, 'charge', 2),
('62', 'Services extérieurs', 6, 'charge', 2),
('63', 'Impôts et taxes', 6, 'charge', 2),
('64', 'Charges de personnel', 6, 'charge', 2),
('65', 'Frais de gestion', 6, 'charge', 2),
('66', 'Charges financières', 6, 'charge', 2),
('681', 'Dotations amortissements', 6, 'charge', 2),

-- CLASSE 7 — Comptes de produits
('701', 'Ventes de marchandises', 7, 'produit', 2),
('702', 'Ventes de produits finis', 7, 'produit', 2),
('706', 'Prestations de services', 7, 'produit', 2),
('708', 'Rabais, remises, ristournes', 7, 'produit', 2),
('71', 'Production stockée', 7, 'produit', 2),
('75', 'Produits de gestion', 7, 'produit', 2),
('76', 'Produits financiers', 7, 'produit', 2),
('78', 'Reprises amortissements', 7, 'produit', 2),

-- CLASSE 8 — Comptes de résultat
('81', 'Résultat comptable', 8, 'passif', 2),
('88', 'Résultat en instance', 8, 'passif', 2),

-- CLASSE 9 — Comptes hors-bilan
('92', 'Engagements donnés', 9, 'hors_bilan', 2),
('93', 'Engagements reçus', 9, 'hors_bilan', 2)
ON CONFLICT (numero) DO NOTHING;
