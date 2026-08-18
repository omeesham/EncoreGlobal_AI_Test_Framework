import { test, expect } from '../../src/fixtures/pages.fixture';
import {
  BUSINESS_TYPES_DEFAULTS,
  BUSINESS_TYPES_SAVE_CYCLE_CASES,
} from '../../src/data/locations/location-business-types';
import { OFFICE_NO, SAVE_CHANGES_DIALOG, UNSAVED_CHANGES_DIALOG } from '../../src/data/common';

test.describe('Location Business Types @locations @business-types', () => {

  // Per-test navigation guard. Presence in the page beats a url check, because every sub-tab of
  // Location Settings shares the same address.
  test.beforeEach(async ({ locationBusinessTypesPage }) => {
    if (!(await locationBusinessTypesPage.isOnBusinessTypesTab())) {
      await locationBusinessTypesPage.navigateToBusinessTypesTab(OFFICE_NO);
    }
    // Per-test baseline: restore the office's expected selections so EVERY test starts clean,
    // including a retry, which re-runs this hook but not the first test's body. A no-op on the
    // common path; self-heals a dirty start left by an interrupted run.
    await locationBusinessTypesPage.ensureDefaultState(BUSINESS_TYPES_DEFAULTS, OFFICE_NO);
  });

  test('TC-LOC-BTY-001: Business Types Tab Renders All Items With Expected Labels', async ({ locationBusinessTypesPage, dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(90_000);
    expect(locationBusinessTypesPage.getCurrentUrl(), 'Should be on the Location Settings page').toContain(`locations/${OFFICE_NO}/settings`);
    // Count comes from the reference data, never a literal in this file.
    expect(await locationBusinessTypesPage.getCheckboxCount()).toBe(BUSINESS_TYPES_DEFAULTS.length);
    // The identifiers are positional, so prove each position still carries its expected name --
    // otherwise a reordered catalog would quietly move every later assertion onto another row.
    for (const item of BUSINESS_TYPES_DEFAULTS) {
      expect(await locationBusinessTypesPage.getCheckboxLabel(item.key),
        `Position for ${item.name} should still be labelled ${item.name}`).toContain(item.name);
    }
    // The save-cycle loop below builds its titles from the data file, so those ten ids would appear
    // nowhere in this spec. Anyone searching here for the case covering one business type would find
    // nothing, and a renumbering in the data file would go unnoticed. Naming them here fixes both.
    expect(BUSINESS_TYPES_SAVE_CYCLE_CASES.map((c) => c.tc),
      'Save-cycle case ids must match the ids this spec claims to cover').toEqual([
      'TC-LOC-BTY-003', // Audio Visual
      'TC-LOC-BTY-004', // Business Center Rentals
      'TC-LOC-BTY-005', // Business Center Services
      'TC-LOC-BTY-006', // Electrical Services
      'TC-LOC-BTY-007', // Production
      'TC-LOC-BTY-008', // Expo Services
      'TC-LOC-BTY-009', // In-House
      'TC-LOC-BTY-010', // Integrated Solutions
      'TC-LOC-BTY-011', // Internet Services
      'TC-LOC-BTY-012', // Rigging Services
    ]);
  });

  test('TC-LOC-BTY-002: Default State Of Business Type Items (location 1604)', async ({ locationBusinessTypesPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-BTY-001']);
    for (const item of BUSINESS_TYPES_DEFAULTS) {
      expect(await locationBusinessTypesPage.isCheckboxChecked(item.key),
        `${item.name} should be ${item.checked ? 'checked' : 'unchecked'}`).toBe(item.checked);
    }
    expect(await locationBusinessTypesPage.isSaveEnabled(), 'Save should be disabled on a fresh load').toBe(false);
  });

  // One loop over the reference data rather than ten copied bodies. Each case toggles the item away
  // from its own office default, so the five selected items exercise clearing and the five cleared
  // items exercise selecting -- both directions, without inventing extra cases.
  for (const item of BUSINESS_TYPES_SAVE_CYCLE_CASES) {
    const expectedDefault = BUSINESS_TYPES_DEFAULTS.find((d) => d.key === item.key)!.checked;

    test(`${item.tc}: ${item.name} Toggle Persists After Save And Reload`, async ({ locationBusinessTypesPage, dependencyGate }) => {
      dependencyGate(['TC-LOC-BTY-001']);
      test.setTimeout(120_000);

      expect(await locationBusinessTypesPage.isCheckboxChecked(item.key),
        `${item.name} should start at its office default`).toBe(expectedDefault);

      if (expectedDefault) { await locationBusinessTypesPage.uncheckCheckbox(item.key); }
      else { await locationBusinessTypesPage.checkCheckbox(item.key); }
      await expect.poll(() => locationBusinessTypesPage.isSaveEnabled(), { timeout: 5_000 }).toBe(true);

      // Assert the tab's own backend call, not the page address.
      const status = await locationBusinessTypesPage.saveAndAwaitCommit(OFFICE_NO);
      expect(status, 'The business types save should be accepted').toBeLessThan(400);

      await locationBusinessTypesPage.navigateFresh(OFFICE_NO);
      expect(await locationBusinessTypesPage.isCheckboxChecked(item.key),
        `${item.name} should keep the toggled value after a reload`).toBe(!expectedDefault);

      // Restore so the office is left as it was found.
      if (expectedDefault) { await locationBusinessTypesPage.checkCheckbox(item.key); }
      else { await locationBusinessTypesPage.uncheckCheckbox(item.key); }
      await locationBusinessTypesPage.clickSave();
    });
  }

  test('TC-LOC-BTY-013: Reverting A Toggle Re-Disables Save', async ({ locationBusinessTypesPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-BTY-001']);
    await locationBusinessTypesPage.toggleCheckbox('chkBusinessTypeExpoServices');
    await expect.poll(() => locationBusinessTypesPage.isSaveEnabled(), { timeout: 5_000 }).toBe(true);
    await locationBusinessTypesPage.toggleCheckbox('chkBusinessTypeExpoServices');
    await expect.poll(() => locationBusinessTypesPage.isSaveEnabled(), { timeout: 5_000 }).toBe(false);
  });

  test('TC-LOC-BTY-014: Save Dialog Cancel Discards Without Persisting', async ({ locationBusinessTypesPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-BTY-001']);
    test.setTimeout(90_000);
    await locationBusinessTypesPage.toggleCheckbox('chkBusinessTypeExpoServices');
    await locationBusinessTypesPage.clickSaveButton();
    expect(await locationBusinessTypesPage.isSaveDialogVisible()).toBe(true);
    expect(await locationBusinessTypesPage.getSaveDialogHeading()).toBe(SAVE_CHANGES_DIALOG.heading);
    expect(await locationBusinessTypesPage.getSaveDialogBody()).toBe(SAVE_CHANGES_DIALOG.body);
    await locationBusinessTypesPage.clickSaveCancel();
    expect(await locationBusinessTypesPage.isCheckboxChecked('chkBusinessTypeExpoServices'),
      'The pending change should still be shown after cancelling').toBe(true);
    expect(await locationBusinessTypesPage.isSaveEnabled(), 'Save should still be enabled after cancelling').toBe(true);
    await locationBusinessTypesPage.navigateFresh(OFFICE_NO);
    expect(await locationBusinessTypesPage.isCheckboxChecked('chkBusinessTypeExpoServices'),
      'Nothing should have been committed').toBe(false);
  });

  test('TC-LOC-BTY-015: Unsaved Changes Prompt Appears On Navigation Away And Stay Keeps The Edit', async ({ locationBusinessTypesPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-BTY-001']);
    test.setTimeout(90_000);
    await locationBusinessTypesPage.navigateFresh(OFFICE_NO);
    await locationBusinessTypesPage.toggleCheckbox('chkBusinessTypeExpoServices');
    await expect.poll(() => locationBusinessTypesPage.isSaveEnabled(), { timeout: 5_000 }).toBe(true);
    await locationBusinessTypesPage.clickSidebarHome();
    expect(await locationBusinessTypesPage.isUnsavedDialogVisible()).toBe(true);
    expect(await locationBusinessTypesPage.getUnsavedDialogHeading()).toBe(UNSAVED_CHANGES_DIALOG.heading);
    expect(await locationBusinessTypesPage.getUnsavedDialogBody()).toBe(UNSAVED_CHANGES_DIALOG.body);
    await locationBusinessTypesPage.clickUnsavedStay();
    expect(locationBusinessTypesPage.getCurrentUrl()).toContain('/settings/location');
    expect(await locationBusinessTypesPage.isCheckboxChecked('chkBusinessTypeExpoServices'),
      'Staying should keep the pending edit').toBe(true);
  });

  test('TC-LOC-BTY-016: Unsaved Changes Prompt Discard Leaves The Page And Drops The Edit', async ({ locationBusinessTypesPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-BTY-001']);
    test.setTimeout(90_000);
    await locationBusinessTypesPage.navigateFresh(OFFICE_NO);
    await locationBusinessTypesPage.toggleCheckbox('chkBusinessTypeExpoServices');
    await expect.poll(() => locationBusinessTypesPage.isSaveEnabled(), { timeout: 5_000 }).toBe(true);
    await locationBusinessTypesPage.clickSidebarHome();
    await locationBusinessTypesPage.clickUnsavedDiscard();
    await expect.poll(() => locationBusinessTypesPage.getCurrentUrl(), { timeout: 10_000 }).toContain('/home');
    await locationBusinessTypesPage.navigateFresh(OFFICE_NO);
    expect(await locationBusinessTypesPage.isCheckboxChecked('chkBusinessTypeExpoServices'),
      'The discarded edit should not have been committed').toBe(false);
  });

  test('TC-LOC-BTY-017: Sub-Tab Switch With Unsaved Changes Is Silent And Resets The Checkbox While Save Stays Enabled', async ({ locationBusinessTypesPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-BTY-001']);
    test.setTimeout(90_000);
    await locationBusinessTypesPage.toggleCheckbox('chkBusinessTypeInHouse');
    await expect.poll(() => locationBusinessTypesPage.isCheckboxChecked('chkBusinessTypeInHouse'), { timeout: 5_000 }).toBe(true);
    await expect.poll(() => locationBusinessTypesPage.isSaveEnabled(), { timeout: 5_000 }).toBe(true);

    await locationBusinessTypesPage.clickLocalInformationTab();
    expect(await locationBusinessTypesPage.isSaveEnabled(),
      'Switching sub-tab should not clear the pending-change state').toBe(true);

    await locationBusinessTypesPage.navigateToBusinessTypesTab(OFFICE_NO);
    // Asserts what this surface actually does, which is not what the neighbouring sub-tab does: the
    // checkbox shows its saved value again while Save stays enabled, so the visible state and the
    // pending-change state disagree. Recorded as a known defect; this test pins the behaviour so a
    // future change to it is noticed rather than silently absorbed.
    expect(await locationBusinessTypesPage.isCheckboxChecked('chkBusinessTypeInHouse'),
      'On returning, the checkbox shows the saved value again').toBe(false);
    expect(await locationBusinessTypesPage.isSaveEnabled(),
      'Save remains enabled even though nothing is visibly changed').toBe(true);
  });

  test('TC-LOC-BTY-018: Multiple Business Type Changes Save Together', async ({ locationBusinessTypesPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-BTY-001']);
    test.setTimeout(120_000);
    await locationBusinessTypesPage.checkCheckbox('chkBusinessTypeExpoServices');
    await locationBusinessTypesPage.checkCheckbox('chkBusinessTypeInHouse');
    await locationBusinessTypesPage.uncheckCheckbox('chkBusinessTypeProduction');
    await expect.poll(() => locationBusinessTypesPage.isSaveEnabled(), { timeout: 5_000 }).toBe(true);

    const status = await locationBusinessTypesPage.saveAndAwaitCommit(OFFICE_NO);
    expect(status, 'The combined save should be accepted').toBeLessThan(400);

    await locationBusinessTypesPage.navigateFresh(OFFICE_NO);
    expect(await locationBusinessTypesPage.isCheckboxChecked('chkBusinessTypeExpoServices')).toBe(true);
    expect(await locationBusinessTypesPage.isCheckboxChecked('chkBusinessTypeInHouse')).toBe(true);
    expect(await locationBusinessTypesPage.isCheckboxChecked('chkBusinessTypeProduction')).toBe(false);

    // Restore all three so the office is left as it was found.
    await locationBusinessTypesPage.uncheckCheckbox('chkBusinessTypeExpoServices');
    await locationBusinessTypesPage.uncheckCheckbox('chkBusinessTypeInHouse');
    await locationBusinessTypesPage.checkCheckbox('chkBusinessTypeProduction');
    await locationBusinessTypesPage.clickSave();
  });

});
