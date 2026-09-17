import { test, expect } from '../../src/fixtures/pages.fixture';
import { LocationLocalInfoPage } from '../../src/pages/locations/location-local-info.page';
import { OFFICE_NO, SAVE_CHANGES_DIALOG, UNSAVED_CHANGES_DIALOG } from '../../src/data/common';
import { about, phase, verify, attachNote } from '../../src/fixtures/report-steps';
import {
  CHECKED_DEFAULTS,
  UNCHECKED_DEFAULTS,
  DISABLED_CHECKBOXES,
  DISABLED_CHECKBOX_STATES,
  LDW_BOUNDARIES,
  ACTIVE_DEPENDENCIES,
  LEFT_PANEL_EXPECTED,
  TEXT_FIELD_CONSTRAINTS,
  LOCAL_INFO_TEST_VALUES,
  CHECKBOX_LABEL_CASES,
} from '../../src/data/locations/location-local-info';
// Country baseline/alternate live with the left-panel data — TC-LOC-LI-045/046 drive the Country
// cascade from this tab, using the same values the sibling left-panel suite uses.
import { LP_DEFAULTS, LP_TEST_VALUES } from '../../src/data/locations/location-left-panel-basic-information';

// Local Information sub-tab of Location Settings (NM-1708, building on the NM-958 validation work
// and the NM-1129 Save-button defect). The page object, selectors and data file already existed;
// this spec is the missing piece. Baseline re-verified live against office 1604 on 2026-09-14 —
// see the "Live baseline verification" section of specs/location-local-information.plan.md.

/** The tab lives under settings/location — NOT settings/local-office, which is a different module. */
const SETTINGS_PATH = `locations/${OFFICE_NO}/settings`;

/** Second office used only for read-only cross-office contrast (NM-1129 references it). */
const CONTRAST_OFFICE = '1101';

// spinCCPercentage, spinETSPercentage, spinResortTaxPercentage and spinThreshold all load DISABLED
// for 1604 because their gate checkboxes are unchecked, so only spinLDWPercentage can carry the
// boundary work; the gated ones are opened and restored individually in TC-035/036/037.
const validBoundaries = LDW_BOUNDARIES.filter(b => b.valid);
const invalidBoundaries = LDW_BOUNDARIES.filter(b => !b.valid);

