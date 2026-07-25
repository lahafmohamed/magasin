# Hitek-CI ERP UX Remediation Plan

**Plan date:** 23 July 2026  
**Source audit:** `UX_USABILITY_AUDIT_2026-07-23.md`  
**Purpose:** Define the work, dependencies, safeguards, tests, and release gates before implementing any fixes.

## Implementation status — 23 July 2026

The current remediation batches are implemented. This does not yet constitute
customer-release approval.

| Work package | Status | Evidence or remaining gate |
|---|---|---|
| WP-0.1 / WP-0.2 | Complete | Repository and read-only UX baseline recorded |
| WP-1.1 / WP-1.2 | Complete | Guarded disposable DB, automatic rebuild, serial integration tests |
| WP-1.3 | Partial | Read-only pattern counts recorded; exact approved record manifest still required |
| WP-1.4 | Not started | No data was changed; backup, provenance and owner approval are mandatory |
| WP-2.1 | Complete | Paginated response contract fixed and purchase orders render |
| WP-2.2 | Complete | Zero sale prices blocked across normal sales flows; no override enabled |
| WP-2.3 | Automated complete; UAT pending | Disposable fixtures cover all supported roles, useful read paths, direct denials, logout revocation and protected-route rejection |
| WP-3.1 | Complete | 24-hour stale-session warning and manager intervention enforced |
| WP-3.2 | Complete | Receivables search, amount/bucket/location filters, totals, paging and filtered export now run server-side |
| WP-3.3 | Not started | Requires approved data classification and KPI definitions |
| WP-3.4 | Complete | Ledger account/piece/description filters, inclusive dates, coherent source links and filtered CSV/PDF exports added |
| WP-4.1 | Complete | Responsive inventory cards and touch-sized actions added |
| WP-4.2 | Complete for audited paths | No-TVA terminology sweep and main French glossary applied |
| WP-4.3 / WP-4.4 / WP-4.5 | Partial | Critical sales/contact/payment validation, accessible/stable charts, search/dialog behavior and destructive contact actions fixed; broader sweep remains |
| WP-5.1 | Complete for this batch | Backend 321/321 and frontend 49/49; builds and lint pass |
| WP-5.2 / WP-5.3 | Not started | Business-owner UAT, backup/rollback and release approval required |

## 1. Objective

Raise the ERP from the audited customer-readiness score of **4/10** to a release-ready state by restoring:

1. Data trust
2. Core workflow reliability
3. Financial and cash-control safety
4. Mobile usability
5. French-language consistency
6. Accessibility and predictable validation

The target is not a cosmetic redesign. The target is a dependable ERP that staff can use confidently for:

- Order-to-cash: customer → quote/delivery/invoice → payment
- Procure-to-pay: supplier → order → reception → invoice → payment
- Inventory: search → stock review → transfer/replenishment
- Record-to-report: operational postings → ledger → management reports
- Daily cash operations: open → movements → reconciliation → close

## 2. Planning assumptions

The estimates below use **engineer-days**, not calendar dates.

Recommended delivery team:

- 1 backend/full-stack engineer
- 1 frontend/full-stack engineer
- 1 business owner or senior ERP user for short validation sessions
- Optional QA support during release-candidate testing

Expected effort:

- **26–39 engineer-days**
- Approximately **3–4 calendar weeks with two engineers**
- Approximately **6–8 calendar weeks with one engineer**

These estimates exclude:

- Manual correction of unidentified historical business data
- A complete visual redesign
- New ERP modules
- Changes to the no-TVA business policy
- Infrastructure/deployment work not currently defined in the repository

## 3. Mandatory safety rules

These rules apply to every remediation work package.

### 3.1 Protect existing work

The repository currently contains many pre-existing modified and untracked files. Before implementation:

