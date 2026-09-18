/**
 * Does the screen say the right things?
 *
 * The cheapest real bugs in any application are the ones where a value never made it to the
 * template: a cell reading "undefined", a date reading "Invalid Date", a heading still showing
 * `{{customer.name}}`. They are invisible to a test suite that asserts on ids and obvious to a
 * tester reading the screen — which is exactly the gap an exploratory crawler is for.
 *
 * The scan itself happens in-browser (see discovery.ts); this detector turns what it found into
 * findings, and separately checks the controls whose own copy is missing or meaningless.
 */

import type { Detector, DetectorContext, Finding } from '../types';
import { truncate } from './shared';

/** Button and link copy that tells the user nothing. */
const MEANINGLESS_LABELS = new Set([
  'click here', 'here', 'link', 'button', 'more', 'read more', 'go', 'ok', '...', '…', '-', '—',
  'untitled', 'label', 'text', 'n/a',
]);

export const placeholderTextDetector: Detector = {
  id: 'placeholder-text',
  description: 'Unresolved values, i18n keys or template fragments rendered as user-visible text.',
  phase: 'both',
  run(context: DetectorContext): Finding[] {
    const findings: Finding[] = [];

    for (const suspect of context.audit.suspectTexts) {
      const label = suspect.split(':')[0] ?? 'suspect text';
      findings.push({
        detector: 'placeholder-text',
        title: `${label} visible on ${context.module}`,
        expected: 'Every value shown to a user is a resolved, translated, formatted value.',
        actual: `The screen renders ${suspect}.`,
        signature: `text:${label}:${truncate(suspect, 60)}`,
        // A leaked "undefined" is a data bug the user sees; an i18n key is cosmetic by comparison.
        severity: /unresolved value|invalid date|raw error object/i.test(label) ? 'Major' : 'Minor',
        extraSteps: [`Read the page text and locate: ${truncate(suspect, 80)}`],
      });
    }

    // Controls whose copy exists but says nothing. Reported once per distinct label per screen,
    // because a table of twelve "..." menus is one design decision, not twelve defects.
    const seenLabels = new Set<string>();
    for (const element of context.elements) {
      if (element.kind !== 'link' && element.kind !== 'button') continue;
      const name = element.name.trim().toLowerCase();
      if (!name || !MEANINGLESS_LABELS.has(name)) continue;
      if (seenLabels.has(name)) continue;
      seenLabels.add(name);

      findings.push({
        detector: 'placeholder-text',
        title: `Control labelled "${element.name}" says nothing about what it does`,
        expected: 'A control names the action it performs, so it is understandable out of context.',
        actual: `A ${element.kind} on this screen is labelled "${element.name}".`,
        signature: `text:meaningless-label:${name}`,
        severity: 'Trivial',
        selector: element.selector,
        extraSteps: [`Locate the ${element.kind} labelled "${element.name}".`],
      });
      if (seenLabels.size >= 3) break;
    }

    return findings;
  },
};
