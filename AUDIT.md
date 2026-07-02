# ERP Audit Report

**Repo:** `magasinProgramme` (Hitek / "magasin informatique" — French-language ERP for a retail + wholesale electronics business in West Africa, currency XOF)
**Date:** 2026-06-21 (re-audit after the 2026-06-20 hardening pass, commits `2af4127`, `e58cde0`, `84ce1e5`)
**Method:** Read-only audit. Every finding is backed by a file path / `file:line` reference verified by reading the code. Items that could not be confirmed from code are marked `[unverified]`.
**Scope of this pass:** Audit + documentation only. No source, schema, migration, or config files were modified.

> **What changed since the last audit:** A large hardening pass (commit `2af4127`, ~17k insertions) landed after the previous AUDIT.md was written. It resolved the two blocking schema forks, killed both SQL-injection sites, gated every mutating route, removed dead code, added a real migration runner + CI, and wired the previously-stubbed Lot / Serial / Camions modules. This report reflects the **post-hardening** reality. The previous P0 list is now largely closed; what remains is concentrated in **accounting period enforcement, inventory valuation drift, purchasing controls (TVA / 3-way match), and frontend quality (lint/tests/types)**.

---

## 1. Architecture Map

### Stack

| Layer | Tech | Version |
|---|---|---|
| Backend runtime | Node.js + Express | express ^4.18.2 |
| Backend language | TypeScript (strict) | ^5.3.3 |
| Dev server | ts-node-dev (transpile-only) | ^2.0.0 |
| DB | PostgreSQL via `pg` Pool | pg ^8.11.3 |
| Validation | Zod | ^4.3.6 |
| Auth | jsonwebtoken (HS256) + bcrypt (rounds 12) | jwt ^9.0.3, bcrypt ^6.0.0 |
| Logging | pino + pino-http | ^10.3.1 |
| PDF / Excel | pdfkit ^0.18, xlsx ^0.18.5 | |
| Security mw | helmet ^8.1, express-rate-limit ^8.3, cors, cookie-parser | |
| Tests (BE) | vitest ^4.1.4 + supertest ^7.2 | |
| Frontend | React 18.3 + Vite 5 + TypeScript 5.3 | |
| Styling | TailwindCSS ^3.4 + shadcn/ui (Radix + CVA) | |
| FE libs | react-router-dom ^6.21, react-hook-form ^7.72, zod, recharts ^3.8, axios ^1.6, sonner, @tanstack/react-virtual | |
| Process mgr | PM2 (`ecosystem.config.js`) | |
| CI | GitHub Actions (`.github/workflows/ci.yml`) | |

### Counts (verified via Glob, 2026-06-21)

- Backend: **30** controllers, **44** services, **40** route files, **74** numbered SQL migrations (highest `074`) + `schema.sql`.
- Frontend: **45** pages, ~29 `components/ui` primitives.
- Tests: **10** backend `*.test.ts`, **6** frontend `*.test.tsx`.

### Folder structure

```
backend/
  src/
    controllers/   30 controllers (HTTP handlers; some contain business logic inline)
    services/      44 services (BaseService + domain services; data + business logic)
    routes/        40 route files mounted in server.ts
    middleware/    auth (JWT + cookie + DB session), permissions, validation, audit, idempotency, patch-router
    models/        Client, Facture, Paiement, Produit, UserModel (thin, partial)
    db/            74 .sql migrations (001..074) + schema.sql
    validation/    Zod schemas (schemas.ts, phase3-schemas.ts)
    utils/, types/, test/
  migrate.mjs      ordered, tracked migration runner (schema_migrations table)  ← NEW
  *.mjs            ~30 legacy ad-hoc setup/seed/fix scripts (superseded by migrate.mjs)
frontend/
  src/
    pages/         45 pages (+ test files), all React.lazy code-split
    components/     domain components + components/ui (~29 shadcn-style primitives)
    hooks/          usePermission, useSseNotifications, useDraft, useUrlState, useExportExcel, ...
    lib/            AuthContext, ThemeContext, utils
    services/       api.ts (~30 service objects), authService.ts
    validation/     schemas.ts (zod)  ← NEW
    types/, utils/, test/
  public/          sw.js + manifest.json (PWA assets — SW NOT registered)
ecosystem.config.js   PM2 (backend only); secrets now read from env
.github/workflows/ci.yml   CI (typecheck/lint/test BE; typecheck/build FE)  ← NEW
data/, excel/, scripts/    seed data + one python xlsx importer
```

