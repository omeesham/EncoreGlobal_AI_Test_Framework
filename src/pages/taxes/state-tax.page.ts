import { Locator, Page, Request, Route } from '@playwright/test';
import { step } from '../../fixtures/step-decorator';
import { BasePage } from '../base.page';
import { Log } from '../../utils/logger';
import { IConfig } from '../../types';
import { parseServerActionResult, replaceServerActionResult } from '../multiday-pricing/multiday-pricing-rules.page';
import {
  HEADING,
  TAB_BASIC,
  TAB_HISTORY,
  SEARCH_PANEL,
  CMB_STATE,
  CMB_TAX_TYPE,
  CMB_RATE,
  LISTBOX_OPTION,
  TXT_SEARCH_DATE,
  BTN_OPEN_CALENDAR,
  BTN_DATE_RANGE,
  DATE_POPOVER,
  calendarDay,
  BTN_SEARCH,
  BTN_RESET,
  SEARCH_INVALID,
  BTN_SAVE,
  GRID,
  HEADER_CELLS,
  BODY_ROWS,
  MENU,
  BTN_NEXT_PAGE,
  SEL_PAGE_SIZE,
  LOADING_INDICATOR,
  DLG_UNSAVED_CHANGES,
  TOAST,
  TOAST_ERROR,
  TOAST_SUCCESS,
  ERROR_SURFACE,
  lnkStateTax,
} from '../../selectors/taxes/state-tax';
import { STX_PATH, STX_MESSAGES, STX_TABS, StxColumn, toUiDate, fromUiDate } from '../../data/taxes/state-tax';

const READY_TIMEOUT_MS = 90_000;

// ---------------------------------------------------------------- types

/** One rendered grid row: cell text, or the input value of an editable cell, keyed by column header. */
export type GridRow = Record<string, string>;

/** One StateTax record as both searches answer it. */
export interface ApiStateTax {
  stateId: number;
  stateName: string;
  taxTypeId: number;
  taxTypeName: string;
  flatRate: number | null;
  taxablePercentage: number | null;
  effectiveDate: string;
  endDate: string;
  notes: string;
  updatedBy: string;
  updatedAt: string;
}

export interface SearchCapture {
  payload: Record<string, unknown>;
  records: ApiStateTax[];
  totalCount: number | null;
}

/** A save held at the network: its raw body and the records it carried. */
export interface CapturedSave {
  body: string;
  records: (ApiStateTax & { rowId?: string })[];
}

export type SaveMock = 'abort' | 'server-error' | 'delay-then-abort' | 'success';

export interface Criteria {
  state?: string;
  taxType?: string;
  rate?: string;
  /** ISO yyyy-mm-dd — Basic Information only. */
  date?: string;
}

// ---------------------------------------------------------------- transport classification
//
// Every State Tax call is a Next.js server action POSTed to the page URL, so requests are classified by
// payload shape (NM-4023 §2.2 lists the service routes the actions call behind the BFF).

export function isSearchRequest(req: Request): boolean {
  const b = req.method() === 'POST' ? req.postData() ?? '' : '';
  return b.includes('"pageSize"') && (b.includes('"effectiveDate"') || b.includes('"effectiveDateRangeStart"'));
}

export function isSaveRequest(req: Request): boolean {
  return req.method() === 'POST' && (req.postData() ?? '').startsWith('[{"records":');
}

type ActionEnvelope = { data?: { success?: boolean; data?: unknown; totalCount?: number; message?: string } };

const actionData = (text: string): ActionEnvelope['data'] | null => parseServerActionResult<ActionEnvelope>(text)?.data ?? null;

// Tax → State Tax. Nothing here persists data: every Save goes through interceptSave().
export class StateTaxPage extends BasePage {
  /** The last search request and its raw response body, captured by runSearch(). */
  private lastSearch: { payload: Record<string, unknown>; body: string } | null = null;

