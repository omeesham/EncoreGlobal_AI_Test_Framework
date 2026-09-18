# Field-Inventory Artifact — Format Specification

**Status**: ACTIVE (frozen 2026-04-23 by SP-AAE-01)
**Owner**: OWNER (per [AGENT_SHARED_RULES.md §2](../../docs/read_only_docs/AGENT_SHARED_RULES.md) + AAE-D9)
**Template**: [`_internal/field-inventories/_TEMPLATE.md`](field-inventories/_TEMPLATE.md)
**Parent plan**: [PLAN_AGENT_AUTHORING_EFFICIENCY.md](../../../plans/pending/PLAN_AGENT_AUTHORING_EFFICIENCY.md)
**Installed by**: [SUBPLAN_AAE_01_ARTIFACT_SPEC.md](../../../plans/pending/SUBPLAN_AAE_01_ARTIFACT_SPEC.md)

---

## Why this document exists

The field-inventory artifact is the **single dated source of truth** for every field, default, validation rule, and save-cycle observation on a given module. The system is described in the parent plan; the contract is defined here.

Three downstream consumers depend on this contract being stable:

1. **SP-AAE-02 hook** — pre-commit check that rejects test-case markdown edits lacking a same-module, ≤14-day-old field-inventory artifact. The hook reads frontmatter and section presence via the grep rules in §6 below.
2. **SP-AAE-04 generator + auditor refactor** — both agents stop walking the live DOM in their own Phase 0.5 and instead consume the dated artifact (with a 2-3 field spot-check). Cuts DOM traversal 3x → 1x per module per cycle.
3. **SP-AAE-05 staleness signal** — emits warning at planner/generator load when the artifact is past its 14-day fresh window; HALT past 30 days. **Quick-path exception (LR-072)**: when the governing subplan's `CoverageMode` is `quick`, the 0.5a spot-check (3-row log) is legal for artifacts 15–30 days old instead of a forced full re-walk; the >30-day HALT is unchanged in both tiers.

If this format churns after the consumers ship, every consumer breaks. SP-AAE-01 freezes the format **before** SP-AAE-02 turns the hook on, exactly to prevent that.

---

## Filename + location

**Path**: `specs_planning/_internal/field-inventories/<module>-<YYYY-MM-DD>.md`

| Component | Rule |
|---|---|
| `<module>` | Kebab-case module name. MUST match an entry in `docs/MODULE_REGISTRY.md`. (e.g., `local-office-settings`, `location-management-currency`) |
| `<YYYY-MM-DD>` | ISO date of the MCP session. MUST equal the `MCP_Session_Date` frontmatter value. (e.g., `2026-04-23`) |

**Multiple files per module**: allowed and expected. Each dated walk is a snapshot. The newest file (by filename date) is the live truth; older files are the historical record. Consumers (generator / auditor / staleness signal) prefer the latest dated artifact.

**`_TEMPLATE.md`** is reserved — it is the framework template, not a module artifact. The hook ignores it.

---

## Frontmatter (mandatory)

The frontmatter is markdown-greppable (not YAML). Each field is a single-line `**Key**: Value` row. The hook's grep rules anchor on `^\*\*<Key>\*\*:` so the format MUST match exactly.

