# Hitek ERP Remediation Baseline

Date: 2026-07-23

This baseline records the starting state for the usability remediation. It does
not authorize data deletion and does not classify any existing record as safe
to remove.

## Repository baseline

- Branch: `main`
- Starting commit: `6c906bf`
- Existing workspace: 138 tracked files changed, plus untracked hardening files
- Existing database migration in progress: `095_acompte_refund_tracking.sql`
- Next migration number: unresolved until migration 095 ownership is reconciled
- Overlap requiring narrow edits:
  - `frontend/src/services/api.ts`
  - `frontend/src/pages/Commandes.tsx`
  - backend validation and sales services

All pre-existing changes are treated as user-owned work.

## Database classification

- Configured database: `pbdsarl`
- Recorded classification: mixed/valuable until the business owner proves
  otherwise
- Automated tests: prohibited against this database
- Cleanup status: deferred
- Required before cleanup: backup, read-only provenance manifest, exact counts,
  business approval, dry run, transactional rollback, and financial/stock
  reconciliation

## Reproduced usability metrics

| Metric | Baseline |
|---|---:|
| Stores with obvious test-like names | 35 / 36 |
| Contacts with obvious test-like names | 1,517 / 2,187 |
| Invoices with obvious test-like identifiers | 2,912 / 3,039 |
| Products with zero sale price | 1,022 / 4,046 |
| Purchase orders reported by pagination | 9 |
| Purchase orders rendered in the list | 0 |
| Open cash-session age | More than two months |
| Supported mobile acceptance width | 390 px portrait |

These counts are evidence for investigation, not deletion criteria.

## Baseline verification

- Backend build: passed
- Backend lint: passed with 823 existing warnings and no errors
- Backend integration tests: intentionally not run against `DB_NAME=pbdsarl`
- Frontend lint: passed with 521 existing warnings and no errors
- Frontend build: the first command exceeded its 120-second limit
- Frontend tests: pending at the time of the baseline

## Remediation verification

The implementation was verified against the protected baseline as follows:

- A disposable `hitek_local_test` database was created for integration tests.
- The Vitest global setup rejects a non-test database name before importing the
  application or changing the database.
- Test files run serially because the integration suites share database state.
- The disposable database is rebuilt before and after each test run.
- A post-run count check confirmed zero business rows in the guarded tables.
- Backend full suite: 30 files, 321 tests passed.
- Backend build: passed.
- Backend lint: passed with 821 warnings and no errors.
- Frontend full suite: 13 files, 49 tests passed.
- Frontend TypeScript build: passed.
- Frontend production build: passed.
- Frontend lint: passed with 513 warnings and no errors.
- Read-only browser acceptance: dashboard, contacts, receivables and ledger
  passed with no console warning or error after the final fixes.
- Direct backend and Vite-proxied health checks both return HTTP 200 with
  database status `ok`.
- No business record was created, edited, deleted, or reclassified.

The production build still reports a large vendor bundle warning. Coverage,
business-owner role UAT, and customer-data cleanup remain release work.

## Decisions in force

- Quarantine ambiguous data; never delete by display name alone.
- Block normal sales with a zero unit price.
- A manager override is not enabled until the business explicitly requires it.
- Warn about cash sessions at one business day; manager intervention is
  required after 24 hours.
- Use `FCFA` consistently in customer-facing screens.
- Preserve the system-wide no-TVA policy.

## Phase 0 gate

G0 is complete:

- the test-database guard is verified;
- frontend and backend builds and tests are recorded;
- implemented P0 fixes have regression coverage or a reproducible browser
  check;
- no operational cleanup occurred.
