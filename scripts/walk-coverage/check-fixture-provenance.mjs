// GUARDRAIL: check-fixture-provenance
// Sev: S1 — silent quality drift that would survive to ship: a fixture whose quote no longer
//   matches its source still passes every other check.
// Graduating incident: the first fixtures pass shipped reconstructed quotes (0 of 6 verifiable)
//   and was bounced — recorded in plans/pending/PLAN_FORCED_DISCOVERY_LOCATOR_EXHAUSTION.md.
// Mode: fixture_provenance_mode in .claude/guardrail-config.json (announce, ramp to deny per LR-069 §3.3).
// Ramp criterion: promote to deny after 10 clean sessions with zero false positives.

// Provenance check for the kernel-oracle fixtures.
// Each specimen cites a real walk-evidence file and carries a sourceQuote.
// This verifies the quote actually appears in the file it claims to come from.
// Elision-aware: a quote may contain "..." / "…" joining non-adjacent fragments;
// each fragment must appear, and in order.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const FIXTURES = 'scripts/walk-coverage/fixtures/kernel-oracle-fixtures.json';
const EVIDENCE_DIR = 'specs_planning/_internal';

const fx = JSON.parse(readFileSync(FIXTURES, 'utf8'));
const specimens = fx.specimens || [];

// Collapse whitespace so a re-wrapped transcription still matches its source.
const norm = (s) => String(s).replace(/\s+/g, ' ').trim();

let bad = 0;
let checked = 0;

for (const [i, sp] of specimens.entries()) {
  const id = sp.id || sp.name || '#' + i;
  const src = sp.source || sp.sourceFile || sp.provenance;
  const quote = sp.sourceQuote;

  if (!src) { console.log('  NO-SOURCE   : ' + id); bad++; continue; }
  if (!quote) { console.log('  NO-QUOTE    : ' + id + ' (cites ' + src + ')'); bad++; continue; }

  const path = join(EVIDENCE_DIR, src);
  if (!existsSync(path)) { console.log('  MISSING-FILE: ' + id + ' -> ' + src); bad++; continue; }

  const hay = norm(readFileSync(path, 'utf8'));
  const fragments = norm(quote).split(/\s*(?:\.\.\.|…)\s*/).filter((f) => f.length > 12);

  if (fragments.length === 0) { console.log('  QUOTE-TOO-SHORT: ' + id); bad++; continue; }

  let cursor = 0;
  let allFound = true;
  let missing = null;
  for (const f of fragments) {
    const at = hay.indexOf(f, cursor);
    if (at === -1) { allFound = false; missing = f; break; }
    cursor = at + f.length;
  }

  checked++;
  if (allFound) {
    console.log('  ok          : ' + id + ' -> ' + src + ' (' + fragments.length + ' fragment(s) verbatim, in order)');
  } else {
    bad++;
    console.log('  NOT-IN-SOURCE: ' + id + ' -> ' + src);
    console.log('       missing fragment: "' + missing.slice(0, 110) + '"');
  }
}

console.log('');
console.log('specimens: ' + specimens.length + ' | verified: ' + checked + ' | problems: ' + bad);
console.log(bad === 0 ? 'VERDICT: every fixture quote is verbatim in its cited evidence file'
                      : 'VERDICT: ' + bad + ' specimen(s) failed provenance');
process.exit(bad === 0 ? 0 : 1);
