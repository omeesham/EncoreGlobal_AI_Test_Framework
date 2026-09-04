import { Locator, expect } from '@playwright/test';
import { step } from '../../fixtures/step-decorator';
import { ItemSearchPage } from './item-search.page';
import { itemSearchProductCode as S } from '../../selectors/item-search/product-code';

/**
 * The product-code layer of the Products page: the row-selection toolbar and the
 * "Product Code Details" dialogs (view + add flows).
 *
 * The full toolbar mounts only after a result row is clicked, and the dialog's controls
 * re-render on tab switches — locators here are resolved lazily so every action targets
 * the current render. Closing a dialog discards unsaved edits silently (proven live);
 * nothing in this page object ever clicks Save.
 */
export class ProductCodePage extends ItemSearchPage {
  // ---------------------------------------------------------------- row selection & toolbar

  /** Clicks the first result row and waits for the selection toolbar to mount. */
  @step('Select the first result row')
  async selectFirstRow(): Promise<void> {
    await this.page.locator('tbody tr').first().click();
    await expect(this.viewProductCodeButton()).toBeVisible({ timeout: 15_000 });
  }

  viewProductCodeButton(): Locator {
    return this.page.getByRole('button', { name: S.NAME_VIEW_PRODUCT_CODE, exact: true });
  }

  addProductCodeButton(): Locator {
    return this.page.getByRole('button', { name: S.NAME_ADD_PRODUCT_CODE, exact: true });
  }

  viewAvailabilityButton(): Locator {
    return this.page.getByRole('button', { name: S.NAME_VIEW_AVAILABILITY, exact: true });
  }

  /**
   * The toolbar's Product Group button. The grid also has a "Product Group" COLUMN header
   * button; the toolbar sits before the table in DOM order, so `.first()` is the toolbar.
   */
  productGroupButton(): Locator {
    return this.page.getByRole('button', { name: S.NAME_PRODUCT_GROUP, exact: true }).first();
  }

  // ---------------------------------------------------------------- dialog lifecycle

  /** The details dialog (view or add flow — both carry the same title). */
  dialog(): Locator {
    return this.page.locator(S.dialog).filter({ hasText: S.TITLE_DIALOG });
  }

  /** Opens the view dialog for the selected row and waits for it to render. */
  @step('Open the product code details')
  async openViewDialog(): Promise<void> {
    await this.viewProductCodeButton().click();
    await this.dialog().waitFor({ state: 'visible', timeout: 30_000 });
    await this.waitForNoSkeletons();
  }

  /** Opens the add dialog for the selected row and waits for it to render. */
  @step('Open the add product code form')
  async openAddDialog(): Promise<void> {
    await this.addProductCodeButton().click();
    await this.dialog().waitFor({ state: 'visible', timeout: 30_000 });
    await this.waitForNoSkeletons();
  }

  /** Closes the dialog through its footer Close button and waits for it to go. */
  @step('Close the dialog')
  async closeDialog(): Promise<void> {
    await this.dialog().getByRole('button', { name: S.NAME_CLOSE, exact: true }).last().click();
    await this.dialog().waitFor({ state: 'hidden', timeout: 10_000 });
  }

  // ---------------------------------------------------------------- dialog reads

  /** Tab names inside the open dialog, in order. */
  @step('Read the dialog tabs')
  async readDialogTabs(): Promise<string[]> {
    const tabs = await this.dialog().locator(S.tabAny).allTextContents();
    return tabs.map((t) => t.trim()).filter((t) => t.length > 0);
  }

  /** The active tab's name. */
  @step('Read the active dialog tab')
  async readActiveTab(): Promise<string> {
    return ((await this.dialog().locator(S.tabActive).first().textContent()) ?? '').trim();
  }

  /** Clicks a dialog tab by exact name and lets the panel re-render. */
  @step('Open a dialog tab')
  async clickDialogTab(name: string): Promise<void> {
    await this.dialog().getByRole('tab', { name, exact: true }).click();
    await this.waitForAngularStable(10_000).catch(() => {});
    // Tab panels that fetch their content paint loading placeholders first — the
    // History grid rendered its chrome seconds before its headers on a live run.
    await this.waitForNoSkeletons();
  }

