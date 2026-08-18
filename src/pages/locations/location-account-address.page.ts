import { Page } from '@playwright/test';
import { BasePage } from '../base.page';
import { Log } from '../../utils/logger';
import { IConfig } from '../../types';
import { PHONE1_BASELINE } from '../../data/locations/location-account-address';

export class LocationAccountAddressPage extends BasePage {
  constructor(page: Page, config?: IConfig) {
    super(page, config);
    Log.info('LocationAccountAddressPage initialized');
  }

  async isOnAccountAndAddressTab(): Promise<boolean> {
    // pnlAccountAndAddress is a panel-wrapper testid that Radix keeps mounted across
    // all tab states (count() > 0 returns TRUE even when this tab is inactive). The
    // tab trigger's aria-selected is the only reliable signal.
    const tab = this.getElement('tabAccountAndAddress');
    if ((await tab.count()) === 0) return false;
    return (await tab.getAttribute('aria-selected').catch(() => null)) === 'true';
  }

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

  async isVenueNameDisabled(): Promise<boolean> {
    return this.getElement('txtAccVenueName').isDisabled();
  }

  async getVenueNameValue(): Promise<string> {
    return this.getFieldDisplayValue('txtAccVenueName');
  }

  async getPhone1Value(): Promise<string> {
    return this.getFieldDisplayValue('txtAccPhone1');
  }

  async getPhone2Value(): Promise<string> {
    return this.getFieldDisplayValue('txtAccPhone2');
  }

  async clearPhone1AndBlur(): Promise<void> {
    const el = this.getElement('txtAccPhone1');
    await el.clear();
    await el.press('Tab');
    Log.info('Cleared Phone 1 and blurred');
  }

  async fillPhone1(value: string): Promise<void> {
    await this.fillWithValidation('txtAccPhone1', value, { verify: false });
    await this.getElement('txtAccPhone1').press('Tab');
  }

  async fillPhone2(value: string): Promise<void> {
    await this.fillWithValidation('txtAccPhone2', value, { verify: false });
    await this.getElement('txtAccPhone2').press('Tab');
  }

  async isPhone1Invalid(): Promise<boolean> {
    const val = await this.getElement('txtAccPhone1').getAttribute('aria-invalid');
    return val === 'true';
  }

  async isPhone2Invalid(): Promise<boolean> {
    const val = await this.getElement('txtAccPhone2').getAttribute('aria-invalid');
    return val === 'true';
  }

  async isPhone1ErrorIconVisible(): Promise<boolean> {
    const input = this.getElement('txtAccPhone1');
 // Error icon is an SVG inside a tooltip-trigger div, sibling of the input within the same parent
    const icon = input.locator('..').locator('svg');
    return (await icon.count()) > 0 && (await icon.first().isVisible());
  }

  async getVenueAddressText(): Promise<string> {
    const panel = this.getPanel();
    const venueSection = panel.locator(':text("Venue/Branch Account")').locator('..').locator('..');
    const addressDd = venueSection.locator('dt:has-text("Address") + dd').first();
    return (await addressDd.textContent() ?? '').trim();
  }

 /**
 * Get the venue City text (dd element containing city value).
 * Uses positional indexing because City/State/Zip/Country are standalone <dd> elements
 * WITHOUT <dt> labels (see account-address.ts selectors, line 10: "Address display fields
 * are <dd> static text"). Only Name/Address have <dt> labels with buttons.
 * Venue section dd order: [0]=name (textbox), [1]=address, [2]=city, [3]=state, [4]=zip, [5]=country.
 * If the app adds a dd before City, this index must be updated.
 */
  async getVenueCityText(): Promise<string> {
    const cityText = await this.page.evaluate(() => {
      const panel = document.querySelector('[data-testid="location-settings-sub-tab-content-account-and-address"]');
      if (!panel) return '';
      const allDds = panel.querySelectorAll('dd');
      return allDds[2]?.textContent?.trim() ?? '';
    });
    return cityText;
  }

 // The Master Bill To Address card has 5 read-only <dd> values (Address, City, State, Zip, Country)
 // and NO Name field (unlike Venue). Selecting a different address via the Master launcher updates
 // these AND persists (unlike Venue, which does NOT persist; each launcher needs its own coverage).
 // Scope to the Master card the same way isDisplayFieldReadOnly() does (heading → climb 2 → card),
 // via Playwright locators (which pierce the shadow root).

  private getMasterSection() {
    return this.getPanel().locator(':text("Master Bill To Address")').locator('..').locator('..');
  }

 /**
  * All Master <dd> display values joined into one string (Address | City | State | Zip | Country).
  * Content-anchored — assert with `.toContain(value)` rather than positional index, so the check
  * survives a dd-order change. The values are distinct enough (8899 Beverly / WEST HOLLYWOOD vs
  * 4200 E Palm Canyon / PALM SPRINGS) to unambiguously prove which address is shown.
  */
  async getMasterAddressBlock(): Promise<string> {
    const dds = await this.getMasterSection().locator('dd').allTextContents();
    return dds.map((s) => s.trim()).filter(Boolean).join(' | ');
  }

