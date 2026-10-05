import { LocationSettingsSelectors } from '../../selectors';

type SelectorKey = keyof typeof LocationSettingsSelectors;

/**
 * Office this suite runs against. Local Information is office-scoped: two offices can hold
 * legitimately different values for the same checkbox, so every baseline below is keyed by office
 * rather than hardcoded. Override for a one-off run with `LOCAL_INFO_OFFICE=1604 npx playwright test`.
 *
 * Baselines re-verified live on 2026-09-21 (office 1606) and 2026-09-14 (office 1604).
 */
export const LOCAL_INFO_OFFICE = process.env.LOCAL_INFO_OFFICE || '1606';

interface OfficeBaseline {
  checked: SelectorKey[];
  unchecked: SelectorKey[];
  leftPanel: { office: string; payToAddress: string; eCommerceActive: boolean; enableProductionsOrders: boolean };
}

// Checkboxes every office holds in the same position, split out so the per-office blocks below
// only have to carry what genuinely differs between them.
const COMMON_CHECKED: SelectorKey[] = [
  'chkApplyLDW',
  'chkTickerCalc',
  'chkEnableSetStrikeLaborMinutes',
  'chkApplySetStrikeLaborMinutes',
  'chkCompanyRemitTax',
  'chkCommReceiver',
  'chkIntercompany',
  'chkAllowDPCD',
  'chkCreditMemoApprovalRequired',
  'chkEnableDiscountReason',
  'chkEnableProposal',
  'chkEnableJobCosting',
  'chkUseESignature',   // enabled+checked as of the 2026-09-14 live re-verification (was disabled)
];

const COMMON_UNCHECKED: SelectorKey[] = [
 // chkCalculateLDWonNetAmount excluded -- managed exclusively by TC-021/029 (check+save+restore cycle)
 // to avoid batch assertion failures when prior runs leave DB in dirty state.
  'chkApplyCablesConsumablesFee',
  'chkCalculateCConNetAmount',
  'chkAllowResortTax',
  'chkShowServiceChargeAsAdministrativeFee',
  'chkCalculateServiceChargeOnNetAmount',
  'chkInternetAssetReservation',
  'chkExcludeImpliedDiscount',
  'chkPromptForApproval',
  'chkAllowProductionQuote',
  'chkWarehouseBilling',
  'chkEnableIDCBilling',
  'chkSkipBilling',
  'chkSeparateMasterBillCommissionInvoice',
  'chkShowSubRental',
  'chkInventoryOnly',
  'chkCalculateCommissionTax',
  'chkCanCreateExternalCustomerLink',
  'chkOffsiteEventLocation',
  'chkExhibitShowRate',
  'chkEnableMultidayPricing',
];

export const OFFICE_BASELINES: Record<string, OfficeBaseline> = {
  // Parker Palm Springs. Service Charge is on here; ETS is off.
  '1604': {
    checked: [...COMMON_CHECKED, 'chkServiceCharge'],
    unchecked: [...COMMON_UNCHECKED, 'chkAllowETS'],
    leftPanel: { office: '1604', payToAddress: 'Encore', eCommerceActive: true, enableProductionsOrders: true },
  },
  // Embassy Suites by Hilton Washington DC Convention Center. The mirror image of 1604 on these
  // two: ETS is on (23.00%) and Service Charge is off.
  '1606': {
    checked: [...COMMON_CHECKED, 'chkAllowETS'],
    unchecked: [...COMMON_UNCHECKED, 'chkServiceCharge'],
    leftPanel: { office: '1606', payToAddress: 'Encore', eCommerceActive: true, enableProductionsOrders: true },
  },
};

const ACTIVE_BASELINE = OFFICE_BASELINES[LOCAL_INFO_OFFICE];
if (!ACTIVE_BASELINE) {
  throw new Error(
    `No Local Information baseline recorded for office ${LOCAL_INFO_OFFICE}. ` +
    `Walk the tab live and add it to OFFICE_BASELINES; known offices: ${Object.keys(OFFICE_BASELINES).join(', ')}.`,
  );
}

export const CHECKED_DEFAULTS: SelectorKey[] = ACTIVE_BASELINE.checked;

export const UNCHECKED_DEFAULTS: SelectorKey[] = ACTIVE_BASELINE.unchecked;

