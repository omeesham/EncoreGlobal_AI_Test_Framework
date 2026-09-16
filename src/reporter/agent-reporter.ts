import * as fs from 'fs';
import * as path from 'path';
import type {
  Reporter,
  TestCase,
  TestResult,
  FullResult,
} from '@playwright/test/reporter';
import {
  FailureCategory,
  type NetworkFailure,
  type ConsoleEntry,
  type AuthChainEntry,
  type DiagnosticSnapshot,
  type UrlBreadcrumb,
} from '../types/diagnostics';
import {
  readAndAggregate as readRetryTelemetry,
  reset as resetRetryTelemetry,
  type RetryStats,
  type PerLayerStats,
} from '../utils/retry-telemetry';
import { isAuthUrl, urlHostMatches, textMentionsAuthUrl } from '../utils/url-host';

type TriageResult = null;

export interface FailureEntry {
  testName: string;
  file: string;
  error: string;
  fullError: string;
  selector: string | null;
  duration: number;
  screenshotPath: string | null;
  tracePath: string | null;
  lastActions: string[];
  failureCategory: FailureCategory;
  pageUrl: string;
  workerIndex: number;
  retryAttempt: number;
  consoleErrors: ConsoleEntry[];
  networkFailures: NetworkFailure[];
  pageErrors: string[];
  authChain: AuthChainEntry[];
  domSnippet: string;
  urlBreadcrumbs: UrlBreadcrumb[];
  triage: TriageResult | null;
  bugReportId: string | null;
  bugHuntCategory: string | null;
  testIdStatus: string | null;
  changeSize: string | null;
  failureCount: number;
  dependsOn: string[];
  finalOutcome: 'failed' | 'flaky';
}

interface FailureSummary {
  timestamp: string;
  failures: FailureEntry[];
  passed: number;
  failed: number;
  fixme: number;
  totalDuration: number;
  triageStats: { bugs: number; featureChanges: number; testDefects: number; uncertain: number } | null;
  bugReportFiles: string[];
  retryStats: RetryStats | null;
}

const OUTPUT_FILE = path.join(process.cwd(), 'reports', 'failure-summary.json');
const FAILURE_HISTORY_FILE = path.join(process.cwd(), 'reports', 'failure-history.json');

function getFailureCount(testName: string): number {
  try {
    if (!fs.existsSync(FAILURE_HISTORY_FILE)) return 0;
    const raw = fs.readFileSync(FAILURE_HISTORY_FILE, 'utf-8');
    const history = JSON.parse(raw);
    if (!Array.isArray(history)) return 0;
    return history.filter(
      (entry: { testName?: string }) => entry.testName === testName,
    ).length;
  } catch {
    return 0;
  }
}

const SELECTOR_PREFIXES = ['btn', 'txt', 'drp', 'chk', 'lnk', 'rdo', 'dlg', 'tbl', 'err', 'col', 'spin', 'tab', 'pnl'];

class AgentReporter implements Reporter {
  private failures: FailureEntry[] = [];
  private passedCount = 0;
  private failedCount = 0;
  private fixmeCount = 0;
  private totalDuration = 0;
  private perTestFirstTryPassed = 0;
  private perTestFailedFirstTry = 0;
  private perTestPassedOnRetry: Map<number, number> = new Map();
  private perTestFailedOnRetry: Map<number, number> = new Map();
  private perTestDurationByAttempt: Map<number, number> = new Map();
  // Track the last-seen status per test (attempts arrive in order; last write wins).
  // Used in onEnd to promote all failure entries for a test to 'flaky' if it eventually passed.
  private finalStatusByTestId: Map<string, string> = new Map();
  private entriesByTestId: Map<string, FailureEntry[]> = new Map();

