import { Page, expect } from '@playwright/test';
import { step } from '../../fixtures/step-decorator';
import { BasePage } from '../base.page';
import { Log } from '../../utils/logger';
import { IConfig } from '../../types';
import { ChangeLocalOfficeComponent } from '../components/change-local-office.component';
import {
  TAB_LIST,
  TAB_LOCATIONS,
  TAB_EXEMPTIONS,
  PANEL_LOCATIONS,
  PANEL_EXEMPTIONS,
  TBL_CONTAINER,
  ROWS_TAB1,
  COL_HEADERS_TAB1,
  BTN_SAVE_TAB1,
  BTN_ADD,
  TXT_SEARCH_TAB1,
  TH_SORT_ID,
  TH_SORT_NAME,
  TH_SORT_DISCOUNT,
  TH_SORT_START,
  btnRemove,
  btnToggleDiscount,
  INP_DATE,
  BTN_CALENDAR,
  ROWS_TAB2,
  COL_HEADERS_TAB2,
  TXT_SEARCH_TAB2,
  BTN_CANCEL_TAB2,
  BTN_SAVE_TAB2,
  chkExempt,
} from '../../selectors/discount-optimization/discount-optimization';

// Grid first paint takes ~22 s; the container renders empty before data arrives.
const GRID_READY_TIMEOUT_MS = 45_000;

// 80 ms is the slowest cadence needed for Angular's reactive form to see every keydown/input/keyup.
const KEYSTROKE_DELAY_MS = 80;

// Discount Optimization setup page: locations grid (tab 1) and service-type exemptions (tab 2).
// Ready-gates wait on non-zero row counts; tabs and rows are selected by text, never by radix id or index.
export class DiscountOptimizationPage extends BasePage {
  readonly changeLocalOffice = new ChangeLocalOfficeComponent(this.page);

  constructor(page: Page, config?: IConfig) {
    super(page, config);
    Log.info('DiscountOptimizationPage initialized');
  }

  // ---------------------------------------------------------------- navigation & ready

  /** Opens the page for an office and waits for real rows, never the empty skeleton. */
  @step('Open the Discount Optimization page for an office')
  async open(officeNo: string = '1604'): Promise<void> {
    const baseUrl = this.config?.base_url || '';
    await this.safeNavigateTo('about:blank');
    await this.navigateTo(
      `${baseUrl}locations/${officeNo}/settings/discount-optimization-settings`
    );
    await this.waitForGrid();
  }

