/**
 * DO NOT DELETE: per-test baseline-reset gate (annotation form).
 *
 * Several Encore specs follow a "TC-001 resets baseline -> TC-002+ tests
 * variations" pattern (Location Settings tabs, History views). Without
 * this ordering discipline, Playwright's default parallel ordering
 * would run TC-002+ against whatever state the previous run left behind,
 * producing random intermittent failures that look like product bugs.
 *
 * This module pairs with `fullyParallel: false` in playwright.config.ts to
 * keep TC-001 first inside each spec file. `dependencyGate(['TC-...'])`
 * itself is now annotation-only (Allure `dependsOn`), not a runtime gate;
 * per-test navigation guards in each spec (test.beforeEach) handle the
 * retry-recycle cascade that previously motivated the disk-backed registry.
 *
 * If removing: first prove every spec is stateless. Start with
 * location-management-history.spec.ts and location-currency.spec.ts
 * (both observed to fail without the gate).
 */
import { test as base } from '@playwright/test';

const DEP_ANNOTATION = 'dependsOn';

type Fixture = { dependencyGate: (deps: string[]) => void };

export const dependencyGateExt = base.extend<Fixture>({
  dependencyGate: async ({}, use, testInfo) => {
    await use((deps: string[]) => {
      for (const dep of deps) {
        testInfo.annotations.push({ type: DEP_ANNOTATION, description: dep });
      }
    });
  },
});
