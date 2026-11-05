import { APIResponse, FileChooser, Locator, Page, Request, Route, request as playwrightRequest } from '@playwright/test';
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
  TXT_ZIP,
  CMB_STATE,
  CMB_COUNTY,
  CMB_CITY,
  LISTBOX_OPTION,
  TXT_SEARCH_DATE,
  BTN_DATE_RANGE,
  DATE_RANGE_POPOVER,
  calendarDay,
  BTN_SEARCH,
  BTN_RESET,
  SEARCH_INVALID,
  GRID,
  HEADER_CELLS,
  BODY_ROWS,
  MENU,
  BTN_IMPORT,
  FILE_INPUT,
  BTN_NEXT_PAGE,
  TXT_PAGE_NUMBER,
  SEL_PAGE_SIZE,
  BTN_GRID_OPTIONS,
  BTN_OPEN_CALENDAR,
  LOADING_INDICATOR,
  TOAST,
  TOAST_ERROR,
  TOAST_SUCCESS,
  ERROR_SURFACE,
  lnkSalesTax,
} from '../../selectors/taxes/sales-tax';
import { ST_PATH, ST_MESSAGES, ST_TABS, toUiDate, fromUiDate } from '../../data/taxes/sales-tax';

const READY_TIMEOUT_MS = 90_000;

/** County → City lookups take up to ~35 s for large counties on e2e (Los Angeles, 2026-11-04). */
const LOOKUP_TIMEOUT_MS = 90_000;

// ---------------------------------------------------------------- types

/** One rendered grid row, cell text keyed by column header. */
export type GridRow = Record<string, string>;

/** One SalesTax record as the search answers it. */
export interface ApiTaxRecord {
  zipCode: string;
  geoCode: string;
  stateId: number;
  stateName: string;
  countyId: number;
  countyName: string;
  cityId: number;
  cityName: string;
  stateTax: number;
  countyTax: number;
  countyLocalTax: number;
  cityTax: number;
  cityLocalTax: number;
  combinedTax: number;
  effectiveDate: string;
  updatedBy?: string;
  updatedAt?: string;
}

/** The arguments a search sent and what came back. */
export interface SearchCapture {
  payload: Record<string, unknown>;
  records: ApiTaxRecord[];
  totalCount: number | null;
}

/** A request held at the network: enough to inspect it and to replay it from another context. */
export interface CapturedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: Buffer | null;
  bodyText: string;
}

export type SearchMock = { kind: 'failure' } | { kind: 'delay'; ms: number };
export type ImportMock = 'abort' | 'server-error' | 'delay-then-error' | 'success';

export interface UploadFile {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

// ---------------------------------------------------------------- transport classification
//
// Every Sales Tax call is a Next.js server action POSTed to the page URL, so requests are classified by
// payload shape, never by route (NM-4021 §9 lists the service routes the actions call behind the BFF).

function body(req: Request): string {
  return req.postData() ?? '';
}

export function isImportRequest(req: Request): boolean {
  return req.method() === 'POST' && (req.headers()['content-type'] ?? '').includes('multipart/form-data');
}

export function isSearchRequest(req: Request): boolean {
  if (req.method() !== 'POST' || isImportRequest(req)) return false;
  const b = body(req);
  return b.includes('"pageSize"') && (b.includes('"effectiveDate"') || b.includes('"effectiveDateRangeStart"'));
}

export function isCountiesRequest(req: Request): boolean {
  return req.method() === 'POST' && /^\[\{"stateId":\d+\}\]$/.test(body(req));
}

export function isCitiesRequest(req: Request): boolean {
  return req.method() === 'POST' && /^\[\{"countyId":\d+\}\]$/.test(body(req));
}

/** A clean import result, in the shape the page reads (totals plus three message lists). */
const IMPORT_SUCCESS = { success: true, totalRows: 1, parsedRows: 1, insertedRows: 1, failedRows: 0, messages: [], validationErrors: [], errorMessages: [] };

/** Server import result (the inner `data` of the action envelope). */
export interface ImportResult {
  success: boolean;
  totalRows: number;
  parsedRows: number;
  insertedRows: number;
  failedRows: number;
  messages: string[];
  validationErrors: string[];
  errorMessages: string[];
}

type ActionEnvelope = { data?: { success?: boolean; data?: unknown; totalCount?: number; message?: string } };

function actionData(text: string): ActionEnvelope['data'] | null {
  return parseServerActionResult<ActionEnvelope>(text)?.data ?? null;
}

// Tax → Sales Tax. Nothing here persists data: a valid import is only ever sent to interceptImport().
export class SalesTaxPage extends BasePage {
  /** The last search request and its raw response body, captured by runSearch(). */
  private lastSearch: { payload: Record<string, unknown>; body: string } | null = null;

