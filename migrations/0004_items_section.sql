-- Sections group the items of an issue (news, must_have, claude_code). Empty for issues written before sections.
ALTER TABLE items ADD COLUMN section TEXT NOT NULL DEFAULT '';
