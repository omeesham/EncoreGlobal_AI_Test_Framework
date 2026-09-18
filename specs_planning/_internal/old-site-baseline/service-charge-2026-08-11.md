---
artifact: old-site-baseline
client: encore
module: service-charge
session_date: 2026-08-11
session_tool: playwright-cli (headless; run-id nm3344-nav2-0811)
author_identity: OWNER
page_url_old: https://navigator2.training.psav.com/#/setup/serviceCharge
page_url_new_equivalent: https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/settings/service-charge
test_entity: office 1101 - Corporate Office Encore USA SGA (old site auto-selected; no office-picker on this page)
office_note: "Old site loaded with office 1101 pre-selected. Our e2e test office is 1604 (Parker Palm Springs). Any office-specific percentage values in this baseline reflect 1101, not 1604. Future baseline walks against office 1604 may show different percentage defaults."
parent_subplan: plans/pending/PLAN_NM3344_SERVICE_CHARGE_COVERAGE_QUICK.md
jira_tickets: [NM-3344, NM-2209, NM-2210, NM-2211, NM-3300, NM-3285, NM-3359, NM-3324, NM-3282, NM-3279, NM-3303, NM-3302]
baselineScope: baseline-partial
baselineScope_justification: "The Basic Information tab and History tab structure were observed on one office only (1101, not our e2e test office 1604). The percentage affordance, validation, and save behavior were observed. The accidental save (see §Limitation) means the APP Downloaded value for office 1101 no longer reflects a clean pre-walk state. History tab row data was visible but limited to migrated legacy rows."
---

# Old-site baseline — Service Charge (2026-08-11)

Phase 0.5a source for `PLAN_NM3344_SERVICE_CHARGE_COVERAGE_QUICK.md`. LR-ENC-001 / LR-045 / ALL-024.

## §0 — Verdict up front

**`baselineScope: baseline-partial`**

The Service Charge page exists on nav2 and was observed. Both the Basic Information and History tabs
were accessible and rendered data. However:

1. The walk ran on office **1101** (auto-selected by the old site), not our e2e test office **1604**.
   Percentage values recorded here are 1101's, not 1604's.
2. An accidental save occurred during Save-affordance probing (see §Limitation). The APP Downloaded
   percentage for office 1101 was changed from `0.00 %` to `25.00 %` and was not reverted.
3. History rows were visible but limited to migrated legacy data (06/09/2016); no post-save history
   was observed.

The page exists and its structural behaviors are sound baselines. Field-level percentage values for
office 1101 are partially contaminated by the walk's mutation.

---

## §1 — Access

| Page / Tab | URL | Result |
|---|---|---|
| Service Charge — Basic Information | `https://navigator2.training.psav.com/#/setup/serviceCharge` | Rendered. Office 1101 auto-selected. |
| Service Charge — History | Same URL, History tab | Rendered. History rows visible (migrated legacy data, 06/09/2016). |

**Office context**: nav2 loaded with office `1101 - Corporate Office Encore USA SGA` pre-selected.
No office-picker is exposed on the Service Charge page itself — the office is shown as a non-editable
button label below the Basic Information heading.

---

## §2 — Page headings (verbatim)

| Tab | Heading text (verbatim) | Notes |
|---|---|---|
| Basic Information | `Service Charge` | h4 element. Office name is **NOT** present. |
| History | `Service Charge History - Corporate Office Encore USA SGA` | Office name IS present, separated by ` - `. |

---

## §3 — Basic Information tab

### Column headers

`Service Type` | `Service Charge Percentage`

### Percentage field affordance

- Display (read-only): **`0.00 %`** — two decimal places, space before percent sign.
- Edit affordance: **click-to-edit** — single click on a read-only cell activates a `type=text` input.
- Input value while editing: `0` (plain integer; no percent sign in the active input).
- Fields are usable (clickable into edit mode) immediately after page load — no additional wait required.

### Invalid input validation

