# NM-4021 — Sales Tax: Playwright test plan

| Item | Value |
|---|---|
| Ticket | NM-4021 (epic NM-3489, domain epic NM-889) |
| Page | Navigator → Tax → Sales Tax — `/navigator/locations/{office}/taxes/sales-tax` |
| Environment | e2e (`cloudapps-e2e.encoreglobal.com`), office 1101, automation user `s-prd-clickauto` (ManageTaxes.FullAccess) |
| Spec | [`tests/taxes/sales-tax.spec.ts`](../../tests/taxes/sales-tax.spec.ts) — 70 tests, `TC-TAX-ST-001` … `070` |
| Page object | [`src/pages/taxes/sales-tax.page.ts`](../../src/pages/taxes/sales-tax.page.ts) |
| Selectors / data | [`src/selectors/taxes/sales-tax.ts`](../../src/selectors/taxes/sales-tax.ts), [`src/data/taxes/sales-tax.ts`](../../src/data/taxes/sales-tax.ts) |
| Test cases | [`sales-tax.xlsx`](sales-tax.xlsx) → [`testcases-testrail-import/taxes/sales-tax.csv`](../../testcases-testrail-import/taxes/sales-tax.csv) |
| Bugs | `reports/bugs/BUG-TAX-ST-001`, `002`, `003`, `006`; exploratory crawl in `reports/bugs/crawler/sales-tax/` |
| Live audit | 2026-11-04 |

## 1. Scope and approach

The suite covers both tabs (Basic Information, Sales Tax History), the Zip Code override rule, cascading
State → County → City lookups, as-of and date-range search, grid mapping and sorting, flat-file import,
session, input safety, accessibility and layout.

**Write policy — nothing is written.** Sales tax versions are insert-only and drive live tax calculation;
there is no UI to remove a version, so imported data could never be cleaned up. Therefore:

* A valid file is only ever sent to an import call answered at the network (`interceptImport`).
* The one file sent to the real import holds a header line plus rows with non-numeric rates for zip `00000`
  (no jurisdiction) — nothing in it can be stored even if validation were broken.
* As-of and range boundaries are derived from whatever history the environment holds (zip 90210 today has
  versions effective 2017-10-01 and 2025-04-01), never from fixed dates.

**Live behaviour that differs from the requirements document** (tests assert the live design):

| Document | Live (e2e 2026-11-04) |
|---|---|
| State starts empty; County disabled until a State is chosen | State is pre-selected (AK, no blank option); County is usable at once with "All" |
| Tab named "History" | "Sales Tax History"; Date Range is a two-month calendar popover |
| Import opens a modal | Import opens the OS file picker directly (`accept=".txt"`); rejected rows open an "Import Failed" panel |
| — | Grid is paginated (50 rows per page, server-side paging and sorting) |
| §8 Export on both tabs (NM-3989) | No Export — by design (confirmed 2026-11-04); TC-ST-31…33 not applicable |
| §4.2 Import column in History (NM-3984) | Modified By / Modified On instead — by design (confirmed 2026-11-04) |
| — | The page restores the last searched criteria (sessionStorage) and grid layout (localStorage) on load |
| §7.2 has no header line | The server skips line 1 of an import as a header (open question for product) |

## 2. Test architecture

| Element | What it does |
|---|---|
| `authenticatedSession` fixture | One signed-in context per worker (shared `storageState`, SSO refresh with file lock); diagnostics, trace chunks and failure screenshots per test |
| `SalesTaxPage` (POM) | All selectors and actions; `@step` decorated so every call is a numbered report step |
| `about` / `phase` / `verify` | Plain-language summary as Step 1, grouped actions, boxed assertions — numbered "Step N:" in the HTML report |
| `open()` | Clears the page's persisted criteria/layout, reloads, waits for State to be usable — every test starts from a true first load |
| Server-action capture | All calls are Next.js server actions to the page URL; requests are classified by payload (`pageSize` → search, `{stateId}` → counties, `{countyId}` → cities, multipart → import). Bodies are read inside `route.fetch` (Chromium drops the first action body) |
| `runSearch` | Waits until the grid has drawn exactly the number of rows the answer carried — no fixed waits |
| `mockSearch`, `interceptImport` | Delay / 500 / abort / mocked success, all removed in `afterEach` |
| `replayWithoutSession` | Re-sends a captured action with no cookies (authorization check) |
| `flatFile()` / `flatFileRow()` | Build the 181-char fixed-width rows of §7.2 (header line first) |
| `test.fail('BUG-…')` | Asserts the documented behaviour against a known defect; turns red when fixed so the marker is removed |
| TestRail | Titles match the workbook/CSV; after import add `@C<id>` tags and `config/testrail/case-map.json` entries (section 6) |

