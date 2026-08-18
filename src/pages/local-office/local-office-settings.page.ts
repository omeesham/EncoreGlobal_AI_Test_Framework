import { Page, Locator } from '@playwright/test';
import { BasePage } from '../base.page';
import { IConfig } from '../../types';
import { LocalOfficeSettingsSelectors, getTsSelector } from '../../selectors';
import { CheckboxState } from '../components/location-form-helpers.component';
import { step } from '../../fixtures/step-decorator';

export class LocalOfficeSettingsPage extends BasePage {
  constructor(page: Page, config?: IConfig) {
    super(page, config);
  }

 /**
 * Override getElement to prefer Local Office selectors.
 * LocalOfficeSettingsSelectors is NOT in ALL_SELECTORS (colliding keys: btnSave, tabBasicInformation).
 * Falls back to global lookup for shared elements (dialogs, etc.).
 */
  protected getElement(elementName: string): Locator {
    const selector = (LocalOfficeSettingsSelectors as Record<string, string>)[elementName]
      ?? getTsSelector(elementName);
    if (!selector) throw new Error(`Selector '${elementName}' not found in Local Office or global selectors`);
    return this.page.locator(selector);
  }

  @step('Navigate to basic info tab')
  async navigateToBasicInfoTab(officeNo = '1604'): Promise<void> {
    await this.navigateToSubTab('tabBasicInformation', 'frmBasicInfo', officeNo, 'local-office');
  }

 /** Uses safeNavigateTo to handle beforeunload dialog when form has unsaved edits.
 * 30s form-visibility timeout: cold-load p95 ~9s isolated, but under 4-worker contention
 * loads regularly exceed 15s. */
  @step('Reload basic info')
  async reloadBasicInfo(officeNo = '1604'): Promise<void> {
    const baseUrl = this.config?.base_url || '';
    await this.safeNavigateTo(`${baseUrl}locations/${officeNo}/settings/local-office`);
    await this.waitForAngularStable();
    await this.getElement('frmBasicInfo').waitFor({ state: 'visible', timeout: 30_000 });
  }
  @step('Is save enabled')
  async isSaveEnabled(): Promise<boolean> {
    return !(await this.getElement('btnSave').isDisabled());
  }

  @step('Wait for save to enable')
  async waitForSaveToEnable(timeout = 10_000): Promise<boolean> {
    return this.waitForSaveEnabled('btnSave', timeout);
  }

 /** Returns {success, networkError?} — callers that care about silent 500s can assert on .success. */
  @step('Click save and confirm')
  async clickSaveAndConfirm(): Promise<{ success: boolean; networkError?: string }> {
    return this.clickSaveWithDialog('btnSave', 'dlgSaveChanges', 'btnSaveChangesConfirm');
  }

  @step('Click save and cancel')
  async clickSaveAndCancel(): Promise<boolean> {
    await this.getElement('btnSave').click();
    const dlg = this.getElement('dlgSaveChanges');
    const visible = await dlg.waitFor({ state: 'visible', timeout: 5_000 })
      .then(() => true).catch(() => false);
    if (visible) {
      await this.getElement('btnSaveChangesCancel').click();
      await dlg.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
      return true;
    }
    return false;
  }

  @step('Get input value')
  async getInputValue(key: string): Promise<string> {
    return this.getElement(key).inputValue();
  }

  @step('Fill and tab')
  async fillAndTab(key: string, value: string): Promise<void> {
    const el = this.getElement(key);
    await el.click();
    await this.page.keyboard.press('Control+a');
    if (value === '') {
      await this.page.keyboard.press('Backspace');
    } else {
      await this.page.keyboard.type(value);
    }
    await el.press('Tab');
  }

  @step('Clear and tab')
  async clearAndTab(key: string): Promise<void> {
    const el = this.getElement(key);
    await el.click();
    await this.page.keyboard.press('Control+a');
    await this.page.keyboard.press('Backspace');
    await el.press('Tab');
  }

  @step('Is field invalid')
  async isFieldInvalid(key: string): Promise<boolean> {
    return (await this.getElement(key).getAttribute('aria-invalid')) === 'true';
  }

