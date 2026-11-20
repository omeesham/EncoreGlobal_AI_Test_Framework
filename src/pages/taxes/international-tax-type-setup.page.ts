import { Locator, Page, Request, expect } from '@playwright/test';
import { step } from '../../fixtures/step-decorator';
import { BasePage } from '../base.page';
import { Log } from '../../utils/logger';
import { IConfig } from '../../types';
import {
  HEADER_TITLE,
  BTN_INFO,
  TOOLTIP,
  DRP_COUNTRY,
  TXT_SEARCH_DATE,
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
  TYPE_PICKER,
  ROW_ALERT,
  BTN_OPEN_CALENDAR,
  POPOVER,
  CALENDAR_MONTH,
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
  SIDEBAR_HOME,
  COLUMN_RESIZE,
} from '../../selectors/taxes/international-tax-type-setup';
import { Column, TypeKind } from '../../data/taxes/international-tax-type-setup';

/** One grid row, keyed by column header. */
export type GridRow = Partial<Record<Column, string>>;

/** MM/DD/YYYY plus n days → MM/DD/YYYY (calendar arithmetic, no time zone involved). */
export const addDays = (mmddyyyy: string, n: number): string => {
  const [m, d, y] = mmddyyyy.split('/').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d + n));
  const pad = (v: number) => String(v).padStart(2, '0');
  return `${pad(date.getUTCMonth() + 1)}/${pad(date.getUTCDate())}/${date.getUTCFullYear()}`;
};

// The page's server actions all post to the page URL; their ids change per build, so requests are
// told apart by their payload. A search posts only the country id, a save posts "records".
const postBody = (r: Request): string => (r.method() === 'POST' ? r.postData() ?? '' : '');
const isSearch = (r: Request): boolean => /^\[\{"countryId":\d+\}\]$/.test(postBody(r));
const isSave = (r: Request): boolean => postBody(r).includes('"records"');

/** The server's reply to a successful one-record save (a React server action frame), as read live. */
const SAVE_SUCCESS_REPLY =
  '0:{"a":"$@1","f":"","q":"","i":false}\n' +
  '1:{"data":{"success":true,"message":"Successfully created 1 international tax type record(s).","createdCount":1}}\n';

/** The records a save request carried. */
export type SavedRecord = Record<string, unknown>;

const TYPE_COLUMN: Record<TypeKind, Column> = { gov: 'GOV Tax Type Name', provincial: 'Provincial Tax Type Name' };
const REG_COLUMN: Record<TypeKind, Column> = { gov: 'GOV Tax Reg. Number', provincial: 'Provincial Tax Reg. Number' };

// Tax → International Tax Type Setup. A search lists one row per province of a country, showing the
// tax types in effect on the chosen date. Rows are edited in place; a changed type or registration
// number needs a later effective date and is saved as a new record, so earlier records are kept.
export class InternationalTaxTypeSetupPage extends BasePage {
  constructor(page: Page, config?: IConfig) {
    super(page, config);
    Log.info('InternationalTaxTypeSetupPage initialized');
  }

  private url(officeNo: string): string {
    return `${(this.config?.base_url ?? '').replace(/\/+$/, '')}/locations/${officeNo}/taxes/international-tax-type-setup`;
  }

  // ---------------------------------------------------------------- navigation

  /** Opens the page with the default grid layout, which the browser otherwise keeps between visits. */
  @step('Open the International Tax Type Setup page for an office')
  async open(officeNo: string): Promise<void> {
    await this.clearKeptState();
    await this.safeNavigateTo(this.url(officeNo));
    await this.waitForReady();
  }

  @step('Open International Tax Type Setup from the Tax menu')
  async openFromTaxMenu(officeNo: string): Promise<void> {
    await this.clearKeptState();
    await this.safeNavigateTo(this.url(officeNo).replace(/taxes\/international-tax-type-setup$/, 'home'));
    // The sidebar menus appear only once the user's permissions have loaded.
    const tax = this.page.locator(SIDEBAR_MENU_BUTTON).filter({ hasText: SIDEBAR_TAX_LABEL });
    await tax.waitFor({ state: 'visible', timeout: 60_000 });
    await tax.click();
    await this.page.locator(sidebarPageFor(officeNo)).click();
    await this.waitForReady();
  }

  private async clearKeptState(): Promise<void> {
    if (!this.page.url().startsWith('http')) return;
    await this.page.evaluate(() => {
      for (const store of [localStorage, sessionStorage]) {
        for (const key of Object.keys(store)) if (/international-?tax-?type/i.test(key)) store.removeItem(key);
      }
    });
  }

