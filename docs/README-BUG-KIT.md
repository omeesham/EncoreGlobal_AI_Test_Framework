# Encore Bug Kit — find → file/log → verify on the test env

> **APPLIED 2026-09-18** on branch `feature/sprint18-vikas-bug-kit` (off `NM-3834`), flat layout: bugs → `reports/bugs/`, planning knowledge → `specs_planning/_internal/`, auth state → `.auth/encore-state.json`. `CLAUDE.md`, `.claude/settings.json`, `package.json` scripts and the three `playwright-test-*` agents are already wired — `BUG-KIT-PASTE-STEPS.md` is kept only as the record of what was pasted. Smoke-tested here: auth setup 1 passed; `walk:enumerate --module=service-charge` → 13-element manifest; bug-baseline gate denies a bad enum / allows a cited regression; `check:bug-hook` 15/15; `walk:enumerate:test` 20/20.
> **2026-09-18 (second commit)**: the six always-on `@` lines are ALSO in the tracked `.claude/rules/bug-kit.md` (no `paths:` filter → loads every session), because `CLAUDE.md` is gitignored in this repo and never reaches colleagues.

Extracted 2026-09-18 from the JBS Encore Framework (HEAD 146d1b58). ONLY the bug lifecycle — nothing about plans, pipelines, deliverables or test-case authoring.
Unzip at the ROOT of the new framework; paths are preserved so every relative link inside the files keeps working. Then follow `BUG-KIT-PASTE-STEPS.md` (next to this file) for the 4 manual pastes.

## The lifecycle and which file drives each step

