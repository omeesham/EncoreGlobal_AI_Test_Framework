import { Download, Page } from '@playwright/test';
import { step } from '../../fixtures/step-decorator';
import { BasePage } from '../base.page';
import { Log } from '../../utils/logger';
import { IConfig } from '../../types';
import {
  TAB_LIST,
  TAB_COMPANY_MATRIX,
  TAB_REGION_WEEKLY_PEAKS,
  TAB_LOCATION_ACTIVATION,
  PANEL_COMPANY_MATRIX,
  CMB_COUNTRY,
  CMB_CURRENCY,
  CMB_BUSINESS_TIER,
  INP_GAV_DISCOUNT_THRESHOLD,
  LISTBOX,
  VALIDATION_MESSAGE_CANDIDATES,
  ROWS,
  GRID_SKELETON,
  COL_HEADERS,
  rowByTierRange,
  BTN_ROW_DELETE,
  BTN_ROW_EDIT,
  BTN_ADD_TIER,
  BTN_EXPORT,
  BTN_SAVE,
  DLG_EDIT_TIER,
  DLG_EDIT_TIER_INPUTS,
  BTN_EDIT_CANCEL,
  BTN_EDIT_UPDATE,
  DLG_ADD_TIER,
  INP_ADD_TIER_END,
  BTN_ADD_CANCEL,
  BTN_ADD_TIER_CONFIRM,
} from '../../selectors/discount-matrix/company-matrix';

/**
 * Company Matrix grid paint timeout.
 *
 * The grid container is mounted before its data arrives — waiting on the container alone
 * produced false "grid is empty" findings on the sibling module. This timeout is set to
 * 45 s, well above the observed ~22 s first-paint latency on comparable grids, to give
 * the 9-row tier dataset headroom without blocking indefinitely.
 */
const GRID_READY_TIMEOUT_MS = 45_000;

/**
 * Keystroke cadence for the typing helpers below. This page's numeric fields reformat their
 * own value on commit, and Playwright's `fill()` sets the value in one synthetic event that the
 * field's formatter mis-parses — filling "20%" produced "15.2%" where typing the same characters
 * produced "20%". Typing character by character lets the field process each keystroke as a real
 * user's would.
 */
const KEYSTROKE_DELAY_MS = 80;

/**
 * URL fragment matched when waiting for the save POST to complete. The button
 * disables optimistically on click — before the server responds — so the route
 * fragment is used to identify the in-flight request and block until it settles.
 */
const SAVE_POST_URL_FRAGMENT = '/settings/discount-matrix';

/**
 * How long to wait for the form to report clean after a save. The form signals
 * unsaved changes by cancelling the browser's beforeunload event; a navigation
 * attempted while it is still dirty will cancel the in-flight write. 15 s is
 * well above the observed ~1.5 s settle time.
 */
const FORM_CLEAN_TIMEOUT_MS = 15_000;

/**
 * Company Matrix page — Location Settings → Discount Matrix → Company Matrix tab.
 *
 * Route: `/navigator/locations/{office}/settings/discount-matrix`
 *
 * The page has three tabs: Company Matrix (active by default), Region Weekly Peaks,
 * and Location Activation. This page object covers the Company Matrix tab only.
 *
 * Critical behaviours:
 * - The grid container renders before data arrives. The ready-gate waits on a non-zero
 *   row count, not on container presence — container-only waits produced false empty-grid
 *   findings on the sibling discount module.
 * - Row lookup is always content-anchored by tier-range text (e.g. "0 - 1500"). Index-based
 *   lookups are unreliable because shared save handlers may reorder rows.
 * - The grid is entirely read-only in the DOM (no inline cell inputs). All editing happens
 *   through the Edit Tier dialog opened from each row's Edit button.
 * - Tab ids are auto-generated Radix values; tabs are always selected by visible text and
 *   accessible role, never by a Radix-generated id.
 * - No save-confirmation method is authored here. The save dialog for this surface has not
 *   been measured; see ## ASK in this ticket.
 */
export class CompanyMatrixPage extends BasePage {
  constructor(page: Page, config?: IConfig) {
    super(page, config);
    Log.info('CompanyMatrixPage initialized');
  }

  // ---------------------------------------------------------------- navigation & ready

  /**
   * Opens the Discount Matrix page for an office and waits for the Company Matrix grid
   * to paint its first rows. Never resolves against the empty skeleton state.
   */
  @step('Open the Discount Matrix page for an office')
  async open(officeNo: string = '1604'): Promise<void> {
    const baseUrl = this.config?.base_url || '';
    await this.safeNavigateTo('about:blank');
    await this.navigateTo(`${baseUrl}locations/${officeNo}/settings/discount-matrix`);
    await this.waitForGrid();
  }

  /**
   * Waits for the Company Matrix grid to display real data rows.
   *
   * The grid first paints 6 placeholder rows of 24 cells — each cell containing a
   * `div[data-slot="skeleton"]` animated pulse element. A non-zero row count is satisfied
   * by these placeholders in roughly 12 ms, long before any tier data arrives. Polling for
   * rows alone therefore cannot distinguish a loaded grid from a loading one.
   *
   * This gate is satisfied only when the panel contains at least one `tbody tr` AND zero
   * `[data-slot="skeleton"]` elements — meaning the placeholders have been replaced by the
   * 9 real tier rows of 23 cells. The panel is resolved in plain JavaScript (not with a
   * Playwright pseudo-class, which is invalid CSS inside the browser) by scanning
   * `[role="tabpanel"]` elements for one whose button text is exactly "Add Tier".
   *
   * Timeout is set to {@link GRID_READY_TIMEOUT_MS} (45 s).
   */
  @step('Wait for the Company Matrix grid to show rows')
  async waitForGrid(timeout = GRID_READY_TIMEOUT_MS): Promise<void> {
    // Extract the plain-CSS skeleton attribute selector from GRID_SKELETON.
    // GRID_SKELETON contains a Playwright pseudo-class for the panel scope that is
    // not valid inside the browser; the descendant portion '[data-slot="skeleton"]' is
    // valid CSS and is passed as an argument so the import is consumed at Node level.
    const skeletonSel = GRID_SKELETON.split(' ').pop() as string;
    await this.page.locator(TAB_LIST).first().waitFor({ state: 'visible', timeout });
    await this.page.waitForFunction(
      ({ skeletonSel: sel }) => {
        const panels = Array.from(document.querySelectorAll('[role="tabpanel"]'));
        const panel = panels.find((p) =>
          Array.from(p.querySelectorAll('button')).some(
            (b) => b.textContent?.trim() === 'Add Tier'
          )
        );
        if (!panel) return false;
        const rows = panel.querySelectorAll('tbody tr');
        const skeletons = panel.querySelectorAll(sel);
        return rows.length > 0 && skeletons.length === 0;
      },
      { skeletonSel },
      { timeout }
    );
    await this.waitForAngularStable();
  }

