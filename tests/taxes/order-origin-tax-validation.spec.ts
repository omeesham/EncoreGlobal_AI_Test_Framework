import { Locator } from '@playwright/test';
import { test, expect } from '../../src/fixtures/pages.fixture';
import { OrderOriginTaxPage, addDays, shortDate } from '../../src/pages/taxes/order-origin-tax.page';
import { verify, about } from '../../src/fixtures/report-steps';
import {
  OOT_OFFICES,
  officeLabel,
  EDIT_OFFICE,
  ROW,
  VALIDATION_ROW_DATE,
  LATEST_AS_OF,
  TEXT,
  ALERT,
  TAX_INPUT,
  NOTES_MAX,
} from '../../src/data/taxes/order-origin-tax';

// Tax → Order Origin Tax (NM-4020): field validation of the editable cells — Additional Tax,
// Effective Date and Notes — and the unsaved-changes guard, on each of the three offices. Nothing
// here saves: most cases work on the office's "Audio Conferencing" row, whose only entry is
// effective 1/1/2000, and leave it unsaved.
// The suite runs in America/New_York (playwright.config.ts). The cases that read or set an
// Effective Date run on a UTC page (utcPage), where the page shows dates as stored.

test.describe.configure({ timeout: 180_000 });

const DAY_AFTER = addDays(VALIDATION_ROW_DATE, 1);