  /** True while mockSearch() owns the search response — runSearch() then leaves it alone. */
  private searchMocked = false;

  constructor(page: Page, config?: IConfig) {
    super(page, config);
    Log.info('StateTaxPage initialized');
  }

  // ---------------------------------------------------------------- regions & fields

  tab(name: keyof typeof STX_TABS): Locator {
    return this.page.locator(name === 'basic' ? TAB_BASIC : TAB_HISTORY);
  }

  searchPanel(): Locator {
    return this.page.locator(SEARCH_PANEL).first();
  }

  stateField(): Locator {
    return this.page.locator(CMB_STATE);
  }

  taxTypeField(): Locator {
    return this.page.locator(CMB_TAX_TYPE);
  }

  rateField(): Locator {
    return this.page.locator(CMB_RATE);
  }

  searchDateField(): Locator {
    return this.page.locator(TXT_SEARCH_DATE).first();
  }

  dateRangeButton(): Locator {
    return this.page.locator(BTN_DATE_RANGE);
  }

  searchButton(): Locator {
    return this.page.locator(BTN_SEARCH).first();
  }

  resetButton(): Locator {
    return this.page.locator(BTN_RESET).first();
  }

  saveButton(): Locator {
    return this.page.locator(BTN_SAVE);
  }

  grid(): Locator {
    return this.page.locator(GRID).first();
  }

  unsavedDialog(): Locator {
    return this.page.locator(DLG_UNSAVED_CHANGES);
  }

  /** The cell of a column in a rendered row, located by header text so a column reorder never shifts it. */
  async cell(row: number, column: StxColumn): Promise<Locator> {
    const idx = (await this.getHeaderLabels()).indexOf(column);
    if (idx < 0) throw new Error(`Column "${column}" is not rendered`);
    return this.grid().locator(BODY_ROWS).nth(row).locator(':scope > td').nth(idx);
  }

  // ---------------------------------------------------------------- navigation & readiness

  /** Opens the page from a clean first load: the last criteria (sessionStorage) and grid layout (localStorage) are dropped. */
  @step('Open the State Tax page for an office')
  async open(office: string): Promise<void> {
    await this.safeNavigateTo('about:blank');
    await this.navigateTo(`${this.config?.base_url || ''}${STX_PATH(office)}`, { timeout: 60_000 });
    const restored = await this.page.evaluate(() => {
      const keys = [...Object.keys(sessionStorage).filter((k) => /stateTax/.test(k)), ...Object.keys(localStorage).filter((k) => /state-tax/.test(k))];
      for (const k of keys) {
        sessionStorage.removeItem(k);
        localStorage.removeItem(k);
      }
      return keys.length > 0;
    });
    if (restored) await this.page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
    await this.waitForReady();
  }

  /** Reaches the page the way a user does: Tax group in the sidebar → State Tax. */
  @step('Open State Tax from the Tax menu')
  async openFromTaxMenu(office: string): Promise<void> {
    await this.safeNavigateTo('about:blank');
    await this.navigateTo(`${this.config?.base_url || ''}locations/${office}/home`, { timeout: 60_000 });
    await this.page.locator('main h1').first().waitFor({ state: 'visible', timeout: 60_000 });
    const link = this.page.locator(lnkStateTax(office)).filter({ visible: true }).first();
    if (!(await link.isVisible())) await this.page.getByRole('button', { name: 'Tax', exact: true }).first().click({ timeout: 30_000 });
    await link.click({ timeout: 15_000 });
    await this.page.waitForURL((u) => u.pathname.endsWith(`/${STX_PATH(office)}`), { timeout: 30_000 });
    await this.waitForReady();
  }

