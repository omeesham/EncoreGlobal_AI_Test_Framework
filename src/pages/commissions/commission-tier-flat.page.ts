import { Locator, Page, Request, Route, expect, test } from '@playwright/test';
import * as XLSX from 'xlsx';
import { step } from '../../fixtures/step-decorator';
import { BasePage } from '../base.page';
import { Log } from '../../utils/logger';
import { IConfig } from '../../types';
import {
  HEADER_TITLE,
  BTN_INFO,
  TOOLTIP,
  TAB_SELECTED,
  PRODUCT_CODE_BANNER,
  SEARCH_FORM,
  FILTER,
  LOCAL_OFFICE_BLOCK,
  LOCAL_OFFICE_TEXT,
  BTN_SEARCH,
  BTN_RESET,
  BTN_COLLAPSE_FILTERS,
  BTN_EXPAND_FILTERS,
  DLG_LOCATION,
  TXT_LOCATION_SEARCH,
  ITEM_COUNT,
  SELECT_BUSINESS_TYPE,
  BTN_GRID_OPTIONS,
  HEADERS,
  HEADER_MENU_TRIGGER,
  ROWS,
  SKELETON,
  BTN_ADD_ROW,
  BTN_COPY_MENU,
  BTN_NAME,
  CELL_KEY,
  cellDisplay,
  cellInput,
  ROW_DELETE,
  NEW_ROW_DELETE,
  rowByKey,
  CHECKBOX,
  INVALID_MARK,
  ROW_ALERT,
  BOUNDARY_ERROR,
  WARNING_ICON,
  ROWS_PER_PAGE,
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
  DIALOG,
  DLG_RESET_DATES,
  monthCombo,
  COPY_SOURCE_SERVICE_TYPE,
  COPY_TARGET_ROW,
  DLG_CONFLICTS,
  IMPORT_FILE_INPUT,
  BTN_IMPORT_UPLOAD,
  DLG_IMPORT,
  TOAST,
} from '../../selectors/commissions/commission-tier-flat';
import { AUTO_UPPER, MONTHS, MONTH_NAMES, TF_PATH, Tab } from '../../data/commissions/commission-tier-flat';

/** One grid row, keyed by column header. Checkboxes read as Yes / No. */
export type GridRow = Record<string, string>;

/** The toolbar actions whose state NM-3678 ties to the dirty flag. */
export type Action = keyof typeof BTN_NAME;

/** Enabled / disabled per toolbar action; null when the action is not on screen at all. */
export type ToolbarState = Record<Action, boolean | null>;

/** What a cell shows: its editor's value (or its text) and whether it is marked invalid. */
export interface CellState {
  value: string;
  invalid: boolean;
  focused: boolean;
}

export interface HeldRequests {
  /** Bodies of the POST requests caught while armed. */
  readonly bodies: string[];
  /** Removes the interception. */
  undo(): Promise<void>;
}

export interface UploadFile {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

/** "100,000,000.00", "5.00 %" → number; empty or non-numeric → NaN. */
export const toNumber = (text: string): number => {
  const cleaned = text.replace(/[^\d.\-eE]/g, '');
  return cleaned === '' || cleaned === '-' ? Number.NaN : Number(cleaned);
};

/** Body of the grid search request: [{"locationNo":"1101","currencyId":1,"culture":"en-US"}]. */
export const SEARCH_REQUEST = /"locationNo".*"currencyId"/;

const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const exactly = (s: string): RegExp => new RegExp(`^\\s*${escapeRegex(s)}\\s*$`);

/** True when a cell holds a plain number (a "%" suffix allowed) — no letters, symbols or separators left over. */
export const isPlainNumber = (value: string): boolean =>
  Number.isFinite(toNumber(value)) && !/[a-df-z<>!@#$&]/i.test(value.replace(/%/g, ''));

/** Tier records in a save request body: objects that carry a lower and an upper boundary. */
export const tierRecords = (body: string): Record<string, unknown>[] => {
  const out: Record<string, unknown>[] = [];
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (v && typeof v === 'object') {
      const keys = Object.keys(v);
      if (keys.some((k) => /lower/i.test(k)) && keys.some((k) => /upper/i.test(k))) out.push(v as Record<string, unknown>);
      else Object.values(v).forEach(walk);
    }
  };
  try { walk(JSON.parse(body)); } catch { /* not JSON — no records */ }
  return out;
};

/**
 * What a refused value did. Rates are marked while still typed (aria-invalid); a boundary pair out of order is marked
 * once the cell is left (red value, warning icon, message). `flagged` is true when either happened.
 */
export interface Rejection {
  flaggedWhileTyping: boolean;
  flaggedAfterLeaving: boolean;
  flagged: boolean;
  focused: boolean;
  saveEnabled: boolean;
  saveEnabledAfterLeaving: boolean;
  keptAfterLeaving: boolean;
}

/** What a free-form value left in the cell: flagged, or a plain number — and whether a script ran. */
export interface FreeForm {
  value: string;
  flagged: boolean;
  plainNumber: boolean;
  saveEnabled: boolean;
  scriptRan: boolean;
}

// Setup → Commissions → Tier/Flat. Basic Information lists commission bands per service type; on an office the user
// may edit (the corporate office 1101 on e2e) the grid is editable and has a toolbar — Export, Import, Copy, Reset
// Dates, Save, Add Row — and each row a Delete button; on other offices it is read-only. Commission Tier/Flat
// History is a read-only, paged audit grid.
export class CommissionTierFlatPage extends BasePage {
  constructor(page: Page, config?: IConfig) {
    super(page, config);
    Log.info('CommissionTierFlatPage initialized');
  }

  url(office: string): string {
    return `${(this.config?.base_url ?? '').replace(/\/+$/, '')}${TF_PATH(office)}`;
  }

  // ---------------------------------------------------------------- navigation

  /** Opens the page with no criteria or grid layout kept from an earlier visit. */
  @step('Open the Commission Tier/Flat page for an office')
  async open(office: string): Promise<void> {
    await this.clearKeptState();
    await this.safeNavigateTo(this.url(office));
    await this.waitForReady();
  }

