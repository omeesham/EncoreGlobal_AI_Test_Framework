import { Locator } from '@playwright/test';
import { test, expect } from '../../src/fixtures/pages.fixture';
import { OrderOriginTaxPage, addDays, shortDate, GridRow } from '../../src/pages/taxes/order-origin-tax.page';
import { phase, verify, about, attachNote } from '../../src/fixtures/report-steps';
import {
  OOT_OFFICES,
  officeLabel,
  EDIT_OFFICE,
  ROW,
  VALIDATION_ROW_DATE,
  TEXT,
  COLUMNS,
  TAX_TYPES,
  FILTER_TAX_TYPE,
  LATEST_AS_OF,
  ALERT,
  TAX_INPUT,
  NOTES_MAX,
  NOTE_PREFIX,
  SAVE_ROW_RATE,
  HISTORY_RANGE_START,
} from '../../src/data/taxes/order-origin-tax';

// Tax → Order Origin Tax (NM-4020): the extra tax each location adds per tax type, by effective date, with a
// read-only History tab. Covered: opening the page, the search, the grid, field validation, effective dates
// and their limits, the unsaved-changes guard, saving, saving a new rate and the History tab. The save cases
// write real E2E data and put it back.

const ZERO = '0.000000';
const numbers = (values: string[]) => values.map(Number);

const DAY_AFTER = addDays(VALIDATION_ROW_DATE, 1);

const USER = process.env.NAVIGATOR_USERNAME ?? '';
const NEW_RATE = { typed: '5', shown: '0.050000' } as const;

/** The note to put back: a note these cases wrote is a leftover of an interrupted run, so it goes. */
const originalNote = (row: GridRow): string => (row.Notes?.startsWith(NOTE_PREFIX) ? '' : row.Notes ?? '');

const PAGE_SIZE = 50;
/** MM/DD/YYYY → comparable number. */
const dayNumber = (mmddyyyy: string) => {
  const [m, d, y] = mmddyyyy.split('/').map(Number) as [number, number, number];
  return y * 10_000 + m * 100 + d;
};

test.describe.configure({ timeout: 180_000 });

