# Concurrents et attentes métier : référence pour les 30 fiches (25/11/2026)

**Lecture.** [x] renvoie aux sources en fin de fichier, toutes consultées le 25/11/2026. **°** = connaissance générale du produit, non relue : à ne pas citer comme preuve. « Min. » = minimum attendu par la cible ; sans source, c'est une **hypothèse métier** (aucun commerçant interrogé). « Index Loyverse » = aucune page d'aide sur le sujet dans l'index consulté ; ce n'est pas une preuve d'absence. FNE et mobile money : voir `fne.md` et `mobile-money.md`. 1 € = 655,957 F.

## 1. Outils présents

| Outil | Cible, hébergement | Prix public | Hors ligne | Support local |
|---|---|---|---|---|
| **Sage 100 Gestion commerciale** (Saari) | PME ; serveur local SQL ou cloud [G1] | Aucun prix FCFA trouvé. France (grille 01/2025) : Essentials 936–1 247 €/an, Standard 1 491–1 721, Premium 2 197, puis 149–326 €/an par utilisateur ; formation 800–2 400 €, selon un comparateur [G2]. Export 2025 : 1er utilisateur Essentials 983 à 1 309 € (≈ 645 000 à 859 000 F), vu en extrait [G3]. Abonnement seulement, plus de licence à vie (forum) [G4] | Serveur local : pas besoin d'internet ° | Intégrateurs locaux (liste FNE : AB Soft Work, Novasoft). Offres d'emploi ivoiriennes 2025-2026 demandant Sage ou Saari [G5] |
| **Odoo Standard** (Online) | Toutes les applis, **sans module spécifique** | Page servie à une adresse ivoirienne : **8,95 €/utilisateur/mois** en annuel (≈ 5 870 F ; 7,25 € la 1re année), 11,20 € en mensuel [O1] | Caisse seulement, limité (T16) | Email, lundi-vendredi, français possible [O1]. Partenaires à Abidjan : Veone, ConsulTech (client moyen : 14 utilisateurs), BDO Digital [O2] |
| **Odoo Custom** | + modules spécifiques, Odoo.sh ou serveur propre | 14,50 € annuel (≈ 9 510 F), 17,90 € mensuel [O1] | idem | idem |
| **Odoo Community** | Gratuit, auto-hébergé, sans WhatsApp [O14] | Installation « dès 200 000 F » (blog, fragile) [D1] | idem | Prestataires |
| **Loyverse** | Boutique, téléphone ou tablette, hébergé | Caisse et multi-magasins gratuits ; historique > 31 jours 5 $/magasin ; employés 5 $/personne ; **stock avancé 25 $/magasin/mois** [L1]. Google Play CI : 1 M+ installations [P1] | Oui (T16) | Chat, aucun support local trouvé |
| **Kweeli** (ARCHDIGIT, Abidjan) | Boutique en ligne + caisse + stock, resto | Gratuit, premium « dès 5 000 F/mois » [P2] | Annoncé | WhatsApp, Abidjan |
| **Ma Caisse** (développeur à nom ivoirien, id `ci.pos`) | Petite boutique, Android | Non affiché ; 100+ installations ; 14/11/2026 [P3] | Oui | NV |
| **Digicaisse** (Orange Business + Proboutik, Sénégal) | Boutiquiers | 7 jours gratuits puis **2 500 F TTC/mois** (05/2025) [P4] | NV | Sénégal |
| **Karnet** | Carnet de dettes seul | Achats intégrés 4 274–24 072 F ; 1 k+ ; 09/11/2026 [P5] | Oui, sans compte | NV |
| **Stockman** | Détaillants, multi-magasins | 2 500–4 900 F (achats intégrés) ; 100+ [P6] | Annoncé | NV |
| **eBoutik** (contact au Niger) | Boutiques Afrique de l'Ouest | Non affiché ; 10+ [P7] | Annoncé | WhatsApp |
| **BokkCom** (Sénégal) | Petit commerce | Gratuit + Pro, montant NV [P8] | « Connexion faible » | NV |
| **Weebi** (Sénégal), **Keiwa**, **Djeli** (CI) | Boutiques, PME | NV | Weebi : oui (fiche App Store) | NV |
| **Excel vendu à l'unité** (« MINI+ », Abidjan) | Caves, dépôts de boissons | 80 000 / 150 000 / 250 000 F une fois [P9] | Oui | Vendeur |
| **Cahier, Excel** | Tous | 0 | Oui | – |

