# Design brief — Hitek ERP interface (2026-10-23)

The brief the design team works from. It states who the interface serves, what "polished and accessible" means for this product, and the exact bar each sign-off gate applies. It complements, and never overrides, the rules already in force: the root [CLAUDE.md](../../CLAUDE.md) frontend non-negotiables and [frontend/CLAUDE.md](../../frontend/CLAUDE.md) (UI, animation, typography, color, accessibility, layout and French microcopy rules). History of earlier passes: [DESIGN-AUDIT.md](../../DESIGN-AUDIT.md), [INTERFACE-RULES-AUDIT-2026-08-27.md](../../INTERFACE-RULES-AUDIT-2026-08-27.md).

## 1. Product and context

Hitek is a French-language ERP for a retail + wholesale computer and phone shop in Abidjan (Côte d'Ivoire), sold as a hosted single-tenant service, one instance per business. It runs the whole day: counter sales and cash, quotes → delivery notes → invoices → payments and credit notes, purchasing and receptions, multi-location stock (shop + depot), expenses, accounting, payroll and reporting. Currency is FCFA (XOF), shown as `43 126 500 FCFA`. There is no VAT by design.

Working conditions that shape the design:
- **Shared, mid-range hardware.** Counter PCs at 1366×768 or 1440×900; mid-range Android phones (≈390 px wide) in the depot and for managers away from the desk. Sunlight and glare in the depot.
- **Unreliable power and network.** Pages must say clearly when data failed to load; a failed fetch must never look like "zero".
- **Mixed digital fluency.** Some staff are fast keyboard users, others are new to software. Plain French, icon + text labels, no jargon the role does not use.
- **Money and stock are irreversible in practice.** A wrong click can mean a wrong invoice, an unbalanced till or stock that does not exist. Clarity beats density.

## 2. People (one per role in `roles.nom`)

| Persona | Role | Where / device | Top jobs | What hurts them |
|---|---|---|---|---|
| **Adjoua — caissière** | `caissier` | Counter PC, barcode scanner, keyboard | Open the till, take a sale, record a payment, close the till and explain any gap | Slow screens, ambiguous amounts, confirmations that do not say what will happen |
| **Seydou — vendeur magasin** | `magasin_staff` | Shop floor PC, sometimes phone | Check stock, make a devis, turn it into a BL/facture, ask the depot for stock | Long forms, losing a half-typed document, not knowing a product is out of stock |
| **Koffi — magasinier dépôt** | `depot_staff` | Phone/tablet in the warehouse | Receive supplier deliveries, transfer stock to the shop, fulfil demandes | Small touch targets, low contrast in sunlight, desktop-only tables |
| **Moussa — gérant** | `manager` | Desktop + phone | Watch the day's sales, approve demandes, chase unpaid invoices, approve returns and credit notes, audit the till, run payroll | Dashboards that hide what needs action, lists without filters, numbers without context |
| **Awa — administratrice / comptable** | `admin` | Desktop | Settings, users, accounting, treasury, reports, audit log | Inconsistent totals between screens, exports that do not match the screen |

## 3. Experience principles

1. **Money is never ambiguous.** One currency label (FCFA), one number format, tabular figures, totals that match across screens. Status of a document is always in words, never colour alone.
2. **Every state is explicit.** Loading, empty, error, partial and success each have a designed state. Empty states say what the list is for and what to do next.
3. **One way to do each thing.** The same pattern for every document list, detail page, form, confirmation and status. A user who learned Factures already knows Devis.
4. **Fast where speed matters.** Counter and depot flows favour keyboard, scanner and few steps; one clear primary action per screen.
5. **Calm and trustworthy.** Restrained colour (colour = meaning), restrained motion, generous but not wasteful spacing. This is a tool people use eight hours a day.

## 4. Brand and voice

- **Name:** Hitek. Product chrome shows the company name from `company_settings`.
- **Identity:** deep blue primary (the `primary` ramp), Inter (self-hosted, variable), neutral greys, status ramps for meaning only, `chart-1..7` for categories.
- **Voice:** professional, direct, warm. Vouvoiement. Short sentences. Verb-first buttons that name the outcome (« Enregistrer le paiement », « Supprimer la facture »). Errors say what happened and what to do next, in French, without technical codes.
- **French typography:** sentence case; real apostrophe ’, guillemets « », ellipsis …; FCFA after the amount; dates `22 oct. 2026`; never "XOF" in the interface.
- **Glossary (one word per concept):** facture, devis, bon de livraison (BL), avoir, retour, paiement, acompte, relance, contact (a `tiers` is a client and/or a fournisseur), commande fournisseur, réception, demande de réapprovisionnement, transfert, caisse, session de caisse, dépense, écriture, période.

## 5. Scope

All authenticated screens and the shell, in light and dark themes, at 1440 px desktop and 390 px mobile:
- **Shell:** `Layout`, `Sidebar`, `Topbar`, `GlobalSearch`, `NotificationBell`, `Login`, `ChangePassword`, `Profil`, shared `components/ui/*`.
- **Ventes:** Factures, FactureDetail, NouvelleFacture, Devis, DevisDetail, NouveauDevis, BonsLivraison, BonLivraisonDetail, NouveauBonLivraison, Retours, Avoirs, AvoirDetail, NouvelAvoir, Relances (+ PaymentModal, PaymentHistory, DocumentListPage).
- **Achats & stock:** Commandes, CommandeDetail, Reapprovisionnement, Receptions, FacturesFournisseur, Inventaire, StockLocations, StockTransfers, StockValuation, AffectationsLocations, DemandesList, DemandeDetail, DemandeForm.
- **Finance:** CaisseV2, CaisseAudit, CaisseHistorique, DepensesV2, GeneralLedger, Tresorerie, Reporting, ParametresFinance.
- **Contacts, RH, admin:** Tiers, TiersDetail, ClientAnalytics, Employes, Payroll, UserManagement, CompanySettings, AuditLog, Dashboard.

Out of scope: new features, VAT, backend business rules (except a defect that breaks a screen), a logo redesign (recommendations welcome).

## 6. Severity scale

| Level | Meaning | Gate effect |
|---|---|---|
| **Blocker** | A user cannot finish a task, is misled about money/stock, or is locked out (incl. WCAG A failure on a core flow) | Gate cannot sign off |
| **Major** | Task succeeds but with real friction, inconsistency a user will notice, or WCAG AA failure | Gate cannot sign off |
| **Minor** | Polish, local inconsistency, nice-to-have clarity | Allowed at sign-off if logged in the backlog |
| **Nit** | Taste-level | Never blocks |

## 7. Sign-off gates

Every gate reviews the **rendered** product (screenshots of the real app against a seeded database, both themes, both widths) plus the source. A gate signs off when it has no open Blocker or Major.

**Visual design gate** (UI Designer + UI Finish-Gate Reviewer)
- Colours come only from tokens; status ramps for status, `chart-*` for categories; light and dark both deliberate.
- One page shell: one gutter and max-width rule, `PageHeader` on every page, one primary action per header.
- Consistent type scale, numeric alignment (`tabular-nums`, right-aligned amounts), card and table rhythm.
- No clipping, overlap or horizontal page scroll at 390 px; nothing broken at 1366 px.
- Status badges and text meet contrast (≥ 4.5:1 text, ≥ 3:1 UI parts) in both themes.

**Copy gate** (Brand Guardian)
- Sentence case everywhere, glossary respected, FCFA never XOF, French typography (’ « » …).
- Buttons start with a verb and name the outcome; confirmations repeat the consequence.
- Empty states orient and offer the next action; error messages say what happened and what to do.
- No English, no raw technical strings, no duplicated or contradictory labels for one concept.

**Usability gate** (UX Researcher + Persona walkthroughs)
- Each persona's top jobs (§2) can be completed from the navigation without dead ends, with feedback after every action and recovery from errors.
- Navigation groups match how roles think about their work; each role sees only what it can use.
- Lists can be searched/filtered the way the role needs; destructive or financial actions are confirmed with the consequence named.

**Accessibility floor** (UX Architect; enforced inside all three gates)
- axe-core (WCAG 2.0/2.1/2.2 A + AA rules): zero serious/critical violations on every captured screen, both themes, both widths — or a documented false positive.
- Keyboard: every action reachable, visible focus, skip link, dialogs trap and restore focus.
- Forms: real labels, errors linked with `aria-describedby`, correct `inputMode`.
- Targets ≥ 24×24 px everywhere, ≥ 44 px for primary actions on mobile.

## 8. Evidence and process

1. **Capture** — headless Chromium renders every route against a disposable seeded database (real backend, not mocks) in light/dark × 1440/390, runs axe-core and records console/API errors.
2. **Audit** — the team reviews in parallel by discipline; findings carry page, evidence, severity and a concrete fix.
3. **Consolidate** — one ranked backlog with file ownership so fixes do not collide.
4. **Fix** — shared primitives first, then pages by domain.
5. **Re-capture and gate** — each gate re-reviews; open Blockers/Majors go back to step 4. Loop until all three gates sign off.

Results and the sign-off record: [SIGNOFF-2026-10-23.md](SIGNOFF-2026-10-23.md).
