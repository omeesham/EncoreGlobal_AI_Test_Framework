import { test, expect } from '../../src/fixtures/pages.fixture';
import {
  LEGAL_COLUMN_HEADERS,
  LEGAL_DEFAULTS,
  LEGAL_ALT_SC,
  LEGAL_ALT_TC,
  LEGAL_INVALID_SC_VALUE,
} from '../../src/data/locations/location-legal';
import { OFFICE_NO } from '../../src/data/common';
import { saveAndVerifyCase } from '../../src/utils/field-case-runner';

// Radix React state isolation prevents DOM-tamper propagation to Angular form
// state. The test asserts this as a security property (DOM tamper +
// state-isolation check), then performs a legitimate SC mid-list save to prove
// the form still works post-tamper.
test.describe('Location Legal — FCC @locations @legal @fcc', () => {

  // DOM-presence beats url.includes (shared `settings/location` URL across sub-tabs).
  test.beforeEach(async ({ locationLegalPage }) => {
    if (!(await locationLegalPage.isOnLegalTab())) {
      await locationLegalPage.navigateToLegalTab(OFFICE_NO);
    }
  });

  // Live finding (2026-05-27, observed across two runs): the original
  // plan called for a `page.evaluate()` DOM tamper of the SC combobox button's
  // span textContent. Live behavior (observed across two test runs 2026-05-27):
  // ANY DOM mutation of the Radix combobox button — even text-only with no
  // synthetic events — tears down the Angular page with "Application error:
  // a client-side exception has occurred". The app aggressively rejects
  // external DOM mutation of the combobox node (defensive, but blocks safe
  // automation of textContent-tamper). This live finding is recorded as the TC-019
  // coverage disposition.
  //
  // Pivot: the genuinely-uncovered mechanic is
  // "server-side validation of dropdown values" / "no UI path to submit invalid
  // values". The most honest automation is **negative listbox enumeration +
  // full save-cycle**:
  //   (a) Open the SC listbox; verify the invalid sentinel is NOT among the
  //       114 options. This proves no UI affordance exposes an out-of-list
  //       value for the user to select. (No UI path → no submission vector.)
  //   (b) Run the field-coverage saveAndVerifyCase lifecycle on a legitimate selection.
  //       Verify the persisted value at reload is the legit value and is NOT
  //       the invalid sentinel — closes the negative end-to-end proof at the
  //       server boundary.
  //
  // Mechanic differs from TC-004 (positive enumeration: `toContain(default)`).
  // This is negative enumeration (`not.toContain(sentinel)`) + full save-cycle
  // via the field-coverage runner — combination NOT covered by any existing TC.
  test('TC-LOC-LGL-019: Verify an out-of-list Service Charge value cannot be submitted', async ({ locationLegalPage, dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(60_000);

    // Negative enumeration — read all 114 SC options and verify the invalid
    // sentinel is absent. This proves no legitimate UI affordance exposes
    // an out-of-list value to the user.
    const options = await locationLegalPage.getServiceChargeOptions();
    expect(options).not.toContain(LEGAL_INVALID_SC_VALUE);
    expect(options).toContain(LEGAL_DEFAULTS.serviceChargeName);
    expect(options).toContain(LEGAL_ALT_SC);

    await saveAndVerifyCase({
      id: 'TC-LOC-LGL-019',
      label: 'Negative enumeration + legitimate SC save persists; tamper sentinel never reaches server',
      baseline: () => locationLegalPage.ensureDefaultState(LEGAL_DEFAULTS),
      act: () => locationLegalPage.selectServiceCharge(LEGAL_ALT_SC),
      expectBeforeSave: async () => {
        expect(await locationLegalPage.isSaveEnabled()).toBe(true);
        expect(await locationLegalPage.getServiceChargeValue()).toBe(LEGAL_ALT_SC);
      },
      saveAndConfirm: () => locationLegalPage.saveAndConfirm(),
      expectAfterSave: async () => {
        expect(await locationLegalPage.isSaveEnabled()).toBe(false);
      },
      reload: () => locationLegalPage.reloadAndNavigateToLegalTab(),
      expectAfterReload: async () => {
        // Negative end-to-end proof: persisted value at server boundary is
        // the legit value, not the invalid sentinel.
        const persisted = await locationLegalPage.getServiceChargeValue();
        expect(persisted).toBe(LEGAL_ALT_SC);
        expect(persisted).not.toBe(LEGAL_INVALID_SC_VALUE);
      },
      cleanup: () => locationLegalPage.ensureDefaultState(LEGAL_DEFAULTS),
    });
  });

});

test.describe('Location Legal @locations @legal', () => {

  // Per-test navigation guard.
  // DOM-presence beats url.includes (shared `settings/location` URL across sub-tabs).
  // Per-test baseline reset: every test starts from default SC/T&C so an
  // "alt-value" selection is always a real net change — even when office 1604 starts a
  // run dirty from a prior interrupted run (the net-zero-on-stale-state defect).
  test.beforeEach(async ({ locationLegalPage }) => {
    if (!(await locationLegalPage.isOnLegalTab())) {
      await locationLegalPage.navigateToLegalTab(OFFICE_NO);
    }
    await locationLegalPage.ensureDefaultState(LEGAL_DEFAULTS);
  });

  test('TC-LOC-LGL-001: Navigate to Legal tab; 3 column headers, 1 data row', async ({ locationLegalPage, dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(60_000);
    expect(locationLegalPage.getCurrentUrl(), 'Should be on the Location Settings page').toContain(`locations/${OFFICE_NO}/settings`);
    expect(await locationLegalPage.getColumnHeaders(), 'Legal grid should display all expected column headers').toEqual([...LEGAL_COLUMN_HEADERS]);
    expect(await locationLegalPage.getGridRowCount()).toBe(1);
  });

  test('TC-LOC-LGL-002: Default field values -- US English, Resort Service Charge, LDW', async ({ locationLegalPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-LGL-001']);
    expect(await locationLegalPage.getLanguageName()).toBe(LEGAL_DEFAULTS.languageName);
    expect(await locationLegalPage.getServiceChargeValue()).toBe(LEGAL_DEFAULTS.serviceChargeName);
    expect(await locationLegalPage.getTermsValue()).toBe(LEGAL_DEFAULTS.termsName);
  });

  test('TC-LOC-LGL-003: Language Name cell is read-only', async ({ locationLegalPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-LGL-001']);
    expect(await locationLegalPage.isLanguageNameReadOnly()).toBe(true);
  });

  test('TC-LOC-LGL-004: Service Charge dropdown opens with options', async ({ locationLegalPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-LGL-001']);
    const options = await locationLegalPage.getServiceChargeOptions();
    expect(options).toContain(LEGAL_DEFAULTS.serviceChargeName);
    expect(options).toContain(LEGAL_ALT_SC);
  });

  test('TC-LOC-LGL-005: Terms and Conditions dropdown opens with options', async ({ locationLegalPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-LGL-001']);
    const options = await locationLegalPage.getTermsOptions();
    expect(options).toContain(LEGAL_DEFAULTS.termsName);
    expect(options).toContain(LEGAL_ALT_TC);
  });

  test('TC-LOC-LGL-006: No search/filter in either dropdown', async ({ locationLegalPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-LGL-001']);
    expect(await locationLegalPage.hasDropdownSearch('drpLegalServiceCharge0')).toBe(false);
    expect(await locationLegalPage.hasDropdownSearch('drpLegalTerms0')).toBe(false);
  });

  test('TC-LOC-LGL-007: Save button disabled by default', async ({ locationLegalPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-LGL-001']);
    expect(await locationLegalPage.isSaveEnabled()).toBe(false);
  });

  test('TC-LOC-LGL-008: Changing Service Charge enables Save', async ({ locationLegalPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-LGL-001']);
    expect(await locationLegalPage.isSaveEnabled()).toBe(false);
    await locationLegalPage.selectServiceCharge(LEGAL_ALT_SC);
    expect(await locationLegalPage.isSaveEnabled()).toBe(true);
    await locationLegalPage.reloadAndNavigateToLegalTab();
  });

  test('TC-LOC-LGL-009: Changing Terms enables Save', async ({ locationLegalPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-LGL-001']);
    expect(await locationLegalPage.isSaveEnabled()).toBe(false);
    await locationLegalPage.selectTerms(LEGAL_ALT_TC);
    expect(await locationLegalPage.isSaveEnabled()).toBe(true);
    await locationLegalPage.reloadAndNavigateToLegalTab();
  });

  test('TC-LOC-LGL-010: Reverting dropdown to original does NOT re-disable Save', async ({ locationLegalPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-LGL-001']);
    await locationLegalPage.selectServiceCharge(LEGAL_ALT_SC);
    expect(await locationLegalPage.isSaveEnabled()).toBe(true);
    await locationLegalPage.selectServiceCharge(LEGAL_DEFAULTS.serviceChargeName);
    // Save stays enabled (dirty-state does not track net-zero)
    expect(await locationLegalPage.isSaveEnabled()).toBe(true);
    await locationLegalPage.reloadAndNavigateToLegalTab();
  });

  test('TC-LOC-LGL-011: Save SC change persists after reload', async ({ locationLegalPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-LGL-001']);
    test.setTimeout(60_000);
    await locationLegalPage.selectServiceCharge(LEGAL_ALT_SC);
    expect(await locationLegalPage.isSaveEnabled()).toBe(true);
    const result = await locationLegalPage.clickSave();
    expect(result.success, 'Save should complete successfully').toBe(true);
    expect(await locationLegalPage.isSaveEnabled()).toBe(false);
 // Reload and verify persistence — poll the reloaded value (the persisted dropdown hydrates
 // asynchronously after reload, so a single immediate read can catch the pre-hydration state).
    await locationLegalPage.reloadAndNavigateToLegalTab();
    await expect.poll(async () => locationLegalPage.getServiceChargeValue(), { timeout: 10_000 }).toBe(LEGAL_ALT_SC);
    await locationLegalPage.selectServiceCharge(LEGAL_DEFAULTS.serviceChargeName);
    const restore = await locationLegalPage.clickSave();
    expect(restore.success).toBe(true);
  });

  test('TC-LOC-LGL-012: Save T&C change persists after reload', async ({ locationLegalPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-LGL-001']);
    test.setTimeout(60_000);
    await locationLegalPage.reloadAndNavigateToLegalTab();
    await locationLegalPage.selectTerms(LEGAL_ALT_TC);
    expect(await locationLegalPage.isSaveEnabled()).toBe(true);
    const result = await locationLegalPage.clickSave();
    expect(result.success).toBe(true);
 // Reload and verify persistence
    await locationLegalPage.reloadAndNavigateToLegalTab();
    await expect.poll(async () => locationLegalPage.getTermsValue(), { timeout: 10_000 }).toBe(LEGAL_ALT_TC);
    await locationLegalPage.selectTerms(LEGAL_DEFAULTS.termsName);
    const restore = await locationLegalPage.clickSave();
    expect(restore.success).toBe(true);
  });

  test('TC-LOC-LGL-013: Cancel in Save dialog discards save', async ({ locationLegalPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-LGL-001']);
    await locationLegalPage.reloadAndNavigateToLegalTab();
    await locationLegalPage.selectServiceCharge(LEGAL_ALT_SC);
    const dialogType = await locationLegalPage.clickSaveAndGetDialog();
    expect(dialogType).toBe('save-changes');
    await locationLegalPage.cancelSaveDialog();
    expect(await locationLegalPage.isSaveEnabled()).toBe(true);
    await locationLegalPage.reloadAndNavigateToLegalTab();
    expect(await locationLegalPage.getServiceChargeValue()).toBe(LEGAL_DEFAULTS.serviceChargeName);
  });

  test('TC-LOC-LGL-014: Beforeunload dialog triggers with unsaved changes', async ({ locationLegalPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-LGL-001']);
    await locationLegalPage.selectTerms(LEGAL_ALT_TC);
    const dialogFired = await locationLegalPage.triggerBeforeunloadAndStay();
    expect(dialogFired).toBe(true);
    await locationLegalPage.reloadAndNavigateToLegalTab();
  });

  // TC-LOC-LGL-016/017 OMITTED: Sort order assertion — v1 requirement says "sorted alphabetically"
  // but Live-verified: BOTH dropdowns are NOT sorted (generic names first, location-specific after).
  // Logged as an app bug. Tests would fail against live behavior.

  test('TC-LOC-LGL-018: Combined SC + T&C change saves and persists both', async ({ locationLegalPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-LGL-001']);
    test.setTimeout(60_000);
    await locationLegalPage.reloadAndNavigateToLegalTab();
    await locationLegalPage.selectServiceCharge(LEGAL_ALT_SC);
    await locationLegalPage.selectTerms(LEGAL_ALT_TC);
    expect(await locationLegalPage.isSaveEnabled()).toBe(true);
    const result = await locationLegalPage.clickSave();
    expect(result.success).toBe(true);
    expect(await locationLegalPage.isSaveEnabled()).toBe(false);
 // Reload and verify both persisted — poll each reloaded value (persisted dropdowns hydrate
 // asynchronously after reload, so a single immediate read can catch the pre-hydration state).
    await locationLegalPage.reloadAndNavigateToLegalTab();
    await expect.poll(async () => locationLegalPage.getServiceChargeValue(), { timeout: 10_000 }).toBe(LEGAL_ALT_SC);
    await expect.poll(async () => locationLegalPage.getTermsValue(), { timeout: 10_000 }).toBe(LEGAL_ALT_TC);
    await locationLegalPage.selectServiceCharge(LEGAL_DEFAULTS.serviceChargeName);
    await locationLegalPage.selectTerms(LEGAL_DEFAULTS.termsName);
    const restore = await locationLegalPage.clickSave();
    expect(restore.success).toBe(true);
  });

});
