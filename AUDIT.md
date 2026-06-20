# ERP Audit Report

**Repo:** `magasinProgramme` (Hitek / "magasin informatique" — French-language ERP for a retail + wholesale electronics business in West Africa, currency XOF)
**Date:** 2026-06-20
**Method:** Read-only audit. Every finding is backed by a file path / `file:line` reference verified by reading the code. Items that could not be confirmed from code are marked `[unverified]`.
**Scope of this pass:** Audit + documentation only. No source, schema, migration, or config files were modified.

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
| Security mw | helmet ^8.1, express-rate-limit ^8.3, cors | |
| Tests (BE) | vitest ^4.1.4 + supertest ^7.2 | |
| Frontend | React 18.3 + Vite 5 + TypeScript 5.3 | |
| Styling | TailwindCSS ^3.4 + shadcn/ui (Radix + CVA) | |
| FE libs | react-router-dom ^6.21, react-hook-form ^7.72, zod, recharts ^3.8, axios ^1.6, sonner, @tanstack/react-virtual | |
| Process mgr | PM2 (`ecosystem.config.js`) | |

### Folder structure

```
backend/
  src/
    controllers/   38 controllers (HTTP handlers; some contain business logic inline)
    services/      47 services (BaseService + domain services; data + business logic)
    routes/        41 route files mounted in server.ts
    middleware/    auth, permissions, validation, audit, idempotency, patch-router
    models/        Client, Facture, Paiement, Produit, UserModel (thin, partial)
    db/            72 .sql migrations (001..069) + schema.sql
    validation/    Zod schemas (schemas.ts, phase3-schemas.ts)
    utils/, types/, test/
  *.mjs            ~30 ad-hoc setup/seed/fix/migration scripts (NOT a unified migration system)
frontend/
  src/
    pages/         49 page files (45 pages + 4 *.test.tsx)
    components/     domain components + components/ui (~29 shadcn-style primitives)
    hooks/          usePermission, useSseNotifications, useKeyboardShortcuts, useDraft, ...
    lib/            AuthContext, ThemeContext, utils
    services/       api.ts (~1770 lines, ~30 service objects), authService.ts
    validation/, types/, utils/, test/
ecosystem.config.js   PM2 (backend only)
data/, excel/, scripts/  seed data + one python xlsx importer
```

- **Backend LOC:** ~29,000 TS. **Frontend LOC:** ~30,600 TS/TSX.
- **~30,650 frontend / ~29,092 backend lines.**

### Data layer

- Raw SQL through `pg` Pool. No ORM. `BaseService.ts` provides parameterized helpers and a sort-column allow-list (`BaseService.ts:83-87`).
- **Heavy reliance on DB triggers and DB functions** for business logic: stock sync, accounting auto-posting, document conversions (BL→facture), payment/status recomputation. App code and DB logic are tightly coupled and sometimes duplicate each other.
- **Unified `tiers` table** (`043_unified_tiers.sql`) replaced separate `clients`/`fournisseurs` tables; legacy tables and controllers still exist as shims or dead code.
- **No unified migration runner.** Migrations are applied by ~30 hand-written `.mjs` scripts with **hardcoded file lists** (e.g. `run-migrations.mjs` only runs 030–035). There is no ordered, idempotent, tracked migration framework. Migration order is therefore implicit and error-prone — and several migrations use `CREATE TABLE IF NOT EXISTS` to redefine the *same* table with *different* columns (see schema forks below).

### Auth model

- JWT (HS256, 7-day expiry) issued on login. Token verified in `middleware/auth.ts` with explicit `algorithms:['HS256']` (`auth.ts:51`) — guards alg-confusion.
- `JWT_SECRET` hard-fails at boot if missing, <32 chars, or a known placeholder (`auth.ts:15-28`). **But the production secret is committed in plaintext** in `ecosystem.config.js`.
- DB-backed sessions with SHA-256 token hashing for revocation; `must_change_password` gate.
- Frontend stores the JWT in **localStorage** (XSS-exposed) and passes it as a **query-string param** to the SSE endpoint (leaks into logs).

### API surface

- ~41 route modules mounted under `/api/*` in `server.ts`. Global `helmet`, CORS restricted to `FRONTEND_URL`, global rate limit (500/15min) + auth limit (10/15min). Response envelope: `{ success, data, pagination }`.
- Frontend talks to relative `/api` (Vite dev proxy → `localhost:6000`); no `import.meta.env`/`VITE_` usage anywhere — API origin is purely build/proxy-determined.