  private async clearKeptState(): Promise<void> {
    if (!this.page.url().startsWith('http')) return;
    await this.page.evaluate(() => {
      for (const store of [localStorage, sessionStorage]) {
        for (const key of Object.keys(store)) if (/commission|tier/i.test(key)) store.removeItem(key);
      }
    });
  }

  /**
   * The Search button enables before the office has loaded: until then the Local Office reads the placeholder
   * "All - Locations" and a search only says "Select a local office…". So the page counts as ready once the
   * office's own "Id - Name" is shown.
   */
  @step('Wait for the Commission Tier/Flat page to load')
  async waitForReady(): Promise<void> {
    await this.page.locator(HEADER_TITLE).waitFor({ state: 'visible', timeout: 60_000 });
    await expect(this.page.locator(BTN_SEARCH)).toBeEnabled({ timeout: 60_000 });
    await expect(this.page.locator(SEARCH_FORM).locator(LOCAL_OFFICE_BLOCK).first()).toContainText(/\d{3,5}\s+-\s+\S/, { timeout: 60_000 });
  }

  /** Reloads with unsaved edits and returns the type of prompt the browser raised, if any. */
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
    await this.page.locator(BTN_INFO).first().hover();
    const tip = this.page.locator(TOOLTIP).first();
    await tip.waitFor({ state: 'visible' });
    return (await tip.innerText()).trim();
  }

  productCodeBanner(): Locator {
    return this.page.locator(PRODUCT_CODE_BANNER).first();
  }

  async tabNames(): Promise<string[]> {
    return (await this.page.locator('main').getByRole('tab').allInnerTexts()).map((t) => t.trim());
  }

  /** Clicks a tab; with unsaved edits the page asks first, so the tab may not change yet. */
  @step('Click a tab')
  async clickTab(name: Tab): Promise<void> {
    await this.page.locator('main').getByRole('tab', { name, exact: true }).click();
  }

  /** Opens a tab and waits for its grid (History loads on first click). */
  @step('Open a tab')
  async openTab(name: Tab): Promise<number> {
    await this.clickTab(name);
    await expect(this.page.locator(TAB_SELECTED)).toHaveText(name);
    return this.waitForResults();
  }

  async selectedTab(): Promise<string> {
    return (await this.page.locator(TAB_SELECTED).innerText()).trim();
  }

  // ---------------------------------------------------------------- search criteria

  /** A dropdown of the search panel. */
  criteria(label: keyof typeof FILTER): Locator {
    return this.page.locator(FILTER[label]);
  }

  async hasCriteria(label: keyof typeof FILTER): Promise<boolean> {
    return this.criteria(label).isVisible().catch(() => false);
  }

  @step('Read a search criterion')
  async getCriteriaValue(label: keyof typeof FILTER): Promise<string> {
    return (await this.criteria(label).innerText()).trim();
  }

  /** Options of a search dropdown as listed, blanks included. */
  @step('Read the options of a search dropdown')
  async getCriteriaOptions(label: keyof typeof FILTER): Promise<string[]> {
    return this.optionsOf(this.criteria(label));
  }

  /** Picks an option of a search dropdown. With unsaved edits the page may ask first. */
  @step('Choose a search dropdown option')
  async chooseCriteria(label: keyof typeof FILTER, name: string): Promise<void> {
    await this.criteria(label).click();
    await this.page.locator(LISTBOX).waitFor({ state: 'visible' });
    await this.page.locator(OPTION).filter({ hasText: exactly(name) }).first().click();
  }

  /** The Local Office field: its text, and whether it is a picker (corporate) rather than read-only text. */
  @step('Read the Local Office field')
  async getLocalOffice(): Promise<{ text: string; isPicker: boolean; readOnlyText: boolean }> {
    const block = this.page.locator(SEARCH_FORM).locator(LOCAL_OFFICE_BLOCK).first();
    await block.waitFor({ state: 'visible' });
    const text = (await block.innerText()).replace(/^Local Office\s*/i, '').replace(/\s+/g, ' ').trim();
    const isPicker = (await block.locator('button').count()) > 0;
    return { text, isPicker, readOnlyText: !isPicker && LOCAL_OFFICE_TEXT.test(text) };
  }

  /** Corporate office: opens the Location picker, finds an office and selects it. */
  @step('Choose a location in the Location picker')
  async chooseLocation(office: string): Promise<void> {
    await this.page.locator(SEARCH_FORM).locator(LOCAL_OFFICE_BLOCK).locator('button').first().click();
    const dialog = this.page.locator(DLG_LOCATION);
    await dialog.waitFor({ state: 'visible' });
    await dialog.locator(TXT_LOCATION_SEARCH).fill(office);
    const row = dialog.locator('tbody tr').filter({ has: this.page.getByRole('cell', { name: office, exact: true }) }).first();
    await row.getByRole('checkbox').click();
    await dialog.getByRole('button', { name: 'Select', exact: true }).click();
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
    await this.page.locator(BTN_SEARCH).click();
    return this.waitForResults();
  }

  /** Clicks Reset; with unsaved edits the page may ask first. */
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

  searchButton(): Locator {
    return this.page.locator(BTN_SEARCH);
  }

  // Placeholders replace the grid from the moment a load starts; once they are gone the count is the new one.
  // History of an office with no business type shows a prompt instead of a count: that reads as 0 entries.
  private async waitForResults(): Promise<number> {
    await this.page.locator(SKELETON).first().waitFor({ state: 'attached', timeout: 5_000 }).catch(() => {});
    await expect(this.page.locator(SKELETON)).toHaveCount(0, { timeout: 90_000 });
    const prompt = this.page.locator(SELECT_BUSINESS_TYPE);
    await expect(this.page.locator(ITEM_COUNT).first().or(prompt)).toBeVisible({ timeout: 30_000 });
    return (await prompt.isVisible()) ? 0 : this.getCount();
  }

  // ---------------------------------------------------------------- results grid

  @step('Read the item count')
  async getCount(): Promise<number> {
    const text = await this.page.locator(ITEM_COUNT).first().innerText();
    const m = text.match(/([\d,]+)\s+items?\s+found/i);
    if (!m) throw new Error(`No "items found" count in: ${text}`);
    return Number(m[1]!.replace(/,/g, ''));
  }

  @step('Check whether a grid message is shown')
  async isMessageVisible(text: string): Promise<boolean> {
    return this.page.getByText(text, { exact: true }).isVisible();
  }

