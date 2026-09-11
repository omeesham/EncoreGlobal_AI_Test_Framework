/**
 * Corporate Pricing — Pricing Detail test data.
 * Verified on the live app, 2026-06-05. Only live-verified values are committed. Volatile/large
 * values (row count, source-list size) are asserted by content/containment or `> 0`, never exact counts.
 *
 * Mutation safety: save-cycle tests mutate the `detailFixture` and restore via
 * `ensureDefaultState()`. The dependable, REVERSIBLE save lever is **Max Discount** (editing it
 * reliably enables Save; it restores to 0/no-discount). The **New Price** override is "sticky" (it
 * becomes the Price column on save) and its edit does NOT reliably enable Save on its own
 * (a known app quirk) — so the New-Price persist test drives the override through the proven
 * grid-batch save and ensureDefaultState reverts the Price back to base. Recovery values differ
 * from the saved baseline (net-zero edits never dirty the form).
 */
import { CORPORATE_PRICING_COMMON, CORPORATE_PRICING_FIXTURES } from './common';

export const DETAIL = {
  office: CORPORATE_PRICING_COMMON.office,
  pricebookGuid: CORPORATE_PRICING_FIXTURES.detailFixture.guid,
  pricebookName: CORPORATE_PRICING_FIXTURES.detailFixture.name,

  headers: ['ID', 'Product Group Name', 'Price', 'New Price', 'Max Discount'] as const,

  /**
   * Stable content anchors (unique Product Group Name + non-zero base Price, live 2026-06-05).
   * `anchorA` carries the Max-Discount save-cycle; `anchorB` carries the New-Price override cycle —
   * two distinct rows so the two save-cycle tests never edit the same row.
   */
  anchorA: { id: '277', name: 'Balloon Light Decor', basePrice: '615.00' },
  anchorB: { id: '280', name: 'Analog Mixer 12 - 23 Ch', basePrice: '195.00' },

  maxDiscountEdit: {
    value: '12', // display becomes '12.00 %'
    displayContains: '12',
    restored: '0', // display '0.00 %' = no discount
  },

  newPriceEdit: {
    value: '250.00',
    restored: '195.00', // = anchorB.basePrice — reverts the override
  },

  liveTabs: ['Pricing Strategy', 'Pricing Detail'] as const,

  sourceFilterPlaceholder: 'Search ID or Name...',
} as const;
