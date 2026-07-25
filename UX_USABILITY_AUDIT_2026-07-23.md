# Hitek-CI ERP User Experience & Customer Happiness Audit

**Audit date:** 23 July 2026  
**Environment tested:** Local development application at `http://localhost:6001`  
**Desktop viewport:** 1280 × 720  
**Mobile viewport:** 390 × 844  
**Primary role tested:** Administrator  
**Other roles attempted:** Manager and cashier; the credentials advertised by the login screen do not correspond to existing database users.

## Executive summary

The ERP has a modern visual foundation and broad functional coverage, but it is **not ready for a customer-facing rollout in its current environment**.

**Overall customer-readiness score: 4/10**

The largest problem is not the visual design. It is trust. Test records have heavily polluted operational data, some live workflows show contradictory states, and a large portion of the product catalog has a zero sale price. A customer seeing these screens would reasonably doubt whether invoices, stock, cash, and reports can be trusted.

Four issues should block customer rollout:

1. Integration-test data is mixed with operational data and dominates invoices, contacts, stores, and reports.
2. The purchase-order list says there are no orders even though the same screen reports nine results.
3. 1,022 of 4,046 products have a sale price of zero, and the invoice search offers them at `0 FCFA`.
4. The non-admin demonstration accounts shown on the login page do not exist.

The strongest parts are the visual hierarchy, searchable lists, useful global search, invoice draft recovery, clear status colors, French date formatting, and the breadth of the sales/purchasing/finance workflows.

## Scope and method

The application was used through its real browser UI, not assessed only from source code. The following user journeys were exercised:

- Login, logout, and attempted role switching
- Dashboard review and period controls
- Invoice list, filters, search, and invoice creation
- Global search
- Inventory search and product actions
- Contact list and new-contact validation
- Supplier purchase-order list and creation
- Cash-register selection, session review, and manual-movement validation
- General ledger and business reporting
- Mobile navigation, reporting, inventory, and invoice creation

No invoice, purchase order, contact, product, cash movement, payment, or other business record was created, modified, or deleted during this audit. Form validation was tested without completing a mutation.

This is a usability and customer-confidence audit. It is not a full accounting-correctness, security penetration, or performance-load audit.

## Scorecard

| Area | Score | Assessment |
|---|---:|---|
| Visual design | 7/10 | Modern cards, spacing, status colors, and generally consistent controls |
| Navigation | 6/10 | Clear grouping and global search, but the menu is long and terminology is inconsistent |
| Learnability | 6/10 | Main actions are visible, but financial and inventory terminology is sometimes technical |
| Task completion | 4/10 | Invoice creation is understandable; purchase-order listing is currently broken |
| Data trust | 1/10 | Test data, zero prices, contradictory counts, and unrealistic metrics undermine confidence |
| Error prevention | 4/10 | Disabled submit buttons and confirmations help, but validation feedback is inconsistent |
| Mobile usability | 4/10 | Navigation and invoice form are usable; inventory and reports are not |
| Accessibility | 5/10 | Many controls are labelled, but dialogs and chart/report experiences need work |
| French consistency | 4/10 | Many correct strings, but English terms, missing accents, raw statuses, and an English browser error remain |
| Customer readiness | 3/10 | Core foundation exists, but P0/P1 issues must be resolved before rollout |

## Release blockers

### P0-1 — Test data is contaminating operational data

**Observed**

- 35 of 36 stores are obvious `TST-*` / “Caisse Test Magasin” records.
- 1,517 of 2,187 contacts have an obvious test/debug/API name.
- 2,912 of 3,039 invoices belong to obvious test/debug/API contacts.
- Customer-facing lists contain names such as `API Test Fourn`, `Reporting Client Test`, `Paiement Test`, `PDF Test Client`, and `DebugDouble`.
- The cash-register selector contains a long list of test stores.
- Reports and dashboard rankings contain repeated test products and test customers.

**Customer impact**

- Management reports and KPIs are not credible.
- Staff can select a test customer or store by mistake.
- Search results are noisy and slow to scan.
- Customers will perceive the product as unfinished or unsafe.
- It becomes impossible to distinguish a software defect from bad test data.

