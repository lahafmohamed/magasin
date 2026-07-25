# ERP Audit — magasinProgramme (Hitek)

**Date:** 2026-07-22 · **Scope:** full repo (433 tracked files; backend 25 645 src lines, frontend 30 349) · **Method:** manifest/config review, module mapping, 4 parallel scans (dead code, outdated/insecure, refactor, UI/UX) with file:line verification; cross-checked against PLAN.md (2026-07-19) fix status. Analysis only — no source changed. Prior AUDIT.md backed up to the session scratchpad.
Findings marked † are carried from PLAN.md's 2026-07-19 tracks (still open there, not re-verified line-by-line today).

## Remediation update — 2026-07-23

The current UX remediation batches have been implemented after the audit:

- Backend integration tests are now guarded to disposable test databases,
  serialized, and automatically reset before and after each run.
- Paginated purchase orders render correctly, and paginated API envelopes are
  explicit types instead of array metadata.
- Normal sales flows reject zero or missing unit prices on both the backend and
  frontend.
- Cash sessions older than 24 hours require manager action; POS cash failures
  now roll back instead of being swallowed.
- The audited no-TVA terminology, core French labels, mobile inventory,
  server-paginated receivables, ledger findability, contact/payment validation,
  chart accessibility, and global-search/dialog accessibility were corrected.
- Disposable role fixtures now verify every supported login, first useful read
  path, direct authorization denial, logout revocation, and protected-route
  rejection without touching customer data.
- Backend 321/321 tests and frontend 49/49 tests pass; both production builds
  and both lint commands pass.

Still open before customer release: approved historical-data cleanup and KPI
reconciliation, business-owner role UAT, the wider validation/accessibility
sweep, and release/rollback approval. See
`UX_REMEDIATION_PLAN_2026-07-23.md` for the tracking matrix.

## 1. Executive summary

1. Post-hardening core is sound: zero SQL-injection sites found (all interpolation allow-listed), every mutating route gated, DB-enforced period locks and CHECKs, CI runs the full integration suite against real Postgres.
2. Structural debt is concentrated: god services (`BonLivraisonService` 1000 / `DevisService` 926 / `DemandeService` 836 / `CaisseMagasinService` 739 lines) and fat controllers — `TiersController` carries ~300 lines of copy-pasted acompte money transactions.
3. Top correctness risk is mirror-twin drift: client vs fournisseur acompte/allocation flows diverge — allocation recompute runs on the AR side only, and AP has no repair engine at all.
4. The three money/stock write paths (`FactureService`, `ReceptionService`, `DemandeService.execute`) run N+1 query loops with row locks inside transactions — contention and deadlock exposure as volume grows.
5. Runtime is past EOL: Node 20 (EOL 2026-04-30) with no `engines` pin; express 4, vite 5, tailwind 3, react 18, react-router 6 are each ≥1 major behind; npm `xlsx` is frozen at 0.18.5.
6. Typing collapses at the boundaries: 118 `Promise<any>` in `api.ts` (1630 lines), 481 backend / 172 frontend `: any`, heaviest exactly in payroll/accounting/tiers code.
7. Dead-code tail is small (repo already swept twice): the POS barcode vertical slice, 4 unused permission components, and ~10 unused exports/tables/seeders remain.
8. UI/UX: 24 raw `.toFixed(2) + ' XOF'` money renders, raw-DB-id source-document inputs on avoir/BL creation, no pagination on Commandes/GeneralLedger, 5+ pages toast-and-blank on fetch errors, keyboard/a11y gaps in `TiersPicker`/`GlobalSearch`.
9. CI gaps: coverage thresholds configured but never evaluated (`npm test` without `--coverage`), no npm audit, no dependabot/renovate, no CodeQL; prod Postgres version unpinned vs `postgres:18` in CI.
10. Nothing found blocks daily operation; order of attack = money-correctness clusters first, then platform updates, then consistency sweeps.

## 2. REFACTOR

