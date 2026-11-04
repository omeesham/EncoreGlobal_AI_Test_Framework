import { test, expect } from '../../src/fixtures/pages.fixture';
import { OrderOriginTaxPage } from '../../src/pages/taxes/order-origin-tax.page';
import { phase, verify, about, attachNote } from '../../src/fixtures/report-steps';
import { EDIT_OFFICE, TEXT, COLUMNS, HISTORY_RANGE_START } from '../../src/data/taxes/order-origin-tax';

// Tax → Order Origin Tax (NM-4020): the Order Origin Tax History tab. It lists tax records by
// effective date range, 50 to a page, and is read-only. Nothing here saves.

test.describe.configure({ timeout: 180_000 });

const PAGE_SIZE = 50;
/** MM/DD/YYYY → comparable number. */
const dayNumber = (mmddyyyy: string) => {
  const [m, d, y] = mmddyyyy.split('/').map(Number) as [number, number, number];
  return y * 10_000 + m * 100 + d;
};

test.describe('Order Origin Tax — History', () => {
  let oot: OrderOriginTaxPage;
  let today: string;

  test.beforeEach(async ({ authenticatedSession, config }) => {
    oot = new OrderOriginTaxPage(authenticatedSession.page, config);
    await oot.open(EDIT_OFFICE);
    today = await oot.browserToday();
    await oot.switchTab('history');
    await expect(oot.tab('history')).toHaveAttribute('aria-selected', 'true');
  });

  /** Searches History from HISTORY_RANGE_START to today, all locations and tax types, non-zero rates. */
  async function searchRange(): Promise<number> {
    await oot.pickHistoryRangeDay(HISTORY_RANGE_START.mdyyyy);
    return oot.search();
  }

  test('TC-OOT-HIS-001: History opens with default criteria, an empty grid and no Save', async () => {
    await about('Before a search: all locations, all tax types, today to today, non-zero rates only; the grid is empty and nothing can be saved.');
    await verify('Criteria are All locations / All / today - today / ticked', async () => {
      expect(await oot.getCriteria()).toEqual({ location: TEXT.allLocations, taxType: TEXT.allTaxTypes, date: `${today} - ${today}`, notEqualZero: true });
    });
    await verify('Empty grid asking for a search, and no Save button', async () => {
      expect(await oot.getCount()).toBe(0);
      expect(await oot.isEmptyMessageVisible('history')).toBe(true);
      expect(await oot.hasSaveButton()).toBe(false);
    });
  });

  test('TC-OOT-HIS-002: History shows the twelve order origin tax columns', async () => {
    await about('History lists the same twelve columns as Basic Information.');
    await verify('Column headers in order', async () => {
      expect(await oot.getHeaders()).toEqual([...COLUMNS]);
    });
  });

  test('TC-OOT-HIS-003: A date range search lists read-only records effective in that range', async () => {
    await about(`History from ${HISTORY_RANGE_START.shown} to today lists records whose effective date is in the range, with nothing editable.`);
    await oot.pickHistoryRangeDay(HISTORY_RANGE_START.mdyyyy);
    await verify('The range reads start - today', async () => {
      expect((await oot.getCriteria()).date).toBe(`${HISTORY_RANGE_START.shown} - ${today}`);
    });
    const count = await phase('Search', () => oot.search());
    await verify('Records found, all effective within the range, none editable', async () => {
      expect(count).toBeGreaterThan(0);
      const days = (await oot.readColumn('Effective Date')).map(dayNumber);
      expect(Math.min(...days)).toBeGreaterThanOrEqual(dayNumber(HISTORY_RANGE_START.shown));
      expect(Math.max(...days)).toBeLessThanOrEqual(dayNumber(today));
      expect(await oot.hasEditableCells()).toBe(0);
    });
  });

  test('TC-OOT-HIS-004: History pages its results 50 at a time', async () => {
    await about('A search with more than 50 records shows 50 on page 1 and the rest from page 2.');
    const count = await phase('Search the range', () => searchRange());
    expect(count, 'the range must hold more than one page').toBeGreaterThan(PAGE_SIZE);
    const firstPage = await oot.readColumn('Modified On');
    await verify('Page 1 holds 50 records', async () => {
      expect(await oot.getPageNumber()).toBe('1');
      expect(await oot.rowCount()).toBe(PAGE_SIZE);
    });
    await oot.nextPage();
    await verify('Page 2 holds the next records', async () => {
      expect(await oot.getPageNumber()).toBe('2');
      expect(await oot.rowCount()).toBe(Math.min(PAGE_SIZE, count - PAGE_SIZE));
      expect(await oot.readColumn('Modified On')).not.toEqual(firstPage.slice(0, await oot.rowCount()));
    });
  });

  test('TC-OOT-HIS-005: The Location and Tax Type filters narrow History', async () => {
    await about('Within a date range, choosing a location lists only its records, and adding a tax type lists only that tax type.');
    await phase('Search the range', () => searchRange());
    const first = await oot.readRow(oot.firstRow());
    await attachNote('Filters taken from the first record', `${first['Location No']} / ${first['Tax Type']}`);
    await oot.selectLocation(first['Location No']!);
    await phase('Search one location', () => oot.search());
    await verify(`Only ${first['Location No']}`, async () => {
      expect(new Set(await oot.readColumn('Location No'))).toEqual(new Set([first['Location No']]));
    });
    await oot.selectTaxType(first['Tax Type']!);
    await phase('Search one location and tax type', () => oot.search());
    await verify(`Only ${first['Tax Type']}`, async () => {
      expect(new Set(await oot.readColumn('Tax Type'))).toEqual(new Set([first['Tax Type']]));
    });
  });

  test('TC-OOT-HIS-006: Reset restores the History criteria and clears the grid', async () => {
    await about('After changing the criteria and searching, Reset puts them back and empties the grid.');
    await phase('Change criteria and search', async () => {
      await oot.pickHistoryRangeDay(HISTORY_RANGE_START.mdyyyy);
      await oot.setNotEqualZero(false);
      await oot.search();
    });
    await oot.reset();
    await verify('Default criteria and an empty grid', async () => {
      expect(await oot.getCriteria()).toEqual({ location: TEXT.allLocations, taxType: TEXT.allTaxTypes, date: `${today} - ${today}`, notEqualZero: true });
      expect(await oot.getCount()).toBe(0);
      expect(await oot.isEmptyMessageVisible('history')).toBe(true);
    });
  });
});