  @step('Wait for State Tax to finish loading')
  async waitForReady(timeout = READY_TIMEOUT_MS): Promise<void> {
    await this.page.locator(HEADING).first().waitFor({ state: 'visible', timeout });
    await this.searchButton().waitFor({ state: 'visible', timeout });
    // The filters render disabled while their lookups load; visible is not yet usable.
    await this.page.waitForFunction((sel) => !!document.querySelector(sel) && !document.querySelector(sel)!.hasAttribute('disabled'), CMB_TAX_TYPE, { timeout });
    await this.waitForIdle(timeout);
  }

  private async waitForIdle(timeout = READY_TIMEOUT_MS): Promise<void> {
    await this.page.waitForFunction((sel) => document.querySelectorAll(sel).length === 0, LOADING_INDICATOR, { timeout });
  }

  @step('Read the page heading')
  async getHeading(): Promise<string> {
    return ((await this.page.locator(HEADING).first().textContent()) ?? '').trim();
  }

  @step('Check whether a loading indicator is shown')
  async isLoadingVisible(): Promise<boolean> {
    return (await this.page.locator(LOADING_INDICATOR).count()) > 0;
  }

  @step('Switch tab')
  async switchTab(name: keyof typeof STX_TABS): Promise<void> {
    await this.tab(name).click();
    await this.page.waitForFunction((sel) => document.querySelector(sel)?.getAttribute('aria-selected') === 'true', name === 'basic' ? TAB_BASIC : TAB_HISTORY);
    await this.waitForReady();
  }

  @step('Read which tab is active')
  async activeTab(): Promise<string> {
    return ((await this.page.locator('[role="tab"][aria-selected="true"]').first().textContent()) ?? '').trim();
  }

  // ---------------------------------------------------------------- criteria

  private async readTrigger(field: Locator): Promise<string> {
    return ((await field.textContent()) ?? '').replace(/\s+/g, ' ').trim();
  }

  @step('Read the selected criteria')
  async getCriteria(): Promise<{ state: string; taxType: string; rate: string }> {
    return { state: await this.readTrigger(this.stateField()), taxType: await this.readTrigger(this.taxTypeField()), rate: await this.readTrigger(this.rateField()) };
  }

  /** Opens a filter, reads its options and closes it again. */
  @step('Read the options of a filter')
  async readOptions(field: Locator): Promise<string[]> {
    await field.click();
    const options = this.page.locator(LISTBOX_OPTION);
    await options.first().waitFor({ state: 'visible', timeout: 15_000 });
    const texts = (await options.allInnerTexts()).map((t) => t.trim());
    await this.page.keyboard.press('Escape');
    await options.first().waitFor({ state: 'hidden' }).catch(() => undefined);
    return texts;
  }

  private async choose(field: Locator, value: string): Promise<void> {
    if ((await this.readTrigger(field)) === value) return;
    await field.click();
    await this.page.locator(LISTBOX_OPTION).filter({ hasText: new RegExp(`^\\s*${escapeRegExp(value)}\\s*$`) }).first().click({ timeout: 15_000 });
  }

  /** Sets any of State / Tax Type / Rate filter / as-of date; omitted criteria keep what the form holds. */
  @step('Set the search criteria')
  async setCriteria(c: Criteria): Promise<void> {
    if (c.state) await this.choose(this.stateField(), c.state);
    if (c.taxType) await this.choose(this.taxTypeField(), c.taxType);
    if (c.rate) await this.choose(this.rateField(), c.rate);
    if (c.date) await this.typeSearchDate(toUiDate(c.date));
  }

  /** Types raw text (a date, a blank, an impossible date) into the as-of date. */
  @step('Type text into the as-of Effective Date')
  async typeSearchDate(text: string): Promise<void> {
    await this.typeInto(this.searchDateField(), text);
    await this.searchDateField().press('Tab');
  }

  @step('Read the as-of Effective Date')
  async getSearchDate(): Promise<string | null> {
    return fromUiDate(await this.searchDateField().inputValue());
  }

  /** Picks the as-of date in its calendar instead of typing it. */
  @step('Pick the as-of Effective Date from the calendar')
  async pickSearchDate(iso: string): Promise<void> {
    await this.page.locator(BTN_OPEN_CALENDAR).first().click();
    await this.clickCalendarDay(iso);
  }

