-- Augmenter la taille du champ statut des acomptes à VARCHAR(30) pour permettre le statut 'partiellement_utilise'
ALTER TABLE acomptes_clients ALTER COLUMN statut TYPE VARCHAR(30);
ALTER TABLE acomptes_fournisseur ALTER COLUMN statut TYPE VARCHAR(30);
