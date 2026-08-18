# Notes Test Cases — xlsx ↔ Playwright spec mapping

Source of truth (titles & metadata): [`locations/location-notes.xlsx`](locations/location-notes.xlsx)  
Spec file: [`tests/locations/location-notes.spec.ts`](../tests/locations/location-notes.spec.ts)  
Dynamic data: [`src/data/locations/location-notes.ts`](../src/data/locations/location-notes.ts) → `SPECIAL_CONTENT_TESTS`

Mapping rules:
- **Explicit** — a `test('TC-LOC-NTS-XXX: …', …)` block whose title matches the xlsx Title verbatim.
- **Dynamic** — covered by the `for (const tc of SPECIAL_CONTENT_TESTS)` loop in the spec; the title is built as `` `TC-LOC-NTS-${tc.tcId}: ${tc.name}` `` and `tc.name` matches the xlsx Title.
- **`test.fixme`** — present in the spec but currently skipped (manual).
- **Unmapped** — no Playwright test exists yet.

## Coverage summary

| Status | Count | TC IDs |
|---|---|---|
| Explicit `test()` | 53 | 001, 002, 003, 004, 005, 006, 007, 008, 009, 010, 011, 012, 014, 015, 016, 017, 021, 022, 023, 024, 025, 026, 027, 028, 029, 030, 031, 032, 033, 034, 035, 036, 037, 038, 039, 040, 041, 042, 043, 044, 045, 046, 047, 048, 049, 050, 051, 052, 053, 054, 055, 057, 058 |
| `test.fixme()` (manual) | 1 | 056 |
| Dynamic data-driven | 4 | 013, 018, 019, 020 |
| **Total mapped** | **58 of 58** | |
| Unmapped | 0 | — |

## Full mapping table

