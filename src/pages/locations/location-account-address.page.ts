import { Page } from '@playwright/test';
import { BasePage } from '../base.page';
import { Log } from '../../utils/logger';
import { IConfig } from '../../types';
import { PHONE1_BASELINE } from '../../data/locations/location-account-address';
import { step } from '../../fixtures/step-decorator';

export class LocationAccountAddressPage extends BasePage {
  constructor(page: Page, config?: IConfig) {
    super(page, config);
    Log.info('LocationAccountAddressPage initialized');
  }

  @step('Is on account and address tab')
  async isOnAccountAndAddressTab(): Promise<boolean> {
    // Radix keeps pnlAccountAndAddress mounted even when the tab is inactive, so only the
    // trigger's aria-selected is a reliable signal.
    const tab = this.getElement('tabAccountAndAddress');
    if ((await tab.count()) === 0) return false;
    return (await tab.getAttribute('aria-selected').catch(() => null)) === 'true';
  }

  @step('Navigate to account and address tab')
  async navigateToAccountAndAddressTab(officeNo: string = '1604'): Promise<void> {
    await this.navigateToSubTab('tabAccountAndAddress', 'pnlAccountAndAddress', officeNo);
 // Account & Address API can be slow — wait for Phone 1 field to be populated (always present)
    const phone1Field = this.getElement('txtAccPhone1');
    await phone1Field.waitFor({ state: 'visible', timeout: 30_000 });
    await this.page.waitForFunction(
      (selector: string) => {
        const el = document.querySelector(selector) as HTMLInputElement;
        return el && el.value.trim().length > 0;
      },
      '[data-testid="location-settings-input-contact-phone-1"]',
      { timeout: 15_000 }
    );
  }

  @step('Is venue name disabled')
  async isVenueNameDisabled(): Promise<boolean> {
    return this.getElement('txtAccVenueName').isDisabled();
  }

  @step('Get venue name value')
  async getVenueNameValue(): Promise<string> {
    return this.getFieldDisplayValue('txtAccVenueName');
  }

  @step('Get phone1 value')
  async getPhone1Value(): Promise<string> {
    return this.getFieldDisplayValue('txtAccPhone1');
  }

  @step('Get phone2 value')
  async getPhone2Value(): Promise<string> {
    return this.getFieldDisplayValue('txtAccPhone2');
  }

  @step('Clear phone1 and blur')
  async clearPhone1AndBlur(): Promise<void> {
    const el = this.getElement('txtAccPhone1');
    await el.clear();
    await el.press('Tab');
    Log.info('Cleared Phone 1 and blurred');
  }

  @step('Fill phone1')
  async fillPhone1(value: string): Promise<void> {
    await this.fillWithValidation('txtAccPhone1', value, { verify: false });
    await this.getElement('txtAccPhone1').press('Tab');
  }

  @step('Fill phone2')
  async fillPhone2(value: string): Promise<void> {
    await this.fillWithValidation('txtAccPhone2', value, { verify: false });
    await this.getElement('txtAccPhone2').press('Tab');
  }

  @step('Is phone1 invalid')
  async isPhone1Invalid(): Promise<boolean> {
    const val = await this.getElement('txtAccPhone1').getAttribute('aria-invalid');
    return val === 'true';
  }

  @step('Is phone2 invalid')
  async isPhone2Invalid(): Promise<boolean> {
    const val = await this.getElement('txtAccPhone2').getAttribute('aria-invalid');
    return val === 'true';
  }

  @step('Is phone1 error icon visible')
  async isPhone1ErrorIconVisible(): Promise<boolean> {
    const input = this.getElement('txtAccPhone1');
 // Error icon is an SVG inside a tooltip-trigger div, sibling of the input within the same parent
    const icon = input.locator('..').locator('svg');
    return (await icon.count()) > 0 && (await icon.first().isVisible());
  }

  @step('Get venue address text')
  async getVenueAddressText(): Promise<string> {
    const panel = this.getPanel();
    const venueSection = panel.locator(':text("Venue/Branch Account")').locator('..').locator('..');
    const addressDd = venueSection.locator('dt:has-text("Address") + dd').first();
    return (await addressDd.textContent() ?? '').trim();
  }

 // Positional: City/State/Zip/Country are label-less <dd>s, so index 2 is the only handle.
 // A new <dd> before City breaks this.
  @step('Get venue city text')
  async getVenueCityText(): Promise<string> {
    const cityText = await this.page.evaluate(() => {
      const panel = document.querySelector('[data-testid="location-settings-sub-tab-content-account-and-address"]');
      if (!panel) return '';
      const allDds = panel.querySelectorAll('dd');
      return allDds[2]?.textContent?.trim() ?? '';
    });
    return cityText;
  }

