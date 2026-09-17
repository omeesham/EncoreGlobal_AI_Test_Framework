# Location Local Information Tab — UI Automation &amp; Field-Level Validation Test Plan

## Application Overview

Scope: UI Automation &amp; Field-level Validation of the Local Information sub-tab under Location Settings in Encore Navigator Cloud (NM-1708, derived from the NM-958 validation work and the NM-1129 Save-button defect), for office 1604 — Parker Palm Springs.

App entry point: {BASE_URL}locations/1604/settings/local-office (BASE_URL = https://cloudapps-e2e.encoreglobal.com/navigator/), reached after Microsoft SSO login (account s-prd-clickauto@psav.com per .env.local). The Location Settings sub-tab strip includes Local Information, reached by clicking `tabLocalInformation` ([data-testid="location-settings-sub-tab-local-information"]) — unlike the sibling Left Panel / Basic Information sub-tab, Local Information is NOT selected by default and always needs an explicit click, exactly as the existing page object encodes it: `LocationLocalInfoPage.navigateToLocalInfoTab(officeNo)` calls the shared `navigateToSubTab('tabLocalInformation', 'btnSaveLocalInfo', officeNo)` helper in `base.page.ts`, which clicks the tab only when not already `aria-selected="true"` and then waits for `btnSaveLocalInfo` to become visible as the tab's readiness signal.

IMPORTANT SESSION LIMITATION — read before treating any value below as fresh live verification: `planner_setup_page` could not establish a working browser session against this repository's Playwright configuration in this planning session. Three separate attempts (no project argument; `project: "encore-locations"`; and `project: "encore-locations"` with `seedFile: "tests/locations/location-legal.spec.ts"`, an already-passing sibling spec) all failed identically and immediately, before any navigation occurred, with "Playwright Test did not expect test.describe() to be called here" thrown against both the seed spec file and `tests/auth.setup.ts` — a project-dependency/multi-project config interaction the planner harness does not tolerate in this repo (the config's `projects` array has an auth `setup` project that `dependencies`-gates two module projects, `encore-locations` and `encore-local-office`, on top of a default `chromium` project — see `playwright.config.ts`). No live page was ever reached, so no NEW live finding in this document should be read as freshly re-verified this session. Instead, every "confirmed" value below is sourced from what is ALREADY committed and load-bearing in this repo: the existing page object (`src/pages/locations/location-local-info.page.ts`), its selectors (`src/selectors/locations/local-info.ts`), and — most importantly — the existing data file (`src/data/locations/location-local-info.ts`), whose per-office, per-field inline comments ("for office 1604", "enabled+checked on Navigator Cloud", "requires save+reload, not immediate toggle") are themselves the residue of an earlier live-verification pass on this exact module and office. Every value that is NOT already backed by one of those three files is explicitly marked UNVERIFIED-THIS-SESSION in its scenario and must be confirmed against the live app before that scenario is authored into the spec, per this repo's own `specs/testcase-authoring-workflow.md` Step 4 ("Live-run the new tests against the real app").

## Live baseline verification (2026-09-14) — supersedes the session limitation above

The planner harness could not reach the app (see the paragraph above), so the baseline was captured
separately with a throwaway read-only probe spec run through the repo's own working Playwright CLI
(`npx playwright test --project=encore-locations`), against office 1604 as the automation account.
The probe made no edits and never saved; it was deleted afterwards. Everything in this section is
therefore FRESHLY LIVE-CONFIRMED and overrides any `UNVERIFIED-THIS-SESSION` tag below that it
contradicts.

**Corrections to facts stated elsewhere in this plan:**

1. **The entry point URL is wrong above.** The tab resolves to `{BASE_URL}locations/1604/settings/location`
   — `settings/location`, not `settings/local-office`. `settings/local-office` is the *Local Office
   Settings* module (the `TC-LOE-*` suites), a different screen. Scenario steps must not assert the
   `local-office` path.
2. **`DISABLED_CHECKBOX_STATES` was stale in two entries.** `chkEnableJobCosting` and
   `chkUseESignature` both read `disabled=false` live; they remain checked. The data file has been
   corrected — both moved out of `DISABLED_CHECKBOXES` and `chkUseESignature` added to
   `CHECKED_DEFAULTS`. TC-LOC-LI-005 must assert the corrected 5-key matrix, not the old 7-key one.
3. **`chkHRIRemitTax2` does not exist in the DOM for 1604** (`count=0`). The USA-baseline half of
   TC-LOC-LI-040/044 is confirmed by absence. The "reveal it by switching country" half of
   TC-LOC-LI-045 remains genuinely unverified and must be treated as exploratory.
4. **Billing Cycle is unset and editable, not populated.** Live value is the placeholder
   `"--Select--"` with `disabled=false`. TC-LOC-LI-021 ("reflects a non-zero baseline value") is
   contradicted: 1604 has no billing cycle selected at all, and TC-LOC-LI-022's "disabled once local
   billing has run" branch is NOT the branch 1604 takes. Both scenarios must be re-scoped to assert
   the live state and treat the disabled branch as a 1101 cross-office contrast only.
6. **Oracle Organization is read-only while Skip Billing is unchecked.** Caught by the first live
   run of TC-LOC-LI-015. NM-1708 implies `OracleOrgId` is an editable, required field whenever Skip
   Billing is off; on 1604 `drpOracleOrganization` renders permanently disabled. The scenario now
   asserts the read-only state deliberately, so the test fails if the app ever changes.

5. **Billing Way Effective Date is disabled on load** (`btnEffectiveDate` disabled=true), which
   confirms TC-LOC-LI-013's baseline branch: Billing Way cannot currently change for 1604.

**Live baseline, office 1604:**

| Control | Live value |
|---|---|
| Save on fresh load | disabled |
| Billing Type / Billing Way | `Master` / `Event` |
| Billing Way Effective Date | disabled |
| Billing Cycle | `"--Select--"`, enabled |
| `spinLDWPercentage` | `4.00`, enabled (stored decimal `0.04`) |
| `spinSetStrikeLaborBillingGoal` | `33.00`, enabled |
| `spinCCPercentage`, `spinETSPercentage`, `spinResortTaxPercentage`, `spinThreshold` | `0.00`, **all disabled** (their gate checkboxes are unchecked) |
| `txtOracleProduct` / `txtOracleDepartment` | `0000` / `900`, enabled, `maxLength=25` each |
| `CHECKED_DEFAULTS` (13 keys) | all confirmed checked |
| `UNCHECKED_DEFAULTS` (19 keys) | all confirmed unchecked |
| Disabled + checked | `chkCompassIntegration`, `chkDisplayTax`, `chkEnableDiscountGuidance` |
| Disabled + unchecked | `chkSuppressDayRateDiscount`, `chkEnableProductGroup` |

The four disabled percentage spins matter for scenario design: TC-LOC-LI-024/025's boundary work can
only run against `spinLDWPercentage` (or `spinSetStrikeLaborBillingGoal`) as the screen sits. Any
scenario targeting ETS, Cables & Consumables, Resort Tax or Threshold must first check its gate
checkbox, and restore it afterwards.

