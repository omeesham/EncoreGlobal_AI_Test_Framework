// Corporate Pricing Search: filters stage on input (no network); only the Search button submits
// them server-side as query params of `GET /navigator/api/location/pricing/strategies`.
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
import { step } from '../../fixtures/step-decorator';

/** Parsed result of a CSV file download (NM-2262 — reusable across the Corporate Pricing export flows). */
export type CsvDownloadResult = {
  filename: string;
  content: string;
  /** Parsed header row — fields are raw (NOT trimmed) so a whitespace regression is caught, not masked. */
  headers: string[];
  rows: string[][];
  rowCount: number;
  requestUrl: string;
  /** Always a real observed status — the helper throws rather than returning a placeholder. */
  status: number;
};

// Loc Pricing Import outcome (NM-2305). `success` comes from the backing PUT (2xx AND `{success:true}`),
// never the dialog. A browser-side rejection leaves status/requestUrl/responseBody null.
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

// Client-side outcome of choosing a file in the Import All upload dialog (NM-2265) — choosing does
// NOT commit; the app diffs the file against a fresh server export in the browser.
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

// Fields are deliberately NOT trimmed — stray whitespace in an export must surface as a mismatch.
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

// RFC 4180 quoting — keeps a name containing a comma from shifting into the next column
// when captured rows are written back out to a file.
function toCsvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export type SearchCheckbox = 'isInternal' | 'isLabor' | 'activeOnly';

export class CorporatePricingSearchPage extends CorporatePricingBasePage {
  constructor(page: Page, config?: IConfig) {
    super(page, config);
  }

  @step('Open the pricing search page')
  async open(office: string = CORPORATE_PRICING_COMMON.office): Promise<void> {
    await this.gotoSearch(office);
    await this.waitForGridLoaded();
  }

  // Waits on headers + a data row, NOT the "N items found" footer: that footer paints a transient
  // "0 items found" before the response lands, so waiting on it returns too early.
  @step('Wait for grid loaded')
  async waitForGridLoaded(timeout = 30_000): Promise<void> {
    await this.page.locator(S.colHeaderAny).first().waitFor({ state: 'visible', timeout });
    await this.page.locator(S.rowGridAny).first().waitFor({ state: 'visible', timeout });
  }

  @step('Get column headers')
  async getColumnHeaders(): Promise<string[]> {
    return this.readAllTexts(S.colHeaderAny);
  }

  @step('Get column count')
  async getColumnCount(): Promise<number> {
    return this.page.locator(S.colHeaderAny).count();
  }

  @step('Get visible row count')
  async getVisibleRowCount(): Promise<number> {
    return this.page.locator(S.rowGridAny).count();
  }

  @step('Get item count text')
  async getItemCountText(): Promise<string> {
    return (await this.page.locator(S.lblItemsFound).first().innerText()).replace(/\s+/g, ' ').trim();
  }

  @step('Get item count number')
  async getItemCountNumber(): Promise<number> {
    const t = await this.getItemCountText();
    return parseInt(t.replace(/[^\d]/g, ''), 10);
  }

  @step('Boolean cells valid')
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

  @step('Read boolean cell')
  async readBooleanCell(row: Locator, colIndex: number): Promise<boolean> {
    const cell = row.locator('td').nth(colIndex);
    const txt = (await cell.innerText()).trim();
    return txt.includes(CORP_PRICING_SEARCH.booleanTrueMarker);
  }

  @step('Find row by name')
  async findRowByName(name: string): Promise<Locator | null> {
    return this.findGridRowByContent(name);
  }

  // Native value-setter, not keystrokes: `pressSequentially` does not reliably commit React state
  // here, so Search re-submits an unchanged query, the app dedupes, and waitForResponse hangs.
  private async setTextFilter(selector: string, value: string): Promise<void> {
    await this.setReactInput(selector, value);
  }

  @step('Fill Pricebook filter')
  async fillPricebookFilter(value: string): Promise<void> {
    await this.setTextFilter(S.txtFilterPricebook, value);
  }

  @step('Clear Pricebook filter')
  async clearPricebookFilter(): Promise<void> {
    await this.setTextFilter(S.txtFilterPricebook, '');
  }

  @step('Fill strategy filter')
  async fillStrategyFilter(value: string): Promise<void> {
    await this.setTextFilter(S.txtFilterStrategy, value);
  }

  @step('Get Pricebook filter value')
  async getPricebookFilterValue(): Promise<string> {
    return this.page.locator(S.txtFilterPricebook).inputValue();
  }

  @step('Get strategy filter value')
  async getStrategyFilterValue(): Promise<string> {
    return this.page.locator(S.txtFilterStrategy).inputValue();
  }

  // The only `[role="checkbox"]` on the screen, in DOM order Is Internal / Is Labor / Active Only.
  // Callers must use `.check()/.uncheck()` — a bare click can focus-without-toggle on Radix checkboxes.
  private checkbox(which: SearchCheckbox): Locator {
    const idx = which === 'isInternal' ? 0 : which === 'isLabor' ? 1 : 2;
    return this.page.locator('[role="checkbox"]').nth(idx);
  }

