import { Dialog, Locator, Page, Request, Response, Route } from '@playwright/test';
import { step } from '../../fixtures/step-decorator';
import { BasePage } from '../base.page';
import { Log } from '../../utils/logger';
import { IConfig } from '../../types';
import { parseServerActionResult, replaceServerActionResult } from '../multiday-pricing/multiday-pricing-rules.page';
import {
  HEADING,
  SEARCH_PANEL,
  CMB_COUNTRY,
  CMB_TAX_GROUP,
  CMB_PROVINCE,
  TXT_SEARCH_DATE,
  UPDATE_PANEL,
  TXT_RATE,
  TXT_UPDATE_DATE,
  CHK_COMMISSION_TAXABLE,
  LISTBOX_OPTION,
  BTN_SEARCH,
  BTN_RESET,
  BTN_APPLY,
  BTN_SAVE,
  SEARCH_INVALID,
  GRID,
  HEADER_CELLS,
  BODY_ROWS,
  ROW_CHECKBOX,
  CHK_SELECT_ALL,
  MENU,
  LOADING_INDICATOR,
  DLG_UNSAVED_CHANGES,
  TOAST,
  TOAST_ERROR,
  TOAST_SUCCESS,
  ERROR_SURFACE,
  lnkInternationalTaxSetup,
} from '../../selectors/taxes/international-tax-setup';
import {
  IST_PATH,
  IST_MESSAGES,
  SearchCriteria,
  toUiDate,
  fromUiDate,
  wireDate,
} from '../../data/taxes/international-tax-setup';

const READY_TIMEOUT_MS = 90_000;

// ---------------------------------------------------------------- types

/** One rendered grid row. `effectiveDate` is ISO yyyy-mm-dd. */
export interface TaxRow {
  taxType: string;
  rateText: string;
  /** The number shown before "%", exactly as displayed — no assumption about storage scale. */
  rate: number | null;
  province: string;
  effectiveDate: string | null;
  commissionTaxable: boolean;
  pending: boolean;
  selected: boolean;
}

/** One InternationalTax record from a search response or save payload, keys matched loosely. */
export interface TaxRecord {
  id: unknown;
  taxType: string | null;
  rate: number | null;
  effectiveDate: string | null;
  commissionTaxable: boolean | null;
  createUser: string | null;
  modUser: string | null;
  raw: Record<string, unknown>;
}

/** A request held at the network: enough to inspect it and to replay it from another context. */
export interface CapturedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
  records: TaxRecord[];
}

export type SaveInterceptMode = 'abort' | 'server-error' | 'delay-then-abort';

export type SearchMock =
  | { kind: 'empty' }
  | { kind: 'failure' }
  | { kind: 'abort' }
  | { kind: 'delay'; ms: number }
  | { kind: 'delay-first'; ms: number };

// ---------------------------------------------------------------- transport classification
//
// NM-4025 §10.2: the service routes (POST /api/tax/international/search, POST /api/tax/international)
// may be reached directly, through a BFF, or through a Next.js server action (as Multiday Pricing
// is). Requests are therefore classified by route OR by payload shape, never by route alone.

function lowerBody(req: Request): string {
  return (req.postData() ?? '').toLowerCase();
}

export function isSaveRequest(req: Request): boolean {
  if (req.method() !== 'POST') return false;
  return /\/api\/tax\/international\/?(\?|$)/i.test(req.url()) || lowerBody(req).includes('internationaltaxes');
}

export function isSearchRequest(req: Request): boolean {
  if (req.method() !== 'POST' || isSaveRequest(req)) return false;
  if (/\/api\/tax\/international\/search/i.test(req.url())) return true;
  const body = lowerBody(req);
  return body.includes('effectivedate') && body.includes('countrysubdivisionid');
}

export function isGroupsRequest(req: Request): boolean {
  return /\/api\/tax\/international\/groups/i.test(req.url());
}

// ---------------------------------------------------------------- payload helpers (no page needed)

function parseLoose(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return parseServerActionResult(text);
  }
}

function pick(obj: Record<string, unknown>, re: RegExp): unknown {
  const key = Object.keys(obj).find((k) => re.test(k));
  return key === undefined ? undefined : obj[key];
}

function looksLikeTaxRecord(v: unknown): v is Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const keys = Object.keys(v).join(' ').toLowerCase();
  return keys.includes('rate') && keys.includes('effectivedate');
}

/** First array of InternationalTax-shaped objects anywhere in `value` (depth-first). */
export function findTaxRecords(value: unknown): Record<string, unknown>[] | null {
  if (Array.isArray(value)) {
    if (value.length > 0 && value.every(looksLikeTaxRecord)) return value as Record<string, unknown>[];
    for (const item of value) {
      const hit = findTaxRecords(item);
      if (hit) return hit;
    }
    return null;
  }
  if (typeof value === 'object' && value !== null) {
    for (const v of Object.values(value)) {
      const hit = findTaxRecords(v);
      if (hit) return hit;
    }
  }
  return null;
}