for (const office of OOT_OFFICES) {
  test.describe(`Order Origin Tax — field validation — ${officeLabel(office)}`, () => {
    let oot: OrderOriginTaxPage;
    let row: Locator;

    test.beforeEach(async ({ authenticatedSession, config }) => {
      oot = new OrderOriginTaxPage(authenticatedSession.page, config);
      await oot.open(office.code);
      row = await oot.findRow(office.code, ROW.validation);
    });

    test(`TC-OOT-VAL-001: Additional Tax reads whole numbers as percentages, caps at ±100 % and keeps six decimals — ${officeLabel(office)}`, async () => {
      await about('Each value typed into Additional Tax is shown, after leaving the field, as the stored fraction.');
      for (const { typed, shown, why } of TAX_INPUT) {
        await verify(`"${typed}" → ${shown} (${why})`, async () => {
          expect.soft(await oot.editTax(row, typed)).toBe(shown);
        });
      }
    });

    test(`TC-OOT-VAL-002: Letters cannot be typed into Additional Tax — ${officeLabel(office)}`, async () => {
      await about('Additional Tax is a number field: letters pressed after a valid rate change nothing.');
      await oot.editTax(row, '5');
      await verify('The rate is unchanged after pressing letters', async () => {
        expect(await oot.typeIntoTax(row, 'abc')).toBe('0.050000');
      });
    });

    test(`TC-OOT-VAL-003: A new rate without a new effective date is flagged and cannot be saved — ${officeLabel(office)}`, async () => {
      await about('Changing Additional Tax on its own marks the row and keeps Save disabled.');
      await oot.editTax(row, '5');
      await verify('Row message and Save state', async () => {
        expect(await oot.getRowAlert(row)).toBe(ALERT.newDateNeeded);
        expect(await oot.isSaveEnabled()).toBe(false);
      });
    });

    test(`TC-OOT-VAL-006: An emptied effective date is required — ${officeLabel(office)}`, async () => {
      await about('Clearing Effective Date marks the row as Required and keeps Save disabled.');
      await oot.editDate(row, '');
      await verify('Row message and Save state', async () => {
        expect(await oot.getRowAlert(row)).toBe(ALERT.required);
        expect(await oot.isSaveEnabled()).toBe(false);
      });
    });

    test(`TC-OOT-VAL-007: An effective date that is not a real date is flagged — ${officeLabel(office)}`, async () => {
      await about('A month and day that do not exist mark the row as Invalid date and keep Save disabled.');
      await oot.editDate(row, '13/45/2026');
      await verify('Row message and Save state', async () => {
        expect(await oot.getRowAlert(row)).toBe(ALERT.invalidDate);
        expect(await oot.isSaveEnabled()).toBe(false);
      });
    });

    test(`TC-OOT-VAL-009: Notes accept at most 500 characters — ${officeLabel(office)}`, async () => {
      await about('Typing more than 500 characters into Notes keeps the first 500.');
      const kept = await oot.editNotes(row, 'n'.repeat(NOTES_MAX + 1));
      await verify(`${NOTES_MAX} characters kept`, async () => {
        expect(kept).toHaveLength(NOTES_MAX);
      });
    });

    test(`TC-OOT-VAL-010: A notes-only change needs no new effective date — ${officeLabel(office)}`, async () => {
      await about('Changing only Notes leaves the row valid and enables Save.');
      await oot.editNotes(row, 'Validation note');
      await verify('No row message, Save enabled', async () => {
        expect(await oot.getRowAlert(row)).toBeNull();
        expect(await oot.isSaveEnabled()).toBe(true);
      });
    });

    test(`TC-OOT-VAL-011: Undoing an edit turns Save off again — ${officeLabel(office)}`, async () => {
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

  test.describe(`Order Origin Tax — effective date — ${officeLabel(office)}`, () => {
    let oot: OrderOriginTaxPage;
    let row: Locator;

    test.beforeEach(async ({ utcPage, config }) => {
      oot = new OrderOriginTaxPage(utcPage, config);
      await oot.open(office.code);
      row = await oot.findRow(office.code, ROW.validation);
    });

    test(`TC-OOT-VAL-008: An effective date picked from the calendar is set on the row — ${officeLabel(office)}`, async () => {
      await about(`Picking ${DAY_AFTER} in the cell calendar sets exactly that date, a valid change.`);
      const picked = await oot.pickDate(row, shortDate(DAY_AFTER));
      await verify(`The cell shows ${DAY_AFTER}, no row message, Save enabled`, async () => {
        expect(picked).toBe(DAY_AFTER);
        expect(await oot.getRowAlert(row)).toBeNull();
        expect(await oot.isSaveEnabled()).toBe(true);
      });
    });

    test(`TC-OOT-VAL-012: The effective date shows the stored date and keeps the date the user enters — ${officeLabel(office)}`, async () => {
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

// The "after the latest record" rule needs a row with a real record; the offices' Audio Conferencing
// rows only carry the 1/1/2000 starting entry, which takes any new date. The first row of a search as of
// a far-future date is the latest record of some location and tax type; it is edited but never
// saved. The table is company-wide, so this runs once, on a UTC page like the other date cases.
test.describe('Order Origin Tax — effective date limits', () => {
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

  test('TC-OOT-VAL-004: An effective date before the latest one is flagged and cannot be saved', async () => {
    await about("A new rate dated before the row's latest effective date is refused, quoting that date.");
    await oot.editDate(row, addDays(latest, -1));
    await verify(`Row message names ${latest}; Save disabled`, async () => {
      expect(await oot.getRowAlert(row)).toBe(ALERT.dateAfter(shortDate(latest)));
      expect(await oot.isSaveEnabled()).toBe(false);
    });
  });

  test('TC-OOT-VAL-005: The day after the latest effective date is accepted with a new rate', async () => {
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

for (const office of OOT_OFFICES) {
  test.describe(`Order Origin Tax — unsaved changes — ${officeLabel(office)}`, () => {
    let oot: OrderOriginTaxPage;
    let row: Locator;
    const NOTE = 'Unsaved note';

    test.beforeEach(async ({ authenticatedSession, config }) => {
      oot = new OrderOriginTaxPage(authenticatedSession.page, config);
      await oot.open(office.code);
      row = await oot.findRow(office.code, ROW.validation);
      await oot.editNotes(row, NOTE);
    });

    test(`TC-OOT-UNS-001: Switching tab with an unsaved edit asks first, and Stay keeps the edit — ${officeLabel(office)}`, async () => {
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

    test(`TC-OOT-UNS-002: Discard drops the unsaved edit and opens the other tab — ${officeLabel(office)}`, async () => {
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

    test(`TC-OOT-UNS-003: Searching again with an unsaved edit asks first — ${officeLabel(office)}`, async () => {
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

    test(`TC-OOT-UNS-004: Leaving the page with an unsaved edit asks first — ${officeLabel(office)}`, async () => {
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
