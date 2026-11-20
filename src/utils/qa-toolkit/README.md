# QA Quality and Validation Toolkit

Checks the test suite itself: coverage against requirements, script and assertion quality, locator stability,
duplicates, flaky tests and the failures of the last run. Everything lives in `src/utils/qa-toolkit/`; nothing in the
framework, the specs, the reporters or the TestRail integration is changed or called differently.

## Commands

```
npx ts-node src/utils/qa-toolkit/cli.ts <utility> [options]
npx ts-node src/utils/qa-toolkit/cli.ts all [--module <name>] [--with-flaky] [--fail-on High]
npx ts-node src/utils/qa-toolkit/cli.ts self-test
```

| Utility | Checks | Default scope |
|---|---|---|
| `coverage` | Acceptance criteria vs test cases; missing positive / negative / boundary cases | `testcases/` workbooks with a `<name>.acceptance.md` or `<name>-test-plan.md` |
| `quality` | Fixed waits, missing awaits, tests without assertions, duplicate titles, hardcoded credentials, empty catches, force actions | `tests/`, `src/pages/` |
| `assertions` | No business assertion, literal or matcher-less expects, unverified final actions, weak or conditional-only assertions, one-off reads | `tests/` |
| `locators` | Generated ids/classes, XPath, positional and styling selectors, unused selectors; suggested user-facing locators. `--live --url <page>` counts matches on a real page (navigation only) | `tests/`, `src/pages/`, `src/selectors/` |
| `duplicates` | Duplicate TC ids, titles, scripts and workbook steps; tests that differ only in data | `tests/`, `testcases/` |
| `flaky` | Runs tests N times (retries 0, 1 worker, TestRail off) and reports inconsistent results with pass/fail history | needs `--path` or `--grep` |
| `bugs` | Classifies the last run's failures (application, automation, synchronization, test data, environment, known defect) and drafts bug reports for application failures | `reports/test-results.json` + `reports/failure-summary.json` |
| `all` | Runs every utility above except `flaky` (add `--with-flaky`) and writes `summary.html` | each utility's own |

## Options

| Option | Meaning |
|---|---|
| `--dry-run` | Show what would be analysed or run; write and execute nothing |
| `--module <name>` | Limit every utility to that module (`tests/<m>`, `src/pages/<m>`, `src/selectors/<m>`, `testcases/<m>`) |
| `--path <p>` | File or folder to analyse (repeatable) — single utilities only |
| `--fail-on <severity>` | Exit 1 when a finding at or above `Critical`, `High`, `Medium` or `Low` exists (CI gate) |
| `--live --url <page>` | `locators`: also check selectors on that page (write the path without a leading `/` in Git Bash) |
| `--grep <re>` `--repeat <n>` `--project <p>` | `flaky`: which tests, how many runs (default 3), which project (default `chromium`) |
| `--out <dir>` | Report root (default `reports/qa-toolkit`) |

## Reports

`reports/qa-toolkit/<utility>/report.html` and `report.json` — start and finish time, counters, findings per file with
severity (Critical, High, Medium, Low) and a recommendation for each. `all` adds `reports/qa-toolkit/summary.html`.
Bug drafts: `reports/qa-toolkit/bug-detection/drafts/<TC id>.md`. Flaky raw results: `reports/qa-toolkit/flaky/runs.json`.

## Acceptance criteria (coverage)

Paste the Jira acceptance criteria into `testcases/<module>/<workbook name>.acceptance.md` using
[`coverage/acceptance-template.md`](coverage/acceptance-template.md). Without that file the analyzer falls back to the
requirement ids of the module's test plan (traceability only).

## Safety

- Static utilities only read files. `locators --live` only navigates (nothing clicked or typed).
- `flaky` runs tests with TestRail off, its own JSON reporter and its own output folder, so `reports/test-results.json`,
  `failure-summary.json`, the last run's screenshots/traces and TestRail are untouched. It refuses to run without a scope.
- `bugs` never writes to `reports/bugs/`; it only drafts, and only for failures with application evidence.

## Validating the toolkit

`cli.ts self-test` runs every utility on the deliberately bad samples in `self-test/fixtures/` (outside `tests/`, never
run by Playwright) and checks each rule fires — and that correct code stays clean.