Config: `ST_OFFICE`, `ST_ZIP`, `ST_MULTI_CITY_*`, `ST_BUSINESS_TIMEZONE` env overrides; base URL and credentials from `.env.local` / `.env.e2e`.

## 3. Test cases

Priority: C = Critical, H = High, M = Medium, L = Low. "Bug" = runs under `test.fail` with the bug id.

### A. Navigation and page layout
| ID | Scenario | P | Doc trace |
|---|---|---|---|
| 001 | Tax menu entry opens the Sales Tax page | H | TC-ST-01 |
| 002 | Basic Information active, Sales Tax History offered | M | TC-ST-01/02 |
| 003 | Search panel controls present | H | §6.1 |
| 004 | Effective Date defaults to business today (America/New_York) | M | §6.1 |
| 005 | Before a search: header, 0 records, prompt | M | §3 |
| 006 | Loading feedback while a held search is pending, cleared after | M | §3 |
| 007 | Open + first search within 30 s | M | performance |
| 008 | Tab round trip keeps searched criteria and rows | M | §3 |

### B. Zip Code override rule
| ID | Scenario | P | Doc trace |
|---|---|---|---|
| 009 | Typing a zip clears and disables State/County/City; date stays usable | C | TC-ST-06 |
| 010 | Clearing the zip re-enables State/County; City waits for County | H | TC-ST-07 |
| 011 | Zip typed after a full location clears and locks it | C | TC-ST-08 |
| 012 | Zip search sends only zip + date | H | §9.1 |
| 013 | Repeated zip search returns the same record — **Bug ST-003** | H | §6.2 |
| 014 | Zip accepts ≤ 5 digits only — **Bug ST-006** | M | §6.1 boundary |

### C. Cascading dropdowns and validation
| ID | Scenario | P | Doc trace |
|---|---|---|---|
| 015 | Initial state of State / County / City | H | TC-ST-09 |
| 016 | State → county lookup; options mirror the answer | H | TC-ST-10 |
| 017 | County → all its cities (AK / MATANUSKA-SUSITNA) | H | TC-ST-11, NM-3996 |
| 018 | New State resets County and City — **Bug ST-002** | H | TC-ST-12 |
| 019 | Blank Effective Date blocks search | H | TC-ST-13 |
| 020 | Impossible dates (13/45/2026, 02/30/2026, abc) never search | M | boundary |
| 021 | Reset restores first-load defaults and empties grid | M | TC-ST-14 |

### D. Search results and as-of logic
| ID | Scenario | P | Doc trace |
|---|---|---|---|
| 022 | Zip search rows equal the answer | H | TC-ST-15 |
| 023 | State + County + City search sends ids; rows match | H | TC-ST-16 |
| 024 | Counter = server total; Next page requests page 2 with other rows | M | pagination |
| 025 | Day before the current version → earlier version | C | TC-ST-17, NM-4013 |
| 026 | Version effective exactly on the search date is returned | C | boundary |
| 027 | Dates A → B → A restore the original rows | H | NM-4013 |
| 028 | Zip 00000 → clean empty state | M | TC-ST-18 |
| 029 | Search 500 → error, page recovers, retry works | H | TC-ST-34 |

### E. Grid display and sorting
| ID | Scenario | P | Doc trace |
|---|---|---|---|
| 030 | Every cell equals its API field; rates 6 decimals | H | §4.3 |
| 031 | Combined Tax = sum of five tiers (510 AK rows, page 1) | H | §4.1 |
| 032 | Effective Date = stored calendar date — **Bug ST-001** | H | §4.1 |
| 033 | Columns in documented order | H | TC-ST-19 |
| 034 | Grid read-only, no checkboxes | H | TC-ST-20 |
| 035 | Geo Code sorts both ways | M | TC-ST-21, NM-3959 |

### F. Sales Tax History
| ID | Scenario | P | Doc trace |
|---|---|---|---|
| 036 | History criteria; range defaults to today – today | H | §6.3 |
| 037 | Standard columns plus Modified By / Modified On | H | TC-ST-24 |
| 038 | Range search returns only versions inside it, ends included | H | TC-ST-22 |
| 039 | Newest modification first by default | H | TC-ST-23, NM-4011 |
| 040 | Zip override rule on History | M | §6.3 |

