import { Page } from '@playwright/test';
import { BasePage } from '../base.page';
import { Log } from '../../utils/logger';
import { IConfig } from '../../types';
import { DynamicSelectors } from '../../selectors';
import { CheckboxState } from '../components/location-form-helpers.component';

export class LocationPricingPage extends BasePage {
  constructor(page: Page, config?: IConfig) {
    super(page, config);
    Log.info('LocationPricingPage initialized');
  }

  async navigateToPricingTab(officeNo: string = '1604'): Promise<void> {
    await this.navigateToSubTab('tabPricing', 'chkCorporatePricing', officeNo);
 // Wait for pricing API to populate persisted checkbox states (default render is unchecked).
    await this.waitForPricingDataLoaded();
  }

 /**
 * Encore sub-tabs share `settings/location` URL — URL-based detection is unreliable after
 * a sibling tab's navigation; aria-selected is the reliable signal.
 */
  async isOnPricingTab(): Promise<boolean> {
    const tab = this.getElement('tabPricing');
    if ((await tab.count()) === 0) return false;
    return (await tab.getAttribute('aria-selected').catch(() => null)) === 'true';
  }

  async reloadPricingTab(officeNo: string = '1604'): Promise<void> {
    const base = this.config?.base_url || '';
 // After Save→Cancel, form stays dirty. safeNavigateTo handles beforeunload dialog.
    await this.safeNavigateTo(`${base}locations`, { waitUntil: 'domcontentloaded' });
    await this.navigateToPricingTab(officeNo);
  }

 /**
 * The Pricing tab renders checkboxes and dropdowns with DEFAULT state before the API response
 * populates them with persisted values. Waiting on network-idle alone is unreliable because
 * Angular's change detection applies API data to DOM attributes AFTER the HTTP response is
 * received (async gap); in serial runs that gap widens enough that reads return stale defaults.
 */
  async waitForPricingDataLoaded(): Promise<void> {
    await this.waitForAngularStable();
 // Signal 1 (primary, reliable across offices): the secondary pricing grid has rendered its rows.
 // Grid data arrives after the pricing API responds, so a non-zero row count proves the tab is
 // populated. Every office has price-book rows, so this signal is office-independent.
    const gridReady = await this.page.waitForFunction(
      () => document.querySelectorAll('[role="tabpanel"] table tbody tr').length > 0,
      undefined,
      { timeout: 20_000 },
    ).then(() => true).catch(() => false);
 // Signal 2: the Primary Labor dropdown has been bound by Angular (its label is no longer the
 // empty pre-render placeholder). Confirms checkbox aria-checked and dropdown values reflect
 // persisted state rather than default render values.
    const dropdownReady = await this.page.waitForFunction(
      (sel) => (((document.querySelector(sel)?.textContent) ?? '').trim().length > 0),
      '[data-testid="location-settings-select-primary-labor-pricing-usd"]',
      { timeout: 10_000 },
    ).then(() => true).catch(() => false);
    await this.waitForAngularStable();
 // At least one readiness signal must hold. If BOTH fail, the tab rendered neither its grid nor its
 // bound dropdown — a stale/empty render, not real data — so fail loudly instead of silently
 // continuing (the previous code swallowed both signals, proving nothing about whether the tab loaded).
    if (!gridReady && !dropdownReady) {
      throw new Error(
        'waitForPricingDataLoaded: neither the pricing grid nor the Primary Labor dropdown became ready within timeout — the Pricing tab did not populate.',
      );
    }
  }

  async getCheckboxState(selectorKey: string): Promise<CheckboxState> {
    return this.getRadixCheckboxState(selectorKey);
  }

  async checkCheckbox(selectorKey: string): Promise<void> {
    await this.setRadixCheckbox(selectorKey, true);
  }

  async uncheckCheckbox(selectorKey: string): Promise<void> {
    await this.setRadixCheckbox(selectorKey, false);
  }

  async isDropdownEnabled(selectorKey: string): Promise<boolean> {
    const el = this.getElement(selectorKey);
    const disabled = await el.isDisabled().catch(() => true);
    Log.info(`${selectorKey} enabled: ${!disabled}`);
    return !disabled;
  }

  async getDropdownValue(selectorKey: string): Promise<string> {
    return this.getFieldDisplayValue(selectorKey);
  }

