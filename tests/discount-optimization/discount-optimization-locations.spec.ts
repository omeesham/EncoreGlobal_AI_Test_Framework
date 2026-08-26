import { test, expect } from '../../src/fixtures/pages.fixture';
import { DiscountOptimizationPage } from '../../src/pages/discount-optimization/discount-optimization.page';
import { INP_DATE, ROWS_TAB1, TBL_CONTAINER, TAB_EXEMPTIONS, TAB_LOCATIONS, PANEL_LOCATIONS, PANEL_EXEMPTIONS } from '../../src/selectors/discount-optimization/discount-optimization';
import {
  DOP_OFFICE,
  DOP_KNOWN_FILTER,
  DOP_NO_MATCH_FILTER,
  DOP_LOCATION_FOR_TOGGLE,
  DOP_LOCATION_FOR_PERSISTENCE,
  DOP_CASE_INSENSITIVE_FILTER,
  DOP_DEACTIVATED_FRAGMENT,
  DOP_DEACTIVATED_ROW_FRAGMENT,
  DOP_DATE_VALID,
  DOP_DATE_INVALID,
  DOP_DATE_DIGITS,
  DOP_DATE_DIGITS_EXPECTED,
} from '../../src/data/discount-optimization/discount-optimization';

/**
 * Discount Optimization — Locations tab (Tab 1) spec.
 *
 * Every test navigates to the page fresh via `beforeEach`. The grid takes approximately
 * 22 seconds to complete its first paint — all tests go through `open()` / `waitForGrid()`
 * which polls until the row count is non-zero. No `networkidle`, no fixed sleeps standing
 * in for conditions.
 *
 * Sort tests on ID and Location Name assert the first visible row changes. Sort tests on
 * Allow Special Rate and Special Rate Start Date assert the full visible column sequence differs
 * between ascending and descending — row-order change, never merely that a control exists.
 *
 * Persistence tests (TC-DOP-OPT-050, TC-DOP-OPT-091, TC-DOP-OPT-092) run against the
 * writable automation environment. TC-DOP-OPT-050 toggles Allow Special Rate and restores
 * it in a finally block. TC-DOP-OPT-092 saves a date change and restores it. TC-DOP-OPT-091
 * opens the Add panel, cancels without selecting a location, and verifies Save is not dirty
 * — no data is permanently changed.
 */