### Frontend/backend split

- Clean SPA + JSON API split. Frontend is a static Vite build; backend is the only PM2-managed process. No documented static-serving/deploy for the built frontend (no nginx config in repo).

---

## 2. Module Inventory

Status backed by referenced files. **Complete** = full lifecycle + transactions + auth; **Partial** = works but has correctness/coverage gaps; **Stub** = schema/scaffold only, no working API; **Missing** = expected but absent.

### Sales

| Module | Status | Evidence |
|---|---|---|
| Devis (quotes) | **Complete** | `DevisService.ts`, `DevisController.ts`, `devis.ts` — lifecycle brouillon→accepté→converti, auto-BL on accept, transactional |
| Bons de livraison (delivery notes) | **Complete** | `BonLivraisonService.ts` — stock deducted on `livre`, restored on cancel, convert→facture idempotent |
| Factures (customer invoices) | **Complete** (most mature) | `FactureService.ts` — period guard, credit-limit, race-safe stock, ledger debit, FIFO allocation, trigger-computed status |
| Avoirs / credit notes | **Complete** (accounting risks) | `CreditNoteService.ts`, `avoirs.ts` — manual credit + apply-to-facture |
| Retours / returns | **Partial** | `ReturnService.ts` — restock at create (pre-approval), no un-restock on cancel |
| Paiements | **Complete** (one broken route) | `PaiementController.ts`, `ClientAllocationService.ts` — idempotent, FIFO acompte apply |
| Acomptes (customer deposits) | **Complete** | `AcompteController.ts`, `TiersController`, `CompensationService.ts` |
| POS / quick sale | **Complete** (security gaps) | `POSService.ts`, `pos.ts` — single-tx sale, but no auth + client-supplied price |
| Pricing | **Partial** | `PricingService.ts` — discount calc only, **no TVA** |
| Numbering | **Complete** | `NumberingService.ts` — atomic `nextval()`, no race |

### Purchasing

| Module | Status | Evidence |
|---|---|---|
| Commandes fournisseur (purchase orders) | **Partial** | `CommandeController.ts` — inline logic, auto-creates draft supplier invoice, hard-delete w/o cleanup, no audit |
| Receptions (goods receipt) | **Complete** | `ReceptionService.ts` — stock upsert, CMP recompute, period-locked; no 3-way match |
| Factures fournisseur (supplier invoices) | **Complete** | `FactureFournisseurService.ts` — AP ledger, payment recompute; ledger insert passes `null` into `montant_credit` |
| Acomptes fournisseur | **Complete** | `AcompteController.ts` (Fournisseur methods), tested |
| Compensation (AR/AP netting) | **Complete** | `CompensationService.ts` — balanced OD entry Dr401/Cr411 |
| Fournisseurs | **Complete** (legacy shim) | `fournisseurs.ts` delegates to `TiersController`; `FournisseurController.ts` is dead code |
| Demandes (internal reappro requests) | **Complete** (most mature) | `DemandeService.ts` — full state machine magasin↔dépôt, row-locked execution |

### Inventory

| Module | Status | Evidence |
|---|---|---|
| Produits | **Complete** (bugs) | `ProduitService.ts`, `ProduitController.ts` — fuzzy search, valuation; broken `addStockMovement` (arg order) |
| Stock locations | **Complete** (no update/delete) | `StockLocationService.ts` |
| Stock transfers | **Complete** (best-built) | `StockTransferService.ts` — FOR UPDATE locking both ends |
| Mouvements stock | **Complete** (double-log risk) | `002_mouvements_stock.sql` trigger never dropped after `020` |
| Valuation (CMUP/CMP) | **Partial** | `ReceptionService.ts:221-246` — CMP on reception only; `valeur_stock` not decremented on sales/transfers; 3 inconsistent valuation formulas |
| Camions / gasoil (fleet fuel) | **Partial — DEAD** | `routes/camions.ts` **never mounted in server.ts** — controller+service unreachable |
| Batch/lot tracking | **Stub** | `015_batch_lot_tracking.sql` — tables/views/`expire_old_lots()` exist; **zero TS code references them** |
| Serial number tracking | **Stub** | `016_serial_number_tracking.sql` — same; orphaned schema, FKs point to pre-unification tables |
| Stock reservations (`quantite_reservee`) | **Stub (half-built)** | read in `StockLocationService.ts:126-145`; **never written anywhere** |

