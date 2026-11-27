--
-- PostgreSQL database dump
--

\restrict mQYvnPP59ZraOJxKWd7dxrIQbh5zVucLEPt6PERXR8mmhxWagZabJPOOC1iNH00

-- Dumped from database version 18.3
-- Dumped by pg_dump version 18.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: plan_comptable; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.plan_comptable (id, numero, intitule, type_compte, categorie, actif, created_at, classe, niveau, compte_parent) VALUES (1, '411', 'Clients', 'actif', 'classe4', true, '2026-04-20 10:06:23.176645', 1, 1, NULL);
INSERT INTO public.plan_comptable (id, numero, intitule, type_compte, categorie, actif, created_at, classe, niveau, compte_parent) VALUES (2, '701', 'Ventes de marchandises', 'produit', 'classe7', true, '2026-04-20 10:06:23.176645', 1, 1, NULL);
INSERT INTO public.plan_comptable (id, numero, intitule, type_compte, categorie, actif, created_at, classe, niveau, compte_parent) VALUES (3, '4457', 'TVA collectée', 'passif', 'classe4', true, '2026-04-20 10:06:23.176645', 1, 1, NULL);
INSERT INTO public.plan_comptable (id, numero, intitule, type_compte, categorie, actif, created_at, classe, niveau, compte_parent) VALUES (61, '601', 'Achats de marchandises', 'charge', 'classe6', true, '2026-05-06 14:02:41.47293', 1, 1, NULL);
INSERT INTO public.plan_comptable (id, numero, intitule, type_compte, categorie, actif, created_at, classe, niveau, compte_parent) VALUES (62, '4456', 'TVA déductible', 'actif', 'classe4', true, '2026-05-06 14:02:41.47293', 1, 1, NULL);
INSERT INTO public.plan_comptable (id, numero, intitule, type_compte, categorie, actif, created_at, classe, niveau, compte_parent) VALUES (63, '401', 'Fournisseurs', 'passif', 'classe4', true, '2026-05-06 14:02:41.47293', 1, 1, NULL);
INSERT INTO public.plan_comptable (id, numero, intitule, type_compte, categorie, actif, created_at, classe, niveau, compte_parent) VALUES (3592, '53', 'Caisse (espèces)', 'actif', NULL, true, '2026-07-01 14:30:07.03587', 5, 1, NULL);
INSERT INTO public.plan_comptable (id, numero, intitule, type_compte, categorie, actif, created_at, classe, niveau, compte_parent) VALUES (3593, '54', 'Instruments de monnaie électronique', 'actif', NULL, true, '2026-07-01 14:30:07.03587', 5, 1, NULL);
INSERT INTO public.plan_comptable (id, numero, intitule, type_compte, categorie, actif, created_at, classe, niveau, compte_parent) VALUES (3594, '51', 'Banques', 'actif', NULL, true, '2026-07-01 14:30:07.03587', 5, 1, NULL);
INSERT INTO public.plan_comptable (id, numero, intitule, type_compte, categorie, actif, created_at, classe, niveau, compte_parent) VALUES (3595, '419', 'Clients créditeurs (avances reçues)', 'passif', NULL, true, '2026-07-01 14:30:07.03587', 4, 1, NULL);
INSERT INTO public.plan_comptable (id, numero, intitule, type_compte, categorie, actif, created_at, classe, niveau, compte_parent) VALUES (3596, '409', 'Fournisseurs débiteurs (avances versées)', 'actif', NULL, true, '2026-07-01 14:30:07.03587', 4, 1, NULL);
INSERT INTO public.plan_comptable (id, numero, intitule, type_compte, categorie, actif, created_at, classe, niveau, compte_parent) VALUES (3597, '604', 'Achats / dépenses stockés', 'charge', NULL, true, '2026-07-01 14:30:07.03587', 6, 1, NULL);
INSERT INTO public.plan_comptable (id, numero, intitule, type_compte, categorie, actif, created_at, classe, niveau, compte_parent) VALUES (3598, '65', 'Autres charges', 'charge', NULL, true, '2026-07-01 14:30:07.03587', 6, 1, NULL);
INSERT INTO public.plan_comptable (id, numero, intitule, type_compte, categorie, actif, created_at, classe, niveau, compte_parent) VALUES (3599, '75', 'Autres produits', 'produit', NULL, true, '2026-07-01 14:30:07.03587', 7, 1, NULL);


