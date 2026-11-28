# FNE / RNE Côte d'Ivoire : faits vérifiés au 25/11/2026

Sauf mention contraire, les textes DGI cités ont été lus directement. [n] renvoie aux sources en fin de rapport.

## 1. Qui, depuis quand
- Obligation pour **toutes les entreprises, quel que soit le régime** (arrêté 0337 du 09/05/2025, art. 2) [1]. Dispenses (LPF art. 145) : pharmacies, banques, carburant en station… Aucune ne vise l'informatique, l'alimentaire ou l'habillement [2].

| Régime | CA TTC [3] | Entrée en vigueur [1] | Fin du papier [4][5] |
|---|---|---|---|
| RNI | > 500 M | 01/06/2025 | 01/12/2025 |
| RSI | 200 000 001–500 M | 01/07/2025 | 01/12/2025 |
| RME | 50 000 001–200 M | 01/08/2025 | 11/12/2025 |
| TEE | 5 000 001–50 M | 01/09/2025 | 22/12/2025, puis 13/02/2026 (B2B/B2G) |
| TCE | en dessous | 01/09/2025 | Non pris en charge par la plateforme [2], pourtant visé par les contrôles [6] |

- Inscriptions closes le 31/01/2026 ; l'inscription conditionne l'attestation de régularité fiscale [5].
- **Contrôles nationaux depuis le 01/09/2026** (communiqué du 21/08/2026) [6]. Les commerçants (FENACCI) demandent le report (presse, 30/08–05/09/2026) ; aucun report trouvé au portail, consulté le 25/11/2026.
- Annexe 2026 (projet) : seule retouche trouvée, la dispense transport [7]. Annexe 2027 adoptée en commission le 13/11/2026 ; la presse ne signale rien sur la FNE [8].

## 2. FNE ou RNE
- **FNE** : B2B, B2C, B2G, B2F, par la plateforme, l'application ou l'API [9].
- **RNE** : B2C, et B2B entre forfaitaire et réel [9]. Émis par TERNE ou appli RNE. Public du TERNE : RME/TEE, **réels disposant d'une caisse enregistreuse**, magasins à rayons multiples [2] (l'arrêté, art. 3, ne cite pas le deuxième cas [1]).
- **Un ticket 80 mm seul ne suffit pas** : visuel FNE, QR code et numéro certifié sont exigés ensemble [1]. Les magasins à rayons multiples doivent accompagner le ticket d'un RNE [5].
- **L'API ne crée pas de RNE** : `invoiceType` = `sale` ou `purchase`. `isRne`/`rne` rattachent une FNE à un RNE déjà émis [10], sans double comptabilisation [2].
- Seuil : l'arrêté (art. 7) n'oblige les forfaitaires qu'à partir de 5 000 F, hors opérations entre professionnels [1] ; la FAQ dit « quel que soit le montant » [2]. **Contradiction non levée.**

## 3. TVA
- Être assujetti n'est pas requis. RME et TEE **ne peuvent pas facturer la TVA** [3] ; seuls RNI/RSI le peuvent (communiqué du 14/09/2026) [11].
- Codes API : TVA 18 %, TVAB 9 %, TVAC 0 % (exonération conventionnelle), **TVAD 0 % « exec leg pour TEE et RME »** [10]. Un vendeur non assujetti émet donc une FNE en TVAD. Aucune mention textuelle spécifique trouvée ; le régime d'imposition doit figurer (art. 6) [1].
- L'« exo export » existe sur la plateforme [12], pas au lexique API.

