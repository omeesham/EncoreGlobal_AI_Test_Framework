import { Locator, Page } from '@playwright/test';
import { step } from '../../fixtures/step-decorator';
import { BasePage } from '../base.page';
import { Log } from '../../utils/logger';
import { IConfig } from '../../types';
import {
  HEADER_TITLE,
  APP_ERROR,
  BTN_INFO,
  TOOLTIP,
  BTN_COLLAPSE_PANEL,
  BTN_EXPAND_PANEL,
  LOCAL_OFFICE_CARD,
  TAB,
  LEFT_PANEL,
  LEFT_SEARCH,
  LEFT_ROWS,
  LEFT_HEADERS,
  RIGHT_PANEL,
  BTN_PRINT,
  BTN_SAVE,
  RIGHT_SEARCH,
  BTN_GRID_OPTIONS,
  RIGHT_ROWS,
  RIGHT_HEADERS,
  RIGHT_DROP_ZONE,
  BTN_ROW_DELETE,
  EMPTY_STATE_TITLE,
  HEADER_MENU_TRIGGER,
  MENU,
  MENU_ITEM,
  MENU_CHECKBOX,
  resizeHandle,
  DLG_UNSAVED,
  BTN_DLG_STAY,
  BTN_DLG_DISCARD,
  SIDEBAR_SETUP,
  SIDEBAR_PRICE_GUIDE,
  sidebarPriceGuideFor,
  SIDEBAR_HOME,
  LOCATION_SWITCHER,
  switcherOffice,
  SWITCHER_SEARCH,
  USER_MENU,
  themeOption,
  THEME_SELECTED,
  PRINT_COPY,
} from '../../selectors/price-guide/price-guide';
import { RIGHT_COLUMNS, TEXT } from '../../data/price-guide/price-guide';

export type Side = 'left' | 'right';

export interface GuideRow {
  name: string;
  price: string;
  itemType?: string;
}

export interface GridOption {
  label: string;
  checked: boolean;
}

export type Theme = 'system' | 'light' | 'dark';

export interface LowContrastText {
  text: string;
  ratio: number;
}

export interface PrintView {
  buttons: string[];
  deleteIcons: number;
  officeNameShown: boolean;
  rows: number;
}

// The list can take ~10 s to swap its loading state for 4,000 rows on a cold office.
const READY_TIMEOUT_MS = 60_000;

// The test environment now and then answers with its "Unexpected error" screen for a few minutes
// at a time; three loads a few seconds apart ride out a short burst.
const LOAD_ATTEMPTS = 3;
const RETRY_PAUSE_MS = 5_000;

/** localStorage entry holding the left list's column sizes, order, visibility and sort. */
const LEFT_TABLE_SETTINGS_KEY = 'price-guide-source-table-settings-v3';

function isDefaultLeftLayout(json: string): boolean {
  try {
    const s = JSON.parse(json) as { columnVisibility?: object; columnSizing?: object; sorting?: unknown[]; columnOrder?: string[] };
    return Object.keys(s.columnVisibility ?? {}).length === 0
      && Object.keys(s.columnSizing ?? {}).length === 0
      && (s.sorting ?? []).length === 0
      && JSON.stringify(s.columnOrder ?? ['drag', 'name', 'price']) === JSON.stringify(['drag', 'name', 'price']);
  } catch {
    return false;
  }
}

// Search filters as you type with no Enter; the count settles once two reads 600 ms apart agree.
const COUNT_SETTLE_MS = 600;

/** Parses "4,000 items found" → 4000. */
export const parseCount = (text: string): number => {
  const m = text.match(/([\d,]+)\s+items?\s+found/i);
  if (!m) throw new Error(`No "items found" count in: ${text.slice(0, 120)}`);
  return Number(m[1]!.replace(/,/g, ''));
};

/** "1,705.00" → 1705. */
export const parsePrice = (text: string): number => Number(text.replace(/,/g, '').trim());

// Setup → Price Guide. Left: Packages / Product Groups lists to pick from. Right: the office's
// Price Guide Recommendations, built by double-click or drag and drop.
// Save does not persist anything as of 2026-10-06 (no request is sent) — callers that save must
// verify persistence by reloading, never by the Save button's state.
export class PriceGuidePage extends BasePage {
  private officeNo = '';

  constructor(page: Page, config?: IConfig) {
    super(page, config);
    Log.info('PriceGuidePage initialized');
  }

  private url(officeNo: string): string {
    return `${this.config?.base_url || ''}locations/${officeNo}/settings/price-guide`;
  }

  private panel(side: Side): Locator {
    return this.page.locator(side === 'left' ? LEFT_PANEL : RIGHT_PANEL);
  }

  // ---------------------------------------------------------------- navigation & ready

