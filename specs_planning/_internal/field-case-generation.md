> ⚠ **ID-RENAME 2026-06-11** (PLAN_ID_NAMING_AUDIT_AND_REMEDIATION): TC-LOC-CPR-* → TC-CPR-{SRC,STR,DET,NPB,OVR,TIO}-* (001-based per screen); TC-LOC-LI-NE-011..047 → TC-LOC-LI-078..114; TC-LOC-LI-SKIP-BILLING → TC-LOC-LI-070; BUG-CPR-001 → BUG-CPR-OVR-001; BUG-LOC-SHR-001 → BUG-LOC-SSL-001. IDs in this dated artifact are PRE-rename; map: _internal/id-audit-2026-06-10/id-rename-map.csv

# Case-Generation Templates — Encore instance

> **Encore instance of the framework [Case-Generation Standard](../../docs/read_only_docs/CASE_GENERATION_STANDARD.md).**
> The Standard defines the lean two-axis technique (Axis 1 field families × Axis 2 surface families,
> methods, depth L0–L3); this file is its Encore realization — §2 field-input templates + §2.1 oracle +
> **§3 surface/behavior templates** with Encore specifics (LR-036 boolean render, currency badge,
> virtualization). **FCC (Field-Case Coverage) is one *delivery scope* of this Standard** (Axis-1 field
> cases, `TC-<MOD>-FCC-*`), not the whole method; surface/behavior coverage (Axis 2) ships as SBC cases
> — ordinary 3-segment IDs (`TC-<MOD>-<SUB>-NNN`, continuing the page's band) marked with a
> `**Surface_Family**: <family> (QUICK|DEEP)` line (no `-SBC-` ID infix — 3-segment grammar; a 4th
> segment fails `check-tc-parity` G6; "SBC" names the catalog section + `describe` block, not the ID).
> **The `(QUICK|DEEP)` marker goes ONLY on the `**Surface_Family**:` line — NEVER on the `## TC-…:`
> heading: the heading ships verbatim as the reviewer-facing Title column, so a marker there leaks
> internal depth taxonomy to the client (ALL-091, 2026-06-25; `xlsx:lint` deny-list now hard-blocks it).**
> Companion to bug-archetypes.md (probe → bug) and tc-authoring-rules.md (text hygiene).
> Synthesized 2026-05-19 from external QA framework guide + existing ARCH-NNN archetypes; §3 surface
> axis added 2026-06-24 (SUBPLAN_CGS_A).

## How to use
1. Read the field-inventory artifact for your module to enumerate field types **and surface kinds**.
2. For each field, look up its type in §2 → grab the case-template row. **For each grid / list / table /
   result surface, look up its applicable families in §3** → grab the QUICK/DEEP rows.
3. Drop each case into your spec's describe block via `saveAndVerifyCase()` (src/utils/field-case-runner.ts).
4. Run each case as its own independent test. Each: baseline → act → save → reload → verify → cleanup.
5. Existing module TCs stay at the BOTTOM of the spec — FCC/SBC are additive, not destructive.

### Step-table format (per-step Expected Result)

The `**Steps**:` field in each TC is a pipe-table where each row carries its own Expected Result:

    **Steps**:
    | # | Step | Expected Result |
    |---|------|-----------------|
    | 1 | Navigate to Setup > Location > 1604 — Currency tab | The Currency tab loads and its content is visible. |
    | 2 | Verify grid shows 3 currencies (USD, CAD, MXN) | Three currency rows are visible with correct codes. |
    | 3 | Verify column headers | Four headers visible: Currency Code, Selected, Is Default, Merchant. |

    **Expected**: Grid displays 3 currencies with correct column headers

- Every step must have its own Expected Result, including the last. Empty cells → blank workbook cells (`to-xlsx.ts:633`).
- The `**Expected**:` line is the per-case summary (CSV oracle); it is **not** a per-step fallback in the XLSX (`to-xlsx.ts:632`).
- Escape pipes in cell content as `\|` (`to-xlsx.ts:821`).
- The exporter matches the header literally: `| # | Step | Expected Result |` — deviations silently skip extraction (`to-xlsx.ts:813`).
- Linter rules authors trip over: see `docs/read_only_docs/CASE_GENERATION_STANDARD.md` § "Linter rules."

## §1 — The 3-tier save verification framing
- **Tier 1** (BASELINE, always required): UI cache invalidation via page reload + re-navigation + DOM read of persisted value. Implemented today via `reloadAndNavigateTo*Tab()` page-object helpers.
- **Tier 2** (RECOMMENDED, partial today): Network response check — POST/PUT/PATCH returned 2xx, response body reflects committed payload, server-generated metadata (timestamps, version hashes) present. `clickSaveWithDialog()` captures errors; explicit payload-structure assertions are an FCC follow-up.
- **Tier 3** (FUTURE, out-of-scope now): Direct DB query. Framework has no DB access from test suite. Note as aspirational.

## §2 — Per-Field-Type Case Templates

| Field type | Positive cases | BVA cases | Negative cases | Save-cycle cases |
|---|---|---|---|---|
| Plain text | 1-char, mid, max-1 chars | empty, max, max+1 (paste) | special chars, whitespace-only, newline, leading/trailing space | new fill, edit overwrite, append, prepend, partial-replace, clear |
| Numeric / spinbutton | min, mid, max | min-1, max+1, decimal-step boundary | "abc", "1.2.3", "-5" if positive-only, leading-zero, scientific notation | new fill, edit, revert-to-original-disables-Save (LR-009) |
| Password | meets all policy criteria | min length, max length | missing-lower, missing-upper, missing-digit, missing-special; copy-paste in confirm | typically no per-field save — covered in user creation flow |
| Checkbox (native + Radix) | check, uncheck | n/a | n/a | toggle on→save, toggle off→save, toggle-then-revert (Save stays disabled per LR-009) |
| Dropdown / combobox (Radix) | each documented option | first option, last option (LR-025 retry for 50+ options) | invalid value via DOM tamper → server rejection | each-option save+reload |
| Cascading dropdown | parent→child population | empty child when no parent | invalid pair via API bypass | parent A → child A1 save; switch parent A→B, verify child resets |
| Multi-row FormArray (e.g. Notes) | 1 row, 2 rows, N rows | empty row, max-row content, +1 over limit (paste) | special chars, newlines, unicode, html-as-text | add+save, edit+save, delete-first/middle/last+save, clear+save, delete-all+save |
| Date / offset | valid range mid | min boundary, max boundary, ±1 day | invalid format, negative offset where positive-only (LR-008), Delivery < Prep (NM-1264) | each constraint-violation reverts; valid saves+reloads |
| File upload | valid file at half-max size | empty file, exact-max byte count, +1 byte | spoofed-extension (.exe→.png), invalid MIME, cancellation mid-stream | (future — no current Encore module uses) |
| Rich text / WYSIWYG | plain text save | formatting combinations (bold/italic/list) | XSS script tag (stored as literal), oversized payload | (future — no current Encore module uses) |
| Lookup launcher (read-only display + search dialog) | launcher opens dialog (assert title + filters + table headers + Select/Cancel render); each filter returns expected rows; row-select → display-field updates + Save enables | empty-result state (assert verbatim "no results" text — announced, not silent); single page when ≤ page-size → pagination/rows-per-page = (c); filter precision (ID-type filter → exact row, name-type → `toContain` multi-match, LR-022) | Cancel + Esc + Close-X each discard (no field change, Save stays disabled); Reset clears filters (check form taint, ACC-007); re-select current value → Save state (LR-009 net-zero probe) | select-different → Save → reload → verify persist → **restore by a unique anchor** (ID, not ambiguous name); **per-LAUNCHER when the dialog is shared** — each launcher needs its own select→display-update(→persist) proof (LR-057), never discharge launcher Y via launcher X |
| Click-to-edit grid cell | click non-input cell → input (spinbutton/text) materializes; Enter commits edited value; Tab commits and advances to next cell | single-char edit, max-length value (boundary of the revealed input's own type — delegate value-BVA to the matching §2 type row) | Escape restores prior value (assert cell reverts to pre-click content); click-elsewhere with uncommitted edit → revert or commit (MCP-verify per grid); rapid double-click does not produce duplicate inputs | activate→edit→Enter→save+reload→verify persisted; activate→edit→Tab→next-cell activates (chain); activate→Escape (no dirty state, Save stays disabled per LR-009); activate→edit→navigate-away→dirty prompt |
| Drag-and-drop source row | drag row to valid target → row reorders to new position; resulting visual order matches logical order | drag to first position; drag to last position; drag to same position (no-op, order unchanged) | drag to invalid/rejected target → row returns to origin; cancel mid-drag (Escape or release outside droppable zone) → row returns to origin; drag disabled row (if applicable) → no activation | reorder→save→reload→verify order persists; reorder→navigate-away→dirty prompt; multiple reorders before save→all persist in final order |
| Label-button boolean editor (grid cell) | click the label button (`Yes`/`No`) → an inline checkbox editor materializes mirroring the current value (activation alone is NOT a change — Save stays disabled); click the checkbox → value flips and the grid's toolbar Save/Cancel enable | n/a (boolean) | Cancel with a pending flip → the label restores the original value and the toolbar closes (Save/Cancel disable); flip-then-revert (flip the checkbox back) → Save disables again (LR-009 net-zero) | flip→toolbar-Save→reload→verify persisted; flip→Cancel discards (nothing reaches the server); commit rides the grid toolbar, NOT Enter/Tab. *Promoted 2026-08-26 from the Discount Matrix LOA `Active` column (TC-DSM-LOA-009 + dsm-loa-active-editor-probe.json / dsm-loa-toggle-dirty-probe.json). Distinct from `Checkbox` (renders a text label at rest; editor materializes on click) and from `Click-to-edit grid cell` (revealed editor is boolean; commit is toolbar-level, not per-cell).* |

**Deliberately omitted from §2 — Column-resize handles**: no data mutation occurs on resize (pure presentation), severity LOW, no field-case or save-cycle dimension exists. Resize behavior is a layout/UX concern, not a data-integrity concern coverable by the FCC axis. If a future module introduces resize-triggered persistence (e.g. column-width preferences saved server-side), promote to a §2 row at that time.

## §2.1 — Rejection-affordance oracle (MANDATORY on every Negative / BVA case)

The "Negative cases" and out-of-range "BVA cases" columns above generate the *input*; this oracle is the *assertion* they must carry. A binary "did it commit? (yes/no)" oracle is INSUFFICIENT — a field can reject input silently and trap the user, and a presence-only `expect()` will read that as a clean pass.

For every rejected / out-of-range value, assert BOTH:
- **(a) Announced** — a user-visible rejection signal appears: `aria-invalid="true"`, inline error text, a tooltip, or a toast. Poll it (LR-010, cross-field validation is async).
- **(b) Escapable** — a *natural* blur (Tab or click elsewhere) actually moves focus out of the field / closes the inline editor. Attempt the human-style blur and RECORD whether it worked **before** any cleanup `Escape`/`Esc` — never let the helper press Escape first, or it masks a focus-trap.

If neither (a) nor (b) holds → that is a defect (silent focus-trap / silent rejection), surfaced by the test, not swallowed. Two extra assertions on a case you already run — not a new case.

**Coverage rule:** any interactive editable field gets its type's full Negative/BVA set (with this oracle) even when another test also uses it as a "dirty lever." A field used only to dirty the form still needs its own boundary cases.

**Graduated from:** 2026-06-10 corp-pricing miss — `TC-LOC-CPR-523` asserted `tryMaxDiscount(150).toBe(false)` ("editor didn't commit") as a PASS and the helper auto-Escaped, masking a real silent focus-trap (Max Discount > 100 traps the cursor with no error, no escape). See `agent-mistakes.md` 2026-06-10 entry.

## §3 — Surface / Behavior Case Templates (Axis 2)

> The §2 templates cover one control at a time (Axis 1). A **grid / list / table / result surface**
> also needs *behavior* cases — pagination, sorting, etc. — which live *between* elements and are
> invisible to a field-only generator (the gap that let every Encore grid close green with zero
> pagination/sort/render cases). Per the [Standard](../../docs/read_only_docs/CASE_GENERATION_STANDARD.md)'s
> 7 active families. **QUICK** = L1 must-asserts; **DEEP** = L2/L3 exhaustive. Each surface case is an
> ordinary 3-segment TC (`TC-<MOD>-<SUB>-NNN`, continuing the page's band) with a `**Surface_Family**:
> <family> (QUICK|DEEP)` line — no `-SBC-`/`-SBC-MAX-` ID infix (3-segment grammar; a 4th segment fails
> `check-tc-parity` G6). Apply only the families whose **trigger** holds; for an inapplicable family
> record `out-of-scope:<family>=<reason ≥20 chars>` (LR-065). Each family needs ≥1 QUICK TC.

| Family | Trigger | QUICK (L1) — must-assert | DEEP (L2/L3) — exhaustive | Encore specifics |
|---|---|---|---|---|
| `result-fidelity` | a filter/search/query returns rows | one filter → returned rows actually match the query (right rows, no extras) | every filter + compound; server-side vs client-side semantics; mixed-result edge (e.g. State filter returning cross-state rows) | ID-type filter → exact row, name-type → `toContain` multi-match (LR-022); Corp Pricing Search filters server-side on the Search button (typing only STAGES); param contract per the search field-inventory |
| `pagination` | rows paginate / rows-per-page control exists | next/prev moves; rows-per-page change re-renders; no console error | all page sizes; partial last page; first/prev/next/last enable-disable at the ends; no dupes/skips across pages | rows-per-page 10/20/30/40/50 (Override grid); virtualized grids page server-side |
| `sorting` | a column header sorts | one column asc↔desc flips order | per-column asc/desc; numeric≠lexical ordering; sort+filter compose; sort persists across pages | Radix table sort = LR-025 large-option retry; assert by **content anchor, never row index** |
| `combination` | ≥2 of filter/sort/paginate coexist | filter + sort together returns a coherent set | full decision-table (multi-filter AND); Reset clears ALL; order-independence | Corp Pricing compound = single query with all staged params; Reset is client-side + idempotent |
| `render-state` | cells render links / booleans / badges / currency | a link-cell navigates; a boolean cell reads correctly | **EVERY link-cell navigates** (a non-link where a link is expected = *potential* bug → RCA → classify, **never blind auto-file**); boolean per format; badge correctness | **LR-036 boolean render differs per table** — Unicode `✔` / SVG `lucide-check` / Glyphicon / Radix `aria-checked`; branch per table, never assume one format. Currency badge USD/CAD/MXN |
| `empty-vol` | surface can be empty or large | "no results" message present + verbatim; a 1-row state renders | 0 / 1 / N rows; virtualization integrity (off-screen rows readable by content anchor); volume stress | Corp Pricing grids virtualized (~591 / 2430 / 3707 rows) — content-anchored reads, **NEVER a strict row count** (LR-022/LR-053) |
| `persistence` | surface state should survive | a sort or page-size survives reload | page-size / sort / active-filter survive reload + browser-back; dirty survives tab-switch; navigate-away-dirty prompt fires | "Unsaved changes" alertdialog on full nav-away (silent on sub-tab switch — verify per module); LR-009 revert ≠ pristine; LR-026 dirty-state defensive reload |

**Deferred families (no Encore templates yet — promote on first real need per §5):** `rbac` (Revenue-Management role gate, e.g. NM-2126 read-only vs edit), `concurrency` (rapid double-click / save-race), `platform` (cross-browser / responsive / viewport).

> **Deferred elements and launchers from §3:** when the walk artifact omits a surface family or element from the quick-coverage scope, record it using the `deferred-to-DEEP: <element/launcher id> (<reason ≥20 chars>)` token in the walk artifact Coverage Manifest (LR-072). The token marks the item as deep-only — it counts toward the LR-062 denominator but is excluded from the QUICK gate.

**State-transition save-flow model (method — applies to any page with Save, not a family):** `Clean → Dirty → Saving → Save-OK | Save-Failed`; `Dirty → Navigate-Away-Prompt → Stay | Leave`; `Dirty → Tab-Switch → (state preserved?)`; `Validation-Error → Fix → Dirty`; `Edit-to-original-value → Save-disabled`. Each transition = ≥1 case or a documented skip. (Closes the 2026-06-19 coverage-audit Part-2 state-transition gap; cases come from this model, not ad hoc.)

## §4 — Cross-refs (probe / rule companions)
- Archetypes (probe form): bug-archetypes.md ARCH-002 (non-numeric), ARCH-005 (parent-child cascade), ARCH-009 (missing-cascade), ARCH-010 (boundary/format), ARCH-013 (save-cycle 6-state), ARCH-014 (cross-field 6-dim)
- LR rules: LR-008 (date positivity), LR-009 (revert-to-original Save state), LR-010 (async cross-field validation poll), LR-011 (NaN reload), LR-022 (no hardcoded counts), LR-025 (Radix large-dropdown retry), LR-026 (dirty-state defensive reload), LR-051 (no OR-expression asserts), LR-052 (no fixed waitForTimeout in poll), LR-053 (no strict row count w/ placeholder bug), **LR-065 (§3 surface-family disposition `behavior-cases:` folds into the LR-062 100% gate)**, LR-062 (machine-enumerated walk-coverage denominator), LR-057 (affordance probe + no-taxonomy-row → brain-first live probe)
- Authoring hygiene: tc-authoring-rules.md Rules 1–5
- Runner: src/utils/field-case-runner.ts
- Source: external QA framework guide (digested 2026-05-19 — see PLAN_BIG_PIVOT_FCC_MASTER and SUBPLAN_NOTES_FCC_PILOT)

## §5 — Interaction-Axis Taxonomy (Axis 3 — per-element-class mandatory effects)

> **Extends** §2 (Axis 1, field-type) and §3 (Axis 2, surface-behavior) with a THIRD axis:
> per-interactive-element-class effect-assertions. Where §2 generates cases per field type and §3
> per surface behavior family, §5 generates cases per element class — the mandatory effects each
> interactive element must demonstrate.
>
> **Source**: PLAN_FORCED_DISCOVERY_LOCATOR_EXHAUSTION design core (2026-07-17).
>
> **Anti-silence (R4)**: every row carries a machine-checkable emission requirement. A row that a
> walker can satisfy by producing no output is decoration, not a mandate. Silence is a detectable
> schema violation, never an ambiguous pass. For each class, a walker MUST emit one of: `PROBED`
> (with effect observations), `DATA-BLOCKED` (with blocking reason + unlock), or `UNCLASSIFIED`
> (with what was seen). Missing emission = schema rejection by
> `scripts/walk-coverage/interaction-map-schema.mjs`.
>
> **DATA-BLOCKED protocol**: when a walker cannot exercise a case, it MUST emit `DATA-BLOCKED` with:
> (a) `dataBlockedReason` — why the case could not be exercised,
> (b) `dataBlockedUnlock` — what resource would make it exercisable.
> "I couldn't test it so I said nothing" is a schema violation, not a quiet pass.
>
> **Schema**: `scripts/walk-coverage/interaction-map-schema.mjs` (version 1.0.0).
> **Drone probes**: `scripts/walk-coverage/drone-probes.mjs` (per-class deterministic sequences).
> **Invariant generator**: `scripts/walk-coverage/generate-invariants.mjs` (metamodel → I1–I11 set).

| # | Element class | Mandatory case(s) | Emission requirement (R4) | Phase 0 RCA disposition |
|---|---|---|---|---|
| 1 | filter (checkbox / dropdown / searchbox) | Asserted EFFECT on the row set, both directions; a zero-delta observation is NEVER terminal — routes to the Zero-Effect Probe Protocol (differential-data ladder). | `PROBED` with `effectObserved:boolean` + `probes[]`. Zero-delta auto-files as structured suspicion. | CONFIRMED — RCA-MATRIX Gap 1 (Systemic Cause A). Effect-assertion mandate is correct; gaps arose from planner rubber-stamping cited TCs without verifying what those TCs assert, not from a taxonomy deficiency. Currency filter effect (matrix row 2) shares the same systemic cause; that row is never labeled in RCA prose. |
| 2 | sort | Order actually changes, per sortable column. | `PROBED` with `effectObserved:boolean` per column. | No RCA row bears on this class. |
| 3 | pagination / rows-per-page | Page actually changes; requires a data-bed office (see data doctrine). | `PROBED` or `DATA-BLOCKED` (with unlock naming required row count). | CONFIRMED — RCA-MATRIX Gap 6 (DATA-BLOCKED-SILENT). Mandate is correct; the gap was conditional data-block accepted as terminal without searching for a qualifying office (tenant-wide export showed office 9460 with 216 rows). "Data-bed office" note aligns with the Systemic Cause B finding. |
| 4 | editable cell / input | Accepts input + Save-cycle + persistence + recovery. | `PROBED` with `effectObserved:boolean`. | CONFIRMED — RCA-MATRIX Gap 8 (NM-1932, DATA-BLOCKED-SILENT). Save-cycle + persistence mandate is correct; the gap was data-doctrine rung-1 SELF-PRODUCE not attempted (a blank Override Price row was self-producible; office 1115 had one in the export). Class definition requires no adjustment. |
| 5 | guard | Dirty-state prompt appears AND both prompt actions (Stay / Leave) honored. Navigate-away is mandatory, not deferred to DEEP. | `PROBED` with `effectObserved:boolean`. | CONFIRMED — RCA-MATRIX Gap 4 (TAXONOMY-HOLE). Gap 4 identifies that dirty-state guard was never tested because §3 QUICK persistence excluded navigate-away (DEEP/L2 only); §5 class 5 fills that taxonomy hole by mandating dirty-state guard unconditionally at QUICK depth. Permanent-fix input: explicitly seed dirty-state guard and navigate-away in SHADOW_EDGE rather than leaving them to /ultracoverage discovery. |
| 6 | io (export / import) | Real file round-trip, or an explicit evidence-backed blocker. Round-trip = system's own export accepted by own import (I9 invariant). | `PROBED` or `DATA-BLOCKED`. | CONFIRMED — RCA-MATRIX Gap 7 (DATA-BLOCKED-ESCALATED). Gap 7 was properly handled: explicit evidence-backed blocker documented (filed 1604 import defect), escalated to SUBPLAN_CORP_PRICING_OVERRIDE_PICKER_1101.md. `DATA-BLOCKED` with evidence is the correct allowed outcome. |
| 7 | menu / disclosure | Every item enumerated; state-changing items exercised + restored. **Reset/restore-default affordances are mandatory probes** — omitting a reset item while exercising other menu items is a partial-implementation gap (RCA gap 3). | `PROBED` per item. Each menu item individually emitted. | ADJUSTED — RCA-MATRIX Gap 3 (SILENT-OMISSION). "Reset/restore-default affordances are mandatory probes" text was added as a direct result of Gap 3 (Grid Options Reset to Default never clicked/asserted; planned in NM2267 Phase 1B.3 but silently omitted with no drop disposition). |
| 8 | add / picker affordances | Flow driven to commit on a designated office, or user-authorized deferral. | `PROBED` or `DATA-BLOCKED` or `USER-AUTHORIZED-DEFERRAL`. | CONFIRMED — RCA-MATRIX Gap 9 (USER-AUTHORIZED-DEFERRAL). Gap 9 was properly authorized and parked (human review approval in NM2267:lines 377–380; LR-040(c) recipient confirmed). `USER-AUTHORIZED-DEFERRAL` is the correct legal outcome and is already present in the emission requirement. |
| 9 | context-selector | Scope-gating control whose effect is loading/replacing the entire data context (e.g. Change Local Office). **The selector's own option set MUST be cross-checked against a second, independent source. The selector is not permitted to be its own oracle.** The second source must be named (API list, sibling screen, export, DB count). | `PROBED` with `effectObserved:boolean` + `secondSource:{type, ref}`. Missing `secondSource` = R3 schema rejection. | No RCA row bears on this class. |

**Unclassifiable elements (residual-1 floor)**: an element the extractor cannot classify into any of the 9 classes above is a LOUD UNKNOWN — emitted as `UNCLASSIFIED` with a description of what was seen. It blocks closure (never silence). Detection survives; auto-generation of that type's invariant waits until the type is taught once.

## §6 — Promotion criteria
- The framework-level methodology already lives at [`docs/read_only_docs/CASE_GENERATION_STANDARD.md`](../../docs/read_only_docs/CASE_GENERATION_STANDARD.md) (the Standard). When a **second client** lands, it authors its own `<client>/.../field-case-generation.md` instance against that Standard — this file is no longer promoted (it stays the Encore instance).
- When a **new field type** appears in any module → append a row to §2 with positive/BVA/negative/save-cycle templates (+ §2.1 oracle).
- When a **new surface behavior** appears that the 7 families don't cover → add it as an 8th family in BOTH the Standard and §3 here (don't stretch an existing family).
- When a **deferred family becomes needed** (`rbac` / `concurrency` / `platform`) → promote it to an active §3 row with templates.
- When a new ARCH-NNN archetype lands in bug-archetypes.md and overlaps a row in §2/§3 → cross-link.
