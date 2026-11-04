import { test, expect } from '../../src/fixtures/pages.fixture';
import { InternationalTaxTypeSetupPage, addDays } from '../../src/pages/taxes/international-tax-type-setup.page';
import { phase, verify, about } from '../../src/fixtures/report-steps';
import { EDIT_OFFICE, ROW, LATEST_AS_OF, REG_MAX, TEXT, ALERT } from '../../src/data/taxes/international-tax-type-setup';

// Tax → International Tax Type Setup (NM-4026): row validation and the unsaved-changes guard. Nothing
// here saves. The suite runs in America/New_York (playwright.config.ts); these cases read and set
// Effective Dates, so they run on a UTC page (utcPage), where the page shows dates as stored.

test.describe.configure({ timeout: 180_000 });

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

test.describe('International Tax Type Setup — row validation', () => {
  let its: InternationalTaxTypeSetupPage;

  test.beforeEach(async ({ utcPage, config }) => {
    its = new InternationalTaxTypeSetupPage(utcPage, config);
    await its.open(EDIT_OFFICE);
  });

  test('TC-ITS-VAL-001: A tax type picked on an empty row asks for a Reg. Number and an Effective Date', async () => {
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

  test('TC-ITS-VAL-002: An impossible Effective Date is flagged and cannot be saved', async () => {
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

  test('TC-ITS-VAL-003: A changed Reg. Number needs a new Effective Date', async () => {
    await about('Changing the GOV Reg. Number of a record while keeping its date is flagged and cannot be saved.');
    const row = await its.findRow('Canada', ROW.edit, LATEST_AS_OF);
    const before = await its.readRow(row);
    await its.editReg(row, 'gov', `${before['GOV Tax Reg. Number']}9`);
    await verify('New date needed; Save disabled', async () => {
      expect(await its.getRowAlert(row)).toBe(ALERT.newDateNeeded);
      expect(await its.isSaveEnabled()).toBe(false);
    });
  });

  test("TC-ITS-VAL-004: The new Effective Date must come after the record's date", async () => {
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

  test('TC-ITS-VAL-005: Removing a Provincial tax type needs a new Effective Date', async () => {
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

  test('TC-ITS-VAL-006: Reg. Number takes up to 100 characters, trims blanks and keeps markup as text', async () => {
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

  test('TC-ITS-VAL-007: Typed and calendar-picked Effective Dates are kept as entered', async () => {
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

test.describe('International Tax Type Setup — Reg. Number required', () => {
  let its: InternationalTaxTypeSetupPage;

  test.beforeEach(async ({ utcPage, config }) => {
    its = new InternationalTaxTypeSetupPage(utcPage, config);
    await its.open(EDIT_OFFICE);
  });

  test('TC-ITS-VAL-008: A Provincial tax type needs its Reg. Number', async () => {
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

  test('TC-ITS-VAL-009: A GOV tax type needs its Reg. Number', async () => {
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

test.describe('International Tax Type Setup — unsaved changes', () => {
  let its: InternationalTaxTypeSetupPage;
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

  test('TC-ITS-UNS-001: Searching with unsaved changes asks first; Stay keeps them', async () => {
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

  test('TC-ITS-UNS-002: Discard drops the changes and runs the search', async () => {
    await about('Discard in the Unsaved changes dialog searches again, which puts the stored value back.');
    await its.clickSearch();
    await its.discard();
    await verify('The stored Reg. Number is back', async () => {
      expect(await regNow()).toBe(original);
    });
  });

  test('TC-ITS-UNS-003: Reset with unsaved changes asks first', async () => {
    await about('Reset with an edited row opens the Unsaved changes dialog; Stay keeps the criteria and the edit.');
    await its.reset();
    await its.getUnsavedDialogText();
    await its.stay();
    await verify('Rows and the edit are still there', async () => {
      expect(await its.getCount()).toBeGreaterThan(0);
      expect(await regNow()).toBe(edited);
    });
  });

  test('TC-ITS-UNS-004: Changing the country with unsaved changes asks first', async () => {
    await about('Picking another country with an edited row opens the Unsaved changes dialog; Stay keeps Canada and the edit.');
    await its.selectCountry('Mexico');
    await its.getUnsavedDialogText();
    await its.stay();
    await verify('Still Canada, edit kept', async () => {
      expect((await its.getCriteria()).country).toBe('Canada');
      expect(await regNow()).toBe(edited);
    });
  });

  test('TC-ITS-UNS-005: Leaving the page with unsaved changes asks first', async () => {
    await about('Clicking Home in the sidebar with an edited row opens the Unsaved changes dialog; Stay keeps the page and the edit.');
    await its.clickSidebarHome();
    await its.getUnsavedDialogText();
    await its.stay();
    await verify('Still on the page with the edit', async () => {
      expect(its.page.url()).toContain('/taxes/international-tax-type-setup');
      expect(await regNow()).toBe(edited);
    });
  });

  test('TC-ITS-UNS-006: Reloading with unsaved changes raises the browser leave-page prompt', async () => {
    await about("Reloading the browser page with an edited row makes the browser ask before leaving (its own 'Leave site?' prompt).");
    const asked: string[] = [];
    its.page.on('dialog', (d) => asked.push(d.type()));
    await its.reload();
    await verify('The browser asked before leaving', async () => {
      expect(asked).toContain('beforeunload');
    });
  });
});
