/**
 * Flaky Test Analyzer — runs the chosen tests N times under identical conditions and reports which ones are not
 * deterministic, with each test's pass/fail history.
 *
 * Same safeguards as scripts/find-flakes.mjs (which it neither calls nor changes):
 *   --repeat-each=N --retries=0 --workers=1   retries would turn flakes into passes; one worker removes contention
 *   TESTRAIL_ENABLED=false                    diagnosis, not a result to record against the release
 *   --reporter=json (to its own file)         replaces the configured reporters for this run, so neither
 *                                             reports/test-results.json, failure-summary.json nor TestRail is written
 *   --output <toolkit dir>                    Playwright empties its output folder first — the last run's
 *                                             screenshots and traces in reports/test-results stay untouched
 * It refuses to run without --path or --grep, so the whole suite is never repeated against shared data by accident.
 *
 * Findings: flaky (High) passes and fails across runs · always-fails (Medium) fails every run — a real failure, not a
 * flake · unstable-duration (Low) slowest run ≥ 3× the fastest and ≥ 10 s.
 */
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type { Finding, ToolkitOptions, Utility, UtilityResult } from '../core/types';

const UTILITY = 'flaky';
const CLI = 'node_modules/@playwright/test/cli.js';

export interface RunRecord { status: string; duration: number; error?: string }
export interface TestHistory { key: string; title: string; file: string; project: string; runs: RunRecord[]; knownFailure: boolean }

interface PwResult { status: string; duration: number; error?: { message?: string } }
interface PwTest { projectName: string; status: string; annotations?: { type: string }[]; results: PwResult[] }
interface PwSpec { title: string; file: string; tests: PwTest[] }
interface PwSuite { specs?: PwSpec[]; suites?: PwSuite[] }

const strip = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, '');

/** Groups every run of every test (repeats appear as separate specs with the same title, in run order). */
export function collectHistory(report: { suites: PwSuite[] }): TestHistory[] {
  const byKey = new Map<string, TestHistory>();
  const walk = (s: PwSuite): void => {
    for (const sp of s.specs ?? []) {
      for (const t of sp.tests) {
        if (t.projectName === 'setup') continue;
        const key = `${sp.file}|${t.projectName}|${sp.title}`;
        const h = byKey.get(key) ?? { key, title: sp.title, file: sp.file.split(path.sep).join('/'), project: t.projectName, runs: [],
          knownFailure: !!t.annotations?.some((a) => a.type === 'fail') };
        const last = t.results[t.results.length - 1];
        if (last) {
          // A test.fail test that fails is a "pass" for stability purposes: it behaved as declared.
          const ok = t.status === 'expected' || t.status === 'skipped';
          h.runs.push({ status: last.status === 'skipped' ? 'skipped' : ok ? 'passed' : last.status, duration: last.duration,
            ...(last.error?.message ? { error: strip(last.error.message).split('\n')[0]!.slice(0, 200) } : {}) });
        }
        byKey.set(key, h);
      }
    }
    for (const child of s.suites ?? []) walk(child);
  };
  report.suites.forEach(walk);
  return [...byKey.values()];
}

export function judge(histories: TestHistory[]): Finding[] {
  const findings: Finding[] = [];
  for (const h of histories) {
    const runs = h.runs.filter((r) => r.status !== 'skipped');
    if (!runs.length) continue;
    const passed = runs.filter((r) => r.status === 'passed').length;
    const failed = runs.length - passed;
    const history = runs.map((r) => (r.status === 'passed' ? '✓' : '✗')).join(' ');
    const base = { utility: UTILITY, file: h.file, line: 0, test: h.title };
    if (passed && failed) {
      const errors = [...new Set(runs.filter((r) => r.error).map((r) => r.error!))].slice(0, 2);
      findings.push({ ...base, rule: 'flaky', severity: 'High',
        message: `Passed ${passed} of ${runs.length} runs (${history})${h.knownFailure ? ' — a test.fail test that sometimes passes' : ''}.${errors.length ? ` Failure: ${errors.join(' | ')}` : ''}`,
        recommendation: 'Find what differs between runs: wait for the state the step needs (web-first expect, waitForResponse), isolate shared data, or fix the race in the app. Then re-run this analyzer to confirm.' });
    } else if (failed === runs.length) {
      findings.push({ ...base, rule: 'always-fails', severity: 'Medium',
        message: `Failed all ${runs.length} runs (${history}): ${runs[0]!.error ?? 'see the run report'} — consistent, so not a flake.`,
        recommendation: 'Treat it as a real failure: classify it with cli.ts bugs, fix the test or file the bug and mark it test.fail.' });
    }
    const durations = runs.map((r) => r.duration);
    const max = Math.max(...durations), min = Math.min(...durations);
    if (runs.length > 1 && max >= 10_000 && max >= 3 * Math.max(min, 1)) {
      findings.push({ ...base, rule: 'unstable-duration', severity: 'Low',
        message: `Run time varies from ${(min / 1000).toFixed(1)} s to ${(max / 1000).toFixed(1)} s.`,
        recommendation: 'A large spread usually means waiting on something variable (fixed waits, slow responses); it is where flakes start.' });
    }
  }
  return findings;
}

