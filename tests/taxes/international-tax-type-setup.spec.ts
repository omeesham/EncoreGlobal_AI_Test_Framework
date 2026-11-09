import { test, expect } from '../../src/fixtures/pages.fixture';
import { InternationalTaxTypeSetupPage, addDays } from '../../src/pages/taxes/international-tax-type-setup.page';
import { phase, verify, about, attachNote } from '../../src/fixtures/report-steps';
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
  LATEST_AS_OF,
  REG_MAX,
  ALERT,
  SAVE_ROWS,
  TYPE_ROW,
  REG_PREFIX,
  TypeKind,
} from '../../src/data/taxes/international-tax-type-setup';

// Tax → International Tax Type Setup (NM-4026): the GOV and Provincial tax types and Reg. Numbers of each
// province, by effective date. Covered: opening the page, the search, the grid, the search date, field
// validation, the required Reg. Number, the unsaved-changes guard, saving and a user in a US time zone. The
// save cases write real E2E data and put it back.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const USER_REG = (tag: string) => `${REG_PREFIX}-${tag}-${Date.now()}`;
const REG_COLUMN = { gov: 'GOV Tax Reg. Number', provincial: 'Provincial Tax Reg. Number' } as const;

type SaveRow = { readonly country: string; readonly province: string; readonly kind: TypeKind; readonly reg: string };

/** MM/DD/YYYY → the midnight-UTC timestamp a save sends. */
const wireDate = (mmddyyyy: string) => {
  const [m, d, y] = mmddyyyy.split('/');
  return `${y}-${m}-${d}T00:00:00.000Z`;
};

const US_ZONE = 'America/New_York';
const TYPED = '01/15/2030';

test.describe.configure({ timeout: 180_000 });