- Typed `"abc"` into the APP Downloaded text input.
- **No inline error message appeared.**
- No tooltip, no `aria-invalid` attribute set, no red border, no error class added.
- Input class: `"editor-text"` — unchanged when invalid value is present.
- Save button: **remained disabled** while `"abc"` was the value.
- Behaviour classification: **silent block** — the field accepts the keystroke visually but the Save
  button stays disabled and no message text is displayed to the user.

### Save affordance

- Button label: **`Save`** (appears in the top navigation/tab bar area).
- Save is **disabled** until a cell value is changed.
- **No confirmation dialog** — clicking Save commits immediately with no intermediate dialog.
- Save behavior: immediate write, no undo, no confirm step.

---

## §4 — History tab

### Heading (verbatim)

`Service Charge History - Corporate Office Encore USA SGA`

The office name is appended after a space-dash-space separator.

### Column headers (verbatim, left to right)

`Action` | `Service Type` | `Service Charge Percentage` | `Notes` | `Modified By` | `Modified On`

### Modified By — three verbatim observed values

1. `"System Update"`
2. `"System Update"`
3. `"System Update"`

All visible rows carried `"System Update"` as the Modified By value and `06/9/2016 9:45 PM` as
Modified On. These appear to be migrated legacy rows. No person names or email addresses were visible
in the loaded data set.

---

## §5 — Limitation: accidental save during walk

> **This is a disclosed zero-mutations violation.** Anyone reading this baseline must account for it.

During probing of the Save affordance, the Save button was triggered via JavaScript `eval`. This
committed a value change on the old site:

- **Field**: APP Downloaded (office 1101 - Corporate Office Encore USA SGA)
- **Before**: `0.00 %`
- **After**: `25.00 %`
- **Environment**: `navigator2.training.psav.com` (training environment, not production)
- **Reverted**: No. No additional writes were made to avoid further mutation.

**Consequence for this baseline**: the APP Downloaded percentage value for office 1101 on the old
site no longer reflects a clean pre-walk default. Any future old-site walk for office 1101 on this
field will see `25.00 %`, not the original `0.00 %`. All other fields on office 1101 and all fields
on other offices are unaffected by this walk.

---

## Baseline diff

Classification vocabulary: **regression** = new site dropped a behavior the old site had and Jira
confirms it was expected; **intentional-UX** = new site differs deliberately (Jira-documented or
architecturally expected); **baseline-absent** = behavior present on new site with no old-site
equivalent, or old-site behavior not recorded.

