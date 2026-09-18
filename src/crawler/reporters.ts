/**
 * Writing the report.
 *
 * Three outputs, because three different readers need it:
 *
 *   bug-report.json     the machine copy — what a defect tracker imports and what a later run
 *                       diffs against, so every field is present even when it is empty.
 *   bug-report.md       the copy that goes in a pull request or a ticket comment.
 *   bug-report.html     the copy a QA lead opens — self-contained, no network, evidence inline.
 *   crawl-summary.*     what was covered and, more usefully, what was NOT.
 *
 * The HTML is deliberately dependency-free. A report that needs a CDN to render is a report that
 * does not render on a build agent, in an air-gapped review, or in two years' time.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Log } from '../utils/logger';
import { DETECTOR_META } from './bug-collector';
import { DETECTORS } from './detectors';
import type { Bug, CrawlSummary, Severity } from './types';

export interface WrittenReports {
  json: string;
  markdown: string;
  html: string;
  summaryJson: string;
}

const SEVERITY_COLOR: Record<Severity, string> = {
  Critical: '#b3261e',
  Major: '#b35a00',
  Minor: '#7a5c00',
  Trivial: '#3f5566',
};

/* ------------------------------------------------------------------ helpers */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Pipes and newlines break a Markdown table cell; everything else is left as the tester wrote it. */
function escapeMarkdownCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

/**
 * Writes one file, surviving the file being held open.
 *
 * Same problem the testid audit hit: on Windows a report open in an editor, or mid-sync in
 * OneDrive, answers EBUSY. Losing the other four outputs to that would be absurd, so each write
 * lands beside the target and is renamed over it, and a refusal is reported and stepped past.
 */
function writeFile(filePath: string, contents: string): boolean {
  const temporary = `${filePath}.tmp-${process.pid}`;
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(temporary, contents, 'utf-8');
    fs.renameSync(temporary, filePath);
    return true;
  } catch (error) {
    Log.warn(`[crawler] could not write ${filePath}: ${(error as Error).message}`);
    try {
      fs.rmSync(temporary, { force: true });
    } catch {
      /* nothing further to clean up */
    }
    return false;
  }
}

/* ------------------------------------------------------------------ markdown */

