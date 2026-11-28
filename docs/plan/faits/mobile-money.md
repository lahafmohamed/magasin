# Mobile money CI : faits vérifiés au 25/11/2026

**Méthode.** Firecrawl n'est pas installé : WebSearch, WebFetch et téléchargement de pages publiques. Aucun fichier du dépôt modifié. **[NV]** = non vérifié. Kolonell, agence qui domine les résultats, vend des intégrations et se contredit : écartée.

## 1. Code actuel

**Modes (8) :** `espece, carte, cheque, virement, mobile_money, orange_money, mtn_money, wave` (`backend/src/utils/paymentMethods.ts:6-9`, repris par `validation/schemas.ts:8`). `compensation` s'ajoute pour acomptes et paiements fournisseur (l.22-25). **Moov n'a pas de mode propre.**

**Référence (varchar 100, facultative, sans unicité) :**
- `paiements.reference` (`ci-baseline.sql:3079`), `paiements_fournisseur.reference` (:3120), `reference_number` pour les acomptes (`AcompteService.ts:193`).
- Absente de `depenses` (:2159-2180) et de `mouvements_caisse` (:2929).
- Vente comptoir : l'API l'accepte (`schemas.ts:220`), **l'écran ne l'envoie pas** (`VenteComptoir.tsx:249`). `PaymentModal.tsx` l'envoie (l.147).
- Aucun statut « en attente de confirmation », webhook ni rapprochement relevé.

**Caisse :** un paiement client crée un mouvement si une session est ouverte, quel que soit le mode (`PaiementService.ts:321-334`). Seules les espèces exigent une session (l.235) et comptent dans l'attendu du tiroir (`CaisseMagasinService.ts:104-113`).

**Grand livre :**
- Mobile money → compte 54, **tout le reste → 53, carte, chèque et virement compris** (`CaisseMagasinService.ts:564-565`).
- Seulement si `CAISSE_GL_POSTING=true` (l.562) : `.env.example:13` = false, `.env` local = true, aucune mention dans `deploy/`.
- **Sans mouvement de caisse, pas d'écriture de trésorerie** : mobile money caisse fermée ; règlement de facture fournisseur, tous modes (`FactureFournisseurService.ts:435-457`, auxiliaire seulement) ; dépense hors espèces (`DepenseServiceV2.ts:127`).

WhatsApp : simple canal de relance (`Relances.tsx:36`), aucun lien wa.me.

## 2. Opérateurs directs

| | Wave | Orange Money | MTN MoMo | Moov |
|---|---|---|---|---|
| Compte et pièces | Wave Business ; pièces et délai CI [NV] | Marchand « KYA », siège CI, RCCM + DFE ; délai [NV] | KYC propriétaire + entreprise ; pièces CI et délai [NV] | Pièces marchand [NV] |
| Encaissement | Session checkout + lien, 30 min ; `restrict_payer_mobile` | Web Payment (OTP USSD), QR marchand, FastPay | RequestToPay asynchrone ; MoMoPay QR/USSD tous opérateurs | QR dans l'app ; API publique introuvable |
| Webhook | Oui, signé, relances 3 j | [NV] | Callback HTTPS | [NV] |
| Remboursement | Oui | API [NV] | [NV] | [NV] |
| Décaissement | Payout (annulable 3 j), lot, B2B | API [NV] | Bulk Payment ; API disbursement CI [NV] | Salaires ; API [NV] |
| Solde / relevé | Oui | [NV] | [NV] | [NV] |
| Sandbox | Non documentée (événement webhook de test seul) | Test avant production | Oui (EUR) ; prod `mtnivorycoast`, XOF | [NV] |
| Frais marchand | 20 000 F/j gratuits puis 1 % (page non datée, sans pays) ; CI [NV] | Contrat point de vente 2/1,5/1 %, en ligne 3/2,5/2 % selon volume (non datés) ; page d'accueil : 1,65 % en ligne, marchand gratuit. **Contradictoire** | [NV] | [NV] |
| Reversement | [NV] | En ligne mensuel ; point de vente, périodicité choisie par le commerçant | [NV] | [NV] |

**Wave au comptoir : oui techniquement, sans produit « caisse » documenté.** La doc ne parle pas de QR ; elle impose d'ouvrir `wave_launch_url` dans le navigateur du client, pas en webview. L'afficher en QR est une déduction à tester. `merchant.payment_received` (montant, frais, mobile) signale un paiement client ; déclenchement par le sticker QR statique [NV]. `GET /v1/transactions` : un jour par appel, frais et contrepartie, sous-comptes caissiers en option (`include_subaccounts`) ; `GET /v1/balance`. Liste blanche webhooks : 87.192.0.0/19 ajoutée en 10/2026.

Sources : docs.wave.com/{checkout,balance-api,payout,webhook,aggregated-merchants,b2b/payout}, lues 25/11/2026 ; wave.com/fr/business ; developer.orange.com/apis/om-webpay (+/faq) ; business.orange.ci/business/resources/other/{annexes_contrat_paiement_en_ligne,annexes_paiement_marchand_fastpay_small_business}.pdf ; mtn.ci/momo/business-2 ; momodevelopercommunity.mtn.com (config. production, 07/2024) ; moov-africa.ci.

