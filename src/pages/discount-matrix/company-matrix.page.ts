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

// This grid takes ~83 s to swap skeleton rows for real data; the earlier 45 s ceiling
// failed every test in the suite.
const GRID_READY_TIMEOUT_MS = 180_000;

// Numeric fields here reformat on commit and mis-parse fill()'s single synthetic event
// ("20%" landed as "15.2%") — type character by character instead.
const KEYSTROKE_DELAY_MS = 80;

// Save disables optimistically before the server responds, so the in-flight request is
// identified by this route fragment instead.
const SAVE_POST_URL_FRAGMENT = '/settings/discount-matrix';

// Navigating while the form is still dirty cancels the in-flight write, so saves wait for
// clean; ~1.5 s observed settle.
const FORM_CLEAN_TIMEOUT_MS = 15_000;

// Company Matrix tab of Location Settings → Discount Matrix; the other two tabs are not covered.
// The grid is read-only in the DOM — all editing goes through the per-row Edit Tier dialog.
export class CompanyMatrixPage extends BasePage {
  constructor(page: Page, config?: IConfig) {
    super(page, config);
    Log.info('CompanyMatrixPage initialized');
  }

  // ---------------------------------------------------------------- navigation & ready

  /** Opens the page and waits for real rows — never resolves against the skeleton state. */
  @step('Open the Discount Matrix page for an office')
  async open(officeNo: string = '1604'): Promise<void> {
    const baseUrl = this.config?.base_url || '';
    await this.safeNavigateTo('about:blank');
    await this.navigateTo(`${baseUrl}locations/${officeNo}/settings/discount-matrix`);
    await this.waitForGrid();
  }

  // Ready means rows present AND zero skeletons: the placeholder rows satisfy a row-count
  // check in ~12 ms, long before any tier data lands.
  @step('Wait for the Company Matrix grid to show rows')
  async waitForGrid(timeout = GRID_READY_TIMEOUT_MS): Promise<void> {
    // GRID_SKELETON's panel scope is a Playwright pseudo-class, invalid CSS in the browser —
    // only the plain-CSS descendant portion can cross into the page predicate.
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

  /** Selects tabs by visible text and [role="tab"] — never by Radix-generated id. */
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

  // The tier-range label is td index 1; td 0 is the Delete/Edit button cell — do not revert
  // to .first(), which reads the empty button cell.
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

  /** Flattens both thead rows: group headers and day-bucket sub-headers together. */
  @step('Read the column headers of the Company Matrix grid')
  async getColumnHeaders(): Promise<string[]> {
    const raw = await this.page.locator(COL_HEADERS).allTextContents();
    return raw.map((h) => h.replace(/\s+/g, ' ').trim()).filter((h) => h.length > 0);
  }

  // ---------------------------------------------------------------- grid — row lookup & cell reading

  /** Content-anchored by tier-range text, never by index — shared handlers reorder rows. */
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

  /** Reads one percentage cell addressed by tier range, column group and day bucket. */
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
    // Layout: td 0 = button cell, td 1 = tier-range label, td 2–22 = the 21 percentage cells.
    const tdIndex = (groupOffsets[columnGroup] as number) + bucketIndex + 2;
    const row = await this.findRowByTierRange(tierRange);
    const cell = row.locator('td').nth(tdIndex);
    const text = await cell.textContent();
    return (text || '').replace(/\s+/g, ' ').trim();
  }

  /** The 21 percentage values of a tier row, in DOM order (td indices 2–22). */
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

  // Both lookups are row-scoped. Never throws on an unexpected count — the caller asserts.
  @step('Count the Edit and Delete controls in a tier row')
  async getRowActionCounts(tierRange: string): Promise<{ edit: number; delete: number }> {
    const row = await this.findRowByTierRange(tierRange);
    const edit = await row.locator(BTN_ROW_EDIT).count();
    const del = await row.locator(BTN_ROW_DELETE).count();
    return { edit, delete: del };
  }

  /** Counts editable controls in the grid body so a caller can prove cells are display-only. */
  @step('Count editable controls inside the Company Matrix grid body')
  async getGridInputControlCount(): Promise<number> {
    const gridRows = this.page.locator(ROWS);
    return gridRows.locator('input, textarea, select, [contenteditable="true"], [role="textbox"]').count();
  }