  /** Whether the dialog's Save is enabled. */
  @step('Read the dialog Save state')
  async isDialogSaveEnabled(): Promise<boolean> {
    return this.dialog().getByRole('button', { name: S.NAME_SAVE, exact: true })
      .isEnabled().catch(() => false);
  }

  /** The editable name box in the open dialog. */
  dialogNameBox(): Locator {
    return this.dialog().getByPlaceholder(S.PLACEHOLDER_NAME).first();
  }

  /** Full text of the open dialog (structure assertions read from this in one call). */
  @step('Read the dialog content')
  async readDialogText(): Promise<string> {
    return ((await this.dialog().textContent()) ?? '').trim();
  }

  // ---------------------------------------------------------------- segment caret menus

  /** Opens the View split button's segment menu. */
  @step('Open the view segment menu')
  async openViewSegmentMenu(): Promise<void> {
    await this.page.locator(S.btnViewCaret).click();
    await this.page.locator('[role="menu"]').waitFor({ state: 'visible', timeout: 5_000 });
  }

  /** Opens the Add split button's segment menu. */
  @step('Open the add segment menu')
  async openAddSegmentMenu(): Promise<void> {
    await this.page.locator(S.btnAddCaret).click();
    await this.page.locator('[role="menu"]').waitFor({ state: 'visible', timeout: 5_000 });
  }

  /** Clicks a segment entry in the open menu and waits for the dialog to open. */
  @step('Choose a segment')
  async chooseSegment(segment: string): Promise<void> {
    await this.page.getByRole('menuitem', { name: segment, exact: true }).click();
    await this.dialog().waitFor({ state: 'visible', timeout: 30_000 });
    await this.waitForNoSkeletons();
  }

  // ---------------------------------------------------------------- add-form pairing rule

  /** The add form's Product Type selector (shows its placeholder until chosen). */
  productTypeCombo(): Locator {
    return this.dialog().locator('button[role="combobox"]').filter({ hasText: S.TEXT_SELECT_PRODUCT_TYPE }).first();
  }

  /** The add form's Service Type selector. */
  serviceTypeCombo(): Locator {
    return this.dialog().locator('button[role="combobox"]').filter({ hasText: S.TEXT_SELECT_SERVICE_TYPE }).first();
  }

  /** Opens the Product Type list and reads every offered type, leaving it open. */
  @step('Open the Product Type list')
  async readProductTypeOptions(): Promise<string[]> {
    await this.productTypeCombo().click();
    const listbox = this.page.locator('[role="listbox"]');
    await listbox.waitFor({ state: 'visible', timeout: 5_000 });
    const options = await listbox.locator('[role="option"]').allTextContents();
    return options.map((o) => o.trim()).filter((o) => o.length > 0);
  }

  /** Chooses a product type in the OPEN type list. */
  @step('Choose a Product Type')
  async chooseProductType(type: string): Promise<void> {
    await this.page.getByRole('option', { name: type, exact: true }).click();
    await this.page.locator('[role="listbox"]').waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
    await this.waitForAngularStable(5_000).catch(() => {});
  }

  /** Whether the Service Type selector is enabled (it rests locked until a type is chosen). */
  @step('Read the Service Type selector state')
  async isServiceTypeEnabled(): Promise<boolean> {
    // After a Product Type is chosen the service selector still shows its placeholder,
    // so the placeholder-anchored locator keeps resolving.
    return this.serviceTypeCombo().isEnabled().catch(() => false);
  }

