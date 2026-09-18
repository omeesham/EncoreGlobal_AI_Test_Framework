#!/usr/bin/env bash
# rca-verdict-gate.sh — Stop-hook wrapper for RCA verdict-without-spawn detection.
#
# Fires on:
#   Stop (no matcher — every Stop event)
#     — locates the most-recent /rca window in the transcript and warns when
#       verdict prose appears without any Agent tool_use spawn in that window.
#       Mama-led orchestration mandates subagent spawns; this gate catches the
#       solo-session bypass that the prose-level skill teaching cannot enforce.
#
# Mode detection: passed as argv[1] from settings.json (`--validate` is the
# only mode this gate uses; Stop hooks don't have a capture phase).
#
# Fail-OPEN policy: any error → write reason to .claude/state/hook-failures.log,
# silent exit 0. A broken gate must never wedge the session.
#
# Companion: rca-verdict-gate.sh + lib/check-rca-verdict.mjs (Stop hook lib).
# State file: .claude/state/rca-warnings-${session_id}.json (read by /audit
# Step 2.8 — Mandatory RCA Verdict-Without-Spawn Scan).

set -u

mode="${1:-}"
input=$(cat 2>/dev/null || true)

# Recursive-call guard (Stop hook may re-fire; bail when already active).
if printf '%s' "$input" | grep -q '"stop_hook_active"[[:space:]]*:[[:space:]]*true'; then
  exit 0
fi

# Empty stdin (harness passes no payload on routine Stop) — silent allow, no node spawn.
if [ -z "$input" ]; then exit 0; fi

if [ -z "$mode" ]; then
  mkdir -p .claude/state 2>/dev/null || true
  printf '%s\n' "$(date -u +%FT%TZ) rca-verdict-gate.sh: missing mode argv[1]; allowing." \
    >> .claude/state/hook-failures.log 2>/dev/null || true
  exit 0
fi

lib_dir="$(dirname "${BASH_SOURCE[0]}")/lib"
lib_path="$lib_dir/check-rca-verdict.mjs"

if [ ! -f "$lib_path" ]; then
  mkdir -p .claude/state 2>/dev/null || true
  printf '%s\n' "$(date -u +%FT%TZ) rca-verdict-gate.sh: lib missing at $lib_path; allowing." \
    >> .claude/state/hook-failures.log 2>/dev/null || true
  exit 0
fi

# Pass mode + full stdin JSON to lib; lib emits stdout verbatim (warning text)
# when verdict-without-Agent is detected, silent otherwise.
result=$(printf '%s' "$input" | node "$lib_path" "$mode" 2>>.claude/state/hook-failures.log || true)

if [ -n "$result" ]; then
  printf '%s' "$result"
fi

exit 0
