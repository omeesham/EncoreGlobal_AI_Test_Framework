/**
 * Writes a utility's result as reports/qa-toolkit/<utility>/report.json and report.html. The HTML is one
 * self-contained file (no external assets), readable offline and attachable to a ticket.
 */
import * as fs from 'fs';
import * as path from 'path';
import { SEVERITIES, countBySeverity, sortFindings } from './severity';
import type { Finding, UtilityResult } from './types';

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const STYLE = `
:root{--bg:#f7f7f8;--card:#fff;--text:#1d1d22;--muted:#5f6170;--line:#e3e3e8;--crit:#b3261e;--high:#c2410c;--med:#a16207;--low:#2563eb;--ok:#15803d}
@media (prefers-color-scheme:dark){:root{--bg:#141417;--card:#1d1d22;--text:#ececf1;--muted:#a0a2b0;--line:#33343c;--crit:#f2827a;--high:#fb923c;--med:#facc15;--low:#7aa7ff;--ok:#4ade80}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1200px;margin:0 auto;padding:24px 16px}h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:28px 0 8px}
.meta{color:var(--muted);font-size:13px}.cards{display:flex;flex-wrap:wrap;gap:12px;margin:16px 0}
.card{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:12px 16px;min-width:120px}
.card b{display:block;font-size:22px}.card span{color:var(--muted);font-size:12px}
.sev{display:inline-block;padding:1px 8px;border-radius:10px;font-size:12px;font-weight:600;color:#fff}
.Critical{background:var(--crit)}.High{background:var(--high)}.Medium{background:var(--med)}.Low{background:var(--low)}
.card .sev{color:#fff;font-size:12px}
@media (prefers-color-scheme:dark){.sev,.card .sev{color:#141417}}
.filters button{background:var(--card);color:var(--text);border:1px solid var(--line);border-radius:6px;padding:4px 10px;margin:0 6px 6px 0;cursor:pointer}
.filters button.on{border-color:var(--text)}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:8px;overflow:hidden}
th,td{text-align:left;vertical-align:top;padding:8px 10px;border-bottom:1px solid var(--line)}th{font-size:12px;color:var(--muted);font-weight:600}
td code{font-size:12px;word-break:break-word}.wrap{overflow-x:auto}.notes li{margin:2px 0}.none{color:var(--ok)}
a{color:var(--low)}a:hover{text-decoration:none}
`;

function findingsTable(findings: Finding[]): string {
  const byFile = new Map<string, Finding[]>();
  for (const f of sortFindings(findings)) {
    if (!byFile.has(f.file)) byFile.set(f.file, []);
    byFile.get(f.file)!.push(f);
  }
  return [...byFile.entries()].map(([file, list]) => `
<h2>${esc(file)} <span class="meta">(${list.length})</span></h2>
<div class="wrap"><table><thead><tr><th>Severity</th><th>Line</th><th>Rule</th><th>Finding</th><th>Recommendation</th></tr></thead><tbody>
${list.map((f) => `<tr data-sev="${f.severity}"><td><span class="sev ${f.severity}">${f.severity}</span></td><td>${f.line || '—'}</td>
<td><code>${esc(f.rule)}</code></td><td>${esc(f.message)}${f.test ? `<div class="meta">Test: ${esc(f.test)}</div>` : ''}${f.snippet ? `<div><code>${esc(f.snippet)}</code></div>` : ''}</td>
<td>${esc(f.recommendation)}</td></tr>`).join('')}
</tbody></table></div>`).join('');
}