  async verifyPrimaryDropdownStates(keys: readonly string[], expectedEnabled: boolean): Promise<{ allPassed: boolean; failures: string[] }> {
    const failures: string[] = [];
    for (const key of keys) {
      const enabled = await this.isDropdownEnabled(key);
      if (enabled !== expectedEnabled) {
        failures.push(`${key}: expected enabled=${expectedEnabled}, got ${enabled}`);
      }
    }
    return { allPassed: failures.length === 0, failures };
  }

 /**
 * IMPORTANT: clicking an already-selected option DESELECTS it (Radix toggle behavior).
 * This method skips interaction when the target value is already displayed.
 * @param selectorKey - selector key for the combobox
 * @param optionText - exact pricebook name to select
 */
  async selectPrimaryDropdownOption(selectorKey: string, optionText: string): Promise<void> {
 // Skip if already set -- clicking an already-selected option toggles it off (Radix behavior)
    const currentValue = await this.getDropdownValue(selectorKey);
    if (currentValue === optionText) {
      Log.info(`${selectorKey} already shows "${optionText}" -- skipping (toggle-safe)`);
      return;
    }
    await this.getElement(selectorKey).click();
    const dialog = this.page.getByRole('dialog', { name: 'Popover Content' });
    await dialog.waitFor({ state: 'visible', timeout: 5_000 });
 // Search for the option (the list is virtualized with 100+ entries)
    const searchInput = dialog.getByRole('textbox', { name: 'Search pricing strategies...' });
    await searchInput.fill(optionText);
 // Wait for the filtered option button to appear
    const optionBtn = dialog.getByRole('button', { name: optionText, exact: true });
    await optionBtn.waitFor({ state: 'visible', timeout: 5_000 });
    await optionBtn.click();
    await dialog.waitFor({ state: 'hidden', timeout: 5_000 });
    Log.info(`[OK] Selected "${optionText}" for ${selectorKey}`);
  }

 /**
 * Clear a primary pricing dropdown by toggling its current selection off — the Radix combobox
 * treats clicking the already-selected option as a deselect, returning the field to "--Select--".
 * No-op if the dropdown is already unset. Used to restore a dropdown after a persistence test.
 * @param selectorKey - selector key for the combobox
 */
  async clearPrimaryDropdown(selectorKey: string): Promise<void> {
    const current = (await this.getDropdownValue(selectorKey)).trim();
    if (current === '' || current === '--Select--' || current === 'Select') {
      return; // already unset
    }
    await this.getElement(selectorKey).click();
    const dialog = this.page.getByRole('dialog', { name: 'Popover Content' });
    await dialog.waitFor({ state: 'visible', timeout: 5_000 });
    const searchInput = dialog.getByRole('textbox', { name: 'Search pricing strategies...' });
    await searchInput.fill(current);
    const optionBtn = dialog.getByRole('button', { name: current, exact: true });
    await optionBtn.waitFor({ state: 'visible', timeout: 5_000 });
    await optionBtn.click();
    await dialog.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
    Log.info(`Cleared ${selectorKey} (was "${current}")`);
  }

  async getCurrencyFilterValue(): Promise<string> {
    return this.getFieldDisplayValue('drpCurrencyFilter');
  }

 /** The outer try/finally fires Escape on the failure path if the upstream open throws
 * before BasePage's internal Escape runs — a safe no-op if the popover is already closed. */
  async getCurrencyFilterOptions(): Promise<string[]> {
    try {
      return await this.getComboboxOptions('drpCurrencyFilter');
    } finally {
      await this.page.keyboard.press('Escape').catch(() => {});
    }
  }

  async selectCurrencyFilter(optionText: string): Promise<void> {
    await this.getElement('drpCurrencyFilter').click();
    await this.page.waitForTimeout(500);
    const option = this.page.locator(DynamicSelectors.optCurrencyFilter(optionText));
    await option.waitFor({ state: 'visible', timeout: 5_000 });
    await option.click();
    Log.info(`Currency filter -> ${optionText}`);
  }

  async getColumnHeaders(): Promise<string[]> {
    return this.getColumnHeadersByKeys([
      'colHeaderPricingStrategy', 'colHeaderPricebook', 'colHeaderCurrency',
      'colHeaderIsAlternative', 'colHeaderUseEffectiveDate',
      'colHeaderStartDate', 'colHeaderEndDate',
    ]);
  }

  async isGridRowVisible(priceBookName: string): Promise<boolean> {
    const selector = DynamicSelectors.rowPriceBook(priceBookName);
    const count = await this.page.locator(selector).count();
    Log.info(`Row "${priceBookName}" present: ${count > 0}`);
    return count > 0;
  }

