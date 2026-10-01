import { test, expect } from '../../src/fixtures/pages.fixture';
import { ProductCodePage } from '../../src/pages/item-search/product-code.page';
import { phase, verify } from '../../src/fixtures/report-steps';
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

  /**
   * Runs a word search and selects the first row — the toolbar precondition for every case.
   * The phase lives here rather than at each call site so the eight tests share one label.
   */
  const searchAndSelect = (): Promise<void> =>
    phase('Search the Products page and select a result row', async () => {
      await pc.typeAnyField(ISR_SEARCH_WORD);
      await pc.clickSearchAndWait((n) => n !== null && n > 0);
      await pc.selectFirstRow();
    });

  test('TC-ISR-APC-001: Add Product Code opens a required-empty form with Save held back', { tag: '@C105818' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    await searchAndSelect();
    await phase('Open the Add Product Code form', () => pc.openAddDialog());
    await verify('The form opens on a single Item tab', async () => {
      // The add flow opens a single tab scoped to Item.
      const tabs = await pc.readDialogTabs();
      expect(tabs).toEqual(['Item']);
    });
    await verify('The required fields are empty and Save is held back', async () => {
      expect(await pc.dialogNameBox().inputValue()).toBe('');
      // The paired type selectors rest on their placeholders, service locked until a type
      // is chosen.
      await expect(pc.productTypeCombo()).toBeVisible();
      expect(await pc.isServiceTypeEnabled()).toBe(false);
      expect(await pc.isDialogSaveEnabled()).toBe(false);
    });
    await phase('Close the form', () => pc.closeDialog());
  });


  test('TC-ISR-APC-002: Choosing a Product Type unlocks and filters Service Type', { tag: '@C105819' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    await searchAndSelect();
    await phase('Open the Add Product Code form', () => pc.openAddDialog());
    const offered = await phase('Open the Product Type list', () => pc.readProductTypeOptions());
    await verify('Every product type is offered', async () => {
      // The ten types are a fixed set but their rendered order shifted between two live
      // reads a day apart — membership is the contract, so the compare is sort-agnostic.
      expect([...offered].sort()).toEqual([...ISR_PRODUCT_TYPES].sort());
    });
    await phase('Choose the LABOR product type', () => pc.chooseProductType('LABOR'));
    await verify('Service Type unlocks', async () => {
      await expect.poll(async () => await pc.isServiceTypeEnabled(), { timeout: 15_000 }).toBe(true);
    });
    const services = await phase('Open the Service Type list', () => pc.readServiceTypeOptions());
    await verify('The service list is filtered to labor services', async () => {
      expect(services.length).toBeGreaterThanOrEqual(10);
      for (const sample of ISR_LABOR_SERVICE_SAMPLES) {
        expect(services).toContain(sample);
      }
    });
    await phase('Close the form', () => pc.closeDialog());
  });


  test('TC-ISR-APC-003: The Add segment menu opens per-segment forms', { tag: '@C105820' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    await searchAndSelect();
    await phase('Open the Add segment menu', () => pc.openAddSegmentMenu());
    await verify('The menu offers every segment', async () => {
      expect(await pc.readOpenMenuItems()).toEqual([...ISR_SEGMENTS]);
    });
    // Category works on the add side — its single tab renames to the segment.
    await phase('Choose the Category segment', () => pc.chooseSegment('Category'));
    await verify('The form opens on the Category tab', async () => {
      expect(await pc.readActiveTab()).toBe('Category');
    });
    await phase('Close the form', () => pc.closeDialog());
    await verify('The result grid is still populated behind the form', async () => {
      expect(await pc.readRowCount()).toBeGreaterThan(0);
    });
  });


  test('TC-ISR-APC-004: A completed Add Product Code form saves and the new code is found again', { tag: '@C105821' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    await searchAndSelect();
    // A per-run unique suffix so repeated runs never collide on the same name.
    const unique = Date.now();
    const name = `${ISR_ADD_CODE.namePrefix} ${unique}`;
    const description = `${ISR_ADD_CODE.descriptionPrefix} ${unique}`;
    await phase('Open the Add Product Code form', () => pc.openAddDialog());
    await phase('Fill the new product code details', () =>
      pc.fillAddForm({
        name,
        description,
        productType: ISR_ADD_CODE.productType,
        serviceType: ISR_ADD_CODE.serviceType,
      }));
    await phase('Save the new product code', () => pc.saveNewCodeAndConfirm());
    // The save call is never the proof — reset the search and look the new code up again
    // after the grid reloads. The code's name is what lands in the Item column.
    await phase('Reset the search and look the new code up by name', async () => {
      await pc.ensureCleanSearch(ISR_OFFICE);
      await pc.typeAnyField(name);
    });
    await verify('The saved code comes back as the only match', async () => {
      expect(await pc.clickSearchAndWait((n) => n === 1)).toBe(1);
      expect(await pc.readColumnValues('Item')).toEqual([name]);
    });
  });


  test('TC-ISR-APC-005: The text fields stop accepting input at their maximum lengths', { tag: '@C105822' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    await searchAndSelect();
    await phase('Open the Add Product Code form', () => pc.openAddDialog());
    // Type well past each limit — only the part that fits should land, and the field should
    // not complain: the box simply stops accepting keystrokes.
    const name = await phase('Type 60 characters into Name', () =>
      pc.typeAndReadBack(pc.dialogNameBox(), 'A'.repeat(ISR_CODE_FIELD_LIMITS.name + 10)));
    await verify('Name keeps 50 characters and is not flagged invalid', async () => {
      expect(name).toHaveLength(ISR_CODE_FIELD_LIMITS.name);
      expect(await pc.isFieldFlaggedInvalid(pc.dialogNameBox())).toBe(false);
    });

    const description = await phase('Type 70 characters into Item Description', () =>
      pc.typeAndReadBack(
        pc.dialogDescriptionBox(),
        'B'.repeat(ISR_CODE_FIELD_LIMITS.itemDescription + 20),
      ));
    await verify('Item Description keeps 50 characters and is not flagged invalid', async () => {
      expect(description).toHaveLength(ISR_CODE_FIELD_LIMITS.itemDescription);
      expect(await pc.isFieldFlaggedInvalid(pc.dialogDescriptionBox())).toBe(false);
    });

    const oracle = await phase('Type 15 digits into Oracle Item Number', () =>
      pc.typeAndReadBack(
        pc.dialogOracleItemNumberBox(),
        '9'.repeat(ISR_CODE_FIELD_LIMITS.oracleItemNumber + 5),
      ));
    await verify('Oracle Item Number keeps 10 characters', async () => {
      expect(oracle).toHaveLength(ISR_CODE_FIELD_LIMITS.oracleItemNumber);
    });
    await phase('Close the form', () => pc.closeDialog());
  });


  test('TC-ISR-APC-006: An over-length value that bypasses the typing limit cannot be saved', { tag: '@C105823' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    await searchAndSelect();
    await phase('Open the Add Product Code form', () => pc.openAddDialog());
    const tooLong = 'C'.repeat(ISR_CODE_FIELD_LIMITS.name + 10);
    // A scripted value assignment is not subject to the box's maxlength, so the whole
    // over-long value lands. A real OS paste is NOT such a route — the browser truncates
    // Control+V to the maxlength exactly as it truncates typing (proven live).
    await verify('A 60-character value gets past the typing limit into both boxes', async () => {
      expect(await pc.scriptedFill(pc.dialogNameBox(), tooLong)).toHaveLength(tooLong.length);
      expect(await pc.scriptedFill(pc.dialogDescriptionBox(), tooLong)).toHaveLength(tooLong.length);
    });
    // Fill the rest of the form so Save is held back only by the two over-long values.
    await phase('Complete the rest of the required fields', async () => {
      await pc.selectProductType('LABOR');
      await expect.poll(async () => await pc.isServiceTypeEnabled(), { timeout: 15_000 }).toBe(true);
      await pc.selectServiceType('Application Development');
    });
    await verify('Both over-long fields are flagged invalid and Save is refused', async () => {
      expect(await pc.isFieldFlaggedInvalid(pc.dialogNameBox())).toBe(true);
      expect(await pc.isFieldFlaggedInvalid(pc.dialogDescriptionBox())).toBe(true);
      expect(await pc.isDialogSaveEnabled()).toBe(false);
    });

    // Same scripted route, this time within the limit. Without this step a broken route would
    // look exactly like the app refusing the value, so it is what makes the checks above mean
    // something: the route works, therefore the refusal above is the form's own doing.
    const unique = Date.now();
    await phase('Replace both values with in-limit ones by the same route', async () => {
      await pc.scriptedFill(pc.dialogNameBox(), `${ISR_ADD_CODE.namePrefix} ${unique}`);
      await pc.scriptedFill(pc.dialogDescriptionBox(), `${ISR_ADD_CODE.descriptionPrefix} ${unique}`);
    });
    await verify('Both fields clear their invalid flag and Save is offered', async () => {
      expect(await pc.isFieldFlaggedInvalid(pc.dialogNameBox())).toBe(false);
      expect(await pc.isFieldFlaggedInvalid(pc.dialogDescriptionBox())).toBe(false);
      await expect.poll(async () => await pc.isDialogSaveEnabled(), { timeout: 10_000 }).toBe(true);
    });
    // Nothing is saved here — closing discards the form.
    await phase('Close the form without saving', () => pc.closeDialog());
  });


  test('TC-ISR-APC-007: A name at exactly the maximum length saves and reads back complete', { tag: '@C105824' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    await searchAndSelect();
    // A per-run unique name padded out to exactly the limit, so the boundary value itself is
    // what makes the round trip. NM-1742 sized the database column to this length; if it were
    // ever narrowed again, or the save trimmed a character, the search-back below would show it.
    const unique = Date.now();
    const name = `${ISR_ADD_CODE.namePrefix} ${unique}`
      .padEnd(ISR_CODE_FIELD_LIMITS.name, 'X')
      .slice(0, ISR_CODE_FIELD_LIMITS.name);
    await verify('The prepared name sits exactly at the 50-character limit', async () => {
      expect(name).toHaveLength(ISR_CODE_FIELD_LIMITS.name);
    });
    await phase('Open the Add Product Code form', () => pc.openAddDialog());
    await phase('Fill the form with a name at exactly the 50-character limit', () =>
      pc.fillAddForm({
        name,
        description: `${ISR_ADD_CODE.descriptionPrefix} ${unique}`,
        productType: ISR_ADD_CODE.productType,
        serviceType: ISR_ADD_CODE.serviceType,
      }));
    await verify('The Name box holds all 50 characters', async () => {
      expect(await pc.dialogNameBox().inputValue()).toBe(name);
    });
    await phase('Save the new product code', () => pc.saveNewCodeAndConfirm());
    await phase('Reset the search and look the 50-character name up', async () => {
      await pc.ensureCleanSearch(ISR_OFFICE);
      await pc.typeAnyField(name);
    });
    await verify('The name round-tripped whole, not shortened', async () => {
      expect(await pc.clickSearchAndWait((n) => n === 1)).toBe(1);
      // The whole name came back, not a shortened one.
      expect(await pc.readColumnValues('Item')).toEqual([name]);
    });
  });

  test('TC-ISR-APC-008: Closing the Add dialog with a part-filled form discards it silently', { tag: '@C105825' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    await searchAndSelect();
    await phase('Open the Add Product Code form', () => pc.openAddDialog());
    const unique = `${ISR_ADD_CODE.namePrefix} ${Date.now()}`;
    await phase('Type a name into the Name box', () => pc.typeAndReadBack(pc.dialogNameBox(), unique));
    await verify('The typed name appears in the box', async () => {
      expect(await pc.dialogNameBox().inputValue()).toBe(unique);
    });
    await phase('Choose a Product Type', async () => {
      await pc.readProductTypeOptions();
      await pc.chooseProductType('EQUIPMENT');
    });
    await phase('Close the part-filled form', () => pc.closeDialog());
    await verify('No unsaved-changes prompt appears', async () => {
      // No unsaved-changes guard: the dialog just goes.
      expect(await pc.page.locator('[role="alertdialog"]').count()).toBe(0);
    });
    // Reopening shows a clean form — the typed name and the chosen type are both gone.
    await phase('Reopen the Add Product Code form', () => pc.openAddDialog());
    await verify('The form is empty again and Service Type is locked', async () => {
      expect(await pc.dialogNameBox().inputValue()).toBe('');
      await expect(pc.productTypeCombo()).toBeVisible();
      expect(await pc.isServiceTypeEnabled()).toBe(false);
    });
    await phase('Close the form', () => pc.closeDialog());
  });
});
