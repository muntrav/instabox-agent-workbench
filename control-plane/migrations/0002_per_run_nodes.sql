ALTER TABLE runs ADD COLUMN node_name TEXT;
ALTER TABLE runs ADD COLUMN node_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE runs ADD COLUMN node_paired_at TEXT;
CREATE INDEX IF NOT EXISTS runs_node_idx ON runs(node_name);
