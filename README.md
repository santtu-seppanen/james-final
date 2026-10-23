# James — drink bot

## Layout

- `ui/` — legacy touchscreen UI (React Native Web) that runs in kiosk Chromium
  on the Pi. Talks to `server/` over `localhost:8000`.
- `server/` — legacy Node.js backend that runs on the Pi, drives the servos
  over GPIO (`servoblaster`), and persists bottle/recipe config as JSON files.
- `dashboard/` — new public, read-only status dashboard. Static site, deployed
  to **GitHub Pages** on every push (`.github/workflows/deploy-dashboard.yml`).
- `cloudflare/` — new public API backing the dashboard. Cloudflare Pages
  Functions + D1, deployed on every push (`.github/workflows/deploy-cloudflare.yml`).
  See `cloudflare/README.md` for one-time setup (D1 database, secrets).

`ui/` and `server/` are the current production code copied from the Pi for
reference and local testing — they are not changed by the dashboard work.
`server/reporter.js` is new: a small cron script that pushes bottle/recipe/
usage data from the Pi to the Cloudflare API so the public dashboard has
something to show.

## How the bot works (legacy `ui/` + `server/`)

1. **UI (`ui/src/socket.js`, the `Play` screen)** opens a `socket.io` connection
   to `server` on `localhost:8000` and renders the drink carousel from
   `drinks` state pushed over the `servoState` socket event.
2. Picking a drink then tapping "Serve it!" (`ui/src/drink.js`) `POST`s
   `{drink: name}` to `/drinkme` on the backend.
3. **Backend (`server/index.js`)**'s `/drinkme` handler calls `pourDrink()`,
   which looks the recipe up in `recipes_config.json`, and for each
   ingredient figures out how many servo-open cycles are needed
   (`ingredient.serving / bottle.serving`), staggering them with
   `setTimeout` so bottles don't pour simultaneously (`pourTimeoutMs = 8s`
   per cycle).
4. Each cycle calls `openServo()`, which shells out to `servoblaster`
   (`/dev/servoblaster`) via `child_process.exec` to move the GPIO-driven
   servo that tips a bottle, then closes it again after `openTime`.
   `servos_config.json` maps bottle slot index -> GPIO pin.
5. While pouring, the backend emits `servoState` events over the socket so
   the UI can animate which bottle is currently active, and decrements
   `bottle.capacity` in memory so the UI can warn when a bottle is running low.
6. Bottle/recipe admin screens (PIN-gated in the UI — see security note
   below) call `/getBottles`, `/setBottles`, `/getRecipes`, `/setRecipes`,
   `/getAvailableBottles`, `/setAvailableBottles`, which read/write the
   `*_config.json` files directly.
7. Separately, the backend also maintains a running `metrics.json` (drinks
   served, alcohol poured, per-drink breakdown) and pushes it to an internal
   AWS API Gateway WebSocket + mirrors available drinks to S3 — this fed an
   older private dashboard and is being superseded by `dashboard/` +
   `cloudflare/`.
8. Deployment on the Pi is a 5-minute cron (`poll-mirror.sh` in both `ui/`
   and `server/`): `git pull`, reinstall, rebuild, and for the UI, copy the
   built static site into `/var/www/html`, served to the kiosk Chromium via
   `nghttpx` on port 3000.

### Security notes on the legacy code

- The admin PIN is checked **client-side only**, inside the React bundle —
  it deters casual taps on a kiosk touchscreen, it is not real auth. It's now
  read from `REACT_APP_ADMIN_PIN` (see `ui/.env.example`) instead of being
  hardcoded, so a public repo doesn't ship the real PIN, but the mechanism
  itself stays a UI deterrent, not access control.
- The AWS WebSocket endpoint and S3 bucket name are read from `server/.env`
  (see `server/.env.example`) rather than hardcoded, for the same reason.

## New public dashboard

```
Pi (server/reporter.js, cron every ~1 min)
   --POST /api/report (bearer token)-->
Cloudflare Pages Functions (cloudflare/functions/api/) + D1
   <--GET /api/dashboard (public, CORS open)--
dashboard/ (static site) on GitHub Pages
```

- Reads are public and unauthenticated — anyone can view bot status, bottle
  levels, recipes, and recent pours.
- Writes (`POST /api/report`) require `REPORT_TOKEN`, a shared secret set as
  a Cloudflare Pages secret and in `server/.env` (`JAMES_REPORT_TOKEN`) — this
  isn't in git anywhere.
- See `cloudflare/README.md` for one-time Cloudflare setup, and
  `server/reporter.js` for what the Pi sends. `reporter.js` currently reports
  on a timer, not per-pour; wiring a live pour event into it is a documented
  follow-up (see comments in `server/reporter.js` / `cloudflare/functions/api/report.js`).

## Still open / not done in this pass

- Legacy `ui/`/`server/` dependency updates and unit tests (originally
  requested before the dashboard pivot) were not finished — flag if you still
  want those.
- The GitHub repo itself still needs to be created and made public, and the
  Cloudflare project/D1 database/secrets provisioned — see the per-folder
  READMEs. These are outward-facing / credential-bearing steps so they're
  left for an explicit go-ahead rather than done automatically.