**À retenir.**
- Le vrai concurrent de la cible est le cahier ou Excel : les applis régionales trouvées affichent 10+ à 1 k+ installations. « 75 % des PME sur cahier ou Excel » vient d'un blog d'éditeur sans méthode [D1] : ne pas citer.
- Repère de prix : 2 500 à 5 000 F/mois pour une appli locale ; ≈ 5 900 F **par utilisateur** chez Odoo ; ≈ 645 000 F/an pour **un** poste Sage.
- Les prix en FCFA de l'agence Kolonell (vend du sur-mesure) sont écartés.

## 2. Matrice

### 2.0 Points transverses (T)

| N° | Sujet | Odoo 19 | Sage 100 GC (France) | Loyverse |
|---|---|---|---|---|
| T1 | Carton / paquet / pièce | Conditionnements par produit, quantité, code-barres propre ; unité d'achat par fournisseur ; conversion en unité de stock [O3]. **En caisse, la doc ne décrit que le regroupement par unité** ; le choix carton/pièce est vendu en module tiers [O4] | « Article en conditionnement » : **absent d'Essentials** [G1] | Deux articles : pièce et carton « composite », puis **démontage** manuel (payant) [L2] |
| T2 | Gros, demi-gros, détail, quantité | Listes de prix : client, quantité mini, période, prix fixe, remise ou formule ; auto par client ou choisies en caisse [O5][O6] | 32 catégories tarifaires + gammes de tarif par quantité, **toutes gammes** [G1] | Remises seulement ; pas de liste de prix (index) |
| T3 | Taille / couleur | Variantes, supplément par valeur [O7] | « Gamme » = **option** (incluse en Cloud Premium) [G1] | 3 axes, 200 combinaisons ; prix, code-barres et seuil par variante [L3] |
| T4 | N° de série, garantie | Par unité, saisi en caisse ; **numéro manquant = avertissement, vente permise** [O8] ; garantie : note libre sur le reçu [O9] | **Option**, absente d'Essentials, incluse en Cloud Premium [G1] | Index : rien |
| T5 | Lot, péremption | 4 dates (péremption, optimale, retrait, alerte) ; réception bloquée sans lot [O10] ; étiquette de remise pour produit proche de la date [O11] | Même option que T4 | Index : rien |
| T6 | Crédit client | Mode « compte client », dépôt, règlement des dettes en caisse ; **dépassement du plafond = avertissement orange, ne bloque pas** [O12] | Contrôle d'encours automatique, toutes gammes [G1] | Index : rien |
| T7 | Relances | Niveaux par jours de retard (même négatifs), email, WhatsApp, SMS, courrier ; SMS et WhatsApp à crédits [O13] | Décrites côté Sage 100 **Comptabilité** [G7] | Rien ; Karnet, eBoutik, BokkCom : message WhatsApp prêt |
| T8 | Ticket en attente | Bouton « + » : plusieurs commandes ouvertes ; liste « Actives » [O9] | Pas de caisse standard (T10) | « Open tickets » : nom, commentaire, recherche ; droit de voir ceux des autres [L4] |
| T9 | Remises, autorisation | % ligne ou total ; prix modifiable dès « Basic », sauf « Price Control » (admin) [O9][O15] | Simulateur de remise [G1] | % (article, ticket) ou montant (ticket) ; remise restreinte ; **PIN d'un responsable = accord ponctuel** [L5][L6] |
| T10 | Clôture de caisse | Contrôle d'ouverture, entrées/sorties motivées, comptage billets, attendu par mode, **écart maximum au-delà duquel un responsable valide** [O9] | Saisie de caisse décentralisée : fonds, Z, habilitations ; **plus vendue depuis la V10** selon un forum, remplacée par une appli partenaire [G6] | Attendu/compté/écart ; **peut cacher l'attendu au caissier** [L7] |
| T11 | Multi-paiement | Plusieurs modes par vente ° ; terminaux documentés : aucun Wave, Orange ou MTN [O16] | Saisie des règlements [G1] | Modes libres ° ; rapport par mode [L8] |
| T12 | Échéances | Conditions de paiement ; acompte % ou fixe depuis la caisse sur devis/commande [O11] | Modèles de règlement ° | Rien |
| T13 | Import Excel | Modèles, test avant import, ID externe pour réimporter sans doublon [O17] | Copier/coller Excel, import catalogue fournisseur [G1] | CSV, 10 000 lignes ou 5 Mo [L9] |
| T14 | Droits | Caisse : minimal, de base, avancé ; badge ou PIN [O15] | Utilisateurs par dépôt dès Standard [G1] | Rôles libres, « voir le coût », « 5 derniers reçus » [L6] |
| T15 | Impression | Imprimantes ePOS, IoT ; avis critiques sur l'impression directe [A1] | Modèles ° | Bluetooth, USB, Ethernet, logo [L10] |
| T16 | Hors ligne | Ventes dans le cache du navigateur ; **ne pas fermer ni recharger** ; pas de création de client, de stock réel ni de terminal ; factures émises au retour ; produits chargés en nombre limité [O9] | LAN ° | Ventes et caisse oui ; **remboursement, nouveau client, stock : non** ; déconnexion bloquée avant synchro [L11] |
| T17 | Inventaire tournant | Par emplacement, fréquence en jours ; comptage demandé à un utilisateur ; **confirmation si le stock a bougé** ; annulable [O18] | Saisie ou import [G1] | Complet ou partiel (catégorie, fournisseur) ; scan = +1 ; sauvegarde 30 s ; stock attendu visible ; payant [L12] |
| T18 | Transferts | Entrepôts, emplacements ; transferts internes ° | Multi-dépôts et transferts, toutes gammes [G1] | Ordres de transfert, payant [L1] |
| T19 | Frais d'approche | Article service « landed cost », 5 répartitions (égale, quantité, coût, poids, volume), **depuis la facture fournisseur, CMP ou FIFO seulement** [O19] | NV | Coûts additionnels sur la commande, choisis à la réception ; payant [L13] |
| T20 | TVA optionnelle | Taxes par produit, positions fiscales ° | Catégories comptables ° | Taxes facultatives ° |
| T21 | WhatsApp | **Enterprise seulement**, compte WhatsApp Business Platform ; l'appli WhatsApp Business est **incompatible** ; modèles approuvés [O14] | Modèles d'email [G1] | Reçu par email |
| T22 | Arrondi FCFA | Par point de vente, espèces seules possible [O6] | NV | 5, 10, 50, 100 ; espèces seules [L14] |

