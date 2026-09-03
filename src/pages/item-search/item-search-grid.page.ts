import { Locator, Page, expect } from '@playwright/test';
import { step } from '../../fixtures/step-decorator';
import { BasePage } from '../base.page';
import { IConfig } from '../../types';

/**
 * Shared grid mechanics for the two Item Search grids (Products and Product Groups).
 * Both pages render the same archetype: a skeleton-hydrated result grid with a
 * "N ... found" count label, per-column header menus, and the same pagination cluster.
 *
 * Readiness on both pages is ALWAYS the skeleton census reaching zero — grids keep
 * their chrome (and, mid-reload, their previous rows) while loading, so a row count
 * is never a ready signal.
 */
export abstract class ItemSearchGridBasePage extends BasePage {
  /** Ceiling for a cold hydration (~20s measured; the ceiling covers a slow evening). */
  protected static readonly HYDRATION_TIMEOUT = 120_000;

  /** Skeleton placeholder selector — identical on both pages. */
  protected static readonly SKELETON = '[data-slot="skeleton"]';

  constructor(page: Page, config?: IConfig) {
    super(page, config);
  }

  /** Waits until every loading placeholder is gone, then for the framework to go quiet. */
  @step('Wait for the page to finish loading')
  async waitForNoSkeletons(timeout: number = ItemSearchGridBasePage.HYDRATION_TIMEOUT): Promise<void> {
    await expect(this.page.locator(ItemSearchGridBasePage.SKELETON)).toHaveCount(0, { timeout });
    await this.waitForAngularStable();
  }

  /**
   * Types a value into a search-panel box with REAL keystrokes. These boxes bind their
   * model per keystroke, and a programmatic fill leaves the model empty — the following
   * Search then runs with no term (proven live: a filled word searched as empty; the
   * same word typed by keys returned its matches). Clearing works the same way: the
   * select-all + delete keys commit the empty value where a plain clear would not.
   *
   * The keystrokes are also DEBOUNCED into the model: a Search clicked immediately after
   * the last key still reads the previous term (proven live on the group search — an
   * immediate click found 0 groups with the word visibly in the box; the identical
   * sequence with a 600ms gap before the click found all 82). The trailing pause lets
   * that commit land before any caller clicks Search; blurring the box does NOT commit.
   */
  protected async typeByKeys(box: Locator, value: string): Promise<void> {
    await box.click();
    await this.page.keyboard.press('Control+a');
    await this.page.keyboard.press('Delete');
    if (value !== '') {
      await box.pressSequentially(value, { delay: 40 });
    }
    await this.page.waitForTimeout(800);
  }

  /** All grid header names in order (empty header cells filtered out). */
  @step('Read the grid header row')
  async readHeaderNames(): Promise<string[]> {
    const names = await this.page.locator('thead th').allTextContents();
    return names.map((n) => n.trim()).filter((n) => n.length > 0);
  }

  /** Number of data rows currently rendered. */
  @step('Count the result rows')
  async readRowCount(): Promise<number> {
    return this.page.locator('tbody tr').count();
  }

  /**
   * Every visible value of one named column, top to bottom, read in a single browser
   * call — the grid can hold 50 rows and a per-row read would pay one round-trip each.
   */
  @step('Read a grid column')
  async readColumnValues(columnName: string): Promise<string[]> {
    return this.page.evaluate((col) => {
      const headers = Array.from(document.querySelectorAll('thead th')).map((t) => (t.textContent ?? '').trim());
      const idx = headers.indexOf(col);
      if (idx < 0) return [];
      return Array.from(document.querySelectorAll('tbody tr')).map((r) => {
        const cell = r.querySelectorAll('td').item(idx);
        return (cell?.textContent ?? '').trim();
      });
    }, columnName);
  }

  /** The first result row's full text — a cheap page-identity anchor for pagination checks. */
  @step('Read the first result row')
  async readFirstRowText(): Promise<string> {
    return ((await this.page.locator('tbody tr').first().textContent()) ?? '').trim();
  }

  /**
   * Parses the "N ... found" count label matching the given pattern (first capture group
   * = the number, commas allowed). Returns null while no label is rendered.
   */
  protected async readCountByPattern(pattern: RegExp): Promise<number | null> {
    const text = await this.page.evaluate(() => document.body.innerText);
    const num = text.match(pattern)?.[1];
    return num !== undefined ? Number(num.replace(/,/g, '')) : null;
  }