  /** True while mockSearch() owns the search response — runSearch() then leaves it alone. */
  private searchMocked = false;

  constructor(page: Page, config?: IConfig) {
    super(page, config);
    Log.info('SalesTaxPage initialized');
  }

  private url(office: string): string {
    return `${this.config?.base_url || ''}${ST_PATH(office)}`;
  }

  // ---------------------------------------------------------------- regions & fields

  searchPanel(): Locator {
    return this.page.locator(SEARCH_PANEL).first();
  }

  tab(name: keyof typeof ST_TABS): Locator {
    return this.page.locator(name === 'basic' ? TAB_BASIC : TAB_HISTORY);
  }

  zipField(): Locator {
    return this.page.locator(TXT_ZIP);
  }

  stateField(): Locator {
    return this.page.locator(CMB_STATE);
  }

  countyField(): Locator {
    return this.page.locator(CMB_COUNTY);
  }

  cityField(): Locator {
    return this.page.locator(CMB_CITY);
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

  importButton(): Locator {
    return this.page.locator(BTN_IMPORT).first();
  }

  grid(): Locator {
    return this.page.locator(GRID).first();
  }

  // ---------------------------------------------------------------- navigation & readiness

  /** Opens the page; one reload recovers a cold load that never renders (as International Tax Setup does). */
  @step('Open the Sales Tax page for an office')
  async open(office: string): Promise<void> {
    await this.safeNavigateTo('about:blank');
    await this.navigateTo(this.url(office), { timeout: 60_000 });
    // The page restores the last search (sessionStorage) and grid layout (localStorage) on load. Tests on the
    // shared worker page would inherit each other's criteria, so drop both and load again from clean.
    const restored = await this.page.evaluate(() => {
      const ours = (k: string): boolean => /salesTax|sales-tax/.test(k);
      const keys = [...Object.keys(sessionStorage).filter(ours), ...Object.keys(localStorage).filter(ours)];
      for (const k of keys) {
        sessionStorage.removeItem(k);
        localStorage.removeItem(k);
      }
      return keys.length > 0;
    });
    if (restored) await this.page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
    try {
      await this.waitForReady(60_000);
    } catch {
      Log.warn('[sales-tax] page did not render within 60 s — reloading once');
      await this.page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
      await this.waitForReady();
    }
  }

  /** Reaches the page the way a user does: Tax group in the sidebar → Sales Tax. */
  @step('Open Sales Tax from the Tax menu')
  async openFromTaxMenu(office: string): Promise<void> {
    await this.safeNavigateTo('about:blank');
    await this.navigateTo(`${this.config?.base_url || ''}locations/${office}/home`, { timeout: 60_000 });
    await this.page.locator('main h1').first().waitFor({ state: 'visible', timeout: 60_000 });
    const link = this.page.locator(lnkSalesTax(office)).filter({ visible: true }).first();
    if (!(await link.isVisible())) await this.page.getByRole('button', { name: 'Tax', exact: true }).first().click({ timeout: 30_000 });
    await link.waitFor({ state: 'visible', timeout: 15_000 });
    await link.click();
    await this.page.waitForURL((u) => u.pathname.endsWith(`/locations/${office}/taxes/sales-tax`), { timeout: 30_000 });
    await this.waitForReady();
  }

  @step('Wait for Sales Tax to finish loading')
  async waitForReady(timeout = READY_TIMEOUT_MS): Promise<void> {
    await this.page.locator(HEADING).first().waitFor({ state: 'visible', timeout });
    await this.searchButton().waitFor({ state: 'visible', timeout });
    await this.waitForEnabled(CMB_STATE, timeout);
    await this.waitForIdle(timeout);
  }

  /** The dropdowns render disabled while their lookup loads; visible is not yet usable. */
  private async waitForEnabled(selector: string, timeout = LOOKUP_TIMEOUT_MS): Promise<void> {
    await this.page.waitForFunction((sel) => {
      const el = document.querySelector(sel);
      return !!el && !el.hasAttribute('disabled');
    }, selector, { timeout });
  }

  /** No loading indicator in main. Does not require rows — an empty or never-run search is valid. */
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
  async switchTab(name: keyof typeof ST_TABS): Promise<void> {
    await this.tab(name).click();
    await this.page.waitForFunction((sel) => document.querySelector(sel)?.getAttribute('aria-selected') === 'true', name === 'basic' ? TAB_BASIC : TAB_HISTORY);
    // Zip Code, not State: a restored zip search leaves State locked on purpose.
    await this.waitForEnabled(TXT_ZIP);
    await this.waitForIdle();
  }

  @step('Read which tab is active')
  async activeTab(): Promise<string> {
    return ((await this.page.locator('[role="tab"][aria-selected="true"]').first().textContent()) ?? '').trim();
  }

  // ---------------------------------------------------------------- server-action capture

  /**
   * Runs `trigger` and returns the first server action answered for a request matching `match`. The body is
   * fetched inside a route because Chromium drops the first server-action body after a load, so
   * Response.text() is unreliable (seen on Multiday Pricing and International Tax Setup).
   */
  private async captureAction(match: (r: Request) => boolean, trigger: () => Promise<void>, timeout = 60_000): Promise<{ payload: unknown; body: string } | null> {
    let captured: { payload: unknown; body: string } | null = null;
    const handler = async (route: Route): Promise<void> => {
      const req = route.request();
      if (!match(req) || captured) return route.fallback();
      const response = await route.fetch();
      const text = await response.text();
      captured = { payload: isImportRequest(req) ? null : JSON.parse(req.postData() ?? '[null]')[0], body: text };
      return route.fulfill({ response, body: text });
    };
    await this.page.route('**/*', handler);
    try {
      const answered = this.page.waitForResponse((r) => match(r.request()), { timeout }).then(() => true, () => false);
      await trigger();
      await answered;
      return captured;
    } finally {
      await this.page.unroute('**/*', handler);
    }
  }

  // ---------------------------------------------------------------- dropdowns

  private async readTrigger(field: Locator): Promise<string> {
    return ((await field.textContent()) ?? '').replace(/\s+/g, ' ').trim();
  }

  @step('Read the selected location criteria')
  async getLocation(): Promise<{ state: string; county: string; city: string }> {
    return {
      state: await this.readTrigger(this.stateField()),
      county: await this.readTrigger(this.countyField()),
      city: await this.readTrigger(this.cityField()),
    };
  }

  @step('Check which search fields can be used')
  async fieldsEnabled(): Promise<{ zip: boolean; state: boolean; county: boolean; city: boolean; date: boolean }> {
    const enabled = async (l: Locator): Promise<boolean> => (await l.count()) > 0 && (await l.isEnabled());
    const date = (await this.searchDateField().count()) > 0 ? this.searchDateField() : this.dateRangeButton();
    return {
      zip: await enabled(this.zipField()),
      state: await enabled(this.stateField()),
      county: await enabled(this.countyField()),
      city: await enabled(this.cityField()),
      date: await enabled(date),
    };
  }

  private async readOptions(field: Locator): Promise<string[]> {
    await field.click();
    const options = this.page.locator(LISTBOX_OPTION);
    await options.first().waitFor({ state: 'visible', timeout: 15_000 });
    const texts = (await options.allInnerTexts()).map((t) => t.trim());
    await this.page.keyboard.press('Escape');
    await options.first().waitFor({ state: 'hidden' }).catch(() => undefined);
    return texts;
  }

  private async choose(field: Locator, value: string): Promise<void> {
    await field.click();
    const option = this.page.locator(LISTBOX_OPTION).filter({ hasText: new RegExp(`^\\s*${escapeRegExp(value)}\\s*$`) }).first();
    await option.waitFor({ state: 'visible', timeout: 15_000 });
    await option.click();
  }

  @step('Read the State options')
  async readStateOptions(): Promise<string[]> {
    return this.readOptions(this.stateField());
  }

  @step('Read the County options')
  async readCountyOptions(): Promise<string[]> {
    return this.readOptions(this.countyField());
  }

  @step('Read the City options')
  async readCityOptions(): Promise<string[]> {
    return this.readOptions(this.cityField());
  }

  /** Picks a State and waits until County is usable again; returns the counties the lookup answered. */
  @step('Select a State')
  async selectState(state: string): Promise<{ stateId: unknown; counties: string[] } | null> {
    const cap = await this.captureAction(isCountiesRequest, () => this.choose(this.stateField(), state), LOOKUP_TIMEOUT_MS);
    await this.waitForEnabled(CMB_COUNTY);
    await this.waitForIdle(LOOKUP_TIMEOUT_MS);
    if (!cap) return null;
    const list = actionData(cap.body)?.data as { countyName: string }[] | undefined;
    return { stateId: (cap.payload as { stateId: unknown }).stateId, counties: (list ?? []).map((c) => c.countyName) };
  }

  /** Picks a County and waits until City is usable; returns the cities the lookup answered. */
  @step('Select a County')
  async selectCounty(county: string): Promise<{ countyId: unknown; cities: string[] } | null> {
    const cap = await this.captureAction(isCitiesRequest, () => this.choose(this.countyField(), county), LOOKUP_TIMEOUT_MS);
    await this.waitForEnabled(CMB_CITY);
    await this.waitForIdle(LOOKUP_TIMEOUT_MS);
    if (!cap) return null;
    const list = actionData(cap.body)?.data as { cityName: string }[] | undefined;
    return { countyId: (cap.payload as { countyId: unknown }).countyId, cities: (list ?? []).map((c) => c.cityName) };
  }

  @step('Select a City')
  async selectCity(city: string): Promise<void> {
    await this.choose(this.cityField(), city);
  }

  // ---------------------------------------------------------------- zip & dates

  @step('Type a Zip Code')
  async typeZip(zip: string): Promise<void> {
    await this.zipField().fill('');
    if (zip) await this.zipField().pressSequentially(zip, { delay: 20 });
  }

  @step('Clear the Zip Code')
  async clearZip(): Promise<void> {
    await this.zipField().fill('');
  }

  @step('Read the Zip Code')
  async getZip(): Promise<string> {
    return this.zipField().inputValue();
  }

  private async typeDate(field: Locator, text: string): Promise<void> {
    await field.click();
    await field.press('Control+A');
    await field.press('Backspace');
    if (text.length > 0) await field.pressSequentially(text, { delay: 20 });
    await field.press('Tab');
  }

  @step('Set the as-of Effective Date')
  async setSearchDate(iso: string): Promise<void> {
    await this.typeDate(this.searchDateField(), toUiDate(iso));
  }

  /** Picks the as-of date in its one-month calendar instead of typing it. */
  @step('Pick the as-of Effective Date from the calendar')
  async pickSearchDate(iso: string): Promise<void> {
    await this.page.locator(BTN_OPEN_CALENDAR).first().click();
    const pop = this.page.locator(DATE_RANGE_POPOVER).last();
    await pop.waitFor({ state: 'visible' });
    const back = iso < (await pop.locator('td[data-day]').first().getAttribute('data-day'))!;
    const nav = pop.getByRole('button', { name: back ? /previous month/i : /next month/i });
    for (let i = 0; i < 400 && (await pop.locator(calendarDay(iso)).count()) === 0; i++) await nav.click();
    await pop.locator(calendarDay(iso)).click();
    await pop.waitFor({ state: 'hidden', timeout: 2_000 }).catch(() => this.page.keyboard.press('Escape'));
  }

  /** Types raw text (invalid dates, blanks) into the as-of date. */
  @step('Type text into the as-of Effective Date')
  async typeSearchDate(text: string): Promise<void> {
    await this.typeDate(this.searchDateField(), text);
  }

  @step('Read the as-of Effective Date')
  async getSearchDate(): Promise<string | null> {
    return fromUiDate(await this.searchDateField().inputValue());
  }

  /** History range as ISO dates, read from the trigger text "MM/DD/YYYY - MM/DD/YYYY". */
  @step('Read the History date range')
  async getDateRange(): Promise<{ start: string | null; end: string | null; text: string }> {
    const text = ((await this.dateRangeButton().textContent()) ?? '').trim();
    const [a, b] = text.split(/\s+-\s+/);
    return { start: a ? fromUiDate(a) : null, end: b ? fromUiDate(b) : null, text };
  }

  /**
   * Picks a History range in the two-month calendar. A click on a day before the current start moves the
   * start and closes the popover; a click after it moves the end — so start is picked first, then end. A day
   * that already IS an end of the range is never clicked again: re-clicking it resets the range.
   */
  @step('Set the History date range')
  async setDateRange(startIso: string, endIso: string): Promise<void> {
    for (const [iso, which] of [[startIso, 'start'], [endIso, 'end']] as const) {
      if ((await this.getDateRange())[which] === iso) continue;
      await this.dateRangeButton().click();
      const pop = this.page.locator(DATE_RANGE_POPOVER).last();
      await pop.waitFor({ state: 'visible' });
      const back = iso < (await pop.locator('td[data-day]').first().getAttribute('data-day'))!;
      const nav = pop.getByRole('button', { name: back ? 'Go to the Previous Month' : 'Go to the Next Month' });
      for (let i = 0; i < 400 && (await pop.locator(calendarDay(iso)).count()) === 0; i++) await nav.click();
      await pop.locator(calendarDay(iso)).click();
      await pop.waitFor({ state: 'hidden', timeout: 2_000 }).catch(() => this.page.keyboard.press('Escape'));
    }
  }

  // ---------------------------------------------------------------- search

  /**
   * Runs `trigger` and waits until the GRID shows the answer, not just until the answer arrives — React draws
   * the rows a moment after the response lands. The record count of the answer decides how many rows to wait
   * for; under mockSearch the mock owns the response, so the wait is "rows drawn, or an empty-state text".
   */
  private async runSearch(trigger: () => Promise<void>, answerTimeout = 60_000): Promise<boolean> {
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
      const answered = this.page.waitForResponse((r) => isSearchRequest(r.request()), { timeout: answerTimeout }).then(() => true, () => false);
      await trigger();
      if (!(await answered)) return false;
      await this.waitForIdle();
      const cap = this.lastSearch as { payload: Record<string, unknown>; body: string } | null;
      const records = cap ? (actionData(cap.body)?.data as unknown[] | undefined) : undefined;
      await this.waitForRenderedRows(Array.isArray(records) ? records.length : null);
      return true;
    } finally {
      await this.page.unroute('**/*', handler);
    }
  }

