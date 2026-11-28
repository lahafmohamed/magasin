# 09 Dépenses

> **Contre-expertise du 2026-11-26** ([détail](../vagues/vague-2-contre-expertise.md)) : Verdict maintenu, à condition que 09-F et 08-B fassent un seul dialogue. D1 : réel, mais les deux clics doivent tomber à moins de 15 ms d'écart. Les propriétaires de lots sont tranchés dans [01-SUIVI.md](../01-SUIVI.md).

Audit du 2026-11-25, sur la base jetable `nolyx_audit_3`, avec l'interface et l'API réelles. Montants en FCFA.

## 1. Verdict

**Fusionner.** La saisie devient une action « Sortie d'argent » de la Caisse ; la page Dépenses reste au gérant pour voir, contrôler et corriger. Le tiroir est juste quand tout va bien, mais **aucun chiffre de bénéfice ne compte les dépenses**, celles qui sont payées hors espèces ne sortent de nulle part, et n'importe quel vendeur efface le loyer du patron.

## 2. Utilité

| | Général | Informatique | Habillement | Alimentaire / grossiste | Un magasin | Plusieurs sites |
|---|---|---|---|---|---|---|
| Besoin | 5 | 4 | 5 | 5 | 5 | 5 |
| Réponse actuelle | 2 | 2 | 2 | 1 | 2 | 1 |

Grossiste : 1, le transport n'entre pas dans le coût du stock. Plusieurs sites : 1, ni vue « tous magasins », ni dépense de dépôt ou de siège.

## 3. Parcours réel

| Rôle | À l'écran | Ce qui surprend |
|---|---|---|
| Caissier, vendeur | Saisissent, voient et **suppriment** toutes les dépenses de leur magasin | Voient loyer et salaires ; aucun plafond |
| Gérant, admin | Idem, un magasin à la fois | Magasin à choisir à chaque visite |
| Dépôt, lecteur | Pas d'accès ; création par l'API refusée (403) | Le lecteur peut lire par l'API |

**Ce qui marche (rejoué, une personne à la fois, espèces, caisse ouverte).**

| Action | Tiroir attendu | Compte 53 | Compte 604 |
|---|---|---|---|
| Départ | 60 000 | 10 000 | 0 |
| Dépense 5 000 | 55 000 | 5 000 | 5 000 |
| Corrigée à 6 000 (API) | 54 000 | 4 000 | 6 000 |
| Passée en Wave (API) | 60 000 | 10 000 | 0 |
| Repassée en espèces (API) | 54 000 | 4 000 | 6 000 |
| Supprimée | 60 000 | 10 000 | 0 |

Les comptes 53 et 604 ne bougent que si `CAISSE_GL_POSTING=true` (cas du banc ; désactivé par défaut, donc aucune écriture chez un client neuf). Autre magasin : 403. Caisse fermée : refus clair. Double clic : une dépense.

**Ce qui bloque.**
- **Corriger** : aucun bouton, il faut supprimer et refaire. Après la clôture : impossible pour tous, admin compris, même la catégorie (422).
- **Payer en espèces sans le tiroir** (loyer payé par le patron, caisse fermée) : refusé (422). Il faut mentir sur le mode ou fausser le tiroir.
- **Photo du reçu** : impossible à l'écran.
- **Combien ce mois, par catégorie ?** Pas de réponse : « 41 dépenses · 15 410 FCFA **sur cette page** » (capture `dep-gerant-liste.png`). Aucun export.
- **Client neuf** : 10 catégories, 0 ligne `magasins` : personne ne peut saisir (cadrage, fiche 28).

**Téléphone (390)** : depuis la Caisse, 6 touchers et 2 saisies ; 4 et 1 suffiraient. Liste : 5 975 px pour 20 dépenses. « Créer » et « Annuler » : 36 px de haut, 0 px d'écart.

## 4. Défauts prouvés

### Argent

