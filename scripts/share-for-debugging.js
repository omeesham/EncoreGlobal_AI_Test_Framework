#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const REPO_ROOT = path.resolve(__dirname, '..');
const REPORTS_DIR = path.join(REPO_ROOT, 'reports');

if (!fs.existsSync(REPORTS_DIR)) {
  console.warn('[share-for-debugging] reports/ missing — nothing to bundle.');
  process.exit(0);
}

const ts = new Date().toISOString().replace(/[:.]/g, '-').replace(/Z$/, '');
const outFile = path.join(REPORTS_DIR, `share-for-debugging-${ts}.zip`);

// logs/ lives at REPO_ROOT (sibling of reports/), NOT under reports/logs/.
// Source of the logs/ path: src/utils/logger.ts (hardcoded to <repo>/logs/).
const candidates = [
  { src: path.join(REPORTS_DIR, 'failure-summary.json'), dst: 'failure-summary.json' },
  { src: path.join(REPORTS_DIR, 'test-results.json'),    dst: 'test-results.json' },
  { src: path.join(REPORTS_DIR, 'test-results'),         dst: 'test-results' },
  { src: path.join(REPORTS_DIR, 'diagnostics'),          dst: 'diagnostics' },
  { src: path.join(REPO_ROOT,   'logs'),                 dst: 'logs' },
];

const output = fs.createWriteStream(outFile);
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  console.log(`[share-for-debugging] wrote ${outFile} (${(archive.pointer() / 1024).toFixed(1)} KB)`);
});
archive.on('warning', (err) => { if (err.code !== 'ENOENT') throw err; });
archive.on('error', (err) => { throw err; });
archive.pipe(output);

let included = 0;
for (const { src, dst } of candidates) {
  if (!fs.existsSync(src)) continue;
  if (fs.statSync(src).isDirectory()) archive.directory(src, dst);
  else archive.file(src, { name: dst });
  included++;
}

if (included === 0) {
  console.warn('[share-for-debugging] no candidate artifacts present — empty zip.');
}

archive.finalize();
