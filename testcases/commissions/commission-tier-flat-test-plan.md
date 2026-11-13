# NM-3350 — Commission Tier/Flat: Playwright test plan

| Item | Value |
|---|---|
| Ticket | NM-3350 (parent NM-3347, epic NM-3489); features NM-2083, NM-1635, NM-2168, NM-3728 |
| Page | Navigator → Setup → Commissions → Tier/Flat — `/navigator/locations/{office}/commissions/tiers` (tabs Basic Information, Commission Tier/Flat History) |
| Environment | e2e (`cloudapps-e2e.encoreglobal.com`); edit office **1101** (corporate — the only editable office), 1606 (local, read-only), 2322 (Canada), 7147 (Mexico) |
| Spec | [`commission-tier-flat.spec.ts`](../../tests/commissions/commission-tier-flat.spec.ts) — 101 cases `TC-COM-TF-001…101` in sections A–P (Basic Information A–L and P, History M–O), written in the style of `tests/taxes/order-origin-tax.spec.ts` |
| Page object | [`src/pages/commissions/commission-tier-flat.page.ts`](../../src/pages/commissions/commission-tier-flat.page.ts) |
| Selectors / data | [`src/selectors/commissions/commission-tier-flat.ts`](../../src/selectors/commissions/commission-tier-flat.ts), [`src/data/commissions/commission-tier-flat.ts`](../../src/data/commissions/commission-tier-flat.ts) |
| Test cases | [`commission-tier-flat.xlsx`](commission-tier-flat.xlsx) → [`testcases-testrail-import/commissions/commission-tier-flat.csv`](../../testcases-testrail-import/commissions/commission-tier-flat.csv) |
| ID grammar | `TC-COM-TF-NNN` — module `COM`, submodule `TF` registered in `export_test_cases/module-codes.json`; one spec, one workbook, one ID sequence per screen (as for the tax screens) |
| Status | Run on e2e 2026-11-12, read-only and with writes: every case passes or fails as marked; 4 open defects, 10 dropped on review (§8). |

## 1. Scope and approach

Both sub-modules, one after the other, as NM-3350 directs:

1. **Basic Information**: search criteria, the editable Tier/Flat grid, **field-level validation of every editable
   cell**, immediate validation, overlap and gap rules, dirty state and toolbar gating, the unsaved-changes guard, Save,
   Export, Import, both Copy panels and the Reset Dates modal.
2. **Commission Tier/Flat History**: the read-only audit grid, the content of each audited field, the Action of each kind
   of change, paging and the page-number box, sorting, export, other countries.

**Main focus: field-level validation.** Section D holds 12 field-validation cases covering 47 typed values: per field one
case for the accepted values, one for the refused values and one for free-form input (empty, letters, symbols,
separators, markup). Each case loops over its data table with soft checks, as `order-origin-tax.spec.ts` does, so
every value still shows as its own step in the report. Every refused value is checked twice:

- **while the cursor is still in the cell.** This is NM-3673: validation must fire on input, not on blur.
- **after leaving the cell.** The value must stay flagged or be refused. It must never be kept silently as valid.

**Isolation from live data.** Validation cases add a row on a **service type that has no tiers yet**
(`addRowOnFreeServiceType`), so a band someone else saved can never make an overlap appear or disappear. These rows are
never saved. Each test opens the page fresh, which drops them.

**Write policy.** E2E allows set-up, editing and clean-up (directive 5). Cases that store data:

- use the marker upper boundary **99,999,901** (`AUTO_UPPER`);
- remove their bands in `finally`;
- are swept again by `purgeLeftovers()` in `beforeAll`, in case a previous run aborted.

`TF_WRITES=off` turns all 15 writing cases (marked **W** below) into skips, so the suite can also run read-only. The
dirty-state cases normally edit an existing row without saving. Only when the office has no tiers do they first save
one marker band.

