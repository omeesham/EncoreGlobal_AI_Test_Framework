import { Locator, Page, Request, Route, expect } from '@playwright/test';
import * as XLSX from 'xlsx';
import { step } from '../../fixtures/step-decorator';
import { BasePage } from '../base.page';
import { Log } from '../../utils/logger';
import { IConfig } from '../../types';
import {
  ANY_FIELD, USE_DEFAULT, INCLUDE_INACTIVE, INFO_BUTTON, TOOLTIP, TOAST, COPY_PANEL, COPY_SEARCH, HEADER_MENU_TRIGGER, MENU, MENU_ITEM,
  GRID_ROWS, resizeHandle, SIDEBAR_MENU_BUTTON, sidebarPageFor,
} from '../../selectors/commissions/product-code';
import { COLUMN_ID, LEVELS, Level, OFFICE, TEXT } from '../../data/commissions/product-code';

export type Tab = (typeof TEXT.tabs)[number];
export type Row = Record<string, string>;
/** A segment as the edit dialog shows it. */
export type Segment = { name: string; comm: string; useDefault: boolean };
export type Failure = 'search' | 'segment' | 'save' | 'history' | 'copy';

// Every call is a server action posted to the page URL; the body tells them apart.
const PAGE_URL = /\/commissions\/product-code$/;
const body = (r: Request): string => r.postData() ?? '';
const post = (r: Request, key: string): boolean => r.method() === 'POST' && PAGE_URL.test(r.url()) && body(r).includes(key);
const KEY: Record<Failure, string> = { search: '"anyField"', segment: '"culture"', save: '"propagate"', history: '"pageNumber"', copy: '"destinationLocationNos"' };
const is = (kind: Failure) => (r: Request): boolean => post(r, KEY[kind]) && (kind !== 'segment' || body(r).includes('"productId"'));
const flat = (t: string): string => t.replace(/\s+/g, ' ').trim();

// Commissions → Product Code: search an office's product codes, open any level of a row's product tree in a
// dialog, set its commission (optionally down to every child), copy it to other offices, and read History.
export class ProductCodePage extends BasePage {
  readonly main: Locator;
  readonly anyField: Locator;
  readonly dialog: Locator;
  readonly alert: Locator;
  readonly picker: Locator;
  readonly panel: Locator;

  constructor(page: Page, config?: IConfig) {
    super(page, config);
    this.main = page.locator('main');
    this.anyField = page.locator(ANY_FIELD);
    this.dialog = page.getByRole('dialog', { name: TEXT.dialogTitle });
    this.alert = page.getByRole('alertdialog');
    this.picker = page.getByRole('dialog', { name: TEXT.pickerTitle });
    this.panel = page.locator(COPY_PANEL);
    Log.info('ProductCodePage initialized');
  }

  url(officeNo: string): string {
    return `${(this.config?.base_url ?? '').replace(/\/+$/, '')}/locations/${officeNo}/commissions/product-code`;
  }

  button(name: string | RegExp, scope: Locator = this.main): Locator {
    return scope.getByRole('button', { name, exact: typeof name === 'string' });
  }

  // ---------------------------------------------------------------- opening

  @step('Open the Product Code Commission page')
  async open(officeNo: string): Promise<void> {
    await this.safeNavigateTo(this.url(officeNo));
    await this.waitForReady();
  }

  async waitForReady(): Promise<void> {
    const ready = this.button('Search');
    await ready.waitFor({ state: 'visible', timeout: 60_000 }).catch(async () => {
      await this.page.reload(); // the app now and then fails to start; one reload settles it
      await ready.waitFor({ state: 'visible', timeout: 60_000 });
    });
    // The office arrives a moment after the panel (it reads "All Locations" as plain text until then).
    await expect.poll(async () => { const c = await this.criteria(); return c.changeable || /^\d{4} - /.test(c.office); }, { timeout: 30_000 }).toBe(true);
    await this.settle(() => this.criteria());
  }

  @step('Open Product Code from the Commissions menu')
  async openFromMenu(officeNo: string): Promise<string[]> {
    await this.safeNavigateTo(this.url(officeNo).replace(/commissions\/product-code$/, 'home'));
    const menu = this.page.locator(SIDEBAR_MENU_BUTTON).filter({ hasText: /^Commissions$/ });
    await menu.waitFor({ state: 'visible', timeout: 60_000 });
    await menu.click();
    const link = this.page.locator(sidebarPageFor(officeNo));
    await link.waitFor();
    const items = (await this.page.locator('[role="menu"] a').allInnerTexts()).map(flat);
    await link.click();
    await this.page.waitForURL(PAGE_URL);
    await this.waitForReady();
    return items;
  }

