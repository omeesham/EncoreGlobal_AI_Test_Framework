---
module: left-panel-basic-information
surface: Location Settings → Basic Information → left card (location attributes)
baselineSite: https://navigator2.training.psav.com/#/setup/locationdetail/1604
observedSite: https://cloudapps-e2e.encoreglobal.com/navigator/ (resolved in Phase 1)
office: 1604 (The Parker Palm Springs)
MCP_Session_Date: 2026-06-03
MCP_Session_Tool: playwright-cli (state-load bridge from e2e MS-SSO session)
baselineScope: baseline-present (old-site has the location-attributes card)
identity: HUNTER
---

# Old-Site Baseline — Left Panel (Basic Information), office 1604

Observation-only per LR-ENC-001 (old UI = Angular Reactive Forms + PrimeNG + Bootstrap 3,
selectors are `name=`/`id=`, ZERO data-testid parity — visited to understand INTENT, not to
reuse selectors). SSO bridged from the refreshed e2e session (no separate nav2 login).
Evidence: AX snapshot `.playwright-cli/page-2026-06-03T09-37-12-634Z.yml` (full capture
`.playwright-cli/nav2-leftpanel-full.txt`, 679 lines).

## 1. Access

nav2 `/#/setup/locationdetail/1604` is ONE URL with embedded top-tabs **Basic Information**
+ **Location Management History** (architectural divergence per LR-ENC-001 — new-site splits
into `/settings/location` + `/settings/local-office`). Page settled past the
`/login/exp/|setup|locationdetail|1604` SSO-entry to the detail page (stable across 3 polls).

## 2. Left-panel field roster (observed states, top→bottom)

| # | Field | Old-site control | State | Value observed |
|---|---|---|---|---|
| 1 | Office | textbox | **disabled** | 1604 |
| 2 | Local Office | textbox | **disabled** | 1604 |
| 3 | Local Office Name | textbox | editable | "The Parker Palm Springs" |
| 4 | Active | checkbox | editable | **checked** |
| 5 | Live Date | textbox | editable | **05/12/2007** |
| 6 | Tax Mode | combobox | editable | 2 options, 2nd selected |
| 7 | GL Service Divisions | combobox | editable | 7 options, 3rd selected — *old-site-only* |
| 8 | Country | combobox | editable | 4 options, 4th selected (USA) |
| 9 | Region | combobox | editable | ~59 options (selected ≈ pos 42) |
| 10 | Servicing Branch Office | combobox | editable | ~215 options |
| 11 | Line Of Business | combobox | **disabled** | "Encore" (+ disabled text field) |
| 12 | Pay To Address | clickable label/link | n/a | (link, not a value field) |
| 13 | Union | checkbox | editable | **unchecked** |
| 14 | eCommerce Active | checkbox | **disabled** | checked |
| 15 | Enable Productions Orders | checkbox | **disabled** | checked |

(15 controls observed on old-site; the new-site plan enumerates 14 — the delta is
GL Service Divisions [present old, to-confirm-absent new] vs Pay To Address counted as a
field on new-site. Reconciled in Phase 1.)

## 3. Dropdown option counts (old-site, baseline cross-reference)

- Tax Mode: **2** (matches plan's claimed 2)
- Country: **4** (matches plan's claimed 4)
- Region: **~59** (matches plan's claimed 59 — exact count to be enumerated on new-site)
- Servicing Branch Office: **~215** (matches plan's claimed 215; LR-025 large dropdown)
- GL Service Divisions: 7 (old-site-only — not in new-site scope)
- Line Of Business: disabled on old-site → option count not enumerable here

## 4. Save-disable behavior (intended)

The top "Save" button renders **`[disabled]`** on a pristine form (snapshot line 21). Confirms
the intended invariant: Save is disabled until the form is dirtied — matches the new-site
shared left-panel Save-disable expectation (TC-LOC-LP Save enable/disable cases).

## 5. Country cascade (intended behavior)

The plan states Country change clears Tax Mode + Region and disables Save on TaxModeID=0, with
cross-tab effects (Job Costing USA-only, Remit PST Tax Canada-only). On old-site, Country=USA
(4th option) with Tax Mode populated and Region populated is consistent with that model. The
cascade is **NOT mutated here** (observation-only; mutating a shared training office would leak
state) — it is verified live on the new-site in Phase 1 under `ensureDefaultState` cleanup.
Cross-tab anchors visible on old-site: `Enable Job Costing` [checked][disabled] (e340),
`Remit PST Tax` [unchecked] (e301) — consistent with USA (Job Costing on, PST off).

## 6. Baseline diff (each divergence classified a/b/c)

| ID | Divergence (old-site → plan/new-site claim) | Class | Disposition |
|---|---|---|---|
| BL-DIV-1 | Live Date = **05/12/2007** on old-site 1604; 24-TC MD claims "May 8 2007" | (a) candidate regression OR stale-MD | RESOLVE in Phase 1 — capture new-site 1604 Live Date as truth; the MD value is likely stale doc, not an app regression |
| BL-DIV-2 | Line Of Business **disabled** on old-site (="Encore"); plan claims editable, 3 options on new-site | (b) intentional UX change (likely) | CONFIRM editable + enumerate 3 options on new-site Phase 1; if disabled on new-site too, plan claim is wrong |
| BL-DIV-3 | **GL Service Divisions** field present on old-site (7 opts) but absent from new-site 14-field plan | (b) intentional UX change / removed | CONFIRM absent on new-site Phase 1; if absent → out of left-panel scope (no TC) |
| BL-DIV-4 | Pay To Address = clickable link on old-site vs read-only field on new-site | (b) intentional UX change | new-site read-only field per plan; observe render in Phase 1 |
| BL-DIV-5 | Tax Mode (2) / Country (4) option counts | — (no divergence) | counts MATCH plan — positive baseline confirmation |

No `(c) baseline-absent` items for the core left-panel fields (the card exists on old-site).

## 7. Scope note

Old-site is observation-only truth-for-intent. Automation stays on the new site. The new-site
field inventory (Phase 1) is the selector/state truth; this baseline resolves intent ambiguities
(Save-disable, cascade, which fields are editable) and flags the 5 divergences above for
explicit resolution before TC authoring.
