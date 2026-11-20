/**
 * Script Quality Analyzer — static review of Playwright TypeScript (specs and page objects).
 *
 * Rules (severity):
 *   focused-test         Critical  test.only / describe.only left in
 *   hardcoded-credential Critical  a password, token or API key written as a literal
 *   missing-await        High      a Promise-returning call (action, web-first assertion, page-object method)
 *                                  whose result is dropped — found with the type checker, not by name
 *   no-assertion         High      a test with no expect / verify / assert* call anywhere in it
 *   duplicate-title      High      two tests with the same full title in one file
 *   debug-pause          High      page.pause() left in
 *   hardcoded-wait       Medium    waitForTimeout(), or a setTimeout sleep
 *   empty-catch          Medium    catch {} with nothing in it (Low when a comment explains it)
 *   swallowed-rejection  Low       .catch(() => {}) that silently discards an error
 *   force-action         Low       { force: true } on a click / check / fill
 *   networkidle-wait     Low       waitForLoadState('networkidle')
 *
 * Read-only: it never edits a scanned file.
 */
import * as ts from 'typescript';
import { collectFiles, isSpec, isTs, rel } from '../core/files';
import {
  calleeBody, createProgram, enclosingTest, exprName, findTests, isAssertionCall, isThenable, lineOf, methodName,
  snippetOf, stringValue, walk, type TestBlock,
} from '../core/ts-ast';
import type { Finding, Severity, ToolkitOptions, Utility, UtilityResult } from '../core/types';

const UTILITY = 'script-quality';
const DEFAULT_PATHS = ['tests', 'src/pages'];

const RECOMMEND: Record<string, string> = {
  'focused-test': 'Remove .only before committing — it silently skips every other test in the run.',
  'hardcoded-credential': 'Read it from the environment (.env.local / CI secret) through the existing credential-loader, and rotate the exposed value.',
  'missing-await': 'Add await (or return the promise). A dropped promise lets the test move on before the action or assertion finishes, and its failure is lost.',
  'no-assertion': 'Assert the business outcome of the actions (expect / verify on the value, row, message or URL that proves the step worked).',
  'duplicate-title': 'Give each test a unique title (TC id + scenario); duplicates break reporting and TestRail mapping.',
  'debug-pause': 'Remove page.pause(); it stops headless runs until the timeout.',
  'hardcoded-wait': 'Wait for a condition instead: await expect(locator).toBeVisible(), page.waitForResponse(), or expect.poll().',
  'empty-catch': 'Handle or log the error, or narrow the try to the call that may legitimately fail; an empty catch hides real failures.',
  'swallowed-rejection': 'Keep it only for best-effort clean-up; otherwise log the error (attachNote / Log.warn) or let it fail.',
  'force-action': 'Prefer waiting until the element is actionable; force skips the visibility/enabled checks that catch real UI bugs. Keep it only with a comment on why.',
  'networkidle-wait': 'Wait for the specific response or element the step depends on; networkidle is discouraged and flaky on apps that poll.',
};

const CREDENTIAL_NAME = /(^|[_-]?)(password|passwd|pwd|secret|token|apikey|api_key|clientsecret|client_secret|authtoken|bearer)$/i;
const SECRET_VALUE = /(Bearer\s+[A-Za-z0-9\-_.=]{20,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,})/;
const FORCE_METHODS = new Set(['click', 'dblclick', 'check', 'uncheck', 'fill', 'tap', 'hover', 'selectOption', 'setChecked', 'dragTo']);
/** How many helper levels a test is followed into when looking for its assertions. */
export const HELPER_DEPTH = 3;

/** True when the code asserts something itself or through a helper it calls (followed `depth` levels). */
export function containsAssertion(checker: ts.TypeChecker, node: ts.Node, depth: number, visited: Set<ts.Node>): boolean {
  let found = false;
  walk(node, (n) => {
    if (found || !ts.isCallExpression(n)) return;
    if (isAssertionCall(n)) { found = true; return; }
    if (depth > 0) {
      const body = calleeBody(checker, n);
      if (body && !visited.has(body)) {
        visited.add(body);
        if (containsAssertion(checker, body, depth - 1, visited)) found = true;
      }
    }
  });
  return found;
}

