import { Page, expect } from '@playwright/test';
import { step } from '../../fixtures/step-decorator';
import { BasePage } from '../base.page';
import { Log } from '../../utils/logger';
import { IConfig } from '../../types';
import { serviceCharge as sc } from '../../selectors/service-charge/service-charge';
import { SC_ROUTE, SC_ROW_COUNT, SC_SERVICE_TYPE_INDEX } from '../../data/service-charge/service-charge';

/**
 * Service Charge setup page.
 *
 * Covers two tabs under Location Settings → Service Charge (/settings/service-charge):
 * - Basic Information (default): 79-row table of decimal percentage inputs, one per service type.
 * - Service Charge History: read-only audit grid.
 *
 * Loading: the Basic Information tab renders 79 percentage inputs disabled before enabling
 * them and filling their values. waitUntilLoaded() waits for the inputs to enable and for
 * the grid to stop changing before tests interact with it.
 *
 * Tabs: located by accessible name (Radix ids shift between builds — never use them).
 *
 * Save dialog: the shared "Save Changes" dialog (dlgSaveChanges / btnSaveChangesConfirm)
 * is assumed; a custom dialog exists only if a live walk proves otherwise. Confirm
 * before authoring save-cycle assertions.
 *
 * Live runs confirmed the grid enables before final values arrive, and invalid
 * percentage values are marked while the input is focused. The waits and
 * negative tests use those observed behaviours.
 */
export class ServiceChargePage extends BasePage {
  constructor(page: Page, config?: IConfig) {
    super(page, config);
    Log.info('ServiceChargePage initialized');
  }

  // ---------------------------------------------------------------- navigation

  /** Navigates to the Service Charge page for the given office and waits for it to load. */
  @step('Navigate to the Service Charge page for an office')
  async goto(office: string = '1604'): Promise<void> {
    const baseUrl = (this.config?.base_url ?? '').replace(/\/+$/, '');
    await this.safeNavigateTo('about:blank');
    await this.navigateTo(`${baseUrl}${SC_ROUTE(office)}`);
    await this.waitUntilLoaded();
  }

  /**
   * Navigates to the Service Charge page for the given office without waiting for the
   * Basic Information percentage inputs to become enabled.
   *
   * Use this method when the test only needs the History tab and does not require
   * the Basic Information tab to be in an editable state. The standard goto() method
   * waits for BI inputs to enable (up to 60 s) — that gate is wrong for read-only
   * History paths where the target office may have disabled or read-only BI inputs.
   * This method does not change the contract of waitUntilLoaded(); other callers are
   * unaffected.
   */
  @step('Navigate to the Service Charge page for an office (History tab only)')
  async gotoHistory(office: string = '1604'): Promise<void> {
    const baseUrl = (this.config?.base_url ?? '').replace(/\/+$/, '');
    await this.safeNavigateTo('about:blank');
    await this.navigateTo(`${baseUrl}${SC_ROUTE(office)}`);
    await this.waitForAngularStable();
  }

  /**
   * Waits until the Basic Information tab's percentage inputs are ready.
   *
   * After navigation the page enables the percentage inputs before it finishes updating
   * the grid. Waiting for enablement alone can return during that gap, so this gate waits
   * until the grid has stopped changing before any test interacts with it.
   * A 60-second timeout accommodates the observed enable delay with comfortable headroom.
   */
  @step('Wait for the page to finish loading')
  async waitUntilLoaded(timeout = 60_000): Promise<void> {
    await this.waitForPercentageValuesToSettle(timeout);
    await this.waitForAngularStable();
  }