/** Same structure with the first InternationalTax array replaced — used to fake an empty result. */
function replaceTaxRecords(value: unknown, replacement: unknown[]): unknown {
  const target = findTaxRecords(value);
  if (!target) return value;
  const walk = (v: unknown): unknown => {
    if (v === target) return replacement;
    if (Array.isArray(v)) return v.map(walk);
    if (typeof v === 'object' && v !== null) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(value);
}

export function normalizeTaxRecord(raw: Record<string, unknown>): TaxRecord {
  const typeValue = pick(raw, /^(taxtype(name|description)?|internationaltaxtype(name|description)?|name|description)$/i);
  const rateValue = pick(raw, /^(rate|taxrate|percent(age)?)$/i);
  const commission = pick(raw, /commission/i);
  const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
  return {
    id: pick(raw, /^(internationaltaxid|id)$/i) ?? null,
    taxType: str(typeValue),
    rate: typeof rateValue === 'number' ? rateValue : typeof rateValue === 'string' && rateValue.trim() !== '' ? Number(rateValue) : null,
    effectiveDate: wireDate(pick(raw, /^effectivedate$/i)),
    commissionTaxable: typeof commission === 'boolean' ? commission : null,
    createUser: str(pick(raw, /^createuser$/i)),
    modUser: str(pick(raw, /^moduser$/i)),
    raw,
  };
}

/** The InternationalTax records of a save payload (InternationalTaxes list). */
export function saveRecordsOf(body: string): TaxRecord[] {
  return (findTaxRecords(parseLoose(body)) ?? []).map(normalizeTaxRecord);
}

/** A copy of a save body with every EffectiveDate set to `iso`, keeping the original wire format. */
export function withEffectiveDate(body: string, iso: string): string {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (typeof v === 'object' && v !== null) {
      return Object.fromEntries(
        Object.entries(v).map(([k, x]) => [
          k,
          /^effectivedate$/i.test(k) && typeof x === 'string' ? x.replace(/\d{4}-\d{2}-\d{2}/, iso) : walk(x),
        ]),
      );
    }
    return v;
  };
  return JSON.stringify(walk(JSON.parse(body)));
}

// Tax → International Tax Setup. One page object for every role: a read-only user gets the same
// search and grid, and the mutation controls are hidden or disabled (either is allowed, NM-4025 §5.2).
export class InternationalTaxSetupPage extends BasePage {
  /** Set once a search request has been seen in browser traffic — decides how searches are awaited. */
  private searchTransportSeen = false;

  constructor(page: Page, config?: IConfig) {
    super(page, config);
    page.on('request', (req) => {
      if (isSearchRequest(req)) this.searchTransportSeen = true;
    });
    Log.info('InternationalTaxSetupPage initialized');
  }

  private url(office: string): string {
    return `${this.config?.base_url || ''}${IST_PATH(office)}`;
  }

  // ---------------------------------------------------------------- regions & fields

  searchPanel(): Locator {
    return this.page.locator(SEARCH_PANEL).first();
  }

  updatePanel(): Locator {
    return this.page.locator(UPDATE_PANEL).first();
  }

  countryField(): Locator {
    return this.page.locator(CMB_COUNTRY);
  }

  taxGroupField(): Locator {
    return this.page.locator(CMB_TAX_GROUP);
  }

  provinceField(): Locator {
    return this.page.locator(CMB_PROVINCE);
  }

  searchDateField(): Locator {
    return this.page.locator(TXT_SEARCH_DATE).first();
  }

  rateField(): Locator {
    return this.page.locator(TXT_RATE);
  }

  updateDateField(): Locator {
    return this.page.locator(TXT_UPDATE_DATE).first();
  }

  commissionField(): Locator {
    return this.page.locator(CHK_COMMISSION_TAXABLE);
  }

  searchButton(): Locator {
    return this.page.locator(BTN_SEARCH);
  }

  resetButton(): Locator {
    return this.page.locator(BTN_RESET);
  }

  /** The update-section Apply BUTTON — never the grid's Apply column header. */
  applyButton(): Locator {
    return this.page.locator(BTN_APPLY).first();
  }

  saveButton(): Locator {
    return this.page.locator(BTN_SAVE).first();
  }

  // ---------------------------------------------------------------- navigation & readiness

  /**
   * Opens the page. e2e occasionally serves a cold load that never renders the heading (seen once in
   * 172 runs, 2026-10-22); one reload recovers it, so the case fails only if the page is really down.
   */
  @step('Open the International Tax Setup page for an office')
  async open(office: string): Promise<void> {
    await this.safeNavigateTo('about:blank');
    await this.navigateTo(this.url(office), { timeout: 60_000 });
    try {
      await this.waitForReady(60_000);
    } catch {
      Log.warn('[ist] page did not render within 60 s — reloading once');
      await this.page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
      await this.waitForReady();
    }
  }

