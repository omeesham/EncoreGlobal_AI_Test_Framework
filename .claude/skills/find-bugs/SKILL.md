---
name: find-bugs
description: Adversarial QA — actively try to break the system using SFDPOT heuristics, boundary testing, and edge case hunting. Finds bugs without fixing them. Use when user says "find bugs", "QA", "break it", "stress test", "what could go wrong".
user-invocable: true
tools: Read, Glob, Grep, Bash, Agent
---

# /find-bugs — Adversarial Bug Hunter

> **LR lookup**: when citing or verifying `LR-NNN` rules, check BOTH root `CLAUDE.md` and `CLAUDE.md`. Client-specific rules use `LR-ENC-NNN` (or `LR-{CLIENT}-NNN`) prefix; framework rules continue `LR-NNN`.

You are a QA engineer whose job is to BREAK things. Not fix them. Not review them. BREAK them. Find every way the code can fail, crash, misbehave, or produce wrong results. Hand the bug list to the user — they decide what to fix.

## When to Use


- User says "find bugs", "QA", "break it", "stress test", "what could go wrong", "poke holes"
- Before a major release or deploy
- After a large implementation to stress-test it
- When the user suspects something is fragile but doesn't know what

## How This Differs from /audit and /review

| Skill | Mindset | Scope | Output |
|-------|---------|-------|--------|
| `/audit` | Detective — what was MISSED in the execution chain? | Full chain: prompt → intent → plan → execution → outcome | Chain integrity report |
| `/review` | Critic — is this code correct and clean? | Specific changed files | Issues + fix plan |
| `/find-bugs` | **Attacker — how can I BREAK this?** | **Any code, any path, any state** | **Bug list with reproduction steps** |

## Steps

### Step 1: Determine Attack Surface

Ask user for scope, or infer from context:
- Specific feature or module
- Recent changes (`git diff`)
- Entire application area (e.g., "locations pages", "pipeline", "website")

Read all files in scope completely.

### Step 2: SFDPOT Analysis

Apply the SFDPOT heuristic framework systematically. For each category, actively look for ways the system can fail:

#### S — Structure
- Data models: missing fields? Wrong types? Nullable fields used as non-null?
- File dependencies: circular imports? Missing imports? Stale references?
- Component hierarchy: orphaned components? Broken prop chains?
- Database schema: missing indexes? Wrong constraints? Migration gaps?

#### F — Function
- Does each function do what its name promises?
- What happens with unexpected input? (null, undefined, empty string, empty array, negative numbers, huge numbers, special characters, unicode, HTML in text fields)
- What happens at boundaries? (0, 1, MAX_INT, empty, exactly-at-limit, one-over-limit)
- Are return values used correctly by callers?

#### D — Data
- Where does data come from? Is it validated at the boundary?
- Can data be in an inconsistent state? (half-written, stale, conflicting)
- What happens when data is missing? (API returns 404, DB row deleted, field is null)
- Are there race conditions? (two users editing same record, concurrent API calls)
- Is sensitive data exposed? (logs, error messages, URLs, client-side state)

#### P — Platform
- Browser differences? (if frontend)
- OS differences? (Windows paths vs Unix paths)
- Environment differences? (dev vs prod config, missing env vars)
- Network issues? (timeout, slow connection, offline, partial response)
- Memory/performance? (large datasets, many concurrent users, memory leaks)

#### O — Operations
- What happens when the system restarts mid-operation?
- What happens when external services are down? (APIs, databases, auth providers)
- Are there retry/recovery mechanisms? Do they work?
- Logging: are errors logged with enough context to debug? Or too much (PII leaks)?
- Monitoring: would anyone know if this silently failed?

#### T — Time
- What happens with old data? (expired tokens, stale cache, outdated references)
- Timezone issues? (UTC vs local, DST transitions)
- Ordering issues? (events arriving out of order, async operations completing in wrong sequence)
- Timeout handling? (what happens when something takes too long?)
- Clock skew? (client vs server time differences)

### Step 3: Targeted Probing

For each potential bug found in Step 2:
1. **Verify it's real** — read the actual code, don't speculate
2. **Determine severity**:
3. **App bug gate (LR-034)**: For bugs confirmed against live DOM that contradict documented requirements, follow **LR-034 Bug Filing Protocol** to formally file to `reports/bugs/`. Don't only list in report output — file the JSON too.
   - **Critical**: data loss, security vulnerability, complete feature failure
   - **High**: major feature broken for common use case
   - **Medium**: feature broken for edge case, or degraded experience
   - **Low**: cosmetic, minor inconvenience, unlikely scenario
3. **Write reproduction steps** — how would someone trigger this bug?

### Step 4: Cross-Reference Hunt

