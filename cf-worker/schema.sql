CREATE TABLE IF NOT EXISTS devices (
  hwid        TEXT    PRIMARY KEY,
  first_seen  TEXT    NOT NULL,
  last_seen   TEXT    NOT NULL,
  active      INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_active ON devices (active);
