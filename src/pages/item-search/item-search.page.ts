import { Locator, Page, expect } from '@playwright/test';
import { step } from '../../fixtures/step-decorator';
import { ItemSearchGridBasePage } from './item-search-grid.page';
import { Log } from '../../utils/logger';
import { IConfig } from '../../types';
import { itemSearchProducts as S } from '../../selectors/item-search/products';
import { ISR_OFFICE, ISR_ROUTE } from '../../data/item-search/item-search';

/**
 * Products (Item Search) page — search panel + 13-column result grid, office 1101.
 *
 * Two behaviors shape every helper here (both proven live 2026-08-31):
 *  - Results load ONLY on Search; Reset empties the grid to "0 products found" until the
 *    next Search. A bare page load may instead RESTORE the last executed search — the app
 *    keeps executed criteria, results and sort order in browser storage — so defaults are
 *    only assertable immediately after Reset.
 *  - The page hydrates in stages behind skeleton placeholders (~20s cold, ~11s for an
 *    unfiltered search); readiness is always the placeholder census reaching zero.
 */
export class ItemSearchPage extends ItemSearchGridBasePage {
  /** The count label this grid renders after any Search or Reset. */
  protected static readonly COUNT_PATTERN = /([\d,]+)\s+products?\s+found/;

  constructor(page: Page, config?: IConfig) {
    super(page, config);
    Log.info('ItemSearchPage initialized');
  }

  // ---------------------------------------------------------------- navigation & readiness

  /** Navigates to the Products page for the office and waits for full hydration. */
  @step('Open the Products page for an office')
  async open(office: string = ISR_OFFICE): Promise<void> {
    const baseUrl = (this.config?.base_url ?? '').replace(/\/+$/, '');
    await this.safeNavigateTo(`${baseUrl}${ISR_ROUTE(office)}`, {
      waitUntil: 'domcontentloaded',
      timeout: 120_000,
    });
    await this.waitForReady();
  }

  /** Hydration gate: skeletons gone AND the search panel's input present. */
  @step('Wait for the search panel to be ready')
  async waitForReady(): Promise<void> {
    await this.waitForNoSkeletons();
    await expect(this.page.locator(S.inpAnyField)).toBeVisible({ timeout: 30_000 });
  }

  /**
   * Per-test baseline: makes sure the page is open, hydrated, and reset to default
   * criteria with an empty result set. Because executed searches are restored from
   * storage on every visit, Reset is the ONLY reliable route to the defaults.
   */
  @step('Reset the page to its default criteria')
  async ensureCleanSearch(office: string = ISR_OFFICE): Promise<void> {
    // Compared on the full path end: the sibling Product Groups page's address CONTAINS
    // this page's path, so a substring check would mistake it for the Products page.
    const onPage = new URL(this.page.url()).pathname.endsWith(ISR_ROUTE(office));
    if (!onPage) {
      await this.open(office);
    } else {
      await this.waitForReady();
    }
    await this.clickReset();
  }

  // ---------------------------------------------------------------- search panel

  /** Types a word into the Any Field box (replacing any restored value). */
  @step('Type a word into the Any Field box')
  async typeAnyField(word: string): Promise<void> {
    await this.typeByKeys(this.page.locator(S.inpAnyField), word);
  }

  /** The Any Field box's current value. */
  @step('Read the Any Field box')
  async readAnyField(): Promise<string> {
    return this.page.locator(S.inpAnyField).inputValue();
  }

  /** Types a value into the barcode box. */
  @step('Type a value into the barcode box')
  async typeBarcode(value: string): Promise<void> {
    await this.typeByKeys(this.page.locator(S.inpBarcode), value);
  }

  /** The barcode box's current value. */
  @step('Read the barcode box')
  async readBarcode(): Promise<string> {
    return this.page.locator(S.inpBarcode).inputValue();
  }

  /** Whether the Keyword Search option is selected. */
  @step('Read the Keyword Search option state')
  async isKeywordSelected(): Promise<boolean> {
    const el = this.page.locator(S.radKeyword);
    const aria = await el.getAttribute('aria-checked');
    if (aria !== null) return aria === 'true';
    return (await el.getAttribute('data-state')) === 'checked';
  }

