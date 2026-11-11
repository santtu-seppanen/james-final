-- James cloud config + stats schema (Cloudflare D1 / SQLite).
-- Everything is keyed by device_id (wrangler.toml [vars] DEVICE_ID) so a
-- second device could be added later.

-- Every published config is a new row; version is monotonic per device and
-- the current config is simply MAX(version). Rollback = a new version whose
-- body is copied from an older one, so history is never rewritten.
CREATE TABLE IF NOT EXISTS config_versions (
  device_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  etag TEXT NOT NULL,
  body_json TEXT NOT NULL,
  author TEXT,
  note TEXT,
  rolled_back_from INTEGER,
  created_at TEXT NOT NULL,
  PRIMARY KEY (device_id, version)
);

-- Latest snapshot reported by the device (POST /api/device/stats).
CREATE TABLE IF NOT EXISTS device_state (
  device_id TEXT PRIMARY KEY,
  first_seen TEXT,
  last_seen TEXT,
  uptime_s INTEGER,
  device_version TEXT,
  server_reachable INTEGER,
  applied_version INTEGER,
  applied_etag TEXT,
  applied_status TEXT,
  applied_error TEXT,
  applied_at TEXT,
  bottles_json TEXT,
  recipes_json TEXT,
  available_bottles_json TEXT,
  counters_json TEXT,
  bottle_counters_json TEXT,
  errors_json TEXT,
  system_json TEXT
);

-- Sampled history of the snapshot (one row per HISTORY_MIN_INTERVAL, pruned
-- after HISTORY_RETENTION_DAYS - see src/routes/device.js).
CREATE TABLE IF NOT EXISTS stats_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,
  reported_at TEXT NOT NULL,
  uptime_s INTEGER,
  drinks_served INTEGER,
  alcohol_ml INTEGER,
  bottles_json TEXT,
  error_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_stats_history_device_time ON stats_history (device_id, reported_at);

-- Individual pours as reported by the device.
CREATE TABLE IF NOT EXISTS pours (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,
  recipe_id TEXT,
  friendly_name TEXT,
  alcohol_ml INTEGER NOT NULL DEFAULT 0,
  ingredients_json TEXT,
  poured_at TEXT NOT NULL,
  received_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pours_device_time ON pours (device_id, poured_at);
