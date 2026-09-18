/**
 * Does the application go where it says it goes?
 *
 * Three questions, in the order a tester asks them:
 *
 *   broken-link      does this link point anywhere at all, and does that anywhere answer?
 *   dead-control     I pressed it — did anything happen?
 *   unexpected-route I followed it — did I end up where it advertised?
 *
 * `dead-control` is the one worth explaining. A control that silently does nothing is the single
 * most common bug an exploratory tester finds and the hardest for a scripted suite to notice,
 * because a scripted suite only presses controls it already knows work. Catching it needs a
 * before/after comparison of URL, DOM and dialog state, which is why the crawler records an
 * outcome for every action rather than just whether the click threw.
 */

import type { Detector, DetectorContext, Finding, DiscoveredElement } from '../types';
import { canonicalUrl, isCrawlable, normalizeUrl } from '../url-utils';
import { truncate } from './shared';

/** hrefs that are placeholders rather than destinations. */
const PLACEHOLDER_HREFS = new Set(['', '#', '/#', 'javascript:void(0)', 'javascript:void(0);', 'javascript:;']);

/** How many distinct same-origin hrefs are probed per page. Bounded: this costs real requests. */
const MAX_LINK_PROBES = 12;

/** A transport failure is retried once before the destination is called unverified. */
const PROBE_ATTEMPTS = 2;

type ProbeResult =
  | { kind: 'status'; status: number; statusText: string }
  | { kind: 'unreachable'; error: string };

/**
 * Asks the destination whether it is there.
 *
 * Uses the page's own request context so the session cookies go with it — an unauthenticated
 * probe would report the whole application as 401. Retries once on a transport failure, because
 * a reset socket is the network's answer, not the application's.
 */
async function probeDestination(page: DetectorContext['page'], url: string): Promise<ProbeResult> {
  let lastError = 'unknown error';
  for (let attempt = 1; attempt <= PROBE_ATTEMPTS; attempt += 1) {
    try {
      const response = await page.request.get(url, {
        timeout: 10_000,
        failOnStatusCode: false,
        maxRedirects: 5,
      });
      return { kind: 'status', status: response.status(), statusText: response.statusText() };
    } catch (error) {
      lastError = (error as Error).message;
    }
  }
  return { kind: 'unreachable', error: lastError };
}

function isPlaceholderHref(href: string): boolean {
  return PLACEHOLDER_HREFS.has(href.trim().toLowerCase());
}

/**
 * A placeholder href is only a defect on a REAL link.
 *
 * Component libraries routinely render an interactive control as `<a href="#">` with a click
 * handler — a tab, a menu item, a sort toggle. Those work, and reporting them as broken links
 * would bury the handful of anchors that genuinely lead nowhere.
 */
function isRealLink(element: DiscoveredElement): boolean {
  if (element.tag !== 'a') return false;
  const role = element.role;
  return role === '' || role === 'link';
}

export const brokenLinkDetector: Detector = {
  id: 'broken-link',
  description: 'Links that point nowhere, and links whose destination answers 4xx/5xx.',
  phase: 'page-load',
  async run(context: DetectorContext): Promise<Finding[]> {
    const findings: Finding[] = [];
    const { elements, page, config, module, url } = context;

    const links = elements.filter(isRealLink);

    const placeholders = links.filter((link) => isPlaceholderHref(link.href));
    if (placeholders.length > 0) {
      findings.push({
        detector: 'broken-link',
        title: `${placeholders.length} link(s) point nowhere on ${module}`,
        expected: 'A link either carries a real destination, or is a button — not an anchor with a placeholder href.',
        actual: `${placeholders.length} anchor(s) have href "${placeholders[0]?.href || '(empty)'}". First: "${truncate(placeholders[0]?.name ?? '', 60)}"`,
        signature: 'link:placeholder-href',
        severity: 'Minor',
        selector: placeholders[0]?.selector,
        extraSteps: [`Locate the link "${truncate(placeholders[0]?.name ?? '', 60)}" and inspect its href.`],
      });
    }

    // Which destinations are worth a request at all.
    const probed = new Set<string>();
    const targets: Array<{ element: DiscoveredElement; url: string }> = [];
    for (const link of links) {
      if (targets.length >= MAX_LINK_PROBES) break;
      if (isPlaceholderHref(link.href)) continue;
      const absolute = canonicalUrl(link.href, url);
      if (!absolute) continue;
      const verdict = isCrawlable(absolute, config);
      // Only same-origin, non-excluded destinations are probed: the crawler has no business
      // sending requests to third parties, and a download URL answers 200 with a 40MB body.
      if (!verdict.crawlable) continue;
      const key = normalizeUrl(absolute);
      if (probed.has(key)) continue;
      probed.add(key);
      targets.push({ element: link, url: absolute });
    }

    for (const target of targets) {
      const probe = await probeDestination(page, target.url);

      if (probe.kind === 'status') {
        if (probe.status < 400) continue;
        findings.push({
          detector: 'broken-link',
          title: `Link "${truncate(target.element.name, 50)}" leads to ${probe.status}`,
          expected: `Following the link opens its destination successfully.`,
          actual: `${target.url} answered HTTP ${probe.status} ${probe.statusText}.`,
          signature: `link:status:${probe.status}:${normalizeUrl(target.url)}`,
          severity: probe.status >= 500 ? 'Critical' : 'Major',
          selector: target.element.selector,
          networkFailures: [
            { url: target.url, method: 'GET', status: probe.status, statusText: probe.statusText },
          ],
          extraSteps: [`Click the link "${truncate(target.element.name, 60)}".`],
        });
      } else {
        // A probe that never completed observed NOTHING about the destination, so it is not
        // evidence of a broken link. The e2e gateway in front of this application resets probe
        // sockets often enough that reporting these as defects produced confident, wrong bugs —
        // so an unverified destination is recorded as unverified, where a reader can weigh it.
        context.noteUntested(
          target.url,
          `link destination could not be verified after ${PROBE_ATTEMPTS} attempt(s): ${truncate(probe.error, 120)}`,
        );
      }
      if (findings.length >= 6) break;
    }

    return findings;
  },
};