  @step('Read the History date range')
  async getDateRange(): Promise<{ start: string | null; end: string | null }> {
    const [a, b] = ((await this.dateRangeButton().textContent()) ?? '').trim().split(/\s+-\s+/);
    return { start: a ? fromUiDate(a) : null, end: b ? fromUiDate(b) : null };
  }

  /**
   * Picks a History range: a day before the current start moves the start, a day after it the end — so start
   * is picked first. A day that already IS an end is never clicked again: re-clicking it resets the range.
   */
  @step('Set the History date range')
  async setDateRange(startIso: string, endIso: string): Promise<void> {
    for (const [iso, which] of [[startIso, 'start'], [endIso, 'end']] as const) {
      if ((await this.getDateRange())[which] === iso) continue;
      await this.dateRangeButton().click();
      await this.clickCalendarDay(iso);
    }
  }

  private async clickCalendarDay(iso: string): Promise<void> {
    const pop = this.page.locator(DATE_POPOVER).last();
    await pop.waitFor({ state: 'visible' });
    const back = iso < (await pop.locator('td[data-day]').first().getAttribute('data-day'))!;
    const nav = pop.getByRole('button', { name: back ? /previous month/i : /next month/i });
    for (let i = 0; i < 400 && (await pop.locator(calendarDay(iso)).count()) === 0; i++) await nav.click();
    await pop.locator(calendarDay(iso)).click();
    await pop.waitFor({ state: 'hidden', timeout: 2_000 }).catch(() => this.page.keyboard.press('Escape'));
  }

  private async typeInto(field: Locator, text: string): Promise<void> {
    await field.click();
    await field.press('Control+A');
    await field.press('Backspace');
    // Long text (a note at its length limit) is typed without the per-key delay to stay inside the action timeout.
    if (text) await field.pressSequentially(text, { delay: text.length > 50 ? 0 : 20 });
  }

  // ---------------------------------------------------------------- search

  /**
   * Runs `trigger` and waits until the grid shows the answer, not just until it arrives: the records-found
   * counter must equal the answer's count and rows must be drawn (the Basic grid is virtualised, so not all of
   * them). Under mockSearch the mock owns the response and only the answer is awaited.
   */
  private async runSearch(trigger: () => Promise<void>): Promise<boolean> {
    this.lastSearch = null;
    const handler = async (route: Route): Promise<void> => {
      const req = route.request();
      if (!isSearchRequest(req) || this.searchMocked) return route.fallback();
      const response = await route.fetch();
      const text = await response.text();
      this.lastSearch = { payload: JSON.parse(req.postData() ?? '[{}]')[0], body: text };
      return route.fulfill({ response, body: text });
    };
    await this.page.route('**/*', handler);
    try {
      const answered = this.page.waitForResponse((r) => isSearchRequest(r.request()), { timeout: 60_000 }).then(() => true, () => false);
      await trigger();
      if (!(await answered)) return false;
      await this.waitForIdle();
      if (this.lastSearch) {
        const data = actionData((this.lastSearch as { body: string }).body);
        const n = data?.totalCount ?? (Array.isArray(data?.data) ? data!.data.length : 0);
        await this.page.waitForFunction(
          ({ n, re }) => {
            const m = (document.querySelector('main')?.textContent ?? '').match(new RegExp(re, 'i'));
            const rows = Array.from(document.querySelectorAll('main table tbody tr')).filter((tr) => tr.querySelectorAll('td').length > 1).length;
            return !!m && Number(m[1]) === n && (n === 0 ? rows === 0 : rows > 0);
          },
          { n, re: STX_MESSAGES.recordsFound.source },
          { timeout: 30_000 },
        );
      }
      return true;
    } finally {
      await this.page.unroute('**/*', handler);
    }
  }

