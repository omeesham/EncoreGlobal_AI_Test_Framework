import { test, expect } from '../../src/fixtures/pages.fixture';
import {
  PRICING_COLUMN_HEADERS,
  PRIMARY_PRICING_DROPDOWNS,
  CURRENCY_FILTER_OPTIONS,
  MULTI_ALT_PRICEBOOKS,
  PRIMARY_TEST_ROW,
  SECONDARY_TEST_ROW,
  TERTIARY_TEST_ROW,
  DEFAULT_CURRENCY_FILTER,
  DROPDOWN_PERSISTENCE_CASES,
  DATE_TEST_VALUES,
  TC033_DATE_VALUES,
  PRICING_DEFAULTS,
  MULTI_CURRENCY_OFFICE_NO,
  PRIMARY_PRICING_DROPDOWNS_CAD,
  PRIMARY_PRICING_DROPDOWNS_MXN,
  MXN_PRIMARY_PERSISTENCE_CASES,
} from '../../src/data/locations/location-pricing';
import { OFFICE_NO } from '../../src/data/common';
import { saveAndVerifyCase } from '../../src/utils/field-case-runner';

test.describe('Location Pricing @locations @pricing', () => {
 // Describe-level default timeout. The per-test baseline restore can include a save+reload cycle
 // on this heavy tab, so the budget is generous; the happy path finishes well under it.
  test.setTimeout(120_000);

  // Per-test baseline (replaces the prior ad-hoc Corporate-Pricing-only self-heal). Restores every
  // net-zero-vulnerable field — both top checkboxes and the test price-book rows — so a crashed
  // prior run or a single-test retry cannot leave the page dirty and make a test's change a no-op.
  test.beforeEach(async ({ locationPricingPage }) => {
    // Navigate only if we are not already on THIS office's Pricing tab. Encore sub-tabs share the
    // settings/location URL, so confirm both the office (URL) and the active tab (DOM presence) —
    // a sibling multi-currency test on another office can leave us on a pricing tab for the wrong
    // office, and DOM presence alone would not catch that.
    const onThisOffice = locationPricingPage.getCurrentUrl().includes(`locations/${OFFICE_NO}/`);
    if (!onThisOffice || !(await locationPricingPage.isOnPricingTab())) {
      await locationPricingPage.navigateToPricingTab(OFFICE_NO);
    }
    // Restore defaults. Fast no-op (reads only) when the page is already clean.
    await locationPricingPage.ensureDefaultState(PRICING_DEFAULTS, OFFICE_NO);
  });

  test('TC-LOC-PRI-001: Verify Pricing tab default state', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate([]);
 // The beforeEach (ensureDefaultState) has already navigated to the Pricing tab and restored the
 // baseline (both checkboxes checked, test rows clean). This test asserts that default render.
    expect(locationPricingPage.getCurrentUrl(), 'Should be on the Location Settings page').toContain(`locations/${OFFICE_NO}/settings`);
 // Poll for checkbox state — the data load applies persisted values to the DOM asynchronously.
    await expect.poll(
      async () => (await locationPricingPage.getCheckboxState('chkCorporatePricing')).checked,
      { timeout: 15_000, message: 'Corporate Pricing should be checked after data load' }
    ).toBe(true);
    await expect.poll(
      async () => (await locationPricingPage.getCheckboxState('chkPriceGuideInclusive')).checked,
      { timeout: 15_000, message: 'Include Service Fee in Price Guides should be checked after data load' }
    ).toBe(true);
    const currFilter = await locationPricingPage.getCurrencyFilterValue();
    expect(currFilter).toBe(DEFAULT_CURRENCY_FILTER);
  });

  test('TC-LOC-PRI-002: Verify Primary Pricing fields default state (5 editable dropdowns)', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-001']);
    for (const key of PRIMARY_PRICING_DROPDOWNS) {
      const enabled = await locationPricingPage.isDropdownEnabled(key);
      expect(enabled, `${key} should be enabled when Corporate Pricing is checked`).toBe(true);
    }
  });

  test('TC-LOC-PRI-003: Verify Location Secondary Pricing grid structure (7 columns)', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-001']);
    const headers = await locationPricingPage.getColumnHeaders();
    expect(headers, 'Pricing grid should display all expected columns').toEqual([...PRICING_COLUMN_HEADERS]);
    expect(await locationPricingPage.isGridRowVisible(PRIMARY_TEST_ROW)).toBe(true);
  });

  test('TC-LOC-PRI-004: Verify grid row default state', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-001']);
 // TC: Check 2021-Tier 3 Urban A and 2022-Zone 5 A rows -- both should have Is Alternative
 // unchecked with cascaded fields disabled.
    for (const row of [PRIMARY_TEST_ROW, SECONDARY_TEST_ROW]) {
      const isAlt = await locationPricingPage.getIsAlternativeState(row);
      expect(isAlt.checked, `${row} Is Alternative should be unchecked`).toBe(false);
      const useDate = await locationPricingPage.getUseEffectiveDateState(row);
      expect(useDate.disabled, `${row} Use Effective Date should be disabled`).toBe(true);
      expect(await locationPricingPage.isStartDateEnabled(row), `${row} Start Date should be disabled`).toBe(false);
      expect(await locationPricingPage.isEndDateEnabled(row), `${row} End Date should be disabled`).toBe(false);
    }
  });

  test('TC-LOC-PRI-005: Enable Use Effective Date by checking Is Alternative', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-001']);
 // TC: 2021-Tier 3 Urban A row -- check Is Alternative -> Use Effective Date becomes enabled
    const before = await locationPricingPage.getUseEffectiveDateState(PRIMARY_TEST_ROW);
    expect(before.disabled, 'Use Effective Date should start disabled').toBe(true);
    await locationPricingPage.checkIsAlternative(PRIMARY_TEST_ROW);
 // checkbox cascade is async — Use Effective Date enable propagates after React reconciliation.
    await expect.poll(
      () => locationPricingPage.getUseEffectiveDateState(PRIMARY_TEST_ROW).then(s => s.disabled),
      { timeout: 5_000, message: 'Use Effective Date should be enabled after Is Alternative checked' },
    ).toBe(false);
    await locationPricingPage.resetGridRow(PRIMARY_TEST_ROW);
  });

  test('TC-LOC-PRI-006: Use Effective Date disabled cannot be clicked when Is Alternative unchecked', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-001']);
 // TC: 2022-Zone 5 A row -- Is Alternative unchecked, Use Effective Date disabled
    const isAlt = await locationPricingPage.getIsAlternativeState(SECONDARY_TEST_ROW);
    expect(isAlt.checked).toBe(false);
    const useDate = await locationPricingPage.getUseEffectiveDateState(SECONDARY_TEST_ROW);
    expect(useDate.disabled, 'Use Effective Date should be disabled when Is Alternative unchecked').toBe(true);
 // Verify Is Alternative still unchecked (no accidental toggle)
    const isAltAfter = await locationPricingPage.getIsAlternativeState(SECONDARY_TEST_ROW);
    expect(isAltAfter.checked).toBe(false);
  });

  test('TC-LOC-PRI-007: Full cascade -- Is Alternative + Use Effective Date enables Start/End Date', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-001']);
 // TC: 2021-Tier 3 Urban A row -- full cascade enables date fields
    expect(await locationPricingPage.isStartDateEnabled(PRIMARY_TEST_ROW)).toBe(false);
    expect(await locationPricingPage.isEndDateEnabled(PRIMARY_TEST_ROW)).toBe(false);
    await locationPricingPage.checkIsAlternative(PRIMARY_TEST_ROW);
 // checkbox cascade is async — poll until Use Effective Date is enabled.
    await expect.poll(
      () => locationPricingPage.getUseEffectiveDateState(PRIMARY_TEST_ROW).then(s => s.disabled),
      { timeout: 5_000 },
    ).toBe(false);
    await locationPricingPage.checkUseEffectiveDate(PRIMARY_TEST_ROW);
 // date field enable cascades async after Use Effective Date check.
    await expect.poll(() => locationPricingPage.isStartDateEnabled(PRIMARY_TEST_ROW), { timeout: 5_000, message: 'Start Date should be enabled' }).toBe(true);
    await expect.poll(() => locationPricingPage.isEndDateEnabled(PRIMARY_TEST_ROW), { timeout: 5_000, message: 'End Date should be enabled' }).toBe(true);
    await locationPricingPage.resetGridRow(PRIMARY_TEST_ROW);
  });

  test('TC-LOC-PRI-008: Start/End Date remain disabled when Use Effective Date unchecked', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-001']);
 // TC: 2022-Zone 1 A row -- Is Alternative checked, Use Effective Date unchecked -> dates disabled
    await locationPricingPage.checkIsAlternative(TERTIARY_TEST_ROW);
 // checkbox cascade is async — poll until Use Effective Date is enabled.
    await expect.poll(
      () => locationPricingPage.getUseEffectiveDateState(TERTIARY_TEST_ROW).then(s => s.disabled),
      { timeout: 5_000 },
    ).toBe(false);
    const useDate = await locationPricingPage.getUseEffectiveDateState(TERTIARY_TEST_ROW);
    expect(useDate.checked, 'Use Effective Date should still be unchecked').toBe(false);
    expect(await locationPricingPage.isStartDateEnabled(TERTIARY_TEST_ROW)).toBe(false);
    expect(await locationPricingPage.isEndDateEnabled(TERTIARY_TEST_ROW)).toBe(false);
    await locationPricingPage.resetGridRow(TERTIARY_TEST_ROW);
  });

  test('TC-LOC-PRI-009: Uncheck Use Effective Date clears Start/End Date values', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-001']);
 // TC: 2021-Tier 3 Urban A row -- enter dates, uncheck Use Effective Date, re-check -> dates cleared
    await locationPricingPage.enableFullCascade(PRIMARY_TEST_ROW);
    await locationPricingPage.enterStartDate(PRIMARY_TEST_ROW, '03/01/2026');
    await locationPricingPage.enterEndDate(PRIMARY_TEST_ROW, '03/31/2026');
    await locationPricingPage.uncheckUseEffectiveDate(PRIMARY_TEST_ROW);
    await locationPricingPage.checkUseEffectiveDate(PRIMARY_TEST_ROW);
    const startVal = await locationPricingPage.getStartDateValue(PRIMARY_TEST_ROW);
    const endVal = await locationPricingPage.getEndDateValue(PRIMARY_TEST_ROW);
    expect(startVal, 'Start Date should be cleared after unchecking Use Effective Date').toBe('');
    expect(endVal, 'End Date should be cleared after unchecking Use Effective Date').toBe('');
    await locationPricingPage.resetGridRow(PRIMARY_TEST_ROW);
  });

  test('TC-LOC-PRI-010: Uncheck Is Alternative disables and clears all row fields', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-001']);
 // TC: 2021-Tier 3 Urban A row -- configure cascade + date, uncheck Is Alternative -> all cleared
    await locationPricingPage.enableFullCascade(PRIMARY_TEST_ROW);
    await locationPricingPage.enterStartDate(PRIMARY_TEST_ROW, '05/15/2026');
    await locationPricingPage.uncheckIsAlternative(PRIMARY_TEST_ROW);
    const useDate = await locationPricingPage.getUseEffectiveDateState(PRIMARY_TEST_ROW);
    expect(useDate.disabled, 'Use Effective Date should be disabled').toBe(true);
    expect(useDate.checked, 'Use Effective Date should be unchecked').toBe(false);
    expect(await locationPricingPage.isStartDateEnabled(PRIMARY_TEST_ROW), 'Start Date should be disabled').toBe(false);
    expect(await locationPricingPage.isEndDateEnabled(PRIMARY_TEST_ROW), 'End Date should be disabled').toBe(false);
 // reload to clear dirty form state — unchecking Is Alternative dirtied the form
 // without saving. Without reload, TC-011 may hit an "Unsaved changes" confirmation dialog.
    await locationPricingPage.reloadPricingTab(OFFICE_NO);
  });

  test('TC-LOC-PRI-011: Corporate Pricing unchecked disables all Primary pricing dropdowns', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-001']);
    const before = await locationPricingPage.verifyPrimaryDropdownStates(PRIMARY_PRICING_DROPDOWNS, true);
    expect(before.allPassed, before.failures.join('; ')).toBe(true);
    await locationPricingPage.uncheckCheckbox('chkCorporatePricing');
 // Corporate Pricing cascade to dropdowns is async — poll for first dropdown to settle.
    await expect.poll(
      () => locationPricingPage.isDropdownEnabled(PRIMARY_PRICING_DROPDOWNS[0]),
      { timeout: 5_000 },
    ).toBe(false);
    const after = await locationPricingPage.verifyPrimaryDropdownStates(PRIMARY_PRICING_DROPDOWNS, false);
    expect(after.allPassed, after.failures.join('; ')).toBe(true);
    await locationPricingPage.checkCheckbox('chkCorporatePricing');
  });

  test('TC-LOC-PRI-012: Corporate Pricing toggle does NOT disable grid fields', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-001']);
 // TC: 2021-Tier 3 Urban A row -- configure Is Alternative + Use Effective Date, uncheck Corporate Pricing
 // -> grid fields remain enabled
    await locationPricingPage.checkIsAlternative(PRIMARY_TEST_ROW);
    await locationPricingPage.checkUseEffectiveDate(PRIMARY_TEST_ROW);
    await locationPricingPage.uncheckCheckbox('chkCorporatePricing');
    const isAlt = await locationPricingPage.getIsAlternativeState(PRIMARY_TEST_ROW);
    expect(isAlt.disabled, 'Is Alternative should remain enabled').toBe(false);
    const useDate = await locationPricingPage.getUseEffectiveDateState(PRIMARY_TEST_ROW);
    expect(useDate.disabled, 'Use Effective Date should remain enabled').toBe(false);
    await locationPricingPage.checkCheckbox('chkCorporatePricing');
    await locationPricingPage.resetGridRow(PRIMARY_TEST_ROW);
  });

  test('TC-LOC-PRI-013: Re-enable Primary fields by checking Corporate Pricing', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-001']);
    await locationPricingPage.uncheckCheckbox('chkCorporatePricing');
 // Corporate Pricing cascade to dropdowns is async — poll for first dropdown to settle.
    await expect.poll(
      () => locationPricingPage.isDropdownEnabled(PRIMARY_PRICING_DROPDOWNS[0]),
      { timeout: 5_000 },
    ).toBe(false);
    const disabled = await locationPricingPage.verifyPrimaryDropdownStates(PRIMARY_PRICING_DROPDOWNS, false);
    expect(disabled.allPassed, disabled.failures.join('; ')).toBe(true);
    await locationPricingPage.checkCheckbox('chkCorporatePricing');
    const enabled = await locationPricingPage.verifyPrimaryDropdownStates(PRIMARY_PRICING_DROPDOWNS, true);
    expect(enabled.allPassed, enabled.failures.join('; ')).toBe(true);
  });

  test('TC-LOC-PRI-014: Currency filter displays "All" by default', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-001']);
    const value = await locationPricingPage.getCurrencyFilterValue();
    expect(value).toBe(DEFAULT_CURRENCY_FILTER);
  });

  test('TC-LOC-PRI-015: Currency filter dropdown has expected options', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-001']);
 // Live-verified 2026-05-08: clean office 1604 has only USD rows -> 2-option dropdown.
 // Dropdown is computed from grid rows; cross-spec pollution can transiently produce 4 options.
    const options = await locationPricingPage.getCurrencyFilterOptions();
    expect(options).toEqual([...CURRENCY_FILTER_OPTIONS]);
  });

  test('TC-LOC-PRI-016: Filter grid by selecting USD keeps USD rows visible', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-001']);
 // Live-verified 2026-05-08: office 1604 has ONLY USD rows -- selecting USD shows same count.
 // TC validates: filter applies, USD rows remain visible, reset to All restores default.
    const beforeCount = await locationPricingPage.getGridRowCount();
    await locationPricingPage.selectCurrencyFilter('USD');
    const afterCount = await locationPricingPage.getGridRowCount();
    expect(afterCount, 'Row count should be same when all rows are USD').toBe(beforeCount);
    expect(
      await locationPricingPage.isGridRowVisible(PRIMARY_TEST_ROW),
      'Primary USD row should remain visible when filtering USD',
    ).toBe(true);
 // Office 1604 carries only USD rows, so a "filter hides the non-USD rows" negative control is not
 // possible here — verified live that the filter dropdown offers only the currencies actually
 // present (no CAD/MXN option to select). This test therefore proves the USD filter keeps the USD
 // rows visible and does not wrongly drop them; the hide behaviour requires a multi-currency office.
    await locationPricingPage.selectCurrencyFilter(DEFAULT_CURRENCY_FILTER);
  });

  test('TC-LOC-PRI-017: Primary pricing dropdowns accept selections', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-001']);
    const corp = await locationPricingPage.getCheckboxState('chkCorporatePricing');
    expect(corp.checked).toBe(true);
    const enabled = await locationPricingPage.isDropdownEnabled('drpPrimaryLaborPricingUSD');
    expect(enabled, 'Primary Labor Pricing should be enabled').toBe(true);
 // Note: Specific option selection verified in TC-026. This test validates interactability.
  });

  test('TC-LOC-PRI-018: Start Date validates -- readOnly input prevents invalid date entry', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-001']);
 // TC intent: verify Start Date field validates (cannot accept invalid input).
 // Adaptation: Radix date picker input is readOnly -- only calendar selection is allowed.
    await locationPricingPage.enableFullCascade(PRIMARY_TEST_ROW);
    const isReadOnly = await locationPricingPage.isStartDateReadOnly(PRIMARY_TEST_ROW);
    expect(isReadOnly, 'Start Date input should be readOnly (prevents invalid manual entry)').toBe(true);
 // Open the Start Date popover to reveal the validation tooltip for missing date
    await locationPricingPage.openStartDatePopover(PRIMARY_TEST_ROW);
    const hasError = await locationPricingPage.hasDateValidationError();
    expect(hasError, 'Validation error should appear for missing Start Date').toBe(true);
    await locationPricingPage.closeDatePopover();
    await locationPricingPage.resetGridRow(PRIMARY_TEST_ROW);
  });

  test('TC-LOC-PRI-019: End Date validates -- readOnly input prevents invalid date entry', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-001']);
 // TC intent: verify End Date field validates (cannot accept invalid input).
 // Adaptation: Radix date picker input is readOnly -- only calendar selection is allowed.
 // PRI-018's resetGridRow may leave Is Alternative checked if Radix state drifts.
 // Ensure clean row state before enabling full cascade.
    await locationPricingPage.resetGridRow(PRIMARY_TEST_ROW);
    await locationPricingPage.enableFullCascade(PRIMARY_TEST_ROW);
    const isReadOnly = await locationPricingPage.isEndDateReadOnly(PRIMARY_TEST_ROW);
    expect(isReadOnly, 'End Date input should be readOnly (prevents invalid manual entry)').toBe(true);
    const endVal = await locationPricingPage.getEndDateValue(PRIMARY_TEST_ROW);
    expect(endVal, 'End Date should be empty before calendar selection').toBe('');
    await locationPricingPage.openEndDatePopover(PRIMARY_TEST_ROW);
    const hasError = await locationPricingPage.hasDateValidationError();
    expect(hasError, 'Validation error should appear for missing End Date').toBe(true);
    await locationPricingPage.closeDatePopover();
    await locationPricingPage.resetGridRow(PRIMARY_TEST_ROW);
  });

  test('TC-LOC-PRI-021: Multiple price books can have alternate pricing simultaneously', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-001']);
 // TC: 2021-Tier 3 Urban A, 2022-Zone 5 A, 2022-Zone 1 A -- all checked concurrently
    for (const pb of MULTI_ALT_PRICEBOOKS) {
      await locationPricingPage.checkIsAlternative(pb);
    }
    for (const pb of MULTI_ALT_PRICEBOOKS) {
      const state = await locationPricingPage.getIsAlternativeState(pb);
      expect(state.checked, `${pb} should be checked`).toBe(true);
    }
    for (const pb of MULTI_ALT_PRICEBOOKS) {
      await locationPricingPage.resetGridRow(pb);
    }
  });

  test('TC-LOC-PRI-022: Grid validates all rows -- missing date shows validation error', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-001']);
 // TC: Row 1 (2021-Tier 3 Urban A) cascade without dates -- missing required dates triggers validation.
 // Row 2 (2022-Zone 5 A) cascade with valid start date 05/01/2026.
 // Grid-level validation catches row 1's missing required dates.
    await locationPricingPage.enableFullCascade(PRIMARY_TEST_ROW);
    await locationPricingPage.enableFullCascade(SECONDARY_TEST_ROW);
    await locationPricingPage.enterStartDate(SECONDARY_TEST_ROW, '05/01/2026');
    const validStart = await locationPricingPage.getStartDateValue(SECONDARY_TEST_ROW);
    expect(validStart).toContain('05/01/2026');
    await locationPricingPage.openStartDatePopover(PRIMARY_TEST_ROW);
    const hasError = await locationPricingPage.hasDateValidationError();
    expect(hasError, 'Validation error should appear for missing dates on row 1').toBe(true);
    await locationPricingPage.closeDatePopover();
 // Row 1 start date should be empty (no calendar selection made)
    const emptyStart = await locationPricingPage.getStartDateValue(PRIMARY_TEST_ROW);
    expect(emptyStart, 'Row 1 Start Date should be empty without calendar selection').toBe('');
 // Cleanup: reset both rows (no save needed -- TC-023 uses reloadPricingTab for isolation)
    await locationPricingPage.resetGridRow(PRIMARY_TEST_ROW);
    await locationPricingPage.resetGridRow(SECONDARY_TEST_ROW);
  });


 // Re-enabled 2026-06-18: dates now persist after save+reload (verified live on office 1604).
  test('TC-LOC-PRI-020: Valid dates persist after save', async ({ locationPricingPage }) => {
    test.setTimeout(120_000);
 // TC: 2021-Tier 3 Urban A row -- enter valid dates, save, reload, verify persistence
    await locationPricingPage.reloadPricingTab(OFFICE_NO);
    await locationPricingPage.waitForPricingDataLoaded();
    await locationPricingPage.enableFullCascade(PRIMARY_TEST_ROW);
    await locationPricingPage.enterStartDate(PRIMARY_TEST_ROW, DATE_TEST_VALUES.startDate);
    await locationPricingPage.enterEndDate(PRIMARY_TEST_ROW, DATE_TEST_VALUES.endDate);
    const preSaveStart = await locationPricingPage.getStartDateValue(PRIMARY_TEST_ROW);
    const preSaveEnd = await locationPricingPage.getEndDateValue(PRIMARY_TEST_ROW);
    expect(preSaveStart, 'Start date should be set before save').toContain(DATE_TEST_VALUES.startDate);
    expect(preSaveEnd, 'End date should be set before save').toContain(DATE_TEST_VALUES.endDate);
    const saveResult = await locationPricingPage.clickSave();
    expect(saveResult.success, `Save failed: ${saveResult.networkError}`).toBe(true);
    await locationPricingPage.reloadPricingTab(OFFICE_NO);
    await locationPricingPage.waitForPricingDataLoaded();
 // Poll for grid row data — dates and checkboxes load AFTER dropdown (FIX-FLAKY: PRI-020)
    await expect.poll(
      async () => locationPricingPage.getStartDateValue(PRIMARY_TEST_ROW),
      { timeout: 15_000, message: 'Start date should persist after save+reload' }
    ).toContain(DATE_TEST_VALUES.startDate);
    const endVal = await locationPricingPage.getEndDateValue(PRIMARY_TEST_ROW);
    expect(endVal, 'End date should persist after save and reload').toContain(DATE_TEST_VALUES.endDate);
    await expect.poll(
      async () => (await locationPricingPage.getIsAlternativeState(PRIMARY_TEST_ROW)).checked,
      { timeout: 10_000, message: 'Is Alternative should be checked after save+reload' }
    ).toBe(true);
    const useDate = await locationPricingPage.getUseEffectiveDateState(PRIMARY_TEST_ROW);
    expect(useDate.checked).toBe(true);
 // Cleanup: reset the row so it doesn't persist test data
    await locationPricingPage.resetGridRow(PRIMARY_TEST_ROW);
    await locationPricingPage.clickSave();
  });

  test('TC-LOC-PRI-023: Verify Pricing tab has dedicated Save button', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-001']);
 // TC: Pricing tab has a dedicated Save button that enables when form is dirty.
 // Live-verified: the Pricing tab has its own dedicated Save button.
 // reloadPricingTab (not navigate) — forces full page reload to clear dirty state from prior serial tests
    await locationPricingPage.reloadPricingTab(OFFICE_NO);
 // M1: Save button should be DISABLED on clean page load (no pending changes)
    expect(await locationPricingPage.isSaveEnabled(), 'Save should be disabled on clean load').toBe(false);
 // Uncheck Corporate Pricing -- a top-level Angular form control that reliably enables Save
    await locationPricingPage.uncheckCheckbox('chkCorporatePricing');
    const saveEnabled = await locationPricingPage.waitForSaveEnabled();
    expect(saveEnabled, 'Save should be enabled after unchecking Corporate Pricing').toBe(true);
 // Discard changes via reload instead of saving -- saving a toggle-restore can dirty DB state
 // due to Angular form serialization timing (PRI-025 regression, ).
    await locationPricingPage.reloadPricingTab(OFFICE_NO);
  });

  test('TC-LOC-PRI-024: Include Service Fee in Price Guides -- uncheck, save, reload, verify persists; restore', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-001']);
    test.setTimeout(120_000);
    const key = 'chkPriceGuideInclusive';
    const label = 'Include Service Fee in Price Guides';
    await locationPricingPage.navigateToPricingTab(OFFICE_NO);
 // Use expect.poll — Angular applies API data to DOM async after networkidle.
    await expect.poll(
      () => locationPricingPage.getCheckboxState(key).then(s => s.checked),
      { timeout: 10_000, message: `${label} should be checked (waiting for API data)` }
    ).toBe(true);
    await locationPricingPage.uncheckCheckbox(key);
    await locationPricingPage.waitForSaveEnabled();
    const uncheckSave = await locationPricingPage.clickSave();
    expect(uncheckSave.success, `Save after unchecking ${label} failed: ${uncheckSave.networkError}`).toBe(true);
    await locationPricingPage.reloadPricingTab(OFFICE_NO);
    await expect.poll(
      () => locationPricingPage.getCheckboxState(key).then(s => s.checked),
      { timeout: 10_000, message: `${label} should remain unchecked after reload` }
    ).toBe(false);
    await locationPricingPage.checkCheckbox(key);
    await locationPricingPage.waitForSaveEnabled();
    const restoreSave = await locationPricingPage.clickSave();
    expect(restoreSave.success, `Save restoring ${label} failed: ${restoreSave.networkError}`).toBe(true);
 // M2: Save button should be DISABLED after successful save (no pending changes)
    await expect.poll(
      () => locationPricingPage.isSaveEnabled(),
      { timeout: 5_000, message: 'Save should be disabled after successful save' }
    ).toBe(false);
    await locationPricingPage.reloadPricingTab(OFFICE_NO);
    await expect.poll(
      () => locationPricingPage.getCheckboxState(key).then(s => s.checked),
      { timeout: 10_000, message: `${label} should be restored to checked` }
    ).toBe(true);
  });

 // Kept skipped (app-side bug, reproduced 2026-06-18): Corporate Pricing uncheck saves 200 but
 // reverts to checked on reload — confirmed on BOTH office 1604 and 1605 (app-wide, not data-specific).
 // See filed bug. Distinct from TC-020/TC-026..030, which now persist correctly.
  test.skip('TC-LOC-PRI-025: Corporate Pricing -- uncheck, save, reload, verify persists; restore', async ({ locationPricingPage }) => {
    test.setTimeout(120_000);
    const key = 'chkCorporatePricing';
    await locationPricingPage.navigateToPricingTab(OFFICE_NO);
    await expect.poll(
      () => locationPricingPage.getCheckboxState(key).then(s => s.checked),
      { timeout: 10_000, message: 'Corporate Pricing should be checked (waiting for API data)' }
    ).toBe(true);
    await locationPricingPage.uncheckCheckbox(key);
    await locationPricingPage.waitForSaveEnabled();
    const uncheckSave = await locationPricingPage.clickSave();
    expect(uncheckSave.success, `Save after unchecking Corporate Pricing failed: ${uncheckSave.networkError}`).toBe(true);
    await locationPricingPage.reloadPricingTab(OFFICE_NO);
    await expect.poll(
      () => locationPricingPage.getCheckboxState(key).then(s => s.checked),
      { timeout: 10_000, message: 'Corporate Pricing should remain unchecked after reload' }
    ).toBe(false);
    await locationPricingPage.checkCheckbox(key);
    await locationPricingPage.waitForSaveEnabled();
    const restoreSave = await locationPricingPage.clickSave();
    expect(restoreSave.success, `Save restoring Corporate Pricing failed: ${restoreSave.networkError}`).toBe(true);
    await locationPricingPage.reloadPricingTab(OFFICE_NO);
    await expect.poll(
      () => locationPricingPage.getCheckboxState(key).then(s => s.checked),
      { timeout: 10_000, message: 'Corporate Pricing should be restored to checked' }
    ).toBe(true);
  });

 // Re-enabled 2026-06-18: the save returns 200 and the dropdown values persist after reload
 // (verified live on office 1604, all 5 cases green). The earlier block was NOT a server 500 —
 // it was a stale option-picker selector: the search box's placeholder had changed to
 // "Search pricing strategies...", so the page object never located it. Fixed in
 // selectPrimaryDropdownOption.
  for (const { tcId, key, option, alternateOption, label } of DROPDOWN_PERSISTENCE_CASES) {
    test(`${tcId}: ${label} -- bidirectional persist (toggle pattern)`, async ({ locationPricingPage }) => {
      test.setTimeout(120_000);
 // Phase 1: Select ALTERNATE value → save → reload → verify
      await locationPricingPage.selectPrimaryDropdownOption(key, alternateOption);
      expect(await locationPricingPage.getDropdownValue(key)).toBe(alternateOption);
      const altSaveEnabled = await locationPricingPage.waitForSaveEnabled();
      expect(altSaveEnabled, `Save should be enabled after selecting alternate for ${label}`).toBe(true);
      const altSave = await locationPricingPage.clickSave();
      expect(altSave.success, `Save alternate for ${label} failed: ${altSave.networkError}`).toBe(true);
      await locationPricingPage.reloadPricingTab(OFFICE_NO);
      await expect.poll(
        () => locationPricingPage.getDropdownValue(key),
        { timeout: 15_000, message: `${label} alternate should persist after reload` }
      ).toBe(alternateOption);

 // Phase 2: Select TARGET value → save → reload → verify (restores original)
      await locationPricingPage.selectPrimaryDropdownOption(key, option);
      expect(await locationPricingPage.getDropdownValue(key)).toBe(option);
      const targetSaveEnabled = await locationPricingPage.waitForSaveEnabled();
      expect(targetSaveEnabled, `Save should be enabled after selecting target for ${label}`).toBe(true);
      const targetSave = await locationPricingPage.clickSave();
      expect(targetSave.success, `Save target for ${label} failed: ${targetSave.networkError}`).toBe(true);
      await locationPricingPage.reloadPricingTab(OFFICE_NO);
      await expect.poll(
        () => locationPricingPage.getDropdownValue(key),
        { timeout: 15_000, message: `${label} target should persist after reload` }
      ).toBe(option);
    });
  }


  test('TC-LOC-PRI-031: Save dialog Cancel -- edit, Save, Cancel, form stays dirty, no data saved', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-001']);
    test.setTimeout(90_000);
    await locationPricingPage.checkIsAlternative(PRIMARY_TEST_ROW);
    const saveEnabled = await locationPricingPage.waitForSaveEnabled();
    expect(saveEnabled, 'Save should be enabled after checking Is Alternative').toBe(true);
    await locationPricingPage.clickSaveButton();
    expect(await locationPricingPage.isSaveDialogVisible(), 'Save dialog should be visible').toBe(true);
    await locationPricingPage.clickSaveCancel();
    expect(await locationPricingPage.isSaveDialogVisible(), 'Save dialog should be dismissed').toBe(false);
 // Form should still be dirty — Save still enabled
    expect(await locationPricingPage.isSaveEnabled(), 'Save should remain enabled after Cancel').toBe(true);
 // Reload without saving to verify data was NOT persisted
    await locationPricingPage.reloadPricingTab(OFFICE_NO);
    await expect.poll(
      async () => (await locationPricingPage.getIsAlternativeState(PRIMARY_TEST_ROW)).checked,
      { timeout: 10_000, message: 'Is Alternative should be unchecked (Cancel should not save data)' }
    ).toBe(false);
  });

  test('TC-LOC-PRI-032: Unsaved changes dialog -- edit, navigate away, Stay returns to form', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-001']);
    test.setTimeout(90_000);
    await locationPricingPage.navigateToPricingTab(OFFICE_NO);
    await locationPricingPage.uncheckCheckbox('chkCorporatePricing');
    await locationPricingPage.waitForSaveEnabled();
 // Navigate away via sidebar → triggers app-level unsaved dialog
    await locationPricingPage.clickSidebarHome();
    expect(await locationPricingPage.isUnsavedDialogVisible(), 'Unsaved changes dialog should appear').toBe(true);
 // Click Stay → should return to Pricing tab with form still dirty
    await locationPricingPage.clickUnsavedStay();
 // Verify we're still on the pricing page (gap analysis: guard against Stay not working)
    expect(locationPricingPage.getCurrentUrl()).toContain(`locations/${OFFICE_NO}/settings`);
    expect(await locationPricingPage.isSaveEnabled(), 'Save should still be enabled after Stay').toBe(true);
 // Restore: re-check Corporate Pricing and reload to discard
    await locationPricingPage.checkCheckbox('chkCorporatePricing');
    await locationPricingPage.reloadPricingTab(OFFICE_NO);
  });


  test('TC-LOC-PRI-033: Grid validation errors block Save -- missing dates with cascade enabled', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-001']);
    test.setTimeout(90_000);
 // Clean slate: reload to clear any dirty state from prior tests
    await locationPricingPage.reloadPricingTab(OFFICE_NO);
    expect(await locationPricingPage.isSaveEnabled(), 'Save should be disabled on clean load').toBe(false);
 // Enable full cascade WITHOUT entering dates — required date fields left empty = validation error
    await locationPricingPage.checkIsAlternative(PRIMARY_TEST_ROW);
    await expect.poll(
      () => locationPricingPage.getUseEffectiveDateState(PRIMARY_TEST_ROW).then(s => s.disabled),
      { timeout: 5_000 },
    ).toBe(false);
    await locationPricingPage.checkUseEffectiveDate(PRIMARY_TEST_ROW);
    await expect.poll(
      () => locationPricingPage.isStartDateEnabled(PRIMARY_TEST_ROW),
      { timeout: 5_000 },
    ).toBe(true);
    const saveAfterCascade = await locationPricingPage.waitForSaveEnabled('btnSavePricing', 3_000);
    expect(saveAfterCascade, 'Save should be DISABLED when dates empty').toBe(false);
    await locationPricingPage.enterStartDate(PRIMARY_TEST_ROW, TC033_DATE_VALUES.startDate);
    await locationPricingPage.enterEndDate(PRIMARY_TEST_ROW, TC033_DATE_VALUES.endDate);
 // After valid dates, Save should be enabled (dirty + no validation errors)
    const saveAfterDates = await locationPricingPage.waitForSaveEnabled('btnSavePricing', 5_000);
    expect(saveAfterDates, 'Save should be enabled after entering valid dates with dirty form').toBe(true);
    await locationPricingPage.resetGridRow(PRIMARY_TEST_ROW);
    await locationPricingPage.reloadPricingTab(OFFICE_NO);
  });

  test('TC-LOC-PRI-035: Verify read-only columns have no interactive elements', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-001']);
 // Columns 1-3 in the grid are display-only. Verify no button/checkbox/input exists in those cells.
    const interactiveCount = await locationPricingPage.getReadOnlyColumnInteractiveCount(PRIMARY_TEST_ROW);
    expect(interactiveCount, 'Read-only columns should have no interactive elements').toBe(0);
  });

});

