import { Locator, Page, Request, expect } from '@playwright/test';
import { step } from '../../fixtures/step-decorator';
import { BasePage } from '../base.page';
import { Log } from '../../utils/logger';
import { IConfig } from '../../types';
import {
  HEADER_TITLE,
  BTN_INFO,
  TOOLTIP,

  TAB_SELECTED,
  FILTER,
  TXT_SEARCH_DATE,
  BTN_DATE_RANGE,
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
  CHECKBOX,
  RATE_INPUT,
  ROW_ALERT,
  BTN_OPEN_CALENDAR,
  POPOVER,
  CALENDAR_MONTH,
  DRP_PAGE_SIZE,
  TXT_PAGE_NUMBER,
  BTN_FIRST_PAGE,
  BTN_PREV_PAGE,
  BTN_NEXT_PAGE,
  BTN_LAST_PAGE,
  OPTION,
  LISTBOX,
  MENU,
  MENU_ITEM,
  MENU_CHECKBOX,
  DLG_UNSAVED,
  BTN_DLG_STAY,
  BTN_DLG_DISCARD,
  TOAST,
  SIDEBAR_MENU_BUTTON,
  SIDEBAR_TAX_LABEL,
  sidebarPageFor,
} from '../../selectors/taxes/special-rate';
import { Column, Filter, Tab } from '../../data/taxes/special-rate';

/** One grid row, keyed by column header. */
export type GridRow = Partial<Record<Column, string>>;

/** A calendar day: [year, month 1-12, day]. */
export type Day = readonly [number, number, number];

/** MM/DD/YYYY plus n days → MM/DD/YYYY (calendar arithmetic, no time zone involved). */
export const addDays = (mmddyyyy: string, n: number): string => {
  const [m, d, y] = mmddyyyy.split('/').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d + n));
  const pad = (v: number) => String(v).padStart(2, '0');
  return `${pad(date.getUTCMonth() + 1)}/${pad(date.getUTCDate())}/${date.getUTCFullYear()}`;
};

/** MM/DD/YYYY → the midnight-UTC timestamp a save sends. */
export const wireDate = (mmddyyyy: string): string => {
  const [m, d, y] = mmddyyyy.split('/');
  return `${y}-${m}-${d}T00:00:00.000Z`;
};

/** [y, m, d] → MM/DD/YYYY. */
export const dayText = ([y, m, d]: Day): string => `${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}/${y}`;

// The page's server actions all post to the page URL; their ids change per build, so requests are told
// apart by their payload: a grid search carries "skipPagination" (Basic Information) or "dateRangeStart"
// (history), a save carries "records".
const postBody = (r: Request): string => (r.method() === 'POST' ? r.postData() ?? '' : '');
const isSearch = (r: Request): boolean => /"skipPagination"|"dateRangeStart"/.test(postBody(r));
const isSave = (r: Request): boolean => postBody(r).includes('"records"');
/** Choosing a State or County loads the next list with a request like [{"stateId":49}]. */
const isPlaceLookup = (r: Request): boolean => /^\[\{"(stateId|countyId)":\d+\}\]$/.test(postBody(r));

/** The server's reply to a successful save (a React server action frame). */
const SAVE_SUCCESS_REPLY = '0:{"a":"$@1","f":"","q":"","i":false}\n1:{"data":{"success":true,"message":"Saved"}}\n';

/** The records a save request carried. */
export type SavedRecord = Record<string, unknown>;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Tax → Special Rate. Basic Information lists the special rate in effect on a date per place and tax
// type; rows are edited in place, and a changed Taxable, Special or rate needs a later effective date
// and is saved as a new record. Special Rate History lists the records whose effective date falls in a
// date range, page by page.
export class SpecialRatePage extends BasePage {
  constructor(page: Page, config?: IConfig) {
    super(page, config);
    Log.info('SpecialRatePage initialized');
  }

  private url(officeNo: string): string {
    return `${(this.config?.base_url ?? '').replace(/\/+$/, '')}/locations/${officeNo}/taxes/special-rate`;
  }

  // ---------------------------------------------------------------- navigation