  private lastCapture(): SearchCapture {
    const cap = this.lastSearch;
    if (!cap) throw new Error('No search answer was captured');
    const data = actionData(cap.body);
    const records = (data?.data as ApiStateTax[] | undefined) ?? [];
    return { payload: cap.payload, records, totalCount: data?.totalCount ?? records.length };
  }

  @step('Click Search and wait for the results')
  async clickSearchAndWait(): Promise<SearchCapture> {
    if (!(await this.runSearch(() => this.searchButton().click()))) throw new Error('Search was clicked but no search was answered within 60 s');
    return this.lastCapture();
  }

  /** Clicks Search without waiting — for validation, dialog and mocked cases. */
  @step('Click Search')
  async clickSearch(): Promise<void> {
    await this.searchButton().click();
  }

  @step('Search')
  async search(c: Criteria = {}): Promise<SearchCapture> {
    await this.setCriteria(c);
    return this.clickSearchAndWait();
  }

  @step('Search History over a date range')
  async searchHistory(range: { start: string; end: string }, c: Omit<Criteria, 'date'> = {}): Promise<SearchCapture> {
    await this.setCriteria(c);
    await this.setDateRange(range.start, range.end);
    return this.clickSearchAndWait();
  }

  @step('Read the search validation state')
  async readSearchValidation(): Promise<{ invalidFields: number; messages: string[]; searchEnabled: boolean }> {
    return {
      invalidFields: await this.searchPanel().locator('[aria-invalid="true"]').count(),
      messages: (await this.searchPanel().locator(SEARCH_INVALID).allInnerTexts()).map((t) => t.trim()).filter(Boolean),
      searchEnabled: await this.searchButton().isEnabled(),
    };
  }

  @step('Click Reset')
  async reset(): Promise<void> {
    await this.resetButton().click();
    await this.waitForIdle();
  }

  // ---------------------------------------------------------------- grid reads

  @step('Read the records-found count')
  async getRecordsFoundCount(): Promise<number | null> {
    const m = (await this.mainText()).match(STX_MESSAGES.recordsFound);
    return m ? parseInt(m[1]!, 10) : null;
  }