### G. Flat file import
| ID | Scenario | P | Doc trace |
|---|---|---|---|
| 041 | Import visible to FullAccess; single-file `.txt` picker | H | TC-ST-04/25 |
| 042 | `.csv`, `.xlsx`, `.pdf` refused before upload | H | TC-ST-26 |
| 043 | Import locked while uploading; one upload sent | M | NM-4254 |
| 044 | Import 500 → "Unable to import data.", no success | H | TC-ST-34 |
| 045 | Fixed-width file sent unchanged; success confirmed (answer mocked) | C | TC-ST-27 |
| 046 | Bad rows rejected: insertedRows 0, row/column/value reported, "Import Failed" panel, nothing stored | C | TC-ST-28, NM-3972 |
| 047 | Import without a session refused (redirect to sign-in), file never validated | C | TC-ST-05 |

### H. Session and input safety
| ID | Scenario | P |
|---|---|---|
| 048 | No session → sign-in with callbackUrl, no grid | C |
| 049 | Script / img-onerror markup in Zip never executes or renders | H |

### I. Accessibility and layout
| ID | Scenario | P |
|---|---|---|
| 050 | Zip, Effective Date and buttons have accessible names (select triggers excluded per the IST decision) | M |
| 051 | Tab order follows the visual order | M |
| 052 | axe WCAG 2.1 AA, both tabs (select triggers and tab strip excluded as accepted shared components) | M |
| 053–054 | Usable at 1366×768 and 1024×768, no sideways scroll | L |
| 055 | No raw i18n keys on either tab | L |

### J. Sales Tax History — search, grid and resilience
| ID | Scenario | P | Doc trace |
|---|---|---|---|
| 056 | State → County → City lookups on History | H | §6.3, NM-3996 |
| 057 | New State resets County and City on History — **Bug ST-002** | H | §6.3 |
| 058 | State + County search over a range: ids and range sent, rows in the county | H | §6.3 |
| 059 | Repeated zip search on History returns the same versions — **Bug ST-003** | H | §6.2 |
| 060 | Reset on History restores defaults and today – today | M | §6.3 |
| 061 | Empty History result → "No sales tax history records found" | M | empty state |
| 062 | History search 500 → error, tab recovers, retry works | H | TC-ST-34 |
| 063 | History cells equal the answer; Modified On in business time zone | H | §4.2, §4.3 |
| 064 | History Effective Date = stored calendar date — **Bug ST-001** | H | §4.2 |
| 065 | History server-side sort kept across pages | M | sort / paging |
| 066 | History grid read-only | H | §4.2 |

### K. Basic Information — grid controls
| ID | Scenario | P | Doc trace |
|---|---|---|---|
| 067 | Effective Date picked from the calendar is used by the search | M | date picker |
| 068 | Rows per page 10 → pageSize 10, 10 rows, same total | L | pager |
| 069 | Grid Options hides a column; Reset to Default View restores all | L | Grid Options |
| 070 | Combined Tax server-side sort, highest first | L | sort |

## 4. Not automated (and why)

| Doc case | Reason | What is needed |
|---|---|---|
| TC-ST-03 Read-only persona | No account with only `ManageTaxes.Read` | A Read-only test user; then assert Import hidden and search/export allowed |
| TC-ST-28 all-or-nothing with a **valid** row | A valid row would be stored for good if atomicity failed | A disposable environment or DB cleanup |
| TC-ST-29 insert-only / chronology | Needs real inserts (and a rejected back-dated one) | Same |
| TC-ST-30 CreateUser / ModUser | Needs a real successful import | Same |
| TC-ST-23 newest **import** on top | Needs an import; the default order itself is covered by 040 | Same |
| Cross-browser (Firefox, WebKit) | The framework configures Chromium only | Add projects to `playwright.config.ts` if required |

## 5. Defects found (2026-11-04)

| Bug | Severity | Summary | Test |
|---|---|---|---|
| BUG-TAX-ST-001 | High | Effective Date shown one day early (UTC midnight in local time) — e.g. 2025-04-01 shows 03/31/2025 | 032, 064 |
| BUG-TAX-ST-002 | High | Changing State keeps the old City; search sends CA with AK county/city ids → 0 rows | 018, 057 |
| BUG-TAX-ST-003 | High | Second zip search sends hidden stateId=59 (AK) → 0 rows | 013, 059 |
| BUG-TAX-ST-006 | Low | Zip accepts letters and > 5 characters | 014 |

