import { Locator, Page, Request, Response, Route } from '@playwright/test';
import { step } from '../../fixtures/step-decorator';
import { BasePage } from '../base.page';
import { Log } from '../../utils/logger';
import { IConfig } from '../../types';
import {
  HEADING,
  BTN_MORE_INFORMATION,
  BTN_SAVE,
  BTN_GRID_OPTIONS,
  GRID,
  HEADER_CELLS,
  BODY_ROWS,
  GRID_SKELETON,
  resizeHandle,
  rowByServiceType,
  CMB_SERVICE_TYPE,
  LISTBOX_OPTION,
  BTN_ROW_DELETE,
  CELL_ERROR_TEXT,
  ALERT_DIALOG,
  DLG_UNSAVED_CHANGES,
  MENU,
  TOAST,
  TOAST_ERROR,
  TOAST_SUCCESS,
  BTN_SIDEBAR_SETUP,
  lnkMultidayPricingRules,
  LNK_SIDEBAR_HOME,
} from '../../selectors/multiday-pricing/multiday-pricing-rules';
import {
  MDP_PATH,
  MDP_MESSAGES,
  MDP_TABLE_SETTINGS_KEY,
} from '../../data/multiday-pricing/multiday-pricing-rules';

// First paint of real rows measured 3–12 s on e2e; 90 s covers a cold Next.js server.
const GRID_READY_TIMEOUT_MS = 90_000;

// The cell editor commits on blur through requestAnimationFrame, so a value is only in the grid's
// state two frames after focus leaves the cell. Every commit waits for that, never a fixed sleep.
const KEYSTROKE_DELAY_MS = 30;

// Every data call on this page is a Next.js server action: a POST to the page's own route carrying a
// `next-action` header. The browser never calls api/calculationengine/* directly (NM-2419/2420 run
// server-side), so interception keys on this route and on the action's payload/result shape.
const PAGE_ROUTE = /\/locations\/[^/]+\/settings\/multiday-pricing-rules(\?.*)?$/;

/** One rule as getMultidayPricingRules returns it (dates arrive as "$D<iso>" RSC strings). */
export interface MultidayRule {
  id: number;
  serviceTypeNameId: number;
  serviceTypeName: string;
  jobDays: number;
  billableDays: number;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
}

/** One entry of the updateMultidayPricingRulesAction payload. */
export interface MultidayUpdate {
  id: number;
  serviceTypeNameId: number;
  jobDays: number;
  billableDays: number;
  isDeleted: boolean;
}

/** One service type as getAllServiceTypesAction returns it (flags drive dropdown eligibility). */
export interface ServiceTypeRecord {
  id: number;
  name: string;
  [flag: string]: unknown;
}

/** One rendered grid row. `values[0]` is 1 Day; null means the column is hidden. */
export interface GridRow {
  name: string;
  /**
   * Text of the Service Type dropdown when the row is still being created, else null. The empty
   * add-row reads "" — its "Select Service Type" placeholder is not part of the DOM text.
   */
  pendingName: string | null;
  values: (number | null)[];
  raw: (string | null)[];
  hasDelete: boolean;
}

export type SaveInterceptMode = 'abort' | 'server-error' | 'delay-then-abort';

// ---------------------------------------------------------------- RSC helpers (no page needed)

// A server-action response is a newline-delimited RSC stream. Row 0 names the row that holds the
// action's return value ("a":"$@1"); that row is plain JSON.
function resultRowRef(body: string): string | null {
  const root = body.split('\n').find((l) => l.startsWith('0:'));
  return root?.match(/"a":"\$@([0-9a-z]+)"/)?.[1] ?? null;
}

/** The return value of a server action, parsed out of its RSC response body. */
export function parseServerActionResult<T = unknown>(body: string): T | null {
  const ref = resultRowRef(body);
  if (!ref) return null;
  const line = body.split('\n').find((l) => l.startsWith(`${ref}:`));
  if (!line) return null;
  try {
    return JSON.parse(line.slice(ref.length + 1)) as T;
  } catch {
    return null;
  }
}

/** The same RSC body with the action's return value swapped for `value`. */
export function replaceServerActionResult(body: string, value: unknown): string {
  const ref = resultRowRef(body);
  if (!ref) return body;
  return body
    .split('\n')
    .map((l) => (l.startsWith(`${ref}:`) ? `${ref}:${JSON.stringify(value)}` : l))
    .join('\n');
}

type ActionEnvelope = { data?: { success?: boolean; data?: unknown; message?: string } };

function isRulesResult(r: unknown): r is { data: { success: boolean; data: MultidayRule[] } } {
  const d = (r as ActionEnvelope)?.data?.data;
  return Array.isArray(d) && d.length > 0 && typeof d[0] === 'object' && d[0] !== null && 'jobDays' in d[0];
}

function isServiceTypesResult(r: unknown): r is { data: { success: boolean; data: ServiceTypeRecord[] } } {
  const d = (r as ActionEnvelope)?.data?.data;
  return Array.isArray(d) && d.length > 0 && typeof d[0] === 'object' && d[0] !== null && 'isLabor' in d[0];
}

