// Pricing Detail test data. Save-cycle tests mutate detailFixture and restore via ensureDefaultState().
// Max Discount is the reversible save lever; a New Price edit does not reliably dirty the form on its own.
import { CORPORATE_PRICING_COMMON, CORPORATE_PRICING_FIXTURES } from './common';

export const DETAIL = {
  office: CORPORATE_PRICING_COMMON.office,
  pricebookGuid: CORPORATE_PRICING_FIXTURES.detailFixture.guid,
  pricebookName: CORPORATE_PRICING_FIXTURES.detailFixture.name,

  headers: ['ID', 'Product Group Name', 'Price', 'New Price', 'Max Discount'] as const,

  // anchorA carries the Max-Discount save cycle, anchorB the New-Price override cycle —
  // kept as two distinct rows so the save-cycle tests never edit the same row.
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
