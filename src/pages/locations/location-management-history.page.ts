import { Page } from '@playwright/test';
import { step } from '../../fixtures/step-decorator';
import { BasePage } from '../base.page';
import { IConfig } from '../../types';

export class LocationManagementHistoryPage extends BasePage {
  constructor(page: Page, config?: IConfig) {
    super(page, config);
  }

  @step('Navigate to history tab')
  async navigateToHistoryTab(officeNo = '1604'): Promise<void> {
    const currentUrl = this.page.url();
    if (!currentUrl.includes(`locations/${officeNo}/settings/location`)) {
      const baseUrl = this.config?.base_url || '';
      await this.navigateTo(`${baseUrl}locations/${officeNo}/settings/location`);
      await this.waitForAngularStable();
    }
    const tab = this.getElement('tabLocationManagementHistory');
    await tab.waitFor({ state: 'visible', timeout: 30_000 });
    const isSelected = await tab.getAttribute('aria-selected').catch(() => null);
    if (isSelected !== 'true') {
      await tab.click();
      await this.dismissAlertDialogIfVisible();
      await this.waitForAngularStable();
    }
    await this.getElement('tblMgmtHistory').locator('th').first().waitFor({ state: 'visible', timeout: 15_000 });
  }

 /**
 * Must be called after history tests to prevent cross-spec state contamination:
 * when History tab is active, sub-tabs (Currency, Legal, etc.) are hidden.
 * If the next spec inherits this worker, those sub-tabs will not be found.
 */
  @step('Return to basic information')
  async returnToBasicInformation(): Promise<void> {
    const basicTab = this.getElement('tabBasicInformation');
    await basicTab.click();
    await this.waitForAngularStable();
  }

  @step('Capture responses on history tab switch')
  async captureResponsesOnHistoryTabSwitch(): Promise<string[]> {
    const basicTab = this.getElement('tabBasicInformation');
    await basicTab.click();
    await this.waitForAngularStable();

    const responses: string[] = [];
    const handler = (resp: { status(): number; url(): string }) => {
      responses.push(`[${resp.status()}] ${resp.url()}`);
    };
    this.page.on('response', handler);

    const historyTab = this.getElement('tabLocationManagementHistory');
    await historyTab.click();
    await this.waitForAngularStable();
    await this.getElement('tblMgmtHistory').locator('th').first().waitFor({ state: 'visible', timeout: 15_000 });

    this.page.off('response', handler);
    return responses;
  }

  @step('Is table visible')
  async isTableVisible(): Promise<boolean> {
    return this.getElement('tblMgmtHistory').isVisible();
  }

  @step('Get column headers')
  async getColumnHeaders(): Promise<string[]> {
    const table = this.getElement('tblMgmtHistory');
    await table.locator('th').first().waitFor({ state: 'visible', timeout: 10_000 });
    const headers = table.locator('th');
    return (await headers.allTextContents()).map(t => t.trim());
  }

  @step('Get column header count')
  async getColumnHeaderCount(): Promise<number> {
    return this.getElement('tblMgmtHistory').locator('th').count();
  }

  @step('Get data row count')
  async getDataRowCount(): Promise<number> {
    return this.getElement('tblMgmtHistory').locator('tbody tr').count();
  }

  @step('Is table empty')
  async isTableEmpty(): Promise<boolean> {
    const text = (await this.getElement('tblMgmtHistory').textContent() || '').trim();
    return text.includes('No results.');
  }

  // Returns the FIRST match — important for duplicate-named columns (e.g., "Currency" appears twice).
  private async getColumnIndex(headerText: string): Promise<number> {
    const headers = await this.getColumnHeaders();
    const idx = headers.indexOf(headerText);
    if (idx === -1) throw new Error(`Column header "${headerText}" not found in history table`);
    return idx;
  }

  @step('Get column by header')
  async getColumnByHeader(rowIndex: number, headerText: string): Promise<string> {
    const colIndex = await this.getColumnIndex(headerText);
    return this.getColumnByIndex(rowIndex, colIndex);
  }

