import { test, expect } from '../../src/fixtures/pages.fixture';
import { InternationalTaxTypeSetupPage } from '../../src/pages/taxes/international-tax-type-setup.page';
import { phase, verify, about } from '../../src/fixtures/report-steps';
import { EDIT_OFFICE, LATEST_AS_OF, QUEBEC_RECORD, TEXT } from '../../src/data/taxes/international-tax-type-setup';

// Tax → International Tax Type Setup (NM-4026): Effective Dates for a user in a US time zone. The suite's
// shared session runs in America/New_York (playwright.config.ts), so these cases use it as is. Nothing
// here is stored: the save case answers the save in the browser.

test.describe.configure({ timeout: 180_000 });

const US_ZONE = 'America/New_York';
const TYPED = '01/15/2030';

test.describe('International Tax Type Setup — US time zone', () => {
  let its: InternationalTaxTypeSetupPage;

  test.beforeEach(async ({ authenticatedSession, config }) => {
    its = new InternationalTaxTypeSetupPage(authenticatedSession.page, config);
    await its.open(EDIT_OFFICE);
    await verify(`The browser runs in ${US_ZONE}`, async () => {
      expect(await its.page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)).toBe(US_ZONE);
    });
  });

  test('TC-ITS-TMZ-001: In a US time zone the search date picks the record in effect that day', async () => {
    await about(`Quebec's GST/QST record applies from ${QUEBEC_RECORD.since}: in US time, searching the day before shows none and that day shows it.`);
    const before = await its.readRow(await its.findRow('Canada', 'Quebec', QUEBEC_RECORD.dayBefore));
    const on = await its.readRow(await its.findRow('Canada', 'Quebec', QUEBEC_RECORD.since));
    await verify(`${QUEBEC_RECORD.dayBefore}: none; ${QUEBEC_RECORD.since}: GST and QST`, async () => {
      expect(before['GOV Tax Type Name']).toBe('');
      expect(on).toMatchObject({ 'GOV Tax Type Name': QUEBEC_RECORD.gov, 'Provincial Tax Type Name': QUEBEC_RECORD.provincial });
    });
  });

  test('TC-ITS-TMZ-002: In a US time zone a stored Effective Date shows as stored', async () => {
    await about(`Quebec's record is stored from ${QUEBEC_RECORD.since}; a US user sees that same date in the row.`);
    const row = await its.readRow(await its.findRow('Canada', 'Quebec', QUEBEC_RECORD.since));
    await verify(`The row shows ${QUEBEC_RECORD.since}`, async () => {
      expect(row['Effective Date']).toBe(QUEBEC_RECORD.since);
    });
  });

  test('TC-ITS-TMZ-003: In a US time zone a typed Effective Date is kept as typed', async () => {
    await about(`A US user who types ${TYPED} in a row's Effective Date still sees ${TYPED} after leaving the field.`);
    const row = await its.findEmptyRow('Mexico', LATEST_AS_OF);
    await its.pickType(row, 'gov', 'IVA');
    const shown = await its.editDate(row, TYPED);
    await verify(`The cell reads ${TYPED}`, async () => {
      expect(shown).toBe(TYPED);
    });
  });

  test('TC-ITS-TMZ-004: In a US time zone a save sends the Effective Date as entered', async () => {
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

  test('TC-ITS-TMZ-005: In a US time zone a day picked in the calendar is the day shown', async () => {
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
