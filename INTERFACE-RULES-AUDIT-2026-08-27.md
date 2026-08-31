# Interface Rules Audit — 2026-08-27

Audit of `frontend/src` against the new rulebook in [frontend/CLAUDE.md](frontend/CLAUDE.md) (adapted from interfaces.dev). **Report only — nothing implemented yet.** Six parallel domain audits: animation, typography, colors/tokens, accessibility, layout/polish, FR microcopy.

Legend: 🟥 violation · 🟡 partial · ✅ compliant

## Executive summary

The high-leverage insight: **most violations concentrate in ~8 shared primitives and 1 config file**. Fixing those fixes the whole app at once; only a minority of findings require page-by-page sweeps.

| Domain | Status | Headline |
|---|---|---|
| Animation | 🟡 | 6 `transition-all`, no press feedback on any button, no theme-switch transition kill, list-row hover animated at primitive level |
| Typography | 🟥 | No font smoothing at root, 21/47 money files lack tabular-nums, fonts from Google CDN (no .woff2 self-hosted), ASCII punctuation dominates 40:1 |
| Colors/tokens | 🟡 | **`primary` 50–900 ramp is hardcoded hex in tailwind.config — not theme-aware** (silent bug); 173 raw primitives in 12 files; 1 `dark:`-on-ramp regression |
| Accessibility | 🟡 | `inputMode` absent on 25+ numeric inputs, form errors not wired to `aria-describedby`, 10 unlabeled icon buttons, 24px touch targets |
| Layout/polish | 🟡 | **CaisseV2 has no horizontal page padding (bug)**; 6 competing page shells, 7 max-widths; ~15 same-radius nesting sites; 0 image outlines |
| FR microcopy | 🟡 | Systematic Title Case vs sentence case mix (~30 strings, 14 pages); ~45 bare empty states; 6 generic "Confirmer" on consequential actions |

---

## P0 — Actual bugs — ✅ **EXECUTED 2026-08-27**

All six landed. Verification: `tsc -b` clean · `npm run lint` 0 errors (465 pre-existing `no-explicit-any` warnings) · `npm test` 79/79 (was 75/75; +4 new) · `npm run build` clean · built CSS inspected to confirm the ramp resolves through vars.