 // Master card has no Name field and its address selection persists, unlike Venue's.
 // Scoped heading → climb 2 → card, matching isDisplayFieldReadOnly().
  private getMasterSection() {
    return this.getPanel().locator(':text("Master Bill To Address")').locator('..').locator('..');
  }

 // Assert against this with .toContain() rather than a positional index, so the check
 // survives a dd-order change.
  @step('Get master address block')
  async getMasterAddressBlock(): Promise<string> {
    const dds = await this.getMasterSection().locator('dd').allTextContents();
    return dds.map((s) => s.trim()).filter(Boolean).join(' | ');
  }

  @step('Get master city text')
  async getMasterCityText(): Promise<string> {
    const dds = await this.getMasterSection().locator('dd').allTextContents();
    return (dds[1] ?? '').trim();
  }

  @step('Is venue card visible')
  async isVenueCardVisible(): Promise<boolean> {
    const panel = this.getElement('pnlAccountAndAddress');
    return panel.locator(':text("Venue/Branch Account")').isVisible();
  }

  @step('Is master card visible')
  async isMasterCardVisible(): Promise<boolean> {
    const panel = this.getElement('pnlAccountAndAddress');
    return panel.locator(':text("Master Bill To Address")').isVisible();
  }

  private getPanel() {
    return this.getElement('pnlAccountAndAddress');
  }

  @step('Is display field read only')
  async isDisplayFieldReadOnly(sectionText: string, expectedText: string): Promise<boolean> {
    const panel = this.getPanel();
    const section = panel.locator(`:text("${sectionText}")`).locator('..').locator('..');
    const dd = section.locator(`dd:has-text("${expectedText}")`).first();
    const count = await dd.count();
    if (count === 0) return false;
    const inputs = await dd.locator('input, textarea, [contenteditable="true"]').count();
    return inputs === 0;
  }

  @step('Open account list dialog')
  async openAccountListDialog(): Promise<void> {
    await this.clickWithRetry('btnAccName');
    await this.waitForElement('dlgAccountList', 10_000);
    Log.info('[OK] Account List dialog opened');
  }

  @step('Is account list dialog visible')
  async isAccountListDialogVisible(): Promise<boolean> {
    return this.isElementVisible('dlgAccountList', 3_000);
  }

  @step('Search account by name')
  async searchAccountByName(name: string): Promise<void> {
    await this.searchAccountByFilter('txtAccListAccountName', name, 'name');
  }

  @step('Is account list select disabled')
  async isAccountListSelectDisabled(): Promise<boolean> {
    return this.getElement('btnAccListSelect').isDisabled();
  }

  @step('Check account list first row')
  async checkAccountListFirstRow(): Promise<void> {
    await this.clickWithRetry('chkAccListRowSelect');
    Log.info('Checked first row in Account List');
  }

  @step('Cancel account list dialog')
  async cancelAccountListDialog(): Promise<void> {
    await this.clickWithRetry('btnAccListCancel');
    await this.getElement('dlgAccountList').waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
    Log.info('Cancelled Account List dialog');
  }

  @step('Reset account list search')
  async resetAccountListSearch(): Promise<void> {
    await this.clickWithRetry('btnAccListReset');
    Log.info('Reset Account List search filters (dialog only, no server state changed)');
  }

  @step('Get account name filter value')
  async getAccountNameFilterValue(): Promise<string> {
    return this.getFieldDisplayValue('txtAccListAccountName');
  }

  @step('Is account list empty')
  async isAccountListEmpty(): Promise<boolean> {
    const table = this.getElement('tblAccListResults');
    const text = await table.textContent();
    return (text || '').includes('No results');
  }

  @step('Account list results contain')
  async accountListResultsContain(text: string): Promise<boolean> {
    const table = this.getElement('tblAccListResults');
    try {
      await table.locator(`tbody:has-text("${text}")`).waitFor({ state: 'visible', timeout: 10_000 });
      return true;
    } catch {
      return false;
    }
  }

  @step('Search account by address')
  async searchAccountByAddress(address: string): Promise<void> {
    await this.searchAccountByFilter('txtAccListAddress', address, 'address');
  }

  @step('Search account by city')
  async searchAccountByCity(city: string): Promise<void> {
    await this.searchAccountByFilter('txtAccListCity', city, 'city');
  }

  @step('Search account by number')
  async searchAccountByNumber(num: string): Promise<void> {
    await this.searchAccountByFilter('txtAccListAccountNumber', num, 'number');
  }

