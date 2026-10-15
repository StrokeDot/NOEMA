-- NOEMA v2: chapter-organized candidate passages, kept distinct from established memory.
CREATE TABLE book_gems (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  chapter_id TEXT REFERENCES chapters(id),
  kind TEXT NOT NULL CHECK(kind IN ('Quote','Reasoning','Argument','Draft Passage')),
  original_text TEXT NOT NULL,
  text TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  origin TEXT NOT NULL DEFAULT 'Unspecified' CHECK(origin IN ('Author','AI Assistant','Research Source','Unspecified')),
  source_label TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Candidate' CHECK(status IN ('Candidate','Approved','Used')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX gem_project_chapter ON book_gems(project_id,deleted,chapter_id,updated_at DESC);
PRAGMA user_version=2;
