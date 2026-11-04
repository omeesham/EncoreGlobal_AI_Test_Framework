import { test, expect } from '../../src/fixtures/pages.fixture';
import { InternationalTaxTypeSetupPage } from '../../src/pages/taxes/international-tax-type-setup.page';
import { phase, verify, about } from '../../src/fixtures/report-steps';
import {
  ITS_OFFICES,
  officeLabel,
  EDIT_OFFICE,
  COUNTRIES,
  PROVINCES,
  TYPE_OPTIONS,
  ROW,
  QUEBEC_RECORD,
  TEXT,
  COLUMNS,
} from '../../src/data/taxes/international-tax-type-setup';

// Tax → International Tax Type Setup (NM-4026): opening the page, the search criteria and the results
// grid. Nothing here saves.

test.describe.configure({ timeout: 180_000 });

test.describe('International Tax Type Setup — page and search', () => {
  let its: InternationalTaxTypeSetupPage;

  test.beforeEach(async ({ authenticatedSession, config }) => {
    its = new InternationalTaxTypeSetupPage(authenticatedSession.page, config);
  });

  for (const office of ITS_OFFICES) {
    test(`TC-ITS-LOD-001: International Tax Type Setup opens from the Tax menu with its defaults — ${officeLabel(office)}`, async () => {
      await about('The Tax menu opens the page for the office: Mexico and today as criteria, an empty grid and Save off.');
      await phase('Open the page from Tax > International Tax Type Setup', () => its.openFromTaxMenu(office.code));
      const today = await its.browserToday();
      await verify('URL, browser title and heading', async () => {
        expect(its.page.url()).toContain(`/locations/${office.code}/taxes/international-tax-type-setup`);
        expect(await its.getHeading()).toEqual({ heading: TEXT.header, title: TEXT.pageTitle });
      });
      await verify('Criteria are Mexico / today; the grid asks for a search; Save is disabled', async () => {
        expect(await its.getCriteria()).toEqual({ country: 'Mexico', date: today });
        expect(await its.getCount()).toBe(0);
        expect(await its.isEmptyMessageVisible(TEXT.empty)).toBe(true);
        expect(await its.isSaveEnabled()).toBe(false);
      });
    });
  }

  test('TC-ITS-LOD-002: The information icon explains the page', async () => {
    await about('Hovering the (i) beside the heading shows what the page is for.');
    await its.open(EDIT_OFFICE);
    await verify('Tooltip text', async () => {
      expect(await its.getInfoTooltip()).toBe(TEXT.info);
    });
  });

  test('TC-ITS-LOD-003: The grid shows the six tax type columns', async () => {
    await about('The grid and its Grid Options list the same six columns, all shown.');
    await its.open(EDIT_OFFICE);
    await verify('Column headers in order', async () => {
      expect(await its.getHeaders()).toEqual([...COLUMNS]);
    });
    await verify('Grid Options lists every column, ticked', async () => {
      expect(await its.getGridOptionColumns()).toEqual(COLUMNS.map((label) => ({ label, checked: true })));
    });
  });

  test('TC-ITS-LOD-004: Without a session the page sends the user to sign in', async ({ browser, config }) => {
    await about('Opening the page with no signed-in session lands on the sign-in page, which returns to this page afterwards.');
    // An explicitly empty state: the project's own default would sign the context in.
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    try {
      const page = await context.newPage();
      const path = `/locations/${EDIT_OFFICE}/taxes/international-tax-type-setup`;
      await phase('Open the page without signing in', () => page.goto(`${config.base_url.replace(/\/+$/, '')}${path}`));
      await verify('The sign-in page, with this page as the return address', async () => {
        await expect(page).toHaveURL(/\/auth\/sign-in\?callbackUrl=/, { timeout: 30_000 });
        expect(decodeURIComponent(new URL(page.url()).searchParams.get('callbackUrl') ?? '')).toBe(path);
        await expect(page).toHaveTitle(TEXT.signInTitle);
      });
    } finally {
      await context.close();
    }
  });

  test('TC-ITS-LOD-005: The search panel works from the keyboard', async () => {
    await about('Country can be opened and chosen with Enter and the arrow keys; Tab moves through date, calendar, Reset and Search; Enter on Search searches.');
    await its.open(EDIT_OFFICE);
    await its.chooseCountryByKeyboard(1);
    await verify('Country is Canada', async () => {
      expect((await its.getCriteria()).country).toBe('Canada');
    });
    const order: string[] = [];
    for (let i = 0; i < 4; i++) {
      await its.press('Tab');
      order.push(await its.focusedControl());
    }
    await verify('Tab order: Effective Date, Open calendar, Reset, Search', async () => {
      expect(order).toEqual(['Select date', 'Open calendar', 'Reset', 'Search']);
    });
    const count = await its.searchWithEnter();
    await verify('Enter on Search lists the Canadian provinces', async () => {
      expect(count).toBe(PROVINCES.Canada.length);
      expect(await its.readColumn('Province')).toEqual([...PROVINCES.Canada]);
    });
  });

  for (const office of ITS_OFFICES) {
    test(`TC-ITS-SRC-001: Searching Mexico lists one row per Mexican state — ${officeLabel(office)}`, async () => {
      await about('The default search lists every Mexican state once, and the same rows on every office.');
      await its.open(office.code);
      const count = await phase('Search with the default criteria', () => its.search());
      await verify(`${PROVINCES.Mexico} rows, one per state, sorted by Province`, async () => {
        const provinces = await its.readColumn('Province');
        expect(count).toBe(PROVINCES.Mexico);
        expect(provinces).toHaveLength(PROVINCES.Mexico);
        expect(new Set(provinces).size).toBe(PROVINCES.Mexico);
        expect(provinces).toEqual([...provinces].sort((a, b) => a.localeCompare(b)));
      });
    });
  }

  test('TC-ITS-SRC-002: Country offers Mexico, Canada and Bahamas', async () => {
    await about('The Country filter lists the three countries with international tax types.');
    await its.open(EDIT_OFFICE);
    await verify('Country options', async () => {
      expect(await its.getCountryOptions()).toEqual([...COUNTRIES]);
    });
  });

  test('TC-ITS-SRC-003: Searching Canada and Bahamas lists their own provinces', async () => {
    await about('Each country lists its own provinces: Canada its thirteen provinces and territories, Bahamas one row.');
    await its.open(EDIT_OFFICE);
    for (const country of ['Canada', 'Bahamas'] as const) {
      await its.selectCountry(country);
      const count = await phase(`Search ${country}`, () => its.search());
      await verify(`${country}: its provinces`, async () => {
        expect(count).toBe(PROVINCES[country].length);
        expect(await its.readColumn('Province')).toEqual([...PROVINCES[country]]);
      });
    }
  });

  test('TC-ITS-SRC-004: Search needs a valid Effective Date', async () => {
    await about('With the Effective Date emptied or impossible, Search is disabled; an impossible date is flagged.');
    await its.open(EDIT_OFFICE);
    await its.setSearchDate('');
    await verify('Empty date: Search disabled', async () => {
      expect(await its.isSearchEnabled()).toBe(false);
    });
    await its.setSearchDate('13/45/2026');
    await verify('Impossible date: Search disabled', async () => {
      expect(await its.isSearchEnabled()).toBe(false);
    });
  });

  test('TC-ITS-SRC-005: Reset restores the criteria and clears the grid', async () => {
    await about('After searching another country on another date, Reset puts back Mexico and today and empties the grid.');
    await its.open(EDIT_OFFICE);
    const today = await its.browserToday();
    await phase('Search Canada on another date', async () => {
      await its.selectCountry('Canada');
      await its.setSearchDate('01/01/2020');
      await its.search();
    });
    await its.reset();
    await verify('Mexico / today, no rows, the search prompt', async () => {
      expect(await its.getCriteria()).toEqual({ country: 'Mexico', date: today });
      expect(await its.getCount()).toBe(0);
      expect(await its.rowCount()).toBe(0);
      expect(await its.isEmptyMessageVisible(TEXT.empty)).toBe(true);
    });
  });

  test('TC-ITS-SRC-006: The search panel collapses and expands', async () => {
    await about('Collapsing the criteria panel hides it from view; expanding brings Search back.');
    await its.open(EDIT_OFFICE);
    await its.collapseFilters();
    await verify('Collapsed: Search is out of view', async () => {
      await expect(its.searchButton()).not.toBeInViewport();
    });
    await its.expandFilters();
    await verify('Expanded: Search is in view', async () => {
      await expect(its.searchButton()).toBeInViewport();
    });
  });

  test('TC-ITS-GRD-001: Sorting a column reorders the rows both ways', async () => {
    await about('Province descending reverses the Canadian list; ascending puts it back.');
    await its.open(EDIT_OFFICE);
    await its.selectCountry('Canada');
    await its.search();
    await its.sortBy('Province', 'descending');
    await verify('Province descending', async () => {
      expect(await its.readColumn('Province')).toEqual([...PROVINCES.Canada].reverse());
    });
    await its.sortBy('Province', 'ascending');
    await verify('Province ascending', async () => {
      expect(await its.readColumn('Province')).toEqual([...PROVINCES.Canada]);
    });
  });

  test('TC-ITS-GRD-002: A hidden column comes back with Reset to Default View', async () => {
    await about('Hide column removes a column from the grid and unticks it in Grid Options; Reset to Default View restores it.');
    await its.open(EDIT_OFFICE);
    await its.hideColumn('GOV Tax Reg. Number');
    await verify('The column is gone and unticked', async () => {
      expect(await its.getHeaders()).not.toContain('GOV Tax Reg. Number');
      expect(await its.getGridOptionColumns()).toContainEqual({ label: 'GOV Tax Reg. Number', checked: false });
    });
    await its.resetGridView();
    await verify('All six columns are back', async () => {
      expect(await its.getHeaders()).toEqual([...COLUMNS]);
    });
  });

  test("TC-ITS-GRD-003: A row's tax type pickers offer its country's types", async () => {
    await about('Mexico offers IVA as GOV type and no Provincial type; Canada offers GST/HST and PST/QST.');
    await its.open(EDIT_OFFICE);
    await its.search();
    await verify('Mexico', async () => {
      const row = its.row(ROW.mexico);
      expect(await its.getTypeOptions(row, 'gov')).toEqual([...TYPE_OPTIONS.Mexico.gov]);
      expect(await its.getTypeOptions(row, 'provincial')).toEqual([...TYPE_OPTIONS.Mexico.provincial]);
    });
    await its.selectCountry('Canada');
    await its.search();
    await verify('Canada', async () => {
      const row = its.row(ROW.canada);
      expect(await its.getTypeOptions(row, 'gov')).toEqual([...TYPE_OPTIONS.Canada.gov]);
      expect(await its.getTypeOptions(row, 'provincial')).toEqual([...TYPE_OPTIONS.Canada.provincial]);
    });
  });

  test('TC-ITS-GRD-004: Bahamas has no tax types to pick', async () => {
    await about('The Bahamas row offers no GOV tax type and only the blank Provincial option.');
    await its.open(EDIT_OFFICE);
    await its.selectCountry('Bahamas');
    await its.search();
    const row = its.row('Bahamas');
    await verify('GOV: none; Provincial: blank only', async () => {
      expect(await its.getTypeOptions(row, 'gov')).toEqual([]);
      expect(await its.getTypeOptions(row, 'provincial')).toEqual(['']);
    });
  });

  test('TC-ITS-GRD-005: Sorting by GOV Tax Type Name groups the rows by type', async () => {
    await about('GOV Tax Type Name descending lists the HST provinces before the GST ones; ascending the other way round.');
    await its.open(EDIT_OFFICE);
    await its.selectCountry('Canada');
    await its.search();
    for (const direction of ['descending', 'ascending'] as const) {
      await its.sortBy('GOV Tax Type Name', direction);
      await verify(`GOV Tax Type Name ${direction}`, async () => {
        const types = await its.readColumn('GOV Tax Type Name');
        const sorted = [...types].sort((a, b) => a.localeCompare(b));
        expect(types).toEqual(direction === 'ascending' ? sorted : sorted.reverse());
      });
    }
  });

  // Dates are read as stored, so this runs on a UTC page (see the search date case below).
  test('TC-ITS-GRD-006: Sorting by Effective Date orders the rows by date', async ({ utcPage, config }) => {
    await about('Effective Date ascending lists the oldest record first and descending the newest first.');
    const its = new InternationalTaxTypeSetupPage(utcPage, config);
    await its.open(EDIT_OFFICE);
    await its.selectCountry('Canada');
    await its.search();
    const day = (mmddyyyy: string) => {
      const [m, d, y] = mmddyyyy.split('/').map(Number) as [number, number, number];
      return y * 10_000 + m * 100 + d;
    };
    for (const direction of ['ascending', 'descending'] as const) {
      await its.sortBy('Effective Date', direction);
      await verify(`Effective Date ${direction}`, async () => {
        const days = (await its.readColumn('Effective Date')).map(day);
        const sorted = [...days].sort((a, b) => a - b);
        expect(days).toEqual(direction === 'ascending' ? sorted : sorted.reverse());
      });
    }
  });

  test('TC-ITS-GRD-007: A moved column stays moved until Reset to Default View', async () => {
    await about('Dragging Province onto another column moves it; the order is kept after a reload; Reset to Default View restores it.');
    await its.open(EDIT_OFFICE);
    await its.dragColumn('Province', 'GOV Tax Reg. Number');
    const moved = await its.getHeaders();
    await verify('Province is no longer first; the same six columns', async () => {
      expect(moved[0]).not.toBe('Province');
      expect([...moved].sort()).toEqual([...COLUMNS].sort());
    });
    await its.reload();
    await verify('After a reload the moved order is kept', async () => {
      expect(await its.getHeaders()).toEqual(moved);
    });
    await its.resetGridView();
    await verify('Reset to Default View restores the order', async () => {
      expect(await its.getHeaders()).toEqual([...COLUMNS]);
    });
  });

  test('TC-ITS-GRD-008: A column can be widened by dragging its edge', async () => {
    await about('Dragging the resize handle of GOV Tax Reg. Number to the right widens the column.');
    await its.open(EDIT_OFFICE);
    const before = await its.columnWidth('GOV Tax Reg. Number');
    const after = await its.resizeColumn('GOV Tax Reg. Number', 200);
    await verify(`Wider than before (${before}px)`, async () => {
      expect(after).toBeGreaterThan(before + 50);
    });
  });
});

