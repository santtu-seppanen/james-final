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

restart_server() {
  echo "Restarting backend..."
  pkill -f "node $REPO_DIR/server/index.js" || true
  sleep 1
  cd "$REPO_DIR/server"
  setsid node index.js > server.log 2>&1 < /dev/null &
  cd "$REPO_DIR"
}

if [ "$LOCAL" != "$REMOTE" ]; then
  echo "Deploying $REMOTE (was $LOCAL)"
  git reset --hard HEAD
  git pull origin main

  NEW_SHA=$(git rev-parse HEAD)

  echo "Installing backend deps..."
  cd "$REPO_DIR/server"
  npm install
  echo "$NEW_SHA" > VERSION
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

  restart_server
else
  echo "No changes from upstream"
  if ! pgrep -f "node $REPO_DIR/server/index.js" > /dev/null; then
    restart_server
  fi
fi
