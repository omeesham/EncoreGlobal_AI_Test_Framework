---
artifact: old-site-baseline
client: encore
module: service-charge-text
session_date: 2026-08-03
session_tool: playwright-cli (headless, delegated T1 workers; runs sct-nav2-0803 + sct-nav2-setup-0803)
author_identity: OWNER (HUNTER is the intended owner — see §7 governance note)
page_url_old: https://navigator2.training.psav.com/#/setup/locationdetail/1604
page_url_new_equivalent: https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/settings/service-charge-text
test_entity: office 1604 (Parker Palm Springs)
parent_subplan: plans/pending/PLAN_SERVICE_CHARGE_TEXT_AUTOMATION.md
jira_tickets: [NM-1694, NM-1728, NM-3336, NM-3126, NM-2922, NM-2924, NM-2311, NM-2188, NM-1695, NAV-4106, NAV-2228]
baselineScope: baseline-inconclusive
---

# Old-site baseline — Service Charge Text (2026-08-03)

Phase 0.5b of `PLAN_SERVICE_CHARGE_TEXT_AUTOMATION`. LR-ENC-001 / LR-045 / ALL-024.

**Observation-only.** Zero mutations on nav2: no typing, no value change, no save, no form submit,
no dialog confirm. Both probe scripts are read-only by construction (`goto` + `eval` + `snapshot` +
`screenshot` only). HARD STOP #4 held.

## §0 — Verdict up front

**`baselineScope: baseline-inconclusive`** — deliberately NOT `baseline-absent`.

The new-site surface (a 115-row multilingual service-charge-text grid) has **no observed equivalent on
nav2**. But the one route that could still hold it — the Setup area — **rendered an empty DOM**, so the
probe could not evaluate it. Recording "absent" on an empty render would be an unsound negative of
exactly the kind LR-061 forbids. See §6 for the escalation.

## §1 — Access

| Probe | URL | Result |
|---|---|---|
| n1-root | `https://navigator2.training.psav.com/#/` | redirected to `#/login/exp/`; no headings |
| n2-locationdetail | `#/setup/locationdetail/1604` | **rendered** — `TITLE: Navigator Order Entry 2026.03.12.978.1`, H3s: Currency · Venue/Branch Account · Master Bill To Address · Shared Setup Locations · Legal |
| s1-setup | `#/setup` | **`BODY_LEN: 0`, `TABLES: 0`** — nothing rendered |

Auth: nav2 SSO-bridges from the same `.auth/encore-state.json` used for e2e. Proven —
`state-load` succeeded and the Location Detail deep link rendered real content on that session.

**Access quirk worth recording**: the bare root `#/` redirects to `#/login/exp/` while a deep link on
the *same* session renders fine. A login-looking root is therefore **not** an auth failure on nav2 —
judge auth by whether a deep link renders, never by the root.

## §2 — Selector-style notes

nav2 is the legacy Angular/Bootstrap Navigator. **Zero `data-testid` attributes** (consistent with
`OSB-ACCESS-VERIFY-2026-04-24.md`). Anchors available are visible text, `name=`, `id=`, `href` and
`ng-click`. **Zero selector parity with the new site** — nothing here is reusable as a locator.

## §3 — Tab / feature inventory

**Present on baseline (Location Detail 1604)** — sections observed as H3:
Currency · Venue/Branch Account · Master Bill To Address · Shared Setup Locations · Legal.

**Service Charge on the baseline is a set of CALCULATION SETTINGS, not a text-management surface.**
Observed leaf nodes:

```
LABEL: Service Charge
LABEL: Show Service Charge As Administrative Fee
LABEL: Calculate Service Charge On Net Amount
SPAN:  Service Charge Name
```

Body context places them in a financial-settings block beside LDW on Net Amount, Cables &
Consumables Fee / C&C Percentage, Calculate CAC on Net Amount, Allow ETS / ETS Percent, Allow Resort
Tax / Resort Tax Percentage.

**Absent on baseline (present on new site)**: the multilingual grid itself. Machine check across the
rendered Location Detail body returned **`MULTILINGUAL_GRID_MARKERS: 0`** — no "Report Column", no
"Display Name", no language names (US English / English (Canada) / French (Canada) / Spanish (Mexico)).

