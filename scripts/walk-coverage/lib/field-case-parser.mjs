// scripts/walk-coverage/lib/field-case-parser.mjs
// Phase 2a — single-source case-taxonomy parser.
//
// Parses specs_planning/_internal/field-case-generation.md at runtime.
// Never copies the taxonomy — the source file is the single source of truth.
//
// Exports:
//   parseFieldCaseTaxonomy(markdownText) → { fieldTypes, surfaceFamilies }
//   loadFieldCaseTaxonomy(path?)         → calls the parser on the real file
//
// Fail-closed: missing headings, renamed header columns, or zero data rows → throw.
// No empty catch blocks (LR-003).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DEFAULT_SOURCE_URL = new URL(
  '../../../specs_planning/_internal/field-case-generation.md',
  import.meta.url
);

// Prefix patterns for section headings — match the section marker up to the em-dash,
// so any parenthetical suffix humans add later continues to match.
// §2 must NOT match §2.1 — the negative lookahead after "2" ensures this.
const S2_PREFIX    = /^##\s*§2(?!\.)\s*—/;
const S21_PREFIX   = /^##\s*§2\.1\s*—/;
const S3_PREFIX    = /^##\s*§3\s*—/;

const EXPECTED_S2_COLS = [
  'Field type',
  'Positive cases',
  'BVA cases',
  'Negative cases',
  'Save-cycle cases',
];

// The 7 active surface families defined in §3. Any §3 table with fewer throws.
const REQUIRED_S3_FAMILIES = [
  'result-fidelity',
  'pagination',
  'sorting',
  'combination',
  'render-state',
  'empty-vol',
  'persistence',
];

// ── internal helpers ────────────────────────────────────────────────────────

/**
 * Convert a field-type name to a stable lowercase slug usable as a caseId prefix.
 * e.g. "Numeric / spinbutton" → "numeric-spinbutton"
 */
function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Split a case cell on commas and semicolons, but NOT on commas/semicolons that
 * appear inside double-quoted strings or inside parentheses.
 *
 * Examples that must NOT split on inner punctuation:
 *   "1.2.3"          → one token (quoted segment treated as atomic)
 *   foo (LR-009)     → one token (paren content is not a split point)
 *   "a,b", c         → two tokens: ["a,b", "c"]
 *   x (a, b), y      → two tokens: ["x (a, b)", "y"]
 */
function splitCasesCell(cell) {
  const src = cell.trim();
  if (!src) return [];

  const tokens = [];
  let current = '';
  let parenDepth = 0;
  let inDblQuote = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];

    if (ch === '"') {
      inDblQuote = !inDblQuote;
      current += ch;
    } else if (!inDblQuote && ch === '(') {
      parenDepth++;
      current += ch;
    } else if (!inDblQuote && ch === ')') {
      parenDepth--;
      current += ch;
    } else if (!inDblQuote && parenDepth === 0 && (ch === ',' || ch === ';')) {
      const tok = current.trim();
      if (tok) tokens.push(tok);
      current = '';
    } else {
      current += ch;
    }
  }

  const last = current.trim();
  if (last) tokens.push(last);
  return tokens;
}

/**
 * Return true if a BVA case input is "out-of-range" — i.e. it lies outside the
 * valid domain and therefore requires the §2.1 rejection-affordance oracle.
 *
 * Heuristic: an input token is out-of-range when it explicitly encodes
 * "below minimum" (min-N) or "above maximum" (max+N). Boundary-inclusive values
 * such as "min" and "max" themselves are valid and do NOT require the oracle.
 */
function isBvaOutOfRange(input) {
  return /\bmin-\d|\bmax\+\d/i.test(input);
}

/**
 * Find the line index of the first line whose trimmed content matches the given
 * prefix regex pattern, or -1 if absent.
 */
function findHeading(lines, pattern) {
  for (let i = 0; i < lines.length; i++) {
    if (pattern.test(lines[i].trim())) return i;
  }
  return -1;
}

/**
 * Find the index of the first `|`-prefixed line at or after startIdx, or -1.
 */
function findTableStart(lines, startIdx) {
  for (let i = startIdx; i < lines.length; i++) {
    if (lines[i].trim().startsWith('|')) return i;
  }
  return -1;
}

/**
 * Parse a markdown table body starting at `dataStart` (i.e. the line after the
 * separator row). Stops at the first line that does NOT start with `|`.
 * Returns an array of string[] — one entry per column per row.
 */
function parseTableRows(lines, dataStart) {
  const rows = [];
  for (let i = dataStart; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed.startsWith('|')) break;
    const cols = trimmed.split('|').slice(1, -1).map(c => c.trim());
    rows.push(cols);
  }
  return rows;
}

// ── public API ──────────────────────────────────────────────────────────────

/**
 * Parse the field-case taxonomy from a markdown string.
 *
 * Returns:
 * {
 *   fieldTypes: Array<{
 *     type: string,
 *     cases: Array<{
 *       caseId: string,          // "fcc:<type-slug>:<category>:<index>" — internal only, never a shipped TC id
 *       category: 'positive'|'bva'|'negative'|'save-cycle',
 *       input: string,
 *       requiresOracle: boolean
 *     }>
 *   }>,
 *   surfaceFamilies: Array<{
 *     family: string,
 *     cases: Array<{
 *       caseId: string,          // "sbc:<family>:<depth>:<index>" — internal only
 *       depth: 'QUICK'|'DEEP',
 *       input: string
 *     }>
 *   }>
 * }
 *
 * Throws on: missing §2 or §3 headings, renamed §2 header columns, zero §2 data
 * rows, or any of the 7 required §3 surface families absent from the table.
 */
