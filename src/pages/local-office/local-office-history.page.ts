import { Locator } from '@playwright/test';
import { LocalOfficeSettingsPage } from './local-office-settings.page';
import { LocalOfficeHistorySelectors, LocalOfficeSettingsSelectors, getTsSelector } from '../../selectors';
import { Log } from '../../utils/logger';
import { step } from '../../fixtures/step-decorator';

export type HistorySortDirection = 'ascending' | 'descending';
export type HistoryPageDirection = 'first' | 'previous' | 'next' | 'last';

/** What a boolean cell reads as when its lucide-check SVG is present. */
export const HISTORY_CHECK_GLYPH = '✔';

/** The literal empty-state copy the grid renders when the API returns no records. */
export const HISTORY_NO_RESULTS_TEXT = 'No results.';

/**
 * One pass over the history panel counting every affordance a read-only grid must NOT have.
 * Returned as a single object so a spec asserts the whole census in one `verify()` block instead
 * of making eight round trips.
 */
export interface HistoryControlCensus {
  /** Buttons in the panel whose accessible text is Add/New/Edit/Delete/Remove/Save. */
  actionButtonCount: number;
  /** Which of those were found — so a failure names the control instead of just a count. */
  actionButtonLabels: string[];
  saveButtonCount: number;
  /** Row-selection affordances inside the table. */
  checkboxCount: number;
  radioCount: number;
  ariaCheckboxCount: number;
  /** Inline editors inside the table. */
  inputCount: number;
  textareaCount: number;
  selectCount: number;
  contentEditableCount: number;
}

/** Snapshot of the panel while a history request is still in flight. */
export interface HistoryPendingState {
  spinnerCount: number;
  skeletonCount: number;
  dataRowCount: number;
  emptyStateShown: boolean;
}

export interface HistoryPageIndicator {
  current: number;
  total: number;
  raw: string;
}

export interface HistoryOverflow {
  /** How many px the document scrolls past its own client width. 0 (or 1, rounding) is correct. */
  pageOverflowPx: number;
  /** True when the grid container is the element absorbing the extra width. */
  containerScrollsHorizontally: boolean;
}

/** Result of matching NM-854's expected field list against the live header row. */
export interface HistoryColumnResolution {
  resolved: string[];
  missing: string[];
}

/**
 * Collapses a header label or a raw field key to a comparable token: lower-case, alphanumerics
 * only. "Holiday Multiplier", "Holiday multiplier" and "HolidayMultiplier" all become
 * "holidaymultiplier", so a column-presence assertion tests PRESENCE and never wording — which is
 * the only durable contract while NM-854's translated labels are still unconfirmed.
 */
function normalizeColumnToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export class LocalOfficeHistoryPage extends LocalOfficeSettingsPage {

  protected getElement(elementName: string): Locator {
    const selector = (LocalOfficeHistorySelectors as Record<string, string>)[elementName]
      ?? (LocalOfficeSettingsSelectors as Record<string, string>)[elementName]
      ?? getTsSelector(elementName);
    if (!selector) throw new Error(`Selector '${elementName}' not found in Local Office History, Settings, or global selectors`);
    return this.page.locator(selector);
  }

  // ------------------------------------------------------------------ navigation

  @step('Open the History tab')
  async navigateToHistoryTab(): Promise<void> {
    const tab = this.getElement('tabHistory');
    const isSelected = await tab.getAttribute('aria-selected').catch(() => null);
    if (isSelected !== 'true') {
      await tab.click();
      await this.waitForAngularStable();
      await this.dismissAlertDialogIfVisible();
    }
    await this.getElement('tblHistory').waitFor({ state: 'visible', timeout: 15_000 });
  }

 // Count-guarded like isOnBasicInfoTab/isOnEctTab: safe to call from a beforeEach before any
 // navigation has happened, when 'tabHistory' may not exist in the DOM at all.
  @step('Check whether the History tab is the one on screen')
  async isOnHistoryTab(): Promise<boolean> {
    const tab = this.getElement('tabHistory');
    if ((await tab.count()) === 0) return false;
    return (await tab.getAttribute('aria-selected').catch(() => null)) === 'true';
  }

 // safeNavigateTo, not navigateTo: a sibling tab may hold unsaved edits, which arms beforeunload.
  @step('Reload the page and open the History tab again')
  async reloadAndNavigateToHistory(officeNo = '1604'): Promise<void> {
    const baseUrl = this.config?.base_url || '';
    await this.safeNavigateTo(`${baseUrl.replace(/\/$/, '')}/locations/${officeNo}/settings/local-office`);
    await this.waitForAngularStable();
    await this.dismissAlertDialogIfVisible();
    await this.navigateToHistoryTab();
    await this.waitForHistoryGridLoaded();
  }

  @step('Read the names of the tabs along the top')
  async getTabStripLabels(): Promise<string[]> {
    const container = this.getElement('tabContainer');
    await container.waitFor({ state: 'visible', timeout: 30_000 });
    return (await container.locator('[role="tab"]').allTextContents()).map(t => t.trim());
  }

 /**
  * Polls until the grid has settled into one of its two legitimate resting states — at least one
  * DATA ROW, or the "No results." empty state.
  *
  * Settling on the header row instead is what made TC-LOE-HIST-002 flaky: on a tab re-entry the
  * grid is unmounted and remounted, and a sample taken in the window where the header row exists
  * but `tbody` has not been repopulated reads 42 headers and 0 rows, so a row-count comparison
  * against the pre-navigation baseline failed (expected 20, received 0) and only passed on retry.
  * Live timing measurements: a first open settles headers+rows together at ~1.3-1.9s, and a
  * re-entry at ~0.3s, so the window is narrow — which is exactly why it presented as flake rather
  * than as a consistent failure. Rows-or-empty closes it deterministically.
  */
  @step('Wait for the History list to finish loading')
  async waitForHistoryGridLoaded(timeoutMs = 30_000): Promise<void> {
    const table = this.getElement('tblHistory');
    await table.waitFor({ state: 'visible', timeout: timeoutMs });
    const deadline = Date.now() + timeoutMs;
    // A settled grid always has its header row. Requiring it first is what stops this returning
    // during the mount window, where th=0 and every column lookup throws "not found".
    let emptyPolls = 0;
    let readyPolls = 0;
    while (Date.now() < deadline) {
      if ((await table.locator('th').count()) > 0) {
        if ((await table.locator('tbody tr').count()) > 0) {
          // Confirm across two consecutive polls. A single observation can land mid-re-render —
          // after a full page reload the grid settles and then re-renders — so returning on the
          // first sighting is what left readers looking at an empty header row.
          if (++readyPolls >= 2) return;
          await this.page.waitForTimeout(200);
          continue;
        }
        readyPolls = 0;
        // A genuinely empty grid must HOLD that state across consecutive polls before it counts
        // as settled, so a transient empty render during a fetch is never mistaken for "no data".
        // (A "No results." flash could not be reproduced on a warm tab, but the hold costs
        // nothing and removes the whole class of false-empty reads.)
        if (await this.isHistoryTableEmpty()) {
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
    throw new Error(`History grid rendered neither a data row nor a stable "${HISTORY_NO_RESULTS_TEXT}" empty state within ${timeoutMs}ms`);
  }

 /** How many history tables exist in the panel — 2+ means the panel rendered a duplicate grid. */
  @step('Count how many History lists are on the page')
  async getHistoryTableCount(): Promise<number> {
    return this.getElement('tblHistory').count();
  }

  // ------------------------------------------------------------------ columns

  @step('Count the column headings on the History list')
  async getHistoryColumnHeaderCount(): Promise<number> {
    await this.ensureHistoryHeadersPresent('counting column headers');
    return this.getElement('tblHistory').locator('th').count();
  }

  @step('Read the column headings on the History list')
  async getHistoryColumnHeaders(): Promise<string[]> {
    const table = this.getElement('tblHistory');
    return (await table.locator('th').allTextContents()).map(t => t.trim());
  }

 /** Number of elements exposing the columnheader role — must equal the `th` count. */
  @step('Count the column headings a screen reader can find')
  async getHistoryColumnHeaderRoleCount(): Promise<number> {
    return this.getElement('tblHistory').getByRole('columnheader').count();
  }

 /**
  * Matches an expected NM-854 field list against the live header row, case- and
  * separator-insensitively. Returns both halves so the caller can assert on `missing` being empty
  * AND name the absent fields in its failure message.
  */
  @step('Match the expected columns against the ones on screen')
  async resolveHistoryColumns(expected: readonly string[]): Promise<HistoryColumnResolution> {
    const headerTokens = new Set((await this.getHistoryColumnHeaders()).map(normalizeColumnToken));
    const resolved: string[] = [];
    const missing: string[] = [];
    for (const field of expected) {
      if (headerTokens.has(normalizeColumnToken(field))) resolved.push(field);
      else missing.push(field);
    }
    return { resolved, missing };
  }

 /** Resolves one expected field to its live header label, or null when the column is absent. */
  @step('Find the column heading used for a given field')
  async findHistoryColumnLabel(expectedField: string): Promise<string | null> {
    const target = normalizeColumnToken(expectedField);
    const headers = await this.getHistoryColumnHeaders();
    return headers.find(h => normalizeColumnToken(h) === target) ?? null;
  }

 /**
  * Re-settles once when the header row is momentarily absent, and is called by EVERY reader that
  * depends on it.
  *
  * A one-shot settle can always be invalidated by a later re-render: after a full page reload the
  * grid settles and then re-renders, leaving a brief window with no `th` at all. Keeping the
  * self-heal in one shared place is what stops a reader that bypasses getHistoryColumnHeaders()
  * — historySortIndicators() reads `th` directly — from silently capturing an empty header row,
  * which is exactly how TC-LOE-HIST-019 kept failing after the warning had already fired.
  */
  private async ensureHistoryHeadersPresent(context: string): Promise<void> {
    if ((await this.getElement('tblHistory').locator('th').count()) > 0) return;
    Log.warn(`History header row was empty (${context}) — re-settling the grid`);
    await this.waitForHistoryGridLoaded();
  }

  private async historyColumnIndex(headerText: string): Promise<number> {
    await this.ensureHistoryHeadersPresent(`resolving "${headerText}"`);
    const headers = await this.getHistoryColumnHeaders();
    const exact = headers.indexOf(headerText);
    if (exact !== -1) return exact;
 // Fall back to the normalized match so a caller can pass an NM-854 field name directly.
    const target = normalizeColumnToken(headerText);
    const loose = headers.findIndex(h => normalizeColumnToken(h) === target);
    if (loose === -1) throw new Error(`Column "${headerText}" not found in Local Office history table. Live headers: ${headers.join(' | ')}`);
    return loose;
  }

  // ------------------------------------------------------------------ rows and cells

  @step('Check whether the History list is showing no entries')
  async isHistoryTableEmpty(): Promise<boolean> {
    const text = (await this.getElement('tblHistory').textContent() || '').trim();
    return text.includes(HISTORY_NO_RESULTS_TEXT);
  }

  @step('Read the message shown when there is no history to show')
  async getHistoryEmptyStateText(): Promise<string> {
    const table = this.getElement('tblHistory');
    const row = table.locator('tbody tr').first();
    if ((await row.count()) === 0) return '';
    return ((await row.textContent()) || '').trim();
  }

  @step('Count the entries in the History list')
  async getHistoryRowCount(): Promise<number> {
    if (await this.isHistoryTableEmpty()) return 0;
    return this.getElement('tblHistory').locator('tbody tr').count();
  }

 /** Cell count of each rendered row — any value differing from the header count is a cell shift. */
  @step('Count the cells in each entry, to spot short or long rows')
  async getHistoryRowCellCounts(maxRows = 20): Promise<number[]> {
    const rows = this.getElement('tblHistory').locator('tbody tr');
    const total = Math.min(await rows.count(), maxRows);
    const counts: number[] = [];
    for (let r = 0; r < total; r++) {
      counts.push(await rows.nth(r).locator('td').count());
    }
    return counts;
  }

 // Booleans render as lucide-check SVGs, so textContent is "" for both true and false —
 // an empty cell must be re-checked against innerHTML.
  private async readCell(rowIndex: number, colIndex: number): Promise<string> {
    const cell = this.getElement('tblHistory').locator('tbody tr').nth(rowIndex).locator('td').nth(colIndex);
    const text = (await cell.textContent() || '').trim();
    if (text === '') {
      const html = await cell.innerHTML();
      if (html.includes('lucide-check')) return HISTORY_CHECK_GLYPH;
    }
    return text;
  }

  @step('Read the value in one column for a single entry')
  async getHistoryColumnByHeader(rowIndex: number, headerText: string): Promise<string> {
    return this.readCell(rowIndex, await this.historyColumnIndex(headerText));
  }

 /** One column's cells top-down, boolean-aware. Index resolved once, not per row. */
  @step('Read every value down one column')
  async getHistoryColumnValues(headerText: string, maxRows = 20): Promise<string[]> {
    const colIndex = await this.historyColumnIndex(headerText);
    const rows = this.getElement('tblHistory').locator('tbody tr');
    const total = Math.min(await rows.count(), maxRows);
    const values: string[] = [];
    for (let r = 0; r < total; r++) values.push(await this.readCell(r, colIndex));
    return values;
  }

  @step('Read one entry in full, column by column')
  async getHistoryRowValues(rowIndex: number, headerTexts: string[]): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    for (const header of headerTexts) {
      result[header] = await this.getHistoryColumnByHeader(rowIndex, header);
    }
    return result;
  }

 /** Every cell of the first `maxRows` rows, boolean-aware — the input to placeholder-leak checks. */
  @step('Read the whole visible list, entry by entry')
  async getHistoryCellMatrix(maxRows = 10): Promise<string[][]> {
    const rows = this.getElement('tblHistory').locator('tbody tr');
    const totalRows = Math.min(await rows.count(), maxRows);
    const colCount = await this.getHistoryColumnHeaderCount();
    const matrix: string[][] = [];
    for (let r = 0; r < totalRows; r++) {
      const row: string[] = [];
      for (let c = 0; c < colCount; c++) row.push(await this.readCell(r, c));
      matrix.push(row);
    }
    return matrix;
  }

  // ------------------------------------------------------------------ sorting

  @step('Count the column headings that can be clicked to sort')
  async getHistorySortButtonCount(): Promise<number> {
    return this.getElement('tblHistory').locator('th button').count();
  }

 /** Accessible name of every header sort control — aria-label when present, else its text. */
  @step('Read the names of the sort controls')
  async getHistorySortControlNames(): Promise<string[]> {
    const buttons = this.getElement('tblHistory').locator('th button');
    const total = await buttons.count();
    const names: string[] = [];
    for (let i = 0; i < total; i++) {
      const btn = buttons.nth(i);
      const label = await btn.getAttribute('aria-label').catch(() => null);
      names.push((label || (await btn.textContent()) || '').trim());
    }
    return names;
  }

 /**
  * Header labels of every column carrying a sort control, in column order. One pass over the
  * header row — a per-column `isHistoryColumnSortable()` sweep across a 40+ column grid would be
  * 40 sequential round trips.
  */
  @step('List the columns that can be sorted')
  async getHistorySortableColumns(): Promise<string[]> {
    await this.ensureHistoryHeadersPresent('reading sortable columns');
    const headers = this.getElement('tblHistory').locator('th');
    const total = await headers.count();
    const sortable: string[] = [];
    for (let i = 0; i < total; i++) {
      const th = headers.nth(i);
      if ((await th.locator('button').count()) > 0) {
        sortable.push(((await th.textContent()) || '').trim());
      }
    }
    return sortable;
  }

  @step('Check whether one column can be sorted')
  async isHistoryColumnSortable(headerText: string): Promise<boolean> {
    const th = this.getElement('tblHistory').locator('th').nth(await this.historyColumnIndex(headerText));
    return (await th.locator('button').count()) > 0;
  }

 /** Column index of a header, resolved exactly then case/separator-insensitively. */
  @step('Find the position of a column')
  async getHistoryColumnIndex(headerText: string): Promise<number> {
    return this.historyColumnIndex(headerText);
  }

 /**
  * Reads every header's sort indicator in one pass: index -> 'ascending' | 'descending' | 'none'.
  *
  * The grid does NOT set `aria-sort` (confirmed live, before AND after sorting — see
  * getHistoryAriaSortAttribute below and the plan's documented accessibility discrepancy). It
  * communicates sort state ONLY through a lucide icon in the header's sort button:
  *   lucide-arrow-up        sorted ascending
  *   lucide-arrow-down      sorted descending
  *   lucide-arrow-up-down   sortable, currently unsorted
  *   (no svg)               not sortable
  *
  * Matched as EXACT class tokens, never substrings: 'lucide-arrow-up-down' contains the string
  * 'lucide-arrow-up', so substring matching would report every unsorted column as ascending.
  */
  private async historySortIndicators(): Promise<Array<'ascending' | 'descending' | 'none'>> {
    await this.ensureHistoryHeadersPresent('reading sort indicators');
    return this.getElement('tblHistory').locator('th').evaluateAll((ths) => ths.map((th) => {
      const tokens = Array.from(th.querySelectorAll('svg'))
        .flatMap((svg) => (svg.getAttribute('class') || '').split(/\s+/));
      if (tokens.includes('lucide-arrow-up')) return 'ascending' as const;
      if (tokens.includes('lucide-arrow-down')) return 'descending' as const;
      return 'none' as const;
    }));
  }

 /** Sort indicator of one column, resolved by index so a header's inner markup cannot mislead. */
  @step('Read the sort arrow shown on a column')
  async getHistorySortIndicator(headerText: string): Promise<string> {
    // Index FIRST: historyColumnIndex() carries the self-heal, so resolving it before reading the
    // indicators guarantees the header row is present for both calls. Reading the indicators first
    // is what let an empty header row return `indicators[41] ?? 'none'` — silently reporting "not
    // sorted" and failing TC-LOE-HIST-019 with Received: "none" instead of surfacing the race.
    const index = await this.historyColumnIndex(headerText);
    const indicators = await this.historySortIndicators();
    const state = indicators[index];
    if (state === undefined) {
      throw new Error(`Sort indicator for "${headerText}" (column ${index}) could not be read — the header row reported ${indicators.length} columns`);
    }
    return state;
  }

 /** Indexes of every column currently indicating a sort — the "only one at a time" oracle. */
  @step('Find which columns are currently showing a sort arrow')
  async getHistorySortedColumnIndexes(): Promise<number[]> {
    const indicators = await this.historySortIndicators();
    return indicators.reduce<number[]>((acc, state, i) => {
      if (state !== 'none') acc.push(i);
      return acc;
    }, []);
  }

 /** header label -> sort indicator. Diagnostic, attached to the report. */
  @step('Read the sort arrow on every column at once')
  async getHistorySortIndicatorStates(): Promise<Record<string, string>> {
    const headers = await this.getHistoryColumnHeaders();
    const indicators = await this.historySortIndicators();
    const states: Record<string, string> = {};
    headers.forEach((label, i) => { states[label || `column-${i}`] = indicators[i] ?? 'none'; });
    return states;
  }

 /**
  * The raw `aria-sort` attribute of one column, or null when absent.
  *
  * Exists to RECORD the accessibility gap, not to gate on it: NM-854 requires headers to
  * "communicate sort state" accessibly, and this grid never sets aria-sort in any state. That is
  * reported as a documented discrepancy for dev awareness rather than asserted, following the same
  * convention the Basic Information plan uses for its unimplemented cross-field validation matrix.
  */
  @step('Read the sort direction announced to screen readers')
  async getHistoryAriaSortAttribute(headerText: string): Promise<string | null> {
    const th = this.getElement('tblHistory').locator('th').nth(await this.historyColumnIndex(headerText));
    return th.getAttribute('aria-sort').catch(() => null);
  }

 // The Radix sort menu intermittently fails to open (same defect as the Locations history grid),
 // so retry up to 3 times with Escape between. It is a [role="menu"], not a combobox, so
 // selectComboboxOption does not apply.
  @step('Sort the list by a column')
  async sortHistoryColumn(headerText: string, direction: HistorySortDirection = 'ascending'): Promise<void> {
    const colIndex = await this.historyColumnIndex(headerText);
    const th = this.getElement('tblHistory').locator('th').nth(colIndex);
    const sortBtn = th.locator('button');
    if ((await sortBtn.count()) === 0) {
      throw new Error(`Column "${headerText}" is not sortable (no button element in its header)`);
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
        await this.page.keyboard.press('Escape').catch(() => {});
        await this.page.waitForTimeout(300);
      }
    }
    throw new Error(`sortHistoryColumn("${headerText}", "${direction}") failed after 3 attempts: ${String(lastErr)}`);
  }

  @step('Sort the list by Modified On, newest first')
  async sortHistoryByModifiedOnDesc(): Promise<void> {
    await this.sortHistoryColumn('Modified On', 'descending');
  }

 /**
  * Records every request URL issued while the sort is applied. NM-854 requires sorting to align
  * with backend-supported sort behavior, so the observable contract is "a request goes out" — the
  * captured URLs are attached to the report to pin down the parameter shape (open question 1).
  */
  @step('Record any calls the page makes to the server while sorting')
  async captureRequestsDuringSort(headerText: string, direction: HistorySortDirection): Promise<string[]> {
    const urls: string[] = [];
    const handler = (req: { url(): string }) => urls.push(req.url());
    this.page.on('request', handler);
    try {
      await this.sortHistoryColumn(headerText, direction);
      await this.waitForHistoryGridLoaded();
    } finally {
      this.page.off('request', handler);
    }
    return urls;
  }

  // ------------------------------------------------------------------ keyboard / accessibility

 /** Focuses a column's sort control and opens its menu with Enter — no mouse involved. */
  @step('Open the sort menu for a column using only the keyboard')
  async openHistorySortMenuByKeyboard(headerText: string): Promise<boolean> {
    const th = this.getElement('tblHistory').locator('th').nth(await this.historyColumnIndex(headerText));
    const sortBtn = th.locator('button').first();
    if ((await sortBtn.count()) === 0) return false;
    await sortBtn.focus();
    await this.page.keyboard.press('Enter');
    return this.page.locator('[role="menu"]').first()
      .waitFor({ state: 'visible', timeout: 5_000 })
      .then(() => true).catch(() => false);
  }

  @step('Read the choices offered in the sort menu')
  async getSortMenuItemLabels(): Promise<string[]> {
    const menu = this.page.locator('[role="menu"]').first();
    if (!(await menu.isVisible().catch(() => false))) return [];
    return (await menu.locator('[role="menuitem"]').allTextContents()).map(t => t.trim());
  }

 /** Applies a sort menu item with ArrowDown x n + Enter, so the whole flow stays keyboard-only. */
  @step('Choose a sort option using only the keyboard')
  async applySortMenuItemByKeyboard(steps = 1): Promise<void> {
    const menu = this.page.locator('[role="menu"]').first();
    for (let i = 0; i < steps; i++) await this.page.keyboard.press('ArrowDown');
    await this.page.keyboard.press('Enter');
    await menu.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
    await this.waitForAngularStable();
  }

  @step('Close the sort menu with the Escape key')
  async closeSortMenuWithEscape(): Promise<boolean> {
    const menu = this.page.locator('[role="menu"]').first();
    await this.page.keyboard.press('Escape');
    return menu.waitFor({ state: 'hidden', timeout: 5_000 })
      .then(() => true).catch(() => false);
  }

  // ------------------------------------------------------------------ read-only probes

  @step('Check that nothing on the History tab can be edited')
  async isHistoryTabReadOnly(): Promise<boolean> {
    const panel = this.getElement('tabContentHistory');
    // Count inside tblHistory, not the panel: the paginator's page-number input is a sibling of
    // the table, and counting it would make a read-only tab look editable.
    const inputs = await this.getElement('tblHistory').locator('input:not([type="hidden"]), textarea').count();
    const saveBtn = await panel.locator('button:has-text("Save")').count();
    return inputs === 0 && saveBtn === 0;
  }

  @step('Take stock of every button and box on the History panel')
  async getHistoryPanelControlCensus(): Promise<HistoryControlCensus> {
    const panel = this.getElement('tabContentHistory');
    const table = this.getElement('tblHistory');

    // Accessible text, not a :has-text() selector: "Save" as a substring would also match a
    // paginator tooltip or a column label, and the census must not over-report.
    const actionPattern = /^(add|add new|new|edit|delete|remove|save)$/i;
    const buttonTexts = (await panel.locator('button').allTextContents()).map(t => t.trim());
    const actionButtonLabels = buttonTexts.filter(t => actionPattern.test(t));

    return {
      actionButtonCount: actionButtonLabels.length,
      actionButtonLabels,
      saveButtonCount: await panel.locator('button:has-text("Save")').count(),
      checkboxCount: await table.locator('input[type="checkbox"]').count(),
      radioCount: await table.locator('input[type="radio"]').count(),
      ariaCheckboxCount: await table.locator('[role="checkbox"]').count(),
      inputCount: await table.locator('input:not([type="hidden"])').count(),
      textareaCount: await table.locator('textarea').count(),
      selectCount: await table.locator('select').count(),
      contentEditableCount: await table.locator('[contenteditable="true"]').count(),
    };
  }

 /**
  * Clicks then double-clicks the given cell and reports whether an editor appeared and whether the
  * text changed. Returns a snapshot rather than a bare boolean so a spec can assert both halves of
  * the read-only contract in one named `verify()`.
  */
  @step('Try to type into a cell, to prove it cannot be changed')
  async attemptEditHistoryCell(rowIndex = 0, colIndex = 0): Promise<{ editorCount: number; textBefore: string; textAfter: string }> {
    const cell = this.getElement('tblHistory').locator('tbody tr').nth(rowIndex).locator('td').nth(colIndex);
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
  async isHistoryRowSelected(rowIndex = 0): Promise<boolean> {
    const row = this.getElement('tblHistory').locator('tbody tr').nth(rowIndex);
    const ariaSelected = await row.getAttribute('aria-selected').catch(() => null);
    const dataState = await row.getAttribute('data-state').catch(() => null);
    return ariaSelected === 'true' || dataState === 'selected';
  }

 /** Right-clicks a row and reports whether an application context menu opened; always cleans up. */
  @step('Right-click an entry to see whether a menu appears')
  async rightClickHistoryRow(rowIndex = 0): Promise<boolean> {
    const row = this.getElement('tblHistory').locator('tbody tr').nth(rowIndex);
    await row.click({ button: 'right' });
    const menu = this.page.locator('[role="menu"]').first();
    const appeared = await menu.waitFor({ state: 'visible', timeout: 2_000 })
      .then(() => true).catch(() => false);
    if (appeared) {
      await this.page.keyboard.press('Escape').catch(() => {});
      await menu.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => {});
    }
    return appeared;
  }

  // ------------------------------------------------------------------ loading / layout

  @step('Check whether the list is still loading')
  async getHistoryPendingState(): Promise<HistoryPendingState> {
    const panel = this.getElement('tabContentHistory');
    const table = this.getElement('tblHistory');
    const tableExists = (await table.count()) > 0;
    return {
      spinnerCount: await panel.locator('[role="progressbar"], .animate-spin, [data-testid*="spinner"], [data-testid*="loader"]').count(),
      skeletonCount: await panel.locator('[data-testid*="skeleton"], .animate-pulse, [class*="skeleton"]').count(),
      dataRowCount: tableExists ? await table.locator('tbody tr').count() : 0,
      emptyStateShown: tableExists ? await this.isHistoryTableEmpty() : false,
    };
  }

 /**
  * A 40+ column grid must scroll inside its own container, never widen the page. Measures both
  * halves of that contract in one browser round trip.
  */
  @step('Measure how the wide list fits inside the page')
  async getHistoryOverflow(): Promise<HistoryOverflow> {
    const pageOverflowPx = await this.page.evaluate(() => {
      const root = document.documentElement;
      return Math.max(0, root.scrollWidth - root.clientWidth);
    });
    const container = this.getElement('secHistoryTableContainer');
    const target = (await container.count()) > 0 ? container : this.getElement('tblHistory');
    const containerScrollsHorizontally = await target.evaluate((el) => {
      const inner = el.querySelector('table');
      return inner ? inner.scrollWidth > el.clientWidth : el.scrollWidth > el.clientWidth;
    });
    return { pageOverflowPx, containerScrollsHorizontally };
  }

  @step('Resize the browser window')
  async resizeViewport(width: number, height: number): Promise<void> {
    await this.page.setViewportSize({ width, height });
    await this.waitForAngularStable();
  }

  // ------------------------------------------------------------------ history type selector

  @step('Check whether a history type chooser is offered')
  async isHistoryTypeSelectorPresent(): Promise<boolean> {
    return (await this.getElement('drpHistoryType').count()) > 0;
  }

  @step('Read the history type currently chosen')
  async getHistoryTypeValue(): Promise<string> {
    return ((await this.getElement('drpHistoryType').textContent()) || '').trim();
  }

  @step('Read the history types on offer')
  async getHistoryTypeOptions(): Promise<string[]> {
    return this.getComboboxOptions('drpHistoryType');
  }

 /**
  * Switches history type and waits for WHICHEVER grid that type renders.
  *
  * It must not assume the standard grid: the "Location Management Legacy History" type renders
  * `tblLegacyHistory` (44 columns) instead of `tblHistory` (42), so waiting for the standard table
  * timed out after 30s and failed TC-LOE-HIST-036 — which then left the panel in the legacy view
  * and contaminated TC-LOE-HIST-037 behind it.
  */
  @step('Choose a history type')
  async selectHistoryType(optionText: string): Promise<void> {
    await this.selectComboboxOption('drpHistoryType', optionText, { exact: true });
    await this.waitForAngularStable();
    await this.waitForEitherHistoryGrid();
  }

 /** Which grid the panel is currently showing. */
  @step('Work out which version of the History list is showing')
  async getActiveHistoryGrid(): Promise<'standard' | 'legacy' | 'none'> {
    if (await this.getElement('tblHistory').isVisible().catch(() => false)) return 'standard';
    if (await this.getElement('tblLegacyHistory').isVisible().catch(() => false)) return 'legacy';
    return 'none';
  }

 /** Waits until either history grid has rendered a header row, then settles the standard one. */
  @step('Wait for either version of the History list to appear')
  async waitForEitherHistoryGrid(timeoutMs = 30_000): Promise<'standard' | 'legacy'> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const active = await this.getActiveHistoryGrid();
      if (active === 'standard') {
        await this.waitForHistoryGridLoaded(Math.max(1_000, deadline - Date.now()));
        return 'standard';
      }
      if (active === 'legacy' && (await this.getElement('tblLegacyHistory').locator('th').count()) > 0) {
        return 'legacy';
      }
      await this.page.waitForTimeout(200);
    }
    throw new Error(`Neither the standard nor the legacy history grid rendered within ${timeoutMs}ms`);
  }

  @step('Read the column headings on the older History list')
  async getLegacyHistoryColumnHeaders(): Promise<string[]> {
    return (await this.getElement('tblLegacyHistory').locator('th').allTextContents()).map(t => t.trim());
  }

  @step('Count the entries on the older History list')
  async getLegacyHistoryRowCount(): Promise<number> {
    return this.getElement('tblLegacyHistory').locator('tbody tr').count();
  }

 /** The legacy grid must be as strictly read-only as the standard one. */
  @step('Check that the older History list cannot be edited')
  async isLegacyHistoryReadOnly(): Promise<boolean> {
    const table = this.getElement('tblLegacyHistory');
    const inputs = await table.locator('input:not([type="hidden"]), textarea, select, [contenteditable="true"]').count();
    return inputs === 0;
  }

  /** Header labels of every column with NO sort control — the complement of the sortable set. */
  @step('List the columns that cannot be sorted')
  async getHistoryNonSortableColumns(): Promise<string[]> {
    const sortable = new Set(await this.getHistorySortableColumns());
    return (await this.getHistoryColumnHeaders()).filter(h => !sortable.has(h));
  }

 /**
  * Parses a pipe-delimited composite cell into its `Name - flag` pairs.
  *
  * Two NM-854 fields have no column of their own because the grid folds them into one cell:
  * "Section Name" carries SectionName+SectionIsActive and "Service Type - Exempt" carries
  * ServiceTypeName+STExempt, each as "Value - true | Value - false | ...".
  */
  @step('Read a cell that packs several values together')
  async getHistoryCompositeCell(headerText: string, rowIndex = 0): Promise<{ raw: string; length: number; pairs: Array<{ name: string; flag: string }> }> {
    const raw = await this.getHistoryColumnByHeader(rowIndex, headerText);
    const pairs = raw.split('|').map(part => {
      const at = part.lastIndexOf(' - ');
      return at === -1
        ? { name: part.trim(), flag: '' }
        : { name: part.slice(0, at).trim(), flag: part.slice(at + 3).trim() };
    }).filter(p => p.name !== '');
    return { raw, length: raw.length, pairs };
  }

  // ------------------------------------------------------------------ paginator page-number input

 /** The paginator's page box is the ONLY editable field on this read-only tab. */
  @step('Inspect the page-number box and how it is set up')
  async getHistoryPageInputAttributes(): Promise<Record<string, string | number | boolean | null>> {
    return this.getElement('txtHistoryCurrentPage').evaluate((el) => {
      const input = el as HTMLInputElement;
      return {
        type: input.type,
        min: input.min,
        max: input.max,
        maxLength: input.maxLength,
        required: input.required,
        inputMode: input.getAttribute('inputmode'),
        pattern: input.getAttribute('pattern'),
        ariaInvalid: input.getAttribute('aria-invalid'),
      };
    });
  }

  @step('Read the page number currently in the box')
  async getHistoryPageInputValue(): Promise<string> {
    return this.getElement('txtHistoryCurrentPage').inputValue();
  }

 /**
  * Types a value into the page box and commits with Enter, returning what the control settled on.
  *
  * Keystroke-driven on purpose (click, Ctrl+A, Backspace, type, Enter) rather than fill(): the
  * control filters input per keystroke via its `pattern="[0-9]*"`, and a direct value assignment
  * bypasses exactly the sanitisation these scenarios exist to probe.
  */
  @step('Type a page number into the box')
  async setHistoryPageNumber(value: string): Promise<string> {
    const input = this.getElement('txtHistoryCurrentPage');
    await input.click();
    await this.page.keyboard.press('Control+a');
    await this.page.keyboard.press('Backspace');
    if (value !== '') await input.type(value, { delay: 20 });
    await this.page.keyboard.press('Enter');
    await this.waitForAngularStable();
    await this.waitForHistoryGridLoaded();
    return this.getHistoryPageInputValue();
  }

  // ------------------------------------------------------------------ pagination

  @step('Read the wording of the page navigation')
  async getHistoryPaginationText(): Promise<string> {
    const panel = this.getElement('tabContentHistory');
    const text = await panel.locator('text=/\\d+ \\/ \\d+/').textContent().catch(() => '');
    return (text || '').trim();
  }

  @step('Count the page navigation buttons')
  async getHistoryPaginationButtonCount(): Promise<number> {
    const panel = this.getElement('tabContentHistory');
    return panel.locator('button[aria-label*="page"], button[aria-label*="Page"]').count();
  }

 /**
  * Reads the paginator's "current / total" state. The current page lives in an input and the total
  * in an adjacent span, so both are read separately — the same split the Locations history
  * paginator needed. Returns zeros when the paginator is absent rather than throwing, so a
  * pagination scenario can skip cleanly on an office with a single page of history.
  */
  @step('Read which page of results is showing')
  async getHistoryPageIndicator(): Promise<HistoryPageIndicator> {
    const panel = this.getElement('tabContentHistory');
    const input = this.getElement('txtHistoryCurrentPage');
    const current = (await input.count()) > 0
      ? ((await input.inputValue().catch(() => '')) || '').trim()
      : '';
    const totalRaw = ((await panel.locator('span').filter({ hasText: /^\/\s*\d+$/ }).first()
      .textContent().catch(() => '')) || '').trim();
    const total = totalRaw.replace(/\D/g, '');
    return {
      current: parseInt(current, 10) || 0,
      total: parseInt(total, 10) || 0,
      raw: current && total ? `${current} / ${total}` : '',
    };
  }

  private paginationKey(direction: HistoryPageDirection): string {
    return {
      first: 'btnHistoryFirstPage',
      previous: 'btnHistoryPrevPage',
      next: 'btnHistoryNextPage',
      last: 'btnHistoryLastPage',
    }[direction];
  }

  @step('Check whether a page navigation button is offered')
  async isHistoryPaginationButtonPresent(direction: HistoryPageDirection): Promise<boolean> {
    return (await this.getElement(this.paginationKey(direction)).count()) > 0;
  }

  @step('Check whether a page navigation button is greyed out')
  async isHistoryPaginationButtonDisabled(direction: HistoryPageDirection): Promise<boolean> {
    return this.getElement(this.paginationKey(direction)).isDisabled();
  }

  @step('Click a page navigation button')
  async clickHistoryPaginationButton(direction: HistoryPageDirection): Promise<void> {
    await this.getElement(this.paginationKey(direction)).click();
    await this.waitForAngularStable();
    await this.waitForHistoryGridLoaded();
  }

 /**
  * Returns to page 1 only when the control is actually enabled.
  *
  * Clicking a DISABLED paginator button does not fail fast — Playwright waits for it to become
  * enabled until the action timeout, which is what made TC-LOE-HIST-041's cleanup hang and time
  * the test out even though every assertion in it had already passed. Cleanup paths must use this
  * rather than clickHistoryPaginationButton('first').
  */
  @step('Go back to the first page if we are not already there')
  async goToFirstHistoryPageIfNeeded(): Promise<void> {
    if (!(await this.isHistoryPaginationButtonPresent('first'))) return;
    if (await this.isHistoryPaginationButtonDisabled('first')) return;
    await this.clickHistoryPaginationButton('first');
  }

  @step('Read how many entries per page is chosen')
  async getHistoryRowsPerPageValue(): Promise<string> {
    return ((await this.getElement('drpHistoryRowsPerPage').textContent()) || '').trim();
  }

  @step('Read the entries-per-page choices on offer')
  async getHistoryRowsPerPageOptions(): Promise<string[]> {
    return this.getComboboxOptions('drpHistoryRowsPerPage');
  }

  @step('Choose how many entries to show per page')
  async setHistoryRowsPerPage(value: string): Promise<void> {
    await this.selectComboboxOption('drpHistoryRowsPerPage', value, { exact: true });
    await this.waitForAngularStable();
    await this.waitForHistoryGridLoaded();
  }

  // ------------------------------------------------------------------ parsing

 // Date.UTC, not new Date(y,m,d,...): the server renders UTC text with no TZ suffix, and local
 // interpretation would shift every comparison by the client's offset.
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
  * Polls until the top row's Modified On is within `maxAgeMs` of now. waitForAngularStable does not
  * cover the 1-3s ASC->DESC re-render, so the top row can still show old timestamps right after a
  * sort — the same race the Locations history grid needed this guard for.
  */
  @step('Wait for a just-made change to appear at the top of the list')
  async waitForRecentTopHistoryRow(maxAgeMs = 24 * 60 * 60 * 1000, timeoutMs = 15_000): Promise<void> {
    const colIndex = await this.historyColumnIndex('Modified On');
    const deadline = Date.now() + timeoutMs;
    let lastVal = '';
    while (Date.now() < deadline) {
      const rows = this.getElement('tblHistory').locator('tbody tr');
      if ((await rows.count()) > 0) {
        lastVal = await this.readCell(0, colIndex);
        const ms = LocalOfficeHistoryPage.parseModifiedOnMs(lastVal);
        if (Number.isFinite(ms) && (Date.now() - ms) <= maxAgeMs) return;
      }
      await this.page.waitForTimeout(200);
    }
    Log.warn(`Top row Modified On "${lastVal}" is not within ${maxAgeMs}ms of now after ${timeoutMs}ms`);
    throw new Error(`Top row Modified On "${lastVal}" not within ${maxAgeMs}ms of now after ${timeoutMs}ms — the descending sort may not have applied`);
  }
}