  /**
   * Waits until the percentage grid has finished changing.
   *
   * The grid enables its inputs before it fills them in, and a value typed in that gap is
   * overwritten when the values arrive. The page is ready only after the percentage inputs
   * themselves have stopped changing for a short quiet period.
   */
  private async waitForPercentageValuesToSettle(timeout = 30_000, quietMs = 2_500): Promise<void> {
    const percentageInputs = this.page.locator(sc.allPercentageInputs);
    const firstPercentageInput = percentageInputs.first();
    await firstPercentageInput.waitFor({ state: 'attached', timeout });
    await expect(percentageInputs).toHaveCount(SC_ROW_COUNT, { timeout });
    await expect(firstPercentageInput).toBeEnabled({ timeout });

    let previousSignature: string | undefined;
    let stableSince = Date.now();

    await expect
      .poll(
        async () => {
          const signature = await percentageInputs.evaluateAll((elements) =>
            elements
              .map((element) => {
                const input = element as HTMLInputElement;
                return [
                  input.getAttribute('data-testid') ?? '',
                  input.disabled ? 'disabled' : 'enabled',
                  input.value,
                ].join('=');
              })
              .join('\n'),
          );

          const now = Date.now();
          if (signature !== previousSignature) {
            previousSignature = signature;
            stableSince = now;
          }

          return now - stableSince;
        },
        {
          timeout,
          intervals: [100],
          message: 'Service Charge percentage inputs should stop changing before interaction',
        },
      )
      .toBeGreaterThanOrEqual(quietMs);
  }

  /**
   * Switches to the Basic Information tab by accessible name.
   * Radix-generated tab ids must never be used — they shift between builds.
   */
  @step('Switch to the Basic Information tab')
  async switchToBasicInformationTab(): Promise<void> {
    await this.page
      .getByRole('tab', { name: sc.TAB_BASIC_INFORMATION_NAME, exact: true })
      .click();
    await this.waitUntilLoaded();
  }

  /**
   * Switches to the Service Charge History tab by accessible name and waits until it is
   * confirmed active. Uses aria-selected rather than a heading — the page h1 stays
   * "Service Charge" on both tabs, so no History-specific heading exists.
   * Radix-generated tab ids must never be used — they shift between builds.
   */
  @step('Switch to the Service Charge History tab')
  async switchToHistoryTab(): Promise<void> {
    const tab = this.page.getByRole('tab', { name: sc.TAB_HISTORY_NAME, exact: true });
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true', { timeout: 10_000 });
    await this.waitForAngularStable();
  }

  // ---------------------------------------------------------------- reading

  /**
   * Returns the full office header line shown on the Basic Information tab, including
   * the office name (e.g. "Local Office : 1604 - Parker Palm Springs").
   * The label "Local Office :" and the office name value live in separate child nodes;
   * reading the parent element captures both. Verified 2026-08-14.
   */
  @step('Read the office header text')
  async getOfficeHeader(): Promise<string> {
    const raw = await this.page
      .getByText(/Local Office\s*:/, { exact: false })
      .first()
      .locator('xpath=..')
      .textContent();
    return (raw ?? '').replace(/\s+/g, ' ').trim();
  }

  /**
   * Returns the section header line shown on the Service Charge History tab, including
   * the office name (e.g. "Service Charge History : Parker Palm Springs").
   * The label and office name live in separate child nodes; reading the parent captures both.
   * Verified 2026-08-14.
   */
  @step('Read the History section header text')
  async getHistorySectionHeader(): Promise<string> {
    const raw = await this.page
      .getByText(/Service Charge History\s*:/, { exact: false })
      .first()
      .locator('xpath=..')
      .textContent();
    return (raw ?? '').replace(/\s+/g, ' ').trim();
  }

  /**
   * Returns the current value of the percentage input at the given row index (0–78).
   * Values live in input.value — textContent returns empty for these inputs.
   */
  @step('Read a percentage value by row index')
  async getPercentageByIndex(index: number): Promise<string> {
    return this.page.locator(sc.percentageByIndex(index)).inputValue();
  }

  /**
   * Returns the current value of the percentage input for a named service type.
   * Row index is resolved from SC_SERVICE_TYPE_INDEX (sourced from the application's DOM as observed on 2026-08-10).
   * Throws if the service-type name is not present in the map.
   */
  @step('Read a percentage value by service type name')
  async getPercentageByServiceType(serviceType: string): Promise<string> {
    const index = SC_SERVICE_TYPE_INDEX[serviceType];
    if (index === undefined) {
      throw new Error(`Service type not found in index map: "${serviceType}"`);
    }
    return this.getPercentageByIndex(index);
  }

  /**
   * Returns the column headers of the currently visible table in display order.
   * Works for both the Basic Information and History tab tables.
   */
  @step('Read the table column headers')
  async getBasicInfoHeaders(): Promise<string[]> {
    const raw = await this.page.getByRole('columnheader').allTextContents();
    return raw.map((h) => h.replace(/\s+/g, ' ').trim()).filter((h) => h.length > 0);
  }

