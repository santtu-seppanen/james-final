-- Bottles are positional on the Pi (array index = servo number) and names can
-- repeat (e.g. two "empty" slots), so key them by slot instead of name.
-- The table is just a mirror of the Pi's state; the next report refills it.

DROP TABLE IF EXISTS bottles;

CREATE TABLE bottles (
  slot INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  capacity_ml INTEGER NOT NULL,
  original_capacity_ml INTEGER NOT NULL,
  serving_ml INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

-- Names the bottle editor offers (from the Pi's available_bottles_config.json).
ALTER TABLE status ADD COLUMN available_bottles_json TEXT;

-- Bottle edits queued from the dashboard, picked up by the Pi like recipe_commands.
CREATE TABLE IF NOT EXISTS bottle_commands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slot INTEGER NOT NULL,
  bottle_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'failed')),
  error TEXT,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_bottle_commands_status ON bottle_commands (status, id);