  private async searchAccountByFilter(selectorKey: string, value: string, label: string): Promise<void> {
    await this.fillWithValidation(selectorKey, value);
    await this.clickWithRetry('btnAccListSearch');
    const table = this.getElement('tblAccListResults');
    const firstDataCell = table.locator('tbody tr:first-child td:nth-child(2)');
    // 45s: account-number searches against this backend can take 25-30s on contended runs.
    await firstDataCell.waitFor({ state: 'visible', timeout: 45_000 });
    const firstDataCellSelector = `${this.getLocator('tblAccListResults')} tbody tr:first-child td:nth-child(2)`;
    await this.page.waitForFunction(
      (selector: string) => {
        const el = document.querySelector(selector);
        return !!el && (el.textContent ?? '').trim().length > 0;
      },
      firstDataCellSelector,
      { timeout: 45_000 }
    );
    Log.info(`Searched account by ${label}: ${value}`);
  }

  @step('Select account list first row')
  async selectAccountListFirstRow(): Promise<void> {
    await this.clickWithRetry('chkAccListRowSelect');
    await this.clickWithRetry('btnAccListSelect');
    await this.getElement('dlgAccountList').waitFor({ state: 'hidden', timeout: 10_000 });
    Log.info('[OK] Selected first account row and applied');
  }

  @step('Has account list filters')
  async hasAccountListFilters(): Promise<boolean> {
    const numField = await this.isElementVisible('txtAccListAccountNumber', 3_000);
    const nameField = await this.isElementVisible('txtAccListAccountName', 3_000);
    return numField && nameField;
  }

  @step('Has account list action buttons')
  async hasAccountListActionButtons(): Promise<boolean> {
    const search = await this.isElementVisible('btnAccListSearch', 3_000);
    const reset = await this.isElementVisible('btnAccListReset', 3_000);
    return search && reset;
  }

  @step('Has account list table')
  async hasAccountListTable(): Promise<boolean> {
    return this.isElementVisible('tblAccListResults', 3_000);
  }

  @step('Open venue address dialog')
  async openVenueAddressDialog(): Promise<void> {
    await this.clickWithRetry('btnAccVenueAddress');
    await this.waitForElement('dlgSelectAddress', 10_000);
    Log.info('[OK] Select Customer Address dialog opened (venue)');
  }

  @step('Open master address dialog')
  async openMasterAddressDialog(): Promise<void> {
    await this.clickWithRetry('btnAccMasterAddress');
    await this.waitForElement('dlgSelectAddress', 10_000);
    Log.info('[OK] Select Customer Address dialog opened (master)');
  }

  @step('Is address dialog visible')
  async isAddressDialogVisible(): Promise<boolean> {
    return this.isElementVisible('dlgSelectAddress', 3_000);
  }

  @step('Get address row count')
  async getAddressRowCount(): Promise<number> {
    const table = this.getElement('tblAddrResults');
    await table.waitFor({ state: 'visible', timeout: 5_000 });
 // Client-side filter hides rows via CSS — count only visible rows with data
    const count = await table.locator('tbody tr').evaluateAll(
      rows => rows.filter(r => (r as HTMLElement).offsetHeight > 0 && r.querySelector('td:nth-child(2)')?.textContent?.trim()).length
    );
    return count;
  }

  @step('Is address select disabled')
  async isAddressSelectDisabled(): Promise<boolean> {
    return this.getElement('btnAddrSelect').isDisabled();
  }

  @step('Is address save disabled')
  async isAddressSaveDisabled(): Promise<boolean> {
    return this.getElement('btnAddrSave').isDisabled();
  }

  @step('Check address first row')
  async checkAddressFirstRow(): Promise<void> {
    await this.clickWithRetry('chkAddrRow');
    Log.info('Checked first row in Address dialog');
  }

  @step('Search address')
  async searchAddress(term: string): Promise<void> {
    const table = this.getElement('tblAddrResults');
    const initialRowCount = await table.locator('tbody tr').count();
    await this.fillWithValidation('txtAddrSearch', term);
 // Client-side filter removes non-matching rows from DOM — wait for last pre-filter row to detach
    if (term && initialRowCount > 1) {
      await table.locator('tbody tr').nth(initialRowCount - 1).waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
    }
    Log.info(`Filtered addresses: ${term}`);
  }

  @step('Is address search visible')
  async isAddressSearchVisible(): Promise<boolean> {
    return this.isElementVisible('txtAddrSearch', 3_000);
  }