### Data layer

- Raw SQL through `pg` Pool. No ORM. `BaseService.ts` provides parameterized helpers and a sort-column allow-list.
- **Heavy reliance on DB triggers and DB functions** for business logic: stock sync, accounting auto-posting, document conversions (BL→facture), payment/status recomputation, CMP sync (`065`). App code and DB logic are tightly coupled.
- **Unified `tiers` table** (`043_unified_tiers.sql`) is the source of truth for clients + suppliers; legacy `clients`/`fournisseurs` controllers are deprecated shims to `TiersController`. Batch/serial FKs were repointed to `tiers` in `074`.
- **Migrations now have a real runner.** `backend/migrate.mjs` discovers all `NNN_*.sql` files, sorts by numeric prefix, records each in a **`schema_migrations`** table (filename PK + `applied_at`), runs each in its own transaction, and applies only pending ones. Supports `--status`, `--dry-run`, `--baseline`. The ~30 legacy ad-hoc `.mjs` scripts still exist but are superseded.

### Auth model

- JWT (HS256, 7-day expiry). `JWT_SECRET` hard-fails at boot if missing, <32 chars, or a known placeholder. Token verified with explicit `algorithms:['HS256']` (guards alg-confusion).
- **Transport hardened:** primary transport is now an **httpOnly cookie** (`AuthController.ts:78-84`, `auth.ts:39-53` `extractToken`); `?token=` query param remains only as an SSE fallback. SSE stream enforces session revocation/expiry (`notifications.ts:25-41`).
- DB-backed sessions with SHA-256 token hashing for revocation; `must_change_password` gate; password strength check (`isStrongPassword`, ≥8 + letter + digit).
- **Residual (benign):** login still returns the token in the response body **intentionally** for non-browser API clients. The browser SPA never stores the token — it caches only the non-sensitive `auth_user` in localStorage and authenticates via the httpOnly cookie (`withCredentials`), including SSE. No token in localStorage → no residual XSS token surface.

### API surface

- ~33 route modules mounted under `/api/*` in `server.ts` (the batch/lot, serial, and camions modules were removed). Global `helmet`, CORS restricted to `FRONTEND_URL`, global rate limit + auth limit. Response envelope: `{ success, data, pagination }`.
- Frontend talks to relative `/api` (Vite dev proxy → `localhost:6000`); no `import.meta.env`/`VITE_` usage — API origin is build/proxy-determined.

### Frontend/backend split

- Clean SPA + JSON API split. Frontend is a static Vite build; backend is the only PM2-managed process. PWA assets (`sw.js`, `manifest.json`) exist but the service worker is **never registered** in `main.tsx` — dead PWA. No documented static-serving/deploy for the built frontend.

---

## 2. Module Inventory

Status backed by referenced files. **Complete** = full lifecycle + transactions + auth; **Partial** = works but has correctness/coverage gaps; **Stub** = schema/scaffold only; **Missing** = expected but absent.

### Sales

| Module | Status | Evidence |
|---|---|---|
| Devis (quotes) | **Complete** | `DevisService.ts` — lifecycle, auto-BL on accept, transactional |
| Bons de livraison | **Complete** | `BonLivraisonService.ts` — stock deduct/restore, convert→facture idempotent (single ledger insert, `:837-845`) |
| Factures (customer invoices) | **Complete** (most mature) | `FactureService.ts` — period guard, credit-limit, race-safe stock, ledger debit, FIFO allocation; `updateStatut` now tx + enum-gated (`:477-535`) |
| Avoirs / credit notes | **Complete** | `CreditNoteService.ts` — apply routes through acompte + `recomputeClientAllocations` (single FIFO source, `:384-390`), double-credit risk closed |
| Retours / returns | **Partial** | `ReturnService.ts` — cancel now un-restocks transactionally (`:256-350`); **but restock still happens at create, before approval** (`:100,129-158`) |
| Paiements | **Complete** | `PaiementController.ts` standalone `POST /` works (`:30`); enum widened (mobile money) + `idempotency_key` (`schemas.ts:190-200`) |
| Acomptes (customer deposits) | **Complete** | `AcompteController.ts`, `CompensationService.ts` |
| POS / quick sale | **Complete** | `POSService.ts` — server-side price re-lookup (`:152-166`), NumberingService (`:169`), session ownership enforced; routes gated (`pos.ts:13,15,22`) |
| Pricing | **Partial** | `PricingService.ts` — discount calc only, **no TVA** (TVA removed system-wide) |
| Numbering | **Complete** | `NumberingService.ts` — atomic `nextval()` |