1. Inventory all existing changes.
2. Confirm which changes belong to the current hardening effort.
3. Commit, stash, or otherwise isolate them under the owner’s direction.
4. Do not begin broad UX edits in a mixed worktree.
5. Use `codex/`-prefixed branches unless another branch convention is requested.

### 3.2 Protect business data

- No cleanup, deletion, merge, or rewrite of business data without:
  - A verified backup
  - A dry-run report
  - Exact affected-record counts and identifiers
  - Business-owner approval
  - A rollback procedure
- Prefer quarantine/archive over permanent deletion when record provenance is uncertain.
- Do not identify disposable records by name pattern alone.
- Never run integration tests against development, staging with customer data, or production.

### 3.3 Preserve ERP invariants

- TVA remains removed.
- XOF remains the only currency.
- Financial writes continue to respect period locking.
- Stock and financial multi-step writes remain transactional.
- Existing database triggers remain part of the validation scope.
- New schema changes use the next free numbered migration after reconciling the current untracked `095_acompte_refund_tracking.sql`.
- After a schema change, regenerate `backend/src/db/ci-baseline.sql`.

### 3.4 Keep changes reviewable

- One business outcome per pull request where practical.
- Every bug fix includes a regression test.
- Avoid combining data cleanup, API-contract changes, and visual redesign in one pull request.
- Update `AGENTS.md` and `AUDIT.md` when a documented known issue is actually resolved.

## 4. Decisions to record before implementation

The plan can proceed using the recommended defaults below, but each decision must be recorded before its dependent work is merged.

| Decision | Recommended default | Required before |
|---|---|---|
| Is the current database disposable development data or mixed with real business data? | Treat it as mixed/valuable until proven otherwise | Any cleanup |
| Test-record disposition | Quarantine first; delete only records with verified test provenance | Data remediation |
| Zero-price policy | Block normal sales; permit only an audited manager override if the business explicitly needs it | Pricing safeguards |
| Cash-session cutoff | One business day; warn at cutoff and require manager approval after 24 hours | Cash controls |
| Supported mobile width | Minimum 390 px portrait | Responsive acceptance |
| Supported operational roles | Admin, manager, cashier, salesperson/store staff, purchasing/warehouse | Role acceptance |
| Dashboard KPI scope | Document date range, locations, included statuses, and refresh time per KPI | KPI reconciliation |
| Customer-facing currency label | Use `FCFA` consistently | Language cleanup |

## 5. Delivery strategy

Work is divided into six phases. A phase may contain parallel work, but its release gate must pass before dependent phases are accepted.

```text
Phase 0: Baseline and safety
       ↓
Phase 1: Test isolation and data remediation
       ↓
Phase 2: Core P0 workflows
       ↓
Phase 3: Financial trust and daily operations
       ↓
Phase 4: Mobile, language, validation, accessibility
       ↓
Phase 5: UAT, release, and monitoring
```

Dashboard/report reconciliation depends on clean data. It must not be declared complete before Phase 1.

## 6. Phase 0 — Baseline and implementation safety

**Estimated effort:** 1–2 engineer-days  
**Release gate:** G0

### WP-0.1 — Repository change inventory

**Outcome**

A safe starting point that does not overwrite or misattribute the existing hardening changes.

**Tasks**

1. Capture `git status`, current branch, and relevant diffs.
2. Group modified files by feature/workstream.
3. Identify ownership of the current untracked migration `095_acompte_refund_tracking.sql`.
4. Determine the next free migration number before any new database work.
5. Record the known baseline build/test state.

**Acceptance**

- Existing work is committed, intentionally preserved, or isolated.
- No UX remediation file overlaps unresolved user changes without review.

### WP-0.2 — Reproducible UX baseline

**Outcome**

A repeatable set of flows and measurable defects.

**Tasks**

1. Convert the audit flows into a manual smoke checklist.
2. Record baseline metrics:
   - Test-like store count
   - Test-like contact count
   - Test-like invoice count
   - Zero-price product count
   - Purchase-order API total vs rendered rows
   - Cash sessions open longer than 24 hours
   - Mobile horizontal overflow at 390 px
   - Accessibility console errors in global search/dialogs
