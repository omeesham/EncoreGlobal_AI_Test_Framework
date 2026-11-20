/**
 * SELF-TEST FIXTURE — deliberately weak tests for `cli.ts self-test`. Each ASSERT-NNN title names the rule it must
 * trigger; the GOOD-NNN tests must stay clean. Lives outside tests/, so Playwright never runs it.
 */
import { test, expect, type Page } from '@playwright/test';

async function saveForm(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Save' }).click();
}

async function expectSaved(page: Page): Promise<void> {
  await expect(page.getByRole('status')).toHaveText('Saved');
}

test.describe('Assertion sample', () => {
  test('ASSERT-001 no-business-assertion', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Name').fill('Acme');
  });

  test('ASSERT-002 tautological-assertion', async ({ page }) => {
    await page.goto('/');
    expect(true).toBe(true);
  });

  test('ASSERT-003 matcherless-expect', async ({ page }) => {
    await page.goto('/');
    expect(page.locator('h1'));
    await expect(page.locator('h1')).toHaveText('Home');
  });

  test('ASSERT-004 weak-assertions-only', async ({ page }) => {
    await page.getByLabel('Name').fill('Acme');
    await saveForm(page);
    await expect(page.locator('.toast')).toBeVisible();
  });

  test('ASSERT-005 unverified-final-action', async ({ page }) => {
    await page.getByLabel('Name').fill('Acme');
    await expect(page.getByLabel('Name')).toHaveValue('Acme');
    await saveForm(page);
  });

  test('ASSERT-006 conditional-assertions-only', async ({ page }) => {
    await saveForm(page);
    if (await page.getByRole('status').count()) {
      await expect(page.getByRole('status')).toHaveText('Saved');
    }
  });

  test('ASSERT-007 non-retrying-assertion', async ({ page }) => {
    await saveForm(page);
    expect(await page.getByRole('status').isVisible()).toBe(true);
    await expect(page.getByRole('status')).toHaveText('Saved');
  });

  test('ASSERT-008 cleanup-outside-finally', async ({ page }) => {
    await page.getByLabel('Active').check();
    await expect(page.getByLabel('Active')).toBeChecked();
    await page.getByLabel('Active').check(); // restore
  });

  test('GOOD-004 the same assertion helper called twice', async ({ page }) => {
    await saveForm(page);
    await expectSaved(page);
    await page.getByLabel('Name').fill('Beta');
    await expectSaved(page);
  });

  test('GOOD-003 closing with Escape after the assertion', async ({ page }) => {
    await saveForm(page);
    await expect(page.getByRole('status')).toHaveText('Saved');
    await page.keyboard.press('Escape');
  });

  test('GOOD-001 action then a content assertion', async ({ page }) => {
    await page.getByLabel('Name').fill('Acme');
    await saveForm(page);
    await expect(page.getByRole('status')).toHaveText('Saved');
  });

  test('GOOD-002 assertion through a helper, clean-up in finally', async ({ page }) => {
    try {
      await saveForm(page);
      await expectSaved(page);
    } finally {
      await page.getByRole('button', { name: 'Delete' }).click();
    }
  });
});
