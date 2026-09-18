<!--
FIELD-INVENTORY ARTIFACT TEMPLATE

Filename convention: <module>-<YYYY-MM-DD>.md
  - <module>      = kebab-case module name from MODULE_REGISTRY.md
  - <YYYY-MM-DD>  = MCP session date (must equal MCP_Session_Date frontmatter)

This template is the framework contract. Edits to this file are OWNER-only RW per
AGENT_SHARED_RULES.md §2 + AAE-D9. Authoring agents (GIVER as primary, WATCHDOG on
re-audit) COPY this file to <module>-<YYYY-MM-DD>.md and fill it in — they do NOT
edit this template directly.

The pre-commit hook installed by SP-AAE-02 runs the grep rules in field-inventory-spec.md
against any newly authored artifact. Skipping a mandatory section or a frontmatter
field will be rejected at commit time.

Before saving: walk through every section below. Replace every <placeholder>. Delete
any optional section you did not populate (do NOT leave the template scaffolding in
place — the hook treats unfilled placeholders as authoring laziness).
-->

# Field Inventory — <Module Display Name>

**Module**: <module-kebab>
**Client**: <client-name>
**MCP_Session_Date**: <YYYY-MM-DD>
**MCP_Session_Tool**: <Claude in Chrome | Playwright MCP>
**MCP_Tool_Reason**: <one-line LR-038 justification — see field-inventory-spec.md §LR-038 for the criterion list>
**Author_Identity**: <GIVER | OWNER | WATCHDOG>
**Page_URL**: <full URL including query params, e.g. https://app.example.com/section/sub-section>
**Test_Entity**: <client-specific test entity, e.g. Office 1604, Account ACME-123, Tenant 42>
**Walk_Mode**: <quick | deep>
**Walk_State**: module=<module-kebab> walked=[<state-label-1>,<state-label-2>]
**Coverage_Ratio**: <covered>/<total> (<percent>%)
**CrossCheck**: <clean | divergence summary>

When a Coverage Manifest is present, keep `Walk_State` in the structured form above. `module=` and
`walked=[...]` are required; office/currency/tab tokens may be added around them when useful.

---

## URL(s) visited

- `<primary URL — anchor for routing>`

Tabs observed (when the URL hosts a Radix tablist or similar in-page tab control):

- `<tab name 1>` (active by default)
- `<tab name 2>`
- `<tab name 3>`

For each tab, note how it is activated (URL query param, click, default route, etc.).

---

## Live-state caveat

For any field where the live DOM reading diverges from the documented default in
REQUIREMENTS.md / Functional Requirement docs / Jira ACs, list it here. Drift is
expected on long-lived test entities — the table below is the audit trail readers
need to interpret the Field Inventory section correctly.

| Field | Live (<MCP_Session_Date>) | Documented default | Drift reason (if known) |
|---|---|---|---|
| <field name> | <observed value> | <documented value> | <prior test pollution / requirement drift / unknown> |

If no drift was observed: write the literal sentence "No drift observed — live matches REQUIREMENTS.md."

---

## Field Inventory

For grouped sets of fields (e.g. "Date Offsets" with 6 numeric inputs of the same
shape), use a sub-section heading per group with one Field Inventory table per
sub-section. The mandatory column set is identical across all sub-sections.

### <Section / Group Name 1>

| Field | data-testid | Control Type | Default Value | Validation Rules | Enabled/Disabled States | Cross-field deps | Notes |
|---|---|---|---|---|---|---|---|
| <field label verbatim from DOM> | <data-testid attribute value, OR `(none) — use aria-label="<X>"` per LR-014 fallback> | <text \| number \| date \| checkbox \| radio \| dropdown \| combobox \| textarea \| link \| button \| section-row> | <live observed default per LR-015> | <e.g. "must be >= 0", "phone format", "(none observed)"> | <e.g. "disabled when Use X = false", "always enabled"> | <e.g. "must be >= Prep (NM-1264)" or "(none)"> | <orphan rows, prior pollution, special behavior> |

### <Section / Group Name 2>

| Field | data-testid | Control Type | Default Value | Validation Rules | Enabled/Disabled States | Cross-field deps | Notes |
|---|---|---|---|---|---|---|---|
| <...> | <...> | <...> | <...> | <...> | <...> | <...> | <...> |

<!--
Add as many sub-section blocks as the page has groupings. Variable-row areas (e.g.
"Section Configuration" with N user-editable rows) get a single row with Control Type
= "section-row" and Notes describing the row schema; do NOT enumerate per-row data
unless row identity matters for downstream tests.

LR-014 enforcement: data-testid column MUST be non-empty. Use the literal string
"(none) — use aria-label=..." or "(none) — use text content" when no testid exists.
Empty cells will be rejected by the SP-AAE-02 hook.

LR-015 enforcement: Default Value MUST come from a live DOM read on the dated MCP
session above. Hardcoding a value from REQUIREMENTS.md is forbidden — use the
Live-state caveat table to record drift, then put the LIVE value here.
-->

---

## Labels + Section Names

Verbatim copy from the live DOM (no paraphrasing, no markdown bold per Rule 2 of
tc-authoring-rules.md). One bullet per visible section heading on each tab.

**<Tab 1 Name> — section headings (top-down)**:

- "<exact section heading 1>"
- "<exact section heading 2>"
- "<exact section heading 3>"

**<Tab 2 Name> — section headings (top-down)**:

- "<exact section heading 1>"
- "<exact section heading 2>"

---

