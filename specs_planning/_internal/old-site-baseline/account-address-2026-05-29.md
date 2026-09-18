---
artifact: old-site-baseline
module: account-address
client: encore
baseline_date: 2026-05-29
page_url_old: https://navigator2.training.psav.com/#/setup/locationdetail/1604
page_url_new: https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/settings/location
baselineScope: baseline-partial
author_identity: OWNER
browser_tool: Playwright CLI (@playwright/cli v0.1.8, session -s=e2e; nav2 reached via SSO bridge from the e2e Entra session — no separate nav2 login needed)
test_entity: Office 1604 (Parker Palm Springs)
parent_subplan: plans/pending/SUBPLAN_ACCOUNT_ADDRESS_FCC.md
---

# Old-Site Baseline — Account & Address — 2026-05-29

Observation-only baseline per LR-ENC-001 / `.claude/rules/baseline.md`. Walked under the SUBPLAN_ACCOUNT_ADDRESS_FCC Phase 1 **HUNTER** phase identity (umbrella session identity OWNER). Old site = **intended-behavior** truth source; new site = observed. Zero selector parity — old site uses `name=`/`id=` on a PrimeNG/Bootstrap-3 stack, regular DOM (no shadow root), so selectors are NOT reused — this is a *visit-and-observe* log only.

---

## §1 — Access + auth

- nav2 (`https://navigator2.training.psav.com/#/setup/locationdetail/1604`) loaded **GREEN** — title "Navigator Order Entry 2026.03.12.978.1", no `login.microsoftonline.com` redirect.
- Auth bridged from the e2e Entra session (`encore-state.json` storageState carried the Microsoft tenant cookie; nav2 SSO accepted it). Confirms LR-ENC-001 "shared credentials, same Microsoft SSO".
- Older Angular SPA: ~2-3s bootstrap before `document.body.innerText` populates; all top-level tabs embedded in the one hash-routed URL (matches SP-OSB-01 architectural-divergence note).

## §2 — Selector parity

ZERO (as expected per LR-ENC-001 / SP-OSB-01). Old-site location-detail uses `id=`/`name=` (`ldwid`, `OracleProductCode`, `SkipBillingId`, `BillingTypeId`, `WarehouseBilling`, …). No `data-testid` anywhere. **Observation-only — do NOT port selectors. Automation stays on the new site.**

## §3 — Tab roam: what the old-site "Account And Address" tab actually contains

Old-site location-detail embedded tabs observed: `Basic Information`, `Location Management History`, `Pay To Address`, `Local Information`, `Currency`, `Pricing`, **`Account And Address`**, `Legal`, `Notes`, `Pricing Strategy`.

Clicking the old-site **"Account And Address"** tab reveals **billing-configuration** fields, NOT the new-site venue/phone/address-picker layout:

| Old-site A&A field | id / name | Type | Live value |
|---|---|---|---|
| Billing Type (Master / Branch) | `BillingTypeId` / `BillingTypeId2` | radio | (set) |
| Billing Way (Event / Order) | `BillingWay1` / `BillingWay2` | radio | (set) |
| Billing Way Effective Date | `BillingWayEffectiveDate` | text | "05/12/2007" (disabled) |
| Warehouse Billing | `WarehouseBilling` | checkbox | — |
| Enable IDC Billing | `IDCBillingId` | checkbox | — |
| Skip Billing | `SkipBillingId` | checkbox | — |
| Separate Master Bill Commission Inv | `SepCommInvoiceId` | checkbox | — |

**No contact-phone fields and no venue-name / account-lookup / address-picker controls appear anywhere on the old-site location-detail page** (page-wide search for `phone`/`contact`/`venue name`/`branch name` inputs returned ZERO matches across the rendered DOM).

## §4 — Divergence classification (vs new-site A&A)

| New-site A&A surface | Old-site equivalent | Classification |
|---|---|---|
| Tab **name** "Account and Address" | Tab name "Account And Address" exists | label parity (same tab name) |
| Tab **content** (venue name + contact phones + account picker + bill-to address pickers) | Old A&A tab = billing-type/way config (Master/Branch, warehouse/IDC/skip billing) | **(b) intentional UX change** — the tab was re-purposed/consolidated between old and new site |
| Contact **Phone 1 / Phone 2** | absent on old-site location-detail | **(c) baseline-absent** — contact phones are not editable on the old location-detail page (live elsewhere on the old customer/account master) |
| **Account List** picker dialog (Radix, filters + State/Country dropdowns) | absent — old site has no in-location account-search dialog | **(c) baseline-absent** (new-site UX; matches the LR-ENC-001 Radix-dialog example the subplan names) |
| **Select Customer Address** picker dialog (venue + master bill-to) | absent — old site exposes addresses via separate `Pay To Address` / billing model, not an in-tab picker | **(c) baseline-absent** (new-site UX) |
| Venue billing address display (City/State/Zip/Country) | conceptually present in old-site billing/Pay-To-Address model | (b) intentional UX change (re-surfaced as read-only display on new site) |

No **(a) regression-from-baseline** divergences found — nothing the new site does *contradicts* a working old-site behavior; the divergences are reorganization (b) + net-new UX (c).

## §5 — Intended-behavior notes for the new-site editable save-cycle fields

- **Account linkage** is a real, intended location attribute (old site models it via the billing Master/Branch type + account association). The new-site Account List picker is a new UX for selecting that account. Intent: a location is linked to an account → confirmed legitimate.
- **Billing addresses** (venue / master bill-to) are real intended attributes (old site exposes them via `Pay To Address` + billing model). New site consolidates selection into the Select Customer Address dialog. Intent confirmed.
- **Contact phones** are legitimate location/account contact data; on the new site they are editable on the A&A tab (Phone 1 required, Phone 2 optional). The old site does not edit them here, so the old site offers no contradicting behavior — the new-site behavior (Phone 1 account-linked revert, documented NOT-AUTOMATABLE in TC-021) cannot be cross-checked against an old-site equivalent.
- Because the new-site A&A picker/phone surface is **baseline-absent**, the truth source for these fields' intended save/persist behavior is the **live new-site DOM** (per the truth hierarchy in `baseline.md` — old-site DOM overrides only *where both exist*; here only the new site exists).

## §6 — Conclusion

**`baselineScope: baseline-partial`.** The old-site "Account And Address" tab exists by name but is a **billing-configuration** surface; the new-site A&A editable controls (contact phones + account/address Radix picker dialogs) are **baseline-absent** (new-site UX / live on other old-site surfaces). Per LR-ENC-001 + ALL-078 this is **NOT a HALT** — it is the documented "new-site surface absent on baseline" case the subplan anticipated. No bug filed (no regression-from-baseline). No `/encore-questions` escalation required for TC authoring — the new-site live DOM is the authoritative truth source for these fields, and the existing 26 TCs + the field inventory already capture their behavior.
