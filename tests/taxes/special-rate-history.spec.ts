import { test, expect } from '../../src/fixtures/pages.fixture';
import { SpecialRatePage, dayText } from '../../src/pages/taxes/special-rate.page';
import { phase, verify, about } from '../../src/fixtures/report-steps';
import { SR_OFFICES, officeLabel, EDIT_OFFICE, JAN_2006, COUNTY_HISTORY, YEAR_2006, TEXT, HISTORY_COLUMNS, PAGE_SIZES } from '../../src/data/taxes/special-rate';

// Tax → Special Rate (NM-4022), Special Rate History tab: the records whose effective date falls in a
// date range, page by page. Nothing here saves. It runs on a UTC page, where dates show as stored.

test.describe.configure({ timeout: 240_000 });

const yyyymmdd = (mmddyyyy: string) => { const [m, d, y] = mmddyyyy.split('/'); return `${y}${m}${d}`; };

test.describe('Special Rate — history', () => {
  let sr: SpecialRatePage;

  test.beforeEach(async ({ utcPage, config }) => {
    sr = new SpecialRatePage(utcPage, config);
    await sr.open(EDIT_OFFICE);
    await sr.openTab('Special Rate History');
  });

  test('TC-SR-HIS-001: Special Rate History opens with its defaults', async () => {
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

  test('TC-SR-HIS-002: A range with no records says so', async () => {
    await about('Searching today to today, when no record takes effect today, lists nothing and says no history was found.');
    const count = await phase('Search today', () => sr.search());
    await verify(`0 records and "${TEXT.noHistory}"`, async () => {
      expect(count).toBe(0);
      expect(await sr.isMessageVisible(TEXT.noHistory)).toBe(true);
    });
  });

  test('TC-SR-HIS-003: A state and range list that state\'s records of the period, read only', async () => {
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

  test('TC-SR-HIS-004: The range filters on the Effective Date', async () => {
    await about('Every record listed for 2006 (all states) takes effect in 2006.');
    await sr.setDateRange(YEAR_2006.from, YEAR_2006.to);
    const count = await phase('Search 2006', () => sr.search());
    const dates = await sr.readColumn('Effective Date');
    await verify(`${count} records; every date on the page is in 2006`, async () => {
      expect(count).toBeGreaterThan(50);
      expect(dates.filter((d) => !d.endsWith('/2006'))).toEqual([]);
    });
  });

  test('TC-SR-HIS-005: Paging moves through the records', async () => {
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

  test('TC-SR-HIS-006: Rows per page changes the page size', async () => {
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

  test('TC-SR-HIS-007: The filters narrow the history', async () => {
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

  test('TC-SR-HIS-008: Sorting the history by Effective Date', async () => {
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

  test('TC-SR-HIS-009: Reset puts back the history defaults', async () => {
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

  test('TC-SR-HIS-011: County limits the history to that county', async () => {
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

  test('TC-SR-HIS-012: City limits the history to that city', async () => {
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

  test('TC-SR-HIS-013: Previous page and a typed page number move through the history', async () => {
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

  test('TC-SR-HIS-014: A history column can be hidden and the default view restored', async () => {
    await about('Hide column on Notes removes it from the history grid; Reset to Default View brings it back.');
    await sr.hideColumn('Notes');
    await verify('Notes is hidden and unticked', async () => {
      expect(await sr.getHeaders()).not.toContain('Notes');
      expect((await sr.getGridOptionColumns()).find((o) => o.label === 'Notes')?.checked).toBe(false);
    });
    await sr.resetGridView();
    await verify('All fourteen columns again', async () => expect(await sr.getHeaders()).toEqual([...HISTORY_COLUMNS]));
  });

  test('TC-SR-HIS-015: The history search panel can be collapsed and expanded', async () => {
    await about('Collapsing hides the history criteria (Search leaves the screen) and expanding brings them back.');
    await sr.collapseFilters();
    await verify('Collapsed: Search is off screen', async () => expect(sr.searchButton()).not.toBeInViewport());
    await sr.expandFilters();
    await verify('Expanded: Search is back', async () => expect(sr.searchButton()).toBeInViewport());
  });

  test('TC-SR-HIS-010: Grid Options list the history columns', async () => {
    await about('Grid Options on the history tab list the fourteen history columns, all ticked.');
    await verify('Fourteen columns, ticked', async () => {
      const options = await sr.getGridOptionColumns();
      expect(options.map((o) => o.label).sort()).toEqual([...HISTORY_COLUMNS].sort());
      expect(options.every((o) => o.checked)).toBe(true);
    });
  });
});

test.describe('Special Rate — history on every office', () => {
  for (const office of SR_OFFICES) {
    test(`TC-SR-HIS-016: Special Rate History lists the same records on every office — ${officeLabel(office)}`, async ({ utcPage, config }) => {
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
  }
});