## Save-cycle observations

Document the full save flow as observed live. Verbatim text only.

**Save button behavior**:

- Default state on fresh load: <enabled | disabled | absent>
- Enables when: <e.g. "any field changes from baseline AND form is valid">
- Disables when: <e.g. "save API completes successfully", "form reverts to baseline">
- testid: `<save-button-testid>`

**Save dialog** (if any — many apps gate save behind a confirm dialog):

- Triggered by: <click of Save button | other>
- testid: `<dialog-testid>`
- Title (verbatim): "<exact title text>"
- Body (verbatim): "<exact body text>"
- Buttons (in order, verbatim): "<button 1 label>", "<button 2 label>"

If no save dialog: write the literal sentence "No save dialog — save commits directly."

**Post-save toast** (notification region):

- Region testid / aria-label: `<region locator>`
- Text (verbatim): "<exact toast text>"
- Duration: <transient, X seconds | sticky until dismissed>

If no toast appears: write the literal sentence "No post-save toast observed."

**Dirty-state behavior** (LR-026 — Angular form dirty state is unreliable):

- Tab switch with dirty form: <opens "Unsaved changes" alertdialog | switches silently>
- Alertdialog title (verbatim): "<exact title>"
- Alertdialog body (verbatim): "<exact body>"
- Buttons (in order, verbatim): "<button 1>", "<button 2>"

If save behavior matches LR-026 known quirks (button disables but dirty stays true),
document the exact symptom here so the consumer can wire defensive helpers (LR-026
references `dismissAlertDialogIfVisible()` + `clickSaveAndConfirm` patterns).

---

## Known App Bugs

Per LR-034 protocol — every application bug discovered during this DOM walk gets a
JSON file under `reports/bugs/BUG-{MODULE}-{NNN}.json` AND a row here for traceability.

| Bug ID | Field / Feature | Observed | Expected (per requirements) | Status |
|---|---|---|---|---|
| BUG-<MOD>-<NNN> | <field or feature name> | <what app does, with MCP evidence> | <what requirement says> | <open \| in-fix \| fixed-pending-verify> |

If no bugs were identified: write the literal sentence "No app bugs identified in this session."

---

## Staleness signal

Per AAE-D6 — field-inventory artifacts have a defined freshness window. Consumers
(generator + auditor) MUST emit a warning when reading an artifact past `Fresh-until`,
and MUST HALT until refreshed when reading past `Stale-after`.

- **Last verified**: <MCP_Session_Date>
- **Fresh-until**: <MCP_Session_Date + 14 days>
- **Stale-after**: <MCP_Session_Date + 30 days>
- **Refresh triggers**: <Encore release announcement | MODULE_REGISTRY.md schema change | generator spot-check disagreed with this artifact | client-flagged DOM change>

When stale, the same author identity (GIVER for routine refresh; WATCHDOG for
neutral-eye re-audit) re-walks the live DOM and either (a) UPDATEs this file with
new MCP_Session_Date + refreshed values, or (b) authors a new dated artifact and
this file becomes the historical record. Consumer-side preference: latest dated
file by filename wins.

---

## Optional sections

The following sections are OPTIONAL — include them if relevant to the work that
spawned this artifact. The pre-commit hook does NOT require them. Delete the
heading if the section is empty rather than leaving a "(none)" placeholder.

### Diff vs CSV

(Use when this artifact is the first DOM-walk for a module that already has a CSV
export — common in promotion of older neutral-eye audit artifacts. Lists TC-level
defects discovered by comparing the CSV against the live DOM.)

| TC ID | Defect type | Evidence line in CSV | Live finding | Fix recommendation |
|---|---|---|---|---|

### Suggested TCs

(Use when the artifact is authored by WATCHDOG during a neutral-eye audit and TC
suggestions emerge from the walk. The downstream test-planning subplan consumes this.)

| Suggested TC ID | Type (SMOKE / POSITIVE / NEGATIVE / UI / REGRESSION) | Title | Priority | Notes |
|---|---|---|---|---|

### Network-request evidence

(Use when fetch hooks were installed during the walk. Per LR-033 — empty fetch +
enabled save = client allowing invalid data; 5xx = APP_BUG candidate.)

| Action | API call(s) observed | Status | Inference |
|---|---|---|---|

### Known gaps

(Honest inventory of what was NOT walked or what could not be captured — per LR-040
closure-gate philosophy. Better to declare a gap than to imply completeness.)

- <gap 1 — what was not captured + why + which downstream subplan should pick it up>
- <gap 2 ...>

### Boolean encoding registry

(Use when fields on this page feed boolean columns in a history table — per LR-036
boolean encoding differs across tables in the same Angular app, MCP-verify per table.)

| Source field | Target column (history table) | Encoding | Detection pattern |
|---|---|---|---|

---

## Activity-log row (append at session close per LR-028 + LR-037)

`| <YYYY-MM-DDThh:mm wall clock at append time, NOT at work start> | <author identity codename> | done | specs_planning/_internal/field-inventories/<module>-<YYYY-MM-DD>.md, <plan or subplan file that spawned this artifact> | Field-inventory artifact for <module> — <one-line summary of what was walked, e.g. "Basic Information + ECT Settings tabs, 23 fields, 3 sub-sections, 2 candidate APP bugs"> |`

LR-037 reminder: the timestamp above MUST be at or after the mtime of every file
named in the Files column. Backdating poisons downstream temporal-anchoring gates.
Run `npm run validate:activity-log:preflight` before claiming done.