// Re-verified live against office 1604 (2026-09-14) and office 1606 (2026-09-21) — identical on
// both. chkEnableJobCosting and chkUseESignature
// were previously listed here as disabled; both now read enabled (they stay checked, so they moved
// to CHECKED_DEFAULTS instead). Everything else below still matches the live screen.
export const DISABLED_CHECKBOXES: SelectorKey[] = [
  'chkSuppressDayRateDiscount',
  'chkCompassIntegration',
  'chkDisplayTax',
  'chkEnableProductGroup',    // disabled+unchecked
  'chkEnableDiscountGuidance', // disabled+checked
];

export const DISABLED_CHECKBOX_STATES: Record<string, boolean> = {
  chkSuppressDayRateDiscount: false, // always disabled, unchecked
  chkCompassIntegration: true,       // disabled for existing location, checked
  chkDisplayTax: true,               // disabled when Company Remit Tax checked
  chkEnableProductGroup: false,      // disabled+unchecked on both 1604 and 1606
  chkEnableDiscountGuidance: true,   // disabled+checked on both 1604 and 1606
};

export interface BoundaryCase {
  label: string;
  value: string;
  valid: boolean;
  errorContains?: string;
  restoreValue: string;
  restoreEnableKey?: SelectorKey;
  pending?: string;
}

export const LDW_BOUNDARIES: BoundaryCase[] = [
 // Input is a decimal 0.1-1.0; blur multiplies by 100 and displays "X.XX%".
 // restoreValue '0.04' is below that range — a grandfathered DB value the server still accepts.
  { label: 'valid min (10%)',           value: '0.10',  valid: true,  restoreValue: '0.04' },
  { label: 'valid mid (50%)',           value: '0.50',  valid: true,  restoreValue: '0.04' },
  { label: 'valid near max (99%)',      value: '0.99',  valid: true,  restoreValue: '0.04' },
  { label: 'valid max (100%)',          value: '1.00',  valid: true,  restoreValue: '0.04' },
 // Client validates on blur, so nothing reaches the DB. 0 and 0.01-0.09 are omitted: the client
 // accepts them and the server rejects them silently, with no signal to assert on.
  { label: 'invalid negative (-0.01)',  value: '-0.01', valid: false, errorContains: 'Number must be', restoreValue: '0.04' },
  { label: 'invalid far below (-0.05)', value: '-0.05', valid: false, errorContains: 'Number must be', restoreValue: '0.04' },
  { label: 'invalid above max (1.01)', value: '1.01',  valid: false, errorContains: 'Number must be', restoreValue: '0.04' },
  { label: 'invalid far above (1.5)',  value: '1.5',   valid: false, errorContains: 'Number must be', restoreValue: '0.04' },
];

export interface DependencyCase {
  label: string;
  trigger: SelectorKey;
  triggerAction: 'check' | 'uncheck';
  target: SelectorKey;
  targetType: 'spin' | 'checkbox';
  expectedDisabled: boolean;
  expectedChecked?: boolean;
  restore: { key: SelectorKey; action: 'check' | 'uncheck' }[];
  spinRestore?: { key: SelectorKey; value: string };
  pending?: string;
}

export const SIMPLE_DEPENDENCIES: DependencyCase[] = [
  {
    label: 'Apply LDW -> LDW Percentage',
    trigger: 'chkApplyLDW', triggerAction: 'uncheck',
    target: 'spinLDWPercentage', targetType: 'spin',
    expectedDisabled: true,
    restore: [{ key: 'chkApplyLDW', action: 'check' }],
    spinRestore: { key: 'spinLDWPercentage', value: '0.04' }, // uncheck resets spin to 0; restore to '0.04' (decimal = 4%) so subsequent saves don't leave LDW%=0
  },
 // chkApplyCablesConsumablesFee, chkAllowETS and chkAllowResortTax are all ENABLED for 1604,
 // so they have no dependency to model here and are covered by standalone tests instead.
  {
    label: 'Skip Billing -> Oracle Product disabled',
    trigger: 'chkSkipBilling', triggerAction: 'check',
    target: 'txtOracleProduct', targetType: 'spin', // using spin for generic disabled check
    expectedDisabled: true,
    restore: [{ key: 'chkSkipBilling', action: 'uncheck' }],
    pending: 'Tested standalone — Skip Billing requires save+reload, not immediate toggle. See TC-LOC-LI-SKIP-BILLING in spec.',
  },
  {
    label: 'Comm Receiver -> Allow DPCD',
    trigger: 'chkCommReceiver', triggerAction: 'uncheck',
    target: 'chkAllowDPCD', targetType: 'checkbox',
    expectedDisabled: true, expectedChecked: false,
    restore: [
      { key: 'chkCommReceiver', action: 'check' },
      { key: 'chkAllowDPCD', action: 'check' },
    ],
  },
  {
    label: 'Comm Receiver -> Show SubRental',
    trigger: 'chkCommReceiver', triggerAction: 'uncheck',
    target: 'chkShowSubRental', targetType: 'checkbox',
    expectedDisabled: true,
    restore: [
      { key: 'chkCommReceiver', action: 'check' },
      { key: 'chkAllowDPCD', action: 'check' },
    ],
  },
  {
    label: 'Company Remit Tax -> Display Tax',
    trigger: 'chkCompanyRemitTax', triggerAction: 'uncheck',
    target: 'chkDisplayTax', targetType: 'checkbox',
    expectedDisabled: false,
    restore: [{ key: 'chkCompanyRemitTax', action: 'check' }],
  },
  {
    label: 'Intercompany -> Enable IDC Billing',
    trigger: 'chkIntercompany', triggerAction: 'uncheck',
    target: 'chkEnableIDCBilling', targetType: 'checkbox',
    expectedDisabled: true, expectedChecked: false,
    restore: [{ key: 'chkIntercompany', action: 'check' }],
  },
];