3. Save representative test fixtures in the dedicated test environment, not the business database.

**Acceptance**

- Every P0/P1 defect has a reproducible test or documented query.
- Baseline metrics are stored in the remediation ticket/PR description.

### Gate G0 — Ready to implement

All conditions must pass:

- Current repository changes are isolated.
- Database classification is recorded.
- No cleanup has occurred.
- Baseline defects are reproducible.

## 7. Phase 1 — Test isolation and data remediation

**Estimated effort:** 5–8 engineer-days  
**Release gate:** G1  
**Blocks:** Dashboard validation, reporting validation, customer acceptance

### WP-1.1 — Hard test-database guard

**Priority:** P0  
**Estimated effort:** 1–2 days

**Outcome**

Integration tests cannot start against a non-test database.

**Tasks**

1. Add a shared integration-test bootstrap guard.
2. Require:
   - `NODE_ENV=test`
   - An explicitly allowed database name such as `*_test` or CI’s `magasin_ci`
3. Abort the suite before the first write when the guard fails.
4. Remove duplicated per-suite connection assumptions.
5. Document safe local test setup.

**Tests**

- Guard accepts the disposable CI database.
- Guard accepts a local database with the approved test suffix.
- Guard rejects the current development database.
- Guard rejects empty or ambiguous database configuration.

**Definition of done**

- `npm test` cannot insert records into the development database.
- CI continues using its PostgreSQL service database.

### WP-1.2 — Reliable test cleanup

**Priority:** P0  
**Estimated effort:** 2–3 days  
**Depends on:** WP-1.1

**Outcome**

Integration tests leave the test database in a known state and do not hide cleanup failures.

**Tasks**

1. Inventory all tests that insert into:
   - `tiers`
   - `produits`
   - `factures`
   - `magasins`
   - `sessions_caisse`
   - payments/advances
   - accounting entries
2. Replace silent `catch {}` cleanup with explicit failures or controlled transaction rollback.
3. Use one of:
   - Transaction-per-test rollback
   - Schema/database recreation
   - FK-safe central cleanup
4. Add a post-suite leak assertion for known test prefixes/markers.
5. Ensure parallel tests cannot collide.

**Tests**

- Running the full suite twice produces the same final test-database counts.
- A deliberately broken cleanup causes the suite to fail.
- No test-generated rows remain after the suite.

### WP-1.3 — Data provenance report

**Priority:** P0  
**Estimated effort:** 1–2 days  
**Depends on:** WP-1.1

**Outcome**

A reviewed manifest distinguishes verified test data from uncertain or real business data.

**Tasks**

1. Build a read-only report using:
   - Known test prefixes
   - Creation timestamps
   - Test-user creator IDs
   - References to known test documents
   - Related cash/accounting/stock records
2. Group candidates by deletion dependency order.
3. Flag ambiguous records for manual business review.
4. Export exact IDs and counts.
5. Reconcile document totals before any cleanup.

**Important**

This work package produces a report only. It does not delete data.

### WP-1.4 — Controlled data cleanup

**Priority:** P0  
**Estimated effort:** 1–3 days  
**Depends on:** WP-1.3 and explicit business-owner approval

**Outcome**

Verified test records no longer appear in operational workflows or reports.

**Tasks**

1. Create a verified backup and record restore steps.
2. Run cleanup in dry-run mode.
3. Compare dry-run counts with the approved manifest.
4. Quarantine ambiguous records.
5. Delete or archive only verified test records in a transaction.
6. Recompute/reconcile affected derived balances and reports where necessary.
7. Verify stock, client balances, supplier balances, cash, and GL integrity.

**Rollback**

- Roll back the transaction if any expected count differs.
- Restore the backup if post-cleanup reconciliation fails.

