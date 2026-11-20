/**
 * Assertion Validator — judges what each test actually verifies.
 *
 * Rules (severity):
 *   no-business-assertion        High    steps but no assertion anywhere (helpers followed 3 levels)
 *   tautological-assertion       High    expect(<literal>) — it can never fail on application behaviour
 *   matcherless-expect           High    expect(x); with no matcher — nothing is checked
 *   unverified-final-action      Medium  the test's last state-changing step (save, delete, submit, fill…) comes after
 *                                        its last assertion, so its outcome is never checked
 *   weak-assertions-only         Medium  every check is existence/visibility/truthiness — no value, text, count or state
 *   conditional-assertions-only  Medium  every assertion sits under if / ?: / && / catch — the test can pass checking nothing
 *   non-retrying-assertion       Medium  expect(await locator.isVisible()).toBe(…) — a one-off read instead of a web-first
 *                                Low     assertion (Low for text/value/count reads)
 *   cleanup-outside-finally      Low     the last step puts state back (repeats an earlier call, removes what was added,
 *                                        or is commented as restore) but sits outside finally / afterEach
 *
 * Assertions inside helpers count (expectSaveEnabled, verify(…, () => expect…), page-object methods that assert).
 * A helper named like an assertion whose body cannot be read is trusted rather than reported.
 */
import * as ts from 'typescript';
import { collectFiles, isSpec, rel } from '../core/files';
import {
  calleeBody, createProgram, exprName, findTests, isAssertionCall, lineOf, methodName, snippetOf, walk, type TestBlock,
} from '../core/ts-ast';
import type { Finding, Severity, ToolkitOptions, Utility, UtilityResult } from '../core/types';

const UTILITY = 'assertions';
const HELPER_DEPTH = 3;

const RECOMMEND: Record<string, string> = {
  'no-business-assertion': 'Add an assertion on the business outcome of the steps — the saved value, the row in the grid, the message shown or the URL reached.',
  'tautological-assertion': 'Assert on a value read from the application, not on a literal; a literal assertion always passes.',
  'matcherless-expect': 'Finish the assertion with a matcher, e.g. await expect(locator).toHaveText(…).',
  'unverified-final-action': 'After the last state-changing step, assert its result (value saved, row added or removed, message shown), or move clean-up into finally / afterEach.',
  'weak-assertions-only': 'Add at least one assertion on content: toHaveText, toHaveValue, toHaveCount, toHaveURL, toEqual on read data. Visibility alone does not prove the step worked.',
  'conditional-assertions-only': 'Make at least one assertion unconditional, or use test.skip(condition, reason) so the test reports that it did not verify anything.',
  'non-retrying-assertion': 'Use a web-first assertion that retries: await expect(locator).toBeVisible() / toBeEnabled() / toHaveText() / toHaveCount().',
  'cleanup-outside-finally': 'Move the restore into a finally block or afterEach so it runs even when an assertion fails and the shared data is never left changed.',
};

/** Matchers that only show something exists, is visible or is truthy. */
const WEAK_MATCHERS = new Set(['toBeTruthy', 'toBeFalsy', 'toBeDefined', 'toBeUndefined', 'toBeNull', 'toBeNaN',
  'toBeVisible', 'toBeHidden', 'toBeAttached', 'toBeInViewport']);
const STATE_READS = new Set(['isVisible', 'isHidden', 'isEnabled', 'isDisabled', 'isChecked', 'isEditable']);
const VALUE_READS = new Set(['textContent', 'innerText', 'inputValue', 'getAttribute', 'count', 'allTextContents', 'allInnerTexts']);
const PW_ACTIONS = new Set(['click', 'dblclick', 'fill', 'press', 'pressSequentially', 'type', 'check', 'uncheck', 'selectOption',
  'setInputFiles', 'dragTo', 'tap', 'setChecked', 'clear']);
/** Page-object verbs that change application state. Clean-up verbs (close, cancel, discard, restore, purge) are not listed. */
const STATE_CHANGING = /^(save|submit|delete|remove|apply|import|upload|create|add|update|copy|confirm|choose|select|type|enter|toggle|change|tick|set)(?=[A-Z0-9_]|$)(?!Timeout|ViewportSize|ExtraHTTPHeaders|DefaultTimeout)/;
/** Playwright objects whose actions count. */
const PW_RECEIVERS = new Set(['Locator', 'Page', 'Keyboard', 'Mouse', 'FrameLocator', 'ElementHandle', 'Frame']);
/** Keys that only move focus or close something. */
const NEUTRAL_KEYS = /^(Escape|Tab|Shift\+Tab)$/;
/** A final step that puts things back: removes what was added, repeats an earlier call, or is commented as clean-up. */
const UNDO_OF: Record<string, RegExp> = { remove: /^(add|create)/, delete: /^(add|create)/ };
const CLEANUP_COMMENT = /\/\/.*\b(restore|reset|clean ?up|put back|revert|undo)\b/i;
const EXPECT_ROOT = /^expect(\.soft|\.poll)?$/;

