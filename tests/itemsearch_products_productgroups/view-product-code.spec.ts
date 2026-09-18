import type { Locator } from '@playwright/test';
import { test, expect } from '../../src/fixtures/pages.fixture';
import { ProductCodePage } from '../../src/pages/products/product-code.page';
import {
  ISR_OFFICE,
  ISR_SEARCH_WORD,
  ISR_DIALOG_TABS,
  ISR_SEGMENTS,
  ISR_TRANSLATION_LANGUAGES,
  ISR_PRODUCT_TYPES,
  ISR_CODE_FIELD_LIMITS,
  ISR_COLUMN_MENU_ITEMS,
  ISR_AUTOMATION_ITEM,
  ISR_CATEGORYLESS_ITEM,
  ISR_ZZ_CHAIN,
  ISR_ZZ_CHAIN_SEARCH_WORD,
  ISR_RENAME_SUFFIX,
  ISR_DIALOG_SECTIONS,
  ISR_DIALOG_ORG_ENTRIES,
  ISR_ORG_COUNTRIES,
  ISR_ORG_PICK,
  ISR_ORG_SECOND_PICK,
  ISR_ORG_REFUSAL_ITEM_NONE,
  ISR_ORG_REFUSAL_ITEM_KEEPS,
  ISR_LABOR_PAIR,
  ISR_EQUIPMENT_SERVICE_SAMPLES,
  ISR_LABOR_SERVICE_SAMPLES_VIEW,
  ISR_PROMPT_DEACTIVATE,
  ISR_PROMPT_ACTIVATE,
  ISR_PROMPT_SUBCLASS_ORG,
  ISR_UPDATE_MESSAGE,
  ISR_HISTORY_COLUMNS,
  ISR_HISTORY_DEFAULT_PAGE_SIZE,
  ISR_HISTORY_SMALL_PAGE_SIZE,
  ISR_HISTORY_HIDE_COLUMN,
  ISR_HISTORY_SORT_COLUMN,
  ISR_HISTORY_NAME_COLUMN,
  ISR_HISTORY_SORT_ONLY_MENU_ITEMS,
  ISR_HISTORY_ACTION_UPDATE,
  ISR_HISTORY_ACTION_ADD,
  ISR_HISTORY_YES,
  ISR_HISTORY_TIME_ZONE,
  ISR_HISTORY_SAVE_WINDOW_MINUTES,
  ISR_TRANSLATION_COLUMNS,
  ISR_TRANSLATION_MAX_LENGTH,
  ISR_TRANSLATION_TEXTS,
  ISR_LANGUAGE_US,
  ISR_LANGUAGE_SPANISH,
  ISR_LANGUAGE_FRENCH,
  ISR_SPECIAL_NAME_SUFFIX,
  ISR_SPECIAL_DESCRIPTION_SUFFIX,
  ISR_OVERLONG,
} from '../../src/data/products/products';

/**
 * Item Search — View Product Code (NM-2255, a sub-task of NM-2253): the row-selection
 * toolbar and the "Product Code Details" view dialog it opens, office 1101.
 *
 * The Add Product Code flow is a separate sub-task with its own spec and its own
 * TC-ISR-APC-* numbering; this file carries the TC-ISR-PCD-* sequence for the View dialog.
 *
 * The Item-level cases edit one product code the automation created earlier and put every
 * value back before they end. The hierarchy cases rename only a self-produced chain of
 * levels, created through the Add caret's Category form when it is missing, so no real
 * catalog node is ever renamed. Closing the dialog discards edits silently (the app has no
 * unsaved-changes prompt — that actual behaviour is itself asserted), and the dialog stays
 * open after a successful save with Save disabled again.
 *
 * Two cases of the sequence wait for data the office does not hold today and are not in
 * this file: TC-ISR-PCD-013 needs a product whose Product Type differs from its Category's,
 * and TC-ISR-PCD-039 needs a sub class whose items have assets attached. Both are listed in
 * the workbook with the data they wait for, rather than passing on a row that cannot show
 * the behaviour.
 */
test.describe.configure({ timeout: 300_000 });

let pc: ProductCodePage;

/** Searches the automation item by name and selects its row — the toolbar precondition. */
const selectAutomationItem = async (): Promise<void> => {
  await pc.searchFor(ISR_AUTOMATION_ITEM.name, (n) => n === 1);
  await pc.selectRowContaining(ISR_AUTOMATION_ITEM.productCodeId);
};

/** Selects the automation item and opens its details on the Item tab. */
const openAutomationItem = async (): Promise<void> => {
  await selectAutomationItem();
  await pc.openViewDialog();
};

/** Closes and reopens the details of the still-selected row. */
const reopenDialog = async (): Promise<void> => {
  await pc.closeDialog();
  await pc.openViewDialog();
};

/** Waits until Save reaches the expected state (the form settles its checks asynchronously). */
const expectSaveEnabled = async (enabled: boolean): Promise<void> => {
  await expect.poll(async () => await pc.isDialogSaveEnabled(), { timeout: 10_000 }).toBe(enabled);
};

/** Waits until a box reaches the expected validity flag. */
const expectFlaggedInvalid = async (box: Locator, invalid: boolean): Promise<void> => {
  await expect.poll(async () => await pc.isFieldFlaggedInvalid(box), { timeout: 10_000 }).toBe(invalid);
};

/** Types the resting name back into the Name box and saves. */
const restoreNameAndSave = async (): Promise<void> => {
  await pc.setBoxValue(pc.dialogNameBox(), ISR_AUTOMATION_ITEM.name);
  await pc.saveAndConfirm();
};

/** Reads the automation item's row from the page grid, failing loudly when it is not listed. */
const readAutomationRow = async (): Promise<Record<string, string>> => {
  const row = await pc.readPageGridRow(ISR_AUTOMATION_ITEM.productCodeId);
  if (!row) throw new Error(`the row of product code ${ISR_AUTOMATION_ITEM.productCodeId} is not in the grid`);
  return row;
};

/** A date and minutes-of-day in the zone the History grid renders in. */
const stampInHistoryZone = (ms: number): { date: string; minutes: number } => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ISR_HISTORY_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(ms));
  const part = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
  return {
    date: `${part('month')}/${part('day')}/${part('year')}`,
    minutes: Number(part('hour')) * 60 + Number(part('minute')),
  };
};

/** Parses a History "Modified Date" cell (MM/DD/YYYY hh:mm:ss AM/PM). */
const parseHistoryStamp = (stamp: string): { date: string; minutes: number } | null => {
  const m = stamp.match(/^(\d{2}\/\d{2}\/\d{4}) (\d{2}):(\d{2}):\d{2} (AM|PM)$/);
  if (!m) return null;
  const hour12 = Number(m[2]) % 12;
  const hour = m[4] === 'PM' ? hour12 + 12 : hour12;
  return { date: m[1] ?? '', minutes: hour * 60 + Number(m[3]) };
};

/** A sortable number for a History "Modified Date" cell (year, month, day, then minutes). */
const stampKey = (stamp: string): number => {
  const parsed = parseHistoryStamp(stamp);
  if (!parsed) throw new Error(`the Modified Date cell "${stamp}" is not a date and time`);
  const [month, day, year] = parsed.date.split('/');
  return Number(`${year}${month}${day}`) * 10_000 + parsed.minutes;
};

/** Asserts a History row was written at the time of a save (same date, within the window). */
const expectStampAtSave = (stamp: string, clickedAt: number): void => {
  const row = parseHistoryStamp(stamp);
  if (!row) throw new Error(`the Modified Date cell "${stamp}" is not a date and time`);
  const at = stampInHistoryZone(clickedAt);
  expect(row.date, 'the row should carry the date of the save').toBe(at.date);
  expect(Math.abs(row.minutes - at.minutes), 'the row should carry the time of the save').toBeLessThanOrEqual(ISR_HISTORY_SAVE_WINDOW_MINUTES);
};

/** Position of a previously read row inside a fresh read of the History rows. */
const indexOfRow = (rows: string[][], row: string[]): number =>
  rows.findIndex((candidate) => candidate.join('|') === row.join('|'));

/** The History rows after opening the tab, with the header proven. */
const readHistoryRowsFresh = async (): Promise<string[][]> => {
  await pc.clickDialogTab('Product Code History');
  await pc.waitForHistoryGrid();
  const rows = await pc.readHistoryRows();
  expect(rows.length).toBeGreaterThan(0);
  return rows;
};

