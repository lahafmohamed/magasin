# FEATURE-ANALYSIS.md

> ⚠️ **ARCHIVED 2026-07-18 — STALE SNAPSHOT (2026-06-21).** Several "missing/partial" items
> listed here have since been implemented (3-way match `082`, returns restock-on-approval,
> supplier-invoice `validateBody`, payroll `080/081`, ...). Do NOT use as a to-do list;
> see CLAUDE.md and AUDIT.md for current state.

> Net-new feature roadmap for the Hitek ERP (French retail + wholesale electronics, currency **XOF**).
> Derived by reading the actual repository on branch `fix/p0-data-integrity` (2026-06-21). Not bug fixes / refactors — **new** capabilities only.
>
> **Detected stack (must be respected by all recommendations):**
> - Backend: Node.js + Express ^4.18 + TypeScript (strict), PostgreSQL via `pg` Pool (raw parameterized SQL, **no ORM**), Zod validation, JWT (httpOnly cookie) + bcrypt, pino, helmet, pdfkit, xlsx. Tests: vitest + supertest.
> - Frontend: React 18 + Vite 5 + TS (strict), TailwindCSS + shadcn/ui (Radix), react-router-dom v6 (lazy), react-hook-form + zod, axios, recharts, sonner. Tests: vitest + Testing Library.
> - DB-centric: many invariants live in numbered SQL migrations (`001`..`080`) as triggers/functions. New work = new `NNN_*.sql` + `migrate.mjs`.
> - Conventions: services extend `BaseService` (sort allow-list, parameterized helpers); routes `authenticate` → `authorize`/`validateBody` → controller → service → SQL; `NumberingService` for sequences; money `NUMERIC(15,2)`.

---

## 1. CURRENT FEATURE INVENTORY

Status: **Complete** = end-to-end (route + service + UI) / **Partial** = exists but half-built, disabled, or no UI.

### Sales / Order-to-Cash
- **Complete** — Quotations (devis), with convert-to-BL/facture — [backend/src/routes/devis.ts](backend/src/routes/devis.ts), [frontend/src/pages/Devis.tsx](frontend/src/pages/Devis.tsx)
- **Complete** — Delivery notes (bons de livraison) — [backend/src/services/BonLivraisonService.ts](backend/src/services/BonLivraisonService.ts), [frontend/src/pages/BonsLivraison.tsx](frontend/src/pages/BonsLivraison.tsx)
- **Complete** — Sales invoices + payment-status tracking — [backend/src/services/FactureService.ts](backend/src/services/FactureService.ts), [frontend/src/pages/Factures.tsx](frontend/src/pages/Factures.tsx)
- **Complete** — Payments (cash/check/transfer), allocation FIFO — [backend/src/services/PaiementService.ts](backend/src/services/PaiementService.ts), [backend/src/services/ClientAllocationService.ts](backend/src/services/ClientAllocationService.ts)
- **Complete** — Customer prepayments (acomptes) — [backend/src/routes/acomptes.ts](backend/src/routes/acomptes.ts), [backend/src/db/051_acompte_fournisseur_applications.sql](backend/src/db/051_acompte_fournisseur_applications.sql)
- **Complete** — Credit notes / avoirs — [backend/src/services/CreditNoteService.ts](backend/src/services/CreditNoteService.ts), [frontend/src/pages/Avoirs.tsx](frontend/src/pages/Avoirs.tsx)
- **Complete** — POS terminal — [backend/src/services/POSService.ts](backend/src/services/POSService.ts), [frontend/src/pages/CaisseV2.tsx](frontend/src/pages/CaisseV2.tsx), [backend/src/db/014_pos_terminal.sql](backend/src/db/014_pos_terminal.sql)
- **Complete** — Unified document numbering — [backend/src/services/NumberingService.ts](backend/src/services/NumberingService.ts), [backend/src/db/030_unified_numbering.sql](backend/src/db/030_unified_numbering.sql)
- **Partial** — Returns (retours): restock at create *before* approval — [backend/src/services/ReturnService.ts](backend/src/services/ReturnService.ts)

