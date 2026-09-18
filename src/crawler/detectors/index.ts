/**
 * The detector registry.
 *
 * One list, so adding a check means adding a file and one entry here — and so the report's
 * methodology section can state exactly what was looked for, generated from the same list that
 * did the looking rather than from a comment that drifts.
 */

import type { Detector, DetectorId } from '../types';
import {
  consoleErrorDetector,
  networkFailureDetector,
  pageCrashDetector,
  pageTitleDetector,
} from './page-health';
import { placeholderTextDetector } from './content';
import { accessibilityDetector, missingLabelDetector } from './accessibility';
import { layoutDetector } from './layout';
import { brokenLinkDetector, deadControlDetector, unexpectedRouteDetector } from './navigation';
import { formValidationDetector, inputBoundaryDetector } from './forms';

export const DETECTORS: Detector[] = [
  pageCrashDetector,
  consoleErrorDetector,
  networkFailureDetector,
  brokenLinkDetector,
  deadControlDetector,
  unexpectedRouteDetector,
  formValidationDetector,
  inputBoundaryDetector,
  placeholderTextDetector,
  missingLabelDetector,
  accessibilityDetector,
  layoutDetector,
  pageTitleDetector,
];

const BY_ID = new Map<DetectorId, Detector>(DETECTORS.map((detector) => [detector.id, detector]));

export function detectorById(id: DetectorId): Detector | undefined {
  return BY_ID.get(id);
}

/** The enabled detectors that run in a given phase, in registry order. */
export function detectorsForPhase(
  enabled: DetectorId[],
  phase: 'page-load' | 'post-action',
): Detector[] {
  const allowed = new Set(enabled);
  return DETECTORS.filter(
    (detector) => allowed.has(detector.id) && (detector.phase === phase || detector.phase === 'both'),
  );
}

export * from './shared';
