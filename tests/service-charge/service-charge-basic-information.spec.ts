import { test, expect } from '../../src/fixtures/pages.fixture';
import { ServiceChargePage } from '../../src/pages/service-charge/service-charge.page';
import {
  SC_OFFICE,
  SC_ROW_COUNT,
  SC_BASIC_COLUMN_HEADERS,
  SC_SERVICE_TYPE_INDEX,
} from '../../src/data/service-charge/service-charge';

/**
 * Service Charge — Basic Information tab (NM-3344).
 *
 * Per-test baseline: beforeEach restores the three mutated rows (Audio Conferencing,
 * APP Downloaded, Equipment Rental) to their recorded default values via ensureDefaultState,
 * then reads baselines fresh. Tests that perform a real save restore the original value
 * in the test body via try/finally.
 *
 * Save behavior: the app completes Save with no confirmation dialog on this page.
 * Restore paths call waitUntilLoaded() after clickSave() — no dialog to dismiss.
 */


const AUDIO_IDX = SC_SERVICE_TYPE_INDEX['Audio Conferencing'] as number; // 8
const APP_IDX   = SC_SERVICE_TYPE_INDEX['APP Downloaded']     as number; // 0
const EQ_IDX    = SC_SERVICE_TYPE_INDEX['Equipment Rental']   as number; // 23