  // window.print would open a native dialog that blocks the run; it is replaced before the page
  // loads with a counter, so Print can be asserted without printing.
  private async stubPrint(): Promise<void> {
    await this.page.addInitScript(() => {
      const w = window as unknown as { __printCalls: number; print: () => void };
      w.__printCalls = 0;
      w.print = () => { w.__printCalls += 1; };
    });
  }

  /** Opens Price Guide for an office, waits for both panels, and restores the default columns. */
  @step('Open the Price Guide page for an office')
  async open(officeNo: string): Promise<void> {
    this.officeNo = officeNo;
    await this.stubPrint();
    await this.safeNavigateTo('about:blank');
    await this.navigateTo(this.url(officeNo));
    await this.waitForReadyOrRetry();
    await this.ensureDefaultView();
  }

  /** Re-reads the page; unsaved edits are dropped (the leave-page warning is accepted). */
  @step('Reload the Price Guide page')
  async reload(): Promise<void> {
    await this.safeNavigateTo(this.url(this.officeNo));
    await this.waitForReady();
  }

  // The page occasionally answers a normal load with its own "Unexpected error" screen, or hangs on
  // the loading skeleton; a few reloads (LOAD_ATTEMPTS) recover both. Logged, so a run that needs
  // them more often shows up in the log.
  private async waitForReadyOrRetry(reloadFirst = false): Promise<void> {
    if (reloadFirst) await this.navigateTo(this.url(this.officeNo));
    for (let attempt = 1; attempt <= LOAD_ATTEMPTS; attempt++) {
      const outcome = await this.panelOrError();
      if (outcome === 'ready') {
        await this.waitForReady();
        // The error screen can also replace the page just after it loaded.
        if (!(await this.page.locator(APP_ERROR).first().isVisible().catch(() => false))) return;
      }
      if (attempt === LOAD_ATTEMPTS) throw new Error(`Price Guide for office ${this.officeNo} did not load in ${LOAD_ATTEMPTS} attempts (${outcome})`);
      Log.warn(`Price Guide for office ${this.officeNo} did not load (${outcome}) — reloading (attempt ${attempt + 1} of ${LOAD_ATTEMPTS})`);
      await this.page.waitForTimeout(RETRY_PAUSE_MS);
      await this.navigateTo(this.url(this.officeNo));
    }
  }

  private async panelOrError(): Promise<'ready' | 'error' | 'stuck loading'> {
    return Promise.race([
      this.page.locator(RIGHT_PANEL).waitFor({ state: 'visible', timeout: READY_TIMEOUT_MS }).then(() => 'ready' as const),
      this.page.locator(APP_ERROR).first().waitFor({ state: 'visible', timeout: READY_TIMEOUT_MS }).then(() => 'error' as const),
    ]).catch(() => 'stuck loading' as const);
  }

  @step('Wait for the Price Guide lists to load')
  async waitForReady(timeout = READY_TIMEOUT_MS): Promise<void> {
    await this.page.locator(RIGHT_PANEL).waitFor({ state: 'visible', timeout });
    await this.page.locator(LEFT_PANEL).locator('text=/items? found/').first().waitFor({ state: 'visible', timeout });
    await this.page.locator(RIGHT_PANEL).locator('text=/items? found/').first().waitFor({ state: 'visible', timeout });
    // A tab with no data shows "0 items found" and no rows, which is a valid ready state.
    await this.page.waitForFunction(
      ({ left }) => {
        const p = document.querySelector(left);
        if (!p) return false;
        const zero = /\b0 items? found/.test(p.textContent || '');
        return zero || p.querySelectorAll('tbody tr[draggable="true"]').length > 0;
      },
      { left: LEFT_PANEL },
      { timeout },
    );
    await this.page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  }

  @step('Open Price Guide from the Setup menu')
  async openViaSetupMenu(officeNo: string): Promise<void> {
    this.officeNo = officeNo;
    await this.stubPrint();
    await this.navigateTo(`${this.config?.base_url || ''}locations/${officeNo}/home`);
    // The sidebar hydrates after the Home page itself, so the Setup entry gets its own wait.
    const setup = this.page.locator(SIDEBAR_SETUP).first();
    await setup.waitFor({ state: 'visible', timeout: 30_000 });
    await setup.click();
    // Until the office has loaded, the entry links to "locations//settings/price-guide" and the
    // click lands on a page that never renders; wait for the link to name the office.
    const href = await this.page.locator(SIDEBAR_PRICE_GUIDE).first().getAttribute('href');
    if (!href?.includes(`/locations/${officeNo}/`)) Log.warn(`Setup > Price Guide linked to "${href}" before office ${officeNo} loaded — waiting for the office link`);
    await this.page.locator(sidebarPriceGuideFor(officeNo)).first().click({ timeout: 30_000 });
    await this.page.waitForURL(new RegExp(`/locations/${officeNo}/settings/price-guide$`), { timeout: 30_000 });
    await this.waitForReady();
  }

