import { createRequire } from 'module';
import { Browser } from '@playwright/test';
import { test, expect } from '../../src/fixtures/pages.fixture';
import { IConfig } from '../../src/types';
import { STATE_PATH } from '../../src/utils/auth-storage';
import { about, attachNote, phase, verify } from '../../src/fixtures/report-steps';
import { StateTaxPage, ApiStateTax, GridRow, CapturedSave } from '../../src/pages/taxes/state-tax.page';
import {
  STX_OFFICE,
  STX_PATH,
  STX_PAGE_TITLE,
  STX_TABS,
  STX_COLUMNS,
  STX_READONLY_COLUMNS,
  STX_EDITABLE_COLUMNS,
  STX_RATE_FILTER_OPTIONS,
  STX_EDIT_STATE,
  STX_FLAT_STATE,
  STX_PCT_RECORD,
  STX_VERSIONED,
  STX_TAX_TYPE,
  STX_HISTORY_RANGE,
  STX_BEFORE_ALL_VERSIONS,
  STX_MESSAGES,
  STX_NOTES_MAX,
  STX_RATE_BOUNDARIES,
  STX_HOSTILE_NOTES,
  STX_INVALID_DATES,
  STX_LOAD_BUDGET_MS,
  STX_VIEWPORTS,
  StxColumn,
  todayIso,
  addDays,
  toUiDate,
  toUiDateTime,
  wireDate,
} from '../../src/data/taxes/state-tax';

// Tax → State Tax (NM-4023 / feature epic NM-889). Requirements: NM-4023 test automation requirements
// document; behaviour from NM-2373/2374/2376 (UI), NM-2299/2300/2412/2282/2283 (API), NM-2375/2377/4006
// (no export) and the fixes NM-3991, NM-3997, NM-4009, NM-4054, NM-4059.
//
// Write policy — nothing in this spec writes. State tax versions are insert-only and drive live tax
// calculation, so every Save is held at the network (interceptSave) and the request is asserted instead.
//   * test.fail('BUG-TAX-STX-…') marks a case that asserts the documented behaviour against a known defect
//     (reports/bugs/). It passes while the bug exists and turns red when it is fixed — then drop the marker.
//   * Not automated (see the test plan): NM-4054 "saved values shown for date D" and the server-side
//     chronology answer — both need a real write.

// ---------------------------------------------------------------- TestRail mapping

// TestRail case tags for tests whose titles are built in a loop. Literal titles carry their tag
// inline; both come from config/testrail/case-map.json.
const LOOP_CASE_TAGS: Record<string, string> = {
  'TC-TAX-STX-008': '@C107520',
  'TC-TAX-STX-009': '@C107521',
  'TC-TAX-STX-034': '@C107546',
  'TC-TAX-STX-035': '@C107547',
  'TC-TAX-STX-037': '@C107549',
  'TC-TAX-STX-038': '@C107550',
  'TC-TAX-STX-039': '@C107551',
  'TC-TAX-STX-040': '@C107552',
  'TC-TAX-STX-041': '@C107553',
  'TC-TAX-STX-051': '@C107563',
  'TC-TAX-STX-052': '@C107564',
  'TC-TAX-STX-056': '@C107568',
  'TC-TAX-STX-057': '@C107569',
  'TC-TAX-STX-079': '@C107591',
  'TC-TAX-STX-080': '@C107592',
};

// ---------------------------------------------------------------- spec-local helpers

const TODAY = todayIso();
/** Later than every stored version (the latest on e2e is 2019-02-28), so a staged version is valid. */
const NEW_DATE = addDays(TODAY, 365);

const rate = (n: number | null): string => (n ?? 0).toFixed(6);

/** What the grid must show for a record, keyed by header (Effective Date has its own case). History shows "-" for empty text. */
function expectedCells(r: ApiStateTax, empty = ''): GridRow {
  return {
    State: r.stateName,
    'Tax Type': r.taxTypeName,
    'Flat Rate': rate(r.flatRate),
    'Taxable Percentage': rate(r.taxablePercentage),
    'End Date': r.endDate ? toUiDate(wireDate(r.endDate)!) : empty,
    Notes: r.notes || empty,
    'Modified By': r.updatedBy || '-',
    'Modified On': r.updatedAt ? toUiDateTime(r.updatedAt) : '-',
  };
}

const COMPARED = STX_COLUMNS.filter((c) => c !== 'Effective Date');

const shown = (row: GridRow): GridRow => Object.fromEntries(COMPARED.map((k) => [k, row[k] ?? '']));

const key = (r: { stateName: string; taxTypeName: string }): string => `${r.stateName} / ${r.taxTypeName}`;

function only(records: ApiStateTax[], what: string): ApiStateTax {
  if (records.length !== 1) throw new Error(`Expected exactly one ${what} record, got ${records.length}`);
  return records[0]!;
}

function isSorted(values: string[], direction: 'ascending' | 'descending'): boolean {
  return values.every((v, i) => i === 0 || (direction === 'ascending' ? values[i - 1]!.localeCompare(v) <= 0 : values[i - 1]!.localeCompare(v) >= 0));
}