### Purchasing / Procure-to-Pay
- **Complete** — Purchase orders (commandes) — [backend/src/controllers/CommandeController.ts](backend/src/controllers/CommandeController.ts), [frontend/src/pages/Commandes.tsx](frontend/src/pages/Commandes.tsx)
- **Complete** — Goods receptions (lot/serial intake, CMP on reception) — [backend/src/services/ReceptionService.ts](backend/src/services/ReceptionService.ts), [frontend/src/pages/Receptions.tsx](frontend/src/pages/Receptions.tsx)
- **Complete** — Supplier invoices — [backend/src/services/FactureFournisseurService.ts](backend/src/services/FactureFournisseurService.ts), [frontend/src/pages/FacturesFournisseur.tsx](frontend/src/pages/FacturesFournisseur.tsx) *(routes lack `validateBody` — known issue)*
- **Complete** — Supplier prepayments + compensation/netting — [backend/src/services/CompensationService.ts](backend/src/services/CompensationService.ts), [backend/src/db/054_compensation_acompte_method.sql](backend/src/db/054_compensation_acompte_method.sql)
- **Complete** — Internal stock replenishment requests (demandes) — [backend/src/services/DemandeService.ts](backend/src/services/DemandeService.ts), [frontend/src/pages/DemandesList.tsx](frontend/src/pages/DemandesList.tsx)
- **Missing** — 3-way match (PO ↔ reception ↔ supplier invoice) — no matching service found

### Inventory / Stock
- **Complete** — Product master + CMP valuation — [backend/src/services/ProduitService.ts](backend/src/services/ProduitService.ts), [frontend/src/pages/Inventaire.tsx](frontend/src/pages/Inventaire.tsx)
- **Complete** — Multi-location stock (magasins + dépôts) — [backend/src/services/StockLocationService.ts](backend/src/services/StockLocationService.ts), [frontend/src/pages/StockLocations.tsx](frontend/src/pages/StockLocations.tsx)
- **Complete** — Stock transfers (transactional, FOR UPDATE) — [backend/src/services/StockTransferService.ts](backend/src/services/StockTransferService.ts), [frontend/src/pages/StockTransfers.tsx](frontend/src/pages/StockTransfers.tsx)
- **Complete** — Batch/lot tracking — [backend/src/services/LotService.ts](backend/src/services/LotService.ts), [backend/src/db/015_batch_lot_tracking.sql](backend/src/db/015_batch_lot_tracking.sql)
- **Complete** — Serial-number tracking — [backend/src/services/SerialService.ts](backend/src/services/SerialService.ts), [backend/src/db/016_serial_number_tracking.sql](backend/src/db/016_serial_number_tracking.sql)
- **Complete** — Stock valuation invariant + report — [backend/src/db/076_stock_valeur_invariant.sql](backend/src/db/076_stock_valeur_invariant.sql), [frontend/src/pages/StockValuation.tsx](frontend/src/pages/StockValuation.tsx)
- **Complete** — Fleet (camions) + fuel (gasoil) — [backend/src/services/CamionService.ts](backend/src/services/CamionService.ts), [backend/src/db/039_camions_gasoil.sql](backend/src/db/039_camions_gasoil.sql)
- **Partial** — Product bulk import (CSV only) — [backend/src/services/ProductImportService.ts](backend/src/services/ProductImportService.ts)
- **Missing** — Stock reservations (`quantite_reservee` was dropped) — [backend/src/db/078_drop_quantite_reservee.sql](backend/src/db/078_drop_quantite_reservee.sql)
- **Missing** — Physical-count / cycle-count sessions (no count-sheet → variance posting workflow)

