import { test, expect } from '../../src/fixtures/pages.fixture';
import { RegionWeeklyPeaksPage } from '../../src/pages/discount-matrix/region-weekly-peaks.page';
import {
  DM_OFFICE,
  DM_CRITERIA_AT_REST,
  RWP_SEED_YEARS,
  RWP_YEAR_REFERENCE,
  RWP_REGION_COUNT,
  RWP_REGION_AT_REST,
  RWP_REGION_MID,
  RWP_REGION_LAST,
  RWP_REGION_LA_AL,
  RWP_REGION_SAMPLES,
  RWP_WEEK_COUNT,
  RWP_COLUMNS,
  RWP_2027_WEEK1_START,
} from '../../src/data/discount-matrix/discount-matrix';

/**
 * Discount Matrix — Region Weekly Peaks tab (NM-3530; grid behaviour per NM-2220).
 *
 * The tab loads in two stages: at the tab click the grid instantly shows its full 52 rows as
 * placeholders with zero checkboxes and a footer of `Count: 0`; real data lands ~40 seconds
 * later. Every ready gate waits for checkboxes and clear placeholders — row count cannot
 * tell loading from loaded, which is exactly what one test here proves.
 *
 * Tests share one signed-in page in file order; each starts by verifying the tab is loaded
 * and pristine, reloading if not. The classification model was measured on 2026-08-25:
 * ticking one box clears the previous one, and the ticked box can also be cleared to zero.
 *
 * The tab always rests on the NEWEST configured year, and the year-creation test at the
 * end of the surface block adds one permanent year per run (the app offers no way to
 * delete a year), so every year assertion here is either computed from the selector or
 * pinned to the fixed reference year. The import test restores its own change — the
 * exported workbook it feeds back in is the snapshot of the state it started from.
 */
test.describe.configure({ timeout: 420_000 });

/** Parses this grid's `DD-MMM-YYYY` start dates for the seven-day-sequence check. */
function parseStartDate(text: string): number {
  const m = text.match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/);
  if (!m || !m[1] || !m[2] || !m[3]) return NaN;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months.indexOf(m[2]);
  return Date.UTC(parseInt(m[3], 10), month, parseInt(m[1], 10));
}

// ---------------------------------------------------------------------------- surface cases