  // ---------------------------------------------------------------- tab navigation

  /**
   * Switches to a tab by its visible label and waits for the new panel to become visible.
   * Selects tabs by visible text and [role="tab"] — never by Radix-generated id.
   */
  @step('Switch to a tab on the Discount Matrix page')
  async switchTab(tabName: 'Company Matrix' | 'Region Weekly Peaks' | 'Location Activation'): Promise<void> {
    const selectorMap: Record<string, string> = {
      'Company Matrix': TAB_COMPANY_MATRIX,
      'Region Weekly Peaks': TAB_REGION_WEEKLY_PEAKS,
      'Location Activation': TAB_LOCATION_ACTIVATION,
    };
    await this.page.locator(selectorMap[tabName] as string).first().click();
    await this.waitForAngularStable();
  }

  // ---------------------------------------------------------------- grid — row count & headers

  /** Number of tier rows currently visible in the Company Matrix grid. */
  @step('Read the number of rows in the Company Matrix grid')
  async getRowCount(): Promise<number> {
    return this.page.locator(ROWS).count();
  }

  /**
   * Returns the ordered list of tier-range labels as rendered in the grid.
   * Each label is the text content of td index 1 in a tier row (e.g. "0 - 1500").
   * td index 0 is the row's button cell (Delete + Edit); td index 1 is the tier-range
   * label — do not revert this to .first(), which reads the empty button cell.
   *
   * When the grid is empty the application renders a placeholder row with fewer than two
   * cells (no tier-range cell at index 1). Such rows are skipped rather than read, so an
   * empty grid returns an empty array promptly without throwing or stalling.
   */
  @step('Read the tier range labels from the Company Matrix grid')
  async getTierRangeLabels(): Promise<string[]> {
    const labels = await this.page.locator(ROWS).evaluateAll((rows) =>
      rows
        // Empty-state placeholder rows have fewer than 2 cells — skip them.
        .filter((r) => r.querySelectorAll('td').length >= 2)
        .map((r) => (r.querySelectorAll('td')[1]?.textContent || '').replace(/\s+/g, ' ').trim())
        .filter((t) => t.length > 0),
    );
    return labels;
  }

  /**
   * Returns all header cell texts from the Company Matrix grid thead.
   * Includes both the column-group headers (Non-Peak, Standard, Peak) and the
   * day-bucket sub-headers (0-15, 16-30, …, 365+).
   */
  @step('Read the column headers of the Company Matrix grid')
  async getColumnHeaders(): Promise<string[]> {
    const raw = await this.page.locator(COL_HEADERS).allTextContents();
    return raw.map((h) => h.replace(/\s+/g, ' ').trim()).filter((h) => h.length > 0);
  }

  // ---------------------------------------------------------------- grid — row lookup & cell reading

  /**
   * Returns the `tr` locator for the row matching the given tier-range text.
   * Content-anchored — never by index. Throws if no such row is found.
   *
   * @param tierRange - e.g. "0 - 1500" or "100001 - 20000000"
   */
  @step('Find a tier row by its range label')
  async findRowByTierRange(tierRange: string): Promise<import('@playwright/test').Locator> {
    const row = this.page.locator(rowByTierRange(tierRange)).first();
    const count = await row.count();
    if (count === 0) {
      throw new Error(
        `No tier row found with range "${tierRange}". ` +
        `Confirm the criteria bar selection matches the intended tier set.`
      );
    }
    return row;
  }

  /**
   * Reads the rendered percentage text from one cell in the grid, addressed by tier range,
   * column group name, and day-bucket label.
   *
   * The cell is located by finding the tier row, then finding the td whose column group
   * (Non-Peak / Standard / Peak) and day-bucket (0-15, 16-30, …, 365+) align with the
   * requested position. Column groups occupy 7 cells each. Measured layout: td index 0
   * is the row's button cell (Delete + Edit), td index 1 is the tier-range label,
   * indices 2–22 are the 21 percentage cells (left to right across all three groups).
   *
   * @param tierRange - e.g. "0 - 1500"
   * @param columnGroup - "Non-Peak" | "Standard" | "Peak"
   * @param dayBucket - "0-15" | "16-30" | "31-60" | "61-90" | "91-180" | "181-365" | "365 +"
   */
  @step('Read one percentage cell from the Company Matrix grid')
  async getCellText(
    tierRange: string,
    columnGroup: 'Non-Peak' | 'Standard' | 'Peak',
    dayBucket: '0-15' | '16-30' | '31-60' | '61-90' | '91-180' | '181-365' | '365 +',
  ): Promise<string> {
    const groupOffsets: Record<string, number> = { 'Non-Peak': 0, 'Standard': 7, 'Peak': 14 };
    const buckets = ['0-15', '16-30', '31-60', '61-90', '91-180', '181-365', '365 +'];
    const bucketIndex = buckets.indexOf(dayBucket);
    if (bucketIndex === -1) throw new Error(`Unknown day bucket: "${dayBucket}"`);
    // Measured layout: td 0 = button cell, td 1 = tier-range label, td 2–22 = 21 percentage cells
    const tdIndex = (groupOffsets[columnGroup] as number) + bucketIndex + 2;
    const row = await this.findRowByTierRange(tierRange);
    const cell = row.locator('td').nth(tdIndex);
    const text = await cell.textContent();
    return (text || '').replace(/\s+/g, ' ').trim();
  }

