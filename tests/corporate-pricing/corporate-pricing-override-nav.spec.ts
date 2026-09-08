import { test, expect } from '../../src/fixtures/pages.fixture';
import { phase, verify } from '../../src/fixtures/report-steps';

test.describe('Corporate Pricing — Product Group Override: navigation & location picker @corporate-pricing @override', () => {
  test('TC-CPR-NAV-001: The Search action bar "Pricing Override" button navigates to the Override screen', { tag: '@C99864' }, async ({ corporatePricingOverridePage: p }) => {
    test.setTimeout(90_000);
    await phase('Click Pricing Override in the Search action bar', () => p.openViaSearchActionBar());
    await verify('The Override screen is reached', async () => {
      expect(p.page.url()).toContain('/pg-override');
    });
    await verify('The Product Group Override heading is visible', async () => {
      await expect(p.page.locator('h1:text-is("Product Group Override")')).toBeVisible();
    });
  });
});