### 2.1 Ventes

**01 Devis**
- Odoo : devis ou commande rechargé en caisse, soldé ou en acompte [O11] ; modèles, validité, signature en ligne °.
- Sage : devis → commande → préparation → BL → facture ; « devis perdus » dès Standard [G1].
- Loyverse : index, rien.
- Min. : saisie rapide, validité, PDF et lien WhatsApp, passage en vente sans ressaisie, prix figés.

**02 Bons de livraison**
- Odoo : livraison convertie en unité de stock [O3] ; « Ship later » depuis la caisse, adresse client obligatoire [O11].
- Sage : préparation et BL séparés, périodicité de livraison, cadencier (Standard) [G1].
- Loyverse : rien.
- Min. : livraison partielle avec reste à livrer, signature, plusieurs BL sur une facture, BL sans prix pour le dépôt. Inutile au détail : à cacher.

**03 Factures**
- Odoo : client obligatoire ; plusieurs ventes de caisse regroupées en une facture [O20] ; facture validée jamais modifiée, avoir sinon [O21].
- Sage : 50 souches ; facturation périodique et circuit de validation dès Standard [G1].
- Loyverse : reçus ; pas de facture A4 (index).
- Min. : facture depuis un ticket après coup, logo, coordonnées, reste dû, champs FNE prêts.