  @step('Read the grid column headers')
  async getHeaderLabels(): Promise<string[]> {
    return (await this.grid().locator(HEADER_CELLS).allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
  }

  /** Rendered data rows; an editable cell contributes its input's value. */
  @step('Read the rendered grid rows')
  async readGrid(): Promise<GridRow[]> {
    if ((await this.grid().count()) === 0) return [];
    return this.grid().evaluate((el) => {
      const norm = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();
      const heads = Array.from(el.querySelectorAll('thead th')).map((h) => norm(h.textContent));
      return Array.from(el.querySelectorAll('tbody tr'))
        .map((tr) => Array.from(tr.querySelectorAll(':scope > td')))
        .filter((cells) => cells.length > 1)
        .map((cells) => Object.fromEntries(heads.map((h, i) => {
          const input = cells[i]?.querySelector('input, textarea') as HTMLInputElement | null;
          return [h, input ? input.value : norm(cells[i]?.textContent)];
        }).filter(([h]) => h)));
    });
  }

  /** Index of the rendered row for a state / tax type pair. */
  @step('Find the grid row of a configuration')
  async rowIndexOf(state: string, taxType: string): Promise<number> {
    const i = (await this.readGrid()).findIndex((r) => r.State === state && r['Tax Type'] === taxType);
    if (i < 0) throw new Error(`No rendered row for ${state} / ${taxType}`);
    return i;
  }

  /** Whether a cell offers an enabled editor. */
  @step('Check whether a grid cell can be edited')
  async isCellEditable(row: number, column: StxColumn): Promise<boolean> {
    const editor = (await this.cell(row, column)).locator('input, textarea, select, [contenteditable="true"]');
    return (await editor.count()) > 0 && (await editor.first().isEditable());
  }

  @step('Read a grid cell')
  async readCell(row: number, column: StxColumn): Promise<string> {
    return (await this.readGrid())[row]?.[column] ?? '';
  }

  @step('Read the visible page text')
  async mainText(): Promise<string> {
    return (await this.page.locator('main').innerText()).replace(/\s+/g, ' ');
  }

  /** Sorts through the column header menu (Sort ascending / Sort descending / Hide column). */
  @step('Sort the grid by a column')
  async sortBy(column: StxColumn, direction: 'ascending' | 'descending'): Promise<void> {
    await this.grid().locator('thead').getByRole('button', { name: column, exact: true }).click();
    await this.page.locator(MENU).getByRole('menuitem', { name: direction === 'ascending' ? 'Sort ascending' : 'Sort descending' }).click();
    await this.page.locator(MENU).waitFor({ state: 'hidden' }).catch(() => undefined);
    await this.waitForIdle();
  }

  @step('Go to the next History page')
  async nextPage(): Promise<SearchCapture> {
    if (!(await this.runSearch(() => this.page.locator(BTN_NEXT_PAGE).click()))) throw new Error('No search was answered for the next page');
    return this.lastCapture();
  }

  /** Rows per page on History — changing it re-runs the search with the new pageSize. */
  @step('Choose the rows per page')
  async setPageSize(size: number): Promise<SearchCapture> {
    const choose = async (): Promise<void> => {
      await this.page.locator(SEL_PAGE_SIZE).first().click();
      await this.page.locator(LISTBOX_OPTION).filter({ hasText: new RegExp(`^\\s*${size}\\s*$`) }).first().click();
    };
    if (!(await this.runSearch(choose))) throw new Error(`No search was answered for ${size} rows per page`);
    return this.lastCapture();
  }

  // ---------------------------------------------------------------- in-grid editing

  /**
   * Types into an editable cell the way a user does (keystrokes — a programmatic fill() does not mark the row
   * dirty) and leaves it with blur(), so focus never lands on the next cell's editor.
   */
  @step('Edit a grid cell')
  async editCell(row: number, column: StxColumn, text: string): Promise<void> {
    const input = (await this.cell(row, column)).locator('input, textarea').first();
    await this.typeInto(input, text);
    await input.blur();
  }

  /** Focuses a cell's editor and leaves it without typing. */
  @step('Focus a grid cell and leave it untouched')
  async focusAndLeave(row: number, column: StxColumn): Promise<void> {
    const input = (await this.cell(row, column)).locator('input').first();
    await input.click();
    await input.blur();
  }

  @step('Check whether Save is enabled')
  async isSaveEnabled(): Promise<boolean> {
    return this.saveButton().isEnabled();
  }

  @step('Click Save')
  async clickSave(): Promise<void> {
    await this.saveButton().click();
  }

  /**
   * Holds the save instead of letting it write: 'abort' fails it at the network, 'server-error' answers 500,
   * 'delay-then-abort' holds it 4 s first (in-flight state), 'success' answers a success envelope built from the
   * last real server-action answer. Nothing reaches the database.
   */
  @step('Intercept the save request so nothing is written')
  async interceptSave(mode: SaveMock): Promise<CapturedSave[]> {
    const captured: CapturedSave[] = [];
    const template = this.lastSearch?.body;
    await this.page.route('**/*', async (route: Route) => {
      const req = route.request();
      if (!isSaveRequest(req)) return route.fallback();
      const body = req.postData() ?? '';
      captured.push({ body, records: (JSON.parse(body)[0]?.records ?? []) as CapturedSave['records'] });
      if (mode === 'server-error') return route.fulfill({ status: 500, contentType: 'text/plain', body: 'Internal Server Error' });
      if (mode === 'success' && template) {
        return route.fulfill({ status: 200, contentType: 'text/x-component', body: replaceServerActionResult(template, { data: { success: true } }) });
      }
      if (mode === 'delay-then-abort') await new Promise((r) => setTimeout(r, 4_000));
      return route.abort();
    });
    return captured;
  }

  /** Answers the unsaved-changes dialog. */
  @step('Answer the unsaved-changes dialog')
  async answerUnsavedDialog(choice: 'Stay' | 'Discard'): Promise<void> {
    await this.unsavedDialog().getByRole('button', { name: choice, exact: true }).click();
    await this.unsavedDialog().waitFor({ state: 'hidden' });
  }

  // ---------------------------------------------------------------- toasts & errors

  @step('Wait for a toast and read it')
  async waitForToast(type: 'success' | 'error' | 'any' = 'any', timeout = 30_000): Promise<string> {
    const toast = this.page.locator(type === 'success' ? TOAST_SUCCESS : type === 'error' ? TOAST_ERROR : TOAST).last();
    await toast.waitFor({ state: 'visible', timeout });
    return ((await toast.innerText()) ?? '').trim();
  }

  @step('Wait for an error to be shown')
  async waitForError(timeout = 30_000): Promise<string> {
    const err = this.page.locator(ERROR_SURFACE).last();
    await err.waitFor({ state: 'visible', timeout });
    return ((await err.innerText()) ?? '').trim();
  }

  @step('Check whether a success toast is shown')
  async isSuccessToastVisible(): Promise<boolean> {
    return (await this.page.locator(TOAST_SUCCESS).count()) > 0;
  }

  // ---------------------------------------------------------------- network control

  /** Kills or holds the search answer; 'delay' still lets the real read through. */
  @step('Control the search response')
  async mockSearch(mock: { kind: 'failure' } | { kind: 'delay'; ms: number }): Promise<void> {
    this.searchMocked = true;
    await this.page.route('**/*', async (route: Route) => {
      if (!isSearchRequest(route.request())) return route.fallback();
      if (mock.kind === 'failure') return route.fulfill({ status: 500, contentType: 'text/plain', body: 'Internal Server Error' });
      await new Promise((r) => setTimeout(r, mock.ms));
      return route.fallback();
    });
  }

  /** Records every search request body without changing it. */
  @step('Record the search requests')
  async recordSearches(): Promise<string[]> {
    const sent: string[] = [];
    this.page.on('request', (req) => {
      if (isSearchRequest(req)) sent.push(req.postData() ?? '');
    });
    return sent;
  }

  @step('Remove every network interception')
  async clearInterceptions(): Promise<void> {
    this.searchMocked = false;
    await this.page.unrouteAll({ behavior: 'ignoreErrors' });
  }

  // ---------------------------------------------------------------- page-level reads

  @step('Scan visible text for untranslated i18n keys')
  async findRawI18nKeys(): Promise<string[]> {
    const text = await this.page.locator('main').innerText();
    return [...new Set(text.match(/\b[a-z][a-zA-Z]+(?:\.[a-zA-Z][a-zA-Z0-9]+){2,}\b/g) ?? [])];
  }

  /** Accessible name of each control, from aria-label / aria-labelledby / <label> / button text / placeholder. */
  @step('Read the accessible names of controls')
  async accessibleNames(controls: Record<string, Locator>): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    for (const [key, loc] of Object.entries(controls)) {
      out[key] = await loc.evaluate((el) => {
        const by = el.getAttribute('aria-labelledby');
        const labelled = by ? by.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ') : '';
        const label = (el as HTMLInputElement).labels?.[0]?.textContent ?? '';
        return (el.getAttribute('aria-label') ?? (labelled || label || (el.tagName === 'BUTTON' ? el.textContent : '') || el.getAttribute('placeholder') || '')).replace(/\s+/g, ' ').trim();
      });
    }
    return out;
  }

  @step('Measure horizontal overflow of the page')
  async pageOverflows(): Promise<boolean> {
    return this.page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  }

  @step('Leave the page')
  async leave(): Promise<void> {
    await this.safeNavigateTo('about:blank');
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
