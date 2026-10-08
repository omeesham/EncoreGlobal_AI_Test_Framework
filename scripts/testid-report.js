/**
 * Builds the hand-over report for a module from the audits of its tickets: one
 * workbook, one row per element without a data-testid, each with its DOM and
 * on-screen (UI) screenshot embedded in the row, plus a page that shows them all.
 *
 * Each ticket's screens are audited separately (one steps file or more per
 * ticket). This puts the results together the way the application team reads
 * them: grouped by submodule, numbered from 1 within each, and with an element
 * that several tickets' screens show listed once, under the most specific ticket.
 *
 * Run: node scripts/testid-report.js --plan <plan.json>
 *
 * A plan names the reports to combine and how to label them:
 *
 *   {
 *     "title": "Missing data-testid - Item Search (NM-4084)",
 *     "module": "Item Search",
 *     "office": "1101",
 *     "officeLabel": "1101 - Corporate Office Encore USA SGA",
 *     "appUrl": "https://cloudapps-e2e.encoreglobal.com",
 *     "reportsDir": "reports/testid-audit-item-search",
 *     "output": "reports/testid-audit-item-search/NM-4084-item-search-1101",
 *     "fileName": "NM-4084-item-search-missing-testids-1101",
 *     "submodules": [
 *       { "ticket": "NM-3650", "name": "Product Search", "reports": ["product-search-nm-3650"] }
 *     ],
 *     "ownership": ["NM-2259", "NM-3650"],
 *     "assign": [{ "element": "Product Group button", "page": "/products", "to": "NM-2258" }]
 *   }
 *
 * submodules - display order; each lists the Submodule values of its steps files.
 * ownership  - most specific ticket first; an element seen by several goes to the first.
 * assign     - optional: move one element to another ticket, for a control that is
 *              scanned on one ticket's screen but belongs to another's (a button
 *              that opens the other ticket's page).
 */

const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const { describeElement, buildLocateSteps, buildDomSnippet, normalizeModuleFileName } = require('./generic-testid-audit.js');

const ROOT = path.resolve(__dirname, '..');
const SHOT_WIDTH = 420;
const SHOT_MAX_HEIGHT = 260;

const USAGE = [
  '',
  'Combines the audits of a module\'s tickets into one hand-over report.',
  '',
  'Usage:',
  '  node scripts/testid-report.js --plan <plan.json>',
  '',
  'The plan names the per-ticket reports, the submodule names and the office;',
  'see the comment at the top of this file for its fields. Run the audits first.',
  ''
].join('\n');

function parseArgs(argv) {
  const args = { plan: undefined, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--plan') args.plan = argv[index + 1];
    if (argv[index] === '--help' || argv[index] === '-h') args.help = true;
  }
  return args;
}

const inPage = (item) => / > main\b/.test(item.path || '');
const unindexed = (value) => String(value || '').replace(/:nth-of-type\(\d+\)/g, '');
const pageOf = (item) => new URL(item.pageUrl).pathname;

/**
 * Identifies an element across the reports of one office. Per page, so a sidebar
 * control on two pages is two rows. A control on the page itself is matched
 * without sibling positions, which shift as a toolbar grows when a row is
 * selected. Popover and dialog content shares one portal path, so it also keys on
 * its state - two dropdowns' option lists are different elements.
 */
function elementKey(item) {
  if (item.templateKey) {
    return pageOf(item) + '|' + item.templateKey
      + (inPage(item) ? '' : '|' + ((item.instanceSamples || [])[0] || '') + '|' + item.state);
  }
  // A field is known by its label, not its current value; text, containers and
  // images on the page by their place, not their words. Only a control's
  // position shifts with a growing toolbar - three "0-15" headers in one row
  // are three elements.
  const content = item.kind && item.kind !== 'control';
  const text = item.label || (content && inPage(item)) ? '' : item.text;
  // An icon moves when a neighbour appears; it is the icon beside the same thing.
  if (item.kind === 'image' && inPage(item)) return pageOf(item) + '|image|' + [item.tagName, item.nearText, item.column, unindexed(item.path)].join('|');
  return pageOf(item) + '|' + [
    item.tagName, item.role, text, item.ariaLabel, item.label, item.column, item.panel, item.placeholder,
    content && (inPage(item) || item.kind !== 'container') ? '' : item.nearText,
    inPage(item) && !content ? unindexed(item.path) : item.path
  ].join('|') + (inPage(item) ? '' : '|' + item.state);
}

