import { Page } from '@playwright/test';
import { step } from '../../fixtures/step-decorator';
import { BasePage } from '../base.page';
import { Log } from '../../utils/logger';
import { IConfig } from '../../types';
import { LocationSettingsSelectors } from '../../selectors';
import { CheckboxState } from '../components/location-form-helpers.component';
import { MERCHANT_DATA } from '../../data/locations/location-currency';

export type SaveDialogType = 'save-changes' | 'error' | 'none' | 'disabled';

export class LocationCurrencyPage extends BasePage {
  constructor(page: Page, config?: IConfig) {
    super(page, config);
    Log.info('LocationCurrencyPage initialized');
  }

  @step('Navigate to currency tab')
  async navigateToCurrencyTab(officeNo: string = '1604'): Promise<void> {
    await this.navigateToSubTab('tabCurrency', 'tblCurrencyGrid', officeNo);
  }

  @step('Is on currency tab')
  async isOnCurrencyTab(): Promise<boolean> {
    const tab = this.getElement('tabCurrency');
    if ((await tab.count()) === 0) return false;
    return (await tab.getAttribute('aria-selected').catch(() => null)) === 'true';
  }

  @step('Reload and navigate to currency tab')
  async reloadAndNavigateToCurrencyTab(): Promise<void> {
    const handler = async (d: import('@playwright/test').Dialog) => {
      try { await d.accept(); } catch { /* dialog may already be handled */ }
    };
    this.page.on('dialog', handler);
    try {
      await this.page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
    } finally {
      this.page.removeListener('dialog', handler);
    }
    await this.waitForAngularStable();
    await this.clickWithRetry('tabCurrency');
    await this.getElement('tblCurrencyGrid').waitFor({ state: 'visible', timeout: 15_000 });
    await this.waitForAngularStable();
  }

  @step('Get grid row count')
  async getGridRowCount(): Promise<number> {
    const grid = this.getElement('tblCurrencyGrid');
    await grid.waitFor({ state: 'visible', timeout: 5_000 });
    const rows = await grid.locator('tbody tr').count();
    Log.info(`Currency grid rows: ${rows}`);
    return rows;
  }

  @step('Get column headers')
  async getColumnHeaders(): Promise<string[]> {
    return this.getColumnHeadersByKeys(['colHeaderCurrencyCode', 'colHeaderSelected', 'colHeaderIsDefault', 'colHeaderMerchant']);
  }

  @step('Is currency code read only')
  async isCurrencyCodeReadOnly(currency: string): Promise<boolean> {
    const gridSel = this.getLocator('tblCurrencyGrid');
    const cell = this.page.locator(`${gridSel} tbody tr:has-text("${currency}") td:first-child`);
    const inputCount = await cell.locator('input, textarea, [contenteditable="true"]').count();
    Log.info(`${currency} code cell editable inputs: ${inputCount}`);
    return inputCount === 0;
  }

  @step('Get checkbox state')
  async getCheckboxState(selectorKey: keyof typeof LocationSettingsSelectors): Promise<CheckboxState> {
    const state = await this.getRadixCheckboxState(selectorKey);
    Log.info(`${selectorKey}: checked=${state.checked}, disabled=${state.disabled}`);
    return state;
  }

  @step('Check checkbox')
  async checkCheckbox(selectorKey: keyof typeof LocationSettingsSelectors): Promise<void> {
    const el = this.getElement(selectorKey);
    if (!(await this.getRadixCheckboxState(selectorKey)).checked) {
      await el.click();
    }
    Log.info(`Checked: ${selectorKey}`);
  }

  @step('Uncheck checkbox')
  async uncheckCheckbox(selectorKey: keyof typeof LocationSettingsSelectors): Promise<void> {
    const el = this.getElement(selectorKey);
    if ((await this.getRadixCheckboxState(selectorKey)).checked) {
      await el.click();
    }
    Log.info(`Unchecked: ${selectorKey}`);
  }

  @step('Get merchant value')
  async getMerchantValue(dropdownKey: string): Promise<string> {
    return this.getFieldDisplayValue(dropdownKey);
  }

