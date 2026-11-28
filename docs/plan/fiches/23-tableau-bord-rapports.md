# 23 Tableau de bord et rapports

> **Contre-expertise du 2026-11-27** ([détail](../vagues/vague-8-contre-expertise.md)) : Verdict maintenu, réduit (23-G étape 2 plus tard). Le fuseau horaire n'y est pour rien (UTC comme Abidjan). D1 touche aussi la comptabilité : une fois 03-C fait, les écritures des factures (horodatées) perdront leur dernier jour ; 23-A passe avant 03-C. D4 surestimé : effet faible sur le banc. Le 500 de `POST /devis/:id/convert` vient des messages de refus non reconnus, pas de la migration 113 ; aucun écran ne l'appelle (03-A, suppression proposée). La carte « Argent » de la fiche 21 devient un bloc de 23-E. Les propriétaires de lots sont tranchés dans [01-SUIVI.md](../01-SUIVI.md).

Audit du 2026-11-27, base jetable `nolyx_audit_2`, interface et API réelles (admin, gérant, caissier, vendeur, dépôt, lecteur ; 390 et 1440 px). Montants en FCFA. « Écran » = visible par un employé ; « API » = par programme seulement. La caisse du banc (MAG-1, ouverte le 25/11) a été clôturée sans écart ; j'ai ouvert MAG-1 (fonds 20 000) et MAG-2 (fonds 10 000, clôturée avec un manque de 1 000).