  /** Opens the page with the default grid layout, which the browser otherwise keeps between visits. */
  @step('Open the Special Rate page for an office')
  async open(officeNo: string): Promise<void> {
    await this.clearKeptState();
    await this.safeNavigateTo(this.url(officeNo));
    await this.waitForReady();
  }

  @step('Open Special Rate from the Tax menu')
  async openFromTaxMenu(officeNo: string): Promise<void> {
    await this.clearKeptState();
    await this.safeNavigateTo(this.url(officeNo).replace(/taxes\/special-rate$/, 'home'));
    // The sidebar menus appear only once the user's permissions have loaded.
    const tax = this.page.locator(SIDEBAR_MENU_BUTTON).filter({ hasText: SIDEBAR_TAX_LABEL });
    await tax.waitFor({ state: 'visible', timeout: 60_000 });
    await tax.click({ timeout: 30_000 });
    await this.page.locator(sidebarPageFor(officeNo)).click();
    await this.waitForReady();
  }

  private async clearKeptState(): Promise<void> {
    if (!this.page.url().startsWith('http')) return;
    await this.page.evaluate(() => {
      for (const store of [localStorage, sessionStorage]) {
        for (const key of Object.keys(store)) if (/special-?rate/i.test(key)) store.removeItem(key);
      }
    });
  }

  @step('Wait for the Special Rate page to load')
  async waitForReady(): Promise<void> {
    await this.page.locator(HEADER_TITLE).waitFor({ state: 'visible', timeout: 60_000 });
    await expect(this.page.locator(BTN_SEARCH)).toBeEnabled({ timeout: 60_000 });
    await expect(this.page.locator(FILTER.state)).toBeEnabled({ timeout: 60_000 });
  }

  /** Reloads the page; with unsaved edits the browser asks first (see reloadAndAnswer). */
  @step('Reload the Special Rate page')
  async reload(): Promise<void> {
    await this.page.reload();
    await this.waitForReady();
  }

  /**
   * Reloads with unsaved edits and returns the type of prompt the browser raised, if any. The test session
   * itself confirms leave-page prompts (pages.fixture.ts), so the reload goes ahead.
   */
  @step('Reload with unsaved changes and watch for the browser prompt')
  async reloadAndWatchPrompt(): Promise<string | null> {
    let asked: string | null = null;
    this.page.once('dialog', (d) => { asked = d.type(); });
    await this.page.reload();
    await this.waitForReady();
    return asked;
  }

  // ---------------------------------------------------------------- header and tabs

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

  /** Clicks a tab; with unsaved edits the page asks first, so the tab may not change yet. */
  @step('Click a tab')
  async clickTab(name: Tab): Promise<void> {
    await this.page.locator('main').getByRole('tab', { name, exact: true }).click();
  }

  @step('Open a tab')
  async openTab(name: Tab): Promise<void> {
    await this.clickTab(name);
    await expect(this.page.locator(TAB_SELECTED)).toHaveText(name);
    await expect(this.page.locator(BTN_SEARCH)).toBeEnabled();
  }

  async selectedTab(): Promise<string> {
    return (await this.page.locator(TAB_SELECTED).innerText()).trim();
  }

  // ---------------------------------------------------------------- search criteria

  @step('Read the search criteria')
  async getCriteria(): Promise<Record<Filter | 'date', string> & { countyEnabled: boolean; cityEnabled: boolean }> {
    const text = async (f: Filter) => (await this.page.locator(FILTER[f]).innerText()).trim();
    const onHistory = (await this.page.locator(BTN_DATE_RANGE).count()) > 0;
    return {
      state: await text('state'),
      county: await text('county'),
      city: await text('city'),
      taxType: await text('taxType'),
      special: await text('special'),
      taxable: await text('taxable'),
      date: onHistory ? (await this.page.locator(BTN_DATE_RANGE).innerText()).trim() : await this.page.locator(TXT_SEARCH_DATE).inputValue(),
      countyEnabled: await this.page.locator(FILTER.county).isEnabled(),
      cityEnabled: await this.page.locator(FILTER.city).isEnabled(),
    };
  }