// The rows show the record in effect on the search date. Stored dates are read in the browser's time
// zone, so this runs on a UTC page, where the page shows dates as stored.
test.describe('International Tax Type Setup — search date', () => {
  test('TC-ITS-SRC-007: The search date shows the record in effect on that day', async ({ utcPage, config }) => {
    await about(`Quebec's GST/QST record applies from ${QUEBEC_RECORD.since}: searching that day shows it, the day before shows none.`);
    const its = new InternationalTaxTypeSetupPage(utcPage, config);
    await its.open(EDIT_OFFICE);
    const before = await its.readRow(await its.findRow('Canada', 'Quebec', QUEBEC_RECORD.dayBefore));
    await verify(`As of ${QUEBEC_RECORD.dayBefore}: no tax types`, async () => {
      expect(before).toMatchObject({ 'GOV Tax Type Name': '', 'Provincial Tax Type Name': '', 'Effective Date': '' });
    });
    const on = await its.readRow(await its.findRow('Canada', 'Quebec', QUEBEC_RECORD.since));
    await verify(`As of ${QUEBEC_RECORD.since}: GST and QST from that day`, async () => {
      expect(on).toMatchObject({
        'GOV Tax Type Name': QUEBEC_RECORD.gov,
        'Provincial Tax Type Name': QUEBEC_RECORD.provincial,
        'Provincial Tax Reg. Number': QUEBEC_RECORD.provincialReg,
        'Effective Date': QUEBEC_RECORD.since,
      });
    });
  });
});