export function buildMarkdown(summary: CrawlSummary): string {
  const lines: string[] = [];
  const w = (text = '') => lines.push(text);
  const { totals } = summary;

  w('# Exploratory Crawl — Bug Report');
  w();
  w(`**Application:** ${summary.startUrl}`);
  w(`**Run:** ${summary.startedAt} → ${summary.finishedAt} (${summary.durationMs})`);
  w(`**Stopped because:** ${summary.stopReason}`);
  w();

  w('| | |');
  w('| --- | --- |');
  w(`| Pages visited | ${totals.pagesVisited} |`);
  w(`| Actions performed | ${totals.actionsPerformed} |`);
  w(`| Scenarios explored | ${totals.scenariosExplored} |`);
  w(`| **Bugs found** | **${totals.bugsFound}** |`);
  w(`| Raw findings before dedup | ${totals.findingsBeforeDedup} |`);
  w(`| Crawl errors | ${totals.errors} |`);
  w(`| Pages/actions not tested | ${totals.notTested} |`);
  w();

  w('## Severity');
  w();
  w('| Severity | Count |');
  w('| --- | --- |');
  for (const severity of ['Critical', 'Major', 'Minor', 'Trivial'] as Severity[]) {
    w(`| ${severity} | ${totals.bySeverity[severity]} |`);
  }
  w();

  if (Object.keys(totals.byCategory).length) {
    w('## Category');
    w();
    w('| Category | Count |');
    w('| --- | --- |');
    for (const [category, count] of Object.entries(totals.byCategory).sort((a, b) => b[1] - a[1])) {
      w(`| ${category} | ${count} |`);
    }
    w();
  }

  w('## Bugs');
  w();
  if (summary.bugs.length === 0) {
    w('No bugs were detected on the pages and actions covered by this crawl. See *Coverage* below');
    w('for what was and was not reached — an empty bug list is only as meaningful as the coverage');
    w('behind it.');
    w();
  } else {
    w('| ID | Severity | Priority | Module | Title | Seen |');
    w('| --- | --- | --- | --- | --- | --- |');
    for (const bug of summary.bugs) {
      w(
        `| ${bug.id} | ${bug.severity} | ${bug.priority} | ${escapeMarkdownCell(bug.module)} | ${escapeMarkdownCell(bug.title)} | ${bug.occurrences}x |`,
      );
    }
    w();

    for (const bug of summary.bugs) {
      w(`### ${bug.id} — ${bug.title}`);
      w();
      w(`| Field | Value |`);
      w(`| --- | --- |`);
      w(`| **Severity** | ${bug.severity} |`);
      w(`| **Priority** | ${bug.priority} |`);
      w(`| **Category** | ${bug.category} |`);
      w(`| **Module / Page** | ${escapeMarkdownCell(bug.module)} |`);
      w(`| **URL** | ${escapeMarkdownCell(bug.url)} |`);
      w(`| **Detector** | \`${bug.detector}\` |`);
      w(`| **Occurrences** | ${bug.occurrences} |`);
      w();
      w('**Preconditions**');
      w();
      for (const line of bug.preconditions) w(`- ${line}`);
      w();
      w('**Steps to reproduce**');
      w();
      for (const step of bug.stepsToReproduce) w(step);
      w();
      w(`**Expected result:** ${bug.expectedResult}`);
      w();
      w(`**Actual result:** ${bug.actualResult}`);
      w();
      if (bug.evidence.screenshot) {
        w(`**Evidence:** ![${bug.id}](${bug.evidence.screenshot})`);
        w();
      }
      if (bug.evidence.selector) {
        w(`**Selector:** \`${bug.evidence.selector}\``);
        w();
      }
      if (bug.evidence.consoleErrors.length) {
        w('**Console**');
        w();
        w('```');
        for (const error of bug.evidence.consoleErrors.slice(0, 5)) w(error);
        w('```');
        w();
      }
      if (bug.evidence.networkFailures.length) {
        w('**Failed requests**');
        w();
        for (const failure of bug.evidence.networkFailures.slice(0, 5)) {
          w(`- \`${failure.method} ${failure.url}\` → ${failure.status || ''} ${failure.statusText}`);
        }
        w();
      }
      if (bug.alsoSeenOn.length) {
        w('**Also seen on**');
        w();
        for (const url of bug.alsoSeenOn) w(`- ${url}`);
        w();
      }
      w('---');
      w();
    }
  }

  w('## Coverage');
  w();
  w('### Pages visited');
  w();
  w('| # | Module | URL | Depth | Elements | Actions | Bugs | Reached via |');
  w('| --- | --- | --- | --- | --- | --- | --- | --- |');
  summary.pagesVisited.forEach((page, index) => {
    w(
      `| ${index + 1} | ${escapeMarkdownCell(page.module)} | ${escapeMarkdownCell(page.url)} | ${page.depth} | ${page.elementCount} | ${page.actionsPerformed} | ${page.bugsFound} | ${escapeMarkdownCell(page.reachedVia)} |`,
    );
  });
  w();

  if (summary.scenarios.length) {
    w('### Scenarios explored');
    w();
    w('| Scenario | Outcome | Detail |');
    w('| --- | --- | --- |');
    for (const scenario of summary.scenarios) {
      w(`| ${escapeMarkdownCell(scenario.name)} | ${scenario.outcome} | ${escapeMarkdownCell(scenario.detail)} |`);
    }
    w();
  }

  if (summary.notTested.length) {
    w('### Not tested');
    w();
    w('These were discovered but deliberately or unavoidably left alone. Anything here is a gap in');
    w('the crawl, not a clean bill of health.');
    w();
    w('| Target | Reason |');
    w('| --- | --- |');
    for (const skipped of summary.notTested.slice(0, 120)) {
      w(`| ${escapeMarkdownCell(skipped.url)} | ${escapeMarkdownCell(skipped.reason)} |`);
    }
    if (summary.notTested.length > 120) w(`| … | and ${summary.notTested.length - 120} more |`);
    w();
  }

  if (summary.errors.length) {
    w('### Errors encountered');
    w();
    w('| Where | URL | Message |');
    w('| --- | --- | --- |');
    for (const error of summary.errors.slice(0, 60)) {
      w(`| ${escapeMarkdownCell(error.where)} | ${escapeMarkdownCell(error.url)} | ${escapeMarkdownCell(error.message)} |`);
    }
    w();
  }

  w('## What was checked');
  w();
  w('| Detector | Looks for |');
  w('| --- | --- |');
  const enabled = new Set(summary.configUsed['enabledDetectors'] as string[] | undefined);
  for (const detector of DETECTORS) {
    const mark = enabled.size === 0 || enabled.has(detector.id) ? '' : ' *(disabled)*';
    w(`| \`${detector.id}\`${mark} | ${escapeMarkdownCell(detector.description)} |`);
  }
  w();

  w('## Configuration used');
  w();
  w('```json');
  w(JSON.stringify(summary.configUsed, null, 2));
  w('```');
  w();

  return lines.join('\n');
}