test.describe('Item Search View Product Code — toolbar and dialog @item-search @product-code @view-product-code', () => {
  test.beforeEach(async ({ authenticatedSession, config }) => {
    pc = new ProductCodePage(authenticatedSession.page, config);
    await pc.ensureCleanSearch(ISR_OFFICE);
  });

  test('TC-ISR-PCD-001: Selecting a row reveals the View Product Code button and its segment arrow', { tag: '@C105626' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    // This case honours its stated precondition: a default (empty-criteria) search. The other
    // toolbar controls (Add Product Code, View Availability, Product Group, Grid Options) belong
    // to their own sub-tasks and are not asserted here.
    await expect(pc.viewProductCodeButton()).toHaveCount(0);
    await pc.clickSearchAndWait((n) => n !== null && n > 0);
    await pc.selectFirstRow();
    await expect(pc.viewProductCodeButton()).toBeVisible();
    await expect(pc.viewProductCodeButton()).toBeEnabled();
    await expect(pc.viewSegmentArrow()).toBeVisible();
  });

  test('TC-ISR-PCD-002: View Product Code opens the details dialog on the Item tab', { tag: '@C105627' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    await selectAutomationItem();
    const rowsBefore = await pc.readRowCount();
    await pc.openViewDialog();
    expect(await pc.readDialogTabs()).toEqual([...ISR_DIALOG_TABS]);
    expect(await pc.readActiveTab()).toBe('Item');
    expect(await pc.readDialogSections()).toEqual([...ISR_DIALOG_SECTIONS]);
    // The boxes hold the selected product's text — read-only pass, nothing typed.
    await expect(pc.dialogNameBox()).toHaveValue(ISR_AUTOMATION_ITEM.name);
    await expect(pc.dialogDescriptionBox()).toHaveValue(ISR_AUTOMATION_ITEM.description);
    expect(await pc.readDialogProductCodeIds()).toContain(ISR_AUTOMATION_ITEM.productCodeId);
    expect(await pc.isDialogSaveEnabled()).toBe(false);
    expect(await pc.isDialogCloseEnabled()).toBe(true);
    await pc.closeDialog();
    expect(await pc.readRowCount()).toBe(rowsBefore);
  });

  test('TC-ISR-PCD-003: The History tab shows the audit grid', { tag: '@C105628' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    await openAutomationItem();
    await pc.clickDialogTab('Product Code History');
    expect(await pc.readActiveTab()).toBe('Product Code History');
    // The audit grid fetches after the tab renders its chrome — its own header row
    // appearing is the readiness proof (the pagination cluster paints well before it).
    await pc.waitForHistoryGrid();
    expect(await pc.readDialogGridHeaderNames()).toEqual([...ISR_HISTORY_COLUMNS]);
    // The tab carries its own Grid Options control inside the dialog, separate from the page's.
    await pc.openHistoryGridOptions();
    await pc.closeOpenMenu();
    await pc.closeDialog();
  });

  test('TC-ISR-PCD-004: The Translations tab lists four editable languages', { tag: '@C105629' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    await openAutomationItem();
    await pc.clickDialogTab('Translations');
    expect(await pc.readDialogText()).toContain('Translations for Item');
    expect(await pc.readDialogGridHeaderNames()).toEqual([...ISR_TRANSLATION_COLUMNS]);
    const rows = await pc.readTranslationRows();
    expect(rows.map((r) => r.language)).toEqual([...ISR_TRANSLATION_LANGUAGES]);
    // Every language row carries an editable Name box and an editable Description box.
    expect(rows.map((r) => r.boxes)).toEqual(ISR_TRANSLATION_LANGUAGES.map(() => 2));
    await expect(pc.translationNameBox(ISR_LANGUAGE_US)).toBeEditable();
    await expect(pc.translationDescriptionBox(ISR_LANGUAGE_US)).toBeEditable();
    await pc.closeDialog();
  });

  test('TC-ISR-PCD-005: The View segment menu rescopes the dialog', { tag: '@C105630' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    await selectAutomationItem();
    const rowsBefore = await pc.readRowCount();
    await pc.openViewSegmentMenu();
    expect(await pc.readOpenMenuItems()).toEqual([...ISR_SEGMENTS]);
    await pc.chooseSegment('Sub Class');
    expect(await pc.readActiveTab()).toBe('Sub Class');
    for (const segment of ['Class', 'Sub Category', 'Category', 'Item']) {
      await pc.closeDialog();
      await pc.openSegment(segment);
      expect(await pc.readActiveTab()).toBe(segment);
    }
    await pc.closeDialog();
    expect(await pc.readRowCount()).toBe(rowsBefore);
  });

  test('TC-ISR-PCD-006: Closing the dialog with a Name edit discards it silently', { tag: '@C105631' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    await openAutomationItem();
    await expect(pc.dialogNameBox()).toHaveValue(ISR_AUTOMATION_ITEM.name);
    expect(await pc.appendToBox(pc.dialogNameBox(), 'X')).toBe(`${ISR_AUTOMATION_ITEM.name}X`);
    await expectSaveEnabled(true);
    await pc.closeDialog();
    // This documents the actual behaviour: no unsaved-changes prompt guards the View dialog.
    expect(await pc.isPromptOpen()).toBe(false);
    await pc.openViewDialog();
    await expect(pc.dialogNameBox()).toHaveValue(ISR_AUTOMATION_ITEM.name);
    await pc.closeDialog();
  });

  test('TC-ISR-PCD-007: The dialog shows the values of the selected row', { tag: '@C105632' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    await pc.searchFor(ISR_AUTOMATION_ITEM.name, (n) => n === 1);
    const row = await readAutomationRow();
    expect(row.Category).not.toBe('');
    expect(row['Sub Category']).not.toBe('');
    expect(row.Class).not.toBe('');
    expect(row['Sub Class']).not.toBe('');
    expect(row.Item).toBe(ISR_AUTOMATION_ITEM.name);
    expect(row['Product Code ID']).toBe(ISR_AUTOMATION_ITEM.productCodeId);
    await pc.selectRowContaining(ISR_AUTOMATION_ITEM.productCodeId);
    await pc.openViewDialog();
    expect(await pc.readActiveTab()).toBe('Item');
    // The Category is plain text on the Item segment; the three levels below are dropdowns.
    expect(await pc.readDialogText()).toContain(row.Category ?? '');
    expect(await pc.readComboValue(pc.hierarchyCombo('Sub Category'))).toBe(row['Sub Category']);
    expect(await pc.readComboValue(pc.hierarchyCombo('Class'))).toBe(row.Class);
    expect(await pc.readComboValue(pc.hierarchyCombo('Sub Class'))).toBe(row['Sub Class']);
    await expect(pc.dialogNameBox()).toHaveValue(row.Item ?? '');
    // The last identifier shown belongs to the Item section (the Sub Class shows its own above).
    const ids = await pc.readDialogProductCodeIds();
    expect(ids[ids.length - 1]).toBe(row['Product Code ID']);
    await pc.closeDialog();
  });

  test('TC-ISR-PCD-008: Every close path discards a dirty form silently', { tag: '@C105633' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    await openAutomationItem();
    await pc.clickDialogTab('Translations');
    const usNameOriginal = await pc.translationNameBox(ISR_LANGUAGE_US).inputValue();
    await pc.clickDialogTab('Item');

    const makeTwoEdits = async (): Promise<void> => {
      await pc.appendToBox(pc.dialogNameBox(), 'X');
      await pc.clickDialogTab('Translations');
      await pc.appendToBox(pc.translationNameBox(ISR_LANGUAGE_US), 'X');
      await expectSaveEnabled(true);
    };
    const expectOriginals = async (): Promise<void> => {
      await expect(pc.dialogNameBox()).toHaveValue(ISR_AUTOMATION_ITEM.name);
      await pc.clickDialogTab('Translations');
      await expect(pc.translationNameBox(ISR_LANGUAGE_US)).toHaveValue(usNameOriginal);
      await pc.clickDialogTab('Item');
    };

    // The small corner button.
    await makeTwoEdits();
    await pc.closeDialogWithCornerButton();
    expect(await pc.isPromptOpen()).toBe(false);
    await pc.openViewDialog();
    await expectOriginals();

    // The Escape key.
    await makeTwoEdits();
    await pc.closeDialogWithEscape();
    expect(await pc.isPromptOpen()).toBe(false);
    await pc.openViewDialog();
    await expectOriginals();

    // A click outside the dialog is the one path that keeps it open, edits and all.
    await makeTwoEdits();
    await pc.clickOutsideDialog();
    expect(await pc.isDialogOpen()).toBe(true);
    await expect(pc.translationNameBox(ISR_LANGUAGE_US)).toHaveValue(`${usNameOriginal}X`);
    await pc.clickDialogTab('Item');
    await expect(pc.dialogNameBox()).toHaveValue(`${ISR_AUTOMATION_ITEM.name}X`);
    await expectSaveEnabled(true);

    // A page reload drops the dialog; the executed search survives it.
    await pc.reloadPage();
    expect(await pc.isDialogOpen()).toBe(false);
    expect(await pc.readAnyField()).toBe(ISR_AUTOMATION_ITEM.name);
    expect(await pc.readRowCount()).toBeGreaterThan(0);
    await pc.selectRowContaining(ISR_AUTOMATION_ITEM.productCodeId);
    await pc.openViewDialog();
    await expectOriginals();
    await pc.closeDialog();
  });

  test('TC-ISR-PCD-009: A dirty Item-tab edit survives a round trip through the other tabs', { tag: '@C105634' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    await openAutomationItem();
    const edited = `${ISR_AUTOMATION_ITEM.name}X`;
    expect(await pc.appendToBox(pc.dialogNameBox(), 'X')).toBe(edited);
    await expectSaveEnabled(true);
    for (const tab of ['Product Code History', 'Translations', 'Item']) {
      await pc.clickDialogTab(tab);
      expect(await pc.readActiveTab()).toBe(tab);
    }
    await expect(pc.dialogNameBox()).toHaveValue(edited);
    expect(await pc.isDialogSaveEnabled()).toBe(true);
    await pc.closeDialog();
  });
});

test.describe('Item Search View Product Code — segments and fields @item-search @product-code @view-product-code', () => {
  test.beforeEach(async ({ authenticatedSession, config }) => {
    pc = new ProductCodePage(authenticatedSession.page, config);
    await pc.ensureCleanSearch(ISR_OFFICE);
    await selectAutomationItem();
  });

  test('TC-ISR-PCD-010: Each segment shows the sections from Category down to its own level', { tag: '@C105635' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    const expected: Record<string, string[]> = {
      Item: ['Category', 'Sub Category', 'Class', 'Sub Class', 'Item'],
      'Sub Class': ['Category', 'Sub Category', 'Class', 'Sub Class'],
      Class: ['Category', 'Sub Category', 'Class'],
      'Sub Category': ['Category', 'Sub Category'],
      Category: ['Category'],
    };
    for (const segment of ['Item', 'Sub Class', 'Class', 'Sub Category', 'Category']) {
      await pc.openSegment(segment);
      expect(await pc.readDialogSections(), `sections of the ${segment} segment`).toEqual(expected[segment]);
      await pc.closeDialog();
    }
  });

  test('TC-ISR-PCD-011: Each segment carries only the fields that belong to its level', { tag: '@C105636' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    await pc.openSegment('Item');
    expect(await pc.readDialogPlaceholders()).toEqual(['Enter name', 'Enter item description', 'Enter oracle item number']);
    const itemText = await pc.readDialogText();
    for (const label of ['Product Type', 'Service Type', 'Product Organization', 'Active', 'Product Code ID']) {
      expect(itemText).toContain(label);
    }
    // Exactly one Active box, in the Item section; the Sub Class section's Barcodeable is locked.
    expect(await pc.readDialogCheckboxLabels()).toEqual(['Barcodeable', 'Active']);
    expect(await pc.isBoxDisabled(pc.barcodeableBox())).toBe(true);
    const barcodeableBefore = await pc.isBoxChecked(pc.barcodeableBox());
    await pc.clickBarcodeable();
    await pc.clickBarcodeableLabel();
    await pc.clickBarcodeableRow();
    expect(await pc.isBoxChecked(pc.barcodeableBox())).toBe(barcodeableBefore);
    expect(await pc.isDialogSaveEnabled()).toBe(false);
    expect(itemText).not.toContain('Product Group');
    await pc.closeDialog();

    await pc.openSegment('Sub Class');
    expect(await pc.readDialogPlaceholders()).toEqual(['Enter sub-class name', 'Enter product description']);
    const subClassText = await pc.readDialogText();
    for (const label of ['Service Type', 'Barcodeable', 'Product Organization', 'Product Code ID', 'Active']) {
      expect(subClassText).toContain(label);
    }
    expect(await pc.readDialogCheckboxLabels()).toEqual(['Barcodeable', 'Active']);
    expect(await pc.isBoxDisabled(pc.barcodeableBox())).toBe(false);
    const subClassBarcodeable = await pc.isBoxChecked(pc.barcodeableBox());
    await pc.clickBarcodeable();
    expect(await pc.isBoxChecked(pc.barcodeableBox())).toBe(!subClassBarcodeable);
    await expectSaveEnabled(true);
    await pc.clickBarcodeable();
    expect(await pc.isBoxChecked(pc.barcodeableBox())).toBe(subClassBarcodeable);
    await pc.closeDialog();

    const ownNameBox: Record<string, string> = {
      Class: 'Enter class name',
      'Sub Category': 'Enter sub-category name',
      Category: 'Enter category name',
    };
    for (const segment of ['Class', 'Sub Category', 'Category']) {
      await pc.openSegment(segment);
      expect(await pc.readDialogPlaceholders(), `boxes of the ${segment} segment`).toEqual([ownNameBox[segment]]);
      expect(await pc.readDialogText()).toContain('Service Type');
      expect(await pc.readDialogCheckboxLabels(), `checkboxes of the ${segment} segment`).toEqual(['Active']);
      await pc.closeDialog();
    }
  });

  test('TC-ISR-PCD-012: Names above the edited level are hierarchy dropdowns and its own name is text', { tag: '@C105637' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    const row = await readAutomationRow();
    const category = row.Category ?? '';
    await pc.openSegment('Item');
    const subCategory = await pc.readComboValue(pc.hierarchyCombo('Sub Category'));
    const className = await pc.readComboValue(pc.hierarchyCombo('Class'));
    const subClass = await pc.readComboValue(pc.hierarchyCombo('Sub Class'));
    expect([subCategory, className, subClass]).toEqual([row['Sub Category'], row.Class, row['Sub Class']]);
    await expect(pc.dialogNameBox()).toBeEditable();
    // The Category name is plain text: no dropdown shows it.
    expect(await pc.readDialogComboValues()).not.toContain(category);
    expect(await pc.readDialogText()).toContain(category);
    // Option lists are read live: membership is checked, never a count. Whether every entry
    // belongs to the row's Category has no independent oracle on the page, so the list is
    // proven non-empty and to hold the row's own value.
    const subCategories = await pc.openComboAndReadOptions(pc.hierarchyCombo('Sub Category'));
    expect(subCategories.length).toBeGreaterThan(0);
    expect(subCategories).toContain(subCategory);
    await pc.closeOpenList();
    expect(await pc.isDialogOpen()).toBe(true);
    const classes = await pc.openComboAndReadOptions(pc.hierarchyCombo('Class'));
    expect(classes).toContain(className);
    await pc.closeOpenList();
    expect(await pc.isDialogOpen()).toBe(true);
    const subClasses = await pc.openComboAndReadOptions(pc.hierarchyCombo('Sub Class'));
    expect(subClasses).toContain(subClass);
    expect(subClasses.length).toBeGreaterThan(1);
    await pc.closeOpenList();
    await pc.closeDialog();

    await pc.openSegment('Sub Class');
    expect(await pc.readComboValue(pc.hierarchyCombo('Sub Category'))).toBe(row['Sub Category']);
    expect(await pc.readComboValue(pc.hierarchyCombo('Class'))).toBe(row.Class);
    await expect(pc.dialogBox('Enter sub-class name')).toHaveValue(row['Sub Class'] ?? '');
    expect(await pc.readDialogComboValues()).not.toContain(category);
    expect(await pc.readDialogText()).toContain(category);
    await pc.closeDialog();

    await pc.openSegment('Category');
    await expect(pc.dialogBox('Enter category name')).toHaveValue(category);
    // Only the Category's own Service Type dropdown remains; nothing above it.
    const categoryCombos = await pc.readDialogComboValues();
    expect(categoryCombos).toHaveLength(1);
    expect(categoryCombos).not.toContain(category);
    await pc.closeDialog();
  });

  // TC-ISR-PCD-013 (each segment shows its own Product Type rather than the Category's) needs
  // a product whose Product Type differs from its Category's; office 1101 holds none today.

  test('TC-ISR-PCD-014: History and Translations tabs exist on every segment and name the segment', { tag: '@C105639' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    const headings: Record<string, string> = {
      'Sub Class': 'Translations for Sub Class',
      Class: 'Translations for Class',
      'Sub Category': 'Translations for Sub Category',
      // The Category heading uses the wording "Major Category" as the app shows it today.
      Category: 'Translations for Major Category',
    };
    for (const segment of ['Sub Class', 'Class', 'Sub Category', 'Category']) {
      await pc.openSegment(segment);
      await pc.clickDialogTab('Product Code History');
      await pc.waitForHistoryGrid();
      expect(await pc.readDialogGridHeaderNames(), `history columns of the ${segment} segment`).toEqual([...ISR_HISTORY_COLUMNS]);
      await pc.clickDialogTab('Translations');
      expect(await pc.readDialogText()).toContain(headings[segment] ?? '');
      const rows = await pc.readTranslationRows();
      expect(rows.map((r) => r.language)).toEqual([...ISR_TRANSLATION_LANGUAGES]);
      const minimumBoxes = segment === 'Sub Class' ? 2 : 1;
      expect(rows.map((r) => r.boxes >= minimumBoxes), `translation boxes of the ${segment} segment`).toEqual(rows.map(() => true));
      await pc.closeDialog();
    }
  });
});