**Voie simple / automatisée :**
- Wave : sticker + référence saisie / Checkout + webhook, puis relevé quotidien.
- Orange : QR ou FastPay + référence / Web Payment ou agrégateur.
- MTN : MoMoPay + référence / RequestToPay.
- Moov : QR + référence / agrégateur uniquement.

## 3. Agrégateurs

| | Portefeuilles CI | Frais | Reversement | Notes |
|---|---|---|---|---|
| Paystack | Wave, OM, MTN | 1,95 % HT (officiel) | 2 j ouvrés (support) ou 24 h (page tarifs) | Starter plafonné à 3 M XOF à vie ; sinon DFE + RCCM < 3 mois |
| CinetPay | 4 | OM 3 / MTN 1,8 / Wave 2 / Moov 2,5 % ; autre page officielle : 3,5 % (extraits de recherche, accès 403) | [NV] | Payout, liens. Cyberfraude 09/2025, dettes partenaires contestées (TechCabal 02/2026) ; agréé au 28/02/2026 |
| Hub2 | 4 | Non publiés | [NV] | Payin, payout, remboursement, liens, webhooks, sandbox ; **« Processing Only » = identifiants opérateur du marchand** ; PI-SPI en CI |
| PayDunya | 4 (SoftPay) | [NV] (403) | [NV] | Décaissement, sandbox |
| FedaPay | MTN, Moov, Wave, OM | MTN 4, OM 3,3, Wave 4 % (page ~1 an) | [NV] | Payout 150–2 500 F, contredit par son support |
| Bizao | [NV] | [NV] | [NV] | Doc officielle non trouvée |

Qui paie : prélevé au marchand chez Paystack ; ailleurs, souvent configurable [NV].

Sources : support.paystack.com/en/articles/{2130306,2124354,2123586} ; docs.hub2.io ; developers.paydunya.com (extraits) ; fedapay.com/tarifications ; cinetpay.com/pricing.

**Voie simple / automatisée :** Paystack : lien de paiement / API + webhook. Hub2 : lien / Processing Only. CinetPay, PayDunya, FedaPay : lien / API + décaissement. Bizao : rien d'établi.

## 4. Une clé par boutique, rôle de l'éditeur

- **Wave : oui.** Une clé par portefeuille, créée par l'Admin du marchand. L'API « Aggregated Merchants » est réservée à des partenaires choisis et inutile hors agrégation. Aucune exigence d'accord éditeur trouvée.
- **Orange :** la FAQ dit que qui fournit des services techniques pour un marchand doit s'enregistrer comme marchand : **à clarifier avec Orange CI**.
- **MTN :** go-live au KYC de l'entreprise, donc par boutique ; accord éditeur [NV].
- **BCEAO, instruction 001-01-2024** : initiation et acquisition de paiements sont des services réglementés (art. 4) ; je n'y ai pas trouvé d'exclusion explicite du prestataire technique. Ne jamais détenir les fonds réduit l'exposition (déduction) ; avis juridique [NV].

## 5. PI-SPI

- Lancée 30/09/2025. Connexion due au **30/09/2026** (banques, EME, EP) et **30/06/2027** (microfinances) (BCEAO 25/06/2026).
- Depuis le **02/11/2026**, toute transaction interopérable de monnaie électronique passe par PI-SPI. Gratuit ≤ 8 000 F cumulés/jour, puis 0–0,8 % ; réception gratuite ; inter-pays au 01/06/2027 (BCEAO 02/10/2026). **Ce barème vise les personnes physiques.**
- CI : 38 participants, dont Orange, MTN, Moov et Wave (Sika Finance 02/10/2026).
- **Aucune obligation pour les commerçants trouvée.** Frais d'encaissement marchand « librement fixés par le participant » ; demande de paiement via API Business gratuite ; certificat personne morale 20 000 F (règles BCEAO v1.0, 06/2024, révision possible).
- **API Business** : sandbox ouverte aux entreprises et fournisseurs de logiciels depuis 13/11/2025 (developer.pispi.bceao.int). En production, via une API homologuée (34 au 09/11/2026). CI (11) : Ecobank, Mansa, Standard Chartered, MTN MFS, Orange Money CI, Fidra, Connekt4, Julaya, Paymetrust, Syca, TouchPoint. **Wave et Moov absents.** (bceao.int, liste 09/11/2026)
- QR marchand interopérable annoncé ; usage réel en boutique CI [NV].

**Voie simple :** QR PI-SPI du prestataire. **Voie automatisée :** API Business d'un participant homologué, ou Hub2.

## 6. WhatsApp

- **Cloud API** : facturée au message livré. CI (+225) est dans « Rest of Africa ». Au 01/10/2026 : utilitaire, authentification et service **0,0040 USD**, marketing 0,0225 USD (SleekFlow, MAJ 11/11/2026 ; grille Meta non ouverte). Depuis cette date, l'utilitaire est payant même dans la fenêtre de 24 h ; 1 000 messages de service gratuits par mois et par numéro ; moyen de paiement exigé (Meta, developers.facebook.com). Compte Business, modèles approuvés et consentement requis : non relus.
- **wa.me** : lien avec texte prérempli, envoi manuel (FAQ WhatsApp) ; aucune facturation Meta connue. Le lien ne porte que du texte : pas de PDF, donc lien vers la facture (déduction). Pas d'accusé.

**Voie simple :** wa.me. **Voie automatisée :** modèle utilitaire avec PDF.