export function renderHtml(result: UtilityResult): string {
  const counts = countBySeverity(result.findings);
  const scanned = Object.entries(result.scanned).map(([k, v]) => `<div class="card"><b>${v}</b><span>${esc(k)}</span></div>`).join('');
  const sevCards = SEVERITIES.map((s) => `<div class="card"><b>${counts[s]}</b><span class="sev ${s}">${s}</span></div>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(result.title)}</title><style>${STYLE}</style></head><body><main>
<h1>${esc(result.title)}</h1>
<div class="meta">Started ${esc(result.startedAt)} · finished ${esc(result.finishedAt)}${result.dryRun ? ' · DRY RUN' : ''}</div>
<div class="cards">${scanned}${sevCards}</div>
${result.notes.length ? `<ul class="notes meta">${result.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
${result.findings.length ? `<div class="filters">${['All', ...SEVERITIES].map((s) => `<button data-f="${s}"${s === 'All' ? ' class="on"' : ''}>${s}</button>`).join('')}</div>${findingsTable(result.findings)}`
    : '<p class="none">No findings.</p>'}
${result.table ? `<h2>${esc(result.table.title)}</h2><div class="wrap"><table><thead><tr>${result.table.columns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>
${result.table.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : ''}
</main><script>
document.querySelectorAll('.filters button').forEach(function(b){b.addEventListener('click',function(){
document.querySelectorAll('.filters button').forEach(function(x){x.classList.toggle('on',x===b)});
var f=b.getAttribute('data-f');document.querySelectorAll('tr[data-sev]').forEach(function(r){r.style.display=(f==='All'||r.getAttribute('data-sev')===f)?'':'none'});});});
</script></body></html>`;
}

/** The consolidated page: one row per utility with its counts and a link to its report, then every Critical/High. */
export function writeSummary(root: string, outDir: string, results: UtilityResult[], startedAt: string): { json: string; html: string } {
  const dir = path.join(root, outDir);
  fs.mkdirSync(dir, { recursive: true });
  const all = results.flatMap((r) => r.findings);
  const totals = countBySeverity(all);
  const finishedAt = new Date().toISOString();
  const rows = results.map((r) => {
    const c = countBySeverity(r.findings);
    const scanned = Object.entries(r.scanned).map(([k, v]) => `${v} ${k}`).join(', ');
    return `<tr><td><a href="${r.utility}/report.html">${esc(r.title)}</a></td>${SEVERITIES.map((s) => `<td>${c[s] ? `<span class="sev ${s}">${c[s]}</span>` : '0'}</td>`).join('')}<td class="meta">${esc(scanned)}</td></tr>`;
  }).join('');
  const top = sortFindings(all).filter((f) => f.severity === 'Critical' || f.severity === 'High');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>QA Validation Summary</title><style>${STYLE}</style></head><body><main>
<h1>QA Validation Summary</h1>
<div class="meta">Started ${esc(startedAt)} · finished ${esc(finishedAt)} · ${results.length} utilities</div>
<div class="cards">${SEVERITIES.map((s) => `<div class="card"><b>${totals[s]}</b><span class="sev ${s}">${s}</span></div>`).join('')}</div>
<div class="wrap"><table><thead><tr><th>Utility</th>${SEVERITIES.map((s) => `<th>${s}</th>`).join('')}<th>Scanned</th></tr></thead><tbody>${rows}</tbody></table></div>
<h2>Critical and High findings (${top.length})</h2>
${top.length ? `<div class="wrap"><table><thead><tr><th>Severity</th><th>Utility</th><th>Where</th><th>Finding</th><th>Recommendation</th></tr></thead><tbody>
${top.map((f) => `<tr><td><span class="sev ${f.severity}">${f.severity}</span></td><td>${esc(f.utility)}</td><td><code>${esc(f.file)}${f.line ? `:${f.line}` : ''}</code>${f.test ? `<div class="meta">${esc(f.test)}</div>` : ''}</td><td>${esc(f.message)}</td><td>${esc(f.recommendation)}</td></tr>`).join('')}
</tbody></table></div>` : '<p class="none">None.</p>'}
</main></body></html>`;
  const json = path.join(dir, 'summary.json');
  const htmlPath = path.join(dir, 'summary.html');
  fs.writeFileSync(json, `${JSON.stringify({ startedAt, finishedAt, totals,
    utilities: results.map((r) => ({ utility: r.utility, title: r.title, scanned: r.scanned, summary: countBySeverity(r.findings), report: `${r.utility}/report.html` })),
    criticalAndHigh: top }, null, 2)}\n`, 'utf8');
  fs.writeFileSync(htmlPath, html, 'utf8');
  return { json, html: htmlPath };
}

/** Writes JSON + HTML; returns their paths. */
export function writeReport(root: string, outDir: string, result: UtilityResult): { json: string; html: string } {
  const dir = path.join(root, outDir, result.utility);
  fs.mkdirSync(dir, { recursive: true });
  const json = path.join(dir, 'report.json');
  const html = path.join(dir, 'report.html');
  const ordered = { ...result, summary: countBySeverity(result.findings), findings: sortFindings(result.findings) };
  fs.writeFileSync(json, `${JSON.stringify(ordered, null, 2)}\n`, 'utf8');
  fs.writeFileSync(html, renderHtml(result), 'utf8');
  return { json, html };
}
