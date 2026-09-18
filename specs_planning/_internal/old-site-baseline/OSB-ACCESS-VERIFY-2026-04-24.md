---
artifact: OSB-ACCESS-VERIFY
client: encore
session_date: 2026-04-24
session_tool: Claude in Chrome (LR-038 — exploratory + auth-heavy SSO + user at machine)
session_fallback: none (CiC did not require fallback)
author_identity: OWNER
page_url_old: https://navigator2.training.psav.com/#/setup/locationdetail/1604
page_url_new_equivalent: https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/settings/location (Location Settings) + .../settings/local-office (Local Office Settings — no old-site equivalent)
test_entity: office 1604 "The Parker Palm Springs"
parent_subplan: plans/pending/SUBPLAN_OSB_01_ACCESS_VERIFY_AND_ROAM.md
parent_plan: plans/pending/PLAN_OLD_SITE_TRUTH_BASELINE.md
---

# Old-Site Baseline — Access Verify + Oracle Bundle (2026-04-24)

First-ever baseline artifact for Encore pipeline. Executed per SP-OSB-01. Output drives SP-OSB-02 + SP-OSB-03 go/no-go.

## §1 Access (Q1 of parent plan)

**Verdict: GREEN**. Old site fully accessible with zero manual auth.

| Check | Result |
|---|---|
| URL navigated | `https://navigator2.training.psav.com/#/setup/locationdetail/1604` |
| Auth flow | Live Chrome session (CiC) inherited the user's Microsoft SSO cookies — NO re-login required. Confirms LR-038 claim that CiC + auth-heavy apps is the right pairing. |
| Page title | "Navigator Order Entry 2026.03.12.978.1" |
| Office 1604 loaded | YES — shown as "The Parker Palm Springs", Active=checked, GL Service Divisions="Venue Operations", Region="Palm Springs" |
| Network errors | None observed. Post-load fetch interceptor installed (`window.__osbFetch`). |
| Time to interactive | ~15s (SSO redirect + first paint) |

**Implication for parent plan R2 (creds risk)**: resolved. Same creds work on old site.

---

## §2 Selector Parity (Q2 of parent plan)

**Verdict: YELLOW** — old site has **zero** data-testid attributes. Selectors cannot be mechanically reused.

| Probe | Count on old site |
|---|---|
| `document.querySelectorAll('[data-testid]').length` | **0** |
| `location-settings-btn-save` | 0 |
| `location-settings-modal-save-changes` | 0 |
| `dlgSaveChanges` | 0 |
| `btnSaveChangesConfirm` | 0 |
| `chkEnableMultidayPricing` | 0 |
| `drpMerchantCurrency` | 0 |

**What old site uses instead**: `name` attributes + element `id`s. Sample: `input[name="OracleProductCode"]`, `input[name="OracleDeptCode"]`, `input[name="IsAdministrativeFee"]`, `#SkipBillingId`, `#ldwid`, `#CAL_LDW_ID`, `#SC_ID`, `#AdminFeeId`, `#AllowTickCalcId`, `#SetStrikeMinEn`, `#AllowDPCDID`, `#PromptForApproval`, `#WarehouseBilling`, `#HRIRemitTaxId`, `#RemitTax2Id`.

**Framework fingerprint**: Angular Reactive Forms (uses `formcontrolname=` on inputs) + PrimeNG (`p-element` class prefixes, `role="columnheader"` markup) + Bootstrap 3 (Glyphicon font icons).

**Implication for parent plan R1 (parity risk)**: NOT a blocker for the workflow rule — parent plan states "tests still run against new site; old site = observation source only". SP-OSB-03 retrofit wording should be "visit + observe on old site" (not "reuse selectors"). The workflow rule stands.

---

## §3 Tab Roam + Architectural Divergence (Q5 of parent plan)

**MAJOR divergence**: old site has ONE page with embedded tabs; new site has TWO pages at different URLs.

### Old site structure (one URL)

Top-level tabs at `/setup/locationdetail/1604`:
- **Basic Information** (default active) — panel contains Office identity fields (Local Office Name, Active, Live Date, Tax Mode, GL Service Divisions, Country, Region, etc.) AND sub-tabs: Local Information · Currency · Pricing · Account And Address · Legal · Notes · Shared Setup Locations · Auto Add-On
- **Location Management History** — the 87-column audit trail

### New site structure (two URLs)

