/**
 * Types for the SDET Application Bug Discovery Utility.
 *
 * The crawler explores the application the way a tester would — open a screen, look at what is
 * there, interact with it, judge what came back — so the types split along that same seam:
 *
 *   DiscoveredElement / PageAudit   what the crawler SEES on a page
 *   PerformedAction / PageSignals   what it DID and what the page emitted in response
 *   Finding                          what a detector JUDGED to be wrong
 *   Bug                              a finding after IDs, severity, dedup and evidence
 *
 * Detectors never construct a Bug. They return Findings; the collector owns identity, ranking
 * and deduplication, so two detectors cannot disagree about what counts as "the same bug".
 */

import type { Page } from '@playwright/test';

/* ------------------------------------------------------------------ severity and ranking */

/** Impact on the user. Mirrors the vocabulary already used in the team's TestRail cases. */
export type Severity = 'Critical' | 'Major' | 'Minor' | 'Trivial';

/** Fix order. Derived from severity and reach, never set by a detector directly. */
export type BugPriority = 'P1' | 'P2' | 'P3' | 'P4';

/** The kind of defect, for grouping a report by what a reader is looking for. */
export type BugCategory =
  | 'Functional'
  | 'Navigation'
  | 'Validation'
  | 'Data'
  | 'UI'
  | 'Accessibility'
  | 'Stability';

/** Every check the crawler can make. The collector keys severity, codes and titles off these. */
export type DetectorId =
  | 'page-crash'
  | 'console-error'
  | 'network-failure'
  | 'broken-link'
  | 'dead-control'
  | 'unexpected-route'
  | 'form-validation'
  | 'input-boundary'
  | 'placeholder-text'
  | 'missing-label'
  | 'accessibility'
  | 'layout'
  | 'page-title';

/* ------------------------------------------------------------------ what the crawler sees */

/** How an element behaves, which is what decides whether and how the crawler interacts with it. */
export type ElementKind =
  | 'link'
  | 'button'
  | 'tab'
  | 'menuitem'
  | 'select'
  | 'input'
  | 'textarea'
  | 'checkbox'
  | 'radio'
  | 'search'
  | 'pagination'
  | 'sort'
  | 'form'
  | 'other';

export interface ElementBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * One interactive element, as collected in a single pass inside the browser.
 *
 * `ref` is the contract between the snapshot and the crawler: the discovery script stamps
 * `data-sdet-ref` on each element it reports, so the crawler can come back to exactly that
 * element without re-deriving a selector that may match several. The attribute is inert, is
 * never submitted with a form, and disappears on the next navigation.
 */
export interface DiscoveredElement {
  ref: string;
  kind: ElementKind;
  tag: string;
  role: string;
  /** Accessible name — aria-label, labelled-by text, own text, placeholder, title, alt. */
  name: string;
  testid: string;
  href: string;
  /** `type` for inputs and buttons; '' otherwise. */
  type: string;
  value: string;
  placeholder: string;
  disabled: boolean;
  required: boolean;
  /**
   * Already selected, current or pressed.
   *
   * Clicking such a control correctly does nothing — an active tab stays active. Recorded so the
   * crawler does not spend an action learning that, and so the dead-control judgement is not
   * made against a control that behaved properly.
   */
  selected: boolean;
  visible: boolean;
  box: ElementBox;
  /** Best-effort CSS path, for the bug report — not used to re-find the element. */
  selector: string;
  /** Whether a real label, aria-label or aria-labelledby names this control. */
  labelled: boolean;
  /** `ref` of the enclosing form, '' when the control is not in one. */
  formRef: string;
}

/** Page-level observations gathered in the same in-browser pass as the elements. */
export interface PageAudit {
  title: string;
  headingCount: number;
  h1Count: number;
  /** Document scroll width beyond the viewport — anything over the tolerance is a layout bug. */
  horizontalOverflowPx: number;
  duplicateIds: string[];
  imagesWithoutAlt: number;
  /** Visible text nodes holding a leaked placeholder, an i18n key or an unresolved template. */
  suspectTexts: string[];
  /** Interactive elements rendered at zero size, or entirely outside the document. */
  zeroSizeInteractive: number;
  /** Text visibly clipped by its container (scrollWidth far exceeds clientWidth). */
  clippedTexts: string[];
  /** Copy that reads as an application crash rather than a handled empty state. */
  crashBanners: string[];
  bodyTextLength: number;
}

/* ------------------------------------------------------------------ what the crawler does */

/**
 * What an interaction actually achieved.
 *
 * `no-effect` is the interesting one and the reason this is recorded at all: a control that
 * neither navigates, nor opens anything, nor changes the page is a dead control, and nothing
 * short of comparing before and after can tell that apart from a control that worked.
 */
