/**
 * The accessibility problems a sighted tester can still catch.
 *
 * Deliberately NOT a full WCAG audit — that is axe's job, and pretending otherwise would fill the
 * report with contrast ratios nobody asked this tool for. The scope here is the obvious,
 * high-confidence class: a control a screen reader cannot announce, a field with no label, an
 * image with no alternative, a page with no heading structure, duplicate ids that break every
 * `aria-labelledby` pointing at them.
 *
 * Each of these is reported once per screen with a count, never once per element, because the fix
 * is one component change and a list of forty rows is not a better bug report.
 */

import type { Detector, DetectorContext, Finding, DiscoveredElement } from '../types';
import { truncate } from './shared';

/** Controls whose accessible name comes from nothing a screen reader will announce. */
function isUnnamed(element: DiscoveredElement): boolean {
  return element.name.trim() === '';
}

/** A form control is "unlabelled" when nothing NAMES it — placeholder text alone does not. */
function isUnlabelledField(element: DiscoveredElement): boolean {
  const fieldKinds = ['input', 'textarea', 'select', 'search', 'checkbox', 'radio'];
  if (!fieldKinds.includes(element.kind)) return false;
  return !element.labelled;
}

export const missingLabelDetector: Detector = {
  id: 'missing-label',
  description: 'Form controls a screen reader cannot announce, because nothing names them.',
  phase: 'page-load',
  run(context: DetectorContext): Finding[] {
    const unlabelled = context.elements.filter(isUnlabelledField);
    if (unlabelled.length === 0) return [];

    const examples = unlabelled
      .slice(0, 5)
      .map((element) => {
        const hint = element.placeholder || element.name || element.testid || element.selector;
        return `${element.tag}${element.type ? `[type=${element.type}]` : ''} (${truncate(hint, 50)})`;
      })
      .join('; ');

    return [
      {
        detector: 'missing-label',
        title: `${unlabelled.length} form control(s) have no accessible label on ${context.module}`,
        expected:
          'Every form control is named by a <label for>, aria-label or aria-labelledby, so assistive technology can announce it.',
        actual: `${unlabelled.length} control(s) are named only by placeholder text or by nothing at all: ${examples}`,
        signature: 'a11y:unlabelled-fields',
        severity: 'Minor',
        selector: unlabelled[0]?.selector,
        extraSteps: ['Inspect the form controls listed above and confirm none carries a label association.'],
      },
    ];
  },
};

export const accessibilityDetector: Detector = {
  id: 'accessibility',
  description: 'Unnamed controls, missing image alternatives, absent headings, duplicate ids.',
  phase: 'page-load',
  run(context: DetectorContext): Finding[] {
    const findings: Finding[] = [];
    const { audit, elements, module } = context;

    const unnamedControls = elements.filter(
      (element) => (element.kind === 'button' || element.kind === 'link' || element.kind === 'tab') && isUnnamed(element),
    );
    if (unnamedControls.length > 0) {
      findings.push({
        detector: 'accessibility',
        title: `${unnamedControls.length} control(s) have no accessible name on ${module}`,
        expected: 'Every button, link and tab has text or an aria-label, so it can be announced and reached by voice.',
        actual: `${unnamedControls.length} control(s) announce as nothing. First: ${truncate(unnamedControls[0]?.selector ?? '', 90)}`,
        signature: 'a11y:unnamed-controls',
        severity: 'Minor',
        selector: unnamedControls[0]?.selector,
      });
    }

    if (audit.imagesWithoutAlt > 0) {
      findings.push({
        detector: 'accessibility',
        title: `${audit.imagesWithoutAlt} image(s) have no alt attribute on ${module}`,
        expected: 'Every visible image carries alt text, or is marked role="presentation" when decorative.',
        actual: `${audit.imagesWithoutAlt} visible image(s) have neither.`,
        signature: 'a11y:images-without-alt',
        severity: 'Minor',
      });
    }

    if (audit.h1Count === 0 && audit.bodyTextLength > 200) {
      findings.push({
        detector: 'accessibility',
        title: `Screen has no <h1> (${module})`,
        expected: 'Each screen has exactly one <h1> naming it, so heading navigation works.',
        actual:
          audit.headingCount === 0
            ? 'The page has no headings at all.'
            : `The page has ${audit.headingCount} heading(s) but no <h1>.`,
        signature: 'a11y:no-h1',
        severity: 'Trivial',
      });
    } else if (audit.h1Count > 1) {
      findings.push({
        detector: 'accessibility',
        title: `Screen has ${audit.h1Count} <h1> headings (${module})`,
        expected: 'A screen has exactly one <h1>, so its heading outline has a single root.',
        actual: `The page renders ${audit.h1Count} <h1> elements.`,
        signature: 'a11y:multiple-h1',
        severity: 'Trivial',
      });
    }

    if (audit.duplicateIds.length > 0) {
      findings.push({
        detector: 'accessibility',
        title: `Duplicate element ids on ${module}`,
        expected:
          'Element ids are unique — label/for, aria-labelledby and aria-describedby all resolve by id and silently bind to the first match otherwise.',
        actual: `Repeated id(s): ${audit.duplicateIds.slice(0, 6).join(', ')}`,
        signature: `a11y:duplicate-ids:${audit.duplicateIds.slice(0, 3).join(',')}`,
        severity: 'Minor',
      });
    }

    return findings;
  },
};