/** "$D2026-04-06T10:45:45.690Z" → "2026-04-06T10:45:45.690Z". */
export function rscDate(value: string): string {
  return typeof value === 'string' && value.startsWith('$D') ? value.slice(2) : value;
}

function isSaveRequest(req: Request): boolean {
  return req.method() === 'POST' && (req.postData() ?? '').includes('"updates"');
}

/** Parses the `updates` array out of a captured save request. */
export function updatesOf(req: Request): MultidayUpdate[] {
  const args = JSON.parse(req.postData() ?? '[]') as Array<{ updates?: MultidayUpdate[] }>;
  return args[0]?.updates ?? [];
}

// Setup → Multiday Pricing Rules. One page object for both modes: a read-only office renders plain
// spans, the corporate office renders an input per day cell plus a trailing add-row.
export class MultidayPricingRulesPage extends BasePage {
  constructor(page: Page, config?: IConfig) {
    super(page, config);
    Log.info('MultidayPricingRulesPage initialized');
  }

  private url(office: string): string {
    return `${this.config?.base_url || ''}${MDP_PATH(office)}`;
  }

  // ---------------------------------------------------------------- navigation & readiness

  /**
   * Opens the page and waits for real rows (or the empty state). By default also wipes the grid's
   * saved column preferences, which survive reloads and would silently reorder/hide columns for
   * every later test (the reordered columns in the NM-4129 screenshot are exactly that).
   */
  @step('Open the Multiday Pricing Rules page for an office')
  async open(office: string, options: { resetGridPreferences?: boolean } = {}): Promise<void> {
    const { resetGridPreferences = true } = options;
    await this.safeNavigateTo('about:blank');
    await this.navigateTo(this.url(office), { timeout: 60_000 });
    await this.waitForGrid();
    if (resetGridPreferences && (await this.readGridPreferences()) !== null) {
      await this.clearGridPreferences();
      await this.page.reload({ waitUntil: 'domcontentloaded' });
      await this.waitForGrid();
    }
  }

  /** Opens the page and returns the rule set the grid was built from (the server's own answer). */
  @step('Open the page and capture the rules the server returned')
  async openCapturingRules(office: string): Promise<MultidayRule[]> {
    await this.safeNavigateTo('about:blank');
    const result = await this.captureServerResult(isRulesResult, 'getMultidayPricingRules', [], async () => {
      await this.navigateTo(this.url(office), { timeout: 60_000 });
      // Cleared mid-load rather than by reload — a reload would fetch the rules a second time.
      await this.clearGridPreferences().catch(() => undefined);
    });
    return result.data.data;
  }

  /** Opens the page and returns the full service-type catalogue behind the Add dropdown. */
  @step('Open the page and capture the service type catalogue')
  async openCapturingServiceTypes(office: string): Promise<ServiceTypeRecord[]> {
    await this.safeNavigateTo('about:blank');
    const result = await this.captureServerResult(isServiceTypesResult, 'getAllServiceTypesAction', [{ culture: 'en-US' }], () =>
      this.navigateTo(this.url(office), { timeout: 60_000 }),
    );
    return result.data.data;
  }

  /** Reloads and captures the freshly loaded rules — the persistence oracle after a save. */
  @step('Reload the page and capture the rules the server returns')
  async reloadCapturingRules(): Promise<MultidayRule[]> {
    const result = await this.captureServerResult(isRulesResult, 'getMultidayPricingRules', [], async () => {
      await this.page.reload({ waitUntil: 'domcontentloaded' });
    });
    return result.data.data;
  }

  /** Reaches the page the way a user does: Setup group in the sidebar → Multiday Pricing Rules. */
  @step('Open Multiday Pricing Rules from the Setup menu')
  async openFromSetupMenu(office: string): Promise<void> {
    await this.safeNavigateTo('about:blank');
    await this.navigateTo(`${this.config?.base_url || ''}locations/${office}/home`, { timeout: 60_000 });
    // Right after load the sidebar links are built WITHOUT the office number
    // (/locations//settings/multiday-pricing-rules); clicking one then bounces back to Home. Wait
    // until the visible link carries this office before clicking, and require the office in the URL.
    await this.page.locator('main h1').first().waitFor({ state: 'visible', timeout: 60_000 });
    const target = `/locations/${office}/settings/multiday-pricing-rules`;
    const link = this.page.locator(lnkMultidayPricingRules(office)).filter({ visible: true }).first();
    for (let attempt = 1; attempt <= 2; attempt++) {
      if (!(await link.isVisible())) await this.page.locator(BTN_SIDEBAR_SETUP).first().click({ timeout: 30_000 });
      try {
        await link.waitFor({ state: 'visible', timeout: 15_000 });
        await link.click();
        await this.page.waitForURL((u) => u.pathname.endsWith(target), { timeout: 30_000 });
        break;
      } catch (error) {
        if (attempt === 2) throw error;
        Log.warn('[mdp] Setup menu did not open the page — retrying once');
      }
    }
    await this.waitForGrid();
  }

