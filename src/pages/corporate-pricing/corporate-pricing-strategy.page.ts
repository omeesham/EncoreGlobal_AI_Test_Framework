import { type Locator, type Page } from '@playwright/test';
import { CorporatePricingBasePage } from './corporate-pricing.page';
import type { IConfig } from '../../types';
import { CorporatePricingSelectors as S } from '../../selectors/corporate-pricing';
import { STRATEGY } from '../../data/corporate-pricing/strategy';
import { step } from '../../fixtures/step-decorator';

type StrategyFlag = 'Is Productions' | 'Is Internal' | 'Is GSO' | 'Is Active';

export class CorporatePricingStrategyPage extends CorporatePricingBasePage {
  constructor(page: Page, config?: IConfig) {
    super(page, config);
  }

  @step('Open the pricing strategy page')
  async open(pricebookId: string = STRATEGY.pricebookGuid, office: string = STRATEGY.office): Promise<void> {
    await this.gotoDetails(office, pricebookId);
    await this.page.locator(S.hdgPriceStrategies).first().waitFor({ state: 'visible', timeout: 25_000 });
    await this.waitForAngularStable();
  }

  @step('Is strategy tab active')
  async isStrategyTabActive(): Promise<boolean> {
    return this.isVisibleSafe(S.hdgPriceStrategies);
  }

  @step('Click detail tab')
  async clickDetailTab(): Promise<void> {
    await this.switchTab('Pricing Detail');
  }

  @step('Get header field')
  async getHeaderField(field: 'name' | 'type' | 'year' | 'currency' | 'active'): Promise<string> {
    switch (field) {
      case 'name':
        return (await this.page.locator(S.hdgPricebookName).first().innerText()).trim();
      case 'type':
        return this.readLabelValue('Labor/Equipment');
      case 'year':
        return this.readLabelValue('Year');
      case 'currency':
        return this.readLabelValue('Currency');
      case 'active':
        return (await this.page.locator(S.lblRecordStatus).first().innerText()).trim();
    }
  }

  private async readLabelValue(label: string): Promise<string> {
    return (await this.page.locator(`p:text-is("${label}") + p`).first().innerText()).trim();
  }

  @step('Header fields are read only')
  async headerFieldsAreReadOnly(): Promise<boolean> {
    const nameTag = await this.page.locator(S.hdgPricebookName).first().evaluate((el) => el.tagName).catch(() => '');
    const typeTag = await this.page.locator('p:text-is("Labor/Equipment") + p').first().evaluate((el) => el.tagName).catch(() => '');
    return nameTag === 'H2' && typeTag === 'P';
  }

  @step('Get tabs')
  async getTabs(): Promise<string[]> {
    const tabs: string[] = [];
    if ((await this.page.locator(S.tabPricingStrategy).count()) > 0) tabs.push('Pricing Strategy');
    if ((await this.page.locator(S.tabPricingDetail).count()) > 0) tabs.push('Pricing Detail');
    if ((await this.page.getByRole('button', { name: 'History', exact: true }).count()) > 0) tabs.push('History');
    return tabs;
  }

  @step('Has history tab')
  async hasHistoryTab(): Promise<boolean> {
    return (await this.getTabs()).includes('History');
  }

  @step('Get strategy total')
  async getStrategyTotal(): Promise<number> {
    const txt = await this.page.locator(S.lblStrategyTotal).first().innerText().catch(() => '');
    const m = txt.match(/Total:\s*(\d+)/);
    return m && m[1] ? parseInt(m[1], 10) : -1;
  }

  private strategyListItem(name: string): Locator {
    return this.page.getByRole('complementary').getByRole('button', { name }).first();
  }

  @step('Select strategy')
  async selectStrategy(name: string): Promise<void> {
    await this.strategyListItem(name).click();
    await this.waitForAngularStable();
  }

  @step('Select first strategy')
  async selectFirstStrategy(): Promise<void> {
    await this.page.getByRole('complementary').getByRole('button').filter({ hasText: /\S/ }).first().click();
    await this.waitForAngularStable();
  }

  @step('Is remove visible')
  async isRemoveVisible(name: string): Promise<boolean> {
    const item = this.strategyListItem(name);
    if ((await item.count()) === 0) return false;
    return (await item.getByRole('button').count()) > 0; // nested Remove icon button
  }

  private editorNameField(): Locator {
    return this.page.getByRole('textbox', { name: 'Pricing Strategy' });
  }

  @step('Get strategy name')
  async getStrategyName(): Promise<string> {
    return (await this.editorNameField().inputValue()).trim();
  }

  @step('Set strategy name')
  async setStrategyName(value: string): Promise<void> {
    await this.editorNameField().fill(value);
  }

  @step('Get flag')
  async getFlag(name: StrategyFlag): Promise<{ checked: boolean; disabled: boolean }> {
    const cb = this.page.getByRole('checkbox', { name });
    return {
      checked: await cb.isChecked().catch(() => false),
      disabled: await cb.isDisabled().catch(() => false),
    };
  }

