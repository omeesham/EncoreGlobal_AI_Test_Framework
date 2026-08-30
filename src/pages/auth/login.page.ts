import { Page } from '@playwright/test';
import { BasePage } from '../base.page';
import { Log } from '../../utils/logger';
import { AppConstants } from '../../utils/constants';
import { IConfig } from '../../types';
import { MicrosoftLoginSelectors } from '../../selectors';
import type { DiagnosticsCollector } from '../../utils/diagnostics-collector';
import { urlHostMatches } from '../../utils/url-host';

export class LoginPage extends BasePage {
  constructor(page: Page, config?: IConfig) {
    super(page, config);
    Log.info('LoginPage constructed for Navigator Cloud');
  }

  async goto(): Promise<void> {
    const url = this.config?.base_url || this.config?.url || process.env.BASE_URL || '';
    Log.info(`Navigating to Navigator Cloud: ${url}`);
    
    await this.page.goto(url, { 
      timeout: AppConstants.PAGE_LOAD_TIMEOUT_MS,
      waitUntil: 'domcontentloaded' 
    });
    
    Log.info('Page loaded, checking authentication state...');
  }

  async loginWithMicrosoft(username: string, password: string): Promise<boolean> {
    // Never throws: every failure returns false after logging and screenshotting, so callers must
    // branch on the return value rather than expecting an error.
    const collector = (this.page as unknown as Record<string, unknown>).__diagnosticsCollector as DiagnosticsCollector | undefined;

    try {
      Log.info(`Starting Microsoft SSO login for ${username}`);

      Log.info('Waiting for Navigator Cloud sign-in page...');
      try {
        await this.page.waitForSelector(MicrosoftLoginSelectors.btnContinueNow, { state: 'visible', timeout: 15_000 });
        await this.page.click(MicrosoftLoginSelectors.btnContinueNow);
        Log.info('[OK] Clicked "Continue Now" on Navigator Cloud sign-in page');
      } catch {
        Log.info('"Continue Now" button not found -- may already be on Microsoft login page');
      }

      await this.waitForMicrosoftLoginPage();
      collector?.recordUrl();

      Log.info('Entering email...');
      await this.page.fill(MicrosoftLoginSelectors.txtEmail, username);
      await this.page.click(MicrosoftLoginSelectors.btnNext);

      Log.info('Waiting for password field...');
      await this.page.waitForSelector(MicrosoftLoginSelectors.txtPassword, { 
        state: 'visible', 
        timeout: AppConstants.ACTION_TIMEOUT_MS 
      });

      Log.info('Entering password...');
      await this.page.fill(MicrosoftLoginSelectors.txtPassword, password);
      await this.page.click(MicrosoftLoginSelectors.btnSignIn);

      await this.handleStaySignedIn();

      Log.info('Waiting for redirect to Navigator Cloud...');
      // Use the same base-URL cascade as goto() (including BASE_URL) and guard the empty case —
      // new URL('') throws a TypeError, which here would mask the real navigation state being checked.
      const baseForHost = this.config?.base_url || this.config?.url || process.env.BASE_URL || '';
      const expectedHostname = baseForHost ? new URL(baseForHost).hostname : '';

      try {
        await this.page.waitForURL(
          url => urlHostMatches(url.toString(), expectedHostname),
          { timeout: AppConstants.NAVIGATION_TIMEOUT_MS }
        );
      } catch (redirectError) {
 // Differentiate: check for OAuth errors, redirect loops, post-login failures
        collector?.recordUrl();
        const currentUrl = this.page.url();
        const authChain = collector?.getAuthChain() ?? [];
        const netFails = collector?.getNetworkFailures() ?? [];

        const oauthFail = netFails.find(n =>
          (urlHostMatches(n.url, 'login.microsoftonline.com') || n.url.includes('oauth')) && n.status >= 400
        );
        if (oauthFail) {
          throw new Error(`OAuth token request returned ${oauthFail.status}: ${oauthFail.body.substring(0, 500)}`);
        }

        const authRedirects = authChain.filter(e => e.status >= 300 && e.status < 400);
        if (authRedirects.length > 5) {
          throw new Error(`SSO redirect loop detected -- ${authRedirects.length} redirects to ${authRedirects.at(-1)?.url ?? 'unknown'}`);
        }

        if (!urlHostMatches(currentUrl, 'login.microsoftonline.com') && !urlHostMatches(currentUrl, expectedHostname)) {
          throw new Error(`Post-login app failed to load -- page URL: ${currentUrl}, expected: ${expectedHostname}`);
        }

        throw redirectError;
      }

      Log.info('[wait] Waiting for domcontentloaded after redirect...');
      await this.page.waitForLoadState('domcontentloaded', { timeout: 30_000 });
      Log.info('[wait] Waiting for full page load...');
      await this.page.waitForLoadState('load', { timeout: 30_000 });
      Log.info('[OK] Page load complete after redirect');

      collector?.recordUrl();

      const isAuthenticated = await this.isLoggedIn();
      if (isAuthenticated) {
        Log.info('[OK] Microsoft SSO login successful');
        return true;
      } else {
        Log.error('[ERR] Login appeared successful but authentication verification failed');
        return false;
      }
    } catch (error) {
      collector?.recordUrl();
      Log.error(`Microsoft SSO login failed: ${error}`);
      await this.takeScreenshot('microsoft-sso-login-failed');
      return false;
    }
  }

