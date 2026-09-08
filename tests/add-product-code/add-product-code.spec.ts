import { test, expect } from '../../src/fixtures/pages.fixture';
import { ProductCodePage } from '../../src/pages/item-search/product-code.page';
import {
  ISR_OFFICE,
  ISR_SEARCH_WORD,
  ISR_SEGMENTS,
  ISR_PRODUCT_TYPES,
  ISR_LABOR_SERVICE_SAMPLES,
  ISR_ADD_CODE,
  ISR_CODE_FIELD_LIMITS,
} from '../../src/data/item-search/item-search';

/**
 * Item Search — Add Product Code (NM-2257): the add flow behind the Products page toolbar,
 * office 1101.
 *
 * The toolbar mounts only with a selected row, so every test runs a search and selects the
 * first row itself. Two tests save: they create a per-run unique product code and prove it by
 * searching the name back, which leaves that code on the office — a product code has no hard
 * delete. Everything else closes the dialog without saving, which discards silently.
 *
 * Name and Item Description hold at most 50 characters and Oracle Item Number at most 10, per
 * NM-1742, which sized the product Name and Description database columns to match the legacy
 * sizes the Oracle integration expects. The older "256 characters" figure in NM-1386 is out of
 * date and must not be used as the expected value.
 *
 * The View Product Code dialog, its tabs and the availability button are a separate sub-task and
 * live in product-code.spec.ts, which shares this test-case numbering sequence.
 */
test.describe.configure({ timeout: 300_000 });

