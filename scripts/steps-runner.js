/**
 * Drives the app through a plain-language step list so the audit can reach
 * places that have no URL of their own — modals, dialogs, expanded panels,
 * a wizard's third screen.
 *
 * A steps file looks like this:
 *
 *   Module: Item Search
 *   Submodule: Add Product Group
 *
 *   1. Go to /navigator/locations/1101/products/product-groups
 *   2. Click "Add"
 *   3. Wait for "Enter Product Group Name"
 *   4. Audit inside "main"
 *
 * A file may hold several labelled audits, one per state of the screen, so a
 * ticket whose controls only appear after clicks is surveyed in one walk:
 *
 *   5. Audit inside "main" as "Product Groups - Add form"
 *   6. Click "Service Type"
 *   7. Audit inside "[role=listbox]" as "Service Type dropdown open"
 *   8. Press "Escape"
 *
 * Hover "<label>" points at a control without clicking it - for a tooltip or a
 * submenu that opens on hover.
 *
 * Wait up to <N> seconds for "<label>" waits longer than the usual 30 seconds.
 *
 * Upload "<file>" via "<label>" clicks a control that opens the file picker
 * (an Import button) and chooses the file. The path is relative to the steps
 * file.
 *
 * "Elements: all" beside Module asks for every element, not only controls:
 * text, containers, images, and elements in the DOM that are not shown.
 *
 * Blank lines and lines starting with # are ignored. Step numbers are optional.
 */

const fs = require('fs');
const path = require('path');

/** Strips one matching pair of straight or curly quotes. */
function unquote(value) {
  const text = String(value || '').trim();
  const pairs = [['"', '"'], ["'", "'"], ['“', '”'], ['‘', '’']];
  for (const [open, close] of pairs) {
    if (text.length > 1 && text.startsWith(open) && text.endsWith(close)) {
      return text.slice(1, -1).trim();
    }
  }
  return text;
}