| N° | Fait | Preuve | Où |
|---|---|---|---|
| D1 | **Supprimer sur deux écrans en même temps rend l'argent deux fois.** 500 000 supprimés par caissier et vendeur : −478 400 → **+521 600** au lieu de 21 600. API, 5 envois : 4 000 rendus 5 fois | Capture `caisse.png` ; `DepenseServiceV2.ts:385` lit sans verrou | Écran (même instant) |
| D2 | **Réponse perdue, nouvel essai : 2 dépenses, 2 sorties de 3 700.** L'écran dit « Serveur injoignable » alors que tout est enregistré | DEP-00072 et 00073 ; aucune clé d'unicité | Écran |
| D3 | Deux corrections ensemble : la dépense dit 2 000, le tiroir n'a rien perdu (−3 000 +3 000 −1 000 +3 000 −2 000) | Tiroir 75 399 avant et après ; `DepenseServiceV2.ts:193` | API |
| D4 | **Les dépenses hors espèces ne sortent de nulle part** : 8 dépenses, 238 150 F, soit 58 % du mois saisi ; 0 mouvement, 0 écriture, 0 compte | SQL ; `DepenseServiceV2.ts:127` | Écran |
| D5 | **Aucun résultat ne compte les dépenses.** De 142 161 à 425 211 F de dépenses, la marge du mois reste 6 370 894. « Compte de résultat » s'arrête à la marge ; ni « dépense » ni « bénéfice » sur l'accueil du gérant | Captures `reporting.png`, `dash.png` ; `ReportingService.ts` ne lit pas `depenses` | Écran |
| D6 | **La trésorerie « prévoit » des dépenses déjà payées** : 40 du jour, 266 781. Demain elles disparaissent | `ComptabiliteService.ts:191` (`date_depense >= CURRENT_DATE`) | Écran |
| D7 | **Un caissier sort 500 000 d'un tiroir de 21 600** : « enregistrée », espèces attendues **−478 400** | Capture `m-caisse-negatif.png` | Écran |
| D8 | **Un vendeur supprime le loyer du gérant** (293 000, virement, octobre). Par l'API, il ramène 300 000 à 30. Le journal note la suppression sans montant ni motif ; **la modification n'y figure pas**, et ses 9 mouvements n'ont pas d'auteur | DEP-00078 ; `audit_log` ; `DepenseControllerV2.ts:171` ; `routes/depenses.ts:24` | Écran (suppression), API (modification) |
| D9 | **Une annulation compte comme un encaissement** : « Encaissé depuis l'ouverture : 1 013 500 », sans une vente dans la session | Capture `m-hub-caissier.png` | Écran |
| D10 | **Dépense espèces antidatée : le tiroir d'aujourd'hui paie.** Datée du 01/10, elle sort le 25/11, écriture comprise. L'écart d'hier, déjà expliqué, reviendrait à l'envers (déduit) | Tiroir avant/après | API (même formulaire) |
| D11 | Après clôture, 15 000 tapés pour 1 500 restent à vie. Seule issue : « Autre entrée » de 13 500, qui devient un **produit** (75) | Balance ; `CaisseMagasinService.ts:574` | API (mêmes actions à l'écran) |
| D12 | **Le retrait du patron est une charge** (20 000 au compte 65), son apport un produit (lu) | Balance ; `CaisseMagasinService.ts:573-581` | API (idem) |
| D13 | PDF « Compte de résultat » : charges de −331 168 (effet de D1), aucune vente ; loyer, taxi et salaire en « 604 Achats stockés » | PDF du 25/11 ; `compte_comptable_id` vide et jamais lu | Écran |

**Recouvrements.**
- **Paie (20)** : payer 100 000 bruts en espèces ne bouge rien (521 600 avant et après). Il faut aussi une dépense « Salaires » : deux saisies, aucun lien.
- **Factures fournisseur (18)** : règlement de 50 000 en espèces, tiroir inchangé (425 600). Contournement naturel : une dépense « Divers ». Elle sort du tiroir (375 600), mais **compterait la marchandise deux fois** dans « marge − dépenses ».
- Pas de doublon aujourd'hui, parce que rien n'entre dans le résultat. Corriger D5 sans trier les sorties le créerait.

### Blocage et gêne

| N° | Fait | Où |
|---|---|---|
| D14 | Deux dépenses espèces ensemble : 6 paires sur 10 ont une « Erreur serveur ». PostgreSQL compte 8 blocages mutuels pour 8 erreurs ; cause déduite : l'insertion retient la session, puis `FOR UPDATE` l'attend. Une paire essayée à l'écran : pas d'échec | API |
| D15 | `GET /depenses/:id` : toujours 500 (`DepenseServiceV2.ts:457`, colonne `numero_session` disparue) ; pas de fiche possible | API |
| D16 | Caisse ouverte depuis plus de 24 h : modifier serait refusé même à l'admin (lu, non rejoué) | API |
| D17 | Session clôturée : la corbeille est là, la confirmation promet « remis au solde de la caisse ouverte », puis refus | Écran |
| D18 | Acceptés : dates 2027 et 1990, 0,5 F (03-B), description d'espaces | API ; calendrier sans limite (lu) |
| D19 | Date invalide, montant géant, fournisseur inconnu, page −1 : 500 | API |
| D20 | Recherche sans le bénéficiaire ; pas de filtre par mode | Écran |
| D21 | Caisse : « Dépense DEP-… — Transport », sans description ni bénéficiaire | Écran |
| D22 | Le dépôt lit le reçu du magasin 1 ; un fichier s'attache à une dépense inexistante | API |

## 5. Comparaison

Source : [faits/concurrents.md](../faits/concurrents.md).

| | Eux | Nous |
|---|---|---|
| Odoo | Sortie de caisse motivée ; notes de frais approuvées | Catégorie obligatoire, ni accord ni reçu |
| Sage | Dépense en comptabilité | Plus simple pour un commerçant |
| Loyverse | « Pay out » sans catégorie | Mieux rangé |
| Outils locaux | Dépenses du jour, catégories ; bénéfice du jour | **Aucun bénéfice** |

Minimum du marché : dépense depuis la caisse, catégorie, photo, effet sur le tiroir **et le bénéfice**, répétition mensuelle. Nous avons la catégorie et le tiroir.

## 6. Manques, par profil

Aujourd'hui tout devient « dépense » ou « autre sortie ». Il faut :

| Le commerçant dit | Ce que ça doit faire | Dans le bénéfice ? |
|---|---|---|
| Taxi, CIE, loyer | Dépense | Oui |
| J'ai acheté de la marchandise | Achat : stock et coût montent | Par le coût |
| J'ai payé un fournisseur | Régler sa facture, argent sorti | Non |
| Camion de l'arrivage | Frais de la réception | Par le coût |
| Le patron a pris 20 000 | Retrait du patron | Non |
| Avance à la vendeuse | Avance à déduire de la paie | À la paie |
| Porté à la banque, au coffre | Transfert | Non |

**Fusionner la porte, séparer les natures, guider par des mots simples.**

| Profil | Manque du premier mois |
|---|---|
| Tous | Bénéfice du mois ; photo ; corriger ; payer sans le tiroir |
| Grossiste, habillement | Frais d'approche vers la réception (17) ; achat au marché payé comptant (17/18) |
| Informatique | Pièces de réparation : achat ou sortie de stock, pas dépense |
| Plusieurs sites | Vue tous magasins ; dépense d'un dépôt ou du siège |

**Catégories** : dix, figées ; ni écran ni API pour en créer ou désactiver. Absentes (besoin **supposé**) : taxes et patente, carburant, gardiennage, emballages, manutention, frais mobile money.

**Plafond et accord** : utiles dès le premier mois, le patron est souvent absent. Jamais plus que le tiroir. Au-dessus d'un montant, **enregistrer et alerter** plutôt que bloquer : l'argent est déjà sorti, un blocage pousse à ne rien saisir (question 1).

**Plus tard** : rappels de loyer, CIE, SODECI, internet (« Refaire » suffit d'abord) ; budgets ; validation à plusieurs niveaux ; lecture automatique du reçu.

## 7. TVA, FNE, mobile money, WhatsApp

- **TVA** : si assujetti (03-K), champ « dont TVA » facultatif. Sinon rien.
- **FNE** : rien à certifier, nous sommes acheteur. Garder le numéro de la facture reçue et la photo : charge non admise sans FNE (`faits/fne.md`, texte 5) ; portée exacte : comptable.
- **Mobile money** : référence (absente de `depenses`), Moov (07-F), frais de retrait, compte débité (21).
- **WhatsApp** : bouton `wa.me` sur la dépense à valider. Rien d'automatique.

## 8. Lots

Chaque lot : tests serveur avec base, tests écran, vérification au navigateur. Schéma : prochaine migration et `ci-baseline.sql` (`ci-ref-data.sql` pour les données). Fichiers communs : `DepenseServiceV2.ts`, `DepenseControllerV2.ts`, `schemas.ts`, `DepensesV2.tsx`, `api.ts` ; chaque lot cite les autres.

### 09-A — Une dépense ne bouge l'argent qu'une fois (S)
- **Problème** : D1, D2, D3, D14. **Résultat** : double saisie, coupure, deux écrans : tiroir juste.
- **Écran** : clé créée à l'ouverture du formulaire, gardée après une erreur réseau. **Base** : `depenses.cle_saisie` unique partielle, `empreinte_saisie`. **API** : même clé → dépense existante ; contenu différent → 409.
- **Étapes** : en création, verrouiller la session **avant** l'insertion, par la transaction ; en modification et suppression, `FOR UPDATE OF d` ; `idempotency_key` des mouvements (colonne existante) ; D15 et D19 en 400/422 français.
- **Fichiers** : communs. **Tests** : 5 suppressions, 2 corrections, 20 paires de créations simultanées ; réponse perdue.
- **Fini quand** : un seul mouvement net, zéro blocage. **Dépend de** : règle de 07-A. **Risque** : ordre des verrous avec 04 et 08 ; session en premier.

### 09-B — Qui peut sortir combien, qui peut effacer (M)
- **Problème** : D7, D8. **Résultat** : le patron absent reste maître de sa caisse.
- **Base** : `statut_controle` (`libre`, `a_valider`, `validee`, `contestee`), `valide_par`, `valide_le` ; réglage `plafond_depense_caissier` ; `categories_depenses.privee`.
- **API** : espèces > espèces attendues → 422 « La caisse n'a que 21 600 F » ; au-dessus du plafond → `a_valider` et notification gérant/admin ; `POST /depenses/:id/valider`, `/contester` (gérant, admin). Caissier et vendeur : leurs dépenses, session ouverte ; catégories privées (loyer, salaires) jamais renvoyées.
- **Écran** : puce « À valider ». **Étapes** : plafond du tiroir dans la transaction ; droits ; seuil ; liste.
- **Fichiers** : `routes/depenses.ts`, `NotificationService.ts`, `CompanySettings.tsx`. **Tests** : 500 000 refusé ; 80 000 à valider ; vendeur → 403 sur la dépense du gérant.
- **Fini quand** : D7 et D8 refusés, écran et API. **Dépend de** : A ; 24. **Risque** : ventes pas encore saisies → le message le dit.

### 09-C — Corriger et annuler sans effacer (M)
- **Problème** : D8 (trace), D9, D11, D16, D17. **Résultat** : une erreur se répare en deux gestes, même le lendemain, et se voit.
- **Écran** : fiche latérale : « Corriger », « Annuler » avec motif ; annulées visibles, barrées. **Base** : `annulee_le`, `annulee_par`, `motif_annulation` ; reprise de `deleted_at`.
- **API** : `POST /depenses/:id/annuler` remplace `DELETE` ; `PUT` journalise avant/après avec l'auteur et contrôle la période.
- **Étapes** : session ouverte → mouvement inverse marqué `annulation`, hors « encaissé » ; session close, gérant seul → « argent revenu » (entrée du jour liée à la dépense, pas un produit) ou « erreur de saisie » (aucun argent, écart expliqué) ; catégorie, note et photo toujours modifiables par le gérant.
- **Fichiers** : `CaisseMagasinService.ts`, `Dashboard.tsx`, `CaisseV2.tsx`. **Tests** : D11 rejoué ; journal complet ; encaissé inchangé.
- **Fini quand** : rien ne disparaît, chaque mouvement a un auteur. **Dépend de** : A, B ; 08. **Risque** : ne jamais réécrire une clôture.

### 09-D — La trésorerie ne prévoit plus le passé (S)
- **Problème** : D6, D18. **Résultat** : « prévu » veut dire « pas encore payé ». **Base** : rien.
- **Étapes** : retirer `depenses` de la prévision ; refuser une date future ; adapter l'écran.
- **Fichiers** : `ComptabiliteService.ts:182-239`, `Tresorerie.tsx`. **Tests** : dépense du jour → prévision inchangée.
- **Fini quand** : D6 rejoué donne 0. **Dépend de** : rien ; absorbable par 21. **Risque** : faible.

### 09-E — Trier les sorties, choisir ses catégories (M)
- **Problème** : D12, section 6. **Résultat** : le bénéfice ne mélange plus rien ; chaque commerce a ses mots.
- **Base** : `categories_depenses.nature` (`charge`, `patron`, `avance`, `approche`) ; `depenses.employe_id`, `reception_id`. **API** : `POST`/`PUT /depenses/categories` (gérant, admin) ; désactiver, jamais supprimer.
- **Étapes** : 1) natures, « Retrait du patron », « Avance au personnel » (employé obligatoire) ; « Achat de marchandise » et « Règlement fournisseur » renvoient à leur écran, sans créer de dépense ; « approche » reste une charge tant que 17 ne la met pas dans le coût ; 2) écran Paramètres, catégories par profil.
- **Fichiers** : `routes/depenses.ts`, `CompanySettings.tsx`, `profilsActivite.ts`. **Tests** : effet de chaque nature sur tiroir et bénéfice.
- **Fini quand** : les sept lignes de la section 6 ont un chemin. **Dépend de** : C ; 17, 18, 20. **Risque** : mauvais classement → le gérant reclasse.

