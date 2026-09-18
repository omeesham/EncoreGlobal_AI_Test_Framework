#!/usr/bin/env node
// scripts/walk-coverage/verify-denominator.mjs
// PLAN_EXHAUSTIVE_WALK_GUARANTEE — W-DENOM gate (item 4 denominator integrity + item 7 spot audit).
//
// Exports:
//   verifyDenominator(artifactText, jsonPath) — checks machine-enumerated keys match manifest rows.
//   spotAudit(artifactText)                   — random sample of covered-by-TC rows, asserts TC
//                                               ids exist in tests/**/*.spec.ts.
//
// Design: requiredStates are read from lib/module-config.mjs (pure data, no playwright deps).
// enumerate-page.mjs imports playwright at top level so importing it directly would drag heavy
// deps into this gate; the extracted module-config.mjs avoids that. The MODULE_CONFIG export in
// enumerate-page.mjs is retained for other consumers of the full walk config.
// FAIL-CLOSED: any gate-can't-verify condition returns ok:false (never silently passes).
//
// Refs: LR-062 (denominator discipline), LR-065 (case-generation taxonomy).

import { existsSync, readFileSync, readdirSync, statSync, appendFileSync } from 'node:fs';
import { join, dirname, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { extractManifestRows } from './lib/coverage-manifest.mjs';
import { MODULE_CONFIG as MODULE_REQUIRED_STATES } from './lib/module-config.mjs';
import { loadFieldCaseTaxonomy } from './lib/field-case-parser.mjs';
import { computePathA, computePathB, reconcile, partitionControls, gridUnits } from './lib/case-parity.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const ANNOUNCE_PREFIX = '[ANNOUNCE] ';

// ---- normalize -------------------------------------------------------------------------------
// Trim only — case is SIGNIFICANT. The enumerator produces mixed-case keys (e.g. `struct:a|Home|…`)
// and the manifest must reproduce that case exactly. Prefix (testid:|id:|…) is PRESERVED so two
// distinct machine keys that differ only by prefix (e.g. testid:save vs id:save) map to distinct
// Set entries and each requires its own manifest row.
function normalize(key) {
  return (key || '').trim();
}

function dispositionPayload(row, token) {
  const rx = new RegExp(`${token}\\s*:\\s*([^|\`\\n]+)`, 'i');
  return (row.raw.match(rx)?.[1] || '').trim();
}

function validManifestDisposition(row, walkMode) {
  if (!row.controlRef) return false;
  switch (row.disposition) {
    case 'covered-by-TC':
      return /\bTC-[A-Z0-9]+-[A-Z0-9]+-\d{3}\b/.test(row.raw);
    case 'affordance-probed':
      return dispositionPayload(row, 'affordance-probed').length > 0;
    case 'read-only-verified':
    case 'DIFFERENTIAL-DATA-REQUIRED':
      return true;
    case 'out-of-scope':
      return dispositionPayload(row, 'out-of-scope').length >= 20;
    case 'deferred-to-DEEP': {
      if (walkMode !== 'quick') return false;
      const m = row.raw.match(/deferred-to-DEEP\s*:\s*(\S+)\s+\(([^)]*)\)/i);
      return !!m && m[1].trim().length > 0 && m[2].trim().length >= 20;
    }
    default:
      return false;
  }
}

// ---- unreachable exemptions ------------------------------------------------------------------
function loadUnreachableExemptions() {
  const exemptionsPath = join(REPO_ROOT, '.claude', 'walk-exemptions.json');
  const keys = new Set();
  try {
    if (existsSync(exemptionsPath)) {
      const data = JSON.parse(readFileSync(exemptionsPath, 'utf-8'));
      for (const e of (data.unreachable_exemptions || [])) {
        for (const k of (e.keys || [])) keys.add(normalize(k));
      }
    }
  } catch { /* no valid exemptions */ }
  return keys;
}

