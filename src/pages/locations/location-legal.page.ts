import { Page } from '@playwright/test';
import { BasePage } from '../base.page';
import { Log } from '../../utils/logger';
import { IConfig } from '../../types';

export class LocationLegalPage extends BasePage {
  constructor(page: Page, config?: IConfig) {
    super(page, config);
    Log.info('LocationLegalPage initialized');
  }

  async navigateToLegalTab(officeNo: string = '1604'): Promise<void> {
    await this.navigateToSubTab('tabLegal', 'contentLegal', officeNo);
  }

  async isOnLegalTab(): Promise<boolean> {
    // contentLegal is a panel-wrapper testid that Radix keeps mounted across all tab
    // states (count() > 0 returns TRUE even when Legal is inactive). The tab trigger's
    // aria-selected is the only reliable signal.
    const tab = this.getElement('tabLegal');
    if ((await tab.count()) === 0) return false;
    return (await tab.getAttribute('aria-selected').catch(() => null)) === 'true';
  }

  async clickLegalTab(): Promise<void> {
    await this.clickWithRetry('tabLegal');
    await this.getElement('contentLegal').waitFor({ state: 'visible', timeout: 15_000 });
    // Wait for row-0 service-charge dropdown
    // (content-level anchor) so we don't return on the wrapper alone while the Legal
    // table is still hydrating.
    // Dropped trailing .catch(Log.warn) so a missed
    // wait fails loudly at the click step (where the symptom is) instead of being swallowed.
    await this.getElement('drpLegalServiceCharge0')
      .waitFor({ state: 'visible', timeout: 15_000 });
    await this.waitForAngularStable();
  }

  async reloadAndNavigateToLegalTab(): Promise<void> {
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
    await this.clickLegalTab();
  }

  async getGridRowCount(): Promise<number> {
    const grid = this.getElement('tblLegal');
    await grid.waitFor({ state: 'visible', timeout: 15_000 });
    const rows = await grid.locator('tbody tr').count();
    Log.info(`Legal grid rows: ${rows}`);
    return rows;
  }

  async getColumnHeaders(): Promise<string[]> {
    const grid = this.getElement('tblLegal');
    await grid.waitFor({ state: 'visible', timeout: 15_000 });
    const headers = await grid.locator('thead th').allTextContents();
    return headers.map(h => h.trim()).filter(h => h.length > 0);
  }

  async getLanguageName(row: number = 0): Promise<string> {
    const grid = this.getElement('tblLegal');
    const cell = grid.locator(`tbody tr`).nth(row).locator('td').first();
    return (await cell.textContent() || '').trim();
  }

  async isLanguageNameReadOnly(row: number = 0): Promise<boolean> {
    const grid = this.getElement('tblLegal');
    const cell = grid.locator(`tbody tr`).nth(row).locator('td').first();
    const interactiveCount = await cell.locator('button, input, textarea, select, [role="combobox"], [contenteditable="true"]').count();
    return interactiveCount === 0;
  }

  async getServiceChargeValue(): Promise<string> {
    return this.getFieldDisplayValue('drpLegalServiceCharge0');
  }

  async getTermsValue(): Promise<string> {
    return this.getFieldDisplayValue('drpLegalTerms0');
  }

  async getServiceChargeOptions(): Promise<string[]> {
    return this.getComboboxOptions('drpLegalServiceCharge0');
  }

  async getTermsOptions(): Promise<string[]> {
    return this.getComboboxOptions('drpLegalTerms0');
  }

  async selectServiceCharge(optionText: string): Promise<void> {
    await this.selectComboboxOption('drpLegalServiceCharge0', optionText, { exact: true });
  }

  async selectTerms(optionText: string): Promise<void> {
    await this.selectComboboxOption('drpLegalTerms0', optionText, { exact: true });
  }