  /** Reaches the page the way a user does: Tax group in the sidebar → International Tax Setup. */
  @step('Open International Tax Setup from the Tax menu')
  async openFromTaxMenu(office: string): Promise<void> {
    await this.safeNavigateTo('about:blank');
    await this.navigateTo(`${this.config?.base_url || ''}locations/${office}/home`, { timeout: 60_000 });
    await this.page.locator('main h1').first().waitFor({ state: 'visible', timeout: 60_000 });
    const link = this.page.locator(lnkInternationalTaxSetup(office)).filter({ visible: true }).first();
    if (!(await link.isVisible())) await this.sidebarTax().click({ timeout: 30_000 });
    await link.waitFor({ state: 'visible', timeout: 15_000 });
    await link.click();
    await this.page.waitForURL((u) => u.pathname.endsWith(`/locations/${office}/taxes/international-tax-setup`), { timeout: 30_000 });
    await this.waitForReady();
  }

  private sidebarTax(): Locator {
    return this.page.getByRole('button', { name: 'Tax', exact: true }).first();
  }

  /** Whether the Tax menu offers International Tax Setup (permission gating of the menu). */
  @step('Check whether the Tax menu offers International Tax Setup')
  async isMenuEntryVisible(office: string): Promise<boolean> {
    await this.navigateTo(`${this.config?.base_url || ''}locations/${office}/home`, { timeout: 60_000 });
    await this.page.locator('main h1').first().waitFor({ state: 'visible', timeout: 60_000 });
    const tax = this.sidebarTax();
    if (await tax.isVisible().catch(() => false)) await tax.click();
    return this.page.locator(lnkInternationalTaxSetup(office)).filter({ visible: true }).first()
      .waitFor({ state: 'visible', timeout: 5_000 }).then(() => true, () => false);
  }

  @step('Wait for International Tax Setup to finish loading')
  async waitForReady(timeout = READY_TIMEOUT_MS): Promise<void> {
    await this.page.locator(HEADING).first().waitFor({ state: 'visible', timeout });
    await this.searchButton().waitFor({ state: 'visible', timeout });
    await this.waitForIdleGrid(timeout);
  }

  /** No loading indicator in main. Does not require rows — an empty or never-run search is valid. */
  private async waitForIdleGrid(timeout = READY_TIMEOUT_MS): Promise<void> {
    await this.page.waitForFunction((sel) => document.querySelectorAll(sel).length === 0, LOADING_INDICATOR, { timeout });
  }

  @step('Read the page heading')
  async getHeading(): Promise<string> {
    return ((await this.page.locator(HEADING).first().textContent()) ?? '').trim();
  }

  @step('Check whether the page heading is shown')
  async isHeadingVisible(): Promise<boolean> {
    return this.page.locator(HEADING).first().isVisible();
  }

  @step('Check whether a loading indicator is shown')
  async isLoadingVisible(): Promise<boolean> {
    return (await this.page.locator(LOADING_INDICATOR).count()) > 0;
  }

  // ---------------------------------------------------------------- dropdowns

  private async isNativeSelect(field: Locator): Promise<boolean> {
    return field.evaluate((el) => el.tagName === 'SELECT');
  }

  private async readSelected(field: Locator): Promise<string> {
    if (await this.isNativeSelect(field)) {
      return field.evaluate((el) => ((el as HTMLSelectElement).selectedOptions[0]?.textContent ?? '').trim());
    }
    return ((await field.textContent()) ?? '').replace(/\s+/g, ' ').trim();
  }

  private async readOptions(field: Locator): Promise<string[]> {
    if (await this.isNativeSelect(field)) {
      return field.evaluate((el) => Array.from((el as HTMLSelectElement).options).filter((o) => o.value !== '').map((o) => (o.textContent ?? '').trim()));
    }
    await field.click();
    const options = this.page.locator(LISTBOX_OPTION);
    await options.first().waitFor({ state: 'visible', timeout: 15_000 });
    const texts = (await options.allInnerTexts()).map((t) => t.trim());
    await this.page.keyboard.press('Escape');
    await options.first().waitFor({ state: 'hidden' }).catch(() => undefined);
    return texts;
  }

  /** Picks `value`, or the first offered option when null. Returns the text actually chosen. */
  private async choose(field: Locator, value: string | null): Promise<string> {
    if (await this.isNativeSelect(field)) {
      const target = value ?? (await this.readOptions(field))[0];
      if (!target) throw new Error('Dropdown offers no options');
      await field.selectOption({ label: target });
      return target;
    }
    await field.click();
    const options = this.page.locator(LISTBOX_OPTION);
    await options.first().waitFor({ state: 'visible', timeout: 15_000 });
    const option = value === null ? options.first() : options.filter({ hasText: new RegExp(`^\\s*${escapeRegExp(value)}\\s*$`) }).first();
    const text = ((await option.textContent()) ?? '').trim();
    await option.click();
    return text;
  }

  @step('Select a Country')
  async selectCountry(country: string): Promise<string> {
    return this.choose(this.countryField(), country);
  }

  @step('Select a Tax Group')
  async selectTaxGroup(taxGroup: string | null): Promise<string> {
    return this.choose(this.taxGroupField(), taxGroup);
  }

  @step('Select a Province')
  async selectProvince(province: string | null): Promise<string> {
    return this.choose(this.provinceField(), province);
  }

  @step('Read the selected search criteria')
  async getSelectedCriteria(): Promise<{ country: string; taxGroup: string; province: string; date: string | null }> {
    return {
      country: await this.readSelected(this.countryField()),
      taxGroup: await this.readSelected(this.taxGroupField()),
      province: await this.readSelected(this.provinceField()),
      date: await this.getSearchEffectiveDate(),
    };
  }

