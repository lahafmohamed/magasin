# 14 Demandes de réapprovisionnement

> **Contre-expertise du 2026-11-27** ([détail](../vagues/vague-6-contre-expertise.md)) : Verdict maintenu, réduit. D1 et le défaut D5 de la fiche 13 ont une seule cause, l'absence d'état « en route » : propriétaire 13-E, dont l'étape 1 est l'étape 1 de 14-B. D2 : la demande n'est pas bloquée « à vie », elle part dès que le dépôt a tout le stock ; mais la seule sortie est de rapporter du stock, et l'admin n'en a aucune : 14-A se réduit à « annuler une demande approuvée », l'envoi partiel passe dans 13-E étape 2. 14-D, 14-E et 14-F plus tard. Les propriétaires de lots sont tranchés dans [01-SUIVI.md](../01-SUIVI.md).

Audit du 2026-11-27, base `nolyx_audit_2`, interface et API réelles (six rôles ; 1440 et 390 px). Une « demande » : la boutique demande du stock au dépôt. Emplacements : MAG-1 « Boutique Audit », MAG-2 « Boutique Yopougon », DEP-1 « Dépôt Vridi ». Le banc n'avait aucune demande : toutes celles citées viennent de l'audit.

## 1. Verdict

**Fusionner.** La demande devient le premier état d'un transfert : « demandée → envoyée → reçue ». Aujourd'hui, six états et 15 gestes pour faire venir 10 sacs de riz, et pourtant l'ERP ne sait pas dire ce qui est arrivé : le stock entre en boutique au moment où le dépôt clique, et la boutique « clôture » sans pouvoir écrire « 9 reçus ». Le seul vrai service qu'un patron attend de ce module, voir ce qui se perd entre le dépôt et la boutique, manque. Le reste est solide : stock juste, historique juste, aucun double envoi.

## 2. Utilité

| | Général | Informatique | Habillement | Alimentaire boutique / grossiste | Un magasin | Plusieurs sites |
|---|---|---|---|---|---|---|
| Besoin | 2 | 2 | 3 | 2 / 4 | 0 | 4 |
| Réponse actuelle | 2 | 2 | 2 | 1 / 2 | 0, mais visible | 2 |

- **Grossiste avec dépôt** : sacs et cartons partent chaque jour ; la perte en route est la vraie question, sans réponse.
- **Un magasin** : rien à faire du module, qui reste pourtant au menu (D6).
- **Deux boutiques sans dépôt** : une boutique ne peut pas demander à l'autre (D6).

## 3. Parcours réel

**Les étapes réelles.** 6 états : brouillon, envoyée, approuvée (ou en partie), en cours, livrée, clôturée. 7 actions préviennent la cloche : créer, modifier, envoyer, décider, exécuter, clôturer, annuler. « En cours » et « Livrée » tombent dans la même seconde (`DemandeService.ts:811-828`). « Annuler » écrit « refusée » (D5).

**« La boutique manque de riz, le dépôt envoie 10 sacs, la boutique en reçoit 9 »**, rejoué à 390 px, sans erreur JS ni API :

| Qui | Gestes | Ce qui se passe |
|---|---|---|
| Vendeur | Menu, « Nouvelle demande », taper « riz », « Ajouter », quantité 10, « Envoyer au dépôt » : **6** | Le dépôt affiche « Au dépôt : 67 ». Le stock de la boutique n'est pas affiché |
| Dépôt | Liste, ouvrir, « Prendre une décision », « Approuver 10 unités », « Exécuter le transfert », confirmer : **6** | Quantité pré-remplie au plus petit de « demandé » et « au dépôt » : bien |
| Vendeur | Ouvrir, « Clôturer la demande », confirmer : **3** | « Livré 10 sur 10 », **aucun champ pour écrire 9** (capture `v-cloture-390`) |

Total : **15 gestes, 3 passages, et le manquant n'existe pas**. Un transfert direct du dépôt (fiche 13) prend 2 actions, mais la boutique n'y confirme rien.

