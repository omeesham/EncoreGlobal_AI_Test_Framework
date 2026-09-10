import { Locator, Page, expect } from '@playwright/test';
import { step } from '../../fixtures/step-decorator';
import { BasePage } from '../base.page';
import { Log } from '../../utils/logger';
import { IConfig } from '../../types';
import { discountMatrixShared as S } from '../../selectors/discount-matrix/shared';
import { DM_OFFICE, DM_ROUTE } from '../../data/discount-matrix/discount-matrix';

/**
 * Discount Matrix page — the criteria bar and tab strip shared by all three tabs
 * (Company Matrix, Region Weekly Peaks, Location Activation).
 *
 * Loading (measured live 2026-08-25): the page hydrates in stages. The shell renders around
 * t≈10s, the three criteria dropdowns around t≈31s, and the GAV Discount Threshold input not
 * until t≈91–100s. Skeleton placeholders are painted the whole time, and grids keep their
 * full row count while still loading — so readiness is ALWAYS the placeholder census reaching
 * zero plus the threshold input existing, never a row count and never a fixed wait.
 *
 * The criteria dropdowns re-key the grid without a save; only the threshold is persisted by
 * the criteria Save. Save disables the moment it is clicked, so persistence is only ever
 * proven by reloading and reading the value back.
 */
export class DiscountMatrixBasePage extends BasePage {
  /**
   * Ceiling for the staged first load. The threshold resolves at ~91–100s on a quiet
   * environment, but evening load has been measured pushing a full reload past 180s of
   * skeleton state — the ceiling covers the worst measured hour, and the run report is
   * where a slow suite gets surfaced, not a tighter timeout.
   */
  protected static readonly HYDRATION_TIMEOUT = 300_000;

  constructor(page: Page, config?: IConfig) {
    super(page, config);
    Log.info('DiscountMatrixBasePage initialized');
  }

  // ---------------------------------------------------------------- navigation & readiness

  /** Navigates to the Discount Matrix page for the given office and waits for full hydration. */
  @step('Navigate to the Discount Matrix page for an office')
  async open(office: string = DM_OFFICE): Promise<void> {
    const baseUrl = (this.config?.base_url ?? '').replace(/\/+$/, '');
    // The dialog-safe navigation also swallows the browser's unsaved-changes prompt when a
    // previous test left the form dirty on purpose.
    await this.safeNavigateTo(`${baseUrl}${DM_ROUTE(office)}`, {
      waitUntil: 'domcontentloaded',
      timeout: 120_000,
    });
    await this.waitForCriteriaReady();
  }

  /**
   * Waits until the criteria bar has fully hydrated: every loading placeholder gone and the
   * threshold input present. Reading any control earlier returns empty values.
   */
  @step('Wait for the page to finish loading')
  async waitForCriteriaReady(timeout: number = DiscountMatrixBasePage.HYDRATION_TIMEOUT): Promise<void> {
    await expect(this.page.locator(S.skeleton)).toHaveCount(0, { timeout });
    await expect(this.page.locator(S.inpGavThreshold)).toBeVisible({ timeout: 30_000 });
    await this.waitForAngularStable();
  }

  /**
   * Reloads the page from the server, discarding any unsaved form state, and waits for full
   * hydration. Used by cases that must prove a value did (or did not) reach the server, and
   * as the cleanup path after deliberately typing non-numeric input — typing a good value
   * back does not reliably repair the form model, only a reload does.
   */
  @step('Reload the page, discarding unsaved changes')
  async discardReload(office: string = DM_OFFICE): Promise<void> {
    await this.open(office);
  }

  /**
   * Per-test baseline guard: verifies the page is open on the given office, fully hydrated,
   * on the Company Matrix landing tab, with the criteria Save disabled (pristine). Any
   * violation triggers a full reload — the only reliable cleaner on this page.
   */
  @step('Make sure the page is loaded with no unsaved changes')
  async ensureCleanCriteria(office: string = DM_OFFICE): Promise<void> {
    const onPage = this.page.url().includes(DM_ROUTE(office));
    let pristine = false;
    if (onPage) {
      const hydrated =
        (await this.page.locator(S.skeleton).count()) === 0 &&
        (await this.page.locator(S.inpGavThreshold).count()) > 0;
      if (hydrated) {
        const onLandingTab = (await this.getActiveTabName()) === S.TAB_COMPANY_MATRIX;
        const saveIdle = !(await this.isCriteriaSaveEnabled());
        pristine = onLandingTab && saveIdle;
      }
    }
    if (!pristine) {
      Log.info('[baseline] page not pristine — reloading');
      await this.open(office);
    }
  }

