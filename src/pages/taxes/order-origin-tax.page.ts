import { Locator, Page, Response, expect } from '@playwright/test';
import { step } from '../../fixtures/step-decorator';
import { BasePage } from '../base.page';
import { Log } from '../../utils/logger';
import { IConfig } from '../../types';
import {
  LOCATION_DIALOG,
  HEADER_TITLE,
  BTN_INFO,
  TOOLTIP,
  BTN_LOCATION,
  DRP_TAX_TYPE,
  TXT_EFFECTIVE_DATE,
  BTN_DATE_RANGE,
  CHK_NOT_EQUAL_ZERO,
  BTN_SEARCH,
  BTN_RESET,
  BTN_COLLAPSE_FILTERS,
  BTN_EXPAND_FILTERS,
  RECORD_COUNT,
  BTN_SAVE,
  BTN_GRID_OPTIONS,
  HEADERS,
  HEADER_MENU_TRIGGER,
  ROWS,
  SKELETON,
  ROW_ALERT,
  BTN_OPEN_CALENDAR,
  POPOVER,
  calendarDay,
  BTN_PREVIOUS_MONTH,
  BTN_NEXT_MONTH,
  CALENDAR_MONTH,
  TXT_PAGE_NUMBER,
  BTN_NEXT_PAGE,
  MENU,
  MENU_ITEM,
  MENU_CHECKBOX,
  DLG_UNSAVED,
  BTN_DLG_STAY,
  BTN_DLG_DISCARD,
  TOAST,
  SIDEBAR_MENU_BUTTON,
  SIDEBAR_TAX_LABEL,
  sidebarOrderOriginTaxFor,
  SIDEBAR_HOME,
} from '../../selectors/taxes/order-origin-tax';
import { Column, TEXT } from '../../data/taxes/order-origin-tax';

export type Tab = 'basic' | 'history';

export interface Criteria {
  location: string;
  taxType: string;
  /** Basic Information: the Effective Date; History: the Date Range text. */
  date: string;
  notEqualZero: boolean;
}

/** One grid row, keyed by column header. */
export type GridRow = Partial<Record<Column, string>>;

// The full company list (about 5,000 rows) can take a while to arrive on a cold server.
const SEARCH_TIMEOUT_MS = 90_000;

/** Parses "5,074 records found" → 5074. */
export const parseCount = (text: string): number => {
  const m = text.match(/([\d,]+)\s+records?\s+found/i);
  if (!m) throw new Error(`No "records found" count in: ${text.slice(0, 120)}`);
  return Number(m[1]!.replace(/,/g, ''));
};

/** MM/DD/YYYY plus n days → MM/DD/YYYY (calendar arithmetic, no time zone involved). */
export const addDays = (mmddyyyy: string, n: number): string => {
  const [m, d, y] = mmddyyyy.split('/').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d + n));
  const pad = (v: number) => String(v).padStart(2, '0');
  return `${pad(date.getUTCMonth() + 1)}/${pad(date.getUTCDate())}/${date.getUTCFullYear()}`;
};

/** MM/DD/YYYY → M/D/YYYY, the form the validation messages and calendar days use. */
export const shortDate = (mmddyyyy: string): string => {
  const [m, d, y] = mmddyyyy.split('/');
  return `${Number(m)}/${Number(d)}/${y}`;
};

// The page's server actions all post to the page URL; their ids change per build, so requests are
// told apart by their payload. A search carries "notEqualZero"; on Basic Information it is followed
// by a lookup of each row's latest effective date, which the date validation needs.
const postBody = (r: Response): string => (r.request().method() === 'POST' ? r.request().postData() ?? '' : '');
const isSearch = (r: Response): boolean => postBody(r).includes('"notEqualZero"');
const isLatestDates = (r: Response): boolean => /^\[\{"locationNo":[^{}]*"taxTypeId":[^{}]*\}\]$/.test(postBody(r));
const isSave = (r: Response): boolean => postBody(r).includes('"updates"');


