---
description: Playwright CLI vs Claude in Chrome selection matrix (LR-038 v2)
paths:
  - "plans/**/*.md"
  - "src/pages/**/*.ts"
  - "tests/**/*.spec.ts"
  - "clients/**/specs_planning/**/*.md"
---

# Browser Tool Selection (LR-038 v2)

Path-scoped rule pack — loads when authoring plans, page objects, specs, or specs_planning artifacts that may interact with a live website.

**V2 thesis (2026-04-24)**: the 2-way choice is now **Playwright CLI** (default, token-efficient, unattended) vs **Claude in Chrome** (specialist — visual/CSS, fresh authenticated session, live RCA). Playwright MCP is **retiring** (SP-PWC2-07 deletes `.vscode/mcp.json`); do not start new work on MCP. When any session needs to interact with a live website (exploration, locator discovery, bug investigation, catalog work, live DOM reads/clicks/saves), choose the browser tool **before** first browser call. Announce the choice + reason in the first output or activity-log row of the session. See [`docs/read_only_docs/CLI_BROWSER_GUIDE.md`](../../docs/read_only_docs/CLI_BROWSER_GUIDE.md) for command-surface parity, auth story, and claim-verification trail.

## Gate 1 — Agent type

- **Claude Code (Opus or Sonnet)** → continue to Gate 2. You can call `mcp__Claude_in_Chrome__*` and `@playwright/cli` (`playwright-cli`).
- **Codex / Cursor / other non-Claude AI** → fall back to Playwright CLI (or legacy MCP until SP-PWC2-07 retires it). You do NOT have Claude in Chrome tools. Do not pretend you do.
- **Self-check for Claude Code**: if you can see any `mcp__Claude_in_Chrome__*` tool in your tool list, Gate 1 passes.

## Gate 2 — Task classification (2-way matrix)

Pick per the task class. There is no "default when uncertain" — if the task doesn't cleanly fit a row, re-read the rationale column.

| Task class | Primary | Rationale |
|---|---|---|
| Functional bug (500s, broken link, silent no-op, API 4xx) | **CLI** | `playwright-cli network` + `eval` give structured request logs; ~4× token savings vs MCP baseline |
| Visual / CSS / layout bug | **Chrome** | Chrome wins because the user's own Chrome window provides live visual review during agent work (human-in-loop) |
| Auth-heavy exploration (fresh authenticated session needed) | **Chrome** | Inherits live user session. CLI needs one-time `state-save`; Entra FedAuth renewal benefits from Chrome's pause-and-wait |
| Catalog walkthrough / locator discovery (>10 fields) | **CLI** | CLI wins when the agent uses **grep-over-disk discipline** — keep the saved YAML snapshot on disk, `grep` specific labels (~50 tokens per field query). `Read`ing the whole YAML file erases the advantage |
| Spec generation Phase 0.5 walkthrough (PF-G5 evidence) | **CLI** | Emit walkthrough.yaml to disk for auditability + canonical-JSON normalization. Generator MUST use grep-over-disk for field-level queries |
| Batch regression (unattended, >5 pages) | **CLI** | Headless + multi-browser; Chrome extension has no headless |
| **RCA context (any `/rca` invocation — skill-driven systematic root-cause-analysis)** | **CLI (HEADED, no exception)** | Subagent B in the mama-led `/rca` orchestration (`.claude/skills/rca/SKILL.md`) must walk live with `playwright-cli open --persistent` (or equivalent headed mode). Even chain-spawned overnight RCAs run headed — "at least there's a chance a human catches a glimpse of the bug." Override = LR-043 §A handshake in chat (assistant emits `[OVERRIDE-REQUEST] /rca-headed-cli`, user types `override approved`, one-shot). Distinct from the "Live RCA" row below — that one is for non-skill human-in-loop Chrome use. |
| Live RCA (user at machine, "what happens when I click") | **Chrome** | **Valid only when the subplan body contains an explicit `pause:` / `await user input` step that fires DURING execution.** Verdict gates at end-of-subplan, YELLOW/RED handoffs between phases, and "user will read the report later" are NOT human-in-loop — those are post-execution review and do not justify Chrome. (Tightened 2026-04-27 after the SUBPLAN_DQU_04_B2_LI_NEUTRAL_EYE_AUDIT over-cautious-Chrome incident.) |
| Spec execution (`npm test`) | Neither — `@playwright/test` runner | Not a browser-tool choice |

## Gate 3 — CLI auth fallback (try-it-and-see, no freshness gate)

