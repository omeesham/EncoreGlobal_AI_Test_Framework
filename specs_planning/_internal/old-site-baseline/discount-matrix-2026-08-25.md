---
module: discount-matrix
date: 2026-08-25
identity: HUNTER
baselineScope: complete (CRT + RWP + LOA all captured)
scope: CRT (Search Criteria) · RWP (Region Weekly Peaks) · LOA (Location Activation)
out_of_scope: CMX (Company Matrix) — owned by NM-3343
old_site: https://navigator2.training.psav.com/#/setup/DiscountPricing/matrix
new_site: https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/settings/discount-matrix
offices_observed: [1604, 1101]
jira_tickets: [NM-3530, NM-3485, NM-3475, NM-3441, NM-3440, NM-3435, NM-3391, NM-3294, NM-3293, NM-3275, NM-3256, NM-3253, NM-3238, NM-3234, NM-3232, NM-3230, NM-3229, NM-3062]
evidence: .playwright-cli/dsm-2026-08-25/ (nav2-baseline.yml, landing.yml, crtA.yml, rwp.yml, loa2.yml, loa-1101-p1.yml)
Observation_Only: true
Walk_Authorization: owner-authorized bounded observation walk, 2026-08-25 — one non-mutating tab click per tab on the old site, no typing, no Select, no Save (PLAN_NM3530_DISCOUNT_MATRIX_COVERAGE_QUICK Phase 0.3); machine enumeration of nav2 was not authorized, so no coverage manifest exists by design (keys added 2026-08-28 per SUBPLAN_GUARDRAIL_CX_GATE_DEFECTS Defect 2)
---

# Old-site baseline — Discount Matrix

**Observation only.** No clicks, no typing, no saves were performed on the old site. Old-site state
is untouched.

## Route correction (plan lead was wrong)

The plan named the legacy route `/setup/discount-pricing/matrix`. That path redirects to `#/` — it
does not exist. The real route is **case-sensitive**: `#/setup/DiscountPricing/matrix`, discovered by
reading the nav anchors from the DOM. The sibling `#/setup/DiscountPricing/settings` also exists
(Discount Optimization Settings — a separate un-intaken surface, out of scope here).

## Counterpart status: EXISTS

The old site carries a direct counterpart. Structure observed:

| Zone | Old site (nav2) | New site (e2e 1604, 2026-08-25) |
|---|---|---|
| Criteria bar | `Country:` `Currency:` `Business Tier:` `GAV Discount Threshold:` + `Save` | identical label set + `Save` |
| Criteria controls | 3 × native `<select>` + 1 × `<input type="text">` | 3 × `<button role="combobox">` + threshold control; **no `data-testid` anywhere** |
| Tab strip | Company Matrix · Region Weekly Peaks · Location Activation | identical, same order |
| First grid column group | **`Non-Peak` Booking Windows Days** | same |
| Grid groups | Non-Peak / Standard / Peak Booking Windows Days, each with buckets `0-15 · 16-30 · 31-60 · 61-90 · 91-180 · 181-365 · 365 +` | same |
| Grid toolbar | `Add`, `Export`, `Import` | `Add Tier`, `Export`, `Import` |

**This resolves the plan's occluded group.** The plan's Context table recorded the first column group
as unreadable ("occluded by the open Setup menu ending in `… Windows Days`"). The baseline shows it is
**Non-Peak Booking Windows Days**.

## Baseline diff

1. **Criteria controls: native form elements → custom buttons.** Old site uses `<select>`/`<input>`;
   new site uses `<button role="combobox">` whose accessible name is its *value* (`United States`,
   `USD`, `Standard`) rather than its label. Classification: **(b) intentional UX change** — this is
   the Angular → Next/React platform migration, not a behaviour regression.
   **Consequence for automation, not a defect**: `getByRole('combobox', { name: 'Country' })` cannot
   resolve on the new site. Selector strategy must anchor structurally or by value. Per Encore policy
   this is recorded as a selector/testid constraint and an LR-029 missing-testid finding — **not**
   filed as a bug (markup/accessibility findings are not bug-filed for this client).
2. **`Add` → `Add Tier`** label change on the Company Matrix toolbar. Cosmetic; classification
   **(b) intentional UX change**. Out of this execution's scope regardless (CMX is NM-3343's).
3. **Tab set: no divergence.** Old and new both expose exactly Company Matrix · Region Weekly Peaks ·
   Location Activation. The plan's Phase 6a tab-divergence rule is therefore satisfied for the three
   in-scope codes.

## LOA captured 2026-08-26 — the authorized single tab click, spent

