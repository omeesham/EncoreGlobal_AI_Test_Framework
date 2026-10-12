/**
 * Finds the states a steps file does not audit yet: what appears, becomes
 * visible or becomes enabled after a hover, a click or some typing.
 *
 * A steps file audits the states someone thought of. This walks to each of its
 * audited states, tries every control there in turn - hovers it, clicks it,
 * types into it - and lists what each one brought onto the page: a tooltip, a
 * menu, a message, a button that turned on. Whatever it lists that the steps
 * file does not open is a state to add before the report is handed over.
 *
 * Run: node scripts/testid-explore.js --steps <file> --office <n> [--only "<state>"]... [--output <file.json>]
 *
 * It changes no data. A request that is not a GET is blocked and listed unless
 * the walk to the state sent the very same one, so a Save, an Import or a stored
 * preference never reaches the server. Links that
 * leave the page are not followed, and nothing is dragged.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const { parseStepsFile, executeSteps } = require('./steps-runner.js');
const { substituteOffice } = require('./generic-testid-audit.js');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_CONFIG_PATH = path.join(ROOT, 'config', 'testid-audit.config.js');
const USAGE = [
  '',
  'Lists what each control of an audited state brings onto the page, so states',
  'the steps file does not audit yet are found before the report is handed over.',
  '',
  'Usage:',
  '  node scripts/testid-explore.js --steps <file> --office <n> [--only "<state>"]... [--output <file.json>]',
  '',
  '--only limits the run to the named audited states (repeat it for several).',
  ''
].join('\n');

const INTERACTIVE = [
  'button', 'a[href]', 'input', 'select', 'textarea', 'summary',
  '[role=button]', '[role=tab]', '[role=checkbox]', '[role=switch]', '[role=combobox]', '[role=radio]',
  '[role=menuitem]', '[role=menuitemcheckbox]', '[role=menuitemradio]', '[role=option]', '[role=link]',
  '[aria-haspopup]', '[data-slot=tooltip-trigger]', '[title]', '[tabindex]:not([tabindex="-1"])'
].join(',');

function parseArgs(argv) {
  const args = { steps: undefined, office: undefined, only: [], output: undefined, config: DEFAULT_CONFIG_PATH, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === '--steps') args.steps = argv[index + 1];
    if (current === '--office') args.office = argv[index + 1];
    if (current === '--only') args.only.push(argv[index + 1]);
    if (current === '--output') args.output = argv[index + 1];
    if (current === '--config') args.config = argv[index + 1];
    if (current === '--help' || current === '-h') args.help = true;
  }
  return args;
}

/**
 * Every element on the page as a short description, counted. Two snapshots
 * differ by what appeared, what became visible and what became enabled - a
 * state change shows as a description whose count went up.
 */
async function snapshot(page) {
  return page.evaluate(() => {
    const counts = {};
    const describe = (el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      const shown = rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      const own = Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ')
        .replace(/\s+/g, ' ').trim().slice(0, 50);
      const label = el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('title') || '';
      const off = el.disabled || el.getAttribute('aria-disabled') === 'true' || el.getAttribute('data-disabled') !== null;
      return [el.tagName.toLowerCase(), el.getAttribute('role') || '', el.getAttribute('data-slot') || '', label, own,
        el.getAttribute('data-testid') ? 'testid' : 'no-testid', shown ? 'shown' : 'hidden', off ? 'disabled' : 'enabled'].join('|');
    };
    for (const el of document.body.querySelectorAll('*')) {
      if (/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|LINK|META)$/.test(el.tagName)) continue;
      if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue;
      const key = describe(el);
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  });
}

/** What the second snapshot holds more of than the first, shown elements first. */
function added(before, after) {
  const out = [];
  for (const [key, count] of Object.entries(after)) {
    const extra = count - (before[key] || 0);
    if (extra > 0) out.push({ key, extra });
  }
  return out.sort((a, b) => Number(b.key.includes('|shown|')) - Number(a.key.includes('|shown|')));
}

function readable(entry) {
  const [tag, role, slot, label, text, testid, shown, enabled] = entry.key.split('|');
  const name = text || label;
  return [tag + (role ? '[' + role + ']' : '') + (slot ? '{' + slot + '}' : ''), name ? '"' + name + '"' : '', testid, shown, enabled,
    entry.extra > 1 ? 'x' + entry.extra : ''].filter(Boolean).join(' ');
}

