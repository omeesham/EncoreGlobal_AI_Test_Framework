import { Page, Locator } from '@playwright/test';
import { step } from '../../fixtures/step-decorator';
import { BasePage } from '../base.page';
import { Log } from '../../utils/logger';
import { IConfig } from '../../types';
import { CheckboxState } from '../components/location-form-helpers.component';
import { businessTypesSaveEndpoint } from '../../data/locations/location-business-types';

// Setup > Location > Business Types. The tab has no Save button of its own — it drives the
// page-level Save that all Location Settings sub-tabs share.
export class LocationBusinessTypesPage extends BasePage {
  constructor(page: Page, config?: IConfig) {
    super(page, config);
    Log.info('LocationBusinessTypesPage initialized');
  }

  @step('Navigate to Business Types tab')
  async navigateToBusinessTypesTab(officeNo: string = '1604'): Promise<void> {
    await this.navigateToSubTab('tabBusinessTypes', 'chkBusinessTypeAudioVisual', officeNo);
  }

  @step('Check whether Business Types tab is active')
  async isOnBusinessTypesTab(): Promise<boolean> {
    const tab = this.getElement('tabBusinessTypes');
    if ((await tab.count()) === 0) return false;
    return (await tab.getAttribute('aria-selected').catch(() => null)) === 'true';
  }

  @step('Reload and return to Business Types tab')
  async navigateFresh(officeNo: string = '1604'): Promise<void> {
    const baseUrl = this.config?.base_url || '';
    await this.safeNavigateTo('about:blank');
    await this.navigateTo(`${baseUrl}locations/${officeNo}/settings/location`);
    await this.waitForAngularStable();
    await this.navigateToBusinessTypesTab(officeNo);
  }

  @step('Get checkbox state')
  async getCheckboxState(key: string): Promise<CheckboxState> {
    return this.getRadixCheckboxState(key);
  }

  @step('Check whether checkbox is selected')
  async isCheckboxChecked(key: string): Promise<boolean> {
    const state = await this.getRadixCheckboxState(key);
    return state.checked;
  }

  @step('Select checkbox')
  async checkCheckbox(key: string): Promise<void> {
    await this.setRadixCheckbox(key, true);
  }

  @step('Clear checkbox')
  async uncheckCheckbox(key: string): Promise<void> {
    await this.setRadixCheckbox(key, false);
  }

  /** Flips the current state; use the select/clear pair when a specific end state is wanted. */
  @step('Toggle checkbox')
  async toggleCheckbox(key: string): Promise<void> {
    // Extended timeout: the form is briefly disabled while a save is in flight.
    await this.getElement(key).click({ timeout: 30_000 });
  }

  @step('Count rendered checkboxes')
  async getCheckboxCount(): Promise<number> {
    return this.getElement('chkBusinessTypesAll').count();
  }

  /** Reads from the immediate container — the checkbox element itself carries no text. */
  @step('Read label next to checkbox')
  async getCheckboxLabel(key: string): Promise<string> {
    const text = await this.getElement(key).locator('xpath=..').innerText();
    return (text || '').trim();
  }