**Likely implementation cause**

- Integration tests insert data into the development database.
- Some cleanup is best-effort and silently swallows cleanup failures.
- Some integration suites create records without complete cleanup.

Examples:

- `backend/src/controllers/CaisseMagasinController.test.ts:20-45`
- `backend/src/controllers/PaiementController.test.ts:125-159`
- `backend/src/controllers/AcompteFournisseurController.test.ts`

**Fix**

1. Never run integration tests against a development or customer database.
2. Enforce a dedicated test database in test bootstrap. Refuse to start if the database name does not end in `_test` or another explicit allow-list suffix.
3. Replace silent cleanup failures with test failures.
4. Prefer transaction rollback, schema recreation, or containerized disposable databases.
5. Back up the current database and produce a reviewed cleanup plan based on record provenance. Do not delete by name pattern alone.
6. Add a database/environment banner in development and test environments so users know when data is non-production.

**Acceptance criteria**

- Customer database contains no test stores, test contacts, test invoices, or test cash sessions.
- Running the complete test suite does not change record counts in the development database.
- Test startup fails safely when pointed at a non-test database.

### P0-2 — Purchase orders are invisible despite existing records

**Observed**

The “Commandes Fournisseur” page displays:

- `Aucune commande trouvée`
- `Affichage de 1 à 9 sur 9 résultats`
- `Page 1 sur 1`

The database contains nine purchase orders, but the screen renders no order rows and all summary cards show zero.

**Customer impact**

- Purchasing staff cannot see or manage existing orders.
- Staff may create duplicate orders because they believe none exist.
- Receptions and supplier follow-up become unreliable.

**Root cause**

The response interceptor unwraps the API envelope into an array and attaches `pagination` to that array:

- `frontend/src/services/api.ts:21-33`

The purchase-order page then treats the array as an object with `data` and `pagination` properties:

- `frontend/src/pages/Commandes.tsx:95-103`

As a result, `res.data` is undefined and the list is set to an empty array, while `res.pagination` still reports nine records.

**Fix**

- Standardize one typed pagination contract, for example:

  ```ts
  type Page<T> = {
    data: T[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
  ```

- Do not mutate arrays by attaching metadata properties.
- Either preserve the server envelope in the interceptor or reconstruct a `Page<T>` object inside the service.
- Add a browser/component regression test that asserts row count and pagination count agree.

**Acceptance criteria**

- With nine orders, the page renders nine rows/cards and says `1 à 9 sur 9`.
- KPI cards are calculated from valid data or obtained from a dedicated statistics endpoint.
- Empty state is shown only when `total === 0`.

### P0-3 — Zero-price products can enter the sales workflow

**Observed**

- 1,022 of 4,046 products have `prix_vente <= 0`.
- The inventory page shows `0 XOF` and `-100.0%` margin for these products.
- Invoice product search offers these items as clickable results at `0 FCFA`.
- The invoice form converts a missing/invalid price to zero in `frontend/src/pages/NouvelleFacture.tsx:219` and `:489`.

**Customer impact**

- Staff can accidentally give stock away for free.
- Margin reports become misleading.
- A zero price looks like a valid price rather than incomplete master data.
- Sales staff lose confidence in product search and pricing.

**Fix**

1. Display `Prix non renseigné` rather than `0 FCFA` when the product is not sellable.
2. Disable adding a zero-price product to invoices, quotes, delivery notes, and POS.
3. Allow an explicit, permission-controlled price override only if the business requires it, and audit that override.
4. Add a master-data quality report for missing price, category, supplier, or cost.
5. Consider a database/application invariant requiring a positive sale price when `vendable = true`.

**Acceptance criteria**

- A normal salesperson cannot submit a sales document with a zero unit price.
- Zero-price items are clearly marked as incomplete and excluded from normal product results.
- Inventory margin never displays `-100%` solely because a sale price is missing.

### P0-4 — The login screen advertises accounts that do not exist

**Observed**

The development login screen lists:

- `admin / admin123`
- `manager / manager123`
- `caissier / caissier123`

Only the `admin` user exists in the database. Manager and cashier login attempts fail.

