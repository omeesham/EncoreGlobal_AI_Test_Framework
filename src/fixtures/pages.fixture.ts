import { Page, BrowserContext } from '@playwright/test';
import { LocationCurrencyPage } from '../pages/locations/location-currency.page';
import { LocationLocalInfoPage } from '../pages/locations/location-local-info.page';
import { LocationPricingPage } from '../pages/locations/location-pricing.page';
import { LocationAccountAddressPage } from '../pages/locations/location-account-address.page';
import { LocationNotesPage } from '../pages/locations/location-notes.page';
import { LocationLegalPage } from '../pages/locations/location-legal.page';
import { LocationLeftPanelBasicInformationPage } from '../pages/locations/location-left-panel-basic-information.page';
import { LocationSharedSetupLocationsPage } from '../pages/locations/location-shared-setup-locations.page';
import { LocalOfficeSettingsPage } from '../pages/local-office/local-office-settings.page';
import { LocalOfficeHistoryPage } from '../pages/local-office/local-office-history.page';
import { LocalOfficeEctPage } from '../pages/local-office/local-office-ect.page';
import { LocationAutoAddonPage } from '../pages/locations/location-auto-addon.page';
import { LocationManagementHistoryPage } from '../pages/locations/location-management-history.page';
import { CorporatePricingBasePage } from '../pages/corporate-pricing/corporate-pricing.page';
import { CorporatePricingSearchPage } from '../pages/corporate-pricing/corporate-pricing-search.page';
import { CorporatePricingStrategyPage } from '../pages/corporate-pricing/corporate-pricing-strategy.page';
import { CorporatePricingDetailPage } from '../pages/corporate-pricing/corporate-pricing-detail.page';
import { CorporatePricingOverridePage } from '../pages/corporate-pricing/corporate-pricing-override.page';
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
import { wrapWithSteps } from './step-wrapper';

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

    // Best-effort page-topology check at fixture post-use. Detects context leaks that survive
    // teardown. Worker-scoped browser → contexts() is scoped to this worker.
    //
    // Known limitation: the bare-page-collision "bare page + page-object"
    // destructure collision pattern does NOT trigger this check, because Playwright tears down
    // the bare-page test-scoped context BEFORE this auto-use fixture's post-use code runs. The
    // structural defense for bare-page-collision is the lint guard at pre-commit / pre-push.
    // This check IS still useful for: (a) contexts created by test code via explicit
    // browser.newContext() that aren't cleaned up; (b) future page-object code that
    // creates side-contexts; (c) any case where >1 context survives test teardown.
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

        // File-lock guarantees only this worker is here.
        // On throw, performSsoLogin has already closed the context — no cleanup needed here.
        // Caller-specific error wrapping preserves the call-path identifier in logs.
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

    // The stateMissing check is hoisted ABOVE newSharedContext(). The old order created a
    // context, closed it on stale, then recreated — wasting one context per cold-start worker.
    // With the hoist, refresh runs first when needed and newSharedContext() runs exactly once.

    // When EXP_FORCE_STALE_FIRST=1, simulate mid-run expiry on the first pre-test guard
    // call per worker process to verify the file-lock serialization.
    // Pre-test guard rationale: Playwright's storageState does not capture sessionStorage
    // or in-memory MSAL state, so cookie-only restoration leaves the SPA in a skeleton-loading
    // state in a context that did not go through SSO. We rely on auth.setup's file-based
    // validation instead.
    const forceStaleFirst =
      process.env.EXP_FORCE_STALE_FIRST === '1' &&
      !(globalThis as unknown as { __expForceStaleConsumed?: boolean }).__expForceStaleConsumed;
    if (forceStaleFirst) {
      (globalThis as unknown as { __expForceStaleConsumed?: boolean }).__expForceStaleConsumed = true;
      Log.info('[fixture] EXP_FORCE_STALE_FIRST=1 -- forcing stale path for mid-run sim');
    }
    const stateMissing = !fs.existsSync(STATE_PATH);
    // Refresh shared state when the earliest `next-auth.session-token*` expiry is past
    // (with 60s grace). Catches expired cookies before the 60s Dashboard timeout fires.
    // `null` from readEarliestSessionExpiry() means missing or all-session-cookies,
    // both handled by `stateMissing` + validateState's Dashboard wait.
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
    // Both the post-refresh and the pre-existing-valid-state paths start on about:blank —
    // the probe context owns validateState, so the primary page is never navigated before this
    // goto. Without this, tests on the non-stale path fail with SELECTOR errors on about:blank.
    await page.goto(config.base_url, { timeout: 78_000 });
    await page
      .getByRole('heading', { name: 'Dashboard', level: 1 })
      .waitFor({ state: 'visible', timeout: 60_000 });

    Log.info('[OK] Authenticated session ready via shared storageState');

    await use({ page, context });

    await context.close();
  }, { scope: 'worker', timeout: 300_000 }],

  /**
   * Runtime guard for bare-page-collision in the page fixture.
   *
   * When a spec destructures `{ page, locationXxxPage }`, Playwright resolves
   * BOTH fixtures. The page-object fixtures use `authenticatedSession.page` (the legitimate
   * authenticated context), but the default `page` fixture is a separate fixture that calls
   * `browser.newContext({ storageState })` — producing a second about:blank context that
   * diagnostics cannot see. This override intercepts the destructure point itself and throws
   * loudly so the bug is unmissable at the test boundary.
   *
   * Why throw rather than redirect to `authenticatedSession.page`:
   * redirecting changes test semantics silently AND loses Playwright's built-in trace/video/
   * screenshot capture (those bind to the page returned by THIS `page` fixture). Throwing
   * fails loudly with a [diag:bare-page-collision] pointer.
   *
   * Layered with pre-commit grep guard and CI lint step. If a spec escapes both static
   * checks (e.g. `--no-verify` push, fresh clone without hooks), this runtime override
   * is the final net.
   *
   * Failure evidence is captured by the diagnostics fixture: it starts a trace chunk per
   * test against this shared context and, on failure, saves a full-page screenshot and trace
   * zip. Per-test video is deliberately not recorded — video recording is fixed when a
   * context is created, so a shared worker-long context produces one giant multi-test video,
   * which is not useful evidence.
   */
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
    const locationCurrencyPage = wrapWithSteps(new LocationCurrencyPage(authenticatedSession.page, config), 'LocationCurrencyPage');
    await use(locationCurrencyPage);
  },

  locationLocalInfoPage: async ({ authenticatedSession, config }, use) => {
    const locationLocalInfoPage = wrapWithSteps(new LocationLocalInfoPage(authenticatedSession.page, config), 'LocationLocalInfoPage');
    await use(locationLocalInfoPage);
  },

  locationPricingPage: async ({ authenticatedSession, config }, use) => {
    const locationPricingPage = wrapWithSteps(new LocationPricingPage(authenticatedSession.page, config), 'LocationPricingPage');
    await use(locationPricingPage);
  },

  locationAccountAddressPage: async ({ authenticatedSession, config }, use) => {
    const locationAccountAddressPage = wrapWithSteps(new LocationAccountAddressPage(authenticatedSession.page, config), 'LocationAccountAddressPage');
    await use(locationAccountAddressPage);
  },

  locationNotesPage: async ({ authenticatedSession, config }, use) => {
    const locationNotesPage = wrapWithSteps(new LocationNotesPage(authenticatedSession.page, config), 'LocationNotesPage');
    await use(locationNotesPage);
  },

  locationLegalPage: async ({ authenticatedSession, config }, use) => {
    const locationLegalPage = wrapWithSteps(new LocationLegalPage(authenticatedSession.page, config), 'LocationLegalPage');
    await use(locationLegalPage);
  },

  locationLeftPanelBasicInformationPage: async ({ authenticatedSession, config }, use) => {
    const locationLeftPanelBasicInformationPage = wrapWithSteps(new LocationLeftPanelBasicInformationPage(authenticatedSession.page, config), 'LocationLeftPanelBasicInformationPage');
    await use(locationLeftPanelBasicInformationPage);
  },

  locationSharedSetupLocationsPage: async ({ authenticatedSession, config }, use) => {
    const locationSharedSetupLocationsPage = wrapWithSteps(new LocationSharedSetupLocationsPage(authenticatedSession.page, config), 'LocationSharedSetupLocationsPage');
    await use(locationSharedSetupLocationsPage);
  },

  localOfficeSettingsPage: async ({ authenticatedSession, config }, use) => {
    const localOfficeSettingsPage = wrapWithSteps(new LocalOfficeSettingsPage(authenticatedSession.page, config), 'LocalOfficeSettingsPage');
    await use(localOfficeSettingsPage);
  },

  localOfficeHistoryPage: async ({ authenticatedSession, config }, use) => {
    const localOfficeHistoryPage = wrapWithSteps(new LocalOfficeHistoryPage(authenticatedSession.page, config), 'LocalOfficeHistoryPage');
    await use(localOfficeHistoryPage);
  },

  localOfficeEctPage: async ({ authenticatedSession, config }, use) => {
    const localOfficeEctPage = wrapWithSteps(new LocalOfficeEctPage(authenticatedSession.page, config), 'LocalOfficeEctPage');
    await use(localOfficeEctPage);
  },

  locationAutoAddonPage: async ({ authenticatedSession, config }, use) => {
    const locationAutoAddonPage = wrapWithSteps(new LocationAutoAddonPage(authenticatedSession.page, config), 'LocationAutoAddonPage');
    await use(locationAutoAddonPage);
  },

  locationManagementHistoryPage: async ({ authenticatedSession, config }, use) => {
    const locationManagementHistoryPage = wrapWithSteps(new LocationManagementHistoryPage(authenticatedSession.page, config), 'LocationManagementHistoryPage');
    await use(locationManagementHistoryPage);
  },

  corporatePricingBasePage: async ({ authenticatedSession, config }, use) => {
    const corporatePricingBasePage = wrapWithSteps(new CorporatePricingBasePage(authenticatedSession.page, config), 'CorporatePricingBasePage');
    await use(corporatePricingBasePage);
  },

  corporatePricingSearchPage: async ({ authenticatedSession, config }, use) => {
    const corporatePricingSearchPage = wrapWithSteps(new CorporatePricingSearchPage(authenticatedSession.page, config), 'CorporatePricingSearchPage');
    await use(corporatePricingSearchPage);
  },

  corporatePricingStrategyPage: async ({ authenticatedSession, config }, use) => {
    const corporatePricingStrategyPage = wrapWithSteps(new CorporatePricingStrategyPage(authenticatedSession.page, config), 'CorporatePricingStrategyPage');
    await use(corporatePricingStrategyPage);
  },

  corporatePricingDetailPage: async ({ authenticatedSession, config }, use) => {
    const corporatePricingDetailPage = wrapWithSteps(new CorporatePricingDetailPage(authenticatedSession.page, config), 'CorporatePricingDetailPage');
    await use(corporatePricingDetailPage);
  },

  corporatePricingOverridePage: async ({ authenticatedSession, config }, use) => {
    const corporatePricingOverridePage = wrapWithSteps(new CorporatePricingOverridePage(authenticatedSession.page, config), 'CorporatePricingOverridePage');
    await use(corporatePricingOverridePage);
  },

  corporatePricingNewPricebookPage: async ({ authenticatedSession, config }, use) => {
    const corporatePricingNewPricebookPage = wrapWithSteps(new CorporatePricingNewPricebookPage(authenticatedSession.page, config), 'CorporatePricingNewPricebookPage');
    await use(corporatePricingNewPricebookPage);
  },

});

export { expect } from '@playwright/test';
