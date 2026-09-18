# CLI + Chrome Browser Guide (V2 — hybrid)

> **Read before any session that interacts with a live web app.** Successor to `MCP_BROWSER_GUIDE.md` (archived in SP-PWC2-07). Authored by SP-PWC2-00 (2026-04-24) as the kill-switch verification of the V2 thesis. Downstream subplans SP-PWC2-01..07 cite this doc instead of re-chasing URLs.

---

## 1. Executive summary — when to use which tool

The Encore pipeline now has two first-class browser transports plus one retiring one:

- **Playwright CLI** (`@playwright/cli`, Microsoft, binary `playwright-cli`) — the default for token-efficient, unattended, high-volume functional work. Writes YAML accessibility trees to disk; the agent reads the file instead of receiving the tree inline. Typical token footprint per task is ~4× lower than MCP on the same workload.
- **Claude in Chrome** (Anthropic official extension) — the specialist for visual/CSS work, auth-heavy flows (SSO), and live RCA where the user is at the machine. Inherits the user's live browser session, so no headless mode, no separate state-save, and no re-auth loops.
- **Playwright MCP** (`playwright-browser`, `playwright-test`) — **retiring**. Keep a fallback path until SP-PWC2-07 archives this doc's predecessor and deletes `.vscode/mcp.json`. Do not start new work on MCP.