Confirmed (repo-sourced) live layout of the tab:
- Left panel (shared across every Location Settings sub-tab, not unique to Local Information): `txtOffice` (Office, disabled), `txtLocalOffice` (Local Office, disabled), `txtPayToAddress` (Pay To Address, disabled/launcher), `chkECommerceActive`, `chkEnableProductionsOrders`. `LocationLocalInfoPage.captureLeftPanelBaseline()` already reads all five into a `LeftPanelBaseline` object. `LEFT_PANEL_EXPECTED` in the data file pins these for 1604: `office: '1604'`, `payToAddress: 'Encore'`, `eCommerceActive: true`, `enableProductionsOrders: true` (local office number itself is read but not pinned to a literal in that constant).
- Billing Type: a two-option Radix radio group (`rdoBillingTypeMaster` / `rdoBillingTypeDirect`), read via `getBillingType()` / set via `selectBillingType('Master'|'Direct')`.
- Billing Way: a two-option Radix radio group (`rdoBillingWayEvent` / `rdoBillingWayDaily`), read via `getBillingWay()` / set via `selectBillingWay('Event'|'Daily')`; the page object's own comment on `selectBillingWay` notes it must wait for `domcontentloaded` after the click, implying the click itself can trigger a navigation/reload-shaped side effect (consistent with the unbilled-orders server round-trip described in the requirement doc).
- Billing Way Effective Date: `btnEffectiveDate`, a date-picker trigger button (not a plain text input) — `isEffectiveDateDisabled()` reads its `disabled` state.
- Billing Cycle: `drpBillingCycle`, a Radix combobox — `isBillingCycleDisabled()` reads disabled state, `getBillingCycleValue()` reads its displayed text.
- Oracle integration fields: `drpOracleOrganization` (combobox), `txtOracleProduct` / `txtOracleDepartment` (text inputs). `TEXT_FIELD_CONSTRAINTS` in the data file pins BOTH to `maxLength: 25` (confirmed: `{ key: 'txtOracleProduct', maxLength: 25, restoreValue: '0000' }`, `{ key: 'txtOracleDepartment', maxLength: 25, restoreValue: '900' }`) — a materially different contract from Basic Information's free-text fields (Phone/PO Number), which are natively unconstrained (`maxLength=-1`).
- Percentage/amount spin fields: `spinLDWPercentage`, `spinCCPercentage`, `spinETSPercentage`, `spinResortTaxPercentage`, `spinSetStrikeLaborBillingGoal`, `spinThreshold`. `getSpinState()` strips a trailing `%` from the raw `inputValue()`; `setSpinValue()` types via `keyboard.type` (Radix commit requires real keydown events) then Tabs to blur/commit. The LDW field's own boundary table (`LDW_BOUNDARIES`) documents the concrete contract: the input takes a raw decimal (e.g. `'0.10'`) and the component multiplies by 100 for display (`"10.00%"`) on blur; client validation blocks values outside decimal `[0, 1]` before any network call fires, using the shared error locators `errValidationMessage` (`p:has-text("Number must be")`), `errMinBoundary` (`"...greater than or equal to 0"`), `errMaxBoundary` (`"...less than or equal to 100"`).
- Roughly 30 boolean checkboxes render as `dt` (label) + `dd > button[role="checkbox"]` pairs (Radix, not native `<input type=checkbox>` — read via `getRadixCheckboxState()`/`getCheckboxState()`, which uses `aria-checked`, not `.checked`). The data file's `CHECKED_DEFAULTS` (13 keys: `chkApplyLDW`, `chkTickerCalc`, `chkEnableSetStrikeLaborMinutes`, `chkApplySetStrikeLaborMinutes`, `chkCompanyRemitTax`, `chkCommReceiver`, `chkIntercompany`, `chkAllowDPCD`, `chkCreditMemoApprovalRequired`, `chkEnableDiscountReason`, `chkEnableProposal`, `chkEnableJobCosting`, `chkServiceCharge`) and `UNCHECKED_DEFAULTS` (19 keys, e.g. `chkApplyCablesConsumablesFee`, `chkAllowETS`, `chkAllowResortTax`, `chkPromptForApproval`, `chkSkipBilling`, `chkWarehouseBilling`, `chkEnableIDCBilling`, `chkShowSubRental`, `chkInventoryOnly`, `chkEnableMultidayPricing`, etc. — `chkCalculateLDWonNetAmount` is DELIBERATELY excluded from both lists per its own code comment, "managed exclusively by TC-021/029 ... to avoid batch assertion failures when prior runs leave DB in dirty state") together enumerate the last confirmed-live checked/unchecked baseline for 1604. `DISABLED_CHECKBOXES` / `DISABLED_CHECKBOX_STATES` separately pin which checkboxes are non-interactive and in what state: `chkSuppressDayRateDiscount` (always disabled, unchecked), `chkCompassIntegration` (disabled, checked — "for existing location"), `chkDisplayTax` (disabled, checked — "when Company Remit Tax checked"), `chkEnableJobCosting` (disabled, checked — "for office 1604"), `chkUseESignature` (disabled, checked), `chkEnableProductGroup` (disabled, unchecked), `chkEnableDiscountGuidance` (disabled, checked).
- Save: `btnSaveLocalInfo` ([data-testid="location-settings-btn-save"]), disabled on pristine load per `isSaveEnabled()`. Clicking it goes through the shared `clickSaveWithDialog()` in `base.page.ts` (10 s dialog timeout here specifically, per `clickSave()`'s own comment: "this form's server validation is slower than the default allows"), which raises the shared `dlgSaveChanges` alertdialog (`SAVE_CHANGES_DIALOG` in `src/data/common.ts`: heading "Save Changes", body "Are you sure you want to save the changes?") with `btnSaveChangesConfirm`/`btnSaveChangesCancel`. A successful save shows the toast `toastLocalInfoUpdated` (`li:has-text("Local information updated")`), read via `waitForSaveToast()`. Leaving the tab while dirty raises the shared Unsaved Changes dialog (`dlgUnsavedChanges`, `UNSAVED_CHANGES_DIALOG` in `common.ts`: heading "Unsaved changes", body "Are you sure you want to leave this view? Any unsaved changes will be lost.") with `btnUnsavedChangesCancel` ("Stay") / `btnUnsavedChangesOk` ("Discard") — identical wording/keys to every other Location Settings sub-tab (Legal, Left Panel).
- Generic test runners already exist on the page object precisely for this form's shape: `testBoundaryValue(spinKey, value, valid, errorContains, restoreValue, officeNo, restoreEnableKey)` for percentage/amount boundary cases (drives `setSpinValue` → optional inline-error assertion → save+reload+persistence-verify via the shared `saveAndVerifyPersisted` retry helper in `base.page.ts`); `testDependency(trigger, triggerAction, target, targetType, expectedDisabled, expectedChecked, restore, spinRestore)` for checkbox/spin cascades (drives a trigger checkbox, asserts the target's disabled/checked state, then restores and persists); `testMaxLength(fieldKey, maxLength, restoreValue)` for the two Oracle text fields. `SIMPLE_DEPENDENCIES` (filtered to `ACTIVE_DEPENDENCIES = SIMPLE_DEPENDENCIES.filter(d => !d.pending)`) already encodes 6 dependency cases end-to-end with their exact restore recipes.

Confirmed (repo-sourced) live behaviors and discrepancies:
1. `chkServiceCharge` ("Allow Service Charge") carries an explicit prior-migration discrepancy in its own `CHECKED_DEFAULTS` comment: "enabled+checked on Navigator Cloud (was disabled+unchecked on legacy navigator2.training.psav.com baseline)" — a genuine platform-migration behavior change already recorded in this repo's own code, not something this session introduces.
2. `chkApplyCablesConsumablesFee`, `chkAllowETS` and `chkAllowResortTax` are explicitly commented as "all ENABLED for 1604" in `SIMPLE_DEPENDENCIES` — i.e. unchecked but fully interactive from a fresh load. This directly contradicts a naive reading of the requirement doc's phrasing ("LDWPercentage disabled ... CablesAndConsumablesPercentage same ... ETSPercentage disabled when ETS not allowed") as implying these three gate checkboxes themselves start disabled; they do not — only their dependent percentage spins are gated by them.
3. The single most significant discrepancy versus the requirement doc's plain "OracleOrgId required ... OracleProductCode and OracleDeptCode required ... when SkipBilling disabled" framing: the `'Skip Billing -> Oracle Product disabled'` entry in `SIMPLE_DEPENDENCIES` is the ONLY dependency case in the table carrying a `pending` note, reading verbatim: "Tested standalone — Skip Billing requires save+reload, not immediate toggle. See TC-LOC-LI-SKIP-BILLING in spec." In other words, checking Skip Billing does NOT immediately flip Oracle Product/Department to disabled the way every other dependency in this table does live-on-toggle — the gating only takes effect after a save+reload round trip. `ACTIVE_DEPENDENCIES` filters this entry OUT of the generic `testDependency()` batch specifically because of this asymmetry; it needs its own dedicated scenario using the save+reload pattern instead of the immediate-toggle pattern.
4. The LDW Percentage boundary table's own comments record two additional discrepancies worth stating explicitly rather than re-deriving: (a) the client blocks negative and &gt;1.00 decimal input before any network call, so decimal inputs `0` and `0.01`–`0.09` are deliberately omitted from `LDW_BOUNDARIES` — "the client accepts them and the server rejects them silently, with no signal to assert on" — meaning a scenario must not assume every out-of-range value produces a visible client-side error; and (b) every boundary case's `restoreValue` is `'0.04'`, itself BELOW the client's own documented valid floor of `0.10` — described as "a grandfathered DB value the server still accepts" — so the restore step in any LDW scenario must not be re-validated against the 0.10 floor as if it were a fresh, newly-typed value.
5. `chkEnableJobCosting` is disabled+checked at baseline for 1604 per `DISABLED_CHECKBOX_STATES`. A DIFFERENT, already-existing sibling suite (`tests/locations/location-left-panel-basic-information.spec.ts`, `TC-LOC-LP-021`) independently confirms this checkbox is Country-DERIVED, not user-togglable: "Country=USA enables Job Costing; Canada unchecks it (Local Information)". This plan's own scenario for the checkbox's disabled+checked USA baseline is consistent with, and should be read alongside, that pre-existing cross-tab finding rather than duplicating its Country-switch mechanics.
6. The same sibling suite's `TC-LOC-LP-022` ("Country=Canada reveals Remit PST Tax (Local Information)") already exercises a Country-gated control on THIS tab via `lp.isRemitPstVisible()`. This plan's own selector for the conceptually equivalent field is `chkHRIRemitTax2` (`dt:has-text("HRI Remit Tax 2") + dd button[role="checkbox"]`) — the two were evidently built against the same underlying backend flag, and this plan's Country-behavior suite treats them as the same field under two different page-object surfaces.
7. `chkSuppressDayRateDiscount`'s own `DISABLED_CHECKBOX_STATES` comment is unusually absolute among all seven disabled-checkbox entries: "always disabled, unchecked" (no qualifier like "for office 1604" or "for existing location"), matching the requirement doc's own "SuppressDayRateDiscount always disabled" line exactly and unconditionally.
8. `chkCompassIntegration`'s comment — "disabled for existing location, checked" — maps directly onto the requirement doc's "IsIntegratedWithCOMPASS disabled on update", confirming "update" in the requirement doc means "an existing, already-created location" (which 1604 is), not a transient in-session state; there is no live control path on this office to observe the opposite ("new location") state.
9. Oracle Product Code / Oracle Department Code are natively length-capped at 25 characters each (`TEXT_FIELD_CONSTRAINTS`), a materially different, STRICTER contract than Basic Information's free-text fields (Phone/PO Number), which reported native `maxLength=-1` (fully unconstrained) in the sibling Basic Information plan — Local Information's Oracle integration fields are not "free text" in the same sense.
10. This session's `planner_setup_page` failure (see the limitation note above) means every field NOT already covered by points 1–9, or by the `SetupLocalInfoSelectors`/`LocationLocalInfoPage` files themselves, carries no live confirmation from this planning pass. Scenarios covering the Billing Way unbilled-orders check, the Billing Cycle billing-already-run check, the exact past-date rejection message for Billing Way Effective Date, the ETS Percentage's documented union (0.24) vs. non-union (0.23) default, and the exact backend error-dialog copy for a forced save failure are all written as CONTRACTS TO VERIFY, not as pre-confirmed literals, and are flagged UNVERIFIED-THIS-SESSION inline.