test.describe('State Tax @taxes', () => {
  let stx: StateTaxPage;

  /**
   * Runs `body` with the page object on a UTC browser, where a date-only value renders as stored. The date cases
   * use it because the one-day shift west of UTC was accepted (BUG-TAX-STX-001/002 dropped 2026-11-05) — they keep checking
   * the date logic itself, independent of the machine's time zone.
   */
  async function inUtc(browser: Browser, config: IConfig, body: () => Promise<void>): Promise<void> {
    const ctx = await browser.newContext({ storageState: STATE_PATH, timezoneId: 'UTC' });
    const original = stx;
    try {
      stx = new StateTaxPage(await ctx.newPage(), config);
      await body();
    } finally {
      stx = original;
      await ctx.close();
    }
  }

  test.beforeEach(async ({ authenticatedSession, config }) => {
    test.setTimeout(180_000);
    stx = new StateTaxPage(authenticatedSession.page, config);
  });

  test.afterEach(async () => {
    if (!stx) return;
    await stx.clearInterceptions();
    await stx.leave();
  });

  /** Opens the page and lists the edit fixture state (40 baseline configurations, zero rates). */
  async function openEditFixture(): Promise<ApiStateTax[]> {
    await stx.open(STX_OFFICE);
    const { records } = await stx.search({ state: STX_EDIT_STATE });
    // The edit cases need untouched rows: a saved version with an End Date changes what Save allows.
    const touched = records.slice(0, 3).filter((r) => r.endDate || r.updatedBy || r.flatRate || r.taxablePercentage).map(key);
    if (touched.length) throw new Error(`Edit fixture ${STX_EDIT_STATE} is no longer on the baseline (${touched.join(', ')}) — set STX_EDIT_STATE to an untouched state`);
    return records;
  }

  /** The invariant behind NM-2300: no saved version may be dated on or before the latest stored one. */
  async function expectNoVersionAtOrBefore(captured: CapturedSave[], latest: string): Promise<void> {
    await attachNote('Save requests', captured.map((c) => c.body).join('\n') || '(none sent)');
    await verify(`Nothing is sent with an Effective Date on or before ${latest}`, async () => {
      const dates = captured.flatMap((c) => c.records.map((r) => wireDate(r.effectiveDate)));
      expect(dates.filter((d) => !d || d <= latest)).toEqual([]);
    });
  }

  // ================================================================ A. Navigation and page layout

  test.describe('A. Navigation and page layout', () => {
    test('TC-TAX-STX-001: Tax menu entry opens the State Tax page', { tag: '@C107513' }, async () => {
      await about('A user opens Tax in the sidebar and picks State Tax; the page opens with its title on the state-tax route.');
      await stx.openFromTaxMenu(STX_OFFICE);
      await attachNote('Route reached from the menu', stx.page.url());
      await verify('The heading reads State Tax on the state-tax route', async () => {
        expect(await stx.getHeading()).toBe(STX_PAGE_TITLE);
        expect(new URL(stx.page.url()).pathname).toMatch(/\/taxes\/state-tax$/);
      });
    });

    test('TC-TAX-STX-002: Basic Information is the active tab and State Tax History is offered', { tag: '@C107514' }, async () => {
      await about('Opening the page lands on Basic Information; the State Tax History tab sits beside it.');
      await stx.open(STX_OFFICE);
      await verify('Basic Information is selected and History is available', async () => {
        await expect(stx.tab('basic')).toHaveAttribute('aria-selected', 'true');
        await expect(stx.tab('history')).toHaveText(STX_TABS.history);
      });
    });

    test('TC-TAX-STX-003: Search panel offers State, Tax Type, Flat Rate/Taxable Percentage and Effective Date with their defaults', { tag: '@C107515' }, async () => {
      await about(`The search panel carries the three filters (all "All"), the as-of date (business today, ${TODAY}), Reset and Search.`);
      await stx.open(STX_OFFICE);
      await verify('Every control is visible and holds its default', async () => {
        for (const f of [stx.stateField(), stx.taxTypeField(), stx.rateField(), stx.searchDateField(), stx.resetButton(), stx.searchButton()]) await expect(f).toBeVisible();
        expect(await stx.getCriteria()).toEqual({ state: 'All', taxType: 'All', rate: 'All' });
        expect(await stx.getSearchDate()).toBe(TODAY);
      });
    });

    test('TC-TAX-STX-004: Before any search the grid shows its columns, 0 records, a prompt and a disabled Save', { tag: '@C107516' }, async () => {
      await about('Nothing is listed until the user searches: the header is drawn, the counter reads 0, the grid asks for criteria and Save is off.');
      await stx.open(STX_OFFICE);
      await verify('Header present, no rows, counter 0, prompt shown, Save disabled', async () => {
        expect(await stx.getHeaderLabels()).toEqual([...STX_COLUMNS]);
        expect(await stx.readGrid()).toEqual([]);
        expect(await stx.getRecordsFoundCount()).toBe(0);
        expect(await stx.mainText()).toContain(STX_MESSAGES.promptBasic);
        await expect(stx.saveButton()).toBeDisabled();
      });
    });

    test('TC-TAX-STX-005: Loading feedback shows while a search is pending and clears when results arrive', { tag: '@C107517' }, async () => {
      await about('While a search answer is slow the page shows that it is working, then the results replace the feedback.');
      await stx.open(STX_OFFICE);
      await stx.setCriteria({ state: STX_EDIT_STATE });
      await stx.mockSearch({ kind: 'delay', ms: 6_000 });
      await stx.clickSearch();
      await verify('A loading indicator (or a disabled Search) is shown while the answer is held', async () => {
        await expect.poll(async () => (await stx.isLoadingVisible()) || !(await stx.searchButton().isEnabled()), { timeout: 5_000 }).toBe(true);
      });
      await verify('The feedback clears and rows are shown once the answer lands', async () => {
        await expect.poll(() => stx.isLoadingVisible(), { timeout: 60_000 }).toBe(false);
        await expect.poll(async () => (await stx.readGrid()).length, { timeout: 30_000 }).toBeGreaterThan(0);
      });
    });

    test('TC-TAX-STX-006: An unfiltered search is usable within the load budget', { tag: '@C107518' }, async () => {
      await about(`Opening the page and searching every state and tax type shows results within ${STX_LOAD_BUDGET_MS / 1000} seconds.`);
      const started = Date.now();
      await stx.open(STX_OFFICE);
      await stx.search();
      const elapsed = Date.now() - started;
      await attachNote('Open + search time (ms)', String(elapsed));
      await verify('Elapsed time is inside the budget', async () => {
        expect(elapsed).toBeLessThan(STX_LOAD_BUDGET_MS);
      });
    });

    test('TC-TAX-STX-007: Neither tab offers an Export', { tag: '@C107519' }, async () => {
      await about('Export was rejected for State Tax (NM-2375, NM-2377, NM-4006): no Export control exists on Basic Information or State Tax History.');
      await stx.open(STX_OFFICE);
      await stx.search({ state: STX_EDIT_STATE });
      const basic = await stx.page.locator('main').getByRole('button', { name: /export/i }).count();
      await stx.switchTab('history');
      const history = await stx.page.locator('main').getByRole('button', { name: /export/i }).count();
      await verify('No Export button on either tab', async () => {
        expect({ basic, history }).toEqual({ basic: 0, history: 0 });
      });
    });
  });

  // ================================================================ B. Search criteria and validation

  test.describe('B. Search criteria and validation', () => {
    for (const [id, name, field] of [['008', 'State', 'stateField'], ['009', 'Tax Type', 'taxTypeField']] as const) {
      test(`TC-TAX-STX-${id}: ${name} offers All first, then unique non-blank options`, { tag: LOOP_CASE_TAGS[`TC-TAX-STX-${id}`] }, async () => {
        await about(`The ${name} dropdown starts with All and lists every ${name.toLowerCase()} once, with no blank entry.`);
        await stx.open(STX_OFFICE);
        const options = await stx.readOptions(stx[field]());
        await attachNote(`${name} options`, options.join('\n'));
        await verify('All first; no blanks; no duplicates; more than one real option', async () => {
          expect(options[0]).toBe('All');
          expect(options.filter((o) => o.trim() === '')).toEqual([]);
          expect(new Set(options).size).toBe(options.length);
          expect(options.length).toBeGreaterThan(2);
        });
      });
    }

    test('TC-TAX-STX-010: Flat Rate/Taxable Percentage offers All, Flat Rate and Taxable Percentage', { tag: '@C107522' }, async () => {
      await about('The rate filter lists exactly All, Flat Rate and Taxable Percentage.');
      await stx.open(STX_OFFICE);
      const options = await stx.readOptions(stx.rateField());
      await attachNote('Options', options.join('\n'));
      await verify('The three options in order', async () => {
        expect(options).toEqual([...STX_RATE_FILTER_OPTIONS]);
      });
    });

    test('TC-TAX-STX-011: Flat Rate/Taxable Percentage shows no blank option and defaults to All', { tag: '@C107523' }, async () => {
      await about('NM-3997 regression: the rate filter never shows or pre-selects an empty option.');
      await stx.open(STX_OFFICE);
      const options = await stx.readOptions(stx.rateField());
      await verify('No blank option; All selected', async () => {
        expect(options.filter((o) => o.trim() === '')).toEqual([]);
        expect((await stx.getCriteria()).rate).toBe('All');
      });
    });

    test('TC-TAX-STX-012: Search request carries the selected State, Tax Type, rate filter and as-of date', { tag: '@C107524' }, async () => {
      await about(`The search sent for ${STX_EDIT_STATE} / Rental / Flat Rate as of a chosen date carries the ids of those choices and the date unshifted.`);
      await stx.open(STX_OFFICE);
      const asOf = addDays(TODAY, -10);
      const unfiltered = (await stx.search()).payload;
      const { payload } = await stx.search({ state: STX_EDIT_STATE, taxType: STX_TAX_TYPE, rate: 'Flat Rate', date: asOf });
      await attachNote('Payloads', JSON.stringify({ unfiltered, payload }, null, 2));
      await verify('Unfiltered sends no ids; filtered sends numeric ids, the Flat Rate value and the date', async () => {
        expect(unfiltered.state).toBe('$undefined');
        expect(unfiltered.taxType).toBe('$undefined');
        expect(typeof payload.state).toBe('number');
        expect(typeof payload.taxType).toBe('number');
        expect(payload.taxablePercentage).not.toBe(unfiltered.taxablePercentage);
        expect(payload.effectiveDate).toBe(asOf);
      });
    });

    test('TC-TAX-STX-013: A blank Effective Date blocks the search', { tag: '@C107525' }, async () => {
      await about('With the as-of date cleared, Search cannot run and nothing is sent.');
      await stx.open(STX_OFFICE);
      const sent = await stx.recordSearches();
      await stx.typeSearchDate('');
      if (await stx.searchButton().isEnabled()) await stx.clickSearch();
      const state = await stx.readSearchValidation();
      await attachNote('Validation', JSON.stringify(state));
      await verify('Search disabled or flagged, and no search sent', async () => {
        expect(!state.searchEnabled || state.invalidFields > 0 || state.messages.length > 0).toBe(true);
        expect(sent).toEqual([]);
      });
    });

    test('TC-TAX-STX-014: An impossible date typed into Effective Date never reaches a search', { tag: '@C107526' }, async () => {
      await about(`Typing ${STX_INVALID_DATES.join(', ')} and pressing Search never sends one of them as the as-of date.`);
      await stx.open(STX_OFFICE);
      const sent = await stx.recordSearches();
      for (const text of STX_INVALID_DATES) {
        await stx.typeSearchDate(text);
        if (await stx.searchButton().isEnabled()) await stx.clickSearch();
        await stx.page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
      }
      await attachNote('Searches sent', sent.join('\n') || '(none)');
      await verify('Every search sent carried a real calendar date', async () => {
        for (const body of sent) {
          const d = JSON.parse(body)[0].effectiveDate as string;
          expect(Number.isNaN(new Date(`${d}T00:00:00Z`).getTime()) || toUiDate(d) === '02/30/2026').toBe(false);
        }
      });
    });

    test('TC-TAX-STX-015: Reset restores the defaults and clears the grid', { tag: '@C107527' }, async () => {
      await about('After a filtered search, Reset puts every filter back to All, the date back to today and empties the grid.');
      await stx.open(STX_OFFICE);
      await stx.search({ state: STX_EDIT_STATE, taxType: STX_TAX_TYPE, rate: 'Flat Rate', date: addDays(TODAY, -3) });
      await stx.reset();
      await verify('Defaults restored; no rows; prompt shown', async () => {
        expect(await stx.getCriteria()).toEqual({ state: 'All', taxType: 'All', rate: 'All' });
        expect(await stx.getSearchDate()).toBe(TODAY);
        expect(await stx.readGrid()).toEqual([]);
        expect(await stx.mainText()).toContain(STX_MESSAGES.promptBasic);
      });
    });

    test('TC-TAX-STX-016: Re-selecting the same Effective Date from the calendar searches again', { tag: '@C107528' }, async () => {
      await about('NM-3991 regression: after a search, picking the same date again in the calendar and searching sends a fresh search and refreshes the grid.');
      await stx.open(STX_OFFICE);
      await stx.setCriteria({ state: STX_EDIT_STATE });
      const date = addDays(TODAY, -1);
      await stx.pickSearchDate(date);
      const first = await stx.clickSearchAndWait();
      await stx.pickSearchDate(date);
      const second = await stx.clickSearchAndWait();
      await verify('Both searches carried the date and returned the same rows', async () => {
        expect([first.payload.effectiveDate, second.payload.effectiveDate]).toEqual([date, date]);
        expect(second.records.map(key)).toEqual(first.records.map(key));
        expect((await stx.readGrid()).length).toBeGreaterThan(0);
      });
    });
  });

  // ================================================================ C. Search results and as-of logic

  test.describe('C. Search results and as-of logic', () => {
    test('TC-TAX-STX-017: A State filter returns only that state, one row per tax type', { tag: '@C107529' }, async () => {
      await about(`Searching ${STX_EDIT_STATE} returns only ${STX_EDIT_STATE} configurations and each tax type once.`);
      await stx.open(STX_OFFICE);
      const { records } = await stx.search({ state: STX_EDIT_STATE });
      const rows = await stx.readGrid();
      await verify('Only the chosen state; tax types unique; counter = answer', async () => {
        expect(records.length).toBeGreaterThan(0);
        expect([...new Set([...records.map((r) => r.stateName), ...rows.map((r) => r.State)])]).toEqual([STX_EDIT_STATE]);
        expect(new Set(records.map((r) => r.taxTypeName)).size).toBe(records.length);
        expect(await stx.getRecordsFoundCount()).toBe(records.length);
      });
    });

    test('TC-TAX-STX-018: A Tax Type filter returns only that tax type, one row per state', { tag: '@C107530' }, async () => {
      await about(`Searching ${STX_TAX_TYPE} returns only ${STX_TAX_TYPE} configurations and each state once.`);
      await stx.open(STX_OFFICE);
      const { records } = await stx.search({ taxType: STX_TAX_TYPE });
      const rows = await stx.readGrid();
      await verify('Only the chosen tax type; states unique', async () => {
        expect(records.length).toBeGreaterThan(1);
        expect([...new Set([...records.map((r) => r.taxTypeName), ...rows.map((r) => r['Tax Type'])])]).toEqual([STX_TAX_TYPE]);
        expect(new Set(records.map((r) => r.stateName)).size).toBe(records.length);
      });
    });

    test('TC-TAX-STX-019: State and Tax Type together return exactly that configuration', { tag: '@C107531' }, async () => {
      await about('Combining a State and a Tax Type narrows the result to the single configuration they name.');
      await stx.open(STX_OFFICE);
      const { records } = await stx.search({ state: STX_EDIT_STATE, taxType: STX_TAX_TYPE });
      await verify('One row, for that state and tax type', async () => {
        expect(records.map(key)).toEqual([`${STX_EDIT_STATE} / ${STX_TAX_TYPE}`]);
        expect((await stx.readGrid()).map((r) => `${r.State} / ${r['Tax Type']}`)).toEqual([`${STX_EDIT_STATE} / ${STX_TAX_TYPE}`]);
      });
    });

    test('TC-TAX-STX-020: The Flat Rate filter returns only configurations with a Flat Rate above zero', { tag: '@C107532' }, async () => {
      await about('NM-2299: filtering on Flat Rate lists only configurations whose Flat Rate is greater than 0.');
      await stx.open(STX_OFFICE);
      const { records } = await stx.search({ rate: 'Flat Rate' });
      await attachNote('Configurations', records.map((r) => `${key(r)}: ${r.flatRate}`).join('\n'));
      await verify('At least one row; every Flat Rate > 0 in the answer and in the grid', async () => {
        expect(records.length).toBeGreaterThan(0);
        expect(records.filter((r) => !((r.flatRate ?? 0) > 0)).map(key)).toEqual([]);
        expect((await stx.readGrid()).filter((r) => !(Number(r['Flat Rate']) > 0)).map((r) => r['Tax Type'])).toEqual([]);
      });
    });

    test('TC-TAX-STX-021: The Taxable Percentage filter returns only configurations with a Taxable Percentage above zero', { tag: '@C107533' }, async () => {
      await about('NM-2299: filtering on Taxable Percentage lists only configurations whose Taxable Percentage is greater than 0.');
      await stx.open(STX_OFFICE);
      const { records } = await stx.search({ rate: 'Taxable Percentage' });
      await verify(`At least ${key({ stateName: STX_PCT_RECORD.state, taxTypeName: STX_PCT_RECORD.taxType })}; every Taxable Percentage > 0`, async () => {
        expect(records.map(key)).toContain(`${STX_PCT_RECORD.state} / ${STX_PCT_RECORD.taxType}`);
        expect(records.filter((r) => !((r.taxablePercentage ?? 0) > 0)).map(key)).toEqual([]);
      });
    });

    test('TC-TAX-STX-022: An unfiltered search lists every configuration once and the counter matches', { tag: '@C107534' }, async () => {
      await about('Searching with every filter on All returns each state / tax type configuration exactly once — the as-of search never lists two versions of one configuration.');
      await stx.open(STX_OFFICE);
      const { records, totalCount } = await stx.search();
      const keys = records.map(key);
      await verify('No configuration twice; counter equals the answer', async () => {
        expect(keys.filter((k, i) => keys.indexOf(k) !== i)).toEqual([]);
        expect(await stx.getRecordsFoundCount()).toBe(totalCount);
        expect(totalCount).toBe(records.length);
      });
    });

    test('TC-TAX-STX-023: The day before a version takes effect returns the earlier version', { tag: '@C107535' }, async () => {
      await about(`NM-2299 as-of rule: ${STX_VERSIONED.state} / ${STX_VERSIONED.taxType} searched the day before its current version starts shows the version before it.`);
      await stx.open(STX_OFFICE);
      const current = only((await stx.search(STX_VERSIONED)).records, 'current');
      const starts = wireDate(current.effectiveDate)!;
      const before = only((await stx.search({ date: addDays(starts, -1) })).records, 'earlier');
      await attachNote('Versions', JSON.stringify({ current: current.effectiveDate, before: before.effectiveDate }));
      await verify('The earlier version is returned, dated before the current one', async () => {
        expect(wireDate(before.effectiveDate)! < starts).toBe(true);
      });
    });

    test('TC-TAX-STX-024: A version effective exactly on the search date is returned', { tag: '@C107536' }, async () => {
      await about('Boundary of the as-of rule: searching on the very day a version takes effect returns that version.');
      await stx.open(STX_OFFICE);
      const current = only((await stx.search(STX_VERSIONED)).records, 'current');
      const starts = wireDate(current.effectiveDate)!;
      const onDay = only((await stx.search({ date: starts })).records, 'exact-day');
      await verify('The version starting that day is returned', async () => {
        expect(wireDate(onDay.effectiveDate)).toBe(starts);
      });
    });

    test('TC-TAX-STX-025: A date before every stored version returns nothing', { tag: '@C107537' }, async () => {
      await about(`Searching as of ${STX_BEFORE_ALL_VERSIONS}, before any configuration existed, shows an empty grid and 0 records without an error.`);
      await stx.open(STX_OFFICE);
      const { records } = await stx.search({ state: STX_EDIT_STATE, date: STX_BEFORE_ALL_VERSIONS });
      await verify('No records, no rows, counter 0, no error', async () => {
        expect(records).toEqual([]);
        expect(await stx.readGrid()).toEqual([]);
        expect(await stx.getRecordsFoundCount()).toBe(0);
        await expect(stx.page.locator('[data-sonner-toast][data-type="error"]')).toHaveCount(0);
      });
    });

    test('TC-TAX-STX-026: A failed search shows an error, and the next search works', { tag: '@C107538' }, async () => {
      await about('When the search answers 500 the user sees an error; once the service is back, the same search returns rows.');
      await stx.open(STX_OFFICE);
      await stx.setCriteria({ state: STX_EDIT_STATE });
      await stx.mockSearch({ kind: 'failure' });
      await stx.clickSearch();
      const error = await stx.waitForError();
      await attachNote('Error shown', error);
      await stx.clearInterceptions();
      const { records } = await stx.clickSearchAndWait();
      await verify('An error was shown; the retry returned rows', async () => {
        expect(error.length).toBeGreaterThan(0);
        expect(records.length).toBeGreaterThan(0);
      });
    });
  });

  // ================================================================ D. Grid display

  test.describe('D. Grid display', () => {
    test('TC-TAX-STX-027: Basic Information grid shows the documented columns in order', { tag: '@C107539' }, async () => {
      await about('NM-4023 §3.2: State, Tax Type, Flat Rate, Taxable Percentage, Effective Date, End Date, Notes, Modified By, Modified On.');
      await stx.open(STX_OFFICE);
      await stx.search({ state: STX_EDIT_STATE });
      await verify('Headers in order', async () => {
        expect(await stx.getHeaderLabels()).toEqual([...STX_COLUMNS]);
      });
    });

    test('TC-TAX-STX-028: State, Tax Type, Modified By and Modified On cannot be edited', { tag: '@C107540' }, async () => {
      await about('The identifying and audit columns are plain text — no editor appears in them.');
      await openEditFixture();
      const editable: string[] = [];
      for (const c of STX_READONLY_COLUMNS) if (await stx.isCellEditable(0, c)) editable.push(c);
      await verify('None of the read-only columns offers an editor', async () => {
        expect(editable).toEqual([]);
      });
    });

    test('TC-TAX-STX-029: Flat Rate, Taxable Percentage, Effective Date and Notes are editable in the grid', { tag: '@C107541' }, async () => {
      await about('NM-2374: the rate, percentage, date and notes cells of a zero-rate row each offer an editor.');
      await openEditFixture();
      const missing: string[] = [];
      for (const c of STX_EDITABLE_COLUMNS) if (!(await stx.isCellEditable(0, c))) missing.push(c);
      await verify('Every editable column offers an editor', async () => {
        expect(missing).toEqual([]);
      });
    });

    test('TC-TAX-STX-030: End Date is editable in Basic Information', { tag: '@C107542' }, async () => {
      // Accepted (BUG-TAX-STX-006 dropped 2026-11-05): NM-4023 §3.2 calls End Date read-only, but the grid edits it and it is saved.
      await about('Each Basic Information row offers an End Date editor alongside the Effective Date.');
      await openEditFixture();
      await verify('End Date offers an editor', async () => {
        expect(await stx.isCellEditable(0, 'End Date')).toBe(true);
      });
    });

    test('TC-TAX-STX-031: Every rendered cell shows the value of the record behind it', { tag: '@C107543' }, async () => {
      await about('For the Flat Rate configurations, each cell (rates to 6 decimals, notes, Modified By, Modified On in business time) equals its record.');
      await stx.open(STX_OFFICE);
      const { records } = await stx.search({ state: STX_FLAT_STATE });
      const byKey = new Map(records.map((r) => [key(r), r]));
      const rows = await stx.readGrid();
      await verify('Each rendered row equals its record', async () => {
        expect(rows.length).toBeGreaterThan(0);
        for (const row of rows) expect(shown(row)).toEqual(expectedCells(byKey.get(`${row.State} / ${row['Tax Type']}`)!));
      });
    });

    test('TC-TAX-STX-032: Effective Date shows the calendar date the version is stored with', { tag: '@C107544' }, async ({ browser, config }) => inUtc(browser, config, async () => {
      await about('A version stored as effective 2018-12-01 shows 12/01/2018 in the grid, whatever the browser timezone.');
      await stx.open(STX_OFFICE);
      const { records } = await stx.search({ state: STX_FLAT_STATE });
      const rows = await stx.readGrid();
      const wrong = rows.map((r) => ({ row: r, rec: records.find((x) => key(x) === `${r.State} / ${r['Tax Type']}`)! }))
        .filter(({ row, rec }) => row['Effective Date'] !== toUiDate(wireDate(rec.effectiveDate)!))
        .map(({ row, rec }) => `${row['Tax Type']}: shown ${row['Effective Date']}, stored ${wireDate(rec.effectiveDate)}`);
      await attachNote('Mismatches', wrong.join('\n') || '(none)');
      await verify('Every Effective Date equals the stored date', async () => {
        expect(wrong).toEqual([]);
      });
    }));

    test('TC-TAX-STX-033: Sorting Tax Type orders the rows both ways', { tag: '@C107545' }, async () => {
      await about('The Tax Type header menu sorts the rows Z→A and back A→Z.');
      await openEditFixture();
      await stx.sortBy('Tax Type', 'descending');
      const desc = (await stx.readGrid()).map((r) => r['Tax Type']!);
      await stx.sortBy('Tax Type', 'ascending');
      const asc = (await stx.readGrid()).map((r) => r['Tax Type']!);
      await verify('Descending then ascending order', async () => {
        expect(isSorted(desc, 'descending')).toBe(true);
        expect(isSorted(asc, 'ascending')).toBe(true);
        expect(desc[0]).not.toBe(asc[0]);
      });
    });
  });

  // ================================================================ E. In-grid editing and validation

  test.describe('E. In-grid editing and validation', () => {
    for (const [id, typed, cleared] of [['034', 'Flat Rate', 'Taxable Percentage'], ['035', 'Taxable Percentage', 'Flat Rate']] as const) {
      test(`TC-TAX-STX-${id}: Entering a ${typed} sets ${cleared} to zero and locks it`, { tag: LOOP_CASE_TAGS[`TC-TAX-STX-${id}`] }, async () => {
        await about(`NM-2374 mutual exclusivity: a ${typed} above 0 forces ${cleared} to 0.000000 and ${cleared} can no longer be edited.`);
        await openEditFixture();
        await stx.editCell(0, typed, '0.05');
        await verify(`${typed} kept, ${cleared} zero and locked`, async () => {
          expect(await stx.readCell(0, typed)).toBe('0.050000');
          expect(await stx.readCell(0, cleared)).toBe('0.000000');
          expect(await stx.isCellEditable(0, cleared)).toBe(false);
        });
      });
    }

    test('TC-TAX-STX-036: Setting Flat Rate back to zero makes Taxable Percentage editable again', { tag: '@C107548' }, async () => {
      await about('Clearing the Flat Rate back to 0 releases the lock, so the row can switch to a Taxable Percentage.');
      await openEditFixture();
      await stx.editCell(0, 'Flat Rate', '0.05');
      await stx.editCell(0, 'Flat Rate', '0');
      await verify('Taxable Percentage is editable again', async () => {
        expect(await stx.isCellEditable(0, 'Taxable Percentage')).toBe(true);
      });
    });

    for (const [i, c] of STX_RATE_BOUNDARIES.entries()) {
      test(`TC-TAX-STX-${String(37 + i).padStart(3, '0')}: Rate input boundary — ${c.label}`, { tag: LOOP_CASE_TAGS[`TC-TAX-STX-${String(37 + i).padStart(3, '0')}`] }, async () => {
        await about(`Typing "${c.typed}" into ${c.column} and leaving the cell shows ${c.shown}.`);
        await openEditFixture();
        await stx.editCell(1, c.column as StxColumn, c.typed);
        await verify(`${c.column} shows ${c.shown}`, async () => {
          expect(await stx.readCell(1, c.column as StxColumn)).toBe(c.shown);
        });
      });
    }

    test('TC-TAX-STX-042: Rates of 1 and above are read as percentages, rates below 1 as fractions', { tag: '@C107554' }, async () => {
      // Accepted entry rule (BUG-TAX-STX-008 dropped 2026-11-05): an entry >= 1 is a percentage and is divided by
      // 100 (capped at 1.000000); an entry < 1 is already a fraction and is kept.
      await about('Typing 0.005 or 0.99 keeps the fraction; typing 1, 99 or 100 is read as a percentage and stored as 0.010000, 0.990000 and 1.000000.');
      await openEditFixture();
      const expected: Record<string, string> = { '0.005': '0.005000', '0.99': '0.990000', '1': '0.010000', '99': '0.990000', '100': '1.000000' };
      const results: Record<string, string> = {};
      for (const typed of Object.keys(expected)) {
        await stx.editCell(1, 'Flat Rate', typed);
        results[typed] = await stx.readCell(1, 'Flat Rate');
      }
      await attachNote('Typed → shown', JSON.stringify(results, null, 2));
      await verify('Every entry is stored by the rule', async () => {
        expect(results).toEqual(expected);
      });
    });

    test('TC-TAX-STX-043: Notes accept at most 500 characters', { tag: '@C107555' }, async () => {
      await about(`A note longer than ${STX_NOTES_MAX} characters is cut at ${STX_NOTES_MAX} — the cell never holds more.`);
      await openEditFixture();
      await stx.editCell(1, 'Notes', 'n'.repeat(STX_NOTES_MAX + 50));
      await verify(`The note holds at most ${STX_NOTES_MAX} characters`, async () => {
        expect((await stx.readCell(1, 'Notes')).length).toBe(STX_NOTES_MAX);
      });
    });

    test('TC-TAX-STX-044: Markup typed into Notes is never executed or rendered as HTML', { tag: '@C107556' }, async () => {
      await about('Script or image markup typed into a note stays text: nothing runs and no element is injected.');
      await openEditFixture();
      for (const [i, input] of STX_HOSTILE_NOTES.entries()) await stx.editCell(i, 'Notes', input.typed);
      await verify('No script ran, no injected element, the text is kept', async () => {
        expect(await stx.page.evaluate(() => (window as unknown as { __stxXss?: number }).__stxXss)).toBeUndefined();
        await expect(stx.page.locator('main img[src="x"]')).toHaveCount(0);
        expect(await stx.readCell(0, 'Notes')).toBe(STX_HOSTILE_NOTES[0].typed);
      });
    });

    test('TC-TAX-STX-045: Focusing an Effective Date and leaving it untouched keeps the date', { tag: '@C107557' }, async ({ browser, config }) => inUtc(browser, config, async () => {
      await about('Clicking into a row\'s Effective Date and clicking away without typing must not change it.');
      await openEditFixture();
      const before = await stx.readCell(0, 'Effective Date');
      await stx.focusAndLeave(0, 'Effective Date');
      await stx.focusAndLeave(0, 'Effective Date');
      const after = await stx.readCell(0, 'Effective Date');
      await attachNote('Effective Date', `${before} → ${after}`);
      await verify('The date is unchanged', async () => {
        expect(after).toBe(before);
      });
    }));

    test('TC-TAX-STX-046: A typed Effective Date is kept as typed', { tag: '@C107558' }, async ({ browser, config }) => inUtc(browser, config, async () => {
      await about(`Typing ${toUiDate(NEW_DATE)} into a row's Effective Date leaves exactly that date in the cell.`);
      await openEditFixture();
      await stx.editCell(0, 'Effective Date', toUiDate(NEW_DATE));
      await verify('The cell shows the typed date', async () => {
        expect(await stx.readCell(0, 'Effective Date')).toBe(toUiDate(NEW_DATE));
      });
    }));
  });

  // ================================================================ F. Dirty state and the unsaved-changes guard

  test.describe('F. Dirty state and the unsaved-changes guard', () => {
    test('TC-TAX-STX-047: Notes and Effective Date edits enable Save; a rate edit also needs a later Effective Date', { tag: '@C107559' }, async () => {
      // Accepted guard (BUG-TAX-STX-004 dropped 2026-11-05): a rate change is a new version, so Save waits for a later date.
      await about('After a search Save is off. A note or a new Effective Date turns it on; a new Flat Rate alone keeps it off until the row also gets a later Effective Date.');
      const result: Record<string, boolean[]> = {};
      for (const [column, text] of [['Notes', 'dirty'], ['Effective Date', toUiDate(NEW_DATE)], ['Flat Rate', '0.05']] as [StxColumn, string][]) {
        await openEditFixture();
        const states = [await stx.isSaveEnabled()];
        await stx.editCell(0, column, text);
        states.push(await stx.isSaveEnabled());
        if (column === 'Flat Rate') {
          await stx.editCell(0, 'Effective Date', toUiDate(NEW_DATE));
          states.push(await stx.isSaveEnabled());
        }
        result[column] = states;
      }
      await attachNote('Save enabled (before, after edit[, after later date])', JSON.stringify(result, null, 2));
      await verify('Notes and Effective Date enable Save; Flat Rate only together with a later date', async () => {
        expect(result).toEqual({ Notes: [false, true], 'Effective Date': [false, true], 'Flat Rate': [false, false, true] });
      });
    });

    test('TC-TAX-STX-048: Searching with unsaved edits asks before losing them', { tag: '@C107560' }, async () => {
      await about('With an edited row, clicking Search opens the unsaved-changes warning instead of searching.');
      await openEditFixture();
      await stx.editCell(0, 'Notes', 'pending');
      const sent = await stx.recordSearches();
      await stx.clickSearch();
      await verify('The warning is shown and no search went out', async () => {
        await expect(stx.unsavedDialog()).toBeVisible();
        await expect(stx.unsavedDialog()).toContainText(STX_MESSAGES.unsavedChangesTitle);
        expect(sent).toEqual([]);
      });
    });

    test('TC-TAX-STX-049: Choosing Stay keeps the edits and does not search', { tag: '@C107561' }, async () => {
      await about('Cancelling the warning (Stay) leaves the edited value in place, Save on, and sends no search.');
      await openEditFixture();
      await stx.editCell(0, 'Notes', 'keep me');
      const sent = await stx.recordSearches();
      await stx.clickSearch();
      await stx.answerUnsavedDialog('Stay');
      await verify('Edit kept, Save enabled, no search sent', async () => {
        expect(await stx.readCell(0, 'Notes')).toBe('keep me');
        expect(await stx.isSaveEnabled()).toBe(true);
        expect(sent).toEqual([]);
      });
    });

    test('TC-TAX-STX-050: Choosing Discard drops the edits and runs the search', { tag: '@C107562' }, async () => {
      await about('Continuing past the warning (Discard) runs the search; the grid shows the stored values again and Save is off.');
      const records = await openEditFixture();
      await stx.editCell(0, 'Notes', 'throw away');
      const searched = stx.clickSearchAndWait();
      await stx.answerUnsavedDialog('Discard');
      await searched;
      await verify('Stored note back, Save disabled', async () => {
        expect(await stx.readCell(0, 'Notes')).toBe(records[0]!.notes);
        expect(await stx.isSaveEnabled()).toBe(false);
      });
    });

    for (const [id, action, run] of [
      ['051', 'Reset', (p: StateTaxPage) => p.resetButton().click()],
      ['052', 'switching to State Tax History', (p: StateTaxPage) => p.tab('history').click()],
    ] as const) {
      test(`TC-TAX-STX-${id}: ${action[0]!.toUpperCase()}${action.slice(1)} with unsaved edits asks before losing them`, { tag: LOOP_CASE_TAGS[`TC-TAX-STX-${id}`] }, async () => {
        await about(`With an edited row, ${action} opens the unsaved-changes warning; Stay keeps the user on the edited grid.`);
        await openEditFixture();
        await stx.editCell(0, 'Notes', 'pending');
        await run(stx);
        await verify('The warning is shown', async () => {
          await expect(stx.unsavedDialog()).toBeVisible();
        });
        await stx.answerUnsavedDialog('Stay');
        await verify('Still on Basic Information with the edit', async () => {
          expect(await stx.activeTab()).toBe(STX_TABS.basic);
          expect(await stx.readCell(0, 'Notes')).toBe('pending');
        });
      });
    }
  });

  // ================================================================ G. Save (held at the network)

  test.describe('G. Save requests and chronology', () => {
    test('TC-TAX-STX-053: Save sends only the edited rows with their edited values', { tag: '@C107565' }, async () => {
      // A rate change is only savable with a later Effective Date (see 047), so row 1 gets one too.
      await about('NM-2374: editing two of the rows and saving sends exactly those two records with the new Flat Rate and note. The write is held at the network.');
      const records = await openEditFixture();
      const captured = await stx.interceptSave('abort');
      await stx.editCell(0, 'Flat Rate', '0.05');
      await stx.editCell(0, 'Effective Date', toUiDate(NEW_DATE));
      await stx.editCell(2, 'Notes', 'automation note');
      await stx.clickSave();
      await expect.poll(() => captured.length, { timeout: 15_000 }).toBe(1);
      const sent = captured[0]!.records;
      await attachNote('Save request body', captured[0]!.body);
      await verify('Two records: row 1 with Flat Rate 0.05, row 3 with the note', async () => {
        expect(sent.map(key)).toEqual([key(records[0]!), key(records[2]!)]);
        expect(sent[0]!.flatRate).toBe(0.05);
        expect(sent[1]!.notes).toBe('automation note');
      });
    });

    test('TC-TAX-STX-054: Save sends the Effective Date the user typed', { tag: '@C107566' }, async ({ browser, config }) => inUtc(browser, config, async () => {
      await about(`A row given the new Effective Date ${toUiDate(NEW_DATE)} is saved with exactly ${NEW_DATE}. The write is held at the network.`);
      await openEditFixture();
      const captured = await stx.interceptSave('abort');
      await stx.editCell(0, 'Effective Date', toUiDate(NEW_DATE));
      await stx.clickSave();
      await expect.poll(() => captured.length, { timeout: 15_000 }).toBe(1);
      await attachNote('Save request body', captured[0]!.body);
      await verify('The record carries the typed date', async () => {
        expect(captured[0]!.records.map((r) => wireDate(r.effectiveDate))).toEqual([NEW_DATE]);
      });
    }));

    test('TC-TAX-STX-055: Editing only a note saves the row with its stored Effective Date', { tag: '@C107567' }, async () => {
      // Accepted in-place note edit (BUG-TAX-STX-003 dropped 2026-11-05): a note does not create a later version.
      await about('A note typed into a row is saved as that row with its stored Effective Date unchanged. The write is held at the network.');
      const records = await openEditFixture();
      const captured = await stx.interceptSave('abort');
      await stx.editCell(0, 'Notes', 'note only');
      await stx.clickSave();
      await expect.poll(() => captured.length, { timeout: 15_000 }).toBe(1);
      await attachNote('Save request body', captured[0]!.body);
      await verify('One record, the stored date, the new note', async () => {
        expect(captured[0]!.records.map((r) => [key(r), wireDate(r.effectiveDate), r.notes])).toEqual([[key(records[0]!), wireDate(records[0]!.effectiveDate), 'note only']]);
      });
    });

    for (const [id, label, offset] of [['056', 'earlier than', -1], ['057', 'equal to', 0]] as const) {
      test(`TC-TAX-STX-${id}: An Effective Date ${label} the latest stored date is never saved`, { tag: LOOP_CASE_TAGS[`TC-TAX-STX-${id}`] }, async () => {
        await about(`NM-2300 chronology: a new version dated ${label} the latest stored version of ${STX_VERSIONED.taxType} is refused before anything is sent. The write is held at the network.`);
        await stx.open(STX_OFFICE);
        const current = only((await stx.search(STX_VERSIONED)).records, 'current');
        const latest = wireDate(current.effectiveDate)!;
        const captured = await stx.interceptSave('abort');
        await stx.editCell(0, 'Effective Date', toUiDate(addDays(latest, offset)));
        await stx.editCell(0, 'Notes', 'chronology');
        if (await stx.isSaveEnabled()) await stx.clickSave();
        await stx.page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
        await expectNoVersionAtOrBefore(captured, latest);
      });
    }

    test('TC-TAX-STX-058: A network failure on Save shows an error, never success, and keeps the edits', { tag: '@C107570' }, async () => {
      await about('If the save cannot reach the server the user sees an error, no success message, and the edit is still there to retry.');
      await openEditFixture();
      await stx.interceptSave('abort');
      await stx.editCell(0, 'Notes', 'retry me');
      await stx.clickSave();
      const error = await stx.waitForToast('error');
      await verify('Error shown, no success, edit kept', async () => {
        expect(error).toContain(STX_MESSAGES.saveFailed);
        expect(await stx.isSuccessToastVisible()).toBe(false);
        expect(await stx.readCell(0, 'Notes')).toBe('retry me');
      });
    });

    test('TC-TAX-STX-059: A server error on Save leaves the stored values unchanged', { tag: '@C107571' }, async () => {
      await about('If the server answers 500, an error is shown and a fresh search still returns the original values.');
      const records = await openEditFixture();
      await stx.interceptSave('server-error');
      await stx.editCell(0, 'Flat Rate', '0.05');
      await stx.editCell(0, 'Effective Date', toUiDate(NEW_DATE));
      await stx.clickSave();
      await stx.waitForError();
      await stx.clearInterceptions();
      const again = await openEditFixture();
      await verify('The record reads as it did before the failed save', async () => {
        expect(again[0]).toEqual(records[0]);
      });
    });

    test('TC-TAX-STX-060: A second Save click while the first is in flight sends nothing', { tag: '@C107572' }, async () => {
      await about('Clicking Save twice quickly sends one request — the button is out of action while the first is running.');
      await openEditFixture();
      const captured = await stx.interceptSave('delay-then-abort');
      await stx.editCell(0, 'Notes', 'once');
      await stx.clickSave();
      const disabledInFlight = !(await stx.isSaveEnabled());
      await stx.saveButton().click({ force: true, timeout: 2_000 }).catch(() => undefined);
      await stx.waitForError();
      await verify('Disabled during flight; exactly one request', async () => {
        expect(disabledInFlight).toBe(true);
        expect(captured).toHaveLength(1);
      });
    });

    test('TC-TAX-STX-061: A successful save confirms and turns Save off', { tag: '@C107573' }, async () => {
      await about('When the save succeeds (answered at the network) the user gets a success message and Save is disabled again.');
      await openEditFixture();
      await stx.interceptSave('success');
      await stx.editCell(0, 'Notes', 'saved');
      await stx.clickSave();
      const message = await stx.waitForToast('success');
      await attachNote('Success message', message);
      await verify('Success shown; Save disabled', async () => {
        await expect(stx.saveButton()).toBeDisabled();
      });
    });
  });

  // ================================================================ H. State Tax History

  test.describe('H. State Tax History', () => {
    test.beforeEach(async () => {
      await stx.open(STX_OFFICE);
      await stx.switchTab('history');
    });

    test('TC-TAX-STX-062: History offers its criteria with a today–today range, a prompt and no Save', { tag: '@C107574' }, async () => {
      await about('The History tab carries State, Tax Type, the rate filter and a Date Range defaulting to today – today; it asks for criteria and has no Save.');
      await verify('Criteria and defaults; prompt; no Save', async () => {
        expect(await stx.getCriteria()).toEqual({ state: 'All', taxType: 'All', rate: 'All' });
        expect(await stx.getDateRange()).toEqual({ start: TODAY, end: TODAY });
        expect(await stx.mainText()).toContain(STX_MESSAGES.promptHistory);
        await expect(stx.saveButton()).toHaveCount(0);
      });
    });

    test('TC-TAX-STX-063: History grid shows the documented columns and every cell is read-only', { tag: '@C107575' }, async () => {
      await about('NM-2376: the History grid has the nine columns in order and no cell offers an editor.');
      await stx.searchHistory(STX_HISTORY_RANGE, { state: STX_FLAT_STATE });
      await verify('Columns in order; no editors in the grid', async () => {
        expect(await stx.getHeaderLabels()).toEqual([...STX_COLUMNS]);
        await expect(stx.grid().locator('tbody').locator('input, textarea, select, [contenteditable="true"]')).toHaveCount(0);
      });
    });

    test('TC-TAX-STX-064: A range search returns only versions effective inside the range', { tag: '@C107576' }, async () => {
      await about(`NM-2412: searching ${STX_FLAT_STATE} from ${STX_HISTORY_RANGE.start} to ${STX_HISTORY_RANGE.end} returns versions of ${STX_FLAT_STATE} effective inside it, and sends the range unshifted.`);
      const { payload, records } = await stx.searchHistory(STX_HISTORY_RANGE, { state: STX_FLAT_STATE });
      await attachNote('Versions', records.map((r) => `${key(r)}: ${wireDate(r.effectiveDate)}`).join('\n'));
      await verify('Range sent as chosen; every version inside it, for the chosen state', async () => {
        expect([payload.effectiveDateRangeStart, payload.effectiveDateRangeEnd]).toEqual([STX_HISTORY_RANGE.start, STX_HISTORY_RANGE.end]);
        expect(records.length).toBeGreaterThan(0);
        expect(records.filter((r) => r.stateName !== STX_FLAT_STATE || wireDate(r.effectiveDate)! < STX_HISTORY_RANGE.start || wireDate(r.effectiveDate)! > STX_HISTORY_RANGE.end).map(key)).toEqual([]);
      });
    });

    test('TC-TAX-STX-065: Versions effective on either end of the range are included', { tag: '@C107577' }, async () => {
      await about('Both ends of the range are inclusive: a range from the earliest to the latest version date of the wide search returns the versions on both of those days.');
      const wide = (await stx.searchHistory(STX_HISTORY_RANGE, { state: STX_FLAT_STATE })).records;
      const days = wide.map((r) => wireDate(r.effectiveDate)!).sort();
      const [first, last] = [days[0]!, days[days.length - 1]!];
      // Reset first: from today – today the calendar moves the start back, then the end — never the reverse.
      await stx.reset();
      const { records } = await stx.searchHistory({ start: first, end: last }, { state: STX_FLAT_STATE });
      await attachNote('Range', `${first} – ${last}`);
      await verify(`Versions on ${first} and on ${last} are returned`, async () => {
        expect(first < last).toBe(true);
        expect(records.map(key).sort()).toEqual(wide.filter((r) => [first, last].includes(wireDate(r.effectiveDate)!) || (wireDate(r.effectiveDate)! > first && wireDate(r.effectiveDate)! < last)).map(key).sort());
        expect(records.some((r) => wireDate(r.effectiveDate) === first) && records.some((r) => wireDate(r.effectiveDate) === last)).toBe(true);
      });
    });

    test('TC-TAX-STX-066: History lists the most recently modified records first by default', { tag: '@C107578' }, async () => {
      await about('NM-4009 regression: without choosing a sort, the History rows are ordered by Modified On, newest first.');
      const { records } = await stx.searchHistory(STX_HISTORY_RANGE);
      const stamps = records.map((r) => r.updatedAt);
      await attachNote('Modified On order', stamps.join('\n'));
      await verify('Modified On never increases down the list', async () => {
        expect(records.length).toBeGreaterThan(1);
        expect(stamps.every((s, i) => i === 0 || stamps[i - 1]! >= s)).toBe(true);
      });
    });

    test('TC-TAX-STX-067: Re-applying or changing the range gives consistent results', { tag: '@C107579' }, async () => {
      await about('NM-4059 regression: the same range searched twice returns the same records, and returning to it after another range does too.');
      const first = (await stx.searchHistory(STX_HISTORY_RANGE)).records.map(key);
      const repeat = (await stx.clickSearchAndWait()).records.map(key);
      await stx.searchHistory({ start: STX_HISTORY_RANGE.start, end: addDays(STX_HISTORY_RANGE.start, 45) });
      const back = (await stx.searchHistory(STX_HISTORY_RANGE)).records.map(key);
      await verify('All three answers for the range are identical', async () => {
        expect(first.length).toBeGreaterThan(0);
        expect(repeat).toEqual(first);
        expect(back).toEqual(first);
      });
    });

    test('TC-TAX-STX-068: State, Tax Type and rate filters narrow the History results', { tag: '@C107580' }, async () => {
      await about('Each History filter restricts the versions returned for the range to the chosen state, tax type or rate kind.');
      const byState = (await stx.searchHistory(STX_HISTORY_RANGE, { state: STX_PCT_RECORD.state })).records;
      const byType = (await stx.searchHistory(STX_HISTORY_RANGE, { state: 'All', taxType: STX_PCT_RECORD.taxType })).records;
      const byRate = (await stx.searchHistory(STX_HISTORY_RANGE, { taxType: 'All', rate: 'Flat Rate' })).records;
      await verify('Each answer holds only matching versions', async () => {
        for (const set of [byState, byType, byRate]) expect(set.length).toBeGreaterThan(0);
        expect([...new Set(byState.map((r) => r.stateName))]).toEqual([STX_PCT_RECORD.state]);
        expect([...new Set(byType.map((r) => r.taxTypeName))]).toEqual([STX_PCT_RECORD.taxType]);
        expect(byRate.filter((r) => !((r.flatRate ?? 0) > 0)).map(key)).toEqual([]);
      });
    });

    test('TC-TAX-STX-069: An empty History result shows a clean empty state', { tag: '@C107581' }, async () => {
      await about(`Today's range for ${STX_EDIT_STATE} holds no version: the grid is empty, the counter reads 0 and the empty message is shown.`);
      const { records } = await stx.searchHistory({ start: TODAY, end: TODAY }, { state: STX_EDIT_STATE });
      await verify('No rows, counter 0, empty message', async () => {
        expect(records).toEqual([]);
        expect(await stx.getRecordsFoundCount()).toBe(0);
        expect(await stx.mainText()).toContain(STX_MESSAGES.emptyHistory);
      });
    });

    test('TC-TAX-STX-070: A failed History search shows an empty result, and the next search works', { tag: '@C107582' }, async () => {
      // Accepted (BUG-TAX-STX-009 dropped 2026-11-05): History shows no error on a transport failure, only an empty grid.
      await about('When the History search answers 500 the tab shows an empty result; once the service is back the same search returns the versions.');
      await stx.setDateRange(STX_HISTORY_RANGE.start, STX_HISTORY_RANGE.end);
      await stx.mockSearch({ kind: 'failure' });
      await stx.clickSearch();
      await expect.poll(() => stx.mainText(), { timeout: 30_000 }).toContain(STX_MESSAGES.emptyHistory);
      await stx.clearInterceptions();
      const { records } = await stx.clickSearchAndWait();
      await verify('Empty result on failure; retry returned rows', async () => {
        expect(records.length).toBeGreaterThan(0);
        expect((await stx.readGrid()).length).toBeGreaterThan(0);
      });
    });

    test('TC-TAX-STX-071: Every History cell shows the value of the record behind it', { tag: '@C107583' }, async () => {
      await about('Each History row (rates to 6 decimals, notes, Modified By, Modified On in business time) equals its record, row for row.');
      const { records } = await stx.searchHistory(STX_HISTORY_RANGE, { state: STX_FLAT_STATE });
      const rows = await stx.readGrid();
      await verify('Row i equals record i', async () => {
        expect(rows.map(shown)).toEqual(records.map((r) => expectedCells(r, '-')));
      });
    });

    test('TC-TAX-STX-072: History Effective Date shows the calendar date the version is stored with', { tag: '@C107584' }, async ({ browser, config }) => inUtc(browser, config, async () => {
      await stx.open(STX_OFFICE);
      await stx.switchTab('history');
      await about('A version stored as effective 2018-12-01 shows 12/01/2018 on the History tab.');
      const { records } = await stx.searchHistory(STX_HISTORY_RANGE, { state: STX_FLAT_STATE });
      const rows = await stx.readGrid();
      await verify('Row i shows record i\'s stored date', async () => {
        expect(rows.map((r) => r['Effective Date'])).toEqual(records.map((r) => toUiDate(wireDate(r.effectiveDate)!)));
      });
    }));

    test('TC-TAX-STX-073: Rows per page and Next page request the right page', { tag: '@C107585' }, async () => {
      await about('Choosing 10 rows per page asks for 10 rows with the same total; Next asks for page 2 and shows other rows.');
      const all = await stx.searchHistory(STX_HISTORY_RANGE);
      test.skip((all.totalCount ?? 0) <= 10, `Needs more than 10 versions in ${STX_HISTORY_RANGE.start}..${STX_HISTORY_RANGE.end}`);
      const first = await stx.setPageSize(10);
      const second = await stx.nextPage();
      await verify('pageSize 10, same total, page 2 holds different rows', async () => {
        expect(first.payload.pageSize).toBe(10);
        expect(first.records).toHaveLength(10);
        expect(first.totalCount).toBe(all.totalCount);
        expect(second.payload.page).toBe(2);
        expect(second.records.length).toBeGreaterThan(0);
        expect(JSON.stringify(second.records)).not.toBe(JSON.stringify(first.records));
      });
    });

    test('TC-TAX-STX-074: Reset on History restores the defaults and clears the grid', { tag: '@C107586' }, async () => {
      await about('After a filtered History search, Reset puts the filters back to All, the range back to today – today and empties the grid.');
      await stx.searchHistory(STX_HISTORY_RANGE, { state: STX_FLAT_STATE, rate: 'Flat Rate' });
      await stx.reset();
      await verify('Defaults restored; no rows', async () => {
        expect(await stx.getCriteria()).toEqual({ state: 'All', taxType: 'All', rate: 'All' });
        expect(await stx.getDateRange()).toEqual({ start: TODAY, end: TODAY });
        expect(await stx.readGrid()).toEqual([]);
      });
    });
  });

  // ================================================================ I. Session, accessibility and layout

  test.describe('I. Session, accessibility and layout', () => {
    test('TC-TAX-STX-075: Without a session the page sends the user to sign in', { tag: '@C107587' }, async ({ browser, config }) => {
      await about('A missing or expired session never shows tax data; the user is sent to sign in and brought back afterwards.');
      const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
      try {
        const page = await ctx.newPage();
        await page.goto(`${config.base_url}${STX_PATH(STX_OFFICE)}`, { waitUntil: 'domcontentloaded' });
        await verify('Redirected to sign-in with this page as the callback; no grid', async () => {
          await page.waitForURL((u) => /\/auth\/sign-in$/.test(u.pathname), { timeout: 60_000 });
          expect(new URL(page.url()).searchParams.get('callbackUrl')).toBe(`/${STX_PATH(STX_OFFICE)}`);
          await expect(page.locator('main table')).toHaveCount(0);
        });
      } finally {
        await ctx.close();
      }
    });

    test('TC-TAX-STX-076: Search controls and grid editors have accessible names', { tag: '@C107588' }, async () => {
      // The State / Tax Type / rate triggers are the shared select component accepted as designed
      // (BUG-TAX-IST-003 dropped 2026-10-26), so they are not asserted.
      await about('Screen-reader users get a name for the Effective Date, the buttons and every editor in a grid row.');
      await openEditFixture();
      const editor = async (c: StxColumn) => (await stx.cell(0, c)).locator('input').first();
      const names = await stx.accessibleNames({
        'Effective Date': stx.searchDateField(),
        Reset: stx.resetButton(),
        Search: stx.searchButton(),
        Save: stx.saveButton(),
        'Row Flat Rate': await editor('Flat Rate'),
        'Row Taxable Percentage': await editor('Taxable Percentage'),
        'Row Effective Date': await editor('Effective Date'),
        'Row Notes': await editor('Notes'),
      });
      await attachNote('Accessible names', JSON.stringify(names, null, 2));
      await verify('No control is unnamed', async () => {
        expect(Object.entries(names).filter(([, n]) => !n).map(([k]) => k)).toEqual([]);
      });
    });

    test('TC-TAX-STX-077: Tab order through the search panel follows the visual order', { tag: '@C107589' }, async () => {
      await about('Tabbing from State visits Tax Type, the rate filter, Effective Date, Reset and Search in that order.');
      await stx.open(STX_OFFICE);
      const targets = [['Tax Type', stx.taxTypeField()], ['Rate', stx.rateField()], ['Effective Date', stx.searchDateField()], ['Reset', stx.resetButton()], ['Search', stx.searchButton()]] as const;
      await stx.stateField().focus();
      const order: string[] = [];
      for (let i = 0; i < 15 && order.length < targets.length; i++) {
        await stx.page.keyboard.press('Tab');
        for (const [label, loc] of targets) {
          if (!order.includes(label) && (await loc.evaluate((el) => el === document.activeElement || el.contains(document.activeElement)))) order.push(label);
        }
      }
      await verify('Focus visits the controls in visual order', async () => {
        expect(order).toEqual(targets.map(([l]) => l));
      });
    });

    test('TC-TAX-STX-078: Automated WCAG 2.1 AA scan finds no serious or critical violations', { tag: '@C107590' }, async () => {
      // Excluded as accepted shared components: the select triggers' missing label (BUG-TAX-IST-003) and the
      // tab strip's aria-controls to an unrendered panel (BUG-TAX-ST-007). Everything else is scanned.
      await about('An axe-core scan of both tabs with results finds no serious or critical violations outside the select triggers and the tab strip.');
      type Violation = { id: string; impact: string | null; nodes: { target: unknown }[] };
      type Axe = { withTags(t: string[]): Axe; exclude(s: string): Axe; analyze(): Promise<{ violations: Violation[] }> };
      const AxeBuilder = createRequire(__filename)('@axe-core/playwright').default as new (o: { page: unknown }) => Axe;
      const scan = async (): Promise<Violation[]> =>
        (await new AxeBuilder({ page: stx.page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).exclude('button[data-slot="select-trigger"]').exclude('[role="tablist"]').analyze())
          .violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      await openEditFixture();
      const basic = await phase('Scan Basic Information', scan);
      await stx.switchTab('history');
      await stx.searchHistory(STX_HISTORY_RANGE);
      const history = await phase('Scan State Tax History', scan);
      const summary = [...basic, ...history].map((v) => ({ id: v.id, impact: v.impact, targets: v.nodes.slice(0, 5).map((n) => n.target) }));
      await attachNote('axe violations', JSON.stringify(summary, null, 2));
      await verify('No serious or critical violations', async () => {
        expect(summary.map((v) => v.id)).toEqual([]);
      });
    });

    for (const [i, vp] of STX_VIEWPORTS.entries()) {
      test(`TC-TAX-STX-${String(79 + i).padStart(3, '0')}: Page stays usable at ${vp.label}`, { tag: LOOP_CASE_TAGS[`TC-TAX-STX-${String(79 + i).padStart(3, '0')}`] }, async () => {
        await about(`At ${vp.label} the search panel, Save and the results stay reachable and the page does not scroll sideways.`);
        const original = stx.page.viewportSize();
        try {
          await stx.page.setViewportSize({ width: vp.width, height: vp.height });
          await openEditFixture();
          const overflows = await stx.pageOverflows();
          await verify('Search, Save and the grid are reachable; no page-level horizontal scroll', async () => {
            for (const loc of [stx.searchButton(), stx.saveButton(), stx.grid()]) {
              await loc.scrollIntoViewIfNeeded();
              await expect(loc).toBeInViewport();
            }
            expect(overflows).toBe(false);
          });
        } finally {
          if (original) await stx.page.setViewportSize(original);
        }
      });
    }

    test('TC-TAX-STX-081: No untranslated i18n key is visible on either tab', { tag: '@C107593' }, async () => {
      await about('Every label, header and message is real text, never a raw key like "taxes.stateTax.…".');
      await openEditFixture();
      const basic = await stx.findRawI18nKeys();
      await stx.switchTab('history');
      await stx.searchHistory(STX_HISTORY_RANGE);
      const history = await stx.findRawI18nKeys();
      await verify('No raw keys on either tab', async () => {
        expect([...basic, ...history]).toEqual([]);
      });
    });
  });
});