  // ---------------------------------------------------------------- tab strip

  /** All tab names in DOM order. */
  @step('Read the tab strip')
  async readTabNames(): Promise<string[]> {
    const names = await this.page.locator(S.tabAny).allTextContents();
    return names.map((n) => n.trim()).filter((n) => n.length > 0);
  }

  /** Name of the currently-selected tab. */
  @step('Read which tab is active')
  async getActiveTabName(): Promise<string> {
    const name = await this.page.locator(S.tabActive).first().textContent().catch(() => '');
    return (name ?? '').trim();
  }

  /** Clicks a tab by its exact accessible name. Callers wait for that tab's own ready signal. */
  @step('Open a tab')
  async clickTab(name: string): Promise<void> {
    await this.page.getByRole('tab', { name, exact: true }).click();
  }

  // ---------------------------------------------------------------- criteria dropdowns

  /** The three criteria dropdowns in DOM order: 0 = Country, 1 = Currency, 2 = Business Tier. */
  protected criteriaCombo(index: number): Locator {
    return this.page.locator(S.drpCriteriaAny).nth(index);
  }

  /** Current visible values of Country, Currency and Business Tier, in that order. */
  @step('Read the criteria dropdown values')
  async readCriteriaValues(): Promise<string[]> {
    const out: string[] = [];
    for (let i = 0; i < 3; i++) {
      const t = await this.criteriaCombo(i).textContent().catch(() => '');
      out.push((t ?? '').trim());
    }
    return out;
  }

  /**
   * Opens a dropdown and waits for its listbox. Retries the click once — the Radix trigger
   * opens on pointerdown and the follow-up click can intermittently close it again.
   */
  protected async openListbox(trigger: Locator): Promise<Locator> {
    const listbox = this.page.locator(S.listbox);
    await trigger.click();
    const opened = await listbox.waitFor({ state: 'visible', timeout: 3_000 })
      .then(() => true).catch(() => false);
    if (!opened) {
      Log.warn('[retry] listbox not visible after click — clicking again');
      await trigger.click();
      await listbox.waitFor({ state: 'visible', timeout: 5_000 });
    }
    return listbox;
  }

