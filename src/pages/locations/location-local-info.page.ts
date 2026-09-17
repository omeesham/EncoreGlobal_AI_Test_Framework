import { Page } from '@playwright/test';
import { step } from '../../fixtures/step-decorator';
import { LocationFormHelpers } from '../components/location-form-helpers.component';
import { LocationSettingsSelectors } from '../../selectors';
import { Log } from '../../utils/logger';
import { IConfig } from '../../types';

export interface LeftPanelBaseline {
  office: string;
  localOffice: string;
  payToAddress: string;
  eCommerceActive: boolean;
  enableProductionsOrders: boolean;
}

export class LocationLocalInfoPage extends LocationFormHelpers {
  constructor(page: Page, config?: IConfig) {
    super(page, config);
    Log.info('LocationLocalInfoPage initialized');
  }

  @step('Navigate to local info tab')
  async navigateToLocalInfoTab(officeNo: string = '1604'): Promise<void> {
    await this.navigateToSubTab('tabLocalInformation', 'btnSaveLocalInfo', officeNo);
  }

  @step('Is on local info tab')
  async isOnLocalInfoTab(): Promise<boolean> {
    const tab = this.getElement('tabLocalInformation');
    if ((await tab.count()) === 0) return false;
    return (await tab.getAttribute('aria-selected').catch(() => null)) === 'true';
  }