  onBegin(): void {
    resetRetryTelemetry();
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    this.totalDuration += result.duration;

    // Track the last-seen status per test (attempts arrive in order; last write wins).
    // Used in onEnd to promote all failure entries for a test to 'flaky' if it eventually passed.
    this.finalStatusByTestId.set(test.id, result.status);

    const retryN = result.retry;
    this.perTestDurationByAttempt.set(
      retryN,
      (this.perTestDurationByAttempt.get(retryN) || 0) + result.duration,
    );
    if (result.status === 'passed') {
      if (retryN === 0) {
        this.perTestFirstTryPassed += 1;
      } else {
        this.perTestPassedOnRetry.set(retryN, (this.perTestPassedOnRetry.get(retryN) || 0) + 1);
      }
    } else if (result.status === 'failed' || result.status === 'timedOut') {
      if (retryN === 0) {
        this.perTestFailedFirstTry += 1;
      } else {
        this.perTestFailedOnRetry.set(retryN, (this.perTestFailedOnRetry.get(retryN) || 0) + 1);
      }
    }

    if (result.status === 'skipped') {
      const annotations = test.annotations || [];
      const isFixme = annotations.some(a => a.type === 'fixme');
      if (isFixme) this.fixmeCount++;
      return;
    }

    if (result.status === 'passed' || result.status === 'timedOut' && result.errors.length === 0) {
      this.passedCount++;
      return;
    }

    if (result.status === 'failed' || result.status === 'timedOut') {
      this.failedCount++;

      const fullErrorMsg = result.errors
        .map(e => e.message || e.stack || 'Unknown error')
        .join(' | ');

      const errorMsg = fullErrorMsg.substring(0, 500);

      const selectorMatch = errorMsg.match(
        new RegExp(`['"\`]((?:${SELECTOR_PREFIXES.join('|')})[A-Z]\\w+)['"\`]`)
      );

      const screenshot = result.attachments.find(
        a => a.name === 'screenshot' && a.path
      );

      const trace = result.attachments.find(
        a => a.name === 'trace' && a.path
      );

      let diagnostics: DiagnosticSnapshot | null = null;
      const diagAttachment = result.attachments.find(a => a.name === 'diagnostics');
      if (diagAttachment?.body) {
        try {
          diagnostics = JSON.parse(diagAttachment.body.toString('utf-8')) as DiagnosticSnapshot;
        } catch { /* malformed -- treat as no diagnostics */ }
      }

      const failureCategory = this.classifyFailure(fullErrorMsg, diagnostics);

      const lastActions: string[] = [];
      const steps = result.steps || [];
      const relevantSteps = steps.slice(-5);
      for (const step of relevantSteps) {
        if (step.title && !step.title.startsWith('fixture:')) {
          lastActions.push(step.title);
        }
      }

      const dependsOn = (test.annotations || [])
        .filter(a => a.type === 'dependsOn')
        .map(a => a.description ?? '')
        .filter(s => s.length > 0);

      this.failures.push({
        testName: test.title,
        file: test.location.file ? path.relative(process.cwd(), test.location.file) : 'unknown',
        error: errorMsg,
        fullError: fullErrorMsg,
        selector: selectorMatch?.[1] ?? null,
        duration: result.duration,
        screenshotPath: screenshot?.path
          ? path.relative(process.cwd(), screenshot.path)
          : null,
        tracePath: trace?.path
          ? path.relative(process.cwd(), trace.path)
          : null,
        lastActions,
        failureCategory,
        pageUrl: diagnostics?.urlHistory.at(-1) ?? '',
        workerIndex: result.workerIndex,
        retryAttempt: result.retry,
        consoleErrors: diagnostics?.consoleErrors ?? [],
        networkFailures: diagnostics?.networkFailures ?? [],
        pageErrors: diagnostics?.pageErrors ?? [],
        authChain: diagnostics?.authChain ?? [],
        domSnippet: (diagnostics?.domSnippet ?? '').substring(0, 10_240),
        urlBreadcrumbs: diagnostics?.urlBreadcrumbs ?? [],
        triage: null,
        bugReportId: null,
        bugHuntCategory: null,
        testIdStatus: null,
        changeSize: null,
        failureCount: getFailureCount(test.title),
        dependsOn,
        finalOutcome: 'failed',
      });
      // Index the just-pushed entry so onEnd can promote it to 'flaky' if the test later passes.
      const existing = this.entriesByTestId.get(test.id) ?? [];
      existing.push(this.failures[this.failures.length - 1]!);
      this.entriesByTestId.set(test.id, existing);
    }
  }