| file path | issue | why it matters | effort | priority |
|---|---|---|---|---|
| backend/src/controllers/TiersController.ts | ✅ **FIXED 2026-07-22** — both ~150-line inline transactions extracted to `AcompteService.createClient`/`createFournisseur` (one parametrized core); controller is now thin with `businessStatusOf` error mapping | — | Was: untestable inline money logic, drifting twins | L | P1 |
| backend/src/services/AcompteService.ts + db/095 | ✅ **FIXED 2026-07-22** — the real defect behind the apply/refund asymmetry was worse than logged: sync triggers (048/051) recomputed `montant_restant = montant − Σ(applications)` ignoring refunds, so a partial refund was **resurrected** by any later application event (double payout). Migration `095` adds `montant_rembourse` (both tables, backfilled) into sync + cap triggers; both refund paths now write it. Trigger-level regression test added (`AcompteRefundTracking.test.ts`) | — | Was: refunded money spendable again | M | P1 |
| (architecture note, same cluster) | Recompute-on-apply asymmetry is **by design**, now documented in code: client allocation derives from a fund pool (`recomputeClientAllocations`), supplier side is event-sourced (application rows + triggers). No supplier recompute call needed on apply/refund | — | — | — | — |
| backend/src/services/SupplierAllocationService.ts | ✅ **FIXED 2026-07-22** — `recomputeSupplierState` repair engine added (recomputes acompte restant/statut + facture montant_paye/statut from event rows, then FIFO-allocates freed funds; idempotent); exposed on `POST /tiers/:id/recompute-allocation?role=fournisseur` (admin) | — | Was: AP drift unrepairable | M | P1 |
| backend/src/services/FactureService.ts | ✅ **FIXED 2026-07-22** — create() batched: one ANY() pre-check query, one ordered bulk `FOR UPDATE` (produit_id ASC, spl then legacy fallback), running-balance per-line validation (duplicate-line semantics preserved), one guarded set-based deduction per store, one unnest movements insert. Stable lock order removes the deadlock exposure | — | Was: N+1 with locks held in-loop on the money path | M | P1 |
| backend/src/services/ReceptionService.ts | ✅ **FIXED 2026-07-22** (create path) — reception_lignes + mouvements + prix_achat sync now set-based; upfront ordered lock pass; `costedStockIn` kept per line by design (owns sequential CMP compounding). Delete-reversal loop left as-is (rare op, small N) | — | Was: ~4 queries/line where CMP is set | M | P1 |
| backend/src/services/DemandeService.ts | ✅ **FIXED 2026-07-22** — execute() batched: ordered lock pass on source+destination, running-balance validation, bulk transfer-lines insert, one depot decrement, bulk quantite_livree update; `costedStockIn` per line unchanged | — | Was: ~5 queries/line in transfer tx | M | P1 |
| backend/src/controllers/CommandeController.ts:10-80, 176-192 | `getAll`/`getById`/`getStats` build raw SQL in the controller, bypassing `CommandeService` | Half-thin half-fat controller; read-path logic untestable, no reuse | M | P1 |
| backend/src/controllers/DemandeController.ts:13-184 | `getAll()` is a 171-line method hand-building two near-identical query+count strings plus inline role logic | Filter lists silently drift apart → wrong pagination totals | M | P1 |
| backend/src/services/FactureFournisseurService.ts:325-328, 344-347 | `sousTotal += totalLigne` raw float accumulation, no per-line rounding (`PricingService.calculateTotals` does it right) | Supplier-invoice totals use a less defensive math path than client invoices | S | P1 |
| backend/src/controllers/DemandeController.ts, DepenseControllerV2.ts, CaisseMagasinController.ts, PayrollController.ts | ✅ **FIXED 2026-07-22** — all four on the `businessStatusOf` house pattern; their services' 36 plain `throw new Error` converted to `businessError(4xx)` (Demande 19, DepenseV2 9, Caisse 8); FE-consumed codes preserved (CAISSE_FERMEE + action_required, SESSION_CLOTUREE, ECART_COMMENT_REQUIRED); message-sniffing catch blocks removed | — | Was: err.message leaks + catch-all 400s | S | P1 |
| backend/src/services/BonLivraisonService.ts (1000 lines) | `create` ~239, `updateStatut` ~228, `convertToFacture` ~137, `delete` ~118 lines — CRUD + state machine + conversion + deletion in one class | God class on a stock+money flow; every change touches a 1000-line file | L | P2 |
| backend/src/services/DevisService.ts (926 lines) | `create` ~259 lines (largest method in repo); near method-for-method mirror of BonLivraisonService | Same god-class shape built twice — extract a shared document engine | L | P2 |
| backend/src/services/DemandeService.ts (836 lines) | CRUD + approval workflow + transfer execution combined | God class | L | P2 |
| backend/src/services/CaisseMagasinService.ts (739 lines) | `cloturerSession` ~217 lines; session lifecycle + GL posting + per-user reporting mixed | God class on the cash path | L | P2 |
| backend/src/services/TiersService.ts:189-311 vs 486-576 (and 312-485) | Three independently maintained near-copies of the tiers account-statement CTE SQL | Change-one-miss-two on customer/supplier statements | M | P2 |
| backend/src/services/ClientAllocationService.ts:275-396 | `testAllocation()` re-implements the FIFO simulation from `recomputeClientAllocations()` (~120 dup lines, same file) | FIFO rule change in one copy = silent test/prod mismatch | M | P2 |
| frontend/src/pages/NouveauDevis.tsx:37-108, NouvelleFacture.tsx:41-136, NouveauBonLivraison.tsx:19-86, NouvelAvoir.tsx:60-76 | Four create pages share near-identical ligne zod schema + byte-identical useDraft/beforeunload dirty-guard blocks | ~20 lines ×4 duplicated; no shared hook | M | P2 |
| frontend/src/services/api.ts (1630 lines) | 28 hand-rolled CRUD service objects, `getById` pattern ×16, 118 `Promise<any>` | Biggest FE file is boilerplate with no type safety; needs CRUD factory + response types | L | P2 |
| frontend/src/pages/CommandeDetail.tsx (956 lines, 18 useState) | Detail view + inline edit form + 3-way-match panel + product drawer in one component | God component, 3× sibling detail pages' size | L | P2 |
| backend/src/services/CommandeService.ts:34-36 + frontend/src/pages/CommandeDetail.tsx:315 + Commandes.tsx:339 | Identical `qty × prix_unitaire` reduce-sum in 3 places, none cents-safe | Classic money-calc duplication | S | P2 |
| backend/src/services/PayrollService.ts (24), controllers/TiersController.ts (17), services/ComptabiliteService.ts (16), FactureFournisseurService.ts (14), DevisService.ts (13) | Worst `: any` files of 481 backend occurrences | Payroll/tiers/accounting — the money-sensitive code — has no compile-time guardrail | M | P2 |
| frontend/src/pages/Dashboard.tsx (21), components/DashboardDemandeWidgets.tsx (14), pages/TiersDetail.tsx (13) | Worst of 172 frontend `: any`, fed by untyped api.ts | No type safety from API layer down | M | P2 |
| frontend/src/pages/ (40 of 49 files) | Every page hand-rolls `useEffect` + fetch + loading/error state; no shared data hook, no query lib | Loading/error/retry reinvented 40×; inflates page sizes (Inventaire 1285, Dashboard 1174) | L | P2 |
| backend/src/controllers/ProduitController.ts:373-548 | 🟡 **PARTIAL 2026-07-22** — the 5 independent analytics queries now run in one `Promise.all` after the existence check (was 6 sequential round-trips); identical output. Still lives in the controller — the move to ProduitService/ReportingService is the remaining half | Extract to a service | M | P3 |
| backend/src/controllers/AcompteController.ts:105-206 | 4 raw-SQL read methods bypass acompteService while writes go through it | Inconsistent layering in one controller | S | P2 |
| frontend/src/pages/FactureDetail.tsx (719), DevisDetail.tsx, BonLivraisonDetail.tsx, AvoirDetail.tsx | Four detail pages hand-roll the same header-card + lignes-table + actions + PDF shape (list pages already share DocumentListPage.tsx) | Detail-page reuse stalled halfway | L | P2 |
| backend (12 sites) † | Payment-method list duplicated ~12× (zod enums, `PAYMENT_METHODS`, inline `VALID_METHODS`) and diverging | One canonical const + `z.enum` | S | P2 |
| backend (11 sites) † | Inline `nextval(` document-numbering re-implementations bypass `NumberingService` | Numbering divergence risk | M | P2 |
| backend (6 sites) † | Same `sessions_caisse … statut='ouverte'` resolver SQL copy-pasted | One shared resolver | S | P2 |
| backend controllers † | Response-envelope drift: raw rows / `{data}` / `{message}` variants vs standard `{ success, data, pagination }`; pagination key drift (`pages` vs `totalPages`) | FE must special-case per endpoint | M | P2 |
| backend/src/middleware/permissions.ts, services/CaisseMagasinService.ts, services/DepenseServiceV2.ts † | Three location-access helper implementations with different fallbacks; 7 repeated `'none'→403` checks | Access-rule drift | S | P2 |
| backend/src (~150 sites) † | Logging three ways: pino, `consoleError` wrapper, bare `console.error` | Standardize on pino; console noise in prod | M | P2 |
| frontend/src/components/ui/print-layout.tsx:93-94 | Re-sums sousTotal client-side for print instead of using stored totals | Wrong if doc edited after totals persisted | S | P3 |
| backend/src/services/CommandeService.ts:70-96, 148-177, 249-252 | Per-ligne INSERT/DELETE loops; repo already uses `unnest()` bulk insert (FactureService.ts:422-426) | Small-N N+1, free win | S | P3 |
| backend/src/services/AdminUserService.ts:59-62, 140-143 | INSERT-per-location loop on role assignment | Small-N N+1 | S | P3 |
| backend/src/services/TiersService.ts:20-53 | `solde_client_actuel`/`solde_fournisseur_actuel` cached columns selectable/sortable via API but display uses live `calculer_solde_*()` | Misleading dead columns; trap for next dev | S | P3 |
| backend/src/controllers/ClientController.test.ts | Live, passing supertest suite for `/api/clients` — but named after a controller class that never existed | Rename to `clients.routes.test.ts`; misleads navigation | S | P3 |
| backend/src/db/ (migrations 001..094) | Duplicate `024` number pair; chain not fresh-DB-replayable (`004`, `010 CONCURRENTLY` in tx, `001` vs `043` shapes) — baseline-only by construction † | Document baseline-only status or squash a real 001 | M | P3 |