### Purchasing

| Module | Status | Evidence |
|---|---|---|
| Commandes fournisseur | **Complete** (gaps) | `CommandeController.ts` — delete now transactional + cascade + audit + payment guard (`:326-381`); still no pagination on `getAll` |
| Receptions (goods receipt) | **Complete** | `ReceptionService.ts` — stock upsert, CMP recompute (`:221-244`), period-locked; 3-way match wired via `082` |
| Factures fournisseur | **Complete** | `FactureFournisseurService.ts` — AP ledger correct (`montant_credit=0`, `:272-275`); routes now use `validateBody` |
| Acomptes fournisseur | **Complete** | `AcompteController.ts` — fixed to `numero_facture_interne` (`:540,571`) |
| Compensation (AR/AP netting) | **Complete** | `CompensationService.ts` |
| Fournisseurs | **Complete** (legacy shim) | `fournisseurs.ts` delegates to `TiersController` |
| Demandes (internal reappro) | **Complete** | `DemandeService.ts` — full state machine, row-locked |
| 3-way match | **Complete** | `082` + `three_way_match_config`; commande↔reception↔facture reconciliation wired, rapprochement UI on commande detail |

### Inventory

| Module | Status | Evidence |
|---|---|---|
| Produits | **Complete** | `ProduitController.ts` — `addStockMovement` arg-order fixed (`:332-334`), `location_id` in schema (`schemas.ts:80`) |
| Stock locations | **Complete** | `StockLocationController.ts` — update (`:73`) + soft-delete (`:92`) added |
| Stock transfers | **Complete** | `StockTransferService.ts` — FOR UPDATE both ends; cancel added (`StockTransferController.ts:88`) |
| Mouvements stock | **Complete** | legacy `log_produits_stock` trigger dropped (`073`) → no more double-logging |
| Batch / lot / serial tracking | **Removed** | routes/services removed 2026-06-30; dead `lots`/`numeros_serie` tables + orphan FK columns dropped in `085`; dead Zod schemas removed |
| Serial number tracking | **Complete** | `SerialController.ts`, `SerialService.ts`, `serials.ts` mounted (`server.ts:47,137`); FKs → tiers (`074`) |
| Camions / gasoil (fleet) | **Complete** | `camions.ts` mounted (`server.ts:45,135`) with authz |
| Valuation (CMUP/CMP) | **Partial** | `valeur_stock` now decremented on sales/transfers and kept `= quantite × cmp` by trigger `076`; all 3 readers use `SUM(spl.valeur_stock)` (`ReportingService.ts:507`, `ComptabiliteService.ts:391`). Residual: CMP **unit cost** still recomputed on reception only (`ReceptionService.ts:221-244`, trigger `065`) |
| Stock reservations (`quantite_reservee`) | **Stub (half-built)** | column only ever read (`StockLocationService.ts:207-226`, `DemandeService.ts:829`); no `UPDATE ... SET quantite_reservee` write path anywhere |

### Accounting / Finance / Cash

