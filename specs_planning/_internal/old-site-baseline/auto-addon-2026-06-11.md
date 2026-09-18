---
module: auto-addon
client: encore
baselineScope: baseline-partial
baseline_url: https://navigator2.training.psav.com/#/setup/locationdetail/1604
observed_url: https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/settings/location
session_date: 2026-06-11
author_identity: HUNTER
test_entity: Office 1604 (Parker Palm Springs)
---

# Old-Site Baseline — Auto Add-On (Location Settings)

**Baseline truth source** (LR-ENC-001): `navigator2.training.psav.com` (old Navigator UI — Angular + PrimeNG + Bootstrap, `name=`/`id=` selectors, ZERO `data-testid`). Observation-only — no selector parity, no specs run against baseline.

## 1. Access

- e2e CLI session (`state-load encore-state.json`) **SSO-bridges to nav2** after a short settle (first `goto` landed on `/#/login/exp/|setup|locationdetail|1604`; re-`goto` after ~6s landed authenticated on `/#/setup/locationdetail/1604`). No separate sign-in required — confirms LR-ENC-001 shared-MS-SSO bridge (same pattern as Account-Address registry row).
- Architectural divergence per LR-ENC-001 holds: old site = ONE URL `/setup/locationdetail/1604` with embedded top-level tabs (Basic Information + Location Management History) and embedded sub-tabs.

## 2. Auto Add-On equivalent — PRESENT

The old site **HAS an "Auto Add-On" sub-tab** under the location detail (alongside Local Information, Currency, Pricing, Account And Address, Legal, Notes, Shared Setup Locations). It is NOT a net-new-on-e2e feature.

**Old-site Auto Add-On items observed** (panel text, observation-only):

- Encore Music
- Wireless Presenter
- Express Content Design Session
- Wordly
- Labor

→ **Item list = identical 5** to the new site (`location-settings-checkbox-auto-add-on-*`). Item-list parity confirmed.

## 3. What was NOT captured (honest scope — `baseline-partial`)

- Per-item **checked-state** on old site: not reliably isolated. The location-detail form keeps the Basic-Information checkbox set (`ldwid`, `SC_ID`, `AllowTickCalcId`, etc.) mounted in the DOM alongside the Auto Add-On panel; the 5 Auto Add-On items render as panel rows whose individual old-site checked states were not separated from the 52 form checkboxes. New-site live walk is the authoritative default-state source (see field-inventory artifact).
- Old-site **save behavior / history** for Auto Add-On: not walked (observation-only; new-site save-cycle captured in field inventory).
- Reason for `partial` not `full`: item-LIST parity proven; per-item state/save NOT proven on baseline (and not needed — new-site is observed truth).

## 4. Baseline diff (observed-vs-baseline)

| Observation | Classification | Note |
|---|---|---|
| Auto Add-On tab present on BOTH sites with identical 5 items (Encore Music, Wireless Presenter, Express Content Design Session, Wordly, Labor) | **parity** | feature carried forward; no regression, no intentional-UX divergence in the item set |
| New-site testids `location-settings-checkbox-auto-add-on-{isDefault}_{name}`; old-site uses `name=`/`id=` (zero testid) | **intentional-UX-change** (framework migration) | expected per LR-ENC-001 zero-selector-parity; not a bug |
| New-site item list loads via `GET /navigator/api/core/auto-addon-types?countryId=1` (country-scoped) | **parity-with-trigger-divergence** | corroborates user-fact #1 (5 items, country-driven not location-driven); old site presumed country-scoped too (not API-traced) |

**No regression-from-baseline identified.** No `/encore-questions` escalation needed — no genuine divergence question emerged (item-list parity + user-fact #1 already settle TC-016's correction).

## 5. Provenance

- User-fact (Rutvik 2026-06-11): "The Auto Add-On item list is exactly 5 for every location checked; it does not mutate per location." → Corroborated by (a) nav2 item-list parity above, (b) the new-site country-scoped loader endpoint. The list is **country-scoped** (constant within a country), which is consistent with "5 for every [US] location."
