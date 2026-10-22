-- v9: immutable spoken/written original, editable interpretation, AI answer, evolving writer profile,
-- and a separate reviewable conversation draft. No existing project/chat rows are rewritten.
CREATE TABLE writing_turns(
 id TEXT PRIMARY KEY,
 project_id TEXT NOT NULL REFERENCES projects(id),
 original_text TEXT NOT NULL,
 interpreted_text TEXT NOT NULL DEFAULT '',
 interpretation_author_corrected INTEGER NOT NULL DEFAULT 0,
 assistant_response TEXT NOT NULL DEFAULT '',
 provider TEXT NOT NULL DEFAULT '',
 model TEXT NOT NULL DEFAULT '',
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','complete')),
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE INDEX writing_turns_project_time ON writing_turns(project_id,created_at,id);
CREATE TABLE writer_profile_notes(
 id TEXT PRIMARY KEY,
 dimension TEXT NOT NULL CHECK(dimension IN ('Writing voice','Reasoning style','Moral framework','Values and beliefs','Working preferences','Other')),
 claim TEXT NOT NULL,
 evidence_quote TEXT NOT NULL DEFAULT '',
 source_turn_id TEXT REFERENCES writing_turns(id),
 source_project_id TEXT REFERENCES projects(id),
 state TEXT NOT NULL DEFAULT 'Candidate' CHECK(state IN ('Candidate','Confirmed','Rejected')),
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE INDEX writer_profile_state ON writer_profile_notes(state,created_at);
CREATE TABLE conversation_draft_items(
 id TEXT PRIMARY KEY,
 project_id TEXT NOT NULL REFERENCES projects(id),
 turn_id TEXT REFERENCES writing_turns(id),
 source TEXT NOT NULL CHECK(source IN ('Author original','Author meaning','AI proposal','Author addition')),
 text TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'Candidate' CHECK(state IN ('Candidate','Approved','Rejected')),
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE INDEX draft_project_state ON conversation_draft_items(project_id,state,created_at);
CREATE TABLE conversation_draft_settings(
 project_id TEXT PRIMARY KEY REFERENCES projects(id),
 auto_collect INTEGER NOT NULL DEFAULT 0 CHECK(auto_collect IN (0,1))
);
PRAGMA user_version=9;
