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

/**
 * The grid takes roughly 22 seconds to complete its first paint. The API returns HTTP 200
 * immediately, but the UI shows "0 locations found" behind skeleton loaders until rendering
 * completes. Three prior investigations produced false findings because they waited only on
 * the container element, which exists before data arrives. This timeout is set well above
 * the measured 22 s to give the render headroom without being unlimited.
 */
const GRID_READY_TIMEOUT_MS = 45_000;

/**
 * Keystroke cadence for `pressSequentially` calls throughout this page object.
 * 80 ms is the delay proven to trigger Angular's reactive form binding on this surface —
 * lower values caused the component to miss keydown/input/keyup events and never update.
 */
const KEYSTROKE_DELAY_MS = 80;

/**
 * Discount Optimization setup page.
 *
 * Route: `/navigator/locations/{office}/settings/discount-optimization-settings`
 *
 * The page has two tabs:
 *   - Tab 1 ("Discount Optimization"): editable locations grid with toggle and date per row.
 *   - Tab 2 ("Special Rate Exemptions by Service Type"): editable service-type grid with
 *     Exempt checkboxes, search, Cancel, and Save.
 *
 * Critical behaviours encoded here:
 * - The grid container exists BEFORE data arrives. The ready-gate waits on a non-zero row
 *   count, not on the container's presence. This is the single most important fact about
 *   this surface — waiting on the container alone produced three false "empty grid" readings.
 * - Tab DOM ids are auto-generated Radix values that change between renders. Tabs are always
 *   selected by visible text and accessible role, never by a radix-* id.
 * - Row lookup is content-anchored (by location name or service type name). Index-based
 *   lookup is never used because rows re-order when sortable headers are clicked.
 * - No `networkidle` is used anywhere — banned in this repo.
 * - No fixed `waitForTimeout` substitutes for a real condition.
 */
export class DiscountOptimizationPage extends BasePage {
  readonly changeLocalOffice = new ChangeLocalOfficeComponent(this.page);

  constructor(page: Page, config?: IConfig) {
    super(page, config);
    Log.info('DiscountOptimizationPage initialized');
  }

  // ---------------------------------------------------------------- navigation & ready

  /**
   * Opens the Discount Optimization page for an office and waits for the locations grid
   * to paint its first rows. Never resolves against the empty skeleton state.
   */
  @step('Open the Discount Optimization page for an office')
  async open(officeNo: string = '1604'): Promise<void> {
    const baseUrl = this.config?.base_url || '';
    await this.safeNavigateTo('about:blank');
    await this.navigateTo(
      `${baseUrl}locations/${officeNo}/settings/discount-optimization-settings`
    );
    await this.waitForGrid();
  }

  /**
   * Waits for the Tab 1 locations grid to paint real data.
   *
   * The grid container (`TBL_CONTAINER`) is mounted before data arrives — visibility alone
   * returns immediately against an empty skeleton. This method polls until the row count
   * becomes non-zero, which is the first moment real data is in the DOM.
   *
   * Timeout is set to {@link GRID_READY_TIMEOUT_MS} (45 s) — well above the measured ~22 s
   * first-paint latency — to avoid a false-empty reading without blocking indefinitely.
   */
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

