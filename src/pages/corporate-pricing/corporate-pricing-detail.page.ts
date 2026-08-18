import { expect, type Locator, type Page } from '@playwright/test';
import { CorporatePricingBasePage } from './corporate-pricing.page';
import type { IConfig } from '../../types';
import { CorporatePricingSelectors as S } from '../../selectors/corporate-pricing';
import { DETAIL_GRID_COLS } from '../../selectors/corporate-pricing/pricing-detail';
import { DETAIL } from '../../data/corporate-pricing/detail';

type DetailAnchor = { id: string; name: string; basePrice: string };

export class CorporatePricingDetailPage extends CorporatePricingBasePage {
  constructor(page: Page, config?: IConfig) {
    super(page, config);
  }

  async open(pricebookId: string = DETAIL.pricebookGuid, office: string = DETAIL.office): Promise<void> {
    await this.gotoDetails(office, pricebookId);
    await this.openDetailTab();
  }

  async openDetailTab(): Promise<void> {
    await this.switchTab('Pricing Detail');
    await this.page.locator(S.colDetailProductGroupName).first().waitFor({ state: 'visible', timeout: 25_000 });
    await this.waitForAngularStable();
  }

  async isDetailTabActive(): Promise<boolean> {
    return this.isVisibleSafe(S.colDetailProductGroupName);
  }

  async getGridHeaders(): Promise<string[]> {
    return this.readAllTexts(`${S.tblDetailGrid} th`);
  }

  async getProductGroupRowCount(): Promise<number> {
    return this.page.locator(`${S.tblDetailGrid} tr:has(input)`).count();
  }

  private gridRow(name: string): Locator {
    return this.page.locator(`${S.tblDetailGrid} tr`, { hasText: name }).first();
  }

  async getCellText(name: string, col: keyof typeof DETAIL_GRID_COLS): Promise<string> {
    const cell = this.gridRow(name).locator('td').nth(DETAIL_GRID_COLS[col]);
    return (await cell.innerText()).replace(/\s+/g, ' ').trim();
  }

  private newPriceInput(name: string): Locator {
    return this.gridRow(name).locator('td').nth(DETAIL_GRID_COLS.newPrice).locator('input').first();
  }

  private maxDiscountInput(name: string): Locator {
    return this.gridRow(name).locator('td').nth(DETAIL_GRID_COLS.maxDiscount).locator('input').first();
  }

  async getNewPrice(name: string): Promise<string> {
    return (await this.newPriceInput(name).inputValue()).trim();
  }

  async getMaxDiscount(name: string): Promise<string> {
    return (await this.maxDiscountInput(name).inputValue()).trim();
  }

  async priceIsReadOnly(name: string): Promise<boolean> {
    const cell = this.gridRow(name).locator('td').nth(DETAIL_GRID_COLS.price);
    return (await cell.locator('input').count()) === 0;
  }

  async rowHasAddRemoveAffordance(name: string): Promise<boolean> {
    return (await this.gridRow(name).locator('button').count()) > 0;
  }

  // CELL EDITS (real keystrokes — fill() is unreliable for dirty-tracking)

  async setNewPrice(name: string, value: string): Promise<void> {
    const inp = this.newPriceInput(name);
    await inp.scrollIntoViewIfNeeded();
    await inp.click();
    await inp.press('Control+a');
    await inp.press('Delete');
    await inp.pressSequentially(value, { delay: 50 });
    await inp.press('Tab');
  }

  async setMaxDiscount(name: string, value: string): Promise<void> {
    const inp = this.maxDiscountInput(name);
    await inp.scrollIntoViewIfNeeded();
    await inp.click();
    await inp.press('Control+a');
    await inp.press('Delete');
    await inp.pressSequentially(value, { delay: 50 });
    await inp.press('Tab');
  }

  async getSourceItemCount(): Promise<number> {
    return this.page.locator(S.itemDraggableAny).count();
  }

  async hasSourceFilter(): Promise<boolean> {
    return (await this.page.locator(S.txtSourceFilter).count()) > 0;
  }

  /**
   * Management-mode defensive probe: act on a source-list item and report whether the grid grew.
   * `mode` 'single' = single-click (select/display, no add), 'double' = double-click (must NOT add).
   * Returns { before, after } data-row counts so the caller asserts no-add (before === after).
   */
  async attemptSourceAdd(mode: 'single' | 'double', index = 0): Promise<{ before: number; after: number }> {
    const before = await this.getProductGroupRowCount();
    const item = this.page.locator(S.itemDraggableAny).nth(index);
    await item.scrollIntoViewIfNeeded();
    if (mode === 'double') await item.dblclick();
    else await item.click();
    await this.waitForAngularStable(2_000).catch(() => { /* best-effort settle */ });
    const after = await this.getProductGroupRowCount();
    return { before, after };
  }

  /**
   * Management-mode defensive probe: attempt a drag of a source item onto the grid; report grid growth.
   * Uses the full pointer sequence (move → down → move → up) — never `.dragTo()`, which often never
   * fires the drag chain and would give a false "did not add". The create-mode positive control
   * (`CorporatePricingNewPricebookPage.dragProductGroupByName`) proves the SAME primitive DOES add when
   * adding is allowed, so a no-grow here is genuine management-mode behavior, not a dead primitive.
   * Returns { before, after } row counts.
   */
  async attemptDragAdd(index = 0): Promise<{ before: number; after: number }> {
    const before = await this.getProductGroupRowCount();
    const item = this.page.locator(S.itemDraggableAny).nth(index);
    await this.dragSourceToGrid(item, this.page.locator(S.tblDetailGrid).first())
      .catch(() => { /* drop may be rejected in management mode — that is the point */ });
    await this.waitForAngularStable(2_000).catch(() => { /* best-effort */ });
    const after = await this.getProductGroupRowCount();
    return { before, after };
  }