  @step('Expect invalid')
  async expectInvalid(key: string, timeout = 5_000): Promise<boolean> {
    return this.waitForFieldInvalid(key, timeout);
  }

  @step('Expect valid')
  async expectValid(key: string, timeout = 5_000): Promise<boolean> {
    return this.waitForFieldValid(key, timeout);
  }

  @step('Get checkbox state')
  async getCheckboxState(key: string): Promise<CheckboxState> {
    return this.getRadixCheckboxState(key);
  }

  @step('Check checkbox')
  async checkCheckbox(key: string): Promise<void> {
    await this.setRadixCheckbox(key, true);
  }

  @step('Uncheck checkbox')
  async uncheckCheckbox(key: string): Promise<void> {
    await this.setRadixCheckbox(key, false);
  }

  @step('Get combobox value')
  async getComboboxValue(key: string): Promise<string> {
    return (await this.getElement(key).textContent() || '').trim();
  }

  @step('Get combobox options list')
  async getComboboxOptionsList(key: string): Promise<string[]> {
    return this.getComboboxOptions(key);
  }

  @step('Select combobox exact')
  async selectComboboxExact(key: string, optionName: string): Promise<void> {
    await this.selectComboboxOption(key, optionName, { exact: true });
  }

  @step('Is tab selected')
  async isTabSelected(tabKey: string): Promise<boolean> {
    return (await this.getElement(tabKey).getAttribute('aria-selected')) === 'true';
  }

  @step('Click tab direct')
  async clickTabDirect(tabKey: string): Promise<void> {
    await this.getElement(tabKey).click();
  }

 /**
 * Click a tab. Handles "Unsaved changes" alertdialog if it appears.
 * Angular doesn't reliably call markAsPristine after ECT save.
 * The save API completes (button disables, toast shows) but the form dirty flag
 * persists. Clicking another tab triggers the dirty guard → "Unsaved changes" dialog.
 * Dismiss with "Discard" to complete the navigation.
 */
  @step('Click tab')
  async clickTab(tabKey: string): Promise<void> {
    await this.getElement(tabKey).click();
    await this.page.waitForTimeout(300); // Allow Angular to render dialog if dirty
    const dismissed = await this.dismissAlertDialogIfVisible();
    if (dismissed) await this.waitForAngularStable();
  }

  @step('Wait for basic info form')
  async waitForBasicInfoForm(timeout = 10_000): Promise<void> {
    await this.getElement('frmBasicInfo').waitFor({ state: 'visible', timeout });
  }

  private getSectionDataRows() {
    const table = this.getElement('tblSections');
    return table.locator('tbody tr').filter({
      hasNot: this.page.locator('input[placeholder="Add New..."]'),
    });
  }

  @step('Get section row count')
  async getSectionRowCount(): Promise<number> {
    return this.getSectionDataRows().count();
  }

  @step('Get section name by index')
  async getSectionNameByIndex(rowIndex: number): Promise<string> {
    const row = this.getSectionDataRows().nth(rowIndex);
    return (await row.locator('td:first-child input').inputValue()).trim();
  }

  @step('Get section names')
  async getSectionNames(): Promise<string[]> {
    const rows = this.getSectionDataRows();
    const count = await rows.count();
    const names: string[] = [];
    for (let i = 0; i < count; i++) {
      const input = rows.nth(i).locator('td:first-child input');
      const val = await input.inputValue();
      if (val.trim().length > 0) names.push(val.trim());
    }
    return names;
  }

  @step('Is section active')
  async isSectionActive(rowIndex: number): Promise<boolean> {
    const row = this.getSectionDataRows().nth(rowIndex);
    return (await row.locator('td:last-child svg').count()) > 0;
  }

  @step('Toggle section active')
  async toggleSectionActive(rowIndex: number): Promise<void> {
    const row = this.getSectionDataRows().nth(rowIndex);
    await row.locator('td:last-child').click();
  }