The strings are defined in `frontend/src/pages/Login.tsx:121-132`.

**Customer/developer impact**

- Evaluators believe role-based access is broken.
- Testing a cashier or manager journey is blocked.
- Onboarding instructions are immediately contradicted by the product.

**Fix**

- Either seed all advertised accounts reliably in development or remove the list.
- Show demo credentials only in a clearly identified demo environment, never merely because a frontend development build is running.
- Add a role-smoke test that logs in as each supported operational role and verifies its landing page.

## Major issues

### P1-1 — Customer-facing metrics are not trustworthy

**Observed**

- Dashboard “Top 5 Produits” repeats the same `Test Product 1` five times.
- Recent invoice statuses appear as raw database values such as `payee`, `en_attente`, and `partielle`.
- Forecast is `708 142 984 FCFA` with a range from `0` to `2 178 434 156 FCFA`, too broad to guide a decision.
- Stock alerts show `1 534` on the dashboard and `1 036` in reports without explaining different scope or filters.
- Large headline amounts are sometimes displayed without thousands separators.

**Customer impact**

- Managers cannot tell which number to trust.
- Raw statuses and repeated test values make the system look unfinished.
- An unusably wide forecast creates false precision.

**Fix**

- Remove test data first, then validate each KPI against a documented business definition.
- Always translate statuses through one shared French status map.
- State the scope beside each KPI: date range, location, document states included, and refresh time.
- Hide or label forecasts as low-confidence when the interval is too wide.
- Use `fr-FR` number formatting consistently.
- Reduce the default dashboard to the 4–6 actions/KPIs most relevant to the current role.

### P1-2 — Inventory is unusable on a phone

**Observed at 390 × 844**

- Product names wrap into very narrow vertical columns.
- Price, margin, stock, and action icons overlap.
- The row checkbox, reference, and action icons collide.
- The inner table has its own scrolling area and horizontal scrollbar.

The fixed eight-column layout is implemented in `frontend/src/pages/Inventaire.tsx:917-987`.

**Customer impact**

- Warehouse/store staff cannot reliably check or edit stock from a phone.
- Small overlapping delete/edit icons increase mis-taps.

**Fix**

- Below the tablet breakpoint, replace the table with product cards.
- Card primary information: product name, reference, available stock, price, and alert status.
- Move history/edit/delete into an overflow menu.
- Keep one page scroll; avoid nested vertical scroll containers on mobile.

**Acceptance criteria**

- At 390 px width there is no page-level horizontal scrollbar.
- Product text, price, stock, and actions never overlap.
- All tap targets are at least 44 × 44 CSS pixels.

### P1-3 — Reporting does not scale to the amount of data

**Observed**

- The aging section renders every receivable row in one table.
- There is no pagination, search, debtor threshold, top-N control, or direct export beside the section.
- The DOM snapshot was extremely large because of hundreds of test/customer rows.
- Mobile report tabs and the aging table require horizontal scrolling.

The unbounded mapping is in `frontend/src/pages/Reporting.tsx:221-248`.

**Customer impact**

- Slow rendering and long scrolling.
- Managers cannot focus on the largest or most urgent debtors.
- Mobile use is impractical.

**Fix**

- Paginate or virtualize the aging table.
- Default to top debtors and provide `Voir tout`.
- Add customer search, aging bucket, minimum amount, and location filters.
- Provide CSV/Excel export with the active filters.
- Use a mobile card summary instead of the five-column table.

### P1-4 — A cash session has remained open for more than two months

**Observed**

- PBD Treichville’s cash session has been open since 18 May 2026.
- It contains 441 movements.
- The UI presents this as a normal green “Caisse ouverte” state without a stale-session warning.
- Payment methods in the history appear as raw lowercase values such as `espece`.

**Customer impact**

- Daily reconciliation and responsibility boundaries are weakened.
- It is harder to investigate cash differences.
- A cashier may not realize they are continuing an old session.

**Fix**

- Warn when a cash session crosses the configured business-day cutoff.
- Require explicit manager approval to continue a stale session.
- Offer guided close/reopen at login or shift start.
- Display the session age prominently.
- Translate raw method codes (`espece` → `Espèces`, etc.) through a shared formatter.

