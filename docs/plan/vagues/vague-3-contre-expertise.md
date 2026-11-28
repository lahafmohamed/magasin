# Vague 3 · Contre-expertise (fiches 01, 02, 05)

26/11/2026, base `nolyx_audit_4`, scripts neufs (`%TEMP%\nolyx-agents\vague3-4\`), données créées par l'API ou l'écran, jamais en SQL. La caisse du banc avait 25 h : clôturée (60 000 attendus et comptés), rouverte à MAG-1 et MAG-2.

## 1. Résultat

41 lignes, dont 2 doublons entre fiches : **39 défauts, 34 confirmés, 4 nuancés, 0 faux, 1 non rejoué**. « Lu » = vu dans le code, sans rejeu.

## 2. Défauts rejoués

### Fiche 01 (7 confirmés, 1 non rejoué)

| N° | Statut | Preuve | Atteint |
|---|---|---|---|
| D1 livré sans limite | Confirmé (= 02-D2) | DEV-12 : 3 bons livrés et facturés, riz −20, huile −6, **400 000 pour 185 000** ; devis resté « accepte », toujours proposé à « Nouveau BL » | Écran |
| D2 trois prix | Confirmé | DEV-13 : base 1 910 925, fiche 2 011 500, aperçu 2 190 000, **facture 2 190 000** | API (point 5) |
| D3 statuts | Confirmé | Reconfirmé à 20 unités : devis 70 000, bon 7 000. Refusé ou annulé : reconfirmé, bon créé. Refusé après livraison : bon infacturable | API |
| D4 validité | Confirmé | 2020 confirmé ; « pas une date » → 500 | API |
| D5 sur commande | Confirmé | Produit créé « à MAG-1, stock 0 » : aucune ligne de stock, devis 422 « stock dépôt » | Écran |
| D6 acompte | Non rejoué | Cause de 04-D2 ; lot 04-I | – |
| D7 plafond | Confirmé | 422 brut « Limite: 1500000.00… » | Écran |
| D8 « Envoyé » | Confirmé (lu) | Aucun bouton ne le pose | Écran |

### Fiche 02 (11 confirmés, 3 nuancés, 2 doublons)

| N° | Statut | Preuve | Atteint |
|---|---|---|---|
| D1 « 0 livré » | Confirmé (= 03) | Riz 6 / huile 0 : total 93 000, lignes 123 000, huile −2, **facture 123 000** | Écran (lu) |
| D3 livré > commandé | Confirmé | 50 souris + portable hors devis à 1 000 : livrés | API |
| D4 plafond aveugle | Confirmé | Tantie (1 500 000) : trois bons de 697 500 confirmés et livrés, encours **2 229 720** | Écran |
| D5 stock nulle part | Confirmé (= fiche 10) | Bon de Yopougon : total 44 → 39, MAG-1 reste 44 | API |
| D6 PDF | **Nuancé** | « Qté » commandée (lu) ; le total 123 000, c'est D1 | Écran |
| D7 annulation | **Nuancé** | Point 4 | Écran |
| D8, D9, D10 | Confirmés | Deux sorties −2 ; dépôt 80 → 81, MAG-1 reste 8 ; BL-18 (32 000) → 400 « sans devis confirmé » | API |
| B1 à B4 | Confirmés (lus) | Devis obligatoire ; ni annulation, ni facture groupée, ni emplacement à l'écran | Écran |
| B5 profil | **Nuancé** | « Libre-service » cache aussi les devis ; le profil grossiste n'existe pas encore | – |

D2 et D11 doublent 01-D1 et 01-D2.

### Fiche 05 (16 confirmés, 1 nuancé)

| N° | Statut | Preuve | Atteint |
|---|---|---|---|
| D1 rembourser l'impayé | **Nuancé** | Point 2 | Écran, gérant |
| D2 facture annulée | Confirmé | Câble 42 → 44 → **46**, avoir créé ; sélecteur sans filtre | Écran |
| D3 avoir libre | Confirmé | 500 000 sur 6 000, remboursés par Wave | API |
| D4 deux lignes | Confirmé | 5 000 + 1 000 : deux retours à 5 000 | API |
| D5 imputation | Confirmé | « 25 500 au crédit du client » : en fait FAC-14 et FAC-19 | Écran |
| D6 CA | Confirmé | Point 3 | Écran |
| D7 virement | Confirmé | +45 000 « virement » dans `/paiements/stats` | Écran |
| D8 abîmé vendable | Confirmé | Un manque plutôt qu'une erreur | Écran |
| D9 stock fantôme | Confirmé (= 10-A) | 0, +8, vente : 7, retour : **1** | Écran |
| D10 simultané | Confirmé | 4 essais : 1, 2, 2, 3 acceptés sur 3 | API |
| D11, D12 | Confirmés | Avoir revalidé puis remboursé ; avoir utilisé supprimé, facture reste payée | API |
| B1 rôles | Confirmé, voulu | Caissier, vendeur : 403 | Écran |
| B2 à B4 | Confirmés (lus) | – | Écran |
| B5 autre boutique | Confirmé | Vendu à MAG-2 : stock et argent de MAG-2, MAG-1 inchangé | Écran |

**Une cause, comptée une fois.** Devis livré deux fois : pas de cumul livré par ligne → 02-A. « 0 livré » et remise perdue : la conversion → 03-A. Plafond (01-D7, 02-D4) : mauvais moment, mauvaise base → 02-C. Stock nulle part (02-D5, 05-D9) → 10-A. Surplus d'avoir, acompte de devis : moteur de 04-C.

## 3. Points précis

**1. `creer_avoir_depuis_retour()` : la fiche a raison, `CLAUDE.md` est périmé.** La fonction réelle, `create_avoir_from_retour` (`ci-baseline.sql:201`), écrit dans `document_lignes` et `compte_client_lignes`. La baseline n'a aucun `INSERT INTO facture_avoir_lignes`. Sur `nolyx_audit_4` et `neuve` : pas de `creer_avoir_depuis_retour`, aucune fonction ni vue ne cite la table, 0 ligne, aucune clé étrangère vers elle, aucun TypeScript. La migration 106 (l. 21-23) le dit ; seules 023, 030 et 037, remplacées, l'écrivaient. La production a été baselinée en bloc : vérifier `pg_proc` chez chaque client avant le `DROP`, et corriger `CLAUDE.md`.

**2. 05-D1 : gérant ou admin seulement.** Caissier : API 403 « Permissions insuffisantes », écran « Accès réservé ». Gérant à 390 px : « 10 000 FCFA seront rendus à TRAORE Mariama… Les espèces sortent de la caisse ouverte de Boutique Audit ». Rien ne dit que la facture n'est pas payée (`gerant-rembourser-390.png`). Rejoué : 15 000 à crédit, une souris rendue, tiroir −5 000, facture toujours 15 000 dus. **Nuance** : rien ne disparaît. La dette reste due, et c'est juste, puisque le client a reçu 5 000. Le défaut est le geste permis : la dette devient un prêt en espèces, sans avertir. Si le client ne paie jamais, la boutique perd argent et marchandise. Le 411 porte 5 000 de trop.

**3. 05-D6 : qui lit quoi.** Accueil (`revenue_mois`, `marge_mois`), compte de résultat, marges, catégories et produits lisent `factures`. `ReportingService`, `ComptabiliteService` et `GeneralLedgerService` ne citent jamais `factures_avoir`, et aucun trigger ne la suit. Rejoué : CA 30 570 100 avant et après vente, retour, avoir et remboursement ; marge et 701 inchangés ; 411 +5 000 ; stock +2 975. L'avoir est bien enregistré, daté, avec ses lignes. Le retour fait son travail ; deux défauts ailleurs : la lecture (rapports, fiche 23) et l'écriture de l'avoir, débit 701 et crédit 411 (03-C, fiche 22). 05-D garde la vue « ventes nettes », l'écriture va à 03-C.

**4. 02-D7 : quand la règle est juste.** FAC-204 (non payée) annulée : riz +4, huile +2, bon annulé.
- **Juste** si la marchandise revient (livraison refusée, tout rendu) ou n'est jamais partie (« livré » par erreur).
- **Fausse** si l'annulation corrige le papier : prix, remise oubliée, client, regroupement, créance abandonnée. Le stock reste gonflé jusqu'à un nouveau bon « livré », un second voyage fictif ; impossible si le devis est « converti » (D10).
- **Pire** : avec le repli de stock, elle crée de la marchandise (oubli 2).
- La règle ne touche jamais une vente comptoir : payée, son annulation est refusée (409 `FACTURE_REGLEE`). Elle ne vise que le crédit.

**5. 01-D2 : remise par l'API seulement, mauvais prix à l'écran.** `NouveauDevis.tsx` n'a pas de champ remise, et rien d'autre n'en pose (ni client, ni produit). Mais un devis remisé (API, import, futur 01-D) se convertit à l'écran : confirmer, « Marquer livré », « Créer la facture » donnent 2 190 000. Aucune saisie de remise avant 03-A.

## 4. Verdicts

- **01 « Simplifier » : maintenu.** Contre-argument : la proforma informatique est longue, revue des semaines ; la loger dans l'écran de caisse alourdit « Vendre », et la question 1 est ouverte. Il tient pour l'écran, pas pour la saisie : client, lignes, prix et remise forment le même panier. On partage le **composant** (07-H étape 1) et on garde la page « Nouveau devis ».
- **02 « Simplifier » : changé en « Améliorer ».** Contre-argument : pour le grossiste, le bon est le cœur du métier. Il tient : les deux retraits (bon d'office, devis obligatoire) sont des réparations, le reste ajoute. Le module se cache déjà par profil (`modules_desactives`).
- **05 « Fusionner » : maintenu, borné.** Contre-argument : Sage et Odoo gardent deux pièces, la FNE exige un avoir lié à la facture certifiée. Il tient pour la **pièce**, pas pour l'**écran**. Un seul parcours, un seul écran ; l'avoir reste une pièce numérotée. 05-E vient après les réparations d'argent.

## 5. Lots

- **05-A trop gros** : étape 1, gardes (S) ; étape 2, ligne d'origine (M). Verrouiller la facture d'abord et ne plus appeler le moteur (05-B), sinon on recrée l'interblocage de la vague 2.
- **05-C** perd B5 (fiche 13, 08-E) et D9 (10-A) ; il garde l'état « défectueux ». **05-G → fiche 18** ; « passer en perte » existe déjà (type `perte`).
- **02-D** réduit au bon non facturé (S), la facture à 03-D. **02-H** réduit à la liste « livré non facturé » (S), la facture du mois à 03-J. **02-I → 03-L.** **01-F** garde la relance. **01-D supprimé.**
- **01-E** : S, bloquant pour l'informatique, à placer tôt. **01-B** attend 07-H et 04-I.
- **Dépendances oubliées** : 02-A et 01-A dépendent de la question 2 (bon d'office) ; s'il reste, 02-C contrôle aussi la confirmation. 02-G attend la fiche 13, 05-F la fiche 24.
- **Invérifiables** : « qu'une administration accepte » (01-C), « réponse sur l'accueil » (02-H), « sur un Android » (02-I). Les remplacer par une liste de champs.
- **Pas au premier mois** : 01-F, 01-G, livreur et véhicule (02-F), 05-G.

| Sujet | Propriétaire | Cité par |
|---|---|---|
| Reste à livrer | **02-A** | 01-B, 02-E, 03-J ; 03-A garde « livré = facturé » |
| Plafond de crédit | **02-C** | 01-A ; fiche 06 : bloquer ou avertir, message |
| Annuler une facture livrée | **03-D** | 02-D (bon non facturé) ; 04-D si payée |
| Remise négociée | **03-B** ; conversion 03-A | saisie : 07-H |
| Stock d'un retour | **10-A** | 05-C (état) ; boutique : fiche 13 |
| Défectueux, retour fournisseur | **05-C** ; **fiche 18** | – |
| WhatsApp | **03-L étape 1** (lien, tous documents) | 01-F, 02-I |
| Surplus d'avoir | **05-B** | 04-C |
| CA net des avoirs | **05-D** ; écriture **03-C** | fiche 23 |
| Montants pour dépôt, lecteur | **03-E** | 01, 02-G, 05-F |
| Proforma, bon signé | **03-G** | 01-C, 02-F |
| Fin de mois du grossiste | **03-J** | 02-H |

**Ordre d'exécution** (nouveaux en gras ; titres des anciens : vague 2)

1. 08-G
2. 10-E
3. 08-A
4. 04-B
5. 07-A
6. 09-A
7. 10-A reprise
8. 10-A verrou, sans repli
9. 07-C
10. 10-B
11. 03-B
12. 03-A
13. **02-B bon figé**
14. **02-A reste à livrer**
15. **02-C plafond**
16. **01-A cycle du devis**
17. **05-A étape 1**
18. **05-A étape 2**
19. 04-A
20. **05-B rembourser le payé**
21. **05-D CA net**
22. **05-C défectueux**
23. 04-J
24. 08-D
25. 07-F
26. 04-E
27. 08-B
28. 08-C étape 1
29. 08-K
30. 04-D
31. 09-C
32. 03-D
33. **02-D annuler un bon**
34. 10-C
35. 03-E
36. 08-E
37. 09-B
38. 07-D
39. 09-D
40. **01-E sur commande**
41. 04-C étape 1
42. 04-C étapes 2-3
43. 08-F
44. 10-D
45. 07-H étape 1
46. 07-H étape 2
47. **02-E bon sans devis**
48. **05-E étapes 1-2**
49. **05-E étape 3**
50. **05-F caissier**
51. 09-E
52. 09-F
53. 09-H
54. 07-B
55. **01-B vendre un devis**
56. 08-H
57. 08-I étape 1
58. 10-F
59. 03-F
60. 03-G
61. **01-C proforma**
62. **02-F bon signé**
63. **02-G dépôt**
64. 09-I
65. 10-H
66. 04-F
67. 04-G
68. 04-I
69. 07-J
70. 07-I
71. 10-G
72. 10-I
73. 10-J
74. 10-K
75. 03-I
76. **02-H livré non facturé**
77. 03-J
78. 03-C, avoirs compris
79. 03-K
80. 03-L
81. **01-F relance**
82. 04-H
83. 08-J
84. 08-L
85. 08-C étape 2
86. 07-L
87. 08-I étape 2
88. **01-G dupliquer**
89. 09-J

## 6. Oublis

1. **L'avoir d'un client anonyme paie la dette d'un autre** (supposé par la fiche 05, prouvé). FAC-225, 1 400 F à crédit au « Client comptoir » ; avoir de 20 000 imputé de 1 400 : **18 600 posés sur FAC-13**, autre vente anonyme. Cause de D5 (05-B) ; raison de plus pour refuser le crédit au Client comptoir (fiche 06).
2. **Bon « pris nulle part », puis facture annulée : stock créé.** Câble 46 → **51**, dont 5 à Yopougon, qui n'en a jamais eu. 10-A doit précéder 03-D.

## 7. Erreurs dans les fiches

- **05** : D1 tient la dette restante pour une erreur et omet « gérant seul » ; « passer en perte » présenté comme nouveau ; D10 « 2 acceptés » varie de 1 à 3 ; D5 « montant ignoré » : il est respecté, c'est le reste qui part ailleurs.
- **02** : D6 recompte D1 ; « juste pour une vente au comptoir » (point 4) ; B5 vise un profil à venir ; verdict.
- **CLAUDE.md** : `facture_avoir_lignes` « encore écrite ».

## Non vérifié

PDF ouverts (lus seulement) ; validité et avoir de 500 000 saisis à l'écran ; production ; période close ; retour d'une facture livrée depuis le dépôt ; aucun commerçant interrogé.
