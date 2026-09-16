import { Locator, expect } from '@playwright/test';
import { step } from '../../fixtures/step-decorator';
import { ProductsPage } from './products.page';
import { itemSearchProductCode as S } from '../../selectors/products/product-code';
import { itemSearchProducts as P } from '../../selectors/products/products';
import { ISR_DIALOG_SECTIONS } from '../../data/products/products';

/** The hierarchy levels whose names render as dropdowns above the edited level. */
export type HierarchyLevel = 'Sub Category' | 'Class' | 'Sub Class';

/** The two sections that carry a Product Organization control on the Item segment. */
export type OrgSection = 'Sub Class' | 'Item';

/** One History grid row keyed by its column name. */
export type HistoryRow = Record<string, string>;

/**
 * The product-code layer of the Products page: the row-selection toolbar and the
 * "Product Code Details" dialogs (view + add flows).
 *
 * The full toolbar mounts only after a result row is clicked, and the dialog's controls
 * re-render on tab switches — locators here are resolved lazily so every action targets
 * the current render. Closing a dialog discards unsaved edits silently (proven live).
 *
 * The view dialog's Save sends one update request and leaves the dialog open with Save
 * disabled; the helpers that drive it wait for that request AND the confirmation message,
 * and persistence is proven by the caller reading the value back after a reopen or reload.
 *
 * Control order inside the view dialog (read live 2026-09-15): the dropdown triggers run in
 * section order, so on the Item segment the Sub Category, Class and Sub Class names are the
 * first, third and fifth triggers, and on every segment the edited level's own Product Type
 * and Service Type are the last two (the Category segment shows its type as plain text and
 * keeps only the service dropdown). The Barcodeable box precedes the Active box wherever
 * both exist, and the Active box is always the last checkbox of the dialog.
 */
export class ProductCodePage extends ProductsPage {
  // ---------------------------------------------------------------- row selection & toolbar

  /** Clicks the first result row and waits for the selection toolbar to mount. */
  @step('Select the first result row')
  async selectFirstRow(): Promise<void> {
    await this.page.locator('tbody tr').first().click();
    await expect(this.viewProductCodeButton()).toBeVisible({ timeout: 15_000 });
  }

  /** Clicks the first result row containing the text and waits for the toolbar to mount. */
  @step('Select the result row of a product')
  async selectRowContaining(text: string): Promise<void> {
    await this.page.locator('tbody tr').filter({ hasText: text }).first().click();
    await expect(this.viewProductCodeButton()).toBeVisible({ timeout: 15_000 });
  }

  viewProductCodeButton(): Locator {
    return this.page.getByRole('button', { name: S.NAME_VIEW_PRODUCT_CODE, exact: true });
  }