--
-- Data for Name: roles; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.roles (id, nom, description, is_system) VALUES (1, 'admin', 'Administrateur système (Accès total)', true);
INSERT INTO public.roles (id, nom, description, is_system) VALUES (2, 'manager', 'Manager magasin', true);
INSERT INTO public.roles (id, nom, description, is_system) VALUES (3, 'caissier', 'Caissier standard', true);
INSERT INTO public.roles (id, nom, description, is_system) VALUES (4, 'depot_staff', 'Personnel de dépôt', true);
INSERT INTO public.roles (id, nom, description, is_system) VALUES (5, 'magasin_staff', 'Personnel de magasin', true);
INSERT INTO public.roles (id, nom, description, is_system) VALUES (6, 'viewer', 'Lecteur seul', true);


--
-- Data for Name: three_way_match_config; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.three_way_match_config (id, qte_tolerance_pct, prix_tolerance_pct, bloquer, updated_at) VALUES (1, 0.0000, 0.0500, false, '2026-07-01 11:30:30.631753');


--
-- Name: plan_comptable_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.plan_comptable_id_seq', 5582, true);


--
-- Name: roles_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.roles_id_seq', 6, true);


--
-- Data for Name: categories_depenses (same set as migration 103 / production;
-- without it a freshly provisioned database cannot record any expense)
--

INSERT INTO public.categories_depenses (code, nom, description) VALUES
  ('LOYER', 'Loyer', 'Loyer et charges locatives'),
  ('SALAIRE', 'Salaires', 'Salaires et charges sociales'),
  ('TRANSPORT', 'Transport', 'Frais de transport et livraison'),
  ('FOURNI', 'Fournitures', 'Fournitures de bureau et matériel'),
  ('ELECTRI', 'Électricité / Eau', 'Factures eau et électricité'),
  ('TELECOM', 'Téléphone / Internet', 'Abonnements télécom et internet'),
  ('REPAS', 'Repas / Restauration', 'Repas professionnels'),
  ('ENTRET', 'Entretien', 'Entretien et réparations'),
  ('PUBLICI', 'Publicité', 'Dépenses marketing et publicité'),
  ('DIVERS', 'Divers', 'Autres dépenses non classifiées')
ON CONFLICT (code) DO NOTHING;


--
-- Data for Name: tiers — « Client comptoir » (same row as migration 104).
-- Walk-in sales: NouvelleFacture preselects it for the caissier role and
-- GET /api/tiers/comptoir finds it by its stable code PASS.
--

INSERT INTO public.tiers (code, raison_sociale, est_client, est_fournisseur, credit_max, delai_paiement, notes) VALUES
  ('PASS', 'Client comptoir', true, false, 0.00, 'immediat', 'Client de passage pour les ventes au comptoir.')
ON CONFLICT (code) DO NOTHING;


--
-- Data for Name: company_settings — périmètre v1 (docs/PLAN-V1-2026-11-19.md).
-- Une instance neuve démarre avec la paie, les employés, la comptabilité et la
-- trésorerie masqués (liste d'exclusion de la migration 098). Même liste que
-- MODULES_HORS_V1 dans CompanySettingsService.ts et frontend/src/config/modules.ts ;
-- un test compare les trois. Les autres colonnes prennent leurs valeurs par défaut.
--

INSERT INTO public.company_settings (id, modules_desactives) VALUES
  (1, '["paie", "employes", "comptabilite", "tresorerie"]'::jsonb)
ON CONFLICT (id) DO NOTHING;


--
-- Data for Name: payroll_cotisations / payroll_bareme_its (same defaults as
-- migrations 081 and 105; without them a freshly provisioned database
-- computes every payslip with no CNPS and no ITS). Rates must be checked
-- against current law; they are editable from Paramètres paie & achats.
--

INSERT INTO public.payroll_cotisations (code, libelle, taux_salarial, taux_patronal, plafond) VALUES
  ('CNPS_RET', 'CNPS Retraite', 0.0630, 0.0770, 1647315.00)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.payroll_bareme_its (ordre, tranche_min, tranche_max, taux) VALUES
  (1, 0.00, 75000.00, 0.0000),
  (2, 75000.00, 240000.00, 0.1600),
  (3, 240000.00, 800000.00, 0.2100),
  (4, 800000.00, 2400000.00, 0.2400),
  (5, 2400000.00, NULL, 0.3200);


--
-- PostgreSQL database dump complete
--

\unrestrict mQYvnPP59ZraOJxKWd7dxrIQbh5zVucLEPt6PERXR8mmhxWagZabJPOOC1iNH00

