// hook-utils.mjs — shared utilities for PreToolUse gates.
// Library only: registers nothing, denies nothing.
// fireTelemetry helper appends to gate-fires.log (LR-069 §3.4).
// Created by TICKET-fw-hookutils (P2-LOT11-02..06 extractions).

// Override window: env-configurable, default 3, hard ceiling 10 (not overridable by env).
const OVERRIDE_TURNS = Math.min(10, Math.max(1, parseInt(process.env.IDENTITY_OVERRIDE_TURNS ?? "3", 10) || 3));

// /execute detection window: scan last 200 messages (≈100 assistant turns) for the
// Skill invocation; cap prevents O(n) on very long sessions.
const EXECUTE_LOOKBACK = 200;

const OVERRIDE_AUTH_RX = /\b(override approved|override ok|approve override|authorized to override|i authorize|you are authorized)\b/i;
const OVERRIDE_REQUEST_RX = /(?:^|\n)[\s`>*_-]*\[OVERRIDE-REQUEST\][\s`]*\S/;
const BATCH_APPROVAL_RX = /^\s*\[OVERRIDE-EXPLICIT-APPROVAL-BATCH\]/m;

/**
 * Extract plain text from a Claude message content block.
 * Handles string, array-of-text-blocks, and null/undefined.
 */
export function textOf(content) {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  let out = "";
  for (const c of content) {
    if (typeof c === "string") { out += c + "\n"; continue; }
    if (c?.type === "text" && typeof c.text === "string") out += c.text + "\n";
  }
  return out;
}

/**
 * Detect whether an /execute skill is active in the transcript.
 * Walks backward from most recent message; /execute is "active" iff we encounter
 * a Skill tool_use of "execute" before a Skill tool_use of "final-q" (which
 * closes the /execute scope). Bounded by EXECUTE_LOOKBACK.
 * @param {Array} messages - parsed transcript messages
 */
export function isInExecuteContext(messages) {
  const start = messages.length - 1;
  const stop = Math.max(0, start - EXECUTE_LOOKBACK);
  for (let i = start; i >= stop; i--) {
    const msg = messages[i];
    if (!msg || msg.role !== "assistant") continue;
    const content = msg.content;
    if (!Array.isArray(content)) continue;
    for (const c of content) {
      if (c?.type !== "tool_use") continue;
      if (c.name !== "Skill") continue;
      const skillName = (c.input?.skill || "").toLowerCase();
      if (skillName === "final-q") return false;
      if (skillName === "execute") return true;
    }
  }
  return false;
}

/**
 * Check whether the transcript contains a valid override authorization.
 * Ordering enforced: auth (user) must appear AFTER request (assistant)
 * chronologically. Scanning backward, we encounter auth first; only accept
 * a request if auth was already seen. (P2-LOT11-09 security fix)
 * @param {Array} messages - parsed transcript messages
 * @param {string} targetPath - the path the override applies to
 */
export function hasOverrideAuthorization(messages, targetPath) {
  let sawAuth = false;
  let asstTurnCount = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === "assistant") {
      asstTurnCount++;
      if (asstTurnCount > OVERRIDE_TURNS) break;
      const t = textOf(msg.content);
      if (sawAuth && OVERRIDE_REQUEST_RX.test(t) && (!targetPath || t.includes(targetPath))) return true;
    } else if (msg.role === "user") {
      const t = textOf(msg.content);
      if (OVERRIDE_AUTH_RX.test(t) || BATCH_APPROVAL_RX.test(t)) sawAuth = true;
    }
  }
  return false;
}

export { EXECUTE_LOOKBACK };

/**
 * Load a JSONL transcript file into a messages array.
 * Each line is parsed as JSON; the `.message` envelope (if present) is unwrapped.
 * Lines that fail to parse are silently skipped. Returns [] on any I/O error.
 * @param {string} transcriptPath
 * @returns {Array}
 */
export function safeLoadTranscript(transcriptPath) {
  if (!transcriptPath || !existsSync(transcriptPath)) return [];
  try {
    const raw = readFileSync(transcriptPath, 'utf8');
    const messages = [];
    for (const line of raw.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line);
        const msg = obj.message ?? obj;
        if (msg && msg.role) messages.push(msg);
      } catch { /* skip bad line */ }
    }
    return messages;
  } catch {
    return [];
  }
}

// ── Fire telemetry (LR-069 §3.4) ─────────────────────────────────────────────

import { existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

/**
 * Append one CSV line to .claude/state/gate-fires.log.
 * Per LR-069 §3.4: every deny/announce/warn verdict must emit.
 * Fail-open: a telemetry failure must never affect the gate's verdict.
 *
 * @param {string} gate    — gate label (e.g. 'rca-verdict-gate')
 * @param {string} verdict — 'deny' | 'announce' | 'warn' | 'warn-deny'
 * @param {string} target  — repo-relative path, session-id, or description
 */
export function fireTelemetry(gate, verdict, target) {
  try {
    const stateDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'state');
    if (!existsSync(stateDir)) mkdirSync(stateDir, { recursive: true });
    appendFileSync(
      join(stateDir, 'gate-fires.log'),
      `${gate}, ${new Date().toISOString()}, ${verdict}, ${target}\n`
    );
  } catch { /* swallow — telemetry failure must never affect gate verdict */ }
}
