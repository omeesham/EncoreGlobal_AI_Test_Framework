/**
 * SDET Application Bug Discovery Utility — public surface.
 *
 * `crawlApplication()` is the one call a spec needs: hand it an authenticated page, get back a
 * summary with the reports already on disk. Everything else is exported for tests and for
 * callers that want to assemble the pieces themselves.
 */

import type { Page } from '@playwright/test';
import { Log } from '../utils/logger';
import { resolveConfig } from './config';
import { Explorer } from './explorer';
import { summaryLine, writeReports, type WrittenReports } from './reporters';
import type { CrawlerConfig, CrawlSummary, ResolvedCrawlerConfig } from './types';

export * from './types';
export { resolveConfig, describeConfig, ALL_DETECTORS, CONFIG_FILE } from './config';
export { Explorer, runCrawl } from './explorer';
export { BugCollector, DETECTOR_META, normalizeSignature, fingerprintOf, priorityFor } from './bug-collector';
export { DETECTORS, detectorById, detectorsForPhase } from './detectors';
export { buildMarkdown, buildHtml, writeReports, summaryLine } from './reporters';
export { normalizeUrl, canonicalUrl, moduleOfUrl, isCrawlable, isIdSegment } from './url-utils';
export { scanPage, REF_ATTRIBUTE, refSelector } from './discovery';
export { SignalCollector } from './signals';

export interface CrawlResult {
  summary: CrawlSummary;
  reports: WrittenReports;
  config: ResolvedCrawlerConfig;
}

/**
 * Crawl the application and write the report.
 *
 * The page must already be signed in — reusing the framework's shared auth state rather than
 * driving SSO again is a deliberate boundary: the crawler's job is exploration, and login is a
 * solved problem two modules away in `auth-storage.ts`.
 */
export async function crawlApplication(page: Page, overrides: CrawlerConfig = {}): Promise<CrawlResult> {
  const config = resolveConfig(overrides);
  const summary = await new Explorer(page, config).run();
  const reports = writeReports(summary, config.outputDir);
  Log.info(summaryLine(summary));
  return { summary, reports, config };
}
