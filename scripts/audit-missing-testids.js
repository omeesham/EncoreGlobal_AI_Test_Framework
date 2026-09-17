#!/usr/bin/env node
/**
 * Missing data-testid audit — LOCATIONS MODULE ONLY.
 *
 * Reads the Locations selector definitions and Locations page objects, classifies every selector
 * by how it targets its element, and reports the ones that reach their element WITHOUT a
 * data-testid — the fragile ones, ranked by how easily they break.
 *
 * Scope is hard-coded and deliberately narrow (see SELECTOR_SOURCES / PAGE_SOURCES): only
 * src/selectors/locations, the Locations entries of src/selectors/auth/dynamic.ts, and
 * src/pages/locations. No other module is read, so the output can never blame another team's page.
 *
 * How an item is classified:
 *   CRITICAL  positional — :nth-child, :first-child, :last-child, :last-of-type, .nth(N).
 *             Breaks when a row or column is added, removed or reordered.
 *   HIGH      text match — :has-text(), :text-is(), :text(). Breaks on i18n, copy edits and
 *             truncation. Data-driven text (a "${var}" row lookup) lands here too: the row still
 *             needs an identifier of its own.
 *   MEDIUM    stable-but-implicit attributes — placeholder, input[name=], aria-label, a CSS
 *             class (Tailwind classes move with the design), DOM adjacency (+ / > / parent hop),
 *             or a :not() used to disambiguate two same-role siblings.
 *   LOW       already inside a data-testid container, identified by a bare tag or by text within
 *             that scope. Works today; a testid would make it explicit.
 *   covered   the element has its own data-testid (=, ^=, *=), or sits in a testid container and
 *             is picked out by role plus a semantic attribute (role="radio"][value="true"]).
 *   excluded  structural — a row count, a header enumeration, a parent hop, an "is this cell
 *             editable" probe. These query structure, not identity, and need no testid.
 *
 * Opting a selector out: put `// testid-audit: ignore -- <reason>` on the line above it. The
 * reason is printed in the report's exclusions appendix, so an intentional fallback stays visible
 * instead of silently disappearing.
 *
 * Usage:
 *   node scripts/audit-missing-testids.js                    console summary + write the report
 *   node scripts/audit-missing-testids.js --print            also print the full markdown
 *   node scripts/audit-missing-testids.js --module pricing   one module (repeatable, substring)
 *   node scripts/audit-missing-testids.js --priority CRITICAL,HIGH
 *   node scripts/audit-missing-testids.js --md <path> --json <path> --xlsx <path>
 *   node scripts/audit-missing-testids.js --no-write         nothing written, console only
 *   node scripts/audit-missing-testids.js --verbose          list every item on the console
 *   node scripts/audit-missing-testids.js --strict           exit 1 if any CRITICAL/HIGH remains
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/** Locations selector definitions. Nothing outside this list is read. */
const SELECTOR_SOURCES = [
  { dir: 'src/selectors/locations' },
  // Parameterized Locations selectors (pricing grid rows, office links) sit with the auth dynamic
  // helpers for historical reasons; only this one file is pulled in from there.
  { file: 'src/selectors/auth/dynamic.ts' },
];

/** Locations page objects — scanned for inline locators that bypass the selector files. */
const PAGE_SOURCES = [
  { dir: 'src/pages/locations' },
  { file: 'src/pages/components/location-form-helpers.component.ts' },
];

/**
 * One entry per Locations tab / shared surface. `code` prefixes the report IDs, `slug` is the
 * table name used when suggesting a column-header testid.
 */
const MODULES = {
  'left-panel-basic-information': { name: 'Basic Information (left panel)', code: 'BAS', slug: 'pay-to' },
  'local-info': { name: 'Local Information tab', code: 'LI', slug: 'local-info' },
  currency: { name: 'Currency tab', code: 'CUR', slug: 'currency' },
  pricing: { name: 'Pricing tab', code: 'PRI', slug: 'pricing' },
  'account-address': { name: 'Account and Address tab', code: 'AA', slug: 'account-list' },
  'shared-setup-locations': { name: 'Shared Setup Locations tab', code: 'SSL', slug: 'shared-setup' },
  notes: { name: 'Notes tab', code: 'NOT', slug: 'notes' },
  legal: { name: 'Legal tab', code: 'LEG', slug: 'legal' },
  'auto-addon': { name: 'Auto Add-On tab', code: 'AAO', slug: 'auto-add-on' },
  'business-types': { name: 'Business Types tab', code: 'BT', slug: 'business-types' },
  history: { name: 'Location Management History tab', code: 'HIS', slug: 'management-history' },
  shared: { name: 'Shared dialogs (all Location Settings tabs)', code: 'DLG', slug: 'shared' },
  dynamic: { name: 'Dynamic grid rows (Pricing grid, office links)', code: 'DYN', slug: 'pricing' },
  'form-helpers': { name: 'Shared Locations form helpers', code: 'FRM', slug: 'shared' },
};

/** File basenames that do not match their module key directly. */
const MODULE_ALIASES = { 'management-history': 'history' };

/** data-testid prefix in use per surface. Everything under Location Settings shares one. */
const TESTID_PREFIX = 'location-settings';
const PREFIX_OVERRIDES = { lnkOfficeCode: 'location-search' };

/** The office the Locations suite runs against, named in the manual steps. */
const SAMPLE_OFFICE = '1604';

const PRIORITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

/* ------------------------------------------------------------------ source discovery */

function resolveSources(sources) {
  const files = [];
  for (const src of sources) {
    if (src.file) {
      const full = path.join(ROOT, src.file);
      if (fs.existsSync(full)) files.push(full);
      continue;
    }
    const dir = path.join(ROOT, src.dir);
    if (!fs.existsSync(dir)) continue;
    const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.ts')) files.push(path.join(dir, entry.name));
    }
  }
  return files;
}

function moduleOf(file) {
  let base = path.basename(file).replace(/\.ts$/, '').replace(/\.(page|component)$/, '');
  base = base.replace(/^location-settings-/, '').replace(/^location-/, '');
  base = MODULE_ALIASES[base] || base;
  if (MODULES[base]) return { key: base, ...MODULES[base] };
  return { key: base, name: base, code: base.slice(0, 3).toUpperCase(), slug: base };
}

/* ------------------------------------------------------------------ parsing */

const IGNORE_MARKER = /\/\/\s*testid-audit:\s*ignore\s*(?:--|-|:)?\s*(.*)$/;

/** `key: 'selector',` in a selector-definition object. */
const STATIC_ENTRY = /^\s*([A-Za-z0-9_]+)\s*:\s*(['"`])((?:\\.|(?!\2)[\s\S])*)\2\s*,?\s*$/;
/** `key: (arg: T) => `selector`,` — a parameterized selector. */
const DYNAMIC_ENTRY = /^\s*([A-Za-z0-9_]+)\s*:\s*\(([^)]*)\)\s*(?::[^=]*)?=>\s*(['"`])((?:\\.|(?!\3)[\s\S])*)\3\s*,?\s*$/;

/** Reads one selector-definition file into named entries, carrying each entry's comment block. */
function parseSelectorFile(file) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const entries = [];
  let note = [];
  let ignore = null;

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) {
      note = [];
      return;
    }
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
      const marked = IGNORE_MARKER.exec(trimmed);
      if (marked) ignore = marked[1].trim() || 'marked ignore';
      else note.push(trimmed.replace(/^\/\/+|^\/\*+|\*\/$|^\*+/g, '').trim());
      return;
    }
    const dyn = DYNAMIC_ENTRY.exec(line);
    const stat = dyn ? null : STATIC_ENTRY.exec(line);
    if (dyn || stat) {
      entries.push({
        kind: 'definition',
        key: (dyn || stat)[1],
        selector: dyn ? dyn[4] : stat[3],
        parameterized: Boolean(dyn),
        file,
        line: i + 1,
        note: note.filter(Boolean).join(' '),
        ignore,
      });
    }
    note = [];
    ignore = null;
  });

  return entries;
}

/**
 * One locator call inside a page object: `.locator('…')` or a `.getBy*('…')`. Matched in source
 * order so a chain can be resolved left to right.
 */
