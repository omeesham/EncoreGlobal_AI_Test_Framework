import { test, type Page, type Locator } from '@playwright/test';
import { createHash } from 'crypto';
import { writeFileSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';

export interface RejectionOracleResult {
  announced: boolean;
  escapable: boolean;
  evidence: {
    ariaInvalid: string | null;
    inlineError: string | null;
    borderColor: string;
    staged: string;
    stagedLen: number;
    /** Which scope level produced the inline signal: 'aria-describedby' | 'field-wrapper' | 'page-wide' | 'none'. */
    announcedScope: string;
  };
}

export interface FieldCase {
  id: string;
  label: string;
  baseline: () => Promise<void>;
  act: () => Promise<void>;
  /** Oracle step for negative/BVA cases: assert the field announces rejection and allows natural blur. */
  rejectionOracle?: () => Promise<void>;
  expectBeforeSave?: () => Promise<void>;
  saveAndConfirm: () => Promise<void>;
  expectAfterSave?: () => Promise<void>;
  reload: () => Promise<void>;
  expectAfterReload: () => Promise<void>;
  cleanup?: () => Promise<void>;
}

/**
 * Returns the directory where rejection-oracle receipts are written.
 * This file lives at clients/encore/src/utils/field-case-runner.ts;
 * going up two levels reaches the client root (clients/encore/).
 */
export function deriveReceiptsDir(): string {
  return join(__dirname, '..', '..', '.test-evidence', 'rejected-inputs');
}

/**
 * Sample the current inline error signal for `field` at a single point in time.
 * Tries three scoping tiers in order, recording which tier produced the signal.
 * Called BEFORE and AFTER the action so ambient text cancels out via set-difference.
 *
 * Tiers:
 *   1. 'aria-describedby' — element(s) referenced by aria-describedby / aria-errormessage
 *   2. 'field-wrapper'    — nearest ancestor wrapper (field / form-group / mat-form-field)
 *   3. 'page-wide'        — broad p/span/small/[role="alert"]/[aria-live] sweep (last resort)
 *   4. 'none'             — no text signal found
 */
async function sampleAnnouncedSignal(
  page: Page,
  field: Locator,
): Promise<{ present: boolean; inlineError: string | null; scope: string }> {
  // Tier 1: aria-describedby / aria-errormessage
  const describedBy = await field.getAttribute('aria-describedby').catch(() => null);
  const errorMsg = await field.getAttribute('aria-errormessage').catch(() => null);
  const ariaRef = describedBy ?? errorMsg;
  if (ariaRef) {
    for (const id of ariaRef.split(/\s+/).filter(Boolean)) {
      const text = await page.locator(`#${id}`).textContent().catch(() => null);
      if (text !== null && text.trim().length > 0) {
        return { present: true, inlineError: text.trim(), scope: 'aria-describedby' };
      }
    }
  }

  // Tier 2: nearest ancestor field wrapper / form-group
  const wrapper = field.locator(
    'xpath=ancestor::*[contains(@class,"field") or contains(@class,"form-group") or contains(@class,"form-field") or contains(@class,"input-wrapper") or contains(@class,"mat-form-field")][1]',
  );
  if ((await wrapper.count().catch(() => 0)) > 0) {
    const errorEl = wrapper.locator('p, span.error, small, [role="alert"], [aria-live]');
    const wCount = await errorEl.count().catch(() => 0);
    for (let i = 0; i < wCount; i++) {
      const text = await errorEl.nth(i).textContent().catch(() => null);
      if (text !== null && text.trim().length > 0) {
        return { present: true, inlineError: text.trim(), scope: 'field-wrapper' };
      }
    }
  }

  // Tier 3: page-wide (last resort)
  const candidates = page.locator('p, span, small, [role="alert"], [aria-live]');
  const pCount = await candidates.count().catch(() => 0);
  for (let i = 0; i < pCount; i++) {
    const text = await candidates.nth(i).textContent().catch(() => null);
    if (text !== null && text.trim().length > 0) {
      return { present: true, inlineError: text.trim(), scope: 'page-wide' };
    }
  }

  return { present: false, inlineError: null, scope: 'none' };
}

/**
 * Assert the rejection oracle for a negative or BVA field case.
 *
 * The announced check is a TRANSITION, not a snapshot:
 *   1. Baseline is sampled BEFORE `action()` runs (aria-invalid + inline-error scope).
 *   2. `action()` enters the invalid value — the caller owns this step.
 *   3. Post-action state is polled 5 × 300 ms.
 *   4. `announced = true` only if something CHANGED after the action:
 *      - aria-invalid flipped from non-"true" → "true", OR
 *      - an inline error signal appeared that was absent before.
 *   Ambient page text (nav, grid cells, headers) is present in BOTH samples
 *   and cancels out, so it can no longer fake a pass.
 *
 * Checks:
 *   (a) Announced — see transition contract above.
 *   (b) Escapable — Tab blur moves focus away (no focus trap); recorded BEFORE any cleanup Escape.
 *
 * Writes a tamper-evident receipt to `clients/encore/.test-evidence/rejected-inputs/<caseId>.json`.
 * The receipt is bound to the spec file's content hash (spec_sha256) so stale receipts from
 * prior commits are detectable.
 *
 * @param page       Playwright Page.
 * @param field      Locator pointing at the field under test.
 * @param caseId     Case identifier used as the receipt filename (e.g. "TC-CPR-FCC-042").
 * @param fieldLabel Human-readable field name written into the receipt (e.g. "Max Discount").
 * @param value      The invalid / out-of-range value that was typed.
 * @param action     Async callback that enters the invalid value into the field. Called once between
 *                   the before-sample and the after-poll so the helper owns the full transition.
 * @param specFile   Optional absolute path to the spec file; defaults to `test.info().file`.
 */
export async function assertRejectionOracle(
  page: Page,
  field: Locator,
  caseId: string,
  fieldLabel: string,
  value: string,
  action: () => Promise<void>,
  specFile?: string,
): Promise<RejectionOracleResult> {
  // Sample baseline BEFORE action — ambient text present in both samples cancels out.
  const ariaInvalidBefore = await field.getAttribute('aria-invalid');
  const signalBefore = await sampleAnnouncedSignal(page, field);

  // Enter the invalid value.
  await action();

  // (a) Announced — poll 5 × 300 ms for a TRANSITION in aria-invalid or inline error.
  let announced = false;
  let ariaInvalid: string | null = null;
  let signalAfter: { present: boolean; inlineError: string | null; scope: string } = {
    present: false,
    inlineError: null,
    scope: 'none',
  };

  for (let attempt = 0; attempt < 5; attempt++) {
    ariaInvalid = await field.getAttribute('aria-invalid');
    signalAfter = await sampleAnnouncedSignal(page, field);
    if (
      (ariaInvalid === 'true' && ariaInvalidBefore !== 'true') ||
      (signalAfter.present && !signalBefore.present)
    ) {
      announced = true;
      break;
    }
    if (attempt < 4) await page.waitForTimeout(300);
  }

  // (b) Escapable — use real element identity, NOT placeholder string comparison.
  // Record BEFORE any cleanup Escape so a focus-trap is not masked.
  await field.focus();
  const handle = await field.elementHandle();
  if (!handle) {
    throw new Error(
      `[assertRejectionOracle] elementHandle() returned null for case ${caseId} — field may not be attached to DOM`,
    );
  }
  await page.keyboard.press('Tab');
  const escaped = await page.evaluate((el) => document.activeElement !== el, handle);
  await handle.dispose();

  // Staged value for evidence — inputValue() is valid only on <input>/<textarea>/<select>.
  let staged = '';
  try {
    staged = await field.inputValue();
  } catch {
    // Non-input widget (contenteditable / custom component): fall back to textContent for evidence.
    staged = (await field.textContent()) ?? '';
  }
  const stagedLen = staged.length;

  const result: RejectionOracleResult = {
    announced,
    escapable: escaped,
    evidence: {
      ariaInvalid,
      inlineError: signalAfter.inlineError,
      borderColor: '',
      staged,
      stagedLen,
      announcedScope: signalAfter.scope,
    },
  };

  // --- Write tamper-evident receipt ---
  const resolvedSpecFile = specFile ?? test.info().file;
  const specContent = readFileSync(resolvedSpecFile, 'utf-8');
  const specSha256 = createHash('sha256').update(specContent).digest('hex');

  // Self-hash mirrors coverage-manifest.mjs: strip receipt_sha256, hash body JSON + newline.
  const receiptBody = {
    case_id: caseId,
    field: fieldLabel,
    value,
    announced,
    escapable: escaped,
    spec_sha256: specSha256,
  };
  const bodyStr = JSON.stringify(receiptBody, null, 2) + '\n';
  const receiptSha256 = createHash('sha256').update(bodyStr).digest('hex');

  const receiptsDir = deriveReceiptsDir();
  mkdirSync(receiptsDir, { recursive: true });
  writeFileSync(
    join(receiptsDir, `${caseId}.json`),
    JSON.stringify({ ...receiptBody, receipt_sha256: receiptSha256 }, null, 2) + '\n',
    'utf-8',
  );

  return result;
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
    const rejectionOracle = c.rejectionOracle;
    if (rejectionOracle) {
      await test.step(`[${c.id}] Step 2b: Assert the field announces rejection and allows natural blur`, async () => {
        await rejectionOracle();
      });
    }
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
