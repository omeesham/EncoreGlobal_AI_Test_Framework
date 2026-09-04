import { Page, Locator } from '@playwright/test';
import { Log } from '../utils/logger';
import { recordCall as recordRetryCall, type AttemptRecord } from '../utils/retry-telemetry';
import { getTsSelector } from '../selectors';
import { IConfig } from '../types';
import { CheckboxState } from './components/location-form-helpers.component';
import { isAuthUrl } from '../utils/url-host';
import { step } from '../fixtures/step-decorator';

export class BasePage {
  // `page` is public readonly so specs can use `<pageObjectFixture>.page` for direct page
  // operations (reload, keyboard, mouse, dialog handlers) WITHOUT destructuring the bare
  // `page` fixture alongside, which would cause a known issue where Playwright DI creates a second
  // about:blank context for the bare `page`). `readonly` keeps consumers from rebinding.
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

 /**
 * Navigate safely when page may have unsaved form state (dirty Angular forms).
 * Registers a temporary beforeunload dialog handler, navigates, then removes it.
 * Use this instead of navigateTo when the page might have unsaved edits.
 * Reload after non-numeric input requires safe navigation to avoid beforeunload trap.
 */
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

 /**
 * Wait for Angular to finish all pending async operations (zone.js stability).
 * Falls back silently if Angular testabilities are not available (non-Angular pages).
 * Use this after navigation/reload instead of networkidle for Angular SPAs.
 * networkidle hangs on Angular SPAs because zone.js micro-tasks
 * keep the network "active". This method uses Angular's own stability API instead.
 * This is a MAX wait: it resolves as soon as Angular reports stable, or at `timeout` as a backstop —
 * it does not block for the full timeout, and returns immediately on non-Angular pages.
 */
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

 /**
 * Navigate to URL only if not already there. Reusable across page objects.
 * Checks if current URL contains the target path before calling page.goto.
 * @param url - Full target URL
 * @param pathCheck - Substring to check in current URL (e.g. 'locations/1604/settings')
 * @returns true if navigation occurred, false if skipped
 */
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

 /**
 * Click a save button and confirm the Save Changes dialog if it appears.
 * Returns saved:true only when a real save ran; saved:false means the button was disabled (no-op) or the save failed -- callers reverting shared state must not treat a no-op as persisted.
 * @param saveBtnKey - Selector key for the save button (e.g., 'btnSavePricing')
 * @param dialogKey - Selector key for the confirmation dialog (default: 'dlgSaveChanges')
 * @param confirmBtnKey - Selector key for the confirm button (default: 'btnSaveChangesConfirm')
 * @param dialogTimeout - ms to wait for dialog to appear before assuming none (default: 5000)
 */
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

 // Capture network responses during save to detect silent API failures.
 // Track in-flight requests so we wait for ALL concurrent responses before checking errors.
 // Race condition fix: Angular may stabilize after a fast 200 while a slow 500 is still
 // in-flight. Without draining, page.off removed the listener before the 500 arrived.
    const networkErrors: string[] = [];
    let inFlight = 0;
    const requestTracker = () => { inFlight++; };
    // Only backend API responses count as save failures. The Next.js App-Router fires
    // server-component-render POSTs to the page URL (plus RSC/telemetry requests) that can
    // return 4xx during the save window without being data-save failures — scoping to the
    // '/navigator/api/' backend path stops those framework requests from being read as
    // save errors that fail an otherwise-successful save.
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

 /**
 * Persist a change and PROVE it landed. A save call can report success when nothing was saved
 * (the button is disabled on a net-zero change, and an API error is easy to ignore), so trusting
 * the save alone is unsafe for anything that reverts or sets shared server state. This wraps the
 * proven shape -- read back; if already correct, stop; otherwise re-apply the change, save, reload,
 * and read back again -- in a bounded retry. The post-reload re-read is the load-bearing check;
 * once the attempt budget is spent it throws, turning a silent failure-to-persist into a loud one.
 *
 * The re-read is necessary but not sufficient on its own: it confirms the value is at the goal
 * after a server round-trip, not that THIS save is what put it there (the value could already
 * have matched). That is acceptable here -- the goal is "state is correct going into the next
 * test", not save attribution. `save` is intentionally void: the callers' save-and-confirm has
 * no result worth branching on at this layer; persistence is proven by the reload + re-read.
 *
 * Two failure modes are made loud instead of silent:
 *  - a transient throw (navigation/timeout) inside one attempt consumes ONLY that attempt and the
 *    loop retries from a clean reload, rather than the throw killing the whole retry budget;
 *  - a reload that lands on the sign-in page (expired auth) throws a clear "session lost" error
 *    up front, instead of every attempt failing the re-read for a reason that looks like non-persistence.
 *
 * @param opts.isAtTarget    read the persisted value back and return true when it matches the goal
 * @param opts.applyMutation (re-)drive the form change that sets the goal value
 * @param opts.save          the page's own save-and-confirm (void by design -- see above)
 * @param opts.reload        navigate away and back so the next read comes from the server
 * @param opts.maxAttempts   whole-cycle attempts before throwing (default 3)
 * @param opts.label         plain-English context for logs and the failure message
 */
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
    // Guard against a reload that silently dropped us on the auth page: isAtTarget can never be
    // true there, so without this every attempt would burn on a re-read that looks like a
    // failure-to-persist. Throw a distinct, terminal error a caller can act on (re-authenticate).
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

 /**
 * Navigate to a settings sub-tab for a given office, clicking the tab only if not already active.
 * @param tabKey - Selector key for the tab element
 * @param readinessElementKey - Selector key for an element confirming the tab content is loaded
 * @param officeNo - Office number (default: '1604')
 * @param settingsPath - The sub-path after /settings/ to navigate to (default: 'location')
 */
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
    // 30s readiness timeout (was 15s): cold-load p95 ~9s isolated, but 4-worker
    // contention regularly pushes form-visible past 15s.
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