test.describe('Item Search View Product Code — Item field rules @item-search @product-code @view-product-code', () => {
  test.beforeEach(async ({ authenticatedSession, config }) => {
    pc = new ProductCodePage(authenticatedSession.page, config);
    await pc.ensureCleanSearch(ISR_OFFICE);
  });

  test('TC-ISR-PCD-015: Name and Item Description stop at 50 characters and Oracle Item Number at 10', { tag: '@C105640' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    await openAutomationItem();
    await pc.armToastRecorder();
    const nameBox = pc.dialogNameBox();
    expect(await pc.typeAndReadBack(nameBox, 'N'.repeat(ISR_OVERLONG.name))).toHaveLength(ISR_CODE_FIELD_LIMITS.name);
    // Tab leaves the full box and lands on the next one, with no message in between.
    expect(await pc.pressTabAndReadFocus()).toBe('Enter item description');
    expect(await pc.insertTextIntoBox(nameBox, 'P'.repeat(ISR_OVERLONG.name))).toHaveLength(ISR_CODE_FIELD_LIMITS.name);
    const descriptionBox = pc.dialogDescriptionBox();
    expect(await pc.typeAndReadBack(descriptionBox, 'D'.repeat(ISR_OVERLONG.description))).toHaveLength(ISR_CODE_FIELD_LIMITS.itemDescription);
    expect(await pc.insertTextIntoBox(descriptionBox, 'Q'.repeat(ISR_OVERLONG.description))).toHaveLength(ISR_CODE_FIELD_LIMITS.itemDescription);
    const oracleBox = pc.dialogOracleItemNumberBox();
    expect(await pc.typeAndReadBack(oracleBox, 'O'.repeat(ISR_OVERLONG.oracle))).toHaveLength(ISR_CODE_FIELD_LIMITS.oracleItemNumber);
    expect(await pc.insertTextIntoBox(oracleBox, 'R'.repeat(ISR_OVERLONG.oracle))).toHaveLength(ISR_CODE_FIELD_LIMITS.oracleItemNumber);
    // The typing limit is silent: the extra characters never appear and nothing is announced.
    expect(await pc.readRecordedToasts()).toEqual([]);
    expect(await pc.isPromptOpen()).toBe(false);
    await pc.closeDialog();
  });

  test('TC-ISR-PCD-016: An over-length value that bypasses the typing limit is refused', { tag: '@C105641' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    await openAutomationItem();
    const nameBox = pc.dialogNameBox();
    const descriptionBox = pc.dialogDescriptionBox();
    expect(await pc.pasteIntoBox(nameBox, 'N'.repeat(ISR_OVERLONG.bypass))).toHaveLength(ISR_OVERLONG.bypass);
    await expectFlaggedInvalid(nameBox, true);
    await expectSaveEnabled(false);
    expect(await pc.pasteIntoBox(descriptionBox, 'D'.repeat(ISR_OVERLONG.bypass))).toHaveLength(ISR_OVERLONG.bypass);
    await expectFlaggedInvalid(descriptionBox, true);
    await expectSaveEnabled(false);
    // Positive control: the same scripted set with a value inside the limit is accepted, which
    // proves the refusals above come from the form and not from a set that never registered.
    expect(await pc.pasteIntoBox(nameBox, 'N'.repeat(ISR_OVERLONG.control))).toHaveLength(ISR_OVERLONG.control);
    expect(await pc.pasteIntoBox(descriptionBox, 'D'.repeat(ISR_OVERLONG.control))).toHaveLength(ISR_OVERLONG.control);
    await expectFlaggedInvalid(nameBox, false);
    await expectFlaggedInvalid(descriptionBox, false);
    await expectSaveEnabled(true);
    await pc.closeDialog();
  });

  test('TC-ISR-PCD-017: Clearing Name or Item Description marks it invalid and holds Save', { tag: '@C105642' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    await openAutomationItem();
    const nameBox = pc.dialogNameBox();
    const descriptionBox = pc.dialogDescriptionBox();
    expect(await pc.clearBoxBySelectAll(nameBox)).toBe('');
    await expectFlaggedInvalid(nameBox, true);
    await expectSaveEnabled(false);
    await pc.setBoxValue(nameBox, `${ISR_AUTOMATION_ITEM.name}X`);
    await expectFlaggedInvalid(nameBox, false);
    await expectSaveEnabled(true);
    expect(await pc.clearBoxByBackspace(nameBox)).toBe('');
    await expectFlaggedInvalid(nameBox, true);
    await expectSaveEnabled(false);
    await pc.setBoxValue(nameBox, `${ISR_AUTOMATION_ITEM.name}X`);
    expect(await pc.clearBoxBySelectAll(descriptionBox)).toBe('');
    await expectFlaggedInvalid(descriptionBox, true);
    await expectSaveEnabled(false);
    await pc.setBoxValue(descriptionBox, `${ISR_AUTOMATION_ITEM.description}X`);
    await expectFlaggedInvalid(nameBox, false);
    await expectFlaggedInvalid(descriptionBox, false);
    await expectSaveEnabled(true);
    await pc.closeDialog();
  });

  test('TC-ISR-PCD-018: A spaces-only Name is refused and a padded Name is saved without the spaces', { tag: '@C105643' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    await openAutomationItem();
    const nameBox = pc.dialogNameBox();
    expect(await pc.setBoxValue(nameBox, '   ')).toBe('   ');
    await expectFlaggedInvalid(nameBox, true);
    await expectSaveEnabled(false);
    expect(await pc.setBoxValue(nameBox, ' ')).toBe(' ');
    await expectFlaggedInvalid(nameBox, true);
    await expectSaveEnabled(false);
    const trimmed = `${ISR_AUTOMATION_ITEM.name} P`;
    expect(await pc.setBoxValue(nameBox, `  ${trimmed}  `)).toBe(`  ${trimmed}  `);
    await expectFlaggedInvalid(nameBox, false);
    await expectSaveEnabled(true);
    await pc.saveAndConfirm();
    await expect(nameBox).toHaveValue(trimmed);
    await reopenDialog();
    await expect(pc.dialogNameBox()).toHaveValue(trimmed);
    expect((await readAutomationRow()).Item).toBe(trimmed);
    await restoreNameAndSave();
    expect((await readAutomationRow()).Item).toBe(ISR_AUTOMATION_ITEM.name);
    await pc.closeDialog();
  });

  test('TC-ISR-PCD-019: A 50-character Name saves and reads back complete', { tag: '@C105644' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(420_000);
    await openAutomationItem();
    const fullName = `${ISR_AUTOMATION_ITEM.name} `.padEnd(ISR_CODE_FIELD_LIMITS.name, 'Q');
    expect(fullName).toHaveLength(ISR_CODE_FIELD_LIMITS.name);
    const nameBox = pc.dialogNameBox();
    expect(await pc.setBoxValue(nameBox, fullName)).toBe(fullName);
    await expectFlaggedInvalid(nameBox, false);
    await expectSaveEnabled(true);
    await pc.saveAndConfirm();
    await pc.reloadPage();
    await pc.searchFor(fullName, (n) => n === 1);
    await pc.selectRowContaining(ISR_AUTOMATION_ITEM.productCodeId);
    await pc.openViewDialog();
    await expect(pc.dialogNameBox()).toHaveValue(fullName);
    await restoreNameAndSave();
    expect((await readAutomationRow()).Item).toBe(ISR_AUTOMATION_ITEM.name);
    await pc.closeDialog();
  });

  test('TC-ISR-PCD-020: Oracle Item Number is optional and accepts letters up to 10 characters', { tag: '@C105645' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    await openAutomationItem();
    const oracleBox = pc.dialogOracleItemNumberBox();
    await expect(oracleBox, 'the resting Oracle Item Number should be empty').toHaveValue('');
    expect(await pc.setBoxValue(oracleBox, 'ABCDEFGHIJ')).toBe('ABCDEFGHIJ');
    await expectFlaggedInvalid(oracleBox, false);
    await expectSaveEnabled(true);
    await pc.saveAndConfirm();
    await reopenDialog();
    await expect(pc.dialogOracleItemNumberBox()).toHaveValue('ABCDEFGHIJ');
    expect(await pc.clearBoxBySelectAll(pc.dialogOracleItemNumberBox())).toBe('');
    await expectFlaggedInvalid(pc.dialogOracleItemNumberBox(), false);
    await expectSaveEnabled(true);
    await pc.saveAndConfirm();
    await reopenDialog();
    await expect(pc.dialogOracleItemNumberBox()).toHaveValue('');
    await pc.closeDialog();
  });

  test('TC-ISR-PCD-021: Special characters in Name and Item Description save and show as plain text', { tag: '@C105646' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    await openAutomationItem();
    const specialName = `${ISR_AUTOMATION_ITEM.name}${ISR_SPECIAL_NAME_SUFFIX}`;
    const specialDescription = `${ISR_AUTOMATION_ITEM.description}${ISR_SPECIAL_DESCRIPTION_SUFFIX}`;
    expect(await pc.appendToBox(pc.dialogNameBox(), ISR_SPECIAL_NAME_SUFFIX)).toBe(specialName);
    await expectSaveEnabled(true);
    await pc.saveAndConfirm();
    await expect(pc.dialogNameBox()).toHaveValue(specialName);
    expect((await readAutomationRow()).Item).toBe(specialName);
    expect(await pc.appendToBox(pc.dialogDescriptionBox(), ISR_SPECIAL_DESCRIPTION_SUFFIX)).toBe(specialDescription);
    await expectSaveEnabled(true);
    await pc.saveAndConfirm();
    await expect(pc.dialogDescriptionBox()).toHaveValue(specialDescription);
    expect((await readAutomationRow()).Description).toBe(specialDescription);
    await reopenDialog();
    await expect(pc.dialogNameBox()).toHaveValue(specialName);
    await expect(pc.dialogDescriptionBox()).toHaveValue(specialDescription);
    await pc.setBoxValue(pc.dialogNameBox(), ISR_AUTOMATION_ITEM.name);
    await pc.setBoxValue(pc.dialogDescriptionBox(), ISR_AUTOMATION_ITEM.description);
    await pc.saveAndConfirm();
    const row = await readAutomationRow();
    expect(row.Item).toBe(ISR_AUTOMATION_ITEM.name);
    expect(row.Description).toBe(ISR_AUTOMATION_ITEM.description);
    await pc.closeDialog();
  });

  test('TC-ISR-PCD-022: The own-name box of every upper segment also stops at 50 characters', { tag: '@C105647' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    await selectAutomationItem();
    const ownNameBox: Record<string, string> = {
      'Sub Class': 'Enter sub-class name',
      Class: 'Enter class name',
      'Sub Category': 'Enter sub-category name',
      Category: 'Enter category name',
    };
    for (const segment of ['Sub Class', 'Class', 'Sub Category', 'Category']) {
      await pc.openSegment(segment);
      expect(await pc.typeAndReadBack(pc.dialogBox(ownNameBox[segment] ?? ''), 'S'.repeat(ISR_OVERLONG.name)), `${segment} name box`)
        .toHaveLength(ISR_CODE_FIELD_LIMITS.name);
      await pc.closeDialog();
    }
  });

  test('TC-ISR-PCD-023: A Name edit enables Save on the first open and again after reopening', { tag: '@C105648' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    // A page reload is the closest a shared signed-in session gets to a fresh sign-in; the
    // first-open behaviour was also proven on a freshly signed-in session during verification.
    await pc.reloadPage();
    await openAutomationItem();
    await pc.appendToBox(pc.dialogNameBox(), 'X');
    await expectSaveEnabled(true);
    await pc.closeDialog();
    await pc.openViewDialog();
    expect(await pc.isDialogSaveEnabled()).toBe(false);
    await pc.appendToBox(pc.dialogNameBox(), 'X');
    await expectSaveEnabled(true);
    await pc.closeDialog();
  });

  test('TC-ISR-PCD-024: Typing the original Name back disables Save again', { tag: '@C105649' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    await openAutomationItem();
    for (let round = 0; round < 3; round++) {
      await pc.appendToBox(pc.dialogNameBox(), 'X');
      await expectSaveEnabled(true);
      await pc.setBoxValue(pc.dialogNameBox(), ISR_AUTOMATION_ITEM.name);
      await expectSaveEnabled(false);
    }
    await pc.closeDialog();
  });
});

