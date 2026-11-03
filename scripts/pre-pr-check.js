#!/usr/bin/env node
// Pre-PR gate: catches, locally, the classes of defect that Copilot / Cursor Bugbot raised on
// PR #4948 (NM-4129) so the next PR does not collect the same review findings.
//
//   npm run pre-pr                      # full run against origin/develop
//   npm run pre-pr -- --fast            # skip tsc + playwright --list (seconds, not minutes)
//   npm run pre-pr -- --base origin/main --strict
//
// Exit code 1 when any ERROR is found (or any WARN under --strict). Every finding names the
// review comment it guards against, so the fix is obvious from the output alone.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

// Projects whose specs save whole forms against shared offices; parallel workers clobber each
// other there. Review: "Prevent concurrent suites from sharing mutation offices".
const MUTATION_PROJECTS = ['encore-locations', 'encore-local-office'];

// Packages with a known-vulnerable npm line. SheetJS stopped publishing to npm at 0.18.5; the
// patched builds live on its CDN. Review: "Retain patched SheetJS release to avoid vulnerabilities".
const VULNERABLE_BELOW = {
  xlsx: { min: '0.20.2', fix: '"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"' },
};

// Files whose path references must resolve: a dangling one here breaks a command a reader runs.
const STRICT_REF_FILES = new Set(['package.json', 'playwright.config.ts', 'README.md']);

