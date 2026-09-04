import { Page } from '@playwright/test';
import { BasePage } from '../base.page';
import { Log } from '../../utils/logger';
import { IConfig } from '../../types';
import { LP_BASELINE, PAY_TO_ORIGINAL } from '../../data/locations/location-left-panel-basic-information';
import { step } from '../../fixtures/step-decorator';

export class LocationLeftPanelBasicInformationPage extends BasePage {
  constructor(page: Page, config?: IConfig) {
    super(page, config);
    Log.info('LocationLeftPanelBasicInformationPage initialized');
  }

  @step('Navigate to basic information')
  async navigateToBasicInformation(officeNo: string = '1604'): Promise<void> {
    const expected = `locations/${officeNo}/settings/location`;
    if (!this.page.url().includes(expected)) {
      const baseUrl = this.config?.base_url || '';
      Log.info(`Navigating to ${expected}`);
      await this.navigateTo(`${baseUrl}${expected}`);
      await this.waitForAngularStable();
    }
    // The left panel is always present on this URL; the editable name field is the readiness anchor.
    await this.getElement('txtLocalOfficeName').waitFor({ state: 'visible', timeout: 30_000 });
  }

  @step('Is on basic information')
  async isOnBasicInformation(): Promise<boolean> {
    const el = this.getElement('txtLocalOfficeName');
    if ((await el.count()) === 0) return false;
    return el.isVisible().catch(() => false);
  }

  @step('Reload and navigate')
  async reloadAndNavigate(officeNo: string = '1604'): Promise<void> {
    const handler = async (d: import('@playwright/test').Dialog) => {
      try { await d.accept(); } catch { /* dialog may already be handled */ }
    };
    this.page.on('dialog', handler);
    try {
      await this.page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
    } finally {
      this.page.removeListener('dialog', handler);
    }
    await this.waitForAngularStable();
    await this.navigateToBasicInformation(officeNo);
  }

  @step('Get office value')
  async getOfficeValue(): Promise<string> { return this.getFieldDisplayValue('txtOffice'); }
  @step('Get local office value')
  async getLocalOfficeValue(): Promise<string> { return this.getFieldDisplayValue('txtLocalOffice'); }
  @step('Get local office name')
  async getLocalOfficeName(): Promise<string> { return (await this.getElement('txtLocalOfficeName').inputValue()).trim(); }
  @step('Get pay to address')
  async getPayToAddress(): Promise<string> { return this.getFieldDisplayValue('txtPayToAddress'); }
  @step('Get tax mode')
  async getTaxMode(): Promise<string> { return this.getFieldDisplayValue('drpTaxMode'); }
  @step('Get country')
  async getCountry(): Promise<string> { return this.getFieldDisplayValue('drpCountry'); }
  @step('Get region')
  async getRegion(): Promise<string> { return this.getFieldDisplayValue('drpRegion'); }
  @step('Get servicing branch')
  async getServicingBranch(): Promise<string> { return this.getFieldDisplayValue('drpServicingBranch'); }
  @step('Get line of business')
  async getLineOfBusiness(): Promise<string> { return this.getFieldDisplayValue('drpLineOfBusiness'); }
  @step('Get live date text')
  async getLiveDateText(): Promise<string> { return this.getFieldDisplayValue('btnLiveDate'); }

  @step('Is field disabled')
  async isFieldDisabled(key: string): Promise<boolean> {
    return this.getElement(key).isDisabled().catch(() => true);
  }

  @step('Get active state')
  async getActiveState() { return this.getRadixCheckboxState('chkActive'); }
  @step('Get union state')
  async getUnionState() { return this.getRadixCheckboxState('chkUnion'); }
  @step('Get e commerce state')
  async getECommerceState() { return this.getRadixCheckboxState('chkECommerceActive'); }
  @step('Get production orders state')
  async getProductionOrdersState() { return this.getRadixCheckboxState('chkEnableProductionsOrders'); }

  @step('Get local office name max length')
  async getLocalOfficeNameMaxLength(): Promise<number | null> {
    const max = await this.getElement('txtLocalOfficeName').getAttribute('maxlength');
    return max ? parseInt(max, 10) : null;
  }