  /** Opens the office Home page and the Setup menu, and reports whether Price Guide is offered. */
  @step('Look for Price Guide in the Setup menu')
  async isPriceGuideInSetupMenu(officeNo: string): Promise<boolean> {
    this.officeNo = officeNo;
    await this.navigateTo(`${this.config?.base_url || ''}locations/${officeNo}/home`);
    await this.page.locator(SIDEBAR_HOME).first().waitFor({ state: 'visible', timeout: 30_000 });
    const setup = this.page.locator(SIDEBAR_SETUP).first();
    // A user without settings rights may have no Setup entry at all.
    if (!(await setup.isVisible().catch(() => false))) return false;
    await setup.click();
    await this.page.locator(MENU).first().waitFor({ state: 'visible', timeout: 10_000 });
    // Entries fill in once the office has loaded; give them that time before reading.
    await this.page.waitForTimeout(2_000);
    const offered = (await this.page.locator(SIDEBAR_PRICE_GUIDE).count()) > 0;
    await this.closeMenu();
    return offered;
  }

  /** Whether the Price Guide recommendations panel and its Save button are on screen. */
  async isEditorVisible(): Promise<boolean> {
    return (await this.page.locator(RIGHT_PANEL).isVisible().catch(() => false))
      || (await this.page.locator(BTN_SAVE).isVisible().catch(() => false));
  }

  @step('Open Price Guide with a given office id in the URL')
  async openRaw(officeId: string): Promise<string> {
    await this.navigateTo(this.url(officeId));
    await this.page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
    await this.page.locator('main').waitFor({ state: 'visible', timeout: 30_000 });
    await this.page.waitForTimeout(1_500);
    return (await this.page.locator('main').innerText()).replace(/\s+/g, ' ').trim();
  }

  // ---------------------------------------------------------------- header, card, panel

  @step('Read the page header')
  async getHeaderText(): Promise<string> {
    return (await this.page.locator(HEADER_TITLE).first().innerText()).trim();
  }

  @step('Read the information tooltip next to the header')
  async getInfoTooltip(): Promise<string> {
    await this.page.locator(BTN_INFO).first().hover();
    const tip = this.page.locator(TOOLTIP).first();
    await tip.waitFor({ state: 'visible', timeout: 5_000 });
    return (await tip.innerText()).trim();
  }

  @step('Move the mouse away from the header')
  async moveMouseAway(): Promise<void> {
    await this.page.mouse.move(5, 900);
    await this.page.locator(TOOLTIP).first().waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
  }

  async isTooltipVisible(): Promise<boolean> {
    return this.page.locator(TOOLTIP).first().isVisible().catch(() => false);
  }

  @step('Read the Local Office card')
  async getLocalOfficeText(): Promise<string> {
    return (await this.page.locator(LOCAL_OFFICE_CARD).innerText()).replace(/\s+/g, ' ').trim();
  }

  @step('Collapse the search panel')
  async collapsePanel(): Promise<void> {
    await this.page.locator(BTN_COLLAPSE_PANEL).click();
    await this.page.locator(BTN_EXPAND_PANEL).waitFor({ state: 'visible', timeout: 5_000 });
    // The panel animates to zero width; wait for the end of it, not just the button swap.
    await this.page.waitForFunction((sel) => (document.querySelector(sel)?.getBoundingClientRect().width ?? 0) < 2, LEFT_PANEL, { timeout: 5_000 });
  }

  @step('Expand the search panel')
  async expandPanel(): Promise<void> {
    await this.page.locator(BTN_EXPAND_PANEL).click();
    await this.page.locator(BTN_COLLAPSE_PANEL).waitFor({ state: 'visible', timeout: 5_000 });
    await this.page.waitForFunction((sel) => (document.querySelector(sel)?.getBoundingClientRect().width ?? 0) > 100, LEFT_PANEL, { timeout: 5_000 });
  }

  async isLeftPanelVisible(): Promise<boolean> {
    return this.page.locator(LEFT_PANEL).isVisible().catch(() => false);
  }

  async getPanelWidth(side: Side): Promise<number> {
    return (await this.panel(side).boundingBox())?.width ?? 0;
  }

  // ---------------------------------------------------------------- tabs, counts, search

  @step('Switch the left list to a tab')
  async switchTab(name: 'Packages' | 'Product Groups'): Promise<void> {
    const tab = this.page.locator(TAB(name));
    await tab.click();
    await this.page.waitForFunction((el) => el?.getAttribute('aria-selected') === 'true', await tab.elementHandle(), { timeout: 10_000 });
    await this.waitForCountStable('left');
  }

  async getActiveTab(): Promise<string> {
    return (await this.page.locator('main [data-slot="underlined-tabs-list"] [role="tab"][aria-selected="true"]').innerText()).trim();
  }

  @step('Read an "items found" count')
  async getCount(side: Side): Promise<number> {
    return parseCount(await this.panel(side).innerText());
  }

