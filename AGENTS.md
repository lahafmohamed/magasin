# AGENTS.md

Guidance for working in this repository. Reflects the **actual** current state of the code (re-audited 2026-06-21, after the 2026-06-20 hardening pass), not aspirations. For the full gap/quality analysis and roadmap see [AUDIT.md](AUDIT.md).

## Project Overview

French-language **ERP** for a retail + wholesale electronics business ("magasin informatique", brand "Hitek", currency **XOF**). Covers sales (quotes → delivery notes → invoices → payments/credit notes), purchasing (orders → receptions → supplier invoices → payments), multi-location inventory with weighted-average costing (CMP), cash registers (caisse), accounting/general ledger, HR (employees/commissions), light CRM, fleet (camions/gasoil), batch-lot + serial tracking, reporting, and role-based admin.

- UI, data, and error messages are in **French**. Match that when adding user-facing strings.
- Single-tenant, multi-location (magasins + dépôts). Money is `NUMERIC(15,2)`.
- **TVA is intentionally removed** system-wide (`027_enforce_no_tax.sql` forces `tva=0`; no TVA service/route exists). Don't reintroduce tax without an explicit policy decision.

## Tech Stack

**Backend** (`backend/`)
- Node.js + **Express ^4.18** + **TypeScript ^5.3** (`strict: true`)
- **PostgreSQL** via `pg ^8.11` Pool — **raw parameterized SQL, no ORM**
- **Zod ^4.3** validation · **jsonwebtoken ^9** (HS256, 7-day) + **bcrypt** (rounds 12) · **cookie-parser** (httpOnly auth cookie)
- **pino** logging · **helmet**, **express-rate-limit**, **cors** · **pdfkit**, **xlsx**
- Dev: `ts-node-dev`. Tests: **vitest ^4.1** + **supertest**

**Frontend** (`frontend/`)
- **React 18.3** + **Vite 5** + **TypeScript ^5.3** (`strict: true`)
- **TailwindCSS ^3.4** + **shadcn/ui** style (Radix primitives + `class-variance-authority` + `cn()`)
- **react-router-dom ^6.21** (lazy routes) · **react-hook-form ^7.72** + **zod** · **axios ^1.6** · **recharts ^3.8** · **sonner** toasts · **@tanstack/react-virtual**
- Tests: **vitest** + Testing Library + jsdom. `playwright` is a devDep but **unused** (no config/specs).
- PWA assets (`public/sw.js`, `manifest.json`) are **live**: `index.html` links the manifest and `main.tsx` registers the service worker outside localhost — it ships in production.

**Ops:** PM2 (`ecosystem.config.js`) manages the **backend only** (secrets read from env). Frontend is a static Vite build (no deploy step in repo). **CI:** GitHub Actions (`.github/workflows/ci.yml`).

## Architecture

```
backend/src/
  controllers/   27 HTTP handlers. Some hold business logic inline (e.g. CommandeController)
  services/      ~39 domain + data services. Extend BaseService (parameterized helpers, sort allow-list)
  routes/        33 Express routers, mounted in server.ts under /api/*
  middleware/    auth (JWT + httpOnly cookie + DB session), permissions, validation (Zod), audit, patch-router (global ID-param validation)
  models/        Thin UserModel
  db/            95 numbered migration files (001..094, `024` duplicated) + CI baseline/reference dumps. Triggers/functions hold core logic
  validation/    Zod schemas (schemas.ts, phase3-schemas.ts)
backend/migrate.mjs   ordered, tracked migration runner (schema_migrations table)
backend/*.mjs         tracked migration runner + supported seed/import tools
frontend/src/
  pages/         45 pages, all React.lazy code-split
  components/     domain components + components/ui (~29 shadcn-style primitives)
  hooks/          usePermission, useSseNotifications, useDraft, useUrlState, useExportExcel, useKeyboardShortcuts, ...
  lib/            AuthContext, ThemeContext, utils
  services/       api.ts (~30 service objects), authService.ts
  validation/     schemas.ts (zod)
  public/         sw.js + manifest.json (PWA assets, SW registered in prod)
```

- **Request flow:** route → `authenticate` → `authorize`/`validateBody` → controller → service → SQL/transaction. Response envelope: `{ success, data, pagination }`.
- **DB-centric logic:** many invariants live in Postgres triggers/functions (stock sync, accounting auto-posting on invoice insert via `072`, BL→facture conversion, status/payment recompute, CMP sync via `065`). When touching financial or stock flows, check both the service **and** the relevant migration.
- **Unified `tiers` table** (clients + suppliers; `043_unified_tiers.sql`) is the source of truth. `clients`/`fournisseurs` routes are deprecated shims to `TiersController`. Batch/serial FKs were repointed to `tiers` in `074`.
- **Auth:** JWT issued on login; **primary transport is an httpOnly cookie** (`?token=` query remains only as an SSE fallback). DB-backed sessions (SHA-256 hash) for revocation; `must_change_password` gate; password strength enforced. The login response still returns the token in the body (intentional, for non-browser API clients); the frontend caches only the non-sensitive `auth_user` in localStorage, not the token.