**04 Paiements et acomptes**
- Odoo : dépôt sur compte, choix des factures à solder en caisse [O12].
- Sage : règlements toutes gammes ; Loyverse : encaissement immédiat seul.
- Min. : paiement partiel, deux modes sur une vente, opérateur et référence mobile money, reçu de versement, solde avant/après, date d'échéance.

**05 Retours et avoirs**
- Odoo : remboursement partiel depuis la vente ; retour libre en quantité négative ; carte cadeau comme avoir [O9] ; après facture : transfert inverse **et** avoir, deux documents [O21].
- Sage : bon de retour et avoir financier distincts [G1].
- Loyverse : depuis le reçu, droit dédié, impossible hors ligne [L6][L11].
- Min. : retrouver la vente par ticket/client, **échange** (taille, modèle) avec complément, état (remis en stock, défectueux), motif, accord du gérant.

**06 Relances et limite**
- T6, T7. Odoo avertit sans bloquer ; suivre la dette exige la facture ou l'appli Comptabilité [O12].
- Outils locaux : montant prérempli, ton du message, échéances du jour, relevé PDF [P5] ; BokkCom : ancienneté de la dette [P8].
- Min. : qui doit combien depuis quand, plafond **bloquant** avec dérogation, WhatsApp en un geste, promesse de paiement.

**07 Vente comptoir et ticket**
- T1, T2, T4, T8, T9, T11, T15, T16, T22. Odoo : scan par webcam, favoris, carte par métier [O9].
- Ma Caisse : espèces, mobile money ou mixte, monnaie calculée, opérateur noté, Bluetooth ou PDF [P3].
- Min. : vente en moins de 5 gestes, scan, mise en attente, remise contrôlée, dernière vente réimprimable, vente à crédit, stock visible.

**08 Caisse**
- T10. Odoo ferme la session et écrit en comptabilité [O9] ; écart journalisé.
- Loyverse : entrées/sorties, export des postes [L7]. Ma Caisse : billets et pièces, écart, historique [P3].
- Min. : fonds, dépenses et remises au patron, comptage à l'aveugle, attendu **par mode**, écart justifié, ventes annulées visibles, multi-caissiers.

**09 Dépenses**
- Odoo : sortie de caisse motivée [O9] ; appli Notes de frais avec approbation °. Sage : en comptabilité °. Loyverse : « pay out » sans catégorie [L7].
- Locaux : dépenses du jour, catégories loyer, salaires, transport [P6].
- Min. : petite dépense depuis la caisse, catégorie, photo du reçu, effet sur bénéfice et tiroir, même bénéficiaire mensuel.

### 2.2 Stock

**10 Produits, prix, codes-barres**
- T1 à T5, T13.
- Écart majeur : Sage vend conditionnement, variantes et séries au prix d'une gamme ou d'une option ; Loyverse les contourne ; Odoo les a hors caisse pour T1.
- Min. : alimentaire T1 + T2 + T5 ; habillement T3 ; informatique T4 ; général : import Excel, photo facultative, plusieurs codes-barres, coût caché au vendeur, prix plancher.

**11 Étiquettes**
- Loyverse : nom, référence, prix, code ; payant [L1]. Sage : étiquettes de colisage en états libres [G1]. Odoo : choix du format °.
- Min. : code interne pour article sans code, lot d'étiquettes depuis une réception, prix barré, carton et pièce.

**12 Inventaire physique**
- T17. Piège commun : mouvement entre comptage et validation ; Odoo demande confirmation, Loyverse n'en dit rien.
- Min. : inventaire partiel boutique ouverte, deux compteurs, scan au téléphone, feuille papier, valeur des écarts pour le patron, annulation.

**13 Emplacements, transferts**
- T18. Loyverse : multi-magasins gratuit, transferts payants. Sage : droits par dépôt dès Standard.
- Min. : envoyé / reçu / écart en deux temps, bon de transfert, sans prix pour le dépôt ; **rien à l'écran pour un magasin unique**.