  /** Waits until the count stops changing — search and tab switches re-query as you type. */
  async waitForCountStable(side: Side, timeout = 30_000): Promise<number> {
    const deadline = Date.now() + timeout;
    let last = -1;
    while (Date.now() < deadline) {
      await this.page.waitForTimeout(COUNT_SETTLE_MS);
      const now = await this.getCount(side).catch(() => -2);
      if (now === last && now >= 0) return now;
      last = now;
    }
    return last;
  }

  @step('Type into a search box')
  async search(side: Side, text: string): Promise<number> {
    await this.page.locator(side === 'left' ? LEFT_SEARCH : RIGHT_SEARCH).fill(text);
    return this.waitForCountStable(side);
  }

  async getSearchValue(side: Side): Promise<string> {
    return this.page.locator(side === 'left' ? LEFT_SEARCH : RIGHT_SEARCH).inputValue();
  }

  @step('Read whether a panel shows "No results"')
  async showsNoResults(side: Side): Promise<boolean> {
    return (await this.panel(side).innerText()).includes(TEXT.noResults);
  }

  // ---------------------------------------------------------------- reading rows

  /** Header labels in DOM order, blanks kept, so the index lines up with each row's cells. */
  @step('Read the column headers')
  async getHeaders(side: Side): Promise<string[]> {
    const raw = await this.page.locator(side === 'left' ? LEFT_HEADERS : RIGHT_HEADERS).allInnerTexts();
    return raw.map((h) => h.replace(/\s+/g, ' ').trim());
  }

  async getVisibleColumnNames(side: Side): Promise<string[]> {
    return (await this.getHeaders(side)).filter((h) => h.length > 0);
  }