test.describe('Item Search View Product Code — Item save @item-search @product-code @view-product-code', () => {
  test.beforeEach(async ({ authenticatedSession, config }) => {
    pc = new ProductCodePage(authenticatedSession.page, config);
    await pc.ensureCleanSearch(ISR_OFFICE);
    await openAutomationItem();
  });

  test('TC-ISR-PCD-025: Editing the three Item text boxes saves and refreshes the grid row', { tag: '@C105650' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(420_000);
    // The new name must not contain the old one, or a search for the old name would still find it.
    const newName = ISR_AUTOMATION_ITEM.name.replace('Code', 'Edited');
    expect(newName).not.toContain(ISR_AUTOMATION_ITEM.name);
    const newDescription = `${ISR_AUTOMATION_ITEM.description} E`;
    const newOracle = 'E25';
    await pc.setBoxValue(pc.dialogNameBox(), newName);
    await pc.setBoxValue(pc.dialogDescriptionBox(), newDescription);
    await pc.setBoxValue(pc.dialogOracleItemNumberBox(), newOracle);
    await expectSaveEnabled(true);
    await pc.armToastRecorder();
    await pc.saveAndConfirm();
    expect((await pc.readRecordedToasts()).filter((t) => t.includes('Product updated successfully.'))).toHaveLength(1);
    expect(await pc.isDialogOpen()).toBe(true);
    expect(await pc.isDialogSaveEnabled()).toBe(false);
    // The grid row behind the dialog refreshes without a second search.
    const refreshed = await readAutomationRow();
    expect(refreshed.Item).toBe(newName);
    expect(refreshed.Description).toBe(newDescription);
    await pc.closeDialog();
    await pc.reloadPage();
    await pc.searchFor(newName, (n) => n === 1);
    await pc.searchFor(ISR_AUTOMATION_ITEM.name, (n) => n === 0);
    await pc.searchFor(newName, (n) => n === 1);
    await pc.selectRowContaining(ISR_AUTOMATION_ITEM.productCodeId);
    await pc.openViewDialog();
    await pc.setBoxValue(pc.dialogNameBox(), ISR_AUTOMATION_ITEM.name);
    await pc.setBoxValue(pc.dialogDescriptionBox(), ISR_AUTOMATION_ITEM.description);
    await pc.clearBoxBySelectAll(pc.dialogOracleItemNumberBox());
    await pc.saveAndConfirm();
    await pc.closeDialog();
    await pc.reloadPage();
    await pc.searchFor(ISR_AUTOMATION_ITEM.name, (n) => n === 1);
    const restored = await readAutomationRow();
    expect(restored.Item).toBe(ISR_AUTOMATION_ITEM.name);
    expect(restored.Description).toBe(ISR_AUTOMATION_ITEM.description);
  });

  test('TC-ISR-PCD-026: Changing the Item Product Type resets its Service Type and saves', { tag: '@C105651' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    const typeCombo = await pc.ownProductTypeCombo();
    const serviceCombo = pc.ownServiceTypeCombo();
    expect(await pc.readComboValue(typeCombo)).toBe(ISR_AUTOMATION_ITEM.productType);
    expect(await pc.readComboValue(serviceCombo)).toBe(ISR_AUTOMATION_ITEM.serviceType);
    await pc.chooseComboOption(typeCombo, ISR_LABOR_PAIR.productType);
    expect(await pc.readComboValue(await pc.ownProductTypeCombo())).toBe(ISR_LABOR_PAIR.productType);
    // The type drives the service list: the old service is dropped and Save waits for a new one.
    expect(await pc.readComboValue(pc.ownServiceTypeCombo())).toBe('');
    await expectSaveEnabled(false);
    await pc.chooseComboOption(pc.ownServiceTypeCombo(), ISR_LABOR_PAIR.serviceType);
    expect(await pc.readComboValue(pc.ownServiceTypeCombo())).toBe(ISR_LABOR_PAIR.serviceType);
    await expectSaveEnabled(true);
    await pc.saveAndConfirm();
    await reopenDialog();
    expect(await pc.readComboValue(await pc.ownProductTypeCombo())).toBe(ISR_LABOR_PAIR.productType);
    expect(await pc.readComboValue(pc.ownServiceTypeCombo())).toBe(ISR_LABOR_PAIR.serviceType);
    await pc.chooseComboOption(await pc.ownProductTypeCombo(), ISR_AUTOMATION_ITEM.productType);
    expect(await pc.readComboValue(pc.ownServiceTypeCombo())).toBe('');
    await expectSaveEnabled(false);
    await pc.chooseComboOption(pc.ownServiceTypeCombo(), ISR_AUTOMATION_ITEM.serviceType);
    await pc.saveAndConfirm();
    await reopenDialog();
    expect(await pc.readComboValue(await pc.ownProductTypeCombo())).toBe(ISR_AUTOMATION_ITEM.productType);
    expect(await pc.readComboValue(pc.ownServiceTypeCombo())).toBe(ISR_AUTOMATION_ITEM.serviceType);
    await pc.closeDialog();
  });

  test('TC-ISR-PCD-027: The Product Type list offers ten types and filters the Service Type list', { tag: '@C105652' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    expect(await pc.readComboValue(await pc.ownProductTypeCombo())).toBe(ISR_AUTOMATION_ITEM.productType);
    // The ten types are a fixed set whose rendered order is not — membership is the contract.
    const types = await pc.openComboAndReadOptions(await pc.ownProductTypeCombo());
    expect([...types].sort()).toEqual([...ISR_PRODUCT_TYPES].sort());
    await pc.closeOpenList();
    const equipmentServices = await pc.openComboAndReadOptions(pc.ownServiceTypeCombo());
    for (const sample of ISR_EQUIPMENT_SERVICE_SAMPLES) {
      expect(equipmentServices).toContain(sample);
    }
    await pc.closeOpenList();
    await pc.chooseComboOption(await pc.ownProductTypeCombo(), ISR_LABOR_PAIR.productType);
    const laborServices = await pc.openComboAndReadOptions(pc.ownServiceTypeCombo());
    for (const sample of ISR_LABOR_SERVICE_SAMPLES_VIEW) {
      expect(laborServices).toContain(sample);
    }
    for (const sample of ISR_EQUIPMENT_SERVICE_SAMPLES) {
      expect(laborServices).not.toContain(sample);
    }
    await pc.closeOpenList();
    await pc.closeDialog();
  });

  test('TC-ISR-PCD-028: Product Organization offers the countries, saves and clears again', { tag: '@C105653' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(420_000);
    expect(await pc.readOrgValue('Item'), 'the resting organization should be None').toBe('None');
    await pc.openOrgList('Item');
    expect([...(await pc.readOrgEntries())].sort()).toEqual([...ISR_DIALOG_ORG_ENTRIES].sort());
    // The list marks None itself while nothing is chosen, and Select All while every country is.
    expect(await pc.readOrgCheckedEntries()).toEqual(['None']);
    await pc.clickOrgEntry(ISR_ORG_PICK);
    expect(await pc.readOrgCheckedEntries()).toEqual([ISR_ORG_PICK]);
    await expectSaveEnabled(true);
    // A second click on the chosen country clears it, as the app behaves today.
    await pc.clickOrgEntry(ISR_ORG_PICK);
    expect(await pc.readOrgCheckedEntries()).toEqual(['None']);
    await expectSaveEnabled(false);
    await pc.clickOrgEntry('Select All');
    expect([...(await pc.readOrgCheckedEntries())].sort()).toEqual(['Select All', ...ISR_ORG_COUNTRIES].sort());
    await pc.clickOrgEntry('Select All');
    expect(await pc.readOrgCheckedEntries()).toEqual(['None']);
    await pc.clickOrgEntry(ISR_ORG_PICK);
    await pc.closeOrgList();
    expect(await pc.isDialogOpen()).toBe(true);
    await expectSaveEnabled(true);
    await pc.saveAndConfirm();
    await pc.closeDialog();
    await pc.reloadPage();
    await pc.searchFor(ISR_AUTOMATION_ITEM.name, (n) => n === 1);
    await pc.selectRowContaining(ISR_AUTOMATION_ITEM.productCodeId);
    await pc.openViewDialog();
    expect(await pc.readOrgValue('Item')).toBe(ISR_ORG_PICK);
    await pc.openOrgList('Item');
    expect(await pc.readOrgCheckedEntries()).toEqual([ISR_ORG_PICK]);
    await pc.clickOrgEntry('None');
    await pc.closeOrgList();
    await pc.saveAndConfirm();
    await reopenDialog();
    expect(await pc.readOrgValue('Item')).toBe('None');
    await pc.openOrgList('Item');
    expect(await pc.readOrgCheckedEntries()).toEqual(['None']);
    await pc.closeOrgList();
    await pc.closeDialog();
  });

  test('TC-ISR-PCD-029: Choosing another Sub Class re-parents the item and the grid row follows', { tag: '@C105654' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    const originalSubClass = await pc.readComboValue(pc.hierarchyCombo('Sub Class'));
    const originalIds = await pc.readDialogProductCodeIds();
    const originalSubClassId = originalIds[0] ?? '';
    expect(originalSubClassId).not.toBe('');
    const subClasses = await pc.openComboAndReadOptions(pc.hierarchyCombo('Sub Class'));
    const otherSubClass = subClasses.find((s) => s !== originalSubClass);
    if (!otherSubClass) throw new Error(`the Class of the automation item offers no second sub class: ${subClasses.join(', ')}`);
    await pc.chooseInOpenList(otherSubClass);
    expect(await pc.readComboValue(pc.hierarchyCombo('Sub Class'))).toBe(otherSubClass);
    // The section re-renders with the chosen sub class's own service, Barcodeable state and organization.
    expect(await pc.readComboValue(pc.levelServiceCombo('Sub Class'))).not.toBe('');
    await expectSaveEnabled(true);
    await pc.saveAndConfirm();
    expect((await readAutomationRow())['Sub Class']).toBe(otherSubClass);
    await reopenDialog();
    expect(await pc.readComboValue(pc.hierarchyCombo('Sub Class'))).toBe(otherSubClass);
    const movedIds = await pc.readDialogProductCodeIds();
    expect(movedIds[0]).not.toBe('');
    expect(movedIds[0]).not.toBe(originalSubClassId);
    await pc.chooseComboOption(pc.hierarchyCombo('Sub Class'), originalSubClass);
    await pc.saveAndConfirm();
    await reopenDialog();
    expect(await pc.readComboValue(pc.hierarchyCombo('Sub Class'))).toBe(originalSubClass);
    expect((await pc.readDialogProductCodeIds())[0]).toBe(originalSubClassId);
    expect((await readAutomationRow())['Sub Class']).toBe(originalSubClass);
    await pc.closeDialog();
  });

  test('TC-ISR-PCD-030: Deactivating and reactivating the item through Active and Save', { tag: '@C105655' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(420_000);
    expect(await pc.isBoxChecked(pc.activeBox()), 'the item should start active').toBe(true);
    const deactivate = await pc.clickActiveExpectPrompt();
    expect(deactivate.title).toBe(ISR_PROMPT_DEACTIVATE.title);
    expect(deactivate.text).toContain(ISR_PROMPT_DEACTIVATE.text);
    expect(deactivate.buttons).toEqual(expect.arrayContaining(['Cancel', 'Ok']));
    await pc.cancelPrompt();
    expect(await pc.isBoxChecked(pc.activeBox())).toBe(true);
    expect(await pc.isDialogSaveEnabled()).toBe(false);
    await pc.clickActiveExpectPrompt();
    await pc.confirmPrompt();
    expect(await pc.isBoxChecked(pc.activeBox())).toBe(false);
    await expectSaveEnabled(true);
    await pc.saveAndConfirm();
    await pc.closeDialog();
    // The default search keeps the Active filter on, so the deactivated item drops out of the
    // result; the name search stands in for paging through the whole default result set.
    expect(await pc.isFilterChecked(1), 'the Active filter should be on by default').toBe(true);
    await pc.searchFor(ISR_AUTOMATION_ITEM.name, (n) => n === 0);
    await pc.toggleFilter(1);
    expect(await pc.isFilterChecked(1)).toBe(false);
    await pc.clickSearchAndWait((n) => n === 1);
    await pc.selectRowContaining(ISR_AUTOMATION_ITEM.productCodeId);
    await pc.openViewDialog();
    expect(await pc.isBoxChecked(pc.activeBox())).toBe(false);
    const activate = await pc.clickActiveExpectPrompt();
    expect(activate.title).toBe(ISR_PROMPT_ACTIVATE.title);
    expect(activate.text).toContain(ISR_PROMPT_ACTIVATE.text);
    expect(activate.buttons).toEqual(expect.arrayContaining(['Cancel', 'Ok']));
    await pc.confirmPrompt();
    expect(await pc.isBoxChecked(pc.activeBox())).toBe(true);
    await expectSaveEnabled(true);
    await pc.saveAndConfirm();
    await pc.closeDialog();
    await pc.toggleFilter(1);
    expect(await pc.isFilterChecked(1)).toBe(true);
    await pc.clickSearchAndWait((n) => n === 1);
    expect((await readAutomationRow()).Item).toBe(ISR_AUTOMATION_ITEM.name);
  });

  test('TC-ISR-PCD-031: A double click on Save sends one update and shows one message', { tag: '@C105656' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    const rowsBefore = await readHistoryRowsFresh();
    const topBefore = rowsBefore[0] ?? [];
    await pc.clickDialogTab('Item');
    await pc.appendToBox(pc.dialogNameBox(), 'X');
    await expectSaveEnabled(true);
    const outcome = await pc.doubleClickSaveAndConfirm();
    // The second click must land on a disabled button, never on a second save.
    expect(outcome.requests).toBe(1);
    expect(outcome.toasts).toBe(1);
    expect(await pc.isDialogOpen()).toBe(true);
    expect(await pc.isDialogSaveEnabled()).toBe(false);
    const rowsAfter = await readHistoryRowsFresh();
    expect(indexOfRow(rowsAfter, topBefore), 'exactly one new row should sit above the previous top row').toBe(1);
    await pc.clickDialogTab('Item');
    await restoreNameAndSave();
    await pc.closeDialog();
  });

  test('TC-ISR-PCD-032: A save whose request fails keeps the edits and can be retried', { tag: '@C105657' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    const edited = `${ISR_AUTOMATION_ITEM.name}X`;
    await pc.appendToBox(pc.dialogNameBox(), 'X');
    await expectSaveEnabled(true);
    const messages = await pc.saveWithRequestCutOff();
    expect(messages.some((m) => m.includes('Request aborted'))).toBe(true);
    expect(messages.some((m) => m.includes('Product updated successfully.'))).toBe(false);
    // Nothing is lost on the failed request: the edit, the dialog and Save all stay in place.
    expect(await pc.isDialogOpen()).toBe(true);
    await expect(pc.dialogNameBox()).toHaveValue(edited);
    expect(await pc.isDialogSaveEnabled()).toBe(true);
    expect((await readAutomationRow()).Item).toBe(ISR_AUTOMATION_ITEM.name);
    await pc.saveAndConfirm();
    expect((await readAutomationRow()).Item).toBe(edited);
    await restoreNameAndSave();
    expect((await readAutomationRow()).Item).toBe(ISR_AUTOMATION_ITEM.name);
    await pc.closeDialog();
  });
});

