-- Migration: Create company_settings table for dynamic document customization
-- Creates: company_settings table with constraints to enforce a single settings row

CREATE TABLE IF NOT EXISTS company_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  nom VARCHAR(100) NOT NULL DEFAULT 'Hitek-CI',
  adresse TEXT DEFAULT 'Abidjan, Côte d''Ivoire',
  telephone VARCHAR(50) DEFAULT '+225 07 00 00 00',
  email VARCHAR(100) DEFAULT 'contact@hitek-ci.com',
  site_web VARCHAR(100) DEFAULT 'www.hitek-ci.com',
  nif VARCHAR(50) DEFAULT '',
  rc VARCHAR(50) DEFAULT '',
  ai VARCHAR(50) DEFAULT '',
  cb VARCHAR(100) DEFAULT '',
  devise VARCHAR(10) DEFAULT 'FCFA',
  logo_url TEXT DEFAULT '/logo.png',
  CONSTRAINT one_row CHECK (id = 1)
);

-- Seed initial row
INSERT INTO company_settings (id, nom, adresse, telephone, email, devise)
VALUES (1, 'Hitek-CI', 'Abidjan, Côte d''Ivoire', '+225 07 00 00 00', 'contact@hitek-ci.com', 'FCFA')
ON CONFLICT (id) DO NOTHING;
