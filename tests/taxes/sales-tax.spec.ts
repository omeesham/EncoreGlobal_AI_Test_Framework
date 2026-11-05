import { createRequire } from 'module';
import { Browser } from '@playwright/test';
import { test, expect } from '../../src/fixtures/pages.fixture';
import { IConfig } from '../../src/types';
import { STATE_PATH } from '../../src/utils/auth-storage';
import { about, attachNote, phase, verify } from '../../src/fixtures/report-steps';
import { SalesTaxPage, ApiTaxRecord, GridRow, SearchCapture } from '../../src/pages/taxes/sales-tax.page';
import {
  ST_OFFICE,
  ST_PATH,
  ST_PAGE_TITLE,
  ST_TABS,
  ST_BASIC_COLUMNS,
  ST_HISTORY_STANDARD_COLUMNS,
  ST_HISTORY_AUDIT_COLUMNS,
  ST_TAX_TIERS,
  ST_ZIP,
  ST_EMPTY_ZIP,
  ST_OTHER_ZIP,
  ST_MULTI_CITY,
  ST_HISTORY_FROM,
  ST_OTHER_STATE,
  ST_MESSAGES,
  ST_INVALID_DATES,
  ST_BAD_ZIP_INPUT,
  ST_HOSTILE_ZIP_INPUTS,
  ST_NON_TXT_FILES,
  ST_LOAD_BUDGET_MS,
  ST_VIEWPORTS,
  ST_VALID_IMPORT_ROW,
  ST_INVALID_IMPORT_ROWS,
  ST_INVALID_IMPORT_ERRORS,
  FLAT_FILE_ROW_LENGTH,
  flatFile,
  flatFileRow,
  todayIso,
  addDays,
  fromUiDate,
  toUiDateTime,
  wireDate,
} from '../../src/data/taxes/sales-tax';

// Tax → Sales Tax (NM-4021 / feature epic NM-889). Requirements: NM-4021 test automation requirements
// document; behaviour from NM-2326/2330 (UI), NM-2283/2284/2285/2409 (API), NM-2327/2328 (import) and the
// fixes NM-3959, NM-3972, NM-3984, NM-3989, NM-3996, NM-4011, NM-4013, NM-4254.
//
// Write policy — nothing in this spec writes. Sales tax versions are insert-only and drive live tax
// calculation, so a valid file only ever reaches a mocked import (interceptImport). The one file sent to the
// real import holds nothing but unparseable rows for a zip that matches no jurisdiction.
//   * test.fail('BUG-TAX-ST-…') marks a case that asserts the documented behaviour against a known defect
//     (reports/bugs/). It passes while the bug exists and turns red when it is fixed — then drop the marker.
//   * Not automated (see the test plan): the Read-only persona (no such account), and the import rules that
//     need a real write — all-or-nothing with a valid row, chronology, audit user, newest import on top.

// ---------------------------------------------------------------- TestRail mapping

// TestRail case tags for tests whose titles are built in a loop. Literal titles carry their tag
// inline; both come from config/testrail/case-map.json.
const LOOP_CASE_TAGS: Record<string, string> = {
  'TC-TAX-ST-053': '@C107495',
  'TC-TAX-ST-054': '@C107496',
};

// ---------------------------------------------------------------- spec-local helpers

const TODAY = todayIso();

const num = (text: string | undefined): number => Number((text ?? '').replace('%', '').trim());

/** What the grid must show for a record, keyed by header (Effective Date has its own case). */
function expectedCells(r: ApiTaxRecord): GridRow {
  const rate = (n: number): string => n.toFixed(6);
  return {
    'Zip Code': r.zipCode,
    'Geo Code': r.geoCode,
    State: r.stateName,
    County: r.countyName,
    City: r.cityName,
    'State Tax': rate(r.stateTax),
    'County Tax': rate(r.countyTax),
    'County Local Tax': rate(r.countyLocalTax),
    'City Tax': rate(r.cityTax),
    'City Local Tax': rate(r.cityLocalTax),
    'Combined Tax': rate(r.combinedTax),
  };
}

const SHOWN_COLUMNS = ST_BASIC_COLUMNS.filter((c) => c !== 'Effective Date');

function shown(row: GridRow): GridRow {
  return Object.fromEntries(SHOWN_COLUMNS.map((k) => [k, row[k] ?? '']));
}

function only(records: ApiTaxRecord[], what: string): ApiTaxRecord {
  if (records.length !== 1) throw new Error(`Expected exactly one ${what} record, got ${records.length}`);
  return records[0]!;
}

function isSorted(values: string[], direction: 'ascending' | 'descending'): boolean {
  return values.every((v, i) => i === 0 || (direction === 'ascending' ? values[i - 1]! <= v : values[i - 1]! >= v));
}

