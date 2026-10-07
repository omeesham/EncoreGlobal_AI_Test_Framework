import * as fs from 'fs';
import { test, expect } from '../../src/fixtures/pages.fixture';
import { PriceGuidePage, GuideRow } from '../../src/pages/price-guide/price-guide.page';
import { phase, verify, about, attachNote } from '../../src/fixtures/report-steps';
import { PRICE_GUIDE_OFFICES, officeLabel, TEXT, ITEM_TYPE, PACKAGE_COUNT, SAVE_OFFICE, SECOND_USER_STATE, NO_ACCESS_USER_STATE } from '../../src/data/price-guide/price-guide';

// Setup → Price Guide (NM-4128): saving, cross-office data and access.
// Save only works for a location that has price books. USA 1606, Canada 2359 and Mexico 7147 have
// none, so there Save sends no request and nothing persists (client, 2026-10-07). The save cases run
// against the location named in PRICE_GUIDE_SAVE_OFFICE and skip until it is set. They write real
// office data: they run one at a time and each one cleans up.
// The two-user and no-access cases run once their signed-in account files exist (see the data file).

test.describe.configure({ mode: 'serial', timeout: 240_000 });

const SAVE_SKIP_REASON =
  'Skipped until PRICE_GUIDE_SAVE_OFFICE names a location with price books: 1606, 2359 and 7147 have none, so Save cannot store a price guide there (client, 2026-10-07).';

