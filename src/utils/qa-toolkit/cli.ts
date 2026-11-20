/**
 * QA Quality and Validation Toolkit — command-line entry.
 *
 *   npx ts-node src/utils/qa-toolkit/cli.ts <utility> [options]
 *   npx ts-node src/utils/qa-toolkit/cli.ts all [--module <name>] [--with-flaky]
 *   npx ts-node src/utils/qa-toolkit/cli.ts --help
 *
 * Options:
 *   --dry-run            show what would be analysed or run; write and execute nothing
 *   --module <name>      limit every utility to that module's folders (tests/<m>, src/pages/<m>, testcases/<m>…)
 *   --path <p>           file or directory to analyse (repeatable); default = the utility's own scope
 *   --with-flaky         all: also run the flaky analyzer (it executes tests; needs --module or --grep)
 *   --out <dir>          report root (default reports/qa-toolkit)
 *   --fail-on <sev>      exit 1 when a finding at or above Critical|High|Medium|Low exists (for CI gates)
 *   --live --url <page>  locators: also count each selector's matches on that page (read-only navigation)
 *   --grep <re> --repeat <n> --project <p>   flaky: which tests, how many runs (default 3), which project (chromium)
 *
 * Reports: <out>/<utility>/report.json and report.html. Nothing outside the report root is written.
 */
import * as fs from 'fs';
import * as path from 'path';
import { writeReport, writeSummary } from './core/report';
import { countBySeverity, isSeverity, reachesThreshold, SEVERITIES } from './core/severity';
import type { Severity, ToolkitOptions, Utility, UtilityResult } from './core/types';
import assertionValidator from './assertions/assertion-validator';
import bugDetector from './bugs/bug-detector';
import coverageAnalyzer from './coverage/coverage-analyzer';
import duplicateDetector from './duplicates/duplicate-detector';
import flakyAnalyzer from './flaky/flaky-analyzer';
import locatorValidator from './locators/locator-validator';
import scriptQuality from './script-quality/script-quality-analyzer';
import selfTest from './self-test/self-test';

const UTILITIES: Utility[] = [coverageAnalyzer, scriptQuality, assertionValidator, locatorValidator, duplicateDetector, flakyAnalyzer, bugDetector, selfTest];

/** What `all` runs. The flaky analyzer executes tests, so it joins only with --with-flaky. */
const STATIC_SUITE = [coverageAnalyzer, scriptQuality, assertionValidator, locatorValidator, duplicateDetector, bugDetector];

const ROOT = path.resolve(__dirname, '..', '..', '..');

/** --module <name>: each utility's own folders for that module (only those that exist). */
function moduleScope(utility: string, module: string): string[] {
  const scope: Record<string, string[]> = {
    coverage: [`testcases/${module}`],
    quality: [`tests/${module}`, `src/pages/${module}`],
    assertions: [`tests/${module}`],
    locators: [`tests/${module}`, `src/pages/${module}`, `src/selectors/${module}`],
    duplicates: [`tests/${module}`, `testcases/${module}`],
    flaky: [`tests/${module}`],
  };
  return (scope[utility] ?? []).filter((p) => fs.existsSync(path.join(ROOT, p)));
}

function log(message: string): void {
  console.log(`${new Date().toISOString().replace('T', ' ').slice(0, 19)} [qa-toolkit] ${message}`);
}

interface Parsed { utility?: string; options: ToolkitOptions; failOn?: Severity; help: boolean; module?: string; withFlaky: boolean }