  /** Opens an arbitrary path under the app (used for the legacy /setup/ route). */
  @step('Open a path in the application')
  async openPath(path: string): Promise<void> {
    await this.safeNavigateTo('about:blank');
    await this.navigateTo(`${this.config?.base_url || ''}${path}`, { timeout: 60_000 });
  }

  // Ready = heading mounted, zero skeleton bars, and either data rows or the empty-state text.
  // Row count alone is not a signal — the grid mounts empty before the server action resolves.
  @step('Wait for the Multiday Pricing grid to finish loading')
  async waitForGrid(timeout = GRID_READY_TIMEOUT_MS): Promise<void> {
    await this.page.locator(HEADING).waitFor({ state: 'visible', timeout });
    await this.page.waitForFunction(
      ({ skeleton, empty }) => {
        const main = document.querySelector('main');
        if (!main || main.querySelectorAll(skeleton).length > 0) return false;
        const rows = main.querySelectorAll('table[data-slot="table"] tbody tr td').length;
        return rows > 0 || (main.textContent ?? '').includes(empty);
      },
      { skeleton: '[data-slot="skeleton"]', empty: MDP_MESSAGES.emptyState },
      { timeout },
    );
  }

  @step('Check whether the page heading is shown')
  async isHeadingVisible(): Promise<boolean> {
    return this.page.locator(HEADING).isVisible();
  }

  @step('Read the page heading')
  async getHeading(): Promise<string> {
    return ((await this.page.locator(HEADING).textContent()) ?? '').trim();
  }

  @step('Hover the More information icon and read its tooltip')
  async readInfoTooltip(): Promise<string> {
    await this.page.locator(BTN_MORE_INFORMATION).hover();
    const tip = this.page.getByRole('tooltip').first();
    await tip.waitFor({ state: 'visible', timeout: 10_000 });
    return ((await tip.textContent()) ?? '').trim();
  }

  @step('Check whether the loading skeleton is shown')
  async isSkeletonVisible(): Promise<boolean> {
    return (await this.page.locator(GRID_SKELETON).count()) > 0;
  }

  @step('Check whether the empty state is shown')
  async isEmptyStateVisible(): Promise<boolean> {
    return this.page.getByText(MDP_MESSAGES.emptyState, { exact: true }).isVisible();
  }

  // ---------------------------------------------------------------- toolbar

  /** The number in "<n> items found". */
  @step('Read the items-found count')
  async getItemsFoundCount(): Promise<number> {
    const text = await this.page.locator('main').getByText(/\d+\s+items found/).first().textContent();
    const match = (text ?? '').match(/(\d+)\s+items found/);
    if (!match) throw new Error(`Items-found text not recognised: "${text}"`);
    return parseInt(match[1] as string, 10);
  }

  /** Whether the Save button exists at all (it is not rendered for a read-only office). */
  @step('Check whether the Save button is present')
  async hasSaveButton(): Promise<boolean> {
    return (await this.page.locator(BTN_SAVE).count()) > 0;
  }

  @step('Check whether Save is enabled')
  async isSaveEnabled(): Promise<boolean> {
    return this.page.locator(BTN_SAVE).isEnabled();
  }

  /**
   * Clicks Save. `holdMs` keeps the mouse button down that long, as a person does (~100 ms): the
   * active cell commits on the next animation frame after it loses focus, and an instant
   * press-and-release fires Save before that frame — something no real user can do.
   */
  @step('Click Save')
  async clickSave(holdMs = 0): Promise<void> {
    await this.page.locator(BTN_SAVE).click({ delay: holdMs });
  }

  /** Clicks Save and waits for the real write to answer — the only call that persists data. */
  @step('Save the changes and wait for the server to answer')
  async saveAndWait(): Promise<{ updates: MultidayUpdate[]; status: number }> {
    const [req] = await Promise.all([
      this.page.waitForRequest(isSaveRequest, { timeout: 30_000 }),
      this.page.locator(BTN_SAVE).click(),
    ]);
    const res = await req.response();
    await this.page.locator(TOAST).first().waitFor({ state: 'visible', timeout: 30_000 });
    return { updates: updatesOf(req), status: res?.status() ?? 0 };
  }

  // ---------------------------------------------------------------- header, sort, resize, column prefs

  /** Visible column header labels in rendered order (the delete column has none). */
  @step('Read the grid column headers')
  async getHeaderLabels(): Promise<string[]> {
    const raw = await this.page.locator(HEADER_CELLS).allInnerTexts();
    return raw.map((t) => t.replace(/\s+/g, ' ').trim()).filter((t) => t.length > 0);
  }

  /** Index of a column (by its ID: serviceTypeName, day1 … day14) among the rendered th, or -1. */
  @step('Find a column by its ID')
  async getColumnIndex(columnId: string): Promise<number> {
    return this.page.locator(HEADER_CELLS).evaluateAll(
      (ths, id) => ths.findIndex((th) => th.querySelector(`button[aria-label="Resize column ${id}"]`) !== null),
      columnId,
    );
  }