  async getMasterCityText(): Promise<string> {
    const dds = await this.getMasterSection().locator('dd').allTextContents();
    return (dds[1] ?? '').trim();
  }

  async isVenueCardVisible(): Promise<boolean> {
    const panel = this.getElement('pnlAccountAndAddress');
    return panel.locator(':text("Venue/Branch Account")').isVisible();
  }

  async isMasterCardVisible(): Promise<boolean> {
    const panel = this.getElement('pnlAccountAndAddress');
    return panel.locator(':text("Master Bill To Address")').isVisible();
  }

  private getPanel() {
    return this.getElement('pnlAccountAndAddress');
  }

  async isDisplayFieldReadOnly(sectionText: string, expectedText: string): Promise<boolean> {
    const panel = this.getPanel();
    const section = panel.locator(`:text("${sectionText}")`).locator('..').locator('..');
    const dd = section.locator(`dd:has-text("${expectedText}")`).first();
    const count = await dd.count();
    if (count === 0) return false;
    const inputs = await dd.locator('input, textarea, [contenteditable="true"]').count();
    return inputs === 0;
  }

  async openAccountListDialog(): Promise<void> {
    await this.clickWithRetry('btnAccName');
    await this.waitForElement('dlgAccountList', 10_000);
    Log.info('[OK] Account List dialog opened');
  }

  async isAccountListDialogVisible(): Promise<boolean> {
    return this.isElementVisible('dlgAccountList', 3_000);
  }

  async searchAccountByName(name: string): Promise<void> {
    await this.searchAccountByFilter('txtAccListAccountName', name, 'name');
  }

  async isAccountListSelectDisabled(): Promise<boolean> {
    return this.getElement('btnAccListSelect').isDisabled();
  }

  async checkAccountListFirstRow(): Promise<void> {
    await this.clickWithRetry('chkAccListRowSelect');
    Log.info('Checked first row in Account List');
  }

  async cancelAccountListDialog(): Promise<void> {
    await this.clickWithRetry('btnAccListCancel');
    await this.getElement('dlgAccountList').waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
    Log.info('Cancelled Account List dialog');
  }

  async resetAccountListSearch(): Promise<void> {
    await this.clickWithRetry('btnAccListReset');
    Log.info('Reset Account List search filters (dialog only, no server state changed)');
  }

  async getAccountNameFilterValue(): Promise<string> {
    return this.getFieldDisplayValue('txtAccListAccountName');
  }

  async isAccountListEmpty(): Promise<boolean> {
    const table = this.getElement('tblAccListResults');
    const text = await table.textContent();
    return (text || '').includes('No results');
  }

  async accountListResultsContain(text: string): Promise<boolean> {
    const table = this.getElement('tblAccListResults');
    try {
      await table.locator(`tbody:has-text("${text}")`).waitFor({ state: 'visible', timeout: 10_000 });
      return true;
    } catch {
      return false;
    }
  }

  async searchAccountByAddress(address: string): Promise<void> {
    await this.searchAccountByFilter('txtAccListAddress', address, 'address');
  }

  async searchAccountByCity(city: string): Promise<void> {
    await this.searchAccountByFilter('txtAccListCity', city, 'city');
  }

  async searchAccountByNumber(num: string): Promise<void> {
    await this.searchAccountByFilter('txtAccListAccountNumber', num, 'number');
  }

