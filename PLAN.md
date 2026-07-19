# Refactor & Fix Plan — 2026-07-19

Source: 5-track read-only audit (backend quality, frontend UI/UX, security/validation, DB/migrations, tests/CI/ops/features) on `main` @ `b6cd41f`. Every finding carries file:line evidence verified against current code. Items already fixed in the 2026-07-18 pass are excluded.

**Priorities:** P0 = money/data corruption or prod-breaking · P1 = correctness/security · P2 = quality/UX debt · P3 = polish.
**Effort:** S ≤ ½ day · M = 1–3 days · L = 1+ week.

---

## P0 — Fix first (money integrity + prod breakage)

| # | Problem | Evidence | Fix | Effort |
|---|---|---|---|---|
| P0-1 | **Stock transfers destroy inventory value.** Transfer into a location with no existing `stock_par_location` row inserts it with `cmp` DEFAULT 0 → trigger `076` sets `valeur_stock = 0`. Source loses `qty × cmp`, destination gains **zero**. Company-wide valuation shrinks on every such transfer. Returns restock has the same hole. | `StockTransferService.ts:233-242`, `DemandeService.ts:650-658`, `ReturnService.ts:248-251`, `ProduitService.ts:215`, `StockLocationService.ts:254` | One shared "costed stock-in" primitive used by **every** inflow: lock spl row, `new_cmp = (old_qty*old_cmp + qty*unit_cost)/(old_qty+qty)`, write `quantite`+`cmp` (076 derives value). Cost source: transfers → source-location cmp read in same tx; returns → `document_lignes.prix_achat_unitaire` (added `061`) fallback current cmp; init/adjust → `produits.prix_achat`. | M |
| P0-2 | **`POST /api/tiers/:id/acomptes-client` is ungated and unvalidated.** Any authenticated role (vendeur, depot_staff…) can record customer money-in with hand-rolled validation only. The fournisseur twin on the next line IS gated. Deprecated shim forwards to the same handler. | `routes/tiers.ts:32` (vs `:33`), `routes/comptes-clients.ts:22` | Add `authorize(['admin','manager','magasin_staff','caissier'])` (match the paiements POST) + a Zod schema on both routes. | S |
| P0-3 | **SSE stream fail-open for revoked sessions.** `WHERE ... is_active = true` returns 0 rows for a revoked session, and `rows.length === 0` falls through to `addClient` — logged-out/revoked tokens keep a live notification stream until JWT expiry (up to 7 days). | `routes/notifications.ts:27-37` | Invert: reject when no active session row (mirror `authenticate`). | S |
| P0-4 | **`trust proxy` never set.** Behind the prod proxy, express-rate-limit v8 throws `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` (requests 500); if validation disabled, all users share the proxy IP → global 500/15min + auth 10/15min caps lock out the whole site. `req.ip` in sessions/audit_log records the proxy IP. | `server.ts` (absent) | `app.set('trust proxy', 1)`. | S |
| P0-5 | **Auth rate-limiter locks out normal users.** `authLimiter` (10 req/15min/IP) covers all of `/api/auth` including `GET /me` (called on every SPA load) and logout/change-password. >10 page loads in 15 min = lockout — worse combined with P0-4. | `server.ts:73-79,94` | Scope limiter to `POST /login` (+ optionally `/register`). | S |
| P0-6 | **`paiements.facture_id ON DELETE CASCADE`** — hard-deleting a facture silently destroys payment history (same for `paiements_fournisseur`, acomptes/ledger `tiers_id` CASCADEs, `mouvements_stock.produit_id`, `commissions_ventes.facture_id`). App soft-deletes, but nothing stops psql/admin/future code. | `043_unified_tiers.sql:180,230,254,525ff,593ff`, `002:6`, `019:264` | Migration `089`: re-point these FKs `ON DELETE RESTRICT`. | S |
| P0-7 | **`commissions_ventes` dropped in `043`, never recreated, still read/written** by HR/payroll code — exists only out-of-band on the live DB; fresh replay or new environment breaks payroll. | `043:35` vs `EmployeService.ts:278,301,334`, `PayrollService.ts` | Migration capturing live shape: `CREATE TABLE IF NOT EXISTS commissions_ventes (...)` with `facture_id` RESTRICT. | S |
| P0-8 | **CI green is misleading.** No Postgres service in Actions and the integration suites (~80% of 245 tests) have no skip guard (`beforeAll → getAuthToken → real pool`) — they cannot pass in CI; the `ci.yml:31` comment claiming they're guarded is false. | `.github/workflows/ci.yml`, `FactureController.test.ts:53` | Add `services: postgres` to the backend job + run `node migrate.mjs` before tests (also gives migration-regression coverage). | M |

