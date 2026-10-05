import { test, expect } from '@playwright/test';

// Planner/generator seed. Auth comes from the chromium project's storageState
// (.auth/encore-state.json); baseURL is https://cloudapps-e2e.encoreglobal.com/navigator/.
// Lands on Location Settings for office 1604 — Basic Information is the default tab,
// so the agent clicks "Location Management History" itself.
test.describe('Seed', () => {
  test('seed', async ({ page }) => {
    await page.goto('locations/1604/settings/location');
    await expect(page.locator('[data-testid="location-settings-tab-management-history"]')).toBeVisible({ timeout: 60_000 });
  });
});