  // Cells are read through the header map: hiding a column shifts every cell after it, so a fixed
  // index would read the wrong field.
  @step('Read the rows of a list')
  async getRows(side: Side, limit = Number.MAX_SAFE_INTEGER): Promise<GuideRow[]> {
    const headers = await this.getHeaders(side);
    const rows = this.page.locator(side === 'left' ? LEFT_ROWS : RIGHT_ROWS);
    const cells = await rows.evaluateAll((trs, max) => trs.slice(0, max).map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => (td as HTMLElement).innerText.replace(/\s+/g, ' ').trim())), limit);
    const at = (label: string) => headers.indexOf(label);
    return cells.map((c) => ({
      name: at('Name') >= 0 ? c[at('Name')] ?? '' : '',
      price: at('Price') >= 0 ? c[at('Price')] ?? '' : '',
      ...(side === 'right' ? { itemType: at('Item Type') >= 0 ? c[at('Item Type')] ?? '' : '' } : {}),
    }));
  }

  async getRowCount(side: Side): Promise<number> {
    return this.page.locator(side === 'left' ? LEFT_ROWS : RIGHT_ROWS).count();
  }

  private leftRow(indexOrName: number | string): Locator {
    const rows = this.page.locator(LEFT_ROWS);
    if (typeof indexOrName === 'number') return rows.nth(indexOrName);
    // Exact cell match: names share long prefixes ("… Front Projection" / "… Front Projection (#25)").
    return rows.filter({ has: this.page.getByRole('cell', { name: indexOrName, exact: true }) }).first();
  }

  private rightRow(name: string): Locator {
    return this.page.locator(RIGHT_ROWS).filter({ has: this.page.getByRole('cell', { name, exact: true }) }).first();
  }

  @step('Scroll the left list to its last row')
  async scrollLeftToEnd(): Promise<GuideRow | undefined> {
    for (let i = 0; i < 4; i++) {
      await this.page.locator(LEFT_PANEL).locator('tbody').evaluate((tb) => {
        let p = tb.parentElement;
        while (p && !(p.scrollHeight > p.clientHeight + 5 && /auto|scroll/.test(getComputedStyle(p).overflowY))) p = p.parentElement;
        if (p) p.scrollTop = p.scrollHeight;
      });
      await this.page.waitForTimeout(1_000);
    }
    const all = await this.getRows('left');
    return all[all.length - 1];
  }

  // ---------------------------------------------------------------- column menus, sort, resize

  private headerCell(side: Side, label: string): Locator {
    return this.page.locator(side === 'left' ? LEFT_HEADERS : RIGHT_HEADERS).filter({ hasText: label }).first();
  }

  @step('Open a column header menu')
  async openHeaderMenu(side: Side, column: string): Promise<string[]> {
    await this.headerCell(side, column).locator(HEADER_MENU_TRIGGER).first().click();
    await this.page.locator(MENU).first().waitFor({ state: 'visible', timeout: 5_000 });
    return (await this.page.locator(MENU_ITEM).allInnerTexts()).map((t) => t.trim());
  }

  @step('Pick an entry from a column header menu')
  async headerMenuAction(side: Side, column: string, action: 'Sort ascending' | 'Sort descending' | 'Hide column'): Promise<void> {
    await this.openHeaderMenu(side, column);
    await this.page.locator(MENU_ITEM).filter({ hasText: action }).first().click();
    await this.page.locator(MENU).first().waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
    if (action !== 'Hide column') await this.waitForCountStable(side);
  }

  async closeMenu(): Promise<void> {
    await this.page.keyboard.press('Escape');
    await this.page.locator(MENU).first().waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => {});
  }

  async getColumnWidth(side: Side, column: string): Promise<number> {
    return (await this.headerCell(side, column).boundingBox())?.width ?? 0;
  }

  @step('Drag a column resize handle')
  async resizeColumn(side: Side, columnId: string, dx: number): Promise<void> {
    const handle = this.panel(side).locator(resizeHandle(columnId)).first();
    const box = await handle.boundingBox();
    if (!box) throw new Error(`Resize handle for "${columnId}" is not on screen`);
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await this.page.mouse.move(x, y);
    await this.page.mouse.down();
    await this.page.mouse.move(x + dx, y, { steps: 12 });
    await this.page.mouse.up();
  }

  // The grip at the left of each header; a reorder needs a press, a small move to arm the sensor,
  // then the travel to the target header.
  @step('Drag a column header by its grip onto another column')
  async dragColumnHeader(side: Side, from: string, to: string): Promise<void> {
    // Headers are native HTML5 draggables; once a drag starts the page lays an overlay over
    // everything, so a mouse drop never reaches the target. The drag events are sent directly.
    const src = this.headerCell(side, from);
    const dst = this.headerCell(side, to);
    const box = await dst.boundingBox();
    if (!box) throw new Error(`Column header "${to}" is not on screen`);
    const dataTransfer = await this.page.evaluateHandle(() => new DataTransfer());
    const at = { dataTransfer, clientX: box.x + 10, clientY: box.y + box.height / 2 };
    await src.dispatchEvent('dragstart', { dataTransfer });
    await dst.dispatchEvent('dragenter', at);
    await dst.dispatchEvent('dragover', at);
    await dst.dispatchEvent('drop', at);
    await src.dispatchEvent('dragend', { dataTransfer });
    await this.page.waitForTimeout(500);
  }

  // ---------------------------------------------------------------- Grid Options (right grid)

  @step('Read the Grid Options menu')
  async getGridOptions(): Promise<{ reset: boolean; columns: GridOption[] }> {
    await this.page.locator(BTN_GRID_OPTIONS).click();
    await this.page.locator(MENU).first().waitFor({ state: 'visible', timeout: 5_000 });
    const reset = await this.page.locator(MENU_ITEM).filter({ hasText: TEXT.gridOptionsReset }).count() > 0;
    const columns = await this.page.locator(MENU_CHECKBOX).evaluateAll((items) => items.map((i) => ({ label: ((i as HTMLElement).innerText || '').trim(), checked: i.getAttribute('aria-checked') === 'true' })));
    await this.closeMenu();
    return { reset, columns };
  }

  // The menu closes after each tick, so it is reopened per column.
  @step('Open the Grid Options menu')
  async openGridOptions(): Promise<void> {
    await this.page.locator(BTN_GRID_OPTIONS).click();
    await this.page.locator(MENU).first().waitFor({ state: 'visible', timeout: 5_000 });
  }

  @step('Tick or untick a column in Grid Options')
  async toggleGridColumn(label: string): Promise<void> {
    await this.page.locator(BTN_GRID_OPTIONS).click();
    await this.page.locator(MENU).first().waitFor({ state: 'visible', timeout: 5_000 });
    await this.page.locator(MENU_CHECKBOX).filter({ hasText: label }).first().click();
    await this.closeMenu();
  }

  @step('Reset the grid to its default view')
  async resetDefaultView(): Promise<void> {
    await this.page.locator(BTN_GRID_OPTIONS).click();
    await this.page.locator(MENU).first().waitFor({ state: 'visible', timeout: 5_000 });
    await this.page.locator(MENU_ITEM).filter({ hasText: TEXT.gridOptionsReset }).first().click();
    await this.closeMenu();
  }

  // Both grids keep their layout (sizes, order, hidden columns, sort) in this browser's
  // localStorage, and the suite reuses one browser per worker, so a resize or hidden column from an
  // earlier test carries over; every open starts from the default view.
  @step('Make sure both grids show their default layout')
  async ensureDefaultView(): Promise<void> {
    const left = await this.page.evaluate((key) => localStorage.getItem(key), LEFT_TABLE_SETTINGS_KEY);
    if (left && !isDefaultLeftLayout(left)) {
      Log.info(`Left list layout was ${left} — clearing it`);
      await this.page.evaluate((key) => localStorage.removeItem(key), LEFT_TABLE_SETTINGS_KEY);
      await this.waitForReadyOrRetry(true);
    }
    if (await this.page.locator(APP_ERROR).first().isVisible().catch(() => false)) await this.waitForReadyOrRetry(true);
    const cols = await this.getVisibleColumnNames('right');
    if (JSON.stringify(cols) !== JSON.stringify(RIGHT_COLUMNS)) {
      Log.info(`Recommendations columns were ${JSON.stringify(cols)} — resetting to default view`);
      await this.resetDefaultView();
    }
  }

  // ---------------------------------------------------------------- adding recommendations

  @step('Double-click an item in the left list')
  async addByDoubleClick(indexOrName: number | string): Promise<GuideRow> {
    const row = this.leftRow(indexOrName);
    const [item] = await this.rowData(row);
    // The Name cell, not the grip cell — the grip starts a drag.
    await row.locator('td').nth(1).dblclick();
    await this.page.waitForTimeout(400);
    return item!;
  }

  @step('Drag an item from the left list onto the recommendations grid')
  async addByDrag(indexOrName: number | string): Promise<GuideRow> {
    const row = this.leftRow(indexOrName);
    const [item] = await this.rowData(row);
    await row.locator('td').first().dragTo(this.page.locator(RIGHT_DROP_ZONE));
    await this.page.waitForTimeout(400);
    return item!;
  }

  @step('Drag an item from the left list and drop it somewhere else')
  async dragLeftItemTo(indexOrName: number | string, target: 'left list' | 'page header'): Promise<void> {
    const row = this.leftRow(indexOrName);
    const to = target === 'left list' ? this.page.locator(LEFT_ROWS).nth(8) : this.page.locator(HEADER_TITLE).first();
    await row.locator('td').first().dragTo(to);
    await this.page.waitForTimeout(400);
  }

  private async rowData(row: Locator): Promise<GuideRow[]> {
    const headers = await this.getHeaders('left');
    const cells = await row.evaluate((tr) => Array.from(tr.querySelectorAll('td')).map((td) => (td as HTMLElement).innerText.replace(/\s+/g, ' ').trim()));
    return [{ name: cells[headers.indexOf('Name')] ?? '', price: cells[headers.indexOf('Price')] ?? '' }];
  }

  @step('Press a key on a focused left-list row')
  async pressKeyOnLeftRow(index: number, key: string): Promise<void> {
    const row = this.leftRow(index);
    await row.focus();
    await row.press(key);
    await this.page.waitForTimeout(400);
  }

  // ---------------------------------------------------------------- removing, saving

  @step('Delete a recommendation')
  async deleteRecommendation(name: string): Promise<void> {
    await this.rightRow(name).locator(BTN_ROW_DELETE).click();
    await this.page.waitForTimeout(300);
  }

  @step('Delete every recommendation')
  async deleteAllRecommendations(): Promise<void> {
    for (let i = 0; i < 200 && (await this.getRowCount('right')) > 0; i++) {
      await this.page.locator(RIGHT_ROWS).first().locator(BTN_ROW_DELETE).click();
      await this.page.waitForTimeout(150);
    }
  }

  async isConfirmDialogVisible(): Promise<boolean> {
    return this.page.locator('[role="alertdialog"], [role="dialog"]').first().isVisible().catch(() => false);
  }

  async isSaveEnabled(): Promise<boolean> {
    return !(await this.page.locator(BTN_SAVE).isDisabled());
  }

  async isEmptyStateVisible(): Promise<boolean> {
    return this.page.locator(EMPTY_STATE_TITLE).isVisible().catch(() => false);
  }

  async getRightPanelText(): Promise<string> {
    return (await this.panel('right').innerText()).replace(/\s+/g, ' ').trim();
  }

  /** Clicks Save and returns the non-GET requests the page made in the next few seconds. */
  @step('Click Save')
  async clickSave(): Promise<{ requests: string[]; toasts: string[] }> {
    const requests: string[] = [];
    const onRequest = (r: { method(): string; url(): string }) => {
      if (r.method() !== 'GET' && /price-guide|pricing|\/api\//i.test(r.url())) requests.push(`${r.method()} ${r.url()}`);
    };
    this.page.on('request', onRequest);
    await this.page.locator(BTN_SAVE).click();
    await this.page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await this.page.waitForTimeout(1_500);
    this.page.off('request', onRequest);
    const toasts = (await this.page.locator('[data-sonner-toast]').allInnerTexts()).map((t) => t.trim()).filter(Boolean);
    return { requests, toasts };
  }

  /** Removes every recommendation and saves, so the office is left empty. */
  @step('Clean up: remove all recommendations and save')
  async clearAndSave(): Promise<void> {
    await this.deleteAllRecommendations();
    if (await this.isSaveEnabled()) await this.clickSave();
  }

  // ---------------------------------------------------------------- print

  @step('Click Print')
  async clickPrint(): Promise<number> {
    const btn = this.page.locator(BTN_PRINT);
    if (await btn.isDisabled()) return -1;
    await btn.click();
    await this.page.waitForTimeout(800);
    return this.page.evaluate(() => (window as unknown as { __printCalls?: number }).__printCalls ?? 0);
  }

  async isPrintEnabled(): Promise<boolean> {
    return !(await this.page.locator(BTN_PRINT).isDisabled());
  }

  /** What a printout would show: the page rendered with print styles. */
  @step('Look at the page as it would print')
  async getPrintView(): Promise<PrintView> {
    await this.page.emulateMedia({ media: 'print' });
    try {
      await this.page.waitForTimeout(500);
      const buttons = (await this.page.locator('button:visible').allInnerTexts()).map((t) => t.trim()).filter((t) => ['Print', 'Save', 'Grid Options'].includes(t));
      const searchVisible = await this.page.locator(`${RIGHT_SEARCH}:visible, input[data-slot="input"]:visible`).count();
      return {
        buttons: searchVisible ? [...buttons, 'Search'] : buttons,
        deleteIcons: await this.page.locator(`${BTN_ROW_DELETE}:visible`).count(),
        officeNameShown: await this.page.getByText(new RegExp(`^${this.officeNo} - `)).first().isVisible().catch(() => false),
        rows: await this.page.locator('tbody tr:visible:has(td)').count(),
      };
    } finally {
      await this.page.emulateMedia({ media: 'screen' });
    }
  }

  // ---------------------------------------------------------------- leaving the page

  @step('Click Home in the sidebar')
  async clickSidebarHome(): Promise<void> {
    await this.page.locator(SIDEBAR_HOME).first().click();
    await this.page.waitForTimeout(1_500);
  }

  async isUnsavedDialogVisible(): Promise<boolean> {
    return this.page.locator(DLG_UNSAVED).isVisible().catch(() => false);
  }

  async getUnsavedDialogText(): Promise<string> {
    return (await this.page.locator(DLG_UNSAVED).innerText()).replace(/\s+/g, ' ').trim();
  }

  @step('Choose Stay in the Unsaved changes dialog')
  async stay(): Promise<void> {
    await this.page.locator(BTN_DLG_STAY).click();
    await this.page.locator(DLG_UNSAVED).waitFor({ state: 'hidden', timeout: 5_000 });
  }

  @step('Choose Discard in the Unsaved changes dialog')
  async discard(): Promise<void> {
    await this.page.locator(BTN_DLG_DISCARD).click();
    await this.page.locator(DLG_UNSAVED).waitFor({ state: 'hidden', timeout: 5_000 });
    await this.page.waitForLoadState('domcontentloaded');
  }

  /** Reloads and reports the browser dialog type, dismissing it so the page stays. */
  @step('Reload the browser tab and catch the leave-page warning')
  async reloadAndCatchWarning(): Promise<string> {
    // The suite fixture auto-accepts every dialog, which would let the reload through; it is set
    // aside for this one check so the warning can be cancelled, then put back.
    // Page is an EventEmitter at runtime; its typings just do not declare listeners().
    const others = (this.page as unknown as NodeJS.EventEmitter).listeners('dialog');
    this.page.removeAllListeners('dialog');
    try {
      const seen = new Promise<string>((resolve) => {
        const timer = setTimeout(() => resolve('none'), 6_000);
        this.page.once('dialog', async (d) => {
          clearTimeout(timer);
          const type = d.type();
          await d.dismiss().catch(() => {});
          resolve(type);
        });
      });
      void this.page.reload().catch(() => {});
      const type = await seen;
      await this.page.waitForTimeout(1_000);
      return type;
    } finally {
      this.page.removeAllListeners('dialog');
      for (const l of others) this.page.on('dialog', l as (d: import('@playwright/test').Dialog) => void);
    }
  }

  @step('Pick another office in the location switcher')
  async switchOffice(code: string): Promise<void> {
    await this.page.locator(LOCATION_SWITCHER).first().click();
    // The list shows only offices recently used in this browser; the search box finds any office.
    await this.page.locator(SWITCHER_SEARCH).first().fill(code);
    await this.page.locator(switcherOffice(code)).first().click();
    await this.page.waitForTimeout(1_500);
  }

  getUrlPath(): string {
    return new URL(this.page.url()).pathname;
  }

  // ---------------------------------------------------------------- theme

  /** Picks System, Light or Dark in the user menu. The choice is kept in this browser only. */
  @step('Pick a theme in the user menu')
  async setTheme(theme: Theme): Promise<void> {
    await this.page.locator(USER_MENU).first().click();
    await this.page.locator(themeOption(theme)).click();
    await this.page.keyboard.press('Escape');
    await this.page.locator(MENU).first().waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
  }

  @step('Read which theme is selected in the user menu')
  async getSelectedTheme(): Promise<Theme> {
    await this.page.locator(USER_MENU).first().click();
    const value = await this.page.locator(THEME_SELECTED).first().getAttribute('value');
    await this.page.keyboard.press('Escape');
    await this.page.locator(MENU).first().waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
    return value as Theme;
  }

  /** The theme the page is drawn in right now. */
  async getAppliedTheme(): Promise<'light' | 'dark'> {
    return this.page.evaluate(() => (document.documentElement.classList.contains('dark') ? 'dark' : 'light'));
  }

  /** Sets the computer's light / dark preference as the browser reports it. */
  @step('Set the computer to light or dark mode')
  async emulateOsTheme(scheme: 'light' | 'dark'): Promise<void> {
    await this.page.emulateMedia({ colorScheme: scheme });
    await this.page.waitForTimeout(300);
  }

  /**
   * Visible texts under `scope` whose contrast with their background is below WCAG AA (4.5:1, or
   * 3:1 for large text). Disabled controls are left out, as AA exempts them. `onPaper` measures
   * against white, as a default printout drops background colours.
   */
  @step('Measure text contrast')
  async getLowContrastText(scope: string, onPaper = false): Promise<LowContrastText[]> {
    return this.page.evaluate(({ scope, onPaper }) => {
      // Colours come back in any CSS syntax (oklch here); a 1×1 canvas turns each into RGBA.
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      const rgba = (c: string): number[] => {
        if (!c || c === 'transparent') return [0, 0, 0, 0];
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = 'rgba(0,0,0,0)';
        ctx.fillStyle = c;
        ctx.fillRect(0, 0, 1, 1);
        const d = ctx.getImageData(0, 0, 1, 1).data;
        return d[3] === 0 ? [0, 0, 0, 0] : [d[0]! * 255 / d[3]!, d[1]! * 255 / d[3]!, d[2]! * 255 / d[3]!, d[3]! / 255];
      };
      const luminance = ([r, g, b]: number[]): number => {
        const f = (v: number): number => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
        return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!);
      };
      const background = (el: Element): number[] => {
        const layers: number[][] = [];
        for (let e: Element | null = el; e; e = e.parentElement) {
          const c = rgba(getComputedStyle(e).backgroundColor);
          if (c[3]! > 0) { layers.push(c); if (c[3]! >= 0.99) break; }
        }
        const page = rgba(getComputedStyle(document.body).backgroundColor);
        let out = page[3]! > 0 ? page.slice(0, 3) : [255, 255, 255];
        for (const l of layers.reverse()) out = out.map((v, i) => l[i]! * l[3]! + v * (1 - l[3]!));
        return out;
      };
      const low = new Map<string, number>();
      for (const root of Array.from(document.querySelectorAll(scope))) {
        for (const el of Array.from(root.querySelectorAll('*'))) {
          const text = Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => (n.textContent || '').trim()).join(' ').trim();
          if (!text) continue;
          const box = el.getBoundingClientRect();
          const s = getComputedStyle(el);
          if (!box.width || !box.height || s.visibility === 'hidden' || Number(s.opacity) === 0) continue;
          if (el.closest('[disabled],[aria-disabled="true"],[data-disabled]')) continue;
          const bg = onPaper ? [255, 255, 255] : background(el);
          const fg = rgba(s.color);
          const fgOnBg = fg.slice(0, 3).map((v, i) => v * fg[3]! + bg[i]! * (1 - fg[3]!));
          const [hi, lo] = [luminance(fgOnBg), luminance(bg)].sort((a, b) => b - a);
          const ratio = (hi! + 0.05) / (lo! + 0.05);
          const large = parseFloat(s.fontSize) >= 24 || (parseFloat(s.fontSize) >= 18.66 && Number(s.fontWeight) >= 700);
          if (ratio < (large ? 3 : 4.5)) low.set(text.slice(0, 60), Math.round(ratio * 100) / 100);
        }
      }
      return Array.from(low, ([text, ratio]) => ({ text, ratio }));
    }, { scope, onPaper });
  }

  /** Contrast of the printed recommendation rows on white paper (default print settings). Click Print first. */
  @step('Measure text contrast of the printed rows')
  async getPrintedRowsLowContrastText(): Promise<LowContrastText[]> {
    await this.page.emulateMedia({ media: 'print' });
    try {
      await this.page.waitForTimeout(500);
      return await this.getLowContrastText(`${PRINT_COPY} tbody`, true);
    } finally {
      await this.page.emulateMedia({ media: 'screen' });
    }
  }

  /** Recommendation rows on the printout. Click Print first. */
  async getPrintedRows(): Promise<string[]> {
    await this.page.emulateMedia({ media: 'print' });
    try {
      await this.page.waitForTimeout(500);
      return (await this.page.locator(`${PRINT_COPY} tbody tr:has(td)`).allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
    } finally {
      await this.page.emulateMedia({ media: 'screen' });
    }
  }
}