  @step('Open a column header menu and pick an item')
  async chooseHeaderMenuItem(headerLabel: string, item: 'Sort ascending' | 'Sort descending' | 'Hide column'): Promise<void> {
    await this.page.locator(GRID).locator('thead').getByRole('button', { name: headerLabel, exact: true }).click();
    await this.page.locator(MENU).getByRole('menuitem', { name: item }).click();
  }

  @step('Sort the grid by a column')
  async sortBy(headerLabel: string, direction: 'ascending' | 'descending'): Promise<void> {
    await this.chooseHeaderMenuItem(headerLabel, direction === 'ascending' ? 'Sort ascending' : 'Sort descending');
  }

  /** Drags a column's resize handle by `dx` pixels; returns the header width before and after. */
  @step('Drag a column resize handle')
  async resizeColumn(columnId: string, dx: number): Promise<{ before: number; after: number }> {
    const handle = this.page.locator(resizeHandle(columnId));
    // `has` must be relative to the th, so the handle is matched by its own attribute only.
    const th = this.page.locator(HEADER_CELLS).filter({ has: this.page.locator(`button[aria-label="Resize column ${columnId}"]`) });
    const before = (await th.boundingBox())?.width ?? 0;
    const box = await handle.boundingBox();
    if (!box) throw new Error(`Resize handle for ${columnId} has no box`);
    const y = box.y + box.height / 2;
    await this.page.mouse.move(box.x + box.width / 2, y);
    await this.page.mouse.down();
    await this.page.mouse.move(box.x + box.width / 2 + dx / 2, y, { steps: 5 });
    await this.page.mouse.move(box.x + box.width / 2 + dx, y, { steps: 5 });
    await this.page.mouse.up();
    const after = (await th.boundingBox())?.width ?? 0;
    return { before, after };
  }

  @step('Open Grid Options and read its entries')
  async readGridOptions(): Promise<{ actions: string[]; columns: { label: string; checked: boolean }[] }> {
    await this.page.locator(BTN_GRID_OPTIONS).click();
    const menu = this.page.locator(MENU).last();
    await menu.waitFor({ state: 'visible' });
    const actions = (await menu.getByRole('menuitem').allInnerTexts()).map((t) => t.trim());
    const columns = await menu.getByRole('menuitemcheckbox').evaluateAll((items) =>
      items.map((i) => ({ label: (i.textContent ?? '').trim(), checked: i.getAttribute('aria-checked') === 'true' })),
    );
    await this.page.keyboard.press('Escape');
    // Reopening while the close animation runs would toggle the menu shut again.
    await menu.waitFor({ state: 'hidden' });
    return { actions, columns };
  }

  @step('Reset the grid to its default view from Grid Options')
  async resetToDefaultView(): Promise<void> {
    await this.page.locator(BTN_GRID_OPTIONS).click();
    const reset = this.page.getByRole('menuitem', { name: 'Reset to Default View' });
    await reset.waitFor({ state: 'visible' });
    await reset.click();
  }

