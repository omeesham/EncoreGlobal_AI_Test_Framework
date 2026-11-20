/**
 * SELF-TEST FIXTURE — selectors for `cli.ts self-test` (Locator Validator). Lives outside tests/, never run.
 */
import { test, expect } from '@playwright/test';

const SAVE_BUTTON = 'main button:text-is("Save")';           // text-coupled → getByRole('button', { name: 'Save' })
const GENERATED = '#radix-_r_12_';                             // generated-id
const ABSOLUTE = '/html/body/div[2]/main/table';               // absolute-xpath + positional-xpath
const STYLED = 'div.text-destructive';                         // style-class
const ROW_3 = 'tbody tr:nth-child(3)';                         // positional-css
const cell = (key: string): string => `[data-testid="cell-${key}"]`; // builder — partial text, still resolved
const TAB_A = '[data-testid="tab-a"]';
const TAB_B = '[data-testid="tab-b"]';

test('LOC-001 selector usage', async ({ page }) => {
  await page.locator(SAVE_BUTTON).click();
  await page.locator(SAVE_BUTTON).click();                     // same constant: reported once, "used 2 times"
  await page.locator(GENERATED).click();
  await page.locator(ABSOLUTE).isVisible();
  await page.locator(STYLED).first().click();                  // positional-locator (first)
  await page.locator(ROW_3).nth(2).click();                    // positional-locator (nth literal)
  await page.locator(cell('name')).fill('x');
  await page.getByText('Saved').click();                       // unscoped-text
  const pick = (first: boolean): string => (first ? TAB_A : TAB_B);
  await page.locator(Math.random() > 0.5 ? TAB_A : TAB_B).click(); // both branches count as used
  void pick;
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
});