**Acceptance**

- No verified test records appear in customer-facing screens.
- Sales, stock, AP, AR, cash, and GL reconciliations pass.
- Real business records are unchanged.

### Gate G1 — Data-safe environment

All conditions must pass:

- Test guard is enforced.
- Full test suite leaves no leaked records.
- Data cleanup was either completed from an approved manifest or explicitly deferred because the database is disposable.
- Customer-facing data contains no verified test records.

## 8. Phase 2 — Core P0 workflows

**Estimated effort:** 5–8 engineer-days  
**Release gate:** G2

Purchase-order and pricing fixes can run in parallel after Phase 0. Data-facing acceptance must use the Phase 1 clean environment.

### WP-2.1 — Standard paginated API contract

**Priority:** P0  
**Estimated effort:** 1–2 days

**Outcome**

Purchase orders and all paginated lists use a consistent typed response contract.

**Tasks**

1. Define a shared frontend `Page<T>` type.
2. Stop attaching `pagination` properties to arrays.
3. Decide whether:
   - The interceptor preserves `{ data, pagination }`, or
   - Paginated services explicitly reconstruct `Page<T>`
4. Fix `commandeService.getAll`.
5. Fix `Commandes.tsx` to use the contract consistently.
6. Audit other service methods for the same envelope mismatch.
7. Ensure KPI cards are sourced from complete statistics, not only the current page.

**Tests**

- API service test for envelope conversion.
- Page test: nine API rows produce nine visible rows/cards.
- Empty state appears only when total is zero.
- Search/filter changes reset to page 1.
- Pagination count and rendered count remain coherent.

**Acceptance**

- Existing purchase orders are visible.
- Staff can open an order and continue to reception.
- Counts never contradict the visible empty state.

### WP-2.2 — Zero-price sales safeguard

**Priority:** P0  
**Estimated effort:** 3–4 days  
**Decision required:** Zero-price override policy

**Outcome**

No accidental zero-price sale can be created through invoice, quote, delivery, or POS flows.

**Tasks**

1. Add a backend business rule for sales lines:
   - Reject `prix_unitaire <= 0`, or
   - Require an explicit audited manager override
2. Apply the same rule to:
   - Direct invoices
   - Quotes
   - Delivery notes
   - POS
   - Quote-to-delivery/invoice conversions
3. In product search:
   - Show `Prix non renseigné`
   - Disable normal selection
   - Explain how to correct the product
4. Add an inventory data-quality filter for missing sale price.
5. Produce a remediation list for the current 1,022 zero-price products.
6. Add a database constraint only after the business policy and legacy data are reconciled.

**Tests**

- Every sales entry path rejects an unauthorized zero-price line.
- Authorized override, if enabled, records user, timestamp, reason, and original price.
- Conversion workflows cannot bypass the rule.
- Search results visually distinguish missing prices from valid `0` values.

**Acceptance**

- A normal salesperson cannot create or confirm a zero-value sales line.
- Valid positive-price sales continue to work.

### WP-2.3 — Role and login smoke path

**Priority:** P0  
**Estimated effort:** 1–2 days

**Outcome**

Every advertised operational role can sign in and sees an appropriate landing experience.

**Tasks**

1. Remove hard-coded demo credentials or seed them reliably in an explicitly identified demo environment.
2. Define the supported role smoke matrix.
3. Verify server-side authorization, not just menu visibility.
4. Test the first useful task per role:
   - Admin: administration/dashboard
   - Manager: reporting/approvals
   - Cashier: cash register
   - Sales/store staff: invoice or delivery
   - Purchasing/warehouse: order/reception/inventory
5. Investigate logout form restoration/back-cache behavior.
6. Ensure browser Back cannot restore an authenticated page after logout.

**Tests**

- Automated authentication test per supported role.
- Unauthorized direct route access returns the correct denial.
- Logout invalidates the session and protected routes.
- Production build never displays demo passwords.