// ---- unresolved allowlist (PLAN_70 Phase 5) -------------------------------------------------
// Not agent-writable. Fails closed on unreadable/malformed/stale entries.
function loadUnresolvedAllowlist() {
  const allowlistPath = join(REPO_ROOT, '.claude', 'walk-unresolved-allowlist.json');
  const keys = new Set();
  try {
    if (!existsSync(allowlistPath)) return keys;
    const data = JSON.parse(readFileSync(allowlistPath, 'utf-8'));
    if (!Array.isArray(data.exemptions)) return keys;
    for (const entry of data.exemptions) {
      // Fail closed: skip malformed, unreviewed, or stale entries
      if (!entry || typeof entry.key !== 'string' || !entry.key.trim()) continue;
      if (!entry.reviewer || typeof entry.reviewer !== 'string') continue;
      if (!entry.date || typeof entry.date !== 'string') continue;
      if (!entry.exemption_class || typeof entry.exemption_class !== 'string') continue;
      if (!entry.reason || typeof entry.reason !== 'string') continue;
      if (!entry.evidence || typeof entry.evidence !== 'string') continue;
      if (entry.reviewed !== true) continue;
      keys.add(entry.key.trim());
    }
  } catch { /* fail closed — unreadable means no exemptions */ }
  return keys;
}

// ---- read unresolved_probe_mode from guardrail-config ----------------------------------------
function readUnresolvedProbeMode() {
  try {
    const gcPath = join(REPO_ROOT, '.claude', 'guardrail-config.json');
    if (existsSync(gcPath)) {
      const gc = JSON.parse(readFileSync(gcPath, 'utf-8'));
      if (gc.unresolved_probe_mode === 'deny') return 'deny';
    }
  } catch { /* fail-safe to announce */ }
  return 'announce';
}

// ---- fire telemetry for the unresolved-probe gate -------------------------------------------
function fireDenominatorGateTelemetry(verdict, target) {
  try {
    const logPath = join(REPO_ROOT, '.claude', 'state', 'gate-fires.log');
    const line = `unresolved-probe-gate, ${new Date().toISOString()}, ${verdict}, ${target}\n`;
    appendFileSync(logPath, line, 'utf-8');
  } catch { /* telemetry is best-effort */ }
}

// ---- spec file finder -----------------------------------------------------------------------
function findSpecFiles(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      try {
        if (statSync(full).isDirectory()) findSpecFiles(full, acc);
        else if (entry.endsWith('.spec.ts')) acc.push(full);
      } catch { /* ignore inaccessible entries */ }
    }
  } catch { /* ignore unreadable dir */ }
  return acc;
}

// ---- crypto random index selection ----------------------------------------------------------
function pickRandom(arr, n) {
  if (n >= arr.length) return [...arr];
  const selected = [];
  const used = new Set();
  let attempts = 0;
  while (selected.length < n && attempts < n * 10) {
    attempts++;
    const bytes = randomBytes(4);
    const idx = bytes.readUInt32BE(0) % arr.length;
    if (!used.has(idx)) { used.add(idx); selected.push(arr[idx]); }
  }
  return selected;
}

function probeEvidencePath(rawPath) {
  return isAbsolute(rawPath) ? rawPath : resolve(REPO_ROOT, rawPath);
}

