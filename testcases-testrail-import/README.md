# TestRail import CSVs — generated, do not hand-edit

Everything in this folder (except this README) is **generated** from the
per-module workbooks in `testcases/` by:

```
python scripts/convert-testcases-to-testrail.py
```

Run that from the repo root whenever the workbooks (or the specs they mirror)
change, and the whole tree is rebuilt. One CSV per source workbook, mirroring
the `testcases/` folder layout.

## Alignment guarantee

The chain of truth is: **Playwright specs → `testcases/*.xlsx` → these CSVs.**

- The workbooks' row order and `Title` column are kept in sync with the spec
  files (ascending TC id; title = the spec test title minus its `TC-ID: `
  prefix).
- The converter emits one CSV row per test case **in that same order** with
  **that same title**. TestRail assigns its own case IDs on import, so the row
  order *is* the sequence contract — never re-sort a CSV before importing.
- Rows that exist only in the workbooks (manual, not-automated cases such as
  `TC-CPR-LIM-008`, `TC-LOC-LGL-015..017`, `TC-TNC-CORE-036/054/069/072/081`)
  are included with `Automation Type = Manual`.

## Format (TestRail "Test Case (Steps)" CSV import schema)

36 columns, header row first; the `Steps` column name genuinely appears twice
(TestRail's own export shape). Populated columns:

| Column | Content |
|---|---|
| Title | Test case title (no TC-id prefix; matches the spec title) |
| Automation Type | `Automated`, or `Manual` when the workbook's Coverage Status is not Automated |
| Created By | `Omeesha Mahanta` |
| Expected Result | The last step's expected result (the case-level outcome) |
| Labels | Per module, e.g. `locations`, `corporate-pricing`, `corporate-pricing-pg-override,functional` |
| Preconditions | Workbook Preconditions + blank line + `Test Data:` block from the workbook's Test Data column |
| Priority | From the workbook (`Medium` by default) |
| Section / Section Depth / Section Hierarchy | Per workbook, e.g. `Legal` / `1` / `Locations > Legal` (see `SECTION_BY_BASENAME` in the converter) |
| Steps (first of the two) | HTML ordered list: `<ol><li>1. …</li>…</ol>` |
| Steps (Expected Result) | Plain-text numbered lines `1. …\n2. …` |
| Suite / Suite ID | `Master` / `S1620` |
| Template | `Test Case (Steps)` |
| Type | `Regression` |

All other columns (`ID`, `AI *`, `Mission`, `References`, `Steps (Step)`,
`Updated *`, `is_converted`, …) are left empty — TestRail fills or ignores
them on import.

Encoding: UTF-8 (no BOM), CRLF row terminators, LF line breaks inside cells.

## Importing into TestRail

### Automated (preferred): `npm run testrail:sync`

`npm run testrail:sync` (dry run) / `npm run testrail:sync:execute` (real
import) reads these CSVs directly via the TestRail API, imports **only** the
TC ids that don't already have a case in `config/testrail/case-map.json`, and
writes the returned case ids back into that file. See "Syncing newly authored
test cases into TestRail" in the root `README.md` for the full pipeline (it
also re-runs `check:tc-ids` / `check:alignment` first, and regenerates these
CSVs from `testcases/` if they're stale). This is the only path that keeps
`case-map.json` — the file the TestRail reporter resolves results against —
in sync automatically; the manual CSV-UI import below does not update it.

### Manual (TestRail UI)

1. In TestRail open the target project → **Test Cases → Import Cases (CSV)**.
2. Upload one CSV; choose **UTF-8** encoding, delimiter **comma**,
   **first row is the header**.
3. Layout: **one row per case** (steps are packed inside the row, not spread
   over multiple rows).
4. Map columns; the names match TestRail's fields 1-to-1
   (`Steps` → Steps, `Steps (Expected Result)` → Expected Result of steps,
   `Section Hierarchy` → section, `Template` → Test Case (Steps), …).
5. On the preview screen confirm the case count matches the CSV, then import.
   Import files one at a time per section to keep sections tidy.
6. After a manual import, add the new TC id → case id pairs to
   `config/testrail/case-map.json` yourself (`npm run testrail:sync` won't
   know about cases it didn't create).

## Regenerating a single module

```
python scripts/convert-testcases-to-testrail.py --only location-legal
```

`--only <text>` converts just the workbooks whose file name contains the text.
`--src-dir` / `--out-dir` override the default locations.
