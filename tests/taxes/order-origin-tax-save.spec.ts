import { test, expect } from '../../src/fixtures/pages.fixture';
import { OrderOriginTaxPage, GridRow, addDays, shortDate } from '../../src/pages/taxes/order-origin-tax.page';
import { phase, verify, about, attachNote } from '../../src/fixtures/report-steps';
import { OOT_OFFICES, officeLabel, ROW, LATEST_AS_OF, TEXT, NOTE_PREFIX, SAVE_ROW_RATE } from '../../src/data/taxes/order-origin-tax';

// Tax → Order Origin Tax (NM-4020): saving, on each of the three offices. These cases write real E2E
// data on the office's own rows and put it back afterwards. Notes are updated in place, so they are
// simply cleared again. A new rate with a new effective date is added as a new record and records
// cannot be deleted, so the rate is put back by one more record dated a day later — each run moves
// that row's latest date two days on.

test.describe.configure({ timeout: 300_000 });

const USER = process.env.NAVIGATOR_USERNAME ?? '';
const NEW_RATE = { typed: '5', shown: '0.050000' } as const;

/** The note to put back: a note these cases wrote is a leftover of an interrupted run, so it goes. */
const originalNote = (row: GridRow): string => (row.Notes?.startsWith(NOTE_PREFIX) ? '' : row.Notes ?? '');

for (const office of OOT_OFFICES) {
  test.describe(`Order Origin Tax — save — ${officeLabel(office)}`, () => {
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

    test(`TC-OOT-SAV-001: A notes change is saved on the row and stamped with the user and time — ${officeLabel(office)}`, async () => {
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

    test(`TC-OOT-SAV-003: Changes on several rows are saved together — ${officeLabel(office)}`, async () => {
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

    test(`TC-OOT-SAV-004: A failed save keeps the changes and says so — ${officeLabel(office)}`, async () => {
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

  // A new rate needs a new Effective Date, so this runs on a UTC page, where the page shows dates as stored.
  test.describe(`Order Origin Tax — save a new rate — ${officeLabel(office)}`, () => {
    let oot: OrderOriginTaxPage;

    test.beforeEach(async ({ utcPage, config }) => {
      oot = new OrderOriginTaxPage(utcPage, config);
      await oot.open(office.code);
    });

    test(`TC-OOT-SAV-002: A new rate with a new effective date is added as a new record — ${officeLabel(office)}`, async () => {
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
