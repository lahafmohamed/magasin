# Feature-Gap & Usability Audit — Hitek ERP

**Date:** 2026-07-23 · **Scope:** full repo · **Method:** backend route inventory (36 routers / 300+ endpoints) cross-referenced against every frontend call site, module-by-module feature comparison against standard retail+wholesale ERP scope, UI-primitive adoption counts. Analysis only — no source changed.

Companion docs: [AUDIT.md](AUDIT.md) (code quality / refactor / security, 2026-07-22) · [PLAN.md](PLAN.md) (sprint tracking) · [CLAUDE.md](CLAUDE.md) (conventions).
This document covers what the code **does not do**; AUDIT.md covers how well it does what it does.

---

## 1. Executive summary

1. **Four complete backend modules have zero frontend.** `retours`, `pos`, `caisses-hierarchy`, `admin/allocation` — 24 endpoints, all authenticated, gated, validated and (partly) tested — are unreachable from the UI. This is the single largest gap: the features are already **paid for**, they just need screens.
2. **Customer returns do not exist for the user.** `ReturnService` implements a full restock state machine with period checks; `avoirService.createFromRetour()` sits in `api.ts` waiting for a `retour_id` that no screen can produce. Today a returned item is handled by a manual avoir with no stock movement.
3. **Money cannot move between caisses from the UI.** `caisses-hierarchy` owns caisse principale ↔ caisse magasin transfers, balances and the consolidated report. Zero call sites.
4. **The accounting period lock is unusable.** `periodes_comptables` + `PeriodService` + DB trigger `075` enforce closed periods on every GL path — but no route and no screen creates or closes a period. `checkPeriodIsOpen` is fail-open when no row exists, so in practice **nothing is ever locked**.
5. **No outbound communication at all.** Zero SMTP/mail dependency anywhere. Invoices, quotes and statements can only be printed or downloaded; nothing can be sent. This also blocks self-service password reset.
6. **Document coverage is one-sided.** PDFs exist for facture / devis / BL / avoir / payslip / relevé / bilan / compte de résultat. Missing: **bon de commande fournisseur** (the one document you send to a supplier), reçu de paiement, bon de réception, ticket de caisse.
7. **No account self-service.** No profile page, no voluntary password change (only the forced `must_change_password` flow), no user menu in the topbar, no password reset, no 2FA.
8. **Purchasing is missing its mirror half.** Client returns exist (backend); supplier returns / avoirs fournisseur do not exist at all. No RFQ, no landed cost (freight/customs into CMP) — material for an importer of electronics.
9. **Inventory has no physical count workflow.** Only ad-hoc `ajustement` movements. No stocktake sessions, no variance report, no blind count. Barcode scanning is built server-side and orphaned.
10. **Usability debt is concentrated in adoption, not capability.** The house primitives are good; they're just unevenly applied — `PageHeader` on 10/49 pages, `ResponsiveTable` 6/49 (11 pages still ship a raw `<table>`), `QueryState` 12, ~76 `<Label>` without `htmlFor`, zero breadcrumbs, 40 pages hand-rolling `useEffect`+fetch.

---

## 2. Backend → frontend coverage map

Every mounted route family, with the number of endpoints and whether the frontend reaches it.

| Mount | Endpoints | Frontend | Verdict |
|---|---|---|---|
| `/api/retours` | 5 | **none** | 🟥 **Orphaned module** — full return + restock workflow unreachable |
| `/api/pos` | 6 | **none** | 🟥 **Orphaned module** — session/quick-sale/barcode never called |
| `/api/caisses-hierarchy` | 10 | **none** | 🟥 **Orphaned module** — inter-caisse transfers, consolidated report |
| `/api/admin/allocation` | 3 | **none** | 🟥 Orphaned admin repair tool (low user impact) |
| `/api/comptes` (comptes-clients) | 7 | none | ➖ Deprecated shim → tiers. OK |
| `/api/fournisseurs` | 5 | none | ➖ Deprecated shim → tiers. OK |
| `/api/reports` | 13 | 6 used | 🟡 `/turnover`, `/pnl`-adjacent extras partially unused; Reporting page exposes 2 tabs |
| `/api/notifications` | 2 | SSE only | 🟡 Stream consumed; no persistence, no history |
| `/api/attachments` | 4 | ✅ | AttachmentPanel |
| all others (26 families) | — | ✅ | reached |

