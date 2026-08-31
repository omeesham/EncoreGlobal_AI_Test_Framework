"""Convert testcases/**/*.xlsx into the TestRail CSV import format.

Source of truth: the per-module workbooks in `testcases/` (whose row order and
Title column are kept in sync with the Playwright specs — ascending TC id,
title = spec title minus the `TC-ID: ` prefix). This converter preserves BOTH:
each output CSV carries one row per test case, in the same sequence, with the
same title. TestRail assigns its own case IDs on import, so the row order IS
the sequence contract.

Target format (reverse-engineered from the existing `testcases-testrail-import`
CSVs — TestRail's "Test Case (Steps)" CSV import schema, 36 columns):

  ID, Title, AI Automated Test, AI Model, AI Type, Attachments, Automation Type,
  Created By, Created On, Estimate, Expected Result, Forecast, Goals, Labels,
  Mission, Preconditions, Priority, References, Section, Section Depth,
  Section Description, Section Hierarchy, Steps, Steps, Steps (Additional Info),
  Steps (Expected Result), Steps (References), Steps (Shared step ID),
  Steps (Step), Suite, Suite ID, Template, Type, Updated By, Updated On,
  is_converted

Populated columns and their conventions (all others stay empty):
  Title                    source Title (spec-synced, no TC-id prefix)
  Automation Type          "Automated" when Coverage Status contains "Automated",
                           else "Manual"
  Created By               constant (see CREATED_BY)
  Expected Result          the LAST step's expected result (the case-level outcome)
  Labels                   per-module label (see MODULE_CONFIG)
  Preconditions            source Preconditions + "\n\nTest Data:\n" + source Test Data
  Priority                 source Priority (default "Medium")
  Section                  per-workbook section name (see SECTION_BY_BASENAME)
  Section Depth            "1"
  Section Hierarchy        "<Module_Label> > <Section>"
  Steps (first column)     HTML ordered list: <ol>\n<li>1. step</li>...\n</ol>
                           (steps renumbered sequentially; '<'/'&' escaped)
  Steps (Expected Result)  plain-text numbered lines "1. ...\n2. ..."
  Suite / Suite ID         "Master" / "S1620"
  Template                 "Test Case (Steps)"
  Type                     "Regression"

Output: one CSV per source workbook, mirroring the testcases/ folder layout:
  <out-dir>/<module-folder>/<workbook-name>.csv
CSV encoding: UTF-8 without BOM; CRLF row terminators; LF inside quoted cells
(matches the existing import files).

Usage (from the repo root):
  python scripts/convert-testcases-to-testrail.py
  python scripts/convert-testcases-to-testrail.py --src-dir testcases --out-dir testcases-testrail-import
  python scripts/convert-testcases-to-testrail.py --only location-legal   # one workbook

Dependencies: pip install openpyxl
"""

from __future__ import annotations

import argparse
import csv
import re
import sys
from pathlib import Path

import openpyxl

# ---------------------------------------------------------------------------
# TestRail CSV schema (column order matters; "Steps" genuinely appears twice)
# ---------------------------------------------------------------------------
TESTRAIL_COLUMNS = [
    "ID", "Title", "AI Automated Test", "AI Model", "AI Type", "Attachments",
    "Automation Type", "Created By", "Created On", "Estimate", "Expected Result",
    "Forecast", "Goals", "Labels", "Mission", "Preconditions", "Priority",
    "References", "Section", "Section Depth", "Section Description",
    "Section Hierarchy", "Steps", "Steps", "Steps (Additional Info)",
    "Steps (Expected Result)", "Steps (References)", "Steps (Shared step ID)",
    "Steps (Step)", "Suite", "Suite ID", "Template", "Type",
    "Updated By", "Updated On", "is_converted",
]

CREATED_BY = "Omeesha Mahanta"
SUITE = "Master"
SUITE_ID = "S1620"
TEMPLATE = "Test Case (Steps)"
CASE_TYPE = "Regression"
SECTION_DEPTH = "1"

# Workbooks that are indexes/trackers, not per-module test-case sources.
SKIP_BASENAMES = {"encore_test_cases", "encore-qa-tracker"}

# Per module FOLDER (under testcases/): the hierarchy label and the Labels value.
MODULE_CONFIG: dict[str, dict[str, str]] = {
    "corporate-pg-pricing-override": {"module": "Corporate_Pricing_Pg_Override",
                                     "labels": "corporate-pricing-pg-override,functional"},
    "corporate-pricing":     {"module": "Corporate_Pricing", "labels": "corporate-pricing"},
    "discount-matrix":       {"module": "Discount_Matrix", "labels": "discount-matrix"},
    "discount-optimization": {"module": "Discount_Optimization", "labels": "discount-optimization"},
    "locations":             {"module": "Locations", "labels": "locations"},
    "service-charge":        {"module": "Service_Charge", "labels": "service-charge"},
    "service-charge-text":   {"module": "Service_Charge_Text", "labels": "service-charge-text"},
    "terms-conditions":      {"module": "Terms_Conditions", "labels": "terms-conditions"},
}

