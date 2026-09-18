---
description: Field-inventory artifact + walkthrough + DOM-verify discipline
paths:
  - "specs_planning/_internal/**/*.md"
  - "specs_planning/_internal/field-inventories/**/*.md"
  - "src/selectors/**/*.ts"
---

# Field Inventory & Walkthrough Discipline

Path-scoped rule pack — loads when authoring or consuming field-inventory artifacts, walkthroughs, or selector files.

## LR-007: MCP-verify the planner's field-inventory artifact via spot-check (amended by SP-AAE-04, 2026-04-25)

Before writing ANY test assertion, verify the planner's field-inventory artifact by **spot-checking 2–3 random fields** on the live DOM (testid resolves, default value matches, enabled/disabled state matches). A full re-walk of every planner claim is required ONLY when the spot-check detects drift, the artifact is missing, or it is >30 days stale (per AAE-D6). This cuts generator+auditor DOM traversal from 3× to 1× per module per cycle while preserving verification when drift is real.

**Drift handling**: any disagreement on (testid resolves / default matches / state matches) across the 3 spot-checked fields = `DRIFT_DETECTED` → fall through to full UI walkthrough (generator Phase 0.5b / auditor Mode 2 step 2b) AND emit a refreshed dated artifact.

**Original spirit retained**: Never trust planner data without live verification. The planner is OFTEN wrong. Pre-amendment incident — Opus skipped this step entirely and caused 5 of 8 generator failures (LOS 2026-03-24, 47 spec issues). Post-amendment, the spot-check IS the verification — skip it and you re-create the same failure class on top of a stale artifact.

**Trigger**: Every generator session start AND every WATCHDOG agent-audit (Mode 2) session. Enforced by PF-G5 gate (accepts the spot-check WALKTHROUGH_LOG as valid walkthrough evidence per LR-013).

## LR-013: Phase 0.5 is MANDATORY — walkthrough before code, artifact before complete

Generator MUST complete Phase 0.5 walkthrough as its FIRST action before writing any spec code, page object, or test data. The pre-run gate (PF-G5) WILL halt on retry if walkthrough is missing or invalid. On first run the gate warns — but skipping Phase 0.5 guarantees failure.

**Phase 0.5 completion gate** (graduated from SP-AAE-03, 2026-04-23; amended by SP-AAE-04, 2026-04-25): the walkthrough is complete via EITHER of two satisfaction paths:

(a) **Fresh-artifact spot-check path** (preferred — generator Phase 0.5a / auditor Mode 2 step 2a): a field-inventory artifact at `specs_planning/_internal/field-inventories/<module>-<YYYY-MM-DD>.md` exists with `MCP_Session_Date` ≤14 days from today (or 14–30 days with a logged `STALENESS_WARNING`); the consumer reads it, spot-checks 2–3 random fields on live DOM, and ALL spot-checked fields agree on (testid resolves / default matches / enabled-disabled matches). The 3-row spot-check WALKTHROUGH_LOG IS valid Phase 0.5 evidence — no full re-walk is required.

(b) **Emit-new-artifact path** (fallback — generator Phase 0.5b / auditor Mode 2 step 2b): no artifact exists, the artifact is >30 days stale (`Stale-after` per AAE-D6), OR the spot-check detected drift. The consumer runs the full per-TC live walkthrough AND emits/refreshes the dated field-inventory artifact at the end.

Both paths require: all 8 mandatory frontmatter keys and 7 mandatory sections per `field-inventory-spec.md`; `## Field Inventory` table with a non-empty row (data-testid or LR-014 fallback) for every interactive field; `MCP_Session_Date` equal to the filename date.

Planner emits via PLN-049; generator + auditor consume the artifact via spot-check (SP-AAE-04 amended LR-007 + LR-013 to make spot-check the canonical verification — full re-walk is now the drift fallback, not the default). SP-AAE-02 pre-commit hook rejects TC-MD edits lacking a same-module artifact ≤14 days old. Static catalog-pivot sessions that never call `browser_navigate` are structurally exempt (Phase 1/2 not executed).

**Trigger**: Every generator session start AND every planner Phase 1/2 Manual QA session that walks live DOM AND every WATCHDOG Mode 2 agent audit. Enforced by PF-G5 gate + SP-AAE-02 pre-commit hook (PF-G5 accepts the 3-row spot-check log as valid walkthrough evidence post-SP-AAE-04).

## LR-014: FIELD INVENTORY testid column must be complete

