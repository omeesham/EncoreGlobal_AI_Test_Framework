/**
 * SELF-TEST FIXTURE — deliberately bad code for `cli.ts self-test`. Every rule of the Script Quality Analyzer
 * should fire on it. It lives outside tests/, so Playwright never runs it, and the credentials are fake.
 */
import { test, expect, type Page } from '@playwright/test';

const fixturePassword = 'FakeP4ss!'; // hardcoded-credential (fake)

async function openPage(page: Page): Promise<void> {
  await page.goto('/');
}

test.describe('Self-test sample', () => {
  test.only('SAMPLE-001: focused test with a missing await', async ({ page }) => { // focused-test
    page.goto('/'); // missing-await
    openPage(page); // missing-await (page-object style helper)
    expect(page.locator('h1')).toBeVisible(); // missing-await (web-first assertion)
    await page.waitForTimeout(2000); // hardcoded-wait
    await page.locator('#password').fill('FakeP4ss!'); // hardcoded-credential
    await expect(page).toHaveURL(/home/);
  });

  test('SAMPLE-002: steps but no assertion', async ({ page }) => { // no-assertion
    await page.getByRole('button', { name: 'Save' }).click({ force: true }); // force-action
    await page.waitForLoadState('networkidle'); // networkidle-wait
    await page.pause(); // debug-pause
    try { await page.reload(); } catch { } // empty-catch
    await page.locator('x').click().catch(() => {}); // swallowed-rejection
    await new Promise((r) => setTimeout(r, 500)); // hardcoded-wait
    void fixturePassword;
  });

  test('SAMPLE-002: steps but no assertion', async ({ page }) => { // duplicate-title
    await page.goto('/');
    await expect(page.locator('main')).toBeVisible();
  });

  // Must stay clean: a handled fire-and-forget promise and an assertion helper named expect…().
  test('SAMPLE-003: handled promise and an assertion helper', async ({ page }) => {
    page.waitForResponse(() => true).then(() => undefined).catch(() => undefined);
    await expectHeading(page);
  });

  // Must stay clean: the assertion sits two helpers deep, behind ordinary names.
  test('SAMPLE-004: assertion inside a nested helper', async ({ page }) => {
    await runScenario(page);
  });
});

async function expectHeading(page: Page): Promise<void> {
  await expect(page.locator('h1')).toBeVisible();
}

async function runScenario(page: Page): Promise<void> {
  await openPage(page);
  await expectHeading(page);
}