### Accounting / Finance
- **Complete** — Chart of accounts (plan comptable) — [backend/src/db/069_plan_comptable.sql](backend/src/db/069_plan_comptable.sql), [frontend/src/pages/Comptabilite.tsx](frontend/src/pages/Comptabilite.tsx)
- **Complete** — General ledger + auto-posting on invoice — [backend/src/services/GeneralLedgerService.ts](backend/src/services/GeneralLedgerService.ts), [backend/src/db/072_ecritures_triggers_069.sql](backend/src/db/072_ecritures_triggers_069.sql)
- **Complete** — Accounting period lock (now DB-trigger enforced) — [backend/src/db/075_period_lock_ecritures.sql](backend/src/db/075_period_lock_ecritures.sql), [backend/src/services/PeriodService.ts](backend/src/services/PeriodService.ts)
- **Complete** — Cash registers (caisse) + hierarchy + daily variance — [backend/src/services/CaisseMagasinService.ts](backend/src/services/CaisseMagasinService.ts), [backend/src/services/CashVarianceService.ts](backend/src/services/CashVarianceService.ts), [frontend/src/pages/CaisseAudit.tsx](frontend/src/pages/CaisseAudit.tsx)
- **Complete** — Expenses V2 — [backend/src/services/DepenseService.ts](backend/src/services/DepenseService.ts), [frontend/src/pages/DepensesV2.tsx](frontend/src/pages/DepensesV2.tsx)
- **Complete** — Treasury / cash-flow view — [frontend/src/pages/Tresorerie.tsx](frontend/src/pages/Tresorerie.tsx)
- **Partial** — Caisse → GL posting (exists but env-gated **off** via `CAISSE_GL_POSTING`) — [backend/src/services/CaisseMagasinService.ts](backend/src/services/CaisseMagasinService.ts)
- **Missing (removed by design)** — TVA / tax (`027_enforce_no_tax.sql` forces tva=0) — [backend/src/db/027_enforce_no_tax.sql](backend/src/db/027_enforce_no_tax.sql)
- **Missing (dropped)** — Multi-currency (added in `066/067`, then dropped in `077`) — [backend/src/db/077_drop_unused_multidevise.sql](backend/src/db/077_drop_unused_multidevise.sql)

### HR / Payroll
- **Complete** — Employees + commissions/shifts — [backend/src/services/EmployeService.ts](backend/src/services/EmployeService.ts), [frontend/src/pages/Employes.tsx](frontend/src/pages/Employes.tsx)
- **Complete (new this branch)** — Payroll runs + payslips (salaire + commissions + primes + déductions) — [backend/src/services/PayrollService.ts](backend/src/services/PayrollService.ts), [backend/src/db/080_payroll.sql](backend/src/db/080_payroll.sql), [frontend/src/pages/Payroll.tsx](frontend/src/pages/Payroll.tsx), mounted at [server.ts:139](backend/src/server.ts)

### CRM
- **Partial** — CRM interactions/tasks/reminders (backend full, UI only embedded in TiersDetail) — [backend/src/services/CrmService.ts](backend/src/services/CrmService.ts), [backend/src/db/068_crm_interactions.sql](backend/src/db/068_crm_interactions.sql), [frontend/src/pages/TiersDetail.tsx](frontend/src/pages/TiersDetail.tsx)
- **Complete** — Customer analytics — [frontend/src/pages/ClientAnalytics.tsx](frontend/src/pages/ClientAnalytics.tsx)

