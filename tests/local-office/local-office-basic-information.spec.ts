import { test, expect } from '../../src/fixtures/pages.fixture';
import {
  DATE_OFFSET_DEFAULTS, ONE_DAY_JOB_CHECKBOXES, DATE_OFFSET_TEST_VALUES, PHONE_TEST_VALUES,
  SECTION_TEST_VALUES, ROOM_TEST_VALUES, ORDER_TYPE_VALUES, PO_TEST_VALUES, XSS_PAYLOAD,
  DEFAULT_PHONE_1, POSITIVITY_VIOLATIONS_START, POSITIVITY_VIOLATIONS_END, MAXLEN_BOUNDARY,
  MULTI_FIELD_RECOVERY, NULL_OFFSET_FIELDS, OFFSET_TOOLTIPS, MISC_CHECKBOX_BASELINE,
  HIDDEN_FIELD_PROBE_STRINGS, COMPANY_LOGO, SECTION_GRID_BASELINE, SECTION_GRID_INACTIVE_ROW,
  ROOM_GRID_BASELINE, DEFAULT_SECTIONS_BUTTON_ADDS, DEFAULT_SECTIONS_MODULE_SPEC, GRID_TEST_VALUES,
  DISCOUNT_EXEMPTION_TEST,
} from '../../src/data/local-office/local-office-settings';
import { OFFICE_NO, SAVE_CHANGES_DIALOG, UNSAVED_CHANGES_DIALOG } from '../../src/data/common';