/** The chain item's page-grid row, failing loudly when it is not listed. */
const readChainRow = async (): Promise<Record<string, string>> => {
  const row = await pc.readPageGridRowWhere('Item', ISR_ZZ_CHAIN.item);
  if (!row) throw new Error(`the row of ${ISR_ZZ_CHAIN.item} is not in the grid`);
  return row;
};

/** Finds the automation chain, creating it through the Add caret's Category form when missing. */
const ensureChainListed = async (): Promise<void> => {
  const found = await pc.searchFor(ISR_ZZ_CHAIN.item, (n) => n !== null);
  if (found === 0) {
    // The toolbar (and its Add caret) mounts only with a selected row.
    await pc.searchFor(ISR_SEARCH_WORD, (n) => n !== null && n > 0);
    await pc.selectFirstRow();
    await pc.openAddSegmentMenu();
    await pc.chooseSegment('Category');
    await pc.fillCategoryChainForm(ISR_ZZ_CHAIN);
    await pc.saveNewCodeAndConfirm();
    await pc.ensureCleanSearch(ISR_OFFICE);
    await pc.searchFor(ISR_ZZ_CHAIN.item, (n) => n === 1);
  }
  await pc.selectRowContaining(ISR_ZZ_CHAIN.item);
  // The resting names are the precondition of every rename case; a run that stopped between
  // a rename and its restore shows up here with the suffix still on the level.
  const row = await readChainRow();
  expect(row.Category).toBe(ISR_ZZ_CHAIN.category);
  expect(row['Sub Category']).toBe(ISR_ZZ_CHAIN.subCategory);
  expect(row.Class).toBe(ISR_ZZ_CHAIN.className);
  expect(row['Sub Class']).toBe(ISR_ZZ_CHAIN.subClass);
};

/** Searches the chain back after a reload and reselects its item row. */
const reloadAndFindChain = async (): Promise<void> => {
  await pc.reloadPage();
  await pc.searchFor(ISR_ZZ_CHAIN_SEARCH_WORD, (n) => n !== null && n > 0);
  await pc.selectRowContaining(ISR_ZZ_CHAIN.item);
};

/**
 * Clears the organization of the chain's sub class and item when a stopped run left one there,
 * then proves the resting state by reopening both. Clearing the sub class asks about its items
 * on some paths and not on others, so the save is read for either outcome.
 */
const ensureChainOrgsClear = async (): Promise<void> => {
  await pc.openSegment('Sub Class');
  if ((await pc.readOrgValue('Sub Class')) !== 'None') {
    await pc.openOrgList('Sub Class');
    await pc.clickOrgEntry('None');
    await pc.closeOrgList();
    const outcome = await pc.clickSaveAndReadOutcome();
    if (outcome === 'prompt') {
      expect((await pc.answerItemsPrompt('Yes')).status, 'clearing the sub class should save').toBe(200);
    }
    expect(outcome, 'the sub class clear should either ask about its items or save').not.toBe('none');
  }
  await pc.closeDialog();
  await pc.openViewDialog();
  if ((await pc.readOrgValue('Item')) !== 'None') {
    await pc.openOrgList('Item');
    await pc.clickOrgEntry('None');
    await pc.closeOrgList();
    await pc.saveAndConfirm();
  }
  await reopenDialog();
  expect(await pc.readOrgValue('Sub Class'), 'the chain sub class should rest with no organization').toBe('None');
  expect(await pc.readOrgValue('Item'), 'the chain item should rest with no organization').toBe('None');
  await pc.closeDialog();
};

