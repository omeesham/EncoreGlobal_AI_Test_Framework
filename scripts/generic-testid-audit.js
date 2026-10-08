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
  'button', 'tab', 'tablist', 'option', 'combobox', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'menu', 'checkbox', 'radio', 'switch', 'link', 'textbox', 'searchbox', 'spinbutton'
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
  if (['tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'link'].includes(key)) return 'MEDIUM';
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

/**
 * everything: report every element, not only controls - text, containers such
 * as dialogs and menus, images, and elements that are in the DOM but not shown
 * (a hidden file input). A steps file asks for it with "Elements: all".
 */
async function collectRuntimeFindings({ page, moduleName = 'generic', pageUrl = page.url(), scopeSelector = '', everything = false }) {
  if (!page) {
    return [];
  }

  const findings = await page.evaluate(({ moduleNameValue, scopeSelectorValue, everythingValue }) => {
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
      if (['tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'link'].includes(key)) return 'MEDIUM';
      return 'LOW';
    };
    // Stopping at `unindexedUpTo` drops the sibling indexes below it, so every
    // copy of a repeated item - a dropdown option, a calendar day - yields one path.
    const getElementPath = (el, unindexedUpTo = null) => {
      const segments = [];
      let current = el;
      let indexed = !unindexedUpTo;
      while (current && current.nodeType === 1 && current !== document.body) {
        if (current === unindexedUpTo) indexed = true;
        let selector = current.tagName.toLowerCase();
        const parent = current.parentElement;
        if (parent && indexed) {
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

    // A form field is named by the label the user reads beside it, not by its
    // value or placeholder: "Country", not "United States"; "GAV Discount
    // Threshold", not "0%". That is its <label for>, its aria-labelledby, or a
    // <label> just before it in its group. A heading above the group is added,
    // so the same row label in two sections ("0-15" under Non-Peak and under
    // Peak) stays two different fields.
    const fieldLabelOf = (el) => {
      const tidy = (value) => cleanText(value || '').replace(/:$/, '');
      if (el.labels && el.labels.length) return tidy(el.labels[0].innerText);
      const labelledBy = (el.getAttribute('aria-labelledby') || '').split(/\s+/)
        .map((id) => id && document.getElementById(id)).filter(Boolean).map((node) => node.innerText).join(' ');
      if (tidy(labelledBy)) return tidy(labelledBy);
      let branch = el;
      for (let depth = 0; depth < 6 && branch.parentElement; depth += 1, branch = branch.parentElement) {
        for (let sibling = branch.previousElementSibling; sibling; sibling = sibling.previousElementSibling) {
          if (sibling.tagName === 'LABEL' || sibling.getAttribute('data-slot') === 'label') {
            const own = tidy(sibling.innerText);
            if (!own) return '';
            let heading = '';
            for (let above = branch.parentElement && branch.parentElement.previousElementSibling; above && !heading; above = above.previousElementSibling) {
              if (/^H[1-6]$/.test(above.tagName)) heading = tidy(above.innerText);
            }
            return heading ? heading + ' > ' + own : own;
          }
          // Another control in between means the label belongs to that one.
          if (sibling.matches('input, button, select, textarea') || sibling.querySelector('input, button, select, textarea')) return '';
        }
      }
      return '';
    };

    // The tab whose panel holds a control. Two tabs can lay out the same
    // toolbar, so their Save buttons differ only by the panel they are in.
    const panelOf = (el) => {
      const panel = el.closest('[role="tabpanel"]');
      const tab = panel && document.getElementById(panel.getAttribute('aria-labelledby') || '');
      return tab ? cleanText(tab.innerText) : '';
    };

    // The header of the data-table column a control sits in ("Non-Peak",
    // "Active"). Each column's control is its own template - three checkboxes
    // in a row are three testids, not one. A date picker's day grid
    // (role="grid") is not a data table: its days stay one template.
    // A table header laid out as a grid, spans resolved: grid[row][column] is
    // the header cell covering that slot.
    const headGrid = (thead) => {
      const grid = [];
      Array.from(thead.rows).forEach((row, r) => {
        grid[r] = grid[r] || [];
        let c = 0;
        for (const cell of row.cells) {
          while (grid[r][c]) c += 1;
          for (let dr = 0; dr < (cell.rowSpan || 1); dr += 1) {
            grid[r + dr] = grid[r + dr] || [];
            for (let dc = 0; dc < (cell.colSpan || 1); dc += 1) grid[r + dr][c + dc] = cell;
          }
          c += cell.colSpan || 1;
        }
      });
      return grid;
    };
    const headText = (cell) => cleanText(cell ? cell.innerText : '').replace(/:$/, '');
    // A column under a group header ("0-15" under "Peak Booking Windows Days")
    // is named with its group, so the three "0-15" columns read apart.
    const columnName = (grid, c) => {
      const leaf = grid[grid.length - 1] && grid[grid.length - 1][c];
      const group = grid.length > 1 && grid[0][c] !== leaf ? headText(grid[0][c]) : '';
      return group && headText(leaf) ? group + ' > ' + headText(leaf) : headText(leaf);
    };
    const dataTableOf = (el) => {
      const table = el.closest('table');
      return table && table.getAttribute('role') !== 'grid' && table.tHead && table.tHead.rows.length ? table : null;
    };

    const columnOf = (el) => {
      // A control in a header cell - a column's resize handle - belongs to that header.
      const head = el.closest('th');
      if (head && dataTableOf(head) && head.closest('thead')) return headText(head);
      const cell = el.closest('td');
      const table = cell && dataTableOf(cell);
      if (!table) return '';
      let position = 0;
      for (const sibling of cell.parentElement.cells) {
        if (sibling === cell) break;
        position += sibling.colSpan || 1;
      }
      return columnName(headGrid(table.tHead), position);
    };

    // The section a piece of text sits under: a header cell's group header,
    // or the heading just above a label's group - so the 21 "0-15"-style
    // labels and headers of the tier matrix each say which section they are in.
    const sectionOf = (el) => {
      if (el.tagName === 'TH' && dataTableOf(el) && el.closest('thead')) {
        const grid = headGrid(el.closest('thead'));
        const r = grid.findIndex((row) => row && row.includes(el));
        const c = r > 0 ? grid[r].indexOf(el) : -1;
        return c > -1 && grid[r - 1][c] !== el ? headText(grid[r - 1][c]) : '';
      }
      if (el.tagName === 'LABEL' || el.getAttribute('data-slot') === 'label') {
        const group = el.parentElement;
        for (let above = group && group.previousElementSibling; above; above = above.previousElementSibling) {
          if (/^H[1-6]$/.test(above.tagName)) return cleanText(above.innerText);
        }
      }
      return '';
    };

    const results = [];
    const selectors = [
      'button', 'a', 'input', 'textarea', 'select', 'summary', 'option',
      '[role="button"]', '[role="tab"]', '[role="option"]', '[role="menuitem"]', '[role="menuitemcheckbox"]', '[role="menuitemradio"]',
      '[role="combobox"]', '[role="checkbox"]', '[role="radio"]', '[role="switch"]',
      '[role="link"]', '[role="spinbutton"]', '[role="textbox"]', '[role="searchbox"]'
    ];

    const root = scopeSelectorValue ? document.querySelector(scopeSelectorValue) : document;
    const elements = root ? Array.from(root.querySelectorAll(selectors.join(','))) : [];
    // A result row that selects on click is a control even though it carries no
    // role - on Products it is the only way to reach the row toolbar.
    if (root) {
      for (const row of root.querySelectorAll('tbody > tr')) {
        if (window.getComputedStyle(row).cursor === 'pointer') elements.push(row);
      }
    }
    // Beyond the controls, "everything" adds what a test reads or scopes to:
    // each element holding text of its own (a heading, a label, a table cell, a
    // message) unless it is a control's own label, each container a test waits
    // on (dialog, menu, tab panel, table, tooltip, alert), and images and icons.
    const kinds = new Map();
    if (everythingValue && root) {
      const base = root === document ? document.body : root;
      const CONTROL = selectors.join(',');
      // The audited container itself - the dialog, the menu, the panel - is
      // what a test waits on, so it is an element too.
      if (root !== document && !root.matches(CONTROL)) {
        kinds.set(root, /^(img|svg)$/i.test(root.tagName) ? 'image' : 'container');
        elements.push(root);
      }
      const walker = document.createTreeWalker(base, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const owner = node.parentElement;
        if (!owner || kinds.has(owner) || !cleanText(node.textContent)) continue;
        if (owner.closest('script, style, noscript, template, svg') || owner.closest(CONTROL)) continue;
        if (owner.id === '__testid_audit_ring__') continue;
        kinds.set(owner, 'text');
        elements.push(owner);
      }
      const STRUCTURAL = ['none', 'presentation', 'separator', 'row', 'rowgroup', 'cell', 'gridcell', 'columnheader', 'rowheader', 'generic'];
      // A focusable element is something the user can reach - a toast message is
      // a focusable list item with no role. The UI library's invisible focus
      // guards are aria-hidden and left out.
      for (const el of base.querySelectorAll('[role], table, form, nav, aside, header, footer, img, svg, [tabindex]:not([aria-hidden="true"])')) {
        if (kinds.has(el) || el.matches(CONTROL) || el.closest(CONTROL)) continue;
        if (el.tagName.toLowerCase() === 'svg' ? el.parentElement.closest('svg') : el.closest('svg')) continue;
        if (STRUCTURAL.includes((el.getAttribute('role') || '').toLowerCase())) continue;
        kinds.set(el, /^(img|svg)$/i.test(el.tagName) || el.getAttribute('role') === 'img' ? 'image' : 'container');
        elements.push(el);
      }
    }

    // The path of an element inside its table cell, with positions kept: a
    // location's number and name sit in one cell and are two elements.
    const pathInCell = (el) => {
      const cell = el.closest('td, th');
      if (!cell || el === cell) return '';
      const segments = [];
      for (let current = el; current && current !== cell; current = current.parentElement) {
        const same = Array.from(current.parentElement.children).filter((sibling) => sibling.tagName === current.tagName);
        segments.unshift(current.tagName.toLowerCase() + (same.length > 1 ? `:nth-of-type(${same.indexOf(current) + 1})` : ''));
      }
      return segments.join(' > ');
    };

    const REPEAT_CONTAINER = '[role="listbox"], [role="grid"], tbody';
    for (const el of elements) {
      if (!(el instanceof Element)) continue;
      const kind = kinds.get(el) || 'control';
      if (kind === 'control' && el.closest('svg, path, g, defs')) continue;
      if (el.hasAttribute('data-testid')) continue;
      const style = window.getComputedStyle(el);
      // An <option> has no box of its own, so judge it by its select.
      const host = el.tagName === 'OPTION' ? (el.closest('select') || el) : el;
      const box = host.getBoundingClientRect();
      const notShown = style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0'
        || el.getAttribute('hidden') !== null || !!el.closest('[hidden]') || box.width <= 1 || box.height <= 1;
      // An open dialog or menu marks the rest of the page aria-hidden, so in
      // "everything" mode only what is really not drawn counts as hidden.
      if (!everythingValue && (notShown || el.getAttribute('aria-hidden') === 'true' || el.closest('[aria-hidden="true"]'))) continue;
      const hidden = everythingValue && notShown;

      const role = (el.getAttribute('role') || '').trim().toLowerCase();
      const tagName = el.tagName.toLowerCase();
      const clickableRow = tagName === 'tr' && kind === 'control';
      if (kind === 'control' && !clickableRow && ['div', 'span', 'section', 'main', 'article', 'header', 'footer', 'nav', 'ul', 'ol', 'li', 'p', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'label', 'fieldset', 'legend'].includes(tagName) && !role && !el.getAttribute('aria-label')) continue;

      const interactiveByTag = ['button', 'a', 'input', 'textarea', 'select', 'option', 'summary', 'details', 'checkbox', 'radio'].includes(tagName) || (tagName === 'input' && ['button', 'checkbox', 'radio', 'search', 'text', 'date', 'number', 'email', 'password', 'tel', 'url', 'submit', 'reset'].includes((el.getAttribute('type') || '').toLowerCase()));
      const interactiveByRole = !!role && ['button', 'tab', 'tablist', 'option', 'combobox', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'menu', 'checkbox', 'radio', 'switch', 'link', 'textbox', 'searchbox', 'spinbutton'].includes(role);
      const ownText = () => cleanText(Array.from(el.childNodes).filter((node) => node.nodeType === 3).map((node) => node.textContent).join(' '));
      const accessibleName = () => cleanText(el.getAttribute('aria-label')
        || (el.getAttribute('aria-labelledby') || '').split(/\s+/).map((id) => id && document.getElementById(id)).filter(Boolean).map((node) => node.textContent).join(' ')
        || el.getAttribute('alt') || el.getAttribute('title') || '');
      let text;
      if (kind === 'text') text = ownText();
      else if (kind !== 'control') text = accessibleName();
      else text = clickableRow
        ? cleanText(el.innerText || '').slice(0, 80)
        : cleanText(el.innerText || el.textContent || '');
      // An icon button's tooltip title is its accessible name when it has no aria-label.
      const ariaLabel = cleanText(el.getAttribute('aria-label') || el.getAttribute('title') || '');
      const placeholder = cleanText(el.getAttribute('placeholder') || '');
      const name = cleanText(el.getAttribute('name') || '');
      const isField = ['input', 'textarea', 'select'].includes(tagName)
        || ['combobox', 'textbox', 'searchbox', 'spinbutton', 'checkbox', 'radio', 'switch'].includes(role);
      const column = columnOf(el);
      // A field in a table row is named by its column when nothing labels it.
      const label = isField ? (fieldLabelOf(el) || column) : '';
      if (kind === 'control' && !clickableRow && !interactiveByTag && !interactiveByRole && !text && !ariaLabel && !placeholder && !name) continue;

      // A control with no name of its own - a split button's caret, a bare
      // checkbox - is named by the nearest text around it, so the app team can
      // find it and so the same control matches across offices. A container with
      // no name is known by what it holds.
      let nearText = '';
      if (kind === 'container' && !text) {
        nearText = cleanText(el.innerText || '').slice(0, 40);
      } else if (!text && !ariaLabel && !label && !placeholder && !name) {
        let around = el.parentElement;
        for (let depth = 0; around && depth < 3 && !nearText; depth += 1, around = around.parentElement) {
          // A search box's clear button sits beside an input, which has no text
          // of its own - its placeholder is what the user reads there.
          const besideInput = around.querySelector('input[placeholder]');
          nearText = cleanText(around.innerText || (besideInput && besideInput.getAttribute('placeholder')) || '').slice(0, 40);
        }
      }

      // A list or table is not a copy of itself - only what repeats inside it is.
      const repeatContainer = el.tagName === 'OPTION' ? el.closest('select')
        : kind === 'control' ? el.closest(REPEAT_CONTAINER)
          : el.parentElement && el.parentElement.closest(REPEAT_CONTAINER);
      // The title keeps two icon buttons in one cell apart - a row's Edit and Delete.
      const templateKey = repeatContainer
        ? [tagName, role, getElementPath(el, repeatContainer), el.getAttribute('title') || '', column, kind === 'control' ? '' : pathInCell(el), kind].join('|')
        : '';

      const suggested = buildSuggestedTestId({
        moduleName: moduleNameValue,
        text: label || text || ariaLabel || placeholder || name || el.getAttribute('id') || tagName,
        tagName,
        role,
        name
      });

      const locator = getElementPath(el);
      results.push({
        moduleName: moduleNameValue,
        pageUrl: window.location.href,
        tagName: el.tagName.toUpperCase(),
        role: clickableRow ? 'row' : role,
        text,
        ariaLabel,
        label,
        column,
        panel: panelOf(el),
        placeholder,
        nearText,
        name,
        id: el.getAttribute('id') || '',
        classes: Array.from(el.classList).slice(0, 5),
        templateKey,
        kind,
        hidden,
        section: kind === 'text' ? sectionOf(el) : '',
        path: locator,
        status: 'missing-testid',
        currentLocator: locator,
        suggestedTestId: suggested,
        risk: kind === 'control' ? riskForElement(tagName, role) : 'LOW',
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

    // Copies of one repeated item are one finding: the app team fixes them with a
    // single testid on the template, and 15,000 Location options as separate rows
    // would bury the real gaps. The count and a few sample labels are kept.
    const collapsed = [];
    const groups = new Map();
    for (const item of results) {
      if (!item.templateKey) { collapsed.push(item); continue; }
      const group = groups.get(item.templateKey);
      if (!group) {
        item.instances = 1;
        item.instanceSamples = [item.text || item.ariaLabel].filter(Boolean);
        groups.set(item.templateKey, item);
        collapsed.push(item);
        continue;
      }
      group.instances += 1;
      const sample = item.text || item.ariaLabel;
      if (sample && group.instanceSamples.length < 3) group.instanceSamples.push(sample);
    }

    return dedupe(collapsed);
  }, { moduleNameValue: moduleName, scopeSelectorValue: scopeSelector, everythingValue: everything });

  return dedupeResults(findings);
}

/**
 * Waits for the page to stop changing before a scan. This app streams content
 * in after domcontentloaded and shows skeleton placeholders while a grid or
 * dialog loads; without the wait one screen showed 2 gaps where 9 existed. A
 * readySelector is still the reliable signal - this is the floor.
 */
async function settlePage(page) {
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForFunction(() => !document.querySelector('[data-slot="skeleton"]'), null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1500);
}

/**
 * Photographs each finding as the user sees it: a crop of the live page around
 * the element, with the element outlined. It has to happen while the state is
 * still open - a dropdown option or a dialog field is gone a step later - so the
 * PNGs go to a scratch folder and are moved beside the DOM screenshots once the
 * run has succeeded.
 */
async function captureUiScreenshots(page, items, scratchDir) {
  fs.mkdirSync(scratchDir, { recursive: true });
  const viewport = page.viewportSize() || { width: 1600, height: 1000 };
  const pad = 72;
  for (const item of items) {
    try {
      const el = page.locator(item.path).first();
      if (!(await el.count())) continue;
      await el.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
      const box = await el.boundingBox();
      if (!box || box.width < 1 || box.height < 1) continue;
      const x = Math.max(0, Math.floor(box.x - pad));
      const y = Math.max(0, Math.floor(box.y - pad));
      const clip = {
        x,
        y,
        width: Math.max(1, Math.min(viewport.width - x, Math.ceil(box.width + pad * 2))),
        height: Math.max(1, Math.min(viewport.height - y, Math.ceil(box.height + pad * 2), 420)),
      };
      // The highlight is an overlay on top of the page rather than a style on the
      // element: a parent with overflow:hidden clips an element's own outline.
      await page.evaluate(({ left, top, width, height }) => {
        const ring = document.createElement('div');
        ring.id = '__testid_audit_ring__';
        Object.assign(ring.style, {
          position: 'fixed', left: (left - 4) + 'px', top: (top - 4) + 'px',
          width: (width + 8) + 'px', height: (height + 8) + 'px',
          border: '3px solid #e5257d', borderRadius: '6px', boxSizing: 'border-box',
          pointerEvents: 'none', zIndex: '2147483647',
        });
        document.body.appendChild(ring);
      }, { left: box.x, top: box.y, width: box.width, height: box.height });
      const file = path.join(scratchDir, 'ui-' + (captureUiScreenshots.counter = (captureUiScreenshots.counter || 0) + 1) + '.png');
      await page.screenshot({ path: file, clip });
      await page.evaluate(() => document.getElementById('__testid_audit_ring__')?.remove());
      item.uiScratch = file;
    } catch (error) {
      // A missing UI shot never fails the audit; the DOM screenshot still stands.
    }
  }
}

/**
 * Folds findings from several states of one screen into one list. A control
 * that stays on screen across states - a toolbar button, a dialog's Close - is
 * reported once, under the first state it appeared in, with the rest listed.
 */
/**
 * What makes one element the same element in two states of a screen.
 * Popovers reuse one portal, so two different dropdowns share a path; the
 * first sample label is what tells the Location list from the Region list. On
 * the page itself a template is one element whatever rows it shows. A field
 * keeps its label while its value changes (Country showing United States, then
 * Bahamas), and text on the page keeps its place while its words change (a
 * result count going from 1 to 0).
 */
function stateKey(item) {
  const inPage = / > main\b/.test(item.path || '');
  if (item.templateKey) return item.templateKey + (inPage ? '' : '|' + ((item.instanceSamples || [])[0] || ''));
  const content = item.kind && item.kind !== 'control';
  const text = item.label || (content && inPage) ? '' : item.text;
  // An icon has no words of its own and moves when a neighbour appears (a
  // search box's clear button); it is the icon beside the same thing.
  if (item.kind === 'image' && inPage) return ['image', item.tagName, item.nearText, item.column, item.path.replace(/:nth-of-type\(\d+\)/g, '')].join('|');
  // Every dropdown list opens in the same portal; an unnamed one is known by what it holds.
  const holds = item.kind === 'container' && !inPage ? item.nearText : '';
  return [item.tagName, item.role, text, item.ariaLabel, item.label, holds, item.path].join('|');
}

function mergeStates(findings) {
  const byElement = new Map();
  const merged = [];
  for (const item of findings) {
    const first = byElement.get(stateKey(item));
    if (!first) {
      item.alsoIn = [];
      byElement.set(stateKey(item), item);
      merged.push(item);
    } else if (item.state !== first.state && !first.alsoIn.includes(item.state)) {
      first.alsoIn.push(item.state);
    }
  }
  return merged;
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

/**
 * The element's id, unless the framework generated it. Radix ids such as
 * "radix-_r_k5_" change on every page load, so they name nothing a reader can
 * find again.
 */
function stableId(item) {
  const id = String(item?.id || '');
  return /^radix-|^:r[0-9a-z]+:$|^_r_/i.test(id) ? '' : id;
}

function buildDomSnippet(item) {
  const tag = String(item?.tagName || 'element').toLowerCase();
  const role = item?.role ? ` role="${item.role}"` : '';
  const id = item?.id ? ` id="${item.id}"` : '';
  const classes = Array.isArray(item?.classes) && item.classes.length ? ` class="${item.classes.slice(0, 3).join(' ')}"` : '';
  const label = item?.text || item?.ariaLabel || item?.name || stableId(item) || item?.nearText || 'element';
  return `<${tag}${role}${id}${classes}>${label}</${tag}>`;
}

function humanReadableElementName(item = {}) {
  const tag = String(item.tagName || '').toLowerCase();
  const text = item.label || item.text || item.ariaLabel || item.placeholder || item.name || stableId(item) || '';

  // A control in a table row that has its own name ("Yes", "Delete") also says
  // which column it is in; a field already named by its column does not.
  const inColumn = item.column && item.column !== item.label && item.column !== item.text ? ` in the "${item.column}" column` : '';
  const hidden = item.hidden ? ' (hidden in the DOM)' : '';
  if (item.kind === 'text') {
    // Text inside a header cell is that column's header, whatever wraps it.
    const inHeader = tag === 'th' || (/ > thead > tr > th(:nth-of-type\(\d+\))? > /.test(item.path || '') && item.column === item.text);
    const kindName = /^h[1-6]$/.test(tag) ? 'heading'
      : tag === 'label' ? 'label'
        : inHeader ? 'column header'
          : item.role === 'alert' ? 'message'
            : 'text';
    const under = item.section ? ` under "${item.section}"` : '';
    return `"${String(item.text).slice(0, 60)}" ${kindName}${under}${inColumn}${hidden}`;
  }
  if (item.kind === 'image') {
    const what = tag === 'svg' ? 'icon' : 'image';
    return (item.text ? `${item.text} ${what}` : item.nearText ? `${what} beside "${item.nearText}"` : `${what}`) + inColumn + hidden;
  }
  if (item.kind === 'container') {
    const what = String(item.role || tag).replace(/-/g, ' ');
    return (item.text ? `${item.text} ${what}` : item.nearText ? `${what} containing "${item.nearText}"` : what) + hidden;
  }
  return controlName(item, tag, text, inColumn) + hidden;
}

function controlName(item, tag, text, inColumn) {
  // A row's text is its whole record; the samples carry that instead.
  if (tag === 'tr') return 'Clickable result row';
  const inputType = String((item.domContext && /<input[^>]*\btype="([^"]+)"/.exec(item.domContext.outerHTML || '') || [])[1] || '');
  if (text) {
    const label = String(text).trim();
    if (item.role === 'checkbox' || item.role === 'radio' || item.role === 'switch') return `${label} ${item.role}${inColumn}`;
    if (item.role === 'tab') return `${label} tab`;
    // A menu entry often wraps a link: both are elements, and they read apart.
    const roleWord = { option: 'option', menuitem: 'menu item', menuitemradio: 'menu option', menuitemcheckbox: 'menu option', link: 'link' }[item.role];
    if (roleWord) return `${label} ${roleWord}${inColumn}`;
    if (tag === 'a') return `${label} link${inColumn}`;
    if (tag === 'select') return `${label} dropdown${inColumn}`;
    if (tag === 'option') return `${label} option${inColumn}`;
    if (tag === 'textarea') return `${label} text box${inColumn}`;
    if (tag === 'button' && item.role === 'combobox') return `${label} dropdown${inColumn}`;
    if (tag === 'button' || item.role === 'button') return `${label} button${inColumn}`;
    if (tag === 'input' || item.role === 'textbox' || item.role === 'combobox') return `${label} input${inColumn}`;
    return label + inColumn;
  }
  if (tag === 'input' && inputType) {
    const kindOfInput = inputType === 'file' ? 'file upload input' : inputType + ' input';
    return item.nearText ? `${kindOfInput} beside "${item.nearText}"` : kindOfInput;
  }

  const kind = item.role ? String(item.role).replace(/-/g, ' ') : (tag || 'element');
  if (item.nearText) return `Unlabeled ${kind} beside "${item.nearText}"`;
  if (item.role) return `${kind} control`;
  if (tag) return `${tag} element`;
  return 'element';
}

function humanizeSubmodule(value) {
  const raw = String(value || '').trim().replace(/^nm-?\d+[-_ ]*/i, '');
  if (!raw) return '';
  return raw
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => (/^(usa|uk|us|emea|apac|nm)$/i.test(word) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ');
}

/** The element's name plus, for a repeated item, how many copies it stands for. */
function describeElement(item) {
  const samples = item.instanceSamples || [];
  const repeated = item.instances > 1
    ? ` (one template, ${item.instances} instances${samples.length ? ', e.g. ' + samples.map((sample) => `"${String(sample).slice(0, 40)}"`).join(', ') : ''})`
    : '';
  return humanReadableElementName(item) + repeated;
}

/**
 * The "Steps to locate the element" text. `where` is what to open: a screen name,
 * or the full URL in a report that is handed over.
 */
function buildLocateSteps(item, where) {
  const open = item.state ? `${where} - in the state "${item.state}"` : where;
  return [
    `1. Open ${open}.`,
    `2. Locate the ${describeElement(item)}.`,
    `3. Press F12, open Elements, press Ctrl+F and paste the selector from the "Current selector" column.`
  ].concat(item.alsoIn && item.alsoIn.length ? [`Also present in: ${item.alsoIn.join('; ')}.`] : []).join('\n');
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
    'Screenshot',
    'UI screenshot'
  ];

  const rows = findings.map((item) => {
    const submodule = humanizeSubmodule(submoduleName) || moduleLabel;
    return [
      moduleLabel,
      submodule,
      describeElement(item),
      item.currentLocator || item.path || '',
      buildLocateSteps(item, submodule),
      buildDomSnippet(item),
      item.screenshot || 'screenshot:not-available',
      item.uiScreenshot || 'screenshot:not-available'
    ];
  });

  const sheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
  sheet['!cols'] = [
    { wch: 20 },
    { wch: 26 },
    { wch: 30 },
    { wch: 52 },
    { wch: 84 },
    { wch: 48 },
    { wch: 26 },
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
  'Note: each successful run replaces the previous report for the same',
  'module+submodule, so the output folder only ever holds the latest record',
  'for that ticket. A run that fails partway leaves the previous report as it was.',
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
    ? [baseSubmodule, (config.offices || {})[office] && normalizeModuleFileName(config.offices[office]), office].filter(Boolean).join('-')
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
  // The previous report is removed only once this run has something to replace
  // it with. Purging up front meant a run that died mid-walk - a dropped
  // network, an expired login - left the ticket with no report at all.
  let previousCleared = false;
  const clearPreviousRun = () => {
    if (previousCleared) return;
    previousCleared = true;
    const purged = purgePreviousRecords(outputDir, reportBase, screenshotDirName);
    if (purged.length) {
      console.log('Removed ' + purged.length + ' file(s) from the previous run of this ticket.');
    }
  };

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
      // Screens hide controls at narrow widths - Products drops View Availability
      // below desktop width - so the audit renders at the size the app is used at.
      contextOptions.viewport = moduleConfig.viewport || config.viewport || { width: 1600, height: 1000 };
      const context = await browser.newContext(contextOptions);
      const uiScratchDir = path.join(require('os').tmpdir(), 'testid-audit-ui-' + process.pid + '-' + Date.now());
      const page = await context.newPage();
      const startingUrl = (baseUrl && pageConfig ? new URL(pageConfig.replace(/^\//, ''), baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).toString() : pageConfig || baseUrl || 'about:blank');
      try {
        let scopeSelector = args.scope || (target && target.scopeSelector) || moduleConfig.scopeSelector || '';
        // A steps file with several audits surveys each state where it stands;
        // otherwise the single scan below runs once the walk is done.
        const checkpoints = stepsPlan ? stepsPlan.steps.filter((step) => step.verb === 'audit') : [];
        const auditAtEachStep = checkpoints.length > 1 || checkpoints.some((step) => step.label);
        const checkpointFindings = [];

        if (stepsPlan) {
          console.log('Walking the steps:');
          const officeSteps = stepsPlan.steps.map((step) => (
            step.target ? Object.assign({}, step, { target: substituteOffice(step.target, office) }) : step
          ));
          const onAudit = auditAtEachStep
            ? async (stepScope, label) => {
              await settlePage(page);
              const found = await collectRuntimeFindings({ page, moduleName, pageUrl: page.url(), scopeSelector: stepScope, everything: !!(stepsPlan && /^all$/i.test(String(stepsPlan.elements || '').trim())) });
              if (!found.length) {
                // Every state in a file is there because it holds controls; an
                // empty one means the click before it did not land.
                throw new Error('The audit "' + (label || stepScope) + '" found no elements - the state probably did not open.');
              }
              for (const item of found) item.state = label || stepScope || 'page';
              await captureUiScreenshots(page, found, uiScratchDir);
              console.log('    ' + found.length + ' finding(s) in "' + (label || stepScope || 'page') + '"');
              checkpointFindings.push(...found);
            }
            : null;
          const stepScope = await executeSteps(page, officeSteps, { baseUrl, onAudit });
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

        if (auditAtEachStep) {
          findings = mergeStates(checkpointFindings);
        } else {
          await settlePage(page);
          if (scopeSelector) {
            await page.locator(scopeSelector).first().waitFor({ state: 'attached', timeout: 30000 });
          }
          findings = await collectRuntimeFindings({ page, moduleName, pageUrl: page.url() || startingUrl || 'about:blank', scopeSelector, everything: !!(stepsPlan && /^all$/i.test(String(stepsPlan.elements || '').trim())) });
          await captureUiScreenshots(page, findings, uiScratchDir);
        }
        // Screenshots go into the folder the previous run used, so it is cleared
        // here - after a successful scan, before anything new is written. An
        // empty scan leaves it alone and fails below.
        if (findings.length) clearPreviousRun();
        const renderPage = await context.newPage();
        await renderPage.setViewportSize({ width: 660, height: 420 });
        ensureOutputDir(screenshotDir);
        for (let index = 0; index < findings.length; index += 1) {
          const item = findings[index];
          const label = String(item.label || item.text || item.ariaLabel || item.name || stableId(item) || item.nearText || item.role || item.tagName || 'element')
            .toLowerCase().replace(/[^a-z0-9]+/g, '-');
          // A paragraph's text would make a file name past Windows' 260-character path limit.
          const fileBase = String(index + 1).padStart(2, '0') + '-' + ((normalizeModuleFileName(label) || 'element').slice(0, 60).replace(/-+$/, '') || 'element');
          const written = await captureDomScreenshot(renderPage, item, screenshotDir, fileBase);
          item.screenshot = written === 'screenshot:not-available'
            ? written
            : path.relative(outputDir, written).split(String.fromCharCode(92)).join('/');
          if (item.uiScratch && fs.existsSync(item.uiScratch)) {
            const uiFile = path.join(screenshotDir, fileBase + '-ui.png');
            fs.copyFileSync(item.uiScratch, uiFile);
            item.uiScreenshot = path.relative(outputDir, uiFile).split(String.fromCharCode(92)).join('/');
          }
          delete item.uiScratch;
        }
        await renderPage.close();
      } finally {
        await context.close();
        await browser.close();
        fs.rmSync(uiScratchDir, { recursive: true, force: true });
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

  clearPreviousRun();
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
  describeElement,
  buildLocateSteps,
  buildDomSnippet,
  normalizeModuleFileName,
  dedupeResults,
  purgePreviousRecords,
  assertWritable,
  substituteOffice,
  planOffices,
  runAudit
};
