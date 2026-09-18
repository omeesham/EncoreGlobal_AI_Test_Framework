---
name: rca
description: Professional Root Cause Analysis for test failures. Artifact-first, evidence-driven, no assumptions. Combines Kepner-Tregoe IS/IS-NOT, Fishbone categories, 5 Whys, and Playwright trace analysis. Use when tests fail and you need to understand WHY before fixing.
user-invocable: true
tools: Read, Glob, Grep, Bash, Agent, WebSearch
---

# /rca — Professional Root Cause Analysis

Systematic, evidence-driven root cause analysis for automated test failures. Combines industry-standard frameworks (Kepner-Tregoe IS/IS-NOT, Fishbone/Ishikawa, 5 Whys) with Playwright-specific artifact analysis.

**Core principle**: NO assumptions, NO blind patches, NO code edits until root cause is PROVEN with cited evidence.

## When to Use


- **Manual**: user says "RCA", "root cause", "why is this failing", "analyze this failure"
- Before any bug fix that involves test failures
- When a fix attempt failed and you need to restart analysis from scratch
- When MCP can't reproduce a failure (the delta between IS and IS-NOT is the clue)

**Every `/rca` invocation runs the mama-led orchestration** (see section below). The current session becomes mama; mama spawns artifact-Subagent A and live-CLI-Subagent B (HEADED) via the Agent tool. Headed CLI is non-optional — override = LR-043 §A handshake (`[OVERRIDE-REQUEST] /rca-headed-cli` + user types `override approved`). This applies to OWNER, HEALER, and any caller. Solo forensic-only `/rca` (no subagent spawn) is the SP-A/SP-D failure mode this upgrade exists to prevent.

## Anti-Patterns (NEVER do these)

- Jump to MCP before reading artifacts
- Apply a fix based solely on error message text
- Assume a root cause without citing artifact evidence
- Run full spec suite during debug (use --grep)
- Go in fix-rerun circles without understanding the cause
- Guess that "timing" or "flaky" is the cause without proving it
- **Ship a hypothesis without live perturbation on a reproducible failure** (forensic-only RCA on an APP-class bug = the SP-A 2026-05-18T12:55 / SP-D 2026-05-20 / SSL-007/026/030 failure mode — see "Mama-Led Orchestration")
- **Treat "reproduce the exact steps live" as the ceiling of live work — it's the floor.** Subagent B must perturb, vary, hunt the workaround direction. Replay-only walking is shallow walking.
- **Mama rubber-stamps subagent output without a recorded judgment trail.** If mama accepts a subagent run without writing the one-line audit note (what was explored, what was flagged-not-relevant and why), mama is part of the failure mode, not the corrective.
- **Skip / fixme a failing spec without a `BUG-XXX-NNN` cite** (also gate-enforced by the hook at edit time — see REJECT bucket Class 3).
- **Treat in-code comments as specification of INTENDED behavior.** Comments are frozen prior observation; they may document the very bug you are hunting. INTENDED behavior cites baseline (LR-ENC-001 for Encore) or REQUIREMENTS.md — never code-comments alone. See Phase 0 Step 0.6.

---

The mama-led orchestration described below applies to **all** `/rca` invocations. Headed CLI for subagent B is non-optional. Override path (when display-less env or other concrete blocker): emit `[OVERRIDE-REQUEST] /rca-headed-cli` and have the user type `override approved` (LR-043 §A handshake, one-shot).

---

## Mama-Led Orchestration (the overarching framework)

`/rca` is not a solo forensic exercise — it is mama-led, with two blind subagents doing the legwork. The current session IS mama. Mama orchestrates, judges, and is the only one allowed to propose a fix.

### Pipeline shape

