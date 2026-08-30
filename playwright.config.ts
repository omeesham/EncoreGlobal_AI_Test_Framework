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

export default defineConfig({
  // testDir is scoped to `tests/`, NOT the repo root. A relative testMatch is matched
  // as `**/<pattern>`, so a root testDir + 'tests/**/*.spec.ts' also matches
  // `.claude/worktrees/*/tests/**` and collects every git worktree's specs (and reruns
  // auth.setup.ts once per worktree). Scoping testDir puts those paths outside the
  // search entirely, which a per-project testIgnore cannot undo.
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
  // Default workers: 1 everywhere (unresolved multi-worker conflict on shared Encore app state). Override with `MAX_WORKERS=N` env if needed.
  workers: parseMaxWorkers(process.env.MAX_WORKERS) ?? 1,

  preserveOutput: 'always',

  reporter: [
    ['list'],
    // Local reporter — kept under the client tree so it ships inside the client bundle.
    ['./src/reporter/agent-reporter.ts'],
    ['html', { outputFolder: 'reports/html-report', open: 'never' }],
    ['json', { outputFile: 'reports/test-results.json' }],
    ['junit', { outputFile: 'reports/junit-results.xml' }],
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
      testIgnore: ['tests/locations/**', 'tests/local-office/**'],
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
      fullyParallel: false,
      dependencies: ['setup'],
      use: { storageState: '.auth/encore-state.json' },
    },
    {
      name: 'encore-locations',
      testDir: './tests/locations',
      fullyParallel: false,
      dependencies: ['setup'],
      use: { storageState: '.auth/encore-state.json' },
    },
  ],

  outputDir: 'reports/test-results/',
  snapshotDir: 'reports/test-results/snapshots',

  globalSetup: require.resolve('./src/setup/global-setup'),
});