**14 Demandes de réapprovisionnement**
- Sage : réapprovisionnement inter-dépôts toutes gammes [G1]. Odoo : règles entre entrepôts °. Loyverse : index, rien.
- Min. : demande depuis le produit en rupture, quantité proposée, acceptation partielle, transfert créé d'office. Boutique seule : simple liste « à acheter ».

**15 Valorisation, CMP**
- Odoo : CMP ou FIFO, effet des frais ligne par ligne (avant/après) [O19]. Sage : CMUP, FIFO/LIFO toutes gammes [G1]. Loyverse : rapport payant [L1].
- Min. : coût moyen avec frais, marge par vente, valeur par site, coût réservé au patron, correction tracée.

**16 Suggestions et commandes**
- Odoo : commande automatique **seulement si un fournisseur est sur la fiche** ; unité d'achat par fournisseur [O3]. Sage : mini/maxi et réappro toutes gammes ; calcul des besoins en option [G1]. Loyverse : commande préremplie, payant [L13].
- Min. : quoi racheter selon ventes, en cartons, par fournisseur, envoi WhatsApp, commande sans montant possible.

**17 Réceptions, arrivages**
- T5, T19. Odoo : frais depuis la facture fournisseur, sur transferts **validés** seulement [O19]. Loyverse : frais choisis à chaque réception partielle [L13].
- Min. : reçu ≠ commandé, casse, frais de transport/douane/transit répartis sur l'arrivage, **nouveau prix de vente proposé**, réception sans commande (achat au marché).

**18 Factures fournisseur**
- Odoo : facturer commandé ou reçu ; rapprochement à 3 voies affiche « Exception » **sans bloquer** [O22]. Sage : bon à payer dès Standard [G1]. Loyverse : rien.
- Min. : ce que je dois, à qui, quand ; paiement partiel depuis caisse/mobile money/banque **avec mouvement d'argent** ; photo de facture. Rapprochement à 3 voies : à justifier pour la cible.

### 2.3 Tiers, argent, pilotage

**19 Contacts, CRM**
- Odoo : contact créé en caisse, historique, CRM séparé °. Sage : prospects, analyse activité et risque [G1]. Loyverse : import/export, historique, fidélité [L10].
- Min. : téléphone comme clé, anti-doublon, solde, catégorie de prix, WhatsApp ; pipeline commercial inutile.

**20 Employés, commissions, paie**
- Sage : commissions représentants toutes gammes [G1] ; paie = autre produit. Loyverse : ventes par employé, pointage, 5 $/employé [L1]. Odoo : applis RH ; paie CI NV.
- Min. : ventes et commission par vendeur, avance sur salaire ; la paie légale reste souvent au comptable.

**21 Trésorerie**
- Odoo : journaux caisse et banque, rapprochement °. Loyverse : rien hors caisse.
- Min. : « où est mon argent » : chaque caisse, coffre, banque, Wave, Orange, MTN, Moov ; virements internes ; dettes et créances à venir.

**22 Comptabilité**
- Odoo : écritures à la clôture [O9]. Sage : sa force, connue des comptables. Loyverse : intégrations [L1].
- Min. : export propre au comptable (Excel, format Sage) avant une comptabilité complète ; bénéfice simple pour le patron.

**23 Tableau de bord, rapports**
- Odoo : graphique ou pivot, rapport de session [O23]. Sage : états, BI en option. Loyverse : article, catégorie, employé, mode, **31 jours gratuits** [L1].
- Ma Caisse : CA, nombre de ventes, panier moyen, bénéfice estimé du jour [P3]. eBoutik : produits qui dorment [P7].
- Min. : sur téléphone, en 10 secondes : vendu, encaissé, à crédit, bénéfice, par boutique ; dettes, ruptures, dormants, écarts de caisse.