```
Test fails
  │
  ▼
The current session IS mama. Mama orchestrates — spawns A and B as subagents
via the Agent tool, reads both outputs, decides next move.
  │
  ├── Step 1: BEFORE any artifact read, mama writes ONE sentence in chat:
  │           "What would a USER expect to happen here vs. what the test
  │            sees / what the artifact records?" This is mama's
  │            user-perspective anchor — if user-expectation and
  │            spec-expectation diverge, the app-bug branch is on the
  │            table from minute zero.
  │           THEN: mama reads failure-summary herself OR spawns artifact-
  │           only Subagent A for an initial read. Cheap first move.
  │
  ├── Step 2: mama decides based on first findings:
  │           ▸ Concrete signal it's OUR side  → fix locally, re-run. Done.
  │                                              (Reclassify if "fix" doesn't hold.)
  │           ▸ Concrete signal it's THEIR side → spawn CLI Subagent B (HEADED)
  │                                              in parallel with a fresh deeper
  │                                              Subagent A if needed.
  │           ▸ Unclear                         → spawn both. A digs deeper into
  │                                              artifacts; B walks live with a
  │                                              clear goal.
  │
  ├── Step 3: subagents run in PARALLEL, BLIND to each other.
  │           Each receives a CLEAR GOAL from mama (e.g., "characterize when
  │           the Save button stays enabled after a net-zero edit on SI rows;
  │           find what triggers, what stops, whether a workaround exists").
  │           Each emits structured JSON (schema below). Mama is the only
  │           channel — no A↔B direct communication.
  │
  ├── Step 4: mama judges each subagent QUALITATIVELY:
  │           ▸ Did B target the right surface? Did B explore obvious branches
  │             a manual tester would touch? Were "no progress" attempts
  │             genuinely divergent or 5 flavors of the same thing? Does
  │             "no workaround" reflect honest attempts at obvious workarounds,
  │             or did B skip them?
  │           ▸ Is B's self-assessment honest vs hand-wavy?
  │           ▸ Did A re-read the deep branches that the surface artifact
  │             glosses over?
  │
  ├── Step 5: mama's verdict per subagent:
  │           ▸ HONEST + COMPLETE → accept findings, move to comparison.
  │           ▸ LAZY / SHALLOW / SKIPPED OBVIOUS BRANCHES → re-spawn with
  │             concrete missing directions ("you didn't try after-add-and-
  │             reload state. Go try that. You didn't perturb the workaround
  │             direction. Try delete-while-dirty"). Re-spawn loops until
  │             honest OR mama is itself stuck.
  │
  ├── Step 6: mama compares accepted outputs:
  │           ▸ AGREE on root cause + classification + steps → propose fix.
  │             Fix MUST pass the REJECT bucket (below). Failing fix →
  │             cry for help.
  │           ▸ DISAGREE (A says test-code, B says app-bug, etc.) →
  │             interrogate: re-prompt each with the other's verbatim findings.
  │             Force them to confront contradictions. Surface hallucinations.
  │             Continue until movement OR plateau. Plateau = no new evidence
  │             emerges; mama judges this qualitatively.
  │
  └── Step 7: cry-for-help (structured, ≤200 words — format below)
              Hold session. Wait for human. Do NOT continue.
              Mama may cry for help ONLY when its own honest self-assessment
              says:
                ▸ B has been judged honest in its exploration of the
                  variation space.
                ▸ A has been re-prompted with B's findings until no new
                  movement.
                ▸ Mama has considered whether IT'S the bias point.
                ▸ All three: YES, with recorded reasoning.
              3 cry-for-helps without forward progress in one RCA → full
              halt + summary.
```

### Hard rules

- **Headed always.** Even in chain-spawned overnight sessions.
- **Hold > loop.** It's fine to hold and ask the human rather than spin in loops for 4 hrs.
- **Work hard before asking.** No numeric floor — mama's judgment of "have B and A honestly explored the variation space" is the gate. Lazy = re-spawn. Honest + stuck = cry for help.
- **CLI evidence > artifact evidence — IF CLI verified right.** CLI can hallucinate. Mama interrogates B's claims when they overrule A's artifacts. If CLI right, CLI wins. If CLI wrong, artifacts win.
- **Subagents communicate only through mama.** Mama relays VERBATIM structured JSON, never summaries. No A↔B direct channel.
- **Uniform model tier.** A, B, and mama all run the same tier as the caller's invocation. If `/rca` is called at Opus xhi, all three at Opus xhi. If called at Opus max, all three at max. No mixing.
- **App-bug suspicion → borrow SFDPOT.** When user-perspective diverges from spec-expectation (per Step 1 anchor), import `/find-bugs` SFDPOT framing (Structure / Function / Data / Platform / Operations / Time) — see `.claude/skills/find-bugs/SKILL.md`. SFDPOT is the prospective probing framework; `/rca`'s Kepner-Tregoe / Fishbone / 5-Whys are retrospective.

---

## Subagent goal + structured report schema

Mama spawns A and B with explicit, narrow goals (e.g., "characterize the breakage envelope of the SI net-zero revert; find triggers, find a workaround"). Both subagents emit the SAME JSON schema. Mama refuses incomplete outputs and re-spawns.

