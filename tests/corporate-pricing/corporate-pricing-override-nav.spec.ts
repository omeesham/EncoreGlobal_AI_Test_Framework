import { test, expect } from '../../src/fixtures/pages.fixture';

test.describe('Corporate Pricing — Product Group Override: navigation & location picker @corporate-pricing @override', () => {
  test('TC-CPR-NAV-001: The Search action bar "Pricing Override" button navigates to the Override screen', async ({ corporatePricingOverridePage: p }) => {
    test.setTimeout(90_000);
    await p.openViaSearchActionBar();
    expect(p.page.url()).toContain('/pg-override');
    await test.step('Confirm the Product Group Override heading is visible', async () => {
      await expect(p.page.locator('h1:text-is("Product Group Override")')).toBeVisible();
    });
  });
});
