import { Locator, Page, Request, expect } from '@playwright/test';
import * as XLSX from 'xlsx';
import { step } from '../../fixtures/step-decorator';
import { BasePage } from '../base.page';
import { Log } from '../../utils/logger';
import { IConfig } from '../../types';
import {
  HEADING, INFO_BUTTON, TOOLTIP, TOAST, OFFICE_BUTTON, COMMISSION_INPUT, PICKER_ROWS, CHECKED,
  HEADER_MENU_TRIGGER, MENU_ITEM, resizeHandle, GRID_ROWS, SIDEBAR_MENU_BUTTON, sidebarPageFor,
} from '../../selectors/commissions/cmp';
import { ALL_BUSINESS_TYPES, COLUMN_ID, HistoryColumn, OFFICE, TEXT } from '../../data/commissions/cmp';

/** One History entry as the grid shows it, in column order. */
export type HistoryRow = Record<HistoryColumn, string>;
export type Tab = (typeof TEXT.tabs)[number];
export type DialogAnswer = 'Stay' | 'Discard' | 'Close' | 'Escape';

// The page's server actions post to the page URL. The save sends {"cmpCommission":…}, the History list
// {"pageNumber":…}, and picking an office loads its commission and business types with ["<office>"].
const PAGE_URL = /\/commissions\/cmp$/;
const body = (r: Request): string => r.postData() ?? '';
const isSave = (r: Request): boolean => r.method() === 'POST' && body(r).includes('"cmpCommission"');
const isHistoryList = (r: Request): boolean => r.method() === 'POST' && body(r).includes('"pageNumber"');
const isOfficeLoad = (office: string) => (r: Request): boolean => r.method() === 'POST' && body(r) === `["${office}"]`;
const flat = (t: string): string => t.replace(/\s+/g, ' ').trim();

// Commissions → CMP: one CMP commission percentage per local office and business type, changed through
// a Change Local Office dialog and saved after a confirmation. History lists every change.
export class CmpPage extends BasePage {
  readonly main: Locator;
  readonly input: Locator;
  readonly officeButton: Locator;
  readonly saveButton: Locator;
  readonly exportButton: Locator;
  readonly picker: Locator;
  readonly alert: Locator;

  constructor(page: Page, config?: IConfig) {
    super(page, config);
    this.main = page.locator('main');
    this.input = page.locator(COMMISSION_INPUT);
    this.officeButton = this.main.getByRole('button', { name: OFFICE_BUTTON });
    this.saveButton = this.main.getByRole('button', { name: 'Save', exact: true });
    this.exportButton = this.main.getByRole('button', { name: 'Export', exact: true });
    this.picker = page.getByRole('dialog', { name: TEXT.pickerTitle });
    this.alert = page.getByRole('alertdialog');
    Log.info('CmpPage initialized');
  }

  url(officeNo: string): string {
    return `${(this.config?.base_url ?? '').replace(/\/+$/, '')}/locations/${officeNo}/commissions/cmp`;
  }

  // ---------------------------------------------------------------- opening

  /** Opens the page and waits for the commission field, or for the page's error message. */
  @step('Open the CMP Commissions page')
  async open(officeNo: string): Promise<void> {
    await this.safeNavigateTo(this.url(officeNo));
    await this.waitForReady();
  }

  async waitForReady(): Promise<void> {
    const ready = this.input.or(this.main.getByText(TEXT.crash));
    await ready.first().waitFor({ state: 'visible', timeout: 60_000 }).catch(async () => {
      // The app now and then fails to start ("Application error: a client-side exception"); one reload settles it.
      await this.page.reload();
      await ready.first().waitFor({ state: 'visible', timeout: 60_000 });
    });
  }

