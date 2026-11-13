// D1 access for the config. There is only the current config: a save writes a
// new row with the next revision number (the revision is what the ETag and
// the UI's conflict check are built on) and drops the older rows. The bottle setup is NOT part
// of the config rows: it is one live row (bottle_setup) edited in place, and
// getEffective() puts the two back together for the device and the UI.

// Default import: the shared module is CommonJS (it also runs on the Pi's Node 10).
import validate from '../shared/config-validate.js';
import {HttpError} from './http.js';

const {canonicalJson} = validate;

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Strong ETag: version plus a content hash, so a rollback to identical
// content (new version, same body) is still a different ETag and the device
// re-reports which version it applied.
export async function makeEtag(version, bodyJson) {
  return `"v${version}-${(await sha256Hex(bodyJson)).slice(0, 16)}"`;
}

function rowToVersion(row, withBody) {
  if (!row) return null;
  const out = {
    version: row.version,
    etag: row.etag,
    author: row.author,
    note: row.note,
    createdAt: row.created_at,
  };
  if (withBody) out.config = JSON.parse(row.body_json);
  return out;
}

export async function getCurrent(db, deviceId, withBody = true) {
  const row = await db
    .prepare('SELECT * FROM config_versions WHERE device_id = ? ORDER BY version DESC LIMIT 1')
    .bind(deviceId)
    .first();
  return rowToVersion(row, withBody);
}

export function stripBottles(config) {
  const {bottles, ...rest} = config; // eslint-disable-line no-unused-vars
  return rest;
}

// The live bottle list. If it has never been saved on its own, it starts as
// the bottles of the latest version (how things were before it was split out).
export async function getBottleSetup(db, deviceId) {
  const row = await db.prepare('SELECT * FROM bottle_setup WHERE device_id = ?').bind(deviceId).first();
  if (row) return {bottles: JSON.parse(row.body_json), etag: row.etag, updatedAt: row.updated_at, author: row.author};
  const current = await getCurrent(db, deviceId, true);
  if (!current || !Array.isArray(current.config.bottles)) return null;
  return setBottleSetup(db, deviceId, current.config.bottles, {author: 'migrated'});
}

// Replaces the live bottle list. Returns {bottles, etag, updatedAt, changed}.
export async function setBottleSetup(db, deviceId, bottles, {author} = {}) {
  const bodyJson = canonicalJson(bottles);
  const row = await db.prepare('SELECT body_json, etag, updated_at, author FROM bottle_setup WHERE device_id = ?').bind(deviceId).first();
  if (row && row.body_json === bodyJson) {
    return {bottles, etag: row.etag, updatedAt: row.updated_at, author: row.author, changed: false};
  }
  const etag = `"b-${(await sha256Hex(bodyJson)).slice(0, 16)}"`;
  const updatedAt = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO bottle_setup (device_id, body_json, etag, author, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(device_id) DO UPDATE SET body_json = excluded.body_json, etag = excluded.etag, author = excluded.author, updated_at = excluded.updated_at`,
    )
    .bind(deviceId, bodyJson, etag, author ?? null, updatedAt)
    .run();
  return {bottles, etag, updatedAt, author: author ?? null, changed: true};
}

// What the device and the UI see: the current version with the live bottles
// put back in. The ETag covers both, so a bottle edit alone makes the device
// fetch again even though the version number didn't move.
export async function getEffective(db, deviceId) {
  const current = await getCurrent(db, deviceId, true);
  if (!current) return null;
  const setup = await getBottleSetup(db, deviceId);
  const bottles = setup ? setup.bottles : current.config.bottles;
  const etag = setup ? `${current.etag.slice(0, -1)}.${setup.etag.slice(1)}` : current.etag;
  return {...current, etag, versionEtag: current.etag, bottlesUpdatedAt: setup ? setup.updatedAt : null, config: {...current.config, bottles}};
}

// Appends a new version. `config` must already be validated/normalized.
// Returns {version, etag, createdAt, unchanged} - unchanged when the body is
// identical to the current version (nothing is inserted then).
export async function publish(db, deviceId, config, {author, note} = {}) {
  config = stripBottles(config);
  const bodyJson = canonicalJson(config);
  const current = await getCurrent(db, deviceId, true);
  if (current && canonicalJson(stripBottles(current.config)) === bodyJson) {
    return {...current, unchanged: true};
  }
  const version = (current?.version ?? 0) + 1;
  const etag = await makeEtag(version, bodyJson);
  const createdAt = new Date().toISOString();
  // (device_id, version) is the primary key, so two concurrent publishes
  // can't both get the same number - the loser gets a 409 and reloads.
  try {
    await db
      .prepare(
        'INSERT INTO config_versions (device_id, version, etag, body_json, author, note, rolled_back_from, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(deviceId, version, etag, bodyJson, author ?? null, note ?? null, null, createdAt)
      .run();
    await db.prepare('DELETE FROM config_versions WHERE device_id = ? AND version < ?').bind(deviceId, version).run();
  } catch (e) {
    if (/UNIQUE|constraint/i.test(String(e && e.message))) {
      throw new HttpError('config changed since you loaded it', 409, {currentVersion: version});
    }
    throw e;
  }
  return {version, etag, author, note, createdAt, config, unchanged: false};
}
