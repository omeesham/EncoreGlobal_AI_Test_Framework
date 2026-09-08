import { test, expect } from '../../src/fixtures/pages.fixture';
import {
  CORP_PRICING_OVERRIDE_ACTIVE_BED,
  OVERRIDE_CURRENCY_BED,
} from '../../src/data/corporate-override/override';
import { CorporatePricingOverrideSelectors } from '../../src/selectors/corporate-override/override';
import { phase, verify } from '../../src/fixtures/report-steps';

const GRID_ROW = CorporatePricingOverrideSelectors.ovrGridRowAny;

test.describe('Corporate Pricing — Product Group Override: filters — Active-only, text & currency (NM-2269) @corporate-pricing @override', () => {
  // Two beds in one suite: office 1105 is the only one with inactive rows (for the Active-only tests);
  // the currency tests use the multi-currency office 1145 and navigate themselves.
  const ACTIVE_ONLY_BED_IDS = ['TC-CPR-OVR-041', 'TC-CPR-OVR-042', 'TC-CPR-OVR-043'];
  const BED = OVERRIDE_CURRENCY_BED;
  test.beforeEach(async ({ corporatePricingOverridePage: p }, testInfo) => {
    // Baseline reset applies only to the office-1105 filter-effect tests.
    if (!ACTIVE_ONLY_BED_IDS.some((id) => testInfo.title.startsWith(id))) return;
    test.setTimeout(90_000);
    // Per-test baseline: full reload + location re-select resets all filter state
    // (Active-only OFF, Currency ALL, text filter empty).
    await p.reloadAndReselect(CORP_PRICING_OVERRIDE_ACTIVE_BED.office);
  });

  // @fcc TC-CPR-OVR-041
  test('TC-CPR-OVR-041: Active-only removes inactive rows and restores the full set on uncheck (NM-2269)', async ({ corporatePricingOverridePage: p }) => {
    await verify('Active-only rests off with every row shown', async () => {
      // Baseline: Active-only is OFF; all 9 rows are visible (7 active + 2 inactive)
      expect(await p.getActiveOnlyState()).toBe(false);
      expect(await p.getVisibleRowCount()).toBe(CORP_PRICING_OVERRIDE_ACTIVE_BED.totalRows);
    });

    await phase('Check Active-only', () => p.setActiveOnly(true));
    await verify('The inactive product groups leave the grid', async () => {
      await expect.poll(() => p.getVisibleRowCount()).toBe(CORP_PRICING_OVERRIDE_ACTIVE_BED.activeOnlyRows);
      expect(await p.getVisibleRowCount()).toBe(CORP_PRICING_OVERRIDE_ACTIVE_BED.activeOnlyRows);
      expect(await p.findRowByProductGroup(CORP_PRICING_OVERRIDE_ACTIVE_BED.inactiveGroupName1)).toBeNull();
      expect(await p.findRowByProductGroup(CORP_PRICING_OVERRIDE_ACTIVE_BED.inactiveGroupName2)).toBeNull();
    });

    await phase('Uncheck Active-only', () => p.setActiveOnly(false));
    await verify('The full set and both inactive rows are restored', async () => {
      await expect.poll(() => p.getVisibleRowCount()).toBe(CORP_PRICING_OVERRIDE_ACTIVE_BED.totalRows);
      expect(await p.getVisibleRowCount()).toBe(CORP_PRICING_OVERRIDE_ACTIVE_BED.totalRows);
      expect(await p.findRowByProductGroup(CORP_PRICING_OVERRIDE_ACTIVE_BED.inactiveGroupName1)).not.toBeNull();
      expect(await p.findRowByProductGroup(CORP_PRICING_OVERRIDE_ACTIVE_BED.inactiveGroupName2)).not.toBeNull();
    });
  });

  // selectCurrency targets the dropdown by its "ALL" text, so only one call per test is safe.
  // Two-direction oracle: a filter that ignores its input cannot satisfy both assertions.
  test('TC-CPR-OVR-042: Currency filter yields the exact row count for the present currency, 0 for an absent currency, and restores the full set', async ({ corporatePricingOverridePage: p }) => {
    await verify('The ALL currency baseline shows the full row set', async () => {
      // Direction 1: ALL (baseline reset by beforeEach) shows the full row set
      expect(await p.getVisibleRowCount()).toBe(CORP_PRICING_OVERRIDE_ACTIVE_BED.totalRows);
    });

    // Direction 2: selecting an absent currency must yield exactly 0
    // CAD has no rows on office 1105 — a filter that ignored input would stay at totalRows.
    await phase('Select a currency with no rows on this office', () =>
      p.selectCurrency(CORP_PRICING_OVERRIDE_ACTIVE_BED.absentCurrency));
    await verify('The grid empties completely', async () => {
      await expect.poll(() => p.getVisibleRowCount(), { timeout: 30_000 }).toBe(0);
      expect(await p.getVisibleRowCount()).toBe(0);
    });
  });

  // @fcc TC-CPR-OVR-043
  test('TC-CPR-OVR-043: Active-only and text filter applied simultaneously produce the correct intersection; filter order does not affect the result; resetting all restores the full row set (NM-2269)', async ({ corporatePricingOverridePage: p }) => {
    // Phase A — text filter first, then Active-only on top
    // Camlok filter alone: 2 rows (both Camlok rows are inactive)
    await phase('Filter the product groups by text', () =>
      p.filterProductGroups(CORP_PRICING_OVERRIDE_ACTIVE_BED.textFilterCamlok));
    await verify('The text filter alone leaves both Camlok rows', async () => {
      expect(await p.getVisibleRowCount()).toBe(CORP_PRICING_OVERRIDE_ACTIVE_BED.camlokTotalRows);
    });
    // Add Active-only on top: Camloks are inactive, so intersection is 0 rows
    await phase('Add Active-only on top of the text filter', () => p.setActiveOnly(true));
    await verify('The intersection is empty — every Camlok is inactive', async () => {
      await expect.poll(() => p.getVisibleRowCount()).toBe(0);
      expect(await p.getVisibleRowCount()).toBe(0);
    });

    // Reset both filters (text filter first, then Active-only)
    await phase('Clear the text filter, then Active-only', async () => {
      await p.clearFilter();
      await expect.poll(() => p.getVisibleRowCount()).toBe(CORP_PRICING_OVERRIDE_ACTIVE_BED.activeOnlyRows);
      await p.setActiveOnly(false);
    });
    await verify('The full row set is back', async () => {
      await expect.poll(() => p.getVisibleRowCount()).toBe(CORP_PRICING_OVERRIDE_ACTIVE_BED.totalRows);
      expect(await p.getVisibleRowCount()).toBe(CORP_PRICING_OVERRIDE_ACTIVE_BED.totalRows);
    });

    // Phase B — Active-only first, then text filter (order independence: same intersection, different order)
    await phase('Apply Active-only first this time', () => p.setActiveOnly(true));
    await verify('Only the active rows remain', async () => {
      await expect.poll(() => p.getVisibleRowCount()).toBe(CORP_PRICING_OVERRIDE_ACTIVE_BED.activeOnlyRows);
      expect(await p.getVisibleRowCount()).toBe(CORP_PRICING_OVERRIDE_ACTIVE_BED.activeOnlyRows);
    });
    await phase('Add the text filter on top', () =>
      p.filterProductGroups(CORP_PRICING_OVERRIDE_ACTIVE_BED.textFilterCamlok));
    await verify('The same empty intersection results, whichever order', async () => {
      // Camloks are inactive, Active-only still ON → 0 rows (same result as Phase A — order independent)
      expect(await p.getVisibleRowCount()).toBe(0);
    });

    // Reset Active-only while text filter still active → inactive Camloks become visible again
    await phase('Drop Active-only, keeping the text filter', () => p.setActiveOnly(false));
    await verify('The inactive Camloks come back', async () => {
      await expect.poll(() => p.getVisibleRowCount()).toBe(CORP_PRICING_OVERRIDE_ACTIVE_BED.camlokTotalRows);
      expect(await p.getVisibleRowCount()).toBe(CORP_PRICING_OVERRIDE_ACTIVE_BED.camlokTotalRows);
    });
    await phase('Clear the text filter', () => p.clearFilter());
    await verify('The full row set is restored', async () => {
      expect(await p.getVisibleRowCount()).toBe(CORP_PRICING_OVERRIDE_ACTIVE_BED.totalRows);
    });
  });

  // ── Currency filter — Office 1145 (multi-currency bed) ──
  test('TC-CPR-OVR-124: USD filter yields only USD rows — CAD row PG 425 absent', async ({ corporatePricingOverridePage: overridePage }) => {
    await phase('Open the override grid for the multi-currency office', () =>
      overridePage.navigateToEquipmentRow(BED.office, BED.office, BED.rows.usdAnchor.productGroupId));

    // Baseline: ALL filter, 11 rows
    const rows = overridePage.page.locator(GRID_ROW);
    await verify('The unfiltered grid holds every row', async () => {
      await expect(rows).toHaveCount(BED.totalRows, { timeout: 10_000 });
    });

    await phase('Apply the USD currency filter', () => overridePage.selectCurrency('USD'));
    await verify('Only the ten USD rows remain', async () => {
      // auto-retry waits for grid re-render — no fixed sleep
      await expect(rows).toHaveCount(BED.currencies.USD.count, { timeout: 15_000 });
    });
    await verify('The CAD row is gone and the USD row is present', async () => {
      await expect(overridePage.page.locator(GRID_ROW, { hasText: BED.rows.cadAnchor.productGroupId })).toBeHidden();
      await expect(overridePage.page.locator(GRID_ROW, { hasText: BED.rows.usdAnchor.productGroupId })).toBeVisible();
    });

    // Restore: ALL filter → 11 rows (dropdown now shows 'USD', re-target it)
    await phase('Restore the ALL currency filter', () => overridePage.resetCurrencyFilter('USD'));
    await verify('Every row is back', async () => {
      await expect(rows).toHaveCount(BED.totalRows, { timeout: 15_000 });
    });
  });

  test('TC-CPR-OVR-125: CAD filter yields only CAD rows — single row PG 425 present', async ({ corporatePricingOverridePage: overridePage }) => {
    await phase('Open the override grid for the multi-currency office', () =>
      overridePage.navigateToEquipmentRow(BED.office, BED.office, BED.rows.usdAnchor.productGroupId));

    const rows = overridePage.page.locator(GRID_ROW);
    await verify('The unfiltered grid holds every row', async () => {
      await expect(rows).toHaveCount(BED.totalRows, { timeout: 10_000 });
    });

    await phase('Apply the CAD currency filter', () => overridePage.selectCurrency('CAD'));
    await verify('Exactly the one CAD row remains', async () => {
      // auto-retry waits for grid re-render — no fixed sleep
      await expect(rows).toHaveCount(BED.currencies.CAD.count, { timeout: 15_000 });
    });
    await verify('The CAD row is present and the USD row is gone', async () => {
      await expect(overridePage.page.locator(GRID_ROW, { hasText: BED.rows.cadAnchor.productGroupId })).toBeVisible();
      await expect(overridePage.page.locator(GRID_ROW, { hasText: BED.rows.usdAnchor.productGroupId })).toBeHidden();
    });

    // Restore: ALL filter → 11 rows (dropdown now shows 'CAD', re-target it)
    await phase('Restore the ALL currency filter', () => overridePage.resetCurrencyFilter('CAD'));
    await verify('Every row is back', async () => {
      await expect(rows).toHaveCount(BED.totalRows, { timeout: 15_000 });
    });
  });

  test('TC-CPR-OVR-126: MXN filter yields 0 rows on USD/CAD-only office', async ({ corporatePricingOverridePage: overridePage }) => {
    await phase('Open the override grid for the multi-currency office', () =>
      overridePage.navigateToEquipmentRow(BED.office, BED.office, BED.rows.usdAnchor.productGroupId));

    const rows = overridePage.page.locator(GRID_ROW);
    await verify('The unfiltered grid holds every row', async () => {
      await expect(rows).toHaveCount(BED.totalRows, { timeout: 10_000 });
    });

    await phase('Apply the MXN currency filter', () => overridePage.selectCurrency('MXN'));
    await verify('No rows match — this office carries no MXN pricing', async () => {
      // auto-retry waits for grid re-render
      await expect(rows).toHaveCount(BED.currencies.MXN.count, { timeout: 15_000 });
      // both anchors absent (grid is empty)
      await expect(overridePage.page.locator(GRID_ROW, { hasText: BED.rows.cadAnchor.productGroupId })).toBeHidden();
      await expect(overridePage.page.locator(GRID_ROW, { hasText: BED.rows.usdAnchor.productGroupId })).toBeHidden();
    });

    // Restore: ALL filter → 11 rows (dropdown now shows 'MXN', re-target it)
    await phase('Restore the ALL currency filter', () => overridePage.resetCurrencyFilter('MXN'));
    await verify('Every row is back', async () => {
      await expect(rows).toHaveCount(BED.totalRows, { timeout: 15_000 });
    });
  });
});