test.describe('International Tax Type Setup @taxes', () => {
  let its: InternationalTaxTypeSetupPage;

  // Opening the page, the search criteria and the results grid. Nothing here saves.
  test.describe('A. Page load', () => {
    test.beforeEach(async ({ authenticatedSession, config }) => {
      its = new InternationalTaxTypeSetupPage(authenticatedSession.page, config);
    });

    for (const office of ITS_OFFICES) {
      test.describe(officeLabel(office), () => {
        test(`TC-TAX-ITT-005: International Tax Type Setup opens from the Tax menu with its defaults`, { tag: '@C107639' }, async () => {
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
      });
    }

    test('TC-TAX-ITT-001: The information icon explains the page', { tag: '@C107635' }, async () => {
      await about('Hovering the (i) beside the heading shows what the page is for.');
      await its.open(EDIT_OFFICE);
      await verify('Tooltip text', async () => {
        expect(await its.getInfoTooltip()).toBe(TEXT.info);
      });
    });

    test('TC-TAX-ITT-002: The grid shows the six tax type columns', { tag: '@C107636' }, async () => {
      await about('The grid and its Grid Options list the same six columns, all shown.');
      await its.open(EDIT_OFFICE);
      await verify('Column headers in order', async () => {
        expect(await its.getHeaders()).toEqual([...COLUMNS]);
      });
      await verify('Grid Options lists every column, ticked', async () => {
        expect(await its.getGridOptionColumns()).toEqual(COLUMNS.map((label) => ({ label, checked: true })));
      });
    });

    test('TC-TAX-ITT-003: Without a session the page sends the user to sign in', { tag: '@C107637' }, async ({ browser, config }) => {
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

    test('TC-TAX-ITT-004: The search panel works from the keyboard', { tag: '@C107638' }, async () => {
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
  });

  test.describe('B. Search', () => {
    test.beforeEach(async ({ authenticatedSession, config }) => {
      its = new InternationalTaxTypeSetupPage(authenticatedSession.page, config);
    });

    for (const office of ITS_OFFICES) {
      test.describe(officeLabel(office), () => {
        test(`TC-TAX-ITT-011: Searching Mexico lists one row per Mexican state`, { tag: '@C107645' }, async () => {
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
      });
    }

    test('TC-TAX-ITT-006: Country offers Mexico, Canada and Bahamas', { tag: '@C107640' }, async () => {
      await about('The Country filter lists the three countries with international tax types.');
      await its.open(EDIT_OFFICE);
      await verify('Country options', async () => {
        expect(await its.getCountryOptions()).toEqual([...COUNTRIES]);
      });
    });

    test('TC-TAX-ITT-007: Searching Canada and Bahamas lists their own provinces', { tag: '@C107641' }, async () => {
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

    test('TC-TAX-ITT-008: Search needs a valid Effective Date', { tag: '@C107642' }, async () => {
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

    test('TC-TAX-ITT-009: Reset restores the criteria and clears the grid', { tag: '@C107643' }, async () => {
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

    test('TC-TAX-ITT-010: The search panel collapses and expands', { tag: '@C107644' }, async () => {
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
  });

  test.describe('C. Grid', () => {
    test.beforeEach(async ({ authenticatedSession, config }) => {
      its = new InternationalTaxTypeSetupPage(authenticatedSession.page, config);
    });

    test('TC-TAX-ITT-012: Sorting a column reorders the rows both ways', { tag: '@C107646' }, async () => {
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

    test('TC-TAX-ITT-013: A hidden column comes back with Reset to Default View', { tag: '@C107647' }, async () => {
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

    test("TC-TAX-ITT-014: A row's tax type pickers offer its country's types", { tag: '@C107648' }, async () => {
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

    test('TC-TAX-ITT-015: Bahamas has no tax types to pick', { tag: '@C107649' }, async () => {
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

    test('TC-TAX-ITT-016: Sorting by GOV Tax Type Name groups the rows by type', { tag: '@C107650' }, async () => {
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
    test('TC-TAX-ITT-017: Sorting by Effective Date orders the rows by date', { tag: '@C107651' }, async ({ utcPage, config }) => {
      test.fail(true, 'BUG-TAX-ITT-002: Sort ascending/descending on Effective Date leaves the rows in Province order');
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

    test('TC-TAX-ITT-018: A moved column stays moved until Reset to Default View', { tag: '@C107652' }, async () => {
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

    test('TC-TAX-ITT-019: A column can be widened by dragging its edge', { tag: '@C107653' }, async () => {
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
  test.describe('D. Search date', () => {
    test('TC-TAX-ITT-020: The search date shows the record in effect on that day', { tag: '@C107654' }, async ({ utcPage, config }) => {
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

  // Row validation and the unsaved-changes guard. Nothing here saves. The suite runs in America/New_York
  // (playwright.config.ts); these cases read and set Effective Dates, so they run on a UTC page (utcPage),
  // where the page shows dates as stored.
  test.describe('E. Field validation', () => {
    test.beforeEach(async ({ utcPage, config }) => {
      its = new InternationalTaxTypeSetupPage(utcPage, config);
      await its.open(EDIT_OFFICE);
    });

    test('TC-TAX-ITT-021: A tax type picked on an empty row asks for a Reg. Number and an Effective Date', { tag: '@C107655' }, async () => {
      await about('Picking IVA on a Mexican state with no tax type adds a Reg. Number field, marks the Effective Date required and keeps Save off.');
      const row = await its.findEmptyRow('Mexico', LATEST_AS_OF);
      await verify('Before: no Reg. Number field', async () => {
        expect(await its.hasRegInput(row, 'gov')).toBe(false);
      });
      await its.pickType(row, 'gov', 'IVA');
      await verify('IVA set; Reg. Number offered; date Required; Save disabled', async () => {
        expect(await its.readRow(row)).toMatchObject({ 'GOV Tax Type Name': 'IVA', 'Effective Date': '' });
        expect(await its.hasRegInput(row, 'gov')).toBe(true);
        expect(await its.getRowAlert(row)).toBe(ALERT.required);
        expect(await its.isSaveEnabled()).toBe(false);
      });
    });

    test('TC-TAX-ITT-022: An impossible Effective Date is flagged and cannot be saved', { tag: '@C107656' }, async () => {
      await about('A date that does not exist stays as typed, is flagged Invalid date and keeps Save off.');
      const row = await its.findEmptyRow('Mexico', LATEST_AS_OF);
      await its.pickType(row, 'gov', 'IVA');
      const shown = await its.editDate(row, '13/45/2026');
      await verify('Invalid date; Save disabled', async () => {
        expect(shown).toBe('13/45/2026');
        expect(await its.getRowAlert(row)).toBe(ALERT.invalidDate);
        expect(await its.isSaveEnabled()).toBe(false);
      });
    });

    test('TC-TAX-ITT-023: A changed Reg. Number needs a new Effective Date', { tag: '@C107657' }, async () => {
      await about('Changing the GOV Reg. Number of a record while keeping its date is flagged and cannot be saved.');
      const row = await its.findRow('Canada', ROW.edit, LATEST_AS_OF);
      const before = await its.readRow(row);
      await its.editReg(row, 'gov', `${before['GOV Tax Reg. Number']}9`);
      await verify('New date needed; Save disabled', async () => {
        expect(await its.getRowAlert(row)).toBe(ALERT.newDateNeeded);
        expect(await its.isSaveEnabled()).toBe(false);
      });
    });

    test("TC-TAX-ITT-024: The new Effective Date must come after the record's date", { tag: '@C107658' }, async () => {
      await about('With a changed Reg. Number, a date before the current record is refused, the same date asks for a new one, and the next day is accepted.');
      const row = await its.findRow('Canada', ROW.edit, LATEST_AS_OF);
      const before = await its.readRow(row);
      const current = before['Effective Date']!;
      await its.editReg(row, 'gov', `${before['GOV Tax Reg. Number']}9`);
      await its.editDate(row, addDays(current, -1));
      await verify(`The day before (${addDays(current, -1)}): must be after ${current}`, async () => {
        expect(await its.getRowAlert(row)).toBe(ALERT.dateAfter(current));
        expect(await its.isSaveEnabled()).toBe(false);
      });
      await its.editDate(row, current);
      await verify(`The same day (${current}): a new date is needed`, async () => {
        expect(await its.getRowAlert(row)).toBe(ALERT.newDateNeeded);
        expect(await its.isSaveEnabled()).toBe(false);
      });
      await its.editDate(row, addDays(current, 1));
      await verify(`The next day (${addDays(current, 1)}): valid, Save enabled`, async () => {
        expect(await its.getRowAlert(row)).toBeNull();
        expect(await its.isSaveEnabled()).toBe(true);
      });
    });

    test('TC-TAX-ITT-025: Removing a Provincial tax type needs a new Effective Date', { tag: '@C107659' }, async () => {
      await about(`Setting ${ROW.withProvincial}'s Provincial type to blank removes its Reg. Number field and, like any type change, needs a new date.`);
      const row = await its.findRow('Canada', ROW.withProvincial, LATEST_AS_OF);
      await its.pickType(row, 'provincial', '');
      await verify('Provincial type and Reg. Number gone; new date needed; Save disabled', async () => {
        expect(await its.readRow(row)).toMatchObject({ 'Provincial Tax Type Name': '', 'Provincial Tax Reg. Number': '' });
        expect(await its.hasRegInput(row, 'provincial')).toBe(false);
        expect(await its.getRowAlert(row)).toBe(ALERT.newDateNeeded);
        expect(await its.isSaveEnabled()).toBe(false);
      });
    });

    test('TC-TAX-ITT-026: Reg. Number takes up to 100 characters, trims blanks and keeps markup as text', { tag: '@C107660' }, async () => {
      await about('The Reg. Number field is limited to 100 characters, a value of spaces becomes empty, and markup is kept as plain text.');
      const row = await its.findRow('Canada', ROW.edit, LATEST_AS_OF);
      await verify(`Maximum length ${REG_MAX}`, async () => {
        expect(await its.regMaxLength(row, 'gov')).toBe(REG_MAX);
      });
      await verify('Spaces only become empty', async () => {
        expect(await its.editReg(row, 'gov', '   ')).toBe('');
      });
      await verify('Markup is kept as typed and not rendered', async () => {
        expect(await its.editReg(row, 'gov', '<b>x</b>')).toBe('<b>x</b>');
        await expect(row.locator('b')).toHaveCount(0);
      });
    });

    test('TC-TAX-ITT-027: Typed and calendar-picked Effective Dates are kept as entered', { tag: '@C107661' }, async () => {
      await about('A typed date stays the same after leaving the field, and a day picked in the calendar is the day shown in the cell.');
      const row = await its.findEmptyRow('Mexico', LATEST_AS_OF);
      await its.pickType(row, 'gov', 'IVA');
      await verify('Typed 01/15/2030 stays 01/15/2030', async () => {
        expect(await its.editDate(row, '01/15/2030')).toBe('01/15/2030');
      });
      const picked = await phase('Pick the 20th in the calendar', () => its.pickCalendarDay(row, 20));
      await verify('The cell shows the 20th of the month the calendar showed', async () => {
        const [month, year] = picked.shownMonth.split(' ');
        expect(picked.value).toBe(`${String(MONTHS.indexOf(month!) + 1).padStart(2, '0')}/20/${year}`);
      });
    });
  });

  test.describe('F. Reg. Number required', () => {
    test.beforeEach(async ({ utcPage, config }) => {
      its = new InternationalTaxTypeSetupPage(utcPage, config);
      await its.open(EDIT_OFFICE);
    });

    test('TC-TAX-ITT-028: A Provincial tax type needs its Reg. Number', { tag: '@C107662' }, async () => {
      await about(`Adding PST to ${ROW.noProvincial} with a new date but no Provincial Reg. Number is flagged and cannot be saved.`);
      const row = await its.findRow('Canada', ROW.noProvincial, LATEST_AS_OF);
      const date = (await its.readRow(row))['Effective Date']!;
      await its.pickType(row, 'provincial', 'PST');
      await its.editDate(row, addDays(date, 1));
      await verify('Provincial Reg. Number required; Save disabled', async () => {
        expect(await its.getRowMessages(row)).toEqual([ALERT.provincialRegRequired]);
        expect(await its.isSaveEnabled()).toBe(false);
      });
    });

    test('TC-TAX-ITT-029: A GOV tax type needs its Reg. Number', { tag: '@C107663' }, async () => {
      test.fail(true, 'BUG-TAX-ITT-003: a GOV tax type with no GOV Reg. Number is not flagged and can be saved');
      await about('Like a Provincial type, a GOV type picked on an empty state with a valid date but no GOV Reg. Number is flagged and cannot be saved.');
      const row = await its.findEmptyRow('Mexico', LATEST_AS_OF);
      await its.pickType(row, 'gov', 'IVA');
      await its.editDate(row, '01/15/2030');
      await verify('GOV Reg. Number required; Save disabled', async () => {
        expect(await its.getRowMessages(row)).toEqual([ALERT.govRegRequired]);
        expect(await its.isSaveEnabled()).toBe(false);
      });
    });
  });

  test.describe('G. Unsaved changes', () => {
    let original: string;
    const edited = 'ZZ-ITS-UNSAVED';

    test.beforeEach(async ({ utcPage, config }) => {
      its = new InternationalTaxTypeSetupPage(utcPage, config);
      await its.open(EDIT_OFFICE);
      const row = await its.findRow('Canada', ROW.edit, LATEST_AS_OF);
      original = (await its.readRow(row))['GOV Tax Reg. Number']!;
      await its.editReg(row, 'gov', edited);
    });

    const regNow = async () => (await its.readRow(its.row(ROW.edit)))['GOV Tax Reg. Number'];

    test('TC-TAX-ITT-030: Searching with unsaved changes asks first; Stay keeps them', { tag: '@C107664' }, async () => {
      await about('Search with an edited row opens the Unsaved changes dialog; Stay closes it and keeps the edit.');
      await its.clickSearch();
      await verify('The dialog warns that changes will be lost', async () => {
        expect(await its.getUnsavedDialogText()).toBe(`${TEXT.unsavedTitle} ${TEXT.unsavedBody} Stay Discard`);
      });
      await its.stay();
      await verify('The edit is still there', async () => {
        expect(await regNow()).toBe(edited);
      });
    });

    test('TC-TAX-ITT-031: Discard drops the changes and runs the search', { tag: '@C107665' }, async () => {
      await about('Discard in the Unsaved changes dialog searches again, which puts the stored value back.');
      await its.clickSearch();
      await its.discard();
      await verify('The stored Reg. Number is back', async () => {
        expect(await regNow()).toBe(original);
      });
    });

    test('TC-TAX-ITT-032: Reset with unsaved changes asks first', { tag: '@C107666' }, async () => {
      await about('Reset with an edited row opens the Unsaved changes dialog; Stay keeps the criteria and the edit.');
      await its.reset();
      await its.getUnsavedDialogText();
      await its.stay();
      await verify('Rows and the edit are still there', async () => {
        expect(await its.getCount()).toBeGreaterThan(0);
        expect(await regNow()).toBe(edited);
      });
    });

    test('TC-TAX-ITT-033: Changing the country with unsaved changes asks first', { tag: '@C107667' }, async () => {
      await about('Picking another country with an edited row opens the Unsaved changes dialog; Stay keeps Canada and the edit.');
      await its.selectCountry('Mexico');
      await its.getUnsavedDialogText();
      await its.stay();
      await verify('Still Canada, edit kept', async () => {
        expect((await its.getCriteria()).country).toBe('Canada');
        expect(await regNow()).toBe(edited);
      });
    });

    test('TC-TAX-ITT-034: Leaving the page with unsaved changes asks first', { tag: '@C107668' }, async () => {
      await about('Clicking Home in the sidebar with an edited row opens the Unsaved changes dialog; Stay keeps the page and the edit.');
      await its.clickSidebarHome();
      await its.getUnsavedDialogText();
      await its.stay();
      await verify('Still on the page with the edit', async () => {
        expect(its.page.url()).toContain('/taxes/international-tax-type-setup');
        expect(await regNow()).toBe(edited);
      });
    });

    test('TC-TAX-ITT-035: Reloading with unsaved changes raises the browser leave-page prompt', { tag: '@C107669' }, async () => {
      await about("Reloading the browser page with an edited row makes the browser ask before leaving (its own 'Leave site?' prompt).");
      const asked: string[] = [];
      its.page.on('dialog', (d) => asked.push(d.type()));
      await its.reload();
      await verify('The browser asked before leaving', async () => {
        expect(asked).toContain('beforeunload');
      });
    });
  });

  // Saving. These cases write real E2E data on company-wide rows and put it back afterwards. A new Reg.
  // Number needs a new effective date and is added as a new record; records cannot be deleted, so the
  // original number is put back by one more record dated a day later — each run moves those rows' latest date
  // two days on. The page shows dates as stored only in UTC, so this runs on a UTC page (utcPage).
  test.describe('H. Save', () => {
    test.describe.configure({ timeout: 300_000 });

    test.beforeEach(async ({ utcPage, config }) => {
      its = new InternationalTaxTypeSetupPage(utcPage, config);
    });

    /** Lists a country's latest records and returns each row's latest effective date. */
    async function openLatest(country: string, provinces: string[]): Promise<Record<string, string>> {
      await its.open(EDIT_OFFICE);
      await its.selectCountry(country);
      await its.setSearchDate(LATEST_AS_OF);
      await its.search();
      const dates: Record<string, string> = {};
      for (const p of provinces) dates[p] = (await its.readRow(its.row(p)))['Effective Date']!;
      return dates;
    }

    /** Gives each row a Reg. Number from the day after its latest record. */
    async function editRows(rows: readonly SaveRow[], regs: string[], latest: Record<string, string>): Promise<void> {
      for (const [i, r] of rows.entries()) {
        const row = its.row(r.province);
        await its.editReg(row, r.kind, regs[i]!);
        await its.editDate(row, addDays(latest[r.province]!, 1));
      }
    }

    /** Puts back each row's original Reg. Number where the latest record no longer has it. */
    async function restore(rows: readonly SaveRow[]): Promise<void> {
      const latest = await openLatest(rows[0]!.country, rows.map((r) => r.province));
      const changed: SaveRow[] = [];
      for (const r of rows) if ((await its.readRow(its.row(r.province)))[REG_COLUMN[r.kind]] !== r.reg) changed.push(r);
      if (!changed.length) return;
      await editRows(changed, changed.map((r) => r.reg), latest);
      expect((await its.save()).toast, 'restoring the original Reg. Numbers').toBe(TEXT.saved);
    }

    /** Puts Yukon back to GST with no Provincial type, by one more record dated a day later. */
    async function restoreTypeRow(): Promise<void> {
      await openLatest(TYPE_ROW.country, [TYPE_ROW.province]);
      const row = its.row(TYPE_ROW.province);
      const now = await its.readRow(row);
      if (now['GOV Tax Type Name'] === TYPE_ROW.gov && now['Provincial Tax Type Name'] === '') return;
      if (now['GOV Tax Type Name'] !== TYPE_ROW.gov) await its.pickType(row, 'gov', TYPE_ROW.gov);
      if (now['Provincial Tax Type Name'] !== '') await its.pickType(row, 'provincial', '');
      await its.editDate(row, addDays(now['Effective Date']!, 1));
      expect((await its.save()).toast, `restoring ${TYPE_ROW.province}`).toBe(TEXT.saved);
    }

    test('TC-TAX-ITT-036: A new GOV Reg. Number is saved as a new record from its effective date', { tag: '@C107670' }, async () => {
      await about(
        'Saving a new Reg. Number from the day after the latest record sends only that row and adds a record: the new ' +
          'number applies from that day, and the earlier record still applies before it.',
      );
      const r = SAVE_ROWS.mexico;
      const latest = await openLatest(r.country, [r.province]);
      const latestDate = latest[r.province]!;
      const newDate = addDays(latestDate, 1);
      const reg = USER_REG('MX');
      await attachNote('Dates', `latest record ${latestDate}; new record ${newDate}; restore record ${addDays(latestDate, 2)}`);
      try {
        await editRows([r], [reg], latest);
        const result = await phase('Save', () => its.save());
        await verify('Saved; only this row was sent, dated midnight UTC; Save is off again', async () => {
          expect(result.toast).toBe(TEXT.saved);
          expect(result.ok).toBe(true);
          expect(result.records).toHaveLength(1);
          expect(result.records[0]).toMatchObject({
            countryName: r.country,
            countrySubDivisionName: r.province,
            govTaxTypeName: 'IVA',
            govTaxRegNumber: reg,
            effectiveDate: wireDate(newDate),
          });
          expect(await its.isSaveEnabled()).toBe(false);
        });
        await verify(`As of ${newDate}: the new number`, async () => {
          expect(await its.readRow(await its.findRow(r.country, r.province, newDate))).toMatchObject({
            'GOV Tax Reg. Number': reg,
            'Effective Date': newDate,
          });
        });
        await verify(`As of ${latestDate}: the earlier record, unchanged`, async () => {
          expect(await its.readRow(await its.findRow(r.country, r.province, latestDate))).toMatchObject({
            'GOV Tax Reg. Number': r.reg,
            'Effective Date': latestDate,
          });
        });
      } finally {
        await restore([r]);
      }
    });

    test('TC-TAX-ITT-037: Provincial Reg. Numbers on two rows are saved together', { tag: '@C107671' }, async () => {
      await about("New Provincial Reg. Numbers typed on Alberta and Quebec are both sent and stored by one Save.");
      const rows = SAVE_ROWS.canada;
      const latest = await openLatest('Canada', rows.map((r) => r.province));
      const regs = rows.map((r) => USER_REG(r.province.slice(0, 2).toUpperCase()));
      try {
        await editRows(rows, regs, latest);
        const result = await phase('Save once', () => its.save());
        await verify('Saved; both rows were sent', async () => {
          expect(result.toast).toBe(TEXT.saved);
          expect(result.records.map((x) => [x.countrySubDivisionName, x.provincialTaxRegNumber])).toEqual(
            rows.map((r, i) => [r.province, regs[i]]),
          );
        });
        await openLatest('Canada', rows.map((r) => r.province));
        await verify('Both rows show their new number from the next day', async () => {
          for (const [i, r] of rows.entries()) {
            expect(await its.readRow(its.row(r.province))).toMatchObject({
              'Provincial Tax Reg. Number': regs[i],
              'Effective Date': addDays(latest[r.province]!, 1),
            });
          }
        });
      } finally {
        await restore(rows);
      }
    });
    test('TC-TAX-ITT-038: A changed GOV tax type is saved as a new record', { tag: '@C107672' }, async () => {
      await about(`Switching ${TYPE_ROW.province} from ${TYPE_ROW.gov} to ${TYPE_ROW.otherGov} with the next day saves a new record; the earlier record keeps ${TYPE_ROW.gov}.`);
      const latest = await openLatest(TYPE_ROW.country, [TYPE_ROW.province]);
      const latestDate = latest[TYPE_ROW.province]!;
      const newDate = addDays(latestDate, 1);
      try {
        const row = its.row(TYPE_ROW.province);
        await its.pickType(row, 'gov', TYPE_ROW.otherGov);
        await its.editDate(row, newDate);
        const result = await phase('Save', () => its.save());
        await verify(`Saved; the record sent has ${TYPE_ROW.otherGov} from ${newDate}`, async () => {
          expect(result.toast).toBe(TEXT.saved);
          expect(result.records).toHaveLength(1);
          expect(result.records[0]).toMatchObject({ countrySubDivisionName: TYPE_ROW.province, govTaxTypeName: TYPE_ROW.otherGov, effectiveDate: wireDate(newDate) });
        });
        await verify(`As of ${newDate}: ${TYPE_ROW.otherGov}; as of ${latestDate}: ${TYPE_ROW.gov}`, async () => {
          expect((await its.readRow(await its.findRow(TYPE_ROW.country, TYPE_ROW.province, newDate)))['GOV Tax Type Name']).toBe(TYPE_ROW.otherGov);
          expect((await its.readRow(await its.findRow(TYPE_ROW.country, TYPE_ROW.province, latestDate)))['GOV Tax Type Name']).toBe(TYPE_ROW.gov);
        });
      } finally {
        await restoreTypeRow();
      }
    });

    test('TC-TAX-ITT-039: A Provincial tax type added with its Reg. Number is saved, and can be removed again', { tag: '@C107673' }, async () => {
      await about(`Adding ${TYPE_ROW.provincial} with a Reg. Number to ${TYPE_ROW.province} saves a new record; choosing the blank Provincial type with a later date removes it again.`);
      const latest = await openLatest(TYPE_ROW.country, [TYPE_ROW.province]);
      const newDate = addDays(latest[TYPE_ROW.province]!, 1);
      const reg = USER_REG('PST');
      try {
        const row = its.row(TYPE_ROW.province);
        await its.pickType(row, 'provincial', TYPE_ROW.provincial);
        await its.editReg(row, 'provincial', reg);
        await its.editDate(row, newDate);
        const result = await phase('Save', () => its.save());
        await verify(`Saved; the record sent has ${TYPE_ROW.provincial} ${reg}`, async () => {
          expect(result.toast).toBe(TEXT.saved);
          expect(result.records[0]).toMatchObject({ provincialTaxTypeName: TYPE_ROW.provincial, provincialTaxRegNumber: reg, effectiveDate: wireDate(newDate) });
        });
        await openLatest(TYPE_ROW.country, [TYPE_ROW.province]);
        await verify(`${TYPE_ROW.province} now has ${TYPE_ROW.provincial} ${reg}`, async () => {
          expect(await its.readRow(its.row(TYPE_ROW.province))).toMatchObject({
            'Provincial Tax Type Name': TYPE_ROW.provincial,
            'Provincial Tax Reg. Number': reg,
            'Effective Date': newDate,
          });
        });
      } finally {
        await restoreTypeRow();
      }
      await openLatest(TYPE_ROW.country, [TYPE_ROW.province]);
      await verify(`After removing it, ${TYPE_ROW.province} has no Provincial type`, async () => {
        expect(await its.readRow(its.row(TYPE_ROW.province))).toMatchObject({ 'Provincial Tax Type Name': '', 'Provincial Tax Reg. Number': '' });
      });
    });

    test('TC-TAX-ITT-040: Setting up a state with no tax type sends its new record', { tag: '@C107674' }, async () => {
      await about(
        'IVA, a Reg. Number and a date entered on a Mexican state with no tax type are sent as one new record and confirmed. ' +
          'A GOV type cannot be removed again, so the server reply is given in the browser and nothing is stored.',
      );
      await its.open(EDIT_OFFICE);
      const row = await its.findEmptyRow('Mexico', LATEST_AS_OF);
      const province = (await its.readRow(row)).Province!;
      const reg = USER_REG('NEW');
      const stopAnswering = await its.answerSavesWithSuccess();
      try {
        await its.pickType(row, 'gov', 'IVA');
        await its.editReg(row, 'gov', reg);
        await its.editDate(row, '01/15/2030');
        const result = await phase('Save', () => its.save());
        await verify(`Confirmed; one record for ${province}: IVA ${reg} from 01/15/2030`, async () => {
          expect(result.toast).toBe(TEXT.saved);
          expect(result.records).toHaveLength(1);
          expect(result.records[0]).toMatchObject({
            countryName: 'Mexico',
            countrySubDivisionName: province,
            govTaxTypeName: 'IVA',
            govTaxRegNumber: reg,
            effectiveDate: wireDate('01/15/2030'),
          });
          expect(await its.isSaveEnabled()).toBe(false);
        });
      } finally {
        await stopAnswering();
      }
      await verify(`Nothing was stored: ${province} still has no tax type`, async () => {
        expect((await its.readRow(await its.findRow('Mexico', province, LATEST_AS_OF)))['GOV Tax Type Name']).toBe('');
      });
    });

    test('TC-TAX-ITT-041: A failed save keeps the changes and says so', { tag: '@C107675' }, async () => {
      await about('When the server rejects a save, an error is shown, the edit stays on screen with Save enabled, and nothing is stored.');
      const r = SAVE_ROWS.canada[1];
      const latest = await openLatest(r.country, [r.province]);
      const reg = USER_REG('FAIL');
      const stopFailing = await its.failSaves();
      try {
        await editRows([r], [reg], latest);
        const result = await phase('Save while the server fails', () => its.save());
        await verify('Error message; the edit is kept and Save is still enabled', async () => {
          expect(result).toMatchObject({ ok: false, toast: TEXT.saveFailed });
          expect(await its.readRow(its.row(r.province))).toMatchObject({ 'Provincial Tax Reg. Number': reg });
          expect(await its.isSaveEnabled()).toBe(true);
        });
      } finally {
        await stopFailing();
      }
      await openLatest(r.country, [r.province]);
      await verify('After reopening, the row is as it was', async () => {
        expect(await its.readRow(its.row(r.province))).toMatchObject({
          'Provincial Tax Reg. Number': r.reg,
          'Effective Date': latest[r.province],
        });
      });
    });
  });

  // Effective Dates for a user in a US time zone. The suite's shared session runs in America/New_York
  // (playwright.config.ts), so these cases use it as is. Nothing here is stored: the save case answers the
  // save in the browser.
  test.describe('I. US time zone', () => {
    test.beforeEach(async ({ authenticatedSession, config }) => {
      its = new InternationalTaxTypeSetupPage(authenticatedSession.page, config);
      await its.open(EDIT_OFFICE);
      await verify(`The browser runs in ${US_ZONE}`, async () => {
        expect(await its.page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)).toBe(US_ZONE);
      });
    });

    test('TC-TAX-ITT-042: In a US time zone the search date picks the record in effect that day', { tag: '@C107676' }, async () => {
      await about(`Quebec's GST/QST record applies from ${QUEBEC_RECORD.since}: in US time, searching the day before shows none and that day shows it.`);
      const before = await its.readRow(await its.findRow('Canada', 'Quebec', QUEBEC_RECORD.dayBefore));
      const on = await its.readRow(await its.findRow('Canada', 'Quebec', QUEBEC_RECORD.since));
      await verify(`${QUEBEC_RECORD.dayBefore}: none; ${QUEBEC_RECORD.since}: GST and QST`, async () => {
        expect(before['GOV Tax Type Name']).toBe('');
        expect(on).toMatchObject({ 'GOV Tax Type Name': QUEBEC_RECORD.gov, 'Provincial Tax Type Name': QUEBEC_RECORD.provincial });
      });
    });

    test('TC-TAX-ITT-043: In a US time zone a stored Effective Date shows as stored', { tag: '@C107677' }, async () => {
      test.fail(true, 'BUG-TAX-ITT-001: in a US time zone Effective Dates shift a day or more earlier (stored 01/01/2000 shows 12/31/1999; typed 01/15/2030 becomes 01/13/2030; a save sends the day before)');
      await about(`Quebec's record is stored from ${QUEBEC_RECORD.since}; a US user sees that same date in the row.`);
      const row = await its.readRow(await its.findRow('Canada', 'Quebec', QUEBEC_RECORD.since));
      await verify(`The row shows ${QUEBEC_RECORD.since}`, async () => {
        expect(row['Effective Date']).toBe(QUEBEC_RECORD.since);
      });
    });

    test('TC-TAX-ITT-044: In a US time zone a typed Effective Date is kept as typed', { tag: '@C107678' }, async () => {
      test.fail(true, 'BUG-TAX-ITT-001: in a US time zone Effective Dates shift a day or more earlier (stored 01/01/2000 shows 12/31/1999; typed 01/15/2030 becomes 01/13/2030; a save sends the day before)');
      await about(`A US user who types ${TYPED} in a row's Effective Date still sees ${TYPED} after leaving the field.`);
      const row = await its.findEmptyRow('Mexico', LATEST_AS_OF);
      await its.pickType(row, 'gov', 'IVA');
      const shown = await its.editDate(row, TYPED);
      await verify(`The cell reads ${TYPED}`, async () => {
        expect(shown).toBe(TYPED);
      });
    });

    test('TC-TAX-ITT-045: In a US time zone a save sends the Effective Date as entered', { tag: '@C107679' }, async () => {
      test.fail(true, 'BUG-TAX-ITT-001: in a US time zone Effective Dates shift a day or more earlier (stored 01/01/2000 shows 12/31/1999; typed 01/15/2030 becomes 01/13/2030; a save sends the day before)');
      await about(
        `A US user who saves a new record from ${TYPED} sends that date. A GOV type cannot be removed once saved, so the ` +
          'server reply is given in the browser and nothing is stored.',
      );
      const row = await its.findEmptyRow('Mexico', LATEST_AS_OF);
      const stopAnswering = await its.answerSavesWithSuccess();
      try {
        await its.pickType(row, 'gov', 'IVA');
        await its.editReg(row, 'gov', 'ITS-AUTO-TZ');
        await its.editDate(row, TYPED);
        const result = await phase('Save', () => its.save());
        await verify(`The record sent is dated ${TYPED} (2030-01-15, midnight UTC)`, async () => {
          expect(result.toast).toBe(TEXT.saved);
          expect(result.records[0]).toMatchObject({ effectiveDate: '2030-01-15T00:00:00.000Z' });
        });
      } finally {
        await stopAnswering();
      }
    });

    test('TC-TAX-ITT-046: In a US time zone a day picked in the calendar is the day shown', { tag: '@C107680' }, async () => {
      test.fail(true, 'BUG-TAX-ITT-001: in a US time zone Effective Dates shift a day or more earlier (stored 01/01/2000 shows 12/31/1999; typed 01/15/2030 becomes 01/13/2030; a save sends the day before)');
      await about('A US user who picks the 20th in a row calendar sees the 20th of that month in the cell.');
      const row = await its.findEmptyRow('Mexico', LATEST_AS_OF);
      await its.pickType(row, 'gov', 'IVA');
      await its.editDate(row, TYPED);
      const picked = await phase('Pick the 20th in the calendar', () => its.pickCalendarDay(row, 20));
      await verify('The cell shows the 20th of the month the calendar showed', async () => {
        const [month, year] = picked.shownMonth.split(' ');
        const m = new Date(`1 ${month} ${year}`).getMonth() + 1;
        expect(picked.value).toBe(`${String(m).padStart(2, '0')}/20/${year}`);
      });
    });
  });
});