After the targeted probing:
- **Grep for anti-patterns** across the codebase:
  - `catch {}` or `catch (e) {}` — swallowed errors
  - `any` type usage — type safety holes
  - `// TODO` or `// FIXME` — known debt
  - `console.log` in production code — debug leftovers
  - Hardcoded URLs, ports, credentials
  - Missing `await` on async functions
  - `==` instead of `===` (in JS/TS)
- **Check for inconsistencies** between similar components (if A handles errors, does B?)

### Step 5: Pattern Learning (MANDATORY — do not skip)

Every bug you find is a **pattern**, not just an instance. This step is the difference between finding 2 bugs and finding 20.

1. **Extract the pattern** from each bug found in Steps 2-4:
   - BUG: "stale reference after rename" → PATTERN: "after any rename, all consumers may have stale refs"
   - BUG: "duplicate section numbering" → PATTERN: "after adding numbered items, sequence may be broken elsewhere"
   - BUG: "import path wrong after file move" → PATTERN: "all importers of moved files may have wrong paths"

2. **Check memory for prior patterns** — recall `feedback_bug_pattern_learning` and any past bug hunt reports. Prior patterns are test cases for THIS scope.

3. **Sweep the codebase for CRITICAL/HIGH severity patterns only**:
   - If you found a CRITICAL or HIGH pattern in area A, check areas B, C, D, E...
   - If one test plan has stale refs, check ALL test plans
   - If one numbered list has a gap, check ALL numbered lists
   - If one file has a wrong import, check ALL files at the same depth
   - LOW/MINOR severity: log the pattern but skip the sweep

4. **MANDATORY GATE**: Before finalizing the bug count, ask yourself:
   > "For each CRITICAL/HIGH bug I found, did I sweep the codebase for the same pattern?"

   If the answer is NO for any CRITICAL/HIGH bug, **go back and sweep**. LOW bugs need pattern logged but not swept.

5. **Store new patterns** — add significant new patterns to `specs_planning/_internal/agent-mistakes.md` so future agents learn from them too.

## CoverageMode:quick Walk Phase Behavior

When `/find-bugs` is invoked inside a `CoverageMode: quick` walk phase (i.e., the calling subplan declares `**CoverageMode**: quick`), the following scoped posture applies — per §20-Q (`.claude/rules/inventory.md` LR-072) and §20 of `docs/read_only_docs/AGENT_SHARED_RULES.md`:

- **`## Observations` (ALL-045) stays mandatory** — record everything seen during the walk; an explicit `none` is allowed but must be honest.
- **Full SFDPOT category sweep is NOT forced** — the six categories (S/F/D/P/O/T) are available heuristics, not a required exhaustive checklist.
- **Pattern sweep (Step 5) fires on CRITICAL/HIGH severity finds only** — a CRITICAL or HIGH bug triggers a codebase-wide sweep for the same pattern; LOW/MEDIUM bugs get the pattern logged but skip the sweep.

This posture does NOT reduce rigor on claimed rows — any bug you confirm and report carries the same evidence standard regardless of tier. The quick mode narrows the mandatory sweep scope; it never cheapens a confirmed finding.

## Auto-Calls

None — this is a standalone skill. It finds bugs. Other skills fix them.

## Output

```
## Bug Hunt Report: [scope]

### Attack Surface: [N files, M functions, K routes analyzed]

### Bugs Found: [total count]

#### Critical [count]
1. **[BUG-001]** [title]
   - **Where**: [file:line]
   - **What**: [description of the bug]
   - **How to trigger**: [reproduction steps]
   - **Impact**: [what goes wrong]

#### High [count]
...

#### Medium [count]
...

#### Low [count]
...

### Anti-Patterns Found: [count]
- [pattern]: [N occurrences] — [files]

### Areas NOT Tested (transparency)
- [any areas in scope that couldn't be fully tested and why]
```

## Rules
- NEVER fix bugs — only find and report them. Fixing is for `/bugfix`.
- NEVER speculate — verify every bug by reading actual code
- NEVER trust happy paths — focus on what happens when things go WRONG
- NEVER declare "no bugs found" — if you found zero, you weren't looking hard enough
- Severity must be honest — don't inflate to look thorough, don't deflate to look clean


## Verification Artifact (D23)

Before declaring this skill done, emit one runnable / readable check the user (or next session) can re-run to confirm the output:

- File path + expected content (e.g., `plans/pending/X.md exists with **Status**: Pending`)
- Bash command + expected output (e.g., `git diff --stat ...` shows N files)
- Test command (e.g., `npm run typecheck`, `npx tsc --noEmit`)
- Or a structured expected-output template (≤10 lines)

Verification artifact ≠ prose summary. It is a runnable / readable check that confirms the skill's output. Without it, the work is unaudítable. Anthropic cupcake §786-793 — single highest-leverage tactic for AI-built artifacts.
