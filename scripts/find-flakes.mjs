/**
 * Flake detector — run the same tests N times under identical conditions and
 * report which ones are not deterministic.
 *
 * A single re-run cannot tell a flaky test from a fixed one: the 2026-09-22
 * triage found TC-TNC-CORE-009/050 passing on a re-run while three OTHER tests
 * in the same file newly failed, which a one-shot re-run would have read as
 * "fixed". Repetition is the only thing that distinguishes them.
 *
 * What it forces, and why each matters:
 *   --repeat-each=N    the actual measurement; default 3
 *   --retries=0        playwright.config.ts retries locally, which HIDES flakes
 *                      by turning them into "flaky" passes. Zero makes every
 *                      non-determinism visible as a failure.
 *   --workers=1        removes contention, so anything left is the test itself
 *                      rather than the load around it
 *   --fail-on-flaky-tests  a non-zero exit when anything is unstable, so this
 *                      is usable as a gate and not just a report
 *
 * Reports go to the `-flake` suffix (reports/html-report-flake, …) so a
 * detection run never overwrites a regression's artifacts, and TestRail is
 * OFF — this is diagnosis, not a result worth recording against the release.
 *
 * Usage (from the repo root):
 *   npm run test:flake -- <spec paths and/or playwright args>
 *
 *   # the terms-conditions churn set — the six tests that moved between runs
 *   npm run test:flake -- tests/terms-conditions/terms-conditions.spec.ts \
 *     --grep "TC-TNC-CORE-(009|014|047|050|073|081):"
 *
 *   # confirm the two single-observation contention verdicts
 *   npm run test:flake -- tests/corporate-pg-pricing-override/corporate-pg-pricing-override-import.spec.ts \
 *     tests/itemsearch_products/item-search-products-PG-search-for-product-groups.spec.ts \
 *     --grep "(TC-CPR-OVR-155|TC-ISR-PGR-016):"
 *
 *   # a whole spec, ten times, to characterise a file rather than a test
 *   npm run test:flake -- tests/terms-conditions/terms-conditions.spec.ts --repeat=10
 *
 * Options consumed here (everything else is passed through to Playwright):
 *   --repeat=N     repetitions, default 3
 *   --workers=N    override the forced 1 (use only to reproduce a load effect)
 *   --testrail     push results anyway, into their own flake-detection run
 *   --dry-run      print the command without running it
 *
 * Reading the result: PASS means every repetition of every selected test
 * passed — deterministic under no load. Any failure means either a real defect
 * or a genuinely flaky test; the per-repetition pattern in the output tells you
 * which (all N failed -> real; some failed -> flaky).
 */

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Playwright's CLI entry, invoked with this same node binary.
//
// NOT `npx playwright` via shell:true. On Windows shell:true hands the argv to
// cmd.exe, which RE-PARSES it and treats the `|` inside a --grep alternation
// ("TC-TNC-CORE-(009|014):") as a pipe — the run dies with "'014' is not
// recognized as an internal or external command". Spawning node directly passes
// argv through untouched, so grep patterns with |, (), ^ and $ all survive.
const PLAYWRIGHT_CLI = createRequire(import.meta.url).resolve('@playwright/test/cli');

const DEFAULT_REPEAT = 3;

function parseArgs(argv) {
  const opts = { repeat: DEFAULT_REPEAT, workers: 1, testrail: false, dryRun: false, passthrough: [] };
  for (const arg of argv) {
    let m;
    if ((m = /^--repeat(?:-each)?=(\d+)$/.exec(arg))) opts.repeat = Number(m[1]);
    else if ((m = /^--workers=(\d+)$/.exec(arg))) opts.workers = Number(m[1]);
    else if (arg === '--testrail') opts.testrail = true;
    else if (arg === '--dry-run') opts.dryRun = true;
    else opts.passthrough.push(arg);
  }
  for (const [flag, value] of [['--repeat', opts.repeat], ['--workers', opts.workers]]) {
    if (!Number.isInteger(value) || value < 1) {
      console.error(`[flake] ${flag} must be a positive integer, got "${value}"`);
      process.exit(2);
    }
  }
  if (opts.repeat < 2) {
    console.error('[flake] --repeat must be at least 2 — one run cannot detect non-determinism.');
    process.exit(2);
  }
  if (opts.passthrough.length === 0) {
    console.error(
      '[flake] name at least one spec path or filter.\n' +
        '        e.g. npm run test:flake -- tests/terms-conditions/terms-conditions.spec.ts',
    );
    process.exit(2);
  }
  return opts;
}

const opts = parseArgs(process.argv.slice(2));

const args = [
  PLAYWRIGHT_CLI,
  'test',
  ...opts.passthrough,
  `--repeat-each=${opts.repeat}`,
  '--retries=0',
  `--workers=${opts.workers}`,
  '--fail-on-flaky-tests',
];

console.log(`\n${'='.repeat(78)}`);
console.log(`[flake] each selected test runs ${opts.repeat}x at ${opts.workers} worker(s), retries off`);
console.log(`[flake] playwright test ${args.slice(1).join(' ')}`);
console.log(`[flake] reports -> reports/html-report-flake · TestRail ${opts.testrail ? 'ON' : 'OFF'}`);
console.log(`${'='.repeat(78)}\n`);

if (opts.dryRun) process.exit(0);

const res = spawnSync(process.execPath, args, {
  cwd: ROOT,
  stdio: 'inherit',
  env: {
    ...process.env,
    REPORT_SUFFIX: 'flake',
    ...(opts.testrail
      ? { TESTRAIL_RUN_KEY: `flake-${new Date().toISOString().slice(0, 10)}`, TESTRAIL_RUN_ENV: 'local-flake' }
      : { TESTRAIL_ENABLED: 'false' }),
  },
});

const code = res.error ? 1 : (res.status ?? 1);
if (res.error) console.error(`[flake] could not start: ${res.error.message}`);
console.log(
  `\n[flake] ${code === 0 ? 'STABLE — every repetition passed' : 'UNSTABLE — see the failures above; all-N failed = real defect, some-N failed = flaky'}`,
);
process.exit(code);