# Per workbook basename: the TestRail Section name. Anything missing falls back
# to Title_Case_With_Underscores of the workbook's Submodule column.
SECTION_BY_BASENAME: dict[str, str] = {
    "corporate-pg-pricing-override-core": "Core",
    "corporate-pg-pricing-override-export": "Export",
    "corporate-pg-pricing-override-filters": "Filters",
    "corporate-pg-pricing-override-grid-equipment-labor": "Grid_Equipment_Labor",
    "corporate-pg-pricing-override-grid-filters": "Grid_Filters",
    "corporate-pg-pricing-override-import": "Import",
    "corporate-pg-pricing-override-location-search": "Location_Search",
    "corporate-pricing-detail": "Detail",
    "corporate-pricing-export-all": "Export_All",
    "corporate-pricing-import-all": "Import_All",
    "corporate-pricing-loc-export": "Loc_Pricing_Export",
    "corporate-pricing-loc-import": "Loc_Pricing_Import",
    "corporate-pricing-new-pricebook": "New_Pricebook",
    "corporate-pricing-override": "Override_Link",
    "corporate-pricing-search": "Search",
    "corporate-pricing-strategy": "Strategy",
    "discount-matrix-company-matrix": "Company_Matrix",
    "discount-optimization-exemption": "Special_Rate_Exemptions",
    "discount-optimization-locations": "Locations",
    "location-account-address": "Account_Address",
    "location-auto-addon": "Auto_Addon",
    "location-business-types": "Business_Types",
    "location-left-panel-basic-information": "Left_Panel_Basic_Information",
    "location-legal": "Legal",
    "location-notes": "Notes",
    "location-shared-setup-locations": "Shared_Setup_Locations",
    "service-charge-basic-information": "Basic_Information",
    "service-charge-history": "History",
    "service-charge-text-core": "Core",
    "terms-conditions-core": "Core",
}

TC_ID_RE = re.compile(r"^TC-[A-Z0-9]+(?:-[A-Z0-9]+)*-(\d+)$")
STEP_NUM_RE = re.compile(r"^\s*\d+[\.\)]\s*")


def title_case_slug(slug: str) -> str:
    """'loc_pricing_import' -> 'Loc_Pricing_Import'."""
    return "_".join(p.capitalize() for p in re.split(r"[_\-\s]+", slug.strip()) if p)


def cell(v: object) -> str:
    return str(v).strip() if v is not None else ""


def esc_html(text: str) -> str:
    """Escape only what would break TestRail's HTML step list ('&' and '<');
    the established files keep '>' and quotes literal."""
    return text.replace("&", "&amp;").replace("<", "&lt;")


def derive_automation(coverage: str) -> str:
    c = coverage.lower()
    return "Automated" if "automated" in c and "pending" not in c else "Manual"


# ---------------------------------------------------------------------------
# Source parsing: one workbook -> ordered list of cases with their step blocks
# ---------------------------------------------------------------------------

def read_cases(xlsx_path: Path) -> list[dict[str, object]]:
    wb = openpyxl.load_workbook(xlsx_path, data_only=True, read_only=True)
    ws = wb.worksheets[0]
    rows = ws.iter_rows(values_only=True)
    header = [cell(c) for c in next(rows)]

    def col(name: str) -> int:
        try:
            return header.index(name)
        except ValueError:
            return -1

    i_id, i_title = col("TC ID"), col("Title")
    i_sub = col("Submodule")
    i_data, i_prio = col("Test Data"), col("Priority")
    i_cov, i_pre = col("Coverage Status"), col("Preconditions")
    i_step, i_exp = col("Steps (Step)"), col("Steps (Expected Result)")

    cases: list[dict[str, object]] = []
    current: dict[str, object] | None = None
    for row in rows:
        tcid = cell(row[i_id]) if i_id >= 0 and i_id < len(row) else ""
        get = lambda i: cell(row[i]) if 0 <= i < len(row) else ""
        if tcid and TC_ID_RE.match(tcid):
            current = {
                "tc_id": tcid,
                "num": int(TC_ID_RE.match(tcid).group(1)),  # type: ignore[union-attr]
                "title": get(i_title),
                "submodule": get(i_sub),
                "test_data": get(i_data),
                "priority": get(i_prio) or "Medium",
                "coverage": get(i_cov),
                "preconditions": get(i_pre),
                "steps": [],
                "expecteds": [],
            }
            cases.append(current)
        elif tcid:
            current = None  # SUMMARY or other non-case row ends the block
            continue
        if current is None:
            continue
        step, exp = get(i_step), get(i_exp)
        if step:
            current["steps"].append(STEP_NUM_RE.sub("", step))  # type: ignore[union-attr]
        if exp:
            current["expecteds"].append(STEP_NUM_RE.sub("", exp))  # type: ignore[union-attr]
    wb.close()

    # Sequence contract: ascending TC id — the same order as the workbook rows
    # and the spec files. A stable sort keeps duplicates (none expected) intact.
    cases.sort(key=lambda c: c["num"])  # type: ignore[arg-type, return-value]
    return cases


