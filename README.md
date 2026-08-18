# Encore QA Automation

End-to-end Playwright test suite for Navigator Cloud (`cloudapps-e2e.encoreglobal.com`). Produces two reports per run (Playwright HTML + Allure). Browser projects (`chromium`, `encore-local-office`, `encore-locations`) and parallelism (worker count) are all configurable per run — defaults in `playwright.config.ts`, overridable via CLI flags or environment variables.

---

## Requirements

- Node.js ≥ 18
- npm ≥ 9
- ~1 GB disk for browsers + dependencies
- Network access to `cloudapps-e2e.encoreglobal.com` and Microsoft login endpoints

---

## Quickstart — one-line setup + run + reports

From inside the unzipped folder:

```bash
npm install && npx playwright install chromium && npm run test:cli
```

This installs dependencies + Chromium, then runs the full suite via `test:cli` (which preserves Allure history across runs). After it finishes, view reports with `npm run report` (Playwright HTML) or `npm run allure:open` (Allure).

---

## One-time setup

```bash
npm install
npx playwright install chromium
```

Credentials are not committed. Provide `NAVIGATOR_USERNAME`, `NAVIGATOR_PASSWORD`, and `BASE_URL` as environment variables — e.g. in a local `.env.local` file (using the values your QA automation team provides), or your CI's secret store — before running. `.env.e2e` holds only non-secret config.

Verify the setup with a single short spec (~60 seconds — exercises auth + a real module flow):

```bash
npm run test:grep -- "TC-LOC-CUR-001" --project=encore-locations
```

Green = credentials + SSO + fixtures all working.

---

## Running the suite

### Recommended — single command, Allure history preserved

```bash
npm run test:cli
```

This stashes Allure history, cleans, restores history, runs the suite, and regenerates the Allure report. The Trend widget accumulates day over day across runs.

### Other test commands

| Command | What it does |
|---|---|
| `npm test` | Run full suite, no history-preservation chain |
| `npx playwright test --project=chromium` | Run via the chromium project |
| `npx playwright test <path> --project=chromium` | Run a single spec or directory |
| `npm run test:debug` / `test:ui` / `test:headed` | Debug, Playwright UI, or headed-browser modes |
| `npm run test:failed` | Re-run only previously-failed tests |
| `npm run test:grep -- "@notes"` | Filter by tag/grep |
| `npx playwright test --list` | List every discoverable test without running |

### Clean single-spec run — report holds only that one run

