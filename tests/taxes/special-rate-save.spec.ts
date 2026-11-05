import { test, expect } from '../../src/fixtures/pages.fixture';
import { SpecialRatePage, addDays, wireDate, GridRow } from '../../src/pages/taxes/special-rate.page';
import { phase, verify, about, attachNote } from '../../src/fixtures/report-steps';
import { EDIT_OFFICE, PW, PLACE, NOTE_PREFIX, LATEST_AS_OF, FUTURE_FLOOR, TEXT } from '../../src/data/taxes/special-rate';

// Tax → Special Rate (NM-4022): saving. These cases write real E2E records on Palau's Rigging and Sales
// rows and put them back afterwards. A change needs a new effective date and is added as a new record;
// records cannot be deleted, so the original values are put back by one more record dated a day later.
// Every record is dated after the row's latest one and never before 01/03/2099, so today's taxes never
// change. The page shows dates as stored only in UTC, so this runs on a UTC page (utcPage).

test.describe.configure({ timeout: 300_000 });

const yyyymmdd = (d: string) => { const [m, day, y] = d.split('/'); return `${y}${m}${day}`; };

/** The day after a row's latest record, but never before FUTURE_FLOOR, so a save cannot change today's taxes. */
const nextDay = (latest: string) => { const d = addDays(latest, 1); return yyyymmdd(d) < yyyymmdd(FUTURE_FLOOR) ? FUTURE_FLOOR : d; };

const note = (tag: string) => `${NOTE_PREFIX}-${tag}-${Date.now()}`;

