-- Every author-approved change to a writer-profile statement is reversible in an audit trail.
-- Keep original conversation quotations and source-turn links untouched.
CREATE TABLE writer_profile_revisions(
 id TEXT PRIMARY KEY,
 note_id TEXT NOT NULL REFERENCES writer_profile_notes(id),
 previous_dimension TEXT NOT NULL,
 previous_claim TEXT NOT NULL,
 previous_state TEXT NOT NULL,
 edited_at INTEGER NOT NULL
);
CREATE INDEX writer_profile_revisions_note_time ON writer_profile_revisions(note_id,edited_at,id);
PRAGMA user_version=11;
