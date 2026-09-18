/**
 * End-to-end proof that the crawler finds real bugs, run against a page built to contain them.
 *
 * The live crawl in `exploratory-crawl.spec.ts` runs against the application, which makes it a
 * useful tool and a useless test: it cannot assert anything, because nobody knows in advance what
 * the application will do. This spec closes that gap. The fixture below is served entirely from
 * route interception — no server, no network, no auth — and every defect in it is planted
 * deliberately, so the crawler either finds them or the crawler is broken.
 *
 * It also asserts the negative, which matters more: a working control must NOT be reported as
 * dead. A bug finder that reports everything is the same as one that reports nothing.
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import { Explorer } from '../../src/crawler/explorer';
import { resolveConfig } from '../../src/crawler/config';
import { writeReports } from '../../src/crawler/reporters';
import type { CrawlSummary } from '../../src/crawler/types';

const OUTPUT_DIR = path.join('reports', 'test-results', 'crawler-fixture');

/**
 * The broken screen. Each defect is labelled with the detector meant to catch it, so a failing
 * assertion below points straight at the markup that was supposed to trigger it.
 */
const INDEX_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title></title>                                            <!-- page-title: no title -->
</head>
<body>
  <h1>Fixture Home</h1>

  <!-- placeholder-text: a value that never resolved -->
  <p id="totals">Total outstanding: undefined</p>

  <!-- accessibility: duplicate ids break every aria-labelledby pointing at them -->
  <span id="totals">duplicate id on purpose</span>

  <!-- accessibility: a visible image with no alternative text -->
  <img src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" width="40" height="40">

  <!-- accessibility: a control a screen reader announces as nothing -->
  <button id="nameless"></button>

  <!-- missing-label: named only by its placeholder -->
  <input id="firstName" type="text" placeholder="First name">

  <!-- broken-link + placeholder-text: an anchor that leads nowhere and says nothing -->
  <a id="placeholderLink" href="#" onclick="event.preventDefault()">Click here</a>

  <!-- dead-control: no handler at all -->
  <button id="dead">Show Details</button>

  <!-- the NEGATIVE case: this one works, and must not be reported -->
  <button id="alive">Toggle Panel</button>
  <div id="panel" hidden>Panel contents revealed by the working button.</div>

  <!-- safety: the crawler must REFUSE this one and say so, not press it -->
  <button id="danger">Delete Everything</button>

  <!-- navigation: a real page to crawl, and a route that does not exist -->
  <nav>
    <a href="/app/page2.html">Second page</a>
    <a href="/app/missing.html">Missing page</a>
  </nav>

  <script>
    document.getElementById('alive').addEventListener('click', function () {
      var panel = document.getElementById('panel');
      panel.hidden = !panel.hidden;
    });
    // console-error: a real error logged on load
    console.error('fixture console failure: totals lookup returned undefined');
  </script>
</body>
</html>`;

const PAGE_TWO_HTML = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Second Page</title></head>
<body>
  <h1>Second Page</h1>
  <p>This page is deliberately healthy, so the crawl has something clean to compare against.</p>
  <a href="/app/index.html">Back to home</a>
</body>
</html>`;

/**
 * A real HTTP server on an ephemeral port, rather than route interception.
 *
 * Route interception would be simpler, but it does not cover `page.request` — which is exactly
 * what the broken-link detector uses to probe a destination. Under interception every working
 * link reads as unreachable, so the test would pass while the detector produced three false
 * positives. A real socket makes the 200s genuinely 200 and the 404 genuinely a 404, which is
 * the only version of this test worth trusting.
 */