  /**
   * Returns the 21 percentage cell values for a tier row, in DOM order across all three
   * column groups. Reads td indices 2–22 (measured layout: td 0 = button cell,
   * td 1 = tier-range label, td 2–22 = the 21 percentage cells).
   * Whitespace is normalised the same way as {@link getCellText}.
   *
   * @param tierRange - e.g. "0 - 1500"
   */
  @step('Read all percentage values from a tier row')
  async getRowValues(tierRange: string): Promise<string[]> {
    const row = await this.findRowByTierRange(tierRange);
    const cellTexts = await row.evaluate((el) =>
      Array.from(el.querySelectorAll('td')).map((td) => (td.textContent || '').replace(/\s+/g, ' ').trim()),
    );
    const cellCount = cellTexts.length;
    if (cellCount < 23) {
      throw new Error(
        `Tier row "${tierRange}" has ${cellCount} cell(s) — expected at least 23. ` +
        `This row is not a data row and cannot be read.`
      );
    }
    return cellTexts.slice(2, 23);
  }

  /**
   * Returns the count of Edit and Delete controls inside the row for the given tier range.
   * Scopes both lookups to the matched row. Never throws on an unexpected count — the
   * caller is responsible for asserting what is correct.
   *
   * @param tierRange - e.g. "0 - 1500"
   */
  @step('Count the Edit and Delete controls in a tier row')
  async getRowActionCounts(tierRange: string): Promise<{ edit: number; delete: number }> {
    const row = await this.findRowByTierRange(tierRange);
    const edit = await row.locator(BTN_ROW_EDIT).count();
    const del = await row.locator(BTN_ROW_DELETE).count();
    return { edit, delete: del };
  }

  /**
   * Counts every editable control inside the grid body rows: input, textarea, select,
   * elements with contenteditable="true", and elements with role="textbox".
   * Returns the total count so a caller can prove the percentage cells are display-only.
   */
  @step('Count editable controls inside the Company Matrix grid body')
  async getGridInputControlCount(): Promise<number> {
    const gridRows = this.page.locator(ROWS);
    return gridRows.locator('input, textarea, select, [contenteditable="true"], [role="textbox"]').count();
  }

  /**
   * Returns one array of trimmed header texts per header row in the Company Matrix grid,
   * in document order. Empty strings within each row are dropped. This lets a caller
   * assert both the group row (Non-Peak / Standard / Peak) and the day-bucket row
   * (0-15, 16-30, …, 365+) without this method deciding which row is which.
   *
   * Built from PANEL_COMPANY_MATRIX's thead rows directly — COL_HEADERS flattens all th
   * elements together and cannot answer per-row questions.
   */
  @step('Read the header rows of the Company Matrix grid')
  async getColumnHeaderRows(): Promise<string[][]> {
    const headerRows = this.page.locator(`${PANEL_COMPANY_MATRIX} thead tr`);
    const rowCount = await headerRows.count();
    const result: string[][] = [];
    for (let r = 0; r < rowCount; r++) {
      const cells = headerRows.nth(r).locator('th');
      const raw = await cells.allTextContents();
      const trimmed = raw.map((t) => t.replace(/\s+/g, ' ').trim()).filter((t) => t.length > 0);
      result.push(trimmed);
    }
    return result;
  }

  // ---------------------------------------------------------------- criteria bar

  /** Reads the current value of the Country combobox in the criteria bar. */
  @step('Read the Country value from the criteria bar')
  async getCriteriaCountry(): Promise<string> {
    const text = await this.page.locator(CMB_COUNTRY).textContent();
    return (text || '').replace(/\s+/g, ' ').trim();
  }

  /** Reads the current value of the Currency combobox in the criteria bar. */
  @step('Read the Currency value from the criteria bar')
  async getCriteriaCurrency(): Promise<string> {
    const text = await this.page.locator(CMB_CURRENCY).textContent();
    return (text || '').replace(/\s+/g, ' ').trim();
  }

  /** Reads the current value of the Business Tier combobox in the criteria bar. */
  @step('Read the Business Tier value from the criteria bar')
  async getCriteriaBusinessTier(): Promise<string> {
    const text = await this.page.locator(CMB_BUSINESS_TIER).textContent();
    return (text || '').replace(/\s+/g, ' ').trim();
  }

  /** Reads the current value of the GAV Discount Threshold input in the criteria bar. */
  @step('Read the GAV Discount Threshold value from the criteria bar')
  async getCriteriaThreshold(): Promise<string> {
    return this.page.locator(INP_GAV_DISCOUNT_THRESHOLD).inputValue();
  }

  // ---------------------------------------------------------------- criteria bar — private helpers

  /**
   * Returns the threshold input locator. Centralises the selector reference so all
   * methods that drive this field resolve from one place.
   */
  private async readThresholdField(): Promise<import('@playwright/test').Locator> {
    return this.page.locator(INP_GAV_DISCOUNT_THRESHOLD);
  }

  /**
   * Clicks the given combobox trigger and waits for the Radix listbox to appear.
   * If the listbox does not appear after the first click, retries once with a longer
   * timeout — a single click is not always enough for Radix dropdowns.
   * Returns the listbox Locator once visible.
   *
   * No `.first()` is used here: the three combobox selectors this helper receives
   * (CMB_COUNTRY, CMB_CURRENCY, CMB_BUSINESS_TIER) were re-anchored on label adjacency
   * and proven to resolve to exactly one element each. Using `.first()` would silently
   * pick a survivor if that ever stopped being true, hiding a selector regression rather
   * than surfacing it as a visible failure.
   */
  private async openListbox(triggerSelector: string): Promise<import('@playwright/test').Locator> {
    await this.page.locator(triggerSelector).click();
    const listbox = this.page.locator(LISTBOX);
    try {
      await listbox.waitFor({ state: 'visible', timeout: 3_000 });
    } catch {
      await this.page.locator(triggerSelector).click();
      await listbox.waitFor({ state: 'visible', timeout: 5_000 });
    }
    return listbox;
  }

