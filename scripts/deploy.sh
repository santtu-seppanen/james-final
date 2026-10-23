#!/bin/sh
# Runs on the Pi via cron every few minutes. Pulls this repo, and if
# anything changed: rebuilds the UI, reinstalls the backend's deps, and
# restarts it. Self-heals too (restarts the backend if it's not running
# even when nothing changed) - same pattern the old per-repo poll-mirror.sh
# scripts used, just unified into one script for this monorepo.
#
# Needs:
#   - system node (whatever's installed) to run server/ - checked for
#     Node 10 compatibility deliberately (see comments in server/*.js).
#   - nvm with Node 18 installed, to build ui/ (Vite needs newer Node than
#     what's installed system-wide here) - see README.md.
#   - JAMES_DATA_DIR (in server/.env) pointing OUTSIDE this checkout, so
#     `git reset --hard` here never touches live bottle/recipe/metrics data.
#
# Crontab:
#   */5 * * * * sh /home/pi/james-final/scripts/deploy.sh >> /home/pi/james-final/deploy.log 2>&1
#   @reboot sh /home/pi/james-final/scripts/deploy.sh >> /home/pi/james-final/deploy.log 2>&1

set -e
cd "$(dirname "$0")/.."
REPO_DIR="$(pwd)"

git fetch
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse @{u})

SERVER_MAIN="$REPO_DIR/server/index.js"

is_server_running() {
  # Match on the absolute path, not just "index.js" - matters once there's
  # more than one checkout of this repo around (e.g. during a migration).
  pgrep -f "node $SERVER_MAIN" > /dev/null
}

restart_server() {
  echo "Restarting backend..."
  pkill -f "node $SERVER_MAIN" || true
  sleep 1
  cd "$REPO_DIR/server"
  # Pass the absolute path as node's argument (rather than relying on cwd)
  # so `ps`/pgrep/pkill all see the same string this function matches on.
  setsid node "$SERVER_MAIN" > server.log 2>&1 < /dev/null &
  cd "$REPO_DIR"
}

if [ "$LOCAL" != "$REMOTE" ]; then
  echo "Deploying $REMOTE (was $LOCAL)"
  git reset --hard HEAD
  git pull origin main

  NEW_SHA=$(git rev-parse HEAD)

  echo "Installing backend deps..."
  cd "$REPO_DIR/server"
  # --production: the Pi's old npm (Node 10) chokes on the "npm:" alias
  # protocol some of jest's transitive deps use, and jest is dev-only
  # anyway (tests run on a real machine, not the Pi).
  npm install --production
  cd "$REPO_DIR"

  echo "Building UI (Node 18 via nvm)..."
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
  nvm use 18
  cd "$REPO_DIR/ui"
  npm install
  APP_VERSION="$NEW_SHA" npm run build
  sudo rm -rf /var/www/html/*
  sudo cp -r build/* /var/www/html/
  cd "$REPO_DIR"

  # Only now - once the new UI is actually being served - tell kiosks a new
  # version exists (server/index.js serves this file at /api/version, and
  # the UI's VersionBanner compares it to the SHA baked into the build).
  # Writing it earlier made the banner appear ~30s before the new build was
  # in /var/www/html, so reloading just fetched the old UI again.
  echo "$NEW_SHA" > "$REPO_DIR/server/VERSION"

  restart_server
else
  echo "No changes from upstream"
  if ! is_server_running; then
    restart_server
  fi
fi
