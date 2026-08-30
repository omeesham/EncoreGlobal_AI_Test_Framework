// New Pricebook create flow (NM-1440), both `?type=equipment|labor` routes.
// MUTATION SAFETY: a committed pricebook is irreversible (no UI delete), so the default path is no-commit.
import { type Locator, type Page } from '@playwright/test';
import { CorporatePricingBasePage } from './corporate-pricing.page';
import type { IConfig } from '../../types';
import { CorporatePricingSelectors as S } from '../../selectors/corporate-pricing';
import { NEW_PRICEBOOK } from '../../data/corporate-pricing/new-pricebook';
import { step } from '../../fixtures/step-decorator';

export type PricebookType = 'equipment' | 'labor';
export type StrategyFlag = 'Is GSO' | 'Is Active' | 'Is Internal' | 'Is Productions';

export class CorporatePricingNewPricebookPage extends CorporatePricingBasePage {
  constructor(page: Page, config?: IConfig) {
    super(page, config);
  }

  @step('Open the new pricebook page')
  async open(type: PricebookType = 'equipment', office: string = NEW_PRICEBOOK.office): Promise<void> {
    await this.gotoNewPricebook(office, type);
    await this.page.locator(S.npName).first().waitFor({ state: 'visible', timeout: 25_000 });
  }

  @step('Get heading')
  async getHeading(): Promise<string> {
    return (await this.page.locator(S.npHeading).first().innerText()).trim();
  }

  @step('Set name')
  async setName(value: string): Promise<void> {
    await this.setReactInput(S.npName, value);
  }

  @step('Get name')
  async getName(): Promise<string> {
    return this.page.locator(S.npName).first().inputValue();
  }

  @step('Set year')
  async setYear(value: string): Promise<void> {
    await this.setReactInput(S.npYear, value);
  }

  @step('Get year')
  async getYear(): Promise<string> {
    return this.page.locator(S.npYear).first().inputValue();
  }

  private typeCombo(): Locator {
    return this.page.locator(S.npCombobox).nth(0);
  }

  private currencyCombo(): Locator {
    return this.page.locator(S.npCombobox).nth(1);
  }

  @step('Get type value')
  async getTypeValue(): Promise<string> {
    return (await this.typeCombo().innerText()).replace(/\s+/g, ' ').trim();
  }

  @step('Is type disabled')
  async isTypeDisabled(): Promise<boolean> {
    return this.typeCombo().isDisabled().catch(() => false);
  }

  @step('Get currency value')
  async getCurrencyValue(): Promise<string> {
    return (await this.currencyCombo().innerText()).replace(/\s+/g, ' ').trim();
  }

  @step('Get currency options')
  async getCurrencyOptions(): Promise<string[]> {
    await this.currencyCombo().click();
    await this.page.locator(S.npOption).first().waitFor({ state: 'visible', timeout: 8_000 });
    const out = (await this.page.locator(S.npOption).allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
    await this.page.keyboard.press('Escape');
    return out.filter(Boolean);
  }

  @step('Get tabs')
  async getTabs(): Promise<string[]> {
    const tabs: string[] = [];
    if ((await this.page.locator(S.tabPricingStrategy).count()) > 0) tabs.push('Pricing Strategy');
    if ((await this.page.locator(S.tabPricingDetail).count()) > 0) tabs.push('Pricing Detail');
    return tabs;
  }

  @step('Click detail tab')
  async clickDetailTab(): Promise<void> {
    await this.switchTab('Pricing Detail');
  }

  @step('Get strategy total')
  async getStrategyTotal(): Promise<number> {
    const txt = await this.page.locator(S.npStrategyTotal).first().innerText().catch(() => '');
    const m = txt.match(/Total:\s*(\d+)/);
    return m && m[1] ? parseInt(m[1], 10) : -1;
  }

  @step('Has no strategies yet')
  async hasNoStrategiesYet(): Promise<boolean> {
    return this.isVisibleSafe(S.npNoStrategies);
  }

  @step('Open add strategy dialog')
  async openAddStrategyDialog(): Promise<void> {
    await this.page.getByRole('button', { name: 'New Pricing Strategy' }).first().click();
    await this.page.locator(S.npNewStrategyDialog).first().waitFor({ state: 'visible', timeout: 10_000 });
  }

  @step('Is add dialog open')
  async isAddDialogOpen(): Promise<boolean> {
    return this.isVisibleSafe(S.npNewStrategyDialog);
  }

  @step('Get dialog flag')
  async getDialogFlag(name: StrategyFlag): Promise<{ checked: boolean; disabled: boolean }> {
    const dlg = this.page.locator(S.npNewStrategyDialog).first();
    const cb = dlg.getByRole('checkbox', { name });
    return {
      checked: await cb.isChecked().catch(() => false),
      disabled: await cb.isDisabled().catch(() => false),
    };
  }

  @step('Add strategy')
  async addStrategy(name: string = NEW_PRICEBOOK.strategyName): Promise<void> {
    await this.openAddStrategyDialog();
    await this.setReactInput(S.npDlgStrategyName, name);
    await this.page.locator(S.npNewStrategyDialog).first().getByRole('button', { name: 'Add', exact: true }).click();
    await this.page.locator(S.npNewStrategyDialog).first().waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => { /* animates out */ });
  }

