import { test, expect } from '../../src/fixtures/pages.fixture';
import { InternationalTaxTypeSetupPage, addDays } from '../../src/pages/taxes/international-tax-type-setup.page';
import { phase, verify, about, attachNote } from '../../src/fixtures/report-steps';
import { EDIT_OFFICE, SAVE_ROWS, TYPE_ROW, REG_PREFIX, LATEST_AS_OF, TEXT, TypeKind } from '../../src/data/taxes/international-tax-type-setup';

// Tax → International Tax Type Setup (NM-4026): saving. These cases write real E2E data on company-wide
// rows and put it back afterwards. A new Reg. Number needs a new effective date and is added as a new
// record; records cannot be deleted, so the original number is put back by one more record dated a day
// later — each run moves those rows' latest date two days on. The page shows dates as stored only in
// UTC, so this runs on a UTC page (utcPage).

test.describe.configure({ timeout: 300_000 });

const USER_REG = (tag: string) => `${REG_PREFIX}-${tag}-${Date.now()}`;
const REG_COLUMN = { gov: 'GOV Tax Reg. Number', provincial: 'Provincial Tax Reg. Number' } as const;

type SaveRow = { readonly country: string; readonly province: string; readonly kind: TypeKind; readonly reg: string };

/** MM/DD/YYYY → the midnight-UTC timestamp a save sends. */
const wireDate = (mmddyyyy: string) => {
  const [m, d, y] = mmddyyyy.split('/');
  return `${y}-${m}-${d}T00:00:00.000Z`;
};

test.describe('International Tax Type Setup — save', () => {
  let its: InternationalTaxTypeSetupPage;

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

  test('TC-ITS-SAV-001: A new GOV Reg. Number is saved as a new record from its effective date', async () => {
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

  test('TC-ITS-SAV-002: Provincial Reg. Numbers on two rows are saved together', async () => {
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

  test('TC-ITS-SAV-004: A changed GOV tax type is saved as a new record', async () => {
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

  test('TC-ITS-SAV-005: A Provincial tax type added with its Reg. Number is saved, and can be removed again', async () => {
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

  test('TC-ITS-SAV-006: Setting up a state with no tax type sends its new record', async () => {
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

  test('TC-ITS-SAV-003: A failed save keeps the changes and says so', async () => {
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
