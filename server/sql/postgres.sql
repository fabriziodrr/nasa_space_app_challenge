-- Apply explicitly with a migration/administrative connection before starting the backend.
-- A private schema avoids exposing observation tables through the public REST API.
CREATE SCHEMA IF NOT EXISTS sloth_data;
CREATE TABLE IF NOT EXISTS sloth_data.observations (
    observation_id TEXT PRIMARY KEY,
    subject_id TEXT NOT NULL,
    observed_at TEXT NOT NULL,
    recorded_at TEXT NOT NULL,
    synthetic INTEGER NOT NULL CHECK (synthetic IN (0, 1)),
    payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS observations_subject_time
    ON sloth_data.observations(subject_id, synthetic, observed_at);
