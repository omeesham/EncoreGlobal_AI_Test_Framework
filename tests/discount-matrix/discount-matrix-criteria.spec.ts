import { test, expect } from '../../src/fixtures/pages.fixture';
import { DiscountMatrixBasePage } from '../../src/pages/discount-matrix/discount-matrix.page';
import { discountMatrixShared as S } from '../../src/selectors/discount-matrix/shared';
import {
  DM_OFFICE,
  DM_COUNTRIES,
  DM_CURRENCIES,
  DM_BUSINESS_TIERS,
  DM_CRITERIA_AT_REST,
  DM_THRESHOLD_MIN,
  DM_THRESHOLD_MAX,
  DM_THRESHOLD_OVER_MAX,
  DM_THRESHOLD_FAR_OVER_MAX,
} from '../../src/data/discount-matrix/discount-matrix';

/**
 * Discount Matrix — Search Criteria bar (NM-3530).
 *
 * The page hydrates in stages (the threshold input resolves at ~91–100s), so the ceiling
 * below is real load time, not padding. Tests run in file order on a shared signed-in page;
 * every test starts by verifying the page is loaded and pristine, reloading if not.
 *
 * The threshold has no assertable default — it holds whatever the last save left — so every
 * test reads the value first and restores what it changes. Cases that type refused or
 * rewritten input end with a reload: this form's model does not reliably recover from
 * non-numeric input by retyping, and an unsaved edit must never leak into the next test.
 */
// A criteria re-query can run as long as a full hydration on a slow evening (measured past
// 180s), and a test performs two of them — the ceiling must clear one degenerate re-query.
test.describe.configure({ timeout: 420_000 });

// ---------------------------------------------------------------------------- surface cases

