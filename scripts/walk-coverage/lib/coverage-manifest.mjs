// scripts/walk-coverage/lib/coverage-manifest.mjs
// PLAN_EXHAUSTIVE_WALK_GUARANTEE — Phase 4 shared coverage-completeness logic.
//
// ONE source of truth for "is this walk artifact's Coverage Manifest complete?", imported by BOTH
// enforcement layers so they can never drift:
//   - scripts/validate-plan-closure.mjs  → closure check Cx (PREVENTIVE; DENIES Status: DONE)
//   - .claude/hooks/lib/check-execution-completion.mjs → 2nd decision branch (DETECTIVE; Stop warn)
//
// A walk artifact (field-inventory / old-site-baseline) is COMPLETE only when its frontmatter shows
// Coverage_Ratio = 100%, CrossCheck = clean, no `coverageScope: PARTIAL`, and zero undispositioned
// manifest rows (LR-062 / M3). Artifacts whose MCP_Session_Date precedes the landing date are
// GRANDFATHERED (not applicable until their next refresh). Artifacts with no Coverage Manifest at
// all are likewise not-applicable (they never opted into the manifest contract).
//
// PROVENANCE GATE (SUBPLAN_CGS_B_WALK_INTEGRITY — Pillar B): completeness alone never asked WHETHER
// an observation-claiming disposition was actually OBSERVED live or merely classified-from-spec. The
// corp-pricing rewalk flipped DONE with controls classified from the Jira spec instead of live-clicked,
// and this gate passed. So a disposition that CLAIMS observation (affordance-probed / read-only-verified)
// on an artifact dated on/after PROVENANCE_GATE_LANDING_DATE must carry `provenance: live` AND a cited
// machine-emitted `evidence:` artifact that (a) exists, (b) is not stale/reused (its embedded date is not
// older than the walk's session), and (c) names that control. `provenance: oracle` = classified-from-spec
// and is rejected on an observation-claiming row. A `provenance: oracle` / missing-provenance /
// missing-or-stale-evidence row makes the whole manifest incomplete AND sets `provenanceFail` (the
// fabrication signal the closure gate turns into a whole-plan rejection + integrity strike).

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { isAbsolute, join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseMcpSessionDateField } from '../../lib/mcp-session-date.mjs';

// REPO_ROOT = three levels up from this lib file (scripts/walk-coverage/lib/).
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export const COVERAGE_GATE_LANDING_DATE = '2026-06-19';

// The provenance sub-gate lands AFTER the coverage gate (2026-06-19): observation-claiming rows must
// carry machine evidence only for walks dated on/after this date. Walks dated before it are
// provenance-grandfathered (the ratio / crosscheck / undispositioned checks still apply when they
// post-date COVERAGE_GATE_LANDING_DATE). This is what stops the gate from retroactively failing the
// pre-existing manifests (e.g. pricing-2026-06-19) that never carried a provenance token.
export const PROVENANCE_GATE_LANDING_DATE = '2026-06-24';

// Artifacts dated on/after this date MUST include a Coverage Manifest or the gate denies.
// Configurable via opts.manifestMandatoryDate (tests) or closure-config.json manifest_mandatory_date.
export const MANIFEST_MANDATORY_DATE = '2026-07-22';

// Allowlist patterns for `out-of-scope` row reason text. Reason must be ≥20 chars AND match at
// least one pattern. Prevents blanket OOS dumps with no cited rule or structural justification.
const OOS_CITATION_RX = [
  /^LR-\d{3}/i,
  /^LR-ENC-\d{3}/i,
  /^ALL-\d{3}/i,
  /^NM-\d{3,5}/i,
  /^EXEMPT:(LR-\w+|NM-\d{3,5})\b/i,
  /^not-interactive\b/i,
  /^outside-module\b/i,
  /^third-party\b/i,
  /^duplicate-of:/i,
];

// Dispositions that ASSERT a live observation of a control — these need machine evidence on a
// provenance-gated artifact. `out-of-scope` is honest inference (no observation claim, never gated).
// `covered-by-TC` carries its TC-ID as inherent evidence (a runnable spec), so it is not evidence-gated
// here — but a `covered-by-TC` row that ALSO declares `provenance: oracle` is self-contradictory and is
// rejected. The fabrication this gate prevents is exactly the corp-pricing miss: a control dispositioned
// affordance-probed / read-only-verified by reading the spec instead of live-clicking it.
const OBSERVATION_DISPOSITIONS = ['affordance-probed', 'read-only-verified'];
const ALL_DISPOSITIONS = ['covered-by-TC', 'affordance-probed', 'read-only-verified', 'out-of-scope', 'DIFFERENTIAL-DATA-REQUIRED', 'deferred-to-DEEP'];

