import { test, expect } from '../../src/fixtures/pages.fixture';
import { SpecialRatePage, addDays, wireDate } from '../../src/pages/taxes/special-rate.page';
import { phase, verify, about } from '../../src/fixtures/report-steps';
import { EDIT_OFFICE, PW, PLACE, ALERT, TEXT, NOTES_MAX } from '../../src/data/taxes/special-rate';

// Tax → Special Rate (NM-4022), Basic Information tab: editing rules and the unsaved-changes guard. These
// cases edit Palau's Rental row (record of 01/19/2006) and never store anything: where a save is needed
// the server reply is given in the browser. They run on a UTC page, where dates show as stored.

test.describe.configure({ timeout: 180_000 });

const NEXT = addDays(PW.editSince, 1);

test.describe('Special Rate — editing rules', () => {
  let sr: SpecialRatePage;

  test.beforeEach(async ({ utcPage, config }) => {
    sr = new SpecialRatePage(utcPage, config);
    await sr.open(EDIT_OFFICE);
  });

  const editRow = async () => {
    await sr.choose('state', PW.state);
    await sr.search();
    return sr.row(PW.edit);
  };

  test('TC-SR-VAL-001: Only Taxable, Special, Effective Date and Notes can be edited; the rate box follows the row level', async () => {
    await about(
      'A state-level row offers Taxable, Special, Effective Date and Notes. Ticking Special opens the rate box of the row\'s own level: ' +
        'State Special on a state row, County Special on a county row, City Special on a city row.',
    );
    const row = await editRow();
    const taxable = [await sr.toggle(row, 'Taxable'), await sr.toggle(row, 'Taxable')];
    await sr.toggle(row, 'Special');
    // Taxable and Special are checkboxes only while being clicked, so the inputs left are the other editors.
    const stateEditable = await sr.editableColumns(row);
    const stateRate = await sr.rateColumn(row);
    await sr.clickSearch();
    await sr.discard();
    await sr.choose('state', PLACE.state);
    await sr.choose('county', PLACE.county);
    await sr.search();
    await sr.toggle(sr.firstRow(), 'Special');
    const countyRate = await sr.rateColumn(sr.firstRow());
    await sr.clickSearch();
    await sr.discard();
    await sr.choose('city', PLACE.city);
    await sr.search();
    await sr.toggle(sr.firstRow(), 'Special');
    const cityRate = await sr.rateColumn(sr.firstRow());
    await verify('State row: Taxable and Special tick on and off; the other editors are Effective Date, State Special (rate) and Notes', async () => {
      expect(taxable).toEqual(['Yes', 'No']);
      expect(stateEditable).toEqual(['Effective Date', 'State Special', 'Notes']);
      expect(stateRate).toBe('State Special');
    });
    await verify('County row: County Special; city row: City Special', async () => {
      expect(countyRate).toBe('County Special');
      expect(cityRate).toBe('City Special');
    });
  });

  for (const column of ['Special', 'Taxable'] as const) {
    test(`TC-SR-VAL-${column === 'Special' ? '002' : '003'}: Changing ${column} needs a new Effective Date`, async () => {
      await about(`Changing ${column} without changing the date marks the row and keeps Save off.`);
      const row = await editRow();
      await sr.toggle(row, column);
      await verify(`"${ALERT.newDateNeeded}"; Save is disabled`, async () => {
        expect(await sr.getRowMessages(row)).toEqual([ALERT.newDateNeeded]);
        expect(await sr.isSaveEnabled()).toBe(false);
      });
    });
  }

  test('TC-SR-VAL-015: A row changed without a new date is marked and cannot be saved', async () => {
    await about('After ticking Special without a new date, the row is marked with the warning icon, whose title holds the reason, and Save is off.');
    const row = await editRow();
    await sr.toggle(row, 'Special');
    await verify(`The warning holds "${ALERT.newDateNeeded}"; Save is disabled`, async () => {
      expect(await sr.getRowMessages(row)).toEqual([ALERT.newDateNeeded]);
      expect(await sr.isSaveEnabled()).toBe(false);
    });
  });

  test('TC-SR-VAL-004: The new Effective Date must be after the current record', async () => {
    await about(`Rental's record applies from ${PW.editSince}; a date before it is refused, the day after is accepted.`);
    const row = await editRow();
    await sr.toggle(row, 'Special');
    await sr.editRate(row, '2');
    await sr.editDate(row, '01/01/2006');
    await verify(`01/01/2006: "${ALERT.dateAfter(PW.editSince)}"; Save is disabled`, async () => {
      expect(await sr.getRowMessages(row)).toEqual([ALERT.dateAfter(PW.editSince)]);
      expect(await sr.isSaveEnabled()).toBe(false);
    });
    await sr.editDate(row, NEXT);
    await verify(`${NEXT}: no message; Save is enabled`, async () => {
      expect(await sr.getRowMessages(row)).toEqual([]);
      expect(await sr.isSaveEnabled()).toBe(true);
    });
  });

  test('TC-SR-VAL-005: An empty or impossible Effective Date is refused', async () => {
    await about('Clearing the row\'s date gives "Required"; 13/45/2099 gives "Invalid date"; Save stays off.');
    const row = await editRow();
    await sr.toggle(row, 'Special');
    await sr.editRate(row, '2');
    await sr.editDate(row, '');
    await verify(`Empty: "${ALERT.required}"`, async () => {
      expect(await sr.getRowMessages(row)).toEqual([ALERT.required]);
      expect(await sr.isSaveEnabled()).toBe(false);
    });
    await sr.editDate(row, '13/45/2099');
    await verify(`13/45/2099: "${ALERT.invalidDate}"`, async () => {
      expect(await sr.getRowMessages(row)).toEqual([ALERT.invalidDate]);
      expect(await sr.isSaveEnabled()).toBe(false);
    });
  });

  test('TC-SR-VAL-006: A day picked in the row calendar is the day shown', async () => {
    await about('Opening the row calendar and picking the 20th puts the 20th of that month in the cell.');
    const row = await editRow();
    await sr.toggle(row, 'Special');
    const picked = await sr.pickCalendarDay(row, 20);
    await verify('The cell shows the 20th of the month the calendar showed', async () => {
      const [month, year] = picked.shownMonth.split(' ');
      const m = new Date(`1 ${month} ${year}`).getMonth() + 1;
      expect(picked.value).toBe(`${String(m).padStart(2, '0')}/20/${year}`);
    });
  });

  test('TC-SR-VAL-007: Notes keep at most 500 characters', async () => {
    await about(`Typing 600 characters into Notes keeps the first ${NOTES_MAX}.`);
    const row = await editRow();
    const kept = await sr.editNotes(row, 'N'.repeat(600));
    await verify(`maxlength ${NOTES_MAX}; ${NOTES_MAX} characters kept`, async () => {
      expect(await sr.notesMaxLength(row)).toBe(NOTES_MAX);
      expect(kept).toHaveLength(NOTES_MAX);
    });
  });

  test('TC-SR-VAL-008: Changing only Notes can be saved, or the page says why not', async () => {
    await about('Notes is editable on its own; after changing only Notes, Save should turn on — or the row should say what else is needed.');
    const row = await editRow();
    await sr.editNotes(row, 'SR-AUTO note only');
    const messages = await sr.getRowMessages(row);
    const canSave = await sr.isSaveEnabled();
    await verify('Save is enabled, or the row carries a message', async () => {
      expect(canSave || messages.length > 0, `Save enabled: ${canSave}; row messages: ${JSON.stringify(messages)}`).toBe(true);
    });
  });

  test('TC-SR-VAL-009: A rate typed in percent is stored as a fraction', async () => {
    await about('Rates are shown as fractions (0.010000 = 1%). Typing 2, 1.25 or 1 means that many percent: 0.020000, 0.012500, 0.010000.');
    const row = await editRow();
    await sr.toggle(row, 'Special');
    const shown: Record<string, string> = {};
    for (const v of ['2', '1.25', '1']) shown[v] = await sr.editRate(row, v);
    await verify('2 → 0.020000, 1.25 → 0.012500, 1 → 0.010000', async () => {
      expect(shown).toEqual({ '2': '0.020000', '1.25': '0.012500', '1': '0.010000' });
    });
  });

  test('TC-SR-VAL-010: A rate below 1 percent is read in percent too', async () => {
    await about('Typing 0.5 means half a percent like any other typed rate, so the box should show 0.005000 — not 0.500000, which is 50%.');
    const row = await editRow();
    await sr.toggle(row, 'Special');
    const shown = await sr.editRate(row, '0.5');
    await verify('0.5 → 0.005000', async () => {
      expect(shown).toBe('0.005000');
    });
  });

  for (const [id, value, kept, what] of [['011', '150', '1.000000', 'over 100% is capped at 100%'], ['012', '-1', '0.000000', 'below 0 is raised to 0']] as const) {
    test(`TC-SR-VAL-${id}: A rate ${what}`, async () => {
      await about(`The rate box keeps rates between 0% and 100%: typing ${value} leaves ${kept} in the box, and with a new date the row can be saved.`);
      const row = await editRow();
      await sr.toggle(row, 'Special');
      const shown = await sr.editRate(row, value);
      await sr.editDate(row, NEXT);
      await verify(`${value} → ${kept}; no message; Save enabled`, async () => {
        expect(shown).toBe(kept);
        expect(await sr.getRowMessages(row)).toEqual([]);
        expect(await sr.isSaveEnabled()).toBe(true);
      });
    });
  }

  test('TC-SR-VAL-013: A rate keeps six decimals', async () => {
    await about('Typing 1.23456789 (percent) gives 0.012346, rounded to six decimals.');
    const row = await editRow();
    await sr.toggle(row, 'Special');
    await verify('1.23456789 → 0.012346', async () => expect(await sr.editRate(row, '1.23456789')).toBe('0.012346'));
  });

  test('TC-SR-VAL-014: Save sends exactly what was entered', async () => {
    await about('Special, a 2% rate, Notes and the next day are sent as one record for the row. The server reply is given in the browser, so nothing is stored.');
    const row = await editRow();
    const stop = await sr.answerSavesWithSuccess();
    try {
      await sr.toggle(row, 'Special');
      await sr.editRate(row, '2');
      await sr.editNotes(row, 'SR-AUTO sent');
      await sr.editDate(row, NEXT);
      const result = await phase('Save', () => sr.save());
      await verify(`One record: ${PW.state} ${PW.edit}, Special, 0.02, ${NEXT}, the note`, async () => {
        expect(result.toast).toBe(TEXT.saved);
        expect(result.records).toHaveLength(1);
        expect(result.records[0]).toMatchObject({
          stateName: PW.state, taxTypeName: PW.edit, special: true, specialRate: 0.02, stateSpecialRate: 0.02, taxable: false,
          effectiveDate: wireDate(NEXT), notes: 'SR-AUTO sent',
        });
      });
    } finally {
      await stop();
    }
  });
});

