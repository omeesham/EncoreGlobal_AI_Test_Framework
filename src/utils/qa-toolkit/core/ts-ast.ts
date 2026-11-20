/**
 * TypeScript-compiler helpers. The toolkit reads specs with the compiler's own parser (and, where a rule needs
 * types, its checker) rather than with regular expressions, so formatting, comments and strings never fool it.
 * `typescript` is already a dev dependency of the framework.
 */
import * as path from 'path';
import * as ts from 'typescript';

/** A Program over the given files, with the repo's tsconfig options (imports resolved, nothing emitted). */
export function createProgram(root: string, files: string[]): ts.Program {
  const configPath = path.join(root, 'tsconfig.json');
  const read = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(read.config ?? {}, ts.sys, root);
  return ts.createProgram({ rootNames: files, options: { ...parsed.options, noEmit: true } });
}

export function lineOf(sf: ts.SourceFile, node: ts.Node): number {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

/** The source line a node starts on, trimmed and cut to a readable length. */
export function snippetOf(sf: ts.SourceFile, node: ts.Node, max = 160): string {
  const line = sf.text.split(/\r?\n/)[lineOf(sf, node) - 1] ?? '';
  const t = line.trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export function walk(node: ts.Node, visit: (n: ts.Node) => void): void {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}

/** Dotted name of an expression: `page.locator(x).click` → "page.locator().click". */
export function exprName(e: ts.Expression): string {
  if (ts.isIdentifier(e)) return e.text;
  if (ts.isPropertyAccessExpression(e)) return `${exprName(e.expression)}.${e.name.text}`;
  if (ts.isCallExpression(e)) return `${exprName(e.expression)}()`;
  if (ts.isElementAccessExpression(e)) return `${exprName(e.expression)}[]`;
  if (ts.isNonNullExpression(e) || ts.isParenthesizedExpression(e) || ts.isAwaitExpression(e)) return exprName(e.expression);
  if (e.kind === ts.SyntaxKind.ThisKeyword) return 'this';
  return '?';
}

/** The called method's own name: `a.b.click()` → "click", `expect(x)` → "expect". */
export function methodName(call: ts.CallExpression): string | undefined {
  const e = call.expression;
  if (ts.isPropertyAccessExpression(e)) return e.name.text;
  if (ts.isIdentifier(e)) return e.text;
  return undefined;
}

/** Text of a string-like literal; a template with substitutions comes back as its source (`${id}: …`). */
export function stringValue(node: ts.Node | undefined, sf: ts.SourceFile): string | undefined {
  if (!node) return undefined;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) return node.getText(sf).slice(1, -1);
  return undefined;
}

export interface TestBlock {
  title: string;
  /** describe titles from the outside in. */
  describes: string[];
  line: number;
  /** "only", "skip", "fixme", "fail" or "slow" when the test is declared through one. */
  modifier?: string;
  call: ts.CallExpression;
  /** The test function. */
  body: ts.ArrowFunction | ts.FunctionExpression;
}

const DESCRIBE = /^test\.describe(\.(only|skip|fixme|serial|parallel))*$/;
const TEST = /^(test|it)(\.(only|skip|fixme|fail|slow))?$/;

function testFunction(call: ts.CallExpression): ts.ArrowFunction | ts.FunctionExpression | undefined {
  return call.arguments.find((a): a is ts.ArrowFunction | ts.FunctionExpression =>
    ts.isArrowFunction(a) || ts.isFunctionExpression(a));
}

/** Every test() declared in a file, with its describe path. Hooks, steps and conditional skips are not tests. */
export function findTests(sf: ts.SourceFile): TestBlock[] {
  const tests: TestBlock[] = [];
  const visit = (node: ts.Node, describes: string[]): void => {
    if (ts.isCallExpression(node)) {
      const name = exprName(node.expression);
      const title = stringValue(node.arguments[0], sf);
      const fn = testFunction(node);
      if (title !== undefined && fn && DESCRIBE.test(name)) {
        ts.forEachChild(fn.body, (child) => visit(child, [...describes, title]));
        return;
      }
      if (title !== undefined && fn && TEST.test(name)) {
        const modifier = name.includes('.') ? name.split('.')[1] : undefined;
        tests.push({ title, describes, line: lineOf(sf, node), call: node, body: fn, ...(modifier ? { modifier } : {}) });
        return;
      }
    }
    ts.forEachChild(node, (child) => visit(child, describes));
  };
  visit(sf, []);
  return tests;
}

/** The innermost test a node sits in, if any. */
export function enclosingTest(tests: TestBlock[], node: ts.Node): TestBlock | undefined {
  const pos = node.getStart();
  return tests.find((t) => pos >= t.body.getStart() && pos <= t.body.getEnd());
}

/** The body of the function or method a call resolves to (through the type checker), when it is source code. */
export function calleeBody(checker: ts.TypeChecker, call: ts.CallExpression): ts.Node | undefined {
  const target = ts.isPropertyAccessExpression(call.expression) ? call.expression.name : call.expression;
  let symbol = checker.getSymbolAtLocation(target);
  if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
  for (const d of symbol?.declarations ?? []) {
    if (d.getSourceFile().isDeclarationFile) continue;
    if ((ts.isFunctionDeclaration(d) || ts.isMethodDeclaration(d)) && d.body) return d.body;
    if (ts.isVariableDeclaration(d) && d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))) {
      return d.initializer.body;
    }
  }
  return undefined;
}

/** Assertion calls, including the team's own helpers (expectSaveEnabled, verifyRow, assertToast…). */
export const ASSERTION_CALL = /^(expect\w*|assert\w*|verify\w*|validate\w*|should\w*|check[A-Z]\w*)$/;

export function isAssertionCall(call: ts.CallExpression): boolean {
  const m = methodName(call);
  const head = exprName(call.expression).split('.')[0] ?? '';
  return (!!m && ASSERTION_CALL.test(m)) || ASSERTION_CALL.test(head);
}

/** True when the type (or any member of a union) is a Promise / thenable. */
export function isThenable(checker: ts.TypeChecker, type: ts.Type): boolean {
  const parts = type.isUnion() ? type.types : [type];
  return parts.some((t) => !!checker.getPropertyOfType(t, 'then'));
}