### Gate G2 — Core workflows safe

All conditions must pass:

- Purchase orders render and can proceed to reception.
- Zero-price rules protect every sales path.
- Required roles can log in and reach their core task.
- Logout/session behavior passes shared-terminal testing.
- No P0 issue remains open.

## 9. Phase 3 — Financial trust and daily operations

**Estimated effort:** 7–11 engineer-days  
**Release gate:** G3  
**Depends on:** G1 for data-based validation

### WP-3.1 — Cash-session age control

**Priority:** P1  
**Estimated effort:** 2–3 days

**Outcome**

Old cash sessions are visible, controlled, and cannot be continued silently.

**Tasks**

1. Add a configurable business-day/session cutoff.
2. Display session age beside `Caisse ouverte`.
3. Warn at the cutoff and escalate after 24 hours.
4. Require manager confirmation to continue a stale session.
5. Offer a guided close/reopen flow.
6. Translate payment-method codes through one formatter.
7. Add stale-session reporting to cash audit.

**Tests**

- Same-day session is normal.
- Session crossing cutoff warns.
- Session over 24 hours requires manager authorization.
- Close/reopen preserves balances and GL posting.
- Closed-period rules remain enforced.

### WP-3.2 — Reporting pagination and decision filters

**Priority:** P1  
**Estimated effort:** 3–4 days

**Outcome**

Aging and management reports remain usable with production-sized data.

**Tasks**

1. Move receivable aging to server-side pagination.
2. Add:
   - Customer search
   - Aging bucket
   - Minimum outstanding amount
   - Location where relevant
   - Top-N/default priority view
3. Add filtered CSV/Excel export.
4. Use cards or a reduced summary on mobile.
5. Add loading, empty, and error states.
6. Verify queries have supporting indexes.

**Tests**

- Large aging dataset renders a bounded page.
- Export matches active filters.
- Totals remain equal to the complete filtered result, not only the visible page.
- Mobile has no page-level horizontal overflow.

### WP-3.3 — Dashboard and KPI reconciliation

**Priority:** P1  
**Estimated effort:** 2–4 days  
**Depends on:** Clean data and documented KPI definitions

**Outcome**

Every customer-facing metric has a documented, reconcilable meaning.

**Tasks**

1. Define each KPI:
   - Date range
   - Included document statuses
   - Location scope
   - Currency
   - Refresh time
2. Reconcile dashboard totals with reporting and direct SQL.
3. Fix duplicate Top Products.
4. Translate raw statuses.
5. Use consistent French number formatting.
6. Hide or qualify low-confidence forecasts.
7. Reduce the default dashboard by role.
8. Explain why similar stock-alert metrics differ, or unify them.

**Tests**

- Known fixture data produces exact KPI totals.
- Top-N lists contain unique entities unless duplicates are explicitly meaningful.
- Dashboard and report totals reconcile under identical filters.
- Forecast is hidden or labelled when confidence is insufficient.

### WP-3.4 — Ledger findability

**Priority:** P2  
**Estimated effort:** 1–2 days

**Outcome**

Accountants can find an entry without paging through thousands of rows.

**Tasks**

1. Add account, piece number, and description filters.
2. Label currency at page or column level.
3. Link entries to source documents where safe and available.
4. Preserve pagination and date/journal filters.

**Tests**

- Filters combine correctly.
- Links open the correct source document.
- Debit/credit totals and balance are unchanged.

### Gate G3 — Financially credible

All conditions must pass:

- No stale cash session can continue silently.
- Aging/report pages remain bounded and responsive.
- KPI definitions are documented and reconciled.
- Ledger filters return correct results.
- Finance/business owner signs off on representative reports.

## 10. Phase 4 — Mobile, language, validation, and accessibility

**Estimated effort:** 7–10 engineer-days  
**Release gate:** G4

