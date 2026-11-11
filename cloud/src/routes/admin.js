// Admin API (bearer ADMIN_TOKEN), used by the config UI in public/.
//
//   GET  /api/admin/overview                  device state + current config version
//   GET  /api/admin/config                    current config (full body)
//   PUT  /api/admin/config                    {config, note?, baseVersion?} -> publish a new version
//   GET  /api/admin/config/versions?limit=    history (no bodies)
//   GET  /api/admin/config/versions/:version  one version (full body)
//   POST /api/admin/config/rollback           {version, note?} -> new version with that body
//   GET  /api/admin/stats?hours=              pours, per-recipe/per-bottle totals, history
//   GET  /api/admin/schema                    settings schema + validation constants

import {json, error, readJson, HttpError, authorOf} from '../http.js';
import {getCurrent, getVersion, listVersions, publish} from '../config-store.js';
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
    getCurrent(env.DB, env.DEVICE_ID, false),
  ]);
  const device = deviceStateOf(row);
  return json({
    deviceId: env.DEVICE_ID,
    serverTime: new Date().toISOString(),
    device,
    config: current,
    // "pending" = a config exists that the device hasn't reported applying yet.
    pending: Boolean(current && (!device || device.appliedConfig.etag !== current.etag)),
  });
}

export async function getConfig(request, env) {
  const current = await getCurrent(env.DB, env.DEVICE_ID, true);
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
  const result = validate.validateConfig(body?.config);
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

  const published = await publish(env.DB, env.DEVICE_ID, result.config, {
    author: authorOf(request),
    note: typeof body.note === 'string' ? body.note.slice(0, 200) : null,
  });
  return json(
    {version: published.version, etag: published.etag, createdAt: published.createdAt, unchanged: published.unchanged, config: published.config},
    published.unchanged ? 200 : 201,
  );
}

export async function versions(request, env) {
  const url = new URL(request.url);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 50));
  return json({versions: await listVersions(env.DB, env.DEVICE_ID, limit)});
}

export async function version(request, env, versionNumber) {
  const v = Number(versionNumber);
  if (!Number.isInteger(v) || v < 1) return error('bad version', 400);
  const found = await getVersion(env.DB, env.DEVICE_ID, v);
  if (!found) return error('no such version', 404);
  return json(found);
}

export async function rollback(request, env) {
  let body;
  try {
    body = await readJson(request);
  } catch (e) {
    if (e instanceof HttpError) return error(e.message, e.status);
    throw e;
  }
  const v = Number(body?.version);
  if (!Number.isInteger(v) || v < 1) return error('version required', 400);
  const target = await getVersion(env.DB, env.DEVICE_ID, v);
  if (!target) return error('no such version', 404);

  // Re-validate: the schema may have grown since that version was stored.
  const result = validate.validateConfig(target.config);
  if (!result.ok) return error('that version no longer validates', 400, {errors: result.errors});

  const published = await publish(env.DB, env.DEVICE_ID, result.config, {
    author: authorOf(request),
    note: typeof body.note === 'string' && body.note ? body.note.slice(0, 200) : `Rollback to v${v}`,
    rolledBackFrom: v,
  });
  return json({version: published.version, etag: published.etag, createdAt: published.createdAt, rolledBackFrom: v}, 201);
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
