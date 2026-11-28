# Vague 2 · Contre-expertise (fiches 04, 08, 09)

25 et 26/11/2026, base `nolyx_audit_4`, scripts neufs (`%TEMP%\nolyx-agents\vague2-4\`), données créées par l'écran ou l'API, jamais en SQL.

## 1. Résultat

48 défauts contrôlés (argent et blocages) : **39 confirmés, 6 nuancés, 0 faux, 3 non rejoués**. La base modèle n'a **aucun acompte** : ceux des fiches viennent des agents.

## 2. Défauts rejoués

### Fiche 04 (16 : 14 confirmés, 2 nuancés)

| N° | Statut | Preuve | Atteint |
|---|---|---|---|
| D1 solde | Confirmé | Section 3 | Écran |
| D2 acompte qui part seul | **Nuancé** | Appliquer 10 000 sur 50 000 : 40 000 partent sur l'autre facture, réponse « 10 000 appliqués ». Rembourser 10 000 : 40 000 posés sur la facture. Mais la déduction à la **création** d'une facture est une décision écrite (`CLAUDE.md`), non citée | Écran |
| D3 chèque impayé | Confirmé | Caisse close : supprimer, modifier, annuler → 409, même caisse rouverte | Écran |
| D4, D5 | Confirmés | Acompte Wave : ni session, ni écriture ; remboursé : compte 54 à −38 200 ; 419 à 250 000 pour 43 000 d'acomptes | Écran |
| D6 compensation | Confirmé | Visée FAC-02325, payée FAC-02324. Trois envois de 50 000 sur 100 000 dus : 150 000 acceptés 4 fois sur 5, surplus remboursé en espèces (tiroir −50 000) | Écran ; triple : API |
| D7 à D11 | Confirmés | Référence perdue ; auxiliaire 120 000 pour 100 000 ; « encaissé » décalé de 90 000 ; tiroir d'une autre boutique ; 2031 et « 0 FCFA » acceptés | API sauf D9 |
| B1 | **Nuancé** | Section 3 | Écran, 20 ms |
| B2 à B5 | Confirmés | 409, 409, 422 ; Wave sans magasin non remboursable ; 500 ; plafond sans l'acompte | Écran, B4 API |

### Fiche 08 (13 : 10 confirmés, 2 nuancés, 1 non rejoué)

| N° | Statut | Preuve | Atteint |
|---|---|---|---|
| D1 | **Nuancé** | Section 3 | Écran, rare |
| D2 fonds du matin | **Nuancé** | Rouvert à 20 000 après 482 700 comptés, sans question ; mais l'historique montre les deux chiffres ; usage normal (section 3) | Écran |
| D3 | Confirmé | À l'écran : « Sortie de 605 000 FCFA enregistrée », tiroir 325 000 → −280 000 | Écran |
| D4 | Confirmé | Dialogue ouvert, vente de 20 000 : l'écran ne bouge pas, écart gardé −21 000 au lieu de −1 000 | Écran |
| D5 | Confirmé | « Serveur injoignable », puis « Session non trouvée ou déjà clôturée » | Écran |
| D6 à D9 | Confirmés | Wave hors caisse ; fournisseur payé en espèces, tiroir inchangé ; carte au 53, patron au 65, écart sans écriture ; `CAISSE_GL_POSTING=false` (lu) | Écran |
| D10, D11, D13 | Confirmés | Base neuve : 0 magasin ; dépôt et lecteur lisent l'historique (API) ; après clôture, 409 et 422 même pour l'admin | Écran |
| D12 | Non rejoué | Lu ; 24 h non simulées | – |

### Fiche 09 (19 : 15 confirmés, 2 nuancés, 2 non rejoués)

| N° | Statut | Preuve | Atteint |
|---|---|---|---|
| D1 suppression double | **Nuancé** | Deux vraies fenêtres : argent rendu deux fois **4 fois sur 4** à 0–5 ms d'écart, **0 sur 2** à 15 et 30 ms. Réel, mais il faut cliquer à 10 ms près | Écran, rare |
| D2 coupure | Confirmé | À l'écran : « Serveur injoignable », second clic : 2 dépenses, tiroir −7 400 | Écran |
| D3 à D12 | Confirmés | Corrections croisées ; non espèces sans mouvement ; marge sans dépenses ; trésorerie qui « prévoit » le jour ; tiroir à −100 000 ; vendeur qui supprime le loyer (écran) ou le passe à 30 F (API) ; annulation « encaissée » ; antidatée ; patron au 65 | Écran |
| D13 | **Nuancé** | Les 10 catégories sans compte : tout au 604 ; PDF non rouvert | Écran |
| D14, D15, D17, D18 | Confirmés | 3 paires sur 10, 3 interblocages ; fiche 500 ; promesse « remis » puis refus ; 2027, 1990, 0,5 F acceptés | API |
| D16, D19 | Non rejoués | Lus | – |

## 3. Points précis

**Interblocages : deux causes.** Journal PostgreSQL : 49 sur `sessions_caisse`, 11 sur `factures`.

1. **Session** (08-D1, 09-D14). L'insertion du paiement ou de la dépense pose un verrou partagé sur la session (clé étrangère), puis `enregistrerMouvement` demande `FOR UPDATE` : deux postes s'attendent. Il faut **clients et articles différents** : même article, 0 sur 45 ; Client comptoir, 0 sur 44 ; trois clients et trois articles, 19 sur 45.
2. **Factures du client** (04-B1). Le moteur verrouille toutes les factures du client. Même client, Wave, **aucune caisse ouverte** : 10 sur 10 ; clients différents : 0 sur 10. Même cause que 07-B, pas que 08-D1.

**Rythme réel.** Échecs : 20 % à 0 ms d'écart, 2,5 % à 30 ms, 0 à 50 ms. Deux caisses, une vente toutes les 0,2 à 0,6 s (cent fois le rythme réel) : **1 erreur sur 414 ventes**, 1 sur 201 avec 70 % de Client comptoir. À 20–60 s, c'est cent fois plus rare par vente : une erreur pour 20 000 à 40 000 ventes, une toutes les 5 à 10 semaines à deux caisses et 300 ventes par jour (calcul). À vitesse réelle, 15 minutes : 43 ventes, 0 erreur (attendu).

**Ce que voit l'employé.** Comptoir : « La vente n'a pas été enregistrée. Vérifiez les articles » ; paiement : « Vérifiez votre connexion » (fausse piste). Le nouvel essai passe **sans doublon** (414 factures pour 414 ventes).

**04-D1.** Les 24 clients sont ceux de l'agent ayant un acompte. « 13 sur 24 » n'est pas un taux : **tout client dont un acompte a servi** est faux. Chiffre juste, à la main : restes dus − acomptes restants − avoirs non utilisés. X2 : 40 000 + 30 000 − 50 000 = **20 000 dus**.

| Écran | X2 (vrai 20 000) | Acompte en partie utilisé (vrai −38 000) | Avoir 100 000 imputé de 60 000 (vrai −40 000) |
|---|---|---|---|
| Fiche contact | **−30 000** « vous lui devez » | **0** | **0** |
| Liste des contacts | **−30 000** | – | **−100 000** |
| Relevé | 20 000 | **0** | **0** |
| Balance âgée, relances | 20 000 | 0 | 0 |

Faux sur la fiche, la liste et le plafond de compensation ; relevé et balance âgée ignorent l'argent du client.

**09-D1 par deux navigateurs** : oui, à moins de 15 ms.

**08, 482 700 rouvert à 20 000** : usage normal, le patron prend la recette ; le défaut est l'absence de « remis à qui ». **Sortie supérieure au tiroir** : jamais normale, mais une vente non saisie la rend possible : refuser au caissier, permettre au gérant avec motif.

## 4. Verdicts

- **04 « Simplifier » : maintenu.** Contre-argument : le grossiste paie 500 000 pour douze factures, c'est le « plus ancienne d'abord » du moteur. Ne tient pas : depuis la règle E1 un paiement reste sur sa facture ; le moteur ne répartit plus que les acomptes, c'est D2. **On perd** la déduction automatique à la création (« proposer » la remplace, 04-B) et le report d'anciens trop-perçus. **Rien d'autre** : la balance âgée lit `remaining_due`, tenu par le trigger `update_facture_payment_status` ; 0 facture sur 2 300 dont le payé diffère des paiements ; `recompute-allocations` simulé : 0 changement sur 205 clients. Données existantes : rejouer cette simulation chez chaque client avant suppression (41 « écarts » en production). Oublié : `tiers.solde_client_actuel`, écrit par le seul moteur (`ClientAllocationService.ts:384`), trie la liste.
- **08 « Améliorer » : maintenu, réduit.** Contre-argument : le tiroir est juste, douze lots alourdissent un magasin de deux employés. Tient pour 08-C étape 2, 08-I étape 2, 08-J, 08-L : plus tard. Audit supprimé, historique fusionné : d'accord.
- **09 « Fusionner » : maintenu.** Contre-argument : un loyer viré n'est pas de la caisse ; la page reste au gérant, il ne tient pas. Condition : 09-F et 08-B font **un seul dialogue** (« Ajouter une sortie » renvoie déjà vers Dépenses).

## 5. Lots

- **04-C trop gros, mal placé.** Découper : (1) contrôle préalable, trigger ignorant les annulées, cache `solde_client_actuel` ; (2) retrait des 12 appels ; (3) routes et table. **08-A avant** : ce sont les verrous du moteur sur les 254 factures du Client comptoir qui rangent aujourd'hui les ventes comptoir en file (verrou de crédit sauté, `FactureService.ts:426`).
- **04-C « verrouiller d'abord le tiers »** : un verrou unique pour toutes les caisses au Client comptoir ; l'exclure. Pris après l'insertion, il recrée 08-D1.
- **08-A seul** n'atteint pas « 0 erreur 500 » : même client en espèces, le verrou des factures reste.
- **04-K et 08-E figent l'oubli 1.** Règle juste : le tiroir de la boutique qui reçoit l'argent.
- **Doublons** : borne du tiroir (08-B, 09-B) ; verrou de session (08-A, 09-A). **Invérifiables** : 09-K, 09-I.
- **Pas au premier mois** : rapprochement (04-H), comptes d'argent (08-J), billets, tiroirs par caissier, « Refaire ».

| Sujet | Propriétaire | Absorbés |
|---|---|---|
| Argent non espèces | **08-D** : tout mode passe par la session | 07-F garde Moov et référence ; 04-E le 419 (fiche 22) ; 04-H la page ; 09-G étape 3 |
| Sorties d'argent | **08-B** borne et fonds ; **09-F** porte unique ; **09-E** natures | 09-B (borne) ; 08-J étape 1 devient une nature ; 08-J étape 2 → fiche 22 |
| Moteur et vitesse | **08-A** session, puis **04-C** moteur | 07-B ne garde que l'acompte proposé ; 09-A sans verrou |
| Correction après clôture | **08-K** : statut annulé, contre-mouvement dans la session ouverte, motif, gérant | 04-D et 09-C l'appliquent ; 03-D annule la facture via 04-D |
| Anti-doublon | **07-A** | 09-A l'applique ; partie doublon de 04-K |
| Droits et plafonds | **08-E** sur l'argent ; boutique : fiche 13 ; PIN : fiche 24 | 04-K ; 09-B garde plafond et validation |
| Client neuf | **08-G** | Fiche 13 cite, fiche 28 vérifie |

**Ordre d'exécution**

1. 08-G caisses
2. 10-E création produit
3. 08-A verrou session
4. 04-B geste explicite
5. 07-A anti-doublon
6. 09-A dépense unique
7. 10-A reprise du stock
8. 10-A verrou du stock
9. 07-C stock du magasin
10. 10-B coût par emplacement
11. 03-B FCFA entiers
12. 03-A livré facturé
13. 04-A solde unique
14. 04-J compensation
15. 08-D session pour tout
16. 07-F Moov, référence
17. 04-E acompte en caisse
18. 08-B fonds et remise
19. 08-C étape 1
20. 08-K correction
21. 04-D annuler encaissement
22. 09-C annuler dépense
23. 03-D pièce inaltérable
24. 10-C plancher
25. 03-E coût caché
26. 08-E droits
27. 09-B plafond
28. 07-D scan
29. 09-D trésorerie
30. 04-C étape 1
31. 04-C étapes 2 et 3
32. 08-F page Caisse
33. 10-D page Produits
34. 07-H étape 1
35. 07-H étape 2
36. 09-E natures
37. 09-F porte unique
38. 09-H bénéfice
39. 07-B acompte au comptoir
40. 08-H caisse oubliée
41. 08-I étape 1
42. 10-F recherche
43. 03-F crédit daté
44. 03-G document
45. 09-I photo
46. 10-H cartons
47. 04-F versement global
48. 04-G reçu
49. 04-I acompte de commande
50. 07-J échange
51. 07-I panier gardé
52. 10-G import
53. 10-I poids
54. 10-J tailles
55. 10-K séries
56. 03-I services
57. 03-J livraisons groupées
58. 03-C comptabilité
59. 03-K TVA (10-L, 09-K)
60. 03-L FNE, WhatsApp
61. 04-H journal
62. 08-J comptes d'argent
63. 08-L rapport du soir
64. 08-C étape 2
65. 07-L clavier
66. 08-I étape 2
67. 09-J comptes

## 6. Oublis

1. **Encaisser à l'écran la facture d'une autre boutique met l'argent dans le mauvais tiroir.** Caissier de MAG-1, facture de MAG-2, 7 000 F en espèces : « Facture soldée », paiement dans la session de MAG-2, tiroir MAG-1 inchangé. Le soir : 7 000 de trop d'un côté, de manque de l'autre. Le dialogue ne nomme pas la boutique.
2. **« Ventes du jour » de l'accueil ne lit que 100 factures** (`Dashboard.tsx:930`) : « 2 003 000 FCFA, au moins 100 factures » pour 3 946 900 F réels à MAG-1. Une boutique alimentaire dépasse 100 tickets. À transmettre à la fiche 23 et à 08-L.
3. **04-C avant 08-A casserait le comptoir** (section 5) : déduit du code et des mesures, non rejoué.

## 7. Erreurs dans les fiches

- 04 : « 13 sur 24 » lu comme un taux ; relevé dit juste (il ignore l'acompte disponible) ; « Erreur serveur » à l'écran ; « deux ventes comptoir : 0 échec » (Client comptoir seul) ; D2 sans la décision écrite ; moteur « pour d'anciennes données » (il tourne à chaque vente).
- 08 : « Erreur interne du serveur » à l'écran ; D1 sans sa condition ; D2 « sans trace ».
- 09 : D1 sans sa fenêtre de 15 ms.

## Non vérifié

24 h de caisse ouverte ; PDF du compte de résultat ; clôture en échec ; serveur plus lent ; aucun commerçant interrogé.