  /**
   * Returns whether the Save button is currently enabled.
   * Checks both the disabled property and aria-disabled attribute.
   */
  @step('Check whether the Save button is enabled')
  async isSaveEnabled(timeout = 5_000): Promise<boolean> {
    const btn = this.page.locator(sc.save).first();
    await btn.waitFor({ state: 'attached', timeout });
    const isDisabled = await btn.isDisabled();
    const ariaDisabled = await btn.getAttribute('aria-disabled');
    return !isDisabled && ariaDisabled !== 'true';
  }

  /**
   * Polls until the Save button becomes enabled. Returns true if it enables within the
   * budget, false otherwise.
   */
  @step('Wait for the Save button to become enabled')
  async waitForSaveActive(timeout = 10_000): Promise<boolean> {
    await expect.poll(() => this.isSaveEnabled(), { timeout }).toBe(true);
    return true;
  }

  /**
   * Polls until the Save button becomes disabled. Returns true if it disables within the
   * budget, false otherwise.
   */
  @step('Wait for the Save button to become disabled')
  async waitForSaveInactive(timeout = 10_000): Promise<boolean> {
    await expect.poll(() => this.isSaveEnabled(), { timeout }).toBe(false);
    return true;
  }

  // ---------------------------------------------------------------- editing

  /**
   * Resolves the percentage input at the given row index and waits until it is enabled.
   *
   * All 79 percentage inputs render disabled for ~30 seconds after every navigation or
   * reload before enabling all at once. The 60 000 ms budget matches waitUntilLoaded()
   * so every interaction path (initial load, reload, afterEach restore) gets the same
   * headroom regardless of whether the caller went through waitUntilLoaded() first.
   */
  private async resolveEnabledPercentageField(index: number) {
    const field = this.page.locator(sc.percentageByIndex(index)).first();
    await expect(field).toBeEnabled({ timeout: 60_000 });
    return field;
  }

  /**
   * Sets the percentage value at the given row index. Waits for the field to be enabled
   * before interacting — percentage inputs are disabled for ~30 s after every navigation
   * or reload. Clears the field, types the new value, and presses Tab to trigger Angular
   * change detection.
   *
   * For standard percentage values (finite, non-negative, at most two decimal places) the
   * method confirms the written value was accepted by polling the input until it reflects
   * the expected number. If the app reverts the value during a re-render, it re-applies
   * the value up to three times. Throws if the value still has not landed after those
   * attempts — a silent no-op is never tolerated for valid writes.
   *
   * Boundary and edge-case inputs (negative numbers, empty strings, whitespace, values
   * with more than two decimal places) skip the postcondition check because the app may
   * legitimately transform or reject them.
   */
  @step('Set a percentage value by row index')
  async setPercentageByIndex(index: number, value: string): Promise<void> {
    const field = await this.resolveEnabledPercentageField(index);
    const expected = parseFloat(value);

    const applyValue = async (): Promise<void> => {
      await field.click();
      await field.fill(value);
      await this.page.keyboard.press('Tab');
    };

    const readNumericValue = async (): Promise<number> => {
      const raw = await field.inputValue();
      return parseFloat(raw.replace('%', ''));
    };

    // Only confirm the postcondition for values the app is expected to accept
    // unchanged: finite, non-negative, and already at two-or-fewer decimal places.
    const isConfirmable =
      Number.isFinite(expected) &&
      expected >= 0 &&
      Math.round(expected * 100) / 100 === expected;

    if (!isConfirmable) {
      await applyValue();
      await this.waitForAngularStable(2000);
      return;
    }

    const maxAttempts = 3;
    let actual = Number.NaN;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      await applyValue();

      try {
        await expect
          .poll(readNumericValue, {
            timeout: 2000,
            message: `Percentage field at row ${index} should keep ${expected}`,
          })
          .toBe(expected);
        return;
      } catch {
        actual = await readNumericValue();
      }
    }