  private async waitForMicrosoftLoginPage(): Promise<void> {
    Log.info('Waiting for Microsoft login page...');
    
    await this.page.waitForURL(
      url => urlHostMatches(url.toString(), 'login.microsoftonline.com'),
      { timeout: AppConstants.NAVIGATION_TIMEOUT_MS }
    );
    
    // Skip networkidle — MS telemetry prevents it from resolving
    await this.page.waitForSelector(MicrosoftLoginSelectors.txtEmail, { 
      state: 'visible', 
      timeout: AppConstants.ELEMENT_WAIT_TIMEOUT_MS 
    });
    
    Log.info('[OK] Microsoft login page loaded');
  }

  private async handleStaySignedIn(): Promise<void> {
    try {
      await this.page.waitForSelector(MicrosoftLoginSelectors.btnYesStaySignedIn, { 
        state: 'visible', 
        timeout: 3000 
      });

      Log.info('"Stay signed in?" prompt detected, clicking Yes...');
      await this.page.click(MicrosoftLoginSelectors.btnYesStaySignedIn);
      Log.info('[OK] "Stay signed in" accepted');
    } catch {
 // Prompt didn't appear - optional
      Log.info('"Stay signed in?" prompt not shown');
    }
  }

  async isLoggedIn(): Promise<boolean> {
    try {
      const url = this.page.url();

      if (urlHostMatches(url, 'login.microsoftonline.com')) {
        return false;
      }

      // Use the same base-URL cascade as goto() (including BASE_URL) and guard the empty case —
      // new URL('') throws a TypeError, which here would mask the real navigation state being checked.
      const baseForHost = this.config?.base_url || this.config?.url || process.env.BASE_URL || '';
      const expectedHostname = baseForHost ? new URL(baseForHost).hostname : '';
      if (!urlHostMatches(url, expectedHostname)) {
        return false;
      }

      if (url.includes('error=OAuth') || url.includes('error=Callback') || url.includes('/auth/sign-in')) {
        Log.error(`[ERR] OAuth error detected in URL: ${url}`);
        return false;
      }

      await this.page.waitForURL(
        u => u.toString().includes('/navigator/locations/'),
        { timeout: 5000 }
      ).catch(() => {});

      const currentUrl = this.page.url();
      const isNavigatorLoaded = urlHostMatches(currentUrl, expectedHostname) && !currentUrl.includes('/auth/sign-in');

      Log.info(`Authentication check: ${isNavigatorLoaded ? '[OK] Authenticated' : '[ERR] Not authenticated'} -- URL: ${currentUrl}`);
      return isNavigatorLoaded;
    } catch (error) {
      Log.error(`isLoggedIn check failed: ${error}`);
      return false;
    }
  }

  async isOnMicrosoftLogin(): Promise<boolean> {
    const url = this.page.url();
    return urlHostMatches(url, 'login.microsoftonline.com');
  }

  async getLoginError(): Promise<string | null> {
    try {
      const errorDiv = this.page.locator(MicrosoftLoginSelectors.divError).first();
      // isVisible() ignores its timeout and checks instantly; waitFor actually waits (up to 2s) for a
      // slow-rendering error to appear, so a real error is not missed by checking a beat too early.
      await errorDiv.waitFor({ state: 'visible', timeout: 2000 });
      const errorText = await errorDiv.textContent();
      return errorText?.trim() || 'Unknown error';
    } catch {
 // No error appeared within the wait window.
    }
    return null;
  }
}
