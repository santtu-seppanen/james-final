// Admin API (bearer ADMIN_TOKEN), used by the config UI in public/.
//
//   GET  /api/admin/overview                  device state + the current config
//   GET  /api/admin/config                    current config (full body, live bottles included)
//   PUT  /api/admin/config                    {config, note?, baseVersion?} -> save the config; the
//                                             bottles in it are saved live instead (no version of their own)
//   GET  /api/admin/bottles                   the live bottle setup
//   PUT  /api/admin/bottles                   {bottles} -> replaces it at once, no version
//   GET  /api/admin/stats?hours=              pours, per-recipe/per-bottle totals, history
//   GET  /api/admin/schema                    settings schema + validation constants

import {json, error, readJson, HttpError, authorOf} from '../http.js';
import {getCurrent, getEffective, getBottleSetup, publish, setBottleSetup} from '../config-store.js';
import validate from '../../shared/config-validate.js';
import settingsSchema from '../../shared/settings-schema.js';

const ONLINE_WINDOW_MS = 3 * 60 * 1000; // offline if no report in 3 min (device reports every ~1 min)

function parseJsonColumn(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch (e) {
    return fallback;
  }
}

function deviceStateOf(row) {
  if (!row) return null;
  const lastSeenMs = row.last_seen ? Date.parse(row.last_seen) : 0;
  return {
    online: Date.now() - lastSeenMs < ONLINE_WINDOW_MS,
    firstSeen: row.first_seen,
    lastSeen: row.last_seen,
    uptimeS: row.uptime_s,
    deviceVersion: row.device_version,
    serverReachable: row.server_reachable === null ? null : Boolean(row.server_reachable),
    appliedConfig: {
      version: row.applied_version,
      etag: row.applied_etag,
      status: row.applied_status,
      error: row.applied_error,
      at: row.applied_at,
    },
    bottles: parseJsonColumn(row.bottles_json, []),
    recipes: parseJsonColumn(row.recipes_json, []),
    availableBottles: parseJsonColumn(row.available_bottles_json, []),
    counters: parseJsonColumn(row.counters_json, {}),
    bottleCounters: parseJsonColumn(row.bottle_counters_json, {}),
    errors: parseJsonColumn(row.errors_json, []),
    system: parseJsonColumn(row.system_json, {}),
  };
}

export async function overview(request, env) {
  const [row, current] = await Promise.all([
    env.DB.prepare('SELECT * FROM device_state WHERE device_id = ?').bind(env.DEVICE_ID).first(),
    getEffective(env.DB, env.DEVICE_ID),
  ]);
  const device = deviceStateOf(row);
  return json({
    deviceId: env.DEVICE_ID,
    serverTime: new Date().toISOString(),
    device,
    config: current && {version: current.version, etag: current.etag, author: current.author, note: current.note, createdAt: current.createdAt, bottlesUpdatedAt: current.bottlesUpdatedAt},
    // "pending" = a config exists that the device hasn't reported applying yet.
    pending: Boolean(current && (!device || device.appliedConfig.etag !== current.etag)),
  });
}

export async function getConfig(request, env) {
  const current = await getEffective(env.DB, env.DEVICE_ID);
  if (!current) return error('no config published yet', 404);
  return json(current, 200, {etag: current.etag});
}

export async function putConfig(request, env) {
  let body;
  try {
    body = await readJson(request);
  } catch (e) {
    if (e instanceof HttpError) return error(e.message, e.status);
    throw e;
  }
  // A config without bottles keeps the ones that are live now.
  const live = await getBottleSetup(env.DB, env.DEVICE_ID);
  const input = body?.config;
  const withBottles = input && typeof input === 'object' && input.bottles === undefined && live ? {...input, bottles: live.bottles} : input;
  const result = validate.validateConfig(withBottles);
  if (!result.ok) return error('invalid config', 400, {errors: result.errors});

  // Optimistic concurrency: the UI sends the version it edited from, so two
  // people (or two tabs) can't silently overwrite each other.
  if (body.baseVersion !== undefined && body.baseVersion !== null) {
    const current = await getCurrent(env.DB, env.DEVICE_ID, false);
    const currentVersion = current?.version ?? 0;
    if (Number(body.baseVersion) !== currentVersion) {
      return error('config changed since you loaded it', 409, {currentVersion});
    }
  }

  // Bottles are live: saved in place, never a version of their own.
  const bottles = await setBottleSetup(env.DB, env.DEVICE_ID, result.config.bottles, {author: authorOf(request)});
  const published = await publish(env.DB, env.DEVICE_ID, result.config, {
    author: authorOf(request),
    note: typeof body.note === 'string' ? body.note.slice(0, 200) : null,
  });
  const effective = await getEffective(env.DB, env.DEVICE_ID);
  return json(
    {
      version: published.version,
      etag: effective.etag,
      createdAt: published.createdAt,
      unchanged: published.unchanged,
      bottlesChanged: bottles.changed,
      config: effective.config,
    },
    published.unchanged && !bottles.changed ? 200 : 201,
  );
}

