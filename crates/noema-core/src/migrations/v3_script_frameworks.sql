-- NOEMA v3: projects can be books or video scripts. Author-controlled frameworks
-- are reusable across projects and deliberately separate from imported sources.
ALTER TABLE projects ADD COLUMN project_type TEXT NOT NULL DEFAULT 'Book'
  CHECK(project_type IN ('Book','Video Script'));

CREATE TABLE belief_frameworks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  perspective TEXT NOT NULL CHECK(perspective IN ('Author','External','Character','Custom')),
  principles TEXT NOT NULL,
  original_text TEXT NOT NULL,
  qualifications TEXT NOT NULL DEFAULT '',
  source_label TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Draft' CHECK(status IN ('Draft','Confirmed')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX framework_status ON belief_frameworks(deleted,status,updated_at DESC);
CREATE TABLE project_frameworks (
  project_id TEXT NOT NULL REFERENCES projects(id),
  framework_id TEXT NOT NULL REFERENCES belief_frameworks(id),
  active INTEGER NOT NULL DEFAULT 0 CHECK(active IN (0,1)),
  PRIMARY KEY(project_id,framework_id)
);
CREATE INDEX assigned_frameworks ON project_frameworks(project_id,active);
PRAGMA user_version=3;
