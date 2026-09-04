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

 // Local Office selectors first: they are absent from ALL_SELECTORS because btnSave and
 // tabBasicInformation collide with Location Settings. Global lookup covers shared dialogs.
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

 // safeNavigateTo because the form may carry unsaved edits (beforeunload).
 // 30s form-visibility: under 4-worker contention loads regularly exceed 15s.
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

  @step('Is field disabled')
  async isFieldDisabled(key: string): Promise<boolean> {
    return this.getElement(key).isDisabled().catch(() => true);
  }

  /** Click to focus a field without changing its value — used to inspect the raw edit-mode
   * value of fields that reformat their display on blur (e.g. percentage inputs). */
  @step('Focus field')
  async focusField(key: string): Promise<void> {
    await this.getElement(key).click();
  }

  /** Blurs the currently focused field via Tab — pairs with focusField (inspecting a raw
   * pre-blur value) and pasteIntoField (committing a pasted value), without a spec having to
   * reach into the raw Playwright page directly. */
  @step('Blur active field')
  async blurActiveField(): Promise<void> {
    await this.page.keyboard.press('Tab');
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

 /** Polls briefly rather than reading once -- confirmed live that a Select's selected-value span
 * (e.g. Default Order Type) can render empty for a short window right after navigation, before its
 * value hydrates client-side; this page has no Angular testability for waitForAngularStable to key
 * off of, so that helper is a no-op here and cannot be relied on to have already waited it out. */
  @step('Get combobox value')
  async getComboboxValue(key: string): Promise<string> {
    const el = this.getElement(key);
    const deadline = Date.now() + 3_000;
    let text = '';
    while (Date.now() < deadline) {
      text = ((await el.textContent().catch(() => '')) || '').trim();
      if (text) return text;
      await this.page.waitForTimeout(150);
    }
    return text;
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

 // Angular does not reliably markAsPristine after an ECT save, so the dirty guard raises
 // "Unsaved changes" on the next tab click — discard it to complete the navigation.
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

 // Mirrors LocalOfficeEctPage.isOnEctTab's count()-guarded pattern -- safe to call from a
 // beforeEach before any navigation has happened yet (e.g. the very first test in a worker),
 // when 'tabBasicInformation' may not exist in the DOM at all.
  @step('Is on basic info tab')
  async isOnBasicInfoTab(): Promise<boolean> {
    const tab = this.getElement('tabBasicInformation');
    if ((await tab.count()) === 0) return false;
    return (await tab.getAttribute('aria-selected').catch(() => null)) === 'true';
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

  /** Locator for the global "Unsaved changes" dialog — exposed (not just a boolean) so specs can
   * drive Playwright's own `expect(...).toBeVisible()` polling assertion directly, the same way
   * BasePage already exposes `this.page` for spec-level assertions, instead of reaching into the
   * raw page with a hardcoded `[role="alertdialog"]` selector. Synchronous, like getElement/
   * getLocator above, so it's not decorated with @step (that decorator expects an async action). */
  getUnsavedChangesDialog(): Locator {
    return this.getElement('dlgUnsavedLocalOffice');
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

  private clipboardPermissionsGranted = false;

  /** Grants clipboard read/write permissions on the browser context (idempotent per page
   * instance) so a real OS-level paste (Control+V) can be simulated instead of `.fill()`/keystrokes
   * -- confirmed live this is a genuinely different code path than typed input and can bypass a
   * masked input's per-keystroke keydown filtering (see pasteIntoField). */
  protected async grantClipboardPermissions(): Promise<void> {
    if (this.clipboardPermissionsGranted) return;
    const origin = this.config?.base_url;
    await this.page.context().grantPermissions(['clipboard-read', 'clipboard-write'], origin ? { origin } : undefined);
    this.clipboardPermissionsGranted = true;
  }

 /** Writes `value` to the OS clipboard, then focuses `key`, selects all, and pastes via
 * Control+V -- a real paste, not `.fill()`/keystrokes. Confirmed live this bypasses a masked
 * input's per-keystroke keydown filtering: the raw, unmasked pasted text lands in the DOM
 * immediately (visible via getInputValue() before any blur). Deliberately does NOT press Tab --
 * callers inspect the raw post-paste value first, then blur (Tab) themselves to trigger the
 * same blur-time validator that governs typed input. */
  @step('Paste into field')
  async pasteIntoField(key: string, value: string): Promise<void> {
    await this.grantClipboardPermissions();
    await this.page.evaluate((v) => navigator.clipboard.writeText(v), value);
    const el = this.getElement(key);
    await el.click();
    await this.page.keyboard.press('Control+a');
    await this.page.keyboard.press('Control+v');
  }

 /** DOM `maxLength` property (not the raw attribute) — reads -1 for a genuinely unconstrained
 * input (Phone 1/2, PO Number/Label) the same way the browser itself reports it, matching how the
 * Basic Information plan documents each field's limit. */
  @step('Get field max length')
  async getFieldMaxLength(key: string): Promise<number> {
    return this.getElement(key).evaluate((node: HTMLInputElement) => node.maxLength);
  }

  @step('Is field required attribute set')
  async isFieldRequiredAttr(key: string): Promise<boolean> {
    return this.getElement(key).evaluate((node: HTMLInputElement) => node.required);
  }

 /** Confirmed live: an invalid Basic Information field renders a `data-slot="tooltip-trigger"`
 * circle-alert icon immediately before the input (inside the same flex wrapper), which opens a
 * Radix `data-slot="tooltip-content"` popup on hover. Radix duplicates the content text (a
 * visually-hidden a11y copy) so the returned string reads as the message twice back-to-back --
 * callers should assert with `.toContain(...)`, not `.toBe(...)`. Scoped to this field's own
 * wrapper so two simultaneously-invalid fields (see plan 10.2) never resolve to the wrong icon. */
  @step('Get field tooltip text')
  async getFieldTooltipText(key: string): Promise<string> {
    const icon = this.getElement(key).locator('xpath=..').locator('[data-slot="tooltip-trigger"]');
    await icon.waitFor({ state: 'visible', timeout: 5_000 });
    await icon.hover();
    const tooltip = this.page.locator('[data-slot="tooltip-content"]').first();
    await tooltip.waitFor({ state: 'visible', timeout: 5_000 });
    return ((await tooltip.textContent()) || '').trim();
  }

  getSaveChangesDialog(): Locator {
    return this.getElement('dlgSaveChanges');
  }

 /** Clicks Save WITHOUT resolving the resulting confirm dialog -- pairs with getSaveChangesDialog()
 * / getTextContent('dlgSaveChanges') to let a spec assert the dialog's exact heading/body text
 * (plan 9.1) before choosing Cancel or Confirm itself, something clickSaveAndConfirm/
 * clickSaveAndCancel (which resolve the dialog internally) cannot expose. */
  @step('Click save button only')
  async clickSaveButtonOnly(): Promise<void> {
    await this.getElement('btnSave').click();
    await this.getSaveChangesDialog().waitFor({ state: 'visible', timeout: 5_000 });
  }

  @step('Click save changes cancel button')
  async clickSaveChangesCancelButton(): Promise<void> {
    await this.getElement('btnSaveChangesCancel').click();
    await this.getSaveChangesDialog().waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
  }

 /** Generic Section/Room "Add New..." grid: excludes the trailing add-row so row indices/counts
 * only ever cover real data rows. Shared by the Section- and Room-specific methods above (which
 * still exist under their original names -- the plan cites them by name -- and now delegate here)
 * plus the table-agnostic helpers below. */
  private getGridDataRows(tableKey: string) {
    const table = this.getElement(tableKey);
    return table.locator('tbody tr').filter({
      hasNot: this.page.locator('input[placeholder="Add New..."]'),
    });
  }

 /** Both the Section and Room grids auto-sort alphabetically after every commit (confirmed live --
 * plan 5.9), so a row's index cannot be trusted across edits. Callers must re-resolve the row by
 * its CURRENT displayed name before every interaction rather than caching an index. */
  @step('Get grid row index by name')
  async getGridRowIndexByName(tableKey: string, name: string): Promise<number> {
    const rows = this.getGridDataRows(tableKey);
    const count = await rows.count();
    for (let i = 0; i < count; i++) {
      const val = await rows.nth(i).locator('td:first-child input').inputValue().catch(() => '');
      if (val.trim() === name) return i;
    }
    throw new Error(`Row "${name}" not found in ${tableKey}`);
  }

  @step('Edit grid row name by current name')
  async editGridRowNameByCurrentName(tableKey: string, currentName: string, newName: string): Promise<void> {
    const idx = await this.getGridRowIndexByName(tableKey, currentName);
    const input = this.getGridDataRows(tableKey).nth(idx).locator('td:first-child input');
    await input.click();
    await this.page.keyboard.press('Control+a');
    await this.page.keyboard.type(newName); // real keystrokes -- duplicate-name detection needs live typing, not fill()
    await input.press('Tab');
  }

 /** Types into the row's Name input WITHOUT blurring, then presses Escape and returns the raw
 * (still-focused) value -- used to prove Escape does/does not revert an in-progress edit (plan
 * 5.4) without ever committing the typed text. */
  @step('Type grid row name and escape without blur')
  async typeGridRowNameAndEscape(tableKey: string, currentName: string, text: string): Promise<string> {
    const idx = await this.getGridRowIndexByName(tableKey, currentName);
    const input = this.getGridDataRows(tableKey).nth(idx).locator('td:first-child input');
    await input.click();
    await this.page.keyboard.press('Control+a');
    await this.page.keyboard.type(text);
    await input.press('Escape');
    return input.inputValue();
  }

 /** Right-clicks the row (title="Right-click for actions", confirmed live) to open its "Section
 * Lines"/"Room Lines" popup, then clicks the popup's "Delete" button -- scoped inside the table's
 * own DOM subtree (the popup renders as a `position: fixed` child of the table container, not a
 * body-level portal), so two grids' popups can never collide. */
  @step('Delete grid row by name')
  async deleteGridRowByName(tableKey: string, name: string): Promise<void> {
    const idx = await this.getGridRowIndexByName(tableKey, name);
    const row = this.getGridDataRows(tableKey).nth(idx);
    await row.click({ button: 'right' });
    const deleteBtn = this.getElement(tableKey).getByRole('button', { name: 'Delete', exact: true });
    await deleteBtn.waitFor({ state: 'visible', timeout: 5_000 });
    await deleteBtn.click();
  }

 /** True once every row's Name cell (including the trailing "Add New..." row) has lost its input
 * element -- the observable effect of unchecking "Use Section" (plan 5.8): the grid degrades to
 * plain static text everywhere except the Active toggle column. */
  @step('Is grid name column read only')
  async isGridNameColumnReadOnly(tableKey: string): Promise<boolean> {
    return (await this.getElement(tableKey).locator('tbody tr td:first-child input').count()) === 0;
  }

  @step('Get discount exemption row count')
  async getDiscountRowCount(): Promise<number> {
    return this.getElement('tblDiscountExemptions').locator('tbody tr').count();
  }

  @step('Get discount service type by index')
  async getDiscountServiceTypeByIndex(rowIndex: number): Promise<string> {
    const cell = this.getElement('tblDiscountExemptions').locator('tbody tr').nth(rowIndex).locator('td:first-child');
    return ((await cell.textContent()) || '').trim();
  }

  @step('Is discount row exempt')
  async isDiscountRowExempt(rowIndex: number): Promise<boolean> {
    const cell = this.getElement('tblDiscountExemptions').locator('tbody tr').nth(rowIndex).locator('td:last-child');
    return (await cell.locator('svg').count()) > 0;
  }

  @step('Is discount service type cell read only')
  async isDiscountServiceTypeReadOnly(rowIndex: number): Promise<boolean> {
    const cell = this.getElement('tblDiscountExemptions').locator('tbody tr').nth(rowIndex).locator('td:first-child');
    return (await cell.locator('input, textarea').count()) === 0;
  }

  @step('Attempt edit discount service type cell')
  async attemptEditDiscountServiceTypeCell(rowIndex: number): Promise<void> {
    const cell = this.getElement('tblDiscountExemptions').locator('tbody tr').nth(rowIndex).locator('td:first-child');
    await cell.dblclick({ timeout: 3_000 }).catch(() => {});
  }

  @step('Count script elements')
  async countScriptElements(containerKey: string): Promise<number> {
    return this.getElement(containerKey).locator('script').count();
  }

 /** Runs `action`, failing loudly if a JS `alert()` fired during it -- used by the XSS-payload
 * scenarios (plan 5.10 / 10.3) to prove a typed `<script>alert(1)</script>` payload is stored as
 * inert text rather than executed. Dismisses (rather than accepts) any alert it catches so a
 * genuinely-firing alert can never hang the run. */
  @step('Run and assert no alert dialog fires')
  async runWithNoAlertDialog(action: () => Promise<void>): Promise<void> {
    let sawAlert = false;
    const handler = (dialog: import('@playwright/test').Dialog) => {
      if (dialog.type() === 'alert') {
        sawAlert = true;
        dialog.dismiss().catch(() => {});
      }
    };
    this.page.on('dialog', handler);
    try {
      await action();
    } finally {
      this.page.off('dialog', handler);
    }
    if (sawAlert) throw new Error('Unexpected JS alert() dialog fired -- XSS payload was executed, not escaped');
  }

 /** Temporarily disables the global auto-accept fixture (pages.fixture.ts checks this flag) so this
 * call can observe and assert the native beforeunload dialog actually fired, then accepts it itself
 * to let the reload proceed. Generic to any dirty-form-guarded Local Office Settings page -- moved
 * here (from LocalOfficeEctPage, which now inherits it) since neither the mechanism nor the flag it
 * flips reference anything ECT-specific. */
  @step('Hard reload expecting beforeunload dialog')
  async hardReloadExpectingBeforeunload(): Promise<boolean> {
    let sawDialog = false;
    const pageAny = this.page as unknown as Record<string, unknown>;
    pageAny.__skipBeforeunloadAutoAccept = true;
    const handler = async (dialog: import('@playwright/test').Dialog) => {
      if (dialog.type() === 'beforeunload') {
        sawDialog = true;
        await dialog.accept().catch(() => {});
      }
    };
    this.page.on('dialog', handler);
    try {
      await this.page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
    } finally {
      this.page.off('dialog', handler);
      pageAny.__skipBeforeunloadAutoAccept = false;
    }
    return sawDialog;
  }
}