/* ------------------------------------------------------------------ html */

function bugCardHtml(bug: Bug): string {
  const color = SEVERITY_COLOR[bug.severity];
  const evidence = bug.evidence.screenshot
    ? `<a class="shot" href="${escapeHtml(bug.evidence.screenshot)}" target="_blank" rel="noreferrer">
         <img src="${escapeHtml(bug.evidence.screenshot)}" alt="Screenshot for ${escapeHtml(bug.id)}" loading="lazy">
       </a>`
    : '<p class="muted">No screenshot captured.</p>';

  const console = bug.evidence.consoleErrors.length
    ? `<h4>Console</h4><pre>${escapeHtml(bug.evidence.consoleErrors.slice(0, 5).join('\n'))}</pre>`
    : '';

  const network = bug.evidence.networkFailures.length
    ? `<h4>Failed requests</h4><ul>${bug.evidence.networkFailures
        .slice(0, 5)
        .map(
          (failure) =>
            `<li><code>${escapeHtml(failure.method)} ${escapeHtml(failure.url)}</code> → ${failure.status || ''} ${escapeHtml(failure.statusText)}</li>`,
        )
        .join('')}</ul>`
    : '';

  const alsoSeen = bug.alsoSeenOn.length
    ? `<h4>Also seen on</h4><ul>${bug.alsoSeenOn.map((url) => `<li><code>${escapeHtml(url)}</code></li>`).join('')}</ul>`
    : '';

  return `
  <details class="bug" data-severity="${escapeHtml(bug.severity)}" data-category="${escapeHtml(bug.category)}">
    <summary>
      <span class="badge" style="background:${color}">${escapeHtml(bug.severity)}</span>
      <span class="badge prio">${escapeHtml(bug.priority)}</span>
      <span class="id">${escapeHtml(bug.id)}</span>
      <span class="title">${escapeHtml(bug.title)}</span>
      <span class="module">${escapeHtml(bug.module)}</span>
      ${bug.occurrences > 1 ? `<span class="count">${bug.occurrences}×</span>` : ''}
    </summary>
    <div class="body">
      <dl>
        <dt>Category</dt><dd>${escapeHtml(bug.category)}</dd>
        <dt>Module / Page</dt><dd>${escapeHtml(bug.module)}</dd>
        <dt>URL</dt><dd><a href="${escapeHtml(bug.url)}" target="_blank" rel="noreferrer">${escapeHtml(bug.url)}</a></dd>
        <dt>Detector</dt><dd><code>${escapeHtml(bug.detector)}</code></dd>
        ${bug.evidence.selector ? `<dt>Selector</dt><dd><code>${escapeHtml(bug.evidence.selector)}</code></dd>` : ''}
      </dl>
      <h4>Preconditions</h4>
      <ul>${bug.preconditions.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>
      <h4>Steps to reproduce</h4>
      <ol class="steps">${bug.stepsToReproduce
        .map((step) => `<li>${escapeHtml(step.replace(/^\d+\.\s*/, ''))}</li>`)
        .join('')}</ol>
      <h4>Expected result</h4>
      <p>${escapeHtml(bug.expectedResult)}</p>
      <h4>Actual result</h4>
      <p class="actual">${escapeHtml(bug.actualResult)}</p>
      ${console}
      ${network}
      ${alsoSeen}
      <h4>Evidence</h4>
      ${evidence}
    </div>
  </details>`;
}

