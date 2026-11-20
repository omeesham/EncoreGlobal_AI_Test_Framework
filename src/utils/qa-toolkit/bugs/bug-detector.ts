/**
 * Bug Detection Utility — classifies the failures of the last run and drafts bug reports for the ones that look like
 * application defects. It reads what the framework already records; it adds no capture to test execution.
 *
 *   reports/test-results.json   Playwright JSON: status, retries, error, test.fail('BUG-…') annotations, attachments
 *   reports/failure-summary.json agent-reporter diagnostics: console errors, failed requests, page errors, last steps
 *
 * Diagnostics are collected per browser session, so only entries inside a test's own time window count as its evidence.
 *
 * Classes (and finding severity):
 *   application      High / Medium  an assertion failed with an expected and an actual value; High when a 5xx, page
 *                                   error or error text sits in the test's window. A draft bug report is written.
 *   known-defect     Low            the test is marked test.fail('BUG-…') and failed as expected
 *   possibly-fixed   Medium         marked test.fail('BUG-…') but passed — the bug may be fixed
 *   environment      Medium         sign-in redirect, DNS / connection errors, 502/503/504, browser crash
 *   synchronization  Medium         passed on retry, or element not stable / detached / covered
 *   automation       Medium         strict-mode violation, invalid selector, error thrown by test or page-object code,
 *                                   a locator timeout with no application evidence
 *   test-data        Low            missing precondition data
 *   needs-triage     Medium         none of the above — never assumed to be an application bug
 */
import * as fs from 'fs';
import * as path from 'path';
import * as dotenvFlow from 'dotenv-flow';
import type { Finding, Severity, ToolkitOptions, Utility, UtilityResult } from '../core/types';

const UTILITY = 'bug-detection';
const RESULTS = 'reports/test-results.json';
const SUMMARY = 'reports/failure-summary.json';

export type FailureClass = 'application' | 'known-defect' | 'possibly-fixed' | 'environment' | 'synchronization' | 'automation' | 'test-data' | 'needs-triage';

export interface Evidence { console: string[]; network: string[]; pageErrors: string[] }

export interface FailureInput {
  title: string;
  file: string;
  /** Final Playwright status of the test: expected | unexpected | flaky. */
  testStatus: string;
  /** Status of the last attempt: passed | failed | timedOut | interrupted. */
  lastStatus: string;
  error: string;
  /** test.fail('…') description, when the test is marked as a known failure. */
  knownBug?: string;
  pageUrl?: string;
  /** Evidence inside the test's own time window. */
  evidence: Evidence;
  /** Evidence outside the window — shown, never used to classify. */
  outsideWindow: number;
  steps: string[];
  screenshot?: string;
  trace?: string;
  reporterCategory?: string;
}

export interface Classification { cls: FailureClass; severity: Severity; confidence: 'High' | 'Medium' | 'Low'; reasons: string[] }

const strip = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, '');

const ENVIRONMENT = /(net::ERR_(NAME_NOT_RESOLVED|CONNECTION_REFUSED|CONNECTION_RESET|INTERNET_DISCONNECTED|TIMED_OUT)|ECONNREFUSED|ENOTFOUND|getaddrinfo|\b50[234]\b.*(Bad Gateway|Service Unavailable|Gateway Time-?out)|Target page, context or browser has been closed|browser has disconnected|Protocol error|storageState|auth(entication)? (expired|failed))/i;
const SYNC = /(element is not stable|element is not attached|detached from the DOM|intercepts pointer events|element is outside of the viewport|element is not visible.*retrying|another element would receive the click)/i;
const AUTOMATION = /(strict mode violation|Unknown engine|is not a valid selector|Unexpected token|SyntaxError|ReferenceError|is not a function|Cannot read propert(y|ies) of (undefined|null)|undefined is not)/i;
const TEST_DATA = /(no (rows|data|records|tiers|results) (found|available|to)|not found in (the )?(grid|list|options)|needs? (two|a|an|at least)\b|precondition|test data|fixture data|already exists|seed)/i;
const LOCATOR_WAIT = /(Timeout \d+ms exceeded|TimeoutError)[\s\S]*waiting for (locator|getBy|selector)/i;
const ERROR_TEXT = /\b(unexpected error|exception|internal server error|something went wrong|failed to)\b/i;

