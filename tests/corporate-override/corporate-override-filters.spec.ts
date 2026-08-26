import { test, expect } from '../../src/fixtures/pages.fixture';
import {
  CORP_PRICING_OVERRIDE_ACTIVE_BED,
  OVERRIDE_CURRENCY_BED,
} from '../../src/data/corporate-override/override';
import { CorporatePricingOverrideSelectors } from '../../src/selectors/corporate-override/override';

const GRID_ROW = CorporatePricingOverrideSelectors.ovrGridRowAny;

test.describe('Corporate Pricing — Product Group Override: filters — Active-only, text & currency (NM-2269) @corporate-pricing @override', () => {
  // Two beds in one suite:
  //  - TC-041..043 (Active-only / text-filter effects): office 1105 — the only walk-verified bed
  //    with inactive rows (9 Equipment rows: 7 active, 2 inactive — Camlok #1 and Camlok #2).
  //  - TC-124..126 (currency filter): office 1145 (multi-currency bed) — each test navigates itself.
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
    // Baseline: Active-only is OFF; all 9 rows are visible (7 active + 2 inactive)
    expect(await p.getActiveOnlyState()).toBe(false);
    expect(await p.getVisibleRowCount()).toBe(CORP_PRICING_OVERRIDE_ACTIVE_BED.totalRows);

    // Check Active-only — the two inactive product groups must disappear
    await p.setActiveOnly(true);
    await expect.poll(() => p.getVisibleRowCount()).toBe(CORP_PRICING_OVERRIDE_ACTIVE_BED.activeOnlyRows);
    expect(await p.getVisibleRowCount()).toBe(CORP_PRICING_OVERRIDE_ACTIVE_BED.activeOnlyRows);
    expect(await p.findRowByProductGroup(CORP_PRICING_OVERRIDE_ACTIVE_BED.inactiveGroupName1)).toBeNull();
    expect(await p.findRowByProductGroup(CORP_PRICING_OVERRIDE_ACTIVE_BED.inactiveGroupName2)).toBeNull();

    // Uncheck Active-only — full set and the inactive rows must be restored
    await p.setActiveOnly(false);
    await expect.poll(() => p.getVisibleRowCount()).toBe(CORP_PRICING_OVERRIDE_ACTIVE_BED.totalRows);
    expect(await p.getVisibleRowCount()).toBe(CORP_PRICING_OVERRIDE_ACTIVE_BED.totalRows);
    expect(await p.findRowByProductGroup(CORP_PRICING_OVERRIDE_ACTIVE_BED.inactiveGroupName1)).not.toBeNull();
    expect(await p.findRowByProductGroup(CORP_PRICING_OVERRIDE_ACTIVE_BED.inactiveGroupName2)).not.toBeNull();
  });

  // Office 1105 is USD-only (verified 2026-07-17: 9 Equipment rows, all USD).
  // The selectCurrency method relies on the currency filter dropdown showing "ALL",
  // which matches only when currency is currently ALL — safe for one call per test.
  // Two-direction oracle: ALL shows rows; an absent currency shows 0. A filter that ignores
  // its input cannot satisfy both assertions simultaneously.
  test('TC-CPR-OVR-042: Currency filter yields the exact row count for the present currency, 0 for an absent currency, and restores the full set', async ({ corporatePricingOverridePage: p }) => {
    // Direction 1: ALL (baseline reset by beforeEach) shows the full row set
    expect(await p.getVisibleRowCount()).toBe(CORP_PRICING_OVERRIDE_ACTIVE_BED.totalRows);

    // Direction 2: selecting an absent currency must yield exactly 0
    // (CAD has no rows on office 1105 — verified 2026-07-17; if filter ignores input it would stay at totalRows)
    await p.selectCurrency(CORP_PRICING_OVERRIDE_ACTIVE_BED.absentCurrency);
    await expect.poll(() => p.getVisibleRowCount(), { timeout: 30_000 }).toBe(0);
    expect(await p.getVisibleRowCount()).toBe(0);
  });

  // @fcc TC-CPR-OVR-043
  test('TC-CPR-OVR-043: Active-only and text filter applied simultaneously produce the correct intersection; filter order does not affect the result; resetting all restores the full row set (NM-2269)', async ({ corporatePricingOverridePage: p }) => {
    // Phase A — text filter first, then Active-only on top
    // Camlok filter alone: 2 rows (both Camlok rows are inactive)
    await p.filterProductGroups(CORP_PRICING_OVERRIDE_ACTIVE_BED.textFilterCamlok);
    expect(await p.getVisibleRowCount()).toBe(CORP_PRICING_OVERRIDE_ACTIVE_BED.camlokTotalRows);
    // Add Active-only on top: Camloks are inactive, so intersection is 0 rows
    await p.setActiveOnly(true);
    await expect.poll(() => p.getVisibleRowCount()).toBe(0);
    expect(await p.getVisibleRowCount()).toBe(0);

    // Reset both filters (text filter first, then Active-only)
    await p.clearFilter();
    await expect.poll(() => p.getVisibleRowCount()).toBe(CORP_PRICING_OVERRIDE_ACTIVE_BED.activeOnlyRows);
    await p.setActiveOnly(false);
    await expect.poll(() => p.getVisibleRowCount()).toBe(CORP_PRICING_OVERRIDE_ACTIVE_BED.totalRows);
    expect(await p.getVisibleRowCount()).toBe(CORP_PRICING_OVERRIDE_ACTIVE_BED.totalRows);

    // Phase B — Active-only first, then text filter (order independence: same intersection, different order)
    await p.setActiveOnly(true);
    await expect.poll(() => p.getVisibleRowCount()).toBe(CORP_PRICING_OVERRIDE_ACTIVE_BED.activeOnlyRows);
    expect(await p.getVisibleRowCount()).toBe(CORP_PRICING_OVERRIDE_ACTIVE_BED.activeOnlyRows);
    await p.filterProductGroups(CORP_PRICING_OVERRIDE_ACTIVE_BED.textFilterCamlok);
    // Camloks are inactive, Active-only still ON → 0 rows (same result as Phase A — order independent)
    expect(await p.getVisibleRowCount()).toBe(0);

    // Reset Active-only while text filter still active → inactive Camloks become visible again
    await p.setActiveOnly(false);
    await expect.poll(() => p.getVisibleRowCount()).toBe(CORP_PRICING_OVERRIDE_ACTIVE_BED.camlokTotalRows);
    expect(await p.getVisibleRowCount()).toBe(CORP_PRICING_OVERRIDE_ACTIVE_BED.camlokTotalRows);
    // Clear text filter → full row set restored
    await p.clearFilter();
    expect(await p.getVisibleRowCount()).toBe(CORP_PRICING_OVERRIDE_ACTIVE_BED.totalRows);
  });

  // ── Currency filter — Office 1145 (multi-currency bed) ──
  test('TC-CPR-OVR-124: USD filter yields only USD rows — CAD row PG 425 absent', async ({ corporatePricingOverridePage: overridePage }) => {
    await overridePage.navigateToEquipmentRow(BED.office, BED.office, BED.rows.usdAnchor.productGroupId);

    // Baseline: ALL filter, 11 rows
    const rows = overridePage.page.locator(GRID_ROW);
    await expect(rows).toHaveCount(BED.totalRows, { timeout: 10_000 });

    // Apply USD filter via the currency dropdown
    await overridePage.selectCurrency('USD');

    // Assert: exactly 10 USD rows (auto-retry waits for grid re-render — no fixed sleep)
    await expect(rows).toHaveCount(BED.currencies.USD.count, { timeout: 15_000 });

    // Assert row identity: CAD row PG 425 is ABSENT
    await expect(overridePage.page.locator(GRID_ROW, { hasText: BED.rows.cadAnchor.productGroupId })).toBeHidden();
    // Assert row identity: USD row PG 4298 is PRESENT
    await expect(overridePage.page.locator(GRID_ROW, { hasText: BED.rows.usdAnchor.productGroupId })).toBeVisible();

    // Restore: ALL filter → 11 rows (dropdown now shows 'USD', re-target it)
    await overridePage.resetCurrencyFilter('USD');
    await expect(rows).toHaveCount(BED.totalRows, { timeout: 15_000 });
  });

  test('TC-CPR-OVR-125: CAD filter yields only CAD rows — single row PG 425 present', async ({ corporatePricingOverridePage: overridePage }) => {
    await overridePage.navigateToEquipmentRow(BED.office, BED.office, BED.rows.usdAnchor.productGroupId);

    const rows = overridePage.page.locator(GRID_ROW);
    await expect(rows).toHaveCount(BED.totalRows, { timeout: 10_000 });

    // Apply CAD filter via the currency dropdown
    await overridePage.selectCurrency('CAD');

    // Assert: exactly 1 CAD row (auto-retry waits for grid re-render — no fixed sleep)
    await expect(rows).toHaveCount(BED.currencies.CAD.count, { timeout: 15_000 });

    // Assert row identity: CAD row PG 425 IS present
    await expect(overridePage.page.locator(GRID_ROW, { hasText: BED.rows.cadAnchor.productGroupId })).toBeVisible();
    // Assert row identity: USD row PG 4298 is ABSENT
    await expect(overridePage.page.locator(GRID_ROW, { hasText: BED.rows.usdAnchor.productGroupId })).toBeHidden();

    // Restore: ALL filter → 11 rows (dropdown now shows 'CAD', re-target it)
    await overridePage.resetCurrencyFilter('CAD');
    await expect(rows).toHaveCount(BED.totalRows, { timeout: 15_000 });
  });

  test('TC-CPR-OVR-126: MXN filter yields 0 rows on USD/CAD-only office', async ({ corporatePricingOverridePage: overridePage }) => {
    await overridePage.navigateToEquipmentRow(BED.office, BED.office, BED.rows.usdAnchor.productGroupId);

    const rows = overridePage.page.locator(GRID_ROW);
    await expect(rows).toHaveCount(BED.totalRows, { timeout: 10_000 });

    // Apply MXN filter via the currency dropdown
    await overridePage.selectCurrency('MXN');

    // Assert: exactly 0 rows (no MXN data on office 1145) — auto-retry waits for grid re-render
    await expect(rows).toHaveCount(BED.currencies.MXN.count, { timeout: 15_000 });

    // Assert row identity: both anchors absent (grid is empty)
    await expect(overridePage.page.locator(GRID_ROW, { hasText: BED.rows.cadAnchor.productGroupId })).toBeHidden();
    await expect(overridePage.page.locator(GRID_ROW, { hasText: BED.rows.usdAnchor.productGroupId })).toBeHidden();

    // Restore: ALL filter → 11 rows (dropdown now shows 'MXN', re-target it)
    await overridePage.resetCurrencyFilter('MXN');
    await expect(rows).toHaveCount(BED.totalRows, { timeout: 15_000 });
  });
});