- `/settings/location` → Location Settings page with: Local Information · Currency · Pricing · Legal · Account and Address · Notes · Shared Setup Locations · Auto Add-On · Location Management History
- `/settings/local-office` → **SEPARATE Local Office Settings page** with: Basic Information · ECT Settings · Local Information · Local Office History (42-col)

### Tabs / features ABSENT on old site

- **ECT Settings** (entire tab doesn't exist)
- **Local Office Settings** (the separate `/settings/local-office` page doesn't exist — its Basic Info content is inline in the old site's main Basic Information panel)
- **Enable Multiday Pricing** toggle on Local Information (0 matches in DOM for "multiday"/"multi-day")

### Tabs / features PRESENT on both sites

All other Location Settings tabs: Local Information, Currency, Pricing, Account And Address, Legal, Notes, Shared Setup Locations, Auto Add-On, Location Management History.

### Old-site Local Information tab — visible fields (for baseline comparison)

Scrollable column of checkboxes + percent inputs + billing type/cycle + oracle codes. Captured from DOM label scan:

Apply LDW / LDW Percentage · Calculate LDW on Net Amount · Apply Cables and Consumables Fee / C&C Percentage · Calculate CAC on Net Amount · Allow ETS / ETS Percent · Service Charge · Show Service Charge As Administrative Fee · Calculate Service Charge On Net Amount · Allow Resort Tax / Resort Tax Percentage · Ticker Calc · Set/Strike/Support Labor Billing Goal · Enable Set/Strike Labor Minutes · Apply Set/Strike Labor Minutes · Internet Asset Reservation · Allow DPCD · Exclude Implied Discount · Prompt for Approval · Threshold · Credit Memo Approval Required · Enable Discount Reason · Use eSignature · Billing Type (Master/Direct) · Billing Way (Event/Daily) · Billing Cycle · Warehouse Billing · Oracle Product Code · Oracle Department Code · + more below fold.

**No "Enable Multiday Pricing" field visible.** Search via JS returned 0 matches on the entire page DOM for /multiday|multi-day|multi day/i.

---

## §4 Oracle Bundle — verdicts per LR-044

### BUG-HIS-001 (Enable Multiday Pricing audit-trail gap)

**Verdict: NOT_APPLICABLE_ON_BASELINE — symptom reproduces but is NOT a new-site regression.**

- **Feature existence on old site**: ABSENT. The "Enable Multiday Pricing" toggle does NOT exist on old-site Local Information tab.
- **Audit coverage on old site LM History (87 cols)**: ABSENT. No column named "Multiday", "MultidayPricing", or similar in old-site's 87-col schema.
- **Conclusion**: The field is a new-site addition. New site ADDED the toggle but did NOT add audit coverage for it. The "audit-trail gap" is consistent with old site's pattern of selective audit coverage (many modern fields have no history column on either site — see §5). This is NOT a regression; it's a design consistency.
- **Unblocks**: 11+ HIST-pivot subplans (SP-D1..SP-D10, SP-B-LM-3a/3b/4..9) that were deferred pending a "bug vs feature" decision. **Decision: tests should assert "phantom not tracked" for EnableMultidayPricing — it's never been in the audit trail.**
- **RCA_category**: ENVIRONMENTAL (new feature added post-baseline).

### BUG-HIS-002 (Merchant Currency audit-trail gap)

**Verdict: NOT_APPLICABLE_ON_BASELINE — symptom reproduces but is NOT a new-site regression.**

- **Column existence on old site LM History**: the 87-col schema has TWO columns named "Currency" (col 6 = location currency, col 64 = pricing currency, immediately adjacent to Pricing Strategy + Pricing Action — matches SP1 §1 + §11 + GEN-042 duplicate-header rule). **No "Merchant Currency" column.**
- **Write-path not executed**: selector-parity on Currency tab was not performed this session (would require reusing/rebuilding old-site locators; low ROI given schema already shows column absence).
- **Conclusion**: Same pattern as BUG-HIS-001. Merchant Currency audit coverage is absent on BOTH sites. Not a regression.
- **Unblocks**: same 11+ HIST subplans. **Decision: tests should assert "phantom not tracked" for merchant currency.**
- **RCA_category**: ENVIRONMENTAL.

### BUG-LOC-ECT-001 (ECT Benefits Multiplier silent write-failure)

**Verdict: INCONCLUSIVE — feature absent on baseline.**

- **Feature existence on old site**: ABSENT. Old site has no ECT Settings tab and no `/settings/local-office` URL. Benefits Multiplier control doesn't exist.
- **Conclusion**: cannot oracle on baseline. Bug status remains `open` as a new-site-only finding. Triage requires server-side log inspection per bug's `deferredChecks` — not something baseline oracle can resolve.
- **RCA_category**: N/A (feature absent on baseline).
- **Recommendation**: file with Encore team directly; `/encore-questions` is appropriate channel per parent plan workflow.

### BUG-LI-001 (Oracle fields — no client-side required indicator + silent save no-op)

**Verdict: PARTIALLY CONFIRMED AS NEW-SITE REGRESSION** 🎯

**Old-site behavior observed** (setup: SkipBilling unchecked, Oracle Product Code starts at "0000", Save button disabled + pristine):

| Step | Old-site result | New-site claim (per bug report) |
|---|---|---|
| Read Oracle Product Code attributes | `required=true` (native HTML5), `aria-required=null`, classes `ng-untouched ng-pristine ng-valid` | `aria-required=null` in both SkipBilling states |
| Clear Oracle Product Code (native setter + input/change/blur events) | Input class → `ng-dirty ng-invalid ng-touched`. Entire form → `ng-dirty ng-invalid`. | — |
| **Save button state with invalid form** | **DISABLED** (`button.disabled=true`) — **form validity gate works correctly** | **ENABLED** — form validity NOT gating the button |
| Restore Oracle Product Code to "0000" | Input → `ng-dirty ng-touched ng-valid`. Save button → enabled. (LR-026 "revert doesn't re-disable" pattern present on BOTH sites.) | Same (LR-026 confirmed shared pattern) |
| Click Save (with valid form) | **"Save Changes" dialog appears** — body: "Are you sure you want to save this view?" Buttons: Cancel / **OK** | New site dialog exists (`dlgSaveChanges`) — button text "Save" (not "OK") |
| Cancel dialog → reload | Clean restore, Save button disabled, OracleProductCode="0000" (server untouched). | — |

**Findings**:
1. **NEW-SITE REGRESSION CONFIRMED**: the "silent save no-op" symptom happens on new site because the Save button is NOT wired to form validity. Old site correctly keeps Save disabled when form is invalid — user physically cannot click it. This is a clear regression in the save-button-wiring.
2. **NOT A REGRESSION**: the `aria-required=null` / `aria-invalid=null` gap is present on BOTH sites. Angular Reactive Forms don't set aria by default; both sites inherit this a11y gap. Flag as a separate discussion-item for future a11y work, not a new-site-only bug.
3. **Shared pattern**: the "Save Changes" confirmation dialog exists on BOTH sites. Old-site button is "OK", new-site is "Save" — cosmetic difference.

**RCA_category**: n/a (confirmed as true new-site-introduced regression for the primary symptom).

**Recommendation for bug JSON**: `status` stays `open`; append verificationLog entry below. Consider splitting the bug into (a) primary: save-button-not-gated-by-form-validity → new-site regression, fixable; (b) secondary: a11y aria gap → pre-existing, scope of future a11y pass.

---

## §5 Schema Comparison (LR-036 extension + audit-trail pattern)

### Old-site Location Management History — all 87 columns

1 Local Office | 2 Local Office Name | 3 Active | 4 Live Date | 5 Country | 6 Currency | 7 Tax Mode | 8 Region | 9 Servicing Branch Office | 10 Pay To Address | 11 Union | 12 Corporate Pricing | 13 Billing Type | 14 Billing Cycle | 15 Billing Way | 16 Billing Way Active | 17 Labor Pricing | 18 Equip. Pricing | 19 Internal Equip. Pricing | 20 Production Labor Pricing | 21 Production Equip. Pricing | 22 Allow DPCD | 23 Exclude Implied Discount | 24 Prompt for Approval | 25 Threshold | 26 Apply LDW | 27 LDW Percentage | 28 Calculate LDW on Net Amount | 29 ETS | 30 ETS Percent | 31 Service Charge | 32 Show Service Charge As Administrative Fee | 33 Calculate Service Charge On Net Amount | 34 Service Charge Name | 35 Apply Cables and Consumables Fee | 36 C&C Percentage | 37 Calculate CAC on Net Amount | 38 Terms and Conditions | 39 Allow Ticker Calc | 40 Set/Strike/Support Labor Billing Goal | 41 Enable Set/Strike Labor Minutes | 42 Apply Set/Strike Labor Minutes | 43 Credit Memo Approval Required | 44 Display Tax | 45 Company Remit Tax / GST/HST / VAT Tax | 46 Remit PST Tax | 47 Comm Receiver | 48 Enable IDC Billing | 49 Skip Billing | 50 Show SubRental | 51 Inventory Only | 52 Intercompany | 53 Calculate Commission Tax | 54 Can Create External Customer Link | 55 Venue/Branch Account Name | 56 Venue/Branch Account Phone1 | 57 Venue/Branch Account Phone2 | 58 Master Bill To Address Name | 59 Action of Shared Setup Location | 60 Shared Setup Location ID | 61 Shared Setup Location Name | 62 Include Service Charge in Price Guides | 63 Pricing Strategy | 64 Currency | 65 Pricing Action | 66 Is Alternate | 67 Use Effective Dates | 68 Start Date | 69 End Date | 70 Notes | 71 Modified By | 72 Modified On | 73 Oracle Product Code | 74 Oracle Department Code | 75 Oracle Organization | 76 Allow Resort Tax | 77 Resort Tax Percentage | 78 Discount Reason | 79 Offsite Event Location | 80 Use eSignature | 81 Separate Master Bill Commission Invoice | 82 Enable Product Group | 83 Allow Production Quote | 84 Enable Job Costing | 85 Enable Discount Guidance | 86 Internet Asset Reservation | 87 Warehouse Billing

Total items: **1,146 history rows for office 1604**.

### Old vs new (87 cols each)

- **Column count**: identical — 87 on both.
- **Header names**: near-identical (spot-checked). Col 6 + col 64 duplicate "Currency" — matches SP1 §1 + GEN-042 finding for new site. Col 66 "Is Alternate" (not "Is Alternative") — matches PLN-020 finding for new site.
- **Boolean render format** (LR-036 extension):
  - **Old site LM History** (this session): `<span class="glyphicon glyphicon-ok d-inline-block">` — Bootstrap 3 Glyphicon font icon. `textContent` returns empty for TRUE cells.
  - **New site LM History** (per LR-036): Unicode `✔` — `textContent` returns "✔".
  - **New site LOS History** (per LR-036): SVG `<svg class="lucide lucide-check">` — `textContent` empty for both TRUE + FALSE, innerHTML distinguishes.
  - **Implication**: three render formats total. LR-036 helper logic must add Glyphicon case if we ever programmatically read old-site LM tables (not planned — old site is observation-only).

### Audit-trail pattern (the key oracle finding)

Old-site LM History has **no column** for: EnableMultidayPricing · Merchant Currency · Benefits Multiplier · Historical Subrental · Labor Cost (internal/external). **These fields are untracked on both sites.**

This is a **design pattern**, not a regression: the 87-col schema was fixed early and new fields added to the Location Settings UI don't get audit-trail coverage unless explicitly extended. SP1 §8 suspected this; old-site oracle confirms.

---

## §6 Verdict + Q&A + Scope Flags for SP-OSB-03

### Overall verdict: **GREEN**

All gates passed:
- Auth works (§1 GREEN)
- Structural walk completed across all visible tabs + LM History schema
- 4/4 oracle verdicts rendered with DOM + structural evidence
- No HALT conditions encountered

### Scope flags for SP-OSB-03

- **[FLAG-01] Retrofit wording**: old site has zero selector parity. Retrofit bullet must say **"visit + observe on old site"**, NOT "reuse selectors on old site" or "navigate to the corresponding page on old site" (the CORRESPONDING page often doesn't exist at the same URL path). Proposed wording: *"Before authoring TC, open the corresponding module on https://navigator2.training.psav.com/#/setup/locationdetail/1604 (old UI, tabs embedded in one URL — NOT a 1:1 path match with new site). Observe baseline behavior — selectors on old site use `name=`/`id=`, not `data-testid`. Record behavior in `old-site-baseline/<module>-<date>.md`."*
- **[FLAG-02] Features absent on baseline**: any retrofit applied to subplans targeting ECT Settings, EnableMultidayPricing, or Merchant Currency is low-value (no baseline to observe). For these: retrofit bullet should say *"Baseline-absent feature — skip old-site check; confirm via Encore team via /encore-questions."*
- **[FLAG-03] Updated LR-ENC-001 wording**: include creds pointer, and note that baseline artifacts are FREE-FORM observations (not a strict field-inventory schema) because old-site DOM structure differs from new site. The existing `field-inventory-spec.md` is a starting point but baseline artifacts may deviate (see this artifact's own structure — 6 sections, not 7).
- **[FLAG-04] Add to ALL-078**: include "If feature doesn't exist on baseline → handoff to `/encore-questions` is the escalation path, not HALT."
- **[FLAG-05] 11+ HIST subplans unblocked NOW**: SP-OSB-03 retrofit can include a secondary patch to SP-D1..SP-D10 and SP-B-LM-3a/3b/4..9 Execution Summary templates: add a precomputed field for "Audit-trail assertion direction: phantom (not tracked)" based on this artifact's §4 verdicts.

### Parent plan's 6 research questions — answered

| # | Question | Answer | Evidence |
|---|---|---|---|
| Q1 | Old site accessible with current creds? | **YES** | §1 — CiC inherited SSO; page loaded as 1604 Parker Palm Springs |
| Q2 | Selectors identical? | **NO — zero testid parity** | §2 — 0 data-testids on entire old site |
| Q3 | Requirements agent exists? | YES (pre-verified) | `.github/agents/playwright-requirements.agent.md` (HUNTER); SP-OSB-02 updates it |
| Q4 | Which pending subplans unblocked today? | 11+ HIST-pivot subplans | §4 BUG-HIS-001/002 verdicts → assertion direction decided (phantom not tracked) |
| Q5 | Old site handle History / Pricing / Local Info? | Different architecture — all tabs under ONE URL; LM History has 87 cols identical to new site | §3 + §5 |
| Q6 | Need separate Playwright project for old site? | **NO** (confirmed) | Zero selector parity = zero automation viability. Old site is observation-only per parent plan's "out of scope" |

---

## Appendix — raw DOM probe results

### Sample row 0 cells (LM History, post-header row)

idx 0 "1604" · idx 1 "The Parker Palm Springs" · idx 2 "" (Active — glyphicon) · idx 3 "05/12/2007" · idx 4 "United States" · idx 5 "" (Currency — blank for this row) · idx 6 "US" · idx 7 "Palm Springs" · idx 8 "" · idx 9 "Encore" · idx 10 "" · idx 11 "" · idx 12 "Master" · idx 13 "Weekly" · idx 14 "Event" · idx 15 "05/12/2007" · idx 16 "USD: 2026-Zone 3 D" · idx 17 "USD: 2026-Tier 2 Resort B"

`Modified By` idx 70 and `Modified On` idx 71 were empty for the first 5 rows (likely initial baseline snapshots before modifications). Pagination or sort-by-Modified-On-desc would surface rows with populated Modified columns — not executed this session.

### Checkbox id inventory (first 30 on Local Information tab)

`ldwid` · `CAL_LDW_ID` · `ETS` · `SC_ID` · `AdminFeeId` (name=IsAdministrativeFee) · `SCOnNetAmtId` · `AllowRstTxId` · `AllowTickCalcId` · `SetStrikeMinEn` · `SetStrikeMinApp` · `AllowDPCDID` · `PromptForApproval` · `CM_REQ_APP` · `CheckDiscount` · `UseEsign` (disabled) · `EnableProductGroup` (disabled) · `WarehouseBilling` · `HRIRemitTaxId` · `RemitTax2Id` · `SkipBillingId` (confirmed unchecked for BUG-LI-001 precondition).

### Fetch interceptor

Installed `window.__osbFetch` with both `fetch` + `XMLHttpRequest.open/send` hooks. Total network captures this session: **0** (all observations were DOM-state reads; no save round-trips executed; dialog-triggered Save was Cancelled before OK).

---

## Session metadata

- **Session start**: 2026-04-24 (see activity-log row for timestamp)
- **Session tool**: Claude in Chrome
- **Writes to server**: **zero** — all interactions were DOM reads + one cancelled Save dialog
- **Browser tabs opened**: 1 (tabId 1279543889)
- **User was at machine**: yes (per LR-038)
- **Next subplan unblocked**: SP-OSB-02 (Requirements Agent Rewrite) + SP-OSB-03 (Structural Bundle) — both GREEN to proceed, subject to scope flags above
