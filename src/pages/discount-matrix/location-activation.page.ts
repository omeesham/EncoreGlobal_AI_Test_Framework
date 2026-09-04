import { Locator, Page, expect } from '@playwright/test';
import { step } from '../../fixtures/step-decorator';
import { Log } from '../../utils/logger';
import { IConfig } from '../../types';
import { DiscountMatrixBasePage } from './discount-matrix.page';
import { discountMatrixShared as S } from '../../selectors/discount-matrix/shared';
import { locationActivation as L } from '../../selectors/discount-matrix/location-activation';
import { DM_OFFICE } from '../../data/discount-matrix/discount-matrix';

/**
 * Location Activation tab of the Discount Matrix page.
 *
 * The grid lists every location for the selected country (2041 for United States at
 * measurement time, 2026-08-25) on either authorized office. Data arrives ~43 seconds after
 * the tab click: until then the grid paints textless placeholder rows with the search box
 * disabled, so readiness requires rendered rows to carry text — a row count or a visible
 * footer alone reads the loading window as loaded. The grid virtualizes (renders a bounded
 * row window against the full total) and has no paginator.
 *
 * The Active cell is a `Yes` / `No` label button that swaps to an inline checkbox editor on
 * click; checking it enables Save and Cancel, and Cancel restores the label and value. The
 * edit helpers here never save — mutating this shared listing is out of scope.
 */
export class LocationActivationPage extends DiscountMatrixBasePage {
  constructor(page: Page, config?: IConfig) {
    super(page, config);
    Log.info('LocationActivationPage initialized');
  }

  /** The tab's own panel — every colliding button name is resolved inside it. */
  panel(): Locator {
    return this.page.locator(S.pnlLocationActivation);
  }

  // ---------------------------------------------------------------- open & readiness

  /** Clicks the Location Activation tab and waits for the panel to settle. */
  @step('Open the Location Activation tab')
  async openTab(): Promise<void> {
    await this.clickTab(S.TAB_LOCATION_ACTIVATION);
    await this.waitForLoaReady();
  }

  /** Clicks the tab WITHOUT waiting — for cases that assert the loading window itself. */
  @step('Click the Location Activation tab')
  async openTabRaw(): Promise<void> {
    await this.clickTab(S.TAB_LOCATION_ACTIVATION);
    await this.panel().waitFor({ state: 'visible', timeout: 30_000 });
  }

  /**
   * Ready = placeholders cleared AND rendered rows carry text AND the count footer is up.
   * Data lands ~43s after the tab click; the polling below is one page-side predicate, not
   * a per-element loop.
   */
  @step('Wait for the Location Activation tab to finish loading')
  async waitForLoaReady(timeout: number = 240_000): Promise<void> {
    await this.panel().waitFor({ state: 'visible', timeout: 30_000 });
    await this.page.waitForFunction(
      ({ panelSel, skeletonSel }) => {
        const panel = document.querySelector(panelSel);
        if (!panel) return false;
        if (document.querySelectorAll(skeletonSel).length > 0) return false;
        const rows = Array.from(panel.querySelectorAll('tbody tr'));
        if (!rows.some((r) => (r.textContent ?? '').trim().length > 0)) return false;
        return /[\d,]+\s+matching locations?/.test(panel.textContent ?? '');
      },
      { panelSel: S.pnlLocationActivation, skeletonSel: S.skeleton },
      { timeout },
    );
    await this.waitForAngularStable();
  }

  /**
   * Per-test baseline guard: page open on the office, Location Activation loaded with data,
   * and nothing pending (the panel's Save disabled). Any violation triggers a reload + reopen,
   * which discards whatever a crashed predecessor left dirty.
   */
  @step('Make sure the Location Activation tab is loaded and clean')
  async ensureCleanLoa(office: string = DM_OFFICE): Promise<void> {
    let ready = false;
    const onPage = this.page.url().includes(`/locations/${office}/settings/discount-matrix`);
    if (onPage && (await this.getActiveTabName()) === S.TAB_LOCATION_ACTIVATION) {
      const rows = await this.readBodyRows();
      ready =
        (await this.page.locator(S.skeleton).count()) === 0 &&
        rows.rowsWithText > 0 &&
        (await this.toolbarButton(L.BTN_SAVE).isDisabled());
    }
    if (!ready) {
      Log.info('[baseline] Location Activation not settled or not clean — reloading');
      await this.open(office);
      await this.openTab();
    }
  }

  // ---------------------------------------------------------------- reads

  /** Grid column header texts, left to right, in one call. */
  @step('Read the grid column headers')
  async readColumnHeaders(): Promise<string[]> {
    const headers = await this.panel().locator(L.colHeaderAny).allTextContents();
    return headers.map((h) => h.trim()).filter((h) => h.length > 0);
  }

  /** The verbatim footer text (e.g. `2041 matching locations`). */
  @step('Read the match-count footer')
  async readFooterText(): Promise<string> {
    const t = await this.panel().locator(L.lblMatchCount).first().textContent().catch(() => '');
    return (t ?? '').trim();
  }

