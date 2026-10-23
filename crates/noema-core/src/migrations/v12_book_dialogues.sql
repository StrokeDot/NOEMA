-- v12: one book has many goal-oriented conversations, without rewriting source inputs.
CREATE TABLE writing_conversations(
 id TEXT PRIMARY KEY,
 project_id TEXT NOT NULL REFERENCES projects(id),
 title TEXT NOT NULL,
 goal TEXT NOT NULL DEFAULT '',
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE INDEX conversations_project_updated ON writing_conversations(project_id,updated_at DESC);
ALTER TABLE writing_turns ADD COLUMN conversation_id TEXT REFERENCES writing_conversations(id);
CREATE INDEX writing_turns_by_conversation ON writing_turns(project_id,conversation_id,created_at,id);
-- Preserve ALL original turns in a visible legacy dialogue per book.
INSERT INTO writing_conversations(id,project_id,title,goal,created_at,updated_at)
 SELECT 'legacy-' || p.id,p.id,'Earlier dialogue','Previously recorded book-writing exchanges',
        MIN(w.created_at),MAX(w.updated_at)
 FROM projects p JOIN writing_turns w ON w.project_id=p.id GROUP BY p.id;
UPDATE writing_turns SET conversation_id='legacy-' || project_id WHERE conversation_id IS NULL;
PRAGMA user_version=12;