  /**
   * Switches to the named tab and waits for its panel to become visible.
   * Selects tabs by visible text and `[role="tab"]` — never by radix-generated id.
   */
  @step('Switch to a tab by name')
  async switchTab(tabName: 'Discount Optimization' | 'Special Rate Exemptions by Service Type'): Promise<void> {
    const trigger = tabName === 'Discount Optimization' ? TAB_LOCATIONS : TAB_EXEMPTIONS;
    await this.page.locator(trigger).first().click();
    if (tabName === 'Special Rate Exemptions by Service Type') {
      // Wait for Tab 2's panel to be in the DOM and visible (PANEL_EXEMPTIONS is anchored to
      // the "Search by service type" input, so this can only match Tab 2 — never Tab 1).
      // Without this wait the row-count poll below would immediately see Tab 1's rows through
      // the old [role="tabpanel"]:visible selector before Tab 2 had loaded.
      await this.page.locator(PANEL_EXEMPTIONS).waitFor({ state: 'visible', timeout: GRID_READY_TIMEOUT_MS });
      // Now poll until Tab 2's own rows arrive (the panel is in the DOM but data may still be loading).
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

  /** Fills the Tab 1 search box and waits for the grid to filter. */
  @step('Search for a location by name or number')
  async search(term: string): Promise<void> {
    const inp = this.page.locator(TXT_SEARCH_TAB1).first();
    await inp.click();
    await inp.pressSequentially(term, { delay: KEYSTROKE_DELAY_MS });
    await this._waitForGridCountChange(ROWS_TAB1);
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

  /**
   * Returns the `tr` locator for the first row whose Location Name matches the given string.
   * Content-anchored — uses the per-row toggle `aria-label` which embeds the location name.
   * Throws if no such row is found.
   */
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

  /**
   * Reads the Allow Special Rate toggle state for a named row.
   *
   * The control has two render modes:
   * - Display mode (not yet interacted with): a plain `<button>` showing "Yes" or "No" text,
   *   with no ARIA state attributes.
   * - Edit mode (after first click activates the field): a Radix checkbox with
   *   `role="checkbox"` and `aria-checked="true"|"false"`.
   *
   * "Yes" / `aria-checked="true"` both mean the Allow Special Rate setting is enabled.
   *
   * The virtualised grid populates text nodes asynchronously — reading before the text node
   * has rendered would return an empty string and produce a false "No". This method polls
   * until a readable state is available before deciding.
   */
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

  /**
   * Reads the Special Rate Start Date value for a named row.
   *
   * Two failure modes are guarded against:
   *
   * 1. **Race on first render** — the virtualised grid populates date inputs asynchronously.
   *    A single-shot `inputValue()` returns `''` until the first render cycle completes.
   *
   * 2. **Post-calendar propagation delay** — after a calendar picker selection, Angular's
   *    reactive form may take one or more change-detection cycles to update the input value.
   *    Returning on the first non-empty read risks returning a stale pre-calendar value.
   *
   * This method polls until the value has been the same non-empty string across three
   * consecutive reads (100 ms apart), which proves the value has settled. On timeout it
   * throws with the row name and last observed value — never returns a fabricated default.
   */
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

  /**
   * Clicks the Allow Special Rate toggle for the named row and waits for the value to change.
   *
   * The control has two render modes:
   * - Display mode (plain button "Yes"/"No", no `aria-checked`): first click activates the
   *   cell into Radix-checkbox edit mode (same logical value), second click actually toggles.
   * - Checkbox mode (already interacted; has `aria-checked`): one click toggles directly.
   */
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

  /**
   * Sets the Special Rate Start Date on the named row using real keystrokes.
   *
   * Before typing, checks for a Radix alert-dialog overlay (`[data-radix-alert-dialog-overlay]`
   * / `[role="alertdialog"]`) that can appear after row interaction and intercept pointer events.
   * If present, it is dismissed via its Cancel button before proceeding.
   *
   * Clears the existing value with Ctrl+A → Delete before typing, to avoid appending to a
   * populated field. Uses `pressSequentially` so Angular's reactive form binding receives the
   * full keydown/input/keyup event chain.
   */
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

  /**
   * Sorts the locations grid by the named column using the column-options dropdown menu.
   *
   * Each column header contains a Radix `button[aria-haspopup="menu"]` that opens a
   * two-item menu: "Sort ascending" and "Sort descending". This is the only sort affordance
   * on this surface — clicking the `th` itself or the resize handle does NOT sort.
   *
   * Live DOM confirmed 2026-08-11: menu opens on button click with `aria-expanded`
   * flipping to `"true"`, and menu items have role="menuitem".
   */
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
    // Poll until the first row value changes — sort reorder settles after Angular stability.
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const current = await this.getFirstRowCell(2);
      if (current !== prevValue) break;
      await this.page.waitForTimeout(300);
    }
    await this.waitForAngularStable();
  }

  /**
   * Reads the text content of a cell in the first visible row of Tab 1.
   * `cellIndex` is 1-based: 1 = ID, 2 = Location Name.
   */
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
    const inp = this.page.locator(TXT_SEARCH_TAB2).first();
    await inp.click();
    await inp.pressSequentially(term, { delay: KEYSTROKE_DELAY_MS });
    // Use stable-count helper: the debounced client-side filter passes through intermediate
    // counts, so stopping on the first change races the filter mid-settle.
    await this._waitForGridCountStable(ROWS_TAB2);
  }