  /**
   * Dismisses an open listbox by pressing Escape, then waits for it to be hidden.
   * A timeout waiting for the hidden state is swallowed so a caller is never left
   * blocked if the listbox closed by other means.
   */
  private async closeListbox(): Promise<void> {
    await this.page.keyboard.press('Escape');
    try {
      await this.page.locator(LISTBOX).waitFor({ state: 'hidden', timeout: 3_000 });
    } catch {
      // listbox may have already closed; safe to continue
    }
  }

  // ---------------------------------------------------------------- criteria bar — option readers

  /** Reads all available options from the Country dropdown in the criteria bar. */
  @step('Read the available Country options from the criteria bar')
  async getCountryOptions(): Promise<string[]> {
    const listbox = await this.openListbox(CMB_COUNTRY);
    const texts = await listbox.locator('[role="option"]').allTextContents();
    await this.closeListbox();
    return texts.map((t) => t.trim()).filter((t) => t.length > 0);
  }

  /** Reads all available options from the Currency dropdown in the criteria bar. */
  @step('Read the available Currency options from the criteria bar')
  async getCurrencyOptions(): Promise<string[]> {
    const listbox = await this.openListbox(CMB_CURRENCY);
    const texts = await listbox.locator('[role="option"]').allTextContents();
    await this.closeListbox();
    return texts.map((t) => t.trim()).filter((t) => t.length > 0);
  }

  /** Reads all available options from the Business Tier dropdown in the criteria bar. */
  @step('Read the available Business Tier options from the criteria bar')
  async getBusinessTierOptions(): Promise<string[]> {
    const listbox = await this.openListbox(CMB_BUSINESS_TIER);
    const texts = await listbox.locator('[role="option"]').allTextContents();
    await this.closeListbox();
    return texts.map((t) => t.trim()).filter((t) => t.length > 0);
  }

  // ---------------------------------------------------------------- criteria bar — dropdown selectors

  /** Selects a Country option from the criteria bar dropdown by its visible label. */
  @step('Select a Country value in the criteria bar')
  async selectCountry(optionText: string): Promise<void> {
    const listbox = await this.openListbox(CMB_COUNTRY);
    await listbox.getByRole('option', { name: optionText }).click();
    await this.waitForAngularStable();
  }

  /** Selects a Currency option from the criteria bar dropdown by its visible label. */
  @step('Select a Currency value in the criteria bar')
  async selectCurrency(optionText: string): Promise<void> {
    const listbox = await this.openListbox(CMB_CURRENCY);
    await listbox.getByRole('option', { name: optionText }).click();
    await this.waitForAngularStable();
  }

  /** Selects a Business Tier option from the criteria bar dropdown by its visible label. */
  @step('Select a Business Tier value in the criteria bar')
  async selectBusinessTier(optionText: string): Promise<void> {
    const listbox = await this.openListbox(CMB_BUSINESS_TIER);
    await listbox.getByRole('option', { name: optionText }).click();
    await this.waitForAngularStable();
  }

  // ---------------------------------------------------------------- criteria bar — threshold driver

  /**
   * Types a new value into the GAV Discount Threshold field and commits it.
   *
   * The field reformats itself on blur — `fill()` emits a single synthetic event that the
   * formatter mis-parses (filling "20%" rendered "15.2%"). Characters are typed one by one
   * via `pressSequentially` so each keystroke is processed as a real user's would be. Tab
   * is pressed here to commit the value because the field only finalises its formatted
   * representation on blur — a caller that had to remember a separate blur step would
   * eventually forget and read the mid-edit raw text instead of the committed value.
   */
  @step('Set the GAV Discount Threshold value in the criteria bar')
  async setCriteriaThreshold(value: string): Promise<void> {
    const input = await this.readThresholdField();
    await input.click();
    await this.page.keyboard.press('Control+A');
    await this.page.keyboard.press('Delete');
    await input.pressSequentially(value, { delay: KEYSTROKE_DELAY_MS });
    await this.page.keyboard.press('Tab');
    await this.waitForAngularStable();
  }

  /**
   * Clears the GAV Discount Threshold field and commits the empty state.
   *
   * Typing an empty string via `pressSequentially` is a no-op and would silently skip
   * the clear, so this is a dedicated method rather than `setCriteriaThreshold('')`.
   * The field interprets a cleared-then-committed state as "0%" (measured 2026-08-19).
   */
  @step('Clear the GAV Discount Threshold value in the criteria bar')
  async clearCriteriaThreshold(): Promise<void> {
    const input = await this.readThresholdField();
    await input.click();
    await this.page.keyboard.press('Control+A');
    await this.page.keyboard.press('Delete');
    await this.page.keyboard.press('Tab');
    await this.waitForAngularStable();
  }

  /**
   * Types into the GAV Discount Threshold field without clearing it first.
   *
   * This method exists alongside {@link setCriteriaThreshold} because the two paths produce
   * different results for refused non-numeric input: when the existing value is selected and
   * then deleted before typing, a refused keystroke leaves the field empty and it commits as
   * "0%". When the existing value is only selected (not deleted), a refused keystroke cannot
   * replace the selection, so the field keeps its prior value. A test that wants to prove
   * keystroke refusal must use this method — using the clearing setter would assert the
   * empty-resolves-to-zero path instead.
   *
   * Selects all existing text with Control+A, then types value character by character via
   * pressSequentially at the standard keystroke delay, then presses Tab to commit and waits
   * for Angular to settle. No Delete is pressed — the existing text remains until a
   * successful keystroke replaces it.
   */
  @step('Type into the GAV Discount Threshold field without clearing it first')
  async typeIntoCriteriaThresholdWithoutClearing(value: string): Promise<void> {
    const input = await this.readThresholdField();
    await input.click();
    await this.page.keyboard.press('Control+A');
    await input.pressSequentially(value, { delay: KEYSTROKE_DELAY_MS });
    await this.page.keyboard.press('Tab');
    await this.waitForAngularStable();
  }