test.describe('Item Search View Product Code — hierarchy saves @item-search @product-code @view-product-code', () => {
  /** Renames one level through its segment, checks the grid before and after a reload, restores. */
  const renameLevelAndRestore = async (
    segment: string,
    placeholder: string,
    column: string,
    restingName: string,
  ): Promise<void> => {
    await pc.openSegment(segment);
    expect(await pc.readActiveTab()).toBe(segment);
    const box = pc.dialogBox(placeholder);
    await expect(box).toHaveValue(restingName);
    const renamed = `${restingName}${ISR_RENAME_SUFFIX}`;
    expect(await pc.appendToBox(box, ISR_RENAME_SUFFIX)).toBe(renamed);
    await expectSaveEnabled(true);
    await pc.saveAndConfirm();
    const cellsAfterSave = await pc.readPageGridColumn(column);
    expect(cellsAfterSave.length).toBeGreaterThan(0);
    expect(cellsAfterSave.every((c) => c === renamed), `every ${column} cell after the save`).toBe(true);
    await pc.closeDialog();
    await reloadAndFindChain();
    const cellsAfterReload = await pc.readPageGridColumn(column);
    expect(cellsAfterReload.length).toBeGreaterThan(0);
    expect(cellsAfterReload.every((c) => c === renamed), `every ${column} cell after the reload`).toBe(true);
    await pc.openSegment(segment);
    await expect(pc.dialogBox(placeholder)).toHaveValue(renamed);
    await pc.setBoxValue(pc.dialogBox(placeholder), restingName);
    await pc.saveAndConfirm();
    const restoredCells = await pc.readPageGridColumn(column);
    expect(restoredCells.length).toBeGreaterThan(0);
    expect(restoredCells.every((c) => c === restingName), `every ${column} cell after the restore`).toBe(true);
    await pc.closeDialog();
  };

  test.beforeEach(async ({ authenticatedSession, config }) => {
    pc = new ProductCodePage(authenticatedSession.page, config);
    await pc.ensureCleanSearch(ISR_OFFICE);
    await ensureChainListed();
  });

  test('TC-ISR-PCD-033: Renaming the Sub Class saves and every item under it shows the new name', { tag: '@C105658' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(420_000);
    await renameLevelAndRestore('Sub Class', 'Enter sub-class name', 'Sub Class', ISR_ZZ_CHAIN.subClass);
  });

  test('TC-ISR-PCD-034: Renaming the Class saves and reads back', { tag: '@C105659' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(420_000);
    await renameLevelAndRestore('Class', 'Enter class name', 'Class', ISR_ZZ_CHAIN.className);
  });

  test('TC-ISR-PCD-035: Renaming the Sub Category saves and reads back', { tag: '@C105660' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(420_000);
    await renameLevelAndRestore('Sub Category', 'Enter sub-category name', 'Sub Category', ISR_ZZ_CHAIN.subCategory);
  });

  test('TC-ISR-PCD-036: Renaming the Category saves only the Category level', { tag: '@C105661' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(420_000);
    await pc.openSegment('Category');
    expect(await pc.readActiveTab()).toBe('Category');
    expect(await pc.readDialogSections()).toEqual(['Category']);
    const box = pc.dialogBox('Enter category name');
    await expect(box).toHaveValue(ISR_ZZ_CHAIN.category);
    const renamed = `${ISR_ZZ_CHAIN.category}${ISR_RENAME_SUFFIX}`;
    expect(await pc.appendToBox(box, ISR_RENAME_SUFFIX)).toBe(renamed);
    await expectSaveEnabled(true);
    await pc.saveAndConfirm();
    await pc.closeDialog();
    await reloadAndFindChain();
    const row = await readChainRow();
    expect(row.Category).toBe(renamed);
    // Only the Category level changed; every lower level keeps its name.
    expect(row['Sub Category']).toBe(ISR_ZZ_CHAIN.subCategory);
    expect(row.Class).toBe(ISR_ZZ_CHAIN.className);
    expect(row['Sub Class']).toBe(ISR_ZZ_CHAIN.subClass);
    expect(row.Item).toBe(ISR_ZZ_CHAIN.item);
    await pc.openSegment('Category');
    await pc.setBoxValue(pc.dialogBox('Enter category name'), ISR_ZZ_CHAIN.category);
    await pc.saveAndConfirm();
    expect((await readChainRow()).Category).toBe(ISR_ZZ_CHAIN.category);
    await pc.closeDialog();
  });

  test('TC-ISR-PCD-037: Changing the Service Type at the Sub Class level saves and reads back', { tag: '@C105662' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    await pc.openSegment('Sub Class');
    const original = await pc.readComboValue(pc.ownServiceTypeCombo());
    expect(original).not.toBe('');
    const services = await pc.openComboAndReadOptions(pc.ownServiceTypeCombo());
    const other = services.find((s) => s !== original);
    if (!other) throw new Error(`the Sub Class Service Type list offers no second service: ${services.join(', ')}`);
    await pc.chooseInOpenList(other);
    expect(await pc.readComboValue(pc.ownServiceTypeCombo())).toBe(other);
    await expectSaveEnabled(true);
    await pc.saveAndConfirm();
    await pc.closeDialog();
    await pc.openSegment('Sub Class');
    expect(await pc.readComboValue(pc.ownServiceTypeCombo())).toBe(other);
    await pc.chooseComboOption(pc.ownServiceTypeCombo(), original);
    await pc.saveAndConfirm();
    await pc.closeDialog();
    await pc.openSegment('Sub Class');
    expect(await pc.readComboValue(pc.ownServiceTypeCombo())).toBe(original);
    await pc.closeDialog();
  });

  test('TC-ISR-PCD-038: Flipping Barcodeable on the Sub Class propagates to its items', { tag: '@C105663' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    await pc.openSegment('Sub Class');
    expect(await pc.readDialogCheckboxLabels()).toEqual(['Barcodeable', 'Active']);
    expect(await pc.isBoxDisabled(pc.barcodeableBox())).toBe(false);
    const original = await pc.isBoxChecked(pc.barcodeableBox());
    await pc.clickBarcodeable();
    expect(await pc.isBoxChecked(pc.barcodeableBox())).toBe(!original);
    await expectSaveEnabled(true);
    await pc.saveAndConfirm();
    await pc.closeDialog();
    // The chain's item shows the new state on its own Sub Class section, still locked there.
    await pc.openViewDialog();
    expect(await pc.readDialogCheckboxLabels()).toEqual(['Barcodeable', 'Active']);
    expect(await pc.isBoxChecked(pc.barcodeableBox())).toBe(!original);
    expect(await pc.isBoxDisabled(pc.barcodeableBox())).toBe(true);
    await pc.closeDialog();
    await pc.openSegment('Sub Class');
    await pc.clickBarcodeable();
    await expectSaveEnabled(true);
    await pc.saveAndConfirm();
    await pc.closeDialog();
    await pc.openViewDialog();
    expect(await pc.isBoxChecked(pc.barcodeableBox())).toBe(original);
    await pc.closeDialog();
  });

  // TC-ISR-PCD-039 (deactivating a level that still has assets attached is refused) needs a
  // sub class whose items have assets attached; the automation cannot create assets.

  test('TC-ISR-PCD-040: Choosing an organization on the Sub Class saves and reaches its items', { tag: '@C105665' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    await ensureChainOrgsClear();
    await pc.openSegment('Sub Class');
    await pc.openOrgList('Sub Class');
    await pc.clickOrgEntry(ISR_ORG_PICK);
    await pc.closeOrgList();
    expect(await pc.readOrgValue('Sub Class')).toBe(ISR_ORG_PICK);
    await expectSaveEnabled(true);
    // Save asks first whether the change should reach the existing items.
    const prompt = await pc.clickSaveExpectItemsPrompt();
    expect(prompt.title).toBe(ISR_PROMPT_SUBCLASS_ORG.title);
    expect(prompt.text).toContain(ISR_PROMPT_SUBCLASS_ORG.text);
    expect(prompt.buttons).toEqual([...ISR_PROMPT_SUBCLASS_ORG.buttons]);
    const outcome = await pc.answerItemsPrompt('Yes');
    expect(outcome.status, 'the update request should return 200').toBe(200);
    expect(outcome.messages).toEqual([ISR_UPDATE_MESSAGE]);
    await expectSaveEnabled(false);
    expect(await pc.isDialogOpen()).toBe(true);
    await pc.closeDialog();
    await pc.openSegment('Sub Class');
    expect(await pc.readOrgValue('Sub Class')).toBe(ISR_ORG_PICK);
    await pc.closeDialog();
    // The item under the sub class shows the country on both its sections.
    await pc.openViewDialog();
    expect(await pc.readOrgValue('Sub Class')).toBe(ISR_ORG_PICK);
    expect(await pc.readOrgValue('Item')).toBe(ISR_ORG_PICK);
    await pc.closeDialog();
    // The restore runs through the shared reset: clearing the sub class to None saves without
    // asking about the items, so the item is cleared on its own segment afterwards.
    await ensureChainOrgsClear();
  });
});

test.describe('Item Search View Product Code — Translations @item-search @product-code @view-product-code', () => {
  test.beforeEach(async ({ authenticatedSession, config }) => {
    pc = new ProductCodePage(authenticatedSession.page, config);
    await pc.ensureCleanSearch(ISR_OFFICE);
    await openAutomationItem();
  });

  /** Reopens the dialog and lands on the Translations tab. */
  const reopenOnTranslations = async (): Promise<void> => {
    await reopenDialog();
    await pc.clickDialogTab('Translations');
  };

  test('TC-ISR-PCD-041: Each translation box accepts 256 characters and refuses the 257th', { tag: '@C105666' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    await pc.clickDialogTab('Translations');
    const nameBox = pc.translationNameBox(ISR_LANGUAGE_US);
    const descriptionBox = pc.translationDescriptionBox(ISR_LANGUAGE_US);
    const atCap = 'T'.repeat(ISR_TRANSLATION_MAX_LENGTH);
    expect(await pc.fillBox(nameBox, atCap)).toHaveLength(ISR_TRANSLATION_MAX_LENGTH);
    await expectFlaggedInvalid(nameBox, false);
    await expectSaveEnabled(true);
    // The boxes have no typing limit of their own; the form announces the overflow on the box.
    expect(await pc.appendToBox(nameBox, 'T')).toHaveLength(ISR_TRANSLATION_MAX_LENGTH + 1);
    await expectFlaggedInvalid(nameBox, true);
    await expectSaveEnabled(false);
    expect(await pc.removeLastCharacter(nameBox)).toHaveLength(ISR_TRANSLATION_MAX_LENGTH);
    await expectFlaggedInvalid(nameBox, false);
    await expectSaveEnabled(true);
    expect(await pc.fillBox(nameBox, '')).toBe('');
    expect(await pc.fillBox(descriptionBox, atCap)).toHaveLength(ISR_TRANSLATION_MAX_LENGTH);
    await expectFlaggedInvalid(descriptionBox, false);
    await expectSaveEnabled(true);
    expect(await pc.appendToBox(descriptionBox, 'T')).toHaveLength(ISR_TRANSLATION_MAX_LENGTH + 1);
    await expectFlaggedInvalid(descriptionBox, true);
    await expectSaveEnabled(false);
    expect(await pc.fillBox(descriptionBox, '')).toBe('');
    await pc.closeDialog();
  });

  test('TC-ISR-PCD-042: Editing one language\'s Name saves and reads back after reopening', { tag: '@C105667' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    await pc.clickDialogTab('Translations');
    const before = await pc.readTranslationValues();
    expect(before.length).toBeGreaterThan(0);
    await expect(pc.translationNameBox(ISR_LANGUAGE_SPANISH), 'the Spanish Name should start blank').toHaveValue('');
    await pc.setBoxValue(pc.translationNameBox(ISR_LANGUAGE_SPANISH), ISR_TRANSLATION_TEXTS.spanishName);
    await expectSaveEnabled(true);
    await pc.saveAndConfirm();
    expect(await pc.isDialogOpen()).toBe(true);
    await reopenOnTranslations();
    await expect(pc.translationNameBox(ISR_LANGUAGE_SPANISH)).toHaveValue(ISR_TRANSLATION_TEXTS.spanishName);
    // Every other box is exactly as it was.
    const after = await pc.readTranslationValues();
    const spanishIndex = after.indexOf(ISR_TRANSLATION_TEXTS.spanishName);
    expect(spanishIndex).toBeGreaterThan(-1);
    expect(after.filter((_, i) => i !== spanishIndex)).toEqual(before.filter((_, i) => i !== spanishIndex));
    await pc.clearBoxBySelectAll(pc.translationNameBox(ISR_LANGUAGE_SPANISH));
    await expectSaveEnabled(true);
    await pc.saveAndConfirm();
    await reopenOnTranslations();
    await expect(pc.translationNameBox(ISR_LANGUAGE_SPANISH)).toHaveValue('');
    await pc.closeDialog();
  });

  test('TC-ISR-PCD-043: A blank translation saves clean and reads back blank', { tag: '@C105668' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    await pc.clickDialogTab('Translations');
    await expect(pc.translationNameBox(ISR_LANGUAGE_FRENCH), 'the French Name should start blank').toHaveValue('');
    await pc.setBoxValue(pc.translationNameBox(ISR_LANGUAGE_FRENCH), ISR_TRANSLATION_TEXTS.frenchName);
    await pc.saveAndConfirm();
    await reopenOnTranslations();
    await expect(pc.translationNameBox(ISR_LANGUAGE_FRENCH)).toHaveValue(ISR_TRANSLATION_TEXTS.frenchName);
    expect(await pc.clearBoxBySelectAll(pc.translationNameBox(ISR_LANGUAGE_FRENCH))).toBe('');
    await expectFlaggedInvalid(pc.translationNameBox(ISR_LANGUAGE_FRENCH), false);
    await expectSaveEnabled(true);
    // An empty box is a valid value: the save completes with only the confirmation message.
    await pc.armToastRecorder();
    await pc.saveAndConfirm();
    const messages = await pc.readRecordedToasts();
    expect(messages.filter((m) => m.includes('Product updated successfully.'))).toHaveLength(1);
    expect(messages.filter((m) => !m.includes('Product updated successfully.'))).toEqual([]);
    await reopenOnTranslations();
    await expect(pc.translationNameBox(ISR_LANGUAGE_FRENCH)).toHaveValue('');
    await pc.closeDialog();
  });

  test('TC-ISR-PCD-044: An Item edit and a translation edit in one Save both persist', { tag: '@C105669' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    const editedName = `${ISR_AUTOMATION_ITEM.name} F5`;
    await pc.appendToBox(pc.dialogNameBox(), ' F5');
    await pc.clickDialogTab('Translations');
    await expect(pc.translationNameBox(ISR_LANGUAGE_US), 'the US English Name should start blank').toHaveValue('');
    await pc.setBoxValue(pc.translationNameBox(ISR_LANGUAGE_US), ISR_TRANSLATION_TEXTS.usNameWithItemEdit);
    await expectSaveEnabled(true);
    await pc.armToastRecorder();
    await pc.saveAndConfirm();
    expect((await pc.readRecordedToasts()).filter((m) => m.includes('Product updated successfully.'))).toHaveLength(1);
    await reopenDialog();
    await expect(pc.dialogNameBox()).toHaveValue(editedName);
    await pc.clickDialogTab('Translations');
    await expect(pc.translationNameBox(ISR_LANGUAGE_US)).toHaveValue(ISR_TRANSLATION_TEXTS.usNameWithItemEdit);
    await pc.clickDialogTab('Item');
    await pc.setBoxValue(pc.dialogNameBox(), ISR_AUTOMATION_ITEM.name);
    await pc.clickDialogTab('Translations');
    await pc.clearBoxBySelectAll(pc.translationNameBox(ISR_LANGUAGE_US));
    await pc.saveAndConfirm();
    await reopenDialog();
    await expect(pc.dialogNameBox()).toHaveValue(ISR_AUTOMATION_ITEM.name);
    await pc.clickDialogTab('Translations');
    await expect(pc.translationNameBox(ISR_LANGUAGE_US)).toHaveValue('');
    await pc.closeDialog();
  });
});