  async getNewPriceAriaInvalid(name: string): Promise<string | null> {
    return this.newPriceInput(name).getAttribute('aria-invalid');
  }

  async getMaxDiscountAriaInvalid(name: string): Promise<string | null> {
    return this.maxDiscountInput(name).getAttribute('aria-invalid');
  }

  async clearNewPrice(name: string): Promise<void> {
    const inp = this.newPriceInput(name);
    await inp.scrollIntoViewIfNeeded();
    await inp.click();
    await inp.press('Control+a');
    await inp.press('Delete');
    await inp.press('Tab');
  }

  async getMaxDiscountAfterFocus(name: string): Promise<string> {
    const inp = this.maxDiscountInput(name);
    await inp.scrollIntoViewIfNeeded();
    await inp.click();
    return (await inp.inputValue()).trim();
  }

  async clearMaxDiscount(name: string): Promise<void> {
    const inp = this.maxDiscountInput(name);
    await inp.scrollIntoViewIfNeeded();
    await inp.click();
    await inp.press('Control+a');
    await inp.press('Delete');
    await inp.press('Tab');
  }

  // SURFACE PROBES — pagination + sort presence (the Detail grid renders every row
  // at once; it exposes NO page-size selector, NO page-navigation buttons, and its
  // headers are not sort triggers — these probes assert that observed reality).

  async getPaginationNavLabels(): Promise<string[]> {
    const labels = await this.page.locator('button[aria-label]').evaluateAll((els) =>
      els.map((e) => e.getAttribute('aria-label') || '').filter((a) => /first page|previous page|next page|last page/i.test(a)),
    );
    return labels;
  }

  async hasPageSizeControl(): Promise<boolean> {
    return (await this.page.locator('[role="combobox"]').filter({ hasText: /^\s*\d+\s*$/ }).count()) > 0;
  }

  async headerHasSortButton(headerText: string): Promise<boolean> {
    const th = this.page.locator(`${S.tblDetailGrid} th`, { hasText: headerText }).first();
    return (await th.locator('button').count()) > 0;
  }

  async getHeaderAriaSort(headerText: string): Promise<string | null> {
    return this.page.locator(`${S.tblDetailGrid} th`, { hasText: headerText }).first().getAttribute('aria-sort');
  }

  get saveChangesDialog(): Locator {
    return this.page.getByRole('alertdialog');
  }

  async clickSaveButton(): Promise<void> {
    await this.page.locator('button:text-is("Save")').first().click();
  }

  async confirmSaveChangesDialog(): Promise<void> {
    await this.saveChangesDialog.getByRole('button', { name: /^(save|ok)$/i }).first().click();
  }

  /**
   * Click Save (defensive — confirm the "Save Changes" alertdialog), then best-effort wait for
   * Save to disable (commit signal). THROWS if Save is disabled at call time so a silent no-op
   * surfaces as a failure (save-success ≠ pristine; reload + re-read is load-bearing).
   */
  async saveAndConfirm(): Promise<void> {
    await this.clickSaveButtonOrThrow('grid not dirty');
    await this.confirmSaveDialogIfPresent(3_000);
    await expect(this.page.locator(S.btnSaveDetails).first())
      .toBeDisabled({ timeout: 15_000 })
      .catch(() => { /* app may leave it enabled; reload+re-read is the load-bearing check */ });
    await this.waitForAngularStable();
  }

  /**
   * Restore the detailFixture's two mutation anchors to baseline: anchorA/anchorB Price = base, no
   * discount. The New-Price override is sticky (it becomes the Price), so reverting requires writing
   * New Price = basePrice; the form is dirtied reliably via the Max-Discount lever (= '0') in the
   * SAME batch save, which also commits the New-Price reverts. Bounded retry (max 3) over the whole
   * cycle because save-success alone does not prove the restore landed.
   */
  async ensureDefaultState(
    anchors: DetailAnchor[] = [DETAIL.anchorA, DETAIL.anchorB],
  ): Promise<void> {
    const maxAttempts = 3;
    const isClean = async (a: DetailAnchor): Promise<boolean> => {
      const price = await this.getCellText(a.name, 'price');
      const md = await this.getMaxDiscount(a.name);
      return price === a.basePrice && /^0(\.0+)?\s*%?$/.test(md.replace(/\s/g, ''));
    };

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await this.open(); // single heavy page-open per attempt
      const dirtyAnchors: DetailAnchor[] = [];
      for (const a of anchors) {
        if (!(await isClean(a))) dirtyAnchors.push(a);
      }
      if (dirtyAnchors.length === 0) return; // already clean

      for (const a of dirtyAnchors) {
        await this.setNewPrice(a.name, a.basePrice); // revert override to base
        await this.setMaxDiscount(a.name, '0'); // reliable dirty lever + no-discount
      }
      await this.saveAndConfirm();

      // Verify IN-PLACE — after Save the grid re-renders the persisted state (avoids a 2nd heavy open).
      let stillDirty = false;
      for (const a of anchors) {
        if (!(await isClean(a))) { stillDirty = true; break; }
      }
      if (!stillDirty) return;
    }
    throw new Error(
      `ensureDefaultState: detailFixture anchors not restored to baseline after ${maxAttempts} attempts — manual cleanup of pricebook 2021-PB6 may be required.`,
    );
  }
}