  /**
   * Returns the raw `aria-invalid` attribute value on the GAV Discount Threshold input.
   * Returns `null` when the attribute is absent (valid or uncommitted state). The value is
   * returned as-is — callers distinguish absent (`null`) from `"false"` (explicitly valid).
   */
  @step('Read the validity state of the GAV Discount Threshold field')
  async getCriteriaThresholdAriaInvalid(): Promise<string | null> {
    const input = await this.readThresholdField();
    return input.getAttribute('aria-invalid');
  }

  /**
   * Queries the page for any element that could carry a validation error message and
   * returns the visible text of each match, trimmed, with empties dropped.
   *
   * WHY THE RAW CANDIDATE SET OVER-MATCHES ON THIS APPLICATION
   * The VALIDATION_MESSAGE_CANDIDATES selector uses substring class matching
   * (e.g. `[class*="invalid"]`, `[class*="error"]`). This application's controls
   * (buttons, dropdowns, comboboxes) carry utility-class variants whose names contain
   * those substrings — e.g. an `aria-invalid:` Tailwind variant appears in a button's
   * class list. A raw sweep therefore selects ordinary interactive controls, not just
   * message nodes, producing false positives like button labels and dropdown values.
   *
   * WHAT IS EXCLUDED AND WHY
   * Any candidate that IS an interactive control, or that CONTAINS one as a descendant,
   * is excluded. The excluded element types are: button, input, select, textarea, a,
   * and elements with role="combobox", role="button", role="tab", or role="option".
   * A validation message element is never itself a button or a container for interactive
   * controls — excluding these eliminates the over-match without removing real messages.
   *
   * MEASURED BEHAVIOUR
   * A live probe on 2026-08-19 confirmed that no validation message renders on this
   * surface for any rejected input (out-of-range, empty, non-numeric). The rejection is
   * silent: Update is disabled and aria-invalid is set, but no text message appears.
   * A non-empty result from this method is therefore a behaviour change worth reporting.
   */
  @step('Read any visible validation messages on the page')
  async getVisibleValidationMessages(): Promise<string[]> {
    const INTERACTIVE_SELECTOR =
      'button,input,select,textarea,a,[role="combobox"],[role="button"],[role="tab"],[role="option"]';

    // Scope the search to the criteria bar — the section of the page that contains the
    // threshold input and all other header controls, but not the tier grid. Walking up
    // from the threshold input and stopping at the last ancestor that does not contain an
    // "Add Tier" button keeps the scope stable regardless of how the Tailwind utility
    // classes change in future builds.
    const scopeHandle = await this.page.evaluateHandle(() => {
      const input = document.querySelector('input[name="gavDiscountThreshold"]');
      if (!input) return null;
      let candidate: Element | null = input.parentElement;
      let last: Element | null = null;
      while (candidate && candidate !== document.body) {
        const buttons = Array.from(candidate.querySelectorAll('button'));
        const hasAddTier = buttons.some(b => b.textContent?.trim() === 'Add Tier');
        if (hasAddTier) break;
        last = candidate;
        candidate = candidate.parentElement;
      }
      return last;
    });

    const scopeElement = scopeHandle.asElement();
    if (!scopeElement) {
      throw new Error(
        'getVisibleValidationMessages: could not locate the criteria bar — ' +
          'the threshold input (input[name="gavDiscountThreshold"]) was not found in the DOM.',
      );
    }

    // Guard: the computed scope must contain the threshold input and at least three
    // comboboxes. A scope that is too narrow (e.g. just the input's immediate wrapper)
    // would silently return an empty array for every call, making these assertions
    // incapable of ever detecting a real validation message.
    const scopeStats = await scopeElement.evaluate((root: Element) => ({
      hasInput: root.querySelector('input[name="gavDiscountThreshold"]') !== null,
      comboboxCount: root.querySelectorAll('[role="combobox"]').length,
    }));
    if (!scopeStats.hasInput || scopeStats.comboboxCount < 3) {
      throw new Error(
        `getVisibleValidationMessages: scope guard failed — ` +
          `hasThresholdInput=${scopeStats.hasInput}, comboboxCount=${scopeStats.comboboxCount} (expected ≥3). ` +
          `The criteria bar scope is too narrow to observe header controls.`,
      );
    }

    const candidateHandles = await scopeElement.$$(VALIDATION_MESSAGE_CANDIDATES);
    const messages: string[] = [];
    for (const el of candidateHandles) {
      if (!(await el.isVisible())) continue;
      const isInteractive = await el.evaluate(
        (node: Element, sel: string) => node.matches(sel) || node.querySelector(sel) !== null,
        INTERACTIVE_SELECTOR,
      );
      if (isInteractive) continue;
      const text = ((await el.textContent()) || '').trim();
      if (text.length > 0) messages.push(text);
    }
    return messages;
  }

  // ---------------------------------------------------------------- Edit Tier dialog

  /**
   * Clicks the Edit button on the row matching the given tier range, opening the Edit Tier
   * dialog. The dialog title renders as "Editing {tierRange}" (e.g. "Editing 0 - 1500").
   */
  @step('Open the Edit Tier dialog for a tier row')
  async openEditDialog(tierRange: string): Promise<void> {
    const row = await this.findRowByTierRange(tierRange);
    await row.locator(BTN_ROW_EDIT).first().click();
    await this.page.locator(DLG_EDIT_TIER).first().waitFor({ state: 'visible', timeout: 10_000 });
    await this.waitForAngularStable();
  }

