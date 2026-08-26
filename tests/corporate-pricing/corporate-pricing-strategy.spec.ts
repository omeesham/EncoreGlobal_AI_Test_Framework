import { test, expect } from '../../src/fixtures/pages.fixture';
import { STRATEGY } from '../../src/data/corporate-pricing/strategy';
import { NEW_PRICEBOOK } from '../../src/data/corporate-pricing/new-pricebook';

/**
 * Mutation safety: per-test `ensureDefaultState()` restores the strategyFixture
 * (2022-NP Tier 1) to baseline (1 strategy, original name). Save-cycle tests mutate via a REVERSIBLE
 * existing-strategy name edit (the only UI-reversible save). Add/Remove tests discard WITHOUT saving
 * (a saved new strategy becomes legacy and loses its Remove → not restorable). No fixed waits;
 * Angular dirty/save handled defensively.
 */
test.describe('Corporate Pricing — Pricing Strategy: management, deep coverage & New-Pricebook save-gating @corporate-pricing @strategy', () => {
  // Per-test baseline dispatched by TC number — each band keeps the baseline/timeout its
  // original describe had:
  //  - TC-001..025 (management): ensureDefaultState, default timeout.
  //  - TC-026..063 deep coverage (except the save-gating band): ensureDefaultState, 60s.
  //  - TC-030/031/050..052/058/059 (save-gating on the New Pricebook create flow, NO-COMMIT):
  //    a fresh, always-empty Equipment create page, 90s.
  const SAVE_GATING_TCS = [30, 31, 50, 51, 52, 58, 59];

  const tcNum = (title: string) => {
    const m = title.match(/^TC-CPR-STR-(\d+)/);
    return m ? parseInt(m[1]!, 10) : -1;
  };

  test.beforeEach(async ({ corporatePricingStrategyPage: p, corporatePricingNewPricebookPage: np }, testInfo) => {
    const n = tcNum(testInfo.title);
    if (SAVE_GATING_TCS.includes(n)) {
      test.setTimeout(90_000);
      await np.open('equipment');
      return;
    }
    if (n >= 26) test.setTimeout(60_000);
    // Per-test baseline: guarantees persisted state = 1 strategy named "2022-NP Tier 1",
    // and lands on the (default) Pricing Strategy tab with that strategy selected.
    await p.ensureDefaultState();
  });

  test('TC-CPR-STR-001: Pricebook Details management page loads with the pricebook header', async ({ corporatePricingStrategyPage: p }) => {
    await test.step('Confirm the Corporate Pricing Details heading is visible', async () => {
      await expect(p.page.getByRole('heading', { name: 'Corporate Pricing Details' })).toBeVisible();
    });
    expect(await p.getHeaderField('name')).toBe(STRATEGY.header.name);
  });

  test('TC-CPR-STR-002: Header shows the Price Book Name', async ({ corporatePricingStrategyPage: p }) => {
    expect(await p.getHeaderField('name')).toBe(STRATEGY.header.name);
  });

  test('TC-CPR-STR-003: Header shows the Price Book Type (Labor/Equipment)', async ({ corporatePricingStrategyPage: p }) => {
    expect(await p.getHeaderField('type')).toBe(STRATEGY.header.type);
  });

  test('TC-CPR-STR-004: Header shows the Price Year', async ({ corporatePricingStrategyPage: p }) => {
    expect(await p.getHeaderField('year')).toBe(STRATEGY.header.year);
  });

  test('TC-CPR-STR-005: Header shows the Currency', async ({ corporatePricingStrategyPage: p }) => {
    expect(await p.getHeaderField('currency')).toBe(STRATEGY.header.currency);
  });

  test('TC-CPR-STR-006: Header shows the Active status', async ({ corporatePricingStrategyPage: p }) => {
    expect(await p.getHeaderField('active')).toBe(STRATEGY.header.active);
  });

  test('TC-CPR-STR-007: Header fields are reference-only (not editable)', async ({ corporatePricingStrategyPage: p }) => {
    expect(await p.headerFieldsAreReadOnly()).toBe(true);
  });

  test('TC-CPR-STR-008: Tabs render — Pricing Strategy + Pricing Detail', async ({ corporatePricingStrategyPage: p }) => {
    const tabs = await p.getTabs();
    expect(tabs).toContain('Pricing Strategy');
    expect(tabs).toContain('Pricing Detail');
  });

  test('TC-CPR-STR-009: Pricing Strategy tab is selected by default on load', async ({ corporatePricingStrategyPage: p }) => {
    expect(await p.isStrategyTabActive(), 'Pricing Strategy tab is active by default').toBe(true);
  });

  test('TC-CPR-STR-010: Pricing Detail tab is present and activates', async ({ corporatePricingStrategyPage: p }) => {
    expect(await p.getTabs()).toContain('Pricing Detail');
    await p.clickDetailTab();
    // Strategy pane should no longer be the active content once Detail is selected.
    expect(await p.isStrategyTabActive()).toBe(false);
  });

  test('TC-CPR-STR-011: History tab is absent on the live site', async ({ corporatePricingStrategyPage: p }) => {
    // The requirements specify a 3rd "History" tab; live shows only 2. Divergence raised as a
    // clarification; behavior gated to a future History coverage pass.
    expect(await p.hasHistoryTab()).toBe(false);
  });

  test('TC-CPR-STR-012: Clicking an existing strategy loads its details', async ({ corporatePricingStrategyPage: p }) => {
    await p.selectStrategy(STRATEGY.fixtureStrategyName);
    expect(await p.getStrategyName()).toBe(STRATEGY.fixtureStrategyName);
    // Flag checkboxes render (editor populated).
    const isProductions = await p.getFlag('Is Productions');
    expect(typeof isProductions.checked).toBe('boolean');
  });

  test('TC-CPR-STR-013: Setting a location\'s Primary Pricing surfaces that office in the strategy grid', async ({ corporatePricingStrategyPage: strategyPage, locationPricingPage }) => {
    // Cross-surface integration (location save-cycle + strategy reload) — give it room.
    test.setTimeout(120_000);
    // The strategy's "Locations Using Pricing As Default" grid is a read-only back-reference: an
    // office appears here ONLY after it selects this strategy as its Primary Pricing on the
    // Location -> Pricing tab. Asserting "any listed rows have the right shape" passes VACUOUSLY
    // when the grid is empty (the loop never runs) — which is the live state whenever no office
    // currently points at the strategy. So this test SEEDS the relationship it asserts: it points
    // office 1604's Primary Equipment Pricing at a known strategy, proves that office surfaces in
    // the strategy's grid, then restores the office's original selection (net-zero, so a re-run and
    // any later test start from the same state).
    const { office, strategyName, pricebookGuid } = STRATEGY.crossSurfaceSeed;
    const equipmentDropdown = 'drpPrimaryEquipmentPricingUSD';

    await locationPricingPage.navigateToPricingTab(office);
    const original = (await locationPricingPage.getDropdownValue(equipmentDropdown)).trim();
    let changed = false;
    try {
      // Seed: make this office use `strategyName` as its Primary Equipment Pricing. Only save when a
      // real change is needed (selecting the already-selected value is a toggle-safe no-op).
      if (original !== strategyName) {
        await locationPricingPage.selectPrimaryDropdownOption(equipmentDropdown, strategyName);
        await locationPricingPage.saveAndConfirm();
        changed = true;
        // Confirm the seed landed before asserting on the strategy surface — a select/save that
        // silently no-ops would otherwise surface as a confusing "office missing from grid" failure.
        expect((await locationPricingPage.getDropdownValue(equipmentDropdown)).trim()).toBe(strategyName);
      }

      // Verify on the strategy surface: the seeded office MUST now appear in the strategy's grid.
      await strategyPage.open(pricebookGuid, office);
      await strategyPage.selectStrategy(strategyName);
      expect(await strategyPage.hasLocationsTable()).toBe(true);
      const locations = await strategyPage.getStrategyLocations();
      // NON-VACUOUS: the grid cannot be empty — the office we pointed at this strategy is required.
      expect(locations.length).toBeGreaterThan(0);
      expect(locations.some((l) => l.office === office)).toBe(true);
      // Now that the loop is guaranteed to run, the per-row shape assertion is meaningful.
      for (const loc of locations) {
        expect(loc.office).toMatch(/^\d+$/);
        expect(loc.name.length).toBeGreaterThan(0);
      }
    } finally {
      // Restore the location's original Primary Equipment Pricing so the test is net-zero.
      if (changed) {
        await locationPricingPage.navigateToPricingTab(office);
        if (original === '' || original === '--Select--' || original === 'Select') {
          await locationPricingPage.clearPrimaryDropdown(equipmentDropdown);
        } else {
          await locationPricingPage.selectPrimaryDropdownOption(equipmentDropdown, original);
        }
        await locationPricingPage.saveAndConfirm();
      }
    }
  });

  test('TC-CPR-STR-014: Edit an existing strategy and Save persists the change', async ({ corporatePricingStrategyPage: p }) => {
    test.setTimeout(60_000); // live save-cycle: 2 saves + 2 reloads
    await p.selectFirstStrategy();
    await p.setStrategyName(STRATEGY.reversibleEdit.editedName);
    expect(await p.isSaveEnabled()).toBe(true);
    await p.saveAndConfirm();
    await p.open();
    await p.selectFirstStrategy();
    expect(await p.getStrategyName(), 'Edited strategy name persists after reload').toBe(STRATEGY.reversibleEdit.editedName);
    await p.setStrategyName(STRATEGY.reversibleEdit.restoredName);
    await p.saveAndConfirm();
    await p.open();
    await p.selectFirstStrategy();
    expect(await p.getStrategyName()).toBe(STRATEGY.reversibleEdit.restoredName);
  });

  test('TC-CPR-STR-015: Add New opens the New Pricing Strategy dialog and appends a row', async ({ corporatePricingStrategyPage: p }) => {
    const before = await p.getStrategyTotal();
    await p.openAddStrategyDialog();
    expect(await p.isAddDialogOpen()).toBe(true);
    await p.fillDialogName(STRATEGY.newStrategyPayload.name);
    await p.clickDialogAdd();
    expect(await p.isAddDialogOpen()).toBe(false);
    expect(await p.getStrategyTotal()).toBe(before + 1);
    await p.removeStrategy(STRATEGY.newStrategyPayload.name);
    expect(await p.getStrategyTotal()).toBe(before);
  });

  test('TC-CPR-STR-016: Newly added strategy shows a Remove button', async ({ corporatePricingStrategyPage: p }) => {
    await p.addStrategy(STRATEGY.newStrategyPayload.name);
    expect(await p.isRemoveVisible(STRATEGY.newStrategyPayload.name)).toBe(true);
    await p.removeStrategy(STRATEGY.newStrategyPayload.name);
  });

  test('TC-CPR-STR-017: Legacy strategies do not show a Remove button', async ({ corporatePricingStrategyPage: p }) => {
    expect(await p.isRemoveVisible(STRATEGY.fixtureStrategyName)).toBe(false);
  });

  test('TC-CPR-STR-018: Remove on a new strategy deletes it before commit', async ({ corporatePricingStrategyPage: p }) => {
    const before = await p.getStrategyTotal();
    await p.addStrategy(STRATEGY.newStrategyPayload.name);
    expect(await p.getStrategyTotal()).toBe(before + 1);
    expect(await p.isSaveEnabled()).toBe(true); // dirty
    await p.removeStrategy(STRATEGY.newStrategyPayload.name);
    expect(await p.getStrategyTotal()).toBe(before); // removed immediately, no reload
    expect(await p.isSaveEnabled()).toBe(false); // back to clean
  });

  test('TC-CPR-STR-019: Legacy strategies cannot be removed from the management view', async ({ corporatePricingStrategyPage: p }) => {
    expect(await p.isRemoveVisible(STRATEGY.fixtureStrategyName)).toBe(false);
  });

  test('TC-CPR-STR-020: Unmodified strategy list shows the clean state (Save disabled)', async ({ corporatePricingStrategyPage: p }) => {
    expect(await p.isSaveEnabled()).toBe(false);
  });

  test('TC-CPR-STR-021: Editing a strategy changes the state to dirty (Save enabled)', async ({ corporatePricingStrategyPage: p }) => {
    expect(await p.isSaveEnabled()).toBe(false);
    await p.selectFirstStrategy();
    await p.setStrategyName(STRATEGY.reversibleEdit.editedName);
    expect(await p.isSaveEnabled()).toBe(true);
    // discard without saving — reload restores the unsaved edit
    await p.open();
    expect(await p.getStrategyName()).not.toBe(STRATEGY.reversibleEdit.editedName);
  });

  test('TC-CPR-STR-022: Adding a new strategy changes the state to dirty (Save enabled)', async ({ corporatePricingStrategyPage: p }) => {
    expect(await p.isSaveEnabled()).toBe(false);
    await p.addStrategy(STRATEGY.newStrategyPayload.name);
    expect(await p.isSaveEnabled()).toBe(true);
    await p.removeStrategy(STRATEGY.newStrategyPayload.name);
  });

  test('TC-CPR-STR-023: Save commits pending strategy edits in one batch', async ({ corporatePricingStrategyPage: p }) => {
    test.setTimeout(60_000); // live save-cycle
    // NOTE: a saved NEW strategy is not UI-removable, so the batch-commit is exercised via a
    // reversible existing-strategy edit; full new-strategy persistence is deferred to a follow-up
    // coverage pass with a disposable fixture.
    await p.selectFirstStrategy();
    await p.setStrategyName(STRATEGY.reversibleEdit.editedName);
    expect(await p.isSaveEnabled()).toBe(true);
    await p.saveAndConfirm();
    await p.open();
    await p.selectFirstStrategy();
    expect(await p.getStrategyName()).toBe(STRATEGY.reversibleEdit.editedName);
    expect(await p.isSaveEnabled()).toBe(false); // batch committed → clean
    await p.setStrategyName(STRATEGY.reversibleEdit.restoredName);
    await p.saveAndConfirm();
  });

  test('TC-CPR-STR-024: Save provides confirmation feedback', async ({ corporatePricingStrategyPage: p }) => {
    test.setTimeout(60_000); // live save-cycle
    await p.selectFirstStrategy();
    await p.setStrategyName(STRATEGY.reversibleEdit.editedName);
    // Confirmation feedback = the "Pricebook saved successfully" toast surfaces AND/OR the Save
    // button resets to disabled, acknowledging the commit. The toast auto-dismisses quickly (faster
    // than a poll can reliably catch under load), so accept either user-visible signal — what this
    // guards against is a silent no-op where the save produces NO feedback at all.
    const { toastSeen } = await p.saveAndConfirm();
    const saveAcknowledged = !(await p.isSaveEnabled());
    // At least one user-visible confirmation signal must appear (guards against a silent no-op save).
    if (!toastSeen && !saveAcknowledged) {
      expect(saveAcknowledged, 'expected a success toast OR the Save button to reset after commit').toBe(true);
    }
    await p.open();
    await p.selectFirstStrategy();
    await p.setStrategyName(STRATEGY.reversibleEdit.restoredName);
    await p.saveAndConfirm();
  });

  test('TC-CPR-STR-025: Save resets the state from dirty to clean after success', async ({ corporatePricingStrategyPage: p }) => {
    test.setTimeout(60_000); // live save-cycle
    await p.selectFirstStrategy();
    await p.setStrategyName(STRATEGY.reversibleEdit.editedName);
    expect(await p.isSaveEnabled()).toBe(true); // dirty
    await p.saveAndConfirm();
    // After a successful save the form is clean → the Save button returns to "Save" and disables.
    await test.step('Confirm the Save button returns to disabled after commit', async () => {
      await expect(p.page.locator('button:text-is("Save")').first()).toBeDisabled({ timeout: 10_000 });
    });
    // restore (reload first to clear the toast → avoid a back-to-back save race)
    await p.open();
    await p.selectFirstStrategy();
    await p.setStrategyName(STRATEGY.reversibleEdit.restoredName);
    await p.saveAndConfirm();
  });

  // ── Deep coverage ──
  // Mutation safety: new-strategy add/remove + multi-row tests run IN-SESSION only — a page reload
  // (the per-test `ensureDefaultState()` baseline) discards them, because a committed new strategy is
  // irreversible (a saved strategy becomes legacy with no Remove). Save-cycle tests use the only
  // UI-reversible save: editing the EXISTING strategy's name then restoring it.
  test('TC-CPR-STR-026: Add multiple strategies in one session (N=2)', async ({ corporatePricingStrategyPage: p }) => {
    expect(await p.getStrategyTotal()).toBe(1);
    await p.addStrategy(STRATEGY.deep.alpha);
    expect(await p.getStrategyTotal()).toBe(2);
    expect(await p.hasStrategy(STRATEGY.deep.alpha)).toBe(true);
    await p.addStrategy(STRATEGY.deep.bravo);
    expect(await p.getStrategyTotal()).toBe(3);
    expect(await p.hasStrategy(STRATEGY.deep.bravo)).toBe(true);
    expect(await p.isSaveEnabled()).toBe(true); // dirty; never saved — reload discards
  });

  test('TC-CPR-STR-027: Add multiple strategies in one session (N=3, edge)', async ({ corporatePricingStrategyPage: p }) => {
    await p.addStrategy(STRATEGY.deep.alpha);
    await p.addStrategy(STRATEGY.deep.bravo);
    await p.addStrategy(STRATEGY.deep.charlie);
    expect(await p.getStrategyTotal()).toBe(4);
    expect(await p.hasStrategy(STRATEGY.deep.charlie)).toBe(true);
    expect(await p.isSaveEnabled()).toBe(true);
  });

  test('TC-CPR-STR-028: Edit each row name independently in a multi-row session', async ({ corporatePricingStrategyPage: p }) => {
    await p.addStrategy(STRATEGY.deep.alpha);
    await p.addStrategy(STRATEGY.deep.bravo);
    await p.selectStrategy(STRATEGY.deep.alpha);
    await p.setStrategyName(STRATEGY.deep.charlie); // rename alpha -> charlie
    expect(await p.getStrategyName()).toBe(STRATEGY.deep.charlie);
    await p.selectStrategy(STRATEGY.deep.bravo);
    expect(await p.getStrategyName()).toBe(STRATEGY.deep.bravo); // independent of alpha's edit
  });

  test('TC-CPR-STR-029: Remove each new strategy in sequence', async ({ corporatePricingStrategyPage: p }) => {
    await p.addStrategy(STRATEGY.deep.alpha);
    await p.addStrategy(STRATEGY.deep.bravo);
    await p.addStrategy(STRATEGY.deep.charlie);
    expect(await p.getStrategyTotal()).toBe(4);
    await p.removeStrategy(STRATEGY.deep.alpha);
    expect(await p.getStrategyTotal()).toBe(3);
    await p.removeStrategy(STRATEGY.deep.bravo);
    expect(await p.getStrategyTotal()).toBe(2);
    await p.removeStrategy(STRATEGY.deep.charlie);
    expect(await p.getStrategyTotal()).toBe(1);
    expect(await p.isSaveEnabled()).toBe(false); // back to the clean legacy-only baseline
  });

  test('TC-CPR-STR-030: Removing the last strategy on a new pricebook leaves 0 strategies (delete-all)', async ({ corporatePricingNewPricebookPage: np }) => {
    await np.setName(NEW_PRICEBOOK.validName);
    await np.setYear(NEW_PRICEBOOK.validYear);
    await np.addStrategy();
    expect(await np.isSaveEnabled()).toBe(true);
    await np.removeStrategy();
    expect(await np.hasNoStrategiesYet()).toBe(true);
    expect(await np.isSaveEnabled()).toBe(false);
  });

  test('TC-CPR-STR-031: Re-adding a strategy after delete-all re-enables Save', async ({ corporatePricingNewPricebookPage: np }) => {
    await np.setName(NEW_PRICEBOOK.validName);
    await np.setYear(NEW_PRICEBOOK.validYear);
    await np.addStrategy();
    await np.removeStrategy();
    expect(await np.isSaveEnabled()).toBe(false);
    await np.addStrategy();
    expect(await np.isSaveEnabled()).toBe(true);
  });

  test('TC-CPR-STR-032: Reverting the strategy name disables Save', async ({ corporatePricingStrategyPage: p }) => {
    await p.selectFirstStrategy();
    await p.setStrategyName(STRATEGY.reversibleEdit.editedName);
    expect(await p.isSaveEnabled()).toBe(true);
    await p.setStrategyName(STRATEGY.fixtureStrategyName); // revert to the saved value
    expect(await p.isSaveEnabled()).toBe(false);
  });

  test('TC-CPR-STR-033: Reverting a flag toggle disables Save', async ({ corporatePricingStrategyPage: p }) => {
    await p.selectFirstStrategy();
    expect(await p.isSaveEnabled()).toBe(false);
    await p.setEditorFlag('Is Active', false);
    expect(await p.isSaveEnabled()).toBe(true);
    await p.setEditorFlag('Is Active', true);
    expect(await p.isSaveEnabled()).toBe(false);
  });

  test('TC-CPR-STR-034: Partial revert keeps Save enabled until all changes revert', async ({ corporatePricingStrategyPage: p }) => {
    await p.selectFirstStrategy();
    await p.setStrategyName(STRATEGY.reversibleEdit.editedName);
    await p.setEditorFlag('Is Active', false);
    expect(await p.isSaveEnabled()).toBe(true);
    await p.setStrategyName(STRATEGY.fixtureStrategyName); // revert only the name
    expect(await p.isSaveEnabled()).toBe(true); // still dirty on the flag
    await p.setEditorFlag('Is Active', true); // revert the flag
    expect(await p.isSaveEnabled()).toBe(false);
  });

  test('TC-CPR-STR-035: Dialog Is Active defaults checked', async ({ corporatePricingStrategyPage: p }) => {
    await p.openAddStrategyDialog();
    expect((await p.getDialogFlag('Is Active')).checked).toBe(true);
    await p.cancelAddDialog();
  });

  test('TC-CPR-STR-036: Dialog Is GSO defaults unchecked', async ({ corporatePricingStrategyPage: p }) => {
    await p.openAddStrategyDialog();
    expect((await p.getDialogFlag('Is GSO')).checked).toBe(false);
    await p.cancelAddDialog();
  });

  test('TC-CPR-STR-037: Dialog Is Internal defaults unchecked', async ({ corporatePricingStrategyPage: p }) => {
    await p.openAddStrategyDialog();
    expect((await p.getDialogFlag('Is Internal')).checked).toBe(false);
    await p.cancelAddDialog();
  });

  test('TC-CPR-STR-038: Dialog Is Productions defaults unchecked', async ({ corporatePricingStrategyPage: p }) => {
    await p.openAddStrategyDialog();
    expect((await p.getDialogFlag('Is Productions')).checked).toBe(false);
    await p.cancelAddDialog();
  });

  test('TC-CPR-STR-039: Dialog Is Active (off) carries to the new in-session strategy', async ({ corporatePricingStrategyPage: p }) => {
    await p.addStrategyWithFlags(STRATEGY.deep.inactiveFlag, { 'Is Active': false });
    await p.selectStrategy(STRATEGY.deep.inactiveFlag);
    expect((await p.getFlag('Is Active')).checked).toBe(false);
  });

  test('TC-CPR-STR-040: Dialog Is GSO carries to the new strategy', async ({ corporatePricingStrategyPage: p }) => {
    await p.addStrategyWithFlags(STRATEGY.deep.gsoFlag, { 'Is GSO': true });
    await p.selectStrategy(STRATEGY.deep.gsoFlag);
    expect((await p.getFlag('Is GSO')).checked).toBe(true);
  });

  test('TC-CPR-STR-041: Dialog Is Internal carries to the new strategy', async ({ corporatePricingStrategyPage: p }) => {
    await p.addStrategyWithFlags(STRATEGY.deep.internalFlag, { 'Is Internal': true });
    await p.selectStrategy(STRATEGY.deep.internalFlag);
    expect((await p.getFlag('Is Internal')).checked).toBe(true);
  });

  test('TC-CPR-STR-042: Dialog Is Productions carries + disables Is Internal/Is GSO', async ({ corporatePricingStrategyPage: p }) => {
    await p.openAddStrategyDialog();
    await p.setDialogFlag('Is Productions', true);
    expect((await p.getDialogFlag('Is Internal')).disabled).toBe(true);
    expect((await p.getDialogFlag('Is GSO')).disabled).toBe(true);
    await p.fillDialogName(STRATEGY.deep.productionsFlag);
    await p.clickDialogAdd();
    await p.selectStrategy(STRATEGY.deep.productionsFlag);
    expect((await p.getFlag('Is Productions')).checked).toBe(true);
  });

  test('TC-CPR-STR-043: Is Productions disables Is Internal and Is GSO (editor + dialog)', async ({ corporatePricingStrategyPage: p }) => {
    // Editor: the fixture strategy has Is Productions checked → the other two are disabled.
    await p.selectStrategy(STRATEGY.fixtureStrategyName);
    expect((await p.getFlag('Is Productions')).checked).toBe(true);
    expect((await p.getFlag('Is Internal')).disabled).toBe(true);
    expect((await p.getFlag('Is GSO')).disabled).toBe(true);
    // Dialog: checking Is Productions disables the same two.
    await p.openAddStrategyDialog();
    await p.setDialogFlag('Is Productions', true);
    expect((await p.getDialogFlag('Is Internal')).disabled).toBe(true);
    expect((await p.getDialogFlag('Is GSO')).disabled).toBe(true);
    await p.cancelAddDialog();
  });

  test('TC-CPR-STR-044: Type and Currency are read-only reference fields after create', async ({ corporatePricingStrategyPage: p }) => {
    expect(await p.headerFieldsAreReadOnly()).toBe(true);
    expect(await p.getHeaderField('type')).toBe(STRATEGY.header.type);
    expect(await p.getHeaderField('currency')).toBe(STRATEGY.header.currency);
  });

  test('TC-CPR-STR-045: Empty Strategy Name blocks Add', async ({ corporatePricingStrategyPage: p }) => {
    await p.openAddStrategyDialog();
    expect(await p.isDialogAddEnabled()).toBe(false);
    await p.cancelAddDialog();
  });

  test('TC-CPR-STR-046: Whitespace-only name blocks Add', async ({ corporatePricingStrategyPage: p }) => {
    await p.openAddStrategyDialog();
    await p.fillDialogName('   ');
    expect(await p.isDialogAddEnabled()).toBe(false);
    await p.cancelAddDialog();
  });

  test('TC-CPR-STR-047: Duplicate strategy name is blocked with an inline error', async ({ corporatePricingStrategyPage: p }) => {
    await p.openAddStrategyDialog();
    await p.fillDialogName(STRATEGY.deep.duplicateName);
    await p.clickDialogAddExpectingRejection();
    expect(await p.getDialogError()).toContain(STRATEGY.deep.duplicateError);
    expect(await p.isAddDialogOpen()).toBe(true);
    expect(await p.getStrategyTotal()).toBe(1); // no row added
    await p.cancelAddDialog();
  });

  test('TC-CPR-STR-048: Cancel discards a pending strategy', async ({ corporatePricingStrategyPage: p }) => {
    await p.openAddStrategyDialog();
    await p.fillDialogName(STRATEGY.deep.alpha);
    await p.cancelAddDialog();
    expect(await p.hasStrategy(STRATEGY.deep.alpha)).toBe(false);
    expect(await p.getStrategyTotal()).toBe(1);
  });

  test('TC-CPR-STR-049: Close (X) discards a pending strategy', async ({ corporatePricingStrategyPage: p }) => {
    await p.openAddStrategyDialog();
    await p.fillDialogName(STRATEGY.deep.alpha);
    await p.closeAddDialog();
    expect(await p.hasStrategy(STRATEGY.deep.alpha)).toBe(false);
    expect(await p.getStrategyTotal()).toBe(1);
  });

  // ── Save-gating (New Pricebook create flow) ──
  // TC-CPR-STR-030, 031, 050, 051, 052, 058, 059. The create flow is NO-COMMIT — Save reachability is
  // asserted without ever persisting (a committed pricebook is irreversible). Each test starts from a
  // fresh, always-empty create page (per the dispatched beforeEach).
  test('TC-CPR-STR-050: New pricebook with 0 strategies has Save disabled', async ({ corporatePricingNewPricebookPage: np }) => {
    await np.setName(NEW_PRICEBOOK.validName);
    await np.setYear(NEW_PRICEBOOK.validYear);
    expect(await np.getStrategyTotal()).toBeLessThanOrEqual(0);
    expect(await np.isSaveEnabled()).toBe(false);
  });

  test('TC-CPR-STR-051: Adding one strategy enables Save on a new pricebook', async ({ corporatePricingNewPricebookPage: np }) => {
    await np.setName(NEW_PRICEBOOK.validName);
    await np.setYear(NEW_PRICEBOOK.validYear);
    expect(await np.isSaveEnabled()).toBe(false);
    await np.addStrategy();
    expect(await np.getStrategyTotal()).toBe(1);
    expect(await np.isSaveEnabled()).toBe(true);
  });

  test('TC-CPR-STR-052: Removing the last strategy re-disables Save on a new pricebook', async ({ corporatePricingNewPricebookPage: np }) => {
    await np.setName(NEW_PRICEBOOK.validName);
    await np.setYear(NEW_PRICEBOOK.validYear);
    await np.addStrategy();
    expect(await np.isSaveEnabled()).toBe(true);
    await np.removeStrategy();
    expect(await np.isSaveEnabled()).toBe(false);
  });

  test('TC-CPR-STR-053: Strategy Name field caps input at 100 characters', async ({ corporatePricingStrategyPage: p }) => {
    await p.openAddStrategyDialog();
    await p.fillDialogName(STRATEGY.deep.overLengthName);
    expect((await p.getDialogName()).length).toBe(STRATEGY.deep.nameMaxLength);
    await p.cancelAddDialog();
  });

  test('TC-CPR-STR-054: Special characters in the Strategy Name are accepted and preserved', async ({ corporatePricingStrategyPage: p }) => {
    await p.openAddStrategyDialog();
    await p.fillDialogName(STRATEGY.deep.specialName);
    expect(await p.getDialogName()).toBe(STRATEGY.deep.specialName);
    expect(await p.isDialogAddEnabled()).toBe(true);
    await p.cancelAddDialog();
  });

  test('TC-CPR-STR-055: A special-character name round-trips exactly across save and reload', async ({ corporatePricingStrategyPage: p }) => {
    await p.selectFirstStrategy();
    await p.setStrategyName(STRATEGY.deep.specialPersistName);
    expect(await p.isSaveEnabled()).toBe(true);
    await p.saveAndConfirm();
    await p.open();
    await p.selectFirstStrategy();
    expect(await p.getStrategyName()).toBe(STRATEGY.deep.specialPersistName);
    await p.setStrategyName(STRATEGY.fixtureStrategyName);
    await p.saveAndConfirm();
    await p.open();
    await p.selectFirstStrategy();
    expect(await p.getStrategyName()).toBe(STRATEGY.fixtureStrategyName);
  });

  test('TC-CPR-STR-056: A strategy flag reads correctly from its rendered checkbox', async ({ corporatePricingStrategyPage: p }) => {
    await p.selectStrategy(STRATEGY.fixtureStrategyName);
    expect((await p.getFlag('Is Active')).checked).toBe(true);
  });

  test('TC-CPR-STR-057: Every editor flag reads per its render format; the list has no boolean columns', async ({ corporatePricingStrategyPage: p }) => {
    await p.selectStrategy(STRATEGY.fixtureStrategyName);
    expect((await p.getFlag('Is Productions')).checked).toBe(true);
    expect((await p.getFlag('Is Active')).checked).toBe(true);
    expect((await p.getFlag('Is Internal')).disabled).toBe(true);
    expect((await p.getFlag('Is GSO')).disabled).toBe(true);
    // The strategy list (left pane) renders only name buttons — no boolean columns/checkboxes there.
    const listCheckboxes = await test.step('Count the sidebar checkboxes', async () =>
      p.page.getByRole('complementary').getByRole('checkbox').count());
    expect(listCheckboxes).toBe(0);
  });

  test('TC-CPR-STR-058: 0-strategy and 1-strategy states render correctly', async ({ corporatePricingNewPricebookPage: np }) => {
    await np.setName(NEW_PRICEBOOK.validName);
    await np.setYear(NEW_PRICEBOOK.validYear);
    expect(await np.hasNoStrategiesYet()).toBe(true); // 0-strategy empty state
    expect(await np.isSaveEnabled()).toBe(false);
    await np.addStrategy();
    expect(await np.getStrategyTotal()).toBe(1); // 1-row list renders
  });

  test('TC-CPR-STR-059: Strategy list renders at 0 / 1 / N strategies', async ({ corporatePricingNewPricebookPage: np }) => {
    await np.setName(NEW_PRICEBOOK.validName);
    await np.setYear(NEW_PRICEBOOK.validYear);
    expect(await np.hasNoStrategiesYet()).toBe(true); // 0
    await np.addStrategy(NEW_PRICEBOOK.strategyName);
    expect(await np.getStrategyTotal()).toBe(1); // 1
    await np.addStrategy(NEW_PRICEBOOK.secondStrategyName);
    expect(await np.getStrategyTotal()).toBe(2); // N
  });

  test('TC-CPR-STR-060: A saved strategy edit survives reload', async ({ corporatePricingStrategyPage: p }) => {
    await p.selectFirstStrategy();
    await p.setStrategyName(STRATEGY.reversibleEdit.editedName);
    await p.saveAndConfirm();
    await p.open();
    await p.selectFirstStrategy();
    expect(await p.getStrategyName(), 'Saved strategy edit survives page reload').toBe(STRATEGY.reversibleEdit.editedName);
    await p.setStrategyName(STRATEGY.reversibleEdit.restoredName);
    await p.saveAndConfirm();
  });

  test('TC-CPR-STR-061: Dirty survives sub-tab switch; nav-away prompts "Unsaved changes"', async ({ corporatePricingStrategyPage: p }) => {
    await p.selectFirstStrategy();
    await p.setStrategyName(STRATEGY.reversibleEdit.editedName);
    expect(await p.isSaveEnabled()).toBe(true);
    // Dirty state survives a sub-tab switch (silent — no prompt).
    await p.clickDetailTab();
    expect(await p.isSaveEnabled()).toBe(true);
    // Back to the Strategy tab, then a full navigation away raises the unsaved-changes prompt.
    await p.switchTab('Pricing Strategy');
    await p.clickBackBreadcrumb();
    expect(await p.isUnsavedChangesPromptVisible()).toBe(true);
    await p.resolveUnsavedChangesPrompt('Stay'); // remain on the page; reload (next baseline) discards the edit
  });

  test('TC-CPR-STR-062: The strategy search box filters the list', async ({ corporatePricingStrategyPage: p }) => {
    await p.searchStrategies('zzzz');
    expect(await p.getStrategyTotal()).toBe(0);
    expect(await p.hasStrategy(STRATEGY.fixtureStrategyName)).toBe(false);
    await p.searchStrategies('2022');
    expect(await p.hasStrategy(STRATEGY.fixtureStrategyName)).toBe(true);
    await p.searchStrategies(''); // clear
    expect(await p.getStrategyTotal()).toBe(1);
  });

  test('TC-CPR-STR-063: Search narrows to matching names among multiple strategies', async ({ corporatePricingStrategyPage: p }) => {
    await p.addStrategy(STRATEGY.deep.alpha);
    await p.addStrategy(STRATEGY.deep.bravo);
    expect(await p.getStrategyTotal()).toBe(3);
    await p.searchStrategies('Alpha');
    expect(await p.hasStrategy(STRATEGY.deep.alpha)).toBe(true);
    expect(await p.hasStrategy(STRATEGY.deep.bravo)).toBe(false);
    await p.searchStrategies(''); // clear restores the full in-session list
    expect(await p.getStrategyTotal()).toBe(3);
  });
});