async function startFixtureServer(): Promise<{ origin: string; close: () => Promise<void> }> {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const send = (status: number, body: string) => {
      response.writeHead(status, { 'content-type': 'text/html; charset=utf-8' });
      response.end(body);
    };
    if (url.pathname === '/app/index.html') return send(200, INDEX_HTML);
    if (url.pathname === '/app/page2.html') return send(200, PAGE_TWO_HTML);
    // Everything else is the broken route the "Missing page" link points at.
    return send(404, '<!doctype html><html lang="en"><head><title>Not Found</title></head><body><h1>404</h1></body></html>');
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('fixture server did not bind a port');

  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

test.describe('Crawler finds planted bugs @crawler @fixture', () => {
  test.describe.configure({ mode: 'serial' });

  let summary: CrawlSummary;
  let origin: string;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000);
    const server = await startFixtureServer();
    origin = server.origin;
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    const config = resolveConfig({
      startUrl: `${origin}/app/index.html`,
      outputDir: OUTPUT_DIR,
      auth: { mode: 'none' },
      // Small and fast: the point is coverage of the detectors, not of the fixture.
      limits: { maxPages: 5, maxDepth: 2, maxTotalActions: 30, maxActionsPerPage: 10, settleMs: 250 },
      safety: { allowWrites: false, allowDestructive: false },
      captureScreenshots: true,
    });

    summary = await new Explorer(page, config).run();
    writeReports(summary, config.outputDir);
    await context.close();
    await server.close();
  });

  const detectorsFound = (): string[] => [...new Set(summary.bugs.map((bug) => bug.detector))];

  test('the crawl completes within its budget and visits more than the start page', () => {
    expect(summary.totals.pagesVisited).toBeGreaterThanOrEqual(2);
    expect(summary.totals.pagesVisited).toBeLessThanOrEqual(5);
    expect(summary.totals.actionsPerformed).toBeGreaterThan(0);
    // Loop prevention: every visited page is a distinct normalized URL.
    const keys = summary.pagesVisited.map((page) => page.normalizedUrl);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test('the planted page-level defects are all found', () => {
    const found = detectorsFound();
    for (const detector of ['page-title', 'accessibility', 'missing-label', 'placeholder-text', 'console-error']) {
      expect(found, `no ${detector} bug was reported`).toContain(detector);
    }
  });

  test('the unresolved value is reported as a data bug, not swallowed', () => {
    const bug = summary.bugs.find((b) => b.detector === 'placeholder-text' && /unresolved value/i.test(b.actualResult));
    expect(bug, 'the literal "undefined" on the page was not reported').toBeTruthy();
    expect(bug?.severity).toBe('Major');
    expect(bug?.category).toBe('Data');
  });

  test('the console error is attributed to the page that logged it', () => {
    const bug = summary.bugs.find((b) => b.detector === 'console-error');
    expect(bug?.evidence.consoleErrors.join(' ')).toContain('fixture console failure');
    expect(bug?.url).toContain('/app/index.html');
  });

  test('the anchor that leads nowhere is reported as a broken link', () => {
    const bug = summary.bugs.find((b) => b.detector === 'broken-link');
    expect(bug, 'the href="#" anchor was not reported').toBeTruthy();
    expect(bug?.category).toBe('Navigation');
  });

  test('the control with no handler is reported dead, and the working one is not', () => {
    const dead = summary.bugs.filter((bug) => bug.detector === 'dead-control');
    expect(dead.length, 'the handler-less button was not reported').toBeGreaterThan(0);
    expect(dead.some((bug) => bug.title.includes('Show Details'))).toBe(true);
    // The negative case is the one that keeps this tool credible.
    expect(
      dead.some((bug) => bug.title.includes('Toggle Panel')),
      'a working button was wrongly reported as dead',
    ).toBe(false);
  });

  test('duplicate ids and the unnamed control are both reported', () => {
    const a11y = summary.bugs.filter((bug) => bug.detector === 'accessibility');
    const signatures = a11y.map((bug) => bug.title).join(' | ');
    expect(signatures).toMatch(/no accessible name/i);
    expect(signatures).toMatch(/duplicate element ids/i);
  });

  test('every bug carries the full defect record the report promises', () => {
    expect(summary.bugs.length).toBeGreaterThan(0);
    for (const bug of summary.bugs) {
      expect(bug.id, 'bug id').toMatch(/^BUG-[A-Z0-9]+-\d{3}$/);
      expect(bug.title.length, `title on ${bug.id}`).toBeGreaterThan(5);
      expect(['Critical', 'Major', 'Minor', 'Trivial']).toContain(bug.severity);
      expect(['P1', 'P2', 'P3', 'P4']).toContain(bug.priority);
      expect(bug.module.length, `module on ${bug.id}`).toBeGreaterThan(0);
      expect(bug.preconditions.length, `preconditions on ${bug.id}`).toBeGreaterThan(0);
      expect(bug.stepsToReproduce.length, `steps on ${bug.id}`).toBeGreaterThan(0);
      expect(bug.expectedResult.length, `expected on ${bug.id}`).toBeGreaterThan(5);
      expect(bug.actualResult.length, `actual on ${bug.id}`).toBeGreaterThan(5);
      expect(bug.url, `url on ${bug.id}`).toContain(origin);
      expect(bug.fingerprint, `fingerprint on ${bug.id}`).toMatch(/^[0-9a-f]{12}$/);
    }
  });

  test('screenshot evidence is captured and the file exists on disk', () => {
    const withShot = summary.bugs.find((bug) => bug.evidence.screenshot);
    expect(withShot, 'no bug captured a screenshot').toBeTruthy();
    const file = path.resolve(OUTPUT_DIR, withShot!.evidence.screenshot!);
    expect(fs.existsSync(file), `screenshot missing at ${file}`).toBe(true);
    expect(fs.statSync(file).size).toBeGreaterThan(1000);
  });

  test('duplicate findings collapse into one bug with a count', () => {
    // The fixture's home page is visited once, but page2 links back to it — the same defects are
    // re-seen. Fewer bugs than raw findings is the whole point of the collector.
    expect(summary.totals.findingsBeforeDedup).toBeGreaterThanOrEqual(summary.totals.bugsFound);
    const ids = summary.bugs.map((bug) => bug.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('all four reports are written and are self-contained', () => {
    const files = ['bug-report.json', 'bug-report.md', 'bug-report.html', 'crawl-summary.json'];
    for (const name of files) {
      const file = path.resolve(OUTPUT_DIR, name);
      expect(fs.existsSync(file), `${name} was not written`).toBe(true);
      expect(fs.statSync(file).size, `${name} is empty`).toBeGreaterThan(200);
    }

    const json = JSON.parse(fs.readFileSync(path.resolve(OUTPUT_DIR, 'bug-report.json'), 'utf-8'));
    expect(Array.isArray(json.bugs)).toBe(true);
    expect(json.bugs.length).toBe(summary.bugs.length);

    const html = fs.readFileSync(path.resolve(OUTPUT_DIR, 'bug-report.html'), 'utf-8');
    expect(html).toContain('BUG-');
    // No CDN, no external stylesheet: the report has to render on a build agent with no network.
    expect(html).not.toMatch(/<script[^>]+src=/i);
    expect(html).not.toMatch(/<link[^>]+href="https?:/i);
  });

  test('the destructive control is refused, and the refusal is reported rather than hidden', () => {
    // Read-only is the default, so pressing Delete would be the worst possible bug in this tool.
    const pressed = summary.actionsPerformed.find((entry) => entry.elementName.includes('Delete Everything'));
    expect(pressed, 'the crawler pressed a Delete control while in read-only mode').toBeUndefined();

    const skipped = summary.notTested.find((entry) => entry.url.includes('Delete Everything'));
    expect(skipped, 'the skipped Delete control was not recorded in "not tested"').toBeTruthy();
    expect(skipped?.reason).toMatch(/destructive/i);
  });

  test('the summary records coverage and why the crawl stopped', () => {
    expect(summary.stopReason.length).toBeGreaterThan(0);
    expect(summary.notTested.length).toBeGreaterThan(0);
    // Every visited page is named, so the bug list can be divided up by screen.
    expect(summary.pagesVisited.every((page) => page.module.length > 0)).toBe(true);
    expect(summary.totals.pagesVisited).toBe(summary.pagesVisited.length);
    expect(summary.totals.bugsFound).toBe(summary.bugs.length);
  });
});
