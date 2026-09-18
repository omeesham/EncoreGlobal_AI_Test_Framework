---
name: regression-guard
description: Structural fingerprint before and after changes — snapshot exports, imports, routes, function signatures, diff for silent breakage. Use when making code changes, or say "check for regressions" or "did anything break".
user-invocable: true
auto-calls: none
tools: Bash, Grep, Glob, Read, Agent
---

# /regression-guard — Structural Fingerprinting

Captures a structural snapshot of your codebase BEFORE and AFTER changes to catch anything that silently broke. This is fundamentally different from `/audit` — audit reviews what WAS done, regression-guard catches what SILENTLY CHANGED.

## When to Use


- **Auto-called** by `/bugfix` (before + after fix phase)
- **Auto-called** by `/cleanup` (before + after removal phase)
- **Auto-called** by `/deploy` (before push)
- **Manual**: user says "check for regressions", "did anything break", "fingerprint", "before/after diff"

## Steps

### Phase 1: BEFORE Snapshot

1. **Determine scope** — accept one of:
   - Explicit file list from the calling skill/user
   - "All files modified since last commit" (`git diff --name-only HEAD`)
   - "All files in directory X"
2. **For each file in scope**, capture structural fingerprint:
   - All `export` statements (named exports, default exports, re-exports)
   - All `import` statements (what is imported, from where)
   - Function/method signatures (name, parameters, return type annotations)
   - Class declarations and their public methods
   - Route definitions (`app.get`, `app.post`, `router.`, express routes)
   - Type/interface declarations (name + exported or not)
   - Constants and config values (`const X =`)
3. **Store fingerprint internally** (in-memory during auto-call, NOT written to disk)
4. **Report**: "BEFORE snapshot: N files, M exports, K functions, J routes"

### Phase 2: AFTER Snapshot

Run this AFTER the changes are made (the calling skill tells you when).

1. **Re-capture** the exact same structural fingerprint for the same files
2. **Diff** the two snapshots field by field
3. **Categorize** each difference:

| Category | Meaning | Action |
|----------|---------|--------|
| **INTENDED** | Change matches what the task/plan asked for | OK — no action |
| **SUSPICIOUS** | Change was NOT in scope — happened as side effect | REVIEW — investigate if intentional |
| **SILENT BREAK** | Something disappeared entirely (export gone, route missing, type removed) | CRITICAL — must be addressed |

4. **Check transitive impacts** for SUSPICIOUS and SILENT BREAK items:
   - Grep for every removed/renamed export across the codebase — who imports it?
   - Grep for every changed route — who calls it?
   - Grep for every renamed type — who uses it?

### Phase 3: Report

```
## Regression Guard Report

### Scope: [N files fingerprinted]

### Changes: [total count]
- Intended: [count] (matched task scope)
- Suspicious: [count] (not in scope — REVIEW)
- Silent breaks: [count] (CRITICAL)

### Suspicious Changes
- [file:line] Export `functionName` removed (was not in change scope)
- [file:line] Import path changed from `../old` to `../new` (side effect?)

### Silent Breaks
- [file:line] Route `POST /api/foo` no longer exists
- [file:line] Type `UserConfig` was exported, now isn't — 3 files import it

### Transitive Impact
- [file] imports removed export `X` — WILL BREAK
- [file] calls removed route `/api/foo` — WILL BREAK

### Verdict: CLEAN | REVIEW NEEDED | BLOCKED
```

## Auto-Calls

None — this is a leaf skill. It is called BY other skills, never calls out.

## Output

The Regression Guard Report above. Verdict determines next action:
- **CLEAN**: Proceed normally
- **REVIEW NEEDED**: Calling skill should investigate suspicious items before continuing
- **BLOCKED**: Calling skill must fix silent breaks before proceeding — do not ship broken code