Every row in planner's FIELD INVENTORY must have a non-empty data-testid value or explicit fallback strategy "(no testid — use aria-label/text)". Blank testid cells cause generator to guess selectors → spec failures. Planner rule PLN-039.

**Genuinely-missing-testid → next-best locator + tracked gap (testid-first golden rule, 2026-07-06 — supersedes the 2026-06-22 fixme clause):** the fallback strategy above applies to EVERY control that lacks a `data-testid` — whether it *legitimately cannot* carry one (native browser widgets, third-party / iframe content) OR *could and should* but the app does not expose one. In both cases: **(1)** confirm the testid is genuinely absent on the LIVE DOM (LR-029 — a selector file is not proof); **(2)** select the **next-best stable locator** (accessible role / name / label / stable attribute); **(3)** **run the test with it** — a missing testid is NEVER a reason to `fixme`/skip or lose coverage; **(4)** record the gap — set the inventory row's testid cell to `(MISSING — using <locator-kind>; tracked in testid-gap-report)` and add the control to the dated `testid-gap-report`, rolled up to ONE module-level client ask. When the dev team later adds the testid, **switch the selector back** to it, atomically with the LR-019 baseline harden (LR-021 corollary). The `could-and-should` gaps are the ones that populate the client ask; the `legitimately-cannot` ones are recorded as baseline-only / n/a. This **reverses** the prior "green-via-fallback is false confidence → fixme" position — a test running on a *tracked* fallback is the correct behavior, not false confidence, because the gap is visible in the report and switched back when the testid lands. LR-029 (live-DOM verification) and the missing-testid report path (`TESTID_MISSING` → report / ALL-056) are **unchanged**. **Scope: applies to all selector/spec work from 2026-07-06; specs previously `fixme`'d for a missing testid may be un-fixme'd onto a tracked fallback as they are next touched (not a mandated sweep).**
**Trigger**: Every planner session producing FIELD INVENTORY; every generator/spec session about to select a control that could-and-should have a testid but lacks one.

## LR-015: Default values and states come from dated MCP sessions only

Default field values, enabled/disabled states, and dropdown option lists must come from a DOM read on a dated MCP session. The FIELD INVENTORY date is the timestamp. Structural counts (tab count, column headers) must match FIELD INVENTORY but don't need separate tags. Never hardcode a server-data value without MCP proof.
**Trigger**: Any test data constant or assertion on default state.

## LR-016: Accessibility tree element types do NOT match actual HTML tags

The Playwright accessibility tree reports `img` for SVG elements, `row` for `<tr>`, `cell` for `<td>`, etc. NEVER derive CSS selectors from accessibility tree element types. Always verify actual HTML tag via `browser_evaluate(() => el.tagName)` before writing selectors like `svg`, `img`, `tr`, `td`. The accessibility tree is for FINDING elements, not for understanding their DOM structure.
**Trigger**: Any Phase 0.5 walkthrough or healer session examining DOM structure.

## LR-029: Never audit selectors without live DOM verification

When auditing data-testid coverage or generating missing-testid reports: NEVER audit selector files alone — always verify against the LIVE DOM via MCP. Selector files show what WE USE, not what EXISTS in the app. The app may have data-testids we never adopted, or testids may have been added since we wrote our selectors. Auditing files without DOM = false positives = embarrassment.

Pattern: navigate to each page/tab, run `document.querySelectorAll('[data-testid]')`, cross-reference against our selector values.

**Trigger**: Any task involving testid coverage analysis or bug reporting to external teams.
**Graduated from**: Session 2026-04-09 — 17 false positives found in MISSING_TESTID_REPORT.md.

## LR-057: Affordance probe is MANDATORY before classifying any field read-only / static / disabled

A field row may record a non-editable Control Type (read-only / static / disabled) ONLY after a **live click-probe** of all three of: (1) the control, (2) its label, (3) its row/container. The probe result is recorded as an `affordance:` token in the field's Notes:

- `affordance: none` — nothing interactive (genuinely static)
- `affordance: launcher → "<dialog title verbatim>"` — opens a dialog/picker
- `affordance: navigation → <target>` — navigates elsewhere
- `affordance: popover → <name>` — opens an inline popover

A non-editable display input is NOT proof the field is non-interactive — the interactive affordance frequently lives on the **label** (which a disabled-input `for=` association can hide from a naive Playwright click) or the container. Probe all three.

**Baseline-divergence clause**: a baseline-vs-new divergence of class "interactive on baseline / static on new" may **NEVER** be closed as "(b) intentional UX change" without a **new-site click-probe**. Unprobed closes of that class are audit findings (this is exactly how BL-DIV-4 / Pay To Address was missed — the old-site link was seen, but the new site was assumed static without probing).