  /** Reads the title text of the Edit Tier dialog as currently rendered. */
  @step('Read the title of the Edit Tier dialog')
  async getEditDialogTitle(): Promise<string> {
    const dlg = this.page.locator(DLG_EDIT_TIER).first();
    // The title is the first heading or strong element inside the dialog.
    const heading = dlg.locator('h1, h2, h3, [role="heading"]').first();
    const count = await heading.count();
    if (count > 0) {
      return ((await heading.textContent()) || '').replace(/\s+/g, ' ').trim();
    }
    // Fallback: read the dialog's own text and extract the "Editing …" prefix.
    const full = (await dlg.textContent() || '').replace(/\s+/g, ' ').trim();
    const match = full.match(/^(Editing [^]+?)(?:\s{2,}|$)/);
    return match ? (match[1] ?? full).trim() : full;
  }

  /**
   * Reads all 21 input values from the Edit Tier dialog, returned in positional order
   * (0-based, left to right across Non-Peak → Standard → Peak × 7 day buckets).
   *
   * Note: index 0 renders the raw decimal (e.g. "0.17") while indexes 1–20 render
   * percent-formatted values (e.g. "17%"). This method returns values as-is from the DOM.
   */
  @step('Read all input values from the Edit Tier dialog')
  async getEditDialogInputValues(): Promise<string[]> {
    const inputs = this.page.locator(DLG_EDIT_TIER_INPUTS);
    const count = await inputs.count();
    const values: string[] = [];
    for (let i = 0; i < count; i++) {
      values.push(await inputs.nth(i).inputValue());
    }
    return values;
  }

  /**
   * Sets the value of one input in the Edit Tier dialog by its 0-based position.
   * Clears the existing value before typing so the new value is not appended.
   *
   * @param index - 0-based column position (0 = Non-Peak 0-15, …, 20 = Peak 365+)
   * @param value - numeric string to type (e.g. "14", "0.17")
   */
  @step('Set one input value in the Edit Tier dialog by position')
  async setEditDialogInput(index: number, value: string): Promise<void> {
    const input = this.page.locator(DLG_EDIT_TIER_INPUTS).nth(index);
    await input.click();
    await this.page.keyboard.press('Control+A');
    await this.page.keyboard.press('Delete');
    await input.pressSequentially(value, { delay: KEYSTROKE_DELAY_MS });
    await this.waitForAngularStable();
  }

  /**
   * Reads the `aria-invalid` attribute of one input in the Edit Tier dialog by position.
   * Returns "true" when the value is invalid (above 100, empty, or non-numeric), or null
   * when the attribute is absent (valid state).
   */
  @step('Read the validity state of one Edit Tier dialog input')
  async getEditDialogInputAriaInvalid(index: number): Promise<string | null> {
    return this.page.locator(DLG_EDIT_TIER_INPUTS).nth(index).getAttribute('aria-invalid');
  }

  /** Returns true when the Update button in the Edit Tier dialog is enabled. */
  @step('Check whether the Update button in the Edit Tier dialog is enabled')
  async isEditUpdateEnabled(): Promise<boolean> {
    const btn = this.page.locator(BTN_EDIT_UPDATE).first();
    return !(await btn.isDisabled());
  }

  /** Clicks the Update button in the Edit Tier dialog to commit the edited values. */
  @step('Click Update to save changes in the Edit Tier dialog')
  async clickEditUpdate(): Promise<void> {
    await this.page.locator(BTN_EDIT_UPDATE).first().click();
    await this.waitForAngularStable();
  }

  /** Clicks the Cancel button in the Edit Tier dialog to discard changes. */
  @step('Click Cancel to close the Edit Tier dialog without saving')
  async clickEditCancel(): Promise<void> {
    await this.page.locator(BTN_EDIT_CANCEL).first().click();
    await this.waitForAngularStable();
  }

  /**
   * Commits the current value in the Edit Tier dialog by pressing Tab and waiting for
   * Angular to settle. Pressing Tab triggers the blur event, which finalises the field's
   * formatted value — call this after typing to commit the typed value.
   */
  @step('Press Tab to commit the current Edit Tier dialog input')
  async blurEditDialogInput(): Promise<void> {
    await this.page.keyboard.press('Tab');
    await this.waitForAngularStable();
  }

  /**
   * Clicks into the input at the given position in the Edit Tier dialog and waits for
   * Angular to settle.
   *
   * @param index - 0-based column position
   */
  @step('Click into an Edit Tier dialog input by position')
  async focusEditDialogInput(index: number): Promise<void> {
    await this.page.locator(DLG_EDIT_TIER_INPUTS).nth(index).click();
    await this.waitForAngularStable();
  }

  /**
   * Clears the input at the given position in the Edit Tier dialog without committing
   * the change. Clicks the input, selects all, and deletes — the caller decides when
   * to blur and commit. A separate method from the setter because typing an empty string
   * via pressSequentially is a no-op and would silently skip the clear.
   *
   * @param index - 0-based column position
   */
  @step('Clear an Edit Tier dialog input without committing')
  async clearEditDialogInput(index: number): Promise<void> {
    await this.page.locator(DLG_EDIT_TIER_INPUTS).nth(index).click();
    await this.page.keyboard.press('Control+A');
    await this.page.keyboard.press('Delete');
    await this.waitForAngularStable();
  }

  /**
   * Clicks into the input at the given position and presses a single named key (e.g.
   * 'Minus', 'Digit1'), then waits for Angular to settle. Exists so a test can prove
   * that a single keystroke is refused at the input layer before any blur occurs.
   *
   * @param index - 0-based column position
   * @param key   - Playwright key name, e.g. 'Minus', 'Digit1'
   */
  @step('Press one key in an Edit Tier dialog input by position')
  async pressKeyInEditDialogInput(index: number, key: string): Promise<void> {
    await this.page.locator(DLG_EDIT_TIER_INPUTS).nth(index).click();
    await this.page.keyboard.press(key);
    await this.waitForAngularStable();
  }

