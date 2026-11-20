/**
 * Locator Validator — finds ambiguous, unstable and invalid locators and recommends user-facing ones.
 *
 * Static (default): every selector passed to locator() / $() / waitForSelector() / page.click(…) in specs and page
 * objects, plus every exported selector constant in src/selectors, is resolved to its text (constants and selector
 * builder functions are followed through the type checker) and checked once, at its definition. Call sites add
 * positional (first/last/nth) and unscoped getByText findings.
 *
 * Live (--live --url <page> --path <selector file>): opens the page with the saved login (.auth/encore-state.json)
 * and counts each selector's matches — none, one, or several. Navigation only: nothing is clicked or typed.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as dotenvFlow from 'dotenv-flow';
import * as ts from 'typescript';
import { collectFiles, isTs, rel } from '../core/files';
import { calleeBody, createProgram, lineOf, methodName, snippetOf, walk } from '../core/ts-ast';
import type { Finding, Severity, ToolkitOptions, Utility, UtilityResult } from '../core/types';
import { checkSelector, isXPath, RECOMMEND, suggestLocator } from './selector-rules';

const UTILITY = 'locators';
const DEFAULT_PATHS = ['tests', 'src/pages', 'src/selectors'];
const STATE_FILE = '.auth/encore-state.json';

/** Methods whose first argument is a selector, per receiver type. */
const PAGE_SELECTOR_METHODS = new Set(['locator', '$', '$$', '$eval', '$$eval', 'waitForSelector', 'frameLocator', 'click', 'dblclick',
  'fill', 'check', 'uncheck', 'hover', 'focus', 'press', 'type', 'selectOption', 'setInputFiles', 'isVisible', 'isHidden',
  'isEnabled', 'isDisabled', 'isChecked', 'textContent', 'innerText', 'inputValue', 'getAttribute']);
const LOCATOR_SELECTOR_METHODS = new Set(['locator', 'frameLocator']);
/** Constant names that are meant to match several elements (rows, options…) — several live matches are expected. */
const LIST_NAME = /(ROWS?|OPTIONS?|ITEMS?|HEADERS?|CELLS?|CHECKBOX(ES)?|TABS?|S)$/;

export interface SelectorEntry {
  text: string;
  file: string;
  line: number;
  snippet: string;
  /** Exported constant name, when the selector is one. */
  name?: string;
  uses: number;
  /** Text with unresolved parts (${…}) — partial checks only, never used live. */
  partial: boolean;
  /** Every use is inside another locator (row.locator('button')), so a generic tag is scoped, not page-wide. */
  scopedOnly?: boolean;
}

function unwrap(e: ts.Expression): ts.Expression {
  while (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e) || ts.isSatisfiesExpression(e)) e = e.expression;
  return e;
}