test.describe('Item Search Add Product Code @item-search @product-code @add-product-code', () => {
  let pc: ProductCodePage;

  test.beforeEach(async ({ authenticatedSession, config }) => {
    pc = new ProductCodePage(authenticatedSession.page, config);
    await pc.ensureCleanSearch(ISR_OFFICE);
  });

  /** Runs a word search and selects the first row — the toolbar precondition for every case. */
  const searchAndSelect = async (): Promise<void> => {
    await pc.typeAnyField(ISR_SEARCH_WORD);
    await pc.clickSearchAndWait((n) => n !== null && n > 0);
    await pc.selectFirstRow();
  };

  test('TC-ISR-PCD-006: Add Product Code opens a required-empty form with Save held back', async ({ dependencyGate }) => {
    dependencyGate([]);
    await searchAndSelect();
    await pc.openAddDialog();
    // The add flow opens a single tab scoped to Item.
    const tabs = await pc.readDialogTabs();
    expect(tabs).toEqual(['Item']);
    expect(await pc.dialogNameBox().inputValue()).toBe('');
    // The paired type selectors rest on their placeholders, service locked until a type
    // is chosen.
    await expect(pc.productTypeCombo()).toBeVisible();
    expect(await pc.isServiceTypeEnabled()).toBe(false);
    expect(await pc.isDialogSaveEnabled()).toBe(false);
    await pc.closeDialog();
  });


  test('TC-ISR-PCD-007: Choosing a Product Type unlocks and filters Service Type', async ({ dependencyGate }) => {
    dependencyGate([]);
    await searchAndSelect();
    await pc.openAddDialog();
    // The ten types are a fixed set but their rendered order shifted between two live
    // reads a day apart — membership is the contract, so the compare is sort-agnostic.
    const offered = await pc.readProductTypeOptions();
    expect([...offered].sort()).toEqual([...ISR_PRODUCT_TYPES].sort());
    await pc.chooseProductType('LABOR');
    await expect.poll(async () => await pc.isServiceTypeEnabled(), { timeout: 15_000 }).toBe(true);
    const services = await pc.readServiceTypeOptions();
    expect(services.length).toBeGreaterThanOrEqual(10);
    for (const sample of ISR_LABOR_SERVICE_SAMPLES) {
      expect(services).toContain(sample);
    }
    await pc.closeDialog();
  });


  test('TC-ISR-PCD-008: The Add segment menu opens per-segment forms', async ({ dependencyGate }) => {
    dependencyGate([]);
    await searchAndSelect();
    await pc.openAddSegmentMenu();
    expect(await pc.readOpenMenuItems()).toEqual([...ISR_SEGMENTS]);
    // Category works on the add side — its single tab renames to the segment.
    await pc.chooseSegment('Category');
    expect(await pc.readActiveTab()).toBe('Category');
    await pc.closeDialog();
    expect(await pc.readRowCount()).toBeGreaterThan(0);
  });


  test('TC-ISR-PCD-011: A completed Add Product Code form saves and the new code is found again', async ({ dependencyGate }) => {
    dependencyGate([]);
    await searchAndSelect();
    // A per-run unique suffix so repeated runs never collide on the same name.
    const unique = Date.now();
    const name = `${ISR_ADD_CODE.namePrefix} ${unique}`;
    const description = `${ISR_ADD_CODE.descriptionPrefix} ${unique}`;
    await pc.openAddDialog();
    await pc.fillAddForm({
      name,
      description,
      productType: ISR_ADD_CODE.productType,
      serviceType: ISR_ADD_CODE.serviceType,
    });
    await pc.saveNewCodeAndConfirm();
    // The save call is never the proof — reset the search and look the new code up again
    // after the grid reloads. The code's name is what lands in the Item column.
    await pc.ensureCleanSearch(ISR_OFFICE);
    await pc.typeAnyField(name);
    expect(await pc.clickSearchAndWait((n) => n === 1)).toBe(1);
    expect(await pc.readColumnValues('Item')).toEqual([name]);
  });


  test('TC-ISR-PCD-012: The text fields stop accepting input at their maximum lengths', async ({ dependencyGate }) => {
    dependencyGate([]);
    await searchAndSelect();
    await pc.openAddDialog();
    // Type well past each limit — only the part that fits should land, and the field should
    // not complain: the box simply stops accepting keystrokes.
    const name = await pc.typeAndReadBack(pc.dialogNameBox(), 'A'.repeat(ISR_CODE_FIELD_LIMITS.name + 10));
    expect(name).toHaveLength(ISR_CODE_FIELD_LIMITS.name);
    expect(await pc.isFieldFlaggedInvalid(pc.dialogNameBox())).toBe(false);

    const description = await pc.typeAndReadBack(
      pc.dialogDescriptionBox(),
      'B'.repeat(ISR_CODE_FIELD_LIMITS.itemDescription + 20),
    );
    expect(description).toHaveLength(ISR_CODE_FIELD_LIMITS.itemDescription);
    expect(await pc.isFieldFlaggedInvalid(pc.dialogDescriptionBox())).toBe(false);

    const oracle = await pc.typeAndReadBack(
      pc.dialogOracleItemNumberBox(),
      '9'.repeat(ISR_CODE_FIELD_LIMITS.oracleItemNumber + 5),
    );
    expect(oracle).toHaveLength(ISR_CODE_FIELD_LIMITS.oracleItemNumber);
    await pc.closeDialog();
  });


  test('TC-ISR-PCD-013: An over-length value that bypasses the typing limit cannot be saved', async ({ dependencyGate }) => {
    dependencyGate([]);
    await searchAndSelect();
    await pc.openAddDialog();
    const tooLong = 'C'.repeat(ISR_CODE_FIELD_LIMITS.name + 10);
    // A paste is not subject to the per-keystroke limit, so the whole over-long value lands.
    expect(await pc.pasteIntoBox(pc.dialogNameBox(), tooLong)).toHaveLength(tooLong.length);
    expect(await pc.pasteIntoBox(pc.dialogDescriptionBox(), tooLong)).toHaveLength(tooLong.length);
    // Fill the rest of the form so Save is held back only by the two over-long values.
    await pc.selectProductType('LABOR');
    await expect.poll(async () => await pc.isServiceTypeEnabled(), { timeout: 15_000 }).toBe(true);
    await pc.selectServiceType('Application Development');
    expect(await pc.isFieldFlaggedInvalid(pc.dialogNameBox())).toBe(true);
    expect(await pc.isFieldFlaggedInvalid(pc.dialogDescriptionBox())).toBe(true);
    expect(await pc.isDialogSaveEnabled()).toBe(false);

    // Same paste route, this time within the limit. Without this step a broken paste would
    // look exactly like the app refusing the value, so it is what makes the checks above mean
    // something: the route works, therefore the refusal above is the form's own doing.
    const unique = Date.now();
    await pc.pasteIntoBox(pc.dialogNameBox(), `${ISR_ADD_CODE.namePrefix} ${unique}`);
    await pc.pasteIntoBox(pc.dialogDescriptionBox(), `${ISR_ADD_CODE.descriptionPrefix} ${unique}`);
    expect(await pc.isFieldFlaggedInvalid(pc.dialogNameBox())).toBe(false);
    expect(await pc.isFieldFlaggedInvalid(pc.dialogDescriptionBox())).toBe(false);
    await expect.poll(async () => await pc.isDialogSaveEnabled(), { timeout: 10_000 }).toBe(true);
    // Nothing is saved here — closing discards the form.
    await pc.closeDialog();
  });


  test('TC-ISR-PCD-014: A name at exactly the maximum length saves and reads back complete', async ({ dependencyGate }) => {
    dependencyGate([]);
    await searchAndSelect();
    // A per-run unique name padded out to exactly the limit, so the boundary value itself is
    // what makes the round trip. NM-1742 sized the database column to this length; if it were
    // ever narrowed again, or the save trimmed a character, the search-back below would show it.
    const unique = Date.now();
    const name = `${ISR_ADD_CODE.namePrefix} ${unique}`
      .padEnd(ISR_CODE_FIELD_LIMITS.name, 'X')
      .slice(0, ISR_CODE_FIELD_LIMITS.name);
    expect(name).toHaveLength(ISR_CODE_FIELD_LIMITS.name);
    await pc.openAddDialog();
    await pc.fillAddForm({
      name,
      description: `${ISR_ADD_CODE.descriptionPrefix} ${unique}`,
      productType: ISR_ADD_CODE.productType,
      serviceType: ISR_ADD_CODE.serviceType,
    });
    expect(await pc.dialogNameBox().inputValue()).toBe(name);
    await pc.saveNewCodeAndConfirm();
    await pc.ensureCleanSearch(ISR_OFFICE);
    await pc.typeAnyField(name);
    expect(await pc.clickSearchAndWait((n) => n === 1)).toBe(1);
    // The whole name came back, not a shortened one.
    expect(await pc.readColumnValues('Item')).toEqual([name]);
  });

  test('TC-ISR-PCD-015: Closing the Add dialog with a part-filled form discards it silently', async ({ dependencyGate }) => {
    dependencyGate([]);
    await searchAndSelect();
    await pc.openAddDialog();
    const unique = `${ISR_ADD_CODE.namePrefix} ${Date.now()}`;
    await pc.typeAndReadBack(pc.dialogNameBox(), unique);
    expect(await pc.dialogNameBox().inputValue()).toBe(unique);
    await pc.readProductTypeOptions();
    await pc.chooseProductType('EQUIPMENT');
    await pc.closeDialog();
    // No unsaved-changes guard: the dialog just goes.
    expect(await pc.page.locator('[role="alertdialog"]').count()).toBe(0);
    // Reopening shows a clean form — the typed name and the chosen type are both gone.
    await pc.openAddDialog();
    expect(await pc.dialogNameBox().inputValue()).toBe('');
    await expect(pc.productTypeCombo()).toBeVisible();
    expect(await pc.isServiceTypeEnabled()).toBe(false);
    await pc.closeDialog();
  });
});
