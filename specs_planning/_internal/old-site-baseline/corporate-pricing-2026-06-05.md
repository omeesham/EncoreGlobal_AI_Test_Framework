---
artifact: old-site-baseline
module: corporate-pricing
client: encore
session_date: 2026-06-05
session_tool: n/a (no nav2 walk — baseline-absent by user directive; see §1)
author_identity: HUNTER
page_url_old: n/a — no navigator2 equivalent exists
page_url_new_equivalent: https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/settings/corporate-pricing
test_entity: office 1604 ("The Parker Palm Springs")
parent_subplan: SUBPLAN_CORP_PRICING_00_FOUNDATION.md
baselineScope: baseline-absent
---

# Old-Site Baseline — Corporate Pricing (BASELINE-ABSENT)

## §1. Access / baseline status

**`baselineScope: baseline-absent`** — per LR-ENC-001 this is **NOT a HALT**.

> **⚠ AUTHORITATIVE USER DIRECTIVE (2026-06-05): Corporate Pricing is a PURELY e2e feature. There is NO navigator2 (old-site) equivalent. Do NOT search nav2 for it, and do NOT treat its absence on nav2 as a divergence/gap.**

Per that directive, **no nav2 walk was performed** — the feature does not exist on the old Navigator UI, so a walk would be wasted effort. This intentionally differs from the usual LR-ENC-001 Phase 1a flow (which walks nav2 first); the user has authoritatively closed that question for this module. Any future agent that finds Corporate Pricing missing on nav2 should read this note and stop — it is expected, by design.

## §2. Selector style notes

n/a — no old-site DOM to compare. New-site selector strategy is documented in the companion walk-evidence (`walk-evidence-corporate-pricing-2026-06-05.md` §7): text/role/grid-header/content-anchor; near-zero `data-testid` coverage.

## §3. Tab / feature inventory

- **Present on new site only (baseline-absent)**: the entire Corporate Pricing module — Search, Pricebook Details (Pricing Strategy + Pricing Detail tabs), New Pricebook (`/add?type=equipment|labor`).
- **Absent on baseline**: ALL of the above (net-new on e2e).
- **Absent on new site too**: History (NM-1444) — placeholder, not yet built.

## Baseline diff

| Dimension | Old site (nav2) | New site (e2e) | Classification |
|---|---|---|---|
| Corporate Pricing module (all screens) | **does not exist** | built (Search + Details + New Pricebook) | **baseline-absent** (net-new on e2e) |
| Intent oracle | n/a (no old UI) | — | **DOCX** = the requirement oracle: `Pricing-Functional Details-JIRA STORIES 1.docx` (NM-1445 Search, NM-1440 New Pricebook, NM-1441 Strategy, NM-1443 Pricing Detail, NM-1444 History) |

**Disposition**: with no old-site behavior to compare against, the **DOCX is the sole intent oracle** for ambiguous cases (master Doctrine 2). Live e2e DOM is the assertion truth. Divergences between DOCX intent and live DOM are RAISED via `/encore-questions` (ALL-078), never silently absorbed. No `BUG-*` is filed solely because a feature is absent on nav2 — that is expected for a purely-e2e module.

## §FCC-lens divergences

Field-type behaviors needing FCC coverage are catalogued in the companion walk-evidence §13 (text filters, dropdown each-option, checkbox toggle/revert, numeric BVA on New Price / Max Discount, multi-row FormArray strategies). Full FCC design deferred to Wave 2 (Doctrine 1).

## Provenance

Emitted by S0 (SUBPLAN_CORP_PRICING_00_FOUNDATION) HUNTER intake, 2026-06-05. Lands the master plan's provisional baseline-absent assumption (F19). Companion: `walk-evidence-corporate-pricing-2026-06-05.md` (full new-site live walk + D1–D8 verification).
</content>
