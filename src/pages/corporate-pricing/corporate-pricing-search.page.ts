/**
 * Corporate Pricing — Search screen page object.
 * `CorporatePricingSearchPage extends CorporatePricingBasePage` (Search page object).
 *
 * Filters STAGE on input (no network, no grid change);
 * the Search button submits all staged filters SERVER-SIDE as query params of
 * `GET /navigator/api/location/pricing/strategies`. Reset restores defaults + the full list
 * client-side. Read-only screen — no save. React/Next.js + shadcn DataTable; selectors are
 * text/role/placeholder/grid-<th>/content-anchored (near-zero data-testid).
 */
import type { Page, Locator } from '@playwright/test';
import { CorporatePricingBasePage } from './corporate-pricing.page';
import type { IConfig } from '../../types';
import { CorporatePricingSearchSelectors as S } from '../../selectors/corporate-pricing/search';
import { CORP_PRICING_SEARCH, CORP_PRICING_SEARCH_API } from '../../data/corporate-pricing/search';
import { CORPORATE_PRICING_COMMON } from '../../data/corporate-pricing/common';
import {
  CORP_PRICING_TOOLBAR_IO,
  CORP_PRICING_EXPORT_API,
  CORP_PRICING_LOC_EXPORT_API,
  CORP_PRICING_LOC_IMPORT_API,
  CORP_PRICING_IMPORT_ALL_API,
} from '../../data/corporate-pricing/toolbar-io';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Parsed result of a CSV file download (NM-2262 — reusable across the Corporate Pricing export flows). */
export type CsvDownloadResult = {
  filename: string;
  content: string;
  /** Parsed header row — fields are raw (NOT trimmed) so a whitespace regression is caught, not masked. */
  headers: string[];
  rows: string[][];
  rowCount: number;
  requestUrl: string;
  /**
   * The HTTP status of the export response, captured on the same click. Always a concrete number:
   * if the backing response cannot be captured the helper throws rather than returning a placeholder,
   * so a "200" assertion can never silently pass on a response that was never observed.
   */
  status: number;
};

/**
 * Outcome of a Loc Pricing Import upload (NM-2305). The load-bearing field is the REAL server outcome,
 * not the dialog: the upload dialog can look fine while the import silently failed, so this captures the
 * backing PUT's status AND raw response body and derives `success` from them — never from the UI alone.
 *
 * Two shapes:
 *  - The file was accepted and uploaded → `status` is the HTTP code, `responseBody` the raw JSON, and
 *    `success` is true only when the server returned 2xx AND `{ success: true }`.
 *  - The file was rejected before any upload (empty / wrong type / unparseable — the app validates the
 *    file in the browser and never enables Upload) → `status`/`requestUrl`/`responseBody` are null,
 *    `success` is false, and `message` is the rejection text shown in the dialog.
 */
export type LocImportResult = {
  success: boolean;
  status: number | null;
  message: string;
  requestUrl: string | null;
  responseBody: string | null;
};

/** One staged change row in the Import All "Select items to publish" delta modal (NM-2265). */
export type ImportAllStagedRow = {
  pricebook: string;
  productGroupId: string;
  productGroupName: string;
  price: string;
  newPrice: string;
};

/**
 * The client-side outcome of choosing a file in the Import All upload dialog (NM-2265). Choosing a file
 * does NOT commit — the app re-downloads the server pricebook and diffs the file against it in the browser.
 *  - `staged`: the file carried ≥1 change; `staged` lists them and Publish is available (nothing committed yet).
 *  - `no-changes`: the file matches the server exactly — nothing to publish.
 *  - `no-match`: no pricebook column matched the server (empty / malformed / wrong-variant file).
 *  - `unsupported-type`: a non-`.csv` file, rejected before any network.
 *  - `other`: no known message settled within the wait — the raw dialog text is returned for diagnosis.
 */
export type ImportAllOutcome = {
  kind: 'staged' | 'no-changes' | 'no-match' | 'unsupported-type' | 'other';
  message: string;
  staged: ImportAllStagedRow[];
  diffRequestUrl: string | null;
};

/** The result of publishing staged Import All changes — the ONLY mutating step (NM-2265). */
export type ImportAllPublishResult = {
  success: boolean;
  status: number | null;
  requestUrl: string | null;
  method: string | null;
  toast: string;
};

/**
 * Split one CSV line into raw fields, honoring double-quoted fields (so a comma inside a quoted value
 * does not split it) and escaped `""` quotes. Fields are NOT trimmed — the export is a file we verify,
 * so stray whitespace must surface as a mismatch rather than being silently normalized away.
 */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; } // escaped quote
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/**
 * Quote one CSV field per RFC 4180 when it contains a comma, double-quote, or newline: wrap it in
 * double-quotes and double any embedded quote; a plain value is returned unchanged. Keeps a pricebook or
 * strategy name that happens to contain a comma from shifting into the next column when captured rows are
 * written back out to a file.
 */
function toCsvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export type SearchCheckbox = 'isInternal' | 'isLabor' | 'activeOnly';

export class CorporatePricingSearchPage extends CorporatePricingBasePage {
  constructor(page: Page, config?: IConfig) {
    super(page, config);
  }

  async open(office: string = CORPORATE_PRICING_COMMON.office): Promise<void> {
    await this.gotoSearch(office);
    await this.waitForGridLoaded();
  }

  /**
   * Wait until the grid has actually rendered (headers + ≥1 data row).
   * NOT the "N items found" footer alone — that regex matches the transient "0 items found" empty
   * state that paints BEFORE the /pricing/strategies response lands (grid renders ~400ms later),
   * so waiting on the footer returns too early and every grid/column/option read races an empty grid.
   * Initial load always has rows (591); P1 search narrows never go to 0, so waiting for the first
   * row is safe (Playwright auto-waits, no fixed sleep).
   */
  async waitForGridLoaded(timeout = 30_000): Promise<void> {
    await this.page.locator(S.colHeaderAny).first().waitFor({ state: 'visible', timeout });
    await this.page.locator(S.rowGridAny).first().waitFor({ state: 'visible', timeout });
  }

  async getColumnHeaders(): Promise<string[]> {
    return this.readAllTexts(S.colHeaderAny);
  }

  async getColumnCount(): Promise<number> {
    return this.page.locator(S.colHeaderAny).count();
  }

  async getVisibleRowCount(): Promise<number> {
    return this.page.locator(S.rowGridAny).count();
  }

  async getItemCountText(): Promise<string> {
    return (await this.page.locator(S.lblItemsFound).first().innerText()).replace(/\s+/g, ' ').trim();
  }

  async getItemCountNumber(): Promise<number> {
    const t = await this.getItemCountText();
    return parseInt(t.replace(/[^\d]/g, ''), 10);
  }

  async booleanCellsValid(maxRows = 15): Promise<{ hasTrue: boolean; allValid: boolean }> {
    const boolIdx = [3, 4, 5, 6, 7];
    const rows = this.page.locator(S.rowGridAny);
    const n = Math.min(await rows.count(), maxRows);
    let hasTrue = false;
    let allValid = true;
    for (let r = 0; r < n; r++) {
      for (const c of boolIdx) {
        const t = (await rows.nth(r).locator('td').nth(c).innerText()).trim();
        if (t.includes(CORP_PRICING_SEARCH.booleanTrueMarker)) hasTrue = true;
        else if (t !== '') allValid = false;
      }
    }
    return { hasTrue, allValid };
  }

  async readBooleanCell(row: Locator, colIndex: number): Promise<boolean> {
    const cell = row.locator('td').nth(colIndex);
    const txt = (await cell.innerText()).trim();
    return txt.includes(CORP_PRICING_SEARCH.booleanTrueMarker);
  }

  async findRowByName(name: string): Promise<Locator | null> {
    return this.findGridRowByContent(name);
  }

  /**
   * Set a React controlled <input> via the native value-setter + input/change events.
   * This is the canonical React-controlled-input update (what React Testing Library does) and the
   * method PROVEN on the live walk to commit state so the next Search submits the new query.
   * `pressSequentially` keystrokes did NOT reliably commit React state for the Pricebook field
   * (likely a keystroke typeahead/debounce) → Search re-submitted an unchanged query → the app
   * deduped → no /pricing/strategies response → waitForResponse hung. NOT a Radix combobox, so the
   * DOM-tamper-crash caveat does not apply (plain text input; verified non-crashing live).
   */
  private async setTextFilter(selector: string, value: string): Promise<void> {
    await this.setReactInput(selector, value);
  }

  async fillPricebookFilter(value: string): Promise<void> {
    await this.setTextFilter(S.txtFilterPricebook, value);
  }