  @step('Get checkbox state')
  async getCheckboxState(which: SearchCheckbox): Promise<boolean> {
    return (await this.checkbox(which).getAttribute('aria-checked')) === 'true';
  }

  @step('Set checkbox')
  async setCheckbox(which: SearchCheckbox, checked: boolean): Promise<void> {
    const cb = this.checkbox(which);
    if (checked) await cb.check();
    else await cb.uncheck();
  }

  private async readComboOptions(comboSelector: string): Promise<string[]> {
    await this.page.locator(comboSelector).first().click();
    await this.page.locator('[role="option"]').first().waitFor({ state: 'visible', timeout: 8_000 });
    // The Location popover virtualizes its ~2652 options, so wait for a 3rd before reading, then
    // batch-read in one protocol call — a per-option nth() loop blows the 120s test timeout.
    await this.page.locator('[role="option"]').nth(2).waitFor({ state: 'visible', timeout: 5_000 }).catch(() => { /* small dropdown */ });
    const out = (await this.page.locator('[role="option"]').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
    await this.page.keyboard.press('Escape');
    return out.filter(Boolean);
  }

  @step('Get currency options')
  async getCurrencyOptions(): Promise<string[]> {
    return this.readComboOptions(S.drpFilterCurrency);
  }

  @step('Get location options')
  async getLocationOptions(): Promise<string[]> {
    return this.readComboOptions(S.drpFilterLocation);
  }

  @step('Get currency default text')
  async getCurrencyDefaultText(): Promise<string> {
    return (await this.page.locator(S.drpFilterCurrency).first().innerText()).replace(/\s+/g, ' ').trim();
  }

  @step('Get location default text')
  async getLocationDefaultText(): Promise<string> {
    return (await this.page.locator(S.drpFilterLocation).first().innerText()).replace(/\s+/g, ' ').trim();
  }

  @step('Select currency')
  async selectCurrency(value: string): Promise<void> {
    await this.page.locator(S.drpFilterCurrency).first().click();
    await this.page.locator('[role="option"]', { hasText: value }).first().click();
  }

  // Option index 1 — index 0 is the "Clear selection" entry. Retries because the virtualized
  // popover can detach an option mid-render.
  @step('Select first real location')
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

  // Stages a BVA/negative value WITHOUT clicking Search — the caller submits and asserts the server result.
  // Never presses Escape before the Tab check, so a real focus-trap is not masked.
  @step('Probe Pricebook boundary')
  async probePricebookBoundary(
    value: string,
  ): Promise<{ staged: string; stagedLen: number; ariaInvalid: string | null; escaped: boolean; pageError: number }> {
    const input = this.page.locator(S.txtFilterPricebook).first();
    await input.focus();
    await this.setReactInput(S.txtFilterPricebook, value);
    const staged = await input.inputValue();
    const ariaInvalid = await input.getAttribute('aria-invalid');
    // Escapability: a natural Tab must move focus out of the field.
    await input.focus();
    const before = await this.page.evaluate(() => (document.activeElement as HTMLInputElement)?.placeholder ?? null);
    await this.page.keyboard.press('Tab');
    const after = await this.page.evaluate(() => (document.activeElement as HTMLInputElement)?.placeholder ?? null);
    const pageError = await this.page.locator('text=/client-side exception|Application error/').count();
    return { staged, stagedLen: staged.length, ariaInvalid, escaped: before !== after, pageError };
  }

  @step('Click search')
  async clickSearch(): Promise<void> {
    await this.page.locator(S.btnSearch).first().click();
  }

  @step('Click reset')
  async clickReset(): Promise<void> {
    await this.page.locator(S.btnReset).first().click();
  }

  /** Returns the list request URL so callers can assert the query-param shape. */
  @step('Search and wait for list')
  async searchAndWaitForList(): Promise<string> {
    const respPromise = this.page.waitForResponse(
      (r) => r.url().includes(CORP_PRICING_SEARCH_API),
      { timeout: 30_000 },
    );
    await this.clickSearch();
    const resp = await respPromise;
    // Headers only, NOT a data row — a server filter can legitimately return 0 results, so
    // requiring a row would hang.
    await this.page.locator(S.colHeaderAny).first().waitFor({ state: 'visible', timeout: 30_000 });
    // Settles the row count so callers can read it without a fixed sleep.
    await this.waitForAngularStable();
    return resp.url();
  }

  // The page is worker-scoped, so the caller MUST call `dispose()` at test end or the listener
  // stacks across every test in the same worker.
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

  @step('Click Pricebook name')
  async clickPricebookName(name: string): Promise<void> {
    const row = await this.findRowByName(name);
    if (!row) throw new Error(`Price Book row not found for "${name}"`);
    await row.locator('button.cursor-pointer').first().click();
  }

  // The Radix DropdownMenu intermittently does not open on the first click, hence the Escape + retry.
  @step('Open new menu')
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

  @step('Click new equipment pricing')
  async clickNewEquipmentPricing(): Promise<void> {
    await this.openNewMenu();
    await this.page.locator(S.mnuNewEquipmentPricing).first().click();
  }

  @step('Click new labor pricing')
  async clickNewLaborPricing(): Promise<void> {
    await this.openNewMenu();
    await this.page.locator(S.mnuNewLaborPricing).first().click();
  }

  // Shadow-walks `textContent` because Playwright's visible-text engine misses the action-bar
  // buttons — their labels do not count as visible text at the test render.
  @step('Get all button texts')
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

  @step('Get new menu item texts')
  async getNewMenuItemTexts(): Promise<string[]> {
    await this.openNewMenu();
    const eq = (await this.page.locator(S.mnuNewEquipmentPricing).first().innerText().catch(() => '')).trim();
    const lb = (await this.page.locator(S.mnuNewLaborPricing).first().innerText().catch(() => '')).trim();
    await this.page.keyboard.press('Escape').catch(() => { /* menu may already be closing */ });
    return [eq, lb].filter(Boolean);
  }

  @step('Get grid headers')
  async getGridHeaders(): Promise<string[]> {
    return (await this.page.locator('thead th').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
  }

  @step('Get Pricebook name cells')
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

  @step('Get row cell text')
  async getRowCellText(rowIndex: number, colIndex: number): Promise<string> {
    const cell = this.page.locator('tbody tr').nth(rowIndex).locator('td').nth(colIndex);
    return (await cell.innerText()).replace(/\s+/g, ' ').trim();
  }

  // The Currency column is filled by a second lookup that lands AFTER the rows render, so cells show
  // "-" until then. Best-effort: if it never resolves, the caller's assertion still fails cleanly.
  @step('Wait for currency column resolved')
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

  @step('Open export menu')
  async openExportMenu(): Promise<void> {
    await this.openToolbarMenu(S.btnExport);
  }

  @step('Open import menu')
  async openImportMenu(): Promise<void> {
    await this.openToolbarMenu(S.btnImport);
  }

  @step('Get menu variants')
  async getMenuVariants(): Promise<string[]> {
    return (await this.page.locator(S.mnuToolbarVariant).allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
  }

  // Coordinate click, not a locator click: the open Radix menu's overlay makes any underlying
  // element "obscured" and never actionable, so a locator click just times out.
  @step('Dismiss toolbar menu with outside click')
  async dismissToolbarMenuWithOutsideClick(): Promise<boolean> {
    const box = await this.page.locator(S.hdgCorporatePricing).first().boundingBox();
    if (box) await this.page.mouse.click(box.x + Math.min(box.width / 2, 40), box.y + box.height / 2);
    else await this.page.mouse.click(200, 200); // fallback: a safe outside-the-menu point
    await this.page.locator(S.mnuToolbarVariant).first().waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => { /* already gone */ });
    return (await this.page.locator(S.mnuToolbarVariant).count()) === 0;
  }

  // An Export variant opens a shared dialog requiring 1-3 years and a currency before Continue
  // enables; only Continue fires the export.

  private exportDialog(): Locator {
    return this.page.locator(S.dlgExport).filter({ hasText: CORP_PRICING_TOOLBAR_IO.exportDialog.prompt }).first();
  }

  private exportYearCombo(): Locator {
    return this.exportDialog().locator(S.cmbExportField).nth(0);
  }
  private exportCurrencyCombo(): Locator {
    return this.exportDialog().locator(S.cmbExportField).nth(1);
  }

  @step('Open export variant dialog')
  async openExportVariantDialog(variant: string): Promise<void> {
    await this.openExportMenu();
    await this.page.locator(S.mnuToolbarVariant, { hasText: variant }).first().click();
    await this.exportDialog().waitFor({ state: 'visible', timeout: 6_000 });
  }

  @step('Get export dialog info')
  async getExportDialogInfo(): Promise<{ text: string; comboCount: number; buttons: string[]; continueDisabled: boolean }> {
    const dlg = this.exportDialog();
    const text = (await dlg.innerText()).replace(/\s+/g, ' ').trim();
    const comboCount = await dlg.locator(S.cmbExportField).count();
    const buttons = (await dlg.locator('button').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const continueDisabled = await dlg.locator('button', { hasText: /^Continue$/ }).first().isDisabled();
    return { text, comboCount, buttons, continueDisabled };
  }

  @step('Is export continue enabled')
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

  @step('Set export years')
  async setExportYears(years: Array<string | number>): Promise<void> {
    await this.openExportYearList();
    for (const y of years) await this.clickExportYearOption(y);
    await this.closeExportYearList();
  }

  // Proves the 1-3 year cap: after 3 are chosen the app silently refuses a 4th.
  @step('Attempt extra export year')
  async attemptExtraExportYear(year: string | number): Promise<string[]> {
    await this.openExportYearList();
    // No catch: the option must be present and clickable, so a "still 3 selected" result means the app
    // REFUSED the 4th year rather than that the option was missing.
    const extraOption = this.page.locator(S.optExportListItem, { hasText: new RegExp(`^${year}$`) }).first();
    await extraOption.waitFor({ state: 'visible', timeout: 4_000 });
    await extraOption.click();
    const selected = await this.getExportSelectedYears();
    await this.closeExportYearList();
    return selected;
  }

  @step('Get export selected years')
  async getExportSelectedYears(): Promise<string[]> {
    const text = await this.exportYearCombo().innerText().catch(() => '');
    const years = text.match(/\d{4}/g) ?? [];
    return [...new Set(years)].sort();
  }

  @step('Get export currency options')
  async getExportCurrencyOptions(): Promise<string[]> {
    await this.exportCurrencyCombo().click();
    await this.page.locator(S.optExportListItem).first().waitFor({ state: 'visible', timeout: 4_000 });
    const opts = await this.page.locator(S.optExportListItem).allInnerTexts();
    await this.page.keyboard.press('Escape');
    return opts.map((t) => t.trim()).filter(Boolean);
  }

  @step('Set export currency')
  async setExportCurrency(code: string): Promise<void> {
    await this.exportCurrencyCombo().click();
    await this.page.locator(S.optExportListItem, { hasText: new RegExp(`^${code}$`) }).first().click();
  }

  @step('Cancel export dialog')
  async cancelExportDialog(): Promise<boolean> {
    await this.exportDialog().locator('button', { hasText: /^Cancel$/ }).first().click().catch(() => { /* best-effort: fall through to the hidden-state check below, which is the real oracle for whether it closed */ });
    return this.exportDialog().waitFor({ state: 'hidden', timeout: 3_000 }).then(() => true).catch(() => false);
  }

  @step('Close export dialog')
  async closeExportDialog(): Promise<boolean> {
    await this.exportDialog().locator('button', { hasText: /^Close$/ }).first().click().catch(() => { /* best-effort: fall through to the hidden-state check below, which is the real oracle for whether it closed */ });
    return this.exportDialog().waitFor({ state: 'hidden', timeout: 3_000 }).then(() => true).catch(() => false);
  }

  // Configures the dialog then Cancels, reporting whether any export request fired (should be false).
  @step('Cancel export and check no request')
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

  // NM-2264: the post-gate Continue button is the download trigger — the Export menu button only
  // opens the menu.
  @step('Download export variant')
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

  // For tests asserting the request params only — the resulting download is left to auto-discard.
  @step('Continue export and capture request')
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

  /** First-column ids of an export matrix's data rows, skipping the currency row and blanks. */
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

  @step('Get import dialog info')
  async getImportDialogInfo(): Promise<{ text: string; buttons: string[]; hasFileInput: boolean }> {
    const dlg = this.importDialog();
    const text = (await dlg.innerText()).replace(/\s+/g, ' ').trim();
    const buttons = (await dlg.locator('button').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const hasFileInput = (await dlg.locator('input[type="file"]').count()) > 0;
    return { text, buttons, hasFileInput };
  }

  @step('Close import dialog')
  async closeImportDialog(): Promise<void> {
    const dlg = this.importDialog();
    if ((await dlg.count()) === 0) return;
    const closeBtn = dlg.locator('button', { hasText: /^(Close|Cancel)$/ }).first();
    if ((await closeBtn.count()) > 0) await closeBtn.click().catch(() => { /* best-effort: fall through to the Escape fallback + hidden-state wait below */ });
    else await this.page.keyboard.press('Escape').catch(() => { /* nothing */ });
    await dlg.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => { /* already closed */ });
  }

  // Grid-scoped delta-stage flow (distinct from the location-scoped Loc Pricing Import below):
  // nothing persists until rows are selected in the "Select items to publish" modal and published.

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

  // Staging REPLACES the upload dialog with this modal, so a caller that staged a change must dismiss
  // THIS one — otherwise its overlay lingers and blocks the next action.
  @step('Cancel publish modal')
  async cancelPublishModal(): Promise<boolean> {
    const modal = this.publishModal();
    if ((await modal.count()) === 0) return true;
    const btn = modal.locator('button', { hasText: /^(Cancel|Close)$/ }).first();
    if ((await btn.count()) > 0) await btn.click().catch(() => { /* best-effort: the hidden-state check below is the real oracle */ });
    else await this.page.keyboard.press('Escape').catch(() => { /* nothing to dismiss */ });
    return modal.waitFor({ state: 'hidden', timeout: 3_000 }).then(() => true).catch(() => false);
  }

  @step('Open import all variant dialog')
  async openImportAllVariantDialog(variant: string): Promise<void> {
    await this.openImportMenu();
    await this.page.locator(S.mnuToolbarVariant, { hasText: variant }).first().click();
    await this.importAllDialog().waitFor({ state: 'visible', timeout: 6_000 });
  }

  @step('Get import all dialog info')
  async getImportAllDialogInfo(): Promise<{ text: string; comboCount: number; buttons: string[]; continueDisabled: boolean }> {
    const dlg = this.importAllDialog();
    const text = (await dlg.innerText()).replace(/\s+/g, ' ').trim();
    const comboCount = await dlg.locator(S.cmbImportAllField).count();
    const buttons = (await dlg.locator('button').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const continueDisabled = await dlg.locator('button', { hasText: /^Continue$/ }).first().isDisabled();
    return { text, comboCount, buttons, continueDisabled };
  }

  @step('Is import all continue enabled')
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

  @step('Set import all years')
  async setImportAllYears(years: Array<string | number>): Promise<void> {
    await this.openImportAllYearList();
    for (const y of years) await this.page.locator(S.optImportAllListItem, { hasText: new RegExp(`^${y}$`) }).first().click();
    await this.closeImportAllYearList();
  }

  // Proves the 1-3 year cap. Fails loudly if the extra option is missing, so a "still 3" result
  // must mean the app REFUSED the 4th.
  @step('Attempt extra import all year')
  async attemptExtraImportAllYear(year: string | number): Promise<string[]> {
    await this.openImportAllYearList();
    const extra = this.page.locator(S.optImportAllListItem, { hasText: new RegExp(`^${year}$`) }).first();
    await extra.waitFor({ state: 'visible', timeout: 4_000 });
    await extra.click();
    const selected = await this.getImportAllSelectedYears();
    await this.closeImportAllYearList();
    return selected;
  }

  @step('Get import all selected years')
  async getImportAllSelectedYears(): Promise<string[]> {
    const text = await this.importAllYearCombo().innerText().catch(() => '');
    const years = text.match(/\d{4}/g) ?? [];
    return [...new Set(years)].sort();
  }

  @step('Get import all currency options')
  async getImportAllCurrencyOptions(): Promise<string[]> {
    await this.importAllCurrencyCombo().click();
    await this.page.locator(S.optImportAllListItem).first().waitFor({ state: 'visible', timeout: 4_000 });
    const opts = await this.page.locator(S.optImportAllListItem).allInnerTexts();
    await this.page.keyboard.press('Escape');
    return opts.map((t) => t.trim()).filter(Boolean);
  }

  @step('Set import all currency')
  async setImportAllCurrency(code: string): Promise<void> {
    await this.importAllCurrencyCombo().click();
    await this.page.locator(S.optImportAllListItem, { hasText: new RegExp(`^${code}$`) }).first().click();
  }

  @step('Cancel import all dialog')
  async cancelImportAllDialog(): Promise<boolean> {
    await this.importAllDialog().locator('button', { hasText: /^Cancel$/ }).first().click().catch(() => { /* best-effort: the hidden-state check below is the real oracle */ });
    return this.importAllDialog().waitFor({ state: 'hidden', timeout: 3_000 }).then(() => true).catch(() => false);
  }

  @step('Click import all continue')
  async clickImportAllContinue(): Promise<void> {
    await this.importAllDialog().locator('button', { hasText: /^Continue$/ }).first().click();
    await this.importDialog().waitFor({ state: 'visible', timeout: 6_000 });
  }

  @step('Open the Import All upload dialog')
  async openImportAllUploadFor(variant: string, years: Array<string | number>, currency: string): Promise<void> {
    await this.openImportAllVariantDialog(variant);
    await this.setImportAllYears(years);
    await this.setImportAllCurrency(currency);
    await this.clickImportAllContinue();
  }

  // Does NOT commit — the app re-downloads the server pricebook and diffs in the browser; this waits
  // for the staged-changes modal or a settled message and classifies it.
  @step('Choose import all file')
  async chooseImportAllFile(fixturePath: string): Promise<ImportAllOutcome> {
    const uploadDlg = this.importDialog();
    // The diff fires a GET pricing-export for every outcome EXCEPT an unsupported file type
    // (rejected before any network), so capture its URL best-effort.
    const diffReqPromise = this.page
      .waitForRequest((r) => r.url().includes(CORP_PRICING_EXPORT_API) && r.method() === 'GET', { timeout: 15_000 })
      .then((r) => r.url())
      .catch(() => null);
    const [chooser] = await Promise.all([
      this.page.waitForEvent('filechooser'),
      uploadDlg.locator(S.btnImportBrowse).click(),
    ]);
    await chooser.setFiles(fixturePath);

    // Poll for the settled outcome rather than sleeping a fixed time.
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
    // RAW on-screen text, not a synthesized constant — a caller's assertion must check what the app
    // rendered, not a value we handed back to ourselves.
    const message = (await this.page.locator(S.dlgImport).first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    return { kind, message, staged: [], diffRequestUrl };
  }

  private async readStagedRows(): Promise<ImportAllStagedRow[]> {
    return this.publishModal().evaluate((dlg) => {
      const rows = Array.from(dlg.querySelectorAll('tbody tr'));
      return rows.map((r) => {
        const cells = Array.from(r.querySelectorAll('td')).map((c) => (c.textContent || '').replace(/\s+/g, ' ').trim());
        // Take the 5 rightmost cells so an optional leading checkbox cell is dropped.
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

  // The ONLY mutating step. The outcome comes from the commit request's response, never the dialog.
  @step('Publish staged import')
  async publishStagedImport(opts?: { onlyProductGroupIds?: string[] }): Promise<ImportAllPublishResult> {
    const modal = this.publishModal();
    const only = opts?.onlyProductGroupIds;
    if (only && only.length > 0) {
      // Partial selection: only these product groups' rows are checked — a deselected staged row
      // must NOT be written.
      const rows = modal.locator('tbody tr');
      const rowCount = await rows.count();
      for (let i = 0; i < rowCount; i++) {
        const row = rows.nth(i);
        const cells = (await row.locator('td').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
        const productGroupId = cells.slice(-5)[1] ?? ''; // [pricebook, productGroupId, name, price, newPrice]
        if (only.includes(productGroupId)) await row.locator(S.chkPublishRow).first().check();
      }
    } else {
      // `.check()` verifies the ARIA state — a bare click can focus-without-toggle on a Radix checkbox.
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

  /** Reads the publish modal WITHOUT committing — none of this is exposed by `publishStagedImport`. */
  @step('Get publish modal info')
  async getPublishModalInfo(): Promise<{ publishDisabled: boolean; headers: string[]; totalItemsText: string; rowCount: number }> {
    const modal = this.publishModal();
    const publishDisabled = await modal.locator(S.btnPublish).first().isDisabled();
    const headers = (await modal.locator('th').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const totalItemsText = (await modal.getByText(/Total Items/i).first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    const rowCount = await modal.locator('tbody tr').count();
    return { publishDisabled, headers, totalItemsText, rowCount };
  }

  @step('Check one staged row')
  async checkOneStagedRow(): Promise<void> {
    await this.publishModal().locator('tbody').locator(S.chkPublishRow).first().check();
  }

  // A fresh export is the source of truth for what persisted — a different dataset from the search
  // grid, so pre/post-import checks compare this, not the grid.
  @step('Capture import all cell value')
  async captureImportAllCellValue(opts: { variant: string; years: Array<string | number>; currency: string; productGroupId: string; pricebook: string }): Promise<string> {
    const exp = await this.downloadExportVariant(opts.variant, opts.years, opts.currency);
    const colIdx = exp.headers.indexOf(opts.pricebook);
    if (colIdx < 0) throw new Error(`captureImportAllCellValue: pricebook column "${opts.pricebook}" not found in the export`);
    const pgRow = exp.rows.find((r) => (r[0] ?? '').trim() === opts.productGroupId);
    if (!pgRow) throw new Error(`captureImportAllCellValue: product group "${opts.productGroupId}" not found in the export`);
    return (pgRow[colIdx] ?? '').trim();
  }

  // `otherRow` is the merge canary: never imported, so it must survive Publish unchanged. Only the ROW
  // dimension is captured — the import file is fixed-width, so an omitted-column case cannot exist.
  @step('Record the rows used to check the merge')
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

  // Every other cell matches the current server, so the browser diff stages exactly the one changed
  // cell. The temp file is the caller's to remove.
  @step('Build an Import All file with one changed cell')
  async buildImportAllSingleCellFixture(opts: { variant: string; years: Array<string | number>; currency: string; productGroupId: string; pricebook: string; newValue: string }): Promise<{ path: string; previousValue: string }> {
    const exp = await this.downloadExportVariant(opts.variant, opts.years, opts.currency);
    const colIdx = exp.headers.indexOf(opts.pricebook);
    if (colIdx < 0) throw new Error(`buildImportAllSingleCellFixture: pricebook column "${opts.pricebook}" not found in the export`);
    const pgRow = exp.rows.find((r) => (r[0] ?? '').trim() === opts.productGroupId);
    if (!pgRow) throw new Error(`buildImportAllSingleCellFixture: product group "${opts.productGroupId}" not found in the export`);
    const previousValue = (pgRow[colIdx] ?? '').trim();
    const cloned = [...pgRow];
    cloned[colIdx] = opts.newValue;
    const currencyRow = exp.rows[0] ?? []; // metadata the server matches — kept so only the price cell diffs
    const csv = [exp.headers, currencyRow, cloned].map((r) => r.map(toCsvField).join(',')).join('\n') + '\n';
    const tmp = join(tmpdir(), `import-all-${process.pid}-${Date.now()}.csv`);
    writeFileSync(tmp, csv, 'utf-8');
    return { path: tmp, previousValue };
  }

  // Stages several rows in one pricebook column, for multi-row staging and partial-selection publish.
  // The caller removes the temp file.
  @step('Build an Import All file with several changed cells')
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

  // Count-based so "none open" returns 0 instead of throwing — reading text off an absent dialog
  // throws, and catching that would mask a real crash as a pass.
  @step('Import dialog count')
  async importDialogCount(): Promise<number> {
    return this.importDialog().locator(S.inputImportFile).count();
  }

  @step('Click Location Pricing export')
  async clickLocPricingExportAndCaptureUrl(): Promise<string> {
    const reqPromise = this.page.waitForRequest((r) => r.url().includes(CORP_PRICING_LOC_EXPORT_API), { timeout: 15_000 });
    await this.page.locator(S.btnLocPricingExport).first().click();
    return (await reqPromise).url();
  }

  // Arms the download event AND the export request on the SAME click, so one action yields the
  // filename, contents, and request URL. Read from the browser temp path — nothing lands in the repo.
  private async captureCsvDownload(trigger: Locator, apiPathFragment: string): Promise<CsvDownloadResult> {
    const [download, request] = await Promise.all([
      this.page.waitForEvent('download', { timeout: 30_000 }),
      this.page.waitForRequest((r) => r.url().includes(apiPathFragment), { timeout: 30_000 }),
      trigger.click(),
    ]);
    // The status is part of the contract, so throw rather than let the caller assert a status
    // that was never observed.
    const response = await request.response();
    if (!response) throw new Error('captureCsvDownload: the export response was not captured — cannot assert its status');
    const status = response.status();
    const filePath = await download.path();
    if (!filePath) throw new Error('captureCsvDownload: the download did not resolve to a file path');
    const raw = readFileSync(filePath, 'utf-8');
    const content = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw; // strip a leading byte-order mark if present
    const lines = content.split(/\r?\n/);
    // Drop only the terminal newline; interior blanks stay so a malformed blank row is caught.
    if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
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

  /** Loc Pricing Export round-trip (NM-2262) — a thin wrapper over the shared CSV-download capture. */
  @step('Download Location Pricing export')
  async downloadLocPricingExport(): Promise<CsvDownloadResult> {
    return this.captureCsvDownload(this.page.locator(S.btnLocPricingExport).first(), CORP_PRICING_LOC_EXPORT_API);
  }

  @step('Open Location pricing import dialog')
  async openLocPricingImportDialog(): Promise<void> {
    await this.page.locator(S.btnLocPricingImport).first().click();
    await this.importDialog().waitFor({ state: 'visible', timeout: 6_000 });
  }

  // Requires an already-open import dialog. There is NO separate Upload click — choosing a file is what
  // auto-submits, so the outcome is classified on whether the import PUT actually fired.
  @step('Upload file to open dialog')
  async uploadFileToOpenDialog(fixturePath: string): Promise<LocImportResult> {
    const dlg = this.importDialog();
    // Armed BEFORE the file is chosen, because choosing it auto-submits. Only a timeout means "no import
    // fired" — any other wait error (crash, context close, navigation) is re-thrown, never nulled.
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

    // No import fired → the app rejected the file in the browser, so return the dialog's own message.
    // An empty dialog cannot be classified at all — fail loudly instead of calling it a rejection.
    const dialogText = (await dlg.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    if (!dialogText) {
      throw new Error('uploadFileToOpenDialog: no import request fired and the import dialog carried no text — the upload outcome could not be classified');
    }
    return { success: false, status: null, message: dialogText, requestUrl: null, responseBody: null };
  }

  @step('Location pricing import')
  async locPricingImport(fixturePath: string): Promise<LocImportResult> {
    await this.openLocPricingImportDialog();
    return this.uploadFileToOpenDialog(fixturePath);
  }

  // NM-2305 round-trip oracle: the export is the source of truth for what persisted, so pre/post
  // import checks compare these rows rather than the tenant-wide search grid.
  @step('Capture Location Pricing CSV rows')
  async captureLocPricingCsvRows(locationNo: string): Promise<{ header: string[]; rows: string[][] }> {
    const csv = await this.downloadLocPricingExport();
    const locIdx = csv.headers.indexOf('LocationNo');
    const rows = csv.rows.filter((r) => (r[locIdx] ?? '') === locationNo);
    return { header: csv.headers, rows };
  }

  /** Best-effort restore after a mutating round-trip; the returned outcome confirms it landed. */
  @step('Restore Location pricing rows')
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

  @step('Open grid options')
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

  @step('Get grid option columns')
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

  @step('Toggle grid column')
  async toggleGridColumn(label: string): Promise<void> {
    await this.page.locator(S.mnuGridColumn, { hasText: label }).first().click();
  }

  @step('Close grid options')
  async closeGridOptions(): Promise<void> {
    await this.page.keyboard.press('Escape').catch(() => { /* nothing open */ });
    await this.page.locator(S.mnuGridColumn).first().waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => { /* already closed */ });
  }

  @step('Reset grid to default view')
  async resetGridToDefaultView(): Promise<void> {
    await this.page.locator('[role="menuitem"]', { hasText: 'Reset to Default View' }).first().click();
  }

  @step('Is grid column visible')
  async isGridColumnVisible(label: string): Promise<boolean> {
    return (await this.getColumnHeaders()).some((h) => h === label || h.includes(label));
  }

  // Mutation-safety restore to the all-columns-visible baseline. Column visibility is server-persisted
  // per user, so it must be re-verified after a reload. Self-navigates; safe as a before/afterEach.
  @step('Ensure all grid columns visible')
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

  @step('Get column index by name')
  async getColumnIndexByName(name: string): Promise<number> {
    const headers = await this.getColumnHeaders();
    const exact = headers.indexOf(name);
    return exact >= 0 ? exact : headers.findIndex((h) => h.includes(name));
  }

  @step('Read column for visible rows')
  async readColumnForVisibleRows(name: string): Promise<string[]> {
    const idx = await this.getColumnIndexByName(name);
    if (idx < 0) throw new Error(`readColumnForVisibleRows: column "${name}" not found in grid headers`);
    const rows = this.page.locator(S.rowGridAny);
    const n = await rows.count();
    const out: string[] = [];
    for (let r = 0; r < n; r++) out.push((await rows.nth(r).locator('td').nth(idx).innerText()).replace(/\s+/g, ' ').trim());
    return out;
  }

  @step('Read boolean column for visible rows')
  async readBooleanColumnForVisibleRows(name: string): Promise<boolean[]> {
    const idx = await this.getColumnIndexByName(name);
    if (idx < 0) throw new Error(`readBooleanColumnForVisibleRows: column "${name}" not found`);
    const rows = this.page.locator(S.rowGridAny);
    const n = await rows.count();
    const out: boolean[] = [];
    for (let r = 0; r < n; r++) out.push(await this.readBooleanCell(rows.nth(r), idx));
    return out;
  }

  @step('Get first n price book names')
  async getFirstNPriceBookNames(n: number): Promise<string[]> {
    const rows = this.page.locator(S.rowGridAny);
    const count = Math.min(await rows.count(), n);
    const out: string[] = [];
    for (let r = 0; r < count; r++) out.push((await rows.nth(r).locator('td').nth(0).innerText()).replace(/\s+/g, ' ').trim());
    return out;
  }

  @step('Get tbody row count')
  async getTbodyRowCount(): Promise<number> {
    return this.page.locator(S.rowGridAny).count();
  }

  @step('Has no results message')
  async hasNoResultsMessage(): Promise<boolean> {
    return this.isVisibleSafe(S.lblNoResults);
  }

  @step('Get Pricebook link cell count')
  async getPricebookLinkCellCount(): Promise<number> {
    return this.page.locator(S.rowNameButton).count();
  }

  private pageSizeCombo(): Locator {
    return this.page.locator(S.drpPageSizeRole).filter({ hasText: /^\s*\d+\s*$/ }).first();
  }

  @step('Has page size control')
  async hasPageSizeControl(): Promise<boolean> {
    return (await this.page.locator(S.drpPageSizeRole).filter({ hasText: /^\s*\d+\s*$/ }).count()) > 0;
  }

  @step('Get page size value')
  async getPageSizeValue(): Promise<string> {
    return (await this.pageSizeCombo().innerText()).replace(/\s+/g, ' ').trim();
  }

  @step('Get page size options')
  async getPageSizeOptions(): Promise<string[]> {
    await this.pageSizeCombo().click();
    await this.page.locator('[role="option"]').first().waitFor({ state: 'visible', timeout: 8_000 });
    const out = (await this.page.locator('[role="option"]').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
    await this.page.keyboard.press('Escape').catch(() => { /* nothing open */ });
    return out.filter(Boolean);
  }

  @step('Set page size')
  async setPageSize(value: string | number): Promise<void> {
    await this.pageSizeCombo().click();
    await this.page.locator('[role="option"]', { hasText: new RegExp(`^${value}$`) }).first().click();
    await this.page.locator(S.rowGridAny).first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => { /* grid settles */ });
  }

  private pageNavSelector(which: 'first' | 'previous' | 'next' | 'last'): string {
    return which === 'first' ? S.btnPageFirst : which === 'previous' ? S.btnPagePrev : which === 'next' ? S.btnPageNext : S.btnPageLast;
  }

  @step('Has page nav')
  async hasPageNav(which: 'first' | 'previous' | 'next' | 'last'): Promise<boolean> {
    return (await this.page.locator(this.pageNavSelector(which)).count()) > 0;
  }

  @step('Is page nav disabled')
  async isPageNavDisabled(which: 'first' | 'previous' | 'next' | 'last'): Promise<boolean> {
    const b = this.page.locator(this.pageNavSelector(which)).first();
    if (await b.isDisabled().catch(() => false)) return true;
    return (await b.getAttribute('aria-disabled')) === 'true';
  }

  @step('Click page nav')
  async clickPageNav(which: 'first' | 'previous' | 'next' | 'last'): Promise<void> {
    await this.page.locator(this.pageNavSelector(which)).first().click();
    await this.page.locator(S.rowGridAny).first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => { /* grid settles */ });
  }

  private headerCell(name: string): Locator {
    return this.page.locator(S.colHeaderAny, { hasText: name }).first();
  }

  @step('Column header has button')
  async columnHeaderHasButton(name: string): Promise<boolean> {
    return (await this.headerCell(name).locator('button').count()) > 0;
  }

  @step('Click column header sort')
  async clickColumnHeaderSort(name: string): Promise<void> {
    const btn = this.headerCell(name).locator('button').first();
    if ((await btn.count()) > 0) await btn.click();
    else await this.headerCell(name).click();
    await this.page.locator(S.rowGridAny).first().waitFor({ state: 'visible', timeout: 10_000 }).catch(() => { /* settle */ });
  }

  @step('Read the column\'s sort direction')
  async getColumnAriaSort(name: string): Promise<string | null> {
    return this.headerCell(name).getAttribute('aria-sort');
  }
}