  @step('Wait for the International Tax Type Setup page to load')
  async waitForReady(): Promise<void> {
    await this.page.locator(HEADER_TITLE).waitFor({ state: 'visible', timeout: 60_000 });
    await expect(this.page.locator(BTN_SEARCH)).toBeEnabled({ timeout: 60_000 });
  }

  /** Reloads the page without clearing anything the browser kept. */
  @step('Reload the International Tax Type Setup page')
  async reload(): Promise<void> {
    await this.page.reload();
    await this.waitForReady();
  }

  /** Clicks Home in the sidebar; with unsaved edits the page asks first. */
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
  async getCriteria(): Promise<{ country: string; date: string }> {
    return {
      country: (await this.page.locator(DRP_COUNTRY).innerText()).trim(),
      date: await this.page.locator(TXT_SEARCH_DATE).inputValue(),
    };
  }

  @step('Read the Country options')
  async getCountryOptions(): Promise<string[]> {
    await this.page.locator(DRP_COUNTRY).click();
    const texts = await this.readOpenOptions();
    await this.page.keyboard.press('Escape');
    return texts;
  }

  /** Picks a country. With unsaved edits the page asks first, so the choice may not apply yet. */
  @step('Choose a country')
  async selectCountry(name: string): Promise<void> {
    await this.page.locator(DRP_COUNTRY).click();
    await this.page.locator(OPTION).filter({ hasText: new RegExp(`^${name}$`) }).click();
  }

  /** Types the search Effective Date and leaves the field. */
  @step('Set the search Effective Date')
  async setSearchDate(mmddyyyy: string): Promise<string> {
    const input = this.page.locator(TXT_SEARCH_DATE);
    await input.fill(mmddyyyy);
    await this.page.locator(HEADER_TITLE).click();
    return input.inputValue();
  }

  // ---------------------------------------------------------------- keyboard

