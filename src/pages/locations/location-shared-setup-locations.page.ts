import { Page, expect } from '@playwright/test';
import { step } from '../../fixtures/step-decorator';
import { BasePage } from '../base.page';
import { Log } from '../../utils/logger';
import { IConfig } from '../../types';
import { CheckboxState } from '../components/location-form-helpers.component';

export class LocationSharedSetupLocationsPage extends BasePage {
  constructor(page: Page, config?: IConfig) {
    super(page, config);
    Log.info('LocationSharedSetupLocationsPage initialized');
  }

  @step('Navigate to shared setup tab')
  async navigateToSharedSetupTab(officeNo: string = '1604'): Promise<void> {
    await this.navigateToSubTab('tabSharedSetupLocations', 'tblSharedSetupLocations', officeNo);
  }

  @step('Is on shared setup tab')
  async isOnSharedSetupTab(): Promise<boolean> {
    const tab = this.getElement('tabSharedSetupLocations');
    if ((await tab.count()) === 0) return false;
    return (await tab.getAttribute('aria-selected').catch(() => null)) === 'true';
  }

  @step('Reload and open Shared Setup Locations tab')
  async reloadAndNavigateToSSLTab(officeNo: string = '1604'): Promise<void> {
    const handler = async (d: import('@playwright/test').Dialog) => {
      try { await d.accept(); } catch { /* already handled */ }
    };
    this.page.on('dialog', handler);
    try {
      await this.page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
    } finally {
      this.page.removeListener('dialog', handler);
    }
    await this.waitForAngularStable();
    await this.navigateToSharedSetupTab(officeNo);
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

  @step('Discard and return')
  async discardAndReturn(officeNo: string = '1604'): Promise<void> {
    const homeUrl = `${this.config?.base_url ?? ''}navigator/locations/${officeNo}/home`;
    await this.navigateTo(homeUrl);
    const dlg = this.getElement('dlgUnsavedChanges');
    const appeared = await dlg.waitFor({ state: 'visible', timeout: 4_000 }).then(() => true).catch(() => false);
    if (appeared) {
      await this.getElement('btnUnsavedChangesOk').click();
      await dlg.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
    }
    await this.navigateToSharedSetupTab(officeNo);
  }

  @step('Clear Shared Setup table to baseline')
  async ensureCleanSSLTable(officeNo: string = '1604'): Promise<void> {
    // Removing a saved shared-setup row is a two-step commit: clicking a row's delete button marks it
    // for removal but leaves it in the grid until a Save persists the change. Marking many rows before
    // one Save leaves the grid in a state where the remaining delete buttons stop responding, so clean
    // in saved batches instead: delete a bounded run of the extra location rows (always the current
    // first one, which always has a live button), Save (commits the removals), reload for a fresh grid,
    // and re-check — repeating until only the office's own row remains. A normal, already-clean office
    // returns on the first check with no deletes.
    //
    // IMPORTANT: this cleanup never touches the office's own "1604" self-row or its Shares Inventory
    // checkbox. Un-checking Shares Inventory on the self-row and saving makes the whole self-row
    // disappear from the table, which would wipe the baseline every other test depends on. Only the
    // extra (numeric, non-1604) rows are deleted here.
    // save-verify-exempt: this method persists in batches and re-reads the reloaded table after every
    // Save to confirm the removals landed — the same persistence proof saveAndVerifyPersisted performs.
    const maxBatches = 80;
    for (let batch = 0; batch < maxBatches; batch++) {
      let row = await this.findNonSelfRow();
      if (!row) return; // no extra rows -> clean; the office's own self-row (if present) is left as-is
      let deleted = 0;
      while (row && deleted < 20) {
        await this.deleteNonSelfRow(row.index);
        deleted++;
        row = await this.findNonSelfRow();
      }
      await this.clickSave();
      await this.reloadAndNavigateToSSLTab(officeNo);
    }
    throw new Error(
      `ensureCleanSSLTable: office ${officeNo} shared-setup table still has non-self rows after ` +
      `${maxBatches} save batches — manual cleanup needed.`,
    );
  }

  @step('Get data row count')
  async getDataRowCount(): Promise<number> {
    const table = this.getElement('tblSharedSetupLocations');
    await table.waitFor({ state: 'visible', timeout: 10_000 });
    const total = await table.locator('tbody tr').count();
    return total - 1; // subtract fixed Add-button row
  }

  @step('Get column headers')
  async getColumnHeaders(): Promise<string[]> {
    const table = this.getElement('tblSharedSetupLocations');
    await table.waitFor({ state: 'visible', timeout: 10_000 });
    const headers = await table.locator('thead th').allTextContents();
    return headers.map(h => h.trim());
  }

  @step('Find non self row')
  async findNonSelfRow(): Promise<{ index: number; localOffice: string; localOfficeName: string } | null> {
    const count = await this.getDataRowCount();
    const tbl = this.getLocator('tblSharedSetupLocations');
    for (let i = 1; i <= count; i++) {
      const cells = await this.page.locator(`${tbl} tbody tr:nth-child(${i}) td`).allTextContents();
      const office = (cells[0] ?? '').trim();
      // A real shared-location row shows a numeric office number. Skip the self office (1604) and,
      // crucially, the empty-state placeholder row ("No shared setup locations added yet.") — that
      // placeholder is not a deletable row and has no delete control, so treating it as a non-self
      // row would make the cleanup click a button that never appears.
      if (office !== '1604' && /^\d+$/.test(office)) {
        return { index: i, localOffice: office, localOfficeName: (cells[1] ?? '').trim() };
      }
    }
    return null;
  }

  @step('Get self row text')
  async getSelfRowText(): Promise<{ localOffice: string; localOfficeName: string }> {
    const tableSel = this.getLocator('tblSharedSetupLocations');
    const cells = await this.page.locator(`${tableSel} tbody tr:first-child td`).allTextContents();
    return {
      localOffice: (cells[0] ?? '').trim(),
      localOfficeName: (cells[1] ?? '').trim(),
    };
  }

  @step('Get self primary office state')
  async getSelfPrimaryOfficeState(): Promise<CheckboxState> {
    return this.getRadixCheckboxState('chkSelfPrimaryOffice');
  }

  @step('Get self shares inventory state')
  async getSelfSharesInventoryState(): Promise<CheckboxState> {
    return this.getRadixCheckboxState('chkSelfSharesInventory');
  }

  @step('Toggle self shares inventory')
  async toggleSelfSharesInventory(): Promise<void> {
    await this.getElement('chkSelfSharesInventory').click();
    Log.info('Toggled self Shares Inventory');
  }

  @step('Set self shares inventory')
  async setSelfSharesInventory(checked: boolean): Promise<void> {
    await this.setRadixCheckbox('chkSelfSharesInventory', checked);
  }

  @step('Is self delete disabled')
  async isSelfDeleteDisabled(): Promise<boolean> {
    return this.getElement('btnSelfDelete').isDisabled();
  }

  @step('Is save enabled')
  async isSaveEnabled(): Promise<boolean> {
    return !(await this.getElement('btnSave').isDisabled().catch(() => true));
  }

  @step('Open save dialog')
  async openSaveDialog(): Promise<void> {
    await this.clickWithRetry('btnSave');
    await this.waitForElement('dlgSaveChanges', 5_000);
    Log.info('[OK] Save Changes dialog opened (not confirmed)');
  }

  @step('Cancel save dialog')
  async cancelSaveDialog(): Promise<void> {
    await this.clickWithRetry('btnSaveChangesCancel');
    await this.getElement('dlgSaveChanges').waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
    Log.info('Cancelled Save Changes dialog');
  }

  @step('Click save')
  async clickSave(): Promise<{ success: boolean; networkError?: string }> {
    return this.clickSaveWithDialog('btnSave');
  }

  @step('Save and confirm')
  async saveAndConfirm(): Promise<void> {
    const result = await this.clickSaveWithDialog('btnSave');
    if (!result.success) {
      Log.error(`[ERR] SSL save failed: ${result.networkError}`);
      throw new Error(`SSL save failed: ${result.networkError}`);
    }
  }

 /**
 * Uses evaluate to walk up from the SSL table to its closest [role="tabpanel"] ancestor
 * (the inner SSL tabpanel only), preventing a false-positive match on the outer
 * "Basic Information" tabpanel which contains the shared left-panel Save button.
 */
  @step('Has in tab save button')
  async hasInTabSaveButton(): Promise<boolean> {
    const tableSel = this.getLocator('tblSharedSetupLocations');
    const count: number = await this.page.evaluate((sel: string) => {
      const table = document.querySelector(sel);
      if (!table) return 0;
      const tabpanel = table.closest('[role="tabpanel"]');
      if (!tabpanel) return 0;
      return Array.from(tabpanel.querySelectorAll('button')).filter(
        (b) => b.textContent?.trim() === 'Save',
      ).length;
    }, tableSel);
    Log.info(`In-tab Save buttons found: ${count}`);
    return count > 0;
  }

  @step('Click add')
  async clickAdd(): Promise<void> {
    await this.getElement('btnSharedAdd').click();
    await this.getElement('dlgChangeLocalOffice').waitFor({ state: 'visible', timeout: 10_000 });
    Log.info('Change Local Office dialog opened');
  }

  @step('Is add dialog visible')
  async isAddDialogVisible(): Promise<boolean> {
    return this.isElementVisible('dlgChangeLocalOffice', 3_000);
  }

  @step('Get dialog heading')
  async getDialogHeading(): Promise<string> {
    return ((await this.getElement('dlgChangeLocalOfficeHeading').textContent()) ?? '').trim();
  }

  @step('Is dialog select enabled')
  async isDialogSelectEnabled(): Promise<boolean> {
    return !(await this.getElement('btnDlgSelect').isDisabled().catch(() => true));
  }

  @step('Get dialog row count')
  async getDialogRowCount(): Promise<number> {
    const table = this.getElement('tblDlgResults');
    await table.waitFor({ state: 'visible', timeout: 10_000 });
    return table.locator('tbody tr').count();
  }

  @step('Search in dialog')
  async searchInDialog(term: string): Promise<void> {
    const input = this.getElement('txtDlgSearch');
    await input.clear();
    await input.fill(term);
    Log.info(`Dialog search: "${term}"`);
  }

  @step('Get first dialog row text')
  async getFirstDialogRowText(): Promise<{ localOffice: string; localOfficeName: string }> {
    const table = this.getElement('tblDlgResults');
    const cells = await table.locator('tbody tr:first-child td').allTextContents();
    return {
      localOffice: (cells[1] ?? '').trim(),
      localOfficeName: (cells[2] ?? '').trim(),
    };
  }

  @step('Select first dialog row')
  async selectFirstDialogRow(): Promise<void> {
    const table = this.getElement('tblDlgResults');
    const checkbox = table.locator('tbody tr:first-child [role="checkbox"][aria-label="Select row"]');
    await checkbox.waitFor({ state: 'visible', timeout: 5_000 });
 // Dialog table has sticky header (z-20) that intercepts pointer events on first row.
 // Use dispatchEvent to programmatically click the checkbox, bypassing the overlay.
    await checkbox.dispatchEvent('click');
    Log.info('Selected first dialog row');
  }

  @step('Click dialog select')
  async clickDialogSelect(): Promise<void> {
    await this.getElement('btnDlgSelect').click();
    await this.getElement('dlgChangeLocalOffice').waitFor({ state: 'hidden', timeout: 5_000 });
    Log.info('Dialog Select confirmed, dialog closed');
  }

  @step('Click dialog cancel')
  async clickDialogCancel(): Promise<void> {
    await this.getElement('btnDlgCancel').click();
    await this.getElement('dlgChangeLocalOffice').waitFor({ state: 'hidden', timeout: 5_000 });
    Log.info('Dialog Cancel clicked, dialog closed');
  }

  @step('Get non self row state')
  async getNonSelfRowState(rowIndex: number): Promise<{
    primaryOffice: CheckboxState;
    sharesInventory: CheckboxState;
    deleteEnabled: boolean;
  }> {
    const tbl = this.getLocator('tblSharedSetupLocations');
    const row = `${tbl} tbody tr:nth-child(${rowIndex})`;
    const primaryEl = this.page.locator(`${row} td:nth-child(3) [role="checkbox"]`);
    const sharesEl = this.page.locator(`${row} td:nth-child(4) [role="checkbox"]`);
    const deleteEl = this.page.locator(`${row} td:nth-child(5) button`);

    const priChecked = (await primaryEl.getAttribute('aria-checked')) === 'true';
    const priDisabled = await primaryEl.isDisabled().catch(() => true);
    const shrChecked = (await sharesEl.getAttribute('aria-checked')) === 'true';
    const shrDisabled = await sharesEl.isDisabled().catch(() => true);
    const delDisabled = await deleteEl.isDisabled().catch(() => true);

    return {
      primaryOffice: { checked: priChecked, disabled: priDisabled },
      sharesInventory: { checked: shrChecked, disabled: shrDisabled },
      deleteEnabled: !delDisabled,
    };
  }

  @step('Delete non self row')
  async deleteNonSelfRow(rowIndex: number): Promise<void> {
    const tbl = this.getLocator('tblSharedSetupLocations');
    const deleteBtn = this.page.locator(`${tbl} tbody tr:nth-child(${rowIndex}) td:nth-child(5) button`);
    await deleteBtn.click();
    Log.info(`Deleted row at index ${rowIndex}`);
  }

  @step('Get non self row text')
  async getNonSelfRowText(rowIndex: number): Promise<{ localOffice: string; localOfficeName: string }> {
    const tbl = this.getLocator('tblSharedSetupLocations');
    const cells = await this.page.locator(`${tbl} tbody tr:nth-child(${rowIndex}) td`).allTextContents();
    return {
      localOffice: (cells[0] ?? '').trim(),
      localOfficeName: (cells[1] ?? '').trim(),
    };
  }

  @step('Toggle non self shares inventory')
  async toggleNonSelfSharesInventory(rowIndex: number): Promise<void> {
    const tbl = this.getLocator('tblSharedSetupLocations');
    const checkbox = this.page.locator(`${tbl} tbody tr:nth-child(${rowIndex}) td:nth-child(4) [role="checkbox"]`);
    await checkbox.click();
    Log.info(`Toggled non-self Shares Inventory at row ${rowIndex}`);
  }

  @step('Set non self shares inventory')
  async setNonSelfSharesInventory(rowIndex: number, checked: boolean): Promise<void> {
    const tbl = this.getLocator('tblSharedSetupLocations');
    const checkbox = this.page.locator(`${tbl} tbody tr:nth-child(${rowIndex}) td:nth-child(4) [role="checkbox"]`);
    const current = (await checkbox.getAttribute('aria-checked')) === 'true';
    if (current !== checked) {
      await checkbox.click();
      Log.info(`Set non-self SI row ${rowIndex} to ${checked}`);
    }
  }

  @step('Make form dirty')
  async makeFormDirty(): Promise<void> {
    await this.toggleSelfSharesInventory();
  }

  @step('Click top level tab')
  async clickTopLevelTab(tabKey: 'tabBasicInformation' | 'tabLocationManagementHistory'): Promise<void> {
    const tab = this.getElement(tabKey);
    await tab.click();
    // Two valid post-click outcomes:
    //   (a) Clean form: Radix transitions aria-selected="true" (router navigates).
    //   (b) Dirty form: Angular CanDeactivate guard blocks navigation; the Unsaved Changes
    //       alertdialog appears and aria-selected stays "false".
    // Polling for "either outcome" keeps the clean-form contract intact (a still resolves first)
    // while letting the dirty-form path proceed without a 10s timeout. Uses the specific
    // dlgUnsavedChanges testid (not generic role="alertdialog") so the Add dialog (role="dialog")
    // cannot false-positive.
    const dlgUnsaved = this.getElement('dlgUnsavedChanges');
    await expect.poll(
      async () =>
        (await tab.getAttribute('aria-selected').catch(() => null)) === 'true' ||
        (await dlgUnsaved.isVisible().catch(() => false)),
      { timeout: 10_000 }
    ).toBe(true);
    await this.waitForAngularStable();
    Log.info(`Clicked top-level tab: ${tabKey}`);
  }

 /**
 * Scopes to the two known top-level testids instead of `[role="tab"][aria-selected="true"]`.first(),
 * which also matches sub-tabs (Currency / Notes / etc.) and was order-dependent.
 */
  @step('Get active top level tab')
  async getActiveTopLevelTab(): Promise<string> {
    const candidates: Array<'tabBasicInformation' | 'tabLocationManagementHistory'> = [
      'tabBasicInformation',
      'tabLocationManagementHistory',
    ];
    for (const key of candidates) {
      const el = this.getElement(key);
      const aria = await el.getAttribute('aria-selected').catch(() => null);
      if (aria === 'true') {
        return ((await el.textContent()) ?? '').trim();
      }
    }
    return '';
  }

  @step('Has visible unsaved dialog')
  async hasVisibleUnsavedDialog(timeoutMs: number = 1_500): Promise<boolean> {
    return this.isElementVisible('dlgUnsavedChanges', timeoutMs);
  }

  @step('Click unsaved dialog stay')
  async clickUnsavedDialogStay(timeoutMs: number = 5_000): Promise<void> {
    const dlg = this.getElement('dlgUnsavedChanges');
    await dlg.waitFor({ state: 'visible', timeout: timeoutMs });
    await this.getElement('btnUnsavedChangesCancel').click();
    await dlg.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
  }

  @step('Rapid click add')
  async rapidClickAdd(count: number = 5, intervalMs: number = 50): Promise<void> {
    const addBtn = this.getElement('btnSharedAdd');
    for (let i = 0; i < count; i++) {
      await addBtn.click({ force: true, noWaitAfter: true }).catch((err: Error) => {
        // Only swallow overlay-intercept-class errors (expected for late clicks while dialog is open).
        // Anything else (element not found, detached, target closed) must propagate so the test fails with the real cause.
        if (!/intercepts pointer events|element is not visible|outside of the viewport|Target page, context or browser has been closed/i.test(err.message)) {
          throw err;
        }
      });
      if (i < count - 1 && intervalMs > 0) {
        await new Promise(r => setTimeout(r, intervalMs));
      }
    }
    Log.info(`rapidClickAdd: fired ${count} clicks at ${intervalMs}ms intervals`);
  }

  @step('Count add dialogs')
  async countAddDialogs(): Promise<number> {
    const c = await this.getElement('dlgChangeLocalOffice').count();
    return c;
  }
}