### Accounting / Finance / Cash

| Module | Status | Evidence |
|---|---|---|
| General Ledger | **Complete & LIVE** | `GeneralLedgerService.ts` — uses **019 schema** (`compte_id`); manual entry balanced ±0.01, period-guarded |
| Comptabilité | **Partial / conflicted & LIVE** | `ComptabiliteService.ts` — uses **069 schema** (`compte_numero`); **SQL injection** in count/balance queries |
| Compensation | **Complete** | `CompensationService.ts` |
| Tax / TVA rates | **Complete CRUD but inert** | `TauxTvaService.ts` — engine exists but `027_enforce_no_tax.sql` forces tva=0 |
| Tax reports | **Dead + broken** | `TaxReportController.ts` (a Router) **mounted nowhere**; fabricates 19% TVA via CROSS JOIN |
| Caisse (cash, magasin) | **Complete & LIVE** | `CaisseMagasinService.ts` — sessions, variance, idempotent, FOR UPDATE; **no GL posting** |
| Caisse hierarchy | **Complete & LIVE** | `CaisseHierarchyService.ts` — inter-caisse transfers; unvalidated `montant` |
| Cash variance reports | **Broken & LIVE** | `CashVarianceService.ts` — queries **pre-refactor columns** (045/046/048 renamed them) → all endpoints 500 |
| Dépenses (expenses) | **Complete & LIVE (V2)** | `DepenseServiceV2.ts` — caisse-integrated; V1 `DepenseService.ts` mostly dead |
| Comptes clients (AR) | **Live via Tiers; old impl dead** | `comptes-clients.ts` shims to `TiersController`; `CompteClientService.ts` dead |
| Reporting / analytics | **Complete & LIVE** | `ReportingService.ts` — real COGS from `prix_achat_unitaire`, aging, P&L, forecast |
| Periods (fiscal lock) | **Partial** | `PeriodService.ts` — only checked by GL manual entry + compensation; triggers/most writes bypass it |

### Auth / Admin / CRM / HR / Cross-cutting

| Module | Status | Evidence |
|---|---|---|
| Auth | **Complete** (gaps) | `AuthController.ts`, `auth.ts` — JWT+bcrypt+sessions; no password policy; `register` hardcodes role_id=3 |
| RBAC | **Partial / fragmented** | **3 overlapping systems**: DB-driven (`auth.ts:requirePermission`), hardcoded matrix (`permissions.ts`), `authorize(roles)`. Per-user DB overrides (057/058) largely **unenforced** |
| Admin users | **Complete** | `AdminUserService.ts` — bcrypt, transactional, location-role sync |
| Admin allocation / user-location | **Complete** | `AdminAllocationController.ts`, `UserLocationAssignmentService.ts` |
| Tiers (unified parties) | **Complete** | `TiersService.ts`, `tiers.ts` — validated + role-gated mutations |
| Clients | **Complete** (no RBAC on writes) | `ClientController.ts` — POST/PUT/DELETE lack `authorize` |
| CRM | **Complete functionally; SQL injection + no RBAC** | `CrmService.ts:75-79`, `crm.ts` |
| HR / Employés | **Complete** (reads expose salary) | `EmployeService.ts` — GET routes ungated |
| Company settings | **Complete** | `CompanySettingsService.ts` |
| Audit log | **Complete but broken by schema fork** | `004_auth.sql` vs `063_audit_log.sql` define `audit_log` with different columns |
| Notifications (SSE) | **Complete** (gaps) | `notifications.ts` — `/status` unauthenticated; stream skips revocation check |
| Import / export | **Complete** | `import-export.ts`, `export-batch.ts` |

### Modules NOT present (Missing)

- **Manufacturing / BOM / production** — none.
- **Payroll** — partial only: HR has employees, commissions, shifts (`EmployeService.ts`) but **no payroll run / payslip / salary disbursement**.
- **Dedicated CRM pipeline / opportunities** — only interactions + tasks (`CrmService.ts`).
- **Budgeting / forecasting (financial)** — only a sales forecast in reporting.
- **Multi-currency** — `XOF` hardcoded; `066_taux_conversion.sql` + `067_add_devise_to_paiements.sql` exist but `[unverified]` whether wired.