---

## P1 — Security & correctness

### Security

- **Disabled users keep access up to 7 days.** `authenticate` never checks `utilisateurs.actif`, and deactivation paths don't revoke sessions — revoke on `actif=false` and/or join `actif` in the session lookup. (`middleware/auth.ts:93-122`, `AdminUserService.ts:86`, `AuthController.ts:391`) — S
- **Admin-created passwords bypass the strength policy** enforced in register/changePassword — apply `isStrongPassword`/Zod in `AdminUserService` create+update. (`routes/admin-users.ts:11-12`, `AdminUserService.ts:46,112-114`) — S
- **`changePassword` doesn't revoke other sessions** — a stolen session survives a password change. Call `revokeAllUserSessions` (except current). (`AuthController.ts:298-342`) — S
- **Attachments have no role/entity ACL** — any authenticated user can list/download any entity's files, including `employe` HR docs while `employes` routes are admin/manager-only. Gate by entity type at minimum. (`routes/attachments.ts:9-11`) — S
- **SSE `?token=` fallback leaks JWTs into pino logs** (`req.originalUrl` logged) and proxy logs. Cookie auth works for same-origin EventSource — drop the fallback or redact query strings in the logger. (`routes/notifications.ts:13`, `utils/logger.ts:30`) — S
- **`patch-router` misses `tiersId` + `payslipId`** (reach `parseInt` unvalidated); string params `compteNumero`/`pieceType` bypass by design — add the two IDs, validate strings in-route. (`middleware/patch-router.ts:11-20`, `routes/crm.ts:35,40`, `routes/payroll.ts:25-26`) — S
- **Committed scripts contain default credentials** (`admin123` etc.) and `reset-users.mjs` resets prod users to them if run — guard behind `NODE_ENV !== 'production'` or delete. (`reset-users.mjs:21-23`, `scripts/create-depot-user.mjs:28`) — S
- **Missing `validateBody` on money/stock mutations** (Zod is the standard): `caisses-hierarchy.ts:27,30,36` (inter-caisse transfer!), `paiements.ts:18` (payment rewrite), `stock-transfers.ts:12`, `stock-locations.ts:12-13`, `demandes.ts:28,31,41`, `retours.ts:15`, `tiers.ts:22,32,33`, `avoirs.ts:30`, `payroll.ts:22-23`, `user-location-assignments.ts:13`, `admin-users.ts:11-12`, `auth.ts:8,12,14,19`, `fournisseurs.ts:31,41` (shim skips tiers schemas). Prioritize money/stock paths. — M
- **Audit-log blind spots on the money paths**: PaiementService, AcompteService, TiersService, POSService, **GeneralLedgerService manual entries**, `ComptabiliteService.enregistrerPiece` (imports `logAudit`, never calls it), AdminUserService, CompanySettings, CRM. Wire `logAudit` into money/GL/user-admin first. — M

### Backend correctness

