import { test, expect } from '../../src/fixtures/pages.fixture';
import { ItemSearchPage } from '../../src/pages/item-search/item-search.page';
import {
  ISR_OFFICE,
  ISR_OFFICE_OPTION,
  ISR_LOCATION_PLACEHOLDER,
  ISR_REGION_PLACEHOLDER,
  ISR_REGION_SAMPLE,
  ISR_LOCATION_LIST_FLOOR,
  ISR_REGION_LIST_FLOOR,
  ISR_ORG_ENTRIES,
  ISR_ACTIVE_FILTER_WORD,
} from '../../src/data/item-search/item-search';
import { phase, verify } from '../../src/fixtures/report-steps';

/**
 * Item Search — Products page filters (NM-2254), office 1101 (admin-only surface).
 *
 * Covers the controls under the search panel's "Filters" heading: Location, Region,
 * Product Organization, the Prep and Return date pair, and the two checkboxes. The
 * companion file product-search.spec.ts covers the search inputs above the heading
 * and the results grid below it.
 *
 * Two live behaviors shape every test:
 *  - Results load only on Search, and Reset empties to "0 products found" until the next
 *    Search. Executed criteria + results + sort order are restored from browser storage on
 *    later visits, so every test starts from Reset — defaults are never asserted on a bare
 *    load.
 *  - The page hydrates behind skeleton placeholders (~20s cold, ~11s per unfiltered
 *    search); every wait keys on the placeholder census, never a row count.
 *
 * Nothing here persists data — the page has no save; only filter state is touched and
 * each test restores what it changes.
 */
// A test can run two full searches plus a reload on a slow evening — the ceiling covers
// the worst measured stack, and the run report is where slowness gets surfaced.
test.describe.configure({ timeout: 300_000 });

// ---------------------------------------------------------------------------- test cases
// One describe, tests in ascending TC-id order: the alignment gate
// (scripts/check-testcase-alignment.js) requires a spec's tests to ascend by TC id,
// and every test here declares dependencyGate([]) — order carries no meaning.

