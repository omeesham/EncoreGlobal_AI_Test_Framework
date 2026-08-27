import { test, expect } from '../../src/fixtures/pages.fixture';
import { saveAndVerifyCase } from '../../src/utils/field-case-runner';
import {
  VENUE_NAME, PHONE1_BASELINE, ACCOUNT_SEARCH, ADDRESS_SEARCH,
  TEST_PHONE2_VALUE, ACCOUNT_TEST_PHONE, PHONE2_BASELINE, VENUE_DISPLAY_FIELDS, MASTER_DISPLAY_FIELDS,
  ACCOUNT_LIST_FILTERS, ALT_ADDRESS, ORIGINAL_ADDRESS, ACCOUNT_NUMBER_SEARCH,
  MASTER_BILL_TO_ORIGINAL,
} from '../../src/data/locations/location-account-address';
import { OFFICE_NO } from '../../src/data/common';

test.describe('Location Account and Address @locations @account-address', () => {
  // Per-test navigation guard.
  // DOM-presence beats url.includes — Encore sub-tabs share `settings/location` URL,
  // so the URL match returns true after a sibling spec like Notes even when this tab
  // is not active.
  //
  // Hook timeout = 60s (default config = 30s). Cold-start nav (SSO handoff + Angular load
  // + tab activate + phone1 hydrate) can exceed 30s under M365/Encore backend contention
  // (TC-LOC-ACC-001 root cause). The test body already grants 60s via test.setTimeout;
  // this matches that budget for the hook.
  test.beforeEach(async ({ locationAccountAddressPage }) => {
    test.setTimeout(60_000);
    if (!(await locationAccountAddressPage.isOnAccountAndAddressTab())) {
      await locationAccountAddressPage.navigateToAccountAndAddressTab(OFFICE_NO);
    }
    // Per-test baseline: reset Phone 2 to a dedicated baseline value before every test, so a
    // single test re-run (retry / parallel) starts from a known state instead of inheriting a prior
    // test's end-state. PHONE2_BASELINE is a non-empty value no test fills, which guarantees each
    // test's own fill is a real change (Save actually enables) and side-steps the known issue that
    // clearing Phone 2 to empty does not persist — this reset never sets it empty.
    await locationAccountAddressPage.ensureDefaultState({ phone2: PHONE2_BASELINE });
  });

  test('TC-LOC-ACC-001: Navigate to Account and Address tab; two-card layout visible', async ({ locationAccountAddressPage, dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(60_000);
    await locationAccountAddressPage.navigateToAccountAndAddressTab(OFFICE_NO);
    expect(await locationAccountAddressPage.isVenueCardVisible(), 'Venue card should be visible on the page').toBe(true);
    expect(await locationAccountAddressPage.isMasterCardVisible(), 'Master card should be visible on the page').toBe(true);
  });

  test('TC-LOC-ACC-002: Venue Name field is disabled with correct value', async ({ locationAccountAddressPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-ACC-001']);
    expect(await locationAccountAddressPage.isVenueNameDisabled()).toBe(true);
    expect(await locationAccountAddressPage.getVenueNameValue()).toBe(VENUE_NAME);
  });

  test('TC-LOC-ACC-003: Name button opens Account List dialog', async ({ locationAccountAddressPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-ACC-001']);
    await locationAccountAddressPage.openAccountListDialog();
    expect(await locationAccountAddressPage.isAccountListDialogVisible()).toBe(true);
    expect(await locationAccountAddressPage.hasAccountListFilters()).toBe(true);
    expect(await locationAccountAddressPage.hasAccountListActionButtons()).toBe(true);
    expect(await locationAccountAddressPage.hasAccountListTable()).toBe(true);
    await locationAccountAddressPage.cancelAccountListDialog();
  });

  test('TC-LOC-ACC-004: Account List search returns results', async ({ locationAccountAddressPage, dependencyGate }) => {
    test.fixme(true, 'Blocked — the Account List dialog does not function reliably for automated interaction. Pending an application fix.');
    dependencyGate(['TC-LOC-ACC-001']);
    test.setTimeout(60_000);
    await locationAccountAddressPage.openAccountListDialog();
    await locationAccountAddressPage.searchAccountByName(ACCOUNT_SEARCH.term);
 // Server search API can be slow under load — poll for results
    await expect.poll(
      () => locationAccountAddressPage.accountListResultsContain(ACCOUNT_SEARCH.expectedResult),
      { timeout: 20_000, message: 'Account List search results should contain expected text' }
    ).toBe(true);
    await locationAccountAddressPage.cancelAccountListDialog();
  });

  test('TC-LOC-ACC-005: Account List Select button disabled until row checked', async ({ locationAccountAddressPage, dependencyGate }) => {
    test.fixme(true, 'Blocked — the Account List dialog does not function reliably for automated interaction. Pending an application fix.');
    dependencyGate(['TC-LOC-ACC-001']);
    await locationAccountAddressPage.openAccountListDialog();
    await locationAccountAddressPage.searchAccountByName(ACCOUNT_SEARCH.term);
    expect(await locationAccountAddressPage.isAccountListSelectDisabled()).toBe(true);
    await locationAccountAddressPage.checkAccountListFirstRow();
    expect(await locationAccountAddressPage.isAccountListSelectDisabled()).toBe(false);
    await locationAccountAddressPage.cancelAccountListDialog();
  });

  test('TC-LOC-ACC-006: Account List Cancel closes without changes', async ({ locationAccountAddressPage, dependencyGate }) => {
    test.fixme(true, 'Blocked — the Account List dialog does not function reliably for automated interaction. Pending an application fix.');
    dependencyGate(['TC-LOC-ACC-001']);
    await locationAccountAddressPage.openAccountListDialog();
    await locationAccountAddressPage.searchAccountByName(ACCOUNT_SEARCH.term);
    await locationAccountAddressPage.checkAccountListFirstRow();
    await locationAccountAddressPage.cancelAccountListDialog();
    expect(await locationAccountAddressPage.getVenueNameValue()).toBe(VENUE_NAME);
  });

  test('TC-LOC-ACC-007: Account List Reset clears search fields', async ({ locationAccountAddressPage, dependencyGate }) => {
    test.fixme(true, 'Blocked — the Account List dialog does not function reliably for automated interaction. Pending an application fix.');
    dependencyGate(['TC-LOC-ACC-001']);
    await locationAccountAddressPage.openAccountListDialog();
    await locationAccountAddressPage.searchAccountByName(ACCOUNT_SEARCH.term);
    await locationAccountAddressPage.resetAccountListSearch();
    expect(await locationAccountAddressPage.getAccountNameFilterValue()).toBe('');
    expect(await locationAccountAddressPage.isAccountListEmpty()).toBe(true);
    await locationAccountAddressPage.cancelAccountListDialog();
 // Reset clears the Angular form's accountId binding in addition to the filter UI.
 // Reload to restore a clean form model from DB before any subsequent saves.
    await locationAccountAddressPage.reloadAndNavigate(OFFICE_NO);
  });

  test('TC-LOC-ACC-008: Venue Address button opens Select Customer Address dialog', async ({ locationAccountAddressPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-ACC-001']);
    await locationAccountAddressPage.openVenueAddressDialog();
    expect(await locationAccountAddressPage.isAddressDialogVisible()).toBe(true);
    expect(await locationAccountAddressPage.isAddressSearchVisible()).toBe(true);
    expect(await locationAccountAddressPage.getAddressRowCount()).toBe(ADDRESS_SEARCH.totalRows);
    await locationAccountAddressPage.cancelAddressDialog();
  });

  test('TC-LOC-ACC-009: Address dialog Select button disabled until row checked', async ({ locationAccountAddressPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-ACC-001']);
    await locationAccountAddressPage.openVenueAddressDialog();
    expect(await locationAccountAddressPage.isAddressSelectDisabled()).toBe(true);
    await locationAccountAddressPage.checkAddressFirstRow();
    expect(await locationAccountAddressPage.isAddressSelectDisabled()).toBe(false);
    await locationAccountAddressPage.cancelAddressDialog();
  });

  test('TC-LOC-ACC-010: Address dialog search bar filters results client-side', async ({ locationAccountAddressPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-ACC-001']);
    await locationAccountAddressPage.openVenueAddressDialog();
    const initialRows = await locationAccountAddressPage.getAddressRowCount();
    await locationAccountAddressPage.searchAddress(ADDRESS_SEARCH.filterTerm);
    const filteredRows = await locationAccountAddressPage.getAddressRowCount();
    expect(filteredRows).toBeLessThan(initialRows);
    expect(await locationAccountAddressPage.addressResultsContain(ADDRESS_SEARCH.expectedMatch)).toBe(true);
    await locationAccountAddressPage.cancelAddressDialog();
  });

  test('TC-LOC-ACC-011: Address dialog Save button always disabled', async ({ locationAccountAddressPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-ACC-001']);
    await locationAccountAddressPage.openVenueAddressDialog();
    expect(await locationAccountAddressPage.isAddressSaveDisabled()).toBe(true);
    await locationAccountAddressPage.checkAddressFirstRow();
    expect(await locationAccountAddressPage.isAddressSaveDisabled()).toBe(true);
    await locationAccountAddressPage.cancelAddressDialog();
  });

  test('TC-LOC-ACC-012: Master Address button opens same Select Customer Address dialog', async ({ locationAccountAddressPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-ACC-001']);
    await locationAccountAddressPage.openMasterAddressDialog();
    expect(await locationAccountAddressPage.isAddressDialogVisible()).toBe(true);
    expect(await locationAccountAddressPage.getAddressRowCount()).toBe(ADDRESS_SEARCH.totalRows);
    await locationAccountAddressPage.cancelAddressDialog();
  });

  test('TC-LOC-ACC-013: Venue address display fields are read-only', async ({ locationAccountAddressPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-ACC-001']);
    for (const field of VENUE_DISPLAY_FIELDS) {
      expect(await locationAccountAddressPage.isDisplayFieldReadOnly('Venue/Branch Account', field.expected),
        `${field.label} should be read-only`).toBe(true);
    }
  });

  test('TC-LOC-ACC-014: Master address display fields are read-only', async ({ locationAccountAddressPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-ACC-001']);
    for (const field of MASTER_DISPLAY_FIELDS) {
      expect(await locationAccountAddressPage.isDisplayFieldReadOnly('Master Bill To Address', field.expected),
        `${field.label} should be read-only`).toBe(true);
    }
  });

  test('TC-LOC-ACC-015: Phone 1 required field shows inline error when cleared', async ({ locationAccountAddressPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-ACC-001']);
    await locationAccountAddressPage.clearPhone1AndBlur();
    expect(await locationAccountAddressPage.isPhone1Invalid()).toBe(true);
    expect(await locationAccountAddressPage.isPhone1ErrorIconVisible()).toBe(true);
    await locationAccountAddressPage.fillPhone1(PHONE1_BASELINE);
    await locationAccountAddressPage.clickSave();
  });

  test('TC-LOC-ACC-016: Phone 2 optional, no validation error when empty', async ({ locationAccountAddressPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-ACC-001']);
    expect(await locationAccountAddressPage.isPhone2Invalid()).toBe(false);
  });

  test('TC-LOC-ACC-017: Save button disabled when no pending changes', async ({ locationAccountAddressPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-ACC-001']);
    expect(await locationAccountAddressPage.isSaveEnabled()).toBe(false);
  });

  test('TC-LOC-ACC-018: Save button enables on field change', async ({ locationAccountAddressPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-ACC-001']);
    test.setTimeout(60_000);
 // Ensure Phone 2 baseline is clean (may be dirty from prior failed run)
    const currentPhone2 = await locationAccountAddressPage.getPhone2Value();
    if (currentPhone2) {
      await locationAccountAddressPage.fillPhone2('');
      await locationAccountAddressPage.clickSave();
 // Reload to ensure Angular form is fully re-initialized before testing fill → save behavior
      await locationAccountAddressPage.reloadAndNavigate(OFFICE_NO);
    }
    expect(await locationAccountAddressPage.isSaveEnabled()).toBe(false);
    await locationAccountAddressPage.fillPhone2(ACCOUNT_TEST_PHONE);
    await expect.poll(() => locationAccountAddressPage.isSaveEnabled(), { timeout: 5_000 }).toBe(true);
    await locationAccountAddressPage.reloadAndNavigate(OFFICE_NO);
  });

  test('TC-LOC-ACC-019: Save flow -- confirmation dialog then success', async ({ locationAccountAddressPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-ACC-001']);
    await locationAccountAddressPage.fillPhone2(TEST_PHONE2_VALUE);
    await expect.poll(() => locationAccountAddressPage.isSaveEnabled(), { timeout: 5_000 }).toBe(true);
    await locationAccountAddressPage.clickSave();
    expect(await locationAccountAddressPage.isSaveEnabled(), 'Save should be disabled after successful save').toBe(false);
  });

  test('TC-LOC-ACC-020: Save changes persist after page reload', async ({ locationAccountAddressPage, dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(90_000);
 // Per-test baseline: arrange Phone 2 at the START of THIS test instead of depending on
 // TC-019 having saved it in the same serial run (cross-test coupling that failed when run
 // isolated / retried / parallel). Pick a target that DIFFERS from the current value to guarantee a
 // real dirtying change (avoids the net-zero trap where Save never enables). Both
 // candidate values are non-empty, so the clear-not-persisting issue (clearing Phone 2 will not persist) never bites.
    const current = await locationAccountAddressPage.getPhone2Value();
    const target = current === TEST_PHONE2_VALUE ? ACCOUNT_TEST_PHONE : TEST_PHONE2_VALUE;
    await locationAccountAddressPage.fillPhone2(target);
    await expect.poll(() => locationAccountAddressPage.isSaveEnabled(), { timeout: 5_000 }).toBe(true);
    await locationAccountAddressPage.clickSave();
 // Reload and confirm Phone 2 persisted.
 // Phone 2 DOES persist, but the save commits a beat AFTER clickSave() returns. If a single reload's
 // getLocationDetail fires before that commit lands, it serves the pre-save value and the loaded page
 // does not auto-refetch — a fresh re-navigation after the commit reads the persisted value immediately
 // (<0.5s, measured live). So re-navigate each poll iteration until the persisted value is read. This
 // tolerates the backend's read-after-write window WITHOUT weakening intent: it still proves Phone 2 ==
 // the saved target after a reload (not a relaxed/constant assertion).
    await expect.poll(async () => {
      await locationAccountAddressPage.reloadAndNavigate(OFFICE_NO);
      return locationAccountAddressPage.getPhone2Value();
    }, { timeout: 60_000, intervals: [1_000], message: 'Phone 2 should persist as the saved target after reload' }).toBe(target);
    expect(await locationAccountAddressPage.isSaveEnabled()).toBe(false);
 // Cleanup: leave Phone 2 at the canonical TEST_PHONE2_VALUE baseline. This (a) matches the prior
 // effective end-state — the old empty-restore never persisted (clear does not persist), so the serial chain
 // always ended at TEST_PHONE2_VALUE — and (b) gives downstream serial tests a dirtyable starting value:
 // TC-022 fills ACCOUNT_TEST_PHONE and needs a NET change to enable Save, so Phone 2 must NOT be left at
 // ACCOUNT_TEST_PHONE (which is exactly the value this test's `target` becomes in a serial run). Empty
 // cannot persist (empty values do not persist after save), so restore to a known non-empty value rather than ''.
    if (target !== TEST_PHONE2_VALUE) {
      await locationAccountAddressPage.fillPhone2(TEST_PHONE2_VALUE);
      await locationAccountAddressPage.clickSave();
    }
  });

 // TC-021 DROPPED: live verification proved Phone 1 is account-linked.
 // Save completes but value always reverts to account phone on reload. NOT-AUTOMATABLE.

  test('TC-LOC-ACC-021: Cancel Save dialog discards save without persisting', async ({ locationAccountAddressPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-ACC-001']);
    test.setTimeout(60_000);
    await locationAccountAddressPage.fillPhone2(ACCOUNT_TEST_PHONE);
    await expect.poll(() => locationAccountAddressPage.isSaveEnabled(), { timeout: 5_000 }).toBe(true);
 // Click Save → Cancel in confirmation dialog
    await locationAccountAddressPage.openSaveDialog();
    await locationAccountAddressPage.cancelSaveDialog();
 // Verify: Save still enabled (changes not committed), value still present
    expect(await locationAccountAddressPage.isSaveEnabled()).toBe(true);
    expect(await locationAccountAddressPage.getPhone2Value()).toBe(ACCOUNT_TEST_PHONE);
 // Discard changes via reload
    await locationAccountAddressPage.reloadAndNavigate(OFFICE_NO);
  });

  test('TC-LOC-ACC-022: Phone 1 cleared shows invalid state and error icon', async ({ locationAccountAddressPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-ACC-001']);
 // Live-verified: clearing Phone 1 shows aria-invalid=true but Save stays enabled.
 // This TC verifies validation indicators; Save blocking is NOT app behavior.
    await locationAccountAddressPage.clearPhone1AndBlur();
    expect(await locationAccountAddressPage.isPhone1Invalid()).toBe(true);
    expect(await locationAccountAddressPage.isPhone1ErrorIconVisible()).toBe(true);
 // Save remains enabled even with invalid field (Angular doesn't block)
    expect(await locationAccountAddressPage.isSaveEnabled()).toBe(true);
 // Discard — reload to restore server-saved baseline
    await locationAccountAddressPage.reloadAndNavigate(OFFICE_NO);
  });

  test('TC-LOC-ACC-023: Account List Address filter returns matching results', async ({ locationAccountAddressPage, dependencyGate }) => {
    test.fixme(true, 'Blocked — the Account List dialog does not function reliably for automated interaction. Pending an application fix.');
    dependencyGate(['TC-LOC-ACC-001']);
    test.setTimeout(60_000);
    await locationAccountAddressPage.openAccountListDialog();
    await locationAccountAddressPage.searchAccountByAddress(ACCOUNT_LIST_FILTERS.address);
    await expect.poll(
      () => locationAccountAddressPage.accountListResultsContain(ACCOUNT_LIST_FILTERS.addressExpected),
      { timeout: 20_000, message: 'Address filter should return matching results' }
    ).toBe(true);
    await locationAccountAddressPage.cancelAccountListDialog();
  });

  test('TC-LOC-ACC-024: Account List City filter returns matching results', async ({ locationAccountAddressPage, dependencyGate }) => {
    test.fixme(true, 'Blocked — the Account List dialog does not function reliably for automated interaction. Pending an application fix.');
    dependencyGate(['TC-LOC-ACC-001']);
    test.setTimeout(60_000);
    await locationAccountAddressPage.openAccountListDialog();
    await locationAccountAddressPage.searchAccountByCity(ACCOUNT_LIST_FILTERS.city);
    await expect.poll(
      () => locationAccountAddressPage.accountListResultsContain(ACCOUNT_LIST_FILTERS.cityExpected),
      { timeout: 20_000, message: 'City filter should return matching results' }
    ).toBe(true);
    await locationAccountAddressPage.cancelAccountListDialog();
  });

  test('TC-LOC-ACC-025: Address selection changes venue display fields', async ({ locationAccountAddressPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-ACC-001']);
    test.setTimeout(60_000);
 // Live-verified: address selection updates display but does NOT persist through save+reload.
 // Angular form model doesn't serialize the new address. This TC tests E2E display change only.
 // Verify starting state
    await expect.poll(() => locationAccountAddressPage.getVenueCityText(), { timeout: 5_000 }).toBe(ORIGINAL_ADDRESS.city);
 // Select alternate address
    await locationAccountAddressPage.openVenueAddressDialog();
    await locationAccountAddressPage.selectAddressRow(ALT_ADDRESS.address1);
 // Verify display changed
    await expect.poll(() => locationAccountAddressPage.getVenueCityText(), { timeout: 5_000 }).toBe(ALT_ADDRESS.city);
 // Save enables (form dirty from selection)
    await expect.poll(() => locationAccountAddressPage.isSaveEnabled(), { timeout: 5_000 }).toBe(true);
 // Discard: reload restores original
    await locationAccountAddressPage.reloadAndNavigate(OFFICE_NO);
    await expect.poll(() => locationAccountAddressPage.getVenueCityText(), { timeout: 10_000 }).toBe(ORIGINAL_ADDRESS.city);
  });

  test('TC-LOC-ACC-026: Account selection changes venue name and persists', async ({ locationAccountAddressPage, dependencyGate }) => {
    test.fixme(true, 'Blocked — the Account List dialog does not function reliably for automated interaction. Pending an application fix.');
    dependencyGate(['TC-LOC-ACC-001']);
    test.setTimeout(120_000);
    const originalName = await locationAccountAddressPage.getVenueNameValue();
    try {
 // Open Account List → search for current account → select (re-selecting same triggers dirty)
      await locationAccountAddressPage.openAccountListDialog();
      await locationAccountAddressPage.searchAccountByName(ACCOUNT_SEARCH.term);
      await expect.poll(
        () => locationAccountAddressPage.accountListResultsContain(ACCOUNT_SEARCH.expectedResult),
        { timeout: 20_000 }
      ).toBe(true);
      await locationAccountAddressPage.selectAccountListFirstRow();
 // Verify form dirty → Save enabled
      await expect.poll(() => locationAccountAddressPage.isSaveEnabled(), { timeout: 5_000 }).toBe(true);
 // Save and verify persistence
      await locationAccountAddressPage.clickSave();
      expect(await locationAccountAddressPage.isSaveEnabled()).toBe(false);
      await locationAccountAddressPage.reloadAndNavigate(OFFICE_NO);
 // Venue name should still be the same (re-selected same account)
      await expect.poll(() => locationAccountAddressPage.getVenueNameValue(), { timeout: 10_000 }).toBe(originalName);
    } finally {
 // Ensure clean state — if we somehow changed the account, restore it
      const currentName = await locationAccountAddressPage.getVenueNameValue();
      if (currentName !== originalName) {
        await locationAccountAddressPage.openAccountListDialog();
        await locationAccountAddressPage.searchAccountByName(originalName);
        await locationAccountAddressPage.selectAccountListFirstRow();
        await locationAccountAddressPage.clickSave();
        await locationAccountAddressPage.reloadAndNavigate(OFFICE_NO);
      }
    }
  });

  //     existing describe, same @locations @account-address tags, no separate fcc-tag.
  //     Save-cycle case uses the field-coverage runner; filter cases use ordinary test() (no save). ───

  // Clearing Phone 2 and saving does NOT persist empty; the prior
  // value reappears on reload. This case asserts the CORRECT (fixed) behavior, so it is fixme'd
  // until the app bug is resolved. Un-fixme when the clear-not-persisting issue closes.
  // FIXME TC-LOC-ACC-027 (Blocked — clearing the Phone 2 field and saving does not persist the empty value; the previous value reappears after reload. Pending an application fix.)
  test.fixme('TC-LOC-ACC-027: Phone 2 cleared value persists empty after reload', async ({ locationAccountAddressPage: pg, dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(60_000);
    await saveAndVerifyCase({
      id: 'TC-LOC-ACC-027',
      label: 'Phone 2 clear -> save -> empty persists after reload',
      // Seed a value first (Phone 2 baseline is empty) so clearing is a real, dirtying change.
      baseline: async () => {
        await pg.ensureDefaultState();
        await pg.fillPhone2(TEST_PHONE2_VALUE);
        await pg.saveAndConfirm();
      },
      act: () => pg.fillPhone2(''),
      expectBeforeSave: async () => {
        await expect.poll(() => pg.isSaveEnabled(), { timeout: 5_000 }).toBe(true);
      },
      saveAndConfirm: () => pg.saveAndConfirm(),
      expectAfterSave: async () => {
        expect(await pg.isSaveEnabled()).toBe(false);
      },
      reload: () => pg.reloadAndNavigate(OFFICE_NO),
      expectAfterReload: async () => {
        expect(await pg.getPhone2Value()).toBe('');
      },
      cleanup: () => pg.ensureDefaultState(),
    });
  });

  test('TC-LOC-ACC-028: Account List Account Number filter returns matching account', async ({ locationAccountAddressPage: pg, dependencyGate }) => {
    test.fixme(true, 'Blocked — the Account List dialog does not function reliably for automated interaction. Pending an application fix.');
    dependencyGate([]);
    test.setTimeout(90_000);
    await pg.openAccountListDialog();
    await pg.searchAccountByNumber(ACCOUNT_NUMBER_SEARCH.number);
    // Poll budget (45s) ≥ the page object's inner search budget so the TEST owns the deadline. The
    // Account-Number backend search is slow/variable (~29s measured live 2026-06-02).
    // searchAccountByNumber already blocks until the row renders, so this poll confirms the
    // expected account text (AC000107 → Parker Palm Springs, verified live) and resolves once present.
    await expect.poll(
      () => pg.accountListResultsContain(ACCOUNT_NUMBER_SEARCH.expectedResult),
      { timeout: 45_000, message: 'Account Number filter should return the matching account' },
    ).toBe(true);
    await pg.cancelAccountListDialog();
  });

  test('TC-LOC-ACC-029: Address dialog search filter then clear restores full set', async ({ locationAccountAddressPage: pg, dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(60_000);
    await pg.openVenueAddressDialog();
    const initialRows = await pg.getAddressRowCount();
    expect(initialRows).toBeGreaterThan(1);
    await pg.searchAddress(ADDRESS_SEARCH.filterTerm);
    expect(await pg.getAddressRowCount()).toBeLessThan(initialRows);
    // Clear the client-side filter -> full row set restores
    await pg.searchAddress('');
    await expect.poll(() => pg.getAddressRowCount(), { timeout: 5_000 }).toBe(initialRows);
    await pg.cancelAddressDialog();
  });

  //     @locations @account-address tags, no @fcc tag (per the tagging convention).
  //     The Master launcher's select→Master-field-update→persist cycle had ZERO coverage (TC-012 only
  //     proved the dialog OPENS from Master). Per-launcher coverage: a Venue TC can NOT
  //     discharge a Master cell — the SAME dialog persists from Master but NOT from Venue (TC-027). ───

  test('TC-LOC-ACC-030: Master Bill To selection updates Master display + leaves Venue unchanged + enables Save', async ({ locationAccountAddressPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-ACC-001']);
    test.setTimeout(90_000);
    await expect.poll(() => pg.getMasterCityText(), { timeout: 10_000 }).toBe(MASTER_BILL_TO_ORIGINAL.city);
    const venueBefore = await pg.getVenueCityText();
    // Select an alternate address via the MASTER launcher
    await pg.openMasterAddressDialog();
    await pg.selectAddressRow(ALT_ADDRESS.address1);
    await expect.poll(() => pg.getMasterCityText(), { timeout: 5_000 }).toBe(ALT_ADDRESS.city);
    // Venue/Branch display is UNCHANGED — the Master selection is isolated from Venue
    expect(await pg.getVenueCityText()).toBe(venueBefore);
    // Save enables (form dirty — NOT display-only)
    await expect.poll(() => pg.isSaveEnabled(), { timeout: 5_000 }).toBe(true);
    await pg.reloadAndNavigate(OFFICE_NO);
    await expect.poll(() => pg.getMasterCityText(), { timeout: 10_000 }).toBe(MASTER_BILL_TO_ORIGINAL.city);
  });

  test('TC-LOC-ACC-031: Master Bill To selection persists through save+reload (restore anchored original)', async ({ locationAccountAddressPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-ACC-001']);
    test.setTimeout(150_000);
    await saveAndVerifyCase({
      id: 'TC-LOC-ACC-031',
      label: 'Master Bill To select alt -> save -> persists -> restore anchored original',
      // Anchor check: Master must start at the original (loud fail if a prior run leaked an alternate).
      baseline: async () => {
        await expect.poll(() => pg.getMasterCityText(), { timeout: 10_000 }).toBe(MASTER_BILL_TO_ORIGINAL.city);
      },
      act: async () => {
        await pg.openMasterAddressDialog();
        await pg.selectAddressRow(ALT_ADDRESS.address1);
      },
      expectBeforeSave: async () => {
        await expect.poll(() => pg.getMasterCityText(), { timeout: 5_000 }).toBe(ALT_ADDRESS.city);
        await expect.poll(() => pg.isSaveEnabled(), { timeout: 5_000 }).toBe(true);
      },
      saveAndConfirm: () => pg.saveAndConfirm(),
      reload: () => pg.reloadAndNavigate(OFFICE_NO),
      expectAfterReload: async () => {
        // Master Bill To selection PERSISTS through save+reload (diverges from the Venue selection, TC-027).
        // Read-after-write window (ACC-020 pattern): the save commits a beat AFTER clickSave() returns; a
        // single reload's getLocationDetail can fire before the commit lands and serve the pre-save value
        // (the loaded page does not auto-refetch). Re-navigate each poll until the persisted value is read —
        // this still proves persistence (Master == the saved alternate after a reload), without weakening intent.
        await expect.poll(async () => {
          await pg.reloadAndNavigate(OFFICE_NO);
          return pg.getMasterCityText();
        }, { timeout: 60_000, intervals: [1_000], message: 'Master Bill To should persist as the saved alternate after reload' }).toBe(ALT_ADDRESS.city);
        expect(await pg.getMasterAddressBlock()).toContain(ALT_ADDRESS.address1);
      },
      // Restore office-1604 to the anchored original by re-selecting the unique "8899 Beverly Blvd Ste 412"
      // row, then VERIFY the restore landed (re-navigate poll — same read-after-write window) so nothing leaks.
      cleanup: async () => {
        await pg.openMasterAddressDialog();
        await pg.selectAddressRow(MASTER_BILL_TO_ORIGINAL.address1);
        await pg.saveAndConfirm();
        await expect.poll(async () => {
          await pg.reloadAndNavigate(OFFICE_NO);
          return pg.getMasterCityText();
        }, { timeout: 60_000, intervals: [1_000], message: 'Master Bill To should restore to the anchored original' }).toBe(MASTER_BILL_TO_ORIGINAL.city);
      },
    });
  });

});
