#!/usr/bin/env node
// check-bug-baseline.mjs — LR-034 baselineComparison enum gate (PreToolUse on Edit|Write|NotebookEdit).
//
// THE HOLE THIS CLOSES (GAP-C / RC-6)
//   BUG-*.json `baselineComparison` accepted free text — the 2026-06-18 Pricing session
//   filed BUG-LOC-PRI-001 with "not-yet-verified" (not an LR-034 enum value), classifying
//   a bug before the baseline was walked. This DENY gate rejects values outside the enum
//   and requires an existing baseline artifact for "regression-from-baseline".
//
// SCOPE: fires ONLY when tool_input.file_path resolves to
//   reports/bugs/BUG-*.json. Scans the NEW content fragment
//   (new_string / content / new_source). If the fragment does not touch
//   `baselineComparison`, the write is allowed (unrelated edit). For an Edit that
//   sets the value, the on-disk file is consulted as a fallback when looking for
//   the baselineEvidence reference.
//
// ENUM (LR-034): regression-from-baseline | intentional-UX-change | baseline-absent | not-checked
//
// FAIL-OPEN: any error → logged to .claude/state/hook-failures.log, returns allow.
//   A broken gate must never wedge the session.
//
// Companion: .claude/hooks/bug-baseline-gate.sh (wrapper, PreToolUse Edit|Write chain
//   in settings.json); tests in .claude/hooks/lib/test-bug-baseline-fixtures.mjs.
// Rule bodies: LR-034 (bug filing) + LR-044 (bug verification) + LR-045 (baseline-first).

import { readFileSync, existsSync, mkdirSync, appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { fireTelemetry } from "./hook-utils.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..", "..");
const STATE_DIR = join(REPO_ROOT, ".claude", "state");
const FAILURE_LOG = join(STATE_DIR, "hook-failures.log");

const MUTATION_TOOLS = new Set(["Edit", "Write", "NotebookEdit"]);

export const VALID_BASELINE_ENUM = [
  "regression-from-baseline",
  "intentional-UX-change",
  "baseline-absent",
  "not-checked",
];

// Flat-layout repo (no clients/<id>/ prefix): bug reports live at reports/bugs/BUG-*.json.
const BUG_PATH_RX = /(?:^|\/)reports\/bugs\/BUG-[^/]*\.json$/i;
const BASELINE_COMPARISON_RX = /"baselineComparison"\s*:\s*"([^"]*)"/;
const BASELINE_ARTIFACT_TOKEN_RX =
  /(?:specs_planning\/_internal\/)?old-site-baseline\/[\w.\-]+\.md/g;