export function parseCoverageSignals(text) {
  const t = text || '';
  // Tolerate optional **bold** wrappers on frontmatter keys (real artifacts use both forms — SA-2).
  const parsedSessionDate = parseMcpSessionDateField(t);
  const mcpDate = parsedSessionDate.status === 'parsed' ? parsedSessionDate.sessionDate : '';
  const walkModeM = t.match(/(?:\*\*)?Walk_Mode(?:\*\*)?\s*:\s*(quick|deep)\b/i);
  const walkMode = walkModeM ? walkModeM[1].toLowerCase() : 'deep';
  const hasManifest = /^#{2,3}\s+Coverage Manifest/im.test(t) || /(?:\*\*)?Coverage_Ratio(?:\*\*)?\s*:/i.test(t);

  const ratioM = t.match(/(?:\*\*)?Coverage_Ratio(?:\*\*)?\s*:\s*(\d+)\s*\/\s*(\d+)/i);
  let ratioComplete = false, ratio = null;
  if (ratioM) {
    const n = +ratioM[1], m = +ratioM[2];
    ratio = { n, m };
    ratioComplete = m > 0 && n === m;
  } else if (/(?:\*\*)?Coverage_Ratio(?:\*\*)?\s*:[^\n]*\b100\s*%/i.test(t)) {
    ratioComplete = true; ratio = { explicit: '100%' };
  }

  const ccM = t.match(/(?:\*\*)?CrossCheck(?:\*\*)?\s*:\s*([^\n]+)/i);
  const crossCheck = ccM ? ccM[1].trim().replace(/^`|`$/g, '').replace(/<[^>]*>/g, '').trim() : '';
  const crossCheckClean = /^clean\b/i.test(crossCheck);

  const partial = /(?:\*\*)?coverageScope(?:\*\*)?\s*:\s*['"`]?\s*PARTIAL/i.test(t);
  const undispositioned = (t.match(/_undispositioned_/g) || []).length;
  const manifestRows = extractManifestRows(t);

  const completionRef = (t.match(/(?:\*\*)?Completion_Record(?:\*\*)?\s*:\s*([^\n]+)/i) || [])[1]?.trim() || '';
  const hasCompletionRecord = !!completionRef;
  return { mcpDate, hasManifest, ratio, ratioComplete, crossCheck, crossCheckClean, partial, undispositioned, manifestRows, completionRef, hasCompletionRecord, walkMode };
}

// Split a markdown table row into cells, respecting backslash-escaped bars (\|) which are NOT
// cell delimiters. Strips the leading and trailing outer bars. NM-3344 severity: high — without
// this, keys containing literal bars (e.g. struct:a|Home|…) are truncated at the first bar.
function splitTableRow(line) {
  const inner = line.replace(/^\s*\|/, '').replace(/\|\s*$/, '');
  const cells = [];
  let current = '';
  let inCodeSpan = false;
  for (let i = 0; i < inner.length; i++) {
    if (inner[i] === '`') {
      inCodeSpan = !inCodeSpan;
      current += inner[i];
    } else if (inner[i] === '|' && !inCodeSpan) {
      let bsCount = 0;
      let j = i - 1;
      while (j >= 0 && inner[j] === '\\') { bsCount++; j--; }
      if (bsCount % 2 === 1) {
        current += inner[i];
        continue;
      }
      cells.push(current);
      current = '';
    } else {
      current += inner[i];
    }
  }
  cells.push(current);
  return cells;
}

// Extract the content from a cell that may be backtick-wrapped with a trailing annotation,
// e.g. `struct:button|Order Search|…` _(A∖B — disabled)_ → struct:button|Order Search|…
function stripBacktickWrap(cell) {
  const trimmed = cell.trim();
  const m = trimmed.match(/^`([^`]+)`/);
  if (m) return m[1].trim();
  return trimmed.replace(/^`+|`+$/g, '').trim();
}

// Parse the Coverage Manifest table rows. Each row is a markdown table line whose cells carry a
// disposition token (`covered-by-TC` / `affordance-probed` / `read-only-verified` / `out-of-scope`).
// We capture per row: { disposition, controlRef (the id/key cell, prefix-stripped), provenance
// (live|oracle|''), evidence (the `evidence:` pointer, or ''), raw }. Scans only the Coverage
// Manifest section so unrelated tables elsewhere in the artifact are never misread.
export function extractManifestRows(text) {
  const t = text || '';
  const headingM = t.match(/^#{2,3}\s+Coverage Manifest[^\n]*$/im);
  if (!headingM) return [];
  const after = t.slice(headingM.index + headingM[0].length);
  // Section ends at the next markdown heading of any level.
  const nextHeading = after.match(/^#{1,6}\s/m);
  const section = nextHeading ? after.slice(0, nextHeading.index) : after;

  const rows = [];
  for (const line of section.split('\n')) {
    if (!/^\s*\|/.test(line)) continue;                 // not a table row
    if (/^\s*\|[-:\s|]+\|\s*$/.test(line)) continue;     // separator row
    // Split on unescaped bars only (a backslash before a bar means the bar is part of the key,
    // not a cell delimiter). After splitting, unescape \| → | in each cell.
    const cells = splitTableRow(line).map(c => c.trim().replace(/\\\|/g, '|'));
    // Disposition cell = first cell whose (backtick-stripped) text starts with a known token.
    let disposition = '';
    for (const c of cells) {
      const bare = c.replace(/^`+|`+$/g, '').trim();
      const hit = ALL_DISPOSITIONS.find(d => bare.toLowerCase().startsWith(d.toLowerCase() + ':') || bare.toLowerCase() === d.toLowerCase());
      if (hit) { disposition = hit; break; }
    }
    if (!disposition) continue;                          // header row or non-disposition row
    // controlRef = the id/key cell — first cell that looks like `prefix:value` / `testid:…` / `id:…`.
    // A cell may be backtick-wrapped with a trailing annotation: `key` _(A∖B — disabled)_
    // so extract the backtick-delimited content when present.
    let controlRef = '';
    for (const c of cells) {
      const bare = stripBacktickWrap(c);
      if (/^(testid|id|struct|aria|role|name):/i.test(bare)) { controlRef = bare; break; }
    }
    if (!controlRef && cells.length > 1) controlRef = stripBacktickWrap(cells[1]);
    const provM = line.match(/provenance\s*:\s*(live|oracle)\b/i);
    const evM = line.match(/evidence\s*:\s*([^\s|`]+)/i);
    rows.push({
      disposition,
      controlRef,
      provenance: provM ? provM[1].toLowerCase() : '',
      evidence: evM ? evM[1] : '',
      raw: line.trim(),
    });
  }
  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cross-module evidence: a control is genuinely "shared shell" only if it appears in at least
// one OTHER module's field-inventory enumeration. This makes the outside-module exclusion
// machine-decidable — a row cannot leave the denominator just because someone wrote a sentence.
//
// Module identity is derived from the filename: everything before the first `-YYYY-` date segment.
// Controls are matched by their full controlRef (prefix:value) after stripping archetype suffixes
// and annotation markers like `_(A∖B)_` / `_(B∖A)_` / `_(A∖B — disabled)_`.
// ─────────────────────────────────────────────────────────────────────────────

const FIELD_INVENTORIES_DIR = join(REPO_ROOT, 'specs_planning', '_internal', 'field-inventories');

/** Normalize a controlRef for cross-module comparison: strip archetype multipliers and A∖B markers.
 *  Radix dynamic IDs (`id:radix-_r_0_`, `id:radix-_r_#_`) are collapsed to a canonical form
 *  since Radix UI generates unique IDs per render — the same physical control gets different
 *  suffixes on different pages. */
function normalizeControlRef(ref) {
  if (!ref) return '';
  return ref
    .replace(/\s*\[archetype[^\]]*\]/gi, '')   // `[archetype×5]`
    .replace(/\s*_\([^)]*\)_/g, '')             // `_(A∖B — disabled)_`
    .replace(/\s*#\s*$/, '')                     // trailing `#` from archetype patterns
    .replace(/(id:radix-_r_)[^_]*(_)/i, '$1*$2') // collapse dynamic Radix suffix
    .trim();
}

/** Extract module name from a field-inventory filename (e.g. "service-charge-history" from "service-charge-history-2026-08-10.md"). */
function moduleFromFilename(filename) {
  const m = filename.match(/^(.+?)-\d{4}-\d{2}-\d{2}/);
  return m ? m[1] : filename.replace(/\.md$/i, '');
}

/**
 * Load cross-module controls from all field-inventory artifacts on disk.
 * Returns a Map<normalizedControlRef, Set<moduleName>> — the set of modules that enumerate each control.
 * On any error, returns an empty Map (fail toward rejection).
 */
export function loadCrossModuleRegistry() {
  const registry = new Map();
  let files;
  try {
    files = readdirSync(FIELD_INVENTORIES_DIR).filter(f => f.endsWith('.md') && !f.startsWith('_'));
  } catch {
    return registry;
  }
  for (const file of files) {
    const moduleName = moduleFromFilename(file);
    let text;
    try { text = readFileSync(join(FIELD_INVENTORIES_DIR, file), 'utf-8'); } catch { continue; }
    const rows = extractManifestRows(text);
    for (const row of rows) {
      const key = normalizeControlRef(row.controlRef);
      if (!key) continue;
      if (!registry.has(key)) registry.set(key, new Set());
      registry.get(key).add(moduleName);
    }
  }
  return registry;
}

/**
 * Check whether a controlRef is evidenced as shared shell (appears in another module's inventory).
 * @param {string} controlRef - the row's controlRef
 * @param {string} currentModule - the module name of the artifact being checked
 * @param {Map<string,Set<string>>|null} registry - cross-module registry (null = load from disk)
 * @returns {boolean} true if the control appears in at least one other module
 */
function isEvidencedShellControl(controlRef, currentModule, registry) {
  const key = normalizeControlRef(controlRef);
  if (!key) return false;
  const modules = registry.get(key);
  if (!modules) return false;
  for (const m of modules) {
    if (m !== currentModule) return true;
  }
  return false;
}

