-- The bottle setup is a live document, not a versioned one: one row per
-- device holding the bottle list as it should be right now. Editing it
-- replaces the row; there is no history to roll back through. The device
-- picks changes up through the ETag, same as the config.
CREATE TABLE IF NOT EXISTS bottle_setup (
  device_id TEXT PRIMARY KEY,
  body_json TEXT NOT NULL,
  etag TEXT NOT NULL,
  author TEXT,
  updated_at TEXT NOT NULL
);