**Evidence:** grep of every route literal across `frontend/src` (`services/api.ts`, `pages/`, `components/`, `hooks/`). `/api/pos`, `/api/retours`, `/api/caisses-hierarchy`, `/api/admin/allocation` = 0 hits each. `frontend/src/App.tsx` has 47 routes, none for retours or POS.

---

## 3. Missing features

Priority: **P1** = blocks a real business operation · **P2** = significant friction or risk · **P3** = growth/nice-to-have.
Effort: **S** ≤ ½ day · **M** = 1–3 days · **L** = 1+ week.

### 3.1 Built but unreachable — best value per hour

| # | Feature | State | Work needed | Effort | Prio |
|---|---|---|---|---|---|
| F-1 | **Retours clients** (customer returns) | Backend complete: `routes/retours.ts`, `ReturnService` (restock on approval, guarded state machine, period-checked, reversal on cancel), Zod schemas, `avoirs/from-retour` | `retourService` in `api.ts` + `Retours.tsx` list + `NouveauRetour.tsx` (pick facture → lines → qty) + `RetourDetail.tsx` (approve/cancel) + nav entry | M | **P1** |
| F-2 | **Transferts inter-caisses** | `routes/caisses-hierarchy.ts`: caisse principale, per-magasin caisses, `POST /transferts`, transfer history, per-caisse balance, consolidated report | `caisseHierarchyService` + a "Trésorerie / Caisses" screen (tree of caisses, balances, transfer dialog, history) | M | **P1** |
| F-3 | **POS / ticket de caisse** | `routes/pos.ts`: open/close session, quick sale, session summary, `GET /scan` barcode | Decide: wire into `CaisseV2.tsx` (barcode field + quick-sale) or delete the slice. See AUDIT.md §4 | M | P2 |
| F-4 | **Allocation repair UI** | `POST /admin/allocation/recompute-all`, `/test/:clientId`, `/recompute/:clientId` (+ the new supplier-side `POST /tiers/:id/recompute-allocation`) | Admin maintenance panel button with confirm + result summary | S | P3 |

### 3.2 Never built — operational blockers

| # | Feature | Why it matters | Notes | Effort | Prio |
|---|---|---|---|---|---|
| F-5 | **Ouverture/clôture de période comptable** | Accountant can never close a month. Trigger `075` + `PeriodService` enforce the lock but nothing writes `periodes_comptables` — and no row = open, so the lock never fires in practice | Needs `periodes` routes (list/open/close/reopen) + a screen under Comptabilité; also a "period status" indicator on GL pages | M | **P1** |
| F-6 | **Bon de commande fournisseur (PDF)** | The only document you actually send to a supplier. Facture/devis/BL/avoir/payslip all have PDFs | `PDFService.generateCommandePDF` + `GET /commandes/:id/pdf` + button on `CommandeDetail.tsx` | S | **P1** |
| F-7 | **Reçu de paiement / quittance (PDF)** | Customer pays cash, gets nothing on paper | Same pattern via `PDFService`; also covers acompte receipts | S | **P1** |
| F-8 | **Retours & avoirs fournisseur** | Damaged/wrong goods sent back to a supplier have no representation: no stock-out, no supplier debit note, no effect on the 3-way match | Mirror of F-1 on the AP side (new table + service + screens) | L | P2 |
| F-9 | **Inventaire physique (stocktake)** | No count sessions, no blind count, no variance report, no bulk adjustment. Today: one-off `ajustement` movements per product | Count session → scan/enter counted qty per location → variance report → post adjustments in one transaction (with period check + GL écart posting) | L | P2 |
| F-10 | **Bon de réception (PDF)** | Nothing to file/sign against a delivery | `PDFService` + button on Receptions | S | P2 |
| F-11 | **Import Excel/CSV (produits, tiers, tarifs)** | Export exists on 8 pages; import exists only as CLI seeders. Onboarding a catalogue means the DBA runs a script | Upload → column mapping → dry-run preview → commit. Start with produits | M | P2 |
| F-12 | **Envoi par e-mail (SMTP)** | No mail infra at all. Cannot send an invoice, a quote, a statement, or a password reset | Infra decision first (SMTP provider). Unlocks F-13, F-17, F-22 | M | P2 |
| F-13 | **Réinitialisation de mot de passe** | A user who forgets their password needs an admin to reset it in the DB | Two options: **admin-reset button** (S, no infra, do this now) or token-by-email (M, needs F-12) | S / M | **P1** (admin-reset) |
| F-14 | **Page profil utilisateur** | No voluntary password change — `ChangePassword.tsx` is only reachable through the forced flow. No way to see your own role/locations/sessions | Profile page + user menu in `Topbar.tsx` | S | **P1** |
| F-15 | **Centre de notifications persistant** | SSE events are toasts that vanish; the bell covers `demandes` only via a 30 s poll. No table, no history, no read/unread | `notifications` table + list + mark-read; merge the demandes bell into it | M | P2 |
| F-16 | **Comptes bancaires & rapprochement** | Only cash (`caisse`) is modelled. `virement`/`chèque` are payment-method strings with no bank ledger, no statement import, no reconciliation | Bank account entity + movements + OFX/CSV statement import + matching UI | L | P2 |
| F-17 | **Gestion des chèques** | Cheques taken as payment have no due-date register, no remise-en-banque, no bounce handling | Cheque register with échéance + statut; ties into F-16 | M | P2 |
| F-18 | **Coût de revient complet (landed cost)** | Freight, customs and handling on imports never enter CMP, so margins on imported stock are overstated | Allocate cost lines across a reception, feed `StockCostingService` | M | P2 |