/** Resolves an expression to selector text, following constants and selector-builder functions. */
export function resolveSelector(
  checker: ts.TypeChecker, input: ts.Expression, depth = 4, onUse?: (decl: ts.Node) => void,
): { text: string; decl: ts.Node } | undefined {
  const e = unwrap(input);
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return { text: e.text, decl: e };
  if (ts.isTemplateExpression(e)) {
    let text = e.head.text;
    for (const span of e.templateSpans) {
      const r = depth > 0 ? resolveSelector(checker, span.expression, depth - 1, onUse) : undefined;
      if (r && r.decl !== span.expression) onUse?.(r.decl); // a constant composed into a larger selector is used
      text += (r?.text ?? '${…}') + span.literal.text;
    }
    return { text, decl: e };
  }
  if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const l = resolveSelector(checker, e.left, depth, onUse);
    const r = resolveSelector(checker, e.right, depth, onUse);
    for (const side of [l, r]) if (side) onUse?.(side.decl);
    return { text: (l?.text ?? '${…}') + (r?.text ?? '${…}'), decl: e };
  }
  // cond ? A : B, A ?? B, A || B — every branch is used; the first that resolves stands for the expression.
  const branches = ts.isConditionalExpression(e) ? [e.whenTrue, e.whenFalse]
    : ts.isBinaryExpression(e) && [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken].includes(e.operatorToken.kind)
      ? [e.left, e.right] : undefined;
  if (branches) {
    const resolved = branches.map((b) => resolveSelector(checker, b, depth, onUse)).filter((r): r is { text: string; decl: ts.Node } => !!r);
    for (const r of resolved) onUse?.(r.decl);
    return resolved[0];
  }
  if (depth <= 0) return undefined;
  if (ts.isCallExpression(e)) {
    const body = calleeBody(checker, e);
    if (!body) return undefined;
    const returned = ts.isBlock(body)
      ? body.statements.find((s): s is ts.ReturnStatement => ts.isReturnStatement(s))?.expression
      : (body as ts.Expression);
    const r = returned ? resolveSelector(checker, returned, depth - 1, onUse) : undefined;
    return r ? { text: r.text, decl: body.parent ?? body } : undefined;
  }
  const target = ts.isPropertyAccessExpression(e) ? e.name : ts.isElementAccessExpression(e) ? e.argumentExpression : e;
  if (!ts.isIdentifier(target) && !ts.isPrivateIdentifier(target) && !ts.isStringLiteral(target)) return undefined;
  let symbol = checker.getSymbolAtLocation(target);
  if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
  const d = symbol?.valueDeclaration ?? symbol?.declarations?.[0];
  if (!d || d.getSourceFile().isDeclarationFile) return undefined;
  const init = ts.isVariableDeclaration(d) || ts.isPropertyAssignment(d) || ts.isPropertyDeclaration(d) ? d.initializer : undefined;
  const r = init ? resolveSelector(checker, init, depth - 1, onUse) : undefined;
  return r ? { text: r.text, decl: d } : undefined;
}

/** The alternatives of cond ? A : B / A ?? B / A || B (nested), or the expression itself. */
function branchesOf(e: ts.Expression): ts.Expression[] {
  const u = unwrap(e);
  if (ts.isConditionalExpression(u)) return [...branchesOf(u.whenTrue), ...branchesOf(u.whenFalse)];
  if (ts.isBinaryExpression(u) && [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken].includes(u.operatorToken.kind)) {
    return [...branchesOf(u.left), ...branchesOf(u.right)];
  }
  return [e];
}

function receiverType(checker: ts.TypeChecker, call: ts.CallExpression): string | undefined {
  return ts.isPropertyAccessExpression(call.expression)
    ? checker.getTypeAtLocation(call.expression.expression).getSymbol()?.getName()
    : undefined;
}

