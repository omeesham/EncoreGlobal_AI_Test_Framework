import { Locator, expect } from '@playwright/test';
import { step } from '../../fixtures/step-decorator';
import { ItemSearchGridBasePage } from './item-search-grid.page';
import { itemSearchProductGroups as S } from '../../selectors/item-search/product-groups';
import { ISR_OFFICE, ISR_PGR_ROUTE } from '../../data/item-search/item-search';

/**
 * Product Groups page — search panel, 4-column grid at a 20-row page size, and the
 * Add Product Group PAGE (a route, not a dialog).
 *
 * Shares the Products page's storage persistence: an EXECUTED search is restored on
 * return; typed-but-unsearched text is dropped. An empty-criteria search returns ZERO
 * groups here (unlike the Products page's return-all) — asserted as live behavior.
 * Nothing here ever clicks Save; the Add page is exercised read/field-level only.
 */
export class ProductGroupsPage extends ItemSearchGridBasePage {
  /** The count label this grid renders after any Search or Reset. */
  protected static readonly COUNT_PATTERN = /([\d,]+)\s+product groups?\s+found/;

  // ---------------------------------------------------------------- navigation & readiness

  /** Navigates to the Product Groups page and waits for hydration. */
  @step('Open the Product Groups page')
  async open(office: string = ISR_OFFICE): Promise<void> {
    const baseUrl = (this.config?.base_url ?? '').replace(/\/+$/, '');
    await this.safeNavigateTo(`${baseUrl}${ISR_PGR_ROUTE(office)}`, {
      waitUntil: 'domcontentloaded',
      timeout: 120_000,
    });
    await this.waitForReady();
  }

  /** Hydration gate: skeletons gone AND the group search box present. */
  @step('Wait for the group search panel to be ready')
  async waitForReady(): Promise<void> {
    await this.waitForNoSkeletons();
    await expect(this.searchBox()).toBeVisible({ timeout: 30_000 });
  }

  /**
   * Per-test baseline: page open, hydrated, and reset — the box empty and the count at
   * zero. Reset is the reliable route because executed searches are restored on return.
   */
  @step('Reset the group search')
  async ensureCleanSearch(office: string = ISR_OFFICE): Promise<void> {
    // Path-end compare: the Add page's address CONTAINS this page's path, so a substring
    // check would mistake a stranded Add page for the list and hang on its search box.
    const onPage = new URL(this.page.url()).pathname.endsWith(ISR_PGR_ROUTE(office));
    if (!onPage) {
      await this.open(office);
    } else {
      await this.waitForReady();
    }
    await this.clickReset();
  }

  // ---------------------------------------------------------------- search panel

  searchBox(): Locator {
    return this.page.getByPlaceholder(S.PLACEHOLDER_SEARCH);
  }

  /** Types a word into the group search box. */
  @step('Type a word into the group search box')
  async typeSearch(word: string): Promise<void> {
    await this.typeByKeys(this.searchBox(), word);
  }

  /** The group search box's current value. */
  @step('Read the group search box')
  async readSearch(): Promise<string> {
    return this.searchBox().inputValue();
  }

  /** Whether the Active filter checkbox is checked. */
  @step('Read the Active filter state')
  async isActiveChecked(): Promise<boolean> {
    const el = this.page.locator(S.chkActive).first();
    const aria = await el.getAttribute('aria-checked');
    if (aria !== null) return aria === 'true';
    return (await el.getAttribute('data-state')) === 'checked';
  }

  /** Clicks Search and waits for the count label to satisfy the predicate. */
  @step('Run the group search')
  async clickSearchAndWait(predicate: (n: number | null) => boolean = (n) => n !== null): Promise<number | null> {
    await this.page.getByRole('button', { name: S.TEXT_SEARCH, exact: true }).click();
    await this.waitForNoSkeletons();
    return this.waitForCount(ProductGroupsPage.COUNT_PATTERN, predicate);
  }

  /** Clicks Reset and waits for the settled zero state. */
  @step('Reset the group search criteria')
  async clickReset(): Promise<void> {
    await this.page.getByRole('button', { name: S.TEXT_RESET, exact: true }).click();
    await this.waitForCount(ProductGroupsPage.COUNT_PATTERN, (n) => n === 0);
    await expect(this.page.locator('tbody tr')).toHaveCount(0, { timeout: 15_000 });
  }

  /** The number in the "N product groups found" label, or null while none is rendered. */
  @step('Read the groups count')
  async readFoundCount(): Promise<number | null> {
    return this.readCountByPattern(ProductGroupsPage.COUNT_PATTERN);
  }

  // ---------------------------------------------------------------- add page

  /** Clicks Add and waits for the Add Product Group page to render its form. */
  @step('Open the Add Product Group page')
  async clickAdd(): Promise<void> {
    await this.page.getByRole('button', { name: S.TEXT_ADD, exact: true }).click();
    await expect(this.addNameBox()).toBeVisible({ timeout: 30_000 });
    await this.waitForNoSkeletons();
  }

