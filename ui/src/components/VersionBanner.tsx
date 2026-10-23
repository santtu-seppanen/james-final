import {useEffect, useState} from 'react';
import {getVersion} from '../api';

// The build's own version is baked in at build time (see vite.config.ts /
// package.json build script setting __APP_VERSION__ from `git rev-parse
// HEAD`, declared in vite-env.d.ts). scripts/deploy.sh on the Pi writes
// server/VERSION with the same SHA right after a successful
// pull+build+restart, so /api/version always reflects whatever's actually
// running - if it drifts from what this page was built with, the kiosk is
// running stale JS and should reload.
const POLL_INTERVAL_MS = 60_000;

export function VersionBanner() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    const check = () => {
      getVersion()
        .then((data) => {
          if (data.version && data.version !== 'unknown' && data.version !== __APP_VERSION__) {
            setUpdateAvailable(true);
          }
        })
        .catch(() => {
          // Backend mid-restart during a deploy - ignore, next poll will catch up.
        });
    };

    check();
    const id = window.setInterval(check, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  if (!updateAvailable) return null;

  return (
    <div className="version-banner">
      <span>A new version was deployed.</span>
      <button className="button" onClick={() => window.location.reload()}>
        Reload
      </button>
    </div>
  );
}