This plan reuses existing framework page-object/selector/data conventions already present in the repository (`src/pages/locations/location-local-info.page.ts`, `src/pages/components/location-form-helpers.component.ts`, `src/pages/base.page.ts`, `src/selectors/locations/local-info.ts`, `src/selectors/locations/shared.ts`, `src/data/locations/location-local-info.ts`, `src/data/common.ts`) so test authors can implement each scenario directly against those data-testid selectors and constants: `btnSaveLocalInfo`, `toastLocalInfoUpdated`, `spinLDWPercentage`/`spinCCPercentage`/`spinETSPercentage`/`spinResortTaxPercentage`/`spinSetStrikeLaborBillingGoal`/`spinThreshold`, `txtOracleProduct`/`txtOracleDepartment`, `errValidationMessage`/`errMinBoundary`/`errMaxBoundary`, `rdoBillingTypeMaster`/`rdoBillingTypeDirect`/`rdoBillingWayEvent`/`rdoBillingWayDaily`, `btnEffectiveDate`, `drpBillingCycle`, `drpOracleOrganization`, `chkApplyLDW`/`chkApplyCablesConsumablesFee`/`chkAllowETS`/`chkAllowResortTax`/`chkAllowDPCD`/`chkPromptForApproval`/`chkCommReceiver`/`chkShowSubRental`/`chkCompanyRemitTax`/`chkDisplayTax`/`chkHRIRemitTax2`/`chkIntercompany`/`chkEnableIDCBilling`/`chkSkipBilling`/`chkCompassIntegration`/`chkSuppressDayRateDiscount`/`chkEnableProposal`/`chkEnableDiscountReason`/`chkEnableJobCosting`, `dlgSaveChanges`/`btnSaveChangesConfirm`/`btnSaveChangesCancel`, `dlgUnsavedChanges`/`btnUnsavedChangesOk`/`btnUnsavedChangesCancel`, plus the page object's `navigateToLocalInfoTab`/`isOnLocalInfoTab`/`reloadAndNavigateToLocalInfo`/`captureLeftPanelBaseline`/`getBillingType`/`selectBillingType`/`getBillingWay`/`selectBillingWay`/`isSaveEnabled`/`clickSave`/`waitForSaveToast`/`isEffectiveDateDisabled`/`isBillingCycleDisabled`/`getBillingCycleValue`/`testBoundaryValue`/`testDependency`/`testMaxLength`, the shared component's `getCheckboxState`/`checkCheckbox`/`uncheckCheckbox`/`toggleCheckbox`/`getCheckboxLabel`/`getSpinState`/`setSpinValue`/`getTextValue`/`fillText`/`hasValidationError`/`hasErrorDialog`/`getErrorDialogMessage`/`dismissErrorDialog`/`getMaxLength`/`isFieldDisabled`/`verifyCheckboxDefaults`/`verifyCheckboxDisabledStates`, `base.page.ts`'s `getComboboxOptions`/`selectComboboxOption`/`openComboboxListbox`/`getFieldDisplayValue`/`waitForSaveEnabled`/`waitForFieldInvalid`/`waitForFieldValid`/`saveAndVerifyPersisted`/`clickSaveWithDialog`, and the data file's `CHECKED_DEFAULTS`/`UNCHECKED_DEFAULTS`/`DISABLED_CHECKBOXES`/`DISABLED_CHECKBOX_STATES`/`LDW_BOUNDARIES`/`SIMPLE_DEPENDENCIES`/`ACTIVE_DEPENDENCIES`/`LEFT_PANEL_EXPECTED`/`TEXT_FIELD_CONSTRAINTS`/`LOCAL_INFO_TEST_VALUES`/`CHECKBOX_LABEL_CASES` constants, `OFFICE_NO`/`SAVE_CHANGES_DIALOG`/`UNSAVED_CHANGES_DIALOG` from `src/data/common.ts`, and the generic `saveAndVerifyCase`/`FieldCase`/`assertRejectionOracle` harness in `src/utils/field-case-runner.ts` for any negative/boundary-value case that needs a tamper-evident receipt.

Every scenario below assumes a fresh/blank starting state: freshly authenticated session, freshly navigated to {BASE_URL}locations/1604/settings/local-office, with an explicit click onto the Local Information sub-tab (it is NOT the default sub-tab) before any scenario-specific steps begin. Scenarios are independent and may be run in any order — this mirrors the majority convention already used by `tests/locations/location-legal.spec.ts` and `tests/locations/location-left-panel-basic-information.spec.ts`, both of which reset to a documented default state in `beforeEach` and use `dependencyGate([...])` (an Allure `dependsOn` annotation, not a runtime gate — real ordering comes from `fullyParallel: false`) to declare which earlier case each one logically follows. Every scenario that mutates data ends by restoring the original value/state and saving again (`btnSaveLocalInfo` → `dlgSaveChanges` → `btnSaveChangesConfirm`), or by discarding via `reloadAndNavigateToLocalInfo()`/the shared Unsaved Changes dialog when nothing was actually persisted, so office 1604's data is left unchanged for subsequent runs.

Implementation conventions for the eventual spec (per this task's explicit brief and this repo's `specs/testcase-authoring-workflow.md`): one spec file, `tests/locations/location-local-information.spec.ts`, `test.describe('Location Local Information @locations @local-information', ...)`, using the already-registered `locationLocalInfoPage` fixture from `src/fixtures/pages.fixture.ts`. TC ids follow the `TC-LOC-LI-NNN` family, sequential from 001 with no gaps (`npm run check:tc-ids` enforces this across every workbook and spec). Every test opens with `dependencyGate([...])` then `await about('<plain-language summary>')` as its first line (per `src/fixtures/report-steps.ts` and the reference implementations `tests/local-office/local-office-history.spec.ts`/`tests/add-product-code/add-product-code.spec.ts`), grouping further arrange/act work under `phase(...)` and assertion clusters under `verify(...)` rather than leaving a bare `expect` at the test's top level (`npm run check:steps` enforces this). A companion workbook, `testcases/locations/location-local-information.xlsx`, must copy the existing sibling workbook's exact header row and row layout (read via `openpyxl`, never re-invented), and `scripts/convert-testcases-to-testrail.py`'s `SECTION_BY_BASENAME` map needs a new entry `"location-local-information": "Local_Information"` before running `python3 scripts/convert-testcases-to-testrail.py --only locations`; TestRail case ids get attached afterward via `npm run testrail:sync:execute`, per this repo's documented two-phase (generate CSV, then execute import) TestRail workflow. Run `npm run typecheck`, `npm run check:tc-ids`, `npm run check:alignment`, and `npm run check:steps` before considering the spec done, then live-run the full file sequentially at least once (per Step 4 of the workflow doc) — something this planning session could not itself perform (see the limitation note above).

