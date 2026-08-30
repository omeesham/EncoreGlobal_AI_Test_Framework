#!/usr/bin/env node
// Unlike test:cli, this wipes the Allure trend stash too, so both reports show one fresh run.
// No --project is passed: Playwright routes each spec to its own project, avoiding double-runs.
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const RESULTS_DIR = path.join('reports', 'allure-results');
const STASH_DIR = path.join('reports', '.allure-history-stash');

const passthrough = process.argv.slice(2);

if (passthrough.length === 0) {
  console.error('[clean:run] ERROR: name a spec (or --grep) to run, e.g.');
  console.error('  npm run clean:run -- tests/locations/location-auto-addon.spec.ts');
  process.exit(1);
}

function run(cmd) {
  execSync(cmd, { stdio: 'inherit' });
}

// 1. Full wipe, no history kept. `npm run clean` covers every report dir/file;
//    the stash is the one thing it leaves behind (test:cli's trend cache).
run('npm run clean');
fs.rmSync(STASH_DIR, { recursive: true, force: true });

// 2. Targeted run. Each arg is quoted so spec paths / grep strings with spaces
//    survive the shell. Test failures are expected data — capture, don't abort.
const args = passthrough.map((a) => JSON.stringify(a)).join(' ');
let testExit = 0;
try {
  run(`npx playwright test --config=playwright.config.ts ${args}`);
} catch (err) {
  testExit = err.status || 1;
}

// 3. Fresh Allure, but only if results exist — an empty allure-results (auth failed, zero tests)
//    must warn rather than silently emit a blank report.
const producedResults =
  fs.existsSync(RESULTS_DIR) &&
  fs.readdirSync(RESULTS_DIR).some((f) => f.endsWith('-result.json'));

if (!producedResults) {
  console.error('\n[clean:run] WARNING: no Allure results were produced — the run');
  console.error('  executed zero tests (check auth / the spec path above). Skipping');
  console.error('  report generation so no empty/stale report is emitted.');
  process.exit(testExit || 1);
}

run('npx allure generate reports/allure-results --clean -o reports/allure-report');

console.log(`\n[clean:run] done (test exit ${testExit}). Open the clean reports with:`);
console.log('  npm run report        # Playwright HTML');
console.log('  npm run allure:open   # Allure');
process.exit(testExit);