  async clearPricebookFilter(): Promise<void> {
    await this.setTextFilter(S.txtFilterPricebook, '');
  }

  async fillStrategyFilter(value: string): Promise<void> {
    await this.setTextFilter(S.txtFilterStrategy, value);
  }

  async getPricebookFilterValue(): Promise<string> {
    return this.page.locator(S.txtFilterPricebook).inputValue();
  }

  async getStrategyFilterValue(): Promise<string> {
    return this.page.locator(S.txtFilterStrategy).inputValue();
  }

  /**
   * The 3 filter checkboxes are the only `[role="checkbox"]` on the Search screen, in DOM order
   * Is Internal(0) / Is Labor(1) / Active Only(2). Indexed access is
   * the verified-stable locator (label-proximity `:has()` selectors are kept in search.ts as a
   * documented fallback). `.check()/.uncheck()` auto-verify the ARIA state (bare click can
   * focus-without-toggle on Radix checkboxes).
   */
  private checkbox(which: SearchCheckbox): Locator {
    const idx = which === 'isInternal' ? 0 : which === 'isLabor' ? 1 : 2;
    return this.page.locator('[role="checkbox"]').nth(idx);
  }

  async getCheckboxState(which: SearchCheckbox): Promise<boolean> {
    return (await this.checkbox(which).getAttribute('aria-checked')) === 'true';
  }

  async setCheckbox(which: SearchCheckbox, checked: boolean): Promise<void> {
    const cb = this.checkbox(which);
    if (checked) await cb.check();
    else await cb.uncheck();
  }

