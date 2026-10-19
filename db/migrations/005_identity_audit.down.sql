-- Non-destructive rollback: turn AUTH_USERS_ENABLED off in TEST first.
-- Preserve users, sessions, audit, receipts and workspace revisions for recovery.
-- Do not reactivate a shared administrator in production as a rollback shortcut.
BEGIN;
DROP FUNCTION IF EXISTS gestor_push(uuid,integer,jsonb,uuid,integer,uuid,timestamptz,text,text,uuid);
COMMIT;