## Run / Build / Test / Deploy

Database: PostgreSQL. Backend reads `DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME`, `JWT_SECRET` (must be ≥32 chars, not a placeholder — boot fails otherwise), `JWT_EXPIRATION`, `FRONTEND_URL`, `PORT`, and optionally `CAISSE_GL_POSTING` (default off) from a `.env` (dotenv).

**Backend** (`cd backend`)
```bash
npm install
npm run dev            # ts-node-dev, http://localhost:<PORT> (dev 6000, prod 6100)
npm run build          # clean dist/ then tsc → dist/
npm start              # node dist/server.js
npm run lint           # eslint src/ (backend only)
npm run format         # prettier
npm test               # vitest run
npm run test:coverage  # vitest + coverage
# Migrations (tracked runner — preferred):
node migrate.mjs                 # apply all pending NNN_*.sql, recorded in schema_migrations
node migrate.mjs --status        # show applied vs pending
node migrate.mjs --dry-run       # preview
node migrate.mjs --baseline      # mark existing as applied without running
node seed-data.mjs               # / seed-hitek-demo.mjs, seed-clients-excel.mjs, ...
```
> `migrate.mjs` is the ordered, transactional runner with a `schema_migrations` tracking table. Obsolete out-of-band migration/fix scripts and the stale `schema.sql` snapshot were removed; use `migrate.mjs` and regenerate `ci-baseline.sql` after schema changes. Highest migration is `094`. `089` = schema-integrity (financial FKs → RESTRICT, `commissions_ventes` recreated, ledger/money CHECKs, hot indexes, pg_trgm tracked); `090` = re-applies 070's audit_log reconcile (the live DB had been **baselined without executing it** — audit inserts write `user_id` and were failing silently against the legacy `utilisateur_id` column; beware other baselined-but-never-run migrations); `091` = retour/commande line-qty CHECKs + period-lock extended to INSERT/UPDATE/DELETE; `092/093` = compensation client/fournisseur symétrique et rattrapage historique; `094` = affectation FIFO automatique des acomptes fournisseur, statuts de facture et reliquats sans double comptage.

**Frontend** (`cd frontend`)
```bash
npm install
npm run dev            # vite, http://localhost:6001 (proxies /api → :6000)
npm run build          # tsc -b && vite build
npm run preview
npm test               # vitest run (60% coverage threshold configured; currently unmet)
```
> Frontend now **has ESLint** (`eslint.config.js`, `npm run lint`). No `import.meta.env`/`VITE_` usage — API origin is the Vite proxy in dev; for prod the built SPA must be served behind something that proxies `/api` (not configured in repo).

**Deploy**
```bash
pm2 start ecosystem.config.js   # backend only (app "hitektest-api", dist/server.js)
```
> `ecosystem.config.js` now reads `JWT_SECRET`/`DB_*` from env (no committed secrets). Frontend static-serving is undocumented.

**CI:** `.github/workflows/ci.yml` runs on push/PR to `main`. **Backend:** postgres:18 service + `scripts/ci-db-setup.mjs` (loads `src/db/ci-baseline.sql` schema dump + `ci-ref-data.sql` + admin user + `migrate.mjs --baseline`), then `npm ci` → `tsc --noEmit` → lint → **full integration test suite against the service DB** → build. Vitest's global setup rejects unsafe DB names, rebuilds the disposable schema before and after the suite, and runs integration files serially because they share DB state; see `backend/TESTING.md`. **Regenerate `ci-baseline.sql` (pg_dump --schema-only) after adding a migration.** **Frontend:** `npm ci` → `tsc -b` → lint → test → build.

## Module Status

Legend: ✅ Complete · 🟡 Partial · 🟥 Stub/Dead · ➖ Missing. Full evidence in [AUDIT.md](AUDIT.md) §2.