**One-paragraph task-class rule** (seed for LR-038 v2 in SP-PWC2-01). **Default = CLI.** Use **CLI** when the task is functional (API failures, silent no-ops, broken links, 500s), unattended (chain runs, nightly CI), or repetitive across >10 steps where YAML-on-disk beats inline snapshots — and reach for it any time you can't justify Chrome from a named row. Use **Chrome** only when the task is visual (z-index, layout, truncation, pixels), auth-heavy in a way `state-save` can't solve (Entra FedAuth renewal — note that already-authenticated repeat sessions do NOT qualify; CLI's `state-save -s=e2e` reuses the session), or contains an explicit `pause:` / `await user input` step that fires DURING execution (true human-in-loop — "what happens when I click X right now, with the user watching"). **Verdict gates at end-of-subplan, YELLOW/RED handoffs, and "user will read the report later" are NOT human-in-loop** and do not justify Chrome (tightened 2026-04-27 after the SUBPLAN_DQU_04_B2_LI_NEUTRAL_EYE_AUDIT over-cautious-Chrome incident — agent cited "human-in-loop" for a plan with zero pause steps). Use **neither** when it's `@playwright/test` runner work — that's `npm test`, not a browser-tool choice.

---

## 2. Command surface reference

> ⚠ **`playwright-cli` ≠ `npx playwright`.** The two are DIFFERENT binaries. This document refers throughout to `playwright-cli` (Microsoft's agent-CLI, `@playwright/cli` v0.1.8+), NOT `npx playwright` (the `@playwright/test` runner). `npx playwright` only exposes `test` / `codegen` / `install` / `show-report` / `show-trace` — it has none of the live-interaction subcommands below (`open` / `goto` / `snapshot` / `click` / `fill` / `type` / `eval` / `network` / `console` / `state-save` / `screenshot`). Before answering any "can CLI do X" question or writing any HALT row citing a CLI limit, grep this table for the row. See `.claude/rules/browser-tool.md` LR-054 + `specs_planning/_internal/agent-mistakes.md` ALL-077 for the structural prevention. Graduated from 2026-05-18 same-session double-hallucination (manufactured Section 0 blocker + agent conflation of the two binaries).

Side-by-side mapping — every MCP primitive we currently use, its CLI equivalent, and its Chrome equivalent. This is the core of the V2 cutover: if a row says "n/a" for CLI or Chrome, the other wins by default.

| Capability | Playwright CLI | Claude in Chrome | Playwright MCP (retiring) |
|---|---|---|---|
| Open/navigate | `playwright-cli open <url>`, `goto <url>` | `navigate` | `browser_navigate` |
| Click | `click <ref>` | `browser_click` | `browser_click` |
| Fill / type | `fill <ref> <val>`, `type <ref> <val>` | `form_input` / `browser_type` | `browser_type` / `browser_fill_form` |
| Hover / drag / select | `hover`, `drag`, `select` | (DOM via `javascript_tool`) | `browser_hover` / `browser_drag` / `browser_select_option` |
| Upload | `upload <ref> <file>` | `file_upload` | `browser_file_upload` |
| Press key | `press <key>` | `shortcuts_execute` | `browser_press_key` |
| Snapshot (AX tree) | `snapshot` → `.playwright-cli/page-*.yml` on disk, agent reads path | `read_page` (accessibility summary) | `browser_snapshot` (inline) |
| Screenshot | `screenshot -o <file>` | `get_page_text` + screenshot via tab tools | `browser_take_screenshot` |
| Eval / run-code | `eval <expr>`, `run-code <block>` | `javascript_tool` | `browser_evaluate` / `browser_run_code` |
| Network requests | `network` | `read_network_requests` | `browser_network_requests` |
| Console messages | `console` | `read_console_messages` | `browser_console_messages` |
| Dialog | `dialog-accept` / `dialog-dismiss` | (page-level) | `browser_handle_dialog` |
| Tabs | `tab-list` / `tab-new` / `tab-select` / `tab-close` | `tabs_*_mcp` | `browser_tabs` |
| Storage | `state-save -s=<name>` / `state-load` / `cookie-*` / `localstorage-*` | inherits user browser profile | n/a (per-session only) |
| Sessions | `-s=<name>`, `open --persistent --profile=<dir>`, `list`, `close-all`, `kill-all` | persistent by default (user's Chrome) | n/a |
| Multi-session dashboard | `playwright-cli show` | n/a (user's own Chrome window) | n/a |
| Skills registry | `install --skills` (installs local manifest of valid commands) | n/a | n/a |

**Sources** (for the CLI column, which is the new surface): [playwright.dev/agent-cli/introduction](https://playwright.dev/agent-cli/introduction), [github.com/microsoft/playwright-cli](https://github.com/microsoft/playwright-cli) (v0.1.8 as of 2026-04-14).

**Terminology divergence flag** (per §5 of SP-PWC2-00): the word **"snapshot"** is overloaded. In `MCP_BROWSER_GUIDE.md` it means the inline AX tree that `browser_snapshot()` returns into the transcript. In the CLI it means a YAML file written to disk whose path the agent reads (`.playwright-cli/page-<timestamp>.yml`). Downstream rules (GEN-029, PF-G5, ALL-043) must be read with this distinction in mind — SP-PWC2-01 and SP-PWC2-05 retune them.

---

## 3. Authentication story

### 3.1 CLI — one-time state-save + persistent profile

CLI has no inherent session. Each command is stateless unless a named session (`-s=<name>`) points at a saved `storageState`. For e2e's MSFT SSO + Entra FedAuth:

1. One-time headed login: `playwright-cli open --persistent --profile=.auth/e2e-profile <E2E_URL>`.
2. Complete SSO manually in the browser window.
3. `playwright-cli state-save -s=e2e` — captures cookies + origins to disk.
4. Every subsequent CLI call: `playwright-cli <cmd> -s=e2e`.
5. Refresh cycle: Entra FedAuth cookie = 7 days → document a `refresh-auth` npm script (SP-PWC2-07 pilot; stub here).

**Leak risk**: `storageState` and `.playwright-cli/sessions/` contain session cookies + bearer tokens. Must be in `.gitignore`. Pre-commit hook should reject commits with auth files. See V1 plan §Self-audit Q7.

### 3.2 Chrome — live session inheritance

Chrome has no state-save step. Anthropic's extension shares the user's live browser login state:

> "Claude opens new tabs for browser tasks and shares your browser's login state, so it can access any site you're already signed into. Browser actions run in a visible Chrome window in real time. When Claude encounters a login page or CAPTCHA, it pauses and asks you to handle it manually." — [code.claude.com/docs/en/chrome](https://code.claude.com/docs/en/chrome)

So passkey flows that would kill a CLI run (new device, fresh challenge) simply pause and wait for the user. This is Chrome's structural win for the rare auth path that needs human interaction.

---

## 4. Performance + capability claims (verdicts)

Every claim the researcher landed in the V2 plan was re-fetched from primary sources. Verdicts: **CONFIRMED** (corroborated by primary source), **PARTIALLY CONFIRMED** (claim exists, quantitative or qualitative detail missing), **UNVERIFIED** (could not re-confirm; do not cite as fact).

| ID | Claim | Verdict | Source |
|---|---|---|---|
| LB1 | `@playwright/cli` exists: Microsoft, early 2026, binary `playwright-cli`. Installed via `npm install -g @playwright/cli`. | **CONFIRMED** | [playwright.dev/agent-cli/introduction](https://playwright.dev/agent-cli/introduction) + [github.com/microsoft/playwright-cli](https://github.com/microsoft/playwright-cli) (v0.1.8, 2026-04-14; "Copyright © 2026 Microsoft") |
| LB2 | MCP ~114K → CLI ~27K tokens (~4× reduction); ~10× reported on long sessions. | **CONFIRMED (with caveat)** | Headline 114K/27K number is the Playwright team's own benchmark (no Microsoft primary link; attributed via [testcollab.com/blog/playwright-cli](https://testcollab.com/blog/playwright-cli), [morphllm.com/playwright-mcp](https://www.morphllm.com/playwright-mcp)). Independently reproduced by Pramod Dutta at ~89K / ~24K on an 8-step login + dashboard flow ([scrolltest.medium.com](https://scrolltest.medium.com/playwright-mcp-burns-114k-tokens-per-test-the-new-cli-uses-27k-heres-when-to-use-each-65dabeaac7a0)). The ~4× ratio holds across sources; absolute magnitude is workload-dependent. **Caveat**: 10× long-session claim not reproduced in this pass. |
| LB3 | CLI writes YAML snapshot to disk; agent reads file path on demand instead of inline AX tree. | **CONFIRMED** | [playwright.dev/agent-cli/introduction](https://playwright.dev/agent-cli/introduction): "Snapshot file contains the accessibility tree with element refs for the next command" — example output `[Snapshot](.playwright-cli/page-2026-02-14T19-22-42-679Z.yml)`. |
| LB4 | `playwright-cli show` = multi-session dashboard with remote-takeover. | **PARTIALLY CONFIRMED** | `show` command is listed under DevTools ([playwright.dev/agent-cli/introduction](https://playwright.dev/agent-cli/introduction)) and GitHub README calls it a "visual dashboard" ([github.com/microsoft/playwright-cli](https://github.com/microsoft/playwright-cli)). The specific "multi-session + remote-takeover" language was not on the primary sources fetched in this pass — SP-PWC2-07 pilot should confirm live before LR-038 v2 cites it as a feature. |
| LB5 | Claude in Chrome: no headless, Chrome/Edge only. | **CONFIRMED** | [code.claude.com/docs/en/chrome](https://code.claude.com/docs/en/chrome): "Chrome integration is in beta and currently works with Google Chrome and Microsoft Edge. It is not yet supported on Brave, Arc, or other Chromium-based browsers. WSL (Windows Subsystem for Linux) is also not supported." Headless absence is structural: "Browser actions run in a visible Chrome window in real time." |
| LB6 | Claude in Chrome inherits live browser session (SSO win). | **CONFIRMED** | [code.claude.com/docs/en/chrome](https://code.claude.com/docs/en/chrome): "Claude opens new tabs for browser tasks and shares your browser's login state, so it can access any site you're already signed into... When Claude encounters a login page or CAPTCHA, it pauses and asks you to handle it manually." |
| LB7 | Version floor: Claude Code 2.0.73+ and Chrome extension 1.0.36+. | **CONFIRMED** | [code.claude.com/docs/en/chrome](https://code.claude.com/docs/en/chrome) Prerequisites: "Claude in Chrome extension... version 1.0.36 or higher" and "Claude Code... version 2.0.73 or higher." |
| NH8 | MCP degrades after ~15 interactions. | **UNVERIFIED** | *Folk wisdom — could not re-confirm from a primary source in this pass.* The nearest data point is Outpost's tool-call counts (~14-17 per MCP task, ~40-50 per CLI task — but that's calls-per-task, not a degradation threshold). Carried forward as UNVERIFIED per SP-PWC2-00 — do not cite as fact. |
| NH9 | Outpost wall-clock: CLI 2-3× slower than MCP. | **CONFIRMED** | [outpost.ranger.net](https://outpost.ranger.net/post/the-hidden-cost-of-fewer-tokens/) (2026-04-03): MCP "consistently around 90s for Scenario 1 and 120s for Scenario 2"; CLI "doubled (or more!) those times, with dramatically more variability. Some runs took up to 10 minutes to complete." Root cause: "the agents used dramatically more tool calls (2-3x) to accomplish the same goal with the CLIs." Within each scenario, the *slowest* MCP run beat the *fastest* CLI run. |
| NH10 | "CLI wins functional / Chrome wins visual." | **DESIGN RULE** (not a benchmark) | Reasoning, not measurement. Adopted as the LR-038 v2 task-matrix organizing principle; not cited as a performance claim. |

**HALT gate result** (per SP-PWC2-00 acceptance criteria): count UNVERIFIED verdicts across LB1–LB7 only = **0 UNVERIFIED**. V2 thesis **holds**. Downstream subplans (SP-PWC2-01..07) may proceed.

**Single-source caveat on LB2** (per adversarial spot-check): the headline 114K/27K number originates with the Playwright team and is echoed by three secondary sources (TestCollab, morphllm, Pramod's article quoting Microsoft). Pramod's **independent reproduction** (~89K / ~24K on an 8-step flow he designed himself) is the only independent data point. Treat the ~4× ratio as robust, the specific numbers as Playwright-team-benchmark-dependent. SP-PWC2-07 pilot must measure on our own pipeline workload before LR-038 v2 cites 4× as fact.

---

## 5. Known limitations

### 5.1 CLI limitations

- **Pixel-blind.** YAML AX tree cannot see z-index collisions, overlap, truncation, rendered font sizes, or visual regressions. Use Chrome for any visual/CSS bug.
- **Wall-clock cost.** Outpost's 2-3× slower wall-clock (NH9 CONFIRMED) means a 90s MCP exploration becomes 180-350s with CLI, occasionally 600s+. Token savings are real; wall-clock is the trade. Mitigation: agents should read snapshot YAML from disk once rather than re-snapshotting for the same state; batch interactions in a `run-code` block when safe.
- **Stateless by default.** Every CLI call is stateless unless a named session is specified. Forgetting `-s=e2e` silently opens a fresh unauth browser → session cookies leak expectation, test fails at auth redirect, agent confused. SP-PWC2-05 normalizer enforces session presence.
- **Fresh passkey is infeasible.** Use Chrome when a passkey prompt is part of the flow.

### 5.2 Chrome limitations

- **No headless.** "Browser actions run in a visible Chrome window in real time" — cannot run in a headless CI node, cannot be used for unattended chain runs that start when no user is present. LR-038 v2 must carve this out.
- **Chrome/Edge only.** Brave, Arc, other Chromium browsers not supported. WSL not supported. Linux users on Chromium-derivatives must fall back to CLI.
- **Service worker idles.** From the official troubleshooting: "The Chrome extension's service worker can go idle during extended sessions, which breaks the connection... run `/chrome` and select 'Reconnect extension'." For long unattended runs, this is an active failure mode — LR-038 v2 §Mid-session switch protocol must include a forced `[BROWSER-SWITCH]` from Chrome to CLI on connection drop (SP-PWC2-01 input).
- **Third-party providers unsupported.** "Chrome integration is not available through third-party providers like Amazon Bedrock, Google Cloud Vertex AI, or Microsoft Foundry." Direct Anthropic plan required.
- **Per-site permission wall.** Inherited from the Chrome extension — every new site must be whitelisted in extension settings before Claude can click/type on it.

### 5.3 MCP (retiring) — known good as of V1

MCP remains valid until SP-PWC2-07 archives `MCP_BROWSER_GUIDE.md`. Known degradation pattern (NH8 UNVERIFIED): folk wisdom says context pressure climbs after ~15 browser interactions, but the claim is not independently sourced. Treat as a smell, not a threshold.

---

## 6. Troubleshooting

### 6.1 CLI — authentication refresh

- `refresh-auth` npm script (stub — authored in SP-PWC2-07 pilot) should detect FedAuth cookie expiry and re-prompt for headed login.
- Session age check in pre-run gates: if `.playwright-cli/sessions/e2e.json` is older than 6 days, warn; older than 7 days, HALT.

### 6.2 Chrome — connection drop protocol

From Anthropic's official troubleshooting guide ([code.claude.com/docs/en/chrome](https://code.claude.com/docs/en/chrome)):

| Symptom | Fix |
|---|---|
| "Browser extension is not connected" | Restart Chrome and Claude Code; run `/chrome` to reconnect. |
| "Extension not detected" | Install/enable the extension in `chrome://extensions`. |
| "No tab available" | Create a new tab and retry. |
| "Receiving end does not exist" | Run `/chrome` → "Reconnect extension" (service worker went idle). |
| Named pipe conflicts (Windows EADDRINUSE) | Restart Claude Code; close other Claude Code sessions using Chrome. |
| Modal dialog blocking commands | Dismiss manually, then tell Claude to continue. |

**Long-session rule**: for runs > ~15 minutes of continuous Chrome activity, log a `[BROWSER-HEALTH]` check every 10 minutes. On drop: if the subplan's `BrowserTool: both`, `[BROWSER-SWITCH]` to CLI and log. If `BrowserTool: chrome` only, HALT and surface to user — do not silently degrade.

### 6.3 Mid-session switch logging (LR-038 v2 input)

Mandatory format when switching tools within one subplan:

```
[BROWSER-SWITCH] from=<cli|chrome|mcp> to=<cli|chrome> reason=<one-line> tokens_so_far=<n> artifact=<file-if-any>
```

Logged via the activity-log (LR-028). `/final-q` audits presence whenever initial `BrowserTool` was `both` or a switch actually occurred. ≥2 switches in one subplan → YELLOW. ≥3 → RED. Authored in SP-PWC2-01.

---

## 6.4 Hook enablement procedure (SP-PWC2-06, ships DISABLED)

An opt-in PreToolUse hook at `.claude/hooks/browsertool-gate.sh` can enforce the `BrowserTool` frontmatter field at tool-call time — denying cross-class browser-tool calls (e.g. a `mcp__Claude_in_Chrome__*` call under a `BrowserTool: cli` subplan). **Ships disabled** in `.claude/settings.json` per LR-043 remediation discipline (CLAUDE.md L712+): a hook that sabotages legitimate work is worse than no hook. SP-PWC2-07's pilot decides whether to flip it on.

**Before enabling — mandatory checks**:

1. `npm run check:browsertool-parity` → must exit 0 (value-set parity + all 19 fixtures pass).
2. Run a dogfood session with a known subplan (e.g. `/execute SUBPLAN_PWC2_07_MCP_RETIREMENT_AND_PILOT.md` which declares `BrowserTool: both`) and confirm the hook emits `permissionDecision: "allow"` on every tool call (no false positives).
3. Author a throwaway `_TEST_BROWSERTOOL_CLI.md` subplan with `**BrowserTool**: cli`, invoke `/execute` on it, then call a `mcp__Claude_in_Chrome__*` tool — confirm deny. Delete the test file.
4. Confirm SP-PWC2-07 pilot has measured non-zero token delta AND zero false-positive rate on one real module.

**Enabling**:

Add the following to `.claude/settings.json` under `hooks.PreToolUse[0].hooks[]` (same matcher array as `identity-switch-gate.sh`, but with a wider matcher so browser tools are covered):

```json
{
  "matcher": "Bash|mcp__Claude_in_Chrome__.*",
  "hooks": [
    {
      "type": "command",
      "command": "bash .claude/hooks/browsertool-gate.sh"
    }
  ]
}
```

The `permissions.allow` array already includes the hook's invocation path + the parity-check + the fixtures runner (added at SP-PWC2-06 landing time) so no permission prompt fires.

**Disabling**: remove the entry above. Files stay on disk; a flip-back is reversible.

**After enabling or disabling**: log the action in the activity log.

**Override handshake** (when hook is active):

If an agent genuinely needs the other-class tool mid-subplan (visual check from a `BrowserTool: cli` subplan, or vice versa), the escape path is:

1. Agent emits `[OVERRIDE-REQUEST]` in chat referencing either the tool name, the literal phrase "browser tool", or the subplan basename — with a one-line reason.
2. User types `override approved` (or `override ok` / `approve override` / `authorized to override`) in chat.
3. Next attempt of the same tool within ≤3 assistant turns → hook returns `allow` with an `[OVERRIDE]` reason line.

The override pattern mirrors LR-043 exactly (same tolerant markdown-wrapper regex, same 3-turn window). Overuse is an authoring smell — if a subplan needs ≥2 overrides, the subplan should have been authored `BrowserTool: both` (+ `BrowserToolJustification`) OR split into two subplans.

**Known false-positive classes to watch for during pilot**:

- Subplan's `**BrowserTool**:` frontmatter unreadable or missing → hook fails-open (allow). Expected, not a bug.
- No `/execute <plan>.md` invocation in the transcript (ad-hoc chat session) → hook fails-open (allow). Expected.
- Chain-spawned session where the `.claude/state/chain-sessions/<plan>.log` filename doesn't map to a real file under `plans/pending/` or `plans/done/` → hook fails-open (allow).
- `Bash` command containing `playwright-cli` as a substring but not a real invocation (e.g. `echo "my-playwright-clinic"`) → hook correctly allows (word-boundary regex rejects the false match).

---

## 7. Sources (claim validation trail)

- [playwright.dev/agent-cli Introduction](https://playwright.dev/agent-cli/introduction) — LB1, LB3, LB4
- [microsoft/playwright-cli GitHub](https://github.com/microsoft/playwright-cli) — LB1 (v0.1.8, 2026-04-14), command surface
- [TestCollab — Playwright CLI token efficiency](https://testcollab.com/blog/playwright-cli) — LB2 (cites Playwright team)
- [Pramod Dutta — MCP 114K vs CLI 27K](https://scrolltest.medium.com/playwright-mcp-burns-114k-tokens-per-test-the-new-cli-uses-27k-heres-when-to-use-each-65dabeaac7a0) — LB2 independent reproduction (~89K / ~24K)
- [morphllm — CLI 4× cheaper](https://www.morphllm.com/playwright-mcp) — LB2 corroboration
- [Outpost — the hidden cost of fewer tokens](https://outpost.ranger.net/post/the-hidden-cost-of-fewer-tokens/) — NH9 (CONFIRMED, 2026-04-03)
- [Claude for Chrome — Anthropic](https://claude.com/claude-for-chrome) — product overview (LB5/LB6 primary ref is code.claude.com)
- [Claude Code with Chrome docs — Anthropic](https://code.claude.com/docs/en/chrome) — LB5, LB6, LB7 (official)