export async function getBottles(request, env) {
  const setup = await getBottleSetup(env.DB, env.DEVICE_ID);
  if (!setup) return error('no bottles yet', 404);
  return json(setup, 200, {etag: setup.etag});
}

export async function putBottles(request, env) {
  let body;
  try {
    body = await readJson(request);
  } catch (e) {
    if (e instanceof HttpError) return error(e.message, e.status);
    throw e;
  }
  const current = await getCurrent(env.DB, env.DEVICE_ID, true);
  if (!current) return error('no config published yet', 404);
  // Validated like any config: bottle names must be in availableBottles and
  // the recipes still have to fit the new setup.
  const result = validate.validateConfig({...current.config, bottles: body?.bottles});
  if (!result.ok) return error('invalid bottles', 400, {errors: result.errors});
  const saved = await setBottleSetup(env.DB, env.DEVICE_ID, result.config.bottles, {author: authorOf(request)});
  return json(saved, saved.changed ? 201 : 200, {etag: saved.etag});
}

export async function stats(request, env) {
  const url = new URL(request.url);
  const hours = Math.min(24 * 365, Math.max(1, Number(url.searchParams.get('hours')) || 24 * 7));
  const since = new Date(Date.now() - hours * 3600e3).toISOString();
  const db = env.DB;
  const deviceId = env.DEVICE_ID;

  const [pours, perRecipe, history, row] = await Promise.all([
    db
      .prepare('SELECT recipe_id, friendly_name, alcohol_ml, ingredients_json, poured_at FROM pours WHERE device_id = ? AND poured_at >= ? ORDER BY poured_at DESC LIMIT 100')
      .bind(deviceId, since)
      .all(),
    db
      .prepare(
        'SELECT COALESCE(friendly_name, recipe_id) AS name, COUNT(*) AS count, SUM(alcohol_ml) AS alcohol_ml FROM pours WHERE device_id = ? AND poured_at >= ? GROUP BY name ORDER BY count DESC LIMIT 20',
      )
      .bind(deviceId, since)
      .all(),
    db
      .prepare('SELECT reported_at, uptime_s, drinks_served, alcohol_ml, bottles_json, error_count FROM stats_history WHERE device_id = ? AND reported_at >= ? ORDER BY reported_at ASC LIMIT 2000')
      .bind(deviceId, since)
      .all(),
    db.prepare('SELECT bottle_counters_json, counters_json FROM device_state WHERE device_id = ?').bind(deviceId).first(),
  ]);

  return json({
    hours,
    since,
    pours: (pours.results ?? []).map((p) => ({
      recipeId: p.recipe_id,
      friendlyName: p.friendly_name,
      alcoholMl: p.alcohol_ml,
      ingredients: parseJsonColumn(p.ingredients_json, null),
      pouredAt: p.poured_at,
    })),
    perRecipe: (perRecipe.results ?? []).map((r) => ({name: r.name, count: r.count, alcoholMl: r.alcohol_ml})),
    bottleCounters: parseJsonColumn(row?.bottle_counters_json, {}),
    counters: parseJsonColumn(row?.counters_json, {}),
    history: (history.results ?? []).map((h) => ({
      reportedAt: h.reported_at,
      uptimeS: h.uptime_s,
      drinksServed: h.drinks_served,
      alcoholMl: h.alcohol_ml,
      bottles: parseJsonColumn(h.bottles_json, []),
      errorCount: h.error_count,
    })),
  });
}

export function schema() {
  return json({
    schemaVersion: validate.SCHEMA_VERSION,
    maxSlots: validate.MAX_SLOTS,
    servings: validate.SERVINGS,
    maxCapacityMl: validate.MAX_CAPACITY_ML,
    settings: settingsSchema.SECTIONS,
    settingsDefaults: settingsSchema.defaults(),
  });
}