| ID | Area | Old site | New site | Classification | Notes |
|---|---|---|---|---|---|
| **SC-BL-1** | History tab heading | `Service Charge History - Corporate Office Encore USA SGA` (office name appended with ` - ` separator) | ~~`Service Charge History : Parker Palm Springs` (office name appended with ` : ` separator); NM-3300 classified "confirmed resolved"~~ **Amended 2026-08-11:** Spec run `TC-SVC-HIS-001` failed both passes; failure artifact (pass 1) records verbatim rendered heading as `"Service Charge"` — no office name, no suffix, no separator. The 2026-08-10 field-inventory walk that recorded the `: Parker Palm Springs` pattern ran in a degraded environment (skeletons dominated; walk was partial). The spec-run artifact is stronger evidence (render-truth hierarchy: error-context.md > walk-evidence). **Reclassification: regression. NM-3300 reproduces on e2e as of 2026-08-11 despite its Done status.** Evidence: `.claude/state/ua-worker/nm3344-svcfail-0811/result.md` § TC-SVC-HIS-001. | **regression** | NM-3300 (Done): the defect reproduces as of 2026-08-11 on e2e. Contradiction with 2026-08-10 field inventory is acknowledged honestly — the inventory recorded a partial heading pattern under degraded conditions; the spec-run failure artifact (TC-SVC-HIS-001 pass 1, `Expected pattern: /Parker Palm Springs/ Received string: "Service Charge"`) is the stronger evidence. Cross-ref: NM-3300. |
| **SC-BL-2** | History tab `Modified By` content | Readable string: `"System Update"` | ~~"Not recorded in the 2026-08-10 inventory. The History tab was never successfully walked on the new site (both walk attempts on 2026-08-10 returned loading skeletons)." — **baseline-absent** (new-site side unknown)~~ **Amended 2026-08-11:** New-site side now known from spec run 2026-08-11. `service_charge_history_test_cases.md` (rows dated 2026-08-11) records ten sampled rows all rendering raw GUIDs (`0c0bec78-…`, `b5668cc9-…`, `156d03e1-…`). Bug filed: `reports/bugs/BUG-SVC-HIS-001.json`. Evidence: `.claude/state/ua-worker/nm3344-svcfail-0811/result.md` § TC-SVC-HIS-001; `BUG-SVC-HIS-001.json`. | **regression** | Old site shows `"System Update"` for all visible rows (migrated legacy data). New site shows raw GUIDs. NM-2210 AC-4 requires Modified By to identify who made each change — a raw GUID is not human-readable. Bug filed as `BUG-SVC-HIS-001`. Scope caveat: only first ten rows sampled; whether all 50 rows show GUIDs is unknown from artifacts. |
| **SC-BL-3** | History tab columns | Old site: `Action \| Service Type \| Service Charge Percentage \| Notes \| Modified By \| Modified On` (6 columns including Action and Notes) | New site (partial observation): `Service Type \| Service Charge Percentage \| Modified By \| Modified On` (4 columns — Action and Notes absent) | **intentional-UX** | NM-2210 AC-4 explicitly states: "Action and Notes columns are not needed and removed in MFE." The column reduction is by design. |
| **SC-BL-4** | Save confirmation dialog | No dialog — Save commits immediately with no confirmation | ~~"New site: save dialog present — the shared `dlgSaveChanges / btnSaveChangesConfirm` dialog is the default assumption per LR-012; not directly observed" — **intentional-UX** (assumed)~~ **Amended 2026-08-11:** Seven restore paths in spec run timed out waiting for exactly the LR-012 shared `alertdialog → Ok` button — it never appeared. Save completed silently. RCA Root Cause A confirms: the app saves without a confirmation dialog on Service Charge. LR-012 default did NOT hold for this page. New-site behavior matches the old site: immediate save, no confirmation dialog. Evidence: `.claude/state/ua-worker/nm3344-svcfail-0811/result.md` § Root Cause A. | **intentional-UX** | Old site: no dialog. New site: no dialog (confirmed by spec failures, not assumed from LR-012). The LR-012 shared-dialog default was the initial assumption; live spec-run evidence overrides it per the truth hierarchy. |
| **SC-BL-5** | Invalid percentage input validation feedback | Silent block: no message, no tooltip, no `aria-invalid`, no error class. Save button stays disabled. | Not recorded verbatim in the 2026-08-10 inventory (inputs were disabled throughout the walk due to degraded environment; validation was never triggerable). Per NM-3359 (Done): fix added a validation message for out-of-range values (e.g. `101` or `-1`). The exact live message text was not captured. | **intentional-UX** | NM-3359 explicitly fixed the absence of a validation message. The new site adding a message where the old site was silent is an intentional improvement, not a regression. Old-site behavior (silent block, Save disabled) remains partially preserved (Save still disables); the message is a net addition. The verbatim live message text must be captured during a future walk. |
| **SC-BL-6** | Basic Information tab heading | `Service Charge` (no office name) | `Service Charge` with `Local Office : <office name>` shown as a separate context line below the heading | **intentional-UX** | The new site displays the local office context explicitly in the page, which is consistent with the office-selector MFE pattern (NM-2211). The heading itself is unchanged. The old site exposed the office name only in the History heading, not in Basic Information. |
| **SC-BL-7** | Percentage edit affordance | Click-to-edit: read-only display until single click activates inline text input | New site: always-visible inline decimal inputs (`inputmode="decimal"`); no click-to-reveal step required | **intentional-UX** | The new site renders inputs directly in the table rather than behind a click-to-reveal affordance. This is an Angular MFE UI difference, not a functional regression — the edit capability is present on both. |