const LOCATOR_CALL = /\.(locator|getByRole|getByText|getByPlaceholder|getByLabel|getByTitle)\(\s*(['"`])((?:\\.|(?!\2)[\s\S])*?)\2([^)]*)\)/g;
/** Chain glue between two calls — `)`, `.first()`, `.nth(2)`, `.filter({…})`. */
const CHAIN_GLUE = /^[\s)]*(?:\.(?:first|last|nth|filter|and|or)\([^)]*\)[\s)]*)*$/;
/** `const x = …` / `let x = …` — the name a resolved locator is remembered under. */
const ASSIGNMENT = /^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]*)?=/;
/** The identifier a call is chained off, at the end of the text before it. */
const ROOT_IDENT = /([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*$/;
/** Chained off a call instead of a variable — `this.getPanel()`, `DynamicSelectors.rowPriceBook(x)`. */
const ROOT_CALL = /([A-Za-z_$][\w$]*)\s*\(\s*[^()]*\)\s*$/;
/** `this.getElement('key')` / `getTsSelector('key')` — a named selector used as the chain root. */
const ELEMENT_ROOT = /(?:getElement|getLocator|getTsSelector)\(\s*['"`]([A-Za-z0-9_]+)['"`]\s*\)[\s)]*$/;
/** A method signature, including one whose parameters run onto the following lines. */
const METHOD_DECL = /^\s*(?:(?:private|protected|public|static|abstract|readonly)\s+)*(?:async\s+)?(?:get\s+|set\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*(?:<[^<>]*>)?\(/;
const NOT_A_METHOD = ['if', 'for', 'while', 'switch', 'catch', 'return', 'constructor', 'function', 'typeof', 'await', 'expect', 'super'];
/** A line that is an expression, not a declaration — never a method signature. */
const EXPRESSION_LINE = /^\s*(?:await|return|const|let|var|\}|\)|\.|this\.|throw|yield|else|case|default)\b|=>/;
/** Counting and enumeration: the selector is being measured, not identified. */
const ENUMERATION = /\.count\(\)|\.allTextContents\(\)|\.allInnerTexts\(\)|\.evaluateAll\(/;

/** A zero-argument getter whose whole body is `return this.getElement('key')`. */
const GETTER_ROOT = /([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?::[^{;]*)?\{\s*return\s+this\.(?:getElement|getLocator)\(\s*['"`]([A-Za-z0-9_]+)['"`]\s*\)/g;
/** `const x = this.getLocator('key')` — a selector held as a plain string. */
const SELECTOR_CALL = /(?:getElement|getLocator|getTsSelector)\(\s*['"`]([A-Za-z0-9_]+)['"`]\s*\)/;
/** `const x = this.getPanel()` — a locator taken from a getter. */
const GETTER_CALL = /=\s*(?:await\s+)?this\.([A-Za-z_$][\w$]*)\(\s*\)/;
/** `const row = `${tbl} tbody tr`` — a selector assembled as a template string. */
const TEMPLATE_ASSIGN = /^\s*(?:const|let|var)\s+[\w$]+\s*(?::[^=]*)?=\s*`([^`]*)`\s*;?\s*$/;
/** Enough of a selector to be worth remembering as one, rather than a label or a message. */
const SELECTOR_SHAPED = /\[[a-zA-Z-]+[=\]]|:has-text|:has\(|:text|:nth-child|:first-child|:last-child|^[a-z]+[\s.:#[]|^[a-z]+$/;

/** Substitutes `${name}` with the selector that name holds; data parameters are left visible. */
function substitute(text, vars) {
  return text.replace(/\$\{([A-Za-z_$][\w$]*)\}/g, (whole, name) => (vars.has(name) ? vars.get(name) : whole));
}

/** Root selectors for this file's `return this.getElement('key')` getters. */
function getterRoots(source, selectorMap) {
  const roots = new Map();
  let m;
  GETTER_ROOT.lastIndex = 0;
  while ((m = GETTER_ROOT.exec(source))) {
    if (selectorMap.has(m[2])) roots.set(m[1], selectorMap.get(m[2]));
  }
  return roots;
}

/** The CSS a single `.locator()` / `.getBy*()` argument stands for. */
function stepSelector(api, arg, tail) {
  const named = /name:\s*(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/.exec(tail || '');
  switch (api) {
    case 'getByRole':
      return `[role="${arg}"]${named ? `:has-text("${named[2]}")` : ''}`;
    case 'getByPlaceholder':
      return `[placeholder="${arg}"]`;
    case 'getByLabel':
      return `[aria-label="${arg}"]`;
    case 'getByTitle':
      return `[title="${arg}"]`;
    case 'getByText':
      return `:has-text("${arg}")`;
    default:
      return arg;
  }
}

/**
 * Inline locator calls inside a page object, each resolved to the full path from the page root.
 *
 * A page object reaches an element in steps — `getElement('tblAddrResults')`, then the row, then
 * the cell — so the argument of any one call is a fragment that matches nothing on its own. The
 * report has to print what someone can actually look for in the DOM, so each call is resolved
 * against the locator it is chained off: a local variable assigned earlier in the method, a
 * `getElement('key')` selector, or `this.page` (the root). The raw argument is kept as `step`,
 * because whether a call is a structural probe is a property of that step, not of the whole path.
 */
function parsePageFile(file, selectorMap = new Map()) {
  const source = fs.readFileSync(file, 'utf8');
  const lines = source.split(/\r?\n/);
  const roots = getterRoots(source, selectorMap);
  const entries = [];
  let method = '(top level)';
  let ignore = null;
  /** Local locator variables of the current method: name -> resolved selector. */
  let vars = new Map();

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    const marked = IGNORE_MARKER.exec(trimmed);
    if (marked) {
      ignore = marked[1].trim() || 'marked ignore';
      return;
    }
    const decl = METHOD_DECL.exec(line);
    if (decl && !NOT_A_METHOD.includes(decl[1]) && !EXPRESSION_LINE.test(line)) {
      method = decl[1];
      vars = new Map();
    }
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;

    let last = null;
    let cursor = 0;
    let m;
    LOCATOR_CALL.lastIndex = 0;
    while ((m = LOCATOR_CALL.exec(line))) {
      const gap = line.slice(cursor, m.index);
      cursor = LOCATOR_CALL.lastIndex;
      const step = substitute(stepSelector(m[1], m[3], m[4]), vars);
      if (!step) continue;

      // Chained onto the previous call, or rooted somewhere new?
      let base = '';
      if (last && CHAIN_GLUE.test(gap)) {
        base = last;
      } else {
        const element = ELEMENT_ROOT.exec(gap);
        const ident = ROOT_IDENT.exec(gap);
        const call = ROOT_CALL.exec(gap);
        const name = ident ? ident[1].split('.').pop() : '';
        const called = call ? call[1] : '';
        if (element) base = selectorMap.get(element[1]) || '';
        else if (vars.has(name)) base = vars.get(name);
        else if (roots.has(name)) base = roots.get(name);
        else if (roots.has(called)) base = roots.get(called);
        // A parameterized selector used as a root (DynamicSelectors.rowPriceBook(name)) keeps its
        // placeholder, so the path still shows which row the element is reached through.
        else if (selectorMap.has(called)) base = selectorMap.get(called);
        // `this.page`, `page`, `this` and any unknown root resolve to the page itself.
      }

      // A comma list under a prefix must be grouped, or the prefix would bind to its first
      // branch only: `dlg :is(h2, [role="heading"])`, never `dlg h2, [role="heading"]`.
      const grouped = base && /,/.test(step) && !/^:is\(/.test(step) ? `:is(${step})` : step;
      const selector = [base, grouped].filter(Boolean).join(' ');
      entries.push({ kind: 'inline', key: method, api: m[1], selector, step, file, line: i + 1, note: '', ignore, context: trimmed });
      // A parent hop cannot be expressed as one descendant selector, so the chain stops being
      // resolvable here and whatever is reached from it is reported on its own terms.
      last = /^(\.\.|xpath=\.\.)/.test(step) ? null : selector;
    }

    // Remember the selector a variable now holds: a resolved locator, a named selector fetched
    // by key, a getter's root, or a template string assembled from those.
    const assigned = ASSIGNMENT.exec(line);
    if (assigned) {
      const named = SELECTOR_CALL.exec(line);
      const getter = GETTER_CALL.exec(line);
      const template = TEMPLATE_ASSIGN.exec(line);
      const resolvedTemplate = template ? substitute(template[1], vars) : '';
      if (last) vars.set(assigned[1], last);
      else if (named && selectorMap.has(named[1])) vars.set(assigned[1], selectorMap.get(named[1]));
      else if (getter && roots.has(getter[1])) vars.set(assigned[1], roots.get(getter[1]));
      else if (resolvedTemplate && SELECTOR_SHAPED.test(resolvedTemplate)) vars.set(assigned[1], resolvedTemplate);
    }
    ignore = null;
  });

  return entries;
}

/* ------------------------------------------------------------------ classification */

const HAS_TESTID = /\[data-testid(?:[\^$*~|]?=|\])/;
const TESTID_ATTR = /\[data-testid(?:[\^$*~|]?=\s*(['"])(?:\\.|(?!\1)[\s\S])*\1)?\]/g;

const PATTERNS = [
  ['positional', /:nth-child\(|:first-child|:last-child|:nth-of-type\(|:first-of-type|:last-of-type|:nth-last-child\(|\.nth\(/],
  // `text=/regex/` and `text="copy"` are Playwright's text engine — the same fragility as :has-text().
  ['text', /:has-text\(|:text-is\(|:text\(|(^|[\s,>])text=/],
  ['placeholder', /\[placeholder/],
  ['form-name', /\[name=/],
  ['aria-label', /\[aria-label/],
  ['negation', /:not\(/],
  ['role', /\[role=/],
  ['css-class', /(^|[\s>+~(])\.[A-Za-z_-]|[A-Za-z0-9\])]\.[A-Za-z_-]/],
  ['adjacency', /\s\+\s|\s>\s|:has\(\s*>|xpath=|^\.\.$/],
  ['semantic-attr', /\[(value|type|data-slot|contenteditable|cmdk-input|aria-(?!label)[a-z-]+)/],
];

const PURE_TAGS = /^[a-z]+(\s+[a-z]+)*$/;
const TAG_LEAF = /(^|[\s>+~])[a-z][a-z0-9]*(?=$|[\s.:[>+~])/;
const INTERACTIVE = /\b(button|input|textarea|select)\b|\[role=|checkbox|combobox|contenteditable/;
/**
 * "Is anything editable in here?" — a field probe, not a named element. A role is deliberately
 * NOT one: a `[role="dialog"]` fallback list is still reaching for one specific element.
 */
const FIELD_PROBE = /^\[(type|name|contenteditable|cmdk-input|disabled|hidden|readonly)[=\]]/;

/** A selector that reads structure — row counts, header lists, parent hops, editability probes. */
function isStructural(tail) {
  const t = tail.trim();
  if (!t) return false;
  if (t === '..' || t.startsWith('xpath=..')) return true;
  if (PURE_TAGS.test(t)) return true;
  if (t.includes(',') && t.split(',').every((part) => PURE_TAGS.test(part.trim()) || FIELD_PROBE.test(part.trim()))) return true;
  // Tags + positional only, with nothing interactive at the leaf: a cell or row being read.
  if (/:(first|last|nth)/.test(t) && !INTERACTIVE.test(t.replace(/:[a-z-]+\([^)]*\)/g, ''))) return true;
  return false;
}

function classify(entry) {
  const selector = entry.selector;
  const tail = selector.replace(TESTID_ATTR, ' ').replace(/\s+/g, ' ').trim();
  const scoped = HAS_TESTID.test(selector);
  // Attribute values and matched copy hold dots, dashes and plus signs of their own
  // (name="notes.notes.0.note"), so strategies are detected against a skeleton with every quoted
  // value blanked out. Attribute and pseudo-class NAMES survive, which is all the patterns need.
  const skeleton = tail.replace(/(['"])(?:\\.|(?!\1)[\s\S])*?\1/g, '"@"');

  if (entry.ignore) return { verdict: 'excluded', reason: `opted out -- ${entry.ignore}`, strategies: [], scoped };
  if (scoped && !tail) return { verdict: 'covered', reason: 'own data-testid', strategies: [], scoped };

  const strategies = PATTERNS.filter(([, re]) => re.test(skeleton)).map(([name]) => name);
  // A role attribute subsumes the tag it qualifies (button[role="radio"]), so counting the tag
  // as a separate weakness would double-flag the same element.
  const bareTagLeaf = (() => {
    if (strategies.includes('role')) return false;
    // An engine-prefixed selector (`text=/…/`, `xpath=…`) has no CSS tag to read.
    if (/^[a-z-]+=/.test(tail)) return false;
    const stripped = skeleton.replace(/\[[^\]]*\]/g, '').replace(/:[a-z-]+\([^)]*\)/g, '').replace(/:[a-z-]+/g, '');
    return TAG_LEAF.test(stripped);
  })();

  // Inline page-object locators are often structural probes; named definitions are identity.
  // Judged on the call's own argument (`step`), not the resolved path: a parent hop or a row
  // count is structural however specific the container it hangs off is.
  if (entry.kind === 'inline' && ENUMERATION.test(entry.context || '')) {
    return { verdict: 'excluded', reason: 'counting probe — measures how many, not which one', strategies, scoped };
  }
  if (entry.kind === 'inline' && isStructural(entry.step || tail)) {
    return { verdict: 'excluded', reason: 'structural query — row, header or cell enumeration, not element identity', strategies, scoped };
  }
  if (!scoped && PURE_TAGS.test(tail)) {
    return { verdict: 'excluded', reason: 'structural query — bare tag, no identity of its own', strategies, scoped };
  }

  const only = (...allowed) => strategies.length > 0 && strategies.every((s) => allowed.includes(s));
  if (scoped && !bareTagLeaf && only('role', 'semantic-attr')) {
    return { verdict: 'covered', reason: 'data-testid container, child picked by role + semantic attribute', strategies, scoped };
  }

  let priority;
  if (strategies.includes('positional')) priority = 'CRITICAL';
  else if (strategies.includes('text')) priority = scoped ? 'LOW' : 'HIGH';
  else if (strategies.some((s) => ['css-class', 'placeholder', 'form-name', 'aria-label', 'negation', 'adjacency'].includes(s))) priority = 'MEDIUM';
  else if (strategies.includes('role')) priority = scoped ? 'LOW' : 'MEDIUM';
  else if (bareTagLeaf) priority = scoped ? 'LOW' : 'MEDIUM';
  else return { verdict: 'covered', reason: 'own data-testid', strategies, scoped };

  if (bareTagLeaf) strategies.push('tag');
  if (scoped) strategies.push('testid-scope');
  if (entry.parameterized && strategies.includes('text')) strategies[strategies.indexOf('text')] = 'data-text';

  return { verdict: 'gap', priority, strategies, scoped, reason: '' };
}

/* ------------------------------------------------------------------ suggestions */

const KEY_PREFIXES = [
  ['colHeader', 'col', 'th'],
  ['content', 'sub-tab-content', 'tabpanel'],
  ['section', 'section', 'section'],
  ['toast', 'toast', 'notification'],
  ['spin', 'input', 'spinbutton'],
  ['chk', 'checkbox', 'checkbox'],
  ['drp', 'select', 'combobox'],
  ['btn', 'btn', 'button'],
  ['txt', 'input', 'input'],
  ['dtp', 'input', 'datepicker'],
  ['rdo', 'input', 'radio'],
  ['tbl', 'table', 'table'],
  ['dlg', 'modal', 'dialog'],
  ['lbl', 'label', 'text'],
  ['bar', 'label', 'progressbar'],
  ['err', 'error', 'text'],
  ['tab', 'sub-tab', 'tab'],
  ['pnl', 'sub-tab-content', 'tabpanel'],
  ['form', 'form', 'form'],
  ['opt', 'option', 'option'],
  ['lnk', 'link', 'link'],
  ['row', 'row', 'row'],
  ['col', 'col', 'th'],
];

function kebab(name) {
  return String(name)
    .replace(/\$\{[^}]*\}/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .replace(/([A-Za-z])(\d)/g, '$1-$2')
    .toLowerCase()
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function splitKey(key) {
  for (const [prefix, slot, type] of KEY_PREFIXES) {
    if (key.startsWith(prefix) && key.length > prefix.length && /[A-Z]/.test(key[prefix.length])) {
      return { slot, type, rest: key.slice(prefix.length) };
    }
  }
  return { slot: null, type: 'element', rest: key };
}

/** First piece of literal copy the selector matches on — the human name of the element. */
function textAnchor(selector) {
  const m = /:(?:has-text|text-is|text)\(\s*['"]([^'"]+)['"]\s*\)/.exec(selector);
  if (!m || m[1].includes('${')) return '';
  return m[1];
}

function paramAnchor(selector) {
  const m = /\$\{([A-Za-z0-9_]+)\}/.exec(selector);
  return m ? `{${kebab(m[1])}}` : '';
}

/** Which naming slot an inline locator's element belongs in, read off its role or its tag. */
const ROLE_SLOT = {
  button: 'btn',
  checkbox: 'checkbox',
  combobox: 'select',
  radio: 'input',
  option: 'option',
  listbox: 'listbox',
  dialog: 'modal',
  alertdialog: 'modal',
  menu: 'menu',
  menuitem: 'menu-item',
  tab: 'sub-tab',
  tabpanel: 'sub-tab-content',
  progressbar: 'label',
  status: 'label',
  heading: 'label',
  gridcell: 'cell',
  link: 'link',
  textbox: 'input',
  grid: 'table',
  table: 'table',
};
const TAG_SLOT = { button: 'btn', input: 'input', textarea: 'input', select: 'select', table: 'table', th: 'col', a: 'link', li: 'toast', p: 'label', h2: 'label', label: 'label' };

/**
 * Splits a resolved path into its segments, so the leaf — the element actually being targeted —
 * can be told apart from the containers that only lead to it. Spaces inside brackets, parens and
 * quotes are not combinators: `tr:has(td:has-text("A B")) td` is two segments, not four.
 */
function splitPath(selector) {
  const segments = [];
  let depth = 0;
  let quote = '';
  let current = '';
  for (const ch of selector) {
    if (quote) {
      current += ch;
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === '(' || ch === '[') depth += 1;
    if (ch === ')' || ch === ']') depth -= 1;
    if (ch === ' ' && depth === 0) {
      if (current) segments.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  if (current) segments.push(current);
  return segments.filter((s) => !['>', '+', '~'].includes(s));
}

function leafSegment(selector) {
  const segments = splitPath(selector);
  return segments[segments.length - 1] || selector;
}

function inlineSlot(selector) {
  const leaf = leafSegment(selector);
  const role = /\[role="([a-z]+)"\]/.exec(leaf);
  if (role && ROLE_SLOT[role[1]]) return ROLE_SLOT[role[1]];
  // The leaf tag is the element being targeted; the tags before it are only the path to it.
  const tags = [...leaf.replace(/\[[^\]]*\]/g, '').matchAll(/(^|[\s>+~])([a-z][a-z0-9]*)(?=$|[\s.:[>+~])/g)];
  for (const tag of tags.reverse()) {
    if (TAG_SLOT[tag[2]]) return TAG_SLOT[tag[2]];
  }
  return 'element';
}

/**
 * The name an inline locator's element should carry. Read off the element itself — the copy it
 * matches, its aria-label, its placeholder — so the suggestion describes the element and not the
 * page-object method that happens to reach it.
 */
function inlineName(entry, module) {
  const copy = (part) =>
    [textAnchor(part), (/\[aria-label="([^"]+)"\]/.exec(part) || [])[1], (/\[placeholder="([^"]+)"\]/.exec(part) || [])[1]].find(Boolean) || '';

  // The leaf's own copy names it best. Failing that, borrow the container it opens in — the
  // dialog or section — which is what someone reading the report recognises.
  const segments = splitPath(entry.selector);
  const leaf = copy(segments[segments.length - 1] || '');
  const containers = segments.slice(0, -1);
  const container = containers.map(copy).find(Boolean) || '';
  if (leaf) return kebab(leaf);

  // A container that already has a testid names this element better than the module does: the
  // heading inside `…-modal-unsaved-changes` wants to be `…-label-unsaved-changes`.
  const scope = containers.map((s) => (/\[data-testid="([^"]+)"\]/.exec(s) || [])[1]).find(Boolean) || '';
  const scopeName = scope
    .replace(new RegExp(`^${TESTID_PREFIX}-`), '')
    .replace(/^(modal|table|section|sub-tab-content|tab-content|form|sub-tab)-/, '');

  // Nothing but position left: spell out the row and column the selector counts to, since that
  // is exactly what the testid has to replace.
  const position = positionParts(entry.selector);
  const param = paramAnchor(entry.selector);
  const named = container || scopeName;
  const anonymous = named || /\[role="[a-z]+"\]/.test(entry.selector) || position.length || param;
  const base = named ? kebab(named) : anonymous ? kebab(module.slug) : kebab(entry.key);
  return [base, ...position, position.length ? '' : param].filter(Boolean).join('-');
}

/** `tr:nth-child(2) td:nth-child(5)` -> ['row-2', 'col-5'], keeping template params visible. */
function positionParts(selector) {
  const parts = [];
  const re = /(^|[\s>+~])(tr|td|th|li|tbody|button)?:(?:nth-child|nth-of-type)\(\s*([^)]+?)\s*\)|(^|[\s>+~])(tr|td|th|button)?:(first|last)-(?:child|of-type)/g;
  let m;
  while ((m = re.exec(selector))) {
    const tag = m[2] || m[5] || '';
    const index = m[3] ? kebab(m[3]) || paramAnchor(m[3]) || m[3] : m[6] === 'first' ? '1' : m[6];
    const slot = tag === 'td' || tag === 'th' ? 'col' : tag === 'tr' ? 'row' : 'item';
    parts.push(`${slot}-${index}`);
  }
  return parts;
}

function suggestTestid(entry, module) {
  const prefix = PREFIX_OVERRIDES[entry.key] || TESTID_PREFIX;
  if (entry.kind === 'inline') {
    const slot = inlineSlot(entry.selector);
    const name = inlineName(entry, module);
    return slot === 'element' ? `${prefix}-${name}` : `${prefix}-${slot}-${name}`;
  }
  let { slot } = splitKey(entry.key);
  const { rest } = splitKey(entry.key);
  // A `txt`/`lbl` key whose selector actually lands on a text node (a dialog's <p>, a <span>) is
  // a label, not a field — naming it `-input-` would mislead whoever adds the attribute.
  if (slot === 'input' && !/input|textarea|\[role="(textbox|searchbox|spinbutton|combobox)"\]/.test(entry.selector)) {
    slot = 'label';
  }
  const base = kebab(rest);
  const param = paramAnchor(entry.selector);
  // Drop a row parameter the key already spells out (lnkOfficeCode + {office-code}).
  const name = [base, param.replace(/[{}]/g, '') === base ? '' : param].filter(Boolean).join('-');
  if (slot === 'col') return `${prefix}-table-${module.slug}-col-${base.replace(/^col-/, '')}`;
  return slot ? `${prefix}-${slot}-${name}` : `${prefix}-${name}`;
}

/* ------------------------------------------------------------------ finding it on screen */

/** Where each surface starts, for the navigation line. */
const UI_ENTRY = {
  'left-panel-basic-information': 'Setup > Location Settings (left panel)',
  shared: 'Setup > Location Settings > any tab',
  dynamic: 'Setup > Location Settings > Pricing',
  'form-helpers': 'Setup > Location Settings > any tab',
};

/**
 * Plain-language directions to the element: which tab, which dialog or dropdown has to be open,
 * and whereabouts in a grid it sits. Without this a selector is only findable by someone who
 * already knows the screen — which is exactly the person who does not need the report.
 */
function uiParts(selector, module) {
  const steps = [UI_ENTRY[module.key] || `Setup > Location Settings > ${module.name.replace(/ tab$/, '')}`];

  // A dialog names itself, either in its copy or in its testid.
  const byCopy = /\[role="(?:dialog|alertdialog)"\][^ ]*:has-text\("([^"]+)"\)|:has\(h2:text-is\("([^"]+)"\)\)/.exec(selector);
  const byTestid = /\[data-testid="location-settings-modal-([a-z0-9-]+)"\]/.exec(selector);
  const dialog = (byCopy && (byCopy[1] || byCopy[2])) || (byTestid && byTestid[1].replace(/-/g, ' '));
  if (dialog) steps.push(`open the "${dialog}" dialog`);

  if (/\[role="listbox"\]/.test(selector)) steps.push('open the dropdown');
  // The trigger itself is on the page before the popover opens, so only something *inside* the
  // popover needs the popover opened first.
  const leaf = leafSegment(selector);
  const popover = /:has-text\("(?:Open popover|Popover Content)"\)|\[aria-label="Open popover"\]/;
  if (popover.test(selector) && !popover.test(leaf)) steps.push('open the date popover');
  if (/\[role="menu"\]/.test(selector)) steps.push('open the column menu');
  if (/^li:has-text|\sli:has-text/.test(selector)) steps.push('read the toast that appears after saving');

  // Whereabouts in a grid.
  const row = /tr:nth-child\(\s*([^)]+)\)/.exec(selector);
  const rowByText = /tr:has-text\("([^"]*)"\)|tr:has\(td:has-text\("([^"]*)"\)\)/.exec(selector);
  const col = /td:nth-child\(\s*([^)]+)\)/.exec(selector);
  const firstRow = /tr:first-child/.test(selector);
  const lastRow = /tr:last-child/.test(selector);
  const firstCol = /td:first-child/.test(selector);
  if (row || rowByText || col || firstRow || lastRow || firstCol) {
    const which = lastRow
      ? 'the last row (the Add row)'
      : firstRow
        ? 'the first row'
        : rowByText
          ? 'the row holding the value the test looks for'
          : row
            ? `row ${row[1].replace(/\$\{|\}/g, '')}`
            : 'any row';
    const cell = firstCol ? ', first column' : col ? `, column ${col[1].replace(/\$\{|\}/g, '')}` : '';
    steps.push(`in the results grid: ${which}${cell}`);
  }

  // [0] is where the screen starts; everything after is an action that has to happen first.
  return steps;
}

/**
 * How each dialog, popover or transient state is opened by hand. Keyed by the name `uiPath`
 * reads off the selector; each action mirrors what the page object clicks, so the manual steps
 * and the automated ones reach the same screen.
 */
const HOW_TO_OPEN = {
  'account list': 'Click the lookup button beside the Venue/Branch Account name.',
  'Select Customer Address': 'Click the **Address** button inside the Venue/Branch Account card — or the one in the Master Bill To Address card for the master version.',
  'Pay To List': 'Click the **Pay To Address** field label in the left panel.',
  'change local office': 'Click the **Add** button in the last row of the Shared Setup Locations grid.',
  'Save Changes': 'Change any field on the tab, then click **Save** — the confirmation dialog appears before the change is committed.',
  'unsaved changes': 'Change any field, then navigate away without saving (for example click **Home** in the sidebar).',
  'Unsaved changes': 'Change any field, then navigate away without saving (for example click **Home** in the sidebar).',
  Error: 'Appears when a save is rejected — force a failing save (for example submit a value the server refuses).',
};

/** The generic opening moves, before any surface-specific step. */
const UI_PRELUDE = [
  'Sign in to Navigator Cloud.',
  `Go to **Setup > Location Settings** and open office **${SAMPLE_OFFICE}** — the office the suite runs against.`,
];

/**
 * The path rewritten as plain CSS, so it can be pasted into the browser's element search.
 *
 * `:has-text()`, `:text-is()` and `text=` are Playwright's own syntax and mean nothing to a
 * browser — pasting them fails silently, which is worse than a selector that matches too much.
 * They are dropped here, together with anything holding a run-time value; the copy they matched
 * is handed back separately by `textHints`, and the surrounding steps (which dialog is open) do
 * the narrowing instead.
 */
function cssSelector(selector) {
  const css = selector
    // A :has(...) whose only job was matching copy carries no CSS meaning once the copy is gone.
    .replace(/:has\((?:[^()]|\([^()]*\))*:(?:has-)?text(?:-is)?\((?:[^()]|\([^()]*\))*\)[^()]*\)/g, '')
    .replace(/:(?:has-)?text(?:-is)?\((?:[^()]|\([^()]*\))*\)/g, '')
    .replace(/(^|\s)text=\S+/g, '$1')
    .replace(/:[a-z-]+\([^()]*\$\{[^}]*\}[^()]*\)/g, '')
    .replace(/\[[a-z-]+="[^"]*\$\{[^}]*\}[^"]*"\]/g, '')
    .replace(/:has\(\s*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return /\$\{/.test(css) || !css ? '' : css;
}

/**
 * A DevTools console line that lands on exactly the element the test targets: the CSS narrows
 * the candidates, and a text filter finishes the job where CSS cannot. `$$` is the console's own
 * querySelectorAll, so this needs nothing installed.
 */
function consoleOneLiner(item) {
  const quoted = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  const css = item.css || '*';
  if (!item.textHints.length) return `$$(${quoted(css)})`;

  const segments = splitPath(item.selector);
  const last = segments.length - 1;
  // Copy on a container is not copy on the element: a dialog holds the words, the checkbox
  // inside it holds none. So a container's text filters the container, and the rest of the path
  // is queried inside whatever survives.
  const containerIndex = segments.findIndex((seg, i) => i < last && textHints(seg).length);
  const leafHints = textHints(segments[last] || '');
  const onElement = (hints) =>
    hints.map((h) => `(e.innerText || e.getAttribute('aria-label') || e.placeholder || '').includes(${quoted(h)})`).join(' && ');

  if (containerIndex === -1) return `$$(${quoted(css)}).filter(e => ${onElement(leafHints)})`;

  const containerCss = cssSelector(segments.slice(0, containerIndex + 1).join(' ')) || '*';
  const insideCss = cssSelector(segments.slice(containerIndex + 1).join(' '));
  const containerText = textHints(segments[containerIndex]);
  const scoped = `$$(${quoted(containerCss)}).filter(e => e.innerText.includes(${quoted(containerText[0])}))`;
  if (!insideCss) return scoped;

  const query = `${scoped}.flatMap(e => [...e.querySelectorAll(${quoted(insideCss)})])`;
  return leafHints.length ? `${query}.filter(e => ${onElement(leafHints)})` : query;
}

/**
 * The testid of the nearest ancestor that has one.
 *
 * Reading a path like `[data-testid="…-modal-account-list"] tbody tr:first-child td:first-child
 * button[role="checkbox"]`, it is easy to conclude the element is already covered. That testid is
 * on the dialog; the checkbox inside it has none, which is why the row is in the report. Naming
 * the ancestor explicitly settles the question without anyone having to parse the selector.
 * A testid inside `:not(…)` is excluded — there it identifies a sibling being ruled out.
 */
function ancestorTestid(selector) {
  const segments = splitPath(selector);
  const ancestors = segments.slice(0, -1).join(' ').replace(/:not\([^)]*\)/g, '');
  const match = /\[data-testid(?:[\^$*~|]?=)"([^"]+)"\]/.exec(ancestors);
  return match ? match[1] : '';
}

/** The literal on-screen copy a selector matches on — what to search for by eye, or with Ctrl+F. */
function textHints(selector) {
  const hints = [];
  const re = /:(?:has-)?text(?:-is)?\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m;
  while ((m = re.exec(selector))) {
    if (!m[1].includes('${') && !hints.includes(m[1])) hints.push(m[1]);
  }
  return hints;
}

function elementType(entry) {
  if (entry.kind === 'inline') return 'inline locator';
  const { type } = splitKey(entry.key);
  // A `txt` key that lands on a <p> or a listbox message is read-only text, whatever it is called.
  if (type === 'input' && !/input|textarea|\[role="(textbox|searchbox|spinbutton|combobox)"\]/.test(entry.selector)) return 'text';
  return type;
}

/* ------------------------------------------------------------------ collection */

const STRATEGY_LABEL = {
  positional: 'positional (nth/first/last-child)',
  text: 'text match',
  'data-text': 'data-driven text match',
  placeholder: 'placeholder text',
  'form-name': 'form name attribute',
  'aria-label': 'aria-label',
  negation: ':not() disambiguation',
  role: 'role attribute',
  'css-class': 'CSS class',
  adjacency: 'DOM adjacency / parent hop',
  'semantic-attr': 'semantic attribute',
  tag: 'bare tag',
  'testid-scope': 'inside data-testid container',
};

const STRATEGY_ORDER = [
  'positional',
  'text',
  'data-text',
  'css-class',
  'placeholder',
  'form-name',
  'aria-label',
  'negation',
  'adjacency',
  'role',
  'semantic-attr',
  'tag',
  'testid-scope',
];

function describeStrategies(strategies) {
  const described = strategies
    .slice()
    .sort((a, b) => STRATEGY_ORDER.indexOf(a) - STRATEGY_ORDER.indexOf(b))
    .map((s) => STRATEGY_LABEL[s] || s)
    .join(' + ');
  return described || 'unclassified';
}

function countBy(items, key) {
  const out = new Map();
  for (const item of items) out.set(item[key], (out.get(item[key]) || 0) + 1);
  return out;
}

/** Severity first, then source order — the reading order of every table in the report. */
function bySeverity(a, b) {
  return PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority) || a.file.localeCompare(b.file) || a.line - b.line;
}

function groupByModule(items) {
  const byModule = new Map();
  for (const item of items) {
    if (!byModule.has(item.module.key)) byModule.set(item.module.key, []);
    byModule.get(item.module.key).push(item);
  }
  for (const list of byModule.values()) list.sort(bySeverity);
  return byModule;
}

function record(entry, file, items, stats, exclusions) {
  const module = moduleOf(file);
  const verdict = classify(entry);
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');

  if (verdict.verdict === 'covered') {
    stats.coveredSites += 1;
    stats.coveredSelectors.add(entry.selector);
    return;
  }
  if (verdict.verdict === 'excluded') {
    stats.excludedSites += 1;
    stats.excludedSelectors.add(entry.selector);
    exclusions.push({ module, key: entry.key, selector: entry.selector, reason: verdict.reason, file: rel, line: entry.line });
    return;
  }
  stats.fallbackSites += 1;
  items.push({
    module,
    id: '',
    kind: entry.kind,
    key: entry.key,
    type: elementType(entry),
    selector: entry.selector,
    // What the call itself passes, before the chain it hangs off is resolved in.
    step: entry.step || '',
    strategy: describeStrategies(verdict.strategies),
    strategies: verdict.strategies,
    priority: verdict.priority,
    suggested: suggestTestid(entry, module),
    uiPath: uiParts(entry.selector, module).join(' > '),
    uiSteps: uiParts(entry.selector, module),
    css: cssSelector(entry.selector),
    textHints: textHints(entry.selector),
    ancestorTestid: ancestorTestid(entry.selector),
    note: entry.note,
    file: rel,
    line: entry.line,
  });
}

/** IDs are assigned once, on the unfiltered set, so a filtered report keeps the same IDs. */
function assignIds(byModule) {
  for (const list of byModule.values()) {
    list.forEach((item, i) => {
      item.id = `${item.module.code}-${String(i + 1).padStart(3, '0')}`;
    });
  }
}

/**
 * One element, one row. The same inline locator often appears in several methods and several
 * tabs (a Radix popover, a shared dialog); those collapse into a single finding that records
 * every place it is used, so the count stays a count of elements and not of call sites.
 */
function dedupeInline(items) {
  const bySelector = new Map();
  const kept = [];

  for (const item of items) {
    const site = { module: item.module, file: item.file, line: item.line, method: item.key };
    if (item.kind !== 'inline') {
      kept.push({ ...item, sites: [site], alsoIn: [] });
      continue;
    }
    const seen = bySelector.get(item.selector);
    if (seen) {
      seen.sites.push(site);
      continue;
    }
    const fresh = { ...item, sites: [site], alsoIn: [] };
    bySelector.set(item.selector, fresh);
    kept.push(fresh);
  }

  for (const item of bySelector.values()) {
    const counts = new Map();
    for (const site of item.sites) counts.set(site.module.key, (counts.get(site.module.key) || 0) + 1);
    const primaryKey = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const first = item.sites.find((s) => s.module.key === primaryKey);
    item.module = first.module;
    item.key = first.method;
    item.file = first.file;
    item.line = first.line;
    item.suggested = suggestTestid({ kind: 'inline', key: item.key, selector: item.selector }, item.module);
    item.uiSteps = uiParts(item.selector, item.module);
    item.uiPath = item.uiSteps.join(' > ');
    item.alsoIn = [...new Set(item.sites.map((s) => s.module.name))].filter((n) => n !== item.module.name);
  }

  return kept;
}

/**
 * Two elements must never be handed the same suggested attribute — a developer would add one
 * testid and think both were done. Collisions are broken by whatever actually distinguishes the
 * two: the row and column they sit at, then the surface they are on, then a plain counter.
 */
function makeSuggestionsUnique(items) {
  const groups = new Map();
  for (const item of items) {
    if (!groups.has(item.suggested)) groups.set(item.suggested, []);
    groups.get(item.suggested).push(item);
  }
  const taken = new Set([...groups.keys()].filter((k) => groups.get(k).length === 1));
  for (const [name, group] of groups) {
    if (group.length === 1) continue;
    group.forEach((item, index) => {
      const candidates = [
        [name, ...positionParts(item.selector)].join('-'),
        `${name}-${kebab(item.module.slug)}`,
        `${name}-${index + 1}`,
      ];
      const pick = candidates.find((c) => c !== name && !taken.has(c)) || `${name}-${index + 1}`;
      item.suggested = pick;
      taken.add(pick);
    });
  }
}

function collect() {
  const items = [];
  const stats = {
    files: 0,
    // Every place a selector is used, before identical ones are collapsed.
    scanned: 0,
    coveredSites: 0,
    fallbackSites: 0,
    excludedSites: 0,
    // Distinct elements — the unit the report counts in.
    coveredSelectors: new Set(),
    excludedSelectors: new Set(),
    covered: 0,
    excluded: 0,
    gaps: 0,
  };
  const exclusions = [];

  // Definitions first: their key -> selector map is what lets a page object's
  // `getElement('key').locator('…')` chain resolve to a full path.
  const selectorMap = new Map();
  const definitions = [];
  for (const file of resolveSources(SELECTOR_SOURCES)) {
    stats.files += 1;
    const parsed = parseSelectorFile(file);
    definitions.push([file, parsed]);
    for (const entry of parsed) selectorMap.set(entry.key, entry.selector);
  }
  for (const [file, parsed] of definitions) {
    for (const entry of parsed) {
      stats.scanned += 1;
      record(entry, file, items, stats, exclusions);
    }
  }
  for (const file of resolveSources(PAGE_SOURCES)) {
    stats.files += 1;
    for (const entry of parsePageFile(file, selectorMap)) {
      stats.scanned += 1;
      record(entry, file, items, stats, exclusions);
    }
  }

  const deduped = dedupeInline(items);
  makeSuggestionsUnique(deduped);
  stats.gaps = deduped.length;
  stats.covered = stats.coveredSelectors.size;
  stats.excluded = stats.excludedSelectors.size;
  const byModule = groupByModule(deduped);
  assignIds(byModule);
  return { items: deduped, stats, exclusions, byModule };
}

/* ------------------------------------------------------------------ report */

function esc(text) {
  return String(text).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function coverage(stats) {
  const targeted = stats.covered + stats.gaps;
  return targeted ? Math.round((stats.covered / targeted) * 1000) / 10 : 0;
}

function projection(stats, fixed) {
  const targeted = stats.covered + stats.gaps;
  return targeted ? Math.round(((stats.covered + fixed) / targeted) * 1000) / 10 : 0;
}

function moduleRows(byModule) {
  return [...byModule.values()]
    .map((list) => {
      const counts = countBy(list, 'priority');
      return {
        list,
        name: list[0].module.name,
        slug: list[0].module.slug,
        counts,
        weight:
          (counts.get('CRITICAL') || 0) * 1000 +
          (counts.get('HIGH') || 0) * 100 +
          (counts.get('MEDIUM') || 0) * 10 +
          (counts.get('LOW') || 0),
      };
    })
    .sort((a, b) => b.weight - a.weight);
}

/**
 * Groups the findings by the screen they live on and turns each group into numbered steps a
 * person can follow without reading any code. One group per distinct "where to find it" path,
 * so a tester walks each screen once instead of chasing 105 elements one at a time.
 */
function locationGuide(items) {
  const surfaces = new Map();
  for (const item of items) {
    if (!surfaces.has(item.uiPath)) surfaces.set(item.uiPath, []);
    surfaces.get(item.uiPath).push(item);
  }

  return [...surfaces.entries()]
    .map(([path, list]) => {
      const [entry, ...rest] = list[0].uiSteps;
      const steps = [...UI_PRELUDE];
      // The entry line is "Setup > Location Settings > Tab"; the tab is the part worth a step.
      const tab = /Location Settings(?: \(left panel\))? ?>? ?(.*)$/.exec(entry);
      const tabName = tab && tab[1] ? tab[1] : '';
      if (entry.includes('(left panel)')) steps.push('Stay on the left-hand **Basic Information** panel — it is shown beside every tab.');
      else if (tabName && tabName !== 'any tab') steps.push(`Open the **${tabName}** tab.`);
      else if (tabName === 'any tab') steps.push('Open any tab — this surface is shared by all of them.');

      for (const part of rest) {
        const dialog = /open the "([^"]+)" dialog/.exec(part);
        const how = dialog ? HOW_TO_OPEN[dialog[1]] : null;
        if (dialog) steps.push(`${how || `Open the **${dialog[1]}** dialog.`}${how ? ` (opens the **${dialog[1]}** dialog)` : ''}`);
        else if (part === 'open the dropdown') steps.push('Click the dropdown so its option list is showing.');
        else if (part === 'open the date popover') steps.push('Click the calendar icon in the date cell so the popover is showing.');
        else if (part === 'open the column menu') steps.push('Click a column header, then open its menu.');
        else if (part.startsWith('read the toast')) steps.push('Click **Save** and watch the toast in the corner — it disappears after a few seconds.');
        else if (part.startsWith('in the results grid')) steps.push(`Look at ${part.replace('in the results grid: ', '')} of the grid.`);
        else steps.push(part.charAt(0).toUpperCase() + part.slice(1));
      }
      steps.push('Press **F12**, open **Elements**, press **Ctrl+F** and paste the selector below.');

      const sample = list.map((i) => i.css).find(Boolean) || '';
      const hints = [...new Set(list.flatMap((i) => i.textHints))];
      const counts = countBy(list, 'priority');
      return {
        path,
        steps,
        list,
        sample,
        hints,
        worst: PRIORITIES.find((p) => counts.get(p)),
        ids: list.map((i) => i.id),
      };
    })
    .sort((a, b) => PRIORITIES.indexOf(a.worst) - PRIORITIES.indexOf(b.worst) || b.list.length - a.list.length);
}

function buildMarkdown({ items, stats, exclusions, byModule, filter }, argv) {
  const today = new Date().toISOString().slice(0, 10);
  const prio = countBy(items, 'priority');
  const cov = coverage(stats);
  const rows = moduleRows(byModule);
  const out = [];
  const w = (line = '') => out.push(line);

  w('# Missing data-testid Report — Locations');
  w();
  w(`**Report date:** ${today}  `);
  w('**Application:** Navigator Cloud (Angular / Radix UI)  ');
  w('**Scope:** Setup > Location Settings and its tabs — Locations module only  ');
  w('**Framework:** Playwright + TypeScript  ');
  w(`**Generated by:** \`node scripts/audit-missing-testids.js${argv.length ? ` ${argv.join(' ')}` : ''}\``);
  if (filter && (filter.modules.length || filter.priorities.length)) {
    w(
      `**Filtered view:** showing ${items.length} of ${stats.gaps} findings${filter.modules.length ? ` — modules ${filter.modules.join(', ')}` : ''}${filter.priorities.length ? ` — priority ${filter.priorities.join(', ')}` : ''}. Coverage figures describe the whole Locations module.`,
    );
  }
  w();

  w('## 1. Executive summary');
  w();
  w(
    `Every selector the Locations suite uses to reach an element — ${stats.scanned} call sites across ${stats.files} files — was classified by its targeting strategy. Identical selectors are counted once, so the numbers below are elements, not call sites.`,
  );
  w();
  w('| Metric | Count | Share |');
  w('| --- | --- | --- |');
  w(`| Distinct elements targeted | ${stats.covered + stats.gaps} | 100% |`);
  w(`| — reached by their own data-testid | ${stats.covered} | ${cov}% |`);
  w(`| — reached by a fallback selector | ${stats.gaps} | ${Math.round((100 - cov) * 10) / 10}% |`);
  w(`| Excluded (structural / opted out) | ${stats.excluded} | — |`);
  w(`| **Missing data-testid (this report)** | **${items.length}** | — |`);
  w();
  w(
    `Those ${items.length} elements are reached from ${stats.fallbackSites} call sites in the suite, so a single missing attribute is usually felt in several places.`,
  );
  w();
  w(
    `${items.length} elements across ${byModule.size} Locations surfaces lack a data-testid. They are reached today through fallback strategies — text matching, CSS classes, positional \`nth-child\`, role combinations — that break on internationalization, DOM restructuring or a copy edit.`,
  );
  w();

  w('## 2. Methodology');
  w();
  w('**What was audited**');
  w();
  for (const src of [...SELECTOR_SOURCES, ...PAGE_SOURCES]) w(`- \`${src.dir || src.file}\``);
  w();
  w("Nothing outside the Locations module is read, so no finding here belongs to another team's page.");
  w();
  w('**How items were classified**');
  w();
  w(
    '- **CRITICAL** — positional selectors (`nth-child`, `first-child`, `last-child`, `last-of-type`, `.nth()`) that break when a row or column is added, removed or reordered.',
  );
  w(
    '- **HIGH** — text-matching selectors (`:has-text()`, `:text-is()`) that break on i18n, copy edits or truncation. A data-driven row lookup lands here too: the row still needs an identifier of its own.',
  );
  w(
    '- **MEDIUM** — stable but implicit: `placeholder`, `input[name=]`, `aria-label`, a CSS/Tailwind class, DOM adjacency (`+`, `>`, parent hop), or a `:not()` used to tell two same-role siblings apart.',
  );
  w(
    '- **LOW** — already inside a data-testid container and picked out by a bare tag or by text within that scope. Works today; a testid would make it explicit.',
  );
  w();
  w('**What was excluded**');
  w();
  w(
    '- Structural queries — `tbody tr` row counts, `thead th` header enumeration, parent hops, "is this cell editable" probes. These query structure, not identity.',
  );
  w(
    '- Elements already carrying their own data-testid, and containers whose child is picked out by role plus a semantic attribute (`button[role="radio"][value="true"]`).',
  );
  w('- Selectors marked `// testid-audit: ignore -- <reason>` in the source; each is listed with its reason in the appendix.');
  w();

  w('## 3. Priority summary');
  w();
  w('| Priority | Count | Meaning |');
  w('| --- | --- | --- |');
  w(`| CRITICAL | ${prio.get('CRITICAL') || 0} | Breaks on a row or column change |`);
  w(`| HIGH | ${prio.get('HIGH') || 0} | Breaks on a copy or language change |`);
  w(`| MEDIUM | ${prio.get('MEDIUM') || 0} | Stable but implicit; breaks on a design or form-model change |`);
  w(`| LOW | ${prio.get('LOW') || 0} | Works inside a testid scope; would be more explicit with one |`);
  w();
  w('### By module');
  w();
  w('| Module | Missing | CRITICAL | HIGH | MEDIUM | LOW | Top risk |');
  w('| --- | --- | --- | --- | --- | --- | --- |');
  for (const row of rows) {
    const worst = PRIORITIES.find((p) => row.counts.get(p));
    const topItem = row.list.find((i) => i.priority === worst);
    w(
      `| ${esc(row.name)} | ${row.list.length} | ${row.counts.get('CRITICAL') || 0} | ${row.counts.get('HIGH') || 0} | ${row.counts.get('MEDIUM') || 0} | ${row.counts.get('LOW') || 0} | ${worst}: \`${esc(topItem.key)}\` (${esc(topItem.strategy)}) |`,
    );
  }
  w();

  w('## 4. Module-by-module breakdown');
  w();
  w(
    'Each table lists every element missing a data-testid, the selector strategy in use today, and a suggested data-testid value following the naming convention in section 6. Step-by-step directions to each screen are in section 5.',
  );
  w();
  w(
    `**A data-testid inside a selector is not the element's own.** Where a path reads \`[data-testid="…-modal-account-list"] tbody tr:first-child td:first-child button[role="checkbox"]\`, the attribute is on the dialog and the checkbox inside it has none — which is why the row is here. ${items.filter((i) => i.ancestorTestid).length} of these ${items.length} findings sit inside a container that already carries one; the workbook names it in *Testid already on an ancestor*.`,
  );
  w();
  w(
    'Selectors are printed as the **full path from the page root**, not as the fragment that appears on the source line. A page object reaches a grid cell in steps — the dialog, then the row, then the cell — so any single step matches nothing on its own; the path below is what can be searched for in the DOM. A `${placeholder}` marks a value the test supplies at run time (a row\'s text, a column index). Where a path passes through a parent hop (`..`), it cannot be expressed as one selector, so the element is reported from that hop onwards. The workbook carries both forms, in *Current selector (full path)* and *As written in code*.',
  );
  w();
  w(
    '**Where to find it on screen** is the navigation to the element: the tab, then any dialog or dropdown that has to be open, then whereabouts in a grid it sits. Most of these elements do not exist in the DOM until that state is reached, so a selector alone will match nothing.',
  );
  w();
  w(
    'Note on Radix: checkboxes, dropdowns and buttons render as `button[role="checkbox"]`, `[role="combobox"]` and `[role="button"]`, not as native `input` or `button` elements — searching the DOM for `input[type=checkbox]` will not find them.',
  );
  w();
  rows.forEach((row, index) => {
    w(`### 4.${index + 1} ${row.name}`);
    w();
    const files = [...new Set(row.list.map((i) => i.file))];
    w(`Source: ${files.map((f) => `\`${f}\``).join(', ')}`);
    w();
    w('| ID | Element | Type | Where to find it on screen | Current selector | Strategy | Priority | Suggested data-testid | Source |');
    w('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const item of row.list) {
      const extra = item.sites.length > 1 ? ` (+${item.sites.length - 1} more)` : '';
      const label = item.kind === 'inline' ? `${item.key}()` : item.key;
      w(
        `| ${item.id} | \`${esc(label)}\` | ${esc(item.type)} | ${esc(item.uiPath)} | \`${esc(item.selector)}\` | ${esc(item.strategy)} | ${item.priority} | \`${esc(item.suggested)}\` | ${item.file}:${item.line}${extra} |`,
      );
    }
    w();
    const checkable = row.list.filter((i) => i.css && i.css !== i.selector);
    if (checkable.length) {
      w(
        'The paths above use Playwright syntax. As plain CSS — text matching dropped, since a browser cannot express it — these are what to paste into the browser\'s element search once the screen is open:',
      );
      w();
      for (const item of checkable) w(`- **${item.id}**: \`${esc(item.css)}\``);
      w();
    }
    const notes = row.list.filter((i) => i.note);
    if (notes.length) {
      w('Notes carried from the source files:');
      w();
      for (const item of notes) w(`- **${item.id}** (\`${esc(item.key)}\`): ${esc(item.note)}`);
      w();
    }
    const shared = row.list.filter((i) => i.alsoIn.length);
    if (shared.length) {
      w('Shared elements — fixing these once benefits every surface listed:');
      w();
      for (const item of shared) w(`- **${item.id}**: also used on ${item.alsoIn.map((n) => esc(n)).join(', ')}`);
      w();
    }
    const parameterized = row.list.filter((i) => /\$\{/.test(i.selector));
    if (parameterized.length) {
      const plural = parameterized.length === 1 ? 'one is a parameterized accessor that repeats' : `${parameterized.length} are parameterized accessors that repeat`;
      w(
        `> Of these, ${plural} per grid row. Give each row a data-testid carrying its own identifier (e.g. \`${TESTID_PREFIX}-${row.slug}-row-{name}\`), so neither the row text nor the column position is needed.`,
      );
      w();
    }
  });

  w('## 5. How to find these elements by hand');
  w();
  w(
    `Every element below is grouped by the screen it lives on, so each screen is walked once. None of them exist in the DOM until that screen is reached — a selector checked from anywhere else matches nothing. Steps assume office **${SAMPLE_OFFICE}**, the one the suite runs against.`,
  );
  w();
  const guide = locationGuide(items);
  guide.forEach((surface, index) => {
    w(`### 5.${index + 1} ${esc(surface.path)}`);
    w();
    w(`${surface.list.length} element${surface.list.length === 1 ? '' : 's'} here — ${surface.ids.join(', ')}`);
    w();
    surface.steps.forEach((step, n) => w(`${n + 1}. ${step}`));
    w();
    if (surface.sample) {
      w('```');
      w(surface.sample);
      w('```');
      w();
    }
    if (surface.hints.length) {
      w(`On-screen text to look for: ${surface.hints.map((h) => `**${esc(h)}**`).join(', ')}.`);
      w();
    }
  });
  w('## 6. Naming convention reference');
  w();
  w('Every suggestion above follows the patterns already in the application.');
  w();
  w('| Pattern | Example | When to use |');
  w('| --- | --- | --- |');
  w(`| \`${TESTID_PREFIX}-btn-{action}\` | \`${TESTID_PREFIX}-btn-save\` | Action buttons |`);
  w(`| \`${TESTID_PREFIX}-checkbox-{feature}\` | \`${TESTID_PREFIX}-checkbox-apply-ldw\` | Toggle checkboxes |`);
  w(`| \`${TESTID_PREFIX}-input-{field}\` | \`${TESTID_PREFIX}-input-oracle-product\` | Text inputs, spinbuttons, date pickers |`);
  w(`| \`${TESTID_PREFIX}-select-{field}\` | \`${TESTID_PREFIX}-select-billing-cycle\` | Dropdown / combobox |`);
  w(`| \`${TESTID_PREFIX}-table-{name}\` | \`${TESTID_PREFIX}-table-currency\` | Data tables |`);
  w(`| \`${TESTID_PREFIX}-table-{name}-col-{column}\` | \`${TESTID_PREFIX}-table-currency-col-code\` | Column headers |`);
  w(`| \`${TESTID_PREFIX}-modal-{name}\` | \`${TESTID_PREFIX}-modal-account-list\` | Dialog / alertdialog containers |`);
  w(`| \`${TESTID_PREFIX}-sub-tab-{name}\` | \`${TESTID_PREFIX}-sub-tab-notes\` | Tab triggers |`);
  w(`| \`${TESTID_PREFIX}-sub-tab-content-{name}\` | \`${TESTID_PREFIX}-sub-tab-content-notes\` | Tab panels |`);
  w(`| \`${TESTID_PREFIX}-section-{name}\` | \`${TESTID_PREFIX}-section-notes\` | Section wrappers |`);
  w(`| \`${TESTID_PREFIX}-label-{description}\` | \`${TESTID_PREFIX}-label-note-character-counter\` | Static labels, counters, progress |`);
  w(`| \`${TESTID_PREFIX}-error-{type}\` | (proposed) | Validation messages |`);
  w(`| \`${TESTID_PREFIX}-toast-{event}\` | (proposed) | Toast notifications |`);
  w();
  w("For a repeating row, put the row's own identifier in the testid rather than its position:");
  w();
  w(`\`${TESTID_PREFIX}-{table}-row-{identifier}-{field}\` — e.g. \`${TESTID_PREFIX}-pricing-row-us-labor-is-alternate\`.`);
  w();

  w('## 7. Quick wins');
  w();
  const wins = rows.slice(0, 3);
  const winCount = wins.reduce((n, r) => n + r.list.length, 0);
  wins.forEach((row, i) => {
    const c = row.counts;
    w(`**7${String.fromCharCode(97 + i)}. ${row.name} — ${row.list.length} elements**`);
    w();
    w(
      `${c.get('CRITICAL') || 0} CRITICAL, ${c.get('HIGH') || 0} HIGH, ${c.get('MEDIUM') || 0} MEDIUM, ${c.get('LOW') || 0} LOW. Items ${row.list[0].id} through ${row.list[row.list.length - 1].id}.`,
    );
    w();
  });
  w(
    `Fixing these ${wins.length} surfaces (${winCount} elements) raises Locations data-testid coverage from ${cov}% to roughly ${projection(stats, winCount)}%.`,
  );
  w();

  w('## 8. Statistics');
  w();
  w('| Category | Count |');
  w('| --- | --- |');
  w(`| Selector call sites audited | ${stats.scanned} |`);
  w(`| Distinct elements targeted | ${stats.covered + stats.gaps} |`);
  w(`| Reached by their own data-testid | ${stats.covered} |`);
  w(`| Excluded (structural / opted out) | ${stats.excluded} distinct (${stats.excludedSites} call sites) |`);
  w(`| Missing data-testid | ${items.length} |`);
  for (const p of PRIORITIES) w(`| ${p} priority | ${prio.get(p) || 0} |`);
  w();
  const criticalHigh = (prio.get('CRITICAL') || 0) + (prio.get('HIGH') || 0);
  w('| Scenario | Coverage |');
  w('| --- | --- |');
  w(`| Current state | ${cov}% |`);
  w(`| After quick wins (${winCount} elements) | ${projection(stats, winCount)}% |`);
  w(`| After all CRITICAL + HIGH (${criticalHigh} elements) | ${projection(stats, criticalHigh)}% |`);
  w(`| After all ${items.length} fixes | ${projection(stats, items.length)}% |`);
  w();

  w('## Appendix — exclusions');
  w();
  const optedOut = exclusions.filter((e) => e.reason.startsWith('opted out'));
  const structural = exclusions.filter((e) => !e.reason.startsWith('opted out'));
  w(
    `${structural.length} call sites (${new Set(structural.map((e) => e.selector)).size} distinct selectors) were excluded as structural — row counts, header enumeration, parent hops, editability probes — and ${optedOut.length} were opted out in the source.`,
  );
  w();
  if (optedOut.length) {
    w('| Selector | Reason given | Source |');
    w('| --- | --- | --- |');
    for (const e of optedOut) {
      w(`| \`${esc(e.selector)}\` | ${esc(e.reason.replace(/^opted out -- /, ''))} | ${e.file}:${e.line} |`);
    }
    w();
  }
  w('<details><summary>Structural queries excluded</summary>');
  w();
  w('| Selector | Why | First seen |');
  w('| --- | --- | --- |');
  const seen = new Set();
  for (const e of structural) {
    if (seen.has(e.selector)) continue;
    seen.add(e.selector);
    w(`| \`${esc(e.selector)}\` | ${esc(e.reason.replace(/^(structural query|counting probe) — /, ''))} | ${e.file}:${e.line} |`);
  }
  w();
  w('</details>');
  w();
  w('---');
  w();
  w(
    'Regenerate with `npm run audit:testids`. Mark an intentional fallback with `// testid-audit: ignore -- <reason>` above the selector and it moves to the appendix with that reason.',
  );
  w();
  return out.join('\n');
}

/* ------------------------------------------------------------------ excel workbook */

/**
 * The findings as a workbook for the application team.
 *
 * This is the copy that gets shared, so it carries only what someone adding the attributes needs:
 * what to add, where the element is, and how to confirm they have the right one. The audit's own
 * bookkeeping — coverage maths, selector strategies, source files and line numbers, the
 * exclusions — stays in the markdown and JSON, which are the QA team's copies.
 *
 * Three sheets: Read me, Missing testids (the work list), How to locate (steps per screen).
 * Column widths and an autofilter are set; the community build of `xlsx` cannot write cell
 * styling, so nothing here depends on bold or colour to be readable.
 */
function buildWorkbook({ items, stats, byModule, filter }) {
  const XLSX = require('xlsx');
  const today = new Date().toISOString().slice(0, 10);
  const prio = countBy(items, 'priority');
  const rows = moduleRows(byModule);
  const scoped = items.filter((i) => i.ancestorTestid).length;

  const book = XLSX.utils.book_new();
  const addSheet = (name, aoa, widths) => {
    const sheet = XLSX.utils.aoa_to_sheet(aoa);
    sheet['!cols'] = widths.map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(book, sheet, name);
    return sheet;
  };

  /* -- Read me ---------------------------------------------------------- */
  const readme = [
    ['Missing data-testid — Locations'],
    [],
    ['What this is', `${items.length} interactive elements in Setup > Location Settings that have no data-testid of their own.`],
    ['Why it matters', 'The automated suite has to reach them by text, by CSS class or by counting rows and columns. Those break on a copy edit, a design change or a reordered column — and a broken selector reads as a failing test, not as a UI change.'],
    ['What is being asked', 'Add the attribute named in "Suggested data-testid" to the element described in each row. The names follow the convention already used in the application (see below).'],
    ['Report date', today],
    ['Scope', `Setup > Location Settings and its tabs, office ${SAMPLE_OFFICE}`],
  ];
  if (filter && (filter.modules.length || filter.priorities.length)) {
    readme.push(['Filtered view', `showing ${items.length} of ${stats.gaps} findings`]);
  }
  readme.push(
    [],
    ['How to read a row'],
    [
      'A data-testid shown in a selector belongs to a CONTAINER the element sits inside — a dialog, a table, a section — not to the element being reported.',
    ],
    [
      `${scoped} of the ${items.length} elements sit inside a container that already has one; the other ${items.length - scoped} have none anywhere in their path. The "Testid already on the container" column says which is which.`,
    ],
    ['Radix note', 'Checkboxes, dropdowns and buttons render as button[role="checkbox"], [role="combobox"] and [role="button"] — not as native input or button elements. Searching the DOM for input[type=checkbox] will not find them.'],
    [],
    ['Priority', 'Count', 'What it means'],
    ['CRITICAL', prio.get('CRITICAL') || 0, 'Found by counting rows or columns — breaks the moment a row or column is added, removed or reordered'],
    ['HIGH', prio.get('HIGH') || 0, 'Found by matching visible text — breaks on a copy edit, a translation or truncation'],
    ['MEDIUM', prio.get('MEDIUM') || 0, 'Found by placeholder, form name, aria-label or a CSS class — stable today, implicit and easy to break'],
    ['LOW', prio.get('LOW') || 0, 'Inside a container that has a testid — works today, would be more robust with its own'],
    [],
    ['Screen', 'Elements to add'],
  );
  for (const row of rows) readme.push([row.name, row.list.length]);
  readme.push(
    [],
    ['Naming convention — the patterns already in the application'],
    ['Pattern', 'Example', 'When to use'],
    [`${TESTID_PREFIX}-btn-{action}`, `${TESTID_PREFIX}-btn-save`, 'Action buttons'],
    [`${TESTID_PREFIX}-checkbox-{feature}`, `${TESTID_PREFIX}-checkbox-apply-ldw`, 'Toggle checkboxes'],
    [`${TESTID_PREFIX}-input-{field}`, `${TESTID_PREFIX}-input-oracle-product`, 'Text inputs, spinbuttons, date pickers'],
    [`${TESTID_PREFIX}-select-{field}`, `${TESTID_PREFIX}-select-billing-cycle`, 'Dropdown / combobox'],
    [`${TESTID_PREFIX}-table-{name}`, `${TESTID_PREFIX}-table-currency`, 'Data tables'],
    [`${TESTID_PREFIX}-table-{name}-col-{column}`, `${TESTID_PREFIX}-table-currency-col-code`, 'Column headers'],
    [`${TESTID_PREFIX}-modal-{name}`, `${TESTID_PREFIX}-modal-account-list`, 'Dialog / alertdialog containers'],
    [`${TESTID_PREFIX}-section-{name}`, `${TESTID_PREFIX}-section-notes`, 'Section wrappers'],
    [`${TESTID_PREFIX}-label-{description}`, `${TESTID_PREFIX}-label-note-character-counter`, 'Static labels, counters, progress'],
    [`${TESTID_PREFIX}-error-{type}`, '(proposed)', 'Validation messages'],
    [`${TESTID_PREFIX}-toast-{event}`, '(proposed)', 'Toast notifications'],
    [
      `${TESTID_PREFIX}-{table}-row-{identifier}-{field}`,
      `${TESTID_PREFIX}-pricing-row-us-labor-is-alternate`,
      'A repeating grid row: carry the row identifier, never its position',
    ],
  );
  addSheet('Read me', readme, [22, 108, 70]);

  /* -- Missing testids -------------------------------------------------- */
  const header = [
    'ID',
    'Priority',
    'Screen',
    'Element type',
    'Where to find it on screen',
    'Suggested data-testid',
    'Testid already on the container',
    'Confirm with (CSS in DevTools)',
    'Text to match',
    'Console one-liner (exact match)',
    'Dev status',
    'Dev comment',
  ];
  const ordered = items
    .slice()
    .sort(
      (a, b) =>
        PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority) ||
        a.module.name.localeCompare(b.module.name) ||
        a.id.localeCompare(b.id),
    );
  const findings = [header];
  for (const item of ordered) {
    findings.push([
      item.id,
      item.priority,
      item.module.name,
      item.type === 'inline locator' ? 'element' : item.type,
      item.uiPath,
      item.suggested,
      item.ancestorTestid || 'none',
      item.css || '(cannot be expressed in CSS — follow the UI path)',
      item.textHints.join(' | '),
      consoleOneLiner(item),
      '',
      '',
    ]);
  }
  const findingsSheet = addSheet('Missing testids', findings, [10, 10, 34, 14, 64, 46, 46, 70, 34, 80, 14, 34]);
  findingsSheet['!autofilter'] = {
    ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: findings.length - 1, c: header.length - 1 } }),
  };

  /* -- How to locate ---------------------------------------------------- */
  const guide = [
    ['Screen', 'Elements here', 'Worst priority', 'Step-by-step', 'CSS to check in DevTools', 'On-screen text to look for'],
    ...locationGuide(items).map((surface) => [
      surface.path,
      surface.ids.join(', '),
      surface.worst,
      surface.steps.map((s, n) => `${n + 1}. ${s.replace(/\*\*/g, '')}`).join('\n'),
      surface.sample,
      surface.hints.join(' | '),
    ]),
  ];
  addSheet('How to locate', guide, [60, 34, 14, 96, 76, 40]);

  return book;
}

/* ------------------------------------------------------------------ cli */

function flag(name) {
  return process.argv.includes(`--${name}`);
}

function option(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  const value = i > -1 ? process.argv[i + 1] : undefined;
  return value && !value.startsWith('--') ? value : fallback;
}

/**
 * Writes one output file, and survives the file being held open. On Windows a report that is
 * open in an editor or mid-sync in OneDrive answers EBUSY/EPERM, which must not lose the other
 * outputs or bury the run in a stack trace — so write beside the target and rename over it, and
 * if even that is refused, say which file is locked and carry on.
 */
function writeOut(label, filePath, write) {
  const rel = path.relative(ROOT, filePath).replace(/\\/g, '/');
  const temp = `${filePath}.tmp-${process.pid}`;
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    write(temp);
    fs.renameSync(temp, filePath);
    console.log(`  ${label.padEnd(8)} ${rel}`);
    return true;
  } catch (err) {
    try {
      fs.rmSync(temp, { force: true });
    } catch {
      // The temp file is already gone, or is itself locked; nothing useful to do here.
    }
    const locked = err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'EACCES';
    console.log(`  ${label.padEnd(8)} not written — ${locked ? `${rel} is open in another program (close it, or wait for OneDrive to finish syncing)` : err.message}`);
    return false;
  }
}

function multi(name) {
  const out = [];
  process.argv.forEach((arg, i) => {
    const value = process.argv[i + 1];
    if (arg === `--${name}` && value && !value.startsWith('--')) out.push(...value.split(','));
  });
  return out.map((s) => s.trim()).filter(Boolean);
}

function applyFilters(result) {
  const modules = multi('module').map((m) => m.toLowerCase());
  const priorities = multi('priority').map((p) => p.toUpperCase());
  if (!modules.length && !priorities.length) return result;

  const matchesModule = (item) =>
    !modules.length ||
    modules.some(
      (m) => item.module.key.includes(m) || item.module.name.toLowerCase().includes(m) || item.module.code.toLowerCase() === m,
    );
  const items = result.items.filter((i) => matchesModule(i) && (!priorities.length || priorities.includes(i.priority)));
  // `stats.gaps` stays the full picture: coverage describes the module, not the current view.
  return { ...result, items, byModule: groupByModule(items), filter: { modules, priorities } };
}

function main() {
  const result = applyFilters(collect());
  const argv = process.argv.slice(2);

  if (!result.items.length) {
    console.log('[audit:testids] No missing data-testid found in the Locations module for this filter.');
    return 0;
  }

  const markdown = buildMarkdown(result, argv);
  const prio = countBy(result.items, 'priority');
  const pad = (s, n) => String(s).padEnd(n).slice(0, n);

  console.log(
    `\n[audit:testids] Locations module — ${result.stats.scanned} selectors audited, ${coverage(result.stats)}% carry their own data-testid\n`,
  );
  console.log(`  missing:  ${result.items.length}    ${PRIORITIES.map((p) => `${p} ${prio.get(p) || 0}`).join('    ')}`);
  console.log(`  excluded: ${result.stats.excluded} structural / opted out\n`);
  console.log(`  ${pad('MODULE', 46)}${pad('MISSING', 9)}${pad('CRIT', 6)}${pad('HIGH', 6)}${pad('MED', 6)}LOW`);
  const rows = moduleRows(result.byModule);
  for (const row of rows) {
    const c = row.counts;
    console.log(
      `  ${pad(row.name, 46)}${pad(row.list.length, 9)}${pad(c.get('CRITICAL') || 0, 6)}${pad(c.get('HIGH') || 0, 6)}${pad(c.get('MEDIUM') || 0, 6)}${c.get('LOW') || 0}`,
    );
  }
  console.log();

  if (flag('verbose')) {
    for (const row of rows) {
      console.log(`  ${row.name}`);
      for (const item of row.list) {
        console.log(`    ${item.id}  ${pad(item.priority, 9)}${pad(item.key, 40)}${item.file}:${item.line}`);
        console.log(`              ${pad('', 9)}${item.strategy} -> ${item.suggested}`);
      }
      console.log();
    }
  }

  if (!flag('no-write')) {
    const mdPath = path.resolve(ROOT, option('md', 'reports/bugs/missing-testid-locations.md'));
    writeOut('report:', mdPath, (target) => fs.writeFileSync(target, markdown, 'utf8'));

    const jsonPath = path.resolve(ROOT, option('json', 'reports/bugs/missing-testid-locations.json'));
    writeOut('json:', jsonPath, (target) =>
      fs.writeFileSync(
        target,
        `${JSON.stringify(
          {
            generatedAt: new Date().toISOString(),
            scope: 'locations',
            sources: [...SELECTOR_SOURCES, ...PAGE_SOURCES].map((s) => s.dir || s.file),
            stats: {
              files: result.stats.files,
              callSitesAudited: result.stats.scanned,
              distinctElementsTargeted: result.stats.covered + result.stats.gaps,
              coveredByTestid: result.stats.covered,
              missingTestid: result.stats.gaps,
              excluded: result.stats.excluded,
              fallbackCallSites: result.stats.fallbackSites,
              coveragePercent: coverage(result.stats),
            },
            priorities: Object.fromEntries(PRIORITIES.map((p) => [p, prio.get(p) || 0])),
            items: result.items.map((i) => ({ ...i, module: i.module.name, moduleKey: i.module.key })),
            exclusions: result.exclusions.map((e) => ({ ...e, module: e.module.name })),
          },
          null,
          2,
        )}\n`,
        'utf8',
      ),
    );

    const xlsxPath = path.resolve(ROOT, option('xlsx', 'reports/bugs/missing-testid-locations.xlsx'));
    try {
      const book = buildWorkbook(result);
      writeOut('excel:', xlsxPath, (target) => require('xlsx').writeFile(book, target, { bookType: 'xlsx' }));
    } catch (err) {
      // The workbook is a convenience on top of the markdown and JSON, so a missing or broken
      // `xlsx` install must not fail the audit.
      console.log(`  excel:   skipped — ${err.message}`);
    }
    console.log();
  }

  if (flag('print')) console.log(markdown);

  const blocking = (prio.get('CRITICAL') || 0) + (prio.get('HIGH') || 0);
  return flag('strict') && blocking ? 1 : 0;
}

process.exit(main());