# ---------------------------------------------------------------------------
# TestRail row builder + CSV writer
# ---------------------------------------------------------------------------

def build_row(case: dict[str, object], module_label: str, labels: str,
              section: str) -> list[str]:
    steps: list[str] = case["steps"] or ["(no steps defined)"]  # type: ignore[assignment]
    expecteds: list[str] = case["expecteds"]  # type: ignore[assignment]

    steps_html = "<ol>\n" + "\n".join(
        f"<li>{i}. {esc_html(s)}</li>" for i, s in enumerate(steps, start=1)
    ) + "\n</ol>"
    expected_lines = "\n".join(f"{i}. {e}" for i, e in enumerate(expecteds, start=1))
    case_expected = expecteds[-1] if expecteds else ""

    preconditions = str(case["preconditions"])
    test_data = str(case["test_data"])
    if test_data:
        preconditions = (preconditions + "\n\nTest Data:\n" + test_data).strip()

    by_name = {
        "Title": str(case["title"]),
        "Automation Type": derive_automation(str(case["coverage"])),
        "Created By": CREATED_BY,
        "Expected Result": case_expected,
        "Labels": labels,
        "Preconditions": preconditions,
        "Priority": str(case["priority"]),
        "Section": section,
        "Section Depth": SECTION_DEPTH,
        "Section Hierarchy": f"{module_label} > {section}",
        "Steps": steps_html,  # first "Steps" column only
        "Steps (Expected Result)": expected_lines,
        "Suite": SUITE,
        "Suite ID": SUITE_ID,
        "Template": TEMPLATE,
        "Type": CASE_TYPE,
    }
    out: list[str] = []
    steps_seen = False
    for colname in TESTRAIL_COLUMNS:
        if colname == "Steps":
            out.append("" if steps_seen else by_name["Steps"])
            steps_seen = True
        else:
            out.append(by_name.get(colname, ""))
    return out


def convert_workbook(xlsx_path: Path, out_path: Path) -> int:
    base = xlsx_path.stem
    module_dir = xlsx_path.parent.name
    mod = MODULE_CONFIG.get(module_dir,
                            {"module": title_case_slug(module_dir), "labels": module_dir})
    cases = read_cases(xlsx_path)
    if not cases:
        print(f"  WARN {base}: no cases found — skipped")
        return 0
    section = SECTION_BY_BASENAME.get(base) or title_case_slug(str(cases[0]["submodule"]) or base)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)  # default \r\n row terminators, LF kept inside cells
        w.writerow(TESTRAIL_COLUMNS)
        for case in cases:
            w.writerow(build_row(case, mod["module"], mod["labels"], section))
    print(f"  {base}: {len(cases)} case(s) -> {out_path.as_posix()}")
    return len(cases)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    ap.add_argument("--src-dir", type=Path, default=Path("testcases"),
                    help="Root of the source workbooks (default: testcases).")
    ap.add_argument("--out-dir", type=Path, default=Path("testcases-testrail-import"),
                    help="Output root (default: testcases-testrail-import).")
    ap.add_argument("--only", default="",
                    help="Convert only workbooks whose basename contains this text.")
    args = ap.parse_args()

    if not args.src_dir.is_dir():
        print(f"ERROR: source dir not found: {args.src_dir} (run from the repo root)",
              file=sys.stderr)
        return 2

    total_cases = total_files = 0
    for xlsx in sorted(args.src_dir.rglob("*.xlsx")):
        if xlsx.stem in SKIP_BASENAMES or xlsx.stem.startswith("~$"):
            continue
        if args.only and args.only not in xlsx.stem:
            continue
        rel = xlsx.relative_to(args.src_dir)
        out_path = args.out_dir / rel.parent / (xlsx.stem + ".csv")
        n = convert_workbook(xlsx, out_path)
        if n:
            total_files += 1
            total_cases += n
    print(f"Done: {total_cases} test case(s) across {total_files} CSV file(s) "
          f"under {args.out_dir.as_posix()}/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