test.describe('SBC — Discount Matrix Search Criteria surface behaviors @discount-matrix @criteria', () => {
  let dm: DiscountMatrixBasePage;

  test.beforeEach(async ({ authenticatedSession, config }) => {
    dm = new DiscountMatrixBasePage(authenticatedSession.page, config);
    await dm.ensureCleanCriteria(DM_OFFICE);
  });

  test('TC-DSM-CRT-001: The criteria bar loads with all four controls populated', async ({ dependencyGate }) => {
    dependencyGate([]);
    // A full navigation is the point of this case — it proves the ready gate itself.
    await dm.open(DM_OFFICE);
    expect(await dm.readCriteriaValues()).toEqual([...DM_CRITERIA_AT_REST]);
    // The exact number is deliberately not asserted; only the percentage format is.
    expect(await dm.readThreshold()).toMatch(/^\d+(\.\d+)?%$/);
  });

  test('TC-DSM-CRT-007: Changing Country re-queries the grid', async ({ dependencyGate }) => {
    dependencyGate([]);
    await dm.selectCriteria(0, 'Canada');
    expect((await dm.readCriteriaValues())[0]).toBe('Canada');
    await dm.selectCriteria(0, 'United States');
    expect((await dm.readCriteriaValues())[0]).toBe('United States');
  });

  test('TC-DSM-CRT-008: Changing Currency re-queries the grid', async ({ dependencyGate }) => {
    dependencyGate([]);
    await dm.selectCriteria(1, 'CAD');
    expect((await dm.readCriteriaValues())[1]).toBe('CAD');
    await dm.selectCriteria(1, 'USD');
    expect((await dm.readCriteriaValues())[1]).toBe('USD');
  });

  test('TC-DSM-CRT-009: Changing Business Tier re-queries the grid', async ({ dependencyGate }) => {
    dependencyGate([]);
    await dm.selectCriteria(2, 'Las Vegas');
    expect((await dm.readCriteriaValues())[2]).toBe('Las Vegas');
    await dm.selectCriteria(2, 'Standard');
    expect((await dm.readCriteriaValues())[2]).toBe('Standard');
  });

  test('TC-DSM-CRT-012: The tab strip offers three tabs with Company Matrix active', async ({ dependencyGate }) => {
    dependencyGate([]);
    expect(await dm.readTabNames()).toEqual(['Company Matrix', 'Region Weekly Peaks', 'Location Activation']);
    expect(await dm.getActiveTabName()).toBe('Company Matrix');
  });

  test('TC-DSM-CRT-013: The header information control is available', async ({ dependencyGate }) => {
    dependencyGate([]);
    await expect(dm.moreInformationButton()).toBeVisible();
    await expect(dm.moreInformationButton()).toBeEnabled();
  });

  test('TC-DSM-CRT-014: The left panel can be collapsed and restored', async ({ dependencyGate }) => {
    dependencyGate([]);
    await expect(dm.panelToggle()).toBeVisible();
    await expect(dm.panelToggle()).toBeEnabled();
    // Collapse: the Discount Matrix content beside the panel must stay visible.
    await dm.clickPanelToggle();
    await expect(dm.page.locator(S.inpGavThreshold)).toBeVisible();
    // Restore.
    await dm.clickPanelToggle();
    await expect(dm.page.locator(S.inpGavThreshold)).toBeVisible();
    await expect(dm.panelToggle()).toBeEnabled();
  });

  test('TC-DSM-CRT-027: Selecting Mexico re-queries the grid', async ({ dependencyGate }) => {
    dependencyGate([]);
    await dm.selectCriteria(0, 'Mexico');
    expect((await dm.readCriteriaValues())[0]).toBe('Mexico');
    await dm.selectCriteria(0, 'United States');
    expect((await dm.readCriteriaValues())[0]).toBe('United States');
  });

  test('TC-DSM-CRT-028: Selecting Bahamas re-queries the grid', async ({ dependencyGate }) => {
    dependencyGate([]);
    await dm.selectCriteria(0, 'Bahamas');
    expect((await dm.readCriteriaValues())[0]).toBe('Bahamas');
    await dm.selectCriteria(0, 'United States');
    expect((await dm.readCriteriaValues())[0]).toBe('United States');
  });

  test('TC-DSM-CRT-029: Selecting MXN re-queries the grid', async ({ dependencyGate }) => {
    dependencyGate([]);
    await dm.selectCriteria(1, 'MXN');
    expect((await dm.readCriteriaValues())[1]).toBe('MXN');
    await dm.selectCriteria(1, 'USD');
    expect((await dm.readCriteriaValues())[1]).toBe('USD');
  });

  test('TC-DSM-CRT-030: Selecting SVP Productions re-queries the grid', async ({ dependencyGate }) => {
    dependencyGate([]);
    await dm.selectCriteria(2, 'SVP Productions');
    expect((await dm.readCriteriaValues())[2]).toBe('SVP Productions');
    await dm.selectCriteria(2, 'Standard');
    expect((await dm.readCriteriaValues())[2]).toBe('Standard');
  });
});

// ---------------------------------------------------------------------------- field cases