test.describe(`Price Guide — save — ${SAVE_OFFICE ? `office ${SAVE_OFFICE}` : 'location with price books'}`, () => {
  test.skip(!SAVE_OFFICE, SAVE_SKIP_REASON);
  const office = { code: SAVE_OFFICE };
  let pg: PriceGuidePage;

  test.beforeEach(async ({ authenticatedSession, config }) => {
    pg = new PriceGuidePage(authenticatedSession.page, config);
    await pg.open(office.code);
  });

  // Leaves the office as every other suite expects it: no recommendations.
  test.afterEach(async () => {
    if (!pg) return; // the session never opened, so there is nothing to clean up
    await pg.open(office.code).catch(() => {});
    if ((await pg.getCount('right').catch(() => 0)) > 0) await pg.clearAndSave();
  });

  async function addPackageAndGroup(): Promise<{ name: string; price: string; itemType: string }[]> {
    const pkg = await pg.addByDoubleClick(0);
    const rows: { name: string; price: string; itemType: string }[] = [{ ...pkg, itemType: ITEM_TYPE.package }];
    await pg.switchTab('Product Groups');
    if ((await pg.getCount('left')) > 0) rows.push({ ...(await pg.addByDoubleClick(0)), itemType: ITEM_TYPE.productGroup });
    await pg.switchTab('Packages');
    return rows;
  }

  test('TC-PRG-SAV-001: Saved recommendations persist after reload', async () => {
    await about('Saved recommendations are still there, unchanged, after the page is reloaded.');
    const added = await addPackageAndGroup();
    const save = await phase('Save', () => pg.clickSave());
    await attachNote('Save traffic', JSON.stringify(save));
    await verify('Save sent a request and went back to disabled', async () => {
      expect(save.requests.length).toBeGreaterThan(0);
      expect(await pg.isSaveEnabled()).toBe(false);
    });
    await pg.reload();
    await verify('The same recommendations are listed after reload', async () => {
      expect(await pg.getRows('right')).toEqual(expect.arrayContaining(added));
      expect(await pg.getCount('right')).toBe(added.length);
    });
  });

  test('TC-PRG-SAV-002: Save shows clear feedback', async () => {
    await about('Saving tells the user it worked.');
    await pg.addByDoubleClick(0);
    const save = await pg.clickSave();
    await verify('A success message appears', async () => {
      expect(save.toasts.join(' ')).toMatch(/sav/i);
    });
  });

  test('TC-PRG-SAV-003: Removing recommendations and saving persists the removal', async () => {
    await about('Removing saved recommendations and saving again is kept after reload, down to an empty list.');
    await pg.addByDoubleClick(0);
    const second = await pg.addByDoubleClick(1);
    await pg.clickSave();
    await pg.reload();
    await pg.deleteRecommendation(second.name);
    await pg.clickSave();
    await pg.reload();
    await verify('Only the first recommendation remains', async () => {
      expect(await pg.getCount('right')).toBe(1);
    });
    await pg.deleteAllRecommendations();
    await pg.clickSave();
    await pg.reload();
    await verify('The list is empty again', async () => {
      expect(await pg.getCount('right')).toBe(0);
      expect(await pg.isEmptyStateVisible()).toBe(true);
    });
  });

  test('TC-PRG-SAV-004: Recommendations are saved per office', async () => {
    await about('A recommendation saved on one office does not show on the other offices.');
    const item = await pg.addByDoubleClick(0);
    await pg.clickSave();
    for (const other of PRICE_GUIDE_OFFICES.filter((o) => o.code !== office.code)) {
      await pg.open(other.code);
      await verify(`Office ${other.code} does not show it`, async () => {
        expect((await pg.getRows('right')).map((r) => r.name)).not.toContain(item.name);
      });
    }
    await pg.open(office.code);
    await verify(`Office ${office.code} still has it`, async () => {
      expect((await pg.getRows('right')).map((r) => r.name)).toContain(item.name);
    });
  });

  test('TC-PRG-SAV-005: Clicking Save twice quickly saves once', async () => {
    await about('A double-click on Save saves once and creates no duplicate.');
    await pg.addByDoubleClick(0);
    const requests: string[] = [];
    pg.page.on('request', (r) => { if (r.method() !== 'GET' && /price-guide|pricing/i.test(r.url())) requests.push(r.url()); });
    await pg.page.locator('main #price-guide-recommendations-print button:text-is("Save")').dblclick();
    await pg.page.waitForLoadState('networkidle').catch(() => {});
    await pg.reload();
    await verify('One save request and exactly one row', async () => {
      expect(requests.length).toBe(1);
      expect(await pg.getCount('right')).toBe(1);
    });
  });

  test('TC-PRG-SAV-006: Save failure keeps the changes and shows an error', async () => {
    await about('If saving fails on the server, the user is told and the unsaved changes stay so they can retry.');
    const item = await pg.addByDoubleClick(0);
    await pg.page.route(/price-guide|pricing/i, (route) => (route.request().method() === 'GET' ? route.continue() : route.fulfill({ status: 500, body: 'forced failure' })));
    const failed = await pg.clickSave();
    await pg.page.unroute(/price-guide|pricing/i);
    await verify('An error is shown, the change stays, Save is still enabled', async () => {
      expect(failed.toasts.join(' ')).toMatch(/error|fail|could not/i);
      expect((await pg.getRows('right')).map((r) => r.name)).toEqual([item.name]);
      expect(await pg.isSaveEnabled()).toBe(true);
    });
    await pg.clickSave();
    await pg.reload();
    await verify('Retrying with the network back saves it', async () => {
      expect((await pg.getRows('right')).map((r) => r.name)).toEqual([item.name]);
    });
  });

  // Two users are two accounts; the latest save wins (client, 2026-10-06).
  test('TC-PRG-SAV-007: Two users editing the same office', async ({ browser, config }) => {
    test.skip(!fs.existsSync(SECOND_USER_STATE), `Needs a second test account, signed in to ${SECOND_USER_STATE}.`);
    await about('User A and user B open the same office; A saves, then B saves a different list. The latest save wins: after a reload both see B\'s list.');
    const otherUser = await browser.newContext({ storageState: SECOND_USER_STATE });
    try {
      const userB = new PriceGuidePage(await otherUser.newPage(), config);
      await userB.open(office.code);
      const a = await pg.addByDoubleClick(0);
      await phase('User A saves', () => pg.clickSave());
      const b = await userB.addByDoubleClick(1);
      await phase('User B saves afterwards', () => userB.clickSave());
      await pg.reload();
      await userB.reload();
      await verify('Both users see only B\'s recommendation — the latest save', async () => {
        expect((await pg.getRows('right')).map((r) => r.name)).toEqual([b.name]);
        expect((await userB.getRows('right')).map((r) => r.name)).toEqual([b.name]);
      });
      await attachNote('Saves', JSON.stringify({ userA: a.name, userB: b.name }));
    } finally {
      await otherUser.close();
    }
  });

  test('TC-PRG-SAV-008: Saved list shows in the same order after reload', async () => {
    await about('Five saved recommendations come back in the same order after a reload.');
    for (let i = 0; i < 5; i++) await pg.addByDoubleClick(i);
    const order = (await pg.getRows('right')).map((r) => r.name);
    await pg.clickSave();
    await pg.reload();
    await verify('Same five, same order', async () => {
      expect((await pg.getRows('right')).map((r) => r.name)).toEqual(order);
    });
  });
});

