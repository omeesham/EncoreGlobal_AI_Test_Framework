#!/usr/bin/env bash
# bug-baseline-gate.sh — PreToolUse wrapper for the LR-034 baselineComparison enum gate.
# Fires on PreToolUse (matcher: "Edit|Write|NotebookEdit").
#
# Fail-OPEN: any error → reason appended to .claude/state/hook-failures.log, allow.
# A broken gate must never wedge the session.
#
# Companion hooks: jargon-gate.sh, todo-injection-gate.sh, identity-switch-gate.sh,
# plan-closure-gate.sh. Rule bodies: LR-034 / LR-044 / LR-045.

set -u

input=$(cat 2>/dev/null || true)

# Recursive-call guard (defensive).
if printf '%s' "$input" | grep -q '"stop_hook_active"[[:space:]]*:[[:space:]]*true'; then
  exit 0
fi

lib_path="$(dirname "${BASH_SOURCE[0]}")/lib/check-bug-baseline.mjs"

if [ ! -f "$lib_path" ]; then
  mkdir -p .claude/state 2>/dev/null || true
  printf '%s\n' "$(date -u +%FT%TZ) bug-baseline-gate.sh: lib missing at $lib_path; allowing." \
    >> .claude/state/hook-failures.log 2>/dev/null || true
  exit 0
fi

# Pass full stdin JSON to lib; lib emits the PreToolUse hook-response JSON verbatim.
# The state dir must exist BEFORE the stderr redirect below — a missing dir makes bash skip the
# node call entirely (silent fail-open on a fresh clone).
mkdir -p .claude/state 2>/dev/null || true
result=$(printf '%s' "$input" | node "$lib_path" 2>>.claude/state/hook-failures.log || true)

if [ -n "$result" ]; then
  printf '%s' "$result"
fi

exit 0