    throw new Error(
      `Percentage field at row ${index}: wrote ${expected} but found ${actual} after ${maxAttempts} attempts`,
    );
  }

  /**
   * Types a percentage value and reads the field before focus leaves it.
   * Some invalid values are marked only while the field is focused.
   */
  @step('Type a percentage value and keep focus')
  async typePercentageAndReadFocused(
    index: number,
    value: string,
  ): Promise<{ value: string; invalid: string | null }> {
    const field = await this.resolveEnabledPercentageField(index);
    await field.click();
    await field.fill(value);
    return {
      value: await field.inputValue(),
      invalid: await field.getAttribute('aria-invalid'),
    };
  }

  /** Moves focus away from the current percentage field. */
  @step('Move away from the percentage field')
  async moveAwayFromPercentageField(): Promise<void> {
    await this.page.keyboard.press('Tab');
  }

  /**
   * Sets the percentage value for a named service type.
   * Row index is resolved from SC_SERVICE_TYPE_INDEX.
   * Throws if the service-type name is not present in the map.
   */
  @step('Set a percentage value by service type name')
  async setPercentageByServiceType(serviceType: string, value: string): Promise<void> {
    const index = SC_SERVICE_TYPE_INDEX[serviceType];
    if (index === undefined) {
      throw new Error(`Service type not found in index map: "${serviceType}"`);
    }
    await this.setPercentageByIndex(index, value);
  }

  /**
   * Clicks the Save button.
   * This page saves silently — no confirmation dialog appears after clicking Save.
   * After clicking, callers should wait for waitUntilLoaded() to confirm the save completed.
   */
  @step('Click the Save button')
  async clickSave(): Promise<void> {
    await this.page.locator(sc.save).first().click();
  }

  // ---------------------------------------------------------------- baseline restore

  /**
   * Restores the given rows to their recorded default values before each test.
   *
   * For each row: reads the current value, skips if it already matches (numeric compare),
   * sets and verifies if not. Saves once at the end only if anything changed, then re-reads
   * to confirm. Up to 3 attempts; throws with row detail if restoration fails.
   */
  @step('Restore mutated rows to their recorded default values')
  async ensureDefaultState(
    defaults: { rowIndex: number; value: string }[],
  ): Promise<void> {
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let dirty = false;
      for (const { rowIndex, value } of defaults) {
        const current = parseFloat((await this.getPercentageByIndex(rowIndex)).replace('%', ''));
        const expected = parseFloat(value);
        if (current !== expected) {
          await this.setPercentageByIndex(rowIndex, value);
          dirty = true;
        }
      }
      if (!dirty) return; // already at defaults
      await this.waitForSaveActive();
      await this.clickSave();
      await this.waitUntilLoaded();
      // Re-read and verify all rows after save
      let allMatch = true;
      for (const { rowIndex, value } of defaults) {
        const after = parseFloat((await this.getPercentageByIndex(rowIndex)).replace('%', ''));
        if (after !== parseFloat(value)) {
          allMatch = false;
          break;
        }
      }
      if (allMatch) return;
    }
    // Build a diagnostic message with the first mismatched row
    for (const { rowIndex, value } of defaults) {
      const actual = await this.getPercentageByIndex(rowIndex);
      const actualNum = parseFloat(actual.replace('%', ''));
      if (actualNum !== parseFloat(value)) {
        throw new Error(
          `ensureDefaultState: row ${rowIndex} expected ${value} but found ${actual} after ${maxAttempts} attempts`,
        );
      }
    }
  }

  // ---------------------------------------------------------------- History tab

  /**
   * Waits until the Service Charge History grid has finished loading — skeletons are gone
   * and at least one data row with non-empty cells is visible.
   *
   * The grid populates asynchronously after tab activation. Waiting for skeleton
   * disappearance alone is insufficient — rows exist in the DOM while still being
   * placeholders. This method first waits for all skeletons to clear, then polls until
   * getHistoryRows() returns at least one row. No fixed sleeps; uses web-first assertions.
   */
  @step('Wait for the Service Charge History grid to finish loading')
  async waitUntilHistoryLoaded(timeout = 90_000): Promise<void> {
    await expect(this.page.locator(sc.skeleton)).toHaveCount(0, { timeout });
    await expect
      .poll(async () => (await this.getHistoryRows()).length > 0, { timeout: 30_000 })
      .toBe(true);
  }

  /**
   * Returns the page `<h1>` heading text, trimmed and normalised.
   * The heading reads "Service Charge" on both tabs; office context is rendered separately
   * per tab (Basic Information tab: "Local Office : <name>"; History tab: "Service Charge History : <name>").
   */
  @step('Read the page heading')
  async getPageHeading(): Promise<string> {
    const raw = await this.page.locator('h1').first().textContent();
    return (raw ?? '').replace(/\s+/g, ' ').trim();
  }

  /**
   * Returns the number of data rows currently visible in the Service Charge History grid.
   * Delegates to getHistoryRows() so skeleton rows are excluded from the count.
   * The spec decides what to assert — this method only reports the count.
   */
  @step('Count the rows in the Service Charge History grid')
  async getHistoryRowCount(): Promise<number> {
    return (await this.getHistoryRows()).length;
  }

  /**
   * Searches the History tab panel for pagination, filter, search, and date-range controls
   * and returns a structured evidence object.
   *
   * Returns counts of each selector searched so absence cases can document exactly what was
   * looked for — "we looked and found nothing" is distinguishable from "we never looked".
   * Must be called while the History tab is active.
   */
  @step('Scan the History tab for pagination, filter, search, and date-range controls')
  async getHistoryControlCensus(): Promise<{
    paginationAriaLabelCount: number;
    roleNavigationCount: number;
    nextPrevButtonCount: number;
    pageSizeSelectorCount: number;
    loadMoreCount: number;
    filterInputCount: number;
    searchInputCount: number;
    dateRangePickerCount: number;
    selectorsSearched: string[];
  }> {
    const p = this.page;
    const [
      paginationAriaLabelCount,
      roleNavigationCount,
      nextPrevButtonCount,
      pageSizeSelectorCount,
      loadMoreCount,
      filterInputCount,
      searchInputCount,
      dateRangePickerCount,
    ] = await Promise.all([
      p.locator('[aria-label*="page" i]').count(),
      p.locator('[role="navigation"]').count(),
      p
        .locator('button')
        .filter({ hasText: /next|prev(ious)?/i })
        .count(),
      p.locator('select[aria-label*="page" i], [data-testid*="page-size"]').count(),
      p.locator('button').filter({ hasText: /load more/i }).count(),
      p.locator('input').count(),
      p.locator('[aria-label*="search" i], [placeholder*="search" i]').count(),
      p.locator('[aria-label*="date" i], [data-testid*="date-range"]').count(),
    ]);
    return {
      paginationAriaLabelCount,
      roleNavigationCount,
      nextPrevButtonCount,
      pageSizeSelectorCount,
      loadMoreCount,
      filterInputCount,
      searchInputCount,
      dateRangePickerCount,
      selectorsSearched: [
        '[aria-label*="page" i]',
        '[role="navigation"]',
        'button[text~=next/prev]',
        'select[aria-label*="page" i] / [data-testid*="page-size"]',
        'button[text~=load more]',
        'input',
        '[aria-label*="search" i] / [placeholder*="search" i]',
        '[aria-label*="date" i] / [data-testid*="date-range"]',
      ],
    };
  }

  /**
   * Returns whether the Unsaved Changes alertdialog is currently visible.
   *
   * Angular's dirty state does not reliably reset after save. When navigating from
   * Basic Information to History with unsaved edits, the app should present an alertdialog
   * with Stay / Discard options. Use this method to assert whether the modal appeared.
   */
  @step('Check whether the Unsaved Changes modal is visible')
  async isUnsavedChangesModalVisible(): Promise<boolean> {
    return this.page.locator('[role="alertdialog"]').isVisible();
  }

  /**
   * Returns the column headers of the Service Charge History grid in display order.
   * Must be called after switchToHistoryTab().
   */
  @step('Read the Service Charge History table column headers')
  async getHistoryHeaders(): Promise<string[]> {
    const raw = await this.page.getByRole('columnheader').allTextContents();
    return raw.map((h) => h.replace(/\s+/g, ' ').trim()).filter((h) => h.length > 0);
  }

  /**
   * Returns all visible data rows from the Service Charge History grid as arrays of cell text.
   * Row content was not observable during exploration (the grid rendered loading skeletons only).
   * Returns what is rendered; empty result means no rows loaded or tab not yet switched to.
   * NEEDS-LIVE-CONFIRM: that row cell content is accessible via textContent on this table.
   */
  /**
   * Sort a History grid column by opening its header dropdown and clicking
   * "Sort ascending" or "Sort descending". The History grid uses a Radix dropdown
   * menu on each column header — a click on the header opens the menu.
   */
  @step('Sort History column via dropdown')
  async sortHistoryColumnViaDropdown(headerLabel: string, direction: 'ascending' | 'descending'): Promise<void> {
    // Resolve which column index corresponds to the header so we can detect re-render.
    const headerTexts = await this.page.getByRole('columnheader').allTextContents();
    const colIndex = headerTexts.findIndex((h) => h.replace(/\s+/g, ' ').trim().includes(headerLabel));

    // Capture the first data row's value in this column before the sort click.
    let preSortValue: string | null = null;
    if (colIndex >= 0) {
      const rows = this.page.getByRole('row');
      if ((await rows.count()) > 1) {
        const cells = await rows.nth(1).getByRole('cell').allTextContents();
        preSortValue = cells[colIndex]?.replace(/\s+/g, ' ').trim() ?? null;
      }
    }

    const header = this.page.locator('th', { hasText: headerLabel }).first();
    await header.click();
    const menuLabel = direction === 'ascending' ? 'Sort ascending' : 'Sort descending';
    const menuItem = this.page.getByRole('menuitem', { name: menuLabel }).first();
    await menuItem.waitFor({ state: 'visible', timeout: 6_000 });
    await menuItem.click();

    // Wait for the grid to re-render by polling until the first data row's value changes.
    // A fixed sleep wastes time on fast re-renders and misses genuinely slow ones.
    if (colIndex >= 0 && preSortValue !== null) {
      const SORT_SETTLE_TIMEOUT = 45_000;
      const deadline = Date.now() + SORT_SETTLE_TIMEOUT;
      let settled = false;
      while (Date.now() < deadline) {
        const rows = this.page.getByRole('row');
        if ((await rows.count()) > 1) {
          const cells = await rows.nth(1).getByRole('cell').allTextContents();
          const current = cells[colIndex]?.replace(/\s+/g, ' ').trim() ?? '';
          if (current !== preSortValue) {
            settled = true;
            break;
          }
        }
        await this.page.waitForTimeout(300);
      }
      if (!settled) {
        throw new Error(
          `History grid first-row value did not change after ${direction} sort on "${headerLabel}" ` +
          `within ${SORT_SETTLE_TIMEOUT / 1000} s. Pre-sort value: "${preSortValue}". ` +
          `The ${direction} sort did not re-render the grid — possible application defect.`,
        );
      }
    }
  }

  /**
   * Read the cell text at a given column index for the first visible data row
   * in the History grid (0-based column index).
   */
  @step('Get first History row cell text')
  async getFirstHistoryRowCellText(colIndex: number): Promise<string> {
    const rows = await this.getHistoryRows();
    if (rows.length === 0) return '';
    return rows[0]?.[colIndex] ?? '';
  }

  /**
   * Read all visible cell values for a given column index in the History grid.
   */
  @step('Get History column cell values')
  async getHistoryColumnCellValues(colIndex: number): Promise<string[]> {
    const rows = await this.getHistoryRows();
    return rows.map((r) => r[colIndex] ?? '');
  }

  @step('Read all rows from the Service Charge History table')
  async getHistoryRows(): Promise<string[][]> {
    // Read every row in one pass inside the page. Reading them one at a time
    // costs a separate browser round-trip per row, and this grid gains a row
    // on every save and never loses one, so a per-row read keeps getting
    // slower until it outlasts the wait that depends on it.
    const rows = await this.page
      .getByRole('row')
      .evaluateAll((elements) =>
        elements.map((row) =>
          Array.from(row.querySelectorAll('td, [role="cell"]')).map((cell) =>
            (cell.textContent ?? '').replace(/\s+/g, ' ').trim(),
          ),
        ),
      );
    // Row at index 0 is the header row, so start from 1.
    // Skip skeleton rows, which render as empty cells.
    return rows.slice(1).filter((cells) => cells.some((c) => c.length > 0));
  }
}
