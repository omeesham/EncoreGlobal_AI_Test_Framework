import { test, expect } from '../../src/fixtures/pages.fixture';
import { DiscountOptimizationPage } from '../../src/pages/discount-optimization/discount-optimization.page';

/**
 * Discount Optimization — Special Rate Exemptions by Service Type (tab 2).
 *
 * Route: /navigator/locations/1604/settings/discount-optimization-settings (tab 2)
 *
 * Each test navigates fresh, switches to tab 2, and asserts independently.
 * TC-DOP-EXM-020 is the only mutating test; it restores the original state in its
 * finally block. All other tests are read-only.
 *
 * Exempt column: assertions use aria-checked on the Radix checkbox element.
 * textContent is NOT used — the boolean render format is SVG-based on this table
 * and textContent is empty for both states.
 *
 * No hardcoded row counts — NM-3340 (open, Blocker) will change service-type membership.
 *
 * Omitted from this file (declared):
 * - None: all 6 authored cases (TC-DOP-EXM-001, 002, 010, 011, 020, 021) are implemented.
 */

const OFFICE = '1604';

/** Service type used for save-cycle and multi-cancel tests. Known to be in the list at enumeration. */
const ROW_EQUIPMENT_RENTAL = 'Equipment Rental';

/** Second row used in the multi-cancel test. Known to be in the list at enumeration. */
const ROW_DIGITAL_BRANDING = 'Digital Branding';

