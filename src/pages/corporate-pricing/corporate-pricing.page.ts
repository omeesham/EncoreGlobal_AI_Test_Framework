// Shared Corporate Pricing base: navigation + grid/tab/save primitives.
// Selectors are used via `this.page.locator(...)`, not `getElement()` — CP keys are excluded from ALL_SELECTORS.
import type { Page, Locator } from '@playwright/test';
import { BasePage } from '../base.page';
import type { IConfig } from '../../types';
import { CorporatePricingSelectors as S } from '../../selectors/corporate-pricing';
import { CORPORATE_PRICING_ROUTES, CORPORATE_PRICING_COMMON } from '../../data/corporate-pricing/common';
import { Log } from '../../utils/logger';
import { step } from '../../fixtures/step-decorator';

export class CorporatePricingBasePage extends BasePage {
  constructor(page: Page, config?: IConfig) {
    super(page, config);
    // `constructor.name` resolves to the concrete subclass, so this one log covers every screen.
    Log.info(`${this.constructor.name} initialized`);
  }

  private buildUrl(pathSuffix: string): string {
    const base = (this.config?.base_url ?? '').replace(/\/+$/, '');
    return `${base}${pathSuffix}`;
  }

  @step('Goto search')
  async gotoSearch(office: string = CORPORATE_PRICING_COMMON.office): Promise<void> {
    await this.navigateTo(this.buildUrl(CORPORATE_PRICING_ROUTES.searchPath(office)));
    await this.waitForAngularStable();
  }

  @step('Goto details')
  async gotoDetails(office: string, pricebookId: string): Promise<void> {
    await this.navigateTo(this.buildUrl(CORPORATE_PRICING_ROUTES.detailsPath(office, pricebookId)));
    await this.waitForAngularStable();
  }

  @step('Goto new Pricebook')
  async gotoNewPricebook(office: string, type: 'equipment' | 'labor'): Promise<void> {
    await this.navigateTo(this.buildUrl(CORPORATE_PRICING_ROUTES.newPricebookPath(office, type)));
    await this.waitForAngularStable();
  }

  // Tabs are plain text buttons with no aria-selected, so there is nothing to wait on but stability.
  // Not `navigateToSubTab` — that one is `/settings/location`-specific.
  @step('Switch tab')
  async switchTab(tab: 'Pricing Strategy' | 'Pricing Detail'): Promise<void> {
    const sel = tab === 'Pricing Strategy' ? S.tabPricingStrategy : S.tabPricingDetail;
    await this.page.locator(sel).first().click();
    await this.waitForAngularStable();
  }

  // The grids are virtualized — only rendered rows exist in the DOM, so a `needle` search scrolls
  // (bounded) until a matching row renders.
  @step('Read grid rows by content')
  async readGridRowsByContent(needle?: string, maxScrolls = 40): Promise<string[]> {
    const collect = async (): Promise<string[]> => {
      const rows = this.page.locator(S.rowGridAny);
      const count = await rows.count();
      const out: string[] = [];
      for (let i = 0; i < count; i++) {
        const txt = (await rows.nth(i).innerText()).replace(/\s+/g, ' ').trim();
        if (txt) out.push(txt);
      }
      return out;
    };

    if (!needle) return collect();

    for (let s = 0; s < maxScrolls; s++) {
      const visible = await collect();
      const hits = visible.filter((r) => r.includes(needle));
      if (hits.length > 0) return hits;
      await this.page.mouse.wheel(0, 600);
      await this.waitForAngularStable(2_000).catch(() => { /* best-effort during virtual scroll */ });
    }
    return [];
  }

  @step('Find grid row by content')
  async findGridRowByContent(needle: string, maxScrolls = 40): Promise<Locator | null> {
    for (let s = 0; s < maxScrolls; s++) {
      const row = this.page.locator(S.rowGridAny, { hasText: needle }).first();
      if ((await row.count()) > 0 && (await row.isVisible().catch(() => false))) return row;
      await this.page.mouse.wheel(0, 600);
      await this.waitForAngularStable(2_000).catch(() => { /* best-effort */ });
    }
    return null;
  }

  @step('Get search item count')
  async getSearchItemCount(): Promise<number | null> {
    const el = this.page.locator(S.lblItemsFound).first();
    if ((await el.count()) === 0) return null;
    const m = (await el.innerText()).match(/([\d,]+)\s+items found/);
    return m && m[1] ? parseInt(m[1].replace(/,/g, ''), 10) : null;
  }

  /** The "Save Changes" dialog is treated as optional so this is safe on direct-save screens too. */
  @step('Click save')
  async clickSave(): Promise<void> {
    await this.page.locator(S.btnSaveDetails).first().click();
    await this.confirmSaveDialogIfPresent(2_000);
    await this.waitForAngularStable();
  }

  @step('Is save enabled')
  async isSaveEnabled(): Promise<boolean> {
    return this.page.locator(S.btnSaveDetails).first().isEnabled().catch(() => false);
  }

  protected async clickSaveButtonOrThrow(reason: string): Promise<void> {
    const save = this.page.locator(S.btnSaveDetails).first();
    if (!(await save.isEnabled().catch(() => false))) {
      throw new Error(`saveAndConfirm: Save is disabled (${reason} — nothing to commit)`);
    }
    await save.click();
  }

  /** No-op when no alertdialog appears — some screens save directly. */
  protected async confirmSaveDialogIfPresent(timeout = 2_500): Promise<void> {
    const dlg = this.page.getByRole('alertdialog');
    if (await dlg.isVisible({ timeout }).catch(() => false)) {
      await dlg.getByRole('button', { name: /^(save|ok)$/i }).first().click();
    }
  }

  protected async isVisibleSafe(target: string | Locator): Promise<boolean> {
    const loc = typeof target === 'string' ? this.page.locator(target) : target;
    return loc.first().isVisible().catch(() => false);
  }

  protected async readAllTexts(target: string | Locator): Promise<string[]> {
    const loc = typeof target === 'string' ? this.page.locator(target) : target;
    const n = await loc.count();
    const out: string[] = [];
    for (let i = 0; i < n; i++) out.push((await loc.nth(i).innerText()).replace(/\s+/g, ' ').trim());
    return out.filter(Boolean);
  }

  // The load-bearing fill primitive for this module: `.fill()`/`pressSequentially` set the visible
  // value but do NOT commit React state here, so use the native value-setter + input/change events.
  protected async setReactInput(target: string | Locator, value: string): Promise<void> {
    const loc = typeof target === 'string' ? this.page.locator(target).first() : target.first();
    await loc.evaluate((el, val) => {
      const input = el as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, val as string);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
  }

  // Full pointer sequence, not `.dragTo()` — the latter frequently never fires the drag-and-drop
  // event chain on these pointer-driven lists.
  protected async dragSourceToGrid(source: Locator, target: Locator, steps = 8): Promise<void> {
    await source.scrollIntoViewIfNeeded();
    const sb = await source.boundingBox();
    const tb = await target.boundingBox();
    if (!sb || !tb) throw new Error('dragSourceToGrid: source or target has no bounding box');
    const tx = tb.x + tb.width / 2;
    const ty = tb.y + Math.min(tb.height / 2, 80);
    await this.page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
    await this.page.mouse.down();
    await this.page.mouse.move(tx, ty, { steps });
    await this.page.mouse.move(tx, ty + 6, { steps: 3 }); // settle inside the drop zone
    await this.page.mouse.up();
  }
}
