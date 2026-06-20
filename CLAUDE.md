# CLAUDE.md

Guidance for working in this repository. Reflects the **actual** current state of the code (audited 2026-06-20), not aspirations. For the full gap/quality analysis and roadmap see [AUDIT.md](AUDIT.md).

## Project Overview

French-language **ERP** for a retail + wholesale electronics business ("magasin informatique", brand "Hitek", currency **XOF**). Covers sales (quotes → delivery notes → invoices → payments/credit notes), purchasing (orders → receptions → supplier invoices → payments), multi-location inventory with weighted-average costing, cash registers (caisse), basic accounting/general ledger, HR (employees/commissions), light CRM, reporting, and role-based admin.

- UI, data, and error messages are in **French**. Match that when adding user-facing strings.
- Single-tenant, multi-location (magasins + dépôts). Money is `NUMERIC(15,2)`.

## Tech Stack

**Backend** (`backend/`)
- Node.js + **Express ^4.18** + **TypeScript ^5.3** (`strict: true`)
- **PostgreSQL** via `pg ^8.11` Pool — **raw parameterized SQL, no ORM**
- **Zod ^4.3** validation · **jsonwebtoken ^9** (HS256, 7-day) + **bcrypt** (rounds 12)
- **pino** logging · **helmet**, **express-rate-limit**, **cors** · **pdfkit**, **xlsx**
- Dev: `ts-node-dev`. Tests: **vitest ^4.1** + **supertest**

**Frontend** (`frontend/`)
- **React 18.3** + **Vite 5** + **TypeScript ^5.3** (`strict: true`)
- **TailwindCSS ^3.4** + **shadcn/ui** style (Radix primitives + `class-variance-authority` + `cn()`)
- **react-router-dom ^6.21** (lazy routes) · **react-hook-form ^7.72** + **zod** · **axios ^1.6** · **recharts ^3.8** · **sonner** toasts · **@tanstack/react-virtual**
- Tests: **vitest** + Testing Library + jsdom. `playwright` is a dep but **unused** (no config/specs).

**Ops:** PM2 (`ecosystem.config.js`) manages the **backend only**. Frontend is a static Vite build (no deploy step in repo).

## Architecture

```
backend/src/
  controllers/   HTTP handlers (38). Some hold business logic inline (e.g. CommandeController)
  services/      Domain + data logic (47). Extend BaseService (parameterized helpers, sort allow-list)
  routes/        Express routers (41), mounted in server.ts under /api/*
  middleware/    auth (JWT+authorize), permissions, validation (Zod), audit, idempotency, patch-router
  models/        Thin partial models (Client, Facture, Paiement, Produit, UserModel)
  db/            72 .sql migrations (001..069) + schema.sql. Triggers/functions hold core logic
  validation/    Zod schemas (schemas.ts, phase3-schemas.ts)
  *.mjs          ~30 ad-hoc setup/seed/fix scripts (NOT a unified migration system)
frontend/src/
  pages/         45 pages (+ 4 *.test.tsx), all React.lazy code-split
  components/     domain components + components/ui (~29 shadcn-style primitives)
  hooks/          usePermission, useSseNotifications, useKeyboardShortcuts, useDraft, ...
  lib/            AuthContext, ThemeContext, utils
  services/       api.ts (~1770 lines, ~30 service objects), authService.ts
```

- **Request flow:** route → `authenticate` → `authorize`/`validateBody` → controller → service → SQL/transaction. Response envelope: `{ success, data, pagination }`.
- **DB-centric logic:** many invariants live in Postgres triggers/functions (stock sync, accounting auto-posting on invoice insert, BL→facture conversion, status/payment recompute). When touching financial or stock flows, check both the service **and** the relevant migration.
- **Unified `tiers` table** (clients + suppliers; `043_unified_tiers.sql`) is the source of truth. `clients`/`fournisseurs` routes are deprecated shims to `TiersController`.
- **Auth:** JWT in `Authorization: Bearer`; DB-backed sessions (SHA-256 hash) for revocation; `must_change_password` gate. Frontend stores token in `localStorage`.

## Run / Build / Test / Deploy

Database: PostgreSQL. Backend reads `DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME`, `JWT_SECRET` (must be ≥32 chars, not a placeholder — boot fails otherwise), `JWT_EXPIRATION`, `FRONTEND_URL`, `PORT` from a `.env` (dotenv).

