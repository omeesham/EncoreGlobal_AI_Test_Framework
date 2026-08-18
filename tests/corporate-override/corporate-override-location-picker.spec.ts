import { test, expect } from '../../src/fixtures/pages.fixture';
import {
  CORP_PRICING_OVERRIDE_FIXTURE,
} from '../../src/data/corporate-override/override';
import { CorporatePricingOverrideSelectors } from '../../src/selectors/corporate-override/override';

const GRID_ROW = CorporatePricingOverrideSelectors.ovrGridRowAny;

const LOC = CORP_PRICING_OVERRIDE_FIXTURE.office; // location picker search needle ('1606')

test.describe('Corporate Pricing — Product Group Override: Change Local Office picker search & Active filter @corporate-pricing @override', () => {
  test('TC-CPR-OVR-038: Typing a partial office number narrows picker rows; clearing restores the full list', async ({ corporatePricingOverridePage: p }) => {
    test.setTimeout(90_000);
    await p.reloadAndReselect(LOC);
    await p.openLocationPicker();
    let matchCount = 0;
    await test.step('Search "1107" narrows the list to matching offices', async () => {
      await p.searchLocalOffice('1107');
      matchCount = await p.getPickerRowCount();
      expect(matchCount).toBeGreaterThan(0); // at least one match
      expect(await p.pickerHasRowContaining('1107')).toBe(true); // "1107" text visible in a row
      expect(await p.getPickerRowCountContaining('1107')).toBe(matchCount); // every visible row matches the search query
    });
    await test.step('Clearing the search restores more rows than the filtered result', async () => {
      await p.clearPickerSearch();
      const afterClearCount = await p.getPickerRowCount();
      expect(afterClearCount).toBeGreaterThan(matchCount); // clearing un-narrows: full list has more rows than the filtered result
    });
    await p.cancelLocationPicker(); // no location change
    expect(await p.getVisibleRowCount()).toBeGreaterThan(0); // original location (1606) grid unchanged
  });

  // Known behavior (reviewer-confirmed): the server ignores the activeOnly parameter — both CHECKED
  // and UNCHECKED states return the same location set. Office 1222 ("Hyatt Fairfax at Fair Lakes")
  // is confirmed inactive yet never appears in either state. Opening the picker fires ≥1 POST
  // (positive control proving the network listener works); toggling fires 0 POSTs — the Active
  // checkbox is a client-side filter only. The toggle assertion will fail when the app is fixed.
  test('TC-CPR-OVR-039: Picker Active checkbox defaults unchecked; toggling is a client-side filter — no location-lookup POST fires', async ({ corporatePricingOverridePage: p }) => {
    test.setTimeout(120_000);
    await p.reloadAndReselect(LOC);
    await test.step('Open picker — fires at least one location-lookup POST (positive control: listener works)', async () => {
      const openProbe = await p.openLocationPickerAndCapturePost();
      expect(openProbe.postFired, 'opening the picker must fire a location-lookup POST').toBe(true);
      expect(openProbe.locationCount, 'POST response must carry at least one location').toBeGreaterThan(0);
    });
    await test.step('Active checkbox defaults to UNCHECKED on open', async () => {
      expect(await p.getPickerActiveCheckboxState()).toBe(false);
    });
    await test.step('Toggle Active to CHECKED — no location-lookup POST fires (client-side filter; activeOnly has no server effect)', async () => {
      const checkProbe = await p.toggleLocalOfficePickerActiveAndCapturePost();
      expect(await p.getPickerActiveCheckboxState()).toBe(true);
      // Real documented behavior: toggle is handled client-side — no POST fires.
      // This assertion fails when the app is fixed to honor activeOnly server-side.
      expect(checkProbe.postFired, 'toggle must NOT fire a location-lookup POST (Active checkbox is a client-side filter)').toBe(false);
      expect(await p.getPickerRowCount(), 'list must still show rows after client-side toggle').toBeGreaterThan(0);
    });
    await test.step('Search "1107" composes with Active CHECKED — matching rows visible', async () => {
      await p.searchLocalOffice('1107');
      expect(await p.pickerHasRowContaining('1107')).toBe(true);
    });
    await test.step('Clear search; toggle Active back to UNCHECKED — still no location-lookup POST fires', async () => {
      await p.clearPickerSearch();
      const uncheckProbe = await p.toggleLocalOfficePickerActiveAndCapturePost();
      expect(await p.getPickerActiveCheckboxState()).toBe(false);
      expect(uncheckProbe.postFired, 'toggle-back must NOT fire a location-lookup POST').toBe(false);
      expect(await p.getPickerRowCount()).toBeGreaterThan(0);
    });
    await test.step('Cancel discards picker state — original grid (1606) remains loaded', async () => {
      await p.cancelLocationPicker();
      expect(await p.getVisibleRowCount()).toBeGreaterThan(0);
    });
  });
});