// Tax → Order Origin Tax. Basic Information lists the tax rows in effect on a date and lets the
// user edit Additional Tax, Effective Date and Notes; a new effective date adds a record rather
// than overwriting one. Order Origin Tax History lists records by effective date range, read-only.
export class OrderOriginTaxPage extends BasePage {
  constructor(page: Page, config?: IConfig) {
    super(page, config);
    Log.info('OrderOriginTaxPage initialized');
  }

  private url(officeNo: string): string {
    return `${(this.config?.base_url ?? '').replace(/\/+$/, '')}/locations/${officeNo}/taxes/order-origin-tax`;
  }

  // ---------------------------------------------------------------- navigation

  /**
   * Opens the page for an office with default criteria and the default grid layout. Both are kept
   * in browser storage between visits, so they are cleared first and every test starts the same.
   */
  @step('Open the Order Origin Tax page for an office')
  async open(officeNo: string): Promise<void> {
    await this.clearKeptState();
    await this.safeNavigateTo(this.url(officeNo));
    await this.waitForReady();
  }

  /** Reloads the page without clearing anything the browser kept. */
  @step('Reload the Order Origin Tax page')
  async reload(): Promise<void> {
    await this.page.reload();
    await this.waitForReady();
  }

  @step('Open Order Origin Tax from the Tax menu')
  async openFromTaxMenu(officeNo: string): Promise<void> {
    await this.clearKeptState();
    await this.safeNavigateTo(this.url(officeNo).replace(/taxes\/order-origin-tax$/, 'home'));
    // The sidebar menus appear only once the user's permissions have loaded.
    const tax = this.page.locator(SIDEBAR_MENU_BUTTON).filter({ hasText: SIDEBAR_TAX_LABEL });
    await tax.waitFor({ state: 'visible', timeout: 60_000 });
    await tax.click();
    await this.page.locator(sidebarOrderOriginTaxFor(officeNo)).click();
    await this.waitForReady();
  }

  private async clearKeptState(): Promise<void> {
    if (!this.page.url().startsWith('http')) return;
    await this.page.evaluate(() => {
      for (const store of [localStorage, sessionStorage]) {
        for (const key of Object.keys(store)) if (/order-?origin-?tax/i.test(key)) store.removeItem(key);
      }
    });
  }

  // The criteria panel shows loading placeholders until the tax types have arrived; controls clicked
  // before that do not respond.
  @step('Wait for the Order Origin Tax page to load')
  async waitForReady(): Promise<void> {
    await this.page.locator(HEADER_TITLE).waitFor({ state: 'visible', timeout: 60_000 });
    await this.page.locator(DRP_TAX_TYPE).waitFor({ state: 'visible', timeout: 60_000 });
    await expect(this.page.locator(BTN_SEARCH)).toBeEnabled({ timeout: 60_000 });
  }

  @step('Switch tab')
  async switchTab(tab: Tab): Promise<void> {
    await this.tab(tab).click();
  }

  tab(tab: Tab): Locator {
    return this.page.getByRole('tab', { name: tab === 'basic' ? TEXT.tabBasic : TEXT.tabHistory, exact: true });
  }

  @step('Go to Home from the sidebar')
  async clickSidebarHome(): Promise<void> {
    await this.page.locator(SIDEBAR_HOME).first().click();
  }

  // ---------------------------------------------------------------- header

  @step('Read the page heading and title')
  async getHeading(): Promise<{ heading: string; title: string }> {
    return { heading: (await this.page.locator(HEADER_TITLE).innerText()).trim(), title: await this.page.title() };
  }

  @step('Read the information tooltip')
  async getInfoTooltip(): Promise<string> {
    await this.page.locator(BTN_INFO).hover();
    const tip = this.page.locator(TOOLTIP).first();
    await tip.waitFor({ state: 'visible' });
    return (await tip.innerText()).trim();
  }

  // ---------------------------------------------------------------- search criteria