interface Assertion {
  /** The call in the test body that is (or leads to) the assertion — used for ordering. */
  anchor: ts.Node;
  matcher?: string;
  conditional: boolean;
  /** Helper named like an assertion whose body could not be read. */
  trusted?: boolean;
}

/** For `expect(x).not.toBe(y)` returns the expect(x) call; undefined when the call is not a matcher call. */
function expectRootOf(call: ts.CallExpression): ts.CallExpression | undefined {
  if (!ts.isPropertyAccessExpression(call.expression)) return undefined;
  let e: ts.Expression = call.expression.expression;
  while (ts.isPropertyAccessExpression(e)) e = e.expression; // .not / .resolves / .rejects
  return ts.isCallExpression(e) && EXPECT_ROOT.test(exprName(e.expression)) ? e : undefined;
}

function isConditionalEdge(parent: ts.Node, child: ts.Node): boolean {
  if (ts.isIfStatement(parent)) return child === parent.thenStatement || child === parent.elseStatement;
  if (ts.isConditionalExpression(parent)) return child === parent.whenTrue || child === parent.whenFalse;
  if (ts.isBinaryExpression(parent)) {
    const op = parent.operatorToken.kind;
    return child === parent.right && (op === ts.SyntaxKind.AmpersandAmpersandToken || op === ts.SyntaxKind.BarBarToken
      || op === ts.SyntaxKind.QuestionQuestionToken);
  }
  return ts.isCatchClause(parent);
}

/** An assertion found inside a helper body, before it is anchored to a call in a test. */
type HelperAssertion = Omit<Assertion, 'anchor'>;

/**
 * Collects the assertions a piece of code makes, itself or through helpers it calls (followed `depth` levels).
 * Each helper body is read once and cached, so every call to the same helper counts — with that call as anchor.
 */
class AssertionCollector {
  private readonly cache = new Map<ts.Node, HelperAssertion[]>();
  private readonly inProgress = new Set<ts.Node>();

  constructor(private readonly checker: ts.TypeChecker) {}

  collect(node: ts.Node, depth: number): Assertion[] {
    const out: Assertion[] = [];
    this.visit(node, depth, false, undefined, out);
    return out;
  }

  private helper(body: ts.Node, depth: number): HelperAssertion[] {
    const cached = this.cache.get(body);
    if (cached) return cached;
    if (this.inProgress.has(body)) return []; // recursion
    this.inProgress.add(body);
    const found: Assertion[] = [];
    this.visit(body, depth, false, body, found);
    this.inProgress.delete(body);
    const result = found.map(({ anchor: _anchor, ...rest }) => rest);
    this.cache.set(body, result);
    return result;
  }

  private visit(n: ts.Node, depth: number, cond: boolean, anchor: ts.Node | undefined, out: Assertion[]): void {
    if (ts.isCallExpression(n)) {
      const here = anchor ?? n;
      if (expectRootOf(n)) {
        out.push({ anchor: here, matcher: methodName(n) ?? '', conditional: cond });
      } else if (!EXPECT_ROOT.test(exprName(n.expression)) && depth > 0) {
        const body = calleeBody(this.checker, n);
        const inner = body ? this.helper(body, depth - 1) : [];
        for (const a of inner) out.push({ ...a, anchor: here, conditional: cond || a.conditional });
        const hasCallback = n.arguments.some((a) => ts.isArrowFunction(a) || ts.isFunctionExpression(a));
        if (!body && !hasCallback && isAssertionCall(n)) out.push({ anchor: here, conditional: cond, trusted: true });
      }
    }
    ts.forEachChild(n, (c) => this.visit(c, depth, cond || isConditionalEdge(n, c), anchor, out));
  }
}

function insideFinallyOrCatch(node: ts.Node, stop: ts.Node): boolean {
  for (let p = node.parent; p && p !== stop; p = p.parent) {
    if (ts.isCatchClause(p)) return true;
    if (p.parent && ts.isTryStatement(p.parent) && p.parent.finallyBlock === p) return true;
  }
  return false;
}

