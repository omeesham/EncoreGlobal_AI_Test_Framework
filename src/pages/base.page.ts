import { Page, Locator } from '@playwright/test';
import { Log } from '../utils/logger';
import { recordCall as recordRetryCall, type AttemptRecord } from '../utils/retry-telemetry';
import { getTsSelector } from '../selectors';
import { IConfig } from '../types';
import { CheckboxState } from './components/location-form-helpers.component';
import { isAuthUrl } from '../utils/url-host';
import { step } from '../fixtures/step-decorator';

export class BasePage {
  // Public so specs can drive the page via `<pageObjectFixture>.page` instead of also
  // destructuring the bare `page` fixture, which spawns a second about:blank context.
  public readonly page: Page;
  protected config?: IConfig;

  constructor(page: Page, config?: IConfig) {
    this.page = page;
    this.config = config;
  }

  protected getLocator(elementName: string): string {
    const locator = getTsSelector(elementName);
    if (!locator) {
      Log.error(`Selector not found: ${elementName}`);
      throw new Error(`Selector '${elementName}' not found in TypeScript selectors`);
    }
    return locator;
  }

  protected getSelectorFromTs(elementName: string): string | null {
    return getTsSelector(elementName);
  }

  protected getElement(elementName: string): Locator {
    const selector = this.getLocator(elementName);
    return this.page.locator(selector);
  }

 /** Navigate with a temporary beforeunload auto-accept handler — use when the form has unsaved edits. */
  protected async safeNavigateTo(url: string, options?: { waitUntil?: 'load' | 'domcontentloaded' | 'networkidle'; timeout?: number }): Promise<void> {
    const handler = async (dialog: { type(): string; accept(): Promise<void> }) => {
      if (dialog.type() === 'beforeunload') {
        try {
          Log.info('[dialog] Auto-accepting beforeunload dialog during safe navigation');
          await dialog.accept();
        } catch {
 // Dialog already accepted by global fixture handler — safe to ignore
          Log.info('[dialog] Beforeunload dialog already handled by another listener');
        }
      }
    };
    this.page.on('dialog', handler);
    try {
      await this.navigateTo(url, options);
    } finally {
      this.page.off('dialog', handler);
    }
  }