  // One array per thead row, so a caller can tell group headers from day-bucket headers —
  // COL_HEADERS flattens both rows together and cannot answer per-row questions.
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
    const input = await this.readThresholdField();
    return input.inputValue();
  }

  // ---------------------------------------------------------------- criteria bar — private helpers

  // The threshold loads separately from the grid and can take ~10 s to attach after
  // waitForGrid() resolves — right at the default action timeout, hence the explicit 30 s.
  private async readThresholdField(): Promise<import('@playwright/test').Locator> {
    const input = this.page.locator(INP_GAV_DISCOUNT_THRESHOLD);
    await input.waitFor({ state: 'visible', timeout: 30_000 });
    return input;
  }

  // Retries the click once — a single click is not always enough for Radix dropdowns.
  // No `.first()`: it would mask a combobox selector regression instead of failing loudly.
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

  // The hidden-state timeout is swallowed so a listbox closed by other means never blocks.
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

  // Types rather than fills (the formatter mis-parses fill()) and Tabs to blur, because the
  // field only finalises its formatted value on blur.
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

  // Separate from setCriteriaThreshold because pressSequentially('') is a no-op and would
  // silently skip the clear. A cleared-then-committed field commits as "0%".
  @step('Clear the GAV Discount Threshold value in the criteria bar')
  async clearCriteriaThreshold(): Promise<void> {
    const input = await this.readThresholdField();
    await input.click();
    await this.page.keyboard.press('Control+A');
    await this.page.keyboard.press('Delete');
    await this.page.keyboard.press('Tab');
    await this.waitForAngularStable();
  }

  // No Delete: a refused keystroke cannot replace the selection, so the field keeps its prior
  // value. Tests proving keystroke refusal need this, not the clearing setter (empty → "0%").
  @step('Type into the GAV Discount Threshold field without clearing it first')
  async typeIntoCriteriaThresholdWithoutClearing(value: string): Promise<void> {
    const input = await this.readThresholdField();
    await input.click();
    await this.page.keyboard.press('Control+A');
    await input.pressSequentially(value, { delay: KEYSTROKE_DELAY_MS });
    await this.page.keyboard.press('Tab');
    await this.waitForAngularStable();
  }

  // Returned as-is so callers can distinguish absent (null) from "false" (explicitly valid).
  @step('Read the validity state of the GAV Discount Threshold field')
  async getCriteriaThresholdAriaInvalid(): Promise<string | null> {
    const input = await this.readThresholdField();
    return input.getAttribute('aria-invalid');
  }

  // Interactive controls are excluded because Tailwind's `aria-invalid:` variants put
  // "invalid"/"error" in ordinary buttons' class lists, over-matching the candidate selector.
  @step('Read any visible validation messages on the page')
  async getVisibleValidationMessages(): Promise<string[]> {
    // Wait for the late-attaching threshold field first, or the scope walk below throws.
    await this.readThresholdField();

    const INTERACTIVE_SELECTOR =
      'button,input,select,textarea,a,[role="combobox"],[role="button"],[role="tab"],[role="option"]';

    // Scope to the criteria bar by walking up from the threshold input to the last ancestor
    // without an "Add Tier" button — stable against Tailwind class churn.
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

    // Guard: too narrow a scope would return an empty array every call, making callers
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

  /** Opens the row's Edit Tier dialog, whose title renders as "Editing {tierRange}". */
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

  // Values are returned as-is: index 0 renders a raw decimal ("0.17") while 1–20 render
  // percent-formatted ("17%").
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

  /** Clears before typing so the new value is not appended. Index is 0-based. */
  @step('Set one input value in the Edit Tier dialog by position')
  async setEditDialogInput(index: number, value: string): Promise<void> {
    const input = this.page.locator(DLG_EDIT_TIER_INPUTS).nth(index);
    await input.click();
    await this.page.keyboard.press('Control+A');
    await this.page.keyboard.press('Delete');
    await input.pressSequentially(value, { delay: KEYSTROKE_DELAY_MS });
    await this.waitForAngularStable();
  }

  /** "true" when the value is above 100, empty or non-numeric; null when the attr is absent. */
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

  /** Tab blurs the field, which is what finalises its formatted value — call after typing. */
  @step('Press Tab to commit the current Edit Tier dialog input')
  async blurEditDialogInput(): Promise<void> {
    await this.page.keyboard.press('Tab');
    await this.waitForAngularStable();
  }

  @step('Click into an Edit Tier dialog input by position')
  async focusEditDialogInput(index: number): Promise<void> {
    await this.page.locator(DLG_EDIT_TIER_INPUTS).nth(index).click();
    await this.waitForAngularStable();
  }

  // Does not commit — the caller decides when to blur. Separate from the setter because
  // pressSequentially('') is a no-op and would silently skip the clear.
  @step('Clear an Edit Tier dialog input without committing')
  async clearEditDialogInput(index: number): Promise<void> {
    await this.page.locator(DLG_EDIT_TIER_INPUTS).nth(index).click();
    await this.page.keyboard.press('Control+A');
    await this.page.keyboard.press('Delete');
    await this.waitForAngularStable();
  }

  // Single named keystroke (e.g. 'Minus'), so a test can prove refusal at the input layer
  // before any blur occurs.
  @step('Press one key in an Edit Tier dialog input by position')
  async pressKeyInEditDialogInput(index: number, key: string): Promise<void> {
    await this.page.locator(DLG_EDIT_TIER_INPUTS).nth(index).click();
    await this.page.keyboard.press(key);
    await this.waitForAngularStable();
  }

  /** Attributes are returned as-is (null when absent) — nothing is normalised or defaulted. */
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

  /** Opens the Add Tier dialog, whose title renders verbatim as "Adding Tier". */
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

  /** Raw input count, so a caller can assert the expected field roster. */
  @step('Count the input fields in the Add Tier dialog')
  async getAddTierDialogInputCount(): Promise<number> {
    return this.page.locator(DLG_ADD_TIER).first().locator('input').count();
  }

  /** Every label in the dialog, so the caller decides which ones matter. */
  @step('Read the field labels from the Add Tier dialog')
  async getAddTierDialogFieldLabels(): Promise<string[]> {
    const raw = await this.page.locator(DLG_ADD_TIER).first().locator('label').allTextContents();
    return raw.map((t) => t.replace(/\s+/g, ' ').trim()).filter((t) => t.length > 0);
  }

  // Entering a value enables the confirm button; validation is submit-time, not blur-time.
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

  // Kept separate from setAddTierEndValue so a spec must explicitly opt into the mutation.
  @step('Click the Add Tier button to confirm adding a new tier')
  async clickAddTierConfirm(): Promise<void> {
    await this.page.locator(BTN_ADD_TIER_CONFIRM).first().click();
    await this.waitForAngularStable();
  }

  /** Reads the End Tier input directly — no interaction is performed. */
  @step('Read the current value of the End Tier input')
  async getAddTierEndValue(): Promise<string> {
    return this.page.locator(INP_ADD_TIER_END).inputValue();
  }

  // Returned as-is so callers can distinguish absent (null) from "false" (explicitly valid).
  @step('Read the aria-invalid attribute of the End Tier input')
  async getAddTierEndAriaInvalid(): Promise<string | null> {
    return this.page.locator(INP_ADD_TIER_END).getAttribute('aria-invalid');
  }

  // ---------------------------------------------------------------- toolbar — export

  // The filename varies with the criteria bar selection — do not hardcode one in specs.
  @step('Click Export and wait for the file download to begin')
  async clickExportAndWaitForDownload(): Promise<Download> {
    // 90 s explicitly: the global 10 s action timeout is far too tight for this backend to
    // generate the workbook before the download begins.
    const [download] = await Promise.all([
      this.page.waitForEvent('download', { timeout: 90_000 }),
      this.page.locator(BTN_EXPORT).first().click(),
    ]);
    return download;
  }

  // ---------------------------------------------------------------- toolbar — save

  /** Reads the instantaneous enabled state of the header Save button — does not wait. */
  @step('Check whether the Save button in the page header is enabled')
  async isSaveEnabled(): Promise<boolean> {
    return this.page.locator(BTN_SAVE).isEnabled();
  }

  // Header Save persists only the GAV threshold, and is enabled once that field is dirtied.
  // The explicit enable-wait exists so "never enabled" reports differently from "not yet".
  @step('Click Save in the page header')
  async clickSave(): Promise<void> {
    const saveBtn = this.page.locator(BTN_SAVE);
    const ENABLE_TIMEOUT_MS = 30_000;

    try {
      // Scanned in JS rather than with BTN_SAVE: document.querySelector cannot resolve
      // Playwright pseudo-classes like :text-is().
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

    // Armed before the click, or the next navigation cancels the in-flight write.
    // Saves and data fetches share this URL — only the non-empty, non-[] body is the save.
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

  // The form signals dirty by cancelling beforeunload, so a synthetic cancellable
  // beforeunload is the clean-state probe; it raises no dialog and has no side effects.
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
