/**
 * Is the screen alive, and did it complain?
 *
 * These four detectors are the ones a tester applies without thinking: did the page render, did
 * the console light up, did a request fail, does the tab say what this screen is. They run on
 * every page and after every action, which is why each one is cheap — they read the snapshot and
 * the drained signals, and never touch the page again.
 */

import type { Detector, DetectorContext, Finding, NetworkNote } from '../types';
import { NOT_FOUND_PATTERNS } from '../discovery';
import { looksBlank, truncate } from './shared';

/** Console text that names the failing module, so two different errors never collapse into one. */
function errorSignature(text: string): string {
  return truncate(text.split('\n')[0] ?? text, 160);
}

export const pageCrashDetector: Detector = {
  id: 'page-crash',
  description: 'The screen rendered a crash banner, a stack trace, or nothing at all.',
  phase: 'both',
  run(context: DetectorContext): Finding[] {
    const findings: Finding[] = [];
    const { audit, elements } = context;

    for (const banner of audit.crashBanners) {
      findings.push({
        detector: 'page-crash',
        title: `Application error shown on ${context.module}`,
        expected: 'The screen renders its content, or a handled empty state explaining what to do next.',
        actual: `The page displays "${banner}", which is an unhandled application error rather than a designed state.`,
        signature: `crash:${banner}`,
        severity: 'Critical',
        extraSteps: [`Observe the message "${banner}" on the page.`],
      });
    }

    // A route the server refused is a broken route, not a broken render. Reported that way and
    // ONLY that way: the emptiness checks below would otherwise file a second, wronger bug about
    // the same page, because a 404 screen being sparse is exactly what a 404 screen should be.
    const status = context.httpStatus;
    if (status !== null && status >= 400) {
      findings.push({
        detector: 'page-crash',
        title: `Route reachable from the application answers HTTP ${status}`,
        expected: 'Every route the application links to is served successfully.',
        actual: `Opening ${context.url} returned HTTP ${status}, so the application offers a link it cannot serve.`,
        signature: `crash:http-status:${status}`,
        severity: status >= 500 ? 'Critical' : 'Major',
      });
      return findings;
    }

    // Past this point the server said the route is fine, so anything missing is the render's
    // fault. The crawler only reaches routes the application itself linked to, so a blank one
    // is a defect rather than a user mistyping an address.
    const notFound = NOT_FOUND_PATTERNS.find(
      (phrase) =>
        audit.title.toLowerCase().includes(phrase.toLowerCase()) ||
        audit.crashBanners.some((banner) => banner.toLowerCase() === phrase.toLowerCase()),
    );
    if (notFound) {
      findings.push({
        detector: 'page-crash',
        title: `Route answers 200 but renders "${notFound}"`,
        expected: 'A route the application links to opens a working screen.',
        actual: `The page reports "${notFound}" (title: "${audit.title}") while the server answered successfully — a soft 404.`,
        signature: `crash:soft-not-found:${notFound}`,
        severity: 'Major',
        extraSteps: context.action ? [context.action.description] : [],
      });
      return findings;
    }

    if (looksBlank(audit.bodyTextLength, elements.length)) {
      findings.push({
        detector: 'page-crash',
        title: `Blank page rendered for ${context.module}`,
        expected: 'A route reachable from the application renders content.',
        actual: `The page body holds ${audit.bodyTextLength} characters of text and ${elements.length} interactive element(s) — effectively nothing.`,
        signature: 'crash:blank-render',
        severity: 'Critical',
      });
    }

    return findings;
  },
};

export const consoleErrorDetector: Detector = {
  id: 'console-error',
  description: 'The page logged an uncaught error or a console error while it was being used.',
  phase: 'both',
  run(context: DetectorContext): Finding[] {
    const { signals, action } = context;
    const findings: Finding[] = [];

    // Uncaught exceptions first and separately: a `pageerror` is a thrown exception that
    // escaped the application, which is categorically worse than something it chose to log.
    for (const error of signals.pageErrors.slice(0, 5)) {
      findings.push({
        detector: 'console-error',
        title: `Uncaught exception: ${truncate(errorSignature(error), 80)}`,
        expected: 'Using the screen raises no uncaught JavaScript exception.',
        actual: `The page threw: ${truncate(error, 400)}`,
        signature: `pageerror:${errorSignature(error)}`,
        severity: 'Major',
        consoleErrors: [error],
        extraSteps: action ? [action.description] : [],
      });
    }

    for (const error of signals.consoleErrors.slice(0, 5)) {
      findings.push({
        detector: 'console-error',
        title: `Console error: ${truncate(errorSignature(error), 80)}`,
        expected: 'The browser console stays clean while the screen is used.',
        actual: `The console logged: ${truncate(error, 400)}`,
        signature: `console:${errorSignature(error)}`,
        severity: 'Minor',
        consoleErrors: [error],
        extraSteps: action ? [action.description] : [],
      });
    }

    return findings;
  },
};

/** 5xx is the server breaking; 4xx from the app's own calls is the app asking wrongly. */
function severityForStatus(status: number): 'Critical' | 'Major' | 'Minor' {
  if (status >= 500) return 'Critical';
  if (status === 0) return 'Major';
  if (status === 401 || status === 403) return 'Major';
  if (status >= 400) return 'Major';
  return 'Minor';
}

function describeNetwork(note: NetworkNote): string {
  const status = note.status === 0 ? note.statusText : `${note.status} ${note.statusText}`.trim();
  return `${note.method} ${truncate(note.url, 160)} -> ${status}`;
}

export const networkFailureDetector: Detector = {
  id: 'network-failure',
  description: 'A request the screen made failed, or answered 4xx/5xx.',
  phase: 'both',
  run(context: DetectorContext): Finding[] {
    const seen = new Set<string>();
    const findings: Finding[] = [];

    for (const note of context.signals.networkFailures) {
      // One endpoint answering 500 forty times is one defect. Path-and-status is the identity;
      // the query string is not, or every paged request reads as its own bug.
      let endpoint = note.url;
      try {
        const parsed = new URL(note.url);
        endpoint = `${parsed.origin}${parsed.pathname}`;
      } catch {
        /* keep the raw URL */
      }
      const key = `${note.method} ${endpoint} ${note.status}`;
      if (seen.has(key)) continue;
      seen.add(key);

      findings.push({
        detector: 'network-failure',
        title: `Request failed: ${note.status || 'network error'} on ${truncate(endpoint, 70)}`,
        expected: 'Every request the screen makes succeeds, or the screen handles the failure visibly.',
        actual: describeNetwork(note),
        signature: `net:${key}`,
        severity: severityForStatus(note.status),
        networkFailures: [note],
        extraSteps: context.action ? [context.action.description] : [],
      });
      if (findings.length >= 5) break;
    }

    return findings;
  },
};

export const pageTitleDetector: Detector = {
  id: 'page-title',
  description: 'The browser tab names the screen.',
  phase: 'page-load',
  run(context: DetectorContext): Finding[] {
    const title = context.audit.title;
    if (title && title.length >= 3 && !/^(untitled|document|react app|index)$/i.test(title)) {
      return [];
    }
    return [
      {
        detector: 'page-title',
        title: `Screen has no meaningful page title (${context.module})`,
        expected: 'Every screen sets a <title> naming it, so tabs, history and bookmarks are usable.',
        actual: title ? `The title is "${title}", which names no screen.` : 'The page sets no <title> at all.',
        signature: `title:${title || 'missing'}`,
        severity: 'Trivial',
      },
    ];
  },
};
