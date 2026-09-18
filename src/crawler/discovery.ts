/**
 * Looking at the page: one in-browser pass that returns every interactive element plus a
 * page-level audit.
 *
 * Done as a single `page.evaluate` rather than as Playwright locator calls on purpose. A screen
 * in this application carries 300-500 candidate nodes; asking Playwright for each one's role,
 * name, box and disabled state is several hundred round trips and turns a 25-page crawl into an
 * hour. Inside the browser it is one traversal, and the crawler gets a snapshot it can reason
 * about offline — which is also what makes the decision of "what should a tester try next?"
 * cheap enough to make on every page.
 *
 * The pass stamps `data-sdet-ref` on each element it reports. That attribute is how the crawler
 * comes back to exactly the element it decided to interact with, instead of re-deriving a
 * selector that might match three. It is inert, is not a form value, and is gone on the next
 * navigation.
 */

import type { Page } from '@playwright/test';
import { Log } from '../utils/logger';
import type { DiscoveredElement, ElementKind, PageAudit } from './types';

export const REF_ATTRIBUTE = 'data-sdet-ref';

export interface PageSnapshot {
  elements: DiscoveredElement[];
  audit: PageAudit;
}

/** Elements are re-found by this, never by their reported `selector`. */
export function refSelector(ref: string): string {
  return `[${REF_ATTRIBUTE}="${ref}"]`;
}

/**
 * Text that should never reach a user. Kept in one list, used by the in-page scan and re-exported
 * so the content detector reports with the same vocabulary the scan found them by.
 */
export const SUSPECT_TEXT_PATTERNS: Array<{ label: string; source: string }> = [
  { label: 'unresolved value', source: '(^|\\s)(undefined|null|NaN|\\[object Object\\])(\\s|$|[.,!?])' },
  { label: 'invalid date', source: 'Invalid Date' },
  { label: 'unrendered i18n interpolation', source: '\\{\\{[^}]{1,60}\\}\\}' },
  { label: 'untranslated i18n key', source: '(^|\\s)[a-z][A-Za-z0-9]*(\\.[A-Za-z0-9_]+){2,}(\\s|$)' },
  { label: 'template literal leaked into the UI', source: '\\$\\{[^}]{1,60}\\}' },
  { label: 'raw error object', source: '(TypeError|ReferenceError|SyntaxError):\\s' },
];

/** Copy that means the screen failed, as opposed to an empty state that is working correctly. */
export const CRASH_BANNER_PATTERNS: string[] = [
  'Something went wrong',
  'Application error',
  'Unhandled Runtime Error',
  'Unexpected Application Error',
  'An error occurred while',
  'Internal Server Error',
  'Cannot read propert',
  'is not a function',
  'Minified React error',
  'ChunkLoadError',
  '500 - ',
  '502 Bad Gateway',
  '503 Service Unavailable',
];

/** Copy the application shows for a route that does not exist. */
export const NOT_FOUND_PATTERNS: string[] = [
  'Page not found',
  '404',
  'Not Found',
  'The page you are looking for',
  'does not exist',
  'You do not have access',
  'Access denied',
  'Unauthorized',
  'Forbidden',
];

interface ScanOptions {
  refAttribute: string;
  suspectPatterns: Array<{ label: string; source: string }>;
  crashPatterns: string[];
  maxElements: number;
}

/**
 * Collects the snapshot. Never throws: a page that navigates mid-evaluate, or a cross-origin
 * frame, must cost one empty snapshot and a log line, not the whole crawl.
 */
export async function scanPage(page: Page, maxElements = 400): Promise<PageSnapshot> {
  const options: ScanOptions = {
    refAttribute: REF_ATTRIBUTE,
    suspectPatterns: SUSPECT_TEXT_PATTERNS,
    crashPatterns: CRASH_BANNER_PATTERNS,
    maxElements,
  };

  try {
    return await page.evaluate(inPageScan, options);
  } catch (error) {
    Log.warn(`[crawler] page scan failed on ${page.url()}: ${(error as Error).message}`);
    return { elements: [], audit: emptyAudit() };
  }
}