const STEP_PATTERNS = [
  { re: /^go\s+to\s+(.+)$/i, build: (m) => ({ verb: 'goto', target: unquote(m[1]) }) },
  { re: /^open\s+(.+)$/i, build: (m) => ({ verb: 'goto', target: unquote(m[1]) }) },
  { re: /^type\s+(.+?)\s+into\s+(.+)$/i, build: (m) => ({ verb: 'type', value: unquote(m[1]), target: unquote(m[2]) }) },
  { re: /^select\s+(.+?)\s+from\s+(.+)$/i, build: (m) => ({ verb: 'select', value: unquote(m[1]), target: unquote(m[2]) }) },
  { re: /^wait\s+up\s+to\s+(\d+)\s*s(?:ec(?:ond)?s?)?\s+for\s+(.+)$/i, build: (m) => ({ verb: 'wait', target: unquote(m[2]), waitMs: Number(m[1]) * 1000 }) },
  { re: /^wait\s+for\s+(.+)$/i, build: (m) => ({ verb: 'wait', target: unquote(m[1]) }) },
  { re: /^click\s+(?:on\s+)?(.+)$/i, build: (m) => ({ verb: 'click', target: unquote(m[1]) }) },
  { re: /^press\s+(.+)$/i, build: (m) => ({ verb: 'press', target: unquote(m[1]) }) },
  { re: /^hover\s+(?:over\s+)?(.+)$/i, build: (m) => ({ verb: 'hover', target: unquote(m[1]) }) },
  { re: /^upload\s+(.+?)\s+(?:via|with|through)\s+(.+)$/i, build: (m) => ({ verb: 'upload', value: unquote(m[1]), target: unquote(m[2]) }) },
  { re: /^audit\s+(?:inside|in|within)\s+(.+?)\s+as\s+(["'“‘].+)$/i, build: (m) => ({ verb: 'audit', scope: unquote(m[1]), label: unquote(m[2]) }) },
  { re: /^audit\s+(?:inside|in|within)\s+(.+)$/i, build: (m) => ({ verb: 'audit', scope: unquote(m[1]) }) },
  { re: /^audit\s+here\s+as\s+(.+)$/i, build: (m) => ({ verb: 'audit', scope: '', label: unquote(m[1]) }) },
  { re: /^audit\s+here$/i, build: () => ({ verb: 'audit', scope: '' }) },
  { re: /^audit$/i, build: () => ({ verb: 'audit', scope: '' }) }
];

function parseStep(text) {
  for (const { re, build } of STEP_PATTERNS) {
    const match = re.exec(text);
    if (match) return build(match);
  }
  return null;
}

/**
 * Turns the text of a steps file into { module, submodule, output, steps }.
 * Throws on a line it cannot understand rather than skipping it silently — a
 * skipped navigation step would produce a confident report about the wrong page.
 */
function parseSteps(text) {
  const meta = { module: '', submodule: '', output: '', elements: '' };
  const steps = [];

  const lines = String(text || '').split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;

    const metaMatch = /^(module|submodule|output|elements)\s*:\s*(.+)$/i.exec(line);
    if (metaMatch) {
      meta[metaMatch[1].toLowerCase()] = metaMatch[2].trim();
      continue;
    }

    const body = line.replace(/^\d+\s*[.)]\s*/, '').replace(/[.;]\s*$/, '');
    const step = parseStep(body);
    if (!step) {
      throw new Error(
        'Line ' + (index + 1) + ' of the steps file is not a step I understand: "' + line + '".'
        + ' Supported: Go to <url>, Click "<label>", Type "<value>" into "<label>",'
        + ' Select "<option>" from "<label>", Wait for "<label>", Press "<key>", Hover "<label>", Upload "<file>" via "<label>", Audit here,'
        + ' Audit inside "<selector>" [as "<state>"].'
      );
    }
    steps.push(step);
  }

  if (!steps.some((step) => step.verb === 'audit')) {
    steps.push({ verb: 'audit', scope: '' });
  }
  return Object.assign(meta, { steps });
}

function parseStepsFile(filePath) {
  const plan = parseSteps(fs.readFileSync(filePath, 'utf8'));
  // An uploaded file is named relative to the steps file, wherever the run starts from.
  for (const step of plan.steps) {
    if (step.verb === 'upload') step.value = path.resolve(path.dirname(filePath), step.value);
  }
  return plan;
}

/**
 * Looks a control up the way a tester would: by role, then label, then text.
 * A label that is plainly a selector - starting with . # [ or a container tag,
 * or carrying an engine prefix such as css= or text= - is used as one, for
 * controls with no name of their own like a split button's caret.
 */
function resolveLocator(page, label) {
  const looksLikeSelector = /^[.#\[]/.test(label)
    || /^(main|form|section|dialog|table)\b/i.test(label)
    || /^(css|xpath|text|role)=/i.test(label);
  if (looksLikeSelector) return page.locator(label).first();

  return page
    .getByRole('button', { name: label, exact: false })
    .or(page.getByPlaceholder(label, { exact: false }))
    .or(page.getByLabel(label, { exact: false }))
    .or(page.getByRole('link', { name: label, exact: false }))
    .or(page.getByText(label, { exact: false }))
    .first();
}

/**
 * Walks the steps against a live page. Returns the scope selector named by the
 * last audit step, which the caller uses to bound the scan. Given onAudit, each
 * audit step instead calls it in place - (scope, label) - so one walk can
 * survey several states of the screen.
 */
async function executeSteps(page, steps, options = {}) {
  const { baseUrl = '', timeout = 30000, log = console.log, onAudit = null } = options;
  let scope = '';

  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    const label = 'Step ' + (index + 1) + ': ' + step.verb + (step.target ? ' "' + step.target + '"' : '')
      + (step.label ? ' as "' + step.label + '"' : '');

    try {
      if (step.verb === 'goto') {
        // Standard URL semantics do the right thing here, so the leading slash
        // is left alone: "/navigator/locations/1" resolves from the origin,
        // while "locations/1" resolves under baseUrl. Stripping it would turn
        // baseUrl ".../navigator/" plus "/navigator/x" into ".../navigator/navigator/x".
        const url = /^https?:/i.test(step.target)
          ? step.target
          : new URL(step.target, baseUrl.endsWith('/') ? baseUrl : baseUrl + '/').toString();
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
      } else if (step.verb === 'click') {
        await resolveLocator(page, step.target).click({ timeout });
      } else if (step.verb === 'type') {
        const field = resolveLocator(page, step.target);
        await field.click({ timeout });
        await field.fill('');
        await field.pressSequentially(step.value, { delay: 20 });
      } else if (step.verb === 'select') {
        await resolveLocator(page, step.target).click({ timeout });
        await page.getByRole('option', { name: step.value, exact: false }).first().click({ timeout });
      } else if (step.verb === 'wait') {
        // "Wait up to N seconds for" covers what takes longer than a click - an AI reply.
        await resolveLocator(page, step.target).waitFor({ state: 'visible', timeout: step.waitMs || timeout });
      } else if (step.verb === 'upload') {
        const chooser = page.waitForEvent('filechooser', { timeout });
        await resolveLocator(page, step.target).click({ timeout });
        await (await chooser).setFiles(step.value);
      } else if (step.verb === 'hover') {
        await resolveLocator(page, step.target).hover({ timeout });
        // Tooltips and submenus open after a short delay.
        await page.waitForTimeout(1000);
      } else if (step.verb === 'press') {
        await page.keyboard.press(step.target);
        // Let a closing dialog or popover finish animating out before the next click.
        await page.waitForTimeout(800);
      } else if (step.verb === 'audit') {
        scope = step.scope || '';
        if (scope) {
          await page.locator(scope).first().waitFor({ state: 'attached', timeout });
        }
        if (onAudit) await onAudit(scope, step.label || '');
      }
      log('  ' + label + ' - ok');
    } catch (error) {
      throw new Error(label + ' failed: ' + error.message);
    }
  }

  return scope;
}

module.exports = { parseSteps, parseStepsFile, parseStep, executeSteps, resolveLocator, unquote };
