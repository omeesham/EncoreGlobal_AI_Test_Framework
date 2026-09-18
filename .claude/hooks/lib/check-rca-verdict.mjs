#!/usr/bin/env node
// check-rca-verdict.mjs — Stop-hook detector for RCA verdict-without-Agent-spawn.
//
// Closes structural gap P1 + P4 from the-rca-process-check-toasty-wilkes.md §14:
// the /rca skill upgrade taught mama-led orchestration but the agent can still
// ship a classification verdict in plain text without ever calling the Agent
// tool to spawn subagent A/B. This hook fires on Stop events and warns when a
// transcript window inside /rca contains verdict prose with zero Agent
// tool_use entries.
//
// MODES (dispatched by argv[2]):
//
//   --validate  Stop hook. Read transcript, locate the most-recent /rca window
//               (Skill tool_use with input.skill === "rca"), count verdict
//               tokens in assistant text vs Agent tool_use entries inside the
//               window. WARN + write state file when verdict>0 AND Agent===0.
//               Suppress on CRY FOR HELP / [OVERRIDE-REQUEST]. Always exits 0
//               (Stop hooks don't block — warning flows via stdout for the
//               harness + state file for /audit Step 2.8).
//
//   --self-test Synthetic fixtures, no I/O. Exits 0 on pass, 1 on fail.
//
// FAIL-OPEN: any uncaught exception logged to .claude/state/hook-failures.log;
// hook returns silent (Stop hooks don't carry permissionDecision).
//
// Companion: rca-verdict-gate.sh wrapper, .claude/state/rca-warnings-<sid>.json
// state file (one entry per Stop event), /audit Step 2.8 reads the state file
// and floors verdict to RED on any warning.

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { fireTelemetry, safeLoadTranscript } from "./hook-utils.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..", "..");
const STATE_DIR = join(REPO_ROOT, ".claude", "state");
const FAILURE_LOG = join(STATE_DIR, "hook-failures.log");