test.describe('SBC — Discount Matrix Region Weekly Peaks surface behaviors @discount-matrix @region-weekly-peaks', () => {
  let rwp: RegionWeeklyPeaksPage;

  test.beforeEach(async ({ authenticatedSession, config }) => {
    rwp = new RegionWeeklyPeaksPage(authenticatedSession.page, config);
    await rwp.ensureCleanRwp(DM_OFFICE);
  });

  test('TC-DSM-RWP-001: The tab opens on the newest year with a region selected', async ({ dependencyGate }) => {
    dependencyGate([]);
    await rwp.openTab();
    expect(await rwp.readFooterCount()).toBe(RWP_WEEK_COUNT);
    const { year, region } = await rwp.readSelections();
    // The tab rests on the newest configured year. The list grows as years are created,
    // so the expected value is computed from the selector itself, never a literal.
    expect(year).toBe(await rwp.newestYear());
    expect(region).toBe(RWP_REGION_AT_REST);
  });

  test('TC-DSM-RWP-004: The grid shows the five weekly-peak columns', async ({ dependencyGate }) => {
    dependencyGate([]);
    expect(await rwp.readColumnHeaders()).toEqual([...RWP_COLUMNS]);
  });

  test('TC-DSM-RWP-005: A loaded year shows 52 week rows and a matching footer count', async ({ dependencyGate }) => {
    dependencyGate([]);
    const rows = await rwp.readWeekRows();
    expect(rows.length).toBe(RWP_WEEK_COUNT);
    expect(await rwp.readFooterCount()).toBe(RWP_WEEK_COUNT);
  });

  test('TC-DSM-RWP-006: The grid is still loading while the footer reads zero', async ({ dependencyGate }) => {
    dependencyGate([]);
    // This case observes the loading state itself, so it needs a genuinely cold activation.
    await rwp.discardReload(DM_OFFICE);
    await rwp.openTabRaw();
    // Sampled during the ~40s loading window: full row frame, no checkboxes, zero count.
    const loadingRows = await rwp.readWeekRows();
    expect(loadingRows.length).toBe(RWP_WEEK_COUNT);
    expect(await rwp.checkboxCount()).toBe(0);
    expect(await rwp.readFooterCount()).toBe(0);
    // Once loading finishes, the same reads flip together.
    await rwp.waitForRwpReady();
    expect(await rwp.checkboxCount()).toBe(RWP_WEEK_COUNT * 3);
    expect(await rwp.readFooterCount()).toBe(RWP_WEEK_COUNT);
  });

  test('TC-DSM-RWP-008: Week rows are numbered in sequence with weekly start dates', async ({ dependencyGate }) => {
    dependencyGate([]);
    // Date-exact checks are pinned to the reference year — the tab itself rests on the
    // newest configured year, which changes as years are created.
    await rwp.selectYear(RWP_YEAR_REFERENCE);
    const rows = await rwp.readWeekRows();
    expect(rows.length).toBe(RWP_WEEK_COUNT);
    const first = rows[0]!;
    const second = rows[1]!;
    const last = rows[rows.length - 1]!;
    expect(first.week).toBe('1');
    expect(first.startDate).toBe(RWP_2027_WEEK1_START);
    expect(second.week).toBe('2');
    expect(second.startDate).toBe('09-Jan-2027');
    expect(last.week).toBe(String(RWP_WEEK_COUNT));
    const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1]!;
      const cur = rows[i]!;
      expect(parseStartDate(cur.startDate) - parseStartDate(prev.startDate),
        `week ${cur.week} start date must be seven days after week ${prev.week}`)
        .toBe(WEEK_MS);
    }
  });

  test('TC-DSM-RWP-011: Switching region reloads the grid for that region', async ({ dependencyGate }) => {
    dependencyGate([]);
    await rwp.selectRegion(RWP_REGION_MID);
    expect((await rwp.readSelections()).region).toBe(RWP_REGION_MID);
    expect((await rwp.readWeekRows()).length).toBe(RWP_WEEK_COUNT);
    expect(await rwp.readFooterCount()).toBe(RWP_WEEK_COUNT);
    await rwp.selectRegion(RWP_REGION_AT_REST);
    expect((await rwp.readSelections()).region).toBe(RWP_REGION_AT_REST);
  });

  test("TC-DSM-RWP-012: Switching year reloads the grid with that year's dates", async ({ dependencyGate }) => {
    dependencyGate([]);
    await rwp.selectYear('2026');
    expect((await rwp.readSelections()).year).toBe('2026');
    expect((await rwp.readWeekRows())[0]!.startDate).toMatch(/Jan-2026$/);
    await rwp.selectYear(RWP_YEAR_REFERENCE);
    expect((await rwp.readSelections()).year).toBe(RWP_YEAR_REFERENCE);
    expect((await rwp.readWeekRows())[0]!.startDate).toBe(RWP_2027_WEEK1_START);
  });

  test('TC-DSM-RWP-013: Region Weekly Peaks keeps the criteria bar above it', async ({ dependencyGate }) => {
    dependencyGate([]);
    // Starts from the landing tab by contract, so this test pays its own reload.
    await rwp.discardReload(DM_OFFICE);
    expect(await rwp.readCriteriaValues()).toEqual([...DM_CRITERIA_AT_REST]);
    await rwp.openTab();
    expect(await rwp.readCriteriaValues()).toEqual([...DM_CRITERIA_AT_REST]);
  });

  test("TC-DSM-RWP-015: Selecting 2025 reloads the grid with that year's dates", async ({ dependencyGate }) => {
    dependencyGate([]);
    await rwp.selectYear('2025');
    expect((await rwp.readSelections()).year).toBe('2025');
    expect((await rwp.readWeekRows())[0]!.startDate).toMatch(/Jan-2025$/);
    await rwp.selectYear(RWP_YEAR_REFERENCE);
    expect((await rwp.readSelections()).year).toBe(RWP_YEAR_REFERENCE);
    expect((await rwp.readWeekRows())[0]!.startDate).toBe(RWP_2027_WEEK1_START);
  });

  test('TC-DSM-RWP-016: Selecting the last region in the list reloads the grid', async ({ dependencyGate }) => {
    dependencyGate([]);
    await rwp.selectRegion(RWP_REGION_LAST);
    expect((await rwp.readSelections()).region).toBe(RWP_REGION_LAST);
    expect((await rwp.readWeekRows()).length).toBe(RWP_WEEK_COUNT);
    expect(await rwp.readFooterCount()).toBe(RWP_WEEK_COUNT);
    await rwp.selectRegion(RWP_REGION_AT_REST);
    expect((await rwp.readSelections()).region).toBe(RWP_REGION_AT_REST);
  });

  test('TC-DSM-RWP-019: A classification change survives a save and reload', async ({ dependencyGate }) => {
    dependencyGate([]);
    // Under load this tab's reloads run to ~130s and a settled save to ~60s, and the test
    // pays two full save-reload-read cycles, so it carries its own ceiling (measured from
    // the run traces, 2026-08-26).
    test.setTimeout(600_000);
    // Pin the year explicitly: earlier tests may leave the reference year selected, while
    // a reload always returns to the newest year — without the pin the save and the
    // read-back can land on two different years (the exact miss measured across three
    // full runs, 2026-08-26/27).
    const year = await rwp.newestYear();
    await rwp.selectYear(year);
    const before = await rwp.readWeekChecks('1');
    const originalIdx = before.findIndex((c) => c);
    expect(originalIdx).toBeGreaterThanOrEqual(0);
    const targetIdx = (originalIdx + 1) % 3;
    let saved = false;
    try {
      await rwp.clickWeekCheck('1', targetIdx);
      // The tick must be visible in the grid before Save: under load the grid state can lag
      // the click, and a save built from the stale state returns success having changed
      // nothing (measured from the run traces, 2026-08-26).
      await expect
        .poll(async () => (await rwp.readWeekChecks('1'))[targetIdx], { timeout: 30_000 })
        .toBe(true);
      expect(await rwp.waitForPanelSaveEnabled(true)).toBe(true);
      await rwp.clickPanelSave();
      saved = true;
      // Save greys out the instant it is clicked — only the reload proves persistence.
      await rwp.discardReload(DM_OFFICE);
      await rwp.openTab();
      // Same pin after the reload, so the read-back provably targets the saved year.
      await rwp.selectYear(year);
      const after = await rwp.readWeekChecks('1');
      expect(after[targetIdx]).toBe(true);
      expect(after.filter(Boolean).length).toBe(1);
    } finally {
      if (saved) {
        // Restore through a verified click-save-reload-read cycle. The first version of
        // this restore skipped its save whenever the button was slow to enable, which
        // leaked the test's classification to the shared server.
        await rwp.persistWeekClassification('1', originalIdx);
        const restored = await rwp.readWeekChecks('1');
        expect(restored[originalIdx]).toBe(true);
        expect(restored.filter(Boolean).length).toBe(1);
      }
    }
  });

  test('TC-DSM-RWP-020: Switching to the LA / AL region loads that region\'s complete weekly grid', async ({ dependencyGate }) => {
    dependencyGate([]);
    try {
      await rwp.selectRegion(RWP_REGION_LA_AL);
      expect((await rwp.readSelections()).region).toBe(RWP_REGION_LA_AL);
      // The full classified year must be present — this region carries the module's
      // defect history (NM-3293), so an empty or partial set here is a regression.
      expect((await rwp.readWeekRows()).length).toBe(RWP_WEEK_COUNT);
      expect(await rwp.checkboxCount()).toBe(RWP_WEEK_COUNT * 3);
      expect(await rwp.readFooterCount()).toBe(RWP_WEEK_COUNT);
      for (const week of ['1', '2', '3', '4', '5']) {
        expect((await rwp.readWeekChecks(week)).filter(Boolean).length).toBe(1);
      }
    } finally {
      // Restore the resting region for the tests that follow. Nothing was edited.
      await rwp.selectRegion(RWP_REGION_AT_REST);
    }
    expect((await rwp.readSelections()).region).toBe(RWP_REGION_AT_REST);
  });

  test('TC-DSM-RWP-021: Cancel discards a pending classification change and closes the toolbar', async ({ dependencyGate }) => {
    dependencyGate([]);
    const before = await rwp.readWeekChecks('1');
    const originalIdx = before.findIndex((c) => c);
    expect(originalIdx).toBeGreaterThanOrEqual(0);
    const restingToolbar = await rwp.readToolbarDisabled();
    expect(restingToolbar['Cancel']).toBe(true);
    expect(restingToolbar['Save']).toBe(true);
    const targetIdx = (originalIdx + 1) % 3;
    await rwp.clickWeekCheck('1', targetIdx);
    expect(await rwp.waitForPanelSaveEnabled(true)).toBe(true);
    await expect(rwp.toolbarButton('Cancel')).toBeEnabled();
    // Cancel throws the pending edit away. A past defect (NM-3485) had Cancel reverting
    // values that were already saved and leaving Save enabled — this pins the corrected
    // contract. Nothing is saved at any point in this test.
    await rwp.toolbarButton('Cancel').click();
    await expect.poll(async () => (await rwp.readWeekChecks('1'))[originalIdx]).toBe(true);
    const after = await rwp.readWeekChecks('1');
    expect(after[targetIdx]).toBe(false);
    expect(after.filter(Boolean).length).toBe(1);
    const closedToolbar = await rwp.readToolbarDisabled();
    expect(closedToolbar['Cancel']).toBe(true);
    expect(closedToolbar['Save']).toBe(true);
  });

  test('TC-DSM-RWP-022: Add Year creates the next year as a full copy of the previous one', async ({ dependencyGate }) => {
    dependencyGate([]);
    // Year creation is server-side and permanent — the app offers no way to delete a
    // year — so this test always creates the year AFTER the newest, which keeps every
    // run repeatable. The window's own load and the creation itself are both slow by a
    // tracked performance issue (NM-3074), hence the long budget.
    test.setTimeout(900_000);
    const yearsBefore = await rwp.readYearOptions();
    const newestBefore = Math.max(...yearsBefore.map(Number));
    const target = String(newestBefore + 1);
    await rwp.openCreateYear();
    await rwp.waitForCreateYearReady();
    const offered = await rwp.readOfferedYears();
    expect(offered[0], 'the first offered year is the one after the newest').toBe(target);
    for (const offer of offered) {
      expect(yearsBefore, `"${offer}" must not already be configured`).not.toContain(offer);
    }
    // "Initialize with previous year" is on by default — the new year arrives as a copy.
    expect(await rwp.initPrevYearChecked()).toBe(true);
    await rwp.createYear(target);
    const yearsAfter = await rwp.readYearOptions();
    expect(yearsAfter[0], 'the created year joins the top of the list').toBe(target);
    // A fresh load rests on the created year — the tab always opens on the newest.
    await rwp.discardReload(DM_OFFICE);
    await rwp.openTab();
    expect((await rwp.readSelections()).year).toBe(target);
    // The default initialize option copies the previous year's whole classification.
    const rows = await rwp.readWeekRows();
    expect(rows.length).toBe(RWP_WEEK_COUNT);
    for (const row of rows) {
      expect(row.checks.filter(Boolean).length,
        `week ${row.week} of the created year must carry its copied classification`).toBe(1);
    }
  });

  test('TC-DSM-RWP-023: Export downloads the full peak workbook without any window', async ({ dependencyGate }) => {
    dependencyGate([]);
    // Export is a one-click download covering every region of the selected year — no
    // window, no chooser. Running it from a non-default region proves the button is not
    // tied to the resting state.
    await rwp.selectRegion(RWP_REGION_LAST);
    const { filename, bytes } = await rwp.exportDownload();
    expect(filename).toMatch(/^RegionWeeklyPeakExport_.*\.xlsx$/);
    // The workbook carries a banner row, the 52-week header, a start-date row and one
    // classification row per region — several kilobytes. An error page or an empty
    // download is far smaller.
    expect(bytes).toBeGreaterThan(4_000);
    await rwp.selectRegion(RWP_REGION_AT_REST);
  });

  test('TC-DSM-RWP-024: Import applies an exported workbook and persists it without Save', async ({ dependencyGate }) => {
    dependencyGate([]);
    // Full round-trip on a non-default region: snapshot the current state with Export,
    // save a real change away from it, feed the snapshot back through Import, and prove
    // the import both reached the grid and persisted on its own — Save is never clicked
    // after the import. Import processing is slow by a tracked performance issue
    // (NM-3074), hence the long budget.
    test.setTimeout(1_200_000);
    const year = await rwp.newestYear();
    await rwp.selectYear(year);
    await rwp.selectRegion(RWP_REGION_MID);
    let before = await rwp.readWeekChecks('1');
    if (!before.some(Boolean)) {
      // A crashed earlier run can leave this week unclassified — repair the baseline
      // with a real, verified save before the round-trip begins.
      await rwp.clickWeekCheck('1', 0);
      // The tick must be visible before Save — a save built from a stale grid state
      // returns success having changed nothing.
      await expect
        .poll(async () => (await rwp.readWeekChecks('1'))[0], { timeout: 30_000 })
        .toBe(true);
      expect(await rwp.waitForPanelSaveEnabled(true)).toBe(true);
      await rwp.clickPanelSave();
      await rwp.discardReload(DM_OFFICE);
      await rwp.openTab();
      await rwp.selectYear(year);
      await rwp.selectRegion(RWP_REGION_MID);
      before = await rwp.readWeekChecks('1');
    }
    const originalIdx = before.findIndex((c) => c);
    expect(originalIdx).toBeGreaterThanOrEqual(0);
    // The exported file snapshots today's state for every region — it is the restore vehicle.
    const exported = await rwp.exportDownload();
    expect(exported.path.length).toBeGreaterThan(0);
    // Save a real change away from the snapshot: clear week 1 and prove the clear landed.
    await rwp.clickWeekCheck('1', originalIdx);
    // The uncheck must be visible before Save — a save built from a stale grid state
    // returns success having changed nothing.
    await expect
      .poll(async () => (await rwp.readWeekChecks('1'))[originalIdx], { timeout: 30_000 })
      .toBe(false);
    expect(await rwp.waitForPanelSaveEnabled(true)).toBe(true);
    await rwp.clickPanelSave();
    await rwp.discardReload(DM_OFFICE);
    await rwp.openTab();
    await rwp.selectYear(year);
    await rwp.selectRegion(RWP_REGION_MID);
    expect((await rwp.readWeekChecks('1')).filter(Boolean).length,
      'the cleared week must survive a reload before the import is trusted to undo it').toBe(0);
    // Import the snapshot: it applies to the grid by itself, with no window and no Save...
    await rwp.importFile(exported.path);
    await expect
      .poll(async () => (await rwp.readWeekChecks('1'))[originalIdx], { timeout: 300_000 })
      .toBe(true);
    // ...and persists by itself — reload with no Save click and the tick is still there.
    await rwp.discardReload(DM_OFFICE);
    await rwp.openTab();
    await rwp.selectYear(year);
    await rwp.selectRegion(RWP_REGION_MID);
    const restored = await rwp.readWeekChecks('1');
    expect(restored[originalIdx]).toBe(true);
    expect(restored.filter(Boolean).length).toBe(1);
    // Leave the tab on its resting region — later tests assert the resting page and must
    // not inherit this test's selection.
    await rwp.selectRegion(RWP_REGION_AT_REST);
    expect((await rwp.readSelections()).region).toBe(RWP_REGION_AT_REST);
  });

  test('TC-DSM-RWP-025: Changing Country re-scopes the weekly grid and switching back restores it', async ({
    dependencyGate,
  }) => {
    dependencyGate([]);
    // Two country switches, each re-scoping the whole tab (~40s of loading either way).
    test.setTimeout(600_000);
    const before = await rwp.readSelections();
    const week1Before = await rwp.readWeekChecks('1');
    expect(before.region).toBe(RWP_REGION_AT_REST);

    // Country -> Canada. Measured 2026-08-27: the tab holds focus, Currency follows the
    // country on its own, and the tab re-rests on a region of the new country.
    await rwp.selectCriteria(0, 'Canada');
    await expect
      .poll(async () => (await rwp.readCriteriaValues())[1], { timeout: 60_000 })
      .toBe('CAD');
    expect(await rwp.getActiveTabName()).toBe('Region Weekly Peaks');
    await expect
      .poll(async () => (await rwp.readSelections()).region, { timeout: 120_000 })
      .not.toBe(RWP_REGION_AT_REST);
    // A country choice is navigation, not an edit — nothing to save.
    expect(await rwp.isCriteriaSaveEnabled()).toBe(false);

    // Country -> United States: the full original state must return.
    await rwp.selectCriteria(0, 'United States');
    await expect
      .poll(async () => rwp.readCriteriaValues(), { timeout: 60_000 })
      .toEqual([...DM_CRITERIA_AT_REST]);
    await rwp.waitForRwpReady();
    await expect
      .poll(async () => rwp.readSelections(), { timeout: 120_000 })
      .toEqual(before);
    expect(await rwp.readWeekChecks('1')).toEqual(week1Before);
    expect(await rwp.isCriteriaSaveEnabled()).toBe(false);
  });

  test('TC-DSM-RWP-026: The threshold saves from this tab, independent of the tab Save', async ({
    dependencyGate,
  }) => {
    dependencyGate([]);
    // Two saves riding the page's ~30s sync POST plus reloads on a page whose evening
    // hydration has been measured past 180s — the budget is the sum of measured costs.
    test.setTimeout(1_200_000);
    const baseline = (await rwp.readThreshold()).replace(/[^0-9.]/g, '');
    // A value different from the live one — saving an unchanged value is a no-op the app
    // blocks by keeping Save disabled.
    const target = baseline === '20' ? '30' : '20';
    let saved = false;
    try {
      await rwp.typeThreshold(target);
      await rwp.blurThreshold();
      expect(await rwp.waitForCriteriaSaveEnabled()).toBe(true);
      // A bar edit must never mark the weekly grid dirty — the two Saves are independent.
      expect(await rwp.waitForPanelSaveEnabled(false)).toBe(true);
      // A pending bar edit rides tab navigation freely: no warning, value kept.
      await rwp.clickTab('Company Matrix');
      expect(await rwp.readThreshold()).toBe(`${target}%`);
      await rwp.openTab();
      expect(await rwp.readThreshold()).toBe(`${target}%`);
      expect(await rwp.isCriteriaSaveEnabled()).toBe(true);
      // Save from THIS tab; only the reload proves the commit.
      await rwp.clickCriteriaSave();
      saved = true;
      await rwp.discardReload(DM_OFFICE);
      expect(await rwp.readThreshold()).toBe(`${target}%`);
    } finally {
      if (saved) {
        // Restore through the verifying save-reload-read helper, so a slow enable can never
        // silently skip the restore and leak the test's value to the shared server.
        await rwp.persistThreshold(baseline);
      }
    }
  });
});

