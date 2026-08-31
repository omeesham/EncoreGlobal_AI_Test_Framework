import { test, expect } from '../../src/fixtures/pages.fixture';
import {
  CORP_PRICING_OVERRIDE,
  CORP_PRICING_OVERRIDE_FIXTURE,
  CORP_PRICING_OVERRIDE_LABOR_BED,
  CORP_PRICING_OVERRIDE_LABOR_VOLUME_BED,
  CORP_PRICING_OVERRIDE_PICKER_BED,
  CORP_PRICING_OVERRIDE_UNSAVED_DIALOG,
  OVERRIDE_NUMERIC_CASES,
} from '../../src/data/corporate-override/override';
import {
  OVERRIDE_BVA_OFFICES,
  OVERRIDE_BVA_REJECTED,
  OVERRIDE_BVA_COMMITTED,
  OVERRIDE_BVA_DEFECTS,
  OVERRIDE_REJECTION_SIGNATURE,
} from '../../src/data/corporate-override/override';
import { saveAndVerifyCase } from '../../src/utils/field-case-runner';
import { CorporatePricingOverrideSelectors } from '../../src/selectors/corporate-override/override';

const GRID_ROW = CorporatePricingOverrideSelectors.ovrGridRowAny;

const LOC = CORP_PRICING_OVERRIDE_FIXTURE.office; // location picker search needle ('1606')
const ANCHOR = CORP_PRICING_OVERRIDE_FIXTURE.mutationRowAnchor.productGroupName;
const DEFAULTS = {
  overridePrice: CORP_PRICING_OVERRIDE_FIXTURE.mutationRowAnchor.overridePriceDefault,
  active: CORP_PRICING_OVERRIDE_FIXTURE.mutationRowAnchor.activeDefault,
};