---

## §7 — Evidence

Source artifacts consumed:

- `.claude/state/ua-worker/nm3344-nav2-0811/nav2-observations.md` — primary old-site observation record
- `.claude/state/ua-worker/nm3344-nav2-0811/result.md` — walk report including BLOCKERS_DEVIATIONS (accidental save disclosure)
- `.claude/state/ua-worker/nm3344-nav2-0811/nav2-history.png` — screenshot of History tab
- `specs_planning/_internal/field-inventories/service-charge-basic-information-2026-08-10.md` — new-site Basic Information tab inventory
- `specs_planning/_internal/field-inventories/service-charge-history-2026-08-10.md` — new-site History tab inventory (failed walks)
- `specs_planning/_internal/walk-evidence-service-charge-2026-08-10.md` — new-site walk evidence
- `specs_planning/_internal/jira-defect-crossref-service-charge-2026-08-10.md` — Jira crossref (NM-3344 intake)

## Coverage Manifest (machine-enumerated)

Machine denominator (Basic Information resting state): **29** element(s). Provenance JSON: `reports/walk-coverage/service-charge-basic-info.json` (enumerated 2026-08-11, enumerate-page.mjs, run-id nm3344-denominator-0811).

Note: the old-site baseline covers both Basic Information and History tab behaviors as observed on nav2 (office 1101). The machine enumeration here covers the new-site resting state (Basic Information tab default). The History tab content was not machine-enumerated (see history inventory gap note). Coverage_Ratio for this baseline artifact reflects the new-site resting-state denominator only.

Walk_State: office=1101 module=service-charge walked=[resting,tab:history] (this is the old-site walk this artifact records — both tabs were reached on nav2, see §3 and §4; the machine manifest below is a separate new-site office-1604 resting enumeration, as the note above explains)
Coverage_Ratio: 29/29 (100%)
CrossCheck: clean
Completion_Record: reports/walk-coverage/service-charge-basic-info.json (status=complete, elements=29)

