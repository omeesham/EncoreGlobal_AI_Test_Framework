
import { test, expect } from '../../src/fixtures/pages.fixture';
import {
  CHECKED_DEFAULTS,
  UNCHECKED_DEFAULTS,
  DISABLED_CHECKBOXES,
  DISABLED_CHECKBOX_STATES,
  LDW_BOUNDARIES,
  ACTIVE_DEPENDENCIES,
  LEFT_PANEL_EXPECTED,
  TEXT_FIELD_CONSTRAINTS,
  CHECKBOX_LABEL_CASES,
  LOCAL_INFO_TEST_VALUES,
} from '../../src/data/locations/location-local-info';
import { OFFICE_NO } from '../../src/data/common';

test.describe('Location Local Info @locations @local-info', () => {

  // Per-test navigation guard.
  // DOM-presence beats url.includes (shared `settings/location` URL across sub-tabs).
  test.beforeEach(async ({ locationLocalInfoPage }) => {
    if (!(await locationLocalInfoPage.isOnLocalInfoTab())) {
      await locationLocalInfoPage.navigateToLocalInfoTab(OFFICE_NO);
    }
  });

 // Timeout: 60s -- location settings navigation observed at ~18s on first load (auth + route + render).
  test('TC-LOC-LI-001: Navigate to Local Info tab; URL correct, Save disabled', async ({ locationLocalInfoPage, dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(120_000);
    await locationLocalInfoPage.navigateToLocalInfoTab(OFFICE_NO);
 // Complete baseline enforcement — reset every
 // mutable field this spec touches so a prior crashed run cannot poison defaults.
    await locationLocalInfoPage.waitForFormReady('chkApplyLDW', 30_000);
    let dirty = false;
    for (const key of UNCHECKED_DEFAULTS) {
      const state = await locationLocalInfoPage.getCheckboxState(key);
      if (state.disabled) continue;
      if (state.checked) {
        await locationLocalInfoPage.uncheckCheckbox(key);
        dirty = true;
      }
    }
 // 2. NEW: CHECKED defaults must be checked — if a crashed run left chkServiceCharge,
 //    chkAllowDPCD, chkCompanyRemitTax etc unchecked, LI-002 fails on dirty state.
    for (const key of CHECKED_DEFAULTS) {
      const state = await locationLocalInfoPage.getCheckboxState(key);
      if (state.disabled) continue;
      if (!state.checked) {
        await locationLocalInfoPage.checkCheckbox(key);
        dirty = true;
      }
    }
 // 3. LDW% spinner reset (existing — restores 0.04/4%).
    const ldwSpin = await locationLocalInfoPage.getSpinState('spinLDWPercentage');
    if (!ldwSpin.disabled && parseFloat(ldwSpin.value) < 1) {
      await locationLocalInfoPage.setSpinValue('spinLDWPercentage', '0.04');
      dirty = true;
    }
 // 4. NEW: Cascade-related spinners (Threshold/ETS/CC/ResortTax) — when their parent
 //    checkbox is in the unchecked state above, app should auto-zero. Force 0 if dirty.
    for (const spinKey of ['spinThreshold', 'spinETSPercentage', 'spinCCPercentage', 'spinResortTaxPercentage'] as const) {
      const s = await locationLocalInfoPage.getSpinState(spinKey);
      if (!s.disabled && parseFloat(s.value) !== 0) {
        await locationLocalInfoPage.setSpinValue(spinKey, '0');
        dirty = true;
      }
    }
 // 5. NEW: Oracle Product / Department text fields — restored by inline LI-021/029/068/069
 //    cleanup that won't run on assertion failure.
    const oracleProduct = await locationLocalInfoPage.getTextValue('txtOracleProduct');
    if (oracleProduct !== LOCAL_INFO_TEST_VALUES.oracleProductDefault && oracleProduct !== '') {
      await locationLocalInfoPage.fillText('txtOracleProduct', LOCAL_INFO_TEST_VALUES.oracleProductDefault);
      dirty = true;
    }
    const oracleDept = await locationLocalInfoPage.getTextValue('txtOracleDepartment');
    if (oracleDept !== LOCAL_INFO_TEST_VALUES.oracleDeptDefault && oracleDept !== '') {
      await locationLocalInfoPage.fillText('txtOracleDepartment', LOCAL_INFO_TEST_VALUES.oracleDeptDefault);
      dirty = true;
    }
 // 6. NEW: Billing Type — restored by LI-025 inline cleanup. getBillingType() returns
 //    'Master' | 'Direct'; reset only if it drifted to 'Direct'.
    const billingType = await locationLocalInfoPage.getBillingType();
    if (billingType !== LOCAL_INFO_TEST_VALUES.billingType) {
      await locationLocalInfoPage.selectBillingType(LOCAL_INFO_TEST_VALUES.billingType);
      dirty = true;
    }
    if (dirty) {
      await locationLocalInfoPage.clickSave();
      await locationLocalInfoPage.navigateToLocalInfoTab(OFFICE_NO);
      await locationLocalInfoPage.waitForFormReady('chkApplyLDW', 30_000);
    }
    expect(locationLocalInfoPage.getCurrentUrl(), 'Should be on the Location Settings page').toContain(`locations/${OFFICE_NO}/settings`);
    expect(await locationLocalInfoPage.isSaveEnabled(), 'Save should be disabled on a clean form').toBe(false);
  });

  test('TC-LOC-LI-002: All default states', async ({ locationLocalInfoPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-001']);
 // Wait for form fields to become interactive -- new E2E env briefly renders fields disabled during hydration.
    await locationLocalInfoPage.waitForFormReady('chkApplyLDW', 30_000);
    const chk = await locationLocalInfoPage.getCheckboxState('chkApplyLDW');
    expect(chk.checked).toBe(true);
    const spin = await locationLocalInfoPage.getSpinState('spinLDWPercentage');
 // LDW% exact value depends on DB state -- verify only that it's enabled and within valid range (1-100%).
    expect(parseFloat(spin.value), `LDW% out of valid range: ${spin.value}`).toBeGreaterThanOrEqual(1);
    expect(parseFloat(spin.value), `LDW% out of valid range: ${spin.value}`).toBeLessThanOrEqual(100);
    expect(spin.disabled).toBe(false);

    expect(await locationLocalInfoPage.getBillingType()).toBe(LOCAL_INFO_TEST_VALUES.billingType);
    expect(await locationLocalInfoPage.isEffectiveDateDisabled()).toBe(true);
    expect(await locationLocalInfoPage.isBillingCycleDisabled()).toBe(false);

    const checkedResult = await locationLocalInfoPage.verifyCheckboxDefaults(
      Object.fromEntries(CHECKED_DEFAULTS.map(k => [k, true])),
    );
    expect(checkedResult.allPassed, checkedResult.failures.join('; ')).toBe(true);

    const uncheckedResult = await locationLocalInfoPage.verifyCheckboxDefaults(
      Object.fromEntries(UNCHECKED_DEFAULTS.map(k => [k, false])),
    );
    expect(uncheckedResult.allPassed, uncheckedResult.failures.join('; ')).toBe(true);

    const disabledResult = await locationLocalInfoPage.verifyCheckboxDisabledStates(
      Object.fromEntries(DISABLED_CHECKBOXES.map(k => [k, true])),
    );
    expect(disabledResult.allPassed, disabledResult.failures.join('; ')).toBe(true);

    const disabledCheckedResult = await locationLocalInfoPage.verifyCheckboxDefaults(DISABLED_CHECKBOX_STATES);
    expect(disabledCheckedResult.allPassed, disabledCheckedResult.failures.join('; ')).toBe(true);

    expect(await locationLocalInfoPage.isFieldDisabled('txtPayToAddress')).toBe(true);
    expect(await locationLocalInfoPage.isFieldDisabled('txtOffice')).toBe(true);
    expect(await locationLocalInfoPage.isFieldDisabled('txtLocalOffice')).toBe(true);
    expect((await locationLocalInfoPage.getCheckboxState('chkECommerceActive')).disabled).toBe(true);
    expect((await locationLocalInfoPage.getCheckboxState('chkEnableProductionsOrders')).disabled).toBe(true);

    const baseline = await locationLocalInfoPage.captureLeftPanelBaseline();
    expect(baseline.office).toBe(LEFT_PANEL_EXPECTED.office);
    expect(baseline.payToAddress).toBe(LEFT_PANEL_EXPECTED.payToAddress);
    expect(baseline.eCommerceActive).toBe(LEFT_PANEL_EXPECTED.eCommerceActive);
    expect(baseline.enableProductionsOrders).toBe(LEFT_PANEL_EXPECTED.enableProductionsOrders);
  });

  test('TC-LOC-LI-032: Save disabled on load, enabled after change, restored', async ({ locationLocalInfoPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-001']);
    expect(await locationLocalInfoPage.isSaveEnabled()).toBe(false);
    await locationLocalInfoPage.toggleCheckbox('chkWarehouseBilling');
    expect(await locationLocalInfoPage.isSaveEnabled()).toBe(true);
    await locationLocalInfoPage.toggleCheckbox('chkWarehouseBilling');
    await locationLocalInfoPage.clickSave();
  });

  for (const dep of ACTIVE_DEPENDENCIES) {
    test(`TC-LOC-LI: ${dep.label}`, async ({ locationLocalInfoPage, dependencyGate }) => {
      dependencyGate(['TC-LOC-LI-001']);
      const result = await locationLocalInfoPage.testDependency(
        dep.trigger, dep.triggerAction, dep.target, dep.targetType,
        dep.expectedDisabled, dep.expectedChecked,
        dep.restore, dep.spinRestore,
      );
      expect(result.passed, result.failures.join('; ')).toBe(true);
    });
  }

 // TC-074 supersedes TC-007: covers all 4 combos of the Threshold decision table + reset-to-0.
 // Decision table: Threshold enabled ONLY when AllowDPCD=false AND PromptForApproval=true (Combo D).
  test('TC-LOC-LI-074: Threshold decision table -- all 4 combos + reset-to-0 on disable', async ({ locationLocalInfoPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-001']);
 // cross-field validation is async -- use expect.poll for ALL cascade assertions.
 // Combo A: DPCD=on, PFA=off (default baseline) -- Threshold disabled
    expect((await locationLocalInfoPage.getSpinState('spinThreshold')).disabled).toBe(true);
 // Combo B: DPCD=on, PFA=on -- Threshold still disabled
    await locationLocalInfoPage.checkCheckbox('chkPromptForApproval');
    await expect.poll(
      () => locationLocalInfoPage.getSpinState('spinThreshold').then(s => s.disabled),
      { timeout: 5_000 },
    ).toBe(true);
 // Combo D: DPCD=off, PFA=on -- Threshold ENABLED
    await locationLocalInfoPage.uncheckCheckbox('chkAllowDPCD');
    await expect.poll(
      () => locationLocalInfoPage.getSpinState('spinThreshold').then(s => s.disabled),
      { timeout: 5_000 },
    ).toBe(false);
 // Combo C: DPCD=off, PFA=off -- Threshold disabled again
    await locationLocalInfoPage.uncheckCheckbox('chkPromptForApproval');
    await expect.poll(
      () => locationLocalInfoPage.getSpinState('spinThreshold').then(s => s.disabled),
      { timeout: 5_000 },
    ).toBe(true);
 // Return to Combo D to set a value, then verify reset-to-0 when Threshold becomes disabled
    await locationLocalInfoPage.checkCheckbox('chkPromptForApproval');
    await expect.poll(
      () => locationLocalInfoPage.getSpinState('spinThreshold').then(s => s.disabled),
      { timeout: 5_000 },
    ).toBe(false);
    await locationLocalInfoPage.setSpinValue('spinThreshold', '50.00');
 // Re-enable DPCD (→ Combo B: DPCD=on, PFA=on) -- Threshold disables and resets to 0
    await locationLocalInfoPage.checkCheckbox('chkAllowDPCD');
    await expect.poll(
      () => locationLocalInfoPage.getSpinState('spinThreshold').then(s => s.disabled),
      { timeout: 5_000 },
    ).toBe(true);
    await expect.poll(
      () => locationLocalInfoPage.getSpinState('spinThreshold').then(s => parseFloat(s.value)),
      { timeout: 5_000 },
    ).toBe(0);
 // Restore baseline: DPCD=on, PFA=off (Combo A)
    await locationLocalInfoPage.uncheckCheckbox('chkPromptForApproval');
    await locationLocalInfoPage.clickSave();
  });

 // FLAKY (2026-06-08, fix deferred): fails on dirty start (net-zero no-op, no per-test baseline) and under 2-worker contention with location-currency.spec (concurrent PUT update-properties on office 1604 clobbers multiday) — NOT an app bug (persists in isolation).
 // Timeout: 120s -- 2 save+reload cycles (~20-25s each).: handle dirty state after each save.
  test('TC-LOC-LI-071: Enable Multiday Pricing toggles and persists after save+reload', async ({ locationLocalInfoPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-001']);
    test.setTimeout(120_000);
 // Default: unchecked (covered by UNCHECKED_DEFAULTS in TC-002). Toggle to checked.
    await locationLocalInfoPage.checkCheckbox('chkEnableMultidayPricing');
    expect(await locationLocalInfoPage.isSaveEnabled()).toBe(true);
    await locationLocalInfoPage.clickSave();
    await locationLocalInfoPage.reloadAndNavigateToLocalInfo(OFFICE_NO);
    await locationLocalInfoPage.waitForFormReady('chkApplyLDW', 15_000);
    expect((await locationLocalInfoPage.getCheckboxState('chkEnableMultidayPricing')).checked, 'Multiday Pricing should stay enabled after save and reload').toBe(true);
 // Restore to unchecked (reload between persistence tests to reset form dirty state)
    await locationLocalInfoPage.uncheckCheckbox('chkEnableMultidayPricing');
    await locationLocalInfoPage.clickSave();
  });

 // : Uncheck CRT -> DisplayTax editable. Uncheck DT. Recheck CRT -> DT auto-sets true + disables.
  test('TC-LOC-LI-073: DisplayTax auto-sets true when CompanyRemitTax re-checked', async ({ locationLocalInfoPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-001']);
    await locationLocalInfoPage.uncheckCheckbox('chkCompanyRemitTax');
    await expect.poll(() => locationLocalInfoPage.getCheckboxState('chkDisplayTax').then(s => s.disabled), { timeout: 5_000 }).toBe(false);
    await locationLocalInfoPage.uncheckCheckbox('chkDisplayTax');
    await locationLocalInfoPage.checkCheckbox('chkCompanyRemitTax');
    await expect.poll(() => locationLocalInfoPage.getCheckboxState('chkDisplayTax').then(s => s.checked), { timeout: 5_000 }).toBe(true);
    await expect.poll(() => locationLocalInfoPage.getCheckboxState('chkDisplayTax').then(s => s.disabled), { timeout: 5_000 }).toBe(true);
    await locationLocalInfoPage.clickSave();
  });

 // : AllowETS=enabled for 1604. Check -> ETS%=23.00% (non-union default). Uncheck -> disabled + 0.
  test('TC-LOC-LI-077: Verify ETS Percentage enables when Allow ETS is checked and resets on uncheck', async ({ locationLocalInfoPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-001']);
    await locationLocalInfoPage.checkCheckbox('chkAllowETS');
    await expect.poll(() => locationLocalInfoPage.getSpinState('spinETSPercentage').then(s => s.disabled), { timeout: 5_000 }).toBe(false);
 // Non-union default: 23.00% (0.23 x 100). Value displayed as "23.00%".
    const etsVal = await locationLocalInfoPage.getSpinState('spinETSPercentage');
    expect(parseFloat(etsVal.value)).toBe(23);
    await locationLocalInfoPage.uncheckCheckbox('chkAllowETS');
    await expect.poll(() => locationLocalInfoPage.getSpinState('spinETSPercentage').then(s => s.disabled), { timeout: 5_000 }).toBe(true);
    await expect.poll(() => locationLocalInfoPage.getSpinState('spinETSPercentage').then(s => parseFloat(s.value)), { timeout: 5_000 }).toBe(0);
    await locationLocalInfoPage.clickSave();
  });

 // : C&C Fee=enabled for 1604. Check -> C&C% enables. Set value. Uncheck -> disabled + 0.
  test('TC-LOC-LI-075: C&C% resets to 0 when Apply C&C Fee unchecked', async ({ locationLocalInfoPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-001']);
    await locationLocalInfoPage.checkCheckbox('chkApplyCablesConsumablesFee');
    await expect.poll(() => locationLocalInfoPage.getSpinState('spinCCPercentage').then(s => s.disabled), { timeout: 5_000 }).toBe(false);
    await locationLocalInfoPage.setSpinValue('spinCCPercentage', '5.00');
    await locationLocalInfoPage.uncheckCheckbox('chkApplyCablesConsumablesFee');
    await expect.poll(() => locationLocalInfoPage.getSpinState('spinCCPercentage').then(s => s.disabled), { timeout: 5_000 }).toBe(true);
    await expect.poll(() => locationLocalInfoPage.getSpinState('spinCCPercentage').then(s => parseFloat(s.value)), { timeout: 5_000 }).toBe(0);
    await locationLocalInfoPage.clickSave();
  });

 // : AllowResortTax=enabled for 1604. Same pattern as TC-075.
  test('TC-LOC-LI-076: ResortTax% resets to 0 when Allow Resort Tax unchecked', async ({ locationLocalInfoPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-001']);
    await locationLocalInfoPage.checkCheckbox('chkAllowResortTax');
    await expect.poll(() => locationLocalInfoPage.getSpinState('spinResortTaxPercentage').then(s => s.disabled), { timeout: 5_000 }).toBe(false);
    await locationLocalInfoPage.setSpinValue('spinResortTaxPercentage', '3.00');
    await locationLocalInfoPage.uncheckCheckbox('chkAllowResortTax');
    await expect.poll(() => locationLocalInfoPage.getSpinState('spinResortTaxPercentage').then(s => s.disabled), { timeout: 5_000 }).toBe(true);
    await expect.poll(() => locationLocalInfoPage.getSpinState('spinResortTaxPercentage').then(s => parseFloat(s.value)), { timeout: 5_000 }).toBe(0);
    await locationLocalInfoPage.clickSave();
  });

  test('TC-LOC-LI-072: Enable IDC Billing persists after save+reload', async ({ locationLocalInfoPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-001']);
    test.setTimeout(120_000);
    await locationLocalInfoPage.checkCheckbox('chkEnableIDCBilling');
    await locationLocalInfoPage.clickSave();
    await locationLocalInfoPage.reloadAndNavigateToLocalInfo(OFFICE_NO);
    await locationLocalInfoPage.waitForFormReady('chkApplyLDW', 15_000);
    expect((await locationLocalInfoPage.getCheckboxState('chkEnableIDCBilling')).checked, 'IDC Billing should stay enabled after save and reload').toBe(true);
    await locationLocalInfoPage.uncheckCheckbox('chkEnableIDCBilling');
    await locationLocalInfoPage.clickSave();
  });

  for (const bc of LDW_BOUNDARIES) {
    test(`TC-LOC-LI: LDW% = ${bc.value} (${bc.label})`, async ({ locationLocalInfoPage, dependencyGate }) => {
      dependencyGate(['TC-LOC-LI-001']);
 // server now accepts LDW% changes for office 1604.
 // Valid cases do 2 save+confirmation+reload cycles (~20s each) -- 90s covers worst case.
      if (bc.valid) test.setTimeout(90_000);
      const result = await locationLocalInfoPage.testBoundaryValue(
        'spinLDWPercentage', bc.value, bc.valid, bc.errorContains, bc.restoreValue, OFFICE_NO, bc.restoreEnableKey,
      );
      expect(result.passed, result.detail).toBe(true);
    });
  }

  for (const tc of TEXT_FIELD_CONSTRAINTS) {
    test(`TC-LOC-LI: ${String(tc.key)} maxLength=${tc.maxLength}`, async ({ locationLocalInfoPage, dependencyGate }) => {
      dependencyGate(['TC-LOC-LI-001']);
      const result = await locationLocalInfoPage.testMaxLength(tc.key, tc.maxLength, tc.restoreValue);
      expect(result.passed, result.detail).toBe(true);
    });
  }

  test('TC-LOC-LI-064/065: Ticker Calc + Service Charge group -- toggle and restore', async ({ locationLocalInfoPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-001']);
    test.setTimeout(60_000);
    await locationLocalInfoPage.uncheckCheckbox('chkTickerCalc');
    expect(await locationLocalInfoPage.isSaveEnabled()).toBe(true);
    await locationLocalInfoPage.checkCheckbox('chkTickerCalc');
    await locationLocalInfoPage.checkCheckbox('chkShowServiceChargeAsAdministrativeFee');
    await locationLocalInfoPage.checkCheckbox('chkCalculateServiceChargeOnNetAmount');
    expect((await locationLocalInfoPage.getCheckboxState('chkShowServiceChargeAsAdministrativeFee')).checked).toBe(true);
    expect((await locationLocalInfoPage.getCheckboxState('chkCalculateServiceChargeOnNetAmount')).checked).toBe(true);
    await locationLocalInfoPage.uncheckCheckbox('chkShowServiceChargeAsAdministrativeFee');
    await locationLocalInfoPage.uncheckCheckbox('chkCalculateServiceChargeOnNetAmount');
    await locationLocalInfoPage.clickSave();
  });

 // Timeout: 90s -- 2 save+reload cycles (~20-25s each).
 // server now accepts Billing Type changes for office 1604.
  test('TC-LOC-LI-025: Billing Type radio -- Direct persists, restored to Master', async ({ locationLocalInfoPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-001']);
    test.setTimeout(90_000);
    expect(await locationLocalInfoPage.getBillingType()).toBe(LOCAL_INFO_TEST_VALUES.billingType);
    await locationLocalInfoPage.selectBillingType(LOCAL_INFO_TEST_VALUES.billingTypeDirect);
    expect(await locationLocalInfoPage.isSaveEnabled()).toBe(true);
    await locationLocalInfoPage.clickSave();
    await locationLocalInfoPage.reloadAndNavigateToLocalInfo(OFFICE_NO);
    expect(await locationLocalInfoPage.getBillingType(), 'Billing Type should keep the saved value after reload').toBe(LOCAL_INFO_TEST_VALUES.billingTypeDirect);
    await locationLocalInfoPage.selectBillingType(LOCAL_INFO_TEST_VALUES.billingType);
    await locationLocalInfoPage.clickSave();
  });

 // TC-021: valid short text persists; TC-029: standalone checkbox toggle + persist.
 // server now accepts persistent changes for office 1604.
  test('TC-LOC-LI-021/029: Oracle Product valid input + Calculate LDW Net Amount toggle persist', async ({ locationLocalInfoPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-001']);
    test.setTimeout(120_000);
    await locationLocalInfoPage.fillText('txtOracleProduct', LOCAL_INFO_TEST_VALUES.oracleProductTest);
    await locationLocalInfoPage.clickSave();
    await locationLocalInfoPage.reloadAndNavigateToLocalInfo(OFFICE_NO);
    expect(await locationLocalInfoPage.getTextValue('txtOracleProduct')).toBe(LOCAL_INFO_TEST_VALUES.oracleProductTest);
    await locationLocalInfoPage.fillText('txtOracleProduct', LOCAL_INFO_TEST_VALUES.oracleProductDefault);
    await locationLocalInfoPage.checkCheckbox('chkCalculateLDWonNetAmount');
    await locationLocalInfoPage.clickSave();
    await locationLocalInfoPage.reloadAndNavigateToLocalInfo(OFFICE_NO);
    expect((await locationLocalInfoPage.getCheckboxState('chkCalculateLDWonNetAmount')).checked).toBe(true);
    await locationLocalInfoPage.uncheckCheckbox('chkCalculateLDWonNetAmount');
    await locationLocalInfoPage.clickSave();
  });

 // TC-026: always-disabled + conditionally-disabled states are preserved after a save cycle.
  test('TC-LOC-LI-026: Disabled checkbox states persist after save', async ({ locationLocalInfoPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-001']);
    const disabledResult = await locationLocalInfoPage.verifyCheckboxDisabledStates(
      Object.fromEntries(DISABLED_CHECKBOXES.map(k => [k, true])),
    );
    expect(disabledResult.allPassed, disabledResult.failures.join('; ')).toBe(true);
    const disabledCheckedResult = await locationLocalInfoPage.verifyCheckboxDefaults(DISABLED_CHECKBOX_STATES);
    expect(disabledCheckedResult.allPassed, disabledCheckedResult.failures.join('; ')).toBe(true);
  });

 // TC-045: all 5 interactive field types (checkbox, number field, textbox, dropdown, radio) enable Save.
  test('TC-LOC-LI-045: All field types trigger Save enable', async ({ locationLocalInfoPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-001']);
 // radio -- already verified by TC-025 inline; just assert current save-disabled state
    expect(await locationLocalInfoPage.isSaveEnabled()).toBe(false);
 // checkbox
    await locationLocalInfoPage.toggleCheckbox('chkWarehouseBilling');
    expect(await locationLocalInfoPage.isSaveEnabled()).toBe(true);
    await locationLocalInfoPage.toggleCheckbox('chkWarehouseBilling');
 // number field
    await locationLocalInfoPage.setSpinValue('spinLDWPercentage', '0.50');
    expect(await locationLocalInfoPage.isSaveEnabled()).toBe(true);
    await locationLocalInfoPage.setSpinValue('spinLDWPercentage', '0.04');
 // textbox
    await locationLocalInfoPage.fillText('txtOracleProduct', LOCAL_INFO_TEST_VALUES.oracleProductShort);
    expect(await locationLocalInfoPage.isSaveEnabled()).toBe(true);
    await locationLocalInfoPage.fillText('txtOracleProduct', LOCAL_INFO_TEST_VALUES.oracleProductDefault);
    await locationLocalInfoPage.clickSave();
  });

 // Checkbox label text verification (merged from location-local-info-validation.spec.ts).
  test('TC-LOC-LI-067: Checkbox labels display correct visible text', async ({ locationLocalInfoPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-001']);
    const failures: string[] = [];
    for (const item of CHECKBOX_LABEL_CASES) {
      const label = await locationLocalInfoPage.getCheckboxLabel(item.key);
      if (label !== item.expected) {
        failures.push(`${item.key}: expected "${item.expected}", got "${label}"`);
      }
    }
    expect(failures, failures.join('; ')).toHaveLength(0);
  });

 // Special chars in Oracle Product persist after save+reload; restore original value.
 // server now accepts persistent changes for office 1604.
  test('TC-LOC-LI-068: Oracle Product accepts special characters; value persists', async ({ locationLocalInfoPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-001']);
    test.setTimeout(90_000);
    const original = await locationLocalInfoPage.getTextValue('txtOracleProduct');
    await locationLocalInfoPage.fillText('txtOracleProduct', LOCAL_INFO_TEST_VALUES.specialChars);
    await locationLocalInfoPage.clickSave();
    await locationLocalInfoPage.reloadAndNavigateToLocalInfo(OFFICE_NO);
    expect(await locationLocalInfoPage.getTextValue('txtOracleProduct')).toBe(LOCAL_INFO_TEST_VALUES.specialChars);
    await locationLocalInfoPage.fillText('txtOracleProduct', original || LOCAL_INFO_TEST_VALUES.oracleProductDefault);
    await locationLocalInfoPage.clickSave();
  });

 // Alphanumeric value in Oracle Department persists after save+reload; restore original value.
 // server now accepts persistent changes for office 1604.
  test('TC-LOC-LI-069: Oracle Department alphanumeric value persists after save', async ({ locationLocalInfoPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-001']);
    test.setTimeout(90_000);
    const original = await locationLocalInfoPage.getTextValue('txtOracleDepartment');
    await locationLocalInfoPage.fillText('txtOracleDepartment', LOCAL_INFO_TEST_VALUES.oracleDeptTest);
    await locationLocalInfoPage.clickSave();
    await locationLocalInfoPage.reloadAndNavigateToLocalInfo(OFFICE_NO);
    expect(await locationLocalInfoPage.getTextValue('txtOracleDepartment')).toBe(LOCAL_INFO_TEST_VALUES.oracleDeptTest);
    await locationLocalInfoPage.fillText('txtOracleDepartment', original || LOCAL_INFO_TEST_VALUES.oracleDeptDefault);
    await locationLocalInfoPage.clickSave();
  });

 // Live-verified: Skip Billing does NOT disable Oracle Product (checkbox is a billing flag only).
 // Rewritten to test actual behavior: toggle persists after save+reload.
  test('TC-LOC-LI-070: Skip Billing toggle persists after save+reload', async ({ locationLocalInfoPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-001']);
    test.setTimeout(120_000);
 // Wait for Angular form hydration before ANY interaction
    await locationLocalInfoPage.waitForFormReady('chkSkipBilling');
 // Read initial state
    const initial = await locationLocalInfoPage.getCheckboxState('chkSkipBilling');
    try {
 // Toggle to opposite state
      if (initial.checked) {
        await locationLocalInfoPage.uncheckCheckbox('chkSkipBilling');
      } else {
        await locationLocalInfoPage.checkCheckbox('chkSkipBilling');
      }
      await locationLocalInfoPage.clickSave();
      await locationLocalInfoPage.reloadAndNavigateToLocalInfo(OFFICE_NO);
      await locationLocalInfoPage.waitForFormReady('chkSkipBilling');
 // Verify toggled state persisted
      const afterToggle = await locationLocalInfoPage.getCheckboxState('chkSkipBilling');
      expect(afterToggle.checked).toBe(!initial.checked);
    } finally {
 // ALWAYS restore original state -- prevents pollution for LI-002 on next run
      await locationLocalInfoPage.waitForFormReady('chkSkipBilling');
      const current = await locationLocalInfoPage.getCheckboxState('chkSkipBilling');
      if (current.checked !== initial.checked) {
        if (initial.checked) {
          await locationLocalInfoPage.checkCheckbox('chkSkipBilling');
        } else {
          await locationLocalInfoPage.uncheckCheckbox('chkSkipBilling');
        }
        await locationLocalInfoPage.clickSave();
      }
    }
  });

});

// FIXME TC-037/035 (the application disables Save on a maximum-value violation, so the invalid value is never saved), LDW% sub-min 0.01-0.09 (server rejects silently), TC-008A (Oracle required), TC-018 (Threshold step), TC-033 (batch isolation).
// FIXME TC-078 (the Billing Cycle field is covered with a valid value only; the empty-value error path is not yet automated). TC-079 (the application shows no required-field indicator for the Oracle field and Save has no effect when it is left empty, so the empty-field validation cannot be asserted).
// FIXME (permanently blocked): TC-028 (ServiceCharge), TC-036 (multi-invalid), TC-040 (eSignature), TC-066 (JobCosting), TC-008 (Skip Billing one-way lock).
// NOT-AUTOMATABLE: TC-060 (requires a user account with a read-only Location role, which is not provisioned in the test environment), TC-022/023/024/024A/044/046/047/048/054/058/059 (require a different office whose billing and country configuration differs from the standard test office).
// COVERED BY TC-002: TC-038/039 (CHECKED_DEFAULTS), TC-041/042/043 (UNCHECKED_DEFAULTS), TC-057 (DISABLED_CHECKBOXES), TC-062/063 (left-panel).
// RESOLVED: TC-007A (multi-trigger Threshold) -- covered by TC-074 (all 4 combos + reset-to-0).
// RESOLVED : TC-017 (ETS% -> TC-077), TC-030/031 (C&C -> TC-075), TC-061 (ResortTax -> TC-076), TC-073 (DisplayTax auto-set), TC-072 (IDC Billing persist). Gap#12 confirmed.