test.describe('Corporate Pricing — Product Group Override: Labor grid (NM-2271) @corporate-pricing @override', () => {
  // Several beds share this suite, so setup/teardown is dispatched by TC id and each group keeps the
  // baseline it had as a separate describe. A reload lands on Equipment, so Labor beds re-switch tabs.
  const V_BED = CORP_PRICING_OVERRIDE_LABOR_VOLUME_BED;
  // Labor mutation fixture: office 1105, row 655 "General - Ops" (default 160.00, inactive).
  const L_LOC = CORP_PRICING_OVERRIDE_LABOR_BED.office;
  const L_ANCHOR = CORP_PRICING_OVERRIDE_LABOR_BED.mutationRowAnchor.productGroupName;
  const L_DEFAULTS = {
    overridePrice: CORP_PRICING_OVERRIDE_LABOR_BED.mutationRowAnchor.overridePriceDefault,
    active: CORP_PRICING_OVERRIDE_LABOR_BED.mutationRowAnchor.activeDefault,
  };
  // Unsaved-changes guard bed — 1105, small and well-known.
  const G_LOC = CORP_PRICING_OVERRIDE_LABOR_BED.office;
  const G_ANCHOR = CORP_PRICING_OVERRIDE_LABOR_BED.mutationRowAnchor.productGroupName;
  // Currency-gated picker bed — office 4104 (one Equipment override row, zero Labor rows).
  const K_BED = CORP_PRICING_OVERRIDE_PICKER_BED;
  // BVA bed — Labor rows PG 565 (Override Price 13.00, Max Discount 14.00 %) and
  // PG 893 (Override Price 12.00, Max Discount 6.00 %).
  const BED = OVERRIDE_BVA_OFFICES.labor;
  const ROW_PG565 = BED.rows[0].productGroupId;
  const ROW_PG893 = BED.rows[1].productGroupId;
  const ROW_1 = BED.rows[0].productGroupId; // PG 565, baseline 14.00 %
  const ROW_2 = BED.rows[1].productGroupId; // PG 893, baseline 6.00 %

  // Per-group TC-id sets driving the dispatched hooks below.
  const POPULATED_GRID_IDS = ['TC-CPR-OVR-049', 'TC-CPR-OVR-050', 'TC-CPR-OVR-051'];
  const SAVE_CYCLE_IDS = ['TC-CPR-OVR-052', 'TC-CPR-OVR-053', 'TC-CPR-OVR-054'];
  const UNSAVED_GUARD_IDS = ['TC-CPR-OVR-055', 'TC-CPR-OVR-056'];
  const PAGINATION_VOLUME_IDS = ['TC-CPR-OVR-057', 'TC-CPR-OVR-058', 'TC-CPR-OVR-059'];
  const KEYBOARD_IDS = ['TC-CPR-OVR-061'];
  const PICKER_IDS = ['TC-CPR-OVR-062', 'TC-CPR-OVR-063', 'TC-CPR-OVR-064'];
  const RPP_IDS = ['TC-CPR-OVR-120', 'TC-CPR-OVR-121', 'TC-CPR-OVR-122', 'TC-CPR-OVR-123'];
  const startsWithAny = (title: string, ids: string[]) => ids.some((id) => title.startsWith(id));

  test.beforeEach(async ({ corporatePricingOverridePage: p }, testInfo) => {
    const t = testInfo.title;
    if (startsWithAny(t, POPULATED_GRID_IDS) || startsWithAny(t, PAGINATION_VOLUME_IDS)) {
      test.setTimeout(120_000);
      await p.reloadAndReselect(V_BED.office, V_BED.office);
      await p.switchOverrideTab('Labor');
      await p.waitForGridRows();
    } else if (startsWithAny(t, UNSAVED_GUARD_IDS)) {
      test.setTimeout(150_000);
      await p.reloadAndReselect(G_LOC, G_LOC);
      await p.switchOverrideTab('Labor');
      await p.waitForGridRows();
    } else if (startsWithAny(t, KEYBOARD_IDS)) {
      test.setTimeout(90_000);
      await p.reloadAndReselect(LOC);
    } else if (startsWithAny(t, PICKER_IDS)) {
      test.setTimeout(150_000);
      await p.reloadAndReselect(K_BED.office, K_BED.office);
    } else if (startsWithAny(t, RPP_IDS)) {
      // Navigate to office 9460 Labor tab — reload ensures default 20-row page size
      await p.reloadAndReselectTab(V_BED.office, V_BED.office, 'Labor');
      // Sanity: the volume bed has 100+ rows, so page 1 at default 20 shows exactly 20
      const defaultRows = await p.getVisibleRowCount();
      expect(defaultRows).toBe(20);
    }
  });

  test.afterEach(async ({ corporatePricingOverridePage: p }, testInfo) => {
    if (!startsWithAny(testInfo.title, SAVE_CYCLE_IDS)) return;
    test.setTimeout(180_000);
    await p.ensureDefaultState(L_ANCHOR, L_DEFAULTS, L_LOC, L_LOC, 'Labor'); // belt-and-suspenders restore (per-test baseline)
  });

  test('TC-CPR-OVR-049: Labor tab renders a populated grid with real data on office 9460 (NM-2271)', async ({ corporatePricingOverridePage: p }) => {
    expect(await p.getActiveTab()).toBe('Labor');
    expect(await p.getVisibleRowCount()).toBeGreaterThan(0); // populated, not the empty state
    // The bed is a triple-digit data set — the items-found counter, not the visible page, carries the total
    const total = await p.getItemsFoundTotal();
    expect(total).toBeGreaterThan(CORP_PRICING_OVERRIDE_LABOR_VOLUME_BED.minExpectedRows);
    expect(await p.findRowByProductGroup(CORP_PRICING_OVERRIDE_LABOR_VOLUME_BED.page1FirstRowAnchor)).not.toBeNull();
  });

  test('TC-CPR-OVR-050: Labor grid text filter narrows to matching rows and clearing restores the page (NM-2271)', async ({ corporatePricingOverridePage: p }) => {
    const before = await p.getVisibleRowCount();
    await p.filterProductGroups(CORP_PRICING_OVERRIDE_LABOR_VOLUME_BED.filterNeedle);
    const narrowed = await p.getVisibleRowCount();
    expect(narrowed).toBeGreaterThan(0); // the anchor row matches
    expect(narrowed).toBeLessThan(before); // the filter actually narrowed a populated page
    expect(await p.findRowByProductGroup(CORP_PRICING_OVERRIDE_LABOR_VOLUME_BED.page1FirstRowAnchor)).not.toBeNull();
    await p.clearFilter();
    expect(await p.getVisibleRowCount()).toBeGreaterThan(narrowed); // clearing restores the fuller page
  });

  test('TC-CPR-OVR-051: Labor grid column sort orders Product Group Name ascending and descending (NM-2271)', async ({ corporatePricingOverridePage: p }) => {
    // Self-verifying monotonic oracle — resilient to data drift on the shared bed.
    const nameCol = CORP_PRICING_OVERRIDE.columnIndex.productGroupName;
    await p.sortColumnViaDropdown('Product Group Name', 'ascending');
    const asc = await p.getColumnCellValues(nameCol);
    expect(asc.length).toBeGreaterThan(1);
    for (let i = 1; i < asc.length; i++) {
      const prev = (asc[i - 1] ?? '').toLowerCase();
      const curr = (asc[i] ?? '').toLowerCase();
      expect(prev <= curr, 'ascending order holds at row ' + i + ': "' + prev + '" <= "' + curr + '"').toBe(true);
    }
    await p.sortColumnViaDropdown('Product Group Name', 'descending');
    const desc = await p.getColumnCellValues(nameCol);
    expect(desc.length).toBeGreaterThan(1);
    for (let i = 1; i < desc.length; i++) {
      const prev = (desc[i - 1] ?? '').toLowerCase();
      const curr = (desc[i] ?? '').toLowerCase();
      expect(prev >= curr, 'descending order holds at row ' + i + ': "' + prev + '" >= "' + curr + '"').toBe(true);
    }
  });

  // ── Labor save-cycle (mutation, fixture-restored) ──
  test('TC-CPR-OVR-052: Labor Override Price save-cycle persists after reload and restores (NM-2271)', { tag: '@mutation' }, async ({ corporatePricingOverridePage: p }) => {
    test.setTimeout(180_000);
    await saveAndVerifyCase({
      id: 'TC-CPR-OVR-052',
      label: 'Labor Override Price save-cycle',
      baseline: () => p.ensureDefaultState(L_ANCHOR, L_DEFAULTS, L_LOC, L_LOC, 'Labor'),
      act: async () => {
        const row = await p.findRowByProductGroup(L_ANCHOR);
        if (!row) throw new Error('Labor anchor row not found');
        await p.setOverridePrice(row, CORP_PRICING_OVERRIDE_LABOR_BED.laborEdited);
      },
      expectBeforeSave: async () => { expect(await p.isOverrideSaveEnabled()).toBe(true); },
      saveAndConfirm: () => p.saveAndConfirm(),
      reload: async () => {
        await p.reloadAndReselect(L_LOC, L_LOC);
        await p.switchOverrideTab('Labor');
      },
      expectAfterReload: async () => {
        const row = await p.findRowByProductGroup(L_ANCHOR);
        expect(row).not.toBeNull();
        expect(parseFloat(await p.readOverridePrice(row!)), 'Labor Override Price value persists after reload').toBe(parseFloat(CORP_PRICING_OVERRIDE_LABOR_BED.laborEdited));
      },
      cleanup: () => p.ensureDefaultState(L_ANCHOR, L_DEFAULTS, L_LOC, L_LOC, 'Labor'),
    });
  });

  test('TC-CPR-OVR-053: Labor Max Discount % save-cycle persists after reload and restores (NM-2271)', { tag: '@mutation' }, async ({ corporatePricingOverridePage: p }) => {
    test.setTimeout(180_000);
    await saveAndVerifyCase({
      id: 'TC-CPR-OVR-053',
      label: 'Labor Max Discount save-cycle',
      baseline: () => p.ensureDefaultState(L_ANCHOR, L_DEFAULTS, L_LOC, L_LOC, 'Labor'),
      act: async () => {
        const row = await p.findRowByProductGroup(L_ANCHOR);
        if (!row) throw new Error('Labor anchor row not found');
        await p.setMaxDiscount(row, OVERRIDE_NUMERIC_CASES.maxDiscount.edited);
      },
      expectBeforeSave: async () => { expect(await p.isOverrideSaveEnabled()).toBe(true); },
      saveAndConfirm: () => p.saveAndConfirm(),
      reload: async () => {
        await p.reloadAndReselect(L_LOC, L_LOC);
        await p.switchOverrideTab('Labor');
      },
      expectAfterReload: async () => {
        const row = await p.findRowByProductGroup(L_ANCHOR);
        expect(row).not.toBeNull();
        expect(parseFloat(await p.readMaxDiscount(row!))).toBe(parseFloat(OVERRIDE_NUMERIC_CASES.maxDiscount.edited));
      },
      // cleanup restores Override Price + Active; Max Discount returns to its unset baseline via the
      // afterEach ensureDefaultState reload (the fixture row's saved Max Discount is the unset default).
      cleanup: () => p.ensureDefaultState(L_ANCHOR, L_DEFAULTS, L_LOC, L_LOC, 'Labor'),
    });
  });

  test('TC-CPR-OVR-054: Labor Active toggle save-cycle persists after reload and restores (NM-2271)', { tag: '@mutation' }, async ({ corporatePricingOverridePage: p }) => {
    test.setTimeout(180_000);
    let original: boolean = L_DEFAULTS.active;
    await saveAndVerifyCase({
      id: 'TC-CPR-OVR-054',
      label: 'Labor Active toggle save-cycle',
      baseline: () => p.ensureDefaultState(L_ANCHOR, L_DEFAULTS, L_LOC, L_LOC, 'Labor'),
      act: async () => {
        const row = await p.findRowByProductGroup(L_ANCHOR);
        if (!row) throw new Error('Labor anchor row not found');
        original = await p.readActiveState(row);
        await p.toggleActive(row);
      },
      expectBeforeSave: async () => { expect(await p.isOverrideSaveEnabled()).toBe(true); },
      saveAndConfirm: () => p.saveAndConfirm(),
      reload: async () => {
        await p.reloadAndReselect(L_LOC, L_LOC);
        await p.switchOverrideTab('Labor');
      },
      expectAfterReload: async () => {
        const row = await p.findRowByProductGroup(L_ANCHOR);
        expect(row).not.toBeNull();
        expect(await p.readActiveState(row!)).toBe(!original); // toggled value persisted
      },
      cleanup: () => p.ensureDefaultState(L_ANCHOR, L_DEFAULTS, L_LOC, L_LOC, 'Labor'),
    });
  });

  // ── Unsaved-changes guard ──
  // The dialog fires only on in-app link navigation; staged edits here are discarded, never saved.
  test('TC-CPR-OVR-055: Navigating away from a dirty grid raises the unsaved-changes dialog; Stay keeps the page and the edit (NM-2271)', async ({ corporatePricingOverridePage: p }) => {
    const row = await p.findRowByProductGroup(G_ANCHOR);
    expect(row).not.toBeNull();
    const original = parseFloat(await p.readOverridePrice(row!));
    const staged = String(original + 39); // differs from the saved value so the grid is genuinely dirty
    await p.setOverridePrice(row!, staged);
    expect(await p.isOverrideSaveEnabled()).toBe(true);

    const dialogText = await p.navigateHomeExpectUnsavedDialog();
    expect(dialogText).toContain(CORP_PRICING_OVERRIDE_UNSAVED_DIALOG.title);
    expect(dialogText).toContain(CORP_PRICING_OVERRIDE_UNSAVED_DIALOG.body);
    expect(dialogText).toContain(CORP_PRICING_OVERRIDE_UNSAVED_DIALOG.stayButton);
    expect(dialogText).toContain(CORP_PRICING_OVERRIDE_UNSAVED_DIALOG.discardButton);

    await p.stayOnPage();
    expect(p.page.url(), 'Stay keeps the Override screen open').toContain('/pg-override');
    const rowAfter = await p.findRowByProductGroup(G_ANCHOR);
    expect(rowAfter).not.toBeNull();
    expect(parseFloat(await p.readOverridePrice(rowAfter!)), 'the staged edit survives Stay').toBe(parseFloat(staged));
    expect(await p.isOverrideSaveEnabled(), 'the form stays dirty after Stay').toBe(true);

    // Leave cleanly: discard the staged edit so no state leaks to the next test
    await p.navigateHomeExpectUnsavedDialog();
    await p.discardAndLeave();
  });

  test('TC-CPR-OVR-056: Discard in the unsaved-changes dialog leaves the page and drops the edit (NM-2271)', async ({ corporatePricingOverridePage: p }) => {
    const row = await p.findRowByProductGroup(G_ANCHOR);
    expect(row).not.toBeNull();
    const original = parseFloat(await p.readOverridePrice(row!));
    await p.setOverridePrice(row!, String(original + 41));
    expect(await p.isOverrideSaveEnabled()).toBe(true);

    await p.navigateHomeExpectUnsavedDialog();
    await p.discardAndLeave();
    expect(p.page.url(), 'Discard navigates away from the Override screen').toContain('/home');

    // The dropped edit must NOT have persisted
    await p.reloadAndReselect(G_LOC, G_LOC);
    await p.switchOverrideTab('Labor');
    const rowAfter = await p.findRowByProductGroup(G_ANCHOR);
    expect(rowAfter).not.toBeNull();
    expect(parseFloat(await p.readOverridePrice(rowAfter!)), 'the discarded edit did not persist').toBe(original);
  });

  // ── Labor grid pagination and volume (office 9460) ──
  test('TC-CPR-OVR-057: Page navigation changes the visible rows and enables or disables the nav buttons at each end (NM-2271)', async ({ corporatePricingOverridePage: p }) => {
    // Page 1: backward navigation disabled, forward enabled (the bed spans multiple pages)
    const p1 = await p.getPaginationButtonStates();
    expect(p1.first, 'first-page button is disabled on page 1').toBe(true);
    expect(p1.previous, 'previous-page button is disabled on page 1').toBe(true);
    expect(p1.next, 'next-page button is enabled on page 1').toBe(false);
    expect(p1.last, 'last-page button is enabled on page 1').toBe(false);
    const page1FirstRow = await p.getFirstRowCellText(CORP_PRICING_OVERRIDE.columnIndex.productGroupName);

    // Page 2: first row identity changes; backward navigation enables
    await p.goToPage('next');
    const page2FirstRow = await p.getFirstRowCellText(CORP_PRICING_OVERRIDE.columnIndex.productGroupName);
    expect(page2FirstRow, 'page 2 starts with a different row than page 1').not.toBe(page1FirstRow);
    const p2 = await p.getPaginationButtonStates();
    expect(p2.previous, 'previous-page button enables once off page 1').toBe(false);

    // Last page: forward navigation disables; the remainder page holds no more than a full page
    await p.goToPage('last');
    const pLast = await p.getPaginationButtonStates();
    expect(pLast.next, 'next-page button is disabled on the last page').toBe(true);
    expect(pLast.last, 'last-page button is disabled on the last page').toBe(true);
    const lastPageRows = await p.getVisibleRowCount();
    expect(lastPageRows).toBeGreaterThan(0);
    expect(lastPageRows).toBeLessThanOrEqual(parseInt(await p.getRowsPerPageValue(), 10));
  });

  test('TC-CPR-OVR-058: Raising rows-per-page shows more rows without changing the total (NM-2271)', async ({ corporatePricingOverridePage: p }) => {
    const rowsBefore = await p.getVisibleRowCount();
    const totalBefore = await p.getItemsFoundTotal();
    await p.setRowsPerPage('50');
    const rowsAfter = await p.getVisibleRowCount();
    expect(rowsAfter, 'a larger page size shows more rows').toBeGreaterThan(rowsBefore);
    expect(await p.getItemsFoundTotal(), 'the total record count is unchanged by page size').toBe(totalBefore);
  });

  test('TC-CPR-OVR-059: A page-1 row reads back identically after paging to the last page and returning (NM-2271)', async ({ corporatePricingOverridePage: p }) => {
    // Content-anchored round trip across the full page range — guards against windowing/render
    // corruption on the large data set (content anchor, not row index).
    const anchorText = await p.getFirstRowCellText(CORP_PRICING_OVERRIDE.columnIndex.productGroupName);
    expect(anchorText.length).toBeGreaterThan(0);
    await p.goToPage('last');
    expect(await p.getVisibleRowCount()).toBeGreaterThan(0); // far end of the range renders rows
    await p.goToPage('first');
    expect(await p.getFirstRowCellText(CORP_PRICING_OVERRIDE.columnIndex.productGroupName), 'the page-1 anchor row reads back identically after the round trip').toBe(anchorText);
    expect(await p.findRowByProductGroup(anchorText)).not.toBeNull();
  });

  // ── Keyboard access to editable cells ──
  test('TC-CPR-OVR-061: Enter opens the Override Price editor on a focused cell; Escape closes it without dirtying the form (NM-2271)', async ({ corporatePricingOverridePage: p }) => {
    const row = await p.findRowByProductGroup(ANCHOR);
    expect(row).not.toBeNull();
    const editorValue = await p.openOverridePriceEditorWithKeyboard(row!);
    expect(parseFloat(editorValue), 'the keyboard-opened editor exposes the current value').toBe(parseFloat(DEFAULTS.overridePrice));
    await p.closeEditorWithKeyboard();
    expect(await p.isOverrideSaveEnabled(), 'Escape cancels cleanly — no dirty state').toBe(false);
  });

  // ── Currency-gated picker and drag-to-add ──
  // The picker appears only under a specific currency, never ALL; staged rows are always discarded.
  test('TC-CPR-OVR-062: The Product Group picker appears only when a specific currency is selected (NM-2271)', { tag: '@mutation' }, async ({ corporatePricingOverridePage: p }) => {
    // Default currency ALL: no picker
    expect(await p.isProductGroupPickerVisible(), 'no picker panel while Currency is ALL').toBe(false);
    // A specific currency reveals the picker with draggable product-group rows
    await p.selectCurrency(K_BED.gatingCurrency);
    await expect.poll(() => p.isProductGroupPickerVisible(), { timeout: 15_000 }).toBe(true);
    expect(await p.getPickerDraggableRowCount(), 'the picker lists draggable product-group rows').toBeGreaterThan(0);
  });

  test('TC-CPR-OVR-063: Dragging a picker row stages a new override row with no request until Save; Discard drops it (NM-2271)', { tag: '@mutation' }, async ({ corporatePricingOverridePage: p }) => {
    await p.selectCurrency(K_BED.gatingCurrency);
    await expect.poll(() => p.isProductGroupPickerVisible(), { timeout: 15_000 }).toBe(true);
    // The currency switch re-renders the grid — wait for its rows before taking the baseline count
    // (a too-early read returns 0 on a grid that actually holds a row).
    await p.waitForGridRows();
    const rowsBefore = await p.getVisibleRowCount();
    expect(rowsBefore, 'this office carries at least one Equipment override row').toBeGreaterThan(0);

    // No backend save call may fire during the drag — the row stages client-side only
    let saveCallsDuringDrag = 0;
    const listener = (req: { url(): string; method(): string }): void => {
      if (req.url().includes(CORP_PRICING_OVERRIDE.saveApiPath) && req.method() === 'POST') saveCallsDuringDrag += 1;
    };
    p.page.on('request', listener);
    const draggedRowText = await p.dragFirstPickerRowToGrid('Equipment');
    p.page.off('request', listener);

    expect(await p.getVisibleRowCount(), 'the drag staged one new grid row').toBe(rowsBefore + 1);
    expect(saveCallsDuringDrag, 'no save request fires during the drag').toBe(0);
    expect(await p.isOverrideSaveEnabled(), 'staging a row dirties the form').toBe(true);

    // The staged row lands with the unset price and inactive state
    const pgId = draggedRowText.split(' ')[0] ?? ''; // picker row text starts with the product-group id
    expect(pgId.length).toBeGreaterThan(0);
    const staged = await p.findRowByProductGroup(pgId);
    expect(staged, 'the staged row is findable by its product-group id').not.toBeNull();
    expect(parseFloat(await p.readOverridePrice(staged!))).toBe(parseFloat(K_BED.droppedRowDefaults.overridePrice));
    expect(await p.readActiveState(staged!)).toBe(K_BED.droppedRowDefaults.active);

    // Discard the staged row and prove nothing persisted
    await p.navigateHomeExpectUnsavedDialog();
    await p.discardAndLeave();
    await p.reloadAndReselect(K_BED.office, K_BED.office);
    await p.selectCurrency(K_BED.gatingCurrency);
    await p.waitForGridRows();
    await expect.poll(() => p.getVisibleRowCount(), { timeout: 15_000 }).toBe(rowsBefore); // staged row gone
  });

  test('TC-CPR-OVR-064: The picker serves the Labor tab and drag staging works there too (NM-2271)', { tag: '@mutation' }, async ({ corporatePricingOverridePage: p }) => {
    await p.selectCurrency(K_BED.gatingCurrency);
    await expect.poll(() => p.isProductGroupPickerVisible(), { timeout: 15_000 }).toBe(true);
    await p.switchOverrideTab('Labor');
    expect(await p.isProductGroupPickerVisible(), 'the picker persists on the Labor tab').toBe(true);
    expect(await p.getPickerDraggableRowCount(), 'the picker lists Labor product-group rows').toBeGreaterThan(0);

    const rowsBefore = await p.getVisibleRowCount(); // this office has no saved Labor overrides
    await p.dragFirstPickerRowToGrid('Labor');
    expect(await p.getVisibleRowCount(), 'the drag staged one new Labor grid row').toBe(rowsBefore + 1);
    expect(await p.isOverrideSaveEnabled(), 'staging a Labor row dirties the form').toBe(true);

    // Discard — nothing persists
    await p.navigateHomeExpectUnsavedDialog();
    await p.discardAndLeave();
  });

  // ── BVA — Labor Override Price (PG 565 / PG 893) ──
  test('TC-CPR-OVR-083: Clicking Override Price on Labor reveals editable number field', async ({ corporatePricingOverridePage: overridePage }) => {
    const row = await overridePage.navigateToLaborRow(BED.office, BED.office, ROW_PG565);

    // Click the Override Price cell — column-specific selector matching probeEditOracle
    const overridePriceCell = row.locator('td:nth-child(6) [role="button"]').first();
    await overridePriceCell.click();

    // Row-scoped editor with 8s timeout — matches probeEditOracle and all sibling tests
    const editor = row.getByRole('spinbutton');
    await editor.waitFor({ state: 'visible', timeout: 8_000 });
    await expect(editor).toHaveValue('13');

    // Cleanup — Escape without committing
    await editor.press('Escape');
  });

  test('TC-CPR-OVR-084: 0 commits as 0.00 on Labor Override Price', async ({ corporatePricingOverridePage: overridePage }) => {
    const row = await overridePage.navigateToLaborRow(BED.office, BED.office, ROW_PG565);

    const result = await overridePage.probeEditOracle(row, 'overridePrice', '0');

    expect(result.committed).toBe(true);
    expect(result.displayedValue).toBe('0.00');
    expect(result.saveEnabled).toBe(true);
  });

  test('TC-CPR-OVR-085: 25.50 mid-decimal commits on Labor Override Price', async ({ corporatePricingOverridePage: overridePage }) => {
    const row = await overridePage.navigateToLaborRow(BED.office, BED.office, ROW_PG565);

    const result = await overridePage.probeEditOracle(row, 'overridePrice', '25.50');

    expect(result.committed).toBe(true);
    expect(result.displayedValue).toBe('25.50');
    expect(result.saveEnabled).toBe(true);
  });

  test('TC-CPR-OVR-086: 9999.99 large value commits on Labor Override Price', async ({ corporatePricingOverridePage: overridePage }) => {
    const row = await overridePage.navigateToLaborRow(BED.office, BED.office, ROW_PG565);

    const result = await overridePage.probeEditOracle(row, 'overridePrice', '9999.99');

    expect(result.committed).toBe(true);
    expect(result.displayedValue).toBe('9999.99');
    expect(result.saveEnabled).toBe(true);
  });

  test('TC-CPR-OVR-087: -0.01 rejected on Labor Override Price (below-min boundary)', async ({ corporatePricingOverridePage: overridePage }) => {
    const row = await overridePage.navigateToLaborRow(BED.office, BED.office, ROW_PG565);

    const result = await overridePage.probeEditOracle(row, 'overridePrice', OVERRIDE_BVA_REJECTED.negativeSmall.input);

    expect(result.committed).toBe(false);
    expect(result.ariaInvalid).toBe(OVERRIDE_REJECTION_SIGNATURE.ariaInvalid);
    expect(result.borderColor).toContain(OVERRIDE_REJECTION_SIGNATURE.borderColor);
    expect(result.errorText).toBe(OVERRIDE_REJECTION_SIGNATURE.alertRoleTextContent);
    expect(result.saveEnabled).toBe(false);

    // Escapability is proven by the probe: after Escape a different cell's editor
    // opens, so focus is never trapped in the grid.
    expect(result.escapable, 'Editor must be escapable — NOT a focus trap').toBe(true);
  });

  test('TC-CPR-OVR-088: 0.01 just above zero commits on Labor Override Price', async ({ corporatePricingOverridePage: overridePage }) => {
    const row = await overridePage.navigateToLaborRow(BED.office, BED.office, ROW_PG893);

    const result = await overridePage.probeEditOracle(row, 'overridePrice', '0.01');

    expect(result.committed).toBe(true);
    expect(result.displayedValue).toBe('0.01');
    expect(result.saveEnabled).toBe(true);
  });

  test('TC-CPR-OVR-089: 12.345 third-decimal precision on Labor Override Price [TODO-UNVERIFIED display]', async ({ corporatePricingOverridePage: overridePage }) => {
    const row = await overridePage.navigateToLaborRow(BED.office, BED.office, ROW_PG565);

    const result = await overridePage.probeEditOracle(row, 'overridePrice', '12.345');

    // TODO-UNVERIFIED: exact display format unknown (12.35 rounded? 12.345? 12.34 truncated?)
    expect(result.committed).toBe(true);
    expect(result.saveEnabled).toBe(true);
    // The live run determines actual displayedValue — update assertion post-verification
    expect(result.displayedValue).toMatch(/^12\.3[0-9]{1,2}$/);
  });

  test('TC-CPR-OVR-090: 999999.99 above-max probe on Labor Override Price [TODO-UNVERIFIED]', async ({ corporatePricingOverridePage: overridePage }) => {
    const row = await overridePage.navigateToLaborRow(BED.office, BED.office, ROW_PG893);

    const result = await overridePage.probeEditOracle(row, 'overridePrice', '999999.99');

    // TODO-UNVERIFIED: no confirmed hard max — TC-021 on Equipment says large numbers accepted
    // Note: probeEditOracle strips commas from displayedValue (helper contract).
    expect(result.committed).toBe(true);
    expect(result.displayedValue).toBe('999999.99');
    expect(result.saveEnabled).toBe(true);
  });

  test('TC-CPR-OVR-091: abc blanks Override Price to dash, Save enabled — defect evidence (Labor)', async ({ corporatePricingOverridePage: overridePage }) => {
    const row = await overridePage.navigateToLaborRow(BED.office, BED.office, ROW_PG565);

    const result = await overridePage.probeEditOracle(row, 'overridePrice', OVERRIDE_BVA_DEFECTS.blankCommits.input);

    // Assert the DEFECT — test FAILS when the app is fixed (committed will become false)
    expect(result.committed).toBe(true);
    expect(result.displayedValue).toBe(OVERRIDE_BVA_DEFECTS.blankCommits.expectedDisplay); // '—'
    expect(result.saveEnabled).toBe(true);
  });

  test('TC-CPR-OVR-092: 1.2.3 silently corrupts Override Price to 1.23 — defect evidence (Labor)', async ({ corporatePricingOverridePage: overridePage }) => {
    const row = await overridePage.navigateToLaborRow(BED.office, BED.office, ROW_PG565);

    const result = await overridePage.probeEditOracle(row, 'overridePrice', OVERRIDE_BVA_DEFECTS.silentCorruptionOverridePrice.input);

    // Assert the DEFECT — test FAILS when fixed (committed becomes false, or displayedValue changes)
    expect(result.committed).toBe(true);
    expect(result.displayedValue).toBe(OVERRIDE_BVA_DEFECTS.silentCorruptionOverridePrice.expectedDisplay); // '1.23'
    expect(result.saveEnabled).toBe(true);
  });

  test('TC-CPR-OVR-093: -5 rejected on Labor Override Price with full affordance oracle', async ({ corporatePricingOverridePage: overridePage }) => {
    const row = await overridePage.navigateToLaborRow(BED.office, BED.office, ROW_PG565);

    const result = await overridePage.probeEditOracle(row, 'overridePrice', OVERRIDE_BVA_REJECTED.negativeFive.input);

    // Full capture order — capture BEFORE escape
    expect(result.committed).toBe(false);
    expect(result.ariaInvalid).toBe(OVERRIDE_REJECTION_SIGNATURE.ariaInvalid);
    expect(result.borderColor).toContain(OVERRIDE_REJECTION_SIGNATURE.borderColor);
    expect(result.errorText).toBe(OVERRIDE_REJECTION_SIGNATURE.alertRoleTextContent); // '' — defect #4
    expect(result.saveEnabled).toBe(false);

    // Escapability is proven by the probe: after Escape a different cell's editor
    // opens, so focus is never trapped in the grid.
    expect(result.escapable, 'Editor must be escapable — NOT a focus trap').toBe(true);
  });

  test('TC-CPR-OVR-094: 007 leading zeros stripped to 7.00 on Labor Override Price', async ({ corporatePricingOverridePage: overridePage }) => {
    const row = await overridePage.navigateToLaborRow(BED.office, BED.office, ROW_PG893);

    const result = await overridePage.probeEditOracle(row, 'overridePrice', '007');

    expect(result.committed).toBe(true);
    expect(result.displayedValue).toBe('7.00');
    expect(result.saveEnabled).toBe(true);
  });

  test('TC-CPR-OVR-095: 1e5 commits as 100,000.00 on Labor Override Price', async ({ corporatePricingOverridePage: overridePage }) => {
    const row = await overridePage.navigateToLaborRow(BED.office, BED.office, ROW_PG893);

    const result = await overridePage.probeEditOracle(row, 'overridePrice', '1e5');

    // 1e5 COMMITS on Override Price — no upper cap. Max Discount rejects it because >100 fires.
    // Raw text preserves the thousands separator the oracle strips (100,000.00)
    expect(result.committed, '1e5 commits on Override Price — no upper cap').toBe(true);
    expect(result.displayedValue).toBe('100000.00');
    expect(result.rawDisplayedValue).toBe('100,000.00');
    expect(result.saveEnabled).toBe(true);
  });

  test('TC-CPR-OVR-096: Reverting Override Price to original disables Save on Labor', async ({ corporatePricingOverridePage: overridePage }) => {
    const row = await overridePage.navigateToLaborRow(BED.office, BED.office, ROW_PG565);

    const result = await overridePage.editAndRevertToOriginal(
      row,
      'overridePrice',
      '99.99',
      '13.00',
    );

    expect(result.saveEnabledAfterEdit).toBe(true);
    expect(result.saveDisabledAfterRevert).toBe(true);
  });

  // ── BVA — Labor Active ──
  test('TC-CPR-OVR-097: Active toggle-then-revert disables Save on Labor', async ({ corporatePricingOverridePage: overridePage }) => {
    const row = await overridePage.navigateToLaborRow(BED.office, BED.office, ROW_PG565);

    // Read initial state
    const activeCheckbox = row.locator('[role="checkbox"]');
    const initialChecked = await activeCheckbox.getAttribute('aria-checked');

    // Toggle — Save should enable
    await activeCheckbox.click();
    await expect(overridePage.saveButton).toBeEnabled();

    // Toggle back (revert) — Save should disable (net-zero)
    await activeCheckbox.click();
    await expect(overridePage.saveButton).toBeDisabled();

    // Verify state restored
    const finalChecked = await activeCheckbox.getAttribute('aria-checked');
    expect(finalChecked).toBe(initialChecked);
  });

  // ── BVA — Labor Max Discount % (LOT-C) ──
  // --- Positive (P1–P3) ---

  test('TC-CPR-OVR-098: 0 commits as 0.00 % — min valid', async ({ corporatePricingOverridePage: overridePage }) => {
    const row = await overridePage.navigateToLaborRow(BED.office, BED.office, ROW_1);

    const result = await overridePage.probeEditOracle(row, 'maxDiscount', '0');

    expect(result.committed, '0 should commit as a valid min value').toBe(true);
    expect(result.displayedValue).toBe('0.00 %');
    expect(result.saveEnabled).toBe(true);
  });

  test('TC-CPR-OVR-099: 50 commits as 50.00 % — mid-value', async ({ corporatePricingOverridePage: overridePage }) => {
    const row = await overridePage.navigateToLaborRow(BED.office, BED.office, ROW_2);

    const result = await overridePage.probeEditOracle(row, 'maxDiscount', OVERRIDE_BVA_COMMITTED.fifty.input);

    expect(result.committed).toBe(true);
    expect(result.displayedValue).toBe(OVERRIDE_BVA_COMMITTED.fifty.expectedDisplay); // '50.00 %'
    expect(result.saveEnabled).toBe(true);
  });

  test('TC-CPR-OVR-100: 100 commits as 100.00 % — inclusive cap', async ({ corporatePricingOverridePage: overridePage }) => {
    const row = await overridePage.navigateToLaborRow(BED.office, BED.office, ROW_1);

    const result = await overridePage.probeEditOracle(row, 'maxDiscount', OVERRIDE_BVA_COMMITTED.hundredCap.input);

    expect(result.committed).toBe(true);
    expect(result.displayedValue).toBe(OVERRIDE_BVA_COMMITTED.hundredCap.expectedDisplay); // '100.00 %'
    expect(result.saveEnabled).toBe(true);
  });

  // --- BVA (B1–B5) ---

  test('TC-CPR-OVR-101: -0.01 rejected — just below minimum', async ({ corporatePricingOverridePage: overridePage }) => {
    const row = await overridePage.navigateToLaborRow(BED.office, BED.office, ROW_2);

    const result = await overridePage.probeEditOracle(row, 'maxDiscount', OVERRIDE_BVA_REJECTED.negativeSmall.input);

    expect(result.committed, '-0.01 should be rejected as below-min').toBe(false);
    expect(result.ariaInvalid).toBe(OVERRIDE_REJECTION_SIGNATURE.ariaInvalid);
    expect(result.borderColor).toContain(OVERRIDE_REJECTION_SIGNATURE.borderColor);
    expect(result.errorText).toBe(OVERRIDE_REJECTION_SIGNATURE.alertRoleTextContent);
    expect(result.saveEnabled).toBe(false);

    // Escapability is proven by the probe: after Escape a different cell's editor
    // opens, so focus is never trapped in the grid.
    expect(result.escapable, 'Editor must be escapable — NOT a focus trap').toBe(true);
  });

  test('TC-CPR-OVR-102: 0.5 commits as 50.00 % — 100x misread defect (highest severity, money bug)', async ({ corporatePricingOverridePage: overridePage }) => {
    const row = await overridePage.navigateToLaborRow(BED.office, BED.office, ROW_1);

    const result = await overridePage.probeEditOracle(row, 'maxDiscount', OVERRIDE_BVA_DEFECTS.hundredXMisread.input);

    // Assert the DEFECT — a half-percent discount cap silently becomes fifty percent.
    // When the app is fixed, displayedValue will become '0.50 %' and this test FAILS loudly.
    expect(result.committed).toBe(true);
    expect(
      result.displayedValue,
      'BUG: 0.5 is misread as 50.00 % — a half-percent cap becomes fifty percent. When fixed, expect 0.50 %',
    ).toBe(OVERRIDE_BVA_DEFECTS.hundredXMisread.expectedDisplay); // '50.00 %'
    expect(result.saveEnabled).toBe(true);
  });

  test('TC-CPR-OVR-103: 99.99 commits as 99.99 % — just below cap', async ({ corporatePricingOverridePage: overridePage }) => {
    const row = await overridePage.navigateToLaborRow(BED.office, BED.office, ROW_2);

    const result = await overridePage.probeEditOracle(row, 'maxDiscount', OVERRIDE_BVA_COMMITTED.justUnderCap.input);

    expect(result.committed, '99.99 should commit as just-under-cap').toBe(true);
    expect(result.displayedValue).toBe(OVERRIDE_BVA_COMMITTED.justUnderCap.expectedDisplay); // '99.99 %'
    expect(result.saveEnabled).toBe(true);
  });

  test('TC-CPR-OVR-104: 150 (>100) rejected with full affordance', async ({ corporatePricingOverridePage: overridePage }) => {
    const row = await overridePage.navigateToLaborRow(BED.office, BED.office, ROW_1);

    const result = await overridePage.probeEditOracle(row, 'maxDiscount', OVERRIDE_BVA_REJECTED.overHundred.input);

    expect(result.committed).toBe(false);
    expect(result.ariaInvalid).toBe(OVERRIDE_REJECTION_SIGNATURE.ariaInvalid);
    expect(result.borderColor).toContain(OVERRIDE_REJECTION_SIGNATURE.borderColor);
    expect(result.errorText).toBe(OVERRIDE_REJECTION_SIGNATURE.alertRoleTextContent);
    expect(result.saveEnabled).toBe(false);

    // Escapability is proven by the probe: after Escape a different cell's editor
    // opens, so focus is never trapped in the grid.
    expect(result.escapable, 'Editor must be escapable — NOT a focus trap').toBe(true);
  });

  test('TC-CPR-OVR-105: -5 rejected with full affordance', async ({ corporatePricingOverridePage: overridePage }) => {
    const row = await overridePage.navigateToLaborRow(BED.office, BED.office, ROW_2);

    const result = await overridePage.probeEditOracle(row, 'maxDiscount', OVERRIDE_BVA_REJECTED.negativeFive.input);

    expect(result.committed).toBe(false);
    expect(result.ariaInvalid).toBe(OVERRIDE_REJECTION_SIGNATURE.ariaInvalid);
    expect(result.borderColor).toContain(OVERRIDE_REJECTION_SIGNATURE.borderColor);
    expect(result.errorText).toBe(OVERRIDE_REJECTION_SIGNATURE.alertRoleTextContent);
    expect(result.saveEnabled).toBe(false);

    // Escapability is proven by the probe: after Escape a different cell's editor
    // opens, so focus is never trapped in the grid.
    expect(result.escapable, 'Editor must be escapable — NOT a focus trap').toBe(true);
  });

  // --- Negative / Coercion (N1–N4) ---

  test('TC-CPR-OVR-106: abc blanks cell to dash, Save stays enabled — blank-commits defect', async ({ corporatePricingOverridePage: overridePage }) => {
    const row = await overridePage.navigateToLaborRow(BED.office, BED.office, ROW_1);

    const result = await overridePage.probeEditOracle(row, 'maxDiscount', OVERRIDE_BVA_DEFECTS.blankCommits.input);

    // Assert the DEFECT — non-numeric blanks the cell and Save stays enabled.
    // When fixed: either rejected (committed=false) or Save disabled. Test fails, exposing the fix.
    expect(result.committed).toBe(true);
    expect(
      result.displayedValue,
      'BUG: abc blanks the discount cap to dash and Save stays enabled — an emptied value can be saved',
    ).toBe(OVERRIDE_BVA_DEFECTS.blankCommits.expectedDisplay); // '—'
    expect(result.saveEnabled).toBe(true);
  });

  test('TC-CPR-OVR-107: 1.2.3 silently corrupts to 1.23 % — multi-dot defect', async ({ corporatePricingOverridePage: overridePage }) => {
    const row = await overridePage.navigateToLaborRow(BED.office, BED.office, ROW_2);

    const result = await overridePage.probeEditOracle(row, 'maxDiscount', OVERRIDE_BVA_DEFECTS.silentCorruptionMaxDiscount.input);

    // Assert the DEFECT — multi-dot input silently becomes a plausible number.
    // When fixed: rejected (committed=false, aria-invalid=true). Test fails, naming the change.
    expect(result.committed).toBe(true);
    expect(
      result.displayedValue,
      'BUG: 1.2.3 is silently corrupted to 1.23 % — second dot swallowed. When fixed, expect rejection',
    ).toBe(OVERRIDE_BVA_DEFECTS.silentCorruptionMaxDiscount.expectedDisplay); // '1.23 %'
    expect(result.saveEnabled).toBe(true);
  });

  test('TC-CPR-OVR-108: 007 commits as 7.00 % — leading zeros stripped', async ({ corporatePricingOverridePage: overridePage }) => {
    const row = await overridePage.navigateToLaborRow(BED.office, BED.office, ROW_1);

    const result = await overridePage.probeEditOracle(row, 'maxDiscount', OVERRIDE_BVA_COMMITTED.leadingZeros.input);

    expect(result.committed).toBe(true);
    expect(result.displayedValue).toBe(OVERRIDE_BVA_COMMITTED.leadingZeros.expectedDisplay); // '7.00 %'
    expect(result.saveEnabled).toBe(true);
  });

  test('TC-CPR-OVR-109: 1e5 (scientific notation) rejected with full affordance', async ({ corporatePricingOverridePage: overridePage }) => {
    const row = await overridePage.navigateToLaborRow(BED.office, BED.office, ROW_2);

    const result = await overridePage.probeEditOracle(row, 'maxDiscount', OVERRIDE_BVA_REJECTED.scientificNotation.input);

    expect(result.committed).toBe(false);
    expect(result.ariaInvalid).toBe(OVERRIDE_REJECTION_SIGNATURE.ariaInvalid);
    expect(result.borderColor).toContain(OVERRIDE_REJECTION_SIGNATURE.borderColor);
    expect(result.errorText).toBe(OVERRIDE_REJECTION_SIGNATURE.alertRoleTextContent);
    expect(result.saveEnabled).toBe(false);

    // Escapability is proven by the probe: after Escape a different cell's editor
    // opens, so focus is never trapped in the grid.
    expect(result.escapable, 'Editor must be escapable — NOT a focus trap').toBe(true);
  });

  // --- Save-cycle (S3) ---

  test('TC-CPR-OVR-110: Save-cycle — reverting Max Discount % to original disables Save on Labor', async ({ corporatePricingOverridePage: overridePage }) => {
    const row = await overridePage.navigateToLaborRow(BED.office, BED.office, ROW_1);

    const result = await overridePage.editAndRevertToOriginal(
      row,
      'maxDiscount',
      OVERRIDE_BVA_COMMITTED.fifty.input, // edit to 50
      BED.rows[0].maxDiscount,            // revert to original (14.00)
    );

    expect(result.saveEnabledAfterEdit, 'Save should enable when Max Discount is edited').toBe(true);
    expect(result.saveDisabledAfterRevert, 'Save should disable when reverted to original value').toBe(true);
  });

  // ── SBC — Labor sort ordering ──
  test('TC-CPR-OVR-118: Sort produces verifiable monotonic order on Labor tab', async ({ corporatePricingOverridePage: overridePage }) => {
    // Office 9460 has 212 Labor rows (live-verified); default page size 20 — enough for sort proof
    await overridePage.reloadAndReselectTab(
      CORP_PRICING_OVERRIDE_LABOR_VOLUME_BED.office,
      CORP_PRICING_OVERRIDE_LABOR_VOLUME_BED.office,
      'Labor',
    );

    // Sort ascending by Product Group — assert monotonically ordered values on ≥4 rows
    await overridePage.sortColumnViaDropdown('Product Group', 'ascending');
    const ascValues = (await overridePage.getColumnCellValues(
      CORP_PRICING_OVERRIDE.columnIndex.productGroup,
    )).map(v => parseInt(v, 10));
    expect(ascValues.length).toBeGreaterThanOrEqual(4);
    for (let i = 1; i < ascValues.length; i++) {
      expect(ascValues[i]!).toBeGreaterThanOrEqual(ascValues[i - 1]!);
    }

    // Sort descending — assert monotonically descending
    await overridePage.sortColumnViaDropdown('Product Group', 'descending');
    const descValues = (await overridePage.getColumnCellValues(
      CORP_PRICING_OVERRIDE.columnIndex.productGroup,
    )).map(v => parseInt(v, 10));
    for (let i = 1; i < descValues.length; i++) {
      expect(descValues[i]!).toBeLessThanOrEqual(descValues[i - 1]!);
    }
  });

  // ── Pagination — rows-per-page re-renders grid (office 9460 Labor) ──
  test('TC-CPR-OVR-120: Select 10 → grid shows exactly 10 rows', async ({ corporatePricingOverridePage: overridePage }) => {
    // Change rows-per-page to 10 via the page-size dropdown (not a native select)
    await overridePage.setRowsPerPage('10');

    // Wait for grid to re-render with the new page size
    await overridePage.page.locator(GRID_ROW).first().waitFor({ state: 'visible' });

    // Assert: exactly 10 rows visible (FAILS if control did nothing — default is 20)
    const visibleRows = await overridePage.getVisibleRowCount();
    expect(visibleRows).toBe(10);

    // Assert: pagination state updated — "items found" text still shows total ≥ 100
    const paginationText = await overridePage.page.locator('text=/\\d+ items found/').textContent();
    const totalItems = parseInt(paginationText!.match(/(\d+) items found/)![1]!, 10);
    expect(totalItems).toBeGreaterThanOrEqual(V_BED.minExpectedRows);
  });

  test('TC-CPR-OVR-121: Select 30 → grid shows exactly 30 rows', async ({ corporatePricingOverridePage: overridePage }) => {
    // Change rows-per-page to 30 via the page-size dropdown
    await overridePage.setRowsPerPage('30');

    await overridePage.page.locator(GRID_ROW).first().waitFor({ state: 'visible' });

    // Assert: exactly 30 rows visible (FAILS if control did nothing — default is 20)
    const visibleRows = await overridePage.getVisibleRowCount();
    expect(visibleRows).toBe(30);

    // Assert: pagination total unchanged (the control changed page size, not data)
    const paginationText = await overridePage.page.locator('text=/\\d+ items found/').textContent();
    const totalItems = parseInt(paginationText!.match(/(\d+) items found/)![1]!, 10);
    expect(totalItems).toBeGreaterThanOrEqual(V_BED.minExpectedRows);
  });

  test('TC-CPR-OVR-122: Select 40 → grid shows exactly 40 rows', async ({ corporatePricingOverridePage: overridePage }) => {
    // Change rows-per-page to 40 via the page-size dropdown
    await overridePage.setRowsPerPage('40');

    await overridePage.page.locator(GRID_ROW).first().waitFor({ state: 'visible' });

    // Assert: exactly 40 rows visible (FAILS if control did nothing — default is 20)
    const visibleRows = await overridePage.getVisibleRowCount();
    expect(visibleRows).toBe(40);

    // Assert: pagination total unchanged
    const paginationText = await overridePage.page.locator('text=/\\d+ items found/').textContent();
    const totalItems = parseInt(paginationText!.match(/(\d+) items found/)![1]!, 10);
    expect(totalItems).toBeGreaterThanOrEqual(V_BED.minExpectedRows);
  });

  test('TC-CPR-OVR-123: Select 50 → grid shows exactly 50 rows', async ({ corporatePricingOverridePage: overridePage }) => {
    // Change rows-per-page to 50 via the page-size dropdown
    await overridePage.setRowsPerPage('50');

    await overridePage.page.locator(GRID_ROW).first().waitFor({ state: 'visible' });

    // Assert: exactly 50 rows visible (FAILS if control did nothing — default is 20)
    const visibleRows = await overridePage.getVisibleRowCount();
    expect(visibleRows).toBe(50);

    // Assert: pagination total unchanged
    const paginationText = await overridePage.page.locator('text=/\\d+ items found/').textContent();
    const totalItems = parseInt(paginationText!.match(/(\d+) items found/)![1]!, 10);
    expect(totalItems).toBeGreaterThanOrEqual(V_BED.minExpectedRows);
  });
});
