#!/usr/bin/env bash
# Pull-based deploy: run by cron on the server every couple of minutes.
# If the checked-out branch has new commits on GitHub, pull them and rebuild.
# Nothing has to reach into the server, so SSH can stay closed to the internet.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

branch="$(git rev-parse --abbrev-ref HEAD)"
git fetch --quiet origin "$branch"
if [ "$(git rev-parse HEAD)" = "$(git rev-parse "origin/$branch")" ]; then
  exit 0 # already up to date
fi

git pull --ff-only --quiet origin "$branch"
commit="$(git rev-parse --short HEAD)"
cd deploy
GIT_COMMIT="$commit" docker compose up -d --build
docker image prune -f >/dev/null
echo "$(date -Is) deployed $commit"