  @step('Has locations table')
  async hasLocationsTable(): Promise<boolean> {
    return this.isVisibleSafe(S.tblLocationsUsingDefault);
  }

  @step('Get strategy locations')
  async getStrategyLocations(): Promise<Array<{ office: string; name: string }>> {
    const rows = this.page.locator(S.tblLocationsUsingDefault).first().locator('tbody tr');
    const out: Array<{ office: string; name: string }> = [];
    const n = await rows.count();
    for (let i = 0; i < n; i++) {
      const cells = rows.nth(i).locator('td');
      if ((await cells.count()) >= 2) {
        out.push({
          office: (await cells.nth(0).innerText()).trim(),
          name: (await cells.nth(1).innerText()).trim(),
        });
      }
    }
    return out;
  }

  @step('Open add strategy dialog')
  async openAddStrategyDialog(): Promise<void> {
    await this.page.getByRole('complementary').getByRole('button').filter({ hasText: /^$/ }).first().click();
    await this.page.locator(S.dlgNewStrategy).first().waitFor({ state: 'visible', timeout: 10_000 });
  }

  @step('Is add dialog open')
  async isAddDialogOpen(): Promise<boolean> {
    return this.isVisibleSafe(S.dlgNewStrategy);
  }

  @step('Add strategy')
  async addStrategy(name: string): Promise<void> {
    await this.openAddStrategyDialog();
    const dlg = this.page.locator(S.dlgNewStrategy).first();
    await dlg.getByRole('textbox', { name: 'Strategy Name' }).fill(name);
    await dlg.getByRole('button', { name: 'Add', exact: true }).click();
    await dlg.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => { /* dialog may animate out */ });
    await this.waitForAngularStable();
  }

  @step('Cancel add dialog')
  async cancelAddDialog(): Promise<void> {
    const dlg = this.page.locator(S.dlgNewStrategy).first();
    if (await dlg.isVisible().catch(() => false)) {
      await dlg.getByRole('button', { name: 'Cancel', exact: true }).click();
      await dlg.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => { /* ignore */ });
    }
  }

  @step('Remove strategy')
  async removeStrategy(name: string): Promise<void> {
    await this.strategyListItem(name).getByRole('button').first().click();
    await this.waitForAngularStable();
  }

  @step('Is dirty')
  async isDirty(): Promise<boolean> {
    return this.isSaveEnabled();
  }

  private static readonly SAVE_TOAST = 'Pricebook saved successfully';

  /**
   * Click Save (defensive — confirm an optional "Save Changes" alertdialog), then wait for the
   * "Pricebook saved successfully" toast as the success/settle signal. THROWS if Save is disabled
   * at call time (nothing to save) so a silent no-op surfaces as a test failure.
   *
   * Why the toast (not Save-button state): the Save button's TEXT flips "Save" → "Saving..." →
   * "Save" during commit (live-verified — the button is briefly `button "Saving..."`), so a
   * `text-is("Save")` disable-wait mismatches mid-save and stalls. The toast is the unambiguous
   * success event. Returns whether the toast was observed. Persistence is still proven by the
   * caller's reload + re-read (save-success ≠ pristine).
   */
  @step('Save and confirm')
  async saveAndConfirm(): Promise<{ toastSeen: boolean }> {
    // Attach the success-toast waiter BEFORE clicking Save — the toast surfaces and auto-dismisses
    // quickly, so a waiter set up only after the click + dialog-confirm can race past it (the source
    // of an intermittent miss under full-suite load).
    const toastPromise = this.page
      .getByText(CorporatePricingStrategyPage.SAVE_TOAST, { exact: false })
      .first()
      .waitFor({ state: 'visible', timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    await this.clickSaveButtonOrThrow('form not dirty');
    await this.confirmSaveDialogIfPresent(2_000);
    const toastSeen = await toastPromise;
    await this.waitForAngularStable();
    return { toastSeen };
  }

  private addDialog(): Locator {
    return this.page.locator(S.dlgNewStrategy).first();
  }

  @step('Fill dialog name')
  async fillDialogName(value: string): Promise<void> {
    await this.addDialog().getByRole('textbox', { name: 'Strategy Name' }).fill(value);
  }

  @step('Get dialog name')
  async getDialogName(): Promise<string> {
    return this.addDialog().getByRole('textbox', { name: 'Strategy Name' }).inputValue();
  }

  @step('Is dialog add enabled')
  async isDialogAddEnabled(): Promise<boolean> {
    return this.addDialog().getByRole('button', { name: 'Add', exact: true }).isEnabled().catch(() => false);
  }

  @step('Get dialog flag')
  async getDialogFlag(name: StrategyFlag): Promise<{ checked: boolean; disabled: boolean }> {
    const cb = this.addDialog().getByRole('checkbox', { name });
    return {
      checked: await cb.isChecked().catch(() => false),
      disabled: await cb.isDisabled().catch(() => false),
    };
  }

  @step('Set dialog flag')
  async setDialogFlag(name: StrategyFlag, checked: boolean): Promise<void> {
    const cb = this.addDialog().getByRole('checkbox', { name });
    if (checked) await cb.check();
    else await cb.uncheck();
  }

  @step('Click dialog add')
  async clickDialogAdd(): Promise<void> {
    await this.addDialog().getByRole('button', { name: 'Add', exact: true }).click();
    await this.addDialog().waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => { /* dialog animates out */ });
    await this.waitForAngularStable();
  }

  @step('Click dialog add expecting rejection')
  async clickDialogAddExpectingRejection(): Promise<void> {
    await this.addDialog().getByRole('button', { name: 'Add', exact: true }).click();
    await this.waitForAngularStable();
  }

  @step('Get dialog error')
  async getDialogError(): Promise<string> {
    const err = this.addDialog().getByText(/already exists|required|invalid/i).first();
    return (await err.count()) > 0 ? (await err.innerText()).trim() : '';
  }

  @step('Close add dialog')
  async closeAddDialog(): Promise<void> {
    const dlg = this.addDialog();
    if (await dlg.isVisible().catch(() => false)) {
      await dlg.getByRole('button', { name: 'Close', exact: true }).click();
      await dlg.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => { /* ignore */ });
    }
  }

  @step('Add strategy with flags')
  async addStrategyWithFlags(name: string, flags: Partial<Record<StrategyFlag, boolean>>): Promise<void> {
    await this.openAddStrategyDialog();
    for (const key of Object.keys(flags) as StrategyFlag[]) {
      await this.setDialogFlag(key, flags[key] as boolean);
    }
    await this.fillDialogName(name);
    await this.clickDialogAdd();
  }

  @step('Set editor flag')
  async setEditorFlag(name: StrategyFlag, checked: boolean): Promise<void> {
    const cb = this.page.getByRole('checkbox', { name });
    if (checked) await cb.check();
    else await cb.uncheck();
  }

  @step('Has strategy')
  async hasStrategy(name: string): Promise<boolean> {
    return (await this.page.getByRole('complementary').getByRole('button', { name }).count()) > 0;
  }

  @step('Search strategies')
  async searchStrategies(text: string): Promise<void> {
    await this.page.locator(S.txtSearchStrategies).first().fill(text);
    await this.waitForAngularStable();
  }

  @step('Click back breadcrumb')
  async clickBackBreadcrumb(): Promise<void> {
    await this.page.locator(S.lnkBackToSearch).first().click();
  }

  @step('Is unsaved changes prompt visible')
  async isUnsavedChangesPromptVisible(): Promise<boolean> {
    return this.page.getByRole('alertdialog', { name: /unsaved changes/i }).isVisible().catch(() => false);
  }

  @step('Resolve unsaved changes prompt')
  async resolveUnsavedChangesPrompt(choice: 'Stay' | 'Discard'): Promise<void> {
    await this.page.getByRole('alertdialog').getByRole('button', { name: choice, exact: true }).click().catch(() => { /* best-effort: the prompt may have auto-resolved before this click; the stability wait below is the real settle */ });
    await this.waitForAngularStable();
  }

  /**
   * Restore the fixture to its baseline: exactly 1 strategy named `defaults.name`. Bounded retry
   * (max 3) over the WHOLE cycle (reload → re-read → rename → save → reload → re-verify) because
   * Angular dirty + the persisted DOM are the only reliable signals (save-success alone doesn't
   * prove the restore landed).
   *
   * If MORE than one strategy is present, a prior test persisted a NEW strategy — which is NOT
   * UI-removable (legacy strategies have no Remove). That is unrecoverable fixture drift → THROW
   * loudly rather than silently continue (the spec is designed to never persist a new strategy).
   *
   * The flag checkboxes (Is Active / Is Productions / Is Internal / Is GSO) are deliberately NOT
   * restored here, and that is sufficient: no test ever commits an un-reverted flag change on the
   * fixture strategy — flag toggles are net-zero (reverted within the same test) and flag-carrying
   * strategies are only ever added in memory (never saved, so they vanish on the next reload). An
   * uncommitted toggle is discarded by this method's reload; a committed extra strategy is caught by
   * the count guard above. The name is therefore the only persisted-mutable field, so restoring it
   * fully restores the baseline.
   */
  @step('Ensure default state')
  async ensureDefaultState(defaults: { name: string } = { name: STRATEGY.fixtureStrategyName }): Promise<void> {
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await this.open();
      const total = await this.getStrategyTotal();
      if (total > 1) {
        throw new Error(
          `ensureDefaultState: ${total} strategies present (expected 1) — a test persisted an extra ` +
          'strategy that cannot be removed via the UI (legacy strategies have no Remove). Fixture ' +
          'drift; manual cleanup of pricebook 2022-NP Tier 1 required.',
        );
      }
      await this.selectFirstStrategy();
      if ((await this.getStrategyName()) === defaults.name) return; // already clean
      await this.setStrategyName(defaults.name);
      await this.saveAndConfirm();
      await this.open();
      await this.selectFirstStrategy();
      if ((await this.getStrategyName()) === defaults.name) return;
    }
    throw new Error(
      `ensureDefaultState: strategy name not restored to "${defaults.name}" after ${maxAttempts} attempts`,
    );
  }
}
