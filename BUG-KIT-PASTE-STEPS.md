# Bug kit — manual paste steps (everything that is NOT done by unzipping)

> **ALREADY APPLIED 2026-09-18** — every step below is done on this branch (agent files here are `.claude/agents/playwright-test-{planner,generator,healer}.md`). Kept as the record; nothing left to paste except your own `.env.local` review.
> **2026-09-18 (second commit)**: the six always-on `@` lines are ALSO in the tracked `.claude/rules/bug-kit.md` (no `paths:` filter → loads every session), because `CLAUDE.md` is gitignored in this repo and never reaches colleagues.

Order: unzip `encore-bug-kit.zip` at the repo root FIRST, then do the 3 pastes below, then reload the Claude Code window in VS Code.

---

## 1 → `CLAUDE.md` (repo root) — add these 4 lines anywhere in the file

```markdown
@docs/BUG_RULES.md
@.claude/rules/angular.md
@.claude/rules/browser-tool.md
@specs_planning/_internal/field-case-generation.md
@.claude/rules/inventory.md
@specs_planning/_internal/field-inventory-spec.md
```

Why: `angular.md`, `browser-tool.md` and `inventory.md` have `paths:` frontmatter, so on their own they only load when editing matching spec/page files. The `@` lines make all six always-on for bug hunts.

---

## 2 → `.claude/settings.json` — merge these keys

If the file does not exist, paste the whole block as the file. If it exists, append the 5 strings to your `permissions.allow` array, and add the `PreToolUse` and `Stop` entries to your `hooks` object (keep any entries you already have).

```json
{
  "permissions": {
    "allow": [
      "Bash(bash .claude/hooks/rca-verdict-gate.sh *)",
      "Bash(node .claude/hooks/lib/check-rca-verdict.mjs *)",
      "Bash(bash .claude/hooks/bug-baseline-gate.sh *)",
      "Bash(node .claude/hooks/lib/check-bug-baseline.mjs *)",
      "Bash(node .claude/hooks/lib/test-bug-baseline-fixtures.mjs)"
    ]
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write|NotebookEdit",
        "hooks": [
          {
            "type": "command",
            "command": "bash .claude/hooks/bug-baseline-gate.sh"
          }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "bash .claude/hooks/rca-verdict-gate.sh --validate"
          }
        ]
      }
    ]
  }
}
```

Verify the hook works:

```bash
node .claude/hooks/lib/test-bug-baseline-fixtures.mjs
```

Expected last line: `15 passed, 0 failed`.

---

## 2b → `package.json` — add these to `"scripts"` (walk-coverage entry points) and install Playwright

```json
"walk:enumerate": "node scripts/walk-coverage/enumerate-page.mjs",
"walk:enumerate:test": "node scripts/walk-coverage/lib/test-enumerate-fixtures.mjs",
"walk:cross-check": "node scripts/walk-coverage/cross-check.mjs",
"check:coverage-manifest": "node scripts/walk-coverage/lib/test-coverage-manifest.mjs",
"check:walk-observations": "node scripts/check-walk-observations.mjs",
"check:fixture-provenance": "node scripts/walk-coverage/check-fixture-provenance.mjs"
```

```bash
npm i -D @playwright/test@1.60.0 && npx playwright install chromium && npm run walk:enumerate:test
```

Expected last line: `walk-coverage enumerate fixtures: 20 passed, 0 failed, 20 total`.

---

## 3 → `.claude/agents/planner.md` / `generator.md` / `healer.md`

## → planner.md

