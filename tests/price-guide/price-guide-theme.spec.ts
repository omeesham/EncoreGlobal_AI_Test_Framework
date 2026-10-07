import { test, expect } from '../../src/fixtures/pages.fixture';
import { PriceGuidePage, GuideRow, LowContrastText } from '../../src/pages/price-guide/price-guide.page';
import { phase, verify, about, attachNote } from '../../src/fixtures/report-steps';
import { PRICE_GUIDE_OFFICES, officeLabel, DARK_THEME_ACCEPTED_CONTRAST } from '../../src/data/price-guide/price-guide';

// Setup → Price Guide (NM-4128): the page in the dark theme. The theme is picked in the user menu
// (System / Light / Dark) and kept in this browser only, so every case puts the browser back on
// System afterwards — the session is shared with the other Price Guide specs on this worker.

test.describe.configure({ timeout: 240_000 });

const accepted = (text: string): boolean => (DARK_THEME_ACCEPTED_CONTRAST as readonly string[]).includes(text);

for (const office of PRICE_GUIDE_OFFICES) {
  test.describe(`Price Guide — theme — ${officeLabel(office)}`, () => {
    let pg: PriceGuidePage;
    const other = PRICE_GUIDE_OFFICES.find((o) => o.code !== office.code)!;

    test.beforeEach(async ({ authenticatedSession, config }) => {
      pg = new PriceGuidePage(authenticatedSession.page, config);
      await pg.emulateOsTheme('light');
      await pg.open(office.code);
    });

    test.afterEach(async () => {
      if (!pg) return; // the session never opened, so there is nothing to clean up
      await pg.open(office.code).catch(() => {});
      await pg.setTheme('system').catch(() => {});
      await pg.emulateOsTheme('light');
    });

    test('TC-PRG-THM-001: Theme switch changes Price Guide to Dark, Light and System', async () => {
      await about('Dark, Light and System in the user menu restyle Price Guide at once, and the choice is kept across reloads, offices and pages.');
      await verify('With the computer in light mode and Theme on System, the page is light', async () => {
        expect(await pg.getSelectedTheme()).toBe('system');
        expect(await pg.getAppliedTheme()).toBe('light');
      });
      await phase('Choose Dark', () => pg.setTheme('dark'));
      await verify('The page turns dark at once', async () => {
        expect(await pg.getAppliedTheme()).toBe('dark');
      });
      await pg.reload();
      await verify('Still dark after reload', async () => {
        expect(await pg.getAppliedTheme()).toBe('dark');
      });
      await pg.open(other.code);
      await verify(`Still dark on ${officeLabel(other)}`, async () => {
        expect(await pg.getAppliedTheme()).toBe('dark');
      });
      await pg.clickSidebarHome();
      await verify('Still dark on Home', async () => {
        expect(await pg.getAppliedTheme()).toBe('dark');
      });
      await pg.open(office.code);
      await pg.emulateOsTheme('dark');
      await phase('Choose Light with the computer in dark mode', () => pg.setTheme('light'));
      await verify('Light overrides the computer setting', async () => {
        expect(await pg.getAppliedTheme()).toBe('light');
      });
      await phase('Choose System', () => pg.setTheme('system'));
      await verify('System follows the computer: dark', async () => {
        expect(await pg.getAppliedTheme()).toBe('dark');
      });
      await pg.emulateOsTheme('light');
      await verify('…and turns light as soon as the computer does', async () => {
        await expect.poll(() => pg.getAppliedTheme()).toBe('light');
      });
    });

    test('TC-PRG-THM-002: Price Guide is readable in the dark theme', async () => {
      await about('In the dark theme every text on Price Guide — lists, tooltip, recommendations, menus and the unsaved-changes dialog — has a contrast of at least 4.5:1. The purple Save and Discard buttons (3.98:1) are accepted as they are.');
      await pg.setTheme('dark');
      const low: Record<string, LowContrastText[]> = {};
      low.page = await pg.getLowContrastText('main');
      await pg.getInfoTooltip();
      low.tooltip = await pg.getLowContrastText('[role="tooltip"]');
      await pg.moveMouseAway();
      await pg.addByDoubleClick(0);
      await pg.addByDoubleClick(1);
      low.recommendations = await pg.getLowContrastText('main #price-guide-recommendations-print');
      await pg.openHeaderMenu('right', 'Name');
      low.headerMenu = await pg.getLowContrastText('[role="menu"]');
      await pg.closeMenu();
      await pg.openGridOptions();
      low.gridOptions = await pg.getLowContrastText('[role="menu"]');
      await pg.closeMenu();
      await pg.clickSidebarHome();
      low.unsavedDialog = await pg.getLowContrastText('[role="alertdialog"]');
      await pg.stay();
      await attachNote('Text below 4.5:1, per state (Save and Discard are accepted)', JSON.stringify(low, null, 1));
      await verify('No text below the contrast minimum in any state, apart from the accepted buttons', async () => {
        expect(Object.values(low).flat().filter((t) => !accepted(t.text))).toEqual([]);
      });
    });

    test('TC-PRG-THM-003: Printing from the dark theme gives a readable copy', async () => {
      await about('Printing in the dark theme with the default print settings gives the recommendations as dark text on white paper.');
      await pg.setTheme('dark');
      const added: GuideRow[] = [];
      for (let i = 0; i < 3; i++) added.push(await pg.addByDoubleClick(i));
      await phase('Click Print', async () => {
        expect(await pg.clickPrint()).toBe(1);
      });
      const rows = await pg.getPrintedRows();
      const low = await pg.getPrintedRowsLowContrastText();
      await attachNote('Printed rows, and any below 4.5:1 on white paper', JSON.stringify({ rows, low }, null, 1));
      await verify('The printout lists the three recommendations', async () => {
        expect(rows).toHaveLength(added.length);
        for (const item of added) expect(rows.join('\n')).toContain(item.name);
      });
      await verify('Names, prices and item types read clearly on white paper', async () => {
        expect(low).toEqual([]);
      });
    });
  });
}