  @step('Read the search criteria')
  async getCriteria(): Promise<Criteria> {
    const range = this.page.locator(BTN_DATE_RANGE);
    return {
      location: (await this.page.locator(BTN_LOCATION).innerText()).trim(),
      taxType: (await this.page.locator(DRP_TAX_TYPE).innerText()).trim(),
      date: (await range.count()) ? (await range.innerText()).trim() : await this.page.locator(TXT_EFFECTIVE_DATE).inputValue(),
      notEqualZero: (await this.page.locator(CHK_NOT_EQUAL_ZERO).getAttribute('data-state')) === 'checked',
    };
  }

  dialog(): Locator {
    return this.page.locator(LOCATION_DIALOG.dlgChangeLocalOffice);
  }

  @step('Open the Change Local Office dialog')
  async openLocationDialog(): Promise<void> {
    await this.page.locator(BTN_LOCATION).click();
    await this.dialog().waitFor({ state: 'visible' });
  }

  /**
   * Types into the dialog's search box and waits until every listed office matches the term. On E2E
   * the full list sometimes arrives after the term was typed and stays unfiltered, so if the list has
   * not narrowed the term is typed again.
   */
  @step('Search the Change Local Office dialog')
  async searchLocationDialog(term: string): Promise<string[]> {
    const box = this.page.locator(LOCATION_DIALOG.txtDlgSearch);
    const rows = this.dialog().locator('tbody tr');
    // At least one row: an empty list (still loading) must not count as narrowed.
    const narrowed = async () => {
      const texts = await rows.allInnerTexts();
      return texts.length > 0 && texts.every((t) => t.toLowerCase().includes(term.toLowerCase()));
    };
    await expect(async () => {
      if (!(await narrowed())) {
        await box.fill('');
        await box.fill(term);
      }
      await expect.poll(narrowed, { timeout: 5_000 }).toBe(true);
    }).toPass({ timeout: 20_000 });
    return (await rows.allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
  }

  @step('Tick an office in the Change Local Office dialog')
  async tickDialogOffice(officeNo: string): Promise<void> {
    const box = this.dialog().locator('tbody tr').filter({ hasText: officeNo }).first().getByRole('checkbox');
    if ((await box.getAttribute('data-state')) !== 'checked') await box.click();
    await expect(box).toHaveAttribute('data-state', 'checked');
  }

  @step('Check whether the dialog Select button is enabled')
  async isDialogSelectEnabled(): Promise<boolean> {
    return this.page.locator(LOCATION_DIALOG.btnDlgSelect).isEnabled();
  }

  @step('Confirm the Change Local Office dialog')
  async confirmLocationDialog(): Promise<void> {
    await this.page.locator(LOCATION_DIALOG.btnDlgSelect).click();
    await this.dialog().waitFor({ state: 'hidden' });
  }

  @step('Cancel the Change Local Office dialog')
  async cancelLocationDialog(): Promise<void> {
    await this.page.locator(LOCATION_DIALOG.btnDlgCancel).click();
    await this.dialog().waitFor({ state: 'hidden' });
  }

  @step('Choose a location')
  async selectLocation(officeNo: string): Promise<void> {
    await this.openLocationDialog();
    await this.searchLocationDialog(officeNo);
    await this.tickDialogOffice(officeNo);
    await this.confirmLocationDialog();
    await expect(this.page.locator(BTN_LOCATION)).toContainText(officeNo);
  }

  @step('Read the Tax Type options')
  async getTaxTypeOptions(): Promise<string[]> {
    await this.page.locator(DRP_TAX_TYPE).click();
    const options = this.page.getByRole('option');
    await options.nth(1).waitFor({ state: 'visible' });
    const texts = (await options.allInnerTexts()).map((t) => t.trim());
    await this.page.keyboard.press('Escape');
    await options.first().waitFor({ state: 'hidden' });
    return texts;
  }

  @step('Choose a tax type')
  async selectTaxType(name: string): Promise<void> {
    await this.page.locator(DRP_TAX_TYPE).click();
    await this.page.getByRole('option', { name, exact: true }).click();
    await expect(this.page.locator(DRP_TAX_TYPE)).toHaveText(name);
  }

  /** Types into the Basic Information Effective Date filter and leaves the field. */
  @step('Set the Effective Date filter')
  async setEffectiveDateFilter(mmddyyyy: string): Promise<void> {
    await this.page.locator(TXT_EFFECTIVE_DATE).fill(mmddyyyy);
    await this.page.locator(HEADER_TITLE).click();
  }

  @step('Set "Percentage not equal to 0"')
  async setNotEqualZero(checked: boolean): Promise<void> {
    const box = this.page.locator(CHK_NOT_EQUAL_ZERO);
    if (((await box.getAttribute('data-state')) === 'checked') !== checked) await box.click();
    await expect(box).toHaveAttribute('data-state', checked ? 'checked' : 'unchecked');
  }

  /**
   * Picks one day in the History Date Range calendar. A day before the range moves its start, a day
   * after it moves its end; picking closes the calendar.
   */
  @step('Pick a day in the History Date Range')
  async pickHistoryRangeDay(mdyyyy: string): Promise<void> {
    await this.page.locator(BTN_DATE_RANGE).click();
    await this.clickCalendarDay(mdyyyy);
    await this.page.locator(POPOVER).waitFor({ state: 'hidden' });
  }

  /**
   * In an open calendar, pages to the month holding the day and clicks it. The calendar only has
   * Previous/Next month buttons, so a far date (e.g. 2000 seen from 2026) takes hundreds of clicks;
   * the loop is bounded by the real distance in months, not a fixed number.
   */
  private async clickCalendarDay(mdyyyy: string): Promise<void> {
    const [m, , y] = mdyyyy.split('/').map(Number) as [number, number, number];
    const target = y * 12 + m - 1;
    const day = this.page.locator(calendarDay(mdyyyy));
    const month = this.page.locator(CALENDAR_MONTH).first();
    await month.waitFor({ state: 'visible' });
    const shownMonth = async (): Promise<number> => {
      const shown = new Date(`1 ${await month.getAttribute('aria-label')}`);
      return shown.getFullYear() * 12 + shown.getMonth();
    };
    const limit = Math.abs(target - (await shownMonth())) + 2;
    for (let i = 0; i < limit && !(await day.isVisible()); i++) {
      await this.page.locator(target < (await shownMonth()) ? BTN_PREVIOUS_MONTH : BTN_NEXT_MONTH).click();
    }
    await day.click();
  }

  @step('Check whether Search is enabled')
  async isSearchEnabled(): Promise<boolean> {
    return this.page.locator(BTN_SEARCH).isEnabled();
  }

  /** Clicks Search without waiting for results, for when a dialog is expected to step in. */
  @step('Click Search')
  async clickSearch(): Promise<void> {
    await this.page.locator(BTN_SEARCH).click();
  }

  /** Clicks Search and waits for the results (and, on Basic Information, the latest-date lookup). */
  // The E2E server now and then answers a search with its "Unable to load" error under load; one
  // more search rides that out, and a second failure is reported with the server's message.
  @step('Search')
  async search(): Promise<number> {
    for (let attempt = 1; ; attempt++) {
      const onBasic = (await this.tab('basic').getAttribute('aria-selected')) === 'true';
      const latestDates = onBasic ? this.page.waitForResponse(isLatestDates, { timeout: SEARCH_TIMEOUT_MS }) : undefined;
      await this.page.locator(BTN_SEARCH).click();
      const count = await this.waitForResults();
      await latestDates;
      const failure = this.page.locator(TOAST).filter({ hasText: TEXT.loadFailed });
      if (!(await failure.isVisible())) return count;
      const message = (await failure.innerText()).replace(/\s+/g, ' ').trim();
      if (attempt === 2) throw new Error(`Order Origin Tax search failed twice on the server: "${message}"`);
      Log.warn(`Order Origin Tax search failed on the server ("${message}") — searching again`);
      await failure.getByRole('button').click().catch(() => {});
      await failure.waitFor({ state: 'hidden' });
    }
  }

  // Loading placeholders replace the grid from the moment a search starts, and the new rows and
  // count replace them in one go; so once the placeholders are gone the count is the new one.
  private async waitForResults(): Promise<number> {
    await this.page.locator(SKELETON).first().waitFor({ state: 'attached', timeout: 5_000 }).catch(() => {});
    await expect(this.page.locator(SKELETON)).toHaveCount(0, { timeout: SEARCH_TIMEOUT_MS });
    const count = await this.getCount();
    if (count > 0) await this.page.locator(ROWS).first().waitFor({ state: 'visible' });
    return count;
  }

  /** Narrows the grid to one office's row of one tax type (zero rates included) and returns it. */
  @step('Find the row of an office and tax type')
  async findRow(officeNo: string, taxType: string, asOf?: string): Promise<Locator> {
    await this.selectLocation(officeNo);
    await this.selectTaxType(taxType);
    await this.setNotEqualZero(false);
    if (asOf) await this.setEffectiveDateFilter(asOf);
    expect(await this.search(), `${officeNo} ${taxType} rows`).toBe(1);
    return this.page.locator(ROWS).first();
  }

  firstRow(): Locator {
    return this.page.locator(ROWS).first();
  }

  /** The listed row of a tax type, matched exactly ("App Quality Assurance" is not "… – M"). */
  rowOf(taxType: string): Locator {
    return this.page.locator(ROWS).filter({ has: this.page.getByRole('cell', { name: taxType, exact: true }) });
  }

  @step('Reset the search criteria')
  async reset(): Promise<void> {
    await this.page.locator(BTN_RESET).click();
    await expect(this.page.locator(BTN_LOCATION)).toHaveText(TEXT.allLocations);
  }

  @step('Collapse the search criteria panel')
  async collapseFilters(): Promise<void> {
    await this.page.locator(BTN_COLLAPSE_FILTERS).click();
  }

  @step('Expand the search criteria panel')
  async expandFilters(): Promise<void> {
    await this.page.locator(BTN_EXPAND_FILTERS).click();
  }

  /** The Search button; collapsing clips the panel to zero width, so check it with toBeInViewport. */
  searchButton(): Locator {
    return this.page.locator(BTN_SEARCH);
  }

  // ---------------------------------------------------------------- results grid

  @step('Read the record count')
  async getCount(): Promise<number> {
    return parseCount(await this.page.locator(RECORD_COUNT).first().innerText());
  }

  @step('Check whether the empty-grid message is shown')
  async isEmptyMessageVisible(tab: Tab): Promise<boolean> {
    return this.page.getByText(tab === 'basic' ? TEXT.emptyBasic : TEXT.emptyHistory, { exact: true }).isVisible();
  }

  @step('Read the column headers')
  async getHeaders(): Promise<string[]> {
    return (await this.page.locator(HEADERS).allInnerTexts()).map((t) => t.trim()).filter(Boolean);
  }

  // Columns can be hidden or moved, so a cell is found by its header rather than a fixed position.
  private async columnIndex(column: Column): Promise<number> {
    const i = (await this.getHeaders()).indexOf(column);
    if (i < 0) throw new Error(`Column "${column}" is not shown`);
    return i;
  }

  private async cell(row: Locator, column: Column): Promise<Locator> {
    return row.locator('td').nth(await this.columnIndex(column));
  }

  /** Reads a row; editable cells (Basic Information) are read from their inputs. */
  @step('Read a grid row')
  async readRow(row: Locator): Promise<GridRow> {
    const headers = (await this.getHeaders()) as Column[];
    const values = await row.locator('td').evaluateAll((tds) =>
      tds.map((td) => {
        const input = td.querySelector('input');
        return (input ? input.value : (td as HTMLElement).innerText).replace(/\s+/g, ' ').trim();
      }),
    );
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ''])) as GridRow;
  }

  /** Values of one column across the rendered rows (the grid renders about 40 rows at a time). */
  @step('Read a column of the grid')
  async readColumn(column: Column): Promise<string[]> {
    const i = await this.columnIndex(column);
    return this.page.locator(ROWS).evaluateAll(
      (rows, idx) =>
        rows.map((r) => {
          const td = r.querySelectorAll('td')[idx] as HTMLElement | undefined;
          const input = td?.querySelector('input');
          return (input ? input.value : td?.innerText ?? '').replace(/\s+/g, ' ').trim();
        }),
      i,
    );
  }

  @step('Sort a column')
  async sortBy(column: Column, direction: 'ascending' | 'descending'): Promise<void> {
    await this.page.locator(HEADERS).filter({ hasText: column }).locator(HEADER_MENU_TRIGGER).click();
    const searched = this.page.waitForResponse(isSearch, { timeout: SEARCH_TIMEOUT_MS });
    await this.page.locator(MENU_ITEM).filter({ hasText: `Sort ${direction}` }).click();
    await searched;
    await this.waitForResults();
  }

  @step('Hide a column from its header menu')
  async hideColumn(column: Column): Promise<void> {
    await this.page.locator(HEADERS).filter({ hasText: column }).locator(HEADER_MENU_TRIGGER).click();
    await this.page.locator(MENU_ITEM).filter({ hasText: 'Hide column' }).click();
    await expect(this.page.locator(HEADERS).filter({ hasText: column })).toHaveCount(0);
  }

  @step('Read the Grid Options column list')
  async getGridOptionColumns(): Promise<{ label: string; checked: boolean }[]> {
    await this.page.locator(BTN_GRID_OPTIONS).click();
    await this.page.locator(MENU).waitFor({ state: 'visible' });
    const items = await this.page.locator(MENU_CHECKBOX).evaluateAll((els) =>
      els.map((e) => ({ label: (e as HTMLElement).innerText.trim(), checked: e.getAttribute('aria-checked') === 'true' })),
    );
    await this.closeMenu();
    return items;
  }

  @step('Reset the grid to its default view')
  async resetGridView(): Promise<void> {
    await this.page.locator(BTN_GRID_OPTIONS).click();
    await this.page.locator(MENU_ITEM).filter({ hasText: 'Reset to Default View' }).click();
    await this.closeMenu();
  }

  private async closeMenu(): Promise<void> {
    if (await this.page.locator(MENU).isVisible()) await this.page.keyboard.press('Escape');
    await this.page.locator(MENU).waitFor({ state: 'hidden' });
  }

  // ---------------------------------------------------------------- editing

  // Leaving a cell is what commits it, so every edit ends by clicking a neutral spot.
  private async leaveCell(): Promise<void> {
    await this.page.locator(RECORD_COUNT).first().click();
  }

  @step('Type an Additional Tax value')
  async editTax(row: Locator, value: string): Promise<string> {
    const input = (await this.cell(row, 'Additional Tax')).locator('input');
    await input.fill(value);
    await this.leaveCell();
    return input.inputValue();
  }

  /** Clicks into Additional Tax after the current value and presses keys, e.g. letters. */
  @step('Press keys in the Additional Tax field')
  async typeIntoTax(row: Locator, keys: string): Promise<string> {
    const input = (await this.cell(row, 'Additional Tax')).locator('input');
    await input.click();
    await this.page.keyboard.press('End');
    await this.page.keyboard.type(keys);
    await this.leaveCell();
    return input.inputValue();
  }

  @step('Type an Effective Date')
  async editDate(row: Locator, mmddyyyy: string): Promise<string> {
    const input = (await this.cell(row, 'Effective Date')).locator('input');
    await input.fill(mmddyyyy);
    await this.leaveCell();
    return input.inputValue();
  }

  /** Clicks into the Effective Date cell and leaves it without typing. */
  @step('Click into the Effective Date and leave it')
  async touchDate(row: Locator): Promise<string> {
    const input = (await this.cell(row, 'Effective Date')).locator('input');
    await input.click();
    await this.leaveCell();
    return input.inputValue();
  }

  @step('Pick an Effective Date from the calendar')
  async pickDate(row: Locator, mdyyyy: string): Promise<string> {
    const cell = await this.cell(row, 'Effective Date');
    await cell.locator(BTN_OPEN_CALENDAR).click();
    await this.clickCalendarDay(mdyyyy);
    await this.leaveCell();
    return cell.locator('input').inputValue();
  }

  @step('Type Notes')
  async editNotes(row: Locator, text: string): Promise<string> {
    const input = (await this.cell(row, 'Notes')).locator('input');
    await input.fill(text);
    await this.leaveCell();
    return input.inputValue();
  }

  /** The row's validation message, or null when the row is valid. */
  @step('Read the row validation message')
  async getRowAlert(row: Locator): Promise<string | null> {
    const alert = row.locator(ROW_ALERT);
    return (await alert.count()) ? alert.first().getAttribute('aria-label') : null;
  }

  @step('Check whether Save is enabled')
  async isSaveEnabled(): Promise<boolean> {
    return this.page.locator(BTN_SAVE).isEnabled();
  }

  hasSaveButton(): Promise<boolean> {
    return this.page.locator(BTN_SAVE).isVisible();
  }

  hasEditableCells(): Promise<number> {
    return this.page.locator(`${ROWS} input`).count();
  }

  /** Clicks Save and returns the toast shown and whether the server accepted the save. */
  @step('Save')
  async save(): Promise<{ ok: boolean; toast: string }> {
    const response = this.page.waitForResponse(isSave);
    await this.page.locator(BTN_SAVE).click();
    const ok = (await response).ok();
    const toast = this.page.locator(TOAST).last();
    await toast.waitFor({ state: 'visible' });
    return { ok, toast: (await toast.innerText()).trim() };
  }

  // ---------------------------------------------------------------- unsaved-changes guard

  async isUnsavedDialogVisible(): Promise<boolean> {
    return this.page.locator(DLG_UNSAVED).isVisible();
  }

  @step('Wait for the Unsaved changes dialog')
  async getUnsavedDialogText(): Promise<string> {
    await this.page.locator(DLG_UNSAVED).waitFor({ state: 'visible' });
    return (await this.page.locator(DLG_UNSAVED).innerText()).replace(/\s+/g, ' ').trim();
  }

  @step('Choose Stay in the Unsaved changes dialog')
  async stay(): Promise<void> {
    await this.page.locator(BTN_DLG_STAY).click();
    await this.page.locator(DLG_UNSAVED).waitFor({ state: 'hidden' });
  }

  @step('Choose Discard in the Unsaved changes dialog')
  async discard(): Promise<void> {
    await this.page.locator(BTN_DLG_DISCARD).click();
    await this.page.locator(DLG_UNSAVED).waitFor({ state: 'hidden' });
  }

  // ---------------------------------------------------------------- History pagination

  @step('Read the current page number')
  async getPageNumber(): Promise<string> {
    return this.page.locator(TXT_PAGE_NUMBER).inputValue();
  }

  @step('Go to the next page')
  async nextPage(): Promise<void> {
    const pageBefore = await this.getPageNumber();
    await this.page.locator(BTN_NEXT_PAGE).click();
    await this.waitForResults();
    await expect.poll(() => this.getPageNumber()).not.toBe(pageBefore);
  }

  rowCount(): Promise<number> {
    return this.page.locator(ROWS).count();
  }

  /** Today in the browser's own time zone, MM/DD/YYYY — the date the filters default to. */
  async browserToday(): Promise<string> {
    return this.page.evaluate(() => {
      const d = new Date();
      const pad = (v: number) => String(v).padStart(2, '0');
      return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;
    });
  }
}