  @step('Set local office name')
  async setLocalOfficeName(value: string): Promise<void> {
    const el = this.getElement('txtLocalOfficeName');
    await el.click();
    await el.press('Control+a');
    await el.press('Delete');
    // pressSequentially (real keystrokes) reliably fires Angular input events so the form dirties,
    // AND respects the input's maxlength — Playwright fill() sets .value directly, bypassing both (Angular dirty-state).
    await el.pressSequentially(value, { delay: 10 });
    await el.press('Tab');
  }

  @step('Clear local office name')
  async clearLocalOfficeName(): Promise<void> {
    const el = this.getElement('txtLocalOfficeName');
    await el.click();
    await el.press('Control+a');
    await el.press('Delete');
    await el.press('Tab');
  }

  // Playwright check()/uncheck() auto-verifies the aria-checked state (with actionability retry) —
  // robust against the Radix "click focuses but doesn't toggle" race that setRadixCheckbox can hit.
  @step('Set active')
  async setActive(checked: boolean): Promise<void> {
    const el = this.getElement('chkActive');
    if (checked) await el.check({ timeout: 15_000 }); else await el.uncheck({ timeout: 15_000 });
  }
  @step('Set union')
  async setUnion(checked: boolean): Promise<void> {
    const el = this.getElement('chkUnion');
    if (checked) await el.check({ timeout: 15_000 }); else await el.uncheck({ timeout: 15_000 });
  }

  @step('Select tax mode')
  async selectTaxMode(text: string): Promise<void> { await this.selectComboboxOption('drpTaxMode', text, { exact: true }); }
  @step('Select country')
  async selectCountry(text: string): Promise<void> { await this.selectComboboxOption('drpCountry', text, { exact: true }); }
  @step('Select region')
  async selectRegion(text: string): Promise<void> { await this.selectComboboxOption('drpRegion', text, { exact: true }); }
  @step('Select servicing branch')
  async selectServicingBranch(text: string): Promise<void> { await this.selectComboboxOption('drpServicingBranch', text, { exact: false }); }

  @step('Get tax mode options')
  async getTaxModeOptions(): Promise<string[]> { return this.getComboboxOptions('drpTaxMode'); }
  @step('Get country options')
  async getCountryOptions(): Promise<string[]> { return this.getComboboxOptions('drpCountry'); }
  @step('Get region options')
  async getRegionOptions(): Promise<string[]> { return this.getComboboxOptions('drpRegion'); }
  @step('Get servicing branch options')
  async getServicingBranchOptions(): Promise<string[]> { return this.getComboboxOptions('drpServicingBranch'); }

  @step('Open live date popover')
  async openLiveDatePopover(): Promise<boolean> {
    await this.getElement('btnLiveDate').click();
    const popover = this.page.locator('[data-radix-popper-content-wrapper], [role="dialog"], [role="grid"]');
    return popover.first().waitFor({ state: 'visible', timeout: 5_000 }).then(() => true).catch(() => false);
  }

  @step('Close live date popover')
  async closeLiveDatePopover(): Promise<void> {
    await this.page.keyboard.press('Escape');
  }

  // The left panel is shared/always-visible, so a Country change applied here is
  // reactive on whichever sub-tab is showing — these READ Local Information only.

  @step('Click local information tab')
  async clickLocalInformationTab(): Promise<void> {
    const tab = this.getElement('tabLocalInformation');
    await tab.waitFor({ state: 'visible', timeout: 15_000 });
    if ((await tab.getAttribute('aria-selected').catch(() => null)) !== 'true') {
      await tab.click();
      await this.waitForAngularStable();
    }
  }

  @step('Get job costing state')
  async getJobCostingState() { return this.getRadixCheckboxState('chkEnableJobCosting'); }

  @step('Is remit pst visible')
  async isRemitPstVisible(): Promise<boolean> {
    return this.page.getByText('Remit PST Tax', { exact: false }).first()
      .isVisible({ timeout: 3_000 }).catch(() => false);
  }

  @step('Is save enabled')
  async isSaveEnabled(): Promise<boolean> {
    return !(await this.getElement('btnSave').isDisabled().catch(() => true));
  }

