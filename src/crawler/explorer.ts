/**
 * The exploration engine — the part that behaves like a tester rather than like a test.
 *
 * A scripted test knows what it will do before it starts. This does not: it opens a screen, looks
 * at what is actually there, and decides what is worth trying based on what it found. That
 * decision is `rankActions()`, and it encodes how an experienced tester triages an unfamiliar
 * screen — sub-navigation first, because tabs hide whole areas of the application behind one
 * click; then the behavioural controls (sort, paginate, filter, search) because those are where
 * off-by-one and empty-state bugs live; then dialogs; then everything else.
 *
 * Three things keep that from running forever, and all three are needed:
 *
 *   visited URLs        a page is explored once. Keyed on the NORMALIZED url, so a thousand
 *                       records behind /locations/:id/settings is one page, not a thousand.
 *   action fingerprints an action is performed once per page shape. Without this, a sort toggle
 *                       that re-renders the grid is a perfectly good infinite loop.
 *   budgets             pages, actions per page, total actions, depth, and wall-clock. Any one
 *                       of them ending the crawl still produces a complete report.
 *
 * Links are enqueued rather than clicked. Clicking to navigate costs a page load, loses the
 * current screen, and tells you nothing a direct visit does not — so the frontier gets the href
 * and the click budget is spent on controls whose behaviour cannot be predicted from their markup.
 */

import type { Page } from '@playwright/test';
import { Log } from '../utils/logger';
import { BugCollector } from './bug-collector';
import { detectorsForPhase } from './detectors';
import { REF_ATTRIBUTE, refSelector, scanPage } from './discovery';
import { SignalCollector, emptySignals } from './signals';
import { canonicalUrl, isCrawlable, moduleOfUrl, normalizeUrl } from './url-utils';
import { nameMatches, truncate } from './detectors/shared';
import { pickValidValue } from './detectors/forms';
import { describeConfig } from './config';
import type {
  CrawlError,
  CrawlSummary,
  DetectorContext,
  DiscoveredElement,
  PageSignals,
  PageAudit,
  PerformedAction,
  ResolvedCrawlerConfig,
  ScenarioRecord,
  SkippedTarget,
  VisitedPage,
} from './types';

interface Target {
  url: string;
  depth: number;
  /** Reproduction steps that lead here, inherited from whatever enqueued it. */
  trail: string[];
  reachedVia: string;
}

/** Why an action was not attempted. Surfaced in the summary's "could not be tested" list. */
type Policy = { allowed: true } | { allowed: false; reason: string };

/**
 * What a page looked like, cheaply, so "did anything change?" is answerable.
 *
 * `layout` and `markup` exist because the text-only version made a confident, wrong accusation:
 * a sidebar collapse, a tooltip, an expanding panel — anything that changes CSS rather than copy —
 * left `text` and `hash` identical, and the control that did it was reported as dead. A
 * Major-severity claim that a working control does nothing is the most expensive kind of false
 * positive a bug finder can produce, so the signature now also samples where the major regions of
 * the page ARE, and how long its markup is.
 */
interface DomSignature {
  text: number;
  nodes: number;
  hash: number;
  /** Positions and sizes of the page's structural regions — catches a CSS-only reflow. */
  layout: number;
  /** Markup length — catches a class or attribute change that moves no text. */
  markup: number;
  dialogs: number;
}

export class Explorer {
  private readonly startedAt = Date.now();
  private readonly deadline: number;

  private readonly visited = new Set<string>();
  private readonly enqueued = new Set<string>();
  private readonly actionFingerprints = new Set<string>();
  private readonly frontier: Target[] = [];

  private readonly pages: VisitedPage[] = [];
  private readonly actions: PerformedAction[] = [];
  private readonly scenarios: ScenarioRecord[] = [];
  private readonly errors: CrawlError[] = [];
  private readonly notTested: SkippedTarget[] = [];

  private readonly collector: BugCollector;
  private readonly signals: SignalCollector;
  private totalActions = 0;
  private stopReason = 'completed — frontier exhausted';

  constructor(
    private readonly page: Page,
    private readonly config: ResolvedCrawlerConfig,
  ) {
    this.deadline = this.startedAt + config.limits.maxDurationMs;
    this.collector = new BugCollector(config);
    this.signals = new SignalCollector(page, config);
  }

  /* ---------------------------------------------------------------- budgets */

  private outOfTime(): boolean {
    return Date.now() >= this.deadline;
  }

  private budgetExhausted(): string | null {
    if (this.outOfTime()) return `time budget of ${Math.round(this.config.limits.maxDurationMs / 1000)}s reached`;
    if (this.pages.length >= this.config.limits.maxPages) return `page budget of ${this.config.limits.maxPages} reached`;
    if (this.totalActions >= this.config.limits.maxTotalActions) {
      return `action budget of ${this.config.limits.maxTotalActions} reached`;
    }
    return null;
  }

