// New Pricebook create-flow data (NM-1440). A committed pricebook is irreversible via the UI, so the spec
// is no-commit: it asserts the form and Save reachability, then cancels the confirm dialog.
import { CORPORATE_PRICING_COMMON } from './common';

export const NEW_PRICEBOOK = {
  office: CORPORATE_PRICING_COMMON.office,

  types: ['equipment', 'labor'] as const,

  typeDisplay: { equipment: 'Equipment', labor: 'Labor' } as const,

  currencyDefault: 'USD',
  currencyOptions: ['USD', 'CAD', 'MXN'] as const,

  validName: 'QA New Pricebook',
  singleCharName: 'A',
  longName: 'Z'.repeat(250),
  specialName: 'AT&T <Tag> #1 "Q" é',
  whitespaceName: '   ',

  // The persistence spec appends a run stamp from PRICEBOOK_RUN_STAMP, falling back to the runner pid —
  // never Date.now()/random, which would make the committed name non-reproducible.
  persistNamePrefix: 'QA-Persist-',
  persistNamePrefixLabor: 'QA-Persist-LAB-',

  validYear: '2026',
  decimalYear: '20.5',
  alphaYear: 'abcd',

  strategyName: 'QA-Tier-1',
  secondStrategyName: 'QA-Tier-2',

  dialogFlagDefaults: {
    isActive: { checked: true },
    isGSO: { checked: false },
    isInternal: { checked: false },
    isProductions: { checked: false },
  },

  equipmentGroupA: 'Balloon Light Decor',
  equipmentGroupB: 'Analog Mixer 12 - 23 Ch',
  laborGroupSample: ['Banners Design', 'Branding Media Production', 'Content Development'] as const,
  laborGroupA: 'Banners Design',

  // Proves the pricebook-name field does NOT block a duplicate client-side (NM-2022),
  // unlike the strategy-name field, which does validate uniqueness (NM-2261).
  existingPricebookName: '2022-NP Tier 1',

  emptyStateHint: {
    addedPhrase: 'No items added yet',
    actionPhrase: 'Double-click or drag product groups from the sidebar',
  },

  saveDialog: {
    title: 'Save Changes',
    body: 'Are you sure you want to save the changes?',
  },
} as const;
