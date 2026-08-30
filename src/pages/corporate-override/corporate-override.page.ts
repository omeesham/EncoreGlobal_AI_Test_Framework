// Product Group Override screen. The grid is location-gated (empty until a location is picked) and its
// numeric cells are React-controlled spinbuttons: `.fill()` never commits, so use setReactInput + Enter.
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
    // Wait for Radix to flip aria-selected rather than sleeping.
    await this.page
      .locator(`[role="tab"][aria-selected="true"]:has-text("${tab}")`)
      .first()
      .waitFor({ state: 'visible', timeout: 10_000 });
    await this.waitForAngularStable();
  }

  @step('Open location picker')
  async openLocationPicker(): Promise<void> {
    await this.page.locator(OS.ovrChangeLocationTrigger).first().click();
    await this.page.locator(OS.ovrLocationPickerSearch).first().waitFor({ state: 'visible', timeout: 10_000 });
    // The picker paints empty skeleton rows instantly, so row visibility is not enough — poll for
    // non-empty row text; the real list can take ~23s to arrive.
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
    // The search input can mount before it becomes editable; a fill that races that window only
    // clears on a fresh re-open, hence the bounded retry.
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

  // React-controlled and debounced: `.fill()` does not commit and waitForAngularStable is a no-op here,
  // so a native setter plus a one-shot settle is what lets the caller read a stable row count.
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

  // Waits for display mode so a read never races a still-open editor (which yields "" → NaN).
  // Thousands separators are stripped so the result parses as a number.
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

  /** Callers must commit the returned editor with setReactInput + Enter; `.fill()` does not commit. */
  private async openCellEditor(row: Locator, cellSel: string): Promise<Locator> {
    await row.locator(cellSel).first().click();
    // Row-scoped, not page-wide, so a stale editor left in another row by the two-editor defect
    // cannot silently resolve as ours.
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

  // True when the value committed, false when the field rejected it (the editor stays open; >100 is capped).
  // Escapes on rejection to leave a clean cell; never clicks Save.
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

  /** Returns what the type=number input retains without committing — an invalid string coerces to "". */
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

  /** Save → "Save Changes" alertdialog → POST → success toast; the dialog can lag on this heavy page. */
  @step('Save and confirm')
  async saveAndConfirm(): Promise<void> {
    await this.page.locator(OS.ovrBtnSave).first().click();
    // getByRole('alertdialog') does not match this portal-nested dialog and its buttons have no
    // accessible name, so use the CSS selector with a text-anchored Save.
    const dlg = this.page.locator(OS.ovrSaveDialog).first();
    await dlg.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => { /* direct-save fallback */ });
    if (await dlg.isVisible().catch(() => false)) {
      await this.page.locator(OS.ovrSaveDialogConfirm).first().click();
    }
    // Warn rather than throw on a missing toast: the caller's reload + re-read is the real proof of
    // persistence, but a missing toast still signals a save that may not have completed cleanly.
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

  // Restores the fixture row's baseline over at most 3 reload cycles, then a final verify that THROWS
  // if it could not restore, so silent drift into the next test surfaces as a failure.
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
    // The picker search is server-backed, so wait for the matching row before counting; a genuine
    // zero-match is still handled by the count below.
    await rows.first().waitFor({ state: 'visible', timeout: 10_000 }).catch(() => { /* best-effort: zero rows is itself a valid observation */ });
    const rowsMatching = await rows.count();
    await rows.first().locator(OS.ovrLocationPickerRowCheckbox).first().check().catch(() => { /* row may need a plain click */ });
    // A row that genuinely never enables Select resolves to false at the timeout.
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

  // Column visibility is a server-persisted preference, so a test that hides a column must restore it.
  // Throws if the baseline cannot be restored rather than leaving a column hidden for the next test.
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

  /** Requires an already-open Change Local Office picker dialog. */
  @step('Search local office')
  async searchLocalOffice(query: string): Promise<void> {
    // Wait for a matching row rather than a response promise, which could capture a stale debounced POST.
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

  /** Presence check that avoids depending on exact row counts across data states. */
  @step('Picker has row containing')
  async pickerHasRowContaining(text: string): Promise<boolean> {
    return (await this.page.locator(OS.ovrLocationPickerRowAny, { hasText: text }).count()) > 0;
  }

  /** Compared against the total row count to prove the search filter left no non-matching rows. */
  @step('Get picker row count containing')
  async getPickerRowCountContaining(text: string): Promise<number> {
    return this.page.locator(OS.ovrLocationPickerRowAny, { hasText: text }).count();
  }

  /** The Active filter is the first [role="checkbox"] in the dialog, above the search box and rows. */
  @step('Get picker active checkbox state')
  async getPickerActiveCheckboxState(): Promise<boolean> {
    return (await this.page.locator(OS.ovrLocationPickerActiveCheckbox).first().getAttribute('data-state')) === 'checked';
  }

  // Known issue: this toggle fires no location-lookup request and leaves the location set unchanged.
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

  // Probes for the location-lookup POST within a 3s window; no DOM fallback, so a missing POST is
  // reported as postFired:false rather than papered over.
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

  // Currently returns postFired:false — the activeOnly flag has no server effect; it flips to true
  // if the app is ever fixed to make the call.
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

  /** Sorting on this grid is a header dropdown menu, not a header-click toggle. */
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

  /** Reads the first visible row's cell at a 0-based column index, for first-cell sort oracles. */
  @step('Get first row cell text')
  async getFirstRowCellText(colIndex: number): Promise<string> {
    return (await this.page.locator(OS.ovrGridRowAny).first().locator('td').nth(colIndex).innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  /** Reads every visible row's cell at a 0-based column index, for monotonic-order sort checks. */
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

  // Matched by numeric text: the currency combobox sitting next to it never shows a number.
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

  // The guard fires only on in-app link navigation — a direct URL change raises the browser's own
  // leave-page prompt instead, so this always goes via the Home link.
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

  /** The destination is a heavy server-rendered page; a 15s navigation budget flaked on first paint. */
  @step('Discard and leave')
  async discardAndLeave(): Promise<void> {
    await this.page.locator(OS.ovrUnsavedDialogDiscard).first().click();
    await this.page.waitForURL(/\/home/, { timeout: 30_000 });
  }

  // --- Keyboard access to editable cells (NM-2271) ---

  /** Keyboard path into the editor: the display cell is focusable and Enter reveals the spinbutton. */
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

  // The picker panel mounts before its rows load, so a count taken too early reads 0 on a healthy
  // picker — hence the bounded wait for the first row.
  @step('Get picker draggable row count')
  async getPickerDraggableRowCount(): Promise<number> {
    await this.page.locator(OS.ovrPickerDraggableRow).first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => { /* a genuinely empty picker is a valid observation — the caller asserts the count */ });
    return this.page.locator(OS.ovrPickerDraggableRow).count();
  }

  // Stages a new override row client-side; no request fires until Save.
  // Returns the dragged row's text so the caller can identify the staged row.
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
  // Labor uses the identical cell/dialog mechanics; these only add the mandatory tab switch.

  /** Equipment `reloadAndReselect` plus the Labor tab switch. */
  @step('Reload and reselect labor')
  async reloadAndReselectLabor(needle: string, office: string = CORPORATE_PRICING_COMMON.office): Promise<void> {
    await this.gotoOverride(office);
    await this.selectLocation(needle);
    await this.switchOverrideTab('Labor');
    await this.waitForGridRows();
  }

  /** Set the Override Price on a Labor-tab row. */
  @step('Set labor override price')
  async setLaborOverridePrice(row: Locator, value: string): Promise<void> {
    await this.editNumericCell(row, OS.ovrCellOverridePrice, value);
  }

  /** Set the Max Discount on a Labor-tab row. */
  @step('Set labor max discount')
  async setLaborMaxDiscount(row: Locator, value: string): Promise<void> {
    await this.editNumericCell(row, OS.ovrCellMaxDiscount, value);
  }

  /** Toggle the Active checkbox on a Labor-tab row. */
  @step('Toggle labor active')
  async toggleLaborActive(row: Locator): Promise<void> {
    await row.locator(OS.ovrCellActiveCheckbox).first().click();
  }

  /** `ensureDefaultState` for Labor — a reload always lands on Equipment, so each cycle re-switches. */
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

  // Ctrl+A then typing nothing is a no-op and leaves the old value; only an explicit Delete before
  // Enter commits the empty value and returns the cell to its em-dash baseline.
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

  // Every signal must be captured before the Escape, which is cleanup and never an observation.
  // Types real keystrokes, never the native setter — the two disagree on multi-dot values like "1.2.3".
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
    // Row-scoped, not page-wide (see openCellEditor)
    const cellSel = field === 'overridePrice' ? OS.ovrCellOverridePrice : OS.ovrCellMaxDiscount;
    await row.locator(cellSel).first().click();
    const editor = row.getByRole('spinbutton');
    await editor.waitFor({ state: 'visible', timeout: 8_000 });

    await this.page.keyboard.press('Control+a');
    await this.page.keyboard.type(inputValue);

    await this.page.keyboard.press('Enter');
    await this.page.waitForTimeout(400);

    // A closed editor is the commit signal.
    const editorStillVisible = await editor.isVisible().catch(() => false);
    const committed = !editorStillVisible;

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

    // Escapability is measured user-level: after Escape, does clicking another cell open a working
    // editor? A detach-based check cannot work — rejected editor nodes stay attached and visible.
    let escapable = true;
    if (!committed) {
      await this.page.keyboard.press('Escape');

      const otherCellSel = field === 'overridePrice' ? OS.ovrCellMaxDiscount : OS.ovrCellOverridePrice;
      const otherCell = row.locator(otherCellSel).first();
      await otherCell.click();
      // Scoped to the other cell's td: the rejected editor stays visible, so a row-scoped
      // spinbutton lookup would match two elements. 0-based columnIndex → 1-based nth-child.
      const otherColIndex = field === 'overridePrice'
        ? CORP_PRICING_OVERRIDE.columnIndex.maxDiscount
        : CORP_PRICING_OVERRIDE.columnIndex.overridePrice;
      const otherColTd = row.locator(`td:nth-child(${otherColIndex + 1})`);
      const otherEditor = otherColTd.getByRole('spinbutton');
      try {
        await otherEditor.waitFor({ state: 'visible', timeout: 4_000 });
      } catch (err: unknown) {
        // A timeout means a real focus trap; any other error is a code defect and must surface
        // rather than masquerade as app behaviour.
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

  /** Also returns raw bytes, so a test can inspect what decoding hides: the BOM and line endings. */
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

  /** The Export button always sends en-US, so a direct request is the only way to reach other locales. */
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

  /** The screen swallows a grid-API failure and draws an empty grid, so status is the only honest signal. */
  @step('Fetch grid status for office')
  async fetchGridStatusForOffice(officeId: string): Promise<{ status: number; body: string }> {
    const path = `${CORP_PRICING_OVERRIDE.gridApi.pathFragment}?localOfficeId=${officeId}`;
    return this.page.evaluate(async (url) => {
      const res = await fetch(url);
      return { status: res.status, body: (await res.text()).slice(0, 300) };
    }, path);
  }

  /** Measures size as well as label, since only that separates a real collapse from a label that flips. */
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

  /** Both flags are true before any file is attached. */
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

  // Partial-success API: assert on the counts/errors, never the 200 status. Parse-level rejections
  // never reach the server — status is 'no-response' and the message is in readImportAlert().
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

  // Skips the enable-wait for the file-type gate: a non-.csv leaves Upload disabled, so
  // attachImportFile would correctly time out.
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

  /** A rejected upload leaves the dialog open; returns '' when no alert appears within the timeout. */
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

  // Bounded reload retry absorbs read-after-write lag on the shared server. Returns the last value
  // read so a timeout surfaces a value diff rather than an opaque wait error.
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
