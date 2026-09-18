---
description: Bug kit — always-on rules for finding, filing and verifying app bugs (no paths filter = loads in every session; CLAUDE.md is gitignored in this repo, so this file carries the wiring)
---

# Bug kit (find → file → verify) — always loaded

@docs/BUG_RULES.md
@.claude/rules/angular.md
@.claude/rules/browser-tool.md
@.claude/rules/inventory.md
@specs_planning/_internal/field-case-generation.md
@specs_planning/_internal/field-inventory-spec.md

If the `@` imports above did not expand in this session, READ those six files before any bug hunt, bug filing, or bug verification.

## Non-negotiables (summary of the files above)

- Skills: `/find-bugs` (hunt, never fix), `/rca` (root-cause a failure), `/bugfix` (fix OUR code, regression-guard before + after), `/regression-guard`.
- What every control MUST do comes from `specs_planning/_internal/field-case-generation.md` §2 (per-field-type positive / boundary / negative / save-cycle cases) and §2.1 (a rejected value must be BOTH announced AND escapable — a red border with no way out is a defect; a silent revert is a defect).
- Walk before you hunt (LR-013): `npm run walk:enumerate -- --office=1604 --module=<module>` lists every interactive element; the inventory is the denominator. Never classify a field read-only/disabled without click-probing it (LR-057).
- No filing on theory (LR-032): live reproduction on `cloudapps-e2e` + network evidence (LR-033) first. A control that "does nothing" in its first ~2 minutes is a loading window — retry with varied waits before concluding (LR-ENC-008). A Jira ticket marked Done is a promise to re-drive on e2e, not proof.
- Behaviour defects only — DOM / markup / accessibility findings are NOT bugs for this client (LR-ENC-009).
- File per LR-034: requirement source → dedup against `reports/bugs/BUG-*.json` → id `BUG-{MOD}-{SUB}-NNN` from `export_test_cases/module-codes.json` → JSON with numbered `stepsToReproduce`, expected, actual, `mcpEvidence`, `baselineComparison` ∈ {regression-from-baseline | intentional-UX-change | baseline-absent | not-checked} (+ `baselineEvidence` citing `specs_planning/_internal/old-site-baseline/<module>-<date>.md` for a regression). The PreToolUse hook rejects anything else.
- Verify per LR-044: read the filed `stepsToReproduce` verbatim → follow exactly on a fresh page → CONFIRMED (then minimize) or FALSE with an RCA category (ISOLATION | HALLUCINATION | MISREAD | ENVIRONMENTAL | STALE | ROLE/OFFICE-DEPENDENT) → append a `verificationLog` entry.
- Angular traps (`.claude/rules/angular.md`): cross-field validation is async → `expect.poll` (LR-010); non-numeric input corrupts the model → reload after (LR-011); retyping the original value keeps Save disabled by design (LR-009); dirty state outlives a successful save (LR-026).
- Never `fill()` a formatted numeric input (`20%` → `15.2%` silently) — type it; read back what you typed.
- Browser: the agents drive the site through their `mcp__playwright-test__*` tools; scripts use `.auth/encore-state.json`. Set `TESTRAIL_ENABLED=false` in `.env.local` before any run.