### P1-5 — Logout can leave the previous credentials populated

**Observed**

After logout, the login form visibly retained the previous administrator username and a populated password field. This may involve browser form restoration/autofill, but it is unsafe on a shared shop computer.

**Customer impact**

- The next person may be able to re-enter the prior account.
- Users may believe logout did not fully protect the session.

**Fix**

- Reproduce in supported browsers and identify whether the cause is back/forward cache, form restoration, or password-manager behavior.
- Ensure logout clears form state and uses an authentication-safe cache policy.
- Verify that browser Back cannot restore an authenticated page after logout.
- Do not weaken normal password-manager security without testing; fix the logout/cache lifecycle instead.

### P1-6 — The UI still references TVA despite a no-TVA product policy

**Observed**

The invoice summary shows:

- `TVA (0%)`
- `Total TTC`

The repository policy explicitly states that TVA is removed system-wide. The labels are implemented in `frontend/src/pages/NouvelleFacture.tsx:747-751`, with similar `Total TTC` labels elsewhere.

**Customer impact**

- Users may believe tax is calculated or may ask why the tax is always zero.
- It contradicts the stated business policy.

**Fix**

- Remove the TVA row entirely.
- Replace `Total TTC` with `Total`.
- Search all customer-facing pages and generated documents for `TVA`, `HT`, and `TTC`.

## Usability and polish issues

### P2-1 — French terminology is inconsistent

Examples observed:

- `Locations` instead of `Emplacements` or `Sites de stock`
- `Valuation` instead of `Valorisation`
- `Factures Fourn.` instead of `Factures fournisseurs`
- `Gerez`, `reapprovisionnement`, `numero`, `trouvee`, `Validee`, `Expediee`
- `Location de vente`
- English screen-reader text `Close`
- Native validation bubble `Please fill out this field`

Relevant files:

- `frontend/src/components/navConfig.tsx:84,107,116`
- `frontend/src/pages/Commandes.tsx:746,804,818-821,838`
- `frontend/src/components/ui/dialog.tsx:41-43`

**Fix**

- Establish a short product glossary and a shared status/payment-method formatter.
- Replace native required-field bubbles with French inline validation.
- Add a lint/test rule for known forbidden or untranslated UI strings.

### P2-2 — Validation feedback is inconsistent

**Observed**

- Empty contact submission triggers an English browser bubble.
- Empty cash movement submission shows the technical toast `Montant > 0 obligatoire`.
- Some disabled submit buttons explain the missing requirement well, while other forms do not.

**Fix**

- Use Zod/react-hook-form consistently.
- Show inline French errors beneath every invalid field.
- Focus the first invalid field and keep a short error summary for long dialogs.
- Prefer `Saisissez un montant supérieur à 0 FCFA` over mathematical/technical wording.

### P2-3 — Global search has accessibility defects

**Observed**

- Global search works and is useful.
- Opening it logs Radix accessibility errors: missing `DialogTitle` and missing description.
- Result type labels show internal lowercase types such as `tiers` and `facture`.

The dialog is in `frontend/src/components/GlobalSearch.tsx:180-235`.

**Fix**

- Add a visually hidden French `DialogTitle` and description.
- Use friendly type labels: `Contact`, `Facture`, `Produit`, `Commande fournisseur`.
- Keep result grouping and keyboard navigation; those are valuable.

### P2-4 — Too many simultaneous scroll areas

**Observed on desktop**

- Page scroll
- Sidebar scroll
- Inventory table scroll

This makes the wheel/trackpad target unpredictable. The inventory viewport also shows only a few rows even on desktop.

**Fix**

- Prefer one main content scroll.
- Keep only horizontal table overflow where essential.
- Avoid fixed table heights when the whole page already scrolls.

### P2-5 — Destructive actions are too prominent

**Observed**

- Delete icons appear on every inventory and contact row.
- On mobile, the small red icons overlap other content.
- A confirmation dialog exists, which is good, but accidental initiation is still too easy.

**Fix**