// The distinctive token of a controlRef for the "evidence names the control" (c) check —
// strip a leading `prefix:` and any backticks, keep the first identifier-ish chunk.
function controlCoreToken(controlRef) {
  if (!controlRef) return '';
  const noPrefix = controlRef.replace(/^(testid|id|struct|aria|role|name):/i, '').replace(/`/g, '').trim();
  const m = noPrefix.match(/[A-Za-z0-9_-]{3,}/);
  return m ? m[0] : noPrefix;
}

// Verify a `provenance: live` row's cited machine-emitted evidence artifact, per task 2's (a)/(b)/(c).
// Resolves the evidence pointer (absolute | repo-relative | relative to the artifact's own dir).
//   (a) exists  — the file resolves on disk;
//   (b) fresh   — if the evidence embeds any ISO date, the newest is NOT older than the walk's session
//                 (mtime is deliberately NOT used — git checkout / CI clone reset mtimes → non-deterministic);
//   (c) names   — the evidence content mentions the control's distinctive token.
// Returns { ok, reason }. Best-effort: callers without artifactPath skip this (text-only mode) and
// rely on the oracle / missing-provenance text checks alone.
function checkEvidenceArtifact(evidencePointer, controlRef, mcpDate, artifactPath) {
  if (!evidencePointer) return { ok: false, reason: `provenance: live but no 'evidence:' pointer cited` };
  const candidates = [];
  if (isAbsolute(evidencePointer)) candidates.push(evidencePointer);
  else {
    if (artifactPath) candidates.push(join(dirname(artifactPath), evidencePointer));
    candidates.push(join(REPO_ROOT, evidencePointer));
  }
  let resolved = '';
  for (const c of candidates) { try { if (existsSync(c)) { resolved = c; break; } } catch { /* ignore */ } }
  if (!resolved) return { ok: false, reason: `evidence file not found: ${evidencePointer}` };
  let content = '';
  try { content = readFileSync(resolved, 'utf-8'); } catch { return { ok: false, reason: `evidence file unreadable: ${evidencePointer}` }; }
  // (c) names the control
  const core = controlCoreToken(controlRef);
  if (core && !content.toLowerCase().includes(core.toLowerCase())) {
    return { ok: false, reason: `evidence ${evidencePointer} does not name the control "${core}"` };
  }
  // (b) not stale/reused — embedded dates must not predate the walk session
  if (mcpDate) {
    const dates = (content.match(/\d{4}-\d{2}-\d{2}/g) || []).sort();
    if (dates.length > 0 && dates[dates.length - 1] < mcpDate) {
      return { ok: false, reason: `evidence ${evidencePointer} is stale/reused (newest embedded date ${dates[dates.length - 1]} < session ${mcpDate})` };
    }
  }
  return { ok: true, reason: '' };
}

// A Completion_Record value may cite SEVERAL enumerator JSONs — one per walked surface of a
// multi-surface module — separated by ' · '. Each segment is '<path> (<annotation>)'; the
// annotation is informational and stripped here. Single-segment values behave exactly as before.
export function completionRefSegments(completionRef) {
  return String(completionRef || '')
    .split('·')
    .map(s => s.trim().replace(/\s*\(.*\)$/, '').trim())
    .filter(Boolean);
}

// Verify the completion-record JSON(s) referenced by a manifest's `Completion_Record:` frontmatter
// key. Every cited segment must independently pass; the first failure fails the whole key.
// Returns { ok, reason, data }. Handles halted status with exemption check (Item 5 gate side).
function checkCompletionRecord(completionRef, artifactPath) {
  if (!completionRef) return { ok: false, reason: 'Completion_Record absent' };
  const segments = completionRefSegments(completionRef);
  if (segments.length === 0) return { ok: false, reason: 'Completion_Record carries no JSON path' };
  const records = [];
  for (const jsonRel of segments) {
    // Fail-closed on a segment that is not a path (e.g. a bare annotation that escaped its
    // parens): silently skipping it would mean fewer receipts checked than the line claims.
    if (!/[\\/]/.test(jsonRel) && !/\.json$/i.test(jsonRel)) {
      return { ok: false, reason: `Completion_Record segment is not a JSON path: "${jsonRel}" — write each segment as '<path> (<annotation>)'` };
    }
    const r = checkOneCompletionRecord(jsonRel, artifactPath);
    if (!r.ok) return segments.length > 1 ? { ok: false, reason: `[${jsonRel}] ${r.reason}` } : r;
    records.push(r.data);
  }
  return { ok: true, data: records[0], all: records };
}

function checkOneCompletionRecord(jsonRel, artifactPath) {
  const jsonPath = isAbsolute(jsonRel) ? jsonRel : join(REPO_ROOT, jsonRel);
  if (!existsSync(jsonPath)) return { ok: false, reason: `Completion_Record JSON not found: ${jsonRel}` };
  let data;
  try { data = JSON.parse(readFileSync(jsonPath, 'utf-8')); } catch { return { ok: false, reason: 'Completion_Record JSON unparseable' }; }
  const cr = data.completion_record;
  if (!cr) return { ok: false, reason: 'Completion_Record JSON lacks completion_record field' };
  if (cr.status === 'halted') {
    // Item 5: check for a valid unexpired human exemption in .claude/walk-exemptions.json
    const exemptionsPath = join(REPO_ROOT, '.claude/walk-exemptions.json');
    let exemptions = [];
    try {
      if (existsSync(exemptionsPath)) {
        exemptions = JSON.parse(readFileSync(exemptionsPath, 'utf-8')).exemptions || [];
      }
    } catch { /* no valid exemptions */ }
    const now = new Date();
    const match = exemptions.find(e =>
      (cr.surfaces_attempted || []).some(s => s.includes(e.module)) &&
      e.expires && new Date(e.expires) > now
    );
    if (match) return { ok: true, reason: `HALTED but exempted: ${match.reason} (by ${match.granted_by})` };
    return { ok: false, reason: `HALTED — no valid exemption. halt_reasons: ${(cr.halt_reasons || []).join('; ')}` };
  }
  if (cr.status !== 'complete') return { ok: false, reason: `Completion_Record unknown status: ${cr.status}` };
  // Anti-tamper: content_sha256 is REQUIRED for complete records — its absence means the hash check was skipped.
  if (!cr.content_sha256) {
    return { ok: false, reason: 'Completion_Record missing content_sha256 — re-run enumerate-page.mjs' };
  }
  const stripped = JSON.parse(JSON.stringify(data));
  delete stripped.completion_record.content_sha256;
  const expected = createHash('sha256').update(JSON.stringify(stripped, null, 2) + '\n').digest('hex');
  if (cr.content_sha256 !== expected) return { ok: false, reason: 'Completion_Record JSON content_sha256 mismatch (file tampered)' };
  return { ok: true, data: cr };
}

// ISO dates sort lexically. Missing date → conservatively NOT grandfathered (in-scope).
export function isGrandfathered(mcpDate, landingDate = COVERAGE_GATE_LANDING_DATE) {
  if (!mcpDate) return false;
  return mcpDate < landingDate;
}

// Returns the YYYY-MM-DD of the first git commit that added artifactPath, or null on any error/untracked.
// Uses --diff-filter=A so only the add-commit is returned; the last output line is the oldest (first-add).
function getGitFirstCommitDate(artifactPath) {
  if (!artifactPath) return null;
  try {
    const relPath = artifactPath.startsWith(REPO_ROOT)
      ? artifactPath.slice(REPO_ROOT.length).replace(/^[\\/]/, '').replace(/\\/g, '/')
      : artifactPath.replace(/\\/g, '/');
    const result = spawnSync(
      'git',
      ['log', '--follow', '--diff-filter=A', '--format=%aI', '--', relPath],
      { cwd: REPO_ROOT, encoding: 'utf-8', timeout: 5000 }
    );
    if (result.status !== 0 || result.error || !result.stdout) return null;
    const lines = result.stdout.trim().split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) return null;
    const m = lines[lines.length - 1].match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : null;
  } catch {
    // git unavailable, not a repo, or unexpected error — treat as null (enforced, not grandfathered).
    return null;
  }
}

// Determine whether an artifact is SUBJECT TO the mandate (coverage gate / manifest requirement).
// Uses ONLY non-forgeable signals — mtime is author-forgeable (touch -d) and is deliberately excluded.
// Fail-closed: on any uncertainty, treat the artifact as subject to the mandate.
//
// ENFORCE (subject) if ANY:
//   - signals.hasCompletionRecord: machine completion record present on this artifact
//   - git first-commit date >= mandatoryDate: file was added on/after the mandate
//   - git UNKNOWN / untracked (no first-commit date): a NEW file — always enforce
// GRANDFATHER (not subject) ONLY if: !hasCompletionRecord AND git-first-commit-date EXISTS AND < mandatoryDate.
export function isSubjectToMandate(artifactPath, signals, mandatoryDate = MANIFEST_MANDATORY_DATE) {
  if (signals.hasCompletionRecord) return true;
  const gitDate = getGitFirstCommitDate(artifactPath);
  if (gitDate !== null) {
    return gitDate >= mandatoryDate;
  }
  // No git date — file is untracked or git unavailable. mtime is author-forgeable, so we
  // never use it as a grandfather signal. Fail toward enforcement on all such uncertainty.
  return true;
}

/**
 * @param {string} text  the walk artifact's full markdown.
 * @param {string} [landingDate]  the coverage-gate grandfather date.
 * @param {{artifactPath?:string, provenanceLandingDate?:string, depthGateMode?:string, manifestControls?:Array, inventoryRows?:Array, exemptedCaseRows?:Array, totalNegBvaCaseRows?:number, dispositions?:Array}} [opts]
 *   artifactPath enables on-disk evidence verification. provenanceLandingDate overrides
 *   PROVENANCE_GATE_LANDING_DATE (testing). depthGateMode overrides depth_gate_mode config for all
 *   depth-gate checks (testing). manifestControls/inventoryRows → Phase 2.4 parity check.
 *   exemptedCaseRows/totalNegBvaCaseRows → Phase 2.6 neg/BVA budget. dispositions → Phase 2.7
 *   disposition uniqueness. When depth-gate data is provided, checks run and fold into the verdict
 *   per depth_gate_mode (off → skip, announce → report only, deny → fold into complete).
 * @returns {{ applicable:boolean, complete:boolean, reasons:string[], provenanceFail:boolean, signals:object, depthGate:object, depthGateReasons:string[] }}
 *   applicable=false (and complete=true) when grandfathered OR no Coverage Manifest present —
 *   Cx only governs walk artifacts that opted into the manifest contract on/after the landing date.
 *   provenanceFail=true marks a FABRICATION-class failure (oracle / missing-provenance / missing-or-stale
 *   evidence on an observation-claiming row) — distinct from a mundane ratio/crosscheck incompleteness —
 *   so the closure gate can reject the whole walk and write an integrity strike.
 */
// ─────────────────────────────────────────────────────────────────────────────
// Type binding — a machine-derived field type may not contradict its own evidence.
//
// Phase 1 item 6 demoted Coverage_Ratio out of the blocking verdict on the stated grounds that it
// was "a computed number nobody blocks on". That premise was false: the m1-wrong-machine-type
// mutant (derived type "text" on a field whose recorded evidence reads `tag=SELECT role=combobox`)
// had been failing INCIDENTALLY through the Coverage_Ratio path. The demotion was still correct —
// but it exposed a real hole, because nothing here ever checked that a derived type agrees with the
// DOM the enumerator actually observed.
//
// 2026-08-07 (PLAN_COVERAGE_TIER_CONTRACT): Coverage_Ratio is RE-PROMOTED to blocking — deferred-to-DEEP
// rows (LR-072, Walk_Mode: quick) now count as dispositioned, so the ratio measures honest scope instead
// of a number nobody consumes. Type-binding (below) remains blocking in its own right.
//
// Deliberately conservative: a contradiction is reported only when BOTH sides resolve to a definite
// control family. Unrecognized evidence or an unmapped type is skipped and counted, never guessed —
// a false FAIL here would block every walk, which is a worse outcome than the hole it closes.

const EVIDENCE_FAMILIES = [
  { re: /\btag=SELECT\b|\b(combobox|listbox)\b/i, family: 'select' },
  { re: /\btag=TEXTAREA\b|\btextarea\b/i, family: 'textarea' },
  { re: /\bcheckbox\b/i, family: 'checkbox' },
  { re: /\bradio\b/i, family: 'radio' },
  { re: /\bspinbutton\b/i, family: 'number' },
  { re: /\bslider\b/i, family: 'slider' },
  { re: /\b(switch|toggle)\b/i, family: 'switch' },
];

const TYPE_FAMILY = {
  select: 'select', dropdown: 'select', combobox: 'select', listbox: 'select',
  textarea: 'textarea',
  checkbox: 'checkbox',
  radio: 'radio',
  number: 'number', numeric: 'number', spinbutton: 'number', currency: 'number',
  slider: 'slider',
  switch: 'switch', toggle: 'switch',
  text: 'text', string: 'text', email: 'text', password: 'text', search: 'text',
};

function evidenceFamily(evidence) {
  if (!evidence || typeof evidence !== 'string') return null;
  const hit = EVIDENCE_FAMILIES.find(e => e.re.test(evidence));
  return hit ? hit.family : null;
}

/** Load `derived_types` from the Completion_Record JSON(s). Mirrors checkCompletionRecord path
 *  resolution; a multi-surface value merges the maps, earlier segments winning on key collision. */
function loadDerivedTypes(completionRef) {
  if (!completionRef) return null;
  let merged = null;
  for (const jsonRel of completionRefSegments(completionRef)) {
    const jsonPath = isAbsolute(jsonRel) ? jsonRel : join(REPO_ROOT, jsonRel);
    if (!existsSync(jsonPath)) continue;
    try {
      const dt = JSON.parse(readFileSync(jsonPath, 'utf-8')).derived_types || null;
      if (dt) merged = merged ? { ...dt, ...merged } : { ...dt };
    } catch {
      // Unreadable/unparseable JSON is already reported by checkCompletionRecord; skipping here
      // avoids emitting the same failure twice. Documented fallback, not a silent swallow (LR-003).
    }
  }
  return merged;
}

/**
 * Blocking reasons for each field whose derived type contradicts its own recorded evidence.
 * @returns {{ reasons:string[], checked:number, skipped:string[] }}
 */
export function checkTypeBinding(derivedTypes) {
  const reasons = [];
  const skipped = [];
  let checked = 0;
  for (const [key, entry] of Object.entries(derivedTypes || {})) {
    const declared = String(entry?.type ?? '').toLowerCase();
    const observedFamily = evidenceFamily(entry?.evidence);
    const declaredFamily = TYPE_FAMILY[declared];
    if (!observedFamily || !declaredFamily) {
      skipped.push(`${key} (declared="${declared || 'missing'}", evidence=${observedFamily ? 'known' : 'unrecognized'})`);
      continue;
    }
    checked++;
    if (observedFamily !== declaredFamily) {
      reasons.push(
        `TYPEBIND field "${key}" derived type="${declared}" contradicts ${observedFamily} observation (${entry.evidence})`
      );
    }
  }
  return { reasons, checked, skipped };
}

// Owner-signed 15%-cap exemptions (SUBPLAN_GUARDRAIL_CX_GATE_DEFECTS Defect 3, 2026-08-28 — Sev S1;
// graduating incident: NM-3530 closure blocked because the owner's signed route-(b) exemption of
// 2026-08-26 existed only as plan prose, invisible to this gate). Source of truth:
// .claude/walk-exemptions.json `oos_cap_exemptions` — one entry per artifact basename, honored ONLY
// when human-signed: non-empty approved_by, a date, and a reason >= 20 chars. Unsigned or malformed
// entries are ignored, so the cap stays in force (fail-toward-enforcement). An honored exemption is
// echoed into `warnings`, never silent.
function loadOosCapExemptions() {
  const p = join(REPO_ROOT, '.claude', 'walk-exemptions.json');
  try {
    if (!existsSync(p)) return [];
    const data = JSON.parse(readFileSync(p, 'utf-8'));
    return Array.isArray(data.oos_cap_exemptions) ? data.oos_cap_exemptions : [];
  } catch { /* unreadable exemptions file = no exemptions; the cap stays in force */ return []; }
}

export function findOosCapExemption(artifactPath, entries = loadOosCapExemptions()) {
  const base = String(artifactPath || '').replace(/^.*[/\\]/, '');
  if (!base) return null;
  return entries.find(e =>
    e && String(e.artifact || '').replace(/^.*[/\\]/, '') === base
    && typeof e.approved_by === 'string' && e.approved_by.trim().length > 0
    && typeof e.date === 'string' && e.date.trim().length >= 8
    && typeof e.reason === 'string' && e.reason.trim().length >= 20
  ) || null;
}

export function coverageVerdict(text, landingDate = COVERAGE_GATE_LANDING_DATE, opts = {}) {
  const { artifactPath = '', provenanceLandingDate = PROVENANCE_GATE_LANDING_DATE, manifestMandatoryDate = MANIFEST_MANDATORY_DATE } = opts;
  const s = parseCoverageSignals(text);
  if (!s.hasManifest) {
    if (!isSubjectToMandate(artifactPath, s, manifestMandatoryDate)) {
      return { applicable: false, complete: true, reasons: ['no-coverage-manifest (pre-mandatory-date)'], provenanceFail: false, signals: s };
    }
    // Observation-only old-site baseline carve-out (SUBPLAN_GUARDRAIL_CX_GATE_DEFECTS Defect 2,
    // 2026-08-28 — Sev S1; graduating incident: NM-3530 closure demanded a machine enumeration of
    // nav2 that the owner-authorized bounded observation walk could never produce). Scope is
    // deliberately narrow: ONLY artifacts under old-site-baseline/ whose frontmatter BOTH declares
    // `Observation_Only: true` AND carries a `Walk_Authorization:` line >= 20 chars naming the
    // owner grant. New-site artifacts (field-inventories etc.) can never use these keys — the
    // path test excludes them, so the manifest mandate still bites everywhere it always did.
    const isOldSiteBaseline = /old-site-baseline[\/\\][^\/\\]+$/.test(String(artifactPath || ''));
    const observationOnly = /^\s*(?:\*\*)?Observation_Only(?:\*\*)?\s*:\s*true\s*$/mi.test(text);
    const authMatch = text.match(/^\s*(?:\*\*)?Walk_Authorization(?:\*\*)?\s*:\s*(\S.{19,})$/mi);
    if (isOldSiteBaseline && observationOnly && authMatch) {
      return { applicable: false, complete: true,
        reasons: [`no-coverage-manifest (observation-only old-site baseline; authorization: ${authMatch[1].trim().slice(0, 140)})`],
        provenanceFail: false, signals: s };
    }
    return { applicable: true, complete: false,
      reasons: [`Coverage Manifest ABSENT — run \`npm run walk:enumerate\` (LR-062). Mandatory for artifacts dated >= ${manifestMandatoryDate}`],
      provenanceFail: false, signals: s };
  }
  if (!isSubjectToMandate(artifactPath, s, landingDate)) {
    return { applicable: false, complete: true, reasons: [`grandfathered (git-old TRACKED artifact, no Completion_Record, first-commit < ${landingDate})`], provenanceFail: false, signals: s };
  }
  const reasons = [];
  const warnings = [];
  const coverageRatioSignal = !s.ratioComplete
    ? `Coverage_Ratio not 100% (${s.ratio ? (s.ratio.n + '/' + s.ratio.m) : 'missing/unparseable'})`
    : null;
  if (!s.ratioComplete) reasons.push(coverageRatioSignal);
  if (!s.crossCheckClean) reasons.push(`CrossCheck != clean ("${s.crossCheck || 'missing'}")`);
  if (s.partial) reasons.push('coverageScope: PARTIAL present');
  if (s.undispositioned > 0) reasons.push(`${s.undispositioned} undispositioned manifest row(s)`);

  // Tier-aware deferral check (PLAN_COVERAGE_TIER_CONTRACT Phase 3.1):
  // deferred-to-DEEP is a valid disposition ONLY when Walk_Mode: quick.
  // In deep or absent mode, deferral rows are not accepted — they are not a valid terminal disposition.
  const deferredRows = (s.manifestRows || []).filter(r => r.disposition === 'deferred-to-DEEP');
  if (deferredRows.length > 0 && s.walkMode !== 'quick') {
    for (const row of deferredRows) {
      reasons.push(`row "${row.controlRef || '(unlabeled)'}": deferred-to-DEEP is only valid when Walk_Mode: quick (artifact Walk_Mode: ${s.walkMode})`);
    }
  }
  // G4 format check: deferred-to-DEEP token must carry non-empty launcher/element id AND reason ≥20 chars.
  // Grammar: deferred-to-DEEP: <id> (<reason ≥20 chars>)
  for (const row of deferredRows) {
    const m = row.raw.match(/deferred-to-DEEP\s*:\s*(\S+)\s+\(([^)]*)\)/i);
    if (!m || !m[1] || m[1].trim().length === 0) {
      reasons.push(`row "${row.controlRef || '(unlabeled)'}": deferred-to-DEEP missing launcher/element id (grammar: deferred-to-DEEP: <id> (<reason ≥20 chars>))`);
    } else if (!m[2] || m[2].trim().length < 20) {
      reasons.push(`row "${row.controlRef || '(unlabeled)'}": deferred-to-DEEP reason <20 chars (grammar: deferred-to-DEEP: <id> (<reason ≥20 chars>))`);
    }
  }

  // === Provenance sub-gate (SUBPLAN_CGS_B) — only for artifacts on/after PROVENANCE_GATE_LANDING_DATE ===
  let provenanceFail = false;
  if (isSubjectToMandate(artifactPath, s, provenanceLandingDate)) {
    for (const row of (s.manifestRows || [])) {
      const ref = row.controlRef || '(unlabeled row)';
      if (OBSERVATION_DISPOSITIONS.includes(row.disposition)) {
        if (row.provenance === 'oracle') {
          reasons.push(`row "${ref}" claims observation (${row.disposition}) but provenance: oracle — classify live or move out-of-scope`);
          provenanceFail = true;
        } else if (row.provenance !== 'live') {
          reasons.push(`row "${ref}" ${row.disposition} missing 'provenance: live' + machine evidence (un-fakeable proof required on observation rows)`);
          provenanceFail = true;
        } else {
          // provenance: live — verify the cited evidence artifact (deep check needs artifactPath;
          // even without it, a missing 'evidence:' pointer is a text-detectable fail).
          if (!row.evidence) {
            reasons.push(`row "${ref}" provenance: live but cites no 'evidence:' artifact`);
            provenanceFail = true;
          } else if (artifactPath) {
            const ev = checkEvidenceArtifact(row.evidence, row.controlRef, s.mcpDate, artifactPath);
            if (!ev.ok) { reasons.push(`row "${ref}" ${ev.reason}`); provenanceFail = true; }
          }
        }
      } else if (row.disposition === 'covered-by-TC' && row.provenance === 'oracle') {
        reasons.push(`row "${ref}" covered-by-TC contradicts provenance: oracle (a TC is live evidence; oracle = classified-from-spec)`);
        provenanceFail = true;
      }
    }
  }

  // Item 3: out-of-scope citation validation + 15% module-own cap
  // NM-3344 (2026-08-15): the denominator excludes rows whose controlRef is EVIDENCED as shared
  // shell — i.e. the same control appears in at least one OTHER module's field-inventory manifest.
  // The `outside-module` prefix is necessary (intent signal) but NOT sufficient (evidence required).
  // A row cannot leave the denominator just because someone wrote a sentence saying it should.
  const oosRows = (s.manifestRows || []).filter(r => r.disposition === 'out-of-scope');
  const totalRows = (s.manifestRows || []).length;
  const OUTSIDE_MODULE_RX = /^outside-module\b/i;
  const shellRows = [];
  const inModuleOosRows = [];

  // Determine current module and load cross-module registry for evidence check.
  const crossModuleRegistry = opts.crossModuleControls !== undefined ? opts.crossModuleControls : loadCrossModuleRegistry();
  const currentModule = artifactPath ? moduleFromFilename(artifactPath.replace(/.*[/\\]/, '')) : '';

  for (const row of oosRows) {
    const reasonText = row.raw.match(/out-of-scope\s*:\s*([^|`\n]+)/i)?.[1]?.trim() || '';
    if (reasonText.length < 20) {
      reasons.push(`out-of-scope "${row.controlRef}" reason <20 chars`);
    }
    if (!OOS_CITATION_RX.some(rx => rx.test(reasonText))) {
      reasons.push(`out-of-scope "${row.controlRef}" lacks allowlist citation`);
    }
    if (OUTSIDE_MODULE_RX.test(reasonText)) {
      // The prefix declares intent, but evidence decides membership: the control must appear
      // in at least one other module's enumeration to leave the denominator.
      if (isEvidencedShellControl(row.controlRef, currentModule, crossModuleRegistry)) {
        shellRows.push(row);
      } else {
        reasons.push(`outside-module "${row.controlRef}" NOT evidenced as shared shell (control not found in any other module's inventory)`);
        inModuleOosRows.push(row);
      }
    } else {
      inModuleOosRows.push(row);
    }
  }
  // The denominator is the module's own controls: total rows minus those evidenced as shell.
  // The cap bites at 15% of that reduced set — unless the owner has SIGNED a per-artifact
  // exemption (Defect 3 above; opts.oosCapExemptions is the test-injection seam, mirroring
  // opts.crossModuleControls). An honored exemption is echoed loudly into warnings.
  const moduleOwnRows = totalRows - shellRows.length;
  if (moduleOwnRows > 0 && inModuleOosRows.length / moduleOwnRows > 0.15) {
    const capExemption = findOosCapExemption(
      artifactPath,
      opts.oosCapExemptions !== undefined ? opts.oosCapExemptions : loadOosCapExemptions()
    );
    if (capExemption) {
      warnings.push(
        `out-of-scope 15% cap WAIVED by owner-signed exemption (${inModuleOosRows.length}/${moduleOwnRows} in-module OOS) — ` +
        `approved_by=${capExemption.approved_by}; date=${capExemption.date}; plan=${capExemption.plan || '(none)'}; reason="${capExemption.reason}"`
      );
    } else {
      reasons.push(`out-of-scope rows exceed 15% module-own cap (${inModuleOosRows.length}/${moduleOwnRows} in-module OOS; ${shellRows.length} outside-module rows excluded from denominator)`);
    }
  }

  // Item 2 gate side: Completion_Record required for post-mandatory-date artifacts
  if (isSubjectToMandate(artifactPath, s, manifestMandatoryDate)) {
    if (!s.hasCompletionRecord) {
      reasons.push('Completion_Record frontmatter missing — re-run enumerate-page.mjs');
    } else if (artifactPath) {
      const crCheck = checkCompletionRecord(s.completionRef, artifactPath);
      if (!crCheck.ok) reasons.push(crCheck.reason);
    }
  }

  // Type binding — blocking, and deliberately NOT ramp-gated. This is not a new policy gate whose
  // false-positive rate is unknown; it restored an enforcement property the tree lost while
  // Coverage_Ratio was demoted (2026-07-23 → 2026-08-07; PLAN_COVERAGE_TIER_CONTRACT has since
  // re-promoted the ratio to blocking — both checks now block independently). A machine that
  // contradicts its own observation is never acceptable.
  const derivedTypes = opts.derivedTypes !== undefined ? opts.derivedTypes : loadDerivedTypes(s.completionRef);
  const typeBinding = derivedTypes ? checkTypeBinding(derivedTypes) : { reasons: [], checked: 0, skipped: [] };
  reasons.push(...typeBinding.reasons);
  if (derivedTypes && typeBinding.checked === 0 && typeBinding.skipped.length > 0) {
    // Every field was unresolvable on one side or the other, so the check ran but proved nothing.
    // Surfaced rather than passing silently — a check with nothing to check must not read as green.
    warnings.push(`type-binding evaluated 0 of ${typeBinding.skipped.length} field(s); none had both a mapped type and recognized evidence`);
  }

  // ─── Depth-gate checks (Phase 2.4 / 2.6 / 2.7) — wired into verdict path
  const depthGateResults = {};
  const depthGateReasons = [];
  const depthMode = opts.depthGateMode !== undefined ? opts.depthGateMode : undefined;
  const depthOpts = { artifactPath, signals: s, mandatoryDate: manifestMandatoryDate, ...(depthMode !== undefined ? { rampModeOverride: depthMode } : {}) };

  if (opts.manifestControls !== undefined || opts.inventoryRows !== undefined) {
    const r = checkManifestInventoryParity(opts.manifestControls || [], opts.inventoryRows || [], depthOpts);
    depthGateResults.parity = r;
    depthGateReasons.push(...r.reasons);
    if (!r.pass) reasons.push(...r.reasons);
  }

  if (opts.exemptedCaseRows !== undefined || opts.totalNegBvaCaseRows !== undefined) {
    const r = checkNegBvaExemptionBudget(opts.exemptedCaseRows || [], opts.totalNegBvaCaseRows ?? 0, depthOpts);
    depthGateResults.negBvaBudget = r;
    depthGateReasons.push(...r.reasons);
    if (!r.pass) reasons.push(...r.reasons);
  }

  if (opts.dispositions !== undefined) {
    const r = checkDispositionUniqueness(opts.dispositions || [], depthOpts);
    depthGateResults.dispositionUniqueness = r;
    depthGateReasons.push(...r.reasons);
    if (!r.pass) reasons.push(...r.reasons);
  }

  return { applicable: true, complete: reasons.length === 0, reasons, warnings, provenanceFail, signals: s, walkMode: s.walkMode, depthGate: depthGateResults, depthGateReasons, coverageRatioSignal, typeBinding };
}

// ─────────────────────────────────────────────────────────────────────────────
// PLAN_WALK_DEPTH_GATE — Phase 2.4 / 2.6 / 2.7 numerator teeth
// ─────────────────────────────────────────────────────────────────────────────

// Ramp config reader — shared by all three depth-gate checks.
function readDepthGateMode() {
  const configPath = join(REPO_ROOT, '.claude/guardrail-config.json');
  if (!existsSync(configPath)) {
    console.log('DEPTH-GATE: guardrail-config.json absent — defaulting to announce');
    return 'announce';
  }
  let raw;
  try {
    raw = readFileSync(configPath, 'utf-8');
  } catch (err) {
    throw new Error(`guardrail-config.json unreadable (fail-closed): ${err.message}`);
  }
  let config;
  try {
    config = JSON.parse(raw);
  } catch (err) {
    throw new Error(`guardrail-config.json malformed JSON (fail-closed): ${err.message}`);
  }
  const mode = config.depth_gate_mode;
  if (mode === undefined) {
    console.log('DEPTH-GATE: depth_gate_mode key absent in config — defaulting to announce');
    return 'announce';
  }
  if (mode === 'deny' || mode === 'announce') return mode;
  throw new Error(`guardrail-config.json depth_gate_mode="${mode}" is not a valid value (fail-closed — expected deny|announce)`);
}

// Non-interactive control types — inventory rows with these are legitimately absent from the
// machine enumerator output (Direction 2 exemption). Matched case-insensitively.
const NON_INTERACTIVE_CONTROL_TYPES = [
  'static', 'read-only', 'readonly', 'display-only', 'display', 'label',
  'heading', 'text', 'info', 'divider', 'separator', 'computed', 'formula',
];

/**
 * Phase 2.4 — Manifest ↔ inventory parity check.
 *
 * Direction 1: machine control (from enumerator/manifest) absent from inventory → FAIL always.
 * Direction 2: inventory row with no machine control → FAIL unless controlType is non-interactive.
 *
 * @param {Array<{machineKey: string}>} manifestControls - Controls found by the machine enumerator.
 * @param {Array<{machineKey: string, controlType: string}>} inventoryRows - Rows from field inventory.
 * @param {{artifactPath?: string, signals?: object, mandatoryDate?: string}} [opts]
 * @returns {{pass: boolean, reasons: string[], direction1Gaps: string[], direction2Gaps: string[], counts: object, rampMode: string}}
 */
export function checkManifestInventoryParity(manifestControls, inventoryRows, opts = {}) {
  const rampMode = opts.rampModeOverride !== undefined ? opts.rampModeOverride : readDepthGateMode();

  const manifestKeys = new Set((manifestControls || []).map(c => c.machineKey).filter(Boolean));
  const inventoryMap = new Map();
  for (const row of (inventoryRows || [])) {
    if (row.machineKey) inventoryMap.set(row.machineKey, row);
  }

  // Silent-pass guard: zero rows evaluated on a subject surface = FAIL.
  const subjectToMandate = opts.artifactPath
    ? isSubjectToMandate(opts.artifactPath, opts.signals || {}, opts.mandatoryDate)
    : true; // no path → conservative (enforce)

  if (subjectToMandate && manifestKeys.size === 0 && inventoryMap.size === 0) {
    const msg = 'PARITY ZERO-ROW FAIL: both manifest and inventory are empty on a subject-to-mandate surface';
    console.log(`PARITY: manifest=0 inventory=0 missing=0 — ZERO-ROW FAIL`);
    return { pass: false, reasons: [msg], direction1Gaps: [], direction2Gaps: [], counts: { manifest: 0, inventory: 0, missing_from_inventory: 0, missing_from_manifest: 0 }, rampMode };
  }

  const direction1Gaps = []; // machine controls not in inventory
  const direction2Gaps = []; // inventory rows not in manifest (interactive only)

  // Direction 1: every manifest control must appear in inventory
  for (const key of manifestKeys) {
    if (!inventoryMap.has(key)) {
      direction1Gaps.push(key);
    }
  }

  // Direction 2: every inventory row must appear in manifest UNLESS non-interactive
  for (const [key, row] of inventoryMap) {
    if (!manifestKeys.has(key)) {
      const ct = (row.controlType || '').trim().toLowerCase();
      const isNonInteractive = NON_INTERACTIVE_CONTROL_TYPES.some(t => ct === t || ct.startsWith(t + ':'));
      if (!isNonInteractive) {
        direction2Gaps.push(key);
      }
    }
  }

  const counts = {
    manifest: manifestKeys.size,
    inventory: inventoryMap.size,
    missing_from_inventory: direction1Gaps.length,
    missing_from_manifest: direction2Gaps.length,
  };

  console.log(`PARITY: manifest=${counts.manifest} inventory=${counts.inventory} missing_from_inventory=${counts.missing_from_inventory} missing_from_manifest=${counts.missing_from_manifest}`);

  const reasons = [];
  if (direction1Gaps.length > 0) {
    reasons.push(`Direction 1 FAIL: ${direction1Gaps.length} machine control(s) absent from inventory: [${direction1Gaps.join(', ')}]`);
  }
  if (direction2Gaps.length > 0) {
    reasons.push(`Direction 2 FAIL: ${direction2Gaps.length} interactive inventory row(s) absent from manifest: [${direction2Gaps.join(', ')}]`);
  }

  const hasFailures = reasons.length > 0;
  // Ramp: announce → report but verdict-neutral; deny → fold into verdict.
  const pass = rampMode === 'announce' ? true : !hasFailures;

  return { pass, reasons, direction1Gaps, direction2Gaps, counts, rampMode };
}

// Per-category exemption budget — 5% cap on Negative/BVA exemptions (far tighter than the 15%
// global OOS cap). Human-approved walk-exemptions.json entry required for each.
const NEG_BVA_EXEMPT_RATIO = 0.05;
// Path to the human-approved exemptions file (repo-root-relative).
// Schema: { "exemptions": [{ "case_id": "<id>", "category": "Negative"|"BVA", "reason": "<why>", "approved_by": "<name>", "date": "<ISO>" }] }
const WALK_EXEMPTIONS_PATH = 'scripts/walk-coverage/walk-exemptions.json';

/**
 * Phase 2.6 — Per-category exemption budget for Negative and BVA case rows.
 *
 * Exempting a neg/BVA case row requires BOTH: (1) within the tight 5% budget, AND (2) a matching
 * entry in walk-exemptions.json. Missing/malformed file while a claim exists → FAIL (fail-closed).
 *
 * @param {Array<{caseId: string, category: string}>} exemptedCaseRows - Case rows claimed as exempt.
 * @param {number} totalNegBvaCaseRows - Total neg/BVA case rows on this surface.
 * @param {{artifactPath?: string, signals?: object, mandatoryDate?: string}} [opts]
 * @returns {{pass: boolean, reasons: string[], counts: object, rampMode: string}}
 */
export function checkNegBvaExemptionBudget(exemptedCaseRows, totalNegBvaCaseRows, opts = {}) {
  const rampMode = opts.rampModeOverride !== undefined ? opts.rampModeOverride : readDepthGateMode();

  const subjectToMandate = opts.artifactPath
    ? isSubjectToMandate(opts.artifactPath, opts.signals || {}, opts.mandatoryDate)
    : true;

  const negBvaExempted = (exemptedCaseRows || []).filter(r => {
    const cat = (r.category || '').toLowerCase();
    return cat === 'negative' || cat === 'bva';
  });

  // Silent-pass guard: zero total neg/BVA rows on a subject surface → FAIL
  if (subjectToMandate && totalNegBvaCaseRows === 0) {
    const msg = 'EXEMPT ZERO-ROW FAIL: zero neg/BVA case rows on a subject-to-mandate surface — enumeration may be incomplete';
    console.log(`EXEMPT: neg_bva_total=0 neg_bva_exempt_claimed=${negBvaExempted.length} budget=0 — ZERO-ROW FAIL`);
    return { pass: false, reasons: [msg], counts: { neg_bva_total: 0, neg_bva_exempt_claimed: negBvaExempted.length, budget: 0 }, rampMode };
  }

  const budget = Math.max(1, Math.floor(totalNegBvaCaseRows * NEG_BVA_EXEMPT_RATIO));
  const counts = { neg_bva_total: totalNegBvaCaseRows, neg_bva_exempt_claimed: negBvaExempted.length, budget };
  console.log(`EXEMPT: neg_bva_total=${totalNegBvaCaseRows} neg_bva_exempt_claimed=${negBvaExempted.length} budget=${budget}`);

  const reasons = [];

  // Budget check
  if (negBvaExempted.length > budget) {
    reasons.push(`Neg/BVA exemption budget exceeded: ${negBvaExempted.length} claimed > ${budget} budget (${Math.round(NEG_BVA_EXEMPT_RATIO * 100)}% of ${totalNegBvaCaseRows})`);
  }

  // walk-exemptions.json validation — every neg/BVA exemption must have an entry
  if (negBvaExempted.length > 0) {
    const exemptionsPath = join(REPO_ROOT, WALK_EXEMPTIONS_PATH);
    let approvedExemptions = null;
    try {
      if (!existsSync(exemptionsPath)) {
        reasons.push(`walk-exemptions.json NOT FOUND at ${WALK_EXEMPTIONS_PATH} — required for neg/BVA exemptions (fail-closed)`);
      } else {
        const raw = JSON.parse(readFileSync(exemptionsPath, 'utf-8'));
        if (!raw || !Array.isArray(raw.exemptions)) {
          reasons.push(`walk-exemptions.json malformed — missing "exemptions" array (fail-closed)`);
        } else {
          approvedExemptions = new Set(raw.exemptions.map(e => e.case_id).filter(Boolean));
        }
      }
    } catch (err) {
      reasons.push(`walk-exemptions.json unreadable/unparseable: ${err.message} (fail-closed)`);
    }

    if (approvedExemptions !== null) {
      const unapproved = negBvaExempted.filter(r => !approvedExemptions.has(r.caseId));
      if (unapproved.length > 0) {
        reasons.push(`${unapproved.length} neg/BVA exemption(s) lack walk-exemptions.json entry: [${unapproved.map(r => r.caseId).join(', ')}]`);
      }
    }
  }

  const hasFailures = reasons.length > 0;
  const pass = rampMode === 'announce' ? true : !hasFailures;

  return { pass, reasons, counts, rampMode };
}

// TC disposition ceiling — max case rows a single TC may dispose without per-row title-token binding.
const TC_DISPOSE_CEILING = 3;
// Hard ceiling — title tokens CANNOT lift past this. Above requires per-case runtime receipts (Phase 3.2).
const TC_DISPOSE_HARD_CEILING = 8;

// Match a case_id as an exact delimited token in text — bounded by whitespace, punctuation, or
// string edges. Prevents "case-1" from satisfying "case-12".
function isExactDelimitedToken(text, token) {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rx = new RegExp(`(?:^|[\\s,;|/()\\[\\]{}:])${escaped}(?:$|[\\s,;|/()\\[\\]{}:])`, 'i');
  return rx.test(text);
}

/**
 * Phase 2.7 — One case_id, one disposition. A TC id disposing multiple case rows must demonstrate
 * per-row parameterisation via title-token binding (the TC title contains the literal case_id for
 * each row it disposes). Exceeding the ceiling without binding → FAIL.
 *
 * @param {Array<{caseId: string, tcId: string, tcTitle: string}>} dispositions - TC→case_id mappings.
 * @param {{artifactPath?: string, signals?: object, mandatoryDate?: string, ceiling?: number, hardCeiling?: number}} [opts]
 * @returns {{pass: boolean, reasons: string[], violations: Array<{tcId: string, caseIds: string[], unboundIds: string[], hardCeilingExceeded?: boolean}>, counts: object, rampMode: string}}
 */
export function checkDispositionUniqueness(dispositions, opts = {}) {
  const rampMode = opts.rampModeOverride !== undefined ? opts.rampModeOverride : readDepthGateMode();

  // Silent-pass guard (item 5): zero case rows on a subject surface = FAIL regardless of ramp mode.
  const subjectToMandate = opts.artifactPath
    ? isSubjectToMandate(opts.artifactPath, opts.signals || {}, opts.mandatoryDate)
    : true;
  if (subjectToMandate) {
    if (dispositions === undefined || dispositions === null) {
      const msg = 'DISPOSITION ZERO-ROW FAIL: case row dispositions are ABSENT (undefined) on a subject-to-mandate surface — no case rows were provided';
      console.log(`DISPOSE: dispositions=undefined — ZERO-ROW FAIL (absent)`);
      return { pass: false, reasons: [msg], violations: [], counts: { tcs: 0, over_ceiling: 0 }, rampMode };
    }
    if (Array.isArray(dispositions) && dispositions.length === 0) {
      const msg = 'DISPOSITION ZERO-ROW FAIL: case row dispositions are EMPTY ([]) on a subject-to-mandate surface — enumeration produced zero case rows';
      console.log(`DISPOSE: dispositions=[] — ZERO-ROW FAIL (empty)`);
      return { pass: false, reasons: [msg], violations: [], counts: { tcs: 0, over_ceiling: 0 }, rampMode };
    }
  }

  const ceiling = opts.ceiling || TC_DISPOSE_CEILING;
  const hardCeiling = opts.hardCeiling || TC_DISPOSE_HARD_CEILING;

  // Group by TC id
  const tcMap = new Map();
  for (const d of (dispositions || [])) {
    if (!d.tcId) continue;
    if (!tcMap.has(d.tcId)) tcMap.set(d.tcId, { title: d.tcTitle || '', caseIds: [] });
    tcMap.get(d.tcId).caseIds.push(d.caseId);
  }

  const violations = [];
  for (const [tcId, entry] of tcMap) {
    // Hard ceiling: above this, always FAIL regardless of title tokens — needs Phase 3.2 runtime receipts
    if (entry.caseIds.length > hardCeiling) {
      violations.push({ tcId, caseIds: entry.caseIds, unboundIds: entry.caseIds, hardCeilingExceeded: true });
      continue;
    }
    if (entry.caseIds.length <= ceiling) continue;
    // Soft ceiling exceeded: check title-token binding with exact delimited match
    const unboundIds = entry.caseIds.filter(cid => !isExactDelimitedToken(entry.title, cid));
    if (unboundIds.length > 0) {
      violations.push({ tcId, caseIds: entry.caseIds, unboundIds, hardCeilingExceeded: false });
    }
  }

  const counts = { tcs: tcMap.size, over_ceiling: violations.length };
  console.log(`DISPOSE: tcs=${counts.tcs} over_ceiling=${counts.over_ceiling}`);

  const reasons = [];
  for (const v of violations) {
    if (v.hardCeilingExceeded) {
      reasons.push(`TC "${v.tcId}" disposes ${v.caseIds.length} case rows — exceeds hard ceiling (${hardCeiling}). Per-case runtime receipts required (Phase 3.2)`);
    } else {
      reasons.push(`TC "${v.tcId}" disposes ${v.caseIds.length} case rows (ceiling=${ceiling}) without title-token binding for: [${v.unboundIds.join(', ')}]`);
    }
  }

  const hasFailures = reasons.length > 0;
  const pass = rampMode === 'announce' ? true : !hasFailures;

  return { pass, reasons, violations, counts, rampMode };
}