The work packages in this phase can proceed in parallel once shared components and terminology are agreed.

### WP-4.1 — Mobile inventory redesign

**Priority:** P1  
**Estimated effort:** 3–4 days

**Outcome**

Inventory is usable at 390 px without overlapping text or dangerous mis-taps.

**Tasks**

1. Keep the desktop table for appropriate widths.
2. Render mobile product cards below the agreed breakpoint.
3. Show:
   - Name
   - Reference
   - Stock and alert
   - Sale price or `Prix non renseigné`
   - Location
4. Move row actions into a 44 × 44 overflow control.
5. Remove nested vertical scrolling on mobile.
6. Preserve search, low-stock filter, location filter, and export.

**Tests**

- 390 × 844
- 768 × 1024
- 1280 × 720
- Long product names
- Zero price/missing category/rupture cases
- Keyboard access at desktop size

### WP-4.2 — French glossary and no-TVA sweep

**Priority:** P1/P2  
**Estimated effort:** 1–2 days

**Outcome**

The application uses consistent business French and no longer suggests TVA processing.

**Tasks**

1. Approve a glossary for:
   - Stock location
   - Valuation
   - Supplier invoice
   - Payment methods
   - Document statuses
2. Replace missing accents and English terms.
3. Replace `Close` with `Fermer`.
4. Remove `TVA`, `HT`, and `TTC` from UI and documents.
5. Replace `Total TTC` with `Total`.
6. Standardize `FCFA`.
7. Add regression searches/tests for forbidden terms.

**Acceptance**

- User-visible text search returns no forbidden tax terminology.
- All statuses and methods use friendly French labels.

### WP-4.3 — Unified form validation

**Priority:** P2  
**Estimated effort:** 2–3 days

**Outcome**

Forms explain problems clearly in French and direct the user to the field that needs attention.

**Tasks**

1. Standardize on Zod + react-hook-form for key workflows.
2. Replace native English validation bubbles.
3. Add inline errors and `aria-describedby`.
4. Focus the first invalid field.
5. Use plain-language messages, for example:
   - `Saisissez un montant supérieur à 0 FCFA`
6. Cover:
   - Contact
   - Invoice/quote/delivery
   - Purchase order
   - Cash movement
   - Product

**Tests**

- Empty submission
- Invalid numeric values
- Invalid email/phone formats where enforced
- Server rejection after client validation
- Keyboard-only correction flow

### WP-4.4 — Dialog and search accessibility

**Priority:** P2  
**Estimated effort:** 1–2 days

**Outcome**

Major dialogs have accessible names/descriptions and no Radix accessibility warnings.

**Tasks**

1. Add `DialogTitle` and descriptions to global search and other affected dialogs.
2. Translate hidden close labels.
3. Verify focus trap, Escape, and focus restoration.
4. Use friendly result-type names in global search.
5. Add text summaries or alternatives for important charts.
6. Audit icon-only buttons for accessible names.

**Tests**

- No missing-title/description console warnings.
- Global search works with keyboard only.
- Focus returns to the invoking control.
- Screen-reader names are French and meaningful.

### WP-4.5 — Scrolling and destructive-action cleanup

**Priority:** P2  
**Estimated effort:** 1–2 days

**Outcome**

Users have one predictable main scroll area, and destructive actions are harder to trigger accidentally.

**Tasks**

1. Remove unnecessary fixed-height/nested vertical scroll containers.
2. Keep horizontal table scrolling only where essential.
3. Move delete actions into overflow menus.
4. Separate view/edit from destructive actions.
5. Keep dependency-aware confirmations.
6. Rename invoice line empty state to `Aucun article ajouté à la facture`.

### Gate G4 — Usable and consistent

All conditions must pass:

- Mobile inventory is usable at 390 px.
- No page-level horizontal overflow on tested mobile flows.
- User-visible language is consistently French.
- No TVA/TTC wording remains.
- Key forms provide French inline validation.
- Major dialogs pass keyboard and accessible-name checks.
- Destructive actions do not overlap or dominate row content.

