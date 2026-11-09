import { test, expect } from '../../src/fixtures/pages.fixture';
import { SpecialRatePage, addDays, wireDate, GridRow, dayText } from '../../src/pages/taxes/special-rate.page';
import { phase, verify, about, attachNote } from '../../src/fixtures/report-steps';
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
  ALERT,
  NOTES_MAX,
  NOTE_PREFIX,
  LATEST_AS_OF,
  FUTURE_FLOOR,
  JAN_2006,
  COUNTY_HISTORY,
  YEAR_2006,
  HISTORY_COLUMNS,
  PAGE_SIZES,
} from '../../src/data/taxes/special-rate';

// Tax → Special Rate (NM-4022): the special and taxable rates of each place and tax type, by effective date,
// on the Basic Information and Special Rate History tabs. Covered: opening the page, the search, the
// keyboard, the grid and its sorting, the search date, field validation, the unsaved-changes guard, saving,
// the History tab on every office, a user in a US time zone and the tooltips. The save cases write real E2E
// data and put it back.

const ALL_ROWS = STATES.length * ROWS_PER_PLACE;

const NEXT = addDays(PW.editSince, 1);

const yyyymmdd = (d: string) => { const [m, day, y] = d.split('/'); return `${y}${m}${day}`; };

/** The day after a row's latest record, but never before FUTURE_FLOOR, so a save cannot change today's taxes. */
const nextDay = (latest: string) => { const d = addDays(latest, 1); return yyyymmdd(d) < yyyymmdd(FUTURE_FLOOR) ? FUTURE_FLOOR : d; };

const note = (tag: string) => `${NOTE_PREFIX}-${tag}-${Date.now()}`;

const US_ZONE = 'America/New_York';
const TYPED = '01/15/2030';
const STORED_US = addDays(PW.editSince, -1);

test.describe.configure({ timeout: 180_000 });

