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
 *              "name@1101" reads that one report from another office, for a view
 *              that only that office can show (its data exists nowhere else).
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
// The first of several is the same place as the only one: a grid that gains a
// sibling (sorted, another view) keeps its elements where they were.
const slot = (value) => String(value || '').replace(/:nth-of-type\(1\)/g, '');
const DATE = /^(January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}(st|nd|rd|th)?, \d{4}$|^\d{1,2}\/\d{1,2}\/\d{4}$/;
const pageOf = (item) => new URL(item.pageUrl).pathname;
// A page is the same page on every office: a view only another office shows
// (a read-only one, say) lists only what it adds.
const pageKey = (item) => pageOf(item).replace(/\/locations\/\d+\//, '/locations/*/');

// The body child that holds the application - its sidebar, its main and any
// panel beside them - as opposed to the portals popovers and dialogs open in.
let layoutRoot = '';
const findLayoutRoot = (items) => {
  const counts = {};
  for (const item of items) {
    if (inPage(item)) {
      const root = item.path.split(' > ').slice(0, 2).join(' > ');
      counts[root] = (counts[root] || 0) + 1;
    }
  }
  return Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0] || '';
};
const inLayout = (item) => !inPage(item) && !!layoutRoot && String(item.path || '').startsWith(layoutRoot + ' > ');
// Stays where it is from state to state: the page, or the sidebar beside it.
const fixed = (item) => inPage(item) || inLayout(item);

/**
 * Identifies an element across the reports of one office. Per page, so a sidebar
 * control on two pages is two rows. A control on the page itself is matched
 * without sibling positions, which shift as a toolbar grows when a row is
 * selected; so is the sidebar beside it, whose positions shift when it
 * collapses. Popover and dialog content shares one portal path, so it also keys
 * on its state - two dropdowns' option lists are different elements.
 */
function elementKey(item) {
  // The notifications region is one place on every screen: its list, its
  // Close button and its icon are the same elements whichever message shows;
  // only each message's text is its own.
  if (/^body > section\b/.test(item.path || '')) {
    return pageKey(item) + '|toast|' + [item.tagName, item.role, item.kind, item.kind === 'text' ? item.text : '', unindexed(item.path)].join('|');
  }
  const ariaLabel = item.ariaLabel;
  if (item.templateKey) {
    return pageKey(item) + '|' + slot(item.templateKey)
      + (fixed(item) ? '' : '|' + ((item.instanceSamples || [])[0] || '') + '|' + item.state);
  }
  // A field is known by its label, not its current value; text, containers and
  // images on the page by their place, not their words. Only a control's
  // position shifts with a growing toolbar - three "0-15" headers in one row
  // are three elements.
  const content = item.kind && item.kind !== 'control';
  // A date picker's button reads its date: it is one button whatever the date.
  const text = item.label || (content && inPage(item)) ? '' : String(item.text || '').replace(DATE, 'date');
  // An icon moves when a neighbour appears; it is the icon beside the same
  // thing, whatever count that thing shows ("17 items found", "16 items found").
  const near = String(item.nearText || '').replace(/\d+/g, '#');
  if (item.kind === 'image' && fixed(item)) return pageKey(item) + '|image|' + [item.tagName, near, item.column, unindexed(item.path)].join('|');
  return pageKey(item) + '|' + [
    item.tagName, item.role, text, ariaLabel, item.label, item.column, item.panel, item.placeholder,
    content && (inPage(item) || item.kind !== 'container') ? '' : near,
    (inPage(item) && !content) || inLayout(item) ? unindexed(item.path) : slot(item.path)
  ].join('|') + (fixed(item) ? '' : '|' + item.state);
}

/**
 * The name each row shows. Where two rows would read the same - a grid's
 * repeated cell and the one cell of the row for adding a new line - the
 * single one says which table row it is in.
 */