---

## 3. Gap Analysis (per module, what is broken / half-built / absent)

**Sales**
- Retours: restock occurs at `create` before approval; `updateStatut` non-transactional, no enum validation, **does not un-restock on `annule`** → inventory drift (`ReturnService.ts`).
- Paiements: `POST /api/paiements/` reads `req.params.factureId` that doesn't exist on that route → **always 404** (`paiements.ts:24`). Working path is `POST /api/factures/:factureId/paiements`.
- Payment Zod enum (`schemas.ts:188`) allows only `espece/carte/cheque/virement` — rejects mobile-money methods (`orange_money`, `wave`) the controller+DB otherwise support. Also omits `idempotency_key`.
- Double-credit risk: `CreditNoteService.applyToFacture` (`:385`) + `createManual` (`:276`); `BonLivraisonService.convertToFacture` (`:837-842`) may duplicate what DB function `convert_bl_to_facture` posts.
- `FactureService.updateStatut` (`:482-495`) non-transactional TOCTOU + writes arbitrary unvalidated `statut` string.
- POS bypasses NumberingService (`nextval('facture_numero_seq')` with `POS-` prefix) → consumes the real FAC counter, creating gaps (`POSService.ts:144-145`).
- Pricing has **no TVA**; negative qty/price silently clamped to 0 → `NaN` masking.

**Purchasing**
- TVA structurally `0` across commandes + factures fournisseur (`tva, 0`, `total = sousTotal`) despite `tva_taux` on line interfaces — dead field, or a real gap.
- No 3-way match (commande ↔ reception ↔ facture). Invoice auto-created at order time; received qty/cost never reconciled.
- `CommandeController.delete` (`:319-334`) hard-deletes with no transaction and no cleanup of the auto-created supplier invoice → orphans; no audit logging in the whole module.
- `createCommandeSchema` requires `tiers_id` (`schemas.ts:210`) but controller's `fournisseur_id` fallback is dead (rejected at validation).
- `AcompteController.listApplicationsFournisseur` / `getByIdFournisseur` JOIN `factures_fournisseur.numero_facture` — **column likely doesn't exist** (it's `numero_facture_fournisseur`/`_interne`) → runtime throw (`:540,572`).
- `FactureFournisseurService.recordPayment` passes `null` into `montant_credit` (`:275`) — may violate NOT NULL.
- `factures-fournisseur` routes lack `validateBody` → unvalidated line amounts → NaN risk.

**Inventory**
- Camion/gasoil module entirely **dead** (routes unmounted).
- Batch/lot + serial: schema/views/functions exist, **no code**; FKs reference pre-unification `fournisseurs`/`clients`.
- `ProduitController.addStockMovement` arg-order bug → `POST /produits/:id/mouvements` corrupts movement records (`:333` vs service `:372`).
- Legacy trigger `log_produits_stock` (002) never dropped after `020` → **duplicate `'ajustement'` movements** on every stock change.
- `quantite_reservee` reservation feature half-built (read, never written).
- **Three inconsistent inventory valuation methods**: `quantite*prix_achat` (ProduitService), `valeur_stock` (ReportingService:505), `stock*prix_achat` (ComptabiliteService:455). CMP not maintained on sales/transfers.
- No update/delete for stock locations; no cancel for transfers; `StockLocationService.adjustStock` has no negative guard.

**Accounting**
- **Dual `ecritures_comptables` schema fork** (`019` `compte_id` vs `069` `compte_numero`), both `CREATE TABLE IF NOT EXISTS` → only one exists at runtime; **GL and Comptabilité cannot both work** against the same DB.
- **Three parallel double-entry posting mechanisms**: DB triggers (LIVE), `ComptabiliteService.ecrituresFrom*` (dead, zero callers), `GeneralLedger.createManualEntry` (manual). The dead path would double-post if ever wired.
- TVA contradiction system-wide (`027` zero-tax CHECK vs full unused rate engine). TVA account numbers inconsistent: `446` (ComptabiliteService) vs `4456/4457` (triggers).
- CashVarianceService queries renamed columns → all 3 endpoints 500.
- Caisse never posts to GL (cash movements isolated from accounting).
- Periods only partially enforced.

