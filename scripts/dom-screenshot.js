/**
 * Renders a Chrome DevTools "Elements" style view of a single finding and
 * screenshots it. Chrome's real DevTools panel is browser UI and cannot be
 * captured by Playwright, so we rebuild the same view from the element's own
 * outerHTML (captured live from the page) and shoot that instead.
 */
const path = require('path');

const DEVTOOLS_CSS = `
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 10px 12px;
    background: #ffffff;
    font-family: Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    font-size: 12px;
    line-height: 1.55;
    color: #222;
    width: 620px;
  }
  .row { white-space: pre-wrap; word-break: break-word; padding: 1px 6px; }
  .row.target { background: #fce8ec; box-shadow: inset 2px 0 0 #e8628a; }
  .indent-1 { padding-left: 20px; }
  .indent-2 { padding-left: 40px; }
  .tag  { color: #881280; }
  .attr { color: #994500; }
  .val  { color: #1a1aa6; }
  .txt  { color: #222; }
  .sel  { color: #808080; font-style: italic; }
`;

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Applies DevTools-ish token colours to already-escaped markup. */
function colorize(escaped) {
  return escaped
    .replace(/(&lt;\/?)([a-zA-Z][\w-]*)/g, '$1<span class="tag">$2</span>')
    .replace(/([a-zA-Z_:][\w:.-]*)=(&quot;)([\s\S]*?)(&quot;)/g,
      '<span class="attr">$1</span>=<span class="val">$2$3$4</span>');
}

/** Collapses a long attribute value so one row stays readable. */
function truncateAttrValues(markup, max = 90) {
  return String(markup).replace(/="([^"]*)"/g, (full, value) =>
    value.length > max ? `="${value.slice(0, max)}…"` : full);
}

function buildDevtoolsHtml(item) {
  const ctx = item.domContext || {};
  const rows = [];

  if (ctx.grandparentOpenTag) {
    rows.push(`<div class="row">${colorize(escapeHtml(truncateAttrValues(ctx.grandparentOpenTag)))}</div>`);
  }
  if (ctx.parentOpenTag) {
    rows.push(`<div class="row indent-1">${colorize(escapeHtml(truncateAttrValues(ctx.parentOpenTag)))}</div>`);
  }

  const target = truncateAttrValues(ctx.outerHTML || `<${String(item.tagName || 'element').toLowerCase()}>`);
  rows.push(
    `<div class="row target indent-2">${colorize(escapeHtml(target))} <span class="sel">== $0</span></div>`
  );

  if (ctx.parentCloseTag) {
    rows.push(`<div class="row indent-1">${colorize(escapeHtml(ctx.parentCloseTag))}</div>`);
  }
  if (ctx.grandparentCloseTag) {
    rows.push(`<div class="row">${colorize(escapeHtml(ctx.grandparentCloseTag))}</div>`);
  }

  return `<!doctype html><html><head><meta charset="utf-8"><style>${DEVTOOLS_CSS}</style></head>`
    + `<body><div id="panel">${rows.join('')}</div></body></html>`;
}

/**
 * Renders the DevTools view for one finding on a scratch page and writes a PNG.
 * Returns the written path, or 'screenshot:not-available' when it cannot render.
 */
async function captureDomScreenshot(renderPage, item, outputDir, fileBaseName) {
  if (!renderPage || !item) return 'screenshot:not-available';
  try {
    await renderPage.setContent(buildDevtoolsHtml(item), { waitUntil: 'load' });
    const screenshotPath = path.join(outputDir, `${fileBaseName}.png`);
    await renderPage.locator('#panel').screenshot({ path: screenshotPath, animations: 'disabled' });
    return screenshotPath.split(String.fromCharCode(92)).join('/');
  } catch (error) {
    return 'screenshot:not-available';
  }
}

module.exports = { captureDomScreenshot, buildDevtoolsHtml, escapeHtml, colorize };