  /**
   * Reads the `type`, `inputmode`, and `placeholder` attributes of the input at the
   * given position in the Edit Tier dialog. Returns each value as-is from the DOM,
   * or `null` when the attribute is absent — nothing is normalised or defaulted.
   *
   * @param index - 0-based column position
   */
  @step('Read the HTML attributes of an Edit Tier dialog input by position')
  async getEditDialogInputAttributes(
    index: number,
  ): Promise<{ type: string | null; inputMode: string | null; placeholder: string | null }> {
    const input = this.page.locator(DLG_EDIT_TIER_INPUTS).nth(index);
    const [type, inputMode, placeholder] = await Promise.all([
      input.getAttribute('type'),
      input.getAttribute('inputmode'),
      input.getAttribute('placeholder'),
    ]);
    return { type, inputMode, placeholder };
  }

  // ---------------------------------------------------------------- Add Tier dialog

  /**
   * Clicks the Add Tier toolbar button to open the Add Tier dialog.
   * The dialog title renders verbatim as "Adding Tier".
   */
  @step('Open the Add Tier dialog from the toolbar')
  async openAddTierDialog(): Promise<void> {
    await this.page.locator(BTN_ADD_TIER).first().click();
    await this.page.locator(DLG_ADD_TIER).first().waitFor({ state: 'visible', timeout: 10_000 });
    await this.waitForAngularStable();
  }

  /** Reads the title text of the Add Tier dialog as currently rendered. */
  @step('Read the title of the Add Tier dialog')
  async getAddTierDialogTitle(): Promise<string> {
    const dlg = this.page.locator(DLG_ADD_TIER).first();
    const heading = dlg.locator('h1, h2, h3, [role="heading"]').first();
    const count = await heading.count();
    if (count > 0) {
      return ((await heading.textContent()) || '').replace(/\s+/g, ' ').trim();
    }
    const full = (await dlg.textContent() || '').replace(/\s+/g, ' ').trim();
    const match = full.match(/^(Adding Tier)/);
    return match ? (match[1] ?? full).trim() : full;
  }

  /**
   * Counts the input elements inside the Add Tier dialog.
   * Returns the raw count so a caller can assert the expected field roster.
   */
  @step('Count the input fields in the Add Tier dialog')
  async getAddTierDialogInputCount(): Promise<number> {
    return this.page.locator(DLG_ADD_TIER).first().locator('input').count();
  }

  /**
   * Returns the trimmed text of every label element inside the Add Tier dialog,
   * with empty strings dropped. Lets a caller assert the visible field labels
   * without this method deciding which labels matter.
   */
  @step('Read the field labels from the Add Tier dialog')
  async getAddTierDialogFieldLabels(): Promise<string[]> {
    const raw = await this.page.locator(DLG_ADD_TIER).first().locator('label').allTextContents();
    return raw.map((t) => t.replace(/\s+/g, ' ').trim()).filter((t) => t.length > 0);
  }

  /**
   * Sets the End Tier value in the Add Tier dialog.
   * The confirm button is disabled when the dialog opens and becomes enabled once a
   * value is entered. Validation is submit-time, not blur-time.
   */
  @step('Set the End Tier value in the Add Tier dialog')
  async setAddTierEndValue(value: string): Promise<void> {
    const input = this.page.locator(INP_ADD_TIER_END);
    await input.click();
    await this.page.keyboard.press('Control+A');
    await this.page.keyboard.press('Delete');
    await input.pressSequentially(value, { delay: KEYSTROKE_DELAY_MS });
    await this.waitForAngularStable();
  }

  /** Returns true when the Add Tier confirm button in the dialog is enabled. */
  @step('Check whether the Add Tier confirm button is enabled')
  async isAddTierConfirmEnabled(): Promise<boolean> {
    const btn = this.page.locator(BTN_ADD_TIER_CONFIRM).first();
    return !(await btn.isDisabled());
  }

  /** Clicks the Cancel button in the Add Tier dialog to discard without adding. */
  @step('Click Cancel to close the Add Tier dialog without saving')
  async clickAddTierCancel(): Promise<void> {
    await this.page.locator(BTN_ADD_CANCEL).first().click();
    await this.waitForAngularStable();
  }

  /**
   * Clicks the Add Tier confirm button in the dialog.
   *
   * This method is intentionally separate from {@link setAddTierEndValue} so that a spec
   * must explicitly opt into the mutation — filling the field and confirming are two distinct
   * steps in the client report.
   */
  @step('Click the Add Tier button to confirm adding a new tier')
  async clickAddTierConfirm(): Promise<void> {
    await this.page.locator(BTN_ADD_TIER_CONFIRM).first().click();
    await this.waitForAngularStable();
  }

  /**
   * Returns the current value of the End Tier input in the Add Tier dialog.
   * The value is read directly from the input — no interaction is performed.
   */
  @step('Read the current value of the End Tier input')
  async getAddTierEndValue(): Promise<string> {
    return this.page.locator(INP_ADD_TIER_END).inputValue();
  }

  /**
   * Returns the `aria-invalid` attribute value of the End Tier input in the Add Tier dialog,
   * or `null` when the attribute is absent. The value is returned as-is so callers can
   * distinguish absent (`null`) from `"false"` (explicitly valid).
   */
  @step('Read the aria-invalid attribute of the End Tier input')
  async getAddTierEndAriaInvalid(): Promise<string | null> {
    return this.page.locator(INP_ADD_TIER_END).getAttribute('aria-invalid');
  }

  // ---------------------------------------------------------------- toolbar — export

  /**
   * Clicks the Export button and waits for the file download to begin.
   *
   * Returns the Playwright `Download` object so callers can save or inspect the file.
   * The downloaded filename follows `DiscountMatrix-{country}-{currency}-{tier}.xlsx`
   * and varies with the criteria bar selection — do not hardcode a filename in specs.
   */
  @step('Click Export and wait for the file download to begin')
  async clickExportAndWaitForDownload(): Promise<Download> {
    const [download] = await Promise.all([
      this.page.waitForEvent('download'),
      this.page.locator(BTN_EXPORT).first().click(),
    ]);
    return download;
  }

