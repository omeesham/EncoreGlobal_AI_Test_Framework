import { test, expect } from '../../src/fixtures/pages.fixture';
import { DETAIL } from '../../src/data/corporate-pricing/detail';

/**
 * Corporate Pricing — Pricebook Management / Pricing Detail tab, P1 (Management mode).
 * TC-CPR-DET-001..220. Live-grounded 2026-06-05.
 *
 * Override model (live): "New Price" is a staging override → on Save it becomes the row's "Price";
 * Base Price (Price col) is read-only. Save is dialog-gated and commits ALL dirty rows in one batch.
 *
 * Mutation safety: per-test `ensureDefaultState()` restores the detailFixture (2021-PB6)
 * anchors to baseline (base Price, no discount). The dependable, reversible dirty lever is **Max
 * Discount**; a New-Price-only edit does not reliably enable Save (a known app quirk), so the
 * New-Price persist test commits the override through the proven grid-batch Save (Max-Discount lever
 * as fallback) and ensureDefaultState reverts the Price to base. No fixed waits;
 * content-anchored reads, no exact counts; save dialog handled defensively.
 */
test.describe('Corporate Pricing — Pricing Detail @corporate-pricing @detail', () => {
  // The Detail grid is heavy (~3707 draggables / ~2430 rows); a page-open is ~15-25s and the
  // save-cycle + bounded-retry restore stack several. The default 30s/test is too tight → generous
  // ceiling (this is a per-test timeout, not a fixed wait).
  test.describe.configure({ timeout: 150_000 });

  // Per-test baseline dispatched by TC number:
  //  - TC-001..036, TC-038..043 (management mode): full fixture restore.
  //  - TC-044..055 (surface behaviors): plain page open, no restore.
  //  - TC-037 (create-mode positive control): navigates itself on the New Pricebook page.
  const tcNum = (title: string) => {
    const m = title.match(/^TC-CPR-DET-(\d+)/);
    return m ? parseInt(m[1]!, 10) : -1;
  };

  test.beforeEach(async ({ corporatePricingDetailPage: p }, testInfo) => {
    const n = tcNum(testInfo.title);
    if (n >= 1 && n <= 43 && n !== 37) {
      await p.ensureDefaultState();
    } else if (n >= 44 && n <= 55) {
      await p.open();
    }
  });

  test('TC-CPR-DET-001: Pricing Detail tab activates and the product-group grid renders', async ({ corporatePricingDetailPage: p }) => {
    expect(await p.isDetailTabActive(), 'Pricing Detail tab is active on load').toBe(true);
    expect(await p.getProductGroupRowCount()).toBeGreaterThan(0);
  });

  test('TC-CPR-DET-002: Verify the Pricing Detail grid shows its five columns', async ({ corporatePricingDetailPage: p }) => {
    const headers = await p.getGridHeaders();
    for (const h of DETAIL.headers) expect(headers).toContain(h);
  });

  test('TC-CPR-DET-003: The Available Product Groups source list loads', async ({ corporatePricingDetailPage: p }) => {
    expect(await p.getSourceItemCount()).toBeGreaterThan(0);
  });

  test('TC-CPR-DET-004: The source list provides a Search (ID or Name) filter', async ({ corporatePricingDetailPage: p }) => {
    expect(await p.hasSourceFilter()).toBe(true);
  });

  test('TC-CPR-DET-005: Pricing details load on tab activation', async ({ corporatePricingDetailPage: p }) => {
    expect(await p.getCellText(DETAIL.anchorA.name, 'price')).toBe(DETAIL.anchorA.basePrice);
  });

  test('TC-CPR-DET-006: Base Price (Price column) is read-only', async ({ corporatePricingDetailPage: p }) => {
    expect(await p.priceIsReadOnly(DETAIL.anchorA.name)).toBe(true);
  });

  test('TC-CPR-DET-007: New Price and Max Discount cells are editable', async ({ corporatePricingDetailPage: p }) => {
    // getNewPrice/getMaxDiscount resolve only if the editable inputs exist for the row.
    expect(typeof (await p.getNewPrice(DETAIL.anchorA.name))).toBe('string');
    expect(typeof (await p.getMaxDiscount(DETAIL.anchorA.name))).toBe('string');
  });

  test('TC-CPR-DET-008: Single-clicking a source product group does not add a grid row', async ({ corporatePricingDetailPage: p }) => {
    const { before, after } = await p.attemptSourceAdd('single');
    expect(after).toBe(before);
  });

  test('TC-CPR-DET-009: Double-click a source-list product group does NOT add a grid row (defensive)', async ({ corporatePricingDetailPage: p }) => {
    const { before, after } = await p.attemptSourceAdd('double');
    expect(after).toBe(before);
    expect(await p.isSaveEnabled()).toBe(false); // no dirty
  });

  test('TC-CPR-DET-010: Drag a source-list product group onto the grid does NOT add (defensive)', async ({ corporatePricingDetailPage: p }) => {
    const { before, after } = await p.attemptDragAdd();
    expect(after).toBe(before);
  });

  test('TC-CPR-DET-011: Existing grid rows expose no Add/Remove affordance (Management mode)', async ({ corporatePricingDetailPage: p }) => {
    expect(await p.rowHasAddRemoveAffordance(DETAIL.anchorA.name)).toBe(false);
  });

  test('TC-CPR-DET-012: Unmodified grid shows the clean state (Save disabled)', async ({ corporatePricingDetailPage: p }) => {
    expect(await p.isSaveEnabled()).toBe(false);
  });

  test('TC-CPR-DET-013: Editing a Max Discount changes the state to dirty (Save enabled)', async ({ corporatePricingDetailPage: p }) => {
    expect(await p.isSaveEnabled()).toBe(false);
    await p.setMaxDiscount(DETAIL.anchorA.name, DETAIL.maxDiscountEdit.value);
    expect(await p.isSaveEnabled()).toBe(true);
    await p.open();
    expect(await p.isSaveEnabled()).toBe(false);
  });

  test('TC-CPR-DET-014: Save is dialog-gated (Save Changes confirmation)', async ({ corporatePricingDetailPage: p }) => {
    await p.setMaxDiscount(DETAIL.anchorA.name, DETAIL.maxDiscountEdit.value);
    expect(await p.isSaveEnabled()).toBe(true);
    await p.clickSaveButton();
    await expect(p.saveChangesDialog).toBeVisible({ timeout: 5_000 });
    await expect(p.saveChangesDialog).toContainText('Save Changes');
    await p.confirmSaveChangesDialog();
    await expect(p.saveChangesDialog).toBeHidden({ timeout: 10_000 });
    await p.ensureDefaultState(); // restore (re-opens + settles)
  });

  test('TC-CPR-DET-015: Edit a Max Discount, Save, and the change persists across reload (with restore)', async ({ corporatePricingDetailPage: p }) => {
    const name = DETAIL.anchorA.name;
    await p.setMaxDiscount(name, DETAIL.maxDiscountEdit.value);
    expect(await p.isSaveEnabled()).toBe(true);
    await p.saveAndConfirm();
    await p.open();
    expect(await p.getMaxDiscount(name), 'Max Discount value persists after reload').toContain(DETAIL.maxDiscountEdit.displayContains);
    await p.ensureDefaultState(); // restore (no cross-run drift)
  });

  test('TC-CPR-DET-016: Save resets the state from dirty to clean after success', async ({ corporatePricingDetailPage: p }) => {
    await p.setMaxDiscount(DETAIL.anchorA.name, DETAIL.maxDiscountEdit.value);
    expect(await p.isSaveEnabled()).toBe(true); // dirty
    await p.saveAndConfirm();
    expect(await p.isSaveEnabled()).toBe(false); // clean after save
    await p.ensureDefaultState(); // restore
  });

  test('TC-CPR-DET-017: Save commits grid override edits in one batch (with restore)', async ({ corporatePricingDetailPage: p }) => {
    await p.setMaxDiscount(DETAIL.anchorA.name, DETAIL.maxDiscountEdit.value);
    await p.setMaxDiscount(DETAIL.anchorB.name, DETAIL.maxDiscountEdit.value);
    expect(await p.isSaveEnabled()).toBe(true);
    await p.saveAndConfirm();
    await p.open();
    expect(await p.getMaxDiscount(DETAIL.anchorA.name)).toContain(DETAIL.maxDiscountEdit.displayContains);
    expect(await p.getMaxDiscount(DETAIL.anchorB.name)).toContain(DETAIL.maxDiscountEdit.displayContains);
    await p.ensureDefaultState(); // restore both
  });

  test('TC-CPR-DET-018: Verify a saved New Price override becomes the row Price after reload', async ({ corporatePricingDetailPage: p }) => {
    const name = DETAIL.anchorB.name;
    await p.setNewPrice(name, DETAIL.newPriceEdit.value);
    expect(await p.isSaveEnabled()).toBe(true);
    await p.saveAndConfirm();
    await p.open();
    expect(await p.getCellText(name, 'price')).toBe(DETAIL.newPriceEdit.value);
    expect(await p.getNewPrice(name)).toBe(''); // staging input clears after save
    await p.ensureDefaultState(); // restore Price to base
  });

  test('TC-CPR-DET-019: An empty New Price leaves the Base Price in effect', async ({ corporatePricingDetailPage: p }) => {
    const name = DETAIL.anchorA.name;
    expect(await p.getNewPrice(name)).toBe('');
    expect(await p.getCellText(name, 'price')).toBe(DETAIL.anchorA.basePrice);
  });

  test('TC-CPR-DET-020: Save accepts a valid currency-formatted New Price', async ({ corporatePricingDetailPage: p }) => {
    const name = DETAIL.anchorB.name;
    await p.setNewPrice(name, DETAIL.newPriceEdit.value); // "250.00" — valid two-decimal currency
    if (!(await p.isSaveEnabled())) await p.setMaxDiscount(name, '1');
    await p.saveAndConfirm(); // a valid value is accepted (no validation block)
    await p.open();
    expect(await p.getCellText(name, 'price')).toBe(DETAIL.newPriceEdit.value);
    await p.ensureDefaultState(); // restore
  });

  // ── New Price numeric boundaries (live-confirmed: the input sanitizes invalid characters and
  //    flags out-of-range values; it does not silently revert) ───────────────────────────────────

  test('TC-CPR-DET-021: New Price 0 is treated as no override (the field clears; Save stays disabled)', async ({ corporatePricingDetailPage: p }) => {
    const name = DETAIL.anchorA.name;
    await p.setNewPrice(name, '0');
    expect(await p.getNewPrice(name)).toBe(''); // entering 0 clears the override (0 = no override)
    expect(await p.isSaveEnabled()).toBe(false); // nothing to commit
  });

  test('TC-CPR-DET-022: New Price negative input has its minus sign stripped; the positive value is accepted', async ({ corporatePricingDetailPage: p }) => {
    const name = DETAIL.anchorA.name;
    await p.setNewPrice(name, '-10');
    expect(await p.getNewPrice(name)).toBe('10.00'); // sign stripped, formatted to two decimals
    expect(await p.getNewPriceAriaInvalid(name)).not.toBe('true');
    expect(await p.isSaveEnabled()).toBe(true);
  });

  test('TC-CPR-DET-023: New Price above the maximum is flagged invalid and blocks Save', async ({ corporatePricingDetailPage: p }) => {
    const name = DETAIL.anchorA.name;
    await p.setNewPrice(name, '9999999.99');
    expect(await p.getNewPrice(name)).toBe('9999999.99'); // kept in the field
    expect(await p.getNewPriceAriaInvalid(name)).toBe('true'); // exceeds the allowed maximum
    expect(await p.isSaveEnabled()).toBe(false); // Save blocked while a cell is invalid
  });

  test('TC-CPR-DET-024: New Price with extra decimals rounds to two decimal places on blur', async ({ corporatePricingDetailPage: p }) => {
    const name = DETAIL.anchorA.name;
    await p.setNewPrice(name, '12.3456');
    expect(await p.getNewPrice(name)).toMatch(/^12\.3[45]$/); // rounded/truncated to 2dp
    expect(await p.isSaveEnabled()).toBe(true);
  });

  test('TC-CPR-DET-025: New Price overflow value never reaches a committable state', async ({ corporatePricingDetailPage: p }) => {
    const name = DETAIL.anchorA.name;
    await p.setNewPrice(name, '99999999999999999999999999999999');
    // An out-of-range value is either flagged invalid or not accepted — in no case is Save enabled.
    expect(await p.isSaveEnabled()).toBe(false);
  });

  test('TC-CPR-DET-026: New Price non-numeric input is rejected (the field clears; Save stays disabled)', async ({ corporatePricingDetailPage: p }) => {
    const name = DETAIL.anchorA.name;
    for (const junk of ['abc', '!@#']) {
      await p.setNewPrice(name, junk);
      expect(await p.getNewPrice(name)).toBe(''); // non-numeric text is discarded
      expect(await p.isSaveEnabled()).toBe(false);
    }
  });

  test('TC-CPR-DET-027: New Price renders with two decimal places for a multi-thousand value', async ({ corporatePricingDetailPage: p }) => {
    const name = DETAIL.anchorA.name;
    await p.setNewPrice(name, '1234.56');
    const v = await p.getNewPrice(name);
    expect(v).toMatch(/^\d[\d,]*\.\d{2}$/); // exactly two decimals (thousands grouping optional in the editor)
    expect(v.replace(/,/g, '')).toBe('1234.56');
    expect(await p.isSaveEnabled()).toBe(true);
  });

  test('TC-CPR-DET-028: Max Discount accepts 0 as a valid no-discount value', async ({ corporatePricingDetailPage: p }) => {
    const name = DETAIL.anchorA.name;
    await p.setMaxDiscount(name, '0');
    expect(await p.getMaxDiscount(name)).toContain('0.00'); // renders "0.00 %"
    expect(await p.getMaxDiscountAriaInvalid(name)).not.toBe('true');
    // The fixture baseline discount is already 0, so re-entering 0 is a net-zero change (Save stays disabled).
    expect(await p.isSaveEnabled()).toBe(false);
  });

  test('TC-CPR-DET-029: Max Discount negative input has its minus sign stripped; the positive value is accepted', async ({ corporatePricingDetailPage: p }) => {
    const name = DETAIL.anchorA.name;
    await p.setMaxDiscount(name, '-5');
    expect(await p.getMaxDiscount(name)).toContain('5.00'); // "5.00 %", sign stripped
    expect(await p.getMaxDiscountAriaInvalid(name)).not.toBe('true');
    expect(await p.isSaveEnabled()).toBe(true);
  });

  test('TC-CPR-DET-030: Max Discount above 100 is flagged invalid and blocks Save', async ({ corporatePricingDetailPage: p }) => {
    const name = DETAIL.anchorA.name;
    await p.setMaxDiscount(name, '150');
    expect(await p.getMaxDiscount(name)).toBe('150'); // kept, unformatted while invalid
    expect(await p.getMaxDiscountAriaInvalid(name)).toBe('true'); // over the 100% cap
    expect(await p.isSaveEnabled()).toBe(false);
  });

  test('TC-CPR-DET-031: Max Discount with two decimals is accepted and rendered as a percentage', async ({ corporatePricingDetailPage: p }) => {
    const name = DETAIL.anchorA.name;
    await p.setMaxDiscount(name, '33.33');
    expect(await p.getMaxDiscount(name)).toContain('33.33'); // "33.33 %"
    expect(await p.getMaxDiscountAriaInvalid(name)).not.toBe('true');
    expect(await p.isSaveEnabled()).toBe(true);
  });

  test('TC-CPR-DET-032: Max Discount non-numeric input is rejected (the field clears)', async ({ corporatePricingDetailPage: p }) => {
    const name = DETAIL.anchorA.name;
    await p.setMaxDiscount(name, 'xyz');
    expect(await p.getMaxDiscount(name)).toBe(''); // non-numeric text discarded
    expect(await p.getMaxDiscountAriaInvalid(name)).not.toBe('true');
  });

  test('TC-CPR-DET-033: Reverting an edited New Price back to its original value disables Save', async ({ corporatePricingDetailPage: p }) => {
    const name = DETAIL.anchorA.name;
    expect(await p.isSaveEnabled()).toBe(false);
    await p.setNewPrice(name, '99.00');
    expect(await p.isSaveEnabled()).toBe(true);
    await p.clearNewPrice(name); // back to the original (empty) state
    expect(await p.getNewPrice(name)).toBe('');
    expect(await p.isSaveEnabled()).toBe(false); // no net change → clean
  });

  test('TC-CPR-DET-034: A New Price override can be reverted so the Base Price is back in effect', async ({ corporatePricingDetailPage: p }) => {
    const name = DETAIL.anchorB.name;
    await p.setNewPrice(name, DETAIL.newPriceEdit.value); // 250.00 override
    if (!(await p.isSaveEnabled())) await p.setMaxDiscount(name, '1');
    await p.saveAndConfirm();
    await p.open();
    expect(await p.getCellText(name, 'price')).toBe(DETAIL.newPriceEdit.value); // override is now the Price
    await p.setNewPrice(name, DETAIL.anchorB.basePrice); // revert to base value
    if (!(await p.isSaveEnabled())) await p.setMaxDiscount(name, '1');
    await p.saveAndConfirm();
    await p.open();
    expect(await p.getCellText(name, 'price')).toBe(DETAIL.anchorB.basePrice); // Base Price back in effect
    await p.ensureDefaultState();
  });

  test('TC-CPR-DET-035: The read-only Base Price cell exposes no input and cannot be edited', async ({ corporatePricingDetailPage: p }) => {
    const name = DETAIL.anchorA.name;
    const before = await p.getCellText(name, 'price');
    expect(await p.priceIsReadOnly(name)).toBe(true); // no <input> in the Price cell
    expect(await p.isSaveEnabled()).toBe(false);
    expect(await p.getCellText(name, 'price')).toBe(before); // value unchanged
  });

  test('TC-CPR-DET-036: A row is located and read by its product-group name, never a positional index', async ({ corporatePricingDetailPage: p }) => {
    const name = DETAIL.anchorB.name; // resolved by unique content, not nth(row)
    expect(await p.getCellText(name, 'price')).toBe(DETAIL.anchorB.basePrice);
    expect(typeof (await p.getNewPrice(name))).toBe('string');
  });

  // ── Create-mode positive control ──
  test('TC-CPR-DET-037: In create mode both double-click and a full-pointer drag add a product-group row', async ({ corporatePricingNewPricebookPage: np }) => {
    await np.open('equipment');
    await np.clickDetailTab();
    // Content-anchored: the grid may start with a placeholder row, so assert the added group is
    // PRESENT by name rather than counting rows (count is confounded by the placeholder).
    await np.addProductGroupByName(DETAIL.anchorA.name); // double-click ADD
    await expect.poll(async () => (await np.getDetailGridRows()).join(' | '), {
      message: 'double-click adds the product group', timeout: 10_000,
    }).toContain(DETAIL.anchorA.name);

    await np.dragProductGroupByName(DETAIL.anchorB.name); // full-pointer drag ADD (the positive-control primitive)
    await expect.poll(async () => (await np.getDetailGridRows()).join(' | '), {
      message: 'full-pointer drag adds another product group', timeout: 10_000,
    }).toContain(DETAIL.anchorB.name);
    // No commit — the create page is intentionally non-persisting; this only proves the add primitive fires.
  });

  test('TC-CPR-DET-038: Editing and saving a row New Price does not silently change its Max Discount', async ({ corporatePricingDetailPage: p }) => {
    const name = DETAIL.anchorB.name;
    const mdBefore = await p.getMaxDiscount(name);
    await p.setNewPrice(name, DETAIL.newPriceEdit.value); // a New-Price edit alone enables Save
    await p.saveAndConfirm();
    await p.open();
    expect(await p.getMaxDiscount(name)).toBe(mdBefore); // no silent coercion (watch: NM-2301)
    await p.ensureDefaultState();
  });

  test('TC-CPR-DET-039: Editing only the New Price enables Save', async ({ corporatePricingDetailPage: p }) => {
    const name = DETAIL.anchorB.name;
    expect(await p.isSaveEnabled()).toBe(false);
    await p.setNewPrice(name, '200.00'); // a New-Price-only edit
    expect(await p.isSaveEnabled()).toBe(true); // marks the grid dirty (NM-1874)
  });

  test('TC-CPR-DET-040: A New Price change marks the grid dirty and enables Save', async ({ corporatePricingDetailPage: p }) => {
    const name = DETAIL.anchorA.name;
    expect(await p.isSaveEnabled()).toBe(false);
    await p.setNewPrice(name, '321.00');
    expect(await p.isSaveEnabled()).toBe(true);
  });

  test('TC-CPR-DET-041: Clearing a staged New Price before saving leaves the displayed Price unchanged', async ({ corporatePricingDetailPage: p }) => {
    const name = DETAIL.anchorA.name;
    const priceBefore = await p.getCellText(name, 'price'); // base price
    await p.setNewPrice(name, '450.00'); // stage an override (not saved)
    await p.clearNewPrice(name); // clear it back out
    expect(await p.getNewPrice(name)).toBe('');
    expect(await p.getCellText(name, 'price')).toBe(priceBefore); // nothing committed → Price unchanged
    expect(await p.isSaveEnabled()).toBe(false); // back to clean
  });

  test('TC-CPR-DET-042: Saving an edit on one row does not change another row values', async ({ corporatePricingDetailPage: p }) => {
    const a = DETAIL.anchorA.name;
    const b = DETAIL.anchorB.name;
    const bPriceBefore = await p.getCellText(b, 'price');
    const bMdBefore = await p.getMaxDiscount(b);
    await p.setMaxDiscount(a, DETAIL.maxDiscountEdit.value); // edit row A only
    await p.saveAndConfirm();
    await p.open();
    expect(await p.getCellText(b, 'price')).toBe(bPriceBefore); // row B unaffected (watch: NM-2095)
    expect(await p.getMaxDiscount(b)).toBe(bMdBefore);
    await p.ensureDefaultState();
  });

  test('TC-CPR-DET-043: A saved Max Discount of 100 currently reloads as 1 — defect NM-1967 reproduced', async ({ corporatePricingDetailPage: p }) => {
    const name = DETAIL.anchorA.name;
    await p.setMaxDiscount(name, '100');
    expect(await p.getMaxDiscountAriaInvalid(name)).not.toBe('true'); // 100 is accepted as valid input
    await p.saveAndConfirm();
    await p.open();
    // KNOWN APP DEFECT (NM-1967): entering 100 and saving stores/redisplays the Max Discount as 1, not 100.
    const atRest = await p.getMaxDiscount(name);
    expect(atRest).toContain('1.00'); // reloads as "1.00 %"
    expect(atRest).not.toContain('100'); // the entered 100 is gone
    expect(await p.getMaxDiscountAfterFocus(name)).toBe('1'); // and shows "1" on focus
    await p.ensureDefaultState();
  });

  // ── SBC — surface behaviors ──
  // The Detail grid renders every product-group row at once: it exposes NO rows-per-page selector,
  // NO page-navigation buttons, and its column headers are not sort triggers. These cases assert
  // that observed reality (a divergence from the speculative "paginated/sortable" expectation).

  test('TC-CPR-DET-044: The Detail grid exposes no rows-per-page selector and no page-navigation buttons', async ({ corporatePricingDetailPage: p }) => {
    expect(await p.hasPageSizeControl()).toBe(false);
    expect(await p.getPaginationNavLabels()).toEqual([]);
  });

  test('TC-CPR-DET-045: The Detail grid renders all rows at once (more than a single page would hold)', async ({ corporatePricingDetailPage: p }) => {
    expect(await p.getProductGroupRowCount()).toBeGreaterThan(50); // far beyond any page size → non-paginated
    expect(await p.hasPageSizeControl()).toBe(false);
  });

  test('TC-CPR-DET-046: A row that a paginated grid would place on a later page is present without any navigation', async ({ corporatePricingDetailPage: p }) => {
    expect(await p.getCellText(DETAIL.anchorB.name, 'price')).toBe(DETAIL.anchorB.basePrice);
  });

  test('TC-CPR-DET-047: The Detail grid renders no first/previous/next/last navigation controls', async ({ corporatePricingDetailPage: p }) => {
    expect(await p.getPaginationNavLabels()).toEqual([]);
  });

  test('TC-CPR-DET-048: Each product group appears once — content-anchored rows are unique', async ({ corporatePricingDetailPage: p }) => {
    expect(await p.getCellText(DETAIL.anchorA.name, 'price')).toBe(DETAIL.anchorA.basePrice);
    expect(await p.getCellText(DETAIL.anchorB.name, 'price')).toBe(DETAIL.anchorB.basePrice);
  });

  test('TC-CPR-DET-049: The Detail grid column headers are not sort triggers', async ({ corporatePricingDetailPage: p }) => {
    expect(await p.headerHasSortButton('Product Group Name')).toBe(false);
    expect(await p.getHeaderAriaSort('Product Group Name')).toBeNull();
    expect(await p.getHeaderAriaSort('Price')).toBeNull();
  });

  test('TC-CPR-DET-050: A New Price cell renders a two-decimal currency value; the Price column is read-only', async ({ corporatePricingDetailPage: p }) => {
    const name = DETAIL.anchorA.name;
    expect(await p.getCellText(name, 'price')).toMatch(/^\d[\d,]*\.\d{2}$/); // base price, two decimals
    expect(await p.priceIsReadOnly(name)).toBe(true);
    await p.setNewPrice(name, '1234.56');
    expect((await p.getNewPrice(name)).replace(/,/g, '')).toBe('1234.56'); // editor shows two decimals
  });

  test('TC-CPR-DET-051: Every base-price cell renders two decimals; rows with no override show the base price', async ({ corporatePricingDetailPage: p }) => {
    for (const a of [DETAIL.anchorA, DETAIL.anchorB]) {
      expect(await p.getCellText(a.name, 'price')).toBe(a.basePrice); // two-decimal base price
      expect(await p.getNewPrice(a.name)).toBe(''); // no override → empty New Price input
    }
  });

  test('TC-CPR-DET-052: A single content-anchored row renders and is readable', async ({ corporatePricingDetailPage: p }) => {
    const name = DETAIL.anchorA.name;
    expect(await p.getCellText(name, 'id')).toBe(DETAIL.anchorA.id);
    expect(await p.getCellText(name, 'price')).toBe(DETAIL.anchorA.basePrice);
  });

  test('TC-CPR-DET-053: The high-volume grid renders without error and off-screen rows read by content anchor', async ({ corporatePricingDetailPage: p }) => {
    // N-row (high-volume) integrity on the management fixture; dedicated 0-row / 1-row pricebooks are
    // not part of this fixture set, so this asserts the available volume + off-screen anchor read.
    expect(await p.getProductGroupRowCount()).toBeGreaterThan(50);
    expect(await p.getCellText(DETAIL.anchorB.name, 'price')).toBe(DETAIL.anchorB.basePrice); // off-screen by anchor
  });

  test('TC-CPR-DET-054: A saved Max Discount edit survives a page reload (content-anchored)', async ({ corporatePricingDetailPage: p }) => {
    const name = DETAIL.anchorA.name;
    await p.ensureDefaultState();
    await p.setMaxDiscount(name, '22.50');
    await p.saveAndConfirm();
    await p.open();
    expect(await p.getMaxDiscount(name)).toContain('22.50'); // persisted, row found by name
    await p.ensureDefaultState();
  });

  test('TC-CPR-DET-055: A dirty edit survives a Detail↔Strategy tab switch; reverting it disables Save', async ({ corporatePricingDetailPage: p }) => {
    const name = DETAIL.anchorA.name;
    await p.ensureDefaultState();
    await p.setMaxDiscount(name, DETAIL.maxDiscountEdit.value);
    expect(await p.isSaveEnabled()).toBe(true); // dirty
    await p.switchTab('Pricing Strategy');
    await p.switchTab('Pricing Detail');
    expect(await p.isSaveEnabled()).toBe(true); // pending change preserved across the tab switch
    await p.setMaxDiscount(name, '0'); // revert to the baseline no-discount value
    expect(await p.isSaveEnabled()).toBe(false); // net-zero → Save disabled
    await p.ensureDefaultState();
  });
});