test.describe('Special Rate — unsaved changes', () => {
  let sr: SpecialRatePage;

  test.beforeEach(async ({ utcPage, config }) => {
    sr = new SpecialRatePage(utcPage, config);
    await sr.open(EDIT_OFFICE);
    await sr.choose('state', PW.state);
    await sr.search();
    await sr.toggle(sr.row(PW.edit), 'Special');
  });

  const special = async () => (await sr.readRow(sr.row(PW.edit))).Special;

  test('TC-SR-UNS-001: Searching with unsaved changes asks first; Stay keeps them', async () => {
    await about('With Special ticked on Rental, Search opens "Unsaved changes"; Stay closes it and keeps the edit.');
    await sr.clickSearch();
    await verify('The dialog and its text', async () => {
      expect(await sr.getUnsavedDialogText()).toContain(TEXT.unsavedBody);
    });
    await sr.stay();
    await verify('Rental is still ticked Special', async () => expect(await special()).toBe('Yes'));
  });

  test('TC-SR-UNS-002: Discard drops the changes and searches', async () => {
    await about('Choosing Discard drops the edit and runs the search: Rental is back to not Special.');
    await sr.clickSearch();
    await sr.getUnsavedDialogText();
    await sr.discard();
    await verify('Rental is not Special; Save is off', async () => {
      await expect.poll(special).toBe('No');
      expect(await sr.isSaveEnabled()).toBe(false);
    });
  });

  test('TC-SR-UNS-003: Reset with unsaved changes asks first; Discard resets', async () => {
    await about('Reset with an edit opens "Unsaved changes"; Discard then resets the criteria and empties the grid.');
    await sr.reset();
    await sr.getUnsavedDialogText();
    await sr.discard();
    await verify('Criteria back to All; the grid asks for a search', async () => {
      await expect.poll(() => sr.getCount()).toBe(0);
      expect((await sr.getCriteria()).state).toBe('All');
    });
  });

  test('TC-SR-UNS-004: Switching tab with unsaved changes asks first', async () => {
    await about('Clicking Special Rate History with an edit opens "Unsaved changes": Stay keeps Basic Information and the edit; Discard opens the history.');
    await sr.clickTab('Special Rate History');
    await sr.getUnsavedDialogText();
    await sr.stay();
    await verify('Still on Basic Information, Rental still Special', async () => {
      expect(await sr.selectedTab()).toBe('Basic Information');
      expect(await special()).toBe('Yes');
    });
    await sr.clickTab('Special Rate History');
    await sr.getUnsavedDialogText();
    await sr.discard();
    await verify('Special Rate History is open', async () => expect(await sr.selectedTab()).toBe('Special Rate History'));
  });

  test('TC-SR-UNS-005: Closing the dialog keeps the changes', async () => {
    await about('Close (×) on "Unsaved changes" behaves like Stay.');
    await sr.clickSearch();
    await sr.getUnsavedDialogText();
    await sr.closeDialog();
    await verify('Rental still Special', async () => expect(await special()).toBe('Yes'));
  });

  test('TC-SR-UNS-006: Reloading with unsaved changes asks the browser first', async () => {
    await about('Reloading with an edit makes the browser ask before leaving (the test session then confirms leaving).');
    const asked = await sr.reloadAndWatchPrompt();
    await verify('A leave-page prompt was raised', async () => {
      expect(asked).toBe('beforeunload');
    });
  });
});