**Per-launcher coverage clause**: when ONE dialog serves MULTIPLE launchers, coverage is dedup'd **per-LAUNCHER, never per-dialog**. Every launcher needs its own `select → field-update (→ persist)` proof. "The dialog is tested" (via launcher X) does NOT discharge launcher Y — the same dialog can behave differently per entry point (proven 2026-06-11: the shared "Select Customer Address" dialog persists from the Master Bill To launcher but NOT from the Venue launcher).

**No-taxonomy-row clause (case-completeness backstop — brain-first, amended 2026-06-24 SUBPLAN_CGS_A)**: if an inventoried Control Type / `affordance:` value (field) has NO matching case-template row in `field-case-generation.md` §2, OR a grid/list/table/result surface has a behavior with no matching §3 surface-family row, do **NOT** HALT first. **Brain-first live probe** (SFDPOT-style: click / junk input / valid input / empty / Tab-blur / Save / reload) → **write cases from the observed behavior** → run `/research` to confirm the standard angles for that type → append the new template row per `field-case-generation.md` §5 (promotion) → **HALT only as a last resort** if hands-on genuinely can't crack it. A field/surface kind without a template NEVER passes silently with zero cases; "call the walk done" with unfilled cells is still forbidden — but the resolution is **live exploration**, not a dead stop. (Cross-ref the Standard's "Unknown type → brain-first" section + LR-065.)

**LR-013 spot-check extension**: the LR-013 spot-check oracle gains a 4th check — on sampled fields, the `affordance:` token is present AND probe-confirmed (not just testid-resolves / default-matches / state-matches).

**Trigger**: every field-inventory walk (HUNTER/GIVER), every catalog/gap-matrix authoring, every WATCHDOG completeness audit, every baseline-divergence classification. [AGENT-DISCIPLINE] Enforced by PLANNER HARD STOP #18 + REQUIREMENTS HARD STOP #9 + the `field-inventory-spec.md` `affordance:` token mandate + master Sweep 12 (`UNPROBED-AFFORDANCE`) — these are prose instructions agents follow; no automated hook fires independently.

**Graduated from**: 2026-06-11 — Pay To Address / BL-DIV-4 (TOTAL miss: a launcher dialog classified as a plain disabled textbox by the 2026-06-03 left-panel walk) + Master Bill To shared-dialog conflation (PARTIAL miss: dialog-level coverage via Venue treated as per-launcher coverage). Both user-discovered. RCA: `specs_planning/_internal/rca-launcher-dialog-misses-2026-06-11.md`. Co-landed with SUBPLAN_LAUNCHER_DIALOG_GAPS_FCC.

## LR-062: A walk is complete only when a machine-enumerated denominator is fully dispositioned + cross-verified

