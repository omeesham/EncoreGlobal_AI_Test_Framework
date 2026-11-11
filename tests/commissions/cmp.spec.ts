import { test, expect } from '../../src/fixtures/pages.fixture';
import { CmpPage, HistoryRow } from '../../src/pages/commissions/cmp.page';
import { phase, verify, about } from '../../src/fixtures/report-steps';
import {
  OFFICE, FIRST_OFFICE, BUSINESS_TYPES, ALL_BUSINESS_TYPES, EDIT_OFFICE, OTHER_TYPE, MULTI_TYPE_OFFICE, LOCAL_OFFICE, COUNTRY_OFFICES,
  INACTIVE_OFFICES, HISTORY_COLUMNS, PAGE_SIZES, EXPORT, VALID_ENTRIES, STRIPPED_ENTRIES, BELOW_ONE, OVER_100, WHOLE_NUMBERS, PASTES, BAD_PAGE_NUMBERS, HISTORY_EXPORT_COLUMNS, OTHER_MENU_PAGE, TEXT,
} from '../../src/data/commissions/cmp';

// Commissions → CMP (NM-3649): one CMP commission percentage per local office and business type, set from the
// corporate office (1101) through Change Local Office and saved after a confirmation; History lists every
// change. Covered: opening the page (on 1101, a local office's view-only page, the three country offices),
// the office dialog, Business Type (the types ticked in Settings > Location), the Commission field (typing
// and pasting), saving, unsaved-change guards (office, tab, sidebar, reload), both exports, History
// sorting, paging, resizing and failures, the keyboard and the sidebar toggle.
// Saving cases change office 1107 only and put its value back. Every business type is ticked for 1107.

test.describe.configure({ timeout: 180_000 });

const num = (shown: string): number => Number.parseFloat(shown.replace(/[^\d.]/g, ''));
const day = (d: Date, timeZone?: string): string => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone }).replace(/ /g, '-');
const today = (): string => day(new Date());
/** The History export's UTC time (MM/DD/YYYY HH:mm:ss) as a grid date, in UTC and in local time. */
const exportDates = (t: string): string[] => {
  const at = new Date(t.replace(/^(\d{2})\/(\d{2})\/(\d{4}) (.*)$/, '$3-$1-$2T$4Z'));
  return [day(at, 'UTC'), day(at)];
};

