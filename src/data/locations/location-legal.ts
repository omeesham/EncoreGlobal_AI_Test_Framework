export const LEGAL_COLUMN_HEADERS = ['Language Name', 'Service Charge Name', 'Terms and Conditions Name'] as const;

export const LEGAL_DEFAULTS = {
  languageName: 'US English',
  serviceChargeName: 'Resort Service Charge',
  termsName: 'LDW',
} as const;

export const LEGAL_ALT_SC = 'Administrative Fee';
export const LEGAL_ALT_TC = 'Encore Terms and Conditions';

/**
 * Sentinel string for field-coverage TC-LOC-LGL-016 (DOM tamper negative test).
 * Not present in the 114-option SC dropdown; used to attempt invalid-value injection
 * via page.evaluate() to verify Radix React state isolation OR server-side rejection.
 */
export const LEGAL_INVALID_SC_VALUE = 'INVALID_SC_DOM_TAMPER_VALUE';
