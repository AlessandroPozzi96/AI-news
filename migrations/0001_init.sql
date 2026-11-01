CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO settings (key, value) VALUES
  ('send_day', '5'),
  ('send_hour', '18'),
  ('timezone', 'Europe/Paris'),
  ('frequency_weeks', '1'),
  ('items_per_issue', '5'),
  ('language', 'fr');

CREATE TABLE subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  unsubscribed_at TEXT
);

CREATE TABLE issues (
  id TEXT PRIMARY KEY,
  language TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at TEXT
);

CREATE TABLE items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  issue_id TEXT NOT NULL REFERENCES issues (id),
  position INTEGER NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  details_html TEXT NOT NULL,
  source_url TEXT NOT NULL,
  UNIQUE (issue_id, position)
);

CREATE TABLE seen_urls (
  url TEXT PRIMARY KEY,
  first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  published INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  issue_id TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT,
  status TEXT NOT NULL,
  error TEXT,
  llm_cost_usd REAL
);
