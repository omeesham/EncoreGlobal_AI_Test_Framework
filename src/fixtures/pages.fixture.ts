import { Page, BrowserContext } from '@playwright/test';
import { LocationCurrencyPage } from '../pages/locations/location-currency.page';
import { LocationLocalInfoPage } from '../pages/locations/location-local-info.page';
import { LocationPricingPage } from '../pages/locations/location-pricing.page';
import { LocationAccountAddressPage } from '../pages/locations/location-account-address.page';
import { LocationNotesPage } from '../pages/locations/location-notes.page';
import { LocationLegalPage } from '../pages/locations/location-legal.page';
import { LocationLeftPanelBasicInformationPage } from '../pages/locations/location-left-panel-basic-information.page';
import { LocationSharedSetupLocationsPage } from '../pages/locations/location-shared-setup-locations.page';
import { LocationBusinessTypesPage } from '../pages/locations/location-business-types.page';
import { LocalOfficeSettingsPage } from '../pages/local-office/local-office-settings.page';
import { LocalOfficeHistoryPage } from '../pages/local-office/local-office-history.page';
import { LocalOfficeEctPage } from '../pages/local-office/local-office-ect.page';
import { LocationAutoAddonPage } from '../pages/locations/location-auto-addon.page';
import { LocationManagementHistoryPage } from '../pages/locations/location-management-history.page';
import { CorporatePricingBasePage } from '../pages/corporate-pricing/corporate-pricing.page';
import { CorporatePricingSearchPage } from '../pages/corporate-pricing/corporate-pricing-search.page';
import { CorporatePricingStrategyPage } from '../pages/corporate-pricing/corporate-pricing-strategy.page';
import { CorporatePricingDetailPage } from '../pages/corporate-pricing/corporate-pricing-detail.page';
import { CorporatePricingOverridePage } from '../pages/corporate-override/corporate-override.page';
import { CorporatePricingNewPricebookPage } from '../pages/corporate-pricing/corporate-pricing-new-pricebook.page';
import { CommonMethods } from '../utils/env-config';
import { Log } from '../utils/logger';
import { IConfig } from '../types';
import { CredentialLoader } from '../utils/credential-loader';
import { attachDiagnostics, DiagnosticsCollector } from '../utils/diagnostics-collector';
import * as fs from 'fs';
import * as path from 'path';
import {
  STATE_PATH,
  acquireLock,
  performSsoLogin,
  readEarliestSessionExpiry,
  validateState,
  writeStateAtomic,
} from '../utils/auth-storage';
import { dependencyGateExt } from './dependency-gate';

type WorkerFixtures = {
  config: IConfig;
  authenticatedSession: { page: Page; context: BrowserContext };
};

type TestFixtures = {
  diagnosticsHandler: void;
  locationCurrencyPage: LocationCurrencyPage;
  locationLocalInfoPage: LocationLocalInfoPage;
  locationPricingPage: LocationPricingPage;
  locationAccountAddressPage: LocationAccountAddressPage;
  locationNotesPage: LocationNotesPage;
  locationLegalPage: LocationLegalPage;
  locationLeftPanelBasicInformationPage: LocationLeftPanelBasicInformationPage;
  locationSharedSetupLocationsPage: LocationSharedSetupLocationsPage;
  locationBusinessTypesPage: LocationBusinessTypesPage;
  localOfficeSettingsPage: LocalOfficeSettingsPage;
  localOfficeHistoryPage: LocalOfficeHistoryPage;
  localOfficeEctPage: LocalOfficeEctPage;
  locationAutoAddonPage: LocationAutoAddonPage;
  locationManagementHistoryPage: LocationManagementHistoryPage;
  corporatePricingBasePage: CorporatePricingBasePage;
  corporatePricingSearchPage: CorporatePricingSearchPage;
  corporatePricingStrategyPage: CorporatePricingStrategyPage;
  corporatePricingDetailPage: CorporatePricingDetailPage;
  corporatePricingOverridePage: CorporatePricingOverridePage;
  corporatePricingNewPricebookPage: CorporatePricingNewPricebookPage;
  dependencyGate: (deps: string[]) => void;
};