```json
{
  "goalReceived": "<echoed verbatim from mama's spawn prompt>",
  "rootCauseTheory": "<one sentence>",
  "classification": "test-code | app-bug | spec-out-of-date | unclear",
  "evidenceChain": [
    {"source": "<file path | live URL>", "citation": "<line N | DOM state | network log>", "shows": "<observation>"}
  ],
  "stepsToReproduce": ["<numbered>"],
  "variationsExplored": [
    {"surface": "<element/action>", "hypothesis": "<expected reveal, written BEFORE running>", "change": "<what differed from baseline>", "outcome": "<what happened>", "evidence": "<DOM/network capture ref>"}
  ],
  "workarounds": [
    {"steps": ["<numbered>"], "effectiveness": "<observed>"}
  ],
  "selfAssessment": "<one sentence: 'I covered X because Y; I did not touch Z because W'>",
  "blindSpots": "<what this agent could NOT verify>"
}
```

Per-agent shape:

- **Subagent A (artifact)** — `evidenceChain[].source` is always a file path. `variationsExplored[]` may be `[]` (A doesn't run live). **A is an extraction seat, not a theorist**: its `rootCauseTheory` may only restate what the record directly shows, and its `classification` MUST be `unclear` whenever any load-bearing fact for a mechanism claim sits in its own `blindSpots`. Mechanism and final classification are mama's synthesis from both seats — never A's alone. (Graduated 2026-08-14: seat A's blindSpots admitted the pre-blur field value was unrecorded, yet its headline asserted a strip-on-blur mechanism — refuted by the owner's manual replication and an 11-case live walk.)
- **Subagent B (live CLI HEADED)** — `evidenceChain[].source` is always a live URL + DOM/network capture. `variationsExplored[]` MUST have entries — that's B's whole job. `workarounds[]` SHOULD have entries unless B genuinely tried obvious workaround directions and none worked (B's `selfAssessment` must say so).
- **Both** — `selfAssessment` is mandatory. Mama reads it first to judge honesty.

### Mama's spawn prompt — MUST cite verified artifact field by name

Mama's spawn prompt to A and B is NOT free-form paraphrase. Each spawn prompt MUST include a verbatim citation block:

> **Failure point** (verified read at <ISO timestamp>): `<artifact-file>:<field-path>` → `<file>:<line>`
>
> Example: `failure-summary.json[].failures[0].location` → `location-notes.spec.ts:500`
> Example: `error-context.md` Stack Trace block → `location-notes.spec.ts:484`

Paraphrasing failure-points from memory is forbidden. Subagent's `goalReceived` echo only proves what mama TOLD; the citation block proves what mama VERIFIED before telling. If the wrong-line cite slips through here, subagent A will read the wrong artifact and subagent B will walk the wrong scenario — the SP-D-Notes wrong-line incident (mama cited line 506; actual was line 500) is the canonical failure this rule prevents.

---

## Mama's judgment + audit trail

Mama is responsible for judging subagent honesty and completeness. There is no numeric floor (no "B must try ≥10 variations"); the gate is mama's qualitative judgment that the variation space was honestly explored.

### Substance gating on subagent output

Each variation B reports MUST include:

- `surface` — what was touched. Must relate to the failing action (not "I clicked a random unrelated tab").
- `hypothesis` — written BEFORE running. (Post-hoc rationalization doesn't count as a variation.)
- `change` — distinct from prior variations. (Five flavors of "click harder" don't count as five variations.)
- `outcome + evidence` — DOM state OR network capture. (Vague "didn't work" doesn't count.)

Vague entries don't count toward "B honestly explored." Mama re-spawns when too many are vague.

### Recorded judgment (the audit trail)

When mama accepts a subagent's run, mama writes a one-line audit note:

> "Accepted: B explored [branch 1, branch 2, branch 3]; flagged [branch 4, branch 5] as not relevant because [reason]."

When mama re-spawns, mama records the missing-direction prompt:

> "Re-spawned B: 'You didn't try after-add-and-reload state. Go try that. You didn't perturb the workaround direction. Try delete-while-dirty.'"

This trail is what makes mama's judgment auditable — a future reader (the user, or `/audit`) can see WHY mama accepted or re-spawned each round.

### Don't exploit "honest stuck" as a loophole

"Honest + stuck → cry for help" is the escape hatch. It can be abused: declare stuck early, cry, end. Mama's check before each cry: would a manual tester with one more hour ALSO be stuck here? If no, mama is the bias point — re-spawn with sharper goal instead of crying.

### Headline-vs-blindSpots gate (2026-08-14)

Before mama relays or acts on any seat's `rootCauseTheory`, mama re-reads that seat's own `blindSpots`. If a blind spot covers a fact the theory depends on, the theory is downgraded to `unclear` on the spot, and it may never be relayed without the blind spot quoted beside it. A confident headline sitting on an admitted evidence gap is the exact mechanism by which false bugs are manufactured — the 2026-08-14 percentage-field RCA is the graduating incident (seat A: confident strip-on-blur theory over a blindSpots entry admitting the deciding fact was unobserved).

### Prior-Fix Trial — MANDATORY on every recurrence-class RCA (owner law 2026-07-17, LR-069 §3.5)

Before analyzing the new instance, check: does the failing AREA already carry a "permanent" fix — a
graduated LR rule, gate, HARD STOP, or taxonomy mandate covering this failure class? (Grep
LEARNED_RULES.md + `.claude/rules/*.md` "Graduated from" lines + agent-mistakes.md for the class.)
If YES, this is a **recurrence-class RCA** and the RCA output MUST contain a `## Prior-Fix Trial`
section BEFORE any new-fix proposal, answering three questions per prior fix:
1. What did it do to prevent this class?
2. Why did it fail to prevent THIS instance? (enum: `scoped-wrong` | `prose-not-mechanism` |
   `rubber-stampable` | `dead/never-fired` | `different-sub-class`)
3. What will the new mechanism do differently?

Verdict per prior fix: `SURVIVES` (genuinely different sub-class — keep) or `CONVICTED` (rewire into
machine-enforced form, or RETIRE-AND-REMOVE in the same change — a convicted fix left idling on disk
is sediment-slop, LR-069 §3.4/§3.5). **Layering a new fix over an unconvicted failed fix is
FORBIDDEN** — an RCA that proposes a new mechanism while the old one sits untried is incomplete and
may not close. Graduating incident: 2026-07-17 Override walk gaps — LR-062/LR-064/FCC taxonomy/walk
HARD STOPs all existed, all failed to fire, and were nearly layered over instead of tried.

### Round-2 invert-and-retest (when an RCA verdict is reopened)

When the user, `/audit`, or a follow-up session reopens a closed `/rca` verdict, mama's FIRST action is NOT to re-check the prior reasoning. **Re-checking the prior reasoning is re-confirmation, not re-analysis** — confirmation bias survives.

Mama's first action on round 2:
1. **INVERT the prior classification.** If round 1 said `test-code defect`, force-frame round 2 as `app-bug`. Vice versa for `app-bug` → `test-code`.
2. **Re-spawn subagent B** with the INVERTED frame as the explicit goal: *"Find the evidence that this is actually an <inverted-class> failure. Walk live. If the inverted frame fits better, the round-1 classification was confirmation bias."*
3. **Compare evidence chains** under both frames. The frame that fits MORE evidence with FEWER hand-waves wins.

If the inverted frame produces evidence that round-1 missed, the round-1 classification was confirmation bias — file as a learning entry per the SP-D-Notes FCC-022 incident (agent labeled "test-code defect" round 1; every downstream observation confirmed the wrong frame; user manually inverted; app-bug revealed).

---

## REJECT bucket — fixes mama refuses

Before mama proposes a fix to the user, mama screens it against the REJECT bucket. Any proposed fix matching ANY of the three classes below is **rejected** by mama — cycle back to subagents (with the rejection reason as the new goal) or cry for help.

### Class 1: Spec drift

The edit makes the spec no longer test what the TC says.

- Assertion weakening (`toBe` → `toContain` → soft check).
- Removed or commented-out assertions.
- Selector loosening (specific → generic) to dodge the bug.
- Pre-mutating setup state so the bug never appears in the spec's path.

### Class 2: Failed-experiment crud

Changes that didn't work but weren't reverted.

- Unused imports.
- Helpers defined but never called.
- `// TODO: investigate` left behind in production paths.
- `console.log` from debugging.
- Code paths added "just in case."

### Class 3: Standard hides

- `test.skip()` / `test.fixme()` without a filed bug ID cite (`BUG-XXX-NNN`). (Backstopped at edit-time by `.claude/hooks/lib/check-todo-injection.mjs` — denial fires if the new content adds `test.skip(`/`test.fixme(` to a `*.spec.ts` without a `BUG-` reference on the same or adjacent line.)
- `try/catch` swallowing the failing action.
- Timeout bumps > 2× original without recorded justification.
- Retry loops added in test code to mask a real race.
- Hardcoded waits without a documented DOM-state reason.

---

## Cry-for-help format (≤200 words, structured)

When mama is genuinely stuck after honest subagent work, mama emits a structured cry-for-help and holds the session for human input. **No prose blockers, no multi-section essays, no hypotheticals.**

```
[CRY FOR HELP — <RCA-id>]
What we saw: <1 sentence>
What we can't conclude: <1 sentence>
Ask: <choose one>
  - ≤3 yes/no questions, OR
  - ≤5 numbered "try these steps and tell us what happens" steps
```

### Banned in cry-for-help (same posture as LR-054 + ALL-077)

- "structural blocker"
- "provisioning invariant"
- "indefinite if X fires"
- "Path N (NOT taken in this session)"
- Manufactured-MFA / manufactured-auth blockers (existing 7-layer defense per `.claude/rules/browser-tool.md` LR-054 still fires)
- Multi-section essays in place of the ≤200-word structure
- Hedging on hypothetical future scenarios

### Hard limits

- One cry per RCA, normally. 3 cry-for-helps without forward progress in one RCA → full halt + summary; do not loop further.
- Mama may cry ONLY when ALL of: (a) B has been judged honest, (b) A has been re-prompted with B's findings, (c) mama has considered whether mama itself is the bias. Document each (a)/(b)/(c) check in chat before emitting the cry.

---

## Phase 0: Collect Artifacts (READ ONLY — no edits, no MCP)

### Step 0.1: Read failure-summary.json
```
Extract ALL fields:
- testName, failureCategory, selector
- pageUrl, fullError (first 500 chars)
- consoleErrors (filter out favicon 404s)
- networkFailures (filter out favicon 404s)
- authChain, duration, lastActions
- workerIndex, retryAttempt
```

**Route by category:**
| Category | Next Step |
|----------|-----------|
| AUTH | Check authChain → escalate-tooling (NOT a code fix) |
| NETWORK | → Step 0.1b: Network RCA Procedure |
| INFRASTRUCTURE | escalate-tooling |
| SELECTOR/TIMING/ASSERTION/DATA/APPLICATION/BLOCKING | → Step 0.2 |

### Step 0.1b: Network RCA Procedure (when category = NETWORK or networkFailures non-empty)

**For each entry in `networkFailures[]`:**
1. Read `status`, `url`, `statusText`, `body` (first 2KB captured)
2. Classify:
   - **5xx** (500, 502, 503, 504) → **APP BUG**. File `reports/bugs/BUG-{MOD}-{NNN}.json`. Do NOT fix test code. Document and escalate.
   - **4xx on auth URL** (login.microsoftonline.com, b2clogin.com, oauth) → **AUTH issue**. Check `authChain[]` for redirect loop or token expiry. Escalate as infrastructure, not code fix.
   - **4xx on business API** (navigator API endpoints) → Check `body` for validation error message. Could be: bad test data (fix data), missing prerequisite state (fix test setup), OR app validation bug (file bug report).
   - **Empty `networkFailures[]` + test timed out** → **Client-side blocking**. The action never reached the API. Common cause: Angular form validation (`if (!form.valid) return;`). Check `error-context.md` for invalid fields, disabled buttons. On MCP: use fetch interception to prove zero API calls.

**For "button does nothing" scenarios (zero network activity):**
1. On MCP: inject fetch interceptor BEFORE clicking:
   ```javascript
   () => { window._apiCalls = []; const orig = window.fetch;
     window.fetch = (...a) => { window._apiCalls.push(a[0]); return orig(...a); }; }
   ```
2. Click the button, wait 2s
3. Read `window._apiCalls` — if length 0, client blocked the action
4. Check `form.valid` state: `document.querySelector('form')?.checkValidity()` or Angular-specific: check for `aria-invalid="true"` fields
5. This is likely a **UX bug** (button enabled but form invalid, zero feedback to user). File bug report.

**HAR context window**: DiagnosticsCollector captures 5 requests before/after each failure via `captureHar()`. When multiple APIs failed, the FIRST failure in the HAR window is the root cause — later failures may be cascading.

### Step 0.2: Read error-context.md
`reports/test-results/{test-slug}-{browser}/error-context.md`

This is a structured DOM analysis captured at the exact moment of failure. It contains page state, blocking elements (dialogs/overlays/alerts), selector existence checks, invalid fields, disabled buttons, and a raw DOM snapshot. Search for:
- **Failing selector/element**: Does it exist in the snapshot?
  - EXISTS → TIMING (appeared but test didn't wait) or BLOCKING (overlay/dialog)
  - MISSING → SELECTOR (wrong selector or element not rendered)
- **Unexpected elements**: alertdialog, overlay, loading spinner, error banner
- **Form state**: Are inputs populated? Are buttons enabled/disabled?

### Step 0.3: Read screenshot
`reports/test-results/{test-slug}-{browser}/test-failed-1.png`

Visual confirmation. Look for:
- Unexpected dialogs or modals
- Wrong page or tab
- Error messages in the UI
- Loading state that didn't complete

### Step 0.4: Open trace.zip (if available)
`npx playwright show-trace reports/test-results/{test-slug}-{browser}/trace.zip`

Or analyze programmatically:
- Compare Before/After DOM snapshots at the failing action
- Check network tab for failed API requests during the test
- Check console tab for JavaScript errors
- Identify the LAST SUCCESSFUL action before the failure

### Step 0.4b: Check video recording (TIMING/BLOCKING only)
`reports/test-results/{test-slug}-{browser}/video.webm`

If the failure is TIMING or BLOCKING, the video shows the exact visual sequence — flickering, race conditions, animations blocking interaction. Only retained on failure.

### Step 0.5: Read the failing spec code
From `fullError`, extract file:line → read spec at that line → trace to page object method → read method code.

Map: **What state should the app be in? What action was attempted? What was expected vs actual?**

### Step 0.6: Distinguish OBSERVATION from SPECIFICATION

Code comments in `src/selectors/`, `src/page-objects/`, `specs/`, and ANY in-repo comment block are **OBSERVATION-LEVEL** evidence, NOT specification. They may document the very bug you are hunting (a prior session's frozen-in-place note about observed app behavior).

**INTENDED behavior** cites, in this rank order (per ALL-024 truth hierarchy):
1. Old-site DOM (baseline) — Encore: see `CLAUDE.md` LR-ENC-001 for URL + creds + artifact directory.
2. `docs/REQUIREMENTS.md` — documented spec.
3. Old-site-baseline artifact files at `specs_planning/_internal/old-site-baseline/<module>-<YYYY-MM-DD>.md`.

**NEVER** cite an in-code comment as proof of INTENDED behavior. When an in-code comment contradicts what a user would naturally expect, the comment is the FIRST suspect (it likely documents the bug, not the spec). See LR-030 (LEARNED_RULES.md) — Requirement contradiction = investigate as bug, never silently update mental model to match a doc.

### Supplementary Reads
- **Framework logs**: `logs/{spec-name}/test-execution.log` — page object actions with timestamps (checkbox states, button enabled/disabled, tab activations, save operations). Shows what the test *thought* it did.
- **Per-spec diagnostics**: `reports/diagnostics/{spec-name}.diagnostics.json` — contains ALL tests in the spec (not just failures). Useful for serial failure analysis: compare test N-1 state vs test N.

---

## Phase 1: IS / IS-NOT Analysis (Kepner-Tregoe)

This is the most powerful technique for narrowing root cause. Fill in this table:

| Dimension | IS (fails) | IS NOT (works) | Therefore... |
|-----------|-----------|----------------|--------------|
| **WHERE** (which test) | TC-XXX in serial block | TC-YYY in isolation | Serial state pollution |
| **WHERE** (which env) | Playwright run | MCP browser | Playwright-specific event handling |
| **WHEN** (timing) | After ECT-007 runs | On fresh page load | ECT-007 leaves dirty state |
| **WHEN** (frequency) | 3/3 runs | Never passes | Deterministic, not flaky |
| **WHAT** (symptom) | Click blocked by overlay | Selector not found | Overlay is the blocker |
| **WHAT** (scope) | Only labor cost input | All ECT inputs | Specific to this element |

**The root cause lives in the DELTA between IS and IS-NOT.**

If it fails in Playwright but not MCP → the cause is in how Playwright interacts differently (event types, timing, dialog handling).
If it fails after test X but not in isolation → test X leaves state that causes the failure.
If it fails 1/3 times → timing/race condition. If 3/3 → deterministic logic/state issue.

---

## Phase 2: Fishbone Categorization

When IS/IS-NOT doesn't immediately point to root cause, brainstorm using 6 categories adapted for test automation:

```
                    ┌── Method (test logic, assertion order, cleanup sequence)
                    ├── Machine (browser version, CI runner, memory pressure)
TEST FAILURE ───────├── Material (server data state, DB values, API responses)
                    ├── Measurement (selector accuracy, timing thresholds, poll intervals)
                    ├── Environment (auth tokens, network latency, feature flags)
                    └── Man (prior test state pollution, agent error, wrong assumption)
```

For each branch, ask: "Could this cause the observed IS/IS-NOT pattern?" If yes, check the artifact evidence.

---

## Phase 3: 5 Whys Drill-Down

Once you have a candidate cause from Phase 1 or 2, drill down:

```
Why did ECT-009 fail?
  → Click blocked by "Unsaved changes" alertdialog overlay

Why was the alertdialog present?
  → A prior test left the ECT form in dirty state

Why was the form dirty?
  → ECT-007 filled Benefits Multiplier with 0.21 then restored 0.2 without saving

Why didn't the cleanup clear the dirty state?
  → Angular tracks intermediate edits even when final value matches original

Why didn't the reload fix it?
  → reloadBasicInfo navigates to BAS tab, but navigateToEctTab clicks ECT tab
    which triggers the Radix dialog before the fresh page state loads
```

Stop when you reach a cause you can ACT on (code change, config change, or skip decision).

---

## Phase 4: Flaky vs Deterministic Classification

If initial RCA is inconclusive, run the failing test in isolation 3 times:
```bash
npx playwright test --grep "TC-ID" --project=chrome --headed --repeat-each=3
```

| Result | Classification | Next Step |
|--------|---------------|-----------|
| 0/3 pass | DETERMINISTIC | Logic/state bug — fix or skip |
| 1-2/3 pass | FLAKY | Timing/race — investigate async behavior |
| 3/3 pass | SERIAL_DEPENDENCY | Prior test pollutes state — investigate cleanup |

---

## Phase 5: Live Browser Replication (Subagent B's job)

**Browser tool**: HEADED `playwright-cli` is the default for `/rca` (no exception — see `.claude/rules/browser-tool.md` Gate 2 row "RCA context"). Headed even in chain-spawned overnight runs — "at least there's a chance a human catches a glimpse of the bug." Override = LR-043 §A handshake in chat (one-shot, user-authorized).

**HEADED CLI walk is MANDATORY** when the failure is reproducible on demand. "Mandatory" means mama cannot accept a Phase 6 evidence summary or propose a fix without subagent B having walked and populated the `live-walk:` slot in the Evidence Chain.

| Failure Category | Live walk required? | When |
|-----------------|------------------------|------|
| SELECTOR | MANDATORY (HEADED CLI) | Before hypothesis |
| ASSERTION | MANDATORY (HEADED CLI) | Before hypothesis |
| BLOCKING | MANDATORY (HEADED CLI) | After IS/IS-NOT analysis |
| TIMING | MANDATORY (HEADED CLI) | After hypothesis (perturbation reveals races) |
| APPLICATION | MANDATORY (HEADED CLI) | After artifact read — characterize the bug envelope |
| DATA | MANDATORY (HEADED CLI) | After artifact read — characterize the data shape |
| AUTH/NETWORK/INFRA | LAST RESORT | Only if Steps 0-4 inconclusive AND the live app is reachable |

**Replication rules (subagent B):**
1. READ the spec code FIRST — find the recorded steps.
2. Use the recorded steps as the STARTING POINT, then **PERTURB**: vary inputs, toggle on/off, change order, try the workaround direction, find when the bug appears and when it disappears. The recorded steps are the **floor** of live work, not the ceiling. (See "Mama-Led Orchestration" — subagent B's job IS to explore the breakage envelope, not just replay.)
3. Test CSS selectors — CLI `eval` (`playwright-cli --raw -s=<name> eval "() => ..."` per LR-054 / `.claude/rules/browser-tool.md` Table 2).
4. Inspect network after each variation — CLI `network`. Compare before/after of each perturbation.
5. Document, per variation, what the live app shows vs what the test sees (feeds back into IS/IS-NOT AND populates subagent B's `variationsExplored[]`).
6. Hunt the workaround direction: what sequence of actions makes the bug go away? Record the workaround steps in subagent B's `workarounds[]` — that's the bug's escape envelope and is gold for the engineer fixing it.

---

## Phase 6: Evidence Summary & Fix Decision

**App bug gate (LR-034)**: If root cause is APPLICATION or DATA (app defect, not test defect) — follow **LR-034 Bug Filing Protocol** to file to `reports/bugs/`. Do NOT fix test code for app bugs. Then proceed to Phase 7.

Mama composes the RCA summary from accepted subagent outputs. Summary is **rejected** by mama if the `live-walk` slot is empty on a reproducible failure (slot is populated from subagent B's `variationsExplored[]` + `workarounds[]`). The mama-led orchestration framework treats the live-walk slot as load-bearing evidence — not optional documentation.

Write a structured RCA summary before ANY code edit:

```
## RCA: TC-XXX

### Classification
[SELECTOR | TIMING | ASSERTION | DATA | APPLICATION | AUTH | NETWORK | INFRA | BLOCKING]

### Evidence Chain
1. failure-summary.json: [specific field = specific value]
2. error-context.md: [specific element state]
3. screenshot: [visual observation]
4. trace.zip: [before/after diff]
5. spec code: [line N does X, expects Y]
6. live-walk: [URL clicked, DOM state observed, network observed, variations tried (count + 1-line each), workarounds found (count + steps)] — REQUIRED on reproducible failures; populated by subagent B's variationsExplored[] + workarounds[]. Empty slot → summary rejected by mama → cycle back to subagents or cry for help.

### IS/IS-NOT
| IS | IS-NOT | Delta |
|----|--------|-------|
| [where/when/what it fails] | [where/when/what it works] | [the difference] |

### 5 Whys
1. Why? → [answer citing evidence]
2. Why? → [answer citing evidence]
3. Why? → [actionable root cause]

### Root Cause
[One sentence: "The failure is caused by X because Y (evidence: Z)"]

### Mama's judgment trail
[One line per subagent: "Accepted A because [explored branches]; flagged [unexplored] as not relevant because [reason]."]
[One line per re-spawn: "Re-spawned B with: [verbatim missing-direction prompt]."]

### Fix
[Specific code change OR skip decision with justification — MUST pass REJECT bucket (no spec drift / no failed-experiment crud / no standard hides)]
```

---

## Phase 7: Fix with Evidence

1. ONE fix mapped to proven root cause
2. Run ONLY the failing test: `--grep "TC-ID" --project=chrome --headed`
3. Pass → run the full serial block to check for regressions
4. Fail (different error) → mini Phase 0 (Steps 0.1-0.3 minimum)
5. Fail (same error) → one more fix cycle
6. Max 2 fix cycles. Then `test.skip()` with documented RCA + evidence

**Document every fix attempt** — even failed ones. The evidence accumulates.

---

## Quick Reference: 8 Failure Categories

| Category | Signature | Typical Fix |
|----------|-----------|-------------|
| SELECTOR | Element not found, locator timeout | Update selector, verify on DOM |
| TIMING | Element found but action failed, timeout on poll | Add expect.poll(), increase timeout |
| ASSERTION | Value mismatch (expected X, got Y) | Fix expected value or test logic |
| DATA | Server state doesn't match test assumption | Dynamic read or reload before test |
| APPLICATION | App error, console errors, broken UI | File app bug, skip test |
| AUTH | SSO failure, login timeout | Retry or escalate infra |
| NETWORK | API 4xx/5xx, net::ERR_ABORTED | Check API health, retry |
| BLOCKING | Click intercepted by overlay/dialog/spinner | Dismiss blocker or wait for it to clear |
| INFRASTRUCTURE | Browser crash, CI timeout, resource exhaustion | Escalate tooling |


## Verification Artifact (D23)

Before declaring this skill done, emit one runnable / readable check the user (or next session) can re-run to confirm the output:

- File path + expected content (e.g., `plans/pending/X.md exists with **Status**: Pending`)
- Bash command + expected output (e.g., `git diff --stat ...` shows N files)
- Test command (e.g., `npm run typecheck`, `npx tsc --noEmit`)
- Or a structured expected-output template (≤10 lines)

Verification artifact ≠ prose summary. It is a runnable / readable check that confirms the skill's output. Without it, the work is unaudítable. Anthropic cupcake §786-793 — single highest-leverage tactic for AI-built artifacts.