  async heading(): Promise<{ heading: boolean; title: string; tabs: string[]; selected: string }> {
    return {
      heading: await this.page.locator(`:text-is("${TEXT.heading}")`).first().isVisible(),
      title: await this.page.title(),
      tabs: (await this.page.getByRole('tab').allInnerTexts()).map(flat),
      selected: await this.selectedTab(),
    };
  }

  @step('Read the information tooltip')
  async infoTooltip(by: 'hover' | 'focus'): Promise<string> {
    const info = this.page.locator(INFO_BUTTON);
    if (by === 'hover') await info.hover();
    else {
      await this.page.getByRole('tab').first().focus(); // focus arrives from the tab list, as by keyboard
      await info.focus();
    }
    const tip = this.page.locator(TOOLTIP).first();
    await tip.waitFor({ state: 'visible' });
    const text = flat(await tip.innerText());
    await this.page.mouse.move(0, 0);
    await this.page.getByRole('tab').first().focus();
    await tip.waitFor({ state: 'detached' });
    return text;
  }

  // ---------------------------------------------------------------- search criteria

  /** The search panel as shown: office, whether it can be changed, and the three criteria. */
  async criteria(): Promise<{ office: string; changeable: boolean; any: string; useDefault: boolean; inactive: boolean }> {
    const field = this.officeField();
    const changeable = (await field.getByRole('button').count()) > 0;
    const office = (await field.innerText()).replace(/^Local Office/, '');
    return {
      office: flat(office), changeable, any: await this.anyField.inputValue(),
      useDefault: (await this.page.locator(USE_DEFAULT).getAttribute('data-state')) === 'checked',
      inactive: (await this.page.locator(INCLUDE_INACTIVE).getAttribute('data-state')) === 'checked',
    };
  }

  /** The Local Office label with the office under it (a button on 1101, plain text on a local office). */
  private officeField(): Locator {
    return this.main.getByText('Local Office', { exact: true }).locator('xpath=..');
  }

  @step('Set the search criteria')
  async setCriteria(c: { any?: string; useDefault?: boolean; inactive?: boolean }): Promise<void> {
    if (c.any !== undefined) await this.anyField.fill(c.any);
    for (const [on, id] of [[c.useDefault, USE_DEFAULT], [c.inactive, INCLUDE_INACTIVE]] as const) {
      const box = this.page.locator(id);
      if (on !== undefined && ((await box.getAttribute('data-state')) === 'checked') !== on) await box.click();
    }
  }

  /** Runs the search (button or Enter) and returns what it sent; a search the page answers from memory sends nothing. */
  @step('Search')
  async search(c: { any?: string; useDefault?: boolean; inactive?: boolean } = {}, by: 'click' | 'enter' = 'click'): Promise<Record<string, unknown> | null> {
    await this.setCriteria(c);
    // On a busy page the request can leave a few seconds after the click; a cached answer sends none.
    const sent = this.page.waitForRequest(is('search'), { timeout: 12_000 }).catch(() => null);
    if (by === 'enter') await this.anyField.press('Enter');
    else await this.button('Search').click();
    const request = await sent;
    await request?.response().catch(() => null); // settles on the reply, or when the connection drops
    await this.settle(async () => [await this.countText(), await this.page.locator(GRID_ROWS).count()]);
    return request ? (JSON.parse(body(request)) as Record<string, unknown>[])[0] ?? null : null;
  }

  @step('Reset the search')
  async reset(): Promise<void> {
    await this.button('Reset').click();
    await this.settle(() => this.criteria());
  }

  async countText(): Promise<string> {
    return flat(await this.main.getByText(/items? found/).first().innerText());
  }

  async count(): Promise<number> {
    return Number((await this.countText()).replace(/[^\d]/g, ''));
  }

  @step('Collapse or expand the search panel')
  async toggleSearchPanel(): Promise<boolean> {
    await this.button(/(Collapse|Expand) search panel/).click();
    await expect(this.button(/(Collapse|Expand) search panel/)).toHaveAttribute('aria-label', /./);
    // The panel slides shut and clips its fields, so ask what a user would hit at the field's centre.
    const seen = () => this.anyField.evaluate((e) => {
      const r = e.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return r.width > 0 && !!hit && (hit === e || e.contains(hit));
    });
    await this.settle(seen);
    return seen();
  }

  // ---------------------------------------------------------------- Change Local Office

