# Encore QA Automation

End-to-end Playwright test suite for Navigator Cloud (`cloudapps-e2e.encoreglobal.com`). Produces two reports per run (Playwright HTML + Allure).
Browser projects (`chromium`, `encore-local-office`, `encore-locations`) and parallelism (worker count — parallel test threads) are configurable per run.
Defaults are in `playwright.config.ts`, overridable via CLI flags or environment variables.

---

## Requirements

- Node.js ≥ 18
- npm ≥ 9
- ~1 GB disk for browsers + dependencies
- Network access to `cloudapps-e2e.encoreglobal.com` and Microsoft login endpoints

---

## Quickstart

Clone this repository and change into its root folder. Every command in this Quickstart runs from that one folder.

**1. Install dependencies and browsers.**

```bash
npm run setup
```

**2. Open `.env.local` and fill in your credentials.**

Open `.env.local` and fill in the two blank values at the top — your Navigator username and password.
Ask the QA automation team for a test account if you do not have one. Nothing else in that file needs changing.

`.env.e2e` is already in the folder — do not create or edit it. It is only read on a build server.

**3. Confirm login and setup are working.**

```bash
npm run test:grep -- "TC-LOC-CUR-001" --project=encore-locations
```

Green means login and setup are fine. It takes about one minute.

**4. Run the full suite and view results.**

```bash
npm run test:cli
```

Then open results with `npm run report` (Playwright HTML) or `npm run allure:report` (Allure).

---

## Running the suite

