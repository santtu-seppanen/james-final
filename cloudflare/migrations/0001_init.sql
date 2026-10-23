-- James dashboard schema (Cloudflare D1 / SQLite)

CREATE TABLE IF NOT EXISTS status (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  online INTEGER NOT NULL DEFAULT 0,
  last_seen TEXT,
  drinks_served INTEGER NOT NULL DEFAULT 0,
  alcohol_served_ml INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO status (id, online, drinks_served, alcohol_served_ml)
VALUES (1, 0, 0, 0);

CREATE TABLE IF NOT EXISTS bottles (
  name TEXT PRIMARY KEY,
  capacity_ml INTEGER NOT NULL,
  original_capacity_ml INTEGER NOT NULL,
  serving_ml INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recipes (
  id TEXT PRIMARY KEY,
  friendly_name TEXT NOT NULL,
  image_url TEXT,
  ingredients_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pours (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  drink_name TEXT NOT NULL,
  friendly_name TEXT,
  alcohol_ml INTEGER NOT NULL DEFAULT 0,
  poured_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pours_poured_at ON pours (poured_at);