| Domain | Module | Status |
|---|---|---|
| Sales | Devis, Bons de livraison, Factures, Acomptes, Paiements, POS, Avoirs, Numbering | ✅ |
| Sales | Retours (restock on approval only), Credit-limit enforcement, Pricing (no TVA by design) | ✅ |
| Purchasing | Receptions, Factures fournisseur, Acomptes fournisseur, Compensation, Demandes, Commandes | ✅ |
| Purchasing | 3-way match (`082`; commande↔reception↔facture + tolerance config) | ✅ |
| Purchasing | Reorder automation (Réapprovisionnement → supplier-grouped commandes; `produits.fournisseur_id` writable) | ✅ |
| Inventory | Produits, Stock locations, Stock transfers, Mouvements | ✅ |
| Inventory | Batch/lot, Serial, Camions/gasoil — **fully removed**: routes/services (2026-06-30), dead `lots`/`numeros_serie` tables + orphan FK columns dropped in `085`, dead Zod schemas removed; `camions` already gone | ➖ |
| Inventory | Valuation/CMP (`valeur_stock` unified + kept in sync by trigger `076`; CMP unit-cost still reception-driven), reservations (`quantite_reservee` dropped in `078`) | 🟡 |
| Accounting | General Ledger, Comptabilité, Compensation, Caisse magasin/hierarchy, Dépenses (V2), Reporting | ✅ |
| Accounting | Periods (DB-enforced via `075` trigger on all GL paths), Caisse→GL (enabled `086/087`), Multi-currency (dormant cols dropped in `077`; `XOF` only) | ✅ |
| Admin/Infra | Auth, Admin users/allocation, Tiers, Clients, CRM, Company settings, Audit log, Notifications | ✅ |
| Admin/Infra | RBAC (3 fragmented systems; per-user DB perms barely adopted) | 🟡 |
| HR | Employés/commissions/shifts | ✅ |
| HR | Payroll (runs/payslips, CNPS/ITS statutory config; `080`/`081`) | ✅ |
| Other | Manufacturing/BOM, financial budgeting | ➖ |


## Coding Conventions (as actually used)

- **Language:** TypeScript strict on both sides. Backend services are classes extending `BaseService`; export a singleton instance.
- **SQL:** always parameterized (`$1, $2`). Dynamic sort/order columns go through allow-lists (`BaseService.ts`). **Never string-concatenate user input into SQL** (the two prior SQLi sites in `CrmService`/`ComptabiliteService` are now fixed — keep it that way).
- **Validation:** Zod schemas in `validation/`, applied via `validateBody`/`validateQuery`/`validateParams` middleware. Prefer adding a Zod schema over hand-rolled checks.
- **Auth:** every router does `router.use(authenticate)`; gate mutations with `authorize([...roles])` (or `requirePermission` for DB-driven). Don't ship a mutating route without an authz check — all current mutating routes are gated; match that.
- **Transactions:** multi-step writes use `pool.connect()` + `BEGIN/COMMIT/ROLLBACK`; lock contended rows with `SELECT ... FOR UPDATE`. Follow `FactureService`/`StockTransferService`/`ReturnService.updateStatut`.
- **Numbering:** use `NumberingService` (atomic `nextval()`); don't call `nextval()` inline.
- **Money:** stored `NUMERIC(15,2)`; round to 2 decimals; prefer SQL-side aggregation over JS float accumulation.
- **Migrations:** add a new `NNN_*.sql` (next number after `094`) and apply with `migrate.mjs`. Don't add new ad-hoc `.mjs` fix scripts.
- **Periods:** financial writes should call `PeriodService.checkPeriodIsOpen` for a friendly app-layer error, but the hard guarantee is the DB trigger from `075` on `ecritures_comptables` — closed periods are rejected on **every** posting path (see Known Issues).
- **Frontend:** functional components + hooks; data fetched per-page via `useState`/`useEffect` through `services/api.ts`; no global store (Context for auth/theme only). UI from `components/ui` (shadcn-style). Toasts via `sonner` (`toast.error('Erreur ...')`). Permission-gate UI with `usePermission`/`<RequirePermission>` — treat client gating as advisory; **enforce on the server**.
- **Audit:** mutations log via `AuditService`/`audit` middleware (writes are fire-and-forget / non-fatal).

## Known Issues & Limitations

See [AUDIT.md](AUDIT.md) for the full prioritized roadmap. Top current items (post-hardening):