## 4. Technique (guide API de mai 2025 [10])
- REST/JSON, POST, `Authorization: Bearer <clé API>`. Clé propre à chaque entreprise, visible du seul gestionnaire principal après validation DGI.
- Test : `http://54.247.95.108/ws` (HTTP simple). Production : URL remise après validation.
- **Vente** : `/external/invoices/sign`
  - En-tête : `invoiceType`, `paymentMethod` (**une seule valeur** : cash, card, check, mobile-money, transfer, deferred), `template` (B2B/B2C/B2G/B2F), `isRne`, `rne`, `clientNcc` (B2B), `clientCompanyName`, `clientPhone`, `clientEmail`, `clientSellerName`, `pointOfSale`, `establishment`, `commercialMessage`, `footer`, `foreignCurrency`, `foreignCurrencyRate`, `customTaxes`, `discount`.
  - `items[]` : `taxes[]`, `customTaxes[]`, `reference`, `description`, `quantity`, `amount` (**PU HT**), `discount`, `measurementUnit`. Les remises sont des **pourcentages** (guide [12] ; l'exemple API le confirme par calcul).
- **Réponse** : `ncc`, `reference`, `token` (URL à convertir en QR), `warning`, `balance_sticker`, `invoice` (dont `id`, `items[].id`, `fiscalStamp`).
- **Avoir** : `/external/invoices/{id}/refund`, uniquement `items[{id, quantity}]` ; référence préfixée « A ». Le prix n'est pas modifiable [12].
- **Bordereau** (`purchase`) : achats de produits agricoles seulement.
- Erreurs documentées : 400, 401, 500.
- **Conformité exigée depuis le 29/10/2026** [11] : NCC 7 chiffres + lettre ; téléphone 10 chiffres (01/05/07/21/25/27) ; e-mail et téléphone en B2B ; devise et taux en B2F ; aucune valeur négative. Sinon, suspension de la clé.
- **Deux procédures** :
  - Entreprise : tests, envoi de spécimens, validation (vaut acceptation [13]).
  - Éditeur agréé : résidence fiscale ivoirienne, attestation de régularité, CNPS, contrôle technique dans ses locaux [14].
- **Sticker** : FNE 20 F ; RNE 0 F jusqu'à 5 000 F, 15 F au-delà, 25 F si > 100 000 F en espèces [15]. Il ne remplace pas le timbre de quittance [2]. Solde épuisé : 48 h, puis blocage [2].
- **Hors ligne : aucune procédure ni délai publiés.** Connexion stable exigée ; une facture sauvegardée non générée n'est pas certifiée [12].
- **Mentions** (art. 6) : raison sociale, adresse, RCCM, banque, NCC, identifiant unique, régime, service des impôts, client et son NCC, numéro, date **et heure**, articles, prix, taux, total, règlement [1]. Numéro = NCC + année + séquence.

## 5. Sanctions
- Amende par facture / plafond par contrôle : RME 10 000 / 500 000 ; RSI 30 000 / 3 M ; RNI 50 000 / 10 M. **Sources secondaires** [16] ; TEE comme RME selon Lookuptax seul. LPF art. 168 non lu.
- Textes lus : charges et TVA non admises sans FNE [5] ; contrôle « sortie magasin » (13 bis) et déconnexion frauduleuse pénale (171 bis) [17].

## 6. Concurrents
- **Liste DGI du 28/11/2025, « non exhaustive »** [18] : AB Soft Work (Sage 100/1000/X3, Excel), Minlessika (son logiciel, Excel), Novasoft (Sage 100/1000), Progici (Kompto). TERNE : Green Pay seul. **Odoo n'y figure pas.**
- Sage : module annoncé pour 100, X3, FRP1000 (09/12/2025) [19].
- Odoo : modules tiers `l10n_ci_fne_*` (facture, avoir, POS) **dépubliés** ; un extrait de recherche dit leur éditeur non agréé. Devax Technologie propose Odoo + API FNE [20].
- EDICOM et un partenaire SAP communiquent aussi sur le sujet (agrément DGI non vu).

## 7. Modèle de données minimal (système sans taxe)
- **Vendeur** : NCC, régime, RCCM, centre des impôts, références bancaires, identifiant unique ; clé API et URL par environnement.
- **Emplacement et caisse** : `establishment` et `pointOfSale`, créés d'abord sur la plateforme ; **un point de vente = une caisse** [12].
- **Client** : type B2B/B2C/B2G/B2F, NCC (format contrôlé), téléphone 10 chiffres, e-mail.
- **Ligne** : code taxe figé, PU HT, remise en %, unité, `fne_item_id`.
  - RME/TEE : TVAD partout ; aucun calcul de TVA nécessaire.
  - RSI/RNI : **taux par produit, HT/TVA/TTC et comptabilisation indispensables** ; l'actuel `tva=0` ne convient pas.
- **Facture** : correspondance vers les 6 modes (règle pour paiements mixtes), timbre de quittance, autres taxes (ex. AIRSI), `fne_id`, référence, token/QR, date-heure, solde sticker, statut, erreur, tentatives.
- **Avoir** : id FNE d'origine + `fne_item_id` + quantité ; un avoir en montant pur n'a pas d'équivalent dans l'API.
- **RNE** : numéro lié à la vente.
- Journal des appels et idempotence locale (aucune clé d'idempotence documentée).

## Non vérifié
- Texte de LPF 145 et 168 ; fermeture à 72 h (Lookuptax seul).
- Texte intégral des annexes 2026 promulguée et 2027.
- Liste d'agréés postérieure au 28/11/2025 ; version du guide API postérieure à mai 2025 (malgré le communiqué de septembre 2026).
- Protocole logiciel de caisse ↔ TERNE ; obligation stricte du TERNE pour un réel émettant des FNE B2C par API ; validité d'une FNE imprimée en 80 mm.
- E-mail/téléphone en B2C : obligatoires selon le guide [10], l'e-mail ne l'est qu'en B2B selon [11].
- Avoir ou remise en montant par API ; OAuth 2.0/certificat (cité en prérequis, l'exemple utilise une clé Bearer).
- Date du document de seuils [3] (seuils concordants chez Lookuptax, 03/11/2026).
- Anomalie : au portail, le communiqué « prorogation » listé au 05/09/2025 pointe vers un fichier « HTTP Request Splitting vulnerabilities exploitation.pdf » (non ouvert).

## Sources (base = https://www.fne.dgi.gouv.ci/)
1. base/documents/arrete_0337_modalites_fne_2025.pdf (09/05/2025)
2. base/faq.php (consultée 25/11/2026)
3. https://www.dgi.gouv.ci/assets/documents/LE%20SYSTEME%20FISCAL%20IVOIRIEN.pdf (non daté)
4. base/uploads/communiques/COMMUNIQUE%20MISE%20EN%20OEUVRE%20DE%20LA%20FNE.pdf (05/09/2025)
5. base/uploads/communiques/pdf_69793fb80d317_FIN_DE_L_USAGE_DE_LA_FACT_NOR_PHYSIQUE.pdf (27/01/2026)
6. base/uploads/communiques/pdf_6a90297b2bf0b_communique_controle_fne_210826.pdf (21/08/2026)
7. https://www.dgbf.ci/wp-content/uploads/2025/11/Annexe1-Annexe-Fiscale.pdf (projet, 11/2025 ; art. 145)
8. https://www.aip.ci/cote-divoire-aip-annexe-fiscale-2027-les-deputes-adoptent-a-lunanimite-41-mesures-fiscales/ (14/11/2026)
9. base/documents/FNE-Pr%C3%A9sentation.pdf (03/2025)
10. base/documents/FNE-procedureapi.pdf (05/2025)
11. base/uploads/communiques/pdf_6aa92f4c0b766_COMMUNIQUE_MISE_EN_CONFORMITE_FNE.pdf (14/09/2026)
12. base/documents/FNE-Guide%20utilisateur.pdf (05/2025)
13. base/uploads/communiques/pdf_6858408c37d36_utilisation.pdf (13/06/2025)
14. base/uploads/communiques/pdf_689ca778df072_communique_procedure_agrement_editeurs_solution_fne_12_08_25.pdf (12/08/2025) ; base/documents/Formulaire_agrement_editeurs_integrateurs_solutions.pdf
15. base/uploads/communiques/COMMUNIQUE%20_COUT_STICKERS_FNE.pdf (15/09/2025)
16. https://www.lookuptax.com/docs/einvoicing/fne-einvoicing-cote-divoire (03/11/2026) ; https://fr.apanews.net/technologies/rci-impots-les-sanctions-liees-a-la-facture-electronique/ (page en 403, montants vus par résumé de recherche, URL probable) ; https://erooamba.com/posts/fne-facture-normalisee-electronique-cote-ivoire-2026 (blog)
17. base/documents/annexe-fiscale.pdf (annexe 2025, art. 6, version projet)
18. base/documents/entreprises_agrees_FNE.pdf (28/11/2025)
19. https://www.financialafrik.com/2025/12/09/sage-lance-sa-solution-de-conformite-a-la-facture-normalisee-electronique-en-cote-divoire/
20. https://apps.odoo.com/apps/modules/19.0/l10n_ci_fne_pos ; https://tally.so/r/LZQ8Jl

Méthode : CLI Firecrawl absente, donc WebSearch/WebFetch. WebFetch refuse le certificat incomplet du portail FNE. Un `curl` avec contrôle TLS désactivé a été bloqué par le contrôle d'autorisation et non réessayé ; les documents publics ont été téléchargés par PowerShell, TLS vérifié, client générique. Aucun fichier du dépôt modifié.