**Auth/RBAC/cross-cutting**
- `audit_log` schema fork (`004` vs `063`) → audit logging broken on one code path; writes are fire-and-forget so failures are silently swallowed.
- Per-user permission overrides (057/058) seeded but **unenforced** — only `users.manage` is DB-checked; everything else gates on coarse roles. Admin permission UI writes data the API ignores.
- Two different functions both named `requirePermission` (`auth.ts:167` vs `permissions.ts:231`) — footgun.
- Session revocation not enforced for tokens whose session-insert failed (swallowed in `generateToken`, `auth.ts:216-219`).

---

## 4. Quality Findings

### Security (highest severity first)

1. **🔴 SQL injection — CRM** `CrmService.ts:75-79`: `req.query.type/statut/tiers_id` interpolated into the count query. Exploitable by any authenticated user.
2. **🔴 SQL injection — Comptabilité** `ComptabiliteService.ts:147-149` and `:204-205`: date/journal/compte filters string-concatenated into count + balance queries.
3. **🔴 Missing authorization on state-changing routes:**
   - `factures.ts:20` — `POST /` (create invoice, deduct stock, post ledger) has **no role gate**; `:26` payment route likewise.
   - `pos.ts:8-20` — POS `/sale` & `/open` only `authenticate`; **and POS trusts client-supplied `prix_unitaire`** (`POSService.ts:119,145,167`) → sell at any price.
   - `crm.ts` — all create/update/delete ungated.
   - `clients.ts:421,448,500` — POST/PUT/DELETE ungated.
   - `produits` write routes — create/update/delete/adjust open to any authenticated user.
   - `employes.ts` GET — exposes `salaire_base`/commissions to any authenticated user.
   - `notifications.ts:25` `/status` — **no auth at all**.
4. **🟠 Committed secrets** — `ecosystem.config.js` hardcodes `JWT_SECRET` (and blank `DB_PASSWORD`) in the repo.
5. **🟠 Token handling** — JWT in `localStorage` (XSS); JWT passed in SSE **query string** (`useSseNotifications.ts:20`) → leaks to proxy/server logs; SSE stream skips revocation check.
6. **🟠 No password complexity policy**; `changePassword`/register accept any non-empty string; `register` ignores `role`, hardcodes `role_id:3`.
7. **🟡 Idempotency middleware caches error responses** (`idempotency.ts:38-46`) and is not per-user scoped → a transient 500 is replayed; cross-user key collisions possible.
8. **🟡 `patch-router.ts`** monkey-patches `express.Router` and validates only a hardcoded param-name list → new id params (`tiersId`, `employeId`) bypass validation.

### Schema inconsistencies (data-integrity class)

- `ecritures_comptables` dual definition (019 vs 069) — **blocking**.
- `audit_log` dual definition (004 vs 063) — **blocking on one path**.
- `CashVarianceService` references columns renamed by 045/046/048.
- Batch/lot/serial FKs reference pre-unification `fournisseurs`/`clients` (043 unified into `tiers`).
- Three inventory valuation formulas; two TVA account-number schemes.

### Validation gaps

- `factures-fournisseur`, `acomptes`, several `tiers`/`pos` routes lack `validateBody`.
- Payment method enum too narrow; `stockMovementSchema` missing `location_id`.
- Unvalidated `montant` in caisse-hierarchy transfers.

### Tests

- **Backend:** 10 `*.test.ts` (controllers Produit/Client/Facture/AcompteFournisseur; services Facture/Reporting/CompanySettings; `server.test.ts`, `schemas.test.ts`, route `company-settings.test.ts`). Integration tests exist via `supertest`. Coverage is thin relative to 38 controllers / 47 services.
- **Frontend:** only 4 `*.test.tsx` (Login, Dashboard, NouvelleFacture, CompanySettings) against a **60% coverage threshold** in vitest config → threshold almost certainly fails. No service/hook/component tests.
- **E2E:** none. `playwright` is a frontend dep but there is **no config and no spec files** — unused.
- **CI:** none. No `.github/workflows`. Nothing runs lint/test/build automatically.

### Tooling / config