  /** Clears the Tab 2 search box and waits for the full list to restore. */
  @step('Clear the service type search box')
  async clearSearchTab2(): Promise<void> {
    const inp = this.page.locator(TXT_SEARCH_TAB2).first();
    await inp.click();
    await this.page.keyboard.press('Control+A');
    await this.page.keyboard.press('Delete');
    await expect(inp).toHaveValue('');
    // Wait for the count to stabilise — the debounced filter passes through partial states
    // (e.g. 4 rows) before all rows render. Poll until the count stops changing.
    await this._waitForGridCountStable(ROWS_TAB2);
  }

  // ---------------------------------------------------------------- tab 2 — Exempt state

  /**
   * Reads the Exempt checkbox state for the named service type.
   * Returns `true` when `aria-checked="true"`, `false` when `"false"` or `"mixed"`.
   */
  @step('Read the Exempt state for a service type')
  async getExemptState(serviceTypeName: string): Promise<boolean> {
    const chk = this.page.locator(chkExempt(serviceTypeName)).first();
    const val = await chk.getAttribute('aria-checked');
    return val === 'true';
  }

  /** Clicks the Exempt checkbox for the named service type and waits for Angular. */
  @step('Toggle the Exempt checkbox for a service type')
  async toggleExempt(serviceTypeName: string): Promise<void> {
    await this._dismissAlertDialogIfPresent();
    await this.page.locator(chkExempt(serviceTypeName)).first().click();
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

  /** Clicks the Tab 2 Save button. */
  @step('Click Save on the service type exemptions tab')
  async clickTab2Save(): Promise<void> {
    await this.page.locator(BTN_SAVE_TAB2).first().click();
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

  /**
   * Polls until at least one row matching `rowSelector` is present in the DOM, then waits
   * for Angular to stabilise. Used after clearing a search field — the grid passes through
   * 0 rows while the debounce fires, then repopulates.
   */
  private async _waitForNonZeroGridCount(rowSelector: string, timeout = 15_000): Promise<void> {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const count = await this.page.locator(rowSelector).count();
      if (count > 0) break;
      await this.page.waitForTimeout(100);
    }
    await this.waitForAngularStable();
  }

  /**
   * Waits until the row count for `rowSelector` differs from its value at call time,
   * then waits for Angular to stabilise. Used after search input to confirm the client-side
   * filter has actually run — Angular's zone may report stable before a debounce timer fires.
   */
  private async _waitForGridCountChange(rowSelector: string, timeout = 10_000): Promise<void> {
    const before = await this.page.locator(rowSelector).count();
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const now = await this.page.locator(rowSelector).count();
      if (now !== before) break;
      await this.page.waitForTimeout(100);
    }
    await this.waitForAngularStable();
  }

  /**
   * Polls until the row count for `rowSelector` stops changing for two consecutive polls
   * (500 ms apart), indicating the debounced filter has fully settled. Used after clearing
   * a search field where the grid passes through partial counts before reaching stable state.
   */
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

  /**
   *
   * An `[data-radix-alert-dialog-overlay]` was observed appearing after row interaction
   * (e.g., clicking a toggle or row control). When visible it intercepts pointer events
   * and swallows keystrokes aimed at other inputs. This guard checks for its presence
   * before any row-level interaction that follows a prior row interaction, and dismisses
   * it via its Cancel button so the next action lands on the intended target.
   *
   * If no overlay is present, this is a no-op.
   */
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