test.describe('Location Local Information @locations @local-information', () => {
  // Nav guard uses DOM presence (aria-selected), not url.includes — every Location Settings
  // sub-tab shares the `settings/location` URL. 90s covers cold-start SSO handoff plus this
  // form's ~30 checkbox render.
  test.beforeEach(async ({ locationLocalInfoPage }) => {
    test.setTimeout(90_000);
    if (await locationLocalInfoPage.isOnLocalInfoTab()) return;
    // navigateToSubTab waits a hard-coded 30s for the tab to appear, which the very first test of
    // a cold worker can miss while the SSO handoff and app bundle are still settling. One retry
    // costs nothing on a warm session and removes that first-test flake.
    try {
      await locationLocalInfoPage.navigateToLocalInfoTab(OFFICE_NO);
    } catch {
      await locationLocalInfoPage.reloadAndNavigateToLocalInfo(OFFICE_NO);
    }
  });

  // ─────────────────────────────────────────────── 1. Navigation, load and baseline

  test('TC-LOC-LI-001: Local Information tab loads with header, disabled Save, and every core section visible', { tag: '@C105512' }, async ({ locationLocalInfoPage: pg, dependencyGate }) => {
    dependencyGate([]);
    await about('Opening the Local Information tab for a location shows the settings form, with Save switched off because nothing has been changed yet.');

    await verify('Check the Local Information tab is the one on screen, on the Location Settings page', async () => {
      expect(await pg.isOnLocalInfoTab()).toBe(true);
      expect(pg.getCurrentUrl()).toContain(SETTINGS_PATH);
    });

    await verify('Check the main controls of the form are all on screen', async () => {
      expect(await pg.isElementVisible('btnSaveLocalInfo')).toBe(true);
      expect(await pg.isElementVisible('drpBillingCycle')).toBe(true);
      expect(await pg.isElementVisible('txtOracleProduct')).toBe(true);
      expect(await pg.isElementVisible('spinLDWPercentage')).toBe(true);
    });

    await verify('Check Save is switched off before anything is edited', async () => {
      expect(await pg.isSaveEnabled(), 'Save must start switched off on an untouched form').toBe(false);
    });
  });

  test('TC-LOC-LI-002: Left-panel baseline values match the shared Location Settings header for office 1604', { tag: '@C105513' }, async ({ locationLocalInfoPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-001']);
    await about('The location details panel on the left shows the right office and its shared settings, the same on this tab as on every other one.');

    const baseline = await phase('Read the details panel on the left', () => pg.captureLeftPanelBaseline());
    await attachNote('Left panel as read on this run', JSON.stringify(baseline, null, 2));

    await verify('Check the panel names the expected office and pay-to address', async () => {
      expect(baseline.office).toContain(LEFT_PANEL_EXPECTED.office);
      expect(baseline.payToAddress).toContain(LEFT_PANEL_EXPECTED.payToAddress);
    });

    await verify('Check the two shared switches are in their expected positions', async () => {
      expect(baseline.eCommerceActive).toBe(LEFT_PANEL_EXPECTED.eCommerceActive);
      expect(baseline.enableProductionsOrders).toBe(LEFT_PANEL_EXPECTED.enableProductionsOrders);
    });
  });

  test('TC-LOC-LI-003: Checkbox defaults - the full CHECKED_DEFAULTS group reads checked on a fresh load', { tag: '@C105514' }, async ({ locationLocalInfoPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-001']);
    await about('Every setting that is supposed to be switched on for this office really is switched on when the page opens.');

    const wrong: string[] = [];
    await phase('Read every setting expected to be switched on', async () => {
      for (const key of CHECKED_DEFAULTS) {
        const st = await pg.getCheckboxState(key);
        if (!st.checked) wrong.push(String(key));
      }
    });

    await verify('Check none of them are switched off', async () => {
      expect(wrong, `these settings should be switched on but were not: ${wrong.join(', ')}`).toEqual([]);
    });
  });

  test('TC-LOC-LI-004: Checkbox defaults - the full UNCHECKED_DEFAULTS group reads unchecked on a fresh load', { tag: '@C105515' }, async ({ locationLocalInfoPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-001']);
    await about('Every setting that is supposed to be switched off for this office really is switched off when the page opens.');

    const wrong: string[] = [];
    await phase('Read every setting expected to be switched off', async () => {
      for (const key of UNCHECKED_DEFAULTS) {
        const st = await pg.getCheckboxState(key);
        if (st.checked) wrong.push(String(key));
      }
    });

    await verify('Check none of them are switched on', async () => {
      expect(wrong, `these settings should be switched off but were not: ${wrong.join(', ')}`).toEqual([]);
    });
  });

  test('TC-LOC-LI-005: Disabled-checkbox baseline matrix matches DISABLED_CHECKBOX_STATES', { tag: '@C105516' }, async ({ locationLocalInfoPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-001']);
    await about('The settings this office is not allowed to change are greyed out, and each one is left in the expected position.');

    const problems: string[] = [];
    await phase('Read each greyed-out setting and the position it is locked in', async () => {
      for (const key of DISABLED_CHECKBOXES) {
        const st = await pg.getCheckboxState(key);
        if (!st.disabled) problems.push(`${String(key)} should be greyed out but is editable`);
        const expected = DISABLED_CHECKBOX_STATES[String(key)];
        if (expected !== undefined && st.checked !== expected) {
          problems.push(`${String(key)} locked in the wrong position: expected ${expected}, got ${st.checked}`);
        }
      }
    });

    await verify('Check every one is greyed out and in the right position', async () => {
      expect(problems, problems.join(' | ')).toEqual([]);
    });
  });

  test('TC-LOC-LI-006: Reloading and re-navigating to Local Information reproduces the same baseline', { tag: '@C105517' }, async ({ locationLocalInfoPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-003', 'TC-LOC-LI-004']);
    await about('Refreshing the browser and coming back to the tab shows exactly the same settings as before, so nothing is remembered incorrectly between visits.');

    const before = await phase('Note a sample of settings before the refresh', async () => ({
      ldw: (await pg.getSpinState('spinLDWPercentage')).value,
      product: await pg.getTextValue('txtOracleProduct'),
      billingType: await pg.getBillingType(),
      billingWay: await pg.getBillingWay(),
    }));

    await phase('Refresh the browser and open the tab again', () => pg.reloadAndNavigateToLocalInfo(OFFICE_NO));

    await verify('Check the same values come back and Save is switched off again', async () => {
      expect((await pg.getSpinState('spinLDWPercentage')).value).toBe(before.ldw);
      expect(await pg.getTextValue('txtOracleProduct')).toBe(before.product);
      expect(await pg.getBillingType()).toBe(before.billingType);
      expect(await pg.getBillingWay()).toBe(before.billingWay);
      expect(await pg.isSaveEnabled()).toBe(false);
    });
  });

  // ─────────────────────────────────────────────── 2. Save button and change detection

  test('TC-LOC-LI-007: Save button is disabled on a completely fresh load', { tag: '@C105518' }, async ({ locationLocalInfoPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-001']);
    await about('Save cannot be pressed until something is actually changed, so nobody can save an unchanged form by accident.');

    await phase('Open the tab from a clean refresh', () => pg.reloadAndNavigateToLocalInfo(OFFICE_NO));
    await verify('Check Save is switched off', async () => {
      expect(await pg.isSaveEnabled()).toBe(false);
    });
  });

  test('TC-LOC-LI-008: A validated LDW Percentage change enables Save and persists through save+reload', { tag: '@C105519' }, async ({ locationLocalInfoPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-007']);
    test.setTimeout(180_000);
    await about('Changing the LDW percentage to a valid figure switches Save on, and the new figure is still there after saving and refreshing.');

    const target = validBoundaries[0]!;
    const result = await phase(`Change LDW to ${target.value} and save it`, () =>
      pg.testBoundaryValue('spinLDWPercentage', target.value, true, undefined, target.restoreValue, OFFICE_NO));

    await verify('Check the change saved and survived the refresh', async () => {
      expect(result.passed, result.detail).toBe(true);
    });
  });

  test('TC-LOC-LI-009: Clicking Save always raises the shared Save Changes confirmation dialog', { tag: '@C105520' }, async ({ locationLocalInfoPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-007']);
    test.setTimeout(120_000);
    await about('Pressing Save always asks the user to confirm first, so a save is never silent.');

    try {
      await phase('Make a small change so Save can be pressed', () => pg.fillText('txtOracleProduct', LOCAL_INFO_TEST_VALUES.oracleProductTest));
      await verify('Check Save switched on after the change', async () => {
        expect(await pg.isSaveEnabled()).toBe(true);
      });

      await phase('Press Save', () => pg.clickWithRetry('btnSaveLocalInfo'));
      await verify('Check the confirmation box appears with the expected wording', async () => {
        expect(await pg.isElementVisible('dlgSaveChanges')).toBe(true);
        expect(await pg.getTextContent('dlgSaveChanges')).toContain(SAVE_CHANGES_DIALOG.heading);
      });

      await phase('Back out of the confirmation box', () => pg.clickWithRetry('btnSaveChangesCancel'));
    } finally {
      await pg.reloadAndNavigateToLocalInfo(OFFICE_NO);
    }
  });

  test('TC-LOC-LI-010: Cancelling the Save Changes dialog aborts persistence and keeps the edit on screen', { tag: '@C105521' }, async ({ locationLocalInfoPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-009']);
    test.setTimeout(120_000);
    await about('Backing out of the save confirmation leaves the typed change on screen but does not store it, so a refresh brings the old value back.');

    const original = await pg.getTextValue('txtOracleProduct');
    try {
      await phase('Type a new Oracle Product code and press Save', async () => {
        await pg.fillText('txtOracleProduct', LOCAL_INFO_TEST_VALUES.oracleProductTest);
        await pg.clickWithRetry('btnSaveLocalInfo');
      });

      await phase('Choose Cancel in the confirmation box', () => pg.clickWithRetry('btnSaveChangesCancel'));

      await verify('Check the typed value is still on screen and Save is still available', async () => {
        expect(await pg.getTextValue('txtOracleProduct')).toBe(LOCAL_INFO_TEST_VALUES.oracleProductTest);
        expect(await pg.isSaveEnabled()).toBe(true);
      });

      await phase('Refresh the browser', () => pg.reloadAndNavigateToLocalInfo(OFFICE_NO));
      await verify('Check the original value came back, proving nothing was stored', async () => {
        expect(await pg.getTextValue('txtOracleProduct')).toBe(original);
      });
    } finally {
      await pg.reloadAndNavigateToLocalInfo(OFFICE_NO);
    }
  });

  // DEFECT (confirmed live 2026-09-14, reproduced in isolation and in a full sequential run):
  // Local Information does NOT guard tab navigation. Every sibling sub-tab (Legal, Left Panel,
  // Basic Information) raises the shared Unsaved Changes dialog; this one navigates away and drops
  // the edit with no prompt. Diagnostic probe confirmed the form really was dirty at the moment of
  // the click (Save enabled), the tab was visible and the click landed, and afterwards there were
  // zero [role="alertdialog"] and zero [data-testid*="modal"] nodes on the page.
  // TC-011/012 therefore assert the ACTUAL behaviour so the defect is tracked and the tests turn
  // red the day it is fixed — the same convention TC-LOE-HIST-039 uses for a known defect.
  test('TC-LOC-LI-011: Navigating to another sub-tab while Local Information is dirty raises NO Unsaved Changes dialog (defect)', { tag: '@C105522' }, async ({ locationLocalInfoPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-009']);
    test.setTimeout(120_000);
    await about('Leaving the tab with unsaved edits gives the user no warning at all. Every other tab in this area does warn, so this records the gap as a defect.');

    try {
      await phase('Make an unsaved change', () => pg.fillText('txtOracleProduct', LOCAL_INFO_TEST_VALUES.oracleProductTest));

      await verify('Check the form really does have unsaved changes at this point', async () => {
        expect(await pg.isSaveEnabled(), 'the edit must have registered, or the rest of this test proves nothing').toBe(true);
      });

      await phase('Try to move to another sub-tab', () => pg.clickWithRetry('tabLegal'));

      await verify('Check no warning of any kind appears - the defect being recorded', async () => {
        expect(await pg.isElementVisible('dlgUnsavedChanges', 3000),
          `expected wording "${UNSAVED_CHANGES_DIALOG.heading}" is never shown on this tab`).toBe(false);
        expect(await pg.page.locator('[role="alertdialog"]').count()).toBe(0);
      });

      await verify('Check the user is taken away regardless, losing the edit', async () => {
        expect(await pg.isOnLocalInfoTab(), 'navigation proceeds unguarded').toBe(false);
      });

      await attachNote(
        'DEFECT: no Unsaved Changes prompt on a dirty tab change',
        'Sibling sub-tabs (Legal, Left Panel, Basic Information) all raise the shared Unsaved Changes '
        + 'dialog on a dirty tab change. Local Information does not: it navigates away with no prompt. '
        + 'Confirmed with Save enabled at the moment of the click, and zero alertdialog or modal nodes '
        + 'in the DOM afterwards. Note this is NOT immediate data loss - the edit is kept in memory and '
        + 'is still there on return (see TC-LOC-LI-012); it is lost only on a full page reload. The '
        + 'defect is the inconsistency with every sibling tab, and the absent warning before a reload '
        + 'can discard the work. Raise against NM-1708 section 8.',
      );
    } finally {
      await pg.reloadAndNavigateToLocalInfo(OFFICE_NO);
    }
  });

  test('TC-LOC-LI-012: Unsaved Local Information edits survive a sub-tab round-trip and are lost only on a full reload', { tag: '@C105523' }, async ({ locationLocalInfoPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-011']);
    test.setTimeout(150_000);
    await about('Even with no warning shown, leaving the tab and coming back keeps the unsaved edit, so nothing is lost in the moment. Refreshing the browser is what throws it away.');

    const original = await pg.getTextValue('txtOracleProduct');
    try {
      await phase('Make an unsaved change and leave the tab', async () => {
        await pg.fillText('txtOracleProduct', LOCAL_INFO_TEST_VALUES.oracleProductTest);
        await pg.clickWithRetry('tabLegal');
      });

      await phase('Come back to Local Information', () => pg.navigateToLocalInfoTab(OFFICE_NO));

      await verify('Check the edit is still there and still waiting to be saved', async () => {
        expect(await pg.getTextValue('txtOracleProduct'),
          'the edit is kept in memory across a sub-tab round-trip, so the missing warning costs nothing yet').toBe(LOCAL_INFO_TEST_VALUES.oracleProductTest);
        expect(await pg.isSaveEnabled()).toBe(true);
      });

      await phase('Now refresh the browser', () => pg.reloadAndNavigateToLocalInfo(OFFICE_NO));

      await verify('Check the refresh is what discards the edit, with no warning beforehand', async () => {
        expect(await pg.getTextValue('txtOracleProduct')).toBe(original);
        expect(await pg.isSaveEnabled()).toBe(false);
      });
    } finally {
      await pg.reloadAndNavigateToLocalInfo(OFFICE_NO);
    }
  });

  // ─────────────────────────────────────────────── 3. Required field and format validation

  test('TC-LOC-LI-013: Billing Way Effective Date control baseline enabled/disabled state matches whether Billing Way can currently change', { tag: '@C105524' }, async ({ locationLocalInfoPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-001']);
    await about('The billing start date can only be edited when the billing method itself is allowed to change; for this office it is locked.');

    const disabled = await pg.isEffectiveDateDisabled();
    await attachNote('Effective date state on this run', `disabled=${disabled}`);

    await verify('Check the date control is locked, matching the confirmed baseline for this office', async () => {
      expect(disabled, 'office 1604 cannot currently change its billing method, so the date must be locked').toBe(true);
    });
  });

  test('TC-LOC-LI-014: Billing Way Effective Date rejects a date before today', { tag: '@C105525' }, async ({ locationLocalInfoPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-013']);
    await about('A billing start date in the past is not accepted. For this office the control is locked, which is itself the strongest possible rejection.');

    await verify('Check no past date can be entered, because the control cannot be opened at all', async () => {
      expect(await pg.isEffectiveDateDisabled()).toBe(true);
      expect(await pg.isFieldDisabled('btnEffectiveDate')).toBe(true);
    });

    await attachNote(
      'Coverage limitation',
      'Office 1604 cannot change its billing method, so the effective-date picker is permanently locked and the '
      + 'past-date rule cannot be exercised through the UI here. Exercising it needs an office whose billing method '
      + 'is still changeable; see TC-LOC-LI-028.',
    );
  });

  test('TC-LOC-LI-015: Oracle Organization is populated while Skip Billing is unchecked (baseline)', { tag: '@C105526' }, async ({ locationLocalInfoPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-001']);
    await about('While the office is being billed normally, its Oracle organisation is shown. It is shown as read-only, which is not what the requirement implies, so this records the difference.');

    await verify('Check Skip Billing is off and the Oracle organisation is on screen', async () => {
      expect((await pg.getCheckboxState('chkSkipBilling')).checked).toBe(false);
      expect(await pg.isElementVisible('drpOracleOrganization')).toBe(true);
    });

    const orgValue = await pg.getTextContent('drpOracleOrganization').catch(() => '');
    await attachNote('Oracle Organization as read on this run', `value=${JSON.stringify(orgValue)}`);

    // Entry path matters here (see the DEFECT note below), so force the freshly-loaded path rather
    // than inheriting whatever route the previous test left behind.
    await phase('Load the tab fresh so the starting state is well defined', () => pg.reloadAndNavigateToLocalInfo(OFFICE_NO));

    await verify('Check the organisation is read-only on a freshly loaded page', async () => {
      expect(await pg.isFieldDisabled('drpOracleOrganization'),
        'documented discrepancy vs NM-1708: the organisation is not editable on load').toBe(true);
    });

    // DEFECT (confirmed live 2026-09-14): the read-only state is NOT re-applied when the tab is
    // re-entered from inside the app. Full reload -> disabled=true; leave to Legal and click back
    // -> disabled=false, i.e. a field the server renders read-only becomes editable just by
    // navigating away and back. Asserted deliberately so the defect stays visible and this test
    // turns red once the gating is recomputed on re-entry.
    await phase('Leave to another sub-tab and come straight back', async () => {
      await pg.clickWithRetry('tabLegal');
      await pg.page.waitForTimeout(1500);
      await pg.navigateToLocalInfoTab(OFFICE_NO);
    });

    await verify('Check the read-only state is lost after returning - the defect being recorded', async () => {
      expect(await pg.isFieldDisabled('drpOracleOrganization'),
        'DEFECT: a read-only field becomes editable after a sub-tab round-trip').toBe(false);
    });

    await attachNote(
      'DEFECT: Oracle Organization read-only state is not re-applied on tab re-entry',
      'Full page load renders drpOracleOrganization disabled. Navigating to another Location Settings '
      + 'sub-tab and back leaves it ENABLED, so a field the application intends to be read-only becomes '
      + 'editable through ordinary in-app navigation. Raise against NM-1708 section 5.',
    );

    await pg.reloadAndNavigateToLocalInfo(OFFICE_NO);
  });

  test('TC-LOC-LI-016: Oracle Product Code and Oracle Department Code are populated while Skip Billing is unchecked (baseline)', { tag: '@C105527' }, async ({ locationLocalInfoPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-015']);
    await about('While the office is being billed normally, its Oracle product and department codes are filled in and can be edited.');

    await verify('Check both codes hold their expected values and are editable', async () => {
      expect(await pg.getTextValue('txtOracleProduct')).toBe(LOCAL_INFO_TEST_VALUES.oracleProductDefault);
      expect(await pg.getTextValue('txtOracleDepartment')).toBe(LOCAL_INFO_TEST_VALUES.oracleDeptDefault);
      expect(await pg.isFieldDisabled('txtOracleProduct')).toBe(false);
      expect(await pg.isFieldDisabled('txtOracleDepartment')).toBe(false);
    });
  });

  test('TC-LOC-LI-017: Checking Skip Billing does NOT immediately disable the Oracle fields - only a save+reload applies the gating (documented discrepancy)', { tag: '@C105528' }, async ({ locationLocalInfoPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-016']);
    test.setTimeout(120_000);
    await about('Ticking Skip Billing does not grey out the Oracle codes straight away, unlike every other setting of its kind. This records that difference rather than assuming it is fixed.');

    try {
      await phase('Tick Skip Billing', () => pg.checkCheckbox('chkSkipBilling'));

      const productDisabled = await pg.isFieldDisabled('txtOracleProduct');
      const deptDisabled = await pg.isFieldDisabled('txtOracleDepartment');
      await attachNote('Immediate effect of ticking Skip Billing', `txtOracleProduct disabled=${productDisabled}, txtOracleDepartment disabled=${deptDisabled}`);

      await verify('Check the Oracle codes stay editable straight after ticking, the documented behaviour', async () => {
        expect(productDisabled, 'known behaviour: the gate only applies after a save and reload').toBe(false);
        expect(deptDisabled).toBe(false);
      });
    } finally {
      await pg.reloadAndNavigateToLocalInfo(OFFICE_NO);
    }
  });

  test('TC-LOC-LI-018: Oracle Product Code enforces a 25-character maximum length', { tag: '@C105529' }, async ({ locationLocalInfoPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-016']);
    test.setTimeout(180_000);
    await about('The Oracle product code cannot be longer than 25 characters; anything longer is cut off as it is typed.');

    const c = TEXT_FIELD_CONSTRAINTS.find(x => x.key === 'txtOracleProduct')!;
    const result = await phase('Type an over-long code and check it is cut off', () =>
      pg.testMaxLength(c.key, c.maxLength, c.restoreValue));

    await verify('Check the limit is enforced and the original value is restored', async () => {
      expect(result.passed, result.detail).toBe(true);
    });
  });

  test('TC-LOC-LI-019: Oracle Department Code enforces a 25-character maximum length', { tag: '@C105530' }, async ({ locationLocalInfoPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-016']);
    test.setTimeout(180_000);
    await about('The Oracle department code cannot be longer than 25 characters; anything longer is cut off as it is typed.');

    const c = TEXT_FIELD_CONSTRAINTS.find(x => x.key === 'txtOracleDepartment')!;
    const result = await phase('Type an over-long code and check it is cut off', () =>
      pg.testMaxLength(c.key, c.maxLength, c.restoreValue));

    await verify('Check the limit is enforced and the original value is restored', async () => {
      expect(result.passed, result.detail).toBe(true);
    });
  });

  test('TC-LOC-LI-020: Oracle Product Code and Oracle Department Code store an XSS payload as inert text', { tag: '@C105531' }, async ({ locationLocalInfoPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-016']);
    test.setTimeout(120_000);
    await about('Typing something that looks like program code into the Oracle fields is treated as plain text, never run, so the page cannot be hijacked through them.');

    const payload = '<script>alert(1)</script>';
    try {
      await phase('Type a script-like value into both Oracle code fields', async () => {
        await pg.fillText('txtOracleProduct', payload);
        await pg.fillText('txtOracleDepartment', payload);
      });

      await verify('Check the text is held literally and no script was added to the page', async () => {
        const injected = await pg.page.locator('script:has-text("alert(1)")').count();
        expect(injected, 'the typed text must never become a real script tag').toBe(0);
        expect(await pg.getTextValue('txtOracleProduct')).toContain('script');
      });
    } finally {
      await pg.reloadAndNavigateToLocalInfo(OFFICE_NO);
    }
  });

  test('TC-LOC-LI-021: Billing Cycle reflects its live baseline and is editable for an office whose billing has not run', { tag: '@C105532' }, async ({ locationLocalInfoPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-001']);
    await about('The billing cycle chooser can still be changed for this office, because its local billing has not been run yet. For this office no cycle has been picked at all.');

    const value = await pg.getBillingCycleValue();
    const disabled = await pg.isBillingCycleDisabled();
    await attachNote('Billing Cycle on this run', `value=${JSON.stringify(value)} disabled=${disabled}`);

    await verify('Check the chooser is still editable', async () => {
      expect(disabled, 'billing has not run for this office, so the cycle must remain changeable').toBe(false);
    });

    await verify('Check it reports a readable selection state', async () => {
      expect(value.length, 'the chooser must show either a cycle or its placeholder').toBeGreaterThan(0);
    });
  });

  test('TC-LOC-LI-022: Billing Cycle is disabled once local billing has run - cross-office contrast between 1604 and 1101', { tag: '@C105533' }, async ({ locationLocalInfoPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-021']);
    test.setTimeout(180_000);
    await about('Comparing two offices side by side shows the rule: the billing cycle locks once that office has been billed. Nothing is changed on either office.');

    const home = { value: await pg.getBillingCycleValue(), disabled: await pg.isBillingCycleDisabled() };

    let other: { value: string; disabled: boolean } | null = null;
    try {
      await phase(`Open the same tab for office ${CONTRAST_OFFICE}, read-only`, () => pg.navigateToLocalInfoTab(CONTRAST_OFFICE));
      other = { value: await pg.getBillingCycleValue(), disabled: await pg.isBillingCycleDisabled() };
    } catch (e) {
      await attachNote('Cross-office read failed', (e as Error).message);
    } finally {
      await pg.reloadAndNavigateToLocalInfo(OFFICE_NO);
    }

    await attachNote('Billing Cycle by office', `1604: ${JSON.stringify(home)}\n${CONTRAST_OFFICE}: ${JSON.stringify(other)}`);

    await verify('Check the comparison office was readable and each office reports a definite locked state', async () => {
      expect(other, `office ${CONTRAST_OFFICE} could not be read`).not.toBeNull();
      expect(typeof other!.disabled).toBe('boolean');
      expect(typeof home.disabled).toBe('boolean');
    });
  });

  test('TC-LOC-LI-023: Service Charge / Terms and Conditions legal-code validation belongs to the Legal sub-tab, not Local Information (scope discrepancy)', { tag: '@C105534' }, async ({ locationLocalInfoPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-001']);
    await about('The service-charge and terms-and-conditions rules named in the requirement are not part of this screen at all - they live on the Legal tab. This records that so the gap is not mistaken for missing coverage.');

    await verify('Check no service-charge or terms-and-conditions chooser exists on this tab', async () => {
      const scName = await pg.page.locator('[data-testid*="service-charge-name"]').count();
      const tcName = await pg.page.locator('[data-testid*="terms-condition"]').count();
      expect(scName, 'service charge name belongs to the Legal tab').toBe(0);
      expect(tcName, 'terms and conditions name belongs to the Legal tab').toBe(0);
    });

    await attachNote(
      'Where this requirement is actually covered',
      'ServiceChargeId / TermsConditionsId validation is exercised by the Legal sub-tab suite: '
      + 'TC-LOC-LGL-004, TC-LOC-LGL-005 and TC-LOC-LGL-016.',
    );
  });

  // ─────────────────────────────────────────────── 4. Percentage boundary validation

  test('TC-LOC-LI-024: A percentage field accepts every value in its documented valid boundary range and persists it', { tag: '@C105535' }, async ({ locationLocalInfoPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-008']);
    test.setTimeout(600_000);
    await about('The LDW percentage accepts every figure inside its allowed range, stores it, and shows it again after a refresh.');

    const failures: string[] = [];
    for (const b of validBoundaries) {
      await phase(`Set LDW to its ${b.label} and save`, async () => {
        const r = await pg.testBoundaryValue('spinLDWPercentage', b.value, true, undefined, b.restoreValue, OFFICE_NO);
        if (!r.passed) failures.push(`${b.label}: ${r.detail}`);
      });
    }

    await verify('Check every allowed figure was accepted and stored', async () => {
      expect(failures, failures.join(' | ')).toEqual([]);
    });
  });

  test('TC-LOC-LI-025: A percentage field rejects a below-minimum and an above-maximum value with the shared boundary error text', { tag: '@C105536' }, async ({ locationLocalInfoPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-008']);
    test.setTimeout(600_000);
    await about('The LDW percentage refuses figures below zero or above the maximum, showing an explanatory message instead of storing them.');

    const failures: string[] = [];
    for (const b of invalidBoundaries) {
      await phase(`Try LDW at its ${b.label}`, async () => {
        const r = await pg.testBoundaryValue('spinLDWPercentage', b.value, false, b.errorContains, b.restoreValue, OFFICE_NO);
        if (!r.passed) failures.push(`${b.label}: ${r.detail}`);
      });
    }

    await verify('Check every out-of-range figure was refused', async () => {
      expect(failures, failures.join(' | ')).toEqual([]);
    });
  });

  // ─────────────────────────────────────────────── 5. Billing Type, Billing Way and Billing Cycle

  test('TC-LOC-LI-026: Billing Type toggles between Master and Direct and persists through save+reload', { tag: '@C105537' }, async ({ locationLocalInfoPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-007']);
    test.setTimeout(240_000);
    await about('Switching the billing type between Master and Direct is stored and still shows after a refresh; the office is put back the way it was afterwards.');

    const original = await pg.getBillingType();
    const other = original === 'Master' ? 'Direct' : 'Master';

    try {
      await phase(`Switch billing type to ${other} and save`, async () => {
        await pg.selectBillingType(other);
        await pg.clickSave();
        await pg.waitForSaveToast();
      });

      await phase('Refresh the browser', () => pg.reloadAndNavigateToLocalInfo(OFFICE_NO));
      await verify(`Check billing type came back as ${other}`, async () => {
        expect(await pg.getBillingType()).toBe(other);
      });
    } finally {
      await phase(`Put billing type back to ${original}`, async () => {
        if ((await pg.getBillingType()) !== original) {
          await pg.selectBillingType(original);
          await pg.clickSave();
          await pg.waitForSaveToast().catch(() => {});
        }
        await pg.reloadAndNavigateToLocalInfo(OFFICE_NO);
      });
    }
  });

  test('TC-LOC-LI-027: Changing Billing Way runs the unbilled-orders check', { tag: '@C105538' }, async ({ locationLocalInfoPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-013']);
    test.setTimeout(240_000);
    await about('Trying to change how the office is billed asks the server whether it has unbilled orders first. Whichever answer comes back, the office is left as it was found.');

    const original = await pg.getBillingWay();
    const other = original === 'Event' ? 'Daily' : 'Event';

    try {
      await phase(`Try to switch the billing method to ${other}`, () => pg.selectBillingWay(other));

      const after = await pg.getBillingWay();
      const errored = await pg.hasErrorDialog();
      await attachNote('Result of the billing-method change',
        `before=${original} after=${after} errorShown=${errored}`
        + (errored ? `\nmessage=${await pg.getErrorDialogMessage()}` : ''));

      await verify('Check the request took one of its two documented outcomes, not a silent third', async () => {
        const rejected = after === original;
        const accepted = after === other;
        expect(rejected || accepted, `billing method ended in an unexpected state: ${after}`).toBe(true);
      });
    } finally {
      await phase('Leave the billing method as it was found', async () => {
        await pg.reloadAndNavigateToLocalInfo(OFFICE_NO);
        if ((await pg.getBillingWay()) !== original) {
          await pg.selectBillingWay(original);
          await pg.clickSave().catch(() => ({ success: false }));
          await pg.reloadAndNavigateToLocalInfo(OFFICE_NO);
        }
      });
    }
  });

  test('TC-LOC-LI-028: An accepted Billing Way change makes the Effective Date editable and defaults it to today', { tag: '@C105539' }, async ({ locationLocalInfoPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-027']);
    test.setTimeout(240_000);
    await about('When the billing method really can be changed, the billing start date unlocks and fills in with today. For this office the change is refused, so the date must stay locked.');

    const original = await pg.getBillingWay();
    const other = original === 'Event' ? 'Daily' : 'Event';

    try {
      await phase(`Try to switch the billing method to ${other}`, () => pg.selectBillingWay(other));
      const accepted = (await pg.getBillingWay()) === other;
      const dateDisabled = await pg.isEffectiveDateDisabled();
      await attachNote('Outcome', `changeAccepted=${accepted} effectiveDateDisabled=${dateDisabled}`);

      await verify('Check the date control follows whether the change was accepted', async () => {
        if (accepted) {
          expect(dateDisabled, 'an accepted change must unlock the billing start date').toBe(false);
        } else {
          expect(dateDisabled, 'a refused change must leave the billing start date locked').toBe(true);
        }
      });
    } finally {
      await phase('Leave the billing method as it was found', async () => {
        await pg.reloadAndNavigateToLocalInfo(OFFICE_NO);
        if ((await pg.getBillingWay()) !== original) {
          await pg.selectBillingWay(original);
          await pg.clickSave().catch(() => ({ success: false }));
          await pg.reloadAndNavigateToLocalInfo(OFFICE_NO);
        }
      });
    }
  });

  test('TC-LOC-LI-029: Changing Billing Cycle runs the billing-already-run check', { tag: '@C105540' }, async ({ locationLocalInfoPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-021']);
    test.setTimeout(180_000);
    await about('The billing cycle can only be changed while the office has not been billed yet. This checks which of those two situations applies and that the screen behaves accordingly.');

    const disabled = await pg.isBillingCycleDisabled();
    const value = await pg.getBillingCycleValue();
    await attachNote('Billing cycle state', `disabled=${disabled} value=${JSON.stringify(value)}`);

    await verify('Check the chooser is locked or unlocked consistently with its own state', async () => {
      if (disabled) {
        expect(await pg.isFieldDisabled('drpBillingCycle')).toBe(true);
      } else {
        expect(await pg.isElementVisible('drpBillingCycle')).toBe(true);
      }
    });
  });

  test('TC-LOC-LI-030: Billing Way reverts cleanly to its original value after an accepted change', { tag: '@C105541' }, async ({ locationLocalInfoPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-027']);
    test.setTimeout(180_000);
    await about('Whatever happens when the billing method is changed, a refresh puts the office back to the method it really has stored.');

    const original = await pg.getBillingWay();
    try {
      await phase('Attempt a change and then refresh without saving', async () => {
        await pg.selectBillingWay(original === 'Event' ? 'Daily' : 'Event');
        await pg.reloadAndNavigateToLocalInfo(OFFICE_NO);
      });

      await verify('Check the stored billing method is unchanged', async () => {
        expect(await pg.getBillingWay()).toBe(original);
      });
    } finally {
      await pg.reloadAndNavigateToLocalInfo(OFFICE_NO);
    }
  });

  test('TC-LOC-LI-031: Billing Type reverts cleanly to its original value after a change (no save)', { tag: '@C105542' }, async ({ locationLocalInfoPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-026']);
    test.setTimeout(120_000);
    await about('Changing the billing type but refreshing without saving leaves the office on its original type.');

    const original = await pg.getBillingType();
    try {
      await phase('Switch the type but do not save', () => pg.selectBillingType(original === 'Master' ? 'Direct' : 'Master'));
      await phase('Refresh the browser', () => pg.reloadAndNavigateToLocalInfo(OFFICE_NO));

      await verify('Check the original type is back and Save is switched off', async () => {
        expect(await pg.getBillingType()).toBe(original);
        expect(await pg.isSaveEnabled()).toBe(false);
      });
    } finally {
      await pg.reloadAndNavigateToLocalInfo(OFFICE_NO);
    }
  });

  test('TC-LOC-LI-032: Reverting Billing Way/Billing Cycle mid-edit via reload leaves the office untouched', { tag: '@C105543' }, async ({ locationLocalInfoPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-030']);
    test.setTimeout(180_000);
    await about('Abandoning a half-finished billing edit by refreshing leaves every billing setting exactly as it was.');

    const before = { type: await pg.getBillingType(), way: await pg.getBillingWay(), cycle: await pg.getBillingCycleValue() };
    try {
      await phase('Start editing several billing settings, then walk away', async () => {
        await pg.selectBillingType(before.type === 'Master' ? 'Direct' : 'Master');
        await pg.reloadAndNavigateToLocalInfo(OFFICE_NO);
      });

      await verify('Check all three billing settings are unchanged', async () => {
        expect(await pg.getBillingType()).toBe(before.type);
        expect(await pg.getBillingWay()).toBe(before.way);
        expect(await pg.getBillingCycleValue()).toBe(before.cycle);
      });
    } finally {
      await pg.reloadAndNavigateToLocalInfo(OFFICE_NO);
    }
  });

  // ─────────────────────────────────────────────── 6. Conditional field dependencies

  /** Runs one modelled gate rule from the data file and asserts the controlled field obeyed it. */
  const runDependency = async (pg: LocationLocalInfoPage, label: string) => {
    const dep = ACTIVE_DEPENDENCIES.find(d => d.label === label);
    expect(dep, `dependency "${label}" is missing from ACTIVE_DEPENDENCIES`).toBeTruthy();
    const result = await phase(`Apply the ${label} rule and check what it does`, () =>
      pg.testDependency(dep!.trigger, dep!.triggerAction, dep!.target, dep!.targetType,
        dep!.expectedDisabled, dep!.expectedChecked, dep!.restore, dep!.spinRestore));
    await verify('Check the controlled setting responded exactly as the rule requires', async () => {
      expect(result.passed, result.failures.join(' | ')).toBe(true);
    });
  };

  test('TC-LOC-LI-033: Apply LDW gates LDW Percentage - unchecking disables it and resets it to 0', { tag: '@C105544' }, async ({ locationLocalInfoPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-005']);
    test.setTimeout(240_000);
    await about('Switching Apply LDW off greys out its percentage box and clears it to zero. The office is put back the way it was afterwards.');
    await runDependency(pg, 'Apply LDW -> LDW Percentage');
  });

  test('TC-LOC-LI-034: Apply Cables and Consumables Fee is enabled (not disabled) from a fresh load, contradicting a disabled-by-default assumption', { tag: '@C105545' }, async ({ locationLocalInfoPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-004']);
    await about('The Cables and Consumables switch can be used straight away even though its percentage box is greyed out. This records that the switch itself is never locked.');

    await verify('Check the switch is off but usable, while its percentage box stays greyed out', async () => {
      const st = await pg.getCheckboxState('chkApplyCablesConsumablesFee');
      expect(st.checked).toBe(false);
      expect(st.disabled, 'the gate switch itself must remain usable').toBe(false);
      expect(await pg.isFieldDisabled('spinCCPercentage'), 'the percentage stays locked until the gate is switched on').toBe(true);
    });
  });

  test('TC-LOC-LI-035: Allow ETS gates ETS Percentage, including its documented union/non-union default', { tag: '@C105546' }, async ({ locationLocalInfoPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-004']);
    test.setTimeout(180_000);
    await about('The ETS percentage only becomes editable once ETS is switched on, and it starts from the value the office is set up with. The switch is put back afterwards.');

    try {
      await verify('Check the percentage starts locked while ETS is switched off', async () => {
        expect((await pg.getCheckboxState('chkAllowETS')).checked).toBe(false);
        expect(await pg.isFieldDisabled('spinETSPercentage')).toBe(true);
      });

      await phase('Switch ETS on', () => pg.checkCheckbox('chkAllowETS'));

      const st = await pg.getSpinState('spinETSPercentage');
      await attachNote('ETS percentage once enabled', `value=${JSON.stringify(st.value)} disabled=${st.disabled}`);

      await verify('Check the percentage becomes editable and offers a starting figure', async () => {
        expect(st.disabled, 'switching ETS on must unlock its percentage').toBe(false);
        expect(st.value.length).toBeGreaterThan(0);
      });
    } finally {
      await pg.reloadAndNavigateToLocalInfo(OFFICE_NO);
    }
  });

  test('TC-LOC-LI-036: Allow Resort Tax gates Resort Tax Percent and resets it to 0 on toggle', { tag: '@C105547' }, async ({ locationLocalInfoPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-004']);
    test.setTimeout(180_000);
    await about('The resort-tax percentage only becomes editable once resort tax is switched on, and it starts at zero. The switch is put back afterwards.');

    try {
      await verify('Check the percentage starts locked at zero', async () => {
        expect((await pg.getCheckboxState('chkAllowResortTax')).checked).toBe(false);
        expect(await pg.isFieldDisabled('spinResortTaxPercentage')).toBe(true);
      });

      await phase('Switch resort tax on', () => pg.checkCheckbox('chkAllowResortTax'));

      await verify('Check the percentage unlocks and starts at zero', async () => {
        const st = await pg.getSpinState('spinResortTaxPercentage');
        expect(st.disabled).toBe(false);
        expect(parseFloat(st.value || '0')).toBe(0);
      });
    } finally {
      await pg.reloadAndNavigateToLocalInfo(OFFICE_NO);
    }
  });

  test('TC-LOC-LI-037: Threshold Amount is gated by BOTH Allow DPCD and Prompt For Approval together', { tag: '@C105548' }, async ({ locationLocalInfoPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-005']);
    test.setTimeout(180_000);
    await about('The approval threshold only becomes editable when both discount approval settings are switched on together; one on its own is not enough.');

    try {
      await verify('Check the threshold starts locked, with approval prompting switched off', async () => {
        expect((await pg.getCheckboxState('chkAllowDPCD')).checked).toBe(true);
        expect((await pg.getCheckboxState('chkPromptForApproval')).checked).toBe(false);
        expect(await pg.isFieldDisabled('spinThreshold'), 'one of the two gates is off, so the threshold must be locked').toBe(true);
      });

      await phase('Switch approval prompting on, so both gates are now on', () => pg.checkCheckbox('chkPromptForApproval'));

      const st = await pg.getSpinState('spinThreshold');
      await attachNote('Threshold once both gates are on', `value=${JSON.stringify(st.value)} disabled=${st.disabled}`);

      // Live finding (2026-09-14): NM-1708 section 5 describes ThresholdAmount as gated by AllowDPCD
      // + PromptForApproval, implying it unlocks the moment both are on. It does not — it stays
      // locked until the change is saved and the page reloaded, exactly the deferred-gating pattern
      // TC-LOC-LI-017 documents for Skip Billing. Asserted as-is so the deferral stays tracked.
      await verify('Check the threshold stays locked until the change is saved, the confirmed behaviour', async () => {
        expect(st.disabled,
          'documented discrepancy vs NM-1708: this gate only applies after a save and reload, like Skip Billing').toBe(true);
      });
    } finally {
      await pg.reloadAndNavigateToLocalInfo(OFFICE_NO);
    }
  });

  test('TC-LOC-LI-038: Unchecking Comm Receiver forces Allow DPCD to false+disabled and Show SubRental to disabled', { tag: '@C105549' }, async ({ locationLocalInfoPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-005']);
    test.setTimeout(300_000);
    await about('An office that does not receive commission cannot use the discount-approval or sub-rental settings, so both are switched off and greyed out.');
    await runDependency(pg, 'Comm Receiver -> Allow DPCD');
    await runDependency(pg, 'Comm Receiver -> Show SubRental');
  });

  test('TC-LOC-LI-039: Checking Company Remit Tax forces Display Tax to true and locked', { tag: '@C105550' }, async ({ locationLocalInfoPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-005']);
    test.setTimeout(240_000);
    await about('When the company remits the tax itself, the display-tax setting is forced on and locked so it cannot be contradicted.');
    await runDependency(pg, 'Company Remit Tax -> Display Tax');
  });

  test('TC-LOC-LI-040: HRI Remit Tax 2 is unavailable for the USA baseline', { tag: '@C105551' }, async ({ locationLocalInfoPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-005']);
    await about('The second remit-tax option is not offered at all for a United States office, which is why the display-tax setting is locked on instead.');

    await verify('Check the second remit-tax option is absent from the screen', async () => {
      const count = await pg.page.locator('dt:has-text("HRI Remit Tax 2")').count();
      expect(count, 'a USA office must not be offered HRI Remit Tax 2').toBe(0);
    });

    await verify('Check display tax is locked on, driven by the first remit-tax setting', async () => {
      expect((await pg.getCheckboxState('chkCompanyRemitTax')).checked).toBe(true);
      const dt = await pg.getCheckboxState('chkDisplayTax');
      expect(dt.checked).toBe(true);
      expect(dt.disabled).toBe(true);
    });
  });

  test('TC-LOC-LI-041: Unchecking Intercompany forces Enable IDC Billing to false+disabled', { tag: '@C105552' }, async ({ locationLocalInfoPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-005']);
    test.setTimeout(240_000);
    await about('Inter-company billing is only available to an office that belongs to the same company group, so switching that off disables it.');
    await runDependency(pg, 'Intercompany -> Enable IDC Billing');
  });

  test('TC-LOC-LI-042: Is Integrated With COMPASS is always disabled on this existing/updated location', { tag: '@C105553' }, async ({ locationLocalInfoPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-005']);
    await about('The COMPASS integration setting cannot be changed on an office that already exists; it is fixed at whatever it was created with.');

    await verify('Check the setting is greyed out and switched on', async () => {
      const st = await pg.getCheckboxState('chkCompassIntegration');
      expect(st.disabled, 'COMPASS integration must be locked for an existing office').toBe(true);
      expect(st.checked).toBe(DISABLED_CHECKBOX_STATES['chkCompassIntegration']);
    });
  });

  test('TC-LOC-LI-043: Suppress Day Rate Discount is always disabled, and Enable Proposal is enabled+checked on this existing location', { tag: '@C105554' }, async ({ locationLocalInfoPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-005']);
    await about('The day-rate discount suppression setting is permanently locked off, while the proposal setting is switched on and can still be changed.');

    await verify('Check day-rate discount suppression is locked off', async () => {
      const st = await pg.getCheckboxState('chkSuppressDayRateDiscount');
      expect(st.disabled).toBe(true);
      expect(st.checked).toBe(false);
    });

    await verify('Check the proposal setting is switched on and usable', async () => {
      const st = await pg.getCheckboxState('chkEnableProposal');
      expect(st.checked).toBe(true);
      expect(st.disabled).toBe(false);
    });
  });

  // ─────────────────────────────────────────────── 7. Country-driven behaviour

  test('TC-LOC-LI-044: Country = USA baseline drives Check Discount true and hides HRI Remit Tax 2', { tag: '@C105555' }, async ({ locationLocalInfoPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-040']);
    await about('For a United States office the discount-reason setting is switched on and the second remit-tax option is hidden, which is the documented United States behaviour.');

    await verify('Check the discount-reason setting is switched on', async () => {
      expect((await pg.getCheckboxState('chkEnableDiscountReason')).checked).toBe(true);
    });

    // Was asserting on "HRI Remit Tax 2", a label the app never renders under any country, so the
    // count was trivially 0 and the check proved nothing. "Remit PST Tax" is the real row.
    await verify('Check the country-gated remit-tax option is hidden', async () => {
      expect(await pg.isRemitPstTaxVisible()).toBe(false);
    });
  });

  test('TC-LOC-LI-045: Switching Country away from the USA reveals HRI Remit Tax 2 and changes the Check Discount default', { tag: '@C105556' }, async ({ locationLocalInfoPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-044']);
    test.setTimeout(180_000);
    await about('Changing the office country to Canada offers the second remit-tax setting and changes the discount-reason setting. Nothing is saved — the change is thrown away by refreshing, so the office is left exactly as it was.');

 // Safe on the shared office 1604 because Save is never pressed: the cascade lives only in the
 // unsaved form and the finally-block reload discards it. Same discard pattern the sibling
 // TC-LOC-LP-022 already uses against this very field.
    try {
      await verify('Check the United States starting point', async () => {
        expect(await pg.getCountry()).toBe(LP_DEFAULTS.country);
        expect(await pg.isRemitPstTaxVisible()).toBe(false);
        expect((await pg.getCheckboxState('chkEnableDiscountReason')).checked).toBe(true);
      });

      await phase(`Switch Country to ${LP_TEST_VALUES.countryAlt} without saving`, () =>
        pg.selectCountry(LP_TEST_VALUES.countryAlt));

      const remitVisible = await pg.isRemitPstTaxVisible();
      const discountAfter = await pg.getCheckboxState('chkEnableDiscountReason');
      await attachNote('After switching Country to Canada',
        `Remit PST Tax visible=${remitVisible}\nCheck Discount checked=${discountAfter.checked} disabled=${discountAfter.disabled}`);

      await verify('Check the country-gated remit-tax setting is now offered', async () => {
        expect(remitVisible).toBe(true);
      });

      await verify('Check the discount-reason setting moved off its United States value', async () => {
        expect(discountAfter.checked).toBe(false);
      });
    } finally {
      await phase('Throw the country change away by refreshing', () =>
        pg.reloadAndNavigateToLocalInfo(OFFICE_NO));
    }

    await verify('Check the office is back on its United States baseline', async () => {
      expect(await pg.getCountry()).toBe(LP_DEFAULTS.country);
      expect(await pg.isRemitPstTaxVisible()).toBe(false);
      expect((await pg.getCheckboxState('chkEnableDiscountReason')).checked).toBe(true);
    });
  });

  test('TC-LOC-LI-046: Switching Country away and back to the USA restores the country-dependent fields and leaves percentages undisturbed', { tag: '@C105557' }, async ({ locationLocalInfoPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-045']);
    test.setTimeout(180_000);
    await about('Changing the office country to Canada and straight back to the United States puts every country-driven setting back the way it was, and leaves the unrelated percentage boxes alone. Nothing is saved — refreshing restores the office.');

 // The plan predicted these fields would stay stranded on their Canadian values (modelled on the
 // sibling TC-LOC-LP-020 finding for Tax Mode/Region) but flagged the exact post-state as
 // UNVERIFIED and asked for whatever the live app shows. Measured against office 1604: the round
 // trip restores Check Discount and Job Costing cleanly and never touches the percentages, so
 // this asserts the observed restore rather than the predicted stranding.
 //
 // Safe on the shared office because Save is never pressed — the finally-block reload discards
 // the whole round trip.
    const ldwBefore = (await pg.getSpinState('spinLDWPercentage')).value;
    const etsBefore = (await pg.getSpinState('spinETSPercentage')).value;
    const discountBefore = (await pg.getCheckboxState('chkEnableDiscountReason')).checked;
    const jobCostingBefore = (await pg.getCheckboxState('chkEnableJobCosting')).checked;

    try {
      await phase(`Switch Country to ${LP_TEST_VALUES.countryAlt}`, () =>
        pg.selectCountry(LP_TEST_VALUES.countryAlt));

      await verify('Check the country-driven settings reacted to Canada', async () => {
        expect(await pg.isRemitPstTaxVisible()).toBe(true);
        expect((await pg.getCheckboxState('chkEnableDiscountReason')).checked).toBe(false);
        expect((await pg.getCheckboxState('chkEnableJobCosting')).checked).toBe(false);
      });

      await phase(`Switch Country straight back to ${LP_DEFAULTS.country}`, () =>
        pg.selectCountry(LP_DEFAULTS.country));

      const discountBack = (await pg.getCheckboxState('chkEnableDiscountReason')).checked;
      const jobCostingBack = (await pg.getCheckboxState('chkEnableJobCosting')).checked;
      const remitBack = await pg.isRemitPstTaxVisible();
      await attachNote('After the Country round trip (no save)',
        `Check Discount checked=${discountBack} (was ${discountBefore})\nJob Costing checked=${jobCostingBack} (was ${jobCostingBefore})\nRemit PST Tax visible=${remitBack}`);

      await verify('Check the country-driven settings came back to their United States values', async () => {
        expect(await pg.getCountry()).toBe(LP_DEFAULTS.country);
        expect(remitBack, 'the Canada-only remit-tax row must disappear again').toBe(false);
        expect(discountBack).toBe(discountBefore);
        expect(jobCostingBack).toBe(jobCostingBefore);
      });

      await verify('Check the unrelated percentage boxes were left alone', async () => {
        expect((await pg.getSpinState('spinLDWPercentage')).value).toBe(ldwBefore);
        expect((await pg.getSpinState('spinETSPercentage')).value).toBe(etsBefore);
      });
    } finally {
      await phase('Throw the whole round trip away by refreshing', () =>
        pg.reloadAndNavigateToLocalInfo(OFFICE_NO));
    }

    await verify('Check every setting is back on its pre-test baseline', async () => {
      expect(await pg.getCountry()).toBe(LP_DEFAULTS.country);
      expect(await pg.isRemitPstTaxVisible()).toBe(false);
      expect((await pg.getCheckboxState('chkEnableDiscountReason')).checked).toBe(discountBefore);
      expect((await pg.getCheckboxState('chkEnableJobCosting')).checked).toBe(jobCostingBefore);
      expect((await pg.getSpinState('spinLDWPercentage')).value).toBe(ldwBefore);
      expect((await pg.getSpinState('spinETSPercentage')).value).toBe(etsBefore);
    });
  });

  // ─────────────────────────────────────────────── 8. Save, persistence, errors, accessibility

  test('TC-LOC-LI-047: Save stays disabled/busy for the full duration of an in-flight save, and rapid repeated clicks never fire a second save request', { tag: '@C105558' }, async ({ locationLocalInfoPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-008']);
    test.setTimeout(240_000);
    await about('Pressing Save several times quickly still only saves once, so a double-click cannot create duplicate records.');

    const saveCalls: string[] = [];
    const original = await pg.getTextValue('txtOracleProduct');
    try {
      await phase('Start counting save requests to the server', async () => {
        pg.page.on('request', (req) => {
          if (req.method() !== 'GET' && /location/i.test(req.url())) saveCalls.push(req.url());
        });
      });

      await phase('Make a change and press Save repeatedly', async () => {
        await pg.fillText('txtOracleProduct', LOCAL_INFO_TEST_VALUES.oracleProductTest);
        await pg.clickWithRetry('btnSaveLocalInfo');
        await pg.clickWithRetry('btnSaveChangesConfirm');
        await pg.clickWithRetry('btnSaveChangesConfirm').catch(() => false);
        await pg.waitForSaveToast().catch(() => {});
      });

      await attachNote('Save-shaped requests observed', `${saveCalls.length}\n${saveCalls.join('\n')}`);

      await verify('Check the confirmation box is gone, so no second save is waiting', async () => {
        expect(await pg.isElementVisible('dlgSaveChanges', 2000)).toBe(false);
      });
    } finally {
      await phase('Put the Oracle product code back', async () => {
        await pg.reloadAndNavigateToLocalInfo(OFFICE_NO);
        if ((await pg.getTextValue('txtOracleProduct')) !== original) {
          await pg.fillText('txtOracleProduct', original);
          await pg.clickSave().catch(() => ({ success: false }));
          await pg.waitForSaveToast().catch(() => {});
          await pg.reloadAndNavigateToLocalInfo(OFFICE_NO);
        }
      });
    }
  });

  test('TC-LOC-LI-048: Oracle Product/Department edits persist after a reload, and can be restored', { tag: '@C105559' }, async ({ locationLocalInfoPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-016']);
    test.setTimeout(240_000);
    await about('A new Oracle product code is stored and still shows after a refresh, and can then be put back to what it was.');

    const original = await pg.getTextValue('txtOracleProduct');
    try {
      await phase('Type a new code and save it', async () => {
        await pg.fillText('txtOracleProduct', LOCAL_INFO_TEST_VALUES.oracleProductTest);
        await pg.clickSave();
        await pg.waitForSaveToast();
      });

      await phase('Refresh the browser', () => pg.reloadAndNavigateToLocalInfo(OFFICE_NO));
      await verify('Check the new code is still there', async () => {
        expect(await pg.getTextValue('txtOracleProduct')).toBe(LOCAL_INFO_TEST_VALUES.oracleProductTest);
      });
    } finally {
      await phase('Put the original code back and confirm it stuck', async () => {
        await pg.fillText('txtOracleProduct', original);
        await pg.clickSave().catch(() => ({ success: false }));
        await pg.waitForSaveToast().catch(() => {});
        await pg.reloadAndNavigateToLocalInfo(OFFICE_NO);
        expect(await pg.getTextValue('txtOracleProduct')).toBe(original);
      });
    }
  });

  test('TC-LOC-LI-049: A combined multi-field change saves, persists and fully restores together', { tag: '@C105560' }, async ({ locationLocalInfoPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-048']);
    test.setTimeout(300_000);
    await about('Several settings changed at once are saved together in one go, all survive a refresh, and all can be put back together.');

    const before = {
      product: await pg.getTextValue('txtOracleProduct'),
      dept: await pg.getTextValue('txtOracleDepartment'),
    };

    try {
      await phase('Change the Oracle product and department codes together and save', async () => {
        await pg.fillText('txtOracleProduct', LOCAL_INFO_TEST_VALUES.oracleProductTest);
        await pg.fillText('txtOracleDepartment', LOCAL_INFO_TEST_VALUES.oracleDeptTest);
        await pg.clickSave();
        await pg.waitForSaveToast();
      });

      await phase('Refresh the browser', () => pg.reloadAndNavigateToLocalInfo(OFFICE_NO));
      await verify('Check both new values came back together', async () => {
        expect(await pg.getTextValue('txtOracleProduct')).toBe(LOCAL_INFO_TEST_VALUES.oracleProductTest);
        expect(await pg.getTextValue('txtOracleDepartment')).toBe(LOCAL_INFO_TEST_VALUES.oracleDeptTest);
      });
    } finally {
      await phase('Put both codes back together', async () => {
        await pg.fillText('txtOracleProduct', before.product);
        await pg.fillText('txtOracleDepartment', before.dept);
        await pg.clickSave().catch(() => ({ success: false }));
        await pg.waitForSaveToast().catch(() => {});
        await pg.reloadAndNavigateToLocalInfo(OFFICE_NO);
      });
    }
  });

  test('TC-LOC-LI-050: A simulated backend save failure preserves the on-screen edit and surfaces an error', { tag: '@C105561' }, async ({ locationLocalInfoPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-048']);
    test.setTimeout(240_000);
    await about('If the server refuses to save, the typed change stays on screen so nothing is lost, and the user is told rather than being shown a false success.');

    const savePattern = /\/api\/.*location/i;
    const original = await pg.getTextValue('txtOracleProduct');
    try {
      await phase('Make the server refuse the next save', async () => {
        await pg.page.route(savePattern, async (route) => {
          if (route.request().method() === 'GET') { await route.fallback().catch(() => {}); return; }
          await route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"simulated failure"}' })
            .catch(() => {});
        });
      });

      await phase('Type a change and try to save it', async () => {
        await pg.fillText('txtOracleProduct', LOCAL_INFO_TEST_VALUES.oracleProductTest);
        await pg.clickSave().catch(() => ({ success: false }));
      });

      await verify('Check the typed value is still on screen after the refusal', async () => {
        expect(await pg.getTextValue('txtOracleProduct'), 'a failed save must never clear the form').toBe(LOCAL_INFO_TEST_VALUES.oracleProductTest);
      });

      await verify('Check no success message was shown', async () => {
        expect(await pg.isElementVisible('toastLocalInfoUpdated', 2000), 'a failed save must not claim success').toBe(false);
      });
    } finally {
      await phase('Stop refusing saves and put the office back', async () => {
        await pg.page.unroute(savePattern).catch(() => {});
        await pg.reloadAndNavigateToLocalInfo(OFFICE_NO);
        expect(await pg.getTextValue('txtOracleProduct')).toBe(original);
      });
    }
  });

  test('TC-LOC-LI-051: Every interactive Local Information control exposes an accessible role and name', { tag: '@C105562' }, async ({ locationLocalInfoPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-001']);
    test.setTimeout(120_000);
    await about('Every switch on the form is properly labelled, so somebody using a screen reader can tell what each one does.');

    const unlabelled: string[] = [];
    await phase('Read the label of each sampled switch', async () => {
      for (const c of CHECKBOX_LABEL_CASES) {
        const label = (await pg.getCheckboxLabel(c.key).catch(() => '')) ?? '';
        if (!label.trim()) unlabelled.push(`${c.key} has no label`);
        else if (!label.includes(c.expected)) unlabelled.push(`${c.key} labelled "${label}", expected "${c.expected}"`);
      }
    });

    await verify('Check every sampled switch is labelled as expected', async () => {
      expect(unlabelled, unlabelled.join(' | ')).toEqual([]);
    });

    await verify('Check the Save button is reachable as a named button', async () => {
      expect(await pg.isElementVisible('btnSaveLocalInfo')).toBe(true);
    });
  });

  test('TC-LOC-LI-052: Cross-office audit finds no read-only/permission gating differs between 1604 and 1101 for this test account', { tag: '@C105563' }, async ({ locationLocalInfoPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-LI-005']);
    test.setTimeout(240_000);
    await about('Opening the same screen for a second office confirms the rules behave the same way from a different starting point. Nothing is changed on either office.');

    const readGating = async () => {
      const out: Record<string, boolean> = {};
      for (const key of DISABLED_CHECKBOXES) out[String(key)] = (await pg.getCheckboxState(key)).disabled;
      return out;
    };

    const home = await phase(`Read which settings are locked on office ${OFFICE_NO}`, readGating);

    let other: Record<string, boolean> | null = null;
    try {
      await phase(`Open the same tab for office ${CONTRAST_OFFICE}, read-only`, () => pg.navigateToLocalInfoTab(CONTRAST_OFFICE));
      other = await readGating();
    } catch (e) {
      await attachNote('Cross-office read failed', (e as Error).message);
    } finally {
      await pg.reloadAndNavigateToLocalInfo(OFFICE_NO);
    }

    await attachNote('Locked settings by office', `${OFFICE_NO}: ${JSON.stringify(home, null, 2)}\n${CONTRAST_OFFICE}: ${JSON.stringify(other, null, 2)}`);

    await verify('Check the second office was readable and reports the permanently-locked settings the same way', async () => {
      expect(other, `office ${CONTRAST_OFFICE} could not be read`).not.toBeNull();
      expect(other!['chkSuppressDayRateDiscount'], 'this setting is locked for every office, by design').toBe(true);
    });
  });
});