/** True when the page shows exactly what it showed at the state's start - a ticked box is a change. */
function sameState(base, now) {
  return !added(base, now).some((e) => e.key.includes('|shown|'))
    && !added(now, base).some((e) => e.key.includes('|shown|'));
}

/**
 * The controls of a state, one per kind: a row repeats its cells' controls, so
 * only the first row's are tried, and a control already tried in an earlier
 * state of the same walk is not tried again.
 */
async function candidates(page, scope) {
  return page.evaluate(({ scope, selector }) => {
    const roots = scope ? Array.from(document.querySelectorAll(scope)) : [document.body];
    const unindexed = (el) => {
      const parts = [];
      for (let node = el; node && node !== document.body; node = node.parentElement) {
        parts.unshift(node.tagName.toLowerCase() + (node.getAttribute('role') ? '[' + node.getAttribute('role') + ']' : ''));
      }
      return parts.join('>');
    };
    const pathOf = (el) => {
      const parts = [];
      for (let node = el; node && node !== document.body; node = node.parentElement) {
        const parent = node.parentElement;
        const same = parent ? Array.from(parent.children).filter((c) => c.tagName === node.tagName) : [];
        parts.unshift(node.tagName.toLowerCase() + (same.length > 1 ? ':nth-of-type(' + (same.indexOf(node) + 1) + ')' : ''));
      }
      return 'body > ' + parts.join(' > ');
    };
    const seen = new Set();
    const out = [];
    for (const root of roots) {
      for (const el of root.querySelectorAll(selector)) {
        const rect = el.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) continue;
        const name = (el.getAttribute('aria-label') || el.innerText || el.getAttribute('placeholder') || el.getAttribute('title') || '')
          .replace(/\s+/g, ' ').trim().slice(0, 60);
        const inRow = !!el.closest('tbody tr, [role=row], li, [role=option], [role=menuitem]');
        // A row's controls repeat in every row; their name is the row's data.
        const kind = unindexed(el) + '|' + (inRow ? '' : name) + '|' + (el.getAttribute('data-slot') || '');
        if (seen.has(kind)) continue;
        seen.add(kind);
        const type = (el.getAttribute('type') || '').toLowerCase();
        out.push({
          path: pathOf(el),
          name,
          tag: el.tagName.toLowerCase(),
          role: el.getAttribute('role') || '',
          typing: (el.tagName === 'INPUT' && !/^(checkbox|radio|file|hidden|button|submit)$/.test(type)) || el.tagName === 'TEXTAREA',
          number: type === 'number',
          leaves: el.tagName === 'A' && !!el.getAttribute('href') && !el.getAttribute('href').startsWith('#'),
          disabled: el.disabled || el.getAttribute('aria-disabled') === 'true',
        });
      }
    }
    return out;
  }, { scope, selector: INTERACTIVE });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.steps || !args.office) {
    console.log(USAGE);
    process.exit(args.help ? 0 : 1);
  }
  const config = require(path.resolve(args.config));
  const plan = parseStepsFile(path.resolve(args.steps));
  const steps = plan.steps.map((step) => (step.target ? Object.assign({}, step, { target: substituteOffice(step.target, args.office) }) : step));
  const checkpoints = steps.map((step, index) => ({ step, index }))
    .filter(({ step }) => step.verb === 'audit' && (!args.only.length || args.only.includes(step.label)));
  if (!checkpoints.length) throw new Error('No audited state matches --only ' + JSON.stringify(args.only) + '.');

  const browser = await chromium.launch({ headless: true });
  const storageState = path.join(ROOT, '.auth', 'encore-state.json');
  const report = { steps: args.steps, office: args.office, states: [] };
  const tried = new Set();

  try {
    for (const { step: checkpoint, index } of checkpoints) {
      const label = checkpoint.label || checkpoint.scope || 'page';
      console.log('\n=== ' + label);
      const context = await browser.newContext({
        storageState: fs.existsSync(storageState) ? storageState : undefined,
        viewport: config.viewport || { width: 1600, height: 1000 },
      });
      const page = await context.newPage();

      // Requests the walk itself sent are learnt here, and only an identical one -
      // same address, same body - is let through later: a read the walk made is
      // safe to repeat, while a Save or a stored preference is new and blocked.
      const known = new Set();
      const blocked = [];
      let learning = true;
      const requestKey = (request) => request.method() + ' ' + request.url() + ' ' + (request.headers()['next-action'] || '') + ' ' + (request.postData() || '');
      await page.route('**/*', (route) => {
        const request = route.request();
        if (/^(GET|HEAD|OPTIONS)$/.test(request.method())) return route.continue();
        const key = requestKey(request);
        if (learning) { known.add(key); return route.continue(); }
        if (known.has(key)) return route.continue();
        blocked.push(key);
        return route.abort();
      });

      const walkTo = async () => {
        learning = true;
        const upTo = steps.slice(0, index).filter((s) => s.verb !== 'audit');
        await executeSteps(page, upTo, { baseUrl: config.baseUrl, log: () => {} });
        await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(1500);
        learning = false;
        return snapshot(page);
      };

      let base;
      try {
        base = await walkTo();
      } catch (error) {
        console.log('  could not reach the state: ' + error.message.split('\n')[0]);
        report.states.push({ state: label, error: error.message.split('\n')[0] });
        await context.close();
        continue;
      }
      const list = await candidates(page, checkpoint.scope);
      const found = [];
      let dirty = false;

      for (const control of list) {
        const kindKey = control.tag + '|' + control.role + '|' + control.name + '|' + control.disabled;
        if (tried.has(kindKey)) continue;
        tried.add(kindKey);
        if (dirty) {
          base = await walkTo().catch(() => null);
          dirty = false;
          if (!base) break;
        }
        const el = page.locator(control.path).first();
        if (!(await el.count())) continue;

        const actions = ['hover'];
        if (control.typing) actions.push(control.number ? 'type -1' : 'type zzqqxx', control.number ? 'type 9999999' : 'type a');
        else if (!control.leaves && !control.disabled) actions.push('click');

        for (const action of actions) {
          try {
            if (action === 'hover') {
              await el.hover({ timeout: 3000 });
              await page.waitForTimeout(900);
            } else if (action === 'click') {
              await el.click({ timeout: 3000 });
              await page.waitForTimeout(1500);
            } else {
              await el.click({ timeout: 3000 });
              await el.fill('', { timeout: 3000 });
              await el.pressSequentially(action.slice(5), { delay: 20 });
              await page.waitForTimeout(1500);
            }
          } catch (error) {
            continue;
          }
          const after = await snapshot(page);
          const appeared = added(base, after).filter((e) => e.key.includes('|shown|'));
          if (appeared.length) {
            found.push({
              control: control.name || control.tag, path: control.path, action,
              appeared: appeared.length,
              withoutTestid: appeared.filter((e) => e.key.includes('|no-testid|')).reduce((n, e) => n + e.extra, 0),
              samples: appeared.slice(0, 10).map(readable),
            });
            console.log('  ' + action + ' "' + (control.name || control.tag).slice(0, 40) + '" -> ' + appeared.length + ' new: '
              + appeared.slice(0, 4).map(readable).join('; '));
          }
          // Back to the state's start: close what opened, empty what was typed.
          if (action.startsWith('type')) await el.fill('').catch(() => {});
          await page.mouse.move(1, 1);
          await page.keyboard.press('Escape').catch(() => {});
          await page.waitForTimeout(500);
          if (!sameState(base, await snapshot(page))) {
            await page.keyboard.press('Escape').catch(() => {});
            await page.waitForTimeout(500);
            if (!sameState(base, await snapshot(page))) { dirty = true; break; }
          }
        }
      }

      report.states.push({ state: label, scope: checkpoint.scope, controls: list.length, found, blocked: [...new Set(blocked)] });
      if (blocked.length) console.log('  blocked: ' + [...new Set(blocked)].join(' ; '));
      await context.close();
    }
  } finally {
    await browser.close();
  }

  const output = path.resolve(args.output || path.join(ROOT, 'reports', 'testid-explore', path.basename(args.steps, path.extname(args.steps)) + '-' + args.office + '.json'));
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2));
  console.log('\nExploration: ' + output);
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Failed to explore: ' + (error && error.stack ? error.stack : error));
    process.exit(1);
  });
}

module.exports = { snapshot, added, candidates };
