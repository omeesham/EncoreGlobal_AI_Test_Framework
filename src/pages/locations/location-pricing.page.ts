import { Page } from '@playwright/test';
import { BasePage } from '../base.page';
import { Log } from '../../utils/logger';
import { IConfig } from '../../types';
import { DynamicSelectors } from '../../selectors';
import { SetupPricingSelectors } from '../../selectors/locations/pricing';
import { GRID_PREF_STORAGE_KEY, PRICING_MESSAGES, SAVE_API_ROUTES } from '../../data/locations/location-pricing';
import { CheckboxState } from '../components/location-form-helpers.component';
import { step } from '../../fixtures/step-decorator';

export class LocationPricingPage extends BasePage {
  constructor(page: Page, config?: IConfig) {
    super(page, config);
    Log.info('LocationPricingPage initialized');
  }

  @step('Navigate to pricing tab')
  async navigateToPricingTab(officeNo: string = '1604'): Promise<void> {
 // navigateToSubTab waits 30s for the Pricing form to become visible. On e2e that limit is
 // genuinely exceeded now and then — the base page's own note records contention pushing
 // form-visible past 15s — and when it is, the whole case fails on a slow render rather than on
 // anything it set out to test. One reload-and-retry absorbs that without hiding a real break:
 // a form that never appears still fails, just on the second attempt.
    try {
      await this.navigateToSubTab('tabPricing', 'chkCorporatePricing', officeNo);
    } catch (error) {
      Log.warn(`Pricing form did not render in time (${(error as Error).message.split('\n')[0]}) — reloading and retrying once`);
      const base = this.config?.base_url || '';
      await this.safeNavigateTo(`${base}locations/${officeNo}/settings/location`, { waitUntil: 'domcontentloaded' });
      await this.navigateToSubTab('tabPricing', 'chkCorporatePricing', officeNo);
    }
 // Wait for pricing API to populate persisted checkbox states (default render is unchecked).
    await this.waitForPricingDataLoaded();
  }

 // Encore sub-tabs share one `settings/location` URL, so URL detection is unreliable;
 // aria-selected is the only trustworthy signal.
  @step('Is on pricing tab')
  async isOnPricingTab(): Promise<boolean> {
    const tab = this.getElement('tabPricing');
    if ((await tab.count()) === 0) return false;
    return (await tab.getAttribute('aria-selected').catch(() => null)) === 'true';
  }

  @step('Reload pricing tab')
  async reloadPricingTab(officeNo: string = '1604'): Promise<void> {
    const base = this.config?.base_url || '';
 // After Save→Cancel, form stays dirty. safeNavigateTo handles beforeunload dialog.
    await this.safeNavigateTo(`${base}locations`, { waitUntil: 'domcontentloaded' });
    await this.navigateToPricingTab(officeNo);
  }

 // The tab renders default checkbox/dropdown state before the API response binds persisted
 // values, and network-idle alone does not cover Angular's post-response binding gap.
  @step('Wait for pricing data loaded')
  async waitForPricingDataLoaded(): Promise<void> {
    await this.waitForAngularStable();
 // Signal 1: grid rows only render after the pricing API responds, and every office has
 // price-book rows, so a non-zero count is an office-independent readiness proof.
    const gridReady = await this.page.waitForFunction(
      () => document.querySelectorAll('[role="tabpanel"] table tbody tr').length > 0,
      undefined,
      { timeout: 20_000 },
    ).then(() => true).catch(() => false);
 // Signal 2: a non-empty Primary Labor label means Angular has bound persisted values
 // rather than the empty pre-render placeholder.
    const dropdownReady = await this.page.waitForFunction(
      (sel) => (((document.querySelector(sel)?.textContent) ?? '').trim().length > 0),
      '[data-testid="location-settings-select-primary-labor-pricing-usd"]',
      { timeout: 10_000 },
    ).then(() => true).catch(() => false);
    await this.waitForAngularStable();
 // Both signals failing means a stale/empty render, not real data — fail loudly.
    if (!gridReady && !dropdownReady) {
      throw new Error(
        'waitForPricingDataLoaded: neither the pricing grid nor the Primary Labor dropdown became ready within timeout — the Pricing tab did not populate.',
      );
    }
  }