  @step('Open Change Local Office')
  async openPicker(): Promise<void> {
    await this.officeField().getByRole('button').click();
    // Empty placeholder rows show first; wait for the offices and the current office's tick.
    await expect.poll(async () => (await this.pickerOffices()).length, { timeout: 30_000 }).toBeGreaterThan(2);
    await this.picker.locator('tbody [role="checkbox"][data-state="checked"]').first().waitFor({ timeout: 10_000 }).catch(() => undefined);
  }

  /** The dialog's office rows, as "1102 Corporate Office - Long Beach" (the All Locations row is left out). */
  async pickerOffices(): Promise<string[]> {
    return (await this.picker.locator('tbody tr').allInnerTexts()).map(flat).filter((t) => t && t !== TEXT.allLocations);
  }

  async pickerInfo(): Promise<{ current: string; activeTicked: boolean; placeholder: string; columns: string[]; checked: string[]; select: boolean; allLocations: boolean }> {
    return {
      current: flat((await this.picker.getByText(/^Current:/).innerText()).replace(/^Current:/, '')),
      activeTicked: (await this.page.locator('#active-inactive-filter').getAttribute('data-state')) === 'checked',
      placeholder: (await this.picker.getByRole('textbox').getAttribute('placeholder')) ?? '',
      columns: (await this.picker.locator('th').allInnerTexts()).map(flat).filter(Boolean),
      checked: await this.checkedOffices(),
      select: await this.button('Select', this.picker).isEnabled(),
      allLocations: await this.button(TEXT.allLocations, this.picker).isVisible(),
    };
  }

  async checkedOffices(): Promise<string[]> {
    return (await this.picker.locator('tbody [role="checkbox"][data-state="checked"]').evaluateAll((cs) => cs.map((c) => (c.closest('tr') as HTMLElement | null)?.innerText ?? ''))).map(flat);
  }

  @step('Search the office list')
  async searchOffices(text: string): Promise<string[]> {
    const before = JSON.stringify(await this.pickerOffices());
    await this.picker.getByPlaceholder(TEXT.pickerSearch).fill(text);
    await expect.poll(async () => JSON.stringify(await this.pickerOffices()), { timeout: 5_000 }).not.toBe(before).catch(() => undefined);
    return this.pickerOffices();
  }

  @step('Tick an office')
  async tickOffice(office: string): Promise<void> {
    await this.picker.getByRole('row', { name: new RegExp(`\\b${office}\\b`) }).getByRole('checkbox').click();
  }

  @step('Tick or untick Active/Inactive')
  async toggleActiveFilter(): Promise<void> {
    const before = JSON.stringify(await this.pickerOffices());
    await this.page.locator('#active-inactive-filter').click();
    await expect.poll(async () => JSON.stringify(await this.pickerOffices()), { timeout: 20_000 }).not.toBe(before);
  }

  @step('Close Change Local Office')
  async closePicker(how: 'Cancel' | 'Close' | 'Escape'): Promise<void> {
    if (how === 'Escape') await this.page.keyboard.press('Escape');
    else await this.button(how, this.picker).click();
    await this.picker.waitFor({ state: 'hidden' });
  }

  @step('Pick an office in Change Local Office')
  async pickOffice(office: string): Promise<void> {
    await this.openPicker();
    await this.searchOffices(office);
    await this.tickOffice(office);
    await this.button('Select', this.picker).click();
    await this.picker.waitFor({ state: 'hidden' });
    await expect(this.officeField().getByRole('button')).toHaveText(new RegExp(`^${office} - `));
  }

  /** Opens the page on 1101, picks the office and searches it. */
  async openOffice(office: string, any = ''): Promise<void> {
    await this.open(OFFICE);
    await this.pickOffice(office);
    await this.search({ any });
  }

  // ---------------------------------------------------------------- grid

  async columns(): Promise<string[]> {
    return (await this.main.locator('th').allInnerTexts()).map(flat).filter(Boolean);
  }