test.describe('Corporate Pricing — Product Group Override: RBAC access gate @corporate-pricing @override', () => {
  // PERMANENTLY NOT AUTOMATABLE — owner-confirmed 2026-07-20.
  //
  // The deny-path (non-RM user sees no edit cell, no Save, no Import on the Override grid) requires
  // a second test account with a non-Revenue-Management role. The client has confirmed that no such
  // account exists, cannot be obtained, and will never be obtained. Every available automation
  // account carries equivalent RM-level access; there is no in-app role-switch mechanism.
  //
  // RBAC API investigation (2026-07-20, live network capture): navigating to the Override screen
  // with valid auth fires only GET /navigator/api/env and GET /navigator/api/auth/session — no
  // role/permission endpoint, no route guard, no feature flag, no DOM role indicator. There is no
  // API surface a test could query to assert the deny-path. (NM-2126)
  //
  // The positive-path coverage (RM user CAN edit, CAN enable Save, CAN open Import) is already
  // provided by TC-CPR-OVR-017, TC-CPR-OVR-018, and TC-CPR-OVR-032.
  test.skip('TC-CPR-OVR-040: Non-Revenue-Management user sees a read-only Override grid — no edit, no Save, no Import [blocked: every automation account we hold has equivalent access and no RBAC state is exposed on the Override screen; a second automation account WITHOUT the 1101 Revenue Management role would make this automatable immediately; see NM-2126]', async () => {
    // Body intentionally empty — this test is permanently unautomatable.
    // See the describe-block comment above for the investigation evidence.
  });
});

test.describe('Override Toolbar — Location Picker Dismissal', () => {
  const BED = CORP_PRICING_OVERRIDE_FIXTURE;

  test('TC-CPR-OVR-111: Escape closes the location picker without applying a location', async ({ corporatePricingOverridePage: overridePage }) => {
    await overridePage.navigateToEquipmentRow(BED.office, BED.office, BED.mutationRowAnchor.productGroupId);
    const rowCountBefore = await overridePage.getVisibleRowCount();

    // Open the picker dialog
    await overridePage.openLocationPicker();
    await overridePage.page.locator('[role="dialog"]').waitFor({ state: 'visible' });

    // Dismiss with Escape
    await overridePage.page.keyboard.press('Escape');
    await overridePage.page.locator('[role="dialog"]').waitFor({ state: 'hidden' });

    // Assert: grid unchanged, Save still disabled
    const rowCountAfter = await overridePage.getVisibleRowCount();
    expect(rowCountAfter).toBe(rowCountBefore);
    await expect(overridePage.page.locator('button:has-text("Save")')).toBeDisabled();
  });

  test('TC-CPR-OVR-112: Cancel closes the location picker without applying a location', async ({ corporatePricingOverridePage: overridePage }) => {
    await overridePage.navigateToEquipmentRow(BED.office, BED.office, BED.mutationRowAnchor.productGroupId);
    const rowCountBefore = await overridePage.getVisibleRowCount();

    // Open the picker dialog — use the page object helper which waits for full dialog readiness
    await overridePage.openLocationPicker();
    const dialog = overridePage.page.locator('[role="dialog"]');

    // Dismiss with Cancel button (live evidence: dialog footer is Select + Cancel, no Close)
    const cancelBtn = dialog.locator('button:text-is("Cancel")');
    await cancelBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await cancelBtn.click();
    await dialog.waitFor({ state: 'hidden' });

    // Assert: grid unchanged, Save still disabled
    const rowCountAfter = await overridePage.getVisibleRowCount();
    expect(rowCountAfter).toBe(rowCountBefore);
    await expect(overridePage.page.locator('button:has-text("Save")')).toBeDisabled();
  });

  test('TC-CPR-OVR-113: No-results empty state in the location picker', async ({ corporatePricingOverridePage: overridePage }) => {
    await overridePage.navigateToEquipmentRow(BED.office, BED.office, BED.mutationRowAnchor.productGroupId);

    // Open the picker dialog
    await overridePage.openLocationPicker();
    const dialog = overridePage.page.locator('[role="dialog"]');
    await dialog.waitFor({ state: 'visible' });

    // Search a nonsense string
    const searchInput = dialog.locator('[data-testid="location-settings-modal-change-local-office-input-search"]');
    await searchInput.fill('zzz999nonexistent');

    // Assert: "No results." empty state is announced (not a silent blank)
    await expect(dialog.locator('text=No results.')).toBeVisible();

    // Close without applying
    await overridePage.page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
  });

  test('TC-CPR-OVR-114: Re-selecting the current office does not dirty the form (net-zero)', async ({ corporatePricingOverridePage: overridePage }) => {
    await overridePage.navigateToEquipmentRow(BED.office, BED.office, BED.mutationRowAnchor.productGroupId);
    await expect(overridePage.page.locator('button:has-text("Save")')).toBeDisabled();

    // Open picker, search for and re-select the same office (1606)
    await overridePage.openLocationPicker();
    const dialog = overridePage.page.locator('[role="dialog"]');
    await dialog.waitFor({ state: 'visible' });

    const searchInput = dialog.locator('[data-testid="location-settings-modal-change-local-office-input-search"]');
    await searchInput.fill(BED.office);
    await dialog.locator('tbody tr').first().locator('[role="checkbox"]').check();
    await dialog.locator('button:has-text("Select")').click();
    await dialog.waitFor({ state: 'hidden' });

    // Assert: Save stays disabled — re-selecting the same office is net-zero
    await expect(overridePage.page.locator('button:has-text("Save")')).toBeDisabled();
    // Assert: anchor row still present (grid content unchanged)
    // Picker close triggers grid re-render; 5s default was marginal (TC-115 RCA: retry passed in 11.3s)
    await expect(overridePage.page.locator(GRID_ROW, { hasText: BED.mutationRowAnchor.productGroupId })).toBeVisible({ timeout: 15_000 });
  });
});
