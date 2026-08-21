/**
 * Corporate Pricing — New Pricebook create-flow test data (NM-1440).
 * Verified on the live app, 2026-06-09 (both `?type=equipment` and `?type=labor`).
 *
 * MUTATION SAFETY: the New Pricebook create flow has NO reversible
 * mutation fixture — a committed pricebook is IRREVERSIBLE via the UI (no delete/deactivate). So
 * there is NO entry in `CORPORATE_PRICING_FIXTURES` for this screen; the spec is NO-COMMIT (asserts
 * the create form + Save reachability, then Cancels the confirm dialog). The "create-mode fixture"
 * is purely the input data below — nothing is persisted in CI. Baseline = a fresh,
 * always-empty create page per test (`open(type)` in `beforeEach`).
 */
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

  /**
   * Committing persistence test ONLY — fixed name PREFIX; the spec appends a run-stamp suffix read
   * from process.env.PRICEBOOK_RUN_STAMP (passed in by CI/agent), falling back to the test-runner pid
   * — NEVER Date.now()/random (those are non-reproducible). Keeps each committed pricebook uniquely
   * searchable on the single-tenant environment.
   */
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

  /**
   * An existing pricebook name (live on office 1604) — used to prove the create form does NOT
   * block a duplicate pricebook name client-side (NM-2022). The strategy name field DOES validate
   * uniqueness client-side (NM-2261); the pricebook-name field does not.
   */
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
