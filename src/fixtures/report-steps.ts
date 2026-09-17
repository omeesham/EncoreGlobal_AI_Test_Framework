import { test } from '@playwright/test';
import { Log } from '../utils/logger';

/**
 * Spec-level step helpers — the companion to the `@step` decorator in step-decorator.ts.
 *
 * The decorator already names every page-object call in the HTML report, so the report has
 * never been short of detail; what it lacked was SHAPE. A test that runs a search, opens a
 * dialog and reads four fields back arrives as a flat run of a dozen equally-weighted lines,
 * and a reader has to reconstruct which of them belonged to the arrange and which to the
 * actual check. `phase()` and `verify()` group those lines under the business step they serve,
 * so the report reads as the test case reads and the decorated calls nest underneath.
 *
 * BOTH HELPERS RETURN THE BODY'S VALUE. That is the point of having them rather than reaching
 * for `test.step` directly: a spec keeps its `const` declarations at test scope —
 *
 *   const tabs = await phase('Read the dialog tabs', () => pc.readDialogTabs());
 *
 * — instead of being restructured so later code can see a value declared inside a closure.
 * Grouping a test into phases therefore never moves its assertions or its data flow around,
 * which is what keeps the grouping a reporting change and nothing more.
 *
 * Both helpers NUMBER the step they create — "Step 1: Open the Add Product Code form" — counting
 * in call order within each test. Pass the business-readable phrase only; the number is added for
 * you, so inserting or reordering a step never means renumbering the ones around it.
 */

/** Runs `body` outside any step when there is no test context (worker fixtures, setup helpers). */
function inTestContext(): boolean {
  try {
    test.info();
    return true;
  } catch {
    return false;
  }
}

/**
 * Per-test step counter, keyed on the test's own info object: isolated per test and per retry
 * with no reset to forget, and nothing left behind when the test ends.
 */
const sequences = new WeakMap<object, { n: number }>();

/** Depth of currently-open named steps, so only the outermost one takes a number. */
let namedDepth = 0;

/**
 * Whether a hook body is currently running. Steps still report from inside a `beforeEach` — they
 * just take no number, so setup never spends "Step 1" and a test body always starts at Step 1.
 *
 * Playwright 1.60 exposes no supported signal for this. `TestInfo` carries nothing, and wrapping
 * the hook registrars is not an option either: the runner parses a hook function's FIRST PARAMETER
 * to learn which fixtures it needs, so any wrapper that does not reproduce the original
 * destructuring pattern is rejected outright ("First argument must use the object destructuring
 * pattern") — and reproducing it generically would mean spreading the fixture object, which
 * eagerly instantiates every fixture in the suite.
 *
 * So this reads the runner's own step tree, whose shape was confirmed against 1.60: the root list
 * ends with the open `hook`-category step ("Before Hooks" / "After Hooks") for as long as a hook is
 * running, and that step gains an `endWallTime` the moment it finishes. A private field, hence the
 * try/catch: if a future version reshapes it, this reports "not in a hook" and the only consequence
 * is that setup steps start taking numbers again — cosmetic, never a failure.
 */
function inHook(): boolean {
  try {
    const steps = (test.info() as unknown as { _steps?: Array<{ category?: string; endWallTime?: number }> })._steps;
    const last = steps?.[steps.length - 1];
    return !!last && last.category === 'hook' && last.endWallTime === undefined;
  } catch {
    return false;
  }
}

/**
 * The one place a spec-level step is created. Numbers the step when it is the outermost one —
 * "Step 1: ...", "Step 2: ..." in call order — and leaves nested ones unnumbered, so a phase's
 * children read as the detail of that step rather than as steps of their own.
 *
 * The `@step` decorator routes through here too, so a page-object call made directly from a test
 * body is numbered exactly like a `phase()` is — every spec in the suite gets a numbered run
 * without being rewritten. Hook bodies are excluded (see `hookDepth`), so setup never takes a
 * number and a test body always starts at Step 1.
 *
 * A converted spec still reads better: `phase()` groups several actions under one business name
 * and `verify()` names an assertion cluster that would otherwise reach the report as a bare
 * `expect`. Numbering works either way — conversion buys naming, not numbering.
 */
export async function reportStep<T>(
  label: string,
  body: () => Promise<T>,
  options?: { box?: boolean },
): Promise<T> {
  if (!inTestContext()) return body();
  let title = label;
  if (namedDepth === 0 && !inHook()) {
    const info = test.info();
    let seq = sequences.get(info);
    if (!seq) {
      seq = { n: 0 };
      sequences.set(info, seq);
    }
    seq.n += 1;
    title = `Step ${seq.n}: ${label}`;
  }
  namedDepth += 1;
  try {
    return await test.step(title, body, options);
  } finally {
    namedDepth -= 1;
  }
}

/**
 * Groups the actions of one business step under a named, collapsible entry in the report.
 *
 * Use it for the arrange/act phases of a test — "Open the Add Product Code form", "Save the
 * new product code". The page-object steps each phase performs nest underneath it.
 */
export async function phase<T>(name: string, body: () => Promise<T>): Promise<T> {
  return reportStep(name, body);
}

/**
 * Groups one verification under a named entry in the report.
 *
 * Boxed: a failing assertion inside is reported against the `verify(...)` call in the spec
 * rather than against a line inside Playwright's expect internals, so the report's error
 * detail points at the check that failed by its business name.
 */
export async function verify<T>(name: string, body: () => Promise<T>): Promise<T> {
  return reportStep(name, body, { box: true });
}

/**
 * Opens a test with a plain-language statement of what it checks.
 *
 * Call it as the FIRST line of the test body. The summary becomes the step title verbatim —
 * "Step 1: Leaving the History tab for Basic Information and coming back shows the same list
 * again" — so a reader gets the point of the test from the step name itself, with no generic
 * "About this test" label to read past. The body writes the same sentence to the console and to
 * `logs/<spec>/test-execution.log`, so a terminal run and the saved log read the same way the
 * report does.
 *
 * Because the summary IS the step title, write it as a self-contained sentence someone who has
 * never opened the app can act on: say what the user is doing and what ought to happen, not which
 * locator or endpoint is involved.
 */
export async function about(summary: string): Promise<void> {
  if (!inTestContext()) {
    Log.info(summary);
    return;
  }
  await reportStep(summary, async () => {
    Log.info(`[test] ${test.info().title}`);
    Log.info(`[test] ${summary}`);
  });
}

/**
 * Attaches a named piece of context to the current test's report entry — a computed value, a
 * generated record id, the reason a case took the branch it did. Shows up under the test's
 * Attachments in the HTML report, which is where a reader looks when a step name alone does
 * not explain what the run actually did.
 */
export async function attachNote(name: string, body: string): Promise<void> {
  if (!inTestContext()) return;
  await test.info().attach(name, { body, contentType: 'text/plain' });
}
