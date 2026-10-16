-- NOEMA v5: production-ready writing beats for video scripts.
-- Keeps all existing free-form chapters intact. Text/source references are local.
CREATE TABLE script_cues (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  position INTEGER NOT NULL,
  heading TEXT NOT NULL DEFAULT '',
  narration TEXT NOT NULL DEFAULT '',
  visuals TEXT NOT NULL DEFAULT '',
  evidence_notes TEXT NOT NULL DEFAULT '',
  source_id TEXT REFERENCES sources(id),
  source_locator TEXT NOT NULL DEFAULT '',
  planned_seconds INTEGER CHECK(planned_seconds IS NULL OR (planned_seconds>=0 AND planned_seconds<=14400)),
  status TEXT NOT NULL DEFAULT 'Draft' CHECK(status IN ('Draft','Ready','Recorded')),
  version INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX script_cue_order ON script_cues(project_id,deleted,position,id);
CREATE TABLE script_cue_revisions (
  id TEXT PRIMARY KEY,
  cue_id TEXT NOT NULL REFERENCES script_cues(id),
  snapshot TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX script_cue_revision_order ON script_cue_revisions(cue_id,created_at DESC);
PRAGMA user_version=5;