**Backend** (`cd backend`)
```bash
npm install
npm run dev            # ts-node-dev, http://localhost:<PORT> (dev 6000, prod 6100)
npm run build          # tsc → dist/
npm start              # node dist/server.js
npm run lint           # eslint src/ (backend only)
npm run format         # prettier
npm test               # vitest run
npm run test:coverage  # vitest + coverage
# DB setup is script-based (no unified migration runner):
node setup-db.mjs            # / setup-db-phase1.mjs, setup-erp-modules.mjs, ...
node run-migrations.mjs      # ⚠ runs only a HARDCODED subset (030–035)
node seed-data.mjs           # / seed-hitek-demo.mjs, seed-clients-excel.mjs, ...
```
> ⚠ There is **no ordered, tracked migration framework**. Migrations are applied by ad-hoc `.mjs` scripts with hardcoded file lists. Order is implicit; some migrations redefine the same table with `CREATE TABLE IF NOT EXISTS`. Verify schema state manually after setup.

**Frontend** (`cd frontend`)
```bash
npm install
npm run dev            # vite, http://localhost:6001 (proxies /api → :6000)
npm run build          # tsc -b && vite build
npm run preview
npm test               # vitest run (60% coverage threshold configured; currently unmet)
```
> Frontend has **no ESLint config** (eslint not installed). No `import.meta.env`/`VITE_` usage — API origin is the Vite proxy in dev; for prod the built SPA must be served behind something that proxies `/api` (not configured in repo).

**Deploy**
```bash
pm2 start ecosystem.config.js   # backend only (app "hitektest-api", dist/server.js)
```
> `ecosystem.config.js` currently hardcodes `JWT_SECRET`/`DB_*` — move these to an untracked env before any real deployment. Frontend static-serving is undocumented.

**CI:** none (no `.github/workflows`). Lint/test/build are manual.

## Module Status

Legend: ✅ Complete · 🟡 Partial · 🟥 Stub/Dead · ➖ Missing. Full evidence in [AUDIT.md](AUDIT.md) §2.

| Domain | Module | Status |
|---|---|---|
| Sales | Devis, Bons de livraison, Factures, Acomptes, Paiements*, POS*, Numbering | ✅ |
| Sales | Avoirs/credit notes (double-credit risk), Retours (no un-restock), Pricing (no TVA) | 🟡 |
| Purchasing | Receptions, Factures fournisseur, Acomptes fournisseur, Compensation, Demandes | ✅ |
| Purchasing | Commandes (hard-delete, no audit), Fournisseurs (legacy shim) | 🟡 |
| Inventory | Produits (addStockMovement bug), Stock locations, Stock transfers, Mouvements | ✅ |
| Inventory | Valuation/CMP (inconsistent), reservations (half-built) | 🟡 |
| Inventory | Camions/gasoil (routes unmounted), Batch/lot, Serial tracking | 🟥 |
| Accounting | General Ledger, Compensation, Reporting, Dépenses (V2), Caisse magasin/hierarchy | ✅ |
| Accounting | Comptabilité (SQLi + schema fork), Periods (partial), TVA engine (inert) | 🟡 |
| Accounting | CashVariance (500s), TaxReport (unmounted), CompteClient/Caisse V1 (dead) | 🟥 |
| Admin/Infra | Auth, Admin users/allocation, Tiers, Company settings, Notifications, Import/export | ✅ |
| Admin/Infra | RBAC (3 fragmented systems), Audit log (schema fork), CRM (SQLi, no RBAC) | 🟡 |
| HR | Employés/commissions/shifts | ✅ |
| HR | Payroll (runs/payslips) | ➖ |
| Other | Manufacturing/BOM, financial budgeting, multi-currency wiring | ➖ |

\* Has a security/correctness caveat — see Known Issues.

## Coding Conventions (as actually used)