- **Frontend has no ESLint config** and eslint isn't even a devDep — frontend is unlinted. Backend has eslint + @typescript-eslint + prettier.
- Both `tsconfig.json` are `strict: true` — **but** the FE API layer is pervasive `Promise<any>` / `(x as any)`, undercutting type safety at the data boundary.
- **No unified migration system** — ~30 ad-hoc `.mjs` scripts with hardcoded file lists; `run-migrations.mjs` runs only 030–035. Migration order is implicit.
- Duplicated axios instance + interceptors in `api.ts` and `authService.ts`.
- Frontend permission matrix (`usePermission.ts`) duplicates backend matrix → can drift; meanwhile `PermissionsPage` fetches real permissions → two permission models on the client too.

### Dead / duplicate code

- `FournisseurController.ts` (whole file), `CaisseController.ts`+`CaisseService.ts` (V1), `CashVarianceController.ts`, `DepenseController.ts` (V1, mostly), `CompteClientController.ts`+`CompteClientService.ts`, `TaxReportController.ts`/`TaxReportService.ts` (mounted nowhere), `ComptabiliteService.ecrituresFrom*` (zero callers), `DemandeService.getAll` (controller inlines its own), `VALID_TRANSITIONS` const (defined, never enforced).

### Performance risks

- `FactureController.export` pulls up to 100,000 rows; `CommandeController.getAll` has no pagination.
- Per-line price re-lookups in Return/Pricing paths (minor N+1).
- `getStats` averages over all rows ever (Reception).

### Hardcoded values

- `JWT_SECRET`, `DB_*` in `ecosystem.config.js`.
- TVA = 0 across BL/Facture/POS/Avoir/purchasing; account numbers `401/411/446/53/54/604/701` hardcoded in ComptabiliteService; `XOF` currency; `cout_ventes_estime = total*0.7` fabricated COGS (`ComptabiliteService.ts:450`); `role_id:3` in register; `delai_livraison=7`, `role_at_location='both'`.

---

## 5. Upgrade Roadmap (prioritized)

Effort: **S** ≤ 0.5 day · **M** ≈ 1–3 days · **L** ≈ 1+ week.

### P0 — Blocking (data integrity, security, broken core)

| # | What | Why | Effort |
|---|---|---|---|
| P0-1 | Resolve `ecritures_comptables` dual schema (019 vs 069); pick canonical, drop the other, point GL + Comptabilité at one schema | GL and Comptabilité cannot both function; accounting is silently broken depending on migration order | L |
| P0-2 | Resolve `audit_log` dual schema (004 vs 063) | Audit logging broken on one path; failures swallowed | S |
| P0-3 | Fix SQL injection in `CrmService.ts:75-79` and `ComptabiliteService.ts:147-149,204-205` | Auth'd-user SQLi | S |
| P0-4 | Add authorization to ungated mutating routes: factures create/pay, POS, CRM, clients, produits writes; gate `employes` reads; auth `notifications/status` | Any user can create invoices/sell/edit master data | M |
| P0-5 | POS: validate `prix_unitaire` server-side against product price; route POS through NumberingService | Sell-at-any-price + invoice-counter corruption | M |
| P0-6 | Fix broken `POST /api/paiements/` route (404) and widen payment-method enum to include mobile money | Standalone payment endpoint unusable; valid payments rejected | S |
| P0-7 | Move secrets out of `ecosystem.config.js` into untracked env; rotate `JWT_SECRET` | Committed production secret | S |
| P0-8 | Fix/retire `CashVarianceService` (renamed columns → 500) + add role gate | Live 500s + open cash-performance data | M |

### P1 — Correctness & accounting truth

| # | What | Why | Effort |
|---|---|---|---|
| P1-1 | Decide TVA policy once; either remove the inert TVA engine + `tva_taux` fields or wire it end-to-end and drop `027` zero-tax CHECK; reconcile account numbers `446` vs `4456/4457` | System-wide TVA contradiction; tax reporting impossible | L |
| P1-2 | Fix double-credit risks (avoir apply vs manual, BL→facture vs DB fn) | Customer ledger over-credited | M |
| P1-3 | Returns: move restock to approval, make `updateStatut` transactional with enum validation, un-restock on cancel | Inventory drift | M |
| P1-4 | Make `FactureService.updateStatut` transactional + validate statut enum (fix TOCTOU) | Invoice cancellable mid-payment | S |
| P1-5 | Drop legacy `log_produits_stock` trigger (002) | Duplicate stock movements polluting history | S |
| P1-6 | Unify inventory valuation: one method; maintain `valeur_stock`/CMP on sales & transfers; make per-location vs global `prix_achat` coherent | 3 conflicting inventory values across reports | L |
| P1-7 | Fix `addStockMovement` arg-order bug + add `location_id` to schema | `/produits/:id/mouvements` broken | S |
| P1-8 | Fix supplier-acompte endpoints referencing non-existent `factures_fournisseur.numero_facture`; fix `montant_credit` null insert | Runtime throws / constraint violation | S |
| P1-9 | Commande delete → transactional cleanup + audit; add purchasing audit logging; remove dead `fournisseur_id` fallback | Orphaned invoices, no audit trail | M |
| P1-10 | Enforce period locking on triggers/all financial writes (not just manual GL) | Closed periods can still be posted to | M |

