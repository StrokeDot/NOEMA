CREATE TABLE IF NOT EXISTS chatgpt_usage (
    turn_id TEXT PRIMARY KEY NOT NULL,
    completed_at INTEGER NOT NULL,
    input_tokens INTEGER CHECK (input_tokens >= 0),
    output_tokens INTEGER CHECK (output_tokens >= 0)
);
CREATE INDEX IF NOT EXISTS chatgpt_usage_by_date ON chatgpt_usage(completed_at);
PRAGMA user_version=14;