- **Business errors surfaced as generic 500s** on the newest UI flows: `GeneralLedgerController.createManualEntry` maps everything to 500 while the service throws user-facing messages ("écriture non équilibrée", period 422) — the brand-new manual journal form shows "Erreur serveur" for every user mistake. Same in `CaisseHierarchyController` ('Fonds insuffisants' → 500) and `FactureFournisseurController.recordPayment`. Adopt `businessError`/`businessStatusOf` in those services/controllers. — S each
- **`err.message` leaks / 400-catch-alls remain** in ~10 controllers (Reception, Return, Facture:77-82, Demande, DepenseV2, POS, CaisseMagasin, Payroll 13 sites, Attachment, comptabilite route) — roll out the `utils/errors.ts` pattern; only 3/28 controllers use it today. — M
- **Double-write on `produits.stock`**: trigger `020` recomputes it from `SUM(stock_par_location)`, yet 6 service sites also `UPDATE produits SET stock = stock ± $1` in the same tx (dead work + extra lock; `FactureService.ts:386` reads the cache mid-flight for its guard). Remove direct updates, rely on trigger + `029` CHECK. — M
- **Unbounded endpoints**: `/factures/export` and both GL exports pull `limit: 100000` joined rows; `DemandeService.getDepotStockForDemande` returns ALL products per keystroke; `clients/:id/historique` no LIMIT. Bound/stream/paginate. (`FactureController.ts:30-46`, `routes/general-ledger.ts:25-87`, `DemandeService.ts:821-845`, `routes/clients.ts:147-165`) — M
- **JWT/session/cookie TTL desync**: `JWT_EXPIRATION` configurable but DB-session TTL and cookie maxAge hardcode 7d — derive all three from one source. (`middleware/auth.ts:183-184`, `AuthController.ts:84`) — S

### DB constraints & indexes (bundle into migrations `089`–`090`)

Constraints:
- `ecritures_comptables.debit/credit` **nullable, no ≥0 CHECK**, and `071` dropped the `journal` CHECK without re-adding one — negative/NULL ledger amounts and arbitrary journal strings accepted at DB level. Add NOT NULL + `CHECK (debit>=0 AND credit>=0 AND NOT (debit>0 AND credit>0))` + fresh journal enum CHECK. (`069:26-27`, `071:155-159`)
- No `montant > 0` CHECK on `paiements`, `paiements_fournisseur`, `acomptes_clients`, `acomptes_fournisseur`, `mouvements_caisse` (depenses/compensations already have it — copy pattern).
- `mouvements_caisse.type/categorie` nullable (CHECK passes NULL) — backfill + `SET NOT NULL`. (`046:9-15`)
- `sessions_caisse.magasin_id` nullable — bypasses the one-open-session-per-magasin unique index. `SET NOT NULL`. (`045:9,93`)
- `document_lignes`/`retour_lignes`/`commande_lignes` quantities unconstrained — `CHECK (quantite > 0)`, `prix_unitaire >= 0`.
- Period-lock trigger is `BEFORE INSERT` only — extend to UPDATE/DELETE. (`075:43`)

