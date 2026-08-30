// Annotation-only (Allure `dependsOn`), not a runtime gate — ordering comes from
// `fullyParallel: false`, which keeps each spec's baseline-resetting TC-001 first.
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
