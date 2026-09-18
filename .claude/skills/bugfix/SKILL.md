---
name: bugfix
description: General-purpose bug fixing — explore, trace root cause, plan fix, implement, verify, document. Auto-calls /regression-guard before+after. Use for any bug, error, "not working", "broken", or "crash".
user-invocable: true
auto-calls: regression-guard
tools: Read, Glob, Grep, Write, Edit, Bash, Agent, WebSearch
---

# /bugfix — General-Purpose Bug Fixing

> **LR lookup**: when citing or verifying `LR-NNN` rules, check BOTH root `CLAUDE.md` and `CLAUDE.md`. Client-specific rules use `LR-ENC-NNN` (or `LR-{CLIENT}-NNN`) prefix; framework rules continue `LR-NNN`.

Systematic bug fixing with root cause analysis, regression protection, and learning capture. This is NOT the Healer agent (which is pipeline-only for test failures). `/bugfix` handles any bug in any part of the codebase.

## When to Use


- **Manual**: user says "fix bug", "broken", "not working", "error", "crash", "wrong behavior"
- When something unexpected happened during execution
- When Healer agent escalates a pipeline issue beyond its scope

## Steps

### Phase 1: Understand the Bug

1. **Get exact symptoms**: error message, screenshot, steps to reproduce
2. **Verify on live preview** if a server is running — see the bug firsthand
3. **Don't hypothesize yet** — just observe and collect evidence

### Phase 2: Trace Root Cause

Follow the evidence trail — never guess:

1. **Start at the symptom** — what does the user see?
2. **Trace backwards**:
   - UI error → check browser console → check network requests
   - Network error → check backend logs → check route handler
   - Backend error → check the code at the error line → trace data flow
3. **Read the actual code** at the error location — don't assume from memory
4. **Follow the data**: what calls this function? What data flows in? Where could it go wrong?
5. **If stuck**: search online for the exact error message before guessing

### Phase 3: BEFORE Snapshot

Auto-call `/regression-guard` Phase 1 on all files you expect to modify.

### Phase 4: Plan the Fix

1. **Identify the minimal change** that fixes the ROOT CAUSE (not symptoms)
2. **Grep for the same pattern** elsewhere — does this bug exist in other places?
3. **Assess risk**: what could this fix break? Check callers, importers, tests
4. **If the fix touches more than 3 files**: pause and explain the scope to the user

### Phase 5: Implement & Verify

1. **Make the change** — minimal, surgical
2. **Verify on live preview** if possible — actually see the bug is gone
3. **Check related areas** — did the fix cause any side effects?

### Phase 6: AFTER Snapshot

Auto-call `/regression-guard` Phase 2:
- Review the diff report
- Ensure only intended changes occurred
- If SUSPICIOUS or SILENT BREAK items found, investigate before declaring done

### Phase 7: Document

1. **Symptom**: What the user saw
2. **Root cause**: What was actually wrong (code-level)
3. **Fix**: What was changed and why
4. **Pattern check**: Is this bug's pattern already in `specs_planning/_internal/agent-mistakes.md`?
   - If yes: note the existing ID — it's a repeat
   - If no: add a new entry with next sequential R-number
   - If 3+ occurrences now: flag for `/compile-learnings`

## Auto-Calls

- `/regression-guard` — Phase 1 before fix, Phase 2 after fix

## Output

```
## Bug Fix Report

### Symptom
[What the user saw / reported]

### Root Cause
[Code-level explanation — file:line, what was wrong]

### Fix Applied
[What was changed, which files, why this approach]

### Verification
- Live preview: [verified / not applicable]
- Regression guard: [CLEAN / issues found]
- Related areas checked: [list]

### Learning
- Pattern logged: [yes — R-XX / no — new pattern]
- Graduation candidate: [yes — 3+ occurrences / no]
```


## Verification Artifact (D23)

Before declaring this skill done, emit one runnable / readable check the user (or next session) can re-run to confirm the output:

- File path + expected content (e.g., `plans/pending/X.md exists with **Status**: Pending`)
- Bash command + expected output (e.g., `git diff --stat ...` shows N files)
- Test command (e.g., `npm run typecheck`, `npx tsc --noEmit`)
- Or a structured expected-output template (≤10 lines)

Verification artifact ≠ prose summary. It is a runnable / readable check that confirms the skill's output. Without it, the work is unaudítable. Anthropic cupcake §786-793 — single highest-leverage tactic for AI-built artifacts.