  private async waitForRenderedRows(expected: number | null): Promise<void> {
    await this.page.waitForFunction(
      ({ n, empties }) => {
        const rows = Array.from(document.querySelectorAll('main table tbody tr')).filter((tr) => tr.querySelectorAll('td').length > 1).length;
        const text = document.querySelector('main')?.textContent ?? '';
        if (n === null) return rows > 0 || empties.some((e) => text.includes(e));
        return rows === n;
      },
      { n: expected, empties: [ST_MESSAGES.emptyBasic, ST_MESSAGES.emptyHistory] },
      { timeout: 30_000 },
    );
  }

  private lastCapture(): SearchCapture {
    const cap = this.lastSearch;
    if (!cap) throw new Error('No search answer was captured');
    const data = actionData(cap.body);
    return { payload: cap.payload, records: (data?.data as ApiTaxRecord[] | undefined) ?? [], totalCount: data?.totalCount ?? null };
  }

  /** Clicks Search, waits until the grid shows the result and returns what was sent and answered. */
  @step('Click Search and wait for the results')
  async clickSearchAndWait(): Promise<SearchCapture> {
    if (!(await this.runSearch(() => this.searchButton().click()))) throw new Error('Search was clicked but no search request was answered within 60 s');
    return this.lastCapture();
  }