  async isGridRowDisplayed(priceBookName: string): Promise<boolean> {
    const selector = DynamicSelectors.rowPriceBook(priceBookName);
    const loc = this.page.locator(selector);
    const count = await loc.count();
    if (count === 0) return false;
    return loc.first().isVisible().catch(() => false);
  }

  async getGridRowCount(): Promise<number> {
    const count = await this.page.locator('[role="tabpanel"] table tbody tr').count();
    Log.info(`Grid row count: ${count}`);
    return count;
  }

  async getIsAlternativeState(priceBookName: string): Promise<CheckboxState> {
    const selector = DynamicSelectors.chkIsAlternative(priceBookName);
    const el = this.page.locator(selector);
 // Radix grid checkboxes: button[role="checkbox"] with aria-checked, not native input
    const ariaChecked = await el.getAttribute('aria-checked').catch(() => null);
    const checked = ariaChecked === 'true';
    const disabled = await el.isDisabled().catch(() => true);
    Log.info(`Is Alternative [${priceBookName}]: checked=${checked} disabled=${disabled}`);
    return { checked, disabled };
  }

  async getUseEffectiveDateState(priceBookName: string): Promise<CheckboxState> {
    const selector = DynamicSelectors.chkUseEffectiveDate(priceBookName);
    const el = this.page.locator(selector);
 // Radix grid checkboxes: button[role="checkbox"] with aria-checked, not native input
    const ariaChecked = await el.getAttribute('aria-checked').catch(() => null);
    const checked = ariaChecked === 'true';
    const disabled = await el.isDisabled().catch(() => true);
    Log.info(`Use Effective Date [${priceBookName}]: checked=${checked} disabled=${disabled}`);
    return { checked, disabled };
  }

  async checkIsAlternative(priceBookName: string): Promise<void> {
    const state = await this.getIsAlternativeState(priceBookName);
    if (!state.checked) {
      const selector = DynamicSelectors.chkIsAlternative(priceBookName);
      await this.page.locator(selector).click();
      Log.info(`Checked Is Alternative: ${priceBookName}`);
    }
  }

  async uncheckIsAlternative(priceBookName: string): Promise<void> {
    const state = await this.getIsAlternativeState(priceBookName);
    if (state.checked) {
      const selector = DynamicSelectors.chkIsAlternative(priceBookName);
      await this.page.locator(selector).click();
      Log.info(`Unchecked Is Alternative: ${priceBookName}`);
    }
  }

  async checkUseEffectiveDate(priceBookName: string): Promise<void> {
    const state = await this.getUseEffectiveDateState(priceBookName);
    if (!state.checked) {
      const selector = DynamicSelectors.chkUseEffectiveDate(priceBookName);
      await this.page.locator(selector).click();
      Log.info(`Checked Use Effective Date: ${priceBookName}`);
    }
  }

  async uncheckUseEffectiveDate(priceBookName: string): Promise<void> {
    const state = await this.getUseEffectiveDateState(priceBookName);
    if (state.checked) {
      const selector = DynamicSelectors.chkUseEffectiveDate(priceBookName);
      await this.page.locator(selector).click();
      Log.info(`Unchecked Use Effective Date: ${priceBookName}`);
    }
  }

  async isStartDateEnabled(priceBookName: string): Promise<boolean> {
    const selector = DynamicSelectors.dtpStartDate(priceBookName);
    const el = this.page.locator(selector);
    const disabled = await el.isDisabled().catch(() => true);
    Log.info(`Start Date [${priceBookName}] enabled: ${!disabled}`);
    return !disabled;
  }

  async isEndDateEnabled(priceBookName: string): Promise<boolean> {
    const selector = DynamicSelectors.dtpEndDate(priceBookName);
    const el = this.page.locator(selector);
    const disabled = await el.isDisabled().catch(() => true);
    Log.info(`End Date [${priceBookName}] enabled: ${!disabled}`);
    return !disabled;
  }

  async getStartDateValue(priceBookName: string): Promise<string> {
    const selector = DynamicSelectors.dtpStartDate(priceBookName);
    const input = this.page.locator(selector);
    return (await input.inputValue().catch(() => '')).trim();
  }

  async getEndDateValue(priceBookName: string): Promise<string> {
    const selector = DynamicSelectors.dtpEndDate(priceBookName);
    const input = this.page.locator(selector);
    return (await input.inputValue().catch(() => '')).trim();
  }