  @step('Get checkbox state')
  async getCheckboxState(selectorKey: string): Promise<CheckboxState> {
    return this.getRadixCheckboxState(selectorKey);
  }

  @step('Check checkbox')
  async checkCheckbox(selectorKey: string): Promise<void> {
    await this.setRadixCheckbox(selectorKey, true);
  }

  @step('Uncheck checkbox')
  async uncheckCheckbox(selectorKey: string): Promise<void> {
    await this.setRadixCheckbox(selectorKey, false);
  }

 // Presence, NOT enabled-ness. isDropdownEnabled() reports false for a missing element as well as
 // for a disabled one, so it cannot tell "this currency group is not rendered for this office"
 // from "it is rendered but greyed out". Offices differ in which currency groups exist at all
 // (1604 USD-only, 7147 USD+MXN, 1605 USD+CAD+MXN), so that distinction matters.
  @step('Is dropdown present')
  async isDropdownPresent(selectorKey: string): Promise<boolean> {
    return (await this.getElement(selectorKey).count()) > 0;
  }

 /** Count of the given dropdown keys that are actually rendered on the current office. */
  @step('Count present dropdowns')
  async countPresentDropdowns(keys: readonly string[]): Promise<number> {
    let present = 0;
    for (const key of keys) {
      if (await this.isDropdownPresent(key)) present++;
    }
    return present;
  }

  @step('Is dropdown enabled')
  async isDropdownEnabled(selectorKey: string): Promise<boolean> {
    const el = this.getElement(selectorKey);
    const disabled = await el.isDisabled().catch(() => true);
    Log.info(`${selectorKey} enabled: ${!disabled}`);
    return !disabled;
  }

  @step('Get dropdown value')
  async getDropdownValue(selectorKey: string): Promise<string> {
    return this.getFieldDisplayValue(selectorKey);
  }

  @step('Verify primary dropdown states')
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

 /** Skips interaction when already selected: re-clicking an option deselects it (Radix toggle). */
  @step('Select primary dropdown option')
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

 // Clears by re-clicking the current selection — Radix treats that as a deselect back to
 // "--Select--". No-op when already unset.
  @step('Clear primary dropdown')
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

  @step('Get currency filter value')
  async getCurrencyFilterValue(): Promise<string> {
    return this.getFieldDisplayValue('drpCurrencyFilter');
  }

 /** The outer try/finally fires Escape on the failure path if the upstream open throws
 * before BasePage's internal Escape runs — a safe no-op if the popover is already closed. */
  @step('Get currency filter options')
  async getCurrencyFilterOptions(): Promise<string[]> {
    try {
      return await this.getComboboxOptions('drpCurrencyFilter');
    } finally {
      await this.page.keyboard.press('Escape').catch(() => {});
    }
  }

  @step('Select currency filter')
  async selectCurrencyFilter(optionText: string): Promise<void> {
    await this.getElement('drpCurrencyFilter').click();
    await this.page.waitForTimeout(500);
    const option = this.page.locator(DynamicSelectors.optCurrencyFilter(optionText));
    await option.waitFor({ state: 'visible', timeout: 5_000 });
    await option.click();
    Log.info(`Currency filter -> ${optionText}`);
  }

  @step('Get column headers')
  async getColumnHeaders(): Promise<string[]> {
    return this.getColumnHeadersByKeys([
      'colHeaderPricingStrategy', 'colHeaderPricebook', 'colHeaderCurrency',
      'colHeaderIsAlternative', 'colHeaderUseEffectiveDate',
      'colHeaderStartDate', 'colHeaderEndDate',
    ]);
  }

  @step('Is grid row visible')
  async isGridRowVisible(priceBookName: string): Promise<boolean> {
    const selector = DynamicSelectors.rowPriceBook(priceBookName);
    const count = await this.page.locator(selector).count();
    Log.info(`Row "${priceBookName}" present: ${count > 0}`);
    return count > 0;
  }

  @step('Is grid row displayed')
  async isGridRowDisplayed(priceBookName: string): Promise<boolean> {
    const selector = DynamicSelectors.rowPriceBook(priceBookName);
    const loc = this.page.locator(selector);
    const count = await loc.count();
    if (count === 0) return false;
    return loc.first().isVisible().catch(() => false);
  }