test.describe('Item Search View Product Code — History grid @item-search @product-code @view-product-code', () => {
  test.beforeEach(async ({ authenticatedSession, config }) => {
    pc = new ProductCodePage(authenticatedSession.page, config);
    await pc.ensureCleanSearch(ISR_OFFICE);
    await openAutomationItem();
  });

  test('TC-ISR-PCD-045: The History grid is read-only', { tag: '@C105670' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    const rowsBefore = await readHistoryRowsFresh();
    const requests = pc.startRequestCounter('/navigator/api/');
    await pc.clickHistoryCell(0, 0);
    await pc.clickHistoryRowElsewhere(0);
    expect(await pc.readHistoryEditorCount()).toBe(0);
    expect(await pc.isAnyListOrMenuOpen()).toBe(false);
    expect(await pc.readHistoryRows()).toEqual(rowsBefore);
    requests.stop();
    expect(requests.read(), 'a click on the grid should send nothing').toBe(0);
    await pc.openHistoryColumnMenu(ISR_HISTORY_SORT_COLUMN);
    expect(await pc.readOpenMenuItems()).toEqual([...ISR_COLUMN_MENU_ITEMS]);
    await pc.closeOpenMenu();
    expect(await pc.isDialogOpen()).toBe(true);
    await pc.openHistoryColumnMenu(ISR_HISTORY_NAME_COLUMN);
    expect(await pc.readOpenMenuItems()).toEqual([...ISR_HISTORY_SORT_ONLY_MENU_ITEMS]);
    await pc.closeOpenMenu();
    await pc.closeDialog();
  });

  test('TC-ISR-PCD-046: An Item save adds a new top row to the History grid', { tag: '@C105671' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    const account = process.env.NAVIGATOR_USERNAME ?? '';
    expect(account, 'the signed-in account should be known to the run').not.toBe('');
    const rowsBefore = await readHistoryRowsFresh();
    const topBefore = rowsBefore[0] ?? [];
    await pc.clickDialogTab('Item');
    const parentName = await pc.readComboValue(pc.hierarchyCombo('Sub Class'));
    const editedName = `${ISR_AUTOMATION_ITEM.name}X`;
    await pc.appendToBox(pc.dialogNameBox(), 'X');
    const clickedAt = await pc.saveAndConfirm();
    const rowsAfter = await readHistoryRowsFresh();
    expect(indexOfRow(rowsAfter, topBefore), 'the previous top row should now be second').toBe(1);
    const top = await pc.readHistoryTopRow();
    expect(top.Action).toBe(ISR_HISTORY_ACTION_UPDATE);
    expect(top['Product Name']).toBe(editedName);
    expect(top['Parent Name']).toBe(parentName);
    expect(top['Modified By']).toBe(account);
    expectStampAtSave(top['Modified Date'] ?? '', clickedAt);
    // Booleans in this grid render as Yes or blank.
    expect(top.Barcodeable).toBe(ISR_HISTORY_YES);
    expect(top.Active).toBe(ISR_HISTORY_YES);
    await pc.clickDialogTab('Item');
    await restoreNameAndSave();
    await pc.closeDialog();
  });

  test('TC-ISR-PCD-047: Translation-only and organization-only saves each add a History row', { tag: '@C105672' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(420_000);
    const rowsBefore = await readHistoryRowsFresh();
    const topBefore = rowsBefore[0] ?? [];
    await pc.clickDialogTab('Translations');
    await expect(pc.translationNameBox(ISR_LANGUAGE_US), 'the US English Name should start blank').toHaveValue('');
    await pc.setBoxValue(pc.translationNameBox(ISR_LANGUAGE_US), ISR_TRANSLATION_TEXTS.usNameAlone);
    const translationSavedAt = await pc.saveAndConfirm();
    await pc.closeDialog();
    await pc.openViewDialog();
    const rowsAfterTranslation = await readHistoryRowsFresh();
    expect(indexOfRow(rowsAfterTranslation, topBefore), 'one new row should sit above the noted row').toBe(1);
    const translationRow = await pc.readHistoryTopRow();
    expect(translationRow.Action).toBe(ISR_HISTORY_ACTION_UPDATE);
    expectStampAtSave(translationRow['Modified Date'] ?? '', translationSavedAt);
    await pc.clickDialogTab('Item');
    expect(await pc.readOrgValue('Item'), 'the resting organization should be None').toBe('None');
    await pc.openOrgList('Item');
    await pc.clickOrgEntry(ISR_ORG_PICK);
    await pc.closeOrgList();
    const orgSavedAt = await pc.saveAndConfirm();
    await pc.closeDialog();
    await pc.openViewDialog();
    const rowsAfterOrg = await readHistoryRowsFresh();
    expect(indexOfRow(rowsAfterOrg, rowsAfterTranslation[0] ?? []), 'another new row should sit on top').toBe(1);
    const orgRow = await pc.readHistoryTopRow();
    expect(orgRow.Action).toBe(ISR_HISTORY_ACTION_UPDATE);
    expectStampAtSave(orgRow['Modified Date'] ?? '', orgSavedAt);
    await pc.clickDialogTab('Translations');
    await pc.clearBoxBySelectAll(pc.translationNameBox(ISR_LANGUAGE_US));
    await pc.clickDialogTab('Item');
    await pc.openOrgList('Item');
    await pc.clickOrgEntry('None');
    await pc.closeOrgList();
    await pc.saveAndConfirm();
    await pc.closeDialog();
  });

  test('TC-ISR-PCD-048: History paging, sorting and column hiding work and hiding persists', { tag: '@C105673' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(420_000);
    const pageHeaderBefore = await pc.readPageGridHeaderNames();
    await readHistoryRowsFresh();
    expect(await pc.readHistoryRowsPerPage()).toBe(ISR_HISTORY_DEFAULT_PAGE_SIZE);
    expect(await pc.readHistoryPageNumber()).toBe('1');
    const totalPages = await pc.readHistoryTotalPages();
    expect(totalPages, 'the automation item history should span several pages').not.toBeNull();
    expect(totalPages ?? 0).toBeGreaterThan(1);
    expect(await pc.isHistoryPagerEnabled('Go to first page')).toBe(false);
    expect(await pc.isHistoryPagerEnabled('Go to previous page')).toBe(false);
    await pc.chooseHistoryRowsPerPage(ISR_HISTORY_SMALL_PAGE_SIZE);
    expect(await pc.readHistoryRowCount()).toBe(Number(ISR_HISTORY_SMALL_PAGE_SIZE));
    expect(await pc.readHistoryPageNumber()).toBe('1');
    await pc.clickHistoryPager('Go to next page');
    expect(await pc.readHistoryPageNumber()).toBe('2');
    expect(await pc.isHistoryPagerEnabled('Go to previous page')).toBe(true);
    expect(await pc.isHistoryPagerEnabled('Go to first page')).toBe(true);
    await pc.clickHistoryPager('Go to last page');
    expect(await pc.isHistoryPagerEnabled('Go to next page')).toBe(false);
    expect(await pc.isHistoryPagerEnabled('Go to last page')).toBe(false);
    expect(await pc.readHistoryRowCount()).toBeLessThanOrEqual(Number(ISR_HISTORY_SMALL_PAGE_SIZE));
    await pc.typeHistoryPageNumber('2');
    expect(await pc.readHistoryPageNumber()).toBe('2');
    await pc.clickHistoryPager('Go to first page');
    expect(await pc.readHistoryPageNumber()).toBe('1');
    await pc.openHistoryColumnMenu(ISR_HISTORY_SORT_COLUMN);
    await pc.clickHistorySort('Sort ascending');
    expect((await pc.readHistoryTopRow()).Action).toBe(ISR_HISTORY_ACTION_ADD);
    await pc.openHistoryColumnMenu(ISR_HISTORY_SORT_COLUMN);
    await pc.clickHistorySort('Sort descending');
    const newestFirst = await pc.readHistoryRows();
    expect(newestFirst.length).toBeGreaterThan(1);
    const lastCell = (row: string[]): string => row[row.length - 1] ?? '';
    expect(stampKey(lastCell(newestFirst[0] ?? []))).toBeGreaterThanOrEqual(stampKey(lastCell(newestFirst[1] ?? [])));
    await pc.openHistoryColumnMenu(ISR_HISTORY_HIDE_COLUMN);
    await pc.clickHideColumnInOpenMenu();
    const withoutWeight = ISR_HISTORY_COLUMNS.filter((c) => c !== ISR_HISTORY_HIDE_COLUMN);
    expect(await pc.readDialogGridHeaderNames()).toEqual(withoutWeight);
    // Hiding a column is kept in the browser across a reopen; rows per page is not.
    await reopenDialog();
    await readHistoryRowsFresh();
    expect(await pc.readDialogGridHeaderNames()).toEqual(withoutWeight);
    expect(await pc.readHistoryRowsPerPage()).toBe(ISR_HISTORY_DEFAULT_PAGE_SIZE);
    await pc.openHistoryGridOptions();
    expect(await pc.isGridOptionChecked(ISR_HISTORY_HIDE_COLUMN)).toBe(false);
    await pc.clickMenuItem(ISR_HISTORY_HIDE_COLUMN);
    await pc.closeOpenMenu();
    expect(await pc.readDialogGridHeaderNames()).toEqual([...ISR_HISTORY_COLUMNS]);
    expect(await pc.readPageGridHeaderNames()).toEqual(pageHeaderBefore);
    await pc.closeDialog();
  });

  test('TC-ISR-PCD-049: The oldest History row is the create row', { tag: '@C105674' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    const newest = await readHistoryRowsFresh();
    const newestTop = await pc.readHistoryTopRow();
    const newestStamp = newestTop['Modified Date'] ?? '';
    await pc.openHistoryColumnMenu(ISR_HISTORY_SORT_COLUMN);
    await pc.clickHistorySort('Sort ascending');
    expect(await pc.readHistoryRowCount()).toBeGreaterThan(0);
    const oldest = await pc.readHistoryTopRow();
    // Every saved code carries at least its create row, so this row is the floor of the grid.
    expect(oldest.Action).toBe(ISR_HISTORY_ACTION_ADD);
    expect(oldest['Parent Name']).not.toBe('');
    expect(oldest['Product Name']).toBe(ISR_AUTOMATION_ITEM.name);
    expect(stampKey(oldest['Modified Date'] ?? '')).toBeLessThanOrEqual(stampKey(newestStamp));
    await pc.openHistoryColumnMenu(ISR_HISTORY_SORT_COLUMN);
    await pc.clickHistorySort('Sort descending');
    expect((await pc.readHistoryTopRow())['Modified Date']).toBe(newestStamp);
    expect(newest.length).toBeGreaterThan(0);
    await pc.closeDialog();
  });
});

