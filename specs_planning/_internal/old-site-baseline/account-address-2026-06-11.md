# Old-Site Baseline — Account & Address → Master Bill To Address (Workstream B)

**Module**: account-address (Master Bill To)
**Client**: encore
**Baseline_URL**: https://navigator2.training.psav.com/#/setup/locationdetail/1604 → Account And Address tab
**MCP_Session_Date**: 2026-06-11
**MCP_Session_Tool**: Playwright CLI (`-s=e2e`, e2e→nav2 SSO bridge)
**Author_Identity**: HUNTER
**Observation-only**: YES — no Select/save on old site (LR-045).

---

## Old-site Master Bill To Address (observed)

Old-site "Account And Address" tab carries two headings:
- **Venue/Branch Account** (`heading level=3`): Name (disabled textbox) "Parker Palm Springs"; Address `4200 E Palm Canyon Dr` / PALM SPRINGS / CA / 92264 / United States; Phone 1 `760-883-1957`; Phone 2 (empty).
- **Master Bill To Address** (`heading level=3`): Address `4200 E Palm Canyon Dr` / PALM SPRINGS / CA / 92264 / United States.

Both the Venue Address and the Master Bill To Address render as **static `generic` text** (no `cursor=pointer`, no button/link) on the old site — i.e. the old site **displays** the billing address but offers **no in-place address-picker** on this view. (Per LR-ENC-001, the old "Account And Address" tab is primarily billing-config: Warehouse Billing, Enable IDC Billing, Skip Billing, Separate Master Bill Commission Invoice checkboxes.)

## Baseline diff

| Item | Old site (baseline) | New site (observed 2026-06-11) | Classification |
|---|---|---|---|
| Master Bill To Address | **static display** (no picker affordance) — 4200 E Palm Canyon Dr | **launcher** → "Select Customer Address" dialog (per-row checkbox select) → updates Master `dd`s; **selection PERSISTS** through save+reload | **baseline-partial** — new-site adds address-selection capability not surfaced on the old-site view. Not a regression; an added capability. |
| Master vs Venue persistence | n/a (no selection offered on baseline) | Master selection PERSISTS; Venue selection does NOT (ACC-027) | **baseline-absent for the persistence oracle** — measured on new site only (acceptable per LR-ENC-001/ALL-078). |

## LR-044 oracle verdict

The old site offers **no Master-side address selection** to compare against, so the new-site Master persistence behavior cannot be adjudicated against a baseline. Per LR-ENC-001, this is `baselineScope: baseline-partial` (NOT a HALT). The new-site **measured** behavior is authoritative here: **Master Bill To selection persists** (verified live, see `walk-evidence-account-address-master-bill-to-2026-06-11.md`). Because Master persists correctly, there is **no bug to file for B**. The Venue non-persist (ACC-027) remains an open question for the account-address audit, not this subplan.

## Notes

- `baselineScope: baseline-partial`. Same address data differs by environment (old-site 1604 Master = 4200 E Palm Canyon Dr; new-site 1604 Master original = 8899 Beverly Blvd Ste 412) — expected env data difference, not a divergence signal.