  /* ---------------------------------------------------------------- frontier */

  private enqueue(rawUrl: string, depth: number, trail: string[], reachedVia: string): void {
    if (depth > this.config.limits.maxDepth) return;
    const absolute = canonicalUrl(rawUrl, this.config.startUrl);
    if (!absolute) return;

    const verdict = isCrawlable(absolute, this.config);
    if (!verdict.crawlable) {
      this.noteSkipped(absolute, verdict.reason);
      return;
    }
    const key = normalizeUrl(absolute);
    if (this.visited.has(key) || this.enqueued.has(key)) return;

    this.enqueued.add(key);
    this.frontier.push({ url: absolute, depth, trail, reachedVia });
  }

  /** Deduplicated, and capped — one page linking to 400 records must not fill the report. */
  private noteSkipped(url: string, reason: string): void {
    if (this.notTested.length >= 200) return;
    const key = normalizeUrl(url);
    if (this.notTested.some((entry) => normalizeUrl(entry.url) === key && entry.reason === reason)) return;
    this.notTested.push({ url, reason });
  }

  private noteError(where: string, url: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    Log.warn(`[crawler] ${where} failed on ${url}: ${message}`);
    if (this.errors.length < 100) this.errors.push({ where, url, message: truncate(message, 400) });
  }

  private noteScenario(name: string, url: string, outcome: ScenarioRecord['outcome'], detail: string): void {
    this.scenarios.push({ name, url, outcome, detail: truncate(detail, 300) });
  }

  /* ---------------------------------------------------------------- page mechanics */

  /**
   * Waits for the page to stop moving.
   *
   * `networkidle` alone is unreliable on an application that polls, and a fixed sleep wastes the
   * budget on fast screens; so this takes the earlier of the two and then adds the configured
   * settle, which is what a tester's eye does anyway.
   */
  private async settle(): Promise<void> {
    try {
      await this.page.waitForLoadState('domcontentloaded', { timeout: this.config.limits.navigationTimeoutMs });
    } catch {
      /* a still-loading page is explored as it stands rather than abandoned */
    }
    try {
      await this.page.waitForLoadState('networkidle', { timeout: 5_000 });
    } catch {
      /* polling applications never reach networkidle; the settle below covers them */
    }
    await this.page.waitForTimeout(this.config.limits.settleMs);
  }

  private async domSignature(): Promise<DomSignature> {
    try {
      return await this.page.evaluate(() => {
        const text = document.body?.innerText ?? '';
        // A cheap rolling hash: enough to notice a re-render, far cheaper than shipping the DOM
        // across the bridge on every action.
        let hash = 0;
        const sample = text.slice(0, 8000);
        for (let i = 0; i < sample.length; i += 1) {
          hash = (hash * 31 + sample.charCodeAt(i)) | 0;
        }
        // Popovers and listboxes count too. A component library's open dropdown is an overlay in
        // every way that matters here — it covers the screen and it takes the pointer.
        const dialogs = Array.from(
          document.querySelectorAll(
            '[role="dialog"],[role="alertdialog"],dialog[open],[role="listbox"],[role="menu"],[data-radix-popper-content-wrapper]',
          ),
        ).filter((node) => {
          const rect = node.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        }).length;
        let layout = 0;
        const regions = Array.from(
          document.querySelectorAll('main,aside,nav,header,footer,section,form,table,[role="tabpanel"],[role="dialog"]'),
        ).slice(0, 40);
        for (const region of regions) {
          const rect = region.getBoundingClientRect();
          layout =
            (layout * 31 +
              Math.round(rect.x) +
              Math.round(rect.y) * 7 +
              Math.round(rect.width) * 13 +
              Math.round(rect.height) * 17) |
            0;
        }

        return {
          text: text.length,
          nodes: document.querySelectorAll('*').length,
          hash,
          layout,
          markup: document.body?.innerHTML.length ?? 0,
          dialogs,
        };
      });
    } catch {
      return { text: -1, nodes: -1, hash: 0, layout: 0, markup: 0, dialogs: 0 };
    }
  }

  private static changed(before: DomSignature, after: DomSignature): boolean {
    return (
      before.hash !== after.hash ||
      before.layout !== after.layout ||
      Math.abs(before.nodes - after.nodes) > 2 ||
      Math.abs(before.text - after.text) > 4 ||
      // A small markup delta is React re-rendering identical content; a real class or attribute
      // change moves more than a handful of characters.
      Math.abs(before.markup - after.markup) > 16
    );
  }