## 11. Phase 5 — Regression, UAT, and controlled release

**Estimated effort:** 3–5 engineer-days  
**Release gate:** G5

### WP-5.1 — Automated regression suite

**Estimated effort:** 2–3 days

**Backend gates**

```bash
cd backend
npx tsc --noEmit
npm run lint
npm test
npm run build
```

**Frontend gates**

```bash
cd frontend
npx tsc -b
npm run lint
npm test
npm run build
```

**Required new regression coverage**

- Test database guard
- Purchase-order pagination contract
- Zero-price rejection on every sales path
- Role login/authorization
- Cash-session cutoff
- Reporting pagination/filter totals
- Dashboard KPI fixtures
- Mobile inventory component behavior
- French validation and global-search accessibility

### WP-5.2 — Business-process UAT

**Estimated effort:** 1–2 days

Use a clean staging database with representative, non-sensitive data.

#### Order-to-cash

1. Create/select a customer.
2. Create a quote or delivery/invoice.
3. Verify price, stock, credit check, and totals.
4. Record partial/full payment.
5. Verify client balance and accounting entries.

#### Procure-to-pay

1. Create a purchase order.
2. Receive part/all of the order.
3. Create supplier invoice.
4. Verify 3-way match.
5. Record payment/advance.
6. Verify supplier balance and accounting entries.

#### Inventory

1. Search product on desktop and mobile.
2. Review stock per location.
3. Transfer/replenish stock.
4. Verify resulting quantities and valuation.

#### Cash

1. Open session.
2. Record representative movements.
3. Reconcile theoretical vs counted balance.
4. Close session.
5. Verify GL posting and historical view.

#### Record-to-report

1. Reconcile dashboard totals.
2. Review aging and filters.
3. Locate ledger entries.
4. Export representative reports.

### WP-5.3 — Release and monitoring

**Estimated effort:** 1 day

**Tasks**

1. Create a release candidate.
2. Verify database migration status and backup.
3. Deploy during a controlled window.
4. Run smoke tests after deployment.
5. Monitor:
   - 4xx/5xx rates
   - Login failures by role
   - Purchase-order empty-state contradictions
   - Zero-price rejection events
   - Stale cash sessions
   - Report response time
   - Frontend console errors
6. Keep rollback artifacts ready.

### Gate G5 — Customer release

All conditions must pass:

- G0–G4 passed.
- Backend and frontend CI gates pass.
- Business owner approves UAT.
- Backup and rollback are verified.
- No P0 or P1 issue remains open.
- Release notes and user guidance are ready.

## 12. Pull-request sequence

Recommended merge order:

1. **PR 1 — Test database guard**
2. **PR 2 — Test cleanup reliability**
3. **PR 3 — Paginated API contract and purchase-order rendering**
4. **PR 4 — Zero-price backend safeguards**
5. **PR 5 — Zero-price frontend/master-data UX**
6. **PR 6 — Role/demo/login/logout hardening**
7. **PR 7 — Approved data cleanup tooling and reconciliation**
8. **PR 8 — Cash-session age controls**
9. **PR 9 — Reporting pagination and filters**
10. **PR 10 — Dashboard KPI reconciliation**
11. **PR 11 — Mobile inventory**
12. **PR 12 — French/no-TVA/validation/accessibility polish**
13. **PR 13 — Final regression/UAT fixes and documentation**

PRs 3, 4, and 6 can be developed in parallel after G0. PR 7 must wait for the approved data manifest. Reporting and dashboard acceptance must wait for clean data.

## 13. Tracking matrix