| # | Key | Type / Allowed Values | Purpose | Greppable presence rule |
|---|---|---|---|---|
| 1 | `Module` | kebab-case string from MODULE_REGISTRY.md | Routes the hook to the right test-case file glob | `^\*\*Module\*\*: [a-z][a-z0-9-]*$` |
| 2 | `Client` | client name (e.g., `encore`, `acme`) | Disambiguates multi-client repos | `^\*\*Client\*\*: [a-z][a-z0-9-]*$` |
| 3 | `MCP_Session_Date` | `YYYY-MM-DD` (ISO 8601) | LR-015 timestamp of dated MCP session — staleness signal anchors here | `^\*\*MCP_Session_Date\*\*: \d{4}-\d{2}-\d{2}$` |
| 4 | `MCP_Session_Tool` | `Claude in Chrome` \| `Playwright MCP` | LR-038 browser tool announcement | `^\*\*MCP_Session_Tool\*\*: (Claude in Chrome\|Playwright MCP)$` |
| 5 | `MCP_Tool_Reason` | one-line free text | LR-038 justification for the tool choice | `^\*\*MCP_Tool_Reason\*\*: \S` |
| 6 | `Author_Identity` | `GIVER` \| `OWNER` \| `WATCHDOG` | Identity codename of the agent that walked the DOM (per /identity skill) | `^\*\*Author_Identity\*\*: (GIVER\|OWNER\|WATCHDOG)$` |
| 7 | `Page_URL` | full URL including query params | Anchor for routing + reproducibility | `^\*\*Page_URL\*\*: https?://\S+$` |
| 8 | `Test_Entity` | client-specific test entity (e.g., `Office 1604`) | Disambiguates entity-state drift in the Live-state caveat section | `^\*\*Test_Entity\*\*: \S` |

Missing any of the 8 = HALT at hook level. Hook error message names the missing key.

## Optional frontmatter keys

| # | Key | Type / Allowed Values | Purpose | Greppable presence rule |
|---|---|---|---|---|
| 9 | `Baseline_Artifact` | relative path from repo root to an `old-site-baseline/<module>-<YYYY-MM-DD>.md` artifact | Links the new-site field inventory to its same-module old-site baseline (per PLN-049 + REQ-014 + LR-ENC-001). Symmetry with Requirements agent's Phase 1a baseline artifact — Planner's walkthrough references the baseline when one exists | `^\*\*Baseline_Artifact\*\*: clients/[a-z][a-z0-9-]*/specs_planning/_internal/old-site-baseline/[a-z0-9-]+-\d{4}-\d{2}-\d{2}\.md$` |
| 10 | `Walk_Mode` | `quick` \| `deep` | Tier at which this walk was executed (LR-072). Absent = `deep`. Must match the governing plan's `**CoverageMode**:` value; mismatch causes Cx closure FAIL. Stamped at walk time; never hand-edited after the walk closes. | `^\*\*Walk_Mode\*\*: (quick\|deep)$` |