Indexes (all verified missing post-`043` rebuild, matched to live query predicates):
- `ecritures_comptables(tiers_id) WHERE tiers_id IS NOT NULL` (grand livre by tiers)
- `factures_fournisseur(date_facture DESC)` (list ORDER BY; index died in 043 rebuild)
- `paiements(session_caisse_id)` (024_link's index voided by 043), `acomptes_clients(session_caisse_id)`
- `stock_transfer_lignes(transfer_id)`; `retour_lignes(facture_id, produit_id)` (over-return check); `commande_lignes(produit_id)`
- Bug: `023:114` created `idx_sessions_caisse_id` on the **wrong table** (dup of `idx_caisses_parent`) — `sessions_caisse(caisse_id)` still unindexed.

Migration hygiene:
- Fold orphan `backend/migrations/002_fuzzy_search.sql` (pg_trgm + GIN) into a tracked migration — fresh DB currently silently degrades fuzzy search to ILIKE. Delete dead `001_fifo_allocation.sql` + `scripts/run_fifo_migration.js`.
- `src/db/schema.sql` is dead (stale since 2026-05-16: still has `clients`, TVA seeds) — delete or replace with generated `pg_dump --schema-only`.
- Chain is **not fresh-DB replayable** (`004` alters `clients` no migration creates; `010` uses `CREATE INDEX CONCURRENTLY` inside a tx; `001` contradicts 043 shapes) — document baseline-only, or squash a real baseline `001`.
- Drop orphan functions: `expire_old_lots()` (references dropped `lots`), `update_client_solde()`, `log_mouvement_stock()`.
- `065` cmp→`prix_achat` sync is last-location-writer-wins — make weighted global average or stop syncing.

### Frontend correctness

- **`DocumentListPage` shows EmptyState on fetch failure** — API outage reads as "Aucune facture" with no retry. Add error branch (QueryState pattern exists). (`components/DocumentListPage.tsx:145-149`) — S
- **4 orphan routes**: `/comptabilite`, `/tresorerie`, `/clients/analytics`, `/admin/audit` have zero in-app links; `/settings` reachable only via `g s` shortcut. Add to navConfig. (`App.tsx:134,334,339,344`) — S
- **Inventaire product form has no submitting flag** — double-click creates duplicate product. (`pages/Inventaire.tsx:194-226`) — S
- **Fetch-all list pages**: Avoirs (fetches every avoir then client-filters), Commandes, DemandesList, StockTransfers, GeneralLedger (full-year écritures unbounded), UserManagement (silent 100-user cap). Migrate the first four to DocumentListPage; paginate GL + UserManagement. — M

---

## P2 — Refactoring & UX debt

### Backend refactoring (in order of payoff)

1. **Extract `TiersController` acompte transactions** — two ~145-line copy-pasted inline transactions (idempotency, session resolution, acompte INSERT, caisse mouvement, ledger insert) → `AcompteService.createClient/createFournisseur` (service already owns the identical apply/refund flows). (`TiersController.ts:153-296,298-440`) — M
2. **Single source for payment methods** — list duplicated **12×** and diverging (6 identical Zod enums + 1 divergent, `PAYMENT_METHODS` in PaiementService, 3 inline `VALID_METHODS`, stale unions in `models/Paiement.ts`/DepenseV2/CaisseMagasin). Export one const + `z.enum`. — S
3. **NumberingService adoption** — 11 inline `nextval(` sites reimplementing `PREFIX-YYYY-#####` (two even format `transfer_numero_seq` independently — divergence risk). Extend the type map, delete the inlines. — M
4. **Shared open-session resolver** — same `sessions_caisse ... statut='ouverte'` SQL in 6 places. — S
5. **Move remaining reads to services**: `CommandeController` getAll/getById/getMatch/getStats, `PaiementController` reads, `AcompteController` 4 reads, `DemandeController.getAll` (~90 lines dynamic SQL ×2 for count), `ProduitController.getPurchaseInfo` (6 sequential queries → `Promise.all`), `CaisseMagasinController.recordMouvementDivers`, inline SQL in route files (`caisse.ts:50-101`, `tiers.ts:36-75`). — M
6. **Response envelope normalization** — standard is `{ success, data, pagination }`; Paiement/Acompte/Commande/Produit controllers return raw rows/`{data}`/`{message}` variants; error envelope drift (`{error}` without `success:false`); pagination key drift (`pages` vs `totalPages`). Normalize + fix FE consumers in same pass. — M
7. **Unify location-access helpers** (3 implementations, different fallbacks: `CaisseMagasinService.getUserMagasinRole`, `permissions.getUserLocationRole`, `DepenseServiceV2.canAccessMagasin`); move the repeated 7-site `'none'→403` check into middleware. — S
8. **Logging**: 3-way inconsistent (pino / `consoleError` wrapper / ~150 bare `console.error`) — standardize on pino. — M
9. **Dead code**: `services/ClientService.ts` (zero imports), `models/Paiement.ts` (never imported), unwired root `.mjs` scripts (`backfill-*`, `detect-*`, `generate-hashes`, `reset-db`, `reset-users`, `wipe-and-seed-info`), ~15 ad-hoc `backend/scripts/` check/test scripts. Delete. — S

### Frontend UI/UX

Adoption today: QueryState 11/45 pages (+3 via DocumentListPage), PageHeader 10/45.

- **QueryState rollout** to the spinner-only/no-retry pages first: Tresorerie, StockValuation, ClientAnalytics, Receptions, Reapprovisionnement (error = toast + empty page today). Then remaining manual-fetch pages. — M
- **DocumentListPage migration**: Avoirs, Commandes, DemandesList, StockTransfers. — M
- **User menu dropdown** in Topbar (profile / change-password / theme / logout) — username is a static chip today; ChangePassword only reachable via forced flow. (`components/Topbar.tsx:80-97`) — S
- **DateRangePicker with presets** (mois/trimestre/année) — date filters are raw paired `<Input type="date">` on AuditLog, GeneralLedger, Comptabilite, Reporting, CaisseAudit. — M
- **Persistent notification center** — bell covers demandes only (30s poll); SSE events elsewhere are transient toasts. Merge into one persistent center. — M
- **Breadcrumbs** on detail pages (currently single back-arrow). — S
- **Unsaved-changes guard on dialog forms** (UserManagement, Employes, Tiers, Inventaire, Commandes inline create, StockTransfers, DepensesV2) — closing drops input silently; RHF doc forms already guarded. — M
- **Reapprovisionnement partial-failure UX** — sequential PO-creation loop, mid-loop failure leaves partial POs with only a toast counter — per-supplier status + retry. (`pages/Reapprovisionnement.tsx:75-90`) — S
- **Mobile**: plain `<table>` without ResponsiveTable on AuditLog, DemandesList, GeneralLedger ×3, Receptions ×2, Reporting ×2, UserManagement, DemandeDetail, DemandeForm, NouveauDevis, NouvelleFacture. — M
- **Accessibility**: `TiersPicker` is mouse-only (no keyboard nav, no listbox ARIA — used in every doc-creation form) — fix first; icon buttons missing aria-label (Avoirs, Comptabilite, CommandeDetail, NotificationBell, DemandeForm ×5). — M
- **Dark-mode chip contrast**: light-only `bg-*-100 text-*-700` badge maps in Receptions, Avoirs, AuditLog, GeneralLedger (UserManagement does it right — copy). Two raw `text-blue-600` status actions in Commandes → `info` token. — S
- **Non-RHF dialog forms** (UserManagement, Commandes, StockTransfers, Inventaire, Employes, Tiers, CaisseV2, ParametresFinance) — hand-rolled checks + toast, no field-level feedback; zod schemas exist in `validation/schemas.ts` unused. Migrate opportunistically when touching each page. — L
- Confirm-dialog drift: DevisDetail/BonLivraisonDetail bespoke Dialogs vs canonical `useConfirm` (13 files) — harmonize when touched. — S

### Tests & CI

- **Top untested money/stock services** (ranked): ReceptionService (CMP basis — a bug corrupts all valuation), POSService, GeneralLedgerService, PayrollService (CNPS/ITS math), FactureFournisseurService (3-way match), BonLivraisonService (BL→facture + stock out), ReturnService (restock state machine), StockTransferService, CompensationService, ClientAllocationService (direct units). — L (spread over sprints)
- **FE money flows untested**: CaisseV2 (POS), PaymentModal (used everywhere), caisse pages, Payroll. — M
- **Coverage gate dead**: both CI jobs run `npm test` without `--coverage`; 60% thresholds never evaluated. Enforce BE first, FE once closer to threshold. — S
- **E2E**: playwright devDep, zero config/specs — add one login→facture→paiement smoke spec or drop the dep. — M

### Ops / prod-readiness

- **No error monitoring** (no Sentry/APM) and **no log rotation** (pino→stdout, PM2 captures unbounded) — add Sentry (needs DSN decision) + `pm2-logrotate`. — S each
- **Backups**: script good but cron is documentation-only, restore never tested, single local copy — schedule + restore-test + off-site. — M
- DB pool `max:10` hardcoded (`db/connection.ts:12-14`) — env-tunable. — S
- `ecosystem.config.js` hardcoded fallback `cwd`; no `kill_timeout` matching the 10s drain. — S
- **sw.js caches `/api` GET responses (financial data) in Cache Storage** on shared machines — exclude `/api/` from caching. — S
- FE prod serving: nginx example only in README, no config file in repo. — S

---

## P3 — Polish & cleanup

- `api.ts`: **118 `Promise<any>`** — type getAll/getStats list endpoints first; duplicated axios instance vs `authService.ts` (divergent interceptors) — merge. — M
- Backend `any`: 480 occurrences / 83 files; 110 service methods return `Promise<any>` (Reporting 10, Payroll 9, CaisseMagasin 9…). `TiersController` uses `(req as any).user` 6× instead of `AuthRequest`. Chip away per-module. — L
- `utils/pagination.parsePagination` exists but re-hand-rolled in 7 controllers; `successResponse` dual-signature overload — split. — S
- Per-route rate limit on PDF/export endpoints (CPU abuse cap). — S
- `/login` body Zod (non-string password → bcrypt throw → 500 noise). — S
- README API table covers 4/33 routers, "Phase 1 COMPLETED" framing stale; no OpenAPI; no French end-user manual. — M
- CLAUDE.md drift: claims cookie-parser used (it isn't — auth parses raw header); DepenseService V1 "dead" claim wrong (3 report helpers still used by V2 controller). Update. — S

---

## Features to add (verified absent)

| Feature | Notes | Effort |
|---|---|---|
| **Supplier PO PDF (bon de commande)** | The one document you send to a supplier — missing while facture/devis/BL/avoir/payslip all have PDFs. PDFService exists. | S |
| POS ticket + reçu de paiement PDFs | Same gap; also réception + facture fournisseur + retour PDFs. | S each |
| **Wire POS barcode** | Backend `POSService.scanBarcode` + `barcode_scans` table exist; `CaisseV2.tsx` has zero scan references — orphaned feature. | S |
| Password reset | No mail infra at all — **decision needed**: admin-reset (S, no infra) vs token-email (M, needs SMTP). | S/M |
| User profile page | Only ChangePassword exists. | S |
| Audit-log retention/purge | `audit_log` unbounded; sessions already purged — extend `SessionCleanupService`. | S |
| Dashboard configurability | Static layout; user-arrangeable widgets. | M |
| CRM pipeline/opportunities | Interactions+tasks only today. | M |
| Financial budgeting / Manufacturing BOM | Large; likely out of scope — decide explicitly. | L |

---

## Suggested execution order

1. **Sprint 1 — P0 (1 week):** P0-2..P0-5 security quick wins (1 day) → migration 089 (FK RESTRICT + commissions_ventes + ledger CHECKs + hot indexes) → P0-1 costed stock-in primitive → P0-8 CI postgres.
2. **Sprint 2 — P1 security+correctness:** actif check + session revocation cluster, Zod on money/stock routes, GL/CaisseHierarchy error mapping, audit-log on money paths, DocumentListPage error branch + orphan routes + Inventaire double-submit.
3. **Sprint 3 — P2 backend refactor:** TiersController extraction, payment-methods + NumberingService consolidation, envelope normalization, unbounded endpoints.
4. **Sprint 4 — P2 UX:** QueryState rollout + DLP migrations, user menu, DateRangePicker, notification center, mobile tables, TiersPicker a11y.
5. **Ongoing:** money-path test suites (Reception → POS → GL → Payroll → FF), ops items (Sentry, logrotate, backup cron), P3 typing.
