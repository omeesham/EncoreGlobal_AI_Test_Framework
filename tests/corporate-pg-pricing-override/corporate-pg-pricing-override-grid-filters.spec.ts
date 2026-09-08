import { test, expect } from '../../src/fixtures/pages.fixture';
import {
  CORP_PRICING_OVERRIDE,
  CORP_PRICING_OVERRIDE_FIXTURE,
  CORP_PRICING_OVERRIDE_ACTIVE_BED,
  CORP_PRICING_OVERRIDE_SORT_BED,
} from '../../src/data/corporate-override/override';
import { phase, verify } from '../../src/fixtures/report-steps';

test.describe('Corporate Pricing — Product Group Override: grid text filter, sort & Grid Options (NM-2270) @corporate-pricing @override', () => {
  // Three beds share this suite, so setup is dispatched by TC id and each group keeps the baseline
  // it had as a separate describe. Grid Options is server-persisted, hence restored before and after.
  const SORT_FILTER_IDS = ['TC-CPR-OVR-044', 'TC-CPR-OVR-045', 'TC-CPR-OVR-046', 'TC-CPR-OVR-048'];

  const GRID_OPTIONS_IDS = ['TC-CPR-OVR-047'];

  const BED = CORP_PRICING_OVERRIDE_FIXTURE;

  const startsWithAny = (title: string, ids: string[]) => ids.some((id) => title.startsWith(id));

  test.beforeEach(async ({ corporatePricingOverridePage: p }, testInfo) => {
    if (startsWithAny(testInfo.title, SORT_FILTER_IDS)) {
      test.setTimeout(90_000);
      await p.reloadAndReselect(CORP_PRICING_OVERRIDE_SORT_BED.office);
    } else if (startsWithAny(testInfo.title, GRID_OPTIONS_IDS)) {
      test.setTimeout(120_000);
      await p.ensureAllGridColumnsVisible(CORP_PRICING_OVERRIDE_SORT_BED.office);
    }
  });

  test.afterEach(async ({ corporatePricingOverridePage: p }, testInfo) => {
    if (!startsWithAny(testInfo.title, GRID_OPTIONS_IDS)) return;
    test.setTimeout(120_000);
    await p.ensureAllGridColumnsVisible(CORP_PRICING_OVERRIDE_SORT_BED.office);
  });

  // @fcc TC-CPR-OVR-044
  test('TC-CPR-OVR-044: Text filter "Camlok" narrows the grid to matching rows; clearing restores the full set (NM-2270)', async ({ corporatePricingOverridePage: p }) => {
    const PGN_COL = CORP_PRICING_OVERRIDE.columnIndex.productGroupName;

    await verify('The unfiltered grid shows every row', async () => {
      // verified for office 1105
      expect(await p.getVisibleRowCount()).toBe(CORP_PRICING_OVERRIDE_ACTIVE_BED.totalRows);
    });

    await p.filterProductGroups(CORP_PRICING_OVERRIDE_ACTIVE_BED.textFilterCamlok);
    await verify('Only the matching rows survive the filter', async () => {
      expect(await p.getVisibleRowCount()).toBe(CORP_PRICING_OVERRIDE_ACTIVE_BED.camlokTotalRows);
    });

    const filteredNames = await p.getColumnCellValues(PGN_COL);
    await verify('The surviving rows are the expected products, by identity', async () => {
      // identity, not just count
      expect(filteredNames).toContain(CORP_PRICING_OVERRIDE_ACTIVE_BED.inactiveGroupName1);
      expect(filteredNames).toContain(CORP_PRICING_OVERRIDE_ACTIVE_BED.inactiveGroupName2);
    });

    await p.clearFilter();
    await verify('Clearing the filter restores the full set', async () => {
      expect(await p.getVisibleRowCount()).toBe(CORP_PRICING_OVERRIDE_ACTIVE_BED.totalRows);
    });
  });

  // @fcc TC-CPR-OVR-045
  test('TC-CPR-OVR-045: Product Group Name column sort: ascending first cell matches walk oracle and order is non-decreasing; descending first cell matches walk oracle and order is non-increasing (NM-2270)', async ({ corporatePricingOverridePage: p }) => {
    const PGN_COL = CORP_PRICING_OVERRIDE.columnIndex.productGroupName;

    // sort is a dropdown on the header, not a header-click toggle
    await p.sortColumnViaDropdown('Product Group Name', 'ascending');
    await verify('Ascending: the top cell matches the oracle and the order never decreases', async () => {
      expect(await p.getFirstRowCellText(PGN_COL)).toBe(CORP_PRICING_OVERRIDE_SORT_BED.productGroupNameAscFirstCell);
      const ascValues = await p.getColumnCellValues(PGN_COL);
      for (let i = 1; i < ascValues.length; i++) {
        expect(ascValues[i]!.localeCompare(ascValues[i - 1]!)).toBeGreaterThanOrEqual(0);
      }
    });

    await p.sortColumnViaDropdown('Product Group Name', 'descending');
    await verify('Descending: the top cell matches the oracle and the order never increases', async () => {
      expect(await p.getFirstRowCellText(PGN_COL)).toBe(CORP_PRICING_OVERRIDE_SORT_BED.productGroupNameDescFirstCell);
      const descValues = await p.getColumnCellValues(PGN_COL);
      for (let i = 1; i < descValues.length; i++) {
        expect(descValues[i]!.localeCompare(descValues[i - 1]!)).toBeLessThanOrEqual(0);
      }
    });
  });

  // @fcc TC-CPR-OVR-046
  test('TC-CPR-OVR-046: Product Group column sort: ascending values are non-decreasing; descending values are non-increasing — self-verifying monotonic oracle (NM-2270)', async ({ corporatePricingOverridePage: p }) => {
    // Second sortable column: "Product Group" (numeric product group IDs, column index 1).
    // Compared numerically — the app sorts these as numbers (e.g. 2 before 10), not as strings.
    const PG_COL = CORP_PRICING_OVERRIDE.columnIndex.productGroup;

    await p.sortColumnViaDropdown('Product Group', 'ascending');
    await verify('Ascending: every id is numeric and never decreases', async () => {
      const ascValues = await p.getColumnCellValues(PG_COL);
      expect(ascValues.length, 'ascending sort must yield at least one row').toBeGreaterThan(0);
      for (let i = 1; i < ascValues.length; i++) {
        const prev = Number(ascValues[i - 1]!);
        const curr = Number(ascValues[i]!);
        expect(isNaN(prev), `ascending: row ${i - 1} cell "${ascValues[i - 1]}" should be numeric`).toBe(false);
        expect(isNaN(curr), `ascending: row ${i} cell "${ascValues[i]}" should be numeric`).toBe(false);
        expect(curr, `ascending: row ${i} (${curr}) must be ≥ row ${i - 1} (${prev})`).toBeGreaterThanOrEqual(prev);
      }
    });

    await p.sortColumnViaDropdown('Product Group', 'descending');
    await verify('Descending: every id is numeric and never increases', async () => {
      const descValues = await p.getColumnCellValues(PG_COL);
      expect(descValues.length, 'descending sort must yield at least one row').toBeGreaterThan(0);
      for (let i = 1; i < descValues.length; i++) {
        const prev = Number(descValues[i - 1]!);
        const curr = Number(descValues[i]!);
        expect(isNaN(prev), `descending: row ${i - 1} cell "${descValues[i - 1]}" should be numeric`).toBe(false);
        expect(isNaN(curr), `descending: row ${i} cell "${descValues[i]}" should be numeric`).toBe(false);
        expect(curr, `descending: row ${i} (${curr}) must be ≤ row ${i - 1} (${prev})`).toBeLessThanOrEqual(prev);
      }
    });
  });

  // @fcc TC-CPR-OVR-047
  test('TC-CPR-OVR-047: Hiding "Max Discount %" via Grid Options reduces visible column count; Reset to Default restores all columns (NM-2270)', { tag: '@mutation' }, async ({ corporatePricingOverridePage: p }) => {
    await verify('Every column starts visible', async () => {
      expect(await p.getColumnCount()).toBe(CORP_PRICING_OVERRIDE_SORT_BED.gridDefaultColumnCount);
    });

    await phase('Hide a column through Grid Options', async () => {
      await p.openGridOptions();
      await p.toggleGridColumn(CORP_PRICING_OVERRIDE_SORT_BED.gridHideTestColumn);
      await p.closeGridOptions();
    });
    await verify('The hidden column leaves the grid', async () => {
      expect(await p.getColumnCount()).toBe(CORP_PRICING_OVERRIDE_SORT_BED.gridHiddenColumnCount);
    });

    await phase('Reset to Default through Grid Options', async () => {
      await p.openGridOptions();
      await p.resetGridToDefault();
      await p.closeGridOptions();
    });
    await verify('Every column is restored', async () => {
      expect(await p.getColumnCount()).toBe(CORP_PRICING_OVERRIDE_SORT_BED.gridDefaultColumnCount);
    });
  });

  // @fcc TC-CPR-OVR-048
  test('TC-CPR-OVR-048: Text filter and column sort applied together: filtered rows match the filter and are correctly ordered (NM-2270)', async ({ corporatePricingOverridePage: p }) => {
    const PGN_COL = CORP_PRICING_OVERRIDE.columnIndex.productGroupName;

    await p.filterProductGroups(CORP_PRICING_OVERRIDE_ACTIVE_BED.textFilterCamlok);
    await verify('The filter narrows the grid', async () => {
      expect(await p.getVisibleRowCount()).toBe(CORP_PRICING_OVERRIDE_ACTIVE_BED.camlokTotalRows);
    });
    await p.sortColumnViaDropdown('Product Group Name', 'ascending');
    const filteredSorted = await p.getColumnCellValues(PGN_COL);
    await verify('The filter survives the sort', async () => {
      expect(filteredSorted.length).toBe(CORP_PRICING_OVERRIDE_ACTIVE_BED.camlokTotalRows);
    });
    await verify('Every visible row still matches the filter and is in order', async () => {
      // case-insensitive
      for (const name of filteredSorted) {
        expect(name!.toLowerCase()).toContain(CORP_PRICING_OVERRIDE_ACTIVE_BED.textFilterCamlok.toLowerCase());
      }
      for (let i = 1; i < filteredSorted.length; i++) {
        expect(filteredSorted[i]!.localeCompare(filteredSorted[i - 1]!)).toBeGreaterThanOrEqual(0);
      }
    });

    await p.clearFilter();
    await verify('Clearing the filter restores the full set', async () => {
      expect(await p.getVisibleRowCount()).toBe(CORP_PRICING_OVERRIDE_ACTIVE_BED.totalRows);
    });
  });

  // ── Toolbar text-filter boundary ──
  test('TC-CPR-OVR-115: Text filter narrows grid and empty filter shows no results', async ({ corporatePricingOverridePage: overridePage }) => {
    await overridePage.navigateToEquipmentRow(BED.office, BED.office, BED.mutationRowAnchor.productGroupId);

    // Grid-scoped row locator — excludes the product-group picker's second table
    const gridRows = overridePage.page.locator('table:has(th:has-text("Override Price")) tbody tr');
    const filterInput = overridePage.page.getByPlaceholder('Filter Product Groups Override');
    const baselineCount = await phase('Count the unfiltered rows', () => gridRows.count());

    await phase('Filter on a term that matches one product group', () => filterInput.fill('70'));
    await verify('Exactly that one row survives, by identity', async () => {
      await expect(gridRows).toHaveCount(1, { timeout: 5_000 });
      // identity beats a count
      await expect(gridRows.first()).toContainText('2609');
    });

    await phase('Filter on a term that matches nothing', () => filterInput.fill('zzzz-no-match-w18'));
    await verify('The empty state is announced', async () => {
      await expect(overridePage.page.locator('text=No results.')).toBeVisible({ timeout: 5_000 });
    });

    await phase('Clear the filter', () => filterInput.clear());
    await verify('Every row is back', async () => {
      await expect(gridRows).toHaveCount(baselineCount, { timeout: 5_000 });
    });
  });
});
