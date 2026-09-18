// scripts/walk-coverage/lib/opener-bound-check.mjs
// Shared opener-bound postcondition check for enumerate-page.mjs and probe-archetype.mjs.
//
// Replaces the convicted page-wide overlay-counting mechanism with a signal bound to
// the trigger element that was actually clicked. Uses aria-controls (direct forward link)
// or aria-labelledby reverse link (content → trigger) to confirm rendered content.
//
// If the trigger exposes neither binding, returns ok:false — there is no fallback to
// counting, because counting cannot distinguish "this opener opened its content" from
// "an unrelated overlay appeared elsewhere on the page."
//
// aria-expanded alone is NEVER sufficient — it is the trigger reporting on itself.
// The expanded branch requires corroborating visible content bound via aria-labelledby,
// or a caller-supplied expectedContentLocator for non-standard openers.

/**
 * @typedef {Object} OpenerBoundOptions
 * @property {import('playwright').Locator} [expectedContentLocator] - Caller-supplied locator
 *   for the expected opened content. Used when the component provides neither aria-controls
 *   nor aria-labelledby (e.g. rich-text editor cells).
 */

/**
 * Check whether a clicked trigger element actually opened its controlled content.
 *
 * @param {import('playwright').Page} page - Playwright page handle
 * @param {import('playwright').Locator} triggerLocator - Locator for the trigger that was clicked
 * @param {OpenerBoundOptions} [options] - Optional overrides
 * @returns {Promise<{ok: boolean, reason: string, method: string, controlledId?: string}>}
 */
export async function checkOpenerBound(page, triggerLocator, options = {}) {
  const binding = await triggerLocator.evaluate(el => {
    const ariaControls = el.getAttribute('aria-controls');
    const ariaExpanded = el.getAttribute('aria-expanded');
    const triggerId = el.getAttribute('id');

    if (ariaControls) {
      // aria-controls may be a space-separated IDREF list; resolve the first one.
      const firstId = ariaControls.trim().split(/\s+/)[0];
      const controlled = document.getElementById(firstId);
      if (controlled) {
        const cs = getComputedStyle(controlled);
        const visible = cs.display !== 'none'
          && cs.visibility !== 'hidden'
          && controlled.offsetHeight > 0;
        return { bound: true, method: 'aria-controls', controlledId: firstId, visible };
      }
      // aria-controls present but referenced element not in DOM (e.g. portal not mounted yet)
      return { bound: true, method: 'aria-controls', controlledId: firstId, visible: false };
    }

    if (ariaExpanded !== null) {
      return {
        bound: true,
        method: 'aria-expanded',
        expanded: ariaExpanded === 'true',
        triggerId: triggerId || null,
      };
    }

    return { bound: false };
  });

  if (!binding.bound) {
    return { ok: false, reason: 'no-aria-binding', method: 'none' };
  }

  if (binding.method === 'aria-controls') {
    const reason = binding.visible ? 'controlled-visible' : 'controlled-not-visible';
    return { ok: binding.visible, reason, method: 'aria-controls', controlledId: binding.controlledId };
  }

  // --- aria-expanded branch: attribute alone is never sufficient ---

  if (!binding.expanded) {
    return { ok: false, reason: 'trigger-not-expanded', method: 'aria-expanded' };
  }

  // Trigger claims expanded — require corroborating rendered content.

  // Path A: caller-supplied expectedContentLocator (for non-standard openers like html-cell editor)
  if (options.expectedContentLocator) {
    const visible = await options.expectedContentLocator.first().isVisible().catch(() => false);
    if (visible) {
      return { ok: true, reason: 'expected-content-visible', method: 'aria-expanded+expectedContent' };
    }
    return { ok: false, reason: 'expected-content-not-visible', method: 'aria-expanded+expectedContent' };
  }

  // Path B: reverse link via aria-labelledby — content points back to trigger by id.
  if (!binding.triggerId) {
    return { ok: false, reason: 'trigger-expanded-but-no-id-for-reverse-link', method: 'aria-expanded' };
  }

  // Search for a visible content container whose aria-labelledby matches the trigger's id.
  const contentSelector = [
    '[role="menu"]',
    '[role="listbox"]',
    '[role="dialog"]',
    '[data-radix-popper-content-wrapper]',
    '[data-radix-select-viewport]',
  ].map(s => `${s}[aria-labelledby="${binding.triggerId}"]`).join(', ');

  const labelledContentVisible = await page.evaluate((sel) => {
    const els = document.querySelectorAll(sel);
    for (const el of els) {
      const cs = getComputedStyle(el);
      if (cs.display !== 'none' && cs.visibility !== 'hidden' && el.offsetHeight > 0) {
        return true;
      }
    }
    return false;
  }, contentSelector);

  if (labelledContentVisible) {
    return { ok: true, reason: 'labelledby-content-visible', method: 'aria-expanded+labelledby' };
  }

  return { ok: false, reason: 'trigger-expanded-but-no-labelled-content-visible', method: 'aria-expanded' };
}
