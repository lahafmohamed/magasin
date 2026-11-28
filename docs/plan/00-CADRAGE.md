# Audit fonctionnel nolyxERP : cadrage (2026-11-25)

Document de référence pour chaque agent d'audit et pour le plan final. Issu de l'interview du 2026-11-25 (trois rounds). Remplace `PLAN.md` et `docs/PLAN-V1-2026-11-19.md`, qui iront dans `docs/archive/` une fois le nouveau plan validé.

## But

Pour chaque fonctionnalité de l'ERP : est-elle utile au commerçant visé, que faut-il y modifier, que lui manque-t-il ? Le résultat est un plan détaillé, réalisé plus tard, au rythme du propriétaire. **L'audit ne modifie aucun code.**

## Décisions du propriétaire

| Sujet | Décision |
|---|---|
| Cible | Magasins de vente en Côte d'Ivoire : informatique, alimentaire (boutique, **grossiste et demi-gros**), habillement, vente générale |
| Hors cible | Supermarchés (une autre version plus tard), restaurants |
| Profils | Général, informatique, habillement, alimentaire / grossiste (remplace « libre-service ») |
| Taille | 1 à 5 points de vente, avec ou sans dépôt, 2 à 20 employés. Chaque client ne voit que ce qui correspond à sa taille : un magasin unique ne voit jamais la complexité multi-sites |
| Utilisateurs réels | **Aucun.** Produit en développement, jamais testé par un commerçant. Les données « de production » sont des données de test et ne prouvent aucun usage |
| Anciennes décisions | Toutes rouvertes, sauf quatre : le nom nolyxERP, l'interface en français, le FCFA, une installation séparée par client |
| TVA | **Optionnelle, selon le client.** Réglage par entreprise ; le client non assujetti ne doit rien en voir |
| FNE | **Plus tard, pas prioritaire.** Le commerçant choisit facture par facture ce qu'il certifie. Préparer le modèle de données, rien de plus. Agrément éditeur : société à créer, en cours |
| Vente comptoir et FNE, hors ligne et FNE | Non décidés, à revoir avec le chantier FNE |
| Wave, Orange, MTN, Moov | Intégration automatique **plus tard**, mais préparer le terrain. Usage dominant : le client scanne le QR déjà affiché dans le magasin et le vendeur saisit l'encaissement ; l'ERP n'a pas à être dans la boucle |
| WhatsApp | Bouton gratuit (lien `wa.me` avec un lien vers le document) d'abord ; envoi automatique payant plus tard |
| Modules cachés (paie, employés, comptabilité, trésorerie) | Audités comme les autres : réparer, simplifier ou supprimer |
| Pouvoir des agents | Tout recommander : garder, améliorer, simplifier, fusionner, cacher, supprimer |
| Concurrents | Odoo et Sage en priorité (très utilisés en Côte d'Ivoire), puis les outils locaux |
| Rythme | Celui du propriétaire : lots ordonnés, ni semaines ni dates |
| Exécution de l'audit | Par vagues de 3 fiches, avec arrêt et accord du propriétaire entre deux vagues |
| Étude concurrents | Une seule, partagée par tous les agents : [faits/concurrents.md](faits/concurrents.md) |

## Ordre de priorité des lots

Choix délégué par le propriétaire.

1. Erreurs d'argent ou de stock.
2. Suppressions, fusions et simplifications (avant toute amélioration du même module).
3. Ce qui empêche d'installer, de démontrer ou d'utiliser l'ERP au quotidien.
4. Manques métier bloquants d'un profil visé (par exemple les unités de vente du grossiste).
5. TVA optionnelle.
6. Terrain préparé pour mobile money, FNE et WhatsApp.
7. Ce qui bat la concurrence.
8. Confort.
9. Chantiers reportés : FNE complète, Wave automatique, puis Orange et MTN.

## Règles de preuve

- Un constat cite un fichier et sa ligne, une requête et sa réponse, ou une capture. Sinon il est marqué « non vérifié ».
- L'agent utilise l'ERP réel : vrai backend, base jetable, un compte par rôle. **Jamais la production, jamais la base locale `pbdsarl`.**
- Une fonctionnalité n'est pas « utile » parce qu'elle existe, ni « inutile » parce que personne ne s'en sert encore : le juge est le commerçant visé.
- Les comparaisons externes sont sourcées (lien et date). Aucune information privée dans les recherches.
- Les anciens audits (`AUDIT.md`, `DEAD-FEATURE-AUDIT-2026-09-07.md`, `CLAUDE.md`) sont des pistes à revérifier, pas des preuves.

## Les 30 fiches

| N° | Fonctionnalité | N° | Fonctionnalité |
|---|---|---|---|
| 01 | Devis | 16 | Suggestions d'achat et commandes fournisseur |
| 02 | Bons de livraison | 17 | Réceptions |
| 03 | Factures | 18 | Factures fournisseur |
| 04 | Paiements et acomptes clients | 19 | Contacts, CRM, analyse clients |
| 05 | Retours et avoirs | 20 | Employés, commissions, paie |
| 06 | Relances et limite de crédit | 21 | Trésorerie |
| 07 | Vente comptoir et ticket | 22 | Comptabilité |
| 08 | Sessions, historique et audit de caisse | 23 | Tableau de bord et rapports |
| 09 | Dépenses | 24 | Utilisateurs, rôles, connexion |
| 10 | Produits, prix, codes-barres | 25 | Paramètres, modules, profils |
| 11 | Étiquettes | 26 | Journal d'audit, pièces jointes, notifications |
| 12 | Inventaire physique | 27 | Documents imprimés et PDF |
| 13 | Emplacements, transferts, affectations | 28 | Déploiement, démo, sauvegardes |
| 14 | Demandes de réapprovisionnement | 29 | Mobile, recherche, hors ligne |
| 15 | Valorisation et CMP | 30 | Ce qui manque complètement |

## Ordre des vagues

| Vague | Fiches |
|---|---|
| 1 | 10 Produits et prix · 07 Vente comptoir · 03 Factures |
| 2 | 04 Paiements et acomptes · 08 Caisse · 09 Dépenses |
| 3 | 01 Devis · 02 Bons de livraison · 05 Retours et avoirs |
| 4 | 16 Commandes · 17 Réceptions · 18 Factures fournisseur |
| 5 | 12 Inventaire physique · 11 Étiquettes · 15 Valorisation |
| 6 | 13 Emplacements et transferts · 14 Demandes · 06 Relances et crédit |
| 7 | 19 Contacts · 24 Utilisateurs et rôles · 25 Paramètres et profils |
| 8 | 27 Documents imprimés · 23 Tableau de bord et rapports · 21 Trésorerie |
| 9 | 22 Comptabilité · 20 Employés et paie · 26 Journal et notifications |
| 10 | 28 Déploiement et démo · 29 Mobile et hors ligne · 30 Ce qui manque |

Après chaque vague, un contre-expert conteste les verdicts autres que « garder » et rejoue les défauts les plus graves.

## Contenu d'une fiche

1. **Verdict** unique et une phrase de justification.
2. **Utilité** de 0 à 5 pour chacun des quatre profils et pour chaque taille (un magasin, plusieurs sites).
3. **Parcours réel** rejoué, rôle par rôle : ce qui marche, ce qui bloque, nombre d'étapes.
4. **Défauts prouvés**, classés argent/stock, blocage, gêne.
5. **Comparaison** Odoo, Sage, outils locaux : ce qu'ils font de mieux, ce qu'on fait de mieux.
6. **Manques**, par profil.
7. **Incidence** de la TVA optionnelle, et préparation FNE, mobile money et WhatsApp.
8. **Lots proposés**. Chaque lot contient le problème prouvé, le résultat voulu pour le commerçant, les écrans, les changements de base et d'API, les fichiers touchés, les étapes, les tests, les critères « c'est fini », les dépendances, la taille (S/M/L) et les risques. Il doit pouvoir être lancé seul, sans relire la conversation d'origine.
9. **Questions** que seul le propriétaire peut trancher.

## Défauts déjà constatés pendant le cadrage

- `CaisseMagasinService.ts` (`postMouvementToGL`) : tout mode autre que mobile money va au compte 53 (espèces), carte, chèque et virement compris. Vérifié par lecture.
- `FactureFournisseurService.ts` (enregistrement d'un paiement) : un règlement n'écrit que le paiement et l'auxiliaire fournisseur. Ni mouvement de caisse, ni écriture de trésorerie, même en espèces : le seul trigger de la table (`trg_paiement_ff_iud`) ne met à jour que la facture. Vérifié par lecture, à rejouer dans la fiche 18.
- `VenteComptoir.tsx` : l'écran n'envoie pas la référence du paiement, que l'API accepte.
- Moov n'a pas de mode de paiement propre (`paymentMethods.ts`). Vérifié par recherche.
- **Un client neuf ne peut pas ouvrir sa caisse.** Sur une base sortie de `ci-db-setup.mjs`, la table `magasins` est vide, aucun code ni script ne l'alimente, `GET /caisse/magasins` renvoie une liste vide et `POST /caisse/ouvrir` échoue sur `sessions_caisse_magasin_id_fkey`. Les ventes en espèces sont donc impossibles (409 `CAISSE_FERMEE`). Les tests ne le voient pas : ils insèrent eux-mêmes la ligne. Rejoué le 2026-11-25.
- **Créer un magasin ou un dépôt échoue toujours** (`POST /stock-locations` → 500) : `StockLocationService.create` n'écrit pas `location_type`, colonne NOT NULL sans défaut, et le schéma Zod ne l'accepte pas. Rejoué le 2026-11-25.
- `seed-hitek-demo.mjs` échoue encore sur une base neuve (`relation "categories" does not exist`), donc `deploy/reset-demo.sh` aussi. Rejoué le 2026-11-25.

Faits externes : [faits/fne.md](faits/fne.md), [faits/mobile-money.md](faits/mobile-money.md).