  /** Options of a filter as listed, blanks included. */
  @step('Read the options of a filter')
  async getOptions(filter: Filter): Promise<string[]> {
    await expect(this.page.locator(FILTER[filter])).toBeEnabled({ timeout: 30_000 });
    await this.page.locator(FILTER[filter]).click();
    await this.page.locator(LISTBOX).waitFor({ state: 'visible' });
    const texts = (await this.page.locator(OPTION).allInnerTexts()).map((t) => t.trim());
    await this.page.keyboard.press('Escape');
    await this.page.locator(LISTBOX).waitFor({ state: 'hidden' });
    return texts;
  }

  /**
   * Picks an option of a filter. A State or County choice loads the next list, which is waited for, so
   * the next choice or search sees it.
   */
  @step('Choose a filter option')
  async choose(filter: Filter, name: string): Promise<void> {
    const control = this.page.locator(FILTER[filter]);
    await expect(control).toBeEnabled({ timeout: 30_000 });
    const lookup = ['state', 'county'].includes(filter) && name !== 'All'
      ? this.page.waitForResponse((r) => isPlaceLookup(r.request()), { timeout: 15_000 }).catch(() => null)
      : null;
    await control.click();
    await this.page.locator(LISTBOX).waitFor({ state: 'visible' });
    // Long lists (59 states) open mid-scroll; bring the option into view before clicking it.
    const option = this.page.locator(OPTION).filter({ hasText: new RegExp(`^\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`) }).first();
    await option.scrollIntoViewIfNeeded();
    await option.click();
    await this.page.locator(LISTBOX).waitFor({ state: 'hidden' });
    await lookup;
  }

  /** Types the search Effective Date (Basic Information) and leaves the field. */
  @step('Set the search Effective Date')
  async setSearchDate(mmddyyyy: string): Promise<string> {
    const input = this.page.locator(TXT_SEARCH_DATE);
    await input.fill(mmddyyyy);
    await this.page.locator(HEADER_TITLE).click();
    return input.inputValue();
  }

  async searchDateMessage(): Promise<string | null> {
    return this.page.locator(TXT_SEARCH_DATE).locator('xpath=ancestor::form[1]').locator('[title]').first().getAttribute('title', { timeout: 2_000 }).catch(() => null);
  }

  // ---------------------------------------------------------------- history date range

  @step('Read the history Date Range')
  async getDateRange(): Promise<string> {
    return (await this.page.locator(BTN_DATE_RANGE).innerText()).trim();
  }

  /**
   * Sets the history Date Range. Each click on a day sets one end and closes the calendar, so it is opened
   * once per end. The calendar moves a year with Shift+PageUp/PageDown and a month with PageUp/PageDown.
   */
  @step('Set the history Date Range')
  async setDateRange(from: Day, to: Day): Promise<string> {
    await this.clickCalendarDay(from);
    await this.clickCalendarDay(to);
    return this.getDateRange();
  }

  private async clickCalendarDay([y, m, d]: Day): Promise<void> {
    await this.page.locator(BTN_DATE_RANGE).click();
    const first = this.page.locator(CALENDAR_MONTH).first();
    await first.waitFor({ state: 'visible' });
    const target = `${MONTHS[m - 1]} ${y}`;
    const shown = async () => this.page.locator(CALENDAR_MONTH).evaluateAll((gs) => gs.map((g) => g.getAttribute('aria-label') ?? ''));
    if (!(await shown()).includes(target)) {
      const [name, year] = ((await first.getAttribute('aria-label')) ?? '').split(' ');
      const diff = (y - Number(year)) * 12 + (m - 1 - MONTHS.indexOf(name!));
      // Keys act on the focused day, so a day of the first month shown gets focus first.
      await first.locator('button:not([disabled])').first().focus();
      const key = diff < 0 ? 'PageUp' : 'PageDown';
      for (let i = 0; i < Math.floor(Math.abs(diff) / 12); i++) await this.page.keyboard.press(`Shift+${key}`);
      for (let i = 0; i < Math.abs(diff) % 12; i++) await this.page.keyboard.press(key);
      await expect.poll(shown).toContain(target);
    }
    const month = this.page.locator(`${CALENDAR_MONTH}[aria-label="${target}"]`);
    await month.getByRole('button', { name: new RegExp(`${MONTHS[m - 1]} ${d}(st|nd|rd|th), ${y}`) }).first().click();
    // A click on a day that already starts the range leaves the calendar open; close it.
    const closed = await this.page.locator(POPOVER).waitFor({ state: 'hidden', timeout: 2_000 }).then(() => true, () => false);
    if (!closed) await this.page.keyboard.press('Escape');
    await this.page.locator(POPOVER).waitFor({ state: 'hidden' });
  }

