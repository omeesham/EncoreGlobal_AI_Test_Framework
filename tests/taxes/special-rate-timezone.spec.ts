import { test, expect } from '../../src/fixtures/pages.fixture';
import { SpecialRatePage, addDays, wireDate } from '../../src/pages/taxes/special-rate.page';
import { phase, verify, about } from '../../src/fixtures/report-steps';
import { EDIT_OFFICE, PW, JAN_2006, ALERT, TEXT } from '../../src/data/taxes/special-rate';

// Tax → Special Rate (NM-4022): Effective Dates for a user in a US time zone. The suite's shared session
// runs in America/New_York (playwright.config.ts), so these cases use it as is. A stored date is midnight
// UTC and the page reads it in the browser's local time, so a US user sees stored dates one day earlier
// than a UTC user; these cases record that behaviour. Nothing here is stored: the save case answers the
// save in the browser.

test.describe.configure({ timeout: 180_000 });

const US_ZONE = 'America/New_York';
const TYPED = '01/15/2030';
const STORED_US = addDays(PW.editSince, -1);

test.describe('Special Rate — US time zone', () => {
  let sr: SpecialRatePage;

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

  test('TC-SR-TMZ-001: In a US time zone the search date picks the record in effect that day', async () => {
    const r = PW.asOf;
    await about(`${PW.state} ${r.taxType} turns Special on ${r.since}: in US time the day before shows it not special, that day shows it special.`);
    const before = await sr.readRow(await sr.findRow(PW.state, r.taxType, '01/01/2099'));
    const on = await sr.readRow(await sr.findRow(PW.state, r.taxType, r.since));
    await verify('01/01/2099: not special; 01/02/2099: special', async () => {
      expect(before.Special).toBe('No');
      expect(on).toMatchObject({ Special: 'Yes', 'State Special': r.rate });
    });
  });

  test('TC-SR-TMZ-002: In a US time zone a stored Effective Date shows one day earlier', async () => {
    await about(`${PW.state} ${PW.edit}'s record is stored from ${PW.editSince} (midnight UTC); a US user sees ${STORED_US}.`);
    const row = await editRow();
    await verify(`The row shows ${STORED_US}`, async () => {
      expect((await sr.readRow(row))['Effective Date']).toBe(STORED_US);
    });
  });

  test('TC-SR-TMZ-003: In a US time zone a typed Effective Date moves back when the field is left', async () => {
    const shownUs = addDays(TYPED, -2);
    await about(`A US user who types ${TYPED} in a row's Effective Date sees ${shownUs} after leaving the field.`);
    const row = await editRow();
    await sr.toggle(row, 'Special');
    const shown = await sr.editDate(row, TYPED);
    await verify(`The cell reads ${shownUs}`, async () => expect(shown).toBe(shownUs));
  });

  test('TC-SR-TMZ-004: In a US time zone a save sends the Effective Date one day earlier', async () => {
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

  test('TC-SR-TMZ-005: In a US time zone the "must be after" message names the date the row shows', async () => {
    await about(`A date before the record is refused with "${ALERT.dateAfter(STORED_US)}", the date a US user sees on the row.`);
    const row = await editRow();
    await sr.toggle(row, 'Special');
    await sr.editDate(row, '01/01/2006');
    await verify(`"${ALERT.dateAfter(STORED_US)}"`, async () => {
      expect(await sr.getRowMessages(row)).toEqual([ALERT.dateAfter(STORED_US)]);
    });
  });

  test('TC-SR-TMZ-006: In a US time zone a day picked in the calendar is set as the day before', async () => {
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

  test('TC-SR-TMZ-007: In a US time zone the history shows stored Effective Dates one day earlier', async () => {
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