### 3.3 Never built — growth / maturity

| # | Feature | Notes | Effort | Prio |
|---|---|---|---|---|
| F-19 | **Numéros de série / garanties (RMA)** | Deliberately removed (tables dropped in `085`). For an **electronics** retailer this is a real business gap: no warranty lookup, no serial-based RMA. Worth an explicit re-decision, not silent absence | L | P2 |
| F-20 | Grilles tarifaires / prix par client | Only per-line `remise_pct/montant` + global discount. No customer price tiers, no volume breaks, no promo periods | M | P2 |
| F-21 | Variantes & kits/lots de produits | No colour/size variants, no bundles — each SKU is standalone | M | P3 |
| F-22 | Relance devis / factures impayées | `date_validite` is stored but nothing expires a quote or chases an overdue invoice. Aging report exists (`/reports/receivables`), dunning does not | M | P2 |
| F-23 | Factures récurrentes / abonnements | Absent | M | P3 |
| F-24 | RH: congés, absences, pointage, avances sur salaire | Payroll computes CNPS/ITS correctly but there's no leave balance, no attendance, no salary advance against payslip | L | P2 |
| F-25 | Budgets & prévisionnel | Absent (`/reports/forecast` is a revenue projection, not a budget) | L | P3 |
| F-26 | Immobilisations & amortissements | Absent | M | P3 |
| F-27 | Purge/rétention du journal d'audit | `audit_log` grows unbounded; sessions are already purged by `SessionCleanupService` | S | P2 |
| F-28 | Rapports non exposés | 13 report endpoints exist, the Reporting page shows 2 tabs; `/reports/turnover` and `/reports/consolidated` have no screen | S | P3 |
| F-29 | 2FA / TOTP | Absent | M | P3 |
| F-30 | Manuel utilisateur en français / aide contextuelle | Only the `Ctrl+/` shortcut sheet. No in-app help, no tooltips explaining CMP, FIFO acompte allocation, or the 3-way match | M | P2 |
| F-31 | Tableau de bord configurable | Static layout, same widgets for every role | M | P3 |
| F-32 | Portail client | Absent — customers cannot see their own statement/invoices | L | P3 |

---

## 4. Usability audit — what makes it feel unfriendly

Measured, not impressionistic. Counts over `frontend/src` (49 pages, 22 064 lines).

### 4.1 Structural

| Finding | Measure | Impact |
|---|---|---|
| No user menu in the topbar | `Topbar.tsx` is search + theme + bell + static name chip + logout | Nothing to click on yourself: no profile, no password change, no "my locations", no session info |
| Zero breadcrumbs | 0 hits repo-wide | On a detail page you have one back arrow and no idea where you are in a 6-level module tree |
| 40/49 pages hand-roll `useEffect` + fetch | `QueryState` used on 12 | Loading/error/retry behaves differently on almost every page; 5+ pages toast-and-blank on failure |
| `PageHeader` on 10/49 pages | | Page titles, actions and back-links sit in different places per screen |
| `ResponsiveTable` on 6/49; 11 pages ship a raw `<table>` | AuditLog, DemandesList, GeneralLedger, Receptions, Reporting, UserManagement, DemandeDetail, DemandeForm, NouveauDevis, NouvelleFacture | Those screens are horizontally-scrolling mush on a phone — and the shop floor is phone-first |
| God pages | Inventaire 1285, Dashboard 1174, CaisseV2 1058, TiersDetail 1035, Commandes 1013 | Slow to load, hard to scan, impossible to keep consistent |

