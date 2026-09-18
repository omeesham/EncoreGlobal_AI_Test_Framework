/**
 * Form validation and boundary behaviour — the only detectors that DRIVE the page.
 *
 * Everything else in this folder reads a snapshot. These two have to type, because validation is
 * a response and you cannot observe a response you never provoked. That makes them the detectors
 * with the most power to do damage, so the safety rules are explicit and enforced here rather
 * than assumed from the crawler:
 *
 *   - Fields are filled and then RESTORED to the value they had. Nothing is left behind.
 *   - Nothing is submitted unless `safety.allowWrites` is on. Read-only mode still gets real
 *     coverage, because client-side validation fires on blur, not on submit.
 *   - Fields inside a form whose submit control reads as destructive are skipped entirely.
 *
 * What is actually being judged: an application that ACCEPTS a value it should reject is a
 * validation defect, and an application that CRASHES on a boundary value is a stability defect.
 * An application that rejects a bad value cleanly is working, and is reported as nothing.
 */

import type { Page } from '@playwright/test';
import type { Detector, DetectorContext, DiscoveredElement, Finding } from '../types';
import { refSelector } from '../discovery';
import { nameMatches, nativeValidity, truncate, visibleValidationText } from './shared';

/** Fields probed per screen. A settings page has forty; probing all of them is a ten-minute page. */
const MAX_FIELDS_PER_PAGE = 4;

/** Types whose value space makes an "invalid" string meaningless (the browser already filters). */
const UNPROBEABLE_TYPES = new Set(['file', 'color', 'range', 'hidden', 'image', 'checkbox', 'radio', 'submit', 'button', 'reset']);

function isProbeableField(element: DiscoveredElement): boolean {
  if (element.disabled || !element.visible) return false;
  if (element.kind !== 'input' && element.kind !== 'textarea' && element.kind !== 'search') return false;
  if (UNPROBEABLE_TYPES.has(element.type)) return false;
  if (element.box.w < 20 || element.box.h < 8) return false;
  return true;
}

/** The valid value to offer a field, chosen by what the field appears to be for. */
export function pickValidValue(element: DiscoveredElement, table: Record<string, string>): string {
  const haystack = `${element.name} ${element.placeholder} ${element.testid} ${element.type}`.toLowerCase();
  for (const [key, value] of Object.entries(table)) {
    if (key === 'default') continue;
    if (haystack.includes(key)) return value;
  }
  if (element.type === 'number') return table['number'] ?? '1';
  if (element.type === 'email') return table['email'] ?? 'a@b.invalid';
  if (element.type === 'date') return table['date'] ?? '2030-01-01';
  return table['default'] ?? 'SDET probe';
}

/**
 * Whether a value SHOULD be rejected by this field.
 *
 * Only asserted where the field's own contract makes the answer certain — a numeric field handed
 * letters, an email field handed a string with no "@". Guessing beyond that produces confident
 * bug reports about business rules the crawler cannot know, which is worse than finding nothing.
 */