  /** Clicks Search without waiting — for validation and mocked cases. */
  @step('Click Search')
  async clickSearch(): Promise<void> {
    await this.searchButton().click();
  }

  @step('Search by Zip Code')
  async searchByZip(zip: string, asOf?: string): Promise<SearchCapture> {
    await this.typeZip(zip);
    if (asOf) await this.setSearchDate(asOf);
    return this.clickSearchAndWait();
  }

  /** County and City are optional — omitted means "All". */
  @step('Search by State, County and City')
  async searchByLocation(loc: { state: string; county?: string; city?: string }, asOf?: string): Promise<SearchCapture> {
    if ((await this.readTrigger(this.stateField())) !== loc.state) await this.selectState(loc.state);
    if (loc.county) await this.selectCounty(loc.county);
    if (loc.city) await this.selectCity(loc.city);
    if (asOf) await this.setSearchDate(asOf);
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

  // ---------------------------------------------------------------- grid

  @step('Read the records-found count')
  async getRecordsFoundCount(): Promise<number | null> {
    const label = this.page.locator('main').getByText(ST_MESSAGES.recordsFound).first();
    if (!(await label.isVisible().catch(() => false))) return null;
    const m = ((await label.textContent()) ?? '').match(ST_MESSAGES.recordsFound);
    return m ? parseInt(m[1]!, 10) : null;
  }

  @step('Read the grid column headers')
  async getHeaderLabels(): Promise<string[]> {
    const raw = await this.grid().locator(HEADER_CELLS).allInnerTexts();
    return raw.map((t) => t.replace(/\s+/g, ' ').trim()).filter((t) => t.length > 0);
  }

  /** Rendered data rows, each cell keyed by its header so a column reorder never shifts values. */
  @step('Read the rendered grid rows')
  async readGrid(): Promise<GridRow[]> {
    if ((await this.grid().count()) === 0) return [];
    return this.grid().evaluate((el) => {
      const norm = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();
      const heads = Array.from(el.querySelectorAll('thead th')).map((h) => norm(h.textContent));
      return Array.from(el.querySelectorAll('tbody tr'))
        .map((tr) => Array.from(tr.querySelectorAll(':scope > td')))
        .filter((cells) => cells.length > 1)
        .map((cells) => Object.fromEntries(heads.map((h, i) => [h, norm(cells[i]?.textContent)]).filter(([h]) => h)));
    });
  }

  @step('Read the visible page text')
  async mainText(): Promise<string> {
    return (await this.page.locator('main').innerText()).replace(/\s+/g, ' ');
  }

  /** Sorts through the column header menu (Sort ascending / Sort descending / Hide column). */
  @step('Sort the grid by a column')
  async sortBy(column: string, direction: 'ascending' | 'descending'): Promise<void> {
    await this.grid().locator('thead').getByRole('button', { name: column, exact: true }).click();
    await this.page.locator(MENU).getByRole('menuitem', { name: direction === 'ascending' ? 'Sort ascending' : 'Sort descending' }).click();
    await this.page.locator(MENU).waitFor({ state: 'hidden' }).catch(() => undefined);
    await this.waitForIdle();
  }

  @step('Go to the next results page')
  async nextPage(): Promise<SearchCapture> {
    if (!(await this.runSearch(() => this.page.locator(BTN_NEXT_PAGE).click()))) throw new Error('No search was answered for the next page');
    return this.lastCapture();
  }

  @step('Read the current page number')
  async getPageNumber(): Promise<string> {
    return this.page.locator(TXT_PAGE_NUMBER).inputValue();
  }

  /** Sorting is server-side: the header menu re-runs the search with sortBy / sortDescending. */
  @step('Sort the grid by a column and wait for the sorted results')
  async sortAndWait(column: string, direction: 'ascending' | 'descending'): Promise<SearchCapture> {
    if (!(await this.runSearch(() => this.sortBy(column, direction)))) throw new Error(`No search was answered for sorting by ${column}`);
    return this.lastCapture();
  }

  /** Rows per page (10 / 20 / 30 / 40 / 50) — changing it re-runs the search with the new pageSize. */
  @step('Choose the rows per page')
  async setPageSize(size: number): Promise<SearchCapture> {
    const trigger = this.page.locator(SEL_PAGE_SIZE).first();
    const choose = async (): Promise<void> => {
      await trigger.click();
      await this.page.locator(LISTBOX_OPTION).filter({ hasText: new RegExp(`^\\s*${size}\\s*$`) }).first().click();
    };
    if (!(await this.runSearch(choose))) throw new Error(`No search was answered for ${size} rows per page`);
    return this.lastCapture();
  }

  /** Grid Options → untick a column (the menu closes after each choice). */
  @step('Hide a grid column from Grid Options')
  async hideColumn(column: string): Promise<void> {
    await this.page.locator(BTN_GRID_OPTIONS).click();
    await this.page.locator(MENU).locator('[role="menuitemcheckbox"]').filter({ hasText: new RegExp(`^\\s*${escapeRegExp(column)}\\s*$`) }).click();
    await this.page.locator(MENU).waitFor({ state: 'hidden' }).catch(() => this.page.keyboard.press('Escape'));
  }

  @step('Reset the grid to its default view')
  async resetGridView(): Promise<void> {
    await this.page.locator(BTN_GRID_OPTIONS).click();
    await this.page.locator(MENU).getByRole('menuitem', { name: 'Reset to Default View' }).click();
    await this.page.locator(MENU).waitFor({ state: 'hidden' }).catch(() => this.page.keyboard.press('Escape'));
  }

  /** Double-clicks a grid cell and types — the inline-edit attempt NM-4021 §4.1 forbids. */
  @step('Try to edit a grid cell inline')
  async tryInlineEdit(rowIndex: number, column: string, text: string): Promise<{ editorAppeared: boolean }> {
    const idx = (await this.getHeaderLabels()).indexOf(column);
    if (idx < 0) throw new Error(`Column "${column}" is not rendered`);
    const cell = this.grid().locator(BODY_ROWS).nth(rowIndex).locator(':scope > td').nth(idx);
    await cell.dblclick();
    const editorAppeared = (await this.grid().locator('tbody').locator('input, textarea, select, [contenteditable="true"]').count()) > 0;
    await this.page.keyboard.type(text);
    await this.page.keyboard.press('Enter');
    return { editorAppeared };
  }

  // ---------------------------------------------------------------- import

  @step('Click Import and catch the file picker')
  async openFilePicker(): Promise<FileChooser> {
    const chooser = this.page.waitForEvent('filechooser', { timeout: 10_000 });
    await this.importButton().click();
    return chooser;
  }

  /** Hands a file to the import input — what choosing it in the picker does. */
  @step('Choose a file to import')
  async chooseImportFile(file: UploadFile): Promise<void> {
    await this.page.locator(FILE_INPUT).setInputFiles(file);
  }

  /**
   * Holds the import request instead of letting it write: 'abort' fails it at the network, 'server-error'
   * answers 500, 'delay-then-error' holds it 5 s first (in-flight state), 'success' answers a successful
   * import envelope built from the last real server-action answer. Nothing reaches the database.
   */
  @step('Intercept the import request so nothing is written')
  async interceptImport(mode: ImportMock): Promise<CapturedRequest[]> {
    const captured: CapturedRequest[] = [];
    const template = this.lastSearch?.body;
    await this.page.route('**/*', async (route: Route) => {
      const req = route.request();
      if (!isImportRequest(req)) return route.fallback();
      captured.push({ url: req.url(), method: req.method(), headers: req.headers(), body: req.postDataBuffer(), bodyText: req.postData() ?? '' });
      if (mode === 'abort') return route.abort();
      if (mode === 'delay-then-error') await new Promise((r) => setTimeout(r, 5_000));
      if (mode === 'success' && template) {
        return route.fulfill({ status: 200, contentType: 'text/x-component', body: replaceServerActionResult(template, { data: { success: true, data: IMPORT_SUCCESS } }) });
      }
      return route.fulfill({ status: 500, contentType: 'text/plain', body: 'Internal Server Error' });
    });
    return captured;
  }

  /** Waits until the real import answer lands and returns its result envelope — for server-rejected files. */
  @step('Import a file and read the server answer')
  async importAndReadAnswer(file: UploadFile): Promise<ImportResult | null> {
    const cap = await this.captureAction(isImportRequest, () => this.chooseImportFile(file), 90_000);
    return cap ? ((actionData(cap.body)?.data as ImportResult | undefined) ?? null) : null;
  }

  /** The "Import Failed" panel the page opens for rejected rows: its title and each (#, error) line; closes it. */
  @step('Read the import result panel')
  async readImportResult(): Promise<{ title: string; rows: string[] }> {
    const panel = this.page.locator('[role="dialog"], [role="alertdialog"]').filter({ hasText: 'Validation Errors' }).last();
    await panel.waitFor({ state: 'visible', timeout: 30_000 });
    const result = {
      title: ((await panel.locator('h2, [data-slot$="title"]').first().textContent()) ?? '').trim(),
      rows: (await panel.locator('tbody tr').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()),
    };
    await panel.getByRole('button', { name: 'Close' }).first().click();
    await panel.waitFor({ state: 'hidden' });
    return result;
  }

  /** Re-sends a captured request from a context with no session cookies. */
  @step('Replay a request without a session')
  async replayWithoutSession(req: CapturedRequest): Promise<{ status: number; result: ActionEnvelope['data'] | null; redirect: string | null }> {
    const ctx = await playwrightRequest.newContext({ storageState: { cookies: [], origins: [] } });
    try {
      const headers = Object.fromEntries(Object.entries(req.headers).filter(([k]) => !/^(cookie|content-length|host)$/i.test(k)));
      const res: APIResponse = await ctx.fetch(req.url, { method: req.method, headers, data: req.body ?? undefined, maxRedirects: 0, failOnStatusCode: false });
      const text = await res.text();
      const digest = text.match(/NEXT_REDIRECT;[a-z]+;([^;"]+)/);
      return { status: res.status(), result: actionData(text), redirect: res.headers()['location'] ?? digest?.[1] ?? null };
    } finally {
      await ctx.dispose();
    }
  }

  // ---------------------------------------------------------------- toasts

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

  // ---------------------------------------------------------------- network control

  /** Kills or holds the search answer; 'delay' still lets the real read through. */
  @step('Control the search response')
  async mockSearch(mock: SearchMock): Promise<void> {
    this.searchMocked = true;
    await this.page.route('**/*', async (route: Route) => {
      if (!isSearchRequest(route.request())) return route.fallback();
      if (mock.kind === 'failure') return route.fulfill({ status: 500, contentType: 'text/plain', body: 'Internal Server Error' });
      await new Promise((r) => setTimeout(r, mock.ms));
      return route.fallback();
    });
  }

  /** Records every search request without changing it. */
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

  /** Visible text fragments that look like untranslated i18n keys (e.g. "taxes.salesTax.x"). */
  @step('Scan visible text for untranslated i18n keys')
  async findRawI18nKeys(): Promise<string[]> {
    const text = await this.page.locator('main').innerText();
    return [...new Set(text.match(/\b[a-z][a-zA-Z]+(?:\.[a-zA-Z][a-zA-Z0-9]+){2,}\b/g) ?? [])];
  }

  /** Accessible name of each search control, keyed by its visible label. */
  @step('Read the accessible names of the search controls')
  async readControlAccessibleNames(): Promise<Record<string, string>> {
    const name = (loc: Locator): Promise<string> =>
      loc.evaluate((el) => {
        const labelled = el.getAttribute('aria-labelledby');
        const byId = labelled ? labelled.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ') : '';
        const label = (el as HTMLInputElement).labels?.[0]?.textContent ?? '';
        return (el.getAttribute('aria-label') ?? (byId || label || (el.tagName === 'BUTTON' ? el.textContent : '') || el.getAttribute('placeholder') || '')).replace(/\s+/g, ' ').trim();
      });
    return {
      'Zip Code': await name(this.zipField()),
      State: await name(this.stateField()),
      County: await name(this.countyField()),
      City: await name(this.cityField()),
      'Effective Date': await name(this.searchDateField()),
      Reset: await name(this.resetButton()),
      Search: await name(this.searchButton()),
      Import: await name(this.importButton()),
    };
  }

  @step('Measure horizontal overflow of the page')
  async measureOverflow(): Promise<{ pageOverflows: boolean }> {
    return this.page.evaluate(() => ({ pageOverflows: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 }));
  }

  @step('Leave the page')
  async leave(): Promise<void> {
    await this.safeNavigateTo('about:blank');
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
