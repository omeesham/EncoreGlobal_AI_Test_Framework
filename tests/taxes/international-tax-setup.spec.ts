import { createRequire } from 'module';
import { test, expect } from '../../src/fixtures/pages.fixture';
import { about, attachNote, phase, verify } from '../../src/fixtures/report-steps';
import {
  InternationalTaxSetupPage,
  TaxRow,
  CapturedRequest,
} from '../../src/pages/taxes/international-tax-setup.page';
import {
  IST_OFFICE,
  IST_PAGE_TITLE,
  IST_COLUMNS,
  IST_MEXICO,
  IST_CANADA,
  IST_MESSAGES,
  IST_UTC_PLUS_TIMEZONE,
  IST_FAR_FUTURE_YEARS,
  IST_HOSTILE_RATE_INPUTS,
  IST_INVALID_DATES,
  IST_LOAD_BUDGET_MS,
  IST_VIEWPORTS,
  IST_PATH,
  todayIso,
  addDays,
  addYears,
  wireDate,
} from '../../src/data/taxes/international-tax-setup';
import { STATE_PATH } from '../../src/utils/auth-storage';

// Tax → International Tax Setup (NM-4025 / feature epic NM-889). Requirements: NM-4025 test automation
// requirements document; behaviour from NM-2393/2395 (UI), NM-2401/2402 (API), NM-4008, NM-4005.
//
// Write policy — nothing in this spec writes. The configuration history is insert-only (a Save can
// never be undone), so every Save case holds the request at the network (interceptSave) and asserts the
// payload; nothing reaches the database.
//   * @needs-confirmation marks a case whose expected result is a reasonable reading of an open
//     NM-4025 §14.2 question, or behaviour characterised live. Exclude with --grep-invert @needs-confirmation.
//   * test.fail('BUG-TAX-IST-…') marks a case that asserts the documented behaviour against a known defect
//     (reports/bugs/). It passes while the bug exists and turns red when it is fixed — then drop the marker.
//   * Cases needing live writes, extra role accounts or a future-dated version were removed on request
//     (2026-10-23); see the test plan for the list.

// ---------------------------------------------------------------- TestRail mapping

// TestRail case tags for tests whose titles are built in a loop. Literal titles carry their tag
// inline; both come from config/testrail/case-map.json.
const LOOP_CASE_TAGS: Record<string, string> = {
  'TC-TAX-IST-067': '@C107435',
  'TC-TAX-IST-068': '@C107436',
};

// ---------------------------------------------------------------- spec-local helpers

const TODAY = todayIso();
const FAR_FUTURE = addYears(TODAY, IST_FAR_FUTURE_YEARS);
/** Beyond FAR_FUTURE, so it is later than every version a far-future search can show. */
const SAFE_NEW_DATE = addYears(TODAY, IST_FAR_FUTURE_YEARS + 1);

/** The facts a row shows, without its selection state. */
function facts(r: TaxRow): { rate: string; date: string | null; commission: boolean; pending: boolean } {
  return { rate: r.rateText, date: r.effectiveDate, commission: r.commissionTaxable, pending: r.pending };
}

function byType(rows: TaxRow[]): Map<string, TaxRow> {
  return new Map(rows.map((r) => [r.taxType, r]));
}

function sortedFacts(rows: TaxRow[]): string[] {
  return rows.map((r) => JSON.stringify([r.taxType, r.province, facts(r)])).sort();
}

/** Most recent version at or before `asOf` — the boundary the as-of cases move around. */
function boundaryRow(rows: TaxRow[], asOf: string): TaxRow {
  const dated = rows.filter((r) => r.effectiveDate !== null && r.effectiveDate <= asOf);
  const row = dated.sort((a, b) => (b.effectiveDate! > a.effectiveDate! ? 1 : -1))[0];
  if (!row) throw new Error('No dated row in the search result — the fixture combination returned nothing');
  return row;
}

/** A Rate value no row currently shows, so a staged change is always visible. */
function distinctRate(rows: TaxRow[]): string {
  const taken = new Set(rows.map((r) => r.rate));
  const rate = ['7.25', '8.5', '9.75', '11.125'].find((x) => !taken.has(Number(x)));
  return rate ?? '12.5';
}

function threeRows(rows: TaxRow[]): [TaxRow, TaxRow, TaxRow] {
  if (rows.length < 3) throw new Error(`Need at least 3 rows in the fixture search, found ${rows.length}`);
  return [rows[0]!, rows[1]!, rows[2]!];
}