test.describe('Sales Tax @taxes', () => {
  let st: SalesTaxPage;

  /**
   * Runs `body` with the page object on a UTC browser, where a date-only value renders as stored. The date cases
   * use it because the one-day shift west of UTC was accepted (BUG-TAX-ST-001 dropped 2026-11-05) — they keep checking
   * the date logic itself, independent of the machine's time zone.
   */
  async function inUtc(browser: Browser, config: IConfig, body: () => Promise<void>): Promise<void> {
    const ctx = await browser.newContext({ storageState: STATE_PATH, timezoneId: 'UTC' });
    const original = st;
    try {
      st = new SalesTaxPage(await ctx.newPage(), config);
      await body();
    } finally {
      st = original;
      await ctx.close();
    }
  }

  test.beforeEach(async ({ authenticatedSession, config }) => {
    // Several searches plus County → City lookups of up to ~35 s; cases that do more raise it again.
    test.setTimeout(240_000);
    st = new SalesTaxPage(authenticatedSession.page, config);
  });

  test.afterEach(async () => {
    // A fixture that fails before beforeEach (e.g. a slow login) leaves no page object — nothing to clean.
    if (!st) return;
    await st.clearInterceptions();
    await st.leave();
  });

  /**
   * The zip's current version and the one before it, read through as-of searches so the boundaries come
   * from whatever history the environment holds. Each search starts from Reset (see BUG-TAX-ST-003).
   */
  async function zipVersions(zip: string): Promise<{ latest: ApiTaxRecord; previous: ApiTaxRecord | null; latestDate: string }> {
    return phase(`Find the current and previous versions of zip ${zip}`, async () => {
      const latest = only((await st.searchByZip(zip, TODAY)).records, 'current');
      const latestDate = wireDate(latest.effectiveDate)!;
      await st.reset();
      const before = (await st.searchByZip(zip, addDays(latestDate, -1))).records;
      await st.reset();
      await attachNote('Versions', JSON.stringify({ latestDate, previousDate: before[0] ? wireDate(before[0].effectiveDate) : null }, null, 2));
      return { latest, previous: before[0] ?? null, latestDate };
    });
  }

  // ================================================================ A. Navigation and page layout

  test.describe('A. Navigation and page layout', () => {
    test('TC-TAX-ST-001: Tax menu entry opens the Sales Tax page', { tag: '@C107443' }, async () => {
      await about('A user opens Tax in the sidebar and picks Sales Tax; the page opens with its title on the sales-tax route.');
      await st.openFromTaxMenu(ST_OFFICE);
      await attachNote('Route reached from the menu', st.page.url());
      await verify('The heading reads Sales Tax on the sales-tax route', async () => {
        expect(await st.getHeading()).toBe(ST_PAGE_TITLE);
        expect(new URL(st.page.url()).pathname).toMatch(/\/taxes\/sales-tax$/);
      });
    });

    test('TC-TAX-ST-002: Basic Information is the active tab and Sales Tax History is offered', { tag: '@C107444' }, async () => {
      await about('Opening the page lands on Basic Information; the Sales Tax History tab sits beside it.');
      await st.open(ST_OFFICE);
      await verify('Basic Information is selected and History is available', async () => {
        await expect(st.tab('basic')).toHaveAttribute('aria-selected', 'true');
        await expect(st.tab('history')).toHaveText(ST_TABS.history);
        expect(await st.activeTab()).toBe(ST_TABS.basic);
      });
    });

    test('TC-TAX-ST-003: Search panel offers Zip Code, State, County, City, Effective Date, Reset and Search', { tag: '@C107445' }, async () => {
      await about('The Basic Information search panel carries the four location criteria, the as-of date and its two buttons.');
      await st.open(ST_OFFICE);
      await verify('All seven controls are visible in the search panel', async () => {
        for (const field of [st.zipField(), st.stateField(), st.countyField(), st.cityField(), st.searchDateField(), st.resetButton(), st.searchButton()]) {
          await expect(field).toBeVisible();
        }
      });
    });

    test('TC-TAX-ST-004: Effective Date defaults to business today', { tag: '@C107446' }, async () => {
      await about(`On a fresh load the as-of Effective Date already holds today's date in the business timezone (${TODAY}).`);
      await st.open(ST_OFFICE);
      await verify('The as-of date equals business today', async () => {
        expect(await st.getSearchDate()).toBe(TODAY);
      });
    });

    test('TC-TAX-ST-005: Before any search the grid shows its columns, 0 records and a prompt to search', { tag: '@C107447' }, async () => {
      await about('Nothing is listed until the user searches: the grid header is drawn, the counter reads 0 and the grid asks for criteria.');
      await st.open(ST_OFFICE);
      await verify('Header present, no rows, counter 0, prompt shown', async () => {
        expect(await st.getHeaderLabels()).toEqual([...ST_BASIC_COLUMNS]);
        expect(await st.readGrid()).toEqual([]);
        expect(await st.getRecordsFoundCount()).toBe(0);
        expect(await st.mainText()).toContain(ST_MESSAGES.promptBeforeSearch);
      });
    });

    test('TC-TAX-ST-006: Loading feedback shows while a search is pending and clears when results arrive', { tag: '@C107448' }, async () => {
      await about('While a search answer is slow the grid shows that it is working, then the results replace the feedback.');
      await st.open(ST_OFFICE);
      await st.typeZip(ST_ZIP);
      await st.mockSearch({ kind: 'delay', ms: 6_000 });
      await st.clickSearch();
      await verify('A loading indicator (or a disabled Search) is shown while the answer is held', async () => {
        await expect.poll(async () => (await st.isLoadingVisible()) || !(await st.searchButton().isEnabled()), { timeout: 5_000 }).toBe(true);
      });
      await verify('The feedback clears and the zip row is shown once the answer lands', async () => {
        await expect.poll(() => st.isLoadingVisible(), { timeout: 60_000 }).toBe(false);
        await expect.poll(async () => (await st.readGrid()).length, { timeout: 30_000 }).toBeGreaterThan(0);
      });
    });

    test('TC-TAX-ST-007: First search result is usable within the load budget', { tag: '@C107449' }, async () => {
      await about(`Opening the page and running a zip search shows results within ${ST_LOAD_BUDGET_MS / 1000} seconds.`);
      const started = Date.now();
      await st.open(ST_OFFICE);
      await st.searchByZip(ST_ZIP);
      const elapsed = Date.now() - started;
      await attachNote('Open + search time (ms)', String(elapsed));
      await verify('Elapsed time is inside the budget', async () => {
        expect(elapsed).toBeLessThan(ST_LOAD_BUDGET_MS);
      });
    });

    test('TC-TAX-ST-008: Switching tabs keeps the searched criteria and results', { tag: '@C107450' }, async () => {
      // Live (e2e 2026-11-04): criteria are kept once searched (saved per tab in sessionStorage); a Zip Code typed
      // but never searched is dropped by the round trip.
      await about('NM-4021 §3: after a Zip Code search on Basic Information, visiting Sales Tax History and coming back shows the same criteria and rows.');
      await st.open(ST_OFFICE);
      await st.searchByZip(ST_ZIP);
      const before = await st.readGrid();
      await st.switchTab('history');
      await st.switchTab('basic');
      await verify('The Zip Code and the rows survive the round trip', async () => {
        expect(await st.getZip()).toBe(ST_ZIP);
        await expect.poll(async () => (await st.readGrid()).map(shown)).toEqual(before.map(shown));
      });
    });
  });

  // ================================================================ B. Zip Code override rule

  test.describe('B. Zip Code override rule', () => {
    test('TC-TAX-ST-009: Typing a Zip Code clears and disables State, County and City', { tag: '@C107451' }, async () => {
      await about('NM-4021 §6.2 step 2: once a Zip Code is typed the location dropdowns are cleared and locked; Effective Date stays usable.');
      await st.open(ST_OFFICE);
      await st.typeZip(ST_ZIP);
      const enabled = await st.fieldsEnabled();
      const loc = await st.getLocation();
      await attachNote('Fields after typing the zip', JSON.stringify({ enabled, loc }, null, 2));
      await verify('State, County and City are disabled and show no chosen location; the date is enabled', async () => {
        expect(enabled).toMatchObject({ zip: true, state: false, county: false, city: false, date: true });
        expect(loc.state).toMatch(/^select\b/i);
        expect(loc.county).toBe('All');
        expect(loc.city).toBe('All');
      });
    });

    test('TC-TAX-ST-010: Clearing the Zip Code re-enables State and County; City waits for a County', { tag: '@C107452' }, async () => {
      await about('NM-4021 §6.2 step 3: deleting the Zip Code gives the location dropdowns back in their dependent state.');
      await st.open(ST_OFFICE);
      await st.typeZip(ST_ZIP);
      await st.clearZip();
      await verify('State and County are usable again, City stays locked until a County is chosen', async () => {
        await expect.poll(async () => (await st.fieldsEnabled()).state).toBe(true);
        expect(await st.fieldsEnabled()).toMatchObject({ state: true, county: true, city: false });
      });
    });

    test('TC-TAX-ST-011: Typing a Zip Code after choosing State, County and City clears and disables them', { tag: '@C107453' }, async () => {
      await about('NM-4021 §6.2 step 4: Zip Code stays editable after a location is chosen, and typing into it wipes and locks that location.');
      await st.open(ST_OFFICE);
      await st.selectState(ST_MULTI_CITY.state);
      await st.selectCounty(ST_MULTI_CITY.county);
      await st.selectCity(ST_MULTI_CITY.city);
      const zipEnabledBefore = (await st.fieldsEnabled()).zip;
      await st.typeZip(ST_OTHER_ZIP);
      const loc = await st.getLocation();
      await verify('Zip was editable; the previous State, County and City are gone and locked', async () => {
        expect(zipEnabledBefore).toBe(true);
        expect(await st.fieldsEnabled()).toMatchObject({ state: false, county: false, city: false });
        expect([loc.state, loc.county, loc.city]).not.toContain(ST_MULTI_CITY.county);
        expect(loc.city).not.toBe(ST_MULTI_CITY.city);
      });
    });

    test('TC-TAX-ST-012: A Zip Code search sends only the zip and the as-of date', { tag: '@C107454' }, async () => {
      await about('With a Zip Code the search ignores the location dropdowns: the request carries the zip and the date, no State, County or City.');
      await st.open(ST_OFFICE);
      const { payload } = await st.searchByZip(ST_ZIP);
      await attachNote('Search payload', JSON.stringify(payload, null, 2));
      await verify('zipCode and effectiveDate are sent; stateId, countyId and cityId are not', async () => {
        expect(payload.zipCode).toBe(ST_ZIP);
        expect(payload.effectiveDate).toBe(TODAY);
        for (const key of ['stateId', 'countyId', 'cityId']) expect(payload[key] ?? '$undefined', key).toBe('$undefined');
      });
    });

    test('TC-TAX-ST-013: Repeating a Zip Code search returns the same record', { tag: '@C107455' }, async () => {
      test.fail(true, 'BUG-TAX-ST-003: after the first zip search State silently reverts to AK and every later search sends stateId=59, so it finds nothing');
      await about('Clicking Search again with the same Zip Code must give the same answer — the locked State must never join the request.');
      await st.open(ST_OFFICE);
      const first = await st.searchByZip(ST_ZIP);
      const second = await st.clickSearchAndWait();
      await attachNote('Second search payload', JSON.stringify(second.payload, null, 2));
      await verify('The second search sends no State and returns the same record', async () => {
        expect(second.payload.stateId ?? '$undefined').toBe('$undefined');
        expect(second.records.map(expectedCells)).toEqual(first.records.map(expectedCells));
      });
    });

    test('TC-TAX-ST-014: Zip Code accepts at most 5 digits', { tag: '@C107456' }, async () => {
      test.fail(true, 'BUG-TAX-ST-006: the Zip Code box accepts letters and any length');
      await about(`NM-4021 §6.1: Zip Code is a 5-digit field — typing "${ST_BAD_ZIP_INPUT}" keeps only digits, at most five.`);
      await st.open(ST_OFFICE);
      await st.typeZip(ST_BAD_ZIP_INPUT);
      const value = await st.getZip();
      await attachNote('Zip value after typing', value);
      await verify('The field holds 5 digits or fewer and no letters', async () => {
        expect(value).toMatch(/^\d{0,5}$/);
      });
    });
  });

  // ================================================================ C. Cascading dropdowns and validation

  test.describe('C. Cascading dropdowns and validation', () => {
    test('TC-TAX-ST-015: On load State is chosen and enabled, County offers All and City waits for a County', { tag: '@C107457' }, async () => {
      // Live design (e2e 2026-11-04): State is pre-selected (first state, AK) and has no blank choice, so the
      // documented "County disabled until a State is chosen" state never exists — County is usable at once.
      await about('A State is always chosen on load, so County is usable straight away with "All"; City stays locked until a County is picked.');
      await st.open(ST_OFFICE);
      const loc = await st.getLocation();
      const states = await st.readStateOptions();
      await attachNote('Location on load / states offered', `${JSON.stringify(loc)}\n${states.join(', ')}`);
      await verify('State holds a state code, County is All and usable, City is All and locked', async () => {
        expect(states).toContain(loc.state);
        expect(states.every((s) => /^[A-Z]{2}$/.test(s))).toBe(true);
        expect(loc.county).toBe('All');
        expect(await st.fieldsEnabled()).toMatchObject({ state: true, county: true, city: false });
      });
    });

    test('TC-TAX-ST-016: Choosing a State loads exactly that State\'s counties', { tag: '@C107458' }, async () => {
      await about('Picking a State calls the county lookup for that State and the County dropdown offers "All" plus every county it returned.');
      await st.open(ST_OFFICE);
      const lookup = await st.selectState(ST_OTHER_STATE);
      const offered = await st.readCountyOptions();
      await attachNote('County lookup', JSON.stringify({ stateId: lookup?.stateId, count: lookup?.counties.length }, null, 2));
      await verify('The lookup ran for the State and the dropdown mirrors its answer', async () => {
        expect(lookup, 'no county lookup was sent').not.toBeNull();
        expect(lookup!.counties.length).toBeGreaterThan(0);
        expect(offered).toEqual(['All', ...lookup!.counties]);
      });
    });

    test('TC-TAX-ST-017: Choosing a County loads all of its cities, not just All', { tag: '@C107459' }, async () => {
      await about(`NM-3996: ${ST_MULTI_CITY.state} / ${ST_MULTI_CITY.county} offers every city the city lookup returns.`);
      await st.open(ST_OFFICE);
      await st.selectState(ST_MULTI_CITY.state);
      const lookup = await st.selectCounty(ST_MULTI_CITY.county);
      const offered = await st.readCityOptions();
      await attachNote('City options', offered.join(', '));
      await verify('City is usable and lists All plus every returned city', async () => {
        expect(lookup, 'no city lookup was sent').not.toBeNull();
        expect(lookup!.cities.length).toBeGreaterThan(1);
        expect(offered).toEqual(['All', ...lookup!.cities]);
        expect(offered).toContain(ST_MULTI_CITY.city);
      });
    });

    test('TC-TAX-ST-018: Changing State after County and City are chosen resets both', { tag: '@C107460' }, async () => {
      test.fail(true, 'BUG-TAX-ST-002: City keeps the previous state\'s city and County goes blank; the search then sends the old county and city ids');
      await about('A new State must clear the old County and City, so a search can never mix one state with another state\'s county or city.');
      await st.open(ST_OFFICE);
      await st.selectState(ST_MULTI_CITY.state);
      const county = await st.selectCounty(ST_MULTI_CITY.county);
      await st.selectCity(ST_MULTI_CITY.city);
      await st.selectState(ST_OTHER_STATE);
      const loc = await st.getLocation();
      const { payload } = await st.clickSearchAndWait();
      await attachNote('After the State change', JSON.stringify({ loc, payload }, null, 2));
      await verify('County and City are back to All and the search sends neither old id', async () => {
        expect(loc).toMatchObject({ state: ST_OTHER_STATE, county: 'All', city: 'All' });
        expect(payload.countyId).not.toBe(county!.countyId);
        expect(payload.cityId ?? '$undefined').toBe('$undefined');
      });
    });

    test('TC-TAX-ST-019: Search without an Effective Date is blocked', { tag: '@C107461' }, async () => {
      await about('Effective Date is mandatory: with the date cleared nothing is searched and the form says so (Search disabled or a message).');
      await st.open(ST_OFFICE);
      await st.typeZip(ST_ZIP);
      const sent = await st.recordSearches();
      await st.typeSearchDate('');
      if (await st.searchButton().isEnabled()) await st.clickSearch();
      const state = await st.readSearchValidation();
      await attachNote('Validation state', JSON.stringify(state, null, 2));
      await verify('No search request was sent and feedback is shown', async () => {
        expect(sent).toEqual([]);
        expect(state.invalidFields > 0 || state.messages.length > 0 || !state.searchEnabled).toBe(true);
      });
    });

    test('TC-TAX-ST-020: An impossible date typed into Effective Date never reaches a search', { tag: '@C107462' }, async () => {
      await about(`Typing ${ST_INVALID_DATES.join(', ')} into Effective Date never sends a search.`);
      await st.open(ST_OFFICE);
      await st.typeZip(ST_ZIP);
      const sent = await st.recordSearches();
      const seen: Record<string, unknown> = {};
      for (const text of ST_INVALID_DATES) {
        await st.typeSearchDate(text);
        if (await st.searchButton().isEnabled()) await st.clickSearch();
        seen[text] = await st.readSearchValidation();
      }
      await attachNote('Validation per input', JSON.stringify(seen, null, 2));
      await verify('No search request was sent for any of them', async () => {
        expect(sent).toEqual([]);
      });
    });

    test('TC-TAX-ST-021: Reset clears the criteria, restores the defaults and empties the grid', { tag: '@C107463' }, async () => {
      await about('After a search, Reset puts back the first-load state: empty Zip Code, default State, County All, City locked, today\'s date and no rows.');
      await st.open(ST_OFFICE);
      const defaults = await st.getLocation();
      await st.searchByLocation({ state: ST_MULTI_CITY.state, county: ST_MULTI_CITY.county }, addDays(TODAY, -1));
      await st.reset();
      await verify('Every field is back to its default and the grid is empty', async () => {
        expect(await st.getZip()).toBe('');
        expect(await st.getLocation()).toEqual(defaults);
        expect(await st.getSearchDate()).toBe(TODAY);
        expect(await st.fieldsEnabled()).toMatchObject({ state: true, county: true, city: false });
        expect(await st.readGrid()).toEqual([]);
        expect(await st.getRecordsFoundCount()).toBe(0);
      });
    });
  });

  // ================================================================ D. Search results and as-of logic

  test.describe('D. Search results and as-of logic', () => {
    test('TC-TAX-ST-022: A Zip Code search shows that zip\'s jurisdiction', { tag: '@C107464' }, async () => {
      await about(`Searching zip ${ST_ZIP} shows exactly the record(s) the search returned, all for that zip.`);
      await st.open(ST_OFFICE);
      const { records } = await st.searchByZip(ST_ZIP);
      const rows = await st.readGrid();
      await verify('Grid rows equal the answer and every row is the zip', async () => {
        expect(records.length).toBeGreaterThan(0);
        expect(rows.map(shown)).toEqual(records.map(expectedCells));
        expect(rows.every((r) => r['Zip Code'] === ST_ZIP)).toBe(true);
      });
    });

    test('TC-TAX-ST-023: A State + County + City search returns only that location', { tag: '@C107465' }, async () => {
      await about(`Searching ${ST_MULTI_CITY.state} / ${ST_MULTI_CITY.county} / ${ST_MULTI_CITY.city} sends their ids and every row belongs to that location.`);
      await st.open(ST_OFFICE);
      await st.selectState(ST_MULTI_CITY.state);
      const county = await st.selectCounty(ST_MULTI_CITY.county);
      await st.selectCity(ST_MULTI_CITY.city);
      const { payload } = await st.clickSearchAndWait();
      const rows = await st.readGrid();
      await attachNote('Search payload', JSON.stringify(payload, null, 2));
      await verify('The ids are sent and all rows match the location', async () => {
        expect(payload.countyId).toBe(county!.countyId);
        expect(typeof payload.cityId).toBe('number');
        expect(rows.length).toBeGreaterThan(0);
        for (const r of rows) expect([r.State, r.County, r.City]).toEqual([ST_MULTI_CITY.state, ST_MULTI_CITY.county, ST_MULTI_CITY.city]);
      });
    });

    test('TC-TAX-ST-024: Records-found equals the server total and paging moves to the next page', { tag: '@C107466' }, async () => {
      await about(`A whole-state search (${ST_MULTI_CITY.state}, all counties) reports the server's total, shows one page of rows and Next loads different rows.`);
      await st.open(ST_OFFICE);
      const first = await st.clickSearchAndWait();
      const page1 = await st.readGrid();
      const counter = await st.getRecordsFoundCount();
      const second = await st.nextPage();
      const page2 = await st.readGrid();
      await attachNote('Paging', JSON.stringify({ total: first.totalCount, pageSize: first.payload.pageSize, page1: page1.length, page2: page2.length }, null, 2));
      await verify('Counter = total; page 1 is full; page 2 was requested and shows other rows', async () => {
        expect(counter).toBe(first.totalCount);
        expect(first.totalCount!).toBeGreaterThan(Number(first.payload.pageSize));
        expect(page1.length).toBe(Number(first.payload.pageSize));
        expect(second.payload.page).toBe(2);
        expect(await st.getPageNumber()).toBe('2');
        const key = (r: GridRow): string => `${r['Zip Code']}|${r['Geo Code']}|${r.City}`;
        expect(page2.map(key).filter((k) => page1.map(key).includes(k))).toEqual([]);
      });
    });

    test('TC-TAX-ST-025: The day before the latest version takes effect returns the earlier version', { tag: '@C107467' }, async () => {
      await about(`NM-4013: zip ${ST_ZIP} searched one day before its current version starts shows the version that was in force then.`);
      await st.open(ST_OFFICE);
      const v = await zipVersions(ST_ZIP);
      test.skip(!v.previous, `zip ${ST_ZIP} has a single version on this environment — no earlier boundary to test`);
      await verify('An earlier version is returned with its own rates and date', async () => {
        expect(wireDate(v.previous!.effectiveDate)! < v.latestDate).toBe(true);
        expect(expectedCells(v.previous!)).not.toEqual(expectedCells(v.latest));
      });
    });

    test('TC-TAX-ST-026: A version effective exactly on the search date is returned', { tag: '@C107468' }, async () => {
      await about(`EffectiveDate <= search date: zip ${ST_ZIP} searched on the very day its current version starts shows that version.`);
      await st.open(ST_OFFICE);
      const v = await zipVersions(ST_ZIP);
      const { payload, records } = await st.searchByZip(ST_ZIP, v.latestDate);
      await verify('The current version is returned for its own start date', async () => {
        expect(payload.effectiveDate).toBe(v.latestDate);
        expect(records.map(expectedCells)).toEqual([expectedCells(v.latest)]);
      });
    });

    test('TC-TAX-ST-027: Searching dates A → B → A restores the original results', { tag: '@C107469' }, async () => {
      await about('NM-4013: moving the as-of date later and back again never loses or replaces the earlier valid records.');
      await st.open(ST_OFFICE);
      const v = await zipVersions(ST_ZIP);
      const a = addDays(v.latestDate, -1);
      const first = await phase('Search at A (before the current version)', async () => (await st.searchByZip(ST_ZIP, a)).records);
      await st.reset();
      const later = await phase('Search at B (today)', async () => (await st.searchByZip(ST_ZIP, TODAY)).records);
      await st.reset();
      const again = await phase('Search at A again', async () => (await st.searchByZip(ST_ZIP, a)).records);
      await verify('A gives the same rows both times; B gives the current version', async () => {
        expect(again.map(expectedCells)).toEqual(first.map(expectedCells));
        expect(later.map(expectedCells)).toEqual([expectedCells(v.latest)]);
      });
    });

    test('TC-TAX-ST-028: A zip that matches nothing shows a clean empty state', { tag: '@C107470' }, async () => {
      await about(`Searching zip ${ST_EMPTY_ZIP} shows 0 records and the "no records" message, with no error.`);
      await st.open(ST_OFFICE);
      const { records } = await st.searchByZip(ST_EMPTY_ZIP);
      await verify('Empty answer, empty grid, counter 0, message shown, no error', async () => {
        expect(records).toEqual([]);
        expect(await st.readGrid()).toEqual([]);
        expect(await st.getRecordsFoundCount()).toBe(0);
        expect(await st.mainText()).toContain(ST_MESSAGES.emptyBasic);
        await expect(st.page.locator('[data-sonner-toast][data-type="error"]')).toHaveCount(0);
      });
    });

    test('TC-TAX-ST-029: A failed search shows an error and the page recovers', { tag: '@C107471' }, async () => {
      await about('When the search service answers 500 the user is told, the page stays usable, and the next search works.');
      await st.open(ST_OFFICE);
      await st.mockSearch({ kind: 'failure' });
      await st.typeZip(ST_ZIP);
      await st.clickSearch();
      const error = await st.waitForError();
      await attachNote('Error shown', error);
      await st.clearInterceptions();
      await st.reset();
      const retry = await st.searchByZip(ST_ZIP);
      await verify('An error was shown and a retry returns rows', async () => {
        expect(error.length).toBeGreaterThan(0);
        expect(await st.getHeading()).toBe(ST_PAGE_TITLE);
        expect(retry.records.length).toBeGreaterThan(0);
      });
    });
  });

  // ================================================================ E. Grid display and sorting

  test.describe('E. Grid display and sorting', () => {
    test('TC-TAX-ST-030: Grid values match the search answer field by field', { tag: '@C107472' }, async () => {
      await about('NM-4021 §4.3: every shown value — zip, geo code, state, county, city and the six rates — is the value the search returned.');
      await st.open(ST_OFFICE);
      const { records } = await st.searchByLocation({ state: ST_MULTI_CITY.state, county: ST_MULTI_CITY.county });
      const rows = await st.readGrid();
      await verify('Each row equals its record, rates shown with six decimals', async () => {
        expect(rows.length).toBe(records.length);
        expect(rows.map(shown)).toEqual(records.map(expectedCells));
      });
    });

    test('TC-TAX-ST-031: Combined Tax equals the sum of the five tiers on every row', { tag: '@C107473' }, async () => {
      await about('Combined Tax is State + County + County Local + City + City Local for every jurisdiction on the page.');
      await st.open(ST_OFFICE);
      await st.clickSearchAndWait();
      const rows = await st.readGrid();
      const off = rows.filter((r) => Math.abs(ST_TAX_TIERS.reduce((s, t) => s + num(r[t]), 0) - num(r['Combined Tax'])) > 1e-6);
      await attachNote('Rows whose tiers do not add up', JSON.stringify(off, null, 2));
      await verify('No row disagrees', async () => {
        expect(rows.length).toBeGreaterThan(0);
        expect(off).toEqual([]);
      });
    });

    test('TC-TAX-ST-032: Effective Date shows the stored calendar date', { tag: '@C107474' }, async ({ browser, config }) => inUtc(browser, config, async () => {
      await about('The Effective Date column shows the date the record is stored with (MM/DD/YYYY), not the day before.');
      await st.open(ST_OFFICE);
      const { records } = await st.searchByZip(ST_ZIP);
      const rows = await st.readGrid();
      await attachNote('Stored vs shown', JSON.stringify(records.map((r, i) => ({ stored: r.effectiveDate, shown: rows[i]?.['Effective Date'] })), null, 2));
      await verify('Shown date = stored calendar date', async () => {
        expect(rows.map((r) => fromUiDate(r['Effective Date'] ?? ''))).toEqual(records.map((r) => wireDate(r.effectiveDate)));
      });
    }));

    test('TC-TAX-ST-033: Grid columns follow the documented order', { tag: '@C107475' }, async () => {
      await about('After a search the Basic Information grid shows Zip Code, Geo Code, State, County, City, the five tiers, Combined Tax and Effective Date.');
      await st.open(ST_OFFICE);
      await st.searchByZip(ST_ZIP);
      await verify('Headers in documented order', async () => {
        expect(await st.getHeaderLabels()).toEqual([...ST_BASIC_COLUMNS]);
      });
    });

    test('TC-TAX-ST-034: Grid cells cannot be edited and rows have no checkboxes', { tag: '@C107476' }, async () => {
      await about('The results grid is read-only: double-clicking a rate opens no editor, typing changes nothing and there is no row selection.');
      await st.open(ST_OFFICE);
      await st.searchByZip(ST_ZIP);
      const before = await st.readGrid();
      const { editorAppeared } = await st.tryInlineEdit(0, 'State Tax', '9.99');
      await verify('No editor, unchanged values, no checkboxes', async () => {
        expect(editorAppeared).toBe(false);
        expect(await st.readGrid()).toEqual(before);
        await expect(st.grid().locator('input[type="checkbox"], [role="checkbox"]')).toHaveCount(0);
      });
    });

    test('TC-TAX-ST-035: Geo Code sorts ascending and descending', { tag: '@C107477' }, async () => {
      await about('NM-3959: sorting Geo Code from its header menu orders the rows both ways.');
      await st.open(ST_OFFICE);
      await st.clickSearchAndWait();
      await st.sortBy('Geo Code', 'ascending');
      const asc = (await st.readGrid()).map((r) => r['Geo Code']!);
      await st.sortBy('Geo Code', 'descending');
      const desc = (await st.readGrid()).map((r) => r['Geo Code']!);
      await attachNote('Geo codes', JSON.stringify({ asc: asc.slice(0, 5), desc: desc.slice(0, 5) }));
      await verify('Ascending then descending order', async () => {
        expect(asc.length).toBeGreaterThan(1);
        expect(isSorted(asc, 'ascending')).toBe(true);
        expect(isSorted(desc, 'descending')).toBe(true);
        expect(desc[0]! >= asc[0]!).toBe(true);
      });
    });
  });

  // ================================================================ F. Sales Tax History

  test.describe('F. Sales Tax History', () => {
    test('TC-TAX-ST-036: History search criteria offer the location fields and a date range defaulting to today', { tag: '@C107478' }, async () => {
      await about('The History tab has Zip Code, State, County, City, a Date Range (today – today on load), Reset and Search.');
      await st.open(ST_OFFICE);
      await st.switchTab('history');
      const range = await st.getDateRange();
      await verify('Controls visible and the range is today – today', async () => {
        for (const field of [st.zipField(), st.stateField(), st.countyField(), st.cityField(), st.dateRangeButton(), st.resetButton(), st.searchButton()]) {
          await expect(field).toBeVisible();
        }
        expect(range).toMatchObject({ start: TODAY, end: TODAY });
      });
    });

    test('TC-TAX-ST-037: History grid shows the standard columns and who changed each version', { tag: '@C107479' }, async () => {
      await about('The History grid carries every Basic Information column plus Modified By and Modified On.');
      await st.open(ST_OFFICE);
      await st.switchTab('history');
      const headers = await st.getHeaderLabels();
      await attachNote('History headers', headers.join(' | '));
      await verify('Standard and audit columns are all present', async () => {
        expect(headers).toEqual(expect.arrayContaining([...ST_HISTORY_STANDARD_COLUMNS, ...ST_HISTORY_AUDIT_COLUMNS]));
      });
    });

    test('TC-TAX-ST-038: A date-range search returns only versions effective inside the range, ends included', { tag: '@C107480' }, async () => {
      test.setTimeout(360_000);
      await about(`Zip ${ST_ZIP} searched from the previous version's start to the day before the current one returns only the previous version.`);
      await st.open(ST_OFFICE);
      const v = await zipVersions(ST_ZIP);
      test.skip(!v.previous, `zip ${ST_ZIP} has a single version on this environment — no range boundary to test`);
      const start = wireDate(v.previous!.effectiveDate)!;
      const end = addDays(v.latestDate, -1);
      await st.switchTab('history');
      await st.typeZip(ST_ZIP);
      await st.setDateRange(start, end);
      const { payload, records } = await st.clickSearchAndWait();
      await attachNote('History payload', JSON.stringify(payload, null, 2));
      await verify('Range sent as chosen; only the previous version, inside the range, comes back', async () => {
        expect(payload).toMatchObject({ zipCode: ST_ZIP, effectiveDateRangeStart: start, effectiveDateRangeEnd: end });
        expect(records.length).toBeGreaterThan(0);
        for (const r of records) expect(wireDate(r.effectiveDate)! >= start && wireDate(r.effectiveDate)! <= end, r.effectiveDate).toBe(true);
        expect(records.map(expectedCells)).toContainEqual(expectedCells(v.previous!));
        expect(records.map(expectedCells)).not.toContainEqual(expectedCells(v.latest));
      });
    });

    test('TC-TAX-ST-039: History lists the most recently modified version first by default', { tag: '@C107481' }, async () => {
      test.setTimeout(360_000);
      await about('NM-4011: without choosing a sort, the newest change sits at the top of the History grid (range covers both versions, ends included).');
      await st.open(ST_OFFICE);
      const v = await zipVersions(ST_ZIP);
      test.skip(!v.previous, `zip ${ST_ZIP} has a single version on this environment — nothing to order`);
      await st.switchTab('history');
      await st.typeZip(ST_ZIP);
      await st.setDateRange(wireDate(v.previous!.effectiveDate)!, v.latestDate);
      const { records } = await st.clickSearchAndWait();
      const modified = records.map((r) => r.updatedAt ?? '');
      await attachNote('Modified on, in grid order', modified.join('\n'));
      await verify('At least two versions, newest modification first', async () => {
        expect(records.length).toBeGreaterThan(1);
        expect(isSorted(modified, 'descending')).toBe(true);
      });
    });

    test('TC-TAX-ST-040: The Zip Code override rule also applies on the History tab', { tag: '@C107482' }, async () => {
      await about('On History, typing a Zip Code locks State, County and City and clearing it gives them back.');
      await st.open(ST_OFFICE);
      await st.switchTab('history');
      await st.typeZip(ST_ZIP);
      const locked = await st.fieldsEnabled();
      await st.clearZip();
      await verify('Locked with a zip, usable again without one', async () => {
        expect(locked).toMatchObject({ state: false, county: false, city: false, date: true });
        await expect.poll(async () => (await st.fieldsEnabled()).state).toBe(true);
        expect(await st.fieldsEnabled()).toMatchObject({ county: true, city: false });
      });
    });
  });

  // ================================================================ G. Flat file import

  test.describe('G. Flat file import', () => {
    const validFile = { name: 'sales-tax-import.txt', mimeType: 'text/plain', buffer: flatFile([ST_VALID_IMPORT_ROW]) };

    test('TC-TAX-ST-041: Import is offered to a full-access user and opens a .txt file picker', { tag: '@C107483' }, async () => {
      await about('The automation user (ManageTaxes.FullAccess) sees Import; clicking it opens a single-file picker limited to .txt.');
      await st.open(ST_OFFICE);
      await expect(st.importButton()).toBeVisible();
      const chooser = await st.openFilePicker();
      await verify('A single-file picker opens for .txt files', async () => {
        expect(chooser.isMultiple()).toBe(false);
        expect(await chooser.element().getAttribute('accept')).toBe('.txt');
      });
    });

    test('TC-TAX-ST-042: Files that are not .txt are refused before upload', { tag: '@C107484' }, async () => {
      await about(`${ST_NON_TXT_FILES.map((f) => f.name).join(', ')} are refused with "${ST_MESSAGES.invalidFileType}" and never sent.`);
      await st.open(ST_OFFICE);
      const sent = await st.interceptImport('abort');
      const messages: string[] = [];
      for (const f of ST_NON_TXT_FILES) {
        await st.chooseImportFile({ ...f, buffer: Buffer.from('not a tax file') });
        messages.push(await st.waitForToast('any'));
      }
      await verify('Each file got the file-type message and no upload was sent', async () => {
        for (const m of messages) expect(m).toContain(ST_MESSAGES.invalidFileType);
        expect(sent).toEqual([]);
      });
    });

    test('TC-TAX-ST-043: While a file uploads Import is locked, so a second upload cannot start', { tag: '@C107485' }, async () => {
      await about('NM-4254: during an upload the Import button shows it is busy and cannot be used; it comes back when the upload ends.');
      await st.open(ST_OFFICE);
      const sent = await st.interceptImport('delay-then-error');
      await st.chooseImportFile(validFile);
      await verify('Import is disabled while the upload is held', async () => {
        await expect(st.importButton()).toBeDisabled({ timeout: 3_000 });
      });
      await verify('Import is usable again afterwards and exactly one upload was sent', async () => {
        await expect(st.importButton()).toBeEnabled({ timeout: 30_000 });
        expect(sent).toHaveLength(1);
      });
    });

    test('TC-TAX-ST-044: A server error on import is reported and never shown as success', { tag: '@C107486' }, async () => {
      await about(`When the import service answers 500 the user sees "${ST_MESSAGES.importFailed}" and no success message.`);
      await st.open(ST_OFFICE);
      await st.interceptImport('server-error');
      await st.chooseImportFile(validFile);
      const error = await st.waitForToast('error');
      await verify('The failure message is shown, no success toast, Import usable', async () => {
        expect(error).toContain(ST_MESSAGES.importFailed);
        await expect(st.page.locator('[data-sonner-toast][data-type="success"]')).toHaveCount(0);
        await expect(st.importButton()).toBeEnabled();
      });
    });

    test('TC-TAX-ST-045: A successful import sends the fixed-width file and confirms success', { tag: '@C107487' }, async () => {
      await about('A conforming 181-character fixed-width .txt is uploaded as chosen, and a successful answer is confirmed to the user (answer mocked — nothing is stored).');
      await st.open(ST_OFFICE);
      await st.searchByZip(ST_ZIP);
      const sent = await st.interceptImport('success');
      await st.chooseImportFile(validFile);
      const toast = await st.waitForToast('success');
      await attachNote('Success message', toast);
      await verify('The upload carried the file unchanged and success was shown', async () => {
        expect(sent).toHaveLength(1);
        expect(sent[0]!.bodyText).toContain(`filename="${validFile.name}"`);
        expect(sent[0]!.bodyText).toContain(flatFileRow(ST_VALID_IMPORT_ROW));
        expect(flatFileRow(ST_VALID_IMPORT_ROW)).toHaveLength(FLAT_FILE_ROW_LENGTH);
        expect(toast.length).toBeGreaterThan(0);
      });
    });

    test('TC-TAX-ST-046: A file with bad rows is rejected whole, naming the row and the bad value', { tag: '@C107488' }, async () => {
      await about('NM-2328 / NM-3972: the server refuses a file with bad rate values, the message names the row and the value, and nothing is stored.');
      await st.open(ST_OFFICE);
      const answer = await st.importAndReadAnswer({ name: 'sales-tax-bad-rows.txt', mimeType: 'text/plain', buffer: flatFile(ST_INVALID_IMPORT_ROWS) });
      const panel = await st.readImportResult();
      await attachNote('Server answer / result panel', `${JSON.stringify(answer, null, 2)}\n${JSON.stringify(panel, null, 2)}`);
      await st.reset();
      const after = await st.searchByZip(ST_EMPTY_ZIP, '2099-12-31');
      await verify('Nothing inserted; every bad row is reported by row, column and value', async () => {
        expect(answer, 'no import answer was captured').not.toBeNull();
        expect(answer!.success).toBe(false);
        expect(answer!.insertedRows).toBe(0);
        expect(answer!.failedRows).toBeGreaterThan(0);
        for (const e of ST_INVALID_IMPORT_ERRORS) {
          expect(answer!.validationErrors.join('\n'), `row ${e.row}`).toMatch(new RegExp(`Row ${e.row}\\b.*${e.column}.*${e.value}`));
        }
      });
      await verify('The "Import Failed" panel lists the errors and the zip still has no record', async () => {
        expect(panel.title).toBe('Import Failed');
        for (const e of ST_INVALID_IMPORT_ERRORS) expect(panel.rows.join('\n')).toContain(e.value);
        expect(after.records).toEqual([]);
      });
    });

    test('TC-TAX-ST-047: The import endpoint refuses a request without a session', { tag: '@C107489' }, async () => {
      await about('NM-4021 §5.2: hiding Import is not enough — the import call itself is refused when it carries no signed-in session.');
      await st.open(ST_OFFICE);
      const held = await st.interceptImport('abort');
      await st.chooseImportFile({ name: 'sales-tax-bad-rows.txt', mimeType: 'text/plain', buffer: flatFile(ST_INVALID_IMPORT_ROWS) });
      await expect.poll(() => held.length).toBe(1);
      const answer = await st.replayWithoutSession(held[0]!);
      await attachNote('Answer without a session', JSON.stringify(answer, null, 2));
      // A server action answers HTTP 200 even when it refuses; the refusal is its result plus a redirect digest.
      await verify('Refused and sent to sign-in — the file was never validated', async () => {
        const refused = [401, 403].includes(answer.status) || (answer.result?.success === false && /\/auth\/sign-in/.test(answer.redirect ?? ''));
        expect(refused, JSON.stringify(answer)).toBe(true);
        expect(JSON.stringify(answer.result ?? {})).not.toContain(ST_INVALID_IMPORT_ERRORS[0].value);
      });
    });
  });

  // ================================================================ H. Session and input safety

  test.describe('H. Session and input safety', () => {
    test('TC-TAX-ST-048: Without a session the page sends the user to sign in', { tag: '@C107490' }, async ({ browser, config }) => {
      await about('A missing or expired session never shows tax data; the user is sent to sign in and brought back afterwards.');
      // Explicitly empty: inside a test, newContext() inherits the project's storageState (signed in).
      const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
      try {
        const page = await ctx.newPage();
        await page.goto(`${config.base_url}${ST_PATH(ST_OFFICE)}`, { waitUntil: 'domcontentloaded' });
        await verify('Redirected to sign-in with this page as the callback; no grid', async () => {
          await page.waitForURL((u) => /\/auth\/sign-in$/.test(u.pathname), { timeout: 60_000 });
          expect(new URL(page.url()).searchParams.get('callbackUrl')).toBe(`/${ST_PATH(ST_OFFICE)}`);
          await expect(page.locator('main table')).toHaveCount(0);
        });
      } finally {
        await ctx.close();
      }
    });

    test('TC-TAX-ST-049: Markup typed into Zip Code is never executed or rendered as HTML', { tag: '@C107491' }, async () => {
      await about('Script or image markup typed into Zip Code and searched is treated as text: nothing runs and no element is injected.');
      await st.open(ST_OFFICE);
      for (const input of ST_HOSTILE_ZIP_INPUTS) {
        await st.reset();
        await st.typeZip(input.typed);
        if (await st.searchButton().isEnabled()) await st.clickSearchAndWait();
      }
      await verify('No script ran and no injected element exists', async () => {
        expect(await st.page.evaluate(() => (window as unknown as { __stXss?: number }).__stXss)).toBeUndefined();
        await expect(st.page.locator('main img[src="x"]')).toHaveCount(0);
      });
    });
  });

  // ================================================================ I. Accessibility and layout

  test.describe('I. Accessibility and layout', () => {
    test('TC-TAX-ST-050: Every search control has an accessible name', { tag: '@C107492' }, async () => {
      // The State / County / City triggers carry no label association — the shared select component accepted
      // as designed on International Tax Setup (BUG-TAX-IST-003 dropped 2026-10-26), so they are not asserted.
      await about('Screen-reader users get a name for Zip Code, Effective Date and every button.');
      await st.open(ST_OFFICE);
      const names = await st.readControlAccessibleNames();
      await attachNote('Accessible names', JSON.stringify(names, null, 2));
      const checked = Object.entries(names).filter(([k]) => !['State', 'County', 'City'].includes(k));
      await verify('No other control is unnamed and the buttons say what they are', async () => {
        expect(checked.filter(([, n]) => n.length === 0).map(([k]) => k)).toEqual([]);
        expect(names['Zip Code']).toMatch(/zip/i);
        for (const button of ['Search', 'Reset', 'Import'] as const) expect(names[button], button).toMatch(new RegExp(button, 'i'));
      });
    });

    test('TC-TAX-ST-051: Tab order through the search panel follows the visual order', { tag: '@C107493' }, async () => {
      await about('Tabbing from Zip Code visits State, County, Effective Date, Reset and Search in that order (City is skipped while locked).');
      await st.open(ST_OFFICE);
      const targets = [
        ['State', st.stateField()],
        ['County', st.countyField()],
        ['Effective Date', st.searchDateField()],
        ['Reset', st.resetButton()],
        ['Search', st.searchButton()],
      ] as const;
      await st.zipField().focus();
      const order: string[] = [];
      for (let i = 0; i < 15 && order.length < targets.length; i++) {
        await st.page.keyboard.press('Tab');
        for (const [label, loc] of targets) {
          if (order.includes(label)) continue;
          if (await loc.evaluate((el) => el === document.activeElement || el.contains(document.activeElement))) order.push(label);
        }
      }
      await verify('Focus visits the controls in visual order', async () => {
        expect(order).toEqual(targets.map(([l]) => l));
      });
    });

    test('TC-TAX-ST-052: Automated WCAG 2.1 AA scan finds no serious or critical violations', { tag: '@C107494' }, async () => {
      // Excluded as accepted shared components: the select triggers' missing label (BUG-TAX-IST-003 dropped 2026-10-26)
      // and the tab strip's aria-controls to an unrendered panel (BUG-TAX-ST-007 dropped 2026-11-04). Everything else
      // is still scanned.
      await about('An axe-core scan of the page with results, on both tabs, finds no serious or critical violations outside the select triggers and the tab strip.');
      type AxeRun = { analyze(): Promise<{ violations: { id: string; impact: string | null; nodes: { target: unknown }[] }[] }> };
      type Axe = { withTags(t: string[]): Axe & AxeRun; exclude(selector: string): Axe & AxeRun };
      const AxeBuilder = createRequire(__filename)('@axe-core/playwright').default as new (o: { page: unknown }) => Axe;
      const scan = async (): Promise<{ id: string; impact: string | null; nodes: { target: unknown }[] }[]> =>
        (await new AxeBuilder({ page: st.page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).exclude('button[data-slot="select-trigger"]').exclude('[role="tablist"]').analyze())
          .violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      await st.open(ST_OFFICE);
      await st.searchByZip(ST_ZIP);
      const basic = await phase('Scan Basic Information', scan);
      await st.switchTab('history');
      const history = await phase('Scan Sales Tax History', scan);
      const summary = [...basic, ...history].map((v) => ({ id: v.id, impact: v.impact, targets: v.nodes.map((n) => n.target) }));
      await attachNote('axe violations', JSON.stringify(summary, null, 2));
      await verify('No serious or critical violations', async () => {
        expect(summary.map((v) => v.id)).toEqual([]);
      });
    });

    for (const [i, vp] of ST_VIEWPORTS.entries()) {
      const id = `TC-TAX-ST-${String(53 + i).padStart(3, '0')}`;
      test(`${id}: Page stays usable at ${vp.label}`, { tag: LOOP_CASE_TAGS[id] }, async () => {
        await about(`At ${vp.label} the search panel, Import and the results stay reachable and the page does not scroll sideways.`);
        const original = st.page.viewportSize();
        try {
          await st.page.setViewportSize({ width: vp.width, height: vp.height });
          await st.open(ST_OFFICE);
          await st.searchByZip(ST_ZIP);
          const overflow = await st.measureOverflow();
          await verify('Search, Import and the grid are reachable; no page-level horizontal scroll', async () => {
            for (const loc of [st.searchButton(), st.importButton(), st.grid()]) {
              await loc.scrollIntoViewIfNeeded();
              await expect(loc).toBeInViewport();
            }
            expect(overflow.pageOverflows).toBe(false);
          });
        } finally {
          if (original) await st.page.setViewportSize(original);
        }
      });
    }

    test('TC-TAX-ST-055: No untranslated i18n key is visible on the page', { tag: '@C107497' }, async () => {
      await about('Every label, header and message is real text, never a raw key like "taxes.salesTax.…".');
      await st.open(ST_OFFICE);
      await st.searchByZip(ST_ZIP);
      const basic = await st.findRawI18nKeys();
      await st.switchTab('history');
      const history = await st.findRawI18nKeys();
      await verify('No dotted i18n keys on either tab', async () => {
        expect([...basic, ...history]).toEqual([]);
      });
    });
  });

  // ================================================================ J. Sales Tax History — search, grid and resilience

  test.describe('J. Sales Tax History — search, grid and resilience', () => {
    test.beforeEach(() => {
      // Wide ranges walk the calendar back month by month (~120 clicks) before searching.
      test.setTimeout(360_000);
    });

    const HISTORY_SHOWN = [...SHOWN_COLUMNS, ...ST_HISTORY_AUDIT_COLUMNS];

    /** History rows as the grid must show them, audit columns included (Effective Date has its own case). */
    const historyCells = (r: ApiTaxRecord): GridRow => ({ ...expectedCells(r), 'Modified By': r.updatedBy ?? '', 'Modified On': toUiDateTime(r.updatedAt!) });
    const historyShown = (row: GridRow): GridRow => Object.fromEntries(HISTORY_SHOWN.map((k) => [k, row[k] ?? '']));

    /** History tab with a zip and the wide range, searched. */
    async function historyZipSearch(): Promise<SearchCapture> {
      await st.switchTab('history');
      await st.typeZip(ST_ZIP);
      await st.setDateRange(ST_HISTORY_FROM, TODAY);
      return st.clickSearchAndWait();
    }

    test('TC-TAX-ST-056: State → County → City lookups work on the History tab', { tag: '@C107498' }, async () => {
      await about(`On History, ${ST_MULTI_CITY.state} loads its counties and ${ST_MULTI_CITY.county} loads all of its cities, exactly as on Basic Information.`);
      await st.open(ST_OFFICE);
      await st.switchTab('history');
      // Counties already loaded for a state are served from the page's cache (no new lookup), so the County
      // list is checked as the user sees it; the city lookup for the county is always a fresh call.
      await st.selectState(ST_OTHER_STATE);
      await st.selectState(ST_MULTI_CITY.state);
      const counties = await st.readCountyOptions();
      const cities = await st.selectCounty(ST_MULTI_CITY.county);
      const offered = await st.readCityOptions();
      await verify('County lists the state\'s counties; City lists All plus every returned city', async () => {
        expect(counties[0]).toBe('All');
        expect(counties).toContain(ST_MULTI_CITY.county);
        expect(cities!.cities.length).toBeGreaterThan(1);
        expect(offered).toEqual(['All', ...cities!.cities]);
      });
    });

    test('TC-TAX-ST-057: Changing State on History resets County and City', { tag: '@C107499' }, async () => {
      test.fail(true, 'BUG-TAX-ST-002: on History too, City keeps the previous state\'s city and County goes blank');
      await about('On History, a new State clears the old County and City so a search never mixes two states.');
      await st.open(ST_OFFICE);
      await st.switchTab('history');
      await st.selectState(ST_MULTI_CITY.state);
      await st.selectCounty(ST_MULTI_CITY.county);
      await st.selectCity(ST_MULTI_CITY.city);
      await st.selectState(ST_OTHER_STATE);
      const loc = await st.getLocation();
      await attachNote('After the State change', JSON.stringify(loc));
      await verify('County and City are back to All', async () => {
        expect(loc).toMatchObject({ state: ST_OTHER_STATE, county: 'All', city: 'All' });
      });
    });

    test('TC-TAX-ST-058: A State + County search over a date range returns only that location', { tag: '@C107500' }, async () => {
      await about(`History for ${ST_MULTI_CITY.state} / ${ST_MULTI_CITY.county} from ${ST_HISTORY_FROM} to today sends the ids and the range, and every row is in that county.`);
      await st.open(ST_OFFICE);
      await st.switchTab('history');
      await st.selectState(ST_MULTI_CITY.state);
      const county = await st.selectCounty(ST_MULTI_CITY.county);
      await st.setDateRange(ST_HISTORY_FROM, TODAY);
      const { payload, records } = await st.clickSearchAndWait();
      const rows = await st.readGrid();
      await attachNote('History payload', JSON.stringify(payload, null, 2));
      await verify('Ids and range sent; every row is the county, effective inside the range', async () => {
        expect(payload).toMatchObject({ countyId: county!.countyId, effectiveDateRangeStart: ST_HISTORY_FROM, effectiveDateRangeEnd: TODAY });
        expect(rows.length).toBeGreaterThan(0);
        for (const r of rows) expect([r.State, r.County]).toEqual([ST_MULTI_CITY.state, ST_MULTI_CITY.county]);
        for (const r of records) expect(wireDate(r.effectiveDate)! >= ST_HISTORY_FROM && wireDate(r.effectiveDate)! <= TODAY, r.effectiveDate).toBe(true);
      });
    });

    test('TC-TAX-ST-059: Repeating a Zip Code search on History returns the same versions', { tag: '@C107501' }, async () => {
      test.fail(true, 'BUG-TAX-ST-003: on History too, the second zip search sends stateId=59 (AK) and finds nothing');
      await about('Clicking Search again on History with the same Zip Code and range gives the same versions — the locked State never joins the request.');
      await st.open(ST_OFFICE);
      const first = await historyZipSearch();
      const second = await st.clickSearchAndWait();
      await attachNote('Second search payload', JSON.stringify(second.payload, null, 2));
      await verify('Same versions; no State sent', async () => {
        expect(second.payload.stateId ?? '$undefined').toBe('$undefined');
        expect(second.records.map(expectedCells)).toEqual(first.records.map(expectedCells));
      });
    });

    test('TC-TAX-ST-060: Reset on History clears the criteria, restores today – today and empties the grid', { tag: '@C107502' }, async () => {
      await about('After a History search, Reset brings back the first-load state: empty Zip Code, default State, a today – today range and no rows.');
      await st.open(ST_OFFICE);
      await st.switchTab('history');
      const defaults = await st.getLocation();
      await historyZipSearch();
      await st.reset();
      await verify('Fields, range and grid are back to their defaults', async () => {
        expect(await st.getZip()).toBe('');
        expect(await st.getLocation()).toEqual(defaults);
        expect(await st.getDateRange()).toMatchObject({ start: TODAY, end: TODAY });
        expect(await st.readGrid()).toEqual([]);
        expect(await st.getRecordsFoundCount()).toBe(0);
      });
    });

    test('TC-TAX-ST-061: A History search that matches nothing shows a clean empty state', { tag: '@C107503' }, async () => {
      await about(`History for zip ${ST_EMPTY_ZIP} shows 0 records and "${ST_MESSAGES.emptyHistory}", with no error.`);
      await st.open(ST_OFFICE);
      await st.switchTab('history');
      const { records } = await st.searchByZip(ST_EMPTY_ZIP);
      await verify('Empty answer, empty grid, counter 0, message shown, no error', async () => {
        expect(records).toEqual([]);
        expect(await st.readGrid()).toEqual([]);
        expect(await st.getRecordsFoundCount()).toBe(0);
        expect(await st.mainText()).toContain(ST_MESSAGES.emptyHistory);
        await expect(st.page.locator('[data-sonner-toast][data-type="error"]')).toHaveCount(0);
      });
    });

    test('TC-TAX-ST-062: A failed History search shows an error and the tab recovers', { tag: '@C107504' }, async () => {
      await about('When the History search answers 500 the user is told, the tab stays usable, and the next search works.');
      await st.open(ST_OFFICE);
      await st.switchTab('history');
      await st.mockSearch({ kind: 'failure' });
      await st.typeZip(ST_ZIP);
      await st.clickSearch();
      const error = await st.waitForError();
      await attachNote('Error shown', error);
      await st.clearInterceptions();
      await st.reset();
      const retry = await historyZipSearch();
      await verify('An error was shown and a retry returns versions', async () => {
        expect(error.length).toBeGreaterThan(0);
        expect(await st.activeTab()).toBe(ST_TABS.history);
        expect(retry.records.length).toBeGreaterThan(0);
      });
    });

    test('TC-TAX-ST-063: History grid values, Modified By and Modified On match the search answer', { tag: '@C107505' }, async () => {
      await about('Every History cell is the value the search returned; Modified On is the update time shown in the business timezone (MM/DD/YYYY hh:mm:ss AM).');
      await st.open(ST_OFFICE);
      const { records } = await historyZipSearch();
      const rows = await st.readGrid();
      await verify('Each row equals its record, audit columns included', async () => {
        expect(records.length).toBeGreaterThan(0);
        expect(rows.map(historyShown)).toEqual(records.map(historyCells));
      });
    });

    test('TC-TAX-ST-064: History Effective Date shows the stored calendar date', { tag: '@C107506' }, async ({ browser, config }) => inUtc(browser, config, async () => {
      await about('On History, the Effective Date column shows the date each version is stored with, not the day before.');
      await st.open(ST_OFFICE);
      const { records } = await historyZipSearch();
      const rows = await st.readGrid();
      await attachNote('Stored vs shown', JSON.stringify(records.map((r, i) => ({ stored: r.effectiveDate, shown: rows[i]?.['Effective Date'] })), null, 2));
      await verify('Shown date = stored calendar date', async () => {
        expect(rows.map((r) => fromUiDate(r['Effective Date'] ?? ''))).toEqual(records.map((r) => wireDate(r.effectiveDate)));
      });
    }));

    test('TC-TAX-ST-065: History sorts on the server and keeps the sort when paging', { tag: '@C107507' }, async () => {
      await about(`History for ${ST_MULTI_CITY.state} since ${ST_HISTORY_FROM} sorted by Geo Code descending is ordered, and Next page asks for page 2 with the same sort.`);
      await st.open(ST_OFFICE);
      await st.switchTab('history');
      await st.setDateRange(ST_HISTORY_FROM, TODAY);
      const first = await st.clickSearchAndWait();
      const sorted = await st.sortAndWait('Geo Code', 'descending');
      const page1 = (await st.readGrid()).map((r) => r['Geo Code']!);
      const next = await st.nextPage();
      const page2 = (await st.readGrid()).map((r) => r['Geo Code']!);
      await attachNote('Paging', JSON.stringify({ total: first.totalCount, sorted: sorted.payload, next: next.payload }, null, 2));
      await verify('Sorted request and order on both pages; page 2 continues below page 1', async () => {
        expect(first.totalCount!).toBeGreaterThan(Number(first.payload.pageSize));
        expect(sorted.payload).toMatchObject({ sortBy: 'geoCode', sortDescending: true, page: 1 });
        expect(next.payload).toMatchObject({ sortBy: 'geoCode', sortDescending: true, page: 2 });
        expect(isSorted(page1, 'descending') && isSorted(page2, 'descending')).toBe(true);
        expect(page2[0]! <= page1[page1.length - 1]!).toBe(true);
      });
    });

    test('TC-TAX-ST-066: History grid cells cannot be edited', { tag: '@C107508' }, async () => {
      await about('The History grid is read-only: double-clicking a rate opens no editor and typing changes nothing.');
      await st.open(ST_OFFICE);
      await historyZipSearch();
      const before = await st.readGrid();
      const { editorAppeared } = await st.tryInlineEdit(0, 'State Tax', '9.99');
      await verify('No editor, unchanged values, no checkboxes', async () => {
        expect(editorAppeared).toBe(false);
        expect(await st.readGrid()).toEqual(before);
        await expect(st.grid().locator('input[type="checkbox"], [role="checkbox"]')).toHaveCount(0);
      });
    });
  });

  // ================================================================ K. Basic Information — grid controls

  test.describe('K. Basic Information — grid controls', () => {
    test('TC-TAX-ST-067: An Effective Date picked from the calendar is used by the search', { tag: '@C107509' }, async () => {
      const day = addDays(TODAY, -3);
      await about(`Choosing ${day} in the Effective Date calendar fills the field and the next search is run as of that date.`);
      await st.open(ST_OFFICE);
      await st.pickSearchDate(day);
      const shownDate = await st.getSearchDate();
      const { payload } = await st.searchByZip(ST_ZIP);
      await verify('The field holds the picked day and the search sends it', async () => {
        expect(shownDate).toBe(day);
        expect(payload.effectiveDate).toBe(day);
      });
    });

    test('TC-TAX-ST-068: Rows per page changes how many rows one page shows', { tag: '@C107510' }, async () => {
      await about(`For ${ST_MULTI_CITY.state} (all counties), choosing 10 rows per page asks the server for 10 and shows exactly 10, the counter unchanged.`);
      await st.open(ST_OFFICE);
      const first = await st.clickSearchAndWait();
      const ten = await st.setPageSize(10);
      const rows = await st.readGrid();
      await verify('pageSize 10 requested, 10 rows shown, same total', async () => {
        expect(ten.payload).toMatchObject({ pageSize: 10, page: 1 });
        expect(rows).toHaveLength(10);
        expect(await st.getRecordsFoundCount()).toBe(first.totalCount);
      });
    });

    test('TC-TAX-ST-069: Grid Options hides a column and Reset to Default View brings it back', { tag: '@C107511' }, async () => {
      await about('Unticking Geo Code in Grid Options removes that column; Reset to Default View restores every column in the documented order.');
      await st.open(ST_OFFICE);
      await st.searchByZip(ST_ZIP);
      await st.hideColumn('Geo Code');
      const hidden = await st.getHeaderLabels();
      await st.resetGridView();
      const restored = await st.getHeaderLabels();
      await verify('Geo Code gone after hiding, all columns back after reset', async () => {
        expect(hidden).toEqual(ST_BASIC_COLUMNS.filter((c) => c !== 'Geo Code'));
        expect(restored).toEqual([...ST_BASIC_COLUMNS]);
      });
    });

    test('TC-TAX-ST-070: Sorting Combined Tax orders the rows numerically on the server', { tag: '@C107512' }, async () => {
      await about(`For ${ST_MULTI_CITY.state} (all counties), sorting Combined Tax descending asks the server for that sort and shows the highest rates first.`);
      await st.open(ST_OFFICE);
      await st.clickSearchAndWait();
      const { payload } = await st.sortAndWait('Combined Tax', 'descending');
      const rates = (await st.readGrid()).map((r) => num(r['Combined Tax']));
      await verify('Server sort requested and rates never increase down the page', async () => {
        expect(payload).toMatchObject({ sortBy: 'combinedTax', sortDescending: true });
        expect(rates.length).toBeGreaterThan(1);
        expect(rates.every((v, i) => i === 0 || rates[i - 1]! >= v)).toBe(true);
      });
    });
  });
});

