import { defineConfig } from '@playwright/test';
import * as dotenvFlow from 'dotenv-flow';
import * as fs from 'fs';
import * as path from 'path';

// Local-first: bare `npm test` loads .env.local; CI sets CI_ENV=e2e to load .env.e2e.
dotenvFlow.config({
  path: __dirname,
  node_env: process.env.CI_ENV || process.env.NODE_ENV || 'local',
  silent: true,
});

function getArtifactSetting(envVar: string, defaultValue: string): string {
  const value = process.env[envVar]?.toLowerCase();
  if (!value || value === 'true') return defaultValue;
  if (value === 'false') return 'off';
  return value;
}

// Fail fast on a malformed MAX_WORKERS instead of silently handing NaN to the runner.
function parseMaxWorkers(raw: string | undefined): number | undefined {
  if (raw === undefined || raw === '') return undefined;
  if (!/^[1-9]\d*$/.test(raw)) {
    throw new Error(
      `MAX_WORKERS must be a positive integer (e.g. MAX_WORKERS=2), got "${raw}".`,
    );
  }
  return parseInt(raw, 10);
}

// Feeds the CI globalTimeout: 15 minutes per spec file, counted at config load,
// so a wedged run stops instead of burning the runner for hours.
function countSpecFiles(dir: string): number {
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) count += countSpecFiles(full);
    else if (entry.name.endsWith('.spec.ts')) count += 1;
  }
  return count;
}

/**
 * Whether the live exploratory crawl is part of this run.
 *
 * Every Playwright project runs when none is named, and the crawler is a quarter-hour session
 * against the real application — so a bare `npm test` would silently grow by fifteen minutes.
 * Registering it only when it is asked for keeps `--project=crawler` (what `npm run crawl` passes)
 * as the one way in. Its own test suite, `crawler-checks`, is NOT gated: it needs no application,
 * finishes in seconds, and is exactly what should run on every change.
 */
/**
 * Suffix for every per-run report path, set by scripts/run-regression.mjs.
 *
 * A regression is executed as TWO Playwright invocations — the parallel modules
 * at 8-9 workers, then `tests/locations` on a single worker (see that script).
 * Both would otherwise write `reports/html-report`, `reports/test-results.json`,
 * `reports/junit-results.xml` and `reports/failure-summary.json`, and the second
 * would silently erase the first. REPORT_SUFFIX=locations keeps them apart.
 * Unset (a plain `npm test`) leaves every path exactly as it was.
 */
const REPORT_SUFFIX = process.env.REPORT_SUFFIX ? `-${process.env.REPORT_SUFFIX}` : '';

/**
 * Spec paths to drop from this invocation, comma-separated, set by
 * scripts/run-regression.mjs.
 *
 * The regression's fast phase must skip the heavy specs that its own low-concurrency
 * phase owns, and Playwright's CLI has no `--ignore`: the only way to subtract files
 * from a run is testIgnore, which lives here. Unset (any run not driven by that
 * script) subtracts nothing.
 */