  @step('Read the saved grid preferences')
  async readGridPreferences(): Promise<Record<string, unknown> | null> {
    const raw = await this.page.evaluate((k) => localStorage.getItem(k), MDP_TABLE_SETTINGS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
  }

  @step('Write saved grid preferences')
  async writeGridPreferences(prefs: Record<string, unknown>): Promise<void> {
    await this.page.evaluate(([k, v]) => localStorage.setItem(k as string, v as string), [MDP_TABLE_SETTINGS_KEY, JSON.stringify(prefs)]);
  }

  @step('Clear saved grid preferences')
  async clearGridPreferences(): Promise<void> {
    await this.page.evaluate((k) => localStorage.removeItem(k), MDP_TABLE_SETTINGS_KEY);
  }

  @step('Reload the page')
  async reload(): Promise<void> {
    await this.page.reload({ waitUntil: 'domcontentloaded' });
    await this.waitForGrid();
  }

  // ---------------------------------------------------------------- reading the grid

  /**
   * Every rendered row, with day values addressed by column ID rather than position — so a hidden
   * or reordered column never shifts a value into the wrong day. Read-only cells are spans, editable
   * cells are inputs; both are read here.
   */
  @step('Read every row of the grid')
  async readGrid(): Promise<GridRow[]> {
    const rows = await this.page.locator(GRID).evaluate((table) => {
      const ids = Array.from(table.querySelectorAll('thead th')).map((th) => {
        const label = th.querySelector('button[aria-label^="Resize column "]')?.getAttribute('aria-label') ?? '';
        return label.replace('Resize column ', '') || null;
      });
      return Array.from(table.querySelectorAll('tbody tr'))
        .filter((tr) => tr.querySelectorAll('td').length > 1)
        .map((tr) => {
          const tds = Array.from(tr.querySelectorAll('td'));
          const cell = (id: string): Element | null => {
            const i = ids.indexOf(id);
            return i < 0 ? null : (tds[i] ?? null);
          };
          const nameCell = cell('serviceTypeName');
          const combo = nameCell?.querySelector('[role="combobox"]') ?? null;
          const raw: (string | null)[] = [];
          for (let d = 1; d <= 14; d++) {
            const c = cell(`day${d}`);
            if (!c) {
              raw.push(null);
              continue;
            }
            const input = c.querySelector('input');
            raw.push(input ? input.value : (c.textContent ?? '').trim());
          }
          return {
            name: combo ? '' : (nameCell?.textContent ?? '').trim(),
            pendingName: combo ? (combo.textContent ?? '').trim() : null,
            raw,
            hasDelete: tr.querySelector('button[aria-label="Delete"]') !== null,
          };
        });
    });
    return rows.map((r) => ({
      ...r,
      values: r.raw.map((v) => (v === null || v === '' || v === '-' ? null : Number(v))),
    }));
  }

  /** Committed service-type rows only — excludes the trailing add-row and any row mid-creation. */
  @step('Read the configured service type rows')
  async readConfiguredRows(): Promise<GridRow[]> {
    return (await this.readGrid()).filter((r) => r.name !== '');
  }

  @step('Read the service type names in grid order')
  async getServiceTypeNames(): Promise<string[]> {
    return (await this.readConfiguredRows()).map((r) => r.name);
  }

  @step('Read the 14 day values of one service type')
  async getRowValues(serviceType: string): Promise<(number | null)[]> {
    const row = (await this.readGrid()).find((r) => r.name === serviceType || r.pendingName === serviceType);
    if (!row) throw new Error(`No grid row for service type "${serviceType}"`);
    return row.values;
  }

  @step('Check whether a service type row is shown')
  async hasRow(serviceType: string): Promise<boolean> {
    return (await this.page.locator(rowByServiceType(serviceType)).count()) > 0;
  }

  rowLocator(serviceType: string): Locator {
    return this.page.locator(rowByServiceType(serviceType)).first();
  }

  /** The trailing "Select Service Type" row an editor uses to add a new service type. */
  addRowLocator(): Locator {
    return this.page.locator(BODY_ROWS).filter({ has: this.page.locator(CMB_SERVICE_TYPE) }).last();
  }

  /** The input (edit mode) or td (read mode) for one day of one service type. */
  async dayCell(serviceType: string, day: number): Promise<Locator> {
    const idx = await this.getColumnIndex(`day${day}`);
    if (idx < 0) throw new Error(`Column day${day} is not rendered (hidden?)`);
    return this.rowLocator(serviceType).locator('td').nth(idx);
  }

  async dayInput(serviceType: string, day: number): Promise<Locator> {
    return (await this.dayCell(serviceType, day)).locator('input');
  }

  @step('Count editable controls inside the grid body')
  async countBodyEditors(): Promise<{ inputs: number; comboboxes: number; deletes: number }> {
    const body = this.page.locator(GRID).locator('tbody');
    return {
      inputs: await body.locator('input:not([readonly])').count(),
      comboboxes: await body.locator(CMB_SERVICE_TYPE).count(),
      deletes: await body.locator(BTN_ROW_DELETE).count(),
    };
  }

  // ---------------------------------------------------------------- editing

  /**
   * Types into one day cell WITHOUT committing — the editor stays active. Selection is cleared with
   * Backspace first: a rejected keystroke (e.g. "-") collapses a Ctrl+A selection, so typing over a
   * selection would append instead of replace.
   */
  @step('Type into a billable-day cell')
  async typeIntoDay(serviceType: string, day: number, text: string): Promise<void> {
    const input = await this.dayInput(serviceType, day);
    await input.click();
    await input.press('Control+A');
    await input.press('Backspace');
    if (text.length > 0) await input.pressSequentially(text, { delay: KEYSTROKE_DELAY_MS });
  }

  /** Moves focus off the active cell (to the page heading) and waits for the rAF-deferred commit. */
  @step('Leave the cell so the value commits')
  async commitActiveCell(): Promise<void> {
    await this.page.locator(HEADING).click();
    await this.page.evaluate(
      () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
    );
  }

  @step('Set a billable-day value and commit it')
  async setDayValue(serviceType: string, day: number, value: string | number): Promise<void> {
    await this.typeIntoDay(serviceType, day, String(value));
    await this.commitActiveCell();
  }

  @step('Read a billable-day value')
  async getDayValue(serviceType: string, day: number): Promise<string> {
    const cell = await this.dayCell(serviceType, day);
    const input = cell.locator('input');
    if ((await input.count()) > 0) return input.inputValue();
    return ((await cell.textContent()) ?? '').trim();
  }

  /** aria-invalid plus the message the app wires to the input through aria-describedby. */
  @step('Read the validation state of a billable-day cell')
  async getDayValidation(serviceType: string, day: number): Promise<{ invalid: boolean; message: string | null }> {
    const input = await this.dayInput(serviceType, day);
    const invalid = (await input.getAttribute('aria-invalid')) === 'true';
    const describedBy = await input.getAttribute('aria-describedby');
    const message = describedBy
      ? ((await this.page.locator(CELL_ERROR_TEXT(describedBy)).textContent()) ?? '').trim()
      : null;
    return { invalid, message };
  }

  @step('Check whether a billable-day cell has focus')
  async isDayFocused(serviceType: string, day: number): Promise<boolean> {
    const input = await this.dayInput(serviceType, day);
    return input.evaluate((el) => document.activeElement === el);
  }

  @step('Read the attributes of a billable-day input')
  async getDayInputAttributes(serviceType: string, day: number): Promise<Record<string, string | null>> {
    const input = await this.dayInput(serviceType, day);
    return input.evaluate((el) => ({
      readonly: el.getAttribute('readonly'),
      title: el.getAttribute('title'),
      inputmode: el.getAttribute('inputmode'),
      ariaInvalid: el.getAttribute('aria-invalid'),
      ariaReadonly: el.getAttribute('aria-readonly'),
    }));
  }

  // ---------------------------------------------------------------- adding a service type

  @step('Open the Service Type dropdown on the add-row and read the options')
  async readServiceTypeOptions(): Promise<string[]> {
    await this.addRowLocator().locator(CMB_SERVICE_TYPE).click();
    const options = this.page.locator(LISTBOX_OPTION);
    await options.first().waitFor({ state: 'visible' });
    const texts = (await options.allInnerTexts()).map((t) => t.trim());
    await this.page.keyboard.press('Escape');
    return texts;
  }

  /** Picks a service type on the add-row. Leaves the 14 cells blank — see enterNewRow(). */
  @step('Select a service type on the add-row')
  async selectNewServiceType(serviceType: string): Promise<void> {
    await this.addRowLocator().locator(CMB_SERVICE_TYPE).click();
    await this.page.locator(LISTBOX_OPTION).filter({ hasText: new RegExp(`^${escapeRegExp(serviceType)}$`) }).click();
  }

  /**
   * Focuses the new row's 1 Day cell — the action that commits a new service type: the app fills
   * the defaults (1…14), locks the name, and appends a fresh add-row.
   */
  @step('Enter the new row so its defaults are filled in')
  async enterNewRow(serviceType: string): Promise<void> {
    const input = (await this.dayCell(serviceType, 1)).locator('input');
    await input.click();
    await this.commitActiveCell();
  }

  @step('Add a service type with its default billable days')
  async addServiceType(serviceType: string): Promise<void> {
    await this.selectNewServiceType(serviceType);
    await this.enterNewRow(serviceType);
  }

  @step('Check whether a row still shows the Service Type dropdown')
  async rowHasServiceTypeDropdown(serviceType: string): Promise<boolean> {
    return (await this.rowLocator(serviceType).locator(CMB_SERVICE_TYPE).count()) > 0;
  }

  // ---------------------------------------------------------------- deleting

  @step('Check whether a row Delete button is enabled')
  async isRowDeleteEnabled(serviceType: string): Promise<boolean> {
    return this.rowLocator(serviceType).locator(BTN_ROW_DELETE).isEnabled();
  }

  /** Clicks a row's Delete button and returns the confirmation dialog's title and text. */
  @step('Click Delete on a service type row')
  async clickRowDelete(serviceType: string): Promise<{ title: string; text: string }> {
    await this.rowLocator(serviceType).locator(BTN_ROW_DELETE).click();
    const dlg = this.page.locator(ALERT_DIALOG).last();
    await dlg.waitFor({ state: 'visible' });
    const title = ((await dlg.getByRole('heading').first().textContent()) ?? '').trim();
    return { title, text: ((await dlg.innerText()) ?? '').replace(/\s+/g, ' ').trim() };
  }

  @step('Answer the delete confirmation')
  async answerDeleteDialog(answer: 'Yes' | 'No' | 'Close' | 'Escape'): Promise<void> {
    const dlg = this.page.locator(ALERT_DIALOG).last();
    if (answer === 'Escape') await this.page.keyboard.press('Escape');
    else await dlg.getByRole('button', { name: answer, exact: true }).click();
    await dlg.waitFor({ state: 'hidden' });
  }

  @step('Stage a service type for deletion')
  async deleteServiceType(serviceType: string): Promise<void> {
    await this.clickRowDelete(serviceType);
    await this.answerDeleteDialog('Yes');
  }

  // ---------------------------------------------------------------- dialogs & toasts

  @step('Check whether the Unsaved changes dialog is shown')
  async isUnsavedDialogVisible(): Promise<boolean> {
    return this.page.locator(DLG_UNSAVED_CHANGES).isVisible();
  }

  @step('Read the Unsaved changes dialog')
  async readUnsavedDialog(): Promise<string> {
    const dlg = this.page.locator(DLG_UNSAVED_CHANGES);
    await dlg.waitFor({ state: 'visible', timeout: 10_000 });
    return ((await dlg.innerText()) ?? '').replace(/\s+/g, ' ').trim();
  }

  @step('Answer the Unsaved changes dialog')
  async answerUnsavedDialog(answer: 'Stay' | 'Discard'): Promise<void> {
    const dlg = this.page.locator(DLG_UNSAVED_CHANGES);
    await dlg.getByRole('button', { name: answer, exact: true }).click();
    await dlg.waitFor({ state: 'hidden' });
  }

  @step('Click Home in the sidebar')
  async clickSidebarHome(): Promise<void> {
    await this.page.locator(LNK_SIDEBAR_HOME).first().click();
  }

  @step('Wait for a toast and read it')
  async waitForToast(type: 'success' | 'error' | 'any' = 'any', timeout = 30_000): Promise<string> {
    const sel = type === 'success' ? TOAST_SUCCESS : type === 'error' ? TOAST_ERROR : TOAST;
    const toast = this.page.locator(sel).last();
    await toast.waitFor({ state: 'visible', timeout });
    return ((await toast.innerText()) ?? '').trim();
  }

  // ---------------------------------------------------------------- network control

  /**
   * Holds the save server action instead of letting it write: 'abort' fails it at the network,
   * 'server-error' answers 500, 'delay-then-abort' holds it `delayMs` first (to observe the
   * in-flight state). Every captured payload lands in the returned array. Nothing reaches the DB.
   */
  @step('Intercept the save request so nothing is written')
  async interceptSave(mode: SaveInterceptMode, delayMs = 3_000): Promise<MultidayUpdate[][]> {
    const captured: MultidayUpdate[][] = [];
    await this.page.route(PAGE_ROUTE, async (route: Route) => {
      const req = route.request();
      if (!isSaveRequest(req)) return route.fallback();
      captured.push(updatesOf(req));
      if (mode === 'server-error') {
        return route.fulfill({ status: 500, contentType: 'text/plain', body: 'Internal Server Error' });
      }
      if (mode === 'delay-then-abort') await new Promise((r) => setTimeout(r, delayMs));
      return route.abort();
    });
    return captured;
  }

  /**
   * Rewrites (or holds, or kills) the getMultidayPricingRules answer for the next page load.
   * The real call still goes out — it is read-only — so only the browser's view changes.
   */
  @step('Control the rules response for the next page load')
  async mockRules(mock: { kind: 'empty' } | { kind: 'failure'; message?: string } | { kind: 'abort' } | { kind: 'delay'; ms: number }): Promise<void> {
    await this.page.route(PAGE_ROUTE, async (route: Route) => {
      const req = route.request();
      if (req.method() !== 'POST' || !req.headers()['next-action'] || isSaveRequest(req)) return route.fallback();
      const response = await route.fetch();
      const body = await response.text();
      if (!isRulesResult(parseServerActionResult(body))) return route.fulfill({ response, body });
      switch (mock.kind) {
        case 'empty':
          return route.fulfill({ response, body: replaceServerActionResult(body, { data: { success: true, data: [] } }) });
        case 'failure':
          return route.fulfill({
            response,
            body: replaceServerActionResult(body, { data: { success: false, message: mock.message ?? 'Simulated rules failure' } }),
          });
        case 'abort':
          return route.abort();
        case 'delay':
          await new Promise((r) => setTimeout(r, mock.ms));
          return route.fulfill({ response, body });
      }
    });
  }

  @step('Remove every network interception')
  async clearInterceptions(): Promise<void> {
    await this.page.unrouteAll({ behavior: 'ignoreErrors' });
  }

  /**
   * Runs `trigger` (a navigation) and returns the first server-action result that satisfies
   * `accept`. Every server-action body is read from a response listener, then the grid is awaited —
   * once it has rendered, the result it was built from has necessarily arrived. If the listener
   * still missed it (a body evicted mid-navigation), the same read-only action is asked directly,
   * so the oracle is always the server's own answer.
   */
  private async captureServerResult<T>(
    accept: (r: unknown) => r is T,
    actionName: string,
    actionArgs: unknown[],
    trigger: () => Promise<void>,
  ): Promise<T> {
    let found: T | null = null;
    const reads: Promise<void>[] = [];
    const onResponse = (res: Response): void => {
      const req = res.request();
      if (req.method() !== 'POST' || !PAGE_ROUTE.test(res.url()) || !req.headers()['next-action']) return;
      reads.push(
        res
          .text()
          .then((body) => {
            const parsed = parseServerActionResult(body);
            if (found === null && accept(parsed)) found = parsed;
          })
          .catch(() => undefined),
      );
    };
    this.page.on('response', onResponse);
    try {
      await trigger();
      await this.waitForGrid();
      // Bounded: a body that never finishes streaming must not hold the test — the direct-call
      // fallback below covers a missed result. Unbounded, this hung the add-and-delete persistence case to its 420 s timeout.
      await Promise.race([Promise.allSettled(reads), new Promise((r) => setTimeout(r, 15_000))]);
    } finally {
      this.page.off('response', onResponse);
    }
    if (found !== null) return found;
    Log.warn(`[mdp] ${actionName} response not captured on load — asking the server directly`);
    const { result } = await this.callServerAction(actionName, actionArgs);
    if (!accept(result)) throw new Error(`${actionName} returned an unexpected shape: ${JSON.stringify(result).slice(0, 300)}`);
    return result;
  }

  /**
   * Server-action ids are build hashes that change every deploy, so they are read from the page's
   * own chunk at run time rather than hard-coded.
   */
  @step('Resolve the server action ids from the page bundle')
  async resolveServerActionIds(): Promise<Record<string, string>> {
    return this.page.evaluate(async () => {
      const fromScripts = Array.from(document.scripts).map((s) => s.src);
      const fromResources = performance.getEntriesByType('resource').map((e) => e.name);
      const src = [...fromScripts, ...fromResources].find((u) => u.includes('multiday-pricing-rules/page-'));
      if (!src) return {};
      const text = await (await fetch(src)).text();
      const out: Record<string, string> = {};
      for (const m of text.matchAll(/createServerReference\)\("([0-9a-f]+)",[^)]*?"(\w+)"\)/g)) {
        out[m[2] as string] = m[1] as string;
      }
      return out;
    });
  }

  /**
   * Calls a server action directly from the current page, bypassing the UI — the authorization
   * probe NM-4129 asks for ("hiding controls in the UI is not sufficient").
   */
  @step('Call a server action directly, bypassing the UI')
  async callServerAction(actionName: string, args: unknown[]): Promise<{ status: number; result: unknown }> {
    const ids = await this.resolveServerActionIds();
    const id = ids[actionName];
    if (!id) throw new Error(`Server action "${actionName}" not found in the page bundle (found: ${Object.keys(ids).join(', ')})`);
    const { status, body } = await this.page.evaluate(
      async ({ actionId, payload }) => {
        const res = await fetch(location.pathname, {
          method: 'POST',
          headers: { 'next-action': actionId, accept: 'text/x-component', 'content-type': 'text/plain;charset=UTF-8' },
          body: JSON.stringify(payload),
        });
        return { status: res.status, body: await res.text() };
      },
      { actionId: id, payload: args },
    );
    return { status, result: parseServerActionResult(body) };
  }

  /**
   * Sends a server action from a brand-new browser context with NO session (no cookies), exactly as
   * an anonymous caller would. The action id is read from the current (signed-in) page first.
   * Redirects are not followed, so a refusal is visible as the server's own answer.
   */
  @step('Call a server action without any session')
  async callServerActionWithoutSession(actionName: string, args: unknown[]): Promise<{ status: number; result: unknown }> {
    const ids = await this.resolveServerActionIds();
    const id = ids[actionName];
    if (!id) throw new Error(`Server action "${actionName}" not found in the page bundle`);
    const browser = this.page.context().browser();
    if (!browser) throw new Error('No browser available to open an anonymous context');
    const anon = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    try {
      const res = await anon.request.post(this.page.url(), {
        headers: { 'next-action': id, accept: 'text/x-component', 'content-type': 'text/plain;charset=UTF-8' },
        data: JSON.stringify(args),
        maxRedirects: 0,
      });
      return { status: res.status(), result: parseServerActionResult(await res.text()) };
    } finally {
      await anon.close();
    }
  }

  // ---------------------------------------------------------------- misc page-level reads

  /** Visible text fragments that look like untranslated i18n keys (e.g. "pricing.multidayPricingRules.x"). */
  @step('Scan visible text for untranslated i18n keys')
  async findRawI18nKeys(): Promise<string[]> {
    const text = await this.page.locator('main').innerText();
    const hits = text.match(/\b[a-z][a-zA-Z]+(?:\.[a-zA-Z][a-zA-Z0-9]+){2,}\b/g) ?? [];
    return [...new Set(hits)];
  }

  /** Accessible names of the page-level controls, for the a11y naming check. */
  @step('Read the accessible names of the page controls')
  async readControlNames(): Promise<string[]> {
    return this.page.locator('main').getByRole('button').evaluateAll((bs) =>
      bs.map((b) => (b.getAttribute('aria-label') ?? b.textContent ?? '').trim()),
    );
  }

  /** Horizontal overflow of the document vs the grid's own scroller, for the layout checks. */
  @step('Measure horizontal overflow of the page and the grid')
  async measureOverflow(): Promise<{ pageOverflows: boolean; gridScrolls: boolean }> {
    return this.page.evaluate(() => {
      const table = document.querySelector('main table[data-slot="table"]');
      let scroller: HTMLElement | null = table?.parentElement ?? null;
      while (scroller && scroller.scrollWidth <= scroller.clientWidth) scroller = scroller.parentElement;
      return {
        pageOverflows: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        gridScrolls: !!scroller && scroller !== document.documentElement && scroller !== document.body,
      };
    });
  }

  /** Leaves the page, accepting any unsaved-changes prompt, so the next test starts clean. */
  @step('Leave the page and discard any unsaved edits')
  async leaveDiscardingChanges(): Promise<void> {
    await this.safeNavigateTo('about:blank');
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
