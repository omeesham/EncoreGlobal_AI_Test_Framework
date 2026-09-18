/**
 * Helpers shared by the detectors.
 *
 * Anything here is used by more than one detector; anything used by exactly one lives with that
 * detector. Keeping the line there stops this file becoming the place where detector logic hides.
 */

import type { Page } from '@playwright/test';
import type { DiscoveredElement } from '../types';

/** Outer HTML of an element, capped. The evidence a reader needs, not the whole subtree. */
export async function domSnippet(page: Page, selector: string, max = 600): Promise<string | null> {
  try {
    const html = await page.locator(selector).first().evaluate((node) => node.outerHTML, undefined, {
      timeout: 2_000,
    });
    return typeof html === 'string' ? html.replace(/\s+/g, ' ').slice(0, max) : null;
  } catch {
    return null;
  }
}

/** Whole-word, case-insensitive match of any pattern against a control's accessible name. */
export function nameMatches(name: string, patterns: string[]): string | null {
  const haystack = ` ${name.toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
  for (const pattern of patterns) {
    const needle = ` ${pattern.toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
    if (haystack.includes(needle)) return pattern;
  }
  return null;
}

/** How a control is referred to in a bug title and in reproduction steps. */
export function describeElement(element: DiscoveredElement): string {
  const label = element.name ? `"${element.name}"` : `unnamed ${element.tag}`;
  return `${label} ${element.kind}`;
}

/**
 * Visible validation copy anywhere on the page.
 *
 * Deliberately broad — applications surface validation as `[role=alert]`, as a `.error` span, as
 * `aria-invalid` plus adjacent text, or as nothing at all. A detector asking "did the app tell
 * the user?" has to accept all of the conventional answers, or every well-behaved form using an
 * unusual one gets reported.
 */
export async function visibleValidationText(page: Page): Promise<string[]> {
  try {
    return await page.evaluate(() => {
      const selectors = [
        '[role="alert"]',
        '[aria-live="assertive"]',
        '[aria-live="polite"]',
        '[data-testid*="error" i]',
        '[class*="error" i]',
        '[class*="invalid" i]',
        '[class*="validation" i]',
        '.field-error',
        'p[id$="-error"]',
      ];
      const seen = new Set<string>();
      for (const selector of selectors) {
        for (const node of Array.from(document.querySelectorAll(selector))) {
          const element = node as HTMLElement;
          const style = window.getComputedStyle(element);
          if (style.display === 'none' || style.visibility === 'hidden') continue;
          const rect = element.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;
          const text = (element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim();
          if (text && text.length < 300) seen.add(text);
          if (seen.size >= 10) return Array.from(seen);
        }
      }
      return Array.from(seen);
    });
  } catch {
    return [];
  }
}

/** The browser's own constraint-validation verdict for a field, when the field has one. */
export async function nativeValidity(
  page: Page,
  selector: string,
): Promise<{ valid: boolean; message: string } | null> {
  try {
    return await page.locator(selector).first().evaluate((node) => {
      const field = node as HTMLInputElement;
      if (typeof field.checkValidity !== 'function') return null;
      return { valid: field.checkValidity(), message: field.validationMessage || '' };
    });
  } catch {
    return null;
  }
}

/** True when the page looks like it rendered nothing a user could act on. */
export function looksBlank(bodyTextLength: number, elementCount: number): boolean {
  return bodyTextLength < 40 && elementCount <= 1;
}

export function truncate(text: string, max = 200): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed.length > max ? `${collapsed.slice(0, max - 1)}…` : collapsed;
}
