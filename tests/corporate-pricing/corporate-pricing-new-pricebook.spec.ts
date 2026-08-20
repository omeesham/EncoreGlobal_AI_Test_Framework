import { test, expect } from '../../src/fixtures/pages.fixture';
import { NEW_PRICEBOOK } from '../../src/data/corporate-pricing/new-pricebook';
import { DETAIL } from '../../src/data/corporate-pricing/detail';

/**
 * MUTATION SAFETY: NO-COMMIT. A created pricebook is irreversible via the UI (no delete/deactivate),
 * so save-cycle TCs assert Save *reachability* (Save enabled → "Save Changes" dialog →
 * Cancel) and never confirm. Baseline = a fresh, always-empty create page per test
 * (`open(type)` in `beforeEach`). React-controlled inputs filled via the page object's `setReactInput`
 * (native value-setter — `.fill()` does not commit React state). No fixed waits.
 *
 * Divergences raised: Type is disabled, the strategy dialog has no Type field, a decimal year is
 * accepted client-side, there is no delete, and ≥1 strategy is required before Save.
 */
test.describe('Corporate Pricing — New Pricebook (Equipment) @corporate-pricing @new-pricebook', () => {
  test.beforeEach(async ({ corporatePricingNewPricebookPage: p }) => {
    await p.open('equipment'); // baseline: fresh, empty create page
  });


  test('TC-CPR-NPB-001: Equipment create page loads via the type route param', async ({ corporatePricingNewPricebookPage: p }) => {
    expect(await p.getHeading()).toBe('New Pricebook');
    expect(p.page.url()).toContain('type=equipment');
  });

  test('TC-CPR-NPB-002: Pricebook Name field is present and editable', async ({ corporatePricingNewPricebookPage: p }) => {
    await p.setName(NEW_PRICEBOOK.validName);
    expect(await p.getName()).toBe(NEW_PRICEBOOK.validName);
  });

  test('TC-CPR-NPB-003: Price Book Type shows Equipment and is read-only (route-fixed)', async ({ corporatePricingNewPricebookPage: p }) => {
    expect(await p.getTypeValue()).toBe(NEW_PRICEBOOK.typeDisplay.equipment);
    expect(await p.isTypeDisabled()).toBe(true); // Type is route-fixed (display-only)
  });

  test('TC-CPR-NPB-004: Price Year field is present and editable', async ({ corporatePricingNewPricebookPage: p }) => {
    await p.setYear(NEW_PRICEBOOK.validYear);
    expect(await p.getYear()).toBe(NEW_PRICEBOOK.validYear);
  });

  test('TC-CPR-NPB-005: Currency defaults to USD', async ({ corporatePricingNewPricebookPage: p }) => {
    expect(await p.getCurrencyValue()).toBe(NEW_PRICEBOOK.currencyDefault);
  });

  test('TC-CPR-NPB-006: Currency dropdown offers USD, CAD, MXN', async ({ corporatePricingNewPricebookPage: p }) => {
    const opts = await p.getCurrencyOptions();
    for (const c of NEW_PRICEBOOK.currencyOptions) expect(opts).toContain(c);
  });

  test('TC-CPR-NPB-007: Tabs render — Pricing Strategy + Pricing Detail', async ({ corporatePricingNewPricebookPage: p }) => {
    const tabs = await p.getTabs();
    expect(tabs, 'Pricing Strategy tab should be visible').toContain('Pricing Strategy');
    expect(tabs, 'Pricing Detail tab should be visible').toContain('Pricing Detail');
  });


  test('TC-CPR-NPB-008: Single-character Pricebook Name keeps the form savable', async ({ corporatePricingNewPricebookPage: p }) => {
    await p.setYear(NEW_PRICEBOOK.validYear);
    await p.addStrategy();
    await p.setName(NEW_PRICEBOOK.singleCharName);
    expect(await p.isSaveEnabled()).toBe(true);
  });

  test('TC-CPR-NPB-009: Long Pricebook Name (250 chars) is accepted', async ({ corporatePricingNewPricebookPage: p }) => {
    await p.setYear(NEW_PRICEBOOK.validYear);
    await p.addStrategy();
    await p.setName(NEW_PRICEBOOK.longName);
    expect((await p.getName()).length).toBe(250); // no client truncation
    expect(await p.isSaveEnabled()).toBe(true);
  });

  test('TC-CPR-NPB-010: Special characters in Pricebook Name are accepted', async ({ corporatePricingNewPricebookPage: p }) => {
    await p.setYear(NEW_PRICEBOOK.validYear);
    await p.addStrategy();
    await p.setName(NEW_PRICEBOOK.specialName);
    expect(await p.getName()).toBe(NEW_PRICEBOOK.specialName);
    expect(await p.isSaveEnabled()).toBe(true);
  });

  test('TC-CPR-NPB-011: Empty Pricebook Name blocks Save', async ({ corporatePricingNewPricebookPage: p }) => {
    await p.setYear(NEW_PRICEBOOK.validYear);
    await p.addStrategy();
    expect(await p.isSaveEnabled()).toBe(false);
  });

  test('TC-CPR-NPB-012: Whitespace-only Pricebook Name is treated as empty (blocks Save)', async ({ corporatePricingNewPricebookPage: p }) => {
    await p.setYear(NEW_PRICEBOOK.validYear);
    await p.addStrategy();
    await p.setName(NEW_PRICEBOOK.whitespaceName);
    expect(await p.isSaveEnabled()).toBe(false);
  });


  test('TC-CPR-NPB-013: Empty Price Year blocks Save', async ({ corporatePricingNewPricebookPage: p }) => {
    await p.setName(NEW_PRICEBOOK.validName);
    await p.addStrategy();
    expect(await p.isSaveEnabled()).toBe(false);
  });

  test('TC-CPR-NPB-014: Non-numeric Price Year input is rejected', async ({ corporatePricingNewPricebookPage: p }) => {
    await p.setYear(NEW_PRICEBOOK.validYear);
    await p.setYear(NEW_PRICEBOOK.alphaYear); // native-set "abcd" → React sanitizer reverts
    expect(/[a-z]/i.test(await p.getYear())).toBe(false); // no alpha retained
  });

  test('TC-CPR-NPB-015: Valid year keeps the form savable; a decimal is not blocked client-side', async ({ corporatePricingNewPricebookPage: p }) => {
    await p.setName(NEW_PRICEBOOK.validName);
    await p.addStrategy();
    await p.setYear(NEW_PRICEBOOK.validYear);
    expect(await p.isSaveEnabled()).toBe(true);
    // Decimal: client does NOT reject (server validation unverified, no-commit).
    await p.setYear(NEW_PRICEBOOK.decimalYear);
    expect(await p.getYear()).toBe(NEW_PRICEBOOK.decimalYear);
    expect(await p.isSaveEnabled()).toBe(true);
  });


  test('TC-CPR-NPB-016: New Pricing Strategy (+) opens the add dialog (Name + flags, no Type field)', async ({ corporatePricingNewPricebookPage: p }) => {
    await p.openAddStrategyDialog();
    expect(await p.isAddDialogOpen()).toBe(true);
    // Dialog presents the Strategy Name field + flag checkboxes (no separate "Type" control).
    await test.step('Confirm the strategy name field appears', async () => {
      await expect(p.page.locator('#new-strategy-name')).toBeVisible();
    });
    await test.step('Confirm the Is Active checkbox appears in the dialog', async () => {
      await expect(p.page.getByRole('dialog').getByRole('checkbox', { name: 'Is Active' })).toBeVisible();
    });
    await p.cancelAddDialog();
  });

  test('TC-CPR-NPB-017: Strategy dialog defaults — Is Active checked, others unchecked', async ({ corporatePricingNewPricebookPage: p }) => {
    await p.openAddStrategyDialog();
    expect((await p.getDialogFlag('Is Active')).checked).toBe(true);
    expect((await p.getDialogFlag('Is GSO')).checked).toBe(false);
    expect((await p.getDialogFlag('Is Internal')).checked).toBe(false);
    expect((await p.getDialogFlag('Is Productions')).checked).toBe(false);
    await p.cancelAddDialog();
  });

  test('TC-CPR-NPB-018: Adding a strategy appends it to the list', async ({ corporatePricingNewPricebookPage: p }) => {
    expect(await p.hasNoStrategiesYet()).toBe(true);
    expect(await p.getStrategyTotal()).toBe(0);
    await p.addStrategy(NEW_PRICEBOOK.strategyName);
    expect(await p.getStrategyTotal()).toBe(1);
    expect(await p.hasNoStrategiesYet()).toBe(false);
  });

  test('TC-CPR-NPB-019: Adding a second strategy lists both', async ({ corporatePricingNewPricebookPage: p }) => {
    await p.addStrategy(NEW_PRICEBOOK.strategyName);
    await p.addStrategy(NEW_PRICEBOOK.secondStrategyName);
    expect(await p.getStrategyTotal()).toBe(2);
  });

  test('TC-CPR-NPB-020: Add with an empty Strategy Name is a no-op', async ({ corporatePricingNewPricebookPage: p }) => {
    const before = await p.getStrategyTotal();
    const { stillOpen, addDisabled } = await p.getEmptyNameAddGuard();
    expect(addDisabled).toBe(true); // empty name keeps Add disabled — the guard that blocks the add
    expect(stillOpen).toBe(true); // dialog stays open
    expect(await p.getStrategyTotal()).toBe(before); // nothing added
    await p.cancelAddDialog();
  });


  test('TC-CPR-NPB-021: Save is disabled on the empty create form', async ({ corporatePricingNewPricebookPage: p }) => {
    expect(await p.isSaveEnabled()).toBe(false);
  });

  test('TC-CPR-NPB-022: Save stays disabled without a strategy (≥1 strategy required)', async ({ corporatePricingNewPricebookPage: p }) => {
    await p.setName(NEW_PRICEBOOK.validName);
    await p.setYear(NEW_PRICEBOOK.validYear);
    expect(await p.getStrategyTotal()).toBe(0);
    expect(await p.isSaveEnabled()).toBe(false); // ≥1 strategy required before Save enables
  });

  test('TC-CPR-NPB-023: Save enables with Name + Year + one strategy and zero product groups (Empty-Shell)', async ({ corporatePricingNewPricebookPage: p }) => {
    await p.setName(NEW_PRICEBOOK.validName);
    await p.setYear(NEW_PRICEBOOK.validYear);
    await p.addStrategy();
    // No product groups added (Empty-Shell — DOCX R1440-9 / helper 021 / 1443-010).
    expect(await p.isSaveEnabled()).toBe(true);
  });

  test('TC-CPR-NPB-024: Save opens the confirmation dialog; Cancel aborts without committing', async ({ corporatePricingNewPricebookPage: p }) => {
    await p.fillMinimalSavable();
    expect(await p.isSaveEnabled()).toBe(true);
    const dialogText = await p.clickSaveExpectDialog();
    expect(dialogText).toContain(NEW_PRICEBOOK.saveDialog.title);
    expect(dialogText).toContain(NEW_PRICEBOOK.saveDialog.body);
    // NO-COMMIT: Cancel (a created pricebook is irreversible via UI).
    await p.cancelSaveDialog();
    // Still on the create page (no redirect to /details).
    expect(await p.getHeading()).toBe('New Pricebook');
    expect(p.page.url()).toContain('/add');
  });


  test('TC-CPR-NPB-025: Pricing Detail tab shows the Product Groups source list (Equipment catalog)', async ({ corporatePricingNewPricebookPage: p }) => {
    test.setTimeout(90_000); // heavy detail tab (~3707 source items)
    await p.clickDetailTab();
    expect(await p.getSourceGroupCount()).toBeGreaterThan(0);
    await test.step('Confirm the product group search field appears', async () => {
      await expect(p.page.locator('input[placeholder="Search ID or Name..."]')).toBeVisible();
    });
  });

  test('TC-CPR-NPB-026: Double-clicking a product group adds it to the pricebook grid', async ({ corporatePricingNewPricebookPage: p }) => {
    test.setTimeout(90_000);
    await p.clickDetailTab();
    await p.addProductGroupByName(NEW_PRICEBOOK.equipmentGroupA);
    const rows = (await p.getDetailGridRows()).join(' | ');
    expect(rows).toContain(NEW_PRICEBOOK.equipmentGroupA);
  });

  test('TC-CPR-NPB-027: Adding multiple product groups appends rows', async ({ corporatePricingNewPricebookPage: p }) => {
    test.setTimeout(90_000);
    await p.clickDetailTab();
    await p.addProductGroupByName(NEW_PRICEBOOK.equipmentGroupA);
    await p.addProductGroupByName(NEW_PRICEBOOK.equipmentGroupB);
    const rows = (await p.getDetailGridRows()).join(' | ');
    expect(rows).toContain(NEW_PRICEBOOK.equipmentGroupA);
    expect(rows).toContain(NEW_PRICEBOOK.equipmentGroupB);
  });

  // e2e is single-tenant (ours). This test SAVES a real pricebook. If it ever fails on "can't add",
  // the likely cause is we've used up the unique source product-groups (UI has no delete to recycle
  // them) — escalate THEN, not pre-emptively.
  test('TC-CPR-NPB-031: Saving a new pricebook persists it — created book reloads + is found by Search with its product group', async ({ corporatePricingNewPricebookPage: np, corporatePricingSearchPage: sp }) => {
    test.setTimeout(150_000); // heavy Detail tab (~3707 source items) + commit + redirect + reload + Search
    // Unique, reproducible name: fixed prefix + a passed-in run-stamp (env), pid fallback — never
    // Date.now()/random. Keeps each committed book uniquely searchable.
    const runStamp = process.env.PRICEBOOK_RUN_STAMP ?? String(process.pid);
    const name = `${NEW_PRICEBOOK.persistNamePrefix}${runStamp}`;

    // Build a savable, NON-empty book (Name + Year + 1 strategy + 1 product group) and COMMIT it.
    await np.fillSavableWithProductGroup(name, NEW_PRICEBOOK.validYear, NEW_PRICEBOOK.equipmentGroupA);
    expect(await np.isSaveEnabled()).toBe(true);
    const newId = await np.confirmSaveAndGetNewId();
    expect(newId.length).toBeGreaterThan(0); // redirected to /details/<guid> → the record exists

    // Persistence proof 1 (RELOAD): open the saved book's Pricing Detail tab fresh — the product
    // group survived the save (content-anchored, never a count). The helper waits for the heavy
    // management-mode grid to render before reading (reading immediately races an empty grid).
    const detailRows = (await np.readSavedDetailGroups(NEW_PRICEBOOK.office, newId)).join(' | ');
    expect(detailRows, 'The saved product group should persist after reload').toContain(NEW_PRICEBOOK.equipmentGroupA);

    // Persistence proof 2 (SEARCH by name): the new book is discoverable by its unique name. Broaden
    // the result set (Active-Only off) so the assertion does not depend on the record's active flag.
    await sp.open();
    await sp.setCheckbox('activeOnly', false);
    await sp.fillPricebookFilter(name);
    await sp.searchAndWaitForList();
    const row = await sp.findRowByName(name);
    expect(row, `created pricebook "${name}" should be found in Search after save`).not.toBeNull();
  });


  test('TC-CPR-NPB-032: Dragging a product group (real pointer sequence) adds it to the create grid', async ({ corporatePricingNewPricebookPage: p }) => {
    test.setTimeout(90_000); // heavy detail tab (~3707 source items)
    await p.clickDetailTab();
    await p.dragProductGroupByName(NEW_PRICEBOOK.equipmentGroupA);
    const rows = (await p.getDetailGridRows()).join(' | ');
    expect(rows).toContain(NEW_PRICEBOOK.equipmentGroupA); // create-mode drag positive control
  });

  test('TC-CPR-NPB-033: Drag-add → Save reachable → Cancel (no commit)', async ({ corporatePricingNewPricebookPage: p }) => {
    test.setTimeout(120_000);
    await p.setName(NEW_PRICEBOOK.validName);
    await p.setYear(NEW_PRICEBOOK.validYear);
    await p.addStrategy();
    await p.clickDetailTab();
    await p.dragProductGroupByName(NEW_PRICEBOOK.equipmentGroupA);
    expect((await p.getDetailGridRows()).join(' | ')).toContain(NEW_PRICEBOOK.equipmentGroupA);
    expect(await p.isSaveEnabled()).toBe(true);
    const dialogText = await p.clickSaveExpectDialog();
    expect(dialogText).toContain(NEW_PRICEBOOK.saveDialog.title);
    await p.cancelSaveDialog(); // irreversible create → never confirm in CI
    expect(p.page.url()).toContain('/add');
  });


  test('TC-CPR-NPB-039: Empty Price Year shows a visible required/invalid indicator', async ({ corporatePricingNewPricebookPage: p }) => {
    const empty = await p.getYearValidationState();
    expect(empty.ariaInvalid).toBe('true'); // empty year is invalid
    await p.setYear(NEW_PRICEBOOK.validYear);
    const valid = await p.getYearValidationState();
    expect(valid.ariaInvalid).toBe('false'); // valid year clears the invalid state
    // The required state is visibly indicated — the border differs between the invalid and valid states.
    expect(valid.borderColor).not.toBe(empty.borderColor);
  });

  test('TC-CPR-NPB-040: An existing pricebook name raises no client-side inline uniqueness error', async ({ corporatePricingNewPricebookPage: p }) => {
    const res = await p.setNameAndReadUniqueness(NEW_PRICEBOOK.existingPricebookName);
    expect(res.ariaInvalid).not.toBe('true'); // the name field does not go invalid on a duplicate
    expect(res.hasInlineUniquenessError).toBe(false); // no "already exists" message client-side
  });


  test('TC-CPR-NPB-044: Create-mode empty-state hint reads verbatim + a one-product grid renders', async ({ corporatePricingNewPricebookPage: p }) => {
    test.setTimeout(90_000);
    await p.clickDetailTab();
    const hint = await p.getDetailEmptyStateHint();
    expect(hint).toContain(NEW_PRICEBOOK.emptyStateHint.addedPhrase);
    expect(hint).toContain(NEW_PRICEBOOK.emptyStateHint.actionPhrase);
    await p.addProductGroupByName(NEW_PRICEBOOK.equipmentGroupA);
    const rows = await p.getDetailGridRows();
    expect(rows.join(' | ')).toContain(NEW_PRICEBOOK.equipmentGroupA); // the 1-item volume state
  });

  test('TC-CPR-NPB-045: Create-mode 0/1/N volume + source-catalog reachability', async ({ corporatePricingNewPricebookPage: p }) => {
    test.setTimeout(120_000);
    await p.clickDetailTab();
    expect(await p.getDetailEmptyStateHint()).toContain(NEW_PRICEBOOK.emptyStateHint.addedPhrase); // 0 state shows the empty-state
    await p.addProductGroupByName(NEW_PRICEBOOK.equipmentGroupA); // 1
    await p.addProductGroupByName(NEW_PRICEBOOK.equipmentGroupB); // N
    const rows = (await p.getDetailGridRows()).join(' | ');
    expect(rows).toContain(NEW_PRICEBOOK.equipmentGroupA);
    expect(rows).toContain(NEW_PRICEBOOK.equipmentGroupB);
    // The source catalog is virtualized; an item is reachable by content through the source search.
    await p.filterSourceGroups(NEW_PRICEBOOK.equipmentGroupA);
    const sample = (await p.getSourceGroupSample(10)).join(' | ');
    expect(sample).toContain(NEW_PRICEBOOK.equipmentGroupA);
  });


  test('TC-CPR-NPB-046: Create-mode dirty state survives a Strategy ↔ Detail tab switch', async ({ corporatePricingNewPricebookPage: p }) => {
    test.setTimeout(90_000);
    await p.addStrategy(NEW_PRICEBOOK.strategyName);
    expect(await p.getStrategyTotal()).toBe(1);
    await p.clickDetailTab();
    await p.addProductGroupByName(NEW_PRICEBOOK.equipmentGroupA);
    expect((await p.getDetailGridRows()).join(' | ')).toContain(NEW_PRICEBOOK.equipmentGroupA);
    await p.clickStrategyTab();
    expect(await p.getStrategyTotal()).toBe(1); // strategy retained across the switch
    await p.clickDetailTab();
    expect((await p.getDetailGridRows()).join(' | ')).toContain(NEW_PRICEBOOK.equipmentGroupA); // grid retained
  });

  test('TC-CPR-NPB-047: Create-mode dirty discards on navigate-away (beforeunload) → reload shows empty form', async ({ corporatePricingNewPricebookPage: p }) => {
    await p.setName(NEW_PRICEBOOK.validName);
    await p.setYear(NEW_PRICEBOOK.validYear);
    await p.addStrategy();
    expect(await p.getStrategyTotal()).toBe(1); // form is dirty
    await p.open('equipment'); // navigate away + back (the fixture auto-accepts the beforeunload guard)
    expect(await p.getName()).toBe(''); // nothing persisted
    expect(await p.hasNoStrategiesYet()).toBe(true);
  });

  test('TC-CPR-NPB-048: Removing the only strategy returns Save to disabled — no net change', async ({ corporatePricingNewPricebookPage: p }) => {
    await p.setName(NEW_PRICEBOOK.validName);
    await p.setYear(NEW_PRICEBOOK.validYear);
    await p.addStrategy(NEW_PRICEBOOK.strategyName);
    expect(await p.isSaveEnabled()).toBe(true);
    await p.removeStrategy(NEW_PRICEBOOK.strategyName);
    expect(await p.isSaveEnabled()).toBe(false); // ≥1 strategy required — Save tracks the live precondition
  });


  test('TC-CPR-NPB-049: Source-list search filters the product-group catalog to matches', async ({ corporatePricingNewPricebookPage: p }) => {
    test.setTimeout(90_000);
    await p.clickDetailTab();
    await p.filterSourceGroups(NEW_PRICEBOOK.equipmentGroupA);
    const sample = (await p.getSourceGroupSample(10)).join(' | ');
    expect(sample).toContain(NEW_PRICEBOOK.equipmentGroupA); // result reflects the query
  });

  test('TC-CPR-NPB-050: Source search by exact name narrows then clears to restore the full catalog', async ({ corporatePricingNewPricebookPage: p }) => {
    test.setTimeout(90_000);
    await p.clickDetailTab();
    const fullCount = await p.getSourceGroupCount();
    expect(fullCount).toBeGreaterThan(1);
    await p.filterSourceGroups(NEW_PRICEBOOK.equipmentGroupA);
    expect((await p.getSourceGroupSample(10)).join(' | ')).toContain(NEW_PRICEBOOK.equipmentGroupA);
    await p.clearSourceFilter();
    expect(await p.getSourceGroupCount()).toBeGreaterThan(1); // full catalog restored
  });
});

