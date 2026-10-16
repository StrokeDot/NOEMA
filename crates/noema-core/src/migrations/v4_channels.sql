-- NOEMA v4: each video script may belong to an author-defined channel.
-- Existing scripts remain unassigned until their author chooses a channel.
CREATE TABLE channel_profiles (
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL,
 description TEXT NOT NULL DEFAULT '',
 audience TEXT NOT NULL DEFAULT '',
 voice TEXT NOT NULL DEFAULT '',
 editorial_rules TEXT NOT NULL DEFAULT '',
 content_pillars TEXT NOT NULL DEFAULT '',
 original_text TEXT NOT NULL DEFAULT '',
 source_label TEXT NOT NULL DEFAULT '',
 confirmed INTEGER NOT NULL DEFAULT 0 CHECK(confirmed IN (0,1)),
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE INDEX channel_profile_name ON channel_profiles(name COLLATE NOCASE);
ALTER TABLE projects ADD COLUMN channel_id TEXT REFERENCES channel_profiles(id);
ALTER TABLE projects ADD COLUMN script_status TEXT NOT NULL DEFAULT 'Draft'
  CHECK(script_status IN ('Draft','In Production','Published'));
CREATE INDEX projects_channel ON projects(channel_id,project_type,created_at);
PRAGMA user_version=4;