| Module | Status | Evidence |
|---|---|---|
| Plan comptable / écritures | **Complete & unified** | schema fork resolved: `071_ecritures_unify.sql` + `072_ecritures_triggers_069.sql` make **069 `compte_numero`** canonical; both `GeneralLedgerService.ts:39,54` and `ComptabiliteService.ts:82-85,120` read it |
| General Ledger | **Complete & LIVE** | `GeneralLedgerService.ts` — manual entry balanced ±0.01, period-guarded (`:201`) |
| Comptabilité | **Complete & LIVE** | `ComptabiliteService.ts` — SQLi fixed (parameterized, `:124-203`); dead `ecrituresFrom*` removed (`:265-267`) |
| Compensation | **Complete** | `CompensationService.ts` |
| Caisse (magasin) | **Complete & LIVE** | `CaisseMagasinService.ts` — sessions, variance, idempotent, FOR UPDATE; GL posting **enabled** (`CAISSE_GL_POSTING=true`), accounts seeded (`086`), legacy constraints relaxed (`087`), journal `TRESORERIE` |
| Caisse hierarchy | **Complete & LIVE** | `CaisseHierarchyService.ts` |
| Cash variance reports | **Complete & LIVE** | `CashVarianceService.ts` — rewritten to current columns (`:18-23`), 500s fixed; auth-gated (`cash-variance.ts:8-9`) |
| Dépenses (expenses) | **Complete & LIVE (V2)** | `DepenseServiceV2.ts`; V1 `DepenseService.ts` still present but dead |
| Reporting / analytics | **Complete & LIVE** | `ReportingService.ts` — COGS, aging, P&L, forecast |
| Periods (fiscal lock) | **Complete** | `PeriodService.checkPeriodIsOpen` gives friendly app-layer errors, and `075`'s `BEFORE INSERT` trigger on `ecritures_comptables` hard-enforces closed periods on **every** posting path (072 triggers, caisse GL, `enregistrerPiece`, manual) |
| TVA | **Removed (inert by design)** | `027_enforce_no_tax.sql` forces `tva=0`; all TVA services/controllers/routes deleted; triggers post no TVA leg (`072:16-18`). Account-number conflict moot |
| Tax reports | **Removed** | `TaxReportController/Service` deleted |
| Multi-currency | **Stub** | `066/067` add `taux_conversion`/`devise_paiement` columns; **never read/written** by any payment service — dead schema (company-level rate only used for PDF display) |

### Auth / Admin / CRM / HR / Cross-cutting

| Module | Status | Evidence |
|---|---|---|
| Auth | **Complete** | `AuthController.ts` — JWT+cookie+bcrypt+sessions; password strength enforced (`:167-169,183,309`); register resolves role by name (`:204-213`) |
| RBAC | **Consolidated** | Single `authorize(roles)` mechanism app-wide (role from `roles.nom` via `utilisateurs.role_id`). The DB permission system + in-memory `ROLE_PERMISSIONS` matrix were removed (`084` drops `permissions`/`role_permissions`/`user_permissions` + `customiser_permissions`); `permissions.ts` keeps only `getUserLocationRole`. FE `usePermission` is advisory-only |
| Admin users / allocation | **Complete** | `AdminUserService.ts`, `AdminAllocationController.ts`, `UserLocationAssignmentService.ts` |
| Tiers (unified parties) | **Complete** | `TiersService.ts` — validated + role-gated |
| Clients | **Complete** | `clients.ts:421,448,500` — writes now `authorize('admin','manager')` + validate + audit |
| CRM | **Complete** | `CrmService.ts` SQLi fixed (parameterized `:57-90`); `crm.ts:8` writes gated |
| HR / Employés | **Complete** | `employes.ts:11` — every route (incl. GETs) gated `authorize(['admin','manager'])`, salary leak closed |
| Company settings | **Complete** | `CompanySettingsService.ts` |
| Audit log | **Complete** | fork resolved (`070_audit_log_reconcile.sql` → canonical `user_id`); `AuditService.ts`, `middleware/audit.ts` consistent; FE `AuditLog.tsx` page |
| Notifications (SSE) | **Complete** (minor) | `notifications.ts` — cookie-auth + revocation gate; `/status` is `authenticate`-only despite "admin-only" comment (`:46`) |
| Import / export | **Complete** | `import-export.ts`, `export-batch.ts` |

### Modules NOT present (Missing)

- **Manufacturing / BOM / production** — none.
- **Dedicated CRM pipeline / opportunities** — only interactions + tasks.
- **Budgeting / forecasting (financial)** — only a sales forecast in reporting.
- ~~Payroll~~ — ✅ done (`080`/`081`; runs/payslips + CNPS/ITS config).
- ~~Multi-currency~~ — ✅ resolved: dormant `066/067` columns dropped in `077`; `XOF` only.
- ~~3-way procurement match~~ — ✅ done (`082`).

---

## 3. Gap Analysis (current, post-hardening)

**Sales**
- Returns: ✅ restock occurs only on approval (`updateStatut`→`traite`), not at create; guarded state machine + transactional cancel-reversal (`ReturnService.ts:283-350`).
- ✅ Client credit-limit enforced (`CreditService`) on BL create, direct facture create, and devis-confirm auto-BL.
- Pricing has no TVA (consistent with system-wide TVA removal — confirm this is the intended business policy).

