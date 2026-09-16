// Append-only JSONL writes are safe across worker processes without explicit locking.
// Pure-additive: callers record outcomes; the telemetry never changes test behavior.

import * as fs from 'fs';
import * as path from 'path';

export type RetryLayer = 'click' | 'login' | 'validateState' | 'radix' | 'expectPoll' | 'perTest';

export interface AttemptRecord {
  attemptN: number;
  durationMs: number;
  outcome: 'pass' | 'fail';
}

export interface PerLayerStats {
  callCount: number;
  totalAttempts: number;
  recoveredAtAttempt: Record<number, number>;
  wastedAttempts: number;
  wastedMs: number;
  succeededOnFirstAttempt: number;
  failedAfterAllAttempts: number;
}

export type RetryStats = Partial<Record<RetryLayer, PerLayerStats>>;

interface JsonlEntry {
  layer: RetryLayer;
  attempts: AttemptRecord[];
  pid: number;
  ts: number;
}

const TELEMETRY_FILE = path.join(process.cwd(), 'reports', 'retry-telemetry.jsonl');

function ensureReportsDir(): void {
  const dir = path.dirname(TELEMETRY_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function recordCall(layer: RetryLayer, attempts: AttemptRecord[]): void {
  if (attempts.length === 0) return;
  try {
    ensureReportsDir();
    const entry: JsonlEntry = { layer, attempts, pid: process.pid, ts: Date.now() };
    fs.appendFileSync(TELEMETRY_FILE, JSON.stringify(entry) + '\n', 'utf-8');
  } catch {
    // telemetry must never break tests; swallow IO errors
  }
}

export function readAndAggregate(): RetryStats {
  const out: RetryStats = {};
  if (!fs.existsSync(TELEMETRY_FILE)) return out;

  let raw = '';
  try {
    raw = fs.readFileSync(TELEMETRY_FILE, 'utf-8');
  } catch {
    return out;
  }

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let entry: JsonlEntry;
    try {
      entry = JSON.parse(trimmed) as JsonlEntry;
    } catch {
      continue;
    }
    if (!entry || !Array.isArray(entry.attempts) || entry.attempts.length === 0) continue;

    let stats = out[entry.layer];
    if (!stats) {
      stats = {
        callCount: 0,
        totalAttempts: 0,
        recoveredAtAttempt: {},
        wastedAttempts: 0,
        wastedMs: 0,
        succeededOnFirstAttempt: 0,
        failedAfterAllAttempts: 0,
      };
      out[entry.layer] = stats;
    }
    stats.callCount += 1;
    stats.totalAttempts += entry.attempts.length;
    const passIdx = entry.attempts.findIndex(a => a.outcome === 'pass');
    if (passIdx === 0) {
      stats.succeededOnFirstAttempt += 1;
    } else if (passIdx > 0) {
      const passAttempt = entry.attempts[passIdx];
      if (passAttempt) {
        stats.recoveredAtAttempt[passAttempt.attemptN] = (stats.recoveredAtAttempt[passAttempt.attemptN] || 0) + 1;
      }
      for (let i = 0; i < passIdx; i++) {
        const att = entry.attempts[i];
        if (att) {
          stats.wastedAttempts += 1;
          stats.wastedMs += att.durationMs;
        }
      }
    } else {
      stats.failedAfterAllAttempts += 1;
      stats.wastedAttempts += entry.attempts.length;
      stats.wastedMs += entry.attempts.reduce((sum, a) => sum + a.durationMs, 0);
    }
  }

  return out;
}

export function reset(): void {
  try {
    if (fs.existsSync(TELEMETRY_FILE)) fs.unlinkSync(TELEMETRY_FILE);
  } catch {
    // telemetry must never break tests
  }
}