export function buildHtml(summary: CrawlSummary): string {
  const { totals } = summary;
  const severityCards = (['Critical', 'Major', 'Minor', 'Trivial'] as Severity[])
    .map(
      (severity) => `
      <div class="stat">
        <div class="stat-value" style="color:${SEVERITY_COLOR[severity]}">${totals.bySeverity[severity]}</div>
        <div class="stat-label">${severity}</div>
      </div>`,
    )
    .join('');

  const coverageRows = summary.pagesVisited
    .map(
      (page, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(page.module)}</td>
        <td class="url"><a href="${escapeHtml(page.url)}" target="_blank" rel="noreferrer">${escapeHtml(page.url)}</a></td>
        <td>${page.depth}</td>
        <td>${page.elementCount}</td>
        <td>${page.actionsPerformed}</td>
        <td>${page.bugsFound}</td>
      </tr>`,
    )
    .join('');

  const notTestedRows = summary.notTested
    .slice(0, 150)
    .map(
      (skipped) => `<tr><td class="url">${escapeHtml(skipped.url)}</td><td>${escapeHtml(skipped.reason)}</td></tr>`,
    )
    .join('');

  const scenarioRows = summary.scenarios
    .map(
      (scenario) =>
        `<tr><td>${escapeHtml(scenario.name)}</td><td>${escapeHtml(scenario.outcome)}</td><td>${escapeHtml(scenario.detail)}</td></tr>`,
    )
    .join('');

  const errorRows = summary.errors
    .slice(0, 80)
    .map(
      (error) =>
        `<tr><td>${escapeHtml(error.where)}</td><td class="url">${escapeHtml(error.url)}</td><td>${escapeHtml(error.message)}</td></tr>`,
    )
    .join('');

  const detectorRows = DETECTORS.map(
    (detector) =>
      `<tr><td><code>${escapeHtml(detector.id)}</code></td><td>${escapeHtml(DETECTOR_META[detector.id].category)}</td><td>${escapeHtml(detector.description)}</td></tr>`,
  ).join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Exploratory Crawl — Bug Report</title>
<style>
  :root { color-scheme: light dark; --bg:#f7f7f5; --fg:#1b1b1a; --muted:#6a6a68; --card:#fff; --line:#e2e2de; --accent:#2f5d8a; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#16171a; --fg:#e9e9e6; --muted:#9a9a96; --card:#1f2024; --line:#32343a; --accent:#7fb2e5; }
  }
  * { box-sizing: border-box; }
  body { margin:0; padding:0 16px 64px; background:var(--bg); color:var(--fg);
         font:14px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  .wrap { max-width: 1180px; margin: 0 auto; }
  header { padding: 32px 0 16px; border-bottom: 1px solid var(--line); }
  h1 { margin:0 0 6px; font-size: 26px; letter-spacing:-0.01em; }
  h2 { margin: 36px 0 12px; font-size: 18px; }
  h4 { margin: 18px 0 6px; font-size: 13px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
  .sub { color: var(--muted); font-size: 13px; margin:2px 0; }
  .stats { display:flex; flex-wrap:wrap; gap:12px; margin:20px 0; }
  .stat { flex:1 1 120px; background:var(--card); border:1px solid var(--line); border-radius:10px; padding:14px 16px; }
  .stat-value { font-size:26px; font-weight:650; line-height:1.1; }
  .stat-label { color:var(--muted); font-size:12px; text-transform:uppercase; letter-spacing:.05em; margin-top:2px; }
  .bug { background:var(--card); border:1px solid var(--line); border-radius:10px; margin:10px 0; overflow:hidden; }
  .bug > summary { cursor:pointer; padding:12px 14px; display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
  .bug > summary::-webkit-details-marker { display:none; }
  .badge { color:#fff; font-size:11px; font-weight:650; padding:2px 8px; border-radius:999px; letter-spacing:.03em; }
  .badge.prio { background:var(--accent); }
  .id { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size:12px; color:var(--muted); }
  .title { font-weight:600; flex:1 1 320px; min-width:0; }
  .module { color:var(--muted); font-size:12px; }
  .count { background:var(--line); color:var(--fg); font-size:11px; padding:2px 7px; border-radius:999px; }
  .body { padding: 4px 16px 18px; border-top:1px solid var(--line); }
  dl { display:grid; grid-template-columns: max-content 1fr; gap:4px 16px; margin:14px 0; }
  dt { color:var(--muted); font-size:12px; text-transform:uppercase; letter-spacing:.05em; }
  dd { margin:0; min-width:0; overflow-wrap:anywhere; }
  .actual { background:rgba(179,38,30,.08); border-left:3px solid #b3261e; padding:8px 12px; border-radius:0 6px 6px 0; }
  .steps li { margin: 3px 0; }
  pre { background:var(--bg); border:1px solid var(--line); border-radius:8px; padding:10px 12px; overflow-x:auto; font-size:12px; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size:12px; overflow-wrap:anywhere; }
  .shot img { max-width:100%; border:1px solid var(--line); border-radius:8px; }
  .muted { color:var(--muted); }
  .table-wrap { overflow-x:auto; }
  table { border-collapse:collapse; width:100%; font-size:13px; background:var(--card);
          border:1px solid var(--line); border-radius:10px; }
  th, td { text-align:left; padding:8px 10px; border-bottom:1px solid var(--line); vertical-align:top; }
  th { font-size:11px; text-transform:uppercase; letter-spacing:.05em; color:var(--muted); font-weight:600; }
  tr:last-child td { border-bottom:none; }
  td.url { max-width:420px; overflow-wrap:anywhere; }
  .empty { background:var(--card); border:1px dashed var(--line); border-radius:10px; padding:20px; color:var(--muted); }
  a { color:var(--accent); }
</style>
</head>
<body>
<div class="wrap">
<header>
  <h1>Exploratory Crawl — Bug Report</h1>
  <p class="sub">${escapeHtml(summary.startUrl)}</p>
  <p class="sub">${escapeHtml(summary.startedAt)} → ${escapeHtml(summary.finishedAt)} · ${escapeHtml(summary.durationMs)}</p>
  <p class="sub">Stopped because: ${escapeHtml(summary.stopReason)}</p>
</header>

<div class="stats">
  <div class="stat"><div class="stat-value">${totals.pagesVisited}</div><div class="stat-label">Pages</div></div>
  <div class="stat"><div class="stat-value">${totals.actionsPerformed}</div><div class="stat-label">Actions</div></div>
  <div class="stat"><div class="stat-value">${totals.scenariosExplored}</div><div class="stat-label">Scenarios</div></div>
  <div class="stat"><div class="stat-value">${totals.bugsFound}</div><div class="stat-label">Bugs</div></div>
  ${severityCards}
</div>

<h2>Bugs</h2>
${
  summary.bugs.length === 0
    ? `<div class="empty">No bugs detected on the pages and actions this crawl reached. Read the coverage
       tables below before treating that as a clean bill of health — ${totals.notTested} target(s) were
       not tested.</div>`
    : summary.bugs.map(bugCardHtml).join('')
}

<h2>Pages visited</h2>
<div class="table-wrap"><table>
  <thead><tr><th>#</th><th>Module</th><th>URL</th><th>Depth</th><th>Elements</th><th>Actions</th><th>Bugs</th></tr></thead>
  <tbody>${coverageRows || '<tr><td colspan="7" class="muted">None.</td></tr>'}</tbody>
</table></div>

<h2>Scenarios explored</h2>
<div class="table-wrap"><table>
  <thead><tr><th>Scenario</th><th>Outcome</th><th>Detail</th></tr></thead>
  <tbody>${scenarioRows || '<tr><td colspan="3" class="muted">None recorded.</td></tr>'}</tbody>
</table></div>

<h2>Not tested</h2>
<p class="sub">Discovered but left alone — by a safety rule, a filter, or the crawl budget.</p>
<div class="table-wrap"><table>
  <thead><tr><th>Target</th><th>Reason</th></tr></thead>
  <tbody>${notTestedRows || '<tr><td colspan="2" class="muted">Nothing skipped.</td></tr>'}</tbody>
</table></div>

<h2>Errors encountered</h2>
<div class="table-wrap"><table>
  <thead><tr><th>Where</th><th>URL</th><th>Message</th></tr></thead>
  <tbody>${errorRows || '<tr><td colspan="3" class="muted">No crawl errors.</td></tr>'}</tbody>
</table></div>

<h2>What was checked</h2>
<div class="table-wrap"><table>
  <thead><tr><th>Detector</th><th>Category</th><th>Looks for</th></tr></thead>
  <tbody>${detectorRows}</tbody>
</table></div>

<h2>Configuration used</h2>
<pre>${escapeHtml(JSON.stringify(summary.configUsed, null, 2))}</pre>
</div>
</body>
</html>`;
}

/* ------------------------------------------------------------------ entry point */

/**
 * Writes every output and returns where they landed.
 *
 * A failed write warns rather than throws: the crawl has already happened and its results are in
 * memory, so losing the HTML because the file was open must not also lose the JSON.
 */
export function writeReports(summary: CrawlSummary, outputDir: string): WrittenReports {
  const paths: WrittenReports = {
    json: path.join(outputDir, 'bug-report.json'),
    markdown: path.join(outputDir, 'bug-report.md'),
    html: path.join(outputDir, 'bug-report.html'),
    summaryJson: path.join(outputDir, 'crawl-summary.json'),
  };

  // The bug report carries the bugs and enough run context to trust them; the crawl summary
  // carries everything, including the coverage that says how much the bug list is worth.
  const bugReport = {
    generatedAt: new Date().toISOString(),
    startUrl: summary.startUrl,
    stopReason: summary.stopReason,
    totals: summary.totals,
    configUsed: summary.configUsed,
    bugs: summary.bugs,
  };

  writeFile(paths.json, `${JSON.stringify(bugReport, null, 2)}\n`);
  writeFile(paths.markdown, `${buildMarkdown(summary)}\n`);
  writeFile(paths.html, buildHtml(summary));
  writeFile(paths.summaryJson, `${JSON.stringify(summary, null, 2)}\n`);

  const relative = (file: string) => path.relative(process.cwd(), file).replace(/\\/g, '/');
  Log.info(`[crawler] report written: ${relative(paths.markdown)}`);
  Log.info(`[crawler] report written: ${relative(paths.html)}`);
  Log.info(`[crawler] report written: ${relative(paths.json)}`);
  Log.info(`[crawler] report written: ${relative(paths.summaryJson)}`);

  return paths;
}

/** One-line console verdict, for the end of a CI log. */
export function summaryLine(summary: CrawlSummary): string {
  const { totals } = summary;
  return (
    `[crawler] ${totals.pagesVisited} page(s), ${totals.actionsPerformed} action(s), ` +
    `${totals.bugsFound} bug(s) ` +
    `(${totals.bySeverity.Critical} critical, ${totals.bySeverity.Major} major, ` +
    `${totals.bySeverity.Minor} minor, ${totals.bySeverity.Trivial} trivial) — ${summary.stopReason}`
  );
}
