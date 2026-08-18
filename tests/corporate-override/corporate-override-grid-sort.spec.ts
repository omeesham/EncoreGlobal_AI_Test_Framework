import { test, expect } from '../../src/fixtures/pages.fixture';
import {
  CORP_PRICING_OVERRIDE,
  CORP_PRICING_OVERRIDE_FIXTURE,
  CORP_PRICING_OVERRIDE_ACTIVE_BED,
  CORP_PRICING_OVERRIDE_SORT_BED,
} from '../../src/data/corporate-override/override';

test.describe('Corporate Pricing — Product Group Override: grid text filter + sort effects (NM-2270) @corporate-pricing @override', () => {
  // Office 1105: 9 Equipment rows total; verified sort oracles and filter counts.
  test.beforeEach(async ({ corporatePricingOverridePage: p }) => {
    test.setTimeout(90_000);
    await p.reloadAndReselect(CORP_PRICING_OVERRIDE_SORT_BED.office);
  });

  // @fcc TC-CPR-OVR-044
  test('TC-CPR-OVR-044: Text filter "Camlok" narrows the grid to matching rows; clearing restores the full set (NM-2270)', async ({ corporatePricingOverridePage: p }) => {
    const PGN_COL = CORP_PRICING_OVERRIDE.columnIndex.productGroupName;

    // Baseline: all 9 rows visible (verified for office 1105)
    expect(await p.getVisibleRowCount()).toBe(CORP_PRICING_OVERRIDE_ACTIVE_BED.totalRows);

    // Apply filter — only the 2 Camlok rows survive
    await p.filterProductGroups(CORP_PRICING_OVERRIDE_ACTIVE_BED.textFilterCamlok);
    expect(await p.getVisibleRowCount()).toBe(CORP_PRICING_OVERRIDE_ACTIVE_BED.camlokTotalRows);

    // Assert the specific Camlok product identities are the visible rows (not just count)
    const filteredNames = await p.getColumnCellValues(PGN_COL);
    expect(filteredNames).toContain(CORP_PRICING_OVERRIDE_ACTIVE_BED.inactiveGroupName1);
    expect(filteredNames).toContain(CORP_PRICING_OVERRIDE_ACTIVE_BED.inactiveGroupName2);

    // Clear filter — full 9-row set restores
    await p.clearFilter();
    expect(await p.getVisibleRowCount()).toBe(CORP_PRICING_OVERRIDE_ACTIVE_BED.totalRows);
  });

  // @fcc TC-CPR-OVR-045
  test('TC-CPR-OVR-045: Product Group Name column sort: ascending first cell matches walk oracle and order is non-decreasing; descending first cell matches walk oracle and order is non-increasing (NM-2270)', async ({ corporatePricingOverridePage: p }) => {
    const PGN_COL = CORP_PRICING_OVERRIDE.columnIndex.productGroupName;

    // Sort ascending via the header dropdown menu (sort is a dropdown, not a header-click toggle)
    await p.sortColumnViaDropdown('Product Group Name', 'ascending');
    expect(await p.getFirstRowCellText(PGN_COL)).toBe(CORP_PRICING_OVERRIDE_SORT_BED.productGroupNameAscFirstCell);
    const ascValues = await p.getColumnCellValues(PGN_COL);
    for (let i = 1; i < ascValues.length; i++) {
      expect(ascValues[i]!.localeCompare(ascValues[i - 1]!)).toBeGreaterThanOrEqual(0);
    }

    // Sort descending
    await p.sortColumnViaDropdown('Product Group Name', 'descending');
    expect(await p.getFirstRowCellText(PGN_COL)).toBe(CORP_PRICING_OVERRIDE_SORT_BED.productGroupNameDescFirstCell);
    const descValues = await p.getColumnCellValues(PGN_COL);
    for (let i = 1; i < descValues.length; i++) {
      expect(descValues[i]!.localeCompare(descValues[i - 1]!)).toBeLessThanOrEqual(0);
    }
  });

  // @fcc TC-CPR-OVR-046
  test('TC-CPR-OVR-046: Product Group column sort: ascending values are non-decreasing; descending values are non-increasing — self-verifying monotonic oracle (NM-2270)', async ({ corporatePricingOverridePage: p }) => {
    // Second sortable column: "Product Group" (numeric product group IDs, column index 1).
    // Compared numerically — the app sorts these as numbers (e.g. 2 before 10), not as strings.
    const PG_COL = CORP_PRICING_OVERRIDE.columnIndex.productGroup;

    await p.sortColumnViaDropdown('Product Group', 'ascending');
    const ascValues = await p.getColumnCellValues(PG_COL);
    expect(ascValues.length, 'ascending sort must yield at least one row').toBeGreaterThan(0);
    for (let i = 1; i < ascValues.length; i++) {
      const prev = Number(ascValues[i - 1]!);
      const curr = Number(ascValues[i]!);
      expect(isNaN(prev), `ascending: row ${i - 1} cell "${ascValues[i - 1]}" should be numeric`).toBe(false);
      expect(isNaN(curr), `ascending: row ${i} cell "${ascValues[i]}" should be numeric`).toBe(false);
      expect(curr, `ascending: row ${i} (${curr}) must be ≥ row ${i - 1} (${prev})`).toBeGreaterThanOrEqual(prev);
    }

    await p.sortColumnViaDropdown('Product Group', 'descending');
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

  // @fcc TC-CPR-OVR-048
  test('TC-CPR-OVR-048: Text filter and column sort applied together: filtered rows match the filter and are correctly ordered (NM-2270)', async ({ corporatePricingOverridePage: p }) => {
    const PGN_COL = CORP_PRICING_OVERRIDE.columnIndex.productGroupName;

    // Apply text filter, then sort — the filtered set must be the right count and non-decreasing
    await p.filterProductGroups(CORP_PRICING_OVERRIDE_ACTIVE_BED.textFilterCamlok);
    expect(await p.getVisibleRowCount()).toBe(CORP_PRICING_OVERRIDE_ACTIVE_BED.camlokTotalRows);
    await p.sortColumnViaDropdown('Product Group Name', 'ascending');
    const filteredSorted = await p.getColumnCellValues(PGN_COL);
    expect(filteredSorted.length).toBe(CORP_PRICING_OVERRIDE_ACTIVE_BED.camlokTotalRows); // filter survives the sort

    // Every visible row must match the filter (case-insensitive)
    for (const name of filteredSorted) {
      expect(name!.toLowerCase()).toContain(CORP_PRICING_OVERRIDE_ACTIVE_BED.textFilterCamlok.toLowerCase());
    }

    for (let i = 1; i < filteredSorted.length; i++) {
      expect(filteredSorted[i]!.localeCompare(filteredSorted[i - 1]!)).toBeGreaterThanOrEqual(0);
    }

    // Clear filter — full row set restores
    await p.clearFilter();
    expect(await p.getVisibleRowCount()).toBe(CORP_PRICING_OVERRIDE_ACTIVE_BED.totalRows);
  });
});

test.describe('Corporate Pricing — Product Group Override: Grid Options column hide and Reset to Default (NM-2270) @corporate-pricing @override @mutation', () => {
  // Column visibility is a server-persisted preference — restore all columns before and after each test.
  test.beforeEach(async ({ corporatePricingOverridePage: p }) => {
    test.setTimeout(120_000);
    await p.ensureAllGridColumnsVisible(CORP_PRICING_OVERRIDE_SORT_BED.office);
  });
  test.afterEach(async ({ corporatePricingOverridePage: p }) => {
    test.setTimeout(120_000);
    await p.ensureAllGridColumnsVisible(CORP_PRICING_OVERRIDE_SORT_BED.office);
  });

  // @fcc TC-CPR-OVR-047
  test('TC-CPR-OVR-047: Hiding "Max Discount %" via Grid Options reduces visible column count; Reset to Default restores all columns (NM-2270)', async ({ corporatePricingOverridePage: p }) => {
    // Baseline: all 10 columns visible (verified)
    expect(await p.getColumnCount()).toBe(CORP_PRICING_OVERRIDE_SORT_BED.gridDefaultColumnCount);

    // Hide "Max Discount %" — visible column count must drop to 9 (verified)
    await p.openGridOptions();
    await p.toggleGridColumn(CORP_PRICING_OVERRIDE_SORT_BED.gridHideTestColumn);
    await p.closeGridOptions();
    expect(await p.getColumnCount()).toBe(CORP_PRICING_OVERRIDE_SORT_BED.gridHiddenColumnCount);

    // Reset to Default — all 10 columns must be restored
    await p.openGridOptions();
    await p.resetGridToDefault();
    await p.closeGridOptions();
    expect(await p.getColumnCount()).toBe(CORP_PRICING_OVERRIDE_SORT_BED.gridDefaultColumnCount);
  });
});

test.describe('Override Toolbar — Text Filter Boundary', () => {
  const BED = CORP_PRICING_OVERRIDE_FIXTURE;

  test('TC-CPR-OVR-115: Text filter narrows grid and empty filter shows no results', async ({ corporatePricingOverridePage: overridePage }) => {
    await overridePage.navigateToEquipmentRow(BED.office, BED.office, BED.mutationRowAnchor.productGroupId);

    // Grid-scoped row locator — excludes the product-group picker's second table
    const gridRows = overridePage.page.locator('table:has(th:has-text("Override Price")) tbody tr');
    const filterInput = overridePage.page.getByPlaceholder('Filter Product Groups Override');
    const baselineCount = await gridRows.count();

    // "70" selectively narrows to PG 2609 only
    await filterInput.fill('70');
    await expect(gridRows).toHaveCount(1, { timeout: 5_000 });
    // Assert the surviving row's identity — identity beats a count
    await expect(gridRows.first()).toContainText('2609');

    // No-match string produces the "No results." empty state
    await filterInput.fill('zzzz-no-match-w18');
    await expect(overridePage.page.locator('text=No results.')).toBeVisible({ timeout: 5_000 });

    // Clear and verify restore
    await filterInput.clear();
    await expect(gridRows).toHaveCount(baselineCount, { timeout: 5_000 });
  });
});
