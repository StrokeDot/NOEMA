-- NOEMA v8: one author-selected working source per project.
ALTER TABLE sources ADD COLUMN working_document INTEGER NOT NULL DEFAULT 0 CHECK(working_document IN (0,1));
CREATE INDEX source_working_project ON sources(project_id,working_document);
PRAGMA user_version=8;
