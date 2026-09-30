#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const XLSX = require('xlsx');
const { captureDomScreenshot } = require('./dom-screenshot.js');
const { parseStepsFile, executeSteps } = require('./steps-runner.js');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_CONFIG_PATH = path.join(ROOT, 'config', 'testid-audit.config.js');

const NON_INTERACTIVE_TAGS = new Set([
  'div', 'span', 'section', 'main', 'article', 'header', 'footer', 'nav', 'ul', 'ol', 'li', 'p', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'label', 'fieldset', 'legend'
]);

const INTERACTIVE_TAGS = new Set([
  'button', 'a', 'input', 'textarea', 'select', 'option', 'summary', 'details', 'checkbox', 'radio'
]);

const INTERACTIVE_ROLES = new Set([
  'button', 'tab', 'tablist', 'option', 'combobox', 'menuitem', 'menu', 'checkbox', 'radio', 'switch', 'link', 'textbox', 'searchbox', 'spinbutton'
]);

function cleanText(value = '') {
  return String(value)
    .replace(/\s+/g, ' ')
    .replace(/\u00a0/g, ' ')
    .trim();
}

function parseAttributes(raw = '') {
  const attrs = {};
  const matcher = /([a-zA-Z0-9:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let match;
  while ((match = matcher.exec(raw)) !== null) {
    const name = match[1].toLowerCase();
    const val = match[2] ?? match[3] ?? match[4] ?? '';
    attrs[name] = val;
  }
  return attrs;
}

function normalizeIdFragment(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-')
    .trim();
}

function dedupeResults(items) {
  const seen = new Set();
  const results = [];
  for (const item of items) {
    const key = [
      item.moduleName,
      item.pageUrl,
      item.tagName,
      item.role,
      item.text,
      item.ariaLabel,
      item.id,
      item.name,
      item.path,
      item.currentLocator,
    ].filter(Boolean).join('|');

    if (seen.has(key)) continue;
    seen.add(key);
    results.push(item);
  }
  return results;
}

function buildSuggestedTestId({ moduleName = 'generic', text = '', tagName = 'element', role = '', name = '' } = {}) {
  const moduleSegment = normalizeIdFragment(moduleName);
  const labelSegment = normalizeIdFragment(text || name || '');
  const controlSegment = normalizeIdFragment(role || tagName || 'element');

  const parts = [moduleSegment, labelSegment, controlSegment].filter(Boolean);
  const uniqueParts = [];
  for (const part of parts) {
    if (!uniqueParts.includes(part)) {
      uniqueParts.push(part);
    }
  }

  const normalized = uniqueParts.join('-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
  return normalized || 'generic-element';
}

function riskForElement(tagName, role = '') {
  const key = role || tagName.toLowerCase();
  if (['button', 'input', 'textarea', 'select', 'checkbox', 'radio', 'combobox', 'switch', 'spinbutton'].includes(key)) return 'HIGH';
  if (['tab', 'menuitem', 'option', 'link'].includes(key)) return 'MEDIUM';
  return 'LOW';
}

function isHiddenElement(el) {
  if (!el || !(el instanceof Element)) return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return true;
  if (el.getAttribute('hidden') !== null || el.getAttribute('aria-hidden') === 'true') return true;
  return false;
}

function getElementPath(el) {
  const segments = [];
  let current = el;
  while (current && current.nodeType === 1 && current !== document.body) {
    let selector = current.tagName.toLowerCase();
    const parent = current.parentElement;
    if (parent) {
      const sameTagSiblings = Array.from(parent.children).filter((sibling) => sibling.tagName === current.tagName);
      if (sameTagSiblings.length > 1) {
        selector += `:nth-of-type(${sameTagSiblings.indexOf(current) + 1})`;
      }
    }
    segments.unshift(selector);
    current = parent;
  }
  return ['body', ...segments].join(' > ');
}

function findMeaningfulElementInHtmlTag({ tagName, attributes = {}, moduleName, pageUrl = 'about:blank', text = '' }) {
  const lowerTag = String(tagName || '').toLowerCase();
  if (!lowerTag || NON_INTERACTIVE_TAGS.has(lowerTag)) return null;
  if (lowerTag === 'svg' || lowerTag === 'path' || lowerTag === 'g') return null;

  const role = String(attributes.role || '').trim();
  const ariaLabel = String(attributes['aria-label'] || '').trim();
  const hidden = attributes.hidden !== undefined || attributes['aria-hidden'] === 'true';
  if (hidden) return null;

  const isInteractiveByTag = INTERACTIVE_TAGS.has(lowerTag) || (lowerTag === 'input' && ['submit', 'button', 'checkbox', 'radio', 'search', 'text', 'date', 'number', 'email', 'password', 'tel', 'url'].includes((attributes.type || '').toLowerCase()));
  const isInteractiveByRole = !!role && INTERACTIVE_ROLES.has(role.toLowerCase());
  const hasName = !!(attributes.name || ariaLabel || attributes.placeholder || text);

  if (!isInteractiveByTag && !isInteractiveByRole && !hasName) return null;
  if (attributes['data-testid']) return null;

  const label = cleanText(text || ariaLabel || attributes.placeholder || attributes.name || attributes.id || lowerTag);
  const suggestedTestId = buildSuggestedTestId({ moduleName, text: label, tagName: lowerTag, role, name: attributes.name || '' });
  return {
    pageUrl,
    moduleName,
    tagName: String(tagName).toUpperCase(),
    role: role || '',
    text: label,
    ariaLabel,
    name: attributes.name || '',
    id: attributes.id || '',
    classes: Array.isArray(attributes.class) ? attributes.class : (attributes.class ? [attributes.class] : []),
    path: `html > ${lowerTag}`,
    status: 'missing-testid',
    suggestedTestId,
    currentLocator: `tag=${lowerTag}`,
    roleScore: role ? 'role' : 'tag',
    risk: riskForElement(lowerTag, role),
    confidence: 'medium'
  };
}

function findMissingTestIdsInDom(html, { moduleName = 'generic', pageUrl = 'about:blank' } = {}) {
  const results = [];
  const fragment = html || '';
  const pattern = /<([a-zA-Z0-9-]+)([^>]*)>/g;
  let match;

  while ((match = pattern.exec(fragment)) !== null) {
    const tagName = match[1];
    const attrs = parseAttributes(match[2]);
    const text = cleanText(fragment.slice(match.index + match[0].length, fragment.indexOf('</' + tagName + '>', match.index + match[0].length) > -1 ? fragment.indexOf('</' + tagName + '>', match.index + match[0].length) : match.index + match[0].length));

    const finding = findMeaningfulElementInHtmlTag({
      tagName,
      attributes: { ...attrs, class: attrs.class || '' },
      moduleName,
      pageUrl,
      text
    });

    if (finding) results.push(finding);
  }

  return dedupeResults(results);
}

async function collectRuntimeFindings({ page, moduleName = 'generic', pageUrl = page.url(), scopeSelector = '' }) {
  if (!page) {
    return [];
  }

  const findings = await page.evaluate(({ moduleNameValue, scopeSelectorValue }) => {
    const dedupe = (items) => {
      const seen = new Set();
      const results = [];
      for (const item of items) {
        const key = [
          item.moduleName,
          item.pageUrl,
          item.tagName,
          item.role,
          item.text,
          item.ariaLabel,
          item.id,
          item.name,
          item.path,
          item.currentLocator,
        ].filter(Boolean).join('|');

        if (seen.has(key)) continue;
        seen.add(key);
        results.push(item);
      }
      return results;
    };

    const cleanText = (value = '') => String(value).replace(/\s+/g, ' ').replace(/\u00a0/g, ' ').trim();
    const normalizeIdFragment = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/-+/g, '-').trim();
    const buildSuggestedTestId = ({ moduleName, text = '', tagName = 'element', role = '', name = '' } = {}) => {
      const moduleSegment = normalizeIdFragment(moduleName);
      const labelSegment = normalizeIdFragment(text || name || '');
      const controlSegment = normalizeIdFragment(role || tagName || 'element');
      const parts = [moduleSegment, labelSegment, controlSegment].filter(Boolean);
      const uniqueParts = [];
      for (const part of parts) {
        if (!uniqueParts.includes(part)) uniqueParts.push(part);
      }
      const normalized = uniqueParts.join('-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
      return normalized || 'generic-element';
    };
    const riskForElement = (tagName, role = '') => {
      const key = (role || tagName || '').toLowerCase();
      if (['button', 'input', 'textarea', 'select', 'checkbox', 'radio', 'combobox', 'switch', 'spinbutton'].includes(key)) return 'HIGH';
      if (['tab', 'menuitem', 'option', 'link'].includes(key)) return 'MEDIUM';
      return 'LOW';
    };
    const getElementPath = (el) => {
      const segments = [];
      let current = el;
      while (current && current.nodeType === 1 && current !== document.body) {
        let selector = current.tagName.toLowerCase();
        const parent = current.parentElement;
        if (parent) {
          const sameTagSiblings = Array.from(parent.children).filter((sibling) => sibling.tagName === current.tagName);
          if (sameTagSiblings.length > 1) {
            selector += `:nth-of-type(${sameTagSiblings.indexOf(current) + 1})`;
          }
        }
        segments.unshift(selector);
        current = parent;
      }
      return ['body', ...segments].join(' > ');
    };

    const openTagOf = (node) => {
      if (!node) return '';
      const clone = node.cloneNode(false);
      const html = clone.outerHTML || '';
      const close = html.lastIndexOf('</');
      return (close > -1 ? html.slice(0, close) : html).slice(0, 400);
    };
    const closeTagOf = (node) => (node ? '</' + node.tagName.toLowerCase() + '>' : '');

    const results = [];
    const selectors = [
      'button', 'a', 'input', 'textarea', 'select', 'summary', 'option',
      '[role="button"]', '[role="tab"]', '[role="option"]', '[role="menuitem"]',
      '[role="combobox"]', '[role="checkbox"]', '[role="radio"]', '[role="switch"]',
      '[role="link"]', '[role="spinbutton"]', '[role="textbox"]', '[role="searchbox"]'
    ];

    const root = scopeSelectorValue ? document.querySelector(scopeSelectorValue) : document;
    const elements = root ? Array.from(root.querySelectorAll(selectors.join(','))) : [];
    for (const el of elements) {
      if (!(el instanceof Element)) continue;
      if (el.closest('svg, path, g, defs')) continue;
      if (el.hasAttribute('data-testid')) continue;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
      if (el.getAttribute('hidden') !== null || el.getAttribute('aria-hidden') === 'true') continue;
      if (el.closest('[aria-hidden="true"], [hidden]')) continue;

      // An <option> has no box of its own, so judge it by its select.
      const host = el.tagName === 'OPTION' ? (el.closest('select') || el) : el;
      const box = host.getBoundingClientRect();
      if (box.width <= 1 || box.height <= 1) continue;

      const role = (el.getAttribute('role') || '').trim().toLowerCase();
      const tagName = el.tagName.toLowerCase();
      if (['div', 'span', 'section', 'main', 'article', 'header', 'footer', 'nav', 'ul', 'ol', 'li', 'p', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'label', 'fieldset', 'legend'].includes(tagName) && !role && !el.getAttribute('aria-label')) continue;

      const interactiveByTag = ['button', 'a', 'input', 'textarea', 'select', 'option', 'summary', 'details', 'checkbox', 'radio'].includes(tagName) || (tagName === 'input' && ['button', 'checkbox', 'radio', 'search', 'text', 'date', 'number', 'email', 'password', 'tel', 'url', 'submit', 'reset'].includes((el.getAttribute('type') || '').toLowerCase()));
      const interactiveByRole = !!role && ['button', 'tab', 'tablist', 'option', 'combobox', 'menuitem', 'menu', 'checkbox', 'radio', 'switch', 'link', 'textbox', 'searchbox', 'spinbutton'].includes(role);
      const text = cleanText(el.innerText || el.textContent || '');
      const ariaLabel = cleanText(el.getAttribute('aria-label') || '');
      const placeholder = cleanText(el.getAttribute('placeholder') || '');
      const name = cleanText(el.getAttribute('name') || '');
      if (!interactiveByTag && !interactiveByRole && !text && !ariaLabel && !placeholder && !name) continue;

      const suggested = buildSuggestedTestId({
        moduleName: moduleNameValue,
        text: text || ariaLabel || placeholder || name || el.getAttribute('id') || tagName,
        tagName,
        role,
        name
      });

      const locator = getElementPath(el);
      results.push({
        moduleName: moduleNameValue,
        pageUrl: window.location.href,
        tagName: el.tagName.toUpperCase(),
        role,
        text,
        ariaLabel,
        name,
        id: el.getAttribute('id') || '',
        classes: Array.from(el.classList).slice(0, 5),
        path: locator,
        status: 'missing-testid',
        currentLocator: locator,
        suggestedTestId: suggested,
        risk: riskForElement(tagName, role),
        confidence: 'medium',
        domContext: {
          grandparentOpenTag: openTagOf(el.parentElement && el.parentElement.parentElement),
          parentOpenTag: openTagOf(el.parentElement),
          outerHTML: (el.outerHTML || '').slice(0, 1200),
          parentCloseTag: closeTagOf(el.parentElement),
          grandparentCloseTag: closeTagOf(el.parentElement && el.parentElement.parentElement)
        }
      });
    }

    return dedupe(results);
  }, { moduleNameValue: moduleName, scopeSelectorValue: scopeSelector });

  return dedupeResults(findings);
}

function analyzeStaticSourceFiles(moduleConfig, moduleName) {
  const patterns = Array.isArray(moduleConfig?.include) ? moduleConfig.include : [];
  const files = [];
  for (const pattern of patterns) {
    const dir = pattern.includes('*') ? pattern.split('*')[0] : pattern;
    const directory = path.join(ROOT, dir.replace(/\/+/g, '/').replace(/\*\*.*$/, ''));
    if (!fs.existsSync(directory)) continue;
    const queue = [directory];
    while (queue.length) {
      const current = queue.pop();
      if (!fs.existsSync(current)) continue;
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          queue.push(fullPath);
        } else if (entry.isFile() && (fullPath.endsWith('.ts') || fullPath.endsWith('.js'))) {
          files.push(fullPath);
        }
      }
    }
  }

  const seen = new Set();
  const matches = [];
  for (const file of files) {
    if (seen.has(file)) continue;
    seen.add(file);
    const content = fs.readFileSync(file, 'utf8');
    const objectEntries = [...content.matchAll(/^\s*([A-Za-z0-9_]+)\s*:\s*(['"`])((?:\\.|(?!\2)[\s\S])*?)\2\s*,?\s*$/gm)];

    for (const entry of objectEntries) {
      const key = entry[1];
      let selector = (entry[3] || '').trim();
      if (!selector) continue;
      if (selector.includes('data-testid') || selector.includes('data-slot') || selector.includes('data-sonner')) continue;
      if (selector.startsWith('/') || selector.startsWith('http') || selector.includes('=>')) continue;
      if (selector.length < 3 || (!selector.includes('[') && !selector.includes('button') && !selector.includes('input') && !selector.includes('select') && !selector.includes('role')) ) {
        continue;
      }

      matches.push({
        moduleName,
        file: path.relative(ROOT, file),
        line: content.substring(0, entry.index).split(/\r?\n/).length,
        snippet: `${key}: ${selector}`,
        locator: `${key}: ${selector}`
      });
    }
  }

  return matches;
}

/**
 * Removes every artefact left by a previous run of this same module/submodule
 * (JSON, XLSX, CSV and the indexed PNGs) so the folder only ever holds the
 * latest record for the ticket.
 */
/**
 * Throws before anything is deleted if a file we must overwrite is locked by
 * another process - typically the .xlsx still open in Excel. Without this the
 * purge runs, the write fails, and the previous report is gone for nothing.
 */
function assertWritable(targets) {
  for (const target of targets) {
    if (!fs.existsSync(target)) continue;
    try {
      fs.closeSync(fs.openSync(target, 'r+'));
    } catch (error) {
      throw new Error(
        'Cannot overwrite ' + path.basename(target) + ' - it is open in another program '
        + '(usually Excel). Close it and run again. Nothing was deleted.'
      );
    }
  }
}

function purgePreviousRecords(outputDir, fileBase, screenshotDirName) {
  if (!fileBase) return [];
  if (!fs.existsSync(outputDir)) return [];
  const removed = [];
  for (const entry of fs.readdirSync(outputDir)) {
    if (entry === fileBase || entry.startsWith(fileBase + '.') || entry.startsWith(fileBase + '-')) {
      const full = path.join(outputDir, entry);
      try { fs.rmSync(full, { force: true }); removed.push(entry); } catch (error) { /* keep going */ }
    }
  }
  if (screenshotDirName) {
    const dir = path.join(outputDir, screenshotDirName);
    if (fs.existsSync(dir)) {
      try { fs.rmSync(dir, { recursive: true, force: true }); removed.push(screenshotDirName + '/'); } catch (error) { /* keep going */ }
    }
  }
  return removed;
}

function ensureOutputDir(outputDir) {
  fs.mkdirSync(outputDir, { recursive: true });
}

function normalizeModuleFileName(moduleName) {
  return String(moduleName || 'module')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'module';
}

function inferPriority(item) {
  const locator = String(item?.currentLocator || item?.path || '').toLowerCase();
  if (locator.includes('nth-child') || locator.includes(':nth-child')) return 'CRITICAL';
  if (item?.risk === 'HIGH' || /has-text|text-is|text\(|role=|\[role=/.test(locator)) return 'HIGH';
  if (item?.risk === 'MEDIUM' || /placeholder|aria-label|name=|input\[/.test(locator)) return 'MEDIUM';
  return 'LOW';
}

function inferStrategy(item) {
  const locator = String(item?.currentLocator || item?.path || '').toLowerCase();
  if (locator.includes('nth-child') || locator.includes(':nth-child')) return 'Positional / nth-child';
  if (locator.includes('has-text') || locator.includes('text-is') || locator.includes('text(')) return 'Text match';
  if (locator.includes('role=') || locator.includes('[role=')) return 'ARIA role';
  if (locator.includes('placeholder') || locator.includes('aria-label') || locator.includes('name=')) return 'Placeholder / form name';
  if (locator.includes('input') || locator.includes('button')) return 'CSS selector';
  return 'Fallback selector';
}

function buildDomSnippet(item) {
  const tag = String(item?.tagName || 'element').toLowerCase();
  const role = item?.role ? ` role="${item.role}"` : '';
  const id = item?.id ? ` id="${item.id}"` : '';
  const classes = Array.isArray(item?.classes) && item.classes.length ? ` class="${item.classes.slice(0, 3).join(' ')}"` : '';
  const label = item?.text || item?.ariaLabel || item?.name || item?.id || 'element';
  return `<${tag}${role}${id}${classes}>${label}</${tag}>`;
}

function humanReadableElementName(item = {}) {
  const tag = String(item.tagName || '').toLowerCase();
  const text = item.text || item.ariaLabel || item.name || item.id || '';

  if (text) {
    const label = String(text).trim();
    if (tag === 'button' || item.role === 'button') return `${label} button`;
    if (tag === 'input' || item.role === 'textbox' || item.role === 'combobox') return `${label} input`;
    if (item.role === 'checkbox' || item.role === 'radio') return `${label} checkbox`;
    return label;
  }

  if (item.role) return `${String(item.role).replace(/-/g, ' ')} control`;
  if (tag) return `${tag} element`;
  return 'element';
}

function humanizeSubmodule(value) {
  const raw = String(value || '').trim().replace(/^nm-?\d+[-_ ]*/i, '');
  if (!raw) return '';
  return raw
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => (/^(usa|uk|us|emea|apac)$/i.test(word) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ');
}

function createWorkbook(findings, moduleName, outputDir, submoduleName = '') {
  const workbook = XLSX.utils.book_new();
  const moduleLabel = String(moduleName || 'Module').trim() || 'Module';
  const scopeLabel = submoduleName ? String(submoduleName).trim() : moduleLabel;
  const fileBase = normalizeModuleFileName(submoduleName ? `${moduleName}-${submoduleName}` : moduleName);

  const header = [
    'Module',
    'Submodule',
    'Element',
    'Current selector',
    'Steps to locate the element',
    'DOM snippet',
    'Screenshot'
  ];

  const rows = findings.map((item) => {
    const submodule = humanizeSubmodule(submoduleName) || moduleLabel;
    const element = humanReadableElementName(item);
    const currentSelector = item.currentLocator || item.path || '';
    const steps = [
      `1. Open ${submodule}.`,
      `2. Locate the ${element}.`,
      `3. Press F12, open Elements, press Ctrl+F and paste the selector from the "Current selector" column.`
    ].join('\n');
    const domSnippet = buildDomSnippet(item);
    const screenshotValue = item.screenshot || 'screenshot:not-available';

    return [moduleLabel, submodule, element, currentSelector, steps, domSnippet, screenshotValue];
  });

  const sheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
  sheet['!cols'] = [
    { wch: 20 },
    { wch: 26 },
    { wch: 30 },
    { wch: 52 },
    { wch: 84 },
    { wch: 48 },
    { wch: 26 }
  ];

  XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1');
  const outputFile = path.join(outputDir, `${fileBase}.xlsx`);
  XLSX.writeFile(workbook, outputFile);
  return outputFile;
}

const VALID_MODES = ['runtime', 'source', 'combined'];

const USAGE = [
  '',
  'Audits a page for interactive elements that have no data-testid and writes',
  'a JSON + Excel report plus one DevTools-style DOM screenshot per finding.',
  '',
  'Usage:',
  '  node scripts/generic-testid-audit.js --steps <file>',
  '  node scripts/generic-testid-audit.js --module <name> --target <name>',
  '  node scripts/generic-testid-audit.js --module <name> --page <url> --scope <selector>',
  '',
  'Options:',
  '  --module <name>            Module key from config/testid-audit.config.js.',
  '  --steps <file>             Plain-language steps to reach the screen. Use this',
  '                             for anything behind a click - a modal, dialog or',
  '                             wizard step that has no URL of its own.',
  '  --target <name>            Named target under that module. Supplies page,',
  '                             scope, ready selector and submodule in one flag.',
  '  --submodule <name>         Label for the Submodule column and file names.',
  '  --page <url|path>          Page to audit. Overrides the target.',
  '  --scope <selector>         Only audit inside this container (e.g. "main").',
  '                             Without it the whole page is scanned, including',
  '                             global navigation and sidebar chrome.',
  '  --wait-for-selector <sel>  Wait for this to be visible before scanning.',
  '                             Use the control that proves the form has rendered.',
  '  --office <ids>             Offices to audit, comma separated, or "all".',
  '                             A route containing {office} runs every canonical',
  '                             office by default - one report per country.',
  '  --mode <mode>              runtime (default) | source | combined.',
  '                             runtime  - scan the live page only.',
  '                             source   - scan POM/spec files only, no browser.',
  '                             combined - both, merged into one report.',
  '  --output <dir>             Output directory. Defaults to the config value.',
  '  --html <file>              Audit a local HTML file instead of a live page.',
  '  --config <file>            Alternate config file.',
  '  --help, -h                 Show this message.',
  '',
  'Note: each run deletes the previous report for the same module+submodule,',
  'so the output folder only ever holds the latest record for that ticket.',
  ''
].join(String.fromCharCode(10));

function parseArgs(argv) {
  const args = { module: undefined, page: undefined, output: undefined, html: undefined, config: DEFAULT_CONFIG_PATH, mode: 'runtime', submodule: undefined, waitFor: undefined, scope: undefined, target: undefined, steps: undefined, office: undefined, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === '--module') args.module = argv[index + 1];
    if (current === '--page') args.page = argv[index + 1];
    if (current === '--output') args.output = argv[index + 1];
    if (current === '--html') args.html = argv[index + 1];
    if (current === '--config') args.config = argv[index + 1];
    if (current === '--mode') args.mode = argv[index + 1];
    if (current === '--submodule') args.submodule = argv[index + 1];
    if (current === '--wait-for-selector') args.waitFor = argv[index + 1];
    if (current === '--scope') args.scope = argv[index + 1];
    if (current === '--target') args.target = argv[index + 1];
    if (current === '--steps') args.steps = argv[index + 1];
    if (current === '--office') args.office = argv[index + 1];
    if (current === '--help' || current === '-h') args.help = true;
  }
  return args;
}

const OFFICE_TOKEN = '{office}';

/** Fills {office} into a route so one steps file can serve every country. */
function substituteOffice(value, office) {
  if (!office || value == null) return value;
  return String(value).split(OFFICE_TOKEN).join(office);
}

function officeLabel(config, office) {
  return (config.offices || {})[office] || 'office ' + office;
}

/**
 * Decides which offices to run. An explicit --office wins; otherwise a route
 * containing {office} runs every canonical office, because auditing one country
 * and labelling it as the module is how a partial audit reads as a complete one.
 */
function planOffices(args, config, stepsPlan, target) {
  const canonical = Object.keys(config.offices || {});
  if (args.office) {
    const raw = String(args.office).trim().toLowerCase();
    if (raw === 'all') return canonical;
    return raw.split(',').map((item) => item.trim()).filter(Boolean);
  }
  const route = JSON.stringify([args.page, target && target.page, stepsPlan && stepsPlan.steps]);
  return route.includes(OFFICE_TOKEN) ? canonical : [''];
}

async function runAudit() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(USAGE);
    return { helpShown: true, findings: [] };
  }

  const wasToldWhereToLook = Boolean(args.steps || args.page || args.target || args.html || args.module);
  if (!wasToldWhereToLook) {
    console.log('Nothing to audit: tell me which screen to look at.');
    console.log(USAGE);
    return { helpShown: true, findings: [] };
  }

  const mode = String(args.mode || 'runtime').toLowerCase();
  if (!VALID_MODES.includes(mode)) {
    throw new Error('Unknown --mode "' + args.mode + '". Valid modes: ' + VALID_MODES.join(', '));
  }
  const configPath = path.resolve(ROOT, args.config || DEFAULT_CONFIG_PATH);
  const config = require(configPath);
  const stepsPlan = args.steps ? parseStepsFile(path.resolve(ROOT, args.steps)) : null;
  if (stepsPlan) {
    console.log('Loaded ' + stepsPlan.steps.length + ' step(s) from ' + args.steps);
  }

  const planModule = args.module || (stepsPlan && stepsPlan.module) || config.defaultModule || 'generic';
  const planModuleConfig = config.modules?.[planModule] || config;
  const planTarget = args.target ? (planModuleConfig.targets || {})[args.target] : null;
  const offices = planOffices(args, config, stepsPlan, planTarget);

  if (offices.length > 1) {
    console.log('Auditing ' + offices.length + ' offices: ' + offices.map((office) => officeLabel(config, office) + ' (' + office + ')').join(', '));
  }

  const runs = [];
  for (const office of offices) {
    if (office) {
      console.log('');
      console.log('=== ' + officeLabel(config, office) + ' - office ' + office + ' ===');
    }
    runs.push(await runAuditForOffice(args, config, mode, stepsPlan, office));
  }
  return runs.length === 1 ? runs[0] : { runs, offices };
}

async function runAuditForOffice(args, config, mode, stepsPlan, office) {
  const moduleName = args.module || (stepsPlan && stepsPlan.module) || config.defaultModule || 'generic';
  const moduleConfig = config.modules?.[moduleName] || config;

  const targetName = args.target || '';
  const target = targetName ? (moduleConfig.targets || {})[targetName] : null;
  if (targetName && !target) {
    const known = Object.keys(moduleConfig.targets || {});
    throw new Error('Unknown --target "' + targetName + '" for module "' + moduleName + '". Known targets: ' + (known.join(', ') || '(none)'));
  }

  const baseSubmodule = args.submodule || (stepsPlan && stepsPlan.submodule) || (target && target.submodule) || targetName || '';
  const submoduleName = office
    ? [baseSubmodule, normalizeModuleFileName(officeLabel(config, office)), office].filter(Boolean).join('-')
    : baseSubmodule;
  const outputDir = path.resolve(ROOT, args.output || (stepsPlan && stepsPlan.output) || (target && target.output) || config.outputDir || 'reports/testid-audit');

  ensureOutputDir(outputDir);

  const reportBase = normalizeModuleFileName(submoduleName ? moduleName + '-' + submoduleName : moduleName);
  const screenshotDirName = normalizeModuleFileName(submoduleName || moduleName);
  const screenshotDir = path.join(outputDir, screenshotDirName);
  assertWritable([
    path.join(outputDir, reportBase + '.json'),
    path.join(outputDir, reportBase + '.xlsx')
  ]);
  const purged = purgePreviousRecords(outputDir, reportBase, screenshotDirName);
  if (purged.length) {
    console.log('Removed ' + purged.length + ' file(s) from the previous run of this ticket.');
  }

  let findings = [];
  if (args.html) {
    const html = fs.readFileSync(path.resolve(ROOT, args.html), 'utf8');
    findings = findMissingTestIdsInDom(html, { moduleName, pageUrl: args.page || 'file://' + path.resolve(ROOT, args.html) });
  } else {
    const pageConfig = substituteOffice(args.page || (target && target.page) || moduleConfig.pages?.[0] || moduleConfig.page, office);
    const baseUrl = moduleConfig.baseUrl || config.baseUrl || process.env.BASE_URL || '';
    if (mode !== 'source' && (stepsPlan || pageConfig || baseUrl)) {
      const browser = await chromium.launch({ headless: true });
      const storageStatePath = path.join(ROOT, '.auth', 'encore-state.json');
      const contextOptions = fs.existsSync(storageStatePath) ? { storageState: storageStatePath } : {};
      const context = await browser.newContext(contextOptions);
      const page = await context.newPage();
      const startingUrl = (baseUrl && pageConfig ? new URL(pageConfig.replace(/^\//, ''), baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).toString() : pageConfig || baseUrl || 'about:blank');
      try {
        let scopeSelector = args.scope || (target && target.scopeSelector) || moduleConfig.scopeSelector || '';

        if (stepsPlan) {
          console.log('Walking the steps:');
          const officeSteps = stepsPlan.steps.map((step) => (
            step.target ? Object.assign({}, step, { target: substituteOffice(step.target, office) }) : step
          ));
          const stepScope = await executeSteps(page, officeSteps, { baseUrl });
          if (!args.scope && stepScope) scopeSelector = stepScope;
        } else {
          if (startingUrl && startingUrl !== 'about:blank') {
            await page.goto(startingUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
          }
          const readySelector = args.waitFor || (target && target.readySelector) || moduleConfig.readySelector;
          if (readySelector) {
            await page.locator(readySelector).first().waitFor({ state: 'visible', timeout: 30000 });
          }
        }

        // This app streams content in after domcontentloaded. Without a settle
        // the scan reads a half-rendered page and under-reports - one screen
        // showed 2 gaps where 9 existed. A readySelector is still the reliable
        // signal; this is the floor for targets that have not named one.
        await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(1500);

        if (scopeSelector) {
          await page.locator(scopeSelector).first().waitFor({ state: 'attached', timeout: 30000 });
        }
        const runtimeFindings = await collectRuntimeFindings({ page, moduleName, pageUrl: page.url() || startingUrl || 'about:blank', scopeSelector });
        findings = runtimeFindings;
        const renderPage = await context.newPage();
        await renderPage.setViewportSize({ width: 660, height: 420 });
        ensureOutputDir(screenshotDir);
        for (let index = 0; index < findings.length; index += 1) {
          const item = findings[index];
          const label = String(item.text || item.ariaLabel || item.name || item.id || item.role || item.tagName || 'element')
            .toLowerCase().replace(/[^a-z0-9]+/g, '-');
          const fileBase = String(index + 1).padStart(2, '0') + '-' + (normalizeModuleFileName(label) || 'element');
          const written = await captureDomScreenshot(renderPage, item, screenshotDir, fileBase);
          item.screenshot = written === 'screenshot:not-available'
            ? written
            : path.relative(outputDir, written).split(String.fromCharCode(92)).join('/');
        }
        await renderPage.close();
      } finally {
        await context.close();
        await browser.close();
      }
    }

    if (mode === 'source' || mode === 'combined') {
      const staticMatches = analyzeStaticSourceFiles(moduleConfig, moduleName);
      const sourceFindings = staticMatches.map((match) => ({
        moduleName,
        pageUrl: args.page || moduleName,
        tagName: 'SOURCE',
        role: 'source-scan',
        text: match.snippet,
        ariaLabel: '',
        name: '',
        id: '',
        classes: [],
        path: match.file + ':' + match.line,
        status: 'source-only',
        currentLocator: match.locator,
        suggestedTestId: buildSuggestedTestId({ moduleName, text: match.snippet, tagName: 'source', role: 'source' }),
        risk: 'MEDIUM',
        confidence: 'low',
        screenshot: 'screenshot:not-available'
      }));
      findings = findings.concat(sourceFindings);
      console.log('Source scan added ' + sourceFindings.length + ' finding(s) from POM/spec files.');
    }

    // A runtime scan that returns nothing means the page never rendered - auth
    // expired, a bad URL, or a scope selector that matched nothing. Writing a
    // report here would look successful while describing an empty page.
    if (mode === 'runtime' && !findings.length) {
      throw new Error(
        'The runtime scan found no elements. The page probably did not render. Check that '
        + '.auth/encore-state.json is current, that --page is reachable, and that '
        + '--scope matches a container on the page. Run with --mode source to scan files instead.'
      );
    }
  }

  const uniqueFindings = dedupeResults(findings);
  const moduleFileName = normalizeModuleFileName(submoduleName ? `${moduleName}-${submoduleName}` : moduleName);
  const jsonPath = path.join(outputDir, `${moduleFileName}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify({ moduleName, submoduleName, generatedAt: new Date().toISOString(), findings: uniqueFindings }, null, 2));

  const xlsxPath = createWorkbook(uniqueFindings, moduleName, outputDir, submoduleName);
  const summary = {
    moduleName,
    submoduleName,
    totalFindings: uniqueFindings.length,
    outputJson: jsonPath,
    outputXlsx: xlsxPath,
    sample: uniqueFindings.slice(0, 3)
  };

  console.log(`Audit complete for module: ${moduleName}`);
  console.log(`Missing data-testid findings: ${uniqueFindings.length}`);
  console.log(`JSON report: ${jsonPath}`);
  console.log(`Excel report: ${xlsxPath}`);
  console.log(JSON.stringify(summary, null, 2));

  return { moduleName, findings: uniqueFindings, jsonPath, xlsxPath };
}

if (require.main === module) {
  runAudit().catch((error) => {
    console.error('Failed to run testid audit:', error);
    process.exitCode = 1;
  });
}

module.exports = {
  cleanText,
  buildSuggestedTestId,
  findMissingTestIdsInDom,
  collectRuntimeFindings,
  analyzeStaticSourceFiles,
  createWorkbook,
  dedupeResults,
  purgePreviousRecords,
  assertWritable,
  substituteOffice,
  planOffices,
  runAudit
};
