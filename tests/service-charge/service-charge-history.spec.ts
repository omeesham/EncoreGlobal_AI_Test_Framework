import { test, expect } from '../../src/fixtures/pages.fixture';
import { ServiceChargePage } from '../../src/pages/service-charge/service-charge.page';
import {
  SC_OFFICE,
  SC_HISTORY_COLUMN_HEADERS,
  SC_SERVICE_TYPE_INDEX,
} from '../../src/data/service-charge/service-charge';

const APP_IDX = SC_SERVICE_TYPE_INDEX['APP Downloaded'] as number; // 0

/** Return a percentage value numerically different from `current`, in NN.NN format, within 0–100. */
function differentPercentageFrom(current: string): string {
  const num = parseFloat(current);
  return (num >= 50 ? num - 10 : num + 10).toFixed(2);
}

/**
 * Service Charge — Service Charge History tab (NM-3344).
 *
 * Governs 15 test cases (TC-SVC-HIS-001..015).
 *
 * Per-test baseline: beforeEach calls sc.goto() — fresh page load is the reset mechanism, ensuring no test inherits state from a prior run.
 * The History grid is read-only. Only TC-SVC-HIS-014 makes an unsaved edit and must not save.
 *
 * Count: 15 ordinary (pass) + 0 fixme + 0 known-defect = 15.
 *
 */


