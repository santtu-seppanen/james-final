#!/bin/sh
# Starts the kiosk browser. Run by kiosk.service, which restarts it if
# Chromium ever exits or crashes. Waits for X and for the drink server
# first so the screen never shows a browser error page.
until xset q > /dev/null 2>&1; do sleep 0.5; done
until curl -sf http://localhost:8000/api/version > /dev/null; do sleep 0.5; done

# A crashed Chromium leaves "didn't shut down correctly" behind.
sed -i 's/"exited_cleanly": *false/"exited_cleanly": true/; s/"exit_type": *"Crashed"/"exit_type": "Normal"/' \
  "$HOME/.config/chromium/Default/Preferences" 2> /dev/null

exec chromium-browser --kiosk --incognito --noerrdialogs --disable-infobars \
  --disable-translate --check-for-update-interval=31536000 \
  --overscroll-history-navigation=0 --disk-cache-dir=/tmp/chromium-cache \
  http://localhost:8000