// ---------------------------------------------------------------- cross-office

test.describe('Price Guide — offices', () => {
  let pg: PriceGuidePage;

  test.beforeEach(async ({ authenticatedSession, config }) => {
    pg = new PriceGuidePage(authenticatedSession.page, config);
  });

  // Packages are shared by every office and 4,000 is the real count (client, 2026-10-06).
  test('TC-PRG-OFF-001: Every office shows the same shared package list', async () => {
    await about('USA 1606, Canada 2359 and Mexico 7147 each open their own Price Guide, and all three list the same 4,000 shared packages.');
    const firstRows: Record<string, GuideRow[]> = {};
    const productGroups: Record<string, number> = {};
    for (const office of PRICE_GUIDE_OFFICES) {
      await pg.open(office.code);
      await verify(`${officeLabel(office)} loads its own page with ${PACKAGE_COUNT} packages`, async () => {
        expect(await pg.getLocalOfficeText()).toContain(`${office.code} - ${office.name}`);
        expect(await pg.getRightPanelText()).toContain(TEXT.rightTitle);
        expect(await pg.getCount('left')).toBe(PACKAGE_COUNT);
      });
      firstRows[office.code] = await pg.getRows('left', 10);
      await pg.switchTab('Product Groups');
      productGroups[office.code] = await pg.getCount('left');
    }
    const [reference, ...others] = PRICE_GUIDE_OFFICES;
    for (const office of others) {
      await verify(`${officeLabel(office)} lists the same packages, at the same prices, as ${officeLabel(reference!)}`, async () => {
        expect(firstRows[office.code]).toEqual(firstRows[reference!.code]);
      });
    }
    // Product groups belong to the office, so their counts differ (Canada has none) — recorded only.
    await attachNote('Product groups per office', JSON.stringify(productGroups));
  });

  // Accepted by the client (2026-10-07): no currency is shown and the shared packages cost the same everywhere.
  test('TC-PRG-OFF-002: Prices show as plain amounts, the same on every office', async () => {
    await about('Package prices are plain amounts with no currency sign, and each package has the same price on USA, Canada and Mexico.');
    const prices: Record<string, string[]> = {};
    for (const office of PRICE_GUIDE_OFFICES) {
      await pg.open(office.code);
      prices[office.code] = (await pg.getRows('left', 10)).map((r) => r.price);
      await verify(`${officeLabel(office)}: prices are plain amounts such as 850.00`, async () => {
        for (const price of prices[office.code]!) expect(price).toMatch(/^\d{1,3}(,\d{3})*\.\d{2}$/);
      });
    }
    await attachNote('First ten package prices per office', JSON.stringify(prices));
    const [reference, ...others] = PRICE_GUIDE_OFFICES;
    for (const office of others) {
      await verify(`${officeLabel(office)} prices match ${officeLabel(reference!)}`, async () => {
        expect(prices[office.code]).toEqual(prices[reference!.code]);
      });
    }
  });
});

// ---------------------------------------------------------------- access

test.describe('Price Guide — access', () => {
  // Expected behaviour confirmed by the client (2026-10-06).
  test('TC-PRG-SEC-001: A user without Price Guide access cannot open or change it', async ({ browser, config }) => {
    test.skip(!fs.existsSync(NO_ACCESS_USER_STATE), `Skipped until a user without Price Guide rights exists: sign it in to ${NO_ACCESS_USER_STATE}.`);
    await about('A user without Price Guide rights does not see it in Setup and is refused at its URL, on every office.');
    const restricted = await browser.newContext({ storageState: NO_ACCESS_USER_STATE });
    try {
      const pg = new PriceGuidePage(await restricted.newPage(), config);
      for (const office of PRICE_GUIDE_OFFICES) {
        await verify(`${officeLabel(office)}: Setup does not offer Price Guide`, async () => {
          expect(await pg.isPriceGuideInSetupMenu(office.code)).toBe(false);
        });
        const shown = await pg.openRaw(office.code);
        await attachNote(`${officeLabel(office)}: page at the Price Guide URL`, shown.slice(0, 300));
        await verify(`${officeLabel(office)}: the Price Guide URL is refused — no recommendations and no Save`, async () => {
          expect(await pg.isEditorVisible()).toBe(false);
        });
      }
    } finally {
      await restricted.close();
    }
  });
});