/** Inside a callback passed to an assertion helper (verify('…', async () => { … })) — part of the check. */
function insideAssertionCallback(node: ts.Node, stop: ts.Node): boolean {
  for (let p = node.parent; p && p !== stop; p = p.parent) {
    if ((ts.isArrowFunction(p) || ts.isFunctionExpression(p)) && p.parent && ts.isCallExpression(p.parent)
      && (isAssertionCall(p.parent) || EXPECT_ROOT.test(exprName(p.parent.expression)))) return true;
  }
  return false;
}

function receiverType(checker: ts.TypeChecker, call: ts.CallExpression): string | undefined {
  if (!ts.isPropertyAccessExpression(call.expression)) return undefined;
  return checker.getTypeAtLocation(call.expression.expression).getSymbol()?.getName();
}

function receiverIsLocator(checker: ts.TypeChecker, call: ts.CallExpression): boolean {
  const name = receiverType(checker, call);
  return name === 'Locator' || name === 'Page' || name === 'ElementHandle';
}

/** True for a state-changing step: a Playwright action on a Playwright object, or a page-object verb. */
function isStateChange(checker: ts.TypeChecker, call: ts.CallExpression, sf: ts.SourceFile): boolean {
  const m = methodName(call);
  if (!m || exprName(call.expression).startsWith('test.')) return false;
  if (PW_ACTIONS.has(m)) {
    if (!PW_RECEIVERS.has(receiverType(checker, call) ?? '')) return false;
    const key = call.arguments[0];
    return !(m === 'press' && key && ts.isStringLiteral(key) && NEUTRAL_KEYS.test(key.text)) && sf === call.getSourceFile();
  }
  return STATE_CHANGING.test(m);
}

/** A final step that undoes earlier work rather than doing something new. */
function looksLikeCleanup(sf: ts.SourceFile, action: ts.CallExpression, earlier: ts.CallExpression[]): boolean {
  const m = methodName(action) ?? '';
  const name = exprName(action.expression);
  if (earlier.some((c) => exprName(c.expression) === name)) return true;
  const undo = Object.entries(UNDO_OF).find(([verb]) => m.startsWith(verb))?.[1];
  if (undo && earlier.some((c) => undo.test(methodName(c) ?? ''))) return true;
  const lines = sf.text.split(/\r?\n/);
  const at = lineOf(sf, action) - 1;
  return lines.slice(Math.max(0, at - 4), at + 1).some((l) => CLEANUP_COMMENT.test(l));
}