// Verdict tokens — case-insensitive shapes that imply the agent shipped an
// /rca classification or live-walk claim. Matched against assistant TEXT
// (typed-by-Claude prose, not tool inputs/results).
const VERDICT_TOKEN_PATTERNS = [
  /^##+\s*RCA\s*:/m,                                                     // "## RCA:" heading
  /^##+\s*Root Cause\b/im,                                                // "### Root Cause" heading
  /^##+\s*Classification\b/im,                                            // "### Classification" heading
  /\bclassification\s*:\s*["']?(test-code|app-bug|spec-out-of-date)\b/i,  // JSON-style verdict
  /\blive-verified\b/i,
  /\blive-walked\b/i,
  /\blive-walk\s*:\s*\[/i,                                                // "live-walk: [URL, ...]" slot filled
  /\bsubagent\s+[AB]\s+(confirmed|walked|verified|reported)\b/i,
  /\bmama\s+accepted\b/i,
  /\bmama'?s?\s+(verdict|judgment)\s*:\s*(accept|reject)/i,
];

// Suppression — legitimate escape hatches. If any of these appear in the same
// assistant message (or anywhere in the /rca window's assistant text), the
// verdict-without-Agent gate is bypassed: the agent is either crying for help
// (no verdict claim) or requesting override (intentional bypass).
const SUPPRESS_PATTERNS = [
  /\bCRY\s+FOR\s+HELP\b/i,
  /(?:^|\n)[\s`>*_-]*\[OVERRIDE-REQUEST\][\s`]*\S/,
];

// Scan window: walk back through transcript looking for /rca Skill call. We do
// NOT cap the lookback here — /rca windows can span many turns of mama
// orchestrating + judging subagents. The Skill-call boundary is the natural
// terminator; if the transcript is huge, the JSONL parse already amortizes.
// But we DO cap at MAX_MESSAGES to keep cost bounded on pathological cases.
const MAX_MESSAGES = 2000;

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

const mode = process.argv[2] || "";

if (mode === "--self-test") {
  runSelfTest();
} else {
  runHookMode(mode);
}

function runHookMode(modeArg) {
  let stdin = "";
  try {
    stdin = readFileSync(0, "utf8");
  } catch (e) {
    failOpen(`stdin read failed: ${e.message}`);
    return;
  }

  // Empty stdin → silent allow. Stop hooks routinely fire with no payload;
  // failOpen on empty would pollute hook-failures.log every Stop event.
  if (!stdin || !stdin.trim()) return;

  // Recursive-call guard (Stop hook may re-fire; bail when already active).
  if (/"stop_hook_active"\s*:\s*true/.test(stdin)) return;

  let payload;
  try {
    payload = JSON.parse(stdin);
  } catch (e) {
    failOpen(`stdin JSON parse failed: ${e.message}`);
    return;
  }

  const sessionId = payload.session_id || payload.sessionId || "unknown";
  const transcriptPath = payload.transcript_path || payload.transcriptPath || "";

  try {
    if (modeArg === "--validate") {
      handleValidate(payload, sessionId, transcriptPath);
    } else {
      failOpen(`unknown mode: ${modeArg}`);
    }
  } catch (e) {
    failOpen(`${modeArg} threw: ${e.message}`);
  }
}

// ---------------------------------------------------------------------------
// --validate: Stop hook. Locate /rca window, count verdict tokens vs Agent
// tool_use entries, warn + persist when verdict>0 AND Agent===0.
// ---------------------------------------------------------------------------

function handleValidate(payload, sessionId, transcriptPath) {
  const messages = safeLoadTranscript(transcriptPath);
  const window = findRcaWindow(messages);
  if (!window) return; // No /rca invocation in transcript → silent allow.

  const { startIdx, endIdx } = window;
  const slice = messages.slice(startIdx, endIdx);

  // Scan window for assistant text (verdict tokens + suppression tokens) and
  // count Agent tool_use entries.
  let verdictHits = 0;
  let agentCount = 0;
  let suppressed = false;
  const verdictSamples = [];

  for (const msg of slice) {
    if (!msg || !Array.isArray(msg.content)) continue;
    if (msg.role === "assistant") {
      for (const c of msg.content) {
        if (c?.type === "tool_use") {
          // Agent tool_use → counts as a subagent spawn.
          if (c.name === "Agent") agentCount++;
          continue;
        }
        if (c?.type !== "text" || typeof c.text !== "string") continue;
        const text = c.text;

        // Suppression check first — if the agent is crying for help OR
        // requesting override, verdict prose is intentional, not a manufactured
        // claim. Skip the warning entirely.
        for (const re of SUPPRESS_PATTERNS) {
          if (re.test(text)) { suppressed = true; break; }
        }
        if (suppressed) continue;

        // Verdict token scan.
        for (const re of VERDICT_TOKEN_PATTERNS) {
          const m = text.match(re);
          if (m) {
            verdictHits++;
            if (verdictSamples.length < 3) verdictSamples.push(m[0].slice(0, 80));
          }
        }
      }
    }
  }

  if (suppressed) return;          // legitimate escape hatch → silent
  if (verdictHits === 0) return;   // no claim shipped → silent
  if (agentCount > 0) return;      // verdict + spawn → mama-led, allow silently

  // FIRE: verdict tokens present + zero Agent spawns in this /rca window.
  ensureStateDir();
  const stateFile = join(STATE_DIR, `rca-warnings-${safeFilename(sessionId)}.json`);
  const entry = {
    timestamp: new Date().toISOString(),
    session_id: sessionId,
    rca_window: { start_message_idx: startIdx, end_message_idx: endIdx, length: slice.length },
    verdict_token_count: verdictHits,
    verdict_samples: verdictSamples,
    agent_tool_use_count: agentCount,
    transcript_path: transcriptPath || "",
  };
  appendStateEntry(stateFile, entry);
  fireTelemetry('rca-verdict-gate', 'warn', sessionId);

  // Emit single stdout line. Stop-hook stdout becomes a transcript note that
  // /audit Step 2.8 can read (alongside the state file).
  process.stdout.write(
    `[/rca WARN] ${verdictHits} verdict token(s) present in /rca window with ` +
      `zero Agent tool_use spawn — see .claude/skills/rca/SKILL.md "Mama-Led Orchestration". ` +
      `Warning persisted to ${shortPath(stateFile)}. ` +
      `Samples: ${verdictSamples.map((s) => JSON.stringify(s)).join(", ")}\n`
  );
}

// ---------------------------------------------------------------------------
// Window discovery — find most recent /rca Skill call; window extends until
// next Skill call with input.skill !== "rca" (or end of transcript).
// ---------------------------------------------------------------------------

function findRcaWindow(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return null;
  // Cap scan length to MAX_MESSAGES on pathological transcripts.
  const startScan = Math.max(0, messages.length - MAX_MESSAGES);

  // 1. Walk backward to find most-recent /rca Skill tool_use.
  let rcaStart = -1;
  for (let i = messages.length - 1; i >= startScan; i--) {
    const msg = messages[i];
    if (!msg || msg.role !== "assistant" || !Array.isArray(msg.content)) continue;
    for (const c of msg.content) {
      if (c?.type !== "tool_use") continue;
      if (c.name !== "Skill") continue;
      const skillName = (c.input?.skill || "").toLowerCase();
      if (skillName === "rca") { rcaStart = i; break; }
    }
    if (rcaStart !== -1) break;
  }
  if (rcaStart === -1) return null;

  // 2. Walk forward from rcaStart looking for next Skill tool_use with
  //    skill !== "rca" — that's the window terminator.
  let rcaEnd = messages.length; // default: extend to end of transcript
  for (let i = rcaStart + 1; i < messages.length; i++) {
    const msg = messages[i];
    if (!msg || msg.role !== "assistant" || !Array.isArray(msg.content)) continue;
    for (const c of msg.content) {
      if (c?.type !== "tool_use") continue;
      if (c.name !== "Skill") continue;
      const skillName = (c.input?.skill || "").toLowerCase();
      if (skillName && skillName !== "rca") { rcaEnd = i; break; }
    }
    if (rcaEnd !== messages.length) break;
  }

  return { startIdx: rcaStart, endIdx: rcaEnd };
}

// ---------------------------------------------------------------------------
// Transcript loading (JSONL — now provided by hook-utils.mjs safeLoadTranscript)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// State file I/O — append-style: each Stop event in an /rca window with a
// warning adds one entry to an array. Atomic write (tmp+rename).
// ---------------------------------------------------------------------------

function appendStateEntry(target, entry) {
  let existing = [];
  if (existsSync(target)) {
    try {
      const raw = readFileSync(target, "utf8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) existing = parsed;
      else if (parsed && Array.isArray(parsed.warnings)) existing = parsed.warnings;
    } catch {
      // Corrupted state file — start fresh; don't lose new warning.
      existing = [];
    }
  }
  existing.push(entry);
  atomicWrite(target, JSON.stringify(existing, null, 2));
}

function atomicWrite(target, contents) {
  const tmp = join(tmpdir(), `rca-warnings-${process.pid}-${Date.now()}.tmp`);
  writeFileSync(tmp, contents);
  renameSync(tmp, target);
}

function ensureStateDir() {
  if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
}

function safeFilename(s) {
  return String(s).replace(/[^a-zA-Z0-9._-]/g, "_");
}

function shortPath(p) {
  return p.replace(REPO_ROOT, "").replace(/\\/g, "/");
}

function failOpen(reason) {
  try {
    ensureStateDir();
    appendFileSync(FAILURE_LOG, `${new Date().toISOString()} check-rca-verdict.mjs ${reason}\n`);
  } catch {
    /* swallow — fail-OPEN must not throw */
  }
  // Stop hook: silent on failure (no permissionDecision to emit).
}

// ---------------------------------------------------------------------------
// --self-test: synthetic fixtures (no I/O). Exits 0 on pass, 1 on fail.
// ---------------------------------------------------------------------------

function runSelfTest() {
  const cases = [];

  // ---- VERDICT_TOKEN_PATTERNS coverage ----
  cases.push(["verdict: ## RCA: heading", () => anyVerdictMatch("## RCA: Classification is app-bug.")]);
  cases.push(["verdict: ### Root Cause heading", () => anyVerdictMatch("### Root Cause\nFoo bar.")]);
  cases.push(["verdict: ### Classification heading", () => anyVerdictMatch("### Classification\ntest-code")]);
  cases.push(["verdict: classification: test-code", () => anyVerdictMatch('classification: "test-code"')]);
  cases.push(["verdict: classification: app-bug", () => anyVerdictMatch("classification: app-bug")]);
  cases.push(["verdict: live-verified", () => anyVerdictMatch("Live-verified by B in 4 variations.")]);
  cases.push(["verdict: live-walked", () => anyVerdictMatch("B has live-walked the dashboard.")]);
  cases.push(["verdict: live-walk: [URL, ...]", () => anyVerdictMatch("live-walk: [https://x, DOM observed, network captured]")]);
  cases.push(["verdict: subagent B confirmed", () => anyVerdictMatch("Subagent B confirmed the toggle bug.")]);
  cases.push(["verdict: subagent A reported", () => anyVerdictMatch("Subagent A reported error-context at line 200.")]);
  cases.push(["verdict: mama accepted", () => anyVerdictMatch("Mama accepted B's findings.")]);
  cases.push(["verdict: mama's verdict: accept", () => anyVerdictMatch("Mama's verdict: accept on round 2.")]);

  cases.push(["verdict: plain prose no match", () => !anyVerdictMatch("Hello, the test fails because of timing.")]);
  cases.push(["verdict: mentions rca without verdict shape", () => !anyVerdictMatch("Let me run /rca on this failure.")]);

  // ---- SUPPRESS_PATTERNS coverage ----
  cases.push(["suppress: CRY FOR HELP", () => anySuppressMatch("[CRY FOR HELP — RCA-001]\nWhat we saw: nothing.")]);
  cases.push(["suppress: [OVERRIDE-REQUEST]", () => anySuppressMatch("[OVERRIDE-REQUEST] .claude/skills/rca/SKILL.md")]);
  cases.push(["suppress: plain text no match", () => !anySuppressMatch("Plain RCA verdict prose without suppression.")]);

  // ---- findRcaWindow ----
  cases.push([
    "window: simple /rca then end-of-transcript",
    () => {
      const msgs = [
        skillMsg("rca", "the-plan"),
        textMsg("assistant", "## RCA: app-bug"),
      ];
      const w = findRcaWindow(msgs);
      return w && w.startIdx === 0 && w.endIdx === 2;
    },
  ]);
  cases.push([
    "window: /rca terminated by /audit",
    () => {
      const msgs = [
        skillMsg("rca", "the-plan"),
        textMsg("assistant", "doing rca"),
        skillMsg("audit", ""),
        textMsg("assistant", "auditing"),
      ];
      const w = findRcaWindow(msgs);
      return w && w.startIdx === 0 && w.endIdx === 2;
    },
  ]);
  cases.push([
    "window: no /rca at all",
    () => {
      const msgs = [
        textMsg("user", "hello"),
        skillMsg("audit", ""),
        textMsg("assistant", "auditing"),
      ];
      return findRcaWindow(msgs) === null;
    },
  ]);
  cases.push([
    "window: nested /rca inside /execute — most-recent wins",
    () => {
      const msgs = [
        skillMsg("execute", "plan.md"),
        textMsg("assistant", "executing"),
        skillMsg("rca", ""),
        textMsg("assistant", "rcaing"),
      ];
      const w = findRcaWindow(msgs);
      return w && w.startIdx === 2 && w.endIdx === 4;
    },
  ]);

  // ---- Full pipeline (verdict + 0 Agent) ----
  cases.push([
    "fires: verdict without Agent",
    () => detectShouldWarn([
      skillMsg("rca", ""),
      textMsg("assistant", "## RCA: app-bug, live-verified by B."),
    ]),
  ]);
  cases.push([
    "silent: verdict WITH Agent spawn",
    () => !detectShouldWarn([
      skillMsg("rca", ""),
      agentMsg("explore"),
      textMsg("assistant", "Mama accepted B's findings: app-bug."),
    ]),
  ]);
  cases.push([
    "silent: Agent spawn no verdict",
    () => !detectShouldWarn([
      skillMsg("rca", ""),
      agentMsg("explore"),
      textMsg("assistant", "Still working on artifacts."),
    ]),
  ]);
  cases.push([
    "silent: neither verdict nor Agent",
    () => !detectShouldWarn([
      skillMsg("rca", ""),
      textMsg("assistant", "Reading the failure-summary.json file."),
    ]),
  ]);
  cases.push([
    "silent: CRY FOR HELP suppresses",
    () => !detectShouldWarn([
      skillMsg("rca", ""),
      textMsg("assistant", "## RCA: stuck after 3 spawns\n\n[CRY FOR HELP — RCA-001]\nWhat we saw: nothing."),
    ]),
  ]);
  cases.push([
    "silent: [OVERRIDE-REQUEST] suppresses",
    () => !detectShouldWarn([
      skillMsg("rca", ""),
      textMsg("assistant", "live-verified by B (audit retro)\n[OVERRIDE-REQUEST] .claude/skills/rca/SKILL.md"),
    ]),
  ]);
  cases.push([
    "fires: verdict in /rca window even if Agent was BEFORE /rca",
    () => detectShouldWarn([
      agentMsg("unrelated-before"),
      skillMsg("rca", ""),
      textMsg("assistant", "live-walked the form. classification: app-bug."),
    ]),
  ]);
  cases.push([
    "silent: outside /rca window (no /rca call)",
    () => !detectShouldWarn([
      textMsg("user", "hi"),
      textMsg("assistant", "## RCA: pretend verdict outside /rca scope, no spawn."),
    ]),
  ]);

  // ---- safeLoadTranscript: malformed JSONL ----
  cases.push([
    "transcript: malformed lines skipped",
    () => safeLoadTranscript("/nonexistent/path/file.jsonl").length === 0,
  ]);

  // ---- safeFilename ----
  cases.push([
    "safeFilename strips dangerous chars",
    () => safeFilename("abc/def\\ghi:jkl") === "abc_def_ghi_jkl",
  ]);

  // ---- Empty-stdin guard (§16 remediation — prevents JSON.parse failOpen noise) ----
  cases.push([
    "fail-OPEN: empty stdin is silent (not a JSON parse error)",
    () => {
      // Synthetic: simulate the no-payload Stop event. We can't easily test
      // runHookMode directly without fd-0 mocking, so this case asserts the
      // documented guard EXISTS in source (locks in the invariant; bash
      // wrapper has a sibling guard that catches before node startup).
      const src = readFileSync(fileURLToPath(import.meta.url), "utf8");
      return /if\s*\(!stdin\s*\|\|\s*!stdin\.trim\(\)\)\s*return/.test(src);
    },
  ]);

  // Run all cases.
  let passed = 0;
  let failed = 0;
  for (const [name, fn] of cases) {
    let result;
    try { result = !!fn(); }
    catch (e) { result = false; console.log(`FAIL: ${name} (threw: ${e.message})`); }
    if (result) { console.log(`PASS: ${name}`); passed++; }
    else { console.log(`FAIL: ${name}`); failed++; }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

// Test-helpers (only referenced by --self-test).

function anyVerdictMatch(text) {
  return VERDICT_TOKEN_PATTERNS.some((re) => re.test(text));
}

function anySuppressMatch(text) {
  return SUPPRESS_PATTERNS.some((re) => re.test(text));
}

function textMsg(role, text) {
  return { role, content: [{ type: "text", text }] };
}

function skillMsg(skill, args) {
  return {
    role: "assistant",
    content: [{ type: "tool_use", name: "Skill", input: { skill, args } }],
  };
}

function agentMsg(description) {
  return {
    role: "assistant",
    content: [{ type: "tool_use", name: "Agent", input: { description, prompt: "x" } }],
  };
}

// Synthetic dispatcher — returns true iff handleValidate would emit a warning.
// Mirrors the decision logic without doing I/O (state file write skipped).
function detectShouldWarn(messages) {
  const window = findRcaWindow(messages);
  if (!window) return false;
  const slice = messages.slice(window.startIdx, window.endIdx);
  let verdictHits = 0;
  let agentCount = 0;
  let suppressed = false;
  for (const msg of slice) {
    if (!msg || !Array.isArray(msg.content)) continue;
    if (msg.role !== "assistant") continue;
    for (const c of msg.content) {
      if (c?.type === "tool_use") {
        if (c.name === "Agent") agentCount++;
        continue;
      }
      if (c?.type !== "text" || typeof c.text !== "string") continue;
      for (const re of SUPPRESS_PATTERNS) {
        if (re.test(c.text)) { suppressed = true; break; }
      }
      if (suppressed) continue;
      for (const re of VERDICT_TOKEN_PATTERNS) {
        if (re.test(c.text)) verdictHits++;
      }
    }
  }
  if (suppressed) return false;
  if (verdictHits === 0) return false;
  if (agentCount > 0) return false;
  return true;
}
