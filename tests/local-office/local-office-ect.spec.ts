import { test, expect } from '../../src/fixtures/pages.fixture';
import {
  ECT_PAGE, ECT_SECTIONS, BENEFITS_MULTIPLIER, HISTORICAL_SUBRENTAL,
  LABOR_COST_RT_ROWS, LABOR_COST_TEST,
} from '../../src/data/local-office/local-office-ect';
import { OFFICE_NO } from '../../src/data/common';

// A 20+ digit numeric string used to probe the documented "accepted with possible precision loss,
// but never a crash/NaN/frozen UI" edge case (plan sections 2.1/2.2 step 6 and 7.3).
const LONG_NUMERIC_INPUT = '99999999999999999999';

// Mirrors the app's own percentage formatting (typed decimal x100, one decimal place, "%" suffix)
// so alt test values (not already covered by a data-file *Display constant) can be asserted precisely.
function pctDisplay(raw: string): string {
  return `${(parseFloat(raw) * 100).toFixed(1)}%`;
}

test.describe('Local Office ECT Settings @local-office @ect-settings', () => {
  // Nav guard uses DOM presence (aria-selected), not url.includes — sub-tabs share the
  // `settings/local-office` URL. 60s hook budget: cold-start nav (SSO handoff + Angular load +
  // hydrate + the ECT tab's own load-flakiness retry) regularly exceeds the 30s default.
  test.beforeEach(async ({ localOfficeEctPage }) => {
    test.setTimeout(60_000);
    if (!(await localOfficeEctPage.isOnEctTab())) {
      await localOfficeEctPage.navigateToBasicInfoTab(OFFICE_NO);
      await localOfficeEctPage.navigateToEctTab();
    }
  });

  test('TC-LOE-ECT-001: ECT Settings tab loads with all four sections and expected header', { tag: '@C105409' }, async ({ localOfficeEctPage: pg, dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(60_000);
    // Fresh load through the tab's own retry-on-load-flakiness logic — this also folds in plan
    // 7.4 (the intermittent "No data available" / "No currencies" empty-state retry behavior):
    // navigateToEctTab() retries internally, and the assertions below confirm the tables end up
    // populated, which is the observable contract worth asserting.
    await pg.reloadAndNavigateToEct(OFFICE_NO);

    expect(await pg.isOnEctTab()).toBe(true);
    expect(await pg.getTextContent('lblEctLocationName')).toBe(ECT_PAGE.locationDisplay);
    expect(await pg.isElementVisible('lnkCommissionStructure')).toBe(true);
    expect(await pg.getComboboxValue('drpCurrency')).toBe(ECT_PAGE.currency);
    expect(await pg.getTextContent('secEctHeaderInner')).toContain('Edit/View');

    // Event Profit Target
    expect(await pg.getTextContent('lblEventProfitTarget')).toBe(ECT_SECTIONS.eventProfitTarget);
    expect(await pg.getTableColumnHeaders('tblEventProfitTarget')).toEqual(['Lower Limit', 'Upper Limit', 'Target', 'Currency']);
    expect(await pg.getEventProfitTargetRowCount()).toBeGreaterThan(0);

    // Fixed Costs panel — display-only fields
    const fixedCostsDisplayFields = [
      'fldVenueFixedCosts', 'fldSgaPercent', 'fldOtherRate', 'fldNoLabourRate',
      'fldApprovalThreshold', 'fldPeakLaborAdjustment', 'fldNonPeakLaborAdjustment',
    ];
    for (const field of fixedCostsDisplayFields) {
      expect(await pg.getEctFieldValue(field), `${field} should be non-blank`).not.toBe('');
    }
    // Editable fields
    expect(await pg.getInputValue('txtBenefitsMultiplier')).not.toBe('');
    expect(await pg.getInputValue('txtHistoricalSubrental')).not.toBe('');
    expect(await pg.isEctFixedCostsSaveEnabled()).toBe(false);
    expect(await pg.getFixedCostsDescriptionParagraphCount()).toBeGreaterThanOrEqual(3);

    // Labor Cost Assumptions
    expect(await pg.getTextContent('lblLaborCostAssumptions')).toBe(ECT_SECTIONS.laborCostAssumptions);
    expect(await pg.isEctLaborCostsSaveEnabled()).toBe(false);
    expect(await pg.getTableColumnHeaders('tblLaborCostAssumptions')).toEqual(['Labor Class', 'Labor Cost']);
    expect(await pg.getLaborCostRowCount()).toBeGreaterThan(1);

    // SubRental Matrix
    expect(await pg.getTextContent('lblSubRentalMatrix')).toBe(ECT_SECTIONS.subRentalMatrix);
    expect(await pg.getTableColumnHeaders('tblSubRentalMatrix')).toEqual(['Lower Limit', 'Upper Limit', 'Subrental Percentage', 'Currency']);
    expect(await pg.getSubRentalMatrixRowCount()).toBeGreaterThan(0);
  });

  test('TC-LOE-ECT-002: Event Profit Target and SubRental Matrix tables are fully read-only; Labor Class column is read-only', { tag: '@C105410' }, async ({ localOfficeEctPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-ECT-001']);
    expect(await pg.isEventProfitTargetReadOnly()).toBe(true);
    await pg.attemptEditEventProfitTargetCell();
    expect(await pg.isEventProfitTargetReadOnly()).toBe(true);

    expect(await pg.isSubRentalReadOnly()).toBe(true);
    await pg.attemptEditSubRentalMatrixCell();
    expect(await pg.isSubRentalReadOnly()).toBe(true);

    // Only the Labor Cost column (not Labor Class) is editable in the Labor Cost Assumptions grid.
    expect(await pg.isLaborClassReadOnly()).toBe(true);
    expect(await pg.isLaborCostEditable()).toBe(true);
  });

  test('TC-LOE-ECT-003: Benefits Multiplier required-field rejection when cleared', { tag: '@C105411' }, async ({ localOfficeEctPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-ECT-001']);
    expect(await pg.getEctFieldValue('txtBenefitsMultiplier')).toBe(BENEFITS_MULTIPLIER.defaultDisplay);

    await pg.clearAndTab('txtBenefitsMultiplier');
    expect(await pg.getInputValue('txtBenefitsMultiplier')).toBe('');
    expect(await pg.expectInvalid('txtBenefitsMultiplier')).toBe(true);
    expect(await pg.isEctFixedCostsSaveEnabled()).toBe(false);

    // Nothing was saved — a fresh re-navigate is sufficient to reset the form for the next test.
    await pg.reloadAndNavigateToEct(OFFICE_NO);
    expect(await pg.getEctFieldValue('txtBenefitsMultiplier')).toBe(BENEFITS_MULTIPLIER.defaultDisplay);
  });

  test('TC-LOE-ECT-004: Benefits Multiplier rejects non-numeric and negative input; an extremely long numeric input does not crash the UI', { tag: '@C105412' }, async ({ localOfficeEctPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-ECT-001']);
    // Confirmed live: unlike clearing the field (TC-003), typing a non-numeric value is rejected
    // as a whole on blur — the field silently reverts to its last valid formatted value (no
    // blank/invalid state, no destructive styling) rather than staying blank+invalid.
    await pg.fillAndTab('txtBenefitsMultiplier', 'abc');
    expect(await pg.getInputValue('txtBenefitsMultiplier')).toBe(BENEFITS_MULTIPLIER.defaultDisplay);
    expect(await pg.expectValid('txtBenefitsMultiplier')).toBe(true);
    expect(await pg.isEctFixedCostsSaveEnabled()).toBe(false);

    // Negative values are likewise rejected as a whole and revert to the last valid value —
    // confirmed live this is NOT "sign stripped to absolute value"; it behaves exactly like the
    // non-numeric case above.
    await pg.fillAndTab('txtBenefitsMultiplier', '-5');
    expect(await pg.getInputValue('txtBenefitsMultiplier')).toBe(BENEFITS_MULTIPLIER.defaultDisplay);
    expect(await pg.expectValid('txtBenefitsMultiplier')).toBe(true);
    expect(await pg.isEctFixedCostsSaveEnabled()).toBe(false);

    // Plan 7.3 edge case: a 20+ digit numeric string must not crash or freeze the UI. The live
    // E2E app accepted this on this field family with floating-point precision loss in the
    // display — any similarly-lossy-but-rendered outcome is fine; only NaN/blank/frozen is a failure.
    await pg.fillAndTab('txtBenefitsMultiplier', LONG_NUMERIC_INPUT);
    const longValueDisplay = await pg.getEctFieldValue('txtBenefitsMultiplier');
    expect(longValueDisplay).not.toBe('');
    expect(longValueDisplay.toUpperCase()).not.toContain('NAN');

    // Discard everything from this test — nothing was ever saved.
    await pg.reloadAndNavigateToEct(OFFICE_NO);
    expect(await pg.getEctFieldValue('txtBenefitsMultiplier')).toBe(BENEFITS_MULTIPLIER.defaultDisplay);
  });

  test('TC-LOE-ECT-005: Benefits Multiplier accepts a valid decimal, and unsaved edits are fully discarded via tab-switch (Stay/Discard) and via a hard reload', { tag: '@C105413' }, async ({ localOfficeEctPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-ECT-001']);
    test.setTimeout(120_000);

    await pg.fillAndTab('txtBenefitsMultiplier', BENEFITS_MULTIPLIER.testInput);
    expect(await pg.expectValid('txtBenefitsMultiplier')).toBe(true);
    expect(await pg.getEctFieldValue('txtBenefitsMultiplier')).toBe(BENEFITS_MULTIPLIER.expectedAfterSave);
    expect(await pg.isEctFixedCostsSaveEnabled()).toBe(true);

    // Raw edit-mode value: percentage formatting is display-only, applied on blur.
    await pg.focusField('txtBenefitsMultiplier');
    expect(await pg.getInputValue('txtBenefitsMultiplier')).toBe(BENEFITS_MULTIPLIER.testInput);
    await pg.blurActiveField();

    // Plan 7.1 — rapid tab-away with unsaved changes: Stay keeps the edit and the ECT tab active.
    await pg.clickTabDirect('tabHistory');
    await expect(pg.getUnsavedChangesDialog()).toBeVisible();
    await pg.clickUnsavedStay();
    await expect.poll(() => pg.isOnEctTab(), { timeout: 5_000 }).toBe(true);
    expect(await pg.getEctFieldValue('txtBenefitsMultiplier')).toBe(BENEFITS_MULTIPLIER.expectedAfterSave);
    expect(await pg.isEctFixedCostsSaveEnabled()).toBe(true);

    // Discard via a different tab this time — fully reverts the pending edit.
    await pg.clickTabDirect('tabBasicInformation');
    await expect(pg.getUnsavedChangesDialog()).toBeVisible();
    await pg.clickUnsavedDiscard();
    await expect.poll(() => pg.isTabSelected('tabBasicInformation'), { timeout: 10_000 }).toBe(true);

    await pg.navigateToEctTab();
    expect(await pg.getEctFieldValue('txtBenefitsMultiplier')).toBe(BENEFITS_MULTIPLIER.defaultDisplay);
    expect(await pg.isEctFixedCostsSaveEnabled()).toBe(false);

    // Plan 7.2 — a hard reload with unsaved edits triggers the NATIVE beforeunload dialog
    // (distinct from the app's custom "Unsaved changes" Radix dialog exercised above).
    await pg.fillAndTab('txtBenefitsMultiplier', BENEFITS_MULTIPLIER.altTestValue);
    expect(await pg.isEctFixedCostsSaveEnabled()).toBe(true);
    const sawNativeDialog = await pg.hardReloadExpectingBeforeunload();
    expect(sawNativeDialog).toBe(true);

    // The reload lands on the default tab (Basic Information), not ECT — tab selection is not
    // preserved across a hard reload, and the unsaved edit is discarded by the reload itself.
    await pg.waitForBasicInfoForm();
    await pg.navigateToEctTab();
    expect(await pg.getEctFieldValue('txtBenefitsMultiplier')).toBe(BENEFITS_MULTIPLIER.defaultDisplay);
    expect(await pg.isEctFixedCostsSaveEnabled()).toBe(false);
  });

  test('TC-LOE-ECT-006: Historical Subrental % required-field rejection when cleared', { tag: '@C105414' }, async ({ localOfficeEctPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-ECT-001']);
    expect(await pg.getEctFieldValue('txtHistoricalSubrental')).toBe(HISTORICAL_SUBRENTAL.defaultDisplay);

    await pg.clearAndTab('txtHistoricalSubrental');
    expect(await pg.getInputValue('txtHistoricalSubrental')).toBe('');
    expect(await pg.expectInvalid('txtHistoricalSubrental')).toBe(true);
    expect(await pg.isEctFixedCostsSaveEnabled()).toBe(false);

    await pg.reloadAndNavigateToEct(OFFICE_NO);
    expect(await pg.getEctFieldValue('txtHistoricalSubrental')).toBe(HISTORICAL_SUBRENTAL.defaultDisplay);
  });

  test('TC-LOE-ECT-007: Historical Subrental % rejects non-numeric and negative input', { tag: '@C105415' }, async ({ localOfficeEctPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-ECT-001']);
    // Confirmed live: same as Benefits Multiplier (TC-004) — a non-numeric value is rejected as a
    // whole on blur and the field reverts to its last valid formatted value, not blank+invalid.
    await pg.fillAndTab('txtHistoricalSubrental', 'abc');
    expect(await pg.getInputValue('txtHistoricalSubrental')).toBe(HISTORICAL_SUBRENTAL.defaultDisplay);
    expect(await pg.expectValid('txtHistoricalSubrental')).toBe(true);
    expect(await pg.isEctFixedCostsSaveEnabled()).toBe(false);

    // Negative rejected, not treated as positive — matches Benefits Multiplier's behavior: reverts
    // to the last valid value rather than stripping the sign.
    await pg.fillAndTab('txtHistoricalSubrental', '-1');
    expect(await pg.getInputValue('txtHistoricalSubrental')).toBe(HISTORICAL_SUBRENTAL.defaultDisplay);
    expect(await pg.expectValid('txtHistoricalSubrental')).toBe(true);
    expect(await pg.isEctFixedCostsSaveEnabled()).toBe(false);

    await pg.reloadAndNavigateToEct(OFFICE_NO);
    expect(await pg.getEctFieldValue('txtHistoricalSubrental')).toBe(HISTORICAL_SUBRENTAL.defaultDisplay);
  });

  test('TC-LOE-ECT-008: Historical Subrental % accepts a valid decimal and an extremely long numeric value without crashing; unsaved edit is discarded', { tag: '@C105416' }, async ({ localOfficeEctPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-ECT-001']);
    await pg.fillAndTab('txtHistoricalSubrental', HISTORICAL_SUBRENTAL.testValue);
    expect(await pg.expectValid('txtHistoricalSubrental')).toBe(true);
    expect(await pg.getEctFieldValue('txtHistoricalSubrental')).toBe(HISTORICAL_SUBRENTAL.expectedAfterSave);
    expect(await pg.isEctFixedCostsSaveEnabled()).toBe(true);

    // Plan 2.2 step 6 / 7.3 — document actual behavior for a 20+ digit numeric string: accepted
    // with possible floating-point precision loss is fine; a NaN/blank/frozen UI is a failure.
    await pg.fillAndTab('txtHistoricalSubrental', LONG_NUMERIC_INPUT);
    const longValueDisplay = await pg.getEctFieldValue('txtHistoricalSubrental');
    expect(longValueDisplay).not.toBe('');
    expect(longValueDisplay.toUpperCase()).not.toContain('NAN');

    await pg.clickTabDirect('tabBasicInformation');
    await pg.clickUnsavedDiscard();
    await pg.navigateToEctTab();
    expect(await pg.getEctFieldValue('txtHistoricalSubrental')).toBe(HISTORICAL_SUBRENTAL.defaultDisplay);
    expect(await pg.isEctFixedCostsSaveEnabled()).toBe(false);
  });

  test('TC-LOE-ECT-009: Editing Benefits Multiplier enables only the Fixed Costs Save button, never Labor Cost Assumptions Save, and the saved value persists after restore', { tag: '@C105417' }, async ({ localOfficeEctPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-ECT-001']);
    test.setTimeout(120_000);
    expect(await pg.isEctFixedCostsSaveEnabled()).toBe(false);
    expect(await pg.isEctLaborCostsSaveEnabled()).toBe(false);

    await pg.fillAndTab('txtBenefitsMultiplier', BENEFITS_MULTIPLIER.altTestValue);
    expect(await pg.isEctFixedCostsSaveEnabled()).toBe(true);
    expect(await pg.isEctLaborCostsSaveEnabled()).toBe(false);

    await pg.saveFixedCostsFieldAndVerifyPersisted(
      'txtBenefitsMultiplier',
      BENEFITS_MULTIPLIER.altTestValue,
      pctDisplay(BENEFITS_MULTIPLIER.altTestValue),
      BENEFITS_MULTIPLIER.restoreValue,
      BENEFITS_MULTIPLIER.defaultDisplay,
      OFFICE_NO,
    );
    expect(await pg.isEctFixedCostsSaveEnabled()).toBe(false);
    expect(await pg.isEctLaborCostsSaveEnabled()).toBe(false);
  });

  test('TC-LOE-ECT-010: Editing a Labor Cost rate enables its Save button independently of Fixed Costs Save, and the change persists after reload', { tag: '@C105418' }, async ({ localOfficeEctPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-ECT-001']);
    test.setTimeout(120_000);
    expect(await pg.getFirstLaborClassName()).toBe(LABOR_COST_TEST.firstClass);
    const original = await pg.getLaborCostValue(0);
    expect(original).toBe(LABOR_COST_TEST.currentValue);

    expect(await pg.isEctFixedCostsSaveEnabled()).toBe(false);
    expect(await pg.isEctLaborCostsSaveEnabled()).toBe(false);

    await pg.fillLaborCost(0, LABOR_COST_TEST.testValue);
    expect(await pg.getLaborCostValue(0)).toBe('42.00');
    expect(await pg.isEctLaborCostsSaveEnabled()).toBe(true);
    expect(await pg.isEctFixedCostsSaveEnabled()).toBe(false); // independence confirmed

    await pg.clickSaveLaborCosts();
    expect(await pg.isEctLaborCostsSaveEnabled()).toBe(false);

    await pg.reloadAndNavigateToEct(OFFICE_NO);
    expect(await pg.getLaborCostValue(0)).toBe('42.00');

    // Restore to the value CAPTURED at the start of this test (never a hardcoded constant) so
    // office 1604 is left exactly as found, regardless of what its real value happened to be.
    await pg.fillLaborCost(0, original);
    await pg.clickSaveLaborCosts();
    await pg.reloadAndNavigateToEct(OFFICE_NO);
    expect(await pg.getLaborCostValue(0)).toBe(original);
  });

  test('TC-LOE-ECT-011: Only the edited Labor Cost row is affected by Save; untouched rows are unaffected', { tag: '@C105419' }, async ({ localOfficeEctPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-ECT-001']);
    test.setTimeout(120_000);
    const rowA = 0;
    const rowB = LABOR_COST_RT_ROWS[0].rowIndex; // "Middle row" — left untouched throughout
    const originalA = await pg.getLaborCostValue(rowA);
    const originalB = await pg.getLaborCostValue(rowB);
    expect(await pg.isEctLaborCostsSaveEnabled()).toBe(false);

    await pg.fillLaborCost(rowA, LABOR_COST_TEST.testValue);
    expect(await pg.getLaborCostValue(rowA)).toBe('42.00');
    expect(await pg.getLaborCostValue(rowB)).toBe(originalB);
    expect(await pg.isEctLaborCostsSaveEnabled()).toBe(true);

    await pg.clickSaveLaborCosts();
    await pg.reloadAndNavigateToEct(OFFICE_NO);
    expect(await pg.getLaborCostValue(rowA)).toBe('42.00');
    expect(await pg.getLaborCostValue(rowB), 'untouched row must not be affected by saving a different row').toBe(originalB);

    // Restore Row A to the value CAPTURED at the start of this test (never a hardcoded constant)
    // so office 1604 is left exactly as found.
    await pg.fillLaborCost(rowA, originalA);
    await pg.clickSaveLaborCosts();
    await pg.reloadAndNavigateToEct(OFFICE_NO);
    expect(await pg.getLaborCostValue(rowA)).toBe(originalA);
  });

  test('TC-LOE-ECT-012: Labor Cost rate editor reverts non-numeric and negative input, rounds to 2 decimals, does not revert on Escape, and does not crash on a very long numeric value', { tag: '@C105420' }, async ({ localOfficeEctPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-ECT-001']);
    test.setTimeout(120_000);
    const rowIndex = 0;
    const original = await pg.getLaborCostValue(rowIndex);
    expect(original).toBe(LABOR_COST_TEST.currentValue);

    // Non-numeric text is silently rejected — the cell reverts to its last valid value on blur
    // (no red/invalid indicator, unlike Benefits Multiplier / Historical Subrental).
    await pg.fillLaborCost(rowIndex, LABOR_COST_TEST.invalidInput);
    expect(await pg.getLaborCostValue(rowIndex)).toBe(original);

    // Negative input: confirmed live this is rejected as a whole and reverts to the last valid
    // value — the SAME behavior as the Fixed Costs percentage fields (see TC-004/TC-007), not the
    // "sign stripped to absolute value" originally assumed. (A prior version of this automation
    // typed "-20" via Ctrl+A + keyboard.type(); that path exposed an unrelated selection-collapse
    // quirk in this cell's keydown filter that corrupted the value to "4120.00" — fillLaborCost now
    // uses locator.fill(), which applies the value as a single atomic replace and reveals the
    // field's real whole-value validation: the entire "-20" is rejected, same as non-numeric text.)
    await pg.fillLaborCost(rowIndex, '-20');
    expect(await pg.getLaborCostValue(rowIndex)).toBe(original);

    // Rounds to 2 decimal places on blur.
    await pg.fillLaborCost(rowIndex, '42.999');
    expect(await pg.getLaborCostValue(rowIndex)).toBe('43.00');

    // Plan 7.3 — a very long numeric string must not crash or freeze the grid.
    await pg.fillLaborCost(rowIndex, LONG_NUMERIC_INPUT);
    const longValueDisplay = await pg.getLaborCostValue(rowIndex);
    expect(longValueDisplay).not.toBe('');
    expect(longValueDisplay.toUpperCase()).not.toContain('NAN');
    expect(await pg.isLaborCostEditable()).toBe(true); // grid remains interactive afterward

    // Escape while mid-edit does NOT revert here (unlike the Section/Room Escape-to-cancel
    // pattern on Basic Information) — the typed value remains and the row stays dirty.
    const escapedValue = await pg.escapeLaborCostMidEdit(rowIndex, '77.77');
    expect(escapedValue).toBe('77.77');
    expect(await pg.isEctLaborCostsSaveEnabled()).toBe(true);

    // Discard everything from this test via the Unsaved Changes dialog — nothing was ever saved.
    await pg.clickTabDirect('tabBasicInformation');
    await pg.clickUnsavedDiscard();
    await pg.navigateToEctTab();
    expect(await pg.getLaborCostValue(rowIndex)).toBe(original);
    expect(await pg.isEctLaborCostsSaveEnabled()).toBe(false);
  });

  test('TC-LOE-ECT-013: Labor Cost Assumptions has only a Save action (no inline Cancel); unsaved edits are discarded via the Unsaved Changes Stay/Discard dialog', { tag: '@C105421' }, async ({ localOfficeEctPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-ECT-001']);
    test.setTimeout(120_000);
    expect(await pg.getLaborCostActionButtonCount()).toBe(1);

    const rowA = 0;
    const rowB = LABOR_COST_RT_ROWS[0].rowIndex;
    const originalA = await pg.getLaborCostValue(rowA);
    const originalB = await pg.getLaborCostValue(rowB);

    await pg.fillLaborCost(rowA, LABOR_COST_TEST.testValue);
    await pg.fillLaborCost(rowB, '15');
    expect(await pg.isEctLaborCostsSaveEnabled()).toBe(true);

    await pg.clickTabDirect('tabHistory');
    await expect(pg.getUnsavedChangesDialog()).toBeVisible();
    await pg.clickUnsavedStay();
    await expect.poll(() => pg.isOnEctTab(), { timeout: 5_000 }).toBe(true);
    expect(await pg.getLaborCostValue(rowA)).toBe('42.00');
    expect(await pg.getLaborCostValue(rowB)).toBe('15.00');
    expect(await pg.isEctLaborCostsSaveEnabled()).toBe(true);

    await pg.clickTabDirect('tabHistory');
    await expect(pg.getUnsavedChangesDialog()).toBeVisible();
    await pg.clickUnsavedDiscard();
    await expect.poll(() => pg.isTabSelected('tabHistory'), { timeout: 10_000 }).toBe(true);

    await pg.navigateToEctTab();
    expect(await pg.getLaborCostValue(rowA)).toBe(originalA);
    expect(await pg.getLaborCostValue(rowB)).toBe(originalB);
    expect(await pg.isEctLaborCostsSaveEnabled()).toBe(false);
  });

  test('TC-LOE-ECT-014: Fixed Costs Save and Labor Cost Assumptions Save operate independently in both directions, and both persist after restore', { tag: '@C105422' }, async ({ localOfficeEctPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-ECT-001']);
    test.setTimeout(150_000);
    expect(await pg.isEctFixedCostsSaveEnabled()).toBe(false);
    expect(await pg.isEctLaborCostsSaveEnabled()).toBe(false);

    // Capture the true originals up front — restores below write these back, never a hardcoded
    // constant, so office 1604 ends up exactly as found regardless of its real starting values.
    const originalHistorical = await pg.getEctFieldValue('txtHistoricalSubrental');
    const originalLabor = await pg.getLaborCostValue(0);

    // Edit Historical Subrental only.
    await pg.fillAndTab('txtHistoricalSubrental', HISTORICAL_SUBRENTAL.testValue);
    expect(await pg.isEctFixedCostsSaveEnabled()).toBe(true);
    expect(await pg.isEctLaborCostsSaveEnabled()).toBe(false);
    await pg.clickSaveFixedCosts();
    expect(await pg.isEctFixedCostsSaveEnabled()).toBe(false);
    expect(await pg.isEctLaborCostsSaveEnabled()).toBe(false); // unaffected by the Fixed Costs save

    // Now edit a Labor Cost row only (Fixed Costs section already pristine from the prior step).
    await pg.fillLaborCost(0, LABOR_COST_TEST.testValue);
    expect(await pg.isEctLaborCostsSaveEnabled()).toBe(true);
    expect(await pg.isEctFixedCostsSaveEnabled()).toBe(false);
    await pg.clickSaveLaborCosts();
    expect(await pg.isEctLaborCostsSaveEnabled()).toBe(false);
    expect(await pg.isEctFixedCostsSaveEnabled()).toBe(false); // unaffected by the Labor Cost save

    // Verify both changes actually persisted, then restore both to leave office 1604 clean —
    // restoring to the values CAPTURED at the start of this test, never a hardcoded constant.
    await pg.reloadAndNavigateToEct(OFFICE_NO);
    expect(await pg.getEctFieldValue('txtHistoricalSubrental')).toBe(HISTORICAL_SUBRENTAL.expectedAfterSave);
    expect(await pg.getLaborCostValue(0)).toBe('42.00');

    await pg.fillAndTab('txtHistoricalSubrental', HISTORICAL_SUBRENTAL.restoreValue);
    await pg.clickSaveFixedCosts();
    await pg.fillLaborCost(0, originalLabor);
    await pg.clickSaveLaborCosts();

    await pg.reloadAndNavigateToEct(OFFICE_NO);
    expect(await pg.getEctFieldValue('txtHistoricalSubrental')).toBe(originalHistorical);
    expect(await pg.getLaborCostValue(0)).toBe(originalLabor);
    expect(await pg.isEctFixedCostsSaveEnabled()).toBe(false);
    expect(await pg.isEctLaborCostsSaveEnabled()).toBe(false);
  });

  test('TC-LOE-ECT-015: Currency dropdown reload behavior (conditional on a multi-currency office)', { tag: '@C105423' }, async ({ localOfficeEctPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-ECT-001']);
    const currentCurrency = await pg.getComboboxValue('drpCurrency');
    expect(currentCurrency).toBe(ECT_PAGE.currency);

    const options = await pg.getComboboxOptionsList('drpCurrency');
    if (options.length <= 1) {
      // Office 1604 as observed live only has a single currency (USD) configured — this scenario
      // is data-dependent and cannot fully exercise the reload path at this office.
      test.info().annotations.push({
        type: 'soft-pass',
        description: 'blocked - insufficient currency data at office 1604 (single currency configured); multi-currency reload path not exercised',
      });
      return;
    }

    const alt = options.find(o => o !== currentCurrency);
    if (!alt) return;
    await pg.selectComboboxExact('drpCurrency', alt);
    await expect.poll(() => pg.getComboboxValue('drpCurrency'), { timeout: 10_000 }).toBe(alt);
    expect(await pg.isOnEctTab()).toBe(true); // reload stays on the ECT tab, does not navigate away

    // Switch back and confirm the round trip lands on the original value again.
    await pg.selectComboboxExact('drpCurrency', currentCurrency);
    await expect.poll(() => pg.getComboboxValue('drpCurrency'), { timeout: 10_000 }).toBe(currentCurrency);
  });

  // Plan 6.2 (restricted-permission read-only state) is intentionally NOT AUTOMATED here: no
  // restricted-permission test account/role (missing canEditLocSetting and/or canEditLaborCost) is
  // available in this environment, per the plan's own live-verification notes. TC-LOE-ECT-016
  // below covers the only observable permission state (6.1) — the current standard automation
  // account, which has full edit rights for both Fixed Costs and Labor Cost Assumptions.
  test('TC-LOE-ECT-016: Editable state confirmed for current test account (canEditLocSetting / canEditLaborCost both true)', { tag: '@C105424' }, async ({ localOfficeEctPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-ECT-001']);
    test.setTimeout(120_000);
    expect(await pg.isFieldDisabled('txtBenefitsMultiplier')).toBe(false);
    expect(await pg.isFieldDisabled('txtHistoricalSubrental')).toBe(false);
    expect(await pg.isElementVisible('btnSaveFixedCosts')).toBe(true);
    expect(await pg.isElementVisible('btnSaveLaborCosts')).toBe(true);

    await pg.fillAndTab('txtBenefitsMultiplier', BENEFITS_MULTIPLIER.altTestValue);
    expect(await pg.isEctFixedCostsSaveEnabled()).toBe(true);
    await pg.clickSaveFixedCosts();
    expect(await pg.isEctFixedCostsSaveEnabled()).toBe(false);

    // Restore and leave office 1604 clean.
    await pg.fillAndTab('txtBenefitsMultiplier', BENEFITS_MULTIPLIER.restoreValue);
    await pg.clickSaveFixedCosts();
    await pg.reloadAndNavigateToEct(OFFICE_NO);
    expect(await pg.getEctFieldValue('txtBenefitsMultiplier')).toBe(BENEFITS_MULTIPLIER.defaultDisplay);
  });

  test('TC-LOE-ECT-017: Editing the Labor Cost grid\'s actual last row enables its Save independently of Fixed Costs Save, and the change persists after reload', { tag: '@C105425' }, async ({ localOfficeEctPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-ECT-001']);
    test.setTimeout(120_000);

    // LABOR_COST_RT_ROWS[1] documents rowIndex 65 as the grid's "Last row", but the grid is
    // API-driven data and could drift -- confirm live, on every run, that it still is the actual
    // last 0-based index before trusting it (plan gap: this row was defined but never exercised).
    const rowCount = await pg.getLaborCostRowCount();
    const lastRowIndex = await pg.getLastLaborCostRowIndex();
    expect(rowCount).toBe(66);
    expect(lastRowIndex).toBe(LABOR_COST_RT_ROWS[1].rowIndex);
    expect(await pg.getLastLaborClassName()).toBe(LABOR_COST_TEST.lastClass);

    const original = await pg.getLaborCostValue(lastRowIndex);
    expect(await pg.isEctLaborCostsSaveEnabled()).toBe(false);
    expect(await pg.isEctFixedCostsSaveEnabled()).toBe(false);

    await pg.fillLaborCost(lastRowIndex, LABOR_COST_TEST.testValue);
    expect(await pg.getLaborCostValue(lastRowIndex)).toBe('42.00');
    expect(await pg.isEctLaborCostsSaveEnabled()).toBe(true);
    expect(await pg.isEctFixedCostsSaveEnabled()).toBe(false); // independence confirmed, same as row 0 (TC-010)

    await pg.clickSaveLaborCosts();
    expect(await pg.isEctLaborCostsSaveEnabled()).toBe(false);

    await pg.reloadAndNavigateToEct(OFFICE_NO);
    expect(await pg.getLaborCostValue(lastRowIndex)).toBe('42.00');

    // Restore to the value CAPTURED at the start of this test (never a hardcoded constant) so
    // office 1604 is left exactly as found.
    await pg.fillLaborCost(lastRowIndex, original);
    await pg.clickSaveLaborCosts();
    await pg.reloadAndNavigateToEct(OFFICE_NO);
    expect(await pg.getLaborCostValue(lastRowIndex)).toBe(original);
  });

  test('TC-LOE-ECT-018: A real clipboard paste bypasses per-keystroke masking on blur-validated fields, but blur-time validation still governs the committed value', { tag: '@C105426' }, async ({ localOfficeEctPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-ECT-001']);
    test.setTimeout(120_000);

    // Force a fresh SPA component instance via a full reload before touching anything -- the
    // "revert to last valid value" mechanism exercised below reads from client-side form state,
    // and this test must not inherit any residual in-memory state left by earlier tests in this
    // long-lived session (a real flakiness source observed live: without this, an earlier test's
    // discarded-but-not-fully-reset edit could occasionally leak into this test's revert target).
    await pg.reloadAndNavigateToEct(OFFICE_NO);

    // Capture the Labor Cost baseline FIRST, before any other field is touched in this test --
    // this field (like the percentage fields below) shows a raw, unformatted value while focused
    // and a "X.00"-formatted value once blurred, so reading it must happen in a known-blurred state.
    const originalLabor = await pg.getLaborCostValue(0);
    expect(originalLabor).toBe(LABOR_COST_TEST.currentValue);

    // Benefits Multiplier: confirmed live that a real paste (Control+V) is NOT filtered
    // character-by-character the way typed input is (TC-004 never even gets "-99" into the DOM,
    // since the leading "-" keystroke is rejected) -- the raw, unmasked "-99" lands in the field
    // immediately after paste, proving the mask's keydown filter is bypassed by paste.
    await pg.pasteIntoField('txtBenefitsMultiplier', '-99');
    expect(await pg.getInputValue('txtBenefitsMultiplier')).toBe('-99');
    await pg.blurActiveField();
    // ...but on blur, confirmed live the SAME whole-value validator that governs typed input
    // reverts it back to the last valid value -- the bypass is transient, not persistent.
    expect(await pg.getInputValue('txtBenefitsMultiplier')).toBe(BENEFITS_MULTIPLIER.defaultDisplay);
    expect(await pg.expectValid('txtBenefitsMultiplier')).toBe(true);
    expect(await pg.isEctFixedCostsSaveEnabled()).toBe(false);

    // Historical Subrental %: same paste-bypass-then-blur-revert pattern, with non-numeric text.
    await pg.pasteIntoField('txtHistoricalSubrental', 'abc');
    expect(await pg.getInputValue('txtHistoricalSubrental')).toBe('abc');
    await pg.blurActiveField();
    expect(await pg.getInputValue('txtHistoricalSubrental')).toBe(HISTORICAL_SUBRENTAL.defaultDisplay);
    expect(await pg.expectValid('txtHistoricalSubrental')).toBe(true);
    expect(await pg.isEctFixedCostsSaveEnabled()).toBe(false);

    // Labor Cost cell: paste also bypasses the mask, but confirmed live the whole-value validator
    // here rejects the pasted "-99" outright (same as typed negative input in TC-012) -- the value
    // reformats back to the original displayed value on blur, same as the Fixed Costs fields above.
    await pg.pasteIntoLaborCost(0, '-99');
    await pg.blurActiveField();
    expect(await pg.getLaborCostValue(0)).toBe(originalLabor);

    // Discard everything from this test (via a fresh re-navigate, tolerant of either a clean or a
    // still-dirty grid after the rejected paste) -- nothing was ever saved.
    await pg.reloadAndNavigateToEct(OFFICE_NO);
    expect(await pg.getLaborCostValue(0)).toBe(originalLabor);
    expect(await pg.isEctLaborCostsSaveEnabled()).toBe(false);
    expect(await pg.getInputValue('txtBenefitsMultiplier')).toBe(BENEFITS_MULTIPLIER.defaultDisplay);
    expect(await pg.getInputValue('txtHistoricalSubrental')).toBe(HISTORICAL_SUBRENTAL.defaultDisplay);
  });

  test('TC-LOE-ECT-019: Benefits Multiplier and Historical Subrental % treat "0" as a valid required value and a whitespace-only value as empty/invalid', { tag: '@C105427' }, async ({ localOfficeEctPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-ECT-001']);
    test.setTimeout(60_000);
    const originalBenefits = await pg.getEctFieldValue('txtBenefitsMultiplier');
    const originalHistorical = await pg.getEctFieldValue('txtHistoricalSubrental');

    // "0" is accepted as a genuinely valid value, not treated as blank -- confirmed live (via real
    // per-keystroke typing, matching fillAndTab) this satisfies the required-field validator on
    // both fields: no destructive styling, and Save enables since it's a real change from default.
    await pg.fillAndTab('txtBenefitsMultiplier', '0');
    expect(await pg.getInputValue('txtBenefitsMultiplier')).toBe('0.0%');
    expect(await pg.expectValid('txtBenefitsMultiplier')).toBe(true);
    expect(await pg.isEctFixedCostsSaveEnabled()).toBe(true);

    await pg.fillAndTab('txtHistoricalSubrental', '0');
    expect(await pg.getInputValue('txtHistoricalSubrental')).toBe('0.0%');
    expect(await pg.expectValid('txtHistoricalSubrental')).toBe(true);

    // A single whitespace character is NOT treated as literal non-numeric text (unlike "abc" in
    // TC-004/007) -- confirmed live it is trimmed/treated exactly like a fully cleared field: the
    // value collapses to "", destructive styling applies, and Save is disabled.
    await pg.fillAndTab('txtBenefitsMultiplier', ' ');
    expect(await pg.getInputValue('txtBenefitsMultiplier')).toBe('');
    expect(await pg.expectInvalid('txtBenefitsMultiplier')).toBe(true);
    expect(await pg.isEctFixedCostsSaveEnabled()).toBe(false);

    await pg.fillAndTab('txtHistoricalSubrental', ' ');
    expect(await pg.getInputValue('txtHistoricalSubrental')).toBe('');
    expect(await pg.expectInvalid('txtHistoricalSubrental')).toBe(true);
    expect(await pg.isEctFixedCostsSaveEnabled()).toBe(false);

    // Nothing was ever saved -- restore both fields to their CAPTURED original values via a fresh
    // re-navigate, same pattern as TC-003/006.
    await pg.reloadAndNavigateToEct(OFFICE_NO);
    expect(await pg.getEctFieldValue('txtBenefitsMultiplier')).toBe(originalBenefits);
    expect(await pg.getEctFieldValue('txtHistoricalSubrental')).toBe(originalHistorical);
  });

  test('TC-LOE-ECT-020: Fixed Costs Save stays disabled while EITHER field is invalid, and only enables once BOTH invalid fields are fixed', { tag: '@C105428' }, async ({ localOfficeEctPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-ECT-001']);
    test.setTimeout(60_000);
    const originalBenefits = await pg.getEctFieldValue('txtBenefitsMultiplier');
    const originalHistorical = await pg.getEctFieldValue('txtHistoricalSubrental');
    expect(await pg.isEctFixedCostsSaveEnabled()).toBe(false);

    // Invalidate BOTH fields at once (every existing negative-input test only ever invalidates one).
    await pg.clearAndTab('txtBenefitsMultiplier');
    await pg.clearAndTab('txtHistoricalSubrental');
    expect(await pg.expectInvalid('txtBenefitsMultiplier')).toBe(true);
    expect(await pg.expectInvalid('txtHistoricalSubrental')).toBe(true);
    expect(await pg.isEctFixedCostsSaveEnabled()).toBe(false);

    // Fix ONLY Benefits Multiplier (to a genuinely different valid value) -- confirmed live Save
    // stays disabled because Historical Subrental is still blank/invalid: this is the cross-field
    // gating behavior that's never been exercised with more than one bad field at a time.
    await pg.fillAndTab('txtBenefitsMultiplier', BENEFITS_MULTIPLIER.altTestValue);
    expect(await pg.expectValid('txtBenefitsMultiplier')).toBe(true);
    expect(await pg.isEctFixedCostsSaveEnabled()).toBe(false);

    // Now fix the second field too (to a genuinely different valid value) -- Save enables only now
    // that BOTH fields are valid.
    await pg.fillAndTab('txtHistoricalSubrental', HISTORICAL_SUBRENTAL.testValue);
    expect(await pg.expectValid('txtHistoricalSubrental')).toBe(true);
    expect(await pg.isEctFixedCostsSaveEnabled()).toBe(true);

    // Nothing was ever saved -- restore both fields to their CAPTURED original values and confirm
    // office 1604 ends up clean (Save disabled again, matching its pre-test state).
    await pg.fillAndTab('txtBenefitsMultiplier', BENEFITS_MULTIPLIER.restoreValue);
    await pg.fillAndTab('txtHistoricalSubrental', HISTORICAL_SUBRENTAL.restoreValue);
    expect(await pg.getEctFieldValue('txtBenefitsMultiplier')).toBe(originalBenefits);
    expect(await pg.getEctFieldValue('txtHistoricalSubrental')).toBe(originalHistorical);
    expect(await pg.isEctFixedCostsSaveEnabled()).toBe(false);

    // Discard defensively via a fresh re-navigate in case any dirty flag lingered.
    await pg.reloadAndNavigateToEct(OFFICE_NO);
    expect(await pg.getEctFieldValue('txtBenefitsMultiplier')).toBe(originalBenefits);
    expect(await pg.getEctFieldValue('txtHistoricalSubrental')).toBe(originalHistorical);
    expect(await pg.isEctFixedCostsSaveEnabled()).toBe(false);
  });

  // Plan gap 5 (multi-currency reload path) is intentionally NOT AUTOMATED here: TC-LOE-ECT-015
  // soft-passes on office 1604 because it only has one currency. Office 1101 ("Corporate Office
  // Encore USA SGA" -- the account's default landing office, and the office named in this
  // module's original design spec) was checked live as the next candidate: its ECT Settings tab
  // loads in the same shape (location label, currency dropdown, Fixed Costs, Labor Cost
  // Assumptions, SubRental Matrix all present), but its currency dropdown also lists only a
  // single option ("USD") -- confirmed live, not assumed. Per the task's own instruction, a
  // single-currency office 1101 means this gap is skipped rather than forced: no office with more
  // than one ECT currency was found in this environment to exercise a real (non-soft-pass)
  // currency-switch reload. Office 1101 was left untouched (view-only: tab load + one dropdown
  // open/close, no field edits, no saves).
});