const TESTID_RE = /data-testid|getByTestId|testid/i;
const LOCALIZED_SELECTOR_RE = /aria-label\s*=\s*["'][A-Za-z][^"']*["']|:text(?:-is)?\(|:has-text\(|getByText\(|getByLabel\(/;

// ---------------------------------------------------------------- args

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const FAST = flag('--fast');
const STRICT = flag('--strict');
const NO_FETCH = flag('--no-fetch');

// ---------------------------------------------------------------- helpers

function git(...gitArgs) {
  return execFileSync('git', gitArgs, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function gitOk(...gitArgs) {
  try {
    git(...gitArgs);
    return true;
  } catch {
    return false;
  }
}

function readAt(ref, file) {
  try {
    return git('show', `${ref}:${file}`);
  } catch {
    return null;
  }
}

function readNow(file) {
  const abs = path.join(ROOT, file);
  return fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
}

function run(cmd, cmdArgs, env = {}) {
  return spawnSync(cmd, cmdArgs, {
    cwd: ROOT,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    env: { ...process.env, ...env },
    maxBuffer: 64 * 1024 * 1024,
  });
}

/** "^1.2.3" -> [1,2,3]; null for URLs, tags and ranges we cannot order. */
function parseVersion(spec) {
  const m = /^[\^~>=v\s]*(\d+)\.(\d+)\.(\d+)/.exec(String(spec || ''));
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function compareVersions(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

const findings = [];
function report(severity, check, message, where, review) {
  findings.push({ severity, check, message, where, review });
}

// ---------------------------------------------------------------- base / diff

function resolveBase() {
  const requested = option('--base') || process.env.PR_BASE || 'origin/develop';
  if (!NO_FETCH && requested.startsWith('origin/')) {
    // Best effort: an offline run still checks against the last fetched base.
    try {
      git('fetch', '--quiet', 'origin', requested.slice('origin/'.length));
    } catch {
      /* offline */
    }
  }
  for (const ref of [requested, 'origin/main']) {
    if (gitOk('rev-parse', '--verify', '--quiet', `${ref}^{commit}`)) return ref;
  }
  throw new Error(`Base ref "${requested}" not found. Pass --base <ref>.`);
}

const BASE = resolveBase();
const MERGE_BASE = git('merge-base', BASE, 'HEAD');
const TRACKED = new Set(git('ls-files').split('\n').filter(Boolean));

/** name-status of everything that differs from the merge base, working tree included. */
const changes = git('diff', '--name-status', '-M', MERGE_BASE)
  .split('\n')
  .filter(Boolean)
  .map((line) => {
    const parts = line.split('\t');
    const status = parts[0][0];
    return status === 'R'
      ? { status, from: parts[1], file: parts[2] }
      : { status, file: parts[1], from: parts[1] };
  });

const changedFiles = changes.filter((c) => c.status !== 'D').map((c) => c.file);

/** Added lines per file as { line, text } (from a zero-context diff). */
function addedLines(file) {
  let out;
  try {
    out = git('diff', '-U0', MERGE_BASE, '--', file);
  } catch {
    return [];
  }
  const result = [];
  let lineNo = 0;
  for (const raw of out.split('\n')) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(raw);
    if (hunk) {
      lineNo = Number(hunk[1]);
      continue;
    }
    if (raw.startsWith('+') && !raw.startsWith('+++')) result.push({ line: lineNo++, text: raw.slice(1) });
  }
  return result;
}

function isIgnored(file) {
  return gitOk('check-ignore', '--no-index', '--quiet', file);
}

function playwrightProjectNames(configText) {
  const block = configText.slice(configText.indexOf('projects:'));
  return [...block.matchAll(/name:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
}

// ---------------------------------------------------------------- checks

// Review: "npm scripts point at deleted files", "Restore missing CLI scripts and dependent workflows",
// "Include crawler implementation or defer crawler commands".
function checkNpmScripts() {
  const pkg = JSON.parse(readNow('package.json'));
  const config = readNow('playwright.config.ts') || '';
  const projects = new Set(playwrightProjectNames(config));
  const scripts = pkg.scripts || {};

  for (const [name, cmd] of Object.entries(scripts)) {
    for (const m of cmd.matchAll(/(?:^|\s)(?:\.\/)?((?:scripts|src|tests|config)\/[^\s'"]+\.(?:js|mjs|cjs|ts|py|json))/g)) {
      const file = m[1];
      if (!fs.existsSync(path.join(ROOT, file))) {
        report('ERROR', 'npm-scripts', `"${name}" runs ${file}, which does not exist`, 'package.json', 'npm scripts point at deleted files');
      } else if (isIgnored(file)) {
        report('ERROR', 'npm-scripts', `"${name}" runs ${file}, which .gitignore excludes from delivery — add a "!${file}" allowlist line`, '.gitignore', 'Restore missing CLI scripts and dependent workflows');
      } else if (!TRACKED.has(file)) {
        report('WARN', 'npm-scripts', `"${name}" runs ${file}, which is not committed yet — git add it`, 'package.json', 'npm scripts point at deleted files');
      }
    }
    for (const m of cmd.matchAll(/--project[= ]([\w-]+)/g)) {
      if (!projects.has(m[1])) {
        report('ERROR', 'npm-scripts', `"${name}" targets Playwright project "${m[1]}", which playwright.config.ts does not define`, 'package.json', 'Include crawler implementation or defer crawler commands');
      }
    }
    for (const m of cmd.matchAll(/npm run ([\w:-]+)/g)) {
      if (!scripts[m[1]]) report('ERROR', 'npm-scripts', `"${name}" calls "npm run ${m[1]}", which is not defined`, 'package.json', 'npm scripts point at deleted files');
    }
  }
}

// Review: "Include crawler implementation and matching specs" — a project whose testDir is empty.
function checkProjectDirs() {
  const config = readNow('playwright.config.ts') || '';
  for (const m of config.matchAll(/name:\s*['"]([\w-]+)['"][\s\S]*?testDir:\s*['"]([^'"]+)['"]/g)) {
    // Skip a match that spans into the next project block.
    if (/name:\s*['"]/.test(m[0].slice(m[0].indexOf(m[1]) + m[1].length))) continue;
    const dir = path.normalize(m[2]).replace(/\\/g, '/').replace(/^\.\//, '');
    const specs = [...TRACKED].filter((f) => f.startsWith(`${dir}/`) && f.endsWith('.spec.ts'));
    if (specs.length === 0) {
      report('ERROR', 'playwright-projects', `Project "${m[1]}" uses testDir ${dir}, which holds no committed specs — ship the specs or remove the project`, 'playwright.config.ts', 'Include crawler implementation and matching specs');
    }
  }
}

// Review: "Prevent concurrent suites from sharing mutation offices".
function checkMutationProjectsSerial() {
  const config = readNow('playwright.config.ts') || '';
  for (const name of MUTATION_PROJECTS) {
    const start = config.search(new RegExp(`name:\\s*['"]${name}['"]`));
    if (start < 0) continue;
    const next = config.slice(start + 1).search(/name:\s*['"]/);
    const block = config.slice(start, next < 0 ? undefined : start + 1 + next);
    if (!/workers:\s*1\b/.test(block)) {
      report('ERROR', 'shared-office-isolation', `Project "${name}" mutates shared offices but is not pinned with "workers: 1" — parallel whole-form saves clobber each other`, 'playwright.config.ts', 'Prevent concurrent suites from sharing mutation offices');
    }
  }
}

// Review: "Retain patched SheetJS release", "Records dependency downgrades".
function checkDependencies() {
  const now = JSON.parse(readNow('package.json'));
  const baseText = readAt(MERGE_BASE, 'package.json');
  const before = baseText ? JSON.parse(baseText) : {};

  for (const section of ['dependencies', 'devDependencies']) {
    const cur = now[section] || {};
    const old = before[section] || {};
    for (const [dep, spec] of Object.entries(old)) {
      const curSpec = cur[dep] ?? (now.dependencies || {})[dep] ?? (now.devDependencies || {})[dep];
      if (curSpec === undefined) {
        report('WARN', 'dependencies', `${dep} removed (was ${spec}) — confirm nothing still requires it`, 'package.json', 'Changes dependencies');
        continue;
      }
      const a = parseVersion(spec);
      const b = parseVersion(curSpec);
      if (!b && /^https?:/.test(curSpec)) continue;
      if (/^https?:/.test(spec) && b) {
        report('ERROR', 'dependencies', `${dep} moved from a pinned URL build (${spec}) back to the registry (${curSpec})`, 'package.json', 'Retain patched SheetJS release to avoid vulnerabilities');
      } else if (a && b && compareVersions(b, a) < 0) {
        report('ERROR', 'dependencies', `${dep} downgraded ${spec} -> ${curSpec}`, 'package.json', 'Records dependency downgrades');
      }
    }
  }

  const all = { ...(now.dependencies || {}), ...(now.devDependencies || {}) };
  for (const [dep, rule] of Object.entries(VULNERABLE_BELOW)) {
    const v = parseVersion(all[dep]);
    if (v && compareVersions(v, parseVersion(rule.min)) < 0) {
      report('ERROR', 'dependencies', `${dep}@${all[dep]} is a known-vulnerable line (< ${rule.min}); use ${rule.fix}`, 'package.json', 'Retain patched SheetJS release to avoid vulnerabilities');
    }
  }

  // package.json and the lockfile must describe the same root dependencies.
  const lock = readNow('package-lock.json');
  if (lock) {
    const root = (JSON.parse(lock).packages || {})[''] || {};
    for (const section of ['dependencies', 'devDependencies']) {
      for (const [dep, spec] of Object.entries(now[section] || {})) {
        const locked = (root[section] || {})[dep];
        if (locked !== spec) {
          report('ERROR', 'dependencies', `package-lock.json has ${dep}@${locked ?? '(missing)'} but package.json says ${spec} — run npm install and commit the lockfile`, 'package-lock.json', 'Records dependency downgrades');
        }
      }
    }
  }
}

// Review: "Removing Order Bridge fixtures breaks existing test collection",
// "Removing selector registry breaks ... lookups", "npm scripts point at deleted files".
function checkDeletedFilesStillReferenced() {
  const removed = changes.filter((c) => c.status === 'D' || c.status === 'R').map((c) => c.from);
  for (const file of removed) {
    const noExt = file.replace(/\.(ts|js|mjs|cjs|json)$/, '');
    const tail = noExt.split('/').slice(-2).join('/');
    const needles = [...new Set([file, tail])];
    for (const needle of needles) {
      let hits = '';
      try {
        hits = git('grep', '-n', '-F', '-e', needle, '--', '.', ':!reports', ':!package-lock.json', ':!config/testrail/case-map.json');
      } catch {
        /* git grep exits 1 on no match */
      }
      for (const hit of hits.split('\n').filter(Boolean).slice(0, 5)) {
        const [where, line] = hit.split(':');
        report('ERROR', 'deleted-files', `${file} was removed but is still referenced`, `${where}:${line}`, 'Removing ... breaks existing test collection');
      }
    }
  }
}

// Review: "npm scripts point at deleted files" (README instructions), "Restore missing CLI scripts".
function checkPathReferences() {
  const docs = [...TRACKED].filter((f) => f.endsWith('.md') && !f.startsWith('reports/'));
  const files = [...new Set(['package.json', 'playwright.config.ts', ...docs])];
  const pathRe = /(?<![\w/.-])((?:scripts|src|tests|config)\/[\w./-]+\.(?:js|mjs|cjs|ts|py|json))\b/g;
  for (const file of files) {
    const text = readNow(file);
    if (!text) continue;
    const seen = new Set();
    text.split('\n').forEach((lineText, i) => {
      for (const m of lineText.matchAll(pathRe)) {
        const ref = m[1];
        if (seen.has(ref) || ref.includes('<') || ref.includes('*')) continue;
        seen.add(ref);
        if (TRACKED.has(ref)) continue;
        const exists = fs.existsSync(path.join(ROOT, ref));
        const ignored = exists && isIgnored(ref);
        const why = !exists ? 'does not exist' : ignored ? 'is gitignored, so it never ships' : 'is not committed yet — git add it';
        const severity = STRICT_REF_FILES.has(file) && (!exists || ignored) ? 'ERROR' : 'WARN';
        report(severity, 'path-references', `${ref} ${why}`, `${file}:${i + 1}`, 'npm scripts point at deleted files');
      }
    });
  }
  // .gitignore allowlist lines must name something that exists.
  (readNow('.gitignore') || '').split('\n').forEach((line, i) => {
    const m = /^!([^*\s]+)$/.exec(line.trim());
    if (m && !fs.existsSync(path.join(ROOT, m[1]))) {
      report('WARN', 'path-references', `.gitignore allowlists ${m[1]}, which does not exist`, `.gitignore:${i + 1}`, 'Restore missing CLI scripts');
    }
  });
}

/** Selector name -> value. Object-literal registries are flattened to "Export.KEY" entries so a
 *  single property losing its test id is caught, not hidden inside a whole-object diff. */
function exportedSelectors(text) {
  const map = new Map();
  if (!text) return map;
  for (const m of text.matchAll(/export const (\w+)\s*(?::[^=]+)?=\s*([\s\S]*?);\s*$/gm)) {
    if (!m[2].trim().startsWith('{')) {
      map.set(m[1], m[2]);
      continue;
    }
    for (const p of m[2].matchAll(/^\s*['"]?(\w+)['"]?\s*:\s*(['"`].*?['"`])\s*,?\s*(?:\/\/.*)?$/gm)) map.set(`${m[1]}.${p[1]}`, p[2]);
  }
  return map;
}

// Review: "Restore service-type / active checkbox selector test ID", "Use the picker sort selector
// test ID", "Use locale-independent pagination test IDs".
function checkSelectors() {
  for (const c of changes) {
    if (c.status === 'D' || !c.file.startsWith('src/selectors/') || !c.file.endsWith('.ts')) continue;
    const before = exportedSelectors(readAt(MERGE_BASE, c.from));
    const after = exportedSelectors(readNow(c.file));
    const text = readNow(c.file) || '';
    const lineOf = (name) => {
      const key = name.split('.').pop();
      const pattern = name.includes('.') ? new RegExp(`^\\s*['"]?${key}['"]?\\s*:`) : new RegExp(`export const ${key}\\b`);
      return text.split('\n').findIndex((l) => pattern.test(l)) + 1;
    };

    const localized = [];
    for (const [name, value] of after) {
      const old = before.get(name);
      if (old === value) continue;
      if (old && TESTID_RE.test(old) && !TESTID_RE.test(value)) {
        report('ERROR', 'selectors', `${name} dropped its test id (was ${old.trim()})`, `${c.file}:${lineOf(name)}`, 'Restore ... selector test ID');
      } else if (LOCALIZED_SELECTOR_RE.test(value) && !TESTID_RE.test(value)) {
        localized.push(name);
      }
    }
    if (localized.length) {
      const shown = localized.slice(0, 4).join(', ') + (localized.length > 4 ? `, +${localized.length - 4} more` : '');
      report('WARN', 'selectors', `${localized.length} new/changed selector(s) match on visible/aria text, which breaks under translation — use a data-testid where the app has one: ${shown}`, `${c.file}:${lineOf(localized[0])}`, 'Use stable test IDs instead of localized aria-labels');
    }
  }
}

// Review: "Unset billing cycle waits ten seconds", "Restore shared state after attempted or uncertain
// writes", "Require confirmed save success before cleanup", "Await all concurrent writes",
// "Reload grid after clearing saved preferences", "Pass configured office through restore verification",
// "Diagnostics capture unused session instead of UTC test session".
function checkCodePatterns() {
  for (const file of changedFiles) {
    if (!/\.(ts|js)$/.test(file) || !/^(src|tests)\//.test(file) || file.startsWith('src/selectors/')) continue;
    const content = readNow(file) || '';
    const lines = content.split('\n');
    const isSpec = file.endsWith('.spec.ts');
    // One finding per file and rule, listing the lines, so a large diff stays readable.
    const hits = new Map();
    const hit = (severity, message, review, line) => {
      const key = `${severity}|${message}`;
      if (!hits.has(key)) hits.set(key, { severity, message, review, lines: [] });
      hits.get(key).lines.push(line);
    };

    for (const { line, text } of addedLines(file)) {
      const code = text.replace(/\/\/.*$/, '');
      if (/\b(test|describe|it)\.only\(/.test(code)) hit('ERROR', '.only() left in — it silently skips the rest of the suite', 'Review hygiene', line);
      if (/waitForTimeout\(/.test(code)) hit('WARN', 'Fixed sleep — wait for a condition (locator, response, networkidle) instead', 'Unset billing cycle waits ten seconds', line);
      if (/if\s*\(\s*!?[\w.]*\.saved\b/.test(code)) hit('WARN', 'Cleanup gated on save success — restore after ANY attempted write (finally), since a partial save can persist', 'Restore shared state after attempted or uncertain writes', line);
      if (/Promise\.all(Settled)?\(/.test(code) && !/\b(await|return)\b/.test(code)) hit('WARN', 'Promise.all not awaited — success may be reported before every write lands', 'Await all concurrent writes before reporting save success', line);
      if (/localStorage\.(clear|removeItem)\(/.test(code)) {
        const window = lines.slice(line - 1, line + 20).join('\n');
        if (!/\.(reload|goto)\(/.test(window)) hit('WARN', 'localStorage cleared without a reload — a mounted grid keeps its old preferences in React state', 'Reload grid after clearing saved preferences', line);
      }
      if (file.startsWith('src/pages/') && /locations\/\d{3,5}\b|['"`](1604|1606|7147|2359)['"`]/.test(code)) hit('WARN', 'Hard-coded office id in a page object — take the configured office as a parameter', 'Pass configured office through restore verification', line);
      if (isSpec && /browser\.newContext\(/.test(code) && !/recordVideo|attachDiagnostics/.test(content)) hit('WARN', 'Spec builds its own context without recordVideo/attachDiagnostics — failure artifacts will come from the unused fixture page', 'Diagnostics capture unused session instead of UTC test session', line);
      if (isSpec && /\b(Live ?Date|liveDate|effectiveDate)\b/.test(code) && /save/i.test(content) && !/timezoneId:\s*['"]UTC['"]|withUtc/.test(content)) hit('WARN', 'Date field saved outside a UTC context — America/New_York shifts UTC-midnight dates a day', 'Run whole-form date writes in UTC context', line);
    }

    for (const h of hits.values()) {
      const more = h.lines.length > 1 ? ` (${h.lines.length}x, lines ${h.lines.slice(0, 6).join(', ')}${h.lines.length > 6 ? ', ...' : ''})` : '';
      report(h.severity, 'code-patterns', h.message + more, `${file}:${h.lines[0]}`, h.review);
    }
  }
}

// Review: TestRail mapping findings ("Prevent parallel TestRail coverage and result loss", case-map growth).
function checkTestRailMap() {
  const file = 'config/testrail/case-map.json';
  const raw = readNow(file);
  if (!raw) return;
  const keys = new Map();
  const ids = new Map();
  raw.split('\n').forEach((lineText, i) => {
    const m = /^\s*"([^"]+)"\s*:\s*(\d+)/.exec(lineText);
    if (!m) return;
    if (keys.has(m[1])) report('ERROR', 'testrail', `Duplicate key ${m[1]} (also line ${keys.get(m[1])}) — the later one silently wins`, `${file}:${i + 1}`, 'Prevent parallel TestRail coverage and result loss');
    keys.set(m[1], i + 1);
    if (ids.has(m[2])) report('ERROR', 'testrail', `TestRail case ${m[2]} mapped from both ${ids.get(m[2])} and ${m[1]} — one result overwrites the other`, `${file}:${i + 1}`, 'Prevent parallel TestRail coverage and result loss');
    ids.set(m[2], m[1]);
  });

  for (const spec of changedFiles.filter((f) => f.endsWith('.spec.ts'))) {
    for (const { line, text } of addedLines(spec)) {
      for (const m of text.matchAll(/\bTC-[A-Z]+(?:-[A-Z]+)*-\d+\b/g)) {
        if (!keys.has(m[0])) report('WARN', 'testrail', `${m[0]} has no entry in ${file} — its result will not reach TestRail`, `${spec}:${line}`, 'TestRail case mapping');
      }
    }
  }
}

// Review/merge box: "This branch is out-of-date with the base branch".
function checkBranchFreshness() {
  const behind = Number(git('rev-list', '--count', `HEAD..${BASE}`));
  if (behind > 0) report('WARN', 'branch', `Branch is ${behind} commit(s) behind ${BASE} — merge it and re-run before opening the PR`, 'git', 'This branch is out-of-date with the base branch');
}

// Review: "Removing Order Bridge fixtures breaks existing test collection", broken imports.
function checkTypecheck() {
  const res = run('npx', ['tsc', '--noEmit', '-p', 'tsconfig.json']);
  if (res.status === 0) return;
  const errors = `${res.stdout}${res.stderr}`.split('\n').filter((l) => /error TS\d+/.test(l));
  for (const e of errors.slice(0, 25)) {
    const m = /^(.+?)\((\d+),\d+\): (error TS\d+: .*)$/.exec(e.trim());
    report('ERROR', 'typecheck', m ? m[3] : e.trim(), m ? `${m[1]}:${m[2]}` : 'tsc', 'Broken imports / removed fixtures');
  }
  if (errors.length > 25) report('ERROR', 'typecheck', `...and ${errors.length - 25} more tsc errors`, 'tsc', 'Broken imports / removed fixtures');
  if (errors.length === 0) report('ERROR', 'typecheck', `tsc failed: ${(res.stderr || res.stdout).trim().slice(0, 300)}`, 'tsc', 'Broken imports / removed fixtures');
}

// Review: "Include crawler implementation and matching specs", unknown fixtures at collection time.
// --list loads every spec (so fixture/import errors surface) without running globalSetup or logging in.
function checkPlaywrightList() {
  const out = path.join(os.tmpdir(), `pre-pr-list-${process.pid}.json`);
  const res = run('npx', ['playwright', 'test', '--list', '--reporter=json'], {
    CRAWLER_ENABLED: 'true',
    PLAYWRIGHT_JSON_OUTPUT_FILE: out,
    PLAYWRIGHT_JSON_OUTPUT_NAME: out,
  });
  let json;
  try {
    json = JSON.parse(fs.readFileSync(out, 'utf8'));
  } catch {
    try {
      const text = res.stdout || '';
      json = JSON.parse(text.slice(text.indexOf('{')));
    } catch {
      report('ERROR', 'playwright-list', `playwright --list failed: ${(res.stderr || res.stdout || '').trim().slice(0, 400)}`, 'playwright.config.ts', 'Test collection');
      return;
    }
  } finally {
    fs.rmSync(out, { force: true });
  }

  for (const e of json.errors || []) {
    const loc = e.location ? `${path.relative(ROOT, e.location.file).replace(/\\/g, '/')}:${e.location.line}` : 'collection';
    report('ERROR', 'playwright-list', (e.message || '').split('\n')[0].replace(/\u001b\[\d+m/g, ''), loc, 'Removing ... fixtures breaks existing test collection');
  }

  const counts = new Map((json.config?.projects || []).map((p) => [p.name, 0]));
  const walk = (suite) => {
    for (const spec of suite.specs || []) for (const t of spec.tests || []) counts.set(t.projectName, (counts.get(t.projectName) || 0) + 1);
    for (const child of suite.suites || []) walk(child);
  };
  for (const s of json.suites || []) walk(s);
  for (const [name, n] of counts) {
    if (n === 0) report('ERROR', 'playwright-list', `Project "${name}" collects 0 tests`, 'playwright.config.ts', 'Include crawler implementation and matching specs');
  }
}

// ---------------------------------------------------------------- main

const checks = [
  ['npm scripts resolve', checkNpmScripts],
  ['project test dirs hold specs', checkProjectDirs],
  ['mutation projects run serially', checkMutationProjectsSerial],
  ['dependencies not downgraded / vulnerable', checkDependencies],
  ['deleted files not referenced', checkDeletedFilesStillReferenced],
  ['documented paths exist', checkPathReferences],
  ['selectors keep test ids', checkSelectors],
  ['code patterns in changed files', checkCodePatterns],
  ['TestRail case map', checkTestRailMap],
  ['branch up to date', checkBranchFreshness],
  ...(FAST ? [] : [['typecheck (tsc --noEmit)', checkTypecheck], ['playwright --list collection', checkPlaywrightList]]),
];

console.log(`Pre-PR check — base ${BASE} (merge-base ${MERGE_BASE.slice(0, 7)}), ${changes.length} changed file(s)${FAST ? ', fast mode' : ''}\n`);

for (const [label, fn] of checks) {
  const before = findings.length;
  try {
    fn();
  } catch (err) {
    report('ERROR', label, `check crashed: ${err instanceof Error ? err.message : String(err)}`, 'pre-pr-check.js', 'n/a');
  }
  const mine = findings.slice(before);
  const errs = mine.filter((f) => f.severity === 'ERROR').length;
  const warns = mine.length - errs;
  console.log(`${errs ? '✖' : warns ? '⚠' : '✔'} ${label}${mine.length ? `  (${errs} error, ${warns} warn)` : ''}`);
  for (const f of mine) {
    console.log(`    ${f.severity === 'ERROR' ? 'ERROR' : 'WARN '} ${f.where}  ${f.message}`);
    console.log(`          ↳ review: "${f.review}"`);
  }
}

const errorCount = findings.filter((f) => f.severity === 'ERROR').length;
const warnCount = findings.length - errorCount;

console.log(`
Manual checklist (not machine-checkable — reviewers flagged each of these on NM-4129):
  [ ] Every test that writes shared office data restores it in finally, even when the save failed or timed out
  [ ] Whole-form saves that carry dates run in a UTC context (timezoneId: 'UTC') and assert the date is unchanged
  [ ] Specs that open their own page attach that page's video/trace/diagnostics, not the unused fixture page
  [ ] Nothing removed (fixtures, selector registry entries, scripts) is still used by another spec or doc
  [ ] PR description lists every removed file and why
`);

console.log(`${errorCount} error(s), ${warnCount} warning(s).`);
if (errorCount > 0 || (STRICT && warnCount > 0)) {
  console.log('Fix the above before raising the PR.');
  process.exit(1);
}
console.log('Ready to raise the PR.');