function validateProbeEvidence(state, moduleName, jsonPath, data, reasons) {
  const evidence = state.evidence || '';
  const m = evidence.match(/^probe:([^#]+)#(.+)$/);
  if (!m) {
    reasons.push(`probe evidence for "${state.label}" is malformed`);
    return;
  }

  const [, rawPath, fragment] = m;
  if (fragment !== state.label) {
    reasons.push(`probe evidence fragment mismatch: expected "${state.label}", got "${fragment}"`);
    return;
  }

  const artifactPath = probeEvidencePath(rawPath);
  if (!existsSync(artifactPath)) {
    reasons.push(`probe evidence not found: ${artifactPath}`);
    return;
  }

  let probeData;
  try {
    probeData = JSON.parse(readFileSync(artifactPath, 'utf-8'));
  } catch (err) {
    reasons.push(`probe evidence not valid JSON: ${artifactPath} (${err.message})`);
    return;
  }

  const entry = probeData?.[fragment];
  if (!entry || typeof entry !== 'object') {
    reasons.push(`probe evidence missing entry for "${fragment}"`);
    return;
  }

  const requiredFields = [
    'module',
    'state_label',
    'walk_artifact',
    'trigger',
    'observed_keys_before',
    'observed_keys_after',
    'generated_by',
    'generated_at',
    'git_head',
  ];
  const missingFields = requiredFields.filter(field => {
    const value = entry[field];
    if (Array.isArray(value)) return value.length === 0;
    return value == null || value === '';
  });
  if (missingFields.length > 0) {
    reasons.push(`probe evidence missing/empty fields for "${state.label}": ${missingFields.join(', ')}`);
    return;
  }

  if (entry.module !== moduleName) {
    reasons.push(`probe evidence module mismatch for "${state.label}": expected "${moduleName}", got "${entry.module}"`);
    return;
  }
  if (entry.state_label !== state.label) {
    reasons.push(`probe evidence state_label mismatch: expected "${state.label}", got "${entry.state_label}"`);
    return;
  }
  if (resolve(entry.walk_artifact) !== resolve(jsonPath)) {
    reasons.push(`probe evidence walk_artifact binding mismatch for "${state.label}": expected "${jsonPath}", got "${entry.walk_artifact}"`);
    return;
  }

  const restingKeys = new Set(data.entries.map(e => normalize(e.key)).filter(Boolean));
  if (restingKeys.size === 0) {
    reasons.push(`probe evidence resting inventory missing for "${state.label}"`);
    return;
  }

  const beforeKeys = entry.observed_keys_before.map(normalize).filter(Boolean);
  const afterKeys = entry.observed_keys_after.map(normalize).filter(Boolean);
  const newKeys = afterKeys.filter(key => !beforeKeys.includes(key));
  if (newKeys.length === 0) {
    reasons.push(`probe evidence no new keys for "${state.label}"`);
    return;
  }

  const beforeNotInResting = beforeKeys.filter(key => !restingKeys.has(key));
  if (beforeNotInResting.length > 0) {
    reasons.push(`probe evidence observed_keys_before not in resting inventory for "${state.label}": ${beforeNotInResting.join(', ')}`);
    return;
  }

  const afterNotInResting = afterKeys.filter(key => !restingKeys.has(key));
  if (afterNotInResting.length === 0) {
    reasons.push(`probe evidence no keys absent from resting inventory for "${state.label}"`);
  }
}

// ---- verifyDenominator ----------------------------------------------------------------------
/**
 * Verify the machine-enumerated denominator against the coverage manifest.
 *
 * @param {string} artifactText  Full markdown text of the walk artifact.
 * @param {string} jsonPath      Absolute path to the enumerator's walk-coverage JSON.
 * @returns {{ ok: boolean, reason?: string, reasons?: string[] }}
 *   ok:false with reasons on any gate failure. FAIL-CLOSED: missing/unreadable JSON → ok:false.
 */
export function verifyDenominator(artifactText, jsonPath) {
  // 1. Load JSON — FAIL-CLOSED: missing or unreadable always returns ok:false.
  if (!existsSync(jsonPath)) return { ok: false, reason: 'JSON not found/unreadable' };
  let data;
  try {
    data = JSON.parse(readFileSync(jsonPath, 'utf-8'));
  } catch {
    return { ok: false, reason: 'JSON not found/unreadable' };
  }
  if (!data || !Array.isArray(data.entries)) {
    return { ok: false, reason: 'JSON not found/unreadable' };
  }

  const reasons = [];

  // 2. Build normalized key sets.
  const machineKeys = new Set(data.entries.map(e => normalize(e.key)));
  const manifestRows = extractManifestRows(artifactText);
  const manifestKeys = new Set(manifestRows.map(r => normalize(r.controlRef)));
  const walkMode = (artifactText.match(/(?:\*\*)?Walk_Mode(?:\*\*)?\s*:\s*(quick|deep)\b/i)?.[1] || 'deep').toLowerCase();
  const dispositionedManifestKeys = new Set(
    manifestRows
      .filter(row => validManifestDisposition(row, walkMode))
      .map(row => normalize(row.controlRef))
      .filter(Boolean)
  );

  // 4a. missing = machineKeys \ manifestKeys → any non-empty → FAIL.
  const missing = [...machineKeys].filter(k => !manifestKeys.has(k));
  if (missing.length > 0) {
    reasons.push(`${missing.length} machine key(s) missing from manifest: ${missing.slice(0, 10).join(', ')}`);
  }

  // 4b. inflation = manifestKeys \ machineKeys → any non-zero → FAIL (zero tolerance).
  if (machineKeys.size > 0) {
    const inflation = [...manifestKeys].filter(k => !machineKeys.has(k));
    if (inflation.length > 0) {
      reasons.push(`manifest inflation ${inflation.length}/${machineKeys.size}: ${inflation.slice(0, 10).join(', ')}`);
    }
  }

  // 5. UNREACHABLE entries without exemption → FAIL.
  const exemptedUnreachable = loadUnreachableExemptions();
  const unreachable = data.entries.filter(
    e => e.status === 'UNREACHABLE' && !exemptedUnreachable.has(normalize(e.key)),
  );
  if (unreachable.length > 0) {
    reasons.push(`${unreachable.length} UNREACHABLE element(s) without exemption: ${unreachable.map(e => e.key).slice(0, 5).join(', ')}`);
  }

  // 6. requiredStates — parse Walk_State from artifactText, compare against MODULE_REQUIRED_STATES.
  const walkLineM = artifactText.match(/(?:\*\*)?Walk_State(?:\*\*)?\s*:\s*([^\n]+)/i);
  if (!walkLineM) {
    reasons.push('Walk_State line missing/unparseable — cannot verify required states');
  } else {
    const line = walkLineM[1];
    const modM = line.match(/\bmodule=(\S+)/);
    const walkedM = line.match(/\bwalked=\[([^\]]*)\]/);
    if (!modM || !walkedM) {
      reasons.push('Walk_State line missing/unparseable — cannot verify required states');
    } else {
      const moduleName = modM[1].trim();
      const walkedLabels = new Set(
        walkedM[1].split(',').map(s => s.trim()).filter(Boolean),
      );
      const requiredStates = MODULE_REQUIRED_STATES[moduleName]?.requiredStates ?? null;
      if (requiredStates !== null) {
        for (const state of requiredStates) {
          const { label } = state;
          if (!walkedLabels.has(label)) {
            if (state.evidence?.startsWith('probe:')) {
              validateProbeEvidence(state, moduleName, jsonPath, data, reasons);
            } else {
              reasons.push(`required walk state missing: "${label}" (module: ${moduleName})`);
            }
          }
        }
        // Item 1(c): a resting-only declaration must cite evidence (enumeration run reference).
        // A hand-written justification comment is not evidence.
        const nonResting = requiredStates.filter(s => s.label !== 'resting');
        if (nonResting.length === 0) {
          const restingEntry = requiredStates.find(s => s.label === 'resting');
          if (!restingEntry || !restingEntry.evidence) {
            reasons.push(`RESTING-ONLY TAUTOLOGY: module "${moduleName}" declares only resting as a required state with no evidence citation. Add an 'evidence' field citing the enumeration run that found zero openers.`);
          }
        }
      } else {
        // Item 2: an unregistered module FAILS — unknown module has no verification, which is
        // vacuous-on-zero at the surface level. Never a silent pass.
        reasons.push(`UNREGISTERED MODULE: "${moduleName}" has no entry in MODULE_REQUIRED_STATES — cannot verify required states. Register it in lib/module-config.mjs.`);
      }
    }
  }

  // Item 3: Unresolved-probe gate (PLAN_70 Phase 5 — replaces convicted ratio check).
  // Deny when: !derived_types || total === 0 || unresolvedCount > 0 (after allowlist).
  // No ratio. No threshold. Reads unresolved_probe_mode from guardrail-config (announce-first per LR-069 §3.3).
  if (!data.derived_types) {
    const msg = 'UNRESOLVED-PROBE-GATE: derived_types missing — denominator has no type resolution data';
    const mode = readUnresolvedProbeMode();
    fireDenominatorGateTelemetry(mode === 'deny' ? 'deny' : 'announce', jsonPath);
    if (mode === 'deny') reasons.push(msg);
    else reasons.push(`${ANNOUNCE_PREFIX}${msg}`);
  } else {
    const allKeys = Object.keys(data.derived_types);
    const total = allKeys.length;
    if (total === 0) {
      const msg = 'UNRESOLVED-PROBE-GATE: derived_types is empty (total === 0) — no controls to verify';
      const mode = readUnresolvedProbeMode();
      fireDenominatorGateTelemetry(mode === 'deny' ? 'deny' : 'announce', jsonPath);
      if (mode === 'deny') reasons.push(msg);
      else reasons.push(`${ANNOUNCE_PREFIX}${msg}`);
    } else {
      const allowlist = loadUnresolvedAllowlist();
      const unresolvedKeys = allKeys.filter(k => {
        const dt = data.derived_types[k];
        return (dt.probe === 'unresolved' || dt.probe === 'unresolvable')
          && !allowlist.has(k)
          && !dispositionedManifestKeys.has(normalize(k));
      });
      const unresolvedCount = unresolvedKeys.length;
      if (unresolvedCount > 0) {
        const sample = unresolvedKeys.slice(0, 10).join(', ');
        const msg = `UNRESOLVED-PROBE-GATE: ${unresolvedCount}/${total} control(s) unresolved after allowlist/manifest dispositions. Keys: ${sample}`;
        const mode = readUnresolvedProbeMode();
        fireDenominatorGateTelemetry(mode === 'deny' ? 'deny' : 'announce', jsonPath);
        if (mode === 'deny') reasons.push(msg);
        else reasons.push(`${ANNOUNCE_PREFIX}${msg}`);
      }
    }
  }

  // ── Phase 3: two-path denominator parity, tolerance ZERO ────────────────────────────────────
  // Path A (archetype expansion from derived_types × taxonomy) and Path B (census of emitted case
  // rows) are computed independently and must agree EXACTLY. The 37-vs-79 disagreement survived
  // because nobody ever put the two numbers beside each other; both are printed here either way.
  if (data.derived_types) {
    try {
      const taxonomy = loadFieldCaseTaxonomy();
      const pathA = computePathA(data.derived_types, taxonomy);

      // Path B needs the emitter's actual output. Its ABSENCE is a failure, never a skip —
      // "no case rows to compare" is exactly the vacuous-on-zero pass this plan exists to kill.
      const rowsPath = join(REPO_ROOT, 'reports', 'walk-coverage', 'case-rows.json');
      if (!existsSync(rowsPath)) {
        reasons.push(
          `PARITY UNVERIFIABLE: no case-rows artifact at reports/walk-coverage/case-rows.json — ` +
          `run emit-case-rows.mjs --out=<that path>. Path A computed ${pathA.total}; Path B unknown. ` +
          `An unverifiable denominator fails rather than passing silently.`
        );
      } else {
        const raw = JSON.parse(readFileSync(rowsPath, 'utf-8'));
        const allRows = Array.isArray(raw) ? raw : (raw.rows || raw.case_rows || []);

        // Scope Path B to the artifact under check. Prefer source_artifact provenance when
        // rows carry it (exact page-level scoping). Fall back to field_key membership for
        // legacy rows that predate the provenance field — but warn that this is coarser.
        const artifactLabel = jsonPath.replace(/^.*[/\\]/, '').replace(/\.json$/i, '');
        const artifactFieldKeys = new Set(Object.keys(data.derived_types));
        const { gridRowKeys: artGridKeys } = partitionControls(data.derived_types);
        for (const [unit] of gridUnits(artGridKeys)) {
          artifactFieldKeys.add(`grid:${unit}`);
        }

        const hasProvenance = allRows.some(r => r.source_artifact != null);
        let rows;
        let scopeMethod;
        if (hasProvenance) {
          rows = allRows.filter(r => r.source_artifact === artifactLabel);
          scopeMethod = 'source_artifact';
          // Fallback: if this artifact has no provenance-tagged rows yet, scope by field_key
          // (legacy rows predate the provenance field).
          if (rows.length === 0) {
            rows = allRows.filter(r => r.source_artifact == null && artifactFieldKeys.has(r.field_key));
            scopeMethod = 'field_key (fallback — legacy rows without source_artifact)';
          }
        } else {
          rows = allRows.filter(r => artifactFieldKeys.has(r.field_key));
          scopeMethod = 'field_key (coarser — shared keys across artifacts match identically)';
        }

        const parity = reconcile(pathA, computePathB(rows));

        // Row-membership validation (Finding CA-002): each row's field_key must exist in the
        // page record, and its field_type must match the record's resolved type (or 'UNRESOLVED'
        // when the control is unresolved). This is a THIRD check — it does NOT feed into Path A
        // or Path B computation, so it cannot collapse the two independent sides.
        const membershipErrors = [];
        for (const row of rows) {
          if (!row.field_key) continue;
          const entry = data.derived_types[row.field_key];
          if (!entry) {
            membershipErrors.push(`row field_key "${row.field_key}" not found in page record`);
            continue;
          }
          const expectedType = (!entry.resolved || entry.type === null) ? 'UNRESOLVED' : entry.type;
          if (row.field_type && row.field_type !== expectedType) {
            membershipErrors.push(
              `row "${row.field_key}" has field_type="${row.field_type}" but page record says "${expectedType}"`
            );
          }
        }
        if (membershipErrors.length > 0) {
          const sample = membershipErrors.slice(0, 5).join('; ');
          const more = membershipErrors.length > 5 ? ` (+${membershipErrors.length - 5} more)` : '';
          reasons.push(`ROW-MEMBERSHIP: ${membershipErrors.length} row(s) fail page-record validation: ${sample}${more}`);
        }

        // Compute unresolved ratio for the success message
        const dtKeys = Object.keys(data.derived_types);
        const { controlKeys: ckForMsg } = partitionControls(data.derived_types);
        const unresolvedForMsg = ckForMsg.filter(k => {
          const e = data.derived_types[k];
          return !e?.resolved || e?.type === null;
        }).length;
        const unresolvedNote = ckForMsg.length > 0 && unresolvedForMsg > 0
          ? ` NOTE: ${unresolvedForMsg}/${ckForMsg.length} controls unresolved — parity confirms equal widened estimates, not resolved coverage.`
          : '';

        console.error(`${parity.report} (artifact: ${artifactLabel}, scope: ${scopeMethod}, ${rows.length}/${allRows.length} rows matched)${unresolvedNote}`);
        reasons.push(...parity.reasons);
      }
    } catch (err) {
      // A taxonomy that will not parse means the denominator cannot be computed at all. That is a
      // hard failure: silently continuing would report a verdict on a number nobody produced.
      reasons.push(`PARITY ERROR: ${err.message}`);
    }
  }

  // ── G1 enforcement (PLAN_COVERAGE_TIER_CONTRACT Phase 3.3):
  // A deferred-to-DEEP row may not also carry any classification claim.
  // Deferral + any classification token on the same row = FAIL.
  const CLASSIFICATION_TOKENS = ['read-only-verified', 'affordance-probed', 'covered-by-TC', 'provenance:'];
  const deferralRows = manifestRows.filter(r => r.disposition === 'deferred-to-DEEP');
  for (const row of deferralRows) {
    const raw = (row.raw || '').toLowerCase();
    const clash = CLASSIFICATION_TOKENS.find(t => raw.includes(t.toLowerCase()));
    if (clash) {
      reasons.push(
        `G1 VIOLATION: row "${row.controlRef}" carries deferred-to-DEEP AND classification token "${clash}" — ` +
        `a deferral is "not walked", never "read-only" / "affordance-probed" / "covered"`
      );
    }
  }

  // Separate announce-only findings (non-blocking) from genuinely blocking findings.
  const blocking = reasons.filter(r => !r.startsWith(ANNOUNCE_PREFIX));
  const announcements = reasons.filter(r => r.startsWith(ANNOUNCE_PREFIX));

  if (blocking.length === 0 && announcements.length === 0) return { ok: true };
  if (blocking.length === 0) {
    // Announce findings are reported but do not block the verdict.
    return { ok: true, announcements, reasons };
  }
  return { ok: false, reason: reasons.join('; '), reasons, announcements };
}

// ---- spotAudit -------------------------------------------------------------------------------
/**
 * Spot-audit: draw N random non-out-of-scope rows from the Coverage Manifest; for each
 * covered-by-TC row, verify its TC id appears in tests/**\/*.spec.ts.
 *
 * N = min(5, max(1, ceil(rows * 0.1))). Seed comes from crypto.randomBytes (gate-time, unpredictable).
 *
 * @param {string} artifactText  Full markdown text of the walk artifact.
 * @returns {{ ok: boolean, failures: string[], checked: number }}
 */
export function spotAudit(artifactText) {
  const allRows = extractManifestRows(artifactText);
  const eligible = allRows.filter(r => r.disposition !== 'out-of-scope');

  if (eligible.length === 0) return { ok: true, failures: [], checked: 0 };

  const n = Math.min(5, Math.max(1, Math.ceil(eligible.length * 0.1)));
  const sample = pickRandom(eligible, n);

  // Lazy-load spec files once.
  const specDir = join(REPO_ROOT, 'tests');
  const specFiles = findSpecFiles(specDir);
  const specContents = specFiles.map(f => {
    try { return readFileSync(f, 'utf-8'); } catch { return ''; }
  });

  const failures = [];
  const TC_RX = /TC-([A-Z]+-[A-Z]+-\d{3})/;

  for (const row of sample) {
    if (row.disposition !== 'covered-by-TC') continue;
    const tcM = row.raw.match(TC_RX);
    if (!tcM) { failures.push(`${row.controlRef}: covered-by-TC but no valid TC id`); continue; }
    const tcId = `TC-${tcM[1]}`;
    const found = specContents.some(content => content.includes(tcId));
    if (!found) {
      failures.push(`${row.controlRef}: TC ${tcId} not found in any spec file`);
    }
  }

  return { ok: failures.length === 0, failures, checked: sample.length };
}