test.describe('Corporate Pricing — New Pricebook (Labor) @corporate-pricing @new-pricebook', () => {
  test.beforeEach(async ({ corporatePricingNewPricebookPage: p }) => {
    await p.open('labor'); // baseline: fresh, empty create page
  });

  test('TC-CPR-NPB-028: Labor create page loads via the type route param; Type shows Labor (read-only)', async ({ corporatePricingNewPricebookPage: p }) => {
    expect(await p.getHeading()).toBe('New Pricebook');
    expect(p.page.url()).toContain('type=labor');
    expect(await p.getTypeValue()).toBe(NEW_PRICEBOOK.typeDisplay.labor);
    expect(await p.isTypeDisabled()).toBe(true);
  });

  test('TC-CPR-NPB-029: Labor flow header parity + Save gating', async ({ corporatePricingNewPricebookPage: p }) => {
    expect(await p.getCurrencyValue()).toBe(NEW_PRICEBOOK.currencyDefault);
    expect(await p.isSaveEnabled()).toBe(false); // empty
    await p.setName(NEW_PRICEBOOK.validName);
    await p.setYear(NEW_PRICEBOOK.validYear);
    await p.addStrategy();
    expect(await p.isSaveEnabled()).toBe(true);
  });

  test('TC-CPR-NPB-030: Labor Pricing Detail shows a Labor-specific product-group catalog', async ({ corporatePricingNewPricebookPage: p }) => {
    test.setTimeout(90_000);
    await p.clickDetailTab();
    expect(await p.getSourceGroupCount()).toBeGreaterThan(0);
    const sample = (await p.getSourceGroupSample(40)).join(' | ');
    // At least one known Labor product group is present (different catalog than Equipment).
    const hit = NEW_PRICEBOOK.laborGroupSample.some((g) => sample.includes(g));
    expect(hit).toBe(true);
  });

  // The Labor route shares the same page-level Save button + "Save Changes" dialog as Equipment; these
  // two tests prove the core Save action actually fires on Labor, not just that the button enables.

  test('TC-CPR-NPB-051: Labor Save opens the confirmation dialog; Cancel aborts without committing', async ({ corporatePricingNewPricebookPage: p }) => {
    await p.fillMinimalSavable();
    expect(await p.isSaveEnabled()).toBe(true);
    const dialogText = await p.clickSaveExpectDialog();
    expect(dialogText).toContain(NEW_PRICEBOOK.saveDialog.title);
    expect(dialogText).toContain(NEW_PRICEBOOK.saveDialog.body);
    // NO-COMMIT: Cancel (a created pricebook is irreversible via UI).
    await p.cancelSaveDialog();
    // Still on the Labor create page (no redirect to /details).
    expect(await p.getHeading()).toBe('New Pricebook');
    expect(p.page.url()).toContain('/add');
    expect(p.page.url()).toContain('type=labor');
  });

  // e2e is single-tenant (ours). This test SAVES a real Labor pricebook. If it ever fails on "can't add",
  // the likely cause is we've used up the unique source product-groups (UI has no delete to recycle them)
  // — escalate THEN, not pre-emptively. Mirrors the Equipment commit test (TC-031).
  test('TC-CPR-NPB-052: Saving a new Labor pricebook persists it — created book reloads + is found by Search with its product group', async ({ corporatePricingNewPricebookPage: np, corporatePricingSearchPage: sp }) => {
    test.setTimeout(150_000); // heavy Detail tab + commit + redirect + reload + Search
    // Unique, reproducible name: fixed Labor prefix + a passed-in run-stamp (env), pid fallback — never
    // Date.now()/random. The distinct Labor prefix keeps the committed book separable from Equipment ones.
    const runStamp = process.env.PRICEBOOK_RUN_STAMP ?? String(process.pid);
    const name = `${NEW_PRICEBOOK.persistNamePrefixLabor}${runStamp}`;

    // Build a savable, NON-empty Labor book (Name + Year + 1 strategy + 1 Labor product group) and COMMIT it.
    await np.fillSavableWithProductGroup(name, NEW_PRICEBOOK.validYear, NEW_PRICEBOOK.laborGroupA);
    expect(await np.isSaveEnabled()).toBe(true);
    const newId = await np.confirmSaveAndGetNewId();
    expect(newId.length).toBeGreaterThan(0); // redirected to /details/<guid> → the record exists

    // Persistence proof 1 (RELOAD): open the saved book's Pricing Detail tab fresh — the Labor product
    // group survived the save (content-anchored, never a count).
    const detailRows = (await np.readSavedDetailGroups(NEW_PRICEBOOK.office, newId)).join(' | ');
    expect(detailRows).toContain(NEW_PRICEBOOK.laborGroupA);

    // Persistence proof 2 (SEARCH by name): the new book is discoverable by its unique name. Broaden the
    // result set (Active-Only off) so the assertion does not depend on the record's active flag, AND turn
    // the "Is Labor" filter on — the Search screen hides Labor pricebooks unless that filter is checked.
    await sp.open();
    await sp.setCheckbox('activeOnly', false);
    await sp.setCheckbox('isLabor', true);
    await sp.fillPricebookFilter(name);
    await sp.searchAndWaitForList();
    const row = await sp.findRowByName(name);
    expect(row, `created Labor pricebook "${name}" should be found in Search after save`).not.toBeNull();
  });
});