/** Expected / actual values read from a Playwright assertion error. */
export function expectedActual(error: string): { expected?: string; actual?: string } {
  const e = strip(error);
  const exp = e.match(/Expected(?: pattern| string| value| substring)?:\s*(.+)/)?.[1]?.trim();
  const act = e.match(/Received(?: string| value)?:\s*(.+)/)?.[1]?.trim();
  if (exp || act) return { ...(exp ? { expected: exp } : {}), ...(act ? { actual: act } : {}) };
  // toEqual diff: "- Expected - 30 / + Received + 2", then "-   value" / "+   value" lines.
  if (/^- Expected/m.test(e) && /^\+ Received/m.test(e)) {
    const body = e.split(/\r?\n/).slice(e.split(/\r?\n/).findIndex((l) => /^\+ Received/.test(l)) + 1);
    const side = (sign: string): string | undefined => {
      const vals = body.filter((l) => l.startsWith(`${sign} `) || l.startsWith(`${sign}\t`)).map((l) => l.slice(1).trim().replace(/,$/, ''));
      return vals.length ? `${vals.slice(0, 6).join(', ')}${vals.length > 6 ? `, … (${vals.length} values)` : ''}` : undefined;
    };
    const missing = side('-');
    const extra = side('+');
    return {
      expected: missing ? `includes ${missing}` : 'no extra values',
      actual: extra ? `includes ${extra}` : missing ? 'the expected values are missing' : 'differs (see the diff)',
    };
  }
  return {};
}

