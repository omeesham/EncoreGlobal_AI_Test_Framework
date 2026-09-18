# Old-Site Baseline — Left Panel (Basic Information) — Pay To launcher re-probe

**Module**: left-panel-basic-information
**Client**: encore
**Baseline_URL**: https://navigator2.training.psav.com/#/setup/locationdetail/1604
**MCP_Session_Date**: 2026-06-11
**MCP_Session_Tool**: Playwright CLI (`-s=e2e`, e2e→nav2 MS-SSO cookie bridge; silent SSO landed on app after re-goto)
**Author_Identity**: HUNTER
**Observation-only**: YES — zero selector parity (old site uses `name=`/`id=`, no data-testid). NO clicks-to-Select, NO save on old site (LR-045). Pay To affordance observed via snapshot only.
**Supersedes (for Pay To / BL-DIV-4 only)**: left-panel-basic-information-2026-06-03.md

---

## Why this refresh exists

The 2026-06-03 baseline recorded old-site Pay To Address as a "clickable label/link … (link, not a value field)" but its **BL-DIV-4 closed the new-site divergence as "(b) intentional UX change"** — i.e. assumed the new site made Pay To a static field — **without a new-site click-probe**. This refresh re-probes the affordance on BOTH sites.

## Old-site Pay To Address (observed)

```
generic [ref=e102] [cursor=pointer]: Pay To Address      ← clickable label
textbox [disabled] [ref=e104]: Encore                    ← disabled display, shows name "Encore"
```

Identical shape to the new site: a `cursor=pointer` label + a disabled display textbox showing the Pay To **name** only. The old-site Pay To Address is **interactive** (clickable), exactly as the 2026-06-03 note said.

## Baseline diff

| Item | Old site (baseline) | New site (observed 2026-06-11) | Classification |
|---|---|---|---|
| Pay To Address affordance | clickable label `[cursor=pointer]` + disabled "Encore" textbox | clickable label (React onClick) → "Pay To List" dialog + disabled "Encore" textbox | **PARITY — interactive on BOTH (PARITY-WITH-INTERACTION)**. NOT "intentional UX change to static". |

**BL-DIV-4 RE-CLASSIFIED**: the 2026-06-03 close `(b) intentional UX change` was an **unprobed assumption and is WRONG**. Both sites present Pay To Address as an interactive launcher over a disabled name-display. The divergence is parity, not a static-ification. The miss was a process gap (no affordance probe before classifying read-only), not a real UX change. → motivates LR-057 (affordance probe mandatory; baseline-vs-new "interactive→static" may never be closed as intentional without a new-site click-probe). Root cause in `rca-launcher-dialog-misses-2026-06-11.md`.

## Notes

- Old-site does not expose the Pay To **list dialog internals** for capture without clicking Select-class controls (avoided per LR-045). The new-site dialog is the canonical structure (see `field-inventories/left-panel-basic-information-2026-06-11.md` `## Launcher dialogs`); the old site confirms only the **affordance class** (interactive launcher), which is all BL-DIV-4 needed.
- `baselineScope: baseline-present` for the affordance; dialog internals `baseline-absent` (not opened on old site, observation-only).