| Work package | Priority | Estimate | Depends on | Gate |
|---|---:|---:|---|---|
| WP-0.1 Repository inventory | Safety | 0.5–1 d | None | G0 |
| WP-0.2 UX baseline | Safety | 0.5–1 d | None | G0 |
| WP-1.1 Test DB guard | P0 | 1–2 d | G0 | G1 |
| WP-1.2 Test cleanup | P0 | 2–3 d | WP-1.1 | G1 |
| WP-1.3 Provenance report | P0 | 1–2 d | WP-1.1 | G1 |
| WP-1.4 Controlled cleanup | P0 | 1–3 d | Approval | G1 |
| WP-2.1 Purchase-order/API contract | P0 | 1–2 d | G0 | G2 |
| WP-2.2 Zero-price safeguard | P0 | 3–4 d | Policy decision | G2 |
| WP-2.3 Roles/login/logout | P0 | 1–2 d | Role matrix | G2 |
| WP-3.1 Cash-session control | P1 | 2–3 d | Cutoff decision | G3 |
| WP-3.2 Reporting scale | P1 | 3–4 d | G1 | G3 |
| WP-3.3 KPI reconciliation | P1 | 2–4 d | G1, KPI definitions | G3 |
| WP-3.4 Ledger findability | P2 | 1–2 d | None | G3 |
| WP-4.1 Mobile inventory | P1 | 3–4 d | Price display rule | G4 |
| WP-4.2 French/no-TVA | P1/P2 | 1–2 d | Glossary | G4 |
| WP-4.3 Form validation | P2 | 2–3 d | Shared conventions | G4 |
| WP-4.4 Accessibility | P2 | 1–2 d | Shared dialog changes | G4 |
| WP-4.5 Scroll/actions | P2 | 1–2 d | WP-4.1 where overlapping | G4 |
| WP-5.1 Regression | Release | 2–3 d | All fixes | G5 |
| WP-5.2 UAT | Release | 1–2 d | G4 | G5 |
| WP-5.3 Release | Release | 1 d | UAT | G5 |

## 14. Success metrics

The remediation is successful when:

| Metric | Baseline | Target |
|---|---:|---:|
| Verified test stores in customer-facing data | 35 | 0 |
| Obvious test contacts in operational data | 1,517 | 0 verified test records |
| Obvious test invoices in operational data | 2,912 | 0 verified test records |
| Zero-price products offered for normal sale | 1,022 products affected | 0 |
| Purchase-order total vs visible rows | 9 vs 0 | Counts agree |
| Supported non-admin role logins | Advertised roles unavailable | 100% smoke pass |
| Cash sessions silently open >24h | 1 | 0 |
| Mobile inventory overlap at 390 px | Present | None |
| Page-level horizontal overflow on tested mobile flows | Present | 0 |
| Global-search dialog accessibility errors | Present | 0 |
| Forbidden TVA/TTC UI terminology | Present | 0 |
| Open P0/P1 audit findings at release | 10 | 0 |

## 15. Stop conditions

Pause implementation and escalate if:

- The current database is confirmed to contain mixed real and test records without reliable provenance.
- A cleanup dry run affects more or different records than the approved manifest.
- Stock, client, supplier, cash, or GL reconciliation changes unexpectedly.
- The zero-price business policy is unresolved.
- A schema change conflicts with the current untracked migration sequence.
- Existing user changes overlap a remediation file and cannot be safely isolated.
- UAT reveals a period-lock, balance, stock, or authorization regression.

## 16. Definition of customer-ready

The ERP is ready for customer sign-off only when:

1. Operational data is free of verified test contamination.
2. Purchase, sales, stock, cash, and reporting flows agree with their visible counts and totals.
3. Financially dangerous defaults are blocked.
4. Required roles can complete their main task.
5. Mobile inventory and core forms are usable at 390 px.
6. The UI is consistently French and aligned with the no-TVA policy.
7. Key dialogs and forms are keyboard- and screen-reader-friendly.
8. Automated tests, CI, UAT, backup, and rollback gates pass.

No feature expansion should take priority over these conditions.
