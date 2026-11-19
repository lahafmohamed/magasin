-- 103_seed_categories_depenses.sql
--
-- Donne des catégories de dépenses aux bases qui n'en ont aucune.
--
-- Les catégories n'étaient semées que par la migration `023`. Or une base neuve
-- (CI, `deploy/provision-client.sh`) est construite depuis `ci-baseline.sql` +
-- `ci-ref-data.sql`, puis toutes les migrations sont baselinées sans être
-- exécutées : `categories_depenses` y restait vide, aucun endpoint ne permet
-- d'en créer, et `POST /api/depenses` répondait toujours 422 « Catégorie de
-- dépense invalide » — la page Dépenses était inutilisable chez tout nouveau
-- client.
--
-- Le jeu reprend celui de la base de production. Il n'est inséré que si la
-- table est vide : une base qui a déjà ses catégories n'est pas touchée.
-- `ci-ref-data.sql` porte les mêmes lignes pour les bases construites après
-- cette migration (elle y sera baselinée, donc jamais exécutée).

INSERT INTO categories_depenses (code, nom, description)
SELECT v.code, v.nom, v.description
FROM (VALUES
  ('LOYER',     'Loyer',                'Loyer et charges locatives'),
  ('SALAIRE',   'Salaires',             'Salaires et charges sociales'),
  ('TRANSPORT', 'Transport',            'Frais de transport et livraison'),
  ('FOURNI',    'Fournitures',          'Fournitures de bureau et matériel'),
  ('ELECTRI',   'Électricité / Eau',    'Factures eau et électricité'),
  ('TELECOM',   'Téléphone / Internet', 'Abonnements télécom et internet'),
  ('REPAS',     'Repas / Restauration', 'Repas professionnels'),
  ('ENTRET',    'Entretien',            'Entretien et réparations'),
  ('PUBLICI',   'Publicité',            'Dépenses marketing et publicité'),
  ('DIVERS',    'Divers',               'Autres dépenses non classifiées')
) AS v(code, nom, description)
WHERE NOT EXISTS (SELECT 1 FROM categories_depenses)
ON CONFLICT (code) DO NOTHING;
