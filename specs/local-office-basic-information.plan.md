# Basic Information Tab (Local Office Settings) - UI Automation & Field-Level Validation Test Plan

## Application Overview

Scope: UI Automation & Field-level Validation of the Basic Information tab under Local Office Settings in Encore Navigator Cloud (new MFE), for office 1604 - Parker Palm Springs.

App entry point: {BASE_URL}locations/1604/settings/local-office (BASE_URL = https://cloudapps-e2e.encoreglobal.com/navigator/), reached after Microsoft SSO login. The tab strip shows, in order: Basic Information, Location Settings History, ECT Settings. Basic Information is the DEFAULT/selected tab on load (aria-selected=true) - no extra click is required to reach it, unlike ECT Settings which must be explicitly clicked. This plan targets only the Basic Information tab.

Confirmed live layout of the tab (verified against the E2E environment with account s-prd-clickauto@psav.com; every edit made during exploration was reverted/discarded afterward so office 1604's data is unchanged):
- Header: h3 location label '1604 - Parker Palm Springs' plus a single page-level 'Save' button (btnSave) top-right, disabled on initial/pristine load.
- Default Date Offsets panel (secDateOffsets): 6 visible inputs labeled '<Name> Date Offset (Relative to Start|End)' with a trailing 'Hrs' suffix. Live defaults: Prep=-1, Return=1, Set=-1, Strike=1, Delivery=0, Pickup=0 (exactly matches DATE_OFFSET_DEFAULTS). Confirmed live maxlength attributes: txtPrepDateOffset=3, txtReturnDateOffset=3, txtSetDateOffset=4, txtStrikeDateOffset=3, txtDeliveryDateOffset=4, txtPickupDateOffset=3 (matches the module spec's stated limits exactly). None of the six carry a native HTML `pattern` or `required` attribute - all validation is enforced by app JS via `aria-invalid` + a red circle-alert icon + a Radix tooltip, not the browser's native constraint-validation API. LoadInDateOffset/LoadOutDateOffset are confirmed absent from the rendered DOM (full-text search of the panel found none) - the 'currently hidden' spec note is accurate.
- Misc Settings panel (secMiscSettings), confirmed live defaults: Use Fulfillment unchecked+enabled, Use Availability CHECKED+enabled, Use Equipments QC unchecked+DISABLED, Items Filled from Requests Return to Availability unchecked+enabled, Allow tentative and confirmed Status to have the same priority unchecked+enabled, Print Description (Default) CHECKED+enabled, Use ServiceType for Subrental Inventory Sources CHECKED+enabled, Phone 1='760-883-1957', Phone 2=empty, Default new job to 1 day (Event/Outside/Internal) all unchecked, Default Labor to Hourly unchecked, Default Order Type='Event' (dropdown has EXACTLY two options: 'Event' and 'Outside'), PO Number=empty, PO Number Label=empty. Phone 1/Phone 2/PO Number/PO Number Label all report native maxLength=-1 and required=false - Phone 1's required behavior is entirely custom-JS-enforced. The Labor Hour multiplier fields (RegularHoursMultiplier, RegularHours, OverTimeHoursMultiplier, OverTimeHours, DoubleTimeHoursMultiplier, DoubleTimeHours, HolidayMultiplier) are confirmed ABSENT from the DOM both before AND after toggling Default Labor to Hourly on/off - the 'Currently Hidden' spec note is accurate and the checkbox does not reveal them.
- Section panel (secSections), gated by 'Use Section' (chkUseSection, checked by default) and a 'Default' button (btnDefaultSection): live grid (tblSections) has 14 rows for office 1604, sorted alphabetically - the 13 canonical DEFAULT_SECTIONS names (AV Services, Flipcharts, Hybrid Meeting, Labor, Lighting, Power, Presenter Support, Projection, Rigging, Scenic, Staging, Video, Whiteboard) plus one leaked 'Test Section' row. Flipcharts is Inactive (no check icon); all other 13 rows are Active.
- Room Configuration panel (secRoomConfig): live grid (tblRoomConfig) has 4 rows, sorted alphabetically - Ballroom A, Room Edit Test, Room Toggle Test, Test Room, all Active. Confirmed NO 'Use Room Configuration' gating checkbox and NO 'Default' button exist for this panel, matching the module spec.
- Default Logo panel (secDefaultLogo): 'Quotes' (chkLogoQuotes) and 'Rental Orders/DROs' (chkLogoRentalOrders) both CHECKED. Company Logo combobox (drpCompanyLogo) is set to 'SAVLogoNew' (NOT 'CSI Logo' - CSI Logo is merely one of eleven selectable options) with a rendered preview image (imgLogoPreview, base64 PNG/JPEG data URI). Full live option list (11): Header with Dust Ears and Text, PSAV Presentation Services (V3), PSAV DEG Red Bar(V2), SAV_Cropped, SAVLogoNew (selected), Concise New York Logo Orig, CSI Logo, Concise New York Logo, Encore Blue Logo, Encore New Logo, Concise New Logo Large, DISNEY NEW Logo.
- Discount Exemptions panel (secDiscountExemptions): live grid (tblDiscountExemptions) has ~77 Service Type rows (APP Downloaded through ZSub Rental Specialty), sorted alphabetically, each with a read-only Service Type text cell (no input element) and a clickable Exempt toggle cell (no input element either). No 'Add New...' input row exists at the bottom (final row is a blank two-cell spacer) and no per-row delete affordance exists - matches the spec's 'non-editable except Exempt, no add/delete' description.

Confirmed live behaviors and discrepancies (exploratory testing performed against the real E2E app; every edit was reverted/discarded so office 1604 is unchanged):
1. Checkbox cascade - Use Availability: unchecking it forces Use Fulfillment=false+disabled, Use Equipments QC=false+disabled, and Items Filled from Requests Return to Availability=false+disabled; re-checking restores all three to enabled (unchecked). Matches spec.
2. Checkbox cascade - Use Fulfillment: checking it (with Use Availability already true) leaves Use Availability true, forces Items Filled from Requests Return to Availability to false+ENABLED (editable, not auto-checked), and - contrary to the data file's CHECKBOX_DEFAULTS comment implying it's always disabled by default - Use Equipments QC becomes ENABLED (still unchecked) as soon as Use Fulfillment is true, confirming PilotEquipmentQC evaluates false for this office. Unchecking Use Fulfillment again forces Use Equipments QC back to false+DISABLED. The data file's disabled:true default only reflects the initial page-load state (Use Fulfillment starts false), not a permanent lock.
3. Simple top-level controls (date offset inputs, Phone 1, Use Section checkbox, Use Availability/Use Fulfillment checkboxes, Company Logo combobox) all correctly return the page-level Save button to DISABLED when their value is edited back to the original - a true 'pristine' recompute, without needing an actual Save+reload cycle.
4. Grid ROW-level edits behave differently: reverting a Section Name, Room Configuration Name, or Discount Exemption Exempt toggle back to its original value/state does NOT reset the page-level Save button to disabled - Save remains dirty/enabled even though every visible value matches the original. Scenarios that mutate a grid row must complete a real Save+reload cycle or use the Unsaved Changes dialog's Discard action to guarantee a clean revert; never assert Save re-disables purely from a same-value grid edit.
5. Date offset fields accept non-numeric/out-of-pattern text literally at the keystroke level (no client-side character filtering) - e.g. typing 'abc' or a positive number into Prep Date Offset leaves that literal text in the input, sets aria-invalid='true', shows a red circle-alert icon, and a Radix tooltip. Confirmed exact live tooltip wording for Prep's own-field violation: 'Prep Date Offset must be empty, negative or zero'.
6. Confirmed exact live tooltip wording for the ONE cross-field rule that IS enforced (Delivery >= Prep, the NM-1264 case): 'Delivery Date Offset (Relative to Start) must be greater than or equal to Prep Date Offset (Relative to Start).' Only Delivery's field is marked invalid; Prep itself stays valid.
7. IMPORTANT DISCREPANCY vs. the module spec's full cross-field matrix: extensive live probing found that ONLY the Delivery>=Prep relationship is actually enforced. Explicitly confirmed NOT enforced live (no aria-invalid, no icon, no Save-block) for: Set vs Prep (Set=-5 while Prep=-1 stays valid), Set vs Delivery (the shipped default data itself has Set=-1 < Delivery=0 with zero validation error on fresh page load), Strike vs Return (Strike=5 while Return=1 stays valid), and Pickup vs Return (Pickup=5 while Return=1 stays valid). Test scenarios below explicitly probe and document this gap as an observation rather than assuming the spec's full bidirectional matrix (Set<->Prep/Delivery, Strike<->Return/Pickup, Pickup<->Return/Strike) is implemented.
8. Prep Date Offset (and by extension likely Return) can be cleared to a fully empty string and is treated as VALID (aria-invalid='false'), not flagged as a required-field error - contradicting the PREP_OFFSET_EMPTY/RETURN_OFFSET_EMPTY error names implied by the spec doc; empty is evidently an accepted state for these two fields specifically (they participate in the 'when Prep/Return is empty' branches of the spec's Validate() description). Save becomes dirty/enabled since empty differs from the default.
9. Phone 1 is required via custom JS only (no native `required` attribute): clearing it and blurring sets aria-invalid='true' with a short, generic tooltip reading exactly 'Required' (not a Phone-specific message), and blocks Save. Restoring the value cleanly re-disables Save.
10. PO Number, PO Number Label, and Phone 2 all report native maxLength=-1 (unconstrained) and required=false - confirmed genuinely free-text/unconstrained fields.
11. Section Name / Room Configuration Name empty-commit and whitespace-only-commit BOTH cleanly auto-revert the displayed value to the prior name AND correctly return Save to disabled (pristine) - this specific case behaves like a 'simple control', unlike the duplicate-name case below.
12. Section Name / Room Configuration Name trim-on-save is confirmed: typing '  AV Test  ' (padded) commits as 'AV Test' (trimmed), dirtying Save.
13. Section Name / Room Configuration Name DUPLICATE NAME handling is a genuine discrepancy vs. the module spec: renaming a row to an already-existing name (tested with both `.fill()` and real slow keystrokes, tested in BOTH grids for parity) auto-REVERTS the displayed value back to the row's prior name on blur with NO visible duplicate-name icon/tooltip ever observed (contradicting the spec's 'flags duplicate name with exclamation icon + tooltip + disables Save' description) - AND, despite the display reverting to an unchanged value, the page-level Save button becomes/stays ENABLED (dirty), which is itself an inconsistency (identical displayed value should be pristine, per the 'simple control' pattern seen elsewhere).
14. Section Name Escape-to-cancel: pressing Escape mid-edit (after typing new text, before blur) does NOT revert the in-progress edit - the typed text remains in the input and stays focused; only a subsequent Tab/blur commits it. This CONTRADICTS an assumption that this grid's Escape-to-cancel differs from ECT's Labor Cost grid - live behavior shows Escape has NO cancel effect in the Section grid either, matching ECT's documented Escape behavior rather than diverging from it.
15. The Section (and Room Configuration) grid auto-SORTS rows alphabetically by name immediately after each commit - editing a row's name can move it to a different position/index in the table. Automation must re-locate rows by current text value after any name edit rather than assuming a fixed row index persists.
16. Default Sections button (btnDefaultSection): for office 1604's current data (which already contains most items from BOTH the module spec's 9-item default list and the data file's DEFAULT_SECTIONS alternate-name list), clicking Default added exactly the 2 spec-list items not already present verbatim - 'Audio' and 'High Speed Internet Access' (the other 7 of the spec's 9 names - Video, Lighting, Presenter Support, Staging, Rigging, Scenic, Labor - already existed and were left untouched/undeduplicated against similarly-themed but differently-named rows like 'AV Services'). Critically, clicking Default did NOT dirty/enable the page-level Save button, and a subsequent reload (without an intervening real edit) silently discarded both newly-added rows - a significant, reproducible quirk where the Default button's grid mutation is not tracked by the form's dirty-state system.
17. Add New Section/Room row: typing a unique name into the 'Add New...' input and pressing Tab immediately adds a new row with Active=true by default and correctly dirties Save (confirmed for both grids).
18. Delete Section/Room row: each data row has a `title="Right-click for actions"` attribute; right-clicking a row reveals a contextual 'Section Lines'/'Room Lines'-style toolbar with a 'Delete' button. Clicking Delete immediately removes the row from the grid and dirties Save (confirmed for both grids, including deleting a freshly-added never-saved row).
19. Use Section unchecked: the Default button becomes disabled, every Section Name cell's input element disappears (replaced by plain static text, no textbox role), and the 'Add New...' row's input also disappears (empty cell) - the grid becomes fully read-only while still displaying all rows/Active states. Re-checking Use Section restores full editability and, being a simple checkbox, cleanly re-disables Save when reverted.
20. XSS payload (`<script>alert(1)</script>`) typed into a new Section Name commits and is stored/rendered as inert literal text (input.value contains the literal string); zero `<script>` elements are injected into the grid's DOM; no alert fires - confirms proper escaping for this field.
21. Discount Exemptions Exempt toggle is confirmed clickable/functional (toggled 'APP Downloaded' off then back on) with the same 'grid row edit does not re-disable Save on revert' behavior as the Section/Room grids.
22. Company Logo: changing the combobox selection (e.g. to 'CSI Logo') immediately swaps the preview image's base64 `src` and dirties Save; selecting back to the original 'SAVLogoNew' restores the original preview src AND correctly re-disables Save (this control behaves like a 'simple' control, not a grid row).
23. Save button click raises a 'Save Changes' confirmation alertdialog (dlgSaveChanges) with heading 'Save Changes', body text 'Are you sure you want to save the changes?', and Cancel/Save buttons - confirmed this ALWAYS appears for Basic Information's single global Save, a different pattern from the ECT Settings plan's per-section Saves (which reportedly save directly with no confirm step).
24. Leaving the tab/page while dirty raises the shared 'Unsaved changes' alertdialog (dlgUnsavedLocalOffice) with heading 'Unsaved changes', body 'Are you sure you want to leave this view? Any unsaved changes will be lost.', and Stay/Discard buttons - confirmed IDENTICAL wording to the ECT Settings plan's dialog (shared global component). Discard fully reverts all dirty top-level fields (confirmed with PO Number) back to their original values and re-disables Save upon return to the tab.
25. A hard reload / address-bar navigation while the form is dirty triggers the browser's NATIVE beforeunload confirmation dialog (not the app's custom Radix dialog) - confirmed live (page.goto() blocked/timed out until the native dialog was programmatically accepted) - identical to the ECT Settings plan's documented behavior, and applies equally to Basic Information.

This plan reuses existing framework page-object/selector/data conventions already present in the repository (src/pages/local-office/local-office-settings.page.ts, src/selectors/local-office/local-office-settings.ts, src/data/local-office/local-office-settings.ts) so test authors can implement each scenario directly against those data-testid selectors and constants: txtPrepDateOffset, txtReturnDateOffset, txtSetDateOffset, txtStrikeDateOffset, txtDeliveryDateOffset, txtPickupDateOffset, chkUseFulfillment, chkUseAvailability, chkUseEquipmentsQc, chkRequestItemsReturn, chkSamePriority, chkPrintDescription, chkUseSubrentServiceType, txtPhone1, txtPhone2, chkDefaultJobOneDayEvent/Outside/Internal, chkDefaultLaborToHourly, drpDefaultOrderType, txtPoNumber, txtPoNumberLabel, chkUseSection, btnDefaultSection, tblSections, tblRoomConfig, chkLogoQuotes, chkLogoRentalOrders, drpCompanyLogo, imgLogoPreview, tblDiscountExemptions, btnSave, dlgSaveChanges, btnSaveChangesConfirm, btnSaveChangesCancel, dlgUnsavedLocalOffice, btnUnsavedStay, btnUnsavedDiscard - plus the page object's fillAndTab/clearAndTab/expectInvalid/expectValid/getCheckboxState/checkCheckbox/uncheckCheckbox/getComboboxValue/selectComboboxExact/editSectionName/editSectionNameAndCancel/addSection/clickDefaultSection/getSectionNames/isSectionActive/toggleSectionActive/editRoomName/addRoom/getRoomNames/isRoomActive/toggleRoomActive/getLogoPreviewSrc/toggleExemption/getExemptCount/clickSaveAndConfirm/clickSaveAndCancel/clickUnsavedStay/clickUnsavedDiscard/pasteIntoField helper methods, and the data file's DATE_OFFSET_DEFAULTS, CHECKBOX_DEFAULTS, ONE_DAY_JOB_CHECKBOXES, DEFAULT_SECTIONS, DATE_OFFSET_TEST_VALUES, PHONE_TEST_VALUES, SECTION_TEST_VALUES, ROOM_TEST_VALUES, ORDER_TYPE_VALUES, PO_TEST_VALUES, XSS_PAYLOAD, DEFAULT_PHONE_1, POSITIVITY_VIOLATIONS_START/END, NON_NUMERIC_TEST_FIELDS, MAXLEN_BOUNDARY, MULTI_FIELD_RECOVERY, NULL_OFFSET_FIELDS constants.

Every scenario below assumes a fresh/blank starting state: freshly authenticated session, freshly navigated to {BASE_URL}locations/1604/settings/local-office, with the Basic Information tab already selected by default (no click needed) before any scenario-specific steps begin. Scenarios are independent and may be run in any order. Critically, every scenario that mutates data ends by restoring the original value/state and saving again (btnSave -> dlgSaveChanges -> btnSaveChangesConfirm), OR by discarding via the shared Unsaved Changes dialog (dlgUnsavedLocalOffice -> btnUnsavedDiscard) when nothing was actually persisted, so office 1604's data is left unchanged for subsequent runs - mirroring the ECT plan's restore-and-save pattern. Per behavior #4 above, any scenario touching the Section, Room Configuration, or Discount Exemptions grids must NOT assert Save re-disables from a same-value revert alone; it must either complete a real Save+reload or use Discard.

## Test Scenarios

### 1. Tab Load & Layout (Happy Path)

**Seed:** `tests/seed.spec.ts`

#### 1.1. Basic Information tab loads with all panels and documented default values

**File:** `tests/local-office/basic-information/tab-load.spec.ts`

**Steps:**
  1. Log in via Microsoft SSO and navigate to {BASE_URL}locations/1604/settings/local-office.
    - expect: Local Office Settings page loads with the Basic Information tab selected by default (aria-selected=true), with no extra click required.
    - expect: The location heading '1604 - Parker Palm Springs' is visible.
    - expect: The page-level Save button (btnSave) is visible and disabled.
  2. Locate the Default Date Offsets panel (secDateOffsets).
    - expect: All six labeled inputs are visible with values: Prep Date Offset (Relative to Start)='-1', Return Date Offset (Relative to End)='1', Set Date Offset (Relative to Start)='-1', Strike Date Offset (Relative to End)='1', Delivery Date Offset (Relative to Start)='0', Pickup Date Offset (Relative to End)='0', each suffixed 'Hrs'.
    - expect: No LoadInDateOffset or LoadOutDateOffset field/label exists anywhere in the panel (confirm via a full-text search of the panel's textContent).
  3. Locate the Misc Settings panel (secMiscSettings).
    - expect: Use Fulfillment unchecked+enabled; Use Availability CHECKED+enabled; Use Equipments QC unchecked+DISABLED; Items Filled from Requests Return to Availability unchecked+enabled; Allow tentative and confirmed Status to have the same priority unchecked+enabled; Print Description (Default) CHECKED+enabled; Use ServiceType for Subrental Inventory Sources CHECKED+enabled.
    - expect: Phone 1='760-883-1957'; Phone 2 is empty.
    - expect: Default new job to 1 day (Event/Outside/Internal) all unchecked; Default Labor to Hourly unchecked.
    - expect: Default Order Type combobox shows 'Event'.
    - expect: PO Number and PO Number Label are both empty.
    - expect: No Labor Hour multiplier field/label (e.g. 'Regular Hours', 'Multiplier', 'Holiday') exists anywhere in the rendered form.
  4. Locate the Section panel (secSections).
    - expect: Use Section checkbox is CHECKED; a 'Default' button is visible and enabled.
    - expect: The Section grid (tblSections) contains 14 rows sorted alphabetically: AV Services, Flipcharts, Hybrid Meeting, Labor, Lighting, Power, Presenter Support, Projection, Rigging, Scenic, Staging, Test Section, Video, Whiteboard.
    - expect: Flipcharts shows Inactive (no check icon in its Active cell); all other 13 rows show Active.
  5. Locate the Room Configuration panel (secRoomConfig).
    - expect: No 'Use Room Configuration' checkbox and no 'Default' button exist for this panel.
    - expect: The Room grid (tblRoomConfig) contains 4 rows sorted alphabetically: Ballroom A, Room Edit Test, Room Toggle Test, Test Room, all Active.
  6. Locate the Default Logo panel (secDefaultLogo).
    - expect: Quotes and Rental Orders/DROs checkboxes are both CHECKED.
    - expect: Company Logo combobox shows 'SAVLogoNew' with a rendered logo preview image (imgLogoPreview) below it.
  7. Locate the Discount Exemptions panel (secDiscountExemptions).
    - expect: The grid (tblDiscountExemptions) contains roughly 77 rows sorted alphabetically from 'APP Downloaded' through 'ZSub Rental Specialty', each with a read-only Service Type cell and a clickable Exempt cell.
    - expect: No 'Add New...' input row exists at the bottom of this grid (unlike the Section/Room grids).

#### 1.2. Grid editability baseline: Section/Room editable, Discount Exemptions Service Type read-only

**File:** `tests/local-office/basic-information/grid-editability-baseline.spec.ts`

**Steps:**
  1. Open the Basic Information tab (fresh load).
    - expect: Panel loads as described in the happy-path scenario.
  2. Within the Section grid, inspect the Section Name and Active columns for every data row.
    - expect: Every Section Name cell contains an editable text input.
    - expect: Every Active cell contains a clickable, non-input toggle (a checkmark icon when Active, empty when Inactive).
  3. Within the Room Configuration grid, inspect the Room Configuration Name and Active columns.
    - expect: Same editable-input-plus-clickable-toggle pattern as the Section grid is confirmed.
  4. Within the Discount Exemptions grid, inspect the Service Type and Exempt columns for several rows (e.g. 'APP Downloaded', 'Lighting', 'Freight').
    - expect: Service Type cells contain plain text with NO input element.
    - expect: Exempt cells contain a clickable toggle (icon or empty) with no input element, confirming this grid is read-only except for the Exempt toggle.
  5. Attempt to double-click a Service Type cell in the Discount Exemptions grid (e.g. 'APP Downloaded').
    - expect: No input/edit affordance appears; the cell remains static text.

### 2. Date Offset Field-Level Validation

**Seed:** `tests/seed.spec.ts`

#### 2.1. Prep Date Offset: own-field positivity pattern, non-numeric acceptance-as-invalid, maxlength, empty-is-valid

**File:** `tests/local-office/basic-information/date-offset-prep-validation.spec.ts`

**Steps:**
  1. Open Basic Information tab (fresh load) and record Prep Date Offset (expected '-1').
    - expect: Field is visible/enabled; maxLength attribute equals 3; no native pattern/required attribute is present.
  2. Click the field, Ctrl+A, type the positive invalidValue from POSITIVITY_VIOLATIONS_START ('5'), press Tab.
    - expect: Field keeps the literal typed value '5' (not rejected at keystroke level).
    - expect: aria-invalid becomes 'true' and a red circle-alert icon appears.
    - expect: Hovering the icon shows a tooltip reading exactly 'Prep Date Offset must be empty, negative or zero'.
    - expect: Save button remains disabled.
  3. Click the field, Ctrl+A, type non-numeric text 'abc', press Tab.
    - expect: Field keeps 'abc' as its literal value; aria-invalid remains 'true'; Save stays disabled.
  4. Click the field, Ctrl+A, type the 4-character over-limit string '1234' (MAXLEN_BOUNDARY.threeChar.overLimit) and inspect the raw value while still focused (before blurring).
    - expect: The input's value is capped at 3 characters by the maxlength=3 attribute (at most '123' is present), confirming native maxlength truncation independent of the custom positivity validation.
  5. Click the field, Ctrl+A, Backspace (clear to empty), press Tab.
    - expect: Field value is empty; aria-invalid is 'false' (empty IS treated as valid for this field, contradicting a naive PREP_OFFSET_EMPTY-required assumption); Save button becomes enabled (dirty, since empty differs from default '-1').
  6. Click the field, Ctrl+A, Backspace, type the valid default '-1', press Tab.
    - expect: aria-invalid becomes 'false'; the red icon disappears; Save button returns to disabled (pristine), confirming a same-value restore cleanly re-disables Save for this simple field.

#### 2.2. Set Date Offset: own-field positivity pattern, maxlength boundary (4-char), non-numeric

**File:** `tests/local-office/basic-information/date-offset-set-validation.spec.ts`

**Steps:**
  1. Open Basic Information tab (fresh load) and record Set Date Offset (expected '-1', maxLength=4).
    - expect: Field is visible/enabled with the recorded default and maxLength.
  2. Click the field, Ctrl+A, type the positive invalidValue from POSITIVITY_VIOLATIONS_START Set entry ('3'), press Tab.
    - expect: Field keeps '3'; aria-invalid becomes 'true'; a tooltip analogous to Prep's wording appears (e.g. referencing 'Set Date Offset'); Save stays disabled.
  3. Click the field, Ctrl+A, type non-numeric 'abc', press Tab.
    - expect: Field keeps 'abc'; aria-invalid remains 'true'.
  4. Click the field, Ctrl+A, type the at-limit valid 4-character value '-999' (MAXLEN_BOUNDARY.fourChar.atLimit), press Tab.
    - expect: Full 4-character value '-999' is accepted (fits exactly within maxlength=4); aria-invalid is 'false' (valid pattern); Save becomes enabled (dirty, differs from default).
  5. Click the field, Ctrl+A, Backspace, type the valid default '-1', press Tab.
    - expect: aria-invalid is 'false'; Save button returns to disabled.

#### 2.3. Delivery Date Offset: own-field positivity pattern, maxlength boundary (4-char), non-numeric

**File:** `tests/local-office/basic-information/date-offset-delivery-validation.spec.ts`

**Steps:**
  1. Open Basic Information tab (fresh load) and record Delivery Date Offset (expected '0', maxLength=4).
    - expect: Field is visible/enabled with the recorded default and maxLength.
  2. Click the field, Ctrl+A, type the positive invalidValue from POSITIVITY_VIOLATIONS_START Delivery entry ('2'), press Tab.
    - expect: Field keeps '2'; aria-invalid becomes 'true'; Save stays disabled.
  3. Click the field, Ctrl+A, type non-numeric 'abc', press Tab.
    - expect: Field keeps 'abc'; aria-invalid remains 'true'.
  4. Click the field, Ctrl+A, type a 4-character over-limit numeric string ('-1234') and inspect the raw value while focused.
    - expect: Value is capped at 4 characters by maxlength=4.
  5. Click the field, Ctrl+A, Backspace, type the valid default '0', press Tab.
    - expect: aria-invalid is 'false'; Save button returns to disabled.

#### 2.4. Return Date Offset: own-field positivity pattern (reverse polarity), maxlength, non-numeric

**File:** `tests/local-office/basic-information/date-offset-return-validation.spec.ts`

**Steps:**
  1. Open Basic Information tab (fresh load) and record Return Date Offset (expected '1', maxLength=3).
    - expect: Field is visible/enabled with the recorded default and maxLength.
  2. Click the field, Ctrl+A, type the negative invalidValue from POSITIVITY_VIOLATIONS_END Return entry ('-3'), press Tab.
    - expect: Field keeps '-3'; aria-invalid becomes 'true' (Return only accepts empty or positive values, the reverse polarity of Prep/Set/Delivery); a tooltip referencing 'Return Date Offset' appears; Save stays disabled.
  3. Click the field, Ctrl+A, type non-numeric text from NON_NUMERIC_TEST_FIELDS ('abc'), press Tab.
    - expect: Field keeps 'abc'; aria-invalid remains 'true'.
  4. Click the field, Ctrl+A, type a 4-character over-limit numeric string ('1234') and inspect the raw value while focused.
    - expect: Value is capped at 3 characters by maxlength=3.
  5. Click the field, Ctrl+A, Backspace, type the valid default '1', press Tab.
    - expect: aria-invalid is 'false'; Save button returns to disabled.

#### 2.5. Strike Date Offset: own-field positivity pattern, maxlength, non-numeric

**File:** `tests/local-office/basic-information/date-offset-strike-validation.spec.ts`

**Steps:**
  1. Open Basic Information tab (fresh load) and record Strike Date Offset (expected '1', maxLength=3).
    - expect: Field is visible/enabled with the recorded default and maxLength.
  2. Click the field, Ctrl+A, type the negative invalidValue from POSITIVITY_VIOLATIONS_END Strike entry ('-2'), press Tab.
    - expect: Field keeps '-2'; aria-invalid becomes 'true'; Save stays disabled.
  3. Click the field, Ctrl+A, type non-numeric 'abc', press Tab.
    - expect: Field keeps 'abc'; aria-invalid remains 'true'.
  4. Click the field, Ctrl+A, Backspace, type the valid default '1', press Tab.
    - expect: aria-invalid is 'false'; Save button returns to disabled.

#### 2.6. Pickup Date Offset: own-field positivity pattern, maxlength, non-numeric

**File:** `tests/local-office/basic-information/date-offset-pickup-validation.spec.ts`

**Steps:**
  1. Open Basic Information tab (fresh load) and record Pickup Date Offset (expected '0', maxLength=3).
    - expect: Field is visible/enabled with the recorded default and maxLength.
  2. Click the field, Ctrl+A, type the negative invalidValue from POSITIVITY_VIOLATIONS_END Pickup entry ('-1'), press Tab.
    - expect: Field keeps '-1'; aria-invalid becomes 'true'; Save stays disabled.
  3. Click the field, Ctrl+A, type non-numeric 'xyz', press Tab.
    - expect: Field keeps 'xyz'; aria-invalid remains 'true'.
  4. Click the field, Ctrl+A, Backspace, type the valid default '0', press Tab.
    - expect: aria-invalid is 'false'; Save button returns to disabled.

#### 2.7. Cross-field Validate(): Delivery must be >= Prep (NM-1264, the one confirmed-live cross-field rule) with recovery

**File:** `tests/local-office/basic-information/date-offset-crossfield-delivery-prep.spec.ts`

**Steps:**
  1. Open Basic Information tab (fresh load). Confirm Prep='-1' and Delivery='0' (default: Delivery already >= Prep, no error).
    - expect: Both fields show aria-invalid='false'; Save is disabled.
  2. Click Delivery, Ctrl+A, type the MULTI_FIELD_RECOVERY.triggerValue '-5' (making Delivery < Prep), press Tab.
    - expect: Delivery keeps '-5'; Delivery's aria-invalid becomes 'true'; a red icon appears on Delivery only.
    - expect: Prep's aria-invalid remains 'false' (Prep itself is not flagged).
    - expect: Hovering Delivery's icon shows a tooltip reading exactly 'Delivery Date Offset (Relative to Start) must be greater than or equal to Prep Date Offset (Relative to Start).'
    - expect: Save button remains disabled.
  3. Click Delivery, Ctrl+A, type the MULTI_FIELD_RECOVERY.recoveryValue '-1' (now Delivery == Prep), press Tab.
    - expect: Delivery's aria-invalid becomes 'false'; the icon disappears; Save becomes enabled (dirty, since '-1' differs from the default '0').
  4. Click Delivery, Ctrl+A, type the MULTI_FIELD_RECOVERY.defaultValue '0', press Tab.
    - expect: Delivery returns to '0'; aria-invalid is 'false'; Save button returns to disabled, confirming full round-trip recovery.

#### 2.8. Cross-field Validate() probe: Set/Prep, Set/Delivery, Strike/Return, Pickup/Return relationships are NOT enforced live (documented spec discrepancy)

**File:** `tests/local-office/basic-information/date-offset-crossfield-unenforced-probe.spec.ts`

**Steps:**
  1. Open Basic Information tab (fresh load). Note the shipped default data already has Set='-1' and Delivery='0' (i.e. Set < Delivery) with zero validation errors shown on load.
    - expect: Set and Delivery both show aria-invalid='false' on a completely fresh, unedited load - documented as evidence the 'Set must be >= Delivery' sub-rule described in the module spec is not enforced live.
  2. Click Set Date Offset, Ctrl+A, type '-5' (now Set < Prep='-1'), press Tab.
    - expect: Document actual observed behavior: Set's aria-invalid stays 'false' (no cross-field error against Prep), confirming 'Set must be >= Prep' is NOT enforced live even though Set's OWN positivity pattern still applies independently. Treat this as an observation/discrepancy against the spec, not an assumed bug, and do not fail the test on this basis.
  3. Restore Set to '-1' and Tab.
    - expect: Set returns to '-1'.
  4. Click Strike Date Offset, Ctrl+A, type '5' (now Strike > Return='1'), press Tab.
    - expect: Document actual observed behavior: Strike's aria-invalid stays 'false' (no cross-field error against Return), confirming 'Strike must be <= Return' is NOT enforced live.
  5. Restore Strike to '1' and Tab.
    - expect: Strike returns to '1'.
  6. Click Pickup Date Offset, Ctrl+A, type '5' (now Pickup > Return='1'), press Tab.
    - expect: Document actual observed behavior: Pickup's aria-invalid stays 'false' (no cross-field error against Return), confirming 'Pickup must be <= Return' is NOT enforced live.
  7. Restore Pickup to '0' and Tab.
    - expect: Pickup returns to '0'; all six offset fields show their original default values; Save button is disabled, confirming a full clean revert.

#### 2.9. Prep and Return Date Offset can both be cleared to empty simultaneously and are treated as valid; restore

**File:** `tests/local-office/basic-information/date-offset-null-fields.spec.ts`

**Steps:**
  1. Open Basic Information tab (fresh load).
    - expect: All six offset fields show their NULL_OFFSET_FIELDS default values; Save is disabled.
  2. Click Prep Date Offset, Ctrl+A, Backspace (clear to empty), press Tab.
    - expect: Prep is empty; aria-invalid='false'; Save becomes enabled (dirty).
  3. Click Return Date Offset, Ctrl+A, Backspace (clear to empty), press Tab.
    - expect: Return is empty; aria-invalid='false'; Save remains enabled.
  4. Re-focus Set, Strike, Delivery, and Pickup in turn without changing their values (Tab through each) to confirm no new cross-field errors appear now that Prep and Return are both empty.
    - expect: None of Set/Strike/Delivery/Pickup show aria-invalid='true' as a side effect of Prep/Return being empty.
  5. Restore Prep to its NULL_OFFSET_FIELDS default ('-1') and Return to its default ('1'), Tab after each.
    - expect: Both fields show their original values; aria-invalid='false' on both; Save button returns to disabled, confirming a full clean revert of the empty-field round-trip.

#### 2.10. maxlength boundary enforcement is consistent across all six offset fields

**File:** `tests/local-office/basic-information/date-offset-maxlength-all-fields.spec.ts`

**Steps:**
  1. Open Basic Information tab (fresh load) and read the maxLength DOM property of all six offset inputs.
    - expect: txtPrepDateOffset=3, txtReturnDateOffset=3, txtSetDateOffset=4, txtStrikeDateOffset=3, txtDeliveryDateOffset=4, txtPickupDateOffset=3 - matching the module spec's per-field character limits exactly.
  2. For each of the three 3-char fields (Prep, Return, Strike... and Pickup, all maxLength=3), click, Ctrl+A, type a 5-character numeric string, and inspect the raw value while still focused.
    - expect: Each field's value is capped at exactly 3 characters, never exceeding maxLength regardless of how many characters were typed.
  3. For each of the two 4-char fields (Set, Delivery), click, Ctrl+A, type a 5-character numeric string, and inspect the raw value while still focused.
    - expect: Each field's value is capped at exactly 4 characters.
  4. Restore all six fields to their NULL_OFFSET_FIELDS default values, Tab after each.
    - expect: All six fields show their original defaults; Save button returns to disabled.

### 3. Misc Settings Checkboxes & Dependencies

**Seed:** `tests/seed.spec.ts`

#### 3.1. Use Availability cascade: disabling forces Use Fulfillment, Use Equipments QC, and Request Items Return to false+disabled

**File:** `tests/local-office/basic-information/checkbox-use-availability-cascade.spec.ts`

**Steps:**
  1. Open Basic Information tab (fresh load). Confirm Use Availability is checked+enabled, Use Fulfillment is unchecked+enabled, Use Equipments QC is unchecked+disabled, Items Filled from Requests Return to Availability is unchecked+enabled.
    - expect: Baseline state matches the documented defaults.
  2. Click Use Availability to uncheck it.
    - expect: Use Availability becomes unchecked.
    - expect: Use Fulfillment becomes unchecked AND disabled.
    - expect: Use Equipments QC remains unchecked AND disabled.
    - expect: Items Filled from Requests Return to Availability becomes unchecked AND disabled.
    - expect: Save button becomes enabled (dirty).
  3. Click Use Availability again to re-check it.
    - expect: Use Availability becomes checked; Use Fulfillment becomes enabled again (still unchecked); Items Filled from Requests Return to Availability becomes enabled again (still unchecked); Use Equipments QC remains disabled (since Use Fulfillment is still false).
    - expect: Save button returns to disabled (pristine, since this is a simple checkbox round-trip).

#### 3.2. Use Fulfillment cascade: checking it enables Use Equipments QC and forces Request Items Return to false+enabled, without disabling Use Availability

**File:** `tests/local-office/basic-information/checkbox-use-fulfillment-enable-cascade.spec.ts`

**Steps:**
  1. Open Basic Information tab (fresh load). Confirm Use Availability checked, Use Fulfillment unchecked, Use Equipments QC unchecked+disabled, Items Filled from Requests Return to Availability unchecked+enabled.
    - expect: Baseline state matches documented defaults.
  2. Click Use Fulfillment to check it.
    - expect: Use Fulfillment becomes checked.
    - expect: Use Availability remains checked (unaffected/still true).
    - expect: Use Equipments QC becomes ENABLED (still unchecked) - confirms PilotEquipmentQC evaluates false for this office/config.
    - expect: Items Filled from Requests Return to Availability becomes/stays unchecked but is now enabled (not auto-checked).
    - expect: Save button becomes enabled (dirty).
  3. Click Use Fulfillment again to uncheck it.
    - expect: Use Fulfillment becomes unchecked; Use Equipments QC becomes unchecked AND disabled again (forced false); Use Availability remains checked; Save button returns to disabled (pristine round-trip).

#### 3.3. Use Equipments QC becomes checkable only while Use Fulfillment is true, and is force-cleared when Use Fulfillment is unchecked

**File:** `tests/local-office/basic-information/checkbox-use-equipments-qc-dependency.spec.ts`

**Steps:**
  1. Open Basic Information tab (fresh load). Confirm Use Equipments QC is disabled.
    - expect: Attempting to click the disabled checkbox has no effect (remains unchecked, no dirty state).
  2. Click Use Fulfillment to check it (enabling Use Equipments QC).
    - expect: Use Equipments QC becomes enabled+unchecked.
  3. Click Use Equipments QC to check it.
    - expect: Use Equipments QC becomes checked; Save button is enabled (dirty).
  4. Click Use Fulfillment again to uncheck it.
    - expect: Use Equipments QC is forced back to unchecked AND disabled, even though it had just been explicitly checked - confirming the forced-clear takes priority over the user's last explicit choice.
  5. Confirm Save button state and reload/discard to leave the office clean (this scenario ends dirty due to the checkbox cascade retaining a dirty flag; use the Unsaved Changes dialog Discard, or reload and accept the native beforeunload dialog, rather than asserting Save auto-disables).
    - expect: After Discard/reload, all Misc Settings checkboxes show their original documented default states.

#### 3.4. Independent misc checkboxes (Allow tentative/confirmed same priority, Print Description, Use ServiceType for Subrental) toggle without side effects on each other

**File:** `tests/local-office/basic-information/checkbox-independent-misc-settings.spec.ts`

**Steps:**
  1. Open Basic Information tab (fresh load). Record baseline: Allow tentative and confirmed Status to have the same priority=unchecked, Print Description (Default)=checked, Use ServiceType for Subrental Inventory Sources=checked.
    - expect: Baseline matches documented defaults.
  2. Click 'Allow tentative and confirmed Status to have the same priority' to check it.
    - expect: Only this checkbox changes state (checked); Print Description and Use ServiceType for Subrental Inventory Sources remain unchanged; Use Fulfillment/Use Availability/Use Equipments QC remain unchanged; Save becomes enabled.
  3. Click 'Print Description (Default)' to uncheck it.
    - expect: Only this checkbox changes (unchecked); all other checkboxes from the prior step remain unaffected.
  4. Click 'Use ServiceType for Subrental Inventory Sources' to uncheck it.
    - expect: Only this checkbox changes (unchecked); no cascading effect on any other checkbox.
  5. Revert all three checkboxes back to their original states (Allow tentative=unchecked, Print Description=checked, Use ServiceType for Subrental=checked), tabbing after each.
    - expect: All three show original values; Save button returns to disabled (pristine round-trip for these simple, independent checkboxes).

#### 3.5. Default new job to 1 day (Event/Outside/Internal) checkboxes are mutually independent

**File:** `tests/local-office/basic-information/checkbox-default-new-job-one-day.spec.ts`

**Steps:**
  1. Open Basic Information tab (fresh load). Confirm Event/Outside/Internal are all unchecked.
    - expect: Baseline matches documented default (all three unchecked).
  2. Click 'Event' to check it.
    - expect: Only Event becomes checked; Outside and Internal remain unchecked; Save becomes enabled.
  3. Click 'Outside' to check it.
    - expect: Event remains checked; Outside becomes checked; Internal remains unchecked (confirms no mutual exclusivity/radio-like behavior).
  4. Click 'Internal' to check it.
    - expect: All three (Event, Outside, Internal) are now checked simultaneously.
  5. Uncheck all three (Event, Outside, Internal) back to their original unchecked state.
    - expect: All three show unchecked; Save button returns to disabled (pristine round-trip).

#### 3.6. Default Labor to Hourly toggle does not reveal any hidden Labor Hour multiplier fields

**File:** `tests/local-office/basic-information/checkbox-default-labor-to-hourly-hidden-fields.spec.ts`

**Steps:**
  1. Open Basic Information tab (fresh load). Confirm Default Labor to Hourly is unchecked, and search the form's full text content for 'Regular Hours', 'Multiplier', 'Holiday', 'Over Time'/'OverTime', 'Double Time'/'DoubleTime'.
    - expect: None of those strings are found anywhere in the rendered form.
  2. Click Default Labor to Hourly to check it, and re-run the same full-text search.
    - expect: Checkbox becomes checked; Save becomes enabled; still none of the Labor Hour field strings appear anywhere in the DOM - confirms the fields remain hidden/unimplemented regardless of this checkbox's state, matching the module spec's 'Currently Hidden' note.
  3. Click Default Labor to Hourly again to uncheck it.
    - expect: Checkbox returns to unchecked; Save button returns to disabled (pristine round-trip).

### 4. Phone / PO / Order Type Fields

**Seed:** `tests/seed.spec.ts`

#### 4.1. Phone 1 required-field validation (custom JS, no native required attribute)

**File:** `tests/local-office/basic-information/phone1-required-validation.spec.ts`

**Steps:**
  1. Open Basic Information tab (fresh load) and record Phone 1 (expected DEFAULT_PHONE_1 '760-883-1957'). Read its native maxLength/required DOM properties.
    - expect: maxLength=-1 (unconstrained); required=false (validation is entirely custom-JS, not native HTML5).
  2. Click Phone 1, Ctrl+A, Backspace (clear to empty), press Tab.
    - expect: Field becomes empty; aria-invalid becomes 'true'; hovering the resulting alert icon shows a tooltip reading exactly 'Required'.
    - expect: Save button remains disabled (invalid form blocks save even though the field is dirty).
  3. Click Phone 1, type a value from PHONE_TEST_VALUES.testFormat ('555-123-4567'), press Tab.
    - expect: Field shows '555-123-4567'; aria-invalid becomes 'false'; the alert icon disappears; Save button becomes enabled (dirty, valid).
  4. Click Phone 1, Ctrl+A, retype the original DEFAULT_PHONE_1 ('760-883-1957'), press Tab.
    - expect: Field shows the original value; Save button returns to disabled (pristine round-trip).

#### 4.2. Phone 2 is optional and accepts unconstrained free text

**File:** `tests/local-office/basic-information/phone2-optional-free-text.spec.ts`

**Steps:**
  1. Open Basic Information tab (fresh load) and confirm Phone 2 is empty with no invalid state.
    - expect: Phone 2 is empty; aria-invalid is not 'true'; maxLength=-1; required=false.
  2. Click Phone 2, type PHONE_TEST_VALUES.invalid ('not-a-phone'), press Tab.
    - expect: Field accepts and displays 'not-a-phone' literally with NO invalid state raised (Phone 2 has no format validation, unlike Phone 1's required check) and Save becomes enabled (dirty).
  3. Click Phone 2, Ctrl+A, Backspace (clear back to empty), press Tab.
    - expect: Field is empty; no invalid state; Save button returns to disabled (pristine round-trip), confirming Phone 2 truly has no required validation unlike Phone 1.

#### 4.3. Default Order Type dropdown offers exactly Event and Outside, and persists the selection round-trip

**File:** `tests/local-office/basic-information/default-order-type-dropdown.spec.ts`

**Steps:**
  1. Open Basic Information tab (fresh load) and confirm Default Order Type shows 'Event'.
    - expect: Combobox displays ORDER_TYPE_VALUES.default 'Event'.
  2. Click the combobox to open it and enumerate all options.
    - expect: Exactly two options are present: 'Event' and 'Outside' - no other values exist in the list.
  3. Select 'Outside' (ORDER_TYPE_VALUES.alternate).
    - expect: Combobox now shows 'Outside'; Save button becomes enabled (dirty).
  4. Re-open the combobox and select 'Event' again.
    - expect: Combobox shows 'Event'; Save button returns to disabled (pristine round-trip for this simple control).

#### 4.4. PO Number and PO Number Label accept unconstrained free text including a long string, and are truly optional

**File:** `tests/local-office/basic-information/po-number-fields-free-text.spec.ts`

**Steps:**
  1. Open Basic Information tab (fresh load) and confirm PO Number and PO Number Label are both empty with maxLength=-1 and required=false.
    - expect: Both fields empty; no invalid state on load.
  2. Click PO Number, type PO_TEST_VALUES.number ('PO-TEST-123'), press Tab.
    - expect: Field shows 'PO-TEST-123'; no invalid state raised; Save button becomes enabled (dirty).
  3. Click PO Number Label, type PO_TEST_VALUES.label ('Purchase Order #'), press Tab.
    - expect: Field shows 'Purchase Order #'; no invalid state; Save remains enabled.
  4. Click PO Number, Ctrl+A, type a 100+ character long string, press Tab.
    - expect: The full long string is accepted with no truncation (no maxlength enforced) and no crash/console error; the field remains interactive.
  5. Clear both PO Number and PO Number Label back to empty (Ctrl+A, Backspace, Tab on each).
    - expect: Both fields are empty again; Save button returns to disabled (pristine round-trip), confirming both fields are genuinely optional with no required validation.

### 5. Section Grid (CRUD, Duplicate, Trim, Default Button, Use Section Gating)

**Seed:** `tests/seed.spec.ts`

#### 5.1. Rename a section with leading/trailing whitespace and confirm trim-on-save

**File:** `tests/local-office/basic-information/section-rename-trim.spec.ts`

**Steps:**
  1. Open Basic Information tab (fresh load). Locate the row for SECTION_TEST_VALUES.originalName ('AV Services') by its current text value (not a fixed index, since the grid is alphabetically sorted).
    - expect: Row is found with value 'AV Services'.
  2. Click its Section Name input, Ctrl+A, type '  AV Test  ' (SECTION_TEST_VALUES.editValue padded with leading/trailing spaces), press Tab.
    - expect: The committed value is the TRIMMED 'AV Test' (no leading/trailing spaces persist in the input's value).
  3. Click the Save button, confirm the 'Save Changes' dialog, and wait for it to close.
    - expect: Dialog shows heading 'Save Changes' and body 'Are you sure you want to save the changes?'; after confirming, Save completes and the page-level Save button returns to disabled.
  4. Reload the page and re-open Basic Information.
    - expect: The renamed row now shows 'AV Test' and persisted the trim.
  5. Locate the row (now named 'AV Test'), rename it back to the original 'AV Services', and Save+confirm again.
    - expect: After reload, the row shows 'AV Services' again and the grid's row count/composition matches the original baseline, leaving office 1604 clean.

#### 5.2. Empty and whitespace-only Section Name commits cleanly auto-revert with Save staying disabled

**File:** `tests/local-office/basic-information/section-empty-whitespace-revert.spec.ts`

**Steps:**
  1. Open Basic Information tab (fresh load). Locate the 'AV Services' row.
    - expect: Row found with value 'AV Services'.
  2. Click its input, Ctrl+A, Backspace (clear to empty), press Tab.
    - expect: Input reverts to display 'AV Services' again (the empty commit was rejected/reverted).
    - expect: Save button remains DISABLED (this simple no-op revert correctly stays pristine, unlike the duplicate-name case).
  3. Click the same input, Ctrl+A, type three spaces '   ' (whitespace-only), press Tab.
    - expect: Input reverts to display 'AV Services' again.
    - expect: Save button remains DISABLED.
  4. Confirm no other rows or panels were affected.
    - expect: Section grid still shows all 14 original rows unchanged; no Save action was necessary since the form never left the pristine state.

#### 5.3. Duplicate Section Name auto-reverts the display but leaves Save dirty (documented discrepancy)

**File:** `tests/local-office/basic-information/section-duplicate-name.spec.ts`

**Steps:**
  1. Open Basic Information tab (fresh load). Locate the 'AV Services' row and record the full list of existing section names.
    - expect: 'AV Services' row found; 14 total names recorded.
  2. Click its input, Ctrl+A, type the name of another existing row, 'Flipcharts', slowly (real keystrokes), press Tab.
    - expect: The input's displayed/committed value REVERTS back to 'AV Services' (not 'Flipcharts') - no persistent duplicate-name warning icon or tooltip is observed on this row.
    - expect: DESPITE the display being unchanged from the original, the page-level Save button becomes/stays ENABLED (dirty) - document this explicitly as a discrepancy against the module spec (which describes a persistent duplicate-name icon + disabled Save) and against the 'simple control' pristine-revert pattern seen elsewhere in this tab.
  3. Confirm the grid still shows exactly 14 rows with no name actually duplicated (i.e. 'Flipcharts' still appears exactly once, 'AV Services' still appears exactly once).
    - expect: Section names list is unchanged in content; only the Save button's dirty flag is the anomaly.
  4. Reload the page (accept the native beforeunload dialog) to discard the anomalous dirty state without persisting anything.
    - expect: After reload, all 14 section names and Active states match the original baseline exactly, and Save is disabled.

#### 5.4. Escape mid-edit does NOT cancel an in-progress Section Name edit (confirms parity with ECT's Labor Cost grid, not an asymmetry)

**File:** `tests/local-office/basic-information/section-escape-does-not-cancel.spec.ts`

**Steps:**
  1. Open Basic Information tab (fresh load). Locate the 'AV Services' row.
    - expect: Row found with value 'AV Services'.
  2. Click its input, Ctrl+A, type 'Temp Name XYZ' slowly (do NOT press Tab/blur yet).
    - expect: Input shows 'Temp Name XYZ' while still focused.
  3. Press Escape while the input is still focused, mid-edit.
    - expect: The input's value REMAINS 'Temp Name XYZ' (Escape does NOT revert it) and the input remains focused - confirming Escape has no cancel effect in this grid, the same as ECT's Labor Cost grid (this corrects any assumption that Section Name's Escape behavior differs from ECT).
  4. Press Tab to blur and commit.
    - expect: The name 'Temp Name XYZ' is committed; because the grid auto-sorts alphabetically, this row now appears in a new position (alphabetically among the other names, e.g. just before 'Test Section'); Save button is enabled (dirty).
  5. Re-locate the row by its current text value 'Temp Name XYZ' (not by a fixed index), rename it back to 'AV Services', and press Tab.
    - expect: Value commits as 'AV Services' and the row moves back to its original alphabetical position.
  6. Reload the page (accept the native beforeunload dialog) to discard the residual dirty flag left over from this rename round-trip (per the grid-row dirty-flag asymmetry documented in the Application Overview).
    - expect: After reload, all 14 section names match the original baseline exactly and Save is disabled.

#### 5.5. Add New Section row: new row defaults to Active=true and correctly dirties Save

**File:** `tests/local-office/basic-information/section-add-new-row.spec.ts`

**Steps:**
  1. Open Basic Information tab (fresh load) and record the current section row count (expected 14).
    - expect: 14 rows confirmed; Save disabled.
  2. Click the 'Add New...' input at the bottom of the Section grid, type SECTION_TEST_VALUES.newSection ('Test Section Z'), press Tab.
    - expect: A new row appears with Section Name='Test Section Z' and Active=TRUE by default (check icon present) without any manual toggle.
    - expect: Total row count becomes 15.
    - expect: Save button becomes enabled (dirty).
  3. Right-click the new 'Test Section Z' row.
    - expect: The row shows a 'Right-click for actions' affordance; a contextual toolbar/section appears with a 'Delete' button.
  4. Click 'Delete'.
    - expect: The 'Test Section Z' row is immediately removed from the grid; row count returns to 14.
  5. Reload the page (accept the native beforeunload dialog) to discard the residual dirty flag from the add+delete round-trip.
    - expect: After reload, the grid shows exactly the original 14 rows and Save is disabled.

#### 5.6. Delete an existing Section row via the right-click context menu and confirm it can be persisted then restored

**File:** `tests/local-office/basic-information/section-delete-existing-row.spec.ts`

**Steps:**
  1. Open Basic Information tab (fresh load). Add a uniquely-named temporary row via 'Add New...' (e.g. 'Delete Me Section'), press Tab.
    - expect: New row 'Delete Me Section' appears, Active=true; Save enabled.
  2. Click Save, confirm the 'Save Changes' dialog.
    - expect: Save completes; Save button returns to disabled; row 'Delete Me Section' is now a persisted (non-new) row.
  3. Reload and re-open Basic Information to confirm persistence.
    - expect: 'Delete Me Section' is present in the grid after reload (now 15 total rows).
  4. Right-click the 'Delete Me Section' row and click 'Delete'.
    - expect: Row is removed from the grid immediately (14 rows remain); Save button becomes enabled (dirty).
  5. Click Save and confirm the 'Save Changes' dialog.
    - expect: Save completes; Save button returns to disabled.
  6. Reload and re-open Basic Information.
    - expect: 'Delete Me Section' is permanently gone; the grid shows exactly the original 14 rows, confirming the delete-then-save round-trip correctly persisted and office 1604 is left clean.

#### 5.7. Default Sections button reconciles module-spec list vs. data-file list, and its additions are NOT tracked by the form's dirty state

**File:** `tests/local-office/basic-information/section-default-button.spec.ts`

**Steps:**
  1. Open Basic Information tab (fresh load) and record the full current list of 14 section names.
    - expect: List recorded; confirms none of 'Audio' or 'High Speed Internet Access' are currently present, while Video, Lighting, Presenter Support, Staging, Rigging, Scenic, Labor already are.
  2. Click the 'Default' button (btnDefaultSection).
    - expect: Exactly 2 new rows are added: 'Audio' and 'High Speed Internet Access' (the only 2 of the module spec's 9-item default list - Audio, Video, Lighting, Presenter Support, Staging, Rigging, High Speed Internet Access, Scenic, Labor - not already present verbatim); total row count becomes 16.
    - expect: No name-based deduplication/merging occurs against similarly-themed but differently-named rows like 'AV Services' or 'Flipcharts' - they remain separate, untouched rows.
  3. Check the Save button's state immediately after clicking Default.
    - expect: Save button remains DISABLED - document this explicitly as a discrepancy: the Default button's grid mutation is not tracked as a form change.
  4. Reload the page WITHOUT clicking Save.
    - expect: After reload, the 2 newly-added rows ('Audio', 'High Speed Internet Access') are GONE - the grid reverts to the original 14 rows, confirming the Default button's additions were purely ephemeral/client-side and were silently discarded because Save was never enabled.
  5. Click the 'Default' button again, then make one additional trivial edit (e.g. toggle any row's Active state and back) to force the form dirty, then click Save and confirm.
    - expect: This time, after Save completes and the page reloads, the 2 new rows DO persist - confirming the additions are real/persistable, just not auto-tracked as dirty on their own.
  6. Right-click and Delete both 'Audio' and 'High Speed Internet Access' rows, then Save and confirm again to restore the original 14-row baseline.
    - expect: After reload, the grid shows exactly the original 14 rows, leaving office 1604 clean.

#### 5.8. Unchecking Use Section gates the grid to read-only and disables the Default button

**File:** `tests/local-office/basic-information/section-use-section-gating.spec.ts`

**Steps:**
  1. Open Basic Information tab (fresh load). Confirm Use Section is checked and the Default button is enabled.
    - expect: Baseline confirmed; all 14 Section Name cells contain editable inputs; the 'Add New...' row's input is present.
  2. Click 'Use Section' to uncheck it.
    - expect: The 'Default' button becomes DISABLED.
    - expect: Every Section Name cell's input element disappears, replaced by plain static (non-editable) text showing the same names.
    - expect: The 'Add New...' row's input also disappears (its cell becomes empty/non-interactive).
    - expect: All Active-column toggle icons remain visible (grid still displays Active state, just not editable via Section Name).
    - expect: Save button becomes enabled (dirty).
  3. Click 'Use Section' again to re-check it.
    - expect: The Default button becomes enabled again; every Section Name cell's input reappears with its original value; the 'Add New...' input reappears.
    - expect: Save button returns to disabled (pristine round-trip for this simple checkbox).

#### 5.9. Section grid auto-sorts rows alphabetically after each name commit

**File:** `tests/local-office/basic-information/section-grid-autosort.spec.ts`

**Steps:**
  1. Open Basic Information tab (fresh load) and record the full ordered list of 14 section names (expected alphabetical: AV Services, Flipcharts, Hybrid Meeting, Labor, Lighting, Power, Presenter Support, Projection, Rigging, Scenic, Staging, Test Section, Video, Whiteboard).
    - expect: Order matches alphabetical expectation.
  2. Locate the 'AV Services' row (position 1) and rename it to 'Zzz Test Sort' (a name that alphabetically sorts last), press Tab.
    - expect: The row immediately moves to the LAST position in the grid (after 'Whiteboard'), confirming live alphabetical auto-sort on commit - NOT its original position 1.
  3. Re-locate the row by its current text 'Zzz Test Sort' (now last) and rename it back to 'AV Services', press Tab.
    - expect: The row moves back to position 1 (alphabetically first again).
  4. Reload the page (accept the native beforeunload dialog) to discard the residual dirty flag from this round-trip.
    - expect: After reload, the grid shows the original 14 rows in the original alphabetical order and Save is disabled.

#### 5.10. XSS payload typed into a new Section Name is stored and rendered as inert text, not executed

**File:** `tests/local-office/basic-information/section-xss-payload.spec.ts`

**Steps:**
  1. Open Basic Information tab (fresh load). Set up a console/dialog listener to detect any JS alert() firing.
    - expect: No listener has fired yet.
  2. Click the 'Add New...' input, type the XSS_PAYLOAD constant ('<script>alert(1)</script>'), press Tab.
    - expect: A new row is added whose Section Name input's VALUE is the literal string '<script>alert(1)</script>' (verified via the input's .value property, not innerHTML).
    - expect: No JavaScript alert() dialog fires.
    - expect: Querying the Section table's DOM for actual <script> elements returns zero matches - confirms the payload was never parsed/injected as executable HTML.
  3. Right-click the new row and click 'Delete' to remove the test payload row.
    - expect: Row is removed; grid returns to its original 14 rows.
  4. Reload the page (accept the native beforeunload dialog) if any residual dirty state remains, to leave office 1604 clean.
    - expect: After reload, the grid matches the original 14-row baseline exactly.

### 6. Room Configuration Grid (CRUD, Duplicate, Trim)

**Seed:** `tests/seed.spec.ts`

#### 6.1. Rename a room with leading/trailing whitespace and confirm trim-on-save

**File:** `tests/local-office/basic-information/room-rename-trim.spec.ts`

**Steps:**
  1. Open Basic Information tab (fresh load). Locate the 'Ballroom A' row in the Room Configuration grid by its current text value.
    - expect: Row found with value 'Ballroom A'.
  2. Click its input, Ctrl+A, type '  Ballroom Test  ' (padded), press Tab.
    - expect: The committed value is TRIMMED to 'Ballroom Test' (no leading/trailing spaces).
  3. Click Save and confirm the 'Save Changes' dialog.
    - expect: Save completes; Save button returns to disabled.
  4. Reload and re-open Basic Information.
    - expect: The row shows 'Ballroom Test', confirming the trim persisted.
  5. Rename it back to 'Ballroom A' and Save+confirm again.
    - expect: After reload, the row shows 'Ballroom A' again, leaving office 1604 clean.

#### 6.2. Empty and whitespace-only Room Configuration Name commits cleanly auto-revert with Save staying disabled

**File:** `tests/local-office/basic-information/room-empty-whitespace-revert.spec.ts`

**Steps:**
  1. Open Basic Information tab (fresh load). Locate the 'Ballroom A' row.
    - expect: Row found.
  2. Click its input, Ctrl+A, Backspace (clear to empty), press Tab.
    - expect: Input reverts to 'Ballroom A'; Save button remains DISABLED.
  3. Click the same input, Ctrl+A, type two spaces '  ', press Tab.
    - expect: Input reverts to 'Ballroom A' again; Save button remains DISABLED.

#### 6.3. Duplicate Room Configuration Name auto-reverts the display but leaves Save dirty (parity with Section grid)

**File:** `tests/local-office/basic-information/room-duplicate-name.spec.ts`

**Steps:**
  1. Open Basic Information tab (fresh load). Locate the 'Ballroom A' row and record all 4 existing room names.
    - expect: 'Ballroom A' found; 4 total names recorded.
  2. Click its input, Ctrl+A, type the name of another existing row, 'Room Edit Test', slowly (real keystrokes), press Tab.
    - expect: The input's value REVERTS to 'Ballroom A' (not 'Room Edit Test').
    - expect: DESPITE the unchanged display, the page-level Save button becomes/stays ENABLED (dirty) - confirming this is the same discrepancy documented for the Section grid, not unique to Sections.
  3. Confirm the grid still shows exactly 4 rows with no name actually duplicated.
    - expect: Room names list is unchanged in content.
  4. Reload the page (accept the native beforeunload dialog) to discard the anomalous dirty state.
    - expect: After reload, all 4 room names match the original baseline and Save is disabled.

#### 6.4. Add New Room row: new row defaults to Active=true and correctly dirties Save

**File:** `tests/local-office/basic-information/room-add-new-row.spec.ts`

**Steps:**
  1. Open Basic Information tab (fresh load) and record the current room row count (expected 4).
    - expect: 4 rows confirmed; Save disabled.
  2. Click the 'Add New...' input at the bottom of the Room Configuration grid, type ROOM_TEST_VALUES.testRoom ('Conference Room Z'), press Tab.
    - expect: A new row appears with Room Configuration Name='Conference Room Z' and Active=TRUE by default.
    - expect: The grid re-sorts alphabetically, placing 'Conference Room Z' in its correct alphabetical position (immediately after 'Ballroom A').
    - expect: Total row count becomes 5; Save button becomes enabled (dirty).
  3. Right-click the 'Conference Room Z' row.
    - expect: A contextual toolbar with a 'Delete' button appears.
  4. Click 'Delete'.
    - expect: The row is immediately removed; row count returns to 4.
  5. Reload the page (accept the native beforeunload dialog) to discard any residual dirty flag.
    - expect: After reload, the grid shows exactly the original 4 rows and Save is disabled.

#### 6.5. Delete an existing Room row via the right-click context menu and confirm it can be persisted then restored

**File:** `tests/local-office/basic-information/room-delete-existing-row.spec.ts`

**Steps:**
  1. Open Basic Information tab (fresh load). Add a uniquely-named temporary row via 'Add New...' (e.g. 'Delete Me Room'), press Tab.
    - expect: New row 'Delete Me Room' appears, Active=true; Save enabled.
  2. Click Save, confirm the 'Save Changes' dialog.
    - expect: Save completes; Save button returns to disabled; the row is now persisted.
  3. Reload and re-open Basic Information to confirm persistence.
    - expect: 'Delete Me Room' is present after reload (5 total rows).
  4. Right-click the 'Delete Me Room' row and click 'Delete'.
    - expect: Row removed immediately (4 rows remain); Save button becomes enabled (dirty).
  5. Click Save and confirm the 'Save Changes' dialog.
    - expect: Save completes; Save button returns to disabled.
  6. Reload and re-open Basic Information.
    - expect: 'Delete Me Room' is permanently gone; the grid shows exactly the original 4 rows, leaving office 1604 clean.

### 7. Discount Exemptions Grid

**Seed:** `tests/seed.spec.ts`

#### 7.1. Exempt toggle is functional per-row; Service Type column stays read-only; no add/delete affordances exist

**File:** `tests/local-office/basic-information/discount-exemptions-toggle.spec.ts`

**Steps:**
  1. Open Basic Information tab (fresh load). Record the current Exempt state of the first row ('APP Downloaded', expected checked/exempt) and the total visible row count (expected ~77).
    - expect: Baseline recorded; Save disabled.
  2. Click the Exempt cell of the 'APP Downloaded' row.
    - expect: Its Exempt icon toggles OFF (no longer exempt); Save button becomes enabled (dirty).
  3. Click the same Exempt cell again to toggle it back ON.
    - expect: Its Exempt icon shows checked/exempt again (visually identical to the original state) BUT the Save button REMAINS enabled/dirty (per the grid-row dirty-flag asymmetry documented in the Application Overview - do not assert Save re-disables here).
  4. Attempt to click/double-click the Service Type text cell of any row (e.g. 'Lighting').
    - expect: No input/edit affordance appears; the cell remains static, non-editable text.
  5. Scroll to the bottom of the Discount Exemptions grid.
    - expect: The final row is a blank two-cell spacer with no 'Add New...' input and no delete affordance - confirms this grid has no add/delete capability.
  6. Reload the page (accept the native beforeunload dialog) to discard the dirty state left over from the toggle round-trip.
    - expect: After reload, 'APP Downloaded' and all other rows show their original Exempt states and Save is disabled.

### 8. Company Logo Panel

**Seed:** `tests/seed.spec.ts`

#### 8.1. Changing the Company Logo selection live-updates the preview image and dirties Save; reverting cleanly re-disables Save

**File:** `tests/local-office/basic-information/company-logo-selection.spec.ts`

**Steps:**
  1. Open Basic Information tab (fresh load). Record the current Company Logo selection (expected 'SAVLogoNew') and the preview image's src attribute (imgLogoPreview).
    - expect: Combobox shows 'SAVLogoNew'; preview src is a non-empty base64 data URI.
  2. Click the Company Logo combobox and enumerate all options.
    - expect: Exactly 11 options are present: Header with Dust Ears and Text, PSAV Presentation Services (V3), PSAV DEG Red Bar(V2), SAV_Cropped, SAVLogoNew, Concise New York Logo Orig, CSI Logo, Concise New York Logo, Encore Blue Logo, Encore New Logo, Concise New Logo Large, DISNEY NEW Logo.
  3. Select 'CSI Logo'.
    - expect: Combobox now shows 'CSI Logo'; the preview image's src changes to a DIFFERENT base64 data URI than the original SAVLogoNew src; Save button becomes enabled (dirty).
  4. Re-open the combobox and select 'SAVLogoNew' again.
    - expect: Combobox shows 'SAVLogoNew'; the preview src reverts to match the originally-recorded SAVLogoNew src; Save button returns to disabled (pristine round-trip for this simple control).

#### 8.2. Quotes and Rental Orders/DROs checkboxes toggle independently of each other and of Company Logo

**File:** `tests/local-office/basic-information/company-logo-quotes-rental-checkboxes.spec.ts`

**Steps:**
  1. Open Basic Information tab (fresh load). Confirm Quotes and Rental Orders/DROs are both checked.
    - expect: Baseline confirmed.
  2. Click 'Quotes' to uncheck it.
    - expect: Only Quotes becomes unchecked; Rental Orders/DROs remains checked; Company Logo selection is unaffected; Save becomes enabled.
  3. Click 'Rental Orders/DROs' to uncheck it.
    - expect: Both are now unchecked; no cascading effect on Company Logo or any Misc Settings checkbox.
  4. Re-check both 'Quotes' and 'Rental Orders/DROs'.
    - expect: Both show checked again; Save button returns to disabled (pristine round-trip).

### 9. Top-Level Save / Unsaved-Changes / Discard Flows

**Seed:** `tests/seed.spec.ts`

#### 9.1. Save button click always raises the Save Changes confirmation dialog; Cancel aborts persistence

**File:** `tests/local-office/basic-information/save-changes-dialog-cancel.spec.ts`

**Steps:**
  1. Open Basic Information tab (fresh load). Make a trivial valid edit (e.g. type 'PO-TEMP' into PO Number), Tab to blur.
    - expect: Save button becomes enabled.
  2. Click the Save button.
    - expect: A 'Save Changes' alertdialog (dlgSaveChanges) appears with heading 'Save Changes', body text 'Are you sure you want to save the changes?', and Cancel/Save buttons - confirming this dialog ALWAYS appears for Basic Information's single global Save (a different pattern from ECT Settings' direct per-section Save with no confirm step).
  3. Click 'Cancel' in the dialog.
    - expect: Dialog closes; NO save/network call is persisted; the PO Number field still shows the unsaved edit 'PO-TEMP'; Save button remains enabled (still dirty).
  4. Clear PO Number back to empty and Tab.
    - expect: Field is empty; Save button returns to disabled (pristine round-trip, confirming Cancel truly aborted persistence with no side effects).

#### 9.2. Save Changes confirm dialog Save button persists the edit and re-disables the page-level Save button

**File:** `tests/local-office/basic-information/save-changes-dialog-confirm.spec.ts`

**Steps:**
  1. Open Basic Information tab (fresh load). Edit Phone 2 to a valid test value (PHONE_TEST_VALUES.recovery '555-000-1111'), Tab.
    - expect: Save button becomes enabled.
  2. Click Save, then click 'Save' inside the 'Save Changes' confirmation dialog.
    - expect: Dialog closes; Save completes without an error toast; the page-level Save button returns to disabled.
  3. Reload the page and re-open Basic Information.
    - expect: Phone 2 shows the persisted value '555-000-1111', confirming the save round-trip actually persisted server-side.
  4. Clear Phone 2 back to empty, Tab, Save, and confirm the dialog again.
    - expect: After reload, Phone 2 is empty again, restoring office 1604 to its original clean state.

#### 9.3. Unsaved Changes dialog Stay/Discard on tab switch behaves identically to the ECT Settings plan's documented dialog

**File:** `tests/local-office/basic-information/unsaved-changes-stay-discard.spec.ts`

**Steps:**
  1. Open Basic Information tab (fresh load). Edit PO Number to a trivial temp value 'TEMP', Tab.
    - expect: Save button becomes enabled.
  2. Click the 'Location Settings History' tab.
    - expect: An 'Unsaved changes' alertdialog (dlgUnsavedLocalOffice) appears with heading 'Unsaved changes', body text 'Are you sure you want to leave this view? Any unsaved changes will be lost.', and Stay/Discard buttons - confirmed IDENTICAL wording to the ECT Settings plan's dialog.
  3. Click 'Stay'.
    - expect: Dialog closes; the app remains on the Basic Information tab; PO Number still shows the unsaved 'TEMP' value; Save button remains enabled.
  4. Click the 'Location Settings History' tab again, then click 'Discard' this time.
    - expect: Navigation completes to the History tab.
  5. Navigate back to the Basic Information tab.
    - expect: PO Number has reverted to its original empty value; Save button is disabled again, confirming Discard fully reverted the pending top-level field edit.

#### 9.4. Hard page reload while Basic Information has unsaved edits triggers the native beforeunload dialog

**File:** `tests/local-office/basic-information/hard-reload-mid-edit.spec.ts`

**Steps:**
  1. Open Basic Information tab (fresh load). Edit Prep Date Offset to a new valid value (e.g. '-2', DATE_OFFSET_TEST_VALUES.valid), Tab.
    - expect: Field shows '-2'; Save button becomes enabled.
  2. Trigger a hard reload of the current URL (e.g. page.reload() or address-bar navigation to the same URL).
    - expect: The browser's NATIVE 'beforeunload' confirmation dialog appears (not the app's custom Radix dialog) and blocks the reload from completing until answered.
  3. Accept the native dialog to allow the reload to complete.
    - expect: Page reloads and lands back on the Basic Information tab (the default tab).
  4. Re-inspect Prep Date Offset.
    - expect: Field shows its original saved value '-1', confirming the unsaved edit did not persist through the reload; Save button is disabled.

### 10. Negative & Edge Cases

**Seed:** `tests/seed.spec.ts`

#### 10.1. Rapid tab-away mid-edit across multiple dirty panels is handled consistently by a single Unsaved Changes dialog

**File:** `tests/local-office/basic-information/edge-rapid-tab-away-multi-panel.spec.ts`

**Steps:**
  1. Open Basic Information tab (fresh load). Make simultaneous unsaved edits in THREE different panels without saving: (a) change Prep Date Offset to '-2', (b) check 'Allow tentative and confirmed Status to have the same priority', (c) rename the 'AV Services' section row to 'AV Test' (valid, non-duplicate).
    - expect: All three edits are visually present; Save button is enabled.
  2. Immediately click the 'ECT Settings' tab (without pausing).
    - expect: The 'Unsaved changes' alertdialog appears before the ECT Settings content renders, blocking navigation, regardless of how many panels are dirty simultaneously.
  3. Click 'Stay'.
    - expect: Dialog closes; Basic Information remains selected; all three edits (Prep=-2, checkbox checked, section renamed) are still present; Save remains enabled.
  4. Click 'ECT Settings' again, then click 'Discard'.
    - expect: Navigation completes to ECT Settings.
  5. Navigate back to Basic Information.
    - expect: ALL THREE edits have been fully reverted: Prep Date Offset shows '-1', the checkbox is unchecked again, and the section grid shows 'AV Services' (not 'AV Test') - confirming Discard reverts every dirty panel simultaneously, not just the most recently touched one; Save button is disabled.

#### 10.2. Non-numeric and out-of-pattern input across all six offset fields is rejected consistently (consolidated pass)

**File:** `tests/local-office/basic-information/edge-non-numeric-all-offset-fields.spec.ts`

**Steps:**
  1. Open Basic Information tab (fresh load).
    - expect: All six offset fields show their documented defaults; Save disabled.
  2. For each of the six offset fields in turn (Prep, Return, Set, Strike, Delivery, Pickup): click, Ctrl+A, type a distinct non-numeric string (e.g. 'xx1', 'yy2', 'zz3', 'aa4', 'bb5', 'cc6'), press Tab.
    - expect: Each field independently shows aria-invalid='true' with its own red alert icon and tooltip after being edited; editing one field does not clear or otherwise affect the invalid state of a previously-edited field.
    - expect: Save button remains disabled throughout (since at least one field is invalid at every point in this sequence).
  3. Restore all six fields to their original default values in sequence (Ctrl+A, Backspace, type default, Tab for each).
    - expect: Each field's aria-invalid becomes 'false' as it is restored; once ALL SIX are restored, the Save button returns to disabled, confirming a full multi-field clean recovery.

#### 10.3. XSS payload across PO Number, PO Number Label, Phone 1, and Phone 2 is stored/rendered as inert text

**File:** `tests/local-office/basic-information/edge-xss-free-text-fields.spec.ts`

**Steps:**
  1. Open Basic Information tab (fresh load) and set up a listener to detect any JS alert() firing.
    - expect: No listener has fired yet.
  2. Click PO Number, Ctrl+A, type XSS_PAYLOAD ('<script>alert(1)</script>'), press Tab.
    - expect: Field's .value is the literal payload string; no alert fires; no <script> element appears in the DOM near this field.
  3. Click PO Number Label, Ctrl+A, type XSS_PAYLOAD, press Tab.
    - expect: Same inert-text result as PO Number.
  4. Click Phone 2 (optional, no format validation), Ctrl+A, type XSS_PAYLOAD, press Tab.
    - expect: Same inert-text result; no invalid state raised (Phone 2 has no format validation) but no script execution either.
  5. Click Phone 1, Ctrl+A, type XSS_PAYLOAD, press Tab.
    - expect: Field's .value is the literal payload string; aria-invalid is 'false' (Phone 1 only validates required-ness, not format, so the payload is 'accepted' as a non-empty string) and no script executes.
  6. Restore all four fields to their original values (PO Number=empty, PO Number Label=empty, Phone 2=empty, Phone 1=DEFAULT_PHONE_1 '760-883-1957'), Tab after each.
    - expect: All four fields show original values; Save button returns to disabled, confirming a full clean revert with no residual script injection anywhere in the DOM (final check: zero <script> elements exist anywhere inside the Basic Information form).

#### 10.4. Simultaneous dirty edits across a top-level field AND a grid row require different revert strategies (documents the dirty-flag asymmetry end-to-end)

**File:** `tests/local-office/basic-information/edge-mixed-simple-and-grid-dirty-revert.spec.ts`

**Steps:**
  1. Open Basic Information tab (fresh load). Edit Return Date Offset to '2' (a simple top-level field), Tab.
    - expect: Save becomes enabled; Return shows '2'.
  2. Restore Return Date Offset back to '1', Tab.
    - expect: Return shows '1'; Save button returns to DISABLED - confirms the simple field alone correctly recomputes pristine.
  3. Now edit the 'Ballroom A' room row to 'Ballroom X' and back to 'Ballroom A' (a grid row edit), Tab after each.
    - expect: After both edits, Room Configuration shows 'Ballroom A' again, but the Save button is now ENABLED (dirty) - confirms the grid-row edit alone does NOT recompute pristine even though its final displayed value matches the original.
  4. Reload the page (accept the native beforeunload dialog) rather than expecting Save to auto-disable.
    - expect: After reload, Return Date Offset shows '1' and the Room Configuration grid shows 'Ballroom A' - both fields match their original baseline, and Save is disabled, confirming the reload/discard path is the only reliable clean-revert mechanism for grid-row edits.

#### 10.5. Hard reload mid-edit with edits spanning multiple panels discards all of them uniformly

**File:** `tests/local-office/basic-information/edge-reload-multi-panel-dirty.spec.ts`

**Steps:**
  1. Open Basic Information tab (fresh load). Make edits in three places without saving: Set Date Offset='-3', PO Number='TEMP-PO', and toggle the first Discount Exemptions row's Exempt state off.
    - expect: All three edits are visually present; Save button is enabled.
  2. Trigger a hard reload (page.reload()).
    - expect: The native beforeunload dialog appears; accept it to proceed.
  3. After reload, re-open Basic Information and inspect all three edited locations.
    - expect: Set Date Offset shows its original '-1'; PO Number is empty again; the first Discount Exemptions row shows its original Exempt state - confirming a hard reload discards ALL unsaved edits across every panel/grid uniformly, matching the ECT Settings plan's documented reload behavior applied here to Basic Information.
    - expect: Save button is disabled.

### 11. Cross-Office Edge-Case Coverage (states observed live on office 1101, simulated on 1604)

**Seed:** `tests/seed.spec.ts`

A live coverage audit of office 1101 ("1101 - Corporate Office Encore USA SGA" — the office named in this module's original design spec/screenshot) against this plan and its 49-scenario spec found the underlying validation rules and dependency cascades hold generally (1101 starts from the opposite Use Availability checkbox state and the same cascade fired correctly in reverse), but surfaced two grid states that occur naturally on 1101 and were never exercised against 1604: a genuinely empty Room Configuration grid (zero data rows, not just zero after an in-test delete), and a Section grid where all 9 of the Default button's module-spec names already exist (so Default legitimately adds nothing — the complement of 5.7's "adds exactly 2" case). Every other baseline value asserted throughout this plan (`SECTION_GRID_BASELINE`, `ROOM_GRID_BASELINE`, `MISC_CHECKBOX_BASELINE`, `DATE_OFFSET_DEFAULTS`, `COMPANY_LOGO.default`, `DEFAULT_PHONE_1`, etc.) remains pinned to office 1604's live data, matching this repo's existing convention (`OFFICE_NO` in `src/data/common.ts`, the ECT Settings plan) — 1604 is evidently the dedicated QA office (its grids are full of rows literally named "Test Section", "Room Edit Test", etc.), so both edge cases below are simulated there (delete/seed → verify → restore) rather than mutating the real corporate office 1101.

#### 11.1. Room Configuration grid behaves correctly with zero data rows (simulated empty-grid state)

**File:** `tests/local-office/basic-information/edge-empty-room-grid.spec.ts`

**Steps:**
  1. Open Basic Information tab (fresh load). Confirm the Room Configuration grid shows its normal 4-row baseline.
    - expect: All 4 baseline room names present.
  2. Delete all 4 rows via the right-click context menu, then Save and confirm.
    - expect: Grid shows 0 rows; Save completes; Save button returns to disabled.
  3. Reload the page and re-open Basic Information.
    - expect: The grid genuinely loads with 0 data rows (only the "Add New..." placeholder) — matches office 1101's live state.
  4. Type a new name into "Add New..." and press Tab.
    - expect: A single row appears — the very first row ever added to an empty grid — with Active=true by default; Save button becomes enabled.
  5. Delete that row via the right-click context menu, then Save and confirm.
    - expect: Grid returns to 0 rows; Save completes.
  6. Re-add all 4 original room names (any order — the grid's alphabetical auto-sort settles them back into the original order), then Save and confirm.
    - expect: All 4 original names reappear, each Active=true by default (matching their original state); Save completes.
  7. Reload the page and re-open Basic Information.
    - expect: The grid shows exactly the original 4-row baseline, all Active, confirming office 1604 is left clean; Save button is disabled.

#### 11.2. Default Sections button adds zero rows once all 9 module-spec names already exist

**File:** `tests/local-office/basic-information/edge-default-sections-noop.spec.ts`

**Steps:**
  1. Open Basic Information tab (fresh load). Confirm the Section grid shows its normal 14-row baseline (7 of the module spec's 9 default names already present; Audio and High Speed Internet Access absent, per 5.7).
    - expect: Baseline confirmed.
  2. Add "Audio" and "High Speed Internet Access" via "Add New..." (not the Default button), then Save and confirm; reload and re-open Basic Information.
    - expect: Grid now genuinely contains, and persists, all 9 of the module spec's default names (16 rows total) — reproducing the state observed live on office 1101.
  3. Click the "Default" button.
    - expect: No new rows are added and the grid's contents are completely unchanged (all 9 module-spec names already existed); Save button stays disabled (consistent with 5.7's finding that Default's mutations aren't tracked as dirty — here there's simply nothing to mutate).
  4. Delete "Audio" and "High Speed Internet Access" via the right-click context menu, then Save and confirm.
    - expect: Grid returns to the original 14 rows; Save completes.
  5. Reload the page and re-open Basic Information.
    - expect: The grid shows exactly the original 14-row baseline, confirming office 1604 is left clean.
