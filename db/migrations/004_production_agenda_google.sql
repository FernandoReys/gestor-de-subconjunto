-- Apply only to the isolated desktop test database; no legacy web tables are changed.
CREATE TABLE IF NOT EXISTS desktop_calendar_exports (
  author_id text NOT NULL,
  calendar_id text NOT NULL,
  entry_id uuid NOT NULL,
  event_id text NOT NULL,
  etag text,
  updated_at text,
  conflict boolean NOT NULL DEFAULT false,
  lease_id uuid,
  lease_until timestamptz,
  PRIMARY KEY(author_id, calendar_id, entry_id)
);