  // ---------------------------------------------------------------- keyboard

  /** Focuses a filter, opens it with Enter, moves down the list and picks with Enter. */
  @step('Choose a filter option with the keyboard')
  async chooseByKeyboard(filter: Filter, stepsDown: number): Promise<void> {
    await this.page.locator(FILTER[filter]).focus();
    await this.page.keyboard.press('Enter');
    // The list takes a moment to put its highlight on the current option; keys before that are lost.
    const highlighted = this.page.locator(`${OPTION}[data-highlighted]`);
    await expect(highlighted).toHaveCount(1);
    for (let i = 0; i < stepsDown; i++) {
      const before = await highlighted.innerText();
      await this.page.keyboard.press('ArrowDown');
      await expect(highlighted).not.toHaveText(before);
    }
    await this.page.keyboard.press('Enter');
    await this.page.locator(LISTBOX).waitFor({ state: 'hidden' });
  }

  @step('Press keys')
  async press(...keys: string[]): Promise<void> {
    for (const key of keys) await this.page.keyboard.press(key);
  }

  /** The focused control: its id, else its aria-label, else its text. */
  async focusedControl(): Promise<string> {
    return this.page.evaluate(() => {
      const e = document.activeElement as HTMLElement | null;
      return (e?.id || e?.getAttribute('aria-label') || e?.innerText || '').trim();
    });
  }

  /** Presses Enter on the focused control (Search) and waits for the results like a clicked Search. */
  @step('Press Enter to search')
  async searchWithEnter(): Promise<number> {
    const request = this.page.waitForRequest(isSearch);
    await this.page.keyboard.press('Enter');
    await request;
    return this.waitForResults();
  }

  // ---------------------------------------------------------------- search

  @step('Check whether Search is enabled')
  async isSearchEnabled(): Promise<boolean> {
    return this.page.locator(BTN_SEARCH).isEnabled();
  }

  /** Clicks Search without waiting for results, for when a dialog is expected to step in. */
  @step('Click Search')
  async clickSearch(): Promise<void> {
    await this.page.locator(BTN_SEARCH).click();
  }

  @step('Search')
  async search(): Promise<number> {
    const request = this.page.waitForRequest(isSearch);
    await this.page.locator(BTN_SEARCH).click();
    await request;
    return this.waitForResults();
  }

  /** The search request's criteria, for checking what a filter sent. */
  @step('Search and read the criteria sent')
  async searchAndReadRequest(): Promise<{ count: number; sent: Record<string, unknown> }> {
    const request = this.page.waitForRequest(isSearch);
    await this.page.locator(BTN_SEARCH).click();
    const sent = (JSON.parse((await request).postData() ?? '[{}]') as Record<string, unknown>[])[0]!;
    return { count: await this.waitForResults(), sent };
  }

  // Loading placeholders replace the grid from the moment a search starts, and the new rows and count
  // replace them in one go; so once the placeholders are gone the count is the new one.
  private async waitForResults(): Promise<number> {
    await this.page.locator(SKELETON).first().waitFor({ state: 'attached', timeout: 5_000 }).catch(() => {});
    await expect(this.page.locator(SKELETON)).toHaveCount(0, { timeout: 90_000 });
    return this.getCount();
  }