### 4.2 Daily-driver friction

| Screen | Problem | Fix |
|---|---|---|
| **CaisseV2** (1058 lines, used all day) | Zero `autoFocus`, zero keyboard handling, zero shortcuts — every cash movement is a mouse trip through dialogs | Autofocus the amount field, Enter-to-submit, hotkeys for encaissement/décaissement, numeric keypad layout |
| **GlobalSearch** (`Ctrl+K`) | Searches 3 entity types (produits, tiers, factures) out of ~12. A product hit navigates to `/inventaire` **unfiltered** — you search, then search again | Add devis / BL / commandes / avoirs / réceptions / employés; deep-link product hits to `/inventaire?search=…` |
| **Reporting** | 2 tabs over 13 available report endpoints | Expose turnover + consolidated; add a report picker |
| Date filters (AuditLog, GeneralLedger, Comptabilite, Reporting, CaisseAudit) | Raw paired `<input type=date>`; no "ce mois / trimestre / année" presets | `DateRangePicker` with presets (the `date-picker.tsx` primitive already exists) |
| Dialog forms (UserManagement, Employes, Tiers, Inventaire, Commandes, StockTransfers, DepensesV2) | Closing the dialog silently discards everything typed; no field-level validation feedback (RHF document forms already do this right) | Unsaved-changes guard + migrate to RHF+zod (schemas already exist, unused) |
| Reapprovisionnement | Sequential PO-creation loop; a mid-loop failure leaves partial POs behind a toast counter | Per-supplier status rows + retry |
| Navigation | Flat role-filtered tree; no favourites, no recents, no "nouveau …" quick-create menu | Add a `+ Nouveau` action menu and recent-documents section |

### 4.3 Accessibility

| Finding | Measure |
|---|---|
| `<Label>` without `htmlFor` | 161 `<Label>` vs 85 `htmlFor` → **~76 unlabelled inputs**; worst: DepensesV2, StockTransfers, Tiers, TiersDetail (25×), CaisseV2 (8 fields) |
| Icon-only buttons without `aria-label` | Avoirs, Comptabilite, CommandeDetail, NotificationBell, DemandeForm (×5) |
| Keyboard nav | Fixed on `TiersPicker`, `GlobalSearch`, `DocumentPicker` (2026-07-22). Still mouse-only elsewhere |
| Dark-mode contrast | Light-only `bg-*-100 text-*-700` badge maps in Receptions, Avoirs, AuditLog, GeneralLedger |

### 4.4 Already healthy — don't touch

Zero `window.confirm`; full `sonner` adoption; `DatePicker` + chart colour tokens fully adopted; solid mobile drawer nav; print/PDF affordances on every detail page; `formatCurrency` now used everywhere (0 raw `.toFixed(2) XOF` sites left); `DocumentListPage` shared by list pages; `useConfirm` on 14 files.

---

## 4bis. Executed 2026-07-23

Work done in the same session as this audit, after the feature/UX split was agreed (tracks chosen: **PDFs manquants** + **UX sweep**).

**🟥 Bug found while testing — all four sales-document PDFs were dead.**
`PDFService` queried per-document line tables that no longer match the schema:
`facture_lignes` and `avoir_lignes` **do not exist** (SQL error → HTTP 500 on `GET /factures/:id/pdf` and `/avoirs/:id/pdf`), while `devis_lignes` and `bon_livraison_lignes` still exist but hold **0 rows** (silently produced a PDF with no lines and a 0 total). Every document line has lived in the unified `document_lignes` table since `043`. The header queries also joined `client_id`, which none of those tables have (`tiers_id`), and `generateAvoirPDF` read a table named `avoirs` that does not exist at all (the real one is `factures_avoir`). Nobody noticed because the detail pages use browser print, not the server endpoint. Fixed via one shared `getDocumentLignes(document_type, id)` helper + corrected joins; covered by a regression test that asserts the lines are actually found.

