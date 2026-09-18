/**
 * Unit tests for the crawler's decision-making.
 *
 * Everything here is the logic that decides what a crawl DOES and what it REPORTS — URL identity,
 * safety policy, bug identity, ranking, report rendering. It runs with no browser and no
 * application, so it stays fast enough to run on every change, which is the only way logic this
 * central stays trustworthy.
 *
 * The live behaviour is covered separately: `crawler-fixture.spec.ts` drives a real browser
 * against a deliberately broken page, and `exploratory-crawl.spec.ts` runs against the
 * application itself.
 */

import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import * as path from 'path';
import {
  normalizeUrl,
  canonicalUrl,
  moduleOfUrl,
  isCrawlable,
  isIdSegment,
} from '../../src/crawler/url-utils';
import { resolveConfig, describeConfig, ALL_DETECTORS } from '../../src/crawler/config';
import {
  BugCollector,
  DETECTOR_META,
  fingerprintOf,
  normalizeSignature,
  priorityFor,
} from '../../src/crawler/bug-collector';
import { DETECTORS, detectorsForPhase, nameMatches } from '../../src/crawler/detectors';
import { buildHtml, buildMarkdown } from '../../src/crawler/reporters';
import { mustReject, pickValidValue } from '../../src/crawler/detectors/forms';
import type {
  CrawlSummary,
  DetectorContext,
  DiscoveredElement,
  Finding,
  PageAudit,
  PerformedAction,
  ResolvedCrawlerConfig,
} from '../../src/crawler/types';
import { emptySignals } from '../../src/crawler/signals';
import { emptyAudit } from '../../src/crawler/discovery';
import { pageCrashDetector, consoleErrorDetector, networkFailureDetector } from '../../src/crawler/detectors/page-health';
import { placeholderTextDetector } from '../../src/crawler/detectors/content';
import { deadControlDetector, unexpectedRouteDetector } from '../../src/crawler/detectors/navigation';
import { accessibilityDetector, missingLabelDetector } from '../../src/crawler/detectors/accessibility';

const BASE = 'https://app.example.com/navigator/';

/** A config built without touching the environment, so these tests never depend on .env. */
function testConfig(overrides: Parameters<typeof resolveConfig>[0] = {}): ResolvedCrawlerConfig {
  return resolveConfig({ startUrl: BASE, outputDir: 'reports/test-results/crawler-unit', ...overrides });
}

function element(overrides: Partial<DiscoveredElement> = {}): DiscoveredElement {
  return {
    ref: 'e0',
    kind: 'button',
    tag: 'button',
    role: '',
    name: 'Do a thing',
    testid: '',
    href: '',
    type: '',
    value: '',
    placeholder: '',
    disabled: false,
    required: false,
    selected: false,
    visible: true,
    box: { x: 0, y: 0, w: 100, h: 30 },
    selector: 'button',
    labelled: true,
    formRef: '',
    ...overrides,
  };
}

function context(overrides: Partial<DetectorContext> = {}): DetectorContext {
  return {
    page: {} as Page,
    url: `${BASE}locations/1604/settings`,
    module: 'Locations > Settings',
    depth: 1,
    elements: [],
    audit: emptyAudit(),
    signals: emptySignals(),
    action: null,
    httpStatus: 200,
    config: testConfig(),
    trail: ['Open the application'],
    noteUntested: () => undefined,
    ...overrides,
  };
}

function audit(overrides: Partial<PageAudit> = {}): PageAudit {
  return { ...emptyAudit(), bodyTextLength: 500, title: 'Locations', ...overrides };
}