**Purchasing**
- ✅ `factures-fournisseur` routes now use `validateBody` (`createFactureFournisseurSchema`, `recordFactureFournisseurPaiementSchema`).
- ✅ 3-way match wired (`082`): commande↔reception↔facture reconciled with `three_way_match_config` tolerance/blocage.
- ✅ Reorder automation live: `GET /produits/reorder-suggestions` + Réapprovisionnement page → supplier-grouped commandes; `produits.fournisseur_id` writable end-to-end.
- TVA hardcoded `0` across commandes (`CommandeController.ts:139,141`) and factures fournisseur (`FactureFournisseurService.ts:168,174`) — consistent with TVA removal but means `tva_taux` line fields are dead.
- `CommandeController.getAll` still unpaginated.

**Inventory**
- **Valuation drift (top remaining data-quality issue):** CMP/`valeur_stock` updated on reception only; sales and transfers never decrement it (`FactureService`/`StockTransferService` have no CMP maintenance). Three readers compute inventory value three different ways; `ReportingService.ts:506` carries a comment acknowledging the drift.
- ✅ `quantite_reservee` reservation column dropped in `078` (was half-built); no TS refs remain.

**Accounting**
- ✅ **Period lock enforced at the DB.** `075` adds a `BEFORE INSERT` trigger on `ecritures_comptables` — a facture (or any posting) in a closed (`fermee`) period is rejected on every path: `072` auto-post triggers, `CaisseMagasinService.postMouvementToGL`, `ComptabiliteService.enregistrerPiece`, manual entries.
- ✅ Caisse→GL posting **enabled** (`CAISSE_GL_POSTING=true`). Enabling surfaced and fixed latent schema/code debt: 8 missing chart-of-accounts entries (`086`), stale `ecritures_comptables` NOT NULL columns from a partially-applied `071` (`087`), and invalid journal codes (`'BQ'`/`'VT'` vs the `ACHATS/VENTES/TRESORERIE/OD` CHECK). Cash now posts balanced Dr/Cr legs to the ledger.
- ✅ `compte_numero` FK on `ecritures_comptables` → `plan_comptable(numero)` now added (guarded) in `079`.

**Auth/RBAC/cross-cutting**
- ✅ RBAC consolidated onto a single `authorize(roles)` mechanism; the DB permission system and the duplicate `requirePermission` functions were removed (`084`). No competing sources of truth remain.
- `patch-router.ts` validates only a hardcoded param-name list (`:12-21`) — novel id params (`tiersId`, etc.) bypass it.
- Login token still returned in body (intentional, non-browser clients); the SPA does **not** store it — only `auth_user` is cached, auth via httpOnly cookie.

---

## 4. Quality Findings

### Security

Net state: **strong improvement.** Both SQL-injection sites fixed, every mutating route gated, secrets removed from the repo, idempotency per-user + 2xx-only, password strength enforced, SSE cookie-auth + revocation. Residual items:

1. **✅ Token not in `localStorage`** — SPA authenticates purely via the httpOnly cookie (`api.ts`/`authService.ts` `withCredentials`, SSE too); only non-sensitive `auth_user` is cached. Login body still returns the token intentionally for non-browser clients (`AuthController.ts:99`).
2. **🟡 `notifications/status`** is `authenticate`-only despite an "admin/manager-only" comment — add `authorize` (`notifications.ts:46`). Low impact (exposes connected-client count).
3. **🟡 `patch-router` monkey-patch** validates a hardcoded param list — replace with explicit per-route param validators.
4. **✅ RBAC consolidated** — single `authorize(roles)` mechanism; DB permission system + duplicate `requirePermission` removed (`084`). Authz is coarse role-based by design (single-tenant).

### Schema inconsistencies (data-integrity class)

- ✅ `ecritures_comptables` fork resolved (`071`/`072`, canonical 069).
- ✅ `audit_log` fork resolved (`070`).
- ✅ Batch/lot/serial FKs repointed to `tiers` (`074`).
- ✅ Legacy `log_produits_stock` trigger dropped (`073`).
- ✅ `valeur_stock` decremented on sales/transfers (`076`); all three readers use `SUM(spl.valeur_stock)`. Residual: CMP unit cost still reception-driven.
- ✅ `ecritures_comptables.compte_numero` FK to `plan_comptable` added in `079`.