  // ---------------------------------------------------------------- toolbar — save

  /**
   * Waits for the page header's Save button to become enabled, then clicks it.
   *
   * Save is a page-level header control, not a Company Matrix tab control — measured
   * 2026-08-19, it sits outside every tab panel. It persists the GAV Discount Threshold
   * from the criteria bar; it does not save the matrix grid, which is edited and saved
   * through the Edit Tier dialog instead.
   *
   * Save is disabled on page load and becomes enabled as soon as the GAV Discount Threshold
   * field is dirtied (typing into it is sufficient — blur is not required). This method
   * waits explicitly for that enablement rather than assuming it, because a click's default
   * auto-wait conflates "never enabled" with "not yet enabled": both expire with the same
   * generic timeout message that carries no diagnostic information.
   *
   * The wait budget is 30 s — generously above the observed ~22 s first-paint latency —
   * so a page that painted late but did enable Save will still pass. If Save never becomes
   * enabled within that window the method throws a message that names both the button's
   * current disabled state and the threshold field's current value, so the next reader
   * knows exactly what state the page was in when the wait expired.
   *
   * No save-confirmation handling is provided here, because whether this surface shows a
   * confirmation dialog has not been measured. If one appears, the caller must handle it.
   */
  /**
   * Returns true if the page header Save button is currently enabled, false if disabled.
   * Does not wait — reads the instantaneous state.
   */
  @step('Check whether the Save button in the page header is enabled')
  async isSaveEnabled(): Promise<boolean> {
    return this.page.locator(BTN_SAVE).isEnabled();
  }

  @step('Click Save in the page header')
  async clickSave(): Promise<void> {
    const saveBtn = this.page.locator(BTN_SAVE);
    const ENABLE_TIMEOUT_MS = 30_000;

    try {
      // document.querySelector cannot resolve Playwright pseudo-classes like :text-is().
      // Find the Save button by scanning real DOM elements — same rule as the grid readiness
      // gate above: predicates that run in the browser must use plain CSS only.
      await this.page.waitForFunction(
        () => {
          const btn = Array.from(document.querySelectorAll('button')).find(
            (b) => b.textContent?.trim() === 'Save',
          ) as HTMLButtonElement | undefined;
          return btn != null && !btn.disabled;
        },
        { timeout: ENABLE_TIMEOUT_MS },
      );
    } catch {
      const isDisabled = await saveBtn.isDisabled();
      const thresholdValue = await this.page.locator(INP_GAV_DISCOUNT_THRESHOLD).inputValue().catch(() => '<unreadable>');
      throw new Error(
        `Save button never became enabled within ${ENABLE_TIMEOUT_MS / 1000} s. ` +
          `Button disabled=${isDisabled}; GAV Discount Threshold field value="${thresholdValue}".`,
      );
    }

    // The Save button disables optimistically on click — before the server has responded.
    // Without waiting for the POST, the very next navigation (open() → about:blank) cancels
    // the write in flight. Arm the response waiter BEFORE clicking so the promise is
    // registered prior to the request being issued.
    //
    // The route is shared: the page posts saves AND fetches its own data to the same URL
    // (/settings/discount-matrix). URL alone cannot tell them apart. The distinguishing
    // signal is the body: data requests carry an empty array ([]), while the save carries
    // the matrix payload. Requiring a non-empty, non-[] body selects the save response only.
    const SAVE_TIMEOUT_MS = 30_000;
    const saveResponsePromise = this.page
      .waitForResponse(
        (res) => {
          if (res.request().method() !== 'POST') return false;
          if (!res.url().includes(SAVE_POST_URL_FRAGMENT)) return false;
          const body = res.request().postData() ?? '';
          return body.trim().length > 0 && body.trim() !== '[]';
        },
        { timeout: SAVE_TIMEOUT_MS },
      )
      .catch(async () => {
        const thresholdValue = await this.page
          .locator(INP_GAV_DISCOUNT_THRESHOLD)
          .inputValue()
          .catch(() => '<unreadable>');
        throw new Error(
          `Save request to ${SAVE_POST_URL_FRAGMENT} did not complete within ${SAVE_TIMEOUT_MS / 1000} s. ` +
            `GAV Discount Threshold field value="${thresholdValue}".`,
        );
      });
    await saveBtn.click();
    await saveResponsePromise;
    await this.waitForFormClean();
    await this.waitForAngularStable();
  }

  /**
   * Polls until the form reports it has no unsaved changes.
   *
   * The form signals a dirty state by cancelling the browser's beforeunload event
   * (the standard event browsers fire when a page is about to unload). While the
   * form is dirty any navigation away will cancel the in-flight write. This helper
   * dispatches a synthetic, cancellable beforeunload event in the page and waits
   * until the form no longer intercepts it — i.e. the write has fully settled.
   *
   * The probe was validated 20 times against the live page: it produces no visible
   * dialogs and no side effects.
   */
  private async waitForFormClean(): Promise<void> {
    try {
      await this.page.waitForFunction(
        () => {
          const e = new Event('beforeunload', { cancelable: true });
          window.dispatchEvent(e);
          return !e.defaultPrevented;
        },
        undefined,
        { polling: 250, timeout: FORM_CLEAN_TIMEOUT_MS },
      );
    } catch {
      const thresholdValue = await this.page
        .locator(INP_GAV_DISCOUNT_THRESHOLD)
        .inputValue()
        .catch(() => '<unreadable>');
      throw new Error(
        `Form still reported unsaved changes after the save completed (waited ${FORM_CLEAN_TIMEOUT_MS / 1000} s). ` +
          `GAV Discount Threshold field value="${thresholdValue}".`,
      );
    }
  }
}