export function toRepoRel(targetPath) {
  if (!targetPath) return "";
  const norm = String(targetPath).replace(/\\/g, "/");
  const rootNorm = REPO_ROOT.replace(/\\/g, "/").replace(/\/$/, "");
  if (norm.startsWith(rootNorm + "/")) return norm.slice(rootNorm.length + 1);
  return norm.replace(/^\.?\//, "");
}

export function extractNewContent(toolName, toolInput) {
  const out = [];
  if (!toolInput || typeof toolInput !== "object") return out;
  if (toolName === "Edit") {
    if (typeof toolInput.new_string === "string") out.push(toolInput.new_string);
  } else if (toolName === "Write") {
    if (typeof toolInput.content === "string") out.push(toolInput.content);
  } else if (toolName === "NotebookEdit") {
    if (typeof toolInput.new_source === "string") out.push(toolInput.new_source);
    else if (typeof toolInput.content === "string") out.push(toolInput.content);
  }
  return out;
}

export function extractBaselineComparison(text) {
  if (!text) return null;
  const m = String(text).match(BASELINE_COMPARISON_RX);
  return m ? m[1] : null;
}

// True iff some old-site-baseline artifact referenced in `text` exists on disk.
export function baselineArtifactReferenced(text, repoRoot = REPO_ROOT) {
  if (!text) return false;
  const re = new RegExp(BASELINE_ARTIFACT_TOKEN_RX.source, "g");
  let m;
  while ((m = re.exec(text)) !== null) {
    const tok = m[0];
    const rel = tok.startsWith("specs_planning/")
      ? tok
      : `specs_planning/_internal/${tok}`;
    if (existsSync(join(repoRoot, rel))) return true;
  }
  return false;
}

// Pure decision — testable without stdin/process. Returns
// { allow: boolean, reason?: string, value?: string }.
export function evaluate(payload, repoRoot = REPO_ROOT) {
  const toolName = payload.tool_name || payload.toolName || "";
  if (!MUTATION_TOOLS.has(toolName)) return { allow: true };

  const toolInput = payload.tool_input || payload.toolInput || {};
  const targetPath = toolInput.file_path || toolInput.notebook_path || toolInput.path || "";
  const rel = toRepoRel(targetPath);
  const pathMatch = rel.match(BUG_PATH_RX);
  if (!pathMatch) return { allow: true }; // not a bug file

  const fragments = extractNewContent(toolName, toolInput);
  for (const frag of fragments) {
    const value = extractBaselineComparison(frag);
    if (value === null) continue; // this fragment doesn't set baselineComparison

    if (!VALID_BASELINE_ENUM.includes(value)) {
      return {
        allow: false,
        value,
        reason:
          `LR-034: baselineComparison "${value}" in ${rel} is not a valid value. ` +
          `Use exactly one of: ${VALID_BASELINE_ENUM.join(" | ")}. ` +
          `Free-text like "not-yet-verified" is forbidden — a bug filed before the baseline ` +
          `was walked must be classified "not-checked" (honest), and reclassified after the ` +
          `Phase 0.5b baseline walk (LR-045 / LR-ENC-001). This is the 2026-06-18 Pricing ` +
          `BUG-LOC-PRI-001 mistake the gate prevents.`,
      };
    }

    if (value === "regression-from-baseline") {
      // Regression must cite a real baseline artifact (fragment OR on-disk file).
      let haystack = frag;
      try {
        if (targetPath && existsSync(targetPath)) haystack += "\n" + readFileSync(targetPath, "utf8");
      } catch {
        /* on-disk read best-effort */
      }
      if (!baselineArtifactReferenced(haystack, repoRoot)) {
        return {
          allow: false,
          value,
          reason:
            `LR-034: baselineComparison "regression-from-baseline" in ${rel} requires a ` +
            `baselineEvidence pointing to an EXISTING old-site-baseline artifact ` +
            `(specs_planning/_internal/old-site-baseline/<module>-<DATE>.md). ` +
            `None was found / it does not exist. Walk the baseline first (LR-045), emit the ` +
            `artifact, then classify regression. If you have not walked it, use "not-checked".`,
        };
      }
    }
  }
  return { allow: true };
}

// ---------------------------------------------------------------------------
// Hook entry point (skipped under import by the fixtures file)
// ---------------------------------------------------------------------------
const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly && process.argv[2] !== "--no-run") {
  runHook();
}

function runHook() {
  let payload;
  try {
    payload = JSON.parse(readFileSync(0, "utf8"));
  } catch (e) {
    failOpen(`stdin parse failed: ${e.message}`);
    return;
  }
  try {
    const verdict = evaluate(payload);
    if (verdict.allow) emitAllow();
    else emitDeny(verdict.reason);
  } catch (e) {
    failOpen(`evaluate threw: ${e.message}`);
  }
}

function emitAllow(reason) {
  const out = { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow" } };
  if (reason) out.hookSpecificOutput.permissionDecisionReason = reason;
  process.stdout.write(JSON.stringify(out));
}

function emitDeny(reason, target) {
  fireTelemetry('bug-baseline-gate', 'deny', target || 'session');
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    })
  );
}

function failOpen(reason) {
  try {
    if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
    appendFileSync(FAILURE_LOG, `${new Date().toISOString()} check-bug-baseline.mjs: ${reason}\n`);
  } catch {
    /* swallow — fail-OPEN must not throw */
  }
  emitAllow();
}