**Save checks stay at the network.** The payload check (061), the failure check (062) and the double-submit check (063)
catch the save request in the browser (`holdRequests('abort' | 'fail')`), so nothing is stored. The page's calls are
Next.js server actions posted to the page URL. The REST endpoints in requirements §3 are behind them and are not visible
from the browser, so requests are told apart by when they are sent, not by their address.

## 2. Test architecture

| Element | What it does |
|---|---|
| `authenticatedSession` fixture ([pages.fixture.ts](../../src/fixtures/pages.fixture.ts)) | One signed-in context per worker (shared `storageState`, SSO refresh behind a file lock); trace chunk, failure screenshot and diagnostics per test |
| `CommissionTierFlatPage` (POM) | Every selector and action of both tabs, the Copy panels and the Reset Dates modal; methods are `@step`-decorated so each call is a named report step |
| `about` / `phase` / `verify` ([report-steps.ts](../../src/fixtures/report-steps.ts)) | Plain-language summary as Step 1, grouped actions, boxed assertions — **"Step N:" numbering** in the HTML report; `attachNote` attaches observed values |
| Data module | Offices (env-overridable, `TF_FOREIGN_OFFICES` + `officeLabel` for office loops), column lists, Add Row defaults, **field-input tables** `LOWER_INPUT`, `UPPER_INPUT`, `COMM_INPUT`, `RATE_EDGES` (`{ typed, kept, why }`), `OVERLAPPING` / `SEPARATE` band pairs, `BAD_UPLOADS`, `PAGE_BOX_INPUT`; no TC ids — ids live only in the spec |
| Page-object checks | `typeRejected` (flagged while typing, Save state, kept after leaving), `typeFreeForm` (flagged or a plain number, script ran), `changeRate`, `savedBand`, `addTwoBands` — the spec only loops and asserts |
| Test-data factory | `addRowOnFreeServiceType({ pick, skip, exclude })` — Basic picks free types from the start of the list, History from the end, so parallel workers never share one |
| Cleanup | `AUTO_UPPER` marker + `purgeLeftovers()` (beforeAll and every writing case's `finally`) |
| Network helpers | `holdRequests('abort' \| 'fail' \| 'delay')`, `countPosts()` — no fixed waits anywhere; every wait is on a UI state, a request or a download event |
| Files | `exportGrid()` saves the download and parses it with `xlsx`; `importFile()` handles a file chooser or file input, a browser `alert`, and counts uploads; `CommissionTierFlatPage.workbook()` builds an .xlsx in memory (no binary fixtures) |
| Accessibility | `@axe-core/playwright` WCAG 2.1 AA, same exclusions as the tax pages (select triggers, tab strip) |
| Sequential numbering | IDs ascend in file order with no gaps (verified: TF 001–101); a loop over offices shares one id (Vikas's convention), any other loop names an id per entry |
| TestRail mapping | The reporter resolves each result by TC id through `config/testrail/case-map.json`; workbooks → CSV via `scripts/convert-testcases-to-testrail.py` (section `Commissions > Tier_Flat`); `npm run testrail:sync:execute -- --only commissions/commission-tier-flat` imports and writes the case ids back |

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `TF_LOCAL_OFFICE` | 1606 | Edit office (read-only Local Office) |
| `TF_CORPORATE_OFFICE` | 1101 | Location picker, History paging |
| `TF_CANADA_OFFICE` / `TF_MEXICO_OFFICE` | 2322 / 7147 | NM-3599; Mexico CPT = NA |
| `TF_HISTORY_OFFICE` | 1101 | Office with several History pages |
| `TF_BUSINESS_TYPE` | Audio Visual | Default Business Type |
| `TF_WRITES` | on | `off` skips every case that stores data |

## 3. Test cases (`TC-COM-TF-001…101`)

P = priority (C Critical, H High, M Medium, L Low). **W** = writes E2E data (skipped with `TF_WRITES=off`). Section D cases each loop over a data table (`LOWER_INPUT`, `UPPER_INPUT`, `COMM_INPUT`, `RATE_EDGES`) with soft checks, so every value is reported inside the case — see the table below.

### A. Page load
| ID | Scenario | P | Trace |
|---|---|---|---|
| 001 | Without a session the page sends the user to sign in | C | — |
| 002 | Commission Tier/Flat opens on Basic Information | M | — |
| 003 | A local office shows its Local Office as read-only text | M | TC-TF-02 |
| 004 | The corporate office offers a Location picker | M | TC-TF-01 |
| 005 | A local office lists its tiers read-only | M | — |
| 006 | The Product Code banner shows when the office has product-code commissions | H | NM-3384, TC-TF-05 |
| 007 | Currency lists the office currencies and starts on one of them | M | TC-TF-04 |
| 008 | Business Type lists each business type once | H | NM-1635 |
| 009 | Before a search the grid is empty and Save is off | H | — |

### B. Search
| ID | Scenario | P | Trace |
|---|---|---|---|
| 010 | A search starts clean: no errors, Save off, actions on | H | NM-3554, TC-TF-06 |
| 011 | The grid shows every required column, and Grid Options lists them | H | NM-3621 |
| 012 | Comm % sits in the same place on both tabs | M | — |
| 013 | A search lists only service types of the chosen Business Type | H | NM-1635 |
| 014 | Reset restores the default criteria and clears the grid | M | — |
| 015 | The search criteria panel collapses and expands | M | — |
| 016 | A failed search says so and a retry works | M | — |
| 017 | Loading placeholders show while a slow search runs | M | — |
| 018 | The search panel works from the keyboard | L | — |

### C. Add Row and row controls
| ID | Scenario | P | Trace |
|---|---|---|---|
| 019 | Add Row adds a row with the documented defaults and marks the page changed | M | TC-TF-14 |
| 020 | A new row without a Service Type cannot be saved | H | — |
| 021 | The row Service Type list is clean | H | NM-1635 |
| 022 | Currency, Modified By and Modified On cannot be edited | H | — |
| 023 **W** | Currency cannot silently wipe an edit in progress | H | NM-3648 |
| 024 | Is SC Comm Calculated On Net? flips with the Space key | L | — |
| 025 | Two added rows are independent | M | — |
| 026 | Changing the Service Type of a new row keeps its values | M | — |
| 027 | Deleting a new row leaves nothing to save | H | TC-TF-15 |
| 028 **W** | Deleting a saved row hides it, marks the page changed and stores nothing | H | NM-3678, TC-TF-15 |

### D. Field validation
| ID | Scenario | P | Trace |
|---|---|---|---|
| 029 | Lower Tier Boundary accepts 0 up to the Upper Tier Boundary | H | — |
| 030 | Lower Tier Boundary refuses negatives and values above Upper | H | NM-3673, TC-TF-07/10 |
| 031 | Lower Tier Boundary never keeps non-numeric input or markup | H | — |
| 032 | Upper Tier Boundary accepts the Lower Tier Boundary and above | H | — |
| 033 | Upper Tier Boundary refuses negatives and values below Lower | H | NM-3673, TC-TF-08/10 |
| 034 | Upper Tier Boundary never keeps non-numeric input | H | — |
| 035 | Comm % accepts 0 to 100 | H | NM-3241, TC-TF-09 |
| 036 | Comm % refuses values outside 0 to 100 while typing | H | NM-3241, TC-TF-09 |
| 037 | Comm % never keeps non-numeric or malformed input | H | — |
| 038 | SC Comm % accepts 100 and refuses values outside 0 to 100 | H | NM-3241 |
| 039 | ETS Comm % accepts 100 and refuses values outside 0 to 100 | H | NM-3241 |
| 040 | A boundary pair out of order shows its message and clears once corrected | H | NM-3673 |

Values per field (from the data module):

| Field | Accepted (kept as) | Refused while typing | Free-form (flagged or a plain number) |
|---|---|---|---|
| Lower Tier Boundary (Upper = 100,000,000) | `0`, `1`, `99999999`, `100000000`, `0007` → 7 | `100000001`, `-1`, `-0.01`, 50 digits | empty, `abc`, `!@#$`, `1500.75`, `1e3`, `1,000`, markup |
| Upper Tier Boundary (Lower = 1,000) | `1001`, `1000`, `100000000` | `999`, `0`, `100000001`, `-1`, 50 digits | empty, `xyz`, `  2000  ` |
| Comm % | `0`, `0.01`, `50`, `99.99`, `100` | `100.01`, `101`, `-0.01`, `-5` | empty, `abc`, `1.2.3`, `12.345`, `25%` |
| SC Comm %, ETS Comm % | `100` | `100.01`, `-0.01` | — (same editor as Comm %) |

### E. Overlap and gaps
| ID | Scenario | P | Trace |
|---|---|---|---|
| 041 | Overlapping bands of one service type are both flagged | H | TC-TF-11 |
| 042 | Adjacent bands and bands with a gap are accepted | M | TC-TF-13 |
| 043 | The same band on two service types is accepted | M | — |
| 044 | Fixing an overlap clears the marker on both rows | M | TC-TF-12 |
| 045 | Deleting one of two overlapping rows clears the other | M | TC-TF-15 |
| 046 | Moving an overlapping row to another service type clears the overlap | M | — |
| 047 **W** | A new band overlapping a saved band is flagged | H | TC-TF-11 |
| 048 | Save stays off while a row is invalid, and clicking it sends nothing | H | — |

### F. Unsaved changes
| ID | Scenario | P | Trace |
|---|---|---|---|
| 049 | An unsaved edit turns Save on and Export, Import, Copy and Reset Dates off | H | NM-3678, TC-TF-16 |
| 050 | Switching tab with an unsaved edit asks first, and Stay keeps the edit | H | NM-3606, NM-3679, TC-TF-18/19 |
| 051 | Discard drops the unsaved edit and opens the other tab | H | TC-TF-20 |
| 052 | Escape on the dialog keeps the edit | H | — |
| 053 | Changing Currency with an unsaved edit asks first, and Discard then searches properly | H | NM-3689, TC-TF-21 |
| 054 | Changing Business Type with an unsaved edit asks first, and Discard then searches properly | H | NM-3689, TC-TF-21 |
| 055 | Searching again with an unsaved edit asks first | H | — |
| 056 | Reset with an unsaved edit asks first, with the same dialog as a tab switch | H | NM-3679 |
| 057 | Reloading with an unsaved edit raises the browser prompt | H | — |
| 058 | Changing the Location with an unsaved edit asks first | H | NM-3689 |

### G. Reverting edits
| ID | Scenario | P | Trace |
|---|---|---|---|
| 059 | Typing a rate back leaves nothing to save | H | NM-3429, TC-TF-17 |
| 060 | Typing a boundary back leaves nothing to save | H | NM-3429 |
| 061 | Ticking Profit Only and unticking it leaves nothing to save | H | NM-3429 |
| 062 | Retyping the stored value is not a change | H | — |

### H. Save
| ID | Scenario | P | Trace |
|---|---|---|---|
| 063 **W** | Save sends only the edited and the new rows | H | TC-TF-22 |
| 064 | A failed save keeps the changes and says so | H | — |
| 065 | Double-clicking Save sends one request | H | — |
| 066 **W** | A new band is saved, the page resets, and Copy opens without a warning | H | NM-3428, TC-TF-23 |
| 067 **W** | An edit to a saved band is stored | H | — |
| 068 **W** | Deleting a saved band and saving removes it | H | — |
| 069 **W** | Save cannot be pressed again while a save is in progress | H | — |

### I. Export and import
| ID | Scenario | P | Trace |
|---|---|---|---|
| 070 | Export downloads TierFlatCommissions-<office>.xlsx with its column headers | H | NM-3677, TC-TF-24 |
| 071 | The export lists every row with Modified On in UTC | H | NM-4195, TC-TF-25 |
| 072 | Import refuses every file that is not Excel | M | TC-TF-26 |
| 073 **W** | Importing the file just exported succeeds without a duplicate error | H | NM-3425 |
| 074 **W** | An Excel file with invalid values is refused and stores nothing | H | — |

### J. Copy
| ID | Scenario | P | Trace |
|---|---|---|---|
| 075 **W** | Copy Within Location offers only service types of the same Business Type | H | NM-3728, TC-TF-27 |
| 076 | Copy Within Location ticks are cleared after closing | H | NM-3687, TC-TF-30 |
| 077 | Copy to Locations ticks are cleared after closing | H | NM-3687, TC-TF-30 |
| 078 **W** | After Copy Within Location the source stays, Search works and the ticks are cleared | H | NM-3686, NM-3687, TC-TF-29 |

### K. Reset Dates
| ID | Scenario | P | Trace |
|---|---|---|---|
| 079 | Reset Dates opens with January–June and July–December columns | H | NM-2168 |
| 080 | Every month offers blank and each day of that month | H | NM-3510, TC-TF-35 |
| 081 | Cancel closes Reset Dates at once and keeps nothing | M | — |
| 082 **W** | Saving a reset day succeeds and keeps the modal open | H | NM-3633 |
| 083 | Reset Dates shows the Current Period Total line | H | NM-2168 |

### L. Accessibility and security
| ID | Scenario | P | Trace |
|---|---|---|---|
| 084 | Automated WCAG 2.1 AA scan finds no serious or critical violations | L | — |
| 085 | The page stays usable at 1024×768 | L | — |
| 086 | No untranslated text key is visible | L | — |

### M. History
| ID | Scenario | P | Trace |
|---|---|---|---|
| 087 | History opens with its columns, read-only and with no editing actions | H | NM-3573, NM-3574 |
| 088 | An office with no history shows "No results" on a single page | M | — |
| 089 | Every entry is complete and valid | H | NM-3573, NM-3574, NM-4216, NM-4692, TC-TF-31 |
| 090 | Rows per page starts on 10 and the paging buttons stop at the ends | H | NM-3628 |
| 091 | Changing rows per page on page 2 keeps the page number true to the rows shown | H | NM-3619, TC-TF-33 |
| 092 | The page-number box goes to a typed page and refuses pages that do not exist | M | — |
| 093 | Going back to Basic Information starts on page 1 | H | NM-3660, TC-TF-34 |
| 094 | Action sorts both ways, and Grid Options lists every column | M | — |
| 095 | History export downloads TierFlatCommAudit-<office>.xlsx with every entry | H | NM-3677, TC-TF-33 |

### N. History of changes
| ID | Scenario | P | Trace |
|---|---|---|---|
| 096 **W** | Adding, changing and deleting a band records Add, Modify and Remove | H | NM-3573, NM-4692 |
| 097 **W** | Copying over a band records Remove for the old one, with its Currency | H | NM-4692, TC-TF-32 |

### O. Other countries
| ID | Scenario | P | Trace |
|---|---|---|---|
| 098 | Basic Information and History load without an error | H | NM-3599 |

### P. Grid view and links
| ID | Scenario | P | Trace |
|---|---|---|---|
| 099 | Basic Information sorts by Service Type both ways and by Lower Tier Boundary as a number | M | — |
| 100 | A hidden column stays hidden until Reset to Default View brings every column back | M | — |
| 101 | The Product Code Commissions link opens the office's Product Code Commission page | H | NM-3384 |

## 4. History

History is covered in sections M–O above (read-only grid, field content, paging, export, the Action of each change, other countries).

## 5. Regression anchors → tests

| Defect | Tests |
|---|---|
| NM-1635 | 008, 013, 021 |
| NM-2168 | 079, 083 |
| NM-3241 | 035, 036, 038, 039 |
| NM-3384 | 006, 101 |
| NM-3425 | 073 |
| NM-3428 | 066 |
| NM-3429 | 059, 060, 061 |
| NM-3510 | 080 |
| NM-3554 | 010 |
| NM-3573 | 087, 089, 096 |
| NM-3574 | 087, 089 |
| NM-3599 | 098 |
| NM-3606 | 050 |
| NM-3619 | 091 |
| NM-3621 | 011 |
| NM-3628 | 090 |
| NM-3633 | 082 |
| NM-3648 | 023 |
| NM-3660 | 093 |
| NM-3673 | 030, 033, 040 |
| NM-3677 | 070, 095 |
| NM-3678 | 028, 049 |
| NM-3679 | 050, 056 |
| NM-3686 | 078 |
| NM-3687 | 076, 077, 078 |
| NM-3689 | 053, 054, 058 |
| NM-3728 | 075 |
| NM-4195 | 071 |
| NM-4216 | 089 |
| NM-4692 | 089, 096, 097 |

Requirements matrix TC-TF-01…35 → 01 004 · 02 003 · 03 *see §7* · 04 007 · 05 006 · 06 010 · 07 030 · 08 033 · 09 035, 036 · 10 030, 033 · 11 041, 047 · 12 044 · 13 042 · 14 019 · 15 027, 028, 045 · 16 049 · 17 059 · 18 050 · 19 050 · 20 051 · 21 053, 054 · 22 063 · 23 066 · 24 070 · 25 071 · 26 072 · 27 075 · 28 *see §7* · 29 078 · 30 076, 077 · 31 089 · 32 097 · 33 091, 095 · 34 093 · 35 080

## 6. Non-functional coverage

| Aspect | Coverage |
|---|---|
| Responsive | 1024×768, the narrowest supported window (085); grid may scroll internally, the page must not |
| Cross-browser | Chromium only — the framework configures no Firefox/WebKit project. The specs are browser-agnostic; add projects in `playwright.config.ts` to extend |
| Accessibility | axe WCAG 2.1 AA on grid, Reset Dates modal and History; keyboard order and Space toggle |
| Performance / loading | Placeholders while a held search runs; progress while a held save runs; search and save retry after a 500 |
| Security | Unauthenticated redirect; permission guard; markup in a numeric cell never kept or executed; invalid upload never sent |
| Data persistence | Save, edit, delete, import and reset dates verified by a fresh search / reopen; all marker data removed |

## 7. Not automated (and why)

| Item | Reason | What is needed |
|---|---|---|
| TC-TF-03 Restricted user is turned away (NM-3907) | Dropped on review 2026-11-13: no low-privilege test account on e2e | — |
| TC-TF-28 Copy to Locations conflicts (NM-3685) | Dropped on review 2026-11-13: the copy overwrites the destination office and no sandbox office is available | — |
| CPT request skipped for Mexico | Calls are server actions — the CPT call cannot be told apart in the browser | Server-side log, or a `data-testid` on the CPT value |
| Firefox / WebKit | Not configured in the framework | Projects in `playwright.config.ts` |

## 8. Live behaviour and defects (e2e, 2026-11-12)

Verified against the live page (user `s-prd-clickauto`) with read-only DOM probes and a full run with `TF_WRITES=off`:
every case passes or fails exactly as marked (house convention: a `test.fail` turns red once its bug is fixed, so
the marker is removed then). The 12 writing cases were not run.

**Live design the suite follows** (differs from the requirements document):

| Requirement / assumption | Live |
|---|---|
| Edit on any office | Only the corporate office **1101** offers the toolbar, row editors and Delete; local offices (1606) are read-only. Every editing case runs on 1101 |
| Search / Reset `data-testid` | None — plain Search / Reset buttons; criteria ids `#commission-tiers-currency`, `#commission-tiers-business-type` |
| Right-click → Delete | A Delete button per row (`commission-tier-delete-<key>`) |
| Cell ids | `commission-tier-<field>-<record id \| new-N>`; a number cell opens `<input type=number>` (`…-input`) on click |
| Columns | Basic Information starts with **Business Type**; both grids page 10 rows at a time |
| History action "Update" | **Modify** |
| Office loads instantly | The Local Office name loads after the Search button enables ("All - Locations" until then) — `waitForReady` waits for it |
| Product Code banner | Shown after a search (`role="alert"`) |
| Canada 2322 | Loads; no business type configured, so History shows "Select a business type to view commission tier history." |

**Defects** (records in `reports/bugs/`; tests run under `test.fail(true, 'BUG-…')`):

| Bug | Severity | Defect | Tests |
|---|---|---|---|
| BUG-COM-TF-007 | **High** | Reset Dates months offer only blank and "1" (**NM-3510 regression**) | 080 |
| BUG-COM-TF-011 | **High** | A saved reset day is not stored: reopening shows it blank, Reset Date History stays empty (NM-3633) | 082 |
| BUG-COM-TF-012 | Medium | Band overwritten by a copy shows a blank Currency in History (**NM-4692 regression**) | 097 |
| BUG-COM-TF-014 | **High** | Re-importing an export fails: "An item with the same key has already been added. Key: 1101" (**NM-3425 regression**) | 073 |

### Dropped on review (2026-11-12/13)

The behaviour is accepted; the records were removed and the tests now assert it.

| Bug | Why dropped | Test now asserts |
|---|---|---|
| BUG-COM-TF-001 Currency dropdown shown for a single currency | Accepted as intended | 007: the dropdown lists the office currencies, no blank, default among them |
| BUG-COM-TF-002 Service Type "130" on a saved row | No longer reproducible — the row now reads "xAdministrative Fee" | 013: listed service types belong to the Business Type (unchanged) |
| BUG-COM-TF-003 Lower > Upper not flagged | **Reported in error** — the row is flagged at once: the value turns red, a warning icon appears and its tooltip reads "Lower tier must be less than or equal to upper tier."; the suite only looked for `aria-invalid` | 030, 033, 040: flagged while typing (`isRowFlagged` now reads the red value and warning icon) |
| BUG-COM-TF-004 Comm % below 1 read as a fraction | Accepted rate entry rule | 035: 0.01 is kept as 1 % |
| BUG-COM-TF-005 Export headers differ from the grid | Accepted export names | 070, 095: the live export header rows (`EXPORT_HEADERS`, `AUDIT_HEADERS`) |
| BUG-COM-TF-008 CPT reads "TODO" | Accepted — CPT not built yet | 083: the CPT line is present; 086 no longer treats "TODO" as a raw key |
| BUG-COM-TF-009 Grid checkboxes have no accessible name | Accepted, like the select triggers | 084: axe scan excludes the grid checkboxes |
| BUG-COM-TF-010 Mexico 7147 page fails | Out of scope for this user / office | 098 runs for Canada only |
| BUG-COM-TF-006 Export Modified On is UTC | Intended — the export carries UTC (review 2026-11-13) | 071: the export's Modified On is the grid time in UTC |
| BUG-COM-TF-013 No Copy entry in History for a copied band | Accepted — a copy is recorded only by the Remove of the replaced band (review 2026-11-13) | 097: checks the Remove entry only |

Writing cases: run with writes on (2026-11-12); Save, edit, delete, copy and History Add/Modify/Remove work. Their
failures were script timing (save toast before the grid reset, import read mid-upload, Copy list rendered in view only)
— fixed — plus the defects 011–014. Every marker band was removed afterwards. History paging cases still skip:
1101 needs more History entries than one page.

## 9. Running and TestRail

```bash
npx playwright test tests/commissions --project=chromium                       # whole suite, both tabs
npx playwright test tests/commissions --project=chromium -g "D. Field validation"                  # field-level validation
npx playwright test tests/commissions --project=chromium -g "M. History|N. History of changes"  # History tab only
TF_WRITES=off npx playwright test tests/commissions --project=chromium          # read-only run
npm run report                                                                   # HTML report, numbered steps

python scripts/convert-testcases-to-testrail.py --only commission-tier-flat      # workbooks → CSV
npm run testrail:sync -- --only commissions/commission-tier-flat                 # dry run
npm run testrail:sync:execute -- --only commissions/commission-tier-flat         # import; writes case-map.json
```

After the import, results map by TC id through `config/testrail/case-map.json` (no spec edit needed); push them with
`TESTRAIL_ENABLED=true`.