  @step('Read the Country options')
  async readCountryOptions(): Promise<string[]> {
    return this.readOptions(this.countryField());
  }

  @step('Read the Tax Group options')
  async readTaxGroupOptions(): Promise<string[]> {
    return this.readOptions(this.taxGroupField());
  }

  @step('Read the Province options')
  async readProvinceOptions(): Promise<string[]> {
    return this.readOptions(this.provinceField());
  }

  @step('Check whether Tax Group and Province can be used')
  async dependentFieldsEnabled(): Promise<{ taxGroup: boolean; province: boolean }> {
    return { taxGroup: await this.taxGroupField().isEnabled(), province: await this.provinceField().isEnabled() };
  }

  // ---------------------------------------------------------------- dates

  private async typeDate(field: Locator, text: string): Promise<void> {
    await field.click();
    await field.press('Control+A');
    await field.press('Backspace');
    if (text.length > 0) await field.pressSequentially(text, { delay: 20 });
    await field.press('Tab');
  }

  @step('Set the Search Effective Date')
  async setSearchEffectiveDate(iso: string): Promise<void> {
    await this.typeDate(this.searchDateField(), toUiDate(iso));
  }

  /** Types raw text (invalid dates, blanks) into the search date. */
  @step('Type text into the Search Effective Date')
  async typeSearchEffectiveDate(text: string): Promise<void> {
    await this.typeDate(this.searchDateField(), text);
  }

  @step('Read the Search Effective Date')
  async getSearchEffectiveDate(): Promise<string | null> {
    return fromUiDate(await this.searchDateField().inputValue());
  }

  @step('Set the update Effective Date')
  async setUpdateEffectiveDate(iso: string): Promise<void> {
    await this.typeDate(this.updateDateField(), toUiDate(iso));
  }

  @step('Read the update Effective Date')
  async getUpdateEffectiveDate(): Promise<string | null> {
    return fromUiDate(await this.updateDateField().inputValue());
  }

  // ---------------------------------------------------------------- search

  /**
   * Clicks Search and waits for the result. When the search call is visible in browser traffic it
   * waits for that response; otherwise (server-side BFF) it waits for the network to settle.
   * Returns the response when one was seen.
   */
  @step('Click Search and wait for the results')
  async clickSearchAndWait(): Promise<Response | null> {
    if (this.searchTransportSeen) {
      const [res] = await Promise.all([
        this.page.waitForResponse((r) => isSearchRequest(r.request()), { timeout: 60_000 }),
        this.searchButton().click(),
      ]);
      await this.waitForIdleGrid();
      return res;
    }
    const pending = this.page.waitForResponse((r) => isSearchRequest(r.request()), { timeout: 15_000 }).catch(() => null);
    await this.searchButton().click();
    const res = await pending;
    if (!res) await this.page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
    await this.waitForIdleGrid();
    return res;
  }

  /** Clicks Search without waiting — for validation and dirty-state cases. */
  @step('Click Search')
  async clickSearch(): Promise<void> {
    await this.searchButton().click();
  }

  /**
   * Clicks Search only if the app allows it. The form disables Search until Country, Tax Group,
   * Province and a valid date are present — a disabled Search IS the block, so it is not clicked.
   * Returns whether a click happened.
   */
  @step('Click Search if it is enabled')
  async clickSearchIfEnabled(): Promise<boolean> {
    if (!(await this.searchButton().isEnabled())) return false;
    await this.searchButton().click();
    return true;
  }

  /** Fills every criterion (null → first option) and runs the search. */
  @step('Search with the given criteria')
  async search(criteria: SearchCriteria): Promise<Response | null> {
    if ((await this.readSelected(this.countryField())) !== criteria.country) await this.selectCountry(criteria.country);
    await this.selectTaxGroup(criteria.taxGroup);
    await this.selectProvince(criteria.province);
    if (criteria.date) await this.setSearchEffectiveDate(criteria.date);
    return this.clickSearchAndWait();
  }

  /** Runs a search and returns both the request it sent and the records it got back (if visible). */
  /**
   * The body is taken by fetching the response inside a route and passing it through unchanged —
   * NOT by Response.text() afterwards: Chromium does not retain the body of the first server-action
   * response after a page load ("No data found for resource"), which silently read as zero records.
   */
  @step('Search and capture the request and the response records')
  async searchCapturing(criteria: SearchCriteria): Promise<{ request: CapturedRequest | null; records: TaxRecord[] | null }> {
    const cap: { request?: CapturedRequest; body?: string } = {};
    const handler = async (route: Route): Promise<void> => {
      const req = route.request();
      if (!isSearchRequest(req)) return route.fallback();
      const response = await route.fetch();
      const body = await response.text();
      cap.request = { url: req.url(), method: req.method(), headers: req.headers(), body: req.postData() ?? '', records: [] };
      cap.body = body;
      return route.fulfill({ response, body });
    };
    await this.page.route('**/*', handler);
    try {
      await this.search(criteria);
    } finally {
      await this.page.unroute('**/*', handler);
    }
    if (!cap.request) return { request: null, records: null };
    return { request: cap.request, records: (findTaxRecords(parseLoose(cap.body ?? '')) ?? []).map(normalizeTaxRecord) };
  }

