/**
 * Full MFE regression — three Playwright invocations, ONE TestRail run.
 *
 * Playwright's worker count is per-invocation, not per-project, so a run that
 * needs three different worker counts has to be three invocations:
 *
 *   Phase 1 "parallel"  — every module EXCEPT tests/locations, at
 *                         --workers=9 (override with WORKERS / --workers=N).
 *                         fullyParallel stays false, so spec files spread
 *                         across the workers while the tests inside one file
 *                         still run in order: the "1 spec = 1 worker" rule in
 *                         playwright.config.ts is untouched.
 *   Phase 2 "heavy"     — specs proven to fail only under load, at --workers=3.
 *                         See HEAVY_SPECS below for the evidence and the rule
 *                         for adding to it. --no-heavy-phase folds them back
 *                         into phase 1.
 *   Phase 3 "locations" — tests/locations only, --workers=1, strictly
 *                         sequential. That module shares location records
 *                         across its specs and cannot be raced against itself.
 *
 * Later phases run even when an earlier one fails — a broken module must not hide
 * the state of the rest. The script exits non-zero if any phase did.
 *
 * Because every phase pushes through src/utils/testrail-run.ts, they land in the
 * SAME TestRail run: phase 1 opens it, the later phases widen it. The run's case
 * count is the total across all of them.
 *
 * Reports are kept apart by REPORT_SUFFIX (see playwright.config.ts):
 *   phase 1 -> reports/html-report,           reports/test-results.json,           …
 *   phase 2 -> reports/html-report-heavy,     reports/test-results-heavy.json,     …
 *   phase 3 -> reports/html-report-locations, reports/test-results-locations.json, …
 * Allure is deliberately NOT suffixed — every phase appends to
 * reports/allure-results, so `npm run allure:report` shows one merged report.
 *
 * Usage:
 *   npm run test:regression                 # all three phases
 *   npm run test:regression -- --workers=8  # parallel phase at 8 workers
 *   npm run test:regression -- --only=parallel
 *   npm run test:regression -- --only=heavy
 *   npm run test:regression -- --only=locations
 *   npm run test:regression -- --no-heavy-phase   # everything except locations at 8-9
 *   npm run test:regression -- --dry-run    # print the commands, run nothing
 */

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Playwright's CLI entry, invoked with this same node binary rather than
// `npx playwright` under shell:true — on Windows the shell re-parses argv and
// would break any passthrough arg containing |, (), ^ or $, such as a --grep
// alternation. See the same note in scripts/find-flakes.mjs.
const PLAYWRIGHT_CLI = createRequire(import.meta.url).resolve('@playwright/test/cli');

const DEFAULT_PARALLEL_WORKERS = 9;

// Heavy specs get their own low-concurrency phase. Evidence for the default
// membership, from the 2026-09-22 regression (TestRail run 2218): at 9 workers
// corporate-pricing-detail lost 8 tests, 6 of them to `Test timeout of 150000ms
// exceeded`; re-driven alone at --workers=1 all 59 passed. Its own header says a
// single page-open of the ~2430-row grid costs 15-25s unloaded and "a save cycle
// stacks several", so nine concurrent sessions blow a budget that is correct when
// the app is not under load. Raising the timeout would only make the same
// contention fail more slowly, so we cap concurrency instead — the same reasoning
// that already gives tests/locations a worker to itself.
//
// Membership is by measured failure, not by guesswork: add a spec here only after
// it has been shown to pass in isolation and fail in the pack. The itemsearch
// specs carry an even larger 300s budget but came through run 2218 clean, so they
// stay in the fast phase until evidence says otherwise.
const DEFAULT_HEAVY_WORKERS = 3;
const HEAVY_SPECS = ['tests/corporate-pricing/corporate-pricing-detail.spec.ts'];

// Everything phase 1 covers. `chromium` already testIgnores locations,
// local-office and crawler; local-office has its own project, so naming both
// here is exactly "the whole suite except locations", with no crawler.
const PARALLEL_PROJECTS = ['chromium', 'encore-local-office'];
const SEQUENTIAL_PROJECT = 'encore-locations';

