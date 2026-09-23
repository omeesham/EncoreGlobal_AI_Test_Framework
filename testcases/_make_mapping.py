"""Regenerate test-case-spec-mapping.md from the current xlsx + spec + data
file. Run after _rename_tests.py / _renumber_spec.py.

Run from the repo root:  python testcases/_make_mapping.py
"""

import re
from pathlib import Path
import pandas as pd

XLSX = Path("testcases/locations/location-notes.xlsx")
SPEC = Path("tests/locations/location-notes.spec.ts")
DATA = Path("src/data/locations/location-notes.ts")
OUT = Path("testcases/test-case-spec-mapping.md")


def load_xlsx():
    df = pd.read_excel(XLSX)
    df.columns = [str(c).strip() for c in df.columns]
    rows = []
    seen = set()
    for _, r in df.iterrows():
        i = str(r["TC ID"]).strip()
        if re.match(r"TC-LOC-NTS-\d+", i) and i not in seen:
            seen.add(i)
            rows.append((i, str(r["Title"]).strip()))
    return rows


def parse_spec():
    lines = SPEC.read_text(encoding="utf-8").splitlines()
    pat = re.compile(
        r"^\s*test(\.(?:skip|fixme|only))?\s*\(\s*['\"`](TC-LOC-NTS-\d{3}):"
    )
    out = {}
    for n, line in enumerate(lines, start=1):
        m = pat.match(line)
        if m:
            mod = m.group(1) or ""
            tag = mod.lstrip(".") or "test"
            tcid = m.group(2)
            out[tcid] = (n, tag)
    return out


def parse_dynamic():
    src = DATA.read_text(encoding="utf-8")
    out = {}
    for i, m in enumerate(re.finditer(r"\{\s*tcId:\s*['\"](\d{3})['\"]", src)):
        out[f"TC-LOC-NTS-{m.group(1)}"] = i
    return out


def main():
    cases = load_xlsx()
    explicit = parse_spec()
    dynamic = parse_dynamic()

    explicit_ids = [i for i, _ in cases if i in explicit and explicit[i][1] == "test"]
    fixme_ids = [i for i, _ in cases if i in explicit and explicit[i][1] == "fixme"]
    dynamic_ids = [i for i, _ in cases if i in dynamic]
    mapped = set(explicit) | set(dynamic)
    unmapped = [i for i, _ in cases if i not in mapped]

    md = []
    md.append("# Notes Test Cases — xlsx ↔ Playwright spec mapping\n")
    md.append("Source of truth (titles & metadata): "
              "[`locations/location-notes.xlsx`](locations/location-notes.xlsx)  ")
    md.append("Spec file: "
              "[`tests/locations/location-notes.spec.ts`](../tests/locations/location-notes.spec.ts)  ")
    md.append("Dynamic data: "
              "[`src/data/locations/location-notes.ts`](../src/data/locations/location-notes.ts) "
              "→ `SPECIAL_CONTENT_TESTS`\n")
    md.append("Mapping rules:")
    md.append("- **Explicit** — a `test('TC-LOC-NTS-XXX: …', …)` block whose title matches the xlsx Title verbatim.")
    md.append("- **Dynamic** — covered by the `for (const tc of SPECIAL_CONTENT_TESTS)` loop in the spec; the title is built as `` `TC-LOC-NTS-${tc.tcId}: ${tc.name}` `` and `tc.name` matches the xlsx Title.")
    md.append("- **`test.fixme`** — present in the spec but currently skipped (manual).")
    md.append("- **Unmapped** — no Playwright test exists yet.")
    md.append("")
    md.append("## Coverage summary\n")
    md.append("| Status | Count | TC IDs |")
    md.append("|---|---|---|")
    md.append(f"| Explicit `test()` | {len(explicit_ids)} | {', '.join(i.split('-')[-1] for i in explicit_ids)} |")
    md.append(f"| `test.fixme()` (manual) | {len(fixme_ids)} | {', '.join(i.split('-')[-1] for i in fixme_ids) or '—'} |")
    md.append(f"| Dynamic data-driven | {len(dynamic_ids)} | {', '.join(i.split('-')[-1] for i in dynamic_ids)} |")
    total_mapped = len(explicit_ids) + len(fixme_ids) + len(dynamic_ids)
    md.append(f"| **Total mapped** | **{total_mapped} of {len(cases)}** | |")
    md.append(f"| Unmapped | {len(unmapped)} | {', '.join(i.split('-')[-1] for i in unmapped) or '—'} |")
    md.append("")
    md.append("## Full mapping table\n")
    md.append("| TC ID | xlsx Title | Spec location | Mapping type |")
    md.append("|---|---|---|---|")

    for tcid, title in cases:
        # Escape pipe in title just in case.
        ttl = title.replace("|", "\\|")
        if tcid in explicit:
            line_no, tag = explicit[tcid]
            loc = f"`location-notes.spec.ts:{line_no}`"
            kind = "Explicit (`test.fixme`)" if tag == "fixme" else "Explicit"
        elif tcid in dynamic:
            idx = dynamic[tcid]
            loc = f"`location-notes.ts` `SPECIAL_CONTENT_TESTS[{idx}]` (loop in spec)"
            kind = "Dynamic"
        else:
            loc = "—"
            kind = "**Unmapped**"
        md.append(f"| {tcid} | {ttl} | {loc} | {kind} |")

    md.append("")
    md.append("## How re-runs stay aligned\n")
    md.append("Helper scripts keep this file, the xlsx, and the spec in sync:")
    md.append("")
    md.append("1. `testcases/_rename_tests.py` — copies xlsx Title values onto Playwright `test(...)` titles.")
    md.append("2. `testcases/_renumber_spec.py` — applies a renumber map to every `TC-LOC-NTS-XXX` reference across the spec, the data file, and this mapping doc.")
    md.append("3. `testcases/_make_mapping.py` — regenerates this file from the current xlsx + spec state.")
    md.append("")
    md.append("Run them in that order whenever the source xlsx changes.")
    md.append("")

    OUT.write_text("\n".join(md), encoding="utf-8")
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