 /**
 * Get the checked/disabled state of a Radix UI checkbox (button[role="checkbox"] using aria-checked).
 * Native HTML checkboxes use isChecked; Radix uses aria-checked attribute — this handles Radix.
 * @param elementKey - Selector key for the Radix checkbox element
 */
  protected async getRadixCheckboxState(elementKey: string): Promise<CheckboxState> {
    const el = this.getElement(elementKey);
    const ariaChecked = await el.getAttribute('aria-checked').catch(() => null);
    const disabled = await el.isDisabled().catch(() => true);
    return { checked: ariaChecked === 'true', disabled };
  }

 /**
 * Set a Radix UI checkbox to a target checked state (clicks only if state differs).
 * @param elementKey - Selector key for the Radix checkbox
 * @param checked - Desired state: true = checked, false = unchecked
 */
  protected async setRadixCheckbox(elementKey: string, checked: boolean): Promise<void> {
    const state = await this.getRadixCheckboxState(elementKey);
    if (state.checked !== checked) {
 // Extended timeout: form inputs may be temporarily disabled during save API processing
      await this.getElement(elementKey).click({ timeout: 30_000 });
      Log.info(`${checked ? 'Checked' : 'Unchecked'} Radix checkbox: ${elementKey}`);
    }
  }

 /**
 * Click a Radix combobox trigger and wait for [role="listbox"] to appear.
 * Retries the click once if the dropdown doesn't open — Radix Select uses pointerdown
 * to open and the subsequent pointerup/click events can intermittently interfere,
 * leaving the dropdown closed despite a successful click.
 * @param dropdownKey - Selector key for the combobox trigger element
 * @returns The listbox Locator (visible and ready for interaction)
 */
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

 /**
 * Open a combobox/dropdown, read all [role="option"] text contents, close it, return the list.
 * Handles Radix UI dropdowns that render a [role="listbox"] on click.
 * @param dropdownKey - Selector key for the combobox trigger element
 * @returns Array of trimmed, non-empty option strings
 */
  protected async getComboboxOptions(dropdownKey: string): Promise<string[]> {
    const listbox = await this.openComboboxListbox(dropdownKey);
    const options = await listbox.locator('[role="option"]').allTextContents();
    await this.page.keyboard.press('Escape');
    await listbox.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => {});
    return options.map(o => o.trim()).filter(o => o.length > 0);
  }

 /**
 * Open a combobox/dropdown and click the option matching the given text.
 * Radix UI large-option dropdowns need retry on option selection.
 * Wraps option-click in a 3-retry loop; on failure presses Escape, waits for
 * listbox hidden, reopens via openComboboxListbox, scrollIntoViewIfNeeded(3s),
 * then click(5s). Per-attempt timeout ~5s keeps total budget ~15s.
 * @param dropdownKey - Selector key for the combobox trigger element
 * @param optionText - Display text of the option to select
 * @param opts.exact - When true, exact-match via page.getByRole('option', {name, exact}).
 *   When false (default), substring match via [role="option"]:has-text("X").
 */
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
        // Match by accessible name (scoped to this listbox) rather than interpolating the option text
        // into a :has-text() selector — the role match is properly escaped, so an option label that
        // contains a quote or bracket can never break or hijack the selector.
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

 /**
 * Get column header texts by iterating over an array of selector keys.
 * @param keys - Array of selector keys for column header elements
 * @returns Array of trimmed header texts in the same order as keys
 */
  protected async getColumnHeadersByKeys(keys: readonly string[]): Promise<string[]> {
    const headers: string[] = [];
    for (const key of keys) {
      const text = await this.getElement(key).textContent().catch(() => '');
      headers.push((text || '').trim());
    }
    return headers;
  }

 /**
 * Get displayed value of a form field (input or text element).
 * Tries inputValue first (for input elements), falls back to textContent.
 * @param selectorKey - Selector key for the field element
 * @returns Trimmed field display value
 */
  protected async getFieldDisplayValue(selectorKey: string): Promise<string> {
    const el = this.getElement(selectorKey);
    // Prefer the input value; only fall back to text content when the element is not an input
    // (inputValue() throws for non-input elements). A legitimately empty input then reads as empty
    // rather than silently falling through to textContent.
    const asInput = await el.inputValue().then((v) => ({ isInput: true, v })).catch(() => ({ isInput: false, v: '' }));
    const value = asInput.isInput ? asInput.v : ((await el.textContent().catch(() => '')) ?? '');
    return value.trim();
  }

 /**
 * Wait for a save button to become enabled (form dirty state propagation).
 * Polls the button disabled state efficiently.
 * @param saveBtnKey - Selector key for the save button
 * @param timeout - Maximum wait time in ms (default: 5000)
 * @returns true if save became enabled within timeout, false otherwise
 */
  // Default 10s (was 5s): Angular dirty-state propagation after section-grid
  // edits can occasionally exceed 5s under contention.
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

 /**
 * Poll until a field's aria-invalid becomes "true" (async Angular cross-field validators).
 * Cross-field validation (e.g. NM-1264) fires asynchronously after input events.
 * @param key - Selector key for the form field
 * @param timeout - Maximum wait time in ms (default: 5000)
 * @returns true if field became invalid within timeout, false otherwise
 */
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

 /**
 * Poll until a field's aria-invalid becomes "false" or absent (async validator cleared).
 * Cross-field validators may take time to clear after correcting a value.
 * @param key - Selector key for the form field
 * @param timeout - Maximum wait time in ms (default: 5000)
 * @returns true if field became valid within timeout, false otherwise
 */
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