export const ACTIVE_DEPENDENCIES = SIMPLE_DEPENDENCIES.filter(d => !d.pending);

export const LEFT_PANEL_EXPECTED = ACTIVE_BASELINE.leftPanel;

export interface MaxLengthCase {
  key: SelectorKey;
  maxLength: number;
  restoreValue: string;
}

export const TEXT_FIELD_CONSTRAINTS: MaxLengthCase[] = [
  { key: 'txtOracleProduct', maxLength: 25, restoreValue: '0000' },
  { key: 'txtOracleDepartment', maxLength: 25, restoreValue: '900' },
];

export interface CheckboxLabelCase {
  key: string;
  expected: string;
}

export const LOCAL_INFO_TEST_VALUES = {
  billingType: 'Master',
  billingTypeDirect: 'Direct',
  oracleProductTest: 'PROD001',
  oracleProductDefault: '0000',
  oracleDeptTest: 'DEPT001',
  oracleProductShort: 'CHG',
  oracleDeptDefault: '900',
  specialChars: 'TEST@#$%&*()',
} as const;

export const CHECKBOX_LABEL_CASES: CheckboxLabelCase[] = [
  { key: 'chkApplyLDW',          expected: 'Apply LDW' },
  { key: 'chkSkipBilling',       expected: 'Skip Billing' },
  { key: 'chkWarehouseBilling',  expected: 'Warehouse Billing' },
  { key: 'chkCommReceiver',      expected: 'Comm Receiver' },
  { key: 'chkAllowDPCD',             expected: 'Allow DPCD' },
  { key: 'chkEnableMultidayPricing', expected: 'Enable Multiday Pricing' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Controls added 2026-09-21 after a live walk of office 1606 found them carrying
// no coverage at all (no selector, no data, no TC). See the coverage report in
// specs/location-local-information.plan.md.

/**
 * Product Organization — a Radix combobox inside the Local Information panel
 * (location-settings-select-product-org). Live-verified on 1606: enabled, reads
 * "United States", and switching it both enables Save and re-disables it on revert,
 * so it is a genuine persisted field rather than a display-only control.
 */
export const PRODUCT_ORG = {
  expectedOptions: ['None', 'Canada', 'Mexico', 'United States'],
  /** Baseline for the office under test; the alternate is what TC-LOC-LI-053 saves and reverts. */
  baseline: LOCAL_INFO_OFFICE === '1604' ? 'United States' : 'United States',
  alternate: 'Canada',
} as const;

/**
 * Set/Strike/Support Labor Billing Goal (spinSetStrikeLaborBillingGoal) shares the
 * percentage widget used by LDW: the input takes a decimal and blur renders it as "X.XX%".
 * The office's own starting figure differs per location (1606 holds 34.00%), so
 * TC-LOC-LI-054 reads it at runtime and restores to whatever it found rather than to a
 * hardcoded constant — that keeps the case office-agnostic.
 *
 * Live-verified on 1606: 1.5 -> "150.00%" with aria-invalid=true and Save disabled;
 * -0.01 -> "-1.00%" with aria-invalid=true; "abc" reverts to the prior value with
 * aria-invalid=false (the documented ARCH-002 (A) pass condition, not a defect).
 */
export const SET_STRIKE_BOUNDARY_VALUES = {
  validMid: '0.50',
  invalidAboveMax: '1.01',
  invalidNegative: '-0.01',
  nonNumeric: 'abc',
} as const;