export function validateAssertions(root: string, files: string[]): { findings: Finding[]; tests: number; assertions: number } {
  const program = createProgram(root, files);
  const checker = program.getTypeChecker();
  const collector = new AssertionCollector(checker);
  const findings: Finding[] = [];
  let tests = 0;
  let assertionCount = 0;

  for (const abs of files) {
    const sf = program.getSourceFile(abs);
    if (!sf) continue;
    const file = rel(root, abs);
    const blocks = findTests(sf);
    tests += blocks.length;
    const add = (rule: string, severity: Severity, node: ts.Node, message: string, t?: TestBlock): void => {
      findings.push({ utility: UTILITY, rule, severity, file, line: lineOf(sf, node), message,
        recommendation: RECOMMEND[rule] ?? '', ...(t ? { test: t.title } : {}), snippet: snippetOf(sf, node) });
    };
    const testOf = (n: ts.Node): TestBlock | undefined =>
      blocks.find((t) => n.getStart() >= t.body.getStart() && n.getEnd() <= t.body.getEnd());

    // File-wide: literal subjects, missing matchers, one-off state reads.
    walk(sf, (n) => {
      if (ts.isExpressionStatement(n)) {
        const e = ts.isAwaitExpression(n.expression) ? n.expression.expression : n.expression;
        if (ts.isCallExpression(e) && EXPECT_ROOT.test(exprName(e.expression))) {
          add('matcherless-expect', 'High', e, 'expect(…) is called without a matcher, so nothing is checked.', testOf(e));
        }
      }
      if (!ts.isCallExpression(n)) return;
      const rootCall = expectRootOf(n);
      const subject = rootCall?.arguments[0];
      if (!rootCall || !subject) return;
      if (ts.isLiteralExpression(subject) || subject.kind === ts.SyntaxKind.TrueKeyword || subject.kind === ts.SyntaxKind.FalseKeyword
        || subject.kind === ts.SyntaxKind.NullKeyword) {
        add('tautological-assertion', 'High', n, `expect(${subject.getText(sf)}) asserts a literal.`, testOf(n));
      }
      const read = ts.isAwaitExpression(subject) && ts.isCallExpression(subject.expression) ? subject.expression : undefined;
      const readName = read ? methodName(read) : undefined;
      if (read && readName && receiverIsLocator(checker, read)) {
        if (STATE_READS.has(readName)) {
          add('non-retrying-assertion', 'Medium', n, `${readName}() is read once and then asserted; it does not wait for the state.`, testOf(n));
        } else if (VALUE_READS.has(readName)) {
          add('non-retrying-assertion', 'Low', n, `${readName}() is read once and then asserted; a web-first matcher would retry.`, testOf(n));
        }
      }
    });

    // Per test: what it verifies, and whether its last action is verified.
    for (const t of blocks) {
      if (t.modifier === 'skip' || t.modifier === 'fixme') continue;
      const found = collector.collect(t.body.body, HELPER_DEPTH);
      assertionCount += found.length;

      if (found.length === 0) {
        add('no-business-assertion', 'High', t.call, 'No assertion in the test or in any helper it calls.', t);
        continue;
      }
      if (found.every((a) => a.conditional)) {
        add('conditional-assertions-only', 'Medium', t.call, `All ${found.length} assertion(s) run only on a conditional path.`, t);
      }
      const known = found.filter((a) => !a.trusted && a.matcher);
      if (known.length === found.length && known.every((a) => WEAK_MATCHERS.has(a.matcher!))) {
        const used = [...new Set(known.map((a) => a.matcher))].join(', ');
        // A test whose subject IS visibility (show/hide/collapse…) is rightly checked by visibility: Low, not Medium.
        const aboutVisibility = /\b(visib\w*|show\w*|hid(e|es|den)|collaps\w*|expand\w*|display\w*|appear\w*|offer\w*)\b/i.test(t.title);
        add('weak-assertions-only', aboutVisibility ? 'Low' : 'Medium', t.call,
          `Only existence/visibility checks (${used}); no value, text, count or state is verified${aboutVisibility ? ' (the test is about visibility, so this may be enough)' : ''}.`, t);
      }

      const actions: ts.CallExpression[] = [];
      walk(t.body.body, (n) => {
        if (!ts.isCallExpression(n) || !isStateChange(checker, n, sf)) return;
        if (isAssertionCall(n) || insideFinallyOrCatch(n, t.body) || insideAssertionCallback(n, t.body)) return;
        actions.push(n);
      });
      actions.sort((a, b) => a.getStart() - b.getStart());
      const lastAction = actions[actions.length - 1];
      const lastAssertion = Math.max(...found.map((a) => a.anchor.getEnd()));
      if (lastAction && lastAction.getStart() > lastAssertion) {
        const name = exprName(lastAction.expression);
        if (looksLikeCleanup(sf, lastAction, actions.slice(0, -1))) {
          add('cleanup-outside-finally', 'Low', lastAction,
            `${name}() puts state back after the last assertion; if an assertion fails, this clean-up never runs.`, t);
        } else {
          add('unverified-final-action', 'Medium', lastAction,
            `${name}() is the last state-changing step and nothing is asserted after it.`, t);
        }
      }
    }
  }
  return { findings, tests, assertions: assertionCount };
}

export const assertionValidator: Utility = {
  name: 'assertions',
  title: 'Assertion Validator',
  summary: 'Tests with no business assertion, weak or literal assertions, unverified final actions, one-off reads.',
  async run(options: ToolkitOptions): Promise<UtilityResult> {
    const startedAt = new Date().toISOString();
    const paths = options.paths.length ? options.paths : ['tests'];
    const { files, missing } = collectFiles(options.root, paths, isSpec);
    const notes = [`Scope: ${paths.join(', ')} (spec files)`, ...missing.map((m) => `Path not found, skipped: ${m}`)];
    if (options.dryRun) {
      notes.push(`Dry run: would validate ${files.length} spec(s): ${files.slice(0, 15).map((f) => rel(options.root, f)).join(', ')}${files.length > 15 ? ', …' : ''}`);
      return { utility: UTILITY, title: this.title, startedAt, finishedAt: new Date().toISOString(), dryRun: true,
        scanned: { specs: files.length }, findings: [], notes };
    }
    const { findings, tests, assertions } = validateAssertions(options.root, files);
    return { utility: UTILITY, title: this.title, startedAt, finishedAt: new Date().toISOString(), dryRun: false,
      scanned: { specs: files.length, tests, assertions }, findings, notes };
  },
};

export default assertionValidator;