export type ActionOutcome =
  | 'navigated'
  | 'dialog-opened'
  | 'content-changed'
  | 'no-effect'
  | 'failed';

export interface PerformedAction {
  /** Human-readable, and reused verbatim as a step in the bug report. */
  description: string;
  kind: ElementKind;
  elementName: string;
  selector: string;
  urlBefore: string;
  urlAfter: string;
  /** Fingerprint used to guarantee the same action is never repeated on the same page shape. */
  fingerprint: string;
  outcome: ActionOutcome;
  /** For a link: the href it advertised, so a mismatch with `urlAfter` is visible. */
  advertisedHref?: string;
  ok: boolean;
  error?: string;
}

export interface NetworkNote {
  url: string;
  method: string;
  status: number;
  statusText: string;
}

/**
 * Everything the page emitted since the last checkpoint.
 *
 * Checkpointed rather than cumulative on purpose: a console error must be attributed to the
 * action that provoked it, not to every page visited afterwards, or one broken widget poisons
 * the whole report.
 */
export interface PageSignals {
  consoleErrors: string[];
  pageErrors: string[];
  networkFailures: NetworkNote[];
}

/* ------------------------------------------------------------------ what detectors return */

export interface Finding {
  detector: DetectorId;
  title: string;
  /** What should have happened, in the voice of a tester writing a defect. */
  expected: string;
  /** What actually happened. */
  actual: string;
  /**
   * Stable within a detector and independent of run-to-run noise. The collector normalizes it
   * (numbers, ids and timestamps folded out) before hashing, so "row 4 failed" and "row 9
   * failed" collapse into one bug rather than two.
   */
  signature: string;
  /** Overrides the detector's default severity where the finding itself is worse or milder. */
  severity?: Severity;
  selector?: string;
  domSnippet?: string;
  consoleErrors?: string[];
  networkFailures?: NetworkNote[];
  /** Extra reproduction steps specific to this finding, appended after the navigation trail. */
  extraSteps?: string[];
}

export interface DetectorContext {
  page: Page;
  url: string;
  module: string;
  depth: number;
  elements: DiscoveredElement[];
  audit: PageAudit;
  signals: PageSignals;
  /** The action that led to this state, or null when the page was reached by navigation. */
  action: PerformedAction | null;
  /**
   * HTTP status of the navigation that loaded this page, or null when it is unknown (a
   * client-side route change produces no response). A sparse page is ordinary at 404 and a
   * defect at 200, so this is what stops the crash detector guessing from page emptiness.
   */
  httpStatus: number | null;
  config: ResolvedCrawlerConfig;
  /** Steps taken to reach this page, ready to be used as reproduction steps. */
  trail: string[];
  /**
   * Records something the detector could not check.
   *
   * The distinction this exists to preserve: "I looked and it was fine" and "I could not look"
   * are different answers, and only one of them belongs in the bug list. A detector that cannot
   * reach a destination says so here instead of filing a defect it has not actually observed.
   */
  noteUntested(target: string, reason: string): void;
}

export interface Detector {
  id: DetectorId;
  /** One line describing what this detector looks for — printed in the report's methodology. */
  description: string;
  /**
   * `page-load` runs once per page after it settles; `post-action` runs after every interaction.
   * Splitting them keeps a 200-action crawl from re-running expensive page-wide audits 200 times.
   */
  phase: 'page-load' | 'post-action' | 'both';
  run(context: DetectorContext): Promise<Finding[]> | Finding[];
}

/* ------------------------------------------------------------------ the finished bug */

export interface BugEvidence {
  screenshot: string | null;
  domSnippet: string | null;
  selector: string | null;
  consoleErrors: string[];
  networkFailures: NetworkNote[];
}

export interface Bug {
  id: string;
  title: string;
  severity: Severity;
  priority: BugPriority;
  category: BugCategory;
  detector: DetectorId;
  module: string;
  page: string;
  preconditions: string[];
  stepsToReproduce: string[];
  expectedResult: string;
  actualResult: string;
  evidence: BugEvidence;
  url: string;
  firstSeenAt: string;
  /** How many times this same defect was hit across the crawl. */
  occurrences: number;
  /** Other URLs the same defect appeared on, capped so one global bug cannot flood the report. */
  alsoSeenOn: string[];
  fingerprint: string;
}

/* ------------------------------------------------------------------ crawl bookkeeping */

export interface VisitedPage {
  url: string;
  normalizedUrl: string;
  module: string;
  depth: number;
  title: string;
  elementCount: number;
  actionsPerformed: number;
  bugsFound: number;
  durationMs: number;
  reachedVia: string;
}

