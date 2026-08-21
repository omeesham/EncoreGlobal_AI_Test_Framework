/**
 * Corporate Pricing — Product Group Override screen page object.
 * `CorporatePricingOverridePage extends CorporatePricingBasePage`.
 *
 * URL: /navigator/locations/{office}/settings/corporate-pricing/pg-override
 * Reached via the Search action-bar "Pricing Override" button.
 *
 * Live model:
 *  - Equipment / Labor tabs (Radix `role=tab`, `aria-selected`); switching reloads the grid.
 *  - Grid is **location-gated**: empty ("No results.") until a location is picked via the
 *    "Select a location" card → modal table (search + checkbox row + "Select").
 *  - 10-column grid; `Active` renders as a **Radix checkbox** (read `aria-checked`).
 *  - "Filter Product Groups Override..." filters the grid **client-side** (no Search button).
 *  - Save is disabled on clean; dialog-gated by the shared Corporate Pricing save pattern.
 *
 * Selector strategy: text/role/grid-header/content-anchored (one data-testid used as a context anchor). Reuses the base
 * `readGridRowsByContent` / `findGridRowByContent` / `readAllTexts` / `isVisibleSafe` /
 * `confirmSaveDialogIfPresent` (shared base helpers). Does NOT reuse the base `switchTab` — that union is typed
 * for the Details tabs ('Pricing Strategy' | 'Pricing Detail'); the Override Equipment/Labor tabs get
 * their own switcher here.
 *
 * EDIT MECHANISM: the grid IS editable for the automation user. Click an Override Price / Max Discount
 * `div[role=button]` cell → an active `spinbutton` reveals → native value-setter (React-controlled;
 * `.fill()` does not commit) + `Enter` commits → Save enables. Active = Radix `checkbox` toggles +
 * dirties. Save → "Save Changes" dialog (matched via the CSS `[role="alertdialog"]` selector + TEXT
 * buttons — Playwright `getByRole('alertdialog')` does NOT match it) → POST corporate-price-pg-override
 * → toast. Net-zero (revert disables Save). Max Discount % is capped at 100 (>100 rejected).
 */
import { expect } from '@playwright/test';
import type { Page, Locator } from '@playwright/test';
import { CorporatePricingBasePage } from '../corporate-pricing/corporate-pricing.page';
import type { IConfig } from '../../types';
import { CorporatePricingOverrideSelectors as OS } from '../../selectors/corporate-override/override';
import { CORPORATE_PRICING_ROUTES, CORPORATE_PRICING_COMMON } from '../../data/corporate-pricing/common';
import { CORP_PRICING_OVERRIDE } from '../../data/corporate-override/override';
import { Log } from '../../utils/logger';
import { readFileSync } from 'node:fs';
import { step } from '../../fixtures/step-decorator';

export type OverrideTab = 'Equipment' | 'Labor';

/** Result of probing for a POST /api/location/location-lookup during an action. */
export interface LocationLookupProbe {
  /** True if a POST fired during the action window; false means the action is a client-side operation. */
  postFired: boolean;
  /** Parsed from body.locations.length; -1 when no POST fired or the response could not be parsed. */
  locationCount: number;
}

export class CorporatePricingOverridePage extends CorporatePricingBasePage {
  constructor(page: Page, config?: IConfig) {
    super(page, config);
  }

  @step('Goto override')
  async gotoOverride(office: string = CORPORATE_PRICING_COMMON.office): Promise<void> {
    const base = (this.config?.base_url ?? '').replace(/\/+$/, '');
    await this.navigateTo(`${base}${CORPORATE_PRICING_ROUTES.overridePath(office)}`);
    await this.waitForAngularStable();
    await this.waitForLoaded();
  }

  @step('Open the pricing override page')
  async open(office: string = CORPORATE_PRICING_COMMON.office): Promise<void> {
    await this.gotoOverride(office);
  }

  @step('Wait for loaded')
  async waitForLoaded(timeout = 30_000): Promise<void> {
    await this.page.locator(OS.ovrHeading).first().waitFor({ state: 'visible', timeout });
    await this.page.locator(OS.ovrTabEquipment).first().waitFor({ state: 'visible', timeout });
  }

  @step('Get active tab')
  async getActiveTab(): Promise<OverrideTab | null> {
    if ((await this.page.locator(OS.ovrTabEquipment).getAttribute('aria-selected')) === 'true') return 'Equipment';
    if ((await this.page.locator(OS.ovrTabLabor).getAttribute('aria-selected')) === 'true') return 'Labor';
    return null;
  }

  @step('Switch override tab')
  async switchOverrideTab(tab: OverrideTab): Promise<void> {
    const sel = tab === 'Equipment' ? OS.ovrTabEquipment : OS.ovrTabLabor;
    await this.page.locator(sel).first().click();
    // Wait for Radix to flip aria-selected. A Playwright locator pierces shadow DOM and auto-retries
    // until the attribute lands — no fixed sleep, no raw document.querySelector (shadow-blind).
    await this.page
      .locator(`[role="tab"][aria-selected="true"]:has-text("${tab}")`)
      .first()
      .waitFor({ state: 'visible', timeout: 10_000 });
    await this.waitForAngularStable();
  }

  @step('Open location picker')
  async openLocationPicker(): Promise<void> {
    // ovrChangeLocationTrigger ('text=Change Local Office') is visible in both states:
    // no location selected and location already loaded.
    await this.page.locator(OS.ovrChangeLocationTrigger).first().click();
    await this.page.locator(OS.ovrLocationPickerSearch).first().waitFor({ state: 'visible', timeout: 10_000 });
    // Wait for the location list to be populated with real data before returning.
    // The picker renders skeleton placeholder rows immediately (visible, but with empty text
    // content) while the API call is in flight. Waiting for row visibility alone is satisfied
    // by a skeleton row in milliseconds, while the actual data can take ~23 seconds to arrive.
    // We poll until at least one row's trimmed text is non-empty, confirming real data has
    // loaded. The 60 000 ms budget matches the timeout used for other slow surfaces in this
    // environment.
    await expect
      .poll(
        async () => {
          const rows = this.page.locator('[role="dialog"] tbody tr');
          const count = await rows.count();
          if (count === 0) return false;
          const firstText = await rows.first().innerText();
          return firstText.trim().length > 0;
        },
        { timeout: 60_000, intervals: [500, 500, 1_000, 1_000, 2_000] },
      )
      .toBe(true);
  }

  @step('Select location')
  async selectLocation(nameOrNumber: string): Promise<void> {
    const search = this.page.locator(OS.ovrLocationPickerSearch).first();
    await this.openLocationPicker();
    // The picker is a Radix modal whose search input can mount a moment before it becomes
    // editable (open animation + a server-loaded location list). A fill occasionally races
    // that window and finds the input non-editable; a fresh re-open reliably clears the stuck
    // state, so the open-and-fill is bounded-retried before giving up.
    for (let attempt = 1; ; attempt++) {
      try {
        await search.fill(nameOrNumber, { timeout: 6_000 });
        break;
      } catch (err) {
        if (attempt >= 3) throw err;
        await this.page.keyboard.press('Escape').catch(() => { /* best-effort dismiss before re-open */ });
        await search.waitFor({ state: 'hidden', timeout: 2_000 }).catch(() => { /* best-effort: re-open regardless of dismiss result */ });
        await this.openLocationPicker();
      }
    }
    const row = this.page.locator(OS.ovrLocationPickerRowAny, { hasText: nameOrNumber }).first();
    await row.waitFor({ state: 'visible', timeout: 10_000 });
    await row.locator(OS.ovrLocationPickerRowCheckbox).first().check();
    await this.page.locator(OS.ovrLocationPickerSelect).first().click();
    await this.waitForAngularStable();
  }