test.describe('Order Origin Tax @taxes', () => {
  let oot: OrderOriginTaxPage;

  // Opening the page, the Basic Information search criteria and the results grid. Nothing here saves.
  test.describe('A. Page load', () => {
    test.beforeEach(async ({ authenticatedSession, config }) => {
      oot = new OrderOriginTaxPage(authenticatedSession.page, config);
    });

    for (const office of OOT_OFFICES) {
      test.describe(officeLabel(office), () => {
        test(`TC-TAX-OOT-003: Order Origin Tax opens from the Tax menu`, { tag: '@C107596' }, async () => {
          await about('The Tax menu opens Order Origin Tax for the office, on the Basic Information tab.');
          await phase('Open the page from Tax > Order Origin Tax', () => oot.openFromTaxMenu(office.code));
          await verify('URL, browser title, heading and information text', async () => {
            expect(oot.page.url()).toContain(`/locations/${office.code}/taxes/order-origin-tax`);
            expect(await oot.getHeading()).toEqual({ heading: TEXT.header, title: TEXT.pageTitle });
            expect(await oot.getInfoTooltip()).toBe(TEXT.info);
          });
          await verify('Basic Information is the open tab; History is offered', async () => {
            await expect(oot.tab('basic')).toHaveAttribute('aria-selected', 'true');
            await expect(oot.tab('history')).toHaveAttribute('aria-selected', 'false');
          });
        });
      });
    }

    test('TC-TAX-OOT-001: Search criteria start at their defaults with an empty grid', { tag: '@C107594' }, async () => {
      await about('Before a search: all locations, all tax types, today, non-zero rates only, no rows and Save off.');
      await oot.open(EDIT_OFFICE);
      const today = await oot.browserToday();
      await verify('Criteria are All locations / All / today / ticked', async () => {
        expect(await oot.getCriteria()).toEqual({ location: TEXT.allLocations, taxType: TEXT.allTaxTypes, date: today, notEqualZero: true });
      });
      await verify('The grid is empty and asks for a search; Save is disabled', async () => {
        expect(await oot.getCount()).toBe(0);
        expect(await oot.isEmptyMessageVisible('basic')).toBe(true);
        expect(await oot.isSaveEnabled()).toBe(false);
      });
    });

    test('TC-TAX-OOT-002: The grid shows the twelve order origin tax columns', { tag: '@C107595' }, async () => {
      await about('The grid and its Grid Options list the same twelve columns, all shown.');
      await oot.open(EDIT_OFFICE);
      await verify('Column headers in order', async () => {
        expect(await oot.getHeaders()).toEqual([...COLUMNS]);
      });
      await verify('Grid Options lists every column, ticked', async () => {
        expect(await oot.getGridOptionColumns()).toEqual(COLUMNS.map((label) => ({ label, checked: true })));
      });
    });
  });

  test.describe('B. Search', () => {
    test.beforeEach(async ({ authenticatedSession, config }) => {
      oot = new OrderOriginTaxPage(authenticatedSession.page, config);
    });

    test('TC-TAX-OOT-004: Searching with the defaults lists non-zero rates of all locations', { tag: '@C107597' }, async () => {
      await about('The default search returns rows, and none of them has a zero Additional Tax.');
      await oot.open(EDIT_OFFICE);
      const count = await phase('Search with the default criteria', () => oot.search());
      await verify('Rows are found, from more than one location, all non-zero', async () => {
        expect(count).toBeGreaterThan(0);
        expect(new Set(await oot.readColumn('Location No')).size).toBeGreaterThan(1);
        expect(await oot.readColumn('Additional Tax')).not.toContain(ZERO);
      });
    });

    for (const office of OOT_OFFICES) {
      test.describe(officeLabel(office), () => {
        test(`TC-TAX-OOT-012: The Location filter lists only that office's rows`, { tag: '@C107605' }, async () => {
          await about('Choosing an office lists its own rows only: one per tax type, zero rates included.');
          await oot.open(office.code);
          await phase('Choose the office and include zero rates', async () => {
            await oot.selectLocation(office.code);
            await oot.setNotEqualZero(false);
          });
          const count = await phase('Search', () => oot.search());
          await verify(`One row per tax type, all for ${office.code}`, async () => {
            expect(count).toBe(TAX_TYPES.length);
            expect(new Set(await oot.readColumn('Location No'))).toEqual(new Set([office.code]));
            expect(TAX_TYPES).toEqual(expect.arrayContaining(await oot.readColumn('Tax Type')));
          });
        });
      });
    }

    test('TC-TAX-OOT-005: The Change Local Office dialog finds offices and needs one ticked', { tag: '@C107598' }, async () => {
      await about('The Location picker searches by number and name, enables Select only once an office is ticked, and Cancel changes nothing.');
      await oot.open(EDIT_OFFICE);
      await oot.openLocationDialog();
      await verify('The dialog is titled Change Local Office and Select starts disabled', async () => {
        await expect(oot.dialog()).toContainText(TEXT.dialogTitle);
        expect(await oot.isDialogSelectEnabled()).toBe(false);
      });
      await verify('Searching by number lists that office', async () => {
        expect(await oot.searchLocationDialog(EDIT_OFFICE)).toEqual([expect.stringContaining(EDIT_OFFICE)]);
      });
      await verify('Searching by name lists matching offices only', async () => {
        const rows = await oot.searchLocationDialog('Embassy Suites');
        expect(rows.length).toBeGreaterThan(0);
        expect(rows.join(' ')).toContain(EDIT_OFFICE);
      });
      await phase('Search the number again and tick it', async () => {
        await oot.searchLocationDialog(EDIT_OFFICE);
        await oot.tickDialogOffice(EDIT_OFFICE);
      });
      await verify('Select is enabled once an office is ticked', async () => {
        expect(await oot.isDialogSelectEnabled()).toBe(true);
      });
      await oot.cancelLocationDialog();
      await verify('Cancel leaves the filter on All locations', async () => {
        expect((await oot.getCriteria()).location).toBe(TEXT.allLocations);
      });
    });

    test('TC-TAX-OOT-006: The Tax Type filter offers every tax type and narrows the rows to one', { tag: '@C107599' }, async () => {
      await about('Tax Type lists All plus the forty tax types, and choosing one lists only that tax type.');
      await oot.open(EDIT_OFFICE);
      await verify('Options are All followed by the tax types', async () => {
        expect(await oot.getTaxTypeOptions()).toEqual([TEXT.allTaxTypes, ...TAX_TYPES]);
      });
      await oot.selectTaxType(FILTER_TAX_TYPE);
      const count = await phase(`Search ${FILTER_TAX_TYPE}`, () => oot.search());
      await verify(`Every row is ${FILTER_TAX_TYPE}`, async () => {
        expect(count).toBeGreaterThan(0);
        expect(new Set(await oot.readColumn('Tax Type'))).toEqual(new Set([FILTER_TAX_TYPE]));
      });
    });

    test('TC-TAX-OOT-007: Unticking "Percentage not equal to 0" adds the zero-rate rows', { tag: '@C107600' }, async () => {
      await about('Ticked, zero rates are left out; unticked, they are listed too.');
      await oot.open(EDIT_OFFICE);
      const nonZero = await phase('Search with the box ticked', () => oot.search());
      await oot.setNotEqualZero(false);
      const all = await phase('Search with the box unticked', () => oot.search());
      await verify('More rows with the box unticked', async () => {
        expect(all).toBeGreaterThan(nonZero);
      });
      await phase(`Narrow to office ${EDIT_OFFICE}, whose rows are all zero`, async () => {
        await oot.selectLocation(EDIT_OFFICE);
        await oot.search();
      });
      await verify('Zero-rate rows are listed', async () => {
        expect(await oot.readColumn('Additional Tax')).toContain(ZERO);
      });
    });

    test('TC-TAX-OOT-008: The Effective Date filter lists the rate in effect on that date', { tag: '@C107601' }, async () => {
      await about(`Office ${EDIT_OFFICE} ${ROW.validation} has one record, effective ${VALIDATION_ROW_DATE}: it is listed from that day, not the day before.`);
      await oot.open(EDIT_OFFICE);
      await phase('Choose the office and tax type, zero rates included', async () => {
        await oot.selectLocation(EDIT_OFFICE);
        await oot.selectTaxType(ROW.validation);
        await oot.setNotEqualZero(false);
      });
      await oot.setEffectiveDateFilter('12/31/1999');
      await verify('Day before the record: nothing listed', async () => {
        expect(await oot.search()).toBe(0);
      });
      await oot.setEffectiveDateFilter(VALIDATION_ROW_DATE);
      await verify('Day of the record: the record is listed', async () => {
        expect(await oot.search()).toBe(1);
        expect(await oot.readColumn('Tax Type')).toEqual([ROW.validation]);
      });
    });

    test('TC-TAX-OOT-009: An invalid or empty Effective Date filter blocks the search', { tag: '@C107602' }, async () => {
      await about('Search is disabled while the Effective Date is not a real date or is empty, and enabled again for a valid date.');
      await oot.open(EDIT_OFFICE);
      for (const value of ['13/40/2026', '']) {
        await oot.setEffectiveDateFilter(value);
        await verify(`Effective Date "${value}": Search disabled`, async () => {
          expect(await oot.isSearchEnabled()).toBe(false);
        });
      }
      await oot.setEffectiveDateFilter(VALIDATION_ROW_DATE);
      await verify('A valid date enables Search again', async () => {
        expect(await oot.isSearchEnabled()).toBe(true);
      });
    });

    test('TC-TAX-OOT-010: Reset restores the default criteria and clears the grid', { tag: '@C107603' }, async () => {
      await about('After changing every criterion and searching, Reset puts each back and empties the grid.');
      await oot.open(EDIT_OFFICE);
      const today = await oot.browserToday();
      await phase('Change every criterion and search', async () => {
        await oot.selectLocation(EDIT_OFFICE);
        await oot.selectTaxType(ROW.validation);
        await oot.setEffectiveDateFilter(VALIDATION_ROW_DATE);
        await oot.setNotEqualZero(false);
        await oot.search();
      });
      await oot.reset();
      await verify('Criteria are back to their defaults and the grid is empty', async () => {
        expect(await oot.getCriteria()).toEqual({ location: TEXT.allLocations, taxType: TEXT.allTaxTypes, date: today, notEqualZero: true });
        expect(await oot.getCount()).toBe(0);
        expect(await oot.isEmptyMessageVisible('basic')).toBe(true);
      });
    });

    test('TC-TAX-OOT-011: The last search criteria are kept when the page is reloaded', { tag: '@C107604' }, async () => {
      await about('The criteria of the last search are still set after a browser reload; the grid waits for a new search.');
      await oot.open(EDIT_OFFICE);
      await phase('Choose criteria and search', async () => {
        await oot.selectLocation(EDIT_OFFICE);
        await oot.selectTaxType(ROW.validation);
        await oot.setEffectiveDateFilter(VALIDATION_ROW_DATE);
        await oot.setNotEqualZero(false);
        await oot.search();
      });
      const searched = await oot.getCriteria();
      await oot.reload();
      await verify('The same criteria after reload, and an empty grid', async () => {
        expect(await oot.getCriteria()).toEqual(searched);
        expect(await oot.getCount()).toBe(0);
      });
      await verify('Searching again finds the same row', async () => {
        expect(await oot.search()).toBe(1);
      });
    });
  });

  test.describe('C. Grid', () => {
    test.beforeEach(async ({ authenticatedSession, config }) => {
      oot = new OrderOriginTaxPage(authenticatedSession.page, config);
    });

    test('TC-TAX-OOT-013: Results are sorted by Location No, newest first, and any column sorts both ways', { tag: '@C107606' }, async () => {
      await about('The default order is Location No descending; the header menu sorts a column ascending and descending.');
      await oot.open(EDIT_OFFICE);
      await oot.search();
      const desc = (v: number[]) => [...v].sort((a, b) => b - a);
      const asc = (v: number[]) => [...v].sort((a, b) => a - b);
      await verify('Location No is descending by default', async () => {
        const locations = numbers(await oot.readColumn('Location No'));
        expect(locations).toEqual(desc(locations));
      });
      await oot.sortBy('Additional Tax', 'ascending');
      await verify('Additional Tax ascending', async () => {
        const taxes = numbers(await oot.readColumn('Additional Tax'));
        expect(taxes).toEqual(asc(taxes));
      });
      await oot.sortBy('Additional Tax', 'descending');
      await verify('Additional Tax descending', async () => {
        const taxes = numbers(await oot.readColumn('Additional Tax'));
        expect(taxes).toEqual(desc(taxes));
      });
    });

    test('TC-TAX-OOT-014: A hidden column comes back with Reset to Default View', { tag: '@C107607' }, async () => {
      await about('Hide column removes a column and unticks it in Grid Options; Reset to Default View shows all twelve again.');
      await oot.open(EDIT_OFFICE);
      try {
        await oot.hideColumn('County');
        await verify('County is gone from the grid and unticked in Grid Options', async () => {
          expect(await oot.getHeaders()).toEqual(COLUMNS.filter((c) => c !== 'County'));
          expect(await oot.getGridOptionColumns()).toContainEqual({ label: 'County', checked: false });
        });
        await oot.resetGridView();
        await verify('All twelve columns are back, in order', async () => {
          expect(await oot.getHeaders()).toEqual([...COLUMNS]);
        });
      } finally {
        await oot.resetGridView().catch(() => {});
      }
    });

    test('TC-TAX-OOT-015: The search criteria panel collapses and expands', { tag: '@C107608' }, async () => {
      await about('Collapse filters hides the search criteria; Expand filters brings them back.');
      await oot.open(EDIT_OFFICE);
      await oot.collapseFilters();
      await verify('Search criteria hidden', async () => {
        await expect(oot.searchButton()).not.toBeInViewport();
      });
      await oot.expandFilters();
      await verify('Search criteria shown again', async () => {
        await expect(oot.searchButton()).toBeInViewport();
      });
    });
  });

  // Field validation of the editable cells — Additional Tax, Effective Date and Notes — and the
  // unsaved-changes guard, on each of the three offices. Nothing here saves: most cases work on the office's
  // "Audio Conferencing" row, whose only entry is effective 1/1/2000, and leave it unsaved. The suite runs in
  // America/New_York (playwright.config.ts). The cases that read or set an Effective Date run on a UTC page
  // (utcPage), where the page shows dates as stored.
  test.describe('D. Field validation', () => {
    for (const office of OOT_OFFICES) {
      test.describe(officeLabel(office), () => {
        let oot: OrderOriginTaxPage;
        let row: Locator;

        test.beforeEach(async ({ authenticatedSession, config }) => {
          oot = new OrderOriginTaxPage(authenticatedSession.page, config);
          await oot.open(office.code);
          row = await oot.findRow(office.code, ROW.validation);
        });

        test(`TC-TAX-OOT-016: Additional Tax reads whole numbers as percentages, caps at ±100 % and keeps six decimals`, { tag: '@C107609' }, async () => {
          await about('Each value typed into Additional Tax is shown, after leaving the field, as the stored fraction.');
          for (const { typed, shown, why } of TAX_INPUT) {
            await verify(`"${typed}" → ${shown} (${why})`, async () => {
              expect.soft(await oot.editTax(row, typed)).toBe(shown);
            });
          }
        });

        test(`TC-TAX-OOT-017: Letters cannot be typed into Additional Tax`, { tag: '@C107610' }, async () => {
          await about('Additional Tax is a number field: letters pressed after a valid rate change nothing.');
          await oot.editTax(row, '5');
          await verify('The rate is unchanged after pressing letters', async () => {
            expect(await oot.typeIntoTax(row, 'abc')).toBe('0.050000');
          });
        });

        test(`TC-TAX-OOT-018: A new rate without a new effective date is flagged and cannot be saved`, { tag: '@C107611' }, async () => {
          await about('Changing Additional Tax on its own marks the row and keeps Save disabled.');
          await oot.editTax(row, '5');
          await verify('Row message and Save state', async () => {
            expect(await oot.getRowAlert(row)).toBe(ALERT.newDateNeeded);
            expect(await oot.isSaveEnabled()).toBe(false);
          });
        });

        test(`TC-TAX-OOT-019: An emptied effective date is required`, { tag: '@C107612' }, async () => {
          await about('Clearing Effective Date marks the row as Required and keeps Save disabled.');
          await oot.editDate(row, '');
          await verify('Row message and Save state', async () => {
            expect(await oot.getRowAlert(row)).toBe(ALERT.required);
            expect(await oot.isSaveEnabled()).toBe(false);
          });
        });

        test(`TC-TAX-OOT-020: An effective date that is not a real date is flagged`, { tag: '@C107613' }, async () => {
          await about('A month and day that do not exist mark the row as Invalid date and keep Save disabled.');
          await oot.editDate(row, '13/45/2026');
          await verify('Row message and Save state', async () => {
            expect(await oot.getRowAlert(row)).toBe(ALERT.invalidDate);
            expect(await oot.isSaveEnabled()).toBe(false);
          });
        });

        test(`TC-TAX-OOT-021: Notes accept at most 500 characters`, { tag: '@C107614' }, async () => {
          await about('Typing more than 500 characters into Notes keeps the first 500.');
          const kept = await oot.editNotes(row, 'n'.repeat(NOTES_MAX + 1));
          await verify(`${NOTES_MAX} characters kept`, async () => {
            expect(kept).toHaveLength(NOTES_MAX);
          });
        });

        test(`TC-TAX-OOT-022: A notes-only change needs no new effective date`, { tag: '@C107615' }, async () => {
          await about('Changing only Notes leaves the row valid and enables Save.');
          await oot.editNotes(row, 'Validation note');
          await verify('No row message, Save enabled', async () => {
            expect(await oot.getRowAlert(row)).toBeNull();
            expect(await oot.isSaveEnabled()).toBe(true);
          });
        });

        test(`TC-TAX-OOT-023: Undoing an edit turns Save off again`, { tag: '@C107616' }, async () => {
          await about('Save follows real changes: typing a note enables it, and removing the note disables it again.');
          await oot.editNotes(row, 'Validation note');
          await verify('Save enabled after the change', async () => {
            expect(await oot.isSaveEnabled()).toBe(true);
          });
          await oot.editNotes(row, '');
          await verify('Save disabled once the row is back as it was', async () => {
            expect(await oot.isSaveEnabled()).toBe(false);
          });
        });
      });
    }
  });

  test.describe('E. Effective date', () => {
    for (const office of OOT_OFFICES) {
      test.describe(officeLabel(office), () => {
        let oot: OrderOriginTaxPage;
        let row: Locator;

        test.beforeEach(async ({ utcPage, config }) => {
          oot = new OrderOriginTaxPage(utcPage, config);
          await oot.open(office.code);
          row = await oot.findRow(office.code, ROW.validation);
        });

        test(`TC-TAX-OOT-024: An effective date picked from the calendar is set on the row`, { tag: '@C107617' }, async () => {
          await about(`Picking ${DAY_AFTER} in the cell calendar sets exactly that date, a valid change.`);
          const picked = await oot.pickDate(row, shortDate(DAY_AFTER));
          await verify(`The cell shows ${DAY_AFTER}, no row message, Save enabled`, async () => {
            expect(picked).toBe(DAY_AFTER);
            expect(await oot.getRowAlert(row)).toBeNull();
            expect(await oot.isSaveEnabled()).toBe(true);
          });
        });

        test(`TC-TAX-OOT-025: The effective date shows the stored date and keeps the date the user enters`, { tag: '@C107618' }, async () => {
          await about(
            `The record stored as ${VALIDATION_ROW_DATE} reads ${VALIDATION_ROW_DATE}, ` +
              'stays the same when the user clicks in and out of the cell, and keeps a typed date as typed.',
          );
          await verify(`Shown as ${VALIDATION_ROW_DATE}`, async () => {
            expect.soft(await oot.readRow(row)).toMatchObject({ 'Effective Date': VALIDATION_ROW_DATE });
          });
          await verify('Unchanged after clicking into the cell and out again', async () => {
            expect.soft(await oot.touchDate(row)).toBe(VALIDATION_ROW_DATE);
          });
          await verify(`A typed ${DAY_AFTER} stays ${DAY_AFTER}`, async () => {
            expect.soft(await oot.editDate(row, DAY_AFTER)).toBe(DAY_AFTER);
          });
        });
      });
    }
  });

  // The "after the latest record" rule needs a row with a real record; the offices' Audio Conferencing
  // rows only carry the 1/1/2000 starting entry, which takes any new date. The first row of a search as of
  // a far-future date is the latest record of some location and tax type; it is edited but never
  // saved. The table is company-wide, so this runs once, on a UTC page like the other date cases.
  test.describe('F. Effective date limits', () => {
    let oot: OrderOriginTaxPage;
    let row: Locator;
    let latest: string;

    test.beforeEach(async ({ utcPage, config }) => {
      oot = new OrderOriginTaxPage(utcPage, config);
      await oot.open(EDIT_OFFICE);
      await oot.setEffectiveDateFilter(LATEST_AS_OF);
      await oot.search();
      row = oot.firstRow();
      latest = (await oot.readRow(row))['Effective Date']!;
      await oot.editTax(row, '5');
    });

    test('TC-TAX-OOT-026: An effective date before the latest one is flagged and cannot be saved', { tag: '@C107619' }, async () => {
      await about("A new rate dated before the row's latest effective date is refused, quoting that date.");
      await oot.editDate(row, addDays(latest, -1));
      await verify(`Row message names ${latest}; Save disabled`, async () => {
        expect(await oot.getRowAlert(row)).toBe(ALERT.dateAfter(shortDate(latest)));
        expect(await oot.isSaveEnabled()).toBe(false);
      });
    });

    test('TC-TAX-OOT-027: The day after the latest effective date is accepted with a new rate', { tag: '@C107620' }, async () => {
      await about('The first valid date for a new rate is the day after the latest record: the row is valid and Save is enabled.');
      const dayAfter = addDays(latest, 1);
      const shown = await oot.editDate(row, dayAfter);
      await verify(`Date ${dayAfter} kept, no row message, Save enabled`, async () => {
        expect(shown).toBe(dayAfter);
        expect(await oot.getRowAlert(row)).toBeNull();
        expect(await oot.isSaveEnabled()).toBe(true);
      });
    });
  });

  test.describe('G. Unsaved changes', () => {
    for (const office of OOT_OFFICES) {
      test.describe(officeLabel(office), () => {
        let oot: OrderOriginTaxPage;
        let row: Locator;
        const NOTE = 'Unsaved note';

        test.beforeEach(async ({ authenticatedSession, config }) => {
          oot = new OrderOriginTaxPage(authenticatedSession.page, config);
          await oot.open(office.code);
          row = await oot.findRow(office.code, ROW.validation);
          await oot.editNotes(row, NOTE);
        });

        test(`TC-TAX-OOT-028: Switching tab with an unsaved edit asks first, and Stay keeps the edit`, { tag: '@C107621' }, async () => {
          await about('Opening the History tab with a pending edit shows the Unsaved changes dialog; Stay keeps the user and the edit where they were.');
          await oot.switchTab('history');
          await verify('Unsaved changes dialog with its warning', async () => {
            expect(await oot.getUnsavedDialogText()).toContain(`${TEXT.unsavedTitle} ${TEXT.unsavedBody}`);
          });
          await oot.stay();
          await verify('Still on Basic Information with the edit pending', async () => {
            await expect(oot.tab('basic')).toHaveAttribute('aria-selected', 'true');
            expect(await oot.readRow(row)).toMatchObject({ Notes: NOTE });
            expect(await oot.isSaveEnabled()).toBe(true);
          });
        });

        test(`TC-TAX-OOT-029: Discard drops the unsaved edit and opens the other tab`, { tag: '@C107622' }, async () => {
          await about('Discard in the Unsaved changes dialog leaves for History, and the edit is gone when the row is searched again.');
          await oot.switchTab('history');
          await oot.getUnsavedDialogText();
          await oot.discard();
          await verify('History is open', async () => {
            await expect(oot.tab('history')).toHaveAttribute('aria-selected', 'true');
          });
          await oot.switchTab('basic');
          row = await oot.findRow(office.code, ROW.validation);
          await verify('The row has no note', async () => {
            expect(await oot.readRow(row)).toMatchObject({ Notes: '' });
          });
        });

        test(`TC-TAX-OOT-030: Searching again with an unsaved edit asks first`, { tag: '@C107623' }, async () => {
          await about('Search with a pending edit shows the Unsaved changes dialog; Stay keeps the edit.');
          await oot.clickSearch();
          await verify('Unsaved changes dialog shown', async () => {
            expect(await oot.getUnsavedDialogText()).toContain(TEXT.unsavedTitle);
          });
          await oot.stay();
          await verify('The edit is still pending', async () => {
            expect(await oot.readRow(row)).toMatchObject({ Notes: NOTE });
            expect(await oot.isSaveEnabled()).toBe(true);
          });
        });

        test(`TC-TAX-OOT-031: Leaving the page with an unsaved edit asks first`, { tag: '@C107624' }, async () => {
          await about('Going to Home with a pending edit shows the Unsaved changes dialog; Stay keeps the user on Order Origin Tax.');
          await oot.clickSidebarHome();
          await verify('Unsaved changes dialog shown', async () => {
            expect(await oot.getUnsavedDialogText()).toContain(TEXT.unsavedTitle);
          });
          await oot.stay();
          await verify('Still on Order Origin Tax with the edit pending', async () => {
            expect(oot.page.url()).toContain('/taxes/order-origin-tax');
            expect(await oot.readRow(row)).toMatchObject({ Notes: NOTE });
          });
        });
      });
    }
  });

  // Saving, on each of the three offices. These cases write real E2E data on the office's own rows and put it
  // back afterwards. Notes are updated in place, so they are simply cleared again. A new rate with a new
  // effective date is added as a new record and records cannot be deleted, so the rate is put back by one
  // more record dated a day later — each run moves that row's latest date two days on.
  test.describe('H. Save', () => {
    test.describe.configure({ timeout: 300_000 });

    for (const office of OOT_OFFICES) {
      test.describe(officeLabel(office), () => {
        let oot: OrderOriginTaxPage;

        test.beforeEach(async ({ authenticatedSession, config }) => {
          oot = new OrderOriginTaxPage(authenticatedSession.page, config);
          await oot.open(office.code);
        });

        /**
         * Puts the notes of the given tax types back, one row at a time: the grid only renders the rows
         * in view, so each row is narrowed to with the Tax Type filter.
         */
        async function restoreNotes(original: Record<string, string>): Promise<void> {
          for (const [taxType, notes] of Object.entries(original)) {
            await oot.open(office.code);
            const row = await oot.findRow(office.code, taxType, LATEST_AS_OF);
            if ((await oot.readRow(row)).Notes === notes) continue;
            await oot.editNotes(row, notes);
            expect((await oot.save()).toast, `restoring the ${taxType} note`).toBe(TEXT.saved);
          }
        }

        test(`TC-TAX-OOT-032: A notes change is saved on the row and stamped with the user and time`, { tag: '@C107625' }, async () => {
          await about('Saving a new note keeps rate and date as they were, stores the note, and records who changed it and when.');
          const row = await oot.findRow(office.code, ROW.save, LATEST_AS_OF);
          const before = await oot.readRow(row);
          const note = `${NOTE_PREFIX} ${Date.now()}`;
          try {
            await oot.editNotes(row, note);
            const result = await phase('Save', () => oot.save());
            await verify('Saved message; Save is off again', async () => {
              expect(result).toEqual({ ok: true, toast: TEXT.saved });
              expect(await oot.isSaveEnabled()).toBe(false);
            });
            const today = await oot.browserToday();
            await oot.open(office.code);
            const after = await oot.readRow(await oot.findRow(office.code, ROW.save, LATEST_AS_OF));
            await verify('After reopening: the note, the user and today; rate and date unchanged', async () => {
              expect(after).toMatchObject({
                Notes: note,
                'Modified By': USER,
                'Additional Tax': before['Additional Tax'],
                'Effective Date': before['Effective Date'],
              });
              expect(after['Modified On']).toMatch(new RegExp(`^${today} `));
            });
          } finally {
            await restoreNotes({ [ROW.save]: originalNote(before) });
          }
        });

        test(`TC-TAX-OOT-033: Changes on several rows are saved together`, { tag: '@C107626' }, async () => {
          await about('Notes typed on two rows are both stored by one Save.');
          const [first, second] = ROW.notes;
          await oot.selectLocation(office.code);
          await oot.setNotEqualZero(false);
          await oot.setEffectiveDateFilter(LATEST_AS_OF);
          await oot.search();
          const original = {
            [first]: originalNote(await oot.readRow(oot.rowOf(first))),
            [second]: originalNote(await oot.readRow(oot.rowOf(second))),
          };
          const stamp = Date.now();
          const notes = { [first]: `${NOTE_PREFIX} ${stamp} A`, [second]: `${NOTE_PREFIX} ${stamp} B` };
          try {
            for (const [taxType, text] of Object.entries(notes)) await oot.editNotes(oot.rowOf(taxType), text);
            expect((await phase('Save once', () => oot.save())).toast).toBe(TEXT.saved);
            await oot.open(office.code);
            await oot.selectLocation(office.code);
            await oot.setNotEqualZero(false);
            await oot.setEffectiveDateFilter(LATEST_AS_OF);
            await oot.search();
            await verify('Both rows have their new note', async () => {
              expect((await oot.readRow(oot.rowOf(first))).Notes).toBe(notes[first]);
              expect((await oot.readRow(oot.rowOf(second))).Notes).toBe(notes[second]);
            });
          } finally {
            await restoreNotes(original);
          }
        });

        test(`TC-TAX-OOT-034: A failed save keeps the changes and says so`, { tag: '@C107627' }, async () => {
          await about('When the server rejects a save, an error is shown, the edit stays on screen with Save enabled, and nothing is stored.');
          const row = await oot.findRow(office.code, ROW.save, LATEST_AS_OF);
          const before = await oot.readRow(row);
          const note = `${NOTE_PREFIX} failed save`;
          const failSaves = /order-origin-tax/;
          await oot.page.route(failSaves, (route) =>
            (route.request().postData() ?? '').includes('"updates"') ? route.fulfill({ status: 500, body: 'forced failure' }) : route.continue(),
          );
          try {
            await oot.editNotes(row, note);
            const result = await phase('Save while the server fails', () => oot.save());
            await verify('Error message; the edit is kept and Save is still enabled', async () => {
              expect(result).toEqual({ ok: false, toast: TEXT.saveFailed });
              expect(await oot.readRow(row)).toMatchObject({ Notes: note });
              expect(await oot.isSaveEnabled()).toBe(true);
            });
          } finally {
            await oot.page.unroute(failSaves);
          }
          await oot.open(office.code);
          await verify('After reopening, the row is as it was', async () => {
            expect(await oot.readRow(await oot.findRow(office.code, ROW.save, LATEST_AS_OF))).toMatchObject({ Notes: before.Notes });
          });
        });
      });
    }
  });

  test.describe('I. Save a new rate', () => {
    test.describe.configure({ timeout: 300_000 });

    for (const office of OOT_OFFICES) {
      // A new rate needs a new Effective Date, so this runs on a UTC page, where the page shows dates as stored.
      test.describe(officeLabel(office), () => {
        let oot: OrderOriginTaxPage;

        test.beforeEach(async ({ utcPage, config }) => {
          oot = new OrderOriginTaxPage(utcPage, config);
          await oot.open(office.code);
        });

        test(`TC-TAX-OOT-035: A new rate with a new effective date is added as a new record`, { tag: '@C107628' }, async () => {
          await about(
            'Saving a new rate from the day after the latest record adds a record: the new rate applies from that day, ' +
              'the earlier record still applies before it, and History lists the change.',
          );
          const latest = await oot.readRow(await oot.findRow(office.code, ROW.save, LATEST_AS_OF));
          const latestDate = latest['Effective Date']!;
          const newDate = addDays(latestDate, 1);
          await attachNote('Dates', `latest record ${latestDate}; new record ${newDate}; restore record ${addDays(latestDate, 2)}`);
          try {
            const row = await oot.findRow(office.code, ROW.save, LATEST_AS_OF);
            await oot.editTax(row, NEW_RATE.typed);
            await oot.editDate(row, newDate);
            await verify('The change is valid and can be saved', async () => {
              expect(await oot.getRowAlert(row)).toBeNull();
              expect(await oot.isSaveEnabled()).toBe(true);
            });
            const result = await phase('Save', () => oot.save());
            expect(result).toEqual({ ok: true, toast: TEXT.saved });

            await oot.open(office.code);
            await verify(`As of ${newDate}: the new rate`, async () => {
              expect(await oot.readRow(await oot.findRow(office.code, ROW.save, newDate))).toMatchObject({
                'Additional Tax': NEW_RATE.shown,
                'Effective Date': newDate,
                'Modified By': USER,
              });
            });
            await oot.open(office.code);
            await verify(`As of ${latestDate}: the earlier record, unchanged`, async () => {
              expect(await oot.readRow(await oot.findRow(office.code, ROW.save, latestDate))).toMatchObject({
                'Additional Tax': latest['Additional Tax'],
                'Effective Date': latestDate,
              });
            });

            await phase('Search History for the new record', async () => {
              await oot.switchTab('history');
              await oot.selectLocation(office.code);
              await oot.selectTaxType(ROW.save);
              await oot.setNotEqualZero(false);
              await oot.pickHistoryRangeDay(shortDate(newDate));
              await oot.search();
            });
            await verify('History lists the new record by this user', async () => {
              const dates = await oot.readColumn('Effective Date');
              const users = await oot.readColumn('Modified By');
              expect(dates.map((d, i) => `${d} ${users[i]}`)).toContain(`${newDate} ${USER}`);
            });
          } finally {
            await restoreRate();
          }
        });

        /** If the latest record no longer has the row's own rate, adds one more record with it. */
        async function restoreRate(): Promise<void> {
          await oot.open(office.code);
          const row = await oot.findRow(office.code, ROW.save, LATEST_AS_OF);
          const now = await oot.readRow(row);
          if (now['Additional Tax'] === SAVE_ROW_RATE) return;
          await oot.editTax(row, SAVE_ROW_RATE);
          await oot.editDate(row, addDays(now['Effective Date']!, 1));
          expect((await oot.save()).toast, 'restoring the original rate').toBe(TEXT.saved);
        }
      });
    }
  });

  // The Order Origin Tax History tab. It lists tax records by effective date range, 50 to a page, and is
  // read-only. Nothing here saves.
  test.describe('J. History', () => {
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

    test('TC-TAX-OOT-036: History opens with default criteria, an empty grid and no Save', { tag: '@C107629' }, async () => {
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

    test('TC-TAX-OOT-037: History shows the twelve order origin tax columns', { tag: '@C107630' }, async () => {
      await about('History lists the same twelve columns as Basic Information.');
      await verify('Column headers in order', async () => {
        expect(await oot.getHeaders()).toEqual([...COLUMNS]);
      });
    });

    test('TC-TAX-OOT-038: A date range search lists read-only records effective in that range', { tag: '@C107631' }, async () => {
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

    test('TC-TAX-OOT-039: History pages its results 50 at a time', { tag: '@C107632' }, async () => {
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

    test('TC-TAX-OOT-040: The Location and Tax Type filters narrow History', { tag: '@C107633' }, async () => {
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

    test('TC-TAX-OOT-041: Reset restores the History criteria and clears the grid', { tag: '@C107634' }, async () => {
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
});