  async hasDropdownSearch(dropdownKey: string): Promise<boolean> {
    const listbox = await this.openComboboxListbox(dropdownKey);
    const searchCount = await listbox.locator('input, [type="search"], [cmdk-input]').count();
    await this.page.keyboard.press('Escape');
    await listbox.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => {});
    return searchCount > 0;
  }

 /**
 * Throws on save failure so callers see server errors rather than a silent {success:false} return.
 */
  async saveAndConfirm(): Promise<void> {
    const result = await this.clickSave();
    if (!result.success) {
      throw new Error(`Legal save failed: ${result.networkError ?? 'unknown error'}`);
    }
  }

 /**
 * Bounded retry (max 3) because the 114-option Radix Service Charge select can "click
 * successfully" yet leave Angular's model unchanged. A silent no-op leaves Save disabled,
 * and clickSaveWithDialog returns {success:true} when Save is disabled — so save-success
 * never proves the restore landed. The post-reload re-read is the load-bearing check.
 */
  async ensureDefaultState(defaults: { serviceChargeName: string; termsName: string }): Promise<void> {
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let dirty = false;
      if (await this.getServiceChargeValue() !== defaults.serviceChargeName) {
        await this.selectServiceCharge(defaults.serviceChargeName);
        dirty = true;
      }
      if (await this.getTermsValue() !== defaults.termsName) {
        await this.selectTerms(defaults.termsName);
        dirty = true;
      }
      if (!dirty) return; // already at defaults — nothing to restore
      // saveAndConfirm() throws on a real 4xx/5xx (fail loud); a silent no-op (select
      // didn't propagate → Save disabled) returns without throwing — the re-verify below
      // catches that case and loops.
      await this.saveAndConfirm();
      await this.reloadAndNavigateToLegalTab();
      if (await this.getServiceChargeValue() === defaults.serviceChargeName
        && await this.getTermsValue() === defaults.termsName) {
        return;
      }
    }
    throw new Error(
      `ensureDefaultState: Legal SC/Terms not at defaults after ${maxAttempts} attempts`,
    );
  }

  async isSaveEnabled(): Promise<boolean> {
    const el = this.getElement('btnSaveLegal');
    const disabled = await el.isDisabled().catch(() => true);
    return !disabled;
  }

  async clickSave(): Promise<{ success: boolean; networkError?: string }> {
    await this.waitForSaveEnabled('btnSaveLegal');
    return this.clickSaveWithDialog('btnSaveLegal', 'dlgSaveChanges', 'btnSaveChangesConfirm');
  }

  async clickSaveAndGetDialog(): Promise<'save-changes' | 'none'> {
    const el = this.getElement('btnSaveLegal');
    await el.waitFor({ state: 'visible', timeout: 5_000 });
    // A disabled Save here means the preceding change never dirtied the form — the
    // caller expected a save dialog, so fail loud rather than return an opaque 'none'
    // that masks the real symptom (diagnostic-only; baseline reset prevents reaching here).
    if (await el.isDisabled()) {
      throw new Error('clickSaveAndGetDialog: Save button is disabled — no change to save (expected a dirty form)');
    }
    await el.click();
    const dialog = this.getElement('dlgSaveChanges');
    const visible = await dialog.waitFor({ state: 'visible', timeout: 5_000 }).then(() => true).catch(() => false);
    return visible ? 'save-changes' : 'none';
  }

  async cancelSaveDialog(): Promise<void> {
    const dialog = this.getElement('dlgSaveChanges');
    if (await dialog.isVisible().catch(() => false)) {
      await this.getElement('btnSaveChangesCancel').click();
      await dialog.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
    }
  }

  async triggerBeforeunloadAndStay(): Promise<boolean> {
    let dialogFired = false;
    const handler = async (d: import('@playwright/test').Dialog) => {
      dialogFired = true;
      try { await d.dismiss(); } catch { /* already handled */ }
    };
    this.page.on('dialog', handler);
    try {
 // best-effort: this reload only needs to fire the beforeunload prompt; the handler above
 // dismisses it (which keeps us on the page), so the reload is expected to be cancelled.
      await this.page.reload({ timeout: 5_000 }).catch(() => {});
    } finally {
      this.page.removeListener('dialog', handler);
    }
    return dialogFired;
  }
}