  async enterStartDate(priceBookName: string, dateValue: string): Promise<void> {
    await this.selectDateFromCalendar(priceBookName, 6, dateValue);
    Log.info(`Entered Start Date [${priceBookName}]: ${dateValue}`);
  }

  async enterEndDate(priceBookName: string, dateValue: string): Promise<void> {
    await this.selectDateFromCalendar(priceBookName, 7, dateValue);
    Log.info(`Entered End Date [${priceBookName}]: ${dateValue}`);
  }

  async isStartDateReadOnly(priceBookName: string): Promise<boolean> {
    const selector = DynamicSelectors.dtpStartDate(priceBookName);
    const el = this.page.locator(selector);
    return (await el.getAttribute('readonly')) !== null;
  }

  async isEndDateReadOnly(priceBookName: string): Promise<boolean> {
    const selector = DynamicSelectors.dtpEndDate(priceBookName);
    const el = this.page.locator(selector);
    return (await el.getAttribute('readonly')) !== null;
  }

 /**
 * The validation tooltip only renders while the calendar popover is open.
 * Caller must ensure the popover is already open before calling this.
 */
  async hasDateValidationError(): Promise<boolean> {
    const msg = this.page.locator('text=/Pricing Effective.*date.*must be set/');
    return (await msg.count()) > 0;
  }

  async openStartDatePopover(priceBookName: string): Promise<void> {
    const row = this.page.locator(DynamicSelectors.rowPriceBook(priceBookName));
    const cell = row.locator('td:nth-child(6)');
    await cell.getByRole('button', { name: 'Open popover' }).click();
    const dialog = this.page.getByRole('dialog', { name: 'Popover Content' });
    await dialog.waitFor({ state: 'visible', timeout: 5_000 });
    Log.info(`Opened Start Date popover for ${priceBookName}`);
  }

  async openEndDatePopover(priceBookName: string): Promise<void> {
    const row = this.page.locator(DynamicSelectors.rowPriceBook(priceBookName));
    const cell = row.locator('td:nth-child(7)');
    await cell.getByRole('button', { name: 'Open popover' }).click();
    const dialog = this.page.getByRole('dialog', { name: 'Popover Content' });
    await dialog.waitFor({ state: 'visible', timeout: 5_000 });
    Log.info(`Opened End Date popover for ${priceBookName}`);
  }

