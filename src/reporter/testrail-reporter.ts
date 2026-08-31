// Opt-in via TESTRAIL_ENABLED=true plus the connection vars in .env.testrail.example.
// TestRail errors only warn — they never fail the build or touch the local reports.

import type {
  FullConfig,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';
import * as fs from 'fs';
import * as path from 'path';
import { TestRailClient, type TestRailResult } from '../utils/testrail-client';

const STATUS = { passed: 1, blocked: 2, retest: 4, failed: 5 } as const;

const EXPLICIT_ID_RE = /(?:^|[\s[@])C(\d+)(?:[\s\]:]|$)/;
const TC_TOKEN_RE = /\bTC-[A-Z0-9]+(?:-[A-Z0-9]+)*-\d+\b/;
const TC_PREFIX_RE = /^\s*TC-[A-Z0-9]+(?:-[A-Z0-9]+)*-\d+\s*[:–-]\s*/;

/** Match key for a case title: TC-id prefix and trailing @tags dropped, punctuation folded. */
export function titleKey(title: string): string {
  return title
    .replace(TC_PREFIX_RE, '')
    .replace(/(\s+@[\w-]+)+\s*$/, '')
    .toLowerCase()
    .replace(/[‐-―−]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** TC id -> TestRail case id, frozen at config/testrail/case-map.json. Authoritative:
 *  it survives title edits on either side, which title matching does not. */
function loadCaseMap(): Map<string, number> {
  const file = path.join(__dirname, '..', '..', 'config', 'testrail', 'case-map.json');
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, number>;
    return new Map(Object.entries(raw).filter(([, v]) => Number.isInteger(v)));
  } catch {
    return new Map();
  }
}

interface Collected {
  title: string;
  explicitId: number | null;
  tcToken: string | null;
  titleKey: string;
  statusId: number;
  comment: string;
  elapsed: string;
}

export default class TestRailReporter implements Reporter {
  private enabled = false;
  private collected = new Map<string, Collected>();

  printsToStdio(): boolean {
    return false;
  }

  onBegin(_config: FullConfig, _suite: Suite): void {
    const required = ['TESTRAIL_HOST', 'TESTRAIL_USERNAME', 'TESTRAIL_API_KEY', 'TESTRAIL_PROJECT_ID'];
    const missing = required.filter((k) => !process.env[k]);
    this.enabled = process.env.TESTRAIL_ENABLED === 'true' && missing.length === 0;
    if (process.env.TESTRAIL_ENABLED === 'true' && !this.enabled) {
      console.warn(`[testrail] disabled — missing env: ${missing.join(', ')}`);
    }
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    if (process.env.TESTRAIL_ENABLED !== 'true') return;

    const outcome = test.outcome(); // expected | unexpected | flaky | skipped
    if (outcome === 'skipped') return; // TestRail's API can't set "untested"; leave as-is

    const statusId = outcome === 'unexpected' ? STATUS.failed : STATUS.passed;
    const seconds = Math.max(1, Math.round(result.duration / 1000));
    const lines = [
      `Playwright ${outcome === 'flaky' ? 'passed (flaky — needed retry)' : outcome === 'expected' ? 'passed' : 'failed'}`,
      `Spec: ${test.location.file.split(/[\\/]/).slice(-2).join('/')}:${test.location.line}`,
      `Duration: ${seconds}s · attempt ${result.retry + 1}`,
    ];
    if (result.error?.message) {
      lines.push('', result.error.message.replace(/\u001b\[[0-9;]*m/g, '').slice(0, 1500));
    }

    // Keyed by test id → the final attempt's entry wins.
    this.collected.set(test.id, {
      title: test.title,
      explicitId: this.explicitId(test),
      tcToken: TC_TOKEN_RE.exec(test.title)?.[0] ?? null,
      titleKey: titleKey(test.title),
      statusId,
      comment: lines.join('\n'),
      elapsed: `${seconds}s`,
    });
  }

  private explicitId(test: TestCase): number | null {
    const fromTitle = EXPLICIT_ID_RE.exec(test.title)?.[1];
    if (fromTitle) return Number(fromTitle);
    for (const tag of test.tags) {
      const m = /^@?C(\d+)$/.exec(tag);
      if (m?.[1]) return Number(m[1]);
    }
    return null;
  }

  async onEnd(): Promise<void> {
    if (!this.enabled || this.collected.size === 0) return;

    try {
      const projectId = Number(process.env.TESTRAIL_PROJECT_ID);
      const suiteId = process.env.TESTRAIL_SUITE_ID ? Number(process.env.TESTRAIL_SUITE_ID) : undefined;
      const milestoneId = process.env.TESTRAIL_MILESTONE_ID
        ? Number(process.env.TESTRAIL_MILESTONE_ID)
        : undefined;
      const client = new TestRailClient(
        process.env.TESTRAIL_HOST!,
        process.env.TESTRAIL_USERNAME!,
        process.env.TESTRAIL_API_KEY!,
      );

      const caseMap = loadCaseMap();
      const mapped = (c: Collected): number | undefined =>
        (c.tcToken ? caseMap.get(c.tcToken) : undefined);

      // One case scan feeds both fallbacks: TC token in the case title, then the case title itself.
      // Skipped entirely when the frozen map already covers every test.
      const needsLookup = [...this.collected.values()].some((c) => !c.explicitId && !mapped(c));
      const tokenToCase = new Map<string, number>();
      const titleToCases = new Map<string, number[]>();
      if (needsLookup) {
        for (const c of await client.getCases(projectId, suiteId)) {
          const token = TC_TOKEN_RE.exec(c.title)?.[0];
          if (token && !tokenToCase.has(token)) tokenToCase.set(token, c.id);
          const key = titleKey(c.title);
          if (!key) continue;
          const ids = titleToCases.get(key);
          if (ids) ids.push(c.id);
          else titleToCases.set(key, [c.id]);
        }
      }

      const results: TestRailResult[] = [];
      const unmatched: string[] = [];
      const ambiguous: string[] = [];
      const seen = new Set<number>();
      for (const c of this.collected.values()) {
        const ambiguousBefore = ambiguous.length;
        const caseId = c.explicitId ?? mapped(c) ?? this.resolve(c, tokenToCase, titleToCases, ambiguous);
        if (!caseId) {
          if (ambiguous.length === ambiguousBefore) unmatched.push(c.title);
          continue;
        }
        if (seen.has(caseId)) continue; // first entry per case wins
        seen.add(caseId);
        results.push({ case_id: caseId, status_id: c.statusId, comment: c.comment, elapsed: c.elapsed });
      }

      if (results.length === 0) {
        console.warn(`[testrail] no tests matched a TestRail case — nothing pushed (${unmatched.length} unmatched)`);
        return;
      }

      // Existing run (TESTRAIL_RUN_ID) or a fresh one scoped to just these cases.
      let runId = process.env.TESTRAIL_RUN_ID ? Number(process.env.TESTRAIL_RUN_ID) : undefined;
      if (!runId) {
        const env = process.env.CI_ENV || process.env.NODE_ENV || 'local';
        const name =
          process.env.TESTRAIL_RUN_NAME ||
          `Playwright — ${env} — ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
        const run = await client.addRun(projectId, {
          name,
          suite_id: suiteId,
          milestone_id: milestoneId,
          include_all: false,
          case_ids: results.map((r) => r.case_id),
          description: 'Automated results pushed by the Encore Playwright TestRail reporter.',
        });
        runId = run.id;
      }

      await client.addResultsForCases(runId, results);
      if (process.env.TESTRAIL_CLOSE_RUN === 'true') await client.closeRun(runId);

      const failed = results.filter((r) => r.status_id === STATUS.failed).length;
      console.log(
        `[testrail] pushed ${results.length} result${results.length === 1 ? '' : 's'} ` +
          `(${results.length - failed} passed, ${failed} failed) → ${client.runUrl(runId)}`,
      );
      this.warnUnresolved(unmatched, ambiguous);
    } catch (e) {
      console.warn(`[testrail] push failed (local reports are unaffected): ${(e as Error).message}`);
    }
  }

  /** TC token in the TestRail case title, else the case title itself. Duplicate
   *  titles are reported rather than guessed — tag those tests with @C<id>. */
  private resolve(
    c: Collected,
    tokenToCase: Map<string, number>,
    titleToCases: Map<string, number[]>,
    ambiguous: string[],
  ): number | undefined {
    if (c.tcToken) {
      const byToken = tokenToCase.get(c.tcToken);
      if (byToken) return byToken;
    }
    const ids = titleToCases.get(c.titleKey);
    if (!ids || ids.length === 0) return undefined;
    if (ids.length > 1) {
      ambiguous.push(`${c.title} → C${ids.join(', C')}`);
      return undefined;
    }
    return ids[0];
  }

  private warnUnresolved(unmatched: string[], ambiguous: string[]): void {
    if (unmatched.length > 0) {
      console.warn(
        `[testrail] ${unmatched.length} test(s) had no matching TestRail case:\n` +
          unmatched.map((t) => `  - ${t}`).join('\n'),
      );
    }
    if (ambiguous.length > 0) {
      console.warn(
        `[testrail] ${ambiguous.length} test(s) matched more than one case — add an @C<id> tag:\n` +
          ambiguous.map((t) => `  - ${t}`).join('\n'),
      );
    }
  }
}