  /** The footer's numeric total, comma-tolerant. Returns -1 when the footer is absent. */
  @step('Read the match-count total')
  async readFooterTotal(): Promise<number> {
    const text = await this.readFooterText();
    const m = text.match(/([\d,]+)\s+matching locations?/);
    return m && m[1] ? parseInt(m[1].replace(/,/g, ''), 10) : -1;
  }

  /**
   * Body rows read in ONE call, separating data rows from the virtual-scroll spacer: a data
   * row carries one cell per column, while the spacer is a single full-width cell whose
   * pixel height stands in for the thousands of unrendered rows. The loading window paints
   * textless data-shaped rows, which is why rows-with-text (not row count) is the oracle.
   */
  @step('Read the body rows')
  async readBodyRows(): Promise<{ dataRows: number; rowsWithText: number; spacerRows: number }> {
    return this.panel().locator(L.rowAny).evaluateAll((rows) => {
      const data = rows.filter((r) => r.querySelectorAll('td').length > 1);
      return {
        dataRows: data.length,
        rowsWithText: data.filter((r) => (r.textContent ?? '').trim().length > 0).length,
        spacerRows: rows.length - data.length,
      };
    });
  }

  /** First-column texts of the rendered rows, in one call. */
  @step('Read the rendered location names')
  async readLeadingLocations(): Promise<string[]> {
    return this.panel().locator(L.rowAny).evaluateAll((rows) =>
      rows
        .map((r) => (r.querySelector('td')?.textContent ?? '').trim())
        .filter((t) => t.length > 0),
    );
  }

  /** The search box. */
  searchBox(): Locator {
    return this.panel().locator(L.inpSearch);
  }

  /** A toolbar button by its exact name, scoped to this panel. */
  toolbarButton(name: string): Locator {
    return this.panel().getByRole('button', { name, exact: true });
  }

  /** Number of column headers and of per-column resize handles, in one pass. */
  @step('Count the header resize controls')
  async readResizeCounts(): Promise<{ headers: number; resizeHandles: number }> {
    const headers = (await this.readColumnHeaders()).length;
    const resizeHandles = await this.panel().locator(L.btnResizeAny).count();
    return { headers, resizeHandles };
  }

  // ---------------------------------------------------------------- search & sort

  /** Types into the search box character by character. */
  @step('Type into the location search box')
  async typeSearch(value: string): Promise<void> {
    await this.searchBox().click();
    await this.searchBox().pressSequentially(value, { delay: 40 });
  }

  /** Clears the search box. */
  @step('Clear the location search box')
  async clearSearch(): Promise<void> {
    await this.searchBox().click();
    await this.page.keyboard.press('Control+a');
    await this.page.keyboard.press('Delete');
  }

  /** Clicks a grid column header by its text (the sort affordance, when it works). */
  @step('Click a grid column header')
  async clickHeader(name: string): Promise<void> {
    await this.panel().locator(L.colHeaderAny, { hasText: name }).first().click();
  }

  // ---------------------------------------------------------------- Active-cell editing

  /** The Active cell (third column) of the row whose Location text contains the given text. */
  private activeCell(rowText: string): Locator {
    return this.panel().locator(L.rowAny, { hasText: rowText }).first().locator('td').nth(2);
  }

  /**
   * The Active cell's current mode and value, in one call: at rest it is a text label
   * button (`Yes`/`No`); while being edited it is an inline checkbox.
   */
  @step('Read the Active cell state')
  async readActiveCellState(rowText: string): Promise<{ mode: string; label: string | null; checked: string | null }> {
    return this.activeCell(rowText).evaluate((td) => {
      const cb = td.querySelector('[role="checkbox"]');
      const label = td.querySelector('button:not([role="checkbox"])');
      return {
        mode: cb ? 'checkbox' : label ? 'label' : 'other',
        label: label ? (label.textContent ?? '').trim() : null,
        checked: cb ? cb.getAttribute('aria-checked') : null,
      };
    });
  }

  /** Clicks the Active cell's label button, swapping it into its checkbox editor. */
  @step('Open the Active cell editor')
  async clickActiveLabel(rowText: string): Promise<void> {
    await this.activeCell(rowText).locator('button:not([role="checkbox"])').click();
  }

  /** Clicks the Active cell's inline checkbox, flipping the pending value. */
  @step('Toggle the Active checkbox')
  async clickActiveCheckbox(rowText: string): Promise<void> {
    await this.activeCell(rowText).locator(L.chkActiveEditor).click();
  }

  /** Polls the panel's Save button to the wanted enabled state; returns whether it got there. */
  @step('Wait for the panel Save state')
  async waitForLoaSave(enabled: boolean, timeoutMs: number = 15_000): Promise<boolean> {
    try {
      await expect
        .poll(async () => !(await this.toolbarButton(L.BTN_SAVE).isDisabled()), { timeout: timeoutMs })
        .toBe(enabled);
      return true;
    } catch {
      return false;
    }
  }

  /** Clicks the panel's Cancel to discard pending row edits. */
  @step('Discard pending row edits')
  async clickLoaCancel(): Promise<void> {
    await this.toolbarButton(L.BTN_CANCEL).click();
  }
}