### Master Data / Admin / Infra
- **Complete** — Unified tiers (clients + suppliers) — [backend/src/services/TiersService.ts](backend/src/services/TiersService.ts), [backend/src/db/043_unified_tiers.sql](backend/src/db/043_unified_tiers.sql)
- **Complete** — Auth (JWT httpOnly cookie + DB sessions + must-change-password) — [backend/src/middleware/auth.ts](backend/src/middleware/auth.ts), [frontend/src/pages/Login.tsx](frontend/src/pages/Login.tsx)
- **Complete** — Admin users + per-location assignment — [backend/src/services/AdminUserService.ts](backend/src/services/AdminUserService.ts), [frontend/src/pages/UserManagement.tsx](frontend/src/pages/UserManagement.tsx)
- **Partial** — RBAC (3 fragmented systems; dynamic DB perms `056/057/058` barely adopted) — [backend/src/middleware/permissions.ts](backend/src/middleware/permissions.ts), [frontend/src/pages/PermissionsPage.tsx](frontend/src/pages/PermissionsPage.tsx)
- **Complete** — Audit log — [backend/src/services/AuditService.ts](backend/src/services/AuditService.ts), [backend/src/db/063_audit_log.sql](backend/src/db/063_audit_log.sql), [frontend/src/pages/AuditLog.tsx](frontend/src/pages/AuditLog.tsx)
- **Complete** — Idempotency keys — [backend/src/middleware/idempotency.ts](backend/src/middleware/idempotency.ts), [backend/src/db/064_idempotency_keys.sql](backend/src/db/064_idempotency_keys.sql)
- **Complete** — Company settings — [backend/src/services/CompanySettingsService.ts](backend/src/services/CompanySettingsService.ts), [frontend/src/pages/CompanySettings.tsx](frontend/src/pages/CompanySettings.tsx)
- **Complete** — Reporting (P&L, top products/clients, margins, receivables) — [backend/src/services/ReportingService.ts](backend/src/services/ReportingService.ts), [frontend/src/pages/Reporting.tsx](frontend/src/pages/Reporting.tsx)
- **Complete** — Real-time notifications (SSE, in-app only) — [backend/src/services/NotificationService.ts](backend/src/services/NotificationService.ts), [frontend/src/components/NotificationBell.tsx](frontend/src/components/NotificationBell.tsx)
- **Complete** — Excel/CSV/PDF export — [backend/src/services/PDFService.ts](backend/src/services/PDFService.ts), [frontend/src/hooks/useExportExcel.ts](frontend/src/hooks/useExportExcel.ts), [backend/src/routes/export-batch.ts](backend/src/routes/export-batch.ts)
- **Complete** — Global search — [frontend/src/components/GlobalSearch.tsx](frontend/src/components/GlobalSearch.tsx)

---

## 2. GAP ANALYSIS vs. a standard complete ERP

| Domain | Status | Note |
|---|---|---|
| Finance / Accounting | **Present** | Double-entry GL, plan comptable, period lock (DB-enforced), treasury. Gap: no financial statements export (bilan/compte de résultat as formal docs), no recurring journals, no bank reconciliation. |
| Inventory / Stock | **Present** | Multi-location, CMP, batch+serial, transfers, valuation invariant. Gap: no cycle-count workflow, no reorder automation, reservations dropped. |
| Sales / Order Mgmt | **Present** | Full quote→BL→invoice→payment→avoir + POS. Gap: no recurring/subscription invoicing, no backorder mgmt. |
| Purchasing / Procurement | **Partial** | PO→reception→supplier-invoice exist but **no 3-way match**, no auto-reorder/PO suggestion, no supplier price lists. |
| CRM | **Partial** | Interactions/tasks exist in backend; no dedicated CRM page, no pipeline/opportunity stages, no lead capture. |
| HR / Payroll | **Present** | Employees + commissions + payroll runs/payslips (new). Gap: no leave/attendance, no payslip PDF [unverified], no statutory deduction config (CNPS/ITS). |
| Manufacturing / Production | **Missing** | No BOM, no work/assembly orders, no kitting. |
| Supply Chain | **Partial** | Transfers + demandes exist; no demand forecasting, no min/max reorder, no landed-cost. |
| Reporting / Analytics / Dashboards | **Present** | Dashboard + Reporting + ClientAnalytics + recharts. Gap: no custom/ad-hoc report builder, no scheduled report delivery, no drill-down. |
| Multi-currency | **Missing** | Schema added then **dropped** (`077`); XOF hardcoded. |
| Multi-company / Multi-branch | **Partial** | Multi-location (magasins/dépôts) yes; **single-tenant** — no separate legal entities / inter-company. |
| Tax compliance | **Missing (by policy)** | TVA forcibly disabled (`027`). No fiscal/tax reporting. |
| User roles / permissions | **Partial** | 3 overlapping RBAC systems; dynamic per-user DB perms wired but ~1 route group adopts them. |
| Audit logs | **Present** | `audit_log` + AuditService + UI; fire-and-forget. |
| Notifications | **Partial** | In-app SSE only. **No email / SMS / WhatsApp** channel. |
| Document management | **Missing** | No file attachments / uploads anywhere; PDFs rendered on the fly, not stored. |
| Integrations / API | **Missing** | No public/versioned API, no webhooks, no API keys, no mobile-money / bank / e-commerce connectors. |