test.describe('Service Charge Basic Information', () => {
  // Suite-wide ceiling: 120 s per test. TC-SVC-BAS-030 declares { timeout: 240_000 } to override.
  test.describe.configure({ timeout: 120_000 });

  let sc: ServiceChargePage;
  // Per-test observed baselines — read in beforeEach so no test depends on a hardcoded constant.
  let baselineAudio: string;
  let baselineApp: string;
  let baselineEq: string;

  /** Return a percentage value numerically different from `current`, in NN.NN format, within 0–100. */
  function differentPercentageFrom(current: string): string {
    const num = parseFloat(current);
    return (num >= 50 ? num - 10 : num + 10).toFixed(2);
  }

  test.beforeEach(async ({ authenticatedSession, config }) => {
    sc = new ServiceChargePage(authenticatedSession.page, config);
    await sc.goto(SC_OFFICE);

    // Restore the three rows this spec mutates to their recorded defaults (dated inventory
    // artifact: service-charge-basic-information-2026-08-10.md lines 46, 54, 69).
    await sc.ensureDefaultState([
      { rowIndex: APP_IDX, value: '0.00' },
      { rowIndex: AUDIO_IDX, value: '24.00' },
      { rowIndex: EQ_IDX, value: '24.00' },
    ]);

    baselineAudio = await sc.getPercentageByIndex(AUDIO_IDX);
    baselineApp = await sc.getPercentageByIndex(APP_IDX);
    baselineEq = await sc.getPercentageByIndex(EQ_IDX);
  });

  // ---------------------------------------------------------------- positive acceptance

  test('TC-SVC-BAS-001: Editing a percentage field to a valid mid-range value is accepted', async ({
    dependencyGate,
  }) => {
    dependencyGate([]);

    // Read the live value before any edit so the restore target matches the actual database state.
    const originalAudio = await sc.getPercentageByIndex(AUDIO_IDX);

    await sc.setPercentageByIndex(AUDIO_IDX, differentPercentageFrom(originalAudio));
    expect(await sc.waitForSaveActive()).toBe(true);

    try {
      await sc.setPercentageByIndex(AUDIO_IDX, originalAudio);
      // When restoring to the original value the form registers a net-zero change and the app
      // disables Save — the database already holds the correct value, so no save is needed.
      try {
        await sc.waitForSaveActive(3000);
        await sc.clickSave();
        await sc.waitUntilLoaded();
      } catch {
        // Net-zero restore — database already holds the correct value.
      }
    } catch {
      throw new Error('TC-SVC-BAS-001: restore failed — environment may be dirty');
    }
  });

  test('TC-SVC-BAS-002: Editing a percentage field to 0.00 is accepted and enables Save', async ({
    dependencyGate,
  }) => {
    dependencyGate([]);

    // Read the live value before any edit so the restore target matches the actual database state.
    const originalAudio = await sc.getPercentageByIndex(AUDIO_IDX);

    await sc.setPercentageByIndex(AUDIO_IDX, '0.00');
    expect(await sc.waitForSaveActive()).toBe(true);

    try {
      await sc.setPercentageByIndex(AUDIO_IDX, originalAudio);
      // When restoring to the original value the form registers a net-zero change and the app
      // disables Save — the database already holds the correct value, so no save is needed.
      try {
        await sc.waitForSaveActive(3000);
        await sc.clickSave();
        await sc.waitUntilLoaded();
      } catch {
        // Net-zero restore — database already holds the correct value.
      }
    } catch {
      throw new Error('TC-SVC-BAS-002: restore failed');
    }
  });

  test('TC-SVC-BAS-003: Editing a percentage field to 100.00 is accepted', async ({
    dependencyGate,
    authenticatedSession,
  }) => {
    dependencyGate([]);

    const originalAudio = await sc.getPercentageByIndex(AUDIO_IDX);
    const input = authenticatedSession.page.locator(`[data-testid="service-charge-percentage-${AUDIO_IDX}"]`);

    await sc.setPercentageByIndex(AUDIO_IDX, '100.00');

    // Observed live: 100.00 is accepted — value shows "100.00 %", aria-invalid absent, Save enables.
    expect(await input.inputValue()).toContain('100.00');
    expect(await input.getAttribute('aria-invalid')).not.toBe('true');
    expect(await sc.waitForSaveActive()).toBe(true);

    try {
      await sc.setPercentageByIndex(AUDIO_IDX, originalAudio);
      try {
        await sc.waitForSaveActive(3000);
        await sc.clickSave();
        await sc.waitUntilLoaded();
      } catch {
        // Net-zero restore — database already holds the correct value.
      }
    } catch {
      throw new Error('TC-SVC-BAS-003: restore failed — environment may be dirty');
    }
  });

  // ---------------------------------------------------------------- persistence

  test('TC-SVC-BAS-004: Saved percentage value persists after page reload', async ({
    dependencyGate,
  }) => {
    dependencyGate([]);

    const editValue = differentPercentageFrom(baselineAudio);

    try {
      await sc.setPercentageByIndex(AUDIO_IDX, editValue);
      expect(await sc.waitForSaveActive()).toBe(true);
      await sc.clickSave();
      await sc.waitUntilLoaded();

      await sc.goto(SC_OFFICE);
      expect(await sc.getPercentageByIndex(AUDIO_IDX)).toContain(editValue);
    } finally {
      await sc.setPercentageByIndex(AUDIO_IDX, baselineAudio);
      try {
        await sc.waitForSaveActive(3000);
        await sc.clickSave();
        await sc.waitUntilLoaded();
      } catch {
        // Net-zero restore — database already holds the correct value.
      }
    }
  });

  // ---------------------------------------------------------------- boundary / negative

  test('TC-SVC-BAS-005: Entering a value just below zero (negative boundary)', async ({
    dependencyGate,
  }) => {
    dependencyGate([]);

    const input = await sc.typePercentageAndReadFocused(AUDIO_IDX, '-0.01');

    // Observed live: the value is refused while the field is still focused, and the app clears the
    // marking when focus leaves — so the check belongs here, before blurring. Save stays disabled.
    expect(input.value).toBe('-0.01');
    expect(input.invalid).toBe('true');
    await sc.moveAwayFromPercentageField();
    expect(await sc.waitForSaveInactive()).toBe(true);
  });

  test('TC-SVC-BAS-006: Entering a value just above 100', async ({
    dependencyGate,
  }) => {
    dependencyGate([]);

    const input = await sc.typePercentageAndReadFocused(AUDIO_IDX, '100.01');

    // Observed live: the value is refused while the field is still focused, and the app clears the
    // marking when focus leaves — so the check belongs here, before blurring. Save stays disabled.
    expect(input.value).toBe('100.01');
    expect(input.invalid).toBe('true');
    await sc.moveAwayFromPercentageField();
    expect(await sc.waitForSaveInactive()).toBe(true);
  });

  test('TC-SVC-BAS-007: Entering a value with three decimal places silently rounds to two', async ({
    dependencyGate,
    authenticatedSession,
  }) => {
    dependencyGate([]);

    const input = authenticatedSession.page.locator(`[data-testid="service-charge-percentage-${AUDIO_IDX}"]`);

    await sc.setPercentageByIndex(AUDIO_IDX, '24.005');

    // Observed live: 24.005 is silently rounded to "24.00 %" — the third decimal is discarded.
    // aria-invalid is absent; the validator treats the rounded value as valid.
    // Save state is not asserted: the rounded result equals the original "24.00 %" for Audio
    // Conferencing, producing a net-zero edit that keeps Save disabled.
    expect(await input.inputValue()).toBe('24.00 %');
    expect(await input.getAttribute('aria-invalid')).not.toBe('true');
  });

  test('TC-SVC-BAS-008: Reverting an edited field to its original value keeps Save disabled', async ({
    dependencyGate,
  }) => {
    dependencyGate([]);

    await sc.setPercentageByIndex(APP_IDX, differentPercentageFrom(baselineApp));
    await sc.setPercentageByIndex(APP_IDX, baselineApp);
    expect(await sc.waitForSaveInactive()).toBe(true);
  });

  test('TC-SVC-BAS-009: Entering alphabetic text into a percentage field is flagged while focused', async ({
    dependencyGate,
  }) => {
    dependencyGate([]);

    const input = await sc.typePercentageAndReadFocused(APP_IDX, 'abc');

    // Observed live: alpha characters are accepted while typing and marked invalid while focused.
    // Blur may restore the stored value and clear the flag, but Save remains disabled.
    expect(input.value).toBe('abc');
    expect(input.invalid).toBe('true');
    await sc.moveAwayFromPercentageField();
    expect(await sc.waitForSaveInactive()).toBe(true);
  });

  test('TC-SVC-BAS-010: Entering a malformed decimal value is flagged while focused', async ({
    dependencyGate,
  }) => {
    dependencyGate([]);

    const input = await sc.typePercentageAndReadFocused(AUDIO_IDX, '1.2.3');

    // Observed live: the value is kept verbatim and marked invalid while focused. Blur may restore
    // the stored value and clear the flag, but Save remains disabled.
    expect(input.value).toBe('1.2.3');
    expect(input.invalid).toBe('true');
    await sc.moveAwayFromPercentageField();
    expect(await sc.waitForSaveInactive()).toBe(true);
  });

  test('TC-SVC-BAS-011: Entering a negative number into a percentage field', async ({
    dependencyGate,
  }) => {
    dependencyGate([]);

    const input = await sc.typePercentageAndReadFocused(AUDIO_IDX, '-5');

    // Observed live: the value is refused while the field is still focused, and the app clears the
    // marking when focus leaves — so the check belongs here, before blurring. Save stays disabled.
    expect(input.value).toBe('-5');
    expect(input.invalid).toBe('true');
    await sc.moveAwayFromPercentageField();
    expect(await sc.waitForSaveInactive()).toBe(true);
  });

  test('TC-SVC-BAS-012: Entering a leading-zero number normalises to the standard format', async ({
    dependencyGate,
    authenticatedSession,
  }) => {
    dependencyGate([]);

    const input = authenticatedSession.page.locator(`[data-testid="service-charge-percentage-${APP_IDX}"]`);

    await sc.setPercentageByIndex(APP_IDX, '024');

    // Observed live: "024" is normalised to "24.00 %" — the leading zero is stripped and the
    // standard two-decimal format is applied. aria-invalid is absent; the value is accepted.
    expect(await input.inputValue()).toBe('24.00 %');
    expect(await input.getAttribute('aria-invalid')).not.toBe('true');
  });

  test('TC-SVC-BAS-013: Entering scientific notation is accepted by the validator', async ({
    dependencyGate,
    authenticatedSession,
  }) => {
    dependencyGate([]);

    const input = authenticatedSession.page.locator(`[data-testid="service-charge-percentage-${AUDIO_IDX}"]`);

    await sc.setPercentageByIndex(AUDIO_IDX, '2e1');

    // Observed live: aria-invalid is absent after entering "2e1" — the validator accepts
    // scientific notation as a valid numeric value.
    // The display format after normalisation was ambiguous in the probe and is not asserted.
    // Save state is not asserted: the probe for this value used eval injection rather than
    // the keyboard path, making the observed Save state unreliable to assert here.
    expect(await input.getAttribute('aria-invalid')).not.toBe('true');
  });

  test('TC-SVC-BAS-014: Clearing a percentage field completely is treated as valid by the validator', async ({
    dependencyGate,
    authenticatedSession,
  }) => {
    dependencyGate([]);

    const input = authenticatedSession.page.locator(`[data-testid="service-charge-percentage-${AUDIO_IDX}"]`);

    await sc.setPercentageByIndex(AUDIO_IDX, '');

    // Observed via keyboard path: Angular normalises an empty fill to "0.00 %" — the field
    // does not remain empty when cleared via keyboard. aria-invalid is absent.
    // (The eval-injection probe showed value="" but that bypassed Angular's normalisation;
    // the keyboard path is the authoritative observation for this test.)
    expect(await input.inputValue()).toBe('0.00 %');
    expect(await input.getAttribute('aria-invalid')).not.toBe('true');
  });

  test('TC-SVC-BAS-015: Entering whitespace only into a percentage field is treated as valid', async ({
    dependencyGate,
    authenticatedSession,
  }) => {
    dependencyGate([]);

    const input = authenticatedSession.page.locator(`[data-testid="service-charge-percentage-${AUDIO_IDX}"]`);

    await sc.setPercentageByIndex(AUDIO_IDX, '   ');

    // Observed live: whitespace is preserved in input.value and aria-invalid is absent — the
    // validator does not flag whitespace-only input as invalid.
    // Save state is not asserted: the probe observed this via eval injection rather than the
    // keyboard path, making the observed Save state unreliable to assert here.
    expect(await input.getAttribute('aria-invalid')).not.toBe('true');
  });

  test('TC-SVC-BAS-016: Pasting a very long numeric string is rejected by the validator', async ({
    dependencyGate,
  }) => {
    dependencyGate([]);

    const longNum = '12345678901234567890123456789012345678901234567890'; // 50 digits
    const input = await sc.typePercentageAndReadFocused(APP_IDX, longNum);

    // Observed live: the raw digits are preserved while focused and marked invalid. Blur may
    // restore the stored value, but Save remains disabled.
    expect(input.value).toBe(longNum);
    expect(input.invalid).toBe('true');
    await sc.moveAwayFromPercentageField();
    expect(await sc.waitForSaveInactive()).toBe(true);
  });

  test('TC-SVC-BAS-017: The percent suffix is part of input.value — the application renders it, not the user', async ({
    dependencyGate,
  }) => {
    dependencyGate([]);

    // Observed live: input.value carries the "%" sign at rest (e.g. "0.00 %") — the application
    // adds the suffix without any user input. The user types only the numeric part.
    const value = await sc.getPercentageByIndex(APP_IDX);
    expect(value).toContain(' %');
  });

  // ---------------------------------------------------------------- dirty state / save-cycle

  test('TC-SVC-BAS-018: Editing any percentage field enables the Save button', async ({
    dependencyGate,
  }) => {
    dependencyGate([]);

    expect(await sc.isSaveEnabled()).toBe(false);
    await sc.setPercentageByIndex(AUDIO_IDX, differentPercentageFrom(baselineAudio));
    expect(await sc.waitForSaveActive()).toBe(true);

    // Reload without saving — discards the unsaved edit.
    await sc.goto(SC_OFFICE);
    expect(await sc.isSaveEnabled()).toBe(false);
  });

  test('TC-SVC-BAS-019: Reverting an edited percentage field to its original value disables Save', async ({
    dependencyGate,
  }) => {
    dependencyGate([]);

    // Read the live value first so the revert targets the actual current DB value.
    const originalValue = await sc.getPercentageByIndex(AUDIO_IDX);

    await sc.setPercentageByIndex(AUDIO_IDX, differentPercentageFrom(originalValue));
    expect(await sc.waitForSaveActive()).toBe(true);

    await sc.setPercentageByIndex(AUDIO_IDX, originalValue);
    expect(await sc.waitForSaveInactive()).toBe(true);
  });

  test('TC-SVC-BAS-020: Saving an edited percentage field persists the new value after reload', async ({
    dependencyGate,
  }) => {
    dependencyGate([]);

    const editValue = differentPercentageFrom(baselineAudio);

    try {
      await sc.setPercentageByIndex(AUDIO_IDX, editValue);
      expect(await sc.waitForSaveActive()).toBe(true);
      await sc.clickSave();
      await sc.waitUntilLoaded();

      await sc.goto(SC_OFFICE);
      expect(await sc.getPercentageByIndex(AUDIO_IDX)).toContain(editValue);
    } finally {
      await sc.setPercentageByIndex(AUDIO_IDX, baselineAudio);
      try {
        await sc.waitForSaveActive(3000);
        await sc.clickSave();
        await sc.waitUntilLoaded();
      } catch {
        // Net-zero restore — database already holds the correct value.
      }
    }
  });

  test('TC-SVC-BAS-021: Overwriting an edited value before saving persists the second value', async ({
    dependencyGate,
  }) => {
    dependencyGate([]);

    const firstValue = differentPercentageFrom(baselineAudio);
    const secondValue = differentPercentageFrom(firstValue);

    try {
      await sc.setPercentageByIndex(AUDIO_IDX, firstValue);
      expect(await sc.waitForSaveActive()).toBe(true);
      await sc.setPercentageByIndex(AUDIO_IDX, secondValue);
      expect(await sc.isSaveEnabled()).toBe(true);

      await sc.clickSave();
      await sc.waitUntilLoaded();

      await sc.goto(SC_OFFICE);
      expect(await sc.getPercentageByIndex(AUDIO_IDX)).toContain(secondValue);
    } finally {
      await sc.setPercentageByIndex(AUDIO_IDX, baselineAudio);
      try {
        await sc.waitForSaveActive(3000);
        await sc.clickSave();
        await sc.waitUntilLoaded();
      } catch {
        // Net-zero restore — database already holds the correct value.
      }
    }
  });

  test('TC-SVC-BAS-022: Navigating away from the page with unsaved edits triggers a confirmation prompt', async ({
    dependencyGate,
    authenticatedSession,
  }) => {
    dependencyGate([]);
    const authPage = authenticatedSession.page;

    await sc.setPercentageByIndex(AUDIO_IDX, differentPercentageFrom(baselineAudio));
    expect(await sc.waitForSaveActive()).toBe(true);

    // Browser-back with a dirty field fires the browser's native leave-page dialog
    // (type "beforeunload"). Register a one-shot listener before navigating so we can
    // capture and dismiss it. Dismissing a beforeunload dialog cancels the navigation,
    // keeping the page in place. In-app tab navigation shows the application's own
    // "Unsaved changes" modal instead — that path is covered by TC-SVC-HIS-014.
    let dialogFired = false;
    let dialogType = '';
    authPage.once('dialog', async (dlg) => {
      dialogFired = true;
      dialogType = dlg.type();
      await dlg.dismiss().catch(() => {
        // The browser's default beforeunload handling may have already resolved
        // this dialog; the event still fired and we captured the type above.
      });
    });

    try {
      await authPage.goBack();
    } catch {
      // Navigation cancelled by the dismissed beforeunload dialog; the page stays.
    }

    expect(dialogFired).toBe(true);
    expect(dialogType).toBe('beforeunload');

    // Reload to discard the unsaved edit cleanly before the next test.
    await sc.goto(SC_OFFICE);
  });

  test('TC-SVC-BAS-023: Saving edits to multiple percentage fields in a single Save action', async ({
    dependencyGate,
  }) => {
    dependencyGate([]);

    // Derive from baselines read in beforeEach so the write values differ from current state.
    const editAudio = differentPercentageFrom(baselineAudio);
    const editEq = differentPercentageFrom(baselineEq);

    try {
      await sc.setPercentageByIndex(AUDIO_IDX, editAudio);
      await sc.setPercentageByIndex(EQ_IDX, editEq);

      // Typing into a second field can momentarily revert the first while the page
      // settles, so both values are confirmed before saving.
      const verifyAndReapply = async (): Promise<void> => {
        const audioNow = parseFloat((await sc.getPercentageByIndex(AUDIO_IDX)).replace('%', ''));
        const eqNow = parseFloat((await sc.getPercentageByIndex(EQ_IDX)).replace('%', ''));
        if (audioNow !== parseFloat(editAudio)) {
          await sc.setPercentageByIndex(AUDIO_IDX, editAudio);
        }
        if (eqNow !== parseFloat(editEq)) {
          await sc.setPercentageByIndex(EQ_IDX, editEq);
        }
      };
      await verifyAndReapply();

      // Assert both fields hold their intended values before saving
      const finalAudio = parseFloat((await sc.getPercentageByIndex(AUDIO_IDX)).replace('%', ''));
      const finalEq = parseFloat((await sc.getPercentageByIndex(EQ_IDX)).replace('%', ''));
      expect(finalAudio).toBe(parseFloat(editAudio));
      expect(finalEq).toBe(parseFloat(editEq));

      expect(await sc.isSaveEnabled()).toBe(true);

      await sc.clickSave();
      await sc.waitUntilLoaded();

      await sc.goto(SC_OFFICE);
      expect(await sc.getPercentageByIndex(AUDIO_IDX)).toContain(editAudio);
      expect(await sc.getPercentageByIndex(EQ_IDX)).toContain(editEq);
    } finally {
      await sc.setPercentageByIndex(AUDIO_IDX, baselineAudio);
      await sc.setPercentageByIndex(EQ_IDX, baselineEq);
      // If both restores create a net-zero change the app disables Save — the database already
      // holds the correct values, so no save is needed.
      try {
        await sc.waitForSaveActive(3000);
        await sc.clickSave();
        await sc.waitUntilLoaded();
      } catch {
        // Net-zero restore — database already holds the correct value.
      }
    }
  });

  // ---------------------------------------------------------------- read-only label column

  test('TC-SVC-BAS-024: Service Type column renders correct labels', async ({
    dependencyGate,
    authenticatedSession,
  }) => {
    dependencyGate([]);
    const authPage = authenticatedSession.page;

    // DOM row 0 is the column header; data rows start at 1.
    const label8 = (await authPage.getByRole('row').nth(AUDIO_IDX + 1).getByRole('cell').first().textContent() ?? '').trim();
    expect(label8).toBe('Audio Conferencing');

    const label0 = (await authPage.getByRole('row').nth(APP_IDX + 1).getByRole('cell').first().textContent() ?? '').trim();
    expect(label0).toBe('APP Downloaded');
  });

  test('TC-SVC-BAS-025: Clicking a Service Type label cell does not open any editor or dialog', async ({
    dependencyGate,
    authenticatedSession,
  }) => {
    dependencyGate([]);
    const authPage = authenticatedSession.page;

    await authPage.getByRole('row').nth(AUDIO_IDX + 1).getByRole('cell').first().click();
    expect(await sc.isSaveEnabled()).toBe(false);

    await authPage.getByRole('row').nth(APP_IDX + 1).getByRole('cell').first().click();
    expect(await sc.isSaveEnabled()).toBe(false);

    // Wait over a bounded window to confirm no dialog appears — a point-in-time snapshot
    // would miss a dialog that renders after a short delay.
    await expect(authPage.locator('[role="dialog"], [role="alertdialog"]')).not.toBeVisible({ timeout: 3000 });
  });

  // ---------------------------------------------------------------- save button state

  test('TC-SVC-BAS-026: Save button is disabled on page load with no edits', async ({
    dependencyGate,
  }) => {
    dependencyGate([]);
    expect(await sc.isSaveEnabled()).toBe(false);
  });

  test('TC-SVC-BAS-027: Save button enables after any percentage edit', async ({
    dependencyGate,
  }) => {
    dependencyGate([]);

    expect(await sc.isSaveEnabled()).toBe(false);
    await sc.setPercentageByIndex(AUDIO_IDX, differentPercentageFrom(baselineAudio));
    expect(await sc.waitForSaveActive()).toBe(true);

    await sc.goto(SC_OFFICE);
    expect(await sc.isSaveEnabled()).toBe(false);
  });

  // ---------------------------------------------------------------- render state

  test('TC-SVC-BAS-028: Column headers render with correct labels', async ({
    dependencyGate,
  }) => {
    dependencyGate([]);
    const headers = await sc.getBasicInfoHeaders();
    expect(headers).toEqual([...SC_BASIC_COLUMN_HEADERS]);
  });

  test('TC-SVC-BAS-029: All 79 rows render and a named row is readable', async ({
    dependencyGate,
    authenticatedSession,
  }) => {
    dependencyGate([]);
    const authPage = authenticatedSession.page;

    const rowCount = await authPage
      .locator('[data-testid^="service-charge-percentage-"]')
      .count();
    expect(rowCount).toBe(SC_ROW_COUNT);

    // Anchor on the row's own label content — not just its index — to confirm the row
    // at AUDIO_IDX is actually "Audio Conferencing" and the percentage is readable.
    const rowLabel = (await authPage.getByRole('row').nth(AUDIO_IDX + 1).getByRole('cell').first().textContent() ?? '').trim();
    expect(rowLabel).toBe('Audio Conferencing');

    const percentageValue = await sc.getPercentageByIndex(AUDIO_IDX);
    expect(percentageValue).toContain(' %');

    // FIXME: verify no pagination control or "load more" button is present — unconfirmed
    // against the live application; left unasserted as a known gap.
  });

  // ---------------------------------------------------------------- persistence (QUICK surface)

  test('TC-SVC-BAS-030: A saved value persists after page reload (surface persistence)', async ({
    dependencyGate,
  }) => {
    test.setTimeout(240_000);
    dependencyGate([]);

    const editValue = differentPercentageFrom(baselineAudio);

    try {
      await sc.setPercentageByIndex(AUDIO_IDX, editValue);
      expect(await sc.waitForSaveActive()).toBe(true);
      await sc.clickSave();
      await sc.waitUntilLoaded();

      await sc.goto(SC_OFFICE);
      expect(await sc.getPercentageByIndex(AUDIO_IDX)).toContain(editValue);

      // Walk confirmed: the Basic Information grid has two plain <th> elements ("Service Type",
      // "Service Charge Percentage") with no button or dropdown trigger inside them. Clicking
      // either header opens no menu and does not reorder rows. Assert the absence of sort controls.
      expect(await sc.page.locator('th button').count()).toBe(0);
      expect(await sc.page.locator('th [data-slot="dropdown-menu-trigger"]').count()).toBe(0);
    } finally {
      await sc.setPercentageByIndex(AUDIO_IDX, baselineAudio);
      try {
        await sc.waitForSaveActive(3000);
        await sc.clickSave();
        await sc.waitUntilLoaded();
      } catch {
        // Net-zero restore — database already holds the correct value.
      }
    }
  });
});
