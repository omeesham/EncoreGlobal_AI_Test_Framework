import { Locator, Page, Request, expect } from '@playwright/test';
import { step } from '../../fixtures/step-decorator';
import { BasePage } from '../base.page';
import { Log } from '../../utils/logger';
import { IConfig } from '../../types';
import {
  HEADER_TITLE,
  RECORD_COUNT,
  BTN_GRID_OPTIONS,
  HEADERS,
  HEADER_MENU_TRIGGER,
  resizeHandle,
  ROWS,
  CHECK_ICON,
  NAME_CELL,
  SKELETON,
  MENU,
  ANY_MENU,
  MENU_ITEM,
  MENU_CHECKBOX,
  TOOLTIP,
  TOAST,
  SIDEBAR_MENU_BUTTON,
  SIDEBAR_TAX_LABEL,
  sidebarPageFor,
} from '../../selectors/taxes/tax-type-detail';
import { COLUMN_ID, Column, LAYOUT_KEY } from '../../data/taxes/tax-type-detail';

/** One listed tax type. */
export interface TaxTypeRow {
  taxType: string;
  defaultTaxability: boolean;
  active: boolean;
}

export type SortState = 'ascending' | 'descending' | 'none';

/** The grid layout the browser keeps between visits. */
export interface KeptLayout {
  columnVisibility: Record<string, boolean>;
  columnOrder: string[];
  columnSizing: Record<string, number>;
  sorting: { id: string; desc: boolean }[];
}