function nameEntries(groups) {
  const entries = groups.flatMap((group) => group.entries);
  const counts = {};
  for (const entry of entries) {
    entry.name = describeElement(entry.item);
    const base = entry.name.replace(/ \(one template.*$/, '');
    counts[base] = (counts[base] || 0) + 1;
  }
  for (const entry of entries) {
    const base = entry.name.replace(/ \(one template.*$/, '');
    const row = String(entry.item.path || '').match(/tbody > tr:nth-of-type\((\d+)\)/);
    if (counts[base] > 1 && (entry.item.instances || 1) <= 1 && row) entry.name = base + ' (row ' + row[1] + ' of the table)';
  }
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
  const loaded = [];

  for (const ticket of order) {
    const submodule = byTicket[ticket];
    if (!submodule) throw new Error('ownership names ' + ticket + ', which is not in submodules.');
    for (const reportName of submodule.reports) {
      const [name, office] = reportName.split('@');
      const file = findReport(reportsDir, moduleSlug, name, office || plan.office);
      const { findings, tagged, stoppedAt } = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (stoppedAt) console.warn('Warning: ' + path.basename(file) + ' is incomplete - its walk ' + stoppedAt.replace(/^Step/, 'stopped at step'));
      loaded.push({ ticket, findings, tagged: tagged || [] });
    }
  }
  layoutRoot = findLayoutRoot(loaded.flatMap((report) => report.findings));
  // Elements that already carry a data-testid: one per page, under the first
  // ticket that saw them, so found = with + without adds up per ticket.
  const ownedTagged = new Map();
  for (const { ticket, tagged } of loaded) {
    for (const item of tagged) {
      const key = pageKey(item) + '|' + item.testId + '|' + item.tagName;
      if (!ownedTagged.has(key)) ownedTagged.set(key, { ticket, item });
    }
  }
  // A labelled control at the very same place on the page is the same control,
  // even when its aria-label changes with the state ("Fix invalid values
  // before changing Service Type" while a day is refused).
  const byPlace = new Map();
  for (const { ticket, findings } of loaded) {
    for (const item of findings) {
      const place = inPage(item) && item.kind === 'control' && item.label
        ? [pageKey(item), item.tagName, item.role, item.label, item.path].join('|') : '';
      const key = (place && byPlace.get(place)) || elementKey(item);
      if (place && !byPlace.has(place)) byPlace.set(place, key);
      if (!owned.has(key)) owned.set(key, { ticket, item });
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
    tagged: [...ownedTagged.values()].filter((entry) => entry.ticket === submodule.ticket),
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
        entry.name,
        entry.item.currentLocator || entry.item.path || '',
        buildLocateSteps(entry.item, plan.appUrl + pageOf(entry.item)).split(describeElement(entry.item)).join(entry.name),
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
  // Elements that already have a data-testid are only counted, in the table
  // below; the rows above list just the ones without.
  const totalTagged = groups.reduce((sum, group) => sum + group.tagged.length, 0);
  const summary = workbook.addWorksheet('Summary');
  summary.columns = [{ width: 38 }, { width: 14 }, { width: 16 }, { width: 14 }];
  summary.addRow([plan.title]).font = { bold: true, size: 14 };
  summary.addRow([]);
  summary.addRow(['Office', plan.officeLabel || plan.office]);
  summary.addRow(['Generated', new Date().toISOString().slice(0, 10)]);
  summary.addRow(['Counting', 'Elements found = with data-testid + without. An element shown on several tickets\' screens is listed once, under the most specific ticket. '
    + 'Repeated items (dropdown options, calendar days, result rows) are one row each, with the instance count in the Element column.']);
  summary.addRow([]);
  summary.addRow(['Section', 'Found', 'With testid', 'Without']).eachCell((cell) => { cell.font = headFont; cell.fill = headFill; });
  for (const { submodule, entries, tagged } of groups) summary.addRow([submodule.name, entries.length + tagged.length, tagged.length, entries.length]);
  summary.addRow(['Total', total + totalTagged, totalTagged, total]).font = { bold: true };
  // The notes above the table span its width.
  for (let row = 3; row <= 5; row += 1) { summary.mergeCells(row, 2, row, 4); summary.getCell(row, 2).alignment = { wrapText: true, vertical: 'top' }; }
  summary.getRow(5).height = 48;

  await workbook.xlsx.writeFile(file);
  return total;
}

function writePage(plan, groups, file) {
  const esc = (value) => String(value).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const total = groups.reduce((sum, group) => sum + group.entries.length, 0);
  const totalTagged = groups.reduce((sum, group) => sum + group.tagged.length, 0);
  const sections = groups.map(({ submodule, entries }) => `
  <section id="${esc(submodule.ticket)}">
    <h2>${esc(submodule.name)} <small>${esc(submodule.ticket)}</small> <span class="n">${entries.length}</span></h2>
    <div class="grid">${entries.map((entry) => `
      <figure>
        <figcaption><b>${entry.serial}.</b> ${esc(entry.name)}<small>${esc(entry.item.state || '')}</small></figcaption>
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
<div class="meta">Office ${esc(plan.officeLabel || plan.office)} · <b>${total + totalTagged}</b> elements found · <b>${totalTagged}</b> with a data-testid · <b>${total}</b> without · generated ${new Date().toISOString().slice(0, 10)}</div>
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
  nameEntries(groups);

  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });
  copyScreenshots(groups, reportsDir, outputDir);
  const total = await writeWorkbook(plan, groups, outputDir, workbookFile);
  writePage(plan, groups, path.join(outputDir, plan.fileName + '.html'));

  for (const { submodule, entries, tagged } of groups) console.log(submodule.ticket + ' ' + submodule.name + ': ' + entries.length + ' without, ' + tagged.length + ' with data-testid');
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
