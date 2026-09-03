import { test } from '@playwright/test';

// Tracks active step depth so a decorated method calling another decorated method
// does not produce duplicate nested steps in the Playwright report.
let _depth = 0;

/**
 * Method decorator that wraps a public async page-object method in a Playwright
 * test.step, producing a plain-English label in the HTML report.
 *
 * Call with a plain-English label, e.g. @step('Custom label').
 * Uses the modern TC39 decorator form — the signature is (method, context), not
 * (target, propertyKey, descriptor).
 */
export function step(label: string) {
  return function <This, Args extends unknown[], Return>(
    originalMethod: (this: This, ...args: Args) => Promise<Return>,
    _context: ClassMethodDecoratorContext,
  ): (this: This, ...args: Args) => Promise<Return> {
    return async function (this: This, ...args: Args): Promise<Return> {
      // When already inside a step, call the original directly to suppress nesting.
      if (_depth > 0) {
        return originalMethod.apply(this, args);
      }
      // Outside a running test (e.g. worker-scoped auth), test.info() throws — call directly.
      let hasContext = false;
      try { test.info(); hasContext = true; } catch { hasContext = false; }
      if (!hasContext) {
        return originalMethod.apply(this, args);
      }
      _depth++;
      try {
        return await test.step(label, () => originalMethod.apply(this, args));
      } finally {
        _depth--;
      }
    };
  };
}