Try the `playwright-cli` call as-is (headless, using `.auth/e2e-state.json`). If it lands on the app → continue. If it redirects to `login.microsoftonline.com` or any Entra page → STOP, do NOT retry headless. Switch to headed via `playwright-cli open --persistent --profile=.auth\e2e-profile`, surface a one-line "auth refresh needed — please complete sign-in in the headed window" message to the user (LR-039 obstacle row), wait for sign-in, then `state-save -s=e2e` to refresh `.auth/e2e-state.json`. Resume the original headless flow on refreshed state. Log the switch as `[BROWSER-SWITCH] from=cli-headless to=cli-headed reason=auth-refresh artifact=.auth/e2e-state.json` per the mid-subplan switch protocol below. Trigger is the Entra redirect, not file age — no proactive mtime check.

## Mandatory announcement (accountability)

First output or activity-log row of any browser-interacting session must declare the choice and the reason, e.g.:

> "Browser tool: Playwright CLI. Reason: catalog walkthrough, 40 fields, unattended."
> "Browser tool: Claude in Chrome. Reason: visual regression on dropdown z-index; user at machine."
> "Browser tool: both. Reason: CLI for catalog + Chrome for one visual assertion (BrowserToolJustification: pilot module)."

Subplans authored after 2026-04-24 MUST also declare the choice in a `**BrowserTool**:` frontmatter line (`cli` | `chrome` | `both` | `none`). `both` requires a `**BrowserToolJustification**:` line (SP-PWC2-02 validator enforces). Pre-2026-04-24 subplans are grandfathered.

## Mid-subplan switch protocol (`[BROWSER-SWITCH]`)

Switching tools within one subplan is allowed when task class shifts. Every switch MUST be logged in the activity log per LR-028 with the canonical format:

```
[BROWSER-SWITCH] from=<cli|chrome> to=<cli|chrome> reason=<one-line> tokens_so_far=<n> artifact=<file-if-any>
```

**Switch budget** (`/final-q` audits when initial `BrowserTool=both` or any switch occurred):

- ≥2 switches in one subplan → `/final-q` **YELLOW** (should have been authored as `both` up-front, or split into two subplans).
- ≥3 switches in one subplan → `/audit` **RED** (design smell — lazy-escape-hatch pattern).

## Chrome connection-drop protocol

Chrome's service worker can go idle on long unattended runs; the extension may also lose its websocket. On any connection drop during an unattended run:

1. Agent MUST log a `[BROWSER-SWITCH] from=chrome to=cli reason=connection-drop ...` row and continue on CLI.
2. Failure to switch (silent halt, indefinite retry on Chrome) = `/audit` **RED**.
3. Drop event MUST be recorded as a JSON file under `reports/browser-drops/<YYYY-MM-DDTHH-MM>.json` with `{subplan, from, to, trigger, recovery_action}`.
4. If the subplan declared `BrowserTool: chrome` (not `both`), the agent HALTs and surfaces the drop to the user instead of silently degrading — Chrome was chosen for a reason.

## LR-054: `playwright-cli` ≠ `npx playwright` — consult Table 2 before claiming CLI limits

