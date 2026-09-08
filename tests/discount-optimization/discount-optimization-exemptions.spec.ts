import { test, expect } from '../../src/fixtures/pages.fixture';
import { DiscountOptimizationPage } from '../../src/pages/discount-optimization/discount-optimization.page';
import { ROWS_TAB2 } from '../../src/selectors/discount-optimization/discount-optimization';
import { phase, verify } from '../../src/fixtures/report-steps';

// Exempt state is read from aria-checked: the column renders as SVG, so textContent is empty
// for both states. No hardcoded row counts — NM-3340 will change service-type membership.

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
    // waitForGrid() returns while the Tab 2 trigger can still be covered mid-transition —
    // without this wait switchTab's click() burns its 10 s actionability timeout.
    await authenticatedSession.page
      .locator('[role="tab"]:has-text("Special Rate Exemptions by Service Type")')
      .waitFor({ state: 'visible', timeout: 60_000 });
    await dop.switchTab('Special Rate Exemptions by Service Type');
  });


  test('TC-DOP-EXM-001: Tab activates and surface renders with expected columns and rows', async ({ dependencyGate }) => {
    dependencyGate([]);

    const headers = await dop.getTab2ColumnHeaders();
    await verify('The grid shows the Service Type and Exempt columns', async () => {
      expect(headers).toContain('Service Type');
      expect(headers).toContain('Exempt');
    });

    const rowCount = await dop.getTab2RowCount();
    await verify('The grid is populated', async () => {
      expect(rowCount).toBeGreaterThan(0);
    });

    const page = dop['page'];
    await verify('Cancel and Save are both offered', async () => {
      await expect(page.locator('button:text-is("Cancel")')).toBeVisible();
      await expect(page.locator('button:text-is("Save")')).toBeVisible();
    });
  });


  test('TC-DOP-EXM-002: Save is disabled when no changes have been made (pristine state)', async ({ dependencyGate }) => {
    dependencyGate(['TC-DOP-EXM-001']);

    const saveDisabled = await dop.isTab2SaveDisabled();
    await verify('Save is held back until something changes', async () => {
      expect(saveDisabled).toBe(true);
    });
  });


  test('TC-DOP-EXM-003: Search box filters rows; clearing restores the full list; no-match shows empty state', async ({ dependencyGate }) => {
    dependencyGate(['TC-DOP-EXM-001']);

    const baselineCount = await dop.getTab2RowCount();
    await verify('The unfiltered grid is populated', async () => {
      expect(baselineCount).toBeGreaterThan(0);
    });

    // Fill with a known partial match
    await dop.searchTab2('HSIA');
    const filteredCount = await dop.getTab2RowCount();
    await verify('The partial match narrows the grid without emptying it', async () => {
      expect(filteredCount).toBeLessThanOrEqual(baselineCount);
      expect(filteredCount).toBeGreaterThan(0);
    });

    const page = dop['page'];
    // Scoped to the exemptions panel — a bare 'tbody tr' can match Tab 1's grid too.
    const rows = page.locator(ROWS_TAB2);
    await verify('Every visible row carries the search term', async () => {
      // case-insensitive
      const count = await rows.count();
      for (let i = 0; i < count; i++) {
        const cellText = await rows.nth(i).locator('td').first().textContent();
        expect((cellText ?? '').toLowerCase()).toContain('hsia');
      }
    });

    // Clear restores full list
    await dop.clearSearchTab2();
    const restoredCount = await dop.getTab2RowCount();
    await verify('Clearing the search restores the full list', async () => {
      expect(restoredCount).toBe(baselineCount);
    });

    await dop.searchTab2('ZZZNO-MATCH-99999');
    const noMatchCount = await dop.getTab2RowCount();
    await verify('A term matching nothing empties the grid', async () => {
      expect(noMatchCount).toBe(0);
    });

    await dop.clearSearchTab2();
    const finalCount = await dop.getTab2RowCount();
    await verify('Clearing it again brings the full list back', async () => {
      expect(finalCount).toBe(baselineCount);
    });
  });


  test('TC-DOP-EXM-004: Search is case-insensitive', async ({ dependencyGate }) => {
    dependencyGate(['TC-DOP-EXM-003']);

    await dop.searchTab2('EQUIPMENT');
    const countUpper = await dop.getTab2RowCount();
    await verify('The upper-case term matches rows', async () => {
      expect(countUpper).toBeGreaterThan(0);
    });

    const page = dop['page'];
    // Scoped to the exemptions panel — a bare 'tbody tr' can match Tab 1's grid too.
    const rows = page.locator(ROWS_TAB2);
    const upperNames = await phase('Capture the names the upper-case search returned', async () => {
      const names: string[] = [];
      for (let i = 0; i < countUpper; i++) {
        const name = await rows.nth(i).locator('td').first().textContent();
        names.push((name ?? '').trim());
      }
      return names;
    });

    await dop.clearSearchTab2();
    await dop.searchTab2('equipment');
    const countLower = await dop.getTab2RowCount();
    await verify('The lower-case term matches the same number of rows', async () => {
      expect(countLower).toBe(countUpper);
    });

    const lowerNames = await phase('Capture the names the lower-case search returned', async () => {
      const names: string[] = [];
      for (let i = 0; i < countLower; i++) {
        const name = await rows.nth(i).locator('td').first().textContent();
        names.push((name ?? '').trim());
      }
      return names;
    });
    await verify('Both searches returned the same rows, not merely the same count', async () => {
      expect(lowerNames).toEqual(upperNames);
    });

    await dop.clearSearchTab2();
  });


  test('TC-DOP-EXM-005: Save cycle — pristine disabled, enabled by valid change, change persists after reload; Cancel discards', async ({ dependencyGate }) => {
    dependencyGate(['TC-DOP-EXM-001']);

    await verify('Save is disabled in the pristine state', async () => {
      expect(await dop.isTab2SaveDisabled()).toBe(true);
    });

    const originalState = await phase('Record the original exempt state', () =>
      dop.getExemptState(ROW_EQUIPMENT_RENTAL));

    try {
      await phase('Toggle the exempt flag', () => dop.toggleExempt(ROW_EQUIPMENT_RENTAL));
      await verify('The flag flips and Save unlocks', async () => {
        const stateAfterToggle = await dop.getExemptState(ROW_EQUIPMENT_RENTAL);
        expect(stateAfterToggle).toBe(!originalState);
        expect(await dop.isTab2SaveDisabled()).toBe(false);
      });

      await phase('Click Cancel', () => dop.clickTab2Cancel());
      await verify('The original state returns and Save locks again', async () => {
        expect(await dop.getExemptState(ROW_EQUIPMENT_RENTAL)).toBe(originalState);
        expect(await dop.isTab2SaveDisabled()).toBe(true);
      });

      await phase('Toggle the exempt flag again', () => dop.toggleExempt(ROW_EQUIPMENT_RENTAL));
      await verify('Save unlocks once more', async () => {
        expect(await dop.isTab2SaveDisabled()).toBe(false);
      });

      await phase('Save the change', () => dop.clickTab2Save());
      await verify('Save settles back to disabled', async () => {
        const saveWentDisabled = await dop.waitUntilTab2SaveDisabled(15_000);
        expect(saveWentDisabled).toBe(true);
      });

      await phase('Reload the page and return to the tab', async () => {
        await dop.reloadAndWait(OFFICE);
        await dop.switchTab('Special Rate Exemptions by Service Type');
      });
      await verify('The saved change survived the reload', async () => {
        const stateAfterReload = await dop.getExemptState(ROW_EQUIPMENT_RENTAL);
        expect(stateAfterReload).toBe(!originalState);
      });
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


  test('TC-DOP-EXM-006: Cancel discards multiple simultaneous checkbox changes', async ({ dependencyGate }) => {
    dependencyGate(['TC-DOP-EXM-001']);

    const stateA = await dop.getExemptState(ROW_EQUIPMENT_RENTAL);
    const stateB = await dop.getExemptState(ROW_DIGITAL_BRANDING);
    let cancelCalled = false;

    try {
      await phase('Toggle the exempt flag on both rows', async () => {
        await dop.toggleExempt(ROW_EQUIPMENT_RENTAL);
        await dop.toggleExempt(ROW_DIGITAL_BRANDING);
      });
      await verify('Both flags flipped and Save unlocked', async () => {
        expect(await dop.getExemptState(ROW_EQUIPMENT_RENTAL)).toBe(!stateA);
        expect(await dop.getExemptState(ROW_DIGITAL_BRANDING)).toBe(!stateB);
        expect(await dop.isTab2SaveDisabled()).toBe(false);
      });

      await phase('Click Cancel', () => dop.clickTab2Cancel());
      cancelCalled = true;

      await verify('Both changes were discarded and Save locked again', async () => {
        expect(await dop.getExemptState(ROW_EQUIPMENT_RENTAL)).toBe(stateA);
        expect(await dop.getExemptState(ROW_DIGITAL_BRANDING)).toBe(stateB);
        expect(await dop.isTab2SaveDisabled()).toBe(true);
      });
    } finally {
      // If the test failed before Cancel was called, discard pending changes now.
      if (!cancelCalled && await dop.isTab2SaveDisabled() === false) {
        await dop.clickTab2Cancel();
      }
    }
  });
});