  @step('Edit section name')
  async editSectionName(rowIndex: number, newName: string): Promise<void> {
    const row = this.getSectionDataRows().nth(rowIndex);
    const input = row.locator('td:first-child input');
    await input.click();
    await input.clear();
    await input.fill(newName);
    await input.press('Tab');
  }

  @step('Edit section name and cancel')
  async editSectionNameAndCancel(rowIndex: number, tempName: string): Promise<void> {
    const row = this.getSectionDataRows().nth(rowIndex);
    const input = row.locator('td:first-child input');
    await input.click();
    await input.clear();
    await input.fill(tempName);
    await input.press('Escape');
  }

  @step('Add section')
  async addSection(name: string): Promise<void> {
    const section = this.getElement('tblSections');
    const addInput = section.locator('input[placeholder="Add New..."]');
    await addInput.fill(name);
    await addInput.press('Tab');
  }

  @step('Click default section')
  async clickDefaultSection(): Promise<void> {
    await this.clickWithRetry('btnDefaultSection');
  }

  private getRoomDataRows() {
    const table = this.getElement('tblRoomConfig');
    return table.locator('tbody tr').filter({
      hasNot: this.page.locator('input[placeholder="Add New..."]'),
    });
  }

  @step('Is room table empty')
  async isRoomTableEmpty(): Promise<boolean> {
    return (await this.getRoomDataRows().count()) === 0;
  }

  @step('Get room row count')
  async getRoomRowCount(): Promise<number> {
    return this.getRoomDataRows().count();
  }

  @step('Get room names')
  async getRoomNames(): Promise<string[]> {
    const rows = this.getRoomDataRows();
    const count = await rows.count();
    const names: string[] = [];
    for (let i = 0; i < count; i++) {
      const input = rows.nth(i).locator('td:first-child input');
      const val = await input.inputValue();
      if (val.trim().length > 0) names.push(val.trim());
    }
    return names;
  }

  @step('Is room active')
  async isRoomActive(rowIndex: number): Promise<boolean> {
    const row = this.getRoomDataRows().nth(rowIndex);
    return (await row.locator('td:last-child svg').count()) > 0;
  }

  @step('Toggle room active')
  async toggleRoomActive(rowIndex: number): Promise<void> {
    const row = this.getRoomDataRows().nth(rowIndex);
    await row.locator('td:last-child').click();
  }

  @step('Edit room name')
  async editRoomName(rowIndex: number, newName: string): Promise<void> {
    const row = this.getRoomDataRows().nth(rowIndex);
    const input = row.locator('td:first-child input');
    await input.click();
    await input.clear();
    await input.fill(newName);
    await input.press('Tab');
  }

  @step('Add room')
  async addRoom(name: string): Promise<void> {
    const section = this.getElement('tblRoomConfig');
    const addInput = section.locator('input[placeholder="Add New..."]');
    await addInput.fill(name);
    await addInput.press('Tab');
  }

  @step('Get logo preview src')
  async getLogoPreviewSrc(): Promise<string> {
    return (await this.getElement('imgLogoPreview').getAttribute('src')) || '';
  }

  @step('Get exempt count')
  async getExemptCount(): Promise<number> {
    const table = this.getElement('tblDiscountExemptions');
    return table.locator('tbody tr td:last-child svg').count();
  }

  @step('Toggle exemption')
  async toggleExemption(rowIndex: number): Promise<void> {
    const table = this.getElement('tblDiscountExemptions');
    await table.locator('tbody tr').nth(rowIndex).locator('td:last-child').click();
  }

  @step('Click unsaved stay')
  async clickUnsavedStay(): Promise<void> {
    const dlg = this.getElement('dlgUnsavedLocalOffice');
    await dlg.waitFor({ state: 'visible', timeout: 5_000 });
    await this.getElement('btnUnsavedStay').click();
    await dlg.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
  }

  @step('Click unsaved discard')
  async clickUnsavedDiscard(): Promise<void> {
    const dlg = this.getElement('dlgUnsavedLocalOffice');
    await dlg.waitFor({ state: 'visible', timeout: 5_000 });
    await this.getElement('btnUnsavedDiscard').click();
    await dlg.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
  }
}
