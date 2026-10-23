-- NOEMA v10: keep author-origin materials separate from external research.
ALTER TABLE sources ADD COLUMN source_origin TEXT NOT NULL DEFAULT 'External'
 CHECK(source_origin IN ('Author','External'));
CREATE INDEX source_project_origin ON sources(project_id,source_origin,created_at);
-- Critical review remains separate from AI agreement and book-ready draft.
ALTER TABLE writing_turns ADD COLUMN critical_review TEXT NOT NULL DEFAULT '';
ALTER TABLE writing_turns ADD COLUMN critique_explored INTEGER NOT NULL DEFAULT 0
 CHECK(critique_explored IN (0,1));
PRAGMA user_version=10;