  @step('Wait for save button enabled')
  async waitForSaveButtonEnabled(timeout = 10_000): Promise<boolean> {
    return this.waitForSaveEnabled('btnSave', timeout);
  }

  /** Poll the shared Save button DISABLING (e.g. net-zero revert or post-save pristine — RAF poll). */
  @step('Wait for save button disabled')
  async waitForSaveButtonDisabled(timeout = 10_000): Promise<boolean> {
    return this.page.waitForFunction(() => {
      const deep = (root: Document | ShadowRoot, sel: string): Element | null => {
        const found = root.querySelector(sel);
        if (found) return found;
        for (const el of Array.from(root.querySelectorAll('*'))) {
          const sr = el.shadowRoot;
          if (sr) { const x = deep(sr, sel); if (x) return x; }
        }
        return null;
      };
      const btn = deep(document, '[data-testid="location-settings-btn-save"]') as HTMLButtonElement | null;
      return !!btn && btn.disabled;
    }, undefined, { timeout }).then(() => true).catch(() => false);
  }

  @step('Click save')
  async clickSave(): Promise<{ success: boolean; networkError?: string }> {
    await this.waitForSaveEnabled('btnSave');
    return this.clickSaveWithDialog('btnSave', 'dlgSaveChanges', 'btnSaveChangesConfirm');
  }

  @step('Save and confirm')
  async saveAndConfirm(): Promise<void> {
    const result = await this.clickSave();
    if (!result.success) {
      throw new Error(`Left-panel save failed: ${result.networkError ?? 'unknown error'}`);
    }
    // Confirm the save LANDED before any caller reload: the app disables the Save button once the
    // save API completes + the form goes pristine. Guards the save-then-reload race (Angular dirty-state) — the
    // name save in particular is slower than checkbox/dropdown saves and otherwise reloads stale.
    await this.page.waitForFunction(() => {
      const deep = (root: Document | ShadowRoot, sel: string): Element | null => {
        const found = root.querySelector(sel);
        if (found) return found;
        for (const el of Array.from(root.querySelectorAll('*'))) {
          const sr = el.shadowRoot;
          if (sr) { const x = deep(sr, sel); if (x) return x; }
        }
        return null;
      };
      const btn = deep(document, '[data-testid="location-settings-btn-save"]') as HTMLButtonElement | null;
      return !!btn && btn.disabled;
    }, undefined, { timeout: 10_000 }).catch(() => { /* best-effort; the test assertion catches a true miss */ });
  }

  // Pay To Address opens via a <label> click, not a button — a standard Playwright click is
  // BLOCKED (its `for=` points at the disabled input → "element is not enabled"), so the
  // launcher is driven via dispatchEvent('click').
  // The name "Encore" is ambiguous (IDs 1 & 4 share it), so restore is ID-anchored.
  // Kept separate from the account-address dialog helpers: the launchers use different click
  // mechanisms, the filter locators differ, and persistence behavior differs per launcher —
  // a shared abstraction would couple non-identical behaviors.

  @step('Open pay to dialog')
  async openPayToDialog(): Promise<void> {
    const label = this.getElement('lblPayToAddress').first();
    await label.dispatchEvent('click');
    await this.getElement('dlgPayToList').first().waitFor({ state: 'visible', timeout: 15_000 });
    Log.info('[OK] Pay To List dialog opened');
  }

  @step('Is pay to dialog visible')
  async isPayToDialogVisible(): Promise<boolean> {
    return this.getElement('dlgPayToList').first().isVisible({ timeout: 3_000 }).catch(() => false);
  }

  @step('Is pay to select disabled')
  async isPayToSelectDisabled(): Promise<boolean> {
    return this.getElement('btnPTLSelect').isDisabled().catch(() => true);
  }

  @step('Has pay to filters')
  async hasPayToFilters(): Promise<boolean> {
    const dlg = this.getElement('dlgPayToList').first();
    const id = await dlg.getByRole('textbox', { name: 'Pay To ID', exact: true }).isVisible().catch(() => false);
    const name = await dlg.getByRole('textbox', { name: 'Pay To Name', exact: true }).isVisible().catch(() => false);
    return id && name;
  }

