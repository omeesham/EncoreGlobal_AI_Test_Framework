import { BasePage } from '../base.page';
import { Log } from '../../utils/logger';
import { LocationSettingsSelectors } from '../../selectors';

export interface CheckboxState {
  checked: boolean;
  disabled: boolean;
}

export interface SpinState {
  value: string;
  disabled: boolean;
}

export abstract class LocationFormHelpers extends BasePage {

  abstract isSaveEnabled(): Promise<boolean>;
  abstract clickSave(): Promise<{ success: boolean; networkError?: string } | void>;
  abstract reloadAndNavigateToLocalInfo(officeNo: string): Promise<void>;

 /**
 * The E2E environment briefly renders form fields as disabled during hydration.
 */
  async waitForFormReady(selectorKey: keyof typeof LocationSettingsSelectors, timeout = 10_000): Promise<void> {
    const el = this.getElement(selectorKey);
    await el.waitFor({ state: 'visible', timeout });
    await this.page.waitForFunction(
      (selector: string) => {
        const node = document.querySelector(selector);
        return node && !(node as HTMLInputElement).disabled && node.getAttribute('aria-disabled') !== 'true';
      },
      LocationSettingsSelectors[selectorKey],
      { timeout },
    );
    Log.info(`[OK] Form ready: ${selectorKey} is enabled`);
  }

  async getCheckboxState(selectorKey: keyof typeof LocationSettingsSelectors): Promise<CheckboxState> {
    const state = await this.getRadixCheckboxState(selectorKey);
    Log.info(`Checkbox [${selectorKey}] -> checked=${state.checked} disabled=${state.disabled}`);
    return state;
  }

  async checkCheckbox(selectorKey: keyof typeof LocationSettingsSelectors): Promise<void> {
    const el = this.getElement(selectorKey);
    if (!(await this.getRadixCheckboxState(selectorKey)).checked) { await el.check(); Log.info(`Checked: ${selectorKey}`); }
  }

  async uncheckCheckbox(selectorKey: keyof typeof LocationSettingsSelectors): Promise<void> {
    const el = this.getElement(selectorKey);
    if ((await this.getRadixCheckboxState(selectorKey)).checked) { await el.uncheck(); Log.info(`Unchecked: ${selectorKey}`); }
  }

  async toggleCheckbox(selectorKey: keyof typeof LocationSettingsSelectors): Promise<boolean> {
    const el = this.getElement(selectorKey);
    const wasChecked = (await this.getRadixCheckboxState(selectorKey)).checked;
    if (wasChecked) { await el.uncheck(); } else { await el.check(); }
    const isNowChecked = (await this.getRadixCheckboxState(selectorKey)).checked;
    Log.info(`Toggled ${selectorKey}: ${wasChecked} -> ${isNowChecked}`);
    // A toggle must actually flip the state — if it did not, the checkbox was disabled or the click
    // missed, and a silent no-op would let a caller act on a state that never changed.
    if (isNowChecked === wasChecked) {
      throw new Error(`toggleCheckbox("${String(selectorKey)}") did not change state (still ${isNowChecked})`);
    }
    return isNowChecked;
  }

 /**
 * Reads the visible label text for a checkbox from the live DOM.
 * Structure: dt (label) + dd > button[role="checkbox"] -- all Local Info checkboxes follow this pattern.
 * Walks from the checkbox button up to its <dd> parent, then reads the preceding <dt> sibling text.
 * Live-verified: term (dt) + definition (dd) confirmed in Local Information tab DOM.
 */
  async getCheckboxLabel(selectorKey: string): Promise<string> {
    const el = this.getElement(selectorKey as keyof typeof LocationSettingsSelectors);
    const label = await el.evaluate((button: Element) => {
      const dd = button.closest('dd');
      const dt = dd?.previousElementSibling;
      return dt?.textContent?.trim() ?? '';
    }).catch(() => '');
    Log.info(`getCheckboxLabel [${selectorKey}] -> "${label}"`);
    return label;
  }

  async getSpinState(selectorKey: keyof typeof LocationSettingsSelectors): Promise<SpinState> {
    const el = this.getElement(selectorKey);
 // Custom percentage components display "4.00%"; strip the trailing % before returning.
    const raw = await el.inputValue().catch(() => '');
    const value = raw.replace(/%$/, '').trim();
    const disabled = await el.isDisabled().catch(() => true);
    Log.info(`Spin [${selectorKey}] -> raw="${raw}" value="${value}" disabled=${disabled}`);
    return { value, disabled };
  }