---

## 3. RECOMMENDED NEW FEATURES

Priority: **P0** must-have for a usable ERP → **P3** differentiator. Effort: **S** (≤1–2 days), **M** (~1 week), **L** (multi-week).

### P0 — Must-have

**3.1 Three-way match (PO ↔ Reception ↔ Supplier Invoice)**
- One-liner: Block/flag supplier-invoice approval when qty or price deviates from the linked PO and reception beyond tolerance.
- Why: Core procurement control; without it overbilling and ghost invoices pass silently. Already have all three documents linked — only the matching layer is missing.
- Extends: [FactureFournisseurService.ts](backend/src/services/FactureFournisseurService.ts) + [ReceptionService.ts](backend/src/services/ReceptionService.ts) + new `081_three_way_match.sql`.
- Effort: **M** · Deps: existing commandes/receptions/factures-fournisseur links (present).

**3.2 Document attachments / file storage**
- One-liner: Upload & store files (scanned supplier invoices, delivery proofs, employee docs) attached to any record.
- Why: Every real ERP needs source-document storage for audit/dispute; currently nothing can be uploaded.
- Extends: cross-cutting — new `attachments` table + `multer`-style upload route + generic `<AttachmentPanel>` component; plug into factures, factures-fournisseur, tiers, employes.
- Effort: **M** · Deps: storage decision (local disk vs. S3-compatible) — **ask before adding a dependency**.

**3.3 Email/PDF document delivery**
- One-liner: Email invoices/quotes/payslips as PDF directly to the tiers/employee from the document page.
- Why: Customers expect documents by email; today PDFs only download locally. Highest-leverage external-comms gap.
- Extends: [PDFService.ts](backend/src/services/PDFService.ts) + new `MailService` + outbound queue table; buttons on Facture/Devis/Payroll pages.
- Effort: **M** · Deps: SMTP provider + `nodemailer` (**ask before adding dependency**); 3.2 not required but synergistic.

**3.4 Statutory payroll deductions config (CNPS / ITS)**
- One-liner: Configurable social-security + income-tax brackets so payslips compute legally correct net pay for Côte d'Ivoire.
- Why: Payroll exists but has no statutory deduction engine — payslips are not compliant without it.
- Extends: [PayrollService.ts](backend/src/services/PayrollService.ts) + new `081_payroll_statutory.sql` (deduction-rule tables).
- Effort: **M** · Deps: payroll (present, `080`).

**3.5 Payslip & financial-statement PDF generation**
- One-liner: Generate payslip PDFs and formal bilan / compte de résultat exports from the GL.
- Why: Payroll and accounting are data-complete but produce no official printable documents.
- Extends: [PDFService.ts](backend/src/services/PDFService.ts), [PayrollService.ts](backend/src/services/PayrollService.ts), [GeneralLedgerService.ts](backend/src/services/GeneralLedgerService.ts).
- Effort: **M** · Deps: payroll + GL (present); pdfkit already in stack.

### P1 — High value

**3.6 Reorder point / low-stock auto-suggest → draft PO**
- One-liner: Per-product min/reorder thresholds that surface low-stock alerts and pre-fill a draft purchase order.
- Why: Closes the inventory→purchasing loop; turns the existing stock-alert dashboard widget into action.
- Extends: [ProduitService.ts](backend/src/services/ProduitService.ts) + [CommandeController.ts](backend/src/controllers/CommandeController.ts); reuse Dashboard stock-alert widget.
- Effort: **M** · Deps: product master + commandes (present).