  @step('Get currency options')
  async getCurrencyOptions(): Promise<string[]> {
    await this.page.locator(OS.ovrCurrencyDropdown).first().click();
    await this.page.locator('[role="option"]').first().waitFor({ state: 'visible', timeout: 8_000 });
    const out = (await this.page.locator('[role="option"]').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
    await this.page.keyboard.press('Escape');
    return out.filter(Boolean);
  }

  @step('Select currency')
  async selectCurrency(value: string): Promise<void> {
    await this.page.locator(OS.ovrCurrencyDropdown).first().click();
    await this.page.locator('[role="option"]', { hasText: value }).first().click();
    await this.waitForAngularStable();
  }

  /** Reset the currency filter back to ALL when a specific currency is currently selected. */
  @step('Reset currency filter')
  async resetCurrencyFilter(currentCurrency: string): Promise<void> {
    await this.page.locator(`button[role="combobox"]:has-text("${currentCurrency}")`).first().click();
    await this.page.locator('[role="option"]', { hasText: 'ALL' }).first().click();
    await this.waitForAngularStable();
  }

  @step('Get rows per page options')
  async getRowsPerPageOptions(): Promise<string[]> {
    await this.page.locator(OS.ovrRowsPerPage).first().click();
    await this.page.locator('[role="option"]').first().waitFor({ state: 'visible', timeout: 8_000 });
    const out = (await this.page.locator('[role="option"]').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
    await this.page.keyboard.press('Escape');
    return out.filter(Boolean);
  }

  @step('Get active only state')
  async getActiveOnlyState(): Promise<boolean> {
    return (await this.page.locator(OS.ovrActiveOnlyCheckbox).first().getAttribute('aria-checked')) === 'true';
  }

  @step('Set active only')
  async setActiveOnly(checked: boolean): Promise<void> {
    const cb = this.page.locator(OS.ovrActiveOnlyCheckbox).first();
    if (checked) await cb.check();
    else await cb.uncheck();
    await this.waitForAngularStable();
  }

  /**
   * Type into the client-side "Filter Product Groups Override..." input (narrows the rendered grid).
   * React-controlled + debounced: `.fill()` alone does not commit React state, and `waitForAngularStable`
   * is a no-op on this React app — so use `setReactInput` (native setter) + a one-shot settle for the
   * filter's debounce/re-render to land before the caller reads the row count (NOT a polling loop).
   */
  @step('Filter product groups')
  async filterProductGroups(text: string): Promise<void> {
    await this.setReactInput(OS.ovrFilterInput, text);
    await this.page.waitForTimeout(800);
  }

  @step('Clear filter')
  async clearFilter(): Promise<void> {
    await this.setReactInput(OS.ovrFilterInput, '');
    await this.page.waitForTimeout(700);
  }

  @step('Get column headers')
  async getColumnHeaders(): Promise<string[]> {
    return this.readAllTexts(OS.ovrColHeaderAny);
  }

  @step('Get column count')
  async getColumnCount(): Promise<number> {
    return this.page.locator(OS.ovrColHeaderAny).count();
  }

  @step('Get visible row count')
  async getVisibleRowCount(): Promise<number> {
    return this.page.locator(OS.ovrGridRowAny).count();
  }

  @step('Find row by product group')
  async findRowByProductGroup(name: string): Promise<Locator | null> {
    const row = this.page.locator(OS.ovrGridRowAny, { hasText: name }).first();
    return (await row.count()) > 0 ? row : null;
  }

  @step('Is empty')
  async isEmpty(): Promise<boolean> {
    return this.isVisibleSafe(OS.ovrNoResults);
  }

  @step('Read active state')
  async readActiveState(row: Locator): Promise<boolean> {
    return (await row.locator('[role="checkbox"]').first().getAttribute('aria-checked')) === 'true';
  }

  /**
   * Read a numeric click-to-edit cell's DISPLAY value (the `div[role=button]`), waiting for display mode
   * so a read never races a still-open editor (which would yield "" → NaN on back-to-back edits).
   * Thousands separators are stripped so "999,999.00" → "999999.00" parses correctly.
   */
  private async readEditableCell(row: Locator, colIndex: number): Promise<string> {
    const cell = row.locator('td').nth(colIndex);
    const disp = cell.locator('[role="button"]').first();
    await disp.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => { /* fall back to the whole cell */ });
    const src = (await disp.count()) > 0 ? disp : cell;
    return (await src.innerText()).replace(/\s+/g, ' ').replace(/,/g, '').trim();
  }

  @step('Read override price')
  async readOverridePrice(row: Locator): Promise<string> {
    return this.readEditableCell(row, CORP_PRICING_OVERRIDE.columnIndex.overridePrice);
  }

  @step('Read max discount')
  async readMaxDiscount(row: Locator): Promise<string> {
    return this.readEditableCell(row, CORP_PRICING_OVERRIDE.columnIndex.maxDiscount);
  }

  @step('Wait for grid rows')
  async waitForGridRows(timeout = 20_000): Promise<void> {
    await this.page
      .locator(OS.ovrGridRowAny)
      .first()
      .waitFor({ state: 'visible', timeout })
      .catch(() => { /* may be legitimately empty (Labor / no-match filter) */ });
  }

  @step('Reload and reselect')
  async reloadAndReselect(needle: string, office: string = CORPORATE_PRICING_COMMON.office): Promise<void> {
    await this.gotoOverride(office);
    await this.selectLocation(needle);
    await this.waitForGridRows();
  }

  /**
   * Open a click-to-edit numeric cell (`div[role=button]`) and return its revealed `spinbutton` editor.
   * The Override grid spinbutton is React-controlled: `.fill()` does NOT commit React state, so callers
   * MUST use `setReactInput` (native value-setter) + `Enter` to commit.
   */
  private async openCellEditor(row: Locator, cellSel: string): Promise<Locator> {
    await row.locator(cellSel).first().click();
    // Scope editor to the row — not page-wide — so a stale editor left in another
    // row by the known two-editor defect cannot silently resolve as "ours".
    // Playwright strict mode: throws if 0 or 2+ spinbuttons exist in the row.
    const editor = row.getByRole('spinbutton');
    await editor.waitFor({ state: 'visible', timeout: 8_000 });
    return editor;
  }

  private async editNumericCell(row: Locator, cellSel: string, value: string): Promise<void> {
    const editor = await this.openCellEditor(row, cellSel);
    await this.setReactInput(editor, value);
    await editor.press('Enter');
    await editor.waitFor({ state: 'hidden', timeout: 8_000 });
    await this.page.waitForTimeout(250);
  }

  @step('Set override price')
  async setOverridePrice(row: Locator, value: string): Promise<void> {
    await this.editNumericCell(row, OS.ovrCellOverridePrice, value);
  }

  @step('Set max discount')
  async setMaxDiscount(row: Locator, value: string): Promise<void> {
    await this.editNumericCell(row, OS.ovrCellMaxDiscount, value);
  }

  /**
   * Attempt to commit a Max Discount value; returns true if it committed (editor closed) or false if the
   * field REJECTED it (editor stayed open — the live app caps Max Discount % at 100, so >100 is rejected).
   * On rejection the editor is Escaped to leave a clean cell. Does NOT click Save.
   */
  @step('Try max discount')
  async tryMaxDiscount(row: Locator, value: string): Promise<boolean> {
    const editor = await this.openCellEditor(row, OS.ovrCellMaxDiscount);
    await this.setReactInput(editor, value);
    await editor.press('Enter');
    const committed = await editor.waitFor({ state: 'hidden', timeout: 4_000 }).then(() => true).catch(() => false);
    if (!committed) {
      await editor.press('Escape').catch(() => {});
    }
    await this.page.waitForTimeout(200);
    return committed;
  }

  @step('Peek override price editor')
  async peekOverridePriceEditor(row: Locator): Promise<string> {
    const editor = await this.openCellEditor(row, OS.ovrCellOverridePrice);
    const v = await editor.inputValue().catch(() => '');
    await editor.press('Escape').catch(() => {});
    return v;
  }

  /**
   * Open the Override Price editor, attempt to set `raw` via the native setter, return the value the
   * (type=number) input actually retains, then Escape (no commit). Used to prove non-numeric input is
   * rejected (a `<input type=number>` coerces an invalid string to "").
   */
  @step('Probe override price input')
  async probeOverridePriceInput(row: Locator, raw: string): Promise<string> {
    const editor = await this.openCellEditor(row, OS.ovrCellOverridePrice);
    await this.setReactInput(editor, raw);
    const v = await editor.inputValue().catch(() => '');
    await editor.press('Escape').catch(() => {});
    return v;
  }

  @step('Toggle active')
  async toggleActive(row: Locator): Promise<void> {
    await row.locator(OS.ovrCellActiveCheckbox).first().click();
  }

  @step('Set active')
  async setActive(row: Locator, checked: boolean): Promise<void> {
    if ((await this.readActiveState(row)) !== checked) await this.toggleActive(row);
  }

  @step('Is override save enabled')
  async isOverrideSaveEnabled(): Promise<boolean> {
    return this.page.locator(OS.ovrBtnSave).first().isEnabled().catch(() => false);
  }

  /**
   * Click the page-level Save and confirm the shared "Save Changes" alertdialog, then settle on the
   * success toast. Flow: Save → alertdialog (heading "Save Changes", body
   * "Are you sure you want to save the changes?", Cancel/Save) → `POST {saveApiPath}` → toast
   * "Pricing overrides saved successfully." The dialog can take a few seconds on this heavy page, so we
   * wait for it explicitly.
   */
  @step('Save and confirm')
  async saveAndConfirm(): Promise<void> {
    await this.page.locator(OS.ovrBtnSave).first().click();
    // The dialog is `<div role="alertdialog">` — Playwright `getByRole('alertdialog')` does NOT match it
    // (shadow/portal a11y exclusion), so use the CSS selector + the TEXT-anchored Save button (the
    // dialog buttons have no computed accessible name).
    const dlg = this.page.locator(OS.ovrSaveDialog).first();
    await dlg.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => { /* direct-save fallback */ });
    if (await dlg.isVisible().catch(() => false)) {
      await this.page.locator(OS.ovrSaveDialogConfirm).first().click();
    }
    // Settle on the success toast (persistence is re-verified by the caller's reload + DOM re-read).
    // Warn instead of silently swallowing a timeout — a missing toast is a real signal the save may
    // not have completed cleanly, even though the caller's reload + re-read remains the proof.
    const toastSeen = await this.page
      .getByText(CORP_PRICING_OVERRIDE.saveSuccessToast, { exact: false })
      .first()
      .waitFor({ state: 'visible', timeout: 12_000 })
      .then(() => true)
      .catch(() => false);
    if (!toastSeen) {
      Log.warn('saveAndConfirm: success toast not seen within 12s — the caller reload + re-read still proves persistence, but the save may not have completed cleanly.');
    }
    await this.waitForAngularStable(2_000).catch(() => {});
  }