export function emptyAudit(): PageAudit {
  return {
    title: '',
    headingCount: 0,
    h1Count: 0,
    horizontalOverflowPx: 0,
    duplicateIds: [],
    imagesWithoutAlt: 0,
    suspectTexts: [],
    zeroSizeInteractive: 0,
    clippedTexts: [],
    crashBanners: [],
    bodyTextLength: 0,
  };
}

/* ------------------------------------------------------------------ the in-page pass */

/**
 * Runs inside the browser. Self-contained by necessity — nothing from the module scope is in
 * scope here, so every helper is declared locally and every pattern arrives through `options`.
 */
function inPageScan(options: ScanOptions): PageSnapshot {
  const INTERACTIVE_SELECTOR = [
    'a[href]',
    'button',
    'input',
    'select',
    'textarea',
    '[role="button"]',
    '[role="link"]',
    '[role="tab"]',
    '[role="menuitem"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[role="combobox"]',
    '[role="listbox"]',
    '[role="searchbox"]',
    '[role="switch"]',
    '[role="option"]',
    '[role="spinbutton"]',
    '[role="textbox"]',
    '[contenteditable="true"]',
    '[onclick]',
    'form',
  ].join(',');

  const collapse = (text: string): string => text.replace(/\s+/g, ' ').trim();

  const isVisible = (element: Element): boolean => {
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  const ownText = (element: Element): string => {
    const text = (element as HTMLElement).innerText ?? element.textContent ?? '';
    return collapse(text).slice(0, 120);
  };

  /** A practical accessible-name computation: enough to name a control in a bug report. */
  const accessibleName = (element: Element): { name: string; labelled: boolean } => {
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel && collapse(ariaLabel)) return { name: collapse(ariaLabel), labelled: true };

    const labelledBy = element.getAttribute('aria-labelledby');
    if (labelledBy) {
      const parts = labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id))
        .filter((node): node is HTMLElement => node !== null)
        .map((node) => collapse(node.innerText || node.textContent || ''));
      const joined = collapse(parts.join(' '));
      if (joined) return { name: joined.slice(0, 120), labelled: true };
    }

    const id = element.getAttribute('id');
    if (id) {
      const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id.replace(/"/g, '\\"');
      const label = document.querySelector(`label[for="${escaped}"]`);
      if (label) {
        const text = collapse((label as HTMLElement).innerText || label.textContent || '');
        if (text) return { name: text.slice(0, 120), labelled: true };
      }
    }
    const wrappingLabel = element.closest('label');
    if (wrappingLabel) {
      const text = collapse((wrappingLabel as HTMLElement).innerText || '');
      if (text) return { name: text.slice(0, 120), labelled: true };
    }

    // Past this point nothing has NAMED the element; what follows only describes it, so a
    // screen reader has no announced label even where the report can print something.
    const text = ownText(element);
    if (text) return { name: text, labelled: false };

    for (const attribute of ['placeholder', 'title', 'alt', 'value', 'name']) {
      const raw = element.getAttribute(attribute);
      if (raw && collapse(raw)) return { name: collapse(raw).slice(0, 120), labelled: false };
    }
    return { name: '', labelled: false };
  };

  const cssPath = (element: Element): string => {
    const testid = element.getAttribute('data-testid');
    if (testid) return `[data-testid="${testid}"]`;
    const id = element.getAttribute('id');
    if (id && /^[A-Za-z][\w-]*$/.test(id)) return `#${id}`;

    const parts: string[] = [];
    let node: Element | null = element;
    let hops = 0;
    while (node && node.nodeType === 1 && hops < 4) {
      const tag = node.tagName.toLowerCase();
      if (tag === 'html' || tag === 'body') break;
      const parent: Element | null = node.parentElement;
      if (!parent) {
        parts.unshift(tag);
        break;
      }
      const sameTag = Array.from(parent.children).filter((child) => child.tagName === node!.tagName);
      const index = sameTag.indexOf(node) + 1;
      parts.unshift(sameTag.length > 1 ? `${tag}:nth-of-type(${index})` : tag);
      const parentTestid = parent.getAttribute('data-testid');
      if (parentTestid) {
        parts.unshift(`[data-testid="${parentTestid}"]`);
        break;
      }
      node = parent;
      hops += 1;
    }
    return parts.join(' > ');
  };

  const PAGINATION_WORDS = /\b(next|previous|prev|first page|last page|page \d+|go to page|›|‹|»|«)\b/i;
  const SORT_WORDS = /\b(sort|order by|ascending|descending)\b/i;
  const SEARCH_WORDS = /\b(search|find|filter|query)\b/i;

  const classify = (element: Element, name: string): ElementKind => {
    const tag = element.tagName.toLowerCase();
    const role = (element.getAttribute('role') || '').toLowerCase();
    const type = (element.getAttribute('type') || '').toLowerCase();

    if (tag === 'form') return 'form';
    if (role === 'tab') return 'tab';
    if (role === 'menuitem') return 'menuitem';
    if (role === 'checkbox' || role === 'switch' || (tag === 'input' && type === 'checkbox')) return 'checkbox';
    if (role === 'radio' || (tag === 'input' && type === 'radio')) return 'radio';
    if (tag === 'select' || role === 'combobox' || role === 'listbox') return 'select';
    if (tag === 'textarea') return 'textarea';

    if (element.getAttribute('aria-sort') !== null || (SORT_WORDS.test(name) && tag !== 'input')) return 'sort';

    if (tag === 'input') {
      if (type === 'search' || role === 'searchbox') return 'search';
      if (type === 'button' || type === 'submit' || type === 'reset') return 'button';
      if (type === 'hidden') return 'other';
      if (SEARCH_WORDS.test(name) || SEARCH_WORDS.test(element.getAttribute('placeholder') || '')) return 'search';
      return 'input';
    }
    if (role === 'searchbox' || role === 'textbox' || element.getAttribute('contenteditable') === 'true') return 'input';
    if (role === 'spinbutton') return 'input';

    if (PAGINATION_WORDS.test(name)) return 'pagination';
    if (tag === 'a') return 'link';
    if (tag === 'button' || role === 'button' || role === 'link' || role === 'option') return 'button';
    return 'other';
  };

  /* -- elements ------------------------------------------------------ */

  // Clear refs from an earlier pass on this same document, or a single-page app accumulates
  // stale ids and the crawler re-finds an element it never chose.
  document.querySelectorAll(`[${options.refAttribute}]`).forEach((node) => {
    node.removeAttribute(options.refAttribute);
  });

  const elements: DiscoveredElement[] = [];
  const candidates = Array.from(document.querySelectorAll(INTERACTIVE_SELECTOR));
  let zeroSizeInteractive = 0;
  let index = 0;

  for (const element of candidates) {
    if (elements.length >= options.maxElements) break;
    const tag = element.tagName.toLowerCase();
    const type = (element.getAttribute('type') || '').toLowerCase();
    if (tag === 'input' && type === 'hidden') continue;

    const rect = element.getBoundingClientRect();
    const visible = isVisible(element);
    if (!visible && tag !== 'form') {
      // A control that is present but cannot be seen is worth counting once as a layout signal;
      // it is not worth reporting individually, since a collapsed menu legitimately has many.
      if (rect.width === 0 && rect.height === 0 && tag !== 'form') zeroSizeInteractive += 1;
      continue;
    }

    const { name, labelled } = accessibleName(element);
    const kind = classify(element, name);
    if (kind === 'other' && tag !== 'form') continue;

    const ref = `e${index}`;
    index += 1;
    element.setAttribute(options.refAttribute, ref);

    const form = element.closest('form');
    const formRef = form && form !== element ? form.getAttribute(options.refAttribute) || '' : '';

    elements.push({
      ref,
      kind,
      tag,
      role: (element.getAttribute('role') || '').toLowerCase(),
      name,
      testid: element.getAttribute('data-testid') || '',
      href: element.getAttribute('href') || '',
      type,
      value: (element as HTMLInputElement).value ?? '',
      placeholder: element.getAttribute('placeholder') || '',
      disabled:
        element.hasAttribute('disabled') ||
        element.getAttribute('aria-disabled') === 'true',
      required:
        element.hasAttribute('required') || element.getAttribute('aria-required') === 'true',
      selected:
        element.getAttribute('aria-selected') === 'true' ||
        element.getAttribute('aria-pressed') === 'true' ||
        element.getAttribute('aria-current') === 'true' ||
        element.getAttribute('aria-current') === 'page' ||
        element.getAttribute('data-state') === 'active',
      visible,
      box: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        w: Math.round(rect.width),
        h: Math.round(rect.height),
      },
      selector: cssPath(element),
      labelled,
      formRef,
    });
  }

  /* -- page audit ---------------------------------------------------- */

  const seenIds = new Set<string>();
  const duplicateIds = new Set<string>();
  document.querySelectorAll('[id]').forEach((node) => {
    const id = node.getAttribute('id') || '';
    if (!id) return;
    if (seenIds.has(id)) duplicateIds.add(id);
    else seenIds.add(id);
  });

  let imagesWithoutAlt = 0;
  document.querySelectorAll('img').forEach((image) => {
    if (!image.hasAttribute('alt') && image.getAttribute('role') !== 'presentation') {
      if (isVisible(image)) imagesWithoutAlt += 1;
    }
  });

  const bodyText = collapse(document.body?.innerText || '');

  const suspectTexts: string[] = [];
  for (const pattern of options.suspectPatterns) {
    let regex: RegExp;
    try {
      regex = new RegExp(pattern.source, 'g');
    } catch {
      continue;
    }
    const matches = bodyText.match(regex);
    if (matches && matches.length > 0) {
      const sample = collapse(matches[0] ?? '').slice(0, 80);
      suspectTexts.push(`${pattern.label}: "${sample}" (${matches.length}x)`);
    }
  }

  const crashBanners: string[] = [];
  for (const phrase of options.crashPatterns) {
    if (bodyText.toLowerCase().includes(phrase.toLowerCase())) crashBanners.push(phrase);
  }

  // Clipping is only a defect when the container HIDES the overflow — a scrollable container
  // showing part of a long list is correct behaviour, not a layout bug.
  const clippedTexts: string[] = [];
  const textish = Array.from(document.querySelectorAll('h1,h2,h3,h4,label,button,a,td,th,span,p,li'));
  for (const node of textish) {
    if (clippedTexts.length >= 8) break;
    const element = node as HTMLElement;
    if (!isVisible(element)) continue;
    if (element.scrollWidth <= element.clientWidth + 6) continue;
    const overflow = window.getComputedStyle(element).overflowX;
    if (overflow !== 'hidden' && overflow !== 'clip') continue;
    if (window.getComputedStyle(element).textOverflow === 'ellipsis') continue; // deliberate truncation
    const text = collapse(element.innerText || '').slice(0, 60);
    if (text) clippedTexts.push(`${element.tagName.toLowerCase()}: "${text}"`);
  }

  const root = document.documentElement;
  const horizontalOverflowPx = Math.max(
    0,
    Math.round(Math.max(root.scrollWidth, document.body?.scrollWidth ?? 0) - root.clientWidth),
  );

  const audit: PageAudit = {
    title: collapse(document.title),
    headingCount: document.querySelectorAll('h1,h2,h3,h4,h5,h6').length,
    h1Count: document.querySelectorAll('h1').length,
    horizontalOverflowPx,
    duplicateIds: Array.from(duplicateIds).slice(0, 10),
    imagesWithoutAlt,
    suspectTexts,
    zeroSizeInteractive,
    clippedTexts,
    crashBanners,
    bodyTextLength: bodyText.length,
  };

  return { elements, audit };
}