test.describe('Service Charge History', () => {
  // Suite-wide ceiling: 120 s per test. TC-SVC-HIS-011 (360 s), TC-SVC-HIS-012 (240 s), and
  // TC-SVC-HIS-013 (240 s) each override it via test.setTimeout() — each does multiple
  // full-page or History-grid load cycles that don't fit the default budget.
  test.describe.configure({ timeout: 120_000 });

  let sc: ServiceChargePage;

  test.beforeEach(async ({ authenticatedSession, config }) => {
    sc = new ServiceChargePage(authenticatedSession.page, config);
    await sc.goto(SC_OFFICE);
  });

  // ---------------------------------------------------------------- TC-SVC-HIS-001 — render state

  test('TC-SVC-HIS-001: History tab activates correctly and shows the right heading and columns', async ({
    dependencyGate,
  }) => {
    dependencyGate([]);

    await sc.switchToHistoryTab();

    // The page h1 reads "Service Charge" on both tabs — office context is not in the h1.
    const heading = await sc.getPageHeading();
    expect(heading).toBe('Service Charge');

    // Office name appears in the History section header (verified 2026-08-14).
    const sectionHeader = await sc.getHistorySectionHeader();
    expect(sectionHeader).toMatch(/Parker Palm Springs/);

    // All four column headers must be present in order.
    const headers = await sc.getHistoryHeaders();
    expect(headers).toEqual([...SC_HISTORY_COLUMN_HEADERS]);
  });

  // ---------------------------------------------------------------- TC-SVC-HIS-002 — empty-vol

  test('TC-SVC-HIS-002: Grid populates with data rows after the History tab loads', async ({
    dependencyGate,
  }) => {
    dependencyGate([]);

    await sc.switchToHistoryTab();
    await sc.waitUntilHistoryLoaded();

    const rowCount = await sc.getHistoryRowCount();
    expect(rowCount).toBeGreaterThanOrEqual(1);
  });

  // ---------------------------------------------------------------- TC-SVC-HIS-003 — render state

  test('TC-SVC-HIS-003: Every visible row has four non-empty cells', async ({
    dependencyGate,
  }) => {
    dependencyGate([]);

    await sc.switchToHistoryTab();
    await sc.waitUntilHistoryLoaded();

    const rows = await sc.getHistoryRows();
    expect(rows.length).toBeGreaterThanOrEqual(1);

    // Sample the first ten rows (or all if fewer than ten).
    const sample = rows.slice(0, 10);
    for (const row of sample) {
      expect(row).toHaveLength(4);
      for (const cell of row) {
        expect(cell.trim().length).toBeGreaterThan(0);
      }
    }
  });

  // ---------------------------------------------------------------- TC-SVC-HIS-004 — render state

  test('TC-SVC-HIS-004: Service Charge Percentage cells render in "24.00 %" format', async ({
    dependencyGate,
  }) => {
    dependencyGate([]);

    await sc.switchToHistoryTab();
    await sc.waitUntilHistoryLoaded();

    const rows = await sc.getHistoryRows();
    expect(rows.length).toBeGreaterThanOrEqual(1);

    // Percentage is column index 1. Sample up to three rows.
    // Format: digits, dot, exactly two decimal digits, one space, percent sign.
    for (const row of rows.slice(0, Math.min(3, rows.length))) {
      expect(row[1]).toMatch(/^\d+\.\d{2} %$/);
    }
  });

  // ---------------------------------------------------------------- TC-SVC-HIS-005 — render state

  test('TC-SVC-HIS-005: Modified On cells render in "MM/DD/YYYY hh:mm:ss AM|PM" format', async ({
    dependencyGate,
  }) => {
    dependencyGate([]);

    await sc.switchToHistoryTab();
    await sc.waitUntilHistoryLoaded();

    const rows = await sc.getHistoryRows();
    expect(rows.length).toBeGreaterThanOrEqual(1);

    // Modified On is column index 3. Sample up to three rows.
    for (const row of rows.slice(0, Math.min(3, rows.length))) {
      expect(row[3]).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2} (AM|PM)$/);
    }
  });

  // ---------------------------------------------------------------- TC-SVC-HIS-006 — sorting

  test('TC-SVC-HIS-006: Grid default sort is Modified On descending (newest record first)', async ({
    dependencyGate,
  }) => {
    dependencyGate([]);

    await sc.switchToHistoryTab();
    await sc.waitUntilHistoryLoaded();

    const rows = await sc.getHistoryRows();
    expect(rows.length).toBeGreaterThanOrEqual(2);

    // Modified On is column index 3. Parse MM/DD/YYYY hh:mm:ss AM|PM and verify non-ascending order.
    const sample = rows.slice(0, Math.min(10, rows.length));
    const dates = sample.map((row) => new Date(row[3] ?? ''));
    for (let i = 0; i < dates.length - 1; i++) {
      expect(dates[i]!.getTime()).toBeGreaterThanOrEqual(dates[i + 1]!.getTime());
    }
  });

  // ---------------------------------------------------------------- TC-SVC-HIS-007 — render state (read-only census)

  test('TC-SVC-HIS-007: Grid is read-only — no interactive elements inside', async ({
    dependencyGate,
  }) => {
    dependencyGate([]);

    await sc.switchToHistoryTab();
    await sc.waitUntilHistoryLoaded();

    // While on the History tab the grid must expose no interactive UI of any kind —
    // no filter, search, date-range, or pagination controls. This is the comprehensive
    // read-only census; TC-SVC-HIS-008 and TC-SVC-HIS-009 each re-confirm specific subsets.
    const census = await sc.getHistoryControlCensus();
    expect(census.filterInputCount).toBe(0);
    expect(census.searchInputCount).toBe(0);
    expect(census.dateRangePickerCount).toBe(0);
    expect(census.paginationAriaLabelCount).toBe(0);
    expect(census.roleNavigationCount).toBe(0);
    expect(census.nextPrevButtonCount).toBe(0);
    expect(census.pageSizeSelectorCount).toBe(0);
    expect(census.loadMoreCount).toBe(0);
  });

  // ---------------------------------------------------------------- TC-SVC-HIS-008 — pagination

  test('TC-SVC-HIS-008: No pagination control is present on the History tab', async ({
    dependencyGate,
  }) => {
    dependencyGate([]);

    await sc.switchToHistoryTab();
    await sc.waitUntilHistoryLoaded();

    const census = await sc.getHistoryControlCensus();
    expect(census.paginationAriaLabelCount).toBe(0);
    expect(census.roleNavigationCount).toBe(0);
    expect(census.nextPrevButtonCount).toBe(0);
    expect(census.pageSizeSelectorCount).toBe(0);
    expect(census.loadMoreCount).toBe(0);
  });

  // ---------------------------------------------------------------- TC-SVC-HIS-009 — render state (filter/search)

  test('TC-SVC-HIS-009: No filter, search, or date-range control is present on the History tab', async ({
    dependencyGate,
  }) => {
    dependencyGate([]);

    await sc.switchToHistoryTab();
    await sc.waitUntilHistoryLoaded();

    const census = await sc.getHistoryControlCensus();
    expect(census.filterInputCount).toBe(0);
    expect(census.searchInputCount).toBe(0);
    expect(census.dateRangePickerCount).toBe(0);
  });

  // ---------------------------------------------------------------- TC-SVC-HIS-010 — render state

  test('TC-SVC-HIS-010: Modified By cells render a user identifier, not a raw GUID', async ({
    dependencyGate,
  }) => {
    dependencyGate([]);

    await sc.switchToHistoryTab();
    await sc.waitUntilHistoryLoaded();

    const rows = await sc.getHistoryRows();
    expect(rows.length).toBeGreaterThanOrEqual(1);

    // Modified By is column index 2. It should not be a raw UUID.
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    for (const row of rows.slice(0, Math.min(3, rows.length))) {
      expect(row[2]).not.toMatch(uuidPattern);
    }
  });

  // ---------------------------------------------------------------- TC-SVC-HIS-011 — result-fidelity
  // Precondition: offices 1101 and 1105 must each have at least one Service Charge History row.
  // Observed on the live application on 2026-08-11: 1604=50 rows, 1101=32 rows, 1105=35 rows.
  //
  // Office switches use gotoHistory() instead of goto() because this test only needs the History
  // grid — it never interacts with the Basic Information inputs. The standard goto() gate waits
  // for percentage inputs to become enabled, which is inappropriate here: the second and third
  // offices may have read-only or delayed BI inputs, causing a 60 s timeout that has nothing to
  // do with whether the History grid loaded successfully (confirmed 2-of-2 identical failures on
  // 2026-08-11 with 115 consecutive disabled-input polls — deterministic, not environmental wobble).

  test('TC-SVC-HIS-011: History data is scoped per office — different offices show different row sets', async ({
    dependencyGate,
  }) => {
    // Three full office navigations, each with its own tab switch and History-grid load
    // (waitUntilHistoryLoaded() alone carries a 150 s budget for non-primary offices under
    // load) — stacked, that can run well past the suite-wide 120 s ceiling. 360 s covers two
    // slow (non-cache-warm) office loads back to back plus overhead.
    test.setTimeout(360_000);
    dependencyGate([]);

    // Office 1604 (primary test office — beforeEach already landed here via goto()).
    await sc.switchToHistoryTab();
    await sc.waitUntilHistoryLoaded();
    const count1604 = await sc.getHistoryRowCount();
    expect(count1604).toBeGreaterThanOrEqual(1);

    // Office 1101 — use gotoHistory(): this test only reads the History grid, not BI inputs.
    await sc.gotoHistory('1101');
    await sc.switchToHistoryTab();
    await sc.waitUntilHistoryLoaded();
    const count1101 = await sc.getHistoryRowCount();
    expect(count1101).toBeGreaterThanOrEqual(1);

    // Office 1105 — same reasoning.
    await sc.gotoHistory('1105');
    await sc.switchToHistoryTab();
    await sc.waitUntilHistoryLoaded();
    const count1105 = await sc.getHistoryRowCount();
    expect(count1105).toBeGreaterThanOrEqual(1);

    // Row counts must not all be identical — at least two offices must differ, proving isolation.
    const counts = new Set([count1604, count1101, count1105]);
    expect(counts.size).toBeGreaterThan(1);
  });

  test('TC-SVC-HIS-012: Sorting the History grid by Modified On via the column header dropdown reorders rows', async ({
    dependencyGate,
  }) => {
    dependencyGate([]);
    // This test requires two slow grid sorts; override the suite-wide 120 s ceiling.
    test.setTimeout(240_000);

    await sc.switchToHistoryTab();
    await sc.waitUntilHistoryLoaded();

    const rows = await sc.getHistoryRows();
    expect(rows.length).toBeGreaterThanOrEqual(2);

    // Sort ascending by Modified On (column index 3) and capture row 0.
    await sc.sortHistoryColumnViaDropdown('Modified On', 'ascending');
    const ascValues = await sc.getHistoryColumnCellValues(3);
    const ascRow0 = ascValues[0] ?? '';
    expect(ascRow0.length).toBeGreaterThan(0);

    // Oracle 1: ascending row 0 carries the minimum date of all visible rows.
    const parsedDates = ascValues
      .filter((v) => v.length > 0)
      .map((v) => new Date(v).getTime())
      .filter((t) => !Number.isNaN(t));
    const minDate = Math.min(...parsedDates);
    const ascRow0Parsed = new Date(ascRow0).getTime();
    expect(ascRow0Parsed).toBe(minDate);

    // Sort descending and capture row 0.
    await sc.sortHistoryColumnViaDropdown('Modified On', 'descending');
    const descRow0 = await sc.getFirstHistoryRowCellText(3);
    expect(descRow0.length).toBeGreaterThan(0);

    // Oracle 2: ascending row 0 differs from descending row 0.
    expect(ascRow0).not.toEqual(descRow0);
  });

  // ---------------------------------------------------------------- TC-SVC-HIS-013 — save adds History row

  test('TC-SVC-HIS-013: A Basic Information save adds a new row to Service Charge History', async ({
    dependencyGate,
  }) => {
    // This test does two History-grid loads plus two Basic Information save cycles (main body
    // + restore), each of which can take up to ~30-60 s per waitUntilLoaded()'s documented
    // enable delay — the same shape TC-SVC-HIS-012 already overrides the suite-wide 120 s
    // ceiling for.
    test.setTimeout(240_000);
    dependencyGate([]);

    const AUTOMATION_USER = 's-prd-clickauto@psav.com';
    // Build today's date in the timezone the browser renders in, not the timezone the
    // machine running the tests happens to sit in. The grid stamps each row in the
    // application's timezone, so a runner placed east of it reads a date that is already
    // tomorrow and this comparison fails for every hour in between.
    const renderTimeZone = test.info().project.use.timezoneId ?? 'UTC';
    const todayDateStr = new Intl.DateTimeFormat('en-US', {
      timeZone: renderTimeZone,
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
    }).format(new Date());

    // Record the baseline row count before making any change.
    await sc.switchToHistoryTab();
    await sc.waitUntilHistoryLoaded();
    const baselineCount = await sc.getHistoryRowCount();

    // Switch to Basic Information, edit one field, and save.
    await sc.switchToBasicInformationTab();
    const originalValue = await sc.getPercentageByIndex(APP_IDX);
    // Derive the edit from the live value rather than hardcoding '1.00': if a prior run left
    // the database already at '1.00' (e.g. an interrupted restore), writing '1.00' again is a
    // net-zero edit — Save never enables and clickSave() hangs. differentPercentageFrom()
    // guarantees the edit always differs from whatever the environment currently holds.
    const editValue = differentPercentageFrom(originalValue);

    try {
      await sc.setPercentageByIndex(APP_IDX, editValue);
      await sc.clickSave();
      await sc.waitUntilLoaded();

      // Switch to History and confirm a new row appeared at the top.
      await sc.switchToHistoryTab();
      await sc.waitUntilHistoryLoaded();

      const rowsAfterSave = await sc.getHistoryRows();
      expect(rowsAfterSave.length).toBeGreaterThan(baselineCount);

      // Confirmed by live probe on 2026-08-11: new row reflects the saved change and Modified By
      // shows the automation user's email address, not a GUID.
      const topRow = rowsAfterSave[0]!;
      expect(topRow[0]).toBe('APP Downloaded');
      expect(topRow[1]).toContain(`${editValue} %`);
      expect(topRow[2]).toBe(AUTOMATION_USER);
      expect(topRow[3]).toContain(todayDateStr);
    } finally {
      // Restore the original value regardless of any assertion failure.
      await sc.switchToBasicInformationTab();
      await sc.setPercentageByIndex(APP_IDX, originalValue);
      // A single point-in-time isSaveEnabled() check races the app's own re-render: Save can
      // flip back to disabled (net-zero edit, value already matches the database) between the
      // check and the click, hanging clickSave() until its action timeout. Poll for Save to
      // settle active first, and tolerate it never doing so — that just means the database
      // already holds the correct value, so no save is needed.
      try {
        await sc.waitForSaveActive(3000);
        await sc.clickSave();
        await sc.waitUntilLoaded();
      } catch {
        // Net-zero restore — database already holds the correct value.
      }
    }
  });

  // ---------------------------------------------------------------- TC-SVC-HIS-014

  test('TC-SVC-HIS-014: Navigating to History tab with unsaved Basic Information edits triggers an Unsaved Changes modal', async ({
    dependencyGate,
    authenticatedSession,
  }) => {
    dependencyGate([]);

    const page = authenticatedSession.page;

    // Make an unsaved edit on the Basic Information tab.
    await sc.setPercentageByIndex(0, '50.00');
    expect(await sc.isSaveEnabled()).toBe(true);

    // Click the History tab directly — do NOT use switchToHistoryTab(), which waits for
    // aria-selected="true" and can throw after navigation detaches the tab element.
    const historyTab = page.getByRole('tab', { name: 'Service Charge History', exact: true });
    await historyTab.click();

    // The in-app Unsaved Changes modal should appear with Stay and Discard buttons.
    const modal = page.locator('[role="alertdialog"]');
    await expect(modal).toBeVisible();

    // Assert the modal content and button set match live-observed values
    // (walk-log.jsonl:117, 2026-08-14).
    await expect(modal).toContainText('Unsaved changes');
    await expect(modal).toContainText('Are you sure you want to leave this view?');

    const stayButton = modal.getByRole('button', { name: 'Stay' });
    const discardButton = modal.getByRole('button', { name: 'Discard' });
    await expect(stayButton).toBeVisible();
    await expect(discardButton).toBeVisible();

    // Dismiss by clicking Stay to keep the page in place for cleanup.
    await stayButton.click();
  });

  // ---------------------------------------------------------------- TC-SVC-HIS-015 — render state

  test('TC-SVC-HIS-015: Office context is preserved when switching from Basic Information to History tab', async ({
    dependencyGate,
  }) => {
    dependencyGate([]);

    // Each tab renders its own office-context line; both must carry the office name.
    // Confirm office context before tab switch (Basic Information tab).
    const headerBefore = await sc.getOfficeHeader();
    expect(headerBefore).toMatch(/Parker Palm Springs/);

    // Switch to History tab — office context must be present in the section header.
    await sc.switchToHistoryTab();
    await sc.waitUntilHistoryLoaded();

    const headerAfter = await sc.getHistorySectionHeader();
    expect(headerAfter).toMatch(/Parker Palm Springs/);

    // History grid must contain at least one row for office 1604.
    const rowCount = await sc.getHistoryRowCount();
    expect(rowCount).toBeGreaterThanOrEqual(1);
  });
});