  /** One of the two filter checkboxes: 0 = Quantity Greater Than Zero, 1 = Active. */
  protected filterCheckbox(index: 0 | 1): Locator {
    return this.page.locator(S.chkFilterAny).nth(index);
  }

  /** Whether a filter checkbox is checked (0 = Quantity Greater Than Zero, 1 = Active). */
  @step('Read a filter checkbox state')
  async isFilterChecked(index: 0 | 1): Promise<boolean> {
    const el = this.filterCheckbox(index);
    const aria = await el.getAttribute('aria-checked');
    if (aria !== null) return aria === 'true';
    return (await el.getAttribute('data-state')) === 'checked';
  }

  /** Toggles a filter checkbox once. */
  @step('Toggle a filter checkbox')
  async toggleFilter(index: 0 | 1): Promise<void> {
    await this.filterCheckbox(index).click();
  }

  // ---------------------------------------------------------------- search / reset actions

  /**
   * Clicks Search and waits for the run to settle: skeletons clear and the count label
   * satisfies the given predicate (default: any number rendered). Returns the count.
   */
  @step('Run the search')
  async clickSearchAndWait(predicate: (n: number | null) => boolean = (n) => n !== null): Promise<number | null> {
    await this.page.locator(S.btnSearch).click();
    await this.waitForNoSkeletons();
    return this.waitForCount(ItemSearchPage.COUNT_PATTERN, predicate);
  }

  /** Clicks Reset and waits for the documented settled state: zero found, no rows. */
  @step('Reset the search criteria')
  async clickReset(): Promise<void> {
    await this.page.locator(S.btnReset).click();
    await this.waitForCount(ItemSearchPage.COUNT_PATTERN, (n) => n === 0);
    await expect(this.page.locator('tbody tr')).toHaveCount(0, { timeout: 15_000 });
  }

  /** The number in the "N products found" label, or null while none is rendered. */
  @step('Read the products count')
  async readFoundCount(): Promise<number | null> {
    return this.readCountByPattern(ItemSearchPage.COUNT_PATTERN);
  }

  // ---------------------------------------------------------------- location & region

  protected locationCombo(): Locator {
    // The accessible name stays "Select Location" regardless of the chosen value.
    return this.page.getByRole('combobox', { name: S.NAME_LOCATION });
  }

  protected regionCombo(): Locator {
    return this.page.getByRole('combobox', { name: S.NAME_REGION });
  }

  /** The Location control's displayed value (the placeholder text when unset). */
  @step('Read the Location value')
  async readLocationText(): Promise<string> {
    return ((await this.locationCombo().textContent()) ?? '').trim();
  }

  /** The Region control's displayed value (the placeholder text when unset). */
  @step('Read the Region value')
  async readRegionText(): Promise<string> {
    return ((await this.regionCombo().textContent()) ?? '').trim();
  }

  /** Opens a dropdown's list and returns its listbox locator. */
  protected async openList(trigger: Locator): Promise<Locator> {
    const listbox = this.page.locator(S.listbox);
    await trigger.click();
    const opened = await listbox.waitFor({ state: 'visible', timeout: 4_000 })
      .then(() => true).catch(() => false);
    if (!opened) {
      Log.warn('[retry] listbox not visible after click — clicking again');
      await trigger.click();
      await listbox.waitFor({ state: 'visible', timeout: 6_000 });
    }
    return listbox;
  }

  /** Opens the Location list and counts its entries, then closes it unchanged. */
  @step('Read the Location list size')
  async readLocationOptionCount(): Promise<number> {
    const listbox = await this.openList(this.locationCombo());
    const count = await listbox.locator(S.optionAny).count();
    await this.closeOpenList(listbox);
    return count;
  }

  /** Whether the Location list offers the given entry (checked without selecting). */
  @step('Look for an office in the Location list')
  async locationListHas(entry: string): Promise<boolean> {
    const listbox = await this.openList(this.locationCombo());
    const found = (await listbox.locator(S.optionAny).filter({ hasText: entry }).count()) > 0;
    await this.closeOpenList(listbox);
    return found;
  }