  @step('Get grid row count')
  async getGridRowCount(): Promise<number> {
    const count = await this.page.locator('[role="tabpanel"] table tbody tr').count();
    Log.info(`Grid row count: ${count}`);
    return count;
  }

  @step('Get is alternative state')
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

  @step('Get use effective date state')
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

  @step('Check is alternative')
  async checkIsAlternative(priceBookName: string): Promise<void> {
    const state = await this.getIsAlternativeState(priceBookName);
    if (!state.checked) {
      const selector = DynamicSelectors.chkIsAlternative(priceBookName);
      await this.page.locator(selector).click();
      Log.info(`Checked Is Alternative: ${priceBookName}`);
    }
  }

  @step('Uncheck is alternative')
  async uncheckIsAlternative(priceBookName: string): Promise<void> {
    const state = await this.getIsAlternativeState(priceBookName);
    if (state.checked) {
      const selector = DynamicSelectors.chkIsAlternative(priceBookName);
      await this.page.locator(selector).click();
      Log.info(`Unchecked Is Alternative: ${priceBookName}`);
    }
  }

  @step('Check use effective date')
  async checkUseEffectiveDate(priceBookName: string): Promise<void> {
    const state = await this.getUseEffectiveDateState(priceBookName);
    if (!state.checked) {
      const selector = DynamicSelectors.chkUseEffectiveDate(priceBookName);
      await this.page.locator(selector).click();
      Log.info(`Checked Use Effective Date: ${priceBookName}`);
    }
  }

  @step('Uncheck use effective date')
  async uncheckUseEffectiveDate(priceBookName: string): Promise<void> {
    const state = await this.getUseEffectiveDateState(priceBookName);
    if (state.checked) {
      const selector = DynamicSelectors.chkUseEffectiveDate(priceBookName);
      await this.page.locator(selector).click();
      Log.info(`Unchecked Use Effective Date: ${priceBookName}`);
    }
  }

  @step('Is start date enabled')
  async isStartDateEnabled(priceBookName: string): Promise<boolean> {
    const selector = DynamicSelectors.dtpStartDate(priceBookName);
    const el = this.page.locator(selector);
    const disabled = await el.isDisabled().catch(() => true);
    Log.info(`Start Date [${priceBookName}] enabled: ${!disabled}`);
    return !disabled;
  }

  @step('Is end date enabled')
  async isEndDateEnabled(priceBookName: string): Promise<boolean> {
    const selector = DynamicSelectors.dtpEndDate(priceBookName);
    const el = this.page.locator(selector);
    const disabled = await el.isDisabled().catch(() => true);
    Log.info(`End Date [${priceBookName}] enabled: ${!disabled}`);
    return !disabled;
  }

  @step('Get start date value')
  async getStartDateValue(priceBookName: string): Promise<string> {
    const selector = DynamicSelectors.dtpStartDate(priceBookName);
    const input = this.page.locator(selector);
    return (await input.inputValue().catch(() => '')).trim();
  }

  @step('Get end date value')
  async getEndDateValue(priceBookName: string): Promise<string> {
    const selector = DynamicSelectors.dtpEndDate(priceBookName);
    const input = this.page.locator(selector);
    return (await input.inputValue().catch(() => '')).trim();
  }

  @step('Enter start date')
  async enterStartDate(priceBookName: string, dateValue: string): Promise<void> {
    await this.selectDateFromCalendar(priceBookName, 6, dateValue);
    Log.info(`Entered Start Date [${priceBookName}]: ${dateValue}`);
  }

  @step('Enter end date')
  async enterEndDate(priceBookName: string, dateValue: string): Promise<void> {
    await this.selectDateFromCalendar(priceBookName, 7, dateValue);
    Log.info(`Entered End Date [${priceBookName}]: ${dateValue}`);
  }

  @step('Is start date read only')
  async isStartDateReadOnly(priceBookName: string): Promise<boolean> {
    const selector = DynamicSelectors.dtpStartDate(priceBookName);
    const el = this.page.locator(selector);
    return (await el.getAttribute('readonly')) !== null;
  }

  @step('Is end date read only')
  async isEndDateReadOnly(priceBookName: string): Promise<boolean> {
    const selector = DynamicSelectors.dtpEndDate(priceBookName);
    const el = this.page.locator(selector);
    return (await el.getAttribute('readonly')) !== null;
  }

