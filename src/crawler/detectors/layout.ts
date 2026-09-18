/**
 * Does the screen hold together visually?
 *
 * Three signals a tester notices immediately and a functional test never does: the page scrolls
 * sideways, text is cut off by its own container, and two controls sit on top of each other so
 * one cannot be clicked. Everything else about layout needs a design opinion, so it is out of
 * scope here rather than guessed at.
 *
 * The overlap check runs in the browser against the elements the crawler already stamped, and is
 * capped — comparing every pair on a 400-element screen is quadratic and would dominate the crawl.
 */

import type { Detector, DetectorContext, Finding } from '../types';
import { REF_ATTRIBUTE } from '../discovery';
import { truncate } from './shared';

/** Below this, horizontal scroll is a rounding artefact rather than a broken layout. */
const OVERFLOW_TOLERANCE_PX = 12;

/** Two controls are only reported as colliding when the overlap is large enough to steal a click. */
const OVERLAP_MIN_AREA_RATIO = 0.35;

interface OverlapPair {
  a: string;
  b: string;
  ratio: number;
}

export const layoutDetector: Detector = {
  id: 'layout',
  description: 'Horizontal overflow, text clipped by its container, and controls that overlap.',
  phase: 'page-load',
  async run(context: DetectorContext): Promise<Finding[]> {
    const findings: Finding[] = [];
    const { audit, module, page } = context;

    if (audit.horizontalOverflowPx > OVERFLOW_TOLERANCE_PX) {
      findings.push({
        detector: 'layout',
        title: `Page scrolls sideways by ${audit.horizontalOverflowPx}px on ${module}`,
        expected:
          'The page fits its viewport width; only a table, diagram or code block scrolls horizontally, inside its own container.',
        actual: `The document is ${audit.horizontalOverflowPx}px wider than the viewport, so the whole page scrolls sideways.`,
        signature: 'layout:horizontal-overflow',
        severity: 'Minor',
        extraSteps: ['Scroll the page to the right and observe content beyond the viewport edge.'],
      });
    }

    if (audit.clippedTexts.length > 0) {
      findings.push({
        detector: 'layout',
        title: `Text is cut off by its container on ${module}`,
        expected: 'Text either fits, wraps, or is truncated deliberately with an ellipsis and a full value on hover.',
        actual: `${audit.clippedTexts.length} element(s) hide overflowing text with no ellipsis: ${truncate(audit.clippedTexts.slice(0, 3).join(' | '), 200)}`,
        signature: 'layout:clipped-text',
        severity: 'Minor',
      });
    }

    const overlaps = await findOverlaps(page);
    if (overlaps.length > 0) {
      const worst = overlaps[0];
      findings.push({
        detector: 'layout',
        title: `Interactive elements overlap on ${module}`,
        expected: 'Controls do not sit on top of one another — an overlapped control cannot be clicked reliably.',
        actual: `${overlaps.length} overlapping pair(s). Worst: ${worst?.a} over ${worst?.b} (${Math.round((worst?.ratio ?? 0) * 100)}% covered).`,
        signature: 'layout:overlapping-controls',
        severity: 'Minor',
      });
    }

    return findings;
  },
};

/**
 * Overlapping interactive elements, computed in the browser.
 *
 * Ancestor/descendant pairs are excluded — a button inside a link legitimately covers it — and
 * so are elements the browser reports as hidden behind a modal, which is a state, not a defect.
 */
async function findOverlaps(page: DetectorContext['page']): Promise<OverlapPair[]> {
  try {
    return await page.evaluate((refAttribute: string) => {
      const nodes = Array.from(document.querySelectorAll(`[${refAttribute}]`)) as HTMLElement[];
      const MAX_COMPARE = 60;
      const candidates = nodes
        .filter((node) => {
          const rect = node.getBoundingClientRect();
          return rect.width > 4 && rect.height > 4;
        })
        .slice(0, MAX_COMPARE);

      const describe = (node: HTMLElement): string => {
        const text = (node.innerText || node.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
        return `${node.tagName.toLowerCase()}${text ? ` "${text.slice(0, 40)}"` : ''}`;
      };

      const pairs: Array<{ a: string; b: string; ratio: number }> = [];
      for (let i = 0; i < candidates.length; i += 1) {
        for (let j = i + 1; j < candidates.length; j += 1) {
          const first = candidates[i];
          const second = candidates[j];
          if (!first || !second) continue;
          if (first.contains(second) || second.contains(first)) continue;

          const a = first.getBoundingClientRect();
          const b = second.getBoundingClientRect();
          const overlapWidth = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const overlapHeight = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (overlapWidth <= 0 || overlapHeight <= 0) continue;

          const overlapArea = overlapWidth * overlapHeight;
          const smallest = Math.min(a.width * a.height, b.width * b.height);
          if (smallest <= 0) continue;
          const ratio = overlapArea / smallest;
          if (ratio < 0.35) continue;

          pairs.push({ a: describe(first), b: describe(second), ratio });
          if (pairs.length >= 5) return pairs.sort((x, y) => y.ratio - x.ratio);
        }
      }
      return pairs.sort((x, y) => y.ratio - x.ratio);
    }, REF_ATTRIBUTE);
  } catch {
    // A page that navigates mid-evaluate costs one missing check, not a failed crawl.
    return [];
  }
}

/** Exported for the unit tests — the threshold the in-page check applies. */
export const LAYOUT_THRESHOLDS = {
  overflowTolerancePx: OVERFLOW_TOLERANCE_PX,
  overlapMinAreaRatio: OVERLAP_MIN_AREA_RATIO,
};