export function analyzeLocators(root: string, files: string[]): { findings: Finding[]; entries: SelectorEntry[]; sites: number } {
  const program = createProgram(root, files);
  const checker = program.getTypeChecker();
  const entries = new Map<ts.Node, SelectorEntry>();
  const findings: Finding[] = [];
  let sites = 0;
  /** Constants composed into other selectors (`${INVALID_MARK}, ${ROW_ALERT}`) — they are used too. */
  const composed = new Set<ts.Node>();
  const onUse = (decl: ts.Node): void => { composed.add(decl); };

  const remember =(decl: ts.Node, text: string, name?: string, scoped?: boolean): void => {
    const existing = entries.get(decl);
    if (existing) {
      existing.uses += 1;
      if (name && !existing.name) existing.name = name; // a use was seen before the definition
      if (scoped !== undefined) existing.scopedOnly = (existing.scopedOnly ?? true) && scoped;
      return;
    }
    const sf = decl.getSourceFile();
    entries.set(decl, { text, file: rel(root, sf.fileName), line: lineOf(sf, decl), snippet: snippetOf(sf, decl), uses: 1,
      partial: text.includes('${…}'), ...(name ? { name } : {}), ...(scoped !== undefined ? { scopedOnly: scoped } : {}) });
  };

  for (const abs of files) {
    const sf = program.getSourceFile(abs);
    if (!sf) continue;
    const file = rel(root, abs);
    const isSelectorFile = file.startsWith('src/selectors/');
    const positional = new Map<string, number[]>();
    const unscoped: number[] = [];

    // Exported selector constants count even when no file in scope uses them.
    if (isSelectorFile) {
      for (const st of sf.statements) {
        if (!ts.isVariableStatement(st) || !st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
        for (const d of st.declarationList.declarations) {
          if (!ts.isIdentifier(d.name) || !d.initializer) continue;
          const init = unwrap(d.initializer);
          const fnBody = ts.isArrowFunction(init) && !ts.isBlock(init.body) ? init.body : undefined;
          const r = resolveSelector(checker, fnBody ?? init, 4, onUse);
          if (r && (fnBody || ts.isStringLiteral(init) || ts.isTemplateExpression(init) || ts.isNoSubstitutionTemplateLiteral(init))) {
            remember(fnBody ? init : d, r.text, d.name.text);
            entries.get(fnBody ? init : d)!.uses -= 1; // a definition is not a use
          }
        }
      }
    }

    walk(sf, (n) => {
      if (!ts.isCallExpression(n)) return;
      const m = methodName(n);
      if (!m) return;
      const recv = receiverType(checker, n);
      const takesSelector = (recv === 'Page' || recv === 'Frame') ? PAGE_SELECTOR_METHODS.has(m)
        : recv === 'Locator' || recv === 'FrameLocator' ? LOCATOR_SELECTOR_METHODS.has(m) : false;
      const arg = n.arguments[0];
      if (takesSelector && arg) {
        // Scoped: called on another locator, or passed as filter({ has / hasNot }) — it matches inside that element.
        const inFilter = !!n.parent && ts.isPropertyAssignment(n.parent) && ts.isIdentifier(n.parent.name) && /^has(Not)?$/.test(n.parent.name.text);
        const scoped = recv === 'Locator' || recv === 'FrameLocator' || inFilter;
        // cond ? A : B — each branch is a selector of its own.
        for (const branch of branchesOf(arg)) {
          const r = resolveSelector(checker, branch, 4, onUse);
          if (r) { sites += 1; remember(r.decl === branch ? n : r.decl, r.text, undefined, scoped); }
        }
      }
      if (recv === 'Locator' && (m === 'first' || m === 'last') && n.arguments.length === 0) {
        positional.set(m, [...(positional.get(m) ?? []), lineOf(sf, n)]);
      }
      if (recv === 'Locator' && m === 'nth') {
        const idx = n.arguments[0];
        if (idx && ts.isNumericLiteral(idx) && Number(idx.text) > 0) {
          findings.push({ utility: UTILITY, rule: 'positional-locator', severity: 'Medium', file, line: lineOf(sf, n),
            message: `nth(${idx.text}) picks an element by position.`, recommendation: RECOMMEND['positional-locator']!, snippet: snippetOf(sf, n) });
        }
      }
      if (recv === 'Page' && m === 'getByText') unscoped.push(lineOf(sf, n));
    });

    for (const [m, lines] of positional) {
      findings.push({ utility: UTILITY, rule: 'positional-locator', severity: 'Low', file, line: lines[0]!,
        message: `${m}() used ${lines.length} time(s) (lines ${lines.slice(0, 12).join(', ')}${lines.length > 12 ? ', …' : ''}); it hides selectors that match several elements.`,
        recommendation: RECOMMEND['positional-locator']! });
    }
    if (unscoped.length) {
      findings.push({ utility: UTILITY, rule: 'unscoped-text', severity: 'Low', file, line: unscoped[0]!,
        message: `page.getByText() searches the whole page ${unscoped.length} time(s) (lines ${unscoped.slice(0, 12).join(', ')}${unscoped.length > 12 ? ', …' : ''}).`,
        recommendation: RECOMMEND['unscoped-text']! });
    }
  }

  for (const decl of composed) {
    const e = entries.get(decl);
    if (e && e.uses <= 0) e.uses = 1;
  }

  for (const entry of entries.values()) {
    for (const issue of checkSelector(entry.text)) {
      if (entry.partial && issue.rule === 'invalid-selector') continue;
      const scoped = issue.rule === 'generic-tag' && entry.scopedOnly === true;
      const suggestion = suggestLocator(entry.text);
      findings.push({
        utility: UTILITY, rule: issue.rule, severity: scoped ? 'Low' : issue.severity, file: entry.file, line: entry.line,
        message: `${issue.message}${scoped ? ' Used only inside a scoped locator.' : ''} Selector: ${entry.text}${entry.uses > 1 ? ` (used ${entry.uses} times)` : ''}`,
        recommendation: `${RECOMMEND[issue.rule] ?? ''}${suggestion ? ` Suggested: ${suggestion}.` : ''}`,
        snippet: entry.snippet,
        ...(entry.name ? { test: `constant ${entry.name}` } : {}),
      });
    }
  }
  return { findings, entries: [...entries.values()], sites };
}

/** Selectors a browser can check on its own: complete text, not relative XPath that needs a context element. */
export function liveCandidates(entries: SelectorEntry[]): SelectorEntry[] {
  return entries.filter((e) => e.name && !e.partial && !/^(xpath=)?\.\//.test(e.text.trim()) && !/^\d/.test(e.text));
}

/** BASE_URL (loaded like playwright.config.ts) and the page to open under it. */
export function liveTarget(root: string, url: string): { base: string; target: string } {
  if (/^[A-Za-z]:[\\/]/.test(url)) {
    throw new Error(`--url "${url}" looks like a file path — Git Bash rewrites a leading "/". Pass it without the slash, e.g. --url locations/1101/commissions/tiers`);
  }
  dotenvFlow.config({ path: root, node_env: process.env.CI_ENV || process.env.NODE_ENV || 'local', silent: true });
  const base = (process.env.BASE_URL || 'https://cloudapps-e2e.encoreglobal.com/navigator/').replace(/\/?$/, '/');
  return { base, target: /^https?:\/\//.test(url) ? url : new URL(url.replace(/^\//, ''), base).href };
}

async function checkLive(root: string, url: string, candidates: SelectorEntry[], notes: string[]): Promise<{ findings: Finding[]; counts: Record<string, number> }> {
  const { base, target } = liveTarget(root, url);
  const statePath = path.join(root, STATE_FILE);
  const counts = { checked: 0, unique: 0, missing: 0, several: 0, invalid: 0 };
  if (!fs.existsSync(statePath)) {
    notes.push(`Live check skipped: ${STATE_FILE} not found — run any test once to sign in.`);
    return { findings: [], counts };
  }
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch();
  const findings: Finding[] = [];
  try {
    const context = await browser.newContext({ storageState: statePath, viewport: { width: 1920, height: 1080 } });
    const page = await context.newPage();
    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.locator('main').first().waitFor({ state: 'visible', timeout: 60_000 }).catch(() => undefined);
    await page.waitForLoadState('load').catch(() => undefined);
    if (new URL(page.url()).host !== new URL(base).host) {
      notes.push(`Live check skipped: ${target} redirected to ${new URL(page.url()).host} — the saved login has expired; run any test once to sign in again.`);
      return { findings: [], counts };
    }
    notes.push(`Live check on ${page.url()} (initial page state only; nothing was clicked).`);
    const absent: SelectorEntry[] = [];
    for (const e of candidates) {
      counts.checked += 1;
      let n: number;
      try {
        n = await page.locator(e.text).count();
      } catch (error) {
        counts.invalid += 1;
        findings.push({ utility: UTILITY, rule: 'invalid-selector', severity: 'High', file: e.file, line: e.line, test: `constant ${e.name}`,
          message: `The browser rejects the selector: ${String(error).split('\n')[0]}. Selector: ${e.text}`,
          recommendation: RECOMMEND['invalid-selector']!, snippet: e.snippet });
        continue;
      }
      if (n === 1) { counts.unique += 1; continue; }
      if (n === 0) { counts.missing += 1; absent.push(e); continue; }
      counts.several += 1;
      // A list selector is meant to match several; one only ever used inside another locator is scoped there.
      if (LIST_NAME.test(e.name ?? '') || e.scopedOnly) continue;
      const severity: Severity = 'Medium';
      const suggestion = suggestLocator(e.text);
      findings.push({ utility: UTILITY, rule: 'ambiguous-live', severity, file: e.file, line: e.line, test: `constant ${e.name}`,
        message: `Matches ${n} elements on the page. Selector: ${e.text}`,
        recommendation: `${RECOMMEND['ambiguous-live']}${suggestion ? ` Suggested: ${suggestion}.` : ''}`, snippet: e.snippet });
    }
    if (absent.length) {
      // One summary: most are dialogs, menus or rows that only appear after an action.
      findings.push({ utility: UTILITY, rule: 'not-on-page', severity: 'Low', file: absent[0]!.file, line: 0,
        message: `${absent.length} selector(s) match nothing on the initial page: ${absent.map((e) => e.name).join(', ')}.`,
        recommendation: RECOMMEND['not-on-page']! });
    }
  } finally {
    await browser.close();
  }
  return { findings, counts };
}

export const locatorValidator: Utility = {
  name: 'locators',
  title: 'Locator Validator',
  summary: 'Unstable, ambiguous and invalid selectors with user-facing replacements; --live counts matches on a page.',
  async run(options: ToolkitOptions): Promise<UtilityResult> {
    const startedAt = new Date().toISOString();
    const paths = options.paths.length ? options.paths : DEFAULT_PATHS;
    const { files, missing } = collectFiles(options.root, paths, isTs);
    const notes = [`Scope: ${paths.join(', ')}`, ...missing.map((m) => `Path not found, skipped: ${m}`)];
    if (options.live && !options.url) throw new Error('--live needs --url <page>, e.g. --url /locations/1101/commissions/tiers');

    if (options.dryRun && !options.live) {
      notes.push(`Dry run: would analyse ${files.length} file(s).`);
      return { utility: UTILITY, title: this.title, startedAt, finishedAt: new Date().toISOString(), dryRun: true, scanned: { files: files.length }, findings: [], notes };
    }
    const { findings, entries, sites } = analyzeLocators(options.root, files);
    const scanned: Record<string, number> = { files: files.length, selectors: entries.length, 'call sites': sites };

    // Unused selector constants — only meaningful when every possible user (tests and page objects) was scanned.
    const fullScope = ['tests', 'src/pages', 'src/selectors'].every((p) => paths.some((q) => q.replace(/\/$/, '') === p));
    if (fullScope) {
      const unused = entries.filter((e) => e.name && e.uses <= 0);
      const byFile = new Map<string, SelectorEntry[]>();
      for (const e of unused) byFile.set(e.file, [...(byFile.get(e.file) ?? []), e]);
      for (const [file, list] of byFile) {
        findings.push({ utility: UTILITY, rule: 'unused-selector', severity: 'Low', file, line: list[0]!.line,
          message: `${list.length} exported selector(s) are not used by any test or page object: ${list.map((e) => e.name).join(', ')}.`,
          recommendation: RECOMMEND['unused-selector']! });
      }
    } else {
      notes.push('Unused-selector check skipped: it needs the full scope (tests, src/pages, src/selectors).');
    }

    if (options.live && options.url) {
      const candidates = liveCandidates(entries.filter((e) => e.file.startsWith('src/selectors/')));
      if (options.dryRun) {
        notes.push(`Dry run: would open ${liveTarget(options.root, options.url).target} (read-only) and count ${candidates.length} selector(s): ${candidates.map((c) => c.name).join(', ')}`);
        return { utility: UTILITY, title: this.title, startedAt, finishedAt: new Date().toISOString(), dryRun: true, scanned: { ...scanned, 'live candidates': candidates.length }, findings: [], notes };
      }
      if (!candidates.length) notes.push('Live check: no complete selector constants in scope — pass --path src/selectors/<module>/<file>.ts.');
      const live = await checkLive(options.root, options.url, candidates, notes);
      findings.push(...live.findings);
      Object.assign(scanned, { 'live checked': live.counts.checked, 'live unique': live.counts.unique,
        'live several': live.counts.several, 'live none': live.counts.missing });
    }
    return { utility: UTILITY, title: this.title, startedAt, finishedAt: new Date().toISOString(), dryRun: false, scanned, findings, notes };
  },
};

export default locatorValidator;

// Re-exported for the self-test.
export { checkSelector, isXPath, suggestLocator };