 /** Caller must leave the calendar popover open — the tooltip only renders while it is. */
  @step('Has date validation error')
  async hasDateValidationError(): Promise<boolean> {
    const msg = this.page.locator('text=/Pricing Effective.*date.*must be set/');
    return (await msg.count()) > 0;
  }

  @step('Open start date popover')
  async openStartDatePopover(priceBookName: string): Promise<void> {
    const row = this.page.locator(DynamicSelectors.rowPriceBook(priceBookName));
    const cell = row.locator('td:nth-child(6)');
    await cell.getByRole('button', { name: 'Open calendar' }).click();
    const dialog = this.page.getByRole('dialog', { name: 'Popover Content' });
    await dialog.waitFor({ state: 'visible', timeout: 5_000 });
    Log.info(`Opened Start Date popover for ${priceBookName}`);
  }

  @step('Open end date popover')
  async openEndDatePopover(priceBookName: string): Promise<void> {
    const row = this.page.locator(DynamicSelectors.rowPriceBook(priceBookName));
    const cell = row.locator('td:nth-child(7)');
    await cell.getByRole('button', { name: 'Open calendar' }).click();
    const dialog = this.page.getByRole('dialog', { name: 'Popover Content' });
    await dialog.waitFor({ state: 'visible', timeout: 5_000 });
    Log.info(`Opened End Date popover for ${priceBookName}`);
  }

  @step('Close date popover')
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
    const cell = row.locator(`td:nth-child(${colIndex})`);
 // The trigger is a native <button aria-label="Open calendar"> gated by the disabled property
 // (not aria-disabled), and after enableFullCascade Angular needs a render cycle to drop it —
 // so wait for the enabled trigger rather than reading it once.
    const trigger = cell.locator('button[aria-label="Open calendar"]:not([disabled])');
    const dialog = this.page.getByRole('dialog', { name: 'Popover Content' });

 // The popover is anchored to a row inside a VIRTUALIZED grid. When Angular re-renders the row
 // model the anchor unmounts and Radix tears the popover down mid-navigation — intermittently,
 // which is why a single-pass version passes for several runs and then fails twice in a row.
 // Each attempt therefore re-opens from scratch; nothing is carried over from a torn-down popover.
    const attempts = 3;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
 // Scroll the row into view BEFORE opening — scrolling with the popover open closes it.
        await row.scrollIntoViewIfNeeded();
        await trigger.waitFor({ state: 'visible', timeout: 10_000 });
        await trigger.click();
        await dialog.waitFor({ state: 'visible', timeout: 5_000 });

 // Short timeout: if the popover has been torn down, fail this attempt fast and re-open,
 // rather than burning the default 10s on every poll iteration.
        const readLabel = async (): Promise<string> =>
          ((await dialog.getByRole('status').textContent({ timeout: 2_000 })) || '').trim();

