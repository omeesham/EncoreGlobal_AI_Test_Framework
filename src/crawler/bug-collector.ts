/**
 * Turning findings into bugs: identity, severity, priority, evidence, deduplication.
 *
 * Detectors are deliberately naive — they report what they see, every time they see it. A crawl
 * of twenty-five screens will therefore hand this collector the same missing-label problem
 * twenty-five times, because it genuinely is on all twenty-five screens. Reporting it once, with
 * a count and the list of screens, is the difference between a report a team acts on and a
 * spreadsheet they close.
 *
 * Identity is the whole game, so it is worth being precise about: two findings are the same bug
 * when they come from the same detector and their NORMALIZED signature matches. Normalization
 * folds out the things that vary between two sightings of one defect — record ids, row numbers,
 * timestamps, GUIDs — and keeps the things that distinguish two different defects. Get it too
 * loose and unrelated bugs merge; too tight and the report floods. The rule of thumb encoded
 * here: a number is never part of a bug's identity, a word always is.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type { Page } from '@playwright/test';
import { Log } from '../utils/logger';
import type {
  Bug,
  BugCategory,
  BugPriority,
  DetectorId,
  Finding,
  ResolvedCrawlerConfig,
  Severity,
} from './types';
import { truncate } from './detectors/shared';

/** Per-detector identity: the id prefix in the report, the grouping, and the fallback severity. */
export const DETECTOR_META: Record<DetectorId, { code: string; category: BugCategory; severity: Severity }> = {
  'page-crash': { code: 'CRASH', category: 'Stability', severity: 'Critical' },
  'console-error': { code: 'CONSOLE', category: 'Stability', severity: 'Minor' },
  'network-failure': { code: 'NET', category: 'Functional', severity: 'Major' },
  'broken-link': { code: 'LINK', category: 'Navigation', severity: 'Major' },
  'dead-control': { code: 'CTRL', category: 'Functional', severity: 'Major' },
  'unexpected-route': { code: 'ROUTE', category: 'Navigation', severity: 'Minor' },
  'form-validation': { code: 'VALID', category: 'Validation', severity: 'Major' },
  'input-boundary': { code: 'INPUT', category: 'Validation', severity: 'Minor' },
  'placeholder-text': { code: 'TEXT', category: 'Data', severity: 'Minor' },
  'missing-label': { code: 'LABEL', category: 'Accessibility', severity: 'Minor' },
  accessibility: { code: 'A11Y', category: 'Accessibility', severity: 'Minor' },
  layout: { code: 'LAYOUT', category: 'UI', severity: 'Minor' },
  'page-title': { code: 'TITLE', category: 'UI', severity: 'Trivial' },
};

/** Beyond this, listing more URLs for one bug adds noise, not information. */
const MAX_ALSO_SEEN = 10;

/**
 * Folds out everything that varies between two sightings of one defect.
 *
 * Order matters: GUIDs and timestamps are replaced before the bare-number rule, or their digits
 * would be eaten first and the remaining hyphens would leave two different GUIDs looking alike.
 */
export function normalizeSignature(raw: string): string {
  return raw
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '{uuid}')
    .replace(/\d{4}-\d{2}-\d{2}[T ][\d:.]+Z?/g, '{timestamp}')
    .replace(/\d{1,2}\/\d{1,2}\/\d{4}/g, '{date}')
    .replace(/0x[0-9a-f]+/gi, '{hex}')
    .replace(/\b\d+\b/g, '{n}')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .slice(0, 400);
}

export function fingerprintOf(detector: DetectorId, signature: string): string {
  return crypto
    .createHash('sha1')
    .update(`${detector}::${normalizeSignature(signature)}`)
    .digest('hex')
    .slice(0, 12);
}

/**
 * Fix order, from how bad it is and how much of the application it affects.
 *
 * Reach is what separates "a label is missing on one screen" from "a label is missing on every
 * screen": the same severity, very different priority, and only the collector knows the second
 * one is true because only the collector sees the whole crawl.
 */
export function priorityFor(severity: Severity, occurrences: number): BugPriority {
  const widespread = occurrences >= 5;
  const repeated = occurrences >= 3;
  switch (severity) {
    case 'Critical':
      return 'P1';
    case 'Major':
      return repeated ? 'P1' : 'P2';
    case 'Minor':
      return widespread ? 'P2' : 'P3';
    case 'Trivial':
      return widespread ? 'P3' : 'P4';
  }
}

const SEVERITY_ORDER: Record<Severity, number> = { Critical: 0, Major: 1, Minor: 2, Trivial: 3 };
const PRIORITY_ORDER: Record<BugPriority, number> = { P1: 0, P2: 1, P3: 2, P4: 3 };

export interface RecordContext {
  page: Page;
  url: string;
  module: string;
  /** Steps taken to reach the page, used as the head of every reproduction path. */
  trail: string[];
}

export class BugCollector {
  private readonly bugs = new Map<string, Bug>();
  private readonly sequenceByCode = new Map<string, number>();
  private findingsSeen = 0;

  constructor(private readonly config: ResolvedCrawlerConfig) {}

  get findingCount(): number {
    return this.findingsSeen;
  }