  private async readComboOptions(comboSelector: string): Promise<string[]> {
    await this.page.locator(comboSelector).first().click();
    await this.page.locator('[role="option"]').first().waitFor({ state: 'visible', timeout: 8_000 });
    // The Location popover lazy-loads/virtualizes its 2652 options — the first read can catch only the
    // "Clear selection" entry before the list populates. Best-effort wait for a 3rd option so the list
    // is loaded (no-op/caught for small dropdowns like Currency's 4). Then batch-read via allInnerTexts
    // (ONE protocol call — a per-option nth() loop over 2652 blew the 120s test timeout).
    await this.page.locator('[role="option"]').nth(2).waitFor({ state: 'visible', timeout: 5_000 }).catch(() => { /* small dropdown */ });
    const out = (await this.page.locator('[role="option"]').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
    await this.page.keyboard.press('Escape');
    return out.filter(Boolean);
  }

  async getCurrencyOptions(): Promise<string[]> {
    return this.readComboOptions(S.drpFilterCurrency);
  }

  async getLocationOptions(): Promise<string[]> {
    return this.readComboOptions(S.drpFilterLocation);
  }

  async getCurrencyDefaultText(): Promise<string> {
    return (await this.page.locator(S.drpFilterCurrency).first().innerText()).replace(/\s+/g, ' ').trim();
  }

  async getLocationDefaultText(): Promise<string> {
    return (await this.page.locator(S.drpFilterLocation).first().innerText()).replace(/\s+/g, ' ').trim();
  }

  async selectCurrency(value: string): Promise<void> {
    await this.page.locator(S.drpFilterCurrency).first().click();
    await this.page.locator('[role="option"]', { hasText: value }).first().click();
  }

  /**
   * Open the Location combobox and select the FIRST REAL location (option index 1 — index 0 is the
   * "Clear selection" entry). Returns the option's visible label (e.g. "1101 - Corporate Office …")
   * so the caller can parse the office number and assert the `locationNo` query param. Retry-on-detach:
   * the 2652-option virtualized popover can detach an option mid-render. Used by the field-coverage
   * representative each-option case — exhaustive enumeration of all 2652 is out of scope.
   */
  async selectFirstRealLocation(): Promise<string> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await this.page.locator(S.drpFilterLocation).first().click();
        const opt = this.page.locator('[role="option"]').nth(1);
        await opt.waitFor({ state: 'visible', timeout: 8_000 });
        const label = (await opt.innerText()).replace(/\s+/g, ' ').trim();
        await opt.click();
        return label;
      } catch {
        await this.page.keyboard.press('Escape').catch(() => { /* nothing open to dismiss */ });
      }
    }
    throw new Error('selectFirstRealLocation: the Location option did not stabilize after 3 attempts');
  }

  /**
   * Probe the Pricebook text filter (a plain React `<input>`) for a BVA / negative value, returning the
   * rejection check bundle WITHOUT clicking Search (the caller submits + asserts the
   * server result). Records, in order:
   *  - `staged` / `stagedLen`: the committed input value (proves no maxlength truncation on overflow)
   *  - `ariaInvalid`: any rejection signal on the input — expected `null` (a search filter accepts any literal)
   *  - `escaped`: whether a NATURAL Tab moved focus OUT of the field, recorded BEFORE any cleanup key —
   *    the helper NEVER presses Escape first, so a real focus-trap is not masked (escapability check;
   *    graduated from the 2026-06-10 TC-523 miss)
   *  - `pageError`: count of "client-side exception" / "Application error" banners — expected 0 (the plain
   *    input is crash-safe, unlike the Radix combobox which tears down the page on DOM-tamper)
   */
  async probePricebookBoundary(
    value: string,
  ): Promise<{ staged: string; stagedLen: number; ariaInvalid: string | null; escaped: boolean; pageError: number }> {
    const input = this.page.locator(S.txtFilterPricebook).first();
    await input.focus();
    await this.setReactInput(S.txtFilterPricebook, value);
    const staged = await input.inputValue();
    const ariaInvalid = await input.getAttribute('aria-invalid');
    // (b) escapable — focus the field, then a natural Tab; confirm focus LEFT it (before any Escape).
    await input.focus();
    const before = await this.page.evaluate(() => (document.activeElement as HTMLInputElement)?.placeholder ?? null);
    await this.page.keyboard.press('Tab');
    const after = await this.page.evaluate(() => (document.activeElement as HTMLInputElement)?.placeholder ?? null);
    const pageError = await this.page.locator('text=/client-side exception|Application error/').count();
    return { staged, stagedLen: staged.length, ariaInvalid, escaped: before !== after, pageError };
  }

  async clickSearch(): Promise<void> {
    await this.page.locator(S.btnSearch).first().click();
  }

  async clickReset(): Promise<void> {
    await this.page.locator(S.btnReset).first().click();
  }

  /**
   * Click Search and wait for the server list response to land + the grid to settle.
   * Avoids fixed sleeps — waits on the `/navigator/api/...pricing/strategies` response.
   * Returns the request URL (so callers can assert the query-param shape).
   */
  async searchAndWaitForList(): Promise<string> {
    const respPromise = this.page.waitForResponse(
      (r) => r.url().includes(CORP_PRICING_SEARCH_API),
      { timeout: 30_000 },
    );
    await this.clickSearch();
    const resp = await respPromise;
    // After Search, wait for grid STRUCTURE (headers), NOT a data row — a server filter can legitimately
    // return 0 results (e.g. Pricebook + Is Internal combo), so requiring a row would hang.
    await this.page.locator(S.colHeaderAny).first().waitFor({ state: 'visible', timeout: 30_000 });
    // Then wait for the app to finish rendering the (possibly zero) result rows. This settles the
    // row-count value so callers can read it immediately without a fixed sleep.
    await this.waitForAngularStable();
    return resp.url();
  }

  /**
   * Attach a counter for list-endpoint requests (filter `/navigator/api/...`, NOT the page URL).
   * Returns a live getter + a `dispose()` — the `authenticatedSession.page` is worker-scoped, so the
   * listener MUST be removed at test end or it stacks across tests in the same worker.
   */
  attachListCallCounter(): { count: () => number; urls: () => string[]; dispose: () => void } {
    const urls: string[] = [];
    const handler = (req: import('@playwright/test').Request): void => {
      if (req.url().includes(CORP_PRICING_SEARCH_API)) urls.push(req.url());
    };
    this.page.on('request', handler);
    return {
      count: () => urls.length,
      urls: () => [...urls],
      dispose: () => this.page.off('request', handler),
    };
  }

  async clickPricebookName(name: string): Promise<void> {
    const row = await this.findRowByName(name);
    if (!row) throw new Error(`Price Book row not found for "${name}"`);
    await row.locator('button.cursor-pointer').first().click();
  }

  /**
   * Open the New split-button menu. Radix DropdownMenu can intermittently not open on the first click
   * under heavy-page timing, so re-click (Escape + retry) up to 3× until a menu item renders (the
   * proven Radix large-interaction retry pattern).
   */
  async openNewMenu(): Promise<void> {
    const item = this.page.locator(S.mnuNewEquipmentPricing).first();
    for (let attempt = 0; attempt < 3; attempt++) {
      await this.page.locator(S.btnNew).first().click();
      try {
        // `waitFor` honors the timeout (unlike `isVisible({timeout})`, which checks immediately).
        await item.waitFor({ state: 'visible', timeout: 4_000 });
        return;
      } catch {
        if (attempt < 2) await this.page.keyboard.press('Escape').catch(() => { /* nothing open */ });
      }
    }
    await item.waitFor({ state: 'visible', timeout: 4_000 }); // final attempt — throws (real failure) if still closed
  }

  async clickNewEquipmentPricing(): Promise<void> {
    await this.openNewMenu();
    await this.page.locator(S.mnuNewEquipmentPricing).first().click();
  }

  async clickNewLaborPricing(): Promise<void> {
    await this.openNewMenu();
    await this.page.locator(S.mnuNewLaborPricing).first().click();
  }

  /**
   * All button label texts on the page (shadow-pierced, via textContent). Used for action-bar
   * presence: Playwright's `:text-is`/visible-text engine misses the action-bar buttons at the
   * test render (their label is not "visible text" to Playwright), but a shadow-walk over
   * `textContent` reliably finds all of them.
   */
  async getAllButtonTexts(): Promise<string[]> {
    return this.page.evaluate(() => {
      const acc: Element[] = [];
      const walk = (root: Document | ShadowRoot): void => {
        for (const n of Array.from(root.querySelectorAll('*'))) {
          acc.push(n);
          if ((n as HTMLElement).shadowRoot) walk((n as HTMLElement).shadowRoot as ShadowRoot);
        }
      };
      walk(document);
      return acc
        .filter((n) => n.tagName === 'BUTTON')
        .map((b) => (b.textContent || '').replace(/\s+/g, ' ').trim())
        .filter(Boolean);
    });
  }

  async getNewMenuItemTexts(): Promise<string[]> {
    await this.openNewMenu();
    const eq = (await this.page.locator(S.mnuNewEquipmentPricing).first().innerText().catch(() => '')).trim();
    const lb = (await this.page.locator(S.mnuNewLaborPricing).first().innerText().catch(() => '')).trim();
    await this.page.keyboard.press('Escape').catch(() => { /* menu may already be closing */ });
    return [eq, lb].filter(Boolean);
  }

  async getGridHeaders(): Promise<string[]> {
    return (await this.page.locator('thead th').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
  }

  async getPricebookNameCells(): Promise<{ text: string; isLink: boolean }[]> {
    const rows = this.page.locator('tbody tr');
    const n = await rows.count();
    const out: { text: string; isLink: boolean }[] = [];
    for (let i = 0; i < n; i++) {
      const firstCell = rows.nth(i).locator('td').first();
      const text = (await firstCell.innerText()).replace(/\s+/g, ' ').trim();
      const isLink = (await firstCell.locator('button.cursor-pointer, a, [role="link"]').count()) > 0;
      out.push({ text, isLink });
    }
    return out;
  }

  async getRowCellText(rowIndex: number, colIndex: number): Promise<string> {
    const cell = this.page.locator('tbody tr').nth(rowIndex).locator('td').nth(colIndex);
    return (await cell.innerText()).replace(/\s+/g, ' ').trim();
  }

  /**
   * The Currency column is filled by a SECOND request (the core/currencies lookup) that resolves
   * AFTER the grid rows render, so each Currency cell shows a "-" placeholder until it lands and the
   * grid re-maps the code. The grid-loaded wait only proves the rows rendered, so a Currency read
   * fired right after it can catch the placeholder (the window widens under heavy back-to-back load).
   * Poll the DOM until the first row's Currency cell resolves away from the placeholder before reading.
   * Best-effort (.catch): if it genuinely never resolves (a real defect), the caller still reads "-"
   * and its currency assertion fails cleanly — this removes the race without weakening the assertion.
   */
  async waitForCurrencyColumnResolved(timeout = 15_000): Promise<void> {
    const headers = await this.getGridHeaders();
    const idx = headers.findIndex((h) => /currency/i.test(h));
    if (idx < 0) return; // no Currency column on this grid — nothing to settle
    await this.page.waitForFunction(
      (i) => {
        const r0 = document.querySelector('tbody tr');
        if (!r0) return false;
        const txt = (r0.querySelectorAll('td')[i]?.textContent || '').trim();
        return txt.length > 0 && txt !== '-';
      },
      idx,
      { timeout, polling: 100 },
    ).catch(() => { /* never resolved — the read below returns the placeholder, assertion fails cleanly */ });
  }

  private async openToolbarMenu(triggerSelector: string): Promise<void> {
    const item = this.page.locator(S.mnuToolbarVariant).first();
    for (let attempt = 0; attempt < 3; attempt++) {
      await this.page.locator(triggerSelector).first().click();
      try {
        await item.waitFor({ state: 'visible', timeout: 4_000 });
        return;
      } catch {
        if (attempt < 2) await this.page.keyboard.press('Escape').catch(() => { /* nothing open */ });
      }
    }
    await item.waitFor({ state: 'visible', timeout: 4_000 }); // final attempt — throws if still closed
  }

  async openExportMenu(): Promise<void> {
    await this.openToolbarMenu(S.btnExport);
  }

  async openImportMenu(): Promise<void> {
    await this.openToolbarMenu(S.btnImport);
  }

  async getMenuVariants(): Promise<string[]> {
    return (await this.page.locator(S.mnuToolbarVariant).allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
  }

  /**
   * Dismiss the open toolbar menu by clicking outside it (on the page heading); true if it closed.
   * Uses a COORDINATE mouse-click, not `locator(heading).click()`: while a Radix menu is open it renders
   * a dismissable overlay over the page, so a locator click on an underlying element is "obscured" and
   * never becomes actionable (times out). A coordinate `mouse.click` dispatches a real pointerdown the
   * overlay catches to dismiss the menu. The heading sits top-left, well
   * outside the top-right Export/Import menu panel, so the click lands genuinely outside it.
   */
  async dismissToolbarMenuWithOutsideClick(): Promise<boolean> {
    const box = await this.page.locator(S.hdgCorporatePricing).first().boundingBox();
    if (box) await this.page.mouse.click(box.x + Math.min(box.width / 2, 40), box.y + box.height / 2);
    else await this.page.mouse.click(200, 200); // fallback: a safe outside-the-menu point
    await this.page.locator(S.mnuToolbarVariant).first().waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => { /* already gone */ });
    return (await this.page.locator(S.mnuToolbarVariant).count()) === 0;
  }

  // Clicking an Export variant now opens a shared dialog that requires 1–3 years and a currency
  // before Continue enables; only Continue fires the export. These helpers drive that gate and the
  // real per-variant download (the download reuses the same CSV capture as the Loc Pricing Export path).

  private exportDialog(): Locator {
    return this.page.locator(S.dlgExport).filter({ hasText: CORP_PRICING_TOOLBAR_IO.exportDialog.prompt }).first();
  }

  private exportYearCombo(): Locator {
    return this.exportDialog().locator(S.cmbExportField).nth(0);
  }
  private exportCurrencyCombo(): Locator {
    return this.exportDialog().locator(S.cmbExportField).nth(1);
  }

  async openExportVariantDialog(variant: string): Promise<void> {
    await this.openExportMenu();
    await this.page.locator(S.mnuToolbarVariant, { hasText: variant }).first().click();
    await this.exportDialog().waitFor({ state: 'visible', timeout: 6_000 });
  }

  async getExportDialogInfo(): Promise<{ text: string; comboCount: number; buttons: string[]; continueDisabled: boolean }> {
    const dlg = this.exportDialog();
    const text = (await dlg.innerText()).replace(/\s+/g, ' ').trim();
    const comboCount = await dlg.locator(S.cmbExportField).count();
    const buttons = (await dlg.locator('button').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const continueDisabled = await dlg.locator('button', { hasText: /^Continue$/ }).first().isDisabled();
    return { text, comboCount, buttons, continueDisabled };
  }

  async isExportContinueEnabled(): Promise<boolean> {
    return this.exportDialog().locator('button', { hasText: /^Continue$/ }).first().isEnabled();
  }

  private async openExportYearList(): Promise<void> {
    await this.exportYearCombo().click();
    await this.page.locator(S.optExportListItem).first().waitFor({ state: 'visible', timeout: 4_000 });
  }

  private async closeExportYearList(): Promise<void> {
    await this.page.keyboard.press('Escape');
    await this.page.locator(S.optExportListItem).first().waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => { /* already closed */ });
  }

  private async clickExportYearOption(year: string | number): Promise<void> {
    await this.page.locator(S.optExportListItem, { hasText: new RegExp(`^${year}$`) }).first().click();
  }

  async setExportYears(years: Array<string | number>): Promise<void> {
    await this.openExportYearList();
    for (const y of years) await this.clickExportYearOption(y);
    await this.closeExportYearList();
  }

  /**
   * Attempt to add ONE more year on top of the current selection, then report the resulting selected
   * years. Used to prove the 1–3 cap: after 3 are chosen, a 4th does not register (the app silently
   * refuses it), so the returned list still has 3 years.
   */
  async attemptExtraExportYear(year: string | number): Promise<string[]> {
    await this.openExportYearList();
    // Positive control: prove the extra option is actually present and clickable BEFORE clicking it, so a
    // "still 3 selected" result means the app REFUSED the 4th year — not that the option was missing or the
    // click silently did nothing. No catch here: if the option is absent or the click fails, the test must
    // fail loudly rather than pass on a swallowed failure.
    const extraOption = this.page.locator(S.optExportListItem, { hasText: new RegExp(`^${year}$`) }).first();
    await extraOption.waitFor({ state: 'visible', timeout: 4_000 });
    await extraOption.click();
    const selected = await this.getExportSelectedYears();
    await this.closeExportYearList();
    return selected;
  }

  async getExportSelectedYears(): Promise<string[]> {
    const text = await this.exportYearCombo().innerText().catch(() => '');
    const years = text.match(/\d{4}/g) ?? [];
    return [...new Set(years)].sort();
  }

  async getExportCurrencyOptions(): Promise<string[]> {
    await this.exportCurrencyCombo().click();
    await this.page.locator(S.optExportListItem).first().waitFor({ state: 'visible', timeout: 4_000 });
    const opts = await this.page.locator(S.optExportListItem).allInnerTexts();
    await this.page.keyboard.press('Escape');
    return opts.map((t) => t.trim()).filter(Boolean);
  }

  async setExportCurrency(code: string): Promise<void> {
    await this.exportCurrencyCombo().click();
    await this.page.locator(S.optExportListItem, { hasText: new RegExp(`^${code}$`) }).first().click();
  }

  async cancelExportDialog(): Promise<boolean> {
    await this.exportDialog().locator('button', { hasText: /^Cancel$/ }).first().click().catch(() => { /* best-effort: fall through to the hidden-state check below, which is the real oracle for whether it closed */ });
    return this.exportDialog().waitFor({ state: 'hidden', timeout: 3_000 }).then(() => true).catch(() => false);
  }

  async closeExportDialog(): Promise<boolean> {
    await this.exportDialog().locator('button', { hasText: /^Close$/ }).first().click().catch(() => { /* best-effort: fall through to the hidden-state check below, which is the real oracle for whether it closed */ });
    return this.exportDialog().waitFor({ state: 'hidden', timeout: 3_000 }).then(() => true).catch(() => false);
  }

  /**
   * Set Year(s)+Currency in the open Export dialog, arm a short listener for the export request, click
   * Cancel, and report whether any export request fired (should be false) plus whether the dialog closed.
   * The listener filters the backend export path, never the page URL.
   */
  async cancelExportAndCheckNoRequest(
    variant: string,
    years: Array<string | number>,
    currency: string,
  ): Promise<{ requestFired: boolean; closed: boolean }> {
    await this.openExportVariantDialog(variant);
    await this.setExportYears(years);
    await this.setExportCurrency(currency);
    const reqSeen = this.page
      .waitForRequest((r) => r.url().includes(CORP_PRICING_EXPORT_API), { timeout: 1_500 })
      .then(() => true)
      .catch(() => false);
    const closed = await this.cancelExportDialog();
    const requestFired = await reqSeen;
    return { requestFired, closed };
  }

  /**
   * NM-2264 real Export ▾ round-trip: open the variant dialog, set Year(s)+Currency, then Continue —
   * the post-gate Continue button is the download trigger (the Export menu button only opens the menu).
   * Reuses the shared CSV capture (download + request + response status on the same click).
   */
  async downloadExportVariant(
    variant: string,
    years: Array<string | number>,
    currency: string,
  ): Promise<CsvDownloadResult> {
    await this.openExportVariantDialog(variant);
    await this.setExportYears(years);
    await this.setExportCurrency(currency);
    const continueBtn = this.exportDialog().locator('button', { hasText: /^Continue$/ }).first();
    return this.captureCsvDownload(continueBtn, CORP_PRICING_EXPORT_API);
  }

  /**
   * Click Continue on the already-configured Export dialog and capture the fired export request URL +
   * response status — for the tests that assert the request params (currencyId / years / variant flags)
   * without needing to read the downloaded file. Any resulting download is left to auto-discard.
   */
  async continueExportAndCaptureRequest(): Promise<{ url: string; status: number }> {
    const continueBtn = this.exportDialog().locator('button', { hasText: /^Continue$/ }).first();
    const [req] = await Promise.all([
      this.page.waitForRequest((r) => r.url().includes(CORP_PRICING_EXPORT_API), { timeout: 20_000 }),
      continueBtn.click(),
    ]);
    const resp = await req.response();
    if (!resp) throw new Error('continueExportAndCaptureRequest: the export response was not captured');
    return { url: req.url(), status: resp.status() };
  }

  exportPricebookColumns(headers: string[]): string[] {
    return headers.slice(CORP_PRICING_TOOLBAR_IO.exportBaseColumns.length);
  }

  /**
   * The Product Group Id values (first column) of an export matrix's data rows. Skips the currency
   * row (row after the header) and any blank trailing entries. Used for duplicate-detection and for
   * the labor-vs-equipment cross-checks.
   */
  exportProductGroupIds(result: CsvDownloadResult): string[] {
    // rows[0] is the currency row (",,USD,USD,..."); the product-group rows follow.
    return result.rows
      .slice(1)
      .map((r) => (r[0] ?? '').trim())
      .filter((id) => id.length > 0);
  }

  private importDialog(): Locator {
    return this.page.locator(S.dlgImport).filter({ hasText: CORP_PRICING_TOOLBAR_IO.importDialog.prompt }).first();
  }

  async getImportDialogInfo(): Promise<{ text: string; buttons: string[]; hasFileInput: boolean }> {
    const dlg = this.importDialog();
    const text = (await dlg.innerText()).replace(/\s+/g, ' ').trim();
    const buttons = (await dlg.locator('button').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const hasFileInput = (await dlg.locator('input[type="file"]').count()) > 0;
    return { text, buttons, hasFileInput };
  }

  async closeImportDialog(): Promise<void> {
    const dlg = this.importDialog();
    if ((await dlg.count()) === 0) return;
    const closeBtn = dlg.locator('button', { hasText: /^(Close|Cancel)$/ }).first();
    if ((await closeBtn.count()) > 0) await closeBtn.click().catch(() => { /* best-effort: fall through to the Escape fallback + hidden-state wait below */ });
    else await this.page.keyboard.press('Escape').catch(() => { /* nothing */ });
    await dlg.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => { /* already closed */ });
  }

  // A delta-stage flow (grid-scoped), distinct from the location-scoped Loc Pricing Import below: clicking
  // a variant opens a Year(s)+Currency precondition dialog; Continue opens the upload dialog; choosing a
  // file diffs it against a fresh server export in the browser (no commit); nothing persists until the user
  // selects rows in the "Select items to publish" modal and clicks Publish.

  private importAllDialog(): Locator {
    return this.page
      .locator(S.dlgImportAll)
      .filter({ hasText: CORP_PRICING_TOOLBAR_IO.importAll.precondition.prompt })
      .filter({ hasText: CORP_PRICING_TOOLBAR_IO.importAll.precondition.title })
      .first();
  }

  private importAllYearCombo(): Locator {
    return this.importAllDialog().locator(S.cmbImportAllField).nth(0);
  }
  private importAllCurrencyCombo(): Locator {
    return this.importAllDialog().locator(S.cmbImportAllField).nth(1);
  }

  private publishModal(): Locator {
    return this.page.locator(S.dlgPublishItems).filter({ hasText: CORP_PRICING_TOOLBAR_IO.importAll.publishModal.title }).first();
  }

  /**
   * Cancel the "Select items to publish" modal without publishing; returns whether it closed. Staging a
   * change REPLACES the upload dialog with this modal, so a caller that staged a change must dismiss THIS
   * modal (not the upload dialog) — otherwise its overlay lingers and blocks the next action.
   */
  async cancelPublishModal(): Promise<boolean> {
    const modal = this.publishModal();
    if ((await modal.count()) === 0) return true;
    const btn = modal.locator('button', { hasText: /^(Cancel|Close)$/ }).first();
    if ((await btn.count()) > 0) await btn.click().catch(() => { /* best-effort: the hidden-state check below is the real oracle */ });
    else await this.page.keyboard.press('Escape').catch(() => { /* nothing to dismiss */ });
    return modal.waitFor({ state: 'hidden', timeout: 3_000 }).then(() => true).catch(() => false);
  }

  async openImportAllVariantDialog(variant: string): Promise<void> {
    await this.openImportMenu();
    await this.page.locator(S.mnuToolbarVariant, { hasText: variant }).first().click();
    await this.importAllDialog().waitFor({ state: 'visible', timeout: 6_000 });
  }

  async getImportAllDialogInfo(): Promise<{ text: string; comboCount: number; buttons: string[]; continueDisabled: boolean }> {
    const dlg = this.importAllDialog();
    const text = (await dlg.innerText()).replace(/\s+/g, ' ').trim();
    const comboCount = await dlg.locator(S.cmbImportAllField).count();
    const buttons = (await dlg.locator('button').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const continueDisabled = await dlg.locator('button', { hasText: /^Continue$/ }).first().isDisabled();
    return { text, comboCount, buttons, continueDisabled };
  }

  async isImportAllContinueEnabled(): Promise<boolean> {
    return this.importAllDialog().locator('button', { hasText: /^Continue$/ }).first().isEnabled();
  }

  private async openImportAllYearList(): Promise<void> {
    await this.importAllYearCombo().click();
    await this.page.locator(S.optImportAllListItem).first().waitFor({ state: 'visible', timeout: 4_000 });
  }
  private async closeImportAllYearList(): Promise<void> {
    await this.page.keyboard.press('Escape');
    await this.page.locator(S.optImportAllListItem).first().waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => { /* already closed */ });
  }

  async setImportAllYears(years: Array<string | number>): Promise<void> {
    await this.openImportAllYearList();
    for (const y of years) await this.page.locator(S.optImportAllListItem, { hasText: new RegExp(`^${y}$`) }).first().click();
    await this.closeImportAllYearList();
  }

  /**
   * Attempt to add ONE more year on top of the current selection, then report the resulting years. Used to
   * prove the 1–3 cap: after 3 are chosen, a 4th does not register, so the returned list still has 3 years.
   * Fails loudly (no swallow) if the extra option is missing or its click fails — a "still 3" result must
   * mean the app REFUSED the 4th, not that the option was absent.
   */
  async attemptExtraImportAllYear(year: string | number): Promise<string[]> {
    await this.openImportAllYearList();
    const extra = this.page.locator(S.optImportAllListItem, { hasText: new RegExp(`^${year}$`) }).first();
    await extra.waitFor({ state: 'visible', timeout: 4_000 });
    await extra.click();
    const selected = await this.getImportAllSelectedYears();
    await this.closeImportAllYearList();
    return selected;
  }

  async getImportAllSelectedYears(): Promise<string[]> {
    const text = await this.importAllYearCombo().innerText().catch(() => '');
    const years = text.match(/\d{4}/g) ?? [];
    return [...new Set(years)].sort();
  }

  async getImportAllCurrencyOptions(): Promise<string[]> {
    await this.importAllCurrencyCombo().click();
    await this.page.locator(S.optImportAllListItem).first().waitFor({ state: 'visible', timeout: 4_000 });
    const opts = await this.page.locator(S.optImportAllListItem).allInnerTexts();
    await this.page.keyboard.press('Escape');
    return opts.map((t) => t.trim()).filter(Boolean);
  }

  async setImportAllCurrency(code: string): Promise<void> {
    await this.importAllCurrencyCombo().click();
    await this.page.locator(S.optImportAllListItem, { hasText: new RegExp(`^${code}$`) }).first().click();
  }

  async cancelImportAllDialog(): Promise<boolean> {
    await this.importAllDialog().locator('button', { hasText: /^Cancel$/ }).first().click().catch(() => { /* best-effort: the hidden-state check below is the real oracle */ });
    return this.importAllDialog().waitFor({ state: 'hidden', timeout: 3_000 }).then(() => true).catch(() => false);
  }

  async clickImportAllContinue(): Promise<void> {
    await this.importAllDialog().locator('button', { hasText: /^Continue$/ }).first().click();
    await this.importDialog().waitFor({ state: 'visible', timeout: 6_000 });
  }

  async openImportAllUploadFor(variant: string, years: Array<string | number>, currency: string): Promise<void> {
    await this.openImportAllVariantDialog(variant);
    await this.setImportAllYears(years);
    await this.setImportAllCurrency(currency);
    await this.clickImportAllContinue();
  }

  /**
   * Choose a file in the OPEN upload dialog and classify the browser-side diff outcome. Does NOT commit —
   * the app re-downloads the server pricebook and diffs; this waits for the outcome (a staged-changes modal
   * OR a settled message) and returns it. The file is chosen via Browse → the native chooser (the same
   * mechanic the Loc Pricing Import uses), but the outcome model differs so it is classified here.
   */
  async chooseImportAllFile(fixturePath: string): Promise<ImportAllOutcome> {
    const uploadDlg = this.importDialog();
    // The diff on choose fires GET pricing-export (scoped to the precondition Year(s)+Currency) for every
    // outcome EXCEPT an unsupported file type (rejected before any network) — capture its URL best-effort.
    const diffReqPromise = this.page
      .waitForRequest((r) => r.url().includes(CORP_PRICING_EXPORT_API) && r.method() === 'GET', { timeout: 15_000 })
      .then((r) => r.url())
      .catch(() => null);
    const [chooser] = await Promise.all([
      this.page.waitForEvent('filechooser'),
      uploadDlg.locator(S.btnImportBrowse).click(),
    ]);
    await chooser.setFiles(fixturePath);

    // The app re-downloads the server pricebook and diffs in the browser — poll for the settled outcome
    // (a staged-changes modal or a known message) rather than sleeping a fixed time.
    const msgs = CORP_PRICING_TOOLBAR_IO.importAll.messages;
    const publishTitle = CORP_PRICING_TOOLBAR_IO.importAll.publishModal.title;
    const kind = (await this.page
      .waitForFunction(
        ({ m, pub }) => {
          const dlg = document.querySelector('[role="dialog"], [role="alertdialog"]');
          if (!dlg) return null;
          const txt = dlg.textContent || '';
          if (txt.includes(pub)) return 'staged';
          if (txt.includes(m.unsupportedType)) return 'unsupported-type';
          if (txt.includes(m.noChanges)) return 'no-changes';
          if (txt.includes(m.noMatch)) return 'no-match';
          return null; // keep polling until the diff settles
        },
        { m: msgs, pub: publishTitle },
        { timeout: 20_000, polling: 200 },
      )
      .then((h) => h.jsonValue() as Promise<ImportAllOutcome['kind']>)
      .catch(() => 'other' as const));

    const diffRequestUrl = await diffReqPromise;
    if (kind === 'staged') {
      return { kind, message: '', staged: await this.readStagedRows(), diffRequestUrl };
    }
    // Return the RAW on-screen dialog text as `message` (not a synthesized constant), so a caller's message
    // assertion checks what the app actually rendered rather than a value we handed back to ourselves.
    const message = (await this.page.locator(S.dlgImport).first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    return { kind, message, staged: [], diffRequestUrl };
  }

  private async readStagedRows(): Promise<ImportAllStagedRow[]> {
    return this.publishModal().evaluate((dlg) => {
      const rows = Array.from(dlg.querySelectorAll('tbody tr'));
      return rows.map((r) => {
        const cells = Array.from(r.querySelectorAll('td')).map((c) => (c.textContent || '').replace(/\s+/g, ' ').trim());
        // A row is [maybe-checkbox-cell, Pricebook, Product Group ID, Product Group Name, Price, New Price];
        // take the 5 rightmost so an optional leading checkbox cell is dropped robustly.
        const [pricebook, productGroupId, productGroupName, price, newPrice] = cells.slice(-5);
        return {
          pricebook: pricebook ?? '',
          productGroupId: productGroupId ?? '',
          productGroupName: productGroupName ?? '',
          price: price ?? '',
          newPrice: newPrice ?? '',
        };
      });
    });
  }

  /**
   * Select every staged row and Publish — the ONLY mutating step. Arms the commit-request listener BEFORE
   * clicking (Publish is disabled until ≥1 row is checked). Returns the real commit outcome + the success
   * toast; never trusts the dialog alone for whether it persisted.
   */
  async publishStagedImport(opts?: { onlyProductGroupIds?: string[] }): Promise<ImportAllPublishResult> {
    const modal = this.publishModal();
    const only = opts?.onlyProductGroupIds;
    if (only && only.length > 0) {
      // Partial selection: check ONLY the per-row boxes whose row carries one of these product groups, so the
      // commit publishes exactly the selected staged rows (a deselected staged row must NOT be written).
      const rows = modal.locator('tbody tr');
      const rowCount = await rows.count();
      for (let i = 0; i < rowCount; i++) {
        const row = rows.nth(i);
        const cells = (await row.locator('td').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
        const productGroupId = cells.slice(-5)[1] ?? ''; // [pricebook, productGroupId, name, price, newPrice]
        if (only.includes(productGroupId)) await row.locator(S.chkPublishRow).first().check();
      }
    } else {
      // Select every box (header select-all + per-row). `.check()` verifies the ARIA state — a bare click can
      // focus-without-toggle on a Radix checkbox, so it is the file's documented checkbox discipline.
      const boxes = modal.locator(S.chkPublishRow);
      const n = await boxes.count();
      for (let i = 0; i < n; i++) await boxes.nth(i).check();
    }
    const reqPromise = this.page
      .waitForRequest((r) => r.url().includes(CORP_PRICING_IMPORT_ALL_API) && r.method() !== 'GET', { timeout: 20_000 })
      .catch((err: Error) => {
        if (err.name === 'TimeoutError') return null;
        throw err;
      });
    await modal.locator(S.btnPublish).first().click();
    const req = await reqPromise;
    if (!req) {
      return { success: false, status: null, requestUrl: null, method: null, toast: '' };
    }
    const resp = await req.response();
    if (!resp) throw new Error('publishStagedImport: the commit request fired but its response was not captured');
    const status = resp.status();
    // The commit closes the modal and shows a toast; read it best-effort for the caller's assertion.
    const toast = (await this.page
      .locator('[data-sonner-toast], [role="alert"]')
      .filter({ hasText: CORP_PRICING_TOOLBAR_IO.importAll.publishModal.successToastFragment })
      .first()
      .innerText({ timeout: 8_000 })
      .catch(() => '')).replace(/\s+/g, ' ').trim();
    return { success: status >= 200 && status < 300, status, requestUrl: req.url(), method: req.method(), toast };
  }

  /**
   * Read the "Select items to publish" modal WITHOUT committing: whether Publish is disabled, the column
   * header set, the "Total Items" label text, and the staged row count — the publish gate, the header
   * contract, and the item count, none of which the commit path (publishStagedImport) exposes.
   */
  async getPublishModalInfo(): Promise<{ publishDisabled: boolean; headers: string[]; totalItemsText: string; rowCount: number }> {
    const modal = this.publishModal();
    const publishDisabled = await modal.locator(S.btnPublish).first().isDisabled();
    const headers = (await modal.locator('th').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const totalItemsText = (await modal.getByText(/Total Items/i).first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    const rowCount = await modal.locator('tbody tr').count();
    return { publishDisabled, headers, totalItemsText, rowCount };
  }

  async checkOneStagedRow(): Promise<void> {
    await this.publishModal().locator('tbody').locator(S.chkPublishRow).first().check();
  }

  /**
   * Read the current server price of one product-group × pricebook cell from a fresh Import All export.
   * The export is the source of truth for what actually persisted (a different dataset from the on-screen
   * search grid), so pre/post-import checks compare this rather than the grid.
   */
  async captureImportAllCellValue(opts: { variant: string; years: Array<string | number>; currency: string; productGroupId: string; pricebook: string }): Promise<string> {
    const exp = await this.downloadExportVariant(opts.variant, opts.years, opts.currency);
    const colIdx = exp.headers.indexOf(opts.pricebook);
    if (colIdx < 0) throw new Error(`captureImportAllCellValue: pricebook column "${opts.pricebook}" not found in the export`);
    const pgRow = exp.rows.find((r) => (r[0] ?? '').trim() === opts.productGroupId);
    if (!pgRow) throw new Error(`captureImportAllCellValue: product group "${opts.productGroupId}" not found in the export`);
    return (pgRow[colIdx] ?? '').trim();
  }

  /**
   * From a fresh export, capture the target cell's value plus an UNTOUCHED reference ROW for a merge proof:
   *  - `target`: the target product group × pricebook value (the natural baseline to restore to).
   *  - `otherRow`: a DIFFERENT product group's price in the same pricebook — proves an omitted ROW survives Publish.
   * Read-only: the reference row is never imported, so a single-row import touching only the target must leave
   * it unchanged if the commit MERGES (and would wipe it if it REPLACED). The column dimension is deliberately
   * NOT captured: the import file is fixed-width (every pricebook column is required — a column-narrow file is
   * rejected as "unexpected format"), so a row present in the file always carries all its
   * columns. An omitted-column scenario cannot exist, making product-group ROW omission the only meaningful
   * "absent-from-file → untouched" proof.
   */
  async captureImportAllMergeCanaries(opts: { variant: string; years: Array<string | number>; currency: string; productGroupId: string; pricebook: string }): Promise<{
    target: { value: string };
    otherRow: { productGroupId: string; pricebook: string; value: string };
  }> {
    const exp = await this.downloadExportVariant(opts.variant, opts.years, opts.currency);
    const targetCol = exp.headers.indexOf(opts.pricebook);
    if (targetCol < 0) throw new Error(`captureImportAllMergeCanaries: pricebook "${opts.pricebook}" not found in the export`);
    const targetRow = exp.rows.find((r) => (r[0] ?? '').trim() === opts.productGroupId);
    if (!targetRow) throw new Error(`captureImportAllMergeCanaries: product group "${opts.productGroupId}" not found in the export`);
    const otherPgRow = exp.rows.find((r) => {
      const pg = (r[0] ?? '').trim();
      return pg && pg !== opts.productGroupId && /\d/.test((r[targetCol] ?? '').trim());
    });
    if (!otherPgRow) throw new Error('captureImportAllMergeCanaries: no untouched product-group row with a numeric price found for the merge proof');
    return {
      target: { value: (targetRow[targetCol] ?? '').trim() },
      otherRow: { productGroupId: (otherPgRow[0] ?? '').trim(), pricebook: opts.pricebook, value: (otherPgRow[targetCol] ?? '').trim() },
    };
  }

  /**
   * Build a minimal Import All fixture from a FRESH export: clone one product group's full row and set one
   * pricebook cell to `newValue`, keeping the header + currency rows exactly as exported. Because every other
   * cell matches the current server, the browser diff stages EXACTLY that one changed cell. Returns the temp
   * file path and the cell's pre-change value (the natural baseline to restore to). The temp file is the
   * caller's to remove.
   */
  async buildImportAllSingleCellFixture(opts: { variant: string; years: Array<string | number>; currency: string; productGroupId: string; pricebook: string; newValue: string }): Promise<{ path: string; previousValue: string }> {
    const exp = await this.downloadExportVariant(opts.variant, opts.years, opts.currency);
    const colIdx = exp.headers.indexOf(opts.pricebook);
    if (colIdx < 0) throw new Error(`buildImportAllSingleCellFixture: pricebook column "${opts.pricebook}" not found in the export`);
    const pgRow = exp.rows.find((r) => (r[0] ?? '').trim() === opts.productGroupId);
    if (!pgRow) throw new Error(`buildImportAllSingleCellFixture: product group "${opts.productGroupId}" not found in the export`);
    const previousValue = (pgRow[colIdx] ?? '').trim();
    const cloned = [...pgRow];
    cloned[colIdx] = opts.newValue;
    const currencyRow = exp.rows[0] ?? []; // the currency row (row after the header) is metadata the server matches — kept so only the price cell diffs
    const csv = [exp.headers, currencyRow, cloned].map((r) => r.map(toCsvField).join(',')).join('\n') + '\n';
    const tmp = join(tmpdir(), `import-all-${process.pid}-${Date.now()}.csv`);
    writeFileSync(tmp, csv, 'utf-8');
    return { path: tmp, previousValue };
  }

  /**
   * Build an Import All fixture that changes TWO product-group cells in one pricebook column (from a fresh
   * export), so the browser diff stages exactly two rows — used to exercise multi-row staging + partial-
   * selection publish. Returns the temp path and each changed cell's pre-change value. The caller removes the file.
   */
  async buildImportAllMultiCellFixture(opts: { variant: string; years: Array<string | number>; currency: string; pricebook: string; changes: Array<{ productGroupId: string; newValue: string }> }): Promise<{ path: string; previousValues: Record<string, string> }> {
    const exp = await this.downloadExportVariant(opts.variant, opts.years, opts.currency);
    const colIdx = exp.headers.indexOf(opts.pricebook);
    if (colIdx < 0) throw new Error(`buildImportAllMultiCellFixture: pricebook column "${opts.pricebook}" not found in the export`);
    const previousValues: Record<string, string> = {};
    const dataRows = opts.changes.map((c) => {
      const pgRow = exp.rows.find((r) => (r[0] ?? '').trim() === c.productGroupId);
      if (!pgRow) throw new Error(`buildImportAllMultiCellFixture: product group "${c.productGroupId}" not found in the export`);
      previousValues[c.productGroupId] = (pgRow[colIdx] ?? '').trim();
      const cloned = [...pgRow];
      cloned[colIdx] = c.newValue;
      return cloned;
    });
    const currencyRow = exp.rows[0] ?? []; // the currency row (row after the header) is metadata the server matches
    const csv = [exp.headers, currencyRow, ...dataRows].map((r) => r.map(toCsvField).join(',')).join('\n') + '\n';
    const tmp = join(tmpdir(), `import-all-multi-${process.pid}-${Date.now()}.csv`);
    writeFileSync(tmp, csv, 'utf-8');
    return { path: tmp, previousValues };
  }

  removeTempFixture(path: string): void {
    try { unlinkSync(path); } catch { /* temp cleanup is best-effort */ }
  }

  /**
   * How many upload dialogs (a dialog carrying a file input) are currently open. Count-based, so it returns
   * 0 when none is present WITHOUT throwing — the correct oracle for "no upload dialog appeared". Reading
   * text off an absent dialog throws, and a blanket catch on that read masks a real crash as a false pass.
   */
  async importDialogCount(): Promise<number> {
    return this.importDialog().locator(S.inputImportFile).count();
  }

  async clickLocPricingExportAndCaptureUrl(): Promise<string> {
    const reqPromise = this.page.waitForRequest((r) => r.url().includes(CORP_PRICING_LOC_EXPORT_API), { timeout: 15_000 });
    await this.page.locator(S.btnLocPricingExport).first().click();
    return (await reqPromise).url();
  }

  /**
   * Click a CSV-export trigger and capture the REAL downloaded file. Arms the browser download event AND
   * the export request on the SAME click, so one action yields the suggested filename, the file contents,
   * and the request URL (which carries the locale param). The file is read from the browser's temporary
   * download path — nothing is written into the repo. Generic on purpose: every export flow (the
   * per-location export here and the grid-scoped Export variants) reuses this one path by passing its own
   * trigger button and backend export-path fragment.
   */
  private async captureCsvDownload(trigger: Locator, apiPathFragment: string): Promise<CsvDownloadResult> {
    const [download, request] = await Promise.all([
      this.page.waitForEvent('download', { timeout: 30_000 }),
      this.page.waitForRequest((r) => r.url().includes(apiPathFragment), { timeout: 30_000 }),
      trigger.click(),
    ]);
    // The export status is part of the contract (a download must be a real 200, not a silent 4xx/5xx),
    // so read the backing response for the captured request. If it cannot be read, throw — the caller
    // must never assert a status that was never observed.
    const response = await request.response();
    if (!response) throw new Error('captureCsvDownload: the export response was not captured — cannot assert its status');
    const status = response.status();
    const filePath = await download.path();
    if (!filePath) throw new Error('captureCsvDownload: the download did not resolve to a file path');
    const raw = readFileSync(filePath, 'utf-8');
    const content = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw; // strip a leading byte-order mark if present
    const lines = content.split(/\r?\n/);
    if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop(); // drop only the terminal newline; keep interior blanks so a malformed blank row is caught, not dropped
    const [first, ...rest] = lines;
    const headers = first !== undefined ? splitCsvLine(first) : [];
    const rows = rest.map(splitCsvLine);
    return {
      filename: download.suggestedFilename(),
      content,
      headers,
      rows,
      rowCount: rows.length,
      requestUrl: request.url(),
      status,
    };
  }

  /**
   * Loc Pricing Export real download round-trip (NM-2262) — a thin wrapper over the generic CSV-download
   * capture. The grid-scoped Export variants call the same primitive with their own trigger + export path.
   */
  async downloadLocPricingExport(): Promise<CsvDownloadResult> {
    return this.captureCsvDownload(this.page.locator(S.btnLocPricingExport).first(), CORP_PRICING_LOC_EXPORT_API);
  }

  async openLocPricingImportDialog(): Promise<void> {
    await this.page.locator(S.btnLocPricingImport).first().click();
    await this.importDialog().waitFor({ state: 'visible', timeout: 6_000 });
  }

  /**
   * Generic import-upload primitive (Loc Pricing Import — reused by the grid-scoped Import All flows).
   * Assumes an "Import ..." file dialog is ALREADY open. The app submits the import the MOMENT a file is
   * chosen — there is NO separate "Upload" click; choosing a valid file fires
   * PUT .../location-import on its own and the dialog closes on success.
   *
   * The outcome is classified on the ground truth of whether an import request actually fired, not on a
   * dialog-message timing race: a `waitForRequest` for the import PUT is armed BEFORE the file is chosen
   * (the choice is what auto-submits). If the request fires, the REAL server response (status + raw body)
   * is the outcome — never the dialog alone; on success the dialog is awaited hidden so a following export
   * cannot race an open modal. If no request fires, the app rejected the file in the browser and the
   * dialog's own text is returned as the message. If NEITHER a request nor any dialog text is observed the
   * method throws, rather than passing a status-less "no request" result off as a rejection. Filters the
   * request on the import API path, not the page URL.
   */
  async uploadFileToOpenDialog(fixturePath: string): Promise<LocImportResult> {
    const dlg = this.importDialog();
    // Ground truth that an import was ATTEMPTED is the PUT firing. Arm it BEFORE choosing the file, because
    // choosing the file is what auto-submits. A timeout means no import fired (an in-browser rejection);
    // any OTHER wait error (page crash, context close, navigation) is real and is re-thrown, never nulled.
    const requestPromise = this.page
      .waitForRequest((r) => r.url().includes(CORP_PRICING_LOC_IMPORT_API) && r.method() === 'PUT', { timeout: 15_000 })
      .catch((err: Error) => {
        if (err.name === 'TimeoutError') return null;
        throw err;
      });

    // Choose the file via the dialog's Browse button + native file chooser (the real user path).
    const [chooser] = await Promise.all([
      this.page.waitForEvent('filechooser'),
      dlg.locator(S.btnImportBrowse).click(),
    ]);
    await chooser.setFiles(fixturePath);

    const request = await requestPromise;
    if (request) {
      // An import fired — the load-bearing outcome is the server response, never the dialog.
      const resp = await request.response();
      if (!resp) throw new Error('uploadFileToOpenDialog: the import request fired but its response was not captured — cannot assert an outcome that was never observed');
      const status = resp.status();
      const responseBody = await resp.text();
      let parsed: { success?: boolean; message?: string; data?: { message?: string } } | null = null;
      try { parsed = JSON.parse(responseBody); } catch { /* non-JSON body — the raw text is kept for the caller */ }
      const success = status >= 200 && status < 300 && parsed?.success === true;
      const message = parsed?.data?.message ?? parsed?.message ?? responseBody.slice(0, 300);
      // On success, wait for the dialog to close so the next export can't race a still-open modal.
      if (success) await dlg.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => { /* some flows leave it open; not fatal to the already-captured result */ });
      return { success, status, message, requestUrl: request.url(), responseBody };
    }

    // No import fired → the app rejected the file in the browser. Return the dialog's own message so the
    // caller can assert it. Guard against a silent "nothing happened at all": if the dialog carries no
    // text we cannot classify the outcome — fail loudly rather than pass a status-less result off as a
    // rejection.
    const dialogText = (await dlg.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    if (!dialogText) {
      throw new Error('uploadFileToOpenDialog: no import request fired and the import dialog carried no text — the upload outcome could not be classified');
    }
    return { success: false, status: null, message: dialogText, requestUrl: null, responseBody: null };
  }

  async locPricingImport(fixturePath: string): Promise<LocImportResult> {
    await this.openLocPricingImportDialog();
    return this.uploadFileToOpenDialog(fixturePath);
  }

  /**
   * Read one location's pricebook rows straight from a fresh Loc Pricing Export (NM-2305 round-trip
   * oracle). The export is the source of truth for what actually persisted, so pre/post import checks
   * compare these rows rather than the on-screen search grid (a different, tenant-wide dataset). Rows are
   * matched by content, never by position. Reuses the proven export download + parse.
   */
  async captureLocPricingCsvRows(locationNo: string): Promise<{ header: string[]; rows: string[][] }> {
    const csv = await this.downloadLocPricingExport();
    const locIdx = csv.headers.indexOf('LocationNo');
    const rows = csv.rows.filter((r) => (r[locIdx] ?? '') === locationNo);
    return { header: csv.headers, rows };
  }

  /**
   * Re-import a location's captured rows to put it back the way it was (best-effort restore after a
   * mutating round-trip). Writes the rows to a temporary CSV, runs them through the real import, then
   * removes the temp file. Returns the import outcome so a caller can confirm the restore landed.
   */
  async restoreLocPricingRows(header: string[], rows: string[][]): Promise<LocImportResult> {
    const csv = [header, ...rows].map((r) => r.map(toCsvField).join(',')).join('\n') + '\n';
    const tmp = join(tmpdir(), `loc-pricing-restore-${process.pid}-${Date.now()}.csv`);
    writeFileSync(tmp, csv, 'utf-8');
    try {
      return await this.locPricingImport(tmp);
    } finally {
      try { unlinkSync(tmp); } catch { /* temp cleanup is best-effort */ }
    }
  }

  async openGridOptions(): Promise<void> {
    const item = this.page.locator(S.mnuGridColumn).first();
    for (let attempt = 0; attempt < 3; attempt++) {
      await this.page.locator(S.btnGridOptions).first().click();
      try {
        await item.waitFor({ state: 'visible', timeout: 4_000 });
        return;
      } catch {
        if (attempt < 2) await this.page.keyboard.press('Escape').catch(() => { /* nothing open */ });
      }
    }
    await item.waitFor({ state: 'visible', timeout: 4_000 });
  }

  async getGridOptionColumns(): Promise<{ label: string; checked: boolean }[]> {
    const loc = this.page.locator(S.mnuGridColumn);
    const n = await loc.count();
    const out: { label: string; checked: boolean }[] = [];
    for (let i = 0; i < n; i++) {
      const el = loc.nth(i);
      out.push({
        label: (await el.innerText()).replace(/\s+/g, ' ').trim(),
        checked: (await el.getAttribute('aria-checked')) === 'true',
      });
    }
    return out;
  }

  async toggleGridColumn(label: string): Promise<void> {
    await this.page.locator(S.mnuGridColumn, { hasText: label }).first().click();
  }

  async closeGridOptions(): Promise<void> {
    await this.page.keyboard.press('Escape').catch(() => { /* nothing open */ });
    await this.page.locator(S.mnuGridColumn).first().waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => { /* already closed */ });
  }

  async resetGridToDefaultView(): Promise<void> {
    await this.page.locator('[role="menuitem"]', { hasText: 'Reset to Default View' }).first().click();
  }

  async isGridColumnVisible(label: string): Promise<boolean> {
    return (await this.getColumnHeaders()).some((h) => h === label || h.includes(label));
  }

  /**
   * Mutation-safety restore: re-check any unchecked Grid Options column so the grid returns to its
   * all-columns-visible baseline. Self-navigates (fresh page) so it is robust as a beforeEach/afterEach
   * regardless of the test's end state. The column-visibility preference is server-persisted per user —
   * bounded retry re-reads the columns after a reload and re-toggles any still hidden, throwing if the
   * baseline cannot be restored.
   */
  async ensureAllGridColumnsVisible(): Promise<void> {
    const allColumnsChecked = async (): Promise<boolean> => {
      await this.openGridOptions();
      const cols = await this.getGridOptionColumns();
      await this.closeGridOptions();
      return cols.every((c) => c.checked);
    };
    await this.saveAndVerifyPersisted({
      isAtTarget: allColumnsChecked,
      applyMutation: async () => {
        await this.openGridOptions();
        const cols = await this.getGridOptionColumns();
        for (const c of cols) {
          if (!c.checked) await this.toggleGridColumn(c.label);
        }
        await this.closeGridOptions();
      },
      save: async () => { /* each toggle persists immediately server-side; no separate save step */ },
      reload: async () => this.open(),
      label: 'grid column visibility',
    });
  }

  async getColumnIndexByName(name: string): Promise<number> {
    const headers = await this.getColumnHeaders();
    const exact = headers.indexOf(name);
    return exact >= 0 ? exact : headers.findIndex((h) => h.includes(name));
  }

  async readColumnForVisibleRows(name: string): Promise<string[]> {
    const idx = await this.getColumnIndexByName(name);
    if (idx < 0) throw new Error(`readColumnForVisibleRows: column "${name}" not found in grid headers`);
    const rows = this.page.locator(S.rowGridAny);
    const n = await rows.count();
    const out: string[] = [];
    for (let r = 0; r < n; r++) out.push((await rows.nth(r).locator('td').nth(idx).innerText()).replace(/\s+/g, ' ').trim());
    return out;
  }

  async readBooleanColumnForVisibleRows(name: string): Promise<boolean[]> {
    const idx = await this.getColumnIndexByName(name);
    if (idx < 0) throw new Error(`readBooleanColumnForVisibleRows: column "${name}" not found`);
    const rows = this.page.locator(S.rowGridAny);
    const n = await rows.count();
    const out: boolean[] = [];
    for (let r = 0; r < n; r++) out.push(await this.readBooleanCell(rows.nth(r), idx));
    return out;
  }

  async getFirstNPriceBookNames(n: number): Promise<string[]> {
    const rows = this.page.locator(S.rowGridAny);
    const count = Math.min(await rows.count(), n);
    const out: string[] = [];
    for (let r = 0; r < count; r++) out.push((await rows.nth(r).locator('td').nth(0).innerText()).replace(/\s+/g, ' ').trim());
    return out;
  }

  async getTbodyRowCount(): Promise<number> {
    return this.page.locator(S.rowGridAny).count();
  }

  async hasNoResultsMessage(): Promise<boolean> {
    return this.isVisibleSafe(S.lblNoResults);
  }

  async getPricebookLinkCellCount(): Promise<number> {
    return this.page.locator(S.rowNameButton).count();
  }

  private pageSizeCombo(): Locator {
    return this.page.locator(S.drpPageSizeRole).filter({ hasText: /^\s*\d+\s*$/ }).first();
  }

  async hasPageSizeControl(): Promise<boolean> {
    return (await this.page.locator(S.drpPageSizeRole).filter({ hasText: /^\s*\d+\s*$/ }).count()) > 0;
  }

  async getPageSizeValue(): Promise<string> {
    return (await this.pageSizeCombo().innerText()).replace(/\s+/g, ' ').trim();
  }

  async getPageSizeOptions(): Promise<string[]> {
    await this.pageSizeCombo().click();
    await this.page.locator('[role="option"]').first().waitFor({ state: 'visible', timeout: 8_000 });
    const out = (await this.page.locator('[role="option"]').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
    await this.page.keyboard.press('Escape').catch(() => { /* nothing open */ });
    return out.filter(Boolean);
  }

  async setPageSize(value: string | number): Promise<void> {
    await this.pageSizeCombo().click();
    await this.page.locator('[role="option"]', { hasText: new RegExp(`^${value}$`) }).first().click();
    await this.page.locator(S.rowGridAny).first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => { /* grid settles */ });
  }

  private pageNavSelector(which: 'first' | 'previous' | 'next' | 'last'): string {
    return which === 'first' ? S.btnPageFirst : which === 'previous' ? S.btnPagePrev : which === 'next' ? S.btnPageNext : S.btnPageLast;
  }

  async hasPageNav(which: 'first' | 'previous' | 'next' | 'last'): Promise<boolean> {
    return (await this.page.locator(this.pageNavSelector(which)).count()) > 0;
  }

  async isPageNavDisabled(which: 'first' | 'previous' | 'next' | 'last'): Promise<boolean> {
    const b = this.page.locator(this.pageNavSelector(which)).first();
    if (await b.isDisabled().catch(() => false)) return true;
    return (await b.getAttribute('aria-disabled')) === 'true';
  }

  async clickPageNav(which: 'first' | 'previous' | 'next' | 'last'): Promise<void> {
    await this.page.locator(this.pageNavSelector(which)).first().click();
    await this.page.locator(S.rowGridAny).first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => { /* grid settles */ });
  }

  private headerCell(name: string): Locator {
    return this.page.locator(S.colHeaderAny, { hasText: name }).first();
  }

  async columnHeaderHasButton(name: string): Promise<boolean> {
    return (await this.headerCell(name).locator('button').count()) > 0;
  }

  async clickColumnHeaderSort(name: string): Promise<void> {
    const btn = this.headerCell(name).locator('button').first();
    if ((await btn.count()) > 0) await btn.click();
    else await this.headerCell(name).click();
    await this.page.locator(S.rowGridAny).first().waitFor({ state: 'visible', timeout: 10_000 }).catch(() => { /* settle */ });
  }

  async getColumnAriaSort(name: string): Promise<string | null> {
    return this.headerCell(name).getAttribute('aria-sort');
  }
}
