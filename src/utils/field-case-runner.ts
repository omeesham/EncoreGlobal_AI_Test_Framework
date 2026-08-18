import { test } from '@playwright/test';

export interface FieldCase {
  id: string;
  label: string;
  baseline: () => Promise<void>;
  act: () => Promise<void>;
  expectBeforeSave?: () => Promise<void>;
  saveAndConfirm: () => Promise<void>;
  expectAfterSave?: () => Promise<void>;
  reload: () => Promise<void>;
  expectAfterReload: () => Promise<void>;
  cleanup?: () => Promise<void>;
}

/**
 * Failure isolation: cleanup runs in a finally-equivalent — even if expectAfterReload
 * throws, cleanup still attempts to restore state for the next case. If cleanup itself throws,
 * the original assertion error is preserved (Playwright still reports the test failure).
 */
export async function saveAndVerifyCase(c: FieldCase): Promise<void> {
  let primaryError: unknown = null;
  try {
    await test.step(`[${c.id}] Step 1: Reset the page to a clean starting state`, async () => {
      await c.baseline();
    });
    await test.step(`[${c.id}] Step 2: Make the change under test`, async () => {
      await c.act();
    });
    const expectBeforeSave = c.expectBeforeSave;
    if (expectBeforeSave) {
      await test.step(`[${c.id}] Step 3: Check the on-screen state before saving`, async () => {
        await expectBeforeSave();
      });
    }
    await test.step(`[${c.id}] Step 4: Save the change and confirm the dialog`, async () => {
      await c.saveAndConfirm();
    });
    const expectAfterSave = c.expectAfterSave;
    if (expectAfterSave) {
      await test.step(`[${c.id}] Step 5: Check the on-screen state after saving`, async () => {
        await expectAfterSave();
      });
    }
    await test.step(`[${c.id}] Step 6: Reload the page and confirm the value was saved`, async () => {
      await c.reload();
      await c.expectAfterReload();
    });
  } catch (err) {
    primaryError = err;
    throw err;
  } finally {
    const cleanup = c.cleanup;
    if (cleanup) {
      try {
        await test.step(`[${c.id}] Step 7: Restore the starting state for the next test`, async () => {
          await cleanup();
        });
      } catch (cleanupErr) {
        // eslint-disable-next-line no-unsafe-finally -- conditional throw only fires when primaryError is null, so there is no in-flight throw to override; otherwise the cleanup error is intentionally suppressed in favor of the primary assertion error.
        if (!primaryError) throw cleanupErr;
      }
    }
  }
}
