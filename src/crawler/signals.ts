/**
 * What the page emitted, attributed to the action that provoked it.
 *
 * The framework already has DiagnosticsCollector, which accumulates console and network noise for
 * a whole test and dumps it on failure. That is the right shape for a test and the wrong one for
 * a crawl: a crawl performs two hundred actions in one page session, and a cumulative buffer
 * means the console error thrown on the first screen is re-reported against every screen after
 * it. So this collector is checkpointed — `drain()` returns what happened since the last drain
 * and resets — and the crawler drains around each action.
 *
 * Filtering happens here rather than in the detectors, so "is this the application's fault?" is
 * decided once, in one place, against the configured ignore lists.
 */

import type { Page } from '@playwright/test';
import type { NetworkNote, PageSignals, ResolvedCrawlerConfig } from './types';

/** Console levels that indicate a defect. `warning` is intentionally excluded — far too noisy. */
const ERROR_LEVELS = new Set(['error']);

/** Per-drain caps, so one page looping an error cannot produce a megabyte of evidence. */
const MAX_PER_KIND = 25;

export class SignalCollector {
  private consoleErrors: string[] = [];
  private pageErrors: string[] = [];
  private networkFailures: NetworkNote[] = [];
  private detached = false;

  private readonly onConsole: (message: { type(): string; text(): string }) => void;
  private readonly onPageError: (error: Error) => void;
  private readonly onResponse: (response: {
    status(): number;
    statusText(): string;
    url(): string;
    request(): { method(): string };
  }) => void;
  private readonly onRequestFailed: (request: {
    url(): string;
    method(): string;
    failure(): { errorText: string } | null;
  }) => void;

  constructor(
    private readonly page: Page,
    private readonly config: ResolvedCrawlerConfig,
  ) {
    this.onConsole = (message) => {
      try {
        if (!ERROR_LEVELS.has(message.type())) return;
        const text = message.text();
        if (this.isIgnoredConsole(text)) return;
        this.push(this.consoleErrors, text.slice(0, 500));
      } catch {
        /* a listener must never throw into Playwright's event loop */
      }
    };

    this.onPageError = (error) => {
      try {
        const text = error.message || String(error);
        if (this.isIgnoredConsole(text)) return;
        this.push(this.pageErrors, text.slice(0, 500));
      } catch {
        /* ignore */
      }
    };

    this.onResponse = (response) => {
      try {
        const status = response.status();
        if (status < 400) return;
        const url = response.url();
        if (this.isIgnoredNetwork(url)) return;
        this.push(this.networkFailures, {
          url,
          method: response.request().method(),
          status,
          statusText: response.statusText(),
        });
      } catch {
        /* ignore */
      }
    };

    this.onRequestFailed = (request) => {
      try {
        const url = request.url();
        if (this.isIgnoredNetwork(url)) return;
        // A navigation the crawler itself abandoned aborts its in-flight requests. Reporting
        // those as failures would blame the application for the crawler's own impatience.
        const errorText = request.failure()?.errorText ?? 'request failed';
        if (/ERR_ABORTED|NS_BINDING_ABORTED|net::ERR_ABORTED/i.test(errorText)) return;
        this.push(this.networkFailures, {
          url,
          method: request.method(),
          status: 0,
          statusText: errorText,
        });
      } catch {
        /* ignore */
      }
    };

    page.on('console', this.onConsole);
    page.on('pageerror', this.onPageError);
    page.on('response', this.onResponse);
    page.on('requestfailed', this.onRequestFailed);
  }

  private push<T>(bucket: T[], value: T): void {
    if (bucket.length < MAX_PER_KIND) bucket.push(value);
  }

  private isIgnoredConsole(text: string): boolean {
    return this.config.consoleIgnorePatterns.some((pattern) => pattern.test(text));
  }

  private isIgnoredNetwork(url: string): boolean {
    return this.config.networkIgnorePatterns.some((pattern) => pattern.test(url));
  }

  /** Everything since the previous drain. Resets, so each action owns its own signals. */
  drain(): PageSignals {
    const signals: PageSignals = {
      consoleErrors: this.consoleErrors,
      pageErrors: this.pageErrors,
      networkFailures: this.networkFailures,
    };
    this.consoleErrors = [];
    this.pageErrors = [];
    this.networkFailures = [];
    return signals;
  }

  /** Throws away anything buffered without reporting it — used across a deliberate reset. */
  reset(): void {
    this.drain();
  }

  dispose(): void {
    if (this.detached) return;
    this.detached = true;
    try {
      this.page.off('console', this.onConsole);
      this.page.off('pageerror', this.onPageError);
      this.page.off('response', this.onResponse);
      this.page.off('requestfailed', this.onRequestFailed);
    } catch {
      /* the page may already be closed */
    }
  }
}

export function emptySignals(): PageSignals {
  return { consoleErrors: [], pageErrors: [], networkFailures: [] };
}

export function mergeSignals(...parts: PageSignals[]): PageSignals {
  return {
    consoleErrors: parts.flatMap((p) => p.consoleErrors),
    pageErrors: parts.flatMap((p) => p.pageErrors),
    networkFailures: parts.flatMap((p) => p.networkFailures),
  };
}

export function hasSignals(signals: PageSignals): boolean {
  return (
    signals.consoleErrors.length > 0 ||
    signals.pageErrors.length > 0 ||
    signals.networkFailures.length > 0
  );
}
