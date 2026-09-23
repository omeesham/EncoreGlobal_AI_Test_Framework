"""Rename Playwright test titles in
tests/locations/location-notes.spec.ts (and the dynamic
SPECIAL_CONTENT_TESTS table in src/data/locations/location-notes.ts) so that
every `test('TC-LOC-NTS-XXX: <old title>')` becomes
`test('TC-LOC-NTS-XXX: <xlsx Title>')` using the canonical Title column from
testcases/locations/location-notes.xlsx.

Run from the repo root:  python testcases/_rename_tests.py
"""

import re
import pandas as pd

XLSX = "testcases/locations/location-notes.xlsx"
SPEC = "tests/locations/location-notes.spec.ts"
DATA = "src/data/locations/location-notes.ts"


def load_title_map():
    df = pd.read_excel(XLSX)
    df.columns = [str(c).strip() for c in df.columns]
    df = df[df["TC ID"].astype(str).str.match(r"TC-LOC-NTS-\d+", na=False)][["TC ID", "Title"]]
    return {row["TC ID"].strip(): row["Title"].strip() for _, row in df.iterrows()}


def quote_for(title):
    """Pick a JS quote char that doesn't appear in the title."""
    if "'" not in title:
        return "'"
    if '"' not in title:
        return '"'
    return "`"


def update_spec(titles):
    with open(SPEC, "r", encoding="utf-8") as f:
        src = f.read()

    # Matches:
    #   test('TC-LOC-NTS-039: anything', ...
    #   test.fixme("TC-LOC-NTS-062: anything", ...
    # The old title may contain the *other* quote char (e.g. `'... "   " ...'`),
    # so match "any char that is not the wrapping quote" up to the closing
    # quote. Skips the template-literal one with `${...}` (dynamic) — handled
    # separately via the data file.
    pattern = re.compile(
        r"""(test(?:\.(?:skip|fixme|only))?\s*\(\s*)(['"])(TC-LOC-NTS-(\d{3})):\s*(?:(?!\2).)*?\2""",
        re.DOTALL,
    )

    renames = []

    def repl(m):
        prefix, tcid = m.group(1), m.group(3)
        new_title = titles.get(tcid)
        if not new_title:
            return m.group(0)
        old = m.group(0)
        quote = quote_for(new_title)
        new = f"{prefix}{quote}{tcid}: {new_title}{quote}"
        if new != old:
            renames.append((tcid, new_title))
        return new

    new_src = pattern.sub(repl, src)

    with open(SPEC, "w", encoding="utf-8") as f:
        f.write(new_src)

    return renames


def update_data(titles):
    """Update SPECIAL_CONTENT_TESTS `name` fields so the dynamic test title
    (built as `TC-LOC-NTS-${tc.tcId}: ${tc.name}`) matches the xlsx Title.
    """
    with open(DATA, "r", encoding="utf-8") as f:
        src = f.read()

    # Replace entries like:
    #   { tcId: '013', name: 'old', text: NOTE_SPECIAL_CHARS },
    pattern = re.compile(
        r"(\{\s*tcId:\s*['\"])(\d{3})(['\"]\s*,\s*name:\s*)(['\"])((?:(?!\4).)*)\4"
    )

    renames = []

    def repl(m):
        tcid_num = m.group(2)
        new_name = titles.get(f"TC-LOC-NTS-{tcid_num}")
        if not new_name:
            return m.group(0)
        if new_name == m.group(5):
            return m.group(0)
        renames.append((f"TC-LOC-NTS-{tcid_num}", new_name))
        quote = quote_for(new_name)
        return f"{m.group(1)}{tcid_num}{m.group(3)}{quote}{new_name}{quote}"

    new_src = pattern.sub(repl, src)

    with open(DATA, "w", encoding="utf-8") as f:
        f.write(new_src)

    return renames


def main():
    titles = load_title_map()
    spec_renames = update_spec(titles)
    data_renames = update_data(titles)
    print(f"Renamed {len(spec_renames)} tests in {SPEC}")
    for tcid, t in spec_renames:
        print(f"  {tcid}: {t}")
    print(f"Renamed {len(data_renames)} dynamic entries in {DATA}")
    for tcid, t in data_renames:
        print(f"  {tcid}: {t}")


if __name__ == "__main__":
    main()
