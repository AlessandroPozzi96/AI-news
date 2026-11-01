-- Details are stored as structured JSON and rendered (escaped) at display time, never as raw HTML.
ALTER TABLE items RENAME COLUMN details_html TO details_json;
ALTER TABLE items ADD COLUMN source_name TEXT NOT NULL DEFAULT '';
ALTER TABLE items ADD COLUMN claude_code INTEGER NOT NULL DEFAULT 0;
