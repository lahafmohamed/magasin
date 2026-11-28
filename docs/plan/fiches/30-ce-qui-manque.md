# 30 · Ce qui manque complètement

> **Contre-expertise du 2026-11-27** ([détail](../vagues/vague-10-contre-expertise.md)) : Verdict maintenu, borné : un bloc de métier ne passe ni avant les erreurs d'argent ni avant ses dépendances (24-I, 10-C, 13-G, 10-F) ; il passe juste après le socle, avec l'installation (rangs 117 à 126 de l'ordre final), et le bloc du métier du premier client se place en tête de ces rangs. Les rangs cités (« 144 à 228 ») sont en fait 141 à 228 ; 07-L ne peut précéder 07-D et 07-H ; l'étape 2 de 30-C attend 03-L. 30-A se réduit au contact ; 30-B donne préavis et page ; 30-C attend 10-K. Les propriétaires de lots sont tranchés dans [01-SUIVI.md](../01-SUIVI.md).

Audit du 2026-11-27, vague 10, agent 3. Base `nolyx_audit_3` (API 6143, écran 6153). Scripts `r1.mjs`, `r2.mjs`, `u1.mjs` dans `%TEMP%\nolyx-agents\vague10-3\` ; captures `a30-*.png` dans `%TEMP%\nolyx-captures\3\`. Lu : cadrage, `faits/`, sections 6 et 8 des 27 fiches, `01-SUIVI.md`, ordre de la contre-expertise 9.

## 1. Verdict

**Ajouter peu, réordonner beaucoup.** Presque tout ce qu'un commerçant visé demande au premier mois a déjà un lot. Mais les lots qui rendent chaque métier vendable (tailles, cartons, poids, séries, import) sont aux rangs 182 à 228 sur 242. Trois lots nouveaux seulement : l'aide (30-A), l'abonnement visible (30-B), le dépôt SAV (30-C).

## 2. Utilité des manques, par profil

0 = inutile, 5 = sans lui, le client part. Besoin **supposé** (aucun commerçant interrogé), sauf ce que disent `faits/concurrents.md` (attentes 1, 4 et 10) et `deploy/README.md`.

| Manque | Général | Informatique | Habillement | Alim. / grossiste | 1 magasin | Plusieurs sites |
|---|---|---|---|---|---|---|
| Lot du métier fait avant l'installation (§8) | 3 | 5 | 5 | 5 | 5 | 5 |
| Import des produits, reprise du cahier de crédit (10-G, 19-G) | 4 | 5 | 3 | 5 | 4 | 5 |
| 30-A Aide et contact du support | 4 | 3 | 4 | 4 | 4 | 4 |
| 30-B Abonnement visible, lecture seule | 3 | 3 | 3 | 3 | 3 | 3 |
| 30-C Dépôt SAV | 1 | 4 | 0 | 0 | 3 | 3 |

## 3. Contournements rejoués

Ce que le commerçant fait aujourd'hui à la place, rejoué sur ma base, par l'API ou l'écran.

| Besoin | Contournement | Rôle | Résultat |
|---|---|---|---|
| Polo en 3 tailles × 2 couleurs | 6 fiches produit | gérant, puis caissier | 6 créations ; « polo » au comptoir donne 6 lignes presque identiques, toutes « Stock bas : 2 » (seuil par défaut 5). Capture `a30-polo-390` |
| Riz au kilo | 0,5 en vente comptoir | caissier | 400 « Quantité entière attendue. » |
| Dette envers un fournisseur au démarrage | Facture fournisseur sans réception, ligne libre de 350 000 | gérant | 201 (FF-2026-00005) ; mouvements de stock 420 → 420. **Correct**, pas de lot |
| PC laissé pour réparation | Note sur la fiche du client | vendeur / caissier / gérant | 403 / 403 / 201. Ni numéro, ni reçu, ni liste |
| Robe livrée par coursier, payée à la livraison | Client créé par le vendeur, vente à crédit notée « Moussa » | vendeur, caissier | 201 (FAC-2026-00202, 00203). Marche parce qu'un plafond 0 vaut illimité, ce que 06-A va interdire |
| « Montage PC » facturé | Ligne sans produit | gérant | 400, produit exigé : lot 03-I |
| Trouver de l'aide | Menu du compte | caissier, 390 px | « Raccourcis clavier » seulement, inutile au téléphone. Capture `a30-menu-390` |
| 800 articles à saisir | Fiche par fiche | — | Aucune route d'import : lot 10-G |
| Client suspendu pour impayé | Aucun | lecture | Tout le domaine répond 503, API comprise, sans préavis. Non rejoué (nginx) |

Un rayon de 40 modèles en 6 tailles et couleurs, c'est 240 fiches et 240 seuils à corriger à la main.

## 4. Preuves d'absence

| Sujet | Preuve |
|---|---|
| Tailles et couleurs | Table `produits` (`ci-baseline.sql`) : ni modèle, ni taille, ni couleur ; la seule `taille` est celle des pièces jointes (`:1334`) |
| Poids | Quantité entière : `schemas.ts:137` et `:209` ; `produits.stock integer` |
| Fidélité, SMS, budget | 0 occurrence dans `ci-baseline.sql`, `backend/src`, `frontend/src`, sauf « budget » dans deux commentaires sur la limite de débit (`server.ts:71`, `:98`) |
| Promotions | 0 dans la base et l'écran ; les 4 « promo » du serveur sont « promouvoir » un contact |
| SAV, réparation | Aucune table ; `garantie_mois`, `suivi_serial` sans usage (fiche 10) |
| Livreur | Seule trace : l'aide du champ notes du bon de livraison (`NouveauBonLivraison.tsx:634`) |
| Assemblage, kit | Aucune table de composition ; « Manufacturing/BOM ➖ » (`CLAUDE.md`) |
| Devises | Une devise par entreprise (`company_settings.devise`, `:1722`) |
| Import | Aucune route `import` dans `backend/src/routes` |
| WhatsApp | Aucun `wa.me` ; « WhatsApp » n'est qu'un libellé (`Relances.tsx:36`) |
| Aide | Menu : `Topbar.tsx:167-170`. Page de suspension sans numéro (`provision-client.sh:141-142`) |
| Abonnement | 0 occurrence dans l'application ; facturation « manuelle, suffisante < 20 clients » (`deploy/README.md:104-109`) ; coupure par `return 503` (`nginx-client.conf.template:19-22`) |

Non vérifié : l'installation de l'application sur Android (fiche 29), la page de suspension servie en vrai.

## 5. Comparaison

Source : `faits/concurrents.md` (25/11/2026), tableau « 30 Manques », T3, T13.

| Manque | Odoo | Sage 100 | Loyverse | Locaux |
|---|---|---|---|---|
| Variantes | oui [O7] | option [G1] | 3 axes, prix et code par variante [L3] | NV |
| Promotions, fidélité | oui | promotions | points | NV |
| Import Excel | modèles, test avant import [O17] | copier-coller [G1] | CSV, 10 000 lignes [L9] | NV |
| Livreurs, commandes WhatsApp | non | non | non | eBoutik |
| Support | e-mail en semaine [O1] | intégrateur | chat | WhatsApp (Kweeli, eBoutik) |
| SAV | non étudié | non étudié | non étudié | non étudié |

Le vrai concurrent reste le cahier. Les applis locales donnent un support par WhatsApp : c'est le minimum (30-A).

## 6. Manques, piste par piste

**Lot** = nouveau ; **couvert** = lot existant ; **plus tard** ; **écarté**.

| Piste | Verdict | Raison |
|---|---|---|
| Tailles et couleurs | Couvert, trop tard | 10-J, rang 197. Trop petit : il doit poser un seuil par taille (0 ou 1), sinon tout le rayon passe « stock bas » |
| Poids et litre | Couvert | 10-I, selon la question 2 |
| Prix par quantité | Couvert | 10-H, étape 2 |
| Promotions, soldes, prix barré | Plus tard | Remise à la ligne et réimport des prix (10-G) suffisent pour une saison |
| Fidélité | Plus tard | Niveau de prix du client (10-H) et client nommé (19-B) d'abord |
| Réservation de stock | Écarté | Piège au comptoir (fiche 01), colonne retirée en 078 |
| Commande client, acompte | Couvert | 01-E et 04-I. Trop petit : 04-I doit s'ouvrir depuis « Vendre », car Devis est caché en habillement (fiche 25) |
| Livraison, coursier | Plus tard | Enregistrer la vente au retour de l'argent, ou encaisser Wave avant l'envoi ; frais du coursier = sortie d'argent (09-F) |
| SAV, réparation | **30-C** | Série et garantie : 10-K. L'appareil déposé n'a aucune place |
| Vente en ligne, catalogue WhatsApp | Plus tard | Le catalogue gratuit de WhatsApp Business suffit ; photos (`image_url`) inutilisées |
| SMS | Écarté | WhatsApp choisi au cadrage |
| Devises à l'achat | Plus tard | Question 32 ; l'euro est à parité fixe, le dollar se saisit en FCFA au cours du jour |
| Abonnement du SaaS | **30-B** | Se fond dans la fiche 28 si elle le prend |
| Aide et formation | **30-A** | Rien dans l'ERP |
| Import Excel | Couvert, trop tard | 10-G rang 194 ; 19-G rangs 144-145 |
| Application du patron | Couvert | 23-E, 08-L, fiche 29 (manifeste et service worker déjà en production) |
| Multi-entreprise | Écarté | Une installation par client (cadrage) |
| Budget | Écarté | Pas un besoin d'une boutique de 2 à 20 employés |
| PC monté, panier garni | Plus tard | Une ligne par composant plus le service (03-I) ; un article composé dont le stock suit : après 10-H |
| Consignes (bouteilles, gaz) | Plus tard | Article « casier consigné » vendu puis repris ; **avant** le premier client s'il vend des boissons (question 4) |
| Dette fournisseur de départ | Contourné | Rejoué juste ; 18-F doit garder la ligne libre |

## 7. TVA, FNE, mobile money, WhatsApp

- **30-C** : le dépôt n'est pas une vente : ni TVA, ni FNE. La réparation payée est une facture normale (03-K, 03-L). « Votre appareil est prêt » reprend le lien `wa.me` de 03-L.
- **30-A** : un lien `wa.me` vers le support, gratuit.
- **30-B** : l'éditeur de nolyxERP doit lui-même certifier ses factures d'abonnement (`faits/fne.md` §1 : toutes les entreprises), sur la plateforme de la DGI tant que 03-L n'existe pas. Le bandeau donne son numéro Wave marchand : la voie simple de `faits/mobile-money.md`.
- **TVA** : aucune incidence.

## 8. Lots proposés

### Décision d'ordre (pas un lot) : le métier du premier client d'abord

Aujourd'hui, le lot qui rend un métier vendable passe après 180 corrections. Choisir le métier du premier client (question 1), puis faire son bloc **avant l'installation** :

| Premier client | Lots (rang actuel) | Taille |
|---|---|---|
| Informatique | 10-K (199), 03-I (200), 03-G (172) | 3 × M |
| Habillement | 10-J (197), 07-J (192), 11-F/1 (161) | 3 × M |
| Alimentaire boutique | 10-H/1 (182), 07-L favoris (228), 10-I si question 2 (195) | L (étape), M, L |
| Grossiste | 10-H (182), 03-J (204), 19-G (144-145) | L, M, L |
| Tous | 10-G (194), 25-C (155) | 2 × M |

Informatique et habillement coûtent le moins.

### 30-A · Aide et contact du support (S, priorité 3) · avant le premier client

- **Problème** : le menu n'offre que « Raccourcis clavier » (`Topbar.tsx:167-170`, capture `a30-menu-390`) ; aucun numéro, aucun guide ; la page de suspension dit « contactez votre fournisseur » sans numéro.
- **Résultat** : en deux touches, le vendeur écrit au support sur WhatsApp, avec entreprise, écran et heure déjà dans le message ; six guides d'un écran.
- **Écrans** : entrée « Aide » (menu du compte et menu latéral, tous rôles) → `ui/sheet` : « Écrire au support (WhatsApp) », « Appeler », horaires ; guides : vendre et encaisser Wave, vendre à crédit, ouvrir et fermer la caisse, recevoir une livraison, reprendre un article, compter le stock. Filtrés par `routeAccess` et par module caché (25-E).
- **API** : `GET /api/support` (authentifié) → `{ whatsapp, telephone, horaires }` lus dans `SUPPORT_WHATSAPP`, `SUPPORT_TELEPHONE`, `SUPPORT_HORAIRES`. Aucune table.
- **Fichiers** : `backend/src/routes/support.ts`, `server.ts`, `.env.example`, `deploy/provision-client.sh` (variables, numéro dans `suspendu.html`), `frontend/src/components/AideSheet.tsx`, `Topbar.tsx`, `config/routeAccess.ts`, `frontend/src/content/guides/`.
- **Étapes** : (1) contact et lien `wa.me` prérempli (entreprise, utilisateur, page, version) ; (2) six guides.
- **Tests** : accents et espaces encodés ; variables absentes → guides seuls ; le dépôt ne voit pas le guide caisse ; 390 px.
- **Fini quand** : depuis la vente comptoir à 390 px, WhatsApp s'ouvre en deux touches sur « Boutique X · /vente-comptoir ».
- **Dépend de** : 25-E, fiche 28 (provisionnement). **Risques** : guides périmés après une refonte → test : chaque guide cite une route existante.

### 30-B · L'abonnement se voit, l'impayé laisse lire (M, priorité 3) · avant la première échéance

- **Problème** : la suspension renvoie 503 sur tout le domaine, API comprise, tout de suite (`nginx-client.conf.template:19-22`). En pleine journée, le commerçant perd la vente, la caisse et son cahier de crédit, sans préavis dans l'ERP (0 occurrence d'« abonnement »). La page ne donne ni montant ni numéro.
- **Résultat** : l'admin lit « Abonnement payé jusqu'au 05/01 » dans Paramètres ; bandeau 7 jours avant (montant, numéro Wave de l'éditeur) ; impayé : lecture seule pendant 15 jours (question 3) — consulter, imprimer, exporter, fermer la caisse —, puis coupure.
- **Base** : aucun changement chez le client. Fichier `~/clients/<slug>/abonnement.json` (formule, montant, échéance, état `actif | lecture_seule | suspendu`), chemin dans `ABONNEMENT_FILE`.
- **API** : `GET /api/abonnement` (admin, manager). Middleware : en `lecture_seule`, toute écriture → 402 « Abonnement à régulariser : consultation seulement », sauf connexion, déconnexion, mot de passe, clôture de caisse. Fichier relu toutes les 60 s ; absent ou illisible = actif.
- **Fichiers** : `backend/src/middleware/abonnement.ts`, `routes/abonnement.ts`, `server.ts`, `deploy/suspend-client.sh` (modes `lecture`, `on`, `off` écrivant le fichier), `deploy/README.md`, `frontend/src/components/AbonnementBanner.tsx`, la mise en page, Paramètres.
- **Étapes** : (1) fichier, route, bandeau ; (2) lecture seule ; (3) `suspendu.html` avec montant et numéro.
- **Tests** : GET 200, POST 402, clôture 200, connexion 200 ; fichier absent = actif ; bandeau à J-7 pour admin et manager seulement ; le caissier lit un message, pas une erreur.
- **Fini quand** : `suspend-client.sh test lecture` → la vente comptoir affiche le message, la liste des crédits reste lisible, la caisse se ferme.
- **Dépend de** : fiche 28 (provisionnement, mise à jour), 25-A. **Risques** : un défaut du middleware bloque tous les clients → repli « actif » et alerte au journal ; horloge du serveur.

### 30-C · Dépôt SAV : l'appareil du client a sa fiche (M, priorité 4) · trois premiers mois, informatique

- **Problème** : après 10-K, on retrouve la vente et la garantie, mais l'appareil laissé en boutique n'a aucune place (aucune table). La note sur la fiche client est refusée au vendeur et au caissier (403, rejoué) et ne donne ni numéro ni reçu. Les fiches 05 et 10 classaient le SAV « plus tard » ; je le remonte pour ce seul dépôt, que tout magasin qui vend sous garantie reçoit dès les premières semaines (supposé).
- **Résultat** : « PC HP reçu, SAV-2026-00012, écran noir, chargeur laissé, promis vendredi » ; reçu imprimé ou envoyé ; liste « En SAV » par état ; « Prêt » prépare le message WhatsApp ; « Rendu » clôt.
- **Écrans** : page « SAV » (option de 25-B, visible par défaut en informatique) : liste (état, âge, boutique) ; « Nouveau dépôt » (client ; scan du numéro de série → vente et fin de garantie par 10-K, ou saisie libre) ; fiche avec boutons d'état ; « Dépôt SAV » sur la fiche facture.
- **Base** : `sav_dossiers` (`numero` `SAV-AAAA-#####` par `NumberingService`, `tiers_id`, `location_id`, `facture_id` et `produit_id` facultatifs, `numero_serie`, `appareil`, `accessoires`, `panne`, `sous_garantie`, `statut` `recu | chez_fournisseur | pret | rendu | annule`, `date_promise`, `cree_par`, dates) ; séquence ; `ci-baseline.sql` régénéré. Aucun effet sur le stock ni l'argent.
- **API** : `GET/POST /sav`, `PATCH /sav/:id/statut` (rôles de vente ; annuler : gérant), `GET /sav/:id/pdf` (gabarit 27-C, format ticket 27-F). Réparation payante = vente avec ligne de service (03-I), liée par `facture_id`. Renvoi au fournisseur : 18-H.
- **Fichiers** : migration, `SavService.ts`, `routes/sav.ts`, `schemas.ts`, `NumberingService.ts`, `pages/Sav.tsx`, `api.ts`, `config/routeAccess.ts`.
- **Étapes** : (1) dépôt, liste, reçu ; (2) lien depuis la facture et message « prêt ».
- **Tests** : appareil acheté ailleurs ; garantie calculée ; retour en arrière refusé (rendu → reçu) ; autre boutique ; 0 mouvement de stock.
- **Fini quand** : scanner le numéro d'un PC vendu crée le dépôt prérempli et imprime le reçu en moins d'une minute.
- **Dépend de** : 10-K, 03-I, 27-C, 03-L, 25-E, 26-A1. **Risques** : glisser vers un atelier (pièces, main-d'œuvre, techniciens) : refuser, la pièce se vend par la vente.

## 9. Questions au propriétaire

1. Quel métier pour le premier client ? Il fixe le bloc du §8. Proposé : informatique ou habillement, les moins chers.
2. Support : quel numéro WhatsApp, quelles heures, le samedi ?
3. Impayé : combien de jours en lecture seule avant la coupure (proposé : 15) ? L'export des données reste-t-il ouvert pendant ce temps (proposé : oui) ?
4. Le premier grossiste vend-il des boissons ou du gaz consignés ? Si oui, les consignes passent avant lui.
5. Dépôt SAV dans les trois premiers mois d'un client informatique (proposé) ? Le magasin répare-t-il lui-même, ou envoie-t-il tout au fournisseur ?
6. Vente livrée par coursier : enregistrée au retour de l'argent (proposé), ou faut-il suivre « chez le livreur » ? Si 06-A passe sans exception, le contournement actuel tombe.
7. Contrat : à qui sont les données, comment le client les reprend s'il part ? (déclaration : question 66)

## 10. Ce que nolyxERP fait déjà mieux que les autres (vente)

- **Une vente au comptoir écrit facture, paiements, stock et caisse ensemble** (`VenteComptoirService.ts:79-147`), sous réserve de l'envoi en double (07-A). Odoo hors ligne émet les factures au retour [O9] ; Loyverse n'a pas de facture A4 (index).
- **Wave, Orange Money et MTN sont des modes à part** (`paymentMethods.ts:6-9`) ; Odoo ne documente aucun terminal pour eux [O16].
- **Le plafond de crédit bloque vraiment** (`CreditService.ts:23`) ; Odoo avertit sans bloquer [O12]. Réserve : plafond 0 = illimité (`:43-46`), d'où 06-A.
- **Devis, bon de livraison, facture A4 et ticket 80 mm dans un seul outil** (`routes/factures.ts:19`, `utils/ticket.ts`) ; la caisse de Sage 100 n'est plus vendue selon son forum [G6].
- **Aucun prix par poste** (fiche 07 §5), face à 8,95 € par utilisateur et par mois chez Odoo [O1].
