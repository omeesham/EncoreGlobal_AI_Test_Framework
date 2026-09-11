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
 // Navigate away to a different route first to force the app to destroy + recreate the
 // settings component. page.reload can hit the router cache and replay stale state
 // instead of re-fetching from server.
    const base = this.config?.base_url || '';
    await this.page.goto(`${base}locations`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await this.navigateToLocalInfoTab(officeNo);
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

 /**
 * Dialog timeout extended to 10s — this form has slower server validation.
 */
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
    const el = this.getElement('drpBillingCycle');
    return (await el.textContent().catch(() => '') ?? '').trim();
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

    // Restore the field to baseline and PROVE it persisted -- this test saved a real boundary value
    // above, so a silent failure to revert would leak it to the shared office and contaminate later
    // tests. The spin display is the entered value x100 (see the persistence check above); a disabled
    // spin cannot be changed and counts as already-restored, but its enabling checkbox must be back.
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

    // Restore the toggled controls and PROVE the revert persisted -- the trigger toggle above was
    // saved, so a silent failure to revert would leak it to the shared office. Verify on the
    // unambiguous checkbox states; the optional spin is re-applied best-effort.
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