function action(overrides: Partial<PerformedAction> = {}): PerformedAction {
  return {
    description: 'Click "Save Draft".',
    kind: 'button',
    elementName: 'Save Draft',
    selector: 'button#save',
    urlBefore: `${BASE}a`,
    urlAfter: `${BASE}a`,
    fingerprint: 'fp',
    outcome: 'no-effect',
    ok: true,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ URL identity */

test.describe('URL identity and loop prevention @crawler @unit', () => {
  test('a record id in the path is not part of a page identity', () => {
    // The whole defence against an infinite crawl: one settings screen, not one per record.
    expect(normalizeUrl(`${BASE}locations/1604/settings`)).toBe(
      normalizeUrl(`${BASE}locations/9981/settings`),
    );
    expect(normalizeUrl(`${BASE}locations/1604/settings`)).not.toBe(
      normalizeUrl(`${BASE}locations/1604/history`),
    );
  });

  test('GUIDs and opaque tokens count as ids; route names do not', () => {
    expect(isIdSegment('1604')).toBe(true);
    expect(isIdSegment('3f2504e0-4f89-11d3-9a0c-0305e82c3301')).toBe(true);
    expect(isIdSegment('local-office')).toBe(false);
    expect(isIdSegment('settings')).toBe(false);
  });

  test('volatile query parameters are dropped and the rest are order-insensitive', () => {
    expect(normalizeUrl(`${BASE}search?tab=notes&_=1699999999`)).toBe(
      normalizeUrl(`${BASE}search?tab=legal`),
    );
    expect(normalizeUrl(`${BASE}s?b=1&a=2`)).toBe(normalizeUrl(`${BASE}s?a=9&b=9`));
  });

  test('a hash route is part of the path, a plain fragment is not', () => {
    expect(normalizeUrl(`${BASE}app#/reports`)).not.toBe(normalizeUrl(`${BASE}app#/settings`));
    expect(normalizeUrl(`${BASE}app#section-2`)).toBe(normalizeUrl(`${BASE}app#section-9`));
  });

  test('canonicalUrl resolves relative hrefs and rejects non-http schemes', () => {
    expect(canonicalUrl('../legal', `${BASE}locations/1604/settings`)).toBe(
      'https://app.example.com/navigator/locations/legal',
    );
    expect(canonicalUrl('mailto:a@b.com', BASE)).toBeNull();
    expect(canonicalUrl('javascript:void(0)', BASE)).toBeNull();
  });

  test('the module name drops the mount path and the record ids', () => {
    expect(moduleOfUrl(`${BASE}locations/1604/settings/local-office`, BASE)).toBe(
      'Locations > Settings > Local Office',
    );
    expect(moduleOfUrl('https://app.example.com/', 'https://app.example.com/')).toBe('Home');
    // The application's own mount segment is the only name the root screen has.
    expect(moduleOfUrl(BASE, BASE)).toBe('Navigator');
  });

  test('a crawl started deep still names its screens, instead of calling them all Home', () => {
    // The start path IS the whole URL here, so stripping the "mount path" strips everything.
    const deep = `${BASE}locations/1604/settings/local-office`;
    expect(moduleOfUrl(deep, deep)).toBe('Local Office');
    expect(moduleOfUrl(`${BASE}locations/1604/settings/ect`, deep)).toBe('Ect');
  });

  test('crawlability is origin, then include, then exclude — and exclude wins', () => {
    const config = testConfig({
      includeUrlPatterns: ['/locations/'],
      excludeUrlPatterns: ['/locations/secret'],
    });
    expect(isCrawlable(`${BASE}locations/1`, config).crawlable).toBe(true);
    expect(isCrawlable(`${BASE}pricing`, config).crawlable).toBe(false);
    expect(isCrawlable(`${BASE}locations/secret`, config).crawlable).toBe(false);
    expect(isCrawlable('https://elsewhere.test/locations/1', config).crawlable).toBe(false);
  });

  test('sign-out and binary downloads are excluded by default', () => {
    const config = testConfig();
    expect(isCrawlable(`${BASE}api/auth/signout`, config).crawlable).toBe(false);
    expect(isCrawlable(`${BASE}files/report.xlsx`, config).crawlable).toBe(false);
    expect(isCrawlable('https://login.microsoftonline.com/x', config).crawlable).toBe(false);
  });
});

/* ------------------------------------------------------------------ configuration */

test.describe('Configuration @crawler @unit', () => {
  test('defaults are read-only and every detector is on', () => {
    const config = testConfig();
    expect(config.safety.allowWrites).toBe(false);
    expect(config.safety.allowDestructive).toBe(false);
    expect(config.enabledDetectors).toEqual(ALL_DETECTORS);
    expect(config.allowedOrigins).toEqual(['https://app.example.com']);
  });

  test('detectors can be narrowed and disabled, and a typo is rejected loudly', () => {
    expect(testConfig({ detectors: { only: ['layout', 'page-title'] } }).enabledDetectors).toEqual([
      'layout',
      'page-title',
    ]);
    expect(testConfig({ detectors: { disabled: ['layout'] } }).enabledDetectors).not.toContain('layout');
    // A silently ignored detector name means a crawl that quietly checked less than it was told to.
    expect(() => testConfig({ detectors: { only: ['lay-out' as never] } })).toThrow(/Unknown detector/);
  });

  test('a missing or malformed start URL is refused rather than guessed at', () => {
    expect(() => resolveConfig({ startUrl: 'not a url' })).toThrow(/not a valid URL/);
  });

  test('describeConfig turns the regexes back into strings and keeps no secrets', () => {
    const described = describeConfig(testConfig());
    expect(Array.isArray(described['excludeUrlPatterns'])).toBe(true);
    expect(JSON.stringify(described)).not.toMatch(/password|api[_-]?key/i);
  });

  test('every detector in the registry has metadata and a unique id', () => {
    const ids = DETECTORS.map((detector) => detector.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.sort()).toEqual([...ALL_DETECTORS].sort());
    for (const id of ALL_DETECTORS) expect(DETECTOR_META[id]).toBeTruthy();
  });

  test('phase filtering puts "both" detectors in each phase and honours the enabled list', () => {
    const onLoad = detectorsForPhase(ALL_DETECTORS, 'page-load').map((d) => d.id);
    const afterAction = detectorsForPhase(ALL_DETECTORS, 'post-action').map((d) => d.id);
    expect(onLoad).toContain('console-error'); // phase: both
    expect(afterAction).toContain('console-error');
    expect(onLoad).toContain('broken-link'); // phase: page-load only
    expect(afterAction).not.toContain('broken-link');
    expect(detectorsForPhase(['layout'], 'page-load').map((d) => d.id)).toEqual(['layout']);
  });
});

/* ------------------------------------------------------------------ bug identity */

test.describe('Bug identity, severity and deduplication @crawler @unit', () => {
  test('numbers, dates and GUIDs are folded out of a signature; words are not', () => {
    expect(normalizeSignature('row 4 failed')).toBe(normalizeSignature('row 91 failed'));
    expect(normalizeSignature('sort by Name failed')).not.toBe(normalizeSignature('sort by Date failed'));
    expect(normalizeSignature('id 3f2504e0-4f89-11d3-9a0c-0305e82c3301')).toBe(
      normalizeSignature('id 8a1104e0-1f19-01d3-1a0c-1305e82c9901'),
    );
  });

  test('the same signature from two detectors is two different bugs', () => {
    expect(fingerprintOf('layout', 'x')).not.toBe(fingerprintOf('accessibility', 'x'));
  });

  test('priority rises with reach, not just with severity', () => {
    expect(priorityFor('Critical', 1)).toBe('P1');
    expect(priorityFor('Major', 1)).toBe('P2');
    expect(priorityFor('Major', 3)).toBe('P1'); // the same defect on three screens is urgent
    expect(priorityFor('Minor', 1)).toBe('P3');
    expect(priorityFor('Minor', 5)).toBe('P2');
    expect(priorityFor('Trivial', 1)).toBe('P4');
  });

  test('a repeat sighting updates one bug instead of filing a second', async () => {
    const collector = new BugCollector(testConfig({ captureScreenshots: false }));
    const finding: Finding = {
      detector: 'layout',
      title: 'Page scrolls sideways',
      expected: 'fits',
      actual: 'overflows by 40px',
      signature: 'layout:horizontal-overflow',
    };

    const first = await collector.record(finding, { page: {} as Page, url: `${BASE}a`, module: 'A', trail: [] });
    await collector.record(finding, { page: {} as Page, url: `${BASE}b`, module: 'B', trail: [] });
    await collector.record({ ...finding, actual: 'overflows by 91px' }, {
      page: {} as Page,
      url: `${BASE}c`,
      module: 'C',
      trail: [],
    });

    expect(collector.all()).toHaveLength(1);
    expect(collector.findingCount).toBe(3);
    expect(first.occurrences).toBe(3);
    expect(first.alsoSeenOn).toEqual([`B — ${BASE}b`, `C — ${BASE}c`]);
    // Reach promoted it: Minor seen once is P3, seen three times it is still P3, five times P2.
    expect(first.priority).toBe('P3');
  });

  test('the same defect on two tabs of one URL records both views, not one', async () => {
    // Tabs share a URL. Recording only the URL would say "seen twice" and point at one place.
    const collector = new BugCollector(testConfig({ captureScreenshots: false }));
    const finding: Finding = {
      detector: 'missing-label',
      title: 'Unlabelled controls',
      expected: 'labelled',
      actual: '28 unlabelled',
      signature: 'a11y:unlabelled-fields',
    };
    const url = `${BASE}locations/1604/settings/local-office`;
    const bug = await collector.record(finding, { page: {} as Page, url, module: 'Local Office', trail: [] });
    await collector.record(finding, {
      page: {} as Page,
      url,
      module: 'Local Office > Location Settings History',
      trail: [],
    });

    expect(collector.all()).toHaveLength(1);
    expect(bug.occurrences).toBe(2);
    expect(bug.alsoSeenOn).toEqual([`Local Office > Location Settings History — ${url}`]);
  });

  test('bug ids are per-detector and sequential, and bugs sort worst-first', async () => {
    const collector = new BugCollector(testConfig({ captureScreenshots: false }));
    const record = (detector: Finding['detector'], signature: string, severity: Finding['severity']) =>
      collector.record(
        { detector, title: `${detector} ${signature}`, expected: 'e', actual: 'a', signature, severity },
        { page: {} as Page, url: BASE, module: 'M', trail: [] },
      );

    await record('layout', 'one', 'Minor');
    await record('layout', 'two', 'Trivial');
    await record('page-crash', 'boom', 'Critical');

    const all = collector.all();
    expect(all[0]?.severity).toBe('Critical');
    expect(all.map((bug) => bug.id)).toEqual(['BUG-CRASH-001', 'BUG-LAYOUT-001', 'BUG-LAYOUT-002']);
  });

  test('preconditions record the safety mode the run used', async () => {
    const collector = new BugCollector(testConfig({ captureScreenshots: false, safety: { allowWrites: true } }));
    const bug = await collector.record(
      { detector: 'layout', title: 't', expected: 'e', actual: 'a', signature: 's' },
      { page: {} as Page, url: BASE, module: 'M', trail: ['Open the app'] },
    );
    expect(bug.preconditions.join(' ')).toMatch(/writes ENABLED/);
    expect(bug.stepsToReproduce[0]).toBe('1. Open the app');
  });
});

/* ------------------------------------------------------------------ safety */

test.describe('Safety rules @crawler @unit', () => {
  test('action names match as whole words, so "Saved searches" is not a Save', () => {
    const config = testConfig();
    expect(nameMatches('Save', config.safety.writeActionPatterns)).toBe('save');
    expect(nameMatches('Save changes', config.safety.writeActionPatterns)).toBe('save');
    expect(nameMatches('Saved searches', config.safety.writeActionPatterns)).toBeNull();
    expect(nameMatches('Delete row', config.safety.destructiveActionPatterns)).toBe('delete');
    expect(nameMatches('Undeleted items', config.safety.destructiveActionPatterns)).toBeNull();
  });

  test('sign-out and download are never-click regardless of the opt-ins', () => {
    const config = testConfig({ safety: { allowWrites: true, allowDestructive: true } });
    expect(nameMatches('Sign out', config.safety.neverClickPatterns)).toBeTruthy();
    expect(nameMatches('Export', config.safety.neverClickPatterns)).toBeTruthy();
  });

  test('a value is only asserted invalid where the field type makes it certain', () => {
    expect(mustReject(element({ type: 'number' }), 'not-a-number')).toBe(true);
    expect(mustReject(element({ type: 'number' }), '-1')).toBe(false); // negative is a business rule
    expect(mustReject(element({ type: 'email' }), 'nope')).toBe(true);
    expect(mustReject(element({ type: 'text' }), '<script>')).toBe(false); // free text may allow it
  });

  test('test data is chosen from what the field appears to be for', () => {
    const table = testConfig().testData.valid;
    expect(pickValidValue(element({ name: 'Email address', type: 'email' }), table)).toContain('@');
    expect(pickValidValue(element({ name: 'Effective Date', type: 'text' }), table)).toBe(table['date']);
    expect(pickValidValue(element({ name: 'Mystery field' }), table)).toBe(table['default']);
  });
});

/* ------------------------------------------------------------------ detector judgement */

test.describe('Detector judgement @crawler @unit', () => {
  test('a crash banner is Critical and a blank render is Critical', async () => {
    const withBanner = await pageCrashDetector.run(
      context({ audit: audit({ crashBanners: ['Something went wrong'] }) }),
    );
    expect(withBanner).toHaveLength(1);
    expect(withBanner[0]?.severity).toBe('Critical');

    const blank = await pageCrashDetector.run(context({ audit: audit({ bodyTextLength: 5 }), elements: [] }));
    expect(blank.map((f) => f.signature)).toContain('crash:blank-render');
  });

  test('a healthy page produces nothing', async () => {
    expect(await pageCrashDetector.run(context({ audit: audit(), elements: [element()] }))).toEqual([]);
    expect(await consoleErrorDetector.run(context())).toEqual([]);
    expect(await networkFailureDetector.run(context())).toEqual([]);
  });

  test('an uncaught exception outranks a console error', async () => {
    const findings = await consoleErrorDetector.run(
      context({
        signals: { consoleErrors: ['bad thing'], pageErrors: ['TypeError: x is not a function'], networkFailures: [] },
      }),
    );
    const byDetector = findings.map((f) => ({ severity: f.severity, signature: f.signature }));
    expect(byDetector.find((f) => f.signature.startsWith('pageerror:'))?.severity).toBe('Major');
    expect(byDetector.find((f) => f.signature.startsWith('console:'))?.severity).toBe('Minor');
  });

  test('one endpoint failing many times is one finding, and 5xx is Critical', async () => {
    const failure = (url: string, status: number) => ({ url, method: 'GET', status, statusText: 'err' });
    const findings = await networkFailureDetector.run(
      context({
        signals: {
          consoleErrors: [],
          pageErrors: [],
          networkFailures: [
            failure(`${BASE}api/list?page=1`, 500),
            failure(`${BASE}api/list?page=2`, 500),
            failure(`${BASE}api/other`, 404),
          ],
        },
      }),
    );
    expect(findings).toHaveLength(2);
    expect(findings.find((f) => f.actual.includes('/api/list'))?.severity).toBe('Critical');
    expect(findings.find((f) => f.actual.includes('/api/other'))?.severity).toBe('Major');
  });

  test('a leaked value is Major; an untranslated key is Minor', async () => {
    const findings = await placeholderTextDetector.run(
      context({
        audit: audit({
          suspectTexts: ['unresolved value: "undefined" (2x)', 'untranslated i18n key: "a.b.c" (1x)'],
        }),
      }),
    );
    expect(findings.find((f) => f.actual.includes('unresolved'))?.severity).toBe('Major');
    expect(findings.find((f) => f.actual.includes('untranslated'))?.severity).toBe('Minor');
  });

  test('only a pressable control with no effect is a dead control', async () => {
    const dead = await deadControlDetector.run(context({ action: action({ kind: 'button', outcome: 'no-effect' }) }));
    expect(dead).toHaveLength(1);

    // Typing into a field and seeing nothing else change is correct, not a defect.
    expect(await deadControlDetector.run(context({ action: action({ kind: 'input', outcome: 'no-effect' }) }))).toEqual([]);
    expect(await deadControlDetector.run(context({ action: action({ outcome: 'content-changed' }) }))).toEqual([]);
    expect(await deadControlDetector.run(context({ action: action({ ok: false, outcome: 'failed' }) }))).toEqual([]);
  });

  test('a link that lands somewhere other than its href is reported; a redirect to the same page is not', async () => {
    const mismatch = await unexpectedRouteDetector.run(
      context({
        action: action({
          kind: 'link',
          outcome: 'navigated',
          advertisedHref: `${BASE}legal`,
          urlAfter: `${BASE}notes`,
        }),
      }),
    );
    expect(mismatch.map((f) => f.detector)).toContain('unexpected-route');

    const same = await unexpectedRouteDetector.run(
      context({
        action: action({
          kind: 'link',
          outcome: 'navigated',
          advertisedHref: `${BASE}locations/1604/legal`,
          urlAfter: `${BASE}locations/2999/legal`, // same screen, different record
        }),
      }),
    );
    expect(same).toEqual([]);
  });

  test('unlabelled fields are reported once with a count, not once each', async () => {
    const fields = [
      element({ kind: 'input', labelled: false, placeholder: 'First name' }),
      element({ kind: 'input', labelled: false, placeholder: 'Last name' }),
      element({ kind: 'input', labelled: true, name: 'Email' }),
    ];
    const findings = await missingLabelDetector.run(context({ elements: fields }));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.title).toContain('2 form control(s)');
  });

  test('accessibility reports unnamed controls and missing headings', async () => {
    const findings = await accessibilityDetector.run(
      context({
        elements: [element({ name: '' }), element({ name: 'Fine' })],
        audit: audit({ h1Count: 0, imagesWithoutAlt: 2, duplicateIds: ['root'] }),
      }),
    );
    const signatures = findings.map((f) => f.signature);
    expect(signatures).toContain('a11y:unnamed-controls');
    expect(signatures).toContain('a11y:images-without-alt');
    expect(signatures).toContain('a11y:no-h1');
    expect(signatures.some((s) => s.startsWith('a11y:duplicate-ids'))).toBe(true);
  });
});

/* ------------------------------------------------------------------ reporting */

test.describe('Report rendering @crawler @unit', () => {
  const summary: CrawlSummary = {
    startedAt: '2026-01-01T00:00:00.000Z',
    finishedAt: '2026-01-01T00:05:00.000Z',
    durationMs: '300s',
    startUrl: BASE,
    configUsed: { startUrl: BASE, enabledDetectors: ALL_DETECTORS },
    pagesVisited: [
      {
        url: `${BASE}locations/1604`,
        normalizedUrl: `${BASE}locations/:id`,
        module: 'Locations',
        depth: 0,
        title: 'Locations',
        elementCount: 42,
        actionsPerformed: 3,
        bugsFound: 1,
        durationMs: 1200,
        reachedVia: 'start URL',
      },
    ],
    actionsPerformed: [action()],
    scenarios: [{ name: 'Search with no match', url: BASE, outcome: 'explored', detail: 'Empty result state' }],
    bugs: [
      {
        id: 'BUG-CTRL-001',
        // Deliberately hostile copy: the renderers must escape it, not execute it.
        title: 'Control <script>alert(1)</script> & "quoted" does nothing',
        severity: 'Major',
        priority: 'P2',
        category: 'Functional',
        detector: 'dead-control',
        module: 'Locations',
        page: 'Locations',
        preconditions: ['Signed in.'],
        stepsToReproduce: ['1. Open the page', '2. Click the control'],
        expectedResult: 'Something happens.',
        actualResult: 'Nothing happens | at all.',
        evidence: {
          screenshot: 'evidence/BUG-CTRL-001.png',
          domSnippet: null,
          selector: 'button#x',
          consoleErrors: [],
          networkFailures: [],
        },
        url: `${BASE}locations/1604`,
        firstSeenAt: '2026-01-01T00:01:00.000Z',
        occurrences: 2,
        alsoSeenOn: [`${BASE}locations/1751`],
        fingerprint: 'abc123',
      },
    ],
    errors: [{ where: 'navigation', url: `${BASE}x`, message: 'timeout' }],
    notTested: [{ url: `${BASE}api/auth/signout`, reason: 'matches exclude pattern' }],
    stopReason: 'completed — frontier exhausted',
    totals: {
      pagesVisited: 1,
      actionsPerformed: 1,
      scenariosExplored: 1,
      bugsFound: 1,
      findingsBeforeDedup: 2,
      errors: 1,
      notTested: 1,
      bySeverity: { Critical: 0, Major: 1, Minor: 0, Trivial: 0 },
      byCategory: { Functional: 1 },
    },
  };

  test('markdown carries every required bug field and stays table-safe', () => {
    const markdown = buildMarkdown(summary);
    for (const heading of ['Preconditions', 'Steps to reproduce', 'Expected result', 'Actual result', 'Evidence']) {
      expect(markdown).toContain(heading);
    }
    expect(markdown).toContain('BUG-CTRL-001');
    expect(markdown).toContain('![BUG-CTRL-001](evidence/BUG-CTRL-001.png)');
    expect(markdown).toContain('## Coverage');
    expect(markdown).toContain('### Not tested');
    // A pipe inside a cell would break the table it sits in.
    const summaryRow = markdown.split('\n').find((line) => line.startsWith('| BUG-CTRL-001 |'));
    expect(summaryRow?.split('|').length).toBe(8);
  });

  test('html escapes hostile content and needs no network', () => {
    const html = buildHtml(summary);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toMatch(/src="https?:\/\//);
    expect(html).not.toMatch(/<link[^>]+href="https?:/i);
    expect(html).not.toMatch(/<script[^>]+src=/i);
    expect(html).toContain('BUG-CTRL-001');
    expect(html).toContain('prefers-color-scheme: dark');
  });

  test('an empty bug list says so without claiming the application is clean', () => {
    const clean: CrawlSummary = {
      ...summary,
      bugs: [],
      totals: { ...summary.totals, bugsFound: 0, bySeverity: { Critical: 0, Major: 0, Minor: 0, Trivial: 0 } },
    };
    expect(buildMarkdown(clean)).toContain('empty bug list is only as meaningful as the coverage');
    expect(buildHtml(clean)).toContain('not tested');
  });

  test('the output directory resolves under the project, never outside it', () => {
    const config = testConfig();
    expect(path.isAbsolute(config.outputDir)).toBe(true);
    expect(config.outputDir.startsWith(process.cwd())).toBe(true);
  });
});
