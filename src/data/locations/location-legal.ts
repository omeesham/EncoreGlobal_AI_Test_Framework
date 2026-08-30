export const LEGAL_COLUMN_HEADERS = ['Language Name', 'Service Charge Name', 'Terms and Conditions Name'] as const;

export const LEGAL_DEFAULTS = {
  languageName: 'US English',
  serviceChargeName: 'Resort Service Charge',
  termsName: 'LDW',
} as const;

export const LEGAL_ALT_SC = 'Administrative Fee';
export const LEGAL_ALT_TC = 'Encore Terms and Conditions';

/** Sentinel deliberately absent from the Service Charge dropdown — used as the negative case. */
export const LEGAL_INVALID_SC_VALUE = 'INVALID_SC_DOM_TAMPER_VALUE';