  addNameBox(): Locator {
    return this.page.getByPlaceholder(S.PLACEHOLDER_ADD_NAME);
  }

  addDescriptionBox(): Locator {
    return this.page.getByPlaceholder(S.PLACEHOLDER_ADD_DESC);
  }

  addSaveButton(): Locator {
    return this.page.getByRole('button', { name: S.TEXT_SAVE, exact: true });
  }

  addCancelButton(): Locator {
    return this.page.getByRole('button', { name: S.TEXT_CANCEL, exact: true });
  }

  /** Types into the Add page's Name box. */
  @step('Type into the group Name box')
  async typeAddName(value: string): Promise<void> {
    await this.typeByKeys(this.addNameBox(), value);
  }

  /**
   * Whether the Add page's Active checkbox is checked. The sub-class picker's rows carry
   * their own checkboxes and render before the form, so the form's Active is the LAST
   * checkbox on the page (structure read live).
   */
  @step('Read the Add page Active state')
  async isAddActiveChecked(): Promise<boolean> {
    const el = this.page.getByRole('checkbox').last();
    const aria = await el.getAttribute('aria-checked');
    if (aria !== null) return aria === 'true';
    return (await el.getAttribute('data-state')) === 'checked';
  }

  /** Whether the Add page's Save is enabled. */
  @step('Read the Add page Save state')
  async isAddSaveEnabled(): Promise<boolean> {
    return this.addSaveButton().isEnabled().catch(() => false);
  }

  /** Clicks Cancel on the Add page and waits for the list page to return. */
  @step('Cancel out of the Add page')
  async clickAddCancel(): Promise<void> {
    await this.addCancelButton().click();
    await this.waitForReady();
  }

  /** Full text of the Add page's form area, read in one call for structure assertions. */
  @step('Read the Add page form')
  async readAddPageText(): Promise<string> {
    return this.page.evaluate(() => document.body.innerText);
  }

  // ---------------------------------------------------------------- add-page save flow

  /** Types into the Add page's Description box. */
  @step('Type into the group Description box')
  async typeAddDescription(value: string): Promise<void> {
    await this.typeByKeys(this.addDescriptionBox(), value);
  }

  /** The required Service Type selector (labelled with its placeholder until chosen). */
  private serviceTypeCombo(): Locator {
    return this.page.locator('button[role="combobox"]').filter({ hasText: S.TEXT_SERVICE_TYPE }).first();
  }

  /** Opens the Service Type list and chooses a service. */
  @step('Choose a Service Type')
  async selectServiceType(name: string): Promise<void> {
    await this.serviceTypeCombo().click();
    const listbox = this.page.locator('[role="listbox"]');
    await listbox.waitFor({ state: 'visible', timeout: 5_000 });
    await this.page.getByRole('option', { name, exact: true }).click();
    await listbox.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
    await this.waitForAngularStable(5_000).catch(() => {});
  }

  /**
   * Adds the first available sub-class to the group and returns its label. Double-click
   * moves the item into the group's Sub Classes — the reliable path the picker offers;
   * drag is flaky and frequently never fires the drop.
   */
  @step('Add the first available sub-class')
  async addFirstSubClass(): Promise<string> {
    const first = this.page.locator(S.subClassItem).first();
    await first.waitFor({ state: 'visible', timeout: 10_000 });
    const label = ((await first.textContent()) ?? '').trim();
    await first.dblclick();
    await this.waitForAngularStable(5_000).catch(() => {});
    return label;
  }

  /**
   * Saves the completed Add page and confirms the create landed: Save must be enabled, the
   * create request must return success, the confirmation toast must appear, and the page
   * must return to the group list. The create response is never treated as proof on its own —
   * persistence is proven by the caller searching the new group's name back.
   */
  @step('Save the new group and confirm it was created')
  async saveNewGroupAndConfirm(): Promise<void> {
    const save = this.addSaveButton();
    await expect(save, 'Save should be enabled once the required fields are set')
      .toBeEnabled({ timeout: 10_000 });
    const created = this.page.waitForResponse(
      (r) => r.url().includes(S.CREATE_ENDPOINT) && r.request().method() === 'POST',
      { timeout: 30_000 },
    );
    // Set the toast watch before clicking so it is caught even as the redirect starts.
    const toastShown = this.page.locator(S.TOAST).filter({ hasText: S.TOAST_GROUP_CREATED })
      .waitFor({ state: 'visible', timeout: 20_000 });
    await save.click();
    const res = await created;
    expect(res.status(), 'the create request should return 200').toBe(200);
    expect(((await res.json()) as { success?: boolean })?.success, 'the create response should report success').toBe(true);
    await toastShown;
    // Success redirects back to the group list.
    await this.waitForReady();
  }
}