  @step('Click save and cancel')
  async clickSaveAndCancel(): Promise<string> {
    await this.page.locator(OS.ovrBtnSave).first().click();
    const dlg = this.page.locator(OS.ovrSaveDialog).first();
    await dlg.waitFor({ state: 'visible', timeout: 10_000 });
    const text = (await dlg.innerText()).replace(/\s+/g, ' ').trim();
    await this.page.locator(OS.ovrSaveDialogCancel).first().click();
    await dlg.waitFor({ state: 'hidden', timeout: 8_000 });
    return text;
  }

  private static numEq(a: string, b: string): boolean {
    const n = (s: string): number => parseFloat(String(s).replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n(a)) && Number.isFinite(n(b)) && n(a) === n(b);
  }

  private static isMaxDiscountUnset(s: string): boolean {
    const t = (s ?? '').replace(/\s+/g, '').trim();
    return t === '' || t === '—' || t === '-' || t === '–';
  }

  /**
   * Restore the fixture row to its baseline Override Price + Active + (unset) Max Discount. Reloads +
   * re-selects each cycle, re-reads, saves only if dirty; bounded to 3 cycles then a final verify that
   * THROWS if it could not restore (so a silent drift surfaces as a failure, mirroring the Legal
   * `ensureDefaultState`). Max Discount is cleared back to its unset state when a prior case set it.
   */
  @step('Ensure default state')
  async ensureDefaultState(
    anchor: string,
    defaults: { overridePrice: string; active: boolean },
    needle: string,
    office: string = CORPORATE_PRICING_COMMON.office,
    tab: OverrideTab = 'Equipment',
  ): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt++) {
      await this.reloadAndReselect(needle, office);
      if (tab !== 'Equipment') await this.switchOverrideTab(tab); // a reload always lands on the Equipment tab
      const row = await this.findRowByProductGroup(anchor);
      if (!row) throw new Error(`ensureDefaultState: row "${anchor}" not found for office ${office}`);
      const priceOk = CorporatePricingOverridePage.numEq(await this.readOverridePrice(row), defaults.overridePrice);
      const activeOk = (await this.readActiveState(row)) === defaults.active;
      const mdOk = CorporatePricingOverridePage.isMaxDiscountUnset(await this.readMaxDiscount(row));
      if (priceOk && activeOk && mdOk) return;
      if (!priceOk) await this.setOverridePrice(row, defaults.overridePrice);
      if (!mdOk) await this.setMaxDiscount(row, ''); // clear back to unset
      if (!activeOk) await this.setActive(row, defaults.active);
      if (await this.isOverrideSaveEnabled()) await this.saveAndConfirm();
    }
    await this.reloadAndReselect(needle, office);
    if (tab !== 'Equipment') await this.switchOverrideTab(tab);
    const row = await this.findRowByProductGroup(anchor);
    const gotP = row ? await this.readOverridePrice(row) : 'MISSING';
    const gotMd = row ? await this.readMaxDiscount(row) : 'MISSING';
    const gotA = row ? await this.readActiveState(row) : null;
    if (
      !row ||
      !CorporatePricingOverridePage.numEq(gotP, defaults.overridePrice) ||
      !CorporatePricingOverridePage.isMaxDiscountUnset(gotMd) ||
      gotA !== defaults.active
    ) {
      throw new Error(`ensureDefaultState: failed to restore "${anchor}" (price=${gotP}, maxDisc=${gotMd}, active=${gotA})`);
    }
  }

  @step('Open via search action bar')
  async openViaSearchActionBar(office: string = CORPORATE_PRICING_COMMON.office): Promise<void> {
    const base = (this.config?.base_url ?? '').replace(/\/+$/, '');
    await this.navigateTo(`${base}${CORPORATE_PRICING_ROUTES.searchPath(office)}`);
    await this.waitForAngularStable();
    await this.page.locator(OS.ovrNavFromSearch).first().click();
    await this.page.waitForURL(/\/pg-override/, { timeout: 20_000 }).catch(() => { /* the caller asserts the URL */ });
    await this.waitForLoaded();
  }

  @step('Inspect location modal')
  async inspectLocationModal(needle: string): Promise<{
    title: string;
    selectDisabledInitially: boolean;
    rowsMatching: number;
    selectEnabledAfterCheck: boolean;
    gridEmptyAfterCancel: boolean;
  }> {
    await this.openLocationPicker();
    const title = (await this.page.locator(OS.ovrLocationModalDialog).first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    const selectDisabledInitially = await this.page.locator(OS.ovrLocationPickerSelect).first().isDisabled().catch(() => false);
    await this.page.locator(OS.ovrLocationPickerSearch).first().fill(needle);
    const rows = this.page.locator(OS.ovrLocationPickerRowAny, { hasText: needle });
    // The picker search is server-backed — wait for the matching row to render before counting
    // (a fixed sleep raced the result). A genuine zero-match is still handled by the count below.
    await rows.first().waitFor({ state: 'visible', timeout: 10_000 }).catch(() => { /* best-effort: zero rows is itself a valid observation */ });
    const rowsMatching = await rows.count();
    await rows.first().locator(OS.ovrLocationPickerRowCheckbox).first().check().catch(() => { /* row may need a plain click */ });
    // Wait for the Select button to actually become enabled after checking the row, rather than a
    // fixed pause; a row that genuinely never enables Select resolves to false at the timeout.
    const selectBtn = this.page.locator(OS.ovrLocationPickerSelect).first();
    const selectEnabledAfterCheck = await expect(selectBtn)
      .toBeEnabled({ timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    await this.page.locator(OS.ovrLocationPickerCancel).first().click().catch(() => { /* best-effort dismiss; the gridEmptyAfterCancel read below is the real check */ });
    // Wait for the choose-a-location prompt to actually reappear (picker closed) rather than a fixed pause.
    await this.page.locator(OS.ovrSelectLocationText).first().waitFor({ state: 'visible', timeout: 5_000 }).catch(() => { /* the read below is the real oracle */ });
    const gridEmptyAfterCancel = await this.isVisibleSafe(OS.ovrSelectLocationText);
    return { title, selectDisabledInitially, rowsMatching, selectEnabledAfterCheck, gridEmptyAfterCancel };
  }

  @step('Open grid options')
  async openGridOptions(): Promise<void> {
    await this.page.locator(OS.ovrBtnGridOptions).first().click();
    await this.page.locator(OS.ovrGridOptionsMenuItem).first().waitFor({ state: 'visible', timeout: 8_000 });
  }

  @step('Get grid option columns')
  async getGridOptionColumns(): Promise<Array<{ label: string; checked: boolean }>> {
    return this.page.locator(OS.ovrGridOptionsMenuItem).evaluateAll((els) =>
      els.map((e) => ({
        label: (e.textContent || '').replace(/\s+/g, ' ').trim(),
        checked: e.getAttribute('aria-checked') === 'true',
      })),
    );
  }

  @step('Toggle grid column')
  async toggleGridColumn(label: string): Promise<void> {
    await this.page.locator(OS.ovrGridOptionsMenuItem, { hasText: label }).first().click();
    await this.page.waitForTimeout(500);
  }

  @step('Close grid options')
  async closeGridOptions(): Promise<void> {
    await this.page.keyboard.press('Escape');
    await this.page.waitForTimeout(400);
  }

  @step('Is grid column visible')
  async isGridColumnVisible(label: string): Promise<boolean> {
    const headers = await this.getColumnHeaders();
    return headers.some((h) => h.includes(label));
  }

  @step('Reset grid to default')
  async resetGridToDefault(): Promise<void> {
    await this.page.locator(OS.ovrGridOptionsReset).first().click().catch(() => { /* best-effort; callers re-open Grid Options and verify column state */ });
    await this.page.waitForTimeout(600);
  }

  /**
   * Baseline restore: ensure every grid column is visible again. Column visibility is a server-persisted
   * preference, so a test that hides a column must restore it. Bounded retry re-reads the columns after
   * a reload and re-toggles any still hidden, throwing if the baseline cannot be restored — a silently
   * no-op'd toggle must never report success while a column stays hidden for the next test.
   */
  @step('Ensure all grid columns visible')
  async ensureAllGridColumnsVisible(needle: string, office: string = CORPORATE_PRICING_COMMON.office): Promise<void> {
    const allColumnsChecked = async (): Promise<boolean> => {
      await this.openGridOptions();
      const cols = await this.getGridOptionColumns();
      await this.closeGridOptions();
      return cols.every((c) => c.checked);
    };
    await this.saveAndVerifyPersisted({
      isAtTarget: allColumnsChecked,
      applyMutation: async () => {
        await this.openGridOptions();
        const cols = await this.getGridOptionColumns();
        for (const c of cols) if (!c.checked) await this.toggleGridColumn(c.label);
        await this.closeGridOptions();
      },
      save: async () => { /* each toggle persists immediately server-side; no separate save step */ },
      reload: async () => this.reloadAndReselect(needle, office),
      label: 'grid column visibility',
    });
  }

  @step('Download override export')
  async downloadOverrideExport(): Promise<{ filename: string; requestUrl: string; content: string; headers: string[] }> {
    const [download, request] = await Promise.all([
      this.page.waitForEvent('download', { timeout: 30_000 }),
      this.page.waitForRequest((r) => r.url().includes(CORP_PRICING_OVERRIDE.export.apiPathFragment), { timeout: 30_000 }),
      this.page.locator(OS.ovrBtnExport).first().click(),
    ]);
    const filePath = await download.path();
    if (!filePath) throw new Error('downloadOverrideExport: the download did not resolve to a file path');
    const raw = readFileSync(filePath, 'utf-8');
    const content = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw; // strip a leading byte-order mark if present
    const firstLine = content.split(/\r?\n/)[0] ?? '';
    const headers = firstLine ? firstLine.split(',').map((h) => h.replace(/^"|"$/g, '').trim()) : [];
    return { filename: download.suggestedFilename(), requestUrl: request.url(), content, headers };
  }

  @step('Open import dialog')
  async openImportDialog(): Promise<void> {
    await this.page.locator(OS.ovrBtnImport).first().click();
    await this.page.locator(OS.ovrImportDialog).first().waitFor({ state: 'visible', timeout: 10_000 });
  }

  @step('Read import dialog')
  async readImportDialog(): Promise<{ text: string; buttons: string[]; hasFileInput: boolean }> {
    const dlg = this.page.locator(OS.ovrImportDialog).first();
    const text = (await dlg.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    const buttons = (await dlg.locator('button').allInnerTexts().catch(() => [])).map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const hasFileInput = (await this.page.locator(OS.ovrImportFileInput).count()) > 0;
    return { text, buttons, hasFileInput };
  }

  @step('Close import dialog')
  async closeImportDialog(): Promise<void> {
    await this.page.locator(OS.ovrImportCancel).first().click().catch(async () => {
      await this.page.locator(OS.ovrImportClose).first().click().catch(() => { /* best-effort fallback close; the hidden-wait below confirms dismissal */ });
    });
    await this.page.locator(OS.ovrImportDialog).first().waitFor({ state: 'hidden', timeout: 6_000 });
  }

  @step('Is import dialog visible')
  async isImportDialogVisible(): Promise<boolean> {
    return this.isVisibleSafe(OS.ovrImportDialog);
  }

  @step('Probe column sort')
  async probeColumnSort(headerLabel: string): Promise<{ ariaSortBefore: string | null; ariaSortAfter: string | null; orderChanged: boolean }> {
    const firstRowBefore = (await this.page.locator(OS.ovrGridRowAny).first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    const header = this.page.locator(OS.ovrColHeaderAny, { hasText: headerLabel }).first();
    const ariaSortBefore = await header.getAttribute('aria-sort').catch(() => null);
    await header.click().catch(() => { /* best-effort: an inert header may not react (that is the behavior under test); the reads below are the oracle */ });
    await this.page.waitForTimeout(1_000);
    const ariaSortAfter = await header.getAttribute('aria-sort').catch(() => null);
    const firstRowAfter = (await this.page.locator(OS.ovrGridRowAny).first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    return { ariaSortBefore, ariaSortAfter, orderChanged: firstRowBefore !== firstRowAfter };
  }

  // --- Change Local Office picker helpers (NM-2268, search-narrowing + Active checkbox) ---

  /**
   * Type a search query into the "Search by Location Name, Number" textbox inside an already-open
   * Change Local Office picker dialog. Search is client-side — no API call per keystroke. A short
   * settle wait lets the filter re-render before the caller reads the row count.
   */
  @step('Search local office')
  async searchLocalOffice(query: string): Promise<void> {
    // fill() clears the existing value and fires a trusted CDP input event that triggers the
    // server-backed debounced search POST. Wait for a matching row to appear (mirrors selectLocation)
    // rather than waiting on a fixed timeout or a response promise that could capture a stale POST.
    await this.page.locator(OS.ovrLocationPickerSearch).first().fill(query);
    await this.page.locator(OS.ovrLocationPickerRowAny, { hasText: query }).first()
      .waitFor({ state: 'visible', timeout: 8_000 })
      .catch(() => {}); // zero-match is a valid outcome; the caller asserts it
  }

  /** Clear the picker search box and wait for the full unfiltered list to reload from the server. */
  @step('Clear picker search')
  async clearPickerSearch(): Promise<void> {
    await this.page.locator(OS.ovrLocationPickerSearch).first().fill('');
    await this.page.locator('[role="dialog"] tbody tr').first()
      .waitFor({ state: 'visible', timeout: 8_000 })
      .catch(() => {});
    await this.page.waitForTimeout(300); // let virtual list stabilize after reload
  }

  /** Count visible tbody rows inside the Change Local Office picker dialog. */
  @step('Get picker row count')
  async getPickerRowCount(): Promise<number> {
    return this.page.locator(OS.ovrLocationPickerRowAny).count();
  }

  /**
   * Return true if at least one picker row contains the given text (visible text-match inside tbody tr).
   * Used to assert that a search result is present without relying on exact row counts across data states.
   */
  @step('Picker has row containing')
  async pickerHasRowContaining(text: string): Promise<boolean> {
    return (await this.page.locator(OS.ovrLocationPickerRowAny, { hasText: text }).count()) > 0;
  }

  /**
   * Return the number of visible picker rows that contain the given text.
   * Used to verify that a search filter shows only matching offices — every rendered row
   * should contain the search query when the filter is active.
   */
  @step('Get picker row count containing')
  async getPickerRowCountContaining(text: string): Promise<number> {
    return this.page.locator(OS.ovrLocationPickerRowAny, { hasText: text }).count();
  }

  /**
   * Read the Active filter checkbox state inside the Change Local Office picker dialog.
   * The Active checkbox is the FIRST [role="checkbox"] in the dialog — it appears above the search
   * textbox and the table rows.
   */
  @step('Get picker active checkbox state')
  async getPickerActiveCheckboxState(): Promise<boolean> {
    return (await this.page.locator(OS.ovrLocationPickerActiveCheckbox).first().getAttribute('data-state')) === 'checked';
  }

  /**
   * Toggle the Active filter checkbox in the Change Local Office picker dialog.
   * Toggling the Active filter is handled client-side — it does NOT trigger a new location-lookup
   * request, and the returned location set is unchanged.
   * (Known issue: the active-only filter has no server effect.)
   */
  @step('Toggle local office picker active')
  async toggleLocalOfficePickerActive(): Promise<void> {
    await this.page.locator(OS.ovrLocationPickerActiveCheckbox).first().click();
  }

  /** Click the Cancel button inside the Change Local Office picker dialog. */
  @step('Cancel location picker')
  async cancelLocationPicker(): Promise<void> {
    // best-effort: cancel button may already be absent if the picker was dismissed
    await this.page.locator(OS.ovrLocationPickerCancel).first().click().catch(() => {});
    await this.page.locator(OS.ovrSelectLocationText).first()
      .waitFor({ state: 'visible', timeout: 5_000 })
      .catch(() => {});
  }

  /**
   * Open the Change Local Office picker and probe for a POST /api/location/location-lookup.
   * Returns postFired:true with locationCount from body.locations.length when the request fires
   * (expected on first open). Returns postFired:false / locationCount:-1 if no POST fires within
   * the 3-second window. No DOM fallback — a missing POST is reported honestly.
   */
  @step('Open location picker and capture post')
  async openLocationPickerAndCapturePost(): Promise<LocationLookupProbe> {
    const responsePromise = this.page.waitForResponse(
      (r) => r.url().includes('/api/location/location-lookup') && r.request().method() === 'POST',
      { timeout: 5_000 },
    ).then(async (response): Promise<LocationLookupProbe> => {
      const body = await response.json().catch(() => ({})) as { locations?: unknown[] };
      return { postFired: true, locationCount: Array.isArray(body.locations) ? body.locations.length : -1 };
    }).catch((): LocationLookupProbe => ({ postFired: false, locationCount: -1 }));

    await this.openLocationPicker();
    return Promise.race([
      responsePromise,
      this.page.waitForTimeout(3_000).then((): LocationLookupProbe => ({ postFired: false, locationCount: -1 })),
    ]);
  }

  /**
   * Toggle the Active filter checkbox and probe for a POST /api/location/location-lookup.
   * Returns postFired:false / locationCount:-1 when toggle is a client-side filter (the
   * activeOnly flag currently has no server effect). Returns postFired:true if the app is
   * fixed to make a server call. No DOM fallback — a missing POST is reported as postFired:false.
   */
  @step('Toggle local office picker active and capture post')
  async toggleLocalOfficePickerActiveAndCapturePost(): Promise<LocationLookupProbe> {
    const responsePromise = this.page.waitForResponse(
      (r) => r.url().includes('/api/location/location-lookup') && r.request().method() === 'POST',
      { timeout: 5_000 },
    ).then(async (response): Promise<LocationLookupProbe> => {
      const body = await response.json().catch(() => ({})) as { locations?: unknown[] };
      return { postFired: true, locationCount: Array.isArray(body.locations) ? body.locations.length : -1 };
    }).catch((): LocationLookupProbe => ({ postFired: false, locationCount: -1 }));

    await this.toggleLocalOfficePickerActive();
    return Promise.race([
      responsePromise,
      this.page.waitForTimeout(3_000).then((): LocationLookupProbe => ({ postFired: false, locationCount: -1 })),
    ]);
  }

  @step('Get current price cells')
  async getCurrentPriceCells(): Promise<string[]> {
    const rows = this.page.locator(OS.ovrGridRowAny);
    const n = await rows.count();
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
      out.push((await rows.nth(i).locator('td').nth(CORP_PRICING_OVERRIDE.columnIndex.currentPrice).innerText().catch(() => '')).trim());
    }
    return out;
  }

  /**
   * Sort a grid column by opening its header dropdown and clicking the
   * "Sort ascending" or "Sort descending" menu item. This is the live sort mechanism
   * on the Override grid — a dropdown menu, not a header-click toggle.
   * Waits for the grid to settle before returning (one-shot, not a poll loop).
   */
  @step('Sort column via dropdown')
  async sortColumnViaDropdown(headerLabel: string, direction: 'ascending' | 'descending'): Promise<void> {
    const header = this.page.locator(OS.ovrColHeaderAny, { hasText: headerLabel }).first();
    await header.click();
    const menuLabel = direction === 'ascending' ? 'Sort ascending' : 'Sort descending';
    const menuItem = this.page.getByRole('menuitem', { name: menuLabel }).first();
    await menuItem.waitFor({ state: 'visible', timeout: 6_000 });
    await menuItem.click();
    await this.page.waitForTimeout(1_200); // one-shot settle for the grid re-render after sort
  }

  /**
   * Read the inner text of the first visible row's cell at the given column index (0-based).
   * Used to assert walk-certified first-cell sort oracles.
   */
  @step('Get first row cell text')
  async getFirstRowCellText(colIndex: number): Promise<string> {
    return (await this.page.locator(OS.ovrGridRowAny).first().locator('td').nth(colIndex).innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  /**
   * Read every visible row's cell text at the given column index (0-based).
   * Used to verify that a column is monotonically ordered after an ASC or DESC sort.
   */
  @step('Get column cell values')
  async getColumnCellValues(colIndex: number): Promise<string[]> {
    const rows = this.page.locator(OS.ovrGridRowAny);
    const n = await rows.count();
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
      out.push((await rows.nth(i).locator('td').nth(colIndex).innerText().catch(() => '')).replace(/\s+/g, ' ').trim());
    }
    return out;
  }

  /** Read the grid's total record count from the "items found" footer text (spans all pages). */
  @step('Get items found total')
  async getItemsFoundTotal(): Promise<number> {
    const text = (await this.page.locator(OS.ovrItemsFound).first().innerText()).trim();
    return parseInt(text.replace(/,/g, ''), 10);
  }

  // --- Grid pagination (NM-2271) — icon buttons identified by aria-label ---

  /** Read the disabled state of all four page-navigation buttons. */
  @step('Get pagination button states')
  async getPaginationButtonStates(): Promise<{ first: boolean; previous: boolean; next: boolean; last: boolean }> {
    return {
      first: await this.page.locator(OS.ovrPageBtnFirst).first().isDisabled(),
      previous: await this.page.locator(OS.ovrPageBtnPrevious).first().isDisabled(),
      next: await this.page.locator(OS.ovrPageBtnNext).first().isDisabled(),
      last: await this.page.locator(OS.ovrPageBtnLast).first().isDisabled(),
    };
  }

  /** Navigate the grid to the first / previous / next / last page and wait for the rows to re-render. */
  @step('Go to page')
  async goToPage(target: 'first' | 'previous' | 'next' | 'last'): Promise<void> {
    const sel = { first: OS.ovrPageBtnFirst, previous: OS.ovrPageBtnPrevious, next: OS.ovrPageBtnNext, last: OS.ovrPageBtnLast }[target];
    await this.page.locator(sel).first().click();
    await this.page.waitForTimeout(1_200); // one-shot settle for the server-paged grid re-render
  }

  /**
   * Read the current rows-per-page selection. The control is the page-size combobox whose visible
   * text is always one of the size options — the currency combobox next to it never shows a number.
   */
  private rowsPerPageCombobox(): Locator {
    return this.page.getByRole('combobox').filter({ hasText: /^(10|20|30|40|50)$/ }).first();
  }

  @step('Get rows per page value')
  async getRowsPerPageValue(): Promise<string> {
    return (await this.rowsPerPageCombobox().innerText()).replace(/\s+/g, ' ').trim();
  }

  /** Change the rows-per-page selection and wait for the grid to re-render with the new page size. */
  @step('Set rows per page')
  async setRowsPerPage(value: string): Promise<void> {
    await this.rowsPerPageCombobox().click();
    await this.page.locator('[role="option"]', { hasText: value }).first().click();
    await this.page.waitForTimeout(1_200);
  }

  // --- Unsaved-changes guard (NM-2271) ---

  /**
   * Click the in-app Home link while the grid holds an uncommitted edit, and wait for the
   * "Unsaved changes" guard dialog. The guard only fires on IN-APP link navigation — a direct
   * URL change triggers the browser's own leave-page prompt instead, so this helper always
   * navigates via the Home link. Returns the dialog's verbatim text for content assertions.
   */
  @step('Navigate home expect unsaved dialog')
  async navigateHomeExpectUnsavedDialog(): Promise<string> {
    await this.page.getByRole('link', { name: 'Home' }).first().click();
    const dlg = this.page.locator(OS.ovrUnsavedDialog).first();
    await dlg.waitFor({ state: 'visible', timeout: 10_000 });
    return (await dlg.innerText()).replace(/\s+/g, ' ').trim();
  }

  /** Choose "Stay" in the unsaved-changes dialog and wait for it to close (remains on the page). */
  @step('Stay on page')
  async stayOnPage(): Promise<void> {
    await this.page.locator(OS.ovrUnsavedDialogStay).first().click();
    await this.page.locator(OS.ovrUnsavedDialog).first().waitFor({ state: 'hidden', timeout: 8_000 });
  }

  /**
   * Choose "Discard" in the unsaved-changes dialog and wait for navigation to complete.
   * The destination is a heavy server-rendered page, so the navigation budget matches the rest of
   * this page object (30s, same as the load wait) — a 15s budget flaked on a slow first paint.
   */
  @step('Discard and leave')
  async discardAndLeave(): Promise<void> {
    await this.page.locator(OS.ovrUnsavedDialogDiscard).first().click();
    await this.page.waitForURL(/\/home/, { timeout: 30_000 });
  }

  // --- Keyboard access to editable cells (NM-2271) ---

  /**
   * Focus the row's Override Price display cell and press Enter to open its numeric editor.
   * Returns the editor's exposed value. Verified live: the display cell is a focusable
   * button-style element, Enter reveals the editor, Escape closes it without dirtying the form.
   */
  @step('Open override price editor with keyboard')
  async openOverridePriceEditorWithKeyboard(row: Locator): Promise<string> {
    await row.locator(OS.ovrCellOverridePrice).first().focus();
    await this.page.keyboard.press('Enter');
    const editor = row.getByRole('spinbutton');
    await editor.waitFor({ state: 'visible', timeout: 8_000 });
    return editor.inputValue().catch(() => '');
  }

  /** Press Escape to dismiss an open cell editor and wait for it to close (no value committed). */
  @step('Close editor with keyboard')
  async closeEditorWithKeyboard(): Promise<void> {
    const editor = this.page.getByRole('spinbutton');
    const count = await editor.count();
    if (count !== 1) {
      throw new Error(`Expected exactly 1 spinbutton editor before Escape, found ${count}`);
    }
    await this.page.keyboard.press('Escape');
    await editor.waitFor({ state: 'hidden', timeout: 8_000 });
  }

  // --- Currency-gated Product Group picker / drag-to-add (NM-2271) ---

  /** True when the Product Group picker panel (search box) is present in the left search area. */
  @step('Is product group picker visible')
  async isProductGroupPickerVisible(): Promise<boolean> {
    return this.isVisibleSafe(OS.ovrPickerSearchInput);
  }

  /**
   * Count the picker's draggable product-group rows (the only draggable table rows on the page).
   * The picker panel mounts BEFORE its rows finish loading from the server, so wait for the first
   * row to render (bounded) before counting — a count taken too early reads 0 on a healthy picker.
   */
  @step('Get picker draggable row count')
  async getPickerDraggableRowCount(): Promise<number> {
    await this.page.locator(OS.ovrPickerDraggableRow).first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => { /* a genuinely empty picker is a valid observation — the caller asserts the count */ });
    return this.page.locator(OS.ovrPickerDraggableRow).count();
  }

  /**
   * Drag the picker's first product-group row into the given override grid tab panel, staging a
   * new override row client-side (no request fires until Save). Returns the dragged row's text so
   * the caller can identify the staged row. Uses the pointer-based drag that was proven live to
   * stage a row on this grid. Waits for the async-loaded picker rows before dragging.
   */
  @step('Drag first picker row to grid')
  async dragFirstPickerRowToGrid(tab: OverrideTab): Promise<string> {
    const source = this.page.locator(OS.ovrPickerDraggableRow).first();
    await source.waitFor({ state: 'visible', timeout: 20_000 });
    const rowText = (await source.innerText()).replace(/\s+/g, ' ').trim();
    const target = this.page.getByRole('tabpanel', { name: tab }).first();
    const rowsBefore = await this.page.locator(OS.ovrGridRowAny).count();

    const deadline = Date.now() + 20_000;
    const waits = [500, 1_000, 2_000, 2_000, 2_000, 2_000, 2_000, 2_000];
    let attempt = 0;
    while (true) {
      await source.dragTo(target);
      await this.page.waitForTimeout(500);
      if (await this.page.locator(OS.ovrGridRowAny).count() > rowsBefore) break;
      if (Date.now() >= deadline) break;
      const wait = waits[Math.min(attempt, waits.length - 1)] ?? 2_000;
      await this.page.waitForTimeout(wait);
      attempt++;
    }
    return rowText;
  }

  // --- Labor-tab equivalents of Equipment helpers (NM-2271) ---
  // Labor matches Equipment: same click-to-edit spinbutton cells, same save dialog, same
  // checkbox Active cell. These mirror the Equipment helpers with a mandatory tab-switch.

  /**
   * Navigate to the Override page, select a location, switch to Labor tab, and wait for
   * grid rows. Mirrors the Equipment `reloadAndReselect` with a Labor tab switch.
   */
  @step('Reload and reselect labor')
  async reloadAndReselectLabor(needle: string, office: string = CORPORATE_PRICING_COMMON.office): Promise<void> {
    await this.gotoOverride(office);
    await this.selectLocation(needle);
    await this.switchOverrideTab('Labor');
    await this.waitForGridRows();
  }

  /**
   * Set the Override Price on a Labor-tab row. Identical mechanism to Equipment — the Labor grid
   * uses the same spinbutton cells (verified live 2026-07-20).
   */
  @step('Set labor override price')
  async setLaborOverridePrice(row: Locator, value: string): Promise<void> {
    await this.editNumericCell(row, OS.ovrCellOverridePrice, value);
  }

  /**
   * Set the Max Discount on a Labor-tab row. Same spinbutton mechanism as Equipment.
   */
  @step('Set labor max discount')
  async setLaborMaxDiscount(row: Locator, value: string): Promise<void> {
    await this.editNumericCell(row, OS.ovrCellMaxDiscount, value);
  }

  /**
   * Toggle the Active checkbox on a Labor-tab row. Same Radix checkbox mechanism as Equipment.
   */
  @step('Toggle labor active')
  async toggleLaborActive(row: Locator): Promise<void> {
    await row.locator(OS.ovrCellActiveCheckbox).first().click();
  }

  /**
   * Restore a Labor fixture row to its baseline state. Mirrors `ensureDefaultState` with a
   * mandatory tab switch to Labor after each reload (a reload always lands on Equipment).
   */
  @step('Ensure labor default state')
  async ensureLaborDefaultState(
    anchor: string,
    defaults: { overridePrice: string; active: boolean },
    needle: string,
    office: string = CORPORATE_PRICING_COMMON.office,
  ): Promise<void> {
    await this.ensureDefaultState(anchor, defaults, needle, office, 'Labor');
  }

  // --- Revert-to-original helper (net-zero changes disable Save) ---

  /**
   * Revert an editable numeric cell to its original (empty/baseline) value by clearing it.
   * CRITICAL: typing an empty string into a cell that has no baseline is a no-op (Ctrl+A then
   * typing nothing leaves the old value). The live-verified mechanism is:
   *   Ctrl+A → Delete → Enter
   * which selects all, deletes to empty, then commits the empty value — restoring the em-dash
   * display and leaving Save DISABLED (net-zero).
   */
  @step('Revert cell to original')
  async revertCellToOriginal(row: Locator, cellSel: string): Promise<void> {
    const editor = await this.openCellEditor(row, cellSel);
    await this.page.keyboard.press('Control+a');
    await this.page.keyboard.press('Delete');
    await editor.press('Enter');
    await editor.waitFor({ state: 'hidden', timeout: 8_000 });
    await this.page.waitForTimeout(250);
  }

  /** Revert the Override Price cell to its original (empty/baseline) state. */
  @step('Revert override price to original')
  async revertOverridePriceToOriginal(row: Locator): Promise<void> {
    await this.revertCellToOriginal(row, OS.ovrCellOverridePrice);
  }

  /** Revert the Max Discount cell to its original (empty/baseline) state. */
  @step('Revert max discount to original')
  async revertMaxDiscountToOriginal(row: Locator): Promise<void> {
    await this.revertCellToOriginal(row, OS.ovrCellMaxDiscount);
  }

  // --- BVA navigation helpers (NM-2271) ---

  /** Navigate to an Equipment-tab row: reload → select location → ensure Equipment tab → find row by PG ID. */
  @step('Navigate to equipment row')
  async navigateToEquipmentRow(office: string, needle: string, productGroup: string): Promise<Locator> {
    await this.gotoOverride(office);
    await this.selectLocation(needle);
    await this.waitForGridRows();
    const activeTab = await this.getActiveTab();
    if (activeTab !== 'Equipment') await this.switchOverrideTab('Equipment');
    const row = await this.findRowByProductGroup(productGroup);
    if (!row) throw new Error(`navigateToEquipmentRow: row PG "${productGroup}" not found on office ${office}`);
    return row;
  }

  /** Navigate to a Labor-tab row: reload → select location → switch to Labor → find row by PG ID. */
  @step('Navigate to labor row')
  async navigateToLaborRow(office: string, needle: string, productGroup: string): Promise<Locator> {
    await this.gotoOverride(office);
    await this.selectLocation(needle);
    await this.switchOverrideTab('Labor');
    await this.waitForGridRows();
    const row = await this.findRowByProductGroup(productGroup);
    if (!row) throw new Error(`navigateToLaborRow: row PG "${productGroup}" not found on office ${office}`);
    return row;
  }

  /** Reload page and reselect location with a specific tab switch. */
  @step('Reload and reselect tab')
  async reloadAndReselectTab(needle: string, office: string, tab: OverrideTab): Promise<void> {
    await this.gotoOverride(office);
    await this.selectLocation(needle);
    if (tab !== 'Equipment') await this.switchOverrideTab(tab);
    await this.waitForGridRows();
  }

  /** Edit a cell then revert to the original value; returns Save-button state at each phase. */
  @step('Edit and revert to original')
  async editAndRevertToOriginal(
    row: Locator,
    field: 'overridePrice' | 'maxDiscount',
    editValue: string,
    originalValue: string,
  ): Promise<{ saveEnabledAfterEdit: boolean; saveDisabledAfterRevert: boolean }> {
    const cellSel = field === 'overridePrice' ? OS.ovrCellOverridePrice : OS.ovrCellMaxDiscount;
    // Edit to the new value
    const editor1 = await this.openCellEditor(row, cellSel);
    await this.page.keyboard.press('Control+a');
    await this.page.keyboard.type(editValue);
    await editor1.press('Enter');
    await editor1.waitFor({ state: 'hidden', timeout: 8_000 });
    await this.page.waitForTimeout(250);
    const saveEnabledAfterEdit = await this.isOverrideSaveEnabled();

    // Revert to original
    if (originalValue === '' || originalValue === '\u2014') {
      await this.revertCellToOriginal(row, cellSel);
    } else {
      const editor2 = await this.openCellEditor(row, cellSel);
      await this.page.keyboard.press('Control+a');
      await this.page.keyboard.type(originalValue);
      await editor2.press('Enter');
      await editor2.waitFor({ state: 'hidden', timeout: 8_000 });
      await this.page.waitForTimeout(250);
    }
    const saveDisabledAfterRevert = !(await this.isOverrideSaveEnabled());
    return { saveEnabledAfterEdit, saveDisabledAfterRevert };
  }

  /** Alias for fragment compatibility — delegates to isOverrideSaveEnabled. */
  @step('Is save enabled')
  async isSaveEnabled(): Promise<boolean> {
    return this.isOverrideSaveEnabled();
  }

  /** The page-level Save button locator. */
  get saveButton(): Locator {
    return this.page.locator(OS.ovrBtnSave).first();
  }

  // --- probeEditOracle: rejection/commit oracle (NM-2271) ---

  /** Result of a `probeEditOracle` call — captures the full state of an edit attempt. */
  // (exported at module level below the class for external use)

  /**
   * Probe the edit oracle for a numeric cell: type a value using REAL KEYBOARD INPUT, then capture
   * every observable signal BEFORE pressing Escape. Capture order is fixed and non-negotiable:
   *   1. committed? (editor closed after Enter)
   *   2. displayed value verbatim (if committed)
   *   3. aria-invalid attribute
   *   4. computed border-color of the editor
   *   5. error text SCOPED to the editing context (cell/editor associations only — excludes headers)
   *   6. Save button state
   *   7. THEN escapability (Escape is cleanup, never observation)
   *
   * Uses `keyboard.type()` (real keystrokes), NEVER a JS native-setter — the two disagree on
   * multi-dot values like "1.2.3" and only the typed path is reachable by a user.
   *
   * Error-text search is scoped to: the cell's own aria-describedby/aria-errormessage targets,
   * adjacent siblings, and portal content tied to that editor. Excludes grid headers and page
   * titles. `[role="alert"]` exists on this page and is EMPTY on every rejection — the helper
   * distinguishes "no validation message" from "found unrelated text".
   */
  @step('Try editing the cell and record what happens')
  async probeEditOracle(
    row: Locator,
    field: 'overridePrice' | 'maxDiscount',
    inputValue: string,
  ): Promise<{
    committed: boolean;
    displayedValue: string | null;
    rawDisplayedValue: string | null;
    ariaInvalid: string | null;
    borderColor: string | null;
    errorText: string | null;
    saveEnabled: boolean;
    escapable: boolean;
  }> {
    // Open the cell editor — scoped to the row, not page-wide (see openCellEditor)
    const cellSel = field === 'overridePrice' ? OS.ovrCellOverridePrice : OS.ovrCellMaxDiscount;
    await row.locator(cellSel).first().click();
    const editor = row.getByRole('spinbutton');
    await editor.waitFor({ state: 'visible', timeout: 8_000 });

    // Select all existing content and type the new value using REAL keyboard input
    await this.page.keyboard.press('Control+a');
    await this.page.keyboard.type(inputValue);

    // Press Enter to attempt commit
    await this.page.keyboard.press('Enter');
    await this.page.waitForTimeout(400);

    // 1. committed? — check if the editor closed
    const editorStillVisible = await editor.isVisible().catch(() => false);
    const committed = !editorStillVisible;

    // 2. displayed value verbatim (if committed, read from the cell's display button)
    let displayedValue: string | null = null;
    let rawDisplayedValue: string | null = null;
    if (committed) {
      const cell = row.locator('td').nth(cellSel === OS.ovrCellOverridePrice
        ? CORP_PRICING_OVERRIDE.columnIndex.overridePrice
        : CORP_PRICING_OVERRIDE.columnIndex.maxDiscount);
      const disp = cell.locator('[role="button"]').first();
      await disp.waitFor({ state: 'visible', timeout: 5_000 });
      const rawText = (await disp.innerText()).replace(/\s+/g, ' ').trim() || null;
      rawDisplayedValue = rawText;
      displayedValue = rawText ? rawText.replace(/,/g, '') : null;
    }

    // 3. aria-invalid
    const ariaInvalid = committed
      ? null
      : await editor.getAttribute('aria-invalid').catch(() => null);

    // 4. computed border-color
    let borderColor: string | null = null;
    if (!committed) {
      borderColor = await editor.evaluate(
        (el) => window.getComputedStyle(el).borderColor,
      ).catch(() => null);
    }

    // 5. error text SCOPED to the editing context (excludes headers/page titles)
    let errorText: string | null = null;
    if (!committed) {
      // Check aria-describedby / aria-errormessage references first
      const describedBy = await editor.getAttribute('aria-describedby').catch(() => null);
      const errorMsgId = await editor.getAttribute('aria-errormessage').catch(() => null);

      if (describedBy) {
        const ids = describedBy.split(/\s+/);
        for (const id of ids) {
          const el = this.page.locator(`#${id}`);
          const txt = (await el.innerText().catch(() => '')).trim();
          if (txt && !txt.includes('Override') && !txt.includes('Product Group')) {
            errorText = txt;
            break;
          }
        }
      }
      if (!errorText && errorMsgId) {
        const el = this.page.locator(`#${errorMsgId}`);
        const txt = (await el.innerText().catch(() => '')).trim();
        if (txt && !txt.includes('Override') && !txt.includes('Product Group')) {
          errorText = txt;
        }
      }
      // Check adjacent siblings of the editor for error content
      if (!errorText) {
        const parent = editor.locator('..');
        const siblings = parent.locator('> *:not([role="spinbutton"])');
        const count = await siblings.count();
        for (let i = 0; i < count; i++) {
          const txt = (await siblings.nth(i).innerText().catch(() => '')).trim();
          if (txt && txt.length < 200 && !txt.includes('Override') && !txt.includes('Product Group')) {
            errorText = txt;
            break;
          }
        }
      }
      // Check role="alert" — exists on this page but is empty on every rejection
      if (!errorText) {
        const alert = this.page.locator('[role="alert"]').first();
        if ((await alert.count()) > 0) {
          const txt = (await alert.innerText().catch(() => '')).trim();
          if (txt && txt.length > 0 && !txt.includes('Override') && !txt.includes('Product Group')) {
            errorText = txt;
          }
        }
      }
    }

    // 6. Save button state
    const saveEnabled = await this.isOverrideSaveEnabled();

    // 7. THEN escapability — Escape is cleanup, never observation
    // Escapability = after Escape, can the user open a different cell's editor?
    // The old detach-based check was broken: Angular keeps rejected editor nodes attached
    // (visible, text=""), so waitFor({state:'detached'}) could never succeed — escapable
    // was effectively hardcoded false. The real signal is user-level: clicking a different
    // cell opens a working editor. (trap-decider.md, 2026-07-22)
    let escapable = true;
    if (!committed) {
      await this.page.keyboard.press('Escape');

      // Click the OTHER editable numeric cell in the same row
      const otherCellSel = field === 'overridePrice' ? OS.ovrCellMaxDiscount : OS.ovrCellOverridePrice;
      const otherCell = row.locator(otherCellSel).first();
      await otherCell.click();
      // Scope to the other cell's td column — the rejected editor stays visible
      // in the original cell, so row-scoped getByRole('spinbutton') would match
      // two elements and trigger a strict-mode violation (CHEAT-CATALOGUE #12)
      // 0-based columnIndex → 1-based nth-child
      const otherColIndex = field === 'overridePrice'
        ? CORP_PRICING_OVERRIDE.columnIndex.maxDiscount
        : CORP_PRICING_OVERRIDE.columnIndex.overridePrice;
      const otherColTd = row.locator(`td:nth-child(${otherColIndex + 1})`);
      const otherEditor = otherColTd.getByRole('spinbutton');
      try {
        await otherEditor.waitFor({ state: 'visible', timeout: 4_000 });
      } catch (err: unknown) {
        // A genuine timeout means the editor never opened — real focus trap.
        // Any other error (strict-mode violation, detached node) is a code
        // defect and must surface, not masquerade as app behaviour.
        if (err instanceof Error && err.name === 'TimeoutError') {
          escapable = false;
        } else {
          throw err;
        }
      }

      // Clean up: dismiss the other editor without committing
      if (escapable) {
        await this.page.keyboard.press('Escape');
      }
    }

    return { committed, displayedValue, rawDisplayedValue, ariaInvalid, borderColor, errorText, saveEnabled, escapable };
  }

  /** Probe the Override Price field with the edit oracle. */
  @step('Try editing Override Price and record what happens')
  async probeOverridePriceOracle(row: Locator, inputValue: string) {
    return this.probeEditOracle(row, 'overridePrice', inputValue);
  }

  /** Probe the Max Discount field with the edit oracle. */
  @step('Try editing Max Discount and record what happens')
  async probeMaxDiscountOracle(row: Locator, inputValue: string) {
    return this.probeEditOracle(row, 'maxDiscount', inputValue);
  }

  // ── NM-2272: export / grid-status / search-panel methods ──

  /**
   * Same download as `downloadOverrideExport`, but also returns the file's RAW bytes so a test can
   * inspect what the decoded string hides — the byte-order mark and the CRLF line endings.
   */
  @step('Download override export raw')
  async downloadOverrideExportRaw(): Promise<{ filename: string; requestUrl: string; bytes: Buffer; content: string; headers: string[] }> {
    const [download, request] = await Promise.all([
      this.page.waitForEvent('download', { timeout: 30_000 }),
      this.page.waitForRequest((r) => r.url().includes(CORP_PRICING_OVERRIDE.export.apiPathFragment), { timeout: 30_000 }),
      this.page.locator(OS.ovrBtnExport).first().click(),
    ]);
    const filePath = await download.path();
    if (!filePath) throw new Error('downloadOverrideExportRaw: the download did not resolve to a file path');
    const bytes = readFileSync(filePath);
    const raw = bytes.toString('utf-8');
    const content = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
    const firstLine = content.split(/\r?\n/)[0] ?? '';
    const headers = firstLine ? firstLine.split(',').map((h) => h.replace(/^"|"$/g, '').trim()) : [];
    return { filename: download.suggestedFilename(), requestUrl: request.url(), bytes, content, headers };
  }

  /**
   * Request the export directly for a given locale, reusing the page's own authenticated session.
   * The Export button always sends `en-US`, so this is the only way to exercise the other locales.
   */
  @step('Fetch export for locale')
  async fetchExportForLocale(locale: string): Promise<{ status: number; headerLine: string; dataLines: string[] }> {
    const path = `/navigator/api/location/${CORP_PRICING_OVERRIDE.export.apiPathFragment}${locale ? `?locale=${locale}` : ''}`;
    const result = await this.page.evaluate(async (url) => {
      const res = await fetch(url);
      return { status: res.status, text: await res.text() };
    }, path);
    const lines = result.text.split(/\r?\n/).filter((l) => l.length > 0);
    return { status: result.status, headerLine: lines[0] ?? '', dataLines: lines.slice(1) };
  }

  /**
   * Ask the grid's own data endpoint for one office and report what it answers. The screen swallows a
   * failure here and draws an empty grid, so the status code is the only honest signal.
   */
  @step('Fetch grid status for office')
  async fetchGridStatusForOffice(officeId: string): Promise<{ status: number; body: string }> {
    const path = `${CORP_PRICING_OVERRIDE.gridApi.pathFragment}?localOfficeId=${officeId}`;
    return this.page.evaluate(async (url) => {
      const res = await fetch(url);
      return { status: res.status, body: (await res.text()).slice(0, 300) };
    }, path);
  }

  /**
   * Click the collapse/expand control and report the search panel's label and measured size on either
   * side of the click — the only way to tell a real collapse from a label that merely flips.
   */
  @step('Toggle search panel and measure')
  async toggleSearchPanelAndMeasure(): Promise<{ labelBefore: string; labelAfter: string; sizeBefore: string; sizeAfter: string }> {
    const btn = this.page.locator(OS.ovrCollapseSearchPanel).first();
    const measure = async () => this.page.evaluate(() => {
      const el = document.getElementById('pg-ref-currency');
      const panel = el?.closest('div')?.parentElement?.parentElement ?? null;
      const r = panel?.getBoundingClientRect();
      return r ? `${Math.round(r.width)}x${Math.round(r.height)}` : 'absent';
    });
    const labelBefore = (await btn.getAttribute('aria-label')) ?? '';
    const sizeBefore = await measure();
    await btn.click();
    await this.page.waitForTimeout(600);
    return {
      labelBefore,
      labelAfter: (await this.page.locator(OS.ovrCollapseSearchPanel).first().getAttribute('aria-label')) ?? '',
      sizeBefore,
      sizeAfter: await measure(),
    };
  }

  // ── NM-2273: import methods ──

  /**
   * Read the import dialog's upload gate: whether the Upload button is disabled and the
   * "No file selected" hint is showing (both true before any file is attached).
   */
  @step('Read import upload state')
  async readImportUploadState(): Promise<{ uploadDisabled: boolean; noFileVisible: boolean }> {
    const uploadDisabled = await this.page.locator(OS.ovrImportUploadBtn).first().isDisabled();
    const noFileVisible = await this.isVisibleSafe(OS.ovrImportNoFileText);
    return { uploadDisabled, noFileVisible };
  }

  /** Attach a file to the import dialog and wait for the Upload button to enable (the attach registered). */
  @step('Attach import file')
  async attachImportFile(absPath: string): Promise<void> {
    await this.page.locator(OS.ovrImportUploadInput).first().setInputFiles(absPath);
    await expect(this.page.locator(OS.ovrImportUploadBtn).first()).toBeEnabled({ timeout: 10_000 });
  }

  /** Click the import dialog's Upload button. Does not wait — callers read the rejection alert or the commit. */
  @step('Click import upload')
  async clickImportUpload(): Promise<void> {
    await this.page.locator(OS.ovrImportUploadBtn).first().click();
  }

  /**
   * Submit an import and capture the server's PER-ROW result. The Override import is a partial-success
   * API: the POST returns HTTP 200 with a body of shape
   * `{ success, data: { successRecordCount, failureRecordCount, errors: [{ error }] } }`. A 200 alone
   * does NOT mean a row applied — a fully-invalid file still returns 200 with `failureRecordCount > 0` and
   * `successRecordCount: 0` — so callers assert on the counts / errors, not the status. Parse/format
   * rejections (non-numeric price, too-few-columns, empty/header-only) never reach the server: no POST
   * fires, `status` comes back `'no-response'`, and the caller reads the alert via `readImportAlert()`.
   * (The full tenant dump instead stalls at "Uploading… 50%", NM-2186 — use a minimal file here.)
   */
  @step('Submit import and capture result')
  async submitImportAndCaptureResult(timeout = 30_000): Promise<{
    status: number | 'no-response';
    successRecordCount: number;
    failureRecordCount: number;
    errors: string[];
  }> {
    const respP = this.page
      .waitForResponse(
        (r) => r.request().method() === 'POST' && r.url().includes(CORP_PRICING_OVERRIDE.import.apiPathFragment),
        { timeout },
      )
      .then(async (r) => {
        const body = (await r.json().catch(() => ({}))) as {
          data?: { successRecordCount?: number; failureRecordCount?: number; errors?: Array<{ error?: string }> };
        };
        const data = body.data ?? {};
        return {
          status: r.status(),
          successRecordCount: data.successRecordCount ?? 0,
          failureRecordCount: data.failureRecordCount ?? 0,
          errors: Array.isArray(data.errors) ? data.errors.map((e) => e?.error ?? '').filter(Boolean) : [],
        };
      })
      .catch(() => ({ status: 'no-response' as const, successRecordCount: 0, failureRecordCount: 0, errors: [] as string[] }));
    await this.page.locator(OS.ovrImportUploadBtn).first().click();
    return respP;
  }

  /**
   * Attach a file to the import dialog WITHOUT waiting for Upload to enable. Used for the file-type gate:
   * a non-`.csv` file leaves Upload disabled with an "Unsupported file type" message, so `attachImportFile`'s
   * enable-wait would (correctly) time out. The caller asserts the disabled state via `readImportUploadState()`.
   */
  @step('Attach import file raw')
  async attachImportFileRaw(absPath: string): Promise<void> {
    await this.page.locator(OS.ovrImportUploadInput).first().setInputFiles(absPath);
  }

  /** Read the target row's Mod Date + Updated By (for asserting an import stamped them). */
  @step('Read row meta')
  async readRowMeta(row: Locator): Promise<{ modDate: string; updatedBy: string }> {
    const cells = row.locator('td');
    return {
      modDate: (await cells.nth(CORP_PRICING_OVERRIDE.columnIndex.modDate).innerText().catch(() => '')).replace(/\s+/g, ' ').trim(),
      updatedBy: (await cells.nth(CORP_PRICING_OVERRIDE.columnIndex.updatedBy).innerText().catch(() => '')).replace(/\s+/g, ' ').trim(),
    };
  }

  /**
   * Read the import rejection message. A rejected upload surfaces as an on-screen alert and leaves the
   * dialog open. Returns the trimmed alert text, or '' if none appears within the timeout.
   */
  @step('Read import alert')
  async readImportAlert(timeout = 15_000): Promise<string> {
    const alert = this.page.locator(OS.ovrImportAlert).first();
    try {
      await alert.waitFor({ state: 'visible', timeout });
    } catch {
      return '';
    }
    return (await alert.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  /**
   * Read the imported Override Price back after a commit. A minimal import returns a clean response, so
   * the value is normally present on the first reload; this reload-and-re-read is wrapped in a brief
   * bounded retry to absorb any read-after-write lag on the shared server (each reload's network latency
   * is the natural spacing — no fixed sleep). Returns the last value read, so a timeout surfaces a clear
   * value diff rather than an opaque wait error.
   */
  @step('Await imported override price')
  async awaitImportedOverridePrice(needle: string, productGroupName: string, expected: string, timeoutMs = 45_000): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    let last = '';
    do {
      await this.reloadAndReselect(needle);
      const row = await this.findRowByProductGroup(productGroupName);
      if (row) {
        last = await this.readOverridePrice(row);
        if (parseFloat(last) === parseFloat(expected)) return last;
      }
    } while (Date.now() < deadline);
    return last;
  }
}