**24 Utilisateurs, rôles**
- T9, T14. Odoo : rembourser, remiser, changer le prix dès « Basic » ; fermer la caisse exige « Advanced » [O15].
- Min. : PIN rapide sur poste partagé, accord du gérant sur place, coût et bénéfice cachés, droits par boutique, vendeur sans email.

### 2.4 Socle

**25 Paramètres, profils**
- Odoo : carte « type de commerce » préconfigurée, réglages ensuite dispersés par appli [O9]. Loyverse : interrupteurs de fonctions [L4]. eBoutik : « vous n'activez que les fonctions dont votre boutique a besoin » [P7].
- Min. : un choix de métier suffit ; rien de caché ne réapparaît ; TVA non assujetti invisible.

**26 Audit, pièces jointes, notifications**
- Sage : traçabilité des enregistrements, fichiers liés [G1]. Odoo : fil de suivi °. Loyverse : historique de stock, alerte stock bas [L1].
- Min. : qui a annulé, remisé, changé un prix ; alerte patron (écart, grosse remise, vente à perte) ; photo jointe.

**27 Documents imprimés**
- T15, T21. Odoo : reçu papier, email, SMS, WhatsApp ; QR vers la facture [O20]. Loyverse : logo et textes.
- Min. : 58 et 80 mm, Bluetooth, A4/A5, logo, téléphone, montant en lettres, mention duplicata, conditions de garantie. Un avis Karnet réclame le logo (29/10/2026) [P5].

**28 Déploiement, démo, sauvegardes**
- Odoo Online : sauvegardes quotidiennes, mises à jour incluses [O1]. Sage : SQL local ou cloud [G1]. Kweeli : « 2 minutes » ; Karnet : sans compte.
- Min. : essai sans rendez-vous, données de démo par métier, import accompagné, sauvegarde que le client voit, téléphone d'un humain le samedi.

**29 Mobile, recherche, hors ligne**
- T16. Référence à battre : créer un client et rembourser hors ligne, ce que Loyverse ne fait pas ; survivre à un rechargement, ce qu'Odoo déconseille.
- Min. : vendre pendant une coupure, état de synchro visible, recherche tolérante, scan par caméra, Android d'entrée de gamme.

**30 Manques** (sujet couvert : O Odoo, S Sage, L Loyverse ; (o) option ou palier payant ; – non)
| Sujet | O | S | L | Profil |
|---|---|---|---|---|
| Conditionnement à prix et code propres | O (caisse NV) | (o) | contournement | Alimentaire |
| Tarif par client et quantité | O | S | – | Grossiste |
| Variantes | O | (o) | L | Habillement |
| Série/IMEI + garantie | O (garantie en note) | (o) | – | Informatique |
| Péremption | O | (o) | – | Alimentaire |
| Promotions, fidélité | O | S (promotions) | L (points) | Tous |
| Frais d'approche | O | NV | (o) | Importateurs |
| Ticket en attente, échange | O | NV | L (attente) | Tous |
| Relance WhatsApp simple (wa.me) | – | – | – | Tous |
| Livreurs, commandes WhatsApp | – | – | – (eBoutik oui) | Habillement |

## 3. Cinq faiblesses de Sage et d'Odoo pour ce public

1. **Le prix monte par poste et par option.** Sage : variantes, séries/lots en option, conditionnement et droits par dépôt hors Essentials [G1] ; formation en plus [G2]. Odoo : facturé par utilisateur ; Capterra : personnalisation et support coûteux [A1].
2. **Complexité.** Odoo : apprentissage jugé raide et long (G2, Software Advice) ; un avis le déconseille aux petites entreprises peu techniques [A1]. Sage : interface « souvent jugée datée », paramétrage complexe, apprentissage long [A2].
3. **Dépendance à l'intégrateur.** Odoo : avis d'un dépassement de budget et de délai dû au tiers, mises à jour majeures qui cassent les modules spécifiques [A1] ; tout module spécifique (FNE, mobile money) exclut l'offre Standard (déduction de [O1]). Sage : partenaire certifié ; l'aide en ligne répond peu sur la gestion commerciale [A3].
4. **La caisse et les coupures.** Odoo : T16. Sage : produit caisse retiré selon son forum [G6].
5. **Les usages locaux demandent un montage.** Plafond non bloquant, unité en caisse, WhatsApp réservé à Enterprise, support par email en semaine [O1][O4][O12][O14].