- **✅ Period lock enforced at DB level** — `075_period_lock_ecritures` adds a `BEFORE INSERT` trigger on `ecritures_comptables` (single chokepoint), so **every** GL posting path (072 auto-post triggers, BL→facture, POS, caisse→GL, `enregistrerPiece`, manual entries) is blocked for a closed (`fermee`) period, not just the app-layer `PeriodService.checkPeriodIsOpen` calls.
- **🟡 Inventory valuation** — `076_stock_valeur_invariant` now keeps `valeur_stock = quantite × cmp` in sync (decremented on sales/transfers), and all three readers (`ProduitService`, `ReportingService:507`, `ComptabiliteService:391`) compute inventory value the same way via `SUM(spl.valeur_stock)`. Residual: the CMP **unit cost** itself is still recomputed on reception only.
- **✅ Returns** correctly restock **on approval only** (`updateStatut` → `traite`), not at create; guarded state machine (`en_attente`→`traite`/`annule`, `traite`→`annule`), period-checked, cancel-of-approved reverses the restock. All transactional.
- **✅ `factures-fournisseur` routes** now use `validateBody` (`createFactureFournisseurSchema`, `recordFactureFournisseurPaiementSchema`).
- **✅ 3-way match** implemented — `082_three_way_match` restores `factures_fournisseur.commande_id` + `three_way_match_config` (tolerance/blocage); wired in `CommandeController`, `FactureFournisseurController`/`Service`, `ReceptionService`. Detail UI shows the Cmd/Reçu/Facturé rapprochement.
- **✅ Client credit limit enforced** — `CreditService.assertWithinCreditLimit` (live `SUM(remaining_due)` + tiers row lock) gates all three credit-extension paths: BL create, direct facture create, and devis-confirm auto-BL. `credit_max <= 0` = no limit.
- **✅ Reorder automation** — `GET /produits/reorder-suggestions` computes low-stock products live and the Réapprovisionnement page generates supplier-grouped commandes. `produits.fournisseur_id` is now writable end-to-end (schema + `ProduitService` create/update + form), so products can carry a default supplier.
- **✅ `quantite_reservee`** reservations column dropped in `078` (was half-built); no TS references remain.
- **✅ Multi-currency** dormant `066/067` columns dropped in `077`; only the live `company_settings` currency fields remain. `XOF` is the only currency.
- **✅ Caisse→GL posting** enabled (`CAISSE_GL_POSTING=true`). Prerequisites fixed so it actually posts: chart-of-accounts seeded (`086`: 53/54/51/419/409/604/65/75), legacy `ecritures_comptables` NOT NULL columns relaxed (`087`, completing `071` on legacy-built DBs), and the invalid journal codes corrected (`'BQ'`→`'TRESORERIE'` in caisse, `'VT'`→`'OD'` default in `enregistrerPiece`) — these had never matched the `journal` CHECK, so the new-style manual inserters would have failed. Verified: balanced Dr/Cr legs insert cleanly.
- **✅ RBAC consolidated** onto the single `authorize(roles)` mechanism (role string from `roles.nom` via `utilisateurs.role_id`). The DB permission system (`056/057/058`: `permissions`/`role_permissions`/`user_permissions` + `customiser_permissions`) and the in-memory `ROLE_PERMISSIONS` matrix were removed (`084` drops the tables); `permissions.ts` retains only the `getUserLocationRole` location helper. FE `usePermission` remains as **advisory** UI gating (role-based, no server dependency).
- **✅ Token handling** — auth is the httpOnly `auth_token` cookie (`withCredentials`); the FE caches only the non-sensitive `auth_user` in localStorage (no token). Login still returns the token in the body **intentionally** for non-browser API clients.
- **🟡 UX remediation (2026-07-23)** — the paginated purchase-order contract, zero-price sales guard, stale cash-session control, mobile inventory layout, audited no-TVA terminology, payment labels, server-paginated receivables, ledger filters/exports, disposable role smoke coverage, and key validation/accessibility paths are fixed. Remaining release work: approved historical-data cleanup and KPI reconciliation, business-owner role UAT, and the broader form/accessibility sweep.
- **🟡 Frontend quality** — ESLint now present and FE lint+tests run in CI, but FE tests still far below the 60% threshold; `api.ts` remains broadly untyped despite typed paginated envelopes; duplicated axios instance (`api.ts` vs `authService.ts` — intentionally divergent interceptors); the production build still warns that the vendor bundle exceeds 700 kB.
- **✅ Legacy cleanup** — the V1 `DepenseService` helpers were merged into `DepenseServiceV2`; unused models/services, stale schema/docs, the orphan migration directory, and ad-hoc repair/check scripts were removed. `backend/scripts/` now contains only CI bootstrap and database backup tooling.

## Commands Reference

| Task | Backend (`backend/`) | Frontend (`frontend/`) |
|---|---|---|
| Install | `npm install` | `npm install` |
| Dev | `npm run dev` | `npm run dev` |
| Build | `npm run build` | `npm run build` |
| Start (prod) | `npm start` / `pm2 start ecosystem.config.js` | serve `dist/` (not configured) |
| Test | `npm test` | `npm test` |
| Coverage | `npm run test:coverage` | `npm run test:coverage` |
| Lint | `npm run lint` | `npm run lint` |
| Format | `npm run format` | — |
| Migrate | `node migrate.mjs` (`--status`/`--dry-run`/`--baseline`) | — |
| DB seed | `node seed-data.mjs` / `seed-hitek-demo.mjs` | — |
| Health check | `GET /api/health` | — |

---
*This file documents current reality, including defects, so work starts from the truth. When you fix a Known Issue, update this file and AUDIT.md.*
