-- v13: Authors may remove a dialogue without deleting the book or its evidence.
-- Soft deletion protects existing turn links, writer-profile observations and drafts.
ALTER TABLE writing_conversations ADD COLUMN deleted_at INTEGER NOT NULL DEFAULT 0;
CREATE INDEX dialogues_project_trash ON writing_conversations(project_id,deleted_at,updated_at DESC);
PRAGMA user_version=13;