test.describe('Special Rate — save', () => {
  let sr: SpecialRatePage;

  test.beforeEach(async ({ utcPage, config }) => {
    sr = new SpecialRatePage(utcPage, config);
  });

  /** Lists Palau's latest records and returns the named rows as they are now. */
  async function openLatest(taxTypes: string[]): Promise<Record<string, GridRow>> {
    await sr.open(EDIT_OFFICE);
    await sr.choose('state', PW.state);
    await sr.setSearchDate(LATEST_AS_OF);
    await sr.search();
    const rows: Record<string, GridRow> = {};
    for (const t of taxTypes) rows[t] = await sr.readRow(sr.row(t));
    return rows;
  }

  /**
   * Puts a row back to plain (not Special, the given Taxable) by one more record dated a day after its latest,
   * unless it already is.
   */
  async function restore(taxType: string, taxable: string): Promise<void> {
    const now = (await openLatest([taxType]))[taxType]!;
    if (now.Special === 'No' && now.Taxable === taxable) return;
    const row = sr.row(taxType);
    if (now.Special !== 'No') await sr.toggle(row, 'Special');
    if (now.Taxable !== taxable) await sr.toggle(row, 'Taxable');
    await sr.editNotes(row, '');
    await sr.editDate(row, nextDay(now['Effective Date']!));
    expect((await sr.save()).toast, `restoring ${PW.state} ${taxType}`).toBe(TEXT.saved);
  }

  test('TC-SR-SAV-001: A special rate is saved as a new record from its effective date', async () => {
    await about(
      `Ticking Special on ${PW.state} ${PW.save} with 1.5% and a note, from the day after its latest record, saves one record: the rate ` +
        'applies from that day with the combined columns, and the earlier record still applies before it.',
    );
    const before = (await openLatest([PW.save]))[PW.save]!;
    const latest = before['Effective Date']!;
    const day = nextDay(latest);
    const text = note('SAV1');
    await attachNote('Dates', `latest record ${latest}; new record ${day}; restore record ${addDays(day, 1)}`);
    try {
      const row = sr.row(PW.save);
      await sr.toggle(row, 'Special');
      await sr.editRate(row, '1.5');
      await sr.editNotes(row, text);
      await sr.editDate(row, day);
      const result = await phase('Save', () => sr.save());
      await verify('Saved; one record sent, dated midnight UTC; Save is off again', async () => {
        expect(result).toMatchObject({ ok: true, toast: TEXT.saved });
        expect(result.records).toHaveLength(1);
        expect(result.records[0]).toMatchObject({
          stateName: PW.state, taxTypeName: PW.save, special: true, specialRate: 0.015, stateSpecialRate: 0.015,
          effectiveDate: wireDate(day), notes: text,
        });
        expect(await sr.isSaveEnabled()).toBe(false);
      });
      await verify(`As of ${day}: Special 0.015000, the combined columns, the note and who saved it`, async () => {
        const saved = await sr.readRow(await sr.findRow(PW.state, PW.save, day));
        expect(saved).toMatchObject({
          'Effective Date': day, Special: 'Yes', 'State Special': '0.015000', 'Special Combined': '0.015000', 'Total Combined': '0.015000', Notes: text,
        });
        expect(saved['Modified By']).toMatch(/@/);
      });
      await verify(`As of ${latest}: the earlier record, unchanged`, async () => {
        expect(await sr.readRow(await sr.findRow(PW.state, PW.save, latest))).toMatchObject({ 'Effective Date': latest, Special: before.Special });
      });
    } finally {
      await restore(PW.save, before.Taxable!);
    }
  });

  test('TC-SR-SAV-002: A changed Taxable setting is saved', async () => {
    await about(`Switching Taxable on ${PW.state} ${PW.save} with the next day saves a record with the new setting.`);
    const before = (await openLatest([PW.save]))[PW.save]!;
    const day = nextDay(before['Effective Date']!);
    const flipped = before.Taxable === 'Yes' ? 'No' : 'Yes';
    try {
      const row = sr.row(PW.save);
      await sr.toggle(row, 'Taxable');
      await sr.editDate(row, day);
      const result = await phase('Save', () => sr.save());
      await verify(`Saved; the record sent has Taxable ${flipped}`, async () => {
        expect(result.toast).toBe(TEXT.saved);
        expect(result.records[0]).toMatchObject({ taxTypeName: PW.save, taxable: flipped === 'Yes', effectiveDate: wireDate(day) });
      });
      await openLatest([PW.save]);
      await verify(`The latest record shows Taxable ${flipped} from ${day}`, async () => {
        expect(await sr.readRow(sr.row(PW.save))).toMatchObject({ Taxable: flipped, 'Effective Date': day });
      });
    } finally {
      await restore(PW.save, before.Taxable!);
    }
  });

  test('TC-SR-SAV-003: Changes on two rows are saved together', async () => {
    await about(`Special rates typed on ${PW.save} and ${PW.saveOther} are both sent and stored by one Save.`);
    const before = await openLatest([PW.save, PW.saveOther]);
    const rates = { [PW.save]: '2', [PW.saveOther]: '3' };
    try {
      for (const t of [PW.save, PW.saveOther]) {
        const row = sr.row(t);
        await sr.toggle(row, 'Special');
        await sr.editRate(row, rates[t]!);
        await sr.editDate(row, nextDay(before[t]!['Effective Date']!));
      }
      const result = await phase('Save once', () => sr.save());
      await verify('Saved; both rows were sent', async () => {
        expect(result.toast).toBe(TEXT.saved);
        expect(result.records.map((r) => [r.taxTypeName, r.specialRate])).toEqual([[PW.save, 0.02], [PW.saveOther, 0.03]]);
      });
      const after = await openLatest([PW.save, PW.saveOther]);
      await verify('Both rows show their rate from their next day', async () => {
        expect(after[PW.save]).toMatchObject({ Special: 'Yes', 'State Special': '0.020000' });
        expect(after[PW.saveOther]).toMatchObject({ Special: 'Yes', 'State Special': '0.030000' });
      });
    } finally {
      await restore(PW.save, before[PW.save]!.Taxable!);
      await restore(PW.saveOther, before[PW.saveOther]!.Taxable!);
    }
  });

  test('TC-SR-SAV-004: Unticking Special saves the rate as 0', async () => {
    await about(`After a special rate is saved on ${PW.save}, unticking Special with a later date saves a record that is not special and has no rate.`);
    const before = (await openLatest([PW.save]))[PW.save]!;
    try {
      let row = sr.row(PW.save);
      await sr.toggle(row, 'Special');
      await sr.editRate(row, '2');
      await sr.editDate(row, nextDay(before['Effective Date']!));
      await sr.save();
      const special = (await openLatest([PW.save]))[PW.save]!;
      row = sr.row(PW.save);
      await sr.toggle(row, 'Special');
      const day = nextDay(special['Effective Date']!);
      await sr.editDate(row, day);
      const result = await phase('Save with Special unticked', () => sr.save());
      await verify('The record sent is not special, rate 0', async () => {
        expect(result.toast).toBe(TEXT.saved);
        expect(result.records[0]).toMatchObject({ special: false, specialRate: 0, stateSpecialRate: 0, effectiveDate: wireDate(day) });
      });
      await openLatest([PW.save]);
      await verify(`From ${day}: not special, rates 0`, async () => {
        expect(await sr.readRow(sr.row(PW.save))).toMatchObject({ Special: 'No', 'Special Combined': '0.000000', 'Total Combined': '0.000000', 'Effective Date': day });
      });
    } finally {
      await restore(PW.save, before.Taxable!);
    }
  });

  test('TC-SR-SAV-005: A saved record appears in Special Rate History', async () => {
    await about(`A special rate saved on ${PW.saveOther} is listed in Special Rate History for a range reaching its effective date, with its note.`);
    const before = (await openLatest([PW.saveOther]))[PW.saveOther]!;
    const day = nextDay(before['Effective Date']!);
    const text = note('HIS');
    try {
      const row = sr.row(PW.saveOther);
      await sr.toggle(row, 'Special');
      await sr.editRate(row, '1');
      await sr.editNotes(row, text);
      await sr.editDate(row, day);
      expect((await sr.save()).toast).toBe(TEXT.saved);
      await sr.openTab('Special Rate History');
      await sr.choose('state', PW.state);
      await sr.choose('taxType', PW.saveOther);
      const [m, d, y] = day.split('/').map(Number) as [number, number, number];
      const today = await todayDay();
      expect(await sr.setDateRange(today, [y, m, d])).toBe(`${await sr.browserToday()} - ${day}`);
      await phase('Search the history up to the new date', () => sr.search());
      await verify(`A ${PW.saveOther} record from ${day}: Special, 0.010000, the note`, async () => {
        const notes = await sr.readColumn('Notes');
        const i = notes.indexOf(text);
        expect(i, `notes listed: ${JSON.stringify(notes)}`).toBeGreaterThanOrEqual(0);
        expect(await sr.readRow(sr.page.locator('main tbody tr:has(td + td)').nth(i))).toMatchObject({
          State: PW.state, 'Tax Type': PW.saveOther, Special: 'Yes', 'State Special': '0.010000', 'Effective Date': day,
        });
      });
    } finally {
      await restore(PW.saveOther, before.Taxable!);
    }
  });

  async function todayDay(): Promise<[number, number, number]> {
    const [m, d, y] = (await sr.browserToday()).split('/').map(Number) as [number, number, number];
    return [y, m, d];
  }

  test('TC-SR-SAV-006: A failed save keeps the changes and says so', async () => {
    await about('When the server rejects a save, an error is shown, the edit stays on screen with Save enabled, and nothing is stored.');
    const before = (await openLatest([PW.saveOther]))[PW.saveOther]!;
    const stop = await sr.failSaves();
    try {
      const row = sr.row(PW.saveOther);
      await sr.toggle(row, 'Special');
      await sr.editRate(row, '4');
      await sr.editDate(row, nextDay(before['Effective Date']!));
      const result = await phase('Save while the server fails', () => sr.save());
      await verify('Error message; the edit is kept and Save is still enabled', async () => {
        expect(result).toMatchObject({ ok: false, toast: TEXT.saveFailed });
        expect(await sr.readRow(row)).toMatchObject({ Special: 'Yes', 'State Special': '0.040000' });
        expect(await sr.isSaveEnabled()).toBe(true);
      });
    } finally {
      await stop();
    }
    await openLatest([PW.saveOther]);
    await verify('After reopening, the row is as it was', async () => {
      expect(await sr.readRow(sr.row(PW.saveOther))).toMatchObject({ Special: before.Special, 'Effective Date': before['Effective Date'] });
    });
  });

  test('TC-SR-SAV-008: A Notes-only change updates the current record', async () => {
    await about(
      `Changing only the Notes of ${PW.save}'s latest record (2099 onward) and saving keeps its Effective Date: the record shows the new ` +
        'note from the same day, and Special Rate History lists the change as a new version of that day.',
    );
    // A Notes-only save keeps the date, so it is only made on a record the save cases wrote themselves.
    let before = (await openLatest([PW.save]))[PW.save]!;
    if (yyyymmdd(before['Effective Date']!) < yyyymmdd(FUTURE_FLOOR)) {
      await restore(PW.save, before.Taxable === 'Yes' ? 'No' : 'Yes');
      await restore(PW.save, before.Taxable!);
      before = (await openLatest([PW.save]))[PW.save]!;
    }
    const day = before['Effective Date']!;
    const text = note('NOTE');
    try {
      await sr.editNotes(sr.row(PW.save), text);
      const result = await phase('Save', () => sr.save());
      await verify(`Saved; the record sent keeps ${day}`, async () => {
        expect(result.toast).toBe(TEXT.saved);
        expect(result.records[0]).toMatchObject({ taxTypeName: PW.save, notes: text, effectiveDate: wireDate(day) });
      });
      await openLatest([PW.save]);
      await verify(`The latest record is still from ${day}, with the new note`, async () => {
        expect(await sr.readRow(sr.row(PW.save))).toMatchObject({ 'Effective Date': day, Notes: text, Special: before.Special });
      });
      await sr.openTab('Special Rate History');
      await sr.choose('state', PW.state);
      await sr.choose('taxType', PW.save);
      const [m, d, y] = day.split('/').map(Number) as [number, number, number];
      await sr.setDateRange(await todayDay(), [y, m, d]);
      await sr.search();
      // History keeps every saved version, newest first: the edit is listed above the version it replaced.
      await verify(`History lists the new version for ${day} first, above the earlier version of that day`, async () => {
        const dates = await sr.readColumn('Effective Date');
        const notes = await sr.readColumn('Notes');
        const sameDay = notes.filter((_, i) => dates[i] === day);
        expect(sameDay.length).toBeGreaterThanOrEqual(2);
        expect(sameDay[0]).toBe(text);
        expect(sameDay[1]).not.toBe(text);
      });
    } finally {
      await openLatest([PW.save]);
      if ((await sr.readRow(sr.row(PW.save))).Notes !== before.Notes) {
        await sr.editNotes(sr.row(PW.save), before.Notes ?? '');
        expect((await sr.save()).toast, 'restoring the note').toBe(TEXT.saved);
      }
    }
  });

  test('TC-SR-SAV-009: A city row sends its rate as the city rate', async () => {
    await about(
      `On a city row (${PLACE.state} › ${PLACE.county} › ${PLACE.city}, by zip code) the rate typed with Special goes out as the City Special ` +
        'rate for that zip code. The server reply is given in the browser, so nothing is stored on the real city.',
    );
    await sr.open(EDIT_OFFICE);
    await sr.choose('state', PLACE.state);
    await sr.choose('county', PLACE.county);
    await sr.choose('city', PLACE.city);
    await sr.setSearchDate(LATEST_AS_OF);
    await sr.search();
    const row = sr.firstRow();
    const current = await sr.readRow(row);
    const stop = await sr.answerSavesWithSuccess();
    try {
      await sr.toggle(row, 'Special');
      await sr.editRate(row, '2');
      await sr.editDate(row, nextDay(current['Effective Date']!));
      const result = await phase('Save', () => sr.save());
      await verify('The record sent carries the city and its zip code, City Special 0.02, State and County Special 0', async () => {
        expect(result.records[0]).toMatchObject({
          stateName: PLACE.state, countyName: PLACE.county, cityName: PLACE.city, zipCode: current['Zip Code'], special: true,
          citySpecialRate: 0.02, stateSpecialRate: 0, countySpecialRate: 0,
        });
      });
    } finally {
      await stop();
    }
  });

  test('TC-SR-SAV-007: A county row sends its rate as the county rate', async () => {
    await about(
      `On a county row (${PLACE.state} › ${PLACE.county}) the rate typed with Special goes out as the County Special rate. The server reply is ` +
        'given in the browser, so nothing is stored on the real county.',
    );
    await sr.open(EDIT_OFFICE);
    await sr.choose('state', PLACE.state);
    await sr.choose('county', PLACE.county);
    await sr.setSearchDate(LATEST_AS_OF);
    await sr.search();
    const row = sr.firstRow();
    const current = await sr.readRow(row);
    const stop = await sr.answerSavesWithSuccess();
    try {
      await sr.toggle(row, 'Special');
      await sr.editRate(row, '2');
      await sr.editDate(row, nextDay(current['Effective Date']!));
      const result = await phase('Save', () => sr.save());
      await verify('The record sent carries the county and County Special 0.02, State Special 0', async () => {
        expect(result.records[0]).toMatchObject({ stateName: PLACE.state, countyName: PLACE.county, special: true, countySpecialRate: 0.02, stateSpecialRate: 0 });
        expect(result.records[0]!.countyId).not.toBeNull();
      });
    } finally {
      await stop();
    }
  });
});