| Rôle | Ce qu'il peut faire | Écart |
|---|---|---|
| Vendeur (magasin) | Créer, envoyer, modifier son brouillon, annuler avant décision, clôturer | Peut demander pour une boutique où il n'est pas affecté (D4) |
| Dépôt | Voir hors brouillons, décider, exécuter, sans aucun prix (vérifié) | Liste sans produits (D11) |
| Gérant, admin | Tout, sur toutes les boutiques (décision d'octobre, vérifiée) | Cloche chargée de tout (D12) |
| Caissier | Crée par l'API (201), ne peut ni envoyer, ni modifier, ni annuler (403). Menu caché | D7 |
| Lecteur | Liste vide, création 403 | — |

**Ce qui marche (rejoué, chiffres).**

| Cas | Résultat | Juste ? |
|---|---|---|
| Riz 10 + souris 5, exécuté par le gérant | Dépôt riz 80 → 70, boutique 368 → 378 ; souris 80 → 75, 158 → 163 | Oui (mais trop tôt, D1) |
| Coût en boutique | Riz 13 423,07 → 13 425,11 = (368 × 13 423,07 + 10 × 13 500) / 378 | Oui |
| Mouvements (migration 107) | 4 lignes « transfert », avant/après cohérents (80→70, 368→378, 80→75, 158→163) | **Oui, réparé** |
| Auteur de chaque étape (migration 108) | créée et envoyée : vendeur ; approuvée : dépôt ; en cours et livrée : gérant ; clôturée : vendeur | **Oui, réparé** |
| Double clic envoyer, exécuter (×3), clôturer | 200 puis 409 ; un seul transfert, 2 mouvements | Oui |
| Dépôt (4) et gérant (1) décident au même instant | 200 et 409 ; le premier arrivé gagne (1, « partiellement approuvée ») | Oui |
| Modifier après envoi | 409 | Oui |
| Le dépôt ouvre un brouillon ; le vendeur ouvre une demande de MAG-2 faite par le gérant | 403 ; 403, absente de sa liste | Oui |
| Flux `demande-changed` | Diffusé à tous, sans aucune donnée (`NotificationService.ts:116-118`) | Oui |

## 4. Défauts prouvés

### Argent et stock

| N° | Constat | Preuve | Où |
|---|---|---|---|
| D1 | **Le stock entre en boutique avant d'arriver, et un manquant est impossible à déclarer.** La clôture ne prend aucune quantité | Après « Exécuter » : boutique 378 avant toute confirmation. Clôture envoyée avec 9 reçus : 200, toujours **378** pour 377 sacs réels. `DemandeService.ts:857-873` (clôture sans quantité), `DemandeClotureDialog.tsx:40-43` (« reste à faire ») | Écran |

### Blocage

| N° | Constat | Preuve | Où |
|---|---|---|---|
| D2 | **Une demande approuvée que le dépôt ne peut pas servir reste bloquée à vie.** Ni annuler, ni redécider, ni modifier, ni envoyer moins | DEM-2026-00012 (riz 87 approuvés, 67 au dépôt), DEM-2026-00014 (deux demandes de sucre de 48 approuvées sur 79 ; la 2e : « 31 disponible(s), 48 demandé(s) »), DEM-2026-00015 (portable Lenovo, absent du dépôt) : exécuter 422, annuler 400 (vendeur **et** admin), décider 409, modifier 409. L'approbation ne réserve rien et ne fait qu'avertir (« dépasse le stock du dépôt ») | Écran |
| D3 | **Rien ne se défait après l'exécution.** Mauvaise boutique ou camion revenu : il faut refaire un transfert inverse à la main | Annulation limitée à brouillon/envoyée (`DemandeController.ts:430-437`) ; transfert annulable seulement « en préparation » (`StockTransferService.ts:340`) | Écran |
| D4 | **Le vendeur peut faire livrer une autre boutique, puis ne peut plus clôturer** | Vendeur (affecté MAG-1) : demande pour MAG-2 201, exécutée 200 (stock parti à Yopougon), clôture **403** « Seul le personnel du magasin peut clôturer ». Sa liste et sa cloche lui disent pourtant « Clôturer » (DEM-2026-00006). Le formulaire propose toutes les boutiques | Écran |
| D6 | **Magasin seul : module visible pour rien. Deux boutiques sans dépôt : aucune demande possible** | Base neuve : un seul emplacement, de type magasin ; aucun profil ne cache `demandes-reappro` (`profilsActivite.ts`) ; le formulaire ne dit rien quand il n'y a pas de dépôt (liste vide). Création refusée si la source n'est pas un dépôt (`DemandeService.ts:285-290`) | Écran |

### Gêne

| N° | Constat | Preuve | Où |
|---|---|---|---|
| D5 | Une annulation s'affiche « Refusée », et « par le magasin » même quand l'admin annule | DEM-2026-00009 (vendeur) et 00010 (admin) : statut `refusee`, motif « [Annulée par le magasin] » ; la liste du vendeur et le filtre « Refusée » du dépôt les montrent comme refus (`DemandeService.ts:934-943`) | Écran |
| D7 | Le caissier crée un brouillon qu'il ne peut ni envoyer ni annuler ; le vendeur le voit avec « Modifier ou envoyer » | DEM-2026-00004 ; `routes/demandes.ts:15-18` | API (création), écran (liste) |
| D8 | « Modifier ou envoyer » est proposé sur le brouillon des autres ; l'enregistrement répond 403 | Brouillon de l'admin (#2) : 403 ; `DemandesList.tsx:148` ne regarde que le rôle | Écran |
| D9 | Produit en double ou inconnu : « Erreur serveur » (500) au lieu d'un message | Contrainte `UNIQUE (demande_id, produit_id)` ; clé étrangère produit | API |
| D10 | Numéros sautés : DEM-2026-00007 et 00008, TRA-2026-00004, 00006 et 00007 n'existent pas | Pris par des créations ou exécutions refusées (`nextval` en ligne, `DemandeService.ts:296, 651`) | Écran |
| D11 | Liste du dépôt : « Toutes 6 » alors que les puces totalisent 10 ; aucune carte ne dit quels produits sont demandés | Capture `d-list-390` | Écran |
| D12 | La cloche ne prévient jamais la boutique d'un refus ou d'une approbation partielle ; celle du gérant compte à vie les demandes bloquées (« 3 à exécuter ») | `useDemandeNotifications.ts` (états lus : envoyée, approuvée, livrée) ; cloche du gérant rejouée | Écran |
| D13 | Le vendeur ne voit pas son propre stock en demandant ; un produit à 0 au dépôt ne peut pas être ajouté (`DemandeForm.tsx:588`) : le besoin disparaît, rien ne part vers les achats | Les tables de demandes ne sont lues que par `DemandeService`, `DemandeController` et `StockTransferService` | Écran |
| D14 | L'outil « stock du dépôt » accepte n'importe quel emplacement : le vendeur lit le stock et les prix de MAG-2 | `GET /demandes/stock/depot?depot_id=4` : 200 | API |

Lu, non rejoué : un produit en « stock fantôme » (lot 10-A) apparaît à 0 au dépôt, car seul `stock_par_location` est lu (`DemandeService.ts:682-689`) ; une exécution pendant un inventaire du dépôt n'est pas bloquée (même cas que le transfert, lot 12-A).

## 5. Comparaison

Source : `faits/concurrents.md` (T18, fiche 14).

| | Mieux qu'ici | Moins bien qu'ici |
|---|---|---|
| Sage 100 | Réapprovisionnement entre dépôts dans toutes les gammes [G1] ; droits par dépôt dès Standard | Prix par poste |
| Odoo | Règles entre entrepôts (non relu) | Montage par prestataire |
| Loyverse | Ordres de transfert, payants [L1] | Pas de demande trouvée |

**Ce qu'on fait mieux** : le stock du dépôt est visible pendant la demande et pendant la décision, la quantité approuvée est pré-remplie, chaque étape a son auteur, le coût du dépôt suit la marchandise, tout passe au téléphone.
**Ce qui manque face au minimum attendu** : demander depuis la rupture avec une quantité proposée, une réception avec écart, un seul circuit au lieu de deux (demande et transfert), et pour la boutique seule, une simple liste « à acheter ».

## 6. Manques par profil

- **Plusieurs sites (tous)** : réception comptée avec écart (14-B) ; demander ce qui manque en un geste (14-E) ; prévenir par WhatsApp (14-F).
- **Grossiste** : sacs et cartons (10-H) ; « comme hier » : plus tard. **Habillement** : tailles (10-J). **Informatique** : numéros de série (10-K), plus tard.
- **Deux boutiques sans dépôt** : demande de boutique à boutique, plus tard (question 5).
- **Un magasin (fiche 25, quoi cacher)** : sans emplacement de type dépôt, cacher « Demandes », « Transferts », la cloche des demandes et le lien « Demander au dépôt » de l'accueil.

## 7. TVA, FNE, mobile money, WhatsApp

- **TVA** : aucune incidence. Une demande n'a pas de prix ; le coût suit le coût moyen hors taxe.
- **FNE** : un mouvement interne n'est pas une vente. Le modèle de 03-L doit simplement l'exclure de toute certification.
- **Mobile money** : sans objet.
- **WhatsApp** : le flux en direct ne touche que les écrans ouverts ; en vrai, la boutique appelle le dépôt. Un bouton « Prévenir le dépôt » (lien `wa.me` avec la liste et le lien de la demande) suffit au début (14-F, mécanisme 03-L). Recevoir une demande par WhatsApp : plus tard (payant).
- **Téléphone** : tout le parcours passe à 390 px. Pas de scan dans la demande (10-F).

## 8. Lots proposés

Ordre du cadrage. Prochaine migration : le numéro libre au moment du lot (dernière : `113`) ; tout changement de schéma régénère `ci-baseline.sql`. Déjà ailleurs : stock par emplacement **10-A**, transfert pendant un inventaire **12-A**, coût et auteur par mouvement **15-C**, boutique de l'utilisateur **fiche 13**, envoi et réception d'un transfert en deux temps **fiche 13 (question 37)**, lien WhatsApp **03-L**, cartons **10-H**, tailles **10-J**, scan **10-F**, suggestions d'achat **fiche 16**.

### 14-A · Sortir d'une demande que le dépôt ne peut pas servir (M)
- **Problème** : D2, D5.
- **Résultat** : le dépôt envoie ce qu'il a, ou la demande est annulée ; une annulation s'appelle « Annulée ».
- **Base** : statut `annulee` ajouté au CHECK ; colonne `raison_annulation`. Reprise : `refusee` dont le motif contient « [Annulée par le magasin] » → `annulee`. Le trigger d'historique écrira une ligne : la marquer `payload.reprise`.
- **API** : `cancel` accepte aussi `approuvee` et `partiellement_approuvee`, par le créateur, le gérant, l'admin ou le dépôt concerné (motif obligatoire pour le dépôt), et écrit `annulee`. `execute` accepte `lignes: [{ligne_id, quantite_envoyee}]`, au plus l'approuvé et le stock ; le reste est « non servi » (`quantite_livree` < approuvée).
- **Écrans** : `DemandeDetail.tsx` : « Annuler » jusqu'à l'envoi ; confirmation d'exécution avec quantités pré-remplies au plus petit de « approuvée » et « au dépôt ». `StatusBadge` : « Annulée ». Puces de liste.
- **Fichiers** : `DemandeService.ts`, `DemandeController.ts`, `routes/demandes.ts`, `schemas.ts`, `DemandeDetail.tsx`, `DemandesList.tsx`, `StatusBadge.tsx`, migration.
- **Tests** : DEM-00012 : envoyer 67, livrée 67, 20 non servis ; DEM-00015 annulée par le dépôt avec motif ; annulation admin : « Annulée » sans « par le magasin » ; annulation après exécution : 409.
- **Fini quand** : aucune demande ne reste « Approuvée » sans action possible ; aucune annulation n'apparaît « Refusée ».
- **Dépend** : rien. **Risque** : la reprise des annulations : vérifier le motif sur chaque base client.

### 14-B · Une demande = un transfert « demandé » (L, 3 étapes)
- **Problème** : D1, D3, D9, D11 ; deux circuits (l'exécution recopie `StockTransferService.complete`, `DemandeService.ts:602-855`) ; 6 états et 15 gestes.
- **Résultat** : trois gestes métier. La boutique demande ; le dépôt envoie (la quantité envoyée est la décision, 0 = refus motivé) ; la boutique reçoit et compte. 9 sur 10 : 377 en boutique, 1 manquant tracé. Plus de brouillon, plus d'approbation séparée, plus de clôture vide.
- **Base** : `stock_transfers` gagne l'état `demande`, `demande_par`, `motif` ; lignes `quantite_demandee`, `quantite_envoyee`, `quantite_recue`. L'envoi, la réception et l'écart sont le mécanisme de la fiche 13. Reprise : chaque demande devient un transfert (ancien numéro DEM gardé en référence) ; les trois tables `demandes_reapprovisionnement*` restent en lecture, puis sont supprimées.
- **API** : `POST /stock-transfers` avec `statut: 'demande'` (vendeur, gérant, admin, pour sa boutique) ; `POST /:id/envoyer` (dépôt) ; `POST /:id/recevoir` (boutique). `/api/demandes` renvoie 410 après la reprise. Produit en double ou inconnu : 422.
- **Écrans** : `StockTransfers.tsx`, onglet « Demandes » ; « Demander au dépôt » remplace `DemandeForm` ; `/demandes` redirige ; carte de liste « Riz 25 kg × 10 · Souris × 5 ».
- **Étapes** : (1) état « demandé » et envoi branchés sur l'envoi/réception de la fiche 13 ; (2) reprise, redirection, suppression de `DemandeService`, `DemandeController` et du module `demandes-reappro` (fondu dans `transferts`) ; (3) écran unique.
- **Fichiers** : `StockTransferService.ts`, `stock-transfers.ts`, `schemas.ts`, `StockTransfers.tsx`, `DemandeForm.tsx`, `routeAccess.ts`, `navConfig.tsx`, `modules.ts`, `App.tsx`, migration.
- **Tests** : scénario riz (dépôt 80 → 70 à l'envoi, boutique 368 → 377 à la réception, 1 manquant avec mouvement et historique) ; double envoi et double réception : 409 ; envoi au-delà du stock : 409 ; refus sans aucun mouvement ; auteur de chaque étape (principe de la 108 gardé).
- **Fini quand** : le scénario riz tient en 3 gestes métier et le manquant se voit.
- **Dépend** : lot « envoi/réception » de la fiche 13 ; 14-A ; 12-A. **Risque** : demandes en cours le jour de la reprise (état équivalent).

### 14-C · La demande part de ma boutique (S)
- **Problème** : D4, D7, D8, D14.
- **Résultat** : le vendeur ne demande que pour ses boutiques ; on ne propose que les actions permises.
- **API** : création par un vendeur ou un caissier : `magasin_id` doit être une boutique où il est affecté, sinon 403. `stock/depot` : `depot_id` doit être un dépôt, sinon 422. Caissier : retiré de la création, ou autorisé à envoyer (question 4).
- **Écrans** : `DemandeForm.tsx` : seulement ses boutiques (une seule : champ figé) ; `DemandesList.tsx:148` : « Modifier ou envoyer » pour le créateur ou un superviseur seulement.
- **Tests** : vendeur vers MAG-2 : 403 ; DEM-00004 du caissier sans action chez le vendeur ; `depot_id=4` : 422.
- **Fini quand** : D4, D7, D8 et D14 ne se reproduisent plus. **Dépend** : fiche 13 (quelle table d'affectation fait foi). **Risque** : vendeur sans affectation, à qui on dit pourquoi.

### 14-D · Une cloche qui prévient la bonne personne (S)
- **Problème** : D12.
- **Résultat** : la boutique voit « à recevoir » et « refusée : motif » ; le dépôt voit « à envoyer » ; le gérant voit seulement ce qui attend depuis plus de 24 h.
- **API** : `GET /demandes/a-faire` (puis sur les transferts après 14-B) donne les décomptes par rôle en une requête, au lieu de trois. Flux `demande-changed` inchangé.
- **Fichiers** : `useDemandeNotifications.ts`, `NotificationBell.tsx`, `DemandeController.ts`.
- **Tests** : refus → la cloche du vendeur passe à 1 ; le gérant ne voit pas une demande envoyée il y a 5 minutes.
- **Fini quand** : chaque rôle ne voit que ce qu'il doit faire. **Dépend** : 14-A. **Risque** : bruit si le seuil de 24 h est mal choisi.

### 14-E · Demander ce qui manque en boutique (M)
- **Problème** : D13 ; minimum seulement global (`ProduitService.ts:141-142`), aucune colonne de minimum par emplacement.
- **Résultat** : « Préparer depuis le stock bas » liste les produits sous le minimum de la boutique, avec la quantité pour revenir au niveau voulu, plafonnée au stock du dépôt. Colonne « En boutique ». Un produit absent du dépôt reste demandable, marqué « à acheter ».
- **Base** : `stock_par_location.stock_min` (et niveau cible), reprise depuis `produits.stock_min`.
- **Fichiers** : migration, `DemandeService.ts` (ou le formulaire de 14-B), `DemandeForm.tsx`, écran du produit (minimum par boutique).
- **Tests** : riz MAG-2 sous son minimum : proposé ; dépôt à 0 : ligne « à acheter », visible dans les suggestions (fiche 16).
- **Fini quand** : une boutique fait sa demande du jour en 3 gestes. **Dépend** : 10-A, 14-B, fiche 16. **Risque** : minimums à saisir ; proposer d'office le minimum global.

### 14-F · Prévenir par WhatsApp (S)
- **Problème** : le dépôt n'a pas toujours l'ERP ouvert ; le flux en direct ne touche que les écrans ouverts.
- **Résultat** : après l'envoi, « Prévenir le dépôt sur WhatsApp » ouvre un message prêt : « Boutique Audit demande : Riz parfumé sac 25 kg × 10 ; Souris × 5. Voir : <lien> ». Au départ du dépôt : « Prévenir la boutique ».
- **Base** : téléphone du responsable de l'emplacement (`stock_locations.responsable_id`).
- **Fichiers** : `DemandeDetail.tsx` (ou l'écran de 14-B), composant de 03-L.
- **Tests** : message en français, sans prix, numéro absent : bouton désactivé avec la raison.
- **Fini quand** : un geste suffit à prévenir. **Dépend** : 03-L étape 1. **Risque** : aucun.

## 9. Questions pour le propriétaire

1. Fusion : un seul écran « Transferts » avec un onglet « Demandes », plus une entrée « Demander au dépôt » pour la boutique ? (proposé)
2. Faut-il une approbation séparée de l'envoi ? Proposé : non, la quantité envoyée est la décision.
3. Un manquant à la réception (9 sur 10) : perte enregistrée d'office, ou litige que le gérant tranche ? Qui la porte : dépôt, boutique, transporteur ?
4. Le caissier peut-il demander du stock au dépôt ?
5. Deux boutiques sans dépôt : une boutique peut-elle demander à l'autre ?
6. Ce que le dépôt ne peut pas servir part-il d'office dans « à acheter » (fiche 16) ?
7. Marchandise en route : comptée au dépôt, en boutique, ou « en route » ? (question 37)

**À transmettre.** Fiche 13 : l'exécution d'une demande est un second code de transfert (`DemandeService.ts:602-855`), à fondre dans le mécanisme d'envoi/réception. Fiche 16 : un besoin non servi ne laisse aucune trace ; le minimum est global. Fiche 25 : quoi cacher sans dépôt (section 6). Fiche 26 : la cloche des demandes est la seule notification de l'ERP. Fiche 24 : le caissier peut créer une demande, pas l'envoyer. CLAUDE.md : les « 7 transitions » sont 7 actions qui préviennent la cloche, pas 7 changements d'état.

## Non vérifié

Deux postes du dépôt sur le flux en direct ; réseau lent ; exécution pendant un inventaire (lu, 12-A) ; stock fantôme (lu, 10-A) ; dépôt à 1440 et thème sombre.