  /** The small arrow beside View Product Code that opens the segment menu. */
  viewSegmentArrow(): Locator {
    return this.page.locator(S.btnViewCaret);
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

  /**
   * The dialog's two Close controls in DOM order: the footer button first, then the small
   * corner button in the top-right (measured live 2026-09-15 — the corner one is 16 px).
   */
  private closeButtons(): Locator {
    return this.dialog().getByRole('button', { name: S.NAME_CLOSE, exact: true });
  }

  /** Closes the dialog through its footer Close button and waits for it to go. */
  @step('Close the dialog')
  async closeDialog(): Promise<void> {
    await this.closeButtons().first().click();
    await this.dialog().waitFor({ state: 'hidden', timeout: 10_000 });
  }

  /** Closes the dialog through the small corner button and waits for it to go. */
  @step('Close the dialog with its corner button')
  async closeDialogWithCornerButton(): Promise<void> {
    await this.closeButtons().last().click();
    await this.dialog().waitFor({ state: 'hidden', timeout: 10_000 });
  }

  /** Presses Escape with nothing else open and waits for the dialog to go. */
  @step('Close the dialog with the Escape key')
  async closeDialogWithEscape(): Promise<void> {
    await this.page.keyboard.press('Escape');
    await this.dialog().waitFor({ state: 'hidden', timeout: 10_000 });
  }

  /** Clicks the page corner outside the dialog (the overlay) and lets the app react. */
  @step('Click the page outside the dialog')
  async clickOutsideDialog(): Promise<void> {
    await this.page.mouse.click(4, 4);
    await this.waitForAngularStable(5_000);
  }

  /** Whether the details dialog is currently shown. */
  @step('Read whether the dialog is open')
  async isDialogOpen(): Promise<boolean> {
    return this.dialog().isVisible();
  }

  /** Reloads the page and waits for it to be usable again. */
  @step('Reload the page and wait for it to settle')
  async reloadPage(): Promise<void> {
    await this.page.reload({ waitUntil: 'domcontentloaded' });
    await this.waitForAngularStable();
    await this.waitForReady();
  }

  /**
   * Types a word into the Any Field box, runs the search and waits for its server answer
   * before reading the count — the count label keeps the previous run's number until the
   * new answer lands, so a read taken earlier could satisfy the predicate with stale data.
   */
  @step('Search the Any Field box for a value')
  async searchFor(word: string, predicate: (n: number | null) => boolean): Promise<number | null> {
    await this.typeAnyField(word);
    const answered = this.page.waitForResponse(
      (r) => r.url().includes(P.SEARCH_ENDPOINT) && r.request().method() === 'POST',
      { timeout: ProductsPage.HYDRATION_TIMEOUT },
    );
    await this.page.locator(P.btnSearch).click();
    await answered;
    await this.waitForNoSkeletons();
    return this.waitForCount(ProductsPage.COUNT_PATTERN, predicate);
  }

  /** Whether the dialog's footer Close button is enabled. */
  @step('Read the dialog Close state')
  async isDialogCloseEnabled(): Promise<boolean> {
    return this.closeButtons().first().isEnabled();
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

  private dialogSaveButton(): Locator {
    return this.dialog().getByRole('button', { name: S.NAME_SAVE, exact: true });
  }

  /** Whether the dialog's Save is enabled. */
  @step('Read the dialog Save state')
  async isDialogSaveEnabled(): Promise<boolean> {
    return this.dialogSaveButton().isEnabled().catch(() => false);
  }

  /** The editable name box in the open dialog. */
  dialogNameBox(): Locator {
    return this.dialog().getByPlaceholder(S.PLACEHOLDER_NAME).first();
  }

  /** Any dialog box by its placeholder (own-name boxes of the upper segments included). */
  dialogBox(placeholder: string): Locator {
    return this.dialog().getByPlaceholder(placeholder).first();
  }

  /** The Sub Class segment's product description box. */
  subClassDescriptionBox(): Locator {
    return this.dialog().getByPlaceholder(S.PLACEHOLDER_PRODUCT_DESCRIPTION).first();
  }

  /** Full text of the open dialog (structure assertions read from this in one call). */
  @step('Read the dialog content')
  async readDialogText(): Promise<string> {
    return ((await this.dialog().textContent()) ?? '').trim();
  }

  /**
   * The hierarchy section headings of the open dialog in render order. Headings are the
   * leaf elements whose whole text is a section name, outside the tab strip and any control.
   */
  @step('Read the dialog section headings')
  async readDialogSections(): Promise<string[]> {
    return this.dialog().evaluate((dlg, sections: string[]) => {
      const out: string[] = [];
      for (const el of Array.from(dlg.querySelectorAll('*'))) {
        if (el.children.length > 0) continue;
        if (el.closest('[role="tablist"], button, label, [role="option"], [role="combobox"]')) continue;
        const text = (el.textContent ?? '').trim();
        if (sections.includes(text) && out[out.length - 1] !== text) out.push(text);
      }
      return out;
    }, [...ISR_DIALOG_SECTIONS]);
  }

  /** Placeholders of every text box in the open dialog, in order. */
  @step('Read the placeholders of the dialog boxes')
  async readDialogPlaceholders(): Promise<string[]> {
    return this.dialog().locator('input:not([type="checkbox"])').evaluateAll((els) =>
      els.map((el) => (el as HTMLInputElement).placeholder).filter((p) => p.length > 0),
    );
  }

  /** The displayed value of every hierarchy, type and service dropdown, in order. */
  @step('Read the dialog dropdown values')
  async readDialogComboValues(): Promise<string[]> {
    return this.dialog().locator(S.comboTrigger).evaluateAll((els) =>
      els.map((el) => ((el as HTMLElement).innerText ?? '').trim().split('\n')[0] ?? ''),
    );
  }

  /** The label beside every checkbox of the open dialog, in order. */
  @step('Read the dialog checkbox labels')
  async readDialogCheckboxLabels(): Promise<string[]> {
    return this.dialog().locator(S.checkbox).evaluateAll((els) =>
      els.map((el) => ((el.parentElement as HTMLElement | null)?.innerText ?? '').trim()),
    );
  }

  /**
   * Every Product Code ID shown in the dialog, in section order (the Sub Class section's
   * first, the Item section's last). Read as the text that follows each label.
   */
  @step('Read the product code identifiers shown in the dialog')
  async readDialogProductCodeIds(): Promise<string[]> {
    return this.dialog().evaluate((dlg) => {
      const leaves = Array.from(dlg.querySelectorAll('*'))
        .filter((el) => el.children.length === 0)
        .map((el) => (el.textContent ?? '').trim())
        .filter((t) => t.length > 0);
      const ids: string[] = [];
      leaves.forEach((text, i) => {
        if (text === 'Product Code ID' && i + 1 < leaves.length) ids.push(leaves[i + 1] ?? '');
      });
      return ids;
    });
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

  /** Opens the view dialog scoped to a segment through the segment menu. */
  @step('Open a segment of the product code details')
  async openSegment(segment: string): Promise<void> {
    await this.openViewSegmentMenu();
    await this.chooseSegment(segment);
  }

  /**
   * Clicks a segment entry of the OPEN menu and reports what happened instead of failing on
   * the wait: whether the details dialog opened within the bounded wait, and how many chain
   * reads the entry sent. An entry that opens nothing (the Category entry of an item without a
   * category) is reported rather than thrown, so a case can assert either outcome precisely.
   */
  @step('Choose a segment and read whether the details opened')
  async chooseSegmentAndReadOutcome(segment: string): Promise<{ opened: boolean; chainReads: number }> {
    let chainReads = 0;
    const onRequest = (req: { url: () => string }) => {
      if (req.url().includes(S.HIERARCHY_ENDPOINT)) chainReads += 1;
    };
    this.page.on('request', onRequest);
    try {
      await this.page.getByRole('menuitem', { name: segment, exact: true }).click();
      const opened = await this.dialog()
        .waitFor({ state: 'visible', timeout: 30_000 })
        .then(() => true, () => false);
      if (opened) await this.waitForNoSkeletons();
      else await this.waitForAngularStable(5_000);
      return { opened, chainReads };
    } finally {
      this.page.off('request', onRequest);
    }
  }

  // ---------------------------------------------------------------- text boxes

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

  /** Replaces a box's value by real keystrokes (select-all, Delete, then the keys). */
  @step('Replace the value of a dialog box')
  async setBoxValue(box: Locator, value: string): Promise<string> {
    await this.typeByKeys(box, value);
    return box.inputValue();
  }

  /** Puts a value into a box in one go (the way a paste lands) and reads it back. */
  @step('Fill a dialog box in one go')
  async fillBox(box: Locator, value: string): Promise<string> {
    await box.fill(value);
    await this.waitForAngularStable(5_000);
    return box.inputValue();
  }

  /**
   * Replaces a box's value with text inserted in one piece, the way a paste arrives: the
   * browser applies the box's own length limit to it, unlike the scripted set below.
   */
  @step('Paste a value into a dialog box through the keyboard')
  async insertTextIntoBox(box: Locator, value: string): Promise<string> {
    await box.click();
    await this.page.keyboard.press('Control+a');
    await this.page.keyboard.insertText(value);
    await this.waitForAngularStable(5_000);
    return box.inputValue();
  }

  /** Appends keystrokes to the end of a box's current value. */
  @step('Add characters to the end of a dialog box')
  async appendToBox(box: Locator, text: string): Promise<string> {
    await box.click();
    await this.page.keyboard.press('End');
    await box.pressSequentially(text, { delay: 40 });
    await this.waitForAngularStable(5_000);
    return box.inputValue();
  }

  /** Removes the last character of a box with one Backspace. */
  @step('Remove the last character of a dialog box')
  async removeLastCharacter(box: Locator): Promise<string> {
    await box.click();
    await this.page.keyboard.press('End');
    await this.page.keyboard.press('Backspace');
    await this.waitForAngularStable(5_000);
    return box.inputValue();
  }

  /** Empties a box with select-all and Delete. */
  @step('Clear a dialog box with select-all and Delete')
  async clearBoxBySelectAll(box: Locator): Promise<string> {
    await this.typeByKeys(box, '');
    return box.inputValue();
  }

  /** Empties a box one Backspace at a time from its end. */
  @step('Clear a dialog box with Backspace')
  async clearBoxByBackspace(box: Locator): Promise<string> {
    await box.click();
    await this.page.keyboard.press('End');
    const length = (await box.inputValue()).length;
    for (let i = 0; i < length; i++) {
      await this.page.keyboard.press('Backspace');
    }
    await this.waitForAngularStable(5_000);
    return box.inputValue();
  }

  /** Presses Tab and returns the placeholder of the box that received focus. */
  @step('Press Tab and read where the focus went')
  async pressTabAndReadFocus(): Promise<string> {
    await this.page.keyboard.press('Tab');
    return this.page.evaluate(() => (document.activeElement as HTMLInputElement | null)?.placeholder ?? '');
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

  // ---------------------------------------------------------------- checkboxes and the Active prompt

  /** The Active box of the edited level — always the dialog's last checkbox. */
  activeBox(): Locator {
    return this.dialog().locator(S.checkbox).last();
  }

  /** The Barcodeable box — the first checkbox where the dialog shows two. */
  barcodeableBox(): Locator {
    return this.dialog().locator(S.checkbox).first();
  }

  /** Whether a checkbox is checked. */
  @step('Read whether a checkbox is checked')
  async isBoxChecked(box: Locator): Promise<boolean> {
    return (await box.getAttribute('aria-checked')) === 'true';
  }

  /** Whether a checkbox is disabled. */
  @step('Read whether a checkbox is disabled')
  async isBoxDisabled(box: Locator): Promise<boolean> {
    return box.isDisabled();
  }

  /**
   * Clicks the Barcodeable box with the real pointer even when it is disabled — the case
   * that clicks a disabled box needs the click to land and be ignored, not to be refused
   * by the driver before it happens.
   */
  @step('Click the Barcodeable box')
  async clickBarcodeable(): Promise<void> {
    await this.barcodeableBox().click({ force: true });
    await this.waitForAngularStable(5_000);
  }

  /** Clicks the Barcodeable label text. */
  @step('Click the Barcodeable label')
  async clickBarcodeableLabel(): Promise<void> {
    await this.dialog().getByText('Barcodeable', { exact: true }).first().click({ force: true });
    await this.waitForAngularStable(5_000);
  }

  /** Clicks the row that holds the Barcodeable box and its label. */
  @step('Click the Barcodeable row')
  async clickBarcodeableRow(): Promise<void> {
    await this.barcodeableBox().locator('xpath=..').click({ force: true });
    await this.waitForAngularStable(5_000);
  }

  /** Clicks the Active box and waits for its confirmation prompt to appear. */
  @step('Click Active and wait for its prompt')
  async clickActiveExpectPrompt(): Promise<{ title: string; text: string; buttons: string[] }> {
    await this.activeBox().click();
    await this.page.locator(S.prompt).waitFor({ state: 'visible', timeout: 10_000 });
    return this.readPrompt();
  }

  /** The open prompt's heading, full text and button names. */
  @step('Read the open prompt')
  async readPrompt(): Promise<{ title: string; text: string; buttons: string[] }> {
    return this.page.locator(S.prompt).first().evaluate((el) => ({
      title: ((el.querySelector('h1, h2, h3, [role="heading"]') as HTMLElement | null)?.innerText ?? '').trim(),
      text: ((el as HTMLElement).innerText ?? '').replace(/\s+/g, ' ').trim(),
      buttons: Array.from(el.querySelectorAll('button'))
        .map((b) => (b.innerText ?? '').trim())
        .filter((t) => t.length > 0),
    }));
  }

  /** Whether a confirmation prompt is open. */
  @step('Read whether a prompt is open')
  async isPromptOpen(): Promise<boolean> {
    return (await this.page.locator(S.prompt).count()) > 0;
  }

  /** Dismisses the prompt with Cancel and waits for it to go. */
  @step('Cancel the prompt')
  async cancelPrompt(): Promise<void> {
    const prompt = this.page.locator(S.prompt).first();
    await prompt.getByRole('button', { name: S.NAME_CANCEL, exact: true }).click();
    await prompt.waitFor({ state: 'hidden', timeout: 10_000 });
    await this.waitForAngularStable(5_000);
  }

  /** Confirms the prompt with Ok and waits for it to go. */
  @step('Confirm the prompt with Ok')
  async confirmPrompt(): Promise<void> {
    const prompt = this.page.locator(S.prompt).first();
    await prompt.getByRole('button', { name: S.NAME_OK, exact: true }).click();
    await prompt.waitFor({ state: 'hidden', timeout: 10_000 });
    await this.waitForAngularStable(5_000);
  }

  // ---------------------------------------------------------------- Sub Class organization prompt

  /**
   * The prompt a Sub Class organization save raises before the update goes out: a second
   * dialog named by its heading, asking whether the change should reach the existing items.
   */
  itemsPrompt(): Locator {
    return this.page.getByRole('dialog', { name: S.TITLE_ITEMS_PROMPT, exact: true });
  }

  /** Clicks Save on a Sub Class organization change and waits for the items prompt. */
  @step('Click Save and wait for the items prompt')
  async clickSaveExpectItemsPrompt(): Promise<{ title: string; text: string; buttons: string[] }> {
    const save = this.dialogSaveButton();
    await expect(save, 'Save should be enabled once a change was made').toBeEnabled({ timeout: 10_000 });
    await save.click();
    await this.itemsPrompt().waitFor({ state: 'visible', timeout: 10_000 });
    return this.readItemsPrompt();
  }

  /** The open items prompt's heading, full text and answer names (the header X is not an answer). */
  @step('Read the items prompt')
  async readItemsPrompt(): Promise<{ title: string; text: string; buttons: string[] }> {
    return this.itemsPrompt().evaluate((el, closeName: string) => {
      const heading = el.querySelector('h1, h2, h3, [role="heading"]') as HTMLElement | null;
      return {
        title: (heading?.innerText ?? '').trim(),
        text: ((el as HTMLElement).innerText ?? '').replace(/\s+/g, ' ').trim(),
        buttons: Array.from(el.querySelectorAll('button'))
          .map((b) => (b.innerText ?? '').trim())
          .filter((t) => t.length > 0 && t !== closeName),
      };
    }, S.NAME_CLOSE);
  }

  /**
   * Clicks Save and reports what followed: the items prompt opened, the update went straight
   * out (it is then left to finish), or neither happened within the wait.
   */
  @step('Click Save and read whether the items prompt opened')
  async clickSaveAndReadOutcome(): Promise<'prompt' | 'saved' | 'none'> {
    const save = this.dialogSaveButton();
    await expect(save, 'Save should be enabled once a change was made').toBeEnabled({ timeout: 10_000 });
    const promptOpened = this.itemsPrompt()
      .waitFor({ state: 'visible', timeout: 30_000 })
      .then(() => 'prompt' as const)
      .catch(() => 'none' as const);
    const updated = this.page
      .waitForResponse((r) => this.isUpdateRequest(r.url(), r.request().method()), { timeout: 30_000 })
      .then(() => 'saved' as const)
      .catch(() => 'none' as const);
    await save.click();
    const outcome = await Promise.race([promptOpened, updated]);
    if (outcome === 'saved') {
      await expect(save, 'Save should disable again after the update').toBeDisabled({ timeout: 15_000 });
    }
    return outcome;
  }

  /** Whether the items prompt is open. */
  @step('Read whether the items prompt is open')
  async isItemsPromptOpen(): Promise<boolean> {
    return (await this.itemsPrompt().count()) > 0;
  }

  /** Closes the items prompt with its header X, leaving the change unsaved. */
  @step('Close the items prompt without answering')
  async dismissItemsPrompt(): Promise<void> {
    const prompt = this.itemsPrompt();
    await prompt.getByRole('button', { name: S.NAME_CLOSE, exact: true }).click();
    await prompt.waitFor({ state: 'hidden', timeout: 10_000 });
    await this.waitForAngularStable(5_000);
  }

  /**
   * Answers the items prompt and reports what came back: the status of the update request
   * and every message that appeared after the answer. The caller asserts the outcome, so a
   * refused answer fails on the status with a precise diff instead of a wait that times out.
   */
  @step('Answer the items prompt and read the outcome')
  async answerItemsPrompt(answer: typeof S.NAME_YES | typeof S.NAME_NO): Promise<{ status: number; messages: string[] }> {
    const prompt = this.itemsPrompt();
    await prompt.waitFor({ state: 'visible', timeout: 10_000 });
    await this.armToastRecorder();
    const updated = this.page.waitForResponse(
      (r) => this.isUpdateRequest(r.url(), r.request().method()),
      { timeout: 30_000 },
    );
    await prompt.getByRole('button', { name: answer, exact: true }).click();
    const res = await updated;
    await prompt.waitFor({ state: 'hidden', timeout: 10_000 });
    await expect
      .poll(async () => (await this.readRecordedToasts()).length, {
        timeout: 15_000,
        message: 'a message should follow the answer',
      })
      .toBeGreaterThan(0);
    await this.waitForAngularStable(5_000);
    return { status: res.status(), messages: await this.readRecordedToasts() };
  }

  /**
   * Runs an action and reports how many update requests went out while it ran and while the
   * form settled afterwards. A zero here is only half of a "nothing was saved" proof; the
   * caller still reads the value back after a reopen.
   */
  @step('Count the update requests an action sends')
  async countUpdateRequestsDuring(action: () => Promise<void>): Promise<number> {
    let requests = 0;
    const onRequest = (req: { url: () => string; method: () => string }) => {
      if (this.isUpdateRequest(req.url(), req.method())) requests += 1;
    };
    this.page.on('request', onRequest);
    try {
      await action();
      await this.waitForAngularStable(5_000);
    } finally {
      this.page.off('request', onRequest);
    }
    return requests;
  }

  // ---------------------------------------------------------------- dropdowns (hierarchy, type, service)

  private comboTriggers(): Locator {
    return this.dialog().locator(S.comboTrigger);
  }

  /** The name dropdown of a level above the edited one (Item segment: first, third, fifth trigger). */
  hierarchyCombo(level: HierarchyLevel): Locator {
    const index: Record<HierarchyLevel, number> = { 'Sub Category': 0, Class: 2, 'Sub Class': 4 };
    return this.comboTriggers().nth(index[level]);
  }

  /** The Service Type dropdown of a level above the edited one (the trigger after its name). */
  levelServiceCombo(level: HierarchyLevel): Locator {
    const index: Record<HierarchyLevel, number> = { 'Sub Category': 1, Class: 3, 'Sub Class': 5 };
    return this.comboTriggers().nth(index[level]);
  }

  /** The edited level's own Service Type dropdown — the last trigger on every segment. */
  ownServiceTypeCombo(): Locator {
    return this.comboTriggers().last();
  }

  /** The edited level's own Product Type dropdown — the trigger before the Service Type. */
  @step('Find the Product Type dropdown of the edited level')
  async ownProductTypeCombo(): Promise<Locator> {
    const count = await this.comboTriggers().count();
    return this.comboTriggers().nth(count - 2);
  }

  /** The displayed value of a dropdown trigger (empty when nothing is chosen). */
  @step('Read a dropdown value')
  async readComboValue(combo: Locator): Promise<string> {
    return ((await combo.innerText()) ?? '').trim().split('\n')[0] ?? '';
  }

  /** Opens a dropdown and reads its entries, leaving the list open. */
  @step('Open a dropdown and read its entries')
  async openComboAndReadOptions(combo: Locator): Promise<string[]> {
    await combo.click();
    const listbox = this.page.locator(S.listbox);
    await listbox.waitFor({ state: 'visible', timeout: 5_000 });
    const options = await listbox.locator(S.option).allTextContents();
    return options.map((o) => o.trim()).filter((o) => o.length > 0);
  }

  /** Closes the open dropdown list with Escape. */
  @step('Close the open dropdown list')
  async closeOpenList(): Promise<void> {
    await this.page.keyboard.press('Escape');
    await this.page.locator(S.listbox).waitFor({ state: 'hidden', timeout: 5_000 });
  }

  /** Chooses an entry in the OPEN list and lets the form settle. */
  @step('Choose an entry in the open list')
  async chooseInOpenList(name: string): Promise<void> {
    await this.page.getByRole('option', { name, exact: true }).click();
    await this.page.locator(S.listbox).waitFor({ state: 'hidden', timeout: 5_000 });
    await this.waitForAngularStable(5_000);
  }

  /**
   * Chooses an entry in the OPEN hierarchy list and returns the identifier of the product the
   * form fetched for that choice (the app reads the chosen level by its identifier). The
   * dialog's own "Product Code ID" text for that level should show the same number.
   */
  @step('Choose a hierarchy entry and read the identifier it fetched')
  async chooseInOpenListAndReadFetchedIdentifier(name: string): Promise<string> {
    const fetched = this.page.waitForRequest(
      (req) => req.method() === 'GET' && S.PRODUCT_BY_IDENTIFIER.test(req.url()),
      { timeout: 15_000 },
    );
    await this.chooseInOpenList(name);
    const match = S.PRODUCT_BY_IDENTIFIER.exec((await fetched).url());
    return match?.[1] ?? '';
  }

  /** Opens a dropdown and chooses an entry. */
  @step('Choose a dropdown entry')
  async chooseComboOption(combo: Locator, name: string): Promise<void> {
    await this.openComboAndReadOptions(combo);
    await this.chooseInOpenList(name);
  }

  // ---------------------------------------------------------------- Product Organization (dialog)

  /** The organization trigger of a section: the Sub Class section's comes first, the Item's last. */
  orgTrigger(section: OrgSection): Locator {
    const triggers = this.dialog().locator(S.btnOrgPopover);
    return section === 'Item' ? triggers.last() : triggers.first();
  }

  /** The value the organization control shows ("None", one country, or a comma list). */
  @step('Read the Product Organization value')
  async readOrgValue(section: OrgSection): Promise<string> {
    return ((await this.orgTrigger(section).innerText()) ?? '').trim().split('\n')[0] ?? '';
  }

  private orgPopper(): Locator {
    return this.page.locator(S.popper).last();
  }

  /** Opens the organization list of a section. */
  @step('Open the Product Organization list')
  async openOrgList(section: OrgSection): Promise<void> {
    await this.orgTrigger(section).click();
    await this.orgPopper().waitFor({ state: 'visible', timeout: 5_000 });
  }

  /** Every entry of the open organization list. */
  @step('Read the Product Organization entries')
  async readOrgEntries(): Promise<string[]> {
    const entries = await this.orgPopper().locator(S.option).allTextContents();
    return entries.map((e) => e.trim()).filter((e) => e.length > 0);
  }

  /** The entries of the open organization list that carry the checked mark. */
  @step('Read the checked Product Organization entries')
  async readOrgCheckedEntries(): Promise<string[]> {
    return this.orgPopper().locator(S.option).evaluateAll((els, mark: string) =>
      els
        .filter((el) => el.querySelector(mark) !== null)
        .map((el) => ((el as HTMLElement).innerText ?? '').trim()),
    S.orgCheckedMark);
  }

  /** Clicks an entry in the open organization list and lets the form settle. */
  @step('Click a Product Organization entry')
  async clickOrgEntry(name: string): Promise<void> {
    await this.orgPopper().getByRole('option', { name, exact: true }).click();
    await this.waitForAngularStable(5_000);
  }

  /** Closes the organization list with Escape. */
  @step('Close the Product Organization list')
  async closeOrgList(): Promise<void> {
    await this.page.keyboard.press('Escape');
    await this.page.locator(S.popper).waitFor({ state: 'hidden', timeout: 5_000 });
  }

  // ---------------------------------------------------------------- Translations tab

  /** The row of one language on the Translations tab. */
  translationRow(language: string): Locator {
    return this.dialog().locator('tbody tr').filter({ hasText: language }).first();
  }

  /** The Name box of one language row. */
  translationNameBox(language: string): Locator {
    return this.translationRow(language).locator('input').nth(0);
  }

  /** The Description box of one language row. */
  translationDescriptionBox(language: string): Locator {
    return this.translationRow(language).locator('input').nth(1);
  }

  /** The language of every translation row and how many boxes it carries. */
  @step('Read the translation rows')
  async readTranslationRows(): Promise<{ language: string; boxes: number }[]> {
    return this.dialog().locator('tbody tr').evaluateAll((rows) =>
      rows.map((row) => ({
        language: (((row as HTMLElement).innerText ?? '').split('\n')[0] ?? '').trim(),
        boxes: row.querySelectorAll('input').length,
      })),
    );
  }

  /** Every translation box value in row order (Name then Description per language). */
  @step('Read every translation box')
  async readTranslationValues(): Promise<string[]> {
    return this.dialog().locator('tbody tr input').evaluateAll((els) =>
      els.map((el) => (el as HTMLInputElement).value),
    );
  }

  /** The header names of the grid shown inside the dialog (Translations or History). */
  @step('Read the header of the grid inside the dialog')
  async readDialogGridHeaderNames(): Promise<string[]> {
    const names = await this.dialog().locator('thead th').allTextContents();
    return names.map((n) => n.trim()).filter((n) => n.length > 0);
  }

  // ---------------------------------------------------------------- update saves

  /** Starts recording the text of every message that appears, however briefly. */
  @step('Start recording every message that appears')
  async armToastRecorder(): Promise<void> {
    await this.page.evaluate((toastSelector) => {
      const w = window as unknown as { __recordedToasts?: string[]; __toastObserver?: MutationObserver };
      w.__recordedToasts = [];
      w.__toastObserver?.disconnect();
      const record = (node: Node) => {
        if (!(node instanceof HTMLElement)) return;
        const toasts = node.matches(toastSelector) ? [node] : Array.from(node.querySelectorAll<HTMLElement>(toastSelector));
        for (const toast of toasts) {
          const text = (toast.innerText ?? '').replace(/\s+/g, ' ').trim();
          if (text) w.__recordedToasts?.push(text);
        }
      };
      w.__toastObserver = new MutationObserver((mutations) => {
        for (const m of mutations) m.addedNodes.forEach(record);
      });
      w.__toastObserver.observe(document.body, { childList: true, subtree: true });
    }, S.TOAST);
  }

  /** The messages recorded since the recorder was armed. */
  @step('Read the recorded messages')
  async readRecordedToasts(): Promise<string[]> {
    return this.page.evaluate(
      () => (window as unknown as { __recordedToasts?: string[] }).__recordedToasts ?? [],
    );
  }

  private isUpdateRequest(url: string, method: string): boolean {
    return url.includes(S.UPDATE_ENDPOINT) && method === 'PUT';
  }

  /**
   * Saves the open details dialog and confirms the update landed: Save must be enabled, the
   * update request must return 200, the confirmation message must appear, and Save must
   * disable again while the dialog stays open. The response is never treated as proof on its
   * own — persistence is proven by the caller reading the value back after a reopen or reload.
   * Returns the moment Save was clicked, for History rows that must carry the save time.
   */
  @step('Save the product code and confirm the update landed')
  async saveAndConfirm(): Promise<number> {
    const save = this.dialogSaveButton();
    await expect(save, 'Save should be enabled once a change was made').toBeEnabled({ timeout: 10_000 });
    const updated = this.page.waitForResponse(
      (r) => this.isUpdateRequest(r.url(), r.request().method()),
      { timeout: 30_000 },
    );
    // Record from this moment so the wait below counts only the message THIS save raises: a
    // message from an earlier save in the same test can still be on screen, and a presence
    // check would match it (or, with two on screen, resolve to more than one element).
    await this.armToastRecorder();
    const clickedAt = Date.now();
    await save.click();
    const res = await updated;
    expect(res.status(), 'the update request should return 200').toBe(200);
    await expect
      .poll(async () => (await this.readRecordedToasts()).filter((t) => t.includes(S.TOAST_CODE_UPDATED)).length, {
        timeout: 15_000,
        message: 'the update message should appear after this save',
      })
      .toBeGreaterThan(0);
    await expect(save, 'Save should disable again after the update').toBeDisabled({ timeout: 15_000 });
    await expect(this.dialog(), 'the dialog should stay open after the update').toBeVisible();
    return clickedAt;
  }

  /**
   * Double-clicks Save and reports how many update requests went out and how many
   * confirmation messages appeared. The second click must land on a disabled button.
   */
  @step('Double-click Save and count the updates it caused')
  async doubleClickSaveAndConfirm(): Promise<{ requests: number; toasts: number }> {
    const save = this.dialogSaveButton();
    await expect(save, 'Save should be enabled once a change was made').toBeEnabled({ timeout: 10_000 });
    let requests = 0;
    const onRequest = (req: { url: () => string; method: () => string }) => {
      if (this.isUpdateRequest(req.url(), req.method())) requests += 1;
    };
    this.page.on('request', onRequest);
    await this.armToastRecorder();
    const updated = this.page.waitForResponse(
      (r) => this.isUpdateRequest(r.url(), r.request().method()),
      { timeout: 30_000 },
    );
    await save.dblclick();
    const res = await updated;
    expect(res.status(), 'the update request should return 200').toBe(200);
    await expect(save, 'Save should disable again after the update').toBeDisabled({ timeout: 15_000 });
    await expect
      .poll(async () => (await this.readRecordedToasts()).filter((t) => t.includes(S.TOAST_CODE_UPDATED)).length, {
        timeout: 15_000,
      })
      .toBeGreaterThan(0);
    await this.waitForAngularStable(5_000);
    this.page.off('request', onRequest);
    const toasts = (await this.readRecordedToasts()).filter((t) => t.includes(S.TOAST_CODE_UPDATED)).length;
    return { requests, toasts };
  }

  /**
   * Clicks Save while the update request is cut off before it reaches the server (one
   * request only), then returns every message that appeared. The dialog, the edits and the
   * Save state are left for the caller to read; the next Save goes through normally.
   */
  @step('Click Save while its request is cut off')
  async saveWithRequestCutOff(): Promise<string[]> {
    const save = this.dialogSaveButton();
    await expect(save, 'Save should be enabled once a change was made').toBeEnabled({ timeout: 10_000 });
    const pattern = `**${S.UPDATE_ENDPOINT}*`;
    await this.page.route(pattern, (route) => route.abort('aborted'), { times: 1 });
    await this.armToastRecorder();
    const failed = this.page.waitForEvent('requestfailed', {
      predicate: (req) => this.isUpdateRequest(req.url(), req.method()),
      timeout: 30_000,
    });
    await save.click();
    await failed;
    await this.page.unroute(pattern);
    await expect
      .poll(async () => (await this.readRecordedToasts()).some((t) => t.includes(S.TOAST_REQUEST_ABORTED)), {
        timeout: 15_000,
      })
      .toBe(true);
    await this.waitForAngularStable(5_000);
    return this.readRecordedToasts();
  }

  /** Starts counting the requests the page sends to backend paths containing the fragment. */
  startRequestCounter(pathFragment: string): { read: () => number; stop: () => void } {
    let count = 0;
    const onRequest = (req: { url: () => string }) => {
      if (req.url().includes(pathFragment)) count += 1;
    };
    this.page.on('request', onRequest);
    return { read: () => count, stop: () => this.page.off('request', onRequest) };
  }

  // ---------------------------------------------------------------- History grid (inside the dialog)

  /** Waits for the History grid's header to render and its rows to settle. */
  @step('Wait for the History grid to load')
  async waitForHistoryGrid(): Promise<void> {
    await expect(this.dialog().locator('thead th').first()).toBeVisible({ timeout: 60_000 });
    await this.waitForNoSkeletons();
  }

  /** Runs an action that re-reads the history from the server and waits for that read. */
  private async withHistoryReload(action: () => Promise<void>): Promise<void> {
    const reread = this.page.waitForResponse((r) => r.url().includes(S.HISTORY_ENDPOINT), { timeout: 30_000 });
    await action();
    await reread;
    await this.waitForNoSkeletons();
  }

  /** Every History row as an array of cell texts, read in one call. */
  @step('Read the History grid rows')
  async readHistoryRows(): Promise<string[][]> {
    return this.dialog().locator('tbody tr').evaluateAll((rows) =>
      rows.map((row) => Array.from(row.querySelectorAll('td')).map((td) => ((td as HTMLElement).innerText ?? '').trim())),
    );
  }

  /** The top History row keyed by column name. */
  @step('Read the top History row')
  async readHistoryTopRow(): Promise<HistoryRow> {
    return this.dialog().evaluate((dlg) => {
      const headers = Array.from(dlg.querySelectorAll('thead th')).map((th) => ((th as HTMLElement).innerText ?? '').trim());
      const cells = Array.from(dlg.querySelector('tbody tr')?.querySelectorAll('td') ?? []).map(
        (td) => ((td as HTMLElement).innerText ?? '').trim(),
      );
      const row: Record<string, string> = {};
      headers.forEach((h, i) => {
        if (h) row[h] = cells[i] ?? '';
      });
      return row;
    });
  }

  /** Number of History rows currently rendered. */
  @step('Count the History rows')
  async readHistoryRowCount(): Promise<number> {
    return this.dialog().locator('tbody tr').count();
  }

  private historyRowsPerPageCombo(): Locator {
    return this.dialog().locator('button[role="combobox"]').filter({ hasText: /^(10|20|30|40|50)$/ }).first();
  }

  /** The History grid's rows-per-page value. */
  @step('Read the History rows-per-page value')
  async readHistoryRowsPerPage(): Promise<string> {
    return ((await this.historyRowsPerPageCombo().textContent()) ?? '').trim();
  }

  /** Chooses a History rows-per-page value and waits for the server re-read. */
  @step('Choose a History rows-per-page value')
  async chooseHistoryRowsPerPage(size: string): Promise<void> {
    await this.historyRowsPerPageCombo().click();
    await this.page.locator(S.listbox).waitFor({ state: 'visible', timeout: 5_000 });
    await this.withHistoryReload(async () => {
      await this.page.getByRole('option', { name: size, exact: true }).click();
    });
  }

  private historyPageBox(): Locator {
    return this.dialog().locator(S.inpHistoryPage);
  }

  /** The page number shown in the History pager. */
  @step('Read the History page number')
  async readHistoryPageNumber(): Promise<string> {
    return (await this.historyPageBox().inputValue()).trim();
  }

  /** Total History pages, parsed from the "/ N" text beside the page box. */
  @step('Read the History page count')
  async readHistoryTotalPages(): Promise<number | null> {
    return this.historyPageBox().evaluate((box) => {
      const holder = box.closest('div')?.parentElement;
      const num = ((holder as HTMLElement | null)?.innerText ?? '').match(/\/\s*([\d,]+)/)?.[1];
      return num !== undefined ? Number(num.replace(/,/g, '')) : null;
    });
  }

  private historyPager(name: string): Locator {
    return this.dialog().getByRole('button', { name, exact: true });
  }

  /** Whether one of the four History pager buttons is enabled. */
  @step('Read a History pager button state')
  async isHistoryPagerEnabled(name: string): Promise<boolean> {
    return this.historyPager(name).isEnabled();
  }

  /** Clicks a History pager button and waits for the server re-read. */
  @step('Move to another History page')
  async clickHistoryPager(name: string): Promise<void> {
    await this.withHistoryReload(() => this.historyPager(name).click());
  }

  /** Types a page number into the History page box, presses Enter and waits for the re-read. */
  @step('Type a History page number')
  async typeHistoryPageNumber(pageNumber: string): Promise<void> {
    const box = this.historyPageBox();
    await box.click();
    await this.page.keyboard.press('Control+a');
    await box.pressSequentially(pageNumber, { delay: 40 });
    await this.withHistoryReload(() => this.page.keyboard.press('Enter'));
  }

  /** Opens the header menu of one History column (the header button's name is the column). */
  @step('Open a History column menu')
  async openHistoryColumnMenu(columnName: string): Promise<void> {
    await this.dialog().locator('thead').getByRole('button', { name: columnName, exact: true }).first().click();
    await this.page.locator(P.menu).waitFor({ state: 'visible', timeout: 5_000 });
  }

  /** Clicks a sort entry in the open column menu and waits for the server re-read. */
  @step('Sort the History grid through the open menu')
  async clickHistorySort(direction: 'Sort ascending' | 'Sort descending'): Promise<void> {
    await this.withHistoryReload(() =>
      this.page.locator(P.menuItemAny).filter({ hasText: direction }).first().click(),
    );
  }

  /** Clicks "Hide column" in the open column menu (a local change, no server read). */
  @step('Hide the column through the open menu')
  async clickHideColumnInOpenMenu(): Promise<void> {
    await this.page.locator(P.menuItemAny).filter({ hasText: 'Hide column' }).first().click();
    await this.page.locator(P.menu).waitFor({ state: 'hidden', timeout: 5_000 });
    await this.waitForAngularStable(5_000);
  }

  /** Opens the Grid Options menu of the History tab (the one inside the dialog). */
  @step('Open the Grid Options of the History tab')
  async openHistoryGridOptions(): Promise<void> {
    await this.dialog().getByRole('button', { name: P.NAME_GRID_OPTIONS, exact: true }).click();
    await this.page.locator(P.menu).waitFor({ state: 'visible', timeout: 5_000 });
  }

  /** Clicks one cell of a History row (zero-based row and column). */
  @step('Click a History cell')
  async clickHistoryCell(row: number, col: number): Promise<void> {
    await this.dialog().locator('tbody tr').nth(row).locator('td').nth(col).click();
    await this.waitForAngularStable(5_000);
  }

  /** Clicks the last cell of a History row — a spot away from the first cell. */
  @step('Click elsewhere on a History row')
  async clickHistoryRowElsewhere(row: number): Promise<void> {
    await this.dialog().locator('tbody tr').nth(row).locator('td').last().click();
    await this.waitForAngularStable(5_000);
  }

  /** How many editors (boxes, text areas, editable cells) sit inside the History rows. */
  @step('Count the editors open inside the History grid')
  async readHistoryEditorCount(): Promise<number> {
    return this.dialog().locator('tbody input, tbody textarea, tbody select, tbody [contenteditable="true"]').count();
  }

  /** Whether any dropdown list or menu is open on the page. */
  @step('Read whether a list or menu is open')
  async isAnyListOrMenuOpen(): Promise<boolean> {
    return (await this.page.locator(`${S.listbox}, ${P.menu}`).count()) > 0;
  }

  // ---------------------------------------------------------------- the page grid behind the dialog

  /** The first page-grid row (never a dialog row) whose cell in a column equals the value, keyed by column. */
  @step('Read a page-grid row by one of its cells')
  async readPageGridRowWhere(column: string, value: string): Promise<HistoryRow | null> {
    return this.page.evaluate(({ column: col, value: wanted }) => {
      const outside = (el: Element) => el.closest('[role="dialog"]') === null;
      const headers = Array.from(document.querySelectorAll('thead th'))
        .filter(outside)
        .map((th) => ((th as HTMLElement).innerText ?? '').trim());
      const keyIndex = headers.indexOf(col);
      if (keyIndex < 0) return null;
      for (const tr of Array.from(document.querySelectorAll('tbody tr')).filter(outside)) {
        const cells = Array.from(tr.querySelectorAll('td')).map((td) => ((td as HTMLElement).innerText ?? '').trim());
        if (cells[keyIndex] !== wanted) continue;
        const row: Record<string, string> = {};
        headers.forEach((h, i) => {
          if (h) row[h] = cells[i] ?? '';
        });
        return row;
      }
      return null;
    }, { column, value });
  }

  /** One page-grid row keyed by column, found by its Product Code ID. */
  @step('Read a page-grid row by its product code identifier')
  async readPageGridRow(productCodeId: string): Promise<HistoryRow | null> {
    return this.readPageGridRowWhere('Product Code ID', productCodeId);
  }

  /** Every value of one page-grid column, top to bottom, ignoring any grid inside the dialog. */
  @step('Read a page-grid column behind the dialog')
  async readPageGridColumn(columnName: string): Promise<string[]> {
    return this.page.evaluate((col) => {
      const outside = (el: Element) => el.closest('[role="dialog"]') === null;
      const headers = Array.from(document.querySelectorAll('thead th'))
        .filter(outside)
        .map((th) => ((th as HTMLElement).innerText ?? '').trim());
      const idx = headers.indexOf(col);
      if (idx < 0) return [];
      return Array.from(document.querySelectorAll('tbody tr'))
        .filter(outside)
        .map((tr) => ((tr.querySelectorAll('td').item(idx) as HTMLElement | null)?.innerText ?? '').trim());
    }, columnName);
  }

  /** The page grid's header names, ignoring any grid inside the dialog. */
  @step('Read the page-grid header behind the dialog')
  async readPageGridHeaderNames(): Promise<string[]> {
    return this.page.evaluate(() =>
      Array.from(document.querySelectorAll('thead th'))
        .filter((el) => el.closest('[role="dialog"]') === null)
        .map((th) => ((th as HTMLElement).innerText ?? '').trim())
        .filter((t) => t.length > 0),
    );
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

  /** The optional identifier box, present in both dialogs. */
  dialogOracleItemNumberBox(): Locator {
    return this.dialog().getByPlaceholder(S.PLACEHOLDER_ORACLE_ITEM_NUMBER).first();
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
   * Fills the Add caret's Category form, which creates a whole chain in one save: the four
   * level names, the Sub Class description, the item name and description, and the same
   * type/service pairing on every level. The five type/service pairs are the form's dropdown
   * triggers in section order (two per level, type before service), so each pair is chosen
   * by its position rather than by a placeholder that disappears once a type is picked.
   */
  @step('Fill the Category form with a whole product chain')
  async fillCategoryChainForm(chain: {
    category: string;
    subCategory: string;
    className: string;
    subClass: string;
    subClassDescription: string;
    item: string;
    itemDescription: string;
    productType: string;
    serviceType: string;
  }): Promise<void> {
    await this.typeByKeys(this.dialogBox(S.PLACEHOLDER_CATEGORY_NAME), chain.category);
    await this.typeByKeys(this.dialogBox(S.PLACEHOLDER_SUB_CATEGORY_NAME), chain.subCategory);
    await this.typeByKeys(this.dialogBox(S.PLACEHOLDER_CLASS_NAME), chain.className);
    await this.typeByKeys(this.dialogBox(S.PLACEHOLDER_SUB_CLASS_NAME), chain.subClass);
    await this.typeByKeys(this.subClassDescriptionBox(), chain.subClassDescription);
    await this.typeByKeys(this.dialogNameBox(), chain.item);
    await this.typeByKeys(this.dialogDescriptionBox(), chain.itemDescription);
    for (let pair = 0; pair < 5; pair++) {
      await this.chooseComboOption(this.comboTriggers().nth(pair * 2), chain.productType);
      await this.chooseComboOption(this.comboTriggers().nth(pair * 2 + 1), chain.serviceType);
    }
  }

  /**
   * Saves the completed add form and confirms the create landed: Save must be enabled, the
   * create request must return success, the dialog must close, and the confirmation toast
   * must appear. The create response is never treated as proof on its own — persistence is
   * proven by the caller searching the new code's name back after the grid reloads.
   */
  @step('Save the new product code and confirm it was created')
  async saveNewCodeAndConfirm(): Promise<void> {
    const save = this.dialogSaveButton();
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
