# James cloud — config + stats Worker

Cloudflare Worker + D1. Holds the device's configuration (bottles, available
bottles, recipes, LED/sound/show settings) as an append-only version history,
ingests the Pi's status reports, and serves the config UI (`public/`).

Separate from `cloudflare/` (the public dashboard's Pages Functions + D1): that
one mirrors what the Pi reports for a read-only page and queues one-off edits,
this one is the source of truth the Pi pulls from. They can coexist; folding
the dashboard into this Worker later is an option.

```
config UI (public/, bearer ADMIN_TOKEN)
   PUT /api/admin/config  ->  config_versions (v1, v2, ... + ETag)
                                      |
Pi (server/cloud-sync.js, bearer DEVICE_TOKEN, cron ~1/min)
   GET  /api/device/config  If-None-Match  ->  304 | 200 {version, etag, config}
        validate (cloud/shared/config-validate.js) -> write JAMES_DATA_DIR/*.json
   POST /api/device/stats   {uptime, bottles, counters, pours, errors, appliedConfig}
                            <- {config: {version, etag}}   (newer? fetch again)
```

## Config document

`cloud/shared/config-validate.js` is the schema (comments at the top). It and
`settings-schema.js` are CommonJS on purpose: the Worker bundles them and the
Pi's Node 10 `require()`s them, so both sides validate with the same code.

- `bottles[]` — slot order = servo order. `{name, serving (25|50), capacity, refilledAt?}`.
  The Pi keeps its live fill level unless the bottle, its capacity or the
  `refilledAt` stamp is newer than the last one it honoured for that slot
  (= "refilled", level resets to full; rolling back to an older stamp doesn't).
- `availableBottles[]` — names the pickers offer; every loaded bottle must be in it.
- `recipes{id: {friendlyname, ingredients[{name, serving, manual?, wait?}], imageUrl?}}`
  — same shape as `recipes_config.json`. Ingredients must be available bottles
  (or `manual`), and multiples of the loaded bottle's pour size. `imageUrl` is
  the name of one of the kiosk's bundled images (`[A-Za-z0-9_-]`), not a URL.
- `settings{led, audio, show, effects}` — rendered from `settings-schema.js`;
  the Pi writes the defaulted result to `JAMES_DATA_DIR/settings.json` for the
  LED/sound/show code to read. Unknown sections/fields pass through untouched,
  so the Pi side can add a key before the schema catches up. **To add a
  setting, add a field to `settings-schema.js`** — the UI, validation and
  defaults follow.

## API

Device (`Authorization: Bearer <DEVICE_TOKEN>`):

| | |
|---|---|
| `GET /api/device/config` | `If-None-Match: <etag>` → `304`; else `200 {version, etag, publishedAt, note, config}` + `ETag`. `404` before the first publish. |
| `POST /api/device/stats` | body: `{deviceVersion, uptimeS, serverReachable, appliedConfig{version, etag, status: applied\|rejected, error, at}, bottles[{slot, name, capacityMl, originalCapacityMl, servingMl}], recipes[], availableBottles[], counters{drinksServed, alcoholServedMl}, bottleCounters{name: {pours, ml}}, pours[{recipeId, friendlyName, alcoholMl, ingredients?, pouredAt}], errors[{at, source, message}], system{}}` → `{ok, serverTime, config: {version, etag}}` |

Admin (`Authorization: Bearer <ADMIN_TOKEN>`):

| | |
|---|---|
| `GET /api/admin/overview` | device state (+ `online`, 3 min window), current version, `pending` (device hasn't applied the current version) |
| `GET /api/admin/config` | current version with body |
| `PUT /api/admin/config` | `{config, note?, baseVersion?}` → `201 {version, etag, config}`; `200 unchanged` if identical; `400 {errors[]}`; `409 {currentVersion}` if `baseVersion` is stale |
| `GET /api/admin/config/versions?limit=` | history (no bodies) |
| `GET /api/admin/config/versions/:v` | one version with body |
| `POST /api/admin/config/rollback` | `{version, note?}` → new version with that body |
| `GET /api/admin/stats?hours=` | pours, per-recipe totals, per-bottle counters, sampled history |
| `GET /api/admin/schema` | settings schema + validation constants (for the UI) |

`GET /api/health` is public. Responses are `cache-control: no-store` and carry
no CORS headers: the UI is same-origin and the Pi isn't a browser. The UI
itself is served with a strict CSP and `frame-ancestors 'none'`
(`public/_headers`).

## Auth

Two bearer secrets, compared in constant time (both sides SHA-256 hashed
first, so not even the length leaks). An unset secret never authenticates,
so a deploy without secrets is locked rather than open:

- `DEVICE_TOKEN` — the Pi (`JAMES_CLOUD_DEVICE_TOKEN` in `server/.env`). Can
  read config and post stats, nothing else.
- `ADMIN_TOKEN` — typed into the UI (kept in `sessionStorage` for the tab).

Why a token and not Cloudflare Access: one admin, no custom domain needed,
same model the existing dashboard uses, and the API stays curl-able. Use long
random values (`openssl rand -hex 32`); there is no rate limiting. Access
can be layered on top without code changes — put an Access application in
front of the Worker's hostname for `/` (the UI) and the Worker will record
`cf-access-authenticated-user-email` as the version author. If you do, keep
`/api/device/*` out of the Access policy (the Pi has no browser). Without
Access that header is just a label any admin-token holder could set.

The Pi only sends its token over `https://` (plain `http://` is accepted for
`localhost` only, for `wrangler dev`), and validates every config it receives
with the same `config-validate.js` before writing anything.

## One-time setup

```sh
cd cloud
npm install
wrangler login

wrangler d1 create james-cloud
# paste the printed database_id into wrangler.toml
wrangler d1 migrations apply james-cloud --remote

wrangler secret put DEVICE_TOKEN   # long random, e.g. `openssl rand -hex 32`
wrangler secret put ADMIN_TOKEN    # another one, for the UI
wrangler deploy                    # prints the workers.dev URL
```

Pi (`server/.env`):

```
JAMES_CLOUD_URL=https://james-cloud.<account>.workers.dev
JAMES_CLOUD_DEVICE_TOKEN=<the DEVICE_TOKEN value>
```

and a cron line next to `reporter.js`'s:

```
*/1 * * * * node /home/pi/james-final/server/cloud-sync.js >> /home/pi/james-final/cloud-sync.log 2>&1
```

(or run `node cloud-sync.js --daemon` under a supervisor; cron is the
zero-setup option and the state file carries the backoff between runs).

First publish: open the UI, sign in, wait for the Pi's first report, then
"Use device state as draft" → Publish. That v1 equals what the Pi already
has, so applying it changes nothing.

GitHub Actions: `.github/workflows/deploy-cloud.yml` runs the tests on pushes
to `main` touching `cloud/`. Deploying (migrations + `wrangler deploy`, with
the same `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` repo secrets as the
dashboard workflow) is opt-in: set the repository **variable**
`CLOUD_DEPLOY_ENABLED=true` (Settings → Secrets and variables → Actions →
Variables) once the one-time setup above is done. The API token needs
Workers Scripts:Edit and D1:Edit on the account.

## Local dev

```sh
cd cloud
cp .dev.vars.example .dev.vars        # DEVICE_TOKEN / ADMIN_TOKEN for wrangler dev
npm run migrate:local
npm run dev                           # http://localhost:8787 (UI + API, local D1)
```

Point a local `server/cloud-sync.js` at it with
`JAMES_CLOUD_URL=http://localhost:8787 JAMES_CLOUD_DEVICE_TOKEN=dev-device-token JAMES_DATA_DIR=/tmp/james node cloud-sync.js`.

## Tests

```sh
npm test            # unit (validator) + integration (wrangler dev + fresh local D1)
```

The sync client's tests live in `server/` (`npx jest cloud-sync`).