**When to include** (MANDATORY condition per PLN-049):
- A same-module `old-site-baseline/<module>-*.md` artifact exists AND the upstream queue entry has `baselineScope: full` or `baseline-partial` → `Baseline_Artifact` key is MANDATORY; omission = HALT at Planner→Generator handoff.
- `baselineScope: baseline-absent` (feature doesn't exist on old site, flagged for `/encore-questions`) → key is OPTIONAL; omit OR set to `none` with a `Baseline_Scope` companion line (free-form, not required by hook).
- Session is a static catalog-pivot that never calls `browser_navigate` → key is OPTIONAL (whole artifact is structurally exempt).

The SP-AAE-02 hook does NOT enforce this key's presence (optional by grep rule above); Planner identity enforces it at handoff per PLN-049 amendment.

---

## Mandatory sections (LR-040 closure-gate compliant)

Every section below has (a) a stated purpose, (b) a required content schema, and (c) a grep-verifiable presence rule. Order is fixed to make hook validation deterministic.

### §1 — `## URL(s) visited`

- **Purpose**: anchor the artifact to the exact URL(s) walked, including in-page tabs.
- **Required content**: at least one bullet listing the primary URL. If the page hosts in-page tabs (Radix tablist or similar), enumerate each tab + how it is activated.
- **Grep rule**: `^## URL\(s\) visited$`

### §2 — `## Live-state caveat`

- **Purpose**: surface drift between live DOM and documented defaults so consumers don't assume the live values represent canonical defaults.
- **Required content**: one row per drifted field in a table with cols `Field | Live (<MCP_Session_Date>) | Documented default | Drift reason (if known)`. If no drift, the literal sentence `No drift observed — live matches REQUIREMENTS.md.`
- **Grep rule**: `^## Live-state caveat$`

### §3 — `## Field Inventory`

- **Purpose**: enumerate every field on the page with the data downstream tests need (testid, default, validation, dependencies). This is the artifact's load-bearing section.
- **Required content**: at least one Field Inventory table. Sub-section headings (`### <Group Name>`) when fields cluster naturally. Each table MUST contain the 8 mandatory columns in this exact order: `Field | data-testid | Control Type | Default Value | Validation Rules | Enabled/Disabled States | Cross-field deps | Notes`.
- **LR-014 enforcement**: the `data-testid` column MUST be non-empty for every row. Use the literal fallback string `(none) — use aria-label="<X>"` or `(none) — use text content` when no testid exists. Empty cells are rejected.
- **LR-015 enforcement**: the `Default Value` column MUST come from a live DOM read on `MCP_Session_Date`. Documented defaults from REQUIREMENTS.md belong in §2 Live-state caveat (as the "Documented default" column), not here.
- **Grep rule**: `^## Field Inventory$`
- **Column count rule**: `^\| Field \| data-testid \| Control Type \| Default Value \| Validation Rules \| Enabled/Disabled States \| Cross-field deps \| Notes \|$`
- **LR-057 enforcement (affordance token)**: every row whose `Control Type` is non-editable (read-only / static / disabled) MUST carry an `affordance:` token in its **Notes** cell, recorded from a live click-probe of the control + its label + its row/container: one of `affordance: none` | `affordance: launcher → "<dialog title>"` | `affordance: navigation → <target>` | `affordance: popover → <name>`. A non-editable display input never proves non-interactivity — the affordance often lives on the label. Do NOT add a 9th column (the 8-column header is a frozen contract); the token lives inside the existing Notes cell. Reference grep: `grep -nE 'affordance:' <file>` should hit every non-editable row.

### §4 — `## Labels + Section Names`

- **Purpose**: provide verbatim DOM-rendered text for every section heading on every tab. Downstream test assertions on labels reference this section, not the live app — so the label text never drifts between when it was walked and when a test was written.
- **Required content**: one bullet group per tab, prefixed by tab name in bold. Each section heading in double quotes (per Rule 2 of [tc-authoring-rules.md](tc-authoring-rules.md)).
- **Grep rule**: `^## Labels \+ Section Names$`

### §5 — `## Save-cycle observations`

- **Purpose**: document the full save flow including dialog text, toast text, and dirty-state behavior. Downstream tests use the verbatim text for assertions; helpers like `clickSaveAndConfirm` rely on the dialog testid; LR-026 defensive patterns rely on the dirty-state quirks being documented.
- **Required content**: four sub-headings — `Save button behavior`, `Save dialog`, `Post-save toast`, `Dirty-state behavior`. Verbatim text for all dialog/toast labels and bodies.
- **Grep rule**: `^## Save-cycle observations$`

### §6 — `## Observations`

- **Purpose**: capture and escalate everything the walk *saw* — application defects to be gated by LR-034, plus improvement ideas. This is the recording slot the coverage-only disposition vocabulary (LR-062) structurally lacked.
- **Required content**: two sub-headings, both non-optional.
  - **`### Bugs / Defects`** — a table with cols `Bug ID | Field / Feature | Observed | Expected (per requirements) | Status`. Use `BUG-CANDIDATE` while pending MCP-confirm; a filed bug carries its `BUG-{MODULE}-{NNN}` id per LR-034.
  - **`### Suggestions / Improvements`** — enhancement / missing-feature ideas and ambiguous discussion-items (per `feedback_discussion_item_not_bug.md`).
- **`none` is valid and expected; blank is not.** A walk that observed nothing writes the literal `none` under each bucket. An *absent* section, or a present-but-blank bucket, is an incomplete walk. There is deliberately **no bug quota** — bugs are not always there to be caught, but an agent that *saw* bugged behaviour is forced to record and escalate it.
- **Grep rule**: `^## Observations$`

> **Legacy shape — `## Known App Bugs` (retired 2026-07-23).** 23 artifacts used `## Known App Bugs`,
> 5 used `## Observations`, and 19 had neither. All 47 were migrated to the canonical shape above by
> PLAN_UNIQUE_CASE_COVERAGE_FLOOR Phase 5.2 — deliberately **not** grandfathered, because a
> permanently-exempt legacy tier is how the next census finds the same 19. `scripts/check-walk-observations.mjs`
> still *parses* `## Known App Bugs` so it can report it as `LEGACY: needs migration` rather than
> crashing; that parse path is a migration ramp, **not a second sanctioned format.** Do not author it.

### §7 — `## Staleness signal`

- **Purpose**: declare the freshness window. AAE-D6 staleness signal reads this section.
- **Required content**: four key/value lines — `Last verified`, `Fresh-until`, `Stale-after`, `Refresh triggers`. Dates must be ISO `YYYY-MM-DD` so the staleness check is parseable.
- **Grep rule**: `^## Staleness signal$`
- **Date format rule**: `^- \*\*(Last verified\|Fresh-until\|Stale-after)\*\*: \d{4}-\d{2}-\d{2}$`
- **`Refresh triggers` is a LOAD-CHECK input, not decoration (M3 companion, 2026-06-19)**: the LR-013 Phase 0.5 spot-check (planner Phase 0.5 / generator Path 0.5a / auditor Mode-2 step 2a) evaluates `Refresh triggers` **in addition to** the date window — an artifact INSIDE its 14-day fresh window is still treated as `STALE` (→ full re-walk, Path 0.5b) when a listed trigger has observably fired. Author `Refresh triggers` as concrete, checkable conditions, e.g. `toolbar buttons / dropdown values change`, `a known app-change date (NM-####) passes`, `grid row names drift`, `save endpoint changes`. The 2026-06-10 toolbar I/O drift (Import ▾ became a Year+Currency dialog; 10 `TC-CPR-TIO-*` went red) is the graduating miss: the artifact was date-fresh but its trigger ("toolbar I/O behavior changed") was doc-only and never consulted at load. Treat a fired trigger exactly like a failed spot-check.

---

## Optional sections (artifact author may include)

These DO NOT block the hook. They exist because real audits surface them often enough to be worth standardizing the column shape.

| Section heading | When to use | Column shape |
|---|---|---|
| `## Diff vs CSV` | First DOM walk for a module that already has an exported CSV (typical in promotion of older neutral-eye audits) | `TC ID \| Defect type \| Evidence line in CSV \| Live finding \| Fix recommendation` |
| `## Suggested TCs` | Artifact authored by WATCHDOG during a neutral-eye audit with TC suggestions for the downstream planner | `Suggested TC ID \| Type \| Title \| Priority \| Notes` |
| `## Network-request evidence` | Fetch hooks installed during walk (LR-033) — empty fetch + enabled save = client-side validation gap; 5xx = APP_BUG candidate | `Action \| API call(s) observed \| Status \| Inference` |
| `## Known gaps` | Honest inventory of what was NOT walked (per LR-040 closure-gate philosophy) | bulleted list — "what + why + which downstream subplan picks it up" |
| `## Boolean encoding registry` | Page fields feed boolean columns in a history table (per LR-036 — boolean encoding differs across tables) | `Source field \| Target column (history table) \| Encoding \| Detection pattern` |
| `## Launcher dialogs` | One or more fields carry `affordance: launcher → "<title>"` (LR-057) — capture each dialog's internals verbatim: title, filters (label + testid), table headers, row-selection control, buttons (Select/Cancel/Close), pagination, search endpoint + timing, and the per-launcher select→update(→persist) result | free-form per dialog — heading per dialog title; subsections for filters / table / buttons / save-cycle |
| `## Jira/Confluence Findings` | PLANNER Phase 0.75 / HUNTER Phase 0.5 ran a Rovo search (LR-ENC-004 / LR-063 / PLN-051) — record the governing NM tickets + Confluence spec and which fields / cases each governs | `Field / case \| NM ticket(s) \| Confluence ref \| Intent (verbatim) \| DOM-vs-intent verdict (match / intentional-UX / app-bug / stale)` |

---

## Coverage Manifest (machine-enumerated) — OPTIONAL section (LR-062)

Added by PLAN_EXHAUSTIVE_WALK_GUARANTEE (landed 2026-06-19). This section is **additive and optional** — it does NOT replace or alter the 8-column Field Inventory table or the 7 mandatory sections. It is present only on artifacts produced on/after the LR-062 landing date (2026-06-19); pre-landing artifacts are grandfathered (see "Grandfathered (pre-LR-062) artifacts" below) and need no `Coverage_Ratio` until their next refresh.

### New frontmatter keys (present ONLY when a Coverage Manifest section is present)
- `Coverage_Ratio: N/N (100%)` — dispositioned union elements / total union elements. Closure check Cx (LR-055) DENIES `Status: DONE` on a citing plan if this is < 100%.
- `Walk_State: module=<module-name> walked=[<state-labels>]` — the structured state list the denominator was measured in (for example, `module=pricing walked=[resting,cascade:alt-on]`). Add office/currency/tab tokens as needed, but `module=` and `walked=[...]` are required so `verify-denominator.mjs` can prove every required state was walked.
- `CrossCheck: clean | <divergence list>` — `clean` ⇔ every union (A∪B) element is dispositioned AND every symmetric-difference (A△B) review-set element is classified (PLAN M4). Cx DENIES if ≠ `clean`.

### The manifest table
`| element-key | role | machine-found (date) | disposition |`

Every row's **disposition** is exactly one of (NO blanks — mirrors the C6 honest-skip pattern):
- `covered-by-TC: <TC-ID>`
- `affordance-probed: <LR-057 token>`
- `read-only-verified`
- `out-of-scope: <reason ≥20 chars>`
- `deferred-to-DEEP: <element/launcher id> (<reason ≥20 chars>)` — legal only when the governing plan's `**CoverageMode**` is `quick` (LR-072 G1: no classification token may co-appear on the same row; G2: claimed rows keep full LR-062 provenance rigor)

Denominator = manifest rows (the union A∪B of the two enumerator lenses, PLAN M4). The machine JSON provenance lives at `reports/walk-coverage/<state>.json` (emitted by `scripts/walk-coverage/enumerate-page.mjs`); this markdown block is the **artifact-of-record** the cross-check (`scripts/walk-coverage/cross-check.mjs`) and the closure gate (Cx) read. The `coverageScope: PARTIAL` self-label is superseded by the computed `Coverage_Ratio`.

### Grandfathered (pre-LR-062) artifacts — no Coverage_Ratio until next refresh

The following field-inventory artifacts were produced before the LR-062 landing date (2026-06-19). They are valid in their current form and require no `Coverage_Ratio`, `Walk_State`, or `CrossCheck` frontmatter key, and no `## Coverage Manifest` section, until their next scheduled refresh.

| artifact | MCP_Session_Date |
|---|---|
| account-address-2026-05-29.md | 2026-05-29 |
| auto-addon-2026-06-11.md | 2026-06-11 |
| corporate-pricing-detail-2026-06-05.md | 2026-06-05 |
| corporate-pricing-new-pricebook-2026-06-09.md | 2026-06-09 |
| corporate-pricing-override-2026-06-08.md | 2026-06-08 |
| corporate-pricing-override-2026-06-09.md | 2026-06-09 |
| corporate-pricing-search-2026-06-05.md | 2026-06-05 |
| corporate-pricing-search-2026-06-10.md | 2026-06-10 |
| corporate-pricing-strategy-2026-06-05.md | 2026-06-05 |
| corporate-pricing-toolbar-io-2026-06-08.md | 2026-06-08 |
| currency-2026-06-17.md | 2026-06-17 |
| left-panel-basic-information-2026-06-03.md | 2026-06-03 |
| left-panel-basic-information-2026-06-11.md | 2026-06-11 |
| local-office-settings-2026-04-27.md | 2026-04-27 |
| notes-2026-05-11.md | 2026-05-11 |
| pricing-2026-06-18.md | 2026-06-18 |
| shared-setup-2026-05-12.md | 2026-05-12 |

---

## Sample rows (canonical examples from LOS)

### Sample Field Inventory row — numeric input with cross-field dep

```
| Delivery Date Offset (Relative to Start) | local-office-settings-input-delivery-date-offset | number | 0 | must be <= 0 (positive triggers aria-invalid=true) | always enabled | must be >= Prep (NM-1264 cross-field validation) | Async cross-field check per LR-010 — use expect.poll on aria-invalid |
```

### Sample Field Inventory row — Radix checkbox with state-dependent disable

```
| Use Equipments QC | local-office-settings-checkbox-use-equipments-qc | checkbox | aria-checked=true | (none observed) | disabled when Use Availability = false (per REQUIREMENTS.md; live behavior contradicts — see Live-state caveat) | depends on Use Availability | Live shows enabled even when Use Availability is unchecked — flagged in §2 Live-state caveat |
```

### Sample Save-cycle dialog block

```
**Save dialog**:
- Triggered by: click of Save button
- testid: `location-settings-modal-save-changes`
- Title (verbatim): "Save Changes"
- Body (verbatim): "Are you sure you want to save the changes?"
- Buttons (in order, verbatim): "Cancel", "Save"
```

### Sample `## Observations` → `### Bugs / Defects` row

```
| BUG-LOS-ECT-010 | ECT Labor Cost inputs | Triple-click + Delete + type "abc" + Tab silently coerces to 0.00; Save button enables; no aria-invalid | Non-numeric input should reject (matching the without-clearing case) OR fire aria-invalid + keep Save disabled | open |
```

---

## Grep rules summary (consumed by SP-AAE-02 hook)

The hook at SP-AAE-02 will run these greps against any newly authored or edited file under `specs_planning/_internal/field-inventories/<module>-*.md` (the `_TEMPLATE.md` file is excluded by name).

```bash
# Frontmatter presence — all 8 keys mandatory
grep -E '^\*\*Module\*\*: [a-z][a-z0-9-]*$' <file> || HALT "missing or malformed Module"
grep -E '^\*\*Client\*\*: [a-z][a-z0-9-]*$' <file> || HALT "missing or malformed Client"
grep -E '^\*\*MCP_Session_Date\*\*: [0-9]{4}-[0-9]{2}-[0-9]{2}$' <file> || HALT "missing or malformed MCP_Session_Date"
grep -E '^\*\*MCP_Session_Tool\*\*: (Claude in Chrome|Playwright MCP)$' <file> || HALT "missing or malformed MCP_Session_Tool"
grep -E '^\*\*MCP_Tool_Reason\*\*: \S' <file> || HALT "missing MCP_Tool_Reason"
grep -E '^\*\*Author_Identity\*\*: (GIVER|OWNER|WATCHDOG)$' <file> || HALT "missing or unknown Author_Identity"
grep -E '^\*\*Page_URL\*\*: https?://\S+$' <file> || HALT "missing or malformed Page_URL"
grep -E '^\*\*Test_Entity\*\*: \S' <file> || HALT "missing Test_Entity"

# Mandatory section headings — all 7 in order
grep -F '## URL(s) visited' <file> || HALT "missing section: URL(s) visited"
grep -F '## Live-state caveat' <file> || HALT "missing section: Live-state caveat"
grep -F '## Field Inventory' <file> || HALT "missing section: Field Inventory"
grep -F '## Labels + Section Names' <file> || HALT "missing section: Labels + Section Names"
grep -F '## Save-cycle observations' <file> || HALT "missing section: Save-cycle observations"
grep -F '## Observations' <file> || HALT "missing section: Observations"
grep -F '### Bugs / Defects' <file> || HALT "missing sub-section: Bugs / Defects"
grep -F '### Suggestions / Improvements' <file> || HALT "missing sub-section: Suggestions / Improvements"
grep -F '## Staleness signal' <file> || HALT "missing section: Staleness signal"

# Field Inventory column header — exact 8-col shape
grep -F '| Field | data-testid | Control Type | Default Value | Validation Rules | Enabled/Disabled States | Cross-field deps | Notes |' <file> || HALT "Field Inventory table missing or wrong column shape"

# Filename ↔ MCP_Session_Date consistency
filename_date=$(basename <file> .md | sed -E 's/.*-([0-9]{4}-[0-9]{2}-[0-9]{2})$/\1/')
frontmatter_date=$(grep -oE '^\*\*MCP_Session_Date\*\*: \K[0-9]{4}-[0-9]{2}-[0-9]{2}' <file>)
[ "$filename_date" = "$frontmatter_date" ] || HALT "filename date does not match MCP_Session_Date"

# Pairing check — when committing changes to clients/<client>/specs_planning/test-cases/.../<module>...md,
# require a paired _internal/field-inventories/<module>-*.md with MCP_Session_Date within 14 days
# (this part of the hook is implemented in SP-AAE-02; spec'd here for reference only)
```

---

## Migration note — promoting the LOS neutral-eye audit

The first real-world consumer of this format is SP-DQU-03 (Local Office Settings fixes). LOS already has a high-fidelity proto-artifact at [`_internal/neutral-eye-audits/local-office-settings-2026-04-22.md`](neutral-eye-audits/local-office-settings-2026-04-22.md) (created by SP-DQU-02). SP-AAE-01 does NOT promote it (out of scope — would expand SP-AAE-01 beyond the format-freeze charter). The promotion is a separate ~10-minute job documented here so the picker-up has a paint-by-numbers procedure.

**Source**: `specs_planning/_internal/neutral-eye-audits/local-office-settings-2026-04-22.md` (stays as historical SP-DQU-02 deliverable; not deleted).

**Target**: `specs_planning/_internal/field-inventories/local-office-settings-2026-04-22.md` (new file; live truth).

**Steps (10 minutes)**:

1. Copy the source to the target path. Filename already matches `<module>-<YYYY-MM-DD>.md` convention (module `local-office-settings`, date `2026-04-22` matches the source's "Date 2026-04-23 (session executed 2026-04-23; subplan dated 2026-04-22 per SP-DQU-02 naming)" — pick the session-execution date `2026-04-23` for `MCP_Session_Date` and either rename the target file to `local-office-settings-2026-04-23.md` to match, or document the offset in the artifact's Live-state caveat).
2. Add the 8 mandatory frontmatter keys at the top of the file. All values are derivable from the existing source:
   - `Module: local-office-settings`
   - `Client: encore`
   - `MCP_Session_Date: 2026-04-23` (from the source's Date line)
   - `MCP_Session_Tool: Claude in Chrome` (from the source's Browser tool line — note the brief Playwright MCP fallback in the original justification)
   - `MCP_Tool_Reason: <copy verbatim from source's Browser tool line>`
   - `Author_Identity: WATCHDOG` (from the source's Auditor line)
   - `Page_URL: https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/settings/local-office`
   - `Test_Entity: Office 1604 (Parker Palm Springs)` (from the source's Session office line)
3. The source already has §1 (URL(s) visited), §2 (Live-state caveat), parts of §3 (Field Inventory — but split across 4 sub-section tables with varying column counts), §4 (Section names + labels), and §6 (Suspected APP bugs). Restructure each Field Inventory sub-section table to use the 8 mandatory columns. Some columns will need synthesis from the source's narrative text (Validation Rules, Cross-field deps), but no data is lost — the source documents everything required.
4. Add §5 `## Save-cycle observations` by extracting the Save dialog rows from the source's `## Links + actions` table + the dirty-state notes scattered through the source. The verbatim dialog text is already captured in source rows for "Basic Info → Save button (after valid edit)" and "Tab switch while form dirty".
5. Rename the source's `## Suspected APP bugs` to `## Observations`, put its rows under `### Bugs / Defects`, and add a `### Suggestions / Improvements` bucket (literal `none` if there are none). Link the existing BUG-LOS-BAS-016 / BUG-LOS-ECT-001 / BUG-LOS-ECT-010 IDs. Status defaults to `open` until they have a fix.
6. Add §7 `## Staleness signal` at the bottom: `Last verified: 2026-04-23`, `Fresh-until: 2026-05-07`, `Stale-after: 2026-05-23`, `Refresh triggers: <see template>`.
7. The source's `## Suggested TCs`, `## Diff vs CSV`, `## Network-request evidence`, `## Known gaps` map cleanly to optional sections — preserve them as-is.
8. The source's bottom Activity-log row template is already in the right shape — adjust its Files column to reference the new target path instead of the source path.

**Net data loss**: zero. **Net gain**: the artifact now passes the SP-AAE-02 hook + becomes consumable by the SP-AAE-04 generator/auditor refactor.

**Source file fate**: leave in place. It is the historical SP-DQU-02 deliverable. The promotion creates a NEW file at the new location; both coexist.

---

## LR coverage statement (for LR-040 closure-gate evidence)

| LR | Where covered |
|---|---|
| LR-014 (FIELD INVENTORY testid completeness) | §3 Field Inventory — `data-testid` column is mandatory per row; explicit fallback string allowed; hook rejects empty cells |
| LR-015 (defaults from dated MCP) | Frontmatter `MCP_Session_Date` is the timestamp; §3 Field Inventory `Default Value` column MUST come from live DOM read on that date; §2 Live-state caveat records drift vs documented defaults |
| LR-026 (Angular form dirty state defensive) | §5 Save-cycle observations `Dirty-state behavior` sub-section — documents quirks per page so consumers can wire defensive helpers |
| LR-034 (Bug Filing Protocol) | §6 Observations → `### Bugs / Defects` — every discovered app bug references its `BUG-{MODULE}-{NNN}.json` file |
| LR-036 (Boolean encoding differs per table) | Optional `## Boolean encoding registry` section — when fields feed history-table boolean columns, the per-table detection pattern is recorded |
| LR-038 (Browser tool selection + announcement) | Frontmatter `MCP_Session_Tool` + `MCP_Tool_Reason` — the LR-038 announcement is encoded structurally so the hook can verify it exists |
| LR-040 (Closure gate completeness) | This entire spec — every mandatory section has a stated (a) purpose, (b) required content schema, (c) grep-verifiable presence rule. Closure of any artifact in this format is grep-checkable, not prose-checkable |
| LR-042 (Chain artifact discipline) | Out of scope for this format spec — applies to chain orchestration artifacts, not field-inventory artifacts. Cross-referenced for traceability only |

---

## Revision history

- **2026-04-23** — Initial freeze (this version). Authored by SP-AAE-01 under OWNER identity. Three new ownership rows added to AGENT_SHARED_RULES.md §2 + governance paragraph cross-linked to AAE-D9 in parent plan. Migration of LOS neutral-eye audit deferred to SP-DQU-03 (where it is the first real-world consumer).
- **2026-04-24** — Added OPTIONAL `Baseline_Artifact` frontmatter key (key #9) for linking to same-module `old-site-baseline/<module>-<YYYY-MM-DD>.md` artifacts. Authored by SP-OSB-02 under OWNER identity per PLN-049 amendment + REQ-014. Non-breaking: hook does NOT enforce (optional by grep rule); Planner identity enforces at handoff. No migration required for existing artifacts — key is additive.
- **2026-06-11** — Added the §3 `affordance:` Notes-token mandate for non-editable Control Types (LR-057) + the optional `## Launcher dialogs` section. Authored by SUBPLAN_LAUNCHER_DIALOG_GAPS_FCC under OWNER identity. Non-breaking: NO new column (8-column header stays frozen — the token lives inside the existing Notes cell); the hook column-shape grep is unchanged. Existing artifacts need no migration; new walks apply the token going forward. Graduated from the Pay To Address / Master Bill To launcher misses (RCA `rca-launcher-dialog-misses-2026-06-11.md`).
- **2026-06-22** — Added OPTIONAL `## Jira/Confluence Findings` section (LR-ENC-004 / LR-063 / PLN-051) for Rovo-sourced intent truth (NM tickets + Confluence spec governing fields / cases). Authored by PLAN_SELF_HELP_RESEARCH_MANDATE under OWNER identity. Non-breaking: optional section, hook column-shape grep unchanged, no migration required.

Future revisions: append entries here. Format churn after this revision must include a migration plan for every artifact already authored in the prior version (currently none — LOS migration is the first promotion).