 // Poll the status label rather than sleeping — Radix re-renders the month header async.
        let currentLabel = await readLabel();
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
 // Playwright clicks fail "outside viewport" for rows near the grid bottom; HTMLElement.click
 // skips the viewport check and still fires an event React's synthetic system handles.
          await navBtn.evaluate((el) => (el as HTMLElement).click());
 // Poll until the status label changes (React re-render is async)
          const oldLabel = currentLabel;
          for (let i = 0; i < 20; i++) {
            await this.page.waitForTimeout(50);
            currentLabel = await readLabel();
            if (currentLabel !== oldLabel) break;
          }
          safety++;
        }
        if (currentLabel !== targetLabel) {
          throw new Error(`Calendar stopped on "${currentLabel}", expected "${targetLabel}"`);
        }

 // Day cells sit inside the visible dialog, so a regular click works here and drives the
 // Radix handlers that update Angular's model.
        const suffix = this.getOrdinalSuffix(dayNum);
        const dayPattern = `${targetMonthName} ${dayNum}${suffix}, ${yearNum}`;
        await dialog
          .getByRole('gridcell', { name: new RegExp(dayPattern) })
          .getByRole('button')
          .click();
        return;
      } catch (error) {
        if (attempt === attempts) throw error;
        Log.warn(`Calendar attempt ${attempt}/${attempts} for ${priceBookName} failed (${(error as Error).message.split('\n')[0]}) — reopening`);
 // Leave no half-open popover behind for the next attempt.
        await this.page.keyboard.press('Escape').catch(() => {});
        await dialog.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => {});
      }
    }
  }

  @step('Enable full cascade')
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

  @step('Get read only column interactive count')
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

 // In-grid tidy only — never add a save here, it would fight ensureDefaultState, which owns
 // the persisted baseline reset.
  @step('Reset grid row')
  async resetGridRow(priceBookName: string): Promise<void> {
    await this.uncheckIsAlternative(priceBookName);
    Log.info(`Row reset (in-grid only, not persisted): ${priceBookName}`);
  }

 // ── Grid view-state (sort + column visibility) ──────────────────────────────
 // The grid writes these to localStorage and they SURVIVE A FULL RELOAD, so without this reset a
 // test that sorts silently changes row order for every test after it.

 /** Safe to call before the first navigation: on about:blank (or any non-app origin) the evaluate
  * itself throws, which is not a failure — there is no stored preference to clear yet. */
  @step('Clear grid preferences')
  async clearGridPreferences(): Promise<void> {
    const cleared = await this.page.evaluate((key) => {
      try { window.localStorage.removeItem(key); return true; } catch { return false; }
    }, GRID_PREF_STORAGE_KEY).catch(() => false);
    Log.info(`Clear pricing grid view preferences: ${cleared ? 'cleared' : 'no accessible storage (pre-navigation or blocked)'}`);
  }

  @step('Read grid preferences')
  async readGridPreferences(): Promise<{ sorting: Array<{ id: string; desc: boolean }>; columnVisibility: Record<string, boolean> } | null> {
    return this.page.evaluate((key) => {
      try {
        const raw = window.localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      } catch { return null; }
    }, GRID_PREF_STORAGE_KEY);
  }

 // Sort indicator is a text glyph in the header's trailing span — there is no aria-sort.
  @step('Sort by column')
  async sortByColumn(columnKey: string): Promise<void> {
    await this.getElement(columnKey).click();
    await this.waitForAngularStable();
    Log.info(`Sorted by ${columnKey}`);
  }

  @step('Get sort indicator')
  async getSortIndicator(columnKey: string): Promise<'asc' | 'desc' | 'none'> {
    const glyph = (await this.getElement(columnKey).locator('span').last().textContent().catch(() => '') ?? '').trim();
    if (glyph.includes('↑')) return 'asc';
    if (glyph.includes('↓')) return 'desc';
    return 'none';
  }

 // Content anchor for sort assertions — never assert by row index (the grid is virtualized).
  @step('Get first row strategy')
  async getFirstRowStrategy(): Promise<string> {
    const cell = this.page.locator(`${SetupPricingSelectors.pnlPricingContent} tbody tr td:nth-child(1)`).first();
    return (await cell.textContent().catch(() => '') ?? '').trim();
  }

  @step('Get rendered row strategies')
  async getRenderedRowStrategies(): Promise<string[]> {
    const cells = this.page.locator(`${SetupPricingSelectors.pnlPricingContent} tbody tr td:nth-child(1)`);
    return (await cells.allTextContents()).map((t) => t.trim()).filter(Boolean);
  }

  @step('Open grid options')
  async openGridOptions(): Promise<void> {
    await this.getElement('btnPricingGridOptions').click();
    await this.page.locator('[role="menu"]').waitFor({ state: 'visible', timeout: 5_000 });
  }

  @step('Get grid options columns')
  async getGridOptionsColumns(): Promise<Array<{ name: string; checked: boolean }>> {
    const items = this.page.locator('[role="menu"] [role="menuitemcheckbox"]');
    const count = await items.count();
    const out: Array<{ name: string; checked: boolean }> = [];
    for (let i = 0; i < count; i++) {
      const item = items.nth(i);
      out.push({
        name: ((await item.textContent()) ?? '').trim(),
        checked: (await item.getAttribute('aria-checked')) === 'true',
      });
    }
    return out;
  }

 /** Opens the menu, toggles one column, and waits for it to close — the menu dismisses per toggle,
  * so callers toggling several columns must call this once per column. */
  @step('Toggle grid column')
  async toggleGridColumn(columnName: string): Promise<void> {
    await this.openGridOptions();
    await this.page.locator(DynamicSelectors.mnuColumnToggle(columnName)).click();
    await this.page.locator('[role="menu"]').waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
    Log.info(`Toggled grid column: ${columnName}`);
  }

 // Reads the headers actually rendered, which is what column-visibility cases assert against.
 // getColumnHeaders() reads the seven by fixed key and cannot see a hidden column.
  @step('Get visible column headers')
  async getVisibleColumnHeaders(): Promise<string[]> {
    const headers = this.page.locator(`${SetupPricingSelectors.pnlPricingContent} thead th`);
    return (await headers.allTextContents()).map((t) => t.trim());
  }

  @step('Get first row cell count')
  async getFirstRowCellCount(): Promise<number> {
    return this.page.locator(`${SetupPricingSelectors.pnlPricingContent} tbody tr`).first().locator('td').count();
  }

 // ── Settings panel collapse ─────────────────────────────────────────────────

  @step('Toggle settings panel')
  async toggleSettingsPanel(): Promise<void> {
    await this.getElement('btnToggleSettingsPanel').click();
    await this.waitForAngularStable();
  }

  @step('Is settings panel expanded')
  async isSettingsPanelExpanded(): Promise<boolean> {
 // The button advertises the action it WILL perform, so "Collapse ..." means currently expanded.
    const label = await this.getElement('btnToggleSettingsPanel').getAttribute('aria-label').catch(() => null);
    return (label ?? '').startsWith('Collapse');
  }

 // ── Dropdown popover introspection ──────────────────────────────────────────

  @step('Get dropdown option count')
  async getDropdownOptionCount(selectorKey: string): Promise<number> {
    await this.getElement(selectorKey).click();
    const dialog = this.page.getByRole('dialog', { name: 'Popover Content' });
    await dialog.waitFor({ state: 'visible', timeout: 5_000 });
    const count = await dialog.getByRole('button').count();
    await this.page.keyboard.press('Escape').catch(() => {});
    await dialog.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => {});
    return count;
  }

 /** Returns the option labels left after typing `term`, or [] when the list renders its
  * "No pricing strategy found." empty state. Always closes the popover. */
  @step('Search dropdown options')
  async searchDropdownOptions(selectorKey: string, term: string): Promise<{ options: string[]; emptyMessage: string | null }> {
    await this.getElement(selectorKey).click();
    const dialog = this.page.getByRole('dialog', { name: 'Popover Content' });
    await dialog.waitFor({ state: 'visible', timeout: 5_000 });
    try {
      await dialog.getByRole('textbox', { name: 'Search pricing strategies...' }).fill(term);
      await this.waitForAngularStable(3_000);
      const options = (await dialog.getByRole('button').allTextContents()).map((t) => t.trim()).filter(Boolean);
      const text = ((await dialog.textContent()) ?? '').trim();
      return {
        options,
        emptyMessage: options.length === 0 && text.includes(PRICING_MESSAGES.noPricingStrategyFound)
          ? PRICING_MESSAGES.noPricingStrategyFound
          : null,
      };
    } finally {
      await this.page.keyboard.press('Escape').catch(() => {});
      await dialog.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => {});
    }
  }

 // ── Date-cell validation affordances (§2.1 announce + escape oracle) ────────

 /** True when the cell renders its invalid treatment. Start Date uses a red border, End Date a red
  * ring + tint, so both class families are matched. Async (LR-010) — poll this, never read once. */
  @step('Is date cell invalid')
  async isDateCellInvalid(priceBookName: string, which: 'start' | 'end'): Promise<boolean> {
    const col = which === 'start' ? 6 : 7;
    const cell = this.page.locator(DynamicSelectors.rowPriceBook(priceBookName)).first().locator(`td:nth-child(${col})`);
    const html = (await cell.innerHTML().catch(() => '')) ?? '';
    return /border-red-500|ring-red-500/.test(html);
  }

 /** The rejection message, or null when the invalid cell offers none. Start Date wraps its input in
  * a tooltip trigger that reveals the message on hover; End Date has no trigger (BUG-LOC-PRI-002). */
  @step('Get date validation message')
  async getDateValidationMessage(priceBookName: string, which: 'start' | 'end'): Promise<string | null> {
    const col = which === 'start' ? 6 : 7;
    const cell = this.page.locator(DynamicSelectors.rowPriceBook(priceBookName)).first().locator(`td:nth-child(${col})`);

 // The two date cells announce themselves DIFFERENTLY, so both have to be read:
 //  - Start Date uses a Radix tooltip ([data-slot="tooltip-trigger"] + [role="tooltip"]).
 //  - End Date uses a NATIVE title attribute (title="Invalid date"), which the browser renders
 //    as chrome — it never appears in the DOM, so a [role="tooltip"] query cannot see it.
 // Reading only the Radix form made this method return null for a field that IS announced, which
 // is what produced the false BUG-LOC-PRI-002 report (withdrawn 2026-09-23).
    const titled = cell.locator('[title]:not([title=""])').first();
    if (await titled.count() > 0) {
      const title = (await titled.getAttribute('title')) ?? '';
      if (title.trim()) return title.trim();
    }

    if (await cell.locator('[data-slot="tooltip-trigger"]').count() === 0) return null;
    await cell.locator('input').hover();
    const tip = this.page.locator('[role="tooltip"], [data-slot="tooltip-content"]').first();
    if (!(await tip.waitFor({ state: 'visible', timeout: 3_000 }).then(() => true).catch(() => false))) return null;
    return ((await tip.textContent()) ?? '').trim();
  }

 // Types straight into the cell — the inputs are not readonly, so this avoids driving the calendar
 // popover when a test only needs a value present.
  @step('Type date directly')
  async typeDateDirectly(priceBookName: string, which: 'start' | 'end', value: string): Promise<void> {
    const col = which === 'start' ? 6 : 7;
    const input = this.page.locator(DynamicSelectors.rowPriceBook(priceBookName)).first().locator(`td:nth-child(${col}) input`);
    await input.click();
    await input.fill('');
    await input.pressSequentially(value, { delay: 20 });
    await this.page.keyboard.press('Tab');
    Log.info(`Typed ${which} date "${value}" for ${priceBookName}`);
  }

  @step('Is save enabled')
  async isSaveEnabled(): Promise<boolean> {
    const el = this.getElement('btnSavePricing');
    const disabled = await el.isDisabled().catch(() => true);
    Log.info(`Pricing Save enabled: ${!disabled}`);
    return !disabled;
  }

  @step('Wait for save enabled')
  async waitForSaveEnabled(saveBtnKey = 'btnSavePricing', timeout = 5_000): Promise<boolean> {
    return super.waitForSaveEnabled(saveBtnKey, timeout);
  }

  @step('Click save')
  async clickSave(): Promise<{ success: boolean; networkError?: string }> {
    return this.clickSaveWithDialog('btnSavePricing');
  }

  @step('Save and confirm')
  async saveAndConfirm(): Promise<void> {
    const result = await this.clickSave();
    if (!result.success) {
      throw new Error(`Pricing save failed: ${result.networkError ?? 'unknown error'}`);
    }
  }

 // Retries because a save reports success even when the Save button was disabled; only the
 // post-reload re-read proves the reset persisted.
  @step('Ensure default state')
  async ensureDefaultState(
    defaults: { corporatePricing: boolean; priceGuideInclusive: boolean; enablePriceEscalator?: boolean; gridRows: readonly string[] },
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
      if (defaults.enablePriceEscalator !== undefined
        && (await this.getCheckboxState('chkEnablePriceEscalator')).checked !== defaults.enablePriceEscalator) {
        await this.setRadixCheckbox('chkEnablePriceEscalator', defaults.enablePriceEscalator);
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
      const escalatorOk = defaults.enablePriceEscalator === undefined
        || (await this.getCheckboxState('chkEnablePriceEscalator')).checked === defaults.enablePriceEscalator;
      let rowsOk = true;
      for (const row of defaults.gridRows) {
        if ((await this.getIsAlternativeState(row)).checked) { rowsOk = false; break; }
      }
      if (corpOk && guideOk && escalatorOk && rowsOk) return;
    }
    throw new Error(`ensureDefaultState: Pricing not at defaults after ${maxAttempts} attempts`);
  }

  @step('Click save button')
  async clickSaveButton(): Promise<void> {
    const el = this.getElement('btnSavePricing');
    await el.click();
    await this.getElement('dlgSaveChanges').waitFor({ state: 'visible', timeout: 5_000 });
    Log.info('Clicked Save button — dialog opened');
  }

  @step('Click save cancel')
  async clickSaveCancel(): Promise<void> {
    await this.getElement('btnSaveChangesCancel').click();
    await this.getElement('dlgSaveChanges').waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
    Log.info('Clicked Save Cancel — dialog dismissed');
  }

  @step('Is save dialog visible')
  async isSaveDialogVisible(): Promise<boolean> {
    return this.getElement('dlgSaveChanges').isVisible();
  }

  // Leaves the widened viewport and beforeunload suppression in place — both reset on the
  // next test's page reload.
  @step('Click sidebar home')
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

  @step('Is unsaved dialog visible')
  async isUnsavedDialogVisible(): Promise<boolean> {
    const dlg = this.page.locator('[data-testid="location-settings-modal-unsaved-changes"]');
    return dlg.waitFor({ state: 'visible', timeout: 5_000 }).then(() => true).catch(() => false);
  }

  @step('Click unsaved stay')
  async clickUnsavedStay(): Promise<void> {
    const dlg = this.page.locator('[data-testid="location-settings-modal-unsaved-changes"]');
    await dlg.locator('button:has-text("Stay")').click();
    await dlg.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
    Log.info('Clicked Stay on Unsaved Changes dialog');
  }

  @step('Click unsaved discard')
  async clickUnsavedDiscard(): Promise<void> {
    const dlg = this.page.locator('[data-testid="location-settings-modal-unsaved-changes"]');
    await dlg.locator('button:has-text("Discard")').click();
    await dlg.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
    // The dialog hides before the route change lands. Without waiting for the URL to leave the
    // settings path, navigateToSubTab sees the old URL, skips navigation entirely, and the dirty
    // in-memory form survives the Discard.
    await this.page.waitForURL((u) => !u.toString().includes('/settings/'), { timeout: 15_000 });
    Log.info(`Clicked Discard on Unsaved Changes dialog -> ${this.page.url()}`);
  }

  @step('Get unsaved dialog content')
  async getUnsavedDialogContent(): Promise<{ text: string; buttons: string[] }> {
    const dlg = this.page.locator('[data-testid="location-settings-modal-unsaved-changes"]');
    return {
      text: ((await dlg.textContent()) ?? '').trim(),
      buttons: (await dlg.locator('button').allTextContents()).map((t) => t.trim()).filter(Boolean),
    };
  }

 // The confirm dialog carries NO data-testid on itself or any of its three buttons, so it is read
 // by role. Buttons in DOM order: the icon-only Close (empty label), then Cancel, then Ok.
  @step('Get save dialog content')
  async getSaveDialogContent(): Promise<{ text: string; buttons: string[] }> {
    const dlg = this.page.getByRole('alertdialog');
    return {
      text: ((await dlg.textContent()) ?? '').trim(),
      buttons: (await dlg.locator('button').allTextContents()).map((t) => t.trim()).filter(Boolean),
    };
  }

  @step('Dismiss save dialog')
  async dismissSaveDialog(via: 'Cancel' | 'Close'): Promise<void> {
    const dlg = this.page.getByRole('alertdialog');
    if (via === 'Cancel') await dlg.getByRole('button', { name: 'Cancel' }).click();
    else await dlg.getByRole('button', { name: 'Close' }).click();
    await dlg.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
    Log.info(`Dismissed Save Changes dialog via ${via}`);
  }

 // Counts save-path calls fired while `action` runs — Tier-2 save verification, and the oracle for
 // "Cancel must not reach the server".
  @step('Count save calls during')
  async countSaveCallsDuring(action: () => Promise<void>): Promise<number> {
    let calls = 0;
    const onRequest = (req: { url: () => string }) => {
      const u = req.url();
      if (u.includes(SAVE_API_ROUTES.updateProperties) || u.includes(SAVE_API_ROUTES.upsertPricebook)) calls++;
    };
    this.page.on('request', onRequest);
    try {
      await action();
      await this.page.waitForTimeout(2_000); // let any in-flight save call be observed
    } finally {
      this.page.off('request', onRequest);
    }
    return calls;
  }
}