  /** Opens the Service Type list and reads the offered services, then closes it. */
  @step('Open the Service Type list')
  async readServiceTypeOptions(): Promise<string[]> {
    await this.serviceTypeCombo().click();
    const listbox = this.page.locator('[role="listbox"]');
    await listbox.waitFor({ state: 'visible', timeout: 5_000 });
    const options = await listbox.locator('[role="option"]').allTextContents();
    await this.page.keyboard.press('Escape');
    await listbox.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => {});
    return options.map((o) => o.trim()).filter((o) => o.length > 0);
  }

  // ---------------------------------------------------------------- add-form save flow

  /** The add form's required item description box. */
  dialogDescriptionBox(): Locator {
    return this.dialog().getByPlaceholder(S.PLACEHOLDER_ITEM_DESCRIPTION).first();
  }

  // ---------------------------------------------------------------- field length limits

  /** The optional identifier box, present in both dialogs. */
  dialogOracleItemNumberBox(): Locator {
    return this.dialog().getByPlaceholder(S.PLACEHOLDER_ORACLE_ITEM_NUMBER).first();
  }

  /**
   * Types a value one key at a time and returns what actually ended up in the box.
   *
   * The boxes stop accepting keystrokes once they are full, so typing a value longer than the
   * limit leaves only the part that fit. Returning the landed value rather than asserting here
   * keeps the expected length in the test, where it is readable.
   */
  @step('Type a value into a dialog field and read back what fits')
  async typeAndReadBack(box: Locator, value: string): Promise<string> {
    await this.typeByKeys(box, value);
    return box.inputValue();
  }

  /**
   * Puts a value straight into a box the way a paste does, skipping the per-keystroke limit.
   *
   * Typing is capped by the box itself, so this is the only way to get an over-long value in
   * front of the form's own checks. Setting `.value` alone would not register — the form listens
   * for input events — so the value is set through the native setter and both events are raised,
   * exactly as a real paste would.
   */
  @step('Paste a value into a dialog field')
  async pasteIntoBox(box: Locator, value: string): Promise<string> {
    await box.evaluate((el, text) => {
      const input = el as HTMLInputElement;
      const setValue = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set;
      setValue?.call(input, text);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
    return box.inputValue();
  }

  /** Whether a dialog field is currently marked as failing validation. */
  @step('Read whether a dialog field is flagged invalid')
  async isFieldFlaggedInvalid(box: Locator): Promise<boolean> {
    return (await box.getAttribute('aria-invalid')) === 'true';
  }

  /** Opens the Product Type list and chooses a type, letting the pairing rule settle. */
  @step('Select a Product Type')
  async selectProductType(type: string): Promise<void> {
    await this.productTypeCombo().click();
    await this.page.locator('[role="listbox"]').waitFor({ state: 'visible', timeout: 5_000 });
    await this.chooseProductType(type);
  }

  /** Opens the (now unlocked) Service Type list and chooses a service. */
  @step('Select a Service Type')
  async selectServiceType(name: string): Promise<void> {
    await this.serviceTypeCombo().click();
    const listbox = this.page.locator('[role="listbox"]');
    await listbox.waitFor({ state: 'visible', timeout: 5_000 });
    await this.page.getByRole('option', { name, exact: true }).click();
    await listbox.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
    await this.waitForAngularStable(5_000).catch(() => {});
  }

  /**
   * Fills the four required add-form fields in the order the pairing rule needs: the two
   * text fields, then the Product Type (which unlocks Service Type), then the Service Type.
   */
  @step('Fill the add product code form')
  async fillAddForm(fields: {
    name: string;
    description: string;
    productType: string;
    serviceType: string;
  }): Promise<void> {
    await this.typeByKeys(this.dialogNameBox(), fields.name);
    await this.typeByKeys(this.dialogDescriptionBox(), fields.description);
    await this.selectProductType(fields.productType);
    await this.selectServiceType(fields.serviceType);
  }

  /**
   * Saves the completed add form and confirms the create landed: Save must be enabled, the
   * create request must return success, the dialog must close, and the confirmation toast
   * must appear. The create response is never treated as proof on its own — persistence is
   * proven by the caller searching the new code's name back after the grid reloads.
   */
  @step('Save the new product code and confirm it was created')
  async saveNewCodeAndConfirm(): Promise<void> {
    const save = this.dialog().getByRole('button', { name: S.NAME_SAVE, exact: true });
    await expect(save, 'Save should be enabled once the required fields are set')
      .toBeEnabled({ timeout: 10_000 });
    const created = this.page.waitForResponse(
      (r) => r.url().includes(S.CREATE_ENDPOINT) && r.request().method() === 'POST',
      { timeout: 30_000 },
    );
    // Set the toast watch before clicking so it is caught the moment it appears.
    const toastShown = this.page.locator(S.TOAST).filter({ hasText: S.TOAST_CODE_CREATED })
      .waitFor({ state: 'visible', timeout: 15_000 });
    await save.click();
    const res = await created;
    expect(res.status(), 'the create request should return 200').toBe(200);
    expect(((await res.json()) as { success?: boolean })?.success, 'the create response should report success').toBe(true);
    await toastShown;
    await this.dialog().waitFor({ state: 'hidden', timeout: 15_000 });
  }
}