  private classifyFailure(errorMsg: string, diagnostics: DiagnosticSnapshot | null): FailureCategory {
    const lower = errorMsg.toLowerCase();
    const netFails = diagnostics?.networkFailures ?? [];
    const consoleErrs = diagnostics?.consoleErrors ?? [];
    const pageErrs = diagnostics?.pageErrors ?? [];

    if (
      textMentionsAuthUrl(errorMsg) ||
      lower.includes('oauth') ||
      lower.includes('401') ||
      lower.includes('403') ||
      netFails.some(n => (isAuthUrl(n.url) || n.url.includes('oauth')) && n.status >= 400)
    ) {
      return FailureCategory.AUTH;
    }

    if (netFails.some(n => n.status >= 400 && !urlHostMatches(n.url, 'login.microsoftonline.com'))) {
      return FailureCategory.NETWORK;
    }

    const selectorPattern = new RegExp(`['"\`]((?:${SELECTOR_PREFIXES.join('|')})[A-Z]\\w+)['"\`]`);
    if (selectorPattern.test(errorMsg) || lower.includes('locator') || lower.includes('selector')) {
      return FailureCategory.SELECTOR;
    }

    if (lower.includes('timeout') || lower.includes('waiting for')) {
      return FailureCategory.TIMING;
    }

    if (lower.includes('browser has been closed') || lower.includes('context closed') || lower.includes('target closed')) {
      return FailureCategory.INFRASTRUCTURE;
    }

    if (
      pageErrs.length > 0 ||
      consoleErrs.some(e => e.type === 'error' && (e.text.includes('unhandled') || e.text.includes('Uncaught')))
    ) {
      return FailureCategory.APPLICATION;
    }

    if (lower.includes('expected') && lower.includes('received') && !selectorPattern.test(errorMsg)) {
      return FailureCategory.DATA;
    }

    return FailureCategory.UNKNOWN;
  }

  onEnd(_result: FullResult): void {
    // Guard: skip write when no tests executed (e.g., grep matched nothing, aborted run).
    // Prevents clobbering last real failure data with empty {passed:0, failed:0} results.
    if (this.passedCount + this.failedCount + this.fixmeCount === 0) {
      console.log('[AgentReporter] Skipping failure-summary.json write -- no tests executed');
      return;
    }

 for (const [testId, finalStatus] of this.finalStatusByTestId.entries()) {
   if (finalStatus === 'passed') {
     const entries = this.entriesByTestId.get(testId);
     if (entries) {
       for (const entry of entries) {
         entry.finalOutcome = 'flaky';
       }
     }
   }
 }

    const perTestRecovered: Record<number, number> = {};
    let perTestRecoveredTotal = 0;
    for (const [retryN, count] of this.perTestPassedOnRetry.entries()) {
      // retryN=1 means "passed on retry attempt 1" = the 2nd overall attempt
      perTestRecovered[retryN + 1] = count;
      perTestRecoveredTotal += count;
    }
    let perTestWastedAttempts = 0;
    let perTestWastedMs = 0;
    for (const [retryN, count] of this.perTestFailedOnRetry.entries()) {
      perTestWastedAttempts += count;
      const totalMsAtRetry = this.perTestDurationByAttempt.get(retryN) || 0;
      const eventsAtRetry =
        (this.perTestPassedOnRetry.get(retryN) || 0) + (this.perTestFailedOnRetry.get(retryN) || 0);
      const avgMs = eventsAtRetry > 0 ? totalMsAtRetry / eventsAtRetry : 0;
      perTestWastedMs += avgMs * count;
    }
    const perTestStats: PerLayerStats = {
      callCount: this.perTestFirstTryPassed + this.perTestFailedFirstTry,
      totalAttempts:
        this.perTestFirstTryPassed +
        this.perTestFailedFirstTry +
        Array.from(this.perTestPassedOnRetry.values()).reduce((a, b) => a + b, 0) +
        Array.from(this.perTestFailedOnRetry.values()).reduce((a, b) => a + b, 0),
      recoveredAtAttempt: perTestRecovered,
      wastedAttempts: perTestWastedAttempts,
      wastedMs: Math.round(perTestWastedMs),
      succeededOnFirstAttempt: this.perTestFirstTryPassed,
      failedAfterAllAttempts: Math.max(0, this.perTestFailedFirstTry - perTestRecoveredTotal),
    };

    const fileStats = readRetryTelemetry();
    const retryStats: RetryStats = { ...fileStats, perTest: perTestStats };

    const summary: FailureSummary = {
      timestamp: new Date().toISOString(),
      failures: this.failures,
      passed: this.passedCount,
      failed: this.failedCount,
      fixme: this.fixmeCount,
      totalDuration: this.totalDuration,
      triageStats: null,
      bugReportFiles: [],
      retryStats,
    };

    const reportsDir = path.dirname(OUTPUT_FILE);
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(summary, null, 2) + '\n', 'utf-8');
  }
}

export default AgentReporter;