// ---------------------------------------------------------------------------- field cases

test.describe('Discount Matrix Region Weekly Peaks — fields @discount-matrix @region-weekly-peaks', () => {
  let rwp: RegionWeeklyPeaksPage;

  test.beforeEach(async ({ authenticatedSession, config }) => {
    rwp = new RegionWeeklyPeaksPage(authenticatedSession.page, config);
    await rwp.ensureCleanRwp(DM_OFFICE);
  });

  test('TC-DSM-RWP-002: Select Year lists the configured years, newest first', async ({ dependencyGate }) => {
    dependencyGate([]);
    // The list grows as years are created and years can never be removed, so the
    // contract is its shape: strictly descending, ending with the three seed years.
    const options = await rwp.readYearOptions();
    const numeric = options.map(Number);
    for (let i = 1; i < numeric.length; i++) {
      expect(numeric[i - 1]!, `the list must descend around "${options[i]}"`).toBeGreaterThan(numeric[i]!);
    }
    expect(options.slice(-RWP_SEED_YEARS.length)).toEqual([...RWP_SEED_YEARS]);
    expect(options).toContain((await rwp.readSelections()).year);
  });

  test('TC-DSM-RWP-003: Region offers the full set of 28 regions', async ({ dependencyGate }) => {
    dependencyGate([]);
    const options = await rwp.readRegionOptions();
    expect(options.length).toBe(RWP_REGION_COUNT);
    for (const sample of RWP_REGION_SAMPLES) {
      expect(options, `region list must contain "${sample}"`).toContain(sample);
    }
    expect((await rwp.readSelections()).region).toBe(RWP_REGION_AT_REST);
  });

  test('TC-DSM-RWP-007: Each week row carries exactly one peak classification', async ({ dependencyGate }) => {
    dependencyGate([]);
    const rows = await rwp.readWeekRows();
    expect(rows.length).toBe(RWP_WEEK_COUNT);
    const totalBoxes = rows.reduce((n, r) => n + r.checks.length, 0);
    expect(totalBoxes).toBe(RWP_WEEK_COUNT * 3);
    for (const row of rows) {
      expect(row.checks.filter(Boolean).length,
        `week ${row.week} must carry exactly one classification`).toBe(1);
    }
  });

  test('TC-DSM-RWP-009: Data actions are open and edit actions closed at rest', async ({ dependencyGate }) => {
    dependencyGate([]);
    // The at-rest contract needs a genuinely fresh activation.
    await rwp.discardReload(DM_OFFICE);
    await rwp.openTab();
    // Once the tab is loaded with its year and region selected, the data actions are
    // available while the edit pair stays closed until a row changes. (An earlier draft
    // expected everything disabled — that was a read taken during the loading window.)
    const disabled = await rwp.readToolbarDisabled();
    expect(disabled['Add Year'], 'Add Year is available at rest').toBe(false);
    expect(disabled['Export'], 'Export is available at rest').toBe(false);
    expect(disabled['Import'], 'Import is available at rest').toBe(false);
    expect(disabled['Cancel'], 'Cancel stays closed until an edit').toBe(true);
    expect(disabled['Save'], 'Save stays closed until an edit').toBe(true);
  });

  test('TC-DSM-RWP-010: Cancel and Save stay disabled while nothing has been edited', async ({ dependencyGate }) => {
    dependencyGate([]);
    const before = await rwp.readToolbarDisabled();
    expect(before['Cancel']).toBe(true);
    expect(before['Save']).toBe(true);
    // Browsing a list is not an edit.
    await rwp.openAndDismissRegion();
    const after = await rwp.readToolbarDisabled();
    expect(after['Cancel']).toBe(true);
    expect(after['Save']).toBe(true);
  });

  test('TC-DSM-RWP-014: A ticked classification can be cleared, leaving the week unclassified', async ({ dependencyGate }) => {
    dependencyGate([]);
    const before = await rwp.readWeekChecks('1');
    const originalIdx = before.findIndex((c) => c);
    expect(originalIdx).toBeGreaterThanOrEqual(0);
    // Clicking the ticked box clears it — the week is left with no classification at all,
    // and Save offers to commit that state. Nothing is saved here; the case stops before
    // Save on purpose and records the contradiction with the one-per-row rule.
    await rwp.clickWeekCheck('1', originalIdx);
    const cleared = await rwp.readWeekChecks('1');
    expect(cleared.filter(Boolean).length).toBe(0);
    expect(await rwp.waitForPanelSaveEnabled(true)).toBe(true);
    // Restore: tick the original box again.
    await rwp.clickWeekCheck('1', originalIdx);
    const restored = await rwp.readWeekChecks('1');
    expect(restored[originalIdx]).toBe(true);
    expect(await rwp.waitForPanelSaveEnabled(false)).toBe(true);
  });

  test('TC-DSM-RWP-017: Choosing a different classification moves it off the previous one', async ({ dependencyGate }) => {
    dependencyGate([]);
    const before = await rwp.readWeekChecks('1');
    const originalIdx = before.findIndex((c) => c);
    expect(originalIdx).toBeGreaterThanOrEqual(0);
    expect(before.filter(Boolean).length).toBe(1);
    const targetIdx = (originalIdx + 1) % 3;
    // The app clears the old selection by itself — the three columns are one choice.
    await rwp.clickWeekCheck('1', targetIdx);
    const after = await rwp.readWeekChecks('1');
    expect(after[targetIdx]).toBe(true);
    expect(after[originalIdx]).toBe(false);
    expect(after.filter(Boolean).length).toBe(1);
    expect(await rwp.waitForPanelSaveEnabled(true)).toBe(true);
    // Restore: move the tick back. Nothing was saved.
    await rwp.clickWeekCheck('1', originalIdx);
    const restored = await rwp.readWeekChecks('1');
    expect(restored[originalIdx]).toBe(true);
    expect(restored.filter(Boolean).length).toBe(1);
  });

  test('TC-DSM-RWP-018: Undoing a classification change returns Save to disabled', async ({ dependencyGate }) => {
    dependencyGate([]);
    const before = await rwp.readWeekChecks('1');
    const originalIdx = before.findIndex((c) => c);
    expect(originalIdx).toBeGreaterThanOrEqual(0);
    const targetIdx = (originalIdx + 1) % 3;
    await rwp.clickWeekCheck('1', targetIdx);
    expect(await rwp.waitForPanelSaveEnabled(true)).toBe(true);
    // Clicking the originally ticked box back cancels the edit entirely.
    await rwp.clickWeekCheck('1', originalIdx);
    expect(await rwp.waitForPanelSaveEnabled(false)).toBe(true);
  });
});
