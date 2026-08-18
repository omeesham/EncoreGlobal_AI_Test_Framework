import { test, expect } from '../../src/fixtures/pages.fixture';
import { CURRENCY_COLUMN_HEADERS, UNSELECTED_CURRENCY_STATES, MERCHANT_DATA, DEFAULT_CURRENCY, ALTERNATE_USD_MERCHANT } from '../../src/data/locations/location-currency';
import { OFFICE_NO } from '../../src/data/common';

test.describe('Location Currency @locations @currency', () => {

  // Per-test navigation guard.
  // DOM-presence beats url.includes (shared `settings/location` URL across sub-tabs).
  test.beforeEach(async ({ locationCurrencyPage }) => {
    test.setTimeout(60_000);
    if (!(await locationCurrencyPage.isOnCurrencyTab())) {
      await locationCurrencyPage.navigateToCurrencyTab(OFFICE_NO);
    }
    // Enforce the known default grid state per-test so a leaked/dirty start from a
    // prior crash, retry, or parallel run cannot make a real change read as no-change.
    await locationCurrencyPage.ensureDefaultState();
  });

  test('TC-LOC-CUR-028: Reverting a currency selection re-disables Save (no net change)', async ({ locationCurrencyPage, dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(60_000);
    // From the enforced default, selecting CAD is a real change -> Save enables.
    expect(await locationCurrencyPage.isSaveEnabled()).toBe(false);
    await locationCurrencyPage.checkCheckbox('chkCADSelected');
    await expect.poll(() => locationCurrencyPage.isSaveEnabled(), { timeout: 5_000 }).toBe(true);
    // Reverting CAD back to its saved (unselected) state is a no-net-change -> Save re-disables.
    await locationCurrencyPage.uncheckCheckbox('chkCADSelected');
    await expect.poll(() => locationCurrencyPage.isSaveEnabled(), { timeout: 5_000 }).toBe(false);
  });

  test('TC-LOC-CUR-001: Navigate to Currency tab; 3 rows, 4 column headers visible', async ({ locationCurrencyPage, dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(60_000);
    await locationCurrencyPage.navigateToCurrencyTab(OFFICE_NO);
    expect(locationCurrencyPage.getCurrentUrl(), 'Should be on the Location Settings page').toContain(`locations/${OFFICE_NO}/settings`);
 // The per-test beforeEach already enforces the USD-default baseline (ensureDefaultState), so this
 // test only verifies the grid structure — the inline re-baseline here was a duplicate of that.
    expect(await locationCurrencyPage.getGridRowCount()).toBe(3);
    expect(await locationCurrencyPage.getColumnHeaders(), 'Currency grid should display all expected column headers').toEqual(CURRENCY_COLUMN_HEADERS);
  });

  test('TC-LOC-CUR-002: USD default -- Selected, Is Default checked; merchant set', async ({ locationCurrencyPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-CUR-001']);
 // Reload to read server-persisted state after the CUR-001 save (not stale DOM).
 // CUR-001's checkCheckbox may not have dirtied the form if USD was already checked,
 // and Angular may not re-render checkbox state after save without a reload.
    await locationCurrencyPage.navigateToCurrencyTab(OFFICE_NO);
    expect((await locationCurrencyPage.getCheckboxState('chkUSDSelected')).checked).toBe(true);
    expect((await locationCurrencyPage.getCheckboxState('chkUSDIsDefault')).checked).toBe(true);
    expect(await locationCurrencyPage.getMerchantValue('drpUSDMerchant')).toContain(MERCHANT_DATA.usd.id);
  });

  for (const cur of UNSELECTED_CURRENCY_STATES) {
    test(`TC-LOC-CUR-${cur.tcId}: ${cur.currency} default -- unselected, Is Default disabled`, async ({ locationCurrencyPage, dependencyGate }) => {
      dependencyGate(['TC-LOC-CUR-001']);
      expect((await locationCurrencyPage.getCheckboxState(cur.selectedKey)).checked).toBe(false);
      expect((await locationCurrencyPage.getCheckboxState(cur.isDefaultKey)).disabled).toBe(true);
    });
  }

  test('TC-LOC-CUR-018: Currency Code column is read-only', async ({ locationCurrencyPage, dependencyGate }) => {
    dependencyGate([]);
    expect(await locationCurrencyPage.isCurrencyCodeReadOnly(DEFAULT_CURRENCY)).toBe(true);
  });

  test('TC-LOC-CUR-019: Merchant dropdown accessible for unselected currency', async ({ locationCurrencyPage, dependencyGate }) => {
    dependencyGate([]);
    expect(await locationCurrencyPage.isMerchantDropdownAccessible('drpCADMerchant')).toBe(true);
  });

  test('TC-LOC-CUR-015: Save disabled initially; enabled after field change', async ({ locationCurrencyPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-CUR-001']);
    expect(await locationCurrencyPage.isSaveEnabled()).toBe(false);
    await locationCurrencyPage.checkCheckbox('chkCADSelected');
    expect(await locationCurrencyPage.isSaveEnabled()).toBe(true);
    await locationCurrencyPage.uncheckCheckbox('chkCADSelected');
  });

  test('TC-LOC-CUR-005: Selecting currency enables its Is Default checkbox', async ({ locationCurrencyPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-CUR-001']);
    expect((await locationCurrencyPage.getCheckboxState('chkCADIsDefault')).disabled).toBe(true);
    await locationCurrencyPage.checkCheckbox('chkCADSelected');
 // selecting currency enables Is Default async — poll for disabled state.
    await expect.poll(
      () => locationCurrencyPage.getCheckboxState('chkCADIsDefault').then(s => s.disabled),
      { timeout: 5_000 },
    ).toBe(false);
    await locationCurrencyPage.uncheckCheckbox('chkCADSelected');
  });

  test('TC-LOC-CUR-007: Unselecting currency disables and unchecks Is Default', async ({ locationCurrencyPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-CUR-001']);
    await locationCurrencyPage.checkCheckbox('chkCADSelected');
    await locationCurrencyPage.checkCheckbox('chkCADIsDefault');
    await locationCurrencyPage.uncheckCheckbox('chkCADSelected');
    const state = await locationCurrencyPage.getCheckboxState('chkCADIsDefault');
    expect(state.disabled).toBe(true);
    expect(state.checked).toBe(false);
 // Restore: USD Is Default was auto-unchecked when CAD was set as default -- restore it
    await locationCurrencyPage.checkCheckbox('chkUSDIsDefault');
    await locationCurrencyPage.clickSave();
  });

  test('TC-LOC-CUR-006: Single default rule -- setting CAD default auto-unchecks USD default', async ({ locationCurrencyPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-CUR-001']);
    expect((await locationCurrencyPage.getCheckboxState('chkUSDIsDefault')).checked).toBe(true);
    await locationCurrencyPage.checkCheckbox('chkCADSelected');
    await locationCurrencyPage.checkCheckbox('chkCADIsDefault');
    expect((await locationCurrencyPage.getCheckboxState('chkUSDIsDefault')).checked).toBe(false);
 // Cleanup: uncheck CAD (disables+clears CAD IsDefault), restore USD IsDefault, save
    await locationCurrencyPage.uncheckCheckbox('chkCADSelected');
    await locationCurrencyPage.checkCheckbox('chkUSDIsDefault');
    await locationCurrencyPage.clickSave();
  });

  test('TC-LOC-CUR-008: USD Merchant dropdown shows 2 options', async ({ locationCurrencyPage, dependencyGate }) => {
    dependencyGate([]);
    const options = await locationCurrencyPage.getMerchantOptions('drpUSDMerchant');
    expect(options).toHaveLength(2);
    expect(options.some(o => o.includes(MERCHANT_DATA.usd.id))).toBe(true);
    expect(options.some(o => o.includes(MERCHANT_DATA.bahamas.id))).toBe(true);
  });

  test('TC-LOC-CUR-009: CAD Merchant dropdown shows 1 option', async ({ locationCurrencyPage, dependencyGate }) => {
    dependencyGate([]);
    const options = await locationCurrencyPage.getMerchantOptions('drpCADMerchant');
    expect(options).toHaveLength(1);
    expect(options[0]).toContain(MERCHANT_DATA.canada.id);
  });

  test('TC-LOC-CUR-010: MXN Merchant dropdown shows No Matches Found', async ({ locationCurrencyPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-CUR-001']);
    await locationCurrencyPage.checkCheckbox('chkMXNSelected');
    expect((await locationCurrencyPage.getCheckboxState('chkMXNIsDefault')).disabled).toBe(false);
    await locationCurrencyPage.checkCheckbox('chkMXNIsDefault');
    expect((await locationCurrencyPage.getCheckboxState('chkMXNIsDefault')).checked).toBe(true);
    expect(await locationCurrencyPage.isMerchantNoMatchesFound('drpMXNMerchant')).toBe(true);
    await locationCurrencyPage.uncheckCheckbox('chkMXNSelected');
    // Making MXN the default cleared USD's default; unchecking MXN then leaves the office with no
    // default currency. Restore USD as the default before saving so this test doesn't persist a
    // no-default state onto the shared office for whatever runs next.
    await locationCurrencyPage.checkCheckbox('chkUSDIsDefault');
    await locationCurrencyPage.clickSave();
  });

  test('TC-LOC-CUR-011: Select merchant for CAD currency', async ({ locationCurrencyPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-CUR-001']);
    await locationCurrencyPage.checkCheckbox('chkCADSelected');
    await locationCurrencyPage.selectMerchantOption('drpCADMerchant', MERCHANT_DATA.canada.display);
    expect(await locationCurrencyPage.getMerchantValue('drpCADMerchant')).toContain(MERCHANT_DATA.canada.id);
    await locationCurrencyPage.uncheckCheckbox('chkCADSelected');
    await locationCurrencyPage.clickSave();
  });

  test('TC-LOC-CUR-012: Merchant value persists when currency is unselected', async ({ locationCurrencyPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-CUR-001']);
    await locationCurrencyPage.checkCheckbox('chkCADSelected');
    await locationCurrencyPage.selectMerchantOption('drpCADMerchant', MERCHANT_DATA.canada.display);
    await locationCurrencyPage.uncheckCheckbox('chkCADSelected');
    // In-memory: unchecking the currency must not clear its merchant selection in the form.
    expect(await locationCurrencyPage.getMerchantValue('drpCADMerchant')).toContain(MERCHANT_DATA.canada.id);
    await locationCurrencyPage.clickSave();
    // Persistence: reload and confirm the merchant survived the save → reload round trip
    // (the title claims it PERSISTS — an in-memory-only check could not prove that).
    await locationCurrencyPage.reloadAndNavigateToCurrencyTab();
    expect(await locationCurrencyPage.getMerchantValue('drpCADMerchant')).toContain(MERCHANT_DATA.canada.id);
  });

  test('TC-LOC-CUR-016: USD Merchant can be changed to alternate option', async ({ locationCurrencyPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-CUR-001']);
    expect(await locationCurrencyPage.getMerchantValue('drpUSDMerchant')).toContain(MERCHANT_DATA.usd.id);
    await locationCurrencyPage.selectMerchantOption('drpUSDMerchant', MERCHANT_DATA.bahamas.display);
    expect(await locationCurrencyPage.getMerchantValue('drpUSDMerchant')).toContain(MERCHANT_DATA.bahamas.id);
    await locationCurrencyPage.selectMerchantOption('drpUSDMerchant', MERCHANT_DATA.usd.display);
    await locationCurrencyPage.clickSave();
  });

  test('TC-LOC-CUR-013: Validation -- at least one currency must be selected', async ({ locationCurrencyPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-CUR-001']);
 // Uncheck USD (the only selected currency) -- app disables Save to enforce minimum-1-currency constraint
 // NOTE: unchecking USD also auto-unchecks USD IsDefault; both must be restored
    await locationCurrencyPage.uncheckCheckbox('chkUSDSelected');
    expect((await locationCurrencyPage.getCheckboxState('chkUSDIsDefault')).disabled).toBe(true);
    const saveBlocked = !(await locationCurrencyPage.isSaveEnabled());
 // Full restore: re-select USD AND re-apply IsDefault so TC-014+ start clean
    await locationCurrencyPage.checkCheckbox('chkUSDSelected');
    await locationCurrencyPage.checkCheckbox('chkUSDIsDefault');
    await locationCurrencyPage.clickSave();
    expect(saveBlocked, 'Save must be blocked when no currency is selected').toBe(true);
  });

  test('TC-LOC-CUR-014: Save without default currency shows confirmation dialog (not an error)', async ({ locationCurrencyPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-CUR-001']);
    await locationCurrencyPage.uncheckCheckbox('chkUSDIsDefault');
    const dialogType = await locationCurrencyPage.clickSaveAndCaptureDialog();
    expect(dialogType).toBe('save-changes');
    await locationCurrencyPage.cancelCurrentDialog();
    await locationCurrencyPage.checkCheckbox('chkUSDIsDefault');
    await locationCurrencyPage.clickSave();
  });

  test('TC-LOC-CUR-017: Multiple currencies selected without default -- save confirmation shown', async ({ locationCurrencyPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-CUR-001']);
    await locationCurrencyPage.checkCheckbox('chkCADSelected');
    await locationCurrencyPage.uncheckCheckbox('chkUSDIsDefault');
    const dialogType = await locationCurrencyPage.clickSaveAndCaptureDialog();
    expect(dialogType).toBe('save-changes');
    await locationCurrencyPage.cancelCurrentDialog();
    await locationCurrencyPage.uncheckCheckbox('chkCADSelected');
    await locationCurrencyPage.checkCheckbox('chkUSDIsDefault');
    await locationCurrencyPage.clickSave();
  });

  test('TC-LOC-CUR-020: All three currencies can be selected simultaneously', async ({ locationCurrencyPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-CUR-001']);
    await locationCurrencyPage.checkCheckbox('chkCADSelected');
    await locationCurrencyPage.checkCheckbox('chkMXNSelected');
    expect((await locationCurrencyPage.getCheckboxState('chkUSDSelected')).checked).toBe(true);
    expect((await locationCurrencyPage.getCheckboxState('chkCADSelected')).checked).toBe(true);
    expect((await locationCurrencyPage.getCheckboxState('chkMXNSelected')).checked).toBe(true);
    await locationCurrencyPage.uncheckCheckbox('chkCADSelected');
    await locationCurrencyPage.uncheckCheckbox('chkMXNSelected');
    await locationCurrencyPage.clickSave();
  });

 // ROUND-TRIP PERSISTENCE (P0)

  test('TC-LOC-CUR-021: Selected currency persists after save and reload', async ({ locationCurrencyPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-CUR-001']);
    test.setTimeout(60_000);
    await locationCurrencyPage.reloadAndNavigateToCurrencyTab();
    await locationCurrencyPage.checkCheckbox('chkCADSelected');
    expect(await locationCurrencyPage.isSaveEnabled()).toBe(true);
    const result = await locationCurrencyPage.clickSave();
    expect(result.success, 'Save should complete successfully').toBe(true);
    expect(await locationCurrencyPage.isSaveEnabled()).toBe(false);
    await locationCurrencyPage.reloadAndNavigateToCurrencyTab();
    expect((await locationCurrencyPage.getCheckboxState('chkCADSelected')).checked, 'Selected currency should persist after reload').toBe(true);
    await locationCurrencyPage.uncheckCheckbox('chkCADSelected');
    await locationCurrencyPage.clickSave();
  });

  test('TC-LOC-CUR-022: Merchant change persists after save and reload', async ({ locationCurrencyPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-CUR-001']);
    test.setTimeout(60_000);
    await locationCurrencyPage.reloadAndNavigateToCurrencyTab();
    await locationCurrencyPage.selectMerchantOption('drpUSDMerchant', ALTERNATE_USD_MERCHANT.display);
    expect(await locationCurrencyPage.getMerchantValue('drpUSDMerchant')).toContain(ALTERNATE_USD_MERCHANT.id);
    expect(await locationCurrencyPage.isSaveEnabled()).toBe(true);
    const result = await locationCurrencyPage.clickSave();
    expect(result.success).toBe(true);
    expect(await locationCurrencyPage.isSaveEnabled()).toBe(false);
    await locationCurrencyPage.reloadAndNavigateToCurrencyTab();
    expect(await locationCurrencyPage.getMerchantValue('drpUSDMerchant')).toContain(ALTERNATE_USD_MERCHANT.id);
    await locationCurrencyPage.selectMerchantOption('drpUSDMerchant', MERCHANT_DATA.usd.display);
    await locationCurrencyPage.clickSave();
  });

  test('TC-LOC-CUR-023: IsDefault change persists after save and reload (cascade)', async ({ locationCurrencyPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-CUR-001']);
    test.setTimeout(60_000);
    await locationCurrencyPage.reloadAndNavigateToCurrencyTab();
    // Setting CAD as default auto-unchecks USD's IsDefault
    await locationCurrencyPage.checkCheckbox('chkCADSelected');
    await locationCurrencyPage.checkCheckbox('chkCADIsDefault');
    expect((await locationCurrencyPage.getCheckboxState('chkUSDIsDefault')).checked).toBe(false);
    expect(await locationCurrencyPage.isSaveEnabled()).toBe(true);
    const result = await locationCurrencyPage.clickSave();
    expect(result.success).toBe(true);
    expect(await locationCurrencyPage.isSaveEnabled()).toBe(false);
    await locationCurrencyPage.reloadAndNavigateToCurrencyTab();
    expect((await locationCurrencyPage.getCheckboxState('chkCADIsDefault')).checked).toBe(true);
    expect((await locationCurrencyPage.getCheckboxState('chkUSDIsDefault')).checked).toBe(false);
 // Cleanup: uncheck CAD Selected (auto-disables CAD IsDefault) → restore USD IsDefault → save
    await locationCurrencyPage.uncheckCheckbox('chkCADSelected');
    await locationCurrencyPage.checkCheckbox('chkUSDIsDefault');
    await locationCurrencyPage.clickSave();
  });

  test('TC-LOC-CUR-024: Combined changes persist after single save and reload', async ({ locationCurrencyPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-CUR-001']);
    test.setTimeout(60_000);
    await locationCurrencyPage.reloadAndNavigateToCurrencyTab();
    await locationCurrencyPage.checkCheckbox('chkCADSelected');
    await locationCurrencyPage.selectMerchantOption('drpUSDMerchant', ALTERNATE_USD_MERCHANT.display);
    expect(await locationCurrencyPage.isSaveEnabled()).toBe(true);
    const result = await locationCurrencyPage.clickSave();
    expect(result.success).toBe(true);
    expect(await locationCurrencyPage.isSaveEnabled()).toBe(false);
    await locationCurrencyPage.reloadAndNavigateToCurrencyTab();
    expect((await locationCurrencyPage.getCheckboxState('chkCADSelected')).checked).toBe(true);
    expect(await locationCurrencyPage.getMerchantValue('drpUSDMerchant')).toContain(ALTERNATE_USD_MERCHANT.id);
    await locationCurrencyPage.uncheckCheckbox('chkCADSelected');
    await locationCurrencyPage.selectMerchantOption('drpUSDMerchant', MERCHANT_DATA.usd.display);
    await locationCurrencyPage.clickSave();
  });

 // STATE TRANSITION (P1-P2)

  test('TC-LOC-CUR-025: Cancel save discards changes — reload shows original state', async ({ locationCurrencyPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-CUR-001']);
    test.setTimeout(60_000);
    await locationCurrencyPage.reloadAndNavigateToCurrencyTab();
    await locationCurrencyPage.checkCheckbox('chkCADSelected');
    expect(await locationCurrencyPage.isSaveEnabled()).toBe(true);
    const dialogType = await locationCurrencyPage.clickSaveAndCaptureDialog();
    expect(dialogType).toBe('save-changes');
    await locationCurrencyPage.cancelCurrentDialog();
 // Reload — change should NOT have persisted (cancel = discard)
    await locationCurrencyPage.reloadAndNavigateToCurrencyTab();
    expect((await locationCurrencyPage.getCheckboxState('chkCADSelected')).checked).toBe(false);
 // No cleanup needed — cancel means nothing was saved
  });

  test('TC-LOC-CUR-026: Beforeunload dialog fires when form is dirty', async ({ locationCurrencyPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-CUR-001']);
    test.setTimeout(60_000);
    await locationCurrencyPage.reloadAndNavigateToCurrencyTab();
    await locationCurrencyPage.checkCheckbox('chkCADSelected');
    expect(await locationCurrencyPage.isSaveEnabled()).toBe(true);
 // Trigger reload — beforeunload should fire and dismiss keeps us on page
    const dialogFired = await locationCurrencyPage.triggerBeforeunloadAndStay();
    expect(dialogFired).toBe(true);
    await locationCurrencyPage.reloadAndNavigateToCurrencyTab();
  });

 // EDGE CASE (P2)

  test('TC-LOC-CUR-027: No-default state persists after save and reload', async ({ locationCurrencyPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-CUR-001']);
    test.setTimeout(60_000);
    await locationCurrencyPage.reloadAndNavigateToCurrencyTab();
    await locationCurrencyPage.uncheckCheckbox('chkUSDIsDefault');
    expect((await locationCurrencyPage.getCheckboxState('chkUSDIsDefault')).checked).toBe(false);
    expect(await locationCurrencyPage.isSaveEnabled()).toBe(true);
    const result = await locationCurrencyPage.clickSave();
    expect(result.success).toBe(true);
    expect(await locationCurrencyPage.isSaveEnabled()).toBe(false);
    await locationCurrencyPage.reloadAndNavigateToCurrencyTab();
    expect((await locationCurrencyPage.getCheckboxState('chkUSDIsDefault')).checked).toBe(false);
    await locationCurrencyPage.checkCheckbox('chkUSDIsDefault');
    await locationCurrencyPage.clickSave();
  });

});