export function parseFieldCaseTaxonomy(markdownText) {
  const lines = markdownText.split('\n');

  // ── §2 parse ──────────────────────────────────────────────────────────────

  const s2HeadingIdx = findHeading(lines, S2_PREFIX);
  if (s2HeadingIdx === -1) {
    throw new Error(
      `[field-case-parser] §2 heading not found. Expected a line matching: ${S2_PREFIX}`
    );
  }

  const s2HeaderIdx = findTableStart(lines, s2HeadingIdx + 1);
  if (s2HeaderIdx === -1) {
    throw new Error('[field-case-parser] §2 table header row not found after heading');
  }

  const headerCols = lines[s2HeaderIdx]
    .split('|')
    .slice(1, -1)
    .map(c => c.trim());

  for (const expected of EXPECTED_S2_COLS) {
    if (!headerCols.includes(expected)) {
      throw new Error(
        `[field-case-parser] §2 header column "${expected}" not found. ` +
        `Got columns: ${headerCols.map(c => `"${c}"`).join(', ')}`
      );
    }
  }

  // s2HeaderIdx+1 is the separator row (|---|---|...|); data starts at +2
  const s2DataStart = s2HeaderIdx + 2;
  const s2Rows = parseTableRows(lines, s2DataStart);

  if (s2Rows.length === 0) {
    throw new Error(
      '[field-case-parser] §2 table has zero data rows — taxonomy cannot be empty'
    );
  }

  const colIdx = {
    type:      headerCols.indexOf('Field type'),
    positive:  headerCols.indexOf('Positive cases'),
    bva:       headerCols.indexOf('BVA cases'),
    negative:  headerCols.indexOf('Negative cases'),
    saveCycle: headerCols.indexOf('Save-cycle cases'),
  };

  const fieldTypes = s2Rows.map(row => {
    const typeName = (row[colIdx.type] ?? '').trim();
    const typeSlug = slugify(typeName);
    const cases = [];

    const addCases = (rawCell, category) => {
      const tokens = splitCasesCell(rawCell ?? '');
      tokens.forEach((input, i) => {
        let requiresOracle = false;
        if (category === 'negative') {
          requiresOracle = true;
        } else if (category === 'bva') {
          requiresOracle = isBvaOutOfRange(input);
        }
        cases.push({
          caseId: `fcc:${typeSlug}:${category}:${i}`,
          category,
          input,
          requiresOracle,
        });
      });
    };

    addCases(row[colIdx.positive],  'positive');
    addCases(row[colIdx.bva],       'bva');
    addCases(row[colIdx.negative],  'negative');
    addCases(row[colIdx.saveCycle], 'save-cycle');

    return { type: typeName, cases };
  });

  // ── §3 parse ──────────────────────────────────────────────────────────────

  const s3HeadingIdx = findHeading(lines, S3_PREFIX);
  if (s3HeadingIdx === -1) {
    throw new Error(
      `[field-case-parser] §3 heading not found. Expected a line matching: ${S3_PREFIX}`
    );
  }

  const s3HeaderIdx = findTableStart(lines, s3HeadingIdx + 1);
  if (s3HeaderIdx === -1) {
    throw new Error('[field-case-parser] §3 table header row not found after heading');
  }

  // s3HeaderIdx+1 = separator; data at +2
  const s3DataStart = s3HeaderIdx + 2;
  const s3Rows = parseTableRows(lines, s3DataStart);

  // Column layout: Family=0, Trigger=1, QUICK=2, DEEP=3, Encore-specifics=4
  const surfaceFamilies = s3Rows
    .filter(row => row.length >= 3)
    .map(row => {
      const family = row[0].replace(/`/g, '').trim();
      const quickCases = splitCasesCell(row[2] ?? '').map((input, i) => ({
        caseId: `sbc:${family}:quick:${i}`,
        depth: 'QUICK',
        input,
      }));
      const deepCases = splitCasesCell(row[3] ?? '').map((input, i) => ({
        caseId: `sbc:${family}:deep:${i}`,
        depth: 'DEEP',
        input,
      }));
      return { family, cases: [...quickCases, ...deepCases] };
    });

  const foundFamilies = surfaceFamilies.map(f => f.family);
  const missingFamilies = REQUIRED_S3_FAMILIES.filter(f => !foundFamilies.includes(f));
  if (missingFamilies.length > 0) {
    throw new Error(
      `[field-case-parser] §3 missing required surface families: ${missingFamilies.join(', ')}. ` +
      `Found: ${foundFamilies.join(', ')}`
    );
  }

  // Return only the 7 required families (skip any deferred/extra rows)
  const filteredFamilies = REQUIRED_S3_FAMILIES.map(
    name => surfaceFamilies.find(f => f.family === name)
  );

  return { fieldTypes, surfaceFamilies: filteredFamilies };
}

/**
 * Read the default source file (or an explicit path) and parse it.
 * Throws if the file cannot be read or the parse fails.
 */
export function loadFieldCaseTaxonomy(path) {
  const resolvedPath = path ?? fileURLToPath(DEFAULT_SOURCE_URL);
  const text = readFileSync(resolvedPath, 'utf-8');
  return parseFieldCaseTaxonomy(text);
}
