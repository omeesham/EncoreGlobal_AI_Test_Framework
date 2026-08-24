#!/usr/bin/env bash
# prune-deliverable.sh
# Removes non-deliverable clutter from the shipped bundle (ZERO-RISK items only).
#   Bucket A - generated runtime artifacts (git-ignored, regenerated next run)
#   Bucket B - reference docs that no code reads (no xlsx parser in the project)
#
# Does NOT touch framework code, tests, page objects, selectors, or data.
# Does NOT remove the orphaned `local-office` module (needs code unwiring first).
#
# Usage:
#   bash scripts/prune-deliverable.sh            # dry run
#   bash scripts/prune-deliverable.sh --execute  # actually delete
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"

targets=(
  # Bucket A: generated runtime artifacts
  "reports"
  "logs/test-execution.log"
  ".auth/encore-state.json"
  ".auth/encore-state.lock-target"
  # Bucket B: reference docs nothing loads at runtime
  "testcases"
)

execute=0
[[ "${1:-}" == "--execute" ]] && execute=1

if [[ $execute -eq 1 ]]; then echo "== prune-deliverable :: DELETING =="; else echo "== prune-deliverable :: DRY RUN (pass --execute to remove) =="; fi
echo

found=0
for rel in "${targets[@]}"; do
  full="$root/$rel"
  if [[ -e "$full" ]]; then
    found=$((found+1))
    if [[ -d "$full" ]]; then kind="dir "; else kind="file"; fi
    echo "  [remove] $kind $rel"
    [[ $execute -eq 1 ]] && rm -rf "$full"
  else
    echo "  [skip  ] not present: $rel"
  fi
done

echo
if [[ $found -eq 0 ]]; then
  echo "Nothing to remove - already clean."
elif [[ $execute -eq 1 ]]; then
  echo "Done. Removed $found item(s)."
else
  echo "Dry run complete: $found item(s) would be removed. Re-run with --execute."
fi