export function playwrightArgs(options: ToolkitOptions, jsonDir: string, list = false): string[] {
  return [
    path.join(options.root, CLI), 'test', ...options.paths,
    `--project=${options.project ?? 'chromium'}`,
    ...(options.grep ? [`--grep=${options.grep}`] : []),
    `--repeat-each=${options.repeat ?? 3}`, '--retries=0', '--workers=1',
    '--reporter=json', `--output=${path.join(jsonDir, 'output')}`,
    ...(list ? ['--list'] : []),
  ];
}

export const flakyAnalyzer: Utility = {
  name: 'flaky',
  title: 'Flaky Test Analyzer',
  summary: 'Runs the chosen tests N times (retries off, one worker, TestRail off) and reports inconsistent results with pass/fail history.',
  async run(options: ToolkitOptions): Promise<UtilityResult> {
    const startedAt = new Date().toISOString();
    if (!options.paths.length && !options.grep) {
      throw new Error('flaky needs --path <spec or folder> and/or --grep <pattern>: it runs tests, and repeating the whole suite against shared e2e data is never what you want.');
    }
    const dir = path.join(options.root, options.outDir, UTILITY);
    const jsonFile = path.join(dir, 'runs.json');
    const repeat = options.repeat ?? 3;
    const env = { ...process.env, TESTRAIL_ENABLED: 'false', PLAYWRIGHT_JSON_OUTPUT_NAME: jsonFile };
    const notes = [`Scope: ${options.paths.join(', ') || 'all specs'}${options.grep ? ` matching ${options.grep}` : ''}; ${repeat} runs each, retries 0, 1 worker, project ${options.project ?? 'chromium'}, TestRail off.`];

    if (options.dryRun) {
      const listed = spawnSync(process.execPath, playwrightArgs(options, dir, true), { cwd: options.root, env: { ...env, PLAYWRIGHT_JSON_OUTPUT_NAME: '' }, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      let tests = 0;
      try { tests = collectHistory(JSON.parse(listed.stdout) as { suites: PwSuite[] }).length; } catch { notes.push(`Could not list tests: ${(listed.stderr || '').split('\n')[0]}`); }
      notes.push(`Dry run: would run ${tests} test(s) × ${repeat} = ${tests * repeat} executions with: node ${playwrightArgs(options, dir).map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ')}`);
      return { utility: UTILITY, title: this.title, startedAt, finishedAt: new Date().toISOString(), dryRun: true, scanned: { tests }, findings: [], notes };
    }

    fs.mkdirSync(dir, { recursive: true });
    fs.rmSync(jsonFile, { force: true });
    const run = spawnSync(process.execPath, playwrightArgs(options, dir), { cwd: options.root, env, encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
    if (!fs.existsSync(jsonFile)) throw new Error(`Playwright produced no results (exit ${run.status}): ${(run.stderr || '').split('\n').slice(0, 3).join(' ')}`);
    const histories = collectHistory(JSON.parse(fs.readFileSync(jsonFile, 'utf8')) as { suites: PwSuite[] });
    const findings = judge(histories);
    const flaky = findings.filter((f) => f.rule === 'flaky').length;
    notes.push(`Raw Playwright results: ${path.relative(options.root, jsonFile).split(path.sep).join('/')}`);
    return {
      utility: UTILITY, title: this.title, startedAt, finishedAt: new Date().toISOString(), dryRun: false,
      scanned: { tests: histories.length, executions: histories.reduce((n, h) => n + h.runs.length, 0), flaky, stable: histories.length - new Set(findings.filter((f) => f.rule !== 'unstable-duration').map((f) => f.test)).size },
      findings, notes,
      table: {
        title: 'Pass/fail history',
        columns: ['Test', 'Project', 'History', 'Passed', 'Durations (s)'],
        rows: histories.map((h) => [h.title, h.project, h.runs.map((r) => (r.status === 'passed' ? '✓' : r.status === 'skipped' ? '–' : '✗')).join(' '),
          `${h.runs.filter((r) => r.status === 'passed').length}/${h.runs.length}`, h.runs.map((r) => (r.duration / 1000).toFixed(1)).join(', ')]),
      },
    };
  },
};

export default flakyAnalyzer;
