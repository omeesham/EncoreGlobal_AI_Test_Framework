# Test Plan & Script Authoring Workflow

How the Local Office Settings suites (ECT Settings, then Basic Information) were built in this repo, step by step — kept here as the runbook for the *next* module, not just a history of this one.

## The one rule that overrides everything else below

> **Before writing a single line of plan, spec, page-object, data, or xlsx content for a new module, go read the equivalent files for an existing, already-working module first.** This repo's conventions live in its code, not in a style guide — `corporate-pg-pricing-override`, `terms-conditions`, `service-charge`, `locations/*`, and (once it exists) the previous local-office submodule are the source of truth for schema, naming, and structure. Every step below names which existing module to open before doing that step's work. Deviating without checking is how you end up writing something that *looks* plausible but doesn't match — see [Step 8](#step-8-audit-against-other-modules-before-calling-it-done) for what that cost the last time it happened.

---

## Step 0: Gather the requirements

Inputs for Basic Information were a PDF field/validation spec, a screenshot of the live UI, and a pointer to the sibling module (`local-office-ect`) already in the repo. Before doing anything else:
- Read the requirement doc/screenshot fully.
- Find the closest existing sibling module in the repo (same folder, same app area, or just structurally similar) and read *its* plan, spec, page object, data file, and xlsx end-to-end. For Basic Information, that sibling was `local-office-ect` (`specs/local-office-ect-settings.plan.md`, `tests/local-office/local-office-ect.spec.ts`, `src/pages/local-office/local-office-ect.page.ts`, `src/data/local-office/local-office-ect.ts`, `testcases/local-office/local-office-ect.xlsx`).
- Check whether a page object / selectors / data file already exist for the target area — they may have been built for an earlier ticket. (They had: `local-office-settings.page.ts`, `local-office-settings.ts` selectors and data were already ~70% built out before this work started.)

## Step 1: Write the test plan with the `playwright-test-planner` agent

Don't hand-write the plan from the requirement doc alone — the app's *actual* live behavior routinely differs from the spec doc (see every "confirmed live" / "documented discrepancy" note in both plan files). Delegate to the `playwright-test-planner` subagent instead:

- Give it the requirement doc's content, the target URL, the office/tenant to test against, and — critically — **the sibling module's plan file as the format template** ("match the exact structure, depth, and prose style of `specs/local-office-ect-settings.plan.md`").
- Tell it to read the existing page object/selectors/data files first and cite their real method/selector names in the plan, not invent new ones.
- Let it explore the live app itself (`planner_setup_page`, `browser_*` tools) and record what it actually finds, including anything that contradicts the requirement doc — that contradiction is a finding, not an error to hide.
- It saves the result via `planner_save_plan` to `specs/<module>.plan.md`.

Run it in the background (`run_in_background: true`) — a real plan pass for a form this size took ~40 minutes and ~270 tool calls.

## Step 2: Write the spec, page object, and data file — informed by the sibling module, not the generator agent

The `playwright-test-generator` subagent exists and is the "official" path (it drives the live app step-by-step per scenario and calls `generator_write_test`). It's the right choice when the plan itself is *unverified* or the scenario needs fresh live discovery.

For Basic Information, the plan from Step 1 was **already** live-verified (every value, every tooltip string, every DOM quirk was confirmed against the real app during planning). Re-deriving all 49+ scenarios through another full live-browser pass per test would have been redundant and much slower. Instead:
- The spec, page-object additions, and data-file additions were authored **directly**, using the plan's already-confirmed values as ground truth.
- Before writing any of it, the sibling module's actual code was read in full: `tests/local-office/local-office-ect.spec.ts` (describe-block tag format, `test('TC-ID: title', ...)` signature, `dependencyGate` usage, cleanup/restore pattern, comment style), `local-office-ect.page.ts` (class structure, `@step` decorator on every method, `getElement()` string-key lookup), and `local-office-ect.ts` data file (constant naming, `as const`).
- New page-object helpers were written as **generic** methods (parameterized by selector key / table key) rather than one-off methods per field, matching how the existing file already generalized (`getRadixCheckboxState`, `selectComboboxOption`, etc. in `base.page.ts`).
- A handful of DOM details the plan's prose didn't capture precisely enough to code against blind (the tooltip trigger's exact markup, the right-click delete menu's DOM) were checked with a short, targeted live session — not a full re-plan, just enough `browser_evaluate`/`browser_snapshot` calls to nail the selector, then closed.
- **Every new page-object method and test was still live-run against the real app** before being considered done — first in small batches while writing (to catch mistakes early and cheaply), then the complete suite in its natural sequential order at least once (see Step 4). Authoring from a verified plan saves the *exploration* pass; it does not excuse skipping *verification*.

