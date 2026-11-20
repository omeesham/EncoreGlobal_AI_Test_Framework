/**
 * SELF-TEST FIXTURE — duplicates for `cli.ts self-test` (Duplicate Test Detector). Lives outside tests/, never run.
 */
import { test, expect } from '@playwright/test';

test.describe('Duplicate sample', () => {
  test('TC-DUP-001: Search lists the tiers of the chosen office', async ({ page }) => {
    await page.goto('/tiers');
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page.getByRole('row')).toHaveCount(5);
  });

  // duplicate-tc-id: TC-DUP-001 again
  test('TC-DUP-001: Reset clears the grid', async ({ page }) => {
    await page.goto('/tiers');
    await page.getByRole('button', { name: 'Reset' }).click();
    await expect(page.getByText('0 items found')).toBeVisible();
  });

  // duplicate-title with TC-DUP-001 (same scenario, different id)
  test('TC-DUP-002: Search lists the tiers of the chosen office', async ({ page }) => {
    await page.goto('/tiers?office=1606');
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page.getByRole('row')).toHaveCount(3);
  });

  // duplicate-script: TC-DUP-003 and TC-DUP-004 have the same body
  test('TC-DUP-003: Export downloads the workbook', async ({ page }) => {
    await page.goto('/tiers');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export' }).click();
    expect((await download).suggestedFilename()).toBe('TierFlat.xlsx');
  });

  test('TC-DUP-004: The export file is named after the module', async ({ page }) => {
    await page.goto('/tiers');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export' }).click();
    expect((await download).suggestedFilename()).toBe('TierFlat.xlsx');
  });

  // parameterizable-script: TC-DUP-005 and TC-DUP-006 differ only in literals
  test('TC-DUP-005: Comm % accepts 50', async ({ page }) => {
    await page.goto('/tiers');
    await page.getByLabel('Comm %').fill('50');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByLabel('Comm %')).toHaveValue('50');
  });

  test('TC-DUP-006: Comm % accepts 100', async ({ page }) => {
    await page.goto('/tiers');
    await page.getByLabel('Comm %').fill('100');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByLabel('Comm %')).toHaveValue('100');
  });

  // Must stay clean: an office loop shares one id in ONE declaration.
  for (const office of ['1606', '2322']) {
    test(`TC-DUP-007: History loads for office ${office}`, async ({ page }) => {
      await page.goto(`/tiers/${office}/history`);
      await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();
    });
  }
});