  @step('Get column by index')
  async getColumnByIndex(rowIndex: number, colIndex: number): Promise<string> {
    const cell = this.getElement('tblMgmtHistory').locator(`tbody tr`).nth(rowIndex).locator('td').nth(colIndex);
    return (await cell.textContent() || '').trim();
  }

  @step('Get row values')
  async getRowValues(rowIndex: number, headerTexts: string[]): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    for (const header of headerTexts) {
      result[header] = await this.getColumnByHeader(rowIndex, header);
    }
    return result;
  }

  @step('Get latest row values')
  async getLatestRowValues(headerTexts: string[]): Promise<Record<string, string>> {
    return this.getRowValues(0, headerTexts);
  }

 /**
 * Treats the displayed time as UTC (via Date.UTC): the server renders timestamps as
 * UTC literal text with no TZ suffix. Using `new Date(y,m,d,h,...)` would interpret as
 * browser-local, causing off-by-offset-hours errors (e.g., -5.5h for IST clients).
 * If the server switches to browser-local TZ, parsed values will be slightly future —
 * still > sinceMs → still correctly included.
 */
  static parseModifiedOnMs(val: string): number {
    const parts = val.trim().split(' ');
    const dateParts = (parts[0] || '').split('/');
    const timeParts = (parts[1] || '').split(':').map(Number);
    const ampm = parts[2] || '';
    const m = Number(dateParts[0]);
    const d = Number(dateParts[1]);
    const y = Number(dateParts[2]);
    let h = timeParts[0] || 0;
    const min = timeParts[1] || 0;
    const s = timeParts[2] || 0;
    if (!Number.isFinite(m) || !Number.isFinite(d) || !Number.isFinite(y)) return NaN;
    if (!Number.isFinite(h) || !Number.isFinite(min) || !Number.isFinite(s)) return NaN;
    if (ampm === 'PM' && h !== 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    return Date.UTC(y, m - 1, d, h, min, s);
  }

 /**
 * Page-1-only: a test suite's saves always fit in 1 page (<20 rows) after desc sort.
 * An earlier paginated version timed out at 180s because subsequent pages frequently
 * returned rowCount=0 due to post-click DOM re-render lag. If >20 rows are needed, raise
 * rowsPerPage via setRowsPerPage('50') — don't re-introduce pagination without a rowCount>0
 * wait after each clickPaginationButton.
 * Resolves each header to a column index ONCE to avoid O(n*cols) re-resolution.
 * @param sinceMs Lower-bound epoch ms. Rows strictly older are excluded.
 * @param headerTexts Column headers to read (duplicate names return first match).
 * @param maxRows Safety cap (default 40 — 2x typical rowsPerPage).
 */
  @step('Get rows since timestamp')
  async getRowsSinceTimestamp(
    sinceMs: number,
    headerTexts: string[],
    maxRows = 40,
  ): Promise<Array<Record<string, string>>> {
    const allHeaders = await this.getColumnHeaders();
    const modifiedOnIdx = allHeaders.indexOf('Modified On');
    if (modifiedOnIdx === -1) {
      throw new Error('Modified On column not found in history table');
    }
    const headerToIdx: Record<string, number> = {};
    for (const h of headerTexts) {
      const idx = allHeaders.indexOf(h);
      if (idx === -1) {
        throw new Error(`Header "${h}" not found in history table`);
      }
      headerToIdx[h] = idx;
    }

    const table = this.getElement('tblMgmtHistory');
    const collected: Array<Record<string, string>> = [];

    const firstDisabled = await this.isPaginationButtonDisabled('first').catch(() => true);
    if (!firstDisabled) {
      await this.clickPaginationButton('first');
    }

    const rowCount = await table.locator('tbody tr').count();
    for (let r = 0; r < rowCount && collected.length < maxRows; r++) {
      const row = table.locator('tbody tr').nth(r);
      const modifiedOnVal = ((await row.locator('td').nth(modifiedOnIdx).textContent()) || '').trim();
      const modifiedOnMs = LocationManagementHistoryPage.parseModifiedOnMs(modifiedOnVal);
      if (Number.isFinite(modifiedOnMs) && modifiedOnMs < sinceMs) {
        break;
      }
      const rec: Record<string, string> = {};
      for (const [header, idx] of Object.entries(headerToIdx)) {
        rec[header] = ((await row.locator('td').nth(idx).textContent()) || '').trim();
      }
      collected.push(rec);
    }

    return collected;
  }

 /** Radix sort dropdown is flaky: menu occasionally fails to appear after button click.
 * Retries with Escape to clear any lingering state, max 3 attempts.
 * Uses [role="menu"] retry — not selectComboboxOption (different surface). */
  @step('Click sort column')
  async clickSortColumn(headerText: string, direction: 'ascending' | 'descending' = 'ascending'): Promise<void> {
    const colIndex = await this.getColumnIndex(headerText);
    const th = this.getElement('tblMgmtHistory').locator('th').nth(colIndex);
    const sortBtn = th.locator('button');
    if (await sortBtn.count() === 0) {
      throw new Error(`Column "${headerText}" is not sortable (no button element)`);
    }
    const menu = this.page.locator('[role="menu"]').first();
    let lastErr: unknown = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await sortBtn.click();
        await menu.waitFor({ state: 'visible', timeout: 3_000 });
        await menu.locator(`[role="menuitem"]:has-text("Sort ${direction}")`).click();
        await menu.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => { /* best effort */ });
        await this.waitForAngularStable();
        return;
      } catch (e) {
        lastErr = e;
 // Escape to close any half-open menu; short settle before retry
        await this.page.keyboard.press('Escape').catch(() => {});
        await this.page.waitForTimeout(300);
      }
    }
    throw new Error(`clickSortColumn("${headerText}", "${direction}") failed after 3 attempts: ${String(lastErr)}`);
  }

  @step('Is sort button present')
  async isSortButtonPresent(headerText: string): Promise<boolean> {
    const colIndex = await this.getColumnIndex(headerText);
    const th = this.getElement('tblMgmtHistory').locator('th').nth(colIndex);
    return (await th.locator('button').count()) > 0;
  }

  @step('Is sort button present by index')
  async isSortButtonPresentByIndex(colIndex: number): Promise<boolean> {
    const th = this.getElement('tblMgmtHistory').locator('th').nth(colIndex);
    return (await th.locator('button').count()) > 0;
  }

  @step('Sort by modified on desc')
  async sortByModifiedOnDesc(): Promise<void> {
    await this.clickSortColumn('Modified On', 'descending');
  }

 /**
 * Use after sortByModifiedOnDesc: clickSortColumn + waitForAngularStable does NOT guarantee
 * the DOM has re-rendered with newest rows on top. With ~2900 rows, the ASC→DESC re-render
 * can take 1-3s; without this wait, the top row may still show old timestamps.
 */
  @step('Wait for recent top row')
  async waitForRecentTopRow(maxAgeMs = 24 * 60 * 60 * 1000, timeoutMs = 15_000): Promise<void> {
    const headers = await this.getColumnHeaders();
    const modifiedOnIdx = headers.indexOf('Modified On');
    if (modifiedOnIdx === -1) throw new Error('Modified On column not found');
    const deadline = Date.now() + timeoutMs;
    let lastVal = '';
    while (Date.now() < deadline) {
      const firstRow = this.getElement('tblMgmtHistory').locator('tbody tr').first();
      if ((await firstRow.count()) > 0) {
        lastVal = ((await firstRow.locator('td').nth(modifiedOnIdx).textContent()) || '').trim();
        const ms = LocationManagementHistoryPage.parseModifiedOnMs(lastVal);
        if (Number.isFinite(ms) && (Date.now() - ms) <= maxAgeMs) return;
      }
      await this.page.waitForTimeout(200);
    }
    throw new Error(`Top row Modified On "${lastVal}" not within ${maxAgeMs}ms of now after ${timeoutMs}ms wait — sort may not have applied`);
  }

  @step('Get rows per page value')
  async getRowsPerPageValue(): Promise<string> {
    return (await this.getElement('drpMgmtHistoryRowsPerPage').textContent() || '').trim();
  }

  @step('Get rows per page options')
  async getRowsPerPageOptions(): Promise<string[]> {
    return this.getComboboxOptions('drpMgmtHistoryRowsPerPage');
  }

  @step('Set rows per page')
  async setRowsPerPage(value: string): Promise<void> {
    await this.getElement('drpMgmtHistoryRowsPerPage').click();
    const listbox = this.page.locator('[role="listbox"]');
    await listbox.waitFor({ state: 'visible', timeout: 5_000 });
    await this.page.getByRole('option', { name: value, exact: true }).click();
    await this.waitForAngularStable();
  }

  @step('Get pagination text')
  async getPaginationText(): Promise<string> {
    const tabContent = this.page.locator('[data-testid="location-settings-tab-content-management-history"]');
    const current = (await tabContent.locator('input[aria-label="Current page number"]').inputValue().catch(() => '')).trim();
    const totalRaw = ((await tabContent.locator('span').filter({ hasText: /^\/\s*\d+$/ }).first().textContent().catch(() => '')) || '').trim();
    const total = totalRaw.replace(/\D/g, '');
    if (!current || !total) return '';
    return `${current} / ${total}`;
  }

  @step('Is pagination button disabled')
  async isPaginationButtonDisabled(direction: 'first' | 'previous' | 'next' | 'last'): Promise<boolean> {
    const keyMap = {
      first: 'btnMgmtHistoryFirstPage',
      previous: 'btnMgmtHistoryPrevPage',
      next: 'btnMgmtHistoryNextPage',
      last: 'btnMgmtHistoryLastPage',
    };
    return this.getElement(keyMap[direction]).isDisabled();
  }

  @step('Click pagination button')
  async clickPaginationButton(direction: 'first' | 'previous' | 'next' | 'last'): Promise<void> {
    const keyMap = {
      first: 'btnMgmtHistoryFirstPage',
      previous: 'btnMgmtHistoryPrevPage',
      next: 'btnMgmtHistoryNextPage',
      last: 'btnMgmtHistoryLastPage',
    };
    await this.getElement(keyMap[direction]).click();
    await this.waitForAngularStable();
  }

  @step('Is read only')
  async isReadOnly(): Promise<boolean> {
    const panel = this.page.locator('[role="tabpanel"]');
    const addBtn = await panel.locator('button:has-text("Add")').count();
    const editBtn = await panel.locator('button:has-text("Edit")').count();
    const deleteBtn = await panel.locator('button:has-text("Delete")').count();
    const saveBtn = await panel.locator('button:has-text("Save")').count();
    // Scope to the nested data <table> only: the tblMgmtHistory testid is a wrapper <div> that
    // contains BOTH the <table> AND the paginator "Current page number" <input>. Panel-wide
    // counting catches the paginator input → false negative. Assert exactly 0 — no relaxation.
    const inputs = await this.getElement('tblMgmtHistory').locator('table')
      .locator('input:not([type="hidden"]), textarea').count();
    return addBtn === 0 && editBtn === 0 && deleteBtn === 0 && saveBtn === 0 && inputs === 0;
  }

  @step('Are cells non interactive')
  async areCellsNonInteractive(): Promise<boolean> {
    const firstCell = this.getElement('tblMgmtHistory').locator('tbody tr:first-child td:first-child');
    if (await firstCell.count() === 0) return true; // No data rows
    await firstCell.click();
    const inputsAfterClick = await firstCell.locator('input, textarea, [contenteditable="true"]').count();
    return inputsAfterClick === 0;
  }

  @step('Has horizontal scroll')
  async hasHorizontalScroll(): Promise<boolean> {
    const table = this.getElement('tblMgmtHistory');
    return table.evaluate(el => {
      const inner = el.querySelector('table');
      return inner ? inner.scrollWidth > el.clientWidth : el.scrollWidth > el.clientWidth;
    });
  }

  @step('Get approximate total row count')
  async getApproximateTotalRowCount(): Promise<number> {
    const paginationText = await this.getPaginationText();
    const match = paginationText.match(/\d+\s*\/\s*(\d+)/);
    if (!match?.[1]) return 0;
    const totalPages = parseInt(match[1], 10);
    const rowsPerPage = parseInt(await this.getRowsPerPageValue(), 10) || 20;
    return totalPages * rowsPerPage;
  }
}
