# 21 Trésorerie

> **Contre-expertise du 2026-11-27** ([détail](../vagues/vague-8-contre-expertise.md)) : Verdict maintenu, autre forme : la carte « Argent » est un bloc de l'accueil 23-E (une requête), sans service séparé ; 21-B en deux étapes (module masqué, puis page retirée après 23-E). 21-A absorbe 09-D et doit passer après 16-A et 04-A : la commande crée une facture fournisseur liée à reste 0, et sans 06-D tout crédit serait en retard le lendemain. 21-D est absorbé par 13-H et 21-C, 21-E par 23-J. G1 n'est pas reproductible : l'échéance est le jour de la facture. Les propriétaires de lots sont tranchés dans [01-SUIVI.md](../01-SUIVI.md).

Audit du 2026-11-27, sur la base jetable `nolyx_audit_3` (API 6143, interface 6153), avec l'interface et l'API réelles. Montants en FCFA. Pour rejouer une journée propre, j'ai clôturé la caisse du banc (session 2, ouverte le 25/11, comptée à l'attendu : 60 000, écart 0) et ouvert la mienne (session 3, Boutique Audit, fonds 100 000), laissée ouverte.

## 1. Verdict

**Fusionner.** La page « Trésorerie » disparaît : elle ne dit ni combien le commerçant a ni où, et ses prévisions sont fausses (la moitié de ce que doivent les clients manque, les factures fournisseur aussi, des dépenses déjà payées y sont « prévues »). Ce qui sert devient la carte « Argent » de l'accueil du patron (fiche 23) : l'argent d'aujourd'hui, puis à encaisser et à payer sur 7 jours ou 4 semaines. Les soldes banque, Wave et Orange arrivent ensuite, avec les comptes d'argent de la caisse (08-J).

## 2. Utilité