test.describe('Special Rate @taxes', () => {
  let sr: SpecialRatePage;

  // Basic Information tab: opening the page, the search criteria and the results grid. Nothing here saves.
  // Cases that read dates run on a UTC page, where dates show as stored.
  test.describe('A. Page load', () => {
    test.describe.configure({ timeout: 240_000 });

    test.beforeEach(async ({ authenticatedSession, config }) => {
      sr = new SpecialRatePage(authenticatedSession.page, config);
    });

    for (const office of SR_OFFICES) {
      test.describe(officeLabel(office), () => {
        test(`TC-TAX-SPR-004: Special Rate opens from the Tax menu with its defaults`, { tag: '@C107684' }, async () => {
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
      });
    }

    test('TC-TAX-SPR-001: The information icon explains the page', { tag: '@C107681' }, async () => {
      await about('Hovering the (i) beside the heading shows what the page is for.');
      await sr.open(EDIT_OFFICE);
      await verify('Tooltip text', async () => {
        expect(await sr.getInfoTooltip()).toBe(TEXT.info);
      });
    });

    test('TC-TAX-SPR-002: Without a session the page sends the user to sign in', { tag: '@C107682' }, async ({ browser, config }) => {
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

    test('TC-TAX-SPR-003: The grid shows the seventeen special rate columns', { tag: '@C107683' }, async () => {
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
  });

  test.describe('B. Search', () => {
    test.describe.configure({ timeout: 240_000 });

    test.beforeEach(async ({ authenticatedSession, config }) => {
      sr = new SpecialRatePage(authenticatedSession.page, config);
    });

    for (const office of SR_OFFICES) {
      test.describe(officeLabel(office), () => {
        test(`TC-TAX-SPR-018: Searching with every filter on All lists each state's tax types`, { tag: '@C107698' }, async () => {
          await about(`With no filter, the grid lists one state-level row per state and tax type (${STATES.length} × ${ROWS_PER_PLACE}), the same on every office.`);
          await sr.open(office.code);
          const count = await phase('Search with the default criteria', () => sr.search());
          await verify(`${ALL_ROWS} records, starting with AK`, async () => {
            expect(count).toBe(ALL_ROWS);
            expect((await sr.readRow(sr.firstRow())).State).toBe('AK');
          });
        });
      });
    }

    test('TC-TAX-SPR-005: State, Tax Type, Special? and Taxable offer their full lists', { tag: '@C107685' }, async () => {
      await about('State lists the US states, DC and territories; Tax Type lists the forty tax types; Special? and Taxable offer All, Yes and No.');
      await sr.open(EDIT_OFFICE);
      await verify('State options', async () => expect(await sr.getOptions('state')).toEqual(['All', ...STATES]));
      await verify('Tax Type options', async () => expect(await sr.getOptions('taxType')).toEqual(['All', ...TAX_TYPES]));
      await verify('Special? options', async () => expect(await sr.getOptions('special')).toEqual([...YES_NO]));
      await verify('Taxable options', async () => expect(await sr.getOptions('taxable')).toEqual([...YES_NO]));
    });

    test('TC-TAX-SPR-006: County opens after a State and City after a County', { tag: '@C107686' }, async () => {
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

    test('TC-TAX-SPR-007: County and City start on All, with no blank choice', { tag: '@C107687' }, async () => {
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

    test('TC-TAX-SPR-008: A State search lists that state\'s row for each tax type', { tag: '@C107688' }, async () => {
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

    test('TC-TAX-SPR-009: A County search lists that county\'s rows', { tag: '@C107689' }, async () => {
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

    test('TC-TAX-SPR-010: A City search lists that city\'s rows by zip code', { tag: '@C107690' }, async () => {
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

    test('TC-TAX-SPR-011: Choosing another State clears County and City', { tag: '@C107691' }, async () => {
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

    test('TC-TAX-SPR-012: Tax Type limits the rows to that tax type', { tag: '@C107692' }, async () => {
      await about('Choosing Power lists the Power row of every state, and nothing else.');
      await sr.open(EDIT_OFFICE);
      await sr.choose('taxType', 'Power');
      const count = await phase('Search Power', () => sr.search());
      await verify(`${STATES.length} rows, all Power`, async () => {
        expect(count).toBe(STATES.length);
        expect(new Set(await sr.readColumn('Tax Type'))).toEqual(new Set(['Power']));
      });
    });

    for (const [filter, id, tag] of [['special', 'TC-TAX-SPR-013', '@C107693'], ['taxable', 'TC-TAX-SPR-014', '@C107694']] as const) {
      const column = filter === 'special' ? 'Special' : 'Taxable';
      test(`${id}: ${column === 'Special' ? 'Special?' : 'Taxable'} Yes and No split the rows`, { tag }, async () => {
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

    test('TC-TAX-SPR-015: An empty or impossible Effective Date stops the search', { tag: '@C107695' }, async () => {
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

    test('TC-TAX-SPR-016: Reset puts back the default criteria and clears the grid', { tag: '@C107696' }, async () => {
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

    test('TC-TAX-SPR-017: The search panel can be collapsed and expanded', { tag: '@C107697' }, async () => {
      await about('Collapsing hides the criteria (Search leaves the screen) and expanding brings them back.');
      await sr.open(EDIT_OFFICE);
      await sr.collapseFilters();
      await verify('Collapsed: Search is off screen', async () => expect(sr.searchButton()).not.toBeInViewport());
      await sr.expandFilters();
      await verify('Expanded: Search is back', async () => expect(sr.searchButton()).toBeInViewport());
    });
  });

  test.describe('C. Keyboard', () => {
    test.describe.configure({ timeout: 240_000 });

    test.beforeEach(async ({ authenticatedSession, config }) => {
      sr = new SpecialRatePage(authenticatedSession.page, config);
    });

    test('TC-TAX-SPR-019: The search panel works from the keyboard', { tag: '@C107699' }, async () => {
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
  });

  test.describe('D. Grid', () => {
    test.describe.configure({ timeout: 240_000 });

    test.beforeEach(async ({ authenticatedSession, config }) => {
      sr = new SpecialRatePage(authenticatedSession.page, config);
    });

    test('TC-TAX-SPR-020: A moved column stays moved until Reset to Default View', { tag: '@C107700' }, async () => {
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

    test('TC-TAX-SPR-021: A column can be widened by dragging its edge', { tag: '@C107701' }, async () => {
      // The table shares out the width again as a column grows, so the column gains less than the mouse moved.
      await about('Dragging the right edge of Tax Type 200 px to the right makes the column clearly wider.');
      await sr.open(EDIT_OFFICE);
      const before = await sr.columnWidth('Tax Type');
      const after = await sr.resizeColumn('Tax Type', 200);
      await verify(`Wider than before (${before} px) by more than 50 px`, async () => {
        expect(after).toBeGreaterThan(before + 50);
      });
    });

    test('TC-TAX-SPR-022: A column can be hidden and the default view restored', { tag: '@C107702' }, async () => {
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

    test('TC-TAX-SPR-023: Special Combined and Total Combined add up', { tag: '@C107703' }, async () => {
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

    test('TC-TAX-SPR-024: A row never saved shows no modification time', { tag: '@C107704' }, async () => {
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

  test.describe('E. Search date', () => {
    test.describe.configure({ timeout: 240_000 });

    test.beforeEach(async ({ utcPage, config }) => {
      sr = new SpecialRatePage(utcPage, config);
      await sr.open(EDIT_OFFICE);
    });

    test('TC-TAX-SPR-025: The Effective Date picks the record in effect that day', { tag: '@C107705' }, async () => {
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
  });

  test.describe('F. Grid sorting', () => {
    test.describe.configure({ timeout: 240_000 });

    test.beforeEach(async ({ utcPage, config }) => {
      sr = new SpecialRatePage(utcPage, config);
      await sr.open(EDIT_OFFICE);
    });

    test('TC-TAX-SPR-026: Sorting by Effective Date orders the rows', { tag: '@C107706' }, async () => {
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

    test('TC-TAX-SPR-027: Sorting by State Special orders the rows by rate', { tag: '@C107707' }, async () => {
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

  // Basic Information tab: editing rules and the unsaved-changes guard. These cases edit Palau's Rental row
  // (record of 01/19/2006) and never store anything: where a save is needed the server reply is given in the
  // browser. They run on a UTC page, where dates show as stored.
  test.describe('G. Field validation', () => {
    test.beforeEach(async ({ utcPage, config }) => {
      sr = new SpecialRatePage(utcPage, config);
      await sr.open(EDIT_OFFICE);
    });

    const editRow = async () => {
      await sr.choose('state', PW.state);
      await sr.search();
      return sr.row(PW.edit);
    };

    test('TC-TAX-SPR-028: Only Taxable, Special, Effective Date and Notes can be edited; the rate box follows the row level', { tag: '@C107708' }, async () => {
      await about(
        'A state-level row offers Taxable, Special, Effective Date and Notes. Ticking Special opens the rate box of the row\'s own level: ' +
          'State Special on a state row, County Special on a county row, City Special on a city row.',
      );
      const row = await editRow();
      const taxable = [await sr.toggle(row, 'Taxable'), await sr.toggle(row, 'Taxable')];
      await sr.toggle(row, 'Special');
      // Taxable and Special are checkboxes only while being clicked, so the inputs left are the other editors.
      const stateEditable = await sr.editableColumns(row);
      const stateRate = await sr.rateColumn(row);
      await sr.clickSearch();
      await sr.discard();
      await sr.choose('state', PLACE.state);
      await sr.choose('county', PLACE.county);
      await sr.search();
      await sr.toggle(sr.firstRow(), 'Special');
      const countyRate = await sr.rateColumn(sr.firstRow());
      await sr.clickSearch();
      await sr.discard();
      await sr.choose('city', PLACE.city);
      await sr.search();
      await sr.toggle(sr.firstRow(), 'Special');
      const cityRate = await sr.rateColumn(sr.firstRow());
      await verify('State row: Taxable and Special tick on and off; the other editors are Effective Date, State Special (rate) and Notes', async () => {
        expect(taxable).toEqual(['Yes', 'No']);
        expect(stateEditable).toEqual(['Effective Date', 'State Special', 'Notes']);
        expect(stateRate).toBe('State Special');
      });
      await verify('County row: County Special; city row: City Special', async () => {
        expect(countyRate).toBe('County Special');
        expect(cityRate).toBe('City Special');
      });
    });

    for (const [column, id, tag] of [['Special', 'TC-TAX-SPR-029', '@C107709'], ['Taxable', 'TC-TAX-SPR-030', '@C107710']] as const) {
      test(`${id}: Changing ${column} needs a new Effective Date`, { tag }, async () => {
        await about(`Changing ${column} without changing the date marks the row and keeps Save off.`);
        const row = await editRow();
        await sr.toggle(row, column);
        await verify(`"${ALERT.newDateNeeded}"; Save is disabled`, async () => {
          expect(await sr.getRowMessages(row)).toEqual([ALERT.newDateNeeded]);
          expect(await sr.isSaveEnabled()).toBe(false);
        });
      });
    }

    test('TC-TAX-SPR-031: A row changed without a new date is marked and cannot be saved', { tag: '@C107711' }, async () => {
      await about('After ticking Special without a new date, the row is marked with the warning icon, whose title holds the reason, and Save is off.');
      const row = await editRow();
      await sr.toggle(row, 'Special');
      await verify(`The warning holds "${ALERT.newDateNeeded}"; Save is disabled`, async () => {
        expect(await sr.getRowMessages(row)).toEqual([ALERT.newDateNeeded]);
        expect(await sr.isSaveEnabled()).toBe(false);
      });
    });

    test('TC-TAX-SPR-032: The new Effective Date must be after the current record', { tag: '@C107712' }, async () => {
      await about(`Rental's record applies from ${PW.editSince}; a date before it is refused, the day after is accepted.`);
      const row = await editRow();
      await sr.toggle(row, 'Special');
      await sr.editRate(row, '2');
      await sr.editDate(row, '01/01/2006');
      await verify(`01/01/2006: "${ALERT.dateAfter(PW.editSince)}"; Save is disabled`, async () => {
        expect(await sr.getRowMessages(row)).toEqual([ALERT.dateAfter(PW.editSince)]);
        expect(await sr.isSaveEnabled()).toBe(false);
      });
      await sr.editDate(row, NEXT);
      await verify(`${NEXT}: no message; Save is enabled`, async () => {
        expect(await sr.getRowMessages(row)).toEqual([]);
        expect(await sr.isSaveEnabled()).toBe(true);
      });
    });

    test('TC-TAX-SPR-033: An empty or impossible Effective Date is refused', { tag: '@C107713' }, async () => {
      await about('Clearing the row\'s date gives "Required"; 13/45/2099 gives "Invalid date"; Save stays off.');
      const row = await editRow();
      await sr.toggle(row, 'Special');
      await sr.editRate(row, '2');
      await sr.editDate(row, '');
      await verify(`Empty: "${ALERT.required}"`, async () => {
        expect(await sr.getRowMessages(row)).toEqual([ALERT.required]);
        expect(await sr.isSaveEnabled()).toBe(false);
      });
      await sr.editDate(row, '13/45/2099');
      await verify(`13/45/2099: "${ALERT.invalidDate}"`, async () => {
        expect(await sr.getRowMessages(row)).toEqual([ALERT.invalidDate]);
        expect(await sr.isSaveEnabled()).toBe(false);
      });
    });

    test('TC-TAX-SPR-034: A day picked in the row calendar is the day shown', { tag: '@C107714' }, async () => {
      await about('Opening the row calendar and picking the 20th puts the 20th of that month in the cell.');
      const row = await editRow();
      await sr.toggle(row, 'Special');
      const picked = await sr.pickCalendarDay(row, 20);
      await verify('The cell shows the 20th of the month the calendar showed', async () => {
        const [month, year] = picked.shownMonth.split(' ');
        const m = new Date(`1 ${month} ${year}`).getMonth() + 1;
        expect(picked.value).toBe(`${String(m).padStart(2, '0')}/20/${year}`);
      });
    });

    test('TC-TAX-SPR-035: Notes keep at most 500 characters', { tag: '@C107715' }, async () => {
      await about(`Typing 600 characters into Notes keeps the first ${NOTES_MAX}.`);
      const row = await editRow();
      const kept = await sr.editNotes(row, 'N'.repeat(600));
      await verify(`maxlength ${NOTES_MAX}; ${NOTES_MAX} characters kept`, async () => {
        expect(await sr.notesMaxLength(row)).toBe(NOTES_MAX);
        expect(kept).toHaveLength(NOTES_MAX);
      });
    });

    test('TC-TAX-SPR-036: Changing only Notes can be saved, or the page says why not', { tag: '@C107716' }, async () => {
      await about('Notes is editable on its own; after changing only Notes, Save should turn on — or the row should say what else is needed.');
      const row = await editRow();
      await sr.editNotes(row, 'SR-AUTO note only');
      const messages = await sr.getRowMessages(row);
      const canSave = await sr.isSaveEnabled();
      await verify('Save is enabled, or the row carries a message', async () => {
        expect(canSave || messages.length > 0, `Save enabled: ${canSave}; row messages: ${JSON.stringify(messages)}`).toBe(true);
      });
    });

    test('TC-TAX-SPR-037: A rate typed in percent is stored as a fraction', { tag: '@C107717' }, async () => {
      await about('Rates are shown as fractions (0.010000 = 1%). Typing 2, 1.25 or 1 means that many percent: 0.020000, 0.012500, 0.010000.');
      const row = await editRow();
      await sr.toggle(row, 'Special');
      const shown: Record<string, string> = {};
      for (const v of ['2', '1.25', '1']) shown[v] = await sr.editRate(row, v);
      await verify('2 → 0.020000, 1.25 → 0.012500, 1 → 0.010000', async () => {
        expect(shown).toEqual({ '2': '0.020000', '1.25': '0.012500', '1': '0.010000' });
      });
    });

    test('TC-TAX-SPR-038: A rate below 1 percent is read in percent too', { tag: '@C107718' }, async () => {
      await about('Typing 0.5 means half a percent like any other typed rate, so the box should show 0.005000 — not 0.500000, which is 50%.');
      const row = await editRow();
      await sr.toggle(row, 'Special');
      const shown = await sr.editRate(row, '0.5');
      await verify('0.5 → 0.005000', async () => {
        expect(shown).toBe('0.005000');
      });
    });

    for (const [id, tag, value, kept, what] of [['TC-TAX-SPR-039', '@C107719', '150', '1.000000', 'over 100% is capped at 100%'], ['TC-TAX-SPR-040', '@C107720', '-1', '0.000000', 'below 0 is raised to 0']] as const) {
      test(`${id}: A rate ${what}`, { tag }, async () => {
        await about(`The rate box keeps rates between 0% and 100%: typing ${value} leaves ${kept} in the box, and with a new date the row can be saved.`);
        const row = await editRow();
        await sr.toggle(row, 'Special');
        const shown = await sr.editRate(row, value);
        await sr.editDate(row, NEXT);
        await verify(`${value} → ${kept}; no message; Save enabled`, async () => {
          expect(shown).toBe(kept);
          expect(await sr.getRowMessages(row)).toEqual([]);
          expect(await sr.isSaveEnabled()).toBe(true);
        });
      });
    }

    test('TC-TAX-SPR-041: A rate keeps six decimals', { tag: '@C107721' }, async () => {
      await about('Typing 1.23456789 (percent) gives 0.012346, rounded to six decimals.');
      const row = await editRow();
      await sr.toggle(row, 'Special');
      await verify('1.23456789 → 0.012346', async () => expect(await sr.editRate(row, '1.23456789')).toBe('0.012346'));
    });

    test('TC-TAX-SPR-042: Save sends exactly what was entered', { tag: '@C107722' }, async () => {
      await about('Special, a 2% rate, Notes and the next day are sent as one record for the row. The server reply is given in the browser, so nothing is stored.');
      const row = await editRow();
      const stop = await sr.answerSavesWithSuccess();
      try {
        await sr.toggle(row, 'Special');
        await sr.editRate(row, '2');
        await sr.editNotes(row, 'SR-AUTO sent');
        await sr.editDate(row, NEXT);
        const result = await phase('Save', () => sr.save());
        await verify(`One record: ${PW.state} ${PW.edit}, Special, 0.02, ${NEXT}, the note`, async () => {
          expect(result.toast).toBe(TEXT.saved);
          expect(result.records).toHaveLength(1);
          expect(result.records[0]).toMatchObject({
            stateName: PW.state, taxTypeName: PW.edit, special: true, specialRate: 0.02, stateSpecialRate: 0.02, taxable: false,
            effectiveDate: wireDate(NEXT), notes: 'SR-AUTO sent',
          });
        });
      } finally {
        await stop();
      }
    });
  });

  test.describe('H. Unsaved changes', () => {
    test.beforeEach(async ({ utcPage, config }) => {
      sr = new SpecialRatePage(utcPage, config);
      await sr.open(EDIT_OFFICE);
      await sr.choose('state', PW.state);
      await sr.search();
      await sr.toggle(sr.row(PW.edit), 'Special');
    });

    const special = async () => (await sr.readRow(sr.row(PW.edit))).Special;

    test('TC-TAX-SPR-043: Searching with unsaved changes asks first; Stay keeps them', { tag: '@C107723' }, async () => {
      await about('With Special ticked on Rental, Search opens "Unsaved changes"; Stay closes it and keeps the edit.');
      await sr.clickSearch();
      await verify('The dialog and its text', async () => {
        expect(await sr.getUnsavedDialogText()).toContain(TEXT.unsavedBody);
      });
      await sr.stay();
      await verify('Rental is still ticked Special', async () => expect(await special()).toBe('Yes'));
    });

    test('TC-TAX-SPR-044: Discard drops the changes and searches', { tag: '@C107724' }, async () => {
      await about('Choosing Discard drops the edit and runs the search: Rental is back to not Special.');
      await sr.clickSearch();
      await sr.getUnsavedDialogText();
      await sr.discard();
      await verify('Rental is not Special; Save is off', async () => {
        await expect.poll(special).toBe('No');
        expect(await sr.isSaveEnabled()).toBe(false);
      });
    });

    test('TC-TAX-SPR-045: Reset with unsaved changes asks first; Discard resets', { tag: '@C107725' }, async () => {
      await about('Reset with an edit opens "Unsaved changes"; Discard then resets the criteria and empties the grid.');
      await sr.reset();
      await sr.getUnsavedDialogText();
      await sr.discard();
      await verify('Criteria back to All; the grid asks for a search', async () => {
        await expect.poll(() => sr.getCount()).toBe(0);
        expect((await sr.getCriteria()).state).toBe('All');
      });
    });

    test('TC-TAX-SPR-046: Switching tab with unsaved changes asks first', { tag: '@C107726' }, async () => {
      await about('Clicking Special Rate History with an edit opens "Unsaved changes": Stay keeps Basic Information and the edit; Discard opens the history.');
      await sr.clickTab('Special Rate History');
      await sr.getUnsavedDialogText();
      await sr.stay();
      await verify('Still on Basic Information, Rental still Special', async () => {
        expect(await sr.selectedTab()).toBe('Basic Information');
        expect(await special()).toBe('Yes');
      });
      await sr.clickTab('Special Rate History');
      await sr.getUnsavedDialogText();
      await sr.discard();
      await verify('Special Rate History is open', async () => expect(await sr.selectedTab()).toBe('Special Rate History'));
    });

    test('TC-TAX-SPR-047: Closing the dialog keeps the changes', { tag: '@C107727' }, async () => {
      await about('Close (×) on "Unsaved changes" behaves like Stay.');
      await sr.clickSearch();
      await sr.getUnsavedDialogText();
      await sr.closeDialog();
      await verify('Rental still Special', async () => expect(await special()).toBe('Yes'));
    });

    test('TC-TAX-SPR-048: Reloading with unsaved changes asks the browser first', { tag: '@C107728' }, async () => {
      await about('Reloading with an edit makes the browser ask before leaving (the test session then confirms leaving).');
      const asked = await sr.reloadAndWatchPrompt();
      await verify('A leave-page prompt was raised', async () => {
        expect(asked).toBe('beforeunload');
      });
    });
  });

  // Saving. These cases write real E2E records on Palau's Rigging and Sales rows and put them back
  // afterwards. A change needs a new effective date and is added as a new record; records cannot be deleted,
  // so the original values are put back by one more record dated a day later. Every record is dated after the
  // row's latest one and never before 01/03/2099, so today's taxes never change. The page shows dates as
  // stored only in UTC, so this runs on a UTC page (utcPage).
  test.describe('I. Save', () => {
    test.describe.configure({ timeout: 300_000 });

    test.beforeEach(async ({ utcPage, config }) => {
      sr = new SpecialRatePage(utcPage, config);
    });

    /** Lists Palau's latest records and returns the named rows as they are now. */
    async function openLatest(taxTypes: string[]): Promise<Record<string, GridRow>> {
      await sr.open(EDIT_OFFICE);
      await sr.choose('state', PW.state);
      await sr.setSearchDate(LATEST_AS_OF);
      await sr.search();
      const rows: Record<string, GridRow> = {};
      for (const t of taxTypes) rows[t] = await sr.readRow(sr.row(t));
      return rows;
    }

    /**
     * Puts a row back to plain (not Special, the given Taxable) by one more record dated a day after its latest,
     * unless it already is.
     */
    async function restore(taxType: string, taxable: string): Promise<void> {
      const now = (await openLatest([taxType]))[taxType]!;
      if (now.Special === 'No' && now.Taxable === taxable) return;
      const row = sr.row(taxType);
      if (now.Special !== 'No') await sr.toggle(row, 'Special');
      if (now.Taxable !== taxable) await sr.toggle(row, 'Taxable');
      await sr.editNotes(row, '');
      await sr.editDate(row, nextDay(now['Effective Date']!));
      expect((await sr.save()).toast, `restoring ${PW.state} ${taxType}`).toBe(TEXT.saved);
    }

    async function todayDay(): Promise<[number, number, number]> {
      const [m, d, y] = (await sr.browserToday()).split('/').map(Number) as [number, number, number];
      return [y, m, d];
    }

    test('TC-TAX-SPR-049: A special rate is saved as a new record from its effective date', { tag: '@C107729' }, async () => {
      await about(
        `Ticking Special on ${PW.state} ${PW.save} with 1.5% and a note, from the day after its latest record, saves one record: the rate ` +
          'applies from that day with the combined columns, and the earlier record still applies before it.',
      );
      const before = (await openLatest([PW.save]))[PW.save]!;
      const latest = before['Effective Date']!;
      const day = nextDay(latest);
      const text = note('SAV1');
      await attachNote('Dates', `latest record ${latest}; new record ${day}; restore record ${addDays(day, 1)}`);
      try {
        const row = sr.row(PW.save);
        await sr.toggle(row, 'Special');
        await sr.editRate(row, '1.5');
        await sr.editNotes(row, text);
        await sr.editDate(row, day);
        const result = await phase('Save', () => sr.save());
        await verify('Saved; one record sent, dated midnight UTC; Save is off again', async () => {
          expect(result).toMatchObject({ ok: true, toast: TEXT.saved });
          expect(result.records).toHaveLength(1);
          expect(result.records[0]).toMatchObject({
            stateName: PW.state, taxTypeName: PW.save, special: true, specialRate: 0.015, stateSpecialRate: 0.015,
            effectiveDate: wireDate(day), notes: text,
          });
          expect(await sr.isSaveEnabled()).toBe(false);
        });
        await verify(`As of ${day}: Special 0.015000, the combined columns, the note and who saved it`, async () => {
          const saved = await sr.readRow(await sr.findRow(PW.state, PW.save, day));
          expect(saved).toMatchObject({
            'Effective Date': day, Special: 'Yes', 'State Special': '0.015000', 'Special Combined': '0.015000', 'Total Combined': '0.015000', Notes: text,
          });
          expect(saved['Modified By']).toMatch(/@/);
        });
        await verify(`As of ${latest}: the earlier record, unchanged`, async () => {
          expect(await sr.readRow(await sr.findRow(PW.state, PW.save, latest))).toMatchObject({ 'Effective Date': latest, Special: before.Special });
        });
      } finally {
        await restore(PW.save, before.Taxable!);
      }
    });

    test('TC-TAX-SPR-050: A changed Taxable setting is saved', { tag: '@C107730' }, async () => {
      await about(`Switching Taxable on ${PW.state} ${PW.save} with the next day saves a record with the new setting.`);
      const before = (await openLatest([PW.save]))[PW.save]!;
      const day = nextDay(before['Effective Date']!);
      const flipped = before.Taxable === 'Yes' ? 'No' : 'Yes';
      try {
        const row = sr.row(PW.save);
        await sr.toggle(row, 'Taxable');
        await sr.editDate(row, day);
        const result = await phase('Save', () => sr.save());
        await verify(`Saved; the record sent has Taxable ${flipped}`, async () => {
          expect(result.toast).toBe(TEXT.saved);
          expect(result.records[0]).toMatchObject({ taxTypeName: PW.save, taxable: flipped === 'Yes', effectiveDate: wireDate(day) });
        });
        await openLatest([PW.save]);
        await verify(`The latest record shows Taxable ${flipped} from ${day}`, async () => {
          expect(await sr.readRow(sr.row(PW.save))).toMatchObject({ Taxable: flipped, 'Effective Date': day });
        });
      } finally {
        await restore(PW.save, before.Taxable!);
      }
    });

    test('TC-TAX-SPR-051: Changes on two rows are saved together', { tag: '@C107731' }, async () => {
      await about(`Special rates typed on ${PW.save} and ${PW.saveOther} are both sent and stored by one Save.`);
      const before = await openLatest([PW.save, PW.saveOther]);
      const rates = { [PW.save]: '2', [PW.saveOther]: '3' };
      try {
        for (const t of [PW.save, PW.saveOther]) {
          const row = sr.row(t);
          await sr.toggle(row, 'Special');
          await sr.editRate(row, rates[t]!);
          await sr.editDate(row, nextDay(before[t]!['Effective Date']!));
        }
        const result = await phase('Save once', () => sr.save());
        await verify('Saved; both rows were sent', async () => {
          expect(result.toast).toBe(TEXT.saved);
          expect(result.records.map((r) => [r.taxTypeName, r.specialRate])).toEqual([[PW.save, 0.02], [PW.saveOther, 0.03]]);
        });
        const after = await openLatest([PW.save, PW.saveOther]);
        await verify('Both rows show their rate from their next day', async () => {
          expect(after[PW.save]).toMatchObject({ Special: 'Yes', 'State Special': '0.020000' });
          expect(after[PW.saveOther]).toMatchObject({ Special: 'Yes', 'State Special': '0.030000' });
        });
      } finally {
        await restore(PW.save, before[PW.save]!.Taxable!);
        await restore(PW.saveOther, before[PW.saveOther]!.Taxable!);
      }
    });

    test('TC-TAX-SPR-052: Unticking Special saves the rate as 0', { tag: '@C107732' }, async () => {
      await about(`After a special rate is saved on ${PW.save}, unticking Special with a later date saves a record that is not special and has no rate.`);
      const before = (await openLatest([PW.save]))[PW.save]!;
      try {
        let row = sr.row(PW.save);
        await sr.toggle(row, 'Special');
        await sr.editRate(row, '2');
        await sr.editDate(row, nextDay(before['Effective Date']!));
        await sr.save();
        const special = (await openLatest([PW.save]))[PW.save]!;
        row = sr.row(PW.save);
        await sr.toggle(row, 'Special');
        const day = nextDay(special['Effective Date']!);
        await sr.editDate(row, day);
        const result = await phase('Save with Special unticked', () => sr.save());
        await verify('The record sent is not special, rate 0', async () => {
          expect(result.toast).toBe(TEXT.saved);
          expect(result.records[0]).toMatchObject({ special: false, specialRate: 0, stateSpecialRate: 0, effectiveDate: wireDate(day) });
        });
        await openLatest([PW.save]);
        await verify(`From ${day}: not special, rates 0`, async () => {
          expect(await sr.readRow(sr.row(PW.save))).toMatchObject({ Special: 'No', 'Special Combined': '0.000000', 'Total Combined': '0.000000', 'Effective Date': day });
        });
      } finally {
        await restore(PW.save, before.Taxable!);
      }
    });

    test('TC-TAX-SPR-053: A saved record appears in Special Rate History', { tag: '@C107733' }, async () => {
      await about(`A special rate saved on ${PW.saveOther} is listed in Special Rate History for a range reaching its effective date, with its note.`);
      const before = (await openLatest([PW.saveOther]))[PW.saveOther]!;
      const day = nextDay(before['Effective Date']!);
      const text = note('HIS');
      try {
        const row = sr.row(PW.saveOther);
        await sr.toggle(row, 'Special');
        await sr.editRate(row, '1');
        await sr.editNotes(row, text);
        await sr.editDate(row, day);
        expect((await sr.save()).toast).toBe(TEXT.saved);
        await sr.openTab('Special Rate History');
        await sr.choose('state', PW.state);
        await sr.choose('taxType', PW.saveOther);
        const [m, d, y] = day.split('/').map(Number) as [number, number, number];
        const today = await todayDay();
        expect(await sr.setDateRange(today, [y, m, d])).toBe(`${await sr.browserToday()} - ${day}`);
        await phase('Search the history up to the new date', () => sr.search());
        await verify(`A ${PW.saveOther} record from ${day}: Special, 0.010000, the note`, async () => {
          const notes = await sr.readColumn('Notes');
          const i = notes.indexOf(text);
          expect(i, `notes listed: ${JSON.stringify(notes)}`).toBeGreaterThanOrEqual(0);
          expect(await sr.readRow(sr.page.locator('main tbody tr:has(td + td)').nth(i))).toMatchObject({
            State: PW.state, 'Tax Type': PW.saveOther, Special: 'Yes', 'State Special': '0.010000', 'Effective Date': day,
          });
        });
      } finally {
        await restore(PW.saveOther, before.Taxable!);
      }
    });
    test('TC-TAX-SPR-054: A failed save keeps the changes and says so', { tag: '@C107734' }, async () => {
      await about('When the server rejects a save, an error is shown, the edit stays on screen with Save enabled, and nothing is stored.');
      const before = (await openLatest([PW.saveOther]))[PW.saveOther]!;
      const stop = await sr.failSaves();
      try {
        const row = sr.row(PW.saveOther);
        await sr.toggle(row, 'Special');
        await sr.editRate(row, '4');
        await sr.editDate(row, nextDay(before['Effective Date']!));
        const result = await phase('Save while the server fails', () => sr.save());
        await verify('Error message; the edit is kept and Save is still enabled', async () => {
          expect(result).toMatchObject({ ok: false, toast: TEXT.saveFailed });
          expect(await sr.readRow(row)).toMatchObject({ Special: 'Yes', 'State Special': '0.040000' });
          expect(await sr.isSaveEnabled()).toBe(true);
        });
      } finally {
        await stop();
      }
      await openLatest([PW.saveOther]);
      await verify('After reopening, the row is as it was', async () => {
        expect(await sr.readRow(sr.row(PW.saveOther))).toMatchObject({ Special: before.Special, 'Effective Date': before['Effective Date'] });
      });
    });

    test('TC-TAX-SPR-055: A Notes-only change updates the current record', { tag: '@C107735' }, async () => {
      await about(
        `Changing only the Notes of ${PW.save}'s latest record (2099 onward) and saving keeps its Effective Date: the record shows the new ` +
          'note from the same day, and Special Rate History lists the change as a new version of that day.',
      );
      // A Notes-only save keeps the date, so it is only made on a record the save cases wrote themselves.
      let before = (await openLatest([PW.save]))[PW.save]!;
      if (yyyymmdd(before['Effective Date']!) < yyyymmdd(FUTURE_FLOOR)) {
        await restore(PW.save, before.Taxable === 'Yes' ? 'No' : 'Yes');
        await restore(PW.save, before.Taxable!);
        before = (await openLatest([PW.save]))[PW.save]!;
      }
      const day = before['Effective Date']!;
      const text = note('NOTE');
      try {
        await sr.editNotes(sr.row(PW.save), text);
        const result = await phase('Save', () => sr.save());
        await verify(`Saved; the record sent keeps ${day}`, async () => {
          expect(result.toast).toBe(TEXT.saved);
          expect(result.records[0]).toMatchObject({ taxTypeName: PW.save, notes: text, effectiveDate: wireDate(day) });
        });
        await openLatest([PW.save]);
        await verify(`The latest record is still from ${day}, with the new note`, async () => {
          expect(await sr.readRow(sr.row(PW.save))).toMatchObject({ 'Effective Date': day, Notes: text, Special: before.Special });
        });
        await sr.openTab('Special Rate History');
        await sr.choose('state', PW.state);
        await sr.choose('taxType', PW.save);
        const [m, d, y] = day.split('/').map(Number) as [number, number, number];
        await sr.setDateRange(await todayDay(), [y, m, d]);
        await sr.search();
        // History keeps every saved version, newest first: the edit is listed above the version it replaced.
        await verify(`History lists the new version for ${day} first, above the earlier version of that day`, async () => {
          const dates = await sr.readColumn('Effective Date');
          const notes = await sr.readColumn('Notes');
          const sameDay = notes.filter((_, i) => dates[i] === day);
          expect(sameDay.length).toBeGreaterThanOrEqual(2);
          expect(sameDay[0]).toBe(text);
          expect(sameDay[1]).not.toBe(text);
        });
      } finally {
        await openLatest([PW.save]);
        if ((await sr.readRow(sr.row(PW.save))).Notes !== before.Notes) {
          await sr.editNotes(sr.row(PW.save), before.Notes ?? '');
          expect((await sr.save()).toast, 'restoring the note').toBe(TEXT.saved);
        }
      }
    });

    test('TC-TAX-SPR-056: A city row sends its rate as the city rate', { tag: '@C107736' }, async () => {
      await about(
        `On a city row (${PLACE.state} › ${PLACE.county} › ${PLACE.city}, by zip code) the rate typed with Special goes out as the City Special ` +
          'rate for that zip code. The server reply is given in the browser, so nothing is stored on the real city.',
      );
      await sr.open(EDIT_OFFICE);
      await sr.choose('state', PLACE.state);
      await sr.choose('county', PLACE.county);
      await sr.choose('city', PLACE.city);
      await sr.setSearchDate(LATEST_AS_OF);
      await sr.search();
      const row = sr.firstRow();
      const current = await sr.readRow(row);
      const stop = await sr.answerSavesWithSuccess();
      try {
        await sr.toggle(row, 'Special');
        await sr.editRate(row, '2');
        await sr.editDate(row, nextDay(current['Effective Date']!));
        const result = await phase('Save', () => sr.save());
        await verify('The record sent carries the city and its zip code, City Special 0.02, State and County Special 0', async () => {
          expect(result.records[0]).toMatchObject({
            stateName: PLACE.state, countyName: PLACE.county, cityName: PLACE.city, zipCode: current['Zip Code'], special: true,
            citySpecialRate: 0.02, stateSpecialRate: 0, countySpecialRate: 0,
          });
        });
      } finally {
        await stop();
      }
    });

    test('TC-TAX-SPR-057: A county row sends its rate as the county rate', { tag: '@C107737' }, async () => {
      await about(
        `On a county row (${PLACE.state} › ${PLACE.county}) the rate typed with Special goes out as the County Special rate. The server reply is ` +
          'given in the browser, so nothing is stored on the real county.',
      );
      await sr.open(EDIT_OFFICE);
      await sr.choose('state', PLACE.state);
      await sr.choose('county', PLACE.county);
      await sr.setSearchDate(LATEST_AS_OF);
      await sr.search();
      const row = sr.firstRow();
      const current = await sr.readRow(row);
      const stop = await sr.answerSavesWithSuccess();
      try {
        await sr.toggle(row, 'Special');
        await sr.editRate(row, '2');
        await sr.editDate(row, nextDay(current['Effective Date']!));
        const result = await phase('Save', () => sr.save());
        await verify('The record sent carries the county and County Special 0.02, State Special 0', async () => {
          expect(result.records[0]).toMatchObject({ stateName: PLACE.state, countyName: PLACE.county, special: true, countySpecialRate: 0.02, stateSpecialRate: 0 });
          expect(result.records[0]!.countyId).not.toBeNull();
        });
      } finally {
        await stop();
      }
    });
  });

  // Special Rate History tab: the records whose effective date falls in a date range, page by page. Nothing
  // here saves. It runs on a UTC page, where dates show as stored.
  test.describe('J. History', () => {
    test.describe.configure({ timeout: 240_000 });

    test.beforeEach(async ({ utcPage, config }) => {
      sr = new SpecialRatePage(utcPage, config);
      await sr.open(EDIT_OFFICE);
      await sr.openTab('Special Rate History');
    });

    test('TC-TAX-SPR-058: Special Rate History opens with its defaults', { tag: '@C107738' }, async () => {
      await about('The history tab opens with every filter on All, today to today as the range, fourteen columns, 50 rows per page and paging off.');
      const today = await sr.browserToday();
      await verify('Criteria: filters on All, County and City off, range today - today', async () => {
        expect(await sr.getCriteria()).toMatchObject({
          state: 'All', taxType: 'All', special: 'All', taxable: 'All', date: `${today} - ${today}`, countyEnabled: false, cityEnabled: false,
        });
      });
      await verify('Fourteen columns; the grid asks for a search', async () => {
        expect(await sr.getHeaders()).toEqual([...HISTORY_COLUMNS]);
        expect(await sr.getCount()).toBe(0);
        expect(await sr.isMessageVisible(TEXT.emptyHistory)).toBe(true);
      });
      await verify('50 rows per page (10 to 50 offered); every paging button off', async () => {
        expect(await sr.getPageSizes()).toEqual({ current: '50', options: [...PAGE_SIZES] });
        expect(await sr.pagingEnabled()).toEqual({ first: false, previous: false, next: false, last: false });
      });
    });

    test('TC-TAX-SPR-059: A range with no records says so', { tag: '@C107739' }, async () => {
      await about('Searching today to today, when no record takes effect today, lists nothing and says no history was found.');
      const count = await phase('Search today', () => sr.search());
      await verify(`0 records and "${TEXT.noHistory}"`, async () => {
        expect(count).toBe(0);
        expect(await sr.isMessageVisible(TEXT.noHistory)).toBe(true);
      });
    });

    test('TC-TAX-SPR-060: A state and range list that state\'s records of the period, read only', { tag: '@C107740' }, async () => {
      await about(`${JAN_2006.state} in January 2006 lists its ${JAN_2006.count} original records, all from ${JAN_2006.date}; history rows cannot be edited.`);
      await sr.choose('state', JAN_2006.state);
      const range = await sr.setDateRange(JAN_2006.from, JAN_2006.to);
      const count = await phase('Search', () => sr.search());
      await verify(`Range ${dayText(JAN_2006.from)} - ${dayText(JAN_2006.to)}; ${JAN_2006.count} records, all ${JAN_2006.state} from ${JAN_2006.date}`, async () => {
        expect(range).toBe(`${dayText(JAN_2006.from)} - ${dayText(JAN_2006.to)}`);
        expect(count).toBe(JAN_2006.count);
        expect(new Set(await sr.readColumn('State'))).toEqual(new Set([JAN_2006.state]));
        expect(new Set(await sr.readColumn('Effective Date'))).toEqual(new Set([JAN_2006.date]));
      });
      await verify('No row has an editable cell', async () => {
        expect(await sr.editableColumns(sr.firstRow())).toEqual([]);
      });
    });

    test('TC-TAX-SPR-061: The range filters on the Effective Date', { tag: '@C107741' }, async () => {
      await about('Every record listed for 2006 (all states) takes effect in 2006.');
      await sr.setDateRange(YEAR_2006.from, YEAR_2006.to);
      const count = await phase('Search 2006', () => sr.search());
      const dates = await sr.readColumn('Effective Date');
      await verify(`${count} records; every date on the page is in 2006`, async () => {
        expect(count).toBeGreaterThan(50);
        expect(dates.filter((d) => !d.endsWith('/2006'))).toEqual([]);
      });
    });

    test('TC-TAX-SPR-062: Paging moves through the records', { tag: '@C107742' }, async () => {
      await about('2006 holds several pages of 50: Next asks for page 2, Last for the last page (then Next/Last turn off), First returns to page 1.');
      await sr.setDateRange(YEAR_2006.from, YEAR_2006.to);
      const count = await sr.search();
      const pages = Math.ceil(count / 50);
      await verify(`Page 1 of ${pages}; 50 rows; First/Previous off, Next/Last on`, async () => {
        expect(await sr.getPagePosition()).toEqual({ page: 1, of: pages });
        expect(await sr.rowCount()).toBe(50);
        expect(await sr.pagingEnabled()).toEqual({ first: false, previous: false, next: true, last: true });
      });
      const firstRow = await sr.readRow(sr.firstRow());
      await verify('Next: page 2, other rows', async () => {
        expect(await sr.goToPage('next')).toBe(2);
        expect((await sr.getPagePosition()).page).toBe(2);
        expect(await sr.readRow(sr.firstRow())).not.toEqual(firstRow);
      });
      await verify(`Last: page ${pages} with the remaining ${count - (pages - 1) * 50} rows; Next/Last off`, async () => {
        expect(await sr.goToPage('last')).toBe(pages);
        expect(await sr.rowCount()).toBe(count - (pages - 1) * 50);
        expect(await sr.pagingEnabled()).toMatchObject({ next: false, last: false });
      });
      await verify('First: page 1 again', async () => {
        expect(await sr.goToPage('first')).toBe(1);
        expect(await sr.readRow(sr.firstRow())).toEqual(firstRow);
      });
    });

    test('TC-TAX-SPR-063: Rows per page changes the page size', { tag: '@C107743' }, async () => {
      await about('Choosing 10 rows per page asks the server for pages of 10 and recounts the pages.');
      await sr.setDateRange(YEAR_2006.from, YEAR_2006.to);
      const count = await sr.search();
      const sent = await phase('Choose 10 rows per page', () => sr.setPageSize('10'));
      await verify(`Pages of 10: 10 rows, ${Math.ceil(count / 10)} pages`, async () => {
        expect(sent).toBe(10);
        expect(await sr.rowCount()).toBe(10);
        expect(await sr.getPagePosition()).toEqual({ page: 1, of: Math.ceil(count / 10) });
      });
    });

    test('TC-TAX-SPR-064: The filters narrow the history', { tag: '@C107744' }, async () => {
      await about('Within 2006: State HI lists only HI, Tax Type Power only Power, Special? Yes only special records, Taxable No only non-taxable ones.');
      await sr.setDateRange(YEAR_2006.from, YEAR_2006.to);
      const all = await sr.search();
      const checks = [['state', 'HI', 'State'], ['taxType', 'Rental', 'Tax Type'], ['special', 'Yes', 'Special'], ['taxable', 'No', 'Taxable']] as const;
      for (const [filter, value, column] of checks) {
        await sr.choose(filter, value);
        const count = await phase(`Search with ${column} ${value}`, () => sr.search());
        await verify(`${column} ${value}: fewer records, every row ${value}`, async () => {
          expect(count).toBeGreaterThan(0);
          expect(count).toBeLessThan(all);
          expect(new Set(await sr.readColumn(column))).toEqual(new Set([value]));
        });
        await sr.choose(filter, 'All');
      }
    });

    test('TC-TAX-SPR-065: Sorting the history by Effective Date', { tag: '@C107745' }, async () => {
      await about('Sort ascending and descending on Effective Date ask the server to sort and order the page by date.');
      await sr.setDateRange(YEAR_2006.from, YEAR_2006.to);
      await sr.search();
      for (const dir of ['ascending', 'descending'] as const) {
        const sent = await phase(`Sort ${dir}`, () => sr.sortBy('Effective Date', dir));
        const dates = (await sr.readColumn('Effective Date')).map(yyyymmdd);
        await verify(`Sorted ${dir}`, async () => {
          expect(sent).toMatchObject({ sortBy: 'effectiveDate', sortDescending: dir === 'descending' });
          const sorted = [...dates].sort();
          expect(dates).toEqual(dir === 'ascending' ? sorted : sorted.reverse());
        });
      }
    });

    test('TC-TAX-SPR-066: Reset puts back the history defaults', { tag: '@C107746' }, async () => {
      await about('After a filtered search, Reset returns every filter to All, the range to today, and empties the grid.');
      const today = await sr.browserToday();
      await sr.choose('state', JAN_2006.state);
      await sr.choose('special', 'No');
      await sr.setDateRange(JAN_2006.from, JAN_2006.to);
      await sr.search();
      await phase('Reset', () => sr.reset());
      await verify('Defaults again; the grid asks for a search', async () => {
        await expect.poll(() => sr.getCount()).toBe(0);
        expect(await sr.getCriteria()).toMatchObject({ state: 'All', special: 'All', date: `${today} - ${today}`, countyEnabled: false });
        expect(await sr.isMessageVisible(TEXT.emptyHistory)).toBe(true);
      });
    });

    test('TC-TAX-SPR-067: County limits the history to that county', { tag: '@C107747' }, async () => {
      const c = COUNTY_HISTORY;
      await about(`${c.state} › ${c.county} in 2013 lists only that county's records, and the search sends the county.`);
      await sr.choose('state', c.state);
      await sr.choose('county', c.county);
      await sr.setDateRange(c.from, c.to);
      const { count, sent } = await phase('Search the county', () => sr.searchAndReadRequest());
      await verify(`Records found, all ${c.state} › ${c.county}; the county was sent`, async () => {
        expect(sent.countyId).not.toBe(-1);
        expect(count).toBeGreaterThan(0);
        expect(new Set(await sr.readColumn('State'))).toEqual(new Set([c.state]));
        expect(new Set(await sr.readColumn('County'))).toEqual(new Set([c.county]));
      });
    });

    test('TC-TAX-SPR-068: City limits the history to that city', { tag: '@C107748' }, async () => {
      const c = COUNTY_HISTORY;
      await about(`Choosing ${c.city} under ${c.state} › ${c.county} sends the city and lists only that city's records (or says there are none).`);
      await sr.choose('state', c.state);
      await sr.choose('county', c.county);
      await sr.choose('city', c.city);
      await sr.setDateRange(c.from, c.to);
      const { count, sent } = await phase('Search the city', () => sr.searchAndReadRequest());
      await verify(`The city was sent; every row listed is ${c.city}`, async () => {
        expect(sent.cityId).not.toBe(-1);
        if (count === 0) expect(await sr.isMessageVisible(TEXT.noHistory)).toBe(true);
        else expect(new Set(await sr.readColumn('City'))).toEqual(new Set([c.city]));
      });
    });

    test('TC-TAX-SPR-069: Previous page and a typed page number move through the history', { tag: '@C107749' }, async () => {
      await about('Typing 3 in the page box and pressing Enter shows page 3; Previous then shows page 2.');
      await sr.setDateRange(YEAR_2006.from, YEAR_2006.to);
      await sr.search();
      await verify('Typed 3: page 3 asked for and shown', async () => {
        expect(await sr.typePage(3)).toBe(3);
        expect((await sr.getPagePosition()).page).toBe(3);
      });
      await verify('Previous: page 2; First and Previous are on', async () => {
        expect(await sr.goToPage('previous')).toBe(2);
        expect((await sr.getPagePosition()).page).toBe(2);
        expect(await sr.pagingEnabled()).toMatchObject({ first: true, previous: true });
      });
    });

    test('TC-TAX-SPR-070: A history column can be hidden and the default view restored', { tag: '@C107750' }, async () => {
      await about('Hide column on Notes removes it from the history grid; Reset to Default View brings it back.');
      await sr.hideColumn('Notes');
      await verify('Notes is hidden and unticked', async () => {
        expect(await sr.getHeaders()).not.toContain('Notes');
        expect((await sr.getGridOptionColumns()).find((o) => o.label === 'Notes')?.checked).toBe(false);
      });
      await sr.resetGridView();
      await verify('All fourteen columns again', async () => expect(await sr.getHeaders()).toEqual([...HISTORY_COLUMNS]));
    });

    test('TC-TAX-SPR-071: The history search panel can be collapsed and expanded', { tag: '@C107751' }, async () => {
      await about('Collapsing hides the history criteria (Search leaves the screen) and expanding brings them back.');
      await sr.collapseFilters();
      await verify('Collapsed: Search is off screen', async () => expect(sr.searchButton()).not.toBeInViewport());
      await sr.expandFilters();
      await verify('Expanded: Search is back', async () => expect(sr.searchButton()).toBeInViewport());
    });

    test('TC-TAX-SPR-072: Grid Options list the history columns', { tag: '@C107752' }, async () => {
      await about('Grid Options on the history tab list the fourteen history columns, all ticked.');
      await verify('Fourteen columns, ticked', async () => {
        const options = await sr.getGridOptionColumns();
        expect(options.map((o) => o.label).sort()).toEqual([...HISTORY_COLUMNS].sort());
        expect(options.every((o) => o.checked)).toBe(true);
      });
    });
  });

  test.describe('K. History on every office', () => {
    test.describe.configure({ timeout: 240_000 });

    for (const office of SR_OFFICES) {
      test.describe(officeLabel(office), () => {
        test(`TC-TAX-SPR-073: Special Rate History lists the same records on every office`, { tag: '@C107753' }, async ({ utcPage, config }) => {
          await about(`History is company-wide: ${JAN_2006.state} in January 2006 lists its ${JAN_2006.count} records on every office.`);
          const sr = new SpecialRatePage(utcPage, config);
          await sr.open(office.code);
          await sr.openTab('Special Rate History');
          await sr.choose('state', JAN_2006.state);
          await sr.setDateRange(JAN_2006.from, JAN_2006.to);
          const count = await phase('Search', () => sr.search());
          await verify(`${JAN_2006.count} records, all ${JAN_2006.state} from ${JAN_2006.date}`, async () => {
            expect(count).toBe(JAN_2006.count);
            expect(new Set(await sr.readColumn('State'))).toEqual(new Set([JAN_2006.state]));
            expect(new Set(await sr.readColumn('Effective Date'))).toEqual(new Set([JAN_2006.date]));
          });
        });
      });
    }
  });

  // Effective Dates for a user in a US time zone. The suite's shared session runs in America/New_York
  // (playwright.config.ts), so these cases use it as is. A stored date is midnight UTC and the page reads it
  // in the browser's local time, so a US user sees stored dates one day earlier than a UTC user; these cases
  // record that behaviour. Nothing here is stored: the save case answers the save in the browser.
  test.describe('L. US time zone', () => {
    test.beforeEach(async ({ authenticatedSession, config }) => {
      sr = new SpecialRatePage(authenticatedSession.page, config);
      await sr.open(EDIT_OFFICE);
      await verify(`The browser runs in ${US_ZONE}`, async () => {
        expect(await sr.page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)).toBe(US_ZONE);
      });
    });

    const editRow = async () => {
      await sr.choose('state', PW.state);
      await sr.search();
      return sr.row(PW.edit);
    };

    test('TC-TAX-SPR-074: In a US time zone the search date picks the record in effect that day', { tag: '@C107754' }, async () => {
      const r = PW.asOf;
      await about(`${PW.state} ${r.taxType} turns Special on ${r.since}: in US time the day before shows it not special, that day shows it special.`);
      const before = await sr.readRow(await sr.findRow(PW.state, r.taxType, '01/01/2099'));
      const on = await sr.readRow(await sr.findRow(PW.state, r.taxType, r.since));
      await verify('01/01/2099: not special; 01/02/2099: special', async () => {
        expect(before.Special).toBe('No');
        expect(on).toMatchObject({ Special: 'Yes', 'State Special': r.rate });
      });
    });

    test('TC-TAX-SPR-075: In a US time zone a stored Effective Date shows one day earlier', { tag: '@C107755' }, async () => {
      await about(`${PW.state} ${PW.edit}'s record is stored from ${PW.editSince} (midnight UTC); a US user sees ${STORED_US}.`);
      const row = await editRow();
      await verify(`The row shows ${STORED_US}`, async () => {
        expect((await sr.readRow(row))['Effective Date']).toBe(STORED_US);
      });
    });

    test('TC-TAX-SPR-076: In a US time zone a typed Effective Date moves back when the field is left', { tag: '@C107756' }, async () => {
      const shownUs = addDays(TYPED, -2);
      await about(`A US user who types ${TYPED} in a row's Effective Date sees ${shownUs} after leaving the field.`);
      const row = await editRow();
      await sr.toggle(row, 'Special');
      const shown = await sr.editDate(row, TYPED);
      await verify(`The cell reads ${shownUs}`, async () => expect(shown).toBe(shownUs));
    });

    test('TC-TAX-SPR-077: In a US time zone a save sends the Effective Date one day earlier', { tag: '@C107757' }, async () => {
      const sent = addDays(TYPED, -1);
      await about(`A US user who saves a special rate typed as ${TYPED} sends ${sent}. The server reply is given in the browser, so nothing is stored.`);
      const row = await editRow();
      const stop = await sr.answerSavesWithSuccess();
      try {
        await sr.toggle(row, 'Special');
        await sr.editRate(row, '2');
        await sr.editDate(row, TYPED);
        const result = await phase('Save', () => sr.save());
        await verify(`The record sent is dated ${sent} (midnight UTC)`, async () => {
          expect(result.toast).toBe(TEXT.saved);
          expect(result.records[0]).toMatchObject({ effectiveDate: wireDate(sent) });
        });
      } finally {
        await stop();
      }
    });

    test('TC-TAX-SPR-078: In a US time zone the "must be after" message names the date the row shows', { tag: '@C107758' }, async () => {
      await about(`A date before the record is refused with "${ALERT.dateAfter(STORED_US)}", the date a US user sees on the row.`);
      const row = await editRow();
      await sr.toggle(row, 'Special');
      await sr.editDate(row, '01/01/2006');
      await verify(`"${ALERT.dateAfter(STORED_US)}"`, async () => {
        expect(await sr.getRowMessages(row)).toEqual([ALERT.dateAfter(STORED_US)]);
      });
    });

    test('TC-TAX-SPR-079: In a US time zone a day picked in the calendar is set as the day before', { tag: '@C107759' }, async () => {
      await about('A US user who picks the 20th in a row calendar sees the 19th of that month in the cell.');
      const row = await editRow();
      await sr.toggle(row, 'Special');
      await sr.editDate(row, TYPED);
      const picked = await phase('Pick the 20th in the calendar', () => sr.pickCalendarDay(row, 20));
      await verify('The cell shows the 19th of the month the calendar showed', async () => {
        const [month, year] = picked.shownMonth.split(' ');
        const m = new Date(`1 ${month} ${year}`).getMonth() + 1;
        expect(picked.value).toBe(`${String(m).padStart(2, '0')}/19/${year}`);
      });
    });

    test('TC-TAX-SPR-080: In a US time zone the history shows stored Effective Dates one day earlier', { tag: '@C107760' }, async () => {
      const shownUs = addDays(JAN_2006.date, -1);
      await about(`${JAN_2006.state}'s January 2006 history records are stored from ${JAN_2006.date}; a US user sees ${shownUs} on the history tab.`);
      await sr.openTab('Special Rate History');
      await sr.choose('state', JAN_2006.state);
      await sr.setDateRange(JAN_2006.from, JAN_2006.to);
      const count = await sr.search();
      await verify(`${JAN_2006.count} records, all shown from ${shownUs}`, async () => {
        expect(count).toBe(JAN_2006.count);
        expect(new Set(await sr.readColumn('Effective Date'))).toEqual(new Set([shownUs]));
      });
    });
  });

  // The tooltips, warning icons and button names of both tabs. Tooltips are checked by hovering and reading
  // what opens. Row and search-date warnings keep their reason in the icon's title. Nothing here saves.
  test.describe('M. Tooltips', () => {
    test.beforeEach(async ({ utcPage, config }) => {
      sr = new SpecialRatePage(utcPage, config);
      await sr.open(EDIT_OFFICE);
    });

    const main = () => sr.page.locator('main');
    const button = (name: string) => main().getByRole('button', { name, exact: true });

    test('TC-TAX-SPR-081: The page\'s own tooltips open on hover', { tag: '@C107761' }, async () => {
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

    test('TC-TAX-SPR-082: The information tooltip names the page and closes when the mouse leaves', { tag: '@C107762' }, async () => {
      await about('Hovering (i) opens "Special Rate."; moving the mouse away closes it.');
      const tip = await sr.tooltipOf(button('More information'));
      await sr.page.mouse.move(0, 0);
      await verify('"Special Rate." opens, then closes', async () => {
        expect(tip).toBe(TEXT.info);
        await expect(sr.page.getByRole('tooltip')).toHaveCount(0);
      });
    });

    test('TC-TAX-SPR-083: Every row validation reason is held on the row\'s warning icon', { tag: '@C107763' }, async () => {
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

    test('TC-TAX-SPR-084: An impossible search date is marked "Invalid date" and Search is off', { tag: '@C107764' }, async () => {
      await about('An impossible search date (02/30/2026) is marked with "Invalid date", and Search cannot be clicked.');
      await sr.setSearchDate('02/30/2026');
      await verify('"Invalid date"; Search is disabled', async () => {
        expect(await sr.searchDateMessage()).toBe(ALERT.invalidDate);
        expect(await sr.isSearchEnabled()).toBe(false);
      });
    });

    test('TC-TAX-SPR-085: Icon-only buttons are named for what they do', { tag: '@C107765' }, async () => {
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

    test('TC-TAX-SPR-086: The sidebar toggle and the history Date Range button have a name for screen readers', { tag: '@C107766' }, async () => {
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
});