test.describe('CMP Commissions @commissions', () => {
  let cmp: CmpPage;

  test.beforeEach(async ({ authenticatedSession, config }) => {
    cmp = new CmpPage(authenticatedSession.page, config);
  });

  /** Opens the page, picks the office the saving cases use, and returns its saved value. */
  const openEditOffice = async (): Promise<string> => {
    await cmp.open(OFFICE);
    await cmp.pickOffice(EDIT_OFFICE);
    return cmp.commission();
  };
  /** A value different from the saved one. */
  const other = (saved: string, wanted: string): string => (num(saved) === Number(wanted) ? String(Number(wanted) + 1) : wanted);

  test.describe('A. Page load', () => {
    test('TC-COM-CMP-001: Without a session the page sends the user to sign in', { tag: '@C107847' }, async ({ browser, config }) => {
      await about('Opening the page with no signed-in session lands on the sign-in page, which returns to this page afterwards.');
      const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
      try {
        const page = await context.newPage();
        const path = `/locations/${OFFICE}/commissions/cmp`;
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

    test('TC-COM-CMP-002: The Commissions menu opens CMP Commissions on Basic Information', { tag: '@C107848' }, async () => {
      await about(`The Commissions menu lists ${TEXT.menuItems.join(', ')}; CMP opens "${TEXT.heading}" with its two tabs, Basic Information selected.`);
      const items = await cmp.openFromMenu(OFFICE);
      const head = await cmp.heading();
      await verify('Menu items, page title, heading and tabs', async () => {
        expect(items).toEqual(expect.arrayContaining([...TEXT.menuItems]));
        expect(head).toEqual({ heading: true, title: TEXT.pageTitle, tabs: [...TEXT.tabs], selected: TEXT.tabs[0] });
      });
    });

    test('TC-COM-CMP-003: The first view shows an office, its business type and saved commission', { tag: '@C107849' }, async () => {
      await about(`The page opens on ${FIRST_OFFICE}, Audio Visual, with the commission the export holds for that office; Export is on and Save is off.`);
      await cmp.open(OFFICE);
      const view = await cmp.view();
      const { rows } = await cmp.exportFile();
      const saved = rows.find((r) => (r[0] ?? '').startsWith(FIRST_OFFICE.slice(0, 4)));
      await verify('Office, business type, commission and buttons', async () => {
        expect(view).toMatchObject({ office: FIRST_OFFICE, businessType: BUSINESS_TYPES[0], save: false, export: true });
        expect(view.commission).toMatch(/^\d+(\.\d+)? %$/);
        expect(num(view.commission)).toBe(num(saved?.[2] ?? ''));
      });
    });

    test('TC-COM-CMP-004: The information icon explains the page, by mouse and by keyboard', { tag: '@C107850' }, async () => {
      await about(`Hovering or focusing the (i) next to the heading shows "${TEXT.info}".`);
      await cmp.open(OFFICE);
      const hover = await cmp.infoTooltip('hover');
      const focus = await cmp.infoTooltip('focus');
      await verify('The same tooltip both ways', async () => expect([hover, focus]).toEqual([TEXT.info, TEXT.info]));
    });

    for (const office of COUNTRY_OFFICES) {
      test.describe(`${office.country} ${office.code}`, () => {
        test(`${office.tc}: The page is not offered and shows its error message`, { tag: office.tag }, async () => {
          await about(`CMP is not set from ${office.code}: the page shows "${TEXT.crash}" with ${TEXT.tryAgain}, and no commission field.`);
          await cmp.open(office.code);
          await verify('Error message, Try again, no field', async () => {
            await expect(cmp.main.getByText(TEXT.crash)).toBeVisible();
            await expect(cmp.main.getByRole('button', { name: TEXT.tryAgain })).toBeVisible();
            await expect(cmp.input).toHaveCount(0);
          });
        });
      });
    }

    test.describe(`Local office ${LOCAL_OFFICE.code}`, () => {
      test(`TC-COM-CMP-008: On a local office (${LOCAL_OFFICE.code}) the page only shows its commissions`, { tag: '@C107906' }, async () => {
        await about(`Opened on ${LOCAL_OFFICE.code}, the page has only Basic Information, shows "${LOCAL_OFFICE.name}" with no Change Local Office, lets Business Type be chosen, keeps the Commission field off and has no Save or Export.`);
        await cmp.open(LOCAL_OFFICE.code);
        const head = await cmp.heading();
        const view = await cmp.localView();
        await verify('One tab, fixed office, field off, no Save or Export', async () => {
          expect(head).toEqual({ heading: true, title: TEXT.pageTitle, tabs: [TEXT.tabs[0]], selected: TEXT.tabs[0] });
          expect(view).toEqual({ office: LOCAL_OFFICE.name, picker: 0, field: false, save: 0, export: 0, businessType: ALL_BUSINESS_TYPES[0] });
        });
      });
  
      test(`TC-COM-CMP-009: On a local office each business type shows the commission set for it from ${OFFICE}`, { tag: '@C107907' }, async () => {
        await about(`On ${LOCAL_OFFICE.code}, Business Type lists the types ticked for it in Settings > Location, and each shows the commission ${OFFICE} shows for ${LOCAL_OFFICE.code}.`);
        const ticked = await cmp.locationBusinessTypes(LOCAL_OFFICE.code);
        await cmp.open(LOCAL_OFFICE.code);
        const local = await cmp.commissionsByType();
        await cmp.open(OFFICE);
        await cmp.pickOffice(LOCAL_OFFICE.code);
        const central = await cmp.commissionsByType();
        await verify(`The ticked types, with the same commissions as on ${OFFICE}`, async () => {
          expect(Object.keys(local)).toEqual(ticked);
          expect(local).toEqual(central);
        });
      });
    });
  });

  test.describe('B. Change Local Office', () => {
    test('TC-COM-CMP-010: The dialog shows the current office, a filter, a search and the office list', { tag: '@C107854' }, async () => {
      await about('Change Local Office names the current office, has Active/Inactive ticked, a search box, Local Office and Local Office Name columns; the current office is ticked.');
      await cmp.open(OFFICE);
      await cmp.openPicker();
      const info = await cmp.pickerInfo();
      await verify('Dialog contents', async () => {
        expect(info).toMatchObject({ current: FIRST_OFFICE, activeTicked: true, placeholder: TEXT.pickerSearch, columns: [...TEXT.pickerColumns], checked: [FIRST_OFFICE.replace(' - ', ' ')] });
        expect((await cmp.pickerOffices()).length).toBeGreaterThan(1);
      });
    });

    test('TC-COM-CMP-011: Only one office can be ticked', { tag: '@C107855' }, async () => {
      await about('Ticking 1112 and then 1121 leaves only 1121 ticked, and Select turns on.');
      await cmp.open(OFFICE);
      await cmp.openPicker();
      await cmp.tickOffice('1112');
      await cmp.tickOffice('1121');
      await verify('One ticked office', async () => {
        expect(await cmp.checkedOffices()).toEqual(['1121 InterContinental Chicago']);
        expect((await cmp.pickerInfo()).select).toBe(true);
      });
    });

    test('TC-COM-CMP-012: Search finds offices by number, part of a number, or name in any case', { tag: '@C107856' }, async () => {
      await about(`"1107", "hedge" and "HEDGE Corp" find 1107; "11" keeps every 11xx office; "zzzz" shows "${TEXT.noResults}".`);
      await cmp.open(OFFICE);
      await cmp.openPicker();
      const all = await cmp.pickerOffices();
      const found: Record<string, string[]> = {};
      for (const q of ['1107', 'hedge', 'HEDGE Corp', '11', 'zzzz']) found[q] = await cmp.searchOffices(q);
      await verify('Each search', async () => {
        for (const q of ['1107', 'hedge', 'HEDGE Corp']) expect.soft(found[q], q).toEqual(['1107 HEDGE Corp SGA Budget Only']);
        expect.soft(found['11'], '11').toEqual(all.filter((o) => o.includes('11')));
        expect.soft(found.zzzz, 'zzzz').toEqual([TEXT.noResults]);
      });
    });

    test('TC-COM-CMP-013: Spaces around the text are searched for too', { tag: '@C107857' }, async () => {
      await about(`A space before or after the text is part of the search: " 16" lists only offices whose name holds " 16"; " 1606", "1606 " and "  1107  " show "${TEXT.noResults}".`);
      await cmp.open(OFFICE);
      await cmp.openPicker();
      const spaced = await cmp.searchOffices(' 16');
      const none: Record<string, string[]> = {};
      for (const q of [' 1606', '1606 ', '  1107  ']) none[q] = await cmp.searchOffices(q);
      await verify(`" 16" matches the text with its space; the others find nothing`, async () => {
        expect(spaced.length).toBeGreaterThan(0);
        for (const o of spaced) expect.soft(o, '" 16"').toContain(' 16');
        for (const [q, got] of Object.entries(none)) expect.soft(got, `"${q}"`).toEqual([TEXT.noResults]);
      });
    });

    test('TC-COM-CMP-014: Unticking the current office turns Select off; an office is ticked only by its box', { tag: '@C107898' }, async () => {
      await about('Unticking the ticked office leaves none ticked and Select off; clicking an office\'s name does not tick it; ticking its box does and turns Select on.');
      await cmp.open(OFFICE);
      await cmp.openPicker();
      await cmp.tickOffice(FIRST_OFFICE.slice(0, 4));
      const none = [await cmp.checkedOffices(), (await cmp.pickerInfo()).select];
      await cmp.clickOfficeName('1112');
      const byName = await cmp.checkedOffices();
      await cmp.tickOffice('1112');
      await verify('None ticked, name ignored, box ticks', async () => {
        expect(none).toEqual([[], false]);
        expect(byName).toEqual([]);
        expect([await cmp.checkedOffices(), (await cmp.pickerInfo()).select]).toEqual([['1112 Dallas Data Center'], true]);
      });
    });

    test('TC-COM-CMP-015: Offices are listed by number; a search narrows the list and clearing it brings it back', { tag: '@C107899' }, async () => {
      await about('The list runs in office-number order; "chicago" narrows it and keeps every listed office whose name holds Chicago; clearing the search shows the whole list again.');
      await cmp.open(OFFICE);
      await cmp.openPicker();
      const all = await cmp.pickerOffices();
      const chicago = await cmp.searchOffices('chicago');
      const cleared = await cmp.searchOffices('');
      await verify('Order, search and clear', async () => {
        const codes = all.map((o) => o.slice(0, 4));
        expect(codes).toEqual([...codes].sort());
        expect(chicago).not.toEqual(all);
        expect(chicago).toEqual(expect.arrayContaining(all.filter((o) => /chicago/i.test(o))));
        expect(cleared).toEqual(all);
      });
    });

    test('TC-COM-CMP-016: Unticking Active/Inactive adds the inactive offices', { tag: '@C107858' }, async () => {
      await about(`Unticked, the list adds inactive offices (${INACTIVE_OFFICES.join(', ')}); ticked again, they go.`);
      await cmp.open(OFFICE);
      await cmp.openPicker();
      const codes = async () => (await cmp.pickerOffices()).map((o) => o.slice(0, 4));
      const active = await codes();
      await cmp.toggleActiveFilter();
      const all = await codes();
      await cmp.toggleActiveFilter();
      await verify('Inactive offices only while unticked', async () => {
        for (const o of INACTIVE_OFFICES) expect.soft([active.includes(o), all.includes(o)], o).toEqual([false, true]);
        expect(await codes()).toEqual(active);
      });
    });

    test('TC-COM-CMP-017: Cancel, Close and Escape leave the office unchanged', { tag: '@C107859' }, async () => {
      await about('With another office ticked, each way of closing the dialog without Select keeps the current office.');
      await cmp.open(OFFICE);
      for (const how of ['Cancel', 'Close', 'Escape'] as const) {
        await cmp.openPicker();
        await cmp.tickOffice('1112');
        await cmp.closePicker(how);
        await verify(`${how}: still ${FIRST_OFFICE}`, async () => expect((await cmp.view()).office).toBe(FIRST_OFFICE));
      }
    });

    test('TC-COM-CMP-018: Picking an office shows its saved commission, or an empty field when it has none', { tag: '@C107860' }, async () => {
      await about(`After Select, the page shows the office and the commission the export holds for it; an office with no commission shows an empty field.`);
      await cmp.open(OFFICE);
      const { rows } = await cmp.exportFile();
      // The page opens an office on Audio Visual, so that is the commission it shows.
      const saved = new Map(rows.slice(1).filter((r) => r[1] === BUSINESS_TYPES[0]).map((r) => [(r[0] ?? '').slice(0, 4), num(r[2] ?? '')]));
      await cmp.openPicker();
      const empty = (await cmp.pickerOffices()).map((o) => o.slice(0, 4)).find((o) => !saved.has(o))!;
      await cmp.closePicker('Cancel');
      for (const office of [EDIT_OFFICE, empty]) {
        await cmp.pickOffice(office);
        const view = await cmp.view();
        await verify(`${office}: ${saved.has(office) ? saved.get(office) + ' %' : 'empty'}`, async () => {
          expect(view.office.startsWith(`${office} - `)).toBe(true);
          if (saved.has(office)) expect(num(view.commission)).toBe(saved.get(office));
          else expect(view.commission).toBe('');
        });
      }
    });

    test('TC-COM-CMP-019: When an office fails to load, the page keeps the previous commission without a message', { tag: '@C107861' }, async () => {
      await about(`With the server failing to load ${EDIT_OFFICE}, the office changes to ${EDIT_OFFICE}, the field keeps the commission already shown, no message appears and the page keeps working.`);
      await cmp.open(OFFICE);
      const previous = await cmp.commission();
      const undo = await cmp.failOfficeLoad(EDIT_OFFICE);
      try {
        await cmp.pickOffice(EDIT_OFFICE);
      } finally {
        await undo();
      }
      const view = await cmp.view();
      await verify('Office changed, commission kept, no message', async () => {
        expect(view.office.startsWith(`${EDIT_OFFICE} - `)).toBe(true);
        expect(view.commission).toBe(previous);
        expect(await cmp.toasts()).toEqual([]);
        expect(await cmp.crashed()).toBe(false);
      });
    });
  });

  test.describe('C. Business Type', () => {
    test('TC-COM-CMP-020: Business Type offers Audio Visual, by mouse and by keyboard', { tag: '@C107862' }, async () => {
      await about(`On ${FIRST_OFFICE} the Business Type list holds Audio Visual, selected, whether opened by click or by keyboard.`);
      await cmp.open(OFFICE);
      const byMouse = await cmp.businessTypeOptions('mouse');
      const byKeys = await cmp.businessTypeOptions('keyboard');
      await verify('Audio Visual, both ways', async () => {
        expect([byMouse, byKeys]).toEqual([[...BUSINESS_TYPES], [...BUSINESS_TYPES]]);
        expect((await cmp.view()).businessType).toBe(BUSINESS_TYPES[0]);
      });
    });

    test('TC-COM-CMP-021: Business Type lists the types ticked for the office in Settings > Location', { tag: '@C107863' }, async () => {
      await about(`${EDIT_OFFICE} has all ${ALL_BUSINESS_TYPES.length} business types ticked in Settings > Location and offers all of them; ${FIRST_OFFICE.slice(0, 4)} has only Audio Visual ticked and offers only it.`);
      const found: [string, string[], string[]][] = [];
      for (const office of [EDIT_OFFICE, FIRST_OFFICE.slice(0, 4)]) {
        const ticked = await cmp.locationBusinessTypes(office);
        await cmp.open(OFFICE);
        if (office !== FIRST_OFFICE.slice(0, 4)) await cmp.pickOffice(office);
        found.push([office, ticked, await cmp.businessTypeOptions('mouse')]);
      }
      await verify('The offered types are the ticked ones', async () => {
        expect(found.map(([o, t]) => [o, t])).toEqual([[EDIT_OFFICE, [...ALL_BUSINESS_TYPES]], [FIRST_OFFICE.slice(0, 4), [...BUSINESS_TYPES]]]);
        for (const [office, ticked, offered] of found) expect.soft(offered, office).toEqual(ticked);
      });
    });

    test(`TC-COM-CMP-022: Each business type shows its own saved commission, as the export lists it`, { tag: '@C107908' }, async () => {
      await about(`On ${MULTI_TYPE_OFFICE}, choosing each business type shows the commission the export holds for that type (e.g. Expo Services 18 %; the export rounds to two decimals), and an empty field for a type with none.`);
      await cmp.open(OFFICE);
      const { rows } = await cmp.exportFile();
      await cmp.pickOffice(MULTI_TYPE_OFFICE);
      const shown = await cmp.commissionsByType();
      const exported = new Map(rows.slice(1).filter(([o = '']) => o.startsWith(MULTI_TYPE_OFFICE)).map(([, type = '', value = '']) => [type, num(value)]));
      await verify(`${MULTI_TYPE_OFFICE}: each type's commission as exported`, async () => {
        expect(exported.size).toBeGreaterThan(1);
        for (const [type, value] of Object.entries(shown)) expect.soft(value ? Number(num(value).toFixed(2)) : null, type).toBe(exported.get(type) ?? null);
      });
    });
  });

  test.describe('D. Commission field', () => {
    test('TC-COM-CMP-023: Whole and decimal percentages up to 100 are taken and shown with %', { tag: '@C107864' }, async () => {
      await about(`${VALID_ENTRIES.map(([t, s]) => `"${t}" → "${s}"`).join(', ')}; each turns Save on.`);
      const saved = await openEditOffice();
      for (const [typed, shown] of VALID_ENTRIES.filter(([t]) => num(saved) !== Number(t))) {
        await cmp.typeCommission(typed);
        await verify(`"${typed}" shows "${shown}", Save on`, async () => expect([await cmp.commission(), (await cmp.view()).save]).toEqual([shown, true]));
      }
    });

    test('TC-COM-CMP-024: Letters, symbols, signs and a second decimal point are not typed', { tag: '@C107865' }, async () => {
      await about(`${STRIPPED_ENTRIES.map(([t, s]) => `"${t}" → "${s}"`).join(', ')} while typing.`);
      await openEditOffice();
      for (const [typed, shown] of STRIPPED_ENTRIES) {
        const got = await cmp.typeCommission(typed);
        await verify(`"${typed}" → "${shown}"`, async () => expect(got).toBe(shown));
      }
    });

    test('TC-COM-CMP-025: Leading and trailing zeros do not change the value', { tag: '@C107866' }, async () => {
      await about('"0005" shows "5 %"; the saved value written with trailing zeros ("2.30" for 2.3) is not a change, so Save stays off.');
      const saved = await openEditOffice();
      await cmp.typeCommission('0005');
      const five = await cmp.commission();
      await cmp.typeCommission(`${num(saved).toFixed(2)}`);
      await verify('"5 %", and Save off for the same value', async () => {
        expect(five).toBe('5 %');
        expect(num(await cmp.commission())).toBe(num(saved));
        expect((await cmp.view()).save).toBe(false);
      });
    });

    test('TC-COM-CMP-026: A value below 1 is read as a fraction and shown as a percentage', { tag: '@C107867' }, async () => {
      await about(`${BELOW_ONE.map(([t, p]) => `"${t}" → ${p} %`).join(', ')}, and that percentage is what Save sends (the saves are held back).`);
      await openEditOffice();
      const held = await cmp.holdSaves('network');
      try {
        for (const [typed, percent] of BELOW_ONE) {
          await cmp.typeCommission(typed);
          const shown = await cmp.commission();
          await cmp.save();
          await verify(`"${typed}" shows and sends ${percent}`, async () => {
            expect.soft(shown, `shown for ${typed}`).toBe(`${percent} %`);
            expect.soft(held.sent.at(-1)?.cmpCommission as number, `sent for ${typed}`).toBeCloseTo(percent, 9);
          });
        }
      } finally {
        await held.undo();
      }
    });

    test('TC-COM-CMP-027: More than two decimals are taken as typed', { tag: '@C107868' }, async () => {
      await about('"2.555" is taken whole (the placeholder is 0.00): the field shows "2.555" while typing and "2.555 %" after, with Save on.');
      await openEditOffice();
      const typed = await cmp.typeCommission('2.555');
      await verify('"2.555", then "2.555 %", Save on', async () => expect([typed, await cmp.commission(), (await cmp.view()).save]).toEqual(['2.555', '2.555 %', true]));
    });

    test('TC-COM-CMP-028: Over 100 empties the field and keeps Save off', { tag: '@C107869' }, async () => {
      await about(`${OVER_100.join(', ')}: leaving the field empties it; Save stays off, so nothing over 100 can be saved.`);
      await openEditOffice();
      for (const v of OVER_100) {
        await cmp.typeCommission(v);
        await verify(`${v}: emptied, Save off`, async () => expect.soft([await cmp.commission(), (await cmp.view()).save], v).toEqual(['', false]));
      }
    });

    test('TC-COM-CMP-029: An empty or zero commission leaves the field empty and Save off', { tag: '@C107870' }, async () => {
      await about('Clearing the field, or typing 0, leaves it empty with its 0.00 placeholder; Save stays off, so an empty commission cannot be saved.');
      await openEditOffice();
      for (const v of ['', '0']) {
        await cmp.typeCommission(v);
        await verify(`"${v}": empty, Save off`, async () => expect.soft([await cmp.commission(), (await cmp.view()).save], `"${v}"`).toEqual(['', false]));
      }
    });

    test('TC-COM-CMP-030: A comma is left out of the number', { tag: '@C107871' }, async () => {
      await about('A comma is not typed, so "1,5" becomes 15 %.');
      await openEditOffice();
      const typed = await cmp.typeCommission('1,5');
      await verify('"15" while typing, "15 %" after', async () => expect([typed, await cmp.commission()]).toEqual(['15', '15 %']));
    });

    test('TC-COM-CMP-031: The Commission field is a decimal text box with a 0.00 placeholder', { tag: '@C107872' }, async () => {
      await about('The field under the Commission label is a text box asking for a decimal keyboard, shows 0.00 when empty and is not marked invalid.');
      await cmp.open(OFFICE);
      const attrs = await cmp.input.evaluate((e) => ['type', 'inputmode', 'placeholder', 'aria-invalid'].map((a) => e.getAttribute(a)));
      await verify('type text, inputmode decimal, placeholder 0.00, valid', async () => {
        expect(attrs).toEqual(['text', 'decimal', '0.00', 'false']);
        await expect(cmp.main.getByText('Commission', { exact: true })).toBeVisible();
      });
    });

    test('TC-COM-CMP-032: Pasting takes a plain number and refuses anything else whole', { tag: '@C107900' }, async () => {
      await about(`${PASTES.map(([p, s]) => `pasting "${p}" → "${s}"`).join(', ')}.`);
      await openEditOffice();
      const got: [string, string][] = [];
      for (const [pasted] of PASTES) got.push([pasted, await cmp.pasteCommission(pasted)]);
      await verify('Each paste', async () => expect(got).toEqual(PASTES.map(([p, s]) => [p, s])));
    });
  });

  test.describe('E. Saving', () => {
    test('TC-COM-CMP-033: Save turns on with a change and off again when the value is put back', { tag: '@C107873' }, async () => {
      await about(`On ${EDIT_OFFICE}: Save is off as loaded, on after a change, off again once the saved value is typed back.`);
      const saved = await openEditOffice();
      const states = [(await cmp.view()).save];
      await cmp.typeCommission(other(saved, '5'));
      states.push((await cmp.view()).save);
      await cmp.typeCommission(String(num(saved)));
      states.push((await cmp.view()).save);
      await verify('off, on, off', async () => expect(states).toEqual([false, true, false]));
    });

    test('TC-COM-CMP-034: Save works once an office is picked; the office shown on opening is view-only', { tag: '@C107874' }, async () => {
      await about(`Straight after opening, a change to ${FIRST_OFFICE}'s commission keeps Save off; after picking an office in Change Local Office, a change turns Save on.`);
      await cmp.open(OFFICE);
      await cmp.typeCommission(other(await cmp.commission(), '10'));
      const onOpening = (await cmp.view()).save;
      await cmp.typeCommission(other(await openEditOffice(), '10'));
      await verify('Off on opening, on after picking', async () => expect([onOpening, (await cmp.view()).save]).toEqual([false, true]));
    });

    test('TC-COM-CMP-035: Save asks to confirm, and Cancel sends nothing', { tag: '@C107875' }, async () => {
      await about(`Save opens "${TEXT.confirmTitle}" ("${TEXT.confirmText}"); Cancel closes it, sends nothing and keeps the edit.`);
      const saved = await openEditOffice();
      const value = other(saved, '9');
      await cmp.typeCommission(value);
      const { sent } = await cmp.save('click', 'Cancel');
      await verify('Nothing sent; the edit and Save stay', async () => {
        expect(sent).toEqual([]);
        expect([num(await cmp.commission()), (await cmp.view()).save]).toEqual([Number(value), true]);
      });
    });

    test('TC-COM-CMP-036: Enter on the Save button asks to confirm, and Escape closes the question without saving', { tag: '@C107901' }, async () => {
      await about(`With focus on Save, Enter opens "${TEXT.confirmTitle}"; Escape closes it, sends nothing and keeps the edit with Save on.`);
      const saved = await openEditOffice();
      const value = other(saved, '9');
      await cmp.typeCommission(value);
      const { sent, confirm } = await cmp.save('keyboard', 'Escape');
      await verify('Asked; nothing sent; the edit stays', async () => {
        expect(confirm).toContain(TEXT.confirmText);
        expect(sent).toEqual([]);
        expect([num(await cmp.commission()), (await cmp.view()).save]).toEqual([Number(value), true]);
      });
    });

    test('TC-COM-CMP-037: Saving stores the commission and records it in History and the export', { tag: '@C107876' }, async () => {
      await about(`Saving a new value on ${EDIT_OFFICE} sends it, shows "${TEXT.saved}", turns Save off, keeps the value after reloading, adds a History entry and changes the export. The old value is put back.`);
      const saved = await openEditOffice();
      const value = other(saved, '2.5');
      try {
        await cmp.typeCommission(value);
        const { sent, toasts, confirm } = await cmp.save();
        const after = await cmp.view();
        await cmp.open(OFFICE);
        await cmp.pickOffice(EDIT_OFFICE);
        const reloaded = await cmp.commission();
        const exported = (await cmp.exportFile()).rows.find((r) => (r[0] ?? '').startsWith(EDIT_OFFICE) && r[1] === BUSINESS_TYPES[0]);
        await cmp.openTab('Commission CMP History');
        const top = (await cmp.historyRows())[0]!;
        await verify('Sent, confirmed, kept, recorded', async () => {
          expect(confirm).toContain(TEXT.confirmText);
          expect(sent).toEqual([{ locationNo: EDIT_OFFICE, businessTypeId: 1, cmpCommission: Number(value) }]);
          expect(toasts).toContain(TEXT.saved);
          expect(after.save).toBe(false);
          expect(num(reloaded)).toBe(Number(value));
          expect(num(exported?.[2] ?? '')).toBe(Number(value));
          expect(top).toMatchObject({ 'Business Type': BUSINESS_TYPES[0], Action: TEXT.action, Commission: `${Number(value).toFixed(2)} %`, 'Modified On': today() });
          expect(top['Modified By'].toLowerCase()).toBe((process.env.NAVIGATOR_USERNAME ?? '').toLowerCase());
          expect(top['Local Office'].startsWith(`${EDIT_OFFICE}-`)).toBe(true);
        });
      } finally {
        await cmp.setCommission(EDIT_OFFICE, String(num(saved)));
      }
    });

    test(`TC-COM-CMP-038: A commission saved for another business type changes only that type`, { tag: '@C107909' }, async () => {
      await about(`On ${EDIT_OFFICE}, saving ${OTHER_TYPE.name} sends its business type (${OTHER_TYPE.id}), is kept after reloading, adds a History entry for ${OTHER_TYPE.name}, and leaves every other type as it was. A value it had before is put back.`);
      await openEditOffice();
      const before = await cmp.commissionsByType();
      const value = other(before[OTHER_TYPE.name] ?? '', '4');
      try {
        await cmp.selectBusinessType(OTHER_TYPE.name);
        await cmp.typeCommission(value);
        const { sent, toasts } = await cmp.save();
        await cmp.open(OFFICE);
        await cmp.pickOffice(EDIT_OFFICE);
        const after = await cmp.commissionsByType();
        await cmp.openTab('Commission CMP History');
        const top = (await cmp.historyRows())[0]!;
        await verify(`${OTHER_TYPE.name} saved on its own`, async () => {
          expect(sent).toEqual([{ locationNo: EDIT_OFFICE, businessTypeId: OTHER_TYPE.id, cmpCommission: Number(value) }]);
          expect(toasts).toContain(TEXT.saved);
          expect(after).toEqual({ ...before, [OTHER_TYPE.name]: `${value} %` });
          expect(top).toMatchObject({ 'Business Type': OTHER_TYPE.name, Commission: `${Number(value).toFixed(2)} %`, 'Modified On': today() });
          expect(top['Local Office'].startsWith(`${EDIT_OFFICE}-`)).toBe(true);
        });
      } finally {
        // An empty commission cannot be saved, so a type that had none keeps the new value.
        if (before[OTHER_TYPE.name]) await cmp.setCommission(EDIT_OFFICE, String(num(before[OTHER_TYPE.name]!)), OTHER_TYPE.name);
      }
    });

    test('TC-COM-CMP-039: 100 % can be saved', { tag: '@C107877' }, async () => {
      await about(`The top of the range saves on ${EDIT_OFFICE}; the old value is put back.`);
      const saved = await openEditOffice();
      try {
        await cmp.typeCommission('100');
        const { sent, toasts } = await cmp.save();
        await verify('100 sent and saved', async () => expect([sent.at(-1)?.cmpCommission, toasts.includes(TEXT.saved)]).toEqual([100, true]));
      } finally {
        await cmp.setCommission(EDIT_OFFICE, String(num(saved)));
      }
    });

    test('TC-COM-CMP-040: Enter in the field saves, and a double click on Save saves once', { tag: '@C107878' }, async () => {
      await about(`Enter in the Commission field starts the save; a double click on Save (used to put the old value back) sends one save.`);
      const saved = await openEditOffice();
      try {
        await cmp.typeCommission(other(saved, '3.75'));
        const byEnter = await cmp.save('enter');
        await cmp.typeCommission(String(num(saved)));
        const byDouble = await cmp.save('double');
        await verify('One save each', async () => {
          expect(byEnter.sent).toHaveLength(1);
          expect(byEnter.toasts).toContain(TEXT.saved);
          expect(byDouble.sent).toHaveLength(1);
        });
      } finally {
        await cmp.setCommission(EDIT_OFFICE, String(num(saved)));
      }
    });

    test('TC-COM-CMP-041: Whole numbers are sent as typed, to the precision of a decimal number', { tag: '@C107879' }, async () => {
      await about(`${WHOLE_NUMBERS.join(', ')} are sent as ${WHOLE_NUMBERS.join(', ')}; floating-point leftovers far below a hundredth (7.000000000000001) are accepted (the saves are held back).`);
      const saved = await openEditOffice();
      const values = WHOLE_NUMBERS.filter((v) => Number(v) !== num(saved)); // the saved value itself is no change to save
      const held = await cmp.holdSaves('network');
      try {
        for (const v of values) {
          await cmp.typeCommission(v);
          await cmp.save();
        }
      } finally {
        await held.undo();
      }
      await verify('The typed numbers', async () => {
        expect(held.sent).toHaveLength(values.length);
        values.forEach((v, i) => expect.soft(held.sent[i]?.cmpCommission as number, v).toBeCloseTo(Number(v), 9));
      });
    });

    test('TC-COM-CMP-042: A failed save says so and keeps the edit', { tag: '@C107880' }, async () => {
      await about(`When the server fails (500 or no connection), "${TEXT.saveFailed}" shows, the typed value stays and Save stays on.`);
      const saved = await openEditOffice();
      const value = other(saved, '6');
      for (const how of [500, 'network'] as const) {
        const held = await cmp.holdSaves(how);
        try {
          await cmp.typeCommission(value);
          const { toasts } = await cmp.save();
          await verify(`${how}: message, edit kept`, async () => {
            expect(toasts).toContain(TEXT.saveFailed);
            expect([num(await cmp.commission()), (await cmp.view()).save]).toEqual([Number(value), true]);
          });
        } finally {
          await held.undo();
        }
      }
    });
  });

  test.describe('F. Unsaved changes', () => {
    test('TC-COM-CMP-043: Changing office with an unsaved edit asks first: Stay keeps it, Discard moves on', { tag: '@C107881' }, async () => {
      await about(`"${TEXT.unsavedTitle}" ("${TEXT.unsavedText}") appears; Stay keeps ${EDIT_OFFICE} and the edit, Discard opens 1102 with its own value.`);
      const saved = await openEditOffice();
      const value = other(saved, '7');
      await cmp.typeCommission(value);
      await cmp.pickOffice('1102', 'Stay');
      const stayed = await cmp.view();
      await cmp.pickOffice('1102', 'Discard');
      const moved = await cmp.view();
      await verify('Stay, then Discard', async () => {
        expect([stayed.office.slice(0, 4), num(stayed.commission), stayed.save]).toEqual([EDIT_OFFICE, Number(value), true]);
        expect([moved.office, moved.save]).toEqual([FIRST_OFFICE, false]);
      });
    });

    test('TC-COM-CMP-044: Changing tab with an unsaved edit asks first: Stay keeps it, Discard drops it', { tag: '@C107882' }, async () => {
      await about('Opening History with an edit asks; Stay keeps Basic Information and the edit; Discard opens History, and Basic Information then shows the saved value.');
      const saved = await openEditOffice();
      const value = other(saved, '7');
      await cmp.typeCommission(value);
      await cmp.openTab('Commission CMP History');
      const text = await cmp.dialogText();
      await cmp.answerDialog('Stay');
      const stayed = [await cmp.selectedTab(), num(await cmp.commission())];
      await cmp.openTab('Commission CMP History');
      await cmp.answerDialog('Discard');
      const moved = await cmp.selectedTab();
      await cmp.openTab('Basic Information');
      await verify('Asked; Stay kept the edit; Discard dropped it', async () => {
        expect(text).toContain(TEXT.unsavedText);
        expect(stayed).toEqual([TEXT.tabs[0], Number(value)]);
        expect(moved).toBe(TEXT.tabs[1]);
        expect(num(await cmp.commission())).toBe(num(saved));
      });
    });

    test('TC-COM-CMP-045: Closing the Unsaved changes question keeps the edit', { tag: '@C107883' }, async () => {
      await about('Its X and Escape both close the question, keep the office and the edit.');
      const saved = await openEditOffice();
      const value = other(saved, '7');
      await cmp.typeCommission(value);
      for (const how of ['Close', 'Escape'] as const) {
        await cmp.pickOffice('1102', how);
        await verify(`${how}: still ${EDIT_OFFICE} with the edit`, async () => {
          const view = await cmp.view();
          expect([view.office.slice(0, 4), num(view.commission)]).toEqual([EDIT_OFFICE, Number(value)]);
        });
      }
    });

    test('TC-COM-CMP-046: Opening another Commissions page with an unsaved edit asks first: Stay keeps it, Discard leaves', { tag: '@C107902' }, async ({ authenticatedSession }) => {
      await about(`Clicking ${OTHER_MENU_PAGE} in the sidebar with an edit asks "${TEXT.unsavedTitle}"; Stay keeps this page and the edit; Discard opens ${OTHER_MENU_PAGE}.`);
      const page = authenticatedSession.page;
      const saved = await openEditOffice();
      const value = other(saved, '7');
      await cmp.typeCommission(value);
      await cmp.clickMenuPage(OTHER_MENU_PAGE);
      const text = await cmp.dialogText();
      await cmp.answerDialog('Stay');
      const stayed = [page.url(), num(await cmp.commission())];
      const href = await cmp.clickMenuPage(OTHER_MENU_PAGE);
      await cmp.answerDialog('Discard');
      await verify('Asked; Stay kept the edit; Discard left', async () => {
        expect(text).toContain(TEXT.unsavedText);
        expect(stayed).toEqual([cmp.url(OFFICE), Number(value)]);
        await expect(page).toHaveURL(new RegExp(`${href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), { timeout: 30_000 });
      });
    });

    test('TC-COM-CMP-047: Leaving the page with an unsaved edit makes the browser ask first', { tag: '@C107884' }, async () => {
      await about('Reloading with an edit raises the browser\'s leave-page question; answering it to stay keeps the edit.');
      const saved = await openEditOffice();
      const value = other(saved, '7');
      await cmp.typeCommission(value);
      const asked = await cmp.reloadAsksFirst();
      await verify('Asked, edit kept', async () => expect([asked, num(await cmp.commission())]).toEqual([true, Number(value)]));
    });
  });

  test.describe('G. Export', () => {
    test('TC-COM-CMP-048: Export downloads every office commission with two decimals', { tag: '@C107885' }, async () => {
      await about(`${EXPORT.basic.file} has the columns ${EXPORT.basic.columns.join(', ')}, one row per office and business type with a commission, written like "9.00%".`);
      await cmp.open(OFFICE);
      const { name, rows } = await cmp.exportFile();
      await verify('File name, columns and rows', async () => {
        expect(name).toBe(EXPORT.basic.file);
        expect(rows[0]).toEqual([...EXPORT.basic.columns]);
        expect(rows.length).toBeGreaterThan(1);
        for (const r of rows.slice(1)) expect.soft(r, r[0]).toEqual([expect.stringMatching(/^\d{4}-\S/), expect.stringMatching(/\S/), expect.stringMatching(/^\d+\.\d{2}%$/)]);
        expect(rows.map((r) => (r[0] ?? '').slice(0, 4))).toContain(FIRST_OFFICE.slice(0, 4));
      });
    });
  });

  test.describe('H. History', () => {
    /** Opens History with every entry on one page (50 rows). */
    const allOnOnePage = async (): Promise<HistoryRow[]> => {
      await cmp.open(OFFICE);
      await cmp.openTab('Commission CMP History');
      await cmp.setPageSize('50');
      return cmp.historyRows();
    };
    const byDate = (d: string): number => Date.parse(d.replace(/-/g, ' '));

    test('TC-COM-CMP-049: History lists changes newest first, ten to a page', { tag: '@C107886' }, async () => {
      await about(`Columns ${HISTORY_COLUMNS.join(', ')}; ten rows; Modified On never rises down the page.`);
      await cmp.open(OFFICE);
      await cmp.openTab('Commission CMP History');
      const columns = await cmp.historyColumns();
      const rows = await cmp.historyRows();
      await verify('Columns, ten rows, newest first', async () => {
        expect(columns).toEqual([...HISTORY_COLUMNS]);
        expect(rows).toHaveLength(10);
        const dates = rows.map((r) => byDate(r['Modified On']));
        expect(dates).toEqual([...dates].sort((a, b) => b - a));
      });
    });

    test('TC-COM-CMP-050: Each column sorts both ways from its header menu', { tag: '@C107887' }, async () => {
      await about('Every header menu offers Sort ascending and Sort descending; Local Office, Business Type, Action, Commission and Modified On sort correctly (fifty entries on one page; Modified By is TC-COM-CMP-052).');
      await allOnOnePage();
      const menus: string[][] = [];
      for (const c of HISTORY_COLUMNS) menus.push(await cmp.headerMenuItems(c));
      const key = {
        'Local Office': (r: HistoryRow) => r['Local Office'], 'Business Type': (r: HistoryRow) => r['Business Type'], Action: (r: HistoryRow) => r.Action,
        Commission: (r: HistoryRow) => num(r.Commission), 'Modified On': (r: HistoryRow) => byDate(r['Modified On']),
      } as const;
      const results: [string, (string | number)[], (string | number)[]][] = [];
      for (const [column, k] of Object.entries(key) as [keyof typeof key, (r: HistoryRow) => string | number][]) {
        for (const dir of ['ascending', 'descending'] as const) {
          const got = (await cmp.sortHistory(column, dir)).map(k);
          const want = [...got].sort((a, b) => (typeof a === 'number' ? (a as number) - (b as number) : String(a).localeCompare(String(b))) * (dir === 'ascending' ? 1 : -1));
          results.push([`${column} ${dir}`, got, want]);
        }
      }
      await verify('Menus and orders', async () => {
        for (const m of menus) expect.soft(m).toEqual(['Sort ascending', 'Sort descending']);
        for (const [label, got, want] of results) expect.soft(got, label).toEqual(want);
      });
    });

    test('TC-COM-CMP-051: With several pages, sorting orders the page shown and stays on while paging', { tag: '@C107888' }, async () => {
      await about('With ten rows a page, Commission ascending orders the ten rows shown, keeps the same rows, and the next page comes ordered the same way.');
      await cmp.open(OFFICE);
      await cmp.openTab('Commission CMP History');
      const shown = (await cmp.historyRows()).map((r) => num(r.Commission));
      const page1 = (await cmp.sortHistory('Commission', 'ascending')).map((r) => num(r.Commission));
      await cmp.goToPage('next');
      const page2 = (await cmp.historyRows()).map((r) => num(r.Commission));
      const up = (a: number[]) => [...a].sort((x, y) => x - y);
      await verify('Each page in ascending order', async () => {
        expect(page1).toEqual(up(shown));
        expect(page2).toEqual(up(page2));
      });
    });

    test('TC-COM-CMP-052: Modified By sorts alphabetically regardless of capital letters', { tag: '@C107889' }, async () => {
      await about('Sort ascending orders the users A to Z ignoring case (ayaganti before s-prd before V-nikita).');
      await allOnOnePage();
      const got = (await cmp.sortHistory('Modified By', 'ascending')).map((r) => r['Modified By']);
      await verify('Case-insensitive A to Z', async () => expect(got).toEqual([...got].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }))));
    });

    test('TC-COM-CMP-053: Rows per page sets the rows shown and the page count', { tag: '@C107890' }, async () => {
      await about(`Rows per page offers ${PAGE_SIZES.join(', ')}; each size shows that many rows (or all) and the matching page count.`);
      await cmp.open(OFFICE);
      await cmp.openTab('Commission CMP History');
      const total = (await cmp.exportFile()).rows.length - 1;
      const options = await cmp.pageSizeOptions();
      const seen: [string, number, number][] = [];
      for (const size of [...PAGE_SIZES.slice(1), PAGE_SIZES[0]]) {
        await cmp.setPageSize(size);
        seen.push([size, (await cmp.historyRows()).length, (await cmp.pager()).pages]);
      }
      await verify('Options, rows and pages', async () => {
        expect(options).toEqual([...PAGE_SIZES]);
        for (const [size, rows, pages] of seen) expect.soft([rows, pages], `size ${size}`).toEqual([Math.min(Number(size), total), Math.ceil(total / Number(size))]);
      });
    });

    test('TC-COM-CMP-054: A new rows-per-page goes back to page 1, and leaving the tab resets it to 10', { tag: '@C107903' }, async () => {
      await about('On page 2, choosing 20 rows opens page 1; after Basic Information and back, History shows 10 rows a page again from page 1.');
      await cmp.open(OFFICE);
      await cmp.openTab('Commission CMP History');
      await cmp.goToPage('next');
      await cmp.setPageSize('20');
      const after = [(await cmp.pager()).page, (await cmp.historyRows()).length];
      await cmp.openTab('Basic Information');
      await cmp.openTab('Commission CMP History');
      await verify('Page 1 at 20 rows; 10 rows after the round trip', async () => {
        expect(after).toEqual(['1', 20]);
        await expect.poll(() => cmp.historyRows().then((r) => r.length)).toBe(10);
        expect((await cmp.pager()).page).toBe('1');
        await expect(cmp.main.getByRole('combobox').filter({ hasText: /^\d+$/ })).toHaveText(PAGE_SIZES[0]);
      });
    });

    test('TC-COM-CMP-055: The page buttons and page number move through History', { tag: '@C107891' }, async () => {
      await about(`First/previous are off on page 1; next, last, previous and first move as named; on the last page next/last are off; a typed page number opens that page; a number out of range or ${BAD_PAGE_NUMBERS.map((v) => `"${v}"`).join(', ')} is not taken.`);
      await cmp.open(OFFICE);
      await cmp.openTab('Commission CMP History');
      const rows = async () => JSON.stringify(await cmp.historyRows());
      const start = await cmp.pager();
      const firstRows = await rows();
      await cmp.goToPage('next');
      const second = { ...(await cmp.pager()), changed: (await rows()) !== firstRows };
      await cmp.goToPage('last');
      const last = await cmp.pager();
      await cmp.goToPage('previous');
      const beforeLast = (await cmp.pager()).page;
      await cmp.goToPage('first');
      await cmp.goToPage(start.pages + 5);
      const outOfRange = (await cmp.pager()).page;
      await cmp.goToPage(3);
      const typed = (await cmp.pager()).page;
      const bad: string[] = [];
      for (const v of BAD_PAGE_NUMBERS) {
        await cmp.goToPage(v);
        bad.push((await cmp.pager()).page);
      }
      await verify('Pages and buttons', async () => {
        expect(start).toMatchObject({ page: '1', first: false, previous: false, next: true, last: true });
        expect(second).toMatchObject({ page: '2', first: true, previous: true, changed: true });
        expect(last).toMatchObject({ page: String(start.pages), next: false, last: false });
        expect(beforeLast).toBe(String(start.pages - 1));
        expect(outOfRange).toBe('1');
        expect(typed).toBe('3');
        expect(bad).toEqual(BAD_PAGE_NUMBERS.map(() => '3'));
      });
    });

    test('TC-COM-CMP-056: Each column can be widened by dragging its edge', { tag: '@C107892' }, async () => {
      await about('Dragging each column\'s edge 100 px to the right widens that column (the grid keeps its width, so the edge is dragged back before the next column).');
      await cmp.open(OFFICE);
      await cmp.openTab('Commission CMP History');
      const widths: [string, number, number][] = [];
      for (const c of HISTORY_COLUMNS) {
        const { before, after } = await cmp.resizeColumn(c, 100);
        widths.push([c, before, after]);
        await cmp.resizeColumn(c, -100);
      }
      await verify('Each wider', async () => {
        for (const [c, before, after] of widths) expect.soft(after, c).toBeGreaterThan(before + 50);
      });
    });

    test('TC-COM-CMP-057: Each History entry shows office, type, action, commission, user and date', { tag: '@C107893' }, async () => {
      await about('Every row reads "NNNN-Office name", a business type, Modify, a commission with two decimals and %, a user e-mail, and Modified On as DD-MMM-YYYY.');
      await cmp.open(OFFICE);
      await cmp.openTab('Commission CMP History');
      const rows = await cmp.historyRows();
      await verify('Each row\'s format', async () => {
        for (const r of rows) {
          expect.soft(r, r['Local Office']).toMatchObject({
            'Local Office': expect.stringMatching(/^\d{4}-\S/), 'Business Type': expect.stringMatching(/\S/), Action: TEXT.action,
            Commission: expect.stringMatching(/^\d+\.\d{2} %$/), 'Modified By': expect.stringMatching(/^\S+@\S+$/), 'Modified On': expect.stringMatching(/^\d{2}-[A-Z][a-z]{2}-\d{4}$/),
          });
        }
      });
    });

    test('TC-COM-CMP-058: History Export holds every entry', { tag: '@C107894' }, async () => {
      await about(`${EXPORT.history.file} lists every entry, with the columns ${HISTORY_EXPORT_COLUMNS.join(', ')}.`);
      await allOnOnePage();
      const { pages } = await cmp.pager();
      if (pages > 1) await cmp.goToPage('last');
      const total = (pages - 1) * 50 + (await cmp.historyRows()).length;
      const { name, rows } = await cmp.exportFile();
      await verify(`File name, columns and ${total} entries`, async () => {
        expect(name).toBe(EXPORT.history.file);
        expect(rows[0]).toEqual([...HISTORY_EXPORT_COLUMNS]);
        expect(rows.length - 1).toBe(total);
      });
    });

    test('TC-COM-CMP-059: History Export holds the entries of every page, in the same order', { tag: '@C107895' }, async () => {
      await about('Read page by page (10 to a page), the grid and the export list the same entries in the same order: office, action, business type, commission (written "2.3%" for "2.30 %") and user; Modified On is MM/DD/YYYY HH:mm:ss (UTC), on the date the grid shows.');
      await cmp.open(OFFICE);
      await cmp.openTab('Commission CMP History');
      const grid = await cmp.allHistoryRows();
      const [header = [], ...entries] = (await cmp.exportFile()).rows;
      const cell = (r: string[], c: string): string => r[header.indexOf(c)] ?? '';
      await verify(`${grid.length} entries, each as on its page`, async () => {
        expect(entries.length).toBe(grid.length);
        for (const [i, g] of grid.entries()) {
          const e = entries[i] ?? [];
          expect.soft(cell(e, 'Commission'), `row ${i + 1} commission`).toMatch(/^\d+(\.\d+)?%$/);
          expect.soft(cell(e, 'Modified On'), `row ${i + 1} time`).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/);
          expect.soft({
            office: cell(e, 'Local Office Id'), action: cell(e, 'Action'), type: cell(e, 'Business Type'), commission: num(cell(e, 'Commission')),
            by: cell(e, 'Modified By'), on: exportDates(cell(e, 'Modified On')).includes(g['Modified On']),
          }, `row ${i + 1}`).toEqual({
            office: g['Local Office'], action: g.Action, type: g['Business Type'], commission: num(g.Commission), by: g['Modified By'], on: true,
          });
        }
      });
    });

    test('TC-COM-CMP-060: When History fails to load, a message shows and the grid is empty', { tag: '@C107896' }, async () => {
      await about(`With the History list failing (500 or no connection), an error message shows and the grid reads "${TEXT.noResults}".`);
      for (const how of [500, 'network'] as const) {
        await cmp.open(OFFICE);
        const undo = await cmp.failHistory(how);
        try {
          await cmp.openTab('Commission CMP History');
          await verify(`${how}: message and "${TEXT.noResults}"`, async () => {
            await expect.poll(() => cmp.toasts()).not.toEqual([]);
            await expect(cmp.main.getByText(TEXT.noResults)).toBeVisible();
          });
        } finally {
          await undo();
        }
      }
    });
  });

  test.describe('I. Keyboard and layout', () => {
    test('TC-COM-CMP-061: Tab moves through the page in reading order', { tag: '@C107897' }, async () => {
      await about('From the Basic Information tab, Tab reaches Export, the office, Business Type and the Commission field in that order (Save is skipped while off).');
      await cmp.open(OFFICE);
      // Straight after loading, a late re-render can pull focus out of the page; the walk is repeated until it is not disturbed.
      await verify('Export, office, Business Type, Commission', async () => {
        await expect(async () => expect(await cmp.tabOrder(4)).toEqual(['Export', FIRST_OFFICE, BUSINESS_TYPES[0], 'Commission field'])).toPass({ timeout: 30_000 });
      });
    });

    test('TC-COM-CMP-062: Arrow keys move between the tabs', { tag: '@C107904' }, async ({ authenticatedSession }) => {
      await about('With focus on Basic Information, Arrow Right opens Commission CMP History with its list; Arrow Left goes back to Basic Information.');
      const keys = authenticatedSession.page.keyboard;
      const first = authenticatedSession.page.getByRole('tab', { name: TEXT.tabs[0] });
      await cmp.open(OFFICE);
      // Straight after loading, a late re-render can pull focus off the tab; the key is pressed once the tab holds focus.
      await expect(async () => {
        await first.focus();
        await expect(first).toBeFocused({ timeout: 1_000 });
        await keys.press('ArrowRight');
        await expect.poll(() => cmp.selectedTab(), { timeout: 3_000 }).toBe(TEXT.tabs[1]);
      }).toPass({ timeout: 30_000 });
      await expect.poll(() => cmp.historyRows().then((r) => r.length), { timeout: 30_000 }).toBeGreaterThan(0);
      await keys.press('ArrowLeft');
      await verify('History, then Basic Information', async () => {
        await expect.poll(() => cmp.selectedTab()).toBe(TEXT.tabs[0]);
        await expect(cmp.input).toBeVisible();
      });
    });

    test('TC-COM-CMP-063: The sidebar toggle hides and shows the menu and the page keeps its state', { tag: '@C107905' }, async () => {
      await about('The toggle at the top left collapses the sidebar and expands it again; the office and commission shown stay the same.');
      await cmp.open(OFFICE);
      const before = await cmp.view();
      const states = [await cmp.toggleSidebar(), await cmp.toggleSidebar()];
      await verify('Collapsed, expanded, page unchanged', async () => {
        expect(states).toEqual(['collapsed', 'expanded']);
        expect(await cmp.view()).toEqual(before);
      });
    });
  });
});