  private async searchAccountByFilter(selectorKey: string, value: string, label: string): Promise<void> {
    await this.fillWithValidation(selectorKey, value);
    await this.clickWithRetry('btnAccListSearch');
    const table = this.getElement('tblAccListResults');
    const firstDataCell = table.locator('tbody tr:first-child td:nth-child(2)');
    // 45s budget: the Account List backend is slow and variable — account-number searches can take
    // 25-30s on contended runs while name/city/address searches resolve faster. Fast searches resolve
    // as soon as results land, so the raised ceiling never slows a fast run.
    await firstDataCell.waitFor({ state: 'visible', timeout: 45_000 });
    // Poll for the first data cell's text becoming non-empty via waitForFunction (not a fixed sleep).
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

  async selectAccountListFirstRow(): Promise<void> {
    await this.clickWithRetry('chkAccListRowSelect');
    await this.clickWithRetry('btnAccListSelect');
    await this.getElement('dlgAccountList').waitFor({ state: 'hidden', timeout: 10_000 });
    Log.info('[OK] Selected first account row and applied');
  }

  async hasAccountListFilters(): Promise<boolean> {
    const numField = await this.isElementVisible('txtAccListAccountNumber', 3_000);
    const nameField = await this.isElementVisible('txtAccListAccountName', 3_000);
    return numField && nameField;
  }

  async hasAccountListActionButtons(): Promise<boolean> {
    const search = await this.isElementVisible('btnAccListSearch', 3_000);
    const reset = await this.isElementVisible('btnAccListReset', 3_000);
    return search && reset;
  }

  async hasAccountListTable(): Promise<boolean> {
    return this.isElementVisible('tblAccListResults', 3_000);
  }

  async openVenueAddressDialog(): Promise<void> {
    await this.clickWithRetry('btnAccVenueAddress');
    await this.waitForElement('dlgSelectAddress', 10_000);
    Log.info('[OK] Select Customer Address dialog opened (venue)');
  }

  async openMasterAddressDialog(): Promise<void> {
    await this.clickWithRetry('btnAccMasterAddress');
    await this.waitForElement('dlgSelectAddress', 10_000);
    Log.info('[OK] Select Customer Address dialog opened (master)');
  }

  async isAddressDialogVisible(): Promise<boolean> {
    return this.isElementVisible('dlgSelectAddress', 3_000);
  }

  async getAddressRowCount(): Promise<number> {
    const table = this.getElement('tblAddrResults');
    await table.waitFor({ state: 'visible', timeout: 5_000 });
 // Client-side filter hides rows via CSS — count only visible rows with data
    const count = await table.locator('tbody tr').evaluateAll(
      rows => rows.filter(r => (r as HTMLElement).offsetHeight > 0 && r.querySelector('td:nth-child(2)')?.textContent?.trim()).length
    );
    return count;
  }

  async isAddressSelectDisabled(): Promise<boolean> {
    return this.getElement('btnAddrSelect').isDisabled();
  }

  async isAddressSaveDisabled(): Promise<boolean> {
    return this.getElement('btnAddrSave').isDisabled();
  }

  async checkAddressFirstRow(): Promise<void> {
    await this.clickWithRetry('chkAddrRow');
    Log.info('Checked first row in Address dialog');
  }

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

  async isAddressSearchVisible(): Promise<boolean> {
    return this.isElementVisible('txtAddrSearch', 3_000);
  }

  async addressResultsContain(text: string): Promise<boolean> {
    const table = this.getElement('tblAddrResults');
    const content = await table.locator('tbody tr').evaluateAll(
      (rows, search) => rows.filter(r => (r as HTMLElement).offsetHeight > 0).some(r => r.textContent?.includes(search)),
      text
    );
    return content;
  }

  async selectAddressRow(addressText: string): Promise<void> {
    const table = this.getElement('tblAddrResults');
    const row = table.locator(`tbody tr:has-text("${addressText}")`).first();
    await row.locator('td:first-child button[role="checkbox"]').click();
    await this.clickWithRetry('btnAddrSelect');
    await this.getElement('dlgSelectAddress').waitFor({ state: 'hidden', timeout: 10_000 });
    Log.info(`[OK] Selected address row: ${addressText}`);
  }

  async cancelAddressDialog(): Promise<void> {
    await this.clickWithRetry('btnAddrCancel');
    await this.getElement('dlgSelectAddress').waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
    Log.info('Cancelled Address dialog');
  }

  async getAddressTotalText(): Promise<string> {
    return this.getTextContent('lblAddrTotal');
  }

  async isSaveEnabled(): Promise<boolean> {
    const disabled = await this.getElement('btnSaveAccountAddress').isDisabled().catch(() => true);
    Log.info(`Left-panel Save enabled: ${!disabled}`);
    return !disabled;
  }

  async clickSave(): Promise<{ success: boolean; networkError?: string }> {
    return this.clickSaveWithDialog('btnSaveAccountAddress');
  }

  async openSaveDialog(): Promise<void> {
    await this.clickWithRetry('btnSaveAccountAddress');
    await this.waitForElement('dlgSaveChanges', 5_000);
    Log.info('[OK] Save Changes dialog opened (not confirmed)');
  }

  async cancelSaveDialog(): Promise<void> {
    await this.clickWithRetry('btnSaveChangesCancel');
    await this.getElement('dlgSaveChanges').waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
    Log.info('Cancelled Save Changes dialog');
  }

  async getSaveChangesMessage(): Promise<string> {
    return this.getTextContent('txtSaveChangesMessage');
  }

 /**
  * Throws on save failure so callers see server errors rather than a silent {success:false} return.
  */
  async saveAndConfirm(): Promise<void> {
    const result = await this.clickSave();
    if (!result.success) {
      throw new Error(`Account & Address save failed: ${result.networkError ?? 'unknown error'}`);
    }
  }

 /**
  * Bounded retry (max 3) because clickSaveWithDialog returns {success:true} even when Save
  * is disabled, so save-success alone never proves the reset landed.
  *
  * Phone 1 is server-authoritative: a reload restores it to the account phone regardless of
  * whether the fill propagated. Already-clean state returns immediately (cheap — no reload).
  */
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

 /**
  * Registers a listener for `GET /navigator-legacy/getLocationDetail` BEFORE the reload, then
  * awaits it after navigation. Phone2 binds to this endpoint (~5-6s on contended runs);
  * without this wait, callers polling Phone2 race an in-flight hydration response. The existing
  * navigateToAccountAndAddressTab gates only on Phone1 (faster account-API).
  */
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
