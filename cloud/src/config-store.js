// D1 access for config versions. Versions are append-only; the current
// config is the highest version for the device.

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
    rolledBackFrom: row.rolled_back_from,
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

export async function getVersion(db, deviceId, version) {
  const row = await db
    .prepare('SELECT * FROM config_versions WHERE device_id = ? AND version = ?')
    .bind(deviceId, version)
    .first();
  return rowToVersion(row, true);
}

export async function listVersions(db, deviceId, limit = 50) {
  const rows = await db
    .prepare(
      'SELECT version, etag, author, note, rolled_back_from, created_at, length(body_json) AS size FROM config_versions WHERE device_id = ? ORDER BY version DESC LIMIT ?',
    )
    .bind(deviceId, limit)
    .all();
  return (rows.results ?? []).map((r) => ({...rowToVersion(r, false), size: r.size}));
}

// Appends a new version. `config` must already be validated/normalized.
// Returns {version, etag, createdAt, unchanged} - unchanged when the body is
// identical to the current version (nothing is inserted then).
export async function publish(db, deviceId, config, {author, note, rolledBackFrom = null} = {}) {
  const bodyJson = canonicalJson(config);
  const current = await getCurrent(db, deviceId, true);
  if (current && canonicalJson(current.config) === bodyJson && rolledBackFrom === null) {
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
      .bind(deviceId, version, etag, bodyJson, author ?? null, note ?? null, rolledBackFrom, createdAt)
      .run();
  } catch (e) {
    if (/UNIQUE|constraint/i.test(String(e && e.message))) {
      throw new HttpError('config changed since you loaded it', 409, {currentVersion: version});
    }
    throw e;
  }
  return {version, etag, author, note, rolledBackFrom, createdAt, config, unchanged: false};
}
