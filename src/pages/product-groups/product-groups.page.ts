import { Locator, expect } from '@playwright/test';
import { step } from '../../fixtures/step-decorator';
import { ProductsGridBasePage } from '../products/products-grid.page';
import { itemSearchProductGroups as S } from '../../selectors/product-groups/product-groups';
import { ISR_OFFICE } from '../../data/products/products';
import {
  PGR_ROUTE,
  PGR_DEFAULT_PAGE_SIZE,
  PGR_DEFAULT_COLUMN_ORDER,
  PGR_COLUMN_FIELDS,
  PGR_STORAGE_KEYS,
  PgrStoredSearch,
  PgrStoredGridLayout,
} from '../../data/product-groups/product-groups';

/** What a column header draws as its sort marker. */
export type PgrSortMarker = 'ascending' | 'descending' | 'neutral' | 'none';

/** What the Edit page shows the moment a result row opens it. */
export interface PgrEditLanding {
  heading: string;
  name: string;
  description: string;
  activeChecked: boolean;
  priceBadge: string;
  saveEnabled: boolean;
  cancelEnabled: boolean;
  breadcrumbs: string[];
  hasTranslationsButton: boolean;
}

/**
 * Product Groups page — search panel, 4-column grid at a 20-row page size, and the
 * Add Product Group PAGE (a route, not a dialog).
 *
 * Shares the Products page's storage persistence: an EXECUTED search is restored on
 * return; typed-but-unsearched text is dropped. An empty-criteria search returns ZERO
 * groups here (unlike the Products page's return-all) — asserted as live behavior.
 * Serves both Product Groups sub-tasks: the list/search page (NM-2258) and the Add page
 * reached from its Add button (NM-2259), which is driven through a real save.
 */
export class ProductGroupsPage extends ProductsGridBasePage {
  /** The count label this grid renders after any Search or Reset. */
  protected static readonly COUNT_PATTERN = /([\d,]+)\s+product groups?\s+found/;

  // ---------------------------------------------------------------- navigation & readiness