export const deadControlDetector: Detector = {
  id: 'dead-control',
  description: 'A control that neither navigates, opens anything, nor changes the page.',
  phase: 'post-action',
  run(context: DetectorContext): Finding[] {
    const action = context.action;
    if (!action || !action.ok) return [];
    if (action.outcome !== 'no-effect') return [];
    // Typing into a field and having nothing else change is correct behaviour, not a dead
    // control; only things a user PRESSES are expected to produce an effect.
    const pressable = ['button', 'link', 'tab', 'menuitem', 'pagination', 'sort'];
    if (!pressable.includes(action.kind)) return [];

    // An unnamed control has no name to print, and printing its selector reads as a typo. Saying
    // what KIND of thing it is keeps the title readable; the selector is still in the evidence.
    const label = action.elementName
      ? `"${truncate(action.elementName, 50)}"`
      : `An unnamed ${action.kind} (${truncate(action.selector, 40)})`;

    return [
      {
        detector: 'dead-control',
        title: `${label} does nothing when clicked`,
        expected: `Clicking the ${action.kind} navigates, opens something, or changes what is on screen.`,
        actual:
          'After the click the URL is unchanged, no dialog opened, and the page content is byte-identical — the control has no visible effect.',
        signature: `dead:${action.kind}:${action.elementName || action.selector}`,
        severity: 'Major',
        selector: action.selector,
        extraSteps: [action.description, 'Observe that nothing on the page changes.'],
      },
    ];
  },
};

export const unexpectedRouteDetector: Detector = {
  id: 'unexpected-route',
  description: 'Navigation that lands somewhere other than where the control advertised.',
  phase: 'post-action',
  run(context: DetectorContext): Finding[] {
    const action = context.action;
    if (!action || !action.ok || action.outcome !== 'navigated') return [];
    const findings: Finding[] = [];

    // A link that advertises one destination and delivers another is either a broken route or a
    // silent redirect the user cannot predict. Compared normalized, so a trailing slash or a
    // record id in the path is not mistaken for a different destination.
    if (action.advertisedHref) {
      const advertised = canonicalUrl(action.advertisedHref, action.urlBefore);
      if (advertised && normalizeUrl(advertised) !== normalizeUrl(action.urlAfter)) {
        findings.push({
          detector: 'unexpected-route',
          title: `Link "${truncate(action.elementName, 45)}" redirects somewhere else`,
          expected: `Clicking it opens ${truncate(advertised, 100)}, the destination it advertises.`,
          actual: `The browser ended on ${truncate(action.urlAfter, 100)} instead.`,
          signature: `route:mismatch:${normalizeUrl(advertised)}->${normalizeUrl(action.urlAfter)}`,
          severity: 'Minor',
          selector: action.selector,
          extraSteps: [action.description, `Observe the address bar reads ${truncate(action.urlAfter, 80)}.`],
        });
      }
    }

    // Leaving the application entirely from an in-app control is worth flagging even when the
    // destination works — it is almost always an unintended external link or a lost session.
    const verdict = isCrawlable(action.urlAfter, context.config);
    if (!verdict.crawlable && verdict.reason.startsWith('outside the allowed origins')) {
      findings.push({
        detector: 'unexpected-route',
        title: `In-app control navigates off the application`,
        expected: 'An in-application control keeps the user inside the application.',
        actual: `${action.description} left the application and landed on ${truncate(action.urlAfter, 120)}.`,
        signature: `route:offsite:${normalizeUrl(action.urlAfter)}`,
        severity: 'Minor',
        selector: action.selector,
        extraSteps: [action.description],
      });
    }

    return findings;
  },
};