test.describe('Discount Optimization — Special Rate Exemptions by Service Type', () => {
  let dop: DiscountOptimizationPage;

  test.beforeEach(async ({ authenticatedSession, config }) => {
    test.setTimeout(180_000);
    dop = new DiscountOptimizationPage(authenticatedSession.page, config);
    await dop.open(OFFICE);
    // waitForGrid() polls until Tab 1 rows appear, but the tab trigger element may still
    // have a CSS transition or overlay blocking actionability at that moment. Waiting for
    // the tab to be visible first ensures switchTab's click() does not hit its 10 s default.
    await authenticatedSession.page
      .locator('[role="tab"]:has-text("Special Rate Exemptions by Service Type")')
      .waitFor({ state: 'visible', timeout: 60_000 });
    await dop.switchTab('Special Rate Exemptions by Service Type');
  });


  test('TC-DOP-EXM-001: Tab activates and surface renders with expected columns and rows', async ({ dependencyGate }) => {
    dependencyGate([]);

    const headers = await dop.getTab2ColumnHeaders();
    expect(headers).toContain('Service Type');
    expect(headers).toContain('Exempt');

    const rowCount = await dop.getTab2RowCount();
    expect(rowCount).toBeGreaterThan(0);

    const page = dop['page'];
    await expect(page.locator('button:text-is("Cancel")')).toBeVisible();
    await expect(page.locator('button:text-is("Save")')).toBeVisible();
  });


  test('TC-DOP-EXM-002: Save is disabled when no changes have been made (pristine state)', async ({ dependencyGate }) => {
    dependencyGate(['TC-DOP-EXM-001']);

    const saveDisabled = await dop.isTab2SaveDisabled();
    expect(saveDisabled).toBe(true);
  });


  test('TC-DOP-EXM-010: Search box filters rows; clearing restores the full list; no-match shows empty state', async ({ dependencyGate }) => {
    dependencyGate(['TC-DOP-EXM-001']);

    const baselineCount = await dop.getTab2RowCount();
    expect(baselineCount).toBeGreaterThan(0);

    // Fill with a known partial match
    await dop.searchTab2('HSIA');
    const filteredCount = await dop.getTab2RowCount();
    expect(filteredCount).toBeLessThanOrEqual(baselineCount);
    expect(filteredCount).toBeGreaterThan(0);

    // Every visible row must contain "hsia" (case-insensitive)
    const page = dop['page'];
    const rows = page.locator('tbody tr');
    const count = await rows.count();
    for (let i = 0; i < count; i++) {
      const cellText = await rows.nth(i).locator('td').first().textContent();
      expect((cellText ?? '').toLowerCase()).toContain('hsia');
    }

    // Clear restores full list
    await dop.clearSearchTab2();
    const restoredCount = await dop.getTab2RowCount();
    expect(restoredCount).toBe(baselineCount);

    // No-match term → empty state
    await dop.searchTab2('ZZZNO-MATCH-99999');
    const noMatchCount = await dop.getTab2RowCount();
    expect(noMatchCount).toBe(0);

    // Clear again → full list
    await dop.clearSearchTab2();
    const finalCount = await dop.getTab2RowCount();
    expect(finalCount).toBe(baselineCount);
  });


  test('TC-DOP-EXM-011: Search is case-insensitive', async ({ dependencyGate }) => {
    dependencyGate(['TC-DOP-EXM-010']);

    await dop.searchTab2('EQUIPMENT');
    const countUpper = await dop.getTab2RowCount();
    expect(countUpper).toBeGreaterThan(0);

    // Capture the service-type names returned by the uppercase search.
    const page = dop['page'];
    const rows = page.locator('tbody tr');
    const upperNames: string[] = [];
    for (let i = 0; i < countUpper; i++) {
      const name = await rows.nth(i).locator('td').first().textContent();
      upperNames.push((name ?? '').trim());
    }

    await dop.clearSearchTab2();
    await dop.searchTab2('equipment');
    const countLower = await dop.getTab2RowCount();
    expect(countLower).toBe(countUpper);

    // Capture the service-type names returned by the lowercase search.
    // The sets must be identical — same rows, not merely the same count.
    const lowerNames: string[] = [];
    for (let i = 0; i < countLower; i++) {
      const name = await rows.nth(i).locator('td').first().textContent();
      lowerNames.push((name ?? '').trim());
    }
    expect(lowerNames).toEqual(upperNames);

    await dop.clearSearchTab2();
  });


  test('TC-DOP-EXM-020: Save cycle — pristine disabled, enabled by valid change, change persists after reload; Cancel discards', async ({ dependencyGate }) => {
    dependencyGate(['TC-DOP-EXM-001']);

    // Step 1: Save disabled in pristine state
    expect(await dop.isTab2SaveDisabled()).toBe(true);

    // Step 2: Record original state
    const originalState = await dop.getExemptState(ROW_EQUIPMENT_RENTAL);

    try {
      // Step 3: Toggle → Save enabled
      await dop.toggleExempt(ROW_EQUIPMENT_RENTAL);
      const stateAfterToggle = await dop.getExemptState(ROW_EQUIPMENT_RENTAL);
      expect(stateAfterToggle).toBe(!originalState);
      expect(await dop.isTab2SaveDisabled()).toBe(false);

      // Step 4: Cancel → original state restored, Save disabled
      await dop.clickTab2Cancel();
      expect(await dop.getExemptState(ROW_EQUIPMENT_RENTAL)).toBe(originalState);
      expect(await dop.isTab2SaveDisabled()).toBe(true);

      // Step 5: Toggle again
      await dop.toggleExempt(ROW_EQUIPMENT_RENTAL);
      expect(await dop.isTab2SaveDisabled()).toBe(false);

      // Step 6: Save → Save returns to disabled
      await dop.clickTab2Save();
      const saveWentDisabled = await dop.waitUntilTab2SaveDisabled(15_000);
      expect(saveWentDisabled).toBe(true);

      // Step 7-8: Reload → change persists
      await dop.reloadAndWait(OFFICE);
      await dop.switchTab('Special Rate Exemptions by Service Type');
      const stateAfterReload = await dop.getExemptState(ROW_EQUIPMENT_RENTAL);
      expect(stateAfterReload).toBe(!originalState);
    } finally {
      // Restore original state unconditionally
      const currentState = await dop.getExemptState(ROW_EQUIPMENT_RENTAL);
      if (currentState !== originalState) {
        await dop.toggleExempt(ROW_EQUIPMENT_RENTAL);
        await dop.clickTab2Save();
        await dop.waitUntilTab2SaveDisabled(15_000);
      }
    }
  });


  test('TC-DOP-EXM-021: Cancel discards multiple simultaneous checkbox changes', async ({ dependencyGate }) => {
    dependencyGate(['TC-DOP-EXM-001']);

    const stateA = await dop.getExemptState(ROW_EQUIPMENT_RENTAL);
    const stateB = await dop.getExemptState(ROW_DIGITAL_BRANDING);
    let cancelCalled = false;

    try {
      // Toggle both rows
      await dop.toggleExempt(ROW_EQUIPMENT_RENTAL);
      await dop.toggleExempt(ROW_DIGITAL_BRANDING);

      expect(await dop.getExemptState(ROW_EQUIPMENT_RENTAL)).toBe(!stateA);
      expect(await dop.getExemptState(ROW_DIGITAL_BRANDING)).toBe(!stateB);
      expect(await dop.isTab2SaveDisabled()).toBe(false);

      // Cancel → both changes discarded
      await dop.clickTab2Cancel();
      cancelCalled = true;

      expect(await dop.getExemptState(ROW_EQUIPMENT_RENTAL)).toBe(stateA);
      expect(await dop.getExemptState(ROW_DIGITAL_BRANDING)).toBe(stateB);
      expect(await dop.isTab2SaveDisabled()).toBe(true);
    } finally {
      // If the test failed before Cancel was called, discard pending changes now.
      if (!cancelCalled && await dop.isTab2SaveDisabled() === false) {
        await dop.clickTab2Cancel();
      }
    }
  });
});