  /** Leaves the dialog OPEN — the caller must Cancel/Escape afterward. */
  @step('Get empty name add guard')
  async getEmptyNameAddGuard(): Promise<{ stillOpen: boolean; addDisabled: boolean }> {
    await this.openAddStrategyDialog();
    const addButton = this.page
      .locator(S.npNewStrategyDialog)
      .first()
      .getByRole('button', { name: 'Add', exact: true });
    await addButton.waitFor({ state: 'visible', timeout: 10_000 });
    const addDisabled = await addButton.isDisabled();
    return { stillOpen: await this.isAddDialogOpen(), addDisabled };
  }

  @step('Cancel add dialog')
  async cancelAddDialog(): Promise<void> {
    const dlg = this.page.locator(S.npNewStrategyDialog).first();
    if (await dlg.isVisible().catch(() => false)) {
      await dlg.getByRole('button', { name: 'Cancel', exact: true }).click();
      await dlg.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => { /* ignore */ });
    }
  }

  @step('Remove strategy')
  async removeStrategy(name: string = NEW_PRICEBOOK.strategyName): Promise<void> {
    const item = this.page.getByRole('button', { name }).first();
    await item.getByRole('button').first().click();
    await this.waitForAngularStable();
  }

  @step('Get source group count')
  async getSourceGroupCount(): Promise<number> {
    return this.page.locator(S.npSourceRow).count();
  }

  @step('Get source group sample')
  async getSourceGroupSample(n = 5): Promise<string[]> {
    const out: string[] = [];
    const rows = this.page.locator(S.npSourceRow);
    const count = Math.min(await rows.count(), n);
    for (let i = 0; i < count; i++) out.push((await rows.nth(i).innerText()).replace(/\s+/g, ' ').trim());
    return out;
  }

  @step('Add product group by name')
  async addProductGroupByName(name: string): Promise<void> {
    const row = this.page.locator(S.npSourceRow, { hasText: name }).first();
    await row.waitFor({ state: 'visible', timeout: 10_000 });
    await row.dblclick();
  }

  // Create-mode positive control for the drag primitive shared with the management-mode Detail probe.
  @step('Drag product group by name')
  async dragProductGroupByName(name: string): Promise<void> {
    const row = this.page.locator(S.npSourceRow, { hasText: name }).first();
    await row.waitFor({ state: 'visible', timeout: 10_000 });
    await this.dragSourceToGrid(row, this.page.locator(S.npDetailGrid).first());
  }

  @step('Get detail grid rows')
  async getDetailGridRows(): Promise<string[]> {
    const rows = this.page.locator(S.npDetailGrid).first().locator('tbody tr');
    const out: string[] = [];
    const n = await rows.count();
    for (let i = 0; i < n; i++) out.push((await rows.nth(i).innerText()).replace(/\s+/g, ' ').trim());
    return out.filter(Boolean);
  }

  // Does NOT confirm — the caller MUST follow with `cancelSaveDialog()` to avoid an irreversible commit.
  @step('Click save expect dialog')
  async clickSaveExpectDialog(): Promise<string> {
    await this.clickSaveButtonOrThrow('New Pricebook not savable');
    const dlg = this.page.locator(S.npSaveDialog).first();
    await dlg.waitFor({ state: 'visible', timeout: 10_000 });
    return (await dlg.innerText()).replace(/\s+/g, ' ').trim();
  }

  @step('Cancel save dialog')
  async cancelSaveDialog(): Promise<void> {
    const dlg = this.page.locator(S.npSaveDialog).first();
    if (await dlg.isVisible().catch(() => false)) {
      await dlg.getByRole('button', { name: 'Cancel', exact: true }).click();
      await dlg.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => { /* ignore */ });
    }
  }

  @step('Fill minimal savable')
  async fillMinimalSavable(
    name: string = NEW_PRICEBOOK.validName,
    year: string = NEW_PRICEBOOK.validYear,
  ): Promise<void> {
    await this.setName(name);
    await this.setYear(year);
    await this.addStrategy();
  }

  // Leaves Save enabled and the form UNCOMMITTED; the caller commits via `confirmSaveAndGetNewId()`.
  // The product group is added by double-click — drag adds too, but double-click is the reliable one.
  @step('Fill savable with product group')
  async fillSavableWithProductGroup(
    name: string,
    year: string = NEW_PRICEBOOK.validYear,
    group: string = NEW_PRICEBOOK.equipmentGroupA,
  ): Promise<void> {
    await this.setName(name);
    await this.setYear(year);
    await this.addStrategy();
    await this.clickDetailTab();
    await this.addProductGroupByName(group);
  }

  // IRREVERSIBLE commit — no UI delete/deactivate exists, so only the single persistence test calls this.
  // Returns the new pricebook's guid, parsed from the post-commit `/details/<guid>` redirect.
  @step('Confirm save and get new')
  async confirmSaveAndGetNewId(): Promise<string> {
    const detailsRe = /\/details\/[0-9a-f-]+/i;
    // Under load the dialog can dismiss without committing (no redirect), so retry the whole
    // Save → confirm. Waits on 'commit' — only the URL is needed, not the heavy Details page load.
    for (let attempt = 0; attempt < 3; attempt++) {
      await this.clickSaveButtonOrThrow('New Pricebook not savable');
      const dlg = this.page.locator(S.npSaveDialog).first();
      await dlg.waitFor({ state: 'visible', timeout: 10_000 });
      await dlg.getByRole('button', { name: /^(save|ok|yes)$/i }).first().click();
      try {
        await this.page.waitForURL(detailsRe, { timeout: 20_000, waitUntil: 'commit' });
        break; // committed — redirected to /details
      } catch {
        if (detailsRe.test(this.page.url())) break; // committed just after the wait window
        if (attempt === 2) {
          throw new Error(`confirmSaveAndGetNewId: save did not redirect to /details after 3 attempts (${this.page.url()})`);
        }
        // Dialog dismissed without committing — loop and click the page Save again.
      }
    }
    const m = this.page.url().match(/\/details\/([0-9a-f-]+)/i);
    if (!m || !m[1]) throw new Error(`confirmSaveAndGetNewId: no /details/<guid> in URL after save (${this.page.url()})`);
    await this.waitForAngularStable();
    return m[1];
  }

  // The saved-pricebook Detail grid renders tens of seconds after navigation and
  // `waitForAngularStable` is a no-op on this React page, hence the explicit first-row wait.
  @step('Read saved detail groups')
  async readSavedDetailGroups(office: string, pricebookId: string): Promise<string[]> {
    await this.gotoDetails(office, pricebookId);
    await this.clickDetailTab();
    await this.page.locator(`${S.npDetailGrid} tbody tr`).first().waitFor({ state: 'visible', timeout: 60_000 });
    return this.getDetailGridRows();
  }

  // NM-2057: the caller compares the empty-year vs valid-year reads to prove the required
  // state is visibly indicated — neither value means anything on its own.
  @step('Get year validation state')
  async getYearValidationState(): Promise<{ ariaInvalid: string | null; borderColor: string }> {
    const year = this.page.locator(S.npYear).first();
    const ariaInvalid = await year.getAttribute('aria-invalid');
    const borderColor = await year.evaluate((el) => getComputedStyle(el as HTMLElement).borderColor);
    return { ariaInvalid, borderColor };
  }

  // NM-2022: documents that the create page does NOT block a duplicate pricebook name client-side.
  @step('Set name and read uniqueness')
  async setNameAndReadUniqueness(name: string): Promise<{ ariaInvalid: string | null; hasInlineUniquenessError: boolean }> {
    await this.setName(name);
    await this.page.locator(S.npName).first().evaluate((el) => el.dispatchEvent(new Event('blur', { bubbles: true })));
    await this.page.waitForTimeout(800); // let any async uniqueness check settle before reading
    const ariaInvalid = await this.page.locator(S.npName).first().getAttribute('aria-invalid');
    const hasInlineUniquenessError = await this.page.evaluate(() => {
      const re = /already exists|already taken|must be unique|duplicate/i;
      return Array.from(document.querySelectorAll('p,span,small,[role="alert"],[aria-live]')).some(
        (e) => re.test((e.textContent || '').trim()),
      );
    });
    return { ariaInvalid, hasInlineUniquenessError };
  }

  // The hint spans two text nodes, so this returns the tightest element containing both.
  @step('Get detail empty state hint')
  async getDetailEmptyStateHint(): Promise<string> {
    return this.page.evaluate(() => {
      const both = Array.from(document.querySelectorAll('*')).filter(
        (e) => /No items added yet/i.test(e.textContent || '') && /Double-click or drag/i.test(e.textContent || ''),
      );
      const tightest = both.sort((a, b) => (a.textContent || '').length - (b.textContent || '').length)[0];
      return (tightest?.textContent || '').replace(/\s+/g, ' ').trim();
    });
  }

  @step('Filter source groups')
  async filterSourceGroups(query: string): Promise<void> {
    await this.setReactInput(S.npSearchProductGroups, query);
    await this.waitForAngularStable();
  }

  @step('Clear source filter')
  async clearSourceFilter(): Promise<void> {
    await this.setReactInput(S.npSearchProductGroups, '');
    await this.waitForAngularStable();
  }

  @step('Click strategy tab')
  async clickStrategyTab(): Promise<void> {
    await this.switchTab('Pricing Strategy');
  }
}