**Lenteur : non prouvée.** Les plaintes trouvées visent *Sage 100 US*, un autre logiciel. Les notes Capterra/GetApp « Sage 100cloud » le mêlent aussi : à ne pas utiliser.

## 4. Dix attentes fréquentes

Les fiches d'applis disent ce que les éditeurs croient vendeur : indice, pas enquête.

| N° | Attente | Appui |
|---|---|---|
| 1 | Remplacer le cahier de crédit : qui, combien, depuis quand, versements partiels | Avis Karnet 16/09 et 25/10/2026 [P5] ; eBoutik [P7] |
| 2 | Relancer par WhatsApp, message prêt | Karnet, eBoutik, BokkCom |
| 3 | Vendre sans internet | Ma Caisse, Karnet, eBoutik ; cahier des charges gros/détail (11/11/2025) [D2] |
| 4 | Acheter en carton, vendre en pièce, stock juste | [D2] : 1 carton = 24 boîtes |
| 5 | Prix gros/détail automatique, crédit plafonné | [D2] ; crédit grossiste-détaillant documenté à Abidjan (2001) [D3], essai en cours sur 3 000 détaillants [D4] |
| 6 | Noter l'opérateur mobile money, paiement mixte, monnaie | Ma Caisse [P3] |
| 7 | Savoir si la caisse est juste le soir | Ma Caisse [P3] |
| 8 | Chaque vendeur a son accès et ne voit que l'utile | eBoutik [P7] |
| 9 | Corriger une erreur sans tout perdre | Avis « Cahier de Dettes » 04/05/2026 : impossible de modifier noms, montants, dates [P10] ; Karnet annule sans effacer |
| 10 | Bénéfice, ruptures et dormants vus à distance ; seules les fonctions utiles | Ma Caisse, eBoutik ; suivi à distance : hypothèse métier |