  @step('Open CMP from the Commissions menu')
  async openFromMenu(officeNo: string): Promise<string[]> {
    await this.safeNavigateTo(this.url(officeNo).replace(/commissions\/cmp$/, 'home'));
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

  /** Clicks another Commissions page in the sidebar; returns where the link points. */
  @step('Click a Commissions page in the sidebar')
  async clickMenuPage(name: string): Promise<string> {
    const menu = this.page.locator(SIDEBAR_MENU_BUTTON).filter({ hasText: /^Commissions$/ });
    if ((await menu.getAttribute('data-state')) !== 'open') await menu.click();
    const link = this.page.locator('[role="menu"] a').filter({ hasText: new RegExp(`^${name}$`) });
    const href = (await link.getAttribute('href')) ?? '';
    await link.click();
    return href;
  }

  /** Clicks the sidebar toggle; returns the sidebar's state afterwards (expanded or collapsed). */
  @step('Toggle the sidebar')
  async toggleSidebar(): Promise<string> {
    const state = this.page.locator('[data-slot="sidebar"][data-state]').first();
    const before = await state.getAttribute('data-state');
    await this.page.locator('button[data-slot="sidebar-trigger"]').click();
    await expect(state).not.toHaveAttribute('data-state', before ?? '');
    return (await state.getAttribute('data-state')) ?? '';
  }

  async heading(): Promise<{ heading: boolean; title: string; tabs: string[]; selected: string }> {
    return {
      heading: await this.page.locator(HEADING).first().isVisible(),
      title: await this.page.title(),
      tabs: (await this.page.getByRole('tab').allInnerTexts()).map(flat),
      selected: flat(await this.page.locator('[role="tab"][aria-selected="true"]').innerText()),
    };
  }

  async crashed(): Promise<boolean> {
    return this.main.getByText(TEXT.crash).isVisible();
  }

  /** What the Basic Information tab shows. */
  async view(): Promise<{ office: string; businessType: string; commission: string; save: boolean; export: boolean }> {
    return {
      office: flat(await this.officeButton.innerText()),
      businessType: flat(await this.main.getByRole('combobox').innerText()),
      commission: await this.input.inputValue(),
      save: await this.saveButton.isEnabled(),
      export: await this.exportButton.isEnabled(),
    };
  }

  @step('Read the Business Type options')
  async businessTypeOptions(by: 'mouse' | 'keyboard'): Promise<string[]> {
    const combo = this.main.getByRole('combobox');
    if (by === 'mouse') await combo.click();
    else {
      await combo.focus();
      await this.page.keyboard.press('ArrowDown');
    }
    const options = this.page.getByRole('option');
    await options.first().waitFor();
    const texts = (await options.allInnerTexts()).map(flat);
    await this.page.keyboard.press('Escape');
    await options.first().waitFor({ state: 'detached' });
    return texts;
  }

  @step('Choose a business type')
  async selectBusinessType(name: string): Promise<void> {
    await this.main.getByRole('combobox').click();
    await this.page.getByRole('option', { name, exact: true }).click();
    await expect(this.main.getByRole('combobox')).toHaveText(name);
  }

  /** Each offered business type with the commission the field shows for it. */
  async commissionsByType(): Promise<Record<string, string>> {
    const found: Record<string, string> = {};
    for (const name of await this.businessTypeOptions('mouse')) {
      await this.selectBusinessType(name);
      found[name] = await this.commission();
    }
    return found;
  }

  /** What a local office sees when it opens the page itself. */
  async localView(): Promise<{ office: string; picker: number; field: boolean; save: number; export: number; businessType: string }> {
    return {
      office: flat(await this.main.getByText(/^\d{4} - /).first().innerText()),
      picker: await this.officeButton.count(),
      field: await this.input.isEnabled(),
      save: await this.saveButton.count(),
      export: await this.exportButton.count(),
      businessType: flat(await this.main.getByRole('combobox').innerText()),
    };
  }

  /** The business types ticked for an office in Settings > Location > Business Types. */
  @step('Read the business types ticked in Settings > Location')
  async locationBusinessTypes(officeNo: string): Promise<string[]> {
    await this.safeNavigateTo(this.url(officeNo).replace(/commissions\/cmp$/, 'settings/location'));
    const tab = this.page.getByRole('tab', { name: TEXT.locationTab });
    await tab.waitFor({ timeout: 60_000 });
    await tab.click();
    const box = (name: string) => this.page.getByRole('checkbox', { name, exact: true });
    await expect(box(ALL_BUSINESS_TYPES[0])).toBeVisible({ timeout: 30_000 });
    // The ticks arrive a moment after the boxes; wait until they stop changing.
    const read = async () => { const t: string[] = []; for (const n of ALL_BUSINESS_TYPES) if (await box(n).isChecked()) t.push(n); return t; };
    await this.settle(read);
    return read();
  }

  @step('Read the information tooltip')
  async infoTooltip(by: 'hover' | 'focus'): Promise<string> {
    const info = this.page.locator(INFO_BUTTON);
    const tip = this.page.locator(TOOLTIP);
    if (by === 'hover') await info.hover();
    else {
      // Focus arrives from the tab list, as by keyboard; focusing a button that already has focus opens nothing.
      await this.page.getByRole('tab').first().focus();
      await info.focus();
    }
    await tip.first().waitFor({ state: 'visible' });
    const text = flat(await tip.first().innerText());
    await this.page.mouse.move(0, 0);
    await this.page.getByRole('tab').first().focus();
    await tip.first().waitFor({ state: 'detached' });
    return text;
  }

  // ---------------------------------------------------------------- Change Local Office

  @step('Open Change Local Office')
  async openPicker(): Promise<void> {
    await this.officeButton.click();
    // The list arrives after the dialog opens; wait for the office rows and the current office's tick.
    await expect.poll(() => this.picker.locator(PICKER_ROWS).count(), { timeout: 30_000 }).toBeGreaterThan(1);
    await this.picker.locator(`tbody ${CHECKED}`).first().waitFor({ timeout: 10_000 }).catch(() => undefined);
  }

  private pickerRow(office: string): Locator {
    return this.picker.getByRole('row', { name: new RegExp(`\\b${office}\\b`) });
  }

  /** The dialog's offices, as "1102 Corporate Office - Long Beach". */
  async pickerOffices(): Promise<string[]> {
    return (await this.picker.locator(PICKER_ROWS).allInnerTexts()).map(flat).filter(Boolean); // the list ends with an empty spacer row
  }

  async pickerInfo(): Promise<{ current: string; activeTicked: boolean; placeholder: string; columns: string[]; checked: string[]; select: boolean }> {
    return {
      current: flat((await this.picker.getByText(/^Current:/).innerText()).replace(/^Current:/, '')),
      activeTicked: (await this.activeFilter().getAttribute('data-state')) === 'checked',
      placeholder: (await this.picker.getByRole('textbox').getAttribute('placeholder')) ?? '',
      columns: (await this.picker.locator('th').allInnerTexts()).map(flat).filter(Boolean),
      checked: await this.checkedOffices(),
      select: await this.picker.getByRole('button', { name: 'Select', exact: true }).isEnabled(),
    };
  }

  private activeFilter(): Locator {
    return this.picker.getByText(TEXT.activeFilter, { exact: true }).locator('xpath=..').getByRole('checkbox');
  }

  async checkedOffices(): Promise<string[]> {
    return (await this.picker.locator(`tbody ${CHECKED}`).evaluateAll((cs) => cs.map((c) => (c.closest('tr') as HTMLElement | null)?.innerText ?? ''))).map(flat);
  }

  @step('Search the office list')
  async searchOffices(text: string): Promise<string[]> {
    const before = await this.pickerOffices();
    await this.picker.getByPlaceholder(TEXT.pickerSearch).fill(text);
    // The list filters in the browser; wait until it has changed (or settled, when it cannot change).
    await expect.poll(async () => JSON.stringify(await this.pickerOffices()), { timeout: 5_000 }).not.toBe(JSON.stringify(before)).catch(() => undefined);
    return this.pickerOffices();
  }

  @step('Tick an office')
  async tickOffice(office: string): Promise<void> {
    await this.pickerRow(office).getByRole('checkbox').click();
  }

  @step('Click an office name')
  async clickOfficeName(office: string): Promise<void> {
    await this.pickerRow(office).getByRole('cell').last().click();
  }

  @step('Tick or untick Active/Inactive')
  async toggleActiveFilter(): Promise<void> {
    const before = JSON.stringify(await this.pickerOffices());
    await this.activeFilter().click();
    // The list is fetched again; it may keep its length while its offices change.
    await expect.poll(async () => JSON.stringify(await this.pickerOffices()), { timeout: 20_000 }).not.toBe(before);
  }

  @step('Close Change Local Office')
  async closePicker(how: 'Cancel' | 'Close' | 'Escape'): Promise<void> {
    if (how === 'Escape') await this.page.keyboard.press('Escape');
    else await this.picker.getByRole('button', { name: how, exact: true }).click();
    await this.picker.waitFor({ state: 'hidden' });
  }

  /** Picks an office; with an unsaved edit, answers the Unsaved changes question. */
  @step('Pick an office in Change Local Office')
  async pickOffice(office: string, unsaved?: DialogAnswer): Promise<void> {
    await this.openPicker();
    await this.searchOffices(office);
    await this.tickOffice(office);
    const loaded = unsaved && unsaved !== 'Discard' ? null : this.waitForOfficeLoad(office);
    await this.picker.getByRole('button', { name: 'Select', exact: true }).click();
    if (unsaved) await this.answerDialog(unsaved);
    await loaded;
  }

  /** Waits for both replies the page asks for when an office is picked. */
  private async waitForOfficeLoad(office: string): Promise<void> {
    let seen = 0;
    await this.page.waitForResponse((r) => isOfficeLoad(office)(r.request()) && ++seen === 2, { timeout: 30_000 }).catch(() => undefined);
    await expect(this.officeButton).toHaveText(new RegExp(`^${office} - `));
    // The field takes the new office's value a moment after the replies; wait until it stops changing.
    await this.settle(() => this.input.inputValue());
  }

  /** Waits until a reading has stayed the same for about a second. */
  private async settle(read: () => Promise<unknown>): Promise<void> {
    let last = '';
    let same = 0;
    await expect.poll(async () => {
      const now = JSON.stringify(await read());
      same = now === last ? same + 1 : 0;
      last = now;
      return same;
    }, { intervals: [300], timeout: 15_000 }).toBeGreaterThanOrEqual(3);
  }

  /** Answers the office's commission load with a server error until undone. */
  async failOfficeLoad(office: string): Promise<() => Promise<void>> {
    const handler = (route: import('@playwright/test').Route) => (isOfficeLoad(office)(route.request()) ? route.fulfill({ status: 500, body: 'Server error' }) : route.fallback());
    await this.page.route(PAGE_URL, handler);
    return () => this.page.unroute(PAGE_URL, handler);
  }

  // ---------------------------------------------------------------- commission field

  /** Replaces the field's text by typing, then leaves the field; returns what showed while typing. */
  @step('Type into the Commission field')
  async typeCommission(text: string): Promise<string> {
    await this.input.click();
    await this.input.press('Control+A');
    await this.input.press('Backspace');
    if (text) await this.input.pressSequentially(text);
    const typed = await this.input.inputValue();
    await this.input.blur();
    return typed;
  }

  /** Replaces the field's text with a paste from the clipboard, then leaves the field; returns what it shows. */
  @step('Paste into the Commission field')
  async pasteCommission(text: string): Promise<string> {
    await this.page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await this.page.evaluate((t) => navigator.clipboard.writeText(t), text);
    await this.input.click();
    await this.input.press('Control+A');
    await this.input.press('Backspace');
    await this.input.press('Control+V');
    await this.input.blur();
    return this.input.inputValue();
  }

  async commission(): Promise<string> {
    return this.input.inputValue();
  }

  /** Any message a user can see at the Commission field: text in its card, an alert, or a tooltip on hover. */
  async visibleFieldMessage(): Promise<string> {
    const card = await this.input.evaluate((el) => {
      let node: HTMLElement | null = el as HTMLElement;
      while (node && !(node.innerText ?? '').includes('Commission')) node = node.parentElement;
      return node?.innerText ?? '';
    });
    await this.input.hover();
    const extra = [...(await this.page.getByRole('alert').allInnerTexts()), ...(await this.page.locator(TOOLTIP).allInnerTexts())];
    return flat([card.replace('Commission', ''), ...extra].join(' '));
  }

  // ---------------------------------------------------------------- saving

  /** Starts a save (click, Enter in the field, or a double click), answers the confirmation, and returns what was sent. */
  @step('Save the commission')
  async save(via: 'click' | 'enter' | 'double' | 'keyboard' = 'click', answer: 'Save' | 'Cancel' | 'Escape' = 'Save'): Promise<{ sent: Record<string, unknown>[]; toasts: string[]; confirm: string }> {
    const sent: Record<string, unknown>[] = [];
    const listen = (r: Request) => { if (isSave(r)) sent.push((JSON.parse(body(r)) as Record<string, unknown>[])[0] ?? {}); };
    this.page.on('request', listen);
    try {
      if (via === 'enter') await this.input.press('Enter');
      else if (via === 'double') await this.saveButton.dblclick();
      else if (via === 'keyboard') await this.saveButton.press('Enter');
      else await this.saveButton.click();
      await this.confirmDialog().waitFor();
      const confirm = flat(await this.alert.innerText());
      if (answer !== 'Save') {
        if (answer === 'Escape') await this.page.keyboard.press('Escape');
        else await this.alert.getByRole('button', { name: 'Cancel' }).click();
        await this.alert.waitFor({ state: 'hidden' });
        return { sent, toasts: [], confirm };
      }
      const request = this.page.waitForRequest(isSave, { timeout: 30_000 });
      await this.alert.getByRole('button', { name: 'Save' }).click();
      await (await request).response(); // null when the connection drops
      await this.page.locator(TOAST).filter({ hasText: /CMP commission/ }).first().waitFor({ state: 'visible', timeout: 15_000 });
      return { sent, toasts: await this.toasts(), confirm };
    } finally {
      this.page.off('request', listen);
    }
  }

  confirmDialog(): Locator {
    return this.alert.filter({ hasText: TEXT.confirmTitle });
  }

  /** Sets an office's commission through the page (used to put a value back). */
  @step('Set an office commission')
  async setCommission(office: string, value: string, businessType?: string): Promise<void> {
    await this.open(OFFICE);
    await this.pickOffice(office);
    if (businessType) await this.selectBusinessType(businessType);
    if (Number.parseFloat(await this.commission()) === Number(value)) return;
    await this.typeCommission(value);
    const { toasts } = await this.save();
    expect(toasts).toContain(TEXT.saved);
  }

  /** Holds every save: drops the connection or answers 500; returns the bodies the page sent, and an undo. */
  async holdSaves(how: 'network' | 500): Promise<{ sent: Record<string, unknown>[]; undo: () => Promise<void> }> {
    const sent: Record<string, unknown>[] = [];
    const handler = (route: import('@playwright/test').Route) => {
      if (!isSave(route.request())) return route.fallback();
      sent.push((JSON.parse(body(route.request())) as Record<string, unknown>[])[0] ?? {});
      return how === 'network' ? route.abort() : route.fulfill({ status: 500, body: 'Server error' });
    };
    await this.page.route(PAGE_URL, handler);
    return { sent, undo: () => this.page.unroute(PAGE_URL, handler) };
  }

  async toasts(): Promise<string[]> {
    return (await this.page.locator(TOAST).allInnerTexts()).map(flat).filter(Boolean);
  }

  // ---------------------------------------------------------------- unsaved changes

  async dialogText(): Promise<string> {
    await this.alert.waitFor();
    return flat(await this.alert.innerText());
  }

  @step('Answer the dialog')
  async answerDialog(answer: DialogAnswer): Promise<void> {
    await this.alert.waitFor();
    if (answer === 'Escape') await this.page.keyboard.press('Escape');
    else await this.alert.getByRole('button', { name: answer, exact: true }).click();
    await this.alert.waitFor({ state: 'hidden' });
  }

  /** Reloads with an unsaved edit and reports whether the browser asked first (the answer keeps the page). */
  @step('Reload with an unsaved edit')
  async reloadAsksFirst(): Promise<boolean> {
    const flags = this.page as unknown as Record<string, unknown>;
    flags.__skipBeforeunloadAutoAccept = true;
    try {
      const asked = this.page.waitForEvent('dialog', { timeout: 10_000 }).then(async (d) => { const t = d.type(); await d.dismiss(); return t === 'beforeunload'; }).catch(() => false);
      await this.page.reload({ timeout: 5_000 }).catch(() => undefined);
      return await asked;
    } finally {
      flags.__skipBeforeunloadAutoAccept = false;
    }
  }

  // ---------------------------------------------------------------- tabs and exports

  @step('Open a tab')
  async openTab(tab: Tab): Promise<void> {
    const list = tab === 'Commission CMP History' ? this.page.waitForResponse((r) => isHistoryList(r.request()), { timeout: 30_000 }).catch(() => undefined) : null;
    await this.page.getByRole('tab', { name: tab }).click();
    // A dropped list sends no reply; its error toast (or an Unsaved changes question) ends the wait instead.
    const shown = (l: Locator) => l.first().waitFor({ timeout: 30_000 }).then(() => undefined, () => undefined);
    const reply = await Promise.race([list, shown(this.alert), ...(list ? [shown(this.page.locator(TOAST))] : [])]);
    // The grid's header can render a moment after a good list arrives; rows read before it have no columns.
    if (reply?.ok()) await this.main.locator('th').first().waitFor({ timeout: 30_000 }).catch(() => undefined);
  }

  async selectedTab(): Promise<string> {
    return flat(await this.page.locator('[role="tab"][aria-selected="true"]').innerText());
  }

  /** Clicks Export on the open tab and reads the downloaded workbook's first sheet as text. */
  @step('Export and read the file')
  async exportFile(): Promise<{ name: string; rows: string[][] }> {
    const [download] = await Promise.all([this.page.waitForEvent('download', { timeout: 60_000 }), this.exportButton.click()]);
    const file = await download.path();
    const book = XLSX.readFile(file);
    const rows = XLSX.utils.sheet_to_json<string[]>(book.Sheets[book.SheetNames[0] ?? '']!, { header: 1, raw: false, defval: '' });
    const trimmed = rows.map((r) => {
      const cells = r.map((c) => String(c).trim());
      while (cells.length && cells[cells.length - 1] === '') cells.pop(); // the sheet's range runs past the last column
      return cells;
    });
    return { name: download.suggestedFilename(), rows: trimmed.filter((r) => r.length) };
  }

  // ---------------------------------------------------------------- History

  async historyColumns(): Promise<string[]> {
    return (await this.main.locator('th').allInnerTexts()).map(flat).filter(Boolean);
  }

  async historyRows(): Promise<HistoryRow[]> {
    const columns = (await this.historyColumns()) as HistoryColumn[];
    const rows = await this.page.locator(GRID_ROWS).evaluateAll((trs) => trs.map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => (td.textContent ?? '').trim())));
    return rows.filter((r) => r.length >= columns.length).map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i]])) as HistoryRow);
  }

  /** Every History entry, read page by page from the one shown to the last. */
  @step('Read every History page')
  async allHistoryRows(): Promise<HistoryRow[]> {
    const rows = await this.historyRows();
    const { page, pages } = await this.pager();
    for (let p = Number(page) + 1; p <= pages; p++) {
      await this.goToPage('next');
      rows.push(...(await this.historyRows()));
    }
    return rows;
  }

  async failHistory(how: 'network' | 500): Promise<() => Promise<void>> {
    const handler = (route: import('@playwright/test').Route) => {
      if (!isHistoryList(route.request())) return route.fallback();
      return how === 'network' ? route.abort() : route.fulfill({ status: 500, body: 'Server error' });
    };
    await this.page.route(PAGE_URL, handler);
    return () => this.page.unroute(PAGE_URL, handler);
  }

  private header(column: HistoryColumn): Locator {
    return this.main.locator('th').filter({ hasText: column }).locator(HEADER_MENU_TRIGGER);
  }

  async headerMenuItems(column: HistoryColumn): Promise<string[]> {
    await this.header(column).click();
    const items = this.page.locator(MENU_ITEM);
    await items.first().waitFor();
    const texts = (await items.allInnerTexts()).map(flat);
    await this.page.keyboard.press('Escape');
    await this.menuGone();
    return texts;
  }

  /** A closing menu stays in the page for a moment; a header clicked before it has gone opens nothing. */
  private async menuGone(): Promise<void> {
    await expect(this.page.getByRole('menu')).toHaveCount(0);
  }

  @step('Sort History by a column')
  async sortHistory(column: HistoryColumn, direction: 'ascending' | 'descending'): Promise<HistoryRow[]> {
    await this.header(column).click();
    await this.page.locator(MENU_ITEM).filter({ hasText: `Sort ${direction}` }).click();
    await this.menuGone();
    return this.historyRows();
  }

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
    // The grid empties while the new page loads.
    await expect.poll(() => this.historyRows().then((r) => r.length), { timeout: 30_000 }).toBeGreaterThan(0);
    await this.settle(async () => [await this.page.locator(GRID_ROWS).count(), await this.pageCount()]);
  }

  /** The "/ N" after the page number box. */
  private async pageCount(): Promise<number> {
    const all = [...(await this.main.innerText()).matchAll(/\/\s*(\d+)/g)];
    return Number(all.at(-1)?.[1] ?? NaN);
  }

  async pager(): Promise<{ page: string; pages: number; first: boolean; previous: boolean; next: boolean; last: boolean }> {
    const enabled = (label: string) => this.main.getByRole('button', { name: label }).isEnabled();
    return {
      page: await this.main.getByLabel('Current page number').inputValue(),
      pages: await this.pageCount(),
      first: await enabled('Go to first page'),
      previous: await enabled('Go to previous page'),
      next: await enabled('Go to next page'),
      last: await enabled('Go to last page'),
    };
  }

  @step('Move through History pages')
  async goToPage(to: 'first' | 'previous' | 'next' | 'last' | number | string): Promise<void> {
    const button = ['first', 'previous', 'next', 'last'].includes(String(to));
    // A page number the box refuses sends nothing, so the wait for the list is short there.
    const list = this.page.waitForResponse((r) => isHistoryList(r.request()), { timeout: button ? 10_000 : 4_000 }).catch(() => undefined);
    if (button) await this.main.getByRole('button', { name: `Go to ${to} page` }).click();
    else {
      const box = this.main.getByLabel('Current page number');
      await box.fill(String(to));
      await box.press('Enter');
    }
    await list;
    await this.settle(() => this.historyRows());
  }

  @step('Drag a column edge')
  async resizeColumn(column: HistoryColumn, dx: number): Promise<{ before: number; after: number }> {
    const th = this.main.locator('th').filter({ hasText: column });
    const before = await th.evaluate((t) => (t as HTMLElement).offsetWidth);
    const box = (await this.page.locator(resizeHandle(COLUMN_ID[column])).boundingBox())!;
    await this.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await this.page.mouse.down();
    await this.page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2, { steps: 6 });
    await this.page.mouse.up();
    return { before, after: await th.evaluate((t) => (t as HTMLElement).offsetWidth) };
  }

  /** The controls focus reaches on each Tab press from the selected tab (the tab panel itself is skipped). */
  async tabOrder(count: number): Promise<string[]> {
    // A late re-render after loading can drop focus back to the page; start only once the tab holds it.
    const start = this.page.locator('[role="tab"][aria-selected="true"]');
    await expect(async () => {
      await start.focus();
      await expect(start).toBeFocused({ timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
    const order: string[] = [];
    for (let i = 0; order.length < count && i < count + 3; i++) {
      await this.page.keyboard.press('Tab');
      const name = await this.page.evaluate(() => {
        const e = document.activeElement as HTMLElement | null;
        if (!e || e.getAttribute('role') === 'tabpanel') return null;
        return e.tagName === 'INPUT' ? 'Commission field' : (e.innerText || e.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
      });
      if (name !== null) order.push(name);
    }
    return order;
  }
}
