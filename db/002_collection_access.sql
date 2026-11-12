CREATE TABLE IF NOT EXISTS flippy_collection_keys (
  collector_id text PRIMARY KEY,
  key_hash text NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS flippy_collection_sessions (
  session_hash text PRIMARY KEY,
  collector_id text NOT NULL REFERENCES flippy_collection_keys (collector_id)
);