A "walk" — field-inventory walk (HUNTER/GIVER), old-site baseline walk, or WATCHDOG audit re-walk of a live page — is complete ONLY when ALL of:
1. A **machine-enumerated denominator** exists, produced by `scripts/walk-coverage/enumerate-page.mjs` (the live page enumerates every interactive element itself; the agent does NOT define what counts). Heuristic-A v2 net + Pass-B focusable + CDP `getEventListeners` G1-recovery, shadow-piercing, self-expanding to a fixpoint.
2. **Every** element in the union (A∪B) denominator is dispositioned — `covered-by-TC: <TC-ID>` / `affordance-probed: <LR-057 token>` / `read-only-verified` / `out-of-scope: <reason ≥20 chars>` / `deferred-to-DEEP: <element/launcher id> (<reason ≥20 chars>)` (quick-tier plans only — see LR-072; **G1**: a deferral row carries NO classification claim alongside it — validator FAIL if any other disposition token co-appears). No blanks.
3. `CrossCheck: clean` — every symmetric-difference (A△B) review-set element is classified.
4. `Coverage_Ratio` = 100%.
5. **Provenance is machine-bound (SUBPLAN_CGS_B_WALK_INTEGRITY, 2026-06-24)** — completeness alone never asked *whether* an observation-claiming disposition was actually OBSERVED live or merely classified-from-spec (the corp-pricing rewalk flipped DONE with controls classified from the Jira spec instead of live-clicked, and the gate passed). So every disposition that *claims observation* — `affordance-probed`, `read-only-verified`, or a live `covered-by-TC` — MUST carry `provenance: live` AND a cited machine-emitted `evidence:` artifact (a `playwright-cli` network-row endpoint+200+server-timestamp / snapshot / screenshot). `provenance: oracle` = classified-from-spec and is **FORBIDDEN on an observation-claiming row** — if it was never live-observed, move it to `out-of-scope: <reason ≥20 chars>` (honest inference, never provenance-gated) rather than mis-claiming a probe. The cited evidence must (a) exist, (b) not be stale/reused (its embedded date ≥ the walk's `MCP_Session_Date`), and (c) name that control/endpoint. A `covered-by-TC` row carries its TC-ID as inherent evidence (the runnable spec) and is not evidence-gated, but a `covered-by-TC` that *also* declares `provenance: oracle` is self-contradictory and is rejected. The per-row `evidence:` pointer + Opus verdict live in the existing `walk-evidence-<module>-<DATE>.md` (LR-064) — and the evidence file itself is **emitted by `playwright-cli`, never hand-authored**: a PreToolUse gate (`.claude/hooks/lib/check-todo-injection.mjs` `isEvidenceDirTarget`) denies agent `Edit`/`Write` into `.playwright-cli/`. **This sub-gate is itself date-gated**: artifacts whose `MCP_Session_Date` precedes **2026-06-24** are provenance-grandfathered (conditions 1–4 still apply when they post-date 2026-06-19), so it never retroactively fails the pre-existing manifests (e.g. `pricing-2026-06-19`).

A self-labeled `coverageScope: PARTIAL` is NOT a valid stopping point — it is superseded by the computed `Coverage_Ratio`. The agent no longer defines both *what* to walk and *whether it is done*; it only assigns a disposition to every machine-enumerated element — and it cannot fake *how* that disposition was reached, because an observation claim now demands un-fakeable machine evidence (condition 5).

**Enforcement**: closure check Cx (`scripts/validate-plan-closure.mjs`, NON-overridable, rolling out via `coverage_mode` in `.claude/closure-config.json` — land `announce`, ramp to `deny`) DENIES `Status: DONE` on any plan whose Per-Identity matrix cites a walk-driven artifact (field-inventory / old-site-baseline) with `Coverage_Ratio` < 100% / undispositioned rows / `CrossCheck` ≠ clean / `coverageScope: PARTIAL` / **a `provenance: oracle`, missing-provenance, or missing-or-stale-evidence observation row (condition 5)**. The shared verdict function (`scripts/walk-coverage/lib/coverage-manifest.mjs` `coverageVerdict`) returns `provenanceFail` for the condition-5 class, so BOTH importers inherit it — closure Cx (preventive, DENY) and the execution-completion Stop hook (detective, WARN). A condition-5 failure is **FABRICATION-class**: it fails the *whole* plan closure AND writes an append-only integrity strike to `.claude/state/integrity-strikes.jsonl` (the collective penalty — a fabricated walk submitted for closure is recorded durably, never quietly laundered). Plus the REQUIREMENTS/PLANNER + WATCHDOG HARD STOPs and the execution-completion Stop-hook second branch.

**Grandfather**: artifacts whose `MCP_Session_Date` precedes the coverage landing date (2026-06-19) are exempt from conditions 1–4 until their next refresh; the provenance condition (5) is separately grandfathered before its own landing date (2026-06-24).

**Trigger**: every field-inventory walk, old-site baseline walk, WATCHDOG completeness audit, and any closure of a plan citing such an artifact; every coverage-bearing subplan authoring session (CoverageMode declaration — LR-072).
**Graduated from**: 2026-06-18 Pricing FCC partial-walk-taken-as-done incident; PLAN_EXHAUSTIVE_WALK_GUARANTEE (2026-06-19). Condition 5 (machine-bound provenance) + the integrity strike added 2026-06-24 by SUBPLAN_CGS_B_WALK_INTEGRITY (the corp-pricing rewalk flipped DONE with controls classified-from-spec, not live-clicked; completeness passed but provenance was never checked). Cross-refs LR-013, LR-057, LR-029, LR-055, LR-060, LR-064.

## LR-064: Tiered Delegated Walk (TDW) — the DEFAULT walk procedure; Opus judges, Haiku/Sonnet do the clicking

The default execution procedure for any field-gathering walk (HUNTER baseline/intake, GIVER field-inventory per PLN-049, WATCHDOG audit re-walk). Where **LR-062** defines *when a walk is complete* (machine-enumerated denominator fully dispositioned + cross-verified), **LR-064** defines *how to conduct it efficiently without losing one case*: delegate the **labor** (mechanical input-trials), never the **judgment** (denominator, case taxonomy, per-field disposition). There is **no `/walk` skill** — TDW is auto-triggered inside an agent's walk phase, never user-typed; walker agents just "run the TDW walk per LR-064."

**The 4 stages:**

1. **Recon (Opus, one cheap pass)** — open the page once; `scripts/walk-coverage/enumerate-page.mjs` produces the LR-062 machine denominator (every interactive element). Opus classifies each element's type + the exact `field-case-generation.md` §2 case-set it needs (including the §2.1 rejection-affordance oracle on every Negative / BVA case) **AND, for any grid / list / table / result surface, the applicable `field-case-generation.md` §3 surface/behavior families it needs (per LR-065 — emit the `behavior-cases:<families>` disposition, not just §2 field cases)**, and emits a **probe worklist** (field/surface × exact inputs to try × expected oracle to capture). Workers never decide *what* to test.
2. **Dispatch (cheapest-capable tier)** — per field: **Haiku** = simple deterministic fields (plain text / checkbox / single-value); **Sonnet** = harder (cascading dropdown / multi-row FormArray / launcher dialog) OR when Haiku's report fails the Stage-3 quality check; **Opus-self** = both tiers failed or the field is genuinely adaptive / ambiguous. Each worker gets the EXACT inputs + EXACT oracle, runs `playwright-cli` (Bash, headless, `state-load` of the shared auth — parallel-safe per the verified CLI memory), captures **raw** evidence (DOM value / `aria-invalid` / inline-error text / network 2xx / post-reload value), writes its per-field evidence, and reports. Workers do NOT decide scope or cases. Authorized by the CLAUDE.md Model-Aware Guardrails deterministic-probe-delegation clause — Bash `playwright-cli` only, NOT the MCP browser; RCA / judgment / coverage-decisions stay Opus.
3. **Verify (Opus, per report — NO rubber-stamping) `[STRICT — non-droppable]`** — for every worker report Opus checks: all required inputs tried (coverage)? evidence is *raw values*, not vague prose? §2.1 oracle satisfied (rejection announced AND escapable)? laziness smells (missing inputs / "couldn't find" / "looks fine" / no raw DOM value)? → REJECT + escalate one tier. Opus writes a **one-line verdict per field** (tier used / accepted / re-done by tier-N / why) into the proof-of-work trail. This mirrors the `/rca` mama rule — *"mama rubber-stamping subagent output is part of the failure mode, not the corrective."* The per-field verdict AND the rubber-stamp-smell rejection list are load-bearing: drop either and the no-coverage-loss guarantee degrades to hand-wave.
4. **Disposition (Opus)** — disposition every denominator element from the *verified* reports into the field-inventory per LR-062 (`Coverage_Ratio 100%`, `CrossCheck: clean`, no blanks). Ownership never left Opus: Opus will not disposition an element until its probe is satisfactorily verified — so a lazy worker report can only trigger a re-do / escalate, never quietly drop or mis-fill a cell.

**Stage 3 — Blind independent re-drive (SUBPLAN_CGS_B_WALK_INTEGRITY) `[STRICT — non-droppable]`** — Stage 3 verification gains a second arm: for the `provenance: live` rows (LR-062 condition 5), a SECOND cheap worker — **blind**: handed the field + exact inputs but NOT the first worker's answer / disposition / cited evidence — re-drives a RANDOM SAMPLE of those rows and captures its OWN raw evidence. Any contradiction between the re-drive and the originally-cited evidence → REJECT that disposition (it cannot close) and escalate one tier. This is the un-fakeable cross-check that makes `provenance: live` mean *independently reproduced*, not *asserted once*; it mirrors the blind-parity discipline (`feedback_blind_parity_proof.md` — the verifier never sees the answer-key).

**Delegation-down HALT (SUBPLAN_CGS_B_WALK_INTEGRITY) `[STRICT]`** — if the worker ladder is unavailable (no cheaper tier can run) AND Opus itself cannot finish a strict live-walk within budget, the walk **HALTs and reports the un-walked remainder** — it is NEVER closed by oracle-classifying the un-observed controls. `provenance: oracle` on an observation row is rejected by the LR-062 condition-5 gate anyway, so "classify-from-spec and close" is no longer even an available shortcut; the only honest exits are (a) finish the live-walk, (b) HALT + report, or (c) mark the genuinely-out-of-scope elements `out-of-scope: <reason>`. Closing an un-finishable live-walk by classifying-from-spec is the exact 2026-06-18 corp-pricing miss this rule exists to prevent — the LR-060 sibling principle ("env defers only the env-blocked step") applies: a missing worker defers only the un-walked rows, it never licenses fabricating them.

**Proof-of-work trail (REUSES the existing artifact — no new types):** the per-field tier + raw evidence + Opus verdict live in the existing `specs_planning/_internal/walk-evidence-<module>-<DATE>.md`, which gains a per-field row — *worker tier used · raw evidence (DOM value / aria-invalid / inline-error / network 2xx / post-reload value / **`anomaly:` — any "looked wrong / broken / overflowing / sideways" note the worker flags, even outside its assigned oracle**) · Opus verdict (accepted / re-done by tier-N / why)*. No `walk-probes/` directory and no `walk-judgment-*` file — those were over-engineering and must NOT reappear.

**`## Observations` section (ALL-045 — MANDATORY on every walk-evidence file):** the same artifact carries a top-level `## Observations` section with two buckets — **`### Bugs / Defects`** (HIGH prio: any UI/UX/layout/rendering/behavior/accessibility defect noticed during the walk → one row per finding naming the surface + what's wrong + a `BUG-` id once filed per LR-034, or `BUG-CANDIDATE` while pending MCP-confirm) and **`### Suggestions / Improvements`** (LOW prio: enhancement / missing-feature ideas the agent believes could help, plus ambiguous discussion-items per `feedback_discussion_item_not_bug.md` → recorded for later triage, mostly deferred unless big). The section is **non-optional**: a walk with nothing to report writes the literal `none` under each bucket — an *absent* `## Observations` section is an incomplete walk (enforced at closure by the LR-062 gate; WATCHDOG audits the buckets for rubber-stamped `none` per its HARD STOP #3). This is the recording slot the coverage-only disposition vocabulary (LR-062) structurally lacked: a walker who SEES a defect or improvement now has a mandated home for it, separate from the per-element coverage dispositions. A render-state defect must be SEEN to be recorded — drive the error/invalid state and look (Chrome / element screenshot / `boundingBox` geometry), never infer integrity from `aria-invalid` alone (false-green, WCAG ARIA21).

**Why ZERO coverage loss (the hard constraint):** the denominator (LR-062), the case taxonomy (§2), and the per-field disposition are ALL Opus-owned; workers are *executors of pre-specified probes*, not *deciders of scope*. The defense is layered, not single-point — the "filled-but-false disposition" attack (Opus rubber-stamps a thin report → a non-blank-but-WRONG cell that the no-blank gate would pass) is caught by (a)+(b)+(e):
- (a) Stage-3 per-field Opus verdict with the explicit rubber-stamp-smell rejection list `[STRICT]`;
- (b) **WATCHDOG audits the verdict trail** for rubber-stamped fields `[STRICT — AUDIT.md HARD STOP #11]`;
- (c) the LR-062 machine no-blank closure gate (catches *empty* cells);
- (d) the parity proof below before the engine becomes default;
- (e) the **blind independent re-drive** (Stage 3) + the **LR-062 condition-5 provenance gate** — together these catch the *fabricated observation claim*: a non-blank cell whose `affordance-probed` / `read-only-verified` disposition was never actually live-observed (classified-from-spec). The no-blank gate (c) cannot see this (the cell is filled); (a)/(b) rely on Opus/WATCHDOG judgement; (e) makes it MACHINE-checkable — the disposition must cite un-fakeable, independently-reproduced evidence or the closure gate DENIES.

**Default-flip is parity-gated:** TDW is the default *procedure* on landing, but any future change to the walk engine itself does NOT flip to the unconditional default until a parity re-walk of an already-covered module reproduces its known-good field-inventory EXACTLY (emit `walk-parity-<module>-<DATE>.md`, a one-off proof artifact — a before/after diff record that `walk-evidence` cannot serve). Parity first proven against `pricing-2026-06-19.md` on 2026-06-22 (`walk-parity-pricing-2026-06-22.md`): **denominator parity EXACT** (79/79 — full structural fingerprint identical: set-algebra 79/48/31, G1 recovery, cascade branch, role distribution) AND **disposition parity EXACT on coverage** via a full 79-element BLIND delegated walk (1 Haiku + 3 Sonnet workers, no answer-key, no tweaking) — every in-scope Pricing coverage disposition independently corroborated, out-of-scope/scope assignments Opus-owned, zero coverage lost.

**Worker model-class ladder:** Haiku → Sonnet → Opus-self, escalating by field complexity OR on a failed Stage-3 verdict (cross-ref CLAUDE.md Model-Aware Guardrails). Honest caveat: if Haiku fails often the re-do overhead eats the savings — start Haiku on trivial fields only, measure, tune.

**TDW-Q profile — quick-mode walk deltas (CoverageMode: quick, LR-072):**

| Mechanism | Deep (today, unchanged) | Quick profile |
|---|---|---|
| Stage 1 — recon + machine enumeration | full | **UNCHANGED** — denominator is always machine-owned; tier never touches enumeration |
| Stage 2 — per-field probes | every element | only elements needed for L1 §2 cases + applicable §3 QUICK families + anything the owner names; remaining elements → `deferred-to-DEEP: <id> (<reason ≥20 chars>)` |
| Stage 3 — blind re-drive | random sample of live rows | retained (anti-fabrication is tier-independent) at reduced floor: **min(3, live-row count)** instead of the deep sample |
| Stage 4 — disposition | every element | unchanged; `deferred-to-DEEP` counts as dispositioned (Coverage_Ratio stays 100%) |

**Trigger**: every field-inventory walk (HUNTER / GIVER per PLN-049), old-site baseline walk, and WATCHDOG audit re-walk — the default execution model for all three. [AGENT-DISCIPLINE] Enforced by REQUIREMENTS HARD STOP #11 + PLANNER HARD STOP #19 + AUDIT HARD STOP #11 (the no-disposition-from-unverified-report clause) + the CLAUDE.md guardrail delegation clause — these are prose instructions agents follow; no automated hook fires independently.
**Graduated from**: PLAN_TIERED_DELEGATED_WALK (2026-06-22) — make the walk efficient by delegating the labor, never the judgment; parity-proven against Pricing before becoming default. Cross-refs LR-062 (completeness denominator), LR-057 (affordance probe), LR-007 / LR-013 (spot-check verification), LR-032 / LR-059 (real-verification, no theorizing), `/rca` mama rule (no rubber-stamp), AUD-017 (synthesis ≠ oracle).

## LR-065: Grid/list/table surfaces carry behavior-cases — the surface axis folds into the LR-062 100% gate

LR-062 makes a walk complete only when every machine-enumerated element is dispositioned. But a grid's *behaviors* — pagination, sorting, result-fidelity, render-state, empty/volume, combination, persistence — live BETWEEN elements: a field-only disposition can mark every cell `covered-by-TC` while the grid has **zero** pagination/sort/render tests (verified: zero such tests across the corp-pricing specs). LR-065 closes that hole.

**The rule**: any element dispositioned as — or contained by — a **grid / list / table / result surface** archetype carries an additional disposition token `behavior-cases:<families>` enumerating which [`field-case-generation.md`](../../specs_planning/_internal/field-case-generation.md) §3 surface families apply, with:

- **≥1 QUICK TC** per applicable family (the L1 must-assert) — an **ordinary 3-segment TC** (`TC-<MOD>-<SUB>-NNN`, in the page's band) carrying a `**Surface_Family**: <family> (QUICK|DEEP)` line. There is **no `-SBC-`/`-SBC-MAX-` ID infix** — the TC-ID grammar is 3-segment, so a 4th segment fails `check-tc-parity` G6; the surface marker rides the `Surface_Family` line, not the ID. ("SBC" stays the name of the catalog section + the `describe` block.)
- Inapplicable family → `out-of-scope:<family>=<reason ≥20 chars>` (same shape as LR-062's out-of-scope token).
- The token **folds into the LR-062 100% completeness gate**: a grid archetype with no `behavior-cases:` disposition (neither covered families nor explicit `out-of-scope:`) is an **undispositioned surface** = `Coverage_Ratio < 100%` = closure-gate Cx FAIL. **No new parity script** — SBC TCs are TCs and ride the existing `check:tc-parity`; "this grid needs behavior cases" rides Cx/LR-062.

**Disposition vocabulary** (extends LR-062's set, surfaced in `scripts/walk-coverage/` enumerator output): `behavior-cases:<families>` (grid → §3 surface cases), with the render-state sub-rule that a **link-cell → render assertion** (every link-cell navigates; a non-link where a link is expected is a *potential* bug → RCA → classify, **never blind auto-file**) and a **file-control → file-I/O** disposition (DEEP tier).

**Depth is delivered by the skills, not this rule**: `/coverage` authors the QUICK L1 surface must-asserts; `/ultracoverage` authors the DEEP L2/L3 exhaustive surface coverage. The framework methodology lives in the [Case-Generation Standard](../../docs/read_only_docs/CASE_GENERATION_STANDARD.md) (7 active families + deferred `rbac`/`concurrency`/`platform`); the Encore templates live in `field-case-generation.md` §3.

**Trigger**: every field-inventory walk / catalog / WATCHDOG re-walk that enumerates a grid / list / table / result surface; every closure of a plan citing such an artifact (rides the LR-062 Cx gate); every `/coverage` + `/ultracoverage` subplan authoring.
**Depth is tier-independent at the floor**: the ≥1-QUICK-TC-per-applicable-family requirement is the L1 must-assert floor for ALL tiers — `/coverage` (quick) and `/ultracoverage` (deep) both satisfy it. Quick narrows scope via `deferred-to-DEEP` (LR-072) on non-L1 families; it never drops the L1 floor.
**Graduated from**: SUBPLAN_CGS_A_STANDARD_AND_SKILLS (2026-06-24, parent PLAN_CASE_GENERATION_STANDARD) — codifies the surface axis that `field-case-generation.md` §2 (field-input only) structurally couldn't generate. Cross-refs LR-062 (completeness denominator), LR-064 (TDW Stage-1 grid→§3 classification), LR-057 (affordance + no-taxonomy brain-first probe), the Case-Generation Standard, and skills `/coverage` + `/ultracoverage`.

## LR-072: CoverageMode contract — plan-level declared tier governs walk/verify/closure cost

**Paths**: `.claude/rules/inventory.md` (governing LR-062 disposition vocabulary, LR-064 TDW walk execution, LR-065 surface-axis floor, LR-013/SP-AAE-05 staleness, Cx closure gate).

Every **coverage-bearing subplan** (one whose phases author TCs, run walks, or cite walk artifacts) MUST declare `**CoverageMode**: quick | deep` in frontmatter alongside `Model` / `Thinking` / `PermissionMode` (LR-041 pattern). `/coverage` stamps `quick`; `/ultracoverage` stamps `deep`. Hand-authored plans declare explicitly.

**Absent field = `deep` semantics** (conservative default — legacy plans and forgetful authors get today's full rigor; the contract can only ever be *invoked*, never *fallen into*).

**Token grammar**: `deferred-to-DEEP: <element/launcher id> (<reason ≥20 chars>)`
- Legal **only** on plans whose `CoverageMode` is `quick`.
- Counts as **dispositioned** for LR-062 `Coverage_Ratio` (ratio stays 100% — nothing silently skipped).
- **G1 — no classification claim**: a deferral row carries NO other disposition token alongside it. Any `deferred-to-DEEP` row co-appearing with `covered-by-TC` / `affordance-probed` / `read-only-verified` = validator FAIL (the Pay-To-Address miss recreated otherwise).
- **G2 — claimed rows keep FULL rigor**: any row the quick run DOES claim (`covered-by-TC` / `read-only-verified` / `affordance-probed`) keeps unchanged LR-062 condition-5 provenance + LR-057 probe requirements. Quick narrows the claimed set; it never cheapens a claim.
- **G3 — vocabulary containment**: the token lives only in internal walk artifacts (gitignored `specs_planning/`) and plan bodies. It is in the `scripts/xlsx-lint-rules.mjs` deny-list so it can never leak into a client deliverable.
- **G4 — per-launcher granularity**: a deferral names the specific launcher/element, never a shared dialog (LR-057 dedup clause). This is a doctrine-layer discipline (walk-time judgment, reviewer-checked); the machine layer enforces the token FORMAT — non-empty element/launcher id and reason ≥20 chars (validated by coverage-manifest.mjs at Cx time).

**Walk_Mode dual-home**: the walk manifest gains a `Walk_Mode: quick | deep` frontmatter field stamped at walk time (absent = deep). The Cx closure path reads BOTH the plan's `**CoverageMode**:` AND the artifact's `Walk_Mode:` and **FAILS on mismatch** — a deep plan citing a quick-walked artifact must not close green off deferral rows.

**Gate discipline**: a gate that flags a `CoverageMode: quick` plan for performing quick-scope work (i.e., for having `deferred-to-DEEP` rows) is, from this rule forward, a **gate bug** — the owner's tier declaration IS the demand signal.

**Trigger**: every coverage-bearing subplan authoring session; every walk artifact consumption session; every Cx closure of a plan citing a walk artifact.
**Graduated from**: PLAN_COVERAGE_TIER_CONTRACT (2026-08-07). Cross-refs LR-062 (disposition vocabulary + Cx gate), LR-064 (TDW-Q profile), LR-065 (tier-independence floor), LR-013/SP-AAE-05 (staleness quick-path), §20 (quick walk doctrine).