  @step('Get merchant options')
  async getMerchantOptions(dropdownKey: string): Promise<string[]> {
    const options = await this.getComboboxOptions(dropdownKey);
    Log.info(`Merchant options for ${dropdownKey}: ${options.join(', ')}`);
    return options;
  }

 /**
 * Retry carve-out: this is a visibility probe, not an option-select. The shared retry
 * helper is select-only; probe semantics differ.
 */
  @step('Is merchant dropdown accessible')
  async isMerchantDropdownAccessible(dropdownKey: string): Promise<boolean> {
    await this.getElement(dropdownKey).click();
    await this.waitForAngularStable();
    const listbox = this.page.locator('[role="listbox"]');
    const visible = await listbox.isVisible().catch(() => false);
    await this.page.keyboard.press('Escape');
    await listbox.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => {});
    Log.info(`${dropdownKey} accessible: ${visible}`);
    return visible;
  }

 /**
 * Retry carve-out: this is a text-substring probe, not an option-select. The shared retry
 * helper is select-only; probe semantics differ.
 */
  @step('Is merchant no matches found')
  async isMerchantNoMatchesFound(dropdownKey: string): Promise<boolean> {
    await this.getElement(dropdownKey).click();
    await this.waitForAngularStable();
    const listbox = this.page.locator('[role="listbox"]');
    const visible = await listbox.isVisible().catch(() => false);
    if (!visible) { await this.page.keyboard.press('Escape'); return false; }
    const text = await listbox.textContent().catch(() => '');
    await this.page.keyboard.press('Escape');
    await listbox.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => {});
    const noMatches = (text || '').includes('No Matches Found');
    Log.info(`${dropdownKey} No Matches Found: ${noMatches}`);
    return noMatches;
  }

  @step('Select merchant option')
  async selectMerchantOption(dropdownKey: string, optionText: string): Promise<void> {
    await this.getElement(dropdownKey).click();
    await this.waitForAngularStable();
    const option = this.page.locator(`[role="listbox"] [role="option"]:has-text("${optionText}")`);
    await option.waitFor({ state: 'visible', timeout: 5_000 });
    await option.click();
    Log.info(`Selected merchant option: ${optionText}`);
  }

  @step('Is save enabled')
  async isSaveEnabled(): Promise<boolean> {
    const el = this.getElement('btnSaveCurrency');
    const disabled = await el.isDisabled().catch(() => true);
    Log.info(`Currency Save enabled: ${!disabled}`);
    return !disabled;
  }

  @step('Click save')
  async clickSave(): Promise<{ success: boolean; saved?: boolean; networkError?: string }> {
    return this.clickSaveWithDialog('btnSaveCurrency');
  }

 /**
 * Click Save, then detect whether the result is a Save Changes dialog, an Error dialog,
 * or neither. Caller must dismiss via cancelCurrentDialog / confirmSaveDialog.
 * Returns 'disabled' when the Save button was disabled (no save ran) -- distinct from 'none', which means a save ran but no dialog appeared.
 */
  @step('Click save and capture dialog')
  async clickSaveAndCaptureDialog(): Promise<SaveDialogType> {
    const el = this.getElement('btnSaveCurrency');
    await el.waitFor({ state: 'visible', timeout: 5_000 });
    if (await el.isDisabled()) {
      Log.info('Save button disabled -- no save performed (distinct from no-dialog)');
      return 'disabled';
    }
    // Clear any error dialog left open by a prior action, so a stale error cannot be misread as THIS
    // save's result.
    const errorDialog = this.getElement('dlgErrorDialog');
    if (await errorDialog.isVisible().catch(() => false)) {
      // best-effort: the dialog can close on its own between the visibility check and this click.
      await this.getElement('btnErrorOk').click().catch(() => {});
      await errorDialog.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
    }
    await el.click();
    const saveDialog = this.getElement('dlgSaveChanges');
    const saveVisible = await saveDialog.waitFor({ state: 'visible', timeout: 5_000 }).then(() => true).catch(() => false);
    if (saveVisible) { Log.info('Save Changes dialog appeared'); return 'save-changes'; }
    // Wait briefly for a possibly late-rendering error dialog instead of a single zero-wait snapshot.
    const errorVisible = await errorDialog.waitFor({ state: 'visible', timeout: 2_000 }).then(() => true).catch(() => false);
    if (errorVisible) { Log.info('Error dialog appeared'); return 'error'; }
    Log.info('No dialog appeared after Save');
    return 'none';
  }

  @step('Cancel current dialog')
  async cancelCurrentDialog(): Promise<void> {
    const dialog = this.getElement('dlgSaveChanges');
    if (await dialog.isVisible().catch(() => false)) {
      await this.getElement('btnSaveChangesCancel').click();
      await dialog.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
    }
  }

  @step('Confirm save dialog')
  async confirmSaveDialog(): Promise<void> {
    const dialog = this.getElement('dlgSaveChanges');
    if (await dialog.isVisible().catch(() => false)) {
      await this.getElement('btnSaveChangesConfirm').click();
      await dialog.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {});
      await this.waitForAngularStable();
    }
  }

  @step('Get dialog error text')
  async getDialogErrorText(): Promise<string> {
    const el = this.getElement('dlgErrorMessage');
    const visible = await el.isVisible().catch(() => false);
    if (!visible) return '';
    const text = ((await el.textContent().catch(() => '')) ?? '').trim();
    // best-effort: the dialog can close on its own between reading the text and this dismiss click.
    await this.getElement('btnErrorOk').click().catch(() => {});
    await this.getElement('dlgErrorDialog').waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
    Log.info(`Error dialog text: ${text}`);
    return text;
  }

  @step('Save and confirm')
  async saveAndConfirm(): Promise<void> {
    const result = await this.clickSave();
    if (!result.success) {
      throw new Error(`Currency save did not succeed${result.networkError ? `: ${result.networkError}` : ''}`);
    }
  }

 /**
 * Bounded retry (max 3): the reload + re-read is required because the Save button reports
 * success even when it is disabled, so saving alone never proves the reset actually landed.
 */
  @step('Ensure default state')
  async ensureDefaultState(): Promise<void> {
    const MAX_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      if (await this.isAtDefaultState()) return;
      // Re-select USD first so its Is-Default checkbox becomes enabled, set USD as the
      // single default (this clears any other default), then clear CAD/MXN selections.
      await this.checkCheckbox('chkUSDSelected');
      await this.checkCheckbox('chkUSDIsDefault');
      await this.uncheckCheckbox('chkCADSelected');
      await this.uncheckCheckbox('chkMXNSelected');
      if (!(await this.getMerchantValue('drpUSDMerchant')).includes(MERCHANT_DATA.usd.id)) {
        await this.selectMerchantOption('drpUSDMerchant', MERCHANT_DATA.usd.display);
      }
      if (await this.isSaveEnabled()) {
        await this.saveAndConfirm();
      }
      await this.reloadAndNavigateToCurrencyTab();
    }
    if (!(await this.isAtDefaultState())) {
      throw new Error('Currency baseline could not be enforced after 3 attempts (grid still drifted from the USD default state)');
    }
  }

  @step('Is at default state')
  async isAtDefaultState(): Promise<boolean> {
    const usdSelected = await this.getCheckboxState('chkUSDSelected');
    const usdDefault = await this.getCheckboxState('chkUSDIsDefault');
    const cadSelected = await this.getCheckboxState('chkCADSelected');
    const mxnSelected = await this.getCheckboxState('chkMXNSelected');
    const usdMerchant = await this.getMerchantValue('drpUSDMerchant');
    return usdSelected.checked && usdDefault.checked
      && !cadSelected.checked && !mxnSelected.checked
      && usdMerchant.includes(MERCHANT_DATA.usd.id);
  }

  @step('Attempt to leave the page, then stay')
  async triggerBeforeunloadAndStay(): Promise<boolean> {
    let dialogFired = false;
    const handler = async (d: import('@playwright/test').Dialog) => {
      dialogFired = true;
      try { await d.dismiss(); } catch { /* already handled */ }
    };
    this.page.on('dialog', handler);
    try {
      // best-effort: this reload only needs to fire the beforeunload prompt; the handler above
      // dismisses it, so the reload is expected to be cancelled rather than complete.
      await this.page.reload({ timeout: 5_000 }).catch(() => {});
    } finally {
      this.page.removeListener('dialog', handler);
    }
    return dialogFired;
  }

}