  /** Searches one state as of a date (Basic Information) and returns the row of a tax type. */
  @step('Find the row of a tax type in a state')
  async findRow(state: string, taxType: string, asOf: string): Promise<Locator> {
    await this.choose('state', state);
    await this.setSearchDate(asOf);
    await this.search();
    const row = this.row(taxType);
    await expect(row).toHaveCount(1);
    return row;
  }

  /** The row of a tax type, matched exactly ("Rigging" is not "Rigging Labor"). */
  row(taxType: string): Locator {
    return this.page.locator(ROWS).filter({ has: this.page.getByRole('cell', { name: taxType, exact: true }) });
  }

  firstRow(): Locator {
    return this.page.locator(ROWS).first();
  }

  /** Resets the criteria; with unsaved edits the page asks first. */
  @step('Click Reset')
  async reset(): Promise<void> {
    await this.page.locator(BTN_RESET).click();
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
    const text = await this.page.locator(RECORD_COUNT).first().innerText();
    const m = text.match(/([\d,]+)\s+records?\s+found/i);
    if (!m) throw new Error(`No "records found" count in: ${text}`);
    return Number(m[1]!.replace(/,/g, ''));
  }

  @step('Check whether a grid message is shown')
  async isMessageVisible(text: string): Promise<boolean> {
    return this.page.getByText(text, { exact: true }).isVisible();
  }

  rowCount(): Promise<number> {
    return this.page.locator(ROWS).count();
  }

  @step('Read the column headers')
  async getHeaders(): Promise<string[]> {
    return (await this.page.locator(HEADERS).allInnerTexts()).map((t) => t.trim()).filter(Boolean);
  }

  // Columns can be hidden, so a cell is found by its header rather than a fixed position.
  private async cell(row: Locator, column: Column): Promise<Locator> {
    const i = (await this.getHeaders()).indexOf(column);
    if (i < 0) throw new Error(`Column "${column}" is not shown`);
    return row.locator('td').nth(i);
  }