  @step('Has pay to action buttons')
  async hasPayToActionButtons(): Promise<boolean> {
    const search = await this.isElementVisible('btnPTLSearch', 3_000);
    const reset = await this.isElementVisible('btnPTLReset', 3_000);
    return search && reset;
  }

  @step('Has pay to table and cancel')
  async hasPayToTableAndCancel(): Promise<boolean> {
    const table = await this.isElementVisible('tblPTLResults', 3_000);
    const cancel = await this.isElementVisible('btnPTLCancel', 3_000);
    return table && cancel;
  }

  /**
   * Type into a Pay To List filter input via real keystrokes (React-controlled — fill() can no-op).
   * Filters are located by ACCESSIBLE NAME (no stable CSS attribute — the name comes from a sibling
   * label), scoped to the dialog. `filterName` ∈ "Pay To ID" | "Pay To Name" | "Address" | "Phone" | "Fax".
   */
  private async typePayToFilter(filterName: string, value: string): Promise<void> {
    const el = this.getElement('dlgPayToList').first().getByRole('textbox', { name: filterName, exact: true });
    await el.click();
    await el.press('Control+a');
    await el.press('Delete');
    await el.pressSequentially(value, { delay: 20 });
  }

  private async submitPayToSearch(): Promise<void> {
    const resp = this.page.waitForResponse(
      (r) => r.url().includes('/navigator/api/location/getLocationPayToList'),
      { timeout: 15_000 },
    ).catch(() => null);
    await this.clickWithRetry('btnPTLSearch');
    await resp;
  }

  @step('Search Pay To')
  async searchPayToById(id: string): Promise<void> {
    await this.typePayToFilter('Pay To ID', id);
    await this.submitPayToSearch();
  }

  @step('Search pay to by name')
  async searchPayToByName(name: string): Promise<void> {
    await this.typePayToFilter('Pay To Name', name);
    await this.submitPayToSearch();
  }

  @step('Reset pay to search')
  async resetPayToSearch(): Promise<void> {
    await this.clickWithRetry('btnPTLReset');
    Log.info('Reset Pay To List search filters (dialog only, no server state changed)');
  }

  @step('Pay to results contain')
  async payToResultsContain(text: string): Promise<boolean> {
    const table = this.getElement('tblPTLResults');
    try {
      await table.locator(`tbody:has-text("${text}")`).first().waitFor({ state: 'visible', timeout: 10_000 });
      return true;
    } catch {
      return false;
    }
  }

  @step('Get pay to dialog row count')
  async getPayToDialogRowCount(): Promise<number> {
    const table = this.getElement('tblPTLResults');
    await table.waitFor({ state: 'visible', timeout: 5_000 });
    return table.locator('tbody tr').evaluateAll(
      (rows) => rows.filter((r) => (r as HTMLElement).offsetHeight > 0 && r.querySelector('td:nth-child(2)')?.textContent?.trim()).length,
    );
  }

  @step('Is pay to dialog empty')
  async isPayToDialogEmpty(): Promise<boolean> {
    const dlg = this.getElement('dlgPayToList').first();
    const text = await dlg.textContent().catch(() => '');
    return (text || '').includes('No results');
  }

  @step('Check pay to first row')
  async checkPayToFirstRow(): Promise<void> {
    await this.clickWithRetry('chkPTLRowFirst');
    Log.info('Checked first Pay To row');
  }

  @step('Cancel pay to dialog')
  async cancelPayToDialog(): Promise<void> {
    await this.clickWithRetry('btnPTLCancel');
    await this.getElement('dlgPayToList').first().waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
    Log.info('Cancelled Pay To List dialog');
  }

  @step('Close pay to dialog')
  async closePayToDialog(): Promise<void> {
    await this.clickWithRetry('btnPTLClose');
    await this.getElement('dlgPayToList').first().waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
    Log.info('Closed Pay To List dialog (X)');
  }

  @step('Esc pay to dialog')
  async escPayToDialog(): Promise<void> {
    await this.page.keyboard.press('Escape');
    await this.getElement('dlgPayToList').first().waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
    Log.info('Dismissed Pay To List dialog (Esc)');
  }