### 09-F — Une seule porte « Sortie d'argent » (M)
- **Problème** : deux saisies, 6 touchers, D21. **Résultat** : un seul bouton pour le caissier. **Base/API** : rien.
- **Écran** : dans Caisse et accueil : montant → tuiles fréquentes → note (obligatoire si « Autre »). `/depenses` quitte le menu du caissier et du vendeur ; le gérant garde la page, même formulaire.
- **Étapes** : composant `SortieArgentForm` ; retirer « Autre sortie » (garder « Dépôt à la banque ») ; boutons de 44 px ; libellé = catégorie, note, bénéficiaire ; redirection de `?nouvelle=1`.
- **Fichiers** : `CaisseV2.tsx`, `Dashboard.tsx`, `routeAccess.ts`, `caisseLibelle.ts`. **Tests** : 390 et 1440, clavier.
- **Fini quand** : taxi 2 000 en 4 touchers et une saisie. **Dépend de** : A, E ; **à fondre avec 08 si même dialogue**. **Risque** : habitudes.

### 09-G — D'où sort l'argent (M)
- **Problème** : D4, D10, espèces = tiroir forcé. **Résultat** : chaque franc a une source.
- **Base** : `depenses.source` (`caisse`, `patron`, `compte`), `compte_id` (comptes de la **fiche 21**), `reference_paiement`. **API** : `source` obligatoire.
- **Étapes** : 1) « Payé par : la caisse / le patron » ; « patron » ne touche pas le tiroir (gérant, admin) ; 2) espèces antidatées : refusées au caissier ; le gérant choisit « tiroir d'aujourd'hui » ou « déjà sorti » ; 3) avec 21 : opérateurs et banque débités, comptés au rapprochement (07-F).
- **Fichiers** : communs. **Tests** : loyer payé par le patron, caisse fermée ; Wave visible en sortie.
- **Fini quand** : dépenses = sorties, par source. **Dépend de** : A, F ; 21 (étape 3). **Risque** : « patron » comme échappatoire.

