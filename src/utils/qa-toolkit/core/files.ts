import * as fs from 'fs';
import * as path from 'path';

const SKIP_DIRS = new Set(['node_modules', '.build', '.git', 'reports', 'logs', 'playwright-report']);

/** Repo-relative path with forward slashes. */
export function rel(root: string, abs: string): string {
  return path.relative(root, abs).split(path.sep).join('/');
}

function walkDir(dir: string, accept: (file: string) => boolean, out: string[]): void {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkDir(full, accept, out);
    else if (accept(full)) out.push(full);
  }
}

/**
 * Collects files under the given repo-relative paths (files or directories). Missing paths are returned
 * separately so the caller can report them instead of silently scanning nothing.
 */
export function collectFiles(
  root: string,
  paths: string[],
  accept: (file: string) => boolean,
): { files: string[]; missing: string[] } {
  const files: string[] = [];
  const missing: string[] = [];
  for (const p of paths) {
    const abs = path.resolve(root, p);
    if (!fs.existsSync(abs)) { missing.push(p); continue; }
    if (fs.statSync(abs).isDirectory()) walkDir(abs, accept, files);
    else if (accept(abs)) files.push(abs);
  }
  return { files: [...new Set(files)].sort(), missing };
}

export const isSpec = (file: string): boolean => file.endsWith('.spec.ts');
export const isTs = (file: string): boolean => file.endsWith('.ts') && !file.endsWith('.d.ts');
