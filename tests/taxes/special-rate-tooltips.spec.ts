import { test, expect } from '../../src/fixtures/pages.fixture';
import { SpecialRatePage, addDays } from '../../src/pages/taxes/special-rate.page';
import { verify, about } from '../../src/fixtures/report-steps';
import { EDIT_OFFICE, PW, YEAR_2006, ALERT, TEXT } from '../../src/data/taxes/special-rate';

// Tax → Special Rate (NM-4022): the tooltips, warning icons and button names of both tabs. Tooltips are
// checked by hovering and reading what opens. Row and search-date warnings keep their reason in the
// icon's title. Nothing here saves.

test.describe.configure({ timeout: 180_000 });

test.describe('Special Rate — tooltips', () => {
  let sr: SpecialRatePage;

  test.beforeEach(async ({ utcPage, config }) => {
    sr = new SpecialRatePage(utcPage, config);
    await sr.open(EDIT_OFFICE);
  });

  const main = () => sr.page.locator('main');
  const button = (name: string) => main().getByRole('button', { name, exact: true });

  test('TC-SR-TT-001: The page\'s own tooltips open on hover', async () => {
    await about('The information icon, Collapse filters / Expand filters and Grid Options each open a tooltip on hover, on both tabs.');
    const tips: Record<string, string | null> = {};
    for (const tab of ['Basic Information', 'Special Rate History'] as const) {
      await sr.openTab(tab);
      tips[`${tab}: More information`] = await sr.tooltipOf(button('More information'));
      tips[`${tab}: Collapse filters`] = await sr.tooltipOf(button('Collapse filters'));
      await sr.collapseFilters();
      tips[`${tab}: Expand filters`] = await sr.tooltipOf(button('Expand filters'));
      await sr.expandFilters();
      tips[`${tab}: Grid Options`] = await sr.tooltipOf(button('Grid Options'));
    }
    await verify('"Special Rate.", "Hide filters", "Show filters", "Grid Options" on both tabs', async () => {
      for (const tab of ['Basic Information', 'Special Rate History']) {
        expect(tips).toMatchObject({
          [`${tab}: More information`]: TEXT.info, [`${tab}: Collapse filters`]: 'Hide filters',
          [`${tab}: Expand filters`]: 'Show filters', [`${tab}: Grid Options`]: 'Grid Options',
        });
      }
    });
  });

  test('TC-SR-TT-002: The information tooltip names the page and closes when the mouse leaves', async () => {
    await about('Hovering (i) opens "Special Rate."; moving the mouse away closes it.');
    const tip = await sr.tooltipOf(button('More information'));
    await sr.page.mouse.move(0, 0);
    await verify('"Special Rate." opens, then closes', async () => {
      expect(tip).toBe(TEXT.info);
      await expect(sr.page.getByRole('tooltip')).toHaveCount(0);
    });
  });

  test('TC-SR-TT-003: Every row validation reason is held on the row\'s warning icon', async () => {
    await about(
      'Each reason a row is refused (the date must change, the date must be after the record, an impossible date, an empty date) ' +
        'is held on the red (!) icon of the row, and Save stays off.',
    );
    await sr.choose('state', PW.state);
    await sr.search();
    const row = sr.row(PW.edit);
    await sr.toggle(row, 'Special');
    const seen: Record<string, string[]> = {};
    seen[ALERT.newDateNeeded] = await sr.getRowMessages(row);
    await sr.editDate(row, '01/01/2006');
    seen[ALERT.dateAfter(PW.editSince)] = await sr.getRowMessages(row);
    await sr.editDate(row, '13/45/2099');
    seen[ALERT.invalidDate] = await sr.getRowMessages(row);
    await sr.editDate(row, addDays(PW.editSince, 1));
    await sr.editDate(row, '');
    seen[ALERT.required] = await sr.getRowMessages(row);
    await verify('Each reason is on the warning icon; Save is disabled', async () => {
      for (const [message, held] of Object.entries(seen)) expect.soft(held, message).toEqual([message]);
      expect(Object.entries(seen).every(([m, held]) => held.length === 1 && held[0] === m)).toBe(true);
      expect(await sr.isSaveEnabled()).toBe(false);
    });
  });

  test('TC-SR-TT-004: An impossible search date is marked "Invalid date" and Search is off', async () => {
    await about('An impossible search date (02/30/2026) is marked with "Invalid date", and Search cannot be clicked.');
    await sr.setSearchDate('02/30/2026');
    await verify('"Invalid date"; Search is disabled', async () => {
      expect(await sr.searchDateMessage()).toBe(ALERT.invalidDate);
      expect(await sr.isSearchEnabled()).toBe(false);
    });
  });

  test('TC-SR-TT-005: Icon-only buttons are named for what they do', async () => {
    await about('The calendar buttons and the history paging buttons are named "Open calendar" and "Go to first / previous / next / last page".');
    const found: Record<string, number> = {};
    found['Open calendar (search date)'] = await main().locator('form').getByRole('button', { name: 'Open calendar' }).count();
    await sr.choose('state', PW.state);
    await sr.search();
    found['Open calendar (row)'] = await sr.row(PW.edit).getByRole('button', { name: 'Open calendar' }).count();
    await sr.openTab('Special Rate History');
    await sr.setDateRange(YEAR_2006.from, YEAR_2006.to);
    await sr.search();
    await sr.goToPage('next');
    for (const name of ['Go to first page', 'Go to previous page', 'Go to next page', 'Go to last page']) found[name] = await button(name).count();
    await verify('Each button is found by its name', async () => {
      const missing = Object.entries(found).filter(([, n]) => n !== 1).map(([k]) => k);
      expect(missing, `not found: ${missing.join(', ')}`).toEqual([]);
    });
  });

  test('TC-SR-TT-006: The sidebar toggle and the history Date Range button have a name for screen readers', async () => {
    await about('Screen readers announce a button by its label: the sidebar toggle and the history Date Range button each have one.');
    const names = {
      'Sidebar toggle': await sr.accessibleName(main().locator('button[data-sidebar="trigger"], button[aria-label="trigger-button"]').first()),
    } as Record<string, string | null>;
    await sr.openTab('Special Rate History');
    names['Date Range'] = await sr.accessibleName(main().locator('form button[aria-haspopup="dialog"]').first());
    await verify('Both have a label', async () => {
      const unnamed = Object.entries(names).filter(([, n]) => !n?.trim()).map(([k]) => k);
      expect(unnamed, `no label: ${unnamed.join(', ')}`).toEqual([]);
    });
  });
});
