-- ============================================================
-- 111_inventaire_physique.sql
--
-- Inventaire physique : une session de comptage par emplacement, puis un
-- ajustement du stock en une seule transaction à la validation.
--
-- Jusqu'ici, corriger le stock après un comptage voulait dire saisir un
-- « ajustement » produit par produit : pas de feuille de comptage, pas de
-- rapport d'écarts, rien qui dise qui a compté quoi.
--
-- `inventaires`        : la session (emplacement, périmètre, statut).
-- `inventaire_lignes`  : un produit par ligne.
--
-- Règle de l'écart — `quantite_theorique` est le stock du système **au moment
-- où la ligne est comptée** (elle vaut le stock à l'ouverture tant que la ligne
-- n'est pas comptée). L'écart `quantite_comptee - quantite_theorique` est
-- appliqué en delta au stock courant à la validation : une vente passée entre
-- le comptage et la validation n'est ni perdue ni comptée deux fois, et le
-- magasin n'a pas à fermer pendant l'inventaire.
--
-- `cmp` fige le coût unitaire de la ligne pour valoriser l'écart.
-- Un seul inventaire en cours par emplacement (index unique partiel).
--
-- Idempotente. `ci-baseline.sql` porte les mêmes objets (bloc en fin de fichier).
-- ============================================================

CREATE SEQUENCE IF NOT EXISTS inventaire_numero_seq
  START WITH 1
  INCREMENT BY 1
  NO MINVALUE
  NO MAXVALUE
  CACHE 1;

CREATE TABLE IF NOT EXISTS inventaires (
  id                SERIAL PRIMARY KEY,
  numero            VARCHAR(30) NOT NULL,
  location_id       INTEGER NOT NULL REFERENCES stock_locations(id) ON DELETE RESTRICT,
  statut            VARCHAR(20) NOT NULL DEFAULT 'en_cours',
  categorie         VARCHAR(100),
  comptage_aveugle  BOOLEAN NOT NULL DEFAULT TRUE,
  notes             TEXT,
  cree_par          INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
  valide_par        INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
  date_validation   TIMESTAMP WITHOUT TIME ZONE,
  created_at        TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT inventaires_numero_key UNIQUE (numero),
  CONSTRAINT inventaires_statut_check CHECK (statut IN ('en_cours', 'valide', 'annule'))
);

CREATE TABLE IF NOT EXISTS inventaire_lignes (
  id                  SERIAL PRIMARY KEY,
  inventaire_id       INTEGER NOT NULL REFERENCES inventaires(id) ON DELETE CASCADE,
  produit_id          INTEGER NOT NULL REFERENCES produits(id) ON DELETE RESTRICT,
  quantite_theorique  INTEGER NOT NULL DEFAULT 0,
  quantite_comptee    INTEGER,
  cmp                 NUMERIC(15,2) NOT NULL DEFAULT 0,
  compte_par          INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
  compte_le           TIMESTAMP WITHOUT TIME ZONE,
  ecart_applique      INTEGER,
  mouvement_id        INTEGER REFERENCES mouvements_stock(id) ON DELETE SET NULL,
  CONSTRAINT inventaire_lignes_inventaire_produit_key UNIQUE (inventaire_id, produit_id),
  CONSTRAINT inventaire_lignes_quantite_comptee_check CHECK (quantite_comptee IS NULL OR quantite_comptee >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_inventaires_en_cours_par_emplacement
  ON inventaires (location_id) WHERE statut = 'en_cours';

CREATE INDEX IF NOT EXISTS idx_inventaires_created_at ON inventaires (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventaire_lignes_produit ON inventaire_lignes (produit_id);

DROP TRIGGER IF EXISTS update_inventaires_updated_at ON inventaires;
CREATE TRIGGER update_inventaires_updated_at
  BEFORE UPDATE ON inventaires
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE inventaires IS
  'Sessions d''inventaire physique : un comptage par emplacement, ajusté en une transaction à la validation.';
COMMENT ON COLUMN inventaire_lignes.quantite_theorique IS
  'Stock du système au moment du comptage de la ligne (à l''ouverture tant qu''elle n''est pas comptée).';
COMMENT ON COLUMN inventaire_lignes.ecart_applique IS
  'Delta réellement passé en mouvement de stock à la validation (NULL : ligne non ajustée).';