  @step('Go to the page')
  async navigateTo(url: string, options?: { waitUntil?: 'load' | 'domcontentloaded' | 'networkidle'; timeout?: number; maxRetries?: number }): Promise<void> {
    const { waitUntil = 'domcontentloaded', timeout = 30000, maxRetries = 2 } = options || {};
    Log.info(`Navigating to: ${url}`);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.page.goto(url, { waitUntil, timeout });
        Log.info(`[OK] Navigation successful: ${url}`);
        return;
      } catch (error) {
        Log.warn(`[WARN] Navigation attempt ${attempt}/${maxRetries} failed: ${error}`);
        if (attempt === maxRetries) {
          Log.error(`[ERR] Navigation failed after ${maxRetries} attempts: ${url}`);
          throw error;
        }
        await this.page.waitForTimeout(1000);
      }
    }
  }

  @step('Click with retry')
  async clickWithRetry(elementName: string, options?: { timeout?: number; maxRetries?: number }): Promise<boolean> {
    const { timeout = 10000, maxRetries = 3 } = options || {};
    Log.info(`Clicking element: ${elementName}`);
    const callRecord: AttemptRecord[] = [];

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const startMs = Date.now();
      try {
        const element = this.getElement(elementName);
        await element.click({ timeout });
        callRecord.push({ attemptN: attempt, durationMs: Date.now() - startMs, outcome: 'pass' });
        recordRetryCall('click', callRecord);
        Log.info(`[OK] Click successful: ${elementName}`);
        return true;
      } catch (error) {
        callRecord.push({ attemptN: attempt, durationMs: Date.now() - startMs, outcome: 'fail' });
        Log.warn(`[WARN] Click attempt ${attempt}/${maxRetries} failed: ${elementName}`);
        if (attempt === maxRetries) {
          recordRetryCall('click', callRecord);
          Log.error(`[ERR] Click failed after ${maxRetries} attempts: ${elementName}`);
          throw error;
        }
        await this.page.waitForTimeout(500);
      }
    }
 // Unreachable: loop always returns true or throws on final attempt
    throw new Error(`Click failed: ${elementName}`);
  }

  @step('Fill with validation')
  async fillWithValidation(elementName: string, value: string, options?: { timeout?: number; verify?: boolean; clear?: boolean }): Promise<boolean> {
    const { timeout = 10000, verify = true, clear = true } = options || {};
    Log.info(`Filling element: ${elementName} with value: ${value.substring(0, 20)}...`);

    try {
      const element = this.getElement(elementName);
      if (clear) await element.clear({ timeout });
      await element.fill(value, { timeout });

      if (verify) {
        const actualValue = await element.inputValue();
        if (actualValue !== value) {
          Log.warn(`[WARN] Fill verification mismatch. Retrying...`);
          await element.clear({ timeout });
          await element.fill(value, { timeout });
        }
      }

      Log.info(`[OK] Fill successful: ${elementName}`);
      return true;
    } catch (error) {
      Log.error(`[ERR] Fill failed: ${elementName} - ${error}`);
      throw error;
    }
  }

  @step('Wait for element')
  async waitForElement(elementName: string, timeout: number = 10000): Promise<void> {
    Log.info(`Waiting for element: ${elementName}`);
    try {
      const element = this.getElement(elementName);
      await element.waitFor({ state: 'visible', timeout });
      Log.info(`[OK] Element visible: ${elementName}`);
    } catch (error) {
      Log.error(`[ERR] Element not visible: ${elementName} - ${error}`);
      throw error;
    }
  }

  @step('Wait for page load')
  async waitForPageLoad(options?: { state?: 'load' | 'domcontentloaded' | 'networkidle'; spinnerSelectors?: string[]; timeout?: number }): Promise<void> {
    const { state = 'domcontentloaded', spinnerSelectors = ['.spinner', '.loading'], timeout = 30000 } = options || {};
    Log.info('Waiting for page load...');
    
    await this.page.waitForLoadState(state, { timeout });
    
    for (const selector of spinnerSelectors) {
      const spinner = this.page.locator(selector).first();
      if (await spinner.isVisible().catch(() => false)) {
        await spinner.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => Log.warn(`Spinner still visible: ${selector}`));
      }
    }
    
    Log.info('[OK] Page loaded');
  }

 // Use instead of networkidle, which never settles on Angular because zone.js keeps the network busy.
 // `timeout` is a backstop, not a fixed wait: resolves as soon as Angular reports stable.
  protected async waitForAngularStable(timeout = 10_000): Promise<void> {
    try {
      await this.page.evaluate((t) => {
        return new Promise<void>((resolve) => {
          const maxWait = setTimeout(() => resolve(), t);
          try {
 // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const testabilities = (window as any).getAllAngularTestabilities?.();
            if (!testabilities || testabilities.length === 0) {
              clearTimeout(maxWait);
              resolve();
              return;
            }
            testabilities[0].whenStable(() => {
              clearTimeout(maxWait);
              resolve();
            });
          } catch {
            clearTimeout(maxWait);
            resolve();
          }
        });
      }, timeout);
    } catch {
 // page.evaluate can throw if page navigated away — safe to ignore
    }
  }

  @step('Take screenshot')
  async takeScreenshot(name: string, fullPage: boolean = true): Promise<string> {
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const filename = `screenshot-${name}-${timestamp}.png`;
    const path = `reports/test-results/screenshots/${filename}`;

    try {
      await this.page.screenshot({ path, fullPage });
      Log.info(`[screenshot] Screenshot saved: ${path}`);
      return path;
    } catch (error) {
      Log.error(`[ERR] Screenshot failed: ${error}`);
      throw error;
    }
  }

  getCurrentUrl(): string {
    return this.page.url();
  }

 /** Navigate only when the current URL does not already contain `pathCheck`. */
  @step('Navigate if needed')
  async navigateIfNeeded(url: string, pathCheck: string): Promise<boolean> {
    if (this.page.url().includes(pathCheck)) {
      Log.info(`Already at ${pathCheck}, skipping navigation`);
      return false;
    }
    await this.navigateTo(url);
    return true;
  }

  @step('Get page title')
  async getPageTitle(): Promise<string> {
    return await this.page.title();
  }

  @step('Get text content')
  async getTextContent(elementName: string, options?: { trim?: boolean }): Promise<string> {
    const { trim = true } = options || {};
    try {
      const element = this.getElement(elementName);
      let text = await element.textContent() || '';
      if (trim) text = text.trim();
      Log.info(`Text content from ${elementName}: ${text.substring(0, 50)}...`);
      return text;
    } catch (error) {
      Log.error(`[ERR] Failed to get text content: ${elementName} - ${error}`);
      throw error;
    }
  }

  @step('Is element visible')
  async isElementVisible(elementName: string, timeout: number = 5000): Promise<boolean> {
    try {
      const element = this.getElement(elementName);
      await element.waitFor({ state: 'visible', timeout });
      return true;
    } catch {
      return false;
    }
  }

 // saved:false means the button was disabled (no-op) or the save failed — callers reverting
 // shared state must not treat a no-op as persisted.
  protected async clickSaveWithDialog(
    saveBtnKey: string,
    dialogKey: string = 'dlgSaveChanges',
    confirmBtnKey: string = 'btnSaveChangesConfirm',
    dialogTimeout: number = 5_000,
  ): Promise<{ success: boolean; saved?: boolean; networkError?: string }> {
    const saveBtn = this.getElement(saveBtnKey);
    await saveBtn.waitFor({ state: 'visible', timeout: 5_000 });
    if (await saveBtn.isDisabled()) {
      Log.info(`Save button disabled (${saveBtnKey}) -- no save performed`);
      return { success: true, saved: false };
    }

 // Capture API responses to catch silent save failures; in-flight tracking lets the drain below
 // wait for a slow 500 that trails a fast 200.
    const networkErrors: string[] = [];
    let inFlight = 0;
    const requestTracker = () => { inFlight++; };
    // Scoped to '/navigator/api/': Next.js App-Router RSC/telemetry requests can 4xx during the
    // save window without being data-save failures.
    const responseHandler = (response: { status(): number; url(): string }) => {
      if (response.status() >= 400 && response.url().includes('/navigator/api/')) {
        networkErrors.push(`${response.status()} ${response.url()}`);
      }
    };
    const requestDoneTracker = () => { inFlight = Math.max(0, inFlight - 1); };
    this.page.on('request', requestTracker);
    this.page.on('response', responseHandler);
    this.page.on('requestfinished', requestDoneTracker);
    this.page.on('requestfailed', requestDoneTracker);

    await saveBtn.click();
    const dialog = this.getElement(dialogKey);
    const dialogVisible = await dialog.waitFor({ state: 'visible', timeout: dialogTimeout })
      .then(() => true).catch(() => false);
    if (dialogVisible) {
      Log.info(`Save confirmation dialog appeared -- confirming`);
      await this.getElement(confirmBtnKey).click();
      await dialog.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {
        Log.warn(`Save dialog did not close within 10s`);
      });
    }
 // Wait for Angular to process the save response (replaces unreliable networkidle)
    await this.waitForAngularStable();

 // Drain in-flight requests: wait until all concurrent save responses arrive (max 5s).
 // Angular may stabilize after the fast 200 before a slow concurrent 500 arrives.
    const drainDeadline = Date.now() + 5_000;
    while (inFlight > 0 && Date.now() < drainDeadline) {
      await this.page.waitForTimeout(100);
    }
    if (inFlight > 0) {
      Log.warn(`[WARN] ${inFlight} request(s) still in-flight after 5s drain — proceeding`);
    }

    this.page.off('request', requestTracker);
    this.page.off('response', responseHandler);
    this.page.off('requestfinished', requestDoneTracker);
    this.page.off('requestfailed', requestDoneTracker);

    if (networkErrors.length > 0) {
      Log.error(`[FAIL] Save had API errors: ${networkErrors.join(', ')}`);
      return { success: false, saved: false, networkError: networkErrors.join('; ') };
    }

    Log.info(`[OK] Save complete (${saveBtnKey})`);
    return { success: true, saved: true };
  }

 // Save can report success without persisting — re-reads after reload and throws once the
 // attempt budget is spent.
  protected async saveAndVerifyPersisted(opts: {
    isAtTarget: () => Promise<boolean>;
    applyMutation: () => Promise<void>;
    save: () => Promise<void>;
    reload: () => Promise<void>;
    maxAttempts?: number;
    label?: string;
  }): Promise<void> {
    const maxAttempts = opts.maxAttempts ?? 3;
    const label = opts.label ?? 'value';
    // A reload onto the auth page can never reach the target; fail terminally rather than burning
    // every attempt on a re-read that looks like failure-to-persist.
    const assertSessionAlive = (): void => {
      const url = this.page.url();
      if (isAuthUrl(url) || url.toLowerCase().includes('/auth/sign-in')) {
        throw new Error(
          `saveAndVerifyPersisted: session lost while persisting ${label} — reload landed on the sign-in page (${url}). Re-authenticate before re-running.`,
        );
      }
    };
    const trail: string[] = [];
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        if (await opts.isAtTarget()) return;
        await opts.applyMutation();
        await opts.save();
        await opts.reload();
        assertSessionAlive();
        if (await opts.isAtTarget()) return;
        trail.push(`attempt ${attempt}: reloaded but value still not at target`);
        Log.warn(`saveAndVerifyPersisted: ${label} not persisted after attempt ${attempt}/${maxAttempts}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // Session loss is terminal — retrying cannot recover it, so surface it immediately.
        if (msg.includes('session lost')) throw err;
        // Any other throw is treated as a transient failure of THIS attempt: record it, recover to
        // clean server state with a best-effort reload, and let the loop try again within budget.
        trail.push(`attempt ${attempt}: threw — ${msg}`);
        Log.warn(`saveAndVerifyPersisted: ${label} attempt ${attempt}/${maxAttempts} threw, retrying — ${msg}`);
        if (attempt === maxAttempts) break;
        await opts.reload().catch(() => { /* best-effort recovery before the next attempt */ });
      }
    }
    const detail = trail.length ? ` Attempt trail: ${trail.join(' | ')}.` : '';
    Log.error(`saveAndVerifyPersisted: ${label} failed to persist after ${maxAttempts} attempts.${detail}`);
    throw new Error(`Could not persist ${label} after ${maxAttempts} attempts.${detail}`);
  }

 /** Navigate to an office settings sub-tab, clicking the tab only when it is not already active. */
  protected async navigateToSubTab(
    tabKey: string,
    readinessElementKey: string,
    officeNo: string = '1604',
    settingsPath: string = 'location',
  ): Promise<void> {
    const currentUrl = this.page.url();
    const expectedPath = `locations/${officeNo}/settings`;
    if (!currentUrl.includes(`${expectedPath}/${settingsPath}`)) {
      const baseUrl = this.config?.base_url || '';
      Log.info(`Navigating to ${expectedPath}/${settingsPath}`);
      // Join with exactly one slash regardless of whether base_url has a trailing one, rather than
      // relying on the base_url-ends-in-slash convention (a config without it would break the path).
      await this.navigateTo(`${baseUrl.replace(/\/$/, '')}/${expectedPath}/${settingsPath}`);
      await this.waitForAngularStable();
    }
    const tab = this.getElement(tabKey);
    await tab.waitFor({ state: 'visible', timeout: 30_000 });
    const isSelected = await tab.getAttribute('aria-selected').catch(() => null);
    if (isSelected !== 'true') {
      await tab.click();
      await this.waitForAngularStable();
    }
    // 30s: 4-worker contention regularly pushes form-visible past 15s.
    await this.getElement(readinessElementKey).waitFor({ state: 'visible', timeout: 30_000 });
    Log.info(`[OK] Tab active: ${tabKey}`);
  }

  protected async dismissAlertDialogIfVisible(): Promise<boolean> {
    const dialog = this.page.locator('[role="alertdialog"]');
    if (await dialog.isVisible().catch(() => false)) {
      const discardBtn = dialog.locator('button:has-text("Discard")');
      if (await discardBtn.isVisible().catch(() => false)) {
        await discardBtn.click();
        await dialog.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
        Log.info('Dismissed "Unsaved changes" alertdialog');
        return true;
      }
    }
    return false;
  }

 /** Radix checkbox state — reads aria-checked, since isChecked() only works on native checkboxes. */
  protected async getRadixCheckboxState(elementKey: string): Promise<CheckboxState> {
    const el = this.getElement(elementKey);
    const ariaChecked = await el.getAttribute('aria-checked').catch(() => null);
    const disabled = await el.isDisabled().catch(() => true);
    return { checked: ariaChecked === 'true', disabled };
  }

 /** Set a Radix checkbox, clicking only when the current state differs. */
  protected async setRadixCheckbox(elementKey: string, checked: boolean): Promise<void> {
    const state = await this.getRadixCheckboxState(elementKey);
    if (state.checked !== checked) {
 // Extended timeout: form inputs may be temporarily disabled during save API processing
      await this.getElement(elementKey).click({ timeout: 30_000 });
      Log.info(`${checked ? 'Checked' : 'Unchecked'} Radix checkbox: ${elementKey}`);
    }
  }

 // Retries the trigger click once: Radix Select opens on pointerdown, and the following
 // pointerup/click can intermittently close the listbox again.
  protected async openComboboxListbox(dropdownKey: string): Promise<import('@playwright/test').Locator> {
    const trigger = this.getElement(dropdownKey);
    const listbox = this.page.locator('[role="listbox"]');

    await trigger.click();
    const opened = await listbox.waitFor({ state: 'visible', timeout: 3_000 })
      .then(() => true).catch(() => false);
    if (!opened) {
      Log.warn(`[RETRY] Listbox not visible after click — retrying ${dropdownKey}`);
      await trigger.click();
      await listbox.waitFor({ state: 'visible', timeout: 5_000 });
    }
    return listbox;
  }

 /** Open a combobox, read every [role="option"] label, close it, return the trimmed list. */
  protected async getComboboxOptions(dropdownKey: string): Promise<string[]> {
    const listbox = await this.openComboboxListbox(dropdownKey);
    const options = await listbox.locator('[role="option"]').allTextContents();
    await this.page.keyboard.press('Escape');
    await listbox.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => {});
    return options.map(o => o.trim()).filter(o => o.length > 0);
  }

 // Radix option clicks are flaky on large dropdowns — each retry Escapes, waits for the listbox
 // to hide, and reopens before clicking again. `exact` switches substring to exact name match.
  protected async selectComboboxOption(
    dropdownKey: string,
    optionText: string,
    opts: { exact?: boolean } = {}
  ): Promise<void> {
    const attempts: AttemptRecord[] = [];
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const startMs = Date.now();
      try {
        const listbox = await this.openComboboxListbox(dropdownKey);
        // Match by accessible name rather than interpolating into :has-text() — an option label
        // containing a quote or bracket cannot break or hijack the selector.
        const option = opts.exact
          ? this.page.getByRole('option', { name: optionText, exact: true })
          : listbox.getByRole('option', { name: optionText });
        await option.scrollIntoViewIfNeeded({ timeout: 3_000 });
        await option.click({ timeout: 5_000 });
        attempts.push({ attemptN: attempt, durationMs: Date.now() - startMs, outcome: 'pass' });
        recordRetryCall('radix', attempts);
        Log.info(`[OK] Selected combobox option "${optionText}" for ${dropdownKey}`);
        return;
      } catch (err) {
        attempts.push({ attemptN: attempt, durationMs: Date.now() - startMs, outcome: 'fail' });
        if (attempt === maxRetries) {
          recordRetryCall('radix', attempts);
          throw err;
        }
        Log.warn(`[RETRY ${attempt}/${maxRetries}] Option click failed for "${optionText}" on ${dropdownKey} — Escape and reopen`);
        await this.page.keyboard.press('Escape').catch(() => {});
        await this.page.locator('[role="listbox"]').waitFor({ state: 'hidden', timeout: 2_000 }).catch(() => {});
      }
    }
  }

 /** Header texts for the given selector keys, in key order. */
  protected async getColumnHeadersByKeys(keys: readonly string[]): Promise<string[]> {
    const headers: string[] = [];
    for (const key of keys) {
      const text = await this.getElement(key).textContent().catch(() => '');
      headers.push((text || '').trim());
    }
    return headers;
  }

 /** Displayed value of a form field: inputValue() for inputs, textContent otherwise. */
  protected async getFieldDisplayValue(selectorKey: string): Promise<string> {
    const el = this.getElement(selectorKey);
    // Probe input-ness first (inputValue() throws on non-inputs) so a legitimately empty input
    // reads as empty instead of silently falling through to textContent.
    const asInput = await el.inputValue().then((v) => ({ isInput: true, v })).catch(() => ({ isInput: false, v: '' }));
    const value = asInput.isInput ? asInput.v : ((await el.textContent().catch(() => '')) ?? '');
    return value.trim();
  }

  // Default 10s: Angular dirty-state propagation after section-grid edits can exceed 5s
  // under contention.
  protected async waitForSaveEnabled(saveBtnKey: string, timeout = 10_000): Promise<boolean> {
    try {
      const btn = this.getElement(saveBtnKey);
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        if (!(await btn.isDisabled().catch(() => true))) {
          Log.info('[OK] Save button enabled');
          return true;
        }
        await this.page.waitForTimeout(200);
      }
      Log.warn('Save button did not enable within timeout');
      return false;
    } catch {
      Log.warn('Save button did not enable within timeout');
      return false;
    }
  }

 /** Poll for aria-invalid="true" — cross-field validators (e.g. NM-1264) fire asynchronously. */
  protected async waitForFieldInvalid(key: string, timeout = 5_000): Promise<boolean> {
    const el = this.getElement(key);
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const val = await el.getAttribute('aria-invalid').catch(() => null);
      if (val === 'true') return true;
      await this.page.waitForTimeout(200);
    }
    return false;
  }

 /** Poll until aria-invalid clears — validators take time to release after a value is corrected. */
  protected async waitForFieldValid(key: string, timeout = 5_000): Promise<boolean> {
    const el = this.getElement(key);
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const val = await el.getAttribute('aria-invalid').catch(() => null);
      if (val !== 'true') return true;
      await this.page.waitForTimeout(200);
    }
    return false;
  }
}
