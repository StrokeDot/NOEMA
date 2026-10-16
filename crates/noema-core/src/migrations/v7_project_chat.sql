-- NOEMA v7: project-local conversation history.
CREATE TABLE project_chat_messages (
 id TEXT PRIMARY KEY,
 project_id TEXT NOT NULL REFERENCES projects(id),
 role TEXT NOT NULL CHECK(role IN ('user','assistant')),
 content TEXT NOT NULL,
 provider TEXT NOT NULL DEFAULT '',
 created_at INTEGER NOT NULL
);
CREATE INDEX project_chat_order ON project_chat_messages(project_id,created_at,id);
PRAGMA user_version=7;