| | Général | Informatique | Habillement | Alimentaire / grossiste | Un magasin | Plusieurs sites |
|---|---|---|---|---|---|---|
| Besoin (où est l'argent, ce qui vient) | 3 | 4 | 2 | 5 | 3 | 4 |
| Page actuelle | 0 | 1 | 0 | 1 | 0 | 1 |

Le besoin est réel chez celui qui fait crédit dans les deux sens (grossiste, informatique). La page actuelle vaut 0 ou 1 : ses chiffres trompent. Habillement : surtout des espèces et du Wave, la caisse répond déjà.

| | Magasin unique | Plusieurs sites |
|---|---|---|
| Habillement, général | Carte « Argent » de l'accueil, sans prévision par semaine | Carte, une ligne par boutique et un total |
| Informatique | Carte avec « 7 jours » | Carte avec « 4 semaines » |
| Alimentaire / grossiste | Carte avec « 4 semaines » | Carte avec « 4 semaines », puis soldes des comptes (21-C) |

Dans aucun cas une page à part avant les comptes d'argent. Ensuite, le détail par compte vit dans la Caisse (08-J), pas dans une « Trésorerie ».

## 3. Parcours réel

**Rôles.** Admin et gérant : menu « Gestion », « Trésorerie », 1 clic, aucune erreur (1 440 et 390 px). Caissier, vendeur, dépôt, lecteur : « Accès réservé » à l'écran, 403 par l'API. Conforme.

**La journée rejouée par l'ERP** (gérant et caissier, 27/11, un vendredi), vue « 30 jours ».

| Geste | Trésorerie | Ce qui est vrai |
|---|---|---|
| Ventes comptoir 10 000 espèces et 7 000 Wave | Inchangée | Normal, déjà encaissé |
| Facture à crédit de 150 000 à 30 jours (FAC-2026-00204), 50 000 payés par virement | Absente de « 30 jours » ; 100 000 à « 60 jours » | Doit être dans « 30 jours » |
| Facture fournisseur de 400 000 à payer le vendredi 4/12 (FF-2026-00005) | **Inchangée** | 400 000 à payer semaine du 4/12 |
| Commande fournisseur en brouillon de 150 000 (CMD-2026-00007) | **+150 000** semaine du 4/12 | Rien n'est dû |
| Taxi de 15 000 payé en espèces (DEP-2026-00013) | **+15 000** « prévus » le 27/11 | Déjà sorti du tiroir |
| Facture CIE de 20 000 en Wave datée du 2/12 (DEP-2026-00014) | +20 000 le 2/12 | Payée ou non ? L'ERP ne le sait pas |
| Versement de 40 000 du tiroir à la banque | Inchangée | Normal |
| Paiement fournisseur de 100 000 en espèces (FF-2026-00003) | Inchangée | Le tiroir aussi est inchangé (18-B) |

**« Combien j'ai, où ? »** La trésorerie ne le dit pas. Le patron doit aller dans Caisse, choisir chaque boutique et lire « espèces attendues » (2 gestes par boutique) ; le Wave n'y est qu'un « encaissé depuis l'ouverture », pas un solde ; la banque n'existe que dans la balance comptable, fausse. L'accueil du gérant affiche seulement « Caisses ouvertes : 1 sur 2 ».

**« Pourrai-je payer mon fournisseur vendredi ? »** La page annonce un « solde net prévisionnel » de **+9 706 570** et, pour la semaine du 4/12, 448 780 entrées contre 150 000 sorties. La facture de 400 000 due ce jour-là n'y est pas, l'argent en caisse non plus. Réponse : aucune réponse juste.

**Mobile (390 px)** : lisible, rien ne déborde, page longue (2 568 px). Aucune ligne n'ouvre sa facture.

## 4. Défauts prouvés

### Argent

**D1. Les factures clients en retard disparaissent.** La prévision ne lit que les échéances à partir d'aujourd'hui (`ComptabiliteService.ts:159`). Sur le banc : 40 factures en retard pour 10 309 240, absentes. L'accueil affiche « Reste à encaisser : 20 797 785 », la trésorerie à 90 jours 10 488 545 : l'écart est exactement le retard. Écran. Règle prouvée par le code ; montants issus des données du banc. Aggravé par le délai « 30 jours » lu comme « immédiat » : la facture est en retard dès le lendemain (03-F, `delai_jours`).

**D2. Les factures fournisseur n'y sont jamais.** FF-2026-00005 (400 000, due le 4/12), créée par l'API : décaissements 596 975 avant, 596 975 après. Aussi absentes : FF-2026-00003 (reste 114 246, due ce jour) et FF-2026-00001 (369 540, en retard). La requête ne lit que `commandes_fournisseur` (`ComptabiliteService.ts:165-180`). Écran. Revérifie la vague 4.

**D3. Une commande en brouillon compte comme une sortie sûre ; une commande en retard disparaît.** CMD-2026-00007, « en attente », 150 000 : +150 000 semaine du 4/12 (filtre `statut NOT IN ('livree','annulee')`, l.174). CMD-2026-00005, validée, 1 910 470, livraison prévue le 10/11 : absente (l.176). Sa création a aussi produit FF-2026-00006 (total 150 000, reste 0, sans échéance) : c'est 16-A. Écran.

**D4. Une dépense payée est « prévue ».** DEP-2026-00013, 15 000 espèces, sortie du tiroir (mouvement 5, session 3) : +15 000 aux décaissements prévus. Une dépense datée du futur est acceptée (DEP-2026-00014, Wave, ni session ni mouvement). Écran. Revérifie 09-D.

**D5. Un « solde » sans point de départ.** « Solde net prévisionnel » = entrées prévues − sorties prévues (`Tresorerie.tsx:170`) ; ni caisse ni banque. Avec un coffre plein et une seule facture fournisseur, la page afficherait « Trésorerie négative prévue » en rouge (l.333-336). La courbe « solde cumulé » part de 0. Écran.

**D6. Les salaires n'existent pas.** Aucune lecture de `payroll_runs` (`ComptabiliteService.ts:148-195`). Une paie marquée payée ne crée ni mouvement ni écriture (`PayrollService.ts:313-330`) : pour la fiche 20.

**D7. Le même argent, quatre chiffres** (mouvements du 27/11).

| | Caisse (Boutique Audit) | Comptabilité | Vrai, d'après mes gestes |
|---|---|---|---|
| Espèces | 100 000 → 55 000 (−45 000) | Compte 53 : **+5 000** | −45 000 |
| Banque | rien | Compte 51 : +40 000 | **+90 000** (40 000 versés, 50 000 virés) |
| Wave | 7 000 encaissés | Compte 54 : +7 000 | +7 000 |
| Clients me doivent | — | — | Accueil 20 797 785, trésorerie 10 488 545 |

Le virement client de 50 000 est passé au compte 53 « Caisse (espèces) » (écritures du jour : 53 débit 60 000 = 10 000 + 50 000). Le paiement fournisseur de 100 000 en espèces n'a ni session ni mouvement (`paiements_fournisseur` 4). Propriétaires : 08-D et 07-F (compte par mode), 18-B, fiche 22. Écran.

### Blocage

**B1. La question du commerçant n'a pas de réponse.** Ni l'argent présent (D5), ni les factures fournisseur (D2), ni les salaires (D6). Aucun écran ne donne un total « espèces + Wave + Orange + banque ».

### Gêne

- **G1.** La vue « 30 jours » exclut le 30ᵉ jour : FAC-2026-00204, vendue aujourd'hui à 30 jours, n'y est pas (`< CURRENT_DATE + horizon`, l.160).
- **G2.** Les lignes ne s'ouvrent pas (`Tresorerie.tsx:111-129`) : impossible de relancer ou de payer depuis la liste.
- **G3.** Semaines glissantes du vendredi au jeudi, pas du lundi au dimanche.
- **G4.** Visible par défaut dans les quatre profils (`profilsActivite.ts:25-54`) ; masquée seulement au menu, l'API répond encore (25-E).
- **G5.** Aucun filtre par boutique.
- **G6.** `?jours` non validé (`comptabilite.ts:59`, « abc » donne 90 sans erreur) ; sans danger, l'horizon est borné à 366.
- **G7.** Le seul test (`Tresorerie.test.ts`) insère en SQL et ne contrôle que la ventilation par semaine : rien sur le retard ni les fournisseurs.

**Réparé, vérifié** : l'échéancier hebdomadaire ne vaut plus 0. Les semaines somment aux totaux (10 488 545 et 781 975).

## 5. Comparaison

| | Ce qu'ils font mieux | Ce qu'on fait mieux |
|---|---|---|
| Odoo | Journaux caisse et banque, rapprochement avec le relevé (connaissance générale, non relue) | — |
| Sage 100 GC | Rien de trouvé dans la gestion commerciale ; trésorerie vendue à part (non vérifié) | — |
| Loyverse | Rien hors caisse ([faits/concurrents.md](../faits/concurrents.md), §21) | Créances et dettes à venir |
| Karnet, cahier de dettes | Simple : qui me doit quoi | Dettes fournisseur et caisse au même endroit |

Attente de la cible (hypothèse, [concurrents.md](../faits/concurrents.md) §21) : « où est mon argent » (chaque caisse, coffre, banque, Wave, Orange, MTN, Moov), virements internes, dettes et créances à venir. Aucun outil local trouvé ne réunit les trois. Une carte juste sur téléphone serait un avantage réel ; une page fausse est pire que rien.

## 6. Manques

| Manque | Pour qui | Quand |
|---|---|---|
| Espèces de chaque tiroir sur l'accueil du patron | Tous | Premier mois (21-B) |
| À encaisser et à payer justes, retard compris | Grossiste, informatique | Premier mois (21-A) |
| Versement banque, remise au patron avec accusé | Tous | 08-B (nature) au premier mois ; accusé avec 08-J |
| Retrait du patron (argent pris pour lui, ni charge ni achat) | Tous | Nature de sortie, 09-E |
| Soldes banque, Wave, Orange (relevé saisi) | Plusieurs sites, grossiste | Après 08-J (21-C) |
| Rapprochement avec un relevé bancaire importé | Grossiste | Plus tard |
| Loyer, prêt, tontine en sorties prévues (tontine : supposé) | Tous | Plus tard |
| Chèques à encaisser, date de valeur | Informatique | Plus tard |

## 7. TVA, FNE, mobile money, WhatsApp

- **TVA optionnelle.** Le non-assujetti n'en voit rien. L'assujetti reverse chaque mois sa TVA nette : c'est une sortie certaine, à ajouter aux « à payer » (21-E, après 03-K). Date de dépôt selon son régime : à régler avec son comptable.
- **FNE.** Aucune incidence : certifier une facture ne déplace pas d'argent.
- **Mobile money.** Aujourd'hui Wave, Orange et MTN se mélangent au compte 54 (`CaisseMagasinService.ts:564`) ; aucun numéro marchand, aucun solde, frais invisibles. Terrain : un compte d'argent par numéro marchand et par boutique, un relevé saisi à la main (ce que montre l'appli Wave Business), les frais et reversements comme mouvements. Wave expose déjà un solde et les transactions du jour par API ([faits/mobile-money.md](../faits/mobile-money.md) §2) : la colonne « source du relevé » (saisie ou API) suffit à préparer l'automatisation (21-D).
- **WhatsApp.** Le rapport du soir (08-L) porte déjà le bouton `wa.me` ; la carte « Argent » n'en a pas besoin.

## 8. Lots proposés

### 21-A · Les prévisions disent vrai (S, priorité 1)
- **Problème** : D1, D2, D3, D4, D6, G1, G6. **Résultat** : « à encaisser » = dette client réelle, retard compris ; « à payer » = factures fournisseur, commandes validées non facturées, paie validée ; rien de déjà payé.
- **API** : `getTresoreriePrevisionnelle` : factures `remaining_due > 0`, non annulées, retard ou échéance vide → jour 0 avec `en_retard: true` ; `factures_fournisseur` `reste_due > 0`, ni payée ni annulée, même règle ; commandes `validee` ou `expediee` sans facture non annulée liée (`NOT EXISTS`), retard → jour 0 ; `payroll_runs` `valide` à `date_fin` (si la paie reste, fiche 20) ; dépenses retirées (absorbe 09-D, qui refuse aussi les dates futures) ; horizon inclusif ; `validateQuery` sur `jours` (1 à 366).
- **Écran** : « dont en retard » sous chaque total ; « Factures et commandes fournisseur ». **Base** : rien.
- **Fichiers** : `ComptabiliteService.ts:140-241`, `routes/comptabilite.ts:57-66`, `schemas.ts`, `Tresorerie.tsx`, `Tresorerie.test.ts`.
- **Tests** (par les services, pas d'insertion SQL) : facture en retard en semaine 1 ; facture fournisseur à J+7 en semaine 2 ; commande en brouillon absente ; commande validée avec sa facture comptée une fois ; dépense du jour : rien ; paie validée comptée, payée : rien ; facture à J+30 dans « 30 jours ».
- **Fini quand** : la journée de la section 3 rejouée donne à encaisser = « Reste à encaisser » de l'accueil, et FF-2026-00005 dans la semaine du 4/12.
- **Dépend de** : rien ; 16-A simplifie la règle des commandes. **Risque** : vieilles dettes douteuses qui gonflent « à encaisser » → « dont en retard » visible.

### 21-B · « Argent » sur l'accueil, la page Trésorerie part (M, priorité 2, deux étapes)
- **Problème** : D5, B1, G2, G4, G5. **Résultat** : sur téléphone, en 10 secondes : « Espèces dans les caisses : 55 000 (Boutique Audit) · Encaissé aujourd'hui : Wave 7 000, virement 50 000 · Cette semaine : à encaisser X dont Y en retard, à payer Z ».
- **Étape 1 (S)** : module `tresorerie` masqué par défaut dans les quatre profils, bases neuves comprises (`ci-ref-data.sql`), en attendant 25-E.
- **Étape 2 (M)** : carte « Argent » (admin, gérant). Bloc « Aujourd'hui » : espèces attendues par caisse ouverte (calcul de `getCloturePreview`), dernier compté pour une caisse fermée, total ; encaissé du jour par mode ; mention « Banque, Wave, Orange : soldes non suivis » jusqu'à 21-C. Bloc « À venir » : 7 jours ou 4 semaines selon le profil (section 2), en partant des espèces connues ; chaque ligne mène à la liste filtrée (06-B « Crédit clients », 18-I « À payer »). Magasin unique : ni ligne par boutique ni total.
- **API** : `GET /argent/resume` (admin, manager) : position + prévision de 21-A. `/comptabilite/tresorerie` retiré.
- **Fichiers** : nouveaux `ArgentService.ts`, `routes/argent.ts`, `components/dashboard/ArgentCard.tsx` ; `Dashboard.tsx` ; retrait de `Tresorerie.tsx`, `App.tsx:72,122` (redirection `/tresorerie` → `/`), `routeAccess.ts:164`, `navConfig.tsx:117`, `modules.ts:233-238` ; `profilsActivite.ts`.
- **Tests** : la carte affiche 55 000 comme la caisse ; caissier 403 ; un magasin sans total multi-sites ; 390 px sans défilement horizontal.
- **Fini quand** : « pourrai-je payer vendredi » se lit sur un écran : espèces connues + à encaisser − à payer jusqu'à vendredi.
- **Dépend de** : 21-A ; 08-D (Wave complet dans la session) ; place sur l'accueil : fiche 23. **Risque** : « espèces attendues » lues comme sûres → garder le mot « attendues » et l'écart de la dernière clôture.

### 21-C · Soldes banque, Wave, Orange : le relevé du patron (M, priorité 4, après 08-J étape 1)
- **Problème** : aucune position hors espèces ; compte 51 à +40 000 pour +90 000 réels (D7). **Résultat** : chaque compte d'argent a un solde calculé et un solde relevé ; l'écart et l'âge du relevé s'affichent.
- **Base** : sur `comptes_argent` (créée par 08-J) : `solde_initial`, `date_solde_initial` ; table `releves_compte` (compte, date, solde lu, saisi par, photo, écart figé).
- **API** : `POST /comptes-argent/:id/releves` (admin, manager) ; `GET /comptes-argent` avec solde calculé = initial + mouvements du compte. **Écran** : carte « Argent » complète, bouton « Relever le solde ».
- **Étapes** : (1) solde initial à la création (assistant 25-C) ; (2) relevé et écart ; (3) alerte si dernier relevé de plus de 7 jours.
- **Tests** : banque initiale 500 000, versement 40 000, virement client 50 000 → calculé 590 000 ; relevé 588 500 → écart −1 500.
- **Fini quand** : la carte donne un total « tout compris » avec la date du relevé de chaque compte.
- **Dépend de** : 08-J étape 1, 08-D, 07-F (compte par mode). **Risque** : solde initial faux = écart permanent ; afficher l'âge du relevé.

### 21-D · Mobile money : terrain du solde marchand (S, priorité 6)
- **Problème** : Wave, Orange et MTN confondus au 54 ; aucun numéro marchand ; frais invisibles. **Résultat** : un compte par numéro marchand et par boutique ; frais et reversements visibles ; prêt pour l'API Wave.
- **Base** : `comptes_argent.operateur` (wave, orange, mtn, moov), `numero_marchand`, `magasin_id`, `api_cle_ref` (référence, jamais la clé) ; `releves_compte.source` (`saisie`, `api`) ; nature de sortie « frais opérateur » (09-E) ; reversement Wave → banque = transfert de 08-J.
- **Étapes** : colonnes et fiche du compte ; mode de paiement relié au compte de la boutique (13-H) ; frais saisis au relevé pour expliquer l'écart.
- **Fichiers** : migration, `TransfertArgentService.ts` (08-J), écran des comptes.
- **Tests** : 20 000 encaissés en Wave, frais saisis → écart expliqué à 0.
- **Fini quand** : le relevé Wave d'une journée tombe juste à la main.
- **Dépend de** : 21-C, 13-H, 07-F. **Risque** : frais Wave en Côte d'Ivoire non vérifiés ([mobile-money.md](../faits/mobile-money.md) l.35).

### 21-E · TVA à reverser dans « à payer » (S, priorité 5)
- **Problème** : l'assujetti reverse chaque mois sa TVA nette, sortie certaine et absente. **Résultat** : ligne « TVA de novembre » à la date réglée ; rien pour le non-assujetti.
- **Base** : `company_settings.tva_jour_depot` (réglage posé par 03-K). **API** : `ArgentService` : TVA collectée − déductible du mois échu (calculs de 03-K).
- **Fichiers** : `ArgentService.ts`, `ArgentCard.tsx`. **Tests** : assujetti, non assujetti, mois sans vente.
- **Fini quand** : la ligne égale la déclaration du mois. **Dépend de** : 03-K, 21-B. **Risque** : régime fiscal à confirmer par le comptable.

**Plus tard** (une ligne chacun) : loyer, prêt et tontine en sorties prévues répétées ; rapprochement par import du relevé bancaire ; promesses de paiement dans la prévision (06-F) ; chèques et date de valeur ; graphique sur 90 jours ; solde Wave lu par l'API (chantier 9).

**À transmettre** : fiche 20, paie payée sans mouvement ni écriture (`PayrollService.ts:313-330`) ; fiche 22, virement client au 53 et fonds de caisse jamais passé, donc compte 53 ≠ tiroir ; fiche 23, l'accueil du gérant ne montre pas les espèces des caisses (« Caisses ouvertes : 1 ») ; fiche 16, une commande en brouillon crée une facture fournisseur à reste 0 et sans échéance (FF-2026-00006).

## 9. Questions

1. **Question 69** : la page Trésorerie disparaît (proposé) et la carte « Argent » reste visible au patron dans tous les profils ? Si la page est gardée, 21-A suffit, mais elle reste sans point de départ.
2. Le gérant voit-il l'argent de toutes les boutiques et la banque, ou seulement sa boutique (rejoint la question 53) ?
3. Factures clients en retard : comptées « à encaisser cette semaine » (proposé), ou à part, sans date ?
4. Soldes banque et Wave : relevé saisi par le patron dès 08-J (proposé), ou rien avant l'automatisation ?
5. Retrait du patron et tontine : faut-il les suivre ? (tontine : supposé, aucun commerçant interrogé)
6. Horizon de la carte : 7 jours pour tous, 4 semaines pour grossiste et informatique (proposé) ?