**3.7 Cycle-count / physical inventory sessions**
- One-liner: Count-sheet workflow that records counted vs. system qty per location and posts an adjustment movement.
- Why: Multi-location stock drifts; no controlled recount/adjustment path exists today.
- Extends: [StockLocationService.ts](backend/src/services/StockLocationService.ts) + new `inventory_count` tables + page.
- Effort: **M** · Deps: multi-location stock + mouvements (present).

**3.8 Bank reconciliation**
- One-liner: Import bank statement (CSV) and match lines against recorded paiements/dépenses.
- Why: Treasury view exists but there is no reconciliation against the actual bank — books can silently diverge.
- Extends: [PaiementService.ts](backend/src/services/PaiementService.ts) + [Tresorerie.tsx](frontend/src/pages/Tresorerie.tsx) + new `bank_statement` tables.
- Effort: **L** · Deps: paiements + caisse (present).

**3.9 RBAC unification (single permission model)**
- One-liner: Consolidate the 3 RBAC systems onto the dynamic per-user DB permissions (`056/057/058`) and adopt across all routes.
- Why: Fragmented authz is a security + maintainability risk; per-user perms already exist but are unused.
- Extends: [permissions.ts](backend/src/middleware/permissions.ts), [auth.ts](backend/src/middleware/auth.ts), [PermissionsPage.tsx](frontend/src/pages/PermissionsPage.tsx).
- Effort: **L** · Deps: dynamic RBAC migrations (present). *(Borderline refactor — listed because adoption across routes is net-new coverage.)*

**3.10 Dedicated CRM workspace + sales pipeline**
- One-liner: Standalone CRM page with opportunity stages, follow-up calendar, and per-tiers interaction timeline.
- Why: CRM backend exists but is invisible (only embedded in TiersDetail); no pipeline at all.
- Extends: [CrmService.ts](backend/src/services/CrmService.ts) + new `Crm.tsx` page; add `opportunites` table (`081_crm_pipeline.sql`).
- Effort: **M** · Deps: crm_interactions (present, `068`).

**3.11 Scheduled / recurring invoices & expenses**
- One-liner: Define recurring billing or expense templates that auto-generate documents on a cadence.
- Why: Wholesale/service customers and rent/utilities need recurring entries; all manual today.
- Extends: [FactureService.ts](backend/src/services/FactureService.ts), [DepenseService.ts](backend/src/services/DepenseService.ts) + a cron/worker.
- Effort: **M** · Deps: factures + depenses (present).

### P2 — Strengthens the product

**3.12 Public versioned REST API + API keys + webhooks**
- One-liner: Stable `/api/v1` surface with API-key auth and outbound webhooks on key events (invoice paid, stock low).
- Why: Enables integrations (e-commerce, mobile money, BI); none possible today.
- Extends: [server.ts](backend/src/server.ts), [auth.ts](backend/src/middleware/auth.ts) + `api_keys`/`webhooks` tables.
- Effort: **L** · Deps: stable schema; audit log (present) for event sourcing.

**3.13 Custom report builder / scheduled report delivery**
- One-liner: User-defined column/filter reports over existing datasets, optionally emailed on a schedule.
- Why: Reporting is fixed-template; power users need ad-hoc views.
- Extends: [ReportingService.ts](backend/src/services/ReportingService.ts) + [Reporting.tsx](frontend/src/pages/Reporting.tsx); needs 3.3 for delivery.
- Effort: **L** · Deps: reporting (present), email (3.3).

**3.14 Mobile-money / payment-gateway integration (Orange/MTN/Wave)**
- One-liner: Record and reconcile mobile-money collections against invoices via provider callbacks.
- Why: Dominant payment rail in the XOF region; currently only manual cash/check/transfer.
- Extends: [PaiementService.ts](backend/src/services/PaiementService.ts) + webhook intake (3.12).
- Effort: **L** · Deps: 3.12 (API/webhooks), idempotency (present).

