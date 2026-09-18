#!/usr/bin/env node
/**
 * check-walk-observations.mjs
 *
 * Validates that walk artifacts (field-inventories and walk-evidence files) carry
 * their required findings sections with non-blank content.
 *
 * Canonical shape (what the migration ticket conforms to):
 *   ## Observations
 *   ### Bugs / Defects
 *   <content or explicit "none">
 *   ### Suggestions / Improvements
 *   <content or explicit "none">
 *
 * Legacy shape (accepted but flagged for migration):
 *   ## Known App Bugs
 *   <content or explicit "none">
 *
 * FAIL states:
 *   - missing-section: No findings section at all
 *   - blank-section: Section header present but no content beneath it
 *
 * Exit codes: 0 = all pass, 1 = failures found, 2 = zero artifacts (vacuous)
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';

const ARTIFACT_ROOT = resolve(
  process.argv[2] ||
    join(process.cwd(), 'clients', 'encore', 'specs_planning', '_internal')
);

// --- Helpers ---

function getFilesInDir(dir, pattern) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
  return readdirSync(dir)
    .filter((f) => pattern.test(f))
    .map((f) => join(dir, f));
}

function getSectionContent(lines, sectionHeading, level = 2) {
  const prefix = '#'.repeat(level) + ' ';
  const headingLine = `${prefix}${sectionHeading}`;
  let startIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === headingLine) {
      startIdx = i + 1;
      break;
    }
  }
  if (startIdx === -1) return null; // section missing

  // Collect content until next heading of same or higher level
  const endPattern = new RegExp(`^#{1,${level}} `);
  const content = [];
  for (let i = startIdx; i < lines.length; i++) {
    if (endPattern.test(lines[i].trim())) break;
    content.push(lines[i]);
  }
  return content.join('\n').trim();
}

function isBlank(content) {
  return content !== null && content.length === 0;
}

function isMissing(content) {
  return content === null;
}

function hasDefectSignature(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  if (/^\s*none\b/i.test(text)) return false;
  // Heuristic: mentions bug-like words
  return /\b(bug|defect|broken|incorrect|fail|crash|error|wrong|missing|regression)\b/i.test(lower);
}

function hasEscalation(text) {
  if (!text) return false;
  return (
    /BUG-\d+/i.test(text) ||
    /[A-Z]+-\d{3,}/.test(text) || // Jira-style
    /flagged/i.test(text) ||
    /filed/i.test(text)
  );
}

// --- Main validation ---

function validateArtifact(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const name = basename(filePath);

  const result = {
    file: name,
    path: filePath,
    status: null, // 'conforming' | 'legacy' | 'missing-section' | 'blank-section'
    messages: [],
    warnings: [],
  };

  // Check canonical shape: ## Observations → ### Bugs / Defects + ### Suggestions / Improvements
  const obsContent = getSectionContent(lines, 'Observations', 2);

  if (obsContent !== null) {
    // Has ## Observations — check subsections
    const bugsContent = getSectionContent(lines, 'Bugs / Defects', 3);
    const suggestionsContent = getSectionContent(lines, 'Suggestions / Improvements', 3);

    if (isMissing(bugsContent) || isMissing(suggestionsContent)) {
      result.status = 'blank-section';
      result.messages.push(
        `FAIL [blank-section]: "${name}" has ## Observations but is missing required subsection(s): ` +
          `${isMissing(bugsContent) ? '### Bugs / Defects' : ''}${isMissing(bugsContent) && isMissing(suggestionsContent) ? ', ' : ''}` +
          `${isMissing(suggestionsContent) ? '### Suggestions / Improvements' : ''}`
      );
      return result;
    }

    if (isBlank(bugsContent) || isBlank(suggestionsContent)) {
      result.status = 'blank-section';
      const blanks = [];
      if (isBlank(bugsContent)) blanks.push('### Bugs / Defects');
      if (isBlank(suggestionsContent)) blanks.push('### Suggestions / Improvements');
      result.messages.push(
        `FAIL [blank-section]: "${name}" has subsection header(s) with no content beneath: ${blanks.join(', ')}. ` +
          `Write explicit "none" if nothing was observed.`
      );
      return result;
    }

    // Conforming — check escalation disposition
    if (hasDefectSignature(bugsContent) && !hasEscalation(bugsContent)) {
      result.warnings.push(
        `WARN [unescalated]: "${name}" ### Bugs / Defects describes a defect but carries no escalation ` +
          `disposition (expected: BUG-NNN reference or "flagged — not filed" with reason).`
      );
    }

    result.status = 'conforming';
    return result;
  }

  // Check legacy shape: ## Known App Bugs
  const knownBugsContent = getSectionContent(lines, 'Known App Bugs', 2);

  if (knownBugsContent !== null) {
    if (isBlank(knownBugsContent)) {
      result.status = 'blank-section';
      result.messages.push(
        `FAIL [blank-section]: "${name}" has ## Known App Bugs header but no content beneath it. ` +
          `Write explicit "none" if no bugs were observed.`
      );
      return result;
    }

    // Legacy shape — accepted but flagged for migration
    if (hasDefectSignature(knownBugsContent) && !hasEscalation(knownBugsContent)) {
      result.warnings.push(
        `WARN [unescalated]: "${name}" ## Known App Bugs describes a defect but carries no escalation ` +
          `disposition (expected: BUG-NNN reference or "flagged — not filed" with reason).`
      );
    }

    result.status = 'legacy';
    result.messages.push(
      `LEGACY: "${name}" uses ## Known App Bugs (needs migration to canonical ## Observations shape).`
    );
    return result;
  }

  // Neither section present — missing
  result.status = 'missing-section';
  result.messages.push(
    `FAIL [missing-section]: "${name}" has no findings section. ` +
      `Required: ## Observations (with ### Bugs / Defects + ### Suggestions / Improvements), ` +
      `or legacy ## Known App Bugs pending migration.`
  );
  return result;
}

// --- Run ---

function run() {
  const inventoryDir = join(ARTIFACT_ROOT, 'field-inventories');
  const walkEvidencePattern = /^walk-evidence-.*\.md$/;
  const inventoryPattern = /^(?!_TEMPLATE).*\.md$/;

  const walkFiles = getFilesInDir(ARTIFACT_ROOT, walkEvidencePattern);
  const inventoryFiles = getFilesInDir(inventoryDir, inventoryPattern);
  const allFiles = [...walkFiles, ...inventoryFiles];

  // Vacuous-on-zero: FAIL if nothing to check
  if (allFiles.length === 0) {
    console.error(
      `FAIL [vacuous]: Found ZERO walk artifacts to check.\n` +
        `  Searched: ${ARTIFACT_ROOT}\n` +
        `  Walk-evidence glob: walk-evidence-*.md\n` +
        `  Inventory dir: ${inventoryDir}\n` +
        `  Inventory glob: *.md (excluding _TEMPLATE.md)\n` +
        `This validator refuses to pass on empty input.`
    );
    process.exit(2);
  }

  const results = allFiles.map(validateArtifact);

  // Counts
  const conforming = results.filter((r) => r.status === 'conforming');
  const legacy = results.filter((r) => r.status === 'legacy');
  const missing = results.filter((r) => r.status === 'missing-section');
  const blank = results.filter((r) => r.status === 'blank-section');

  // Output
  console.log('=== check-walk-observations ===\n');
  console.log(`Scanned: ${allFiles.length} artifacts`);
  console.log(`  Root: ${ARTIFACT_ROOT}\n`);

  console.log('--- COUNTS ---');
  console.log(`  conforming:      ${conforming.length}`);
  console.log(`  legacy-shape:    ${legacy.length}`);
  console.log(`  missing-section: ${missing.length}`);
  console.log(`  blank-section:   ${blank.length}`);
  console.log('');

  // Print failures
  const failures = [...missing, ...blank];
  if (failures.length > 0) {
    console.log('--- FAILURES ---');
    for (const r of failures) {
      for (const m of r.messages) console.log(`  ${m}`);
    }
    console.log('');
  }

  // Print legacy
  if (legacy.length > 0) {
    console.log('--- LEGACY (needs migration) ---');
    for (const r of legacy) {
      for (const m of r.messages) console.log(`  ${m}`);
    }
    console.log('');
  }

  // Print warnings
  const warnings = results.filter((r) => r.warnings.length > 0);
  if (warnings.length > 0) {
    console.log('--- WARNINGS (unescalated defects) ---');
    for (const r of warnings) {
      for (const w of r.warnings) console.log(`  ${w}`);
    }
    console.log('');
  }

  // Exit
  if (failures.length > 0) {
    console.log(`RESULT: FAIL (${failures.length} artifact(s) need attention)`);
    process.exit(1);
  } else {
    console.log('RESULT: PASS (all artifacts have findings sections)');
    process.exit(0);
  }
}

run();
