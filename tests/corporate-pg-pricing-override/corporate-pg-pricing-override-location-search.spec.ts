import { test, expect } from '../../src/fixtures/pages.fixture';
import {
  CORP_PRICING_OVERRIDE_FIXTURE,
} from '../../src/data/corporate-override/override';
import { CorporatePricingOverrideSelectors } from '../../src/selectors/corporate-override/override';
import { phase, verify } from '../../src/fixtures/report-steps';

const GRID_ROW = CorporatePricingOverrideSelectors.ovrGridRowAny;

const LOC = CORP_PRICING_OVERRIDE_FIXTURE.office; // location picker search needle ('1606')

test.describe('Corporate Pricing — Product Group Override: location picker — search, Active filter, RBAC gate & dismissal @corporate-pricing @override', () => {
  const BED = CORP_PRICING_OVERRIDE_FIXTURE;

  test('TC-CPR-OVR-038: Typing a partial office number narrows picker rows; clearing restores the full list', async ({ corporatePricingOverridePage: p }) => {
    test.setTimeout(90_000);
    await p.reloadAndReselect(LOC);
    await p.openLocationPicker();
    let matchCount = 0;
    await verify('Searching "1107" narrows the list to matching offices', async () => {
      await p.searchLocalOffice('1107');
      matchCount = await p.getPickerRowCount();
      expect(matchCount).toBeGreaterThan(0); // at least one match
      expect(await p.pickerHasRowContaining('1107')).toBe(true); // "1107" text visible in a row
      expect(await p.getPickerRowCountContaining('1107')).toBe(matchCount); // every visible row matches the search query
    });
    await verify('Clearing the search restores more rows than the filtered result', async () => {
      await p.clearPickerSearch();
      const afterClearCount = await p.getPickerRowCount();
      expect(afterClearCount).toBeGreaterThan(matchCount); // clearing un-narrows: full list has more rows than the filtered result
    });
    await p.cancelLocationPicker(); // no location change
    await verify('The original location grid is untouched', async () => {
      expect(await p.getVisibleRowCount()).toBeGreaterThan(0);
    });
  });

  // The server ignores activeOnly, so the toggle fires no POST while opening the picker does (the
  // positive control). The toggle assertion is expected to fail once the app is fixed.
  test('TC-CPR-OVR-039: Picker Active checkbox defaults unchecked; toggling is a client-side filter — no location-lookup POST fires', async ({ corporatePricingOverridePage: p }) => {
    test.setTimeout(120_000);
    await p.reloadAndReselect(LOC);
    await verify('Opening the picker fires a location-lookup POST (positive control: the listener works)', async () => {
      const openProbe = await p.openLocationPickerAndCapturePost();
      expect(openProbe.postFired, 'opening the picker must fire a location-lookup POST').toBe(true);
      expect(openProbe.locationCount, 'POST response must carry at least one location').toBeGreaterThan(0);
    });
    await verify('The Active checkbox defaults to unchecked', async () => {
      expect(await p.getPickerActiveCheckboxState()).toBe(false);
    });
    await verify('Checking Active fires no POST — it is a client-side filter', async () => {
      const checkProbe = await p.toggleLocalOfficePickerActiveAndCapturePost();
      expect(await p.getPickerActiveCheckboxState()).toBe(true);
      // Real documented behavior: toggle is handled client-side — no POST fires.
      // This assertion fails when the app is fixed to honor activeOnly server-side.
      expect(checkProbe.postFired, 'toggle must NOT fire a location-lookup POST (Active checkbox is a client-side filter)').toBe(false);
      expect(await p.getPickerRowCount(), 'list must still show rows after client-side toggle').toBeGreaterThan(0);
    });
    await verify('A search composes with Active checked', async () => {
      await p.searchLocalOffice('1107');
      expect(await p.pickerHasRowContaining('1107')).toBe(true);
    });
    await verify('Unchecking Active again still fires no POST', async () => {
      await p.clearPickerSearch();
      const uncheckProbe = await p.toggleLocalOfficePickerActiveAndCapturePost();
      expect(await p.getPickerActiveCheckboxState()).toBe(false);
      expect(uncheckProbe.postFired, 'toggle-back must NOT fire a location-lookup POST').toBe(false);
      expect(await p.getPickerRowCount()).toBeGreaterThan(0);
    });
    await verify('Cancel discards the picker state, leaving the original grid loaded', async () => {
      await p.cancelLocationPicker();
      expect(await p.getVisibleRowCount()).toBeGreaterThan(0);
    });
  });

  // ── RBAC access gate ──
  // NM-2126: unautomatable — needs a non-RM account that will never exist, and no role API is exposed.
  test.skip('TC-CPR-OVR-040: Non-Revenue-Management user sees a read-only Override grid — no edit, no Save, no Import [blocked: every automation account we hold has equivalent access and no RBAC state is exposed on the Override screen; a second automation account WITHOUT the 1101 Revenue Management role would make this automatable immediately; see NM-2126]', async () => {
    // Body intentionally empty — see the NM-2126 note above.
  });

  // ── Toolbar location-picker dismissal ──
  test('TC-CPR-OVR-111: Escape closes the location picker without applying a location', async ({ corporatePricingOverridePage: overridePage }) => {
    await overridePage.navigateToEquipmentRow(BED.office, BED.office, BED.mutationRowAnchor.productGroupId);
    const rowCountBefore = await overridePage.getVisibleRowCount();

    await phase('Open the location picker', async () => {
      await overridePage.openLocationPicker();
      await overridePage.page.locator('[role="dialog"]').waitFor({ state: 'visible' });
    });

    await phase('Dismiss it with Escape', async () => {
      await overridePage.page.keyboard.press('Escape');
      await overridePage.page.locator('[role="dialog"]').waitFor({ state: 'hidden' });
    });

    const rowCountAfter = await overridePage.getVisibleRowCount();
    await verify('The grid is unchanged and Save is still disabled', async () => {
      expect(rowCountAfter).toBe(rowCountBefore);
      await expect(overridePage.page.locator('button:has-text("Save")')).toBeDisabled();
    });
  });

  test('TC-CPR-OVR-112: Cancel closes the location picker without applying a location', async ({ corporatePricingOverridePage: overridePage }) => {
    await overridePage.navigateToEquipmentRow(BED.office, BED.office, BED.mutationRowAnchor.productGroupId);
    const rowCountBefore = await overridePage.getVisibleRowCount();

    // Open the picker dialog — use the page object helper which waits for full dialog readiness
    await overridePage.openLocationPicker();
    const dialog = overridePage.page.locator('[role="dialog"]');

    // live evidence: dialog footer is Select + Cancel, no Close
    await phase('Dismiss it with the Cancel button', async () => {
      const cancelBtn = dialog.locator('button:text-is("Cancel")');
      await cancelBtn.waitFor({ state: 'visible', timeout: 10_000 });
      await cancelBtn.click();
      await dialog.waitFor({ state: 'hidden' });
    });

    const rowCountAfter = await overridePage.getVisibleRowCount();
    await verify('The grid is unchanged and Save is still disabled', async () => {
      expect(rowCountAfter).toBe(rowCountBefore);
      await expect(overridePage.page.locator('button:has-text("Save")')).toBeDisabled();
    });
  });

  test('TC-CPR-OVR-113: No-results empty state in the location picker', async ({ corporatePricingOverridePage: overridePage }) => {
    await overridePage.navigateToEquipmentRow(BED.office, BED.office, BED.mutationRowAnchor.productGroupId);

    const dialog = overridePage.page.locator('[role="dialog"]');
    await phase('Open the location picker', async () => {
      await overridePage.openLocationPicker();
      await dialog.waitFor({ state: 'visible' });
    });

    await phase('Search for a string that matches nothing', async () => {
      const searchInput = dialog.locator('[data-testid="location-settings-modal-change-local-office-input-search"]');
      await searchInput.fill('zzz999nonexistent');
    });

    await verify('The empty state is announced rather than left blank', async () => {
      await expect(dialog.locator('text=No results.')).toBeVisible();
    });

    await phase('Close the picker without applying', async () => {
      await overridePage.page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'hidden' });
    });
  });

  test('TC-CPR-OVR-114: Re-selecting the current office does not dirty the form (net-zero)', async ({ corporatePricingOverridePage: overridePage }) => {
    await overridePage.navigateToEquipmentRow(BED.office, BED.office, BED.mutationRowAnchor.productGroupId);
    await verify('The form starts clean', async () => {
      await expect(overridePage.page.locator('button:has-text("Save")')).toBeDisabled();
    });

    const dialog = overridePage.page.locator('[role="dialog"]');
    await phase('Open the location picker', async () => {
      await overridePage.openLocationPicker();
      await dialog.waitFor({ state: 'visible' });
    });

    await phase('Search for and re-select the office already loaded', async () => {
      const searchInput = dialog.locator('[data-testid="location-settings-modal-change-local-office-input-search"]');
      await searchInput.fill(BED.office);
      await dialog.locator('tbody tr').first().locator('[role="checkbox"]').check();
      await dialog.locator('button:has-text("Select")').click();
      await dialog.waitFor({ state: 'hidden' });
    });

    await verify('Re-selecting the same office leaves the form clean', async () => {
      // net-zero: Save stays disabled
      await expect(overridePage.page.locator('button:has-text("Save")')).toBeDisabled();
      // anchor row still present (grid content unchanged). Picker close triggers a grid
      // re-render; the 5s default was marginal (TC-115 RCA: retry passed in 11.3s).
      await expect(overridePage.page.locator(GRID_ROW, { hasText: BED.mutationRowAnchor.productGroupId })).toBeVisible({ timeout: 15_000 });
    });
  });
});
