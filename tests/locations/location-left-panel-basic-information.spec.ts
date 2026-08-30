import { test, expect } from '../../src/fixtures/pages.fixture';
import { saveAndVerifyCase } from '../../src/utils/field-case-runner';
import { OFFICE_NO } from '../../src/data/common';
import {
  LP_DEFAULTS,
  LP_DROPDOWN,
  LP_TEST_VALUES,
  PAY_TO_ORIGINAL,
  PAY_TO_ALTERNATE,
} from '../../src/data/locations/location-left-panel-basic-information';

/** Persisting tests must restore office-1604 defaults themselves — nothing may leak to sibling specs. */
test.describe('Location Left Panel — Basic Information @locations @left-panel-basic-information', () => {
  test.beforeEach(async ({ locationLeftPanelBasicInformationPage: lp }) => {
    test.setTimeout(120_000);
    if (!(await lp.isOnBasicInformation())) {
      await lp.navigateToBasicInformation(OFFICE_NO);
    }
    // Per-test (not first-test-only) so a crashed prior run cannot poison defaults. Pay To is
    // verify-only — it throws if drifted off ID 1 rather than auto-repairing by ambiguous name.
    await lp.ensureDefaultState();
  });

  test('TC-LOC-LP-001: Left panel field baseline state', async ({ locationLeftPanelBasicInformationPage: lp }) => {
    expect(await lp.getLocalOfficeValue()).toBe(LP_DEFAULTS.localOffice);
    expect(await lp.getLocalOfficeName()).toBe(LP_DEFAULTS.localOfficeName);
    expect((await lp.getActiveState()).checked).toBe(true);
    // Format-only assert: 1604 is a shared office and other CI bots drift its Live Date.
    expect(await lp.getLiveDateText()).toMatch(/^[A-Z][a-z]+ \d{1,2}(st|nd|rd|th), \d{4}$/);
    expect(await lp.getTaxMode()).toBe(LP_DEFAULTS.taxMode);
    expect(await lp.getCountry()).toBe(LP_DEFAULTS.country);
    expect(await lp.getRegion()).toBe(LP_DEFAULTS.region);
    expect(await lp.getServicingBranch()).toContain('Select Servicing Branch Office');
    expect(await lp.getLineOfBusiness()).toBe(LP_DEFAULTS.lineOfBusiness);
    expect(await lp.getPayToAddress()).toBe(LP_DEFAULTS.payToAddress);
    expect((await lp.getUnionState()).checked).toBe(false);
    expect(await lp.getECommerceState()).toEqual({ checked: true, disabled: true });
    expect(await lp.getProductionOrdersState()).toEqual({ checked: true, disabled: true });
  });

  test('TC-LOC-LP-002: Office field is always disabled', async ({ locationLeftPanelBasicInformationPage: lp }) => {
    expect(await lp.isFieldDisabled('txtOffice')).toBe(true);
  });

  test('TC-LOC-LP-003: Local Office field is always disabled', async ({ locationLeftPanelBasicInformationPage: lp }) => {
    expect(await lp.isFieldDisabled('txtLocalOffice')).toBe(true);
    expect(await lp.getLocalOfficeValue()).toBe(LP_DEFAULTS.localOffice);
  });

  test('TC-LOC-LP-004: Pay To Address display input is always disabled (launcher field)', async ({ locationLeftPanelBasicInformationPage: lp }) => {
    // Only the display input is disabled — the field is still interactive: its <label> launches
    // the "Pay To List" dialog.
    expect(await lp.isFieldDisabled('txtPayToAddress')).toBe(true);
    expect(await lp.getPayToAddress()).toBe(LP_DEFAULTS.payToAddress);
  });

  test('TC-LOC-LP-005: eCommerce Active is permanently checked + disabled', async ({ locationLeftPanelBasicInformationPage: lp }) => {
    expect(await lp.getECommerceState()).toEqual({ checked: true, disabled: true });
  });

  test('TC-LOC-LP-006: Enable Productions Orders is permanently checked + disabled', async ({ locationLeftPanelBasicInformationPage: lp }) => {
    expect(await lp.getProductionOrdersState()).toEqual({ checked: true, disabled: true });
  });

  test('TC-LOC-LP-007: Save button disabled on fresh page load', async ({ locationLeftPanelBasicInformationPage: lp }) => {
    expect(await lp.isSaveEnabled(), 'Save should be disabled on a fresh page load').toBe(false);
  });

  test('TC-LOC-LP-008: Save button enables after a form change', async ({ locationLeftPanelBasicInformationPage: lp }) => {
    expect(await lp.isSaveEnabled()).toBe(false);
    await lp.setUnion(true);
    expect(await lp.waitForSaveButtonEnabled(), 'Save should become enabled after a form change').toBe(true); // change enables Save (async Angular dirty)
    // Reverting the toggle is a NET-ZERO change → Save returns to DISABLED (Angular net-zero
    // detection, Angular dirty-state). The original spec doc's "stays dirty after revert" does not reproduce live.
    await lp.setUnion(false);
    expect(await lp.waitForSaveButtonDisabled()).toBe(true);
    await lp.reloadAndNavigate(OFFICE_NO); // clean
  });

  test('TC-LOC-LP-009: Local Office Name required — empty disables Save', async ({ locationLeftPanelBasicInformationPage: lp }) => {
    await lp.clearLocalOfficeName();
    expect(await lp.getLocalOfficeName()).toBe('');
    // The empty required field gates Save, so Save stays disabled.
    expect(await lp.isSaveEnabled()).toBe(false);
    await lp.reloadAndNavigate(OFFICE_NO); // discard
  });

  test('TC-LOC-LP-010: Local Office Name maxlength (live=255)', async ({ locationLeftPanelBasicInformationPage: lp }) => {
    // The input enforces maxlength=255 (browser-enforced on keystroke). The original MD claimed 50
    // — corrected against live and flagged to Encore (is 255 intended, or should the limit be 50?).
    expect(await lp.getLocalOfficeNameMaxLength()).toBe(LP_TEST_VALUES.localOfficeNameMaxLength);
  });

  test('TC-LOC-LP-011: Active checkbox toggle persists through save+reload', async ({ locationLeftPanelBasicInformationPage: lp }) => {
    await lp.setActive(false);
    await lp.saveAndConfirm();
    await lp.reloadAndNavigate(OFFICE_NO);
    // Poll the reloaded value — the persisted checkbox hydrates asynchronously after reload, so a
    // single immediate read can catch the pre-hydration state (replaces the former fixed wait).
    await expect.poll(async () => (await lp.getActiveState()).checked, { timeout: 10_000 }).toBe(false);
    // restore
    await lp.setActive(true);
    await lp.saveAndConfirm();
    await lp.reloadAndNavigate(OFFICE_NO);
    await expect.poll(async () => (await lp.getActiveState()).checked, { timeout: 10_000 }).toBe(true);
  });

  test('TC-LOC-LP-012: Union checkbox toggle persists through save+reload', async ({ locationLeftPanelBasicInformationPage: lp }) => {
    await lp.setUnion(true);
    await lp.saveAndConfirm();
    await lp.reloadAndNavigate(OFFICE_NO);
    await expect.poll(async () => (await lp.getUnionState()).checked, { timeout: 10_000 }).toBe(true);
    // restore
    await lp.setUnion(false);
    await lp.saveAndConfirm();
    await lp.reloadAndNavigate(OFFICE_NO);
    await expect.poll(async () => (await lp.getUnionState()).checked, { timeout: 10_000 }).toBe(false);
  });

  test('TC-LOC-LP-013: Tax Mode dropdown options (US, International)', async ({ locationLeftPanelBasicInformationPage: lp }) => {
    expect(await lp.getTaxModeOptions()).toEqual([...LP_DROPDOWN.taxMode]);
    expect(await lp.getTaxMode()).toBe(LP_DEFAULTS.taxMode);
  });

  test('TC-LOC-LP-014: Country dropdown options (US, Mexico, Canada, Bahamas)', async ({ locationLeftPanelBasicInformationPage: lp }) => {
    expect(await lp.getCountryOptions()).toEqual([...LP_DROPDOWN.country]);
    expect(await lp.getCountry()).toBe(LP_DEFAULTS.country);
  });

  test('TC-LOC-LP-015: Region dropdown options + non-persist on reload', async ({ locationLeftPanelBasicInformationPage: lp }) => {
    const options = await lp.getRegionOptions();
    expect(options.length).toBeGreaterThan(LP_DROPDOWN.regionLowerBound); // live: 59 (no exact assert)
    expect(options).toContain(LP_DROPDOWN.regionContains);
    expect(await lp.getRegion()).toBe(LP_DEFAULTS.region);
    await lp.selectRegion(LP_TEST_VALUES.regionAlt);
    expect(await lp.getRegion()).toBe(LP_TEST_VALUES.regionAlt);
    await lp.reloadAndNavigate(OFFICE_NO); // no save -> reverts
    expect(await lp.getRegion()).toBe(LP_DEFAULTS.region);
  });

  test('TC-LOC-LP-016: Line Of Business is read-only/disabled in edit mode (NM-831)', async ({ locationLeftPanelBasicInformationPage: lp }) => {
    // NM-831 / NM-1140: LOB is selectable only at creation, so a disabled Radix dropdown never
    // opens — assert the disabled state and displayed value rather than the option list.
    expect(await lp.isFieldDisabled('drpLineOfBusiness')).toBe(true);
    expect(await lp.getLineOfBusiness()).toBe(LP_DEFAULTS.lineOfBusiness);
  });

  test('TC-LOC-LP-017: Servicing Branch Office dropdown + unselected default', async ({ locationLeftPanelBasicInformationPage: lp }) => {
    const options = await lp.getServicingBranchOptions();
    expect(options.length).toBeGreaterThan(LP_DROPDOWN.servicingBranchLowerBound); // live: 218 (no exact assert)
    expect(await lp.getServicingBranch()).toContain('Select Servicing Branch Office');
    // selecting a value enables Save (validation satisfied); discard without saving (required field
    // has no "unselect" — saving would leak into 1604).
    const firstBranch = options[0];
    expect(firstBranch).toBeTruthy();
    await lp.selectServicingBranch(firstBranch as string);
    expect(await lp.isSaveEnabled()).toBe(true);
    await lp.reloadAndNavigate(OFFICE_NO);
    expect(await lp.getServicingBranch()).toContain('Select Servicing Branch Office');
  });

  test('TC-LOC-LP-018: Country change clears Tax Mode + Region', async ({ locationLeftPanelBasicInformationPage: lp }) => {
    expect(await lp.getTaxMode()).toBe(LP_DEFAULTS.taxMode);
    expect(await lp.getRegion()).toBe(LP_DEFAULTS.region);
    await lp.selectCountry(LP_TEST_VALUES.countryAlt); // Canada
    expect(await lp.getTaxMode()).toBe('');
    expect(await lp.getRegion()).toBe('');
    expect(await lp.isSaveEnabled()).toBe(false); // TaxModeID = 0
    await lp.reloadAndNavigate(OFFICE_NO); // discard
  });

  test('TC-LOC-LP-019: Save disabled after Country change (TaxModeID=0); re-select Tax Mode re-enables', async ({ locationLeftPanelBasicInformationPage: lp }) => {
    await lp.selectCountry(LP_TEST_VALUES.countryAlt);
    expect(await lp.isSaveEnabled()).toBe(false);
    await lp.selectTaxMode('International');
    expect(await lp.isSaveEnabled()).toBe(true);
    await lp.reloadAndNavigate(OFFICE_NO); // discard
  });

  test('TC-LOC-LP-020: Tax Mode + Region NOT auto-restored after Country change', async ({ locationLeftPanelBasicInformationPage: lp }) => {
    await lp.selectCountry(LP_TEST_VALUES.countryAlt); // Canada -> clears Tax/Region
    expect(await lp.getTaxMode()).toBe('');
    await lp.selectCountry(LP_DEFAULTS.country); // back to United States
    expect(await lp.getTaxMode()).toBe(''); // still empty (not auto-restored)
    expect(await lp.getRegion()).toBe('');
    await lp.reloadAndNavigate(OFFICE_NO); // discard
  });

  test('TC-LOC-LP-021: Country=USA enables Job Costing; Canada unchecks it (Local Information)', async ({ locationLeftPanelBasicInformationPage: lp }) => {
    await lp.clickLocalInformationTab();
    expect((await lp.getJobCostingState()).checked).toBe(true); // USA default
    await lp.selectCountry(LP_TEST_VALUES.countryAlt); // Canada
    expect((await lp.getJobCostingState()).checked).toBe(false);
    await lp.reloadAndNavigate(OFFICE_NO); // discard
  });

  test('TC-LOC-LP-022: Country=Canada reveals Remit PST Tax (Local Information)', async ({ locationLeftPanelBasicInformationPage: lp }) => {
    await lp.clickLocalInformationTab();
    expect(await lp.isRemitPstVisible()).toBe(false); // USA: not present
    await lp.selectCountry(LP_TEST_VALUES.countryAlt); // Canada
    expect(await lp.isRemitPstVisible()).toBe(true);
    await lp.reloadAndNavigate(OFFICE_NO); // discard
  });

  test('TC-LOC-LP-023: Live Date button opens a date popover', async ({ locationLeftPanelBasicInformationPage: lp }) => {
    // Value-agnostic (1604 Live Date drifts — shared office); assert format + that the popover opens.
    expect(await lp.getLiveDateText()).toMatch(/^[A-Z][a-z]+ \d{1,2}(st|nd|rd|th), \d{4}$/);
    expect(await lp.openLiveDatePopover()).toBe(true);
    await lp.closeLiveDatePopover();
    // Pay To Address above remains read-only regardless.
    expect(await lp.isFieldDisabled('txtPayToAddress')).toBe(true);
  });

  test('TC-LOC-LP-024: Local Office Name persists through save+reload', async ({ locationLeftPanelBasicInformationPage: lp }) => {
    await lp.setLocalOfficeName(LP_TEST_VALUES.localOfficeNamePersist);
    await lp.saveAndConfirm();
    await lp.reloadAndNavigate(OFFICE_NO);
    expect(await lp.getLocalOfficeName()).toBe(LP_TEST_VALUES.localOfficeNamePersist);
    // restore
    await lp.setLocalOfficeName(LP_DEFAULTS.localOfficeName);
    await lp.saveAndConfirm();
    await lp.reloadAndNavigate(OFFICE_NO);
    expect(await lp.getLocalOfficeName()).toBe(LP_DEFAULTS.localOfficeName);
  });

  test('TC-LOC-LP-025: Tax Mode persists through save+reload', async ({ locationLeftPanelBasicInformationPage: lp }) => {
    await lp.selectTaxMode(LP_TEST_VALUES.taxModeAlt); // International
    await lp.saveAndConfirm();
    await lp.reloadAndNavigate(OFFICE_NO);
    expect(await lp.getTaxMode()).toBe(LP_TEST_VALUES.taxModeAlt);
    // restore
    await lp.selectTaxMode(LP_DEFAULTS.taxMode);
    await lp.saveAndConfirm();
    await lp.reloadAndNavigate(OFFICE_NO);
    expect(await lp.getTaxMode()).toBe(LP_DEFAULTS.taxMode);
  });

  test('TC-LOC-LP-026: Region persists through save+reload', async ({ locationLeftPanelBasicInformationPage: lp }) => {
    await lp.selectRegion(LP_TEST_VALUES.regionAlt); // Boston
    await lp.saveAndConfirm();
    await lp.reloadAndNavigate(OFFICE_NO);
    expect(await lp.getRegion()).toBe(LP_TEST_VALUES.regionAlt);
    // restore
    await lp.selectRegion(LP_DEFAULTS.region);
    await lp.saveAndConfirm();
    await lp.reloadAndNavigate(OFFICE_NO);
    expect(await lp.getRegion()).toBe(LP_DEFAULTS.region);
  });

  // The Pay To launcher lives on the <label>; a plain click is blocked by the disabled-input
  // association, so the page object dispatches it. Restore is ID-anchored — "Encore" is IDs 1 & 4.

  test('TC-LOC-LP-027: Pay To Address launcher opens the "Pay To List" dialog', async ({ locationLeftPanelBasicInformationPage: lp }) => {
    await lp.openPayToDialog();
    expect(await lp.isPayToDialogVisible()).toBe(true);
    expect(await lp.hasPayToFilters()).toBe(true);            // Pay To ID + Pay To Name filters
    expect(await lp.hasPayToActionButtons()).toBe(true);      // Search + Reset
    expect(await lp.hasPayToTableAndCancel()).toBe(true);     // results table + Cancel
    await lp.cancelPayToDialog();
  });

  test('TC-LOC-LP-028: Pay To List Select disabled until a row is checked', async ({ locationLeftPanelBasicInformationPage: lp }) => {
    await lp.openPayToDialog();
    expect(await lp.isPayToSelectDisabled()).toBe(true);
    await lp.checkPayToFirstRow();
    expect(await lp.isPayToSelectDisabled()).toBe(false);
    await lp.cancelPayToDialog();
  });

  test('TC-LOC-LP-029: Pay To List Cancel discards (no field change)', async ({ locationLeftPanelBasicInformationPage: lp }) => {
    await lp.openPayToDialog();
    await lp.checkPayToFirstRow();
    await lp.cancelPayToDialog();
    expect(await lp.isPayToDialogVisible()).toBe(false);
    expect(await lp.getPayToAddress()).toBe(PAY_TO_ORIGINAL.name); // unchanged
    expect(await lp.isSaveEnabled()).toBe(false);                  // form stayed pristine
  });

  test('TC-LOC-LP-030: Pay To List Close-X and Esc each discard', async ({ locationLeftPanelBasicInformationPage: lp }) => {
    // Esc dismisses
    await lp.openPayToDialog();
    await lp.escPayToDialog();
    expect(await lp.isPayToDialogVisible()).toBe(false);
    expect(await lp.getPayToAddress()).toBe(PAY_TO_ORIGINAL.name);
    expect(await lp.isSaveEnabled()).toBe(false);
    // Close-X dismisses (independent cycle — asserted separately, not a combined OR-expression)
    await lp.openPayToDialog();
    await lp.closePayToDialog();
    expect(await lp.isPayToDialogVisible()).toBe(false);
    expect(await lp.getPayToAddress()).toBe(PAY_TO_ORIGINAL.name);
    expect(await lp.isSaveEnabled()).toBe(false);
  });

  test('TC-LOC-LP-031: Pay To List ID filter returns the matching row', async ({ locationLeftPanelBasicInformationPage: lp }) => {
    await lp.openPayToDialog();
    await lp.searchPayToById(String(PAY_TO_ALTERNATE.id)); // "7"
    expect(await lp.payToResultsContain(PAY_TO_ALTERNATE.name)).toBe(true); // "Encore Bahamas"
    await lp.cancelPayToDialog();
  });

  test('TC-LOC-LP-032: Pay To List Name filter "Encore" returns multiple rows', async ({ locationLeftPanelBasicInformationPage: lp }) => {
    await lp.openPayToDialog();
    await lp.searchPayToByName(PAY_TO_ORIGINAL.name); // "Encore" — server-side contains
    expect(await lp.payToResultsContain(PAY_TO_ORIGINAL.name)).toBe(true);
    expect(await lp.getPayToDialogRowCount()).toBeGreaterThan(1); // ≥2 "Encore" rows (content check, not an exact count)
    await lp.cancelPayToDialog();
  });

  test('TC-LOC-LP-033: Pay To List empty result shows "No results."', async ({ locationLeftPanelBasicInformationPage: lp }) => {
    await lp.openPayToDialog();
    await lp.searchPayToById('99999'); // no such Pay To
    expect(await lp.isPayToDialogEmpty()).toBe(true);
    await lp.cancelPayToDialog();
  });

  test('TC-LOC-LP-034: Pay To List Reset clears filters / restores full list', async ({ locationLeftPanelBasicInformationPage: lp }) => {
    await lp.openPayToDialog();
    await lp.searchPayToById(String(PAY_TO_ALTERNATE.id)); // narrow to 1
    expect(await lp.getPayToDialogRowCount()).toBe(1);
    await lp.resetPayToSearch();
    expect(await lp.getPayToDialogRowCount()).toBeGreaterThan(1); // full list restored
    await lp.cancelPayToDialog();
  });

  test('TC-LOC-LP-035: Pay To selection updates display + enables Save (no save)', async ({ locationLeftPanelBasicInformationPage: lp }) => {
    await lp.selectPayToById(String(PAY_TO_ALTERNATE.id)); // ID 7 → display "Encore Bahamas"
    expect(await lp.getPayToAddress()).toBe(PAY_TO_ALTERNATE.name);
    expect(await lp.waitForSaveButtonEnabled()).toBe(true); // form dirty
    await lp.reloadAndNavigate(OFFICE_NO);                  // discard (no save)
    expect(await lp.getPayToAddress()).toBe(PAY_TO_ORIGINAL.name); // reverted
  });

  test('TC-LOC-LP-036: Pay To selection persists through save+reload (restore by ID)', async ({ locationLeftPanelBasicInformationPage: lp }) => {
    test.setTimeout(150_000);
    await saveAndVerifyCase({
      id: 'TC-LOC-LP-036',
      label: 'Pay To select ID 7 -> save -> persists -> restore ID 1',
      baseline: () => lp.ensureDefaultState(),                      // verify-only Pay To = "Encore" (ID 1)
      act: () => lp.selectPayToById(String(PAY_TO_ALTERNATE.id)),   // ID 7 "Encore Bahamas"
      expectBeforeSave: async () => {
        expect(await lp.getPayToAddress()).toBe(PAY_TO_ALTERNATE.name);
        expect(await lp.waitForSaveButtonEnabled()).toBe(true);
      },
      saveAndConfirm: () => lp.saveAndConfirm(),
      reload: () => lp.reloadAndNavigate(OFFICE_NO),
      expectAfterReload: async () => {
        // Pay To selection PERSISTS through save+reload (unlike the Venue address selection, ACC-027).
        expect(await lp.getPayToAddress(), 'Pay To selection should persist after save and reload').toBe(PAY_TO_ALTERNATE.name);
      },
      // Restore office-1604 to the ORIGINAL Pay To by ID (name "Encore" is ambiguous — IDs 1 & 4).
      cleanup: () => lp.restorePayToOriginal(),
    });
  });

});