export interface SkippedTarget {
  url: string;
  reason: string;
}

export interface CrawlError {
  where: string;
  url: string;
  message: string;
}

export interface ScenarioRecord {
  /** e.g. "Empty-submit validation on the Location search form". */
  name: string;
  url: string;
  outcome: 'explored' | 'skipped' | 'error';
  detail: string;
}

export interface CrawlSummary {
  startedAt: string;
  finishedAt: string;
  durationMs: string;
  startUrl: string;
  /** Resolved config, with secrets removed — a report has to say what was actually run. */
  configUsed: Record<string, unknown>;
  pagesVisited: VisitedPage[];
  actionsPerformed: PerformedAction[];
  scenarios: ScenarioRecord[];
  bugs: Bug[];
  errors: CrawlError[];
  notTested: SkippedTarget[];
  stopReason: string;
  totals: {
    pagesVisited: number;
    actionsPerformed: number;
    scenariosExplored: number;
    bugsFound: number;
    findingsBeforeDedup: number;
    errors: number;
    notTested: number;
    bySeverity: Record<Severity, number>;
    byCategory: Record<string, number>;
  };
}

/* ------------------------------------------------------------------ configuration */

export interface CrawlerAuthConfig {
  /**
   * `storage-state` reuses .auth/encore-state.json, which the framework's `setup` project already
   * maintains — the crawler does not re-implement SSO. `none` crawls anonymously.
   */
  mode: 'storage-state' | 'none';
  storageStatePath: string;
  /** Selector that proves the session is live; the crawl aborts early rather than mapping a login wall. */
  signedInSelector: string;
  signedInTimeoutMs: number;
}

export interface CrawlerLimits {
  maxPages: number;
  maxActionsPerPage: number;
  maxTotalActions: number;
  maxDepth: number;
  /** Wall-clock budget. Reached, the crawl stops cleanly and still writes a full report. */
  maxDurationMs: number;
  /** Per-page settle time after a navigation or an action. */
  settleMs: number;
  actionTimeoutMs: number;
  navigationTimeoutMs: number;
}

export interface CrawlerSafety {
  /**
   * OFF by default. While off the crawler performs read-only exploration: it navigates, opens,
   * filters, sorts and pages, and it types into fields, but it never submits a form or presses a
   * control whose name matches `writeActionPattern`.
   */
  allowWrites: boolean;
  /** OFF by default and independent of `allowWrites` — Delete, Remove, Deactivate and the like. */
  allowDestructive: boolean;
  /** Accessible names matching these are treated as state-changing. */
  writeActionPatterns: string[];
  /** Accessible names matching these are treated as destructive. */
  destructiveActionPatterns: string[];
  /** Never clicked under any setting — a crawler that signs itself out cannot continue. */
  neverClickPatterns: string[];
}

export interface CrawlerTestData {
  /** Values offered to text inputs, chosen by field name. Safe, obviously synthetic. */
  valid: Record<string, string>;
  /** Values that MUST be rejected. An accepted one is reported as a validation defect. */
  invalid: string[];
  /** Values at the edge of a field's range — accepted or rejected, but never a crash. */
  boundary: string[];
}

export interface CrawlerConfig {
  startUrl?: string;
  /** Only URLs on these origins are crawled. Defaults to the origin of `startUrl`. */
  allowedOrigins?: string[];
  /** URL substrings or regex sources that are never visited. */
  excludeUrlPatterns?: string[];
  /** Only URLs matching one of these are crawled, when set. */
  includeUrlPatterns?: string[];
  auth?: Partial<CrawlerAuthConfig>;
  limits?: Partial<CrawlerLimits>;
  safety?: Partial<CrawlerSafety>;
  testData?: Partial<CrawlerTestData>;
  detectors?: {
    /** When set, only these run. */
    only?: DetectorId[];
    disabled?: DetectorId[];
  };
  outputDir?: string;
  captureScreenshots?: boolean;
  /** Console messages matching these are known noise and never reported. */
  consoleIgnorePatterns?: string[];
  /** Request URLs matching these never count as network failures. */
  networkIgnorePatterns?: string[];
}

export interface ResolvedCrawlerConfig {
  startUrl: string;
  allowedOrigins: string[];
  excludeUrlPatterns: RegExp[];
  includeUrlPatterns: RegExp[];
  auth: CrawlerAuthConfig;
  limits: CrawlerLimits;
  safety: CrawlerSafety;
  testData: CrawlerTestData;
  enabledDetectors: DetectorId[];
  outputDir: string;
  captureScreenshots: boolean;
  consoleIgnorePatterns: RegExp[];
  networkIgnorePatterns: RegExp[];
}