If you don't have an already-verified plan, use the `playwright-test-generator` agent as intended instead of hand-authoring.

## Step 3: Build the testcases workbook (xlsx) — copy the sibling's exact schema

Do not invent an xlsx schema. Open the sibling module's workbook (`testcases/local-office/local-office-ect.xlsx`) with `openpyxl` and read its header row and row layout first:

```
TC ID | Title | Module | Submodule | Test Data | Type | Priority | Coverage Status |
Automation Status | Preconditions | Steps (Step) | Steps (Expected Result) | Notes / Reason
```

- One metadata row per case (TC ID/Title/etc. populated only on the case's first step row), one row per numbered step after that, a blank separator row, then a trailing `SUMMARY` row (`Coverage Status = "Automated: N / Pending: 0"`, `Automation Status = "Pass:0 Fail:0 Skipped:0 Blocked:0"`, `Notes/Reason = "Last Updated: <date>"`).
- **Title must equal the spec's test title verbatim** (minus the `TC-ID: ` prefix) — extract it programmatically from the actual `.spec.ts` file (regex over `test('TC-...: (.+?)', async`) rather than retyping it, so it can never drift.
- Steps/expected-result text can be drawn from the plan's own numbered steps and `- expect:` bullets (joined with `; ` when a step has multiple expects) — it doesn't need to restate the code line-for-line, just be a faithful paraphrase, the same relationship the sibling module's workbook has to its own spec.

## Step 4: Verify — the automated gates, then live runs

Run these in order, and don't skip any of them:

1. `npm run typecheck` — must be clean.
2. `npm run check:tc-ids` — every `TC-<MOD>-<SUB>-NNN` family must be sequential from 001 with no gaps, across every workbook and every spec that references it.
3. Register the new workbook basename in `scripts/convert-testcases-to-testrail.py`'s `SECTION_BY_BASENAME` (and `MODULE_CONFIG` labels if it's a genuinely new module folder), then run it: `python3 scripts/convert-testcases-to-testrail.py --only <module>`.
4. `npm run check:alignment` — the three-way guard (spec titles ↔ workbook titles ↔ TestRail CSV titles) must show zero mismatches for your module (pre-existing unrelated failures elsewhere in the repo are not your problem, but confirm they're pre-existing — check `git status` to see whether the failing paths were already untracked/unmodified before your session).
5. **Live-run the new tests against the real app.** Small batches first while authoring (a handful of representative/riskiest scenarios), then the complete new spec file in one sequential run, in its natural order, exactly as CI would run it (`fullyParallel: false` means every test in a spec file shares one browser session — order-dependent contamination only shows up in a full sequential run, never in an isolated one-off).

## Step 5: `playwright-test-healer` as the final regression pass

Once the gates above are green and the suite has been live-run at least once, hand the whole spec file to the `playwright-test-healer` subagent for one more full run:

- Tell it explicitly what to watch for beyond generic flakiness: cross-test state contamination (since all tests in the file share one session sequentially), stale test-data assumptions (baseline values drifting since the plan was written), and genuine root causes vs. band-aids (fix the page object/selector/data, never weaken an assertion just to make it pass).
- It should re-run affected tests after each fix, then the entire file once more as final confirmation, and leave the target office/tenant's data exactly as it found it.
- A clean `0 failures` result on the *first* full run (as happened here) is a valid, good outcome — it means the authoring-time live batches already caught everything; there's nothing to "heal" and the agent should say so rather than manufacture busywork.

## Step 6: Audit against a *different* live instance of the same screen

A plan/spec built and verified against one office/tenant/environment is implicitly scoped to that instance's data. Before calling coverage complete, open the same screen for a genuinely different instance (a different office number, a different account) and diff what you see against the plan:

- Do the validation *rules* still fire the same way from a different starting state? (They should — if they don't generalize, that's a real bug in the plan's understanding, not a data difference.)
- Are there **states** the other instance has that your baseline instance never exercised — an empty grid, a field with no default, a control at its boundary — that your scenarios never touch because your one baseline instance never sat in that state?
- Write new scenarios for any such gap, **simulated safely on your original target instance** (the one your suite already knows how to restore cleanly) rather than mutating the other instance's real data, unless the other instance is itself a disposable/QA-only environment.
- Update the plan doc with a dedicated section documenting the audit and the new scenarios, add the new tests to the spec, regenerate the xlsx (bump whatever hard-coded case-count assertions your generator script has), and re-run every gate in Step 4 again.

## Step 7: Audit against other modules before calling it done

Do a final, explicit pass comparing what you built against 2–3 *other* modules (not just the one sibling you copied from), side by side:

- xlsx header row and row layout — byte-for-byte, via `openpyxl`.
- TC-id prefix shape and `check:tc-ids` sequencing.
- Spec file skeleton: fixture import path, `test.describe('<Name> @module @submodule')` tag suffix, `test('TC-ID: Title', async ({ pageFixture }) => ...)` signature, and whichever cleanup convention is actually the *majority* one in this repo (`dependencyGate` — used in 14/33 spec files — not the TC-number-range dispatch some corporate-pricing files use, which is that module's own outlier, not the house style).
- Page-object shape: `extends BasePage`, `@step(...)` on every async public method, string-key `getElement()` lookups.
- Selector-file organization: flat per-module `.ts` files registered into the central `src/selectors/index.ts`; don't add a per-folder `index.ts` unless the module you're extending already has one.
- `MODULE_CONFIG` / `SECTION_BY_BASENAME` entries in `scripts/convert-testcases-to-testrail.py`.
- Anything in `README.md`'s documented conventions (e.g. the TestRail case-id mapping strategies) that your module should but doesn't yet participate in — and whether that's a genuine gap or a documented, accepted fallback (check whether the sibling module you copied from has the same gap; if it does, it's a pre-existing repo-wide gap, not something your module introduced).

Fix anything that doesn't match. In this pass, one real deviation was found (a `// spec: ... // seed: ...` header-comment block that exists nowhere else in the repo — a template artifact, not a convention) and removed.

---

## Reference-module cheat sheet

Which existing module/file to open before doing which kind of new work:

| Building... | Open this first |
|---|---|
| A new plan doc | The closest sibling's `specs/*.plan.md` (structure: Application Overview with confirmed-live layout/behaviors, then numbered Test Scenarios with Seed/File/Steps/expect) |
| A new spec file | The closest sibling's `tests/**/*.spec.ts` (fixture import, describe-tag format, test signature, cleanup pattern) |
| A new/extended page object | `src/pages/base.page.ts` for the shared primitives (checkbox/combobox/dialog helpers, deadline-poll pattern) + the closest sibling's own `*.page.ts` for class-level conventions |
| A new/extended data file | The closest sibling's `src/data/**/*.ts` (UPPER_SNAKE_CASE `as const` exports, one export per logical group of test values) |
| A new testcases workbook | Any existing `testcases/**/*.xlsx`, read via `openpyxl` — never guess the header row |
| Wiring a workbook into TestRail export | `scripts/convert-testcases-to-testrail.py`'s `MODULE_CONFIG` and `SECTION_BY_BASENAME` maps |
| Anything about how CI/TestRail/case-ids work | `README.md` — it documents the actual contract, don't assume |

## Standing reminder

**Always look at how another module already solved this before inventing a new way to solve it.** This repo has ~30 modules' worth of precedent; the fastest and safest path is finding the closest match and mirroring it, then deviating only where the target module's behavior genuinely differs — never deviating in *structure*, *naming*, or *schema* without a reason tied to the app itself.