  /** The rows shown, by column; a tick (Use Default Commission) reads "✓". */
  async rows(): Promise<Row[]> {
    const columns = await this.columns();
    const cells = await this.page.locator(GRID_ROWS).evaluateAll((trs) => trs.map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => (td.textContent ?? '').trim() || (td.querySelector('svg') ? '✓' : ''))));
    return cells.filter((r) => r.length >= columns.length).map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i] ?? ''])));
  }

  /** The names a row offers as links, one per level. */
  async rowLinks(index = 0): Promise<string[]> {
    return (await this.page.locator(GRID_ROWS).nth(index).locator('[role="button"]').allInnerTexts()).map(flat);
  }

  private header(column: string): Locator {
    return this.main.locator('th').filter({ has: this.page.locator(HEADER_MENU_TRIGGER, { hasText: new RegExp(`^${column}$`) }) });
  }

  async headerMenuItems(column: string): Promise<string[]> {
    await this.header(column).locator(HEADER_MENU_TRIGGER).click();
    await this.page.locator(MENU_ITEM).first().waitFor();
    const items = (await this.page.locator(MENU_ITEM).allInnerTexts()).map(flat);
    await this.closeMenu();
    return items;
  }

  private async closeMenu(): Promise<void> {
    if (await this.page.locator(MENU).count()) await this.page.keyboard.press('Escape');
    await expect(this.page.getByRole('menu')).toHaveCount(0); // a closing menu lingers a moment
  }

  @step('Sort a column from its header menu')
  async sort(column: string, direction: 'ascending' | 'descending'): Promise<Row[]> {
    await this.header(column).locator(HEADER_MENU_TRIGGER).click();
    await this.page.locator(MENU_ITEM).filter({ hasText: `Sort ${direction}` }).click();
    await this.closeMenu();
    return this.rows();
  }

  @step('Hide a column from its header menu')
  async hideColumn(column: string): Promise<void> {
    await this.header(column).locator(HEADER_MENU_TRIGGER).click();
    await this.page.locator(MENU_ITEM).filter({ hasText: 'Hide column' }).click();
    await this.closeMenu();
  }

  @step('Read Grid Options')
  async gridOptions(): Promise<{ label: string; checked: boolean }[]> {
    await this.button('Grid Options').click();
    await this.page.locator(MENU_ITEM).first().waitFor();
    const items = await this.page.locator(MENU_ITEM).evaluateAll((es) => es.map((e) => ({ label: (e as HTMLElement).innerText.trim(), checked: e.getAttribute('data-state') === 'checked' })));
    await this.closeMenu();
    return items;
  }

  @step('Use Grid Options')
  async useGridOption(label: string): Promise<void> {
    await this.button('Grid Options').click();
    await this.page.locator(MENU_ITEM).filter({ hasText: new RegExp(`^${label}$`) }).click();
    await this.closeMenu();
  }

  @step('Drag a column edge')
  async resizeColumn(column: string, dx: number): Promise<{ before: number; after: number }> {
    const th = this.main.locator('th').filter({ hasText: new RegExp(`^${column}$`) });
    const width = () => th.evaluate((t) => (t as HTMLElement).offsetWidth);
    const before = await width();
    const box = (await this.page.locator(resizeHandle(COLUMN_ID[column]!)).boundingBox())!;
    await this.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await this.page.mouse.down();
    await this.page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2, { steps: 6 });
    await this.page.mouse.up();
    return { before, after: await width() };
  }

  @step('Drag a column onto another')
  async dragColumn(column: string, onto: string): Promise<string[]> {
    const grip = (await this.header(column).locator('svg').first().boundingBox())!;
    const target = (await this.header(onto).boundingBox())!;
    await this.page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await this.page.mouse.down();
    await this.page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 });
    await this.page.mouse.up();
    await this.page.keyboard.press('Escape'); // a sidebar tooltip opened during the drag stays otherwise
    return this.columns();
  }

  /** Hovers a cell and returns the tooltip that opens, or null when none does. */
  @step('Hover a cell and read its tooltip')
  async cellTooltip(row: number, column: string): Promise<{ shown: string; cut: boolean; tip: string | null }> {
    const cell = this.page.locator(GRID_ROWS).nth(row).locator('td').nth((await this.columns()).indexOf(column)).locator('[data-slot="tooltip-trigger"]');
    const cut = await cell.evaluate((e) => e.scrollWidth > e.clientWidth);
    await cell.hover();
    const tip = this.page.locator(TOOLTIP).first();
    const shown = await tip.waitFor({ state: 'visible', timeout: 2_000 }).then(() => true, () => false);
    const text = shown ? flat(await tip.innerText()) : null;
    await this.page.mouse.move(0, 0);
    return { shown: flat(await cell.innerText()), cut, tip: text };
  }

  // ---------------------------------------------------------------- paging (shared by both grids)

  private pageSize(): Locator {
    return this.main.getByRole('combobox').filter({ hasText: /^\d+$/ });
  }

  async pageSizeOptions(): Promise<string[]> {
    await this.pageSize().click();
    const options = (await this.page.getByRole('option').allInnerTexts()).map(flat);
    await this.page.keyboard.press('Escape');
    return options;
  }

  @step('Choose rows per page')
  async setPageSize(size: string): Promise<void> {
    await this.pageSize().click();
    await this.page.getByRole('option', { name: size, exact: true }).click();
    await expect(this.pageSize()).toHaveText(size);
    await this.settle(async () => [await this.page.locator(GRID_ROWS).count(), (await this.pager()).pages]);
  }

  async pager(): Promise<{ page: string; pages: number; first: boolean; previous: boolean; next: boolean; last: boolean }> {
    const enabled = (label: string) => this.main.getByRole('button', { name: label }).isEnabled();
    const all = [...(await this.main.innerText()).matchAll(/\/\s*([\d,]+)/g)];
    return {
      page: await this.main.getByLabel('Current page number').inputValue(),
      pages: Number((all.at(-1)?.[1] ?? 'NaN').replace(/,/g, '')),
      first: await enabled('Go to first page'), previous: await enabled('Go to previous page'), next: await enabled('Go to next page'), last: await enabled('Go to last page'),
    };
  }

  @step('Move through pages')
  async goToPage(to: 'first' | 'previous' | 'next' | 'last' | number | string): Promise<void> {
    if (['first', 'previous', 'next', 'last'].includes(String(to))) await this.main.getByRole('button', { name: `Go to ${to} page` }).click();
    else {
      const box = this.main.getByLabel('Current page number');
      await box.fill(String(to));
      await box.press('Enter');
    }
    await this.settle(() => this.rows());
  }

  // ---------------------------------------------------------------- edit dialog

  /** Opens the dialog for one level of a row's product tree (each level is a link in the row). */
  @step('Open a product code level')
  async openLevel(level: Level, row = 0): Promise<void> {
    const loaded = this.page.waitForResponse((r) => is('segment')(r.request()), { timeout: 30_000 }).catch(() => undefined);
    await this.page.locator(GRID_ROWS).nth(row).locator('[role="button"]').nth(LEVELS.indexOf(level)).click();
    await this.dialog.waitFor();
    await loaded;
    await this.settle(() => this.dialogView());
  }

  private table(i: 0 | 1): Locator {
    return this.dialog.locator('table').nth(i);
  }

  private segmentCell(): Locator {
    return this.table(0).locator('tbody tr').first().locator('td').nth(1);
  }

  /** The dialog: its sections, the edited segment, its children and the buttons. */
  async dialogView(): Promise<{ sections: string[]; columns: string[]; segment: Segment & { propagate: boolean | null; editable: boolean }; children: Segment[]; save: boolean; copy: boolean }> {
    const box = (name: string) => this.table(0).getByRole('checkbox', { name });
    const read = (t: Locator) => t.locator('tbody tr').evaluateAll((trs) => trs.map((tr) => {
      const td = Array.from(tr.querySelectorAll('td'));
      const tick = td[2]?.querySelector('[role="checkbox"]');
      return { name: (td[0]?.textContent ?? '').trim(), comm: (td[1]?.textContent ?? '').trim(), useDefault: tick ? tick.getAttribute('data-state') === 'checked' : !!td[2]?.querySelector('svg') };
    }));
    const [segment] = await read(this.table(0));
    return {
      sections: (await this.dialog.locator('h3').allInnerTexts()).map(flat),
      columns: (await this.table(0).locator('th').allInnerTexts()).map(flat),
      segment: {
        ...segment!, editable: await box('Use Default Commission').isEnabled(),
        propagate: (await box('Propagate').count()) ? (await box('Propagate').getAttribute('data-state')) === 'checked' : null,
      },
      children: (await this.table(1).count()) ? await read(this.table(1)) : [],
      save: await this.button('Save', this.dialog).isEnabled(),
      copy: await this.button(/^Copy to Location/, this.dialog).isEnabled(),
    };
  }

  @step('Tick or untick Use Default Commission')
  async setUseDefault(on: boolean): Promise<void> {
    const box = this.table(0).getByRole('checkbox', { name: 'Use Default Commission' });
    if (((await box.getAttribute('data-state')) === 'checked') !== on) await box.click();
  }

  @step('Tick or untick Propagate')
  async setPropagate(on: boolean): Promise<void> {
    const box = this.table(0).getByRole('checkbox', { name: 'Propagate' });
    if (((await box.getAttribute('data-state')) === 'checked') !== on) await box.click();
  }

  /** Types into Comm % (a click turns the value into a field) and leaves it with Tab; returns what showed. */
  @step('Type a commission')
  async typeComm(text: string): Promise<{ typed: string; invalid: string | null; shown: string; message: string }> {
    const cell = this.segmentCell();
    if (!(await cell.locator('input').count())) await cell.click();
    const input = cell.locator('input');
    await input.press('Control+A');
    await input.press('Backspace');
    if (text) await input.pressSequentially(text);
    const typed = await input.inputValue();
    const invalid = await input.getAttribute('aria-invalid');
    await input.hover();
    const message = await this.visibleMessage();
    await this.page.keyboard.press('Tab');
    await expect(cell.locator('input')).toHaveCount(0);
    return { typed, invalid, shown: flat(await cell.innerText()), message };
  }

  /** The Comm % field's attributes once clicked. */
  async commField(): Promise<Record<string, string | null>> {
    const cell = this.segmentCell();
    if (!(await cell.locator('input').count())) await cell.click();
    return cell.locator('input').evaluate((e) => Object.fromEntries(['type', 'inputmode', 'placeholder', 'aria-invalid'].map((a) => [a, e.getAttribute(a)])));
  }

  /** Any message a user can see in the dialog: text outside the tables, an alert, or a tooltip. */
  async visibleMessage(): Promise<string> {
    const text = await this.dialog.evaluate((d) => {
      const clone = d.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('table, button, h2, h3').forEach((e) => e.remove());
      return clone.innerText;
    });
    const extra = [...(await this.page.getByRole('alert').allInnerTexts()), ...(await this.page.locator(TOOLTIP).allInnerTexts()), ...(await this.toasts())];
    return flat([text, ...extra].join(' '));
  }

  /** Presses Escape inside Comm % while editing. */
  @step('Press Escape in Comm %')
  async escapeInComm(text: string): Promise<void> {
    const cell = this.segmentCell();
    if (!(await cell.locator('input').count())) await cell.click();
    await cell.locator('input').fill(text);
    await cell.locator('input').press('Escape');
    await this.page.waitForTimeout(500); // a dialog that stays gives no event to wait for
  }

  /** Clicks Save, answers the propagate question if asked, and returns what was asked, sent and shown. */
  @step('Save the commission')
  async save(answer: 'Ok' | 'Cancel' | 'Escape' = 'Ok'): Promise<{ asked: string | null; sent: Record<string, unknown>[]; toasts: string[] }> {
    const sent: Record<string, unknown>[] = [];
    const listen = (r: Request) => { if (is('save')(r)) sent.push((JSON.parse(body(r)) as Record<string, unknown>[])[0] ?? {}); };
    this.page.on('request', listen);
    try {
      await this.button('Save', this.dialog).click();
      const toast = this.page.locator(TOAST).first();
      // Propagating first counts the children (it takes a few seconds), then asks.
      await this.alert.or(toast).first().waitFor({ timeout: 90_000 });
      let asked: string | null = null;
      if (await this.alert.isVisible()) {
        asked = flat(await this.alert.innerText());
        if (answer === 'Escape') await this.page.keyboard.press('Escape');
        else await this.button(answer, this.alert).click();
        await this.alert.waitFor({ state: 'hidden' });
        if (answer !== 'Ok') return { asked, sent, toasts: [] };
      }
      const research = this.page.waitForResponse((r) => is('search')(r.request()), { timeout: 15_000 }).catch(() => undefined);
      await toast.waitFor({ timeout: 90_000 });
      const toasts = await this.toasts();
      if (toasts.includes(TEXT.saved)) {
        await research; // a good save runs the search again
        await this.settle(async () => [await this.countText(), await this.page.locator(GRID_ROWS).count()]);
      }
      return { asked, sent, toasts };
    } finally {
      this.page.off('request', listen);
    }
  }

  @step('Close the dialog')
  async closeDialog(how: 'Cancel' | 'Escape'): Promise<void> {
    if (how === 'Escape') await this.page.keyboard.press('Escape');
    else await this.button('Cancel', this.dialog).click();
    await this.page.waitForTimeout(500); // an unsaved-changes question, if any, appears now
  }

  async dialogsOpen(): Promise<number> {
    return this.page.locator('[role="dialog"], [role="alertdialog"]').count();
  }

  /** Sets a segment's commission from 1101 (searching the term) and saves; returns the save. */
  @step('Set a commission')
  async setCommission(office: string, level: Level, value: string | null, o: { term?: string; propagate?: boolean } = {}): Promise<Awaited<ReturnType<ProductCodePage['save']>>> {
    await this.openOffice(office, o.term ?? '');
    await this.openLevel(level);
    await this.setUseDefault(value === null);
    if (value !== null) await this.typeComm(value);
    if (o.propagate !== undefined && level !== 'Item') await this.setPropagate(o.propagate);
    return this.save();
  }

  /** Puts every segment of an office back on its default commission (searching the rows that are not). */
  @step('Put the office back on default commissions')
  async restoreDefaults(office: string): Promise<void> {
    await this.open(OFFICE);
    await this.pickOffice(office);
    for (let round = 0; round < 6; round++) {
      await this.search({ any: '', useDefault: false });
      if ((await this.count()) === 0) return;
      // The Sub Class carries what its items show; an item changed on its own is reset from its own dialog.
      await this.openLevel('Sub Class');
      if ((await this.dialogView()).segment.useDefault) {
        await this.closeDialog('Cancel');
        await this.openLevel('Item');
      }
      await this.setUseDefault(true);
      if ((await this.dialogView()).segment.propagate === false) await this.setPropagate(true);
      await this.save();
      await this.button('Search').waitFor();
    }
    throw new Error(`${office} still has commissions off default`);
  }

  // ---------------------------------------------------------------- Copy to Location(s)

  @step('Open Copy to Location(s)')
  async openCopy(): Promise<void> {
    await this.button(/^Copy to Location/, this.dialog).click();
    await expect(this.panel).toHaveAttribute('aria-hidden', 'false');
    await expect.poll(() => this.panel.locator('tbody tr').count(), { timeout: 30_000 }).toBeGreaterThan(1);
  }

  async copyInfo(): Promise<{ title: string; source: string; placeholder: string; columns: string[]; destinations: string[]; ticked: number; apply: boolean }> {
    return {
      title: flat(await this.panel.locator('h2').innerText()),
      source: flat((await this.panel.getByText('Source Location', { exact: true }).locator('xpath=..').innerText()).replace('Source Location', '')),
      placeholder: (await this.panel.locator(COPY_SEARCH).getAttribute('placeholder')) ?? '',
      columns: (await this.panel.locator('th').allInnerTexts()).map(flat).filter(Boolean),
      destinations: await this.destinations(),
      ticked: await this.panel.locator('tbody [role="checkbox"][data-state="checked"]').count(),
      apply: await this.button('Apply', this.panel).isEnabled(),
    };
  }

  async destinations(): Promise<string[]> {
    return (await this.panel.locator('tbody tr').allInnerTexts()).map(flat).filter(Boolean);
  }

  @step('Search the destinations')
  async searchDestinations(text: string): Promise<string[]> {
    await this.panel.locator(COPY_SEARCH).fill(text);
    await this.settle(() => this.destinations());
    return this.destinations();
  }

  @step('Tick a destination')
  async tickDestination(office: string): Promise<void> {
    await this.searchDestinations(office);
    await this.panel.locator('tbody tr').filter({ hasText: `${office} - ` }).getByRole('checkbox').click();
  }

  @step('Tick or untick Select all')
  async selectAll(): Promise<number> {
    await this.panel.getByRole('checkbox', { name: 'Select all' }).click();
    return this.panel.locator('tbody [role="checkbox"][data-state="checked"]').count();
  }

  @step('Apply the copy')
  async applyCopy(): Promise<{ sent: Record<string, unknown> | null; toasts: string[] }> {
    const request = this.page.waitForRequest(is('copy'), { timeout: 30_000 });
    await this.button('Apply', this.panel).click();
    const sent = (JSON.parse(body(await request)) as Record<string, unknown>[])[0] ?? null;
    await this.page.locator(TOAST).first().waitFor({ timeout: 90_000 });
    return { sent, toasts: await this.toasts() };
  }

  @step('Close Copy to Location(s)')
  async closeCopy(): Promise<void> {
    await this.button('Close', this.panel).click();
    await expect(this.panel).toHaveAttribute('aria-hidden', 'true');
  }

  // ---------------------------------------------------------------- tabs, History, export

  @step('Open a tab')
  async openTab(tab: Tab): Promise<void> {
    const list = tab === TEXT.tabs[1] ? this.page.waitForResponse((r) => is('history')(r.request()), { timeout: 10_000 }).catch(() => undefined) : null;
    await this.page.getByRole('tab', { name: tab }).click();
    await list;
    await this.settle(async () => [await this.countText().catch(() => ''), await this.page.locator(GRID_ROWS).count()]);
  }

  async selectedTab(): Promise<string> {
    return flat(await this.page.locator('[role="tab"][aria-selected="true"]').innerText());
  }

  /** Every History entry, read page by page. */
  @step('Read every History page')
  async allRows(): Promise<Row[]> {
    const rows = await this.rows();
    for (let p = Number((await this.pager()).page) + 1; p <= (await this.pager()).pages; p++) {
      await this.goToPage('next');
      rows.push(...(await this.rows()));
    }
    return rows;
  }

  /** Clicks Export and reads the downloaded workbook's first sheet; null when nothing downloads. */
  @step('Export and read the file')
  async exportFile(): Promise<{ name: string; rows: string[][] } | null> {
    const download = this.page.waitForEvent('download', { timeout: 60_000 }).catch(() => null);
    await this.button('Export').click();
    const file = await Promise.race([download, this.page.locator(TOAST).filter({ hasText: /fail/i }).first().waitFor({ timeout: 60_000 }).then(() => null, () => null)]);
    if (!file) return null;
    const book = XLSX.readFile(await file.path());
    const rows = XLSX.utils.sheet_to_json<string[]>(book.Sheets[book.SheetNames[0] ?? '']!, { header: 1, raw: false, defval: '' });
    const trimmed = rows.map((r) => { const c = r.map((x) => String(x).trim()); while (c.length && c.at(-1) === '') c.pop(); return c; });
    return { name: file.suggestedFilename(), rows: trimmed.filter((r) => r.length) };
  }

  async toasts(): Promise<string[]> {
    return (await this.page.locator(TOAST).allInnerTexts()).map(flat).filter(Boolean);
  }

  /** Starts noting every message shown from now on; they close by themselves after a few seconds. */
  async watchToasts(): Promise<() => Promise<string[]>> {
    await this.page.evaluate((selector) => {
      const seen: string[] = [];
      (window as unknown as { seenToasts: string[] }).seenToasts = seen;
      new MutationObserver(() => document.querySelectorAll(selector).forEach((t) => {
        const text = (t.textContent ?? '').replace(/\s+/g, ' ').trim();
        if (text && !seen.includes(text)) seen.push(text);
      })).observe(document.body, { childList: true, subtree: true, characterData: true });
    }, TOAST);
    return () => this.page.evaluate(() => (window as unknown as { seenToasts: string[] }).seenToasts);
  }

  /** Answers one kind of request with a server error (or a dropped connection) until undone. */
  async fail(kind: Failure, how: 'network' | 500): Promise<() => Promise<void>> {
    const handler = (route: Route) => (is(kind)(route.request()) ? (how === 'network' ? route.abort() : route.fulfill({ status: 500, body: 'Server error' })) : route.fallback());
    await this.page.route(PAGE_URL, handler);
    return () => this.page.unroute(PAGE_URL, handler);
  }

  // ---------------------------------------------------------------- keyboard and layout

  /** The controls focus reaches on each Tab press from a starting control. */
  async tabOrder(from: Locator, count: number): Promise<string[]> {
    await expect(async () => {
      await from.focus();
      await expect(from).toBeFocused({ timeout: 1_000 });
    }).toPass({ timeout: 15_000 }); // a late re-render after loading can take focus away
    const order: string[] = [];
    for (let i = 0; order.length < count && i < count + 3; i++) {
      await this.page.keyboard.press('Tab');
      const name = await this.page.evaluate(() => {
        const e = document.activeElement as HTMLElement | null;
        if (!e || e.getAttribute('role') === 'tabpanel') return null; // the tab panel takes focus on its way in
        const label = e.id ? document.querySelector(`label[for="${e.id}"]`)?.textContent : null;
        return (label || e.getAttribute('aria-label') || e.innerText || e.tagName || '').replace(/\s+/g, ' ').trim();
      });
      if (name !== null) order.push(name);
    }
    return order;
  }

  @step('Toggle the sidebar')
  async toggleSidebar(): Promise<string> {
    const state = this.page.locator('[data-slot="sidebar"][data-state]').first();
    const before = await state.getAttribute('data-state');
    await this.page.locator('button[data-slot="sidebar-trigger"]').click();
    await expect(state).not.toHaveAttribute('data-state', before ?? '');
    return (await state.getAttribute('data-state')) ?? '';
  }

  /** Waits until a reading has stayed the same for about a second. */
  private async settle(read: () => Promise<unknown>): Promise<void> {
    let last = '';
    let same = 0;
    await expect.poll(async () => {
      const now = JSON.stringify(await read().catch(() => null));
      same = now === last ? same + 1 : 0;
      last = now;
      return same;
    }, { intervals: [300], timeout: 30_000 }).toBeGreaterThanOrEqual(3);
  }
}
