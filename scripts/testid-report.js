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
 *              Optional "page" and "states" take only part of the reports, for a
 *              steps file that walks two pages shown as two sections:
 *              { "ticket": "NM-4410-FD", "name": "Fulfillment Details",
 *                "reports": ["fulfillments-nm-4410"], "page": "/fulfillments/*" }
 *              "page" is the address after the office, * standing for one part of
 *              it; "states" lists state names, * standing for any text. A finding
 *              no section takes is counted in a warning.
 *              Optional "from" reads the section's reports from another module's
 *              folder, to reuse an audit made for another ticket - the application
 *              shell, which is the same on every page:
 *              "from": { "reportsDir": "reports/testid-audit-home", "module": "Home" }
 * ownership  - most specific ticket first; an element seen by several goes to the first.
 * assign     - optional: move one element to another ticket, for a control that is
 *              scanned on one ticket's screen but belongs to another's (a button
 *              that opens the other ticket's page).
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const ExcelJS = require('exceljs');
const { describeElement, buildLocateSteps, buildDomSnippet, normalizeModuleFileName, DATE_TEXT: DATE } = require('./generic-testid-audit.js');

const ROOT = path.resolve(__dirname, '..');
const SHOT_WIDTH = 420;
const SHOT_MAX_HEIGHT = 260;
// Rows seen only on screens an Answer step filled: a developer following the
// steps in E2E finds the screen empty.
// Rows seen only in states marked "content varies" - a generated answer.
const VARIES_NOTE = 'Content varies between runs: this screen is generated each time, so its items and their number may differ when the steps are followed.';
const PREPARED_NOTE = 'Seen only with prepared data: this environment holds no such records, so the screen shows them only when its data is supplied.';

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

/** The share of usable elements recorded across screens, or "" when unknown. */
function coveragePercent(coverage) {
  if (!coverage) return '';
  const counted = coverage.reduce((sum, state) => sum + state.counted, 0);
  const recorded = coverage.reduce((sum, state) => sum + state.recorded, 0);
  return counted ? (Math.floor((recorded / counted) * 1000) / 10).toFixed(1) + '%' : '100.0%';
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

/**
 * Which of a report's findings a section takes. One steps file can walk two
 * pages - a search and the record it opens - that the plan shows as two
 * sections. "page" keeps the findings whose address, after the office, matches
 * ("/fulfillments" is the search; "/fulfillments/*" with a * for each part
 * of the address a record opens); "states" keeps those of the named states
 * ("Details*" is every state whose name starts so).
 */
function partOf(submodule) {
  const pattern = (glob, any) => new RegExp('^' + glob.split('*').map((text) => text.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join(any) + '$');
  const page = submodule.page && pattern(submodule.page.replace(/\/+$/, ''), '[^/]+');
  const states = (submodule.states || []).map((state) => pattern(state, '.*'));
  const afterOffice = (item) => pageOf(item).replace(/^.*?\/locations\/[^/]+/, '').replace(/\/+$/, '');
  return (item) => (!page || page.test(afterOffice(item)))
    && (!states.length || states.some((state) => state.test(item.state || '')));
}

function collect(plan, reportsDir) {
  const moduleSlug = normalizeModuleFileName(plan.module);
  const order = plan.ownership && plan.ownership.length ? plan.ownership : plan.submodules.map((s) => s.ticket);
  const byTicket = Object.fromEntries(plan.submodules.map((s) => [s.ticket, s]));
  const owned = new Map();
  const loaded = [];

  // What each report's sections took, so a finding no section takes is reported, not lost.
  const taken = new Map();
  for (const ticket of order) {
    const submodule = byTicket[ticket];
    if (!submodule) throw new Error('ownership names ' + ticket + ', which is not in submodules.');
    const part = partOf(submodule);
    // A section may reuse another module's audit - the application shell,
    // the same on every page - from that module's folder.
    const from = submodule.from || {};
    const dir = from.reportsDir ? path.resolve(ROOT, from.reportsDir) : reportsDir;
    const slug = from.module ? normalizeModuleFileName(from.module) : moduleSlug;
    for (const reportName of submodule.reports) {
      const [name, office] = reportName.split('@');
      const file = findReport(dir, slug, name, office || plan.office);
      const { findings, tagged, stoppedAt, coverage, generatedAt } = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const item of findings) item.sourceDir = dir;
      if (!taken.has(file)) {
        const days = generatedAt ? Math.floor((Date.now() - Date.parse(generatedAt)) / 86400000) : 0;
        if (from.reportsDir && days > REUSE_DAYS) console.warn('Warning: ' + path.basename(file) + ' is reused from ' + days + ' days ago - the screens may have changed since; run its steps file again.');
        if (stoppedAt) console.warn('Warning: ' + path.basename(file) + ' is incomplete - its walk ' + stoppedAt.replace(/^Step/, 'stopped at step'));
        if (!coverage) console.warn('Warning: ' + path.basename(file) + ' has no deep check - run its steps file again to show its coverage.');
        taken.set(file, { findings, keys: new Set() });
      }
      const mine = findings.filter(part);
      mine.forEach((item) => taken.get(file).keys.add(findings.indexOf(item)));
      loaded.push({ ticket, findings: mine, tagged: (tagged || []).filter(part), coverage: coverage && coverage.filter(part) });
    }
  }
  for (const [file, { findings, keys }] of taken) {
    const left = findings.length - keys.size;
    if (left) console.warn('Warning: ' + left + ' finding(s) of ' + path.basename(file) + ' are in no section - its "page" and "states" filters leave them out.');
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
      // Seen anywhere with the environment's own data, it is not only prepared.
      else {
        if (!item.prepared) owned.get(key).item.prepared = false;
        if (!item.varies) owned.get(key).item.varies = false;
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

  // The deep check of every screen a section's audits walked; null when one
  // of its audits predates the check, so no partial figure is shown as whole.
  const coverageOf = (ticket) => {
    const reports = loaded.filter((report) => report.ticket === ticket);
    return reports.every((report) => report.coverage) ? reports.flatMap((report) => report.coverage) : null;
  };
  return plan.submodules.map((submodule) => ({
    submodule,
    entries: [...owned.values()].filter((entry) => entry.ticket === submodule.ticket),
    tagged: [...ownedTagged.values()].filter((entry) => entry.ticket === submodule.ticket),
    coverage: coverageOf(submodule.ticket),
  }));
}

/*
 * Screenshots go into the workbook at half the size: a page of markup or a
 * crop of the app draws with a few hundred colours, most of them the soft
 * edges of letters, so the 256 it uses most - each other one drawn with the
 * closest of those - look the same and store in half the bytes. An image that
 * would change more than PALETTE_LIMIT of its pixels (a photograph) is kept.
 */
const PALETTE_LIMIT = 0.12;
// A reused audit older than this is flagged: the screens may have changed.
const REUSE_DAYS = 7;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function pngChunk(type, data) {
  const head = Buffer.from(type, 'ascii');
  let crc = 0xffffffff;
  for (const byte of Buffer.concat([head, data])) crc = CRC_TABLE[(crc ^ byte) & 255] ^ (crc >>> 8);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const check = Buffer.alloc(4);
  check.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, head, data, check]);
}

/** The pixels of an 8-bit RGB or RGBA PNG, or null for any other kind. */
function readPng(bytes) {
  let header = null;
  const data = [];
  for (let at = 8; at < bytes.length;) {
    const length = bytes.readUInt32BE(at);
    const type = bytes.toString('ascii', at + 4, at + 8);
    const body = bytes.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') header = { width: body.readUInt32BE(0), height: body.readUInt32BE(4), depth: body[8], colour: body[9], interlace: body[12] };
    if (type === 'IDAT') data.push(body);
    at += 12 + length;
  }
  if (!header || header.depth !== 8 || header.interlace || ![2, 6].includes(header.colour)) return null;
  const channels = header.colour === 6 ? 4 : 3;
  const stride = header.width * channels;
  const packed = zlib.inflateSync(Buffer.concat(data));
  const pixels = Buffer.alloc(stride * header.height);
  for (let y = 0; y < header.height; y += 1) {
    const filter = packed[y * (stride + 1)];
    const line = packed.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? pixels[y * stride + x - channels] : 0;
      const up = y ? pixels[(y - 1) * stride + x] : 0;
      const corner = y && x >= channels ? pixels[(y - 1) * stride + x - channels] : 0;
      let base = 0;
      if (filter === 1) base = left;
      else if (filter === 2) base = up;
      else if (filter === 3) base = (left + up) >> 1;
      else if (filter === 4) {
        const guess = left + up - corner;
        const toLeft = Math.abs(guess - left);
        const toUp = Math.abs(guess - up);
        const toCorner = Math.abs(guess - corner);
        base = toLeft <= toUp && toLeft <= toCorner ? left : toUp <= toCorner ? up : corner;
      }
      pixels[y * stride + x] = (line[x] + base) & 255;
    }
  }
  return { ...header, channels, pixels };
}

/** The PNG drawn with its 256 most used colours, or the original bytes. */
function shrinkPng(bytes) {
  const image = readPng(bytes);
  if (!image) return bytes;
  const { width, height, channels, pixels } = image;
  // A see-through pixel would lose its transparency in a palette.
  if (channels === 4) for (let at = 3; at < pixels.length; at += 4) if (pixels[at] !== 255) return bytes;
  const colourAt = (at) => (pixels[at] << 16) | (pixels[at + 1] << 8) | pixels[at + 2];
  const uses = new Map();
  for (let at = 0; at < pixels.length; at += channels) uses.set(colourAt(at), (uses.get(colourAt(at)) || 0) + 1);
  const palette = [...uses.entries()].sort((a, b) => b[1] - a[1]).slice(0, 256).map(([colour]) => colour);
  const kept = palette.reduce((sum, colour) => sum + uses.get(colour), 0);
  if (1 - kept / (width * height) > PALETTE_LIMIT) return bytes;
  const slot = new Map(palette.map((colour, index) => [colour, index]));
  const closest = (colour) => {
    let best = 0;
    let bestDistance = Infinity;
    palette.forEach((candidate, index) => {
      const red = (colour >> 16) - (candidate >> 16);
      const green = ((colour >> 8) & 255) - ((candidate >> 8) & 255);
      const blue = (colour & 255) - (candidate & 255);
      // Weighted as the eye sees it: green most, blue least.
      const distance = red * red * 3 + green * green * 4 + blue * blue * 2;
      if (distance < bestDistance) { bestDistance = distance; best = index; }
    });
    slot.set(colour, best);
    return best;
  };
  const lines = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const colour = colourAt((y * width + x) * channels);
      lines[y * (width + 1) + 1 + x] = slot.has(colour) ? slot.get(colour) : closest(colour);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 3;
  const colours = Buffer.alloc(palette.length * 3);
  palette.forEach((colour, index) => { colours[index * 3] = colour >> 16; colours[index * 3 + 1] = (colour >> 8) & 255; colours[index * 3 + 2] = colour & 255; });
  const shrunk = Buffer.concat([PNG_SIGNATURE, pngChunk('IHDR', header), pngChunk('PLTE', colours),
    pngChunk('IDAT', zlib.deflateSync(lines, { level: 9 })), pngChunk('IEND', Buffer.alloc(0))]);
  return shrunk.length < bytes.length ? shrunk : bytes;
}

function copyShrunk(from, to) {
  fs.writeFileSync(to, shrinkPng(fs.readFileSync(from)));
}

/** Copies each element's DOM and UI screenshots, numbered within its submodule. */
function copyScreenshots(groups, reportsDir, outputDir) {
  for (const { submodule, entries } of groups) {
    const dir = path.join(outputDir, 'screenshots', submodule.ticket);
    fs.mkdirSync(dir, { recursive: true });
    entries.forEach((entry, index) => {
      entry.serial = index + 1;
      const sourceDir = entry.item.sourceDir || reportsDir;
      const dom = entry.item.screenshot && path.join(sourceDir, entry.item.screenshot);
      entry.dom = '';
      entry.ui = '';
      if (dom && fs.existsSync(dom)) {
        const name = String(index + 1).padStart(3, '0') + '-' + path.basename(dom).replace(/^\d+-/, '');
        copyShrunk(dom, path.join(dir, name));
        entry.dom = 'screenshots/' + submodule.ticket + '/' + name;
        const ui = entry.item.uiScreenshot && path.join(sourceDir, entry.item.uiScreenshot);
        if (ui && fs.existsSync(ui)) {
          entry.ui = entry.dom.replace(/\.png$/, '-ui.png');
          copyShrunk(ui, path.join(outputDir, entry.ui));
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
    { header: 'Note', width: 40 },
  ];
  sheet.getRow(1).eachCell((cell) => { cell.font = headFont; cell.fill = headFill; cell.alignment = { vertical: 'middle' }; });
  sheet.autoFilter = 'A1:J1';

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
        [entry.item.prepared ? PREPARED_NOTE : '', entry.item.varies ? VARIES_NOTE : ''].filter(Boolean).join('\n'),
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
  const allCoverage = groups.every((group) => group.coverage) ? groups.flatMap((group) => group.coverage) : null;
  const summary = workbook.addWorksheet('Summary');
  summary.columns = [{ width: 38 }, { width: 14 }, { width: 16 }, { width: 14 }, { width: 16 }, { width: 16 }];
  summary.addRow([plan.title]).font = { bold: true, size: 14 };
  summary.addRow([]);
  summary.addRow(['Office', plan.officeLabel || plan.office]);
  summary.addRow(['Generated', new Date().toISOString().slice(0, 10)]);
  summary.addRow(['Counting', 'Elements found = with data-testid + without. An element shown on several tickets\' screens is listed once, under the most specific ticket. '
    + 'Repeated items (dropdown options, calendar days, result rows) are one row each, with the instance count in the Element column.']);
  summary.addRow(['Coverage', 'Every screen audited is also checked element by element: DOM coverage is the share of its usable elements '
    + '(controls, click targets, text, icons, containers) that the audit recorded. The Coverage sheet lists each screen.']);
  summary.addRow([]);
  summary.addRow(['Section', 'Found', 'With testid', 'Without', 'Screens audited', 'DOM coverage']).eachCell((cell) => { cell.font = headFont; cell.fill = headFill; });
  const screens = (coverage) => (coverage ? coverage.length : '');
  for (const { submodule, entries, tagged, coverage } of groups) {
    summary.addRow([submodule.name, entries.length + tagged.length, tagged.length, entries.length, screens(coverage), coveragePercent(coverage)]);
  }
  summary.addRow(['Total', total + totalTagged, totalTagged, total, screens(allCoverage), coveragePercent(allCoverage)]).font = { bold: true };
  // The notes above the table span its width.
  for (let row = 3; row <= 6; row += 1) { summary.mergeCells(row, 2, row, 6); summary.getCell(row, 2).alignment = { wrapText: true, vertical: 'top' }; }
  summary.getRow(5).height = 36;
  summary.getRow(6).height = 36;

  // One row per screen audited, with what its deep check passed over, if anything.
  const sheet2 = workbook.addWorksheet('Coverage', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet2.columns = [
    { header: 'Section', width: 30 },
    { header: 'Screen', width: 44 },
    { header: 'Usable elements', width: 16 },
    { header: 'Recorded', width: 12 },
    { header: 'DOM coverage', width: 14 },
    { header: 'Not recorded', width: 60 },
    { header: 'Open outside the audited area', width: 50 },
  ];
  sheet2.getRow(1).eachCell((cell) => { cell.font = headFont; cell.fill = headFill; });
  for (const { submodule, coverage } of groups) {
    if (!coverage) {
      sheet2.addRow([submodule.name, 'No deep check - audited before it existed']);
      continue;
    }
    for (const state of coverage) {
      const row = sheet2.addRow([
        submodule.name,
        state.state,
        state.counted,
        state.recorded,
        coveragePercent([state]),
        state.missed.map((item) => item.category + ' ' + item.tagName.toLowerCase() + (item.text ? ' "' + item.text + '"' : '')).join('\n'),
        state.outside.map((layer) => layer.role + (layer.text ? ' "' + layer.text + '"' : '')).join('\n'),
      ]);
      row.alignment = { vertical: 'top', wrapText: true };
    }
  }

  await workbook.xlsx.writeFile(file);
  return total;
}

function writePage(plan, groups, file) {
  const esc = (value) => String(value).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const total = groups.reduce((sum, group) => sum + group.entries.length, 0);
  const totalTagged = groups.reduce((sum, group) => sum + group.tagged.length, 0);
  const allCoverage = groups.every((group) => group.coverage) ? groups.flatMap((group) => group.coverage) : null;
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
<div class="meta">Office ${esc(plan.officeLabel || plan.office)} · <b>${total + totalTagged}</b> elements found · <b>${totalTagged}</b> with a data-testid · <b>${total}</b> without${allCoverage ? ` · <b>${allCoverage.length}</b> screens audited · DOM coverage <b>${coveragePercent(allCoverage)}</b>` : ''} · generated ${new Date().toISOString().slice(0, 10)}</div>
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

  for (const { submodule, entries, tagged, coverage } of groups) {
    console.log(submodule.ticket + ' ' + submodule.name + ': ' + entries.length + ' without, ' + tagged.length + ' with data-testid'
      + (coverage ? ', ' + coverage.length + ' screens, DOM coverage ' + coveragePercent(coverage) : ', no deep check'));
  }
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
