-- Apply ONLY to an isolated test database after reviewing its connection string.
-- This schema deliberately never writes the legacy web tables.
BEGIN;
CREATE TABLE IF NOT EXISTS desktop_workspace (
  id integer PRIMARY KEY CHECK (id=1), revision integer NOT NULL DEFAULT 0,
  state jsonb, updated_at timestamptz NOT NULL DEFAULT now(), author_id text, device_id uuid
);
INSERT INTO desktop_workspace(id) VALUES(1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS desktop_changes (
  revision integer PRIMARY KEY, operation_id uuid UNIQUE NOT NULL, base_revision integer NOT NULL,
  state jsonb NOT NULL, author_id text NOT NULL, device_id uuid NOT NULL,
  client_created_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
-- Entire state revisions retain removed records and cancelled schedules for audit/recovery.
-- Lock + receipt + revision update run in one database transaction, including retries.
CREATE OR REPLACE FUNCTION desktop_push(op uuid, base integer, doc jsonb, author text, device uuid, client_time timestamptz)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE current_row desktop_workspace; receipt desktop_changes;
BEGIN
  SELECT * INTO current_row FROM desktop_workspace WHERE id=1 FOR UPDATE;
  SELECT * INTO receipt FROM desktop_changes WHERE operation_id=op;
  IF FOUND THEN
    IF receipt.state <> doc OR receipt.author_id <> author OR receipt.device_id <> device OR receipt.base_revision <> base THEN
      RAISE EXCEPTION 'Idempotency key reused with another payload';
    END IF;
    RETURN jsonb_build_object('revision', receipt.revision, 'duplicate', true);
  END IF;
  IF base <> current_row.revision THEN
    RETURN jsonb_build_object('conflict', true, 'revision', current_row.revision, 'state', current_row.state, 'authorId', current_row.author_id, 'updatedAt', current_row.updated_at);
  END IF;
  INSERT INTO desktop_changes(revision,operation_id,base_revision,state,author_id,device_id,client_created_at)
    VALUES(current_row.revision+1,op,base,doc,author,device,client_time);
  UPDATE desktop_workspace SET revision=revision+1,state=doc,author_id=author,device_id=device,updated_at=now() WHERE id=1;
  RETURN jsonb_build_object('revision',current_row.revision+1);
END; $$;
COMMIT;