  /** Opens a dropdown, reads every option verbatim, and closes it with Escape (no mutation). */
  protected async readListboxOptions(trigger: Locator): Promise<string[]> {
    const listbox = await this.openListbox(trigger);
    const options = await listbox.locator(S.optionAny).allTextContents();
    await this.page.keyboard.press('Escape');
    await listbox.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => {});
    return options.map((o) => o.trim()).filter((o) => o.length > 0);
  }

  /**
   * Opens a dropdown and clicks the option with the EXACT given name. Bounded retry: on a
   * missed click the list is closed with Escape and reopened fresh.
   */
  protected async selectListboxOption(trigger: Locator, optionText: string): Promise<void> {
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.openListbox(trigger);
        const option = this.page.getByRole('option', { name: optionText, exact: true });
        await option.scrollIntoViewIfNeeded({ timeout: 3_000 });
        await option.click({ timeout: 5_000 });
        Log.info(`[OK] selected option "${optionText}"`);
        return;
      } catch (err) {
        if (attempt === maxRetries) throw err;
        Log.warn(`[retry ${attempt}/${maxRetries}] option click failed for "${optionText}"`);
        await this.page.keyboard.press('Escape').catch(() => {});
        await this.page.locator(S.listbox).waitFor({ state: 'hidden', timeout: 2_000 }).catch(() => {});
      }
    }
  }

  /** Reads the full option list of one criteria dropdown (0 = Country, 1 = Currency, 2 = Tier). */
  @step('Read a criteria dropdown option list')
  async readCriteriaOptions(index: number): Promise<string[]> {
    return this.readListboxOptions(this.criteriaCombo(index));
  }

  /** Opens one criteria dropdown and dismisses it with Escape without selecting anything. */
  @step('Open and dismiss a criteria dropdown')
  async openAndDismissCriteria(index: number): Promise<void> {
    const listbox = await this.openListbox(this.criteriaCombo(index));
    await this.page.keyboard.press('Escape');
    await listbox.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => {});
  }

  /** Selects an option in one criteria dropdown, then waits for the grid re-query to settle. */
  @step('Choose a criteria dropdown option')
  async selectCriteria(index: number, optionText: string): Promise<void> {
    await this.selectListboxOption(this.criteriaCombo(index), optionText);
    await this.waitForRequerySettle();
  }

  /**
   * Waits for a criteria-driven re-query to finish: any loading placeholders the swap paints
   * must clear, then the framework must go quiet. The grid keeps its previous rows while
   * reloading, so row count is meaningless here too.
   */
  @step('Wait for the grid to finish reloading')
  async waitForRequerySettle(timeout: number = DiscountMatrixBasePage.HYDRATION_TIMEOUT): Promise<void> {
    await expect(this.page.locator(S.skeleton)).toHaveCount(0, { timeout });
    await this.waitForAngularStable();
  }

  // ---------------------------------------------------------------- threshold field

  protected threshold(): Locator {
    return this.page.locator(S.inpGavThreshold);
  }

  /** Current threshold display value (e.g. `15%`). */
  @step('Read the discount threshold')
  async readThreshold(): Promise<string> {
    return (await this.threshold().inputValue()).trim();
  }

  /**
   * Clears the field and types the given characters one at a time. This field is
   * percentage-formatted, and setting it with a single programmatic fill silently commits a
   * different number than the one requested — character-by-character typing is mandatory.
   * Passing an empty string leaves the field cleared.
   */
  @step('Type a value into the discount threshold')
  async typeThreshold(value: string): Promise<void> {
    const f = this.threshold();
    await f.click();
    await this.page.keyboard.press('Control+a');
    await this.page.keyboard.press('Delete');
    if (value !== '') {
      await f.pressSequentially(value, { delay: 40 });
    }
  }

  /** Moves focus out of the threshold with a natural Tab (the format-on-blur trigger). */
  @step('Move focus out of the discount threshold')
  async blurThreshold(): Promise<void> {
    await this.page.keyboard.press('Tab');
    await this.waitForAngularStable(5_000).catch(() => {});
  }

  /** Whether the threshold currently carries the invalid marking (red outline state). */
  @step('Read the discount threshold validity state')
  async isThresholdInvalid(): Promise<boolean> {
    return (await this.threshold().getAttribute('aria-invalid')) === 'true';
  }

  /**
   * Whether keyboard focus is currently inside the threshold input. Used to prove a refused
   * value never traps the cursor — a natural Tab must always move focus out.
   */
  @step('Check whether the discount threshold still holds focus')
  async isThresholdFocused(): Promise<boolean> {
    return this.threshold().evaluate((el) => el === el.ownerDocument.activeElement);
  }

  // ---------------------------------------------------------------- criteria Save

  /** The criteria bar's Save. It precedes the tab panels in DOM order, hence `.first()`. */
  protected criteriaSave(): Locator {
    return this.page.locator(S.btnSaveAny).first();
  }

  /** Whether the criteria Save is currently enabled. */
  @step('Read the criteria Save state')
  async isCriteriaSaveEnabled(): Promise<boolean> {
    return this.criteriaSave().isEnabled().catch(() => false);
  }

  /** Polls until the criteria Save enables (dirty-state propagation) or the timeout lapses. */
  @step('Wait for the criteria Save to enable')
  async waitForCriteriaSaveEnabled(timeout: number = 10_000): Promise<boolean> {
    return expect
      .poll(async () => this.isCriteriaSaveEnabled(), { timeout })
      .toBe(true)
      .then(() => true)
      .catch(() => false);
  }

  /** Polls until the criteria Save disables, or the timeout lapses. */
  @step('Wait for the criteria Save to disable')
  async waitForCriteriaSaveDisabled(timeout: number = 10_000): Promise<boolean> {
    return expect
      .poll(async () => this.isCriteriaSaveEnabled(), { timeout })
      .toBe(false)
      .then(() => true)
      .catch(() => false);
  }

  /**
   * Clicks the criteria Save and confirms a save dialog if one appears. No probe has ever
   * pressed this Save before, so the dialog is treated as optional: the shared "Save Changes"
   * alert with an Ok button is confirmed when present, any other alert dialog is confirmed
   * through its own Save/Ok/Yes button, and no dialog at all simply proceeds.
   */
  @step('Save the criteria bar')
  async clickCriteriaSave(): Promise<void> {
    // The save request is a POST to the page's own route, so a navigation right after the
    // click can cancel it mid-flight and silently lose the save. Track in-flight requests
    // from before the click and drain them before returning, mirroring the shared
    // save-with-dialog helper; the deadline only caps the worst case — the drain exits the
    // moment the last request finishes.
    let inFlight = 0;
    const requestTracker = () => { inFlight++; };
    const requestDoneTracker = () => { inFlight = Math.max(0, inFlight - 1); };
    this.page.on('request', requestTracker);
    this.page.on('requestfinished', requestDoneTracker);
    this.page.on('requestfailed', requestDoneTracker);
    try {
      await this.criteriaSave().click();
      const dlg = this.page.locator(S.dlgAnyAlert);
      const appeared = await dlg.waitFor({ state: 'visible', timeout: 4_000 })
        .then(() => true).catch(() => false);
      if (appeared) {
        Log.info('save confirmation dialog appeared — confirming');
        await dlg.locator('button:text-is("Ok"), button:text-is("Save"), button:text-is("Yes")')
          .first()
          .click();
        await dlg.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {
          Log.warn('save dialog did not close within 10s');
        });
      }
      await this.waitForAngularStable();
      // Measured 2026-08-25: this page's save never calls the backend API path — the change
      // rides the page's own periodic sync POST, and the first one can fire ~30s AFTER the
      // click with zero requests in between. Waiting for one such POST to complete is what
      // stops a follow-up navigation from leaving the edit behind. This wait paces the
      // return only; it never decides success — persistence is always proven by
      // reload-and-read.
      await this.page.waitForResponse(
        (r) => r.request().method() === 'POST' && r.url().includes('/settings/discount-matrix'),
        { timeout: 45_000 },
      ).catch(() => {
        Log.warn('no page-route POST completed within 45s of Save — verify persistence by reload');
      });
      // 90s matches the weekly grid's measured worst case (a save can sit queued ~18s
      // behind the page's serial sync rotation and then run ~40s) — a shorter drain can
      // expire with the save still in flight, and a navigation then kills it.
      const drainDeadline = Date.now() + 90_000;
      while (inFlight > 0 && Date.now() < drainDeadline) {
        await this.page.waitForTimeout(100);
      }
      if (inFlight > 0) {
        Log.warn(`${inFlight} request(s) still in-flight after the 90s save drain — proceeding`);
      }
      // The save can also sit in an app-internal queue BEFORE it becomes a network request,
      // where no request counter can see it — and navigating then kills it. The app's own
      // pending-changes flag is the truthful commit signal, probeable without navigating:
      // dispatch a synthetic cancelable beforeunload and read whether a handler cancelled
      // it. Wait until the flag clears.
      await this.page
        .waitForFunction(
          () => {
            const probe = new Event('beforeunload', { cancelable: true });
            window.dispatchEvent(probe);
            return !probe.defaultPrevented;
          },
          undefined,
          { timeout: 90_000, polling: 1_000 },
        )
        .catch(() => {
          Log.warn('the pending-changes flag is still set after the save wait — verify persistence by reload');
        });
    } finally {
      this.page.off('request', requestTracker);
      this.page.off('requestfinished', requestDoneTracker);
      this.page.off('requestfailed', requestDoneTracker);
    }
  }

  /**
   * Persists a threshold value and PROVES it landed: type, blur, save, reload, read back,
   * with bounded retry. This is the restore path for any test that saved a threshold — a
   * conditional "save if it enabled in time" restore can silently skip and leak the test's
   * value to the shared server, which is exactly what this method exists to prevent.
   */
  @step('Persist a threshold value and verify it landed')
  async persistThreshold(digits: string, office: string = DM_OFFICE): Promise<void> {
    await this.saveAndVerifyPersisted({
      label: `GAV threshold ${digits}%`,
      isAtTarget: async () => (await this.readThreshold()) === `${digits}%`,
      applyMutation: async () => {
        await this.typeThreshold(digits);
        await this.blurThreshold();
      },
      save: async () => {
        // The enable comparison runs on blur and can lag under load; wait generously and
        // treat a never-enabling Save as this attempt failing (the retry loop re-drives it).
        if (!(await this.waitForCriteriaSaveEnabled(30_000))) {
          throw new Error('criteria Save did not enable after the restore value was typed');
        }
        await this.clickCriteriaSave();
      },
      reload: async () => {
        await this.discardReload(office);
      },
    });
  }

  // ---------------------------------------------------------------- page chrome

  /** The header information control. */
  moreInformationButton(): Locator {
    return this.page.locator(S.btnMoreInformation);
  }

  /** The left-panel collapse toggle (its accessible name is literally "trigger-button"). */
  panelToggle(): Locator {
    return this.page.getByRole('button', { name: S.BTN_PANEL_TOGGLE_NAME, exact: true });
  }

  /** Clicks the left-panel collapse toggle once. */
  @step('Toggle the left panel')
  async clickPanelToggle(): Promise<void> {
    await this.panelToggle().click();
    await this.waitForAngularStable(5_000).catch(() => {});
  }
}