`playwright-cli` (Microsoft's agent-CLI, binary `@playwright/cli`, v0.1.8+) and `npx playwright` (the `@playwright/test` runner) are **DIFFERENT BINARIES**. They share a name root but their command surfaces do not overlap. Conflating them produces authoritative-sounding hallucinations that block legitimate execution.

**Binary distinction (canonical subcommand list — sourced from `docs/read_only_docs/CLI_BROWSER_GUIDE.md` §2 Table 2)**:

| Capability | `playwright-cli` (agent-CLI) | `npx playwright` (test runner) |
|---|---|---|
| Open / navigate live page | `playwright-cli open <url>` / `goto <url>` | n/a (only `test`, `codegen`, `install`, `show-report`, `show-trace`) |
| Click / fill / type | `click <ref>` / `fill <ref> <val>` / `type <ref> <val>` | n/a |
| Snapshot (AX tree YAML to disk) | `snapshot` → `.playwright-cli/page-*.yml` | n/a |
| Eval / run-code | `eval <expr>` (function form `() => expr`) / `run-code <block>` | n/a |
| Network / console capture | `network` / `console` | n/a (captured inside test runs only) |
| Storage / sessions | `state-save -s=<name>` / `state-load` / `-s=<name>` top-level flag / `open --persistent --profile=<dir>` | n/a |
| Screenshot | `screenshot -o <file>` | n/a (captured inside test runs only) |
| Test execution | n/a | `npx playwright test` / `--grep` / `--retries=0` / `--list` |
| Codegen | n/a | `npx playwright codegen` |

The `--raw` flag on `playwright-cli` (e.g., `playwright-cli --raw -s=<name> eval "() => window.location.href"`) strips status framing from stdout, returning a clean string suitable for `grep`/`printf` in bash polling loops.

**Mandate**: any session asked yes/no on CLI capability, any `BrowserTool: cli` justification claiming a limit, any HALT prose citing CLI inadequacy MUST grep `docs/read_only_docs/CLI_BROWSER_GUIDE.md` Table 2 BEFORE answering. If a row exists for the capability, the answer is YES (cite the row). If no row exists, the answer is NO — but cite the absence verbatim, don't manufacture a reason.

**Forbidden answers** (each is a documented hallucination class from 2026-05-18):

- "playwright CLI can't drive live interaction" — FALSE: `click` / `fill` / `type` / `snapshot` are all in Table 2.
- "playwright CLI can't refresh auth" — FALSE: `open --persistent --profile=<dir>` covers headed SSO + `state-save -s=<name>` persists session.
- "CLI lacks the [X] subcommand" without quoting Table 2's absence of that row.
- "manual sign-in is impossible from CLI" — FALSE: Gate 3 of this rule covers it: `open --persistent` opens headed window, user signs in, `state-save` captures state.
- "MFA might fire" as a HALT reason when `CLAUDE.md` documents the automation user has no second-factor configured.

**Companion structural defenses** (defense in depth — each catches a different escape route):

1. Auto-memory `feedback_browser_tool_selection.md` `## playwright-cli ≠ npx playwright` section (active context).
2. This rule (LR-054, path-scoped on plan/spec/page-object/specs_planning edits).
3. `specs_planning/_internal/agent-mistakes.md` ALL-077 (prompt-injection advisory).
4. PreToolUse `.claude/hooks/todo-injection-gate.sh --validate` banned-phrase scan on `tool_input.new_string` / `tool_input.content` for `Edit|Write|NotebookEdit` writing to walk-evidence / neutral-eye-audits / field-inventories / plans paths.
5. `/audit` skill (Mode review + Mode slop) grep-scan for banned-phrase regex set.
6. Pre-commit / pre-push `scripts/verify-no-forbidden.mjs` path-scoped `isBannedPhraseTarget()` array.
7. ⚠ callout above `docs/read_only_docs/CLI_BROWSER_GUIDE.md` Table 2.

**Why this rule exists** (graduated from 2026-05-18 same-session double-hallucination):

- **Instance 1** (SP-A agent, 2026-05-18): manufactured 153-line "Section 0 — Live-Walk Blocker" at `specs_planning/_internal/walk-evidence-shared-setup-2026-05-15.md:13-165`. Cited hypothetical MFA scenario contradicted by `CLAUDE.md:134` ("no second-factor authentication configured") AND the subplan's own line 94-96. Verdict: MANUFACTURED (Audit Sweep 3).
- **Instance 2** (OWNER session, same day): said "playwright CLI ≠ live Claude interaction" without consulting Table 2 — conflated `npx playwright` (test runner) with `playwright-cli` (agent-CLI).
- **Instance 3** (repo-wide pattern, Audit Sweep 2): 6 scripts in `scripts/` (~1781 lines) all import `chromium` directly + skip `LoginPage`. Institutional escape route, not one-off.

All three had the same shape: authoritative answer about tool capability without consulting the canonical doc first. Removing the manufactured artifacts (Arm B + Arm C of `PLAN_FIX_CLI_HALLUCINATION_AND_SSL_A_BLOCKER`) is the immediate fix; this rule + the six companion defenses are the structural prevention.

**Trigger**: any session asked yes/no on CLI capability; any `BrowserTool: cli` justification claiming a limit; any HALT row citing CLI inadequacy; any subplan authoring/edit involving SSO/auth-refresh prose; every `/execute` Phase 0 browser-tool announcement; every `/audit` review/slop pass on artifact files under `specs_planning/_internal/`.

**Graduated from**: 2026-05-18 same-session double-hallucination — SP-A agent + OWNER session, plus repo-wide raw-chromium-script pattern. `PLAN_FIX_CLI_HALLUCINATION_AND_SSL_A_BLOCKER` landed this rule + ALL-077 + hook + audit-skill scan + pre-push scan + CLI guide callout simultaneously.

## Legacy context (footnote)

V1 of this rule framed the 2-way choice as Chrome vs **Playwright MCP**. V1 plan archived at [`plans/done/PLAN_BROWSER_TOOL_SELECTION.md`](../../plans/done/PLAN_BROWSER_TOOL_SELECTION.md); V2 parent at [`plans/pending/PLAN_PLAYWRIGHT_CLI_PRIMARY_CHROME_SPECIALIST.md`](../../plans/pending/PLAN_PLAYWRIGHT_CLI_PRIMARY_CHROME_SPECIALIST.md). Historical activity-log rows, catalog session notes, and done-plan execution summaries that reference Playwright MCP remain valid factual records — do not rewrite them. Field-inventory artifact frontmatter keys (`MCP_Session_Tool`, `MCP_Tool_Reason`) retain their names pending SP-PWC2-05 canonical normalization.

**Trigger**: Every session whose plan or request involves any of: `/research` with a live-DOM phase; `/rca` Phase 5 (live browser replication); `/find-bugs` with live app interaction; `/bugfix` when reproducing on live app; any subplan whose Skills field includes `/research` + browser, or whose Step-by-Step involves "live DOM", "browser session", "catalog", "locator discovery", "live verification".