  /**
   * Files a finding.
   *
   * Returns the bug it became, new or existing, so the caller can log which screens contributed
   * to what. A repeat sighting only increments the count and records the URL — the first
   * sighting's evidence is kept, because it is the one whose screenshot matches its steps.
   */
  async record(finding: Finding, context: RecordContext): Promise<Bug> {
    this.findingsSeen += 1;
    const fingerprint = fingerprintOf(finding.detector, finding.signature);

    const existing = this.bugs.get(fingerprint);
    if (existing) {
      existing.occurrences += 1;
      // The place is the VIEW, not just the URL. In a tabbed application the URL is identical on
      // every tab, so recording only the URL threw away the fact that the same defect is on the
      // history grid as well as the form — the reader saw "seen 3x" with nowhere to look.
      const site =
        context.module && context.module !== existing.module
          ? `${context.module} — ${context.url}`
          : context.url;
      if (site !== existing.url && !existing.alsoSeenOn.includes(site)) {
        if (existing.alsoSeenOn.length < MAX_ALSO_SEEN) existing.alsoSeenOn.push(site);
      }
      // Reach can promote a bug's priority, so it is recomputed on every sighting.
      existing.priority = priorityFor(existing.severity, existing.occurrences);
      return existing;
    }

    const meta = DETECTOR_META[finding.detector];
    const severity = finding.severity ?? meta.severity;
    const id = this.nextId(meta.code);

    const bug: Bug = {
      id,
      title: truncate(finding.title, 140),
      severity,
      priority: priorityFor(severity, 1),
      category: meta.category,
      detector: finding.detector,
      module: context.module,
      page: context.module,
      preconditions: this.preconditions(context),
      stepsToReproduce: this.steps(context, finding),
      expectedResult: finding.expected,
      actualResult: finding.actual,
      evidence: {
        screenshot: await this.captureScreenshot(id, context.page),
        domSnippet: finding.domSnippet ?? null,
        selector: finding.selector ?? null,
        consoleErrors: finding.consoleErrors ?? [],
        networkFailures: finding.networkFailures ?? [],
      },
      url: context.url,
      firstSeenAt: new Date().toISOString(),
      occurrences: 1,
      alsoSeenOn: [],
      fingerprint,
    };

    this.bugs.set(fingerprint, bug);
    Log.info(`[crawler] BUG ${id} [${severity}] ${bug.title}`);
    return bug;
  }

  private nextId(code: string): string {
    const next = (this.sequenceByCode.get(code) ?? 0) + 1;
    this.sequenceByCode.set(code, next);
    return `BUG-${code}-${String(next).padStart(3, '0')}`;
  }

  /**
   * The state the application has to be in for the steps to work.
   *
   * Includes the safety mode on purpose: a validation bug found with writes enabled cannot be
   * reproduced by someone running read-only, and a report that does not say so wastes their time.
   */
  private preconditions(context: RecordContext): string[] {
    const lines = [
      this.config.auth.mode === 'storage-state'
        ? 'Signed in to the application with the automation account.'
        : 'No authentication required.',
      `Application reachable at ${new URL(this.config.startUrl).origin}.`,
    ];
    if (this.config.safety.allowWrites) lines.push('Crawler ran with writes ENABLED (safety.allowWrites = true).');
    if (this.config.safety.allowDestructive) {
      lines.push('Crawler ran with destructive actions ENABLED (safety.allowDestructive = true).');
    }
    if (context.module) lines.push(`Screen under test: ${context.module}.`);
    return lines;
  }

  /** Navigation trail, then whatever the detector says to do once you are there. */
  private steps(context: RecordContext, finding: Finding): string[] {
    const steps = [...context.trail];
    if (steps.length === 0) steps.push(`Open ${context.url}.`);
    for (const extra of finding.extraSteps ?? []) {
      if (!steps.includes(extra)) steps.push(extra);
    }
    return steps.map((step, index) => `${index + 1}. ${step.replace(/^\d+\.\s*/, '')}`);
  }

  /**
   * Evidence for the first sighting only.
   *
   * A screenshot taken on the fifth sighting shows a screen the steps do not lead to, which is
   * worse than no screenshot — so this runs from `record()` before the dedup branch returns.
   */
  private async captureScreenshot(bugId: string, page: Page): Promise<string | null> {
    if (!this.config.captureScreenshots) return null;
    const directory = path.join(this.config.outputDir, 'evidence');
    const file = path.join(directory, `${bugId}.png`);
    try {
      fs.mkdirSync(directory, { recursive: true });
      await page.screenshot({ path: file, fullPage: true, timeout: 10_000 });
      return path.relative(this.config.outputDir, file).replace(/\\/g, '/');
    } catch (error) {
      // Evidence is valuable, but a bug reported without a screenshot is still a bug reported.
      Log.warn(`[crawler] screenshot failed for ${bugId}: ${(error as Error).message}`);
      return null;
    }
  }

  /** Worst first, then by fix order, then by id so a re-run produces a stable diff. */
  all(): Bug[] {
    return [...this.bugs.values()].sort(
      (a, b) =>
        SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
        PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
        b.occurrences - a.occurrences ||
        a.id.localeCompare(b.id),
    );
  }

  countsBySeverity(): Record<Severity, number> {
    const counts: Record<Severity, number> = { Critical: 0, Major: 0, Minor: 0, Trivial: 0 };
    for (const bug of this.bugs.values()) counts[bug.severity] += 1;
    return counts;
  }

  countsByCategory(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const bug of this.bugs.values()) {
      counts[bug.category] = (counts[bug.category] ?? 0) + 1;
    }
    return counts;
  }
}
