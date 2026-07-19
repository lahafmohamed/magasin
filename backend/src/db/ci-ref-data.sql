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
-- PostgreSQL database dump complete
--

\unrestrict mQYvnPP59ZraOJxKWd7dxrIQbh5zVucLEPt6PERXR8mmhxWagZabJPOOC1iNH00

