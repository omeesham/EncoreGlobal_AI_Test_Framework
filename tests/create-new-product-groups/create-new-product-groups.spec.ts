import { test, expect } from '../../src/fixtures/pages.fixture';
import { ProductGroupsPage } from '../../src/pages/product-groups/product-groups.page';
import { ISR_OFFICE } from '../../src/data/products/products';
import {
  PGR_ADD_GROUP,
  PGR_ADD_LIMITS,
  PGR_ADD_VARIANTS,
  PGR_EXISTING_GROUP,
  PGR_PICKER,
  PGR_SERVICE_TYPES,
} from '../../src/data/product-groups/product-groups';

/**
 * Create new Product Groups (NM-2259) — the Add Product Group page on office 1101.
 *
 * The Add page is a route, not a dialog, reached from the Add button on the group list
 * page (the list page itself is the sibling sub-task NM-2258, in
 * `tests/search-for-product-groups/`).
 *
 * The cases cover the form's required set and Save gating, both text boxes' caps and
 * rejected inputs, the Service Type list, the server's uniqueness rules, every control of
 * the sub-class picker (search, Labor filter, sort order, Reset, collapse) and both ways of
 * adding an item (double-click and drag), the Active flag's effect on the saved group, and
 * both exits. Three cases save for real and prove it by finding the group again on the list
 * page; the save call is never the proof, the search-back is.
 */
test.describe.configure({ timeout: 300_000 });

/** Fills the four required inputs so Save enables; returns the sub-class that was added. */
async function completeRequiredSet(
  pgr: ProductGroupsPage,
  name: string,
  description: string,
  serviceType: string = PGR_ADD_GROUP.serviceType,
): Promise<string> {
  await pgr.typeAddName(name);
  await pgr.typeAddDescription(description);
  await pgr.selectServiceType(serviceType);
  await pgr.waitForCatalogCount(1, Number.MAX_SAFE_INTEGER);
  const added = await pgr.addSubClassByDoubleClick();
  await expect.poll(() => pgr.isAddSaveEnabled(), { timeout: 10_000 }).toBe(true);
  return added;
}

