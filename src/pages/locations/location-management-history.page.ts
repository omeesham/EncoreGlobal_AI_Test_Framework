import { Page } from '@playwright/test';
import { step } from '../../fixtures/step-decorator';
import { BasePage } from '../base.page';
import { IConfig } from '../../types';
import { Log } from '../../utils/logger';
import {
  DEFAULT_ROWS_PER_PAGE,
  HISTORY_API_URL_PATTERN,
  HISTORY_EMPTY_STATE_TEXT,
  HISTORY_TYPES,
  HistoryRequestBody,
} from '../../data/locations/location-management-history';

export type HistorySortDirection = 'ascending' | 'descending';
export type HistorySortState = 'ascending' | 'descending' | 'none';
export type HistoryPageDirection = 'first' | 'previous' | 'next' | 'last';
export type HistoryGridKind = 'standard' | 'legacy' | 'none';
export type SettingKind = 'checkbox' | 'radio' | 'dropdown' | 'text' | 'percent' | 'note';

/** One pass over the panel counting every affordance a read-only grid must NOT have. */
export interface HistoryControlCensus {
  actionButtonCount: number;
  actionButtonLabels: string[];
  checkboxCount: number;
  radioCount: number;
  ariaCheckboxCount: number;
  inputCount: number;
  textareaCount: number;
  selectCount: number;
  contentEditableCount: number;
}

export interface HistoryPendingState {
  spinnerCount: number;
  skeletonCount: number;
  dataRowCount: number;
  emptyStateShown: boolean;
}

export interface HistoryPageIndicator {
  current: number;
  total: number;
}