test.describe('Discount Matrix Search Criteria — fields @discount-matrix @criteria', () => {
  let dm: DiscountMatrixBasePage;
  /** The live threshold value at test start — the restore target for every mutation. */
  let baselineThreshold: string;

  test.beforeEach(async ({ authenticatedSession, config }) => {
    dm = new DiscountMatrixBasePage(authenticatedSession.page, config);
    await dm.ensureCleanCriteria(DM_OFFICE);
    baselineThreshold = await dm.readThreshold();
  });

  /** Digits-only form of the captured baseline, retypeable into the field. */
  const baselineDigits = () => baselineThreshold.replace(/[^0-9.]/g, '');

  test('TC-DSM-CRT-002: Country offers the four supported countries', async ({ dependencyGate }) => {
    dependencyGate([]);
    expect(await dm.readCriteriaOptions(0)).toEqual([...DM_COUNTRIES]);
    expect((await dm.readCriteriaValues())[0]).toBe('United States');
  });

  test('TC-DSM-CRT-003: Currency offers the three supported currencies', async ({ dependencyGate }) => {
    dependencyGate([]);
    expect(await dm.readCriteriaOptions(1)).toEqual([...DM_CURRENCIES]);
    expect((await dm.readCriteriaValues())[1]).toBe('USD');
  });

  test('TC-DSM-CRT-004: Business Tier offers the three configured tiers', async ({ dependencyGate }) => {
    dependencyGate([]);
    expect(await dm.readCriteriaOptions(2)).toEqual([...DM_BUSINESS_TIERS]);
    expect((await dm.readCriteriaValues())[2]).toBe('Standard');
  });

  test('TC-DSM-CRT-005: Save is disabled when nothing has been changed', async ({ dependencyGate }) => {
    dependencyGate([]);
    expect(await dm.isCriteriaSaveEnabled()).toBe(false);
  });

  test('TC-DSM-CRT-006: Opening and dismissing a dropdown does not dirty the form', async ({ dependencyGate }) => {
    dependencyGate([]);
    const before = await dm.readCriteriaValues();
    for (let i = 0; i < 3; i++) {
      await dm.openAndDismissCriteria(i);
    }
    expect(await dm.readCriteriaValues()).toEqual(before);
    expect(await dm.isCriteriaSaveEnabled()).toBe(false);
  });

  test('TC-DSM-CRT-010: The threshold accepts a whole number and renders it as a percentage', async ({ dependencyGate }) => {
    dependencyGate([]);
    // A value different from the live one, so the edit registers as a change.
    const target = baselineDigits() === '20' ? '30' : '20';
    await dm.typeThreshold(target);
    await dm.blurThreshold();
    expect(await dm.readThreshold()).toBe(`${target}%`);
    expect(await dm.waitForCriteriaSaveEnabled()).toBe(true);
    // Restore by retyping the starting value — nothing was saved.
    await dm.typeThreshold(baselineDigits());
    await dm.blurThreshold();
    expect(await dm.readThreshold()).toBe(baselineThreshold);
  });

  test('TC-DSM-CRT-011: A saved threshold survives a reload', async ({ dependencyGate }) => {
    dependencyGate([]);
    // Two saves, each waiting for the page's ~30s sync POST, plus up to three full reloads
    // on a page whose evening hydration has been measured past 180s — this budget is the
    // sum of measured costs, not padding.
    test.setTimeout(1_200_000);
    // A value different from the live one — saving an unchanged value is a no-op the app
    // blocks by keeping Save disabled.
    const target = baselineDigits() === '20' ? '30' : '20';
    let saved = false;
    try {
      await dm.typeThreshold(target);
      await dm.blurThreshold();
      expect(await dm.waitForCriteriaSaveEnabled()).toBe(true);
      await dm.clickCriteriaSave();
      saved = true;
      // Save disables the moment it is clicked, so only the reload proves persistence.
      await dm.discardReload(DM_OFFICE);
      expect(await dm.readThreshold()).toBe(`${target}%`);
    } finally {
      if (saved) {
        // Restore through a verified save-reload-read cycle. The first version of this
        // restore skipped its save whenever the button was slow to enable, which leaked the
        // test's value to the shared server — the verifying helper makes that impossible.
        await dm.persistThreshold(baselineDigits());
        expect(await dm.readThreshold()).toBe(baselineThreshold);
      }
    }
  });

  test('TC-DSM-CRT-015: The threshold accepts zero, the bottom of its range', async ({ dependencyGate }) => {
    dependencyGate([]);
    await dm.typeThreshold(DM_THRESHOLD_MIN);
    await dm.blurThreshold();
    expect(await dm.readThreshold()).toBe(`${DM_THRESHOLD_MIN}%`);
    expect(await dm.isThresholdInvalid()).toBe(false);
    expect(await dm.waitForCriteriaSaveEnabled()).toBe(true);
    // Nothing was saved — the reload discards the edit and proves the stored value is intact.
    await dm.discardReload(DM_OFFICE);
    expect(await dm.readThreshold()).toBe(baselineThreshold);
  });

  test('TC-DSM-CRT-016: The threshold accepts one hundred, the top of its range', async ({ dependencyGate }) => {
    dependencyGate([]);
    await dm.typeThreshold(DM_THRESHOLD_MAX);
    await dm.blurThreshold();
    expect(await dm.readThreshold()).toBe(`${DM_THRESHOLD_MAX}%`);
    expect(await dm.isThresholdInvalid()).toBe(false);
    expect(await dm.waitForCriteriaSaveEnabled()).toBe(true);
    await dm.discardReload(DM_OFFICE);
    expect(await dm.readThreshold()).toBe(baselineThreshold);
  });

  test('TC-DSM-CRT-017: One above the maximum is refused', async ({ dependencyGate }) => {
    dependencyGate([]);
    await dm.typeThreshold(DM_THRESHOLD_OVER_MAX);
    // Read the refusal while the value is in place, before any blur.
    expect(await dm.isThresholdInvalid()).toBe(true);
    expect(await dm.isCriteriaSaveEnabled()).toBe(false);
    // The refused state must not trap the cursor: a natural Tab leaves the field. This is
    // asserted BEFORE any cleanup keystroke, which would otherwise mask a focus trap.
    await dm.blurThreshold();
    expect(await dm.isThresholdFocused()).toBe(false);
    await dm.discardReload(DM_OFFICE);
    expect(await dm.readThreshold()).toBe(baselineThreshold);
  });

  test('TC-DSM-CRT-018: A far out-of-range value is refused the same way', async ({ dependencyGate }) => {
    dependencyGate([]);
    await dm.typeThreshold(DM_THRESHOLD_FAR_OVER_MAX);
    expect(await dm.isThresholdInvalid()).toBe(true);
    expect(await dm.isCriteriaSaveEnabled()).toBe(false);
    // The refusal must also be escapable — the same natural-Tab check as TC-DSM-CRT-017.
    await dm.blurThreshold();
    expect(await dm.isThresholdFocused()).toBe(false);
    await dm.discardReload(DM_OFFICE);
    expect(await dm.readThreshold()).toBe(baselineThreshold);
  });

  test('TC-DSM-CRT-019: The threshold accepts one decimal place', async ({ dependencyGate }) => {
    dependencyGate([]);
    await dm.typeThreshold('12.5');
    await dm.blurThreshold();
    expect(await dm.readThreshold()).toBe('12.5%');
    expect(await dm.isThresholdInvalid()).toBe(false);
    expect(await dm.waitForCriteriaSaveEnabled()).toBe(true);
    await dm.discardReload(DM_OFFICE);
    expect(await dm.readThreshold()).toBe(baselineThreshold);
  });

  test('TC-DSM-CRT-020: Letters never reach the threshold field', async ({ dependencyGate }) => {
    dependencyGate([]);
    await dm.typeThreshold('abc');
    // The three letters are filtered at the keystroke — none enters the value.
    expect(await dm.readThreshold()).toBe('');
    expect(await dm.isThresholdInvalid()).toBe(true);
    expect(await dm.isCriteriaSaveEnabled()).toBe(false);
    // On blur the empty field falls back to 0% with no error — a silent substitution.
    await dm.blurThreshold();
    expect(await dm.readThreshold()).toBe('0%');
    expect(await dm.isThresholdInvalid()).toBe(false);
    // Non-numeric input corrupts the form model in a way retyping does not repair — reload.
    await dm.discardReload(DM_OFFICE);
    expect(await dm.readThreshold()).toBe(baselineThreshold);
  });

  test('TC-DSM-CRT-021: A malformed number is silently changed to a different one', async ({ dependencyGate }) => {
    dependencyGate([]);
    await dm.typeThreshold('1.2.3');
    // The second decimal point is dropped as it is typed.
    expect(await dm.readThreshold()).toBe('1.23');
    await dm.blurThreshold();
    // The trailing digit is dropped too — the user typed 1.2.3 and holds 1.2% with no error.
    expect(await dm.readThreshold()).toBe('1.2%');
    expect(await dm.isThresholdInvalid()).toBe(false);
    expect(await dm.waitForCriteriaSaveEnabled()).toBe(true);
    await dm.discardReload(DM_OFFICE);
    expect(await dm.readThreshold()).toBe(baselineThreshold);
  });

  test('TC-DSM-CRT-022: A negative value silently loses its minus sign', async ({ dependencyGate }) => {
    dependencyGate([]);
    await dm.typeThreshold('-5');
    // The minus sign is refused at the keystroke; only the 5 lands.
    expect(await dm.readThreshold()).toBe('5');
    await dm.blurThreshold();
    // The user asked for a negative and holds a positive discount with no warning.
    expect(await dm.readThreshold()).toBe('5%');
    expect(await dm.isThresholdInvalid()).toBe(false);
    expect(await dm.waitForCriteriaSaveEnabled()).toBe(true);
    await dm.discardReload(DM_OFFICE);
    expect(await dm.readThreshold()).toBe(baselineThreshold);
  });

  test('TC-DSM-CRT-023: Leading zeros are dropped', async ({ dependencyGate }) => {
    dependencyGate([]);
    await dm.typeThreshold('007');
    expect(await dm.readThreshold()).toBe('007');
    await dm.blurThreshold();
    expect(await dm.readThreshold()).toBe('7%');
    expect(await dm.isThresholdInvalid()).toBe(false);
    await dm.discardReload(DM_OFFICE);
    expect(await dm.readThreshold()).toBe(baselineThreshold);
  });

  test('TC-DSM-CRT-024: Scientific notation is silently changed to a different number', async ({ dependencyGate }) => {
    dependencyGate([]);
    await dm.typeThreshold('1e2');
    // The letter is refused and the surviving digits close up.
    expect(await dm.readThreshold()).toBe('12');
    await dm.blurThreshold();
    // 1e2 means one hundred; the field holds twelve percent with no warning.
    expect(await dm.readThreshold()).toBe('12%');
    expect(await dm.isThresholdInvalid()).toBe(false);
    expect(await dm.waitForCriteriaSaveEnabled()).toBe(true);
    await dm.discardReload(DM_OFFICE);
    expect(await dm.readThreshold()).toBe(baselineThreshold);
  });

  test('TC-DSM-CRT-025: Clearing the threshold falls back to zero percent', async ({ dependencyGate }) => {
    dependencyGate([]);
    await dm.typeThreshold('');
    // The red state exists only while focus is in the empty field — read it before blur.
    expect(await dm.readThreshold()).toBe('');
    expect(await dm.isThresholdInvalid()).toBe(true);
    expect(await dm.isCriteriaSaveEnabled()).toBe(false);
    await dm.blurThreshold();
    expect(await dm.readThreshold()).toBe('0%');
    expect(await dm.isThresholdInvalid()).toBe(false);
    await dm.discardReload(DM_OFFICE);
    expect(await dm.readThreshold()).toBe(baselineThreshold);
  });

  test('TC-DSM-CRT-026: Undoing an edit returns Save to disabled', async ({ dependencyGate }) => {
    dependencyGate([]);
    expect(await dm.isCriteriaSaveEnabled()).toBe(false);
    const target = baselineDigits() === '20' ? '30' : '20';
    await dm.typeThreshold(target);
    await dm.blurThreshold();
    expect(await dm.readThreshold()).toBe(`${target}%`);
    expect(await dm.waitForCriteriaSaveEnabled()).toBe(true);
    // Retype the original. The comparison runs on blur, so Save is read only after it.
    await dm.typeThreshold(baselineDigits());
    await dm.blurThreshold();
    expect(await dm.readThreshold()).toBe(baselineThreshold);
    expect(await dm.waitForCriteriaSaveDisabled()).toBe(true);
  });
});