function pngSize(file) {
  const bytes = fs.readFileSync(file);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/** Throws before anything is touched if the workbook is open in Excel. */
function assertWritable(file) {
  if (!fs.existsSync(file)) return;
  try {
    fs.closeSync(fs.openSync(file, 'r+'));
  } catch (error) {
    throw new Error('Close ' + path.basename(file) + ' in Excel first - nothing was changed.');
  }
}

/** Finds a ticket's report for the plan's office, whatever its country label. */
function findReport(reportsDir, moduleSlug, submodule, office) {
  const prefix = moduleSlug + '-' + normalizeModuleFileName(submodule) + '-';
  const match = fs.readdirSync(reportsDir).find((name) => name.startsWith(prefix) && name.endsWith('-' + office + '.json'));
  if (!match) {
    throw new Error('No report for "' + submodule + '" on office ' + office + ' in ' + reportsDir
      + ' - run its steps file with --office ' + office + ' first.');
  }
  return path.join(reportsDir, match);
}

function collect(plan, reportsDir) {
  const moduleSlug = normalizeModuleFileName(plan.module);
  const order = plan.ownership && plan.ownership.length ? plan.ownership : plan.submodules.map((s) => s.ticket);
  const byTicket = Object.fromEntries(plan.submodules.map((s) => [s.ticket, s]));
  const owned = new Map();

  for (const ticket of order) {
    const submodule = byTicket[ticket];
    if (!submodule) throw new Error('ownership names ' + ticket + ', which is not in submodules.');
    for (const reportName of submodule.reports) {
      const file = findReport(reportsDir, moduleSlug, reportName, plan.office);
      const { findings } = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const item of findings) {
        const key = elementKey(item);
        if (!owned.has(key)) owned.set(key, { ticket, item });
      }
    }
  }

  for (const rule of plan.assign || []) {
    for (const entry of owned.values()) {
      if (describeElement(entry.item) === rule.element && pageOf(entry.item).endsWith(rule.page) && inPage(entry.item) && !/thead/.test(entry.item.path)) {
        entry.ticket = rule.to;
      }
    }
  }

  return plan.submodules.map((submodule) => ({
    submodule,
    entries: [...owned.values()].filter((entry) => entry.ticket === submodule.ticket),
  }));
}

/** Copies each element's DOM and UI screenshots, numbered within its submodule. */
function copyScreenshots(groups, reportsDir, outputDir) {
  for (const { submodule, entries } of groups) {
    const dir = path.join(outputDir, 'screenshots', submodule.ticket);
    fs.mkdirSync(dir, { recursive: true });
    entries.forEach((entry, index) => {
      entry.serial = index + 1;
      const dom = entry.item.screenshot && path.join(reportsDir, entry.item.screenshot);
      entry.dom = '';
      entry.ui = '';
      if (dom && fs.existsSync(dom)) {
        const name = String(index + 1).padStart(3, '0') + '-' + path.basename(dom).replace(/^\d+-/, '');
        fs.copyFileSync(dom, path.join(dir, name));
        entry.dom = 'screenshots/' + submodule.ticket + '/' + name;
        const ui = entry.item.uiScreenshot && path.join(reportsDir, entry.item.uiScreenshot);
        if (ui && fs.existsSync(ui)) {
          entry.ui = entry.dom.replace(/\.png$/, '-ui.png');
          fs.copyFileSync(ui, path.join(outputDir, entry.ui));
        }
      }
    });
  }
}