  /** Polls the count label until it matches the predicate; returns the settled number. */
  protected async waitForCount(
    pattern: RegExp,
    predicate: (n: number | null) => boolean,
    timeout: number = ItemSearchGridBasePage.HYDRATION_TIMEOUT,
  ): Promise<number | null> {
    let latest: number | null = null;
    await expect
      .poll(async () => {
        latest = await this.readCountByPattern(pattern);
        return predicate(latest);
      }, { timeout })
      .toBe(true);
    return latest;
  }

  // ---------------------------------------------------------------- pagination cluster

  protected pageNumberBox(): Locator {
    // Anchored by aria-label directly — the input's implicit role varies with its type.
    return this.page.locator('input[aria-label="Current page number"]');
  }

  /** The page number shown in the pagination box. */
  @step('Read the current page number')
  async readPageNumber(): Promise<string> {
    return (await this.pageNumberBox().inputValue()).trim();
  }

  /** Total pages, parsed from the "/ N" text beside the page-number box. */
  @step('Read the total page count')
  async readTotalPages(): Promise<number | null> {
    return this.page.evaluate(() => {
      const box = document.querySelector('input[aria-label="Current page number"]');
      const holder = box?.closest('div')?.parentElement;
      const num = (holder?.textContent ?? '').match(/\/\s*([\d,]+)/)?.[1];
      return num !== undefined ? Number(num.replace(/,/g, '')) : null;
    });
  }

  protected paginationButton(name: string): Locator {
    return this.page.getByRole('button', { name, exact: true });
  }

  /** Whether one of the four pagination buttons is currently enabled. */
  @step('Read a pagination button state')
  async isPaginationEnabled(name: string): Promise<boolean> {
    return this.paginationButton(name).isEnabled().catch(() => false);
  }

  /** Clicks a pagination button and waits for the page swap to settle. */
  @step('Move to another result page')
  async clickPagination(name: string): Promise<void> {
    await this.paginationButton(name).click();
    await this.waitForNoSkeletons();
  }

  /**
   * The rows-per-page selector — the only combobox in either grid whose visible text is
   * a bare page-size number, which keeps this filter unique on both pages.
   */
  protected rowsPerPageCombo(): Locator {
    return this.page.locator('button[role="combobox"]').filter({ hasText: /^(10|20|30|40|50)$/ }).first();
  }

  /** The current rows-per-page value. */
  @step('Read the rows-per-page value')
  async readRowsPerPage(): Promise<string> {
    return ((await this.rowsPerPageCombo().textContent()) ?? '').trim();
  }

  /** Opens the rows-per-page list, reads every option verbatim, closes it with Escape. */
  @step('Read the rows-per-page options')
  async readRowsPerPageOptions(): Promise<string[]> {
    await this.rowsPerPageCombo().click();
    const listbox = this.page.locator('[role="listbox"]');
    await listbox.waitFor({ state: 'visible', timeout: 5_000 });
    const options = await listbox.locator('[role="option"]').allTextContents();
    await this.page.keyboard.press('Escape');
    await listbox.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => {});
    return options.map((o) => o.trim()).filter((o) => o.length > 0);
  }

  // ---------------------------------------------------------------- column menus

  /**
   * Opens the header menu of one column. The header button's name is the column name;
   * exact matching is required because resize-handle names contain column names too.
   */
  @step('Open a column header menu')
  async openColumnMenu(columnName: string): Promise<void> {
    await this.page.getByRole('button', { name: columnName, exact: true }).first().click();
    await this.page.locator('[role="menu"]').waitFor({ state: 'visible', timeout: 5_000 });
  }

  /** Entries of the currently open menu (plain items and checkbox items alike). */
  @step('Read the open menu entries')
  async readOpenMenuItems(): Promise<string[]> {
    const items = await this.page.locator('[role="menuitem"], [role="menuitemcheckbox"]').allTextContents();
    return items.map((i) => i.trim()).filter((i) => i.length > 0);
  }

  /** Clicks an entry in the open menu and waits for the resulting reload to settle. */
  @step('Choose a menu entry')
  async clickMenuItem(itemName: string): Promise<void> {
    await this.page
      .locator('[role="menuitem"], [role="menuitemcheckbox"]')
      .filter({ hasText: itemName })
      .first()
      .click();
    await this.waitForNoSkeletons();
  }

  /** Closes any open menu or popover with Escape. */
  @step('Close the open menu')
  async closeOpenMenu(): Promise<void> {
    await this.page.keyboard.press('Escape');
    await this.page.locator('[role="menu"]').waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => {});
  }
}