- **Language:** TypeScript strict on both sides. Backend services are classes extending `BaseService`; export a singleton instance.
- **SQL:** always parameterized (`$1, $2`). Dynamic sort/order columns go through allow-lists (`BaseService.ts`). **Never string-concatenate user input into SQL** (two existing violations are bugs, not patterns — see AUDIT.md).
- **Validation:** Zod schemas in `validation/`, applied via `validateBody`/`validateQuery`/`validateParams` middleware. Some routes still hand-roll checks — prefer adding a Zod schema.
- **Auth:** every router does `router.use(authenticate)`; gate mutations with `authorize([...roles])` (or `requirePermission` for DB-driven). Don't ship a mutating route without an authz check.
- **Transactions:** multi-step writes use `pool.connect()` + `BEGIN/COMMIT/ROLLBACK`; lock contended rows with `SELECT ... FOR UPDATE`. Follow the pattern in `FactureService`/`StockTransferService`.
- **Numbering:** use `NumberingService` (atomic `nextval()`); don't call `nextval()` inline (POS does this — it's a bug).
- **Money:** stored `NUMERIC(15,2)`; round to 2 decimals; prefer SQL-side aggregation over JS float accumulation.
- **IDs in routes:** `patch-router` auto-validates common `:id`-style params as positive ints — but only a hardcoded name list, so don't rely on it for novel param names.
- **Frontend:** functional components + hooks; data fetched per-page via `useState`/`useEffect` through `services/api.ts`; no global store (Context for auth only). UI from `components/ui` (shadcn-style). Toasts via `sonner` (`toast.error('Erreur ...')`). Permission-gate UI with `usePermission`/`<RequirePermission>` — but treat client gating as advisory; **enforce on the server**.
- **Audit:** mutations should log via `AuditService`/`audit` middleware (writes are fire-and-forget).

## Known Issues & Limitations

Top items (see [AUDIT.md](AUDIT.md) for the full prioritized roadmap):

- **🔴 Schema forks:** `ecritures_comptables` (019 vs 069) and `audit_log` (004 vs 063) are each defined twice with different columns via `CREATE TABLE IF NOT EXISTS` — only one wins per DB, breaking GL/Comptabilité or audit depending on apply order.
- **🔴 SQL injection** in `CrmService.ts:75-79` and `ComptabiliteService.ts:147-149,204-205` (string-interpolated query filters).
- **🔴 Missing authorization** on several mutating routes: invoice create/pay (`factures.ts`), POS (`pos.ts`, also trusts client price), CRM, clients, produits writes; `employes` reads leak salary; `notifications/status` unauthenticated.
- **🟠 Committed secrets** in `ecosystem.config.js`; JWT in `localStorage` and passed in SSE query string.
- **🟠 Broken endpoints:** `POST /api/paiements/` (always 404), `addStockMovement` (arg-order), CashVariance (renamed columns → 500), supplier-acompte list/get (non-existent column), camion routes (unmounted).
- **🟡 TVA is inert** — a rate engine exists but `027_enforce_no_tax.sql` forces tva=0; purchasing/sales store tva=0. Decide policy before relying on tax.
- **🟡 Inventory valuation** computed three inconsistent ways; CMP not maintained on sales/transfers.
- **🟡 RBAC fragmented** across 3 systems; per-user DB permissions (057/058) are largely unenforced.
- **🟡 Dead/duplicate code:** V1 Caisse/Depense/CompteClient, FournisseurController, TaxReport*, `ComptabiliteService.ecrituresFrom*` — see AUDIT.md §4.
- **Tests:** thin backend coverage; ~4 frontend tests vs a 60% threshold; no E2E; no CI.

## Commands Reference

| Task | Backend (`backend/`) | Frontend (`frontend/`) |
|---|---|---|
| Install | `npm install` | `npm install` |
| Dev | `npm run dev` | `npm run dev` |
| Build | `npm run build` | `npm run build` |
| Start (prod) | `npm start` / `pm2 start ecosystem.config.js` | serve `dist/` (not configured) |
| Test | `npm test` | `npm test` |
| Coverage | `npm run test:coverage` | `npm run test:coverage` |
| Lint | `npm run lint` | — (no eslint) |
| Format | `npm run format` | — |
| DB setup | `node setup-db.mjs` (+ phase/erp scripts) | — |
| DB seed | `node seed-data.mjs` / `seed-hitek-demo.mjs` | — |
| Health check | `GET /api/health` | — |

---
*This file documents current reality, including defects, so work starts from the truth. When you fix a Known Issue, update this file and AUDIT.md.*