function parseArgs(argv) {
  const opts = {
    workers: DEFAULT_PARALLEL_WORKERS,
    heavyWorkers: DEFAULT_HEAVY_WORKERS,
    only: null,
    dryRun: false,
    noHeavyPhase: false,
    passthrough: [],
  };
  for (const arg of argv) {
    let m;
    if ((m = /^--workers=(\d+)$/.exec(arg))) opts.workers = Number(m[1]);
    else if ((m = /^--heavy-workers=(\d+)$/.exec(arg))) opts.heavyWorkers = Number(m[1]);
    else if ((m = /^--only=(parallel|heavy|locations)$/.exec(arg))) opts.only = m[1];
    else if (arg === '--dry-run') opts.dryRun = true;
    // Escape hatch: fold the heavy specs back into the fast phase.
    else if (arg === '--no-heavy-phase') opts.noHeavyPhase = true;
    else opts.passthrough.push(arg);
  }
  if (process.env.WORKERS && !argv.some((a) => a.startsWith('--workers='))) {
    opts.workers = Number(process.env.WORKERS);
  }
  for (const [flag, value] of [['--workers', opts.workers], ['--heavy-workers', opts.heavyWorkers]]) {
    if (!Number.isInteger(value) || value < 1) {
      console.error(`[regression] ${flag} must be a positive integer, got "${value}"`);
      process.exit(2);
    }
  }
  return opts;
}

function runPhase({ label, args, reportSuffix, exclude, dryRun }) {
  const cmd = [PLAYWRIGHT_CLI, 'test', ...args];
  console.log(`\n${'='.repeat(78)}\n[regression] phase: ${label}\n[regression] ${cmd.join(' ')}\n${'='.repeat(78)}\n`);
  if (dryRun) return 0;
  const res = spawnSync(process.execPath, cmd, {
    cwd: ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      // Unset for phase 1 so its report paths stay the familiar ones.
      ...(reportSuffix ? { REPORT_SUFFIX: reportSuffix } : {}),
      ...(exclude?.length ? { REGRESSION_EXCLUDE: exclude.join(',') } : {}),
    },
  });
  if (res.error) {
    console.error(`[regression] ${label} could not start: ${res.error.message}`);
    return 1;
  }
  return res.status ?? 1;
}

const opts = parseArgs(process.argv.slice(2));
const results = [];

const heavyPhaseActive = !opts.noHeavyPhase && HEAVY_SPECS.length > 0;

if (opts.only === null || opts.only === 'parallel') {
  // Playwright's CLI has no --ignore, so the subtraction happens in
  // playwright.config.ts via REGRESSION_EXCLUDE (see runPhase). Without the heavy
  // phase nothing is subtracted, which is the pre-2026-09-22 behaviour.
  const label = `parallel — all modules except locations${heavyPhaseActive ? ' and heavy specs' : ''} (${opts.workers} workers)`;
  results.push({
    label,
    code: runPhase({
      label,
      args: [
        ...PARALLEL_PROJECTS.flatMap((p) => ['--project', p]),
        `--workers=${opts.workers}`,
        ...opts.passthrough,
      ],
      exclude: heavyPhaseActive ? HEAVY_SPECS : [],
      reportSuffix: null,
      dryRun: opts.dryRun,
    }),
  });
}

if (heavyPhaseActive && (opts.only === null || opts.only === 'heavy')) {
  const label = `heavy specs — low concurrency (${opts.heavyWorkers} workers)`;
  results.push({
    label,
    code: runPhase({
      label,
      args: [...HEAVY_SPECS, `--workers=${opts.heavyWorkers}`, ...opts.passthrough],
      reportSuffix: 'heavy',
      dryRun: opts.dryRun,
    }),
  });
}

if (opts.only === null || opts.only === 'locations') {
  results.push({
    label: 'locations — sequential (1 worker)',
    code: runPhase({
      label: 'locations — sequential (1 worker)',
      args: ['--project', SEQUENTIAL_PROJECT, '--workers=1', ...opts.passthrough],
      reportSuffix: 'locations',
      dryRun: opts.dryRun,
    }),
  });
}

console.log(`\n${'='.repeat(78)}\n[regression] summary`);
for (const r of results) console.log(`  ${r.code === 0 ? 'PASS' : `FAIL (exit ${r.code})`}  ${r.label}`);
console.log('='.repeat(78));

process.exit(results.some((r) => r.code !== 0) ? 1 : 0);