function isRealDate(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

/** Value of the first key matching `re` anywhere in a parsed JSON payload. */
function deepFind(value: unknown, re: RegExp): unknown {
  if (Array.isArray(value)) {
    for (const v of value) {
      const hit = deepFind(v, re);
      if (hit !== undefined) return hit;
    }
  } else if (typeof value === 'object' && value !== null) {
    for (const [k, v] of Object.entries(value)) {
      if (re.test(k)) return v;
      const hit = deepFind(v, re);
      if (hit !== undefined) return hit;
    }
  }
  return undefined;
}

function isEmptySelection(text: string): boolean {
  return text === '' || /^select\b/i.test(text);
}

/** A blocked search: nothing was sent, and the form says why (invalid field, message or disabled Search). */
async function expectSearchBlocked(ist: InternationalTaxSetupPage, sent: CapturedRequest[], sentBefore: number): Promise<void> {
  await ist.page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
  const state = await ist.readSearchValidation();
  await attachNote('Search validation state', JSON.stringify(state, null, 2));
  expect(sent.length, 'a search request was sent despite the missing input').toBe(sentBefore);
  expect(state.invalidFields > 0 || state.messages.length > 0 || !state.searchEnabled, 'no validation feedback shown').toBe(true);
}

test.describe('International Tax Setup @taxes', () => {
  let ist: InternationalTaxSetupPage;

  test.beforeEach(async ({ authenticatedSession, config }) => {
    // Several searches at up to 90 s each plus the actions; cases that do more raise it again.
    test.setTimeout(240_000);
    ist = new InternationalTaxSetupPage(authenticatedSession.page, config);
  });

  test.afterEach(async () => {
    // A fixture that fails before beforeEach (e.g. a slow login) leaves no page object — nothing to clean.
    if (!ist) return;
    // Interceptions and staged edits must never leak into the next case on the shared page.
    await ist.clearInterceptions();
    await ist.leaveDiscardingChanges();
  });

  // ================================================================ A. Navigation and page layout

  test.describe('A. Navigation and page layout', () => {
    test('TC-TAX-IST-001: Tax menu entry opens the International Tax Setup page', { tag: '@C107369' }, async () => {
      await about('A user opens Tax in the sidebar and picks International Tax Setup; the page opens with its title.');
      await ist.openFromTaxMenu(IST_OFFICE);
      await attachNote('Route reached from the menu', ist.page.url());
      await verify('The heading reads International Tax Setup on the tax setup route', async () => {
        expect(await ist.getHeading()).toBe(IST_PAGE_TITLE);
        expect(new URL(ist.page.url()).pathname).toMatch(/international-tax-setup/);
      });
    });

    test('TC-TAX-IST-002: Direct route shows the search criteria, update section and results grid', { tag: '@C107370' }, async () => {
      await about('Opening the page link directly and searching shows the three working areas: search criteria, the update strip and the results grid.');
      await ist.open(IST_OFFICE);
      await ist.search(IST_MEXICO);
      await verify('Heading, Search Criteria panel, update section and grid are visible', async () => {
        expect(await ist.getHeading()).toBe(IST_PAGE_TITLE);
        await expect(ist.searchPanel()).toBeVisible();
        await expect(ist.updatePanel()).toBeVisible();
        await expect(ist.page.locator('main').locator('table, [role="grid"], [role="table"]').first()).toBeVisible();
      });
    });

    test('TC-TAX-IST-003: Search Criteria panel offers Country, Tax Group, Province, Effective Date, Reset and Search', { tag: '@C107371' }, async () => {
      await about('The search panel carries the four criteria and its two buttons.');
      await ist.open(IST_OFFICE);
      await verify('All six search controls are visible inside the search panel', async () => {
        await expect(ist.countryField()).toBeVisible();
        await expect(ist.taxGroupField()).toBeVisible();
        await expect(ist.provinceField()).toBeVisible();
        await expect(ist.searchDateField()).toBeVisible();
        await expect(ist.resetButton()).toBeVisible();
        await expect(ist.searchButton()).toBeVisible();
      });
    });

    test('TC-TAX-IST-004: Update section offers Rate with a % suffix, its own Effective Date, Is Commission Taxable? and Apply', { tag: '@C107372' }, async () => {
      await about('The update strip above the grid has the Rate box with "%", a separate Effective Date, the commission checkbox and Apply.');
      await ist.open(IST_OFFICE);
      await verify('Rate, %, Effective Date, Is Commission Taxable? and Apply are in the update section', async () => {
        await expect(ist.rateField()).toBeVisible();
        await expect(ist.updatePanel().getByText('%', { exact: true })).toBeVisible();
        await expect(ist.updateDateField()).toBeVisible();
        await expect(ist.commissionField()).toBeVisible();
        await expect(ist.applyButton()).toBeVisible();
      });
      await verify('The update Effective Date is a different control from the search Effective Date', async () => {
        const same = await ist.updateDateField().evaluate((el, other) => el === other, await ist.searchDateField().elementHandle());
        expect(same).toBe(false);
      });
    });

    test('TC-TAX-IST-005: Results show Save, the records-found label and the documented columns in order', { tag: '@C107373' }, async () => {
      await about('After a search the results area shows "<n> records found", a Save button and the columns Tax Type, Rate, Province, Effective Date, Is Commission Taxable and Apply.');
      await ist.open(IST_OFFICE);
      await ist.search(IST_MEXICO);
      const headers = await ist.getHeaderLabels();
      await verify('Columns in documented order, Save and the counter present', async () => {
        expect(headers).toEqual([...IST_COLUMNS]);
        expect(await ist.hasSaveButton()).toBe(true);
        expect(await ist.getRecordsFoundCount()).not.toBeNull();
      });
    });

    test('TC-TAX-IST-006: Search Effective Date defaults to business today', { tag: '@C107374' }, async () => {
      await about(`On a fresh load the search Effective Date already holds today's date in the business timezone (${TODAY}).`);
      await ist.open(IST_OFFICE);
      await verify('The search date equals business today', async () => {
        expect(await ist.getSearchEffectiveDate()).toBe(TODAY);
      });
    });

    test('TC-TAX-IST-007: Loading feedback shows while a search is pending and clears when results arrive', { tag: ['@C107375', '@needs-confirmation'] }, async () => {
      await about('While a search answer is slow the page shows that it is working, then the results replace the feedback.');
      await ist.open(IST_OFFICE);
      await ist.selectCountry(IST_MEXICO.country);
      await ist.selectTaxGroup(IST_MEXICO.taxGroup);
      await ist.selectProvince(IST_MEXICO.province);
      await ist.mockSearch({ kind: 'delay', ms: 6_000 });
      await ist.clickSearch();
      await verify('A loading indicator (or a disabled Search) is shown while the answer is held', async () => {
        await expect.poll(async () => (await ist.isLoadingVisible()) || !(await ist.searchButton().isEnabled()), { timeout: 5_000 }).toBe(true);
      });
      await verify('The feedback clears and rows are shown once the answer lands', async () => {
        await expect.poll(() => ist.isLoadingVisible(), { timeout: 60_000 }).toBe(false);
        expect((await ist.readAllRows()).length).toBeGreaterThan(0);
      });
    });

    test('TC-TAX-IST-008: First search result is usable within the load budget', { tag: '@C107376' }, async () => {
      await about(`Opening the page and running the fixture search shows results within ${IST_LOAD_BUDGET_MS / 1000} seconds.`);
      const started = Date.now();
      await ist.open(IST_OFFICE);
      await ist.search(IST_MEXICO);
      const elapsed = Date.now() - started;
      await attachNote('Open + search time (ms)', String(elapsed));
      await verify('Elapsed time is inside the budget', async () => {
        expect(elapsed).toBeLessThan(IST_LOAD_BUDGET_MS);
      });
    });
  });

  // ================================================================ B. Search criteria, dependencies and validation

  test.describe('B. Search criteria, dependencies and validation', () => {
    test('TC-TAX-IST-009: Tax Group and Province are unavailable until a Country is chosen', { tag: '@C107377' }, async () => {
      // Live design (e2e 2026-10-22): Country is pre-selected and offers no blank choice, so a
      // "no Country yet" state never exists — the dependents are only ever shown alongside a Country.
      await about('Country is always chosen — pre-selected on load and with no blank option — so Tax Group and Province are never usable without one.');
      await ist.open(IST_OFFICE);
      const { country } = await ist.getSelectedCriteria();
      const countries = await ist.readCountryOptions();
      await attachNote('Country on load / options', `${country}\n${countries.join('\n')}`);
      await verify('A Country is selected on load and no blank Country can be picked', async () => {
        expect(isEmptySelection(country)).toBe(false);
        expect(countries.filter((c) => isEmptySelection(c))).toEqual([]);
      });
    });

    test('TC-TAX-IST-010: Choosing a Country loads that country\'s Tax Groups and Provinces', { tag: '@C107378' }, async () => {
      await about('Picking Mexico makes Tax Group and Province usable and offers the Mexican options, VAT and Baja California among them.');
      await ist.open(IST_OFFICE);
      const groupsCall = ist.page.waitForRequest((r) => /\/api\/tax\/international\/groups/i.test(r.url()), { timeout: 15_000 }).catch(() => null);
      await ist.selectCountry(IST_MEXICO.country);
      const call = await groupsCall;
      const groups = await ist.readTaxGroupOptions();
      const provinces = await ist.readProvinceOptions();
      await attachNote('Tax Group options', groups.join('\n'));
      await attachNote('Province options', provinces.join('\n'));
      await verify('Dependent dropdowns are enabled and carry the Mexican options', async () => {
        expect(await ist.dependentFieldsEnabled()).toEqual({ taxGroup: true, province: true });
        expect(groups).toContain(IST_MEXICO.taxGroup);
        expect(provinces).toContain(IST_MEXICO.province);
      });
      if (call) {
        await verify('The Tax Group lookup was asked for one country id', async () => {
          expect(new URL(call.url()).searchParams.get('countryId')).toMatch(/^\d+$/);
        });
      }
    });

    test('TC-TAX-IST-011: Changing Country refreshes the Tax Group and Province options', { tag: '@C107379' }, async () => {
      await about('Switching from Mexico to Canada replaces the dependent option lists with Canadian ones.');
      await ist.open(IST_OFFICE);
      await ist.selectCountry(IST_MEXICO.country);
      const mxProvinces = await ist.readProvinceOptions();
      await ist.selectCountry(IST_CANADA.country);
      const caProvinces = await ist.readProvinceOptions();
      const caGroups = await ist.readTaxGroupOptions();
      await attachNote('Canada Tax Groups', caGroups.join('\n'));
      await verify('Canada offers its own provinces — none of the Mexican ones', async () => {
        expect(caProvinces.length).toBeGreaterThan(0);
        expect(caProvinces).not.toContain(IST_MEXICO.province);
        expect(caProvinces).not.toEqual(mxProvinces);
        expect(caGroups.length).toBeGreaterThan(0);
      });
    });

    test('TC-TAX-IST-012: A stale previous-country Province is never submitted after a Country change', { tag: '@C107380' }, async () => {
      await about('After Mexico / VAT / Baja California, switching to Canada must not leave Baja California selected or let it reach a search.');
      await ist.open(IST_OFFICE);
      await ist.selectCountry(IST_MEXICO.country);
      await ist.selectTaxGroup(IST_MEXICO.taxGroup);
      await ist.selectProvince(IST_MEXICO.province);
      // The id is read from the trigger's hidden native <select> mirror while it still lists Mexico.
      const mexicanProvinceId = await ist.page.locator('#international-tax-setup-province + select option')
        .filter({ hasText: new RegExp(`^${IST_MEXICO.province}$`) }).getAttribute('value');
      await ist.selectCountry(IST_CANADA.country);
      const after = await ist.getSelectedCriteria();
      await attachNote('Criteria after the Country change', JSON.stringify(after, null, 2));
      await verify('Province no longer shows the Mexican value', async () => {
        expect(after.province).not.toBe(IST_MEXICO.province);
      });
      // Rows already on screen may be results of an EARLIER search in this tab — they are judged only
      // if a new search actually runs. What matters is that no search carries the stale province.
      const sent = await ist.recordSearches();
      await ist.clickSearchIfEnabled();
      await ist.page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
      await attachNote('Searches sent after the Country change', String(sent.length));
      await verify('No search carries the previous country\'s Province, and any new result has none of its rows', async () => {
        for (const req of sent) {
          const body = JSON.parse(req.body) as unknown;
          expect(String(deepFind(body, /^countrysubdivisionid$/i))).not.toBe(String(mexicanProvinceId));
        }
        if (sent.length > 0) expect((await ist.readAllRows()).filter((r) => r.province === IST_MEXICO.province)).toEqual([]);
      });
    });

    test('TC-TAX-IST-013: Search without Country is blocked', { tag: '@C107381' }, async () => {
      await about('A search can never be sent without a Country: Country cannot be emptied, not even by Reset, and Search stays blocked until the rest of the criteria are complete.');
      await ist.open(IST_OFFICE);
      await ist.search(IST_MEXICO);
      const sent = await ist.recordSearches();
      await ist.resetSearchCriteria();
      const after = await ist.getSelectedCriteria();
      await ist.clickSearchIfEnabled();
      await verify('Country is still set after Reset, and the incomplete form sends nothing', async () => {
        expect(isEmptySelection(after.country)).toBe(false);
        await expectSearchBlocked(ist, sent, 0);
      });
    });

    test('TC-TAX-IST-014: Search without Tax Group is blocked', { tag: '@C107382' }, async () => {
      // Live design: a Country change defaults Tax Group to a valid group of the NEW country, so the
      // field is never empty and never holds a stale group from the previous country.
      await about('A search can never be sent without a Tax Group: changing Country immediately selects a valid Tax Group of the new country, and the group list offers no blank choice.');
      await ist.open(IST_OFFICE);
      await ist.selectCountry(IST_MEXICO.country);
      await ist.selectCountry(IST_CANADA.country);
      const { taxGroup } = await ist.getSelectedCriteria();
      const groups = await ist.readTaxGroupOptions();
      await attachNote('Tax Group after switching to Canada', `${taxGroup}\noptions: ${groups.join(', ')}`);
      await verify('Tax Group holds one of the new country\'s groups, and none is blank', async () => {
        expect(isEmptySelection(taxGroup)).toBe(false);
        expect(groups).toContain(taxGroup);
        expect(groups.filter((g) => isEmptySelection(g))).toEqual([]);
      });
    });

    test('TC-TAX-IST-015: Search without Province is blocked', { tag: '@C107383' }, async () => {
      await about('With a Country and Tax Group but no Province, Search does not run a search and the form shows why.');
      await ist.open(IST_OFFICE);
      await ist.selectCountry(IST_MEXICO.country);
      await ist.selectCountry(IST_CANADA.country);
      const { province } = await ist.getSelectedCriteria();
      test.skip(!isEmptySelection(province), `Province switches to a default ("${province}") on Country change — clear-vs-default is TBC (NM-4025 §6.2)`);
      await ist.selectTaxGroup(IST_CANADA.taxGroup);
      const sent = await ist.recordSearches();
      await ist.clickSearchIfEnabled();
      await verify('No search request and visible validation', () => expectSearchBlocked(ist, sent, 0));
    });

    test('TC-TAX-IST-016: Search without Effective Date is blocked', { tag: '@C107384' }, async () => {
      await about('Clearing the search Effective Date and clicking Search does not run a search; the date is required.');
      await ist.open(IST_OFFICE);
      await ist.selectCountry(IST_MEXICO.country);
      await ist.selectTaxGroup(IST_MEXICO.taxGroup);
      await ist.selectProvince(IST_MEXICO.province);
      await ist.typeSearchEffectiveDate('');
      const sent = await ist.recordSearches();
      await ist.clickSearchIfEnabled();
      await verify('No search request and visible validation', () => expectSearchBlocked(ist, sent, 0));
    });

    test('TC-TAX-IST-017: An impossible date typed into the search Effective Date never reaches a search', { tag: '@C107385' }, async () => {
      await about('Typing 13/45/2026, 02/30/2026 or letters into the search date either blocks the search or is corrected to a real date — an impossible date is never searched.');
      await ist.open(IST_OFFICE);
      await ist.selectCountry(IST_MEXICO.country);
      await ist.selectTaxGroup(IST_MEXICO.taxGroup);
      await ist.selectProvince(IST_MEXICO.province);
      const sent = await ist.recordSearches();
      for (const typed of IST_INVALID_DATES) {
        const before = sent.length;
        await ist.typeSearchEffectiveDate(typed);
        const shown = await ist.getSearchEffectiveDate();
        await ist.clickSearchIfEnabled();
        await ist.page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
        await verify(`"${typed}" is blocked or corrected to a real date`, async () => {
          if (sent.length === before) return;
          const date = wireDate(deepFind(JSON.parse(sent[sent.length - 1]!.body), /^effectivedate$/i));
          expect(isRealDate(date), `searched with ${date}`).toBe(true);
          expect(date).toBe(shown);
        });
      }
    });

    test('TC-TAX-IST-018: Results correspond to the submitted Country, Tax Group and Province', { tag: '@C107386' }, async () => {
      await about('Every row returned for Mexico / VAT / Baja California belongs to Baja California and is effective on or before the search date.');
      await ist.open(IST_OFFICE);
      await ist.search({ ...IST_MEXICO, date: TODAY });
      const rows = await ist.readAllRows();
      await verify('Rows exist, all for the selected province, none dated after the search date', async () => {
        expect(rows.length).toBeGreaterThan(0);
        expect(rows.filter((r) => r.province !== IST_MEXICO.province)).toEqual([]);
        expect(rows.filter((r) => !r.effectiveDate || r.effectiveDate > TODAY)).toEqual([]);
      });
    });

    test('TC-TAX-IST-019: Search request carries the selected Country, Tax Group, Province and as-of date', { tag: '@C107387' }, async () => {
      await about('The search sends the identities of the chosen Country, Tax Group and Province and the search date itself.');
      await ist.open(IST_OFFICE);
      const { request } = await ist.searchCapturing({ ...IST_MEXICO, date: TODAY });
      test.skip(!request, 'The search call is not visible in browser traffic (server-side BFF) — verify at service level (NM-4025 §10.2)');
      const body = JSON.parse(request!.body) as unknown;
      await attachNote('Search request body', request!.body);
      await verify('All four criteria are present; ids are positive integers; the date is the search date', async () => {
        for (const key of [/^countryid$/i, /^internationaltaxgroupid$/i, /^countrysubdivisionid$/i]) {
          expect(Number(deepFind(body, key)), String(key)).toBeGreaterThan(0);
        }
        expect(wireDate(deepFind(body, /^effectivedate$/i))).toBe(TODAY);
      });
    });
  });

  // ================================================================ C. As-of effective-date search

  // The as-of rule is a SEARCH rule, so these cases read the version each search returned from the
  // search response itself. The grid's displayed date is shifted a day in US timezones
  // (BUG-TAX-IST-001, tracked by TC-029) and must not decide whether the search logic is right.
  test.describe('C. As-of effective-date search', () => {
    let boundary: { taxType: string; effectiveDate: string };

    /** The stored version date the search at `asOf` returned for the boundary tax type (null = not listed). */
    async function versionAt(asOf: string): Promise<string | null> {
      const { records } = await ist.searchCapturing({ ...IST_MEXICO, date: asOf });
      if (records) return records.find((r) => r.taxType === boundary.taxType)?.effectiveDate ?? null;
      return (await ist.getRow(boundary.taxType))?.effectiveDate ?? null;
    }

    test.beforeEach(async () => {
      await ist.open(IST_OFFICE);
      const { records } = await ist.searchCapturing({ ...IST_MEXICO, date: TODAY });
      const dated = (records ?? [])
        .filter((r): r is typeof r & { taxType: string; effectiveDate: string } => !!r.taxType && !!r.effectiveDate && r.effectiveDate <= TODAY)
        .sort((a, b) => (b.effectiveDate > a.effectiveDate ? 1 : -1));
      const row = dated[0] ?? boundaryRow(await ist.readAllRows(), TODAY);
      boundary = { taxType: row.taxType!, effectiveDate: row.effectiveDate! };
      await attachNote('Boundary version (from the search response)', `${boundary.taxType} effective ${boundary.effectiveDate}`);
    });

    test('TC-TAX-IST-020: A version effective exactly on the search date is returned', { tag: '@C107388' }, async () => {
      await about('Searching on the very day a version becomes effective returns that version (NM-4008: equality is included).');
      const d = boundary.effectiveDate;
      const returned = await versionAt(d);
      await verify('The search returns the version effective on the search date, and the grid lists that tax type', async () => {
        expect(returned).toBe(d);
        expect(await ist.getRow(boundary.taxType)).not.toBeNull();
      });
    });

    test('TC-TAX-IST-021: The day before a version takes effect returns the earlier version', { tag: '@C107389' }, async () => {
      await about('One day before a version\'s effective date the search must not return it yet — the earlier version (or none) applies.');
      const d = boundary.effectiveDate;
      const returned = await versionAt(addDays(d, -1));
      await attachNote('Version returned the day before', String(returned));
      await verify('Either no version yet, or one dated before the boundary', async () => {
        if (returned) expect(returned < d).toBe(true);
      });
    });

    test('TC-TAX-IST-022: The day after a version takes effect still returns it', { tag: '@C107390' }, async () => {
      await about('One day after a version\'s effective date the latest applicable version is that one (or one dated that very next day).');
      const d = boundary.effectiveDate;
      const returned = await versionAt(addDays(d, 1));
      await verify('The returned version is dated on the boundary or the day after', async () => {
        expect(returned! >= d && returned! <= addDays(d, 1)).toBe(true);
      });
    });

    test('TC-TAX-IST-023: No row ever shows an effective date later than the search date', { tag: '@C107391' }, async () => {
      await about('At several as-of dates — far past, the day before a boundary, today and five years out — every row is effective on or before that date.');
      for (const asOf of ['2000-01-01', addDays(boundary.effectiveDate!, -1), TODAY, FAR_FUTURE]) {
        await ist.searchAt(asOf);
        const rows = await ist.readAllRows();
        await verify(`Every row at ${asOf} is effective on or before it`, async () => {
          // Tax types with no version yet are listed with a blank rate and date — not "after" anything.
          expect(rows.filter((r) => r.effectiveDate !== null && r.effectiveDate > asOf)).toEqual([]);
        });
        await attachNote(`Unconfigured rows at ${asOf}`, String(rows.filter((r) => r.effectiveDate === null).length));
      }
    });

    test('TC-TAX-IST-024: Each tax type appears once — historical versions are not listed', { tag: '@C107392' }, async () => {
      await about('The grid shows one applicable version per tax type, never the full history, at today and five years out.');
      for (const asOf of [TODAY, FAR_FUTURE]) {
        await ist.searchAt(asOf);
        const rows = await ist.readAllRows();
        await verify(`No tax type is listed twice at ${asOf}`, async () => {
          const keys = rows.map((r) => `${r.taxType}|${r.province}`);
          expect(new Set(keys).size).toBe(keys.length);
        });
      }
    });

    test('TC-TAX-IST-025: Searching dates A → B → A restores the original results', { tag: '@C107393' }, async () => {
      await about('Moving the as-of date to an earlier day and back returns exactly the first result again — nothing is cached from the other date.');
      const a = sortedFacts(await ist.readAllRows());
      await ist.searchAt(addDays(boundary.effectiveDate!, -1));
      const b = sortedFacts(await ist.readAllRows());
      await ist.searchAt(TODAY);
      const again = sortedFacts(await ist.readAllRows());
      await attachNote('Rows that differ between A and B', String(a.filter((x) => !b.includes(x)).length));
      await verify('The third search equals the first', async () => {
        expect(again).toEqual(a);
      });
    });

    test('TC-TAX-IST-026: The as-of date reaches the search request without an off-by-one shift', { tag: '@C107394' }, async () => {
      await about('The date chosen in the picker is the calendar date the search request carries — no timezone conversion moves it a day.');
      const d = boundary.effectiveDate!;
      const { request } = await ist.searchCapturing({ ...IST_MEXICO, date: d });
      test.skip(!request, 'The search call is not visible in browser traffic — verify at service level (NM-4025 §10.2)');
      await verify('The request date equals the picked date', async () => {
        expect(wireDate(deepFind(JSON.parse(request!.body), /^effectivedate$/i))).toBe(d);
      });
    });

    test('TC-TAX-IST-027: Exact-date versions are still returned when the browser runs in a UTC+ timezone', { tag: '@C107395' }, async ({ browser, config }) => {
      await about(`A user whose browser is in ${IST_UTC_PLUS_TIMEZONE} searching on a version's effective date still gets that version — local midnight there is the previous day in UTC.`);
      const d = boundary.effectiveDate!;
      const ctx = await browser.newContext({ storageState: STATE_PATH, timezoneId: IST_UTC_PLUS_TIMEZONE });
      try {
        const other = new InternationalTaxSetupPage(await ctx.newPage(), config);
        await other.open(IST_OFFICE);
        await other.search({ ...IST_MEXICO, date: d });
        const row = await other.getRow(boundary.taxType);
        await verify('The version effective on the search date is returned', async () => {
          expect(row?.effectiveDate).toBe(d);
        });
      } finally {
        await ctx.close();
      }
    });
  });

  // ================================================================ D. Grid display, sorting and resilience

  test.describe('D. Grid display, sorting and resilience', () => {
    test('TC-TAX-IST-028: Rates render as percentages with a % suffix', { tag: '@C107396' }, async () => {
      await about('Every Rate cell reads as a number followed by "%", such as "22%" or "0.16%".');
      await ist.open(IST_OFFICE);
      await ist.search(IST_MEXICO);
      const rows = await ist.readAllRows();
      await verify('Every rate is "<number>%"', async () => {
        expect(rows.length).toBeGreaterThan(0);
        expect(rows.filter((r) => !/^-?\d+(\.\d+)?\s*%$/.test(r.rateText)).map((r) => `${r.taxType}: ${r.rateText}`)).toEqual([]);
      });
    });

    test('TC-TAX-IST-029: Grid values match the search response record by record', { tag: '@C107397' }, async () => {
      test.fail(true, 'BUG-TAX-IST-001: the grid renders the UTC-midnight effectiveDate in browser local time, so every date shows one day early west of UTC (America/New_York shows 10/21/2026 for 2026-10-22). Remove this marker when fixed.');
      await about('Each row\'s rate, effective date and commission flag are exactly what the search returned for that tax type, on one consistent rate scale.');
      await ist.open(IST_OFFICE);
      const { records } = await ist.searchCapturing(IST_MEXICO);
      test.skip(!records || records.length === 0, 'The search response is not visible in browser traffic — compare at service level');
      const rows = await ist.readAllRows();
      const scale = records![0]!.rate !== null && rows.length > 0 && Math.abs(records![0]!.rate! * 100 - (byType(rows).get(records![0]!.taxType ?? '')?.rate ?? NaN)) < 1e-6 ? 100 : 1;
      await attachNote('Rate scale (display ÷ API)', String(scale));
      await verify('Same number of records; each row matches its record', async () => {
        expect(rows).toHaveLength(records!.length);
        for (const rec of records!) {
          const row = byType(rows).get(rec.taxType ?? '');
          expect(row, `row for ${rec.taxType}`).toBeDefined();
          if (rec.rate !== null) expect(row!.rate).toBeCloseTo(rec.rate * scale, 6);
          expect(row!.effectiveDate).toBe(rec.effectiveDate);
          if (rec.commissionTaxable !== null) expect(row!.commissionTaxable).toBe(rec.commissionTaxable);
        }
      });
    });

    test('TC-TAX-IST-030: Records-found count equals the number of rows', { tag: ['@C107398', '@needs-confirmation'] }, async () => {
      await about('The "<n> records found" label counts exactly the rows the grid lists.');
      await ist.open(IST_OFFICE);
      await ist.search(IST_MEXICO);
      const count = await ist.getRecordsFoundCount();
      const rows = await ist.readAllRows();
      await verify('Counter equals the row count', async () => {
        expect(count).toBe(rows.length);
      });
    });

    test('TC-TAX-IST-031: Grid cells cannot be edited inline', { tag: '@C107399' }, async () => {
      await about('Double-clicking a Rate, Effective Date or Tax Type cell and typing changes nothing — edits only go through the update section (NM-2395).');
      await ist.open(IST_OFFICE);
      await ist.search(IST_MEXICO);
      const target = (await ist.readAllRows())[0]!;
      const results: Record<string, boolean> = {};
      for (const column of ['Rate', 'Effective Date', 'Tax Type']) {
        results[column] = (await ist.tryInlineEdit(target.taxType, column, '99')).editorAppeared;
      }
      const after = await ist.getRow(target.taxType);
      await verify('No inline editor opened, the row is unchanged and nothing is pending', async () => {
        expect(results).toEqual({ Rate: false, 'Effective Date': false, 'Tax Type': false });
        expect(after && facts(after)).toEqual(facts(target));
        expect(await ist.isSaveEnabled()).toBe(false);
      });
    });

    test('TC-TAX-IST-032: Sorting Tax Type reorders the rows alphabetically both ways', { tag: ['@C107400', '@needs-confirmation'] }, async () => {
      await about('Sort ascending on Tax Type orders the rows A→Z and Sort descending Z→A, without losing any row.');
      await ist.open(IST_OFFICE);
      await ist.search(IST_MEXICO);
      const original = (await ist.readAllRows()).map((r) => r.taxType);
      await ist.sortBy('Tax Type', 'ascending');
      const asc = (await ist.readAllRows()).map((r) => r.taxType);
      await ist.sortBy('Tax Type', 'descending');
      const desc = (await ist.readAllRows()).map((r) => r.taxType);
      const expected = [...original].sort((a, b) => a.localeCompare(b));
      await verify('Ascending is A→Z, descending is Z→A, and the rows are the same', async () => {
        expect(asc).toEqual(expected);
        expect(desc).toEqual([...expected].reverse());
      });
    });

    test('TC-TAX-IST-033: Sorting Rate orders the rows numerically', { tag: ['@C107401', '@needs-confirmation'] }, async () => {
      await about('Sorting by Rate orders by the number, so 0.16% sorts below 22% (not as text).');
      await ist.open(IST_OFFICE);
      await ist.search(IST_MEXICO);
      await ist.sortBy('Rate', 'ascending');
      const asc = (await ist.readAllRows()).map((r) => r.rate ?? NaN);
      await ist.sortBy('Rate', 'descending');
      const desc = (await ist.readAllRows()).map((r) => r.rate ?? NaN);
      await verify('Ascending never decreases, descending never increases', async () => {
        expect(asc).toEqual([...asc].sort((a, b) => a - b));
        expect(desc).toEqual([...desc].sort((a, b) => b - a));
      });
    });

    test('TC-TAX-IST-034: Sorting moves whole rows — no value changes tax type', { tag: '@C107402' }, async () => {
      await about('After sorting by Effective Date every tax type still shows exactly its own rate, date and commission flag.');
      await ist.open(IST_OFFICE);
      await ist.search(IST_MEXICO);
      const before = sortedFacts(await ist.readAllRows());
      await ist.sortBy('Effective Date', 'descending');
      const after = sortedFacts(await ist.readAllRows());
      await verify('The set of rows and their values is unchanged', async () => {
        expect(after).toEqual(before);
      });
    });

    test('TC-TAX-IST-035: An empty search result shows an empty state without stale rows or errors', { tag: '@C107403' }, async () => {
      await about('When a search legitimately returns nothing, the grid empties and no error is shown.');
      await ist.open(IST_OFFICE);
      await ist.search(IST_MEXICO);
      await ist.mockSearch({ kind: 'empty' });
      await ist.clickSearchAndWait();
      await verify('No rows, a zero or absent counter, no error toast, page intact', async () => {
        expect(await ist.readAllRows()).toEqual([]);
        expect([0, null]).toContain(await ist.getRecordsFoundCount());
        await expect(ist.page.locator('[data-sonner-toast][data-type="error"]')).toHaveCount(0);
        expect(await ist.isHeadingVisible()).toBe(true);
      });
    });

    test('TC-TAX-IST-036: A failed search shows an error and does not present stale rows as the new result', { tag: ['@C107404', '@needs-confirmation'] }, async () => {
      await about('If a search fails on the server the user is told so; the previous result is not silently left on screen as if it were the answer.');
      await ist.open(IST_OFFICE);
      await ist.search(IST_MEXICO);
      await ist.mockSearch({ kind: 'failure' });
      await ist.clickSearch();
      const errorShown = await ist.waitForError(15_000).then(() => true, () => false);
      const rows = await ist.readAllRows();
      await verify('An error is shown, or the stale rows were cleared', async () => {
        expect(errorShown || rows.length === 0).toBe(true);
      });
    });

    test('TC-TAX-IST-037: A slow earlier search is never shown over a later one', { tag: '@C107405' }, async () => {
      await about('If the first of two quick searches answers last, the grid still shows the result for the date the user searched last.');
      await ist.open(IST_OFFICE);
      await ist.search({ ...IST_MEXICO, date: TODAY });
      const boundary = boundaryRow(await ist.readAllRows(), TODAY);
      const sent = await ist.recordSearches();
      await ist.mockSearch({ kind: 'delay-first', ms: 6_000 });
      await ist.setSearchEffectiveDate(addDays(boundary.effectiveDate!, -1));
      await ist.clickSearch();
      await ist.setSearchEffectiveDate(TODAY);
      if (await ist.searchButton().isEnabled()) await ist.clickSearch();
      await phase('Let the held first answer land', () => ist.page.waitForTimeout(7_000));
      await expect.poll(() => ist.isLoadingVisible(), { timeout: 60_000 }).toBe(false);
      test.skip(sent.length < 2, 'Search is locked while a search is pending — the race cannot occur');
      const shown = sortedFacts(await ist.readAllRows());
      await ist.clearInterceptions();
      await ist.clickSearchAndWait();
      await verify('The grid equals a clean search at the last searched date', async () => {
        expect(shown).toEqual(sortedFacts(await ist.readAllRows()));
      });
    });
  });

  // ================================================================ E. Row selection and Apply (staging only — nothing saved)

  test.describe('E. Row selection and Apply', () => {
    let rows: TaxRow[];

    test.beforeEach(async () => {
      await ist.open(IST_OFFICE);
      await ist.search(IST_MEXICO);
      rows = await ist.readAllRows();
    });

    test('TC-TAX-IST-038: Selecting one row checks only that row', { tag: '@C107406' }, async () => {
      await about('Ticking one row\'s checkbox selects that row and no other.');
      const [a] = threeRows(rows);
      await ist.selectRows([a.taxType]);
      const after = await ist.readAllRows();
      await verify('Exactly the chosen row is selected', async () => {
        expect(after.filter((r) => r.selected).map((r) => r.taxType)).toEqual([a.taxType]);
      });
    });

    test('TC-TAX-IST-039: Apply to one selected row stages the values on that row only', { tag: '@C107407' }, async () => {
      await about('With one row selected, Apply copies the Rate, Effective Date and commission flag onto that row; every other row keeps its values.');
      const [a] = threeRows(rows);
      const rate = distinctRate(rows);
      await ist.stage([a.taxType], { rate, date: SAFE_NEW_DATE, commissionTaxable: !a.commissionTaxable });
      const after = byType(await ist.readAllRows());
      await verify('The selected row shows the staged values', async () => {
        const row = after.get(a.taxType)!;
        expect(row.rate).toBe(Number(rate));
        expect(row.effectiveDate).toBe(SAFE_NEW_DATE);
        expect(row.commissionTaxable).toBe(!a.commissionTaxable);
      });
      await verify('Every other row is unchanged', async () => {
        for (const r of rows.filter((x) => x.taxType !== a.taxType)) expect(facts(after.get(r.taxType)!), r.taxType).toEqual(facts(r));
      });
    });

    test('TC-TAX-IST-040: Apply to several selected rows leaves the unselected row unchanged', { tag: '@C107408' }, async () => {
      await about('With two rows selected and a third left alone, Apply updates both selected rows and not the third.');
      const [a, b, c] = threeRows(rows);
      const rate = distinctRate(rows);
      await ist.stage([a.taxType, b.taxType], { rate, date: SAFE_NEW_DATE });
      const after = byType(await ist.readAllRows());
      await verify('Both selected rows carry the staged rate and date', async () => {
        for (const t of [a.taxType, b.taxType]) {
          expect(after.get(t)!.rate, t).toBe(Number(rate));
          expect(after.get(t)!.effectiveDate, t).toBe(SAFE_NEW_DATE);
        }
      });
      await verify('The unselected row is untouched', async () => {
        expect(facts(after.get(c.taxType)!)).toEqual(facts(c));
      });
    });

    test('TC-TAX-IST-041: Apply marks the pending indicator on affected rows and enables Save', { tag: '@C107409' }, async () => {
      await about('After Apply, the Apply column flags exactly the changed rows as waiting for Save, and Save becomes available.');
      const [a, b] = threeRows(rows);
      await ist.stage([a.taxType, b.taxType], { rate: distinctRate(rows), date: SAFE_NEW_DATE });
      const after = await ist.readAllRows();
      await verify('Pending on the two staged rows only; Save enabled', async () => {
        expect(after.filter((r) => r.pending).map((r) => r.taxType).sort()).toEqual([a.taxType, b.taxType].sort());
        expect(await ist.isSaveEnabled()).toBe(true);
      });
    });

    test('TC-TAX-IST-042: Save is not available before any change is applied', { tag: ['@C107410', '@needs-confirmation'] }, async () => {
      await about('Straight after a search nothing is pending, so Save is disabled.');
      await verify('No row pending; Save disabled', async () => {
        expect(rows.filter((r) => r.pending)).toEqual([]);
        expect(await ist.isSaveEnabled()).toBe(false);
      });
    });

    test('TC-TAX-IST-043: Commission taxable can be staged from true to false and back', { tag: '@C107411' }, async () => {
      await about('Applying an unticked "Is Commission Taxable?" clears the flag on the selected row, and applying it ticked sets it again.');
      const row = rows.find((r) => r.commissionTaxable) ?? rows[0]!;
      const start = row.commissionTaxable;
      await ist.stage([row.taxType], { date: SAFE_NEW_DATE, commissionTaxable: !start });
      const flipped = (await ist.getRow(row.taxType))!.commissionTaxable;
      await ist.stage([row.taxType], { date: SAFE_NEW_DATE, commissionTaxable: start });
      const back = (await ist.getRow(row.taxType))!.commissionTaxable;
      await verify('The flag follows each Apply', async () => {
        expect(flipped).toBe(!start);
        expect(back).toBe(start);
      });
    });

    test('TC-TAX-IST-044: Apply stages changes without sending a save request', { tag: '@C107412' }, async () => {
      await about('Apply only stages values on the grid — nothing is written until Save is clicked.');
      const captured = await ist.interceptSave('abort');
      const [a] = threeRows(rows);
      await ist.stage([a.taxType], { rate: distinctRate(rows), date: SAFE_NEW_DATE });
      await ist.page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
      await verify('No save request was made', async () => {
        expect(captured).toHaveLength(0);
      });
    });

    test('TC-TAX-IST-045: Selection, commission display and pending indicator are independent', { tag: '@C107413' }, async () => {
      await about('Ticking and unticking a row checkbox never changes that row\'s commission flag or pending indicator — they are separate controls.');
      const [a] = threeRows(rows);
      await ist.selectRows([a.taxType]);
      const selected = (await ist.getRow(a.taxType))!;
      await ist.deselectRows([a.taxType]);
      const cleared = (await ist.getRow(a.taxType))!;
      await verify('Commission and pending are the same in all three states', async () => {
        expect(selected.selected).toBe(true);
        expect(cleared.selected).toBe(false);
        for (const s of [selected, cleared]) {
          expect(s.commissionTaxable).toBe(a.commissionTaxable);
          expect(s.pending).toBe(a.pending);
        }
      });
    });

    test('TC-TAX-IST-046: Apply with no rows selected changes nothing', { tag: '@C107414' }, async () => {
      await about('With no row selected, Apply is unavailable or does nothing: no row is staged, Save stays off and nothing is sent. (The message, if any, is TBC.)');
      const captured = await ist.interceptSave('abort');
      await ist.setUpdateRate(distinctRate(rows));
      if (await ist.isApplyEnabled()) await ist.applyChanges();
      const after = await ist.readAllRows();
      await verify('No row pending or changed, Save not enabled, no request', async () => {
        expect(sortedFacts(after)).toEqual(sortedFacts(rows));
        expect(await ist.isSaveEnabled()).toBe(false);
        expect(captured).toHaveLength(0);
      });
    });

    test('TC-TAX-IST-047: Row selection is available for both Mexico and Canada', { tag: '@C107415' }, async () => {
      await about('Every row has a usable selection checkbox for Mexico and for Canada — selection is not a Canada-only feature (NM-2395 clarification).');
      const mexico = await ist.countRowCheckboxes();
      await ist.search(IST_CANADA);
      const canadaRows = await ist.readGrid();
      const canada = await ist.countRowCheckboxes();
      await verify('Each rendered row offers an enabled checkbox in both countries', async () => {
        expect(mexico.enabled).toBeGreaterThan(0);
        expect(mexico.enabled).toBe(mexico.total);
        expect(canadaRows.length).toBeGreaterThan(0);
        expect(canada.enabled).toBe(canadaRows.length);
      });
    });

    test('TC-TAX-IST-048: Search Effective Date and update Effective Date are independent fields', { tag: '@C107416' }, async () => {
      await about('Changing the update date leaves the search date alone, and changing the search date leaves the update date alone.');
      const searchDate = await ist.getSearchEffectiveDate();
      await ist.setUpdateEffectiveDate(SAFE_NEW_DATE);
      const searchAfterUpdate = await ist.getSearchEffectiveDate();
      await ist.setSearchEffectiveDate(addDays(TODAY, -3));
      await verify('Each field keeps its own value', async () => {
        expect(searchAfterUpdate).toBe(searchDate);
        expect(await ist.getUpdateEffectiveDate()).toBe(SAFE_NEW_DATE);
        expect(await ist.getSearchEffectiveDate()).toBe(addDays(TODAY, -3));
      });
    });

    test('TC-TAX-IST-049: Markup typed into Rate is never executed or rendered as HTML', { tag: '@C107417' }, async () => {
      await about('Script or image markup typed into Rate (and applied, if accepted) never runs and never becomes HTML in the grid.');
      const [a] = threeRows(rows);
      let dialogs = 0;
      ist.page.on('dialog', () => (dialogs += 1));
      for (const input of IST_HOSTILE_RATE_INPUTS) {
        await ist.selectRows([a.taxType]);
        await ist.setUpdateRate(input.typed);
        if (await ist.isApplyEnabled()) await ist.applyChanges();
        await verify(`The ${input.label} did not execute or render`, async () => {
          expect(await ist.page.evaluate(() => (window as unknown as { __istXss?: number }).__istXss)).toBeUndefined();
          await expect(ist.page.locator('main img[src="x"]')).toHaveCount(0);
          expect(dialogs).toBe(0);
        });
      }
    });

    test('TC-TAX-IST-050: Rate can be cleared with Backspace and with Delete', { tag: ['@C107418', '@needs-confirmation'] }, async () => {
      await about('A value in Rate can be removed completely with Backspace, and again with Delete from the start (NM-4083 regression).');
      await ist.setUpdateRate('12');
      await ist.rateField().press('Control+A');
      await ist.rateField().press('Backspace');
      const afterBackspace = await ist.getUpdateRate();
      await ist.setUpdateRate('12');
      await ist.rateField().press('Home');
      await ist.rateField().press('Delete');
      await ist.rateField().press('Delete');
      await verify('Both keys empty the field', async () => {
        expect(afterBackspace).toBe('');
        expect(await ist.getUpdateRate()).toBe('');
      });
    });
  });

  // ================================================================ F. Unsaved-change guard

  test.describe('F. Unsaved-change guard', () => {
    let rows: TaxRow[];

    test.beforeEach(async () => {
      await ist.open(IST_OFFICE);
      await ist.search(IST_MEXICO);
      rows = await ist.readAllRows();
      await ist.stage([rows[0]!.taxType], { rate: distinctRate(rows), date: SAFE_NEW_DATE });
    });

    test('TC-TAX-IST-051: Search with staged changes shows the loss-of-changes warning', { tag: '@C107419' }, async () => {
      // The app uses the shared "Unsaved changes" dialog rather than the NM-2395 wording — accepted as
      // designed (BUG-TAX-IST-002 dropped 2026-10-26).
      await about(`Clicking Search while changes are staged warns "${IST_MESSAGES.unsavedChangesTitle} — ${IST_MESSAGES.unsavedChangesText}" before anything is lost.`);
      const text = await ist.clickSearchAnsweringWarning('cancel');
      await verify('The Unsaved changes warning is shown with its message', async () => {
        expect(text).toContain(IST_MESSAGES.unsavedChangesTitle);
        expect(text).toContain(IST_MESSAGES.unsavedChangesText);
      });
    });

    test('TC-TAX-IST-052: Confirming the warning discards staged changes and runs the search', { tag: '@C107420' }, async () => {
      await about('Answering yes to the warning throws the staged values away, searches again and leaves the page clean.');
      const sent = await ist.recordSearches();
      await ist.clickSearchAnsweringWarning('confirm');
      await ist.page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
      const after = await ist.readAllRows();
      await verify('Values are back to the stored ones, nothing pending, Save disabled', async () => {
        expect(sortedFacts(after)).toEqual(sortedFacts(rows));
        expect(after.filter((r) => r.pending)).toEqual([]);
        expect(await ist.isSaveEnabled()).toBe(false);
      });
      await attachNote('Search requests sent after confirming', String(sent.length));
    });

    test('TC-TAX-IST-053: Cancelling the warning keeps staged changes and does not search', { tag: ['@C107421', '@needs-confirmation'] }, async () => {
      await about('Answering no to the warning keeps the staged values on screen and no new search runs.');
      const staged = await ist.readAllRows();
      const sent = await ist.recordSearches();
      await ist.clickSearchAnsweringWarning('cancel');
      await verify('Staged rows and pending state are intact; no search request', async () => {
        expect(sortedFacts(await ist.readAllRows())).toEqual(sortedFacts(staged));
        expect(sent).toHaveLength(0);
      });
    });
  });

  // ================================================================ G. Save requests (writes held at the network)

  test.describe('G. Save requests and chronology', () => {
    let rows: TaxRow[];

    test.beforeEach(async () => {
      await ist.open(IST_OFFICE);
      await ist.search(IST_MEXICO);
      rows = await ist.readAllRows();
    });

    test('TC-TAX-IST-054: Save sends only the selected configurations with the staged values', { tag: '@C107422' }, async () => {
      await about('Saving two staged rows sends exactly two InternationalTax records carrying the staged rate, date and flag — untouched rows are not sent. The write is held at the network.');
      const [a, b] = threeRows(rows);
      const rate = distinctRate(rows);
      const captured = await ist.interceptSave('abort');
      await ist.stage([a.taxType, b.taxType], { rate, date: SAFE_NEW_DATE, commissionTaxable: true });
      await ist.clickSave();
      await expect.poll(() => captured.length, { timeout: 15_000 }).toBe(1);
      const sent = captured[0]!.records;
      await attachNote('Save request body', captured[0]!.body);
      await verify('Two records, both with the staged date and flag; tax types are the selected ones where named', async () => {
        expect(sent).toHaveLength(2);
        for (const r of sent) {
          expect(r.effectiveDate).toBe(SAFE_NEW_DATE);
          if (r.commissionTaxable !== null) expect(r.commissionTaxable).toBe(true);
        }
        const named = sent.map((r) => r.taxType).filter((t): t is string => t !== null);
        if (named.length) expect(named.sort()).toEqual([a.taxType, b.taxType].sort());
      });
    });

    test('TC-TAX-IST-055: Save payload carries the staged effective date without a shift', { tag: '@C107423' }, async ({ browser, config }) => {
      await about(`The date staged in the update picker is the calendar date sent on Save, also from a ${IST_UTC_PLUS_TIMEZONE} browser. The write is held at the network.`);
      const ctx = await browser.newContext({ storageState: STATE_PATH, timezoneId: IST_UTC_PLUS_TIMEZONE });
      try {
        const other = new InternationalTaxSetupPage(await ctx.newPage(), config);
        await other.open(IST_OFFICE);
        await other.search(IST_MEXICO);
        const captured = await other.interceptSave('abort');
        await other.stage([rows[0]!.taxType], { rate: distinctRate(rows), date: SAFE_NEW_DATE });
        await other.clickSave();
        await expect.poll(() => captured.length, { timeout: 15_000 }).toBe(1);
        await verify('Every record carries the staged date', async () => {
          expect(captured[0]!.records.map((r) => r.effectiveDate)).toEqual([SAFE_NEW_DATE]);
        });
      } finally {
        await ctx.close();
      }
    });

    test('TC-TAX-IST-056: A network failure on Save shows an error and never reports success', { tag: '@C107424' }, async () => {
      await about('If the save cannot reach the server the user sees an error, never a success message. (What stays staged afterwards is TBC.)');
      await ist.interceptSave('abort');
      await ist.stage([rows[0]!.taxType], { rate: distinctRate(rows), date: SAFE_NEW_DATE });
      await ist.clickSave();
      const error = await ist.waitForError();
      await attachNote('Error shown', error);
      await verify('Error shown and no success toast', async () => {
        expect(error.length).toBeGreaterThan(0);
        expect(await ist.isSuccessToastVisible()).toBe(false);
      });
    });

    test('TC-TAX-IST-057: A server error on Save leaves the stored values unchanged', { tag: '@C107425' }, async () => {
      await about('If the server answers 500, an error is shown and a fresh search still returns the original values.');
      const [a] = threeRows(rows);
      await ist.interceptSave('server-error');
      await ist.stage([a.taxType], { rate: distinctRate(rows), date: SAFE_NEW_DATE });
      await ist.clickSave();
      await ist.waitForError();
      await ist.clearInterceptions();
      await ist.open(IST_OFFICE);
      await ist.search(IST_MEXICO);
      await verify('The row reads as it did before the failed save', async () => {
        expect(facts((await ist.getRow(a.taxType))!)).toEqual(facts(a));
      });
    });

    test('TC-TAX-IST-058: A second Save click while the first is in flight sends nothing', { tag: ['@C107426', '@needs-confirmation'] }, async () => {
      await about('Clicking Save twice quickly sends one request — the button is out of action while the first is running.');
      const captured = await ist.interceptSave('delay-then-abort', 4_000);
      await ist.stage([rows[0]!.taxType], { rate: distinctRate(rows), date: SAFE_NEW_DATE });
      await ist.clickSave();
      const disabledInFlight = !(await ist.isSaveEnabled());
      await ist.saveButton().click({ force: true, timeout: 2_000 }).catch(() => undefined);
      await ist.waitForError();
      await verify('Disabled during flight; exactly one request', async () => {
        expect(disabledInFlight).toBe(true);
        expect(captured).toHaveLength(1);
      });
    });

    // Chronology (NM-2402): a new version must be strictly later than the LATEST STORED version of the
    // same configuration. The save is held at the network; the UI must refuse the date before sending.
    async function expectChronologyRejected(taxType: string, candidate: string, label: string): Promise<void> {
      await attachNote('Candidate date', `${taxType}: ${candidate} (${label})`);
      const captured = await ist.interceptSave('abort');
      await ist.stage([taxType], { rate: distinctRate(rows), date: candidate });
      if (await ist.isSaveEnabled()) await ist.clickSave();
      await ist.page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
      await verify('The UI refused the date before anything was sent', async () => {
        expect(captured).toHaveLength(0);
        expect(await ist.isSuccessToastVisible()).toBe(false);
      });
    }

    test('TC-TAX-IST-059: An effective date equal to the latest stored date is rejected', { tag: '@C107427' }, async () => {
      await about('Saving a new version dated the same day as the latest stored version is refused — equality is not "later".');
      await ist.search({ ...IST_MEXICO, date: FAR_FUTURE });
      rows = await ist.readAllRows();
      const target = rows[0]!;
      await expectChronologyRejected(target.taxType, target.effectiveDate!, 'equal to latest stored');
    });

    test('TC-TAX-IST-060: An effective date earlier than the latest stored date is rejected', { tag: '@C107428' }, async () => {
      await about('Saving a new version dated the day before the latest stored version is refused.');
      await ist.search({ ...IST_MEXICO, date: FAR_FUTURE });
      rows = await ist.readAllRows();
      const target = rows[0]!;
      await expectChronologyRejected(target.taxType, addDays(target.effectiveDate!, -1), 'one day before latest stored');
    });
  });

  // ================================================================ I. Session

  test.describe('I. Session', () => {
    test('TC-TAX-IST-061: Without a session the page sends the user to sign in', { tag: '@C107429' }, async ({ browser, config }) => {
      await about('An expired or missing session never shows tax configurations; the user is sent to sign in and brought back afterwards.');
      // Explicitly empty: inside a test, newContext() inherits the project's storageState (signed in).
      const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
      try {
        const page = await ctx.newPage();
        await page.goto(`${config.base_url}${IST_PATH(IST_OFFICE)}`, { waitUntil: 'domcontentloaded' });
        await verify('Redirected to sign-in with this page as the callback; no grid', async () => {
          await page.waitForURL((u) => /\/auth\/sign-in$/.test(u.pathname), { timeout: 60_000 });
          expect(new URL(page.url()).searchParams.get('callbackUrl')).toBe(`/${IST_PATH(IST_OFFICE)}`);
          await expect(page.locator('main table')).toHaveCount(0);
        });
      } finally {
        await ctx.close();
      }
    });
  });

  // ================================================================ J. Accessibility, localisation and layout

  test.describe('J. Accessibility, localisation and layout', () => {
    test('TC-TAX-IST-062: Every search and update control has an accessible name', { tag: '@C107430' }, async () => {
      // The Country / Tax Group / Province triggers carry no label association and both dates are named
      // "Select date" — accepted as designed (BUG-TAX-IST-003 dropped 2026-10-26), so they are not asserted.
      await about('Screen-reader users get a name for every other control: both Effective Dates, Rate, the commission checkbox and every button.');
      await ist.open(IST_OFFICE);
      await ist.search(IST_MEXICO);
      const names = await ist.readControlAccessibleNames();
      await attachNote('Accessible names', JSON.stringify(names, null, 2));
      const checked = Object.entries(names).filter(([k]) => !['Country', 'Tax Group', 'Province'].includes(k));
      await verify('No other control is unnamed, and Rate and the buttons say what they are', async () => {
        expect(checked.filter(([, n]) => n.length === 0).map(([k]) => k)).toEqual([]);
        expect(names.Rate).toMatch(/rate/i);
        expect(names['Is Commission Taxable?']).toMatch(/commission/i);
        for (const button of ['Apply', 'Search', 'Reset', 'Save'] as const) expect(names[button], button).toMatch(new RegExp(button, 'i'));
      });
    });

    test('TC-TAX-IST-063: Row checkboxes can be operated with the keyboard', { tag: '@C107431' }, async () => {
      await about('A keyboard user can focus a row checkbox and toggle it with Space.');
      await ist.open(IST_OFFICE);
      await ist.search(IST_MEXICO);
      const row = (await ist.readAllRows())[0]!;
      await ist.toggleRowWithKeyboard(row.taxType);
      const on = (await ist.getRow(row.taxType))!.selected;
      await ist.toggleRowWithKeyboard(row.taxType);
      await verify('Space selects and then clears the row', async () => {
        expect(on).toBe(true);
        expect((await ist.getRow(row.taxType))!.selected).toBe(false);
      });
    });

    test('TC-TAX-IST-064: Tab order through the search panel follows the visual order', { tag: '@C107432' }, async () => {
      await about('Tabbing from Country visits Tax Group, Province, Effective Date, Reset and Search in that order.');
      await ist.open(IST_OFFICE);
      await ist.selectCountry(IST_MEXICO.country);
      const targets = [
        ['Tax Group', ist.taxGroupField()],
        ['Province', ist.provinceField()],
        ['Effective Date', ist.searchDateField()],
        ['Reset', ist.resetButton()],
        ['Search', ist.searchButton()],
      ] as const;
      await ist.countryField().focus();
      const order: string[] = [];
      for (let i = 0; i < 15 && order.length < targets.length; i++) {
        await ist.page.keyboard.press('Tab');
        for (const [label, loc] of targets) {
          if (order.includes(label)) continue;
          if (await loc.evaluate((el) => el === document.activeElement || el.contains(document.activeElement))) order.push(label);
        }
      }
      await verify('Focus visits the controls in visual order', async () => {
        expect(order).toEqual(targets.map(([l]) => l));
      });
    });

    test('TC-TAX-IST-065: No untranslated i18n key is visible on the page', { tag: '@C107433' }, async () => {
      await about('Every label, header and message is real text, never a raw key like "taxes.internationalTax.…".');
      await ist.open(IST_OFFICE);
      await ist.search(IST_MEXICO);
      const keys = await ist.findRawI18nKeys();
      await verify('No dotted i18n keys in the page text', async () => {
        expect(keys).toEqual([]);
      });
    });

    test('TC-TAX-IST-066: Automated WCAG 2.1 AA scan finds no serious or critical violations', { tag: '@C107434' }, async () => {
      // The three dropdown triggers are excluded: their missing label is accepted as designed (BUG-TAX-IST-003
      // dropped 2026-10-26). Everything else on the page is still scanned.
      await about('An axe-core scan of the loaded page with results finds no serious or critical accessibility violations outside the three search dropdowns.');
      type AxeRun = { analyze(): Promise<{ violations: { id: string; impact: string | null; nodes: { target: unknown }[] }[] }> };
      let AxeBuilder: (new (o: { page: unknown }) => { withTags(t: string[]): { exclude(selector: string): AxeRun & { exclude(selector: string): AxeRun & { exclude(selector: string): AxeRun } } } }) | null = null;
      try {
        AxeBuilder = createRequire(__filename)('@axe-core/playwright').default;
      } catch {
        AxeBuilder = null;
      }
      test.skip(!AxeBuilder, '@axe-core/playwright is not installed — `npm i -D @axe-core/playwright` to enable this scan');
      await ist.open(IST_OFFICE);
      await ist.search(IST_MEXICO);
      const result = await new AxeBuilder!({ page: ist.page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .exclude('#international-tax-setup-country').exclude('#international-tax-setup-tax-group').exclude('#international-tax-setup-province')
        .analyze();
      const serious = result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      await attachNote('axe violations', JSON.stringify(serious.map((v) => ({ id: v.id, impact: v.impact, targets: v.nodes.map((n) => n.target) })), null, 2));
      await verify('No serious or critical violations', async () => {
        expect(serious.map((v) => v.id)).toEqual([]);
      });
    });

    for (const [i, vp] of IST_VIEWPORTS.entries()) {
      const id = `TC-TAX-IST-${String(67 + i).padStart(3, '0')}`;
      test(`${id}: Page stays usable at ${vp.label}`, { tag: LOOP_CASE_TAGS[id] }, async () => {
        await about(`At ${vp.label} the search panel, the update section and Save stay reachable and the page does not scroll sideways.`);
        const original = ist.page.viewportSize();
        try {
          await ist.page.setViewportSize({ width: vp.width, height: vp.height });
          await ist.open(IST_OFFICE);
          await ist.search(IST_MEXICO);
          const overflow = await ist.measureOverflow();
          await verify('Search, Apply and Save are reachable; no page-level horizontal scroll', async () => {
            for (const loc of [ist.searchButton(), ist.applyButton(), ist.saveButton()]) {
              await loc.scrollIntoViewIfNeeded();
              await expect(loc).toBeInViewport();
            }
            expect(overflow.pageOverflows).toBe(false);
          });
        } finally {
          if (original) await ist.page.setViewportSize(original);
        }
      });
    }
  });

  // ================================================================ K. Pending product confirmation (NM-4025 §14.2)

  // These answer NM-4025 §14.2 questions with the behaviour observed live on e2e (2026-10-22). They pin
  // today's behaviour so a change is noticed, and stay @needs-confirmation until product signs it off.
  test.describe('K. Characterised behaviour pending product confirmation', () => {
    test('TC-TAX-IST-069: Reset restores the approved defaults', { tag: ['@C107437', '@needs-confirmation'] }, async () => {
      await about('Reset clears Province, puts the search date back to today, empties the results and does not search on its own; Country and Tax Group keep their values. With staged changes it asks first.');
      await ist.open(IST_OFFICE);
      await ist.search({ ...IST_MEXICO, date: addDays(TODAY, -400) });
      const before = await ist.getSelectedCriteria();
      const sent = await ist.recordSearches();
      await ist.resetSearchCriteria();
      await ist.page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
      const after = await ist.getSelectedCriteria();
      await verify('Province cleared, date today, grid empty, no automatic search; Country and Tax Group kept', async () => {
        expect(isEmptySelection(after.province)).toBe(true);
        expect(after.date).toBe(TODAY);
        expect(await ist.readAllRows()).toEqual([]);
        expect(sent).toHaveLength(0);
        expect([after.country, after.taxGroup]).toEqual([before.country, before.taxGroup]);
      });
      await ist.search(IST_MEXICO);
      const rows = await ist.readAllRows();
      await ist.stage([rows[0]!.taxType], { rate: distinctRate(rows), date: SAFE_NEW_DATE });
      await ist.resetSearchCriteria();
      await verify('With staged changes, Reset raises the Unsaved changes warning', async () => {
        await expect(ist.page.locator('[data-testid="location-settings-modal-unsaved-changes"]')).toBeVisible();
      });
    });

    test('TC-TAX-IST-070: Header select-all selects the approved scope', { tag: ['@C107438', '@needs-confirmation'] }, async () => {
      await about('The header checkbox selects every row of the result (all rows are rendered — no paging); clearing one row clears the header tick, and the header selects everything again.');
      await ist.open(IST_OFFICE);
      await ist.search(IST_MEXICO);
      const total = (await ist.readAllRows()).length;
      await ist.setSelectAll(true);
      const all = (await ist.readAllRows()).filter((r) => r.selected).length;
      await ist.deselectRows([(await ist.readAllRows())[0]!.taxType]);
      const headerAfterOne = await ist.getSelectAllState();
      await ist.setSelectAll(true);
      const again = (await ist.readAllRows()).filter((r) => r.selected).length;
      await attachNote('Header aria-checked with one row cleared', String(headerAfterOne));
      await verify('All rows selected, header untick on partial selection, all again from the header', async () => {
        expect(all).toBe(total);
        expect(headerAfterOne).not.toBe('true');
        expect(again).toBe(total);
      });
    });

    test('TC-TAX-IST-071: Apply with no selection shows the approved feedback', { tag: ['@C107439', '@needs-confirmation'] }, async () => {
      await about('With no row selected, Apply is disabled — even with a Rate typed — so there is nothing to click and no message is needed; selecting a row enables it.');
      await ist.open(IST_OFFICE);
      await ist.search(IST_MEXICO);
      await ist.setUpdateRate('7.25');
      const withoutSelection = await ist.isApplyEnabled();
      await ist.selectRows([(await ist.readAllRows())[0]!.taxType]);
      await verify('Apply disabled with no selection, enabled once a row is selected', async () => {
        expect(withoutSelection).toBe(false);
        expect(await ist.isApplyEnabled()).toBe(true);
      });
    });

    test('TC-TAX-IST-072: Rate minimum, maximum, precision and rounding rules are enforced', { tag: ['@C107440', '@needs-confirmation'] }, async () => {
      await about('The Rate box accepts only a non-negative number: letters and the minus sign never enter it, and an oversized value is held to the maximum. (Observed maximum and precision are recorded, not invented.)');
      await ist.open(IST_OFFICE);
      const results: Record<string, string> = {};
      for (const typed of ['abc', '-5', '150', '99999999', '1.23456', '0.0001']) {
        await ist.setUpdateRate(typed);
        await ist.rateField().press('Tab');
        results[typed] = await ist.getUpdateRate();
      }
      await attachNote('Rate box: typed → kept', JSON.stringify(results, null, 2));
      await verify('Only non-negative numbers are kept, and oversized values are capped at 100', async () => {
        expect(results.abc).toBe('');
        for (const v of Object.values(results)) expect(v === '' || /^\d+(\.\d+)?$/.test(v), v).toBe(true);
        expect(Number(results['150'])).toBeLessThanOrEqual(100);
        expect(Number(results['99999999'])).toBeLessThanOrEqual(100);
      });
    });

    test('TC-TAX-IST-073: Blank update fields follow the approved partial-update contract', { tag: ['@C107441', '@needs-confirmation'] }, async () => {
      await about('Apply writes every update field onto the selected rows: leaving "Is Commission Taxable?" unticked clears the flag on a row that had it.');
      await ist.open(IST_OFFICE);
      await ist.search(IST_MEXICO);
      const row = (await ist.readAllRows()).find((r) => r.commissionTaxable);
      test.skip(!row, 'No row has commission taxable set in this combination');
      await ist.setCommissionTaxable(false);
      await ist.stage([row!.taxType], { rate: row!.rate ?? 0, date: SAFE_NEW_DATE });
      await verify('The unticked box was applied as "not taxable"', async () => {
        expect((await ist.getRow(row!.taxType))!.commissionTaxable).toBe(false);
      });
    });

    test('TC-TAX-IST-074: Edit rights follow the approved office scope', { tag: ['@C107442', '@needs-confirmation'] }, async () => {
      await about('Editing is not limited to the corporate office: from office 2359 a full-access user gets the same results and can select rows and Apply.');
      await ist.open('2359');
      await ist.search(IST_MEXICO);
      const rows = await ist.readAllRows();
      await ist.selectRows([rows[0]!.taxType]);
      await verify('Rows are listed, every checkbox is usable and Apply is enabled', async () => {
        expect(rows.length).toBeGreaterThan(0);
        const boxes = await ist.countRowCheckboxes();
        expect(boxes.enabled).toBe(boxes.total);
        expect(await ist.isApplyEnabled()).toBe(true);
      });
    });
  });
});
