# Old-Site Baseline — Corporate Pricing › Product Group Override (Wave-1.5)

**Module**: corporate-pricing-override
**Client**: encore
**Date**: 2026-06-08
**Author_Identity**: HUNTER
**baselineScope**: baseline-absent
**New-site URL**: https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/settings/corporate-pricing/pg-override
**Old-site (nav2) URL**: n/a — no equivalent
**Browser tool**: Playwright CLI (`playwright-cli -s=cpr-w15-recon`, storageState `.auth/encore-state.json`)

---

## Baseline diff

**baseline-absent** (LR-ENC-001). The **Product Group Override** screen is **net-new on the e2e Navigator Cloud app** and has **NO equivalent on the old-site Navigator UI** (`navigator2.training.psav.com`). Corporate Pricing as a whole was confirmed baseline-absent in Wave-1 (S0, `corporate-pricing-2026-06-05.md`) — the user explicitly confirmed there is **no nav2 equivalent; do NOT search nav2** (navigation §C registry row 97). The Override screen is a child surface of that same net-new module, so it inherits the baseline-absent classification.

Per LR-ENC-001 + Doctrine 3, baseline-absent is **NOT a HALT**. The intent oracle is the **live DOM** (this screen is also absent from the source DOCX — it is live-discovered, ledger D9). Every divergence from the recon assumptions is **RAISED as an `/encore-questions` clarification** (Doctrine 2), never silently encoded — see `encore-questions-drafts/corporate-pricing-wave15-divergences-2026-06-08.md` (Q-WV15-1).

This artifact exists to satisfy the LR-045 / LR-048 Phase-0.5b baseline obligation and to record the absence explicitly (not silently skip it).

---

## Why no baseline exists

- **Old site (nav2)**: the legacy Navigator UI is a per-location setup app (`/setup/locationdetail/1604`) with embedded tabs. It has **no Corporate Pricing module at all** — Corporate Pricing (pricebooks, pricing strategies, product-group overrides) is a Navigator-Cloud-era capability with no nav2 antecedent. There is therefore no old-site screen to compare the Override grid against.
- **DOCX**: the 5 Jira stories (NM-1445/1440/1441/1443/1444) describe Search, New Pricebook, Pricing Strategy, Pricing Detail, and a History placeholder. The **Product Group Override** screen (reached via the "Pricing Override" toolbar button) is **not described in the DOCX** — it is live-discovered (master ledger D9). Its story ID (possibly NM-1442) and intended Override-Price / Max-Discount-% validation rules are unknown and are raised as Q-WV15-1.

---

## Intent oracle for W15-A (Override FCC)

Because there is no baseline and no DOCX coverage, **live DOM is the sole intent oracle** for the Override screen, captured in the dated field inventory `field-inventories/corporate-pricing-override-2026-06-08.md`. W15-A asserts live reality (so tests are green) AND raises the undocumented behaviors as clarifications (Doctrine 2) — it must not invent intended-behavior assertions the live DOM doesn't support, and it must not treat the observed shape as a confirmed requirement until Q-WV15-1 is answered.

---

## Staleness

- **Last verified**: 2026-06-08
- **Refresh trigger**: any change to the `/pg-override` route, the Override grid columns, or an answer to Q-WV15-1 that establishes documented intent (at which point this becomes baseline-present-by-spec, not baseline-absent).
