// Device-facing API (bearer DEVICE_TOKEN), called by server/cloud-sync.js on the Pi.
//
//   GET  /api/device/config   If-None-Match: "<etag>"  -> 304, or 200 {version, etag, publishedAt, config}
//   POST /api/device/stats    {...snapshot}             -> {ok, config: {version, etag}}
//
// The stats response carries the current config version so the device
// learns about a new version on its next report even if it only polls
// config rarely.

import {json, error, readJson, HttpError} from '../http.js';
import {getCurrent} from '../config-store.js';

const HISTORY_MIN_INTERVAL_MS = 5 * 60 * 1000;
const HISTORY_RETENTION_DAYS = 30;
const POURS_RETENTION_DAYS = 365;
const MAX_ERRORS = 50;
const MAX_POURS_PER_REPORT = 200;
const MAX_LIST = 64;

export async function getConfig(request, env) {
  const current = await getCurrent(env.DB, env.DEVICE_ID, true);
  if (!current) return error('no config published yet', 404);

  const ifNoneMatch = request.headers.get('if-none-match');
  if (ifNoneMatch && ifNoneMatch.split(',').some((t) => t.trim() === current.etag)) {
    return new Response(null, {status: 304, headers: {etag: current.etag, 'cache-control': 'no-store'}});
  }
  return json(
    {version: current.version, etag: current.etag, publishedAt: current.createdAt, note: current.note, config: current.config},
    200,
    {etag: current.etag},
  );
}

function clampList(value, max) {
  return Array.isArray(value) ? value.slice(0, max) : [];
}

function str(value, max = 200) {
  if (value === undefined || value === null) return null;
  return String(value).slice(0, max);
}

function int(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function isoOrNow(value, now) {
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString();
  return now;
}

export async function postStats(request, env) {
  let payload;
  try {
    payload = await readJson(request, 1024 * 1024);
  } catch (e) {
    if (e instanceof HttpError) return error(e.message, e.status);
    throw e;
  }
  if (!payload || typeof payload !== 'object') return error('body must be an object', 400);

  const db = env.DB;
  const deviceId = env.DEVICE_ID;
  const now = new Date().toISOString();

  const bottles = clampList(payload.bottles, MAX_LIST).map((b, i) => ({
    slot: int(b?.slot) ?? i,
    name: str(b?.name, 60),
    capacityMl: int(b?.capacityMl),
    originalCapacityMl: int(b?.originalCapacityMl),
    servingMl: int(b?.servingMl),
  }));
  const recipes = clampList(payload.recipes, 500);
  const availableBottles = clampList(payload.availableBottles, 200).map((n) => str(n, 60));
  const counters = payload.counters && typeof payload.counters === 'object' ? payload.counters : {};
  const bottleCounters = payload.bottleCounters && typeof payload.bottleCounters === 'object' ? payload.bottleCounters : {};
  const errors = clampList(payload.errors, MAX_ERRORS).map((e) => ({
    at: isoOrNow(e?.at, now),
    source: str(e?.source, 40),
    message: str(e?.message, 500),
  }));
  const system = payload.system && typeof payload.system === 'object' ? payload.system : {};
  const applied = payload.appliedConfig && typeof payload.appliedConfig === 'object' ? payload.appliedConfig : {};

  const statements = [
    db
      .prepare(
        `INSERT INTO device_state (device_id, first_seen, last_seen, uptime_s, device_version, server_reachable,
           applied_version, applied_etag, applied_status, applied_error, applied_at,
           bottles_json, recipes_json, available_bottles_json, counters_json, bottle_counters_json, errors_json, system_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(device_id) DO UPDATE SET
           last_seen = excluded.last_seen,
           uptime_s = excluded.uptime_s,
           device_version = excluded.device_version,
           server_reachable = excluded.server_reachable,
           applied_version = excluded.applied_version,
           applied_etag = excluded.applied_etag,
           applied_status = excluded.applied_status,
           applied_error = excluded.applied_error,
           applied_at = excluded.applied_at,
           bottles_json = excluded.bottles_json,
           recipes_json = excluded.recipes_json,
           available_bottles_json = excluded.available_bottles_json,
           counters_json = excluded.counters_json,
           bottle_counters_json = excluded.bottle_counters_json,
           errors_json = excluded.errors_json,
           system_json = excluded.system_json`,
      )
      .bind(
        deviceId,
        now,
        now,
        int(payload.uptimeS),
        str(payload.deviceVersion, 80),
        payload.serverReachable === false ? 0 : 1,
        int(applied.version),
        str(applied.etag, 80),
        str(applied.status, 20),
        str(applied.error, 500),
        applied.at ? isoOrNow(applied.at, now) : null,
        JSON.stringify(bottles),
        JSON.stringify(recipes),
        JSON.stringify(availableBottles),
        JSON.stringify(counters),
        JSON.stringify(bottleCounters),
        JSON.stringify(errors),
        JSON.stringify(system),
      ),
  ];

  for (const pour of clampList(payload.pours, MAX_POURS_PER_REPORT)) {
    statements.push(
      db
        .prepare(
          'INSERT INTO pours (device_id, recipe_id, friendly_name, alcohol_ml, ingredients_json, poured_at, received_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        )
        .bind(
          deviceId,
          str(pour?.recipeId, 64),
          str(pour?.friendlyName, 60),
          int(pour?.alcoholMl) ?? 0,
          pour?.ingredients ? JSON.stringify(clampList(pour.ingredients, 20)) : null,
          isoOrNow(pour?.pouredAt, now),
          now,
        ),
    );
  }

  // Sample the snapshot into history, at most every HISTORY_MIN_INTERVAL.
  const lastHistory = await db
    .prepare('SELECT reported_at FROM stats_history WHERE device_id = ? ORDER BY reported_at DESC LIMIT 1')
    .bind(deviceId)
    .first();
  if (!lastHistory || Date.now() - Date.parse(lastHistory.reported_at) >= HISTORY_MIN_INTERVAL_MS) {
    statements.push(
      db
        .prepare(
          'INSERT INTO stats_history (device_id, reported_at, uptime_s, drinks_served, alcohol_ml, bottles_json, error_count) VALUES (?, ?, ?, ?, ?, ?, ?)',
        )
        .bind(deviceId, now, int(payload.uptimeS), int(counters.drinksServed) ?? 0, int(counters.alcoholServedMl) ?? 0, JSON.stringify(bottles), errors.length),
    );
    statements.push(
      db
        .prepare('DELETE FROM stats_history WHERE device_id = ? AND reported_at < ?')
        .bind(deviceId, new Date(Date.now() - HISTORY_RETENTION_DAYS * 86400e3).toISOString()),
    );
    statements.push(
      db
        .prepare('DELETE FROM pours WHERE device_id = ? AND poured_at < ?')
        .bind(deviceId, new Date(Date.now() - POURS_RETENTION_DAYS * 86400e3).toISOString()),
    );
  }

  await db.batch(statements);

  const current = await getCurrent(db, deviceId, false);
  return json({
    ok: true,
    serverTime: now,
    config: current ? {version: current.version, etag: current.etag} : null,
  });
}
