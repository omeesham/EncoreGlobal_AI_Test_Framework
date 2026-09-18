# Old-Site Baseline — Corporate Pricing RE-WALK (keystone audit, SUBPLAN_CORP_PRICING_REWALK_AUDIT)

**Module**: corporate-pricing (Search · Toolbar I/O · Strategy · Detail · New-Pricebook · Product Group Override)
**Client**: encore
**MCP_Session_Date**: 2026-06-19
**MCP_Session_Tool**: Playwright CLI v0.1.8 (agent-CLI, `playwright-cli -s=cpr`, storageState `.auth/encore-state.json`)
**MCP_Tool_Reason**: baseline-absent attestation + Jira design-oracle capture for the keystone re-walk; no live old-site DOM to mirror (see below).
**Author_Identity**: HUNTER (within the OWNER multi-identity span of this subplan)
**baselineScope**: **baseline-absent** (Corporate Pricing is purely net-new on the e2e site — there is NO navigator2 / old-UI antecedent; user-confirmed, LR-ENC-001). Recorded per LR-045 row 4 / LR-048 Phase 0.5b.

> **Provenance**: this artifact is dated `2026-06-19` to match the subplan's `Created` date and the dated deliverable family (`corp-pricing-drift-ledger-2026-06-19.md`, refreshed inventories). The live re-walk that produced the observed-truth evidence ran 2026-06-23 (see the ledger + override inventory `MCP_Session_Date` notes); the baseline-absent attestation itself is date-invariant.

---

## 1. Baseline-absent attestation

Corporate Pricing has **no old-site (navigator2.training.psav.com) equivalent**. Every prior CPR artifact records the same: `baseline-absent (purely e2e, NO nav2 equivalent — user-confirmed; do NOT search nav2)` (navigation.md §C registry rows 103–107; `old-site-baseline/corporate-pricing-2026-06-05.md`; `old-site-baseline/corporate-pricing-override-2026-06-08.md`). This re-walk does **not** re-litigate that — it inherits the confirmed baseline-absent verdict and does NOT enumerate the nav2 login as a bogus baseline.

Because no old UI exists, **the intent oracle for divergence classification is the Jira design ground-truth** (below), and the **observed truth** is the current live e2e DOM (Phase 1 re-walk → `corp-pricing-drift-ledger-2026-06-19.md`). "Divergence" here = live behavior vs the Jira design spec, NOT live vs nav2.

The Gate-1 obligation of the subplan ("Phase 0.5b baseline walk EXECUTED before classification") is satisfied by this attestation + the Jira-oracle capture: there is no old-site walk to run, and the new-site walk (Phase 1) is the observed-truth source, exactly as the subplan's Phase 0.5b step 2 states.

---

## 2. Jira design oracles (intent source — Rovo research 2026-06-19, `encore.atlassian.net`)

These are the **design specifications** the re-walk classifies live behavior against (in lieu of an old-UI baseline). Captured verbatim-in-substance from the parent plan §Jira ground-truth:

| Jira | Status | Design oracle (the intent the live walk is checked against) |
|---|---|---|
| [NM-1472](https://encore.atlassian.net/browse/NM-1472) | Done, Blocker | The Override screen HAS an add affordance — a **Product-Group Picker** (double-click + drag add) that renders **only once a specific location AND a specific currency (not ALL) are selected**. New rows init Dirty + GUID + default Inactive. → Prior "no add affordance" conclusion was the false negative this re-walk must settle. |
| [NM-1463](https://encore.atlassian.net/browse/NM-1463) | Done, Blocker | Override management: currencies are **location-gated**; selecting a location forces back to Equipment; **Override Price auto-activates the row**; **Override Discount (0–100) cannot exist without an Override Price** (the designed NM-1932 validation, NOT "blocked data"); the "New" location list **excludes locations that already have an override**. |
| [NM-1443](https://encore.atlassian.net/browse/NM-1443) | Done, Blocker | Pricing Detail by design: **management mode = double-click / drag NOT allowed (no add); create mode = add allowed.** A real-drag add observed in management mode would be an app-vs-spec divergence. |
| [NM-1881](https://encore.atlassian.net/browse/NM-1881) | Done | Labor product groups EXIST in override; they repro on office **1101** (not the default 1604). Labor is testable by adding a Labor row via the picker. |

**Live bugs the walk must EXPECT (do not mis-read as "no data"):** [NM-2206](https://encore.atlassian.net/browse/NM-2206) override goes blank / red-circle after an MFE-created pricebook + import (Blocker); [NM-2165](https://encore.atlassian.net/browse/NM-2165) import network error but PGs still update; [NM-2301](https://encore.atlassian.net/browse/NM-2301) Max Discount NULL→0.00 on UI price update.

---

## 3. Selector-parity note

Zero selector parity is possible (no old UI). CPR ships **near-zero data-testids** across all surfaces (Search ~3 generic `e2e-*`; Override/Detail/New-Pricebook 0) — text/role/grid-header/content-anchor strategy (Doctrine 4). Booleans render via Radix `[role=checkbox][aria-checked]` (Override `Active`) and Unicode ✔ (Search grid) — LR-036.

---

## Handoff

Baseline-absent confirmed; Jira oracles are the intent source. The observed-truth re-walk and its divergence classification live in `specs_planning/_internal/corp-pricing-drift-ledger-2026-06-19.md`. Consumed by SUBPLAN_CORP_PRICING_{TOOLBAR,DETAIL_DRAGDROP,OVERRIDE_GAPS}_REMEDIATION.