  /**
   * Clears anything overlaying the screen before the next action.
   *
   * This is the single most important piece of housekeeping in the engine, and it was learned the
   * hard way: component libraries in the Radix family set `pointer-events: none` on `<body>` while
   * a dropdown or dialog is open, and that inherits to every element under it. One dropdown the
   * crawl opened and never closed therefore made the remaining sixty-odd controls on that screen
   * report as uninteractable — the crawl kept running, kept spending its budget, and never touched
   * the tab it was pointed at.
   *
   * Escape is the only gesture that dismisses such an overlay without submitting anything, which
   * is why it is safe to do unconditionally in read-only mode.
   */
  private async clearOverlays(): Promise<boolean> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const blocked = await this.page
        .evaluate(() => {
          const body = document.body;
          if (!body) return false;
          if (window.getComputedStyle(body).pointerEvents === 'none') return true;
          return Array.from(
            document.querySelectorAll(
              '[role="dialog"],[role="alertdialog"],dialog[open],[role="listbox"],[role="menu"],[data-radix-popper-content-wrapper]',
            ),
          ).some((node) => {
            const rect = node.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          });
        })
        .catch(() => false);

      if (!blocked) return true;
      await this.page.keyboard.press('Escape').catch(() => undefined);
      await this.page.waitForTimeout(250);
    }
    return false;
  }

  /* ---------------------------------------------------------------- safety policy */

  /**
   * Whether the crawler is allowed to touch this control.
   *
   * The order is the point: `neverClickPatterns` wins over every opt-in, because a crawler that
   * signs itself out or starts a 40MB download has ended its own run regardless of what the
   * configuration said it could do.
   */
  private policyFor(element: DiscoveredElement): Policy {
    const { safety } = this.config;

    if (element.disabled) return { allowed: false, reason: 'control is disabled' };
    if (!element.visible) return { allowed: false, reason: 'control is not visible' };
    // An active tab stays active when clicked. That is correct behaviour, it teaches the crawl
    // nothing, and left in it would be filed as a dead control — so it is not clicked at all.
    if (element.selected && (element.kind === 'tab' || element.kind === 'radio' || element.kind === 'menuitem')) {
      return { allowed: false, reason: `${element.kind} is already the selected one` };
    }

    const never = nameMatches(element.name, safety.neverClickPatterns);
    if (never) return { allowed: false, reason: `never-click control ("${never}")` };

    const destructive = nameMatches(element.name, safety.destructiveActionPatterns);
    if (destructive && !safety.allowDestructive) {
      return { allowed: false, reason: `destructive action ("${destructive}") — safety.allowDestructive is off` };
    }

    const write = nameMatches(element.name, safety.writeActionPatterns);
    if (write && !safety.allowWrites) {
      return { allowed: false, reason: `state-changing action ("${write}") — safety.allowWrites is off` };
    }

    // A control that submits its form is state-changing whatever it is called.
    if (element.type === 'submit' && !safety.allowWrites) {
      return { allowed: false, reason: 'submit control — safety.allowWrites is off' };
    }

    return { allowed: true };
  }

  /**
   * What to try on this screen, in the order a tester would try it.
   *
   * Kinds are interleaved rather than exhausted one at a time: pressing all twelve buttons on a
   * screen and never touching its tabs is how an automated crawler produces a deep report about
   * one corner and no report about everything else.
   */
  private rankActions(elements: DiscoveredElement[], pageKey: string): DiscoveredElement[] {
    const priority: Record<string, number> = {
      tab: 0,
      menuitem: 1,
      pagination: 2,
      sort: 3,
      search: 4,
      select: 5,
      checkbox: 6,
      button: 7,
      link: 8,
      input: 9,
      textarea: 9,
      radio: 10,
      form: 99,
      other: 99,
    };

    const candidates = elements
      .filter((element) => element.kind !== 'form' && element.kind !== 'other')
      // Links that carry a real href are explored through the frontier, not by clicking.
      .filter((element) => !(element.kind === 'link' && element.href && !element.href.startsWith('#')))
      .filter((element) => !this.actionFingerprints.has(this.fingerprintFor(pageKey, element)));

    const byKind = new Map<string, DiscoveredElement[]>();
    for (const element of candidates) {
      const list = byKind.get(element.kind) ?? [];
      list.push(element);
      byKind.set(element.kind, list);
    }

    const kinds = [...byKind.keys()].sort((a, b) => (priority[a] ?? 50) - (priority[b] ?? 50));
    const ordered: DiscoveredElement[] = [];

    // Sub-navigation is taken in full before anything else, not one per round. A tab hides a
    // whole screen behind one click, so leaving the second and third tabs until after every
    // button on the first one is how a crawl reports thoroughly on a third of the module. This
    // is what the round-robin below was meant to express and did not.
    for (const kind of ['tab', 'menuitem']) {
      for (const element of byKind.get(kind) ?? []) ordered.push(element);
      byKind.delete(kind);
    }

    let round = 0;
    // Everything else round-robins across kinds: one pagination control, one sort, one button,
    // then the next of each — so the remaining budget buys breadth before it buys depth.
    while (ordered.length < candidates.length && round < 40) {
      let addedThisRound = false;
      for (const kind of kinds) {
        const list = byKind.get(kind);
        const next = list?.[round];
        if (next) {
          ordered.push(next);
          addedThisRound = true;
        }
      }
      if (!addedThisRound) break;
      round += 1;
    }
    return ordered;
  }

  private fingerprintFor(pageKey: string, element: DiscoveredElement): string {
    // Identity is the page shape plus what the control IS, never where it sits: a sort toggle
    // that moves when the grid re-renders is the same control and must not be pressed twice.
    const identity = element.testid || element.name || element.selector;
    return `${pageKey}::${element.kind}::${identity.toLowerCase()}`;
  }

  /* ---------------------------------------------------------------- performing actions */

  /**
   * Can this element actually receive a click, right now?
   *
   * Playwright answers this question too, by waiting — and on a live crawl that answer cost eight
   * seconds per unclickable control and most of the action budget. The checks below are the same
   * ones Playwright's actionability waits on, asked once instead of retried: is it sized, is it
   * painted, does it take pointer events, and is it the element the browser would deliver a click
   * at its own centre to.
   *
   * It reports WHY, which is the part worth having: "covered by <div.overlay>" is a coverage note
   * a reader can act on, where an eight-second timeout is only a shrug.
   */
  private async clickability(
    locator: ReturnType<Page['locator']>,
    timeoutMs = 4_000,
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    const deadline = Date.now() + timeoutMs;
    let last: { ok: true } | { ok: false; reason: string } = { ok: false, reason: 'never checked' };
    // Polled, not asked once. Answering instantly was the whole speed win and also the mistake:
    // a control is routinely unclickable for the second the screen spends loading, and a check
    // with no patience reported an entire settings page as uninteractable. Bounded waiting keeps
    // the win — a genuinely dead control costs this timeout, not Playwright's full one — while
    // still letting a slow screen finish arriving.
    for (;;) {
      last = await this.clickabilityNow(locator);
      if (last.ok || Date.now() >= deadline) return last;
      await this.page.waitForTimeout(250);
    }
  }

  private async clickabilityNow(
    locator: ReturnType<Page['locator']>,
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    try {
      await locator.scrollIntoViewIfNeeded({ timeout: 2_000 });
    } catch {
      /* not scrollable, or already in view — the checks below still answer */
    }
    try {
      const verdict = await locator.evaluate((node: Element) => {
        const rect = node.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return 'rendered at zero size';
        const style = window.getComputedStyle(node);
        if (style.visibility === 'hidden' || style.display === 'none') return 'not visible';
        if (style.pointerEvents === 'none') return 'pointer-events is none';

        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) {
          return 'centre point is outside the viewport';
        }
        const top = document.elementFromPoint(x, y);
        if (!top) return 'nothing is painted at its centre point';
        if (top === node || node.contains(top) || top.contains(node)) return 'ok';

        const classes = (top.getAttribute('class') || '').split(/\s+/)[0];
        return `covered by <${top.tagName.toLowerCase()}${classes ? `.${classes}` : ''}>`;
      }, undefined, { timeout: 3_000 });
      return verdict === 'ok' ? { ok: true } : { ok: false, reason: verdict };
    } catch {
      // Undecidable — hand it to Playwright rather than skip something that might have worked.
      return { ok: true };
    }
  }

  private async performAction(element: DiscoveredElement, pageKey: string): Promise<PerformedAction> {
    const selector = refSelector(element.ref);
    const locator = this.page.locator(selector).first();
    // Whatever the last action left open comes down first, or this one is judged against a
    // screen that cannot take a click.
    await this.clearOverlays();
    const urlBefore = this.page.url();
    const before = await this.domSignature();
    const description = this.describeAction(element);

    const action: PerformedAction = {
      description,
      kind: element.kind,
      elementName: element.name,
      selector: element.selector,
      urlBefore,
      urlAfter: urlBefore,
      fingerprint: this.fingerprintFor(pageKey, element),
      outcome: 'no-effect',
      advertisedHref: element.href && !element.href.startsWith('#') ? element.href : undefined,
      ok: false,
    };

    // A re-render replaces nodes, taking their `data-sdet-ref` stamp with them. Asking whether
    // the ref is still there costs milliseconds; clicking a ref that is gone costs the full
    // action timeout, and on a live application that was burning most of the action budget.
    if ((await locator.count()) === 0) {
      action.ok = false;
      action.outcome = 'failed';
      action.error = 'element is no longer on the page (re-rendered since it was discovered)';
      this.noteSkipped(`${urlBefore} :: ${description}`, action.error);
      return action;
    }

    const clickable = await this.clickability(locator);
    if (!clickable.ok) {
      action.ok = false;
      action.outcome = 'failed';
      action.error = `not interactable: ${clickable.reason}`;
      this.noteSkipped(`${urlBefore} :: ${description}`, action.error);
      return action;
    }

    try {
      switch (element.kind) {
        case 'input':
        case 'textarea':
          await this.fillField(locator, element);
          break;
        case 'search':
          await this.runSearch(locator, element);
          break;
        case 'select':
          await this.openSelect(locator);
          break;
        case 'checkbox':
          await this.toggleAndRestore(locator);
          break;
        default:
          await locator.click({ timeout: this.config.limits.actionTimeoutMs });
          break;
      }
      action.ok = true;
    } catch (error) {
      action.ok = false;
      action.outcome = 'failed';
      action.error = truncate((error as Error).message, 300);
      // A click that times out is usually an overlay or a detached node, not an application
      // defect — so it is an ERROR in the crawl log, not a bug in the report. The detectors
      // decide what is a bug; the engine only reports what it could not do.
      this.noteSkipped(`${urlBefore} :: ${description}`, `interaction failed: ${action.error}`);
      return action;
    }

    await this.settle();
    const after = await this.domSignature();
    action.urlAfter = this.page.url();

    if (normalizeUrl(action.urlAfter) !== normalizeUrl(urlBefore) || action.urlAfter !== urlBefore) {
      action.outcome = 'navigated';
    } else if (after.dialogs > before.dialogs) {
      action.outcome = 'dialog-opened';
    } else if (Explorer.changed(before, after)) {
      action.outcome = 'content-changed';
    } else {
      action.outcome = 'no-effect';
    }

    return action;
  }

  private describeAction(element: DiscoveredElement): string {
    const name = element.name ? `"${truncate(element.name, 60)}"` : `the unnamed ${element.tag}`;
    switch (element.kind) {
      case 'input':
      case 'textarea':
        return `Type a test value into the ${name} field.`;
      case 'search':
        return `Search for a term using ${name}.`;
      case 'select':
        return `Open the ${name} dropdown.`;
      case 'checkbox':
        return `Toggle the ${name} checkbox.`;
      case 'tab':
        return `Open the ${name} tab.`;
      case 'pagination':
        return `Use the ${name} pagination control.`;
      case 'sort':
        return `Sort using ${name}.`;
      default:
        return `Click ${name}.`;
    }
  }

  private async fillField(locator: ReturnType<Page['locator']>, element: DiscoveredElement): Promise<void> {
    const value = pickValidValue(element, this.config.testData.valid);
    await locator.fill(value, { timeout: this.config.limits.actionTimeoutMs });
    await locator.blur({ timeout: 2_000 }).catch(() => undefined);
  }

  /**
   * Searching is a read. Enter is pressed because a filter that only applies on Enter is the
   * common case, and the term is deliberately one that matches nothing — an empty result set is
   * the state most likely to be unhandled, and it changes no data either way.
   */
  private async runSearch(locator: ReturnType<Page['locator']>, element: DiscoveredElement): Promise<void> {
    const term = this.config.testData.valid['search'] ?? 'zzzz-sdet-no-match';
    await locator.fill(term, { timeout: this.config.limits.actionTimeoutMs });
    await locator.press('Enter', { timeout: this.config.limits.actionTimeoutMs });
    this.noteScenario(
      `Search with a term that matches nothing (${truncate(element.name || 'search field', 40)})`,
      this.page.url(),
      'explored',
      `Searched for "${term}" to exercise the empty-result state.`,
    );
  }

  private async openSelect(locator: ReturnType<Page['locator']>): Promise<void> {
    // Opened, not chosen from: picking an option is a value change, which belongs behind
    // allowWrites. Opening is enough to find a dropdown that renders nothing.
    await locator.click({ timeout: this.config.limits.actionTimeoutMs });
    await this.page.waitForTimeout(400);
    // Closed again immediately. The detectors have already seen the opened state in the snapshot
    // taken after this action, and an open dropdown left behind takes the pointer for the whole
    // rest of the screen.
    await this.page.keyboard.press('Escape').catch(() => undefined);
  }

  /** Toggled and put straight back, so a settings form is never left dirty by the crawl. */
  private async toggleAndRestore(locator: ReturnType<Page['locator']>): Promise<void> {
    await locator.click({ timeout: this.config.limits.actionTimeoutMs });
    await this.page.waitForTimeout(200);
    await locator.click({ timeout: this.config.limits.actionTimeoutMs }).catch(() => undefined);
  }

  /**
   * Returns the page to the screen under test after an action moved it.
   *
   * Dialogs are closed with Escape first because it is the one gesture that never submits
   * anything; only if the dialog survives does the crawler fall back to re-navigating, which
   * costs a page load but is guaranteed to work.
   */
  private async restoreTo(url: string, dialogOpened: boolean): Promise<boolean> {
    if (dialogOpened) {
      await this.page.keyboard.press('Escape').catch(() => undefined);
      await this.page.waitForTimeout(300);
      const signature = await this.domSignature();
      if (signature.dialogs === 0) return true;
    }
    if (this.page.url() === url && !dialogOpened) return true;

    try {
      await this.page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: this.config.limits.navigationTimeoutMs,
      });
      await this.settle();
      return true;
    } catch (error) {
      this.noteError('restore-navigation', url, error);
      return false;
    }
  }

  /* ---------------------------------------------------------------- detectors */

  private async runDetectors(
    phase: 'page-load' | 'post-action',
    base: {
      url: string;
      module: string;
      depth: number;
      elements: DiscoveredElement[];
      audit: PageAudit;
      signals: PageSignals;
      action: PerformedAction | null;
      httpStatus: number | null;
      trail: string[];
    },
  ): Promise<number> {
    const context: DetectorContext = {
      page: this.page,
      config: this.config,
      noteUntested: (target, reason) => this.noteSkipped(target, reason),
      ...base,
    };
    let filed = 0;

    for (const detector of detectorsForPhase(this.config.enabledDetectors, phase)) {
      if (this.outOfTime()) break;
      try {
        const findings = await detector.run(context);
        for (const finding of findings) {
          await this.collector.record(finding, {
            page: this.page,
            url: base.url,
            module: base.module,
            trail: base.trail,
          });
          filed += 1;
        }
      } catch (error) {
        // One broken detector must not end the crawl, and must not silently disappear either.
        this.noteError(`detector:${detector.id}`, base.url, error);
      }
    }
    return filed;
  }

  /* ---------------------------------------------------------------- the crawl */

  private async explorePage(target: Target): Promise<void> {
    const pageStart = Date.now();
    const key = normalizeUrl(target.url);
    this.visited.add(key);

    let httpStatus: number | null = null;
    try {
      const response = await this.page.goto(target.url, {
        waitUntil: 'domcontentloaded',
        timeout: this.config.limits.navigationTimeoutMs,
      });
      // `null` for a same-document route change; the status is what lets the crash detector tell
      // "this route does not exist" apart from "this route rendered nothing".
      httpStatus = response ? response.status() : null;
    } catch (error) {
      this.noteError('navigation', target.url, error);
      this.noteSkipped(target.url, `navigation failed: ${truncate((error as Error).message, 160)}`);
      return;
    }
    await this.settle();

    const url = this.page.url();
    const module = moduleOfUrl(url, this.config.startUrl);
    // A page reached by following a link already has "Open <url>" from its parent; repeating
    // it would put the same instruction twice in every reproduction path.
    const openStep = `Open ${url}`;
    const trail = target.trail.at(-1) === openStep ? [...target.trail] : [...target.trail, openStep];
    Log.info(`[crawler] page ${this.pages.length + 1}/${this.config.limits.maxPages} depth=${target.depth} ${module} — ${url}`);

    const snapshot = await scanPage(this.page);
    const loadSignals = this.signals.drain();

    let bugsHere = await this.runDetectors('page-load', {
      url,
      module,
      depth: target.depth,
      elements: snapshot.elements,
      audit: snapshot.audit,
      signals: loadSignals,
      action: null,
      httpStatus,
      trail,
    });

    // Every same-origin href on the page joins the frontier, whether or not it is ever clicked.
    for (const element of snapshot.elements) {
      if (element.kind !== 'link' || !element.href) continue;
      this.enqueue(element.href, target.depth + 1, trail, `link "${truncate(element.name, 50)}"`);
    }

    /* -- interact ---------------------------------------------------- */

    let actionsHere = 0;
    // Tabs already audited as their own view, so re-selecting one does not re-run the page-load
    // pass against it.
    const viewsAudited = new Set<string>();
    let currentElements = snapshot.elements;
    let ranked = this.rankActions(currentElements, key);
    let cursor = 0;

    // Not a `for…of` over a fixed list: an action that re-renders the screen invalidates every
    // element after it in that list, and walking on regardless is what made a live crawl spend
    // most of its action budget waiting out timeouts on nodes that no longer existed. The list
    // is rebuilt from a fresh scan whenever the page changes under it.
    while (cursor < ranked.length) {
      const element = ranked[cursor];
      cursor += 1;
      if (!element) continue;

      if (actionsHere >= this.config.limits.maxActionsPerPage) break;
      const exhausted = this.budgetExhausted();
      if (exhausted) {
        this.stopReason = exhausted;
        break;
      }

      const policy = this.policyFor(element);
      if (!policy.allowed) {
        this.noteSkipped(`${url} :: ${this.describeAction(element)}`, policy.reason);
        continue;
      }

      const fingerprint = this.fingerprintFor(key, element);
      this.actionFingerprints.add(fingerprint);

      const action = await this.performAction(element, key);
      this.actions.push(action);
      this.totalActions += 1;
      actionsHere += 1;

      const actionSignals = this.signals.drain();
      const afterSnapshot =
        action.outcome === 'content-changed' || action.outcome === 'dialog-opened' || action.outcome === 'navigated'
          ? await scanPage(this.page)
          : { elements: snapshot.elements, audit: snapshot.audit };

      bugsHere += await this.runDetectors('post-action', {
        url: this.page.url(),
        module: moduleOfUrl(this.page.url(), this.config.startUrl),
        depth: target.depth,
        elements: afterSnapshot.elements,
        audit: afterSnapshot.audit,
        signals: actionSignals,
        action,
        // An in-page interaction issues no navigation response of its own.
        httpStatus: action.outcome === 'navigated' ? null : httpStatus,
        trail: [...trail, action.description],
      });

      if (action.outcome === 'navigated') {
        this.noteScenario(
          `Navigate via ${action.kind}: ${truncate(action.elementName, 40)}`,
          url,
          'explored',
          `Landed on ${action.urlAfter}`,
        );
        this.enqueue(action.urlAfter, target.depth + 1, [...trail, action.description], action.description);
        if (!(await this.restoreTo(target.url, false))) break;
        // The page was reloaded, so every stamped ref is gone and the ranked list is stale.
        // Re-ranking from a fresh scan would restart the action loop, so this page's remaining
        // interactions are left to a future visit rather than performed against dead refs.
        this.noteSkipped(url, `remaining controls not exercised — "${truncate(action.elementName, 40)}" navigated away`);
        break;
      }

      if (action.outcome === 'dialog-opened') {
        this.noteScenario(
          `Open dialog from ${truncate(action.elementName, 40)}`,
          url,
          'explored',
          'Dialog opened, inspected and dismissed with Escape.',
        );
        // Dismiss and carry on, rather than abandoning the screen. Every popover and dropdown
        // counts as an overlay, so treating one as the end of the page meant a single office
        // switcher could stop a settings screen being explored at all — which is exactly what
        // it did before this.
        if (await this.clearOverlays()) {
          const rescan = await scanPage(this.page);
          currentElements = rescan.elements;
          ranked = this.rankActions(currentElements, key);
          cursor = 0;
          continue;
        }
        // It would not close: the screen is genuinely captured, and only a reload frees it.
        this.noteSkipped(url, 'remaining controls not exercised — a dialog would not dismiss');
        if (!(await this.restoreTo(target.url, true))) break;
        break;
      }

      if (action.outcome === 'content-changed') {
        this.noteScenario(
          `Exercise ${action.kind}: ${truncate(action.elementName, 40)}`,
          url,
          'explored',
          'The screen re-rendered in response.',
        );
        // The screen is not the one the ranking was built from. Re-scan and re-rank; already
        // fingerprinted actions are filtered out, so this continues rather than restarts.
        const rescan = await scanPage(this.page);
        currentElements = rescan.elements;
        ranked = this.rankActions(currentElements, key);
        cursor = 0;

        // A tab is a screen that happens not to change the URL.
        //
        // Without this, every page-load detector — broken links, form validation, labels,
        // accessibility, layout, title — only ever sees whichever tab the application opens on,
        // and the other tabs are crawled with a third of the checks. In an application where a
        // whole grid lives behind tab two, that is most of the surface going unexamined. The
        // signals are deliberately empty: the console and network output of this interaction
        // already belongs to the post-action pass above, and passing it twice would file it twice.
        if ((action.kind === 'tab' || action.kind === 'menuitem') && !viewsAudited.has(action.elementName)) {
          viewsAudited.add(action.elementName);
          const viewModule = action.elementName
            ? `${module} > ${truncate(action.elementName, 40)}`
            : module;
          bugsHere += await this.runDetectors('page-load', {
            url,
            module: viewModule,
            depth: target.depth,
            elements: rescan.elements,
            audit: rescan.audit,
            signals: emptySignals(),
            action: null,
            httpStatus,
            trail: [...trail, action.description],
          });
        }
      }
    }

    this.pages.push({
      url,
      normalizedUrl: key,
      module,
      depth: target.depth,
      title: snapshot.audit.title,
      elementCount: snapshot.elements.length,
      actionsPerformed: actionsHere,
      bugsFound: bugsHere,
      durationMs: Date.now() - pageStart,
      reachedVia: target.reachedVia,
    });
  }

  /**
   * Confirms there is a session before mapping the application.
   *
   * Without this a stale auth state produces a beautifully detailed crawl of the sign-in wall,
   * complete with bugs, and nobody notices until they read it.
   */
  private async verifySignedIn(): Promise<boolean> {
    if (this.config.auth.mode === 'none') return true;
    try {
      await this.page
        .locator(this.config.auth.signedInSelector)
        .first()
        .waitFor({ state: 'visible', timeout: this.config.auth.signedInTimeoutMs });
      return true;
    } catch {
      return false;
    }
  }

  async run(): Promise<CrawlSummary> {
    Log.info(`[crawler] starting at ${this.config.startUrl}`);
    Log.info(
      `[crawler] budgets — pages ${this.config.limits.maxPages}, actions ${this.config.limits.maxTotalActions}, depth ${this.config.limits.maxDepth}, ${Math.round(this.config.limits.maxDurationMs / 1000)}s`,
    );
    Log.info(
      `[crawler] safety — writes ${this.config.safety.allowWrites ? 'ENABLED' : 'disabled'}, destructive ${this.config.safety.allowDestructive ? 'ENABLED' : 'disabled'}`,
    );

    // A dirty form arms beforeunload, and an unhandled dialog wedges the next navigation. The
    // framework's own fixture does this for tests; the crawler owns its page, so it does it here.
    this.page.on('dialog', (dialog) => {
      dialog.accept().catch(() => undefined);
    });

    try {
      await this.page.goto(this.config.startUrl, {
        waitUntil: 'domcontentloaded',
        timeout: this.config.limits.navigationTimeoutMs,
      });
      await this.settle();
    } catch (error) {
      this.noteError('initial-navigation', this.config.startUrl, error);
      this.stopReason = `could not open the start URL: ${truncate((error as Error).message, 200)}`;
      return this.summarize();
    }

    if (!(await this.verifySignedIn())) {
      this.stopReason = `no signed-in session — "${this.config.auth.signedInSelector}" never appeared at ${this.page.url()}`;
      this.noteError('authentication', this.page.url(), new Error(this.stopReason));
      return this.summarize();
    }

    this.signals.reset();
    // The trail starts empty: `explorePage` adds the "Open <url>" step itself, and signing in
    // is a PRECONDITION rather than a step (the collector states it, per the auth mode).
    this.enqueue(this.page.url(), 0, [], 'start URL');

    while (this.frontier.length > 0) {
      const exhausted = this.budgetExhausted();
      if (exhausted) {
        this.stopReason = exhausted;
        break;
      }
      // Breadth first: the frontier is a queue, so depth 1 is finished before depth 2 starts and
      // a shallow budget still produces a map of the whole application rather than one branch.
      const target = this.frontier.shift();
      if (!target) break;
      if (this.visited.has(normalizeUrl(target.url))) continue;

      try {
        await this.explorePage(target);
      } catch (error) {
        this.noteError('explore-page', target.url, error);
      }
    }

    // Anything still queued when the budget ran out is honestly reported as untested rather
    // than quietly dropped — "what did you not look at" is half of an exploratory report.
    for (const target of this.frontier) {
      this.noteSkipped(target.url, 'queued but not reached before the crawl budget ran out');
    }

    return this.summarize();
  }

  private summarize(): CrawlSummary {
    this.signals.dispose();
    const finishedAt = Date.now();
    const bugs = this.collector.all();

    return {
      startedAt: new Date(this.startedAt).toISOString(),
      finishedAt: new Date(finishedAt).toISOString(),
      durationMs: `${Math.round((finishedAt - this.startedAt) / 1000)}s`,
      startUrl: this.config.startUrl,
      configUsed: describeConfig(this.config),
      pagesVisited: this.pages,
      actionsPerformed: this.actions,
      scenarios: this.scenarios,
      bugs,
      errors: this.errors,
      notTested: this.notTested,
      stopReason: this.stopReason,
      totals: {
        pagesVisited: this.pages.length,
        actionsPerformed: this.actions.length,
        scenariosExplored: this.scenarios.length,
        bugsFound: bugs.length,
        findingsBeforeDedup: this.collector.findingCount,
        errors: this.errors.length,
        notTested: this.notTested.length,
        bySeverity: this.collector.countsBySeverity(),
        byCategory: this.collector.countsByCategory(),
      },
    };
  }
}

/** Convenience entry point — build an Explorer and run it. */
export async function runCrawl(page: Page, config: ResolvedCrawlerConfig): Promise<CrawlSummary> {
  return new Explorer(page, config).run();
}

/** Exported for the unit tests, which assert on how the engine names what it did. */
export const CRAWLER_INTERNALS = { REF_ATTRIBUTE, emptySignals };
