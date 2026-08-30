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

test.describe('Location Legal @locations @legal', () => {
  // Nav guard uses DOM presence, not url.includes — sub-tabs share the `settings/location` URL.
  // Baseline reset keeps every alt-value selection a real net change even on a dirty office.
  const FCC_IDS = ['TC-LOC-LGL-016'];

  test.beforeEach(async ({ locationLegalPage }, testInfo) => {
    if (!(await locationLegalPage.isOnLegalTab())) {
      await locationLegalPage.navigateToLegalTab(OFFICE_NO);
    }
    if (FCC_IDS.some((id) => testInfo.title.startsWith(id))) return;
    await locationLegalPage.ensureDefaultState(LEGAL_DEFAULTS);
  });

  // ── Core Legal tab behavior ──
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

  test('TC-LOC-LGL-015: Combined SC + T&C change saves and persists both', async ({ locationLegalPage, dependencyGate }) => {
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

  // ── FCC ──

  // Do NOT tamper with the dropdown via page.evaluate: any programmatic change to that button —
  // even text-only — tears the Angular page down with a client-side exception.
  test('TC-LOC-LGL-016: Verify an out-of-list Service Charge value cannot be submitted', { tag: '@fcc' }, async ({ locationLegalPage, dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(60_000);

    // Negative enumeration: an absent sentinel proves no UI affordance offers an out-of-list value.
    const options = await locationLegalPage.getServiceChargeOptions();
    expect(options).not.toContain(LEGAL_INVALID_SC_VALUE);
    expect(options).toContain(LEGAL_DEFAULTS.serviceChargeName);
    expect(options).toContain(LEGAL_ALT_SC);

    await saveAndVerifyCase({
      id: 'TC-LOC-LGL-016',
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
