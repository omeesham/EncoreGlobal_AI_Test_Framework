/**
 * Shared types of the QA Quality and Validation Toolkit (src/utils/qa-toolkit).
 *
 * Every utility returns a UtilityResult whose findings share one shape, so one report writer renders them all and
 * the consolidated run can merge them.
 */

export type Severity = 'Critical' | 'High' | 'Medium' | 'Low';

export interface Finding {
  /** Utility that raised it, e.g. "script-quality". */
  utility: string;
  /** Stable rule id, e.g. "missing-await". */
  rule: string;
  severity: Severity;
  /** Repo-relative, forward slashes. */
  file: string;
  /** 1-based; 0 when the finding is about the whole file. */
  line: number;
  /** Test title the finding sits in, when there is one. */
  test?: string;
  message: string;
  /** What to do about it — every finding carries one. */
  recommendation: string;
  /** The offending source line, trimmed (secrets masked). */
  snippet?: string;
}

export interface UtilityResult {
  utility: string;
  title: string;
  startedAt: string;
  finishedAt: string;
  dryRun: boolean;
  /** Counters shown on the report header, e.g. { files: 12, tests: 340 }. */
  scanned: Record<string, number>;
  findings: Finding[];
  /** Context worth reading before the findings (scope, skipped files, assumptions). */
  notes: string[];
  /** Optional data table shown under the findings (e.g. the flaky analyzer's pass/fail history). */
  table?: { title: string; columns: string[]; rows: string[][] };
}

export interface ToolkitOptions {
  /** Repo root (where package.json and tsconfig.json live). */
  root: string;
  /** Print what would be analysed or run; write nothing, execute nothing. */
  dryRun: boolean;
  /** Files or directories to analyse, repo-relative. Empty = the utility's default scope. */
  paths: string[];
  /** Report root, repo-relative. */
  outDir: string;
  /** Locator Validator: also check selectors in a real browser (read-only navigation). */
  live?: boolean;
  /** Locator Validator --live: page to open, relative to BASE_URL (e.g. /locations/1101/commissions/tiers). */
  url?: string;
  /** Flaky Analyzer: Playwright --grep pattern. */
  grep?: string;
  /** Flaky Analyzer: repetitions per test (default 3). */
  repeat?: number;
  /** Flaky Analyzer: Playwright project (default chromium). */
  project?: string;
}

export interface Utility {
  name: string;
  title: string;
  /** One line for --help. */
  summary: string;
  run(options: ToolkitOptions): Promise<UtilityResult>;
}
