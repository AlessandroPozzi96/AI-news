-- One row per (issue, subscriber): lets a retried send skip people who already received the issue.
CREATE TABLE deliveries (
  issue_id TEXT NOT NULL REFERENCES issues (id),
  subscriber_id INTEGER NOT NULL REFERENCES subscribers (id),
  status TEXT NOT NULL,
  provider_id TEXT,
  error TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (issue_id, subscriber_id)
);

CREATE INDEX idx_runs_started ON runs (started_at);