  @step('Address results contain')
  async addressResultsContain(text: string): Promise<boolean> {
    const table = this.getElement('tblAddrResults');
    const content = await table.locator('tbody tr').evaluateAll(
      (rows, search) => rows.filter(r => (r as HTMLElement).offsetHeight > 0).some(r => r.textContent?.includes(search)),
      text
    );
    return content;
  }

  @step('Select address row')
  async selectAddressRow(addressText: string): Promise<void> {
    const table = this.getElement('tblAddrResults');
    const row = table.locator(`tbody tr:has-text("${addressText}")`).first();
    await row.locator('td:first-child button[role="checkbox"]').click();
    await this.clickWithRetry('btnAddrSelect');
    await this.getElement('dlgSelectAddress').waitFor({ state: 'hidden', timeout: 10_000 });
    Log.info(`[OK] Selected address row: ${addressText}`);
  }

  @step('Cancel address dialog')
  async cancelAddressDialog(): Promise<void> {
    await this.clickWithRetry('btnAddrCancel');
    await this.getElement('dlgSelectAddress').waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
    Log.info('Cancelled Address dialog');
  }

  @step('Get address total text')
  async getAddressTotalText(): Promise<string> {
    return this.getTextContent('lblAddrTotal');
  }

  @step('Is save enabled')
  async isSaveEnabled(): Promise<boolean> {
    const disabled = await this.getElement('btnSaveAccountAddress').isDisabled().catch(() => true);
    Log.info(`Left-panel Save enabled: ${!disabled}`);
    return !disabled;
  }

  @step('Click save')
  async clickSave(): Promise<{ success: boolean; networkError?: string }> {
    return this.clickSaveWithDialog('btnSaveAccountAddress');
  }

  @step('Open save dialog')
  async openSaveDialog(): Promise<void> {
    await this.clickWithRetry('btnSaveAccountAddress');
    await this.waitForElement('dlgSaveChanges', 5_000);
    Log.info('[OK] Save Changes dialog opened (not confirmed)');
  }

  @step('Cancel save dialog')
  async cancelSaveDialog(): Promise<void> {
    await this.clickWithRetry('btnSaveChangesCancel');
    await this.getElement('dlgSaveChanges').waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
    Log.info('Cancelled Save Changes dialog');
  }

  @step('Get save changes message')
  async getSaveChangesMessage(): Promise<string> {
    return this.getTextContent('txtSaveChangesMessage');
  }

 /** Throws on failure so callers see server errors instead of a silent {success:false}. */
  @step('Save and confirm')
  async saveAndConfirm(): Promise<void> {
    const result = await this.clickSave();
    if (!result.success) {
      throw new Error(`Account & Address save failed: ${result.networkError ?? 'unknown error'}`);
    }
  }

 // Retries because clickSaveWithDialog returns {success:true} even when Save was disabled,
 // so only the post-reload re-read proves the reset landed.
  @step('Ensure default state')
  async ensureDefaultState(defaults?: { phone1?: string; phone2?: string }): Promise<void> {
    const wantPhone1 = defaults?.phone1 ?? PHONE1_BASELINE;
    const wantPhone2 = defaults?.phone2 ?? '';
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let dirty = false;
      if ((await this.getPhone2Value()) !== wantPhone2) {
        await this.fillPhone2(wantPhone2);
        dirty = true;
      }
      if ((await this.getPhone1Value()) !== wantPhone1) {
        await this.fillPhone1(wantPhone1);
        dirty = true;
      }
      if (!dirty) return; // already at baseline — cheap path, no reload
      await this.saveAndConfirm();
      await this.reloadAndNavigate();
      if ((await this.getPhone2Value()) === wantPhone2 && (await this.getPhone1Value()) === wantPhone1) {
        return;
      }
    }
    throw new Error(`ensureDefaultState: A&A Phone1/Phone2 not at baseline after ${maxAttempts} attempts`);
  }

 // Also waits on getLocationDetail, which binds Phone2 (~5-6s); navigateToAccountAndAddressTab
 // alone gates only on Phone1's faster account API.
  @step('Reload and navigate')
  async reloadAndNavigate(officeNo: string = '1604'): Promise<void> {
    const hydrationPromise = this.page.waitForResponse(
      (r) => r.url().includes('/navigator-legacy/getLocationDetail') && r.status() === 200,
      { timeout: 30_000 },
    ).catch(() => null);
    await this.page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
    await this.waitForAngularStable();
    await this.navigateToAccountAndAddressTab(officeNo);
    await hydrationPromise;
    Log.info('[OK] Reloaded and navigated to Account and Address tab');
  }
}