/** A promise whose rejection is handled — `.catch(fn)` or `.then(ok, fail)` — is deliberate fire-and-forget. */
function handlesRejection(call: ts.CallExpression): boolean {
  const m = methodName(call);
  return (m === 'catch' && call.arguments.length >= 1) || (m === 'then' && call.arguments.length >= 2);
}

function mask(line: string): string {
  return line.replace(/(['"`])([^'"`]{4,})\1/g, (_m, q: string, v: string) => `${q}${v.slice(0, 2)}****${q}`);
}

function hasComment(sf: ts.SourceFile, node: ts.Node): boolean {
  return /\/\/|\/\*/.test(node.getText(sf));
}

function propertyName(name: ts.PropertyName | ts.BindingName): string | undefined {
  return ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : undefined;
}

export function analyzeScripts(root: string, files: string[]): { findings: Finding[]; tests: number } {
  const program = createProgram(root, files);
  const checker = program.getTypeChecker();
  const findings: Finding[] = [];
  let testCount = 0;

  for (const abs of files) {
    const sf = program.getSourceFile(abs);
    if (!sf) continue;
    const file = rel(root, abs);
    const tests = isSpec(abs) ? findTests(sf) : [];
    testCount += tests.length;
    const add = (rule: string, severity: Severity, node: ts.Node | undefined, message: string, test?: TestBlock): void => {
      const t = test ?? (node ? enclosingTest(tests, node) : undefined);
      findings.push({
        utility: UTILITY, rule, severity, file, line: node ? lineOf(sf, node) : 0, message,
        recommendation: RECOMMEND[rule] ?? '',
        ...(t ? { test: t.title } : {}),
        ...(node ? { snippet: rule === 'hardcoded-credential' ? mask(snippetOf(sf, node)) : snippetOf(sf, node) } : {}),
      });
    };

    walk(sf, (node) => {
      // Dropped promises: an expression statement whose value is thenable and is not awaited / voided.
      if (ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)) {
        const call = node.expression;
        if (!handlesRejection(call) && isThenable(checker, checker.getTypeAtLocation(call))) {
          add('missing-await', 'High', call, `Promise from ${exprName(call.expression)}() is not awaited.`);
        }
      }

      if (ts.isCallExpression(node)) {
        const name = exprName(node.expression);
        const method = methodName(node);
        if (/^(test|it)\.describe\.only$|^(test|it)\.only$|^test\.describe\.(serial|parallel)\.only$/.test(name)) {
          add('focused-test', 'Critical', node, `${name}() runs this block alone and skips the rest of the suite.`);
        }
        if (method === 'pause' && /page/i.test(name)) add('debug-pause', 'High', node, 'page.pause() left in the script.');
        if (method === 'waitForTimeout') {
          const ms = node.arguments[0]?.getText(sf) ?? '?';
          add('hardcoded-wait', 'Medium', node, `Fixed wait of ${ms} ms.`);
        }
        if (method === 'setTimeout' && ts.isIdentifier(node.expression)
          && node.parent && ts.isArrowFunction(node.parent) && node.parent.parent && ts.isNewExpression(node.parent.parent)) {
          add('hardcoded-wait', 'Medium', node, 'Sleep through new Promise(setTimeout).');
        }
        if (method === 'waitForLoadState' && stringValue(node.arguments[0], sf) === 'networkidle') {
          add('networkidle-wait', 'Low', node, "waitForLoadState('networkidle').");
        }
        if (method && FORCE_METHODS.has(method)) {
          for (const arg of node.arguments) {
            if (ts.isObjectLiteralExpression(arg) && arg.properties.some((p) => ts.isPropertyAssignment(p)
              && propertyName(p.name) === 'force' && p.initializer.kind === ts.SyntaxKind.TrueKeyword)) {
              add('force-action', 'Low', node, `${method}() with { force: true }.`);
            }
          }
        }
        if (method === 'catch' && node.arguments.length === 1) {
          const fn = node.arguments[0]!;
          if ((ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) && ts.isBlock(fn.body) && fn.body.statements.length === 0) {
            add('swallowed-rejection', 'Low', node, 'Rejection discarded by .catch(() => {}).');
          }
        }
        // A literal typed into a password field.
        if (method === 'fill' && /password|passwd|pwd/i.test(node.expression.getText(sf))) {
          const v = stringValue(node.arguments[node.arguments.length - 1], sf);
          if (v) add('hardcoded-credential', 'Critical', node, 'A literal value is typed into a password field.');
        }
      }

      if (ts.isCatchClause(node) && node.block.statements.length === 0) {
        const commented = hasComment(sf, node.block);
        add('empty-catch', commented ? 'Low' : 'Medium', node,
          commented ? 'Empty catch block (a comment explains it).' : 'Empty catch block — any error is swallowed.');
      }

      // Credentials written as literals: const password = '…', { apiKey: '…' }, obj.token = '…'.
      const literalCredential = (name: string | undefined, init: ts.Node | undefined): void => {
        const v = stringValue(init, sf);
        if (name && v && v.trim().length >= 4 && CREDENTIAL_NAME.test(name) && !/^\$\{/.test(v)) {
          add('hardcoded-credential', 'Critical', init, `"${name}" holds a literal value.`);
        }
      };
      if (ts.isVariableDeclaration(node)) literalCredential(propertyName(node.name), node.initializer);
      if (ts.isPropertyAssignment(node)) literalCredential(propertyName(node.name), node.initializer);
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
        && ts.isPropertyAccessExpression(node.left)) literalCredential(node.left.name.text, node.right);
      if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && SECRET_VALUE.test(node.text)) {
        add('hardcoded-credential', 'Critical', node, 'A bearer token or JWT is written in the source.');
      }
    });

    // Test-level rules.
    const seen = new Map<string, number>();
    for (const t of tests) {
      const full = [...t.describes, t.title].join(' › ');
      if (seen.has(full)) {
        add('duplicate-title', 'High', t.call, `Same title as the test on line ${seen.get(full)}: "${t.title}".`, t);
      } else seen.set(full, t.line);

      if (t.modifier === 'skip' || t.modifier === 'fixme') continue;
      if (!containsAssertion(checker, t.body.body, HELPER_DEPTH, new Set())) {
        add('no-assertion', 'High', t.call, 'The test performs steps but asserts nothing (helpers it calls were followed too).', t);
      }
    }
  }
  return { findings, tests: testCount };
}

export const scriptQuality: Utility = {
  name: 'quality',
  title: 'Script Quality Analyzer',
  summary: 'Hardcoded waits, missing awaits, missing assertions, duplicate titles, credentials, empty catches, force actions.',
  async run(options: ToolkitOptions): Promise<UtilityResult> {
    const startedAt = new Date().toISOString();
    const paths = options.paths.length ? options.paths : DEFAULT_PATHS;
    const { files, missing } = collectFiles(options.root, paths, isTs);
    const notes = [`Scope: ${paths.join(', ')}`, ...missing.map((m) => `Path not found, skipped: ${m}`)];
    if (options.dryRun) {
      notes.push(`Dry run: would analyse ${files.length} file(s): ${files.slice(0, 15).map((f) => rel(options.root, f)).join(', ')}${files.length > 15 ? ', …' : ''}`);
      return { utility: UTILITY, title: this.title, startedAt, finishedAt: new Date().toISOString(), dryRun: true,
        scanned: { files: files.length }, findings: [], notes };
    }
    const { findings, tests } = analyzeScripts(options.root, files);
    return {
      utility: UTILITY, title: this.title, startedAt, finishedAt: new Date().toISOString(), dryRun: false,
      scanned: { files: files.length, specs: files.filter(isSpec).length, tests }, findings, notes,
    };
  },
};

export default scriptQuality;