test.describe('Local Office Basic Information Settings @local-office @basic-information', () => {
  // Nav guard uses DOM presence (aria-selected) via isOnBasicInfoTab, not url.includes -- sub-tabs
  // share the `settings/local-office` URL. Basic Information is the DEFAULT tab (no click needed
  // once on the page), unlike ECT Settings. 60s hook budget: cold-start nav (SSO handoff + Angular
  // load + hydrate) regularly exceeds the 30s default.
  test.beforeEach(async ({ localOfficeSettingsPage }) => {
    test.setTimeout(60_000);
    if (!(await localOfficeSettingsPage.isOnBasicInfoTab())) {
      await localOfficeSettingsPage.navigateToBasicInfoTab(OFFICE_NO);
    }
  });

  // ------------------------------------------------------------------------------------------
  // 1. Tab Load & Layout (Happy Path)
  // ------------------------------------------------------------------------------------------

  test('TC-LOE-BASIC-001: Basic Information tab loads with all panels and documented default values', { tag: '@C105358' }, async ({ localOfficeSettingsPage: pg, dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(60_000);
    // Fresh load through the shared reload/re-navigate helper -- every scenario in this spec
    // assumes a pristine starting state (plan Application Overview), and tests in this file share
    // one worker-scoped page/session, so each test must re-establish it rather than trust the last.
    await pg.reloadBasicInfo(OFFICE_NO);

    expect(await pg.isOnBasicInfoTab()).toBe(true);
    expect(await pg.getTextContent('lblLocationHeader')).toContain('1604');
    expect(await pg.isFieldDisabled('btnSave')).toBe(true);

    // Default Date Offsets
    for (const { key, value } of DATE_OFFSET_DEFAULTS) {
      expect(await pg.getInputValue(key), key).toBe(value);
    }
    const dateOffsetsText = await pg.getTextContent('secDateOffsets');
    expect(dateOffsetsText).not.toContain('LoadIn');
    expect(dateOffsetsText).not.toContain('LoadOut');

    // Misc Settings checkboxes (Logo panel checkboxes are asserted separately below)
    for (const { key, checked, disabled } of MISC_CHECKBOX_BASELINE) {
      if (key.startsWith('chkLogo')) continue;
      const state = await pg.getCheckboxState(key);
      expect(state.checked, `${key} checked`).toBe(checked);
      expect(state.disabled, `${key} disabled`).toBe(disabled);
    }
    expect(await pg.getInputValue('txtPhone1')).toBe(DEFAULT_PHONE_1);
    expect(await pg.getInputValue('txtPhone2')).toBe('');
    expect(await pg.getComboboxValue('drpDefaultOrderType')).toBe(ORDER_TYPE_VALUES.default);
    expect(await pg.getInputValue('txtPoNumber')).toBe('');
    expect(await pg.getInputValue('txtPoNumberLabel')).toBe('');
    const miscText = await pg.getTextContent('secMiscSettings');
    for (const s of HIDDEN_FIELD_PROBE_STRINGS) expect(miscText).not.toContain(s);

    // Section panel
    expect((await pg.getCheckboxState('chkUseSection')).checked).toBe(true);
    expect(await pg.isFieldDisabled('btnDefaultSection')).toBe(false);
    expect(await pg.getSectionNames()).toEqual([...SECTION_GRID_BASELINE]);
    expect(await pg.getSectionRowCount()).toBe(SECTION_GRID_BASELINE.length);
    const inactiveIdx = SECTION_GRID_BASELINE.indexOf(SECTION_GRID_INACTIVE_ROW);
    for (let i = 0; i < SECTION_GRID_BASELINE.length; i++) {
      expect(await pg.isSectionActive(i), `section row ${i} (${SECTION_GRID_BASELINE[i]}) active`).toBe(i !== inactiveIdx);
    }

    // Room Configuration panel -- confirmed live it has neither a gating checkbox nor a Default
    // button, unlike the Section panel (plan 1.1 step 5).
    expect(await pg.getRoomNames()).toEqual([...ROOM_GRID_BASELINE]);
    for (let i = 0; i < ROOM_GRID_BASELINE.length; i++) {
      expect(await pg.isRoomActive(i), `room row ${i} (${ROOM_GRID_BASELINE[i]}) active`).toBe(true);
    }
    const roomPanelButtons = await pg.page
      .locator('[data-testid="local-office-settings-section-room-config"] button', { hasText: 'Default' })
      .count();
    expect(roomPanelButtons).toBe(0);
    const roomPanelCheckboxes = await pg.page
      .locator('[data-testid="local-office-settings-section-room-config"] [role="checkbox"]')
      .count();
    expect(roomPanelCheckboxes).toBe(0);

    // Default Logo panel
    expect((await pg.getCheckboxState('chkLogoQuotes')).checked).toBe(true);
    expect((await pg.getCheckboxState('chkLogoRentalOrders')).checked).toBe(true);
    expect(await pg.getComboboxValue('drpCompanyLogo')).toBe(COMPANY_LOGO.default);
    expect(await pg.getLogoPreviewSrc()).not.toBe('');

    // Discount Exemptions panel -- confirmed live no "Add New..." row exists here, unlike the
    // Section/Room grids (plan 1.1 step 7).
    expect(await pg.getDiscountRowCount()).toBeGreaterThan(50);
    expect(await pg.getDiscountServiceTypeByIndex(0)).toBe(DISCOUNT_EXEMPTION_TEST.firstServiceType);
    const discountAddNewCount = await pg.page
      .locator('[data-testid="local-office-settings-table-discount-exemptions"] input[placeholder="Add New..."]')
      .count();
    expect(discountAddNewCount).toBe(0);
  });

  test('TC-LOE-BASIC-002: Grid editability baseline -- Section/Room editable, Discount Exemptions Service Type read-only', { tag: '@C105359' }, async ({ localOfficeSettingsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-BASIC-001']);
    await pg.reloadBasicInfo(OFFICE_NO);

    expect(await pg.isGridNameColumnReadOnly('tblSections')).toBe(false);
    expect(await pg.isGridNameColumnReadOnly('tblRoomConfig')).toBe(false);

    expect(await pg.isDiscountServiceTypeReadOnly(0)).toBe(true);
    expect(await pg.isDiscountServiceTypeReadOnly(1)).toBe(true);

    await pg.attemptEditDiscountServiceTypeCell(0);
    expect(await pg.isDiscountServiceTypeReadOnly(0)).toBe(true);
  });

  // ------------------------------------------------------------------------------------------
  // 2. Date Offset Field-Level Validation
  // ------------------------------------------------------------------------------------------

  test('TC-LOE-BASIC-003: Prep Date Offset -- own-field positivity pattern, non-numeric acceptance-as-invalid, maxlength, empty-is-valid', { tag: '@C105360' }, async ({ localOfficeSettingsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-BASIC-001']);
    await pg.reloadBasicInfo(OFFICE_NO);
    const { key, invalidValue, defaultValue } = POSITIVITY_VIOLATIONS_START[0]; // Prep
    expect(await pg.getInputValue(key)).toBe(defaultValue);
    expect(await pg.getFieldMaxLength(key)).toBe(3);
    expect(await pg.isFieldRequiredAttr(key)).toBe(false);

    await pg.fillAndTab(key, invalidValue); // '5' -- positive, invalid for a negative-or-zero field
    expect(await pg.getInputValue(key)).toBe(invalidValue);
    expect(await pg.expectInvalid(key)).toBe(true);
    expect(await pg.getFieldTooltipText(key)).toContain(OFFSET_TOOLTIPS.prep);
    expect(await pg.isSaveEnabled()).toBe(false);

    await pg.fillAndTab(key, 'abc');
    expect(await pg.getInputValue(key)).toBe('abc'); // no character-level filtering -- literal text accepted, then flagged
    expect(await pg.expectInvalid(key)).toBe(true);

    await pg.focusField(key);
    await pg.page.keyboard.press('Control+a');
    await pg.page.keyboard.type(MAXLEN_BOUNDARY.threeChar.overLimit); // '1234' -- native maxlength=3 caps this mid-type
    expect((await pg.getInputValue(key)).length).toBeLessThanOrEqual(3);
    await pg.blurActiveField();

    await pg.clearAndTab(key);
    expect(await pg.getInputValue(key)).toBe('');
    expect(await pg.expectValid(key)).toBe(true); // empty is accepted, contradicting a naive "required" assumption
    expect(await pg.isSaveEnabled()).toBe(true);

    await pg.fillAndTab(key, defaultValue);
    expect(await pg.expectValid(key)).toBe(true);
    expect(await pg.isSaveEnabled()).toBe(false);
  });

  test('TC-LOE-BASIC-004: Set Date Offset -- own-field positivity pattern, maxlength boundary (4-char), non-numeric', { tag: '@C105361' }, async ({ localOfficeSettingsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-BASIC-001']);
    await pg.reloadBasicInfo(OFFICE_NO);
    const { key, invalidValue, defaultValue } = POSITIVITY_VIOLATIONS_START[1]; // Set
    expect(await pg.getInputValue(key)).toBe(defaultValue);
    expect(await pg.getFieldMaxLength(key)).toBe(4);

    await pg.fillAndTab(key, invalidValue); // '3'
    expect(await pg.getInputValue(key)).toBe(invalidValue);
    expect(await pg.expectInvalid(key)).toBe(true);
    expect(await pg.isSaveEnabled()).toBe(false);

    await pg.fillAndTab(key, 'abc');
    expect(await pg.getInputValue(key)).toBe('abc');
    expect(await pg.expectInvalid(key)).toBe(true);

    await pg.fillAndTab(key, MAXLEN_BOUNDARY.fourChar.atLimit); // '-999' -- exactly fits maxlength=4, valid pattern
    expect(await pg.getInputValue(key)).toBe(MAXLEN_BOUNDARY.fourChar.atLimit);
    expect(await pg.expectValid(key)).toBe(true);
    expect(await pg.isSaveEnabled()).toBe(true);

    await pg.fillAndTab(key, defaultValue);
    expect(await pg.expectValid(key)).toBe(true);
    expect(await pg.isSaveEnabled()).toBe(false);
  });

  test('TC-LOE-BASIC-005: Delivery Date Offset -- own-field positivity pattern, maxlength boundary (4-char), non-numeric', { tag: '@C105362' }, async ({ localOfficeSettingsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-BASIC-001']);
    await pg.reloadBasicInfo(OFFICE_NO);
    const { key, invalidValue, defaultValue } = POSITIVITY_VIOLATIONS_START[2]; // Delivery
    expect(await pg.getInputValue(key)).toBe(defaultValue);
    expect(await pg.getFieldMaxLength(key)).toBe(4);

    await pg.fillAndTab(key, invalidValue); // '2'
    expect(await pg.getInputValue(key)).toBe(invalidValue);
    expect(await pg.expectInvalid(key)).toBe(true);
    expect(await pg.isSaveEnabled()).toBe(false);

    await pg.fillAndTab(key, 'abc');
    expect(await pg.getInputValue(key)).toBe('abc');
    expect(await pg.expectInvalid(key)).toBe(true);

    await pg.focusField(key);
    await pg.page.keyboard.press('Control+a');
    await pg.page.keyboard.type('-1234'); // 5 chars, over the maxlength=4 limit
    expect((await pg.getInputValue(key)).length).toBeLessThanOrEqual(4);
    await pg.blurActiveField();

    await pg.fillAndTab(key, defaultValue);
    expect(await pg.expectValid(key)).toBe(true);
    expect(await pg.isSaveEnabled()).toBe(false);
  });

  test('TC-LOE-BASIC-006: Return Date Offset -- own-field positivity pattern (reverse polarity), maxlength, non-numeric', { tag: '@C105363' }, async ({ localOfficeSettingsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-BASIC-001']);
    await pg.reloadBasicInfo(OFFICE_NO);
    const { key, invalidValue, defaultValue } = POSITIVITY_VIOLATIONS_END[0]; // Return
    expect(await pg.getInputValue(key)).toBe(defaultValue);
    expect(await pg.getFieldMaxLength(key)).toBe(3);

    await pg.fillAndTab(key, invalidValue); // '-3' -- Return only accepts empty/positive, the reverse polarity of Prep/Set/Delivery
    expect(await pg.getInputValue(key)).toBe(invalidValue);
    expect(await pg.expectInvalid(key)).toBe(true);
    expect(await pg.isSaveEnabled()).toBe(false);

    await pg.fillAndTab(key, 'abc');
    expect(await pg.getInputValue(key)).toBe('abc');
    expect(await pg.expectInvalid(key)).toBe(true);

    await pg.focusField(key);
    await pg.page.keyboard.press('Control+a');
    await pg.page.keyboard.type('1234'); // 4 chars, over the maxlength=3 limit
    expect((await pg.getInputValue(key)).length).toBeLessThanOrEqual(3);
    await pg.blurActiveField();

    await pg.fillAndTab(key, defaultValue);
    expect(await pg.expectValid(key)).toBe(true);
    expect(await pg.isSaveEnabled()).toBe(false);
  });

  test('TC-LOE-BASIC-007: Strike Date Offset -- own-field positivity pattern, maxlength, non-numeric', { tag: '@C105364' }, async ({ localOfficeSettingsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-BASIC-001']);
    await pg.reloadBasicInfo(OFFICE_NO);
    const { key, invalidValue, defaultValue } = POSITIVITY_VIOLATIONS_END[1]; // Strike
    expect(await pg.getInputValue(key)).toBe(defaultValue);
    expect(await pg.getFieldMaxLength(key)).toBe(3);

    await pg.fillAndTab(key, invalidValue); // '-2'
    expect(await pg.getInputValue(key)).toBe(invalidValue);
    expect(await pg.expectInvalid(key)).toBe(true);
    expect(await pg.isSaveEnabled()).toBe(false);

    await pg.fillAndTab(key, 'abc');
    expect(await pg.getInputValue(key)).toBe('abc');
    expect(await pg.expectInvalid(key)).toBe(true);

    await pg.fillAndTab(key, defaultValue);
    expect(await pg.expectValid(key)).toBe(true);
    expect(await pg.isSaveEnabled()).toBe(false);
  });

  test('TC-LOE-BASIC-008: Pickup Date Offset -- own-field positivity pattern, maxlength, non-numeric', { tag: '@C105365' }, async ({ localOfficeSettingsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-BASIC-001']);
    await pg.reloadBasicInfo(OFFICE_NO);
    const { key, invalidValue, defaultValue } = POSITIVITY_VIOLATIONS_END[2]; // Pickup
    expect(await pg.getInputValue(key)).toBe(defaultValue);
    expect(await pg.getFieldMaxLength(key)).toBe(3);

    await pg.fillAndTab(key, invalidValue); // '-1'
    expect(await pg.getInputValue(key)).toBe(invalidValue);
    expect(await pg.expectInvalid(key)).toBe(true);
    expect(await pg.isSaveEnabled()).toBe(false);

    await pg.fillAndTab(key, 'xyz');
    expect(await pg.getInputValue(key)).toBe('xyz');
    expect(await pg.expectInvalid(key)).toBe(true);

    await pg.fillAndTab(key, defaultValue);
    expect(await pg.expectValid(key)).toBe(true);
    expect(await pg.isSaveEnabled()).toBe(false);
  });

  test('TC-LOE-BASIC-009: Cross-field Validate() -- Delivery must be >= Prep (NM-1264, the one confirmed-live cross-field rule) with recovery', { tag: '@C105366' }, async ({ localOfficeSettingsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-BASIC-001']);
    await pg.reloadBasicInfo(OFFICE_NO);
    const prepDefault = DATE_OFFSET_DEFAULTS.find(o => o.key === 'txtPrepDateOffset')!.value;
    expect(await pg.getInputValue('txtPrepDateOffset')).toBe(prepDefault);
    expect(await pg.getInputValue(MULTI_FIELD_RECOVERY.triggerField)).toBe(MULTI_FIELD_RECOVERY.defaultValue);
    expect(await pg.expectValid('txtPrepDateOffset')).toBe(true);
    expect(await pg.expectValid(MULTI_FIELD_RECOVERY.triggerField)).toBe(true);
    expect(await pg.isSaveEnabled()).toBe(false);

    await pg.fillAndTab(MULTI_FIELD_RECOVERY.triggerField, MULTI_FIELD_RECOVERY.triggerValue); // Delivery = '-5', now < Prep
    expect(await pg.getInputValue(MULTI_FIELD_RECOVERY.triggerField)).toBe(MULTI_FIELD_RECOVERY.triggerValue);
    expect(await pg.expectInvalid(MULTI_FIELD_RECOVERY.triggerField)).toBe(true);
    expect(await pg.expectValid('txtPrepDateOffset')).toBe(true); // Prep itself is never flagged, only Delivery
    expect(await pg.getFieldTooltipText(MULTI_FIELD_RECOVERY.triggerField)).toContain(OFFSET_TOOLTIPS.deliveryGtePrep);
    expect(await pg.isSaveEnabled()).toBe(false);

    await pg.fillAndTab(MULTI_FIELD_RECOVERY.triggerField, MULTI_FIELD_RECOVERY.recoveryValue); // Delivery = '-1', now == Prep
    expect(await pg.expectValid(MULTI_FIELD_RECOVERY.triggerField)).toBe(true);
    expect(await pg.isSaveEnabled()).toBe(true);

    await pg.fillAndTab(MULTI_FIELD_RECOVERY.triggerField, MULTI_FIELD_RECOVERY.defaultValue); // back to '0'
    expect(await pg.getInputValue(MULTI_FIELD_RECOVERY.triggerField)).toBe(MULTI_FIELD_RECOVERY.defaultValue);
    expect(await pg.expectValid(MULTI_FIELD_RECOVERY.triggerField)).toBe(true);
    expect(await pg.isSaveEnabled()).toBe(false);
  });

  test('TC-LOE-BASIC-010: Cross-field Validate() probe -- Set/Prep, Set/Delivery, Strike/Return, Pickup/Return are NOT enforced live (documented spec discrepancy)', { tag: '@C105367' }, async ({ localOfficeSettingsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-BASIC-001']);
    await pg.reloadBasicInfo(OFFICE_NO);
    // The shipped default data already has Set ('-1') < Delivery ('0') with zero validation error --
    // live evidence that "Set must be >= Delivery" is not enforced, contrary to the module spec.
    expect(await pg.expectValid('txtSetDateOffset')).toBe(true);
    expect(await pg.expectValid('txtDeliveryDateOffset')).toBe(true);

    await pg.fillAndTab('txtSetDateOffset', '-5'); // now Set < Prep ('-1')
    expect(await pg.expectValid('txtSetDateOffset')).toBe(true); // NOT flagged -- Set/Prep cross-check unenforced
    await pg.fillAndTab('txtSetDateOffset', '-1');
    expect(await pg.getInputValue('txtSetDateOffset')).toBe('-1');

    await pg.fillAndTab('txtStrikeDateOffset', '5'); // now Strike > Return ('1')
    expect(await pg.expectValid('txtStrikeDateOffset')).toBe(true); // NOT flagged -- Strike/Return cross-check unenforced
    await pg.fillAndTab('txtStrikeDateOffset', '1');
    expect(await pg.getInputValue('txtStrikeDateOffset')).toBe('1');

    await pg.fillAndTab('txtPickupDateOffset', '5'); // now Pickup > Return ('1')
    expect(await pg.expectValid('txtPickupDateOffset')).toBe(true); // NOT flagged -- Pickup/Return cross-check unenforced
    await pg.fillAndTab('txtPickupDateOffset', '0');
    expect(await pg.getInputValue('txtPickupDateOffset')).toBe('0');

    for (const { key, value } of DATE_OFFSET_DEFAULTS) {
      expect(await pg.getInputValue(key), key).toBe(value);
    }
    expect(await pg.isSaveEnabled()).toBe(false);
  });

  test('TC-LOE-BASIC-011: Prep and Return Date Offset can both be cleared to empty simultaneously and are treated as valid; restore', { tag: '@C105368' }, async ({ localOfficeSettingsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-BASIC-001']);
    await pg.reloadBasicInfo(OFFICE_NO);
    for (const { key, defaultValue } of NULL_OFFSET_FIELDS) {
      expect(await pg.getInputValue(key), key).toBe(defaultValue);
    }
    expect(await pg.isSaveEnabled()).toBe(false);

    await pg.clearAndTab('txtPrepDateOffset');
    expect(await pg.getInputValue('txtPrepDateOffset')).toBe('');
    expect(await pg.expectValid('txtPrepDateOffset')).toBe(true);
    expect(await pg.isSaveEnabled()).toBe(true);

    await pg.clearAndTab('txtReturnDateOffset');
    expect(await pg.getInputValue('txtReturnDateOffset')).toBe('');
    expect(await pg.expectValid('txtReturnDateOffset')).toBe(true);
    expect(await pg.isSaveEnabled()).toBe(true);

    // Re-focus/blur the remaining four without changing them -- confirms no new cross-field error
    // appears now that both Prep and Return are empty.
    for (const key of ['txtSetDateOffset', 'txtStrikeDateOffset', 'txtDeliveryDateOffset', 'txtPickupDateOffset']) {
      await pg.focusField(key);
      await pg.blurActiveField();
      expect(await pg.expectValid(key), key).toBe(true);
    }

    const prepDefault = NULL_OFFSET_FIELDS.find(f => f.key === 'txtPrepDateOffset')!.defaultValue;
    const returnDefault = NULL_OFFSET_FIELDS.find(f => f.key === 'txtReturnDateOffset')!.defaultValue;
    await pg.fillAndTab('txtPrepDateOffset', prepDefault);
    await pg.fillAndTab('txtReturnDateOffset', returnDefault);
    expect(await pg.expectValid('txtPrepDateOffset')).toBe(true);
    expect(await pg.expectValid('txtReturnDateOffset')).toBe(true);
    expect(await pg.isSaveEnabled()).toBe(false);
  });

  test('TC-LOE-BASIC-012: maxlength boundary enforcement is consistent across all six offset fields', { tag: '@C105369' }, async ({ localOfficeSettingsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-BASIC-001']);
    await pg.reloadBasicInfo(OFFICE_NO);
    const expectedMaxLengths: Record<string, number> = {
      txtPrepDateOffset: 3, txtReturnDateOffset: 3, txtSetDateOffset: 4,
      txtStrikeDateOffset: 3, txtDeliveryDateOffset: 4, txtPickupDateOffset: 3,
    };
    for (const [key, len] of Object.entries(expectedMaxLengths)) {
      expect(await pg.getFieldMaxLength(key), key).toBe(len);
    }

    for (const [key, len] of Object.entries(expectedMaxLengths)) {
      await pg.focusField(key);
      await pg.page.keyboard.press('Control+a');
      await pg.page.keyboard.type('99999'); // 5 digits, exceeds every field's limit
      expect((await pg.getInputValue(key)).length, key).toBeLessThanOrEqual(len);
      await pg.blurActiveField();
    }

    for (const { key, defaultValue } of NULL_OFFSET_FIELDS) {
      await pg.fillAndTab(key, defaultValue);
    }
    for (const { key, defaultValue } of NULL_OFFSET_FIELDS) {
      expect(await pg.getInputValue(key), key).toBe(defaultValue);
    }
    expect(await pg.isSaveEnabled()).toBe(false);
  });

  // ------------------------------------------------------------------------------------------
  // 3. Misc Settings Checkboxes & Dependencies
  // ------------------------------------------------------------------------------------------

  test('TC-LOE-BASIC-013: Use Availability cascade -- disabling forces Use Fulfillment, Use Equipments QC, and Request Items Return to false+disabled', { tag: '@C105370' }, async ({ localOfficeSettingsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-BASIC-001']);
    await pg.reloadBasicInfo(OFFICE_NO);
    expect(await pg.getCheckboxState('chkUseAvailability')).toEqual({ checked: true, disabled: false });
    expect(await pg.getCheckboxState('chkUseFulfillment')).toEqual({ checked: false, disabled: false });
    expect(await pg.getCheckboxState('chkUseEquipmentsQc')).toEqual({ checked: false, disabled: true });
    expect(await pg.getCheckboxState('chkRequestItemsReturn')).toEqual({ checked: false, disabled: false });

    await pg.uncheckCheckbox('chkUseAvailability');
    expect(await pg.getCheckboxState('chkUseAvailability')).toEqual({ checked: false, disabled: false });
    expect(await pg.getCheckboxState('chkUseFulfillment')).toEqual({ checked: false, disabled: true });
    expect(await pg.getCheckboxState('chkUseEquipmentsQc')).toEqual({ checked: false, disabled: true });
    expect(await pg.getCheckboxState('chkRequestItemsReturn')).toEqual({ checked: false, disabled: true });
    expect(await pg.isSaveEnabled()).toBe(true);

    await pg.checkCheckbox('chkUseAvailability');
    expect((await pg.getCheckboxState('chkUseAvailability')).checked).toBe(true);
    expect(await pg.getCheckboxState('chkUseFulfillment')).toEqual({ checked: false, disabled: false });
    expect(await pg.getCheckboxState('chkRequestItemsReturn')).toEqual({ checked: false, disabled: false });
    expect(await pg.getCheckboxState('chkUseEquipmentsQc')).toEqual({ checked: false, disabled: true }); // still gated on Use Fulfillment
    expect(await pg.isSaveEnabled()).toBe(false);
  });

  test('TC-LOE-BASIC-014: Use Fulfillment cascade -- checking it enables Use Equipments QC and forces Request Items Return to false+enabled, without disabling Use Availability', { tag: '@C105371' }, async ({ localOfficeSettingsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-BASIC-001']);
    await pg.reloadBasicInfo(OFFICE_NO);
    expect((await pg.getCheckboxState('chkUseAvailability')).checked).toBe(true);
    expect(await pg.getCheckboxState('chkUseFulfillment')).toEqual({ checked: false, disabled: false });
    expect(await pg.getCheckboxState('chkUseEquipmentsQc')).toEqual({ checked: false, disabled: true });

    await pg.checkCheckbox('chkUseFulfillment');
    expect((await pg.getCheckboxState('chkUseFulfillment')).checked).toBe(true);
    expect((await pg.getCheckboxState('chkUseAvailability')).checked).toBe(true); // unaffected
    // PilotEquipmentQC evaluates false for this office -- Use Equipments QC becomes enabled the
    // instant Use Fulfillment is true, contrary to the data file's disabled:true default (which
    // only reflects the pristine, Use-Fulfillment-false starting state).
    expect(await pg.getCheckboxState('chkUseEquipmentsQc')).toEqual({ checked: false, disabled: false });
    expect((await pg.getCheckboxState('chkRequestItemsReturn')).disabled).toBe(false);
    expect(await pg.isSaveEnabled()).toBe(true);

    await pg.uncheckCheckbox('chkUseFulfillment');
    expect((await pg.getCheckboxState('chkUseFulfillment')).checked).toBe(false);
    expect(await pg.getCheckboxState('chkUseEquipmentsQc')).toEqual({ checked: false, disabled: true }); // forced back
    expect((await pg.getCheckboxState('chkUseAvailability')).checked).toBe(true);
    expect(await pg.isSaveEnabled()).toBe(false);
  });

  test('TC-LOE-BASIC-015: Use Equipments QC becomes checkable only while Use Fulfillment is true, and is force-cleared when Use Fulfillment is unchecked', { tag: '@C105372' }, async ({ localOfficeSettingsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-BASIC-001']);
    await pg.reloadBasicInfo(OFFICE_NO);
    expect((await pg.getCheckboxState('chkUseEquipmentsQc')).disabled).toBe(true);

    await pg.checkCheckbox('chkUseFulfillment');
    expect(await pg.getCheckboxState('chkUseEquipmentsQc')).toEqual({ checked: false, disabled: false });

    await pg.checkCheckbox('chkUseEquipmentsQc');
    expect((await pg.getCheckboxState('chkUseEquipmentsQc')).checked).toBe(true);
    expect(await pg.isSaveEnabled()).toBe(true);

    await pg.uncheckCheckbox('chkUseFulfillment');
    // Forced-clear takes priority over the just-made explicit choice.
    expect(await pg.getCheckboxState('chkUseEquipmentsQc')).toEqual({ checked: false, disabled: true });

    // Discard via a fresh reload rather than asserting Save auto-disables here.
    await pg.reloadBasicInfo(OFFICE_NO);
    for (const { key, checked, disabled } of MISC_CHECKBOX_BASELINE) {
      if (key.startsWith('chkLogo')) continue;
      expect(await pg.getCheckboxState(key), key).toEqual({ checked, disabled });
    }
  });

  test('TC-LOE-BASIC-016: Independent misc checkboxes (same priority, Print Description, Use ServiceType for Subrental) toggle without side effects on each other', { tag: '@C105373' }, async ({ localOfficeSettingsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-BASIC-001']);
    await pg.reloadBasicInfo(OFFICE_NO);
    expect((await pg.getCheckboxState('chkSamePriority')).checked).toBe(false);
    expect((await pg.getCheckboxState('chkPrintDescription')).checked).toBe(true);
    expect((await pg.getCheckboxState('chkUseSubrentServiceType')).checked).toBe(true);

    await pg.checkCheckbox('chkSamePriority');
    expect((await pg.getCheckboxState('chkSamePriority')).checked).toBe(true);
    expect((await pg.getCheckboxState('chkPrintDescription')).checked).toBe(true);
    expect((await pg.getCheckboxState('chkUseSubrentServiceType')).checked).toBe(true);
    expect(await pg.isSaveEnabled()).toBe(true);

    await pg.uncheckCheckbox('chkPrintDescription');
    expect((await pg.getCheckboxState('chkPrintDescription')).checked).toBe(false);
    expect((await pg.getCheckboxState('chkSamePriority')).checked).toBe(true); // unaffected

    await pg.uncheckCheckbox('chkUseSubrentServiceType');
    expect((await pg.getCheckboxState('chkUseSubrentServiceType')).checked).toBe(false);
    expect((await pg.getCheckboxState('chkPrintDescription')).checked).toBe(false); // unaffected

    await pg.uncheckCheckbox('chkSamePriority');
    await pg.checkCheckbox('chkPrintDescription');
    await pg.checkCheckbox('chkUseSubrentServiceType');
    expect((await pg.getCheckboxState('chkSamePriority')).checked).toBe(false);
    expect((await pg.getCheckboxState('chkPrintDescription')).checked).toBe(true);
    expect((await pg.getCheckboxState('chkUseSubrentServiceType')).checked).toBe(true);
    expect(await pg.isSaveEnabled()).toBe(false);
  });

  test('TC-LOE-BASIC-017: Default new job to 1 day (Event/Outside/Internal) checkboxes are mutually independent', { tag: '@C105374' }, async ({ localOfficeSettingsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-BASIC-001']);
    await pg.reloadBasicInfo(OFFICE_NO);
    for (const { key } of ONE_DAY_JOB_CHECKBOXES) {
      expect((await pg.getCheckboxState(key)).checked, key).toBe(false);
    }

    await pg.checkCheckbox('chkDefaultJobOneDayEvent');
    expect((await pg.getCheckboxState('chkDefaultJobOneDayEvent')).checked).toBe(true);
    expect((await pg.getCheckboxState('chkDefaultJobOneDayOutside')).checked).toBe(false);
    expect((await pg.getCheckboxState('chkDefaultJobOneDayInternal')).checked).toBe(false);
    expect(await pg.isSaveEnabled()).toBe(true);

    await pg.checkCheckbox('chkDefaultJobOneDayOutside');
    expect((await pg.getCheckboxState('chkDefaultJobOneDayEvent')).checked).toBe(true);
    expect((await pg.getCheckboxState('chkDefaultJobOneDayOutside')).checked).toBe(true);
    expect((await pg.getCheckboxState('chkDefaultJobOneDayInternal')).checked).toBe(false);

    await pg.checkCheckbox('chkDefaultJobOneDayInternal');
    for (const { key } of ONE_DAY_JOB_CHECKBOXES) {
      expect((await pg.getCheckboxState(key)).checked, key).toBe(true); // all three simultaneously checked -- no radio-like exclusivity
    }

    for (const { key } of ONE_DAY_JOB_CHECKBOXES) {
      await pg.uncheckCheckbox(key);
    }
    for (const { key } of ONE_DAY_JOB_CHECKBOXES) {
      expect((await pg.getCheckboxState(key)).checked, key).toBe(false);
    }
    expect(await pg.isSaveEnabled()).toBe(false);
  });

  test('TC-LOE-BASIC-018: Default Labor to Hourly toggle does not reveal any hidden Labor Hour multiplier fields', { tag: '@C105375' }, async ({ localOfficeSettingsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-BASIC-001']);
    await pg.reloadBasicInfo(OFFICE_NO);
    expect((await pg.getCheckboxState('chkDefaultLaborToHourly')).checked).toBe(false);
    let formText = await pg.getTextContent('frmBasicInfo');
    for (const s of HIDDEN_FIELD_PROBE_STRINGS) expect(formText).not.toContain(s);

    await pg.checkCheckbox('chkDefaultLaborToHourly');
    expect((await pg.getCheckboxState('chkDefaultLaborToHourly')).checked).toBe(true);
    expect(await pg.isSaveEnabled()).toBe(true);
    formText = await pg.getTextContent('frmBasicInfo');
    for (const s of HIDDEN_FIELD_PROBE_STRINGS) expect(formText).not.toContain(s); // still hidden -- matches "Currently Hidden" spec note

    await pg.uncheckCheckbox('chkDefaultLaborToHourly');
    expect((await pg.getCheckboxState('chkDefaultLaborToHourly')).checked).toBe(false);
    expect(await pg.isSaveEnabled()).toBe(false);
  });

  // ------------------------------------------------------------------------------------------
  // 4. Phone / PO / Order Type Fields
  // ------------------------------------------------------------------------------------------

  test('TC-LOE-BASIC-019: Phone 1 required-field validation (custom JS, no native required attribute)', { tag: '@C105376' }, async ({ localOfficeSettingsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-BASIC-001']);
    await pg.reloadBasicInfo(OFFICE_NO);
    expect(await pg.getInputValue('txtPhone1')).toBe(DEFAULT_PHONE_1);
    expect(await pg.getFieldMaxLength('txtPhone1')).toBe(-1);
    expect(await pg.isFieldRequiredAttr('txtPhone1')).toBe(false);

    await pg.clearAndTab('txtPhone1');
    expect(await pg.getInputValue('txtPhone1')).toBe('');
    expect(await pg.expectInvalid('txtPhone1')).toBe(true);
    expect(await pg.getFieldTooltipText('txtPhone1')).toContain(OFFSET_TOOLTIPS.phoneRequired);
    expect(await pg.isSaveEnabled()).toBe(false); // invalid form blocks save even though dirty

    await pg.fillAndTab('txtPhone1', PHONE_TEST_VALUES.testFormat);
    expect(await pg.getInputValue('txtPhone1')).toBe(PHONE_TEST_VALUES.testFormat);
    expect(await pg.expectValid('txtPhone1')).toBe(true);
    expect(await pg.isSaveEnabled()).toBe(true);

    await pg.fillAndTab('txtPhone1', DEFAULT_PHONE_1);
    expect(await pg.getInputValue('txtPhone1')).toBe(DEFAULT_PHONE_1);
    expect(await pg.isSaveEnabled()).toBe(false);
  });

  test('TC-LOE-BASIC-020: Phone 2 is optional and accepts unconstrained free text', { tag: '@C105377' }, async ({ localOfficeSettingsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-BASIC-001']);
    await pg.reloadBasicInfo(OFFICE_NO);
    expect(await pg.getInputValue('txtPhone2')).toBe('');
    expect(await pg.isFieldInvalid('txtPhone2')).toBe(false);
    expect(await pg.getFieldMaxLength('txtPhone2')).toBe(-1);
    expect(await pg.isFieldRequiredAttr('txtPhone2')).toBe(false);

    await pg.fillAndTab('txtPhone2', PHONE_TEST_VALUES.invalid); // 'not-a-phone' -- no format validation on this field
    expect(await pg.getInputValue('txtPhone2')).toBe(PHONE_TEST_VALUES.invalid);
    expect(await pg.isFieldInvalid('txtPhone2')).toBe(false);
    expect(await pg.isSaveEnabled()).toBe(true);

    await pg.clearAndTab('txtPhone2');
    expect(await pg.getInputValue('txtPhone2')).toBe('');
    expect(await pg.isFieldInvalid('txtPhone2')).toBe(false);
    expect(await pg.isSaveEnabled()).toBe(false); // unlike Phone 1, clearing it never invalidates the form
  });

  test('TC-LOE-BASIC-021: Default Order Type dropdown offers exactly Event and Outside, and persists the selection round-trip', { tag: '@C105378' }, async ({ localOfficeSettingsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-BASIC-001']);
    await pg.reloadBasicInfo(OFFICE_NO);
    expect(await pg.getComboboxValue('drpDefaultOrderType')).toBe(ORDER_TYPE_VALUES.default);

    const options = await pg.getComboboxOptionsList('drpDefaultOrderType');
    expect(options).toHaveLength(2);
    expect(options).toContain(ORDER_TYPE_VALUES.default);
    expect(options).toContain(ORDER_TYPE_VALUES.alternate);

    await pg.selectComboboxExact('drpDefaultOrderType', ORDER_TYPE_VALUES.alternate);
    expect(await pg.getComboboxValue('drpDefaultOrderType')).toBe(ORDER_TYPE_VALUES.alternate);
    expect(await pg.isSaveEnabled()).toBe(true);

    await pg.selectComboboxExact('drpDefaultOrderType', ORDER_TYPE_VALUES.default);
    expect(await pg.getComboboxValue('drpDefaultOrderType')).toBe(ORDER_TYPE_VALUES.default);
    expect(await pg.isSaveEnabled()).toBe(false);
  });

  test('TC-LOE-BASIC-022: PO Number and PO Number Label accept unconstrained free text including a long string, and are truly optional', { tag: '@C105379' }, async ({ localOfficeSettingsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-BASIC-001']);
    await pg.reloadBasicInfo(OFFICE_NO);
    expect(await pg.getInputValue('txtPoNumber')).toBe('');
    expect(await pg.getInputValue('txtPoNumberLabel')).toBe('');
    expect(await pg.getFieldMaxLength('txtPoNumber')).toBe(-1);
    expect(await pg.getFieldMaxLength('txtPoNumberLabel')).toBe(-1);
    expect(await pg.isFieldRequiredAttr('txtPoNumber')).toBe(false);
    expect(await pg.isFieldRequiredAttr('txtPoNumberLabel')).toBe(false);

    await pg.fillAndTab('txtPoNumber', PO_TEST_VALUES.number);
    expect(await pg.getInputValue('txtPoNumber')).toBe(PO_TEST_VALUES.number);
    expect(await pg.isSaveEnabled()).toBe(true);

    await pg.fillAndTab('txtPoNumberLabel', PO_TEST_VALUES.label);
    expect(await pg.getInputValue('txtPoNumberLabel')).toBe(PO_TEST_VALUES.label);

    const longString = 'X'.repeat(120);
    await pg.fillAndTab('txtPoNumber', longString);
    expect(await pg.getInputValue('txtPoNumber')).toBe(longString); // no truncation, no crash

    await pg.clearAndTab('txtPoNumber');
    await pg.clearAndTab('txtPoNumberLabel');
    expect(await pg.getInputValue('txtPoNumber')).toBe('');
    expect(await pg.getInputValue('txtPoNumberLabel')).toBe('');
    expect(await pg.isSaveEnabled()).toBe(false);
  });

  // ------------------------------------------------------------------------------------------
  // 5. Section Grid (CRUD, Duplicate, Trim, Default Button, Use Section Gating)
  // ------------------------------------------------------------------------------------------

  test('TC-LOE-BASIC-023: Rename a section with leading/trailing whitespace and confirm trim-on-save', { tag: '@C105380' }, async ({ localOfficeSettingsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-BASIC-001']);
    test.setTimeout(90_000);
    await pg.reloadBasicInfo(OFFICE_NO);
    const { originalName, editValue } = SECTION_TEST_VALUES;

    await pg.editGridRowNameByCurrentName('tblSections', originalName, `  ${editValue}  `);
    expect(await pg.getSectionNames()).toContain(editValue); // committed value is trimmed
    expect(await pg.getSectionNames()).not.toContain(originalName);

    const saveResult = await pg.clickSaveAndConfirm();
    expect(saveResult.success).toBe(true);
    expect(await pg.isSaveEnabled()).toBe(false);

    await pg.reloadBasicInfo(OFFICE_NO);
    expect(await pg.getSectionNames()).toContain(editValue); // trim persisted server-side

    await pg.editGridRowNameByCurrentName('tblSections', editValue, originalName);
    await pg.clickSaveAndConfirm();
    await pg.reloadBasicInfo(OFFICE_NO);
    expect(await pg.getSectionNames()).toEqual([...SECTION_GRID_BASELINE]);
  });

  test('TC-LOE-BASIC-024: Empty and whitespace-only Section Name commits cleanly auto-revert with Save staying disabled', { tag: '@C105381' }, async ({ localOfficeSettingsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-BASIC-001']);
    await pg.reloadBasicInfo(OFFICE_NO);
    const name = SECTION_TEST_VALUES.originalName;

    let idx = await pg.getGridRowIndexByName('tblSections', name);
    await pg.editSectionName(idx, '');
    expect(await pg.getSectionNames()).toContain(name); // reverted, not left empty
    expect(await pg.isSaveEnabled()).toBe(false); // unlike the duplicate-name case, this no-op stays pristine

    idx = await pg.getGridRowIndexByName('tblSections', name);
    await pg.editSectionName(idx, '   ');
    expect(await pg.getSectionNames()).toContain(name);
    expect(await pg.isSaveEnabled()).toBe(false);
    expect(await pg.getSectionRowCount()).toBe(SECTION_GRID_BASELINE.length);
  });

  test('TC-LOE-BASIC-025: Duplicate Section Name auto-reverts the display but leaves Save dirty (documented discrepancy)', { tag: '@C105382' }, async ({ localOfficeSettingsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-BASIC-001']);
    await pg.reloadBasicInfo(OFFICE_NO);
    const original = SECTION_TEST_VALUES.originalName; // 'AV Services'
    const dupTarget = GRID_TEST_VALUES.duplicateTarget;  // 'Flipcharts'
    expect(await pg.getSectionNames()).toEqual([...SECTION_GRID_BASELINE]);

    await pg.editGridRowNameByCurrentName('tblSections', original, dupTarget); // real keystrokes -- duplicate detection needs live typing
    const after = await pg.getSectionNames();
    expect(after).toContain(original); // reverted back, NOT renamed to the duplicate
    expect(after.filter(n => n === dupTarget)).toHaveLength(1); // still only one 'Flipcharts'
    expect(after).toEqual([...SECTION_GRID_BASELINE]); // content fully unchanged

    // Documented discrepancy: despite the unchanged display, Save is dirty (contradicts both the
    // module spec's persistent-icon description and the "simple control" pristine-revert pattern
    // seen elsewhere in this tab).
    expect(await pg.isSaveEnabled()).toBe(true);

    await pg.reloadBasicInfo(OFFICE_NO);
    expect(await pg.getSectionNames()).toEqual([...SECTION_GRID_BASELINE]);
    expect(await pg.isSaveEnabled()).toBe(false);
  });

  test('TC-LOE-BASIC-026: Escape mid-edit does NOT cancel an in-progress Section Name edit (confirms parity with ECT\'s Labor Cost grid, not an asymmetry)', { tag: '@C105383' }, async ({ localOfficeSettingsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-BASIC-001']);
    await pg.reloadBasicInfo(OFFICE_NO);
    const original = SECTION_TEST_VALUES.originalName;
    const temp = GRID_TEST_VALUES.escapeTempName;

    const rawValue = await pg.typeGridRowNameAndEscape('tblSections', original, temp);
    expect(rawValue).toBe(temp); // Escape did NOT revert the in-progress, uncommitted edit

    await pg.page.keyboard.press('Tab'); // now commit it
    expect(await pg.getSectionNames()).toContain(temp);
    expect(await pg.isSaveEnabled()).toBe(true);

    await pg.editGridRowNameByCurrentName('tblSections', temp, original);
    expect(await pg.getSectionNames()).toContain(original);

    await pg.reloadBasicInfo(OFFICE_NO);
    expect(await pg.getSectionNames()).toEqual([...SECTION_GRID_BASELINE]);
    expect(await pg.isSaveEnabled()).toBe(false);
  });

  test('TC-LOE-BASIC-027: Add New Section row -- new row defaults to Active=true and correctly dirties Save', { tag: '@C105384' }, async ({ localOfficeSettingsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-BASIC-001']);
    await pg.reloadBasicInfo(OFFICE_NO);
    expect(await pg.getSectionRowCount()).toBe(SECTION_GRID_BASELINE.length);

    await pg.addSection(SECTION_TEST_VALUES.newSection);
    expect(await pg.getSectionNames()).toContain(SECTION_TEST_VALUES.newSection);
    expect(await pg.getSectionRowCount()).toBe(SECTION_GRID_BASELINE.length + 1);
    const newIdx = await pg.getGridRowIndexByName('tblSections', SECTION_TEST_VALUES.newSection);
    expect(await pg.isSectionActive(newIdx)).toBe(true);
    expect(await pg.isSaveEnabled()).toBe(true);

    await pg.deleteGridRowByName('tblSections', SECTION_TEST_VALUES.newSection);
    expect(await pg.getSectionNames()).not.toContain(SECTION_TEST_VALUES.newSection);
    expect(await pg.getSectionRowCount()).toBe(SECTION_GRID_BASELINE.length);

    await pg.reloadBasicInfo(OFFICE_NO);
    expect(await pg.getSectionNames()).toEqual([...SECTION_GRID_BASELINE]);
    expect(await pg.isSaveEnabled()).toBe(false);
  });

  test('TC-LOE-BASIC-028: Delete an existing Section row via the right-click context menu and confirm it can be persisted then restored', { tag: '@C105385' }, async ({ localOfficeSettingsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-BASIC-001']);
    test.setTimeout(120_000);
    await pg.reloadBasicInfo(OFFICE_NO);
    const tempName = GRID_TEST_VALUES.deleteMeSection;

    await pg.addSection(tempName);
    expect(await pg.getSectionNames()).toContain(tempName);
    await pg.clickSaveAndConfirm();
    expect(await pg.isSaveEnabled()).toBe(false);

    await pg.reloadBasicInfo(OFFICE_NO);
    expect(await pg.getSectionNames()).toContain(tempName);
    expect(await pg.getSectionRowCount()).toBe(SECTION_GRID_BASELINE.length + 1);

    await pg.deleteGridRowByName('tblSections', tempName);
    expect(await pg.getSectionNames()).not.toContain(tempName);
    expect(await pg.getSectionRowCount()).toBe(SECTION_GRID_BASELINE.length);
    expect(await pg.isSaveEnabled()).toBe(true);

    await pg.clickSaveAndConfirm();
    await pg.reloadBasicInfo(OFFICE_NO);
    expect(await pg.getSectionNames()).toEqual([...SECTION_GRID_BASELINE]); // permanently gone, office left clean
  });

  test('TC-LOE-BASIC-029: Default Sections button reconciles module-spec list vs. data-file list, and its additions are NOT tracked by the form\'s dirty state', { tag: '@C105386' }, async ({ localOfficeSettingsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-BASIC-001']);
    test.setTimeout(120_000);
    await pg.reloadBasicInfo(OFFICE_NO);
    const before = await pg.getSectionNames();
    expect(before).toEqual([...SECTION_GRID_BASELINE]);
    for (const name of DEFAULT_SECTIONS_BUTTON_ADDS) expect(before).not.toContain(name);

    await pg.clickDefaultSection();
    const afterDefault = await pg.getSectionNames();
    for (const name of DEFAULT_SECTIONS_BUTTON_ADDS) expect(afterDefault).toContain(name);
    expect(afterDefault).toHaveLength(SECTION_GRID_BASELINE.length + DEFAULT_SECTIONS_BUTTON_ADDS.length);
    expect(await pg.isSaveEnabled()).toBe(false); // documented discrepancy: the mutation is not tracked as dirty

    await pg.reloadBasicInfo(OFFICE_NO);
    expect(await pg.getSectionNames()).toEqual([...SECTION_GRID_BASELINE]); // silently discarded -- never saved

    // Click Default again, then force the form dirty with an unrelated round-trip edit so the
    // additions actually get a chance to persist through a real Save.
    await pg.clickDefaultSection();
    const idx = await pg.getGridRowIndexByName('tblSections', SECTION_GRID_BASELINE[0]);
    await pg.toggleSectionActive(idx);
    await pg.toggleSectionActive(idx);
    expect(await pg.isSaveEnabled()).toBe(true);
    await pg.clickSaveAndConfirm();

    await pg.reloadBasicInfo(OFFICE_NO);
    const afterSave = await pg.getSectionNames();
    for (const name of DEFAULT_SECTIONS_BUTTON_ADDS) expect(afterSave).toContain(name); // now genuinely persisted

    for (const name of DEFAULT_SECTIONS_BUTTON_ADDS) {
      await pg.deleteGridRowByName('tblSections', name);
    }
    await pg.clickSaveAndConfirm();
    await pg.reloadBasicInfo(OFFICE_NO);
    expect(await pg.getSectionNames()).toEqual([...SECTION_GRID_BASELINE]); // office left clean
  });

  test('TC-LOE-BASIC-030: Unchecking Use Section gates the grid to read-only and disables the Default button', { tag: '@C105387' }, async ({ localOfficeSettingsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-BASIC-001']);
    await pg.reloadBasicInfo(OFFICE_NO);
    expect((await pg.getCheckboxState('chkUseSection')).checked).toBe(true);
    expect(await pg.isFieldDisabled('btnDefaultSection')).toBe(false);
    expect(await pg.isGridNameColumnReadOnly('tblSections')).toBe(false);

    await pg.uncheckCheckbox('chkUseSection');
    expect(await pg.isFieldDisabled('btnDefaultSection')).toBe(true);
    expect(await pg.isGridNameColumnReadOnly('tblSections')).toBe(true);
    const activeIdx = SECTION_GRID_BASELINE.findIndex(n => n !== SECTION_GRID_INACTIVE_ROW);
    expect(await pg.isSectionActive(activeIdx)).toBe(true); // Active state remains visible even though names are read-only
    expect(await pg.isSaveEnabled()).toBe(true);

    await pg.checkCheckbox('chkUseSection');
    expect(await pg.isFieldDisabled('btnDefaultSection')).toBe(false);
    expect(await pg.isGridNameColumnReadOnly('tblSections')).toBe(false);
    expect(await pg.isSaveEnabled()).toBe(false); // simple checkbox round-trip cleanly re-disables Save
  });

  test('TC-LOE-BASIC-031: Section grid auto-sorts rows alphabetically after each name commit', { tag: '@C105388' }, async ({ localOfficeSettingsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-BASIC-001']);
    await pg.reloadBasicInfo(OFFICE_NO);
    expect(await pg.getSectionNames()).toEqual([...SECTION_GRID_BASELINE]);

    await pg.editGridRowNameByCurrentName('tblSections', SECTION_TEST_VALUES.originalName, GRID_TEST_VALUES.sortsLastName);
    const afterRename = await pg.getSectionNames();
    expect(afterRename[afterRename.length - 1]).toBe(GRID_TEST_VALUES.sortsLastName); // moved to LAST position, not its original index

    await pg.editGridRowNameByCurrentName('tblSections', GRID_TEST_VALUES.sortsLastName, SECTION_TEST_VALUES.originalName);
    const afterRestore = await pg.getSectionNames();
    expect(afterRestore[0]).toBe(SECTION_TEST_VALUES.originalName); // back to alphabetically-first position

    await pg.reloadBasicInfo(OFFICE_NO);
    expect(await pg.getSectionNames()).toEqual([...SECTION_GRID_BASELINE]);
  });

  test('TC-LOE-BASIC-032: XSS payload typed into a new Section Name is stored and rendered as inert text, not executed', { tag: '@C105389' }, async ({ localOfficeSettingsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-BASIC-001']);
    await pg.reloadBasicInfo(OFFICE_NO);

    await pg.runWithNoAlertDialog(async () => {
      await pg.addSection(XSS_PAYLOAD);
    });
    const idx = await pg.getGridRowIndexByName('tblSections', XSS_PAYLOAD); // .value literally holds the payload -- proves it's stored as text
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(await pg.countScriptElements('tblSections')).toBe(0); // never parsed/injected as executable HTML

    await pg.deleteGridRowByName('tblSections', XSS_PAYLOAD);
    expect(await pg.getSectionNames()).toEqual(expect.not.arrayContaining([XSS_PAYLOAD]));

    await pg.reloadBasicInfo(OFFICE_NO);
    expect(await pg.getSectionNames()).toEqual([...SECTION_GRID_BASELINE]);
  });

  // ------------------------------------------------------------------------------------------
  // 6. Room Configuration Grid (CRUD, Duplicate, Trim)
  // ------------------------------------------------------------------------------------------

  test('TC-LOE-BASIC-033: Rename a room with leading/trailing whitespace and confirm trim-on-save', { tag: '@C105390' }, async ({ localOfficeSettingsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-BASIC-001']);
    test.setTimeout(90_000);
    await pg.reloadBasicInfo(OFFICE_NO);
    const original = ROOM_GRID_BASELINE[0]; // 'Ballroom A'
    const edited = 'Ballroom Test';

    await pg.editGridRowNameByCurrentName('tblRoomConfig', original, `  ${edited}  `);
    expect(await pg.getRoomNames()).toContain(edited); // trimmed on commit

    await pg.clickSaveAndConfirm();
    expect(await pg.isSaveEnabled()).toBe(false);

    await pg.reloadBasicInfo(OFFICE_NO);
    expect(await pg.getRoomNames()).toContain(edited); // trim persisted server-side

    await pg.editGridRowNameByCurrentName('tblRoomConfig', edited, original);
    await pg.clickSaveAndConfirm();
    await pg.reloadBasicInfo(OFFICE_NO);
    expect(await pg.getRoomNames()).toEqual([...ROOM_GRID_BASELINE]);
  });

  test('TC-LOE-BASIC-034: Empty and whitespace-only Room Configuration Name commits cleanly auto-revert with Save staying disabled', { tag: '@C105391' }, async ({ localOfficeSettingsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-BASIC-001']);
    await pg.reloadBasicInfo(OFFICE_NO);
    const name = ROOM_GRID_BASELINE[0];

    let idx = await pg.getGridRowIndexByName('tblRoomConfig', name);
    await pg.editRoomName(idx, '');
    expect(await pg.getRoomNames()).toContain(name);
    expect(await pg.isSaveEnabled()).toBe(false);

    idx = await pg.getGridRowIndexByName('tblRoomConfig', name);
    await pg.editRoomName(idx, '  ');
    expect(await pg.getRoomNames()).toContain(name);
    expect(await pg.isSaveEnabled()).toBe(false);
  });

  test('TC-LOE-BASIC-035: Duplicate Room Configuration Name auto-reverts the display but leaves Save dirty (parity with Section grid)', { tag: '@C105392' }, async ({ localOfficeSettingsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-BASIC-001']);
    await pg.reloadBasicInfo(OFFICE_NO);
    const original = ROOM_GRID_BASELINE[0]; // 'Ballroom A'
    const dupTarget = GRID_TEST_VALUES.roomDuplicateTarget; // 'Room Edit Test'
    expect(await pg.getRoomNames()).toEqual([...ROOM_GRID_BASELINE]);

    await pg.editGridRowNameByCurrentName('tblRoomConfig', original, dupTarget);
    const after = await pg.getRoomNames();
    expect(after).toContain(original);
    expect(after.filter(n => n === dupTarget)).toHaveLength(1);
    expect(after).toEqual([...ROOM_GRID_BASELINE]);
    expect(await pg.isSaveEnabled()).toBe(true); // same discrepancy as the Section grid, not unique to Sections

    await pg.reloadBasicInfo(OFFICE_NO);
    expect(await pg.getRoomNames()).toEqual([...ROOM_GRID_BASELINE]);
    expect(await pg.isSaveEnabled()).toBe(false);
  });

  test('TC-LOE-BASIC-036: Add New Room row -- new row defaults to Active=true and correctly dirties Save', { tag: '@C105393' }, async ({ localOfficeSettingsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-BASIC-001']);
    await pg.reloadBasicInfo(OFFICE_NO);
    expect(await pg.getRoomRowCount()).toBe(ROOM_GRID_BASELINE.length);

    await pg.addRoom(ROOM_TEST_VALUES.testRoom);
    expect(await pg.getRoomNames()).toContain(ROOM_TEST_VALUES.testRoom);
    expect(await pg.getRoomRowCount()).toBe(ROOM_GRID_BASELINE.length + 1);
    const idx = await pg.getGridRowIndexByName('tblRoomConfig', ROOM_TEST_VALUES.testRoom);
    expect(await pg.isRoomActive(idx)).toBe(true);
    expect(await pg.isSaveEnabled()).toBe(true);

    await pg.deleteGridRowByName('tblRoomConfig', ROOM_TEST_VALUES.testRoom);
    expect(await pg.getRoomNames()).not.toContain(ROOM_TEST_VALUES.testRoom);

    await pg.reloadBasicInfo(OFFICE_NO);
    expect(await pg.getRoomNames()).toEqual([...ROOM_GRID_BASELINE]);
    expect(await pg.isSaveEnabled()).toBe(false);
  });

  test('TC-LOE-BASIC-037: Delete an existing Room row via the right-click context menu and confirm it can be persisted then restored', { tag: '@C105394' }, async ({ localOfficeSettingsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-BASIC-001']);
    test.setTimeout(120_000);
    await pg.reloadBasicInfo(OFFICE_NO);
    const tempName = GRID_TEST_VALUES.deleteMeRoom;

    await pg.addRoom(tempName);
    await pg.clickSaveAndConfirm();
    expect(await pg.isSaveEnabled()).toBe(false);

    await pg.reloadBasicInfo(OFFICE_NO);
    expect(await pg.getRoomNames()).toContain(tempName);

    await pg.deleteGridRowByName('tblRoomConfig', tempName);
    expect(await pg.getRoomNames()).not.toContain(tempName);
    expect(await pg.isSaveEnabled()).toBe(true);

    await pg.clickSaveAndConfirm();
    await pg.reloadBasicInfo(OFFICE_NO);
    expect(await pg.getRoomNames()).toEqual([...ROOM_GRID_BASELINE]); // permanently gone, office left clean
  });

  // ------------------------------------------------------------------------------------------
  // 7. Discount Exemptions Grid
  // ------------------------------------------------------------------------------------------

  test('TC-LOE-BASIC-038: Exempt toggle is functional per-row; Service Type column stays read-only; no add/delete affordances exist', { tag: '@C105395' }, async ({ localOfficeSettingsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-BASIC-001']);
    await pg.reloadBasicInfo(OFFICE_NO);
    expect(await pg.getDiscountServiceTypeByIndex(0)).toBe(DISCOUNT_EXEMPTION_TEST.firstServiceType);
    const originalExempt = await pg.isDiscountRowExempt(0);
    expect(await pg.isSaveEnabled()).toBe(false);

    await pg.toggleExemption(0);
    expect(await pg.isDiscountRowExempt(0)).toBe(!originalExempt);
    expect(await pg.isSaveEnabled()).toBe(true);

    await pg.toggleExemption(0);
    expect(await pg.isDiscountRowExempt(0)).toBe(originalExempt);
    expect(await pg.isSaveEnabled()).toBe(true); // documented dirty-flag asymmetry -- does NOT re-disable on same-value revert

    expect(await pg.isDiscountServiceTypeReadOnly(0)).toBe(true);
    await pg.attemptEditDiscountServiceTypeCell(0);
    expect(await pg.isDiscountServiceTypeReadOnly(0)).toBe(true);

    await pg.reloadBasicInfo(OFFICE_NO);
    expect(await pg.isDiscountRowExempt(0)).toBe(originalExempt);
    expect(await pg.isSaveEnabled()).toBe(false);
  });

  // ------------------------------------------------------------------------------------------
  // 8. Company Logo Panel
  // ------------------------------------------------------------------------------------------

  test('TC-LOE-BASIC-039: Changing the Company Logo selection live-updates the preview image and dirties Save; reverting cleanly re-disables Save', { tag: '@C105396' }, async ({ localOfficeSettingsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-BASIC-001']);
    await pg.reloadBasicInfo(OFFICE_NO);
    expect(await pg.getComboboxValue('drpCompanyLogo')).toBe(COMPANY_LOGO.default);
    const originalSrc = await pg.getLogoPreviewSrc();
    expect(originalSrc).not.toBe('');

    const options = await pg.getComboboxOptionsList('drpCompanyLogo');
    expect(options).toHaveLength(COMPANY_LOGO.allOptions.length);
    for (const opt of COMPANY_LOGO.allOptions) expect(options).toContain(opt);

    await pg.selectComboboxExact('drpCompanyLogo', COMPANY_LOGO.alternate);
    expect(await pg.getComboboxValue('drpCompanyLogo')).toBe(COMPANY_LOGO.alternate);
    expect(await pg.getLogoPreviewSrc()).not.toBe(originalSrc);
    expect(await pg.isSaveEnabled()).toBe(true);

    await pg.selectComboboxExact('drpCompanyLogo', COMPANY_LOGO.default);
    expect(await pg.getComboboxValue('drpCompanyLogo')).toBe(COMPANY_LOGO.default);
    expect(await pg.getLogoPreviewSrc()).toBe(originalSrc);
    expect(await pg.isSaveEnabled()).toBe(false); // simple control -- cleanly re-disables Save, unlike a grid row
  });

  test('TC-LOE-BASIC-040: Quotes and Rental Orders/DROs checkboxes toggle independently of each other and of Company Logo', { tag: '@C105397' }, async ({ localOfficeSettingsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-BASIC-001']);
    await pg.reloadBasicInfo(OFFICE_NO);
    expect((await pg.getCheckboxState('chkLogoQuotes')).checked).toBe(true);
    expect((await pg.getCheckboxState('chkLogoRentalOrders')).checked).toBe(true);
    const originalLogo = await pg.getComboboxValue('drpCompanyLogo');

    await pg.uncheckCheckbox('chkLogoQuotes');
    expect((await pg.getCheckboxState('chkLogoQuotes')).checked).toBe(false);
    expect((await pg.getCheckboxState('chkLogoRentalOrders')).checked).toBe(true);
    expect(await pg.getComboboxValue('drpCompanyLogo')).toBe(originalLogo);
    expect(await pg.isSaveEnabled()).toBe(true);

    await pg.uncheckCheckbox('chkLogoRentalOrders');
    expect((await pg.getCheckboxState('chkLogoQuotes')).checked).toBe(false);
    expect((await pg.getCheckboxState('chkLogoRentalOrders')).checked).toBe(false);

    await pg.checkCheckbox('chkLogoQuotes');
    await pg.checkCheckbox('chkLogoRentalOrders');
    expect((await pg.getCheckboxState('chkLogoQuotes')).checked).toBe(true);
    expect((await pg.getCheckboxState('chkLogoRentalOrders')).checked).toBe(true);
    expect(await pg.isSaveEnabled()).toBe(false);
  });

  // ------------------------------------------------------------------------------------------
  // 9. Top-Level Save / Unsaved-Changes / Discard Flows
  // ------------------------------------------------------------------------------------------

  test('TC-LOE-BASIC-041: Save button click always raises the Save Changes confirmation dialog; Cancel aborts persistence', { tag: '@C105398' }, async ({ localOfficeSettingsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-BASIC-001']);
    await pg.reloadBasicInfo(OFFICE_NO);
    await pg.fillAndTab('txtPoNumber', 'PO-TEMP');
    expect(await pg.isSaveEnabled()).toBe(true);

    await pg.clickSaveButtonOnly();
    const dialogText = await pg.getTextContent('dlgSaveChanges');
    expect(dialogText).toContain(SAVE_CHANGES_DIALOG.heading);
    expect(dialogText).toContain(SAVE_CHANGES_DIALOG.body);

    await pg.clickSaveChangesCancelButton();
    expect(await pg.getInputValue('txtPoNumber')).toBe('PO-TEMP'); // no save/network call happened -- edit still present
    expect(await pg.isSaveEnabled()).toBe(true);

    await pg.clearAndTab('txtPoNumber');
    expect(await pg.getInputValue('txtPoNumber')).toBe('');
    expect(await pg.isSaveEnabled()).toBe(false);
  });

  test('TC-LOE-BASIC-042: Save Changes confirm dialog Save button persists the edit and re-disables the page-level Save button', { tag: '@C105399' }, async ({ localOfficeSettingsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-BASIC-001']);
    test.setTimeout(90_000);
    await pg.reloadBasicInfo(OFFICE_NO);
    await pg.fillAndTab('txtPhone2', PHONE_TEST_VALUES.recovery);
    expect(await pg.isSaveEnabled()).toBe(true);

    const result = await pg.clickSaveAndConfirm();
    expect(result.success).toBe(true);
    expect(await pg.isSaveEnabled()).toBe(false);

    await pg.reloadBasicInfo(OFFICE_NO);
    expect(await pg.getInputValue('txtPhone2')).toBe(PHONE_TEST_VALUES.recovery); // actually persisted server-side

    await pg.clearAndTab('txtPhone2');
    await pg.clickSaveAndConfirm();
    await pg.reloadBasicInfo(OFFICE_NO);
    expect(await pg.getInputValue('txtPhone2')).toBe(''); // office left clean
  });

  test('TC-LOE-BASIC-043: Unsaved Changes dialog Stay/Discard on tab switch behaves identically to the ECT Settings plan\'s documented dialog', { tag: '@C105400' }, async ({ localOfficeSettingsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-BASIC-001']);
    await pg.reloadBasicInfo(OFFICE_NO);
    await pg.fillAndTab('txtPoNumber', 'TEMP');
    expect(await pg.isSaveEnabled()).toBe(true);

    await pg.clickTabDirect('tabHistory');
    const dialog = pg.getUnsavedChangesDialog();
    await expect(dialog).toBeVisible();
    const dialogText = await pg.getTextContent('dlgUnsavedLocalOffice');
    expect(dialogText).toContain(UNSAVED_CHANGES_DIALOG.heading);
    expect(dialogText).toContain(UNSAVED_CHANGES_DIALOG.body);

    await pg.clickUnsavedStay();
    expect(await pg.isTabSelected('tabBasicInformation')).toBe(true);
    expect(await pg.getInputValue('txtPoNumber')).toBe('TEMP');
    expect(await pg.isSaveEnabled()).toBe(true);

    await pg.clickTabDirect('tabHistory');
    await expect(dialog).toBeVisible();
    await pg.clickUnsavedDiscard();
    await expect.poll(() => pg.isTabSelected('tabHistory'), { timeout: 10_000 }).toBe(true);

    await pg.navigateToBasicInfoTab(OFFICE_NO);
    expect(await pg.getInputValue('txtPoNumber')).toBe(''); // fully reverted, no stale dirty state
    expect(await pg.isSaveEnabled()).toBe(false);
  });

  test('TC-LOE-BASIC-044: Hard page reload while Basic Information has unsaved edits triggers the native beforeunload dialog', { tag: '@C105401' }, async ({ localOfficeSettingsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-BASIC-001']);
    await pg.reloadBasicInfo(OFFICE_NO);
    await pg.fillAndTab('txtPrepDateOffset', DATE_OFFSET_TEST_VALUES.valid); // '-2'
    expect(await pg.getInputValue('txtPrepDateOffset')).toBe(DATE_OFFSET_TEST_VALUES.valid);
    expect(await pg.isSaveEnabled()).toBe(true);

    const sawNativeDialog = await pg.hardReloadExpectingBeforeunload();
    expect(sawNativeDialog).toBe(true);

    await pg.waitForBasicInfoForm(); // reload lands back on the default (Basic Information) tab
    expect(await pg.getInputValue('txtPrepDateOffset')).toBe(DATE_OFFSET_TEST_VALUES.recovery); // '-1', the saved default
    expect(await pg.isSaveEnabled()).toBe(false);
  });

  // ------------------------------------------------------------------------------------------
  // 10. Negative & Edge Cases
  // ------------------------------------------------------------------------------------------

  test('TC-LOE-BASIC-045: Rapid tab-away mid-edit across multiple dirty panels is handled consistently by a single Unsaved Changes dialog', { tag: '@C105402' }, async ({ localOfficeSettingsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-BASIC-001']);
    test.setTimeout(90_000);
    await pg.reloadBasicInfo(OFFICE_NO);
    const sectionOriginal = SECTION_TEST_VALUES.originalName;
    const sectionTemp = 'AV Test Multi';

    // Dirty three different panels at once, without saving.
    await pg.fillAndTab('txtPrepDateOffset', DATE_OFFSET_TEST_VALUES.valid);
    await pg.checkCheckbox('chkSamePriority');
    await pg.editGridRowNameByCurrentName('tblSections', sectionOriginal, sectionTemp);
    expect(await pg.isSaveEnabled()).toBe(true);

    await pg.clickTabDirect('tabEctSettings');
    await expect(pg.getUnsavedChangesDialog()).toBeVisible();
    await pg.clickUnsavedStay();
    expect(await pg.isTabSelected('tabBasicInformation')).toBe(true);
    expect(await pg.getInputValue('txtPrepDateOffset')).toBe(DATE_OFFSET_TEST_VALUES.valid);
    expect((await pg.getCheckboxState('chkSamePriority')).checked).toBe(true);
    expect(await pg.getSectionNames()).toContain(sectionTemp);
    expect(await pg.isSaveEnabled()).toBe(true);

    await pg.clickTabDirect('tabEctSettings');
    await pg.clickUnsavedDiscard();
    await expect.poll(() => pg.isTabSelected('tabEctSettings'), { timeout: 10_000 }).toBe(true);

    await pg.navigateToBasicInfoTab(OFFICE_NO);
    // ALL THREE edits reverted simultaneously -- Discard is not scoped to only the last-touched panel.
    expect(await pg.getInputValue('txtPrepDateOffset')).toBe(DATE_OFFSET_TEST_VALUES.recovery);
    expect((await pg.getCheckboxState('chkSamePriority')).checked).toBe(false);
    expect(await pg.getSectionNames()).toEqual([...SECTION_GRID_BASELINE]);
    expect(await pg.isSaveEnabled()).toBe(false);
  });

  test('TC-LOE-BASIC-046: Non-numeric and out-of-pattern input across all six offset fields is rejected consistently (consolidated pass)', { tag: '@C105403' }, async ({ localOfficeSettingsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-BASIC-001']);
    await pg.reloadBasicInfo(OFFICE_NO);
    for (const { key, value } of DATE_OFFSET_DEFAULTS) {
      expect(await pg.getInputValue(key), key).toBe(value);
    }
    expect(await pg.isSaveEnabled()).toBe(false);

    const nonNumericValues: Record<string, string> = {
      txtPrepDateOffset: 'xx1', txtReturnDateOffset: 'yy2', txtSetDateOffset: 'zz3',
      txtStrikeDateOffset: 'aa4', txtDeliveryDateOffset: 'bb5', txtPickupDateOffset: 'cc6',
    };
    for (const [key, val] of Object.entries(nonNumericValues)) {
      await pg.fillAndTab(key, val);
      expect(await pg.getInputValue(key), key).toBe(val);
      expect(await pg.expectInvalid(key), key).toBe(true);
      expect(await pg.isSaveEnabled()).toBe(false); // at least one field is invalid at every point in this sequence
    }
    // Editing one field never clears a previously-edited field's invalid state.
    for (const key of Object.keys(nonNumericValues)) {
      expect(await pg.isFieldInvalid(key), key).toBe(true);
    }

    for (const { key, value } of DATE_OFFSET_DEFAULTS) {
      await pg.fillAndTab(key, value);
      expect(await pg.expectValid(key), key).toBe(true);
    }
    expect(await pg.isSaveEnabled()).toBe(false); // full multi-field clean recovery
  });

  test('TC-LOE-BASIC-047: XSS payload across PO Number, PO Number Label, Phone 1, and Phone 2 is stored/rendered as inert text', { tag: '@C105404' }, async ({ localOfficeSettingsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-BASIC-001']);
    await pg.reloadBasicInfo(OFFICE_NO);

    await pg.runWithNoAlertDialog(async () => {
      await pg.fillAndTab('txtPoNumber', XSS_PAYLOAD);
      await pg.fillAndTab('txtPoNumberLabel', XSS_PAYLOAD);
      await pg.fillAndTab('txtPhone2', XSS_PAYLOAD);
      await pg.fillAndTab('txtPhone1', XSS_PAYLOAD);
    });

    expect(await pg.getInputValue('txtPoNumber')).toBe(XSS_PAYLOAD);
    expect(await pg.getInputValue('txtPoNumberLabel')).toBe(XSS_PAYLOAD);
    expect(await pg.getInputValue('txtPhone2')).toBe(XSS_PAYLOAD);
    expect(await pg.isFieldInvalid('txtPhone2')).toBe(false);
    expect(await pg.getInputValue('txtPhone1')).toBe(XSS_PAYLOAD);
    expect(await pg.isFieldInvalid('txtPhone1')).toBe(false); // required-ness only -- any non-empty string satisfies it
    expect(await pg.countScriptElements('frmBasicInfo')).toBe(0);

    await pg.clearAndTab('txtPoNumber');
    await pg.clearAndTab('txtPoNumberLabel');
    await pg.clearAndTab('txtPhone2');
    await pg.fillAndTab('txtPhone1', DEFAULT_PHONE_1);
    expect(await pg.getInputValue('txtPoNumber')).toBe('');
    expect(await pg.getInputValue('txtPoNumberLabel')).toBe('');
    expect(await pg.getInputValue('txtPhone2')).toBe('');
    expect(await pg.getInputValue('txtPhone1')).toBe(DEFAULT_PHONE_1);
    expect(await pg.isSaveEnabled()).toBe(false);
    expect(await pg.countScriptElements('frmBasicInfo')).toBe(0); // no residual script injection anywhere in the form
  });

  test('TC-LOE-BASIC-048: Simultaneous dirty edits across a top-level field AND a grid row require different revert strategies (documents the dirty-flag asymmetry end-to-end)', { tag: '@C105405' }, async ({ localOfficeSettingsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-BASIC-001']);
    await pg.reloadBasicInfo(OFFICE_NO);
    await pg.fillAndTab('txtReturnDateOffset', '2');
    expect(await pg.isSaveEnabled()).toBe(true);
    await pg.fillAndTab('txtReturnDateOffset', '1');
    expect(await pg.getInputValue('txtReturnDateOffset')).toBe('1');
    expect(await pg.isSaveEnabled()).toBe(false); // simple field alone correctly recomputes pristine

    const roomName = ROOM_GRID_BASELINE[0]; // 'Ballroom A'
    await pg.editGridRowNameByCurrentName('tblRoomConfig', roomName, 'Ballroom X');
    await pg.editGridRowNameByCurrentName('tblRoomConfig', 'Ballroom X', roomName);
    expect(await pg.getRoomNames()).toContain(roomName);
    expect(await pg.isSaveEnabled()).toBe(true); // grid-row edit alone does NOT recompute pristine, even at the same final value

    await pg.reloadBasicInfo(OFFICE_NO);
    expect(await pg.getInputValue('txtReturnDateOffset')).toBe('1');
    expect(await pg.getRoomNames()).toEqual([...ROOM_GRID_BASELINE]);
    expect(await pg.isSaveEnabled()).toBe(false);
  });

  test('TC-LOE-BASIC-049: Hard reload mid-edit with edits spanning multiple panels discards all of them uniformly', { tag: '@C105406' }, async ({ localOfficeSettingsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-BASIC-001']);
    await pg.reloadBasicInfo(OFFICE_NO);
    await pg.fillAndTab('txtSetDateOffset', '-3');
    await pg.fillAndTab('txtPoNumber', 'TEMP-PO');
    const originalExempt = await pg.isDiscountRowExempt(0);
    await pg.toggleExemption(0);
    expect(await pg.isSaveEnabled()).toBe(true);

    const sawNativeDialog = await pg.hardReloadExpectingBeforeunload();
    expect(sawNativeDialog).toBe(true);
    await pg.waitForBasicInfoForm();

    expect(await pg.getInputValue('txtSetDateOffset')).toBe('-1');
    expect(await pg.getInputValue('txtPoNumber')).toBe('');
    expect(await pg.isDiscountRowExempt(0)).toBe(originalExempt);
    expect(await pg.isSaveEnabled()).toBe(false);
  });

  // ------------------------------------------------------------------------------------------
  // 11. Cross-Office Edge-Case Coverage (states observed live on office 1101, simulated on 1604)
  // ------------------------------------------------------------------------------------------
  // A live coverage audit against office 1101 (Corporate Office Encore USA SGA) found two grid
  // states that occur naturally there but were never exercised against 1604: a genuinely empty
  // Room Configuration grid, and a Section grid where all 9 of the Default button's module-spec
  // names already exist. Both are simulated here on 1604 (the office every other test in this
  // file targets) with the same delete/seed -> verify -> restore rigor as the rest of the suite,
  // rather than mutating the real corporate office 1101 directly.

  test('TC-LOE-BASIC-050: Room Configuration grid behaves correctly with zero data rows (simulated empty-grid state observed live on office 1101), restored afterward', { tag: '@C105407' }, async ({ localOfficeSettingsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-BASIC-001', 'TC-LOE-BASIC-037']);
    test.setTimeout(180_000);
    await pg.reloadBasicInfo(OFFICE_NO);
    expect(await pg.getRoomNames()).toEqual([...ROOM_GRID_BASELINE]);

    // Empty the grid for real (delete every row, then Save + reload) so the next assertions are
    // against a genuinely fresh-loaded empty grid, not just an in-memory dirty state.
    for (const name of ROOM_GRID_BASELINE) {
      await pg.deleteGridRowByName('tblRoomConfig', name);
    }
    expect(await pg.getRoomRowCount()).toBe(0);
    await pg.clickSaveAndConfirm();
    expect(await pg.isSaveEnabled()).toBe(false);

    await pg.reloadBasicInfo(OFFICE_NO);
    expect(await pg.getRoomRowCount()).toBe(0); // matches office 1101's live "add new row" placeholder only

    // Add New on a truly empty grid inserts the very first-ever row, Active=true by default --
    // never exercised by TC-036 (which always had 4 pre-existing rows as context).
    const firstEverRoom = 'First Ever Room';
    await pg.addRoom(firstEverRoom);
    expect(await pg.getRoomNames()).toEqual([firstEverRoom]);
    const idx = await pg.getGridRowIndexByName('tblRoomConfig', firstEverRoom);
    expect(await pg.isRoomActive(idx)).toBe(true);
    expect(await pg.isSaveEnabled()).toBe(true);

    await pg.deleteGridRowByName('tblRoomConfig', firstEverRoom);
    expect(await pg.getRoomRowCount()).toBe(0);
    await pg.clickSaveAndConfirm();

    // Restore the original 4-row baseline -- addRoom's alphabetical auto-sort lands on the same
    // order as ROOM_GRID_BASELINE regardless of the order added back in.
    for (const name of ROOM_GRID_BASELINE) {
      await pg.addRoom(name);
    }
    expect(await pg.getRoomNames()).toEqual([...ROOM_GRID_BASELINE]);
    await pg.clickSaveAndConfirm();

    await pg.reloadBasicInfo(OFFICE_NO);
    expect(await pg.getRoomNames()).toEqual([...ROOM_GRID_BASELINE]);
    for (let i = 0; i < ROOM_GRID_BASELINE.length; i++) {
      expect(await pg.isRoomActive(i), `room row ${i}`).toBe(true);
    }
    expect(await pg.isSaveEnabled()).toBe(false);
  });

  test('TC-LOE-BASIC-051: Default Sections button adds zero rows once all 9 module-spec names already exist (complements TC-029\'s "adds exactly 2" case; state observed live on office 1101)', { tag: '@C105408' }, async ({ localOfficeSettingsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-BASIC-001', 'TC-LOE-BASIC-029']);
    test.setTimeout(150_000);
    await pg.reloadBasicInfo(OFFICE_NO);
    expect(await pg.getSectionNames()).toEqual([...SECTION_GRID_BASELINE]);

    // Pre-seed the 2 names TC-029 proved are missing, via a real Add (not the Default button), so
    // the grid genuinely contains all 9 module-spec names -- reproducing the state observed live
    // on office 1101, where Default legitimately has nothing left to add.
    for (const name of DEFAULT_SECTIONS_BUTTON_ADDS) {
      await pg.addSection(name);
    }
    await pg.clickSaveAndConfirm();
    await pg.reloadBasicInfo(OFFICE_NO);
    const seeded = await pg.getSectionNames();
    expect(seeded).toHaveLength(SECTION_GRID_BASELINE.length + DEFAULT_SECTIONS_BUTTON_ADDS.length);
    for (const name of DEFAULT_SECTIONS_MODULE_SPEC) {
      expect(seeded, `${name} present`).toContain(name);
    }

    // Now every one of the module spec's 9 names already exists -- Default should add nothing.
    await pg.clickDefaultSection();
    const afterDefault = await pg.getSectionNames();
    expect(afterDefault).toEqual(seeded); // no new rows, no change at all
    expect(await pg.isSaveEnabled()).toBe(false);

    // Restore the original 14-row baseline.
    for (const name of DEFAULT_SECTIONS_BUTTON_ADDS) {
      await pg.deleteGridRowByName('tblSections', name);
    }
    await pg.clickSaveAndConfirm();
    await pg.reloadBasicInfo(OFFICE_NO);
    expect(await pg.getSectionNames()).toEqual([...SECTION_GRID_BASELINE]);
  });
});