  async setSpinValue(selectorKey: keyof typeof LocationSettingsSelectors, value: string): Promise<void> {
    const el = this.getElement(selectorKey);
    await el.click();
 // Ctrl+A is more reliable than triple-click for selecting all text in this input.
    await this.page.keyboard.press('Control+a');
 // keyboard.type fires raw keydown/input/keyup events — Radix UI field commit requires this.
    await this.page.keyboard.type(value);
    const preTab = await el.inputValue().catch(() => 'ERR');
    Log.info(`setSpinValue [${selectorKey}]: after type, before Tab -> "${preTab}"`);
    await el.press('Tab'); // blur -> component commits + formats display value
    const postTab = await el.inputValue().catch(() => 'ERR');
    Log.info(`setSpinValue [${selectorKey}]: after Tab -> "${postTab}"`);
  }

  async getTextValue(selectorKey: keyof typeof LocationSettingsSelectors): Promise<string> {
    return await this.getElement(selectorKey).inputValue().catch(() => '');
  }

  async fillText(selectorKey: keyof typeof LocationSettingsSelectors, value: string): Promise<void> {
    const el = this.getElement(selectorKey);
    await el.click({ clickCount: 3 });
    await el.fill(value);
 // Tab triggers blur -- required for Radix UI form model to commit the value before Save.
    await el.press('Tab');
    Log.info(`Filled [${selectorKey}] = "${value.substring(0, 30)}"`);
  }

  async hasValidationError(errorText: string): Promise<boolean> {
    const visible = await this.getElement('errValidationMessage')
      .or(this.getElement('errMinBoundary'))
      .or(this.getElement('errMaxBoundary'))
      .filter({ hasText: errorText })
      .first()
      .isVisible()
      .catch(() => false);
    Log.info(`Validation error "${errorText}" visible: ${visible}`);
    return visible;
  }

  async hasErrorDialog(): Promise<boolean> {
    return await this.getElement('dlgErrorDialog').isVisible().catch(() => false);
  }

  async getErrorDialogMessage(): Promise<string> {
    const el = this.getElement('dlgErrorMessage');
    return ((await el.textContent().catch(() => '')) ?? '').trim();
  }

  async dismissErrorDialog(): Promise<void> {
    const dialog = this.getElement('dlgErrorDialog');
    await this.clickWithRetry('btnErrorOk');
    await dialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    Log.info('Error dialog dismissed');
  }

  async getAttribute(selectorKey: keyof typeof LocationSettingsSelectors, attribute: string): Promise<string | null> {
    return await this.getElement(selectorKey).getAttribute(attribute).catch(() => null);
  }

  async getMaxLength(selectorKey: keyof typeof LocationSettingsSelectors): Promise<number> {
    const val = await this.getAttribute(selectorKey, 'maxlength');
    return val ? parseInt(val, 10) : -1;
  }

  async isFieldDisabled(selectorKey: keyof typeof LocationSettingsSelectors): Promise<boolean> {
    return await this.getElement(selectorKey).isDisabled().catch(() => true);
  }

  async verifyCheckboxDefaults(expected: Record<string, boolean>): Promise<{ allPassed: boolean; failures: string[] }> {
    const failures: string[] = [];
    for (const [key, expectedChecked] of Object.entries(expected)) {
      const state = await this.getCheckboxState(key as keyof typeof LocationSettingsSelectors);
      if (state.checked !== expectedChecked) {
        failures.push(`${key}: expected checked=${expectedChecked}, got ${state.checked}`);
      }
    }
    Log.info(`Checkbox defaults: ${Object.keys(expected).length} checked, ${failures.length} failures`);
    return { allPassed: failures.length === 0, failures };
  }

  async verifyCheckboxDisabledStates(expected: Record<string, boolean>): Promise<{ allPassed: boolean; failures: string[] }> {
    const failures: string[] = [];
    for (const [key, expectedDisabled] of Object.entries(expected)) {
      const state = await this.getCheckboxState(key as keyof typeof LocationSettingsSelectors);
      if (state.disabled !== expectedDisabled) {
        failures.push(`${key}: expected disabled=${expectedDisabled}, got ${state.disabled}`);
      }
    }
    Log.info(`Checkbox disabled states: ${Object.keys(expected).length} checked, ${failures.length} failures`);
    return { allPassed: failures.length === 0, failures };
  }
}
