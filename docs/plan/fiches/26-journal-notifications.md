# 26 Journal d'audit, pièces jointes, notifications

> **Contre-expertise du 2026-11-27** ([détail](../vagues/vague-9-contre-expertise.md)) : Verdict maintenu. B3 : au banc la table `audit_log` appartient à `postgres` ; elle n'appartient à l'application que chez un vrai client (`provision-client.sh`), où la trace est effaçable. Le jeton `?token=` est bien refusé (401) et le SSE marche par cookie : CLAUDE.md est périmé. 26-A est découpé en A1 (fonction dans la transaction : sorties, acomptes, plafond, contacts) et A2 (avant/après du stock, des prix, des droits, des remises) ; 26-C et 26-D en deux étapes ; les factures échues de 26-D restent à 23-F. Les propriétaires de lots sont tranchés dans [01-SUIVI.md](../01-SUIVI.md).

Audit du 2026-11-27, base jetable `nolyx_audit_3`, interface et API réelles (admin, gérant, caissier, vendeur, dépôt, lecteur ; 390 et 1440 px). Montants en FCFA. « Écran » = atteignable par un employé ; « API » = par programme seulement. La caisse du banc (MAG-1, ouverte le 25/11) a été clôturée par le gérant au montant attendu (60 000, écart 0) ; le caissier a ouvert la session 3 (fonds 50 000). Scripts : `%TEMP%\nolyx-agents\vague9-3\`.

**Journée rejouée par l'ERP, un compte par geste** : le caissier vend 2 souris à 4 000 au lieu de 5 000 (FAC-2026-00202), sort 20 000 du tiroir, encaisse un acompte, corrige puis efface une dépense ; le vendeur facture 120 000 à crédit (FAC-203), le gérant l'annule ; le gérant baisse un prix, retire du stock, monte un plafond de crédit, supprime une facture ; l'admin change un rôle et supprime un paiement ; trois photos jointes.

## 1. Verdict

**Améliorer.** Le journal note la plupart des pièces, mais ne répond à aucune des quatre questions du patron sans détour : rien sur l'argent hors facture (sorties, acomptes, plafonds), pas d'« avant », pas de recherche, filtre de dates cassé, trace effaçable chez tout client neuf. Les notifications font du bruit à chaque vente et ne signalent aucune anomalie. On garde table et page, on comble les trous, on remplace les bulles par une liste « À surveiller » gardée, on met les pièces jointes là où il y a du papier. « Audit caisse » part (08-F, confirmé).

## 2. Utilité

| | Général | Informatique | Habillement | Alimentaire boutique / grossiste | Un magasin | Plusieurs sites |
|---|---|---|---|---|---|---|
| Besoin | 4 | 4 | 4 | 4 / 5 | 3 | 5 |
| Réponse actuelle | 2 | 2 | 2 | 1 / 2 | 2 | 1 |

- **Grossiste** : remises, acomptes et crédit sont le cœur du risque, et ce sont les trous (D2 à D4).
- **Plusieurs sites** : le patron n'est pas au comptoir ; sans alerte gardée ni recherche, il ne contrôle rien.
- **Pièces jointes** : 3 sur 5 pour tous, à condition d'être sur la bonne page.

## 3. Parcours réel

**Le patron (admin), au téléphone, le lendemain** :

| Question | Où | Touches | Réponse obtenue |
|---|---|---|---|
| Qui a annulé FAC-2026-00203 ? | Journal, Élément = Facture | 4 si en page 1 | « gerant », sans motif ni montant (capture `j2`). La fiche facture : rien |
| Qui a fait cette remise ? | Journal, fiche facture, fiche produit | 7 au moins | « caissier a créé la facture 202 : 23 500 ». Aucune remise visible |
| Qui a sorti 20 000 ? | Caisse, mouvements de la session | 3 | « Remis au patron — caissier ». Journal : rien |
| Qui a changé le prix du câble ? | Journal, Élément = Produit, ouvrir chaque ligne | 4, puis 1 par ligne | « gerant, prix_vente — → 3000 », s'il sait que le câble est le n° 7 ; ancien prix absent |
| Même chose, sur une date | Filtre « Du » | — | « Impossible de charger le journal d'audit » (B1) |

| Rôle | Journal | Bulles pour une vente comptoir | Pièces jointes |
|---|---|---|---|
| Admin, gérant | Admin seul ; gérant 403, aucun menu | 3 (« Paiement reçu … (espece) », « Nouvelle facture », « Rupture »), parties en 9 s | Ajoute, voit, supprime |
| Caissier, vendeur | Non | Rupture | Ajoute, voit |
| Dépôt, lecteur | Non | Rupture, même d'une autre boutique | Par l'API (24-A1) |

Pièces jointes à l'écran : facture client et commande fournisseur seulement. La cloche ne montre que les demandes (14-D).

## 4. Défauts prouvés

### Argent et stock (traces absentes ou incomplètes)

| N° | Défaut | Preuve |
|---|---|---|
| D1 | Sortie de 20 000 et apport de 10 000 dans le tiroir : **aucune ligne** au journal. Écran | Mouvements 3 et 5 de la session 3, auteur connu (`cree_par`) ; `audit_log` saute de 133 à 134. `CaisseMagasinService.ts` n'écrit qu'à l'ouverture (256) et à la clôture (419) |
| D2 | Plafond de crédit monté de 3 000 000 à 9 000 000, contact modifié, contact supprimé : **aucune ligne**. Écran | PUT `/tiers/4` 200, DELETE `/tiers/14` 200, rien au journal. `TiersController.ts:83` ne trace que la création |
| D3 | Acompte client de 15 000 en espèces : aucune ligne. Écran | Acompte 1, mouvement de caisse 10 ; journal vide |
| D4 | Remise invisible : la trace d'une vente ne garde que le total | Ligne 132 : `{total: 23500, tiers_id: 1, numero}` ; la souris vendue 4 000 pour 5 000 au catalogue (`document_lignes`). `FactureService.ts:597-607` |
| D5 | Pas d'« avant » là où il compte | Prix : `prix_vente — → 3000` (`ProduitController.ts:257-264`, copie de la requête). Rôle : `role_id 5`, ancien absent, nombre brut. Retrait de stock : ni stock avant (26) ni motif « casse », pourtant connus (`mouvements_stock` 428). Perte : motif absent. Facture supprimée : avant et après vides (ligne 146). Pièce jointe supprimée : ni nom ni pièce (ligne 170 ; `AttachmentService.ts:107`, fichier effacé pour de bon) |
| D6 | « Mot de passe changé » toujours masqué : on ne sait pas si un mot de passe a été remis | `{"password_changed":"[REDACTED]"}` (lignes 138-139, 147-148) : `audit.ts:28-30` masque toute clé contenant « password », même un oui/non |

Déjà attribués, rejoués et confirmés : dépense portée de 7 000 à 9 000 sans ligne et mouvements 7 et 8 **sans auteur** (09-C) ; trois échecs de connexion, aucune ligne (24-F) ; paramètres sans auteur (25-F) ; annulation sans motif (03-D) ; mouvement de stock sans auteur, `mouvements_stock` n'a pas de colonne pour lui (15-C).

### Blocage

| N° | Défaut | Preuve |
|---|---|---|
| B1 | Le filtre de dates du Journal casse la page. Écran | GET `/admin/audit?date_from=2026-11-27` → 500 ; SQL : « column reference "created_at" is ambiguous ». `AuditService.ts:51-57` ne préfixe pas la colonne alors que la requête joint `utilisateurs` |
| B2 | Impossible de retrouver une pièce. Écran | Aucune recherche (numéro, produit, client) ; filtres personne et geste absents de l'écran, présents dans l'API. Identifiant interne (« Produit n° 7 ») au lieu du numéro ou du nom ; valeurs brutes (`en_attente`, `[{"produit_id":3…}]`) ; identifiant de connexion au lieu du nom (capture `j2`) |
| B3 | La trace s'efface chez tout client neuf. Base | Bancs `3` et `neuve` : ni trigger, ni règle, droits vides. `provision-client.sh:66-67` donne la base à l'utilisateur de l'application ; `ci-baseline.sql` sans `REVOKE` ; `010` seulement marqué appliqué. Protection posée à la main en production seulement (note du propriétaire, non vérifiée). Écrite après le `COMMIT`, une trace perdue ne laisse qu'un message technique (`audit.ts:107-109`) |
| B4 | Rien n'est gardé. Écran | Gérant : 3 bulles par vente comptoir, 0 après 9 s, rien au rechargement (capture `n1`). Une boutique à 100 ventes fait 200 bulles par jour chez le patron |
| B5 | Aucune alerte d'anomalie | Quatre émetteurs seulement : facture créée, stock bas (`FactureService.ts:612-620`), paiement (`PaiementService.ts:387`), demandes (`DemandeService.ts`, 7 appels). Rien pour annulation, paiement supprimé, sortie d'argent, écart, caisse non clôturée, remise, facture échue |
| B6 | Rayon vide sans alerte. Écran | Chemise M vendue à MAG-1 : 1 → 0 ; MAG-2 16, dépôt 80 ; aucune bulle. `NotificationService.ts:157-166` additionne tous les sites. Définition « dans la boutique » : 23-C |

### Gêne

- G1 : rupture envoyée à tous les rôles et tous les sites (lecteur et dépôt reçoivent la cartouche de MAG-1) ; le gérant d'une boutique reçoit les ventes des autres (13-D1). « (espece) » en code brut.
- G2 : pièces jointes à l'écran sur 2 pages (`FactureDetail.tsx:767`, `CommandeDetail.tsx:882`) pour 9 types acceptés par l'API. Facture 999999 inexistante : 201. 12 Mo : 500 « Erreur interne » (11 Mo : 400 en français). Limite réelle 10 Mo (`AttachmentService.ts:22`) ; les 15 Mo sont ceux de la requête encodée.
- G3 : pièce d'identité d'un client (API) : le caissier l'ajoute (201), le dépôt la télécharge (200). Droits : 24-A1 ; donnée personnelle : 26-E.
- G4 : code mort : middleware `audit()` monté nulle part (`audit.ts:44-82`) ; deux fonctions d'écriture plus 9 `INSERT` directs ; deux index en double.
- G5 : « Audit caisse » ne doublonne pas le journal : c'est un rapprochement paiements ↔ tiroir, qui ne trouve plus rien (0 orphelin sur 159 ; 08, D15). Suppression confirmée (08-F).
- G6 : `CLAUDE.md` périmé : `?token=` est refusé (rejoué : 401 ; `Bearer` : 200 ; `notifications.ts:10-13`). Plus de jeton dans les journaux nginx ni l'historique.

**Volume et conservation.** Une vente comptoir écrit 2 lignes, chaque autre geste 1 ; 221 octets en moyenne. À 100 tickets par jour : environ 220 lignes, 15 à 30 Mo par an (estimation). Aucune purge dans le code ni dans `deploy/`. Seul gros consommateur : le logo copié à chaque enregistrement (25-D).

## 5. Comparaison

| | Mieux chez eux | Mieux chez nous |
|---|---|---|
| Odoo | Fil de suivi sur chaque document (non sourcé) | Trace écrite côté serveur, même pour l'API |
| Sage | Traçabilité des enregistrements, fichiers liés [G1] | Lisible au téléphone (une fois 26-C fait) |
| Loyverse | Historique de stock par article, alerte stock bas [L1] | Plusieurs sites, crédit, alertes en direct |

Minimum du marché (`concurrents.md`) : qui a annulé, remisé, changé un prix ; alerte du patron ; photo jointe. Nous donnons l'annulation, sans motif.

## 6. Manques

- **Tous** : historique sur la pièce ; alertes gardées ; recherche par numéro.
- **Alimentaire et grossiste** : vente sous le prix d'achat signalée ; bon signé en photo ; pièce d'identité du client à crédit.
- **Informatique** : photo de la facture fournisseur (garantie).
- **Plus tard** : chaîne d'empreintes (preuve qu'aucune ligne n'a été retirée), export du journal, notification du téléphone par l'application installée (gratuite sur Android, supposé), WhatsApp automatique.

## 7. TVA, FNE, mobile money, WhatsApp

- **TVA (03-K)** : non assujetti, rien ne change. Assujetti : changement de taux tracé avec son auteur (25-F) ; la trace d'une facture garde HT, TVA et TTC.
- **FNE (03-L)** : chaque essai de certification devient une ligne (auteur, facture, réponse, numéro rendu), un refus une alerte. Rien d'autre à préparer.
- **Mobile money** : la référence d'un paiement est tracée avant/après ; alerte « paiement sans référence » si la question 7 la rend obligatoire. Les avis automatiques des opérateurs écriront avec la source `systeme` (26-A).
- **WhatsApp** : c'est là que regarde le patron absent. Mais un lien `wa.me` part du téléphone de l'employé : il ne contrôle rien. Proposé : au premier mois, le rapport du soir (08-L) porte les alertes du jour ; l'alerte immédiate attend l'envoi automatique payant. Terrain : `alertes.whatsapp_envoye_le` (26-D).

## 8. Lots

Ailleurs : dépense (09-C), connexions (24-F), paramètres (25-F), motif d'annulation (03-D), auteur d'un mouvement de stock (15-C), droits des pièces jointes (24-A1), désactivation (24-B), cloche des demandes (14-D), rapport du soir (08-L), Audit caisse (08-F). Ces lots appellent la fonction de 26-A.

### 26-A · Chaque geste d'argent, de stock et de droits laisse une trace complète (M, priorité 1)
- **Problème** : D1 à D6, G4.
- **Résultat** : une ligne par geste : qui (nom), quoi, quelle pièce (numéro imprimé), combien, avant → après, motif, boutique.
- **Base** (migration) : `audit_log` + `document_numero VARCHAR(50)`, `montant NUMERIC(15,2)`, `motif TEXT`, `magasin_id INT`, `source VARCHAR(10) DEFAULT 'ecran'` (`ecran`, `api`, `systeme`) ; index `(document_numero)`, `(table_name, record_id)` ; suppression des deux index en double ; `ci-baseline.sql` régénéré.
- **API** : une seule fonction `AuditService.trace(client, {...})`, écrite **dans la transaction** du geste, l'avant lu sous `FOR UPDATE`. Elle remplace `logAudit`, `AuditService.log` et les 9 `INSERT` directs ; le middleware `audit()` part. À ajouter ou compléter : sortie et apport de caisse ; plafond, délai, modification et suppression d'un contact ; acomptes, remboursements, compensation ; prix ; retrait, perte, ajustement (stock avant, après, motif) ; rôle par son nom, `mot_de_passe_remis: oui` (clé hors de la liste masquée), révocation de sessions ; vente : lignes avec prix catalogue, prix vendu, remise ; suppression de facture ou de pièce jointe : avant complet.
- **Fichiers** : `AuditService.ts`, `middleware/audit.ts`, `CaisseMagasinService.ts`, `TiersController.ts`, `TiersService.ts`, `AcompteService.ts`, `ProduitController.ts`, `AdminUserService.ts`, `AuthController.ts`, `FactureService.ts`, `AttachmentService.ts`.
- **Étapes** : 1. fonction et migration ; 2. argent ; 3. stock et prix ; 4. droits.
- **Tests** : la journée du haut rejouée : une ligne complète par geste ; `ROLLBACK` = aucune ligne ; un test parcourt les routes d'écriture et vérifie chaque ligne.
- **Fini quand** : les gestes D1 à D6 rejoués laissent leur ligne, avec auteur, numéro, montant et avant/après.
- **Dépend de** : rien. **Risque** : volume (le logo reste à 25-D) ; ne jamais copier un fichier ni un mot de passe.

### 26-B · Trace en ajout seul, gardée (S, priorité 3)
- **Problème** : B3.
- **Résultat** : ni l'ERP, ni un employé, ni une erreur de script ne modifie ou n'efface une ligne ; rien n'est purgé.
- **Base** (migration) : triggers `BEFORE UPDATE OR DELETE` et `BEFORE TRUNCATE` sur `audit_log` → exception « Journal d'audit : ajout seul » ; `REVOKE` des mêmes droits à `PUBLIC`. Une migration de rattrapage future désactive le trigger dans sa transaction, et le dit.
- **Fichiers** : migration, `ci-baseline.sql`, `seed-hitek-demo.mjs` (la démo vide le journal : trigger désactivé là seulement), `deploy/README.md`.
- **Tests** : base sortie de `ci-db-setup.mjs` : `DELETE`, `UPDATE`, `TRUNCATE` refusés, insertion acceptée.
- **Fini quand** : sur un client neuf, `DELETE FROM audit_log` échoue.
- **Dépend de** : rien ; sauvegarde du journal avec la base (fiche 28). **Risque** : le propriétaire de la base peut retirer le trigger ; la preuve forte (chaîne d'empreintes) est pour plus tard. Anonymiser un client (question 63) demandera une fonction dédiée.

### 26-C · Page Journal réparée et lisible au téléphone (S, priorité 3)
- **Problème** : B1, B2.
- **Résultat** : le patron tape « 203 » ou « câble » et lit « Annulée par Awa (gérante) le 27/11 à 13:51 · 120 000 F · motif … ».
- **API** : préfixe `al.` dans `getLogs` (étape 1, tout de suite) ; `validateQuery` ; paramètre `q` (numéro de pièce, produit, contact, personne) ; filtres personne, geste, boutique ; connexions masquées par défaut ; réponse avec nom complet, numéro et libellé de la pièce.
- **Écran** : champ « Chercher un numéro, un produit, un client » ; filtres « Qui », « Quoi » (annulation, suppression, prix, sortie d'argent, droits), « Du / Au », gardés dans l'URL ; carte : geste, pièce, montant, personne, heure, motif ; détail en français (« Prix de vente : 3 500 → 3 000 F », rôles et produits nommés) ; lien vers la pièce.
- **Fichiers** : `AuditService.ts`, `routes/audit.ts`, `AuditLog.tsx`, nouveau `utils/auditLabels.ts`.
- **Tests** : filtre de dates 200 ; `q=FAC-2026-00203` → 2 lignes ; capture 390 px ; gérant toujours 403 (question 1).
- **Fini quand** : les quatre questions du §3 répondues en 3 touches après la recherche.
- **Dépend de** : 26-A pour le numéro et le montant (l'étape 1 n'attend rien). **Risque** : recherche lente sans l'index de 26-A.

### 26-D · « À surveiller » : des alertes gardées au lieu des bulles (M, priorité 3)
- **Problème** : B4, B5, G1.
- **Résultat** : à l'ouverture, le patron voit les gestes anormaux depuis sa dernière visite, par boutique ; plus aucune bulle à chaque vente.
- **Base** : `alertes (type, gravite, magasin_id, table_name, record_id, document_numero, montant, auteur_id, message, created_at, whatsapp_envoye_le)`, `alertes_lues (alerte_id, utilisateur_id, lu_le)` ; seuils dans les paramètres (page : fiche 25 ; valeurs : question 16).
- **Règles** (après `COMMIT`, par `NotificationService.safely`) : facture annulée ou supprimée ; paiement supprimé ; écart de caisse au-delà du seuil ; caisse encore ouverte à l'heure de clôture (tâche toutes les 15 min, une seule instance sous `pg_advisory_lock`) ; rupture **dans une boutique** (23-C) ; rôle changé ou compte réactivé ; factures échues du jour, groupées (06-D). Après leurs lots : remise (03-B), vente sous le prix d'achat (03-E), sortie au-delà du plafond (09-B).
- **API** : `GET /alertes`, `POST /alertes/:id/lue`, `POST /alertes/lues` ; événement SSE `alerte` sans contenu (invalidation). Admin : tout ; gérant : sa boutique (13-D1) ; vendeur et dépôt : ruptures de leur site.
- **Écran** : la cloche montre « À surveiller » puis « À faire » (14-D) ; pastille = alertes graves non lues ; 3 dernières sur l'accueil (23-E). Bulle seulement pour une alerte grave, en français. Bulles `invoiceCreated` et `paymentReceived` supprimées.
- **Fichiers** : nouveaux `AlerteService.ts`, `routes/alertes.ts` ; `NotificationService.ts`, `FactureService.ts`, `PaiementService.ts`, `CaisseMagasinService.ts`, `NotificationBell.tsx`, `useSseNotifications.ts`.
- **Étapes** : 1. table, annulation, paiement supprimé, écart, cloche ; 2. caisse restée ouverte, rupture par boutique ; 3. seuils ; 4. terrain WhatsApp.
- **Tests** : annulation par le gérant → 1 alerte chez l'admin, 0 chez le caissier ; 100 ventes → 0 bulle ; alerte gardée après rechargement ; le gérant de MAG-2 ne voit pas MAG-1.
- **Fini quand** : la journée rejouée donne exactement les alertes attendues, gardées.
- **Dépend de** : 26-A, 13-D1, 24-B. **Risque** : trop d'alertes → seuils réglables, groupement par jour.

### 26-E · Pièces jointes là où il y a du papier (M, priorité 4)
- **Problème** : G2, G3, D5 (pièce supprimée sans trace).
- **Résultat** : la facture du fournisseur, le bon de livraison signé, le bon de réception, la pièce d'identité d'un client à crédit, photographiés au téléphone en un geste.
- **Écrans** : panneau sur facture fournisseur, réception, bon de livraison, fiche contact (gérant et admin seulement) ; bouton « Prendre une photo » et réduction de l'image, repris de 09-I.
- **API** : pièce inexistante → 404 ; type `bon_livraison` ajouté ; `tiers` réservé au gérant et à l'admin, comme `employe` ; trop lourd → 400 « Fichier trop lourd : 10 Mo au plus » ; suppression douce (`supprime_le`, `supprime_par`) tracée (26-A) ; écriture : table de 24-A1.
- **Fichiers** : `AttachmentService.ts`, `AttachmentController.ts`, `server.ts`, `AttachmentPanel.tsx`, pages facture fournisseur, réception, bon de livraison, contact ; migration.
- **Tests** : facture 999999 → 404 ; 12 Mo → 400 en français ; dépôt → 403 sur la pièce d'identité ; suppression tracée avec le nom du fichier.
- **Fini quand** : une photo prise au comptoir se retrouve sur sa pièce, sur 390 px.
- **Dépend de** : 09-I, 24-A1, 19-A. **Risque** : fichiers dans la base (`BYTEA`), donc dans chaque sauvegarde (`backup-db.sh:30`) : rien ne se perd au changement de serveur, mais 10 photos de 300 Ko par jour font 1 Go par an (fiche 28). Données personnelles (question 4).

### 26-F · L'historique sur la pièce elle-même (M, priorité 7)
- **Problème** : la fiche facture ne dit ni qui l'a faite, ni qui l'a annulée (B2).
- **Résultat** : sur la facture, le produit, le contact et la journée de caisse, un bloc repliable « Historique » : « Créée par Koné, caissier · Annulée par Awa, motif … ». Une touche.
- **API** : `GET /historique/:type/:id` (la pièce et ses pièces liées) ; admin tout, gérant sa boutique.
- **Écran** : composant `HistoriqueBloc` sur `FactureDetail.tsx`, fiche produit, fiche contact, fiche de journée (08-F) ; libellés de 26-C.
- **Tests** : FAC-203 montre création par le vendeur et annulation par le gérant ; le caissier ne voit pas l'historique d'un prix d'achat (03-E).
- **Fini quand** : « qui a fait ça ? » répondu en une touche depuis la pièce.
- **Dépend de** : 26-A, 26-C. **Risque** : un avant/après contient un prix d'achat : masqué selon 03-E.

## 9. Questions pour le propriétaire

1. Le gérant voit-il qui a fait quoi dans sa boutique ? Proposé : l'historique de la pièce (26-F) oui, la page Journal non. Si oui partout, 26-C filtre par boutique.
2. Seuils d'alerte : remise au-delà de 10 % ? écart 5 000 et sortie 25 000 (question 16) ? caisse non clôturée à 21 h ?
3. Supprimer les bulles « Nouvelle facture » et « Paiement reçu » (proposé), ou les garder en option ?
4. Pièce d'identité du client à crédit dans l'ERP ? Proposé : oui, gérant et admin seulement, effacée à l'archivage sans dette (questions 63, 66).
5. Journal gardé sans limite (proposé) ou purgé après un nombre d'années ?
6. Alertes du patron : dans le rapport du soir (08-L, question 71) au premier mois, puis notification du téléphone par l'application installée (gratuite) avant WhatsApp payant ?
