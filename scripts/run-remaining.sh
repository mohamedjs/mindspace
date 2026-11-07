#!/usr/bin/env bash
# Runs the remaining v2 phases with Gemini, stopping at the first phase whose check fails.
# Usage: scripts/run-remaining.sh 08 09 10 11 12
set -uo pipefail
cd "$(dirname "$0")/.." || exit 2
for n in "$@"; do
  plan=$(ls docs/v2/plans/${n}-*.md | head -1); [ -f "$plan" ] || { echo "no plan $n"; exit 2; }
  echo "=== phase $n: $plan"
  scripts/run-phase.sh argon "$plan"
  docker compose --profile tools down -v >/dev/null 2>&1
  if ! docker compose run --rm dev npm run check -w @mindspace/api; then
    echo "API check failed after phase $n. Stopping for review."; exit 1
  fi
  git add -A . && git commit -q -m "feat(v2): phase $n" && echo "checkpoint: $(git log --oneline -1)"
  sed -i "s/^| $n | .*/| $n | Done by Gemini, not reviewed by Claude |/" docs/v2/plans/STATUS.md
done