  /** Same combination, new as-of date. */
  @step('Search again at another as-of date')
  async searchAt(iso: string): Promise<void> {
    await this.setSearchEffectiveDate(iso);
    await this.clickSearchAndWait();
  }

  @step('Read the search validation state')
  async readSearchValidation(): Promise<{ invalidFields: number; messages: string[]; searchEnabled: boolean }> {
    const invalid = this.searchPanel().locator(SEARCH_INVALID);
    return {
      invalidFields: await this.searchPanel().locator('[aria-invalid="true"]').count(),
      messages: (await invalid.allInnerTexts()).map((t) => t.trim()).filter(Boolean),
      searchEnabled: await this.searchButton().isEnabled(),
    };
  }

  @step('Click Reset')
  async resetSearchCriteria(): Promise<void> {
    await this.resetButton().click();
  }

  // ---------------------------------------------------------------- grid

  @step('Read the records-found count')
  async getRecordsFoundCount(): Promise<number | null> {
    const label = this.page.locator('main').getByText(IST_MESSAGES.recordsFound).first();
    if (!(await label.isVisible().catch(() => false))) return null;
    const m = ((await label.textContent()) ?? '').match(IST_MESSAGES.recordsFound);
    return m ? parseInt(m[1]!, 10) : null;
  }

  @step('Read the grid column headers')
  async getHeaderLabels(): Promise<string[]> {
    const raw = await this.page.locator(GRID).first().locator(HEADER_CELLS).allInnerTexts();
    return raw.map((t) => t.replace(/\s+/g, ' ').trim()).filter((t) => t.length > 0);
  }

  /** The rows currently in the DOM, cells addressed by header label so a reorder never shifts values. */
  @step('Read the rendered grid rows')
  async readGrid(): Promise<TaxRow[]> {
    const grid = this.page.locator(GRID).first();
    if ((await grid.count()) === 0) return [];
    const rows = await grid.evaluate((el) => {
      const norm = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();
      const heads = Array.from(el.querySelectorAll('thead th, [role="columnheader"]')).map((h) => norm(h.textContent));
      const checked = (cb: Element | null): boolean =>
        !!cb && ((cb as HTMLInputElement).checked === true || cb.getAttribute('aria-checked') === 'true' || cb.getAttribute('data-state') === 'checked');
      const flag = (cell: Element | null): boolean => {
        if (!cell) return false;
        const cb = cell.querySelector('input[type="checkbox"], [role="checkbox"]');
        if (cb) return checked(cb);
        return cell.querySelector('svg') !== null || /✓|✔|^yes$|^true$/i.test(norm(cell.textContent));
      };
      return Array.from(el.querySelectorAll('tbody tr, [role="row"]'))
        .map((tr) => Array.from(tr.querySelectorAll(':scope > td, :scope > [role="cell"], :scope > [role="gridcell"]')))
        .filter((cells) => cells.length > 1)
        .map((cells) => {
          const at = (label: string): Element | null => {
            const i = heads.indexOf(label);
            return i < 0 ? null : (cells[i] ?? null);
          };
          return {
            taxType: norm(at('Tax Type')?.textContent),
            rateText: norm(at('Rate')?.textContent),
            province: norm(at('Province')?.textContent),
            dateText: norm(at('Effective Date')?.textContent),
            commissionTaxable: flag(at('Is Commission Taxable')),
            pending: flag(at('Apply')),
            selected: checked(cells[0]?.querySelector('input[type="checkbox"], [role="checkbox"]') ?? null),
          };
        });
    });
    return rows.map((r) => {
      const n = r.rateText.replace('%', '').trim();
      return {
        taxType: r.taxType,
        rateText: r.rateText,
        rate: n === '' || Number.isNaN(Number(n)) ? null : Number(n),
        province: r.province,
        effectiveDate: fromUiDate(r.dateText),
        commissionTaxable: r.commissionTaxable,
        pending: r.pending,
        selected: r.selected,
      };
    });
  }

  /**
   * Every row, scrolling the grid's own scroller so a virtualised grid gives up the rows it has not
   * rendered yet (pagination/virtualisation is unconfirmed — NM-4025 §4.1). Keyed by tax type + province.
   */
  @step('Read every grid row, scrolling through the grid')
  async readAllRows(): Promise<TaxRow[]> {
    const seen = new Map<string, TaxRow>();
    const scroll = (to: 'next' | 'top'): Promise<boolean> =>
      this.page.locator(GRID).first().evaluate((el, dir) => {
        let s: HTMLElement | null = el as HTMLElement;
        while (s && s.scrollHeight <= s.clientHeight + 1) s = s.parentElement;
        if (!s || s === document.documentElement || s === document.body) return false;
        if (dir === 'top') {
          s.scrollTop = 0;
          return false;
        }
        const before = s.scrollTop;
        s.scrollTop = before + s.clientHeight * 0.8;
        return s.scrollTop > before;
      }, to);
    for (let i = 0; i < 100; i++) {
      for (const r of await this.readGrid()) seen.set(`${r.taxType}|${r.province}`, r);
      if (!(await scroll('next'))) break;
      await this.page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    }
    await scroll('top');
    return [...seen.values()];
  }