// The toolbar New menu is the affordance that LEADS to the create pages, and the pricebook list's
// render-state (link cells, boolean columns) — both reached from the Corporate Pricing Search screen.
test.describe('Corporate Pricing — New menu + pricebook-list render-state @corporate-pricing @new-pricebook', () => {
  test.beforeEach(async ({ corporatePricingSearchPage: sp }) => {
    await sp.open();
  });

  test('TC-CPR-NPB-034: New menu presents Equipment Pricing + Labor Pricing items', async ({ corporatePricingSearchPage: sp }) => {
    const items = await sp.getNewMenuItemTexts();
    expect(items).toContain('Equipment Pricing');
    expect(items).toContain('Labor Pricing');
  });

  test('TC-CPR-NPB-035: New menu → Equipment Pricing navigates to the Equipment create route', async ({ corporatePricingSearchPage: sp }) => {
    await sp.clickNewEquipmentPricing(); // driven by the menu-item click, not a typed URL
    await sp.page.waitForURL(/\/add\?type=equipment/i, { timeout: 15_000 });
    expect(sp.page.url()).toContain('type=equipment');
  });

  test('TC-CPR-NPB-036: New menu → Labor Pricing navigates to the Labor create route', async ({ corporatePricingSearchPage: sp }) => {
    await sp.clickNewLaborPricing();
    await sp.page.waitForURL(/\/add\?type=labor/i, { timeout: 15_000 });
    expect(sp.page.url()).toContain('type=labor');
  });

  test('TC-CPR-NPB-041: Search pricebook-name cells navigate to the pricebook Details', async ({ corporatePricingSearchPage: sp }) => {
    const cells = await sp.getPricebookNameCells();
    expect(cells.length).toBeGreaterThan(0);
    const first = cells.find((c) => c.text.length > 0);
    expect(first, 'a non-empty pricebook-name cell should exist').toBeTruthy();
    await sp.clickPricebookName(first!.text);
    await sp.page.waitForURL(/\/details\//i, { timeout: 30_000 });
    expect(sp.page.url()).toContain('/details/'); // the link-cell navigates
  });

  test('TC-CPR-NPB-042: Every rendered pricebook-name cell is a navigable link + Currency renders', async ({ corporatePricingSearchPage: sp }) => {
    const cells = (await sp.getPricebookNameCells()).filter((c) => c.text.length > 0);
    expect(cells.length).toBeGreaterThan(0);
    // Every populated name cell carries the link affordance (a non-link where a link is expected would be a defect).
    expect(cells.every((c) => c.isLink)).toBe(true);
    const headers = await sp.getGridHeaders();
    const currencyIdx = headers.findIndex((h) => /currency/i.test(h));
    expect(currencyIdx).toBeGreaterThanOrEqual(0);
    // The Currency column fills from a second request that lands after the rows render (cells show "-"
    // until then) — wait for it to resolve so the read is deterministic under load.
    await sp.waitForCurrencyColumnResolved();
    expect(await sp.getRowCellText(0, currencyIdx)).toMatch(/USD|CAD|MXN/);
    // Navigation of a link cell is proven by the link-cell test (TC-CPR-NPB-041); this asserts the
    // structural render-state — every populated name cell is a link and the Currency column renders.
  });

  test('TC-CPR-NPB-043: Search boolean columns render per the table boolean format', async ({ corporatePricingSearchPage: sp }) => {
    const headers = await sp.getGridHeaders();
    for (const col of ['Is GSO', 'Is Internal', 'Is Labor', 'Is Active', 'Is Productions']) {
      expect(headers, `boolean column "${col}" should be present`).toContain(col);
    }
    const activeIdx = headers.findIndex((h) => /^is active$/i.test(h));
    expect(activeIdx).toBeGreaterThanOrEqual(0);
    const firstRow = sp.page.locator('tbody tr').first();
    const isActive = await sp.readBooleanCell(firstRow, activeIdx); // parses ✔ / empty into a boolean
    expect(typeof isActive).toBe('boolean'); // the boolean render is read consistently
  });
});

// An existing (saved) pricebook opens in management mode — the same Details surface the create flow
// redirects to after a save. The deep inline-edit / save-cycle / persist coverage for this surface is
// owned by the Pricing Detail (TC-CPR-DET-*) + Pricing Strategy (TC-CPR-STR-*) bands; these two assert
// only the create→manage entry: management mode loads with both tabs + a working save-gate.
test.describe('Corporate Pricing — Update existing pricebook (management mode) @corporate-pricing @new-pricebook', () => {
  test('TC-CPR-NPB-037: An existing pricebook opens in management mode (both tabs, Save disabled on clean load)', async ({ corporatePricingDetailPage: dp }) => {
    test.setTimeout(150_000); // heavy management-mode grid (~2430 rows)
    await dp.open(); // opens the saved pricebook Details + activates the Pricing Detail tab
    await test.step('Confirm the Pricing Strategy tab is present', async () => {
      expect(await dp.page.locator('button:has-text("Pricing Strategy")').count()).toBeGreaterThan(0);
    });
    await test.step('Confirm the Pricing Detail tab is present', async () => {
      expect(await dp.page.locator('button:has-text("Pricing Detail")').count()).toBeGreaterThan(0);
    });
    await test.step('Confirm this is not the create form', async () => {
      expect(await dp.page.locator('h1:has-text("New Pricebook")').count()).toBe(0); // not the create form
    });
    expect(await dp.isSaveEnabled()).toBe(false); // clean load → Save disabled
  });

  test('TC-CPR-NPB-038: Management-mode Max Discount edit enables Save (save-gate; no commit)', async ({ corporatePricingDetailPage: dp }) => {
    test.setTimeout(150_000);
    await dp.open();
    expect(await dp.isSaveEnabled()).toBe(false);
    // Max Discount is the reliable dirty lever (a New-Price-only edit does not reliably enable Save).
    const current = await dp.getMaxDiscount(DETAIL.anchorA.name);
    const next = current.startsWith('12') ? '7' : DETAIL.maxDiscountEdit.value; // a value different from the current
    await dp.setMaxDiscount(DETAIL.anchorA.name, next);
    expect(await dp.isSaveEnabled()).toBe(true); // the edit enables Save (the save-gate)
    await dp.page.reload(); // discard — management-mode edits are reversible; never commit in CI
  });
});