  // Polls for a non-zero row count: TBL_CONTAINER is visible before data arrives, so
  // waiting on its visibility alone returns against an empty skeleton.
  @step('Wait for the Discount Optimization grid to show rows')
  async waitForGrid(timeout = GRID_READY_TIMEOUT_MS): Promise<void> {
    await this.page.locator(TAB_LIST).first().waitFor({ state: 'visible', timeout });
    await this.page.locator(TBL_CONTAINER).first().waitFor({ state: 'visible', timeout });
    // Wait until at least one data row is present — the container exists before data arrives.
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const count = await this.page.locator(ROWS_TAB1).count();
      if (count > 0) break;
      await this.page.waitForTimeout(400);
    }
    const finalCount = await this.page.locator(ROWS_TAB1).count();
    if (finalCount === 0) {
      throw new Error(
        `Discount Optimization grid still had 0 rows after ${timeout} ms at ${this.page.url()}. ` +
        `The grid renders in roughly 22 s; if this fires, the data genuinely did not arrive.`
      );
    }
    await this.waitForAngularStable();
  }

  /** Reloads the page and waits for the grid. Discards anything not yet saved. */
  @step('Reload the page and wait for the grid')
  async reloadAndWait(officeNo: string = '1604'): Promise<void> {
    await this.open(officeNo);
  }

  // ---------------------------------------------------------------- tab navigation

  /** Switches tab by visible text and waits for the new panel — never by radix-generated id. */
  @step('Switch to a tab by name')
  async switchTab(tabName: 'Discount Optimization' | 'Special Rate Exemptions by Service Type'): Promise<void> {
    const trigger = tabName === 'Discount Optimization' ? TAB_LOCATIONS : TAB_EXEMPTIONS;
    await this.page.locator(trigger).first().click();
    if (tabName === 'Special Rate Exemptions by Service Type') {
      // PANEL_EXEMPTIONS is anchored to Tab 2's own search input, so the poll below cannot
      // resolve against Tab 1's rows mid-transition.
      await this.page.locator(PANEL_EXEMPTIONS).waitFor({ state: 'visible', timeout: GRID_READY_TIMEOUT_MS });
      // The panel mounts before its data loads.
      const deadline = Date.now() + GRID_READY_TIMEOUT_MS;
      while (Date.now() < deadline) {
        const count = await this.page.locator(ROWS_TAB2).count();
        if (count > 0) break;
        await this.page.waitForTimeout(400);
      }
      const finalCount = await this.page.locator(ROWS_TAB2).count();
      if (finalCount === 0) {
        throw new Error(
          `Discount Optimization Tab 2 (Special Rate Exemptions) grid still had 0 rows after ${GRID_READY_TIMEOUT_MS} ms at ${this.page.url()}. ` +
          `Tab 2 panel was visible but its rows never arrived — observed row count: 0.`
        );
      }
    } else {
      await this.page.locator(PANEL_LOCATIONS).first().waitFor({ state: 'visible', timeout: GRID_READY_TIMEOUT_MS });
    }
    await this.waitForAngularStable();
  }

  // ---------------------------------------------------------------- tab 1 — row count & headers

  /** Number of data rows currently visible in the Tab 1 locations grid. */
  @step('Get the number of rows in the locations grid')
  async getRowCount(): Promise<number> {
    return this.page.locator(ROWS_TAB1).count();
  }

  /** Column header text of Tab 1 in display order. */
  @step('Read the column headers of the locations grid')
  async getColumnHeaders(): Promise<string[]> {
    const raw = await this.page.locator(COL_HEADERS_TAB1).allTextContents();
    return raw.map((h) => h.replace(/\s+/g, ' ').trim()).filter((h) => h.length > 0);
  }

  // ---------------------------------------------------------------- tab 1 — search

  // Waits for the count to move off its baseline AND then settle: the virtualized grid passes
  // through partial counts, so a "count changed" check alone returns a partial row set.
  @step('Search for a location by name or number')
  async search(term: string): Promise<void> {
    const countBefore = await this.page.locator(ROWS_TAB1).count();
    const inp = this.page.locator(TXT_SEARCH_TAB1).first();
    await inp.click();
    await inp.pressSequentially(term, { delay: KEYSTROKE_DELAY_MS });
    await this._waitForGridCountChangeFrom(ROWS_TAB1, countBefore);
    await this._waitForGridCountStable(ROWS_TAB1);
  }

  /** Clears the Tab 1 search box and waits for the full list to restore. */
  @step('Clear the location search box')
  async clearSearch(): Promise<void> {
    const inp = this.page.locator(TXT_SEARCH_TAB1).first();
    await inp.click();
    await this.page.keyboard.press('Control+A');
    await this.page.keyboard.press('Delete');
    await expect(inp).toHaveValue('');
    await this._waitForNonZeroGridCount(ROWS_TAB1);
  }

  // ---------------------------------------------------------------- tab 1 — row lookup

  /** Row `tr` located via the per-row toggle `aria-label`, which embeds the location name. */
  @step('Find a row by location name')
  async findRowByLocationName(locationName: string): Promise<import('@playwright/test').Locator> {
    const toggleSelector = btnToggleDiscount(locationName);
    const toggle = this.page.locator(toggleSelector).first();
    const count = await toggle.count();
    if (count === 0) {
      throw new Error(
        `No row found with location name "${locationName}". ` +
        `The row may not be visible — check search state and grid paint.`
      );
    }
    return toggle.locator('xpath=ancestor::tr[1]');
  }

  // ---------------------------------------------------------------- tab 1 — reading row state

  // Untouched rows render as a plain "Yes"/"No" button; once clicked they become a Radix
  // checkbox with aria-checked. Polls because an early read of either returns a false "No".
  @step('Read the Allow Special Rate toggle state for a row')
  async getToggleState(locationName: string): Promise<boolean> {
    const btn = this.page.locator(btnToggleDiscount(locationName)).first();
    const timeout = 10_000;
    const deadline = Date.now() + timeout;
    let lastAriaChecked: string | null = null;
    let lastText = '';
    while (Date.now() < deadline) {
      lastAriaChecked = await btn.getAttribute('aria-checked');
      if (lastAriaChecked !== null) return lastAriaChecked === 'true';
      lastText = (await btn.textContent() || '').trim();
      if (lastText.length > 0) return lastText.toLowerCase() === 'yes';
      await this.page.waitForTimeout(100);
    }
    throw new Error(
      `getToggleState: toggle for "${locationName}" did not render a readable state within ${timeout} ms. ` +
      `aria-checked=${lastAriaChecked}, textContent="${lastText}".`
    );
  }

  // Requires three identical non-empty reads: the input is empty on first render, and after a
  // calendar pick the first non-empty value can still be the stale pre-pick one.
  @step('Read the Special Rate Start Date for a row')
  async getRowDate(locationName: string): Promise<string> {
    const row = await this.findRowByLocationName(locationName);
    const inp = row.locator(INP_DATE).first();
    const STABLE_READS_REQUIRED = 3;
    const POLL_INTERVAL_MS = 100;
    const timeout = 10_000;
    const deadline = Date.now() + timeout;
    let stableCount = 0;
    let lastValue = '';
    while (Date.now() < deadline) {
      const current = await inp.inputValue();
      if (current.length > 0 && current === lastValue) {
        stableCount++;
        if (stableCount >= STABLE_READS_REQUIRED) return current;
      } else {
        stableCount = current.length > 0 ? 1 : 0;
        lastValue = current;
      }
      await this.page.waitForTimeout(POLL_INTERVAL_MS);
    }
    throw new Error(
      `getRowDate: date input for "${locationName}" did not reach a stable value within ${timeout} ms. ` +
      `Last observed value: "${lastValue}". The input may have no date set, or an in-progress ` +
      `calendar update did not propagate within the timeout.`
    );
  }

  // ---------------------------------------------------------------- tab 1 — actions

  // In display mode the first click only activates the cell into checkbox mode, so a second
  // click is needed; a cell already in checkbox mode toggles on one click.
  @step('Toggle Allow Special Rate for a row')
  async toggleDiscount(locationName: string): Promise<void> {
    const btn = this.page.locator(btnToggleDiscount(locationName)).first();
    const initialAriaChecked = await btn.getAttribute('aria-checked');

    if (initialAriaChecked === null) {
      // Display mode: first click activates into checkbox edit mode (value unchanged).
      await btn.click();
      const activateDeadline = Date.now() + 5_000;
      while (Date.now() < activateDeadline) {
        const a = await btn.getAttribute('aria-checked').catch(() => null);
        if (a !== null) break;
        await this.page.waitForTimeout(100);
      }
      const afterActivate = await btn.getAttribute('aria-checked');
      if (afterActivate === null) {
        // Did not enter checkbox mode — single click was the full interaction.
        await this.waitForAngularStable();
        return;
      }
      // Second click: actually toggles the Radix checkbox.
      const prevChecked = afterActivate;
      await btn.click();
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline) {
        const current: string | null = await btn.getAttribute('aria-checked').catch((): string | null => prevChecked);
        if (current !== prevChecked) break;
        await this.page.waitForTimeout(200);
      }
    } else {
      // Already in checkbox edit mode: one click toggles the value directly.
      const prevChecked = initialAriaChecked;
      await btn.click();
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline) {
        const current: string | null = await btn.getAttribute('aria-checked').catch((): string | null => prevChecked);
        if (current !== prevChecked) break;
        await this.page.waitForTimeout(200);
      }
    }
    await this.waitForAngularStable();
  }

  // Types with pressSequentially so Angular's reactive form binding sees the real key events;
  // a leftover Radix alert overlay would otherwise swallow them.
  @step('Set the Special Rate Start Date for a row')
  async setRowDate(locationName: string, dateValue: string): Promise<void> {
    await this._dismissAlertDialogIfPresent();
    const row = await this.findRowByLocationName(locationName);
    const inp = row.locator(INP_DATE).first();
    await inp.click();
    await this.page.keyboard.press('Control+A');
    await this.page.keyboard.press('Delete');
    await inp.pressSequentially(dateValue, { delay: KEYSTROKE_DELAY_MS });
    await this.page.keyboard.press('Tab');
    await this.waitForAngularStable();
  }

  /** Opens the calendar picker on the named row. */
  @step('Open the calendar picker for a row')
  async openCalendar(locationName: string): Promise<void> {
    const row = await this.findRowByLocationName(locationName);
    await row.locator(BTN_CALENDAR).first().click();
    await this.waitForAngularStable();
  }

  /** Clicks the Add button to open the add-location form. */
  @step('Click the Add button to add a location')
  async clickAdd(): Promise<void> {
    await this.page.locator(BTN_ADD).first().click();
    await this.waitForAngularStable();
  }

  /** Clicks the Remove button for the named row. A confirmation dialog will appear. */
  @step('Click Remove for a location row')
  async clickRemove(locationName: string): Promise<void> {
    await this.page.locator(btnRemove(locationName)).first().click();
    await this.waitForAngularStable();
  }

  // ---------------------------------------------------------------- tab 1 — sort

  // The header's `button[aria-haspopup="menu"]` is the only sort affordance here — clicking
  // the `th` itself does not sort.
  @step('Sort the locations grid by a column')
  async sortByColumn(
    column: 'ID' | 'Location Name' | 'Allow Special Rate' | 'Special Rate Start Date',
    direction: 'ascending' | 'descending' = 'ascending',
  ): Promise<void> {
    const selectorMap: Record<string, string> = {
      'ID': TH_SORT_ID,
      'Location Name': TH_SORT_NAME,
      'Allow Special Rate': TH_SORT_DISCOUNT,
      'Special Rate Start Date': TH_SORT_START,
    };
    const th = this.page.locator(selectorMap[column] as string).first();
    const menuBtn = th.locator('button[aria-haspopup="menu"]').first();
    await menuBtn.click();
    // Wait for the Radix menu to open.
    await this.page.locator('[role="menu"]').first().waitFor({ state: 'visible', timeout: 5_000 });
    const label = direction === 'ascending' ? 'Sort ascending' : 'Sort descending';
    const menuItem = this.page.locator(`[role="menu"] [role="menuitem"]:has-text("${label}")`).first();
    const prevValue = await this.getFirstRowCell(2);
    await menuItem.click();
    // 45 s, not 15 s: the grid detaches the first row mid-reorder, and one failed read burns
    // the full 10 s action timeout before the catch below can retry.
    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline) {
      try {
        const current = await this.getFirstRowCell(2);
        if (current !== prevValue) break;
      } catch {
        // Transient miss during the reorder — keep polling.
      }
      await this.page.waitForTimeout(300);
    }
    await this.waitForAngularStable();
  }

  /** Cell text from the first Tab 1 row; `cellIndex` is 1-based (1 = ID, 2 = Location Name). */
  @step('Read a cell value from the first row of the locations grid')
  async getFirstRowCell(cellIndex: number): Promise<string> {
    const cell = this.page.locator(`${ROWS_TAB1}:first-child td:nth-child(${cellIndex})`).first();
    const text = await cell.textContent();
    return (text || '').replace(/\s+/g, ' ').trim();
  }

  // ---------------------------------------------------------------- tab 1 — save state

  /** Whether the Tab 1 Save button is currently disabled. */
  @step('Check whether the Tab 1 Save button is disabled')
  async isSaveDisabled(timeout = 5_000): Promise<boolean> {
    const btn = this.page.locator(BTN_SAVE_TAB1).first();
    await btn.waitFor({ state: 'attached', timeout });
    const disabledAttr = await btn.isDisabled();
    const ariaDisabled = await btn.getAttribute('aria-disabled');
    return disabledAttr || ariaDisabled === 'true';
  }

  /** Whether the Tab 1 Save button is currently enabled. */
  @step('Check whether the Tab 1 Save button is enabled')
  async isSaveEnabled(timeout = 5_000): Promise<boolean> {
    return !(await this.isSaveDisabled(timeout));
  }

  /** Waits until the Tab 1 Save button becomes enabled. Returns `true` if it did. */
  @step('Wait until the Tab 1 Save button becomes enabled')
  async waitUntilSaveEnabled(timeout = 10_000): Promise<boolean> {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      try {
        if (!(await this.isSaveDisabled(Math.min(1_000, Math.max(deadline - Date.now(), 1))))) return true;
      } catch { /* button transiently absent mid-rerender */ }
      await this.page.waitForTimeout(250);
    }
    return false;
  }

  /** Waits until the Tab 1 Save button becomes disabled. Returns `true` if it did. */
  @step('Wait until the Tab 1 Save button becomes disabled')
  async waitUntilSaveDisabled(timeout = 10_000): Promise<boolean> {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      try {
        if (await this.isSaveDisabled(Math.min(1_000, Math.max(deadline - Date.now(), 1)))) return true;
      } catch { /* button transiently absent mid-rerender */ }
      await this.page.waitForTimeout(250);
    }
    return false;
  }

  /** Clicks the Tab 1 Save button. */
  @step('Click Save on the Discount Optimization locations tab')
  async clickSave(): Promise<void> {
    await this.page.locator(BTN_SAVE_TAB1).first().click();
    await this.waitForAngularStable();
  }

  // ---------------------------------------------------------------- tab 2 — row count & headers

  /** Number of rows currently visible in the Tab 2 service-type grid. */
  @step('Get the number of rows in the service type exemptions grid')
  async getTab2RowCount(): Promise<number> {
    return this.page.locator(ROWS_TAB2).count();
  }

  /** Column header text of Tab 2 in display order. */
  @step('Read the column headers of the service type exemptions grid')
  async getTab2ColumnHeaders(): Promise<string[]> {
    const raw = await this.page.locator(COL_HEADERS_TAB2).allTextContents();
    return raw.map((h) => h.replace(/\s+/g, ' ').trim()).filter((h) => h.length > 0);
  }

  // ---------------------------------------------------------------- tab 2 — search

  /** Fills the Tab 2 search box and waits for the grid to filter. */
  @step('Search for a service type by name')
  async searchTab2(term: string): Promise<void> {
    const countBefore = await this.page.locator(ROWS_TAB2).count();
    const inp = this.page.locator(TXT_SEARCH_TAB2).first();
    await inp.click();
    await inp.pressSequentially(term, { delay: KEYSTROKE_DELAY_MS });
    // The stable-count wait alone would return against the unfiltered grid: the full-list
    // count is already "stable" before the debounced filter fires.
    await this._waitForGridCountChangeFrom(ROWS_TAB2, countBefore);
    await this._waitForGridCountStable(ROWS_TAB2);
  }

  /** Clears the Tab 2 search box and waits for the full list to restore. */
  @step('Clear the service type search box')
  async clearSearchTab2(): Promise<void> {
    const countBefore = await this.page.locator(ROWS_TAB2).count();
    const inp = this.page.locator(TXT_SEARCH_TAB2).first();
    await inp.click();
    await this.page.keyboard.press('Control+A');
    await this.page.keyboard.press('Delete');
    await expect(inp).toHaveValue('');
    // The filtered count is already "stable" before the debounced restore fires, and the grid
    // then passes through partial counts before all rows render.
    await this._waitForGridCountChangeFrom(ROWS_TAB2, countBefore);
    await this._waitForGridCountStable(ROWS_TAB2);
  }

  // ---------------------------------------------------------------- tab 2 — Exempt state

  // Polls for aria-checked and throws rather than guessing: checkbox cells render
  // asynchronously, so an early read would fabricate a false "unchecked".
  @step('Read the Exempt state for a service type')
  async getExemptState(serviceTypeName: string): Promise<boolean> {
    const chk = this.page.locator(chkExempt(serviceTypeName)).first();
    const timeout = 10_000;
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const val = await chk.getAttribute('aria-checked').catch((): string | null => null);
      if (val !== null) return val === 'true';
      await this.page.waitForTimeout(100);
    }
    throw new Error(
      `getExemptState: Exempt checkbox for "${serviceTypeName}" did not render a readable ` +
      `aria-checked within ${timeout} ms. The row may not be visible or the grid is still painting.`
    );
  }

  // Waits for aria-checked to actually flip — Radix updates it asynchronously, so a read
  // straight after the click returns the pre-toggle value.
  @step('Toggle the Exempt checkbox for a service type')
  async toggleExempt(serviceTypeName: string): Promise<void> {
    await this._dismissAlertDialogIfPresent();
    const chk = this.page.locator(chkExempt(serviceTypeName)).first();
    const prev = await chk.getAttribute('aria-checked');
    await chk.click();
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const current = await chk.getAttribute('aria-checked').catch((): string | null => prev);
      if (current !== prev) break;
      await this.page.waitForTimeout(100);
    }
    await this.waitForAngularStable();
  }

  // ---------------------------------------------------------------- tab 2 — save & cancel state

  /** Whether the Tab 2 Save button is currently disabled. */
  @step('Check whether the Tab 2 Save button is disabled')
  async isTab2SaveDisabled(timeout = 5_000): Promise<boolean> {
    const btn = this.page.locator(BTN_SAVE_TAB2).first();
    await btn.waitFor({ state: 'attached', timeout });
    const disabledAttr = await btn.isDisabled();
    const ariaDisabled = await btn.getAttribute('aria-disabled');
    return disabledAttr || ariaDisabled === 'true';
  }

  /** Whether the Tab 2 Cancel button is currently disabled. */
  @step('Check whether the Tab 2 Cancel button is disabled')
  async isTab2CancelDisabled(timeout = 5_000): Promise<boolean> {
    const btn = this.page.locator(BTN_CANCEL_TAB2).first();
    await btn.waitFor({ state: 'attached', timeout });
    const disabledAttr = await btn.isDisabled();
    const ariaDisabled = await btn.getAttribute('aria-disabled');
    return disabledAttr || ariaDisabled === 'true';
  }

  /** Waits until the Tab 2 Save button becomes disabled. Returns `true` if it did. */
  @step('Wait until the Tab 2 Save button becomes disabled')
  async waitUntilTab2SaveDisabled(timeout = 10_000): Promise<boolean> {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      try {
        if (await this.isTab2SaveDisabled(Math.min(1_000, Math.max(deadline - Date.now(), 1)))) return true;
      } catch { /* button transiently absent mid-rerender */ }
      await this.page.waitForTimeout(250);
    }
    return false;
  }

  // Must wait on the PUT response: Save disables optimistically before it returns, so a
  // caller that reloads on button-disabled alone aborts the request and loses the save.
  @step('Click Save on the service type exemptions tab')
  async clickTab2Save(): Promise<void> {
    const saveResponse = this.page
      .waitForResponse(
        (r) =>
          r.url().includes('/api/discount/optimization/service-types') &&
          r.request().method() === 'PUT',
        { timeout: 15_000 },
      )
      .catch(() => null); // No matching request (nothing to save) is not an error.
    await this.page.locator(BTN_SAVE_TAB2).first().click();
    const resp = await saveResponse;
    if (resp && !resp.ok()) {
      throw new Error(`Tab 2 Save PUT returned HTTP ${resp.status()}`);
    }
    await this.waitForAngularStable();
  }

  /** Clicks the Tab 2 Cancel button and confirms discarding changes via the confirmation dialog. */
  @step('Click Cancel on the service type exemptions tab')
  async clickTab2Cancel(): Promise<void> {
    await this._dismissAlertDialogIfPresent();
    await this.page.locator(BTN_CANCEL_TAB2).first().click();
    // The app shows "Confirmation Notice — You have unsaved changes. Discard them?" with Yes/No.
    // Click Yes to confirm discarding; if no dialog appears the tab had no unsaved changes.
    const confirmYes = this.page.locator('[role="alertdialog"] button:has-text("Yes")').first();
    const appeared = await confirmYes.waitFor({ state: 'visible', timeout: 5_000 }).then(() => true).catch(() => false);
    if (appeared) {
      await confirmYes.click();
      await this.page.locator('[role="alertdialog"]').waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
    }
    await this.waitForAngularStable();
  }

  // ---------------------------------------------------------------- private helpers

  // Used after clearing a search field: the grid passes through 0 rows while the debounce
  // fires, then repopulates.
  private async _waitForNonZeroGridCount(rowSelector: string, timeout = 15_000): Promise<void> {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const count = await this.page.locator(rowSelector).count();
      if (count > 0) break;
      await this.page.waitForTimeout(100);
    }
    await this.waitForAngularStable();
  }

  // Returns without throwing when the count never moves — a term matching every row, or
  // clearing an empty box, legitimately leaves it unchanged.
  private async _waitForGridCountChangeFrom(rowSelector: string, before: number, timeout = 10_000): Promise<void> {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const now = await this.page.locator(rowSelector).count();
      if (now !== before) return;
      await this.page.waitForTimeout(100);
    }
  }

  // Two unchanged consecutive polls mean the debounced filter has settled; the grid passes
  // through partial counts on the way there.
  private async _waitForGridCountStable(rowSelector: string, timeout = 15_000): Promise<void> {
    const deadline = Date.now() + timeout;
    let prev = -1;
    let stable = 0;
    while (Date.now() < deadline) {
      const count = await this.page.locator(rowSelector).count();
      if (count === prev) {
        stable++;
        if (stable >= 2) break;
      } else {
        stable = 0;
      }
      prev = count;
      await this.page.waitForTimeout(300);
    }
    await this.waitForAngularStable();
  }

  // A Radix alert overlay can linger after a row interaction and swallow pointer events and
  // keystrokes aimed at the next row. No-op when absent.
  private async _dismissAlertDialogIfPresent(): Promise<void> {
    const overlay = this.page.locator('[data-radix-alert-dialog-overlay], [role="alertdialog"]').first();
    const visible = await overlay.isVisible().catch(() => false);
    if (!visible) return;
    const cancelBtn = this.page.locator('[role="alertdialog"] button:has-text("Cancel")').first();
    const cancelVisible = await cancelBtn.isVisible().catch(() => false);
    if (cancelVisible) {
      await cancelBtn.click();
      await overlay.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
    }
  }
}