  async closeDatePopover(): Promise<void> {
    await this.page.keyboard.press('Escape');
 // Wait for the dialog to disappear
    const dialog = this.page.getByRole('dialog', { name: 'Popover Content' });
    await dialog.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => {});
    Log.info('Closed date popover');
  }

  private static readonly MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  private getOrdinalSuffix(day: number): string {
    if (day >= 11 && day <= 13) return 'th';
    switch (day % 10) {
      case 1: return 'st';
      case 2: return 'nd';
      case 3: return 'rd';
      default: return 'th';
    }
  }

  private async selectDateFromCalendar(
    priceBookName: string, colIndex: number, dateValue: string,
  ): Promise<void> {
    const parts = dateValue.split('/').map(Number);
    const monthNum = parts[0] as number;
    const dayNum = parts[1] as number;
    const yearNum = parts[2] as number;
    const targetMonthName = LocationPricingPage.MONTH_NAMES[monthNum - 1];
    const targetLabel = `${targetMonthName} ${yearNum}`;

    const row = this.page.locator(DynamicSelectors.rowPriceBook(priceBookName));
 // Scroll grid row to center of viewport before opening popover — prevents popover rendering off-screen
    await row.scrollIntoViewIfNeeded();
    const cell = row.locator(`td:nth-child(${colIndex})`);
 // The popover trigger is a <div role="button" aria-label="Open popover">.
 // After enableFullCascade, Angular needs a render cycle to remove aria-disabled and
 // pointer-events:none. Wait for the trigger to be interactive before clicking.
    const trigger = cell.locator('[role="button"][aria-label="Open popover"]:not([aria-disabled="true"])');
    await trigger.waitFor({ state: 'visible', timeout: 10_000 });
    await trigger.click();

    const dialog = this.page.getByRole('dialog', { name: 'Popover Content' });
    await dialog.waitFor({ state: 'visible', timeout: 5_000 });

 // dispatchEvent('click') fires a raw Event that React/Radix
 // processes unreliably (label may not update). Use force:true click instead —
 // the row.scrollIntoViewIfNeeded above ensures the calendar is in viewport.
 // Poll for the status label change instead of a fixed timeout to avoid race conditions.
    let currentLabel = (await dialog.getByRole('status').textContent() || '').trim();
    let safety = 0;
    while (currentLabel !== targetLabel && safety < 24) {
      const labelParts = currentLabel.split(' ');
      const curMonthName = labelParts[0] || '';
      const curYearStr = labelParts[1] || '0';
      const curMonthIdx = LocationPricingPage.MONTH_NAMES.indexOf(curMonthName);
      const curYear = parseInt(curYearStr);
      const diff = (yearNum - curYear) * 12 + ((monthNum - 1) - curMonthIdx);
      if (diff === 0) break;
      const navBtn = diff > 0
        ? dialog.getByRole('button', { name: 'Go to the Next Month' })
        : dialog.getByRole('button', { name: 'Go to the Previous Month' });
 // dispatchEvent('click') fires a raw Event that React ignores.
 // Regular .click and .click({force:true}) fail with "outside viewport" for rows
 // near the bottom of the grid. HTMLElement.click (via evaluate) bypasses viewport
 // checks entirely and fires a real click event that React's synthetic event system handles.
      await navBtn.evaluate((el) => (el as HTMLElement).click());
 // Poll until the status label changes (React re-render is async)
      const oldLabel = currentLabel;
      for (let i = 0; i < 20; i++) {
        await this.page.waitForTimeout(50);
        currentLabel = (await dialog.getByRole('status').textContent() || '').trim();
        if (currentLabel !== oldLabel) break;
      }
      safety++;
    }

 // Click the target day cell — use regular click (day cells are inside the visible dialog,
 // unlike month nav buttons which can be outside viewport). Regular click triggers Radix
 // event handlers that update the date value in Angular's model.
    const suffix = this.getOrdinalSuffix(dayNum);
    const dayPattern = `${targetMonthName} ${dayNum}${suffix}, ${yearNum}`;
    await dialog
      .getByRole('gridcell', { name: new RegExp(dayPattern) })
      .getByRole('button')
      .click();
  }

  async enableFullCascade(priceBookName: string): Promise<void> {
    await this.checkIsAlternative(priceBookName);
 // checkbox cascade is async — poll until Use Effective Date is enabled
 // before clicking it. Without this, checkUseEffectiveDate hits a disabled checkbox (no-op).
    let cascadeReady = false;
    for (let i = 0; i < 20; i++) {
      const state = await this.getUseEffectiveDateState(priceBookName);
      if (!state.disabled) { cascadeReady = true; break; }
      await this.page.waitForTimeout(250);
    }
    if (!cascadeReady) {
      Log.warn(`[WARN] UseEffectiveDate still disabled after 5s poll for ${priceBookName}`);
    }
    await this.checkUseEffectiveDate(priceBookName);
    Log.info(`Full cascade enabled for ${priceBookName}`);
  }

  async getReadOnlyColumnInteractiveCount(priceBookName: string): Promise<number> {
    const row = this.page.locator(DynamicSelectors.rowPriceBook(priceBookName));
    let total = 0;
    for (const colIdx of [1, 2, 3]) {
      const cell = row.locator(`td:nth-child(${colIdx})`);
      total += await cell.locator('button, input, [role="checkbox"], [role="combobox"]').count();
    }
    Log.info(`Read-only columns [${priceBookName}]: ${total} interactive elements`);
    return total;
  }

 /**
 * This does NOT save or reload — it only tidies the live grid between assertions in the same test.
 * The authoritative per-test reset of persisted grid state is ensureDefaultState (run in beforeEach),
 * which re-reads after reload and re-drives until the server actually shows defaults. Do not add a
 * save here, or it will fight the baseline reset.
 */
  async resetGridRow(priceBookName: string): Promise<void> {
    await this.uncheckIsAlternative(priceBookName);
    Log.info(`Row reset (in-grid only, not persisted): ${priceBookName}`);
  }

  async isSaveEnabled(): Promise<boolean> {
    const el = this.getElement('btnSavePricing');
    const disabled = await el.isDisabled().catch(() => true);
    Log.info(`Pricing Save enabled: ${!disabled}`);
    return !disabled;
  }

  async waitForSaveEnabled(saveBtnKey = 'btnSavePricing', timeout = 5_000): Promise<boolean> {
    return super.waitForSaveEnabled(saveBtnKey, timeout);
  }

  async clickSave(): Promise<{ success: boolean; networkError?: string }> {
    return this.clickSaveWithDialog('btnSavePricing');
  }

  async saveAndConfirm(): Promise<void> {
    const result = await this.clickSave();
    if (!result.success) {
      throw new Error(`Pricing save failed: ${result.networkError ?? 'unknown error'}`);
    }
  }

 /**
 * Per-test baseline: restore the net-zero-vulnerable fields to their default state so a crashed
 * prior run cannot make the next test's change a no-op. Resets the two top checkboxes and clears
 * Is Alternative on the given price-book rows.
 *
 * Bounded retry (max 3) wraps the whole cycle — read → reset → save → reload → re-verify — because
 * a save reports success even when the Save button was disabled (so save-success alone never proves
 * the reset landed). The post-reload re-read against persisted state is the load-bearing check; if
 * it still shows non-default, the loop resets again, then throws after 3 cycles. The happy path
 * (already at defaults) returns after reads only — no save, no reload — so it stays fast on this
 * heavy tab.
 */
  async ensureDefaultState(
    defaults: { corporatePricing: boolean; priceGuideInclusive: boolean; gridRows: readonly string[] },
    officeNo: string = '1604',
  ): Promise<void> {
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let dirty = false;
      if ((await this.getCheckboxState('chkCorporatePricing')).checked !== defaults.corporatePricing) {
        await this.setRadixCheckbox('chkCorporatePricing', defaults.corporatePricing);
        dirty = true;
      }
      if ((await this.getCheckboxState('chkPriceGuideInclusive')).checked !== defaults.priceGuideInclusive) {
        await this.setRadixCheckbox('chkPriceGuideInclusive', defaults.priceGuideInclusive);
        dirty = true;
      }
      for (const row of defaults.gridRows) {
        if ((await this.getIsAlternativeState(row)).checked) {
          await this.uncheckIsAlternative(row);
          dirty = true;
        }
      }
      if (!dirty) return; // already at defaults — fast path, no save/reload

      await this.saveAndConfirm();
      await this.reloadPricingTab(officeNo);

      const corpOk = (await this.getCheckboxState('chkCorporatePricing')).checked === defaults.corporatePricing;
      const guideOk = (await this.getCheckboxState('chkPriceGuideInclusive')).checked === defaults.priceGuideInclusive;
      let rowsOk = true;
      for (const row of defaults.gridRows) {
        if ((await this.getIsAlternativeState(row)).checked) { rowsOk = false; break; }
      }
      if (corpOk && guideOk && rowsOk) return;
    }
    throw new Error(`ensureDefaultState: Pricing not at defaults after ${maxAttempts} attempts`);
  }

  async clickSaveButton(): Promise<void> {
    const el = this.getElement('btnSavePricing');
    await el.click();
    await this.getElement('dlgSaveChanges').waitFor({ state: 'visible', timeout: 5_000 });
    Log.info('Clicked Save button — dialog opened');
  }

  async clickSaveCancel(): Promise<void> {
    await this.getElement('btnSaveChangesCancel').click();
    await this.getElement('dlgSaveChanges').waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
    Log.info('Clicked Save Cancel — dialog dismissed');
  }

  async isSaveDialogVisible(): Promise<boolean> {
    return this.getElement('dlgSaveChanges').isVisible();
  }

  /** The page-scoped changes (widened viewport, suppressed beforeunload) are not
   * restored here — the viewport is harmless for later tests and the suppression resets on the
   * next test's page reload. */
  async clickSidebarHome(): Promise<void> {
    const homeLink = this.page.getByRole('link', { name: 'Home' });
    if (!await homeLink.isVisible().catch(() => false)) {
      await this.page.setViewportSize({ width: 1920, height: 1080 });
      await homeLink.waitFor({ state: 'visible', timeout: 5_000 });
    }
 // Suppress beforeunload so the app-level "Unsaved changes" alertdialog fires instead
    await this.page.evaluate(() => {
      window.onbeforeunload = null;
      window.addEventListener('beforeunload', (e) => e.stopImmediatePropagation(), true);
    });
    await homeLink.click();
  }

  async isUnsavedDialogVisible(): Promise<boolean> {
    const dlg = this.page.locator('[data-testid="location-settings-modal-unsaved-changes"]');
    return dlg.waitFor({ state: 'visible', timeout: 5_000 }).then(() => true).catch(() => false);
  }

  async clickUnsavedStay(): Promise<void> {
    const dlg = this.page.locator('[data-testid="location-settings-modal-unsaved-changes"]');
    await dlg.locator('button:has-text("Stay")').click();
    await dlg.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
    Log.info('Clicked Stay on Unsaved Changes dialog');
  }
}