| Command | What it does | Why run it this way | Audience |
|---|---|---|---|
| `npm run test:cli` | Full suite, Allure history preserved across runs | Stashes and restores Allure history so trend data grows run over run. Use instead of bare `npm test`. | both |
| `npm test` | Full suite, no history-preservation chain | Only when trend tracking is not needed | both |
| `npm run share-for-debugging` | Packages traces (step-by-step test recordings), screenshots, videos, and logs into a zip for sharing | Run after every run. A flaky (sometimes passes on retry) test's failing trace only lives in this bundle. | both |
| `MAX_WORKERS=1 npm run test:cli` | Force the worker count to 1 | Use when the shared-office conflict bites. Multiple workers edit the same office simultaneously — one test's save disrupts another's assertion. | both |
| [Failure categorization](#failure-categorization) | Read the failure category before filing anything | Auth/network: retry. Timing/selector: QA team. Application/data: product team. | both |
| `npm run test:failed` | Re-run only tests that failed in the last run | Faster feedback loop when fixing a small set of failures | local |
| `npm run clean:run <spec>` | Wipe all reports, run one spec (a single test file), rebuild from scratch | Use when you need a report containing exactly one test and nothing stale | local |
| `npm run test:grep -- "pattern"` | Run tests whose title or tag matches the pattern | Find and run a specific test without running everything | local |
| `npm run test:ui` | Open the Playwright interactive UI | Step through tests visually; useful when building or debugging a single case | local |
| `npm run test:debug` | Run with the Playwright debugger attached | Step through a single test line by line | local |
| `npm run test:headed` | Run in a visible browser window | Watch what the test does in real time | local |
| `npx playwright test --list` | List every discoverable test without running | Check which tests exist before running them | local |
| `npx playwright test --project=chromium` | Run the full suite via the chromium project | Direct Playwright invocation for one-off runs | both |
| `npx playwright test <path> --project=chromium` | Run a single spec or directory | Direct Playwright invocation for a targeted run | both |
| Evidence bundle (CI) | Archive `reports/share-for-debugging-*.zip` on every run | Archive every run. The build server retries twice. A pass-on-retry only has a trace in the bundle. | CI |
| `npm run setup` | Install Node dependencies and all Playwright browsers | Run once after unzipping, or after a Node version upgrade | local |
| `npm run setup:browsers` | Install chromium, firefox, and webkit | Re-install browsers only, without touching Node packages | local |
| `npm run clean` | Delete all report and result folders | Start with a completely empty reports directory before a fresh run | both |
| `npm run typecheck` | Type-check all TypeScript without running tests | Catch type errors without running the full suite | both |

### Clean single-spec run — report holds only that one run

When you want a report containing **exactly one spec, one run, zero stale data** (e.g. to screenshot a single module's result):

```bash
npm run clean:run -- tests/locations/location-auto-addon.spec.ts
npm run report          # Playwright HTML
npm run allure:report   # Allure
```

`clean:run` wipes both report systems (including the Allure history cache), runs only the spec you name, and regenerates Allure from scratch.
Unlike `test:cli` — which runs the **whole suite** and **preserves** trend history — this is single-spec and history-free.
Accepts any spec path or a `--grep "..."` filter.

### Tuning parallelism

Worker count is caller-defined. `.env.local` and `.env.e2e` both set `MAX_WORKERS=4`, so that is the default locally and on CI; a shell `MAX_WORKERS` or `--workers` overrides it.
Mind the shared-state limitation: when two workers run tests against the same office (e.g., 1604) in parallel, one worker's save surprises the other's mid-test assertion, causing false failures.

```bash
npm test                         # 4 workers (from .env.local)
MAX_WORKERS=8 npm test           # pin to 8 for this run
MAX_WORKERS=1 npm test           # force serial (safest on shared app state)
npx playwright test --workers=4  # same, via the CLI flag
```

More workers = faster wall-clock but higher contention on shared app state.
Module projects keep `fullyParallel: false` so each spec file stays in one worker (required for the per-test baseline-reset ordering).
Different spec files still run in parallel across workers.

---

## Reports

After every run:

| Path | Contents |
|---|---|
| `reports/html-report/` | Latest Playwright HTML report |
| `reports/allure-report/` | Latest Allure report (with Environment, Categories, Trend) |
| `reports/failure-summary.json` | Machine-readable failure data (see **Failure categorization** below) |
| `reports/junit-results.xml` | JUnit XML for CI dashboards |
| `reports/test-results.json` | Raw Playwright results |

Each test step in the Playwright HTML report reads as a plain-English action (e.g. "Open the Currency tab", "Save changes and confirm") instead of raw selector code.
The report is readable without a technical background. Expand any step to see the underlying detail.

**Every step at the top level of a test body is numbered — `Step 1:`, `Step 2:` — automatically.**
Steps reach the report from two places, both of which number themselves through the same counter:

| Source | What it names | Where it comes from |
|---|---|---|
| `@step('...')` decorator | Every page-object action, automatically | `src/fixtures/step-decorator.ts`, applied to each public async method of a page object |
| `phase()` / `verify()` | The business step a spec is on, with the page-object steps nested under it | `src/fixtures/report-steps.ts`, called from the spec |

So a spec that just calls page objects already gets a numbered run with no edits at all. Hook
bodies (`beforeEach`) are excluded from the count, so setup never spends "Step 1" and a test body
always starts at Step 1. Only the outermost step takes a number — anything nested inside it is that
step's detail, not a step of its own.

`phase()` groups the actions of one business step; `verify()` groups one check and is boxed, so a
failed assertion is reported against the named check rather than against Playwright's internals.
Both **number** the step they create, counting in call order within each test, and both return
their body's value, so grouping a test never forces its variables to move:

```ts
await phase('Open the Add Product Code form', () => pc.openAddDialog());
const tabs = await phase('Read the dialog tabs', () => pc.readDialogTabs());
await verify('The form opens on a single Item tab', async () => {
  expect(tabs).toEqual(['Item']);
});
```

reads in the report as:

```
Step 1: Open the Add Product Code form
Step 2: Read the dialog tabs
Step 3: The form opens on a single Item tab
```

Pass the business phrase only — the number is added for you, so inserting or reordering a step
never means renumbering its neighbours. Nested phases are left unnumbered: they are the detail of
the step above them, not steps of their own.

A bare page-object call at a test's top level needs no wrapper — it is already a numbered, named
step. Reach for `phase()` when several actions belong to one business step, or when the business
phrase says more than the method name does; reach for `verify()` around every assertion cluster,
which would otherwise reach the report as an unnamed `Expect toBe`. Inside a step, call page
objects and assert freely — that detail nests underneath.

`npm run check:steps` lists what still reports without a name: bare `expect(...)` assertions and
raw `page.` / `locator(...)` drives that have no page object behind them. It is advisory by
default (`--strict` makes it fail a run), because those lines are numbered already — what they
lack is a business name.

### Missing data-testid audit — Locations

```bash
npm run audit:testids                                        # console summary + written report
node scripts/audit-missing-testids.js --module pricing       # one tab
node scripts/audit-missing-testids.js --priority CRITICAL,HIGH
```

`npm run audit:testids` reads the Locations selector definitions (`src/selectors/locations`, plus
the Locations entries of `src/selectors/auth/dynamic.ts`) and the Locations page objects, and
reports every element the suite reaches **without** a data-testid, ranked by how easily the
fallback breaks: positional `nth-child` (CRITICAL), text matching (HIGH), placeholder / form name
/ aria-label / CSS class (MEDIUM), and bare tags inside a testid container (LOW). Each finding
carries the selector in use, where it is used, and a suggested data-testid following the
convention the application already uses — so the output can go to the app team as-is.

It writes three files into `reports/bugs/`, all named `missing-testid-locations`:

| File | What it is for |
| --- | --- |
| `.md` | The readable report — summary, methodology, per-tab tables, quick wins, exclusions |
| `.xlsx` | The workbook to hand to the application team (see below) |
| `.json` | Machine-readable, for a dashboard or a follow-up script |

The workbook has five sheets: **Summary** (metrics, priority counts, per-module breakdown,
coverage projections), **Missing testids** (one row per element, with an autofilter and empty
*Dev status* / *Dev comment* columns for the app team to fill in), **How to locate** (each screen
with numbered steps for reaching it by hand), **Exclusions** (what was left out and why), and
**Naming convention** (the patterns to follow when adding the attributes).

Every finding carries three ways to reach the element in a browser: *CSS to check in DevTools*
(valid CSS — Playwright's `:has-text()` is dropped, since a browser ignores it), *Text to match*
(the on-screen copy CSS cannot express) and a *Console one-liner* that combines the two and
returns exactly the element, filtering a container by its text before querying inside it.

Selectors are reported as the **full path from the page root**, not as the fragment on the source
line: a page object reaches a grid cell through the dialog, then the row, then the cell, so one
step matches nothing on its own. The audit resolves each chain — local variables,
`getElement('key')` roots, getters and template strings — so what the report prints can be
searched for in the DOM; `${placeholder}` marks a value a test supplies at run time. The workbook
keeps the raw fragment too, in *As written in code*, for cross-referencing the source line.
Override any path with `--md`, `--xlsx` or `--json`; if a report is open in Excel or your editor,
that one file is skipped with a note and the others are still written.

Row counts, header enumeration and `.count()` probes are excluded as structural: they query shape,
not identity. Scope is hard-coded to Locations, so no other module is ever read or reported.

To keep an intentional fallback out of the report, put `// testid-audit: ignore -- <reason>` on the
line above the selector; it moves to the report's exclusions appendix with that reason attached.
`--strict` exits non-zero while any CRITICAL or HIGH finding remains, for use in a pipeline.

### Viewing reports locally

```bash
npm run report            # opens the Playwright HTML report
npm run allure:report     # generates + opens Allure in the browser
```

### When a test fails

Run `npm run share-for-debugging` after every local run. The sample workflow below already includes it as a step.
The script writes `reports/share-for-debugging-<timestamp>.zip` containing the diagnostic JSON, traces, screenshots, videos, and logs.
Send that one file to the QA automation team — that's all they need.
The bundle also records tests that failed first and passed on retry.
Those are marked `"finalOutcome": "flaky"` in `failure-summary.json` and still carry their failing attempt's trace and screenshot.

---

## Exploratory bug-discovery crawler

A crawler that explores the application the way a tester would — opens a screen, looks at what is
actually there, interacts with it, and reports anything that looks wrong. It has no predefined test
cases: what it does next is decided from the UI it finds.

```bash
npm run crawl            # crawl the live application, read-only, write the bug report
npm run crawl:headed     # the same, with a visible browser
npm run crawl:check      # the crawler's own test suite (no app, no auth, ~15s)
```

`npm run crawl` reuses the shared auth state the `setup` project already maintains, so it needs no
credentials of its own. It is **not** part of `npm test` — it is a quarter-hour exploratory session,
not a unit of the suite.

### What it reports

Four files land in `reports/bugs/crawler/`:

| File | For |
| --- | --- |
| `bug-report.md` | pasting into a ticket or a pull request |
| `bug-report.html` | reading — self-contained, no network, evidence inline |
| `bug-report.json` | importing into a defect tracker, or diffing against the last run |
| `crawl-summary.json` | everything, including what was **not** covered |

Every bug carries an ID, title, severity, priority, module/page, preconditions, steps to reproduce,
expected result, actual result, evidence screenshot and URL. Repeat sightings of one defect collapse
into a single entry with an occurrence count and the list of screens it appeared on.

The summary also records what was **not** tested and why — controls the safety rules refused, pages
the budget did not reach, elements that could not be interacted with. An empty bug list means
nothing without that half.

### What it checks

| Detector | Looks for |
| --- | --- |
| `page-crash` | crash banners, blank renders, routes answering 4xx/5xx, soft 404s |
| `console-error` | uncaught exceptions and console errors, attributed to the action that caused them |
| `network-failure` | requests that fail or answer 4xx/5xx |
| `broken-link` | anchors pointing nowhere, and destinations that answer 4xx/5xx |
| `dead-control` | a control that neither navigates, opens anything, nor changes the page |
| `unexpected-route` | navigation landing somewhere other than the link advertised |
| `form-validation` | fields accepting a value their own type says is invalid, with no message |
| `input-boundary` | boundary values that break a field or truncate it silently |
| `placeholder-text` | `undefined`, `Invalid Date`, `{{i18n.key}}` and friends rendered to the user |
| `missing-label` | form controls a screen reader cannot announce |
| `accessibility` | unnamed controls, images with no alt, missing/duplicated headings, duplicate ids |
| `layout` | horizontal page overflow, text clipped by its container, overlapping controls |
| `page-title` | screens with no meaningful `<title>` |

### Safety

**Read-only by default.** The crawler navigates, opens, sorts, filters, paginates and types, and it
restores every field and checkbox it touches. It will not press a control whose name reads as
state-changing (`Save`, `Submit`, `Import`, …) or destructive (`Delete`, `Remove`, `Deactivate`, …)
unless you turn those on explicitly:

```bash
CRAWLER_ALLOW_WRITES=true npm run crawl        # may submit forms
CRAWLER_ALLOW_DESTRUCTIVE=true npm run crawl   # may delete data — disposable environments only
```

Sign-out, download and export controls are never clicked, whatever those settings say — a crawler
that signs itself out has ended its own run.

### Configuration

Defaults live in code, are overridden by `config/crawler/crawler.config.json`, then by `CRAWLER_*`
environment variables, then by anything passed to `crawlApplication()`.

| Variable | Default | Meaning |
| --- | --- | --- |
| `CRAWLER_START_URL` | `BASE_URL` | where the crawl starts |
| `CRAWLER_MAX_PAGES` | `25` | distinct screens to visit |
| `CRAWLER_MAX_ACTIONS` | `200` | total interactions |
| `CRAWLER_MAX_ACTIONS_PER_PAGE` | `12` | interactions on any one screen |
| `CRAWLER_MAX_DEPTH` | `3` | link hops from the start URL |
| `CRAWLER_MAX_DURATION_MS` | `900000` | wall-clock budget; the crawl stops cleanly and still reports |
| `CRAWLER_INCLUDE` | — | comma-separated patterns; only matching URLs are crawled |
| `CRAWLER_EXCLUDE` | — | comma-separated patterns; these are never visited |
| `CRAWLER_ALLOWED_ORIGINS` | start URL's origin | origins the crawl may leave the start origin for |
| `CRAWLER_DETECTORS` | all | comma-separated; run only these |
| `CRAWLER_DISABLE_DETECTORS` | — | comma-separated; run everything except these |
| `CRAWLER_ALLOW_WRITES` | `false` | permit state-changing controls |
| `CRAWLER_ALLOW_DESTRUCTIVE` | `false` | permit destructive controls |
| `CRAWLER_SCREENSHOTS` | `true` | capture evidence screenshots |
| `CRAWLER_OUTPUT_DIR` | `reports/bugs/crawler` | where the reports are written |

Example — one screen and everything it links to, validation checks only:

```bash
CRAWLER_START_URL=https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/settings CRAWLER_MAX_DEPTH=1 CRAWLER_DETECTORS=form-validation,input-boundary npm run crawl
```

### Why it does not run forever

Three independent guards, and all three are needed. Pages are remembered by a **normalized** URL,
with record ids folded out — `/locations/1604/settings` and `/locations/9981/settings` are one
screen, not a thousand. Each control is interacted with once per screen shape, so a sort toggle that
re-renders a grid is not an infinite loop. And every budget above ends the crawl cleanly, with a
complete report and a `stopReason` saying which one ran out.

### Using it from code

```ts
import { crawlApplication } from './src/crawler';

const { summary, reports } = await crawlApplication(page, {
  startUrl: 'https://…/navigator/locations/1604/settings',
  limits: { maxPages: 10, maxDepth: 2 },
});
```

---

## TestRail integration

Opt-in: when a run finishes, every result is pushed to TestRail as a test run
(pass/fail, duration, error details, spec location). It is **inert by default** —
nothing happens until `TESTRAIL_ENABLED=true` and the connection vars are set.

### Where to configure

Copy the variables from [`.env.testrail.example`](.env.testrail.example) into
`.env.local` (dotenv-flow picks it up automatically), or set them as CI
environment variables:

```bash
TESTRAIL_ENABLED=true
TESTRAIL_HOST=https://encore.testrail.net
TESTRAIL_USERNAME=you@company.com
TESTRAIL_API_KEY=<from TestRail: My Settings > API Keys>
TESTRAIL_PROJECT_ID=8
TESTRAIL_SUITE_ID=1620
```

Then run the suite normally (`npm test`). On completion the reporter prints:

```
[testrail] pushed 30 results (28 passed, 2 failed) -> https://encore.testrail.net/index.php?/runs/view/57
```

Each execution creates a fresh run containing exactly the cases that ran.
Optional: `TESTRAIL_MILESTONE_ID` (attach runs to the current sprint's milestone),
`TESTRAIL_RUN_ID` (append to one fixed run instead of creating one),
`TESTRAIL_RUN_NAME`, `TESTRAIL_CLOSE_RUN=true`.

### How tests map to TestRail cases

Per test, in priority order:

1. **Explicit TestRail id** — a `C<number>` in the title (`C123: Login works`,
   `[C123] Login works`) or a tag (`@C123`).
   Every `tests/corporate-pricing/` test carries its case id this way, as a
   Playwright tag option: `test('TC-CPR-DET-001: …', { tag: '@C99703' }, …)`.
   The tag lives in the options object, not the title, so titles stay aligned
   with the workbooks.
2. **TC display id** — the TestRail case whose title contains the same
   `TC-…` token as the spec title (only fires when cases were imported with the
   id kept in the title).
3. **Case title** — the spec title minus its `TC-ID: ` prefix, matched against
   the TestRail case title (punctuation and case folded). This is the one that
   fires for cases imported from `testcases-testrail-import/`, whose generated
   titles deliberately drop the TC-id prefix.

Strategy 3 depends on the spec → workbook → CSV title alignment that
`npm run check:alignment` enforces, so a title edit that skips the workbook will
silently stop matching — run the check after renaming tests. A test only gets a
result when its case actually exists in the TestRail suite; anything not yet
imported is listed as unmatched.

Tests that match no case, or whose title matches more than one case, are listed
as warnings in the run output — never dropped silently and never guessed.
Skipped tests are not posted (TestRail keeps them "Untested"). A TestRail outage
or bad credentials can never fail the build; the reporter logs a warning and all
local reports remain intact.

### Syncing newly authored test cases into TestRail

`npm run testrail:sync` is the one command for turning a new module's
`testcases/**/*.xlsx` into live TestRail cases, kept in lockstep with the
Playwright specs and the generated CSVs:

1. Regenerates `testcases-testrail-import/**/*.csv` from `testcases/**/*.xlsx`
   (`scripts/convert-testcases-to-testrail.py`) — no hand conversion needed.
2. Runs `check:tc-ids` and `check:alignment` — the spec ↔ workbook ↔ CSV chain
   must be clean (ascending TC ids, matching titles) or the sync stops here.
3. Diffs the CSVs against `config/testrail/case-map.json` and reports only the
   TC ids that don't have a TestRail case yet — already-mapped cases are left
   untouched, so re-runs are safe.
4. Probes TestRail connectivity (`get_project`) with the same env vars as the
   reporter above.

That's the **dry run, and it's the default** — nothing is created and no file
is written. Review the plan it prints, then pass `--execute` to actually
create the new cases and write their returned ids into
`config/testrail/case-map.json` (the same file the reporter above resolves
results against) plus a `reports/testrail-import-report.json` cross-reference
of TC id → TestRail case id → spec file:line.

```bash
npm run testrail:sync                       # dry run — plan + connectivity check only
npm run testrail:sync -- --only local-office  # scope to workbooks whose name contains this text
npm run testrail:sync:execute                 # actually import + update case-map.json
```

Section hierarchy, priority, type, and steps for each new case come straight
from the generated CSV row (see `testcases-testrail-import/README.md`); labels
are best-effort and silently skipped if the TestRail instance doesn't have the
Labels feature enabled. A case that fails to import is reported and skipped —
already-created cases in the same run are still written to `case-map.json`,
so re-running only retries the failures.

---

## Running it on GitHub Actions

1. **Put this project in a GitHub repository.** The folder you cloned is the repository root — the workflow file's paths assume that layout.

2. **Add the two credentials as repository secrets.**
   Go to **Settings**, then **Secrets and variables**, then **Actions**, then **New repository secret**.
   Add two secrets named exactly `NAVIGATOR_USERNAME` and `NAVIGATOR_PASSWORD`.
   Secrets cannot be read back afterwards, by anyone.

3. **Create the workflow file.**
   Create `.github/workflows/e2e.yml` in the repository root and paste this content:

```yaml
name: E2E Tests

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci

      - run: npx playwright install --with-deps chromium

      - name: Run E2E tests
        run: npm run test:cli
        env:
          CI_ENV: e2e
          NAVIGATOR_USERNAME: ${{ secrets.NAVIGATOR_USERNAME }}
          NAVIGATOR_PASSWORD: ${{ secrets.NAVIGATOR_PASSWORD }}

      - name: Package debugging evidence
        run: npm run share-for-debugging
        if: always()

      - name: Upload evidence bundle
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: e2e-evidence
          path: reports/share-for-debugging-*.zip
```

This workflow triggers on pushes to `main` only — trigger it manually from the Actions tab if you are on a different branch.

4. **Push, then open the Actions tab and watch the run.**

5. **When it goes red**, download the evidence bundle from the run's Artifacts and send that one file to the QA automation team.

Run `npm run share-for-debugging` and archive the resulting `reports/share-for-debugging-<timestamp>.zip` after EVERY run — pass, fail, or flaky.
A test that fails and then passes on retry only leaves its failing-attempt trace inside that bundle; if the bundle is only archived on failure, that evidence is lost.

On a build server, `.env.e2e` values win over anything in `.env.local`. Locally, `.env.e2e` is not read at all — `.env.local` supplies everything.

This delivery contains no `.github` folder on purpose — create that file yourself using the workflow above.

---

## Failure categorization

Every failing run writes `reports/failure-summary.json`. Each failure carries a `failureCategory` classified into one of:

| Category | Who to file with |
|---|---|
| `AUTH` | Transient SSO flake — retry. Escalate if persistent. |
| `NETWORK` | Usually upstream / environment. Re-run before triaging. |
| `TIMING` / `SELECTOR` / `INFRASTRUCTURE` | Framework-side — file with the QA automation team |
| `APPLICATION` / `DATA` (a.k.a. "Product Defects") | App-side — file with Encore's product team |

Allure's **Categories** panel groups failures into the same buckets visually.

---

## Updating

Receive the latest version from the QA automation team.
Do **not** commit or edit files under `src/**` or `tests/**` — those are framework-owned and will be overwritten on the next update.
If you need a change in those paths, request it from the QA automation team.

Safe-to-edit without conflicts: anything under `reports/` (generated output) and `node_modules/` (installed). Credentials live in your environment / secret store, not in the repo.

---

## Troubleshooting

1. **Nothing runs at all** — `npm install` exited non-zero, or `npx playwright install chromium` didn't complete. Re-run both; check node/npm versions meet the requirements above.
2. **Every test fails with auth errors** — credentials expired or rotated. Update the credentials in your environment / secret store (`NAVIGATOR_USERNAME` / `NAVIGATOR_PASSWORD`).
3. **`TC-LOC-CUR-001` verify fails but the app works in a browser** — Microsoft SSO is having a bad moment. Retry in 5 minutes before deeper triage.
4. **Reports look empty / blank widgets** — run `npm run clean` and re-run `test:cli`. Some widgets (Trend) only populate after the second run.
5. **Allure Trend never grows** — ensure `test:cli` is used. `npm test` alone runs the suite without the stash/restore chain, so history doesn't accumulate.
6. **`Missing required env var: BASE_URL`** — `.env.local` is missing or its values at the top are still blank. Go back to Quickstart step 2.
7. **`Credentials unavailable: Invalid credentials: username and password required`** —
   the two values in `.env.local` are still empty, or the account requires an authenticator code and the tests cannot type one.

---

## License & credentials

Locally, credentials go in `.env.local`.
On a build server, they come from that server's secret store.
`.env.e2e` holds no passwords in either case.
Do not commit `.env.local` once you have filled it in.