| TC ID | xlsx Title | Spec location | Mapping type |
|---|---|---|---|
| TC-LOC-NTS-001 | Verify Notes tab default empty state | `location-notes.spec.ts:655` | Explicit |
| TC-LOC-NTS-002 | Type text in the note box and verify counter updates | `location-notes.spec.ts:670` | Explicit |
| TC-LOC-NTS-003 | Add second note row and verify Delete button behavior | `location-notes.spec.ts:680` | Explicit |
| TC-LOC-NTS-004 | Multi-row counter includes delimiter per row boundary | `location-notes.spec.ts:691` | Explicit |
| TC-LOC-NTS-005 | Delete a row and verify counter decreases | `location-notes.spec.ts:706` | Explicit |
| TC-LOC-NTS-006 | Progress bar updates proportionally with character usage | `location-notes.spec.ts:718` | Explicit |
| TC-LOC-NTS-007 | Verify 4000 character limit (soft enforcement) | `location-notes.spec.ts:728` | Explicit |
| TC-LOC-NTS-008 | Save notes via left-panel Save button | `location-notes.spec.ts:742` | Explicit |
| TC-LOC-NTS-009 | Notes persist after page reload | `location-notes.spec.ts:755` | Explicit |
| TC-LOC-NTS-010 | Tab switch preserves unsaved notes | `location-notes.spec.ts:767` | Explicit |
| TC-LOC-NTS-011 | Navigating away with unsaved changes shows the browser's leave-page warning | `location-notes.spec.ts:778` | Explicit |
| TC-LOC-NTS-012 | Delete all notes and save empty state | `location-notes.spec.ts:788` | Explicit |
| TC-LOC-NTS-013 | Special and HTML characters stored correctly | `location-notes.ts` `SPECIAL_CONTENT_TESTS[0]` (loop in spec) | Dynamic |
| TC-LOC-NTS-014 | Add multiple rows and verify sequential positions | `location-notes.spec.ts:815` | Explicit |
| TC-LOC-NTS-015 | Delete middle row and verify remaining rows shift | `location-notes.spec.ts:830` | Explicit |
| TC-LOC-NTS-016 | Row created via Add shows Delete, and typing keeps the row | `location-notes.spec.ts:846` | Explicit |
| TC-LOC-NTS-017 | Delete last remaining row restores No Notes Available | `location-notes.spec.ts:863` | Explicit |
| TC-LOC-NTS-018 | XSS payload stored as unsafe text (security) | `location-notes.ts` `SPECIAL_CONTENT_TESTS[1]` (loop in spec) | Dynamic |
| TC-LOC-NTS-019 | SQL injection payload stored as text (security) | `location-notes.ts` `SPECIAL_CONTENT_TESTS[2]` (loop in spec) | Dynamic |
| TC-LOC-NTS-020 | Emoji and unicode characters preserved through save/reload | `location-notes.ts` `SPECIAL_CONTENT_TESTS[3]` (loop in spec) | Dynamic |
| TC-LOC-NTS-021 | Paste exceeds 4000 char limit - counter shows overage | `location-notes.spec.ts:876` | Explicit |
| TC-LOC-NTS-022 | Accessibility - keyboard navigation | `location-notes.spec.ts:885` | Explicit |
| TC-LOC-NTS-023 | Full lifecycle - add, save, reload, delete, save | `location-notes.spec.ts:898` | Explicit |
| TC-LOC-NTS-024 | Multi-row persistence - 3 rows save+reload+verify | `location-notes.spec.ts:913` | Explicit |
| TC-LOC-NTS-025 | Boundary persistence - 4000 chars save+reload | `location-notes.spec.ts:936` | Explicit |
| TC-LOC-NTS-026 | Partial deletion persistence - delete middle row, save, verify remaining | `location-notes.spec.ts:950` | Explicit |
| TC-LOC-NTS-027 | Cancel save dialog - verify changes NOT persisted | `location-notes.spec.ts:972` | Explicit |
| TC-LOC-NTS-028 | Sequential save - add second note with reload between saves, both persist | `location-notes.spec.ts:988` | Explicit |
| TC-LOC-NTS-029 | Edit existing saved note - overwritten text persists | `location-notes.spec.ts:1010` | Explicit |
| TC-LOC-NTS-030 | Save empty row - persists as empty note box, not No Notes Available | `location-notes.spec.ts:1029` | Explicit |
| TC-LOC-NTS-031 | Overage content persists - 4001 chars save+reload without truncation | `location-notes.spec.ts:1046` | Explicit |
| TC-LOC-NTS-032 | Delete row persists without explicit note box clear | `location-notes.spec.ts:1063` | Explicit |
| TC-LOC-NTS-033 | Verify a single-character note persists after save and reload | `location-notes.spec.ts:38` | Explicit |
| TC-LOC-NTS-034 | Verify a 3999-character note persists after save and reload | `location-notes.spec.ts:59` | Explicit |
| TC-LOC-NTS-035 | Whitespace-only " " persist | `location-notes.spec.ts:76` | Explicit |
| TC-LOC-NTS-036 | Leading whitespace " hello" persist (not trimmed) | `location-notes.spec.ts:93` | Explicit |
| TC-LOC-NTS-037 | Trailing whitespace "hello " persist (not trimmed) | `location-notes.spec.ts:110` | Explicit |
| TC-LOC-NTS-038 | Verify a multi-line note with line breaks persists after save | `location-notes.spec.ts:144` | Explicit |
| TC-LOC-NTS-039 | Edit prepend | `location-notes.spec.ts:183` | Explicit |
| TC-LOC-NTS-040 | Edit partial-replace (slice middle) | `location-notes.spec.ts:205` | Explicit |
| TC-LOC-NTS-041 | Edit clear-to-empty (row stays with empty value) | `location-notes.spec.ts:233` | Explicit |
| TC-LOC-NTS-042 | 2-row positive (smallest multi-row save+reload) | `location-notes.spec.ts:262` | Explicit |
| TC-LOC-NTS-043 | 5-row positive (smoke at moderate count) | `location-notes.spec.ts:284` | Explicit |
| TC-LOC-NTS-044 | Mixed-content (note 1 = 1-char, note 2 = 4000-char) save+reload | `location-notes.spec.ts:308` | Explicit |
| TC-LOC-NTS-045 | Edit the second of two note rows - first row unchanged after save+reload | `location-notes.spec.ts:330` | Explicit |
| TC-LOC-NTS-046 | Verify deleting the first of two note rows leaves the other | `location-notes.spec.ts:356` | Explicit |
| TC-LOC-NTS-047 | Verify deleting the last of three note rows leaves the first two | `location-notes.spec.ts:383` | Explicit |
| TC-LOC-NTS-048 | Verify a note persists after a cancel-then-resave flow | `location-notes.spec.ts:450` | Explicit |
| TC-LOC-NTS-049 | Verify reloading during the save dialog does not persist the note | `location-notes.spec.ts:467` | Explicit |
| TC-LOC-NTS-050 | Verify pressing Escape on the save dialog cancels without saving | `location-notes.spec.ts:488` | Explicit |
| TC-LOC-NTS-051 | Verify the save dialog behavior when clicking outside it | `location-notes.spec.ts:510` | Explicit |
| TC-LOC-NTS-052 | Verify a second save attempt keeps the Save button disabled | `location-notes.spec.ts:538` | Explicit |
| TC-LOC-NTS-053 | Sequential save persists most recent value | `location-notes.spec.ts:582` | Explicit |
| TC-LOC-NTS-054 | Verify saving Notes does not leave the Currency tab unsaved | `location-notes.spec.ts:598` | Explicit |
| TC-LOC-NTS-055 | Verify saved note rows persist by content after reload | `location-notes.spec.ts:620` | Explicit |
| TC-LOC-NTS-056 | Verify deleting the only note row returns the empty state | `location-notes.spec.ts:419` | Explicit (`test.fixme`) |
| TC-LOC-NTS-057 | Tab character "a\\tb" persist | `location-notes.spec.ts:127` | Explicit |
| TC-LOC-NTS-058 | Edit append | `location-notes.spec.ts:161` | Explicit |

## How re-runs stay aligned

Helper scripts keep this file, the xlsx, and the spec in sync:

1. `testcases/_rename_tests.py` — copies xlsx Title values onto Playwright `test(...)` titles.
2. `testcases/_renumber_spec.py` — applies a renumber map to every `TC-LOC-NTS-XXX` reference across the spec, the data file, and this mapping doc.
3. `testcases/_make_mapping.py` — regenerates this file from the current xlsx + spec state.

Run them in that order whenever the source xlsx changes.