  @step('Reload and navigate to local info')
  async reloadAndNavigateToLocalInfo(officeNo: string = '1604'): Promise<void> {
    Log.info('Reloading page and navigating back to Local Information');
 // Route away first to force a destroy + recreate of the settings component; page.reload can
 // hit the router cache and replay stale state.
    const base = this.config?.base_url || '';
    await this.page.goto(`${base}locations`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    try {
      await this.navigateToLocalInfoTab(officeNo);
    } catch {
      // navigateToSubTab waits a hard-coded 30s for the sub-tab strip, which a slow settings-page
      // render can exceed. This helper runs from nearly every test's finally block, so one retry
      // here keeps a slow reload from failing an otherwise-passing test (seen on TC-LOC-LI-032).
      Log.warn('Local Information tab did not appear in time; retrying the reload once');
      await this.page.goto(`${base}locations`, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await this.navigateToLocalInfoTab(officeNo);
    }
  }

  @step('Capture left panel baseline')
  async captureLeftPanelBaseline(): Promise<LeftPanelBaseline> {
    Log.info('Capturing left-panel baseline values');
    const officeVal = await this.getElement('txtOffice').inputValue().catch(() => '');
    const localOfficeVal = await this.getElement('txtLocalOffice').inputValue().catch(() => '');
    const payToVal = await this.getElement('txtPayToAddress').inputValue().catch(() => '');
    const ecommerce = (await this.getRadixCheckboxState('chkECommerceActive')).checked;
    const prodOrders = (await this.getRadixCheckboxState('chkEnableProductionsOrders')).checked;
    const baseline: LeftPanelBaseline = {
      office: officeVal,
      localOffice: localOfficeVal,
      payToAddress: payToVal,
      eCommerceActive: ecommerce,
      enableProductionsOrders: prodOrders,
    };
    Log.info(`Left panel baseline: ${JSON.stringify(baseline)}`);
    return baseline;
  }

  @step('Get billing type')
  async getBillingType(): Promise<'Master' | 'Direct'> {
    const masterChecked = (await this.getElement('rdoBillingTypeMaster').getAttribute('aria-checked').catch(() => null)) === 'true';
    return masterChecked ? 'Master' : 'Direct';
  }

  @step('Select billing type')
  async selectBillingType(type: 'Master' | 'Direct'): Promise<void> {
    const key = type === 'Master' ? 'rdoBillingTypeMaster' : 'rdoBillingTypeDirect';
    await this.getElement(key).click();
    Log.info(`Selected Billing Type: ${type}`);
  }

  @step('Get billing way')
  async getBillingWay(): Promise<'Event' | 'Daily'> {
    const eventChecked = (await this.getElement('rdoBillingWayEvent').getAttribute('aria-checked').catch(() => null)) === 'true';
    return eventChecked ? 'Event' : 'Daily';
  }

  @step('Select billing way')
  async selectBillingWay(way: 'Event' | 'Daily'): Promise<void> {
    const key = way === 'Event' ? 'rdoBillingWayEvent' : 'rdoBillingWayDaily';
    await this.getElement(key).click();
    Log.info(`Selected Billing Way: ${way}`);
    await this.page.waitForLoadState('domcontentloaded').catch(() => {});
  }

  @step('Is save enabled')
  async isSaveEnabled(): Promise<boolean> {
    const el = this.getElement('btnSaveLocalInfo');
    const disabled = await el.isDisabled().catch(() => true);
    Log.info(`Save button enabled: ${!disabled}`);
    return !disabled;
  }

 /** 10s dialog timeout — this form's server validation is slower than the default allows. */
  @step('Click save')
  async clickSave(): Promise<{ success: boolean; networkError?: string }> {
    return this.clickSaveWithDialog('btnSaveLocalInfo', 'dlgSaveChanges', 'btnSaveChangesConfirm', 10_000);
  }

  @step('Wait for save toast')
  async waitForSaveToast(): Promise<void> {
    await this.getElement('toastLocalInfoUpdated').waitFor({ state: 'visible', timeout: 8000 });
    Log.info('Save success toast confirmed: "Local information updated"');
  }

  @step('Is effective date disabled')
  async isEffectiveDateDisabled(): Promise<boolean> {
    return await this.getElement('btnEffectiveDate').isDisabled().catch(() => true);
  }

  @step('Is billing cycle disabled')
  async isBillingCycleDisabled(): Promise<boolean> {
    return await this.getElement('drpBillingCycle').isDisabled().catch(() => true);
  }

  @step('Get billing cycle value')
  async getBillingCycleValue(): Promise<string> {
 // The combobox renders its "--Select--" placeholder first and only swaps in the office's real
 // cycle once the settings payload lands. Reading textContent straight away therefore returns
 // whichever side of that swap the read happened to land on, which made TC-LOC-LI-032 compare a
 // placeholder against a real value (and flip the other way on retry). Wait for it to settle.
    const el = this.getElement('drpBillingCycle');
    const deadline = Date.now() + 10_000;
    let text = '';
    do {
      text = ((await el.textContent().catch(() => '')) ?? '').trim();
      if (text !== '' && text !== '--Select--' && text !== 'Select') return text;
      await this.page.waitForTimeout(250);
    } while (Date.now() < deadline);
 // Genuinely unset (or still loading after 10s) — report what is actually on screen.
    Log.warn(`Billing Cycle still reads "${text}" after waiting for it to populate`);
    return text;
  }

 // ─── Country (left panel, but it drives Local Information's own gated fields) ───
 // drpCountry lives in SetupLeftPanelBasicInformationSelectors, which LocationSettingsSelectors
 // already merges in, so it is reachable from this page object without the left-panel fixture.

  @step('Get country')
  async getCountry(): Promise<string> {
    return this.getFieldDisplayValue('drpCountry');
  }

  @step('Select country')
  async selectCountry(text: string): Promise<void> {
    await this.selectComboboxOption('drpCountry', text, { exact: true });
    Log.info(`Selected Country: ${text}`);
 // The country-gated fields re-render from the cascade, not from a navigation, so there is no
 // load state to await — settle briefly before any caller reads them.
    await this.page.waitForTimeout(1_500);
  }

 /**
  * The Country-gated remit-tax row. It is absent from the DOM entirely on the USA baseline, not
  * merely hidden, and appears only for Canada.
  *
  * Its live label is "Remit PST Tax" — the same row the sibling suite's lp.isRemitPstVisible()
  * checks. The plan referred to this concept as "HRI Remit Tax 2" (and the chkHRIRemitTax2
  * selector still spells it that way), but that string appears nowhere in the rendered app:
  * a dump of every <dt> on both sides of a Country switch showed "Remit PST Tax" as the single
  * label that appears for Canada. Matching on the plan's name silently matched nothing, so any
  * assertion built on it was vacuous.
  */
  @step('Is remit PST tax visible')
  async isRemitPstTaxVisible(): Promise<boolean> {
    return (await this.page.locator('dt:has-text("Remit PST Tax")').count()) > 0;
  }

  @step('Test boundary value')
  async testBoundaryValue(
    spinKey: keyof typeof LocationSettingsSelectors,
    value: string,
    valid: boolean,
    errorContains: string | undefined,
    restoreValue: string,
    officeNo: string = '1604',
    restoreEnableKey?: keyof typeof LocationSettingsSelectors,
  ): Promise<{ passed: boolean; detail: string }> {
    await this.setSpinValue(spinKey, value);

    if (!valid && errorContains) {
      await this.getElement(spinKey).press('Tab');
      const hasError = await this.hasValidationError(errorContains);
      if (!hasError) {
        // Some borderline values disable Save silently without an inline error paragraph.
        const saveDisabled = !(await this.isSaveEnabled());
        if (!saveDisabled) {
          return { passed: false, detail: `Expected error containing "${errorContains}", none found; Save also enabled -- app accepted the value` };
        }
        await this.setSpinValue(spinKey, restoreValue);
        await this.clickSave();
        await this.waitForAngularStable();
        return { passed: true, detail: `${value} -> silently invalid (save disabled, no inline error) [ok]` };
      }
      await this.setSpinValue(spinKey, restoreValue);
      await this.clickSave();
      await this.waitForAngularStable();
      return { passed: true, detail: `${value} -> invalid (error shown) [ok]` };
    }

    await this.clickSave();
    // Wait for the server to acknowledge the save before reloading. Without this the reload can
    // outrun the in-flight request and the field reads back at its pre-save value -- the cause of
    // an intermittent TC-LOC-LI-008 failure ("expected display~=10.00, got 4.00"). Tolerant of a
    // missed toast so a fast save that clears before we look still proceeds.
    await this.waitForSaveToast().catch(() => { /* toast already gone, or none shown */ });
    await this.waitForAngularStable();
    await this.reloadAndNavigateToLocalInfo(officeNo);

    const spin = await this.getSpinState(spinKey);
    const hasError = await this.hasValidationError('Number must be');
    if (hasError) {
      return { passed: false, detail: `Expected no error, got validation error` };
    }
    if (!spin.disabled) {
      const spinNum = parseFloat(spin.value);
      const expectedDisplayNum = parseFloat(value) * 100;
      if (isNaN(spinNum) || Math.abs(spinNum - expectedDisplayNum) > 0.01) {
        return { passed: false, detail: `Expected display~=${expectedDisplayNum.toFixed(2)} (fill "${value}"x100), got value="${spin.value}"` };
      }
    }

    // The boundary value above was really saved, so the revert must be proven persisted or it
    // leaks to the shared office. A disabled spin counts as already-restored.
    await this.saveAndVerifyPersisted({
      isAtTarget: async () => {
        if (restoreEnableKey && !(await this.getCheckboxState(restoreEnableKey)).checked) return false;
        const s = await this.getSpinState(spinKey);
        if (s.disabled) return true;
        return Math.abs(parseFloat(s.value) - parseFloat(restoreValue) * 100) < 0.01;
      },
      applyMutation: async () => {
        if (restoreEnableKey) { await this.checkCheckbox(restoreEnableKey); }
        await this.setSpinValue(spinKey, restoreValue);
      },
      save: async () => { await this.clickSave(); },
      reload: () => this.reloadAndNavigateToLocalInfo(officeNo),
      label: `${String(spinKey)} restored to ${restoreValue}`,
    });
    return { passed: true, detail: `${value} -> valid [ok]` };
  }

  @step('Test dependency')
  async testDependency(
    trigger: keyof typeof LocationSettingsSelectors,
    triggerAction: 'check' | 'uncheck',
    target: keyof typeof LocationSettingsSelectors,
    targetType: 'spin' | 'checkbox',
    expectedDisabled: boolean,
    expectedChecked: boolean | undefined,
    restore: Array<{ key: keyof typeof LocationSettingsSelectors; action: 'check' | 'uncheck' }>,
    spinRestore?: { key: keyof typeof LocationSettingsSelectors; value: string },
  ): Promise<{ passed: boolean; failures: string[] }> {
    const failures: string[] = [];
    if (triggerAction === 'check') { await this.checkCheckbox(trigger); } else { await this.uncheckCheckbox(trigger); }

    if (targetType === 'checkbox') {
      const state = await this.getCheckboxState(target);
      if (state.disabled !== expectedDisabled) failures.push(`${target} disabled: expected ${expectedDisabled}, got ${state.disabled}`);
      if (expectedChecked !== undefined && state.checked !== expectedChecked) failures.push(`${target} checked: expected ${expectedChecked}, got ${state.checked}`);
    } else {
      const disabled = await this.isFieldDisabled(target);
      if (disabled !== expectedDisabled) failures.push(`${target} disabled: expected ${expectedDisabled}, got ${disabled}`);
    }

    // The trigger toggle above was saved, so the revert must be proven persisted or it leaks to
    // the shared office. Verified on checkbox states; the optional spin is best-effort.
    await this.saveAndVerifyPersisted({
      isAtTarget: async () => {
        for (const r of restore) {
          if ((await this.getCheckboxState(r.key)).checked !== (r.action === 'check')) return false;
        }
        return true;
      },
      applyMutation: async () => {
        for (const r of restore) {
          if (r.action === 'check') { await this.checkCheckbox(r.key); } else { await this.uncheckCheckbox(r.key); }
        }
        if (spinRestore) { await this.setSpinValue(spinRestore.key, spinRestore.value); }
      },
      save: async () => { await this.clickSave(); },
      reload: () => this.reloadAndNavigateToLocalInfo(),
      label: 'dependency restore',
    });
    return { passed: failures.length === 0, failures };
  }

  @step('Test max length')
  async testMaxLength(
    fieldKey: keyof typeof LocationSettingsSelectors,
    maxLength: number,
    restoreValue: string,
  ): Promise<{ passed: boolean; detail: string }> {
    const actualMax = await this.getMaxLength(fieldKey);
    if (actualMax !== maxLength) return { passed: false, detail: `maxLength: expected ${maxLength}, got ${actualMax}` };
    const overlong = 'A'.repeat(maxLength * 2 + 10);
    await this.fillText(fieldKey, overlong);
    const truncated = await this.getTextValue(fieldKey);
    if (truncated.length > maxLength) return { passed: false, detail: `Truncation failed: length ${truncated.length} > ${maxLength}` };
    await this.saveAndVerifyPersisted({
      isAtTarget: async () => (await this.getTextValue(fieldKey)) === restoreValue,
      applyMutation: () => this.fillText(fieldKey, restoreValue),
      save: async () => { await this.clickSave(); },
      reload: () => this.reloadAndNavigateToLocalInfo(),
      label: `${String(fieldKey)} restored to baseline text`,
    });
    return { passed: true, detail: `maxLength=${maxLength} enforced [ok]` };
  }
}
