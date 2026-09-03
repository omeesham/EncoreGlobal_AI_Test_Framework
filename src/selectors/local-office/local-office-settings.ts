export const LocalOfficeSettingsSelectors = {
  tabContainer: '[data-testid="local-office-settings-tabs"]',
  tabBasicInformation: '[data-testid="local-office-settings-tab-basic-information"]',
  tabHistory: '[data-testid="local-office-settings-tab-location-settings-history"]',
  tabEctSettings: '[data-testid="local-office-settings-tab-ect-settings"]',

  tabContentBasicInfo: '[data-testid="local-office-settings-tab-content-basic-information"]',
  tabContentHistory: '[data-testid="local-office-settings-tab-content-history"]',
  tabContentEct: '[data-testid="local-office-settings-tab-content-ect-settings"]',

  frmBasicInfo: '[data-testid="local-office-settings-form"]',
  lblLocationHeader: '[data-testid="local-office-settings-location-header"]',
  btnSave: '[data-testid="local-office-settings-btn-save"]',

  secDateOffsets: '[data-testid="local-office-settings-section-date-offsets"]',
  txtPrepDateOffset: '[data-testid="local-office-settings-input-prep-date-offset"]',
  txtReturnDateOffset: '[data-testid="local-office-settings-input-return-date-offset"]',
  txtSetDateOffset: '[data-testid="local-office-settings-input-set-date-offset"]',
  txtStrikeDateOffset: '[data-testid="local-office-settings-input-strike-date-offset"]',
 /** @where Local Office Settings > Date Offsets @el input @text Delivery Date Offset @keys delivery offset hours NM-1264 */
  txtDeliveryDateOffset: '[data-testid="local-office-settings-input-delivery-date-offset"]',
  txtPickupDateOffset: '[data-testid="local-office-settings-input-pickup-date-offset"]',

  secMiscSettings: '[data-testid="local-office-settings-section-misc-settings"]',
  chkUseFulfillment: '[data-testid="local-office-settings-checkbox-use-fulfillment"]',
  chkUseAvailability: '[data-testid="local-office-settings-checkbox-use-availability"]',
  chkUseEquipmentsQc: '[data-testid="local-office-settings-checkbox-use-equipments-qc"]',
  chkRequestItemsReturn: '[data-testid="local-office-settings-checkbox-request-items-return"]',
  chkSamePriority: '[data-testid="local-office-settings-checkbox-same-priority"]',
  chkPrintDescription: '[data-testid="local-office-settings-checkbox-print-description"]',
  chkUseSubrentServiceType: '[data-testid="local-office-settings-checkbox-use-subrent-service-type"]',
  txtPhone1: '[data-testid="local-office-settings-input-phone-1"]',
  txtPhone2: '[data-testid="local-office-settings-input-phone-2"]',
  chkDefaultJobOneDayEvent: '[data-testid="local-office-settings-checkbox-default-job-one-day-event"]',
  chkDefaultJobOneDayOutside: '[data-testid="local-office-settings-checkbox-default-job-one-day-outside"]',
  chkDefaultJobOneDayInternal: '[data-testid="local-office-settings-checkbox-default-job-one-day-internal"]',
  chkDefaultLaborToHourly: '[data-testid="local-office-settings-checkbox-default-labor-to-hourly"]',
  drpDefaultOrderType: '[data-testid="local-office-settings-select-default-order-type"]',
  txtPoNumber: '[data-testid="local-office-settings-input-po-number"]',
  txtPoNumberLabel: '[data-testid="local-office-settings-input-po-number-label"]',

  secSections: '[data-testid="local-office-settings-section-sections"]',
  chkUseSection: '[data-testid="local-office-settings-checkbox-use-section"]',
  btnDefaultSection: '[data-testid="local-office-settings-btn-default-section"]',
  tblSections: '[data-testid="local-office-settings-table-sections"]',

  secRoomConfig: '[data-testid="local-office-settings-section-room-config"]',
  tblRoomConfig: '[data-testid="local-office-settings-table-room-config"]',

  secDefaultLogo: '[data-testid="local-office-settings-section-default-logo"]',
  chkLogoQuotes: '[data-testid="local-office-settings-checkbox-use-quote-logo"]',
  chkLogoRentalOrders: '[data-testid="local-office-settings-checkbox-use-rental-logo"]',
  drpCompanyLogo: '[data-testid="local-office-settings-select-company-logo"]',
  imgLogoPreview: '[data-testid="local-office-settings-logo-preview"]',

  secDiscountExemptions: '[data-testid="local-office-settings-section-discount-exemptions"]',
  tblDiscountExemptions: '[data-testid="local-office-settings-table-discount-exemptions"]',

 // Local Office Settings "Save Changes" dialog uses "Save" button (NOT "Ok" like Location Settings).
 // The unsaved-changes dialog has custom Stay/Discard buttons (not shared OK/Cancel).
  dlgSaveChanges: '[data-testid="location-settings-modal-save-changes"]',
  btnSaveChangesConfirm: '[role="alertdialog"]:has-text("Save Changes") button:has-text("Save")',
  btnSaveChangesCancel: '[role="alertdialog"]:has-text("Save Changes") button:has-text("Cancel")',
  dlgUnsavedLocalOffice: '[data-testid="location-settings-modal-unsaved-changes"]',
  btnUnsavedStay: '[role="alertdialog"] button:has-text("Stay")',
  btnUnsavedDiscard: '[role="alertdialog"] button:has-text("Discard")',
} as const;
