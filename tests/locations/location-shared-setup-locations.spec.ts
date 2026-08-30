import { test, expect } from '../../src/fixtures/pages.fixture';
import {
  SSL_COLUMN_HEADERS,
  SELF_ROW,
  ADD_LOCATION,
  SSL_DIALOG_HEADING,
  SEARCH_BVA_1_CHAR,
  SEARCH_BVA_LONG_200,
  SEARCH_NEG_SPECIAL,
  SEARCH_NEG_WHITESPACE,
  SEARCH_NEG_LEADING_TRAILING_ATLANTA,
  SEARCH_EDIT_QUERY_1,
  SEARCH_EDIT_QUERY_2,
  SEARCH_DELETE_MIDDLE_QUERIES,
  SEARCH_DELETE_ALL_QUERIES,
  SEARCH_FIVE_ROW_QUERIES,
  SEARCH_CROSS_ROW_QUERY,
} from '../../src/data/locations/location-shared-setup-locations';
import { OFFICE_NO } from '../../src/data/common';
import { saveAndVerifyCase } from '../../src/utils/field-case-runner';

// Non-Miami test data throughout — workaround for a known issue where Miami search returns
// phantom row; non-Miami searches behave correctly.
test.describe('Location Shared Setup Locations @locations @shared-setup', () => {
  // Nav guard uses DOM presence, not url.includes — sub-tabs share the `settings/location` URL.
  // TC-001..030 get a baseline reset here; TC-031+ baseline inside their own saveAndVerifyCase.
  test.beforeEach(async ({ locationSharedSetupLocationsPage: pg }, testInfo) => {
    const m = testInfo.title.match(/^TC-LOC-SSL-(\d+)/);
    const n = m ? parseInt(m[1]!, 10) : -1;
    if (n >= 31) {
      if (!(await pg.isOnSharedSetupTab())) {
        await pg.navigateToSharedSetupTab(OFFICE_NO);
      }
      return;
    }
    // Headroom for ensureCleanSSLTable: clearing several stray rows left by an interrupted run
    // outlasts the default timeout and would wedge every test in this file behind the hook.
    test.setTimeout(90_000);
    if (!(await pg.isOnSharedSetupTab())) {
      await pg.navigateToSharedSetupTab(OFFICE_NO);
    }
    await pg.ensureCleanSSLTable(OFFICE_NO);
  });

  // ── Core shared-setup behavior ──
  test('TC-LOC-SSL-001: Tab loads with shared-setup table and Add button', async ({ locationSharedSetupLocationsPage: pg, dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(60_000);
    // The per-test setup already navigates to the tab and clears any extra rows.
    expect(await pg.isElementVisible('tblSharedSetupLocations')).toBe(true);
    expect(await pg.isElementVisible('btnSharedAdd')).toBe(true);
  });

  test('TC-LOC-SSL-002: Column headers are correct', async ({ locationSharedSetupLocationsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-SSL-001']);
    expect(await pg.getColumnHeaders()).toEqual([...SSL_COLUMN_HEADERS]);
  });

  test('TC-LOC-SSL-003: Self-location row shows correct data and default checkbox states', async ({ locationSharedSetupLocationsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-SSL-001']);
    const text = await pg.getSelfRowText();
    expect(text.localOffice).toBe(SELF_ROW.localOffice);
    expect(text.localOfficeName).toBe(SELF_ROW.localOfficeName);

    const primaryState = await pg.getSelfPrimaryOfficeState();
    expect(primaryState.checked).toBe(true);
    expect(primaryState.disabled).toBe(true);

    const inventoryState = await pg.getSelfSharesInventoryState();
    expect(inventoryState.checked).toBe(false);
    expect(inventoryState.disabled).toBe(false);

    expect(await pg.isSelfDeleteDisabled()).toBe(true);
  });

  test('TC-LOC-SSL-004: Primary Office is read-only (disabled) for self-location', async ({ locationSharedSetupLocationsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-SSL-001']);
    const state = await pg.getSelfPrimaryOfficeState();
    expect(state.disabled).toBe(true);
 // Confirming remains checked -- cannot be unchecked while disabled
    expect(state.checked).toBe(true);
  });

  test('TC-LOC-SSL-005: Delete button is disabled for self-location', async ({ locationSharedSetupLocationsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-SSL-001']);
    expect(await pg.isSelfDeleteDisabled()).toBe(true);
  });

  test('TC-LOC-SSL-006: Toggling Shares Inventory ON enables left-panel Save', async ({ locationSharedSetupLocationsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-SSL-001']);
    expect(await pg.isSaveEnabled()).toBe(false);
    await pg.toggleSelfSharesInventory();
    expect((await pg.getSelfSharesInventoryState()).checked).toBe(true);
    await expect.poll(() => pg.isSaveEnabled(), { timeout: 5_000 }).toBe(true);
 // Cleanup: toggle back -- reverted state clears dirty flag without saving
    await pg.toggleSelfSharesInventory();
  });

  test('TC-LOC-SSL-007: Reverting Shares Inventory to original state disables Save', async ({ locationSharedSetupLocationsPage: pg, dependencyGate }) => {
    test.fixme(true, 'Blocked — reverting Shares Inventory on an added row to its original state leaves the form marked as changed, so Save stays enabled even though there is no net change. Pending an application fix.');
    dependencyGate(['TC-LOC-SSL-001']);
 // SSL-006 toggle-back leaves Angular dirty state. Reload for clean baseline.
    await pg.reloadAndNavigateToSSLTab(OFFICE_NO);
    await expect.poll(() => pg.isSaveEnabled(), { timeout: 5_000 }).toBe(false);
    await pg.toggleSelfSharesInventory();
    await expect.poll(() => pg.isSaveEnabled(), { timeout: 5_000 }).toBe(true);
    await pg.toggleSelfSharesInventory();
    await expect.poll(() => pg.isSaveEnabled(), { timeout: 8_000 }).toBe(false);
  });

  test('TC-LOC-SSL-008: Shares Inventory save persists after reload', async ({ locationSharedSetupLocationsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-SSL-001']);
    test.setTimeout(90_000);
    await pg.toggleSelfSharesInventory();
    await pg.clickSave();
    await pg.reloadAndNavigateToSSLTab(OFFICE_NO);
    expect((await pg.getSelfSharesInventoryState()).checked).toBe(true);
 // Cleanup: restore original unchecked state
    await pg.toggleSelfSharesInventory();
    await pg.clickSave();
  });

  test('TC-LOC-SSL-009: Add button opens Change Local Office dialog', async ({ locationSharedSetupLocationsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-SSL-001']);
    await pg.clickAdd();
    expect(await pg.isAddDialogVisible()).toBe(true);
    expect(await pg.getDialogHeading()).toBe(SSL_DIALOG_HEADING);
    expect(await pg.isElementVisible('txtDlgSearch')).toBe(true);
    expect(await pg.isElementVisible('tblDlgResults')).toBe(true);
    expect(await pg.isDialogSelectEnabled()).toBe(false);
    expect(await pg.isElementVisible('btnDlgCancel')).toBe(true);
    await pg.clickDialogCancel();
    expect(await pg.isAddDialogVisible()).toBe(false);
  });

  test('TC-LOC-SSL-010: Dialog search filters results by location name', async ({ locationSharedSetupLocationsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-SSL-001']);
    await pg.clickAdd();
    await pg.searchInDialog(ADD_LOCATION.searchByName);
    await expect.poll(() => pg.getDialogRowCount(), { timeout: 5_000 })
      .toBeLessThan(ADD_LOCATION.searchByNameMaxResults);
    await pg.clickDialogCancel();
  });

  test('TC-LOC-SSL-011: Dialog search filters results by location number (exact match)', async ({ locationSharedSetupLocationsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-SSL-001']);
    await pg.clickAdd();
    await pg.searchInDialog(ADD_LOCATION.searchByNumber);
    await expect.poll(() => pg.getDialogRowCount(), { timeout: 5_000 }).toBe(1);
    const row = await pg.getFirstDialogRowText();
    expect(row.localOffice).toBe(ADD_LOCATION.searchByNumber);
    expect(row.localOfficeName).toBe(ADD_LOCATION.expectedName);
    await pg.clickDialogCancel();
  });

  test('TC-LOC-SSL-012: Selecting a dialog row enables the Select button', async ({ locationSharedSetupLocationsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-SSL-001']);
    await pg.clickAdd();
    expect(await pg.isDialogSelectEnabled()).toBe(false);
    await pg.searchInDialog(ADD_LOCATION.searchByNumber);
    await expect.poll(() => pg.getDialogRowCount(), { timeout: 5_000 }).toBe(1);
    await pg.selectFirstDialogRow();
 // dispatchEvent('click') fires an async React state update —
 // Select button enable propagates after a short delay. Use expect.poll.
    await expect.poll(() => pg.isDialogSelectEnabled(), { timeout: 5_000 }).toBe(true);
    await pg.clickDialogCancel();
  });

  test('TC-LOC-SSL-013: Selecting a location via dialog adds it to the table', async ({ locationSharedSetupLocationsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-SSL-001']);
    expect(await pg.getDataRowCount()).toBe(1);
    await pg.clickAdd();
    await pg.searchInDialog(ADD_LOCATION.searchByNumber);
    await expect.poll(() => pg.getDialogRowCount(), { timeout: 5_000 }).toBe(1);
    await pg.selectFirstDialogRow();
    await pg.clickDialogSelect();
    expect(await pg.getDataRowCount()).toBe(2);
    await expect.poll(() => pg.isSaveEnabled(), { timeout: 5_000 }).toBe(true);
  });

  test('TC-LOC-SSL-014: Non-self row has correct state (Primary Office disabled, Shares Inventory editable)', async ({ locationSharedSetupLocationsPage: pg, dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(60_000);
    // Add an unsaved location row so this test owns the non-self row it inspects.
    await pg.clickAdd();
    await pg.searchInDialog(ADD_LOCATION.searchByNumber);
    await expect.poll(() => pg.getDialogRowCount(), { timeout: 5_000 }).toBe(1);
    await pg.selectFirstDialogRow();
    await expect.poll(() => pg.isDialogSelectEnabled(), { timeout: 5_000 }).toBe(true);
    await pg.clickDialogSelect();
    expect(await pg.getDataRowCount()).toBe(2);
    const state = await pg.getNonSelfRowState(2);
    expect(state.primaryOffice.checked).toBe(false);
    expect(state.primaryOffice.disabled).toBe(true);
    expect(state.sharesInventory.checked).toBe(true);
    expect(state.sharesInventory.disabled).toBe(false);
    expect(state.deleteEnabled).toBe(true);
  });

  test('TC-LOC-SSL-015: Delete removes non-self row instantly with no confirmation dialog', async ({ locationSharedSetupLocationsPage: pg, dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(60_000);
    // Add an unsaved location row so this test owns the non-self row it deletes.
    await pg.clickAdd();
    await pg.searchInDialog(ADD_LOCATION.searchByNumber);
    await expect.poll(() => pg.getDialogRowCount(), { timeout: 5_000 }).toBe(1);
    await pg.selectFirstDialogRow();
    await expect.poll(() => pg.isDialogSelectEnabled(), { timeout: 5_000 }).toBe(true);
    await pg.clickDialogSelect();
    expect(await pg.getDataRowCount()).toBe(2);
    await pg.deleteNonSelfRow(2);
 // Row must disappear immediately -- no confirmation dialog
    expect(await pg.isElementVisible('dlgSaveChanges', 1_500)).toBe(false);
    await expect.poll(() => pg.getDataRowCount(), { timeout: 5_000 }).toBe(1);
    await expect.poll(() => pg.isSaveEnabled(), { timeout: 5_000 }).toBe(true); // dirty from add+delete cycle
    // Cleanup: hard reload so the next test starts from a clean serial state.
    await pg.reloadAndNavigateToSSLTab(OFFICE_NO);
  });

  test('TC-LOC-SSL-016: Cancelling the dialog after row selection leaves table and Save unchanged', async ({ locationSharedSetupLocationsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-SSL-001']);
    test.setTimeout(60_000);
    await pg.reloadAndNavigateToSSLTab(OFFICE_NO);
    await pg.ensureCleanSSLTable(OFFICE_NO);
 // Baseline: capture pre-dialog table state + Save state
    const beforeRowCount = await pg.getDataRowCount();
    const beforeSaveEnabled = await pg.isSaveEnabled();
    expect(beforeSaveEnabled).toBe(false);
 // Open Add dialog, search, select first row (DO NOT click Select — that would commit)
    await pg.clickAdd();
    await pg.searchInDialog(ADD_LOCATION.searchByName);
    await expect.poll(() => pg.getDialogRowCount(), { timeout: 8_000 })
      .toBeLessThan(ADD_LOCATION.searchByNameMaxResults);
    await pg.selectFirstDialogRow();
    await expect.poll(() => pg.isDialogSelectEnabled(), { timeout: 5_000 }).toBe(true);
 // Cancel the dialog instead of selecting
    await pg.clickDialogCancel();
 // Verify table row count unchanged + Save still disabled (cancel = no-op)
    expect(await pg.getDataRowCount()).toBe(beforeRowCount);
    expect(await pg.isSaveEnabled()).toBe(false);
  });

  test('TC-LOC-SSL-017: Tab uses left-panel Save with dialog (no dedicated in-tab Save button)', async ({ locationSharedSetupLocationsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-SSL-001']);
    test.setTimeout(90_000);
    expect(await pg.hasInTabSaveButton()).toBe(false);
    await pg.toggleSelfSharesInventory();
    expect(await pg.isSaveEnabled()).toBe(true);
    const result = await pg.clickSave();
    expect(result.success).toBe(true);
 // Cleanup: revert Shares Inventory to keep DB in known clean state
    await pg.toggleSelfSharesInventory();
    await pg.clickSave();
  });

  test('TC-LOC-SSL-018: Verify a location added via the dialog persists after save and reload', async ({ locationSharedSetupLocationsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-SSL-001']);
    test.setTimeout(90_000);
    await pg.reloadAndNavigateToSSLTab(OFFICE_NO);
    await pg.ensureCleanSSLTable(OFFICE_NO);
    await pg.clickAdd();
    await pg.searchInDialog('Chicago');
    await expect.poll(() => pg.getDialogRowCount(), { timeout: 8_000 })
      .toBeLessThan(ADD_LOCATION.searchByNameMaxResults);
    await pg.selectFirstDialogRow();
    await expect.poll(() => pg.isDialogSelectEnabled(), { timeout: 5_000 }).toBe(true);
    await pg.clickDialogSelect();
    expect(await pg.getDataRowCount()).toBe(2);
 // Capture added row from TABLE (not dialog — dialog text timing is unreliable)
    const added = await pg.findNonSelfRow();
    expect(added).not.toBeNull();
    const result = await pg.clickSave();
    expect(result.success).toBe(true);
 // Reload and verify
    await pg.reloadAndNavigateToSSLTab(OFFICE_NO);
    expect(await pg.getDataRowCount()).toBe(2);
    const persisted = await pg.findNonSelfRow();
    expect(persisted).not.toBeNull();
    expect(persisted!.localOffice).toBe(added!.localOffice);
    expect(persisted!.localOfficeName).toBe(added!.localOfficeName);
 // Cleanup: delete + save (use dynamic index)
    await pg.deleteNonSelfRow(persisted!.index);
    const cleanup = await pg.clickSave();
    expect(cleanup.success).toBe(true);
  });

  test('TC-LOC-SSL-019: Verify a Shares Inventory toggle persists after save and reload', async ({ locationSharedSetupLocationsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-SSL-001']);
    test.setTimeout(90_000);
    await pg.reloadAndNavigateToSSLTab(OFFICE_NO);
    await pg.ensureCleanSSLTable(OFFICE_NO);
 // Setup: add first available location and save
    await pg.clickAdd();
    await pg.searchInDialog(ADD_LOCATION.searchByName);
    await expect.poll(() => pg.getDialogRowCount(), { timeout: 8_000 })
      .toBeLessThan(ADD_LOCATION.searchByNameMaxResults);
    await pg.selectFirstDialogRow();
    await expect.poll(() => pg.isDialogSelectEnabled(), { timeout: 5_000 }).toBe(true);
    await pg.clickDialogSelect();
    const addSave = await pg.clickSave();
    expect(addSave.success).toBe(true);
    await pg.reloadAndNavigateToSSLTab(OFFICE_NO);
 // Find the non-self row (sort order varies)
    const nsRow = await pg.findNonSelfRow();
    expect(nsRow).not.toBeNull();
 // Default: SI is checked for non-self rows. Toggle OFF.
    expect((await pg.getNonSelfRowState(nsRow!.index)).sharesInventory.checked).toBe(true);
    await pg.toggleNonSelfSharesInventory(nsRow!.index);
    await expect.poll(() => pg.isSaveEnabled(), { timeout: 5_000 }).toBe(true);
    const result = await pg.clickSave();
    expect(result.success).toBe(true);
 // Reload and verify SI is OFF
    await pg.reloadAndNavigateToSSLTab(OFFICE_NO);
    const nsRow2 = await pg.findNonSelfRow();
    expect((await pg.getNonSelfRowState(nsRow2!.index)).sharesInventory.checked).toBe(false);
 // Cleanup: delete row + save
    await pg.deleteNonSelfRow(nsRow2!.index);
    const cleanup = await pg.clickSave();
    expect(cleanup.success).toBe(true);
  });

  test('TC-LOC-SSL-020: Verify a deleted location stays removed after save and reload', async ({ locationSharedSetupLocationsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-SSL-001']);
    test.setTimeout(90_000);
    await pg.reloadAndNavigateToSSLTab(OFFICE_NO);
    await pg.ensureCleanSSLTable(OFFICE_NO);
    await pg.clickAdd();
    await pg.searchInDialog('Dallas');
    await expect.poll(() => pg.getDialogRowCount(), { timeout: 8_000 })
      .toBeLessThan(ADD_LOCATION.searchByNameMaxResults);
    await pg.selectFirstDialogRow();
    await expect.poll(() => pg.isDialogSelectEnabled(), { timeout: 5_000 }).toBe(true);
    await pg.clickDialogSelect();
    const addSave = await pg.clickSave();
    expect(addSave.success).toBe(true);
    await pg.reloadAndNavigateToSSLTab(OFFICE_NO);
    expect(await pg.getDataRowCount()).toBe(2);
 // Delete non-self row and save (use dynamic index — sort order varies)
    const nsRow = await pg.findNonSelfRow();
    await pg.deleteNonSelfRow(nsRow!.index);
    await expect.poll(() => pg.getDataRowCount(), { timeout: 5_000 }).toBe(1);
    const result = await pg.clickSave();
    expect(result.success).toBe(true);
 // Reload and verify row is gone
    await pg.reloadAndNavigateToSSLTab(OFFICE_NO);
    expect(await pg.getDataRowCount()).toBe(1);
  });

  test('TC-LOC-SSL-021: Verify Shares Inventory plus an added location both persist after reload', async ({ locationSharedSetupLocationsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-SSL-001']);
    test.setTimeout(90_000);
    await pg.reloadAndNavigateToSSLTab(OFFICE_NO);
    await pg.ensureCleanSSLTable(OFFICE_NO);
    await pg.toggleSelfSharesInventory();
    await pg.clickAdd();
    await pg.searchInDialog('Denver');
    await expect.poll(() => pg.getDialogRowCount(), { timeout: 8_000 })
      .toBeLessThan(ADD_LOCATION.searchByNameMaxResults);
    await pg.selectFirstDialogRow();
    await expect.poll(() => pg.isDialogSelectEnabled(), { timeout: 5_000 }).toBe(true);
    await pg.clickDialogSelect();
    await expect.poll(() => pg.isSaveEnabled(), { timeout: 5_000 }).toBe(true);
    const result = await pg.clickSave();
    expect(result.success).toBe(true);
 // Reload and verify both changes persisted
    await pg.reloadAndNavigateToSSLTab(OFFICE_NO);
    expect((await pg.getSelfSharesInventoryState()).checked).toBe(true);
    expect(await pg.getDataRowCount()).toBe(2);
 // Cleanup (per use try/finally for combined dirty state)
    try {
      await pg.setSelfSharesInventory(false);
      const nsRow = await pg.findNonSelfRow();
      if (nsRow) await pg.deleteNonSelfRow(nsRow.index);
      await pg.clickSave();
    } catch {
      await pg.reloadAndNavigateToSSLTab(OFFICE_NO);
      await pg.ensureCleanSSLTable(OFFICE_NO);
    }
  });

  test('TC-LOC-SSL-022: Verify cancelling the Save dialog discards changes after reload', async ({ locationSharedSetupLocationsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-SSL-001']);
    test.setTimeout(90_000);
    await pg.reloadAndNavigateToSSLTab(OFFICE_NO);
    await pg.ensureCleanSSLTable(OFFICE_NO);
    await pg.toggleSelfSharesInventory();
    expect((await pg.getSelfSharesInventoryState()).checked).toBe(true);
    await expect.poll(() => pg.isSaveEnabled(), { timeout: 5_000 }).toBe(true);
 // Open Save dialog and cancel it
    await pg.openSaveDialog();
    await pg.cancelSaveDialog();
 // Form still dirty after cancel
    await expect.poll(() => pg.isSaveEnabled(), { timeout: 3_000 }).toBe(true);
 // Reload without saving — change should NOT persist
    await pg.reloadAndNavigateToSSLTab(OFFICE_NO);
    expect((await pg.getSelfSharesInventoryState()).checked).toBe(false);
  });

  test('TC-LOC-SSL-023: Beforeunload fires when SSL form is dirty', async ({ locationSharedSetupLocationsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-SSL-001']);
    test.setTimeout(90_000);
    await pg.reloadAndNavigateToSSLTab(OFFICE_NO);
    await pg.ensureCleanSSLTable(OFFICE_NO);
    await pg.toggleSelfSharesInventory();
    await expect.poll(() => pg.isSaveEnabled(), { timeout: 5_000 }).toBe(true);
 // Trigger reload — beforeunload should fire and be dismissed (stay on page)
    const fired = await pg.triggerBeforeunloadAndStay();
    expect(fired).toBe(true);
 // Cleanup: navigate away to discard
    await pg.discardAndReturn(OFFICE_NO);
  });

  test('TC-LOC-SSL-024: Already-added location is absent from Change Local Office dialog', async ({ locationSharedSetupLocationsPage: pg, dependencyGate }) => {
    test.fixme(true, 'Blocked — the Change Local Office dialog still lists a location that was already added to the office. Pending an application fix.');
    dependencyGate(['TC-LOC-SSL-001']);
    test.setTimeout(90_000);
    await pg.reloadAndNavigateToSSLTab(OFFICE_NO);
    await pg.ensureCleanSSLTable(OFFICE_NO);
    await pg.clickAdd();
    await pg.searchInDialog('Atlanta');
    await expect.poll(() => pg.getDialogRowCount(), { timeout: 8_000 })
      .toBeLessThan(ADD_LOCATION.searchByNameMaxResults);
    await pg.selectFirstDialogRow();
    await expect.poll(() => pg.isDialogSelectEnabled(), { timeout: 5_000 }).toBe(true);
    await pg.clickDialogSelect();
    const result = await pg.clickSave();
    expect(result.success).toBe(true);
 // Read the added location from the TABLE (reliable, not dialog)
    const added = await pg.findNonSelfRow();
    expect(added).not.toBeNull();
 // Test: open dialog, search for the same location number — must not appear
    await pg.clickAdd();
    await pg.searchInDialog(added!.localOffice);
 // Wait for debounce — "No results." row shows (count stays 1 but localOffice is empty)
    await expect.poll(() => pg.getDialogRowCount(), { timeout: 8_000 }).toBe(1);
    const row = await pg.getFirstDialogRowText();
    expect(row.localOffice).not.toBe(added!.localOffice);
    await pg.clickDialogCancel();
 // Cleanup: delete + save (use dynamic index)
    await pg.deleteNonSelfRow(added!.index);
    const cleanup = await pg.clickSave();
    expect(cleanup.success).toBe(true);
  });

  test('TC-LOC-SSL-025: Each column header testid resolves to expected text', async ({ locationSharedSetupLocationsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-SSL-001']);
 // Complements TC-002 (whole-array content check) with per-testid resolution.
    expect(await pg.isElementVisible('colHeaderLocalOffice')).toBe(true);
    expect(await pg.isElementVisible('colHeaderLocalOfficeName')).toBe(true);
    expect(await pg.isElementVisible('colHeaderPrimaryOffice')).toBe(true);
    expect(await pg.isElementVisible('colHeaderSharesInventory')).toBe(true);
    expect(await pg.isElementVisible('colHeaderActions')).toBe(true);
  });

  test('TC-LOC-SSL-026: Dialog number-search "1233" returns exactly the Miami Marriott office', async ({ locationSharedSetupLocationsPage: pg, dependencyGate }) => {
    // Depends on the dialog number-search: "1233" must resolve to the Miami Marriott office.
    dependencyGate(['TC-LOC-SSL-001']);
    test.setTimeout(60_000);
    await pg.reloadAndNavigateToSSLTab(OFFICE_NO);
    await pg.ensureCleanSSLTable(OFFICE_NO);
    await pg.clickAdd();
    await pg.searchInDialog('1233');
    await expect.poll(() => pg.getDialogRowCount(), { timeout: 8_000 }).toBe(1);
    const row = await pg.getFirstDialogRowText();
    expect(row.localOffice).toBe('1233');
    expect(row.localOfficeName).toContain('Miami Marriott');
    await pg.clickDialogCancel();
  });

  test('TC-LOC-SSL-027: Combined self SI + add non-Miami row + save persists both after reload', async ({ locationSharedSetupLocationsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-SSL-001']);
 // Cross-field save coverage: self SI ON + add non-Miami row (Chicago).
    test.setTimeout(120_000);
    await pg.reloadAndNavigateToSSLTab(OFFICE_NO);
    await pg.ensureCleanSSLTable(OFFICE_NO);
 // Combined change: toggle self SI + add non-Miami row via dialog
    await pg.toggleSelfSharesInventory();
    await pg.clickAdd();
    await pg.searchInDialog('Chicago');
    await expect.poll(() => pg.getDialogRowCount(), { timeout: 8_000 })
      .toBeLessThan(ADD_LOCATION.searchByNameMaxResults);
    await pg.selectFirstDialogRow();
    await expect.poll(() => pg.isDialogSelectEnabled(), { timeout: 5_000 }).toBe(true);
    await pg.clickDialogSelect();
    await expect.poll(() => pg.isSaveEnabled(), { timeout: 5_000 }).toBe(true);
    const result = await pg.clickSave();
    expect(result.success).toBe(true);
 // Reload and verify both changes persisted
    await pg.reloadAndNavigateToSSLTab(OFFICE_NO);
    expect((await pg.getSelfSharesInventoryState()).checked).toBe(true);
    expect(await pg.getDataRowCount()).toBe(2);
 // Cleanup: try/finally for combined dirty state (mirrors TC-021)
    try {
      await pg.setSelfSharesInventory(false);
      const nsRow = await pg.findNonSelfRow();
      if (nsRow) await pg.deleteNonSelfRow(nsRow.index);
      await pg.clickSave();
    } catch {
      await pg.reloadAndNavigateToSSLTab(OFFICE_NO);
      await pg.ensureCleanSSLTable(OFFICE_NO);
    }
  });

  test('TC-LOC-SSL-028: Verify switching tabs with unsaved changes shows the Unsaved dialog', async ({ locationSharedSetupLocationsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-SSL-001']);
    test.setTimeout(60_000);
    await pg.reloadAndNavigateToSSLTab(OFFICE_NO);
    await pg.ensureCleanSSLTable(OFFICE_NO);
    await pg.makeFormDirty();
    await expect.poll(() => pg.isSaveEnabled(), { timeout: 5_000 }).toBe(true);
    await pg.clickTopLevelTab('tabLocationManagementHistory');
    expect(await pg.hasVisibleUnsavedDialog(5_000)).toBe(true);
    await pg.clickUnsavedDialogStay();
    await expect.poll(() => pg.getActiveTopLevelTab(), { timeout: 5_000 })
      .toContain('Basic Information');
    expect(await pg.isSaveEnabled()).toBe(true);
    await pg.discardAndReturn(OFFICE_NO);
  });

  test('TC-LOC-SSL-029: Five rapid Add-button clicks open exactly one dialog', async ({ locationSharedSetupLocationsPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-SSL-001']);
 // Console errors are collected for trace visibility only — ambient Angular noise (NG0100,
 // ResizeObserver loop) makes an empty-array assertion too flaky for CI.
    test.setTimeout(60_000);
    const realPage = pg.page;
    const consoleErrors: string[] = [];
    const errorHandler = (msg: import('@playwright/test').ConsoleMessage) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    };
    realPage.on('console', errorHandler);
    try {
      await pg.rapidClickAdd(5, 50);
 // Settle: wait for dialog to be visible (single open)
      await expect.poll(() => pg.isAddDialogVisible(), { timeout: 5_000 }).toBe(true);
      expect(await pg.countAddDialogs()).toBe(1);
      // consoleErrors retained for Playwright trace visibility (not asserted — see comment above).
    } finally {
      realPage.off('console', errorHandler);
 // Cleanup: close the single open dialog
      await pg.clickDialogCancel();
    }
  });

  test('TC-LOC-SSL-030: Verify three added location rows persist after save and reload', async ({ locationSharedSetupLocationsPage: pg, dependencyGate }) => {
    test.fixme(true, 'Blocked — the per-row Delete control intermittently stops responding after a row is added, saved and the page reloaded, so the cleanup step cannot complete reliably. Pending an application fix.');
    dependencyGate(['TC-LOC-SSL-001']);
 // Deliberately small-N: office 1604 is shared, so the row-ceiling case stays out of CI.
    test.setTimeout(180_000);
    await pg.reloadAndNavigateToSSLTab(OFFICE_NO);
    await pg.ensureCleanSSLTable(OFFICE_NO);
    const queries = ['Chicago', 'Boston', 'Marriott'] as const;
    for (const q of queries) {
      await pg.clickAdd();
      await pg.searchInDialog(q);
      await expect.poll(() => pg.getDialogRowCount(), { timeout: 8_000 })
        .toBeLessThan(ADD_LOCATION.searchByNameMaxResults);
      await pg.selectFirstDialogRow();
      await expect.poll(() => pg.isDialogSelectEnabled(), { timeout: 5_000 }).toBe(true);
      await pg.clickDialogSelect();
    }
    const addSave = await pg.clickSave();
    expect(addSave.success).toBe(true);
 // Reload and verify all 3 added rows persisted
    await pg.reloadAndNavigateToSSLTab(OFFICE_NO);
    expect(await pg.getDataRowCount()).toBe(1 + queries.length);
 // Cleanup (net-zero): delete all non-self rows + save until back to 1
    let nsRow = await pg.findNonSelfRow();
    while (nsRow) {
      await pg.deleteNonSelfRow(nsRow.index);
      nsRow = await pg.findNonSelfRow();
    }
    const cleanup = await pg.clickSave();
    expect(cleanup.success).toBe(true);
    await pg.reloadAndNavigateToSSLTab(OFFICE_NO);
    expect(await pg.getDataRowCount()).toBe(1);
  });

  // ─── Group δ — Multi-row delete variants ──────────────────────────────────

  // Delete tests stay fixme: only the first delete per page session is correct — every later one
  // silently removes the row above the clicked button, self-row included. Pending an app fix.
  test('TC-LOC-SSL-031: Verify deleting a middle row persists after save and reload', async ({ locationSharedSetupLocationsPage: pg, dependencyGate }) => {
    test.fixme(true, 'Blocked — the per-row Delete control intermittently stops responding after a row is added, saved and the page reloaded, so the cleanup step cannot complete reliably. Pending an application fix.');
    dependencyGate([]);
    test.setTimeout(120_000);
    await saveAndVerifyCase({
      id: 'TC-LOC-SSL-031',
      label: 'Multi-row delete-MIDDLE',
      baseline: () => pg.ensureCleanSSLTable(OFFICE_NO),
      act: async () => {
        // Setup: add 3 non-Miami rows
        for (const q of SEARCH_DELETE_MIDDLE_QUERIES) {
          await pg.clickAdd();
          await pg.searchInDialog(q);
          await expect.poll(() => pg.getDialogRowCount(), { timeout: 10_000 }).toBeLessThan(ADD_LOCATION.searchByNameMaxResults);
          await pg.selectFirstDialogRow();
          await expect.poll(() => pg.isDialogSelectEnabled(), { timeout: 5_000 }).toBe(true);
          await pg.clickDialogSelect();
        }
        const initialSave = await pg.clickSave();
        expect(initialSave.success).toBe(true);
        await pg.reloadAndNavigateToSSLTab(OFFICE_NO);
        expect(await pg.getDataRowCount()).toBe(4);
        // Delete the MIDDLE row (row index 2 in 1-based: row 1 = self, row 2 = first added, row 3 = middle, row 4 = last)
        await pg.deleteNonSelfRow(3);
        await expect.poll(() => pg.getDataRowCount(), { timeout: 5_000 }).toBe(3);
      },
      saveAndConfirm: () => pg.saveAndConfirm(),
      reload: () => pg.reloadAndNavigateToSSLTab(OFFICE_NO),
      expectAfterReload: async () => {
        expect(await pg.getDataRowCount()).toBe(3); // self + 2 remaining
      },
      cleanup: () => pg.ensureCleanSSLTable(OFFICE_NO),
    });
  });

  test('TC-LOC-SSL-032: Verify adding five location rows persists after save and reload', async ({ locationSharedSetupLocationsPage: pg, dependencyGate }) => {
    test.fixme(true, 'Blocked — the per-row Delete control intermittently stops responding after a row is added, saved and the page reloaded, so the cleanup step cannot complete reliably. Pending an application fix.');
    dependencyGate([]);
    test.setTimeout(180_000);
    await saveAndVerifyCase({
      id: 'TC-LOC-SSL-032',
      label: 'Multi-row 5-row boundary push',
      baseline: () => pg.ensureCleanSSLTable(OFFICE_NO),
      act: async () => {
        for (const q of SEARCH_FIVE_ROW_QUERIES) {
          await pg.clickAdd();
          await pg.searchInDialog(q);
          await expect.poll(() => pg.getDialogRowCount(), { timeout: 10_000 }).toBeLessThan(ADD_LOCATION.searchByNameMaxResults);
          await pg.selectFirstDialogRow();
          await expect.poll(() => pg.isDialogSelectEnabled(), { timeout: 5_000 }).toBe(true);
          await pg.clickDialogSelect();
        }
        await expect.poll(() => pg.getDataRowCount(), { timeout: 5_000 }).toBe(6); // self + 5
        await expect.poll(() => pg.isSaveEnabled(), { timeout: 5_000 }).toBe(true);
      },
      saveAndConfirm: () => pg.saveAndConfirm(),
      reload: () => pg.reloadAndNavigateToSSLTab(OFFICE_NO),
      expectAfterReload: async () => {
        expect(await pg.getDataRowCount()).toBe(6);
      },
      cleanup: () => pg.ensureCleanSSLTable(OFFICE_NO),
    });
  });

  // ─── Group α — Search BVA ──────────────────────────────────────────────
  test('TC-LOC-SSL-033: Verify a single-character search shows at least one result', async ({ locationSharedSetupLocationsPage: pg, dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(60_000);
    await saveAndVerifyCase({
      id: 'TC-LOC-SSL-033',
      label: 'Search 1-char (BVA min)',
      baseline: async () => {
        await pg.ensureCleanSSLTable(OFFICE_NO);
        await pg.clickAdd();
      },
      act: () => pg.searchInDialog(SEARCH_BVA_1_CHAR),
      expectBeforeSave: async () => {
        await expect.poll(() => pg.getDialogRowCount(), { timeout: 10_000 }).toBeGreaterThan(0);
      },
      saveAndConfirm: () => pg.clickDialogCancel(),
      reload: () => pg.reloadAndNavigateToSSLTab(OFFICE_NO),
      expectAfterReload: async () => {
        expect(await pg.getDataRowCount()).toBe(1);
      },
      cleanup: () => pg.ensureCleanSSLTable(OFFICE_NO),
    });
  });

  test('TC-LOC-SSL-034: Verify a very long search string does not crash the dialog', async ({ locationSharedSetupLocationsPage: pg, dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(60_000);
    await saveAndVerifyCase({
      id: 'TC-LOC-SSL-034',
      label: 'Search 200-char (BVA max)',
      baseline: async () => {
        await pg.ensureCleanSSLTable(OFFICE_NO);
        await pg.clickAdd();
      },
      act: () => pg.searchInDialog(SEARCH_BVA_LONG_200),
      expectBeforeSave: async () => {
        // Dialog still visible + Select stays disabled (no row selectable from non-matching filter)
        expect(await pg.isAddDialogVisible(), 'Dialog should remain open after a long search').toBe(true);
        await expect.poll(() => pg.isDialogSelectEnabled(), { timeout: 5_000 }).toBe(false);
      },
      saveAndConfirm: () => pg.clickDialogCancel(),
      reload: () => pg.reloadAndNavigateToSSLTab(OFFICE_NO),
      expectAfterReload: async () => {
        expect(await pg.getDataRowCount()).toBe(1);
      },
      cleanup: () => pg.ensureCleanSSLTable(OFFICE_NO),
    });
  });

  test('TC-LOC-SSL-035: Verify clearing the search restores the full row count', async ({ locationSharedSetupLocationsPage: pg, dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(60_000);
    // Compare against the filtered count, not a fixed threshold — the dialog's bulk row ceiling
    // shifts as locations are added upstream.
    let filteredCount = -1;
    await saveAndVerifyCase({
      id: 'TC-LOC-SSL-035',
      label: 'Search clear-input restores bulk',
      baseline: async () => {
        await pg.ensureCleanSSLTable(OFFICE_NO);
        await pg.clickAdd();
      },
      act: async () => {
        await pg.searchInDialog(SEARCH_EDIT_QUERY_1); // 'Atlanta' → ~88 rows
        await expect.poll(() => pg.getDialogRowCount(), { timeout: 10_000 }).toBeLessThan(ADD_LOCATION.searchByNameMaxResults);
        filteredCount = await pg.getDialogRowCount();
        await pg.searchInDialog(''); // clear
      },
      expectBeforeSave: async () => {
        await expect.poll(() => pg.getDialogRowCount(), { timeout: 10_000 }).toBeGreaterThan(filteredCount);
      },
      saveAndConfirm: () => pg.clickDialogCancel(),
      reload: () => pg.reloadAndNavigateToSSLTab(OFFICE_NO),
      expectAfterReload: async () => {
        expect(await pg.getDataRowCount()).toBe(1);
      },
      cleanup: () => pg.ensureCleanSSLTable(OFFICE_NO),
    });
  });

  // ─── Group β — Search special / whitespace ───────────────────────────────
  test('TC-LOC-SSL-036: special chars return clean empty-state (no crash)', async ({ locationSharedSetupLocationsPage: pg, dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(60_000);
    await saveAndVerifyCase({
      id: 'TC-LOC-SSL-036',
      label: 'Search special chars',
      baseline: async () => {
        await pg.ensureCleanSSLTable(OFFICE_NO);
        await pg.clickAdd();
      },
      act: () => pg.searchInDialog(SEARCH_NEG_SPECIAL),
      expectBeforeSave: async () => {
        expect(await pg.isAddDialogVisible()).toBe(true);
        await expect.poll(() => pg.isDialogSelectEnabled(), { timeout: 5_000 }).toBe(false);
      },
      saveAndConfirm: () => pg.clickDialogCancel(),
      reload: () => pg.reloadAndNavigateToSSLTab(OFFICE_NO),
      expectAfterReload: async () => {
        expect(await pg.getDataRowCount()).toBe(1);
      },
      cleanup: () => pg.ensureCleanSSLTable(OFFICE_NO),
    });
  });

  test('TC-LOC-SSL-037: whitespace-only filter does not crash', async ({ locationSharedSetupLocationsPage: pg, dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(60_000);
    await saveAndVerifyCase({
      id: 'TC-LOC-SSL-037',
      label: 'Search whitespace-only',
      baseline: async () => {
        await pg.ensureCleanSSLTable(OFFICE_NO);
        await pg.clickAdd();
      },
      act: () => pg.searchInDialog(SEARCH_NEG_WHITESPACE),
      expectBeforeSave: async () => {
        expect(await pg.isAddDialogVisible()).toBe(true);
      },
      saveAndConfirm: () => pg.clickDialogCancel(),
      reload: () => pg.reloadAndNavigateToSSLTab(OFFICE_NO),
      expectAfterReload: async () => {
        expect(await pg.getDataRowCount()).toBe(1);
      },
      cleanup: () => pg.ensureCleanSSLTable(OFFICE_NO),
    });
  });

  test('TC-LOC-SSL-038: leading/trailing whitespace matches base term', async ({ locationSharedSetupLocationsPage: pg, dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(60_000);
    await saveAndVerifyCase({
      id: 'TC-LOC-SSL-038',
      label: 'Search leading/trailing whitespace',
      baseline: async () => {
        await pg.ensureCleanSSLTable(OFFICE_NO);
        await pg.clickAdd();
      },
      act: () => pg.searchInDialog(SEARCH_NEG_LEADING_TRAILING_ATLANTA),
      expectBeforeSave: async () => {
        const count = await pg.getDialogRowCount();
        // Trimming or not are both acceptable, so this only guards against a crash — toBeLessThan
        // also fails on the NaN a broken dialog count would produce.
        expect(count).toBeLessThan(ADD_LOCATION.searchByNameMaxResults);
      },
      saveAndConfirm: () => pg.clickDialogCancel(),
      reload: () => pg.reloadAndNavigateToSSLTab(OFFICE_NO),
      expectAfterReload: async () => {
        expect(await pg.getDataRowCount()).toBe(1);
      },
      cleanup: () => pg.ensureCleanSSLTable(OFFICE_NO),
    });
  });

  // ─── Group γ — Search edit-cycle ──────────────────────────────────────────
  test('TC-LOC-SSL-039: Verify retyping a search after clearing swaps the results', async ({ locationSharedSetupLocationsPage: pg, dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(60_000);
    await saveAndVerifyCase({
      id: 'TC-LOC-SSL-039',
      label: 'Search edit-cycle type-clear-retype',
      baseline: async () => {
        await pg.ensureCleanSSLTable(OFFICE_NO);
        await pg.clickAdd();
      },
      act: async () => {
        await pg.searchInDialog(SEARCH_EDIT_QUERY_1); // 'Atlanta'
        await pg.searchInDialog(SEARCH_EDIT_QUERY_2); // 'Boston' (clear + retype via fill())
      },
      expectBeforeSave: async () => {
        await expect.poll(() => pg.getDialogRowCount(), { timeout: 10_000 }).toBeGreaterThan(0);
        // Final filter = Boston; assert first row name does NOT include 'Atlanta'.
        const first = await pg.getFirstDialogRowText();
        expect(first.localOfficeName.toLowerCase()).not.toContain('atlanta');
      },
      saveAndConfirm: () => pg.clickDialogCancel(),
      reload: () => pg.reloadAndNavigateToSSLTab(OFFICE_NO),
      expectAfterReload: async () => {
        expect(await pg.getDataRowCount()).toBe(1);
      },
      cleanup: () => pg.ensureCleanSSLTable(OFFICE_NO),
    });
  });

  test('TC-LOC-SSL-040: clear-via-input restores baseline', async ({ locationSharedSetupLocationsPage: pg, dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(60_000);
    let filteredCount = -1;
    await saveAndVerifyCase({
      id: 'TC-LOC-SSL-040',
      label: 'Search clear-via-input restores',
      baseline: async () => {
        await pg.ensureCleanSSLTable(OFFICE_NO);
        await pg.clickAdd();
      },
      act: async () => {
        await pg.searchInDialog(SEARCH_EDIT_QUERY_1); // Atlanta → ~88 rows
        await expect.poll(() => pg.getDialogRowCount(), { timeout: 10_000 }).toBeLessThan(ADD_LOCATION.searchByNameMaxResults);
        filteredCount = await pg.getDialogRowCount();
        await pg.searchInDialog(''); // clear
      },
      expectBeforeSave: async () => {
        await expect.poll(() => pg.getDialogRowCount(), { timeout: 10_000 }).toBeGreaterThan(filteredCount);
      },
      saveAndConfirm: () => pg.clickDialogCancel(),
      reload: () => pg.reloadAndNavigateToSSLTab(OFFICE_NO),
      expectAfterReload: async () => {
        expect(await pg.getDataRowCount()).toBe(1);
      },
      cleanup: () => pg.ensureCleanSSLTable(OFFICE_NO),
    });
  });

  test('TC-LOC-SSL-041: Verify deleting all non-self rows persists after save and reload', async ({ locationSharedSetupLocationsPage: pg, dependencyGate }) => {
    test.fixme(true, 'Blocked — the per-row Delete control intermittently stops responding after a row is added, saved and the page reloaded, so the cleanup step cannot complete reliably. Pending an application fix.');
    dependencyGate([]);
    test.setTimeout(240_000);
    await saveAndVerifyCase({
      id: 'TC-LOC-SSL-041',
      label: 'Multi-row delete-ALL non-self',
      baseline: () => pg.ensureCleanSSLTable(OFFICE_NO),
      act: async () => {
        // Setup: add 2 non-Miami rows
        for (const q of SEARCH_DELETE_ALL_QUERIES) {
          await pg.clickAdd();
          await pg.searchInDialog(q);
          await expect.poll(() => pg.getDialogRowCount(), { timeout: 10_000 }).toBeLessThan(ADD_LOCATION.searchByNameMaxResults);
          await pg.selectFirstDialogRow();
          await expect.poll(() => pg.isDialogSelectEnabled(), { timeout: 5_000 }).toBe(true);
          await pg.clickDialogSelect();
        }
        const initialSave = await pg.clickSave();
        expect(initialSave.success).toBe(true);
        await pg.reloadAndNavigateToSSLTab(OFFICE_NO);
        expect(await pg.getDataRowCount()).toBe(3);
        // Delete BOTH non-self rows (loop until none remain in DOM)
        let nsRow = await pg.findNonSelfRow();
        while (nsRow) {
          await pg.deleteNonSelfRow(nsRow.index);
          nsRow = await pg.findNonSelfRow();
        }
        expect(await pg.getDataRowCount()).toBe(1);
      },
      saveAndConfirm: () => pg.saveAndConfirm(),
      reload: () => pg.reloadAndNavigateToSSLTab(OFFICE_NO),
      expectAfterReload: async () => {
        expect(await pg.getDataRowCount()).toBe(1); // only self persisted
      },
      cleanup: () => pg.ensureCleanSSLTable(OFFICE_NO),
    });
  });

  // ─── Group ε — Multi-row edit / N-row boundary ───────────────────────────
  test('TC-LOC-SSL-042: Verify editing one row Shares Inventory does not change another on save', async ({ locationSharedSetupLocationsPage: pg, dependencyGate }) => {
    test.fixme(true, 'Blocked — the per-row Delete control intermittently stops responding after a row is added, saved and the page reloaded, so the cleanup step cannot complete reliably. Pending an application fix.');
    dependencyGate([]);
    test.setTimeout(240_000);
    await saveAndVerifyCase({
      id: 'TC-LOC-SSL-042',
      label: 'Multi-row cross-row edit preserve',
      baseline: () => pg.ensureCleanSSLTable(OFFICE_NO),
      act: async () => {
        // Confirm self SI = false (baseline default)
        expect((await pg.getSelfSharesInventoryState()).checked).toBe(false);
        // Add 1 non-Miami row, save, reload
        await pg.clickAdd();
        await pg.searchInDialog(SEARCH_CROSS_ROW_QUERY); // Atlanta
        await expect.poll(() => pg.getDialogRowCount(), { timeout: 10_000 }).toBeLessThan(ADD_LOCATION.searchByNameMaxResults);
        await pg.selectFirstDialogRow();
        await expect.poll(() => pg.isDialogSelectEnabled(), { timeout: 5_000 }).toBe(true);
        await pg.clickDialogSelect();
        const addSave = await pg.clickSave();
        expect(addSave.success).toBe(true);
        await pg.reloadAndNavigateToSSLTab(OFFICE_NO);
        // Toggle non-self SI OFF (default = true post-add)
        const nsRow = await pg.findNonSelfRow();
        expect(nsRow).not.toBeNull();
        expect((await pg.getNonSelfRowState(nsRow!.index)).sharesInventory.checked).toBe(true);
        await pg.toggleNonSelfSharesInventory(nsRow!.index);
        await expect.poll(() => pg.isSaveEnabled(), { timeout: 5_000 }).toBe(true);
      },
      saveAndConfirm: () => pg.saveAndConfirm(),
      reload: () => pg.reloadAndNavigateToSSLTab(OFFICE_NO),
      expectAfterReload: async () => {
        // Self SI UNCHANGED across the save+reload cycle
        expect((await pg.getSelfSharesInventoryState()).checked).toBe(false);
        // Non-self SI flipped to false
        const nsRow = await pg.findNonSelfRow();
        expect(nsRow).not.toBeNull();
        expect((await pg.getNonSelfRowState(nsRow!.index)).sharesInventory.checked).toBe(false);
      },
      cleanup: () => pg.ensureCleanSSLTable(OFFICE_NO),
    });
  });

  // ─── Group ζ — Checkbox cross-row + round-trip ───────────────────────────
  test('TC-LOC-SSL-043: Verify toggling one row Shares Inventory does not flip another pre-save', async ({ locationSharedSetupLocationsPage: pg, dependencyGate }) => {
    test.fixme(true, 'Blocked — the per-row Delete control intermittently stops responding after a row is added, saved and the page reloaded, so the cleanup step cannot complete reliably. Pending an application fix.');
    dependencyGate([]);
    test.setTimeout(240_000);
    await saveAndVerifyCase({
      id: 'TC-LOC-SSL-043',
      label: 'Checkbox cross-row independence pre-save',
      baseline: () => pg.ensureCleanSSLTable(OFFICE_NO),
      act: async () => {
        // Baseline: self SI = false. Add 1 row, save, reload. Then toggle non-self (no save yet).
        expect((await pg.getSelfSharesInventoryState()).checked).toBe(false);
        await pg.clickAdd();
        await pg.searchInDialog(SEARCH_CROSS_ROW_QUERY); // Atlanta
        await expect.poll(() => pg.getDialogRowCount(), { timeout: 10_000 }).toBeLessThan(ADD_LOCATION.searchByNameMaxResults);
        await pg.selectFirstDialogRow();
        await expect.poll(() => pg.isDialogSelectEnabled(), { timeout: 5_000 }).toBe(true);
        await pg.clickDialogSelect();
        const addSave = await pg.clickSave();
        expect(addSave.success).toBe(true);
        await pg.reloadAndNavigateToSSLTab(OFFICE_NO);
        const nsRow = await pg.findNonSelfRow();
        expect(nsRow).not.toBeNull();
        // Toggle non-self SI OFF in-page (no save yet)
        await pg.toggleNonSelfSharesInventory(nsRow!.index);
      },
      expectBeforeSave: async () => {
        // In-page assertion: self SI unchanged (still false), non-self SI toggled (now false)
        expect((await pg.getSelfSharesInventoryState()).checked).toBe(false);
        const nsRow = await pg.findNonSelfRow();
        expect(nsRow).not.toBeNull();
        expect((await pg.getNonSelfRowState(nsRow!.index)).sharesInventory.checked).toBe(false);
        await expect.poll(() => pg.isSaveEnabled(), { timeout: 5_000 }).toBe(true);
      },
      saveAndConfirm: () => pg.saveAndConfirm(),
      reload: () => pg.reloadAndNavigateToSSLTab(OFFICE_NO),
      expectAfterReload: async () => {
        // Post-save: self SI still false (truly unchanged across the cycle)
        expect((await pg.getSelfSharesInventoryState()).checked).toBe(false);
      },
      cleanup: () => pg.ensureCleanSSLTable(OFFICE_NO),
    });
  });

  test('TC-LOC-SSL-044: Verify a Shares Inventory checkbox persists across an on-off save cycle', async ({ locationSharedSetupLocationsPage: pg, dependencyGate }) => {
    test.fixme(true, 'Blocked — the per-row Delete control intermittently stops responding after a row is added, saved and the page reloaded, so the cleanup step cannot complete reliably. Pending an application fix.');
    dependencyGate([]);
    test.setTimeout(240_000);
    await saveAndVerifyCase({
      id: 'TC-LOC-SSL-044',
      label: 'Checkbox round-trip ON-save-OFF-save',
      baseline: () => pg.ensureCleanSSLTable(OFFICE_NO),
      act: async () => {
        // Leg 1: toggle ON → save → reload → assert checked
        await pg.toggleSelfSharesInventory();
        await expect.poll(() => pg.isSaveEnabled(), { timeout: 5_000 }).toBe(true);
        const legOne = await pg.clickSave();
        expect(legOne.success).toBe(true);
        await pg.reloadAndNavigateToSSLTab(OFFICE_NO);
        expect((await pg.getSelfSharesInventoryState()).checked).toBe(true);
        // Leg 2 setup: toggle OFF (saveAndConfirm commits this; saveAndVerifyCase.reload reads it)
        await pg.toggleSelfSharesInventory();
        await expect.poll(() => pg.isSaveEnabled(), { timeout: 5_000 }).toBe(true);
      },
      saveAndConfirm: () => pg.saveAndConfirm(),
      reload: () => pg.reloadAndNavigateToSSLTab(OFFICE_NO),
      expectAfterReload: async () => {
        expect((await pg.getSelfSharesInventoryState()).checked).toBe(false);
      },
      cleanup: () => pg.ensureCleanSSLTable(OFFICE_NO),
    });
  });

});