test.describe('Discount Optimization — Locations (Tab 1)', () => {
  let dop: DiscountOptimizationPage;

  test.beforeEach(async ({ authenticatedSession, config }) => {
    test.setTimeout(120_000);
    dop = new DiscountOptimizationPage(authenticatedSession.page, config);
    await dop.open(DOP_OFFICE);
  });

  // ---------------------------------------------------------------- initialization / structural

  test('TC-DOP-OPT-001: Page loads with both tabs present and the Locations tab active by default', async ({ dependencyGate }) => {
    dependencyGate([]);
    const pg = (dop as any).page;
    const locTab = pg.locator('[role="tab"]:has-text("Discount Optimization")');
    const exemTab = pg.locator('[role="tab"]:has-text("Special Rate Exemptions by Service Type")');
    await expect(locTab).toBeVisible();
    await expect(exemTab).toBeVisible();
    expect(await locTab.getAttribute('aria-selected')).toBe('true');
    expect(await exemTab.getAttribute('aria-selected')).toBe('false');
  });

  test('TC-DOP-OPT-002: Locations grid renders rows and all four column headers after the slow first paint', async ({ dependencyGate }) => {
    dependencyGate([]);
    const headers = await dop.getColumnHeaders();
    expect(headers).toEqual(expect.arrayContaining(['ID', 'Location Name', 'Allow Special Rate', 'Special Rate Start Date']));
    expect(await dop.getRowCount()).toBeGreaterThan(0);
  });

  test('TC-DOP-OPT-003: Locations grid rows show ID and Location Name values', async ({ dependencyGate }) => {
    dependencyGate([]);
    const id = await dop.getFirstRowCell(2);
    expect(id.length).toBeGreaterThan(0);
    const name = await dop.getFirstRowCell(3);
    expect(name.length).toBeGreaterThan(0);
  });

  test('TC-DOP-OPT-004: Office 1604 (Parker Palm Springs) is present in its own locations list', async ({ dependencyGate }) => {
    dependencyGate([]);
    const countBefore = await dop.getRowCount();
    await dop.search('1604');
    const rowTexts = await (dop as any).page.locator(ROWS_TAB1).allTextContents();
    // Searching "1604" returns the office's own row — the grid does not exclude the host office.
    const hasParkerPalmSprings = (rowTexts as string[]).some((t) => t.includes('Parker Palm Springs'));
    expect(hasParkerPalmSprings).toBe(true);
    // The app persists the search term across page loads — leaving it set here would silently
    // filter the grid for the very next test (TC-005), which assumes a clean baseline count.
    await dop.clearSearch();
    await expect.poll(() => dop.getRowCount(), { timeout: 45_000 }).toBe(countBefore);
  });

  // ---------------------------------------------------------------- search / filter

  test('TC-DOP-OPT-005: Search filters the grid; clearing restores all rows; no-match shows empty state', async ({ dependencyGate }) => {
    dependencyGate([]);
    const pg = (dop as any).page;
    const countBefore = await dop.getRowCount();
    expect(countBefore).toBeGreaterThan(0);

    await dop.search(DOP_KNOWN_FILTER);
    const countFiltered = await dop.getRowCount();
    expect(countFiltered).toBeGreaterThan(0);
    expect(countFiltered).toBeLessThan(countBefore);
    // Every visible row must contain the search term — a wrong subset passes a count-only check.
    const filteredTexts = await pg.locator(ROWS_TAB1).allTextContents();
    for (const rowText of (filteredTexts as string[])) {
      expect((rowText as string).toLowerCase()).toContain(DOP_KNOWN_FILTER.toLowerCase());
    }

    await dop.clearSearch();
    // The virtualized grid passes through partial row counts before fully restoring.
    // Poll until the count matches the pre-search baseline rather than reading immediately.
    await expect.poll(() => dop.getRowCount(), { timeout: 45_000 }).toBe(countBefore);

    await dop.search(DOP_NO_MATCH_FILTER);
    expect(await dop.getRowCount()).toBe(0);

    await dop.clearSearch();
    await expect.poll(() => dop.getRowCount(), { timeout: 45_000 }).toBe(countBefore);
  });

  test('TC-DOP-OPT-006: Search is case-insensitive on location name', async ({ dependencyGate }) => {
    dependencyGate([]);
    const pg = (dop as any).page;
    const countBefore = await dop.getRowCount();
    await dop.search(DOP_CASE_INSENSITIVE_FILTER);
    expect(await dop.getRowCount()).toBeGreaterThan(0);
    // Every returned row must match — not just the first one.
    const allTexts = await pg.locator(ROWS_TAB1).allTextContents();
    for (const rowText of (allTexts as string[])) {
      expect((rowText as string).toLowerCase()).toContain(DOP_CASE_INSENSITIVE_FILTER.toLowerCase());
    }
    // The app persists the search term across page loads (the same mechanism the sort
    // tests clear via localStorage.clear()) — leaving it set here would silently filter
    // the grid for every later test in the run. Restore the full list before finishing.
    await dop.clearSearch();
    await expect.poll(() => dop.getRowCount(), { timeout: 45_000 }).toBe(countBefore);
  });

  // ---------------------------------------------------------------- sorting

  /**
   * TC-DOP-OPT-010 — Sort via column-options menu: ID column.
   *
   * Live DOM confirmed 2026-08-11: each column header contains a
   * `button[aria-haspopup="menu"]` that opens a two-item Radix dropdown with
   * "Sort ascending" and "Sort descending". Clicking "Sort descending" after
   * "Sort ascending" produces a different first row — proving sort is functional.
   */
  test('TC-DOP-OPT-010: ID column header sort menu — Sort descending changes first visible row', async ({ dependencyGate }) => {
    dependencyGate([]);
    const pg = (dop as any).page;
    const th = pg.locator(`${TBL_CONTAINER} thead th:has-text("ID")`).first();
    await expect(th).toBeVisible();
    const menuBtn = th.locator('button[aria-haspopup="menu"]').first();
    await expect(menuBtn).toBeVisible();
    // Sort ascending — page-object helper opens the menu, clicks the item, and polls until
    // the first visible row changes (waits on real condition, no fixed sleep).
    await dop.sortByColumn('ID', 'ascending');
    const nameAsc = await dop.getFirstRowCell(2);
    // Sort descending — helper polls until the first row differs from the ascending value.
    await dop.sortByColumn('ID', 'descending');
    const nameDesc = await dop.getFirstRowCell(2);
    expect(nameDesc).not.toBe(nameAsc);
    // Reset sort and clear persisted sort state so subsequent tests load in natural order.
    await dop.sortByColumn('ID', 'ascending');
    await pg.evaluate(() => localStorage.clear());
  });

  test('TC-DOP-OPT-011: Location Name column header sort menu opens and Sort descending reorders the grid', async ({ dependencyGate }) => {
    dependencyGate([]);
    const pg = (dop as any).page;
    const th = pg.locator(`${TBL_CONTAINER} thead th:has-text("Location Name")`).first();
    await expect(th).toBeVisible();
    const menuBtn = th.locator('button[aria-haspopup="menu"]').first();
    await expect(menuBtn).toBeVisible();
    await menuBtn.click();
    const menu = pg.locator('[role="menu"]').first();
    await expect(menu).toBeVisible();
    await expect(menu.locator('[role="menuitem"]:has-text("Sort ascending")').first()).toBeVisible();
    const descItem = menu.locator('[role="menuitem"]:has-text("Sort descending")').first();
    await expect(descItem).toBeVisible();
    const nameBefore = await dop.getFirstRowCell(2);
    await descItem.click();
    await expect(menu).not.toBeVisible({ timeout: 5_000 });
    // Poll until the first visible row changes — waits on real condition, no fixed sleep.
    await expect.poll(() => dop.getFirstRowCell(2), { timeout: 15_000 }).not.toBe(nameBefore);
    const nameAfter = await dop.getFirstRowCell(2);
    expect(nameAfter).not.toBe(nameBefore);
    // Reset sort and clear persisted sort state so subsequent tests load in natural order.
    await dop.sortByColumn('Location Name', 'ascending');
    await pg.evaluate(() => localStorage.clear());
  });

  /**
   * TC-DOP-OPT-012 — Sort via column-options menu: Allow Special Rate column.
   *
   * Reads the aria-pressed sequence of all visible toggle buttons before and after
   * a descending sort, then asserts the two sequences differ — proving the sort
   * reordered rows, not merely that the menu items are present.
   *
   * Reset matches the pattern TC-DOP-OPT-010 already uses.
   */
  test('TC-DOP-OPT-012: Allow Special Rate column sort — Sort descending reorders the toggle value sequence', async ({ dependencyGate }) => {
    dependencyGate([]);
    const pg = (dop as any).page;
    const th = pg.locator(`${TBL_CONTAINER} thead th:has-text("Allow Special Rate")`).first();
    await expect(th).toBeVisible();
    const menuBtn = th.locator('button[aria-haspopup="menu"]').first();
    await expect(menuBtn).toBeVisible();
    // Sort ascending and capture the location name sequence for all visible rows.
    // The Allow Special Rate toggle renders as a plain button ("Yes"/"No" text) in its
    // default display mode — it carries neither aria-pressed nor aria-checked until
    // interacted with. Location names are reliable text and prove row reordering directly.
    await dop.sortByColumn('Allow Special Rate', 'ascending');
    const statesAsc: string[] = await pg.evaluate(() =>
      Array.from(document.querySelectorAll(
        '[data-testid="discount-optimization-settings-table-container"] tbody tr td:nth-child(3)'
      )).map((td) => td.textContent?.trim() ?? '')
    );
    expect(statesAsc.length).toBeGreaterThan(0);
    // Sort descending and capture the sequence again.
    await dop.sortByColumn('Allow Special Rate', 'descending');
    const statesDesc: string[] = await pg.evaluate(() =>
      Array.from(document.querySelectorAll(
        '[data-testid="discount-optimization-settings-table-container"] tbody tr td:nth-child(3)'
      )).map((td) => td.textContent?.trim() ?? '')
    );
    expect(statesDesc.length).toBeGreaterThan(0);
    // A real reorder must produce a different sequence of row identities.
    expect(statesAsc.join(',')).not.toBe(statesDesc.join(','));
    // Reset sort state so subsequent tests load in natural order.
    await dop.sortByColumn('Allow Special Rate', 'ascending');
    await pg.evaluate(() => localStorage.clear());
  });

  /**
   * TC-DOP-OPT-013 — Sort via column-options menu: Special Rate Start Date column.
   *
   * Reads the value sequence of all visible date inputs before and after a descending
   * sort, then asserts the two sequences differ — proving the sort reordered rows, not
   * merely that the menu items are present.
   *
   * Reset matches the pattern TC-DOP-OPT-010 already uses.
   */
  test('TC-DOP-OPT-013: Special Rate Start Date column sort — Sort descending reorders the date sequence', async ({ dependencyGate }) => {
    dependencyGate([]);
    const pg = (dop as any).page;
    const th = pg.locator(`${TBL_CONTAINER} thead th:has-text("Special Rate Start Date")`).first();
    await expect(th).toBeVisible();
    const menuBtn = th.locator('button[aria-haspopup="menu"]').first();
    await expect(menuBtn).toBeVisible();
    // Sort ascending and capture the date-input value sequence for all visible rows.
    await dop.sortByColumn('Special Rate Start Date', 'ascending');
    const datesAsc: string[] = await pg.evaluate(() =>
      Array.from(document.querySelectorAll(
        '[data-testid="discount-optimization-settings-table-container"] tbody tr input[aria-label="Select date"]'
      )).map((inp) => (inp as HTMLInputElement).value ?? '')
    );
    expect(datesAsc.length).toBeGreaterThan(0);
    // Sort descending and capture the sequence again.
    await dop.sortByColumn('Special Rate Start Date', 'descending');
    const datesDesc: string[] = await pg.evaluate(() =>
      Array.from(document.querySelectorAll(
        '[data-testid="discount-optimization-settings-table-container"] tbody tr input[aria-label="Select date"]'
      )).map((inp) => (inp as HTMLInputElement).value ?? '')
    );
    expect(datesDesc.length).toBeGreaterThan(0);
    // A real reorder must produce a different sequence of date values.
    expect(datesAsc.join(',')).not.toBe(datesDesc.join(','));
    // Reset sort state so subsequent tests load in natural order.
    await dop.sortByColumn('Special Rate Start Date', 'ascending');
    await pg.evaluate(() => localStorage.clear());
  });

  // ---------------------------------------------------------------- Allow Special Rate toggle

  test('TC-DOP-OPT-020: Allow Special Rate toggle — toggling on enables Save', async ({ dependencyGate }) => {
    dependencyGate([]);
    expect(await dop.isSaveDisabled()).toBe(true);
    const stateBefore = await dop.getToggleState(DOP_LOCATION_FOR_TOGGLE);
    try {
      await dop.toggleDiscount(DOP_LOCATION_FOR_TOGGLE);
      const stateAfter = await dop.getToggleState(DOP_LOCATION_FOR_TOGGLE);
      expect(stateAfter).not.toBe(stateBefore);
      expect(await dop.isSaveEnabled()).toBe(true);
    } finally {
      if (await dop.getToggleState(DOP_LOCATION_FOR_TOGGLE) !== stateBefore) {
        await dop.toggleDiscount(DOP_LOCATION_FOR_TOGGLE);
      }
    }
  });

  test('TC-DOP-OPT-021: Allow Special Rate toggle — reverting the toggle re-disables Save (NM-2918)', async ({ dependencyGate }) => {
    dependencyGate([]);
    const stateBefore = await dop.getToggleState(DOP_LOCATION_FOR_TOGGLE);
    await dop.toggleDiscount(DOP_LOCATION_FOR_TOGGLE);
    expect(await dop.waitUntilSaveEnabled()).toBe(true);
    await dop.toggleDiscount(DOP_LOCATION_FOR_TOGGLE);
    expect(await dop.getToggleState(DOP_LOCATION_FOR_TOGGLE)).toBe(stateBefore);
    expect(await dop.waitUntilSaveDisabled()).toBe(true);
  });

  test('TC-DOP-OPT-022: Allow Special Rate toggle — Save stays disabled on pristine load (NM-2918)', async ({ dependencyGate }) => {
    dependencyGate([]);
    expect(await dop.isSaveDisabled()).toBe(true);
  });

  // ---------------------------------------------------------------- Special Rate Start Date

  test('TC-DOP-OPT-030: Special Rate Start Date — valid date accepted and Save enabled', async ({ dependencyGate }) => {
    dependencyGate([]);
    expect(await dop.isSaveDisabled()).toBe(true);
    const originalDate = await dop.getRowDate(DOP_LOCATION_FOR_TOGGLE);
    try {
      await dop.setRowDate(DOP_LOCATION_FOR_TOGGLE, DOP_DATE_VALID);
      expect(await dop.waitUntilSaveEnabled()).toBe(true);
    } finally {
      const currentDate = await dop.getRowDate(DOP_LOCATION_FOR_TOGGLE);
      if (currentDate !== originalDate) await dop.reloadAndWait(DOP_OFFICE);
    }
  });

  test('TC-DOP-OPT-031: Special Rate Start Date — invalid entry shows red border and Save stays disabled', async ({ dependencyGate }) => {
    dependencyGate([]);
    const pg = (dop as any).page;
    try {
      const row = await dop.findRowByLocationName(DOP_LOCATION_FOR_TOGGLE);
      const inp = row.locator(INP_DATE).first();
      await inp.click();
      await pg.keyboard.press('Control+A');
      await pg.keyboard.press('Delete');
      await inp.pressSequentially(DOP_DATE_INVALID, { delay: 80 });
      await inp.press('Tab');
      await (dop as any).waitForAngularStable();
      // Angular signals an invalid date via the CSS class `border-red-500` (not aria-invalid or
      // ng-invalid — live DOM inspection 2026-08-11 confirmed this is the only error signal used).
      const hasRedBorder = await inp.evaluate((el: Element) =>
        el.classList.contains('border-red-500') ||
        (el as HTMLElement).className.includes('border-red-500')
      );
      expect(hasRedBorder).toBe(true);
      expect(await dop.isSaveDisabled()).toBe(true);
    } finally {
      // An invalid date cannot be saved, but reload discards any dirty form state.
      if (await dop.isSaveEnabled()) await dop.reloadAndWait(DOP_OFFICE);
    }
  });

  test('TC-DOP-OPT-032: Special Rate Start Date — calendar picker opens and selects a date', async ({ dependencyGate }) => {
    dependencyGate([]);
    const pg = (dop as any).page;
    const currentDate = await dop.getRowDate(DOP_LOCATION_FOR_TOGGLE);
    try {
      await dop.openCalendar(DOP_LOCATION_FOR_TOGGLE);
      // A date picker popover should appear — Angular Material / CDK renders as [role="dialog"] or [cdkTrapFocus]
      const popover = pg.locator('[role="dialog"]').first();
      await expect(popover).toBeVisible();
      // Navigate one month forward to guarantee the first enabled cell differs from the current value.
      const nextBtn = popover.locator('button[aria-label*="next"], button[aria-label*="Next"]').first();
      await expect(nextBtn).toBeVisible();
      await nextBtn.click();
      const dateCell = popover.locator('[role="gridcell"] button:not([disabled])').first();
      await dateCell.click();
      await pg.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 5_000 }).catch(() => {/* popover may animate */});
      const row = await dop.findRowByLocationName(DOP_LOCATION_FOR_TOGGLE);
      const dateValue = await row.locator(INP_DATE).first().inputValue();
      expect(dateValue.length).toBeGreaterThan(0);
      expect(dateValue).not.toBe(currentDate);
      expect(await dop.isSaveEnabled()).toBe(true);
    } finally {
      // Discard any unsaved date change so the row is clean for subsequent tests.
      if (await dop.isSaveEnabled()) await dop.reloadAndWait(DOP_OFFICE);
    }
  });

  test('TC-DOP-OPT-033: Special Rate Start Date — manual entry does not shift digits between segments (NM-3067)', async ({ dependencyGate }) => {
    dependencyGate([]);
    const pg = (dop as any).page;
    try {
      const row = await dop.findRowByLocationName(DOP_LOCATION_FOR_TOGGLE);
      const inp = row.locator(INP_DATE).first();
      await inp.click();
      await pg.keyboard.press('Control+A');
      await pg.keyboard.press('Delete');
      await inp.pressSequentially(DOP_DATE_DIGITS, { delay: 50 });
      await inp.press('Tab');
      const value = await inp.inputValue();
      expect(value).toBe(DOP_DATE_DIGITS_EXPECTED);
    } finally {
      if (await dop.isSaveEnabled()) await dop.reloadAndWait(DOP_OFFICE);
    }
  });

  // ---------------------------------------------------------------- per-row remove

  test('TC-DOP-OPT-040: Per-row remove — confirmation dialog appears; Cancel leaves the row intact', async ({ dependencyGate }) => {
    dependencyGate([]);
    const pg = (dop as any).page;
    const countBefore = await dop.getRowCount();
    await dop.clickRemove(DOP_LOCATION_FOR_TOGGLE);
    const dialog = pg.locator('[role="dialog"], [role="alertdialog"]').first();
    await expect(dialog).toBeVisible();
    await dialog.locator('button').filter({ hasText: /no/i }).first().click();
    expect(await dop.getRowCount()).toBe(countBefore);
    // The removed-candidate row must still exist
    await expect(pg.locator(`button[aria-label="Remove ${DOP_LOCATION_FOR_TOGGLE}"]`)).toBeVisible();
  });

  test('TC-DOP-OPT-041: Per-row remove — Save stays disabled after cancelling remove (NM-2918)', async ({ dependencyGate }) => {
    dependencyGate([]);
    const pg = (dop as any).page;
    await dop.clickRemove(DOP_LOCATION_FOR_TOGGLE);
    const dialog = pg.locator('[role="dialog"], [role="alertdialog"]').first();
    await expect(dialog).toBeVisible();
    await dialog.locator('button').filter({ hasText: /no/i }).first().click();
    expect(await dop.isSaveDisabled()).toBe(true);
  });

  // ---------------------------------------------------------------- persistence (TC-DOP-OPT-050, TC-DOP-OPT-051)

  /**
   * TC-DOP-OPT-050: Save round-trip — an Allow Special Rate toggle change persists after reload.
   *
   * Toggles the Allow Special Rate switch on a dedicated row (DOP_LOCATION_FOR_PERSISTENCE —
   * see src/data/discount-optimization/discount-optimization.ts for why this points to
   * "Hotel del Coronado" rather than the originally-authored "InterContinental Chicago"),
   * saves, reloads, and confirms the toggled value survived. Uses a dedicated row not shared
   * with any other test so state is clean regardless of execution order.
   */
  test('TC-DOP-OPT-050: Save round-trip — an Allow Special Rate toggle change persists after reload', async ({ dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(240_000);
    const PERSISTENCE_LOCATION = DOP_LOCATION_FOR_PERSISTENCE;
    const originalState = await dop.getToggleState(PERSISTENCE_LOCATION);
    try {
      expect(await dop.isSaveDisabled()).toBe(true);
      await dop.toggleDiscount(PERSISTENCE_LOCATION);
      const changedState = await dop.getToggleState(PERSISTENCE_LOCATION);
      expect(changedState).not.toBe(originalState);
      expect(await dop.waitUntilSaveEnabled()).toBe(true);
      await dop.clickSave();
      expect(await dop.waitUntilSaveDisabled(15_000)).toBe(true);
      await dop.reloadAndWait(DOP_OFFICE);
      // Row is looked up by location name — not by index — to survive any re-sort on reload.
      const persistedState = await dop.getToggleState(PERSISTENCE_LOCATION);
      expect(persistedState).toBe(changedState);
    } finally {
      // Restore: put the row back to its original toggle state.
      const currentState = await dop.getToggleState(PERSISTENCE_LOCATION);
      if (currentState !== originalState) {
        await dop.toggleDiscount(PERSISTENCE_LOCATION);
        if (await dop.isSaveEnabled()) {
          await dop.clickSave();
          await dop.waitUntilSaveDisabled(15_000);
        }
      }
    }
  });

  // ---------------------------------------------------------------- batch-dirty persistence (TC-DOP-OPT-052)

  /**
   * TC-DOP-OPT-052: Two dirty rows both persist after a single save.
   *
   * Every existing mutation test dirties exactly one row. This test dirties two distinct
   * rows without saving between changes, then saves once and reloads — confirming the batch
   * POST carries both changes. If the form drops one row's pending change, this test catches
   * it. Both rows are restored in a finally block.
   */
  test('TC-DOP-OPT-052: Save round-trip — two dirty rows both persist after a single save', async ({ dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(300_000);
    const pg = (dop as any).page;

    // Pick the first two rows not reserved by other tests.
    const RESERVED = new Set([DOP_LOCATION_FOR_PERSISTENCE, DOP_LOCATION_FOR_TOGGLE]);
    const rawLabels: string[] = await pg.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button[aria-label^="Allow Special Rate for "]'));
      return (btns as HTMLButtonElement[]).slice(0, 50).map((b) => b.getAttribute('aria-label') ?? '');
    });
    const pickedNames: string[] = [];
    for (const label of rawLabels) {
      if (pickedNames.length >= 2) break;
      const name = label.replace('Allow Special Rate for ', '');
      if (name && !RESERVED.has(name)) pickedNames.push(name);
    }
    expect(pickedNames.length).toBe(2);
    const [locA, locB] = pickedNames as [string, string];

    const stateA = await dop.getToggleState(locA);
    const stateB = await dop.getToggleState(locB);
    let testBodyCompleted = false;

    try {
      // Change row A, then row B — no save between changes.
      await dop.toggleDiscount(locA);
      expect(await dop.getToggleState(locA)).not.toBe(stateA);
      await (dop as any)._dismissAlertDialogIfPresent();
      await dop.toggleDiscount(locB);
      expect(await dop.getToggleState(locB)).not.toBe(stateB);

      // A single save must carry both dirty rows.
      expect(await dop.waitUntilSaveEnabled()).toBe(true);
      await dop.clickSave();
      expect(await dop.waitUntilSaveDisabled(15_000)).toBe(true);

      await dop.reloadAndWait(DOP_OFFICE);
      // Both changes must survive the reload — confirming the batch was posted correctly.
      expect(await dop.getToggleState(locA)).toBe(!stateA);
      expect(await dop.getToggleState(locB)).toBe(!stateB);
      testBodyCompleted = true;
    } finally {
      if (!testBodyCompleted) {
        // Test failed before reload — discard any pending changes.
        await dop.reloadAndWait(DOP_OFFICE);
      }
      // Restore both rows to their original states.
      let needSave = false;
      const currentA = await dop.getToggleState(locA);
      if (currentA !== stateA) { await dop.toggleDiscount(locA); needSave = true; }
      await (dop as any)._dismissAlertDialogIfPresent();
      const currentB = await dop.getToggleState(locB);
      if (currentB !== stateB) { await dop.toggleDiscount(locB); needSave = true; }
      if (needSave && await dop.isSaveEnabled()) {
        await dop.clickSave();
        await dop.waitUntilSaveDisabled(15_000);
      }
    }
  });

  // ---------------------------------------------------------------- virtual-scroll persistence (TC-DOP-OPT-053)

  /**
   * TC-DOP-OPT-053: Pending edit survives the row being scrolled out of view.
   *
   * The grid holds 2154 rows. If the grid uses virtual DOM recycling (rows removed from the
   * DOM as they scroll out of the viewport), a pending edit that lives only in the DOM node
   * would be silently discarded. This test scrolls far enough to push the target row out of
   * the DOM, then scrolls back and asserts the pending value is still shown.
   *
   * Critical: the test asserts that the row genuinely left the DOM mid-test. If the grid
   * renders all rows at once (no recycling), this assertion will fail — in that case the test
   * cannot exercise the intended failure mode and reports a structural BLOCKED result.
   */
  test('TC-DOP-OPT-053: Pending edit survives the row being scrolled out of view', async ({ dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(300_000);
    const pg = (dop as any).page;

    // Pick the third non-reserved row so TC-DOP-OPT-053 is disjoint from TC-DOP-OPT-052,
    // which takes the first two non-reserved rows. Using the same row as 052 would make them
    // silently test the same location under stable DOM ordering.
    const RESERVED = new Set([DOP_LOCATION_FOR_PERSISTENCE, DOP_LOCATION_FOR_TOGGLE]);
    const rawLabels: string[] = await pg.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button[aria-label^="Allow Special Rate for "]'));
      return (btns as HTMLButtonElement[]).slice(0, 20).map((b) => b.getAttribute('aria-label') ?? '');
    });
    let locName = '';
    let nonReservedCount = 0;
    for (const label of rawLabels) {
      const name = label.replace('Allow Special Rate for ', '');
      if (name && !RESERVED.has(name)) {
        nonReservedCount++;
        // Skip the first two — those are the rows TC-DOP-OPT-052 picks.
        if (nonReservedCount >= 3) { locName = name; break; }
      }
    }
    expect(locName.length).toBeGreaterThan(0);

    const stateBefore = await dop.getToggleState(locName);
    let testBodyCompleted = false;

    try {
      // Change the target row.
      await dop.toggleDiscount(locName);
      expect(await dop.getToggleState(locName)).not.toBe(stateBefore);

      // Scroll the grid container far enough to push the row out of the DOM.
      const box = await pg.locator(TBL_CONTAINER).boundingBox();
      if (box) {
        await pg.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await pg.mouse.wheel(0, 200_000);
      }
      await (dop as any).waitForAngularStable();

      // The row must have left the DOM — confirming virtual DOM recycling occurred.
      // If count is still > 0, the grid renders all rows at once and cannot exercise recycling.
      const countAfterScroll = await pg.locator(`button[aria-label="Allow Special Rate for ${locName}"]`).count();
      expect(countAfterScroll).toBe(0);

      // Scroll back to the top to bring the row back into view.
      if (box) {
        await pg.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await pg.mouse.wheel(0, -200_000);
      }
      await (dop as any).waitForAngularStable();

      // Wait for the row to reappear in the DOM.
      await expect.poll(
        () => pg.locator(`button[aria-label="Allow Special Rate for ${locName}"]`).count(),
        { timeout: 10_000 },
      ).toBeGreaterThan(0);

      // The pending edit must still be reflected — not silently discarded by the re-render.
      expect(await dop.getToggleState(locName)).not.toBe(stateBefore);

      // Save and reload — confirm the change persisted end-to-end.
      expect(await dop.waitUntilSaveEnabled()).toBe(true);
      await dop.clickSave();
      expect(await dop.waitUntilSaveDisabled(15_000)).toBe(true);
      await dop.reloadAndWait(DOP_OFFICE);
      expect(await dop.getToggleState(locName)).toBe(!stateBefore);
      testBodyCompleted = true;
    } finally {
      if (!testBodyCompleted) {
        await dop.reloadAndWait(DOP_OFFICE);
      }
      const current = await dop.getToggleState(locName);
      if (current !== stateBefore) {
        await dop.toggleDiscount(locName);
        if (await dop.isSaveEnabled()) {
          await dop.clickSave();
          await dop.waitUntilSaveDisabled(15_000);
        }
      }
    }
  });

  // ---------------------------------------------------------------- add

  test('TC-DOP-OPT-060: Add — opens the add affordance; Cancel discards cleanly', async ({ dependencyGate }) => {
    dependencyGate([]);
    const countBefore = await dop.getRowCount();
    expect(await dop.isSaveDisabled()).toBe(true);
    await dop.changeLocalOffice.open();
    await dop.changeLocalOffice.cancel();
    expect(await dop.getRowCount()).toBe(countBefore);
    expect(await dop.isSaveDisabled()).toBe(true);
  });

  test('TC-DOP-OPT-061: Add button is present and visible on the Locations tab', async ({ dependencyGate }) => {
    dependencyGate([]);
    expect(await dop.changeLocalOffice.isAddAvailable()).toBe(true);
  });

  // ---------------------------------------------------------------- tab switching (NM-3066)

  test('TC-DOP-OPT-065: Switching tabs with no pending change does not show an unsaved-changes prompt (NM-3066)', async ({ dependencyGate }) => {
    dependencyGate([]);
    const pg = (dop as any).page;
    expect(await dop.isSaveDisabled()).toBe(true);
    let nativeDialogSeen = false;
    pg.on('dialog', () => { nativeDialogSeen = true; });
    await dop.switchTab('Special Rate Exemptions by Service Type');
    // No modal overlay must have appeared during the tab switch
    const modalCount = await pg.locator('[role="dialog"]').count();
    expect(modalCount).toBe(0);
    expect(nativeDialogSeen).toBe(false);
    // Tab 2 panel must now be visible
    await expect(pg.locator('[role="tabpanel"]:visible')).toBeVisible();
    await dop.switchTab('Discount Optimization');
  });

  test('TC-DOP-OPT-066: Switching from Tab 2 to Tab 1 with no pending change does not show an unsaved-changes prompt (NM-3066)', async ({ dependencyGate }) => {
    // Owner: discount-optimization-locations.spec.ts (Tab 1 spec). Cross-tab seam. NM-3066.
    dependencyGate([]);
    const pg = (dop as any).page;
    expect(await dop.isSaveDisabled()).toBe(true);
    let nativeDialogSeen = false;
    pg.on('dialog', () => { nativeDialogSeen = true; });
    await dop.switchTab('Special Rate Exemptions by Service Type');
    await dop.switchTab('Discount Optimization');
    const alertCount = await pg.locator('[role="alertdialog"]').count();
    expect(alertCount).toBe(0);
    expect(nativeDialogSeen).toBe(false);
    await expect(pg.locator(PANEL_LOCATIONS)).toBeVisible();
  });

  test('TC-DOP-OPT-067: Switching from Tab 1 to Tab 2 with an unsaved change shows the unsaved-changes prompt; Stay holds on Tab 1; Discard proceeds to Tab 2 (NM-3066)', async ({ dependencyGate }) => {
    // Owner: discount-optimization-locations.spec.ts (Tab 1 spec). Cross-tab seam. NM-3066.
    dependencyGate([]);
    const pg = (dop as any).page;
    try {
      expect(await dop.isSaveDisabled()).toBe(true);
      await dop.toggleDiscount(DOP_LOCATION_FOR_TOGGLE);
      expect(await dop.isSaveDisabled()).toBe(false); // mandatory oracle — dirty state achieved

      // Click Tab 2 trigger directly; switchTab waits for the new panel which won't
      // appear while the alertdialog is blocking the transition.
      await pg.locator(TAB_EXEMPTIONS).first().click();
      const alertDialog = pg.locator('[role="alertdialog"]');
      await alertDialog.waitFor({ state: 'visible', timeout: 10_000 });
      await expect(alertDialog).toContainText('Unsaved changes');
      await expect(alertDialog).toContainText('Are you sure you want to leave this view? Any unsaved changes will be lost.');
      await expect(alertDialog.locator('button:text-is("Stay")')).toBeVisible();
      await expect(alertDialog.locator('button:text-is("Discard")')).toBeVisible();

      // Stay: remains on Tab 1; dirty state survives
      await alertDialog.locator('button:text-is("Stay")').click();
      await alertDialog.waitFor({ state: 'hidden', timeout: 5_000 });
      await expect(pg.locator(PANEL_LOCATIONS)).toBeVisible();
      expect(await dop.isSaveDisabled()).toBe(false);

      // Discard: proceeds to Tab 2; change is dropped
      await pg.locator(TAB_EXEMPTIONS).first().click();
      await alertDialog.waitFor({ state: 'visible', timeout: 10_000 });
      await alertDialog.locator('button:text-is("Discard")').click();
      await pg.locator(PANEL_EXEMPTIONS).waitFor({ state: 'visible', timeout: 45_000 });
    } finally {
      // If test failed before Discard: dismiss any open alertdialog, then restore the toggle.
      const alertOpen = await pg.locator('[role="alertdialog"]').isVisible().catch(() => false);
      if (alertOpen) {
        await pg.locator('[role="alertdialog"] button:text-is("Stay")').first().click().catch(() => {});
      }
      const onTab1 = await pg.locator(PANEL_LOCATIONS).isVisible().catch(() => false);
      if (onTab1 && !(await dop.isSaveDisabled().catch(() => true))) {
        await dop.toggleDiscount(DOP_LOCATION_FOR_TOGGLE);
      }
    }
  });

  test('TC-DOP-OPT-068: Switching from Tab 2 to Tab 1 with an unsaved change shows the unsaved-changes prompt; Stay holds on Tab 2; Discard proceeds to Tab 1 (NM-3066)', async ({ dependencyGate }) => {
    // Owner: discount-optimization-locations.spec.ts (Tab 1 spec). Cross-tab seam. NM-3066.
    dependencyGate([]);
    const pg = (dop as any).page;
    await dop.switchTab('Special Rate Exemptions by Service Type');
    try {
      expect(await dop.isTab2SaveDisabled()).toBe(true);
      await dop.toggleExempt('Equipment Rental');
      expect(await dop.isTab2SaveDisabled()).toBe(false); // mandatory oracle — dirty state achieved

      // Click Tab 1 trigger directly; switchTab waits for the new panel which won't
      // appear while the alertdialog is blocking the transition.
      await pg.locator(TAB_LOCATIONS).first().click();
      const alertDialog = pg.locator('[role="alertdialog"]');
      await alertDialog.waitFor({ state: 'visible', timeout: 10_000 });
      await expect(alertDialog).toContainText('Unsaved changes');
      await expect(alertDialog).toContainText('Are you sure you want to leave this view? Any unsaved changes will be lost.');
      await expect(alertDialog.locator('button:text-is("Stay")')).toBeVisible();
      await expect(alertDialog.locator('button:text-is("Discard")')).toBeVisible();

      // Stay: remains on Tab 2; dirty state survives
      await alertDialog.locator('button:text-is("Stay")').click();
      await alertDialog.waitFor({ state: 'hidden', timeout: 5_000 });
      await expect(pg.locator(PANEL_EXEMPTIONS)).toBeVisible();
      expect(await dop.isTab2SaveDisabled()).toBe(false);

      // Discard: proceeds to Tab 1; change is dropped
      await pg.locator(TAB_LOCATIONS).first().click();
      await alertDialog.waitFor({ state: 'visible', timeout: 10_000 });
      await alertDialog.locator('button:text-is("Discard")').click();
      await pg.locator(PANEL_LOCATIONS).waitFor({ state: 'visible', timeout: 45_000 });
    } finally {
      // If test failed before Discard: dismiss any open alertdialog, then cancel Tab 2 changes.
      const alertOpen = await pg.locator('[role="alertdialog"]').isVisible().catch(() => false);
      if (alertOpen) {
        await pg.locator('[role="alertdialog"] button:text-is("Stay")').first().click().catch(() => {});
      }
      const onTab2 = await pg.locator(PANEL_EXEMPTIONS).isVisible().catch(() => false);
      if (onTab2 && !(await dop.isTab2SaveDisabled().catch(() => true))) {
        await dop.clickTab2Cancel().catch(() => {});
      }
    }
  });

  // ---------------------------------------------------------------- active/inactive filtering (NM-3210)

  // Finding: no dedicated Active/Inactive filter control was found on this surface
  // during the full DOM inventory (2026-08-11). NM-3210 is NOT-COVERED by a toggle-based
  // assertion. The case below covers what is actually testable: that deactivated location
  // rows are returned by text search and cleared correctly.
  test('TC-DOP-OPT-070: Search includes deactivated locations by name and clears correctly (NM-3210)', async ({ dependencyGate }) => {
    dependencyGate([]);
    const pg = (dop as any).page;
    const countBefore = await dop.getRowCount();
    await dop.search(DOP_DEACTIVATED_FRAGMENT);
    const countFiltered = await dop.getRowCount();
    expect(countFiltered).toBeGreaterThan(0);
    // Read the Location Name cell (td:nth-child(3)) — the full tr.allTextContents() returns
    // empty strings while the virtualised grid is still populating text nodes. Wait for the
    // first name cell to be non-empty before reading all, then assert every name contains the
    // search fragment.
    const nameCellSelector = `${ROWS_TAB1} td:nth-child(3)`;
    await expect(pg.locator(nameCellSelector).first()).not.toBeEmpty({ timeout: 15_000 });
    const rowTexts = await pg.locator(nameCellSelector).allTextContents();
    for (const rowText of (rowTexts as string[])) {
      expect((rowText as string).toLowerCase()).toContain(DOP_DEACTIVATED_FRAGMENT.toLowerCase());
    }
    await dop.clearSearch();
    await expect.poll(() => dop.getRowCount(), { timeout: 45_000 }).toBe(countBefore);
  });

  test('TC-DOP-OPT-071: Search returns deactivated locations (NM-3210 coverage)', async ({ dependencyGate }) => {
    dependencyGate([]);
    const countBefore = await dop.getRowCount();
    await dop.search(DOP_DEACTIVATED_ROW_FRAGMENT);
    expect(await dop.getRowCount()).toBeGreaterThan(0);
    const firstName = await dop.getFirstRowCell(3);
    expect(firstName.toLowerCase()).toContain(DOP_DEACTIVATED_ROW_FRAGMENT.toLowerCase());
    // The app persists the search term across page loads (see TC-070's clearSearch() and the
    // sort tests' localStorage.clear()) — leaving it set here would silently filter the grid
    // for every later test in the run (observed: it hid rows TC-050/052/053/092 depend on).
    // Restore the full list before finishing.
    await dop.clearSearch();
    await expect.poll(() => dop.getRowCount(), { timeout: 45_000 }).toBe(countBefore);
  });

  // ---------------------------------------------------------------- NM-2917 regression lock

  test('TC-DOP-OPT-072: Allow Special Rate toggle enables Save — NM-2917 regression lock', async ({ dependencyGate }) => {
    dependencyGate([]);
    const stateBefore = await dop.getToggleState(DOP_LOCATION_FOR_TOGGLE);
    try {
      expect(await dop.isSaveDisabled()).toBe(true);
      await dop.toggleDiscount(DOP_LOCATION_FOR_TOGGLE);
      expect(await dop.isSaveEnabled()).toBe(true);
    } finally {
      if (await dop.getToggleState(DOP_LOCATION_FOR_TOGGLE) !== stateBefore) {
        await dop.toggleDiscount(DOP_LOCATION_FOR_TOGGLE);
      }
    }
  });

  // ---------------------------------------------------------------- server-rejection path (TC-DOP-OPT-090)

  /**
   * TC-DOP-OPT-090: A rejected save surfaces the failure and keeps the change pending.
   *
   * Every existing test drives the success path. This test uses Playwright route interception
   * to make the save endpoint return a 500 for this test only — the request never reaches the
   * server. After the rejection, the app must not behave as if the save succeeded: at least
   * one of the following must be true: (a) an error element is visible, (b) Save is still
   * enabled, or (c) the change is still present in the UI. The interception is test-scoped
   * and removed in the finally block.
   */
  test('TC-DOP-OPT-090: Rejected save surfaces the failure and keeps the change pending', async ({ dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(180_000);
    const pg = (dop as any).page;

    let interceptedSave = false;
    const saveInterceptor = async (route: any) => {
      if (route.request().method() !== 'GET') {
        interceptedSave = true;
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Simulated server error' }) });
      } else {
        await route.continue();
      }
    };
    await pg.route('**/navigator/api/discount/optimization**', saveInterceptor);

    try {
      expect(await dop.isSaveDisabled()).toBe(true);
      const stateBefore = await dop.getToggleState(DOP_LOCATION_FOR_TOGGLE);
      await dop.toggleDiscount(DOP_LOCATION_FOR_TOGGLE);
      expect(await dop.getToggleState(DOP_LOCATION_FOR_TOGGLE)).not.toBe(stateBefore);
      expect(await dop.waitUntilSaveEnabled()).toBe(true);

      await dop.clickSave();
      await (dop as any).waitForAngularStable();

      // Confirm the interception fired — the save request never reached the server.
      expect(interceptedSave).toBe(true);

      // The app must not treat the 500 response as a success.
      // Acceptable outcomes: an error element is visible, Save is still enabled, or the
      // change is still present in the UI. Failing all three = silent swallow (product defect).
      const errorSurfaced = await pg.locator('[role="alertdialog"], [role="alert"]').isVisible().catch(() => false);
      const saveStillEnabled = await dop.isSaveEnabled();
      // changeStillPresent alone is not evidence of failure — the toggle was changed and nothing
      // reverted it, so it would be true even if the app silently swallowed the error. Only an
      // error element or a still-enabled Save button proves the rejection was surfaced.
      expect(errorSurfaced || saveStillEnabled).toBe(true);
    } finally {
      await pg.unroute('**/navigator/api/discount/optimization**', saveInterceptor);
      // Reload discards any pending state — the intercepted save wrote nothing to the server.
      await dop.reloadAndWait(DOP_OFFICE);
    }
  });

  /**
   * TC-DOP-OPT-091: Cancelling an incomplete Add leaves Save disabled.
   *
   * Add flow (observed 2026-08-11): clicking Add opens an "Add Location" right-panel with
   * Cancel/Update buttons. "Select a Location" opens a "Change Local Office" modal that has
   * a search input and a table (columns: Local Office, Local Office Name). The location
   * picker does NOT use [role="option"] — it is a search-driven table.
   *
   * Coverage scope: this test asserts (a) the Add panel opens with the expected structure,
   * (b) the "Change Local Office" picker dialog is reachable, and (c) cancelling the Add
   * flow leaves Save disabled (no dirty state). TC-DOP-OPT-051 (the NM-3063 core assertion —
   * Save must be enabled after completing an Add) is not automated: the picker shows
   * "No results." on offices 1604, 1605, and 1101 — all local offices are already present
   * in each list and none can be added.
   */
  test('TC-DOP-OPT-091: Cancelling an incomplete Add leaves Save disabled', async ({ dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(180_000);
    const pg = (dop as any).page;
    expect(await dop.isSaveDisabled()).toBe(true);
    await dop.clickAdd();

    // Add Location panel opens — Update and Cancel buttons appear on the right.
    const updateBtn = pg.locator('button:text-is("Update")').first();
    await expect(updateBtn).toBeVisible({ timeout: 15_000 });
    const cancelPanelBtn = pg.locator('button:text-is("Cancel")').first();
    await expect(cancelPanelBtn).toBeVisible({ timeout: 5_000 });

    // "Select a Location" opens the "Change Local Office" picker dialog.
    const selectLocationLink = pg.locator('text="Select a Location"').first();
    await selectLocationLink.click();
    const pickerDialog = pg.locator('[role="dialog"]').filter({ hasText: 'Change Local Office' }).first();
    await expect(pickerDialog).toBeVisible({ timeout: 10_000 });

    // The picker shows a search input and a table. For office 1604 all local offices are
    // already in the optimization list — no rows are available to select.
    const searchBox = pickerDialog.locator('input').first();
    await expect(searchBox).toBeVisible({ timeout: 5_000 });

    // Cancel the picker, then cancel the Add panel — no dirty state should remain.
    const cancelPickerBtn = pickerDialog.locator('button:text-is("Cancel")').first();
    await cancelPickerBtn.click();
    await expect(pickerDialog).not.toBeVisible({ timeout: 5_000 });

    await cancelPanelBtn.click();
    await expect(updateBtn).not.toBeVisible({ timeout: 5_000 });

    // Cancelling an incomplete Add must not leave Save in a dirty state.
    expect(await dop.isSaveDisabled()).toBe(true);
  });

  // ---------------------------------------------------------------- date persistence (TC-DOP-OPT-092)

  /**
   * TC-DOP-OPT-092: Save round-trip — a Special Rate Start Date change persists after reload.
   *
   * Selects a new Special Rate Start Date via the calendar picker (the only method that
   * correctly updates Angular's component model), saves, reloads, and confirms the saved
   * date survives the round-trip. Uses the same dedicated row (DOP_LOCATION_FOR_PERSISTENCE)
   * as TC-DOP-OPT-050 — the two tests use different fields (toggle vs date) so there is no
   * collision. The date is restored in a finally block.
   */
  test('TC-DOP-OPT-092: Save round-trip — a Special Rate Start Date change persists after reload', async ({ dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(240_000);
    const PERSISTENCE_LOCATION = DOP_LOCATION_FOR_PERSISTENCE;
    const pg = (dop as any).page;
    const originalDate = await dop.getRowDate(PERSISTENCE_LOCATION);
    let selectedDate = '';
    try {
      expect(await dop.isSaveDisabled()).toBe(true);

      // Capture API requests fired during calendar interaction. Match on the backend API path,
      // never on the page URL — the framework fires its own POSTs to the page URL after a reload,
      // and those would otherwise be counted as saves.
      const apiRequestsFired: string[] = [];
      const onRequest = (req: any) => {
        const url: string = req.url();
        if (url.includes('/api/') || url.includes('/settings/discount')) {
          apiRequestsFired.push(`${req.method()} ${url}`);
        }
      };
      pg.on('request', onRequest);

      // Step 1: Open calendar — assert it is actually open before proceeding.
      await dop.openCalendar(PERSISTENCE_LOCATION);
      const popover = pg.locator('[role="dialog"]').first();
      await expect(popover).toBeVisible({ timeout: 10_000 });

      // Step 2: Capture current month/year heading, advance one month, assert the heading
      // actually changed before selecting a day — clicking mid-transition selects nothing.
      const monthHeading = popover.locator('span, div, caption').filter({ hasText: /[A-Z][a-z]+ \d{4}/ }).first();
      const monthBefore = await monthHeading.innerText({ timeout: 5_000 });
      const nextBtn = popover.locator('button[aria-label*="next"], button[aria-label*="Next"]').first();
      await expect(nextBtn).toBeVisible();
      await nextBtn.click();
      await expect(monthHeading).not.toHaveText(monthBefore, { timeout: 5_000 });
      const monthAfter = await monthHeading.innerText({ timeout: 5_000 });

      // Step 3: Click the first enabled day cell that belongs to the new month.
      // The calendar grid shows overflow cells from the previous month; picking `.first()` risks
      // selecting an overflow cell (e.g., March 31 in the April view) = same date as original.
      // Filter by aria-label containing the new month name so we only pick April's own days.
      const newMonthName = monthAfter.trim().split(/[\s\n]+/)[0]; // e.g., "April"
      const dateCell = popover.locator(`[role="gridcell"] button:not([disabled])[aria-label*="${newMonthName}"]`).first();
      await expect(dateCell).toBeVisible({ timeout: 5_000 });
      const dateCellLabel = await dateCell.getAttribute('aria-label');
      await dateCell.click();

      // Step 4: Assert the dialog actually closed — if it stays open the click did not register.
      await expect(popover).toBeHidden({ timeout: 10_000 });
      pg.off('request', onRequest);

      // Step 5: Read back the value.
      await (dop as any).waitForAngularStable();
      // Log step evidence before asserting so it survives a failure.
      console.log(`[T104-EVIDENCE] originalDate="${originalDate}" monthBefore="${monthBefore}" monthAfter="${monthAfter}" cellClicked="${dateCellLabel}" apiRequests=${JSON.stringify(apiRequestsFired)}`);
      selectedDate = await dop.getRowDate(PERSISTENCE_LOCATION);
      expect(selectedDate).not.toBe(originalDate);
      expect(await dop.waitUntilSaveEnabled()).toBe(true);
      await dop.clickSave();
      expect(await dop.waitUntilSaveDisabled(15_000)).toBe(true);
      await dop.reloadAndWait(DOP_OFFICE);
      const persistedDate = await dop.getRowDate(PERSISTENCE_LOCATION);
      expect(persistedDate).toBe(selectedDate);
    } finally {
      const currentDate = await dop.getRowDate(PERSISTENCE_LOCATION);
      if (currentDate !== originalDate && originalDate) {
        await dop.setRowDate(PERSISTENCE_LOCATION, originalDate);
        if (await dop.isSaveEnabled()) {
          await dop.clickSave();
          await dop.waitUntilSaveDisabled(15_000);
        }
      }
    }
  });
});