**Could not evaluate**: a Setup → Service Charge Text page. `#/setup` returned `BODY_LEN: 0`.

## §4 — Field-level baseline

Not capturable for the target surface, because the target surface was never located on nav2. What was
observed on Location Detail is a different feature (boolean calculation flags), and capturing its
defaults would be baseline data for the *Legal / financial settings* module, not this one.

No validation text and no save-dialog text could be captured verbatim — neither was reachable without
mutating state, which HARD STOP #4 forbids on the baseline.

## §5 — Schema observations (LR-036)

No boolean-bearing table for this surface exists on the baseline, so **no per-table boolean render
format could be recorded**. LR-036 remains OPEN for the new site and must be determined per-table
during Phase A — do not assume the Unicode `✔` / SVG `lucide-check` / Glyphicon / Radix `aria-checked`
precedent from any other module.

## §6 — Divergence candidates

| ID | Class | Detail |
|---|---|---|
| **SCT-BL-1** | `BASELINE-ABSENT` (candidate) | The multilingual service-charge-text grid has no observed nav2 equivalent. **Not closed** — the Setup route rendered empty, so absence is unproven. |
| **SCT-BL-2** | `INTENTIONAL-UX-CHANGE` (candidate) | Service Charge moved from *calculation flags on Location Detail* to a *dedicated text-management page*. These are different features sharing a name; the new page is not a port of the old block. |
| **SCT-BL-3** | contradiction to resolve | Jira **NAV-4106** ("Setup->Service Charge Text - Verified") and **NAV-2228** ("report preview … on Service Charge Text page") both assert the legacy site HAD this page. Two live probes could not reach it. Either the route is gone from this training instance, or it lives behind a path the probes did not enumerate. |

**LR-057 note**: no "interactive on baseline / static on new" divergence is being closed here — none
was observed, because the surface itself was not located. That clause is not engaged.

**FCC-lens divergences** — with no baseline field set, every field family on the new site is net-new
and must be derived from live DOM + NM-1728, not from baseline parity:
- plain text ×3 (Service Charge Name, Display Name, Report Column Name) — NM-1728 §5 makes all three
  required, with **Name unique within a language**.
- dropdown/combobox ×2 archetypes (page-level language filter; per-row language trigger).
- rich text ×1 (`html-cell`, Tiptap — **not** CKEditor as NM-1728 §6 states).
- grid/list surface ×1 (115 rows) → §3 surface families apply: result-fidelity (the language filter
  filters the grid), render-state, empty-vol, persistence. pagination / sorting / combination are
  UNKNOWN pending the Phase A walk — do not mark them out-of-scope without a probe.

## §7 — Escalation + governance

**Escalation (ALL-078 / LR-040(c) c.3)**: SCT-BL-3 routes to `/encore-questions` — *"Did the legacy
Navigator expose a Setup → Service Charge Text page, and is it still reachable on the training
instance? Jira NAV-4106 says it was verified there."* Per ALL-078 this is **not** a HALT; the plan
proceeds on new-site truth.

**Governance note**: this artifact and the Jira crossref are HUNTER deliverables per
`REQUIREMENTS.md`, but the identity write-gate denies HUNTER on `jira-defect-crossref-*` (no §2 row).
Both were written under OWNER, whose unrestricted access is by design (LR-043: "§2 does not gate
OWNER"). The `old-site-baseline/*` path itself DOES have a HUNTER row. Fix tracked as **D5** in
`plans/pending/SUBPLAN_WALK_TOOLING_SILENT_GREEN.md`.

## §8 — Evidence

- `.claude/state/ua-worker/sct-nav2-0803/` — n1-root + n2-locationdetail: finalurl, headings, tabs, service-charge hunt, fields, body, AX snapshots, screenshots, sha256 manifest.
- `.claude/state/ua-worker/sct-nav2-setup-0803/` — s0-warm + s1-setup: full link dumps, service-charge link hunt, grid-marker check, AX snapshots, screenshots.
- Probe scripts (re-executable verbatim): `.claude/state/ua-worker/probes/nav2-baseline-service-charge-2026-08-03.sh`, `.claude/state/ua-worker/probes/nav2-setup-service-charge-text-2026-08-03.sh`.
