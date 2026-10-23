-- Recipe edits queued from the public dashboard, picked up by the Pi
-- (server/reporter.js) on its next check-in.

CREATE TABLE IF NOT EXISTS recipe_commands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  op TEXT NOT NULL CHECK (op IN ('upsert', 'delete')),
  recipe_id TEXT,
  recipe_json TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'failed')),
  error TEXT,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_recipe_commands_status ON recipe_commands (status, id);