```markdown
## Bug duties (encore-bug-kit)

- BEFORE hunting, run `npm run walk:enumerate -- --office=1604 --module=<module>` to get the machine list of every interactive element (LR-062 denominator) and paste its `## Coverage Manifest` into the inventory; then walk the module field-by-field and write the dated field-inventory artifact per `.claude/rules/inventory.md` LR-013 (walk before code, artifact before complete) using `specs_planning/_internal/field-inventories/_TEMPLATE.md`; every control gets an `affordance:` probe (LR-057) — never classify a field read-only/disabled without clicking it, its label and its container. The inventory is the denominator: a bug hunt that skipped a field is incomplete.
- While walking the live UI, hunt for defects with `/find-bugs`. The oracle for what every control MUST do is `specs_planning/_internal/field-case-generation.md` §2 (per-field-type positive / boundary / negative / save-cycle) and §2.1 (every rejected input must be BOTH announced AND escapable).
- Any app misbehaviour → file it per `docs/BUG_RULES.md` LR-034: requirement source first → reproduce live on `cloudapps-e2e` → network evidence (LR-033) → dedup against `reports/bugs/BUG-*.json` → id from `export_test_cases/module-codes.json` → write the JSON → report in chat.
- Never file on theory. No live repro + no network evidence = no filing (LR-032).
- Behaviour defects only. DOM / markup / accessibility findings are NOT bugs for this client (LR-ENC-009).
- A surface that looks broken in its first ~2 minutes is a loading window, not a bug — retry with varied waits before concluding "does nothing" (LR-ENC-008).
- Classify every filing against the old site: `baselineComparison` must be one of `regression-from-baseline | intentional-UX-change | baseline-absent | not-checked`, with `baselineEvidence` citing `specs_planning/_internal/old-site-baseline/<module>-<date>.md` when it is a regression (LR-045). The bug-baseline hook rejects anything else.
```

---

## → generator.md

```markdown
## Bug duties (encore-bug-kit)

- Before `test.skip`-ing any TC that cites a bug, verify the bug yourself per `docs/BUG_RULES.md` LR-044: read its `stepsToReproduce` verbatim → follow them exactly on a fresh page → record the verdict. A filed bug is tooling, not an oracle.
- A spec that fails because the APP is wrong (not the test): file it per LR-034, then skip the TC with `test.skip('bug-blocked: BUG-{MOD}-{SUB}-{NNN}')` and reference the id in the FIXME.
- A "nothing happens" click is never a conclusion — check network activity first (LR-033) to separate client-blocked from server-rejected.
- Angular traps when writing the assertion that exposes a bug: cross-field validation is async → `expect.poll` (LR-010); non-numeric input corrupts the model → reload after (LR-011); reverting to the original value keeps Save disabled by design, not by bug (LR-009). All in `.claude/rules/angular.md`.
```

---

## → healer.md

```markdown
## Bug duties (encore-bug-kit)

- Every failure goes through `/rca` first — artifact-first, evidence-driven, no fix from a theory. Read `failure-summary.json` / trace / network before touching code.
- The live-replication phase follows `docs/BUG_RULES.md` LR-044 verbatim: fresh page → exact filed steps → observe DOM, network, console, dirty state at each step.
- Verdict `FALSE` must carry an RCA category (`ISOLATION | HALLUCINATION | MISREAD | ENVIRONMENTAL | STALE | ROLE/OFFICE-DEPENDENT`) and updates the bug JSON `status` accordingly.
- Verdict `CONFIRMED` → minimize the repro (drop one setup step at a time), then update the bug JSON: shorter `stepsToReproduce`, original preserved in `stepsToReproduceOriginal`, new `verificationLog` entry.
- Failure classified APPLICATION or DATA (not test defect) → it is a bug: file per LR-034 if none exists, otherwise append evidence to the existing `BUG-*.json` — never a duplicate.
- Fixes to OUR code go through `/bugfix` (regression-guard before and after). Never "fix" a spec by loosening an assertion to hide an app bug.
```

---

## 4 → `.env.local` (credentials — not in the kit)

```
NAVIGATOR_USERNAME=<automation account>
NAVIGATOR_PASSWORD=<its password>
```

The fresh-login section in `docs/BUG_RULES.md` reads these; the auth setup writes `.auth/encore-state.json`. Keep `.auth/` gitignored.