**3.15 Supplier price lists + landed cost**
- One-liner: Per-supplier negotiated prices and allocation of freight/customs into product CMP on reception.
- Why: Improves purchasing accuracy and true margin; imported electronics carry significant landed cost.
- Extends: [ReceptionService.ts](backend/src/services/ReceptionService.ts), [TiersService.ts](backend/src/services/TiersService.ts).
- Effort: **M** · Deps: CMP on reception (present, `065`).

### P3 — Differentiators

**3.16 Manufacturing-lite / kitting & assembly (BOM)**
- One-liner: Define bundles/kits (BOM) that consume component stock and produce a sellable assembled item.
- Why: Lets the shop sell pre-built PCs/bundles with correct stock + cost rollup.
- Extends: [ProduitService.ts](backend/src/services/ProduitService.ts), [StockTransferService.ts](backend/src/services/StockTransferService.ts) + `bom` tables.
- Effort: **L** · Deps: product master + stock movements (present).

**3.17 Annual budgeting & variance**
- One-liner: Budget per GL account/period with actual-vs-budget variance reporting.
- Why: Management-level planning; absent today.
- Extends: [GeneralLedgerService.ts](backend/src/services/GeneralLedgerService.ts), [ReportingService.ts](backend/src/services/ReportingService.ts).
- Effort: **M** · Deps: GL + plan comptable (present).

**3.18 PWA / offline POS + mobile UX**
- One-liner: Register the existing (unregistered) service worker and make POS resilient to network drops.
- Why: PWA assets already in repo but dead; retail counters need offline tolerance.
- Extends: [frontend/src/main.tsx](frontend/src/main.tsx), POS page; `public/sw.js` exists.
- Effort: **M** · Deps: POS (present).

**3.19 Warranty / after-sales service tickets (RMA)**
- One-liner: Track serial-linked warranty claims and repair tickets through to credit note or replacement.
- Why: Electronics retail lives on warranty/RMA; serial tracking already exists to anchor it.
- Extends: [SerialService.ts](backend/src/services/SerialService.ts), [ReturnService.ts](backend/src/services/ReturnService.ts) + `sav_tickets` table.
- Effort: **M** · Deps: serial tracking + returns (present).

**3.20 HR leave & attendance**
- One-liner: Leave requests/approvals and attendance that feed payroll deductions.
- Why: Completes HR beyond payslips.
- Extends: [EmployeService.ts](backend/src/services/EmployeService.ts), [PayrollService.ts](backend/src/services/PayrollService.ts).
- Effort: **M** · Deps: employees + payroll (present).

---

## 4. QUICK WINS vs. STRATEGIC BETS

### Quick wins (high impact / low effort — do now)
- **3.5 Payslip & statement PDFs** — pdfkit already in stack; data is complete; just render.
- **3.6 Reorder point → draft PO** — small schema add; reuses existing stock-alert widget and commandes flow.
- **3.10 CRM workspace page** — backend done; mostly a new React page over `crmService`.
- **3.18 PWA registration** — assets already in repo (`public/sw.js`); a few lines in `main.tsx` + offline cache.
- **3.7 Cycle-count sessions** — bounded workflow on top of existing mouvements/locations.

### Strategic bets (larger / level-up the product)
- **3.2 + 3.3 Document attachments + email delivery** — turns the ERP from internal-only to externally communicating; unlocks many downstream features.
- **3.1 Three-way match** — real procurement-grade financial control; defining feature vs. spreadsheets.
- **3.12 Public API + webhooks** → enables **3.14 mobile-money** integration (the region's dominant payment rail).
- **3.8 Bank reconciliation** — closes the loop between books and reality; auditor-grade.
- **3.16 Manufacturing-lite/kitting** — opens the "build & sell bundled PCs" business line unique to an electronics shop.

---

*Notes:* TVA (tax) and multi-currency were intentionally removed (`027`, `077`) — not recommended for re-add without an explicit policy decision. Items 3.2/3.3/3.14 imply **new dependencies** (storage SDK, nodemailer, provider SDK) — per scope, confirm before adding. `[unverified]`: whether payslip PDF rendering already partially exists in PDFService was not exhaustively confirmed.