  /** Opens the Region list and reads every entry, then closes it unchanged. */
  @step('Read the Region list')
  async readRegionOptions(): Promise<string[]> {
    const listbox = await this.openList(this.regionCombo());
    const options = await listbox.locator(S.optionAny).allTextContents();
    await this.closeOpenList(listbox);
    return options.map((o) => o.trim()).filter((o) => o.length > 0);
  }

  /** Closes an open list with Escape. */
  protected async closeOpenList(listbox: Locator): Promise<void> {
    await this.page.keyboard.press('Escape');
    await listbox.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => {});
  }

  /**
   * Selects an entry in the Location or Region dropdown, narrowing the list through its
   * search box first — the office list holds thousands of entries.
   */
  protected async selectInList(trigger: Locator, filterText: string, optionText: string): Promise<void> {
    const listbox = await this.openList(trigger);
    const searchBox = this.page.locator('[data-radix-popper-content-wrapper] input').first();
    if (await searchBox.count()) {
      await searchBox.fill(filterText);
      await this.waitForAngularStable(3_000).catch(() => {});
    }
    const option = listbox.locator(S.optionAny).filter({ hasText: optionText }).first();
    await option.waitFor({ state: 'visible', timeout: 5_000 });
    // The list highlights the first filtered entry. When that is our target, commit it
    // with Enter — a mouse click on the highlighted entry can sit under the list's own
    // sticky search bar and never receive the pointer (a click there timed out live;
    // Enter committed the same entry immediately). Click only when the highlight sits
    // on a different entry than the one asked for.
    const highlighted = listbox.locator('[role="option"][aria-selected="true"]').first();
    const highlightedText = ((await highlighted.textContent().catch(() => '')) ?? '').trim();
    if (highlightedText.includes(optionText)) {
      await this.page.keyboard.press('Enter');
    } else {
      await option.scrollIntoViewIfNeeded({ timeout: 5_000 });
      await option.click();
    }
    await listbox.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
    await this.waitForAngularStable(5_000).catch(() => {});
  }

  /** Sets the Location dropdown to the given office entry. */
  @step('Choose a Location')
  async selectLocation(officeEntry: string, filterText: string): Promise<void> {
    await this.selectInList(this.locationCombo(), filterText, officeEntry);
  }

  /** Sets the Region dropdown to the given region. */
  @step('Choose a Region')
  async selectRegion(region: string): Promise<void> {
    await this.selectInList(this.regionCombo(), region, region);
  }

  // ---------------------------------------------------------------- popovers & chrome

  /**
   * The three popover trigger buttons in stable DOM order:
   * 0 = Product Organization, 1 = Prep Date Time, 2 = Return Date Time.
   * Anchored by attribute — a role-name query finds only the two date buttons
   * (the organization trigger computes a different accessible role/name), so it
   * silently shifted every index by one.
   */
  protected popoverButton(index: 0 | 1 | 2): Locator {
    return this.page.locator(S.btnOpenPopoverAny).nth(index);
  }

  /** Opens the Product Organization popover, returns its full text, and closes it. */
  @step('Open the Product Organization list')
  async readOrgPopoverText(): Promise<string> {
    await this.popoverButton(0).click();
    const popper = this.page.locator('[data-radix-popper-content-wrapper]').last();
    await popper.waitFor({ state: 'visible', timeout: 5_000 });
    const text = (await popper.textContent()) ?? '';
    await this.page.keyboard.press('Escape');
    await popper.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => {});
    return text;
  }

  /**
   * Chooses one country in the Product Organization popover, closes it, and confirms the
   * field shows that country — a click that silently fails to register and a country the
   * page rejects look identical without the read-back.
   */
  @step('Choose a Product Organization country')
  async selectOrgCountry(country: string): Promise<void> {
    await this.popoverButton(0).click();
    const popper = this.page.locator('[data-radix-popper-content-wrapper]').last();
    await popper.waitFor({ state: 'visible', timeout: 5_000 });
    await popper.getByRole('option', { name: country, exact: true }).click();
    await this.page.keyboard.press('Escape');
    await popper.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => {});
    await expect(this.popoverButton(0)).toContainText(country, { timeout: 5_000 });
  }

  /** The full text of the labeled wrapper holding one date field, value included. */
  @step('Read a date field')
  async readDateFieldText(label: 'Prep Date Time' | 'Return Date Time'): Promise<string> {
    return this.page.evaluate((lbl) => {
      // Deepest wrapper that carries BOTH the label and a rendered time — the label
      // alone can sit in its own element, which would drop the value from the read.
      const el = Array.from(document.querySelectorAll('div'))
        .filter((d) => {
          const t = d.textContent ?? '';
          return t.includes(lbl) && /(AM|PM)/.test(t);
        })
        .pop();
      return (el?.textContent ?? '').trim();
    }, label);
  }

  /** Opens one date field's calendar popover (1 = Prep, 2 = Return). */
  @step('Open a date field calendar')
  async openDatePopover(index: 1 | 2): Promise<void> {
    await this.popoverButton(index).click();
    await this.page.locator('[data-radix-popper-content-wrapper]').last()
      .waitFor({ state: 'visible', timeout: 5_000 });
  }

  /** The currently open popover's content container. */
  openPopover(): Locator {
    return this.page.locator('[data-radix-popper-content-wrapper]').last();
  }

  /** Moves the open calendar forward one month. */
  @step('Go to the calendar’s next month')
  async calendarNextMonth(): Promise<void> {
    await this.openPopover().getByRole('button', { name: 'Go to the Next Month' }).click();
    await this.waitForAngularStable(3_000).catch(() => {});
  }

  /**
   * Picks the day whose label carries the given fragment (day buttons are labelled with
   * the full date, e.g. "Sunday, November 22nd, 2026") in the open calendar.
   */
  @step('Pick a day in the open calendar')
  async pickCalendarDay(labelFragment: string): Promise<void> {
    const day = this.openPopover().locator(`button[aria-label*="${labelFragment}"]`).first();
    await day.waitFor({ state: 'visible', timeout: 5_000 });
    await day.click();
    await this.waitForAngularStable(3_000).catch(() => {});
  }

  /**
   * The date trigger's rendered text and how far it spills past its visible box, in
   * pixels (zero = fits). Wide dates paint their tail outside the border — found and
   * reported 2026-09-01 — so render cases measure instead of eyeballing.
   */
  @step('Measure a date field’s rendered value')
  async readDateOverflow(index: 1 | 2): Promise<{ text: string; spill: number }> {
    return this.popoverButton(index).evaluate((b) => ({
      text: (b.textContent ?? '').trim(),
      spill: Math.max(0, b.scrollWidth - b.clientWidth),
    }));
  }

  /** Whether the prep-after-return message is showing. */
  @step('Look for the date-order message')
  async isDateOrderMessageShown(): Promise<boolean> {
    return this.page.evaluate(() => /prep date cannot be after the return date/i.test(document.body.innerText));
  }

  /** Whether the Search button is currently enabled. */
  @step('Read the Search button state')
  async isSearchEnabled(): Promise<boolean> {
    return this.page.locator(S.btnSearch).isEnabled().catch(() => false);
  }

  /** Closes any open popover with Escape. */
  @step('Close the open popover')
  async closePopover(): Promise<void> {
    await this.page.keyboard.press('Escape');
    await this.waitForAngularStable(3_000).catch(() => {});
  }

  /** Clicks the Search help button (click-triggered popover, not hover). */
  @step('Open the search help')
  async openSearchHelp(): Promise<void> {
    await this.page.locator(S.btnSearchHelp).click();
    await this.openPopover().waitFor({ state: 'visible', timeout: 5_000 });
  }

  /** The header information icon. */
  moreInformationButton(): Locator {
    return this.page.locator(S.btnMoreInformation);
  }

  /** The search-panel collapse toggle (its name flips between collapse and expand). */
  collapseButton(): Locator {
    return this.page.getByRole('button', { name: /(collapse|expand) search panel/i });
  }

  /** The collapse toggle matched by ONE of its two states — the name flip is the proof a toggle landed. */
  collapseToggleNamed(name: 'Collapse search panel' | 'Expand search panel'): Locator {
    return this.page.getByRole('button', { name, exact: true });
  }

  /** The Product Organization field's displayed value text. */
  @step('Read the Product Organization value')
  async readOrgValueText(): Promise<string> {
    // The resting value renders inside the trigger button itself — reading the deepest
    // wrapper that mentions the label can land on the label element alone and drop the
    // value entirely (it did, live).
    return ((await this.popoverButton(0).textContent()) ?? '').trim();
  }

  /** The Grid Options button. */
  gridOptionsButton(): Locator {
    return this.page.getByRole('button', { name: S.NAME_GRID_OPTIONS, exact: true });
  }

  /**
   * Parks the pointer on a neutral corner and waits for every tooltip to close. A
   * previous control's tooltip can outlive the pointer leaving it, and a read taken
   * then returns the OLD text (seen live — the third hover in a row read the second
   * control's tooltip). With the stage clear, whichever tooltip appears next after a
   * hover is unambiguously that hover's own.
   */
  @step('Let any open tooltip close')
  async waitForTooltipsToClear(): Promise<void> {
    await this.page.mouse.move(0, 0);
    await expect(this.page.locator(S.tooltip)).toHaveCount(0, { timeout: 10_000 });
  }

  /** Hovers a control and returns the tooltip text that appears (empty if none). */
  @step('Hover a control and read its tooltip')
  async hoverAndReadTooltip(target: Locator, timeout = 5_000): Promise<string> {
    await this.waitForTooltipsToClear();
    const anyTooltip = this.page.locator(S.tooltip);
    await target.hover();
    const tooltip = anyTooltip.first();
    const appeared = await tooltip.waitFor({ state: 'visible', timeout })
      .then(() => true).catch(() => false);
    if (!appeared) return '';
    const text = ((await tooltip.textContent()) ?? '').trim();
    // Park the pointer on a neutral corner so the tooltip closes before the next hover.
    await this.page.mouse.move(0, 0);
    await tooltip.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => {});
    return text;
  }

  /**
   * Index (row, column) of the first cell whose text is cut off, and of the first that
   * fits, computed in one browser call so the tooltip cases never hardcode data.
   *
   * Measured on the cell's inner text SPAN, never the cell box: each cell caps its
   * width and clips through that span (ellipsis via longhand overflow classes), so the
   * cell element itself always reports its text as fitting. A census taken on the cell
   * box returns zero everywhere and reads exactly like "nothing truncates" — that
   * false zero shipped once before this comment was earned.
   */
  @step('Find a cut-off and a fitting grid cell')
  async findTruncationSamples(): Promise<{
    truncated: { row: number; col: number; text: string } | null;
    fitting: { row: number; col: number; text: string } | null;
  }> {
    return this.page.evaluate(() => {
      let truncated: { row: number; col: number; text: string } | null = null;
      let fitting: { row: number; col: number; text: string } | null = null;
      const rows = Array.from(document.querySelectorAll('tbody tr'));
      for (let r = 0; r < rows.length && (!truncated || !fitting); r++) {
        const cells = Array.from(rows[r]?.querySelectorAll('td') ?? []);
        for (let c = 0; c < cells.length && (!truncated || !fitting); c++) {
          const cell = cells[c];
          if (!cell) continue;
          const inner = (cell.firstElementChild ?? cell) as HTMLElement;
          const text = (inner.textContent ?? '').trim();
          if (!text) continue;
          const overflows = inner.scrollWidth > inner.clientWidth + 1;
          if (overflows && !truncated) truncated = { row: r, col: c, text };
          if (!overflows && !fitting) fitting = { row: r, col: c, text };
        }
      }
      return { truncated, fitting };
    });
  }

  /** A cell locator by zero-based row and column. */
  cellAt(row: number, col: number): Locator {
    return this.page.locator('tbody tr').nth(row).locator('td').nth(col);
  }

  // ---------------------------------------------------------------- grid options menu

  /** Opens the Grid Options menu. */
  @step('Open the Grid Options menu')
  async openGridOptions(): Promise<void> {
    await this.gridOptionsButton().click();
    await this.page.locator(S.menu).waitFor({ state: 'visible', timeout: 5_000 });
  }

  /** Whether a column entry in the open Grid Options menu is checked. */
  @step('Read a Grid Options column entry state')
  async isGridOptionChecked(columnName: string): Promise<boolean> {
    const item = this.page.locator('[role="menuitemcheckbox"]').filter({ hasText: columnName }).first();
    return (await item.getAttribute('aria-checked')) === 'true';
  }
}