Because this module lives in `tests/locations/` (a single-spec-file-per-module folder, unlike `tests/local-office/`'s one-file-per-scenario layout that the format template below was originally modeled on), every scenario's **File** below is the same single spec file, `tests/locations/location-local-information.spec.ts` — each scenario becomes one `test('TC-LOC-LI-NNN: ...', ...)` block inside it, mirroring `location-legal.spec.ts` and `location-left-panel-basic-information.spec.ts` exactly.

## Test Scenarios

### 1. 1. Navigation, Load &amp; Left-Panel Baseline

**Seed:** `tests/seed.spec.ts`

#### 1.1. TC-LOC-LI-001: Local Information tab loads with header, disabled Save, and every core section visible

**File:** `tests/locations/location-local-information.spec.ts`

**Steps:**
  1. Log in via Microsoft SSO, navigate to {BASE_URL}locations/1604/settings/local-office, and click the Local Information sub-tab (it is not selected by default).
    - expect: isOnLocalInfoTab() returns true (tabLocalInformation reports aria-selected="true")
    - expect: btnSaveLocalInfo is visible and disabled (isSaveEnabled() is false)
  2. Look across the form for the Billing Type and Billing Way controls, the Effective Date button, the Billing Cycle dropdown, the Oracle Organization/Product/Department fields, and the percentage/amount spin fields.
    - expect: rdoBillingTypeMaster/rdoBillingTypeDirect, rdoBillingWayEvent/rdoBillingWayDaily, btnEffectiveDate, drpBillingCycle, drpOracleOrganization, txtOracleProduct, txtOracleDepartment, spinLDWPercentage, spinCCPercentage, spinETSPercentage, spinResortTaxPercentage, spinSetStrikeLaborBillingGoal and spinThreshold are all present and visible somewhere on the tab
  3. Confirm the left-hand Location Settings header panel is present alongside the Local Information content.
    - expect: txtOffice, txtLocalOffice, txtPayToAddress, chkECommerceActive and chkEnableProductionsOrders are all visible (this header is shared across every Location Settings sub-tab, not unique to Local Information)

#### 1.2. TC-LOC-LI-002: Left-panel baseline values match the shared Location Settings header for office 1604

**File:** `tests/locations/location-local-information.spec.ts`

**Steps:**
  1. Capture the left-panel baseline via captureLeftPanelBaseline().
    - expect: office equals LEFT_PANEL_EXPECTED.office ('1604')
    - expect: payToAddress equals LEFT_PANEL_EXPECTED.payToAddress ('Encore')
    - expect: eCommerceActive is true and enableProductionsOrders is true, matching LEFT_PANEL_EXPECTED

#### 1.3. TC-LOC-LI-003: Checkbox defaults — the full CHECKED_DEFAULTS group reads checked on a fresh load

**File:** `tests/locations/location-local-information.spec.ts`

**Steps:**
  1. Read every checkbox listed in CHECKED_DEFAULTS via verifyCheckboxDefaults(), expecting each to be checked=true.
    - expect: allPassed is true — chkApplyLDW, chkTickerCalc, chkEnableSetStrikeLaborMinutes, chkApplySetStrikeLaborMinutes, chkCompanyRemitTax, chkCommReceiver, chkIntercompany, chkAllowDPCD, chkCreditMemoApprovalRequired, chkEnableDiscountReason, chkEnableProposal, chkEnableJobCosting and chkServiceCharge are all checked

#### 1.4. TC-LOC-LI-004: Checkbox defaults — the full UNCHECKED_DEFAULTS group reads unchecked on a fresh load

**File:** `tests/locations/location-local-information.spec.ts`

**Steps:**
  1. Read every checkbox listed in UNCHECKED_DEFAULTS via verifyCheckboxDefaults(), expecting each to be checked=false. Do not include chkCalculateLDWonNetAmount in this batch — the data file deliberately excludes it, managing it only via its own dedicated check+save+restore scenario elsewhere, to avoid batch failures if a prior run left it dirty.
    - expect: allPassed is true for the full UNCHECKED_DEFAULTS list (chkApplyCablesConsumablesFee, chkAllowETS, chkAllowResortTax, chkShowServiceChargeAsAdministrativeFee, chkCalculateServiceChargeOnNetAmount, chkInternetAssetReservation, chkExcludeImpliedDiscount, chkPromptForApproval, chkAllowProductionQuote, chkWarehouseBilling, chkEnableIDCBilling, chkSkipBilling, chkSeparateMasterBillCommissionInvoice, chkShowSubRental, chkInventoryOnly, chkCalculateCommissionTax, chkCanCreateExternalCustomerLink, chkOffsiteEventLocation, chkExhibitShowRate, chkEnableMultidayPricing)

#### 1.5. TC-LOC-LI-005: Disabled-checkbox baseline matrix matches DISABLED_CHECKBOX_STATES

**File:** `tests/locations/location-local-information.spec.ts`

**Steps:**
  1. Read the disabled attribute AND the checked state of every checkbox listed in DISABLED_CHECKBOXES via verifyCheckboxDisabledStates() plus getCheckboxState().
    - expect: chkSuppressDayRateDiscount: disabled=true, checked=false
    - expect: chkCompassIntegration: disabled=true, checked=true
    - expect: chkDisplayTax: disabled=true, checked=true
    - expect: chkEnableJobCosting: disabled=true, checked=true
    - expect: chkUseESignature: disabled=true, checked=true
    - expect: chkEnableProductGroup: disabled=true, checked=false
    - expect: chkEnableDiscountGuidance: disabled=true, checked=true
  2. Attempt to click one disabled checkbox from this list (e.g. chkSuppressDayRateDiscount) directly.
    - expect: The click has no effect — checked state is unchanged and Save remains disabled

#### 1.6. TC-LOC-LI-006: Reloading and re-navigating to Local Information reproduces the same baseline

**File:** `tests/locations/location-local-information.spec.ts`

**Steps:**
  1. From a fresh load, call reloadAndNavigateToLocalInfo() (which routes away to /locations first to force a destroy+recreate, then re-clicks the Local Information sub-tab, per the page object's own comment that a plain page.reload() can hit the router cache and replay stale state).
    - expect: isOnLocalInfoTab() is true again after the round trip
    - expect: btnSaveLocalInfo is disabled again
    - expect: A spot-check of two CHECKED_DEFAULTS and two UNCHECKED_DEFAULTS entries still matches the original baseline

### 2. 2. Save Button &amp; Change Detection

**Seed:** `tests/seed.spec.ts`

#### 2.1. TC-LOC-LI-007: Save button is disabled on a completely fresh load

**File:** `tests/locations/location-local-information.spec.ts`

**Steps:**
  1. Navigate fresh to the Local Information tab and read the Save button state immediately, before touching any control.
    - expect: isSaveEnabled() is false

#### 2.2. TC-LOC-LI-008: A validated LDW Percentage change enables Save and persists through save+reload

**File:** `tests/locations/location-local-information.spec.ts`

**Steps:**
  1. Run testBoundaryValue('spinLDWPercentage', LDW_BOUNDARIES valid-mid case value '0.50', valid=true, undefined, restoreValue '0.04', OFFICE_NO).
    - expect: Before save: Save is enabled and no 'Number must be' error is shown
    - expect: After the helper's internal save+reload: the field shows ~50.00% (or is disabled, in which case it counts as already-restored) with no validation error
    - expect: The helper's own saveAndVerifyPersisted step restores spinLDWPercentage to the grandfathered '0.04' value and re-persists it, leaving office 1604 exactly as found

#### 2.3. TC-LOC-LI-009: Clicking Save always raises the shared Save Changes confirmation dialog

**File:** `tests/locations/location-local-information.spec.ts`

**Steps:**
  1. Make one trivial valid edit (toggle chkTickerCalc off, an UNCHECKED-eligible, otherwise-independent checkbox not covered by another dependency scenario) and click btnSaveLocalInfo directly (bypassing the page object's clickSave() helper) to observe the raw dialog.
    - expect: dlgSaveChanges becomes visible with heading 'Save Changes' and body 'Are you sure you want to save the changes?' (SAVE_CHANGES_DIALOG), with btnSaveChangesConfirm and btnSaveChangesCancel both present
  2. Click btnSaveChangesConfirm, wait for the toast, then re-toggle chkTickerCalc back and save again to restore the baseline.
    - expect: waitForSaveToast() resolves (toastLocalInfoUpdated becomes visible)
    - expect: After the restore save+reload, chkTickerCalc reads checked=true again

#### 2.4. TC-LOC-LI-010: Cancelling the Save Changes dialog aborts persistence and keeps the edit on screen

**File:** `tests/locations/location-local-information.spec.ts`

**Steps:**
  1. Toggle chkTickerCalc off, click btnSaveLocalInfo, then click btnSaveChangesCancel inside the dialog.
    - expect: dlgSaveChanges closes
    - expect: chkTickerCalc still reads unchecked (the in-progress edit is preserved, not reverted)
    - expect: isSaveEnabled() is still true (still dirty) — no network save occurred
  2. Reload via reloadAndNavigateToLocalInfo() without ever confirming the save.
    - expect: chkTickerCalc reads checked=true again (the cancelled edit never reached the server) and Save is disabled

#### 2.5. TC-LOC-LI-011: Navigating to another sub-tab while Local Information is dirty raises the shared Unsaved Changes dialog

**File:** `tests/locations/location-local-information.spec.ts`

**Steps:**
  1. Toggle chkTickerCalc off (without saving), then click the Left Panel/Basic Information sub-tab.
    - expect: dlgUnsavedChanges becomes visible with heading 'Unsaved changes' and body 'Are you sure you want to leave this view? Any unsaved changes will be lost.' (UNSAVED_CHANGES_DIALOG), offering btnUnsavedChangesCancel ('Stay') and btnUnsavedChangesOk ('Discard')
  2. Click btnUnsavedChangesCancel ('Stay').
    - expect: Dialog closes; the app remains on Local Information; chkTickerCalc is still showing the unsaved unchecked state; Save is still enabled

#### 2.6. TC-LOC-LI-012: The Unsaved Changes dialog's Discard button reverts a dirty Local Information field

**File:** `tests/locations/location-local-information.spec.ts`

**Steps:**
  1. Toggle chkTickerCalc off, navigate to another sub-tab, and this time click btnUnsavedChangesOk ('Discard').
    - expect: Navigation to the other sub-tab completes
  2. Navigate back to Local Information.
    - expect: chkTickerCalc reads checked=true again (Discard fully reverted the pending edit) and Save is disabled

### 3. 3. Required Field &amp; Format Validation

**Seed:** `tests/seed.spec.ts`

#### 3.1. TC-LOC-LI-013: Billing Way Effective Date control's baseline enabled/disabled state matches whether Billing Way can currently change

**File:** `tests/locations/location-local-information.spec.ts`

**Steps:**
  1. From a fresh load, read isEffectiveDateDisabled() without touching Billing Way.
    - expect: The baseline disabled state is recorded (UNVERIFIED-THIS-SESSION which boolean office 1604 shows at rest — this scenario's job is to pin whichever value the live app actually shows, then assert it stays stable across a reload with no edits)

#### 3.2. TC-LOC-LI-014: Billing Way Effective Date rejects a date before today (UNVERIFIED-THIS-SESSION exact copy)

**File:** `tests/locations/location-local-information.spec.ts`

**Steps:**
  1. If btnEffectiveDate is enabled, open its date picker and attempt to select a date before today's midnight.
    - expect: The picker either refuses to render/select dates before today (disabled calendar cells) or the field shows an inline validation error and Save remains disabled — confirm which mechanism the live app actually uses and record the exact wording for the eventual spec (UNVERIFIED-THIS-SESSION)
  2. Select today's date instead.
    - expect: The field accepts today's date with no error
  3. Close the picker without saving, or restore the original value, and reload.
    - expect: Office 1604's Effective Date is unchanged from its pre-scenario baseline

#### 3.3. TC-LOC-LI-015: Oracle Organization is populated while Skip Billing is unchecked (baseline)

**File:** `tests/locations/location-local-information.spec.ts`

**Steps:**
  1. Confirm chkSkipBilling is unchecked (its UNCHECKED_DEFAULTS baseline) and read drpOracleOrganization's displayed value via getFieldDisplayValue().
    - expect: chkSkipBilling reads unchecked
    - expect: drpOracleOrganization shows a non-empty, non-placeholder value while Skip Billing is off

#### 3.4. TC-LOC-LI-016: Oracle Product Code and Oracle Department Code are populated while Skip Billing is unchecked (baseline)

**File:** `tests/locations/location-local-information.spec.ts`

**Steps:**
  1. With chkSkipBilling unchecked, read txtOracleProduct and txtOracleDepartment via getTextValue().
    - expect: Both fields show a non-empty value (LOCAL_INFO_TEST_VALUES.oracleProductDefault '0000' / oracleDeptDefault '900' are the data file's own restore targets for these two fields, implying those are close to or exactly the live baseline)

#### 3.5. TC-LOC-LI-017: Checking Skip Billing does NOT immediately disable the Oracle fields — only a save+reload applies the gating (documented discrepancy)

**File:** `tests/locations/location-local-information.spec.ts`

**Steps:**
  1. Check chkSkipBilling and, WITHOUT saving, immediately re-read txtOracleProduct's and txtOracleDepartment's disabled state.
    - expect: Contrary to every other dependency in SIMPLE_DEPENDENCIES, the Oracle fields do NOT become disabled on this immediate read — this is the expected, documented discrepancy (see the data file's own 'pending' comment on this exact dependency), not a test bug
  2. Save and confirm the dialog, then reload and navigate back to Local Information.
    - expect: Only NOW do txtOracleProduct and txtOracleDepartment read as disabled (or otherwise gated), confirming the gating is applied on the server/reload path, not on the client toggle
  3. Uncheck chkSkipBilling, save, confirm, and reload again to restore the original ungated baseline.
    - expect: txtOracleProduct/txtOracleDepartment are editable again and show their original values ('0000'/'900'); chkSkipBilling reads unchecked

#### 3.6. TC-LOC-LI-018: Oracle Product Code enforces a 25-character maximum length

**File:** `tests/locations/location-local-information.spec.ts`

**Steps:**
  1. Run testMaxLength('txtOracleProduct', 25, '0000') from TEXT_FIELD_CONSTRAINTS.
    - expect: getMaxLength('txtOracleProduct') returns 25
    - expect: Typing a 60-character string truncates to at most 25 characters
    - expect: The field is restored to '0000' and the restore is proven persisted via saveAndVerifyPersisted (save+reload+re-check)

#### 3.7. TC-LOC-LI-019: Oracle Department Code enforces a 25-character maximum length

**File:** `tests/locations/location-local-information.spec.ts`

**Steps:**
  1. Run testMaxLength('txtOracleDepartment', 25, '900') from TEXT_FIELD_CONSTRAINTS.
    - expect: getMaxLength('txtOracleDepartment') returns 25
    - expect: Typing a 60-character string truncates to at most 25 characters
    - expect: The field is restored to '900' and the restore is proven persisted

#### 3.8. TC-LOC-LI-020: Oracle Product Code and Oracle Department Code store an XSS payload as inert text, matching the TC-LOE-BASIC-032/047 pattern

**File:** `tests/locations/location-local-information.spec.ts`

**Steps:**
  1. Set up a dialog/console listener to catch any alert() firing, then fillText('txtOracleProduct', '<script>alert(1)</script>').
    - expect: The field's .value is the literal payload string
    - expect: No alert() fires and no <script> element is injected into the DOM near the field
  2. Repeat for txtOracleDepartment with the same payload.
    - expect: Same inert-text result for txtOracleDepartment
  3. Restore both fields to '0000' and '900' respectively via testMaxLength-style save+reload.
    - expect: Both fields show their original values after reload; no residual <script> element exists anywhere in the Local Information form

#### 3.9. TC-LOC-LI-021: Billing Cycle offers a non-empty option list and reflects a non-zero baseline value

**File:** `tests/locations/location-local-information.spec.ts`

**Steps:**
  1. Read getBillingCycleValue() and, if drpBillingCycle is enabled, open it via getComboboxOptions('drpBillingCycle').
    - expect: getBillingCycleValue() returns a non-empty, non-placeholder string on a fresh load (BillingCycleID is non-zero, matching the requirement doc's 'required and non-zero' rule)
    - expect: If the dropdown is enabled, its option list contains more than one real cycle option (not just a blank/placeholder)

#### 3.10. TC-LOC-LI-022: Billing Cycle is disabled once local billing has run — cross-office contrast between 1604 and 1101

**File:** `tests/locations/location-local-information.spec.ts`

**Steps:**
  1. Read isBillingCycleDisabled() on office 1604 (the primary target, a dedicated QA office per the sibling Basic Information plan's own finding that 1604 is full of test-named rows).
    - expect: Record whatever the live value is for 1604 (UNVERIFIED-THIS-SESSION which state 1604 sits in)
  2. As a read-only comparison ONLY (never mutate 1101 — Step 6 of this repo's testcase-authoring-workflow.md runbook), navigate to office 1101 ('Corporate Office Encore USA SGA', the office named in the NM-1129 Save-button defect) and read isBillingCycleDisabled() there too.
    - expect: Document whether 1101 (a real corporate office with a long billing history) shows drpBillingCycle disabled where 1604 (a QA office) may not — if the two differ, that difference IS the confirmation that the 'billing has run' gate is real and office-data-driven, not a fixed disabled/enabled toggle

#### 3.11. TC-LOC-LI-023: Service Charge / Terms &amp; Conditions legal-code validation belongs to the Legal sub-tab, not Local Information (scope discrepancy)

**File:** `tests/locations/location-local-information.spec.ts`

**Steps:**
  1. Search the entire rendered Local Information form for any Service Charge ID or Terms and Conditions ID dropdown/input.
    - expect: No such control exists on this tab — chkServiceCharge here is the boolean 'Allow Service Charge' checkbox (part of CHECKED_DEFAULTS), a completely different field from the Legal tab's drpLegalServiceCharge0/drpLegalTerms0 dropdowns
  2. Cross-reference the Legal sub-tab's own already-existing suite.
    - expect: The requirement doc's 'ServiceChargeId and TermsConditionsId legal-data validation (LOC_SERVICE_CHARGE_ID_GT_ZERO / SCNAME_IS_REQD, LOC_TERMS_CONDITION_ID_GT_ZERO / TCNAME_IS_REQD)' bullet is already covered by tests/locations/location-legal.spec.ts's TC-LOC-LGL-004/005/016 (dropdown option enumeration and the out-of-list negative-enumeration case) — document this mapping explicitly rather than inventing a duplicate, non-existent control on Local Information

#### 3.12. TC-LOC-LI-024: A percentage field accepts every value in its documented valid boundary range and persists it

**File:** `tests/locations/location-local-information.spec.ts`

**Steps:**
  1. Run testBoundaryValue('spinLDWPercentage', value, true, undefined, '0.04', OFFICE_NO) once for each of LDW_BOUNDARIES' four valid cases in turn: '0.10' (10%), '0.50' (50%), '0.99' (99%), '1.00' (100%).
    - expect: Each value is accepted with no 'Number must be' error, Save becomes enabled before the helper's internal save, and the helper's saveAndVerifyPersisted step confirms the display value round-trips to value×100 after reload before restoring to '0.04'

#### 3.13. TC-LOC-LI-025: A percentage field rejects a below-minimum and an above-maximum value with the shared boundary error text

**File:** `tests/locations/location-local-information.spec.ts`

**Steps:**
  1. Run testBoundaryValue('spinLDWPercentage', value, false, 'Number must be', '0.04', OFFICE_NO) for each of LDW_BOUNDARIES' four invalid cases: '-0.01', '-0.05', '1.01', '1.5'.
    - expect: Each value either shows an inline error containing 'Number must be' (matching errValidationMessage/errMinBoundary/errMaxBoundary) or, per hasValidationError()'s documented fallback, silently disables Save with no visible error — the helper accepts either signal as a valid rejection, but the eventual spec must record which of the two actually occurs live for each case (UNVERIFIED-THIS-SESSION exact behavior per value)
    - expect: In every case the field is restored to '0.04' afterward and Save returns to disabled

### 4. 4. Billing Way &amp; Billing Cycle

**Seed:** `tests/seed.spec.ts`

#### 4.1. TC-LOC-LI-026: Billing Type toggles between Master and Direct and persists through save+reload

**File:** `tests/locations/location-local-information.spec.ts`

**Steps:**
  1. Read getBillingType() to record the baseline, then call selectBillingType() with the OTHER value (LOCAL_INFO_TEST_VALUES.billingType 'Master' / billingTypeDirect 'Direct').
    - expect: getBillingType() reflects the new selection immediately
    - expect: Save becomes enabled
  2. Save, confirm, reload, and re-read getBillingType().
    - expect: The new Billing Type value persisted through the reload
  3. Switch back to the original Billing Type and save+confirm again.
    - expect: After a final reload, getBillingType() shows the original baseline value, leaving office 1604 clean

#### 4.2. TC-LOC-LI-027: Changing Billing Way runs the unbilled-orders check (UNVERIFIED-THIS-SESSION which branch 1604 takes)

**File:** `tests/locations/location-local-information.spec.ts`

**Steps:**
  1. Read getBillingWay() to record the baseline, then call selectBillingWay() with the other value.
    - expect: Either: (a) the change is accepted — getBillingWay() reflects the new value and Save becomes enabled; or (b) the change is rejected — an error/dialog appears, getBillingWay() reverts to the original value, and Save does not become dirty from this action alone. The eventual spec must branch on which of these two the live app actually shows for 1604 and assert accordingly, per the requirement doc's own two-outcome description
  2. If accepted, save and confirm; if rejected, dismiss whatever error surfaced.
    - expect: No unintended state change persists beyond whichever branch was actually exercised
  3. Restore the original Billing Way (switch back, save+confirm, reload) if the change was accepted and saved.
    - expect: getBillingWay() shows the original baseline value after a final reload

#### 4.3. TC-LOC-LI-028: An accepted Billing Way change makes the Effective Date editable and defaults it to today

**File:** `tests/locations/location-local-information.spec.ts`

**Steps:**
  1. Following an ACCEPTED Billing Way change from TC-LOC-LI-027's branch (a), immediately re-read isEffectiveDateDisabled() and the displayed Effective Date value.
    - expect: isEffectiveDateDisabled() becomes false (the field is now editable) and the displayed date equals today's date, per the requirement doc's 'BillingWayEffectiveDate becoming editable and defaulting to today' rule
  2. Revert the Billing Way change without saving (or save+restore as in TC-LOC-LI-027).
    - expect: Effective Date's disabled state returns to its original TC-LOC-LI-013 baseline after the revert completes and the page reloads

#### 4.4. TC-LOC-LI-029: Changing Billing Cycle runs the billing-already-run check (UNVERIFIED-THIS-SESSION which branch 1604 takes)

**File:** `tests/locations/location-local-information.spec.ts`

**Steps:**
  1. If drpBillingCycle is enabled (per TC-LOC-LI-022's finding for 1604), read getBillingCycleValue() and select a different option via getComboboxOptions()/selectComboboxOption().
    - expect: Either the new cycle is accepted (getBillingCycleValue() reflects it, Save becomes dirty) or it is rejected (an error surfaces and the value reverts) — record which branch 1604 actually exercises
  2. If drpBillingCycle is disabled instead, skip the mutation and simply document that the billing-already-run gate is already permanently active for this office.
    - expect: isBillingCycleDisabled() is true and no further action is attempted, consistent with TC-LOC-LI-022's finding
  3. If a change was accepted and saved, restore the original Billing Cycle value and save+confirm again.
    - expect: getBillingCycleValue() shows the original value after a final reload

#### 4.5. TC-LOC-LI-030: Billing Way reverts cleanly to its original value after an accepted change

**File:** `tests/locations/location-local-information.spec.ts`

**Steps:**
  1. Repeat an accepted Billing Way change from TC-LOC-LI-027, then switch back to the original value WITHOUT saving in between.
    - expect: getBillingWay() shows the original value again
  2. Reload via reloadAndNavigateToLocalInfo() without ever saving.
    - expect: getBillingWay() still shows the original value and Save is disabled — the never-saved round trip left no residue

#### 4.6. TC-LOC-LI-031: Billing Type reverts cleanly to its original value after a change (no save)

**File:** `tests/locations/location-local-information.spec.ts`

**Steps:**
  1. Call selectBillingType() to the other value, then call it again back to the original, all without saving.
    - expect: getBillingType() shows the original value
    - expect: isSaveEnabled() is checked and its actual value (true or false) recorded — sibling suites for this same net-zero-change question have shown BOTH outcomes across different controls in this app (Basic Information's simple controls re-disable Save on a net-zero revert; the Legal tab's dropdowns do NOT), so this scenario's job is to pin which behavior Billing Type actually exhibits, not assume either (UNVERIFIED-THIS-SESSION)

#### 4.7. TC-LOC-LI-032: Reverting Billing Way/Billing Cycle mid-edit via reload leaves the office untouched

**File:** `tests/locations/location-local-information.spec.ts`

**Steps:**
  1. Change Billing Way (or Billing Cycle, whichever is enabled) without saving, then trigger a hard reload via reloadAndNavigateToLocalInfo().
    - expect: After the reload, both Billing Way and Billing Cycle show their original pre-scenario values, confirming an unsaved change to either control never reaches the server

### 5. 5. Conditional Field Dependencies

**Seed:** `tests/seed.spec.ts`

#### 5.1. TC-LOC-LI-033: Apply LDW gates LDW Percentage — unchecking disables it and resets it to 0

**File:** `tests/locations/location-local-information.spec.ts`

**Steps:**
  1. Run testDependency('chkApplyLDW', 'uncheck', 'spinLDWPercentage', 'spin', true, undefined, [{key:'chkApplyLDW',action:'check'}], {key:'spinLDWPercentage',value:'0.04'}) per SIMPLE_DEPENDENCIES' first entry.
    - expect: Immediately after unchecking chkApplyLDW, spinLDWPercentage's disabled state is true (per the helper's isFieldDisabled(target) check)
    - expect: The helper's own save+reload restore leaves chkApplyLDW checked and spinLDWPercentage back at '0.04' (4%), matching the entry's own comment that unchecking resets the spin to 0 so the restore must explicitly re-apply '0.04' afterward

#### 5.2. TC-LOC-LI-034: Apply Cables &amp; Consumables Fee is enabled (not disabled) from a fresh load, contradicting a disabled-by-default assumption

**File:** `tests/locations/location-local-information.spec.ts`

**Steps:**
  1. From a fresh load, read chkApplyCablesConsumablesFee's checkbox state and spinCCPercentage's disabled state together.
    - expect: chkApplyCablesConsumablesFee reads unchecked but its own control is enabled/clickable (per the data file's explicit 'ENABLED for 1604' comment) — document this as the confirmed-live discrepancy against a naive 'disabled by default' reading of the requirement doc
  2. Check chkApplyCablesConsumablesFee and observe spinCCPercentage.
    - expect: spinCCPercentage becomes enabled/editable
  3. Uncheck chkApplyCablesConsumablesFee again.
    - expect: spinCCPercentage becomes disabled again and resets to 0, matching the requirement doc's 'CablesAndConsumablesPercentage same [as LDW]' rule; restore/save so office 1604 ends at its original unchecked, enabled-control baseline

#### 5.3. TC-LOC-LI-035: Allow ETS gates ETS Percentage, including its documented union/non-union default (UNVERIFIED-THIS-SESSION exact default)

**File:** `tests/locations/location-local-information.spec.ts`

**Steps:**
  1. From a fresh load, read chkAllowETS (expect unchecked but enabled, per the same 'ENABLED for 1604' comment as Cables &amp; Consumables) and spinETSPercentage's disabled state.
    - expect: chkAllowETS reads unchecked; its control is interactive; spinETSPercentage is disabled while Allow ETS is off
  2. Check chkAllowETS and read the resulting spinETSPercentage value.
    - expect: spinETSPercentage becomes enabled and shows a default value — the requirement doc names 0.24 for union offices and 0.23 for non-union, so the eventual spec must first read office 1604's own Union flag (left panel, per the Basic Information sibling's own union checkbox) and then assert the MATCHING one of the two percentages (UNVERIFIED-THIS-SESSION which one 1604 actually shows)
  3. Uncheck chkAllowETS again and restore/save.
    - expect: spinETSPercentage returns to disabled/0 and chkAllowETS is unchecked again after a final reload

#### 5.4. TC-LOC-LI-036: Allow Resort Tax gates Resort Tax Percent and resets it to 0 on toggle

**File:** `tests/locations/location-local-information.spec.ts`

**Steps:**
  1. From a fresh load, confirm chkAllowResortTax is unchecked but enabled, and spinResortTaxPercentage is disabled.
    - expect: Baseline matches the data file's 'ENABLED for 1604' comment for this checkbox too
  2. Check chkAllowResortTax, set spinResortTaxPercentage to a non-zero test value, then uncheck chkAllowResortTax again.
    - expect: spinResortTaxPercentage becomes enabled after checking, and resets to 0 (or its disabled display shows 0) once chkAllowResortTax is unchecked again, per the requirement doc's 'ResortTaxPercent resets to 0 when disabled/first enabled' rule
  3. Restore/save so the checkbox and percentage both return to their original baseline.
    - expect: After reload, chkAllowResortTax is unchecked and spinResortTaxPercentage shows its original value

#### 5.5. TC-LOC-LI-037: Threshold Amount is gated by BOTH Allow DPCD and Prompt For Approval together

**File:** `tests/locations/location-local-information.spec.ts`

**Steps:**
  1. From a fresh load, confirm chkAllowDPCD is checked (CHECKED_DEFAULTS) and chkPromptForApproval is unchecked (UNCHECKED_DEFAULTS), and read spinThreshold's disabled state.
    - expect: Record the baseline disabled state for spinThreshold with only ONE of the two required checkboxes checked (UNVERIFIED-THIS-SESSION whether one alone is enough, or both together are required, to unlock it — this is exactly the ambiguity the requirement doc's 'gated by AllowDPCD + PromptForApproval' phrasing leaves open)
  2. Check chkPromptForApproval (leaving chkAllowDPCD checked) and re-read spinThreshold's disabled state.
    - expect: With both AllowDPCD and PromptForApproval checked, spinThreshold becomes enabled/editable
  3. Uncheck chkPromptForApproval again to restore the baseline; save+confirm if the toggle persisted, or simply reload if it did not dirty Save.
    - expect: spinThreshold returns to its original disabled state and chkPromptForApproval reads unchecked again

#### 5.6. TC-LOC-LI-038: Unchecking Comm Receiver forces Allow DPCD to false+disabled and Show SubRental to disabled

**File:** `tests/locations/location-local-information.spec.ts`

**Steps:**
  1. Run testDependency('chkCommReceiver','uncheck','chkAllowDPCD','checkbox',true,false,[{key:'chkCommReceiver',action:'check'},{key:'chkAllowDPCD',action:'check'}]) per SIMPLE_DEPENDENCIES.
    - expect: chkAllowDPCD becomes disabled AND unchecked immediately after unchecking chkCommReceiver, even though chkAllowDPCD started checked — confirming the requirement doc's 'AllowDPCD resets false when IsCommReceiver false' rule
  2. With chkCommReceiver still unchecked, also read chkShowSubRental's disabled state per the second SIMPLE_DEPENDENCIES entry ('Comm Receiver -> Show SubRental').
    - expect: chkShowSubRental is disabled while chkCommReceiver is unchecked
  3. Let each helper's own restore run (re-check chkCommReceiver and chkAllowDPCD, save, reload).
    - expect: chkCommReceiver, chkAllowDPCD are both checked again and chkShowSubRental is back to its original (unchecked, per UNCHECKED_DEFAULTS) state after reload

#### 5.7. TC-LOC-LI-039: Checking Company Remit Tax forces Display Tax to true and locked

**File:** `tests/locations/location-local-information.spec.ts`

**Steps:**
  1. Run testDependency('chkCompanyRemitTax','uncheck','chkDisplayTax','checkbox',false,undefined,[{key:'chkCompanyRemitTax',action:'check'}]) per SIMPLE_DEPENDENCIES.
    - expect: Unchecking chkCompanyRemitTax (from its CHECKED_DEFAULTS baseline) makes chkDisplayTax become ENABLED (disabled:false) — the inverse view of the requirement doc's 'DisplayTax forced true and locked when HRIRemitTax enabled' rule, matching DISABLED_CHECKBOX_STATES' own comment 'disabled when Company Remit Tax checked'
  2. Let the helper's restore re-check chkCompanyRemitTax, save, and reload.
    - expect: chkDisplayTax returns to disabled=true, checked=true and chkCompanyRemitTax reads checked=true again, matching the original DISABLED_CHECKBOX_STATES baseline

#### 5.8. TC-LOC-LI-040: HRI Remit Tax 2 is unavailable/false for the USA baseline, and also locks Display Tax when enabled

**File:** `tests/locations/location-local-information.spec.ts`

**Steps:**
  1. From a fresh load (office 1604, Country=USA per the left panel's LP_DEFAULTS.country), attempt to locate and read chkHRIRemitTax2.
    - expect: The control is either not present/not visible, or present but reading unchecked=false, for the USA baseline — consistent with the requirement doc's 'CountryId=1 (USA) ... HRIRemitTax2 false' rule and with the sibling TC-LOC-LP-022 finding that this concept only becomes visible on Country=Canada

#### 5.9. TC-LOC-LI-041: Unchecking Intercompany forces Enable IDC Billing to false+disabled

**File:** `tests/locations/location-local-information.spec.ts`

**Steps:**
  1. Run testDependency('chkIntercompany','uncheck','chkEnableIDCBilling','checkbox',true,false,[{key:'chkIntercompany',action:'check'}]) per SIMPLE_DEPENDENCIES.
    - expect: chkEnableIDCBilling becomes disabled AND unchecked immediately after unchecking chkIntercompany (chkIntercompany starts checked per CHECKED_DEFAULTS; chkEnableIDCBilling starts unchecked per UNCHECKED_DEFAULTS, so this only proves the disabled transition, not a checked->unchecked one) — confirming the requirement doc's 'EnableIDCBilling disabled + resets false for non-internal company' rule
  2. Let the helper restore chkIntercompany to checked, save, and reload.
    - expect: chkIntercompany reads checked again and chkEnableIDCBilling is back to its original unchecked baseline

#### 5.10. TC-LOC-LI-042: Is Integrated With COMPASS is always disabled on this existing/updated location

**File:** `tests/locations/location-local-information.spec.ts`

**Steps:**
  1. Read chkCompassIntegration's disabled and checked state, and attempt to click it directly.
    - expect: disabled=true, checked=true (DISABLED_CHECKBOX_STATES), and the click has no effect — office 1604, an already-created location, can never exercise the 'new location' branch this rule implies exists elsewhere

#### 5.11. TC-LOC-LI-043: Suppress Day Rate Discount is always disabled, and Enable Proposal (Pilot) is enabled+checked on this existing location

**File:** `tests/locations/location-local-information.spec.ts`

**Steps:**
  1. Read chkSuppressDayRateDiscount's disabled/checked state and attempt to click it.
    - expect: disabled=true, checked=false (DISABLED_CHECKBOX_STATES' own unconditional 'always disabled, unchecked' comment); the click has no effect, regardless of any other checkbox's state elsewhere on the form
  2. Read chkEnableProposal's disabled/checked state.
    - expect: chkEnableProposal is enabled (not in DISABLED_CHECKBOXES) and checked=true (CHECKED_DEFAULTS) on this existing location — document that the requirement doc's 'ProposalPilot disabled for new locations' rule cannot be exercised on 1604 (an existing location) and is out of this suite's reach without a dedicated new-location creation flow

### 6. 6. Country Behavior

**Seed:** `tests/seed.spec.ts`

#### 6.1. TC-LOC-LI-044: Country = USA baseline drives Check Discount true and hides HRI Remit Tax 2

**File:** `tests/locations/location-local-information.spec.ts`

**Steps:**
  1. From a fresh load (Country=USA per the left panel default), read chkEnableDiscountReason ('Check Discount').
    - expect: chkEnableDiscountReason reads checked=true (CHECKED_DEFAULTS), matching the requirement doc's 'non-USA → CheckDiscount false' rule read in reverse for the USA case
  2. Re-confirm chkHRIRemitTax2's unavailable/false state from TC-LOC-LI-040 in this same USA-baseline context.
    - expect: Consistent with TC-LOC-LI-040

#### 6.2. TC-LOC-LI-045: Switching Country away from the USA reveals HRI Remit Tax 2 and changes the Check Discount default

**File:** `tests/locations/location-local-information.spec.ts`

**Steps:**
  1. Using the left panel's Country dropdown, switch Country to the non-USA alternate value (LP_TEST_VALUES.countryAlt, 'Canada', the same value the sibling TC-LOC-LP-022 uses).
    - expect: chkHRIRemitTax2 becomes visible/interactable (mirroring lp.isRemitPstVisible() becoming true in TC-LOC-LP-022)
    - expect: chkEnableDiscountReason's checked state changes away from its USA-baseline true (UNVERIFIED-THIS-SESSION whether it flips to false immediately or resets/clears — record whichever the live app shows)
  2. Discard the Country change without saving (reloadAndNavigateToLocalInfo(), mirroring TC-LOC-LP-022's own discard pattern).
    - expect: Country, chkHRIRemitTax2's visibility, and chkEnableDiscountReason all return to their original USA-baseline values

#### 6.3. TC-LOC-LI-046: Switching Country away and back to the USA does not auto-restore Local Information's own country-dependent fields, and leaves unrelated percentage fields undisturbed

**File:** `tests/locations/location-local-information.spec.ts`

**Steps:**
  1. Switch Country to the non-USA alternate, observe chkEnableDiscountReason/chkHRIRemitTax2/chkEnableJobCosting changing, then switch Country back to United States (the LP_DEFAULTS.country value) WITHOUT saving in between.
    - expect: Mirroring TC-LOC-LP-020's finding for Tax Mode/Region, these Local-Information-specific country-dependent fields do NOT automatically snap back to their original USA values just because Country was switched back — record their actual post-round-trip state rather than assuming an auto-restore (UNVERIFIED-THIS-SESSION exact post-state)
  2. Before discarding, also re-read spinLDWPercentage and spinETSPercentage's current values.
    - expect: Both percentage fields still show whatever value they held before the Country round trip began — confirming Country-switching is scoped only to the fields the requirement doc explicitly names as Country-gated, and is not a blanket form reset
  3. Discard the whole round trip via reloadAndNavigateToLocalInfo().
    - expect: Every field, country-dependent or not, returns to its original pre-scenario baseline

### 7. 7. Save, Persistence &amp; Error Handling

**Seed:** `tests/seed.spec.ts`

#### 7.1. TC-LOC-LI-047: Save stays disabled/busy for the full duration of an in-flight save, and rapid repeated clicks never fire a second save request

**File:** `tests/locations/location-local-information.spec.ts`

**Steps:**
  1. Toggle chkTickerCalc off, then call clickSave() (which internally uses clickSaveWithDialog()'s request/response tracking — counting in-flight '/navigator/api/' requests — and its own 10s dialog timeout) while independently attaching a page.on('request') counter scoped to the same save endpoint pattern.
    - expect: Exactly one save request is observed for the one confirmed click, even though clickSaveWithDialog() itself waits out any trailing in-flight responses before returning
    - expect: While the save is in flight (between clicking btnSaveChangesConfirm and the toast appearing), btnSaveLocalInfo is disabled or otherwise not independently re-clickable to fire a second request
  2. Restore chkTickerCalc to checked and save+confirm again.
    - expect: Final state: chkTickerCalc checked=true, Save disabled, exactly one save request per confirmed click throughout the scenario

#### 7.2. TC-LOC-LI-048: Oracle Product/Department edits persist after a reload, and can be restored

**File:** `tests/locations/location-local-information.spec.ts`

**Steps:**
  1. fillText('txtOracleProduct', LOCAL_INFO_TEST_VALUES.oracleProductTest 'PROD001') and fillText('txtOracleDepartment', LOCAL_INFO_TEST_VALUES.oracleDeptTest 'DEPT001'), then clickSave() and confirm.
    - expect: Save completes without a network error
  2. Reload via reloadAndNavigateToLocalInfo() and re-read both fields.
    - expect: txtOracleProduct shows 'PROD001' and txtOracleDepartment shows 'DEPT001', confirming persistence
  3. Restore both fields to their original values ('0000' / '900'), save, confirm, and reload once more.
    - expect: Both fields show their original values again, leaving office 1604 clean

#### 7.3. TC-LOC-LI-049: A combined multi-field change (Billing Type + Oracle Product + a checkbox) saves, persists and fully restores together

**File:** `tests/locations/location-local-information.spec.ts`

**Steps:**
  1. In one dirty session, change Billing Type to the alternate value, fillText('txtOracleProduct', LOCAL_INFO_TEST_VALUES.oracleProductShort 'CHG'), and uncheck chkTickerCalc, all before saving once.
    - expect: isSaveEnabled() is true after all three edits
  2. Click Save and confirm the dialog once for all three changes together.
    - expect: The save completes successfully (no network error) and Save returns to disabled
  3. Reload via reloadAndNavigateToLocalInfo() and re-read all three fields.
    - expect: Billing Type, txtOracleProduct ('CHG') and chkTickerCalc (unchecked) all show their new values, confirming a single combined save persisted every field, mirroring TC-LOC-LGL-015's combined-change pattern on the Legal tab
  4. Revert all three fields to their original values in one more combined save+confirm+reload cycle.
    - expect: Billing Type, txtOracleProduct ('0000') and chkTickerCalc (checked) all show their original baseline values again, leaving office 1604 fully clean

#### 7.4. TC-LOC-LI-050: A simulated backend save failure preserves the on-screen edit and surfaces an error (UNVERIFIED-THIS-SESSION exact error copy)

**File:** `tests/locations/location-local-information.spec.ts`

**Steps:**
  1. Toggle chkTickerCalc off, then use Playwright route interception to force the Local Information save endpoint to return a 500 for exactly one request, and click Save.
    - expect: clickSaveWithDialog()'s own networkError detection (any 4xx/5xx on a '/navigator/api/' URL) reports success:false with the intercepted status recorded, OR the app's own dlgErrorDialog (getErrorDialogMessage()/dismissErrorDialog()) becomes visible with a non-empty message — record which of the two the live app actually surfaces (UNVERIFIED-THIS-SESSION)
    - expect: chkTickerCalc still shows the unsaved unchecked edit on screen (the input is preserved, not silently reverted) and isSaveEnabled() is still true
  2. Remove the route interception, click Save again for real, and confirm.
    - expect: The save now succeeds; chkTickerCalc persists as unchecked
  3. Restore chkTickerCalc to checked and save+confirm once more.
    - expect: After a final reload, chkTickerCalc reads checked=true, leaving office 1604 clean

### 8. 8. Accessibility &amp; Authorization

**Seed:** `tests/seed.spec.ts`

#### 8.1. TC-LOC-LI-051: Every interactive Local Information control exposes an accessible role and name

**File:** `tests/locations/location-local-information.spec.ts`

**Steps:**
  1. For a representative sample spanning every control type on the tab — rdoBillingTypeMaster/rdoBillingTypeDirect (radio), drpBillingCycle/drpOracleOrganization (combobox), chkApplyLDW/chkCommReceiver (checkbox), spinLDWPercentage/txtOracleProduct (textbox/spinbutton), btnEffectiveDate/btnSaveLocalInfo (button) — read each element's role and accessible name via getByRole()-equivalent queries or getCheckboxLabel()/close ARIA attribute reads.
    - expect: Every sampled control resolves to a real ARIA role (radio, combobox, checkbox, textbox, button) rather than a generic div/span with no role
    - expect: Every checkbox's dt+dd label pairing (per getCheckboxLabel()'s own documented DOM shape) yields a non-empty label string for each sampled key, matching CHECKBOX_LABEL_CASES' existing entries (chkApplyLDW -> 'Apply LDW', chkSkipBilling -> 'Skip Billing', chkWarehouseBilling -> 'Warehouse Billing', chkCommReceiver -> 'Comm Receiver', chkAllowDPCD -> 'Allow DPCD', chkEnableMultidayPricing -> 'Enable Multiday Pricing') where those specific keys are sampled

#### 8.2. TC-LOC-LI-052: Cross-office audit finds no read-only/permission gating differs between 1604 and 1101 for this test account (Step 6 runbook)

**File:** `tests/locations/location-local-information.spec.ts`

**Steps:**
  1. With the same s-prd-clickauto@psav.com session already used throughout this suite, navigate read-only to office 1101 (NEVER mutate/save anything there — Step 6 of this repo's testcase-authoring-workflow.md explicitly requires simulating any new scenario safely on the primary target, 1604, rather than mutating a second live instance) and read btnSaveLocalInfo's disabled state plus two or three representative field disabled states (e.g. txtOracleProduct, chkApplyLDW).
    - expect: Document whether this test account sees the SAME editable affordances on 1101 as on 1604 (both fields interactive, Save present and enable-on-dirty) or a genuinely different, more restricted permission surface — if no difference is observed, record that explicitly as the audit's finding rather than silently assuming a read-only role exists that this account has never been shown to hit (UNVERIFIED-THIS-SESSION either way, since this planning pass never reached a live page at all)
  2. Navigate away from 1101 without having made or saved any change.
    - expect: No mutation occurred on office 1101 at any point in this scenario
