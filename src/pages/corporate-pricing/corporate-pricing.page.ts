/**
 * Corporate Pricing — shared BASE page object.
 *
 * `CorporatePricingBasePage extends BasePage` (the repo has NO `*.base.page.ts` convention;
 * per-module bases use ordinary `.page.ts` filenames, e.g. `local-office-settings.page.ts`).
 * The Search / Strategy / Detail page objects extend THIS class and add their own page fixtures.
 * This base ships only the shared navigation + grid/tab/save primitives.
 *
 * Selector strategy: text/role/grid-header/content-anchored. Corporate Pricing selectors are
 * EXCLUDED from `ALL_SELECTORS` (generic keys collide with Location Settings — same precedent
 * as Local Office), so this class references `CorporatePricingSelectors.*` DIRECTLY via
 * `this.page.locator(...)`, NOT via BasePage's `getElement()` (which resolves through ALL_SELECTORS).
 */
import type { Page, Locator } from '@playwright/test';
import { BasePage } from '../base.page';
import type { IConfig } from '../../types';
import { CorporatePricingSelectors as S } from '../../selectors/corporate-pricing';
import { CORPORATE_PRICING_ROUTES, CORPORATE_PRICING_COMMON } from '../../data/corporate-pricing/common';
import { Log } from '../../utils/logger';

export class CorporatePricingBasePage extends BasePage {
  constructor(page: Page, config?: IConfig) {
    super(page, config);
    // One init log for every screen (`constructor.name` resolves to the concrete subclass, so a
    // single base-class log covers Search/Strategy/Detail without per-subclass duplication).
    Log.info(`${this.constructor.name} initialized`);
  }

  private buildUrl(pathSuffix: string): string {
    const base = (this.config?.base_url ?? '').replace(/\/+$/, '');
    return `${base}${pathSuffix}`;
  }

  async gotoSearch(office: string = CORPORATE_PRICING_COMMON.office): Promise<void> {
    await this.navigateTo(this.buildUrl(CORPORATE_PRICING_ROUTES.searchPath(office)));
    await this.waitForAngularStable();
  }

  async gotoDetails(office: string, pricebookId: string): Promise<void> {
    await this.navigateTo(this.buildUrl(CORPORATE_PRICING_ROUTES.detailsPath(office, pricebookId)));
    await this.waitForAngularStable();
  }

  async gotoNewPricebook(office: string, type: 'equipment' | 'labor'): Promise<void> {
    await this.navigateTo(this.buildUrl(CORPORATE_PRICING_ROUTES.newPricebookPath(office, type)));
    await this.waitForAngularStable();
  }

  /**
   * Switch Details sub-tab. NOT `navigateToSubTab` (that is `/settings/location`-specific).
   * Tabs are plain buttons with text; aria-selected was not exposed on the live DOM, so this
   * clicks + waits for Angular stability. The Strategy/Detail pages add a stronger active-tab guard if needed.
   */
  async switchTab(tab: 'Pricing Strategy' | 'Pricing Detail'): Promise<void> {
    const sel = tab === 'Pricing Strategy' ? S.tabPricingStrategy : S.tabPricingDetail;
    await this.page.locator(sel).first().click();
    await this.waitForAngularStable();
  }

  /**
   * Read the currently-RENDERED grid rows' text (content-anchored, virtualization-aware).
   * The Search grid (591 rows) and Pricing Detail grid are virtualized — only visible rows exist
   * in the DOM. With `needle`, scrolls (bounded) until a row containing it renders, then returns
   * the matching rows; without `needle`, returns all currently-visible rows (content-anchored —
   * never index-based row lookup).
   */
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

  async findGridRowByContent(needle: string, maxScrolls = 40): Promise<Locator | null> {
    for (let s = 0; s < maxScrolls; s++) {
      const row = this.page.locator(S.rowGridAny, { hasText: needle }).first();
      if ((await row.count()) > 0 && (await row.isVisible().catch(() => false))) return row;
      await this.page.mouse.wheel(0, 600);
      await this.waitForAngularStable(2_000).catch(() => { /* best-effort */ });
    }
    return null;
  }

  async getSearchItemCount(): Promise<number | null> {
    const el = this.page.locator(S.lblItemsFound).first();
    if ((await el.count()) === 0) return null;
    const m = (await el.innerText()).match(/([\d,]+)\s+items found/);
    return m && m[1] ? parseInt(m[1].replace(/,/g, ''), 10) : null;
  }

  /**
   * Click the page-level Save (Details) — DEFENSIVE: the confirm mechanism has not yet been
   * exercised by a mutation. Clicks Save; if a "Save Changes" alertdialog appears, confirms it;
   * otherwise proceeds (direct save). The Strategy/Detail pages tighten via `saveAndConfirm`.
   */
  async clickSave(): Promise<void> {
    await this.page.locator(S.btnSaveDetails).first().click();
    await this.confirmSaveDialogIfPresent(2_000);
    await this.waitForAngularStable();
  }

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

  /**
   * Confirm the optional "Save Changes" alertdialog if it appears (defensive — the Details Save is
   * dialog-gated, but the dialog is treated as optional so the helper is safe on direct-save
   * screens). Clicks the dialog's Save/OK button when present.
   */
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

  /**
   * Set a React-controlled `<input>` via the native value-setter + input/change events — the
   * canonical React-controlled-input update (what React Testing Library does). Playwright `.fill()`
   * / `pressSequentially` set the visible value but do NOT commit React state on this module's
   * controlled inputs (proven on both the Search filters and the New Pricebook header — Save stays
   * disabled / the query never updates), so this is the load-bearing fill primitive for Corporate
   * Pricing. The module renders in light DOM (create page) or pierceable shadow (others) — Playwright
   * `locator.evaluate` resolves either. Pass the first match's selector or a pre-scoped Locator.
   */
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

  /**
   * Drag a source item onto a target via the FULL pointer sequence
   * (move → down → multi-step move → settle move → up). Playwright's `.dragTo()` frequently never
   * fires the drag-and-drop event chain on this kind of pointer-driven list, so the only reliable
   * primitive — for proving a drag DOES add (create mode) AND that it does NOT add (management mode) —
   * is the real pointer sequence. `steps` controls the interpolated move granularity.
   */
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