Observations (not filed): import skips line 1 as a header (§7.2 silent); a zip typed but not searched is lost
on a tab switch; LOS ANGELES county's city lookup took ~33 s; AK lists both "MATANUSKA SUSITNA" and
"MATANUSKA-SUSITNA", and MATANUSKA-SUSITNA lists WILLOW twice.

### Exploratory crawl (2026-11-04)

`src/crawler` run against the Sales Tax route only (`CRAWLER_INCLUDE=taxes/sales-tax`), Search allowed and
Import/Upload/Save on the never-click list: 1 page, 53 actions, 16 raw findings. Verified by hand:

| Crawler finding | Verdict |
|---|---|
| BUG-LABEL-001 — controls without a label | Zip Code is named only by its placeholder (axe accepts this); filed as BUG-TAX-ST-008, dropped 2026-11-04. State/County/City: shared select, accepted (BUG-TAX-IST-003) |
| BUG-INPUT-001 — page-number box truncates | Real but shared grid component: out-of-range pages (0, 999, "3.5"→35) silently revert; the existing "Page must be between 1 and N" message never shows. Raise against the shared data table |
| BUG-CTRL-001 "Click to restore sidebar" | False positive — sidebar drag rail, acts only when collapsed |
| BUG-CTRL-002 "More information" | False positive — tooltip shows on hover and keyboard focus |
| BUG-CTRL-003…012 "Resize column …" | False positive — handles resize by drag (141 → 225 px). Note: not resizable from the keyboard |
| BUG-LAYOUT-001 "Grid Options" cut off | False positive — intentional `sr-only` label |
| BUG-LAYOUT-002 date input over calendar button | False positive — clicking the icon opens the calendar |

Crawler limits seen here: it cannot open the Radix dropdowns (it targets the hidden native `<select>` mirror),
so cascading State/County/City was not explored by it; those rules are covered by tests 015–018.

### Dropped on review (2026-11-04)

| Bug | Why dropped |
|---|---|
| BUG-TAX-ST-004 No Export button (NM-3989) | By design — no Export on Sales Tax; TC-ST-31…33 not applicable |
| BUG-TAX-ST-005 No Import column in History (NM-3984) | By design — Modified By / Modified On are the audit columns |
| BUG-TAX-ST-007 Tab aria-controls to an unrendered panel | Shared tabs component; excluded from the axe scan like the select triggers |
| BUG-TAX-ST-008 Zip Code labelled only by placeholder | Low impact; axe accepts the placeholder as the accessible name |

## 6. Running and TestRail

```bash
npx playwright test tests/taxes/sales-tax.spec.ts --project=chromium          # whole suite (~14 min)
npx playwright test tests/taxes/sales-tax.spec.ts --project=chromium -g "TC-TAX-ST-046"
npm run report                                                                   # HTML report with numbered steps
```

TestRail: import `testcases-testrail-import/taxes/sales-tax.csv` (section `Sales_Tax`, suite S1620). Then add
the returned ids to `config/testrail/case-map.json` (`"TC-TAX-ST-001": <id>`, …) and the `@C<id>` tag to
each test (and to the loop-built 053/054), as for International Tax Setup. Until then the reporter
matches by title.

## 7. Execution results (e2e, Chromium, retries off)

| Run | Result |
|---|---|
| Final full run, 2026-11-05 (70 tests) | **71 / 71 passed** (incl. setup) in 22.9 min — 63 pass outright, 7 pass as expected failures for the open bugs: 013 and 059 (ST-003), 014 (ST-006), 018 and 057 (ST-002), 032 and 064 (ST-001) |
| Earlier run, 2026-11-04 | One one-off failure: TC-046's follow-up search stalled > 60 s on e2e, then passed 3/3 on repeat. Covered by the configured retries (1 local, 2 CI) |

Root causes fixed during stabilisation: dropdowns render disabled while their lookups load (wait for
enabled, not visible); the page restores the previous test's search from sessionStorage (cleared in
`open()`); the import result panel must be closed before the next action; the History calendar must not
re-click the current range end.

Known limitations: County → City lookups for very large counties take up to ~35 s (90 s budget in the page
object); as-of and range cases depend on zip 90210 keeping at least two versions (they skip, not fail, if
an environment has one).