The owner authorization recorded in the plan (one non-mutating tab click, no value edit, no Save)
was spent on the **Location Activation** tab via Playwright CLI (fresh runner auth state loaded
with state-load after the CLI-saved state hit the sign-in redirect). Read-only observations:

| Zone | Old site (nav2, 2026-08-26) | New site (e2e 1604) |
|---|---|---|
| Columns | Location · Workflow Start Date · Active | identical |
| Population | country-scoped listing; leading rows 1101 Corporate Office Encore USA SGA, 1102 Long Beach, 1105, 1107, 1112, 1115, 1117 | same rows, same order |
| Search | a text box above the listing; NO visible framework binding; function NOT driven (typing is outside the one-click grant) | search box with placeholder, accepts input, filters nothing (defect filed) |
| Sort | **no affordance**: headers carry no click handler, no link, default cursor, no sort state | no affordance either — headers expose only resize handles |
| Active cell | plain per-row checkbox (checked/unchecked) | Yes/No label button that opens an inline checkbox editor |

**Baseline diff (LOA additions)**:
4. **Sorting: baseline MATCH.** Neither implementation sorts. The divergence is between the
   ticket wording ("sortable / filterable per legacy behavior") and BOTH implementations —
   classified stale-ticket / open product question, routed to the client-questions channel; the
   not-sortable finding is reclassified from intent-divergence to baseline-match.
5. **Search: affordance inherited from legacy, function unproven on legacy.** The new site adds a
   promising placeholder and an enabled input that does nothing — filed on the new site's own
   promise. Legacy search function stays unknown (not driven).
6. **Active editor: (b) intentional UX change.** Plain checkbox → label-button + inline checkbox
   cycle; platform migration, not a behaviour regression.

## RWP captured 2026-08-26 — second grant (given in chat), spent

The owner granted one more non-mutating tab click in chat and it was spent on the **Region Weekly
Peaks** tab. Read-only, with a settled re-read 8 seconds after the click before recording:

| Zone | Old site (nav2, 2026-08-26) | New site (e2e 1604) |
|---|---|---|
| Grid columns | Week · Start Date · Non-Peak · Standard · Peak | identical |
| Classification | 3 checkboxes per week; live data shows exactly one checked per row | identical contract |
| Week starts | Sundays; 2026 week 1 renders 04-Jan-2026 in the probing machine timezone | consistent in the same context |
| Rendered rows | 27 in the visible scroll window | all 52 painted |
| Year select | 2025 / 2026 / 2027 oldest-first, **resting on 2026** | same set newest-first, **resting on 2027** |
| Region select | same 28-region list, Atlanta first and selected | identical |
| Toolbar at rest | Add Year / Export / Import enabled; Save / Cancel disabled | identical — baseline MATCH for the corrected contract |

**Baseline diff (RWP additions)**:
7. **At-rest toolbar split: baseline MATCH** — the corrected contract (data actions open, edit
   actions closed) is legacy behaviour, not a new-site invention.
8. **Default year + list order: divergence** — legacy rests on the CURRENT year (2026, oldest-first
   list); the new site rests on the NEXT year (2027, newest-first). Same three-year set. Classified
   as an apparent default-policy change, recorded for classification (client can confirm intent),
   not filed as a defect.
9. **One-classification-per-week invariant: corroborated on legacy live data.**

## Historical note — the pre-capture gap record (superseded 2026-08-26)

On the old site the Region Weekly Peaks and Location Activation panels are **lazily rendered**: both
`.tab-pane` elements are present but empty (`innerText.length === 0`, `offsetParent === null`) until
their tab is activated. Reading them therefore requires a **tab click on the old site**, which Phase 2
step 2 forbids ("no clicks") and which the HARD STOP #9 carve-out does not cover (that carve-out is
scoped to opening a picker/dialog and Cancel/Esc, not tab navigation).

- **Impact (was)**: CRT and LOA baselined, RWP not — RESOLVED by the second grant above.
- **Exact unlock (was)**: a second click authorisation — GIVEN in chat and spent 2026-08-26.
  (no value edit, no Save) — or an explicit ruling that tab navigation falls inside the #9 carve-out.
- **Binding consequence until unlocked (HARD STOP #10)**: no RWP or LOA behaviour may be classified as
  a regression-from-baseline, and no RWP/LOA bug may be filed with a `baselineComparison` other than
  `not-checked`.

## Observations

**Bugs/Defects**: none. No old-site interaction was performed, so no behaviour was exercised; the
render-state observations above are markup/platform differences, which are not bug-filed for this
client.

**Suggestions/Improvements**:
- The new site's criteria controls carry no `data-testid` and no accessible name. Adding a testid per
  criteria control would remove the single largest selector-stability risk in this module. Routed per
  the missing-testid report policy, not filed as a defect.
