/**
 * The exploratory crawl against the live application.
 *
 * This is the tool, not a test of the tool — it has no fixed expectations, because the whole
 * premise is that nobody knows in advance what it will find. What it DOES assert is that the
 * crawl itself was valid: a session existed, pages were reached, and the report was written. A
 * crawl that quietly mapped a sign-in wall and reported "no bugs" would otherwise look like good
 * news, which is the most dangerous output this utility could produce.
 *
 * Run it:
 *   npm run crawl                          default budgets, read-only
 *   npm run crawl:deep                     more pages, more actions
 *   CRAWLER_START_URL=... npm run crawl    one screen and everything it links to
 *
 * It is NOT part of `npm test`: it lives in its own Playwright project so a suite run never
 * spends fifteen minutes crawling. See playwright.config.ts, project `crawler`.
 */

import { test, expect } from '@playwright/test';
import { about, attachNote, phase, verify } from '../../src/fixtures/report-steps';
import { crawlApplication } from '../../src/crawler';
import { summaryLine } from '../../src/crawler/reporters';
import { Log } from '../../src/utils/logger';

test.describe('SDET exploratory crawl @crawler @exploratory', () => {
  test('Crawl the application and report every bug found', async ({ page }) => {
    await about(
      'Explore the application the way a tester would — open what is there, interact with it, and ' +
        'report anything that looks wrong — then write the bug report and the coverage summary.',
    );

    // The crawl owns its own wall-clock budget (limits.maxDurationMs), so the test timeout only
    // needs to be comfortably larger; the crawl stops itself and still writes a full report.
    const budgetMs = Number(process.env.CRAWLER_MAX_DURATION_MS ?? 15 * 60 * 1000);
    test.setTimeout(budgetMs + 5 * 60 * 1000);

    const { summary, reports, config } = await phase('Crawl the application', () =>
      crawlApplication(page, {
        startUrl: process.env.CRAWLER_START_URL || process.env.BASE_URL,
        // The application renders its screen name as an h1; its presence is what proves the
        // shared auth state is live rather than parked on a sign-in page.
        auth: { signedInSelector: 'h1', signedInTimeoutMs: 90_000 },
      }),
    );

    Log.info(summaryLine(summary));

    await attachNote('Crawl summary', JSON.stringify(summary.totals, null, 2));
    await attachNote(
      'Coverage — pages visited',
      summary.pagesVisited
        .map((visited, index) => `${index + 1}. [${visited.module}] ${visited.url} — ${visited.actionsPerformed} action(s), ${visited.bugsFound} bug(s)`)
        .join('\n') || '(none)',
    );
    await attachNote(
      'Bugs found',
      summary.bugs
        .map((bug) => `${bug.id} [${bug.severity}/${bug.priority}] ${bug.module} — ${bug.title}\n    ${bug.url}`)
        .join('\n\n') || '(none)',
    );
    await attachNote(
      'Not tested',
      summary.notTested.map((skipped) => `${skipped.url}\n    ${skipped.reason}`).join('\n') || '(none)',
    );

    // The only real assertion: the crawl was VALID. A crawl that reached nothing has not found
    // "no bugs" — it has found nothing, and must fail rather than read as a clean bill of health.
    await verify('Check the crawl actually reached the application and covered ground', async () => {
      expect(
        summary.totals.pagesVisited,
        `no page was crawled — stopped because: ${summary.stopReason}`,
      ).toBeGreaterThan(0);
      expect(
        summary.totals.actionsPerformed,
        'no interaction was performed — the crawler found nothing it was allowed to touch',
      ).toBeGreaterThan(0);
    });

    await verify('Check the bug report and coverage summary were written', async () => {
      const fs = await import('fs');
      for (const file of [reports.json, reports.markdown, reports.html, reports.summaryJson]) {
        expect(fs.existsSync(file), `report not written: ${file}`).toBe(true);
      }
    });

    // Findings are reported, never thrown: this spec's job is to produce the report, and failing
    // it on a discovered bug would stop the report being written for the bugs after it.
    await verify('Report what the crawl found (informational — findings do not fail this run)', async () => {
      const { Critical, Major, Minor, Trivial } = summary.totals.bySeverity;
      Log.info(
        `[crawler] severity — critical ${Critical}, major ${Major}, minor ${Minor}, trivial ${Trivial}`,
      );
      Log.info(`[crawler] reports under ${config.outputDir}`);
      expect(summary.totals.bugsFound).toBeGreaterThanOrEqual(0);
    });
  });
});
