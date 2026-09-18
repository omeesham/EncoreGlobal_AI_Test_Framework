# Old-Site Baseline — Corporate Pricing · Loc Pricing Import (NM-2305)

**Module**: corporate-pricing (Search · Toolbar I/O — **Loc Pricing Import** action)
**Client**: encore
**MCP_Session_Date**: 2026-07-07
**MCP_Session_Tool**: Playwright CLI v0.1.8 (agent-CLI, `playwright-cli` session on `.auth/encore-state.json`)
**MCP_Tool_Reason**: functional-behavior verification of the real upload round-trip + a one-time authorized large-file probe; structured API-response capture (fetch/XHR interceptor) is the oracle, so CLI over Chrome.
**Author_Identity**: OWNER (multi-identity span of SUBPLAN_CORP_PRICING_NM2305_LOC_IMPORT)
**baselineScope**: **baseline-absent** (Corporate Pricing is purely net-new on the e2e site — NO navigator2 / old-UI antecedent; user-confirmed, LR-ENC-001; inherited from `corporate-pricing-2026-06-05.md` / `-rewalk-2026-06-19.md`, not re-litigated).
**Oracle**: the re-downloaded `Loc Pricing Export` CSV (the on-screen Search grid is a different, tenant-wide dataset) + the intercepted `PUT .../pricing/location-import` response (status + body).

---

## 1. Baseline-absent attestation

There is no old-site (nav2) equivalent of the Corporate Pricing bulk import; the nav2 per-location Pricing sub-tab under `/setup/locationdetail/1604` is a **different surface** (single-location, embedded), not the corporate bulk upload. The intent oracle is therefore the live e2e behavior + Jira design tickets, never a nav2 diff. No nav2 walk was run (none applies).

---

## 2. Observed live behavior (e2e, office 5897, 2026-07-07)

The import is `PUT /navigator/api/location/pricing/location-import` — a **per-LOCATION replace**: the rows the file carries for a location REPLACE that location's existing pricebook rows (a row present for the location but omitted from the file is **removed**), while locations absent from the file are untouched. (Live-verified 2026-07-07: a 2-of-3-row file for office 5897 left it with exactly those 2 rows — the omitted NP LB4 row was deleted; `recordsProcessed:2`.) Verified live:

- **Auto-submit on choose**: the app submits the import the **moment a file is chosen** (via Browse → file chooser) — there is **no separate "Upload" click**. Choosing a valid file fires `PUT .../location-import` on its own and the dialog closes on success. (This overturned the first automation model, which waited for an Upload button that never needed clicking — all 7 first-run TCs failed on that wait until the page object was corrected to the auto-submit model.)
- **Bounded valid import → 200 `{success:true}`** with a "Successfully processed 3 records… updated 3 existing pricebook entries." message. The uploaded file's rows change; **every other location is untouched** (proven: a single-location file left the full 38,010-row export otherwise identical). Primary↔Alternate flip (the `IsAlternate` 0/1 flag) lands and is visible in a fresh export.
- **Client-side rejections (no request fires; dialog stays open, Upload disabled)** — exact live messages:
  - empty/header-only → *"The selected file does not contain any valid location pricing rows to import."*
  - non-CSV (`.txt`) → *"Unsupported file type. Allowed: .csv"*
  - structurally malformed CSV → *"Cannot read properties of undefined (reading 'trim')"* (a raw client-side parser error — an unfriendly-message improvement lead).
- **Post-import**: the Search grid still renders (not blank) after a successful import.

## 3. Large-file boundary — verified live under authorized override (2026-07-07)

**Context**: the subplan's Mutation-Safety Authorization forbids a full/multi-location import. The user **explicitly authorized a one-time override** ("Override safety, probe it") to determine, rather than assume, whether the large-file defect still fires. To minimize damage the full export was re-imported **unchanged** (idempotent on values).

**Result**: importing the full ~38,010-row export returned **HTTP 500** part-way through (progress bar stalled ~50%). Response body:

```
{"success":false,
 "validationErrors":{"exception":["Failed to replace LocationPricebook document with id '7638c400-36c3-bf8f-b625-5e7975e87700' and locationNo '1430'."]},
 "message":"Failed to replace LocationPricebook document with id '7638c400-36c3-bf8f-b625-5e7975e87700' and locationNo '1430'."}
```

UI: *"Import failed due to a server error. Please try again. If the problem continues, contact support."*

**No net data change**: because the file was re-imported unchanged, rows written before the 500 were rewritten with identical values. Confirmed post-probe: office 5897's 3 rows identical to baseline, total export row count unchanged at 38,010.

## 4. Jira lead classification (LR-044 — filed bugs are LEADS, verified live before any claim)

| Lead | Ticket subject | Live classification (2026-07-07) |
|---|---|---|
| **NM-2165** (plan lead) | Import shows network-error toast but *Product Groups* still update | **Wrong-surface + not-reproduced.** NM-2165 is a *Product Groups* import; on **Loc Pricing Import** the analog pattern (server rejects yet values silently update anyway) did **not** occur — bounded imports returned clean 200s, and the full-file 500 did not silently apply hidden partial changes beyond the identical-value rewrites. |
| **NM-2206** (plan lead) | Grid goes blank after import | **Not reproduced.** After every observed import the Search grid still rendered. Automated as a regression guard by **TC-CPR-TIO-047**. |
| **NM-2407** | Failed to replace LocationPricebook document | **REPRODUCED live.** HTTP 500 with the exact "Failed to replace … document … locationNo '1430'" message on the full-file import (§3). |
| NM-2009 / NM-2058 / NM-2195 | Large import → 503/504 gateway timeout | **Not reproduced as a timeout.** The full-file failure surfaced as a **500 replace-error (NM-2407)**, not a 503/504 gateway timeout — the timeout failure mode did not manifest in this probe. |
| NM-2070 | Primary/Alternate not updating | **Not reproduced.** The IsAlternate flip landed correctly in a fresh export (§2). |
| NM-2030 | UseDate/EndDate validation blocks import | **Not exercised conclusively.** The raw full export (mostly UseDate=0) reached the server (got a 500, not a client-side EndDate validation reject), so the NM-2030 block did not fire on this file; a UseDate=1-without-EndDate case was not constructed (would require mutating other offices' rows). |
| NM-2322 / NM-2385 | (loc-import related) | **Not probed** this session — their specific scenarios were out of scope of the authorized checks; left as open leads, not classified. |

**New observation (not from Jira) — silent delete of omitted rows.** The import is a per-LOCATION replace (§2): a 2-row file for office 5897 (omitting its 3rd row) left the office with exactly those 2 rows — the omitted row was **deleted**. The success response reported `"updated 2 existing pricebook entries"` and did **not** mention the deletion. A user importing a partial file for a location may not realise omitted rows are wiped. Classified as a **discussion-item / reporting-improvement lead** (not filed — replace-on-import may be the intended bulk-config design; the concern is the silent-delete + "updated N" wording under-reporting the delete). Surfaced by TC-CPR-TIO-042.

## 5. Coverage disposition

Automated (TC-CPR-TIO-041..047): success round-trip, per-location-replace partial update (omitted row removed), the three in-browser rejections, cancel, persistence + NM-2206 grid-not-blank guard. The oracle is the re-downloaded export, never the on-screen grid.

The full/large-file 500 (NM-2407) is **verified-live once and documented** (TC-CPR-TIO-048), **not** wired into CI: a repeating full import would re-import ~38k rows against shared data every run (~half applied before the 500). Automate only if the server bug is fixed or a bounded file that reliably triggers the 500 is found.
