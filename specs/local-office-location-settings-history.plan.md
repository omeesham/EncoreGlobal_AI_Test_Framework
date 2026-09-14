# Location Settings History Tab (Local Office Settings) - UI Automation & Read-Only Grid Validation Test Plan

## Application Overview

Scope: UI Automation & read-only grid validation of the Location Settings History tab under Local Office Settings in Encore Navigator Cloud (new MFE), for office 1604 - Parker Palm Springs. Requirement source is NM-854 (UI: Local Office Settings - Create location setting history page), with regression context from NM-1252 (MFE Unit Tests for Local Office Settings), NM-1715 (Automate Local Office --> Basic Information) and NM-1716 (Automate Local Office --> ECT Settings).

App entry point: {BASE_URL}locations/1604/settings/local-office (BASE_URL = https://cloudapps-e2e.encoreglobal.com/navigator/), reached after Microsoft SSO login. The tab strip shows, in order: Basic Information, Location Settings History, ECT Settings. Basic Information is the DEFAULT/selected tab on load, so Location Settings History must be explicitly clicked - the same pattern as ECT Settings, unlike Basic Information which needs no click. This plan targets only the Location Settings History tab; opening it is a shared precondition for every scenario below.

Confirmed live layout of the tab (this tab, unlike its two siblings, already had a live-verified page object and selector file in the repository when this plan was written - src/pages/local-office/local-office-history.page.ts and src/selectors/local-office/local-office-history.ts, authored from a prior live session against the E2E environment with account s-prd-clickauto@psav.com; every item below is taken from that code and its inline notes, i.e. confirmed live behavior rather than inference from the requirement doc):
- Panel: the tab content is `[data-testid="local-office-settings-tab-content-history"]` (tabContentHistory), reached by clicking `[data-testid="local-office-settings-tab-location-settings-history"]` (tabHistory), which reports aria-selected='true' once active. Because all three sub-tabs share the same `settings/local-office` URL, every navigation guard in this suite is DOM-based (aria-selected) and never url.includes().
- History type selector: a combobox `[data-testid="local-office-settings-history-select-type"]` (drpHistoryType) wrapped in `[data-testid="local-office-settings-history-type-selector"]` (secHistoryTypeSelector) sits above the grid. This control is NOT described anywhere in NM-854, so its option list must be treated as unknown/data-driven rather than asserted against hardcoded strings.
- Grid: `[data-testid="local-office-settings-history-table"]` (tblHistory) inside `[data-testid="local-office-settings-history-table-container"]` (secHistoryTableContainer). Column headers are `th` elements; a sortable column carries a `button` inside its `th`.
- Sorting is a Radix MENU, not a tri-state header click: clicking a header's button opens a `[role="menu"]` containing `[role="menuitem"]` entries 'Sort ascending' and 'Sort descending', and the `th` carries an `aria-sort` attribute. The equivalent menu on the Locations module's history grid intermittently fails to open, so the sort helper retries up to 3 attempts with an Escape between them (LocationManagementHistoryPage.clickSortColumn is the reference implementation, mirrored here as sortHistoryColumn). It is a menu and not a combobox, so the shared selectComboboxOption primitive does not apply to it.
- Boolean columns render as `lucide-check` SVG icons, NOT text: `textContent` is the empty string for BOTH true and false, so an apparently blank cell must be re-checked against `innerHTML` for 'lucide-check'. The page object's cell reader already does this and returns a check glyph for true - reading textContent alone would report every boolean as false.
- Empty state: the grid renders the literal text 'No results.' inside the table when the API returns no records (isHistoryTableEmpty).
- Paginator: the panel has one, and its page-number `input` is a SIBLING of the table, inside the panel. Any read-only census must therefore be scoped to the table and not the panel - counting the panel's inputs makes a read-only tab look editable. The paginator's controls carry the app-wide aria-labels 'Go to first page' / 'Go to previous page' / 'Go to next page' / 'Go to last page' plus a 'Current page number' input, shared verbatim with the Locations module's history grid, and a rows-per-page combobox which is the only other combobox in the panel and is therefore addressed by exclusion of drpHistoryType.
- 'Modified On' is a confirmed live column label - the pre-existing sortHistoryByModifiedOnDesc() resolves it by that exact string and throws if it is absent.
- Timestamps: the sibling Locations history grid renders UTC text with no timezone suffix, so parsing must use Date.UTC and never `new Date(y, m, d, ...)`, which would shift every comparison by the client's offset. LocationManagementHistoryPage.parseModifiedOnMs is the reference implementation and is mirrored onto this page object.

FIRST LIVE RUN COMPLETED. Everything in the section below marked CONFIRMED was verified by executing this suite and a set of read-only probes against office 1604 on the E2E environment with account s-prd-clickauto@psav.com. The run closed two of the requirement doc's open questions, replaced the plan's deliberately-loose column matching with an exact contract, and found two product defects. Nothing was mutated: the only data-writing scenario (9.1) restores its field, and every probe was read-only.

Confirmed constraints, deliberate design decisions and open discrepancies (recorded here the way the sibling plans record their live findings, so implementers do not mistake a deliberate choice for a coverage gap):
1. SUPERSEDED BY THE LIVE RUN - column headers ARE now asserted as an exact ordered full list. The grid renders 42 columns for office 1604 and scenario 3.1 asserts all 42 by equality, in render order. The original reasoning is kept below because it explains why the plan shipped loose and why the hardening was designed in from the start; the labels themselves are now in HISTORY_ALL_COLUMNS_IN_ORDER. What the run showed is that guessing would indeed have failed: 11 of the labels are shortened or reworded versions of NM-854's field keys - "Local Office" (not Local Office ID), "Print Desc", "Use Subrent", "Use Sect.", "Use On Rental", "Marriott PMS Account Enabled", "Sect. Action", "ST Action", "Action" (for LocSettingsAction), "Phone1"/"Phone2" (no space), and the three "Default Job to 1 day for <X> Orders" labels - and two more NM-854 fields have no column at all (see item 17). The original decision, for the record:
   IMPORTANT DECISION - column headers were NOT asserted as an ordered full list on first authoring. NM-854 lists the tracked dataset as raw field keys (LocalOfficeID, PrepDateOffset, UseFulfillment, HolidayMultiplier, ModUser, ModDate and roughly 38 more) while simultaneously requiring every header to display TRANSLATED text through the application i18n translation function. The exact translated strings are therefore a product of the i18n bundle, not of the requirement doc. Column-presence scenarios (3.2 - 3.5) instead resolve each NM-854 field against the live header row case- and separator-insensitively, so 'Holiday Multiplier', 'Holiday multiplier' and 'HolidayMultiplier' all resolve to the same column and only a genuinely MISSING column fails. Guessing 40-plus translated strings would produce a suite that goes red for cosmetic reasons and gets weakened on its first run.
2. The real localization requirement is asserted separately and durably in 3.1: no header is blank, no header is a raw unspaced camelCase/PascalCase field key, no header leaks an i18n placeholder ('{{', '}}' or a dotted key path), and no header is duplicated. That contract is immune to wording drift in a way a hardcoded label list is not.
3. Scenarios 3.1, 4.6, 4.7 and 9.3 ATTACH what they observe to the HTML report (the full header label list, the header-keyed aria-sort map, the request URLs issued during a sort, and the history type selector's option list) via attachNote. Those attachments are what turn NM-854's unanswered questions into recorded fact on the first live run: copy the header list into HISTORY_EXPECTED_COLUMNS and tighten 3.1 into an ordered full-list equality; narrow HISTORY_API_URL_PATTERN from the current /histor/i regex to the real route; and record the type selector's real contract.
4. RESOLVED BY THE LIVE RUN - the default sort IS now asserted. CONFIRMED: a fresh load sorts by "Modified On" DESCENDING (newest first). Established by reading the pristine header icons - exactly one column carried a directional arrow before any sort was applied, it was Modified On with lucide-arrow-down, and re-applying "Sort descending" to it changed nothing. This closes the requirement doc's open question 4, and scenarios 1.1 and 4.6 now assert it instead of the former "at most one column is sorted" placeholder.
5. Sort state is read from the header ICON, by COLUMN INDEX, never from aria-sort or a header-text-keyed map. CONFIRMED mechanism: lucide-arrow-up = ascending, lucide-arrow-down = descending, lucide-arrow-up-down = sortable but unsorted, no svg = not sortable. These are matched as EXACT class tokens because "lucide-arrow-up-down" contains the string "lucide-arrow-up", so substring matching would report every unsorted column as ascending. See item 18 for why aria-sort is not used. The original index-based reasoning still applies: A `th` whose markup carries screen-reader-only text (for example 'Modified On' plus a hidden 'Sort') would key such a map under a label no assertion could predict; getHistoryAriaSort(header) and getHistorySortedColumnIndexes() resolve by index instead, and the header-keyed reader is kept purely as a report attachment in 4.6.
6. The empty, loading, HTTP-500, single-record, long-Notes and partial-payload states CANNOT be produced from office 1604's real data, so scenarios 5.4, 5.5, 6.1, 6.2, 6.3 and 6.4 drive them with page.route() interception - the established precedent in this repository (tests/service-charge-text/service-charge-text.spec.ts, tests/terms-conditions/terms-conditions.spec.ts). Because NM-854 does not publish the endpoint, the mock matches the history request by regular expression and adapts to whatever payload shape the app actually receives: it replaces the first array of objects found anywhere in the JSON tree, and passes the real response through untouched when it recognises nothing, rather than fabricating a shape the UI cannot read. Every such scenario unroutes in a finally block, because all tests in a spec file share one browser session under fullyParallel:false and a leaked route would corrupt the next test.
7. The tab is strictly read-only, so 34 of the 36 scenarios mutate NOTHING and a fresh re-navigation is their whole reset. Only 9.1 persists data - it edits Phone 2 on Basic Information, saves, asserts the resulting history row, then restores the original value in a finally block (the same pattern as tests/service-charge/service-charge-history.spec.ts TC-SVC-HIS-013). Scenario 9.2 creates an UNSAVED edit only and always exits through Discard. Phone 2 is the chosen probe field because NM-1715 confirmed it is optional, unvalidated free text with native maxLength=-1 and required=false and no cross-field rule, so an edit can never be rejected and a restore can never be blocked.
8. Any edit value must be DERIVED from the live value rather than hardcoded: a value the database already holds is a net-zero edit that leaves the Angular form pristine, so Save never enables and the save click hangs on a disabled button. This is the same trap the ECT Settings and Service Charge History suites already document.
9. Accessibility is asserted by role and ARIA contract, not by an automated scan: @axe-core/playwright is NOT a dependency of this repository, so adding it would mean a new dependency plus a repo-wide baseline decision. Scenario 7.1 therefore asserts the columnheader role count against the `th` count, a non-empty accessible name on every sort control, aria-sort state transitions, and full keyboard operation of the sort menu (Enter to open, ArrowDown plus Enter to apply, Escape to close without changing state). Adding an axe scan to 7.1 is a recommended follow-up, not a gap this plan can close on its own.
10. Cross-browser coverage stays on Chromium via the encore-local-office project, matching every other module in this repository. `npm run setup:browsers` installs Firefox and WebKit, and a read-only grid that mutates nothing is the cheapest place in the module to get cross-browser signal, but adding Firefox/WebKit projects is a repo-wide playwright.config.ts decision and is out of scope here.
11. Responsive coverage targets 1366x768 and 1280x720 in scenario 7.2 - the two laptop widths where a 40-plus column grid is most likely to force the PAGE to scroll horizontally instead of the grid container. The suite's own fixed viewport is 1920x1080, which 7.2 restores in a finally block so it cannot leak into the tests sharing its session.
12. Performance is asserted as a loading CONTRACT, not a wall-clock budget: waitForHistoryGridLoaded() polls for a header row OR the empty state, so a slow API surfaces as a timeout against a named step, and scenario 6.2 holds the response open to prove the panel shows a pending affordance and does NOT show 'No results.' while the request is still in flight. Hard timing budgets belong in a performance job, not in a functional suite whose 43 tests share one worker.
13. Security is covered structurally rather than by new negative tests: the `setup` project is the only place credentials are used, .auth/encore-state.json is the single shared storage state, no scenario logs in inline, and the tab accepts no input at all so there is no input-sanitization surface (unlike Basic Information, which needed XSS scenarios for its Section Name and PO fields). The one security-relevant assertion this grid can make is that audit values are not leaked as raw internal identifiers, which 5.2 covers (Modified By must be a user identifier, never a bare GUID). Permission-gated column visibility remains genuinely untested - no restricted-role account is available, exactly as the ECT Settings plan records for its own permission scenario - so 9.3 handles the one permission-suspect control conditionally and obtaining such an account is a recommended follow-up.
14. OPEN QUESTION handling, carried from the requirement doc: the exact API contract and sort parameters are RECORDED by 4.7 rather than asserted; the paginate-versus-infinite-scroll question is settled by the live paginator confirmed in the page object, which 8.1 and 8.2 target (if it is later replaced by infinite scroll, both scenarios need rewriting); whether any column is hidden by permission, feature flag or viewport is partly answered by 7.2 (no column is dropped by width) and 9.3 (the type selector is handled conditionally); the default sort is left loose per item 4; boolean, null and date formatting is asserted against the confirmed-live rendering (check glyph, empty cell, MM/DD/YYYY hh:mm:ss AM|PM) in 5.1, 5.2 and 5.3; and the exact user-facing copy for the loading and error states is asserted structurally (a pending affordance is present, an empty-or-error state is shown, nothing crashes) because only the empty state's 'No results.' wording is confirmed live.
15. Regression areas carried forward from NM-854's earlier analysis map to scenarios as follows: missing field capture -> 3.2, 3.3, 3.4, 3.5 and 9.1; missing Holiday Multiplier visibility -> 3.5, which asserts that one field on its own separate assertion so a regression names it unambiguously instead of being buried in a list diff; data cut-off / truncated older records -> 8.1 and 8.2; untranslated header issues -> 3.1; and cell or row misalignment after a partial payload -> 3.6 and 6.4.
17. CONFIRMED - two NM-854 fields have NO column of their own; the grid FOLDS them into pipe-delimited composite cells. "Section Name" carries SectionName AND SectionIsActive as "AV Services - true | Hybrid Meeting - true | ..." (~244 characters on office 1604, 13 pairs), and "Service Type - Exempt" carries ServiceTypeName AND STExempt as "APP Downloaded - true | App Quality Assurance - true | ..." (~257 characters, 9 pairs). So SectionIsActive, ServiceTypeName and STExempt are not missing - they are not separate. Scenarios 12.1 and 12.2 assert the pair structure, since that structure IS the contract for those three fields, and 12.2 confirms the long real content neither shifts a row nor pushes the page into horizontal scroll.
18. DISCREPANCY vs NM-854 (ACCESSIBILITY) - the grid never sets `aria-sort`, in ANY state. CONFIRMED before sorting, after sorting ascending, and after sorting descending: the attribute is absent from every one of the 42 headers throughout. Sorting itself works correctly and the sort order IS indicated visually by the arrow icon, so NM-854's "table headers must clearly indicate current sort order" is met for sighted users - but "table headers shall be accessible and communicate sort state" is NOT met, because a screen-reader user has no programmatic way to tell which column is sorted or in which direction. Following the convention the Basic Information plan uses for its unimplemented cross-field validation matrix, this is DOCUMENTED as a defect for dev awareness and RECORDED as a report attachment by scenario 4.6, rather than asserted - a test that passed on the current behaviour would go red when the defect is fixed, which is the wrong way round. Related: `aria-invalid` also stays "false" on the paginator page box for every rejected value (item 20), so there is a broader lack of programmatic state on this tab.
19. CONFIRMED - exactly 4 of the 42 columns carry no sort control: "Local Office", "Section Name", "Service Type - Exempt" and "Notes". Three are structurally unsortable (the two composites from item 17, plus free-text Notes) and Local Office is constant for a single office. NM-854 requires every column "marked sortable" to sort, so scenario 11.1 asserts this exact SET of exceptions rather than scenario 4.1's weaker count bound - a column silently losing its sort control would pass 4.1 and fail 11.1.
20. DEFECT FOUND (paginator page box) - a decimal page number has its separator STRIPPED and its digits CONCATENATED. CONFIRMED: typing "2.5" navigates to page 25, not page 2 and not an error. The box is `type="text"` with `inputmode="numeric"` and `pattern="[0-9]*"` and declares no min, max or maxLength, so "." is filtered out and "25" remains. Scenario 10.3 asserts the current behaviour deliberately so that a fix flips it red on purpose and the expectation gets updated rather than the case deleted. `aria-invalid` also remains "false" in every rejected case, so no validation state is exposed at all.
   CORRECTION recorded for the record, because it changed two scenarios: the rejection contract is REVERT TO THE CURRENT PAGE, not "reset to page 1". The first discovery pass concluded reset-to-page-1 because every probe in it happened to start from page 1, which makes the two behaviours indistinguishable. Scenario 10.2 caught it - typing 136 while on page 135 reverts to 135, not 1 (expected "1", received "135"). Confirmed rejected values are "0", "-1", "abc", "99999" and one-past-the-last-page, each reverting to whatever page was already shown; "007" is normalised to page 7 and a plain "3" navigates to page 3. Scenario 10.1 now captures the current page before each probe and asserts the revert against that, so it is order-independent.
21. SCOPE NOTE on field-level validation - the history GRID has none to test, and NM-854 puts field validation explicitly out of scope for it: the live census measured zero inputs, zero textareas, zero selects and zero contenteditables inside the table, which scenarios 2.1-2.4 exist to prove. The tab does however have exactly ONE editable field - the paginator's page-number box - and that IS in scope and IS unvalidated, so it gets dedicated negative coverage in group 10. This is the whole of the tab's field-level validation surface; there is no analogue here to the Basic Information suite's 51 field-validation cases or the ECT plan's Benefits Multiplier / Labor Cost validation.
22. CONFIRMED paging and control contract - 20 rows per page by default, 135 pages for office 1604, rows-per-page options exactly 10/20/30/40/50, and the history type selector offers exactly "Location Management History" (the default) and "Location Management Legacy History" - which vindicates the pre-existing HISTORY_COMBOBOX constant that scenario 9.3 was written to treat as unverified. Scenario 11.2 now asserts the page-size contract directly.
23. AUTHORING NOTE - a one-shot "grid has settled" wait is not sufficient on this tab and two scenarios proved it. Scenario 1.2 failed on its first attempt (expected 20 rows, received 0) because the settle check accepted a rendered header row while `tbody` was still being repopulated on tab re-entry; and scenario 4.6 then failed twice with an EMPTY header list because after a full page reload the grid settles and THEN re-renders, briefly leaving no `th` at all. Both were fixed at the root cause rather than by relaxing an assertion: waitForHistoryGridLoaded() now requires a header row AND either a data row or a persistently-empty grid, and historyColumnIndex() self-heals by re-settling once if it ever sees an empty header row. Measured settle times: ~1.3-1.9s on a first open, ~0.3s on a tab re-entry.

25. STRUCTURAL FINDING (history type) - the "Location Management Legacy History" type does not reuse the standard grid. CONFIRMED: selecting it removes `local-office-settings-history-table` from the DOM entirely and renders `local-office-settings-legacy-history-table` inside `local-office-settings-legacy-history-container` instead, with 44 columns (two more than the standard view's 42) and 1 row for office 1604. Scenario 9.3 asserts this contract, and selectHistoryType() now waits for EITHER grid rather than assuming the standard one - waiting for the standard table timed out after 30s on the first full sequential run.
26. ORDER-CONTAMINATION FINDING - the first full sequential run earned its keep by failing a test that passed in isolation. Scenario 10.1 had "136" hardcoded as its out-of-range page value, which is only out of range while the grid is in its default 135-page state; once the failing 9.3 above left the panel in the legacy view, 136 became reachable, so the value navigated instead of being rejected (expected "1", received "136"). Both the constant and the scenario now derive one-past-the-end from the live page count at runtime. This is the class of defect that `fullyParallel: false` plus a whole-file run exists to catch, and that no targeted batch can.
27. CORRECTED FINDING - scenarios 4.3 (numeric sort) and 4.5 (boolean sort) now RUN; an earlier pass wrongly recorded them as un-runnable on this office. The first conclusion was that office 1604 simply has no varying numeric or boolean column, because a full 20-row page shows none - every value is identical top to bottom. That was measuring the wrong thing. Sorting each candidate column BOTH ways and reading the top cell yields its true minimum and maximum across all ~2,700 records, and that showed real variation: Return Date Offset ranges 0 to 2, and Use Fulfillment, Use Availability, Print Desc and Default Labor to Hourly each range from unset to set. Page 1 is uniform only because consecutive history rows are near-identical configuration snapshots; the extremes sit deep in the history and surface once sorted. Both scenarios therefore sort FIRST and assert after - the same shape 4.4 already used for dates - and neither skips. Genuinely constant across all history, and unusable for an ordering assertion: Prep Date Offset (0), Regular Hours (24), Regular Hours Multiplier (1), OverTime Hours Multiplier (1.5), Holiday Multiplier (0) and Recalc Labor Hours (always unset). The lesson worth keeping: on a snapshot-style history grid, "is there variation to sort?" must be asked AFTER sorting, never before.

24. Estimate reconciliation: the requirement doc estimated 22-30 testcases and this plan now defines 43. The first 36 exceeded the estimate through the six route-mocked payload states (5.4, 5.5, 6.1-6.4) and the two pagination-completeness scenarios (8.1, 8.2) - the doc's estimate predates the paginator, which the live tab has and NM-854 never mentions. The final 7 (groups 10-12) were added AFTER the first live run exposed surface the requirement doc never described: the paginator's editable page box and the two folded composite columns.

This plan reuses existing framework page-object/selector/data conventions already present in the repository (src/pages/local-office/local-office-history.page.ts, src/selectors/local-office/local-office-history.ts, src/data/local-office/local-office-history.ts) so test authors can implement each scenario directly against those data-testid selectors and constants. The page object extends LocalOfficeSettingsPage, which extends BasePage, so tab navigation, the Save Changes and Unsaved Changes dialog handling, and the Radix checkbox/combobox primitives all come for free, and Basic Information's own field helpers (getInputValue, fillAndTab, isSaveEnabled, waitForSaveToEnable, clickSaveAndConfirm, navigateToBasicInfoTab, reloadBasicInfo, waitForBasicInfoForm, isOnBasicInfoTab, clickTab, clickTabDirect, isTabSelected) are available on the same object for the two integration scenarios. getElement() resolves a string key against LocalOfficeHistorySelectors, then LocalOfficeSettingsSelectors, then the global getTsSelector() merge, and throws on an unknown key. Selector keys: tabContainer, tabHistory, tabContentHistory, tabBasicInformation, tabEctSettings, secHistoryTypeSelector, drpHistoryType, secHistoryTableContainer, tblHistory, btnHistoryFirstPage, btnHistoryPrevPage, btnHistoryNextPage, btnHistoryLastPage, txtHistoryCurrentPage, drpHistoryRowsPerPage - plus txtPhone2, btnSave, dlgSaveChanges, btnSaveChangesConfirm and dlgUnsavedLocalOffice for the two integration scenarios. Page-object methods, all decorated with @step and all kept GENERIC - parameterized by header text or selector key rather than one method per column, matching how base.page.ts already generalizes with getRadixCheckboxState/selectComboboxOption/getColumnHeadersByKeys: navigateToHistoryTab, isOnHistoryTab, reloadAndNavigateToHistory, getTabStripLabels, waitForHistoryGridLoaded, getHistoryTableCount, getHistoryColumnHeaders, getHistoryColumnHeaderCount, getHistoryColumnHeaderRoleCount, resolveHistoryColumns, findHistoryColumnLabel, getHistoryColumnIndex, isHistoryTableEmpty, getHistoryEmptyStateText, getHistoryRowCount, getHistoryRowCellCounts, getHistoryColumnByHeader, getHistoryColumnValues, getHistoryRowValues, getHistoryCellMatrix, getHistorySortButtonCount, getHistorySortableColumns, getHistorySortControlNames, isHistoryColumnSortable, getHistoryAriaSort, getHistorySortedColumnIndexes, getHistoryAriaSortStates, sortHistoryColumn, sortHistoryByModifiedOnDesc, captureRequestsDuringSort, openHistorySortMenuByKeyboard, getSortMenuItemLabels, applySortMenuItemByKeyboard, closeSortMenuWithEscape, isHistoryTabReadOnly, getHistoryPanelControlCensus, attemptEditHistoryCell, isHistoryRowSelected, rightClickHistoryRow, getHistoryPendingState, getHistoryOverflow, resizeViewport, isHistoryTypeSelectorPresent, getHistoryTypeValue, getHistoryTypeOptions, selectHistoryType, getHistoryPaginationText, getHistoryPaginationButtonCount, getHistoryPageIndicator, isHistoryPaginationButtonPresent, isHistoryPaginationButtonDisabled, clickHistoryPaginationButton, getHistoryRowsPerPageValue, getHistoryRowsPerPageOptions, setHistoryRowsPerPage, waitForRecentTopHistoryRow, and the static parseModifiedOnMs. Data-file constants: LOCAL_OFFICE_TAB_ORDER, HISTORY_EMPTY_STATE_TEXT, HISTORY_SORT_COLUMN, HISTORY_AUDIT_USER_COLUMN, HISTORY_EXPECTED_COLUMNS (grouped exactly as NM-854 groups them - identifiersAndOffsets, featureToggles, contactAndSection, serviceAndTax, brandingAndAudit, laborSettings), HISTORY_HOLIDAY_MULTIPLIER_COLUMN, HISTORY_MIN_COLUMN_COUNT, HISTORY_FORBIDDEN_CELL_TEXT, HISTORY_FORBIDDEN_BOOLEAN_TEXT, HISTORY_MODIFIED_ON_PATTERN, UUID_PATTERN, RAW_FIELD_KEY_PATTERN, I18N_PLACEHOLDER_PATTERNS, HISTORY_API_URL_PATTERN, HISTORY_MOCK, HISTORY_INTEGRATION_FIELD, HISTORY_COMBOBOX, AUTOMATION_USER - plus OFFICE_NO from src/data/common.ts, so the office number is never inlined.

Fixtures and report utilities are likewise all pre-existing, so this plan adds none: authenticatedSession (worker-scoped - one SSO session per worker, restored from .auth/encore-state.json written by the `setup` project), localOfficeHistoryPage (already registered at src/fixtures/pages.fixture.ts:393), localOfficeSettingsPage, config (CommonMethods.initProp(), base_url from env), and dependencyGate (an Allure dependsOn annotation only - actual ordering comes from fullyParallel:false, which keeps scenario 1.1 first). Step numbering in the HTML report is automatic: reportStep() numbers every step created at a test body's top level as 'Step 1: ...', 'Step 2: ...' in call order, the @step decorator routes through the same counter so a bare page-object call from a test body is numbered exactly like a phase(), hook bodies are excluded so beforeEach never spends Step 1, and nested steps stay unnumbered so they read as the detail of their parent - which means inserting or reordering a step never renumbers the ones around it. What conversion adds is NAMING: phase() where several actions form one business step, and verify() around each assertion cluster, since a bare expect reaches the report as 'Expect toBe'. `npm run check:steps` must report this spec fully named. Test-case ids run in the family TC-LOE-HIST (siblings TC-LOE-BASIC and TC-LOE-ECT), contiguous from 001 to 043 with no gaps, enforced by `npm run check:tc-ids`; the scenario numbering below maps to them in order, so scenario 1.1 is TC-LOE-HIST-001 and scenario 12.2 is TC-LOE-HIST-043. TestRail mapping goes through testcases/local-office/local-office-history.xlsx (sheet local_office_history) into testcases-testrail-import/local-office/local-office-history.csv under section hierarchy Local_Office > Location_Settings_History in suite Master/S1620, registered in scripts/convert-testcases-to-testrail.py's SECTION_BY_BASENAME; `npm run testrail:sync:execute` imports the cases, writes their ids into config/testrail/case-map.json AND rewrites each test() line to carry `{ tag: '@C<id>' }`, so the spec must be authored with a plain single-line `test('TC-LOE-HIST-NNN: title', async ({ ... }) => {` signature and NO tag option - that exact shape is what the sync's spec-tagger matches on, and a pre-written tag would be skipped and left stale. Configuration is unchanged: dotenv-flow loads .env.local for a bare `npm test` and .env.e2e when CI_ENV=e2e, and the suite runs as `--project=encore-local-office` (testDir ./tests/local-office, fullyParallel:false, depends on `setup`).

Every scenario below assumes a fresh/blank starting state: freshly authenticated session, freshly navigated to {BASE_URL}locations/1604/settings/local-office, and the Location Settings History tab freshly opened with its grid settled - via waitForHistoryGridLoaded(), which polls for a header row OR the 'No results.' empty state, because a table that is visible with neither is still loading and is the exact window a plain visibility wait races against. Scenarios are independent and may be run in any order. Because the tab is read-only, most scenarios need no cleanup at all; the ones that do are explicit about it - every route-mocking scenario unroutes in a finally block and re-navigates to live data, 7.2 restores the 1920x1080 viewport in a finally block, 8.1 returns to page 1, 8.2 restores the original rows-per-page value and returns to page 1, 9.1 restores Phone 2 to its captured original and saves (treating a Save that never re-enables as an already-correct net-zero restore), and 9.2 always exits through the Unsaved Changes dialog's Discard so nothing is ever persisted - leaving office 1604's data unchanged for subsequent runs, mirroring the ECT and Basic Information plans' restore-and-discard patterns.

## Test Scenarios

### 1. Navigation & Panel Rendering (Happy Path)

**Seed:** `tests/seed.spec.ts`

#### 1.1. Location Settings History tab opens its own panel with a rendered grid

**File:** `tests/local-office/local-office-history.spec.ts`

**Steps:**
  1. Navigate to office 1604 in Navigator, open Local Office Settings, and read the tab strip labels.
    - expect: The tab strip reads exactly 'Basic Information', 'Location Settings History', 'ECT Settings' in that order.
  2. Open the Location Settings History tab and wait for the grid to load.
    - expect: The History tab reports aria-selected='true'.
    - expect: The history tab-content panel is visible.
    - expect: The history table is visible.
  3. Read the column header count, the data row count, and the empty-state flag.
    - expect: The header row renders more than one column.
    - expect: The grid shows either at least one data row or the 'No results.' empty state - never neither, which is the half-rendered state a plain visibility wait races against.
  4. Attach the observed column header list and the first row's values to the HTML report.
    - expect: The attachments are present in the report. They are diagnostic - they record the exact translated labels for the hardening described in overview item 3 - and do not gate the result.

#### 1.2. Switching away from and back to the History tab keeps the grid stable

**File:** `tests/local-office/local-office-history.spec.ts`

**Steps:**
  1. Capture the History grid's column headers and data row count.
    - expect: Both are captured as the baseline for the round-trip comparison.
  2. Click the Basic Information tab and wait for its form to render.
    - expect: Basic Information becomes the selected tab and its form is visible.
  3. Click the Location Settings History tab again and wait for the grid to load.
    - expect: History becomes the selected tab again and the grid renders.
  4. Re-read the column headers, the data row count, and the number of history tables in the panel.
    - expect: The header list is identical to the baseline - no dropped, duplicated or reordered columns.
    - expect: The data row count is identical to the baseline.
    - expect: Exactly one history table exists, so the panel did not render a second grid on top of the first.

#### 1.3. The History tab selection is not preserved across a hard reload

**File:** `tests/local-office/local-office-history.spec.ts`

**Steps:**
  1. With the History tab open, capture the column header count.
    - expect: The header count is captured.
  2. Perform a hard reload of {BASE_URL}locations/1604/settings/local-office.
    - expect: The page loads with the Basic Information tab selected and the History tab NOT selected - the tab choice is not deep-linked into the URL, matching the behavior the ECT Settings plan documents for its own tab.
  3. Re-open the Location Settings History tab and wait for the grid to load.
    - expect: The grid renders again with exactly the same column header count as before the reload.

### 2. Read-Only Enforcement

**Seed:** `tests/seed.spec.ts`

#### 2.1. The history grid contains no editable control and the panel offers no Save

**File:** `tests/local-office/local-office-history.spec.ts`

**Steps:**
  1. Take a control census of the history panel and the history table in a single pass.
    - expect: The census is captured.
  2. Assert the census counts for editable controls inside the TABLE, not the panel.
    - expect: Zero inputs (excluding type=hidden), zero textareas and zero Save buttons. The scoping is deliberate: the paginator's page-number input is a sibling of the table inside the panel, and counting it would make a read-only tab look editable.
  3. Call the page object's read-only predicate for the history tab.
    - expect: The predicate returns true.

#### 2.2. No add, edit, delete or row-selection affordance exists in the history panel

**File:** `tests/local-office/local-office-history.spec.ts`

**Steps:**
  1. Take a control census of the history panel.
    - expect: The census is captured.
  2. Assert no action button exists, matching on each button's accessible TEXT rather than with a substring selector.
    - expect: Zero buttons whose accessible text is Add, Add New, New, Edit, Delete, Remove or Save, and the failure message names any that were found. Matching on exact accessible text avoids over-reporting - 'Save' as a substring would also match a paginator tooltip or a column label.
  3. Assert the grid has no row-selection column.
    - expect: Zero native checkboxes, zero radio inputs and zero role='checkbox' elements inside the table.
  4. Assert the grid has no inline editor of any kind.
    - expect: Zero select elements and zero [contenteditable="true"] elements inside the table.

#### 2.3. Clicking and double-clicking a data cell produces no editor and no selection

**File:** `tests/local-office/local-office-history.spec.ts`

**Steps:**
  1. Confirm the grid has at least one data row, skipping with a data-precondition message otherwise.
    - expect: A data row is available to probe.
  2. Single-click, then double-click, the first cell of the first data row, then re-read the cell.
    - expect: No input, textarea or contenteditable element appears in the cell.
    - expect: The cell's text is identical to its value before the clicks.
  3. Re-check the row's selection state.
    - expect: The row carries neither aria-selected='true' nor data-state='selected' - clicking does not select a history row.

#### 2.4. Right-clicking a history row opens no context menu

**File:** `tests/local-office/local-office-history.spec.ts`

**Steps:**
  1. Confirm the grid has at least one data row and capture the header count.
    - expect: A data row is available and the header count is captured.
  2. Right-click the first data row and watch for an application context menu.
    - expect: No [role="menu"] appears. This is the contrast case against the Basic Information Section and Room Configuration grids, whose rows carry title='Right-click for actions' and DO expose a Delete action - a history row must not.
  3. Re-assert the grid state after the right-click.
    - expect: The header count and the data row count are both unchanged.

### 3. Column Coverage & Localization

**Seed:** `tests/seed.spec.ts`

#### 3.1. Every column header renders translated text, uniquely and non-blank

**File:** `tests/local-office/local-office-history.spec.ts`

**Steps:**
  1. Read every column header's text from the history grid.
    - expect: The header row renders at least 20 columns (HISTORY_MIN_COLUMN_COUNT). NM-854's dataset is 44 fields; 20 is a deliberately conservative floor - low enough to survive a column the grid legitimately does not render, high enough to catch a collapsed header row showing only the audit columns.
  2. Assert no header is blank after trimming.
    - expect: No header is an empty string.
  3. Assert no header is a raw, untranslated field key - an unspaced camelCase/PascalCase run such as HolidayMultiplier or modUser.
    - expect: No header matches the raw-field-key pattern, and the failure message lists any that do. NM-854 requires every header to display translated text via the application i18n translation function, so a raw key is a direct requirement violation.
  4. Assert no header leaks an untranslated i18n placeholder or key path ('{{', '}}', or a dotted key such as localOffice.history.notes).
    - expect: No header contains an i18n placeholder, and the failure message lists any that do.
  5. Assert no header is duplicated.
    - expect: The set of distinct header labels is the same size as the header list.
  6. Attach the full observed header label list to the HTML report.
    - expect: The attachment records the exact live labels, which is what allows this scenario's subset matching to be tightened into an ordered full-list equality after the first live run.

#### 3.2. Identifier and date-offset columns are present in the history grid

**File:** `tests/local-office/local-office-history.spec.ts`

**Steps:**
  1. Resolve NM-854's seven identifier and date-offset fields - Local Office ID, Prep Date Offset, Return Date Offset, Set Date Offset, Strike Date Offset, Pickup Date Offset, Delivery Date Offset - against the live header row, case- and separator-insensitively.
    - expect: Every one of the seven fields resolves to exactly one column.
    - expect: The failure message names any field that is not captured in history, so a missing-field-capture regression identifies the field rather than only reporting a short count.

#### 3.3. Feature-toggle and boolean columns are present in the history grid

**File:** `tests/local-office/local-office-history.spec.ts`

**Steps:**
  1. Resolve NM-854's sixteen feature-toggle/boolean fields - Use Fulfillment, Use Availability, Use Equip QC, Print Description, Use Subrent Service Type, Use Default Section, Use On Quote, Use On ROD RO, PMS Account Enabled, Default Job One Day Event, Default Job One Day Outside, Default Job One Day Internal, Default Labor To Hourly, Same Priority On Status Change, Request Items Return To Availability, Recalc Labor Hours - against the live header row.
    - expect: Every one of the sixteen fields resolves to exactly one column.
    - expect: The failure message names the absent fields by name. This is the largest single group in NM-854's dataset and therefore the likeliest place for a dropped field to hide.

#### 3.4. Contact, section, service, tax, branding and audit columns are present

**File:** `tests/local-office/local-office-history.spec.ts`

**Steps:**
  1. Resolve the five contact and section fields - Phone 1, Phone 2, Section Name, Section Is Active, Default Section Action - against the live header row.
    - expect: All five resolve, and the failure message names any that are missing.
  2. Resolve the four service and tax fields - Service Type Name, ST Exempt, ST Exempt Action, Default Order Type.
    - expect: All four resolve, and the failure message names any that are missing.
  3. Resolve the five branding and audit fields - Logo Name, Loc Settings Action, Notes, Modified By, Modified On - then assert Modified On and Modified By individually.
    - expect: All five resolve.
    - expect: Modified On and Modified By each resolve on their own separate assertion, because every sorting and audit scenario in this plan resolves against those exact labels, so their absence must fail unambiguously rather than as one entry in a list diff.

#### 3.5. Labor settings columns are present, including Holiday Multiplier

**File:** `tests/local-office/local-office-history.spec.ts`

**Steps:**
  1. Resolve NM-854's seven labor settings fields - Regular Hours, Regular Hours Multiplier, Over Time Hours, Over Time Hours Multiplier, Double Time Hours, Double Time Hours Multiplier, Holiday Multiplier - against the live header row.
    - expect: All seven resolve to exactly one column each, and the failure message names any that are not captured.
  2. Assert Holiday Multiplier resolves, on its own separate assertion.
    - expect: Holiday Multiplier is rendered as a history column. This is the field NM-854's prior analysis recorded as missing, so it is asserted separately to make a regression here unambiguous in the report.
    - expect: Note for implementers - these same seven labels are asserted ABSENT from the Basic Information form by that suite's HIDDEN_FIELD_PROBE_STRINGS. The two suites are consistent by design: the labor fields are tracked in history but are not editable on the Basic Information tab, so neither assertion contradicts the other.

#### 3.6. Every data row has exactly as many cells as there are column headers

**File:** `tests/local-office/local-office-history.spec.ts`

**Steps:**
  1. Read the column header count and confirm at least one data row exists.
    - expect: The header count is greater than one and rows are available to measure.
  2. Read the cell count of every rendered data row, up to 20 rows.
    - expect: Every row's cell count equals the header count, and the failure message lists any differing counts. A short or long row is exactly how a cell-shift/misalignment defect presents.

### 4. Sorting

**Seed:** `tests/seed.spec.ts`

#### 4.1. Sortable columns expose a sort control with an accessible name

**File:** `tests/local-office/local-office-history.spec.ts`

**Steps:**
  1. Count the header cells and the sort buttons inside header cells.
    - expect: At least one sort control exists.
    - expect: The sort control count does not exceed the header count, so no column carries more than one control.
  2. Read the accessible name of every sort control - its aria-label when present, otherwise its text.
    - expect: Every sort control has a non-empty accessible name, so a screen-reader user can tell which column a control sorts. NM-854 requires table headers to be accessible and to communicate sort state.

#### 4.2. Sorting a text column ascending then descending reverses the row order

**File:** `tests/local-office/local-office-history.spec.ts`

**Steps:**
  1. Sample every sortable column's first eight values in one header pass plus one cell-matrix pass, then pick the first column whose values are distinct alphabetic text.
    - expect: A suitable text column is found. If the live page offers none, the scenario skips with a data-precondition message rather than failing - a dataset that cannot exercise a rule is not a defect.
  2. Sort that column ascending via its header's Radix sort menu and read the column's non-blank values.
    - expect: The values are in non-descending order under a case-insensitive comparison, and the failure message prints the offending sequence.
  3. Sort the same column descending and re-read its values.
    - expect: The values are in non-ascending order.
    - expect: The descending first value differs from the ascending first value, proving the grid actually re-ordered rather than re-rendering the same slice.

#### 4.3. Sorting a numeric column sorts numerically, not lexicographically

**File:** `tests/local-office/local-office-history.spec.ts`

**Steps:**
  1. Confirm the "Return Date Offset" column is sortable.
    - expect: It carries a sort control.
  2. Sort it ascending and read the visible values as numbers.
    - expect: Every value parses to a finite number.
    - expect: The values are in non-descending order, compared as PARSED NUMBERS - which is what makes a lexicographic sort placing "10" before "9" fail here.
    - expect: The top row carries the minimum of the visible values, and that minimum is the column's all-history minimum (0).
  3. Sort it descending and re-read the values as numbers.
    - expect: The values are in non-ascending order and the top row carries the maximum (2).
    - expect: The descending top differs from the ascending top, proving the grid re-ordered rather than re-rendering the same slice.
  4. Note on column choice: the column is sorted FIRST and read after, using one confirmed to vary across the whole history.
    - expect: Page 1 is uniform by nature, so scanning it for variation before sorting finds none. See overview item 27 for the columns that are genuinely constant and cannot carry this assertion.

#### 4.4. Sorting Modified On ascending shows the oldest record first and descending the newest

**File:** `tests/local-office/local-office-history.spec.ts`

**Steps:**
  1. Sort Modified On ascending and read the visible timestamps, parsing each with Date.UTC semantics.
    - expect: Every value parses to a finite timestamp. A NaN here means the rendered format no longer matches the parser, which is the assertion that catches a silent date-format change instead of letting the comparisons below pass vacuously.
    - expect: The timestamps are in non-descending order.
    - expect: The first row carries the minimum timestamp of all visible rows.
  2. Sort Modified On descending and re-read the timestamps.
    - expect: The timestamps are in non-ascending order.
    - expect: The first row carries the maximum timestamp of all visible rows.
    - expect: The descending first row differs from the ascending first row.

#### 4.5. Sorting a boolean column groups its set and unset rows contiguously

**File:** `tests/local-office/local-office-history.spec.ts`

**Steps:**
  1. Confirm the "Use Fulfillment" column is sortable.
    - expect: It carries a sort control.
  2. Sort it ascending and read its boolean-aware values.
    - expect: Every cell is either a check glyph or blank - never literal true/false text.
    - expect: The values are grouped: at most one transition between the two states across the visible rows. A boolean sort must group, never interleave.
  3. Sort it descending and re-read.
    - expect: The values are still grouped.
    - expect: The two sort directions lead with OPPOSITE states (one blank, one check). That partition is the ordering proof for this column - the history holds far more of one state than the other, so both states rarely appear on one page, and asserting a visible transition would skip on real data.
  4. Note on column choice: as with 4.3, sort first and assert after.
    - expect: Recalc Labor Hours is unset in every history record and cannot carry this assertion.

#### 4.6. The sorted column communicates its sort state and only one column sorts at a time

**File:** `tests/local-office/local-office-history.spec.ts`

**Steps:**
  1. Re-open the tab with a full reload so the sort state is the initial one, then read the indexes of every column reporting an aria-sort of ascending or descending.
    - expect: At most one column reports a sorted state on first load. This is deliberately the weaker invariant - NM-854 does not specify the default sort column or direction, so asserting a specific default would encode a guess (see overview item 4).
  2. Resolve Modified On's column index, sort it ascending, and re-read the sort state by index.
    - expect: The Modified On column reports aria-sort='ascending'.
    - expect: The set of sorted column indexes is exactly that one index, so no other column reports a sort state.
  3. Sort Modified On descending and re-read.
    - expect: The Modified On column reports aria-sort='descending'.
    - expect: The set of sorted column indexes is still exactly that one index.
  4. Sort a different sortable column ascending, skipping if the grid has only one sortable column, then re-read.
    - expect: The newly sorted column reports aria-sort='ascending'.
    - expect: Modified On reports aria-sort='none' and exactly one column is sorted - sorting is single-column and the indicator moves with it.
  5. Attach the header-keyed aria-sort map to the HTML report.
    - expect: The attachment records how each header labels itself alongside its sort state, which is what shows whether any `th` carries screen-reader-only text worth accounting for (see overview item 5).

#### 4.7. Sorting issues a backend request and the rendered order matches the response

**File:** `tests/local-office/local-office-history.spec.ts`

**Steps:**
  1. Start recording network requests, then sort Modified On descending and collect the requests issued during the sort.
    - expect: At least one request whose URL looks like a history / local-office / location-settings endpoint is issued. NM-854 requires sorting to align with backend-supported sort behavior, so the observable contract is that a request goes out rather than the grid re-ordering client-side only.
    - expect: The failure message prints every request seen during the sort, so a miss is diagnosable without a re-run.
  2. Re-read the Modified On column once the network has settled.
    - expect: Every value parses to a finite timestamp.
    - expect: The first row carries the maximum timestamp of the visible rows, i.e. the grid reflects the sorted response rather than a stale client-side order.
  3. Attach the captured request URLs to the HTML report.
    - expect: The attachment records the real sort-parameter contract, which is what answers the requirement doc's first open question - the exact API contract for history retrieval and sorting parameters - on the first live run.

### 5. Data Rendering

**Seed:** `tests/seed.spec.ts`

#### 5.1. Boolean cells render as a check glyph or blank, never as literal text

**File:** `tests/local-office/local-office-history.spec.ts`

**Steps:**
  1. Read the boolean-aware values of every resolvable NM-854 boolean column across the first five rows.
    - expect: The sample is captured. Boolean cells render a lucide-check SVG for true and nothing for false, so textContent is empty for BOTH states and each cell must be re-checked against innerHTML - reading textContent alone would report every boolean as false.
  2. Assert no boolean cell renders literal true/false text.
    - expect: No cell equals 'true', 'false', 'True' or 'False', and the failure message lists any that do.
  3. Assert every boolean cell is either a check glyph or empty.
    - expect: No boolean cell renders anything other than a check or a blank, and the failure message lists any that do.
  4. Assert at least one true value was observed in the sample.
    - expect: At least one boolean cell yields a check glyph. Without this, a grid rendering every boolean as blank would pass steps 2 and 3 vacuously - this is the assertion that makes the scenario non-trivial.

#### 5.2. Modified On is formatted correctly and Modified By is a user identifier, not a GUID

**File:** `tests/local-office/local-office-history.spec.ts`

**Steps:**
  1. Read Modified On for the first three rows.
    - expect: Every non-blank value matches MM/DD/YYYY hh:mm:ss AM|PM - the format both sibling history grids render and the format the timestamp parser expects - and the failure message prints any malformed value.
  2. Read Modified By for the same rows.
    - expect: No value is a bare UUID/GUID. The audit column must show a user identifier, never a raw internal id, and this is the one security-relevant assertion a read-only grid can make (see overview item 13).
    - expect: No row that has a non-blank Modified On has a blank Modified By, since a recorded change always has an author.

#### 5.3. Null and blank optional values render as empty cells without corrupting the row

**File:** `tests/local-office/local-office-history.spec.ts`

**Steps:**
  1. Read every cell of the first ten data rows, boolean-aware.
    - expect: The cell matrix is captured.
  2. Assert no cell leaks a placeholder for a missing value.
    - expect: No cell equals or contains 'null', 'undefined', 'NaN', 'Invalid Date' or '[object Object]', and the failure message prints the offending cells.
  3. Assert every sampled row still has exactly the header count of cells.
    - expect: A null or blank value produces an empty cell rather than a dropped one, so no row is shortened by missing data. NM-854 requires the history tab to remain stable when optional values are null or blank.

#### 5.4. A very long Notes value scrolls inside the grid without widening the page

**File:** `tests/local-office/local-office-history.spec.ts`

**Steps:**
  1. Intercept the history response and overwrite the first record's Notes field with a 2,000-character single-token string (no break opportunity, the worst case for a table that must scroll inside its own container), then reload the tab.
    - expect: The grid renders with a header row and at least one data row.
  2. Measure the document's horizontal overflow.
    - expect: The page body does not scroll horizontally - documentElement.scrollWidth does not exceed clientWidth by more than a 1px sub-pixel rounding allowance.
  3. Measure the grid container's own horizontal overflow.
    - expect: The grid container is the element absorbing the extra width - its inner table's scrollWidth exceeds the container's clientWidth - i.e. wide content is contained rather than spilled onto the page.
  4. Remove the response interception in a finally block and reload the tab.
    - expect: Live data renders again, leaving the shared browser session clean for the next scenario.

#### 5.5. Single-row and multi-row payloads both render correctly

**File:** `tests/local-office/local-office-history.spec.ts`

**Steps:**
  1. Read the live grid's row count and column headers.
    - expect: The live grid renders more than one row, confirming multi-row rendering against real data.
  2. Intercept the history response, trim it to exactly one record, and reload the tab.
    - expect: Exactly one data row renders.
    - expect: The column header list is unchanged - a one-record payload does not collapse or re-derive the columns.
  3. Read the single row's cell count.
    - expect: It equals the header count, so the lone row is neither short nor long.
  4. Remove the response interception in a finally block and reload the tab.
    - expect: The multi-row live grid is back.

### 6. Empty, Loading & Error States

**Seed:** `tests/seed.spec.ts`

#### 6.1. The friendly empty state is shown when no history exists

**File:** `tests/local-office/local-office-history.spec.ts`

**Steps:**
  1. Intercept the history response and return an empty record set, then reload the tab.
    - expect: The grid renders zero data rows.
  2. Read the grid's empty-state text.
    - expect: The grid reports empty and its first row contains the friendly empty-state copy 'No results.' - not a blank panel, not a stuck spinner, not an error. NM-854 requires a friendly empty state message when no history is available.
  3. Re-check the panel's structure and controls in the empty state.
    - expect: The column header row still renders, so the user can still see what the grid would contain.
    - expect: No Add/New/Edit/Delete/Remove/Save button and no input has appeared - an empty state must not grow affordances the populated grid does not have.
  4. Remove the response interception in a finally block and reload the tab.
    - expect: Live rows return.

#### 6.2. A pending history request shows a loading state that is then replaced by rows

**File:** `tests/local-office/local-office-history.spec.ts`

**Steps:**
  1. Intercept the history request and hold it unresolved behind a gate promise.
    - expect: The route is installed and the next history request will block.
  2. Navigate to Basic Information, click the History tab directly, and wait only for the PANEL to become visible - not for the grid to finish loading.
    - expect: The history tab-content panel is visible while the request is still pending.
  3. Snapshot the panel during the pending window.
    - expect: The panel shows a pending affordance - a spinner, a skeleton, or a grid with zero data rows.
    - expect: The panel does NOT show the 'No results.' empty state. This is the important half: telling the user there is no history while the request is still in flight is a defect, not a loading state.
  4. Release the held request and wait for the grid to settle.
    - expect: Data rows render and the pending affordance disappears.
  5. Release the gate and remove the interception in a finally block, then reload the tab.
    - expect: A subsequent navigation behaves normally, with no route left armed for the next scenario.

#### 6.3. A history API failure does not crash the tab and leaves the module navigable

**File:** `tests/local-office/local-office-history.spec.ts`

**Steps:**
  1. Attach a pageerror listener and intercept the history request, fulfilling it with HTTP 500.
    - expect: The failure route is installed and uncaught page errors will be recorded.
  2. Navigate to Basic Information and then open the History tab against the failing endpoint.
    - expect: The History tab still becomes selected and its panel still renders - no unhandled crash and no blank white panel.
  3. Inspect the panel and the recorded page errors.
    - expect: The panel shows either zero data rows or the empty state, never a partially rendered, corrupt row set.
    - expect: No uncaught page error was recorded, and the failure message prints any error text that was.
  4. Click the Basic Information tab and wait for its form.
    - expect: Navigation succeeds and the Basic Information form renders - a failed history fetch does not wedge the whole module.
  5. Remove the failure interception in a finally block and re-open the History tab.
    - expect: The grid recovers and renders live rows again without needing a full page reload.

#### 6.4. A malformed or partial history payload renders without crashing

**File:** `tests/local-office/local-office-history.spec.ts`

**Steps:**
  1. Intercept the history response and return a record with a third of its fields deleted and a third set to null, then reload the tab.
    - expect: The grid renders a header row and at least one data row.
  2. Read the header count and the first three rows' cells.
    - expect: Every row still has exactly the header count of cells - missing fields render as empty cells rather than shifting the row and mis-aligning every column after the gap.
  3. Assert no cell leaks a placeholder for the missing values.
    - expect: No cell equals or contains 'null', 'undefined', 'NaN', 'Invalid Date' or '[object Object]'.
  4. Sort Modified On descending against the degraded payload.
    - expect: The sort completes without throwing and the header count is unchanged, so the tab is still interactive after a partial payload.
  5. Remove the response interception in a finally block and reload the tab.
    - expect: Live data returns.

### 7. Accessibility & Responsive

**Seed:** `tests/seed.spec.ts`

#### 7.1. Headers are exposed as column headers and the sort menu is keyboard-operable

**File:** `tests/local-office/local-office-history.spec.ts`

**Steps:**
  1. Count elements exposing the columnheader role and compare with the `th` count.
    - expect: The columnheader count equals the `th` count - the grid's headers are exposed to assistive technology rather than rendered as plain cells. NM-854 requires table headers to be accessible.
  2. Focus the Modified On column's sort control with the keyboard and press Enter, then read the menu items.
    - expect: The sort menu opens from the keyboard.
    - expect: The menu contains both a 'Sort ascending' and a 'Sort descending' item.
  3. Press ArrowDown then Enter to apply a sort option using the keyboard alone.
    - expect: The menu closes and the Modified On column reports a non-'none' aria-sort value, i.e. sorting is fully achievable without a mouse.
  4. Re-open the menu and press Escape.
    - expect: The menu closes.
    - expect: The column's sort state is unchanged from before the menu was opened - Escape cancels the menu without applying anything.

#### 7.2. The grid stays usable at laptop viewport sizes with no page-level horizontal scroll

**File:** `tests/local-office/local-office-history.spec.ts`

**Steps:**
  1. At the default 1920x1080 viewport, record the column header count as the baseline.
    - expect: The baseline header count is captured.
  2. Resize the viewport to 1366x768, wait for the grid to settle, and measure the header count, the overflow and the paginator.
    - expect: No column is dropped - the header count is unchanged.
    - expect: The page body does not scroll horizontally and the grid container is the scrolling element.
    - expect: The paginator's controls are still present and reachable.
  3. Resize to 1280x720 and repeat the same three measurements.
    - expect: All of the same expectations hold at the narrower width.
  4. Restore the 1920x1080 viewport in a finally block and wait for the grid to settle.
    - expect: The grid renders with the baseline header count, leaving the shared browser session exactly as it was found for the tests that follow.

### 8. Pagination & Data Completeness

**Seed:** `tests/seed.spec.ts`

#### 8.1. Paging through history keeps the column set stable and renders rows on every page

**File:** `tests/local-office/local-office-history.spec.ts`

**Steps:**
  1. Read the paginator's current/total page indicator, the column headers, and the first row's Modified On value.
    - expect: The paginator reports a page position with a total greater than zero.
    - expect: If the office has only a single page of history, the scenario skips with a data-precondition message rather than asserting against paging it cannot exercise.
  2. Click 'Go to next page' and wait for the grid to settle.
    - expect: The page indicator advances by one.
    - expect: The header list is identical to page 1's.
    - expect: The page renders at least one data row.
    - expect: The first row's Modified On differs from page 1's, proving the paginator actually moved rather than re-rendering the same slice.
  3. Click 'Go to previous page'.
    - expect: The indicator returns to page 1 and page 1's first row matches the value captured in step 1.
  4. Check the paginator's boundary states on page 1.
    - expect: 'Go to first page' and 'Go to previous page' are both disabled.
  5. Click 'Go to last page' and check the forward boundary states.
    - expect: 'Go to next page' and 'Go to last page' are both disabled.
  6. Click 'Go to first page' to restore the initial paging state.
    - expect: The grid returns to page 1 for the scenarios sharing this session.

#### 8.2. Older history records are not truncated when the page size changes

**File:** `tests/local-office/local-office-history.spec.ts`

**Steps:**
  1. Sort Modified On ascending so the oldest records come first, then read the paginator total, the current rows-per-page value, and the column headers.
    - expect: The paginator total is greater than zero and the rows-per-page value is readable.
  2. Click 'Go to last page' and read the row count.
    - expect: The last page renders at least one data row. An empty terminal page is exactly how an off-by-one row-count/offset cut-off presents, which is the data-truncation defect this scenario guards.
  3. Return to the first page and read the oldest visible Modified On timestamp at the original page size.
    - expect: The oldest timestamp at the original page size is captured as the comparison baseline.
  4. Enumerate the rows-per-page options and switch to the largest one, skipping if none larger is offered.
    - expect: The grid re-renders with rows.
    - expect: The total page count does not increase.
    - expect: The column header list is unchanged.
  5. Read the oldest visible Modified On timestamp at the larger page size.
    - expect: It is less than or equal to the oldest timestamp seen at the smaller page size - raising the page size never LOSES older records, which is the truncation regression stated as a directional invariant rather than as a fixed expected row count.
  6. Restore the original rows-per-page value and return to the first page in a finally block.
    - expect: The grid returns to its initial paging state.

### 9. Regression & Integration

**Seed:** `tests/seed.spec.ts`

#### 9.1. A Basic Information save appears as a new top row in Location Settings History

**File:** `tests/local-office/local-office-history.spec.ts`

**Steps:**
  1. On the History tab, sort Modified On descending and capture the top row's timestamp and the total row count.
    - expect: The baseline top row and row count are captured.
  2. Switch to Basic Information and read the current Phone 2 value.
    - expect: The field is readable. Phone 2 is the chosen probe because NM-1715 confirmed it is optional, unvalidated free text with native maxLength=-1 and required=false and no cross-field rule, so an edit can never be rejected and the restore in step 9 can never be blocked.
  3. Set Phone 2 to a value derived from - and therefore guaranteed to differ from - the captured original, then blur.
    - expect: The Save button becomes enabled within 10 seconds. A hardcoded value the database already holds would be a net-zero edit that leaves the Angular form pristine, Save disabled, and the save click hanging on a disabled button.
  4. Click Save and confirm the Save Changes dialog.
    - expect: The save reports success and the page-level Save button returns to disabled.
  5. Switch to the History tab, sort Modified On descending, and poll until the top row is recent.
    - expect: The grid settles with the newest record at the top. The poll is required because a stability wait alone does not cover the 1-3 second ascending-to-descending re-render, during which the top row can still show old timestamps.
  6. Read the new top row's Modified On, Modified By and Phone 2 cells.
    - expect: The row count is at least the baseline count.
    - expect: The new top row's timestamp is newer than the baseline top row's.
  7. Assert the new row's attribution and recency.
    - expect: Modified By contains the automation user's identifier (s-prd-clickauto@psav.com), not a raw GUID.
    - expect: The row's timestamp is less than 15 minutes old. Recency is asserted instead of a date-string comparison because the grid renders UTC text with no offset, so comparing against 'today' in either the runner's or the render timezone would flip at midnight; a 15-minute window is timezone-proof and a stronger claim anyway.
  8. Assert the saved field value was captured into the history record.
    - expect: The new top row's Phone 2 cell contains the value that was saved. This is the missing-field-capture regression from NM-854's earlier analysis - a history row can appear while the changed field is silently dropped from the record, and only a value-level assertion catches that.
  9. In a finally block, restore Phone 2 to its original value and save, treating a Save that never re-enables as an already-correct net-zero restore.
    - expect: Office 1604's Basic Information is left exactly as it was found, regardless of whether any assertion above failed.

#### 9.2. Navigating to History with unsaved Basic Information edits raises the Unsaved Changes dialog

**File:** `tests/local-office/local-office-history.spec.ts`

**Steps:**
  1. On the Basic Information tab, read Phone 2 and set it to a different derived value, then blur.
    - expect: The page-level Save button becomes enabled, confirming the form is dirty.
  2. Click the Location Settings History tab directly, without saving.
    - expect: An 'Unsaved changes' alertdialog appears before navigation completes.
    - expect: Its body reads 'Are you sure you want to leave this view? Any unsaved changes will be lost.' - identical wording to the ECT Settings and Basic Information plans' dialog, since it is the same shared global component.
    - expect: Both Stay and Discard buttons are visible.
  3. Click 'Stay'.
    - expect: The dialog closes and Basic Information is still the selected tab.
    - expect: Phone 2 still shows the edited value and Save is still enabled - Stay preserves the pending edit.
  4. Click the History tab again and click 'Discard' on the resulting dialog.
    - expect: Navigation to the History tab completes and the grid loads with its header row.
  5. Return to the Basic Information tab.
    - expect: Phone 2 shows its original value again and Save is disabled - the discard fully reverted the unsaved edit, so nothing was ever persisted and office 1604 is left clean.

#### 9.3. The history type selector switches between the standard and legacy grids

**File:** `tests/local-office/local-office-history.spec.ts`

**Steps:**
  1. Check whether the history type selector is present in the panel.
    - expect: If it is absent, the scenario skips with an explicit "not present for this office/permission" message rather than failing. The control is not described anywhere in NM-854 and may be feature-flagged or permission-gated, which is itself the requirement doc's third open question.
  2. Read the selector's current value, enumerate its options, and capture the standard grid's column headers.
    - expect: The options are exactly "Location Management History" and "Location Management Legacy History" - which confirms the pre-existing HISTORY_COMBOBOX constant this scenario was originally written to treat as unverified.
    - expect: The current value is the standard type and the standard grid is the active one.
  3. Select the legacy history type and wait for whichever grid that type renders.
    - expect: STRUCTURAL FINDING - the legacy type renders its OWN grid, not the standard one: a different data-testid (`local-office-settings-legacy-history-table`, inside `local-office-settings-legacy-history-container`) carrying 44 columns rather than the standard view's 42, with at least one row. Code that switches history type must therefore not assume which of the two grids will appear.
  4. Query the legacy grid for any input, textarea, select or contenteditable element.
    - expect: Zero are found - the legacy grid is as strictly read-only as the standard one, so the read-only guarantee is not a property of one history type only.
  5. Restore the original history type in a finally block.
    - expect: The selector reports the standard type again, the standard grid is active, and its column header list matches the list captured before the switch.

### 10. Paginator Page-Number Input (the tab's only field-level validation surface)

**Seed:** `tests/seed.spec.ts`

#### 10.1. The paginator page box rejects zero, negative, non-numeric and far-out-of-range input

**File:** `tests/local-office/local-office-history.spec.ts`

**Steps:**
  1. Read the page box's native constraint attributes.
    - expect: It is `type="text"` with `inputmode="numeric"` and `pattern="[0-9]*"`, is not required, and declares NO min, max or maxLength - so all range handling is the app's own logic, which the following steps probe.
  2. For each rejected value - "0", "-1", "abc", "99999", and one past the last page - capture the page the grid is currently on, type the value, and press Enter.
    - expect: In every case the box reverts to the page already shown, the paginator still reports that page, and the grid still renders a full page of rows - a rejected value never leaves the grid empty.
    - expect: The revert is asserted against the CAPTURED current page, not against a hardcoded page 1, so the scenario is order-independent and cannot re-confuse revert-to-current with reset-to-page-1.
  3. Type "007" and press Enter.
    - expect: The box settles on page 7 - leading zeros are normalised and the value is honoured - and the grid renders rows.
  4. Type "3" and press Enter.
    - expect: The box settles on page 3 and the grid renders rows - a plain valid page number navigates.
  5. Restore page 1 in a finally block.
    - expect: The paginator reports page 1, leaving the grid as the other scenarios expect it.

#### 10.2. A page number one past the last page reverts to the page already shown

**File:** `tests/local-office/local-office-history.spec.ts`

**Steps:**
  1. Read the paginator's total page count, skipping if the office has only one page.
    - expect: The total is captured (135 for office 1604).
  2. Type the last page number and press Enter.
    - expect: The box settles on the last page, the grid renders at least one row, and "Go to next page" is disabled.
  3. Type one past the last page and press Enter, while still ON the last page.
    - expect: The box reverts to the last page, NOT to page 1, the paginator still reports the last page, rows render, and "Go to next page" remains disabled. This is the step that corrected the rejection model (see overview item 20).
  4. Restore page 1 in a finally block.
    - expect: The grid is back on page 1.

#### 10.3. A decimal page number has its separator stripped and navigates to the concatenated page

**File:** `tests/local-office/local-office-history.spec.ts`

**Steps:**
  1. Confirm the office has enough pages to reach the concatenated page, skipping otherwise.
    - expect: The page count is sufficient to observe the behaviour.
  2. Type "2.5" into the page box and press Enter.
    - expect: DEFECT - the box settles on page 25, not page 2 and not a rejection. The decimal separator is stripped by the numeric pattern and the remaining digits are concatenated, so a user aiming at page 2 silently lands on page 25. The assertion pins the CURRENT behaviour deliberately, so a fix flips this red on purpose and the expectation is updated rather than the case deleted.
  3. Verify the mis-navigation still leaves a usable grid.
    - expect: Rows render and the full 42-column header set is unchanged.
  4. Attach the defect detail to the report, then restore page 1 in a finally block.
    - expect: The report records the typed value and the resulting page; the grid is back on page 1.

### 11. Sortability & Page-Size Contract

**Seed:** `tests/seed.spec.ts`

#### 11.1. Exactly the four structural columns are non-sortable and every other column sorts

**File:** `tests/local-office/local-office-history.spec.ts`

**Steps:**
  1. Read the set of columns carrying NO sort control.
    - expect: It is exactly "Local Office", "Section Name", "Service Type - Exempt" and "Notes". Asserting the exact SET, rather than scenario 4.1's count bound, is what catches a column silently losing its sort control.
  2. Read the set of columns that DO carry a sort control.
    - expect: It holds 38 columns - 42 total minus the 4 structural exceptions - and no column appears in both sets.
  3. Sort one of the sortable columns ascending.
    - expect: The column indicates an ascending sort and the grid still renders rows, proving the control is functional rather than merely present.

#### 11.2. The rows-per-page control offers the confirmed options and changing it changes the rendered row count

**File:** `tests/local-office/local-office-history.spec.ts`

**Steps:**
  1. Read the rows-per-page control's current value and option list.
    - expect: It defaults to "20" and offers exactly 10, 20, 30, 40 and 50.
  2. Compare the default page size with the rendered row count.
    - expect: The grid renders exactly 20 data rows, so the control's value and the rendered page agree.
  3. Select the smallest option (10) and re-read the grid.
    - expect: The control reports 10, the grid renders exactly 10 rows, and the 42-column header set is unchanged.
  4. Restore the original page size and return to the first page in a finally block.
    - expect: The control reports its original value again.

### 12. Composite (Folded) Cells

**Seed:** `tests/seed.spec.ts`

#### 12.1. Composite Section Name and Service Type cells render pipe-delimited name and flag pairs

**File:** `tests/local-office/local-office-history.spec.ts`

**Steps:**
  1. Confirm the grid has at least one data row, skipping otherwise.
    - expect: A data row is available to inspect.
  2. Parse the "Section Name" cell into its pipe-delimited pairs.
    - expect: The cell yields more than one "Name - flag" pair, every name is non-empty, and every flag is exactly "true" or "false". This column folds NM-854's SectionName AND SectionIsActive, so the pair structure IS the contract for SectionIsActive, which has no column of its own.
  3. Parse the "Service Type - Exempt" cell on the same rules.
    - expect: Well-formed pairs again. This column folds ServiceTypeName AND STExempt, so the pair structure is the contract for both.
  4. Attach both raw composite values and their pair counts to the report.
    - expect: The report records the real folded content and its length for future comparison.

#### 12.2. Long composite cells do not break row alignment or push the page into horizontal scroll

**File:** `tests/local-office/local-office-history.spec.ts`

**Steps:**
  1. Confirm the grid has at least one data row, skipping otherwise.
    - expect: A data row is available to measure.
  2. Measure the character length of both composite cells.
    - expect: Each exceeds 100 characters (~244 and ~257 live), confirming the scenario genuinely exercises long content rather than passing on short data. Unlike 5.4, which injects a synthetic 2,000-character Notes value, this uses the REAL folded data.
  3. Read the cell count of every rendered row.
    - expect: Every row still has exactly 42 cells, so the long composite content shifts no row.
  4. Measure the document and grid-container horizontal overflow.
    - expect: The page body does not scroll horizontally (within a 1px rounding allowance) and the grid container absorbs the extra width.
