#!/bin/sh
# One-time (idempotent) setup of the Pi as a single-purpose kiosk: the
# drink server and the kiosk browser run as supervised systemd services,
# and everything else that isn't needed is switched off so it boots fast.
# Run on the Pi from the repo: sh scripts/setup-pi.sh
# Originals are kept next to the edited files as *.bak-james.
set -e
cd "$(dirname "$0")/.."
REPO_DIR="$(pwd)"

backup() { [ -f "$1" ] && [ ! -f "$1.bak-james" ] && sudo cp "$1" "$1.bak-james"; return 0; }

echo "Installing services..."
sudo cp scripts/systemd/james.service scripts/systemd/kiosk.service /etc/systemd/system/
sudo systemctl daemon-reload

# Services nothing here uses: web server (the drink server now serves the UI
# itself), Bluetooth, printing, VNC, USB automount, package-update timers...
for unit in apache2 nghttpx nginx bluetooth hciuart cups.path cups.socket cups cups-browsed \
            triggerhappy.socket triggerhappy vncserver-x11-serviced udisks2 rsync \
            apt-daily.timer apt-daily-upgrade.timer man-db.timer rpi-eeprom-update gldriver-test; do
  sudo systemctl disable --now "$unit" > /dev/null 2>&1 || true
done

# The desktop session only has to provide X: no panel, no desktop, no
# screensaver, and the kiosk browser is started by kiosk.service instead.
for f in /etc/xdg/lxsession/LXDE-pi/autostart /etc/xdg/lxsession/LXDE/autostart; do
  [ -f "$f" ] || continue
  backup "$f"
  sudo sed -i '/^@lxpanel/d; /^@pcmanfm/d; /^@xscreensaver/d; /^@chromium-browser/d; /exited_cleanly/d' "$f"
done

# Skip the boot splash and delay.
backup /boot/config.txt
grep -q '^disable_splash=' /boot/config.txt || echo 'disable_splash=1' | sudo tee -a /boot/config.txt > /dev/null
grep -q '^boot_delay=' /boot/config.txt || echo 'boot_delay=0' | sudo tee -a /boot/config.txt > /dev/null

echo "Starting the drink server and the kiosk..."
pkill -f "node $REPO_DIR/server/index.js" || true
pkill -f chromium-browser || true
sudo systemctl enable james.service kiosk.service
sudo systemctl restart james.service
sudo systemctl restart kiosk.service
echo "Done. Reboot once to check a cold start: sudo reboot"
