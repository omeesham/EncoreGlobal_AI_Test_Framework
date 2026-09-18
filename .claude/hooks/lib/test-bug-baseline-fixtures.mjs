#!/usr/bin/env node
// test-bug-baseline-fixtures.mjs — fixtures for the LR-034 baselineComparison enum gate.
//
// Drives check-bug-baseline.mjs's pure evaluate() with synthetic PreToolUse payloads
// (no stdin, no process spawn) and asserts allow/deny. Run:
//   node .claude/hooks/lib/test-bug-baseline-fixtures.mjs
// Exits 0 on all-pass, 1 on any failure. Modeled on test-jargon-fixtures.mjs.

import { evaluate, extractBaselineComparison, VALID_BASELINE_ENUM } from "./check-bug-baseline.mjs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..", "..");
const abs = (rel) => join(REPO_ROOT, rel);
const bug = (rel) => abs(`reports/bugs/${rel}`);

const cases = [];
const add = (name, fn) => cases.push([name, fn]);

// ── DENY: the exact 2026-06-18 mistake + other invalid enums ──────────────────
add("DENY not-yet-verified (the BUG-LOC-PRI-001 value)", () => {
  const v = evaluate({
    tool_name: "Write",
    tool_input: { file_path: bug("BUG-LOC-PRI-001.json"), content: '{ "baselineComparison": "not-yet-verified" }' },
  });
  return v.allow === false && v.value === "not-yet-verified";
});
add("DENY arbitrary free-text value", () => {
  const v = evaluate({
    tool_name: "Edit",
    tool_input: { file_path: bug("BUG-LOC-ACC-001.json"), old_string: "x", new_string: '"baselineComparison": "TODO later"' },
  });
  return v.allow === false;
});
add("DENY empty-string value", () => {
  const v = evaluate({
    tool_name: "Write",
    tool_input: { file_path: bug("BUG-X-001.json"), content: '{"baselineComparison": ""}' },
  });
  return v.allow === false;
});
add("DENY regression-from-baseline with NO baseline artifact reference", () => {
  const v = evaluate({
    tool_name: "Write",
    tool_input: {
      file_path: bug("BUG-X-002.json"),
      content: '{"baselineComparison": "regression-from-baseline", "baselineEvidence": "TODO"}',
    },
  });
  return v.allow === false;
});
add("DENY regression citing a NON-existent old-site-baseline file", () => {
  const v = evaluate({
    tool_name: "Write",
    tool_input: {
      file_path: bug("BUG-X-003.json"),
      content:
        '{"baselineComparison":"regression-from-baseline","baselineEvidence":"specs_planning/_internal/old-site-baseline/does-not-exist-9999-99-99.md"}',
    },
  });
  return v.allow === false;
});

// ── ALLOW: valid enum values ─────────────────────────────────────────────────
add("ALLOW not-checked (honest pre-baseline classification)", () => {
  const v = evaluate({
    tool_name: "Write",
    tool_input: { file_path: bug("BUG-LOC-PRI-001.json"), content: '{ "baselineComparison": "not-checked" }' },
  });
  return v.allow === true;
});
add("ALLOW baseline-absent (net-new feature)", () => {
  const v = evaluate({
    tool_name: "Write",
    tool_input: { file_path: bug("BUG-X-004.json"), content: '{"baselineComparison":"baseline-absent"}' },
  });
  return v.allow === true;
});
add("ALLOW intentional-UX-change", () => {
  const v = evaluate({
    tool_name: "Edit",
    tool_input: { file_path: bug("BUG-X-005.json"), old_string: "x", new_string: '"baselineComparison": "intentional-UX-change"' },
  });
  return v.allow === true;
});

// ── ALLOW: edits that don't touch baselineComparison ─────────────────────────
add("ALLOW edit not touching baselineComparison", () => {
  const v = evaluate({
    tool_name: "Edit",
    tool_input: { file_path: bug("BUG-LOC-PRI-001.json"), old_string: '"severity": "high"', new_string: '"severity": "medium"' },
  });
  return v.allow === true;
});

// ── ALLOW: non-bug paths + non-mutation + malformed ──────────────────────────
add("ALLOW non-bug json (some other reports file)", () => {
  const v = evaluate({
    tool_name: "Write",
    tool_input: { file_path: abs("reports/summary.json"), content: '{"baselineComparison":"not-yet-verified"}' },
  });
  return v.allow === true;
});
add("ALLOW non-mutation tool (Read)", () => {
  const v = evaluate({ tool_name: "Read", tool_input: { file_path: bug("BUG-X-006.json") } });
  return v.allow === true;
});
add("ALLOW malformed payload (no tool_input)", () => {
  const v = evaluate({ tool_name: "Edit" });
  return v.allow === true;
});

// ── Unit: extractBaselineComparison + enum constant ──────────────────────────
add("extractBaselineComparison pulls the value", () => {
  return extractBaselineComparison('foo "baselineComparison":  "not-checked" bar') === "not-checked";
});
add("extractBaselineComparison null when absent", () => {
  return extractBaselineComparison('{"severity":"high"}') === null;
});
add("enum constant has exactly the 4 LR-034 values", () => {
  return VALID_BASELINE_ENUM.length === 4 && VALID_BASELINE_ENUM.includes("not-checked");
});

let passed = 0;
let failed = 0;
for (const [name, fn] of cases) {
  let ok = false;
  try {
    ok = !!fn();
  } catch (e) {
    ok = false;
    console.log(`  (${name} threw: ${e.message})`);
  }
  if (ok) {
    passed++;
    console.log(`PASS ${name}`);
  } else {
    failed++;
    console.log(`FAIL ${name}`);
  }
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