When you want a report containing **exactly one spec, one run, zero stale data** (e.g. to screenshot a single module's result):

```bash
npm run clean:run -- tests/locations/location-auto-addon.spec.ts
npm run report          # Playwright HTML
npm run allure:open     # Allure
```

`clean:run` wipes both report systems (including the Allure history cache), runs only the spec you name, and regenerates Allure from scratch. Unlike `test:cli` — which runs the **whole suite** and **preserves** trend history — this is single-spec and history-free. Accepts any spec path or a `--grep "..."` filter.

### Tuning parallelism

Worker count defaults to 1 everywhere in `playwright.config.ts` due to an unresolved multi-worker conflict on shared Encore app state — when two workers run tests against the same office (e.g., 1604) in parallel, one worker's save surprises the other's mid-test assertion, causing false failures. Override per run with the `MAX_WORKERS` env var only if you understand this limitation:

```bash
MAX_WORKERS=4 npm test          # 4 workers (use only if aware of shared-state conflict)
MAX_WORKERS=1 npm test          # force serial (the default, safest)
```

More workers = faster wall-clock but higher contention on shared app state. Module projects keep `fullyParallel: false` so each spec file stays in one worker (required for the per-test baseline-reset ordering); different spec files still run in parallel across workers.

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

Each test step in the Playwright HTML report reads as a plain-English action (e.g. "Open the Currency tab", "Save changes and confirm") instead of raw selector code, so the report is readable without a technical background. Expand any step to see the underlying detail.

### Viewing reports locally

```bash
npm run report            # opens the Playwright HTML report
npm run allure:report     # generates + opens Allure in the browser
```

### When a test fails

Run `npm run share-for-debugging` after the suite (it's also run automatically in CI). The script writes `reports/share-for-debugging-<timestamp>.zip` containing the diagnostic JSON, traces, screenshots, videos, and logs. Send that one file to the QA automation team — that's all they need. The bundle also records tests that failed first and passed on retry — those are marked `"finalOutcome": "flaky"` in `failure-summary.json` and still carry their failing attempt's trace and screenshot.

---

## TestRail integration

Opt-in: after a run finishes, the suite pushes every result to TestRail as a
test run (pass/fail, duration, error details, spec location). It is **inert by
default** — nothing happens until you configure it.

### Where to configure

Copy the variables from [`.env.testrail.example`](.env.testrail.example) into a
`.env.local` file next to it (dotenv-flow picks it up automatically), or set
them as CI environment variables:

```bash
TESTRAIL_ENABLED=true
TESTRAIL_HOST=https://encore.testrail.net
TESTRAIL_USERNAME=you@company.com
TESTRAIL_API_KEY=<from TestRail → My Settings → API Keys>
TESTRAIL_PROJECT_ID=1
```

Then run the suite normally (`npm test`). On completion the reporter prints:

```
[testrail] pushed 30 results (28 passed, 2 failed) → https://encore.testrail.net/index.php?/runs/view/57
```

Optional: `TESTRAIL_SUITE_ID` (multi-suite projects), `TESTRAIL_MILESTONE_ID`
(attach runs to the current sprint's milestone — update it each sprint),
`TESTRAIL_RUN_ID` (append to one fixed run), `TESTRAIL_RUN_NAME`,
`TESTRAIL_CLOSE_RUN=true`.

### How tests map to TestRail cases

Per test, in priority order:

1. **Explicit TestRail id** — a `C<number>` in the title (`C123: Login works`,
   `[C123] Login works`) or a tag (`@C123`).
2. **TCMT display id** — automatic. Spec titles here already carry tokens like
   `TC-CPR-SRC-019`; the reporter looks up the TestRail case whose title
   contains the same token. When TestRail cases were imported from TCMT
   exports (which keep the `TC-…` id in the title), no per-test work is needed.

Tests that match neither are listed as a warning in the run output — never
dropped silently. Skipped tests are not posted (TestRail keeps them "Untested").
A TestRail outage or bad credentials can never fail the build; the reporter
logs a warning and all local reports remain intact.

---

## CI/CD integration

The suite is CI-agnostic. Pick the pattern that fits your pipeline:

**Simplest** — call the chain directly:
```yaml
- run: npm install
- run: npx playwright install chromium
- run: npm run test:cli
- run: npm run share-for-debugging
  if: always()
- uses: actions/upload-artifact
  if: always()
  with:
    path: reports/share-for-debugging-*.zip
```

Run `npm run share-for-debugging` and archive the resulting `reports/share-for-debugging-<timestamp>.zip` after EVERY run — pass, fail, or flaky. A test that fails and then passes on retry only leaves its failing-attempt trace inside that bundle; if the bundle is only archived on failure, that evidence is lost.

**Finer control** — split into stages, upload artifacts between them, set `continue-on-error` on the test step so reports still publish when tests fail.

Scheduling, runner infrastructure, secret management, artifact distribution, and credential rotation are owned by your deployment team — not wired into this repo.

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

Receive the latest version from the QA automation team. Do **not** commit or edit files under `src/**` or `tests/**` — those are framework-owned and will be overwritten on the next update. If you need a change in those paths, request it from the QA automation team.

Safe-to-edit without conflicts: anything under `reports/` (generated output) and `node_modules/` (installed). Credentials live in your environment / secret store, not in the repo.

---

## Troubleshooting

1. **Nothing runs at all** — `npm install` exited non-zero, or `npx playwright install chromium` didn't complete. Re-run both; check node/npm versions meet the requirements above.
2. **Every test fails with auth errors** — credentials expired or rotated. Update the credentials in your environment / secret store (`NAVIGATOR_USERNAME` / `NAVIGATOR_PASSWORD`).
3. **`TC-LOC-CUR-001` verify fails but the app works in a browser** — Microsoft SSO is having a bad moment. Retry in 5 minutes before deeper triage.
4. **Reports look empty / blank widgets** — run `npm run clean` and re-run `test:cli`. Some widgets (Trend) only populate after the second run.
5. **Allure Trend never grows** — ensure `test:cli` is used. `npm test` alone runs the suite without the stash/restore chain, so history doesn't accumulate.

---

## License & credentials

Credentials are provided via environment variables at runtime — nothing is committed. `.env.e2e` carries only non-secret CI config.
