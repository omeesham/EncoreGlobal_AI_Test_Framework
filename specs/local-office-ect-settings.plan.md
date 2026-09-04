# ECT Settings Tab (Local Office Settings) - UI Automation & Field-Level Validation Test Plan

## Application Overview

Scope: UI Automation & Field-level Validation of the ECT Settings tab under Local Office Settings in Encore Navigator Cloud (new MFE), for office 1604 - Parker Palm Springs.

App entry point: {BASE_URL}locations/1604/settings/local-office (BASE_URL = https://cloudapps-e2e.encoreglobal.com/navigator/), reached after Microsoft SSO login. The tab strip shows, in order: Basic Information, Location Settings History, ECT Settings. This plan targets only the ECT Settings tab; navigating to it is a shared precondition for every scenario below.

Confirmed live layout of the tab (verified against the E2E environment with account s-prd-clickauto@psav.com):
- Header: h6 location label "1604 - Parker Palm Springs", an "Edit/View :" caption plus a Commission structure link (external, points to https://navigator.psav.com/#/commissons/commissiontier/:1604/, opens in the same tab - no target=_blank), and a "Select Currency :" combobox defaulting to USD. For office 1604 only one currency option (USD) is configured - the multi-currency reload scenario is written to be data-driven/conditional because this office cannot fully exercise it.
- Event Profit Target table (read-only): columns Lower Limit, Upper Limit, Target, Currency (the header literally reads "Target", not "Target %", even though cell values are formatted as percentages, e.g. "40.0%"). 9 data rows observed, all currency USD.
- Fixed Costs panel, with its own Save button (initially disabled):
  - Display-only (no input): Venue Fixed Costs (e.g. 13.9%), SG&A % (8.0%), Other Rate (0.0%), No Labor Rate (0.0%), Approval Threshold ($10,000,000.00), Peak Labor Adjustment % (5.0%), Non-Peak Labor Adjustment % (0.0%).
  - Editable: Benefits Multiplier (default 20.0%) and Historical Subrental % (default 0.0%). Both are required, numeric-only inputs formatted as a percentage after blur (e.g. typed "0.25" -> displays "25.0%"; refocusing shows the raw decimal "0.25" for editing).
  - Three description paragraphs render below the fields.
- Labor Cost Assumptions grid, with its own Save button (initially disabled): 66 data rows, columns Labor Class (read-only) and Labor Cost (editable decimal rate, currency-like, 2-decimal rounding on blur).
- SubRental Matrix table (read-only): columns Lower Limit, Upper Limit, Subrental Percentage, Currency. 9 data rows observed.

Confirmed live behaviors (exploratory testing performed against the real E2E app, all edits discarded afterward to leave the environment clean):
- The tab is intermittently slow/flaky: on one load attempt the header/currency/Benefits Multiplier/Historical Subrental fields rendered while all three tables (Event Profit Target, Labor Cost Assumptions, SubRental Matrix) still showed 0 rows; waiting ~2s longer and/or reloading resolved it. Tests must poll/retry rather than assume a single render pass is complete.
- Benefits Multiplier / Historical Subrental validation: clearing the field, typing "abc", or typing a negative number (e.g. "-5") all result in the field being wiped to empty and marked invalid - a destructive (red) border/ring appears together with a red circle-alert icon; hovering the icon shows a tooltip "Please enter a valid number". The Fixed Costs Save button stays disabled while either field is invalid. Typing a valid decimal (e.g. "0.25") clears the invalid state and formats to "25.0%" on blur. An extremely long numeric string (20+ digits) is accepted with NO validation cap and suffers floating-point precision loss in display (e.g. "99999999999999999999" renders as "100000000000000000000.0%") - flagged as an edge case/discrepancy for dev awareness, not treated as an automation bug.
- Editing either Benefits Multiplier or Historical Subrental enables the Fixed Costs Save button only; the Labor Cost Assumptions Save button remains disabled, confirming independence, and vice versa when a Labor Cost row is edited.
- Labor Cost Assumptions grid rate editor behaves differently from the Fixed Costs fields: typing non-numeric text (e.g. "abc") is silently rejected and the cell reverts to its last valid value on blur (no red/invalid indicator shown); typing a negative number (e.g. "-15") is accepted but the minus sign is stripped, saving the absolute value ("15.00") instead of being rejected; decimal input is rounded to 2 decimal places on blur (e.g. "42.999" -> "43.00"). Pressing Escape while mid-edit in a grid cell does NOT revert the value (unlike the Escape-to-cancel pattern used elsewhere in Basic Information's Section/Room tables) - the typed value persists and dirties the Save button.
- No explicit inline "Cancel" button exists next to the Labor Cost Assumptions Save button (only "Save"). The discard/cancel behavior described in the module spec is achieved via the app's global "Unsaved changes" dialog: clicking a different top-level tab (e.g. Basic Information) while any ECT section is dirty raises an alertdialog "Unsaved changes - Are you sure you want to leave this view? Any unsaved changes will be lost." with Stay / Discard buttons. Stay keeps the edits and remains on ECT Settings. Discard completes the navigation; returning to ECT Settings afterward reloads fresh values from the server and fully reverts all dirty Fixed Costs and Labor Cost Assumptions edits, with both Save buttons returning to disabled.
- Performing a hard page reload (or address-bar navigation) while ECT Settings has unsaved edits triggers the browser's NATIVE beforeunload confirmation dialog (distinct from the app's custom Radix "Unsaved changes" dialog) - this blocks automated navigation until the dialog is accepted/dismissed. After confirming, the app reloads to its default tab (Basic Information), i.e. the ECT tab selection is not preserved/deep-linked across a hard reload.
- Using Playwright's fill() (direct value assignment) against the Labor Cost rate editor produces unreliable/incorrect results (observed a concatenation bug producing "3520.00" from sequential fills) because the component is keystroke-driven. Reliable automation must drive edits via real keyboard events: click, then Ctrl+A, then Backspace, then type, then Tab - matching the existing fillLaborCost() helper pattern already implemented in this repo (src/pages/local-office/local-office-ect.page.ts).
- Permission observation: with the current test account, the Benefits Multiplier input is NOT disabled and both Save buttons are present/interactive, indicating canEditLocSetting and canEditLaborCost both evaluate true for this account/location. No restricted/read-only permission state was observed live; the plan includes a conditional read-only scenario to be executed only when a restricted-permission account or location is available, with instructions to skip gracefully otherwise.

This plan reuses existing framework page-object/selector conventions already present in the repository (src/pages/local-office/local-office-ect.page.ts, src/selectors/local-office/local-office-ect.ts, src/data/local-office/local-office-ect.ts) so that test authors can implement each scenario directly against those data-testid selectors (e.g. ect-settings-input-benefits-multiplier, ect-settings-input-historical-subrental, ect-settings-btn-save-fixed-costs-btn, ect-settings-btn-save-labor-costs-btn, ect-settings-table-event-profit-target, ect-settings-table-labor-cost-assumptions, ect-settings-table-sub-rental-matrix, ect-settings-select-currency).

Every scenario below assumes a fresh/blank starting state: freshly authenticated session, freshly navigated to {BASE_URL}locations/1604/settings/local-office, and the ECT Settings tab freshly opened (with the documented retry-on-load-flakiness handling) before any scenario-specific steps begin. Scenarios are independent and may be run in any order; any scenario that leaves data dirty ends by discarding its changes (via the Unsaved Changes dialog or explicit re-edit + Save) so it does not affect subsequent runs.

## Test Scenarios

### 1. Tab Load & Layout (Happy Path)

**Seed:** `tests/seed.spec.ts`

#### 1.1. ECT Settings tab loads with all four sections and expected header

**File:** `tests/local-office/ect-settings/tab-load.spec.ts`

**Steps:**
  1. Log in via Microsoft SSO and navigate to {BASE_URL}locations/1604/settings/local-office.
    - expect: Local Office Settings page loads with the Basic Information tab selected by default.
  2. Click the 'ECT Settings' tab. If the panel shows 'No currencies for selected location' or 'No data available', wait ~1-2s and reload up to 3 more times before failing.
    - expect: The ECT Settings tab becomes selected (aria-selected=true).
    - expect: The location name heading '1604 - Parker Palm Springs' is visible.
    - expect: The 'Edit/View :' caption and 'Commission structure' link are visible.
    - expect: The 'Select Currency :' combobox is visible and shows a non-empty selected value (e.g. USD).
  3. Locate the Event Profit Target section.
    - expect: Heading 'Event Profit Target' is visible.
    - expect: Table has exactly the columns Lower Limit, Upper Limit, Target, Currency.
    - expect: Table body contains at least 1 row (expected 9 for office 1604) and no row is empty/placeholder text.
  4. Locate the Fixed Costs panel (shares a section with Event Profit Target).
    - expect: Fields Venue Fixed Costs, SG&A %, Benefits Multiplier, Other Rate, No Labor Rate, Approval Threshold, Historical Subrental %, Peak Labor Adjustment %, Non-Peak Labor Adjustment % are all visible with non-blank values.
    - expect: A 'Save' button is visible directly above/beside this panel and is disabled on initial load.
    - expect: Three descriptive paragraphs render below the fields.
  5. Locate the Labor Cost Assumptions section.
    - expect: Heading 'Labor Cost Assumptions' is visible.
    - expect: Its own 'Save' button is visible and disabled on initial load.
    - expect: Table has columns Labor Class, Labor Cost.
    - expect: Table body contains multiple rows (expected 66 for office 1604), each Labor Class cell is non-empty text and each Labor Cost cell contains an editable input with a non-blank numeric value.
  6. Locate the SubRental Matrix section.
    - expect: Heading 'SubRental Matrix' is visible.
    - expect: Table has columns Lower Limit, Upper Limit, Subrental Percentage, Currency.
    - expect: Table body contains at least 1 row (expected 9 for office 1604).
  7. Note and record any wording/column/label discrepancy against this plan's description (e.g. 'Target' vs 'Target %').
    - expect: Any discrepancy is logged as an observation, not treated as a hard failure unless it breaks a subsequent assertion in another scenario.

#### 1.2. Event Profit Target and SubRental Matrix tables are fully read-only

**File:** `tests/local-office/ect-settings/read-only-tables.spec.ts`

**Steps:**
  1. Open the ECT Settings tab (fresh load).
    - expect: Tab loads with data as described in the happy-path scenario.
  2. Within the Event Profit Target table, query for any input, textarea, select, or contenteditable element across every row and column.
    - expect: Zero editable elements are found anywhere in the table.
  3. Attempt to click/double-click a cell in the Event Profit Target table (e.g. the 'Target' cell of the first row).
    - expect: No input appears; the cell remains static text; no edit affordance (cursor, border) appears.
  4. Within the SubRental Matrix table, query for any input, textarea, select, or contenteditable element across every row and column.
    - expect: Zero editable elements are found anywhere in the table.
  5. Attempt to click/double-click a cell in the SubRental Matrix table.
    - expect: No input appears; the cell remains static text.
  6. Confirm the Labor Class column of the Labor Cost Assumptions grid is also read-only (only the Labor Cost column is editable).
    - expect: The first cell of each Labor Cost Assumptions row (Labor Class) contains no input element, while the second cell (Labor Cost) does contain an input element.

### 2. Field-Level Validation - Benefits Multiplier & Historical Subrental %

**Seed:** `tests/seed.spec.ts`

#### 2.1. Benefits Multiplier: required-field and invalid-input rejection

**File:** `tests/local-office/ect-settings/benefits-multiplier-validation.spec.ts`

**Steps:**
  1. Open the ECT Settings tab (fresh load) and record the current Benefits Multiplier value (expected default '20.0%').
    - expect: Field is visible, enabled, and shows a formatted percentage value.
  2. Click the Benefits Multiplier input, select all (Ctrl+A), press Backspace to clear it, then press Tab to blur.
    - expect: Field value becomes empty.
    - expect: Field's visual state switches to an invalid/destructive style (red border/ring) and a red alert icon appears next to it.
    - expect: Hovering the alert icon shows a tooltip containing 'Please enter a valid number' (or equivalent required-field message).
    - expect: The Fixed Costs section's Save button remains disabled.
  3. With the field still empty/invalid, click it, type 'abc', and press Tab to blur.
    - expect: Field remains empty and still shows the invalid/destructive state (non-numeric input is rejected, not accepted as literal text).
    - expect: Save button for Fixed Costs remains disabled.
  4. Click the field, select all, backspace, type a negative number '-5', and press Tab to blur.
    - expect: Field is wiped to empty and still shows the invalid/destructive state (negative values are treated as invalid for this field, not silently made positive).
    - expect: Save button for Fixed Costs remains disabled.
  5. Click the field, select all, backspace, type a valid decimal '0.25', and press Tab to blur.
    - expect: Field reformats to '25.0%'.
    - expect: Invalid/destructive styling and alert icon disappear.
    - expect: Fixed Costs Save button becomes enabled (dirty + valid).
  6. Click the field again (without changing anything) to inspect the raw edit-mode value.
    - expect: Raw input value while focused is the unformatted decimal '0.25' (formatting is only applied on blur/display).
  7. Without saving, click the 'Basic Information' tab to trigger the app's Unsaved Changes dialog, then click 'Discard'.
    - expect: An 'Unsaved changes' alertdialog appears with Stay/Discard buttons before navigation completes.
    - expect: After clicking Discard, navigation to Basic Information completes.
  8. Navigate back to the ECT Settings tab.
    - expect: Benefits Multiplier has reverted to its original value ('20.0%') and the Fixed Costs Save button is disabled again, confirming the discard fully reverted the unsaved edit.

#### 2.2. Historical Subrental %: required-field, invalid-input rejection, and boundary/long-value handling

**File:** `tests/local-office/ect-settings/historical-subrental-validation.spec.ts`

**Steps:**
  1. Open the ECT Settings tab (fresh load) and record the current Historical Subrental % value (expected default '0.0%').
    - expect: Field is visible, enabled, and shows a formatted percentage value.
  2. Click the field, select all, backspace, and press Tab to blur (clear it).
    - expect: Field becomes empty and shows the invalid/destructive state with the red alert icon and 'Please enter a valid number' tooltip.
    - expect: Fixed Costs Save button remains disabled.
  3. Click the field, select all, backspace, type 'abc', press Tab.
    - expect: Field remains empty and invalid (non-numeric text rejected).
  4. Click the field, select all, backspace, type a negative number '-1', press Tab.
    - expect: Field is wiped to empty and remains invalid (negative rejected, not treated as positive).
  5. Click the field, select all, backspace, type a valid decimal '0.1', press Tab.
    - expect: Field reformats to '10.0%'.
    - expect: Invalid state clears; Fixed Costs Save button becomes enabled.
  6. Click the field, select all, type an extremely long numeric string (20+ digits, e.g. '99999999999999999999'), press Tab.
    - expect: Document the actual behavior observed: on the live E2E environment this value was ACCEPTED (not flagged invalid) and rendered with floating-point precision loss (e.g. '100000000000000000000.0%'). Treat any change from 'silently accepted with precision loss' to 'properly rejected/capped' as an improvement, not a regression; treat a crash, frozen UI, or NaN display as a failure.
  7. Without saving, click the 'Basic Information' tab, then click 'Discard' on the Unsaved Changes dialog, then re-open the ECT Settings tab.
    - expect: Historical Subrental % has reverted to its original value ('0.0%') and the Fixed Costs Save button is disabled again.

#### 2.3. Save/Cancel independence: editing Benefits Multiplier or Historical Subrental never enables the Labor Cost Assumptions Save button

**File:** `tests/local-office/ect-settings/fixed-costs-save-independence.spec.ts`

**Steps:**
  1. Open the ECT Settings tab (fresh load).
    - expect: Both the Fixed Costs Save button and the Labor Cost Assumptions Save button are disabled.
  2. Edit Benefits Multiplier to a new valid value (e.g. '0.21') and blur.
    - expect: Fixed Costs Save button becomes enabled.
    - expect: Labor Cost Assumptions Save button remains disabled.
  3. Click the Fixed Costs Save button.
    - expect: Save completes (no error toast/dialog).
    - expect: Fixed Costs Save button returns to disabled once the save completes and the form is pristine again.
    - expect: Labor Cost Assumptions Save button is still disabled and unaffected.
  4. Restore Benefits Multiplier back to its original value ('0.2' / '20.0%'), blur, and click the Fixed Costs Save button again to leave the location's data unchanged for other tests.
    - expect: Benefits Multiplier displays '20.0%' again after save; Fixed Costs Save button disables once more.

### 3. Labor Cost Assumptions Grid

**Seed:** `tests/seed.spec.ts`

#### 3.1. Editing a valid Labor Cost rate enables its Save button independently of Fixed Costs Save

**File:** `tests/local-office/ect-settings/labor-cost-edit-independence.spec.ts`

**Steps:**
  1. Open the ECT Settings tab (fresh load).
    - expect: Both Save buttons are disabled.
  2. Record the current Labor Cost value of a known row (e.g. 'Labor Brokering', originally '41.00'). Click its Labor Cost input, Ctrl+A, Backspace, type '42', press Tab.
    - expect: Cell now displays '42.00' (2-decimal formatting).
    - expect: Labor Cost Assumptions Save button becomes enabled.
    - expect: Fixed Costs Save button remains disabled (independence confirmed).
  3. Click the Labor Cost Assumptions Save button.
    - expect: Save completes without error.
    - expect: Labor Cost Assumptions Save button returns to disabled once pristine.
    - expect: Reloading/re-navigating to the tab shows the new value '42.00' persisted.
  4. Restore the row back to its original value ('41.00' for 'Labor Brokering'), Tab, and click Save again to leave test data clean for subsequent runs.
    - expect: Value reverts to '41.00' and persists after save; Save button disables again.

#### 3.2. Only dirty (edited) Labor Cost rows are affected by Save; untouched rows are unaffected

**File:** `tests/local-office/ect-settings/labor-cost-dirty-rows-only.spec.ts`

**Steps:**
  1. Open the ECT Settings tab (fresh load) and record the values of two rows: Row A (e.g. first row, 'Administrative Fee') and Row B (e.g. a middle row).
    - expect: Both rows show their original values and the Labor Cost Assumptions Save button is disabled.
  2. Edit only Row A to a new valid value and blur (leave Row B untouched).
    - expect: Row A shows the new value; Row B is unchanged; Save button enabled.
  3. Click Save.
    - expect: Save completes successfully.
  4. Reload the page and re-open the ECT Settings tab.
    - expect: Row A now shows the newly saved value.
    - expect: Row B still shows its original, untouched value (confirms only the dirty row was persisted, not the whole grid).
  5. Restore Row A to its original value and Save again, to leave the location's data clean.
    - expect: Row A reverts to its original value after save.

#### 3.3. Labor Cost rate editor rejects/reformats invalid input (non-numeric, negative, excess decimals)

**File:** `tests/local-office/ect-settings/labor-cost-invalid-input.spec.ts`

**Steps:**
  1. Open the ECT Settings tab (fresh load). Pick a row with a known non-zero value (e.g. 'Attendee Tracking Labor', '35.00').
    - expect: Row shows its original value.
  2. Click the input, Ctrl+A, Backspace, type 'abc', press Tab.
    - expect: The cell reverts to its last valid value ('35.00') on blur rather than accepting the non-numeric text or showing a persistent red/invalid indicator (behavior differs from Benefits Multiplier / Historical Subrental, which show an explicit invalid state instead of silently reverting).
  3. Click the input, Ctrl+A, Backspace, type a negative value '-20', press Tab. IMPORTANT: use real keystrokes (click, Ctrl+A, Backspace, type, Tab) rather than a direct value-assignment/fill, since this custom decimal editor does not reliably accept programmatic fill().
    - expect: The minus sign is stripped and the absolute value is accepted and formatted, e.g. '20.00' (negative is NOT rejected here, unlike the Fixed Costs percentage fields) - document this asymmetry explicitly in the test assertion/comment.
  4. Click the input, Ctrl+A, Backspace, type '42.999' (3 decimal places), press Tab.
    - expect: Value is rounded to 2 decimal places on blur, e.g. '43.00'.
  5. Click the input, Ctrl+A, Backspace, type an extremely long numeric string, press Tab.
    - expect: Document actual behavior: value is accepted/rounded/truncated without a UI crash; flag any NaN, frozen UI, or console error as a failure.
  6. While mid-edit (input focused, new uncommitted text typed but not yet blurred), press Escape.
    - expect: Escape does NOT revert the in-progress edit back to the original value (confirmed different from the Section/Room Escape-to-cancel pattern on the Basic Information tab) - the typed value remains and the row stays dirty. Assert this explicitly so a future UX change that adds Escape-to-cancel here is caught as an intentional improvement.
  7. Discard all changes made in this test via the Unsaved Changes dialog: click another tab, then click 'Discard'.
    - expect: Navigation completes; re-opening ECT Settings shows the row(s) reverted to their original values and the Labor Cost Assumptions Save button is disabled.

#### 3.4. Cancel/Discard reverts unsaved Labor Cost Assumptions edits without requiring a real page reload button

**File:** `tests/local-office/ect-settings/labor-cost-cancel.spec.ts`

**Steps:**
  1. Open the ECT Settings tab (fresh load) and confirm there is no inline 'Cancel' button next to the Labor Cost Assumptions 'Save' button (only 'Save' exists in that section's action row).
    - expect: Only a single 'Save' button is present for the Labor Cost Assumptions section; document this as the section's only explicit action control.
  2. Edit two different Labor Cost rows to new valid values (do not click Save).
    - expect: Both rows show new values; Labor Cost Assumptions Save button is enabled.
  3. Click a different top-level tab (e.g. 'Location Settings History').
    - expect: The global 'Unsaved changes' alertdialog appears with the message 'Are you sure you want to leave this view? Any unsaved changes will be lost.' and Stay/Discard buttons.
  4. Click 'Stay'.
    - expect: Dialog closes; the app remains on the ECT Settings tab; both edited rows still show their new (unsaved) values; Save button remains enabled.
  5. Click the different tab again, then click 'Discard' this time.
    - expect: Navigation completes to the other tab.
  6. Navigate back to the ECT Settings tab.
    - expect: Both previously edited rows now show their original values (edits were discarded, not persisted).
    - expect: Labor Cost Assumptions Save button is disabled again.

### 4. Save/Cancel Section Independence

**Seed:** `tests/seed.spec.ts`

#### 4.1. Fixed Costs Save and Labor Cost Assumptions Save operate fully independently in both directions

**File:** `tests/local-office/ect-settings/save-independence-both-directions.spec.ts`

**Steps:**
  1. Open the ECT Settings tab (fresh load). Confirm both Save buttons are disabled.
    - expect: Fixed Costs Save disabled; Labor Cost Assumptions Save disabled.
  2. Edit Historical Subrental % to a new valid value only (leave Labor Cost grid untouched), and blur.
    - expect: Fixed Costs Save enabled; Labor Cost Assumptions Save still disabled.
  3. Click the Fixed Costs Save button and wait for it to return to disabled.
    - expect: Fixed Costs Save re-disables after the save completes (signals save success + pristine form).
    - expect: Labor Cost Assumptions Save remains disabled throughout - the Fixed Costs save did not require or trigger it.
  4. Now edit a Labor Cost row only (Fixed Costs section already pristine from the prior step), and blur.
    - expect: Labor Cost Assumptions Save enabled; Fixed Costs Save remains disabled.
  5. Click the Labor Cost Assumptions Save button and wait for it to return to disabled.
    - expect: Labor Cost Assumptions Save re-disables after completion.
    - expect: Fixed Costs Save remains disabled throughout - the Labor Cost save did not require or trigger it.
  6. Restore both the Historical Subrental % value and the edited Labor Cost row back to their original values, saving each section again.
    - expect: Both sections show their original values again and both Save buttons are disabled, leaving test data clean.

### 5. Currency Switch

**Seed:** `tests/seed.spec.ts`

#### 5.1. Currency dropdown reload behavior (data-dependent; run against a multi-currency office if available)

**File:** `tests/local-office/ect-settings/currency-switch.spec.ts`

**Steps:**
  1. Open the ECT Settings tab (fresh load) for office 1604 and record the current currency selection and the full set of Event Profit Target / SubRental Matrix row values plus the Fixed Costs field values.
    - expect: Currency combobox shows 'USD'.
  2. Click the currency combobox to inspect available options.
    - expect: On office 1604 as observed live, only a single option ('USD') is available. If more than one currency option is present (e.g. on a different office in your environment), continue to the next steps; otherwise mark this scenario 'blocked - insufficient currency data at this office' and stop here without failing the suite.
  3. (Only if multiple currencies are available) Select a different currency option from the dropdown.
    - expect: The ECT Settings panel reloads its data (a brief loading state may appear) without navigating away from the ECT Settings tab or the Local Office Settings page.
    - expect: Event Profit Target and SubRental Matrix table rows refresh to reflect the newly selected currency's rows (currency column values match the new selection).
    - expect: Fixed Costs display values (and the Currency column values) update/refresh accordingly.
    - expect: Any unsaved edits present before the switch are handled consistently with the app's dirty-state guard (either blocked with the Unsaved Changes dialog, or silently discarded) - document actual behavior observed.
  4. (Only if switched) Switch the currency back to the original value (USD).
    - expect: Data reloads again and matches the originally recorded values, confirming the reload round-trips correctly with no residual stale data from the other currency.

### 6. Permission-Driven States

**Seed:** `tests/seed.spec.ts`

#### 6.1. Editable state confirmed for current test account (canEditLocSetting / canEditLaborCost both true)

**File:** `tests/local-office/ect-settings/permission-editable-state.spec.ts`

**Steps:**
  1. Log in as the standard automation account (s-prd-clickauto@psav.com) and open the ECT Settings tab (fresh load).
    - expect: Benefits Multiplier input is enabled (not disabled, no readonly attribute) - confirms canEditLaborCost is true for this account/location.
    - expect: Historical Subrental % input is enabled - confirms general edit capability for EPT settings.
    - expect: Both the Fixed Costs Save and Labor Cost Assumptions Save controls are present in the DOM (even while disabled due to a pristine form) - confirms canEditLocSetting is true (Save controls are not hidden outright).
  2. Make a trivial valid edit to Benefits Multiplier and confirm the Save button becomes clickable (not merely visible but disabled due to permissions).
    - expect: Save button is enabled and, when clicked, completes without a 403/permission error toast.
  3. Restore the value and re-save to leave data clean.
    - expect: Value reverts and Save disables again.

#### 6.2. Read-only/disabled state for a restricted-permission account (conditional - requires a second test account/role)

**File:** `tests/local-office/ect-settings/permission-readonly-state.spec.ts`

**Steps:**
  1. IF a test account/role without canEditLocSetting and/or canEditLaborCost is available, log in with it and open the ECT Settings tab (fresh load). If no such account exists in the current environment, mark this scenario 'skipped - no restricted-permission account available' and do not fail the suite.
    - expect: Page loads without error for the restricted account.
  2. (canEditLocSetting = false) Inspect the Fixed Costs and Labor Cost Assumptions sections.
    - expect: Save button(s) are either hidden or permanently disabled regardless of any attempted edit.
    - expect: All previously-editable inputs (Benefits Multiplier, Historical Subrental %, Labor Cost rate cells) render as read-only/disabled and cannot be typed into.
  3. (canEditLaborCost = false, canEditLocSetting = true) If this specific combination is available, open the ECT Settings tab.
    - expect: Benefits Multiplier renders as disabled/read-only (per the legacy spec's default-sentinel/disabled state) while Historical Subrental % and the Labor Cost Assumptions grid remain editable, since Historical Subrental is described as always settable once EPT SubRentalCosts data loads.
    - expect: Attempting to click/focus the disabled Benefits Multiplier input has no editing effect.
  4. Attempt to edit any read-only field via keyboard (Tab into it, type a value).
    - expect: No value changes are accepted; the field's displayed value is unchanged; no Save button becomes enabled as a result.

### 7. Negative & Edge Cases

**Seed:** `tests/seed.spec.ts`

#### 7.1. Rapid tab-away with unsaved changes shows the Unsaved Changes dialog and honors Stay/Discard correctly

**File:** `tests/local-office/ect-settings/edge-unsaved-tab-away.spec.ts`

**Steps:**
  1. Open the ECT Settings tab (fresh load). Make a valid edit to Benefits Multiplier (do not save).
    - expect: Fixed Costs Save button is enabled.
  2. Immediately (without pausing) click the 'Location Settings History' tab.
    - expect: The 'Unsaved changes' alertdialog appears before the History tab content renders, blocking navigation.
    - expect: The dialog text reads 'Are you sure you want to leave this view? Any unsaved changes will be lost.' with 'Stay' and 'Discard' actions.
  3. Click 'Stay'.
    - expect: Dialog closes; ECT Settings tab remains selected and active; the unsaved Benefits Multiplier edit is still present and the Save button is still enabled.
  4. Click the 'Basic Information' tab, then click 'Discard' on the resulting dialog.
    - expect: Navigation completes to Basic Information; its form renders normally.
  5. Navigate back to ECT Settings.
    - expect: Benefits Multiplier shows its original value again; Fixed Costs Save button is disabled - confirming Discard fully reverted the pending edit and no stale dirty state carries over between tab switches.

#### 7.2. Hard page reload while ECT Settings has unsaved edits triggers the native beforeunload dialog

**File:** `tests/local-office/ect-settings/edge-reload-mid-edit.spec.ts`

**Steps:**
  1. Open the ECT Settings tab (fresh load). Make a valid edit to Benefits Multiplier (e.g. type '0.3') and blur, but do not save.
    - expect: Benefits Multiplier shows the new formatted value ('30.0%'); Fixed Costs Save is enabled.
  2. Trigger a hard reload of the current URL (e.g. address-bar reload or page.reload()).
    - expect: The browser's NATIVE 'beforeunload' confirmation dialog appears (not the app's custom Radix dialog) and blocks the reload from completing until it is answered.
    - expect: If the automation accepts/confirms the native dialog, the reload proceeds; if it is dismissed/cancelled, the reload is aborted and the unsaved edit remains on screen.
  3. Accept the native dialog to allow the reload to complete.
    - expect: Page reloads and lands on the DEFAULT tab (Basic Information), not on ECT Settings - confirming the tab selection is not preserved across a hard reload and the unsaved edit is discarded by the reload itself.
  4. Re-open the ECT Settings tab.
    - expect: Benefits Multiplier shows its original saved value ('20.0%'), confirming the unsaved edit did not persist through the reload.

#### 7.3. Extremely long numeric input across both editable Fixed Costs fields and a Labor Cost cell does not crash or corrupt the UI

**File:** `tests/local-office/ect-settings/edge-long-numeric-input.spec.ts`

**Steps:**
  1. Open the ECT Settings tab (fresh load).
    - expect: Tab loads normally.
  2. Type a 20+ digit numeric string into Benefits Multiplier and blur.
    - expect: No JavaScript error/console exception is thrown; the UI remains responsive; the field either displays a (possibly precision-lossy) formatted percentage or is rejected as invalid - assert it is one of these two outcomes and not a frozen/blank/NaN state.
  3. Repeat the same long numeric string into Historical Subrental % and blur.
    - expect: Same non-crashing outcome as above.
  4. Repeat the same long numeric string into a Labor Cost Assumptions row's rate cell and blur.
    - expect: Same non-crashing outcome; value is rounded/truncated/rejected but the grid remains interactive afterward (other rows still editable).
  5. Discard all changes via the Unsaved Changes dialog (switch tabs, click Discard).
    - expect: Re-opening ECT Settings shows all three fields/rows reverted to their original values.

#### 7.4. Empty/no-data fallback text renders correctly when the ECT API is slow or returns no data (retry-driven)

**File:** `tests/local-office/ect-settings/edge-empty-state.spec.ts`

**Steps:**
  1. Open the ECT Settings tab and, on the FIRST render pass only (before any manual retry/reload), immediately query all three tables (Event Profit Target, Labor Cost Assumptions, SubRental Matrix) for row counts and for the fallback text 'No data available' / 'No currencies for selected location'.
    - expect: Document whichever state is observed on first render: either populated tables, or one/more of the fallback texts. This is expected to be intermittent/flaky per prior observation; do not fail the test solely for encountering the fallback text on the first pass.
  2. If a fallback/empty state was observed, wait ~1-2 seconds and re-query the same tables without reloading.
    - expect: Tables typically populate with data shortly after (observed live: header/Fixed Costs fields rendered before the three tables finished loading, briefly showing 0 rows).
  3. If still empty after waiting, reload the page, re-open the ECT Settings tab, and re-check (repeat up to 3 times total).
    - expect: After at most 3 reload attempts, all three tables show their expected non-empty data. If data-loading never succeeds after 3 retries, fail the test with a clear message distinguishing 'transient load flakiness (environment)' from 'tab fundamentally broken' for triage purposes.