| # | Item | What shipped |
|---|---|---|
| F-6 | **Bon de commande fournisseur (PDF)** | `PDFService.generateCommandePDF` (supplier header, expected-delivery date, status, notes) · `GET /api/commandes/:id/pdf` · `commandeService.downloadPdf` · button on `CommandeDetail` |
| F-7 | **Reçu de paiement (PDF)** | `PDFService.generatePaiementRecuPDF` (amount box, invoice, method, total paid, remaining due, cashier, signature block) · `GET /api/paiements/:id/recu` · receipt button on every row of `PaymentHistory` |
| — | PDF regression suite | `PDFService.documents.test.ts` — 6 integration tests against the real DB (both new PDFs + facture/devis line rendering + two 404 paths) |
| — | `PaymentHistory` column drift | The Actions `<td>` was rendered conditionally while its `<th>` was not — "Acompte" rows shifted every column. Cell is now always rendered |
| F-14 | **Page profil + menu utilisateur** | `pages/Profil.tsx` (account card + password change with a live rule checklist) · topbar dropdown (profile / password / light-dark-system theme / logout) · route `/profil`, all roles |
| — | Password-policy mismatch | `ChangePassword` enforced ≥6 chars client-side while the server requires ≥8 + letter + digit — users were rejected after submit with a generic error. Shared `utils/password.ts` mirrors the server rule in both screens |
| — | **GlobalSearch scope** | Was 3 entity types; now also devis, bons de livraison and commandes, each source failing independently. Product hits deep-link to `/inventaire?search=…` instead of dumping you on an unfiltered list |
| — | **QueryState rollout** | Tiers, Employés, Journal d'audit, Commandes no longer toast-and-blank on a failed fetch — they show "Échec du chargement" + **Réessayer** |
| — | **CaisseV2 keyboard** | `E` = entrée, `S` = sortie, `O` = ouvrir la caisse (suppressed while typing or when a dialog is open); amount fields `autoFocus`; open-session and mouvement-divers dialogs are real `<form>`s so **Enter submits**. Clôture deliberately stays a click — it is irreversible. On-screen shortcut hint added |
| — | **Accessibility: label association** | Every `<Label>` in `pages/` and `components/` is now tied to its control — 171 labels, 0 orphans (was ~76 unlabelled). Group headings that never pointed at a single field became `<p>`; `TiersPicker` gained an `id` prop so `htmlFor` reaches its combobox input |

Verified: backend `tsc` clean · 0 lint errors · **295/295 backend tests** (+6) · frontend `tsc` clean · 0 lint errors · 24/24 frontend tests.

---

## 5. Recommended execution order

Ordered by value-per-hour, not by section.

**Wave 1 — unlock what already exists + account self-service (≈1 week)**
1. F-1 Retours clients UI — the biggest capability gain in the repo (backend is done and tested). **← next**
2. ✅ F-14 Profile page, topbar user menu, voluntary password change (2026-07-23). Remaining: F-13 admin password reset.
3. ✅ F-6 + F-7 Bon de commande fournisseur PDF + reçu de paiement PDF (2026-07-23) — plus the four broken sales-document PDFs repaired.
4. ✅ GlobalSearch scope + deep-links; CaisseV2 keyboard/autofocus (2026-07-23).

**Wave 2 — close the finance loop (≈1–2 weeks)**
5. F-5 Période comptable open/close (makes the existing DB lock real).
6. F-2 Transferts inter-caisses UI.
7. F-15 Persistent notification centre.
8. `PageHeader` + `ResponsiveTable` sweep over the remaining pages (QueryState and the `htmlFor`/`id` a11y pass are done — see §4bis); breadcrumbs; date-range presets.

**Wave 3 — new capability (project-sized, decide explicitly)**
9. F-9 Inventaire physique · F-11 Import Excel · F-12 SMTP → F-22 relances.
10. F-8 Retours fournisseur · F-18 landed cost · F-16/F-17 banque & chèques.
11. F-19 **Decision needed**: re-introduce serial numbers for warranty/RMA, or accept the gap in writing.

**Decisions that block work (need your answer, not more analysis)**
- F-3 POS barcode slice: wire it into CaisseV2, or delete it?
- F-19 Serial/warranty tracking for electronics: back in scope, or permanently out?
- F-12 E-mail: is there an SMTP account available, or do we stay print-only?
- F-16 Bank: is bank reconciliation in scope, or is the business genuinely cash-only?

---

*Feature-gap and usability audit, 2026-07-23. No source modified. Code-quality, security and refactor findings live in [AUDIT.md](AUDIT.md).*