  rows(): Locator {
    return this.page.locator(ROWS);
  }

  grid(): Locator {
    return this.page.locator('main table').first();
  }

  /** Every header cell in screen order, the untitled Delete column included as "". */
  private async headerCells(): Promise<string[]> {
    return (await this.page.locator(HEADERS).allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
  }

  /** The titled column headers. */
  @step('Read the column headers')
  async getHeaders(): Promise<string[]> {
    return (await this.headerCells()).filter(Boolean);
  }

  /** Reads a row; checkboxes as Yes/No, editors by value, everything else by text. */
  @step('Read a grid row')
  async readRow(row: Locator): Promise<GridRow> {
    const headers = await this.headerCells();
    const values = await row.locator('td').evaluateAll((tds) => tds.map((td) => {
      const box = td.querySelector('[role="checkbox"]');
      if (box) return box.getAttribute('aria-checked') === 'true' ? 'Yes' : 'No';
      const input = td.querySelector('input:not([type="hidden"])') as HTMLInputElement | null;
      return (input ? input.value : (td as HTMLElement).innerText).replace(/\s+/g, ' ').trim();
    }));
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']).filter(([h]) => h !== ''));
  }

  /** A column of the rows on screen (the grid pages ten rows at a time). */
  @step('Read a column of the grid')
  async readColumn(column: string): Promise<string[]> {
    const i = (await this.headerCells()).indexOf(column);
    if (i < 0) throw new Error(`Column "${column}" is not shown`);
    return this.rows().evaluateAll((rows, idx) => rows.map((r) => {
      const td = r.querySelectorAll('td')[idx] as HTMLElement | undefined;
      const box = td?.querySelector('[role="checkbox"]');
      if (box) return box.getAttribute('aria-checked') === 'true' ? 'Yes' : 'No';
      const input = td?.querySelector('input:not([type="hidden"])') as HTMLInputElement | null | undefined;
      return (input ? input.value : td?.innerText ?? '').replace(/\s+/g, ' ').trim();
    }), i);
  }

  /** The number a cell holds (NaN when it holds none). */
  async numberIn(row: Locator, column: string): Promise<number> {
    return toNumber((await this.readRow(row))[column] ?? '');
  }

  /** Columns of a row that offer an editor: a clickable number cell, a dropdown or a checkbox. */
  @step('List the editable cells of a row')
  async editableColumns(row: Locator): Promise<string[]> {
    const headers = await this.headerCells();
    const flags = await row.locator('td').evaluateAll((tds) => tds.map((td) =>
      !!td.querySelector('input:not([disabled]):not([type="hidden"]), [role="combobox"]:not([disabled]), [role="checkbox"]:not([disabled]), div[role="button"][data-testid^="commission-tier-"]')));
    return headers.filter((h, i) => h !== '' && flags[i]);
  }

  /** The row of a row key (record id or new-N) — stays the same row when the grid re-sorts. */
  rowOf(key: string): Locator {
    return this.page.locator(rowByKey(key));
  }

  /** Row key of a row, from its Delete button. */
  async keyOf(row: Locator): Promise<string> {
    const id = await row.locator(ROW_DELETE).first().getAttribute('data-testid');
    return (id ?? '').replace('commission-tier-delete-', '');
  }

  /** The rows of a service type on screen, as stable key-based locators. */
  async rowsOf(serviceType: string): Promise<Locator[]> {
    const out: Locator[] = [];
    for (let i = 0; i < (await this.rows().count()); i++) {
      const row = this.rows().nth(i);
      if ((await this.readRow(row))['Service Type'] === serviceType) {
        const key = await this.keyOf(row).catch(() => '');
        out.push(key ? this.rowOf(key) : row);
      }
    }
    return out;
  }

  /** The first row of a service type whose boundaries equal the given numbers. */
  async rowWhere(serviceType: string, lower: number, upper: number): Promise<Locator | null> {
    for (const row of await this.rowsOf(serviceType)) {
      const r = await this.readRow(row);
      if (toNumber(r['Lower Tier Boundary'] ?? '') === lower && toNumber(r['Upper Tier Boundary'] ?? '') === upper) return row;
    }
    return null;
  }

  // ---------------------------------------------------------------- validation markers

  private key(column: string): string {
    const key = CELL_KEY[column];
    if (!key) throw new Error(`"${column}" is not an editable column`);
    return key;
  }

  /** Value, invalid marker and focus of one editable cell; read without moving focus. */
  @step('Read the state of a cell')
  async cellState(row: Locator, column: string): Promise<CellState> {
    const key = this.key(column);
    const input = row.locator(cellInput(key));
    if (await input.count()) {
      return {
        value: await input.inputValue(),
        invalid: (await input.getAttribute('aria-invalid')) === 'true',
        focused: await input.evaluate((e) => document.activeElement === e),
      };
    }
    const display = row.locator(cellDisplay(key)).first();
    return {
      value: (await display.innerText()).replace(/\s+/g, ' ').trim(),
      invalid: (await display.getAttribute('aria-invalid')) === 'true',
      focused: false,
    };
  }

  /** Every validation message of a row (markers carry it in their title or text). */
  @step('Read the validation messages of a row')
  async rowMessages(row: Locator): Promise<string[]> {
    return row.locator(ROW_ALERT).evaluateAll((els) => els.map((e) => (e.getAttribute('title') || e.textContent || '').trim()).filter(Boolean));
  }

  /**
   * True when a row carries any validation marker: aria-invalid on an editor (rates), or — for a boundary pair — the
   * value turned red with a warning icon beside it whose tooltip carries the message.
   */
  async isRowFlagged(row: Locator): Promise<boolean> {
    return (await row.locator(`${INVALID_MARK}, ${ROW_ALERT}, ${BOUNDARY_ERROR}`).count()) > 0;
  }

  /** The message of a cell's warning icon (hovered), or null when the cell shows none. */
  @step('Read the warning of a cell')
  async cellWarning(row: Locator, column: string): Promise<string | null> {
    const i = (await this.headerCells()).indexOf(column);
    const icon = row.locator('td').nth(i).locator(WARNING_ICON).first();
    if (!(await icon.isVisible().catch(() => false))) return null;
    await icon.hover();
    const tip = this.page.locator(TOOLTIP).first();
    if (!(await tip.waitFor({ state: 'visible', timeout: 3_000 }).then(() => true, () => false))) return null;
    return (await tip.innerText()).trim();
  }

  /** Messages above or below the grid (not tied to a row), the product-code banner excepted. */
  async gridMessages(): Promise<string[]> {
    return this.page.locator(`main ${ROW_ALERT}`).evaluateAll((els) => els
      .filter((e) => !e.closest('tr'))
      .map((e) => (e.getAttribute('title') || e.textContent || '').trim())
      .filter((t) => t && !/Product Code Commissions/i.test(t)));
  }

  // ---------------------------------------------------------------- editing

  // Leaving a cell is what commits it, so a committed edit ends on a neutral spot.
  @step('Leave the cell')
  async leaveCell(): Promise<void> {
    await this.page.locator(ITEM_COUNT).first().click();
  }

  /**
   * Types into a number cell with real keystrokes: the cell's display is clicked to open its number input, which is
   * cleared and typed into. Unless `commit` is false the cell is then left. With `commit: false` the input keeps focus,
   * which is how NM-3673 ("validation fires while typing, not on blur") is checked.
   */
  @step('Type into a cell')
  async typeInto(row: Locator, column: string, value: string, opts: { commit?: boolean } = {}): Promise<CellState> {
    const key = this.key(column);
    const input = row.locator(cellInput(key));
    if (!(await input.isVisible().catch(() => false))) await row.locator(cellDisplay(key)).first().click();
    await expect(input, `${column} opens an editor`).toBeVisible({ timeout: 5_000 });
    await input.click();
    await input.press('ControlOrMeta+a');
    await input.press('Backspace');
    if (value !== '') await input.pressSequentially(value, { delay: 10 });
    if (opts.commit !== false) await this.leaveCell();
    return this.cellState(row, column);
  }

  private async optionsOf(trigger: Locator): Promise<string[]> {
    await expect(trigger).toBeEnabled({ timeout: 30_000 });
    await trigger.click();
    await this.page.locator(LISTBOX).waitFor({ state: 'visible' });
    const texts = (await this.page.locator(OPTION).allInnerTexts()).map((t) => t.trim());
    await this.page.keyboard.press('Escape');
    await this.page.locator(LISTBOX).waitFor({ state: 'hidden' });
    return texts;
  }

  @step('Read the Service Type options of a row')
  async serviceTypeOptions(row: Locator): Promise<string[]> {
    return this.optionsOf(row.locator(cellDisplay(this.key('Service Type'))).first());
  }

  @step('Choose the Service Type of a row')
  async setServiceType(row: Locator, name: string): Promise<void> {
    await row.locator(cellDisplay(this.key('Service Type'))).first().click();
    await this.page.locator(LISTBOX).waitFor({ state: 'visible' });
    const option = this.page.locator(OPTION).filter({ hasText: exactly(name) }).first();
    await option.scrollIntoViewIfNeeded();
    await option.click();
    await this.page.locator(LISTBOX).waitFor({ state: 'hidden' });
  }

  /** Clicks a checkbox cell (or presses Space on it) and returns its new state (Yes / No). */
  @step('Tick or untick a checkbox cell')
  async toggle(row: Locator, column: string, how: 'click' | 'space' = 'click'): Promise<string> {
    const box = row.locator(cellDisplay(this.key(column))).first();
    const now = (await box.getAttribute('aria-checked')) === 'true' ? 'No' : 'Yes';
    if (how === 'space') { await box.focus(); await this.page.keyboard.press('Space'); } else { await box.click(); }
    await expect(box).toHaveAttribute('aria-checked', now === 'Yes' ? 'true' : 'false');
    return now;
  }

  /** Adds a row and returns it, found by its own key (new-N), wherever the grid puts it. */
  @step('Add a row')
  async addRow(): Promise<Locator> {
    const before = await this.page.locator(NEW_ROW_DELETE).count();
    await this.page.locator(BTN_ADD_ROW).click();
    const added = this.page.locator(NEW_ROW_DELETE);
    await expect(added).toHaveCount(before + 1, { timeout: 15_000 });
    const keys = await added.evaluateAll((bs) => bs.map((b) => (b.getAttribute('data-testid') ?? '').replace('commission-tier-delete-', '')));
    const newest = keys.sort((a, b) => Number(b.replace('new-', '')) - Number(a.replace('new-', '')))[0]!;
    return this.rowOf(newest);
  }

  /**
   * Adds a row on a service type that has no band on screen, so validation results come from this row alone.
   * `pick: 'last'` takes free types from the end of the list (History cases use it, so two workers never share one).
   */
  @step('Add a row on a service type with no tiers yet')
  async addRowOnFreeServiceType(opts: { pick?: 'first' | 'last'; skip?: number; exclude?: string[] } = {}): Promise<{ row: Locator; serviceType: string; free: string[] }> {
    const taken = new Set([...(await this.readColumn('Service Type')), ...(opts.exclude ?? [])]);
    const row = await this.addRow();
    const free = (await this.serviceTypeOptions(row)).filter((o) => o !== '' && !/^\d+$/.test(o) && !taken.has(o));
    const ordered = opts.pick === 'last' ? [...free].reverse() : free;
    const serviceType = ordered[opts.skip ?? 0];
    test.skip(!serviceType, 'Every service type of this Business Type already has tiers — no free service type to test on');
    await this.setServiceType(row, serviceType!);
    return { row, serviceType: serviceType!, free };
  }

  /** Sets both boundaries of a row (upper first when raising, so the pair never crosses). */
  @step('Set the boundaries of a row')
  async setBand(row: Locator, lower: number, upper: number): Promise<void> {
    const current = await this.numberIn(row, 'Upper Tier Boundary');
    if (!Number.isNaN(current) && lower > current) {
      await this.typeInto(row, 'Upper Tier Boundary', String(upper));
      await this.typeInto(row, 'Lower Tier Boundary', String(lower));
    } else {
      await this.typeInto(row, 'Lower Tier Boundary', String(lower));
      await this.typeInto(row, 'Upper Tier Boundary', String(upper));
    }
  }

  /**
   * Types a value that must be refused, keeping the cursor in the cell to read the marker (NM-3673), then
   * leaves the cell and types `restore` so the next value starts from a valid cell.
   */
  @step('Type a value that must be refused')
  async typeRejected(row: Locator, column: string, value: string, restore: string): Promise<Rejection> {
    const typing = await this.typeInto(row, column, value, { commit: false });
    const flaggedWhileTyping = await expect.poll(() => this.isRowFlagged(row), { timeout: 3_000 }).toBe(true).then(() => true, () => false);
    const saveEnabled = await this.isSaveEnabled();
    await this.leaveCell();
    const flaggedAfterLeaving = await expect.poll(() => this.isRowFlagged(row), { timeout: 3_000 }).toBe(true).then(() => true, () => false);
    const saveEnabledAfterLeaving = await this.isSaveEnabled();
    const after = await this.cellState(row, column);
    const keptAfterLeaving = !flaggedAfterLeaving && toNumber(after.value) === toNumber(value);
    await this.typeInto(row, column, restore);
    return {
      flaggedWhileTyping, flaggedAfterLeaving, flagged: flaggedWhileTyping || flaggedAfterLeaving,
      focused: typing.focused, saveEnabled, saveEnabledAfterLeaving, keptAfterLeaving,
    };
  }

  /** Types free-form input, leaves the cell and reports what the cell kept. */
  @step('Type free-form input')
  async typeFreeForm(row: Locator, column: string, value: string): Promise<FreeForm> {
    const state = await this.typeInto(row, column, value);
    return {
      value: state.value,
      flagged: await this.isRowFlagged(row),
      plainNumber: isPlainNumber(state.value),
      saveEnabled: await this.isSaveEnabled(),
      scriptRan: await this.page.evaluate(() => (window as unknown as { __tfXss?: number }).__tfXss !== undefined),
    };
  }

  /** A rate numerically different from the row's own, inside 0 – 100; returns the column and both values. */
  @step('Change a rate of a row')
  async changeRate(row: Locator): Promise<{ column: string; original: string; edited: string }> {
    const column = 'Comm %';
    const original = (await this.readRow(row))[column] ?? '0';
    const n = Number.isNaN(toNumber(original)) ? 0 : toNumber(original);
    const edited = (n >= 50 ? n - 10 : n + 10).toFixed(2);
    await this.typeInto(row, column, edited);
    return { column, original, edited };
  }

  /**
   * A saved band to edit without saving: the first saved row of a searched grid, or — when the office has none and
   * writes are allowed — a marker band saved now (removed later by purgeLeftovers).
   */
  @step('Find a saved band')
  async savedBand(writesAllowed: boolean): Promise<Locator> {
    if ((await this.getCount()) > 0) return this.rowOf(await this.keyOf(this.rows().first()));
    test.skip(!writesAllowed, 'The office has no tiers and TF_WRITES=off forbids creating one');
    const { row, serviceType } = await this.addRowOnFreeServiceType();
    await this.setBand(row, 0, AUTO_UPPER);
    await this.save();
    await this.search();
    const saved = await this.rowWhere(serviceType, 0, AUTO_UPPER);
    if (!saved) throw new Error('The marker band was not saved');
    return saved;
  }

  /** Adds two bands on one service type with no tiers; returns both rows. */
  @step('Add two bands on one service type')
  async addTwoBands(a: { lower: number; upper: number }, b: { lower: number; upper: number }): Promise<{ serviceType: string; rows: Locator[]; free: string[] }> {
    const { row, serviceType, free } = await this.addRowOnFreeServiceType();
    await this.setBand(row, a.lower, a.upper);
    const second = await this.addRow();
    await this.setServiceType(second, serviceType);
    await this.setBand(second, b.lower, b.upper);
    return { serviceType, rows: [row, second], free };
  }

  /** Clicks the row's Delete button (a confirmation, if the page asks one, is accepted). */
  @step('Delete a row')
  async deleteRow(row: Locator): Promise<void> {
    await row.locator(ROW_DELETE).first().click();
    const confirm = this.page.locator('[role="alertdialog"]').getByRole('button', { name: /^(Delete|Yes|OK|Confirm)$/i });
    if (await confirm.first().isVisible().catch(() => false)) await confirm.first().click();
  }

  /** Whether the row offers a Delete button. */
  async hasDeleteButton(row: Locator): Promise<boolean> {
    return row.locator(ROW_DELETE).first().isVisible();
  }

  // ---------------------------------------------------------------- toolbar

  toolbarButton(action: Action): Locator {
    if (action === 'addRow') return this.page.locator(BTN_ADD_ROW);
    if (action === 'copy') return this.page.locator(BTN_COPY_MENU);
    return this.page.locator('main').getByRole('button', { name: BTN_NAME[action] }).first();
  }

  /** Enabled state of every toolbar action (null when not on screen). */
  @step('Read the toolbar state')
  async toolbarState(): Promise<ToolbarState> {
    const read = async (a: Action): Promise<boolean | null> => {
      const b = this.toolbarButton(a);
      if (!(await b.isVisible().catch(() => false))) return null;
      return b.isEnabled();
    };
    return {
      save: await read('save'), addRow: await read('addRow'), export: await read('export'),
      import: await read('import'), copy: await read('copy'), resetDates: await read('resetDates'),
    };
  }

  @step('Check whether Save is enabled')
  async isSaveEnabled(): Promise<boolean> {
    const b = this.toolbarButton('save');
    return (await b.isVisible().catch(() => false)) && b.isEnabled();
  }

  /** True when the page shows no unsaved changes: Save off, and Export / Import / Copy / Reset Dates on. */
  async isPristine(): Promise<boolean> {
    const s = await this.toolbarState();
    return s.save !== true && [s.export, s.import, s.copy, s.resetDates].every((v) => v !== false);
  }

  @step('Click Save')
  async clickSave(): Promise<void> {
    await this.toolbarButton('save').click();
  }

  /**
   * Clicks Save and returns the message the page then shows. The success toast comes before the grid is reloaded;
   * a Search or Copy clicked in between finds the page still "changed" and opens Unsaved changes. So after a success
   * this waits until the page shows no unsaved changes (Save off, actions on again).
   */
  @step('Save')
  async save(): Promise<string> {
    await this.clickSave();
    const message = await this.readFeedback();
    if (!/fail|error|unable|unexpected/i.test(message)) await expect.poll(() => this.isPristine(), { timeout: 60_000 }).toBe(true);
    return message;
  }

  /** The first toast, alert or alert dialog that appears (the product-code banner is not feedback). */
  @step('Read the message the page shows')
  async readFeedback(timeout = 30_000): Promise<string> {
    const any = this.page.locator(`${TOAST}, main [role="alert"]:not(:has-text("Product Code Commissions")), [role="alertdialog"], ${DIALOG} [role="alert"]`).first();
    await any.waitFor({ state: 'visible', timeout });
    return (await any.innerText()).replace(/\s+/g, ' ').trim();
  }

  /**
   * Catches the POST requests the page sends from now on (the page's calls are server actions posted to the
   * page URL, so they are told apart by when they are sent and by their body, not by their address). `abort` and
   * `fail` keep the request from the server, so nothing is stored; `delay` lets it through after `delayMs`.
   * `match` narrows the hold to requests whose body matches — e.g. SEARCH_REQUEST for the grid search only.
   */
  async holdRequests(mode: 'abort' | 'fail' | 'delay', delayMs = 5_000, match?: RegExp): Promise<HeldRequests> {
    const bodies: string[] = [];
    const handler = async (route: Route): Promise<void> => {
      const req = route.request();
      if (req.method() !== 'POST' || !/\/navigator\//.test(req.url())) return route.fallback();
      if (match && !match.test(req.postData() ?? '')) return route.fallback();
      bodies.push(req.postData() ?? '');
      if (mode === 'abort') return route.abort('failed');
      if (mode === 'fail') return route.fulfill({ status: 500, body: 'forced failure' });
      await new Promise((r) => setTimeout(r, delayMs));
      return route.fallback();
    };
    await this.page.route('**/*', handler);
    return { bodies, undo: () => this.page.unroute('**/*', handler) };
  }

  /** Counts the POST requests the page sends from now on. */
  countPosts(): { count: () => number; stop: () => void } {
    let n = 0;
    const on = (r: Request) => { if (r.method() === 'POST' && /\/navigator\//.test(r.url())) n++; };
    this.page.on('request', on);
    return { count: () => n, stop: () => this.page.off('request', on) };
  }

  /**
   * Removes bands an interrupted earlier run left behind (they carry the AUTO_UPPER upper boundary) and saves.
   * Expects a searched grid on an editable office; does nothing on a read-only one.
   */
  @step('Remove bands left by an earlier run')
  async purgeLeftovers(): Promise<number> {
    if (!(await this.page.locator(BTN_ADD_ROW).isVisible().catch(() => false))) return 0;
    const keys: string[] = [];
    for (let i = 0; i < (await this.rows().count()); i++) {
      const row = this.rows().nth(i);
      if (toNumber((await this.readRow(row))['Upper Tier Boundary'] ?? '') === AUTO_UPPER) keys.push(await this.keyOf(row));
    }
    for (const key of keys) await this.deleteRow(this.rowOf(key));
    if (keys.length) {
      await this.save();
      await this.search();
    }
    return keys.length;
  }

  // ---------------------------------------------------------------- unsaved-changes guard

  async isUnsavedDialogVisible(): Promise<boolean> {
    return this.page.locator(DLG_UNSAVED).isVisible();
  }

  @step('Wait for the Unsaved changes dialog')
  async getUnsavedDialog(): Promise<{ text: string; buttons: string[] }> {
    const dlg = this.page.locator(DLG_UNSAVED);
    await dlg.waitFor({ state: 'visible' });
    const buttons = (await dlg.getByRole('button').allInnerTexts()).map((t) => t.trim()).filter(Boolean);
    return { text: (await dlg.innerText()).replace(/\s+/g, ' ').trim(), buttons };
  }

  @step('Choose Stay in the Unsaved changes dialog')
  async stay(): Promise<void> {
    await this.page.locator(BTN_DLG_STAY).click();
    await this.page.locator(DLG_UNSAVED).waitFor({ state: 'hidden' });
  }

  /** Discards the edits; the action that asked then goes ahead. */
  @step('Choose Discard in the Unsaved changes dialog')
  async discard(): Promise<void> {
    await this.page.locator(BTN_DLG_DISCARD).click();
    await this.page.locator(DLG_UNSAVED).waitFor({ state: 'hidden' });
  }

  @step('Close the Unsaved changes dialog with Escape')
  async escapeDialog(): Promise<void> {
    await this.page.keyboard.press('Escape');
    await this.page.locator(DLG_UNSAVED).waitFor({ state: 'hidden' });
  }

  // ---------------------------------------------------------------- export / import

  /** Clicks Export (a direct download); returns the file name and its first sheet. */
  @step('Export the grid')
  async exportGrid(): Promise<{ name: string; rows: string[][] }> {
    const download = this.page.waitForEvent('download', { timeout: 90_000 });
    await this.toolbarButton('export').click();
    const file = await download;
    const path = test.info().outputPath(file.suggestedFilename());
    await file.saveAs(path);
    const book = XLSX.readFile(path);
    const sheet = book.Sheets[book.SheetNames[0]!]!;
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: '' })
      .map((r) => r.map((c) => String(c).trim()));
    return { name: file.suggestedFilename(), rows };
  }

  /**
   * Hands a file to the Import dialog and presses Upload when it allows it. Returns what the page then said (toast,
   * alert, browser alert or the dialog's own text) and how many uploads were sent, so a refused file can be shown
   * to have never left the browser.
   */
  @step('Import a file')
  async importFile(file: UploadFile): Promise<{ message: string; uploads: number }> {
    let uploads = 0;
    const onRequest = (r: Request) => {
      if (r.method() === 'POST' && /multipart\/form-data|octet-stream|spreadsheet/i.test(r.headers()['content-type'] ?? '')) uploads++;
    };
    let browserAlert = '';
    const onDialog = async (d: import('@playwright/test').Dialog) => {
      if (d.type() === 'beforeunload') return;
      browserAlert = d.message();
      await d.accept().catch(() => {});
    };
    this.page.on('request', onRequest);
    this.page.on('dialog', onDialog);
    try {
      await this.toolbarButton('import').click();
      const dialog = this.page.locator(DLG_IMPORT);
      await dialog.waitFor({ state: 'visible' });
      await dialog.locator(IMPORT_FILE_INPUT).setInputFiles(file);
      // Choosing a file starts the upload at once (Upload then stays disabled); press Upload only if it waits for it.
      const upload = dialog.locator(BTN_IMPORT_UPLOAD);
      if (await upload.isEnabled().catch(() => false)) await upload.click();
      // The dialog shows "Uploading... 50%" until the server answers; then the outcome replaces it (or the dialog closes).
      // A refused file type never starts an upload, so the wait ends at once for it.
      await expect.poll(async () => !(await dialog.isVisible()) || !/Uploading/i.test(await dialog.innerText().catch(() => '')),
        { timeout: 90_000 }).toBe(true);
      const feedback = await this.readFeedback(10_000).catch(() => '');
      const dialogText = (await dialog.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
      // The dialog stays open after an upload; its overlay would block every later click.
      if (await dialog.isVisible().catch(() => false)) {
        await dialog.getByRole('button', { name: /^(Cancel|Close)$/ }).first().click().catch(() => this.page.keyboard.press('Escape'));
        await dialog.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {});
      }
      return { message: browserAlert || feedback || dialogText, uploads };
    } finally {
      this.page.off('request', onRequest);
      this.page.off('dialog', onDialog);
    }
  }

  /** Builds an .xlsx in memory from a header row and data rows. */
  static workbook(rows: (string | number)[][]): Buffer {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), 'Sheet1');
    return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  // ---------------------------------------------------------------- copy panels

  /** Opens Copy → Copy Within Location or Copy to Locations. */
  @step('Open a Copy panel')
  async openCopy(kind: 'within' | 'locations'): Promise<Locator> {
    await this.page.locator(BTN_COPY_MENU).click();
    await this.page.locator(MENU_ITEM).filter({ hasText: kind === 'within' ? 'Copy Within Location' : 'Copy to Locations' }).click();
    const panel = this.page.locator('[role="dialog"]').filter({ hasText: kind === 'within' ? 'Within Location Copy' : 'Location To Location Copy' });
    await panel.waitFor({ state: 'visible' });
    return panel;
  }

  /** The destination rows of a Copy panel, with their labels and tick state. */
  @step('Read the destination ticks of a Copy panel')
  async copyTargets(panel: Locator): Promise<{ label: string; checked: boolean }[]> {
    return panel.locator(COPY_TARGET_ROW).evaluateAll((rows) => rows.map((r) => ({
      label: ((r.querySelector('td') as HTMLElement | null)?.innerText ?? '').trim(),
      checked: r.querySelector('[role="checkbox"]')?.getAttribute('aria-checked') === 'true',
    })));
  }

  /**
   * Ticks a destination by its label. The panel renders only the rows in view, so the list is scrolled down until
   * the destination appears.
   */
  @step('Tick a destination in a Copy panel by name')
  async tickTargetNamed(panel: Locator, label: string): Promise<void> {
    const row = panel.locator(COPY_TARGET_ROW).filter({ has: this.page.getByText(label, { exact: true }) }).first();
    for (let i = 0; i < 40 && !(await row.isVisible().catch(() => false)); i++) {
      await panel.locator(COPY_TARGET_ROW).last().scrollIntoViewIfNeeded();
      await panel.locator(COPY_TARGET_ROW).last().hover();
      await this.page.mouse.wheel(0, 600);
    }
    if (!(await row.isVisible().catch(() => false))) throw new Error(`The destination "${label}" is not offered`);
    await row.locator(CHECKBOX).click();
  }

  @step('Tick a destination in a Copy panel')
  async tickTarget(panel: Locator, index: number): Promise<void> {
    if (index < 0) throw new Error(`The destination is not offered: ${(await this.copyTargets(panel)).map((t) => t.label).join(', ')}`);
    await panel.locator(COPY_TARGET_ROW).nth(index).locator(CHECKBOX).click();
  }

  /** Picks the source service type of a Copy Within Location panel. */
  @step('Choose the copy source')
  async chooseCopySource(panel: Locator, serviceType: string): Promise<void> {
    const combo = panel.locator(COPY_SOURCE_SERVICE_TYPE);
    if (!(await combo.isVisible().catch(() => false))) return;
    await combo.click();
    await this.page.locator(OPTION).filter({ hasText: exactly(serviceType) }).first().click();
  }

  @step('Close a Copy panel')
  async closeCopy(panel: Locator, how: 'cancel' | 'escape'): Promise<void> {
    if (how === 'escape') await this.page.keyboard.press('Escape');
    else await panel.getByRole('button', { name: /^(Cancel|Close)$/ }).first().click();
    await panel.waitFor({ state: 'hidden' });
  }

  /** Applies a Copy panel; a Verify Conflicts dialog, when shown, is read and confirmed. */
  @step('Apply a Copy panel')
  async applyCopy(panel: Locator): Promise<{ conflicts: string | null; message: string }> {
    await panel.getByRole('button', { name: 'Apply', exact: true }).click();
    const conflictDlg = this.page.locator(DLG_CONFLICTS).last();
    let conflicts: string | null = null;
    if (await conflictDlg.waitFor({ state: 'visible', timeout: 10_000 }).then(() => true, () => false)) {
      conflicts = (await conflictDlg.innerText()).replace(/\s+/g, ' ').trim();
      await conflictDlg.getByRole('button', { name: /^(Continue|Overwrite|Yes|Confirm|Apply|OK)$/i }).first().click();
    }
    const message = await this.readFeedback(60_000).catch(() => '');
    return { conflicts, message };
  }

  // ---------------------------------------------------------------- reset dates modal

  @step('Open Reset Dates')
  async openResetDates(): Promise<Locator> {
    await this.toolbarButton('resetDates').click();
    const dlg = this.page.locator(DLG_RESET_DATES);
    await dlg.waitFor({ state: 'visible' });
    return dlg;
  }

  monthControl(month: number): Locator {
    return this.page.locator(DLG_RESET_DATES).locator(monthCombo(MONTHS[month]!, MONTH_NAMES[month]!)).first();
  }

  /** Options of a month selector (0 = January); the blank choice reads as "". */
  @step('Read the options of a month')
  async monthOptions(month: number): Promise<string[]> {
    return this.optionsOf(this.monthControl(month));
  }

  async monthValue(month: number): Promise<string> {
    return (await this.monthControl(month).innerText()).replace(/ /g, ' ').trim();
  }

  @step('Choose the reset day of a month')
  async setMonth(month: number, day: string): Promise<void> {
    await this.monthControl(month).click();
    await this.page.locator(LISTBOX).waitFor({ state: 'visible' });
    await this.page.locator(OPTION).filter({ hasText: day === '' ? /^\s*$/ : exactly(day) }).first().click();
    await this.page.locator(LISTBOX).waitFor({ state: 'hidden' });
  }

  /** Screen position of each month selector, for the two-column layout check. */
  async monthPositions(): Promise<{ x: number; y: number }[]> {
    const out: { x: number; y: number }[] = [];
    for (let m = 0; m < 12; m++) {
      const box = await this.monthControl(m).boundingBox();
      out.push({ x: Math.round(box?.x ?? -1), y: Math.round(box?.y ?? -1) });
    }
    return out;
  }

  /** The Current Period Total of the modal footer ("CPT : <value>"). */
  @step('Read the Current Period Total')
  async readCpt(): Promise<string> {
    const dlg = this.page.locator(DLG_RESET_DATES);
    await expect.poll(async () => /Current Period Total|CPT/i.test(await dlg.innerText()), { timeout: 30_000 }).toBe(true);
    const m = (await dlg.innerText()).match(/(?:Current Period Total|CPT)\s*:?\s*\n?\s*([^\n]+)/i);
    return (m?.[1] ?? '').trim();
  }

  @step('Save the reset dates')
  async saveResetDates(): Promise<{ message: string; stillOpen: boolean }> {
    const dlg = this.page.locator(DLG_RESET_DATES);
    await dlg.getByRole('button', { name: 'Save', exact: true }).click();
    const message = await this.readFeedback(30_000).catch(() => '');
    return { message, stillOpen: await dlg.isVisible() };
  }

  @step('Cancel the reset dates')
  async cancelResetDates(): Promise<void> {
    const dlg = this.page.locator(DLG_RESET_DATES);
    await dlg.getByRole('button', { name: 'Cancel', exact: true }).click();
    await dlg.waitFor({ state: 'hidden' });
  }

  // ---------------------------------------------------------------- grid options and sorting

  @step('Read the Grid Options column list')
  async getGridOptionColumns(): Promise<{ label: string; checked: boolean }[]> {
    await this.page.locator(BTN_GRID_OPTIONS).click();
    await this.page.locator(MENU).waitFor({ state: 'visible' });
    const items = await this.page.locator(MENU_CHECKBOX).evaluateAll((els) =>
      els.map((e) => ({ label: (e as HTMLElement).innerText.trim(), checked: e.getAttribute('aria-checked') === 'true' })));
    await this.page.keyboard.press('Escape');
    await this.page.locator(MENU).waitFor({ state: 'hidden' });
    return items;
  }

  @step('Sort a column from its header menu')
  async sortBy(column: string, direction: 'ascending' | 'descending'): Promise<void> {
    const header = this.page.locator(HEADERS).filter({ has: this.page.locator(HEADER_MENU_TRIGGER, { hasText: exactly(column) }) }).first();
    await header.locator(HEADER_MENU_TRIGGER).click();
    await this.page.locator(MENU_ITEM).filter({ hasText: `Sort ${direction}` }).click();
    await this.waitForResults();
  }

  // ---------------------------------------------------------------- paging

  pager(): Locator {
    return this.page.locator(TXT_PAGE_NUMBER);
  }

  @step('Read the page position')
  async getPagePosition(): Promise<{ page: number; of: number }> {
    const box = this.page.locator(TXT_PAGE_NUMBER);
    const page = Number(await box.inputValue());
    const of = Number((await box.locator('xpath=..').innerText()).match(/\/\s*(\d+)/)?.[1] ?? Number.NaN);
    return { page, of };
  }

  @step('Go to another page')
  async goToPage(which: 'first' | 'previous' | 'next' | 'last'): Promise<{ page: number; of: number }> {
    const button = { first: BTN_FIRST_PAGE, previous: BTN_PREV_PAGE, next: BTN_NEXT_PAGE, last: BTN_LAST_PAGE }[which];
    const before = await this.getPagePosition();
    await this.page.locator(button).click();
    await expect.poll(async () => (await this.getPagePosition()).page).not.toBe(before.page);
    await this.waitForResults();
    return this.getPagePosition();
  }

  /** Types into the page number box and presses Enter; returns what the pager then shows. */
  @step('Type a page number')
  async typePage(value: string): Promise<{ page: number; of: number; box: string }> {
    const box = this.page.locator(TXT_PAGE_NUMBER);
    await box.click();
    await box.press('ControlOrMeta+a');
    await box.press('Backspace');
    if (value !== '') await box.pressSequentially(value);
    await box.press('Enter');
    await this.waitForResults();
    return { ...(await this.getPagePosition()), box: await box.inputValue() };
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
    const box = this.page.locator(ROWS_PER_PAGE);
    return { current: (await box.innerText()).trim(), options: await this.optionsOf(box) };
  }

  @step('Choose rows per page')
  async setPageSize(size: string): Promise<void> {
    await this.page.locator(ROWS_PER_PAGE).click();
    await this.page.locator(OPTION).filter({ hasText: exactly(size) }).click();
    await this.waitForResults();
  }

  // ---------------------------------------------------------------- page-level checks

  /** True when the page scrolls sideways (the grid may scroll inside itself, the page must not). */
  async pageOverflows(): Promise<boolean> {
    return this.page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  }

  /** Visible text that looks like an untranslated key ("commission.tier.title", "VALID_MSG_4", "{{x}}"). */
  @step('Look for untranslated text keys')
  async findRawI18nKeys(): Promise<string[]> {
    const text = `${await this.page.locator('main').innerText()}\n${await this.page.locator(DIALOG).allInnerTexts().then((t) => t.join('\n'))}`;
    return [...new Set(text.match(/\b[a-z][a-zA-Z]+(?:\.[a-zA-Z0-9_]+){2,}\b|\b[A-Z]+_MSG_\d+\b|\{\{[^}]+\}\}/g) ?? [])];
  }
}