  rowLocator(taxType: string): Locator {
    return this.page.locator(GRID).first().locator(BODY_ROWS).filter({ has: this.page.getByText(taxType, { exact: true }) }).first();
  }

  async rowCell(taxType: string, column: string): Promise<Locator> {
    const idx = await this.page.locator(GRID).first().locator(HEADER_CELLS).evaluateAll(
      (ths, label) => ths.findIndex((th) => (th.textContent ?? '').replace(/\s+/g, ' ').trim() === label),
      column,
    );
    if (idx < 0) throw new Error(`Column "${column}" is not rendered`);
    return this.rowLocator(taxType).locator(':scope > :is(td, [role="cell"], [role="gridcell"])').nth(idx);
  }

  @step('Read one grid row by tax type')
  async getRow(taxType: string): Promise<TaxRow | null> {
    return (await this.readAllRows()).find((r) => r.taxType === taxType) ?? null;
  }

  @step('Select grid rows')
  async selectRows(taxTypes: string[]): Promise<void> {
    for (const t of taxTypes) {
      const row = this.rowLocator(t);
      await row.scrollIntoViewIfNeeded();
      await row.locator(ROW_CHECKBOX).first().check();
    }
  }

  @step('Set the header select-all checkbox')
  async setSelectAll(checked: boolean): Promise<void> {
    await this.page.locator(CHK_SELECT_ALL).setChecked(checked);
  }

  /** aria-checked of the header checkbox: "true", "false" or "mixed". */
  @step('Read the header select-all state')
  async getSelectAllState(): Promise<string | null> {
    return this.page.locator(CHK_SELECT_ALL).getAttribute('aria-checked');
  }

  @step('Clear a grid row selection')
  async deselectRows(taxTypes: string[]): Promise<void> {
    for (const t of taxTypes) await this.rowLocator(t).locator(ROW_CHECKBOX).first().uncheck();
  }

  @step('Toggle a row checkbox with the keyboard')
  async toggleRowWithKeyboard(taxType: string): Promise<void> {
    const cb = this.rowLocator(taxType).locator(ROW_CHECKBOX).first();
    await cb.focus();
    await this.page.keyboard.press('Space');
  }

  @step('Count the row selection checkboxes')
  async countRowCheckboxes(): Promise<{ total: number; enabled: number }> {
    const boxes = this.page.locator(GRID).first().locator(BODY_ROWS).locator(ROW_CHECKBOX);
    const total = await boxes.count();
    let enabled = 0;
    for (let i = 0; i < total; i++) if (await boxes.nth(i).isEnabled()) enabled++;
    return { total, enabled };
  }

  /** Sorts through the column header menu (Sort ascending / Sort descending / Hide column). */
  @step('Sort the grid by a column')
  async sortBy(column: string, direction: 'ascending' | 'descending'): Promise<void> {
    await this.page.locator(GRID).first().locator('thead').getByRole('button', { name: column, exact: true }).click();
    await this.page.locator(MENU).getByRole('menuitem', { name: direction === 'ascending' ? 'Sort ascending' : 'Sort descending' }).click();
    await this.page.locator(MENU).waitFor({ state: 'hidden' }).catch(() => undefined);
    await this.waitForIdleGrid();
  }

  /** Double-clicks a grid cell and types — the inline-edit attempt NM-2395 forbids. */
  @step('Try to edit a grid cell inline')
  async tryInlineEdit(taxType: string, column: string, text: string): Promise<{ editorAppeared: boolean }> {
    const cell = await this.rowCell(taxType, column);
    await cell.dblclick();
    const editorAppeared = (await cell.locator('input:not([type="checkbox"]), textarea, [contenteditable="true"]').count()) > 0;
    await this.page.keyboard.type(text);
    await this.page.keyboard.press('Enter');
    return { editorAppeared };
  }

  // ---------------------------------------------------------------- update section

  @step('Set the update Rate')
  async setUpdateRate(rate: string | number): Promise<void> {
    const field = this.rateField();
    await field.click();
    await field.press('Control+A');
    await field.press('Backspace');
    const text = String(rate);
    if (text.length > 0) await field.pressSequentially(text, { delay: 20 });
  }

  @step('Read the update Rate')
  async getUpdateRate(): Promise<string> {
    return this.rateField().inputValue();
  }

  @step('Set Is Commission Taxable?')
  async setCommissionTaxable(value: boolean): Promise<void> {
    await this.commissionField().setChecked(value);
  }

  @step('Check whether Apply is enabled')
  async isApplyEnabled(): Promise<boolean> {
    return this.applyButton().isEnabled();
  }

  @step('Click Apply')
  async applyChanges(): Promise<void> {
    await this.applyButton().click();
  }