test.describe('Item Search Add Product Group page — fields and create @item-search @product-groups', () => {
  let pgr: ProductGroupsPage;

  test.beforeEach(async ({ authenticatedSession, config }) => {
    pgr = new ProductGroupsPage(authenticatedSession.page, config);
    await pgr.ensureCleanSearch(ISR_OFFICE);
  });

  test('TC-ISR-APG-001: The Add page opens with a held-back Save', async ({ dependencyGate }) => {
    dependencyGate([]);
    await pgr.clickAdd();
    expect(await pgr.addNameBox().inputValue()).toBe('');
    expect(await pgr.addDescriptionBox().inputValue()).toBe('');
    expect(await pgr.isAddActiveChecked()).toBe(true);
    await expect(pgr.addCancelButton()).toBeEnabled();
    expect(await pgr.isAddSaveEnabled()).toBe(false);
    // A name alone does not complete the required set — Save stays held back.
    await pgr.typeAddName('X');
    expect(await pgr.isAddSaveEnabled()).toBe(false);
    // Leave through Cancel so the typed character is discarded.
    await pgr.clickAddCancel();
  });

  test('TC-ISR-APG-002: The sub-class picker shows its two panels', async ({ dependencyGate }) => {
    dependencyGate([]);
    await pgr.clickAdd();
    const text = await pgr.readAddPageText();
    expect(text).toContain('Sub Classes');
    // The live instruction uses non-breaking hyphens ("double‑click", "sub‑classes"),
    // so the check is hyphen-agnostic rather than a literal string compare.
    expect(text).toMatch(/Drag or double.click items from the left to add sub.classes/);
    // Structure only at this depth: the left panel offers its own search plus the form's
    // two text boxes.
    expect(await pgr.page.getByRole('textbox').count()).toBeGreaterThanOrEqual(3);
    await pgr.clickAddCancel();
  });

  test('TC-ISR-APG-003: Cancel leaves the Add page without saving', async ({ dependencyGate }) => {
    dependencyGate([]);
    await pgr.clickAdd();
    await pgr.typeAddName('X');
    await pgr.clickAddCancel();
    // The list page returned with no warning prompt about the typed input.
    expect(await pgr.page.locator('[role="alertdialog"]').count()).toBe(0);
    await pgr.clickAdd();
    expect(await pgr.addNameBox().inputValue()).toBe('');
    await pgr.clickAddCancel();
  });

  test('TC-ISR-APG-004: A completed Add page saves and the new group is found again', async ({ dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(420_000);
    // A per-run unique suffix so repeated runs never collide on the same name.
    const unique = Date.now();
    const name = `${PGR_ADD_GROUP.namePrefix} ${unique}`;
    const description = `${PGR_ADD_GROUP.descriptionPrefix} ${unique}`;
    await pgr.clickAdd();
    await pgr.typeAddName(name);
    await pgr.typeAddDescription(description);
    await pgr.selectServiceType(PGR_ADD_GROUP.serviceType);
    // A group needs at least one sub-class; the first available item is added by
    // double-click. The catalog stays as it was — the picker copies, it does not move.
    await pgr.waitForCatalogCount(1, Number.MAX_SAFE_INTEGER);
    await pgr.addFirstSubClass();
    expect(await pgr.isAddSaveEnabled()).toBe(true);
    await pgr.saveNewGroupAndConfirm();
    // The save call is never the proof — reset the list and search the new name back
    // after the grid reloads.
    await pgr.ensureCleanSearch(ISR_OFFICE);
    await pgr.typeSearch(name);
    expect(await pgr.clickSearchAndWait((n) => n === 1)).toBe(1);
    expect(await pgr.readColumnValues('Name')).toEqual([name]);
    expect(await pgr.readColumnValues('Service Type')).toEqual([PGR_ADD_GROUP.serviceType]);
    // The group is created active, and the list's Active filter is on, so it shows Active.
    expect(await pgr.readColumnValues('Status')).toEqual(['Active']);
  });

  test('TC-ISR-APG-005: Name accepts exactly 50 characters and drops the rest silently', async ({ dependencyGate }) => {
    dependencyGate([]);
    const max = PGR_ADD_LIMITS.nameMaxLength;
    await pgr.clickAdd();
    await pgr.typeAddName('N'.repeat(max));
    expect(await pgr.readAddName()).toHaveLength(max);
    // The 51st keystroke is dropped, with no message and no invalid mark.
    await pgr.appendToAddName('X');
    expect(await pgr.readAddName()).toBe('N'.repeat(max));
    expect(await pgr.isAddNameInvalid()).toBe(false);
    // A paste longer than the cap is cut to the cap.
    await pgr.pasteAddName('P'.repeat(max + 10));
    expect(await pgr.readAddName()).toBe('P'.repeat(max));
    // A capped box must still let the cursor leave — the rejection is silent, not a trap.
    expect(await pgr.tabOutOfBox('name')).toBe(true);
    await pgr.clickAddCancel();
  });

  test('TC-ISR-APG-006: Description accepts exactly 100 characters and drops the rest silently', async ({ dependencyGate }) => {
    dependencyGate([]);
    const max = PGR_ADD_LIMITS.descriptionMaxLength;
    await pgr.clickAdd();
    await pgr.pasteAddDescription('D'.repeat(max + 20));
    expect(await pgr.readAddDescription()).toBe('D'.repeat(max));
    // Typing at the cap adds nothing.
    await pgr.appendToAddDescription('Y');
    expect(await pgr.readAddDescription()).toBe('D'.repeat(max));
    expect(await pgr.tabOutOfBox('description')).toBe(true);
    await pgr.clickAddCancel();
  });

  test('TC-ISR-APG-007: Clearing a filled Name by either method holds Save back and marks the box invalid', async ({ dependencyGate }) => {
    dependencyGate([]);
    const name = 'Clear check';
    await pgr.clickAdd();
    await completeRequiredSet(pgr, name, 'clear check');
    // Select-all and Delete — the path that once left Save enabled on the Edit page (NM-1907).
    await pgr.clearAddNameAtOnce();
    await expect.poll(() => pgr.isAddNameInvalid(), { timeout: 5_000 }).toBe(true);
    expect(await pgr.isAddSaveEnabled()).toBe(false);
    // The invalid state must not trap the cursor.
    expect(await pgr.tabOutOfBox('name')).toBe(true);
    await pgr.typeAddName(name);
    await expect.poll(() => pgr.isAddSaveEnabled(), { timeout: 5_000 }).toBe(true);
    expect(await pgr.isAddNameInvalid()).toBe(false);
    // Character by character.
    await pgr.clearAddNameByBackspace();
    await expect.poll(() => pgr.isAddNameInvalid(), { timeout: 5_000 }).toBe(true);
    expect(await pgr.isAddSaveEnabled()).toBe(false);
    await pgr.typeAddName(name);
    await expect.poll(() => pgr.isAddSaveEnabled(), { timeout: 5_000 }).toBe(true);
    await pgr.clickAddCancel();
  });

  test('TC-ISR-APG-008: A whitespace-only Name counts as empty; a padded Name is accepted', async ({ dependencyGate }) => {
    dependencyGate([]);
    await pgr.clickAdd();
    await completeRequiredSet(pgr, 'Padding check', 'padding check');
    await pgr.pasteAddName('   ');
    await expect.poll(() => pgr.isAddNameInvalid(), { timeout: 5_000 }).toBe(true);
    expect(await pgr.isAddSaveEnabled()).toBe(false);
    // Surrounding spaces are accepted here; the server trims them (TC-ISR-APG-011 proves it).
    await pgr.pasteAddName('  Padding check  ');
    await expect.poll(() => pgr.isAddSaveEnabled(), { timeout: 5_000 }).toBe(true);
    expect(await pgr.isAddNameInvalid()).toBe(false);
    await pgr.clickAddCancel();
  });

  test('TC-ISR-APG-009: Every required field gates Save, and Active does not', async ({ dependencyGate }) => {
    dependencyGate([]);
    await pgr.clickAdd();
    await pgr.typeAddName('Gate check');
    await pgr.typeAddDescription('gate check');
    await pgr.selectServiceType(PGR_ADD_GROUP.serviceType);
    // Three of four set — still held back.
    expect(await pgr.isAddSaveEnabled()).toBe(false);
    await pgr.waitForCatalogCount(1, Number.MAX_SAFE_INTEGER);
    await pgr.addSubClassByDoubleClick();
    await expect.poll(() => pgr.isAddSaveEnabled(), { timeout: 5_000 }).toBe(true);
    // Description out → held back; back in → enabled.
    await pgr.pasteAddDescription('');
    await expect.poll(() => pgr.isAddSaveEnabled(), { timeout: 5_000 }).toBe(false);
    await pgr.pasteAddDescription('gate check');
    await expect.poll(() => pgr.isAddSaveEnabled(), { timeout: 5_000 }).toBe(true);
    // Last sub-class out → held back and the instruction returns; one back in → enabled.
    await pgr.removeAddedSubClass();
    await expect.poll(() => pgr.isSubClassInstructionShown(), { timeout: 5_000 }).toBe(true);
    expect(await pgr.isAddSaveEnabled()).toBe(false);
    await pgr.addSubClassByDoubleClick();
    await expect.poll(() => pgr.isAddSaveEnabled(), { timeout: 5_000 }).toBe(true);
    // Active is optional: Save stays enabled either way.
    await pgr.setAddActive(false);
    expect(await pgr.isAddSaveEnabled()).toBe(true);
    await pgr.setAddActive(true);
    expect(await pgr.isAddSaveEnabled()).toBe(true);
    await pgr.clickAddCancel();
  });

  test('TC-ISR-APG-010: The Service Type list offers its 90 options with no search box, and first, middle and last all select', async ({ dependencyGate }) => {
    dependencyGate([]);
    await pgr.clickAdd();
    const { options, hasSearchBox } = await pgr.readServiceTypeOptions();
    expect(options).toEqual([...PGR_SERVICE_TYPES]);
    expect(hasSearchBox).toBe(false);
    const first = PGR_SERVICE_TYPES[0];
    const last = PGR_ADD_VARIANTS.lastServiceType;
    await pgr.selectServiceType(first);
    expect(await pgr.readServiceType()).toBe(first);
    await pgr.selectLastServiceTypeByKeyboard();
    expect(await pgr.readServiceType()).toBe(last);
    await pgr.selectServiceType(PGR_ADD_VARIANTS.middleServiceType);
    expect(await pgr.readServiceType()).toBe(PGR_ADD_VARIANTS.middleServiceType);
    await pgr.clickAddCancel();
  });

  test('TC-ISR-APG-011: A name already used by another group is rejected, with or without a trailing space', async ({ dependencyGate }) => {
    dependencyGate([]);
    const unique = Date.now();
    const description = `duplicate name check ${unique}`;
    await pgr.clickAdd();
    await completeRequiredSet(pgr, PGR_EXISTING_GROUP.name, description);
    const expected = `Product group name '${PGR_EXISTING_GROUP.name}' or group description '${description}' already exists.`;
    expect(await pgr.saveExpectingRejection()).toBe(expected);
    // The form keeps its values and Save stays enabled so the user can correct it.
    expect(await pgr.readAddName()).toBe(PGR_EXISTING_GROUP.name);
    expect(await pgr.isAddSaveEnabled()).toBe(true);
    // The same name with a trailing space is trimmed before the comparison — same rejection,
    // and the message shows the name without the space.
    await pgr.pasteAddName(`${PGR_EXISTING_GROUP.name} `);
    expect(await pgr.saveExpectingRejection()).toBe(expected);
    await pgr.clickAddCancel();
  });

  test('TC-ISR-APG-012: A description already used by another group is rejected even with a new name', async ({ dependencyGate }) => {
    dependencyGate([]);
    const name = `${PGR_ADD_GROUP.namePrefix} ${Date.now()}`;
    await pgr.clickAdd();
    await completeRequiredSet(pgr, name, PGR_EXISTING_GROUP.description);
    // The rule NM-1851 asked for: a description already in use is rejected at creation, the same way a duplicate name is.
    expect(await pgr.saveExpectingRejection())
      .toBe(`Product group name '${name}' or group description '${PGR_EXISTING_GROUP.description}' already exists.`);
    expect(await pgr.isAddSaveEnabled()).toBe(true);
    await pgr.clickAddCancel();
  });

  test('TC-ISR-APG-013: The picker search filters the catalog by substring regardless of case and empties on no match', async ({ dependencyGate }) => {
    dependencyGate([]);
    await pgr.clickAdd();
    const full = await pgr.waitForCatalogCount(1, Number.MAX_SAFE_INTEGER);
    await pgr.typePickerSearch(PGR_PICKER.searchWord);
    const filtered = await pgr.waitForCatalogCount(1, full - 1);
    const rows = await pgr.readCatalogTexts();
    const word = PGR_PICKER.searchWord.toLowerCase();
    expect(rows.filter((r) => !r.toLowerCase().includes(word))).toEqual([]);
    // Case does not matter — the same rows come back for the upper-case word.
    await pgr.typePickerSearch(PGR_PICKER.searchWord.toUpperCase());
    expect(await pgr.waitForCatalogCount(filtered)).toBe(filtered);
    expect(await pgr.readCatalogTexts()).toEqual(rows);
    // No match → no rows; the box still holds the term.
    await pgr.typePickerSearch(PGR_PICKER.noMatchWord);
    expect(await pgr.waitForCatalogCount(0)).toBe(0);
    expect(await pgr.readPickerSearch()).toBe(PGR_PICKER.noMatchWord);
    // Clearing brings the whole catalog back.
    await pgr.typePickerSearch('');
    expect(await pgr.waitForCatalogCount(full)).toBe(full);
    await pgr.clickAddCancel();
  });

  test('TC-ISR-APG-014: The Labor filter narrows the catalog and unchecking restores it', async ({ dependencyGate }) => {
    dependencyGate([]);
    await pgr.clickAdd();
    const full = await pgr.waitForCatalogCount(1, Number.MAX_SAFE_INTEGER);
    const firstBefore = await pgr.readCatalogFirst();
    await pgr.setPickerLabor(true);
    await pgr.waitForCatalogCount(1, full - 1);
    // The filter picks labor sub-classes by category, so the check is on the set changing,
    // never on the word "Labor" in every row.
    expect(await pgr.readCatalogFirst()).not.toBe(firstBefore);
    await pgr.setPickerLabor(false);
    expect(await pgr.waitForCatalogCount(full)).toBe(full);
    expect(await pgr.readCatalogFirst()).toBe(firstBefore);
    await pgr.clickAddCancel();
  });

  test('TC-ISR-APG-015: Sort order flips the catalog between ascending and descending', async ({ dependencyGate }) => {
    dependencyGate([]);
    await pgr.clickAdd();
    await pgr.waitForCatalogCount(1, Number.MAX_SAFE_INTEGER);
    expect(await pgr.readPickerSort()).toBe(PGR_PICKER.sortAscending);
    const first = await pgr.readCatalogFirst();
    const last = await pgr.readCatalogLast();
    expect(first).not.toBe(last);
    await pgr.selectPickerSort(PGR_PICKER.sortDescending);
    // Content-anchored: the ends swap.
    await expect.poll(() => pgr.readCatalogFirst(), { timeout: 15_000 }).toBe(last);
    expect(await pgr.readCatalogLast()).toBe(first);
    await pgr.selectPickerSort(PGR_PICKER.sortAscending);
    await expect.poll(() => pgr.readCatalogFirst(), { timeout: 15_000 }).toBe(first);
    expect(await pgr.readCatalogLast()).toBe(last);
    await pgr.clickAddCancel();
  });

  test('TC-ISR-APG-016: Reset clears the picker\'s search, filter and sort but keeps an added sub-class', async ({ dependencyGate }) => {
    dependencyGate([]);
    await pgr.clickAdd();
    const full = await pgr.waitForCatalogCount(1, Number.MAX_SAFE_INTEGER);
    const added = await pgr.addSubClassByDoubleClick();
    expect(await pgr.readAddedSubClasses()).toEqual([added]);
    // All three panel controls set at once.
    await pgr.typePickerSearch(PGR_PICKER.searchWord);
    await pgr.setPickerLabor(true);
    await pgr.selectPickerSort(PGR_PICKER.sortDescending);
    expect(await pgr.readPickerSearch()).toBe(PGR_PICKER.searchWord);
    await pgr.clickPickerReset();
    // Reset clears the panel's own controls only (NM-2050) — the added sub-class stays.
    await expect.poll(() => pgr.readPickerSearch(), { timeout: 5_000 }).toBe('');
    await expect.poll(() => pgr.isPickerLaborChecked(), { timeout: 5_000 }).toBe(false);
    await expect.poll(() => pgr.readPickerSort(), { timeout: 5_000 }).toBe(PGR_PICKER.sortAscending);
    expect(await pgr.waitForCatalogCount(full)).toBe(full);
    expect(await pgr.readAddedSubClasses()).toEqual([added]);
    await pgr.clickAddCancel();
  });

  test('TC-ISR-APG-017: Double-click adds an item once and the × control removes it', async ({ dependencyGate }) => {
    dependencyGate([]);
    await pgr.clickAdd();
    const full = await pgr.waitForCatalogCount(1, Number.MAX_SAFE_INTEGER);
    const added = await pgr.addSubClassByDoubleClick();
    expect(await pgr.readAddedSubClasses()).toEqual([added]);
    expect(await pgr.isSubClassInstructionShown()).toBe(false);
    // The picker copies — the catalog still lists the item.
    expect(await pgr.readCatalogCount()).toBe(full);
    // A second double-click on the same item adds nothing.
    await pgr.addSubClassByDoubleClick();
    expect(await pgr.readAddedSubClasses()).toEqual([added]);
    await pgr.removeAddedSubClass();
    await expect.poll(() => pgr.readAddedSubClasses(), { timeout: 5_000 }).toEqual([]);
    expect(await pgr.isSubClassInstructionShown()).toBe(true);
    expect(await pgr.readCatalogCount()).toBe(full);
    await pgr.clickAddCancel();
  });

  test('TC-ISR-APG-018: Dragging an item onto the Sub Classes area adds it', async ({ dependencyGate }) => {
    dependencyGate([]);
    await pgr.clickAdd();
    await pgr.waitForCatalogCount(1, Number.MAX_SAFE_INTEGER);
    expect(await pgr.isSubClassInstructionShown()).toBe(true);
    const dragged = await pgr.dragSubClassToGroup();
    await expect.poll(() => pgr.readAddedSubClasses(), { timeout: 10_000 }).toEqual([dragged]);
    expect(await pgr.isSubClassInstructionShown()).toBe(false);
    await pgr.clickAddCancel();
  });

  test('TC-ISR-APG-019: The divider button collapses and expands the sub-class panel', async ({ dependencyGate }) => {
    dependencyGate([]);
    await pgr.clickAdd();
    await pgr.waitForCatalogCount(1, Number.MAX_SAFE_INTEGER);
    const shown = await pgr.readAddNameGeometry();
    await pgr.collapsePanel();
    // The form takes the panel's room: the Name box starts further left and is wider.
    await expect.poll(async () => (await pgr.readAddNameGeometry()).width, { timeout: 5_000 })
      .toBeGreaterThan(shown.width);
    expect((await pgr.readAddNameGeometry()).left).toBeLessThan(shown.left);
    await pgr.expandPanel();
    await expect.poll(() => pgr.readAddNameGeometry(), { timeout: 5_000 }).toEqual(shown);
    await pgr.clickAddCancel();
  });

  test('TC-ISR-APG-020: A group saved with Active cleared is created inactive and found with the list\'s Active filter cleared', async ({ dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(420_000);
    const unique = Date.now();
    const name = `${PGR_ADD_VARIANTS.inactiveNamePrefix} ${unique}`;
    await pgr.clickAdd();
    await completeRequiredSet(pgr, name, `Automated inactive group ${unique}`);
    await pgr.setAddActive(false);
    await pgr.saveNewGroupAndConfirm();
    await pgr.ensureCleanSearch(ISR_OFFICE);
    await pgr.typeSearch(name);
    try {
      // The list's Active checkbox is a two-way status filter: cleared shows inactive groups
      // only, so the new group appears there with its Inactive status …
      await pgr.setActiveFilter(false);
      expect(await pgr.clickSearchAndWait((n) => n === 1)).toBe(1);
      expect(await pgr.readColumnValues('Name')).toEqual([name]);
      expect(await pgr.readColumnValues('Status')).toEqual(['Inactive']);
      // … and disappears again once the filter is back on (a real one-to-zero transition,
      // not a count that was already zero).
      await pgr.setActiveFilter(true);
      expect(await pgr.clickSearchAndWait((n) => n === 0)).toBe(0);
      expect(await pgr.readRowCount()).toBe(0);
    } finally {
      await pgr.setActiveFilter(true);
    }
  });

  test('TC-ISR-APG-021: Special characters in the name are stored verbatim and the last Service Type saves', async ({ dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(420_000);
    const unique = Date.now();
    const name = `${PGR_ADD_VARIANTS.specialNamePrefix} ${PGR_ADD_VARIANTS.specialCharsNamePart} ${unique}`;
    await pgr.clickAdd();
    await completeRequiredSet(pgr, name, `Automated special-character group ${unique}`, PGR_ADD_VARIANTS.lastServiceType);
    await pgr.saveNewGroupAndConfirm();
    await pgr.ensureCleanSearch(ISR_OFFICE);
    // The unique suffix alone finds the group, so the search term carries no markup.
    await pgr.typeSearch(String(unique));
    expect(await pgr.clickSearchAndWait((n) => n === 1)).toBe(1);
    // Tags and quotes come back exactly as typed, as plain text.
    expect(await pgr.readColumnValues('Name')).toEqual([name]);
    expect(await pgr.readColumnValues('Service Type')).toEqual([PGR_ADD_VARIANTS.lastServiceType]);
    expect(await pgr.readColumnValues('Status')).toEqual(['Active']);
  });

  test('TC-ISR-APG-022: Browser Back leaves the Add page without saving or warning', async ({ dependencyGate }) => {
    dependencyGate([]);
    await pgr.clickAdd();
    await pgr.typeAddName('dirty');
    await pgr.goBack();
    expect(await pgr.page.locator('[role="alertdialog"]').count()).toBe(0);
    await pgr.clickAdd();
    expect(await pgr.readAddName()).toBe('');
    await pgr.clickAddCancel();
  });

  test('TC-ISR-APG-023: The breadcrumb leaves the Add page without saving or warning', async ({ dependencyGate }) => {
    dependencyGate([]);
    await pgr.clickAdd();
    await pgr.typeAddName('dirty crumb');
    // The third exit after Cancel and Back: a plain link, so the same silent discard.
    await pgr.clickBreadcrumbToGroups();
    expect(await pgr.page.locator('[role="alertdialog"]').count()).toBe(0);
    await pgr.clickAdd();
    expect(await pgr.readAddName()).toBe('');
    await pgr.clickAddCancel();
  });
});