### P2 — Completeness & feature gaps

| # | What | Why | Effort |
|---|---|---|---|
| P2-1 | Wire or remove batch/lot + serial tracking (build controllers/services/routes/validation, repoint FKs to `tiers`, schedule `expire_old_lots()`) | Paid-for schema with no functionality | L |
| P2-2 | Mount or remove camion/gasoil module (`routes/camions.ts` unmounted) | Dead fleet module | S |
| P2-3 | Implement `quantite_reservee` write path or remove the reservation concept | Half-built reservations | M |
| P2-4 | Post caisse movements to the GL | Cash isolated from accounting | M |
| P2-5 | 3-way match (commande ↔ reception ↔ facture fournisseur) | No procurement control | L |
| P2-6 | Add stock-location update/delete + transfer cancel | Master data uneditable, stuck transfers | S |
| P2-7 | Consolidate RBAC to one model; enforce per-user DB permissions (057/058) or remove the UI; collapse the two `requirePermission` functions | Permission UI is misleading; security relies on coarse roles | L |
| P2-8 | Payroll module (runs/payslips/disbursement) on top of existing HR | "Feature-complete ERP" gap | L |
| P2-9 | Multi-currency: wire `066/067` conversion + `devise` | XOF hardcoded everywhere | M |

### P3 — Hardening, tests, polish

| # | What | Why | Effort |
|---|---|---|---|
| P3-1 | Move JWT to httpOnly cookie or harden localStorage usage; stop passing token in SSE query string; enforce revocation on SSE | XSS/log-leak token exposure | M |
| P3-2 | Add password complexity policy; fix `register` role handling | Weak credentials | S |
| P3-3 | Build a real ordered, tracked migration runner; delete ad-hoc `.mjs` scripts | Migration order is implicit/fragile | M |
| P3-4 | Add CI (lint + typecheck + test + build); add frontend ESLint config | Nothing gates quality | M |
| P3-5 | Raise test coverage (services + integration BE; pages/hooks FE); add Playwright E2E or drop the dep | Threshold unmet, near-zero FE coverage | L |
| P3-6 | Delete dead/duplicate code (see §4 list); collapse duplicated axios instances | Maintenance burden, double-post hazard | M |
| P3-7 | Replace `Promise<any>`/`as any` in FE API layer with generated/shared types | Type safety lost at boundary | M |
| P3-8 | Fix idempotency middleware (don't cache errors; scope per user); replace `patch-router` monkey-patch with explicit param validators | Replayed 500s, validation bypass | M |
| P3-9 | Add pagination to `CommandeController.getAll`; cap/export-stream large exports | Unbounded queries | S |
| P3-10 | Reconcile README + frontend deploy story (static serving / nginx) | Stale docs, undocumented FE deploy | S |

---

## 6. Verification notes / `[unverified]`

- Multi-currency wiring of `066_taux_conversion.sql` / `067_add_devise_to_paiements.sql` — migrations exist; end-to-end use `[unverified]`.
- Which of `019` vs `069` `ecritures_comptables` actually exists in any given deployed DB depends on apply order — `[unverified]` without DB access.
- `valeur_stock` LEFT JOIN inactive-location inclusion in valuation — flagged as worth verifying against live data `[unverified]`.
- Several "DB trigger keeps X in sync" claims (acompte `montant_restant`, supplier-invoice paid amounts) rely on triggers asserted in migrations but not runtime-verified `[unverified]`.

*No application source, schema, migration, or config files were modified in this pass.*