test.describe('Item Search View Product Code — Sub Class organization prompt @item-search @product-code @view-product-code', () => {
  test.beforeEach(async ({ authenticatedSession, config }) => {
    pc = new ProductCodePage(authenticatedSession.page, config);
    await pc.ensureCleanSearch(ISR_OFFICE);
    await ensureChainListed();
    await ensureChainOrgsClear();
  });

  /** Opens the Sub Class segment and chooses one country, leaving the change unsaved. */
  const chooseOnSubClass = async (country: string): Promise<void> => {
    await pc.openSegment('Sub Class');
    await pc.openOrgList('Sub Class');
    await pc.clickOrgEntry(country);
    await pc.closeOrgList();
    await expectSaveEnabled(true);
  };

  /** The checked countries of one section's list, read and closed again. */
  const readCheckedOn = async (section: 'Sub Class' | 'Item'): Promise<string[]> => {
    await pc.openOrgList(section);
    const checked = [...(await pc.readOrgCheckedEntries())].sort();
    await pc.closeOrgList();
    return checked;
  };

  /** The organization shown on the chain item's two sections after a fresh open. */
  const readItemOrgs = async (): Promise<{ subClass: string; item: string }> => {
    await pc.openViewDialog();
    const orgs = { subClass: await pc.readOrgValue('Sub Class'), item: await pc.readOrgValue('Item') };
    await pc.closeDialog();
    return orgs;
  };

  /** Answers the open prompt with Yes and checks the update landed. */
  const answerYesAndConfirm = async (): Promise<void> => {
    const outcome = await pc.answerItemsPrompt('Yes');
    expect(outcome.status, 'the update request should return 200').toBe(200);
    expect(outcome.messages).toEqual([ISR_UPDATE_MESSAGE]);
    await expectSaveEnabled(false);
  };

  test('TC-ISR-PCD-050: Closing the items prompt unanswered keeps the change unsaved', { tag: '@C105675' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    await chooseOnSubClass(ISR_ORG_PICK);
    const prompt = await pc.clickSaveExpectItemsPrompt();
    expect(prompt.title).toBe(ISR_PROMPT_SUBCLASS_ORG.title);
    expect(prompt.text).toContain(ISR_PROMPT_SUBCLASS_ORG.text);
    expect(prompt.buttons).toEqual([...ISR_PROMPT_SUBCLASS_ORG.buttons]);
    expect(await pc.countUpdateRequestsDuring(() => pc.dismissItemsPrompt()), 'closing the prompt should send nothing').toBe(0);
    expect(await pc.isItemsPromptOpen()).toBe(false);
    expect(await pc.readOrgValue('Sub Class'), 'the chosen country should still be shown').toBe(ISR_ORG_PICK);
    await expectSaveEnabled(true);
    await pc.closeDialog();
    await pc.openSegment('Sub Class');
    expect(await pc.readOrgValue('Sub Class'), 'nothing should have been saved').toBe('None');
    await pc.closeDialog();
  });

  test('TC-ISR-PCD-051: Answering No while the item has no organization is refused and keeps the edits', { tag: '@C105676' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    await chooseOnSubClass(ISR_ORG_PICK);
    await pc.clickSaveExpectItemsPrompt();
    const outcome = await pc.answerItemsPrompt('No');
    expect(outcome.messages).toEqual([ISR_ORG_REFUSAL_ITEM_NONE]);
    expect(await pc.readOrgValue('Sub Class'), 'the chosen country should still be shown').toBe(ISR_ORG_PICK);
    await expectSaveEnabled(true);
    await pc.closeDialog();
    await pc.openSegment('Sub Class');
    expect(await pc.readOrgValue('Sub Class'), 'nothing should have been saved').toBe('None');
    await pc.closeDialog();
    expect(await readItemOrgs()).toEqual({ subClass: 'None', item: 'None' });
    // The refusal is answered as a rejected request (the message rides an error status, a server
    // error today, which is the accepted shape), so the case asserts that nothing succeeded rather
    // than the exact code.
    expect(outcome.status, 'a refused answer should not be a successful update').toBeGreaterThanOrEqual(400);
  });

  test('TC-ISR-PCD-052: Answering No when the item already fits updates only the Sub Class', { tag: '@C105677' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(420_000);
    // The item takes the country first, so a later No on the sub class leaves it within the set.
    await pc.openViewDialog();
    await pc.openOrgList('Item');
    await pc.clickOrgEntry(ISR_ORG_PICK);
    await pc.closeOrgList();
    await pc.saveAndConfirm();
    await pc.closeDialog();
    await chooseOnSubClass(ISR_ORG_PICK);
    await pc.clickSaveExpectItemsPrompt();
    await answerYesAndConfirm();
    await pc.openOrgList('Sub Class');
    await pc.clickOrgEntry(ISR_ORG_SECOND_PICK);
    await pc.closeOrgList();
    await expectSaveEnabled(true);
    await pc.clickSaveExpectItemsPrompt();
    const kept = await pc.answerItemsPrompt('No');
    expect(kept.status, 'No should save the sub class alone').toBe(200);
    expect(kept.messages).toEqual([ISR_UPDATE_MESSAGE]);
    await expectSaveEnabled(false);
    await pc.closeDialog();
    await pc.openSegment('Sub Class');
    expect(await readCheckedOn('Sub Class')).toEqual([ISR_ORG_PICK, ISR_ORG_SECOND_PICK].sort());
    await pc.closeDialog();
    await pc.openViewDialog();
    expect(await readCheckedOn('Sub Class')).toEqual([ISR_ORG_PICK, ISR_ORG_SECOND_PICK].sort());
    expect(await readCheckedOn('Item')).toEqual([ISR_ORG_PICK]);
    await pc.closeDialog();
    // Taking the item's own country off the sub class with No is refused while the item has it.
    await pc.openSegment('Sub Class');
    await pc.openOrgList('Sub Class');
    await pc.clickOrgEntry(ISR_ORG_PICK);
    expect(await pc.readOrgCheckedEntries()).toEqual([ISR_ORG_SECOND_PICK]);
    await pc.closeOrgList();
    await expectSaveEnabled(true);
    await pc.clickSaveExpectItemsPrompt();
    const refused = await pc.answerItemsPrompt('No');
    // The status of a refused answer is asserted by the earlier No case once for the family.
    expect(refused.messages).toEqual([ISR_ORG_REFUSAL_ITEM_KEEPS]);
    expect(await pc.readOrgValue('Sub Class'), 'the pending choice should still be shown').toBe(ISR_ORG_SECOND_PICK);
    await expectSaveEnabled(true);
    await pc.closeDialog();
    await pc.openSegment('Sub Class');
    expect(await readCheckedOn('Sub Class')).toEqual([ISR_ORG_PICK, ISR_ORG_SECOND_PICK].sort());
    await pc.closeDialog();
    await ensureChainOrgsClear();
  });

  test('TC-ISR-PCD-053: Removing one organization from the Sub Class reaches its items', { tag: '@C105678' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(420_000);
    await pc.openSegment('Sub Class');
    await pc.openOrgList('Sub Class');
    await pc.clickOrgEntry(ISR_ORG_PICK);
    await pc.clickOrgEntry(ISR_ORG_SECOND_PICK);
    expect([...(await pc.readOrgCheckedEntries())].sort()).toEqual([ISR_ORG_PICK, ISR_ORG_SECOND_PICK].sort());
    await pc.closeOrgList();
    await expectSaveEnabled(true);
    await pc.clickSaveExpectItemsPrompt();
    await answerYesAndConfirm();
    await pc.closeDialog();
    await pc.openViewDialog();
    expect(await readCheckedOn('Sub Class')).toEqual([ISR_ORG_PICK, ISR_ORG_SECOND_PICK].sort());
    expect(await readCheckedOn('Item')).toEqual([ISR_ORG_PICK, ISR_ORG_SECOND_PICK].sort());
    await pc.closeDialog();
    // Taking the second country off the sub class asks again, and Yes takes it off the item too.
    await pc.openSegment('Sub Class');
    await pc.openOrgList('Sub Class');
    await pc.clickOrgEntry(ISR_ORG_SECOND_PICK);
    expect(await pc.readOrgCheckedEntries()).toEqual([ISR_ORG_PICK]);
    await pc.closeOrgList();
    await expectSaveEnabled(true);
    await pc.clickSaveExpectItemsPrompt();
    await answerYesAndConfirm();
    await pc.closeDialog();
    expect(await readItemOrgs()).toEqual({ subClass: ISR_ORG_PICK, item: ISR_ORG_PICK });
    await ensureChainOrgsClear();
  });

  test('TC-ISR-PCD-054: Clearing the Sub Class organization to None saves at once and leaves its items as they are', { tag: '@C105679' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    await chooseOnSubClass(ISR_ORG_PICK);
    await pc.clickSaveExpectItemsPrompt();
    await answerYesAndConfirm();
    await pc.closeDialog();
    expect(await readItemOrgs()).toEqual({ subClass: ISR_ORG_PICK, item: ISR_ORG_PICK });
    await pc.openSegment('Sub Class');
    await pc.openOrgList('Sub Class');
    await pc.clickOrgEntry('None');
    await pc.closeOrgList();
    await expectSaveEnabled(true);
    // Clearing to None is the one removal that saves without the items prompt: the sub class
    // rests at None and the item keeps its own country until it is changed on the item itself.
    expect(await pc.clickSaveAndReadOutcome(), 'clearing to None should save without the items prompt').toBe('saved');
    await pc.closeDialog();
    expect(await readItemOrgs()).toEqual({ subClass: 'None', item: ISR_ORG_PICK });
    // The item's own country is cleared afterwards so the chain rests with no organization.
    await ensureChainOrgsClear();
  });
});

// Two behaviours found on other rows and on an unsaved pick. Neither case saves anything: the
// first only opens segment entries, the second discards its pick by closing the dialog.
test.describe('Item Search View Product Code — segment entries and unsaved picks @item-search @product-code @view-product-code', () => {
  test.beforeEach(async ({ authenticatedSession, config }) => {
    pc = new ProductCodePage(authenticatedSession.page, config);
    await pc.ensureCleanSearch(ISR_OFFICE);
  });

  test('TC-ISR-PCD-055: The Category entry of an item without a category is offered but opens nothing', { tag: '@C105680' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    await pc.searchFor(ISR_CATEGORYLESS_ITEM.name, (n) => n === 1);
    const row = await pc.readPageGridRow(ISR_CATEGORYLESS_ITEM.productCodeId);
    if (!row) throw new Error(`the row of product code ${ISR_CATEGORYLESS_ITEM.productCodeId} is not in the grid`);
    expect(row['Category'], 'the item should have no category (the precondition of this case)').toBe('');
    expect(row['Sub Class']).toBe(ISR_CATEGORYLESS_ITEM.subClass);
    await pc.selectRowContaining(ISR_CATEGORYLESS_ITEM.productCodeId);
    // The entries of the levels the item does have open their details from the same menu.
    for (const segment of ['Item', 'Sub Class']) {
      await pc.openViewSegmentMenu();
      expect(await pc.chooseSegmentAndReadOutcome(segment), `the ${segment} entry should open the details`).toEqual({ opened: true, chainReads: 1 });
      await pc.closeDialog();
    }
    await pc.openViewSegmentMenu();
    expect(await pc.readOpenMenuItems(), 'the menu offers the Category entry on this item too').toContain('Category');
    // With no category on the item there is nothing to show: the entry closes the menu and
    // opens no details, reads no chain and shows no message.
    expect(await pc.chooseSegmentAndReadOutcome('Category'), 'the Category entry should open nothing on an item without a category').toEqual({ opened: false, chainReads: 0 });
    expect(await pc.readOpenMenuItems(), 'the menu should have closed').toEqual([]);
  });

  test('TC-ISR-PCD-056: Picking another Sub Class keeps the saved identifier shown until the save', { tag: '@C105681' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    await openAutomationItem();
    const restingSubClassId = (await pc.readDialogProductCodeIds())[0] ?? '';
    expect(restingSubClassId).not.toBe('');
    const originalSubClass = await pc.readComboValue(pc.hierarchyCombo('Sub Class'));
    const subClasses = await pc.openComboAndReadOptions(pc.hierarchyCombo('Sub Class'));
    const otherSubClass = subClasses.find((s) => s !== originalSubClass);
    if (!otherSubClass) throw new Error(`the Class of the automation item offers no second sub class: ${subClasses.join(', ')}`);
    const fetchedId = await pc.chooseInOpenListAndReadFetchedIdentifier(otherSubClass);
    expect(fetchedId).not.toBe('');
    expect(fetchedId).not.toBe(restingSubClassId);
    expect(await pc.readComboValue(pc.hierarchyCombo('Sub Class'))).toBe(otherSubClass);
    await expectSaveEnabled(true);
    // The name box takes the pick at once while the identifier under it stays the saved sub
    // class's until the save lands (the saved pick is read back by the re-parent save case).
    expect((await pc.readDialogProductCodeIds())[0], 'the identifier should stay the saved one until the save').toBe(restingSubClassId);
    // Closing discards the pick: no update is sent and the resting sub class is back on reopen.
    expect(await pc.countUpdateRequestsDuring(() => pc.closeDialog())).toBe(0);
    await pc.openViewDialog();
    expect(await pc.readComboValue(pc.hierarchyCombo('Sub Class'))).toBe(originalSubClass);
    expect((await pc.readDialogProductCodeIds())[0]).toBe(restingSubClassId);
    await pc.closeDialog();
  });
});