Hypothèses métier à confirmer en visite : négociation du prix au comptoir (d'où prix plancher), mise de côté avec acompte, échange sans ticket, prix changeant à chaque arrivage.

## Non vérifié

- Prix Sage en FCFA, guide export 2025 (site Sage refusé, 403, non réessayé) ; parts de marché en CI ; nombre de clients réels des outils locaux.
- Manuel Sage 100 GC : échéances, TVA, frais d'approche, dérogation d'encours. Seul le découpage fonctionnel a été lu (copie d'un revendeur français, 08/2025) ; offre ivoirienne peut-être différente.
- Remplaçant de la caisse Sage et son prix ; date exacte du message de forum.
- Choix natif du conditionnement dans la caisse Odoo 19 (doc muette, non testé) ; version Odoo postérieure ; Community fonction par fonction ; paie et plan comptable CI.
- Avis Odoo : lus en synthèse de recherche, Capterra en 403 ; dates et secteurs inconnus.
- Loyverse : crédit client, liste de prix, série, péremption (index seulement) ; paiement fractionné ; intégrations.
- Keiwa (page 403), Weebi, Djeli, Digicaisse : fonctions détaillées. Aucun outil n'a été testé.
- Aucune enquête récente auprès de commerçants ivoiriens de la cible trouvée.
- Toutes les mentions ° et « Min. ».

## Sources

Odoo, base `https://www.odoo.com/documentation/19.0/applications/` (lue dans le dépôt public odoo/documentation, branche 19.0) :
O1 odoo.com/pricing. O2 odoo.com/partners (veone-5100, consultech-773923, bdo-digital-921253), extraits. O3 inventory_and_mrp/inventory/product_management/configure/{uom,packaging}. O4 O3 + sales/point_of_sale/products ; apps.odoo.com/apps/modules/19.0/ywt_pos_multi_uom. O5 sales/sales/products_prices/prices/pricing. O6 sales/point_of_sale/extra/pricing. O7 sales/sales/products_prices/products/variants. O8 sales/point_of_sale/products. O9 sales/point_of_sale/use. O10 …/product_tracking/expiration_dates. O11 sales/point_of_sale/shop. O12 sales/point_of_sale/payment_methods/customer_credit. O13 finance/accounting/payments/follow_up. O14 productivity/whatsapp. O15 sales/point_of_sale/extra/employee_login. O16 sales/point_of_sale/payment_methods/terminals (liste des pages). O17 essentials/export_import_data. O18 …/inventory_management/{cycle_counts,count_products}. O19 …/inventory_valuation/landed_costs. O20 sales/point_of_sale/use/{pos_invoices,receipts}. O21 sales/sales/products_prices/returns. O22 inventory_and_mrp/purchase/manage_deals/control_bills. O23 sales/point_of_sale/reporting.

Sage : G1 [découpage fonctionnel](https://fyssec.fr/wp-content/uploads/2025/08/DF-Sage-100-Gestion-Commerciale-1.pdf). G2 [comparateur](https://lebonlogiciel.com/organisation-facturation-et-planification-gestion-commerciale-erp-gpao/sage-100-gestion-commerciale/prix/6) (MAJ 06/2026). G3 sage.com, guide tarifs export 2025 (extrait). G4 communityhub.sage.com/fr/sage-100, fil 260702 (extrait). G5 goafricaonline.com/ci/emploi (09/2025, 11/2025, 05/2026, extraits). G6 [forum](https://communityhub.sage.com/fr/sage-100/f/discussion-generale/245611/saisie-de-la-caisse-et-du-caissier-dans-sage-commercial/590486) (lu) ; sage.com/fr-ma, page saisie-de-caisse-decentralisee (extrait). G7 [découpage Comptabilité](https://www.grafe.fr/wp-content/uploads/2023/04/Fonctionnalites-de-Sage-100-Comptabilite.pdf) (04/2023).

Loyverse, base `https://help.loyverse.com/help/` : L1 loyverse.com/fr/pricing + advanced-inventory-management. L2 how-order-items-by-boxes. L3 how-use-variants-items. L4 open-tickets. L5 how-create-and-configure-discounts. L6 how-manage-access-rights-employees. L7 shift-management-loyverse-pos. L8 configuring-payment-types-loyverse. L9 importing-and-exporting. L10 index hardware, customers, settings. L11 offline-work-of-pos. L12 how-work-inventory-count. L13 how-work-additional-costs-purchase + index advanced-inventory. L14 how-work-cash-rounding.

Applis (Google Play CI, `play.google.com/store/apps/details?id=`) : P1 com.loyverse.sale. P2 https://www.kweeli.com/ (données structurées). P3 ci.pos.macaisse. P4 [AITN](https://afriqueitnews.com/tech-media/digicaisse-orange-business-revolutionne-gestion-commercants-senegalais/) (extrait). P5 com.karnet.karnet. P6 com.youssouphasba.stockman. P7 com.eboutik.eboutik. P8 apps.apple.com/us/app/bokkcom/id6758929272. P9 comeup.com/fr/service/527393 (extrait). P10 com.ndundu.cahierdedettes.

Avis et divers : A1 g2.com, capterra.com/p/135618, softwareadvice.com (Odoo, synthèses de recherche). A2 appvizer.fr, alternative-sage (extrait). A3 communityhub.sage.com/fr/sage-100, fil 201916 (extrait). D1 [blog I am Beezy](https://blog.iambeezy.app/fr/gestion-stock-pme-cote-ivoire-logiciels-gratuits-methodes-2026/) (27/03/2026). D2 [codeur.com 469719](https://www.codeur.com/projects/469719-notre-app-retail-wholesale-mobile-et-hors-ligne-pour-pme-africaines). D3 [IRD, Autrepart 2001](https://horizon.documentation.ird.fr/exl-doc/pleins_textes/pleins_textes_7/autrepart1/010026470.pdf) (extrait). D4 [AEA RCT 18537](https://www.socialscienceregistry.org/trials/18537) (11/05/2026).
