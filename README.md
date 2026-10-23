# James — drink bot

## Layout

- `ui/` — the touchscreen kiosk UI. Vite + React + TypeScript, talking to
  `server/` on `localhost:8000`. Replaced the original React Native Web /
  CRA-webpack4 app (kept no native iOS/Android use anyway — this was always
  just a web page in a Chromium kiosk).
- `server/` — Node.js backend that runs on the Pi, drives the servos over
  GPIO (`servoblaster`), and persists bottle/recipe config as JSON files.
- `scripts/deploy.sh` — runs on the Pi via cron. Pulls this repo, and on a
  change: reinstalls/rebuilds both `server/` and `ui/`, deploys the built UI
  to `/var/www/html`, and restarts the backend. See its own header comment.
- `dashboard/` — public, read-only status dashboard. Static site, deployed
  to **GitHub Pages** on every push (`.github/workflows/deploy-dashboard.yml`).
- `cloudflare/` — public API backing the dashboard. Cloudflare Pages
  Functions + D1, deployed on every push (`.github/workflows/deploy-cloudflare.yml`).
  See `cloudflare/README.md` for one-time setup (D1 database, secrets).

## How the bot works

1. **UI (`ui/src/App.tsx`)** opens a `socket.io` connection to the backend
   and renders bottles/recipes from `servoState` events plus a couple of
   plain `fetch` calls (`ui/src/api.ts`).
2. Picking a drink (or generating one with AI, see below) shows
   `PourScreen`; tapping "Serve it!" `POST`s to `/drinkme` on the backend —
   either `{drink: name}` for a saved recipe or `{recipe: {...}}` for an
   ad-hoc one that hasn't been saved yet.
3. **Backend (`server/index.js`)**'s `/drinkme` handler calls `pourDrink()`,
   which figures out how many servo-open cycles each ingredient needs
   (`ingredient.serving / bottle.serving`), staggering them with
   `setTimeout` so bottles don't pour simultaneously (`pourTimeoutMs = 8s`
   per cycle).
4. Each cycle calls `openServo()`, which shells out to `servoblaster`
   (`/dev/servoblaster`) via `child_process.exec` to move the GPIO-driven
   servo that tips a bottle, then closes it again after `openTime`.
   `servos_config.json` maps bottle slot index → GPIO pin.
5. While pouring, the backend emits `servoState` events over the socket so
   the UI can animate which bottle is currently active, and decrements
   `bottle.capacity` in memory so the UI can warn when a bottle is running low.
6. Bottle/recipe admin screens (PIN-gated in the UI — see security note
   below) call `/getBottles`, `/setBottles`, `/getRecipes`, `/setRecipes`,
   `/getAvailableBottles`, `/setAvailableBottles`, which read/write the
   `*_config.json` files.
7. `metrics.json` (drinks served, alcohol poured) is written on every pour
   and polled by `server/reporter.js` (cron, ~1/min) out to the public
   dashboard — see below.

### AI-generated drinks

The "✨ Surprise me" button just picks a random drink from the current menu
(client-side, no AI). The "🤖 AI drink" button next to it calls `POST /api/generate-drink`
(`server/ai.js`), which asks Claude (Anthropic API, called directly over
HTTPS — not the official SDK, since the Pi's server runtime predates it,
see below) for a cocktail using only the bottles currently loaded, in
multiples of each bottle's own pour size. The response is validated
server-side (`validateRecipe`, unit-tested in `server/ai.test.js`) before
it's handed back, and again when it's actually poured — an AI recipe is
never trusted blindly. After pouring, the UI prompts for a name and
`POST /api/save-recipe` adds it to the permanent menu.

### Live-state vs. code

`bottles_config.json`, `recipes_config.json`, `available_bottles_config.json`
and `metrics.json` are **runtime state**, not code — they change on every
pour and every admin edit. `server/index.js` resolves them via
`JAMES_DATA_DIR` (see `server/.env.example`): set on the Pi, they live
outside this git checkout entirely, so `scripts/deploy.sh`'s `git reset
--hard` can never clobber live bottle levels or a recipe someone just
saved. Unset (local dev), they sit next to `index.js` as committed, for a
quick start.

### Runtime versions, deliberately mismatched

The Pi's system Node is v10 (Raspbian Buster) — `server/*.js` is written in
Node 10-compatible syntax on purpose (no optional chaining, no global
`fetch`, `node-fetch@2` pinned). Vite needs Node 18+, so `scripts/deploy.sh`
builds `ui/` under a separate Node 18 installed via `nvm` (see its header
comment), while the backend keeps running on system Node. Don't "clean up"
by bumping a dependency past what the Pi's actual runtime supports without
checking `node -v` there first.

### Auto-deploy and knowing when to reload

`scripts/deploy.sh` on a 5-minute cron pulls this repo and redeploys on any
change. Since a backend restart doesn't make an already-open kiosk tab
reload itself, the UI polls `GET /api/version` (`VersionBanner.tsx`) against
its own build-time SHA (`__APP_VERSION__`, set by the deploy script) and
shows a reload prompt when they drift apart.

### Security notes

- The admin PIN is checked **client-side only**, inside the bundle — it
  deters casual taps on a kiosk touchscreen, it is not real auth. Read from
  `VITE_ADMIN_PIN` (see `ui/.env.example`), not hardcoded.
- `ANTHROPIC_API_KEY`, `JAMES_REPORT_TOKEN`, etc. live in `server/.env`,
  never in git (see `server/.env.example`).

## Public dashboard

```
Pi (server/reporter.js, cron every ~1 min)
   --POST /api/report (bearer token)-->
Cloudflare Pages Functions (cloudflare/functions/api/) + D1
   <--GET /api/dashboard (public, CORS open)--
dashboard/ (static site) on GitHub Pages
```

Reads are public and unauthenticated; writes require `REPORT_TOKEN`. See
`cloudflare/README.md` for setup. `reporter.js` reports on a timer, not
per-pour — wiring a live pour event into it is a documented follow-up (see
comments in `server/reporter.js` / `cloudflare/functions/api/report.js`).
