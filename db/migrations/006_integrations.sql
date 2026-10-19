BEGIN;
CREATE TABLE IF NOT EXISTS gestor_google_connections(owner_id text PRIMARY KEY,tokens text NOT NULL,calendar_id text,connected_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS gestor_google_oauth(state_hash text PRIMARY KEY,owner_id text NOT NULL,verifier text NOT NULL,browser_hash text NOT NULL,expires_at timestamptz NOT NULL,used boolean NOT NULL DEFAULT false);
CREATE TABLE IF NOT EXISTS gestor_integration_audit(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,owner_id text NOT NULL,service text NOT NULL,action text NOT NULL,status text NOT NULL,entity_id text,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS gestor_integration_audit_owner ON gestor_integration_audit(owner_id,created_at DESC);
CREATE TABLE IF NOT EXISTS gestor_ai_budget(owner_id text NOT NULL,day date NOT NULL,count integer NOT NULL,PRIMARY KEY(owner_id,day));
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='gestor_integration_audit_immutable') THEN CREATE TRIGGER gestor_integration_audit_immutable BEFORE UPDATE OR DELETE ON gestor_integration_audit FOR EACH ROW EXECUTE FUNCTION gestor_audit_immutable(); END IF; END $$;
COMMIT;
