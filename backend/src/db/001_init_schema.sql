-- Initial schema for magasin informatique
-- Creates all base tables

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- CORE TABLES
-- ============================================

-- Locations/Depots
CREATE TABLE IF NOT EXISTS locations (
  id SERIAL PRIMARY KEY,
  code VARCHAR(20) UNIQUE NOT NULL,
  nom VARCHAR(100) NOT NULL,
  adresse TEXT,
  ville VARCHAR(50),
  telephone VARCHAR(20),
  actif BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Categories
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  nom VARCHAR(100) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Produits
CREATE TABLE IF NOT EXISTS produits (
  id SERIAL PRIMARY KEY,
  reference VARCHAR(50) UNIQUE NOT NULL,
  nom VARCHAR(200) NOT NULL,
  description TEXT,
  prix_achat NUMERIC(15,2) DEFAULT 0,
  prix_vente NUMERIC(15,2) DEFAULT 0,
  stock INTEGER DEFAULT 0,
  stock_minimum INTEGER DEFAULT 0,
  categorie_id INTEGER REFERENCES categories(id),
  location_id INTEGER REFERENCES locations(id),
  code_barre VARCHAR(50),
  taux_tva NUMERIC(5,2) DEFAULT 19.25,
  actif BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tiers (Clients & Fournisseurs unifiés)
CREATE TABLE IF NOT EXISTS tiers (
  id SERIAL PRIMARY KEY,
  type VARCHAR(20) NOT NULL CHECK (type IN ('client', 'fournisseur')),
  code VARCHAR(50) UNIQUE,
  nom VARCHAR(200) NOT NULL,
  email VARCHAR(100),
  telephone VARCHAR(20),
  adresse TEXT,
  ville VARCHAR(50),
  pays VARCHAR(50) DEFAULT 'CI',
  nif VARCHAR(50),
  code_gespont VARCHAR(10),
  solde NUMERIC(15,2) DEFAULT 0,
  credit_autorise NUMERIC(15,2) DEFAULT 0,
  delai_paiement_jours INTEGER DEFAULT 0,
  notes TEXT,
  actif BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Factures
CREATE TABLE IF NOT EXISTS factures (
  id SERIAL PRIMARY KEY,
  numero VARCHAR(50) UNIQUE NOT NULL,
  tiers_id INTEGER NOT NULL REFERENCES tiers(id),
  location_id INTEGER REFERENCES locations(id),
  date_facture DATE DEFAULT CURRENT_DATE,
  date_echeance DATE,
  statut VARCHAR(20) DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'payee', 'partielle', 'annulee', 'avoir')),
  type_facture VARCHAR(20) DEFAULT 'vente' CHECK (type_facture IN ('vente', 'avoir', 'proforma')),
  sous_total NUMERIC(15,2) DEFAULT 0,
  montant_tva NUMERIC(15,2) DEFAULT 0,
  total NUMERIC(15,2) DEFAULT 0,
  montant_paye NUMERIC(15,2) DEFAULT 0,
  remise_pourcentage NUMERIC(5,2) DEFAULT 0,
  remise_montant NUMERIC(15,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Lignes de facture
CREATE TABLE IF NOT EXISTS lignes_facture (
  id SERIAL PRIMARY KEY,
  facture_id INTEGER NOT NULL REFERENCES factures(id) ON DELETE CASCADE,
  produit_id INTEGER REFERENCES produits(id),
  quantite INTEGER NOT NULL DEFAULT 1,
  prix_unitaire NUMERIC(15,2) NOT NULL,
  taux_tva NUMERIC(5,2) DEFAULT 19.25,
  montant_tva NUMERIC(15,2) DEFAULT 0,
  total_ligne NUMERIC(15,2) DEFAULT 0,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Commandes (Bon de Commande)
CREATE TABLE IF NOT EXISTS commandes (
  id SERIAL PRIMARY KEY,
  numero VARCHAR(50) UNIQUE NOT NULL,
  fournisseur_id INTEGER NOT NULL REFERENCES tiers(id),
  location_id INTEGER REFERENCES locations(id),
  date_commande DATE DEFAULT CURRENT_DATE,
  date_livraison_prevue DATE,
  statut VARCHAR(20) DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'partielle', 'livree', 'annulee')),
  total NUMERIC(15,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Lignes de commande
CREATE TABLE IF NOT EXISTS lignes_commande (
  id SERIAL PRIMARY KEY,
  commande_id INTEGER NOT NULL REFERENCES commandes(id) ON DELETE CASCADE,
  produit_id INTEGER NOT NULL REFERENCES produits(id),
  quantite INTEGER NOT NULL DEFAULT 1,
  quantite_recue INTEGER DEFAULT 0,
  prix_unitaire NUMERIC(15,2) DEFAULT 0,
  total_ligne NUMERIC(15,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Paiements
CREATE TABLE IF NOT EXISTS paiements (
  id SERIAL PRIMARY KEY,
  facture_id INTEGER REFERENCES factures(id),
  tiers_id INTEGER REFERENCES tiers(id),
  montant NUMERIC(15,2) NOT NULL,
  date_paiement DATE DEFAULT CURRENT_DATE,
  mode_paiement VARCHAR(50) NOT NULL CHECK (mode_paiement IN ('espece', 'cheque', 'virement', 'carte', 'mobile_money')),
  reference VARCHAR(100),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default location
INSERT INTO locations (code, nom, ville, actif) 
VALUES ('SIEGE', 'Siège Social', 'Abidjan', true)
ON CONFLICT (code) DO NOTHING;