test.describe('SBC — Item Search Products — filter behaviors and filter fields @item-search @product-search', () => {
  let isr: ItemSearchPage;

  test.beforeEach(async ({ authenticatedSession, config }) => {
    isr = new ItemSearchPage(authenticatedSession.page, config);
    await isr.ensureCleanSearch(ISR_OFFICE);
  });

  test('TC-ISR-PRF-001: The Location dropdown lists offices', { tag: '@C105786' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    await verify('The office list is populated and holds the current office', async () => {
      // The office list is data-driven (5,110 entries at the last check) — assert a floor.
      expect(await isr.readLocationOptionCount()).toBeGreaterThan(ISR_LOCATION_LIST_FLOOR);
      expect(await isr.locationListHas(ISR_LOCATION_PLACEHOLDER)).toBe(true);
      expect(await isr.locationListHas(ISR_OFFICE_OPTION)).toBe(true);
    });
    await verify('Dismissing the list leaves the value unchanged', async () => {
      // Escape closed each open list without selecting — the value is unchanged.
      expect(await isr.readLocationText()).toContain(ISR_OFFICE);
    });
  });

  test('TC-ISR-PRF-002: The Region dropdown lists regions', { tag: '@C105787' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    const regions = await phase('Open the Region list', () => isr.readRegionOptions());
    await verify('The region list is populated', async () => {
      expect(regions.length).toBeGreaterThan(ISR_REGION_LIST_FLOOR);
      expect(regions).toContain(ISR_REGION_SAMPLE);
      expect(regions).toContain(ISR_REGION_PLACEHOLDER);
    });
    await verify('The field rests on its placeholder', async () => {
      expect(await isr.readRegionText()).toBe(ISR_REGION_PLACEHOLDER);
    });
  });

  test('TC-ISR-PRF-003: Location and Region clear each other', { tag: '@C105788' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    await phase('Select the office in Location', () => isr.selectLocation(ISR_OFFICE_OPTION, ISR_OFFICE));
    await verify('The office is selected', async () => {
      expect(await isr.readLocationText()).toContain(ISR_OFFICE);
    });
    // Feeding Region overrides the office — the last one set wins.
    await phase('Select a Region', () => isr.selectRegion(ISR_REGION_SAMPLE));
    await verify('Choosing a Region clears the Location', async () => {
      expect(await isr.readRegionText()).toContain(ISR_REGION_SAMPLE);
      expect(await isr.readLocationText()).toBe(ISR_LOCATION_PLACEHOLDER);
    });
    // And back the other way.
    await phase('Select the office again', () => isr.selectLocation(ISR_OFFICE_OPTION, ISR_OFFICE));
    await verify('Choosing a Location clears the Region in turn', async () => {
      expect(await isr.readLocationText()).toContain(ISR_OFFICE);
      expect(await isr.readRegionText()).toBe(ISR_REGION_PLACEHOLDER);
    });
    // Reset restores the current office and clears the region.
    await phase('Click Reset', () => isr.clickReset());
    await verify('Reset restores the current office with no region', async () => {
      expect(await isr.readLocationText()).toContain(ISR_OFFICE);
      expect(await isr.readRegionText()).toBe(ISR_REGION_PLACEHOLDER);
    });
  });

  test('TC-ISR-PRF-004: The Product Organization popover offers the country checklist', { tag: '@C105789' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    const text = await phase('Open the Product Organization popover', () => isr.readOrgPopoverText());
    await verify('The popover offers the whole country checklist', async () => {
      for (const entry of ISR_ORG_ENTRIES) {
        expect(text).toContain(entry);
      }
    });
    await verify('Dismissing it without choosing leaves the field on None', async () => {
      // The popover was dismissed without choosing — the field still shows None.
      expect(await isr.readOrgValueText()).toContain('None');
    });
  });

  test('TC-ISR-PRF-005: The date fields open a calendar with a time spinner', { tag: '@C105790' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    // Field-level verification only — the product owner has ruled date-driven behavior
    // is not functional yet, so no case asserts how dates change results.
    const prepBefore = await phase('Read the Prep date at rest', () => isr.readDateFieldText('Prep Date Time'));
    await verify('The date pair rests on its default day boundaries', async () => {
      expect(prepBefore).toContain('12:00 AM');
      expect(await isr.readDateFieldText('Return Date Time')).toContain('11:59 PM');
    });
    await phase('Open the Prep date picker', () => isr.openDatePopover(1));
    const popover = isr.openPopover();
    await verify('The popover shows a calendar with a time control', async () => {
      await expect(popover.locator('[role="grid"]').first()).toBeVisible({ timeout: 5_000 });
      // The time spinner sits below the calendar; some builds expose it as spin buttons,
      // others as plain time text — accept either rendering of the same control.
      if ((await popover.getByRole('spinbutton').count()) === 0) {
        expect((await popover.textContent()) ?? '').toMatch(/AM|PM/);
      }
    });
    await phase('Close the date picker', () => isr.closePopover());
    await verify('Closing without picking leaves the date unchanged', async () => {
      expect(await isr.readDateFieldText('Prep Date Time')).toBe(prepBefore);
    });
  });

  test('TC-ISR-PRF-006: Quantity Greater Than Zero narrows the results', { tag: '@C105791' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    const total = await phase('Run an unfiltered search for the baseline count', () =>
      isr.clickSearchAndWait((n) => n !== null && n > 0));
    const narrowed = await phase('Check Quantity Greater Than Zero and search again', async () => {
      await isr.toggleFilter(0);
      expect(await isr.isFilterChecked(0)).toBe(true);
      return isr.clickSearchAndWait((n) => n !== null && n > 0 && n < (total as number));
    });
    await verify('The filter narrows the set without emptying it', async () => {
      expect(narrowed as number).toBeGreaterThan(0);
      expect(narrowed as number).toBeLessThan(total as number);
    });
    // Unchecking brings the unfiltered total back.
    const restored = await phase('Uncheck the filter and search again', async () => {
      await isr.toggleFilter(0);
      expect(await isr.isFilterChecked(0)).toBe(false);
      return isr.clickSearchAndWait((n) => n === total);
    });
    await verify('The unfiltered total comes back', async () => {
      expect(restored).toBe(total);
    });
  });

  test('TC-ISR-PRF-007: A Prep date after the Return date is rejected with a message', { tag: '@C105792' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    // Push Prep one month past Return (which rests on today) — the pair turns invalid.
    await phase('Push the Prep date a month past the Return date', async () => {
      await isr.openDatePopover(1);
      await isr.calendarNextMonth();
      await isr.pickCalendarDay('22nd');
      await isr.closePopover();
    });
    await verify('The out-of-order pair is rejected and Search is locked', async () => {
      await expect.poll(async () => await isr.isDateOrderMessageShown(), { timeout: 15_000 }).toBe(true);
      // The invalid pair locks the search itself, not just a message.
      expect(await isr.isSearchEnabled()).toBe(false);
    });
    // Reset is the recovery: defaults return and the message clears.
    await phase('Click Reset to recover', () => isr.clickReset());
    await verify('The message clears and Search is offered again', async () => {
      await expect.poll(async () => await isr.isDateOrderMessageShown(), { timeout: 15_000 }).toBe(false);
      expect(await isr.readDateFieldText('Prep Date Time')).toContain('12:00 AM');
      expect(await isr.isSearchEnabled()).toBe(true);
    });
  });

  test('TC-ISR-PRF-008: A date value renders fully inside its box in every month', { tag: '@C105793' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(420_000);
    // Wide dates used to paint their tail outside the box — 7 of 12 months on Prep, up to
    // 30 pixels, and the Return field too. The app now abbreviates the month ("Nov 22nd,
    // 2026" rather than "November 22nd, 2026"), which puts the widest value at roughly 205
    // pixels inside a 232-pixel box, so every month fits. Re-measured live on both fields
    // 2026-09-03. This case is the guard that keeps it that way: the field clips its own
    // overflow, so a longer format would show up here immediately as spill.
    const spills: string[] = [];
    await phase('Walk the Prep date through all twelve months', async () => {
      for (let month = 0; month < 12; month++) {
        await isr.openDatePopover(1);
        await isr.calendarNextMonth();
        await isr.pickCalendarDay('22nd');
        await isr.closePopover();
        const prep = await isr.readDateOverflow(1);
        if (prep.spill > 0) spills.push(`${prep.text} spills ${prep.spill}px`);
      }
    });
    // One wide date on the Return side proves the twin field renders the same way.
    await phase('Set a wide date on the Return field', async () => {
      await isr.openDatePopover(2);
      await isr.calendarNextMonth();
      await isr.calendarNextMonth();
      await isr.pickCalendarDay('22nd');
      await isr.closePopover();
      const ret = await isr.readDateOverflow(2);
      if (ret.spill > 0) spills.push(`${ret.text} spills ${ret.spill}px`);
    });
    // Leave the panel on its defaults before judging, so a failure never strands state.
    await phase('Click Reset', () => isr.clickReset());
    await verify('No date value escapes its box in any month', async () => {
      expect(spills, `date values escaping their boxes:\n${spills.join('\n')}`).toEqual([]);
    });
  });

  test('TC-ISR-PRF-009: The Active filter narrows the results to active products', { tag: '@C105794' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    // The Active filter is checked at rest, so the first search returns active products
    // only. This word was chosen because its result set includes deactivated products, so
    // unchecking Active must grow the set — never shrink it or leave it unchanged.
    const activeCount = await phase('Search with the Active filter on', async () => {
      await isr.typeAnyField(ISR_ACTIVE_FILTER_WORD);
      expect(await isr.isFilterChecked(1)).toBe(true);
      return isr.clickSearchAndWait((n) => n !== null && n > 0);
    });
    const activeIds = await phase('Note the active product ids', () => isr.readColumnValues('Product Code ID'));
    // Uncheck Active — the same search now also returns the inactive products.
    const allCount = await phase('Uncheck Active and repeat the same search', async () => {
      await isr.toggleFilter(1);
      expect(await isr.isFilterChecked(1)).toBe(false);
      return isr.clickSearchAndWait((n) => n !== null && n > (activeCount as number));
    });
    const allIds = await phase('Note the ids returned with Active off', () => isr.readColumnValues('Product Code ID'));
    await verify('Turning Active off grows the set into a superset', async () => {
      expect(allCount as number).toBeGreaterThan(activeCount as number);
      // The relationship is the assertion, not the counts: every active product is still
      // present with the filter off, plus at least one product the filter had hidden.
      for (const id of activeIds) {
        expect(allIds, `active product ${id} should still be present with Active off`).toContain(id);
      }
      const revealed = allIds.filter((id) => !activeIds.includes(id));
      expect(revealed.length, 'unchecking Active should reveal at least one inactive product').toBeGreaterThan(0);
    });
    // Re-checking restores the smaller active-only set.
    await phase('Re-check the Active filter', async () => {
      await isr.toggleFilter(1);
      expect(await isr.isFilterChecked(1)).toBe(true);
    });
    await verify('The active-only set returns', async () => {
      expect(await isr.clickSearchAndWait((n) => n === activeCount)).toBe(activeCount);
    });
  });

  test('TC-ISR-PRF-010: The Product Organization filter narrows the results and clearing it restores them', { tag: '@C105795' }, async ({
    dependencyGate,
  }) => {
    dependencyGate([]);
    // Product Organization filters by country. Only a small slice of this catalogue carries
    // country tagging, so the case asserts the relationship — the filter must shrink the set
    // without emptying it, and Reset must bring the whole set back — instead of any fixed
    // count, which would start lying the moment more products are tagged. NM-2254.
    const country = 'United States';
    const baseline = await phase('Run an unfiltered search for the baseline count', () =>
      isr.clickSearchAndWait((n) => n !== null && n > 0));
    await verify('No country filter is applied yet', async () => {
      expect(await isr.readOrgValueText()).toContain('None');
    });

    const filtered = await phase(`Filter by ${country} and search again`, async () => {
      await isr.selectOrgCountry(country);
      return isr.clickSearchAndWait((n) => n !== null && n > 0 && n < (baseline as number));
    });
    await verify('The country narrows the set without emptying it', async () => {
      // Narrowed, but not emptied — an ignored filter would leave the total untouched and a
      // broken one would return nothing, so both failure directions are covered.
      expect(filtered as number).toBeGreaterThan(0);
      expect(filtered as number).toBeLessThan(baseline as number);
      expect((await isr.readColumnValues('Product Code ID')).length).toBeGreaterThan(0);
    });

    // Reset clears the country, and the unfiltered total comes back unchanged.
    await phase('Click Reset', () => isr.clickReset());
    await verify('Reset clears the country and restores the full set', async () => {
      expect(await isr.readOrgValueText()).toContain('None');
      expect(await isr.clickSearchAndWait((n) => n === baseline)).toBe(baseline);
    });
  });
});