### 09-H — Totaux et bénéfice (M)
- **Problème** : D5, D20, totaux par page. **Résultat** : « marge 6,37 M, dépenses 0,41 M, bénéfice estimé 5,96 M ». **Base** : rien.
- **API** : `GET /depenses/synthese` (total du filtre, catégorie, nature, mode, magasin) ; `getPnL` renvoie `depenses` et `benefice_estime`.
- **Écran** : page du gérant : « Tous les magasins », périodes rapides, catégories classées, mode, bénéficiaire, export Excel ; deux lignes dans les rapports. Accueil : fiche 23.
- **Étapes** : synthèse ; écran ; rapport. Salaire : la paie **ou** la dépense, jamais les deux (règle de 20).
- **Fichiers** : `ReportingService.ts:27`, `Reporting.tsx`. **Tests** : patron, achat, avance, annulée exclus.
- **Fini quand** : D5 baisse le bénéfice du montant exact des charges. **Dépend de** : C, E ; 23. **Risque** : coût faux (10-B) → garder « estimé ».

### 09-I — Photo du reçu et « Refaire » (S)
- **Problème** : pas de reçu, loyer retapé chaque mois, D22. **Résultat** : reçu en un geste. **Base** : rien.
- **Étapes** : bouton photo (`image/*`, `capture`), image réduite (environ 300 Ko), envoi après la dépense avec nouvel essai ; « Refaire » préremplit ; droits et existence contrôlés.
- **Fichiers** : `AttachmentPanel.tsx`, `AttachmentService.ts`, `AttachmentController.ts`. **Tests** : photo de 8 Mo, coupure, dépôt → 403.
- **Fini quand** : reçu lu par le gérant. **Dépend de** : C, F. **Risque** : taille des sauvegardes (28).

