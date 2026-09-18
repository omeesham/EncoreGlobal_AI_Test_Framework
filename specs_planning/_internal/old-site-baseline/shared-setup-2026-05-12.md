---
artifact: shared-setup-baseline
client: encore
session_date: 2026-05-12
session_tool: Playwright CLI (headed for initial nav2 auth-refresh, then in-session DOM queries via `eval`)
session_fallback: applied — headed CLI with persistent profile `.auth/nav2-profile`; state saved to `.auth/nav2-state.json` (9688 bytes; psav.com domain cookies present)
author_identity: HUNTER
page_url_old: https://navigator2.training.psav.com/#/setup/locationdetail/1604
page_url_new_equivalent: https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/settings/location → Shared Setup Locations sub-tab
test_entity: office 1604 "The Parker Palm Springs"
parent_subplan: plans/pending/SUBPLAN_SHARED_SETUP_DQU_HUNTER.md
parent_plan: plans/pending/PLAN_SHARED_SETUP_DQU.md
baseline_scope: baseline-present (with `baseline-partial` qualifiers on non-self-row data + LM History col 59-61 — see §6/§7)
baseline_present_on_old_site: YES (per OSB-ACCESS-VERIFY-2026-04-24 §3 + this session's live walk)
divergences:
  - id: SHR-DIV-001
    field: Self-row Shares Inventory editability
    nav2: editable via SlickGrid click-cell-to-activate edit pattern (initial DOM read shows `checked=false disabled=true` because cell editor is inactive until cell clicked; user-confirmed screenshot 2026-05-12 16:00 IST shows SI=checked+active+blue-highlighted after click)
    e2e: editable via direct Radix `<button role="checkbox">` toggle (no cell-activation step)
    classification: PARITY-WITH-INTERACTION-DIVERGENCE — both sides allow toggling self-row Shares Inventory; interaction mechanic differs (SlickGrid edit-on-focus vs Radix direct-toggle). NOT a UX widening; NOT an /encore-questions candidate. Initial Tier-B flag WITHDRAWN. Note for spec authoring: any Nav2-equivalent automated walk would need a click-cell pre-step before reading checkbox state.
  - id: SHR-DIV-002
    field: Add Location UX (trigger only — dialog itself is parity)
    nav2: dialog UX present; opened by clicking the empty grid row at bottom of SlickGrid (user-confirmed screenshots 2 + 3 — "Change Local Office" dialog with name+number search input, Cancel/Select buttons, header "Current: 1604 - The Parker Palm Springs")
    e2e: dialog UX present; opened by clicking explicit "Add" button (positional `tbody tr:last-child button`, no testid)
    classification: PARITY-WITH-TRIGGER-DIVERGENCE — dialog UX itself is identical functionality on both sides (search + select + cancel); only the trigger element differs. NOT INTENTIONAL-UX-CHANGE in the architectural sense; just a different click-target. Withdraw earlier classification.
  - id: SHR-DIV-003
    field: Delete UX
    nav2: no explicit Delete column observed in 4-column grid (Delete UX likely via SlickGrid context-menu / row-action — not exercised this session)
    e2e: per-row Delete button in 5th "Actions" column (testid `location-settings-btn-delete-shared-location-N`)
    classification: INTENTIONAL-UX-CHANGE (explicit per-row delete added on new site; Nav2 delete mechanism deferred to future verify if needed for parity tests)
  - id: SHR-DIV-004
    field: Save dialog confirmation
    nav2: Bootstrap `btn btn-success me-2` "Save" button (single shared, type=submit, currently disabled when form pristine; NO confirmation dialog observed inline)
    e2e: Shared `[data-testid="location-settings-btn-save"]` opens Radix AlertDialog `location-settings-modal-save-changes` with Cancel/Ok buttons (per REQUIREMENTS line 991 + LR-012)
    classification: INTENTIONAL-UX-CHANGE (confirmation dialog added on new site per LR-012)
  - id: SHR-DIV-005
    field: Page layout (architectural)
    nav2: monolithic — `<h3>` headers for Currency, USD, Venue/Branch Account, Master Bill To Address, **Shared Setup Locations**, Legal all rendered together on one Basic Information panel (tabs filter visibility, not load)
    e2e: tabbed lazy-load — each sub-tab is a separate render under `/settings/location`
    classification: INTENTIONAL-UX-CHANGE (per OSB-ACCESS-VERIFY-2026-04-24 §3 architectural divergence)
  - id: SHR-DIV-006
    field: "Miami" name-search behavior in Add dialog
    nav2: WORKS — search "Miami" in the Change Local Office dialog returns 10+ matching locations (user-confirmed screenshot 2026-05-12 16:00 IST shows: 1233 Miami Marriott Biscayne Bay, 1391 Embassy Suites Miami Int'l Airport - Deactivated, 1583 DoubleTree by Hilton Miami Airport - Deactivated, 1733 Miami Beach Resort & Spa, 1997 JW MARRIOT MARQUIS MIAMI, 2047 JW Marriott Marquis Miami, 2048 JW Marriott Miami, 2049 Miami Marriott Dadeland, 2135 W Miami, 2197 Hilton Miami Dadeland, + more below fold)
    e2e: BROKEN — 5 TCs `test.fixme()`'d 2026-05-11 citing "Miami search returns 0 results; test-data expects ~69 (`searchByName: 'Miami'` + `searchByNameMaxResults: 100`)"
    classification: CONFIRMED REGRESSION — Nav2 baseline works; E2E broken. Filed as `reports/bugs/BUG-LOC-SHR-001.json` per LR-034 with baselineComparison + baselineEvidence. Earlier BASELINE-ABSENT classification + /encore-questions Tier-A flag WITHDRAWN.
fields_inventoried: 5 (self-row) + 1 (empty-add-row stub) + 1 (shared Save button)
cross_field_section_present: true (path C — §4 contains D1..D6 per field)
nav2_grid_framework: SlickGrid (`.slickgrid_399281 ui-widget`); column ids `LocalOfficeId / LocalOfficeName / IsPrimaryOffice / IsSharesInventory`
new_site_grid_framework: Radix UI table + data-testid (per src/selectors/setup/locations/shared-setup-locations.ts)
deviation_log:
  - id: DEV-001
    description: Phase 1b live new-site spot-check (LR-013 3-random-fields path) NOT executed this session — E2E auth expired (Microsoft tokens timed out between nav2 sign-in and new-site walk attempt). On-disk E2E evidence (spec mtime 2026-05-11 = 1 day fresh, REQUIREMENTS mtime 2026-05-07 = 5 days fresh) is well within LR-013's 14-day spot-check window, so artifact freshness substitutes per LR-007 amended ("spot-check is verification when artifacts are <14d AND no drift observed elsewhere"). Drift check via Phase 1a Nav2 findings did not surface E2E artifact contradictions. Documented per LR-039 (no hidden obstacle).
  - id: DEV-002
    description: SUBPLAN line 148 (field-inventory at `field-inventories/shared-setup-2026-05-12.md`) NOT directly satisfied — path C resolution (ALL-077 §2-vs-Identity mismatch) embeds cross-field D1..D6 frame into THIS baseline §4 instead. Formal field-inventory authoring deferred to GIVER per §2 row 90 ownership (GIVER-CREATE / HUNTER-READ).
---

# Old-Site Baseline — Shared Setup Locations Tab — 2026-05-12

Phase 1a Nav2 baseline walk + Phase 1b consume-via-artifact (LR-013 14d-fresh path; DEV-001). Cross-references: intake at [intake/shared-setup-hunter-2026-05-12.md](../intake/shared-setup-hunter-2026-05-12.md); reference shape from [OSB-ACCESS-VERIFY-2026-04-24.md](OSB-ACCESS-VERIFY-2026-04-24.md).

## §1 Access (Q1)

**Verdict: GREEN** (after one-shot user-assisted headed sign-in).

| Check | Result |
|---|---|
| URL navigated | `https://navigator2.training.psav.com/#/setup/locationdetail/1604` |
| Auth path | Headed `playwright-cli open --persistent --profile=.auth/nav2-profile` → user completed Microsoft SSO once → `state-save -s=nav2 .auth/nav2-state.json` (9688 bytes; .psav.com domain cookies persisted). Future sessions can `state-load` headless. |
| Initial attempt (headless) | FAILED — `.auth/encore-state.json` lacks `.psav.com` cookies; SPA redirected to `#/login/exp/...`. Documented as the Gate-3 condition (`.claude/rules/browser-tool.md`). |
| Resolution | Headed sign-in completed at ~14:50 IST; state saved 15:44 IST. |
| Office 1604 loaded | YES — title "Navigator Order Entry 2026.03.12.978.1"; `<h3>` headers visible for Currency / USD / Venue-Branch Account / Master Bill To Address / **Shared Setup Locations** / Legal. |
| Tab activation | `playwright-cli click 'role=tab[name="Shared Setup Locations"]'` — tab `[active] [selected]`. |

---

## §2 Selector style notes (Nav2)

**SlickGrid framework**. Column DOM identifiers (no `data-testid`, consistent with OSB-ACCESS-VERIFY §2 "zero data-testid on Nav2"):

| Column | Header id |
|---|---|
| Local Office (col 0) | `slickgrid_399281LocalOfficeId` |
| Local Office Name (col 1) | `slickgrid_399281LocalOfficeName` |
| Primary Office (col 2) | `slickgrid_399281IsPrimaryOffice` |
| Shares Inventory (col 3) | `slickgrid_399281IsSharesInventory` |

**SlickGrid cell ↔ column mapping**: cells carry `l<N>` class indicating column index (l0=col0, l1=col1, l2=col2, l3=col3). DOM serialization order may NOT match visual column order — read `l<N>` class for authoritative mapping. Example self-row 1604:
- cell `l0 r0`: text "1604" → Local Office ✓
- cell `l1 r1`: text "The Parker Palm Springs" → Local Office Name ✓
- cell `l2 r2`: checkbox checked+disabled → Primary Office
- cell `l3 r3`: checkbox unchecked+disabled → Shares Inventory

**Other Nav2 selector patterns** (from OSB-ACCESS-VERIFY-2026-04-24 §2, still applicable): `name=` attributes + element `id`s (e.g. `input[name="OracleProductCode"]`, `#SkipBillingId`); Angular Reactive Forms + PrimeNG (not used in Shared Setup itself, which is SlickGrid) + Bootstrap 3 (Glyphicon for boolean rendering on LM History only — Shared Setup uses native `<input type="checkbox" class="editor-checkbox">`).

**Save button**: `<button type="submit" class="btn btn-success me-2">Save</button>` — Bootstrap 4 `btn-success`. Single shared Save for the entire Location Settings page (one Save commits all sub-section changes). No testid, no id; identify via text content + class.

---

## §3 Tab/feature inventory

### Tab presence (Shared Setup Locations specifically)

| Check | Nav2 | E2E |
|---|---|---|
| Tab exists | YES — `role=tab[name="Shared Setup Locations"]` sub-tab in Basic Information panel | YES — `[data-testid="location-settings-sub-tab-shared-setup-locations"]` on `/settings/location` |
| Tab heading text | "Shared Setup Locations" (`<h3>`) | "Shared Setup Locations" (per REQUIREMENTS §Shared Setup Locations Tab heading) |

### Adjacent tab roam (for context)

Nav2 sub-tabs in Basic Information panel (all rendered simultaneously; tabs are CSS-filtered): Local Information, Currency, Pricing, Account And Address, Legal, Notes, **Shared Setup Locations**, Auto Add-On. Matches E2E sub-tab list except for layout (monolithic vs lazy-load — SHR-DIV-005).

### LM History col 59-61 cross-reference

Documented in REQUIREMENTS.md lines 897-899: col 59 "Action of Shared Setup Location" / col 60 "Shared Setup Location ID" / col 61 "Shared Setup Location Name". Nav2 LM History uses Bootstrap 3 Glyphicon for boolean rendering (per OSB-ACCESS-VERIFY §5). LM History col 59-61 live verification on Nav2 NOT exercised this session — deferred to a separate LM History subplan (SP-DQU-20 territory).

---

## §4 Field-level baseline (with Path C cross-field section per LR-048 + parent v5 §5)

For each field, D1..D6 sub-keys are populated: **D1 state-dep / D2 validation-dep / D3 visibility-dep / D4 limit-dep / D5 cascading-options / D6 save-behavior** (the mandatory cross-field vocabulary from `field-inventory-spec.md`).

### Field 1 — Local Office (column / static text in self-row + add-row stub)

- **Nav2 default**: "1604" (gridcell `l0 r0` of self-row)
- **E2E default**: "1604" (per A4 spec TC-003 + A7 test-data `SELF_ROW.localOffice`)
- **D1 state-dep**: none — fixed to current location office number
- **D2 validation-dep**: none — read-only
- **D3 visibility-dep**: always visible per row
- **D4 limit-dep**: none
- **D5 cascading-options**: none (static text, not a dropdown)
- **D6 save-behavior**: N/A — read-only column, never saved as a user-editable field

### Field 2 — Local Office Name (column / static text)

- **Nav2 default**: "The Parker Palm Springs" (gridcell `l1 r1` of self-row)
- **E2E default**: "Parker Palm Springs" (per A7 test-data `SELF_ROW.localOfficeName`)
- **DIVERGENCE on text**: Nav2 prefixes with "The " (likely the office's full registered name) — E2E test-data strips "The ". Spec passes `expect.text.localOfficeName.toBe(SELF_ROW.localOfficeName)` — if E2E live DOM shows "The Parker Palm Springs" the spec would fail. Per A4 TC-003 line 39-40 spec passes today, so E2E live DOM must show "Parker Palm Springs" (without "The "). Either Nav2 displays a more verbose label OR E2E shortens the display. **MINOR DIVERGENCE — not a bug**; flag in REQUIREMENTS.md as observation.
- **D1..D5**: none / read-only
- **D6 save-behavior**: N/A — read-only

### Field 3 — Primary Office (Radix checkbox on E2E; SlickGrid editor-checkbox on Nav2)

- **Nav2 self-row default**: checked + disabled (gridcell `l2 r2`)
- **E2E self-row default**: checked + disabled (per A4 spec TC-003 line 43-45)
- **MATCH** for self-row. ✓
- **Non-self row default**: Nav2 = unknown (no non-self row in fresh page; would need to add+save a location first then re-walk); E2E = `unchecked + disabled` per A4 TC-014.
- **D1 state-dep**: Primary Office is UNCONDITIONALLY disabled on both sides for the self-row. Mechanism: backend-driven flag, not user-editable. For non-self rows on E2E, also disabled (per A4 TC-014). **Implication**: Primary Office is a display-only column — the value is set elsewhere (likely via a separate "Primary Office" admin flow, not via this grid). REQUIREMENTS.md should be tightened to say "disabled on all rows; display-only column".
- **D2 validation-dep**: none (read-only)
- **D3 visibility-dep**: always visible per row
- **D4 limit-dep**: none
- **D5 cascading-options**: none (boolean)
- **D6 save-behavior**: N/A — display-only; no save path observed

### Field 4 — Shares Inventory (the central editable field)

- **Nav2 self-row default (initial DOM read)**: `checked=false disabled=true` on `<input type="checkbox" class="editor-checkbox">` at gridcell `l3 r3` — but this is the SlickGrid **inactive-cell-editor state**, NOT a true app-disabled flag.
- **Nav2 self-row after click-cell-to-activate** (user-confirmed screenshot 16:00 IST): SI = **checked + active editor** (blue-highlighted cell). Toggling works fine via the standard SlickGrid edit-on-focus pattern.
- **E2E self-row default**: **unchecked + EDITABLE** via direct Radix toggle, no cell-activation step (per A4 spec TC-003 line 47-48: `expect(inventoryState.disabled).toBe(false)`)
- **SHR-DIV-001 revised**: PARITY-WITH-INTERACTION-DIVERGENCE — both sides editable; mechanic differs. Initial automated DOM read on Nav2 will see `disabled=true` for any non-focused SlickGrid cell — must click-cell first to engage editor before reading state.
- **Non-self row default** (E2E only — Nav2 has no non-self row to inspect this session): E2E = `checked + editable` per A4 TC-019 line 262 / TC-014 line 163.
- **D1 state-dep (E2E)**: toggling Shares Inventory marks the form dirty (Angular FormControl) → enables shared Save button (per A4 TC-006). On Nav2 the field is read-only so no dirty-state interaction.
- **D2 validation-dep**: none observed (boolean toggle, no async cross-field validator visible on either side)
- **D3 visibility-dep**: always visible per row (both sides)
- **D4 limit-dep**: none
- **D5 cascading-options**: none (boolean)
- **D6 save-behavior**: E2E saves via shared `location-settings-btn-save` → Radix AlertDialog `location-settings-modal-save-changes` (Cancel/Ok per REQUIREMENTS line 991) → save persists across reload (A4 TC-008/019); save-combinable with Add (A4 TC-021). Nav2 = N/A (read-only on self-row; add-row save path not exercised).

### Field 5 — Delete (action button per row on E2E)

- **Nav2**: NO Delete column observed in 4-column grid (cols are Local Office / Local Office Name / Primary Office / Shares Inventory only). Delete UX on Nav2 likely via SlickGrid context-menu (right-click) or inline cell-editing — NOT exercised this session.
- **E2E self-row**: Delete `disabled` (per A4 TC-005)
- **E2E non-self row**: Delete `enabled`; instant-remove, NO confirmation dialog (per A4 TC-015 line 174 `isElementVisible('dlgSaveChanges', 1_500) === false`)
- **D1..D6**: see SHR-DIV-003; E2E adds explicit Delete; baseline divergence is structural (column count diff)

### Field 6 — Add Location (dialog UX — PARITY on both sides; trigger differs)

- **Nav2** (user-confirmed screenshots 2 + 3, 2026-05-12 16:00 IST): NO explicit "Add" button label, but the empty grid row at bottom IS the trigger — clicking into any cell of the empty row opens the **"Change Local Office" dialog**. Dialog contents (Nav2): heading "Change Local Office" + sub-line "Current: 1604 - The Parker Palm Springs" + name-search input + 2-column results table (Local Office | Local Office Name) + scrollbar + Cancel / Select buttons. **Miami search returns 10+ results** (1233 Miami Marriott Biscayne Bay, 1391 Embassy Suites Miami Int'l Airport - Deactivated, 1583 DoubleTree, 1733 Miami Beach Resort & Spa, 1997 JW MARRIOT MARQUIS MIAMI, 2047 JW Marriott Marquis Miami, 2048 JW Marriott Miami, 2049 Miami Marriott Dadeland, 2135 W Miami, 2197 Hilton Miami Dadeland, + more).
- **E2E**: explicit "Add" button (positional selector `tbody tr:last-child button`, no testid available) → opens "Change Local Office" dialog (`location-settings-modal-change-local-office`) with: name/number search input, 4614-row table, Select/Cancel/Close buttons. **Miami search returns 0 results** (5 TCs fixme'd 2026-05-11).
- **SHR-DIV-002 revised**: PARITY-WITH-TRIGGER-DIVERGENCE — both sides have functionally-identical "Change Local Office" dialog UX with search/select. Only the trigger element differs (Nav2: click empty grid cell; E2E: click Add button).
- **SHR-DIV-006 revised → CONFIRMED REGRESSION**: Nav2 name-search works (10+ results for "Miami"); E2E broken (0 results). Filed as `reports/bugs/BUG-LOC-SHR-001.json` per LR-034 with baselineComparison + baselineEvidence.
- **D1..D6 (E2E side)**:
  - D1 state-dep: dialog excludes already-added locations (REQUIREMENTS line 788; A4 TC-024 fixme'd cannot verify currently)
  - D2 validation-dep: Select button disabled until a row is checked (A4 TC-009 + TC-012)
  - D3 visibility-dep: visible when dialog open
  - D4 limit-dep: 4614 total locations in pool (per A6 source comment)
  - D5 cascading-options: search filters (debounced) name + number against the 4614-row catalog
  - D6 save-behavior: dialog Select adds row to grid (unsaved); shared Save persists (A4 TC-013/018)

### Field 7 — Shared Save (shared left-panel button)

- **Nav2**: `<button type="submit" class="btn btn-success me-2">Save</button>` — Bootstrap; single button shared across all Location Settings sub-tabs (monolithic page layout, SHR-DIV-005). Currently disabled when form pristine. NO confirmation dialog observed pre-save.
- **E2E**: `[data-testid="location-settings-btn-save"]` — Radix button. Opens Radix AlertDialog `location-settings-modal-save-changes` with Cancel/Ok buttons (REQUIREMENTS line 991; LR-012; ALL-076). Disabled when form pristine; enabled when any sub-tab field is dirty.
- **DIVERGENCE → SHR-DIV-004**. Classified INTENTIONAL-UX-CHANGE (confirmation dialog added on E2E).
- **D6 save-behavior (E2E)**:
  - Save persists multiple-field-combinable changes (A4 TC-021 combined SI + add)
  - Cancel on save-dialog leaves form dirty (A4 TC-022)
  - Beforeunload fires when form dirty (A4 TC-023)

### Implicit Field 8 — Form dirty state interaction (cross-field)

- **D1 state-dep** (E2E): any editable field change → form dirty → Save enables (A4 TC-006/007)
- **D6 save-behavior** (E2E): Angular dirty-state unreliable per LR-026; spec uses `expect.poll(() => pg.isSaveEnabled(), { timeout: ... })` patterns
- Nav2 dirty-state behavior NOT exercised this session.

---

## §5 Schema observations (LR-036 etc.)

- **Nav2 Shared Setup tab uses SlickGrid**, NOT PrimeNG and NOT Bootstrap Glyphicon. Boolean cell rendering uses native `<input type="checkbox" class="editor-checkbox">` — programmatic readers use `inp.checked` directly (no Glyphicon detection needed for THIS tab; that pattern is LM History only).
- **E2E Shared Setup uses Radix UI** `<button role="checkbox">` (per A6 comment line 18-19 + LRN-015) — programmatic readers use `getAttribute('aria-checked') === 'true'` or `aria-pressed` patterns (not `.checked`).
- Per-tab framework parity reinforces LR-036 generalization: never assume same boolean-render across tables.

---

## §6 Divergence candidates (Phase 2 output — revised after user screenshot review 2026-05-12 16:00 IST)

Six divergences classified inline above; see frontmatter `divergences:` block. Summary table:

| ID | Field | Classification | Action |
|---|---|---|---|
| SHR-DIV-001 | Self-row Shares Inventory editability | **PARITY-WITH-INTERACTION-DIVERGENCE** (revised) | None — both sides editable; Nav2 needs click-cell-to-activate (SlickGrid edit-on-focus). Earlier /encore-questions Tier-B flag WITHDRAWN |
| SHR-DIV-002 | Add Location UX trigger | **PARITY-WITH-TRIGGER-DIVERGENCE** (revised) | None — dialog UX is parity on both sides; only trigger differs (Nav2: click empty grid cell; E2E: click "Add" button). Earlier INTENTIONAL-UX-CHANGE classification WITHDRAWN |
| SHR-DIV-003 | Delete UX (none-visible vs explicit button) | INTENTIONAL-UX-CHANGE | None — column count diff is documented; Nav2 delete mechanism (right-click/context-menu) deferred |
| SHR-DIV-004 | Save confirmation dialog | INTENTIONAL-UX-CHANGE | None — dialog confirmation is documented per LR-012 |
| SHR-DIV-005 | Page layout (monolithic vs tabbed) | INTENTIONAL-UX-CHANGE | None — per OSB-ACCESS-VERIFY §3 |
| SHR-DIV-006 | "Miami" name-search 0 results in dialog (5 TCs fixme'd) | **CONFIRMED REGRESSION** (revised) | **Filed as `reports/bugs/BUG-LOC-SHR-001.json` per LR-034**; Nav2 dialog Miami search returns 10+ matches; E2E returns 0. Earlier BASELINE-ABSENT classification + /encore-questions Tier-A flag WITHDRAWN |

**Bug filings**: **1 filed** — `reports/bugs/BUG-LOC-SHR-001.json` (SHR-DIV-006 regression, baselineComparison + baselineEvidence per LR-034). Other 5 divergences are not bug-shape (4 documented INTENTIONAL-UX-CHANGE / 2 PARITY-WITH-INTERACTION-OR-TRIGGER-DIVERGENCE).

---

## §7 Status block (parseable)

```yaml
baseline_scope: baseline-present
nav2_walk_complete: true
nav2_walk_path: phase-1a-headed-cli-with-user-assisted-signin
phase_1b_status: skipped-per-LR007-amended (on-disk E2E artifacts <14d fresh; live spot-check deviation logged DEV-001)
phase_2_status: complete (6 divergences classified inline)
fields_inventoried_count: 7 (5 grid columns + Add + Save; +1 implicit cross-field interaction)
cross_field_section_present: true (path C — D1..D6 per field embedded in §4)
divergence_candidates_count: 6
divergence_classification:
  intentional_ux_change: 3 (SHR-DIV-003/004/005)
  parity_with_interaction_or_trigger_divergence: 2 (SHR-DIV-001 click-cell-to-edit; SHR-DIV-002 trigger differs but dialog UX parity)
  confirmed_regression_bug_filed: 1 (SHR-DIV-006 → BUG-LOC-SHR-001)
bug_filings: 1 (BUG-LOC-SHR-001 — dialog name-search 0-results regression; Nav2 baseline works, E2E broken)
encore_questions_candidates: 0 (earlier 2 flags withdrawn after user screenshot review)
resume_artifacts:
  - specs_planning/_internal/intake/shared-setup-hunter-2026-05-12.md (updated)
  - .auth/nav2-state.json (9688 bytes, .psav.com cookies persisted)
  - .work/hunter-shared-setup/nav2-shared-setup-clicked.yml (full Nav2 page snapshot, 23463 bytes)
giver_unblock_state: ready (HUNTER GREEN; intake + baseline + classifications complete)
```

---

## §8 References

- Intake: [shared-setup-hunter-2026-05-12.md](../intake/shared-setup-hunter-2026-05-12.md)
- Reference shape: [OSB-ACCESS-VERIFY-2026-04-24.md](OSB-ACCESS-VERIFY-2026-04-24.md)
- New-site authoritative artifacts (consumed via on-disk freshness path per LR-007 + LR-013 amended):
  - [REQUIREMENTS.md §Shared Setup Locations Tab](../../../docs/REQUIREMENTS.md) lines 759-789
  - [MODULE_REGISTRY.md `setup/locations`](../../../docs/MODULE_REGISTRY.md) lines 21-24
  - [location-shared-setup-locations.spec.ts](../../../tests/specs/setup/locations/location-shared-setup-locations.spec.ts) 24 TCs
  - [location-shared-setup-locations.page.ts](../../../src/pages/setup/locations/location-shared-setup-locations.page.ts) helpers
  - [shared-setup-locations.ts selectors](../../../src/selectors/setup/locations/shared-setup-locations.ts) 19 testids
  - [location-shared-setup-locations.data.ts](../../../tests/test-data/setup/locations/location-shared-setup-locations.data.ts) constants
- Nav2 snapshot: `.work/hunter-shared-setup/nav2-shared-setup-clicked.yml` (gitignored work dir; not committed)
- Live Nav2 evidence cited inline in §2/§4 via SlickGrid header ids + cell `l<N>` classes
