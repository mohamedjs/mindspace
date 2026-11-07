#!/usr/bin/env bash
# run-phase.sh <flash|argon> <plan file>: build, then resume after network failures.
cd /var/www/html/old/mindspace-v2 || exit 2
H="$HOME/.claude/skills/delegate/delegate.sh"; export DELEGATE_TIMEOUT=50m
timeout 55m "$H" build "$1" "$2"; rc=$?
for i in 1 2 3 4; do
  grep -qE 'network issue|no such host|interrupted|UNAVAILABLE|503' "$2.run.log" 2>/dev/null || [ "$rc" = 124 ] || break
  echo "== retry $i (rc=$rc)"; sleep 120
  until getent hosts daily-cloudcode-pa.googleapis.com >/dev/null; do sleep 60; done
  timeout 55m "$H" reply "$1" "$2" "The last attempt stopped on a network failure, not a code problem. Continue from the current working tree, finish all remaining tasks, run every acceptance check, and report done or blocked in the required format."; rc=$?
done
echo "final rc=$rc"