  /** Navigates to the Product Groups page and waits for hydration. */
  @step('Open the Product Groups page')
  async open(office: string = ISR_OFFICE): Promise<void> {
    const baseUrl = (this.config?.base_url ?? '').replace(/\/+$/, '');
    await this.safeNavigateTo(`${baseUrl}${PGR_ROUTE(office)}`, {
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
    const onPage = new URL(this.page.url()).pathname.endsWith(PGR_ROUTE(office));
    if (!onPage) {
      await this.open(office);
    } else {
      await this.waitForReady();
    }
    await this.clickReset();
    // Reset leaves the Active filter as it was, and a case that searched for inactive groups
    // would otherwise hand the next case a filter that hides the groups it creates.
    await this.setActiveFilter(true);
  }

  /** Sets the list's Active filter — checked shows active groups only, cleared shows inactive only. */
  @step('Set the Active filter')
  async setActiveFilter(checked: boolean): Promise<void> {
    if ((await this.isActiveChecked()) !== checked) {
      await this.page.locator(S.chkActive).first().click();
    }
    await expect.poll(() => this.isActiveChecked(), { timeout: 5_000 }).toBe(checked);
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

  /**
   * The required Service Type selector. Anchored on the control itself rather than on its
   * placeholder text, which disappears the moment a value is chosen.
   */
  private serviceTypeCombo(): Locator {
    return this.page.locator(S.addServiceTypeCombo);
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
    // Every observed save lands on the group list. (The NM-2043 discussion in Jira describes
    // a details-page landing instead; the test plan carries that open question.) If the app
    // changes where it lands, this is the step that should fail.
    await expect(this.page, 'a successful save should land on the group list')
      .toHaveURL(/\/products\/product-groups\/?$/, { timeout: 30_000 });
    await this.waitForReady();
  }

  /**
   * Clicks Save on a form the server is expected to reject and returns the text of the
   * toast THAT click raised. Rejection toasts outlive the page they were raised on — an
   * earlier attempt's message can still be on screen — and they disappear on their own after
   * about ten seconds, so neither "a matching toast exists" nor "one more toast than before"
   * is a safe read: the first is satisfied by a leftover, the second fails when a leftover
   * expires during the wait. The method therefore watches the page for toasts added after
   * the watch is armed and returns the text of the first one, whatever was already on screen
   * and however long it lives. The form must still be open afterwards — the app keeps every
   * value so the user can correct it; if it closed instead, the save went through and the
   * error names the toast the page showed.
   */
  @step('Save and read the server rejection')
  async saveExpectingRejection(): Promise<string> {
    await this.armToastWatch();
    await this.addSaveButton().click();
    const toast = await this.page
      .waitForFunction(
        () => {
          const w = window as unknown as { __toastWatch?: { added: HTMLElement[] } };
          const first = w.__toastWatch?.added.find((el) => el.innerText.trim().length > 0);
          return first ? first.innerText : null;
        },
        undefined,
        { timeout: 20_000 },
      )
      .catch((error: Error) => {
        throw new Error(`No toast appeared within 20 s of clicking Save on ${this.page.url()} — ${error.message}`);
      });
    const text = String(await toast.jsonValue()).replace(/\s+/g, ' ').trim();
    await this.disarmToastWatch();
    if (!(await this.addNameBox().isVisible())) {
      throw new Error(`The save was not rejected — the form closed and the page showed "${text}" (now at ${this.page.url()})`);
    }
    return text;
  }

  /**
   * Watches the page for toasts added from now on. Armed before an action so that a toast
   * already on screen can never be mistaken for the one the action raises.
   */
  private async armToastWatch(): Promise<void> {
    await this.page.evaluate((toastSelector) => {
      const w = window as unknown as { __toastWatch?: { added: HTMLElement[]; observer: MutationObserver } };
      w.__toastWatch?.observer.disconnect();
      const watch = {
        added: [] as HTMLElement[],
        observer: new MutationObserver((records) => {
          for (const record of records) {
            for (const node of Array.from(record.addedNodes)) {
              if (!(node instanceof HTMLElement)) continue;
              const toasts = node.matches(toastSelector) ? [node] : Array.from(node.querySelectorAll<HTMLElement>(toastSelector));
              for (const t of toasts) if (!watch.added.includes(t)) watch.added.push(t);
            }
          }
        }),
      };
      watch.observer.observe(document.body, { childList: true, subtree: true });
      w.__toastWatch = watch;
    }, S.TOAST);
  }

  /** Stops the toast watch. */
  private async disarmToastWatch(): Promise<void> {
    await this.page.evaluate(() => {
      const w = window as unknown as { __toastWatch?: { observer: MutationObserver } };
      w.__toastWatch?.observer.disconnect();
    });
  }

  // ---------------------------------------------------------------- add-page text boxes

  /** The Name box's current value. */
  @step('Read the group Name box')
  async readAddName(): Promise<string> {
    return this.addNameBox().inputValue();
  }

  /** The Description box's current value. */
  @step('Read the group Description box')
  async readAddDescription(): Promise<string> {
    return this.addDescriptionBox().inputValue();
  }

  /** Whether the Name box is marked invalid — the required-empty state (red border, icon). */
  @step('Read whether the Name box is marked invalid')
  async isAddNameInvalid(): Promise<boolean> {
    return (await this.addNameBox().getAttribute('aria-invalid')) === 'true';
  }

  /** Replaces the Name box's content in one paste-like action; the box's own cap still applies. */
  @step('Paste into the group Name box')
  async pasteAddName(value: string): Promise<void> {
    await this.addNameBox().fill(value);
  }

  /** Replaces the Description box's content in one paste-like action. */
  @step('Paste into the group Description box')
  async pasteAddDescription(value: string): Promise<void> {
    await this.addDescriptionBox().fill(value);
  }

  /** Types at the end of whatever the Name box already holds, without clearing it. */
  @step('Type more into the group Name box')
  async appendToAddName(value: string): Promise<void> {
    await this.typeAtEnd(this.addNameBox(), value);
  }

  /** Types at the end of whatever the Description box already holds, without clearing it. */
  @step('Type more into the group Description box')
  async appendToAddDescription(value: string): Promise<void> {
    await this.typeAtEnd(this.addDescriptionBox(), value);
  }

  /** Keystrokes appended after the current content — the cap cases need the box kept full. */
  private async typeAtEnd(box: Locator, value: string): Promise<void> {
    await box.click();
    await box.press('End');
    await box.pressSequentially(value, { delay: 40 });
  }

  /** Clears the Name box the way a user selecting everything and pressing Delete does. */
  @step('Clear the Name box with select-all and Delete')
  async clearAddNameAtOnce(): Promise<void> {
    const box = this.addNameBox();
    await box.click();
    await box.press('Control+a');
    await box.press('Delete');
  }

  /** Clears the Name box one Backspace per character. */
  @step('Clear the Name box character by character')
  async clearAddNameByBackspace(): Promise<void> {
    const box = this.addNameBox();
    await box.click();
    await box.press('End');
    const length = (await box.inputValue()).length;
    for (let i = 0; i < length; i++) {
      await box.press('Backspace');
    }
  }

  /**
   * Presses Tab from one of the text boxes and reports whether focus actually left it — a
   * box that rejects input must still let the cursor out.
   */
  @step('Tab out of a text box')
  async tabOutOfBox(which: 'name' | 'description'): Promise<boolean> {
    const box = which === 'name' ? this.addNameBox() : this.addDescriptionBox();
    const fieldName = which === 'name' ? 'productGroupName' : 'productGroupDescription';
    await box.press('Tab');
    return this.page.evaluate(
      (name) => document.activeElement?.getAttribute('name') !== name,
      fieldName,
    );
  }

  /** Sets the Add page's Active checkbox. */
  @step('Set the Add page Active checkbox')
  async setAddActive(checked: boolean): Promise<void> {
    if ((await this.isAddActiveChecked()) !== checked) {
      await this.page.locator(S.chkAddActive).click();
    }
    await expect.poll(() => this.isAddActiveChecked(), { timeout: 5_000 }).toBe(checked);
  }

  // ---------------------------------------------------------------- service type list

  /** The chosen Service Type, or the placeholder text while none is chosen. */
  @step('Read the chosen Service Type')
  async readServiceType(): Promise<string> {
    return (await this.page.locator(S.addServiceTypeCombo).innerText()).trim();
  }

  /**
   * Opens the Service Type list, reads every option in order and whether the list carries
   * a search box of its own, then closes it without choosing.
   */
  @step('Read the Service Type options')
  async readServiceTypeOptions(): Promise<{ options: string[]; hasSearchBox: boolean }> {
    await this.page.locator(S.addServiceTypeCombo).click();
    const listbox = this.page.locator('[role="listbox"]');
    await listbox.waitFor({ state: 'visible', timeout: 5_000 });
    const options = (await listbox.getByRole('option').allInnerTexts()).map((t) => t.trim());
    const hasSearchBox = (await listbox.locator('input').count()) > 0;
    await this.page.keyboard.press('Escape');
    await listbox.waitFor({ state: 'hidden', timeout: 5_000 });
    return { options, hasSearchBox };
  }

  /** Opens the Service Type list, jumps to its last entry with End and confirms it with Enter. */
  @step('Choose the last Service Type from the keyboard')
  async selectLastServiceTypeByKeyboard(): Promise<void> {
    await this.page.locator(S.addServiceTypeCombo).click();
    const listbox = this.page.locator('[role="listbox"]');
    await listbox.waitFor({ state: 'visible', timeout: 5_000 });
    await this.page.keyboard.press('End');
    await this.page.keyboard.press('Enter');
    await listbox.waitFor({ state: 'hidden', timeout: 5_000 });
  }

  // ---------------------------------------------------------------- sub-class picker

  pickerSearchBox(): Locator {
    return this.page.getByPlaceholder(S.PLACEHOLDER_SUBCLASS_SEARCH, { exact: true });
  }

  /** Replaces the picker's search text; the catalog filters as it changes. */
  @step('Type into the sub-class picker search')
  async typePickerSearch(value: string): Promise<void> {
    await this.pickerSearchBox().fill(value);
  }

  /** The picker's search box's current value. */
  @step('Read the sub-class picker search')
  async readPickerSearch(): Promise<string> {
    return this.pickerSearchBox().inputValue();
  }

  private catalogRows(): Locator {
    return this.page.locator(S.subClassItem);
  }

  /** How many catalog rows the picker currently lists. */
  @step('Read the catalog row count')
  async readCatalogCount(): Promise<number> {
    return this.catalogRows().count();
  }

  /**
   * Waits until the catalog row count is within [min, max] and returns it. The catalog is
   * thousands of rows that render after the form, and it re-filters as the picker's
   * controls change, so every count-based read goes through this wait.
   */
  @step('Wait for the catalog row count')
  async waitForCatalogCount(min: number, max: number = min, timeout = 30_000): Promise<number> {
    await this.page.waitForFunction(
      ({ selector, low, high }) => {
        const n = document.querySelectorAll(selector).length;
        return n >= low && n <= high;
      },
      { selector: S.subClassItem, low: min, high: max },
      { timeout },
    );
    return this.readCatalogCount();
  }

  /** The first catalog row's text. */
  @step('Read the first catalog row')
  async readCatalogFirst(): Promise<string> {
    return (await this.catalogRows().first().innerText()).trim();
  }

  /** The last catalog row's text. */
  @step('Read the last catalog row')
  async readCatalogLast(): Promise<string> {
    return (await this.catalogRows().last().innerText()).trim();
  }

  /** Every catalog row's text — for filtered sets; the full catalog is thousands of rows. */
  @step('Read the catalog rows')
  async readCatalogTexts(): Promise<string[]> {
    return (await this.catalogRows().allInnerTexts()).map((t) => t.trim());
  }

  private pickerLabor(): Locator {
    return this.page.locator(S.chkPickerLabor);
  }

  /** Whether the picker's Labor filter is checked. */
  @step('Read the Labor filter state')
  async isPickerLaborChecked(): Promise<boolean> {
    return (await this.pickerLabor().getAttribute('data-state')) === 'checked';
  }

  /** Sets the picker's Labor filter. */
  @step('Set the Labor filter')
  async setPickerLabor(checked: boolean): Promise<void> {
    if ((await this.isPickerLaborChecked()) !== checked) {
      await this.pickerLabor().click();
    }
    await expect.poll(() => this.isPickerLaborChecked(), { timeout: 5_000 }).toBe(checked);
  }

  /** The picker's current sort order — Ascending or Descending. */
  @step('Read the picker sort order')
  async readPickerSort(): Promise<string> {
    return (await this.page.locator(S.pickerSortCombo).innerText()).trim();
  }

  /** Chooses the picker's sort order. */
  @step('Choose the picker sort order')
  async selectPickerSort(order: string): Promise<void> {
    await this.page.locator(S.pickerSortCombo).click();
    const listbox = this.page.locator('[role="listbox"]');
    await listbox.waitFor({ state: 'visible', timeout: 5_000 });
    await listbox.getByRole('option', { name: order, exact: true }).click();
    await listbox.waitFor({ state: 'hidden', timeout: 5_000 });
    await expect.poll(() => this.readPickerSort(), { timeout: 5_000 }).toBe(order);
  }

  /** Clicks the picker's own Reset — the Add page has no other Reset. */
  @step('Reset the sub-class picker')
  async clickPickerReset(): Promise<void> {
    await this.page.getByRole('button', { name: S.TEXT_PICKER_RESET, exact: true }).click();
  }

  private addedSubClassRemoveButtons(): Locator {
    return this.page.locator(S.addedSubClassRemove);
  }

  /** The sub-classes currently added to the group, in order. */
  @step('Read the added sub-classes')
  async readAddedSubClasses(): Promise<string[]> {
    const rows = this.addedSubClassRemoveButtons().locator('xpath=..');
    return (await rows.allInnerTexts()).map((t) => t.trim());
  }

  /** Whether the Sub Classes area still shows its "drag or double-click" instruction. */
  @step('Read whether the Sub Classes instruction is shown')
  async isSubClassInstructionShown(): Promise<boolean> {
    return (await this.page.getByText(S.SUBCLASS_INSTRUCTION).count()) > 0;
  }

  /** Adds a catalog item by double-click and returns its label. The catalog keeps the item. */
  @step('Add a catalog item by double-click')
  async addSubClassByDoubleClick(index = 0): Promise<string> {
    const row = this.catalogRows().nth(index);
    await row.waitFor({ state: 'visible', timeout: 10_000 });
    const label = (await row.innerText()).trim();
    await row.dblclick();
    await this.waitForAngularStable(5_000).catch(() => {});
    return label;
  }

  /** Removes an added sub-class through its row's × control. */
  @step('Remove an added sub-class')
  async removeAddedSubClass(index = 0): Promise<void> {
    await this.addedSubClassRemoveButtons().nth(index).click();
    await this.waitForAngularStable(5_000).catch(() => {});
  }

  /**
   * Drags a catalog item onto the Sub Classes area with a real pointer sequence — press,
   * move in steps, release — and returns its label. Playwright's drag helper is not used
   * because it does not reliably fire this picker's drop; the stepped pointer moves do.
   */
  @step('Drag a catalog item onto the Sub Classes area')
  async dragSubClassToGroup(index = 0): Promise<string> {
    const row = this.catalogRows().nth(index);
    await row.waitFor({ state: 'visible', timeout: 10_000 });
    const label = (await row.innerText()).trim();
    const from = await row.boundingBox();
    const to = await this.page.getByText(S.SUBCLASS_INSTRUCTION).boundingBox();
    if (!from || !to) {
      throw new Error('The catalog row or the Sub Classes area has no layout box to drag between');
    }
    const mouse = this.page.mouse;
    await mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await mouse.down();
    await mouse.move(from.x + from.width / 2 + 15, from.y + from.height / 2 + 10, { steps: 6 });
    await mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 30 });
    await mouse.up();
    await this.waitForAngularStable(5_000).catch(() => {});
    return label;
  }

  // ---------------------------------------------------------------- panel toggle

  /** Collapses the sub-class panel through the divider button; the form takes its room. */
  @step('Collapse the sub-class panel')
  async collapsePanel(): Promise<void> {
    await this.page.getByRole('button', { name: S.NAME_COLLAPSE_PANEL, exact: true }).click();
    await expect(this.page.getByRole('button', { name: S.NAME_EXPAND_PANEL, exact: true }))
      .toBeVisible({ timeout: 5_000 });
  }

  /** Expands the sub-class panel again. */
  @step('Expand the sub-class panel')
  async expandPanel(): Promise<void> {
    await this.page.getByRole('button', { name: S.NAME_EXPAND_PANEL, exact: true }).click();
    await expect(this.page.getByRole('button', { name: S.NAME_COLLAPSE_PANEL, exact: true }))
      .toBeVisible({ timeout: 5_000 });
  }

  /**
   * The Name box's left edge and width. The collapsed panel's inputs keep a layout box
   * behind the form, so the form's own geometry is the reliable sign the panel is gone.
   */
  @step('Read the Name box geometry')
  async readAddNameGeometry(): Promise<{ left: number; width: number }> {
    const box = await this.addNameBox().boundingBox();
    if (!box) {
      throw new Error('The Name box has no layout box');
    }
    return { left: Math.round(box.x), width: Math.round(box.width) };
  }

  // ---------------------------------------------------------------- leaving the add page

  /** Goes back in the browser history and waits for the group list to be ready. */
  @step('Go back in the browser history')
  async goBack(): Promise<void> {
    await this.page.goBack({ waitUntil: 'domcontentloaded' });
    await this.waitForReady();
  }

  /** Clicks the "Product Groups" breadcrumb above the Add form and waits for the group list. */
  @step('Click the Product Groups breadcrumb')
  async clickBreadcrumbToGroups(): Promise<void> {
    await this.page.getByRole('link', { name: S.LINK_PRODUCT_GROUPS, exact: true }).click();
    await this.waitForReady();
  }

  // ---------------------------------------------------------------- list page: search box extras

  /** Presses Enter in the group search box and waits for the count label to satisfy the predicate. */
  @step('Run the group search with the Enter key')
  async pressEnterAndWait(predicate: (n: number | null) => boolean = (n) => n !== null): Promise<number | null> {
    await this.searchBox().press('Enter');
    await this.waitForNoSkeletons();
    return this.waitForCount(ProductGroupsPage.COUNT_PATTERN, predicate);
  }

  /** Whether the search box shows its × clear control (it renders only while the box holds text). */
  @step('Read whether the search box shows its clear control')
  async isClearIconShown(): Promise<boolean> {
    return (await this.page.locator(S.searchClearButton).count()) > 0;
  }

  /** Clicks the × inside the search box; only the box empties, the results stay. */
  @step('Clear the search box with its clear control')
  async clickClearIcon(): Promise<void> {
    await this.page.locator(S.searchClearButton).click();
    await expect(this.searchBox()).toHaveValue('', { timeout: 5_000 });
  }

  /** Whether the grid shows its "No results" placeholder. */
  @step('Read whether the grid shows No results')
  async isNoResultsShown(): Promise<boolean> {
    return this.page.getByText(S.TEXT_NO_RESULTS, { exact: true }).isVisible().catch(() => false);
  }

  /**
   * Starts watching for the in-flight search loader and the grid placeholders. Both are gone
   * again within half a second of a search, so a read after the fact would miss them — the
   * watcher records them the moment they appear.
   */
  @step('Watch for the search loader')
  async armSearchLoaderWatch(): Promise<void> {
    await this.page.evaluate(({ loader, skeleton }) => {
      const w = window as unknown as { __searchLoaderWatch?: { loaderSeen: boolean; skeletonSeen: boolean; observer: MutationObserver } };
      w.__searchLoaderWatch?.observer.disconnect();
      const watch = {
        loaderSeen: false,
        skeletonSeen: false,
        observer: new MutationObserver(() => {
          if (document.querySelector(loader)) watch.loaderSeen = true;
          if (document.querySelector(skeleton)) watch.skeletonSeen = true;
        }),
      };
      watch.observer.observe(document.body, { childList: true, subtree: true, attributes: true });
      w.__searchLoaderWatch = watch;
    }, { loader: S.searchLoader, skeleton: S.skeleton });
  }

  /** What the loader watch saw since it was armed, and whether the loader is still on screen. */
  @step('Read the search loader watch')
  async readSearchLoaderWatch(): Promise<{ loaderSeen: boolean; skeletonSeen: boolean; loaderStillShown: boolean }> {
    return this.page.evaluate((loader) => {
      const w = window as unknown as { __searchLoaderWatch?: { loaderSeen: boolean; skeletonSeen: boolean } };
      return {
        loaderSeen: w.__searchLoaderWatch?.loaderSeen ?? false,
        skeletonSeen: w.__searchLoaderWatch?.skeletonSeen ?? false,
        loaderStillShown: document.querySelector(loader) !== null,
      };
    }, S.searchLoader);
  }

  /**
   * Types a word into the group search box without the settle pause the ordinary typing helper
   * adds, so a submit can follow the last keystroke at once.
   */
  @step('Type a word into the search box without pausing')
  async typeSearchWithoutPause(word: string): Promise<void> {
    const box = this.searchBox();
    await box.click();
    await this.page.keyboard.press('Control+a');
    await this.page.keyboard.press('Delete');
    await box.pressSequentially(word, { delay: 40 });
  }

  /**
   * Presses Enter in the search box and waits for whatever that submit does to finish. A submit that
   * starts a search shows the loader and the placeholder rows, and both are waited out; a submit that
   * starts nothing ends after a short grace period. No claim is made about the result, so the caller
   * can assert which term actually ran.
   */
  @step('Submit with Enter and wait for the search to finish')
  async pressEnterAndWaitForSearchToFinish(): Promise<void> {
    await this.armSearchLoaderWatch();
    await this.searchBox().press('Enter');
    // A bounded in-page wait: it resolves as soon as a search starts, or when the grace period runs
    // out and none has — a transition that legitimately may not happen cannot be a hard wait.
    await this.page.evaluate(
      (grace) =>
        new Promise<void>((resolve) => {
          const w = window as unknown as { __searchLoaderWatch?: { loaderSeen: boolean; skeletonSeen: boolean } };
          const startedAt = Date.now();
          const tick = () => {
            const watch = w.__searchLoaderWatch;
            if (watch?.loaderSeen || watch?.skeletonSeen || Date.now() - startedAt > grace) resolve();
            else setTimeout(tick, 50);
          };
          tick();
        }),
      1_500,
    );
    await expect.poll(async () => (await this.readSearchLoaderWatch()).loaderStillShown, { timeout: 30_000 }).toBe(false);
    await this.waitForNoSkeletons();
  }

  /** Forgets the executed search the page keeps in session storage and reloads, so the page starts as a first visit. */
  @step('Reload the page as a first visit')
  async forgetStoredSearch(): Promise<void> {
    await this.page.evaluate((key) => sessionStorage.removeItem(key), PGR_STORAGE_KEYS.search);
    await this.reload();
    expect(await this.readStoredSearchState()).toBeNull();
  }

  // ---------------------------------------------------------------- list page: stored state

  /** The executed search the page keeps in session storage, or null before any search ran. */
  @step('Read the stored search state')
  async readStoredSearchState(): Promise<PgrStoredSearch | null> {
    return this.page.evaluate((key) => {
      const raw = sessionStorage.getItem(key);
      return raw ? (JSON.parse(raw) as { state: PgrStoredSearch }).state : null;
    }, PGR_STORAGE_KEYS.search);
  }

  /** The grid layout (column visibility, order, widths) the page keeps in local storage. */
  @step('Read the stored grid layout')
  async readStoredGridLayout(): Promise<PgrStoredGridLayout> {
    return this.page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) ?? '{}') as PgrStoredGridLayout,
      PGR_STORAGE_KEYS.gridLayout,
    );
  }

  /** Reloads the page by address and waits for it to hydrate again. */
  @step('Reload the Product Groups page')
  async reload(): Promise<void> {
    await this.page.reload({ waitUntil: 'domcontentloaded' });
    await this.waitForReady();
    await this.waitForAngularStable();
  }

  /**
   * Per-test baseline for the grid: the default page size, the default sort and the default
   * column layout. Sorting, page size and layout all outlive a form Reset — they ride the stored
   * search state and the stored layout — so a case that changed any of them would otherwise hand
   * the next case a different grid. Reset to Default View is the only control that clears a sort.
   */
  @step('Restore the default grid view')
  async ensureDefaultGridView(): Promise<void> {
    if ((await this.readRowsPerPage()) !== PGR_DEFAULT_PAGE_SIZE) {
      await this.selectRowsPerPage(PGR_DEFAULT_PAGE_SIZE);
    }
    const layout = await this.readStoredGridLayout();
    const search = await this.readStoredSearchState();
    const allShown = Object.values(layout.columnVisibility ?? {}).every((shown) => shown);
    const defaultOrder = JSON.stringify(layout.columnOrder ?? PGR_DEFAULT_COLUMN_ORDER) === JSON.stringify(PGR_DEFAULT_COLUMN_ORDER);
    const defaultWidths = Object.keys(layout.columnSizing ?? {}).length === 0;
    const defaultSort = search === null || (search.sortBy === PGR_COLUMN_FIELDS.Name && search.sortDirection === 'asc');
    if (!allShown || !defaultOrder || !defaultWidths || !defaultSort) {
      await this.resetToDefaultView();
    }
  }

  // ---------------------------------------------------------------- list page: rows and the Edit landing

  /** Clicks one cell of a result row and waits for that group's Edit page to render its form. */
  @step('Open a result row')
  async openRow(rowIndex: number, columnName: string): Promise<void> {
    const headers = await this.readHeaderNames();
    const column = headers.indexOf(columnName);
    if (column < 0) {
      throw new Error(`The grid shows no "${columnName}" column to click`);
    }
    await this.page.locator(S.gridRows).nth(rowIndex).locator('td').nth(column).click();
    await this.page.waitForURL(S.EDIT_URL_PATTERN, { timeout: 30_000 });
    await this.waitForNoSkeletons();
    await expect(this.page.locator(S.addNameInput)).toBeVisible({ timeout: 30_000 });
  }

  /** What the Edit page shows on landing — heading, the group's values and its control states. */
  @step('Read the Edit page landing')
  async readEditLanding(): Promise<PgrEditLanding> {
    const heading = ((await this.page.getByRole('heading').first().textContent()) ?? '').trim();
    const priceBadge = ((await this.page.getByText(S.PRICE_BADGE_PATTERN).first().textContent()) ?? '').trim();
    const breadcrumbs = (await this.page.getByRole('link').allTextContents())
      .map((t) => t.trim())
      .filter((t) => t === S.LINK_PRODUCTS || t === S.LINK_PRODUCT_GROUPS);
    return {
      heading,
      name: await this.page.locator(S.addNameInput).inputValue(),
      description: await this.page.locator(S.addDescriptionInput).inputValue(),
      activeChecked: await this.isAddActiveChecked(),
      priceBadge,
      saveEnabled: await this.isAddSaveEnabled(),
      cancelEnabled: await this.addCancelButton().isEnabled(),
      breadcrumbs,
      hasTranslationsButton: (await this.page.getByRole('button', { name: S.NAME_TRANSLATIONS, exact: true }).count()) > 0,
    };
  }

  /** Whether the first row's Name cell renders any bold element — markup in a name must stay text. */
  @step('Read whether the first Name cell renders markup')
  async doesFirstNameCellRenderMarkup(): Promise<boolean> {
    return this.page.evaluate(() => {
      const headers = Array.from(document.querySelectorAll('thead th')).map((t) => (t.textContent ?? '').trim());
      const cell = document.querySelector('tbody tr')?.querySelectorAll('td').item(headers.indexOf('Name'));
      return cell !== null && cell !== undefined && cell.querySelector('b, strong') !== null;
    });
  }

  /** Clicks the "Products" breadcrumb and waits for the Products page. */
  @step('Click the Products breadcrumb')
  async clickBreadcrumbToProducts(): Promise<void> {
    await this.page.getByRole('link', { name: S.LINK_PRODUCTS, exact: true }).click();
    await expect(this.page).toHaveURL(/\/products\/?$/, { timeout: 30_000 });
    await this.waitForNoSkeletons();
  }

  // ---------------------------------------------------------------- list page: pager

  /** Types a page number into the page box and presses Enter. */
  @step('Jump to a page through the page box')
  async jumpToPage(value: string): Promise<void> {
    const box = this.pageNumberBox();
    await box.click();
    await this.page.keyboard.press('Control+a');
    await box.pressSequentially(value, { delay: 40 });
    await box.press('Enter');
    await this.waitForNoSkeletons();
  }

  /** Types into the page box without submitting and returns what the box holds afterwards. */
  @step('Type into the page box without submitting')
  async typeIntoPageBox(value: string): Promise<string> {
    const box = this.pageNumberBox();
    await box.click();
    await this.page.keyboard.press('Control+a');
    await box.pressSequentially(value, { delay: 40 });
    const held = (await box.inputValue()).trim();
    await box.press('Escape');
    return held;
  }

  /** Chooses a rows-per-page size and waits for the grid to reshape. */
  @step('Choose a rows-per-page size')
  async selectRowsPerPage(size: string): Promise<void> {
    await this.rowsPerPageCombo().click();
    const listbox = this.page.locator(S.listbox);
    await listbox.waitFor({ state: 'visible', timeout: 5_000 });
    await listbox.getByRole('option', { name: size, exact: true }).click();
    await listbox.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
    await this.waitForNoSkeletons();
    await expect.poll(() => this.readRowsPerPage(), { timeout: 15_000 }).toBe(size);
  }

  // ---------------------------------------------------------------- list page: column menus and sorting

  private headerCell(columnName: string): Locator {
    return this.page.locator(S.gridHeaderCells).filter({ hasText: new RegExp(`^${columnName}$`) });
  }

  /** Clicks a column's header cell itself (not its menu button) and waits for the column menu. */
  @step('Click a column header cell')
  async clickHeaderCell(columnName: string): Promise<void> {
    await this.headerCell(columnName).click();
    await this.page.locator(S.menu).waitFor({ state: 'visible', timeout: 5_000 });
  }

  /**
   * Waits until the open menu has stayed mounted for a moment. The menu re-mounts once right
   * after it opens, which detaches an entry clicked too early (seen live: the click retried
   * against a detached entry until it timed out).
   */
  private async waitForMenuToSettle(): Promise<void> {
    await this.page.locator(S.menu).waitFor({ state: 'visible', timeout: 5_000 });
    await this.page.waitForFunction(
      ({ selector, holdMs }) => {
        const menu = document.querySelector(selector);
        if (!menu) return false;
        const w = window as unknown as { __menuHold?: { el: Element; since: number } };
        if (!w.__menuHold || w.__menuHold.el !== menu) {
          w.__menuHold = { el: menu, since: Date.now() };
          return false;
        }
        return Date.now() - w.__menuHold.since >= holdMs;
      },
      { selector: S.menu, holdMs: 1_200 },
      { timeout: 15_000 },
    );
  }

  /** Chooses an entry in the open column menu or Grid Options menu and waits for the grid to settle. */
  @step('Choose a menu entry')
  async chooseMenuEntry(name: string): Promise<void> {
    await this.waitForMenuToSettle();
    await this.page
      .getByRole('menuitem', { name, exact: true })
      .or(this.page.getByRole('menuitemcheckbox', { name, exact: true }))
      .click();
    await this.page.locator(S.menu).waitFor({ state: 'hidden', timeout: 10_000 });
    await this.waitForNoSkeletons();
  }

  /** Opens a column's menu and chooses one of its entries. */
  @step('Choose a column menu entry')
  async chooseColumnMenuEntry(columnName: string, entry: string): Promise<void> {
    await this.openColumnMenu(columnName);
    await this.chooseMenuEntry(entry);
  }

  /** Reads a column menu's entries in order, then closes it with Escape. */
  @step('Read a column menu')
  async readColumnMenuEntries(columnName: string): Promise<string[]> {
    await this.openColumnMenu(columnName);
    await this.waitForMenuToSettle();
    const entries = await this.readOpenMenuItems();
    await this.closeOpenMenu();
    return entries;
  }

  /** Whether any menu is open. */
  @step('Read whether a menu is open')
  async isMenuOpen(): Promise<boolean> {
    return (await this.page.locator(S.menu).count()) > 0;
  }

  /** The sort marker a column header draws: ascending, descending, neutral (sortable, unsorted) or none. */
  @step('Read a column sort marker')
  async readSortMarker(columnName: string): Promise<PgrSortMarker> {
    const cell = this.headerCell(columnName);
    if ((await cell.locator(S.sortMarkerAscending).count()) > 0) return 'ascending';
    if ((await cell.locator(S.sortMarkerDescending).count()) > 0) return 'descending';
    if ((await cell.locator(S.sortMarkerNeutral).count()) > 0) return 'neutral';
    return 'none';
  }

  // ---------------------------------------------------------------- list page: Grid Options

  gridOptionsButton(): Locator {
    return this.page.getByRole('button', { name: S.NAME_GRID_OPTIONS, exact: true });
  }

  /** Opens the Grid Options menu and waits for it to settle. */
  @step('Open the Grid Options menu')
  async openGridOptions(): Promise<void> {
    await this.gridOptionsButton().click();
    await this.waitForMenuToSettle();
  }

  /** The Grid Options entries in order with their checked state (null for the reset entry), then closes the menu. */
  @step('Read the Grid Options entries')
  async readGridOptionsEntries(): Promise<{ label: string; checked: boolean | null }[]> {
    await this.openGridOptions();
    const entries = await this.page
      .locator('[role="menuitem"], [role="menuitemcheckbox"]')
      .evaluateAll((items) => items.map((item) => {
        const checked = item.getAttribute('aria-checked');
        return { label: (item.textContent ?? '').trim(), checked: checked === null ? null : checked === 'true' };
      }));
    await this.closeOpenMenu();
    return entries.filter((e) => e.label.length > 0);
  }

  /** Toggles a column's visibility through its Grid Options entry. */
  @step('Toggle a column in Grid Options')
  async toggleGridOptionsColumn(columnName: string): Promise<void> {
    await this.openGridOptions();
    await this.chooseMenuEntry(columnName);
  }

  /** Chooses Reset to Default View in Grid Options. */
  @step('Reset the grid to its default view')
  async resetToDefaultView(): Promise<void> {
    await this.openGridOptions();
    await this.chooseMenuEntry(S.MENU_RESET_VIEW);
  }

  // ---------------------------------------------------------------- list page: header drags and geometry

  /** A column header's rendered width in pixels. */
  @step('Read a column header width')
  async readHeaderWidth(columnName: string): Promise<number> {
    const box = await this.headerCell(columnName).boundingBox();
    if (!box) {
      throw new Error(`The "${columnName}" header has no layout box`);
    }
    return Math.round(box.width);
  }

  /** Whether the search panel is collapsed — the divider toggle then offers to expand it. */
  @step('Read whether the search panel is collapsed')
  async isSearchPanelCollapsed(): Promise<boolean> {
    return (await this.page.getByRole('button', { name: S.NAME_EXPAND_PANEL, exact: true }).count()) > 0;
  }

  /** The result table's left edge and width — both move when the search panel collapses. */
  @step('Read the result table geometry')
  async readTableGeometry(): Promise<{ left: number; width: number }> {
    const box = await this.page.locator(S.gridTable).boundingBox();
    if (!box) {
      throw new Error('The result table has no layout box');
    }
    return { left: Math.round(box.x), width: Math.round(box.width) };
  }

  /**
   * Drags a column header's grip onto another header with a real pointer sequence — press,
   * move in steps, pause, release. The stepped moves are what make the header's drag fire.
   */
  @step('Drag a column header onto another header')
  async dragColumnOnto(sourceColumn: string, targetColumn: string): Promise<void> {
    const from = await this.headerCell(sourceColumn).locator(S.headerGrip).boundingBox();
    const to = await this.headerCell(targetColumn).boundingBox();
    if (!from || !to) {
      throw new Error('The header grip or the target header has no layout box to drag between');
    }
    const mouse = this.page.mouse;
    const startX = from.x + from.width / 2;
    const startY = from.y + from.height / 2;
    await mouse.move(startX, startY);
    await mouse.down();
    await mouse.move(startX + 10, startY + 2, { steps: 5 });
    await mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 25 });
    // A moment over the target before releasing lets the drop target register the hover.
    await expect(this.headerCell(targetColumn)).toBeVisible({ timeout: 1_000 });
    await mouse.up();
    await this.waitForNoSkeletons();
  }

  /** Drags a column's resize handle horizontally by the given distance (negative = left). */
  @step('Drag a column resize handle')
  async dragResizeHandle(columnName: string, distancePx: number): Promise<void> {
    const field = PGR_COLUMN_FIELDS[columnName as keyof typeof PGR_COLUMN_FIELDS];
    const handle = this.page.getByRole('button', { name: `${S.RESIZE_HANDLE_PREFIX}${field}`, exact: true });
    const box = await handle.boundingBox();
    if (!box) {
      throw new Error(`The "${columnName}" resize handle has no layout box`);
    }
    const mouse = this.page.mouse;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await mouse.move(x, y);
    await mouse.down();
    await mouse.move(x + (distancePx > 0 ? 10 : -10), y, { steps: 3 });
    await mouse.move(x + distancePx, y, { steps: Math.max(10, Math.round(Math.abs(distancePx) / 8)) });
    await mouse.up();
    await this.waitForNoSkeletons();
  }
}