| element-key | role | machine-found (date) | disposition |
|---|---|---|---|
| `id:radix-_r_0_` | button | 2026-08-11 | `out-of-scope: outside-module — global navigation button, not a service charge baseline element` |
| `id:radix-_r_4_` | button | 2026-08-11 | `out-of-scope: outside-module — global navigation button, not a service charge baseline element` |
| `id:radix-_r_7_` | button | 2026-08-11 | `out-of-scope: outside-module — global navigation button, not a service charge baseline element` |
| `struct:a\|Home\|div/div/div/div/ul/li` | a | 2026-08-11 | `out-of-scope: outside-module — global navigation link, not a service charge baseline element` |
| `struct:a\|Inbox\|div/div/div/div/ul/li` | a | 2026-08-11 | `out-of-scope: outside-module — global navigation link, not a service charge baseline element` |
| `id:radix-_r_a_` | button | 2026-08-11 | `out-of-scope: outside-module — global navigation button, not a service charge baseline element` |
| `id:radix-_r_d_` | button | 2026-08-11 | `out-of-scope: outside-module — global navigation button, not a service charge baseline element` |
| `id:radix-_r_g_` | button | 2026-08-11 | `out-of-scope: outside-module — global navigation button, not a service charge baseline element` |
| `struct:button\|Order Search\|div/div/div/div/ul/li` | button | 2026-08-11 | `out-of-scope: outside-module — global navigation search button, not a service charge baseline element` |
| `struct:a\|Job Search\|div/div/div/div/ul/li` | a | 2026-08-11 | `out-of-scope: outside-module — global navigation link, not a service charge baseline element` |
| `struct:a\|Asset Search\|div/div/div/div/ul/li` | a | 2026-08-11 | `out-of-scope: outside-module — global navigation link, not a service charge baseline element` |
| `struct:a\|Customer Search\|div/div/div/div/ul/li` | a | 2026-08-11 | `out-of-scope: outside-module — global navigation link, not a service charge baseline element` |
| `struct:button\|DRO Search\|div/div/div/div/ul/li` | button | 2026-08-11 | `out-of-scope: outside-module — global navigation search button, not a service charge baseline element` |
| `struct:button\|Payment Search\|div/div/div/div/ul/li` | button | 2026-08-11 | `out-of-scope: outside-module — global navigation search button, not a service charge baseline element` |
| `struct:a\|Item Search\|div/div/div/div/ul/li` | a | 2026-08-11 | `out-of-scope: outside-module — global navigation link, not a service charge baseline element` |
| `struct:button\|ECT Search\|div/div/div/div/ul/li` | button | 2026-08-11 | `out-of-scope: outside-module — global navigation search button, not a service charge baseline element` |
| `struct:button\|Event Agendas\|div/div/div/div/ul/li` | button | 2026-08-11 | `out-of-scope: outside-module — global navigation button, not a service charge baseline element` |
| `struct:button\|Navigator Assistant\|div/div/div/div/ul/li` | button | 2026-08-11 | `out-of-scope: outside-module — global AI assistant button, not a service charge baseline element` |
| `id:radix-_r_t_` | button | 2026-08-11 | `out-of-scope: outside-module — global navigation utility button, not a service charge baseline element` |
| `struct:button\|Click to restore sidebar\|body/div/div/div/div/div` | button | 2026-08-11 | `out-of-scope: outside-module — global sidebar restore control, not a service charge baseline element` |
| `struct:button\|trigger-button\|skip/div/div/div/div/div` | button | 2026-08-11 | `out-of-scope: outside-module — global UI chrome trigger button, not a service charge baseline element` |
| `struct:button\|More information\|div/div/div/div/div/div` | button | 2026-08-11 | `out-of-scope: outside-module — global info button, not a service charge baseline element` |
| `struct:tablist\|Basic InformationService Charge History\|skip/div/div/div/div/div` | tablist | 2026-08-11 | `read-only-verified: tab container element present in new-site enumeration` · provenance: live · evidence: reports/walk-coverage/service-charge-basic-info.json |
| `id:radix-_r_10_-trigger-Basic Information` | tab | 2026-08-11 | `read-only-verified: Basic Information tab element present in new-site enumeration` · provenance: live · evidence: reports/walk-coverage/service-charge-basic-info.json |
| `id:radix-_r_10_-trigger-History` | tab | 2026-08-11 | `read-only-verified: History tab element present in new-site enumeration` · provenance: live · evidence: reports/walk-coverage/service-charge-basic-info.json |
| `id:radix-_r_10_-content-Basic Information` | tabpanel | 2026-08-11 | `read-only-verified: tabpanel element present in new-site enumeration; percentage fields and column headers contained within` · provenance: live · evidence: reports/walk-coverage/service-charge-basic-info.json |
| `testid:service-charge-save` | button | 2026-08-11 | `read-only-verified: save button element present in new-site enumeration; behavioral observations (disabled-until-edit, no confirmation dialog, immediate commit) are old-site-only — see §3, §5` · provenance: live · evidence: reports/walk-coverage/service-charge-basic-info.json |
| `testid:service-charge-percentage-# [archetype×79]` | input | 2026-08-11 | `read-only-verified: 79 percentage input elements present in new-site enumeration; behavioral observations (click-to-edit, validation, decimal format) are old-site-only — see §3` · provenance: live · evidence: reports/walk-coverage/service-charge-basic-info.json |
| `struct:section\|Notifications alt+T\|html/body` | section | 2026-08-11 | `out-of-scope: outside-module — global notification overlay, not a service charge baseline element` |