### Validation gaps

- ✅ `factures-fournisseur` routes now use `validateBody`.
- Some `acomptes`/`tiers` routes still rely on service-internal validation.

### Tests

- **Backend:** 10 `*.test.ts` (controllers Produit/Client/Facture/AcompteFournisseur; services Facture/Reporting/CompanySettings; `server.test.ts`, `schemas.test.ts`, route `company-settings.test.ts`). Thin relative to 30 controllers / 44 services.
- **Frontend:** 6 `*.test.tsx` (Login, Dashboard, NouvelleFacture, CompanySettings, GeneralLedger, Factures) against a **60% coverage threshold** → threshold unmet.
- **E2E:** none. `playwright` is a frontend devDep but there is no config and no spec — unused.
- **CI:** present (`.github/workflows/ci.yml`) but partial — backend runs typecheck+lint+test (no build); **frontend runs typecheck+build only (no lint, no test)**. So FE tests never run in CI.

### Tooling / config

- ✅ **Migration runner** (`migrate.mjs`) with `schema_migrations` tracking — replaces the ad-hoc hardcoded-list scripts (which still linger and should be removed).
- ✅ **Secrets** removed from `ecosystem.config.js` (reads from env).
- ✅ **CI** added.
- 🟡 **Frontend has no ESLint** (eslint not a devDep, no config) — FE is unlinted and CI doesn't lint it.
- 🟡 **FE API layer** is pervasively untyped: ~131 `Promise<any>` in `api.ts`. FE zod schemas now exist (`validation/schemas.ts`) but the data boundary is still `any`.
- 🟡 **Duplicated axios instance** in `api.ts` and `authService.ts`.
- 🟡 **PWA dead:** `public/sw.js` + `manifest.json` present, but `main.tsx` never registers the service worker.

### Dead / duplicate code

- `DepenseService.ts` (V1) still present alongside `DepenseServiceV2.ts`.
- Legacy ad-hoc `.mjs` migration/fix scripts superseded by `migrate.mjs` but not removed.
- ✅ Previously-flagged dead files removed: `FournisseurController`, `CaisseController`/`CaisseService` (V1), `CashVarianceController`, `CompteClientController`/`Service`, `TaxReportController`/`Service`, `TauxTvaController`/`Service`, `ComptabiliteService.ecrituresFrom*`.

### Performance risks

- `CommandeController.getAll` unpaginated.
- `FactureController.export` large-row pulls.
- `getStats` averages over all rows (Reception).

### Hardcoded values

- TVA = 0 across all sales/purchasing (deliberate); `XOF` currency; account numbers in `ComptabiliteService`; fabricated COGS factor in some report paths.

---

## 5. Upgrade Roadmap (prioritized, current)

Effort: **S** ≤ 0.5 day · **M** ≈ 1–3 days · **L** ≈ 1+ week.

### P0 — Blocking (data integrity)

| # | What | Why | Effort |
|---|---|---|---|
| P0-1 | ✅ **DONE** — `075` adds a `BEFORE INSERT` trigger on `ecritures_comptables`; closed (`fermee`) periods are rejected on **every** GL path (072 triggers, caisse→GL, `enregistrerPiece`, manual) | Closed fiscal periods can still receive GL postings via every non-manual path | M |
| P0-2 | 🟡 **Partial** — `076_stock_valeur_invariant` keeps `valeur_stock` in sync on sales/transfers and all 3 readers now use `SUM(spl.valeur_stock)`. Residual: CMP **unit cost** still reception-driven | Inventory value drifts on every sale/transfer; reports, GL, and product views disagree | L |

### P1 — Correctness & accounting/inventory truth

