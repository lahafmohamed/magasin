-- ============================================================
-- 086_seed_caisse_gl_accounts.sql
-- Chart-of-accounts prerequisites for caisse→GL posting.
--
-- CaisseMagasinService.postMouvementToGL maps each cash-movement category to a
-- counter account (53/54 cash, 411/401 tiers, 419/409 avances, 604 dépenses,
-- 75 apports, 51 banque, 65 autres). Since 079 added the FK
-- ecritures_comptables.compte_numero → plan_comptable(numero), every one of
-- those accounts MUST exist or the posting (and the whole caisse movement) would
-- fail. 411 and 401 already exist; this seeds the rest.
--
-- Numbers follow the SYSCOHADA/OHADA classes used elsewhere in the app; the
-- intitulés describe the code's intent. Idempotent.
-- ============================================================

INSERT INTO plan_comptable (numero, intitule, classe, type_compte, niveau) VALUES
  ('53',  'Caisse (espèces)',                      5, 'actif',   1),
  ('54',  'Instruments de monnaie électronique',   5, 'actif',   1),
  ('51',  'Banques',                               5, 'actif',   1),
  ('419', 'Clients créditeurs (avances reçues)',   4, 'passif',  1),
  ('409', 'Fournisseurs débiteurs (avances versées)', 4, 'actif', 1),
  ('604', 'Achats / dépenses stockés',             6, 'charge',  1),
  ('65',  'Autres charges',                        6, 'charge',  1),
  ('75',  'Autres produits',                       7, 'produit', 1)
ON CONFLICT (numero) DO NOTHING;