export const test = dependencyGateExt.extend<TestFixtures, WorkerFixtures>({
  diagnosticsHandler: [async ({ authenticatedSession }, use, testInfo) => {
    const { page, context } = authenticatedSession;

    // Each test records into its own trace chunk so a failing attempt keeps its own
    // trace even when a later retry passes -- flaky runs stay diagnosable from CI artifacts.
    let traceChunkStarted = false;
    try {
      await context.tracing.startChunk({ title: testInfo.title });
      traceChunkStarted = true;
    } catch { /* tracing may be unavailable -- never block the test */ }

    await use(undefined as unknown as void);

    const failed = testInfo.status !== 'passed' && testInfo.status !== 'skipped';
    if (failed) {
      try {
        const screenshotPath = testInfo.outputPath('failure-screenshot.png');
        await page.screenshot({ path: screenshotPath, fullPage: true });
        await testInfo.attach('screenshot', { path: screenshotPath, contentType: 'image/png' });
      } catch { }
    }
    if (traceChunkStarted && failed) {
      try {
        const tracePath = testInfo.outputPath('trace.zip');
        await context.tracing.stopChunk({ path: tracePath });
        await testInfo.attach('trace', { path: tracePath, contentType: 'application/zip' });
      } catch { }
    } else if (traceChunkStarted) {
      try {
        await context.tracing.stopChunk();
      } catch { }
    }

    // Catches contexts that survive teardown. Does NOT catch bare-page collisions — Playwright
    // tears that context down before this post-use code runs; the lint guard covers those.
    {
      const browser = authenticatedSession.context.browser();
      const ctxList = browser ? browser.contexts() : [];
      if (ctxList.length > 1) {
        Log.warn(`[diag] multi-context detected count=${ctxList.length} test="${testInfo.title}"`);
        for (const ctx of ctxList) {
          const tag = ctx === authenticatedSession.context ? 'auth' : 'other';
          for (const pg of ctx.pages()) {
            Log.warn(`[diag]   ctx=${tag} url=${pg.url()}`);
          }
        }
      }
    }

 // Teardown — extract diagnostics from the CORRECT page (authenticatedSession.page)
    const collector = (page as unknown as Record<string, unknown>).__diagnosticsCollector as DiagnosticsCollector | undefined;
    if (collector) {
      collector.recordUrl();
      const snapshot = collector.getSnapshot();

      if (testInfo.status !== 'passed') {
        try {
          const domContent = await page.content();
          snapshot.domSnippet = domContent.slice(0, 50_000);
        } catch { }

        try {
          const selectorPrefixes = ['btn', 'txt', 'drp', 'chk', 'lnk', 'rdo', 'dlg', 'tbl', 'err', 'col', 'spin', 'tab', 'pnl'];
          const errorText = testInfo.errors.map(e => e.message || '').join(' ');
          const selectorMatch = errorText.match(
            new RegExp(`['"\`]((?:${selectorPrefixes.join('|')})[A-Z]\\w+)['"\`]`)
          );
          const errorContext = await collector.generateErrorContext(testInfo.title, selectorMatch?.[1] ?? null);
          const ecPath = testInfo.outputPath('error-context.md');
          fs.writeFileSync(ecPath, errorContext, 'utf-8');
        } catch { /* never block teardown */ }
      }

      testInfo.attach('diagnostics', {
        contentType: 'application/json',
        body: Buffer.from(JSON.stringify(snapshot)),
      });

      if (testInfo.status !== 'passed') {
        const specName = path.basename(testInfo.file, '.spec.ts');
        const diagDir = path.join(process.cwd(), 'reports', 'diagnostics');
        if (!fs.existsSync(diagDir)) fs.mkdirSync(diagDir, { recursive: true });
        const diagFile = path.join(diagDir, `${specName}.diagnostics.json`);
        try {
          let existing: { spec: string; tests: unknown[] } = { spec: specName, tests: [] };
          if (fs.existsSync(diagFile)) {
            existing = JSON.parse(fs.readFileSync(diagFile, 'utf-8'));
          }
          existing.tests.push({
            name: testInfo.title,
            status: testInfo.status,
            consoleErrors: snapshot.consoleErrors,
            networkFailures: snapshot.networkFailures,
            pageErrors: snapshot.pageErrors,
            pageUrl: snapshot.urlHistory.at(-1) ?? '',
            authChain: snapshot.authChain,
          });
          fs.writeFileSync(diagFile, JSON.stringify(existing, null, 2) + '\n', 'utf-8');
        } catch { }
      }
    }
  }, { auto: true }],

  config: [async ({}, use) => {
    const config = CommonMethods.initProp();
    await use(config);
  }, { scope: 'worker' }],

  authenticatedSession: [async ({ browser, config }, use) => {
    const credentials = await CredentialLoader.loadCredentials({ type: 'env' });

    const newSharedContext = async () => {
      const ctx = fs.existsSync(STATE_PATH)
        ? await browser.newContext({ storageState: STATE_PATH })
        : await browser.newContext();
      const pg = await ctx.newPage();

      pg.on('dialog', async (dialog) => {
        if (dialog.type() === 'beforeunload') {
          const skip = (pg as unknown as Record<string, unknown>).__skipBeforeunloadAutoAccept;
          if (skip) {
            Log.info('[fixture] beforeunload dialog deferred to test handler (skip flag set)');
            return;
          }
          Log.info('[fixture] Auto-accepting beforeunload dialog');
          await dialog.accept();
        }
      });

      attachDiagnostics(pg);
      return { ctx, pg };
    };

    const refreshSharedState = async (): Promise<void> => {
      Log.info('[fixture] state stale -- acquiring lock to refresh');
      const release = await acquireLock();
      try {
        // Re-check: a peer worker may have refreshed while we waited for the lock.
        // Probe context closed under try/finally so a validateState throw doesn't leak it.
        const probe = await browser.newContext(
          fs.existsSync(STATE_PATH) ? { storageState: STATE_PATH } : undefined,
        );
        let stillStale: boolean;
        try {
          const probePage = await probe.newPage();
          stillStale = !(await validateState(probePage, config.base_url));
        } finally {
          await probe.close();
        }
        if (!stillStale) {
          Log.info('[fixture] peer worker refreshed state while we waited -- reusing');
          return;
        }

        // performSsoLogin closes its own context on throw — no cleanup needed here.
        let loginCtx: import('@playwright/test').BrowserContext;
        try {
          ({ ctx: loginCtx } = await performSsoLogin(browser, config.base_url, config, credentials));
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          throw new Error(`SSO login failed during state refresh: ${msg}`);
        }
        await writeStateAtomic(loginCtx);
        await loginCtx.close();
        Log.info('[fixture] shared state refreshed and saved');
      } finally {
        await release();
      }
    };

    // Staleness is resolved before newSharedContext() so each worker creates its context once.
    // EXP_FORCE_STALE_FIRST=1 simulates mid-run expiry once per worker to exercise the file lock.
    const forceStaleFirst =
      process.env.EXP_FORCE_STALE_FIRST === '1' &&
      !(globalThis as unknown as { __expForceStaleConsumed?: boolean }).__expForceStaleConsumed;
    if (forceStaleFirst) {
      (globalThis as unknown as { __expForceStaleConsumed?: boolean }).__expForceStaleConsumed = true;
      Log.info('[fixture] EXP_FORCE_STALE_FIRST=1 -- forcing stale path for mid-run sim');
    }
    const stateMissing = !fs.existsSync(STATE_PATH);
    // 60s grace so expired cookies are caught before the 60s Dashboard wait burns.
    // `null` (missing file or session-only cookies) is already covered by `stateMissing`.
    const earliestExpiry = stateMissing ? null : readEarliestSessionExpiry();
    const stateExpired =
      earliestExpiry !== null && earliestExpiry * 1000 < Date.now() + 60_000;
    if (forceStaleFirst || stateMissing || stateExpired) {
      await refreshSharedState();
    }

    const { ctx: context, pg: page } = await newSharedContext();
    // Record everything on this shared context so each test's trace chunk (see the
    // diagnostics fixture) can capture screenshots, DOM snapshots, and source lines.
    try {
      await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    } catch { /* tracing unavailable -- tests still run, just without trace capture */ }
    // Both paths start on about:blank (validateState runs on the probe context), so this goto is
    // the only thing that navigates the primary page.
    await page.goto(config.base_url, { timeout: 78_000 });
    await page
      .getByRole('heading', { name: 'Dashboard', level: 1 })
      .waitFor({ state: 'visible', timeout: 60_000 });

    Log.info('[OK] Authenticated session ready via shared storageState');

    await use({ page, context });

    await context.close();
  }, { scope: 'worker', timeout: 300_000 }],

  // Destructuring the bare `page` would create a second about:blank context diagnostics cannot
  // see. Throwing beats redirecting: a redirect would silently lose trace/video capture.
  page: async ({}, _use, testInfo) => {
    const msg =
      `[diag:bare-page-collision] test "${testInfo.titlePath.join(' > ')}" requested bare {page} from ` +
      `fixture destructure. This causes Playwright to create a separate about:blank context ` +
      `(diagnostics blind to it). Fix: drop 'page' from the destructure; use a *Page fixture ` +
      `(e.g. {locationNotesPage}) or authenticatedSession.page for direct page operations.`;
    Log.error(msg);
    throw new Error(msg);
  },

  locationCurrencyPage: async ({ authenticatedSession, config }, use) => {
    const locationCurrencyPage = new LocationCurrencyPage(authenticatedSession.page, config);
    await use(locationCurrencyPage);
  },

  locationLocalInfoPage: async ({ authenticatedSession, config }, use) => {
    const locationLocalInfoPage = new LocationLocalInfoPage(authenticatedSession.page, config);
    await use(locationLocalInfoPage);
  },

  locationPricingPage: async ({ authenticatedSession, config }, use) => {
    const locationPricingPage = new LocationPricingPage(authenticatedSession.page, config);
    await use(locationPricingPage);
  },

  locationAccountAddressPage: async ({ authenticatedSession, config }, use) => {
    const locationAccountAddressPage = new LocationAccountAddressPage(authenticatedSession.page, config);
    await use(locationAccountAddressPage);
  },

  locationNotesPage: async ({ authenticatedSession, config }, use) => {
    const locationNotesPage = new LocationNotesPage(authenticatedSession.page, config);
    await use(locationNotesPage);
  },

  locationLegalPage: async ({ authenticatedSession, config }, use) => {
    const locationLegalPage = new LocationLegalPage(authenticatedSession.page, config);
    await use(locationLegalPage);
  },

  locationLeftPanelBasicInformationPage: async ({ authenticatedSession, config }, use) => {
    const locationLeftPanelBasicInformationPage = new LocationLeftPanelBasicInformationPage(authenticatedSession.page, config);
    await use(locationLeftPanelBasicInformationPage);
  },

  locationSharedSetupLocationsPage: async ({ authenticatedSession, config }, use) => {
    const locationSharedSetupLocationsPage = new LocationSharedSetupLocationsPage(authenticatedSession.page, config);
    await use(locationSharedSetupLocationsPage);
  },

  locationBusinessTypesPage: async ({ authenticatedSession, config }, use) => {
    const locationBusinessTypesPage = new LocationBusinessTypesPage(authenticatedSession.page, config);
    await use(locationBusinessTypesPage);
  },

  localOfficeSettingsPage: async ({ authenticatedSession, config }, use) => {
    const localOfficeSettingsPage = new LocalOfficeSettingsPage(authenticatedSession.page, config);
    await use(localOfficeSettingsPage);
  },

  localOfficeHistoryPage: async ({ authenticatedSession, config }, use) => {
    const localOfficeHistoryPage = new LocalOfficeHistoryPage(authenticatedSession.page, config);
    await use(localOfficeHistoryPage);
  },

  localOfficeEctPage: async ({ authenticatedSession, config }, use) => {
    const localOfficeEctPage = new LocalOfficeEctPage(authenticatedSession.page, config);
    await use(localOfficeEctPage);
  },

  locationAutoAddonPage: async ({ authenticatedSession, config }, use) => {
    const locationAutoAddonPage = new LocationAutoAddonPage(authenticatedSession.page, config);
    await use(locationAutoAddonPage);
  },

  locationManagementHistoryPage: async ({ authenticatedSession, config }, use) => {
    const locationManagementHistoryPage = new LocationManagementHistoryPage(authenticatedSession.page, config);
    await use(locationManagementHistoryPage);
  },

  corporatePricingBasePage: async ({ authenticatedSession, config }, use) => {
    const corporatePricingBasePage = new CorporatePricingBasePage(authenticatedSession.page, config);
    await use(corporatePricingBasePage);
  },

  corporatePricingSearchPage: async ({ authenticatedSession, config }, use) => {
    const corporatePricingSearchPage = new CorporatePricingSearchPage(authenticatedSession.page, config);
    await use(corporatePricingSearchPage);
  },

  corporatePricingStrategyPage: async ({ authenticatedSession, config }, use) => {
    const corporatePricingStrategyPage = new CorporatePricingStrategyPage(authenticatedSession.page, config);
    await use(corporatePricingStrategyPage);
  },

  corporatePricingDetailPage: async ({ authenticatedSession, config }, use) => {
    const corporatePricingDetailPage = new CorporatePricingDetailPage(authenticatedSession.page, config);
    await use(corporatePricingDetailPage);
  },

  corporatePricingOverridePage: async ({ authenticatedSession, config }, use) => {
    const corporatePricingOverridePage = new CorporatePricingOverridePage(authenticatedSession.page, config);
    await use(corporatePricingOverridePage);
  },

  corporatePricingNewPricebookPage: async ({ authenticatedSession, config }, use) => {
    const corporatePricingNewPricebookPage = new CorporatePricingNewPricebookPage(authenticatedSession.page, config);
    await use(corporatePricingNewPricebookPage);
  },

});

export { expect } from '@playwright/test';