**Journée du 27/11 rejouée par l'ERP** : ticket A à MAG-1, 13 500 en espèces ; ticket B, 15 500 Wave ; ticket C à MAG-2, 36 000 Orange ; facture D à crédit, 150 000 dont 50 000 payés en espèces ; facture E de 135 000 annulée ; devis de 65 000 (remise 5 000) devenu facture F de **70 000** (03-A) ; 101 tickets d'huile à 1 400 en espèces ; un retour remboursé 5 000 en espèces ; une dépense de 3 000 ; deux acomptes en espèces, 20 000 (imputé tout seul sur une facture d'octobre) et 10 000 (non imputé) ; un chèque de 30 000 sur une facture du 21/11.

**Vérité refaite à la main** : vendu 426 400 (MAG-1 390 400 en 105 factures, MAG-2 36 000) ; argent reçu 316 400 (espèces 234 900, chèque 30 000, Wave 15 500, Orange 36 000) ; sorti 8 000 ; vendu à crédit 170 000 ; tiroir MAG-1 attendu 246 900.

## 1. Verdict

**Simplifier.** L'accueil du patron fait 17 blocs et 6,8 écrans de téléphone, mais ne répond pas aux cinq questions du soir par boutique ; quatre chiffres y sont faux ou contradictoires. On garde l'accueil par rôle et la carte de caisse, on retire dix blocs et cinq routes, on donne à chaque chiffre une seule définition, calculée par le serveur et par boutique, puis on complète les Rapports.

## 2. Utilité

| | Général | Informatique | Habillement | Alimentaire boutique / grossiste | Un magasin | Plusieurs sites |
|---|---|---|---|---|---|---|
| Besoin | 4 | 4 | 4 | 5 / 5 | 4 | 5 |
| Réponse actuelle | 2 | 3 | 2 | 1 / 2 | 3 | 1 |

- **Alimentaire boutique** : plus de 100 tickets par jour, et le chiffre du caissier devient faux (D2).
- **Grossiste** : le crédit du jour n'apparaît nulle part ; « meilleur client » = le client comptoir.
- **Plusieurs sites** : aucun chiffre par boutique, ni à l'accueil ni dans les Rapports (B1).
- **Un magasin** : le haut de l'accueil suffit presque ; le reste est du bruit.

## 3. Parcours réel

**Le soir, au téléphone, en 10 secondes** (admin et gérant voient le même accueil) :

| Le patron veut | L'accueil donne |
|---|---|
| Vendu aujourd'hui, par boutique | 426 400, juste, mais sans boutique |
| Encaissé par mode, et où est l'argent | 306 400 : faux de 10 000 (D3). Modes : cumul depuis le premier jour. Espèces de chaque tiroir : page Caisse seulement |
| Vendu à crédit aujourd'hui | Rien (170 000) |
| Dette des clients | Un total (04-A) ; la part échue, non |
| Ce qui manque en stock | « 8 produits », tous sites mêlés ; MAG-1 en a 9 sous son minimum |
| Écart de caisse | « 1 clôture de caisse avec écart », sans montant ni boutique |
| Bénéfice | Nulle part |

| Rôle | À l'écran | Ce qui surprend |
|---|---|---|
| Admin, gérant | Haut lisible : bandeau, 5 tuiles. Puis 12 blocs : objectif, graphiques, commandes, demandes, factures récentes, classements, prévision… 23 requêtes | « Objectif atteint 162 % » : la cible est le mois précédent. « 5 meilleurs clients » : n° 1 « Client comptoir ». Encaissements par mode « depuis toujours » |
| Caissier | Ma caisse (juste : 246 900 attendus), ventes du jour | Après 100 tickets : 140 000 au lieu de 390 400 ; « Reste à encaisser 0, toutes soldées » au lieu de 170 000 (capture `caissier-390-accueil`) |
| Vendeur | Devis, bons, stock bas de sa boutique, caisse | Aucune vente, même pas les siennes |
| Dépôt | Réceptions, demandes, transferts, quantités | Juste, aucun montant |
| Lecteur | Un lien « Inventaire » | Page vide |
| Rapports (gérant, admin) | 5 tuiles « mois en cours », compte de résultat, catégories, 10 produits, créances ; 4,3 écrans ; un export (créances) | Deux chiffres d'affaires du mois sur la même page (D1). Aucun choix de boutique, aucune vente par vendeur, aucune dépense |

**Vitesse.** Accueil du gérant : 23 requêtes (47 en développement, à cause du double rendu), 16 Ko, 58 à 194 ms côté serveur, 1,8 s affiché en local. Caissier : 100 factures lues (68 Ko) pour un chiffre faux. Requêtes rapides aujourd'hui (moins de 1 ms, `EXPLAIN ANALYZE`). À 12 mois pour 3 boutiques à 150 tickets par jour (environ 165 000 factures, 400 000 lignes), cinq requêtes relisent tout l'historique à chaque ouverture : meilleurs produits, meilleurs clients, encaissements par mode, prévision, et le mois en cours (`EXTRACT`, l'index de date ne sert pas). Estimation (supposé) : 50 à 200 ms chacune, sur un pool de 10 connexions partagé par tous les postes. Le vrai coût au téléphone est la longueur et le nombre de requêtes, pas la base.

## 4. Défauts prouvés

### Argent (chiffres faux à l'écran)

| N° | Défaut | Preuve |
|---|---|---|
| D1 | Les Rapports oublient le dernier jour. Période par défaut du 1er à aujourd'hui : **aujourd'hui exclu**. Écran | Même page : tuile « Chiffre d'affaires du mois » 26 343 000 (204 factures), compte de résultat 25 916 600 (98). Écart 426 400 = toute la journée. Du 27 au 27 : 0 pour 106 factures. `date_facture` est une date-heure, filtrée par `BETWEEN '…-27'` qui s'arrête à minuit : `ReportingService.ts:55`, idem 180, 214, 332, 354, 376, 400 |
| D2 | Caissier : ventes et reste du jour faux dès 100 tickets. Écran | 140 000 « au moins 100 factures » pour 390 400 ; « 0, toutes les factures du jour sont soldées » pour 170 000 dus. `Dashboard.tsx:930` (100 factures lues), `935-951` (somme côté navigateur) |
| D3 | « Encaissé aujourd'hui » oublie les acomptes reçus et compte les acomptes imputés. Écran | Accueil 306 400 ; tiroirs 280 400 + 36 000 = 316 400. Écart : l'acompte de 10 000. L'acompte de 20 000 est compté le jour où il est imputé, pas le jour où l'argent entre. `PaiementController.ts:197-202` ne lit que `paiements` |
| D4 | « 5 produits les plus vendus » : factures annulées comptées, retours non déduits, depuis toujours. Écran | Écran Dell : 51 vendus selon l'accueil, 50 hors facture annulée ; souris 77 avec 1 rendue. `FactureService.ts:1236-1252` : ni statut, ni date |
| D5 | Deux dettes clients sur la même page Rapports, après suppression d'un débiteur. Écran. Propriétaire 04-A | Tuile 20 817 785 ; tableau, accueil et Relances 16 996 365 |
| D6 | Trois valeurs du stock. Propriétaire 15-A | Tuile Rapports 89 164 216 ; somme des sites 89 169 754 ; accueil « au prix de vente » |
| D7 | Chiffre d'affaires brut des avoirs : 426 400 au lieu de 421 400. Propriétaire 05-D | Avoir de 5 000 remboursé, rien ne baisse |

### Blocage

| N° | Défaut | Preuve |
|---|---|---|
| B1 | Aucun chiffre par boutique. Écran | Accueil : un total. `/reports/pnl` avec `location_id=4` ou `magasin_id=2` : 26 343 000, comme sans filtre. `/reports/consolidated?magasin_id=4` : 39 003 800, comme sans filtre (`ReportingService.ts:539-553`) ; route lue par aucun écran |
| B2 | Pas de bénéfice. Le « compte de résultat » n'est qu'une marge brute. Écran | La dépense de 3 000 n'apparaît dans aucun rapport ; `getPnL` ne lit que les factures |
| B3 | Rien pour clore la journée. Écran | « Encaissements par mode » = « cumul de tous les paiements » (`Dashboard.tsx:2732`) : Wave 9 445 735 au lieu de 15 500 aujourd'hui. Écart de caisse sans montant ni boutique |
| B4 | Prévision tirée vers le bas. Écran dès 3 mois | `ReportingService.ts:500-514` : les 3 derniers mois **dont le mois en cours partiel**. Rejoué : octobre partiel et novembre au 27, prévision 30 942 750. Le 3 du mois, un mois de 3 jours entre dans la moyenne |

### Gêne

- G1 : accueil de 6,8 écrans au téléphone, 17 blocs. « Objectif » = période précédente (`Dashboard.tsx:2295`).
- G2 : bandeau « À traiter » : 0 facture échue, alors que 40 le sont (10 309 240) ; il ne compte que plus de 30 jours après l'échéance (`ReportingService.ts:614`), et son message vide dit « aucune facture échue » (`Dashboard.tsx:1756`).
- G3 : « stock bas » 8 pour le gérant (tous sites), 9 pour le vendeur de MAG-1 : le patron ne voit pas ce qui manque en rayon quand le dépôt en a.
- G4 : le tableau des créances des Rapports refait la page Relances.
- G5 : API : dépôt, lecteur, caissier et vendeur lisent chiffre d'affaires, encaissements et meilleurs clients (`/factures/revenue-trends`, `/factures/stats`, `/factures/top-clients`, `/paiements/stats` : 200). Propriétaire 24-A1.
- G6 : routes mortes : `/reports/consolidated`, `/reports/revenue-trends` (aucun appel).
- Corrigé depuis : `Reporting.tsx` passe par `services/api.ts` (ligne 15) ; `CLAUDE.md` est périmé sur ce point.

## 5. Comparaison

| | Mieux chez eux | Mieux chez nous |
|---|---|---|
| Odoo | Rapport de session par caisse, tableaux croisés [O23] | Accueil par rôle sans réglage |
| Sage | États comptables, BI en option | Simplicité, téléphone |
| Loyverse | Ventes par article, catégorie, **employé**, mode, gratuites 31 jours [L1] | Plusieurs sites, crédit client, dépôt |
| Ma Caisse | CA, nombre, panier, **bénéfice estimé du jour** [P3] | Caisse attendue au franc |
| eBoutik | Produits qui dorment [P7] | (15-H le fera) |

Le minimum du marché (concurrents.md) : vendu, encaissé, à crédit, bénéfice, par boutique, sur téléphone ; dettes, ruptures, dormants, écarts. Nous en donnons deux sur huit.

## 6. Manques

- **Tous** : par boutique ; encaissé du jour par mode ; vendu à crédit ; bénéfice du mois ; ventes par vendeur ; « hier » et « mois dernier » en un geste.
- **Alimentaire / grossiste** : meilleurs clients hors comptoir ; quantités en cartons (10-H).
- **Habillement** : ventes par taille et couleur (attend les variantes, fiche 10) ; stock qui dort (15-H).
- **Informatique** : marge par produit (existe).
- **Plus tard** : heures de pointe, comparaison annuelle (après 12 mois de données), prévision, alertes poussées.

## 7. TVA, FNE, mobile money, WhatsApp

- **TVA (03-K)** : non assujetti, rien ne change. Assujetti : accueil en TTC (l'argent qui entre) ; résultat et marge en HT ; état mensuel « TVA collectée » par taux pour la déclaration. Aujourd'hui `factures.tva` est forcée à 0 (`factures_tva_zero`).
- **FNE (03-L)** : plus tard, une ligne « factures certifiées / non certifiées du mois ». Rien à préparer ici.
- **Mobile money (07-F, 08-D)** : encaissé par opérateur (Moov compris) et nombre de paiements sans référence, pour rapprocher le soir.
- **WhatsApp** : rapport du soir par `wa.me` = 08-L. Je propose d'avancer son bouton au premier mois, sur 23-C : c'est la raison d'acheter d'un patron absent.

## 8. Lots

**Les chiffres, une définition chacun** (période = du début du premier jour à la fin du dernier, par boutique = site de la pièce ; total = somme des boutiques) :

| Chiffre | Définition | Écrans |
|---|---|---|
| Vendu | Σ `total` des factures non annulées, non supprimées ; moins les avoirs de la période (05-D) | Accueil, caissier, vendeur (les siennes), Rapports |
| Nombre de ventes, panier | Nombre de ces factures ; vendu ÷ nombre | Rapports |
| Encaissé, par mode | Argent reçu : paiements directs + acomptes reçus, à leur date ; les imputations d'acompte exclues | Accueil, caisse, Rapports |
| Remboursé, sorti | Avoirs et acomptes remboursés ; dépenses payées | Accueil (une ligne), Rapports |
| Vendu à crédit | Reste dû, à l'instant, des factures de la période | Accueil, caissier |
| Dette clients | Formule 04-A ; part échue selon 06-D | Accueil, Crédit clients |
| Caisse | Attendu, compté, écart de chaque tiroir (fiche 08) | Accueil, Caisse |
| Marge | Vendu net − coût figé des lignes (15-B, 15-G) | Rapports |
| Bénéfice | Marge − pertes (15-D) − dépenses payées | Accueil « ce mois », Rapports |
| Ruptures | Produits à 0 ou sous le minimum **dans la boutique** | Accueil, vendeur |
| Valeur du stock, stock qui dort | 15-A, 15-H | Rapports « Stock » (15-F) |

### 23-A · Bornes de dates et factures annulées (S, priorité 1)
- **Problème** : D1, D4, B4.
- **Résultat** : la journée en cours compte partout ; un classement ne compte ni facture annulée ni ventes d'il y a trois ans.
- **API** : partout `date_facture >= :du AND date_facture < :au + 1 jour` ; « mois en cours » en plage, pas en `EXTRACT` (index utilisé) ; `getTopProducts` filtré par statut, suppression et période (30 jours par défaut) ; prévision : mois complets seulement (si 23-D ne la supprime pas avant).
- **Fichiers** : `ReportingService.ts`, `FactureService.ts` (`getStats`, `getTopProducts`), `PaiementController.ts` (`DATE()` en plage).
- **Tests** : une facture à 23 h 59 dans le rapport du jour ; tuile du mois = compte de résultat du 1er à aujourd'hui ; facture annulée absente du classement.
- **Fini quand** : la journée rejouée donne 426 400 partout. **Dépend** : rien. **Risque** : aucun.

### 23-B · Caissier : ventes du jour comptées par le serveur (S, priorité 1)
- **Problème** : D2.
- **Résultat** : le caissier voit le vrai total et les factures non soldées, à 500 tickets comme à 5.
- **API** : `GET /factures` accepte `du`, `au`, `location_id` et renvoie `summary { nombre, total, reste_du }` ; liste limitée aux 6 non soldées.
- **Fichiers** : `FactureController.ts`, `FactureService.getAll`, schéma Zod de requête, `Dashboard.tsx` (`CaissierHub`, `summarizeToday` supprimé), `api.ts`.
- **Tests** : 101 tickets + 2 factures à crédit → 390 400 et 170 000 ; caissier de MAG-1 sans les ventes de MAG-2.
- **Fini quand** : moins de 5 Ko chargés. **Dépend** : 13-D1 (boutique de l'utilisateur). **Risque** : aucun.

### 23-C · Une seule définition par chiffre (M, priorité 1)
- **Problème** : D3, B3, et les écarts d'une page à l'autre.
- **Résultat** : le tableau ci-dessus, calculé une fois ; accueil, Caisse et Rapports affichent les mêmes nombres.
- **API** : `GET /reports/chiffres?du&au&location_id` (vendu, nombre, encaissé par mode, remboursé, sorti, à crédit, marge) ; fonctions SQL ou service unique `ChiffresService.ts`. `/paiements/stats` cesse de servir l'accueil.
- **Tests** : la journée rejouée : encaissé 316 400 = somme des tiroirs ; MAG-1 et MAG-2 séparés ; acompte imputé le lendemain non recompté.
- **Fini quand** : un test compare les quatre écrans. **Dépend** : 05-D (vendu net), 04-A (dette), 08-D (modes). Livrable avant, puis branché. **Risque** : double déduction avoir et annulation (05-D).

### 23-D · Retirer le bruit (S, priorité 2)
- **Problème** : G1, G4, G6, B4.
- **Résultat** : l'accueil ne garde que ce qui sert le soir ; un seul endroit pour les créances.
- **Écran** : retirer de l'accueil objectif, prévision, comparaison annuelle, jours de la semaine, meilleurs clients (19-D), valeur par catégorie (15-A), commandes et demandes (écrans du dépôt et des achats), factures récentes, encaissements cumulés. Rapports : tableau des créances remplacé par un lien vers « Crédit clients » (fiche 06).
- **API** : supprimer `/reports/consolidated`, `/reports/revenue-trends`, `/reports/forecast`, `/reports/yoy`, `/factures/top-clients` (19-D), `taux_rotation` (15-A).
- **Fichiers** : `Dashboard.tsx`, `Reporting.tsx`, `reports.ts`, `ReportingController.ts`, `ReportingService.ts`, `api.ts`, tests.
- **Fini quand** : accueil sous 2 écrans au téléphone ; aucun appel mort. **Dépend** : rien. **Risque** : un client attaché à la prévision ; question 5.

### 23-E · L'accueil du patron en 10 secondes (M, priorité 3)
- **Problème** : section 3, B1.
- **Résultat** : une ligne par boutique : vendu, encaissé (Espèces, Wave, Orange…), à crédit, caisse (ouverte, attendu, écart). Sous elles : dette clients et part échue, ruptures par boutique, « Ce mois » (vendu, bénéfice quand 23-H existe, comparé au même jour du mois dernier). Choix « Aujourd'hui / Hier ».
- **Écran** : `ManagerHub` réécrit ; magasin unique : pas de colonne boutique (13-F) ; modules cachés respectés (25-E) ; bouton « Envoyer sur WhatsApp » si 08-L avancé.
- **API** : `GET /reports/accueil?date=` (une requête, construite sur 23-C).
- **Tests** : rendu 390 et 1440 sur la journée rejouée ; gérant limité à ses boutiques selon la question 1.
- **Fini quand** : les sept réponses de la section 3 visibles sans défiler au téléphone. **Dépend** : 23-C, 23-D. **Risque** : question 53 (gérant multi-boutiques).

### 23-F · « À traiter » qui dit vrai (S, priorité 3)
- **Problème** : G2, G3, B3.
- **Résultat** : factures échues dès l'échéance, en nombre et en francs ; caisse de la veille non clôturée, par boutique ; écart de caisse en francs et par boutique ; ruptures de chaque boutique.
- **Fichiers** : `ReportingService.getAlerts`, `Dashboard.tsx` (`AttentionBanner`).
- **Tests** : facture échue d'hier listée ; message « rien à traiter » seulement si tout est à 0.
- **Dépend** : 06-D (échéance). **Plus tard** : grosse remise (après 03-B et 24-I), alerte poussée.

### 23-G · Rapports « Ventes » (M, priorité 4, deux étapes)
- **Problème** : B1, section 6.
- **Résultat** : je sais qui vend, quoi, où.
- **Étape 1** : périodes en un geste (aujourd'hui, hier, 7 jours, ce mois, mois dernier, choisir) ; boutique ; vues par jour, produit, catégorie, vendeur (`cree_par`, rempli sur les 107 factures du jour) ; client hors comptoir ; export CSV (format de 12-F).
- **Étape 2** : par heure ; comparaison avec la période précédente.
- **API** : `GET /reports/ventes?du&au&location_id&par=jour|produit|categorie|vendeur|client|heure`, sur 23-C.
- **Tests** : sommes par vue = vendu de 23-C ; ventes du vendeur = ses factures.
- **Dépend** : 23-A, 23-C, 03-E (qui voit les montants). **Risque** : lenteur à 400 000 lignes : index `factures(location_id, date_facture)`.

### 23-H · Le résultat du mois (M, priorité 4)
- **Problème** : B2.
- **Résultat** : « ce mois, j'ai gagné tant », par boutique.
- **Écran** : « Compte de résultat » renommé « Résultat du mois » : vendu net, coût des ventes, marge, pertes (15-D), dépenses par nature, **bénéfice** ; mois par mois, mois précédent à côté.
- **API** : `GET /reports/resultat?mois&location_id`.
- **Tests** : la journée rejouée : dépense de 3 000 et avoir de 5 000 déduits.
- **Dépend** : 05-D, 15-B, 15-D, 09-F (dépenses par boutique), question 2. **Risque** : salaires payés hors ERP absents ; le dire sur l'écran.

### 23-I · Vendeur : mes ventes du jour (S, priorité 8)
- **Problème** : section 3.
- **Résultat** : le vendeur voit ses ventes du jour (nombre, total), sans celles des autres.
- **Fichiers** : `Dashboard.tsx` (`MagasinHub`), filtre `cree_par` de 23-B.
- **Dépend** : 23-B, question 4.

### 23-J · TVA collectée (S, priorité 5)
- **Problème** : section 7.
- **Résultat** : l'assujetti lit son chiffre HT et sa TVA par taux pour le mois ; le non-assujetti ne voit rien.
- **Écran** : onglet Rapports « TVA », caché si la TVA est désactivée ; export CSV.
- **Dépend** : 03-K. **Risque** : avoir d'un mois sur une facture d'un autre (05-D).

## 9. Questions

1. Le gérant voit-il toutes les boutiques sur l'accueil (question 53) ? Proposé : ses boutiques seulement.
2. Bénéfice : dépenses payées dans le mois (proposé) ou engagées ? Salaires compris (question 19) ?
3. Avancer au premier mois le bouton WhatsApp du rapport du soir (08-L) ? Proposé : oui.
4. Le vendeur voit-il ses ventes ? Celles de ses collègues ? Proposé : les siennes.
5. Supprime-t-on prévision et comparaison annuelle ? Proposé : oui, comparaison remise après 12 mois de données.
6. Accueil d'un assujetti : chiffres TTC (proposé) ou HT ?
7. Le rôle « lecteur » garde-t-il un accueil (fiche 24) ?
