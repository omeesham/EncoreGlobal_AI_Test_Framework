import type { Finding, Severity } from './types';

export const SEVERITIES: readonly Severity[] = ['Critical', 'High', 'Medium', 'Low'];

const RANK: Record<Severity, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };

export function isSeverity(value: string): value is Severity {
  return (SEVERITIES as readonly string[]).includes(value);
}

/** Most severe first, then by file and line. */
export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) =>
    RANK[a.severity] - RANK[b.severity] || a.file.localeCompare(b.file) || a.line - b.line);
}

export function countBySeverity(findings: Finding[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { Critical: 0, High: 0, Medium: 0, Low: 0 };
  for (const f of findings) counts[f.severity] += 1;
  return counts;
}

/** True when any finding is at or above the threshold (Critical is the highest). */
export function reachesThreshold(findings: Finding[], threshold: Severity): boolean {
  return findings.some((f) => RANK[f.severity] <= RANK[threshold]);
}