- Move destructive actions into an overflow menu.
- Separate `Voir`/`Modifier` from `Supprimer`.
- Keep confirmations and add dependency-aware explanations when deletion is impossible.

### P2-6 — The invoice product-search empty state is ambiguous

**Observed**

While product search results are visible, the form still says:

`Aucun produit. Recherchez ou scannez pour ajouter.`

This actually means “no product has been added,” not “no result exists.”

**Fix**

- Change the line-item empty state to `Aucun article ajouté à la facture`.
- Keep search-result feedback separate from selected-line feedback.
- Show `Prix non renseigné` for zero-priced results.

### P2-7 — Accounting ledger needs better findability

**Observed**

- The ledger contains 6,894 entries and has pagination.
- It can filter by date and journal.
- It lacks visible search/filtering by account, piece number, or description.
- Debit and credit columns do not state the currency.

**Fix**

- Add account, piece-number, and description search.
- Display `Débit (FCFA)` and `Crédit (FCFA)` or a clear page-level currency label.
- Make piece numbers navigable to their source document where possible.

## What already works well

- Clean, modern visual style with consistent cards, buttons, icons, and status colors.
- Clear left-navigation grouping by business domain.
- Global search covers products, contacts, invoices, quotes, delivery notes, and orders.
- Invoice creation has good progressive guidance and disables submission until requirements are met.
- Invoice draft recovery is excellent and worked across navigation/login.
- Customer and supplier pickers are searchable and show code/role context.
- Tables generally provide sorting, filters, pagination, and exports.
- French date formatting is consistent in the tested flows.
- Mobile navigation drawer is clear and easy to close.
- Invoice creation stacks reasonably well on mobile.
- Destructive operations generally have confirmation steps.
- The breadth of ERP workflows is strong for an SMB retail/wholesale business.

## Recommended delivery plan

### Phase 0 — Customer rollout blockers

Target: before any customer acceptance session.

1. Isolate integration tests from all non-test databases.
2. Back up and clean polluted operational data using a reviewed provenance-based plan.
3. Fix the purchase-order response contract and add a regression test.
4. Block zero-price products from sales documents.
5. Remove or correctly seed advertised demo users.

### Phase 1 — Trust and daily operations

Target: first stabilization sprint.

1. Validate dashboard/report KPIs after data cleanup.
2. Add stale cash-session warnings and guided daily close.
3. Remove TVA/TTC wording.
4. Fix logout credential restoration/cache behavior.
5. Redesign mobile inventory.
6. Paginate/filter aging reports.

### Phase 2 — Customer delight

Target: next UX sprint.

1. Complete the French-language glossary and translation sweep.
2. Standardize form validation and error messages.
3. Fix dialog/chart accessibility.
4. Simplify role-specific dashboards and navigation.
5. Reduce nested scrolling and move destructive actions into overflow menus.
6. Add in-product help for accounting and inventory terms.

## Suggested acceptance test before customer sign-off

- Admin, manager, cashier, salesperson, warehouse, and purchasing users can all log in.
- Each role sees only the navigation and actions needed for its work.
- Purchase-order row count always matches pagination count.
- No normal sales workflow accepts a zero-price line.
- No test/debug records appear in customer-facing lists, searches, or reports.
- Dashboard KPI definitions are documented and match direct database reconciliation.
- A cash session older than the configured cutoff produces a prominent warning.
- Logout prevents reopening authenticated pages with Back and does not leave a usable prior password.
- Mobile inventory at 390 px has no overlapping content or page-level horizontal scroll.
- `TVA`, `HT`, and `TTC` do not appear in the UI or generated documents unless policy changes.
- All validation and screen-reader labels are French.
- Opening global search and major dialogs produces no accessibility console errors.
- Aging reports remain responsive with production-sized data.

## Final recommendation

Do not spend the next sprint primarily changing colors or adding new modules. The UI foundation is already good enough. Customer happiness will improve fastest by restoring **trust, predictability, and clean operational data**:

1. Separate tests from real data.
2. Make every count agree with the records shown.
3. Prevent financially dangerous defaults.
4. Make the daily sales, purchasing, stock, and cash flows reliable on the devices staff actually use.