  /** Fills the update section, selects the rows and clicks Apply — staging only, nothing is saved. */
  @step('Stage values on rows with Apply')
  async stage(taxTypes: string[], values: { rate?: string | number; date?: string; commissionTaxable?: boolean }): Promise<void> {
    await this.selectRows(taxTypes);
    if (values.rate !== undefined) await this.setUpdateRate(values.rate);
    if (values.date !== undefined) await this.setUpdateEffectiveDate(values.date);
    if (values.commissionTaxable !== undefined) await this.setCommissionTaxable(values.commissionTaxable);
    await this.applyChanges();
  }

  // ---------------------------------------------------------------- save

  @step('Check whether Save is present')
  async hasSaveButton(): Promise<boolean> {
    return this.saveButton().isVisible().catch(() => false);
  }

  @step('Check whether Save is enabled')
  async isSaveEnabled(): Promise<boolean> {
    return this.saveButton().isEnabled();
  }

  @step('Click Save')
  async clickSave(): Promise<void> {
    await this.saveButton().click();
  }

  /** Clicks Save and lets the real write through — the only call in this page object that persists. */
  @step('Save and wait for the server to answer')
  async saveAndWait(): Promise<{ status: number; body: string; records: TaxRecord[] }> {
    const [req] = await Promise.all([this.page.waitForRequest(isSaveRequest, { timeout: 30_000 }), this.clickSave()]);
    const res = await req.response();
    const body = (await res?.text().catch(() => '')) ?? '';
    await this.waitForIdleGrid();
    return { status: res?.status() ?? 0, body, records: saveRecordsOf(req.postData() ?? '') };
  }

  @step('Read the mutation controls available to this user')
  async readMutationControls(): Promise<{ apply: 'absent' | 'disabled' | 'enabled'; save: 'absent' | 'disabled' | 'enabled'; rowCheckboxesEnabled: number }> {
    const state = async (loc: Locator): Promise<'absent' | 'disabled' | 'enabled'> => {
      if (!(await loc.isVisible().catch(() => false))) return 'absent';
      return (await loc.isEnabled()) ? 'enabled' : 'disabled';
    };
    return {
      apply: await state(this.applyButton()),
      save: await state(this.saveButton()),
      rowCheckboxesEnabled: (await this.countRowCheckboxes()).enabled,
    };
  }

  // ---------------------------------------------------------------- dirty-search warning

  /**
   * Clicks Search on a dirty page and answers the loss-of-changes warning. Live (2026-10-22) it is the
   * shared "Unsaved changes" alert dialog — confirm = Discard, cancel = Stay. A window.confirm is still
   * handled in case the build switches to one. Returns the warning text.
   */
  @step('Click Search on a dirty page and answer the warning')
  async clickSearchAnsweringWarning(answer: 'confirm' | 'cancel'): Promise<string> {
    let resolveNative: (text: string) => void = () => undefined;
    const native = new Promise<string>((r) => (resolveNative = r));
    const handler = async (d: Dialog): Promise<void> => {
      if (d.type() === 'beforeunload') return;
      const text = d.message();
      if (answer === 'confirm') await d.accept();
      else await d.dismiss();
      resolveNative(text);
    };
    const dlg = this.page.locator(DLG_UNSAVED_CHANGES).or(this.page.locator('[role="alertdialog"]').filter({ hasText: /unsaved changes/i })).last();
    this.page.on('dialog', handler);
    try {
      await this.searchButton().click();
      const inApp = dlg.waitFor({ state: 'visible', timeout: 15_000 }).then(() => null);
      inApp.catch(() => undefined);
      const nativeText = await Promise.race([native, inApp]);
      if (nativeText !== null) return nativeText;
      const text = ((await dlg.innerText()) ?? '').replace(/\s+/g, ' ').trim();
      const button = answer === 'confirm' ? /^(discard|yes|continue|ok|confirm)$/i : /^(stay|no|cancel)$/i;
      await dlg.getByRole('button', { name: button }).first().click();
      await dlg.waitFor({ state: 'hidden' });
      return text;
    } finally {
      this.page.off('dialog', handler);
      if (answer === 'confirm') await this.waitForIdleGrid().catch(() => undefined);
    }
  }

  // ---------------------------------------------------------------- toasts & errors