| Step | What Claude does | File |
|---|---|---|
| 0. WALK (forces every field) | LR-013 walk-before-code + LR-057 affordance probe + LR-007 spot-check — planner inventories every control on the page into a dated artifact BEFORE hunting; the inventory is the denominator | `.claude/rules/inventory.md`, `specs_planning/_internal/field-inventory-spec.md`, `field-inventories/_TEMPLATE.md` |
| 0a. MACHINE DENOMINATOR (LR-062) | `npm run walk:enumerate -- --office=1604 --module=<module>` shadow-pierces the live page, lists EVERY interactive element, emits a ` — adversarial SFDPOT hunt over a module / page / diff; live-DOM probing; pattern sweep | `.claude/skills/find-bugs/SKILL.md` |
| 1a. know what a field MUST do | per-field-type positive / boundary / negative / save-cycle cases, the §2.1 "announced + escapable" rejection oracle, §3 grid behaviours, §5 element classes | `specs_planning/_internal/field-case-generation.md` (+ its parent `docs/read_only_docs/CASE_GENERATION_STANDARD.md`) |
| 1b. know the bug shapes | ARCH-NNN probe → bug archetypes | `specs_planning/_internal/bug-archetypes.md` |
| 1c. Encore form quirks | LR-009 / 010 / 011 / 026 — Angular dirty-state, async validation, NaN corruption | `.claude/rules/angular.md` |
| 2. CONFIRM | LR-030 (requirement contradiction), LR-031 (no lazy skip), LR-032 (investigate, don't theorize), LR-033 (network check on every "nothing happens"), LR-ENC-008 (loading window ≠ broken), LR-ENC-009 (no accessibility filings) | `docs/BUG_RULES.md` |
| 3. FILE / LOG | LR-034 Bug Filing Protocol — requirement → live repro → dedup → `BUG-{MOD}-{SUB}-NNN` id → JSON → skip affected TCs → report | `docs/BUG_RULES.md` §LR-034; id codes from `export_test_cases/module-codes.json`; JSON shape from the 28 real filings in `reports/bugs/` |
| 3a. baseline classification | LR-045 — every filing says `regression-from-baseline` / `intentional-UX-change` / `baseline-absent` / `not-checked`, with old-site evidence | `docs/BUG_RULES.md` §baseline; artifacts in `specs_planning/_internal/old-site-baseline/` |
| 3b. gate | PreToolUse hook that REJECTS a BUG-*.json write whose `baselineComparison` is outside the enum or claims a regression with no baseline artifact | `.claude/hooks/bug-baseline-gate.sh` + `lib/check-bug-baseline.mjs` (self-test: `node .claude/hooks/lib/test-bug-baseline-fixtures.mjs` → 15 passed) |
| 4. VERIFY on env | LR-044 Bug Verification Protocol — read steps verbatim → follow exactly on a fresh page → verdict CONFIRMED/FALSE with RCA category → minimize → update JSON `verificationLog` | `docs/BUG_RULES.md` §LR-044 |
| 4a. RCA a failure | `/rca` — artifact-first, evidence-driven root cause (IS/IS-NOT, 5 Whys, trace analysis); Phase 5 = live replication | `.claude/skills/rca/SKILL.md` + Stop hook `.claude/hooks/rca-verdict-gate.sh` (warns when an RCA verdict ships without evidence agents) |
| 4b. fix our own code | `/bugfix` (auto-calls `/regression-guard` before + after) | `.claude/skills/bugfix/SKILL.md`, `.claude/skills/regression-guard/SKILL.md` |
| ENV | which envs exist (e2e writable, nav2 observation-only, office 1604), fresh-login procedure, office 1101 superset | `docs/BUG_RULES.md` §LR-ENC-007 / §fresh login |
| ENV | how to drive the live site — Playwright CLI vs Claude-in-Chrome decision matrix, auth, network capture | `.claude/rules/browser-tool.md` + `docs/read_only_docs/CLI_BROWSER_GUIDE.md` |

## Wiring (3 steps)
1. **Rules must be loaded** — add to the new repo's `CLAUDE.md`:
   `@docs/BUG_RULES.md`, `@.claude/rules/angular.md`, `@.claude/rules/browser-tool.md`, `@.claude/rules/inventory.md`, `@specs_planning/_internal/field-case-generation.md`, `@specs_planning/_internal/field-inventory-spec.md`
   (`angular.md` / `browser-tool.md` carry `paths:` frontmatter — they auto-load only when editing matching spec/page files; the `@` line makes them always-on for bug hunts.)
2. **Hooks** — merge `.claude/settings.bug-hooks.snippet.json` into `.claude/settings.json` (it holds the exact `permissions.allow`, `PreToolUse` and `Stop` entries, generated from the source repo's settings). Both hooks import only `.claude/hooks/lib/hook-utils.mjs` (included) and Node built-ins — no npm install needed.
3. **Creds** — the fresh-login section expects `.env.local` with `NAVIGATOR_USERNAME` / `NAVIGATOR_PASSWORD` and the auth setup spec. Not in this kit (credentials). Bring your own.

## References inside these files that are NOT in the kit (by design)
- `/identity` and `/reflect` — pipeline-role machinery; every reference to them was REMOVED from the 4 skill files in this kit, so nothing dangles.
- `check-tc-parity.ts` Guardrail 7 (enforces the 3-segment BUG id grammar on TC exports) — deliverable tooling, not bug work.
- `reports/failure-summary.json`, `test-results/`, trace files that `/rca` reads — produced by your Playwright runs, not shipped.

## walk-coverage notes
- Needs Playwright at the repo root: `npm i -D @playwright/test@1.60.0` (the enumerator imports `playwright`, which `@playwright/test` bundles) and `npx playwright install chromium`.
- It logs in from `.auth/encore-state.json` (produced by your auth setup); it never logs in itself and aborts on a login redirect.
- `scripts/walk-coverage/lib/module-config.mjs` is the Encore module → URL table (`--module=pricing` etc.). Add a row there for every new module you walk.
- Self-tests: `npm run walk:enumerate:test` → 20/20. `npm run check:coverage-manifest` → 42/42 inside a git repo whose `package.json` first commit predates 2026-06-19; in THIS repo 5 date-gated cases (2 "grandfathered" + P7/F2/F3 "pre-provenance-landing") fail by design — nothing here predates the 2026-06-19 gate, so everything is enforced; that is the behaviour you want, not a defect.