export interface HistoryOverflow {
  /** How far the document scrolls past its own width. 0 (1 for rounding) is correct. */
  pageOverflowPx: number;
  /** True when the grid's own container absorbs the extra width. */
  containerScrollsHorizontally: boolean;
}

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

 // Required after history tests: an active History tab hides the sub-tabs, so a spec
 // inheriting this worker would not find Currency, Legal, etc.
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

 // Date.UTC, not new Date(y,m,d,...): the server renders UTC text with no TZ suffix, and
 // local interpretation would shift results by the client's offset.
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

 // Page 1 only — paginating here timed out because later pages read rowCount=0 during
 // re-render. For >20 rows raise setRowsPerPage('50') instead.
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

 // The Radix sort menu sometimes fails to open, so retry up to 3 times with Escape between.
 // It is a [role="menu"], not a combobox, so selectComboboxOption does not apply.
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

 // Call after sortByModifiedOnDesc: waitForAngularStable does not cover the 1-3s ASC→DESC
 // re-render, so the top row can still show old timestamps.
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
    await this.selectComboboxOption('drpMgmtHistoryRowsPerPage', value, { exact: true });
    await this.waitForAngularStable();
    await this.waitForHistoryGridLoaded();
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
    await this.waitForHistoryGridLoaded();
  }

  @step('Is read only')
  async isReadOnly(): Promise<boolean> {
    const panel = this.page.locator('[role="tabpanel"]');
    const addBtn = await panel.locator('button:has-text("Add")').count();
    const editBtn = await panel.locator('button:has-text("Edit")').count();
    const deleteBtn = await panel.locator('button:has-text("Delete")').count();
    const saveBtn = await panel.locator('button:has-text("Save")').count();
    // Scope to the nested <table>: the tblMgmtHistory wrapper also holds the paginator's page
    // input, which would otherwise be counted as an editable field.
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

  // ================================================================== NM-3937 additions

  // ------------------------------------------------------------------ navigation

  // Count-guarded: safe from a beforeEach before the tab exists in the DOM at all.
  @step('Check whether the History tab is the one on screen')
  async isOnHistoryTab(): Promise<boolean> {
    const tab = this.getElement('tabLocationManagementHistory');
    if ((await tab.count()) === 0) return false;
    return (await tab.getAttribute('aria-selected').catch(() => null)) === 'true';
  }

  @step('Check whether the Basic Information tab is the one on screen')
  async isOnBasicInformationTab(): Promise<boolean> {
    const tab = this.getElement('tabBasicInformation');
    if ((await tab.count()) === 0) return false;
    return (await tab.getAttribute('aria-selected').catch(() => null)) === 'true';
  }

  // safeNavigateTo: Basic Information may hold an unsaved edit, which arms beforeunload.
  @step('Open Location Settings fresh, on the Basic Information tab')
  async openLocationSettings(officeNo = '1604'): Promise<void> {
    const baseUrl = this.config?.base_url || '';
    await this.safeNavigateTo(`${baseUrl}locations/${officeNo}/settings/location`);
    await this.waitForAngularStable();
    await this.dismissAlertDialogIfVisible();
    await this.getElement('tabLocationManagementHistory').waitFor({ state: 'visible', timeout: 60_000 });
  }

  @step('Reload the page and open the History tab again')
  async reloadAndNavigateToHistory(officeNo = '1604'): Promise<void> {
    await this.openLocationSettings(officeNo);
    await this.navigateToHistoryTab(officeNo);
    await this.waitForHistoryGridLoaded();
  }

  @step('Open the History tab and wait for its list')
  async openHistoryTab(officeNo = '1604'): Promise<void> {
    await this.navigateToHistoryTab(officeNo);
    await this.waitForHistoryGridLoaded();
  }

  @step('Read the names of the tabs along the top')
  async getTabStripLabels(): Promise<string[]> {
    // testid-audit: ignore -- structural: enumerates the tablist that owns the History tab's own testid
    const strip = this.page.locator('[role="tablist"]').filter({ has: this.getElement('tabLocationManagementHistory') });
    return (await strip.locator('[role="tab"]').allTextContents()).map(t => t.trim());
  }

  /** Labels of Basic Information's own second-row tabs that are currently visible. */
  @step('Read which Basic Information sub-tabs are visible')
  async getVisibleBasicInfoSubTabs(labels: readonly string[]): Promise<string[]> {
    const visible: string[] = [];
    for (const label of labels) {
      // testid-audit: ignore -- structural: visibility sweep over a caller-supplied list of sub-tab labels
      const tab = this.page.getByRole('tab', { name: label, exact: true });
      if (await tab.isVisible().catch(() => false)) visible.push(label);
    }
    return visible;
  }

  /** The History tab's accessible name — translated along with the rest of the UI. */
  @step('Read the History tab label')
  async getHistoryTabLabel(): Promise<string> {
    return ((await this.getElement('tabLocationManagementHistory').textContent()) || '').trim();
  }

  /**
   * Polls until the grid settles into one of its two resting states — at least one data row, or a
   * held "No results." empty state. Waiting on the header row alone races the remount window after
   * a tab re-entry, where 87 headers render over an empty tbody.
   */
  @step('Wait for the History list to finish loading')
  async waitForHistoryGridLoaded(timeoutMs = 30_000): Promise<void> {
    const table = this.getElement('tblMgmtHistory');
    await table.waitFor({ state: 'visible', timeout: timeoutMs });
    const deadline = Date.now() + timeoutMs;
    let emptyPolls = 0;
    let readyPolls = 0;
    while (Date.now() < deadline) {
      if ((await table.locator('th').count()) > 0) {
        if ((await table.locator('tbody tr').count()) > 0 && !(await this.isTableEmpty())) {
          if (++readyPolls >= 2) return;
          await this.page.waitForTimeout(200);
          continue;
        }
        readyPolls = 0;
        if (await this.isTableEmpty()) {
          if (++emptyPolls >= 8) return; // ~1.6s of continuously-empty
        } else {
          emptyPolls = 0;
        }
      } else {
        emptyPolls = 0;
        readyPolls = 0;
      }
      await this.page.waitForTimeout(200);
    }
    throw new Error(`History grid rendered neither a data row nor a stable "${HISTORY_EMPTY_STATE_TEXT}" state within ${timeoutMs}ms`);
  }

  @step('Count how many History lists are on the page')
  async getHistoryTableCount(): Promise<number> {
    return this.getElement('tabContentMgmtHistory').locator('table').count();
  }

  // ------------------------------------------------------------------ rows and cells

  /** Data rows, excluding the single "No results." row an empty grid renders. */
  @step('Count the entries in the History list')
  async getHistoryRowCount(): Promise<number> {
    if (await this.isTableEmpty()) return 0;
    return this.getDataRowCount();
  }

  /**
   * A row count that has HELD across consecutive polls. A zero that is not the empty state is the
   * remount window, not an answer, so it re-settles instead of returning.
   */
  @step('Count the entries once the count has stopped changing')
  async getStableHistoryRowCount(timeoutMs = 20_000, stablePolls = 3): Promise<number> {
    const deadline = Date.now() + timeoutMs;
    let last = -1;
    let repeats = 0;
    while (Date.now() < deadline) {
      const count = await this.getHistoryRowCount();
      if (count === 0 && !(await this.isTableEmpty())) {
        await this.waitForHistoryGridLoaded(Math.max(1_000, deadline - Date.now()));
        last = -1;
        repeats = 0;
        continue;
      }
      if (count === last) {
        if (++repeats >= stablePolls) return count;
      } else {
        last = count;
        repeats = 1;
      }
      await this.page.waitForTimeout(200);
    }
    return this.getHistoryRowCount();
  }

  @step('Count the cells in each entry, to spot short or long rows')
  async getRowCellCounts(maxRows = 20): Promise<number[]> {
    return this.getElement('tblMgmtHistory').locator('table tbody tr').evaluateAll(
      (rows, max) => rows.slice(0, max).map(r => r.querySelectorAll('td').length), maxRows);
  }

  /** Every cell of the first `maxRows` rows, in one browser round trip. */
  @step('Read the whole visible list, entry by entry')
  async getCellMatrix(maxRows = 10): Promise<string[][]> {
    if (await this.isTableEmpty()) return [];
    return this.getElement('tblMgmtHistory').locator('table tbody tr').evaluateAll(
      (rows, max) => rows.slice(0, max).map(r =>
        Array.from(r.querySelectorAll('td')).map(td => (td.textContent || '').trim())), maxRows);
  }

  /** One column's cells top-down; the index is resolved once, not per row. */
  @step('Read every value down one column')
  async getColumnValues(headerText: string, maxRows = 20): Promise<string[]> {
    const headers = await this.getColumnHeaders();
    const colIndex = headers.indexOf(headerText);
    if (colIndex === -1) throw new Error(`Column "${headerText}" not found. Live headers: ${headers.join(' | ')}`);
    const matrix = await this.getCellMatrix(maxRows);
    return matrix.map(row => row[colIndex] ?? '');
  }

  /** The newest-first top row, read only once two consecutive reads agree and it carries its audit stamp. */
  @step('Read the top entry once it has stopped changing')
  async readSettledTopRow(headers: string[], attempts = 6): Promise<Record<string, string>> {
    let previous = '';
    let row: Record<string, string> = {};
    for (let attempt = 0; attempt < attempts; attempt++) {
      row = await this.getRowValues(0, headers);
      const stamped = (row['Modified On'] ?? '') !== '' && (row['Modified By'] ?? '') !== '';
      const fingerprint = JSON.stringify(row);
      if (stamped && attempt > 0 && fingerprint === previous) return row;
      previous = stamped ? fingerprint : '';
      await this.page.waitForTimeout(400);
    }
    return row;
  }

  @step('Count the column headings a screen reader can find')
  async getColumnHeaderRoleCount(): Promise<number> {
    return this.getElement('tblMgmtHistory').getByRole('columnheader').count();
  }

  // ------------------------------------------------------------------ sorting

  @step('List the columns that can be sorted')
  async getSortableColumns(): Promise<string[]> {
    return this.getElement('tblMgmtHistory').locator('th').evaluateAll(ths =>
      ths.filter(th => th.querySelector('button')).map(th => (th.textContent || '').trim()));
  }

  /** Accessible name of every header sort control — aria-label when present, else its text. */
  @step('Read the names of the sort controls')
  async getSortControlNames(): Promise<string[]> {
    return this.getElement('tblMgmtHistory').locator('th button').evaluateAll(btns =>
      btns.map(b => (b.getAttribute('aria-label') || b.textContent || '').trim()));
  }

  /**
   * Every header's sort state from its lucide icon, by index: arrow-up = ascending, arrow-down =
   * descending, arrow-up-down = sortable but unsorted, no svg = not sortable. aria-sort is never
   * set by this grid. Matched as exact class TOKENS — "lucide-arrow-up-down" contains
   * "lucide-arrow-up", so a substring test would report every unsorted column as ascending.
   */
  private async sortIndicators(): Promise<HistorySortState[]> {
    return this.getElement('tblMgmtHistory').locator('th').evaluateAll(ths => ths.map(th => {
      const tokens = Array.from(th.querySelectorAll('svg'))
        .flatMap(svg => (svg.getAttribute('class') || '').split(/\s+/));
      if (tokens.includes('lucide-arrow-up')) return 'ascending' as const;
      if (tokens.includes('lucide-arrow-down')) return 'descending' as const;
      return 'none' as const;
    }));
  }

  @step('Read the sort arrow shown on a column')
  async getSortIndicator(headerText: string): Promise<HistorySortState> {
    const headers = await this.getColumnHeaders();
    const index = headers.indexOf(headerText);
    if (index === -1) throw new Error(`Column "${headerText}" not found`);
    const state = (await this.sortIndicators())[index];
    if (state === undefined) throw new Error(`Sort indicator for "${headerText}" (column ${index}) could not be read`);
    return state;
  }

  /** Indexes of every column currently showing a direction — the "one column at a time" oracle. */
  @step('Find which columns are currently showing a sort arrow')
  async getSortedColumnIndexes(): Promise<number[]> {
    return (await this.sortIndicators()).reduce<number[]>((acc, state, i) => {
      if (state !== 'none') acc.push(i);
      return acc;
    }, []);
  }

  /** Raw aria-sort of every header — recorded as the accessibility gap, never gated on. */
  @step('Read the sort direction announced to screen readers')
  async getAriaSortValues(): Promise<Array<string | null>> {
    return this.getElement('tblMgmtHistory').locator('th').evaluateAll(ths =>
      ths.map(th => th.getAttribute('aria-sort')));
  }

  /** Waits for a column's icon to show the requested direction — the re-render trails the menu click. */
  @step('Sort the list by a column and wait for the arrow to follow')
  async sortColumnAndSettle(headerText: string, direction: HistorySortDirection): Promise<void> {
    await this.clickSortColumn(headerText, direction);
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      if ((await this.getSortIndicator(headerText).catch(() => 'none')) === direction) break;
      await this.page.waitForTimeout(200);
    }
    await this.waitForHistoryGridLoaded();
  }

  /**
   * Runs `action` and returns the JSON body of every history POST it issued. This is how the
   * server-side sort contract (sortBy / sortDescending) is observed rather than assumed.
   */
  @step('Record what the page asks the server for')
  async captureHistoryRequests(action: () => Promise<void>): Promise<HistoryRequestBody[]> {
    const bodies: HistoryRequestBody[] = [];
    const handler = (req: import('@playwright/test').Request) => {
      if (!HISTORY_API_URL_PATTERN.test(req.url())) return;
      try {
        bodies.push((req.postDataJSON() ?? {}) as HistoryRequestBody);
      } catch {
        bodies.push({});
      }
    };
    this.page.on('request', handler);
    try {
      await action();
      await this.waitForHistoryGridLoaded();
    } finally {
      this.page.off('request', handler);
    }
    return bodies;
  }

  // ------------------------------------------------------------------ keyboard

  @step('Open the sort menu for a column using only the keyboard')
  async openSortMenuByKeyboard(headerText: string): Promise<boolean> {
    const headers = await this.getColumnHeaders();
    const btn = this.getElement('tblMgmtHistory').locator('th').nth(headers.indexOf(headerText)).locator('button').first();
    if ((await btn.count()) === 0) return false;
    const menu = this.page.locator('[role="menu"]').first();
    // The same intermittent Radix open failure clickSortColumn retries for: try up to 3 times.
    for (let attempt = 1; attempt <= 3; attempt++) {
      await btn.focus();
      await this.page.keyboard.press('Enter');
      if (await menu.waitFor({ state: 'visible', timeout: 3_000 }).then(() => true).catch(() => false)) return true;
      await this.page.keyboard.press('Escape').catch(() => {});
      await this.page.waitForTimeout(300);
    }
    return false;
  }

  @step('Read the choices offered in the sort menu')
  async getSortMenuItemLabels(): Promise<string[]> {
    const menu = this.page.locator('[role="menu"]').first();
    if (!(await menu.isVisible().catch(() => false))) return [];
    return (await menu.locator('[role="menuitem"]').allTextContents()).map(t => t.trim());
  }

  /** ArrowDown x n + Enter, so the whole flow stays keyboard-only. */
  @step('Choose a sort option using only the keyboard')
  async applySortMenuItemByKeyboard(steps = 1): Promise<void> {
    const menu = this.page.locator('[role="menu"]').first();
    for (let i = 0; i < steps; i++) await this.page.keyboard.press('ArrowDown');
    await this.page.keyboard.press('Enter');
    await menu.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
    await this.waitForAngularStable();
    await this.waitForHistoryGridLoaded();
  }

  @step('Close the sort menu with the Escape key')
  async closeSortMenuWithEscape(): Promise<boolean> {
    const menu = this.page.locator('[role="menu"]').first();
    await this.page.keyboard.press('Escape');
    return menu.waitFor({ state: 'hidden', timeout: 5_000 }).then(() => true).catch(() => false);
  }

  // ------------------------------------------------------------------ read-only probes

  /**
   * Buttons are counted across the panel by exact accessible text (a substring "Save" would match a
   * column label); editors are counted inside the nested <table> only, because the wrapper also
   * holds the paginator's page-number input.
   */
  @step('Take stock of every button and box on the History panel')
  async getPanelControlCensus(): Promise<HistoryControlCensus> {
    const panel = this.getElement('tabContentMgmtHistory');
    const table = panel.locator('table').first();
    const actionPattern = /^(add|add new|new|edit|delete|remove|save)$/i;
    const actionButtonLabels = (await panel.locator('button').allTextContents())
      .map(t => t.trim()).filter(t => actionPattern.test(t));
    return {
      actionButtonCount: actionButtonLabels.length,
      actionButtonLabels,
      checkboxCount: await table.locator('input[type="checkbox"]').count(),
      radioCount: await table.locator('input[type="radio"]').count(),
      ariaCheckboxCount: await table.locator('[role="checkbox"]').count(),
      inputCount: await table.locator('input:not([type="hidden"])').count(),
      textareaCount: await table.locator('textarea').count(),
      selectCount: await table.locator('select').count(),
      contentEditableCount: await table.locator('[contenteditable="true"]').count(),
    };
  }

  @step('Try to type into a cell, to prove it cannot be changed')
  async attemptEditCell(rowIndex = 0, colIndex = 0): Promise<{ editorCount: number; textBefore: string; textAfter: string }> {
    const cell = this.getElement('tblMgmtHistory').locator('tbody tr').nth(rowIndex).locator('td').nth(colIndex);
    const textBefore = ((await cell.textContent()) || '').trim();
    await cell.click();
    await cell.dblclick();
    await this.page.waitForTimeout(300); // let any editor the grid intends to open actually render
    return {
      editorCount: await cell.locator('input, textarea, [contenteditable="true"]').count(),
      textBefore,
      textAfter: ((await cell.textContent()) || '').trim(),
    };
  }

  @step('Check whether an entry looks selected')
  async isRowSelected(rowIndex = 0): Promise<boolean> {
    const row = this.getElement('tblMgmtHistory').locator('tbody tr').nth(rowIndex);
    const ariaSelected = await row.getAttribute('aria-selected').catch(() => null);
    const dataState = await row.getAttribute('data-state').catch(() => null);
    return ariaSelected === 'true' || dataState === 'selected';
  }

  @step('Right-click an entry to see whether a menu appears')
  async rightClickRow(rowIndex = 0): Promise<boolean> {
    await this.getElement('tblMgmtHistory').locator('tbody tr').nth(rowIndex).click({ button: 'right' });
    const menu = this.page.locator('[role="menu"]').first();
    const appeared = await menu.waitFor({ state: 'visible', timeout: 2_000 }).then(() => true).catch(() => false);
    if (appeared) {
      await this.page.keyboard.press('Escape').catch(() => {});
      await menu.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => {});
    }
    return appeared;
  }

  /** Links or buttons in the panel that would lead to the separate Local Office Settings module. */
  @step('Look for any link from this tab to Local Office Settings')
  async getLocalOfficeSettingsLinkCount(): Promise<number> {
    return this.getElement('tabContentMgmtHistory').locator('a[href*="settings/local-office"]').count();
  }

  // ------------------------------------------------------------------ loading / layout

  @step('Check whether the list is still loading')
  async getPendingState(): Promise<HistoryPendingState> {
    const panel = this.getElement('tabContentMgmtHistory');
    const table = this.getElement('tblMgmtHistory');
    const tableExists = (await table.count()) > 0;
    return {
      spinnerCount: await panel.locator('[role="progressbar"], .animate-spin, [data-testid*="spinner"], [data-testid*="loader"]').count(),
      skeletonCount: await panel.locator('[data-testid*="skeleton"], .animate-pulse, [class*="skeleton"]').count(),
      dataRowCount: tableExists && !(await this.isTableEmpty()) ? await this.getDataRowCount() : 0,
      emptyStateShown: tableExists ? await this.isTableEmpty() : false,
    };
  }

  /** An 87-column grid must scroll inside its own container, never widen the page. */
  @step('Measure how the wide list fits inside the page')
  async getOverflow(): Promise<HistoryOverflow> {
    const pageOverflowPx = await this.page.evaluate(() => {
      const root = document.documentElement;
      return Math.max(0, root.scrollWidth - root.clientWidth);
    });
    // The table sits inside a scroll-area viewport a few levels up, not in its direct parent, so walk
    // up to the panel looking for the ancestor narrower than the table — that one absorbs the width.
    const containerScrollsHorizontally = await this.getElement('tabContentMgmtHistory').locator('table').first()
      .evaluate((table) => {
        const panel = table.closest('[data-testid="location-settings-tab-content-management-history"]');
        for (let el = table.parentElement; el && el !== panel; el = el.parentElement) {
          if (el.clientWidth > 0 && table.scrollWidth > el.clientWidth + 1) return true;
        }
        return false;
      });
    return { pageOverflowPx, containerScrollsHorizontally };
  }

  @step('Resize the browser window')
  async resizeViewport(width: number, height: number): Promise<void> {
    await this.page.setViewportSize({ width, height });
    await this.waitForAngularStable();
  }

  @step('Count the page navigation buttons')
  async getPaginationButtonCount(): Promise<number> {
    return this.getElement('tabContentMgmtHistory').locator('button[aria-label*="page"]').count();
  }

  // ------------------------------------------------------------------ history type selector / legacy grid

  @step('Read the history type currently chosen')
  async getHistoryTypeValue(): Promise<string> {
    return ((await this.getElement('drpHistoryType').textContent()) || '').trim();
  }

  @step('Read the history types on offer')
  async getHistoryTypeOptions(): Promise<string[]> {
    return this.getComboboxOptions('drpHistoryType');
  }

  /** Switches type and waits for WHICHEVER grid it renders — Legacy has no tagged table to wait on. */
  @step('Choose a history type')
  async selectHistoryType(optionText: string): Promise<void> {
    await this.selectComboboxOption('drpHistoryType', optionText, { exact: true });
    await this.waitForAngularStable();
    await this.waitForEitherHistoryGrid();
  }

  /**
   * Which grid is showing. The standard grid is the tagged wrapper; the Legacy grid is the panel's
   * one table while that wrapper is absent from the DOM.
   */
  @step('Work out which version of the History list is showing')
  async getActiveHistoryGrid(): Promise<HistoryGridKind> {
    if ((await this.getElement('tblMgmtHistory').count()) > 0) return 'standard';
    if (await this.getElement('tblAnyMgmtHistory').first().isVisible().catch(() => false)) return 'legacy';
    return 'none';
  }

  @step('Wait for either version of the History list to appear')
  async waitForEitherHistoryGrid(timeoutMs = 30_000): Promise<HistoryGridKind> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const active = await this.getActiveHistoryGrid();
      if (active === 'standard') {
        await this.waitForHistoryGridLoaded(Math.max(1_000, deadline - Date.now()));
        return active;
      }
      if (active === 'legacy' && (await this.getElement('tblAnyMgmtHistory').locator('tbody tr').count()) > 0) {
        return active;
      }
      await this.page.waitForTimeout(200);
    }
    throw new Error(`Neither the standard nor the legacy history grid rendered within ${timeoutMs}ms`);
  }

  /** Must resolve to exactly one table — the fallback is only safe while the panel holds one. */
  @step('Count the tables the active History list could be')
  async getActiveTableCandidateCount(): Promise<number> {
    return this.getElement('tblAnyMgmtHistory').count();
  }

  @step('Read the column headings on whichever History list is showing')
  async getActiveGridHeaders(): Promise<string[]> {
    return (await this.getElement('tblAnyMgmtHistory').first().locator('th').allTextContents()).map(t => t.trim());
  }

  @step('List the sortable columns on whichever History list is showing')
  async getActiveGridSortableColumns(): Promise<string[]> {
    return this.getElement('tblAnyMgmtHistory').first().locator('th').evaluateAll(ths =>
      ths.filter(th => th.querySelector('button')).map(th => (th.textContent || '').trim()));
  }

  @step('Count the entries on whichever History list is showing')
  async getActiveGridRowCount(): Promise<number> {
    return this.getElement('tblAnyMgmtHistory').first().locator('tbody tr').count();
  }

  @step('Count the boxes to type in on whichever History list is showing')
  async getActiveGridEditorCount(): Promise<number> {
    return this.getElement('tblAnyMgmtHistory').first()
      .locator('input:not([type="hidden"]), textarea, select, [contenteditable="true"]').count();
  }

  @step('Check whether the page-number box is offered')
  async isPageInputPresent(): Promise<boolean> {
    return (await this.getElement('txtMgmtHistoryCurrentPage').count()) > 0;
  }

  // ------------------------------------------------------------------ paginator page-number input

  @step('Inspect the page-number box and how it is set up')
  async getPageInputAttributes(): Promise<Record<string, string | number | boolean | null>> {
    return this.getElement('txtMgmtHistoryCurrentPage').evaluate((el) => {
      const input = el as HTMLInputElement;
      return {
        typeAttr: input.getAttribute('type'),
        min: input.getAttribute('min'),
        max: input.getAttribute('max'),
        maxLength: input.getAttribute('maxlength'),
        required: input.required,
        inputMode: input.getAttribute('inputmode'),
        pattern: input.getAttribute('pattern'),
        ariaInvalid: input.getAttribute('aria-invalid'),
      };
    });
  }

  /**
   * Types into the page box and commits with Enter, returning what it settled on. Keystrokes, not
   * fill(): the box filters per keystroke via pattern="[0-9]*", which fill() would bypass.
   */
  @step('Type a page number into the box')
  async setPageNumber(value: string): Promise<string> {
    const input = this.getElement('txtMgmtHistoryCurrentPage');
    await input.click();
    await this.page.keyboard.press('Control+a');
    await this.page.keyboard.press('Backspace');
    if (value !== '') await input.pressSequentially(value, { delay: 20 });
    await this.page.keyboard.press('Enter');
    await this.waitForAngularStable();
    await this.waitForHistoryGridLoaded();
    return (await input.inputValue()).trim();
  }

  @step('Read which page of results is showing')
  async getPageIndicator(): Promise<HistoryPageIndicator> {
    const text = await this.getPaginationText();
    const match = text.match(/(\d+)\s*\/\s*(\d+)/);
    return { current: parseInt(match?.[1] ?? '0', 10), total: parseInt(match?.[2] ?? '0', 10) };
  }

  /** Clicking a DISABLED paginator button waits out the action timeout, so cleanup must check first. */
  @step('Go back to the first page if we are not already there')
  async goToFirstPageIfNeeded(): Promise<void> {
    if ((await this.getElement('btnMgmtHistoryFirstPage').count()) === 0) return;
    if (await this.isPaginationButtonDisabled('first')) return;
    await this.clickPaginationButton('first');
  }

  // ------------------------------------------------------------------ parsing

  /** "USD: 1.5; CAD: ; MXN: 2" -> { USD: '1.5', CAD: '', MXN: '2' }. Null when the cell is not that shape. */
  static parseCompositeCurrencyCell(text: string): Record<string, string> | null {
    const parts = text.split(';').map(p => p.trim()).filter(p => p !== '');
    const out: Record<string, string> = {};
    for (const part of parts) {
      const at = part.indexOf(':');
      if (at === -1) return null;
      out[part.slice(0, at).trim()] = part.slice(at + 1).trim();
    }
    return Object.keys(out).length ? out : null;
  }

  // Date.UTC for the same reason as parseModifiedOnMs: the grid renders dates with no TZ suffix.
  static parseDateOnlyMs(val: string): number {
    const [m, d, y] = val.trim().split('/').map(Number);
    if (!Number.isFinite(m) || !Number.isFinite(d) || !Number.isFinite(y)) return NaN;
    return Date.UTC(y!, m! - 1, d!);
  }

  // ------------------------------------------------------------------ settings save-and-check (audit completeness)

  /** Opens Location Settings fresh and, when given, one of Basic Information's sub-tabs. */
  @step('Open a Location Settings tab')
  async openSettingsTab(subTab: string | null, officeNo = '1604'): Promise<void> {
    await this.openLocationSettings(officeNo);
    await this.waitForSettingsLoaded();
    if (subTab) {
      await this.page.getByRole('tab', { name: subTab, exact: true }).click();
      await this.waitForAngularStable();
      await this.page.waitForTimeout(2_000); // sub-tab data lands after Angular reports stable
    }
  }

  /**
   * Waits until the form's lookup values (Country, Region, Tax Mode) have rendered. A save made
   * before they load is accepted, but omits countryName / regionName / taxModeName / billingCycle,
   * so its History entry shows those settings blank although the location itself is unchanged
   * (confirmed live 2026-09-25, reports/walk-coverage/probes/mgh-early-save.2026-09-25.json).
   */
  @step('Wait for the Location Settings form to finish loading')
  async waitForSettingsLoaded(timeoutMs = 60_000): Promise<void> {
    await this.page.locator('[data-testid="location-settings-input-location-name"]').waitFor({ timeout: timeoutMs });
    await this.page.waitForFunction(() => {
      const text = (sel: string) => (document.querySelector(sel)?.textContent || '').trim();
      const taxMode = Array.from(document.querySelectorAll('label'))
        .find(l => (l.textContent || '').trim() === 'Tax Mode')?.parentElement?.querySelector('button[role="combobox"]');
      return text('[data-testid="location-settings-select-country"]') !== ''
        && text('[data-testid="location-settings-select-region"]') !== ''
        && (taxMode?.textContent || '').trim() !== '';
    }, undefined, { timeout: timeoutMs });
    await this.waitForAngularStable();
  }

  /** Reads a setting: 'true'/'false' for a checkbox, the label for a dropdown or radio, the text otherwise. */
  @step('Read a setting')
  async readSetting(selector: string, kind: SettingKind): Promise<string> {
    const el = this.page.locator(selector).first();
    if (kind === 'checkbox') return (await el.getAttribute('aria-checked')) === 'true' ? 'true' : 'false';
    if (kind === 'radio') {
      // testid-audit: ignore -- state query: the checked radio inside the caller's testid-scoped radiogroup
      const checked = el.locator('[role="radio"][data-state="checked"]');
      return (await checked.getAttribute('value')) === 'true' ? 'Master' : 'Direct';
    }
    if (kind === 'dropdown') return ((await el.textContent()) || '').trim();
    if (kind === 'note') return String(await this.page.locator(selector).count());
    return (await el.inputValue()).trim();
  }

  @step('Read the choices a dropdown setting offers')
  async getSettingOptions(selector: string): Promise<string[]> {
    const el = this.page.locator(selector).first();
    const listbox = this.page.locator('[role="listbox"]');
    // Radix opens on pointerdown and the following click can close it again, so retry once.
    await el.click();
    if (!(await listbox.waitFor({ state: 'visible', timeout: 3_000 }).then(() => true).catch(() => false))) {
      await this.page.keyboard.press('Escape').catch(() => {});
      await el.click();
      await listbox.waitFor({ state: 'visible', timeout: 5_000 });
    }
    const options = (await listbox.locator('[role="option"]').allTextContents()).map(t => t.trim()).filter(Boolean);
    await this.page.keyboard.press('Escape');
    await listbox.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => {});
    return options;
  }

  /**
   * Sets a setting by real interaction. Text and percentage inputs are typed key by key, never
   * filled: the percentage box takes a decimal fraction (0.50 = 50%) and formats on blur.
   */
  @step('Change a setting')
  async writeSetting(selector: string, kind: SettingKind, value: string): Promise<void> {
    const el = this.page.locator(selector).first();
    if (kind === 'checkbox') {
      if ((await this.readSetting(selector, kind)) !== value) await el.click();
      return;
    }
    if (kind === 'radio') {
      // testid-audit: ignore -- role + semantic value inside the caller's testid-scoped radiogroup
      await el.locator(`[role="radio"][value="${value === 'Master' ? 'true' : 'false'}"]`).click();
      return;
    }
    if (kind === 'dropdown') {
      // Radix option clicks are flaky on long lists (the listbox can close or re-render between
      // open and click), so retry: Escape, reopen, scroll the option into view, click.
      const listbox = this.page.locator('[role="listbox"]');
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          await el.click();
          await listbox.waitFor({ state: 'visible', timeout: 5_000 });
          const option = listbox.getByRole('option', { name: value, exact: true });
          await option.scrollIntoViewIfNeeded({ timeout: 3_000 });
          await option.click({ timeout: 5_000 });
          return;
        } catch (err) {
          if (attempt === 3) throw err;
          await this.page.keyboard.press('Escape').catch(() => {});
          await listbox.waitFor({ state: 'hidden', timeout: 2_000 }).catch(() => {});
        }
      }
    }
    if (kind === 'note') {
      await this.page.locator('[data-testid="location-settings-btn-add-note"]').click();
      const area = this.page.locator(selector).last();
      await area.waitFor({ state: 'visible', timeout: 5_000 });
      await area.pressSequentially(value, { delay: 15 });
      await area.press('Tab');
      return;
    }
    const typed = kind === 'percent' && /%$/.test(value) ? String(parseFloat(value) / 100) : value;
    await el.click();
    await el.press('Control+a');
    await el.press('Delete');
    await el.pressSequentially(typed, { delay: 20 });
    await el.press('Tab');
  }

  /** Removes the newest note — the restore for a note added by writeSetting(). */
  @step('Delete the newest note')
  async deleteNewestNote(): Promise<void> {
    await this.page.locator('[data-testid="location-settings-section-notes"] button:has-text("Delete")').last().click();
  }

  /** The shared Location Settings Save + "Save Changes" confirmation. saved=false when Save never enabled. */
  @step('Save the settings')
  async saveSettings(): Promise<{ success: boolean; saved?: boolean; networkError?: string }> {
    const btn = this.getElement('btnSave');
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline && await btn.isDisabled()) await this.page.waitForTimeout(250);
    const response = this.waitForSaveResponse();
    const result = await this.clickSaveWithDialog('btnSave', 'dlgSaveChanges', 'btnSaveChangesConfirm');
    if (!result.saved) return result;
    // clickSaveWithDialog can return before the save request completes (waitForAngularStable is a
    // no-op on this Next.js app), and navigating then aborts the save. Wait for the server's answer.
    const res = await response;
    if (!res) return { success: false, saved: false, networkError: 'no save response within 30s' };
    return res.ok() ? result : { success: false, saved: false, networkError: `${res.status()} ${res.url()}` };
  }

  /** True for the server's reply to a Location Settings save (settings PUT, pricebook upsert). */
  static isLocationSaveResponse(res: import('@playwright/test').Response): boolean {
    const req = res.request();
    return req.method() !== 'GET' && /\/navigator\/api\/location\//.test(res.url()) && !/\/get-/.test(res.url());
  }

  /** Resolves with the next Location Settings save response, or null after 30s. Start it BEFORE saving. */
  waitForSaveResponse(): Promise<import('@playwright/test').Response | null> {
    return this.page.waitForResponse(r => LocationManagementHistoryPage.isLocationSaveResponse(r), { timeout: 30_000 })
      .catch(() => null);
  }

  /**
   * The office's Local Office Name as the SERVER holds it (newest History record, a full snapshot).
   * Read this rather than the form to prove a restore: a form read straight after a save can show
   * the value from before a save that the navigation cut off.
   */
  @step('Read the stored Local Office Name from the server')
  async getStoredLocalOfficeName(officeNo = '1604'): Promise<string> {
    return this.page.evaluate(async (no) => {
      const r = await fetch('/navigator/api/location/get-location-setting-history', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ locationNo: no, isCorporate: true, page: 1, pageSize: 1, sortBy: 'ModDate', sortDescending: true }),
      });
      const body = await r.json();
      return String(body?.data?.history?.[0]?.locationName ?? '');
    }, officeNo);
  }

  /**
   * The two newest History entries as header -> value maps. A repeated header (the second
   * "Currency") is keyed "Currency (2)" so both are kept.
   */
  @step('Read the two newest History entries')
  async readNewestHistoryEntries(officeNo = '1604', newerThan?: string): Promise<[Record<string, string>, Record<string, string>]> {
    // With `newerThan` (a Modified On read before a save), wait until the grid shows an entry newer
    // than it: read straight after a save, the grid can still be showing the previous entry.
    const deadline = Date.now() + 30_000;
    for (;;) {
      await this.openHistoryTab(officeNo);
      const rows = await this.readTopHistoryRows();
      const isNewer = !newerThan || LocationManagementHistoryPage.parseModifiedOnMs(rows[0]['Modified On'] ?? '')
        > LocationManagementHistoryPage.parseModifiedOnMs(newerThan);
      if (isNewer || Date.now() > deadline) return rows;
      await this.returnToBasicInformation();
      await this.page.waitForTimeout(2_000);
    }
  }

  private async readTopHistoryRows(): Promise<[Record<string, string>, Record<string, string>]> {
    const rows = await this.getElement('tblMgmtHistory').locator('table').evaluate((table) => {
      const headers = Array.from(table.querySelectorAll('th')).map(h => (h.textContent || '').trim());
      return Array.from(table.querySelectorAll('tbody tr')).slice(0, 2).map((tr) => {
        const cells = Array.from(tr.querySelectorAll('td')).map(td => (td.textContent || '').trim());
        const row: Record<string, string> = {};
        headers.forEach((h, i) => { row[headers.indexOf(h) === i ? h : `${h} (2)`] = cells[i] ?? ''; });
        return row;
      });
    });
    return [rows[0] ?? {}, rows[1] ?? {}];
  }

  /** data-testid of every visible, editable-looking control in the current Location Settings view. */
  @step('List the controls on a Location Settings tab')
  async getSettingsControlTestIds(subTab: string | null): Promise<string[]> {
    const scope = subTab ? '[role="tabpanel"] [role="tabpanel"][data-state="active"]' : '[role="tabpanel"]';
    return this.page.locator(scope).first().evaluate((root, isSubTab) => {
      const sel = 'input:not([type="hidden"]), textarea, button[role="combobox"], button[role="checkbox"], [role="radiogroup"], button[aria-haspopup="dialog"]';
      return Array.from(root.querySelectorAll(sel))
        .filter(el => (el as HTMLElement).offsetParent !== null)
        .filter(el => isSubTab || !el.closest('[role="tabpanel"] [role="tabpanel"]'))
        .map(el => el.getAttribute('data-testid') || '')
        .filter(Boolean);
    }, Boolean(subTab));
  }

  // ------------------------------------------------------------------ restore helpers

  /**
   * Cheap attempt at the default view: fixes type, page, rows-per-page and sort in place, in that
   * order (an out-of-order fix can undo an earlier one — e.g. changing rows-per-page can reset the
   * page). Returns whether every piece actually landed, so the caller can fall back to a reload.
   */
  private async tryRestoreDefaultViewInPlace(): Promise<boolean> {
    if ((await this.getActiveHistoryGrid()) !== 'standard') {
      await this.selectHistoryType(HISTORY_TYPES.standard);
    }
    await this.goToFirstPageIfNeeded();
    if ((await this.getRowsPerPageValue()) !== DEFAULT_ROWS_PER_PAGE) {
      await this.setRowsPerPage(DEFAULT_ROWS_PER_PAGE);
    }
    if ((await this.getSortIndicator('Modified On')) !== 'descending' || (await this.getSortedColumnIndexes()).length !== 1) {
      await this.sortColumnAndSettle('Modified On', 'descending');
    }
    return (
      (await this.getActiveHistoryGrid()) === 'standard'
      && (await this.getRowsPerPageValue()) === DEFAULT_ROWS_PER_PAGE
      && (await this.getPageIndicator()).current === 1
      && (await this.getSortIndicator('Modified On')) === 'descending'
      && (await this.getSortedColumnIndexes()).length === 1
    );
  }

  /**
   * Puts the grid back into its default view: first page, 20 rows, standard type, default sort. Tries
   * the cheap in-place fix first (no navigation), and only pays for a full reload when that doesn't
   * actually settle into the default state — e.g. a stuck menu or a grid that won't leave Legacy.
   */
  @step('Put the History list back to how it starts')
  async restoreDefaultView(officeNo = '1604'): Promise<void> {
    if (this.page.isClosed()) return;
    Log.info('Restoring the History list to its default view');
    const settledInPlace = await this.tryRestoreDefaultViewInPlace().catch(() => false);
    if (settledInPlace) return;
    Log.warn('In-place restore did not settle into the default view — falling back to a full reload');
    await this.reloadAndNavigateToHistory(officeNo);
  }
}