  /** Reads a row; inputs are read by value and a checkbox in edit mode as Yes/No. */
  @step('Read a grid row')
  async readRow(row: Locator): Promise<GridRow> {
    const headers = (await this.getHeaders()) as Column[];
    const values = await row.locator('td').evaluateAll((tds) => tds.map((td) => {
      const box = td.querySelector('[role="checkbox"]');
      if (box) return box.getAttribute('aria-checked') === 'true' ? 'Yes' : 'No';
      const input = td.querySelector('input');
      return (input ? input.value : (td as HTMLElement).innerText).replace(/\s+/g, ' ').trim();
    }));
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ''])) as GridRow;
  }

  /** A column of the rows on screen (the grid draws about 40 rows at a time). */
  @step('Read a column of the grid')
  async readColumn(column: Column): Promise<string[]> {
    const i = (await this.getHeaders()).indexOf(column);
    if (i < 0) throw new Error(`Column "${column}" is not shown`);
    return this.page.locator(ROWS).evaluateAll((rows, idx) => rows.map((r) => {
      const td = r.querySelectorAll('td')[idx] as HTMLElement | undefined;
      const input = td?.querySelector('input');
      return (input ? input.value : td?.innerText ?? '').replace(/\s+/g, ' ').trim();
    }), i);
  }

  /** Which cells of a row hold an editable control (input or checkbox), by column. */
  @step('List the editable cells of a row')
  async editableColumns(row: Locator): Promise<string[]> {
    const headers = await this.getHeaders();
    const flags = await row.locator('td').evaluateAll((tds) => tds.map((td) => !!td.querySelector('input:not([disabled]), [role="checkbox"]')));
    return headers.filter((_, i) => flags[i]);
  }

  private async openHeaderMenu(column: string): Promise<void> {
    await this.headerOf(column).locator(HEADER_MENU_TRIGGER).click();
    await this.page.locator(MENU).waitFor({ state: 'visible' });
  }

  private headerOf(column: string): Locator {
    return this.page.locator(HEADERS).filter({ has: this.page.locator(HEADER_MENU_TRIGGER, { hasText: new RegExp(`^${column}$`) }) });
  }

  /** Sorts by a column and waits for the re-sorted results (sorting asks the server again). */
  @step('Sort a column')
  async sortBy(column: string, direction: 'ascending' | 'descending'): Promise<Record<string, unknown>> {
    await this.openHeaderMenu(column);
    const request = this.page.waitForRequest(isSearch);
    await this.page.locator(MENU_ITEM).filter({ hasText: `Sort ${direction}` }).click();
    const sent = (JSON.parse((await request).postData() ?? '[{}]') as Record<string, unknown>[])[0]!;
    await this.waitForResults();
    return sent;
  }

  @step('Hide a column from its header menu')
  async hideColumn(column: string): Promise<void> {
    await this.openHeaderMenu(column);
    await this.page.locator(MENU_ITEM).filter({ hasText: 'Hide column' }).click();
    await expect(this.headerOf(column)).toHaveCount(0);
  }

  /** Drags a column by its grip onto another column's place. */
  @step('Drag a column to another place')
  async dragColumn(column: string, onto: string): Promise<void> {
    const grip = (await this.headerOf(column).locator('svg').first().boundingBox())!;
    const target = (await this.headerOf(onto).boundingBox())!;
    await this.page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await this.page.mouse.down();
    await this.page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 });
    await this.page.mouse.up();
  }

  /** Drags a column's resize handle to the right by the given pixels; returns the new width. */
  @step('Resize a column')
  async resizeColumn(column: string, px: number): Promise<number> {
    const handle = (await this.headerOf(column).locator('button[aria-label^="Resize column"]').boundingBox())!;
    await this.page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await this.page.mouse.down();
    await this.page.mouse.move(handle.x + handle.width / 2 + px, handle.y + handle.height / 2, { steps: 8 });
    await this.page.mouse.up();
    return this.columnWidth(column);
  }

  async columnWidth(column: string): Promise<number> {
    return Math.round((await this.headerOf(column).boundingBox())!.width);
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

  @step('Tick or untick a column in Grid Options')
  async toggleGridOptionColumn(column: string): Promise<void> {
    await this.page.locator(BTN_GRID_OPTIONS).click();
    await this.page.locator(MENU_CHECKBOX).filter({ hasText: new RegExp(`^${column}$`) }).click();
    await this.closeMenu();
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

  // ---------------------------------------------------------------- history paging

  @step('Read the page position')
  async getPagePosition(): Promise<{ page: number; of: number }> {
    const page = Number(await this.page.locator(TXT_PAGE_NUMBER).inputValue());
    const of = Number(((await this.page.locator(TXT_PAGE_NUMBER).locator('xpath=..').innerText()).match(/\/\s*(\d+)/) ?? [])[1]
      ?? (await this.page.locator(TXT_PAGE_NUMBER).locator('xpath=../..').innerText()).match(/\/\s*(\d+)/)?.[1]);
    return { page, of };
  }

  /** Moves to another page and returns the page number the request asked for. */
  @step('Go to another page')
  async goToPage(which: 'first' | 'previous' | 'next' | 'last'): Promise<number> {
    const button = { first: BTN_FIRST_PAGE, previous: BTN_PREV_PAGE, next: BTN_NEXT_PAGE, last: BTN_LAST_PAGE }[which];
    const request = this.page.waitForRequest(isSearch);
    await this.page.locator(button).click();
    const sent = JSON.parse((await request).postData() ?? '[{}]')[0] as { page: number };
    await this.waitForResults();
    return sent.page;
  }

  /** Types a page number and presses Enter; returns the page number the request asked for. */
  @step('Type a page number')
  async typePage(n: number): Promise<number> {
    const box = this.page.locator(TXT_PAGE_NUMBER);
    const request = this.page.waitForRequest(isSearch);
    await box.fill(String(n));
    await box.press('Enter');
    const sent = JSON.parse((await request).postData() ?? '[{}]')[0] as { page: number };
    await this.waitForResults();
    return sent.page;
  }

  @step('Check which paging buttons are enabled')
  async pagingEnabled(): Promise<Record<'first' | 'previous' | 'next' | 'last', boolean>> {
    return {
      first: await this.page.locator(BTN_FIRST_PAGE).isEnabled(),
      previous: await this.page.locator(BTN_PREV_PAGE).isEnabled(),
      next: await this.page.locator(BTN_NEXT_PAGE).isEnabled(),
      last: await this.page.locator(BTN_LAST_PAGE).isEnabled(),
    };
  }

  @step('Read the rows-per-page options')
  async getPageSizes(): Promise<{ current: string; options: string[] }> {
    const box = this.page.locator(DRP_PAGE_SIZE);
    const current = (await box.innerText()).trim();
    await box.click();
    await this.page.locator(LISTBOX).waitFor({ state: 'visible' });
    const options = (await this.page.locator(OPTION).allInnerTexts()).map((t) => t.trim());
    await this.page.keyboard.press('Escape');
    return { current, options };
  }

  @step('Choose rows per page')
  async setPageSize(size: string): Promise<number> {
    const request = this.page.waitForRequest(isSearch);
    await this.page.locator(DRP_PAGE_SIZE).click();
    await this.page.locator(OPTION).filter({ hasText: new RegExp(`^${size}$`) }).click();
    const sent = JSON.parse((await request).postData() ?? '[{}]')[0] as { pageSize: number };
    await this.waitForResults();
    return sent.pageSize;
  }

  // ---------------------------------------------------------------- editing

  // Leaving a cell is what commits it, so every edit ends by clicking a neutral spot.
  private async leaveCell(): Promise<void> {
    await this.page.locator(RECORD_COUNT).first().click();
  }

  /** Taxable and Special show Yes/No until the cell is clicked; then they hold a checkbox. */
  @step('Tick or untick Taxable or Special on a row')
  async toggle(row: Locator, column: 'Taxable' | 'Special'): Promise<string> {
    const cell = await this.cell(row, column);
    const box = cell.locator(CHECKBOX);
    const before = (await cell.innerText()).trim();
    if (!(await box.isVisible())) await cell.click();
    const wasTicked = (await box.getAttribute('aria-checked')) === 'true' || before === 'Yes';
    await box.click();
    // The cell turns back into its Yes/No text once ticked; wait for the new value.
    const now = wasTicked ? 'No' : 'Yes';
    await expect.poll(async () => (await this.readRow(row))[column]).toBe(now);
    return now;
  }

  /** The rate box shown with Special ticked; returns the column it sits in. */
  @step('Find the rate box of a row')
  async rateColumn(row: Locator): Promise<string | null> {
    const headers = await this.getHeaders();
    const i = await row.locator('td').evaluateAll((tds, sel) => tds.findIndex((td) => !!td.querySelector(sel)), RATE_INPUT);
    return i < 0 ? null : headers[i] ?? null;
  }

  /** Types a rate into the row's rate box and leaves it; returns what the box then shows. */
  @step('Type a special rate')
  async editRate(row: Locator, value: string): Promise<string> {
    const input = row.locator(RATE_INPUT);
    await input.fill(value);
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

  @step('Type Notes')
  async editNotes(row: Locator, text: string): Promise<string> {
    const input = (await this.cell(row, 'Notes')).locator('input');
    await input.fill(text);
    await this.leaveCell();
    return input.inputValue();
  }

  @step('Read the Notes maximum length')
  async notesMaxLength(row: Locator): Promise<number> {
    return Number(await (await this.cell(row, 'Notes')).locator('input').getAttribute('maxlength'));
  }

  /** Opens the row's calendar and picks a day of the month it shows; returns the date in the cell. */
  @step('Pick an Effective Date from the calendar')
  async pickCalendarDay(row: Locator, day: number): Promise<{ shownMonth: string; value: string }> {
    const cell = await this.cell(row, 'Effective Date');
    await cell.locator(BTN_OPEN_CALENDAR).click();
    const month = this.page.locator(CALENDAR_MONTH).first();
    const shownMonth = (await month.getAttribute('aria-label')) ?? '';
    const [name, year] = shownMonth.split(' ');
    await month.getByRole('button', { name: new RegExp(`, ${name} ${day}(st|nd|rd|th), ${year}$`) }).click();
    await this.page.locator(POPOVER).waitFor({ state: 'hidden' });
    await this.leaveCell();
    return { shownMonth, value: await cell.locator('input').inputValue() };
  }

  /** Every validation message on the row. */
  @step('Read the validation messages of a row')
  async getRowMessages(row: Locator): Promise<string[]> {
    return row.locator(ROW_ALERT).evaluateAll((els) => els.map((e) => e.getAttribute('title') ?? '').filter(Boolean));
  }

  /** Hovers a control and returns the tooltip that opens, or null when none does. */
  @step('Hover a control and read its tooltip')
  async tooltipOf(control: Locator): Promise<string | null> {
    await this.page.mouse.move(0, 0);
    await expect(this.page.locator(TOOLTIP)).toHaveCount(0);
    await control.hover();
    const tip = this.page.locator(TOOLTIP).first();
    if (!(await tip.waitFor({ state: 'visible', timeout: 2_000 }).then(() => true, () => false))) return null;
    return (await tip.innerText()).split('\n')[0]!.trim();
  }

  /** The accessible name a screen reader announces for a control (its aria-label). */
  async accessibleName(control: Locator): Promise<string | null> {
    return control.getAttribute('aria-label');
  }

  @step('Check whether Save is enabled')
  async isSaveEnabled(): Promise<boolean> {
    return this.page.locator(BTN_SAVE).isEnabled();
  }

  /** Clicks Save; returns the toast, whether the server accepted it and the records it was sent. */
  @step('Save')
  async save(): Promise<{ ok: boolean; toast: string; records: SavedRecord[] }> {
    const request = this.page.waitForRequest(isSave);
    await this.page.locator(BTN_SAVE).click();
    const sent = await request;
    const ok = (await sent.response())?.ok() ?? false;
    const toast = this.page.locator(TOAST).last();
    // The toast can follow the server reply by several seconds on E2E.
    await toast.waitFor({ state: 'visible', timeout: 30_000 });
    const records = (JSON.parse(sent.postData() ?? '[]') as { records: SavedRecord[] }[])[0]?.records ?? [];
    return { ok, toast: (await toast.innerText()).trim(), records };
  }

  /** Answers every save in the browser with a success reply, so nothing is stored, until the returned function is called. */
  async answerSavesWithSuccess(): Promise<() => Promise<void>> {
    const pattern = /taxes\/special-rate/;
    await this.page.route(pattern, (route) =>
      isSave(route.request()) ? route.fulfill({ status: 200, contentType: 'text/x-component', body: SAVE_SUCCESS_REPLY }) : route.continue(),
    );
    return () => this.page.unroute(pattern);
  }

  /** Makes every save fail at the network until the returned function is called. */
  async failSaves(): Promise<() => Promise<void>> {
    const pattern = /taxes\/special-rate/;
    await this.page.route(pattern, (route) =>
      isSave(route.request()) ? route.fulfill({ status: 500, body: 'forced failure' }) : route.continue(),
    );
    return () => this.page.unroute(pattern);
  }

  // ---------------------------------------------------------------- unsaved-changes guard

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

  @step('Close the Unsaved changes dialog')
  async closeDialog(): Promise<void> {
    await this.page.locator(DLG_UNSAVED).getByRole('button', { name: 'Close', exact: true }).click();
    await this.page.locator(DLG_UNSAVED).waitFor({ state: 'hidden' });
  }

  /** Discards the edits; the action that asked then goes ahead. */
  @step('Choose Discard in the Unsaved changes dialog')
  async discard(): Promise<void> {
    await this.page.locator(BTN_DLG_DISCARD).click();
    await this.page.locator(DLG_UNSAVED).waitFor({ state: 'hidden' });
  }

  /** Today in the browser's own time zone, MM/DD/YYYY — the date the search defaults to. */
  async browserToday(): Promise<string> {
    return this.page.evaluate(() => {
      const d = new Date();
      const pad = (v: number) => String(v).padStart(2, '0');
      return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;
    });
  }
}