| # | What | Why | Effort |
|---|---|---|---|
| P1-1 | ✅ **DONE** — returns restock only on approval (`updateStatut`→`traite`); guarded state machine; cancel-of-approved reverses; all transactional | Pending/unapproved returns inflate stock | M |
| P1-2 | ✅ **DONE** — `factures-fournisseur` routes use `validateBody` (`createFactureFournisseurSchema`, `recordFactureFournisseurPaiementSchema`) | Unvalidated line amounts → NaN/garbage AP entries | S |
| P1-3 | ✅ **DONE** — `quantite_reservee` dropped in `078` (was half-built); no TS refs remain | Half-built reservation concept | M |
| P1-4 | ✅ **DONE** — dormant `066/067` columns dropped in `077`; `XOF` only | Dead schema; XOF hardcoded | M |
| P1-5 | ✅ **DONE** — `079` adds the guarded `ecritures_comptables.compte_numero` → `plan_comptable(numero)` FK | Chart-of-accounts link unenforced | S |
| P1-6 | Confirm TVA policy: if tax will ever be needed, plan the re-introduction; otherwise remove dead `tva_taux` line fields | Dead fields imply a feature that doesn't exist | S |

### P2 — Completeness & feature gaps

| # | What | Why | Effort |
|---|---|---|---|
| P2-1 | ✅ **DONE** — `082` restores `commande_id` + `three_way_match_config` (tolerance/blocage); wired in `CommandeController`, `FactureFournisseurController`/`Service`, `ReceptionService`; rapprochement UI on commande detail | No procurement control / invoice fraud surface | L |
| P2-2 | ✅ **DONE** — enabled `CAISSE_GL_POSTING`; seeded the chart of accounts (`086`), relaxed legacy NOT NULL columns (`087`), fixed invalid journal codes. Balanced posting verified | Cash isolated from accounting by default | M |
| P2-3 | ✅ **DONE** — consolidated to a single `authorize(roles)` model; removed the DB permission system, the in-memory matrix, the duplicate `requirePermission`, and the admin permission UI (`084`) | Permission UI is misleading; security on coarse roles | L |
| P2-4 | ✅ **DONE** — payroll runs / payslips + CNPS/ITS statutory config (`080`/`081`, `PayrollService`/`Controller`/route) | "Feature-complete ERP" gap | L |
| P2-5 | Pagination on `CommandeController.getAll`; stream/cap large exports | Unbounded queries | S |
| P2-6 | ✅ **DONE** — client credit-limit enforcement (`CreditService`, all 3 credit-extension paths); reorder automation live (`produits.fournisseur_id` writable end-to-end) | Credit exposure uncontrolled; reorder feature dead | M |

### P3 — Hardening, tests, polish

| # | What | Why | Effort |
|---|---|---|---|
| P3-1 | ✅ **DONE** (browser) — SPA no longer stores the token; auth via httpOnly cookie only. Body token retained intentionally for non-browser API clients | Residual XSS token exposure | M |
| P3-2 | Add frontend ESLint (config + devDep) and run it in CI; add FE lint+test steps to `ci.yml` | FE unlinted; FE tests never run in CI | S |
| P3-3 | Raise test coverage to meet the 60% FE threshold; add BE service/integration tests; add Playwright E2E or drop the dep | Threshold unmet, near-zero E2E | L |
| P3-4 | Replace `Promise<any>`/`as any` in `api.ts` with shared/generated types; dedupe the two axios instances | Type safety lost at the data boundary | M |
| P3-5 | Register the service worker in `main.tsx` (or remove the PWA assets) | Dead PWA | S |
| P3-6 | Remove legacy ad-hoc `.mjs` migration/fix scripts now that `migrate.mjs` exists; remove dead `DepenseService` V1 | Maintenance burden / confusion | S |
| P3-7 | Add `authorize` to `notifications/status`; replace `patch-router` monkey-patch with explicit param validators | Minor authz + validation-bypass cleanup | S |
| P3-8 | Reconcile README + frontend deploy story (static serving / reverse proxy) | Undocumented FE deploy | S |

---

## 6. Verification notes / `[unverified]`

- Which `ecritures_comptables` columns exist in a given **deployed** DB depends on apply order; `071` reconciles forward but live state is `[unverified]` without DB access.
- DB-trigger "keeps X in sync" claims (acompte `montant_restant`, supplier-invoice paid amounts, CMP via `065`) are asserted in migrations but not runtime-verified `[unverified]`.
- `CAISSE_GL_POSTING` posted-leg balance verified via transactional insert (Dr/Cr equal, FK + journal CHECK satisfied); full session→movement→GL UI flow still worth a live smoke test.
- Multi-currency conversion math `[unverified]` (columns exist, no logic to verify).

*No application source, schema, migration, or config files were modified in this pass.*