## 3. UPDATE

| item | current version or pattern | recommended | breaking-change risk |
|---|---|---|---|
| Node.js runtime | ✅ **DONE 2026-07-22** — CI both jobs → Node 22; `engines: { node: ">=22" }` added to both package.json (verified `npm ci` stays in sync via `--dry-run`, warn-only so local Node 20 still installs) | — | — |
| express (backend/package.json) | ^4.18.2 (resolved 4.22.1) | 5.x | med — `req.query` getter-only, path-to-regexp v8 route syntax; 36 routers to retest |
| tailwindcss (frontend/package.json) | 3.4.19 | 4.x | high — CSS-first `@theme` rewrite; shadcn/tailwindcss-animate setup manual port |
| react + react-dom | 18.3.1 | 19.x | high — verify radix/recharts/react-day-picker/RHF compat first |
| vite | 5.4.21 | 7.x | med — needs Node 20.19+/22; plugin API tweaks |
| react-router-dom | 6.30.3 | 7.x | med — splat/relative-path semantics, ESM-only |
| react-day-picker | 8.10.1 | 9.x | med — modifiers/style API rewrite; bundle with React 19 move |
| xlsx / SheetJS (only import: frontend/src/hooks/useExportExcel.ts:2) | 0.18.5 — npm registry frozen since 2023 | 0.20.x via cdn.sheetjs.com dist | med — new install source, not a semver bump |
| date-fns | 3.6.0 | 4.x | low |
| @types/node | ^20.10.5 (resolved 20.19.39) | ^22 | low — **deferred**: bumping the declared floor desyncs the lockfile and needs `npm install` (not run this session); types-only, do it alongside the next dependency refresh |
| typescript (declared floor) | ^5.3.3 declared, 5.9.3 resolved in both lockfiles | declare ^5.9 | low — floor is stale/misleading only |
| frontend/public/sw.js | ✅ **FIXED 2026-07-22** — `/api` is now network-only (no `cache.put`, no cache read); `networkFirst` replaced by `networkOnly`; `CACHE_NAME` bumped v2→v3 so the activate handler purges the old cache that may still hold financial API data | — | — |
| frontend/src/hooks/useExportExcel.ts + frontend/src/utils/csv.ts | ✅ **FIXED 2026-07-22** — formula injection neutralized at both export sinks: `sanitizeCell` in the Excel hook and a leading-char guard folded into `escapeCell` (covers every CSV exporter — GeneralLedger, ClientAnalytics, StockValuation). Cells starting `=+-@\t\r` get a `'` prefix (quoting alone doesn't stop Excel evaluating them) | — | — |
| backend/src/controllers/DevisController.ts, BonLivraisonController.ts, CreditNoteController.ts, EmployeController.ts | ✅ **FIXED 2026-07-22** — `limit` clamped `Math.min(200, …)` in all four | — | — |
| backend/src/routes/fournisseurs.ts | ✅ **FIXED 2026-07-22** — POST runs legacy-shape adaptation middleware then `validateBody(createFournisseurSchema)`; PUT gets `updateFournisseurSchema` (the previously-unused aliases, now live) | — | — |
| Admin raw-body routes | ✅ **FIXED 2026-07-22** — 7 new Zod schemas wired: demandes create/update/decide, payroll cotisation/barèmes, 3-way match-config, user-location-assignments, auth admin user-update | — | — |
| backend/src/controllers/AuthController.ts | ✅ **FIXED 2026-07-22** — user-not-found path now runs a real cost-12 `bcrypt.compare` against a static dummy hash, equalizing latency with the wrong-password path (no more username-enumeration oracle) | — | — |
| ecosystem.config.js | ✅ **FIXED 2026-07-22** — `DB_USER` now `requiredEnv('DB_USER')` (throws instead of the hardcoded `'mohamed'` default). `DB_PASSWORD` left pass-through: an empty password is legitimate for socket peer-auth (default `DB_HOST` is a unix socket), so it's intentionally not required | — | — |
| .github/workflows/ci.yml (both jobs) | ✅ **PARTIAL 2026-07-22** — added `npm audit --audit-level=high` (non-blocking `continue-on-error` — advisories surface without walling off merges), `.github/dependabot.yml` (npm backend+frontend + github-actions, minor/patch grouped), `.github/workflows/codeql.yml` (javascript-typescript, security-and-quality, PR + weekly). **Coverage gate still OFF**: measured backend coverage is 23% lines / 17% branches — the 60% vitest threshold would hard-fail CI. Blocked on writing tests (P3-3, L-effort), not a config toggle | Wire the coverage gate only once real tests land | low |
| .github/workflows/ci.yml vs prod | ✅ **DONE 2026-07-22** — CI `postgres:18` annotated as the prod-parity pin (keep in sync with the deployed server); prod PG major still needs documenting in ops notes (no repo artifact records it) | Record prod PG major in ops docs | low |
| README.md + CLAUDE.md | README stuck in "Phase 1 COMPLETED" framing, `Node >= 18` prereq, 4/36 routers documented; CLAUDE.md claims `cookie-parser` in the stack — zero refs in backend/src and not in package.json (auth parses the cookie header manually) | Refresh both; drop the cookie-parser claim | none |

## 4. DELETE

| file or function path | evidence it is unused | removal risk |
|---|---|---|
| backend/src/routes/pos.ts:21 + controllers/POSController.ts:42 `scanBarcode` + services/POSService.ts:92 `scanBarcode` | Whole barcode vertical slice: grep of `scanBarcode`/`pos/scan`/`barcode` across frontend/src = zero hits; no UI ever calls it | Low — alternatively wire it into CaisseV2 (product decision); table below goes with it |
| backend/src/db/014_pos_terminal.sql:41 table `barcode_scans` | Zero TS references | Needs manual confirmation — drop requires a migration |
| frontend/src/components/RequirePermission.tsx (`RequireAnyPermission`, `RequireAllPermissions`, `RequireLocationAccess`, `withPermission`) | ✅ **DELETED 2026-07-22** — 4 unused components removed; `RequirePermission` (the one used by DemandesList) kept | — |
| frontend/src/hooks/usePermission.ts (`hasAnyPermission`, `hasAllPermissions`, `canAccessLocation`, `getActionState`) | ✅ **DELETED 2026-07-22** — 4 unused props removed (their only callers were the deleted components); the discarded `_canAccessLocation` destructure in StockTransfers.tsx also cleaned up. `hasPermission`/`userRole`/`userPermissions` kept | — |
| backend/src/validation/schemas.ts `paginationSchema` / `sortQuerySchema` | ✅ **DELETED 2026-07-22** — zero refs; app uses utils/pagination.ts `parsePagination` | — |
| ~~backend/src/validation/schemas.ts:213-214 fournisseur schema aliases~~ | ✅ No longer dead — wired into routes/fournisseurs.ts POST/PUT on 2026-07-22 (the "use instead of delete" option) | — |
| backend/src/validation/phase3-schemas.ts `productImportSchema` | ✅ **DELETED 2026-07-22** — no bulk-import route exists | — |
| backend/src/models/UserModel.ts `findByEmail()` | ✅ **DELETED 2026-07-22** — sole importer (AuthController) never called it | — |
| frontend/src/lib/chartColors.ts `CHART_AXIS_TICK` | ✅ **DELETED 2026-07-22** — zero refs (siblings all used) | — |
| frontend/src/utils/format.ts `fuzzyMatch()` | ✅ **DELETED 2026-07-22** — zero callers (`fuzzyScore` kept) | — |
| backend/src/db/043_unified_tiers.sql:277 table `allocation_audit` | Zero references in backend/src/**/*.ts; no write path exists | Needs manual confirmation — may be intended future FIFO audit trail; wiring it beats dropping it |
| backend/src/db/014_pos_terminal.sql:28 table `pos_cart_items` | Zero TS references; POS quick-sale flow bypasses it | Needs manual confirmation — migration to drop |
| backend/seed-fournisseurs-excel.mjs | Not in any package.json script, ci.yml, or docs (sibling seeders are documented) | Needs manual confirmation — one-off historical importer; keep if source Excel may be re-imported |
| backend/seed-test-data.mjs | Same: no script/CI/doc wiring anywhere | Needs manual confirmation |
| `tiers.solde_client_actuel` / `solde_fournisseur_actuel` columns (read at backend/src/services/TiersService.ts:20,22,53) | Displayed values come from live `calculer_solde_*()` functions instead; cached columns are decorative | Needs manual confirmation — API-visible sort keys; drop requires migration + FE check |
| `tva_taux` line fields (hardcoded 0 at backend/src/controllers/CommandeController.ts:139,141; FactureFournisseurService.ts:168,174) | TVA removed system-wide (027); fields only ever carry 0 | Needs manual confirmation — explicit no-tax policy decision documented in CLAUDE.md; dropping touches document tables |

## 5. UI/UX IMPROVEMENTS

| screen or component | problem | recommended fix | user impact | priority |
|---|---|---|---|---|
| pages/Commandes.tsx, CommandeDetail.tsx, DevisDetail.tsx, FactureDetail.tsx, NouveauBonLivraison.tsx, NouvelAvoir.tsx | ✅ **FIXED 2026-07-22** — all 25 raw `.toFixed(2)} XOF` display sites swapped to `formatCurrency()`. Bonus bug killed in the same pass: NouveauBonLivraison line totals **and** page total multiplied by 1.19 (TVA remnant in a no-TVA system) + stale "(TTC)" label | — | Was: money misread + 19% overstated BL totals | P1 |
| pages/NouvelAvoir.tsx, NouveauBonLivraison.tsx | ✅ **FIXED 2026-07-22** — new `components/DocumentPicker.tsx` (searchable, keyboard nav + combobox ARIA, draft-restore fallback) replaces both raw-id inputs; BL picker filters devis `statut='accepte'` and the card text now says "accepté" (matches BonLivraisonService:307) | — | Was: typo links credit note / BL to wrong doc | P1 |
| pages/Commandes.tsx | ✅ **FIXED 2026-07-22** — server pagination + server sort (Inventaire recipe): `CommandeController.getAll` now returns `{success,data,pagination}` with a count query + allow-listed sort columns; client-side `sortedCommandes` sort removed; `<Pagination>` wired, page resets on filter/sort change | — | Was: full PO set client-sorted, unbounded | P1 |
| pages/GeneralLedger.tsx | ✅ **FIXED 2026-07-22** — écritures tab now pages through the server-paginated endpoint (was capped at 50 with no navigation); `<Pagination>` + page/limit state; CSV export rewired to the dedicated full-export endpoint so it stays complete (with truncation warning). Balance/chart tabs left as-is (bounded by account count) | — | Was: full fiscal year, only first 50 visible | P1 |
| pages/Tiers.tsx, Employes.tsx, AuditLog.tsx, Commandes.tsx | 🟡 **PARTIAL 2026-07-22** — StockValuation fixed (own error branch, see below); these four still toast-and-blank on fetch failure. Route through `QueryState` | Wire QueryState on the 4 remaining pages | P2 |
| components/TiersPicker.tsx | ✅ **FIXED 2026-07-22** — full keyboard nav (Arrow/Enter/Escape, Enter suppressed while open so it can't submit the parent form) + combobox ARIA (`role=combobox`/`listbox`/`option`, `aria-activedescendant`); mirrors the DocumentPicker built in #1. Fixes every sales/purchase form at once | — | — |
| components/GlobalSearch.tsx | ✅ **FIXED 2026-07-22** — Ctrl+K palette now Arrow/Enter navigable (keydown on the input driving `selectedIndex`) + combobox ARIA; also swapped its raw `.toFixed XOF` result subtitle to `formatCurrency` | — | — |
| pages/TiersDetail.tsx | ✅ **FIXED 2026-07-22** — `crmSubmitting` guard on both CRM handlers + `disabled`/label on both submit buttons; double-click no longer duplicates interactions/tasks | — | — |
| pages/DepensesV2.tsx:472-539, StockTransfers.tsx:484-532, Tiers.tsx:322-383, TiersDetail.tsx (25×), CaisseV2.tsx (8 fields) | `<Label>` without `htmlFor`, inputs without `id` — labels visual-only (newer RHF pages do this correctly) | Mechanical `id`/`htmlFor` pass | Screen readers can't associate labels; expense + transfer forms fully unlabeled | P2 |
| pages/DemandeForm.tsx | ✅ **PARTIAL 2026-07-22** — added the beforeunload guard keyed on a non-empty cart (the cart is local state, not RHF, so full useDraft autosave/restore doesn't map cleanly — deferred). Accidental tab-close/reload now warns | Add useDraft autosave for the cart | P3 |
| pages/StockValuation.tsx | ✅ **FIXED 2026-07-22** — added an `error` state + explicit error branch with a Réessayer button; a fetch failure no longer renders header-over-blank behind a fading toast | — | — |
| pages/CaisseV2.tsx (1058 lines) | Zero keyboard shortcuts, zero autoFocus; every cash movement is mouse-through-dialogs | Autofocus amount field, Enter-to-submit, hotkeys for encaissement/décaissement | Slowest page relative to its daily usage frequency | P2 |
| pages/AvoirDetail.tsx:133 + FactureDetail.tsx:356-362 vs DevisDetail.tsx:179 + CommandeDetail.tsx:834/868 | Document dates long-form on facture/avoir, short-form on devis/commande; CommandeDetail shows both formats for the same date on one page | Standardize on one of `formatDate`/`formatDateShort` for document detail pages | Same doc family looks different per module | P2 |
| pages/Commandes.tsx:546-553 | PO line-item price is a raw `<Input type=number>`, not house `MoneyInput` (6 other modules use it) | Swap to `MoneyInput` | No digit grouping while typing big prices | P2 |
| pages/DevisDetail.tsx:211 vs FactureDetail.tsx:419 | Copy-pasted "stock dépôt (historique)" badge missing its `dark:` classes on the Devis copy | Add matching `dark:` pair | Flat badge in dark mode on quotes only | P3 |
| pages/Tiers.tsx:254 vs :193 | Desktop table loading is plain "Chargement..." text while the same page's mobile branch uses `ListSkeleton` | `TableSkeleton` on the desktop branch | Unpolished loading flash on wide screens | P3 |
| pages/Inventaire.tsx:681-748 | Hand-rolled non-sticky bulk toolbar instead of shared `BulkActionBar` (used by Avoirs + DocumentListPage) | Rebuild on `<BulkActionBar>` | Bulk actions behave differently per page | P3 |
| pages/TiersDetail.tsx:198, UserManagement.tsx:361,382, Inventaire.tsx:1054 | Hardcoded `text-gray-500`/`border-gray-300` without `dark:` pair vs semantic tokens elsewhere | Swap to semantic tokens | Contrast drift in dark mode | P3 |
| pages/StockTransfers.tsx, Receptions.tsx, DemandesList.tsx, CaisseAudit.tsx, Comptabilite.tsx, Tresorerie.tsx | No pagination on growing transactional lists (fine at today's volume) | Add pagination while lists are still short | Future scroll/perf pain | P3 |
| Create pages (`text-destructive` span) vs Tiers.tsx/Employes.tsx (plain `"Label *"`) | Two required-field marker conventions | Pick one, apply everywhere | Cosmetic | P3 |
| pages/StockValuation.tsx:76-82 | Custom full-page spinner instead of house `DashboardSkeleton`; on error, body hides silently behind `{valuation && …}` | `DashboardSkeleton` + wrap body in `QueryState` | Blank page after toast fades | P3 |
| pages/Inventaire.tsx:256-296, 986 | Single delete uses a bespoke Dialog, bulk delete uses shared `useConfirm()` — two confirm patterns in one file | Standardize on `useConfirm()` | Internal consistency | P3 |

Systemic notes: money formatting forked (canonical util vs 24 raw sites); error handling forked (QueryState pages vs toast-and-blank pages); a11y is a generation gap (RHF-era pages correct, older dialog forms not); big-list handling uneven (Inventaire fully treated, Commandes/GL untreated). Already verified healthy: zero `window.confirm`, full sonner adoption, DatePicker + chart tokens fully adopted, solid mobile drawer nav, print/PDF affordances present on all detail pages.

## 6. Suggested execution order

1. ✅ **DONE 2026-07-22 — Money-display + doc-linkage fixes (P1 UI):** 25 `.toFixed XOF` sites → `formatCurrency`; `DocumentPicker` replaces raw-id inputs in NouvelAvoir/NouveauBonLivraison; ×1.19 TVA remnant removed from BL totals. Verified: tsc clean, eslint 0 errors, 24/24 FE tests.
2. ✅ **DONE 2026-07-22 — Acompte cluster:** extraction into AcompteService; refund-resurrection trigger bug found and fixed (migration 095 + `montant_rembourse` writes); `recomputeSupplierState` AP repair engine + admin endpoint role param; ci-baseline regenerated. Verified: tsc clean, eslint 0 errors, **289/289 backend tests** incl. new trigger regression + service unit tests.
3. ✅ **DONE 2026-07-22 — Money-path line loops batched:** FactureService.create, ReceptionService.create, DemandeService.execute now use ordered bulk locks + set-based writes (CMP math untouched, per-line `costedStockIn` preserved). Verified: tsc clean, eslint 0 errors, 289/289 backend tests.
4. ✅ **DONE 2026-07-22 — Validation/error seams closed:** 7 new Zod schemas + 8 routes wired (incl. fournisseurs shim with pre-validation shape adaptation); businessError rollout to the last 4 controllers (36 service throws converted, FE error codes preserved); 4 `limit` params clamped. Verified: tsc clean, eslint 0 errors, 289/289 backend tests.
5. ✅ **DONE 2026-07-22 — Pagination for Commandes + GeneralLedger** (server pagination + sort on the commandes endpoint; écritures paging + full CSV export). The six P3 list pages remain opportunistic. Verified: tsc clean, eslint 0 errors, 289/289 BE + 24/24 FE tests.
6. ✅ **DONE 2026-07-22 — Platform floor (mostly):** Node 22 (CI + engines pin, npm-ci sync verified); dependabot.yml; CodeQL workflow; non-blocking npm audit; PG-pin annotation. **Deferred with reason:** @types/node bump (needs `npm install`), coverage gate (BE coverage 23% — needs tests first).
7. ✅ **DONE 2026-07-22 — Quick security/consistency wins:** sw.js `/api` network-only + cache purge; formula-injection escaping at both export sinks (Excel hook + shared CSV `escapeCell`); ecosystem DB_USER fail-hard; timing-equalized login. Verified: tsc clean, eslint 0 errors, 289/289 BE + 24/24 FE tests, ecosystem load/throw checked.
8. ✅ **DONE 2026-07-22 — Dead-code deletion wave:** all verified-unused §4 rows deleted (4 permission components + 4 hook props + StockTransfers discard, paginationSchema/sortQuerySchema, productImportSchema, findByEmail, CHART_AXIS_TICK, fuzzyMatch). Each re-grepped for current usage first (fournisseur schemas revived in #4 were correctly excluded). Verified: tsc clean, eslint 0 errors, 289/289 BE + 24/24 FE tests. **Still decide-first (NOT deleted):** barcode slice (wire into CaisseV2 vs delete), allocation_audit + pos_cart_items tables (wire vs migration-drop), tva_taux fields, cached solde columns, 2 seed scripts.
9. 🟡 **PARTIAL 2026-07-22 — FE resilience + a11y:** DONE — TiersPicker + GlobalSearch keyboard/ARIA (fixes every doc-creation form), TiersDetail double-submit guards, DemandeForm beforeunload guard, StockValuation error branch. Verified: tsc clean, eslint 0 errors, 24/24 FE tests. REMAINING — QueryState on Tiers/Employes/AuditLog/Commandes; the `htmlFor`/`id` mechanical pass on DepensesV2/StockTransfers/Tiers/TiersDetail/CaisseV2; DemandeForm useDraft autosave. These are broad mechanical sweeps, best done as a focused follow-up.
10. 🟡 **STARTED 2026-07-22 — Structural refactors, staged:** DONE — `ProduitController.getPurchaseInfo` 6 sequential queries → parallel `Promise.all` (verified 289/289 BE). REMAINING (each a distinct effort, intentionally NOT done on the current uncommitted pile): controller reads → services (Commande getById/getStats, Demande getAll, Acompte reads); the BL/Devis shared document engine (L, money-path god-services — needs a clean baseline); api.ts CRUD factory + typing; **major-version upgrades (express 5 → vite 7/router 7 → react 19 → tailwind 4) are blocked this session — they need `npm install`, which is disabled here — and must each be a separate, individually-tested effort.**

---
*Analysis-only audit, 2026-07-22. Prior audit content (2026-07-20 refresh) superseded by this report; working-tree copy preserved in session scratchpad. Companion docs: PLAN.md (sprint tracking), CLAUDE.md (conventions — update its cookie-parser claim per §3).*