// Office 1604 (the suite above) is single-currency — only the five USD primary dropdowns render.
// Office 1605 is multi-currency: it renders all fifteen primary pricing dropdowns (5 USD + 5 CAD +
// 5 MXN). These cases cover the per-currency dropdowns that exist only on a multi-currency office.
// They live in their own describe because they run against a different office, so they need their
// own navigation and baseline rather than the office-1604 beforeEach above.
test.describe('Location Pricing — Multi-currency (office 1605) @locations @pricing', () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ locationPricingPage }) => {
    const onThisOffice = locationPricingPage.getCurrentUrl().includes(`locations/${MULTI_CURRENCY_OFFICE_NO}/`);
    if (!onThisOffice || !(await locationPricingPage.isOnPricingTab())) {
      await locationPricingPage.navigateToPricingTab(MULTI_CURRENCY_OFFICE_NO);
    }
    // Corporate Pricing must be checked for the primary dropdowns to be enabled.
    const corp = await locationPricingPage.getCheckboxState('chkCorporatePricing');
    if (!corp.checked) {
      await locationPricingPage.checkCheckbox('chkCorporatePricing');
      await locationPricingPage.saveAndConfirm();
      await locationPricingPage.reloadPricingTab(MULTI_CURRENCY_OFFICE_NO);
    }
  });

  test('TC-LOC-PRI-036: All per-currency primary pricing dropdowns render and are enabled', async ({ locationPricingPage }) => {
    // Every USD, CAD, and MXN primary pricing dropdown should render and be enabled when Corporate
    // Pricing is checked on a multi-currency office.
    const allDropdowns = [
      ...PRIMARY_PRICING_DROPDOWNS,
      ...PRIMARY_PRICING_DROPDOWNS_CAD,
      ...PRIMARY_PRICING_DROPDOWNS_MXN,
    ];
    for (const key of allDropdowns) {
      const enabled = await locationPricingPage.isDropdownEnabled(key);
      expect(enabled, `${key} should render and be enabled when Corporate Pricing is checked`).toBe(true);
    }
  });

  // Per-currency persistence: each MXN dropdown that carries pricing strategies starts unset, so
  // selecting a value is always a real change. Select → save → reload → confirm it persisted, then
  // restore the dropdown to unset so the office is left clean for the next run.
  for (const { tcId, key, option, label } of MXN_PRIMARY_PERSISTENCE_CASES) {
    test(`${tcId}: ${label} -- select, save, persists after reload`, async ({ locationPricingPage }) => {
      await saveAndVerifyCase({
        id: tcId,
        label,
        baseline: () => locationPricingPage.clearPrimaryDropdown(key),
        act: () => locationPricingPage.selectPrimaryDropdownOption(key, option),
        expectBeforeSave: async () => {
          expect(await locationPricingPage.getDropdownValue(key)).toBe(option);
          expect(
            await locationPricingPage.waitForSaveEnabled(),
            `Save should enable after selecting ${label}`,
          ).toBe(true);
        },
        saveAndConfirm: () => locationPricingPage.saveAndConfirm(),
        reload: () => locationPricingPage.reloadPricingTab(MULTI_CURRENCY_OFFICE_NO),
        expectAfterReload: async () => {
          await expect.poll(
            () => locationPricingPage.getDropdownValue(key),
            { timeout: 15_000, message: `${label} should persist after save+reload` },
          ).toBe(option);
        },
        cleanup: async () => {
          await locationPricingPage.clearPrimaryDropdown(key);
          if (await locationPricingPage.isSaveEnabled()) {
            await locationPricingPage.saveAndConfirm();
          }
        },
      });
    });
  }
});