  // Retries because a save silently no-ops when the form never became dirty; only the re-read
  // after reload proves the restore landed.
  @step('Restore office defaults')
  async ensureDefaultState(
    defaults: ReadonlyArray<{ key: string; name: string; checked: boolean }>,
    officeNo: string = '1604',
  ): Promise<void> {
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let dirty = false;
      for (const item of defaults) {
        if ((await this.isCheckboxChecked(item.key)) !== item.checked) {
          if (item.checked) { await this.checkCheckbox(item.key); }
          else { await this.uncheckCheckbox(item.key); }
          dirty = true;
        }
      }
      if (!dirty) { return; }
      await this.clickSave();
      await this.navigateFresh(officeNo);
      let allMatch = true;
      for (const item of defaults) {
        if ((await this.isCheckboxChecked(item.key)) !== item.checked) { allMatch = false; break; }
      }
      if (allMatch) { return; }
    }
    throw new Error(
      `Business Types selections did not return to the expected office defaults after ${maxAttempts} attempts`,
    );
  }

  private get saveButton(): Locator {
    return this.getElement('btnSave');
  }

  @step('Check whether Save is enabled')
  async isSaveEnabled(): Promise<boolean> {
    return !(await this.saveButton.isDisabled());
  }

  @step('Save and confirm')
  async clickSave(): Promise<{ success: boolean; saved?: boolean; networkError?: string }> {
    if (await this.saveButton.isDisabled()) {
      Log.info('Save button disabled -- no save performed');
      return { success: true, saved: false };
    }
    const result = await this.clickSaveWithDialog('btnSave', 'dlgSaveChanges', 'btnSaveChangesConfirm');
    await this.waitForAngularStable();
    return { ...result, saved: true };
  }

  // Filtered to the business types API path: the same save also emits framework render requests
  // at the page address, which would otherwise be read as the save response.
  @step('Save and wait for the commit to come back')
  async saveAndAwaitCommit(officeNo: string = '1604'): Promise<number> {
    const endpoint = businessTypesSaveEndpoint(officeNo);
    const responsePromise = this.page.waitForResponse(
      (r) => r.url().includes(endpoint),
      { timeout: 30_000 },
    );
    await this.clickSave();
    const response = await responsePromise;
    return response.status();
  }

  @step('Click Save button')
  async clickSaveButton(): Promise<void> {
    await this.saveButton.click();
  }

  @step('Check whether Save dialog is visible')
  async isSaveDialogVisible(): Promise<boolean> {
    return this.getElement('dlgSaveChanges').isVisible();
  }

  @step('Read Save dialog heading')
  async getSaveDialogHeading(): Promise<string> {
    return (await this.getElement('dlgSaveChanges').locator('h2').textContent())?.trim() || '';
  }

  @step('Read Save dialog message')
  async getSaveDialogBody(): Promise<string> {
    return (await this.getElement('dlgSaveChanges').locator('p').textContent())?.trim() || '';
  }

  @step('Cancel the Save dialog')
  async clickSaveCancel(): Promise<void> {
    await this.getElement('btnSaveChangesCancel').click();
    await this.getElement('dlgSaveChanges').waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
  }

  @step('Confirm the Save dialog')
  async clickSaveOk(): Promise<void> {
    await this.getElement('btnSaveChangesConfirm').click();
    await this.getElement('dlgSaveChanges').waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {});
    await this.waitForAngularStable();
  }

  /** The confirmation message is shared across Location Settings sub-tabs, not Business Types only. */
  @step('Wait for the save confirmation message')
  async waitForToast(): Promise<boolean> {
    return this.getElement('toastLocalInfoUpdated')
      .waitFor({ state: 'visible', timeout: 10_000 })
      .then(() => true).catch(() => false);
  }

  @step('Open Home from the sidebar')
  async clickSidebarHome(): Promise<void> {
    const homeLink = this.page.getByRole('link', { name: 'Home' });
    if (!await homeLink.isVisible().catch(() => false)) {
      await this.page.setViewportSize({ width: 1920, height: 1080 });
      await homeLink.waitFor({ state: 'visible', timeout: 5_000 });
    }
    // Suppress the browser's own leave-page prompt so the application's in-page prompt is the one
    // that appears; the fixture would otherwise auto-accept the browser prompt first.
    await this.page.evaluate(() => {
      window.onbeforeunload = null;
      window.addEventListener('beforeunload', (e) => e.stopImmediatePropagation(), true);
    });
    await homeLink.click();
  }

  @step('Check whether unsaved changes dialog is visible')
  async isUnsavedDialogVisible(): Promise<boolean> {
    return this.getElement('dlgUnsavedChanges')
      .waitFor({ state: 'visible', timeout: 5_000 })
      .then(() => true).catch(() => false);
  }

  @step('Read unsaved changes heading')
  async getUnsavedDialogHeading(): Promise<string> {
    return (await this.getElement('dlgUnsavedChanges').locator('h2').textContent())?.trim() || '';
  }

  @step('Read unsaved changes message')
  async getUnsavedDialogBody(): Promise<string> {
    return (await this.getElement('dlgUnsavedChanges').locator('p').textContent())?.trim() || '';
  }

  @step('Stay on the page')
  async clickUnsavedStay(): Promise<void> {
    await this.getElement('btnUnsavedChangesCancel').click();
    await this.getElement('dlgUnsavedChanges').waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
  }

  @step('Discard unsaved changes')
  async clickUnsavedDiscard(): Promise<void> {
    await this.getElement('btnUnsavedChangesOk').click();
    await this.getElement('dlgUnsavedChanges').waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
  }

  @step('Switch to Local Information tab')
  async clickLocalInformationTab(): Promise<void> {
    await this.getElement('tabLocalInformation').click();
    await this.waitForAngularStable();
  }
}