async function writeWorkbook(plan, groups, outputDir, file) {
  const workbook = new ExcelJS.Workbook();
  const headFont = { bold: true, color: { argb: 'FFFFFFFF' } };
  const headFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4B2FA8' } };

  const sheet = workbook.addWorksheet('Missing testids', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = [
    { header: 'S.No', width: 6 },
    { header: 'Module', width: 14 },
    { header: 'Submodule', width: 30 },
    { header: 'Element', width: 40 },
    { header: 'Current selector', width: 50 },
    { header: 'Steps to locate the element', width: 60 },
    { header: 'DOM snippet', width: 46 },
    { header: 'Screenshot (DOM)', width: 62 },
    { header: 'Screenshot (UI)', width: 62 },
  ];
  sheet.getRow(1).eachCell((cell) => { cell.font = headFont; cell.fill = headFill; cell.alignment = { vertical: 'middle' }; });
  sheet.autoFilter = 'A1:I1';

  let rowNumber = 2;
  for (const { submodule, entries } of groups) {
    for (const entry of entries) {
      const row = sheet.getRow(rowNumber);
      row.values = [
        entry.serial,
        plan.module,
        submodule.name,
        describeElement(entry.item),
        entry.item.currentLocator || entry.item.path || '',
        buildLocateSteps(entry.item, plan.appUrl + pageOf(entry.item)),
        buildDomSnippet(entry.item),
        '',
        '',
      ];
      row.alignment = { vertical: 'top', wrapText: true };
      let height = 60;
      // Each image is scaled to fit its column; the row grows to the taller one.
      const embed = (relative, column) => {
        if (!relative) { row.getCell(column + 1).value = 'Screenshot not available'; return; }
        const image = path.join(outputDir, relative);
        const { width, height: imageHeight } = pngSize(image);
        const scale = Math.min(1, SHOT_WIDTH / width, SHOT_MAX_HEIGHT / imageHeight);
        const shown = { width: Math.round(width * scale), height: Math.round(imageHeight * scale) };
        sheet.addImage(workbook.addImage({ filename: image, extension: 'png' }), { tl: { col: column, row: rowNumber - 1 }, ext: shown, editAs: 'oneCell' });
        height = Math.max(height, shown.height * 0.75 + 6); // pixels to points
      };
      embed(entry.dom, 7);
      embed(entry.ui, 8);
      row.height = height;
      rowNumber += 1;
    }
  }

  const total = groups.reduce((sum, group) => sum + group.entries.length, 0);
  const summary = workbook.addWorksheet('Summary');
  summary.columns = [{ width: 38 }, { width: 14 }, { width: 100 }];
  summary.addRow([plan.title]).font = { bold: true, size: 14 };
  summary.addRow([]);
  summary.addRow(['Office', plan.officeLabel || plan.office]);
  summary.addRow(['Generated', new Date().toISOString().slice(0, 10)]);
  summary.addRow(['Counting', 'An element shown on several tickets\' screens is listed once, under the most specific ticket. '
    + 'Repeated items (dropdown options, calendar days, result rows) are one row each, with the instance count in the Element column.']);
  summary.addRow([]);
  summary.addRow(['Submodule', 'Ticket', 'Elements without data-testid']).eachCell((cell) => { cell.font = headFont; cell.fill = headFill; });
  for (const { submodule, entries } of groups) summary.addRow([submodule.name, submodule.ticket, entries.length]);
  summary.addRow(['Total', '', total]).font = { bold: true };
  summary.getColumn(3).alignment = { wrapText: true, vertical: 'top' };

  await workbook.xlsx.writeFile(file);
  return total;
}

function writePage(plan, groups, file) {
  const esc = (value) => String(value).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const total = groups.reduce((sum, group) => sum + group.entries.length, 0);
  const sections = groups.map(({ submodule, entries }) => `
  <section id="${esc(submodule.ticket)}">
    <h2>${esc(submodule.name)} <small>${esc(submodule.ticket)}</small> <span class="n">${entries.length}</span></h2>
    <div class="grid">${entries.map((entry) => `
      <figure>
        <figcaption><b>${entry.serial}.</b> ${esc(describeElement(entry.item))}<small>${esc(entry.item.state || '')}</small></figcaption>
        ${entry.ui ? `<a href="${esc(entry.ui)}" target="_blank"><img loading="lazy" src="${esc(entry.ui)}" alt="On screen"></a>` : ''}
        ${entry.dom ? `<a href="${esc(entry.dom)}" target="_blank"><img loading="lazy" src="${esc(entry.dom)}" alt="DOM"></a>` : '<p class="na">No screenshot</p>'}
      </figure>`).join('')}
    </div>
  </section>`).join('');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(plan.module)} Missing Testids</title>
<style>
:root{--bg:#f7f7f8;--card:#fff;--ink:#1d1d22;--mute:#6b6b76;--line:#e3e3e8;--accent:#4b2fa8}
@media (prefers-color-scheme:dark){:root{--bg:#141418;--card:#1e1e24;--ink:#ececf1;--mute:#a0a0ab;--line:#33333c;--accent:#a996ff}}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.45 system-ui,sans-serif}
header{padding:24px 16px 8px;max-width:1400px;margin:auto}h1{margin:0 0 4px;font-size:22px}
.meta{color:var(--mute)}nav{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0}
nav a{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:6px 10px;color:var(--ink);text-decoration:none}
nav a b{color:var(--accent)}main{max-width:1400px;margin:auto;padding:0 16px 40px}
h2{font-size:17px;border-bottom:1px solid var(--line);padding-bottom:6px;margin-top:32px}h2 small{color:var(--mute);font-weight:400}.n{color:var(--accent)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px}
figure{margin:0;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px;overflow:hidden}
figcaption{margin-bottom:8px;word-break:break-word}figcaption small{display:block;color:var(--mute)}
img{width:100%;margin-top:6px;border:1px solid var(--line);border-radius:4px;background:#fff}.na{color:var(--mute)}
</style></head><body>
<header><h1>${esc(plan.title)}</h1>
<div class="meta">Office ${esc(plan.officeLabel || plan.office)} · <b>${total}</b> elements without a data-testid · generated ${new Date().toISOString().slice(0, 10)}</div>
<nav>${groups.map(({ submodule, entries }) => `<a href="#${esc(submodule.ticket)}">${esc(submodule.name)} <b>${entries.length}</b></a>`).join('')}</nav></header>
<main>${sections}</main></body></html>`;
  fs.writeFileSync(file, html);
}

async function buildReport(planPath) {
  const plan = JSON.parse(fs.readFileSync(path.resolve(ROOT, planPath), 'utf8'));
  for (const field of ['title', 'module', 'office', 'appUrl', 'reportsDir', 'output', 'fileName', 'submodules']) {
    if (!plan[field]) throw new Error('The plan has no "' + field + '".');
  }
  const reportsDir = path.resolve(ROOT, plan.reportsDir);
  const outputDir = path.resolve(ROOT, plan.output);
  const workbookFile = path.join(outputDir, plan.fileName + '.xlsx');

  // Everything is read and checked before the previous report is replaced.
  assertWritable(workbookFile);
  const groups = collect(plan, reportsDir);

  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });
  copyScreenshots(groups, reportsDir, outputDir);
  const total = await writeWorkbook(plan, groups, outputDir, workbookFile);
  writePage(plan, groups, path.join(outputDir, plan.fileName + '.html'));

  for (const { submodule, entries } of groups) console.log(submodule.ticket + ' ' + submodule.name + ': ' + entries.length);
  console.log('Total: ' + total);
  console.log('Workbook: ' + workbookFile);
  console.log('Page:     ' + path.join(outputDir, plan.fileName + '.html'));
  return { total, workbookFile };
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.plan) {
    console.log(USAGE);
  } else {
    buildReport(args.plan).catch((error) => {
      console.error('Failed to build the report: ' + error.message);
      process.exitCode = 1;
    });
  }
}

module.exports = { buildReport, elementKey };
