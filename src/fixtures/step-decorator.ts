import { test } from '@playwright/test';
import { reportStep } from './report-steps';

// Tracks active step depth so a decorated method calling another decorated method
// does not produce duplicate nested steps in the Playwright report.
let _depth = 0;

// Wraps an async page-object method in a test.step labelled for the HTML report.
// TC39 decorator form: the signature is (method, context), not (target, key, descriptor).
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
        // Through reportStep so a page-object call made straight from a test body is numbered
        // like any other top-level step, and one made inside a phase() nests under it unnumbered.
        return await reportStep(label, () => originalMethod.apply(this, args));
      } finally {
        _depth--;
      }
    };
  };
}