// The page's server actions post to the page URL; the tax type list is the one whose body asks for
// active tax types ({"bActive":true,...}).
const isListRequest = (r: Request): boolean => r.method() === 'POST' && (r.postData() ?? '').includes('"bActive"');
/** Not one of the calls the page makes on its own after loading (no arguments, or the office it works in). */
const isOwnRequest = (r: Request): boolean => !/^\[\]$|^\[\{"locationId"/.test(r.postData() ?? '');
const LIST_URL = /\/taxes\/tax-type-detail/;

// Tax → Tax Type Detail: a read-only list of the company's active tax types with their default
// taxability. Sorting happens in the browser; the column layout is kept in the browser between visits.
export class TaxTypeDetailPage extends BasePage {
  constructor(page: Page, config?: IConfig) {
    super(page, config);
    Log.info('TaxTypeDetailPage initialized');
  }

  url(officeNo: string): string {
    return `${(this.config?.base_url ?? '').replace(/\/+$/, '')}/locations/${officeNo}/taxes/tax-type-detail`;
  }

  // ---------------------------------------------------------------- navigation

  /** Opens the page with the default grid layout; returns the body of the tax type list request. */
  @step('Open the Tax Type Detail page for an office')
  async open(officeNo: string): Promise<Record<string, unknown>> {
    await this.clearKeptLayout();
    const request = this.page.waitForRequest(isListRequest, { timeout: 90_000 });
    await this.safeNavigateTo(this.url(officeNo));
    const sent = (JSON.parse((await request).postData() ?? '[{}]') as Record<string, unknown>[])[0] ?? {};
    await this.waitForReady();
    return sent;
  }

  @step('Open Tax Type Detail from the Tax menu')
  async openFromTaxMenu(officeNo: string): Promise<void> {
    await this.clearKeptLayout();
    await this.safeNavigateTo(this.url(officeNo).replace(/taxes\/tax-type-detail$/, 'home'));
    // The sidebar menus appear only once the user's permissions have loaded.
    const tax = this.page.locator(SIDEBAR_MENU_BUTTON).filter({ hasText: SIDEBAR_TAX_LABEL });
    await tax.waitFor({ state: 'visible', timeout: 60_000 });
    await tax.click({ timeout: 30_000 });
    await this.page.locator(sidebarPageFor(officeNo)).click();
    await this.waitForReady();
  }

  private async clearKeptLayout(): Promise<void> {
    if (!this.page.url().startsWith('http')) return;
    await this.page.evaluate((key) => localStorage.removeItem(key), LAYOUT_KEY);
  }

  /** Waits until the list has loaded (or failed): heading shown, loading placeholders gone. */
  @step('Wait for the Tax Type Detail page to load')
  async waitForReady(): Promise<void> {
    await this.page.locator(HEADER_TITLE).waitFor({ state: 'visible', timeout: 60_000 });
    await expect(this.page.locator(SKELETON)).toHaveCount(0, { timeout: 60_000 });
    await this.page.locator(RECORD_COUNT).first().waitFor({ state: 'visible' });
  }

  @step('Reload the Tax Type Detail page')
  async reload(): Promise<void> {
    await this.page.reload();
    await this.waitForReady();
  }

  @step('Read the page heading and title')
  async getHeading(): Promise<{ heading: string; title: string }> {
    return { heading: (await this.page.locator(HEADER_TITLE).innerText()).trim(), title: await this.page.title() };
  }

  /** The count line above the grid, as written ("40 Tax type found"). */
  async countText(): Promise<string> {
    return (await this.page.locator(RECORD_COUNT).first().innerText()).replace(/\s+/g, ' ').trim();
  }

  async getCount(): Promise<number> {
    return Number((await this.countText()).match(/^\d+/)?.[0] ?? NaN);
  }

  async isTextVisible(text: string): Promise<boolean> {
    return this.page.locator('main').getByText(text, { exact: true }).isVisible();
  }

  /** Error or info messages shown as toasts or alerts. */
  async getMessages(): Promise<string[]> {
    const texts = [...(await this.page.locator(TOAST).allInnerTexts()), ...(await this.page.getByRole('alert').allInnerTexts())];
    return texts.map((t) => t.trim()).filter(Boolean);
  }

  // ---------------------------------------------------------------- list loading

  /** Answers the tax type list request with the given reply (an HTTP status or a dropped connection) until undone. */
  async failList(how: 'network' | number): Promise<() => Promise<void>> {
    // A reload or page change can settle a request first; the reply is then no longer needed.
    await this.page.route(LIST_URL, (route) => {
      if (!isListRequest(route.request())) return route.continue().catch(() => undefined);
      return (how === 'network' ? route.abort() : route.fulfill({ status: how, body: 'Server error' })).catch(() => undefined);
    });
    return () => this.page.unroute(LIST_URL);
  }

  /** Holds the tax type list reply back for the given time, so the loading state can be read. Undoing waits
   *  for any reply still held, so nothing carries over to the next test on the same page. */
  async delayList(ms: number): Promise<() => Promise<void>> {
    const held = new Set<Promise<void>>();
    await this.page.route(LIST_URL, (route) => {
      const reply = (async () => {
        if (isListRequest(route.request())) await new Promise((r) => setTimeout(r, ms));
        await route.continue().catch(() => undefined);
      })();
      held.add(reply);
      return reply.finally(() => held.delete(reply));
    });
    return async () => {
      await this.page.unroute(LIST_URL);
      await Promise.all([...held]);
    };
  }

  /** Reloads and reads the page while the list is still loading. */
  @step('Reload and read the page while the list loads')
  async readWhileLoading(): Promise<{ skeletons: number; count: string | null }> {
    await this.page.reload();
    await this.page.locator(SKELETON).first().waitFor({ state: 'visible', timeout: 30_000 });
    const count = this.page.locator(RECORD_COUNT).first();
    return {
      skeletons: await this.page.locator(SKELETON).count(),
      count: (await count.isVisible()) ? (await count.innerText()).replace(/\s+/g, ' ').trim() : null,
    };
  }

  // ---------------------------------------------------------------- list

  @step('Read the listed tax types')
  async getRows(): Promise<TaxTypeRow[]> {
    const columns = await this.getColumns();
    return this.page.locator(ROWS).evaluateAll(
      (trs, { columns, icon }) =>
        trs.map((tr) => {
          const cells = Array.from(tr.querySelectorAll('td'));
          const at = (c: string) => cells[columns.indexOf(c)];
          const ticked = (c: string) => !!at(c)?.querySelector(icon);
          return { taxType: (at('Tax Type') as HTMLElement).innerText.trim(), defaultTaxability: ticked('Default Taxability'), active: ticked('Active') };
        }),
      { columns, icon: CHECK_ICON },
    );
  }

  async taxTypes(): Promise<string[]> {
    return (await this.getRows()).map((r) => r.taxType);
  }

  /** Each row's cells as shown: the name, or "✓" / "" for a mark. */
  async rowCells(index: number): Promise<string[]> {
    return this.page.locator(ROWS).nth(index).locator('td').evaluateAll((tds, icon) =>
      tds.map((td) => (td as HTMLElement).innerText.trim() || (td.querySelector(icon) ? '✓' : '')), CHECK_ICON);
  }

  /** Text that is not a mark in the mark columns, if any (a mark column should hold only a tick or nothing). */
  async markColumnTexts(): Promise<string[]> {
    const columns = await this.getColumns();
    const idx = columns.map((c, i) => (c === 'Tax Type' ? -1 : i)).filter((i) => i >= 0);
    return this.page.locator(ROWS).evaluateAll((trs, idx) =>
      trs.flatMap((tr) => idx.map((i) => (tr.querySelectorAll('td')[i] as HTMLElement).innerText.trim())).filter(Boolean), idx);
  }

  row(taxType: string): Locator {
    return this.page.locator(ROWS).filter({ has: this.page.locator('td').first().getByText(taxType, { exact: true }) });
  }

  /** The tooltip a tax type name opens on hover, or null when none opens. */
  @step('Hover a tax type name and read its tooltip')
  async nameTooltip(taxType: string): Promise<string | null> {
    return this.tooltipOf(this.row(taxType).locator(NAME_CELL));
  }

  /** Whether a tax type name is cut off (wider than its cell). */
  async isNameCutOff(taxType: string): Promise<boolean> {
    return this.row(taxType).locator(NAME_CELL).evaluate((e) => e.scrollWidth > e.clientWidth);
  }

  // ---------------------------------------------------------------- grid

  async getColumns(): Promise<string[]> {
    return (await this.page.locator(HEADERS).allInnerTexts()).map((t) => t.trim());
  }

  private headerOf(column: string): Locator {
    return this.page.locator(HEADERS).filter({ has: this.page.locator(HEADER_MENU_TRIGGER, { hasText: new RegExp(`^${column}$`) }) });
  }

  @step('Open a column header menu')
  async openHeaderMenu(column: string): Promise<void> {
    await this.headerOf(column).locator(HEADER_MENU_TRIGGER).click();
    await this.page.locator(MENU).waitFor({ state: 'visible' });
  }

  /** Waits for a menu opened from the keyboard to show. */
  async waitForMenu(): Promise<void> {
    await this.page.locator(MENU).waitFor({ state: 'visible' });
  }

  @step('Read a column header menu')
  async headerMenuItems(column: string): Promise<string[]> {
    await this.openHeaderMenu(column);
    const items = (await this.page.locator(MENU_ITEM).allInnerTexts()).map((t) => t.trim());
    await this.closeMenu();
    return items;
  }

  /**
   * Runs an action and returns the requests it sent to this page's server (body, cut short). By default the
   * calls the page makes on its own after loading are left out: argument-less actions (body "[]") and the
   * office it is working in ({"locationId":...}).
   */
  private async pageRequestsDuring(action: () => Promise<void>, wanted: (r: Request) => boolean = isOwnRequest): Promise<string[]> {
    const sent: string[] = [];
    const record = (r: Request) => { if (r.method() === 'POST' && LIST_URL.test(r.url()) && wanted(r)) sent.push((r.postData() ?? '').slice(0, 120)); };
    this.page.on('request', record);
    try {
      await action();
    } finally {
      this.page.off('request', record);
    }
    return sent;
  }

  /** Sorts by a column from its header menu; returns any tax type list requests the sort sent. */
  @step('Sort a column')
  async sortBy(column: Column, direction: 'ascending' | 'descending'): Promise<string[]> {
    return this.pageRequestsDuring(async () => {
      await this.openHeaderMenu(column);
      await this.page.locator(MENU_ITEM).filter({ hasText: `Sort ${direction}` }).click();
      await expect(this.page.locator(ANY_MENU)).toHaveCount(0);
      await expect.poll(() => this.sortState(column)).toBe(direction);
    }, isListRequest);
  }

  /** The sort arrow a header shows: down (descending), up (ascending) or both (not sorted). */
  async sortState(column: Column): Promise<SortState> {
    const icon = (await this.headerOf(column).locator(`${HEADER_MENU_TRIGGER} svg`).last().getAttribute('class')) ?? '';
    if (/lucide-arrow-up-down/.test(icon)) return 'none';
    return /lucide-arrow-down/.test(icon) ? 'descending' : /lucide-arrow-up/.test(icon) ? 'ascending' : 'none';
  }

  @step('Hide a column from its header menu')
  async hideColumn(column: Column): Promise<void> {
    await this.openHeaderMenu(column);
    await this.page.locator(MENU_ITEM).filter({ hasText: 'Hide column' }).click();
    await expect(this.page.locator(ANY_MENU)).toHaveCount(0);
    await expect(this.headerOf(column)).toHaveCount(0);
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
  async toggleGridOptionColumn(column: Column): Promise<void> {
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
    if (await this.page.locator(MENU).count()) await this.page.keyboard.press('Escape');
    await expect(this.page.locator(ANY_MENU)).toHaveCount(0);
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

  /** Drags a column's resize handle sideways by the given pixels (negative = narrower). */
  @step('Resize a column')
  async resizeColumn(column: Column, px: number): Promise<void> {
    const handle = (await this.page.locator(resizeHandle(COLUMN_ID[column])).boundingBox())!;
    const y = handle.y + handle.height / 2;
    await this.page.mouse.move(handle.x + handle.width / 2, y);
    await this.page.mouse.down();
    await this.page.mouse.move(handle.x + handle.width / 2 + px, y, { steps: 10 });
    await this.page.mouse.up();
  }

  /** Each shown column's width in pixels. */
  async columnWidths(): Promise<Record<string, number>> {
    const widths = await this.page.locator(HEADERS).evaluateAll((ths) => ths.map((t) => Math.round(t.getBoundingClientRect().width)));
    const columns = await this.getColumns();
    return Object.fromEntries(columns.map((c, i) => [c, widths[i]!]));
  }

  /** The layout the browser keeps for the next visit. */
  async keptLayout(): Promise<KeptLayout | null> {
    return this.page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), LAYOUT_KEY);
  }

  // ---------------------------------------------------------------- tooltips and keyboard

  /** Hovers a control and returns the tooltip that opens, or null when none does. */
  @step('Hover a control and read its tooltip')
  async tooltipOf(control: Locator): Promise<string | null> {
    // The heading opens no tooltip; the page corner can (the office name in the sidebar does). A sidebar
    // tooltip opened during a drag stays until closed, so Escape closes any tooltip still open.
    await this.page.locator(HEADER_TITLE).hover();
    if (await this.page.locator(TOOLTIP).count()) await this.page.keyboard.press('Escape');
    await expect(this.page.locator(TOOLTIP)).toHaveCount(0);
    await control.hover();
    const tip = this.page.locator(TOOLTIP).first();
    if (!(await tip.waitFor({ state: 'visible', timeout: 2_000 }).then(() => true, () => false))) return null;
    return (await tip.innerText()).split('\n')[0]!.trim();
  }

  gridOptionsButton(): Locator {
    return this.page.locator(BTN_GRID_OPTIONS);
  }

  /** Presses a key and returns the focused control's name. */
  async press(key: string): Promise<string> {
    await this.page.keyboard.press(key);
    return this.page.evaluate(() => {
      const e = document.activeElement as HTMLElement | null;
      return (e?.getAttribute('aria-label') || e?.innerText || e?.tagName || '').trim();
    });
  }

  /** Puts focus just before the grid (on the heading area) for keyboard cases. */
  async focusHeading(): Promise<void> {
    await this.page.locator(HEADER_TITLE).click();
  }

  @step('Check whether the page scrolls sideways')
  async scrollsSideways(): Promise<boolean> {
    return this.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  }

  // ---------------------------------------------------------------- read-only checks

  /** Clicks, double-clicks and right-clicks a row and its mark cells; returns the requests sent to this page's server meanwhile. */
  @step('Click around a row')
  async clickAroundRow(taxType: string): Promise<string[]> {
    return this.pageRequestsDuring(async () => {
      const row = this.row(taxType);
      await row.click();
      for (const td of await row.locator('td').all()) await td.click();
      await row.dblclick();
      await row.click({ button: 'right' });
      await this.page.waitForTimeout(1_000); // a click that opens nothing gives no event to wait for
      await this.page.keyboard.press('Escape');
    });
  }

  /** Inputs, checkboxes, editable cells, dialogs or Save/Edit buttons in the page body. */
  async editControls(): Promise<string[]> {
    return this.page.locator('main').evaluate((m) => [
      ...Array.from(m.querySelectorAll('input, textarea, select, [role="checkbox"], [contenteditable="true"]')).map((e) => e.tagName),
      ...Array.from(m.querySelectorAll('button')).map((b) => b.innerText.trim()).filter((t) => /^(save|edit|add|delete|new)$/i.test(t)),
      ...Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"]')).map(() => 'dialog'),
    ]);
  }
}
