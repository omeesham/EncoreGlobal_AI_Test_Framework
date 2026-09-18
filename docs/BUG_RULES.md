# Bug Rules — verbatim extraction from the JBS Encore Framework (2026-09-18, HEAD 146d1b58)

Each section below is copied unchanged from the file named in its banner. Order = bug lifecycle: triggers → filing → verification → environment → Encore-specific traps.


---
<!-- SOURCE: docs/read_only_docs/LEARNED_RULES.md — LR-030..LR-034 (triggers + filing protocol) -->

## LR-030: Requirement contradiction = investigate as bug, never silently update docs

When live DOM contradicts a documented requirement:

1. Find the requirement's ORIGINAL SOURCE (Jira, spec docs, Functional Requirement .docx)
2. If source confirms the requirement is intentional → the DOM behavior is a potential APP BUG
3. TEST the discrepancy yourself via MCP (don't hand off "Steps to Replicate")
4. File bug report with evidence if confirmed
5. Only update docs AFTER completing investigation — and document the investigation trail

NEVER silently overwrite docs to match DOM. That destroys evidence of expected behavior. ALL-024 says "DOM is truth" for conflict resolution, but it also says "STOP and report the discrepancy." Both halves of that rule must be followed — observe AND report.

**Trigger**: Any MCP finding that contradicts REQUIREMENTS.md or plan expectations.
**Graduated from**: Copilot session audit 2026-04-10 — BillingCycle "disabled" overwritten to "enabled" without investigating why the requirement existed. ALL-024 half-applied (DOM wins, but no report).

---

## LR-031: SKIP requires exhaustive investigation — no lazy escapes

Before marking ANY TC as SKIP or NOT-AUTOMATABLE:

1. Verify you ACTUALLY tested the precondition (not just read the current state)
2. If the plan says "when value = X" → change the value to X first, then test
3. If expected DOM change is missing → that's evidence of a BUG, not evidence of "untestable"
4. Clear the field / change state / click Save — test what happens when things go WRONG
5. Monitor network activity during any "nothing happens" scenario (hook fetch, check API calls)
6. File bug report if behavior contradicts documented requirements
7. SKIP is ONLY for genuinely untestable conditions AFTER exhausting ALL investigation paths

A TC skipped without trying the error condition = audit finding.

**Trigger**: Any TC being marked as SKIP or NOT-AUTOMATABLE.
**Graduated from**: Copilot session audit 2026-04-10 — TC-078 SKIP'd without changing BillingCycle to "--Select--". TC-079 SKIP'd without clearing Oracle Product to test save behavior. Both were lazy escapes that missed a confirmed UX/a11y bug (BUG-LI-001).

---

## LR-032: MCP agents must investigate, not theorize

When you have browser/MCP access:

- TEST hypotheses live instead of writing "Steps to Replicate" for the user
- Use network interception (`window.fetch` wrapper or `page.on('request')`) to distinguish "client blocked" vs "server rejected" vs "API error"
- 30 seconds of live testing > 30 lines of theory
- If you write "Steps to Replicate" while the browser is open on the page = you failed

**Trigger**: Any RCA or bug investigation while MCP browser is available.
**Graduated from**: Copilot session audit 2026-04-10 — had MCP browser open on exact page, wrote theory document instead of clearing Oracle Product and clicking Save (30 seconds).

---

## LR-033: Network RCA checklist — always check API activity during debugging

When debugging ANY "nothing happens" or unexpected behavior:

1. **In test artifacts**: Read `failure-summary.json` → `networkFailures[]` array FIRST.
   - 5xx = APP BUG (file report, don't fix test code)
   - 4xx on auth URL = AUTH issue (escalate, not code fix)
   - 4xx on business API = bad test data OR app validation bug
   - Empty array + timeout = client-side blocking (form validation, JS error)
2. **In MCP live debugging**: Use `browser_network_requests` after every save/submit/navigation. Zero requests after button click = client blocked the action (Angular `if (!form.valid) return;`).
3. **Fetch interception** (for silent no-ops):

   ```javascript
   // Before the action:
   () => { window._apiCalls = []; const orig = window.fetch;
     window.fetch = (...a) => { window._apiCalls.push(a[0]); return orig(...a); }; }
   // After the action:
   () => window._apiCalls  // length 0 = no API fired
   ```

4. **HAR context**: DiagnosticsCollector captures 5 requests before/after each failure. When multiple APIs failed, the FIRST failure in the HAR window is the root cause.
5. **Auth chain**: `failure-summary.json.authChain[]` shows OAuth redirect sequence. Loop or 401 from auth provider = session expired, not test bug.

The framework captures ALL of this automatically via DiagnosticsCollector. USE IT.

**Trigger**: Any test failure, any "button does nothing" scenario, any save/submit investigation.
**Graduated from**: Copilot session audit 2026-04-10 — agent had MCP access but never checked network activity during Oracle/Save investigation.

---

## LR-034: Bug Filing Protocol — how to confirm and file an app bug

When you suspect an application bug (not a test defect) during ANY work, follow these steps:

**Step 1 — Verify requirement exists**: Find the original source (REQUIREMENTS.md, Functional Requirement .docx, Jira, spec docs). If no documented requirement, behavior may be intentional — ask user before filing.

**Step 2 — MCP-confirm the bug**: Reproduce on live DOM. Use `browser_network_requests` or fetch interception to prove client-side vs server-side. Screenshot the evidence. MANDATORY — no bug filed on theory alone.

**Step 3 — Dedup check**: Scan `reports/bugs/BUG-*.json` for existing report on same module + same symptom. If found, add new evidence to existing report instead of filing duplicate. (Path corrected 2026-06-11 — the root-relative `reports/bugs/` named here previously does not exist; the artifact home is per-client.)

**Step 4 — Generate ID**: `BUG-{MODULE}-{SUBMODULE}-{NNN}` using the registered module + submodule codes from `export_test_cases/module-codes.json` — the SAME codes the TC grammar uses (e.g., `BUG-LOC-LI-001` = locations/local_information, `BUG-LOS-BAS-001` = local-office/basic_information, `BUG-CPR-OVR-001` = corporate-pricing/override). NNN = next sequential number for that module+submodule family. (Grammar upgraded from the legacy 2-segment `BUG-{MODULE}-{NNN}` form on 2026-06-11 — PLAN_ID_NAMING_AUDIT_AND_REMEDIATION; legacy IDs in historical artifacts resolve via the `bugGrammar.formerIds` map in module-codes.json. Guardrail 7 in `scripts/check-tc-parity.ts` enforces the 3-segment grammar on live artifacts.)

**Step 5 — Write JSON** to `reports/bugs/BUG-{MODULE}-{SUBMODULE}-{NNN}.json`:

```json
{
  "id": "BUG-{MODULE}-{SUBMODULE}-{NNN}",
  "title": "one-line summary",
  "module": "MODULE_NAME",
  "severity": "critical|high|medium|low",
  "status": "open",
  "discoveredDate": "YYYY-MM-DD",
  "requirementSource": "doc name + specific binding/rule",
  "stepsToReproduce": ["step 1", "step 2"],
  "expectedBehavior": "what requirement says should happen",
  "actualBehavior": "what actually happens (with MCP evidence)",
  "mcpEvidence": { "sessionDate": "YYYY-MM-DD", "findings": "what MCP showed" },
  "baselineComparison": "regression-from-baseline | intentional-UX-change | baseline-absent | not-checked",
  "baselineEvidence": "old-site-baseline/<module>-<YYYY-MM-DD>.md §<section> — observed value vs new-site value (REQUIRED if baselineComparison=regression-from-baseline; otherwise optional / null)",
  "affectedTests": ["TC-IDs — optional"],
  "networkEvidence": "API calls or lack thereof — optional"
}
```

Required: id, title, module, severity, status, discoveredDate, requirementSource, stepsToReproduce, expectedBehavior, actualBehavior, mcpEvidence, **baselineComparison** (per LR-045 row 4 / LR-ENC-001 — every bug filing classifies vs baseline; `not-checked` allowed only when no baseline workflow applies, e.g. non-multi-client framework).

**Step 6 — Update affected specs**: Any TC blocked by this bug gets `test.skip('bug-blocked: BUG-{MODULE}-{SUBMODULE}-{NNN}')`. Update FIXME comments to reference bug ID.

**Step 7 — Report to user**: Output bug summary in chat — bug ID, title, severity, requirement source, MCP evidence summary.

**Trigger**: Any of:

- DOM contradicts documented requirement (LR-030 fires first, LR-034 for the actual filing)
- "Nothing happens" on button click (LR-033 network check, LR-034 if confirmed app bug)
- Expected DOM change missing after action (LR-031 investigation, LR-034 if confirmed)
- Test failure classified as APPLICATION or DATA by failure-summary.json
- **Baseline-vs-e2e divergence classified as `regression-from-baseline`** during any neutral-eye / `/find-bugs` / module-audit subplan (per LR-045 row 4 — `baselineComparison: regression-from-baseline` is mandatory in the JSON; `baselineEvidence` cites the old-site-baseline artifact + section)
- **A walker visually notices a UI/UX/layout/rendering defect on any walk (per ALL-045)** — a broken/overflowing render, mis-layout, focus-trap, or accessibility break — even with NO failing test and NO documented requirement. File as `BUG-CANDIDATE` then MCP-confirm per Step 2 (`requirementSource` = the standard UX/accessibility rule it breaks, e.g. "an invalid state must render legibly without breaking layout — WCAG ARIA21"). A render-state defect is invisible to an `aria-invalid`-only / CLI-headless check, so the visual presentation must be SEEN (Chrome / element screenshot / `boundingBox` geometry) before filing — never inferred from the attribute. *Suggestions/improvements (ALL-045 low-prio tier) are NOT LR-034 filings — they live in the walk-evidence `## Observations` Suggestions bucket.*

**Graduated from**: Copilot session audit 2026-04-10 — LR-030/031/032/033 told agents to investigate and file bugs but gave no procedural HOW. This fills the gap. Amended 2026-04-29 — added `baselineComparison` + `baselineEvidence` required fields per LR-045 row 4 (closes the soft-spot where baseline-vs-e2e divergences could be filed without classification).

---


---
<!-- SOURCE: .claude/rules/pipeline.md — LR-044 (verification protocol) -->

## LR-044: Bug Verification Protocol — read verbatim → follow exactly → minimize

Any agent (filer or verifier) interacting with a filed `reports/bugs/BUG-*.json` — verifying, RCAing, fixing, closing, skipping tests against, or surfacing in any report — follows this sequence. Filed bugs are tooling, NOT an oracle.

1. **Read `stepsToReproduce` VERBATIM first** — no paraphrasing, no shortcuts, no "I think I know what they meant." Classical manual-QA discipline: the verifier starts by following the filer's exact recipe, not an improvised alternative.

2. **Follow the filed steps EXACTLY on a fresh page.** Observe at each step: DOM state (`read_page` / `javascript_tool`), network activity (`read_network_requests` — critical per LR-033 for "client blocked vs server rejected"), console errors (`read_console_messages`), form dirty/pristine state. Do not skip setup steps on the first pass.
   - **Symptom does NOT appear → verdict `FALSE`.** Classify RCA category before closing — do NOT prejudge:
     - `ISOLATION` — field saves fine alone; filer mistook concurrent-edit interaction for field-under-test bug.
     - `HALLUCINATION` — symptom never reproduces, even following exact steps.
     - `MISREAD` — symptom exists but filer misinterpreted DOM/network/error evidence.
     - `ENVIRONMENTAL` — was real then, not now (fix shipped, data setup differs).
     - `STALE` — LR-024 violation (filer ran RCA on artifacts from a different test run).
     - `ROLE/OFFICE-DEPENDENT` — bug real but only under different admin/office/data setup.

3. **If confirmed → MINIMIZE (find the shortest repro).** Remove one setup step at a time; re-run; observe. Reconstruct the minimal sequence from only the necessary steps. A minimized repro saves hours for every future agent, test writer, or developer reading the bug.

4. **Update the bug JSON** with findings:
   - Minimal repro found → update `stepsToReproduce` to the simpler version, preserve the original in a new `stepsToReproduceOriginal` field, append a `verificationLog` entry (`{verifierAgent, verifiedDate, verdict, minimalRepro, RCA_category?}`).
   - `FALSE` verdict → update `status` per RCA category: `invalid` for ISOLATION/HALLUCINATION/MISREAD/STALE; `resolved` for ENVIRONMENTAL; keep `open` + annotate for ROLE-OR-OFFICE-DEPENDENT.
   - `CONFIRMED` without minimization gain → append `verificationLog` entry confirming reproducibility on the verification date.

**Filer obligations** (complements verifier obligations above): per LR-034 Step 5 schema, `stepsToReproduce` MUST be a numbered array of concrete actions. Vague prose ("try toggling a few things") is a filing defect — verifiers should refuse to re-verify until the filer upgrades the steps.

**Trigger**: every `/bugfix` run on a filed bug, every `/rca` Phase 5 (MCP replication), every `/find-bugs` live interaction, every `/encore-questions` Phase 5 invocation, any agent about to close a bug, any agent about to skip a test citing a bug, any agent quoting a filed bug's evidence in a plan / report / client-facing artifact.


---
<!-- SOURCE: .claude/rules/baseline.md — LR-045 (baseline comparison, whole file) -->

---
description: Baseline-truth workflow for multi-client TC pipelines (LR-045)
paths:
  - "specs_planning/**/*.md"
  - "docs/REQUIREMENTS.md"
  - "specs_planning/_internal/old-site-baseline/**/*.md"
  - "reports/bugs/**/*.json"
---

# Baseline-Truth Workflow (LR-045)

Path-scoped rule pack — loads when authoring or modifying client specs_planning artifacts, REQUIREMENTS.md, or old-site-baseline notes.

Any multi-client TC-authoring pipeline MUST declare a baseline truth source per client. **Baseline truth source** = a stable/legacy site (or authoritative spec artifact) that represents **intended behavior**. The client's active app = **observed behavior**. Divergence = signal (classify as bug candidate per LR-034, requirement gap per REQ-014, or intentional UX change).

## Truth hierarchy (per ALL-024, amended 2026-04-24)

old-site DOM > live new-site MCP DOM > error-context.md > screenshots > failure-summary.json > REQUIREMENTS.md > test plans > test cases > Jira. Old-site DOM overrides new-site DOM where both exist.

> **Two-axis note (LR-063 / LR-ENC-004, added 2026-06-22)**: this ranking is the **render-truth** axis (what the app actually does — DOM wins). Jira/Confluence is the **intent-truth** axis (what it is *supposed* to do) on a **parallel track** — its low rank means "never overrides observed DOM," NOT "ignore it." Consult Rovo with/before the baseline walk (the LR-063 chain); treat every Jira fact as a LEAD re-verified against DOM. A DOM-vs-Jira divergence is signal to classify (bug candidate / requirement gap / intentional UX), never an automatic win for Jira.

## Workflow shape (applies to every Requirements → Planner → Generator loop AND every audit / find-bugs subplan that drives TC corrections)

1. **Requirements (HUNTER)**: Phase 1a — visit baseline first, emit `specs_planning/_internal/old-site-baseline/<module>-<YYYY-MM-DD>.md`; Phase 1b — visit new site, compare row-by-row, classify every divergence (per REQ-014).
2. **Planner (GIVER)**: reference baseline artifact via `Baseline_Artifact` frontmatter key in the field-inventory artifact (per PLN-049). If a same-module baseline is expected but absent → HALT at Planner→Generator handoff.
3. **Generator (BUILDER)**: spot-check baseline reference (per SP-AAE-04, when landed); assert against new-site behavior, with baseline as the "intended" oracle for ambiguous cases.
4. **Audit / Neutral-eye / `/find-bugs` (WATCHDOG)**: before authoring or revising any TC correction, visit baseline first (or consume a same-module baseline artifact ≤14 days old per LR-013 spot-check); emit/refresh `old-site-baseline/<module>-<YYYY-MM-DD>.md` if missing/stale; produce a `## Baseline diff` section in the findings doc that classifies every observed-vs-baseline divergence as (a) regression-from-baseline, (b) intentional UX change (REQUIREMENTS.md / Jira justification), or (c) baseline-absent (net-new on e2e — record `baselineScope: baseline-absent` per LR-ENC-001, NOT a HALT). Bug filings carry `baselineComparison` per LR-034.
5. **`/encore-questions` (escalation path)**: feature absent on baseline → flag for client-side QA, do NOT HALT (ALL-078).

## Per-client URL + creds

Live in the client-specific rule. For Encore, see LR-ENC-001 in `CLAUDE.md`. Other clients get their own `LR-{CLIENT}-001` rule naming their baseline URL/creds/artifact directory.

## Observation-only default

Baseline sites are READ-ONLY observation sources. Selectors on baseline may not match the new site (for Encore, zero selector parity — baseline uses `name=`/`id=`, new site uses `data-testid`). Specs still run against the new site. Baseline artifacts are FREE-FORM observations, not a strict field-inventory schema (the existing `field-inventory-spec.md` is a starting point but baseline artifacts may deviate — see `OSB-ACCESS-VERIFY-2026-04-24.md`, 6 sections).

**Trigger**: every new multi-client framework / every Requirements / Planner / Generator / `/encore-questions` / TC-generation subplan session AND every WATCHDOG neutral-eye audit / `/find-bugs` / module-audit subplan whose output drives TC corrections (e.g. `specs_planning/_internal/neutral-eye-audits/**/*.md` authoring sessions, SP-DQU-12..20 module audits, any future per-module audit subplan). [AGENT-DISCIPLINE] Enforced by ALL-078 (HALT gate) + REQ-014 + PLN-049 + neutral-eye audit `_TEMPLATE.md` mandatory `## Baseline diff` section — these are prose rules agents follow when identity-loaded; no automated hook/script fires independently.
**Graduated from**: PLAN_OLD_SITE_TRUTH_BASELINE (2026-04-24); workflow row 4 (audit/neutral-eye) added 2026-04-29 after DQU pipeline gap analysis surfaced 10-of-11 modules bypassing baseline-first (SP-DQU-02 LOS audit pre-dated LR-ENC-001; SP-DQU-12..20 left baseline as optional `Baseline_Artifact` key).

---
<!-- SOURCE: CLAUDE.md — product context + LR-ENC-001/005/007/008/009 + LR-008/012/036 + fresh-login -->

## Product context (quick reference)

- **App**: Navigator Cloud — Encore's rental/event management platform
- **Base URL**: `cloudapps-e2e.encoreglobal.com` (E2E environment; see `.env.local`)
- **Environments in scope — exactly two**: `cloudapps-e2e` (automation target, FULLY WRITABLE) + `navigator2.training.psav.com` (observation-only baseline). Any other host — notably `cloudapps-dev` — is OUT: treat such a URL as a pointer to which surface is meant, translate it to the e2e equivalent on 1604, and never build env plumbing for it (**LR-ENC-007**).
- **Test office**: 1604 (hardcoded in many TCs)
- **Master / corporate office**: 1101 ("Corporate Office") — NOT a day-to-day test office, but it carries data & whole feature areas 1604 lacks (Commission — corporate-only, Navigator Contracts role; Labor — NM-1881). Empty/absent on 1604 ≠ missing — re-check 1101 first (LR-ENC-005). (Currency/pricing variety lives on 1605, not 1101.)
- **Auth**: Microsoft SSO; credentials in `.env.local` (**tracked in git** — a fresh clone already has working creds; see `:130`. CI additionally injects `NAVIGATOR_*` from its secret store via `.env.e2e`)
- **Module registry**: `docs/MODULE_REGISTRY.md` (agent-only — gitignored per root `.gitignore:185`, never ships)
- **Requirements**: `docs/REQUIREMENTS.md` (agent-only — gitignored per root `.gitignore:184`, never ships)
- **Jira prefix**: `NM-NNNN` (e.g., NM-1264 — Delivery ≥ Prep cross-field validation)

---

### LR-ENC-001: Encore baseline truth source — old-site Navigator UI (navigator2.training.psav.com)

Old site `https://navigator2.training.psav.com/#/` is the observation-only baseline truth source (0 `data-testid`; shared SSO); new site `https://cloudapps-e2e.encoreglobal.com/navigator/` is the automated app. Old site decides on any behavior uncertainty (ALL-024). Test entity: office 1604. Baseline artifacts: `specs_planning/_internal/old-site-baseline/<module>-<YYYY-MM-DD>.md`.

<!-- CEO POINTER: LR-ENC-001 walk technique + old→new architectural divergence detail → ticket DOCTRINE; cite CLAUDE.md LR-ENC-001; VERIFY: worker names which divergence (ECT tab / local-office URL split / baseline-absent field) it handled and records baselineScope on the queue entry -->
<!-- CEO POINTER: LR-ENC-001 boolean render on old-site LM History (Bootstrap Glyphicon → textContent empty for TRUE) → ticket DOCTRINE; cite CLAUDE.md LR-ENC-001 + LR-036; VERIFY: worker states which of the 3 render formats (Glyphicon / Unicode ✔ / SVG lucide-check) the target table uses -->

### LR-ENC-005: Office 1101 ("Corporate Office") is the master/superset corporate location — re-check before declaring corporate-only data/features absent

**Scope**: corporate-only surfaces (Commission, Labor) only. This is NOT a blanket "use 1101 as the 2nd test office" — currency/pricing variety belongs on 1605, not 1101.

When a walk, spec, RCA, `/find-bugs`, or `/encore-questions` session hits an empty or absent result on office 1604 for a corporate-only surface, re-check 1101 before concluding the data is missing or the feature is corrupt. 1101 carries whole feature areas and data that 1604 legitimately does not have.

**Canonical corporate-only instances**:
- **Commission** — restricted to 1101 + Navigator Contracts role; pre-intake KT at `specs_planning/_internal/intake/commission-hunter-2026-06-26.md`
- **Labor** — Labor data lives on 1101 (NM-1881), not 1604

**Anti-pattern**: concluding "field/feature is missing/corrupt" from one office's empty state without verifying on 1101.

**Trigger**: any walk/spec/RCA/`/find-bugs`/`/encore-questions` session hitting an empty corporate-only surface on 1604; any time a future meeting/KT produces new info scoped to 1101 (store it under `specs_planning/_internal/intake/`).

**Cross-refs**: NM-1881 (Labor), `_internal/intake/commission-hunter-2026-06-26.md` (Commission KT), `patterns.md` "corrupt/atypical" tree, LR-061 (N≥2 evidence), LR-ENC-001 (baseline truth).

### LR-ENC-007: Two environments only — `cloudapps-e2e` (fully writable) + `navigator2` (observation-only) on office 1604; any other env is OUT

**Sev**: S1 per LR-069 §3.1 (silent quality drift surviving to commit — a plan, spec, selector or config built
against a dead environment reads as ordinary work and no existing gate catches it). **Graduating incident**:
2026-08-03 — a Service Charge Text automation request arrived as a `cloudapps-dev` / office `1609` URL.
`cloudapps-dev` has zero references repo-wide; `.env.local`, `.env.e2e`, `playwright.config.ts`, the saved SSO
state and `scripts/walk-coverage/enumerate-page.mjs`’s hard-coded `BASE` all target `cloudapps-e2e`. Inheriting
the URL literally would have added an env profile, a second auth state and a `BASE` override for an environment
the owner had already abandoned. Owner ruling: *"we have to look on e2e and nav2 only."*

**The two in-scope environments — there is no third:**

| Role | URL | Discipline |
|---|---|---|
| Automation target (new site) | `https://cloudapps-e2e.encoreglobal.com/navigator/` | **FULLY WRITABLE** — see below |
| Baseline truth (old site) | `https://navigator2.training.psav.com/#/` | **Observation-only** per LR-ENC-001 + REQUIREMENTS HARD STOP #4 |

**Default test office on both: 1604.**

**e2e is FULLY WRITABLE — never ask permission to mutate it.** It is the automation environment; it exists to be
typed in, saved to, added to and worn out by specs and walks. Adding rows, editing fields, triggering save dialogs
and leaving test residue on 1604 are normal, expected and pre-authorized (owner, 2026-08-05: *"its e2e = automation
env = claude’s env = automation scripts env"*). Do NOT pause a walk, downgrade a required state, or raise a question
because a step would change data there. The ONLY constraints on e2e are collision constraints with a concurrently-
running session (no second test-runner, no shared auth-state rewrite) — never data-protection ones. **navigator2 is
the opposite**: zero mutations, always.

**How to apply** — when a request, ticket, screenshot or link names any other host or office:

1. Treat the URL as a **pointer to WHICH SURFACE is meant** — never as a build target. Translate it to the
   `cloudapps-e2e` equivalent on office 1604 and proceed.
2. **Never** create env plumbing for the out-of-scope environment: no `.env.<env>` file, no second auth state, no
   `BASE` override, no extra Playwright project, no config branch.
3. **Never** hard-code the out-of-scope host or office into a plan, spec, selector, page object, test data file or
   walk config. A grep for the dead host across the work product should return zero hits outside a provenance line.
4. **Verify the surface exists on e2e/1604 before assuming the translation worked.** If it does not, **HALT and ask**
   — never silently retarget to a different office, and never resurrect the out-of-scope environment as a workaround.
   Run the LR-040(c) c.1/c.2/c.3 ladder plus the §20.4 data rungs first, so "it isn’t on 1604" is an evidenced finding.

**Office carve-outs are NOT environment carve-outs.** These stay valid — they select a different *office within e2e*,
never a different host: **1101** for corporate-only surfaces (Commission, Labor) per LR-ENC-005; **1605** for
currency/pricing variety; the multi-location pool for parallel-isolation work.

**Deliberately prose-tier (no gate).** The mechanical form would be a new forbidden-pattern entry in
`scripts/lib/forbidden-patterns.mjs`, which per LR-069 §3.3 must land at `announce` and ramp, and a hook/gate change
needs an explicit owner GO. Promote on the second confirmed recurrence.

**Trigger**: any request, ticket, Jira link, screenshot or handoff naming a Navigator host other than `cloudapps-e2e`
/ `navigator2`, or an office other than 1604 where 1604 would do; every new-module intake; every plan or spec about to
hard-code a base URL or office.

**Cross-refs**: LR-ENC-001, LR-ENC-003, LR-ENC-005, LR-040(c), LR-069, REQUIREMENTS HARD STOP #1.

**History**: authored 2026-08-03, lost as an uncommitted working-tree edit, restored and committed 2026-08-27.

### LR-ENC-008: Lazy-loading surfaces — prove FUNCTIONAL settle before recording any contract; enabled ≠ functional

Encore's heavy tabs (canonical: Discount Matrix Location Activation, ~2041 rows) hydrate in stages for MINUTES: skeletons → placeholder rows → footer total + enabled controls → **functional handlers last**. Four confidently-wrong contracts came from reads inside that window (all NM-3530, 2026-08-25/26): LOA recorded "empty grid" (holds 2041 rows, data lands ~43s in); RWP toolbar recorded "all disabled at rest" (data actions are enabled); the rescinded readings surviving in the inventory; and BUG-DSM-LOA-001 filed as "search filters nothing" when the truth was a ~1.5–2-min post-load dead window during which the ENABLED search box silently swallows input — identical typing succeeds after the window (evidence: `reports/walk-coverage/dsm-loa-search-reverify2.json`; the owner later ruled that window accepted loading behaviour and the bug was withdrawn, 2026-08-26 — the misread lesson stands regardless).

- Before recording any grid/toolbar/field contract: prove settle — skeletons 0, rows carry text, footer/count present, controls enabled.
- Before recording any NEGATIVE functional claim ("does nothing", "filters nothing", "inert"): additionally prove the claim survives a **varied-wait retry** — repeat the identical interaction after +60s and +120s idle. A control that is enabled is NOT necessarily wired yet; only a no-op that persists across varied waits may be filed as non-functional.
- N≥2 offices with the SAME wait profile share the bias — independence comes from varying the WAIT, not the entity.

**Trigger**: any walk, probe, bug filing, or case authoring on a Loading/lazy Encore surface; any "control does nothing" verdict there.
**Graduated from**: the 4-instance loading-window class above (memory `feedback_loading_window_misreads.md` — its own text set graduation at the 3rd instance).

### LR-ENC-009: DOM/markup accessibility findings are not defects for this client — behaviour defects only

Owner ruling (2026-08-04, previously un-numbered — graduated 2026-08-28 at PLAN_NM3530 Phase 4 closure so duty-coverage gates can cite it): never file a DOM/markup accessibility finding (missing accessible name, unlabeled combobox, missing testid, aria wiring, markup-only concerns) as a bug, test case, or walk observation for Encore. Behaviour defects only. Markup findings are recorded as selector-strategy constraints plus an LR-029 missing-testid report with live-DOM verification per element.

**Scope note**: for this client this rule carves the "accessibility break" defect class OUT of the ALL-045 Observations buckets, HUNTER HARD STOP #13 and GIVER HARD STOP #23 — those texts remain in force for every other defect class and are deliberately unedited; this client rule is the precedence record (client scope ruling > framework default, surfaced not silently resolved).

**Trigger**: any walk Observations bucket, bug filing, TC authoring, or audit finding on an Encore surface that would cite markup/accessibility rather than behaviour.
**Graduated from**: standing scope rule applied since 2026-08-04 (memory `feedback_no_dom_accessibility_bugs.md`); the numbering gap and the ALL-045 conflict were surfaced in PLAN_NM3530_DISCOUNT_MATRIX_COVERAGE_QUICK § Duty-coverage note and routed here.

### LR-008: Date offset validation — positivity constraints per field type
Date-offset fields have sign constraints (relative-to-start Prep/Set/Delivery ≤ 0; relative-to-end Return/Strike/Pickup ≥ 0; Delivery additionally ≥ Prep per NM-1264). Test values must respect ALL constraints for the field under test.
<!-- CEO POINTER: LR-008 per-field-type offset sign rules → ticket DOCTRINE; cite CLAUDE.md LR-008; VERIFY: worker's test values satisfy every offset constraint for the field (incl. Delivery≥Prep) -->

### LR-012: Save dialogs are SHARED unless MCP-proven otherwise
Default assumption: all Location Settings tabs use the shared "Save Changes" dialog
(dlgSaveChanges / btnSaveChangesConfirm from shared.ts). Do NOT create custom dialog
selectors unless MCP verification proves a custom dialog exists.
**Trigger**: Any new page object for Location Settings tabs.

### LR-017: Different pages MUST have separate selector namespaces and directories
Pages at different URLs are DIFFERENT pages — never merge selectors into a shared flat object or co-locate files. Each page group gets its own selector partition + directory + collision boundary. Location Settings (`/settings/location`) ≠ Local Office Settings (`/settings/local-office`).
<!-- CEO POINTER: LR-017 per-page selector-namespace + directory-mirroring rules (tests/ + src/pages|selectors|data per module: locations, local-office, corporate-pricing) → ticket DOCTRINE; cite CLAUDE.md LR-017 + REQUIREMENTS.md + MODULE_REGISTRY.md; VERIFY: new page object lives in its own module dir, no shared flat selector object -->

### LR-036: Boolean render format differs per page — MCP-verify detection per table
Boolean cells render differently per table in the same Angular app (Unicode ✔ readable via `textContent`; SVG `lucide-check` → `textContent` EMPTY for BOTH states; empty cell = FALSE). NEVER assume two tables share a format — MCP-verify per table before any boolean-reading helper, and branch `getColumnByHeader()` on table type.
<!-- CEO POINTER: LR-036 per-table boolean detection patterns (Unicode `includes('✔')`; SVG `innerHTML.includes('lucide-check')`; empty=FALSE) → ticket DOCTRINE; cite CLAUDE.md LR-036 + LR-ENC-001 Glyphicon case; VERIFY: worker names which render format each asserted table uses -->

---

## When encore needs fresh login session

Always use this file to read the creds and login without hallucinating and waiting for user to log you in, this works on e2e and nav2 envs. Creds live in `.env.local` — **this file is TRACKED in git and ships with the repo, so a fresh clone already has it.** Read it before asking anyone for credentials.

The automation account has **no second factor**, so sign-in is fully unattended: run `npm ci` (repo root and ``), then the auth setup (`tests/auth.setup.ts`), which consumes `NAVIGATOR_USERNAME` / `NAVIGATOR_PASSWORD` and writes `.auth/encore-state.json`. That `.auth/` state file is genuinely gitignored (it is a live session token) — it is regenerated locally, never shared. Asking a human to log in manually is a defect: check the filesystem before concluding a file is absent.