### 09-J — Comptes justes (S, si la question 10 garde la comptabilité)
- **Problème** : D12, D13. **Résultat** : loyer et taxi dans leurs comptes, à la bonne date.
- **Étapes** : lire `compte_comptable_id` (repli 65) ; patron → compte de l'exploitant ; écriture à `date_depense`, hors espèces compris.
- **Fichiers** : `CaisseMagasinService.ts:555-625`, plan comptable. **Tests** : balance par catégorie, période close.
- **Fini quand** : 604 sans loyer. **Dépend de** : E, G ; 22. **Risque** : anciennes écritures intactes.

### 09-K — Champs TVA et facture reçue (S)
- **Problème** : section 7. **Résultat** : invisible pour le non assujetti. **Base** : `montant_tva`, `numero_facture_recue`.
- **Étapes** : champs si 03-K actif ; export. **Fichiers** : communs. **Tests** : réglage inactif → aucun champ.
- **Fini quand** : export relu par un comptable. **Dépend de** : 03-K, H. **Risque** : faible.

## 9. Questions

1. Au-dessus du plafond : **enregistrer et alerter** (proposé) ou bloquer ? Bloquer attend le code du gérant (24).
2. Plafond du caissier ? (proposé : 10 000 F par dépense)
3. Le vendeur saisit-il des dépenses ?
4. Le bénéfice déduit-il le salaire **payé** (proposé) ou **dû** ?
5. Questions 5 et 10 de `01-SUIVI.md` : un tiroir par caissier change A et B ; sans comptabilité, J disparaît.

**Non vérifié** : D16 ; période fermée (aucun écran) ; vrai téléphone. Les 12 dépenses du banc sans magasin viennent du remplissage. **À transmettre à 23** : « Compte de résultat » oublie le dernier jour (25 906 600 contre 25 927 800 : les 21 200 du jour).
