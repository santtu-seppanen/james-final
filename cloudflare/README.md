# James dashboard — Cloudflare backend

Cloudflare Pages Functions + D1. Serves the public, read-only dashboard data
(`GET /api/dashboard`) and accepts status reports from the Pi
(`POST /api/report`, bearer-token protected).

## One-time setup

```sh
npm install -g wrangler
wrangler login

cd cloudflare
wrangler d1 create james-dashboard
# copy the returned database_id into wrangler.toml

wrangler d1 migrations apply james-dashboard --remote

# create the Pages project (first deploy), then set the write secret:
wrangler pages project create james-dashboard
wrangler pages secret put REPORT_TOKEN   # pick a long random value
wrangler pages secret put ADMIN_TOKEN    # the password typed into the dashboard's "Edit" button
```

Put the same `REPORT_TOKEN` value into the Pi's `server/.env` as
`JAMES_REPORT_TOKEN` (see `server/.env.example` and `server/reporter.js`).

## Editing recipes and bottles from the dashboard

`POST /api/admin/recipes` and `POST /api/admin/bottles` (bearer `ADMIN_TOKEN`)
queue an add/edit/delete in the `recipe_commands` / `bottle_commands` tables. The Pi can't be reached from the internet, so
`server/reporter.js` (every minute) fetches pending commands from
`GET /api/commands`, validates and applies them to `recipes_config.json`
(`server/remote-recipes.js`, `server/remote-bottles.js`), and acks via `POST /api/commands` (bearer
`REPORT_TOKEN`). Edits therefore show up after the next check-in (~1 min).

## Deploys

The GitHub Action (`.github/workflows/deploy-dashboard.yml`) builds
`dashboard/` and deploys it to Cloudflare Pages (which also serves these
Functions) on every push to `main`. It needs two repo secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

## Local dev

```sh
cd cloudflare
wrangler pages dev ../dashboard/dist --d1 DB=james-dashboard
```