export function mustReject(element: DiscoveredElement, value: string): boolean {
  if (element.type === 'number' && !/^-?\d*\.?\d*$/.test(value.trim())) return true;
  if (element.type === 'email' && value.trim() !== '' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) return true;
  if (element.type === 'url' && value.trim() !== '' && !/^https?:\/\//i.test(value)) return true;
  return false;
}

/**
 * What identifies a field ACROSS screens.
 *
 * The field's own name, not the screen it is on: a shared pagination control that mangles input
 * is one component defect, and reporting it once per screen it appears on turns one fix into a
 * list of eight tickets. Where a field has no name at all, its type is the only honest
 * discriminator left, and the screen is added so two anonymous fields do not merge.
 */
function fieldIdentity(element: DiscoveredElement, module: string): string {
  const name = (element.name || element.placeholder || element.testid).trim().toLowerCase();
  return name ? `${element.type || 'text'}:${name}` : `${element.type || 'text'}:anonymous@${module}`;
}

/** Restores a field to what it held before the probe, so the crawl leaves no trace. */
async function restore(page: Page, selector: string, original: string): Promise<void> {
  try {
    await page.locator(selector).first().fill(original, { timeout: 3_000 });
  } catch {
    /* the field may have been re-rendered; nothing further to restore */
  }
}

/** Fields the crawler is allowed to touch on this page, given the safety configuration. */
function probeableFields(context: DetectorContext): DiscoveredElement[] {
  const { elements, config } = context;
  const fields = elements.filter(isProbeableField);
  if (config.safety.allowDestructive) return fields.slice(0, MAX_FIELDS_PER_PAGE);

  // A field sitting in the same form as a Delete control is left alone even in read-only mode:
  // typing is harmless, but a stray Enter key in a text field submits the form it belongs to.
  const destructiveForms = new Set(
    elements
      .filter(
        (element) =>
          (element.kind === 'button' || element.kind === 'link') &&
          nameMatches(element.name, config.safety.destructiveActionPatterns) !== null,
      )
      .map((element) => element.formRef)
      .filter((ref) => ref !== ''),
  );

  return fields.filter((field) => !destructiveForms.has(field.formRef)).slice(0, MAX_FIELDS_PER_PAGE);
}

export const formValidationDetector: Detector = {
  id: 'form-validation',
  description: 'Fields that accept a value their own type says is invalid, without telling the user.',
  phase: 'page-load',
  async run(context: DetectorContext): Promise<Finding[]> {
    const findings: Finding[] = [];
    const fields = probeableFields(context);
    if (fields.length === 0) return findings;

    const { page, config, module } = context;

    for (const field of fields) {
      const selector = refSelector(field.ref);
      const locator = page.locator(selector).first();
      let original = field.value;
      try {
        original = await locator.inputValue({ timeout: 2_000 });
      } catch {
        continue; // the element is gone or is not a value-bearing control — skip, do not guess
      }

      for (const invalid of config.testData.invalid) {
        if (!mustReject(field, invalid)) continue;
        try {
          await locator.fill(invalid, { timeout: 3_000 });
          await locator.blur({ timeout: 2_000 }).catch(() => undefined);
          await page.waitForTimeout(250);

          const validity = await nativeValidity(page, selector);
          const messages = await visibleValidationText(page);
          const readBack = await locator.inputValue({ timeout: 2_000 }).catch(() => '');

          // Three ways an application can legitimately reject: the browser's own constraint
          // validation, a visible message, or refusing to hold the value at all.
          const rejectedNatively = validity !== null && validity.valid === false;
          const rejectedVisibly = messages.length > 0;
          const rejectedByFiltering = readBack !== invalid;

          if (!rejectedNatively && !rejectedVisibly && !rejectedByFiltering) {
            findings.push({
              detector: 'form-validation',
              title: `Field "${truncate(field.name || field.placeholder || field.selector, 45)}" accepts invalid input`,
              expected: `A field of type "${field.type}" rejects "${truncate(invalid, 40)}" and tells the user why.`,
              actual: `The value was accepted and held, with no validation message anywhere on the page and no constraint-validation error.`,
              signature: `validation:accepts-invalid:${fieldIdentity(field, module)}`,
              severity: 'Major',
              selector: field.selector,
              extraSteps: [
                `Type ${JSON.stringify(invalid)} into the "${truncate(field.name || field.placeholder, 50)}" field.`,
                'Move focus out of the field.',
                'Observe that no validation message appears and the value is kept.',
              ],
            });
          }
        } catch {
          /* a field that cannot be filled is not a validation defect — the crawl moves on */
        } finally {
          await restore(page, selector, original);
        }
        break; // one decisive invalid value per field is enough to answer the question
      }
    }

    return findings;
  },
};

export const inputBoundaryDetector: Detector = {
  id: 'input-boundary',
  description: 'Boundary values that make the screen throw, hang, or silently mangle the input.',
  phase: 'page-load',
  async run(context: DetectorContext): Promise<Finding[]> {
    const findings: Finding[] = [];
    const fields = probeableFields(context);
    if (fields.length === 0) return findings;

    const { page, config, module } = context;
    // Boundary probing is about STABILITY, so the interesting evidence is what the page emits
    // while it happens — which means draining the signal collector around each probe, and the
    // crawler has already done that for the page. Errors surfacing here are attributed by the
    // console/network detectors on the next post-action pass; this detector owns the visible half.

    for (const field of fields.slice(0, 2)) {
      const selector = refSelector(field.ref);
      const locator = page.locator(selector).first();
      let original = '';
      try {
        original = await locator.inputValue({ timeout: 2_000 });
      } catch {
        continue;
      }

      const longValue = config.testData.boundary.find((value) => value.length > 100);
      if (!longValue) continue;

      try {
        await locator.fill(longValue, { timeout: 4_000 });
        await locator.blur({ timeout: 2_000 }).catch(() => undefined);
        await page.waitForTimeout(250);

        const readBack = await locator.inputValue({ timeout: 2_000 }).catch(() => '');
        const maxLength = await locator
          .getAttribute('maxlength', { timeout: 1_500 })
          .catch(() => null);

        // Truncation is only a defect when it is INVISIBLE: a maxlength attribute is a contract
        // the user's browser enforces and the user can see coming. Silent server-side or
        // JavaScript truncation is the one that loses data without saying so.
        if (readBack.length < longValue.length && maxLength === null) {
          findings.push({
            detector: 'input-boundary',
            title: `Field "${truncate(field.name || field.placeholder || field.selector, 45)}" silently truncates input`,
            expected:
              'A field that limits length declares it (maxlength, a counter, or a validation message) so the user knows the value was cut.',
            actual: `${longValue.length} characters were entered and the field kept ${readBack.length}, with no maxlength attribute and no message.`,
            signature: `boundary:silent-truncation:${fieldIdentity(field, module)}`,
            severity: 'Minor',
            selector: field.selector,
            extraSteps: [
              `Type ${longValue.length} characters into the "${truncate(field.name || field.placeholder, 50)}" field.`,
              `Observe that only ${readBack.length} characters are kept and nothing explains why.`,
            ],
          });
        }
      } catch (error) {
        // A fill that throws on a long value is itself the finding — the field became
        // unusable rather than simply refusing the input.
        findings.push({
          detector: 'input-boundary',
          title: `Field "${truncate(field.name || field.selector, 45)}" breaks on a long value`,
          expected: 'A field either accepts a long value or rejects it; it stays usable either way.',
          actual: `Entering ${longValue?.length ?? 0} characters failed: ${truncate((error as Error).message, 160)}`,
          signature: `boundary:fill-failed:${fieldIdentity(field, module)}`,
          severity: 'Major',
          selector: field.selector,
        });
      } finally {
        await restore(page, selector, original);
      }
    }

    return findings;
  },
};