const EXCLUDE_SPECS = (process.env.REGRESSION_EXCLUDE ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/** Project testIgnore overrides the top-level one rather than merging, so every
 *  project that sets its own must fold REGRESSION_EXCLUDE back in by hand. */
function ignoring(...projectIgnores: string[]): string[] {
  return [...projectIgnores, ...EXCLUDE_SPECS];
}

function crawlerRequested(): boolean {
  if (process.env.CRAWLER_ENABLED === 'true') return true;
  const named = process.argv.some((arg) => arg === 'crawler' || arg.endsWith('=crawler'));
  // This config is re-evaluated in every worker process, and a worker's argv does NOT carry the
  // --project the runner was started with. Reading argv alone therefore builds a project list in
  // the main process that the workers cannot reproduce, and Playwright rejects the run with
  // "Project 'crawler' not found in the worker process". Promoting the flag to the environment
  // fixes that: workers inherit env, so both processes decide the same way.
  if (named) process.env.CRAWLER_ENABLED = 'true';
  return named;
}

export default defineConfig({
  // Must stay scoped to `tests/`: a root testDir matches testMatch as `**/<pattern>`,
  // so it also collects `.claude/worktrees/*/tests/**`. testIgnore cannot undo that.
  testDir: path.join(__dirname, 'tests'),
  testMatch: ['**/*.spec.ts'],

  timeout: process.env.CI ? 60 * 1000 : 30 * 1000,
  expect: { timeout: 5000 },
  globalTimeout: process.env.CI ? countSpecFiles(path.join(__dirname, 'tests')) * 15 * 60 * 1000 : undefined,

  // HARD RULE: 1 spec = 1 worker. Within-file parallel races tests against each
  // other's shared form/server state — do not flip back to true.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,

  retries: process.env.CI ? 2 : 1,
  // Worker count is caller-defined: `--workers=N` or `MAX_WORKERS=N`.
  // Unset falls through to Playwright's default (half the CPU cores).
  workers: parseMaxWorkers(process.env.MAX_WORKERS),

  preserveOutput: 'always',

  reporter: [
    ['list'],
    // Local reporter — kept under the client tree so it ships inside the client bundle.
    ['./src/reporter/agent-reporter.ts'],
    ['html', { outputFolder: `reports/html-report${REPORT_SUFFIX}`, open: 'never' }],
    ['json', { outputFile: `reports/test-results${REPORT_SUFFIX}.json` }],
    ['junit', { outputFile: `reports/junit-results${REPORT_SUFFIX}.xml` }],
    // TestRail push — opt-in via TESTRAIL_ENABLED=true (+ connection vars); see .env.testrail.example.
    ...(process.env.TESTRAIL_ENABLED === 'true'
      ? [['./src/reporter/testrail-reporter.ts'] as const]
      : []),
    // Skip Allure on CI — its GitCommitInfo plugin times out on shallow-clone
    // runners (M365 build agents have no full git history).
    ...(process.env.CI ? [] : [['allure-playwright', {
      resultsDir: 'reports/allure-results',
      detail: true,
      suiteTitle: true,
      environmentInfo: {
        Framework: 'Encore Playwright',
        Environment: process.env.CI_ENV || 'local',
        'Base URL': process.env.BASE_URL || 'https://cloudapps-e2e.encoreglobal.com/navigator/',
        Node: process.version,
        Platform: process.platform,
      },
      categories: require('./config/allure/categories.json'),
    }]] as const),
  ],

  use: {
    baseURL: process.env.BASE_URL || 'https://cloudapps-e2e.encoreglobal.com/navigator/',

    trace: getArtifactSetting('ENABLE_TRACING', process.env.CI ? 'on-first-retry' : 'retain-on-failure') as any,
    screenshot: {
      mode: getArtifactSetting('ENABLE_SCREENSHOTS', 'only-on-failure') as any,
      fullPage: true,
    },
    // Kept for any spec that uses Playwright's own context fixture. The suite's tests do NOT:
    // they run on the worker-scoped context built in pages.fixture.ts, which this option never
    // reaches — that fixture reads ENABLE_VIDEO itself and records the session video. Screenshot
    // and trace above are likewise re-implemented there for the same reason.
    video: getArtifactSetting('ENABLE_VIDEO', 'retain-on-failure') as any,

    viewport: { width: 1920, height: 1080 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
    permissions: [],

    actionTimeout: 10 * 1000,
    navigationTimeout: 30 * 1000,
  },

  projects: [
    // AUTH-STATE-SHARED setup project: runs ONCE before any test project to acquire/refresh
    // shared auth state at .auth/encore-state.json.
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
      use: { viewport: { width: 1920, height: 1080 } },
    },
    // Catch-all for non-module specs; testIgnore stops it double-running the specs
    // owned by the encore-locations and encore-local-office projects below.
    {
      name: 'chromium',
      dependencies: ['setup'],
      testIgnore: ignoring('tests/locations/**', 'tests/local-office/**', 'tests/crawler/**'),
      use: {
        viewport: { width: 1920, height: 1080 },
        storageState: '.auth/encore-state.json',
        launchOptions: {
          args: [
            '--disable-blink-features=AutomationControlled',
            '--disable-dev-shm-usage',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-infobars',
            '--window-position=0,0',
            '--disable-features=VizDisplayCompositor',
            '--disable-default-apps',
            '--no-first-run',
            '--disable-domain-reliability',
          ],
        },
      },
    },
    // Opt-in module projects (`--project=encore-locations` etc.). Both depend on
    // `setup` so auth.setup.ts writes .auth/encore-state.json once, read-only after.
    {
      name: 'encore-local-office',
      testDir: './tests/local-office',
      testIgnore: ignoring(),
      fullyParallel: false,
      dependencies: ['setup'],
      use: { storageState: '.auth/encore-state.json' },
    },
    {
      name: 'encore-locations',
      testDir: './tests/locations',
      testIgnore: ignoring(),
      fullyParallel: false,
      dependencies: ['setup'],
      use: { storageState: '.auth/encore-state.json' },
    },
    // SDET bug-discovery crawler. Two projects, because the two halves have opposite needs.
    //
    // `crawler-checks` is the crawler's OWN test suite — pure logic plus a route-served fixture
    // page. No auth, no application, no `setup` dependency, so it runs anywhere in seconds and
    // can gate a change to the crawler.
    {
      name: 'crawler-checks',
      testDir: './tests/crawler',
      testMatch: ['**/crawler-unit.spec.ts', '**/crawler-fixture.spec.ts'],
      fullyParallel: false,
      retries: 0,
      use: { viewport: { width: 1280, height: 800 } },
    },
    // `crawler` is the tool itself, pointed at the live application. Opt-in only — see
    // crawlerRequested() above; `npm run crawl` passes the --project that turns it on.
    ...(crawlerRequested()
      ? [
          {
            name: 'crawler',
            testDir: './tests/crawler',
            testMatch: ['**/exploratory-crawl.spec.ts'],
            fullyParallel: false,
            retries: 0,
            dependencies: ['setup'],
            use: { storageState: '.auth/encore-state.json' },
          },
        ]
      : []),
  ],

  outputDir: `reports/test-results${REPORT_SUFFIX}/`,
  // Snapshots are inputs, not per-run output — never suffixed, or the second
  // phase would look for baselines in a directory that does not exist.
  snapshotDir: 'reports/test-results/snapshots',

  globalSetup: require.resolve('./src/setup/global-setup'),
});
