import { Locator } from '@playwright/test';
import { LocalOfficeSettingsPage } from './local-office-settings.page';
import { LocalOfficeEctSelectors, LocalOfficeSettingsSelectors, getTsSelector } from '../../selectors';
import { Log } from '../../utils/logger';
import { step } from '../../fixtures/step-decorator';

export class LocalOfficeEctPage extends LocalOfficeSettingsPage {

  protected getElement(elementName: string): Locator {
    const selector = (LocalOfficeEctSelectors as Record<string, string>)[elementName]
      ?? (LocalOfficeSettingsSelectors as Record<string, string>)[elementName]
      ?? getTsSelector(elementName);
    if (!selector) throw new Error(`Selector '${elementName}' not found in Local Office ECT, Settings, or global selectors`);
    return this.page.locator(selector);
  }

 // The ECT API intermittently returns "No currencies" / "No data available" under load, so each
 // attempt reloads and re-checks for real data rather than trusting the first render.
  @step('Open ECT Settings tab')
  async navigateToEctTab(): Promise<void> {
    const maxRetries = 4;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const tab = this.getElement('tabEctSettings');
      const isSelected = await tab.getAttribute('aria-selected').catch(() => null);
      if (isSelected !== 'true') {
        await this.dismissAlertDialogIfVisible();
        await tab.click();
        await this.waitForAngularStable();
      }

      const panelContent = await this.page.locator('[role="tabpanel"]').textContent().catch(() => '');
      const noCurrencies = panelContent?.includes('No currencies for selected location');
      const noData = panelContent?.includes('No data available');

      if (!noCurrencies && !noData) {
        const lblVisible = await this.getElement('lblEctLocationName')
          .waitFor({ state: 'visible', timeout: 5_000 })
          .then(() => true).catch(() => false);
        if (lblVisible) {
          const table = this.getElement('tblLaborCostAssumptions');
          const hasData = await table.locator('tbody tr').count() > 1
            || !(await table.textContent() || '').includes('No data available');
          if (hasData) return;
        }
      }

      if (attempt === maxRetries) {
        throw new Error(`ECT tab failed to load after ${maxRetries} retries. Last state: ${noCurrencies ? '"No currencies"' : noData ? '"No data available"' : 'label not visible'}`);
      }

      Log.warn(`ECT tab not loaded (attempt ${attempt + 1}/${maxRetries + 1}) — retry via page reload`);
      await this.page.waitForTimeout(1_000); // Give API breathing room
      await this.dismissAlertDialogIfVisible();
      await this.page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
      await this.waitForAngularStable();
      await this.dismissAlertDialogIfVisible();
    }
  }

  @step('Is ECT Settings fixed costs save enabled')
  async isEctFixedCostsSaveEnabled(): Promise<boolean> {
    return !(await this.getElement('btnSaveFixedCosts').isDisabled());
  }

  @step('Is ECT Settings labor costs save enabled')
  async isEctLaborCostsSaveEnabled(): Promise<boolean> {
    return !(await this.getElement('btnSaveLaborCosts').isDisabled());
  }

 // waitForAngularStable returns before the save response lands, so navigating next would hit the
 // dirty guard — the button disabling is the real "saved and pristine" signal.
  @step('Click save fixed costs')
  async clickSaveFixedCosts(): Promise<void> {
    await this.getElement('btnSaveFixedCosts').click();
    await this.waitForAngularStable();
    await this.waitForSaveDisabled('btnSaveFixedCosts');
  }

  @step('Click save labor costs')
  async clickSaveLaborCosts(): Promise<void> {
    await this.getElement('btnSaveLaborCosts').click();
    await this.waitForAngularStable();
    await this.waitForSaveDisabled('btnSaveLaborCosts');
  }

  private async waitForSaveDisabled(btnKey: string, timeout = 10_000): Promise<void> {
    const btn = this.getElement(btnKey);
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (await btn.isDisabled().catch(() => false)) {
        Log.info(`[OK] Save button disabled (${btnKey}) — save complete, form pristine`);
        return;
      }
      await this.page.waitForTimeout(200);
    }
    Log.warn(`[WARN] Save button (${btnKey}) did not disable within ${timeout}ms — proceeding anyway`);
  }

  @step('Get ECT Settings field value')
  async getEctFieldValue(key: string): Promise<string> {
    return this.getFieldDisplayValue(key);
  }

 /** ECT's Fixed Costs percentage fields (Benefits Multiplier / Historical Subrental %) never set
 * `aria-invalid` — confirmed live: the required-field/invalid state is signaled purely via a
 * `border-destructive` CSS class on the input (plus a red circle-alert tooltip icon rendered as a
 * sibling, itself `aria-hidden`). The shared BasePage.waitForFieldInvalid/waitForFieldValid poll
 * `aria-invalid`, which never flips here, so override with a class-based poll for this page only —
 * other pages that genuinely use aria-invalid (Terms & Conditions, Service Charge, Discount Matrix,
 * etc.) are untouched. */
  private async waitForEctFieldDestructive(key: string, expectDestructive: boolean, timeout: number): Promise<boolean> {
    const el = this.getElement(key);
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const cls = await el.getAttribute('class').catch(() => null);
      const isDestructive = !!cls && cls.includes('border-destructive');
      if (isDestructive === expectDestructive) return true;
      await this.page.waitForTimeout(200);
    }
    return false;
  }

  @step('Expect invalid (ECT)')
  async expectInvalid(key: string, timeout = 5_000): Promise<boolean> {
    return this.waitForEctFieldDestructive(key, true, timeout);
  }

  @step('Expect valid (ECT)')
  async expectValid(key: string, timeout = 5_000): Promise<boolean> {
    return this.waitForEctFieldDestructive(key, false, timeout);
  }

  @step('Get event profit target row count')
  async getEventProfitTargetRowCount(): Promise<number> {
    return this.getElement('tblEventProfitTarget').locator('tbody tr').count();
  }

  @step('Is event profit target read only')
  async isEventProfitTargetReadOnly(): Promise<boolean> {
    return (await this.getElement('tblEventProfitTarget').locator('input, textarea').count()) === 0;
  }

  @step('Get sub rental matrix row count')
  async getSubRentalMatrixRowCount(): Promise<number> {
    return this.getElement('tblSubRentalMatrix').locator('tbody tr').count();
  }

  @step('Is sub rental read only')
  async isSubRentalReadOnly(): Promise<boolean> {
    return (await this.getElement('tblSubRentalMatrix').locator('input, textarea').count()) === 0;
  }

  @step('Get labor cost row count')
  async getLaborCostRowCount(): Promise<number> {
    return this.getElement('tblLaborCostAssumptions').locator('tbody tr').count();
  }

  @step('Get labor cost value')
  async getLaborCostValue(rowIndex: number): Promise<string> {
    const input = this.page.locator(`[data-testid="ect-settings-input-labor-cost-${rowIndex}"]`);
    return input.inputValue();
  }

 /** Angular can fire "Unsaved changes" alertdialog asynchronously after tab load.
 * If the click is intercepted, dismiss the dialog and retry.
 *
 * Uses locator.fill() (sets the DOM value + dispatches a single "input" event) rather than
 * click + Ctrl+A + keyboard.type(): confirmed live that this cell's numeric mask filters
 * keystrokes one at a time and, when it rejects a character (e.g. the leading "-" of "-20"),
 * it collapses the current text selection WITHOUT deleting the previously-selected text. Typing
 * a value whose first character is rejected (e.g. "-20") after Ctrl+A therefore does not replace
 * the old value — the surviving valid characters ("20") get inserted mid-string into the old
 * value instead (observed: "41.00" + "-20" via keyboard produced the corrupted "4120.00", not
 * "20.00"). fill() applies the new value as one atomic replace, matching how this field's
 * whole-value validator actually evaluates entered text (verified live via getLaborCostValue()
 * before/after each step — see TC-LOE-ECT-012). */
  @step('Fill labor cost')
  async fillLaborCost(rowIndex: number, value: string): Promise<void> {
    const input = this.page.locator(`[data-testid="ect-settings-input-labor-cost-${rowIndex}"]`);
    try {
      await input.click({ timeout: 5_000 });
    } catch {
 // Dialog may have appeared after tab load — dismiss and retry.
 // After dismissal, the app may revert to Basic Info tab. Re-navigate to ECT.
      await this.dismissAlertDialogIfVisible();
      await this.navigateToEctTab();
      await input.click({ timeout: 10_000 });
    }
    await input.fill(value);
    await input.press('Tab');
  }

  @step('Get last labor cost row index')
  async getLastLaborCostRowIndex(): Promise<number> {
    return (await this.getLaborCostRowCount()) - 1;
  }

 /** Same paste simulation as LocalOfficeSettingsPage.pasteIntoField, targeting a Labor Cost grid
 * cell by row index (the grid has no selector key -- rows are addressed by index, same as
 * fillLaborCost). Deliberately does NOT press Tab -- callers inspect the raw post-paste value
 * first, then blur (Tab) themselves. */
  @step('Paste into labor cost')
  async pasteIntoLaborCost(rowIndex: number, value: string): Promise<void> {
    await this.grantClipboardPermissions();
    await this.page.evaluate((v) => navigator.clipboard.writeText(v), value);
    const input = this.page.locator(`[data-testid="ect-settings-input-labor-cost-${rowIndex}"]`);
    await input.click();
    await this.page.keyboard.press('Control+a');
    await this.page.keyboard.press('Control+v');
  }

  @step('Get first labor class name')
  async getFirstLaborClassName(): Promise<string> {
    const cell = this.getElement('tblLaborCostAssumptions').locator('tbody tr:first-child td:first-child');
    return (await cell.textContent() || '').trim();
  }

  @step('Get last labor class name')
  async getLastLaborClassName(): Promise<string> {
    const cell = this.getElement('tblLaborCostAssumptions').locator('tbody tr:last-child td:first-child');
    return (await cell.textContent() || '').trim();
  }

  @step('Is labor class read only')
  async isLaborClassReadOnly(): Promise<boolean> {
    return (await this.getElement('tblLaborCostAssumptions')
      .locator('tbody tr:first-child td:first-child input').count()) === 0;
  }

  @step('Is labor cost editable')
  async isLaborCostEditable(): Promise<boolean> {
    return (await this.getElement('tblLaborCostAssumptions')
      .locator('tbody tr:first-child td:last-child input').count()) > 0;
  }

  @step('Get table row texts')
  async getTableRowTexts(tableKey: string, rowSelector: string): Promise<string[]> {
    const cells = this.getElement(tableKey).locator(`${rowSelector} td`);
    return (await cells.allTextContents()).map(t => t.trim());
  }

  @step('Get table column headers')
  async getTableColumnHeaders(tableKey: string): Promise<string[]> {
    return (await this.getElement(tableKey).locator('th').allTextContents()).map(t => t.trim());
  }

  @step('Is on ECT tab')
  async isOnEctTab(): Promise<boolean> {
    const tab = this.getElement('tabEctSettings');
    if ((await tab.count()) === 0) return false;
    return (await tab.getAttribute('aria-selected').catch(() => null)) === 'true';
  }

 // Route away first to force a destroy + recreate of the settings component (mirrors
 // LocationLocalInfoPage.reloadAndNavigateToLocalInfo) — page.reload can hit the router cache.
  @step('Reload and navigate to ECT')
  async reloadAndNavigateToEct(officeNo: string = '1604'): Promise<void> {
    const base = this.config?.base_url || '';
    await this.page.goto(`${base}locations`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await this.navigateToBasicInfoTab(officeNo);
    await this.navigateToEctTab();
  }

  @step('Get fixed costs description paragraph count')
  async getFixedCostsDescriptionParagraphCount(): Promise<number> {
    return this.getElement('secFixedCosts').locator('p').count();
  }

  @step('Attempt edit event profit target cell')
  async attemptEditEventProfitTargetCell(): Promise<void> {
    const cell = this.getElement('tblEventProfitTarget').locator('tbody tr').first().locator('td').nth(2);
    await cell.dblclick({ timeout: 3_000 }).catch(() => {});
  }

  @step('Attempt edit sub rental matrix cell')
  async attemptEditSubRentalMatrixCell(): Promise<void> {
    const cell = this.getElement('tblSubRentalMatrix').locator('tbody tr').first().locator('td').nth(2);
    await cell.dblclick({ timeout: 3_000 }).catch(() => {});
  }

  @step('Get labor cost action button count')
  async getLaborCostActionButtonCount(): Promise<number> {
    return this.getElement('secSaveLaborCosts').locator('button').count();
  }

 /** Types a value into a Labor Cost cell and presses Escape (instead of Tab) without blurring
 * via a committed edit — used to prove Escape does NOT revert the in-progress edit here (unlike
 * the Section/Room Escape-to-cancel pattern on Basic Information). Returns the raw input value. */
  @step('Escape labor cost mid edit')
  async escapeLaborCostMidEdit(rowIndex: number, value: string): Promise<string> {
    const input = this.page.locator(`[data-testid="ect-settings-input-labor-cost-${rowIndex}"]`);
    await input.click();
    await this.page.keyboard.press('Control+a');
    await this.page.keyboard.type(value);
    await input.press('Escape');
    return input.inputValue();
  }

 // hardReloadExpectingBeforeunload moved to LocalOfficeSettingsPage (the parent) -- the mechanism
 // is generic to any dirty-form-guarded Local Office Settings page, not ECT-specific. Inherited
 // from there now; see that class for the implementation/comment.

 /** Fills+tabs a Fixed Costs field, saves, reloads+re-navigates to ECT and asserts the new value
 * persisted, then restores the original value and saves again (via the shared saveAndVerifyPersisted
 * retry helper) so office 1604 is left clean for subsequent tests — mirrors
 * LocationLocalInfoPage.testBoundaryValue's save-verify-restore pattern. */
  @step('Save fixed costs field and verify persisted')
  async saveFixedCostsFieldAndVerifyPersisted(
    fieldKey: string,
    value: string,
    expectedDisplayAfterSave: string,
    restoreValue: string,
    expectedDisplayAfterRestore: string,
    officeNo: string = '1604',
  ): Promise<void> {
    await this.fillAndTab(fieldKey, value);
    await this.clickSaveFixedCosts();
    await this.reloadAndNavigateToEct(officeNo);
    const persisted = await this.getEctFieldValue(fieldKey);
    if (persisted !== expectedDisplayAfterSave) {
      throw new Error(`${fieldKey}: expected persisted display "${expectedDisplayAfterSave}" after save, got "${persisted}"`);
    }

    await this.saveAndVerifyPersisted({
      isAtTarget: async () => (await this.getEctFieldValue(fieldKey)) === expectedDisplayAfterRestore,
      applyMutation: async () => { await this.fillAndTab(fieldKey, restoreValue); },
      save: async () => { await this.clickSaveFixedCosts(); },
      reload: () => this.reloadAndNavigateToEct(officeNo),
      label: `${fieldKey} restored to ${expectedDisplayAfterRestore}`,
    });
  }
}
