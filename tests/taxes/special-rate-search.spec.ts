import { test, expect } from '../../src/fixtures/pages.fixture';
import { SpecialRatePage } from '../../src/pages/taxes/special-rate.page';
import { phase, verify, about } from '../../src/fixtures/report-steps';
import {
  SR_OFFICES,
  officeLabel,
  EDIT_OFFICE,
  STATES,
  TAX_TYPES,
  YES_NO,
  ROWS_PER_PLACE,
  PLACE,
  PW,
  TEXT,
  BASIC_COLUMNS,
} from '../../src/data/taxes/special-rate';

// Tax → Special Rate (NM-4022), Basic Information tab: opening the page, the search criteria and the
// results grid. Nothing here saves. Cases that read dates run on a UTC page, where dates show as stored.

test.describe.configure({ timeout: 240_000 });

const ALL_ROWS = STATES.length * ROWS_PER_PLACE;

test.describe('Special Rate — page and search', () => {
  let sr: SpecialRatePage;

  test.beforeEach(async ({ authenticatedSession, config }) => {
    sr = new SpecialRatePage(authenticatedSession.page, config);
  });

  for (const office of SR_OFFICES) {
    test(`TC-SR-LOD-001: Special Rate opens from the Tax menu with its defaults — ${officeLabel(office)}`, async () => {
      await about('The Tax menu opens the page on Basic Information: every filter on All, today as the date, an empty grid and Save off.');
      await phase('Open the page from Tax > Special Rate', () => sr.openFromTaxMenu(office.code));
      const today = await sr.browserToday();
      await verify('URL, browser title, heading and the selected tab', async () => {
        expect(sr.page.url()).toContain(`/locations/${office.code}/taxes/special-rate`);
        expect(await sr.getHeading()).toEqual({ heading: TEXT.header, title: TEXT.pageTitle });
        expect(await sr.selectedTab()).toBe('Basic Information');
      });
      await verify('Criteria: State, Tax Type, Special? and Taxable on All, County and City off, today as the date', async () => {
        expect(await sr.getCriteria()).toMatchObject({
          state: 'All', taxType: 'All', special: 'All', taxable: 'All', date: today, countyEnabled: false, cityEnabled: false,
        });
      });
      await verify('The grid asks for a search; Save is disabled', async () => {
        expect(await sr.getCount()).toBe(0);
        expect(await sr.isMessageVisible(TEXT.emptyBasic)).toBe(true);
        expect(await sr.isSaveEnabled()).toBe(false);
      });
    });
  }

  test('TC-SR-LOD-002: The information icon explains the page', async () => {
    await about('Hovering the (i) beside the heading shows what the page is for.');
    await sr.open(EDIT_OFFICE);
    await verify('Tooltip text', async () => {
      expect(await sr.getInfoTooltip()).toBe(TEXT.info);
    });
  });

  test('TC-SR-LOD-003: Without a session the page sends the user to sign in', async ({ browser, config }) => {
    await about('Opening the page with no signed-in session lands on the sign-in page, which returns to this page afterwards.');
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    try {
      const page = await context.newPage();
      const path = `/locations/${EDIT_OFFICE}/taxes/special-rate`;
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

  test('TC-SR-LOD-004: The grid shows the seventeen special rate columns', async () => {
    await about('The grid and its Grid Options list the same seventeen columns, all shown.');
    await sr.open(EDIT_OFFICE);
    await verify('Column headers in order', async () => {
      expect(await sr.getHeaders()).toEqual([...BASIC_COLUMNS]);
    });
    await verify('Grid Options lists every column, ticked', async () => {
      expect(await sr.getGridOptionColumns()).toEqual(
        ['State', 'County', 'City', 'Zip Code', 'Tax Type', 'Taxable', 'Special', 'State Special', 'County Special', 'City Special',
          'Special Combined', 'Sales Combined', 'Total Combined', 'Effective Date', 'Notes', 'Modified By', 'Modified On']
          .map((label) => ({ label, checked: true })),
      );
    });
  });

  for (const office of SR_OFFICES) {
    test(`TC-SR-SRC-001: Searching with every filter on All lists each state's tax types — ${officeLabel(office)}`, async () => {
      await about(`With no filter, the grid lists one state-level row per state and tax type (${STATES.length} × ${ROWS_PER_PLACE}), the same on every office.`);
      await sr.open(office.code);
      const count = await phase('Search with the default criteria', () => sr.search());
      await verify(`${ALL_ROWS} records, starting with AK`, async () => {
        expect(count).toBe(ALL_ROWS);
        expect((await sr.readRow(sr.firstRow())).State).toBe('AK');
      });
    });
  }

  test('TC-SR-SRC-002: State, Tax Type, Special? and Taxable offer their full lists', async () => {
    await about('State lists the US states, DC and territories; Tax Type lists the forty tax types; Special? and Taxable offer All, Yes and No.');
    await sr.open(EDIT_OFFICE);
    await verify('State options', async () => expect(await sr.getOptions('state')).toEqual(['All', ...STATES]));
    await verify('Tax Type options', async () => expect(await sr.getOptions('taxType')).toEqual(['All', ...TAX_TYPES]));
    await verify('Special? options', async () => expect(await sr.getOptions('special')).toEqual([...YES_NO]));
    await verify('Taxable options', async () => expect(await sr.getOptions('taxable')).toEqual([...YES_NO]));
  });

  test('TC-SR-SRC-003: County opens after a State and City after a County', async () => {
    await about(`County stays off until a State is chosen, and City until a County is: ${PLACE.state} lists ${PLACE.county}, and ${PLACE.county} lists ${PLACE.city}.`);
    await sr.open(EDIT_OFFICE);
    await verify('At first County and City are off', async () => {
      expect(await sr.getCriteria()).toMatchObject({ countyEnabled: false, cityEnabled: false });
    });
    await sr.choose('state', PLACE.state);
    await verify(`After ${PLACE.state}: County is on and lists ${PLACE.county}; City is still off`, async () => {
      expect(await sr.getCriteria()).toMatchObject({ countyEnabled: true, cityEnabled: false });
      expect(await sr.getOptions('county')).toContain(PLACE.county);
    });
    await sr.choose('county', PLACE.county);
    await verify(`After ${PLACE.county}: City is on and lists ${PLACE.city}`, async () => {
      expect((await sr.getCriteria()).cityEnabled).toBe(true);
      expect(await sr.getOptions('city')).toContain(PLACE.city);
    });
  });

  test('TC-SR-SRC-004: County and City start on All, with no blank choice', async () => {
    await about('Once a State is chosen County shows "All", and its list starts with All and has no empty choice; the same for City.');
    await sr.open(EDIT_OFFICE);
    await sr.choose('state', PLACE.state);
    const counties = await sr.getOptions('county');
    await sr.choose('county', PLACE.county);
    const cities = await sr.getOptions('city');
    const criteria = await sr.getCriteria();
    await verify('County shows All and lists no blank choice', async () => {
      expect.soft(counties[0]).toBe('All');
      expect.soft(counties).not.toContain('');
      expect.soft(cities[0]).toBe('All');
      expect.soft(cities).not.toContain('');
      expect(criteria.city).toBe('All');
    });
  });

  test('TC-SR-SRC-005: A State search lists that state\'s row for each tax type', async () => {
    await about(`Searching ${PW.state} lists ${ROWS_PER_PLACE} state-level rows, one per tax type, with no county or city.`);
    await sr.open(EDIT_OFFICE);
    await sr.choose('state', PW.state);
    const count = await phase(`Search ${PW.state}`, () => sr.search());
    // The grid draws the rows near the screen only, so the tax types are checked on the rows drawn.
    await verify(`${ROWS_PER_PLACE} rows, all ${PW.state}, each a different tax type, County and City "-"`, async () => {
      expect(count).toBe(ROWS_PER_PLACE);
      expect(new Set(await sr.readColumn('State'))).toEqual(new Set([PW.state]));
      expect(new Set(await sr.readColumn('County'))).toEqual(new Set(['-']));
      expect(new Set(await sr.readColumn('City'))).toEqual(new Set(['-']));
      const types = await sr.readColumn('Tax Type');
      expect(new Set(types).size).toBe(types.length);
      expect(types.filter((t) => !(TAX_TYPES as readonly string[]).includes(t))).toEqual([]);
    });
  });

  test('TC-SR-SRC-006: A County search lists that county\'s rows', async () => {
    await about(`Searching ${PLACE.state} › ${PLACE.county} lists one county-level row per tax type.`);
    await sr.open(EDIT_OFFICE);
    await sr.choose('state', PLACE.state);
    await sr.choose('county', PLACE.county);
    const { count, sent } = await phase('Search the county', () => sr.searchAndReadRequest());
    await verify(`${ROWS_PER_PLACE} rows, all ${PLACE.county}, no city; the search sent the county`, async () => {
      expect(count).toBe(ROWS_PER_PLACE);
      expect(new Set(await sr.readColumn('County'))).toEqual(new Set([PLACE.county]));
      expect(new Set(await sr.readColumn('City'))).toEqual(new Set(['-']));
      expect(sent.county).not.toBe(-1);
    });
  });

  test('TC-SR-SRC-007: A City search lists that city\'s rows by zip code', async () => {
    await about(`Searching ${PLACE.state} › ${PLACE.county} › ${PLACE.city} lists the city's rows, one per zip code and tax type.`);
    await sr.open(EDIT_OFFICE);
    await sr.choose('state', PLACE.state);
    await sr.choose('county', PLACE.county);
    await sr.choose('city', PLACE.city);
    const { count, sent } = await phase('Search the city', () => sr.searchAndReadRequest());
    await verify(`Rows found, all ${PLACE.city} with a zip code, a multiple of ${ROWS_PER_PLACE}`, async () => {
      expect(sent.city).not.toBe(-1);
      expect(count).toBeGreaterThan(0);
      expect(count % ROWS_PER_PLACE).toBe(0);
      expect(new Set(await sr.readColumn('City'))).toEqual(new Set([PLACE.city]));
      expect((await sr.readColumn('Zip Code')).every((z) => /^\d{5}/.test(z))).toBe(true);
    });
  });

  test('TC-SR-SRC-008: Choosing another State clears County and City', async () => {
    await about(`After ${PLACE.state} › ${PLACE.county} › ${PLACE.city}, choosing ${PLACE.otherState} empties County and turns City off; the search lists ${PLACE.otherState}.`);
    await sr.open(EDIT_OFFICE);
    await sr.choose('state', PLACE.state);
    await sr.choose('county', PLACE.county);
    await sr.choose('city', PLACE.city);
    await sr.choose('state', PLACE.otherState);
    await verify(`County no longer shows ${PLACE.county}; City is off`, async () => {
      const c = await sr.getCriteria();
      expect(c.county).not.toBe(PLACE.county);
      expect(c.cityEnabled).toBe(false);
    });
    const count = await phase(`Search ${PLACE.otherState}`, () => sr.search());
    await verify(`${ROWS_PER_PLACE} state-level rows of ${PLACE.otherState}`, async () => {
      expect(count).toBe(ROWS_PER_PLACE);
      expect(new Set(await sr.readColumn('State'))).toEqual(new Set([PLACE.otherState]));
      expect(new Set(await sr.readColumn('County'))).toEqual(new Set(['-']));
    });
  });

  test('TC-SR-SRC-009: Tax Type limits the rows to that tax type', async () => {
    await about('Choosing Power lists the Power row of every state, and nothing else.');
    await sr.open(EDIT_OFFICE);
    await sr.choose('taxType', 'Power');
    const count = await phase('Search Power', () => sr.search());
    await verify(`${STATES.length} rows, all Power`, async () => {
      expect(count).toBe(STATES.length);
      expect(new Set(await sr.readColumn('Tax Type'))).toEqual(new Set(['Power']));
    });
  });

  for (const filter of ['special', 'taxable'] as const) {
    const column = filter === 'special' ? 'Special' : 'Taxable';
    test(`TC-SR-SRC-${filter === 'special' ? '010' : '011'}: ${column === 'Special' ? 'Special?' : 'Taxable'} Yes and No split the rows`, async () => {
      await about(`${column} Yes lists only rows marked Yes, No only rows marked No, and together they make up every row.`);
      await sr.open(EDIT_OFFICE);
      const counts: Record<string, number> = {};
      for (const v of ['Yes', 'No'] as const) {
        await sr.choose(filter, v);
        counts[v] = await phase(`Search ${column} ${v}`, () => sr.search());
        await verify(`${column} ${v}: every row shows ${v}`, async () => {
          expect(counts[v]).toBeGreaterThan(0);
          expect(new Set(await sr.readColumn(column))).toEqual(new Set([v]));
        });
      }
      await verify(`Yes + No = all ${ALL_ROWS} rows`, async () => {
        expect(counts.Yes! + counts.No!).toBe(ALL_ROWS);
      });
    });
  }

  test('TC-SR-SRC-012: An empty or impossible Effective Date stops the search', async () => {
    await about('Search is off while the Effective Date is empty, and an impossible date (02/30/2026) is marked "Invalid date".');
    await sr.open(EDIT_OFFICE);
    await sr.setSearchDate('');
    await verify('Empty date: Search is disabled', async () => expect(await sr.isSearchEnabled()).toBe(false));
    await sr.setSearchDate('02/30/2026');
    await verify('02/30/2026: "Invalid date" and Search is disabled', async () => {
      expect(await sr.searchDateMessage()).toBe('Invalid date');
      expect(await sr.isSearchEnabled()).toBe(false);
    });
  });

  test('TC-SR-SRC-013: Reset puts back the default criteria and clears the grid', async () => {
    await about('After a search with filters, Reset returns every filter to All, the date to today, and empties the grid.');
    await sr.open(EDIT_OFFICE);
    const today = await sr.browserToday();
    await sr.choose('state', PLACE.state);
    await sr.choose('county', PLACE.county);
    await sr.choose('special', 'No');
    await sr.choose('taxable', 'No');
    await sr.choose('taxType', 'Rental');
    await sr.setSearchDate('01/01/2020');
    await sr.search();
    await phase('Reset', () => sr.reset());
    await verify('Defaults again; the grid asks for a search', async () => {
      await expect.poll(() => sr.getCount()).toBe(0);
      expect(await sr.getCriteria()).toMatchObject({
        state: 'All', taxType: 'All', special: 'All', taxable: 'All', date: today, countyEnabled: false, cityEnabled: false,
      });
      expect(await sr.isMessageVisible(TEXT.emptyBasic)).toBe(true);
    });
  });

  test('TC-SR-SRC-014: The search panel can be collapsed and expanded', async () => {
    await about('Collapsing hides the criteria (Search leaves the screen) and expanding brings them back.');
    await sr.open(EDIT_OFFICE);
    await sr.collapseFilters();
    await verify('Collapsed: Search is off screen', async () => expect(sr.searchButton()).not.toBeInViewport());
    await sr.expandFilters();
    await verify('Expanded: Search is back', async () => expect(sr.searchButton()).toBeInViewport());
  });

  test('TC-SR-LOD-005: The search panel works from the keyboard', async () => {
    await about('State can be opened and chosen with Enter and the arrow keys; Tab moves through County (skipping the disabled City), the other filters, the date, Reset and Search; Enter on Search searches.');
    await sr.open(EDIT_OFFICE);
    await sr.chooseByKeyboard('state', 1);
    await verify('State is AK; County is now on', async () => {
      expect(await sr.getCriteria()).toMatchObject({ state: 'AK', countyEnabled: true });
    });
    const order: string[] = [];
    for (let i = 0; i < 3; i++) {
      await sr.press('Tab');
      order.push(await sr.focusedControl());
    }
    await verify('From State, Tab goes to County, then past the disabled City to Tax Type', async () => {
      expect(order).toEqual(['special-rate-county', 'special-rate-tax-type', 'special-rate-special']);
    });
    await sr.press('Tab');
    order.length = 0;
    for (let i = 0; i < 4; i++) {
      await sr.press('Tab');
      order.push(await sr.focusedControl());
    }
    await verify('From Taxable, Tab goes: Effective Date, Open calendar, Reset, Search', async () => {
      expect(order).toEqual(['Select date', 'Open calendar', 'Reset', 'Search']);
    });
    const count = await sr.searchWithEnter();
    await verify(`Enter on Search lists AK's ${ROWS_PER_PLACE} rows`, async () => {
      expect(count).toBe(ROWS_PER_PLACE);
      expect(new Set(await sr.readColumn('State'))).toEqual(new Set(['AK']));
    });
  });

  test('TC-SR-GRD-006: A moved column stays moved until Reset to Default View', async () => {
    // Both columns are on screen: the grid is wider than the window, and a drag only starts on a visible grip.
    await about('Dragging Tax Type onto State moves it to the front of the grid; Reset to Default View puts the columns back in order.');
    await sr.open(EDIT_OFFICE);
    await sr.dragColumn('Tax Type', 'State');
    const moved = await sr.getHeaders();
    await verify('Tax Type is now the first column, before State', async () => {
      expect(moved.slice(0, 2)).toEqual(['Tax Type', 'State']);
    });
    await sr.resetGridView();
    await verify('Default order again', async () => expect(await sr.getHeaders()).toEqual([...BASIC_COLUMNS]));
  });

  test('TC-SR-GRD-007: A column can be widened by dragging its edge', async () => {
    // The table shares out the width again as a column grows, so the column gains less than the mouse moved.
    await about('Dragging the right edge of Tax Type 200 px to the right makes the column clearly wider.');
    await sr.open(EDIT_OFFICE);
    const before = await sr.columnWidth('Tax Type');
    const after = await sr.resizeColumn('Tax Type', 200);
    await verify(`Wider than before (${before} px) by more than 50 px`, async () => {
      expect(after).toBeGreaterThan(before + 50);
    });
  });

  test('TC-SR-GRD-003: A column can be hidden and the default view restored', async () => {
    await about('Hide column on Notes and unticking Modified By in Grid Options remove them; Reset to Default View brings both back.');
    await sr.open(EDIT_OFFICE);
    await sr.hideColumn('Notes');
    await sr.toggleGridOptionColumn('Modified By');
    await verify('Notes and Modified By are hidden, and unticked in Grid Options', async () => {
      const headers = await sr.getHeaders();
      expect(headers).not.toContain('Notes');
      expect(headers).not.toContain('Modified By');
      const options = await sr.getGridOptionColumns();
      expect(options.filter((o) => !o.checked).map((o) => o.label).sort()).toEqual(['Modified By', 'Notes']);
    });
    await sr.resetGridView();
    await verify('All seventeen columns again', async () => expect(await sr.getHeaders()).toEqual([...BASIC_COLUMNS]));
  });

  test('TC-SR-GRD-004: Special Combined and Total Combined add up', async () => {
    await about('On every special row, Special Combined = State + County + City Special, and Total Combined = Special Combined + Sales Combined.');
    await sr.open(EDIT_OFFICE);
    await sr.choose('special', 'Yes');
    await sr.search();
    const n = (v: string | undefined) => Number(v || 0);
    const rows = await sr.page.locator('main tbody tr:has(td + td)').all();
    const wrong: string[] = [];
    for (const r of rows) {
      const v = await sr.readRow(r);
      const special = n(v['State Special']) + n(v['County Special']) + n(v['City Special']);
      if (Math.abs(special - n(v['Special Combined'])) > 1e-6 || Math.abs(n(v['Special Combined']) + n(v['Sales Combined']) - n(v['Total Combined'])) > 1e-6) {
        wrong.push(`${v.State} ${v['Tax Type']}`);
      }
    }
    await verify(`${rows.length} rows checked; none adds up wrongly`, async () => {
      expect(rows.length).toBeGreaterThan(0);
      expect(wrong).toEqual([]);
    });
  });

  test('TC-SR-GRD-005: A row never saved shows no modification time', async () => {
    await about(
      `Rows with no saved record yet show Modified By "-"; their Modified On should be empty too, not a time. ${PW.state} Audio ` +
        'Conferencing has no saved record.',
    );
    await sr.open(EDIT_OFFICE);
    await sr.choose('state', PW.state);
    await sr.search();
    const row = await sr.readRow(sr.row('Audio Conferencing'));
    await verify('Modified By "-" and Modified On "-"', async () => {
      expect(row['Modified By']).toBe('-');
      expect(row['Modified On']).toBe('-');
    });
  });
});

test.describe('Special Rate — dates and sorting (UTC)', () => {
  let sr: SpecialRatePage;

  test.beforeEach(async ({ utcPage, config }) => {
    sr = new SpecialRatePage(utcPage, config);
    await sr.open(EDIT_OFFICE);
  });

  test('TC-SR-SRC-015: The Effective Date picks the record in effect that day', async () => {
    const r = PW.asOf;
    await about(`${PW.state} ${r.taxType} has a Special record from ${r.since}; the day before shows its earlier record from ${r.before}.`);
    const before = await sr.readRow(await sr.findRow(PW.state, r.taxType, '01/01/2099'));
    const on = await sr.readRow(await sr.findRow(PW.state, r.taxType, r.since));
    await verify(`01/01/2099: the ${r.before} record, not special`, async () => {
      expect(before).toMatchObject({ 'Effective Date': r.before, Special: 'No' });
    });
    await verify(`${r.since}: the special record, rate ${r.rate}`, async () => {
      expect(on).toMatchObject({ 'Effective Date': r.since, Special: 'Yes', 'State Special': r.rate, 'Special Combined': r.rate, 'Total Combined': r.rate, Notes: r.notes });
    });
  });

  test('TC-SR-GRD-001: Sorting by Effective Date orders the rows', async () => {
    await about(`Sort ascending and descending on Effective Date ask the server to sort and order the ${PW.state} rows by date.`);
    await sr.choose('state', PW.state);
    await sr.search();
    const asDate = (d: string) => { const [m, day, y] = d.split('/'); return `${y}${m}${day}`; };
    for (const dir of ['ascending', 'descending'] as const) {
      const sent = await phase(`Sort ${dir}`, () => sr.sortBy('Effective Date', dir));
      const dates = (await sr.readColumn('Effective Date')).map(asDate);
      await verify(`Sorted ${dir} by Effective Date`, async () => {
        expect(sent).toMatchObject({ sortBy: 'effectiveDate', sortDescending: dir === 'descending' });
        const sorted = [...dates].sort();
        expect(dates).toEqual(dir === 'ascending' ? sorted : sorted.reverse());
      });
    }
  });

  test('TC-SR-GRD-002: Sorting by State Special orders the rows by rate', async () => {
    await about('Sort descending on State Special lists the highest rates first (AR: 1% rows before 0% rows).');
    await sr.choose('state', 'AR');
    await sr.search();
    await sr.sortBy('State Special', 'descending');
    const rates = (await sr.readColumn('State Special')).map((v) => Number(v || 0));
    await verify('Rates never go up down the list; the top rate is above 0', async () => {
      expect(rates[0]).toBeGreaterThan(0);
      expect(rates).toEqual([...rates].sort((a, b) => b - a));
    });
  });
});