  /** Focuses Country, opens it with Enter, moves down the list and picks with Enter. */
  @step('Choose a country with the keyboard')
  async chooseCountryByKeyboard(stepsDown: number): Promise<void> {
    await this.page.locator(DRP_COUNTRY).focus();
    await this.page.keyboard.press('Enter');
    // The list takes a moment to put its highlight on the current country; keys before that are lost.
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

  /** The focused control's accessible name (aria-label, else its text). */
  async focusedControl(): Promise<string> {
    return this.page.evaluate(() => {
      const e = document.activeElement as HTMLElement | null;
      return (e?.getAttribute('aria-label') || e?.innerText || '').trim();
    });
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

  @step('Search')
  async search(): Promise<number> {
    const request = this.page.waitForRequest(isSearch);
    await this.page.locator(BTN_SEARCH).click();
    await request;
    return this.waitForResults();
  }

  /** Presses Enter on the focused control (Search) and waits for the results like a clicked Search. */
  @step('Press Enter to search')
  async searchWithEnter(): Promise<number> {
    const request = this.page.waitForRequest(isSearch);
    await this.page.keyboard.press('Enter');
    await request;
    return this.waitForResults();
  }

  // Loading placeholders replace the grid from the moment a search starts, and the new rows and
  // count replace them in one go; so once the placeholders are gone the count is the new one.
  private async waitForResults(): Promise<number> {
    await this.page.locator(SKELETON).first().waitFor({ state: 'attached', timeout: 5_000 }).catch(() => {});
    await expect(this.page.locator(SKELETON)).toHaveCount(0, { timeout: 60_000 });
    return this.getCount();
  }

  /** Searches a country as of a date and returns the row of one province. */
  @step('Find the row of a province')
  async findRow(country: string, province: string, asOf: string): Promise<Locator> {
    await this.selectCountry(country);
    await this.setSearchDate(asOf);
    await this.search();
    const row = this.row(province);
    await expect(row).toHaveCount(1);
    return row;
  }

  /**
   * Searches a country's latest records and returns the first province with no tax type at all.
   * Other users set up provinces on E2E too, so no fixed province is relied on to stay empty.
   */
  @step('Find a province with no tax type')
  async findEmptyRow(country: string, asOf: string): Promise<Locator> {
    await this.selectCountry(country);
    await this.setSearchDate(asOf);
    await this.search();
    const provinces = await this.readColumn('Province');
    const types = await this.readColumn('GOV Tax Type Name');
    const i = types.findIndex((t) => t === '');
    if (i < 0) throw new Error(`Every ${country} province already has a tax type`);
    return this.row(provinces[i]!);
  }

  /** The row of a province, matched exactly ("Baja California" is not "Baja California Sur"). */
  row(province: string): Locator {
    return this.page.locator(ROWS).filter({ has: this.page.getByRole('cell', { name: province, exact: true }) });
  }

  @step('Reset the search criteria')
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

  @step('Check whether the empty-grid message is shown')
  async isEmptyMessageVisible(text: string): Promise<boolean> {
    return this.page.getByText(text, { exact: true }).isVisible();
  }

  rowCount(): Promise<number> {
    return this.page.locator(ROWS).count();
  }

  @step('Read the column headers')
  async getHeaders(): Promise<string[]> {
    return (await this.page.locator(HEADERS).allInnerTexts()).map((t) => t.trim()).filter(Boolean);
  }

  // Columns can be hidden or moved, so a cell is found by its header rather than a fixed position.
  private async cell(row: Locator, column: Column): Promise<Locator> {
    const i = (await this.getHeaders()).indexOf(column);
    if (i < 0) throw new Error(`Column "${column}" is not shown`);
    return row.locator('td').nth(i);
  }

  /** Reads a row; editable cells are read from their inputs. */
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

  @step('Read a column of the grid')
  async readColumn(column: Column): Promise<string[]> {
    const i = (await this.getHeaders()).indexOf(column);
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

  private async openHeaderMenu(column: Column): Promise<void> {
    await this.page.locator(HEADERS).filter({ hasText: column }).locator(HEADER_MENU_TRIGGER).click();
    await this.page.locator(MENU).waitFor({ state: 'visible' });
  }

  @step('Sort a column')
  async sortBy(column: Column, direction: 'ascending' | 'descending'): Promise<void> {
    await this.openHeaderMenu(column);
    await this.page.locator(MENU_ITEM).filter({ hasText: `Sort ${direction}` }).click();
    await this.page.locator(MENU).waitFor({ state: 'hidden' });
  }

  @step('Hide a column from its header menu')
  async hideColumn(column: Column): Promise<void> {
    await this.openHeaderMenu(column);
    await this.page.locator(MENU_ITEM).filter({ hasText: 'Hide column' }).click();
    await expect(this.page.locator(HEADERS).filter({ hasText: column })).toHaveCount(0);
  }

  /** Drags a column by its grip onto another column's place. */
  @step('Drag a column to another place')
  async dragColumn(column: Column, onto: Column): Promise<void> {
    const grip = (await this.headerOf(column).locator('svg').first().boundingBox())!;
    const target = (await this.headerOf(onto).boundingBox())!;
    await this.page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await this.page.mouse.down();
    await this.page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 });
    await this.page.mouse.up();
  }

  /** Drags a column's resize handle to the right by the given pixels; returns the new width. */
  @step('Resize a column')
  async resizeColumn(column: Column, px: number): Promise<number> {
    const handle = (await this.headerOf(column).locator(COLUMN_RESIZE).boundingBox())!;
    await this.page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await this.page.mouse.down();
    await this.page.mouse.move(handle.x + handle.width / 2 + px, handle.y + handle.height / 2, { steps: 8 });
    await this.page.mouse.up();
    return this.columnWidth(column);
  }

  async columnWidth(column: Column): Promise<number> {
    return Math.round((await this.headerOf(column).boundingBox())!.width);
  }

  private headerOf(column: Column): Locator {
    return this.page.locator(HEADERS).filter({ has: this.page.locator(HEADER_MENU_TRIGGER, { hasText: new RegExp(`^${column.replace('.', '\\.')}$`) }) });
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

  /** Options of the open list; a list can open empty (Bahamas has no GOV tax types). */
  private async readOpenOptions(): Promise<string[]> {
    await this.page.locator(LISTBOX).waitFor({ state: 'visible' });
    return (await this.page.locator(OPTION).allInnerTexts()).map((t) => t.trim());
  }

  /** A type cell shows its value until clicked; then it holds the picker. */
  private async typePicker(row: Locator, kind: TypeKind): Promise<Locator> {
    const cell = await this.cell(row, TYPE_COLUMN[kind]);
    const picker = cell.locator(TYPE_PICKER);
    if (!(await picker.isVisible())) await cell.click();
    await picker.waitFor({ state: 'visible' });
    return picker;
  }

  @step('Read the tax type options of a row')
  async getTypeOptions(row: Locator, kind: TypeKind): Promise<string[]> {
    await (await this.typePicker(row, kind)).click();
    const texts = await this.readOpenOptions();
    await this.page.keyboard.press('Escape');
    await this.page.locator(LISTBOX).waitFor({ state: 'hidden' });
    return texts;
  }

  /** Picks a tax type; '' picks the blank Provincial option. */
  @step('Pick a tax type on a row')
  async pickType(row: Locator, kind: TypeKind, name: string): Promise<void> {
    await (await this.typePicker(row, kind)).click();
    await this.readOpenOptions();
    await this.page.locator(OPTION).filter({ hasText: new RegExp(`^\\s*${name}\\s*$`) }).first().click();
    await this.leaveCell();
  }

  /** Whether the row offers a Reg. Number input for the type (it appears once a type is set). */
  async hasRegInput(row: Locator, kind: TypeKind): Promise<boolean> {
    return (await this.cell(row, REG_COLUMN[kind])).locator('input').isVisible();
  }

  @step('Type a Reg. Number')
  async editReg(row: Locator, kind: TypeKind, value: string): Promise<string> {
    const input = (await this.cell(row, REG_COLUMN[kind])).locator('input');
    await input.fill(value);
    await this.leaveCell();
    return input.inputValue();
  }

  @step('Read the Reg. Number maximum length')
  async regMaxLength(row: Locator, kind: TypeKind): Promise<number> {
    return Number(await (await this.cell(row, REG_COLUMN[kind])).locator('input').getAttribute('maxlength'));
  }

  @step('Type an Effective Date')
  async editDate(row: Locator, mmddyyyy: string): Promise<string> {
    const input = (await this.cell(row, 'Effective Date')).locator('input');
    await input.fill(mmddyyyy);
    await this.leaveCell();
    return input.inputValue();
  }

  /** Opens the row's calendar and picks a day of the month it shows; returns the date in the cell. */
  @step('Pick an Effective Date from the calendar')
  async pickCalendarDay(row: Locator, day: number): Promise<{ shownMonth: string; value: string }> {
    const cell = await this.cell(row, 'Effective Date');
    await cell.locator(BTN_OPEN_CALENDAR).click();
    const month = this.page.locator(CALENDAR_MONTH).first();
    const shownMonth = (await month.getAttribute('aria-label')) ?? '';
    const [name, year] = shownMonth.split(' ');
    // Day buttons are named like "Sunday, January 20th, 2030"; days of the next or previous month
    // shown around this one carry another month's name.
    await month.getByRole('button', { name: new RegExp(`, ${name} ${day}(st|nd|rd|th), ${year}$`) }).click();
    await this.page.locator(POPOVER).waitFor({ state: 'hidden' });
    await this.leaveCell();
    return { shownMonth, value: await cell.locator('input').inputValue() };
  }

  /** The row's validation message, or null when the row is valid. */
  @step('Read the row validation message')
  async getRowAlert(row: Locator): Promise<string | null> {
    const alert = row.locator(ROW_ALERT);
    if (!(await alert.count())) return null;
    return (await alert.first().getAttribute('title')) ?? (await alert.first().locator('[title]').first().getAttribute('title'));
  }

  /** Every validation message on the row (a row can carry one per field). */
  @step('Read all validation messages of a row')
  async getRowMessages(row: Locator): Promise<string[]> {
    return row.locator('[title]').evaluateAll((els) => els.map((e) => e.getAttribute('title') ?? '').filter(Boolean));
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
    await toast.waitFor({ state: 'visible' });
    const records = (JSON.parse(sent.postData() ?? '[]') as { records: SavedRecord[] }[])[0]?.records ?? [];
    return { ok, toast: (await toast.innerText()).trim(), records };
  }

  /**
   * Answers every save in the browser with the server's success reply, so nothing is stored, until the
   * returned function is called. Used where a real save could not be undone.
   */
  async answerSavesWithSuccess(): Promise<() => Promise<void>> {
    const pattern = /international-tax-type-setup/;
    await this.page.route(pattern, (route) =>
      isSave(route.request())
        ? route.fulfill({ status: 200, contentType: 'text/x-component', body: SAVE_SUCCESS_REPLY })
        : route.continue(),
    );
    return () => this.page.unroute(pattern);
  }

  /** Makes every save fail at the network until the returned function is called. */
  async failSaves(): Promise<() => Promise<void>> {
    const pattern = /international-tax-type-setup/;
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

  /** Discards the edits; the action that asked (a search, say) then goes ahead. */
  @step('Choose Discard in the Unsaved changes dialog')
  async discard(): Promise<void> {
    await this.page.locator(BTN_DLG_DISCARD).click();
    await this.page.locator(DLG_UNSAVED).waitFor({ state: 'hidden' });
    await this.waitForResults();
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