1. ✅ **`tailwind.config.js:36-37` — `primary` shades 50–900 hardcoded hex.** `DEFAULT`/`foreground` were CSS vars but the numbered shades were static blues, so `bg-primary-500`/`text-primary-700` rendered identically in dark mode. **Fixed:** `primary` now goes through `semanticRamp("primary")`; `--primary-50..900` added to `:root` and inverted in `.dark` (index.css). Light values reproduce the old hex **exactly** at 50/100/200/500/600/700/900 — zero light-mode visual change — with 300/400/800 filled in to make the ramp monotone. Verified in the built CSS: no `#1d4ed8`/`#1e3a8a`/… remain and all four emitted utilities resolve via `hsl(var(--primary-N))`. Only 3 call sites existed (`types/index.ts:155,157`, `GeneralLedger.tsx:70`), so blast radius was small.
2. ✅ **`pages/CaisseV2.tsx:503`** — `container mx-auto py-6` had no horizontal padding. Now `container mx-auto p-3 sm:p-6 max-w-7xl`, matching the majority page shell.
3. ✅ **`pages/Dashboard.tsx:139`** — `dark:bg-warning-100` + `dark:hover:bg-warning-200` double-inverted an already-inverted ramp. Now `bg-card … hover:bg-warning-100` with no `dark:`; the stale `bg-white` became `bg-card`. Comment rewritten so the next reader doesn't re-add the variant.
4. ✅ **`pages/DevisDetail.tsx:239`** — `bg-gray-200 text-gray-700` → `bg-muted text-muted-foreground`.
5. ✅ **Icon overlays swallowing clicks — wider than first reported: 21 sites across 16 files**, not 4. Only `money-input`, `Employes`, `GeneralLedger`, `Tiers` were already correct. All 21 fixed by script (guarded to skip any className already carrying the class; verified no duplicates). Files: DocumentListPage, DocumentPicker ×2, TiersPicker ×2, Commandes ×3, CommandeDetail ×2, DemandeForm, DemandesList, Inventaire, FacturesFournisseur, NouveauDevis, NouvelleFacture, NouveauBonLivraison, Reporting, Receptions, Relances, StockTransfers.
6. ✅ **Two hand-rolled drawer backdrops** (`Commandes.tsx:660`, `CommandeDetail.tsx:598`). These were slide-in sheets — always mounted, translated off-screen — with **no focus trap, no Escape, and no scroll lock anywhere in the app**. **Fixed by adding a real primitive:** [`components/ui/sheet.tsx`](frontend/src/components/ui/sheet.tsx), built on Radix Dialog (`cva` side variants top/right/bottom/left, `showClose` opt-out so a drawer with its own header close button doesn't get two). Both catalog drawers converted; the `<h3>`/`<p>` header became `SheetTitle`/`SheetDescription`, so the drawer is now a properly named dialog. Visual design preserved 1:1. Covered by [`sheet.test.tsx`](frontend/src/components/ui/sheet.test.tsx) — 4 tests asserting accessible name/description, Escape closes, `SheetClose` closes, focus moves inside and the background leaves the a11y tree.

**Follow-on note:** `ui/sheet` now exists as the canonical drawer primitive. Any future side panel should use it rather than a hand-rolled `fixed inset-0`.

---

## P1 — Primitive-level fixes — ✅ **EXECUTED 2026-08-27**

Verification: `tsc -b` clean · lint 0 errors (465 pre-existing `any` warnings) · **84/84 tests** (was 79; +5 new) · build clean · emitted CSS inspected for every new utility. **Not visually verified** — no Chrome extension was connected to this session, so a light/dark eyeball pass on Dashboard, a list page, a detail page and a form page is still owed, mainly for the Card padding change.

One bug caught during verification: `active:scale-[0.97]` was first paired with `transition-[…,scale]`, which emits `transition-property: …,scale`. Tailwind 3 compiles `scale-*` into the **`transform`** property, so nothing animated. Corrected to `transition-[…,transform]` and re-verified in the built CSS.

Below, each item marked ✅ with what actually shipped.


### `components/ui/table.tsx`
- ✅ **`TableCell`** — `tabular-nums` added to the base. Closes most of the tabular-nums gap in one edit; the 21 files that rendered money without it (Dashboard 23 call sites, TiersDetail 20, FactureDetail 18, CaisseV2 17) inherit it for free wherever the money sits in a table cell. **Residual:** figures rendered *outside* tables — notably the live 2xl KPI at `Dashboard.tsx:436` — still need `.num` per call site; that stays in P2.
- ✅ **`TableRow`** — `transition-colors` dropped, hover colour kept. Fixes animated row hover on every list page at once.

### `components/ui/responsive-table.tsx`
- ✅ **`DataCard`** — same `transition-colors` removed from the interactive card.
- ✅ **`DataCard` title** — now sets the native `title` attribute when the title is a string, so the truncated value stays reachable.
- ✅ **`DataCardRow` value** — same `title` treatment, plus `tabular-nums` (the mobile counterpart of the TableCell fix; these cards *are* the table on small screens).

### `components/ui/button.tsx`
- ✅ Press feedback added: `active:scale-[0.97]` with `transition-[color,background-color,border-color,opacity,transform] ease-out`. **See the note above** — `transform`, not `scale`, is the property that actually animates under Tailwind 3.
- ⏭️ **Sizes deliberately left alone.** `default` h-9 (36px) and `icon` 36×36 are above the 24px WCAG 2.2 floor but under the 40px desktop guidance. Raising them shifts every button and toolbar in the app — that's a design decision, not a defect fix, so it doesn't belong in a hardening batch. The genuinely bad targets (24×24 quantity steppers in `DemandeForm.tsx`) remain queued in P2.

### `components/ui/badge.tsx`
- ✅ `whitespace-nowrap` added — long FR statuses no longer wrap inside the pill.
- ✅ `focus:` → `focus-visible:`.

### `components/ui/select.tsx` + `dialog.tsx`
- ✅ Both switched to `focus-visible:` — the ring no longer flashes on mouse click.

### `components/ui/page-header.tsx`
- ✅ h1 gets `text-balance`; description gets `text-pretty max-w-prose` (also closes the "no measure cap anywhere" finding for every page description). Icon got `shrink-0` so a long title can't squash it.

### `components/ui/card.tsx`
- ✅ `CardHeader`/`CardContent`/`CardFooter` → `p-4 sm:p-6` (content/footer keep their `pt-0` at both breakpoints). Cards on a `p-3` mobile page no longer have more inner padding than the page has outer, and small screens gain 16px of usable width. Page-level overrides still win via `twMerge` — covered by a test.

### `components/ui/confirm-dialog.tsx`
- ✅ **`confirmLabel` is now a required prop** and the `'Confirmer'` fallback is gone. A scan of all 31 `confirm()` call sites found **zero omissions**, so this was a zero-breakage change that permanently removes the footgun — the type system now refuses a confirmation dialog without a consequence-bearing label.
- ✅ The 3 surviving generic `'Confirmer'` labels fixed while there: `CommandeDetail.tsx:230` and `Commandes.tsx:266` → `Marquer comme expédiée`; `Devis.tsx:61` → `Confirmer le devis`. (The audit listed 6; the other 3 — `DevisDetail.tsx:171/298`, `DemandeDecisionDialog.tsx:229` — are plain buttons inside their own dialogs, not `useConfirm` sites, so they stay in the P2 microcopy sweep.)

### `index.css`
- ✅ **body** — `-webkit-font-smoothing: antialiased` + `-moz-osx-font-smoothing: grayscale` added once at the root.
- ✅ **`[data-theme-switching]`** rule added to kill transitions during the theme flip (see ThemeContext below).
- ❌ **Correction to the audit:** the claim that there is "no radius ladder" was **wrong**. `tailwind.config.js:88-93` already derives `sm`/`md`/`lg`/`xl` from `--radius`. So the concentric-radius vocabulary exists today and P2 is *not* blocked on adding one — nested boxes just need to step down (`rounded-lg` outer → `rounded-md`/`rounded-sm` inner).
- ⏭️ Reduced-motion block still sets durations only, not `animation-name: none`. Minor, left as-is.

### `lib/ThemeContext.tsx`
- ✅ Both toggle paths (explicit choice and the OS media listener) now go through one `applyTheme()` that stamps `data-theme-switching` on `<html>`, flips the class, forces a reflow, then clears the attribute on the next frame. The page switches in one step instead of ~200ms of every element cross-fading independently.
- ✅ **Pre-paint theme script** added to `index.html` — dark-mode users no longer get a white flash on every load, since the class was previously only applied in a `useEffect`. Wrapped in try/catch for private browsing.

### `index.html` — fonts
- ✅ **Self-hosted.** Inter **variable** woff2 (weights 100–900) downloaded to `public/fonts/`, latin + latin-ext subsets with the upstream `unicode-range` declarations (latin-ext matters for French). `@font-face` moved into `index.css`; both Google Fonts `preconnect`s and the stylesheet `<link>` removed; `preload` added for the latin file since the font is otherwise discovered only at the second hop (HTML → CSS → woff2).
- Net effect: 4 static CDN weights → **2 local files, 133 KB total** (48 KB latin + 85 KB latin-ext), no third-party origin, and the PWA now keeps its typeface offline. Verified in `dist/`: fonts emitted, zero `googleapis`/`gstatic` references remain.

---

## P2 — Page sweeps — 🟡 **MOSTLY EXECUTED 2026-08-27**

Verification: `tsc -b` clean · lint 0 errors (466 pre-existing `any` warnings) · **84/84 tests** · build clean · emitted CSS inspected for the new categorical tokens.

**Done:** colors (all 173 raw primitives and all 79 `dark:` variants eliminated), accessibility (41 `inputMode`, all 28 form-error wirings, icon labels, hit areas, focus rings), microcopy casing (34 strings + 3 test assertions), ellipsis (61), truncation titles, `break-words`.

**Not done — carried forward** (see the new "P2 — remaining" section at the end): `<PageShell>` extraction, empty-state copy, concentric radius nesting.

Two corrections to the audit's own numbers surfaced while executing: the icon-overlay bug was **21 sites, not 4**, and the generic-`Confirmer` count was **3 `useConfirm` sites, not 6** (the other 3 are plain buttons in their own dialogs).



### Colors — 173 raw primitives, 12 files, 3 recurring patterns
Full counts: TiersDetail 48, DepensesV2 33, Tiers 26, CaisseV2 13, FactureDetail 12, TiersPicker 12, Dashboard 8, CaisseAudit 8, GlobalSearch 6, types/index.ts 4, DevisDetail 2, Inventaire 1. Killing three patterns removes most of it:
1. **Client/Fournisseur badge** (blue/orange + manual `dark:`, ~10 duplicated sites across Tiers/TiersDetail/TiersPicker) → extract one component on `info`/`warning` ramps. Also removes ~⅓ of the 76 suspicious `dark:` uses.
2. **Payment-method color maps — two competing sources**: `types/index.ts:159-162` (half-migrated: pink/cyan/orange/yellow raw) vs `DepensesV2.tsx:88-95` (fully raw teal/blue/pink) + `CaisseAudit.tsx:35-36`. Reconcile into one ramp-based map.
3. **Raw gray** → `muted`/`muted-foreground`: `CaisseV2.tsx:553-554`, `FactureDetail.tsx:445`, `Inventaire.tsx:1232` (+ P0 item 4).
Also: `TiersDetail.tsx:399` raw purple button; `GlobalSearch.tsx:185-190` six raw icon hues, no dark variants (single `text-muted-foreground` may suffice); `Dashboard.tsx:688-696` raw colors inside config objects.
Low priority: 18 hex literals in `print-layout.tsx:203-348` are defensible (print = light-on-white), but `CommandeDetail.tsx:712` has a print rule leaking outside print-layout — move it.

### Animation
- `transition-all` ×6: `Commandes.tsx:766,779,792` (hover cards, also shadow+translate hover animation), `CommandeDetail.tsx:286`, `Dashboard.tsx:89` (progress bar → `transition-[width]`), `PaymentStatusBar.tsx:91` (same).
- 0 `motion-safe:` anywhere — the global reduced-motion block covers the letter of the rule; the infinite decorative pulses (`CommandeDetail.tsx:251,253` status stepper, `CaisseV2.tsx:605` status dot) and `shimmer` keyframe deserve explicit `motion-safe:` guards.

### Accessibility
- **`inputMode` — 1 occurrence repo-wide** (`ui/money-input.tsx:32`). 25+ `type="number"` price/qty inputs lack it: NouvelleFacture 673, NouveauDevis 568/590, NouvelAvoir 284/298, NouveauBonLivraison 387/400/413, Inventaire 840/986/1017/1046, FacturesFournisseur 478/486… Prices → `inputMode="decimal"`, quantities → `"numeric"`.
- **Error wiring**: RHF pages render errors as `<p role="alert">` with no `id`, so `aria-invalid` points at nothing. Affected: NouvelleFacture, NouveauDevis, NouvelAvoir, NouveauBonLivraison, DemandeForm, ChangePassword, Login. `Tiers.tsx:412+` already has the correct conditional `aria-describedby` pattern — copy it. Also no focus-move to first invalid field anywhere.
- **10 unlabeled icon buttons**: Comptabilite.tsx:573, DemandeForm.tsx:480/489/571/581/610, Payroll.tsx:249/331, TiersDetail.tsx:403/738 (three rely on `title` only — not a reliable accessible name; inner icons are `aria-hidden` so they announce as empty).
- **Hit areas**: DemandeForm qty steppers `h-6 w-6` = 24×24px (high-frequency touch targets at the WCAG floor); TiersDetail.tsx:738 same; `h-7`/`h-8` call sites listed in audit.
- **Unlabeled line-item inputs**: prix_unitaire/remise in NouvelleFacture.tsx:672/721, NouveauDevis.tsx:567/589 (qty at :630 has `aria-label` — extend the pattern). `ParametresFinance.tsx` 3 `htmlFor` vs 8 inputs — verify.
- `role="alert"` on whole error cards (9 detail pages + `query-state.tsx:64`, `DocumentListPage.tsx:527`) — scope to message text.
- Weak focus rings: `focus:ring-primary/20` (DocumentPicker:149, TiersPicker:121), `focus:ring-1` (NouveauDevis:576/602, NouvelleFacture:681/732).
- ✅ Already good: skip link (`Layout.tsx:33-38`), no positive tabindex, no paste blocking, no aria-hidden-on-focusable, 172 aria-labels baseline.

### Microcopy (FR)
- **Capitalization — biggest volume item.** Title Case vs sentence case coexist for the same concepts (`Nouvelle Facture` in Factures/NouvelleFacture/Dashboard vs `Nouvelle facture` in FacturesFournisseur). ~30 strings, 14 pages: Dashboard 371/406, Commandes 360/612/751/758, CommandeDetail 371/916/920/931/952, BonsLivraison 134, Factures 174/214, NouvelleFacture 345, NouveauDevis 341, NouveauBonLivraison 192, DemandesList 185/197, Reporting 229/523/553/571, ClientAnalytics 91/173, StockValuation 91/135, StockTransfers 476, DepensesV2 456. **3 test assertions must be updated too**: NouvelleFacture.test.tsx:73, Dashboard.test.tsx:103/127.
- **Generic "Confirmer" on consequential actions** ×6: worst is `DemandeDecisionDialog.tsx:229` — destructive-styled button, label carries zero consequence (should be `Refuser la demande`/`Approuver la demande`). Others: CommandeDetail.tsx:229, Commandes.tsx:265, Devis.tsx:61, DevisDetail.tsx:171/298.
- **Empty states**: ~45 bare one-liners (list in audit output); `QueryState.emptyAction` exists but is used by zero pages — dead capability. `DocumentListPage` (filtered vs empty + create action, `Avoirs.tsx:285-289`) is the model. Also recurring tic: descriptions that echo the title instead of offering the next step.
- **Toggles**: `Employes.tsx:202-204,235` — negative framing, no object (`'Désactiver'` bare).
- `StockTransfers.tsx:554` — «Cliquez "Ajouter ligne"…» click-centric + straight quotes → rewrite with real action button.
- ✅ Clean: verb-first buttons, no Oui/Non, no "Cliquez ici" links, vouvoiement consistent, one-word-per-flow (minor: `Retour` doubles as cancel label in 4 confirms where the rest of the app uses `Annuler`).

### Layout
- **Page shells — 6 competing patterns across 49 pages** (17× `p-3 sm:p-6`, 6× `container mx-auto p-6`, 4× bare `p-6`, 1× no x-padding (P0), 5× none at all, misc). Mobile gutter is 12px or 24px depending on page. **7 different max-widths** (full/3xl/5xl/6xl/7xl/unbounded/container). Fix: extract one `<PageShell>` component — also already tracked in CLAUDE.md as "page-shell padding drift".
- **Concentric radius**: ~15 same-radius nesting sites (`rounded-lg` box with padding inside `rounded-lg` Card): Dashboard 590/594/598/708/1030/1142/1181, CaisseV2 896/924, DemandeForm 563, CommandeDetail 659, Commandes 714, DepensesV2 465/485, CompanySettings 290; triple-nesting at CompanySettings 225/234 (scrim re-declares outer radius). Blocked on the radius ladder (P1).
- **Fixed widths on text containers**: `CaisseV2.tsx:521` / `DepensesV2.tsx:385` SelectTriggers at `w-[200px]`/`w-[220px]` holding variable store names (use `Comptabilite.tsx:256`'s `w-auto min-w-[200px]` pattern); CommandeDetail has two inconsistent column-width sets for the same table (:502-507 vs :958-962).
- **break-words near-absent** (7 occurrences, 2 files): unprotected mono refs + emails on FactureDetail 393/398/406/440, AvoirDetail 157/162/168/199, CommandeDetail 395/887, TiersDetail 415.
- **Truncation without `title`**: ~37 of 42 sites; priorities: responsive-table:78 (P1), DocumentPicker 103/106/107/180/182 (doc numbers), AttachmentPanel:113 (filenames), NotificationBell:125, Topbar 102/111/112.
- `max-w-prose`: 0 occurrences — apply to long descriptions/notes rendering.

---

## P2 — remaining (not executed)

Three items were left, deliberately, because each needs judgment per site rather than a mechanical sweep:

1. **`<PageShell>` extraction — 49 pages, ~20 distinct root shells.** Measured distribution: `container mx-auto p-6` ×7, `p-3 sm:p-6 w-full space-y-6` ×6, `p-3 sm:p-6 w-full` ×5, `container mx-auto px-4 py-6 max-w-7xl` ×4, plus a long tail. Seven different max-widths. The blocker isn't volume, it's that many of these root `<div>`s are shared with early-return loading/error branches in the same component, so a blind find-replace would restyle those too. Each page needs its outermost return identified. The `CaisseV2` missing-padding bug (the one that actually broke) was already fixed in P0.
2. **Empty states — ~45 bare one-liners.** `QueryState` already accepts `emptyAction` and **no page passes it**; `DocumentListPage` has the model implementation (filtered vs truly-empty + a create action, see `Avoirs.tsx:285-289`). This is copywriting for 45 distinct contexts, not a sweep — each needs a next action that makes sense for that screen.
3. **Concentric radius — ~15 nested sites.** Unblocked (see the correction in P1: the radius ladder already exists), but each site needs the inner radius chosen against its own padding.

Also still open from the audit's own list: the page-level `role="alert"` containers on the detail pages (`AvoirDetail`, `BonLivraisonDetail`, `CommandeDetail`, `DemandeDetail`, `DevisDetail`, `FactureDetail`) — the shared `QueryState` and the form-field case are fixed, these six hand-rolled ones are not.

## P3 — Deliberate deferrals

- **Logical properties**: 241 physical sites (`mr-2` ×67 icon spacing, `pl-8/9/10`+`left-3` search-icon pattern), 0 logical. App is FR-only LTR, no RTL plan → zero-risk codemod, no present bug. Do opportunistically or as one sweep.
- **Smart punctuation**: ASCII `'` beats `’` 277:7; 53 literal `...` vs `…` (Topbar says `Rechercher…`, CommandeDetail says `Rechercher...`); « » unused. Mechanical sweep; pairs well with the capitalization sweep since both touch the same strings.
- **Image outlines**: only 3 `<img>` sites, 0 treated. `CompanySettings.tsx:227` (user-uploaded logo) is the textbook case; `Sidebar.tsx:112` next. Also: `pbd-logo` class in print-layout:102 has no found definition — verify.
- **`animate-in` Radix entrances** (~10 sites) — fine as-is; optionally `motion-safe:`.
- Print-CSS gray hex consolidation.
- Status-badge icons for `devis`/`bl`/`avoir` types (labels always present, so no color-alone failure — redundancy gap only).

---

## Suggested execution order

1. **P0 batch** (~1 session): 6 items, all small.
2. **P1 primitives batch** (~1 session): table.tsx, button.tsx, badge.tsx, select.tsx, page-header.tsx, card.tsx, index.css body+radius ladder, ThemeContext transition-kill, confirm-dialog default. Visual diff review recommended after — primitives touch everything.
3. **Fonts self-host** (small, isolated).
4. **P2 sweeps**, one domain per session: colors (3 patterns), a11y (inputMode + error wiring first), microcopy (capitalization + ellipsis + punctuation in one string-sweep), layout (`<PageShell>` extraction, then radius nesting).
5. **P3** opportunistically.

Verification per batch: `npm run lint` + `npm test` (3 test assertions break on the casing sweep: NouvelleFacture.test.tsx:73, Dashboard.test.tsx:103/127) + manual light/dark pass on Dashboard, a list page, a detail page, a form page.