  /**
   * Select a Pay To by ID end-to-end: open dialog (if needed) → search by ID → check the (single)
   * result row → Select → wait for the dialog to close. Leaves the form DIRTY (does NOT save) — the
   * caller decides whether to save (persistence) or reload (discard). ID-anchored because the name
   * "Encore" is ambiguous (IDs 1 & 4 share it).
   */
  @step('Select the Pay To account')
  async selectPayToById(id: string): Promise<void> {
    if (!(await this.isPayToDialogVisible())) await this.openPayToDialog();
    await this.searchPayToById(id);
    await this.checkPayToFirstRow();
    await this.clickWithRetry('btnPTLSelect');
    await this.getElement('dlgPayToList').first().waitFor({ state: 'hidden', timeout: 10_000 });
    Log.info(`[OK] Selected Pay To ID ${id}`);
  }

  @step('Restore pay to original')
  async restorePayToOriginal(): Promise<void> {
    await this.saveAndVerifyPersisted({
      isAtTarget: async () => (await this.getPayToAddress()) === PAY_TO_ORIGINAL.name,
      applyMutation: () => this.selectPayToById(String(PAY_TO_ORIGINAL.id)),
      save: () => this.saveAndConfirm(),
      reload: () => this.reloadAndNavigate(),
      label: `office 1604 Pay To = "${PAY_TO_ORIGINAL.name}" (ID ${PAY_TO_ORIGINAL.id})`,
    });
  }

  /**
   * Bounded retry (max 3) because a Radix select click can "succeed" yet leave Angular's model
   * unchanged; clickSaveWithDialog returns {success:true} when Save is disabled, so save-success
   * alone never proves the reset landed. The post-reload re-read is the load-bearing check.
   *
   * Country is set FIRST — a Country change cascade-clears Tax Mode + Region.
   */
  @step('Ensure default state')
  async ensureDefaultState(baseline: typeof LP_BASELINE = LP_BASELINE): Promise<void> {
    // Pay To self-heal guard. A display read returns only the NAME ("Encore"), which is ambiguous
    // (two Pay To rows share it), so we cannot safely repair by name alone. But an ID-anchored
    // restore exists (restorePayToOriginal re-selects Pay To ID 1 and verifies it persisted), so when
    // the name has drifted off the office-1604 default -- e.g. a leaked alternate from a crashed run --
    // we drive that restore instead of failing the whole test. It still throws if the restore itself
    // cannot land, so a genuinely unrepairable state stays loud.
    if ((await this.getPayToAddress()) !== PAY_TO_ORIGINAL.name) {
      Log.warn(`Pay To drifted off the office-1604 default -- self-healing to "${PAY_TO_ORIGINAL.name}" (ID ${PAY_TO_ORIGINAL.id})`);
      await this.restorePayToOriginal();
    }

    const maxAttempts = 3;
    const atDefaults = async (): Promise<boolean> =>
      (await this.getCountry()) === baseline.country
      && (await this.getTaxMode()) === baseline.taxMode
      && (await this.getRegion()) === baseline.region
      && (await this.getLocalOfficeName()) === baseline.localOfficeName
      && (await this.getActiveState()).checked === baseline.active
      && (await this.getUnionState()).checked === baseline.union;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let dirty = false;
      // Country FIRST (its change cascade-clears Tax Mode + Region).
      if ((await this.getCountry()) !== baseline.country) { await this.selectCountry(baseline.country); dirty = true; }
      if ((await this.getTaxMode()) !== baseline.taxMode) { await this.selectTaxMode(baseline.taxMode); dirty = true; }
      if ((await this.getRegion()) !== baseline.region) { await this.selectRegion(baseline.region); dirty = true; }
      if ((await this.getLocalOfficeName()) !== baseline.localOfficeName) { await this.setLocalOfficeName(baseline.localOfficeName); dirty = true; }
      if ((await this.getActiveState()).checked !== baseline.active) { await this.setActive(baseline.active); dirty = true; }
      if ((await this.getUnionState()).checked !== baseline.union) { await this.setUnion(baseline.union); dirty = true; }

      if (!dirty) return; // already at defaults
      await this.saveAndConfirm();
      await this.reloadAndNavigate();
      if (await atDefaults()) return;
    }
    throw new Error(`ensureDefaultState: left panel not at office-1604 defaults after ${maxAttempts} attempts`);
  }
}
