#!/usr/bin/env bash
# One-time: make the server check GitHub every 2 minutes and update itself.
# Usage (as root, from anywhere):  bash ~/jakdang/deploy/install-auto-update.sh
set -euo pipefail

SCRIPT="$(cd "$(dirname "$0")" && pwd)/auto-update.sh"
LOG=/var/log/jakdang-update.log
LINE="*/2 * * * * flock -n /tmp/jakdang-update.lock $SCRIPT >> $LOG 2>&1"

chmod +x "$SCRIPT"
# Replace any older jakdang line, keep everything else in root's crontab.
( crontab -l 2>/dev/null | grep -v 'jakdang/deploy/auto-update.sh' || true; echo "$LINE" ) | crontab -
touch "$LOG"

echo "자동 업데이트를 켰어요 (2분마다 확인)."
echo "기록 보기: tail -f $LOG"
crontab -l | grep auto-update
