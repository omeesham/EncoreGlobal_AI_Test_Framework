"""Apply a renumber map to every ``TC-LOC-NTS-XXX`` reference in the
Playwright spec, the data file, and the mapping doc so they align with new
contiguous IDs after cases are removed from the xlsx.

Two-phase substitution (old -> placeholder -> new) so a forward-moving renumber
(e.g. 033 -> 028) cannot collide with another case that already shifted.

NOTE: The original HIST-removal renumber (033-064 -> 028-058, removing
028-032 and 038) was ALREADY APPLIED to this repo on 2026-07-22. Do NOT
re-apply that map — the RENUMBER dict below is intentionally empty. Fill it
(and REMOVED) only when a future xlsx change requires a new renumbering.

Run from the repo root:  python testcases/_renumber_spec.py
"""

import re
from pathlib import Path

# old ID -> new ID. Empty = nothing to renumber (see NOTE above).
RENUMBER = {}

# IDs deleted from the xlsx — these should NOT appear in the spec or data
# files. If we encounter one, warn.
REMOVED = set()

TARGETS = [
    Path("tests/locations/location-notes.spec.ts"),
    Path("src/data/locations/location-notes.ts"),
    Path("testcases/test-case-spec-mapping.md"),
]

REF_RE = re.compile(r"TC-LOC-NTS-(\d{3})")


def renumber_text(text):
    # Phase 1: every match -> unique placeholder bound to OLD id.
    placeholders = {}

    def to_placeholder(m):
        old = m.group(0)
        token = f"__TCID_{m.group(1)}__"
        placeholders[token] = old
        return token

    phase1 = REF_RE.sub(to_placeholder, text)

    # Phase 2: placeholder -> new id (or warn if removed).
    warnings = []

    def to_new(token):
        old = placeholders[token]
        if old in REMOVED:
            warnings.append(old)
            return old
        return RENUMBER.get(old, old)

    pat = re.compile(r"__TCID_\d{3}__")
    phase2 = pat.sub(lambda m: to_new(m.group(0)), phase1)
    return phase2, warnings


def main():
    if not RENUMBER:
        print("RENUMBER map is empty — nothing to do (see NOTE in docstring).")
        return
    total_replacements = 0
    for p in TARGETS:
        if not p.exists():
            print(f"SKIP (missing): {p}")
            continue
        original = p.read_text(encoding="utf-8")
        new, warnings = renumber_text(original)
        if new == original:
            print(f"unchanged: {p}")
            continue
        before = REF_RE.findall(original)
        after = REF_RE.findall(new)
        changed = sum(1 for a, b in zip(before, after) if a != b)
        p.write_text(new, encoding="utf-8")
        total_replacements += changed
        print(f"updated:   {p}   ({changed} TC IDs renumbered)")
        if warnings:
            print(f"  WARNING: references to removed cases left untouched: "
                  f"{sorted(set(warnings))}")
    print(f"\nTotal TC IDs renumbered: {total_replacements}")


if __name__ == "__main__":
    main()