export function classifyFailure(f: FailureInput): Classification {
  const err = strip(f.error);
  const reasons: string[] = [];
  // Page errors carry no timestamp, so they cannot be tied to this test — shown in drafts, never used to classify.
  const appErrors = [...f.evidence.network.filter((n) => /^5\d\d\b/.test(n)),
    ...f.evidence.console.filter((c) => ERROR_TEXT.test(c) || /\b5\d\d\b/.test(c))];

  if (f.knownBug) {
    if (f.lastStatus === 'passed' && f.testStatus === 'unexpected') {
      return { cls: 'possibly-fixed', severity: 'Medium', confidence: 'High', reasons: [`Marked test.fail (${f.knownBug.split(':')[0]}) but passed — the bug may be fixed; remove the marker once confirmed.`] };
    }
    return { cls: 'known-defect', severity: 'Low', confidence: 'High', reasons: [`Expected failure of a known bug: ${f.knownBug}`] };
  }
  if (f.testStatus === 'flaky') {
    return { cls: 'synchronization', severity: 'Medium', confidence: 'Medium', reasons: ['Failed, then passed on retry — timing or shared-state dependent, not a stable application failure.'] };
  }
  if (/\/auth\/|sign-?in|login/i.test(f.pageUrl ?? '') && !/sign-?in|login/i.test(f.title)) {
    return { cls: 'environment', severity: 'Medium', confidence: 'High', reasons: [`The page ended on ${f.pageUrl} — the session or sign-in failed.`] };
  }
  if (ENVIRONMENT.test(err)) {
    return { cls: 'environment', severity: 'Medium', confidence: 'High', reasons: [`Infrastructure error: ${err.match(ENVIRONMENT)![0]}.`] };
  }
  if (SYNC.test(err)) {
    return { cls: 'synchronization', severity: 'Medium', confidence: 'High', reasons: [`The element was not ready: ${err.match(SYNC)![0]}.`] };
  }
  if (AUTOMATION.test(err)) {
    return { cls: 'automation', severity: 'Medium', confidence: 'High', reasons: [`Test-code or selector error: ${err.match(AUTOMATION)![0]}.`] };
  }
  if (TEST_DATA.test(err)) {
    return { cls: 'test-data', severity: 'Low', confidence: 'Medium', reasons: [`Missing precondition data: ${err.match(TEST_DATA)![0]}.`] };
  }
  const { expected, actual } = expectedActual(err);
  if (/expect\(|toHave|toBe|toEqual|toMatch|toContain/.test(err) && (expected !== undefined || actual !== undefined)) {
    reasons.push(`Assertion failed — expected ${expected ?? '(see error)'}, got ${actual ?? '(see error)'}.`);
    if (appErrors.length) {
      reasons.push(`Application errors in the test's own window: ${appErrors.slice(0, 3).join(' | ')}`);
      return { cls: 'application', severity: 'High', confidence: 'High', reasons };
    }
    if (ERROR_TEXT.test(actual ?? '')) {
      reasons.push('The actual value is an error message shown by the application.');
      return { cls: 'application', severity: 'High', confidence: 'High', reasons };
    }
    reasons.push('No server or page error in the window — confirm against the requirement before filing.');
    return { cls: 'application', severity: 'Medium', confidence: 'Medium', reasons };
  }
  if (LOCATOR_WAIT.test(err)) {
    if (appErrors.length) {
      return { cls: 'application', severity: 'Medium', confidence: 'Low', reasons: ['A locator timed out while the application reported errors in the window — the page may not have rendered.', ...appErrors.slice(0, 3)] };
    }
    return { cls: 'automation', severity: 'Medium', confidence: 'Medium', reasons: ['A locator timed out with no application error in the window — the selector is likely stale or the step precondition was not met. Check it with: cli.ts locators --live.'] };
  }
  return { cls: 'needs-triage', severity: 'Medium', confidence: 'Low', reasons: ['No rule matched — open the trace to triage. Not assumed to be an application bug.'] };
}

// ---------------------------------------------------------------- reading the run

interface PwResult { status: string; retry: number; startTime: string; duration: number; error?: { message?: string; stack?: string }; attachments?: { name: string; path?: string }[] }
interface PwTest { status: string; annotations?: { type: string; description?: string }[]; results: PwResult[] }
interface PwSpec { title: string; file: string; tests: PwTest[] }
interface PwSuite { specs?: PwSpec[]; suites?: PwSuite[] }
interface SummaryEntry { testName: string; pageUrl?: string; lastActions?: string[]; consoleErrors?: { type?: string; text: string; timestamp?: number }[];
  networkFailures?: { url: string; status: number; statusText?: string; timestamp?: number }[]; pageErrors?: string[]; failureCategory?: string }

const NOISE_URL = /\/auth\/|sign-in|oauth|_next\/static|favicon|\.(js|css|png|svg|woff2?|map)(\?|$)/i;

export function readFailures(root: string, resultsFile: string, summaryFile: string): { failures: FailureInput[]; notes: string[] } {
  const notes: string[] = [];
  const results = JSON.parse(fs.readFileSync(resultsFile, 'utf8')) as { suites: PwSuite[]; stats?: { startTime?: string } };
  const summary: SummaryEntry[] = fs.existsSync(summaryFile) ? (JSON.parse(fs.readFileSync(summaryFile, 'utf8')) as { failures: SummaryEntry[] }).failures : [];
  if (!fs.existsSync(summaryFile)) notes.push(`${rel(root, summaryFile)} not found — classifying without console/network evidence.`);
  const byName = new Map(summary.map((s) => [s.testName, s]));
  const failures: FailureInput[] = [];

  const walk = (s: PwSuite): void => {
    for (const sp of s.specs ?? []) {
      for (const t of sp.tests) {
        const last = t.results[t.results.length - 1];
        if (!last || last.status === 'skipped') continue;
        const knownBug = t.annotations?.find((a) => a.type === 'fail')?.description;
        const failed = t.results.some((r) => r.status !== 'passed' && r.status !== 'skipped');
        if (!failed && !(knownBug && last.status === 'passed')) continue;
        const bad = [...t.results].reverse().find((r) => r.status !== 'passed') ?? last;
        const start = Date.parse(bad.startTime);
        const end = start + bad.duration;
        const inWindow = (ts?: number): boolean => ts === undefined || (ts >= start - 1000 && ts <= end + 1000);
        const diag = byName.get(sp.title);
        // Requests the browser cancelled (status 0, ERR_ABORTED — navigation, prefetch) are routine, not failures.
        const net = (diag?.networkFailures ?? []).filter((n) => !NOISE_URL.test(n.url) && !(n.status === 0 && /ERR_ABORTED/i.test(n.statusText ?? '')));
        const cons = (diag?.consoleErrors ?? []).filter((c) => (c.type ?? 'error') === 'error');
        const evidence: Evidence = {
          network: net.filter((n) => inWindow(n.timestamp)).map((n) => `${n.status || n.statusText} ${n.url}`),
          console: cons.filter((c) => inWindow(c.timestamp)).map((c) => c.text),
          pageErrors: diag?.pageErrors ?? [],
        };
        const outsideWindow = net.filter((n) => !inWindow(n.timestamp)).length + cons.filter((c) => !inWindow(c.timestamp)).length;
        const attachment = (name: string): string | undefined => bad.attachments?.find((a) => a.name === name && a.path)?.path;
        const screenshot = attachment('screenshot');
        const trace = attachment('trace');
        failures.push({
          title: sp.title, file: sp.file.split(path.sep).join('/'), testStatus: t.status, lastStatus: last.status,
          error: bad.error?.message ?? bad.error?.stack ?? '', evidence, outsideWindow,
          steps: (diag?.lastActions ?? []).filter((a) => !/After Hooks/.test(a)),
          ...(knownBug ? { knownBug } : {}),
          ...(diag?.pageUrl ? { pageUrl: diag.pageUrl } : {}),
          ...(screenshot ? { screenshot: rel(root, screenshot) } : {}),
          ...(trace ? { trace: rel(root, trace) } : {}),
          ...(diag?.failureCategory ? { reporterCategory: diag.failureCategory } : {}),
        });
      }
    }
    for (const child of s.suites ?? []) walk(child);
  };
  for (const s of results.suites) walk(s);
  notes.push(`Run of ${results.stats?.startTime ?? 'unknown time'} (${rel(root, resultsFile)}).`);
  return { failures, notes };
}

function rel(root: string, p: string): string {
  return (path.isAbsolute(p) ? path.relative(root, p) : p).split(path.sep).join('/');
}

const TC = /\b([A-Z]{2,}(?:-[A-Z0-9]+)*-\d{3,})\b/;

/** A draft bug report (Markdown) for an application failure. */
export function bugDraft(f: FailureInput, c: Classification, base: string): string {
  const { expected, actual } = expectedActual(f.error);
  const id = f.title.match(TC)?.[1] ?? 'UNNUMBERED';
  return [
    `# Potential bug — ${f.title}`,
    '',
    `- **Test:** ${id} (${f.file})`,
    `- **Confidence:** ${c.confidence} — ${c.reasons.join(' ')}`,
    `- **Page:** ${f.pageUrl ?? base}`,
    '',
    '## Steps (from the test run)',
    '',
    ...(f.steps.length ? f.steps.map((s, i) => `${i + 1}. ${s.replace(/^Step \d+:\s*/, '')}`) : ['1. See the test and its trace.']),
    '',
    `**Expected:** ${expected ?? 'see the assertion in the test'}`,
    '',
    `**Actual:** ${actual ?? strip(f.error).split('\n')[0]}`,
    '',
    '## Evidence',
    '',
    `- Screenshot: ${f.screenshot ?? '—'}`,
    `- Trace: ${f.trace ?? '—'} (open with \`npx playwright show-trace <path>\`)`,
    `- Failed requests in the test window: ${f.evidence.network.length ? f.evidence.network.join('; ') : 'none'}`,
    `- Console errors in the test window: ${f.evidence.console.length ? f.evidence.console.slice(0, 5).join('; ') : 'none'}`,
    `- Page errors in the browser session (not time-stamped): ${f.evidence.pageErrors.length ? f.evidence.pageErrors.join('; ') : 'none'}`,
    '',
    '_Draft generated by the QA toolkit. Reproduce manually and confirm against the requirement before filing._',
    '',
  ].join('\n');
}

const RECOMMEND: Record<FailureClass, string> = {
  application: 'Reproduce manually from the steps; if confirmed, file it from the draft and mark the test with test.fail(true, \'BUG-…\').',
  'known-defect': 'Nothing new — keep the test.fail marker until the bug is fixed.',
  'possibly-fixed': 'Re-run the test; if it passes again, verify the fix and remove the test.fail marker (the bug record can be closed).',
  environment: 'Re-run once the environment is healthy (sign in again with any test, check BASE_URL / VPN / service status).',
  synchronization: 'Wait for the state the step needs (web-first expect, waitForResponse) instead of acting immediately; run the flaky analyzer to measure it.',
  automation: 'Fix the test: update the selector (cli.ts locators --live), the page-object code, or the step precondition.',
  'test-data': 'Restore or create the data the test needs, or make the test set it up and clean it up itself.',
  'needs-triage': 'Open the trace and decide; record the class in the bug or test notes.',
};

export const bugDetector: Utility = {
  name: 'bugs',
  title: 'Bug Detection',
  summary: 'Classifies the last run\'s failures (application, automation, synchronization, test data, environment, known defect) and drafts bug reports.',
  async run(options: ToolkitOptions): Promise<UtilityResult> {
    const startedAt = new Date().toISOString();
    const resultsFile = path.resolve(options.root, options.paths.find((p) => /test-results.*\.json$/.test(p)) ?? RESULTS);
    const summaryFile = path.resolve(options.root, options.paths.find((p) => /failure-summary.*\.json$/.test(p)) ?? SUMMARY);
    const notes: string[] = [];
    if (!fs.existsSync(resultsFile)) {
      notes.push(`${rel(options.root, resultsFile)} not found — run the tests first.`);
      return { utility: UTILITY, title: this.title, startedAt, finishedAt: new Date().toISOString(), dryRun: options.dryRun, scanned: { failures: 0 }, findings: [], notes };
    }
    const read = readFailures(options.root, resultsFile, summaryFile);
    notes.push(...read.notes);
    dotenvFlow.config({ path: options.root, node_env: process.env.CI_ENV || process.env.NODE_ENV || 'local', silent: true });
    const base = process.env.BASE_URL || 'https://cloudapps-e2e.encoreglobal.com/navigator/';
    const classified = read.failures.map((f) => ({ f, c: classifyFailure(f) }));

    if (options.dryRun) {
      for (const { f, c } of classified) notes.push(`Dry run: ${f.title.slice(0, 80)} → ${c.cls} (${c.confidence})`);
      notes.push('Dry run: no drafts or reports written.');
      return { utility: UTILITY, title: this.title, startedAt, finishedAt: new Date().toISOString(), dryRun: true, scanned: { failures: classified.length }, findings: [], notes };
    }

    const draftDir = path.join(options.root, options.outDir, UTILITY, 'drafts');
    fs.rmSync(draftDir, { recursive: true, force: true }); // drafts describe the latest run only
    const findings: Finding[] = [];
    const counts: Record<string, number> = {};
    for (const { f, c } of classified) {
      counts[c.cls] = (counts[c.cls] ?? 0) + 1;
      let draft: string | undefined;
      if (c.cls === 'application') {
        fs.mkdirSync(draftDir, { recursive: true });
        draft = path.join(draftDir, `${(f.title.match(TC)?.[1] ?? f.title.slice(0, 40)).replace(/[^\w.-]+/g, '_')}.md`);
        fs.writeFileSync(draft, bugDraft(f, c, base), 'utf8');
      }
      const extra = [
        f.reporterCategory ? `Reporter category: ${f.reporterCategory}.` : '',
        f.outsideWindow ? `${f.outsideWindow} console/network error(s) from outside this test's window were ignored.` : '',
        draft ? `Draft: ${rel(options.root, draft)}` : '',
      ].filter(Boolean).join(' ');
      findings.push({ utility: UTILITY, rule: c.cls, severity: c.severity, file: f.file, line: 0, test: f.title,
        message: `${c.cls} (${c.confidence} confidence): ${c.reasons.join(' ')}${extra ? ` ${extra}` : ''}`,
        recommendation: RECOMMEND[c.cls], ...(f.screenshot ? { snippet: `screenshot: ${f.screenshot}${f.trace ? ` | trace: ${f.trace}` : ''}` } : {}) });
    }
    return { utility: UTILITY, title: this.title, startedAt, finishedAt: new Date().toISOString(), dryRun: false,
      scanned: { failures: classified.length, ...counts }, findings, notes };
  },
};

export default bugDetector;
