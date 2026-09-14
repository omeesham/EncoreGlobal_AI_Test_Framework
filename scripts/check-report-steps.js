#!/usr/bin/env node
/**
 * Reports what is still missing from a spec's numbered run in the HTML report.
 *
 * Numbering is automatic: every step created at the top level of a test body is numbered
 * "Step N: ..." (src/fixtures/report-steps.ts), and the `@step` decorator routes through the same
 * place — so a page-object call made straight from a test body already numbers itself, with no
 * wrapper. Hook bodies are excluded, so setup never spends "Step 1".
 *
 * Two things at a test's top level still reach the report WITHOUT a name, and those are what this
 * flags:
 *   - bare `expect(...)` — lands as "Expect toBe"; wrap it in `verify('what this proves', ...)`
 *   - raw `page.` / `locator(...)` / `getBy*` actions — no page object behind them, so no step
 *     name; wrap in `phase('what this does', ...)`, or move it behind a page-object method
 *   - raw `test.step(...)` — named, but it goes around the numbering; swap it for `phase()` or
 *     `verify()`, which take the same arguments and return the same value
 *
 * A bare page-object call is NOT flagged: it is already a numbered, named step. Wrapping one in a
 * `phase()` is still worth doing where the business phrase says more than the method name, or
 * where several calls belong to one step — that is naming, which this script cannot judge.
 *
 * Nested lines are ignored: inside a phase, calling page objects and asserting freely is the
 * point. Hook bodies are ignored too — they stay out of the numbering by design.
 *
 * Usage: node scripts/check-report-steps.js [file...]     (default: every tests/**\/*.spec.ts)
 *        --list-converted   print per-file step counts instead of checking
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TESTS = path.join(ROOT, 'tests');

/** Spec files that opt out, with the reason. */
const EXEMPT = new Map([
  ['tests/seed.spec.ts', 'empty template stub — no actions to report'],
]);

function specFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...specFiles(full));
    else if (entry.name.endsWith('.spec.ts')) out.push(full);
  }
  return out;
}

/**
 * Lines that open a step wrapper, so the checker knows a bare call is legitimately nested.
 * `about()` names its own step -- the plain-language "About this test" summary that opens a
 * spec -- so it is a named line in its own right, not an unnamed raw action.
 */
const WRAPPER = /\b(about|phase|verify)\s*\(/;
/** A local arrow helper in the spec that itself returns a phase(...) — treated as a wrapper. */
function localWrappers(src) {
  const names = new Set();
  const re = /const\s+([A-Za-z0-9_]+)\s*=\s*\([^)]*\)\s*(?::[^=]+)?=>\s*\n?\s*(?:phase|verify)\s*\(/g;
  let m;
  while ((m = re.exec(src))) names.add(m[1]);
  return names;
}

function check(file) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  if (EXEMPT.has(rel)) return { rel, exempt: EXEMPT.get(rel), problems: [] };

  const src = fs.readFileSync(file, 'utf8');
  const lines = src.split('\n');
  const helpers = localWrappers(src);
  const problems = [];

  let bodyIndent = null; // indent of the current test body's top level
  let inHook = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const indent = line.length - line.trimStart().length;

    const opensTest = /^\s*test(\.\w+)*\s*\(/.test(line) && !/^\s*test\.(describe|setTimeout|slow|use|info)\b/.test(line);
    const opensHook = /^\s*test\.(beforeEach|afterEach|beforeAll|afterAll)\s*\(/.test(line);

    if (opensHook) {
      inHook = true;
      bodyIndent = indent + 2;
      continue;
    }
    if (opensTest) {
      inHook = false;
      bodyIndent = indent + 2;
      continue;
    }
    if (bodyIndent === null) continue;

    // Dedent past the body closes the block we were tracking.
    if (indent < bodyIndent) {
      bodyIndent = null;
      inHook = false;
      continue;
    }
    if (inHook || indent !== bodyIndent) continue;

    const trimmed = line.trim();
    const isWrapped = WRAPPER.test(trimmed) || [...helpers].some((h) => trimmed.includes(h + '('));
    const isAwait = /^(const|let|var)?\s*[A-Za-z0-9_{}[\],:\s]*=?\s*await\s/.test(trimmed) || trimmed.startsWith('await ');
    const isExpect = /^await\s+expect[.(]/.test(trimmed) || /^expect[.(]/.test(trimmed);

    // A raw page drive has no page-object method behind it, so nothing names it in the report.
    const isRawPageAction = /\.page\.|\blocator\(|\bgetBy[A-Z]|\bpage\./.test(trimmed);

    // A raw test.step() reports a named step but goes around the numbering entirely.
    if (/^await\s+test\.step\s*\(/.test(trimmed)) {
      problems.push({ line: i + 1, kind: 'unnumbered test.step', text: trimmed.slice(0, 90) });
    } else if (isExpect && !isWrapped) {
      problems.push({ line: i + 1, kind: 'unnamed assertion', text: trimmed.slice(0, 90) });
    } else if (isAwait && !isWrapped && isRawPageAction) {
      problems.push({ line: i + 1, kind: 'unnamed raw action', text: trimmed.slice(0, 90) });
    }
    // else: a bare page-object call — already numbered and named by the @step decorator.
  }
  return { rel, problems };
}

const args = process.argv.slice(2);
const targets = args.filter((a) => !a.startsWith('--'));
const files = targets.length ? targets.map((t) => path.resolve(ROOT, t)) : specFiles(TESTS);

let bad = 0;
let clean = 0;
let skipped = 0;
for (const file of files) {
  const { rel, exempt, problems } = check(file);
  if (exempt) {
    skipped += 1;
    continue;
  }
  if (!problems.length) {
    clean += 1;
    continue;
  }
  bad += problems.length;
  console.log(`\n${rel}`);
  for (const p of problems) console.log(`  ${rel}:${p.line}  ${p.kind}: ${p.text}`);
}

console.log(
  `\n[check:steps] ${clean}/${files.length - skipped} spec files fully named` +
    (bad ? `, ${bad} line(s) reporting without a name (every step is still numbered)` : ''),
);
process.exit(bad && process.argv.includes('--strict') ? 1 : 0);
