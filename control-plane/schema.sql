CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  repository_url TEXT NOT NULL,
  repository_owner TEXT,
  repository_name TEXT,
  ref_name TEXT NOT NULL,
  task TEXT NOT NULL,
  template_id TEXT NOT NULL,
  preview_port INTEGER,
  retain_machine INTEGER NOT NULL DEFAULT 0,
  preview_url TEXT,
  machine_id TEXT,
  node_name TEXT,
  node_status TEXT NOT NULL DEFAULT 'pending',
  node_paired_at TEXT,
  commit_sha TEXT,
  status TEXT NOT NULL,
  agent_status TEXT NOT NULL,
  test_status TEXT NOT NULL,
  exit_code INTEGER,
  error_code TEXT,
  error_message TEXT,
  result_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS runs_updated_idx ON runs(updated_at DESC);
CREATE INDEX IF NOT EXISTS runs_status_idx ON runs(status);
CREATE INDEX IF NOT EXISTS runs_node_idx ON runs(node_name);

-- Additive migration for databases created before per-run node binding.
-- Cloudflare D1 ignores duplicate-column failures only when applied one statement at a time;
-- the deployment migration uses the guarded ALTER statements in control-plane/migrations/.

CREATE TABLE IF NOT EXISTS run_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS run_events_run_idx ON run_events(run_id, id);

CREATE TABLE IF NOT EXISTS run_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  stream TEXT NOT NULL,
  chunk TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS run_logs_run_idx ON run_logs(run_id, id);