  @step('Wait for a toast and read it')
  async waitForToast(type: 'success' | 'error' | 'any' = 'any', timeout = 30_000): Promise<string> {
    const sel = type === 'success' ? TOAST_SUCCESS : type === 'error' ? TOAST_ERROR : TOAST;
    const toast = this.page.locator(sel).last();
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

  /**
   * Holds the save request instead of letting it write: 'abort' fails it at the network,
   * 'server-error' answers 500, 'delay-then-abort' holds it `delayMs` first (in-flight state).
   * Every captured request lands in the returned array. Nothing reaches the database.
   */
  @step('Intercept the save request so nothing is written')
  async interceptSave(mode: SaveInterceptMode, delayMs = 3_000): Promise<CapturedRequest[]> {
    const captured: CapturedRequest[] = [];
    await this.page.route('**/*', async (route: Route) => {
      const req = route.request();
      if (!isSaveRequest(req)) return route.fallback();
      const body = req.postData() ?? '';
      captured.push({ url: req.url(), method: req.method(), headers: req.headers(), body, records: saveRecordsOf(body) });
      if (mode === 'server-error') return route.fulfill({ status: 500, contentType: 'text/plain', body: 'Internal Server Error' });
      if (mode === 'delay-then-abort') await new Promise((r) => setTimeout(r, delayMs));
      return route.abort();
    });
    return captured;
  }

  /** Records every search request without changing it. */
  @step('Record the search requests')
  async recordSearches(): Promise<CapturedRequest[]> {
    const captured: CapturedRequest[] = [];
    this.page.on('request', (req) => {
      if (isSearchRequest(req)) {
        captured.push({ url: req.url(), method: req.method(), headers: req.headers(), body: req.postData() ?? '', records: [] });
      }
    });
    return captured;
  }

  /** Rewrites, holds or kills the search answer. The real read still goes out except for 'abort'/'failure'. */
  @step('Control the search response')
  async mockSearch(mock: SearchMock): Promise<void> {
    let seen = 0;
    await this.page.route('**/*', async (route: Route) => {
      const req = route.request();
      if (!isSearchRequest(req)) return route.fallback();
      seen += 1;
      switch (mock.kind) {
        case 'abort':
          return route.abort();
        case 'failure':
          return route.fulfill({ status: 500, contentType: 'text/plain', body: 'Internal Server Error' });
        case 'delay':
          await new Promise((r) => setTimeout(r, mock.ms));
          return route.fallback();
        case 'delay-first':
          if (seen === 1) await new Promise((r) => setTimeout(r, mock.ms));
          return route.fallback();
        case 'empty': {
          const response = await route.fetch();
          const body = await response.text();
          try {
            return route.fulfill({ response, body: JSON.stringify(replaceTaxRecords(JSON.parse(body), [])) });
          } catch {
            const result = parseServerActionResult(body);
            return route.fulfill({ response, body: replaceServerActionResult(body, replaceTaxRecords(result, [])) });
          }
        }
      }
    });
  }

  @step('Remove every network interception')
  async clearInterceptions(): Promise<void> {
    await this.page.unrouteAll({ behavior: 'ignoreErrors' });
  }

  /**
   * Re-sends a captured save from a brand-new context with NO session, as an anonymous caller would.
   * Redirects are not followed, so a refusal is visible as the server's own answer.
   */
  @step('Replay a save request without any session')
  async replayWithoutSession(req: CapturedRequest, body = req.body): Promise<{ status: number; body: string }> {
    const browser = this.page.context().browser();
    if (!browser) throw new Error('No browser available to open an anonymous context');
    const anon = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    try {
      const keep = ['content-type', 'accept', 'next-action', 'next-router-state-tree'];
      const headers = Object.fromEntries(Object.entries(req.headers).filter(([k]) => keep.includes(k.toLowerCase())));
      const res = await anon.request.post(req.url, { headers, data: body, maxRedirects: 0 });
      return { status: res.status(), body: await res.text() };
    } finally {
      await anon.close();
    }
  }

  // ---------------------------------------------------------------- misc page-level reads

  /** Visible text fragments that look like untranslated i18n keys (e.g. "taxes.internationalTax.x"). */
  @step('Scan visible text for untranslated i18n keys')
  async findRawI18nKeys(): Promise<string[]> {
    const text = await this.page.locator('main').innerText();
    const hits = text.match(/\b[a-z][a-zA-Z]+(?:\.[a-zA-Z][a-zA-Z0-9]+){2,}\b/g) ?? [];
    return [...new Set(hits)];
  }

  /** Accessible name of each search/update control, keyed by its visible label. */
  @step('Read the accessible names of the search and update controls')
  async readControlAccessibleNames(): Promise<Record<string, string>> {
    const name = (loc: Locator): Promise<string> =>
      loc.evaluate((el) => {
        const labelled = el.getAttribute('aria-labelledby');
        const byId = labelled ? labelled.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ') : '';
        const label = (el as HTMLInputElement).labels?.[0]?.textContent ?? '';
        return (el.getAttribute('aria-label') ?? (byId || label || (el.tagName === 'BUTTON' ? el.textContent : '') || '')).replace(/\s+/g, ' ').trim();
      });
    return {
      Country: await name(this.countryField()),
      'Tax Group': await name(this.taxGroupField()),
      Province: await name(this.provinceField()),
      'Search Effective Date': await name(this.searchDateField()),
      Rate: await name(this.rateField()),
      'Update Effective Date': await name(this.updateDateField()),
      'Is Commission Taxable?': await name(this.commissionField()),
      Apply: await name(this.applyButton()),
      Search: await name(this.searchButton()),
      Reset: await name(this.resetButton()),
      Save: await name(this.saveButton()),
    };
  }

  /** Horizontal overflow of the document vs the grid's own scroller, for the layout checks. */
  @step('Measure horizontal overflow of the page')
  async measureOverflow(): Promise<{ pageOverflows: boolean }> {
    return this.page.evaluate(() => ({
      pageOverflows: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    }));
  }

  /** Leaves the page, accepting any unsaved-changes prompt, so the next test starts clean. */
  @step('Leave the page and discard any staged changes')
  async leaveDiscardingChanges(): Promise<void> {
    await this.safeNavigateTo('about:blank');
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