function parseArgs(argv: string[]): Parsed {
  const options: ToolkitOptions = { root: ROOT, dryRun: false, paths: [], outDir: 'reports/qa-toolkit' };
  let utility: string | undefined;
  let failOn: Severity | undefined;
  let module: string | undefined;
  let withFlaky = false;
  let help = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const value = (): string => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === '--dry-run') options.dryRun = true;
    else if (a === '--path') options.paths.push(value());
    else if (a === '--out') options.outDir = value();
    else if (a === '--live') options.live = true;
    else if (a === '--url') options.url = value();
    else if (a === '--grep') options.grep = value();
    else if (a === '--project') options.project = value();
    else if (a === '--repeat') {
      const n = Number(value());
      if (!Number.isInteger(n) || n < 2 || n > 50) throw new Error('--repeat must be a whole number from 2 to 50');
      options.repeat = n;
    }
    else if (a === '--fail-on') {
      const v = value();
      if (!isSeverity(v)) throw new Error(`--fail-on must be one of ${SEVERITIES.join(', ')}`);
      failOn = v;
    } else if (a === '--module') module = value().replace(/^\/+|\/+$/g, '');
    else if (a === '--with-flaky') withFlaky = true;
    else if (a === '--help' || a === '-h') help = true;
    else if (!a.startsWith('-') && !utility) utility = a;
    else throw new Error(`Unknown option: ${a}`);
  }
  return { ...(utility ? { utility } : {}), options, ...(failOn ? { failOn } : {}), help, ...(module ? { module } : {}), withFlaky };
}

function usage(): void {
  console.log('Usage: npx ts-node src/utils/qa-toolkit/cli.ts <utility|all> [--module <name>] [--path <p>]… [--dry-run] [--fail-on <severity>]\n');
  console.log('Utilities:');
  for (const u of UTILITIES) console.log(`  ${u.name.padEnd(12)} ${u.title} — ${u.summary}`);
  console.log(`  ${'all'.padEnd(12)} Runs ${STATIC_SUITE.map((u) => u.name).join(', ')} (+ flaky with --with-flaky) and writes summary.html`);
}

/** Runs one utility, prints its outcome and writes its report. */
async function runOne(u: Utility, options: ToolkitOptions): Promise<UtilityResult> {
  log(`${u.title}${options.dryRun ? ' (dry run)' : ''}`);
  const result = await u.run(options);
  for (const note of result.notes) log(note);
  if (options.dryRun) { log('Dry run: no report written.'); return result; }
  const counts = countBySeverity(result.findings);
  const { json, html } = writeReport(options.root, options.outDir, result);
  log(`Scanned ${Object.entries(result.scanned).map(([k, v]) => `${v} ${k}`).join(', ')}`);
  log(`Findings: ${result.findings.length} (${SEVERITIES.map((s) => `${s} ${counts[s]}`).join(', ')})`);
  log(`Report: ${path.relative(ROOT, html)} | ${path.relative(ROOT, json)}`);
  return result;
}

async function main(): Promise<number> {
  const { utility, options, failOn, help, module, withFlaky } = parseArgs(process.argv.slice(2));
  if (help || !utility) { usage(); return help ? 0 : 1; }
  const scoped = (u: Utility): ToolkitOptions =>
    (module && !options.paths.length ? { ...options, paths: moduleScope(u.name, module) } : options);

  if (utility === 'all') {
    if (options.paths.length) throw new Error('all takes --module <name> (each utility uses its own folders for it), not --path.');
    const suite = withFlaky ? [...STATIC_SUITE.slice(0, -1), flakyAnalyzer, STATIC_SUITE[STATIC_SUITE.length - 1]!] : STATIC_SUITE;
    if (withFlaky && !module && !options.grep) throw new Error('--with-flaky needs --module or --grep, so only chosen tests are repeated.');
    const startedAt = new Date().toISOString();
    const results: UtilityResult[] = [];
    for (const u of suite) results.push(await runOne(u, scoped(u)));
    if (options.dryRun) { log('Dry run: no summary written.'); return 0; }
    const { html } = writeSummary(options.root, options.outDir, results, startedAt);
    const all = results.flatMap((r) => r.findings);
    const counts = countBySeverity(all);
    log(`All utilities: ${all.length} findings (${SEVERITIES.map((s) => `${s} ${counts[s]}`).join(', ')})${withFlaky ? '' : ' — flaky not run (it executes tests; add --with-flaky)'}`);
    log(`Summary: ${path.relative(ROOT, html)}`);
    return failOn && reachesThreshold(all, failOn) ? 1 : 0;
  }

  const selected = UTILITIES.find((u) => u.name === utility);
  if (!selected) { console.error(`Unknown utility "${utility}".`); usage(); return 1; }
  const result = await runOne(selected, scoped(selected));
  return !options.dryRun && failOn && reachesThreshold(result.findings, failOn) ? 1 : 0;
}

main().then((code) => { process.exitCode = code; }, (error: unknown) => {
  console.error(`[qa-toolkit] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
