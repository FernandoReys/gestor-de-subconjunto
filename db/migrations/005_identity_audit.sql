-- TEST BRANCH ONLY. Take an isolated recovery branch before applying.
-- Additive: does not rewrite legacy employees, FPs, workspace or changes.
BEGIN;
CREATE TABLE IF NOT EXISTS gestor_users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),username text NOT NULL UNIQUE CHECK(username ~ '^[a-z0-9_.-]{3,60}$'),
 full_name text NOT NULL CHECK(length(full_name) BETWEEN 1 AND 100),password_hash text NOT NULL,
 role text NOT NULL CHECK(role IN ('Administrador','Líder','Assistente')),active boolean NOT NULL DEFAULT true,
 session_version integer NOT NULL DEFAULT 0,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS gestor_sessions(id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES gestor_users(id),version integer NOT NULL,expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS gestor_sessions_user_idx ON gestor_sessions(user_id);
CREATE TABLE IF NOT EXISTS gestor_login_limits(key text PRIMARY KEY,count integer NOT NULL,until_time timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS gestor_password_resets(token_hash text PRIMARY KEY,user_id uuid NOT NULL REFERENCES gestor_users(id),expires_at timestamptz NOT NULL,used_at timestamptz);
CREATE TABLE IF NOT EXISTS gestor_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,actor_id uuid REFERENCES gestor_users(id),action text NOT NULL,module text NOT NULL,entity_id text,
 before_data jsonb,after_data jsonb,source text NOT NULL CHECK(source IN ('web','windows','assistant','server')),status text NOT NULL CHECK(status IN ('success','denied','failure')),operation_id uuid,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gestor_audit_time_idx ON gestor_audit(created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS gestor_audit_actor_idx ON gestor_audit(actor_id,created_at DESC);
CREATE INDEX IF NOT EXISTS gestor_audit_module_idx ON gestor_audit(module,created_at DESC);
CREATE OR REPLACE FUNCTION gestor_audit_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Audit is append-only'; END $$;
DROP TRIGGER IF EXISTS gestor_audit_immutable ON gestor_audit;
CREATE TRIGGER gestor_audit_immutable BEFORE UPDATE OR DELETE ON gestor_audit FOR EACH ROW EXECUTE FUNCTION gestor_audit_immutable();
-- Metadata excludes employee names, registration, notes and restriction reasons.
CREATE OR REPLACE FUNCTION gestor_audit_summary(value jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
 SELECT COALESCE((SELECT jsonb_object_agg(key,val) FROM jsonb_each(value) AS p(key,val) WHERE key IN ('id','status','date','shift','fp','revision','role','active','present','approvedBy','approvedAt','submittedBy','submittedAt')), '{}'::jsonb)
$$;
CREATE OR REPLACE FUNCTION gestor_push(op uuid,base integer,doc jsonb,actor uuid,actor_version integer,device uuid,client_time timestamptz,origin text,transition text DEFAULT 'write',target uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE current_row desktop_workspace; person gestor_users; old_doc jsonb; entry jsonb; previous jsonb; item jsonb; collection text; outcome jsonb; denied boolean:=false; old_history jsonb; next_history jsonb:='[]'::jsonb; cleaned jsonb:=doc;
BEGIN
 SELECT * INTO current_row FROM desktop_workspace WHERE id=1 FOR UPDATE;
 SELECT * INTO person FROM gestor_users WHERE id=actor FOR SHARE;
 IF NOT FOUND OR NOT person.active OR person.session_version<>actor_version THEN RETURN jsonb_build_object('unauthorized',true); END IF;
 IF origin NOT IN ('web','windows','assistant') OR transition NOT IN ('write','approve','cancel') THEN RAISE EXCEPTION 'Invalid operation'; END IF;
 -- Check immutable receipt before validating transitions: a lost successful response can retry.
 IF EXISTS(SELECT 1 FROM desktop_changes WHERE operation_id=op) THEN
  IF EXISTS(SELECT 1 FROM desktop_changes WHERE operation_id=op AND author_id=person.username AND device_id=device AND base_revision=base AND state=doc) THEN
   RETURN jsonb_build_object('revision',(SELECT revision FROM desktop_changes WHERE operation_id=op),'duplicate',true,'state',(SELECT state FROM desktop_changes WHERE operation_id=op));
  END IF;
  -- The server stamps history metadata, so compare the stored receipt's sanitized client document.
  IF EXISTS(SELECT 1 FROM gestor_operation_receipts WHERE operation_id=op AND actor_id=actor AND request_doc=doc AND base_revision=base AND device_id=device) THEN RETURN jsonb_build_object('revision',(SELECT revision FROM desktop_changes WHERE operation_id=op),'duplicate',true,'state',(SELECT state FROM desktop_changes WHERE operation_id=op)); END IF;
  RAISE EXCEPTION 'Operation identifier reused';
 END IF;
 IF base<>current_row.revision THEN RETURN jsonb_build_object('conflict',true,'revision',current_row.revision,'state',current_row.state,'authorId',current_row.author_id,'updatedAt',current_row.updated_at); END IF;
 old_doc=COALESCE(current_row.state,'{"config":{},"employees":[]}'::jsonb);
 old_history=COALESCE(old_doc->'config'->'history','[]'::jsonb);
 IF person.role<>'Administrador' THEN
  IF COALESCE(doc->'employees','[]'::jsonb)<>COALESCE(old_doc->'employees','[]'::jsonb) THEN denied=true; END IF;
  IF ((doc->'config')-ARRAY['history','date','start','end','coffee','coffeeDuration','lunch','lunchDuration','rotation','product','shiftName','extraPosts','organizerIds','manualAssignments','locks','scheduleNotes','confirmedId']) <>
     ((old_doc->'config')-ARRAY['history','date','start','end','coffee','coffeeDuration','lunch','lunchDuration','rotation','product','shiftName','extraPosts','organizerIds','manualAssignments','locks','scheduleNotes','confirmedId']) THEN
   -- Leaders may change agenda; assistants cannot.
   IF person.role<>'Líder' OR ((doc->'config')-ARRAY['productionAgenda','history','date','start','end','coffee','coffeeDuration','lunch','lunchDuration','rotation','product','shiftName','extraPosts','organizerIds','manualAssignments','locks','scheduleNotes','confirmedId'])<>
    ((old_doc->'config')-ARRAY['productionAgenda','history','date','start','end','coffee','coffeeDuration','lunch','lunchDuration','rotation','product','shiftName','extraPosts','organizerIds','manualAssignments','locks','scheduleNotes','confirmedId']) THEN denied=true; END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(old_history) h WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(doc->'config'->'history','[]'::jsonb)) n WHERE n->>'id'=h->>'id')) THEN denied=true; END IF;
 END IF;
 FOR entry IN SELECT * FROM jsonb_array_elements(COALESCE(doc->'config'->'history','[]'::jsonb)) LOOP
  SELECT h INTO previous FROM jsonb_array_elements(old_history) h WHERE h->>'id'=entry->>'id';
  IF previous IS NOT NULL AND previous=entry THEN next_history=next_history||jsonb_build_array(entry);CONTINUE;END IF;
  IF transition='approve' AND entry->>'id'=target::text THEN
   IF person.role='Assistente' OR previous IS NULL OR previous->>'status'<>'Aguardando aprovação' OR (entry-ARRAY['status','approvedBy','approvedAt','updatedAt'])<>(previous-ARRAY['status','approvedBy','approvedAt','updatedAt']) THEN denied=true; END IF;
   entry=previous||jsonb_build_object('status','Aprovada','approvedBy',actor,'approvedAt',now(),'updatedAt',now());
  ELSIF transition='cancel' AND entry->>'id'=target::text THEN
   IF person.role='Assistente' OR previous IS NULL OR previous->>'status' NOT IN ('Aprovada','Pronta','Aguardando aprovação','Rascunho','Incompleta') OR (entry-ARRAY['status','updatedAt'])<>(previous-ARRAY['status','updatedAt']) THEN denied=true; END IF;
   entry=previous||jsonb_build_object('status','Cancelada','updatedAt',now());
  ELSE
   IF previous->>'status' IN ('Aprovada','Pronta','Finalizada') THEN denied=true; END IF;
   IF entry->>'status' NOT IN ('Rascunho','Incompleta','Aguardando aprovação') THEN denied=true; END IF;
   IF person.role='Assistente' AND previous IS NOT NULL AND previous->>'createdBy' IS DISTINCT FROM actor::text THEN denied=true; END IF;
   IF (entry ? 'approvedBy') OR (entry ? 'approvedAt') THEN denied=true; END IF;
   IF previous IS NULL THEN entry=entry||jsonb_build_object('createdBy',actor); ELSIF entry->>'createdBy' IS DISTINCT FROM previous->>'createdBy' THEN denied=true; END IF;
   entry=entry-ARRAY['submittedBy','submittedAt'];
   IF previous ? 'submittedBy' THEN entry=entry||jsonb_build_object('submittedBy',previous->'submittedBy','submittedAt',previous->'submittedAt'); END IF;
   IF entry->>'status'='Aguardando aprovação' THEN entry=entry||jsonb_build_object('submittedBy',actor,'submittedAt',now()); END IF;
  END IF;
  next_history=next_history||jsonb_build_array(entry);
 END LOOP;
 IF denied THEN
  INSERT INTO gestor_audit(actor_id,action,module,source,status,operation_id) VALUES(actor,'write','workspace',origin,'denied',op);
  RETURN jsonb_build_object('forbidden',true);
 END IF;
 IF (doc->'config') ? 'history' THEN cleaned=jsonb_set(doc,'{config,history}',next_history); END IF;
 outcome=desktop_push(op,base,cleaned,person.username,device,client_time);
 INSERT INTO gestor_operation_receipts(operation_id,actor_id,request_doc,base_revision,device_id) VALUES(op,actor,doc,base,device);
 FOR collection IN SELECT unnest(ARRAY['employees','fps','history','productionAgenda']) LOOP
  FOR item IN SELECT n FROM jsonb_array_elements(CASE WHEN collection='employees' THEN COALESCE(cleaned->collection,'[]') ELSE COALESCE(cleaned->'config'->collection,'[]') END) n LOOP
   SELECT o INTO previous FROM jsonb_array_elements(CASE WHEN collection='employees' THEN COALESCE(old_doc->collection,'[]') ELSE COALESCE(old_doc->'config'->collection,'[]') END) o WHERE o->>'id'=item->>'id';
   IF previous IS DISTINCT FROM item THEN INSERT INTO gestor_audit(actor_id,action,module,entity_id,before_data,after_data,source,status,operation_id) VALUES(actor,CASE WHEN previous IS NULL THEN 'create' WHEN transition='approve' AND item->>'id'=target::text THEN 'approve' ELSE 'update' END,collection,item->>'id',gestor_audit_summary(previous),gestor_audit_summary(item),origin,'success',op); END IF;
  END LOOP;
  FOR item IN SELECT o FROM jsonb_array_elements(CASE WHEN collection='employees' THEN COALESCE(old_doc->collection,'[]') ELSE COALESCE(old_doc->'config'->collection,'[]') END) o WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN collection='employees' THEN COALESCE(cleaned->collection,'[]') ELSE COALESCE(cleaned->'config'->collection,'[]') END) n WHERE n->>'id'=o->>'id') LOOP
   INSERT INTO gestor_audit(actor_id,action,module,entity_id,before_data,source,status,operation_id) VALUES(actor,'delete',collection,item->>'id',gestor_audit_summary(item),origin,'success',op);
  END LOOP;
 END LOOP;
 INSERT INTO gestor_audit(actor_id,action,module,source,status,operation_id,before_data,after_data) VALUES(actor,'save','workspace',origin,'success',op,jsonb_build_object('revision',base),outcome);
 RETURN outcome||jsonb_build_object('state',cleaned);
END $$;
-- Immutable client document for idempotency when server-controlled metadata was stamped.
CREATE TABLE IF NOT EXISTS gestor_operation_receipts(operation_id uuid PRIMARY KEY REFERENCES desktop_changes(operation_id),actor_id uuid NOT NULL REFERENCES gestor_users(id),request_doc jsonb NOT NULL,base_revision integer NOT NULL,device_id uuid NOT NULL);

CREATE OR REPLACE FUNCTION gestor_manage_user(actor uuid,actor_version integer,target uuid,operation text,uname text,fullname text,access_role text,enabled boolean,secret_hash text)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE administrator gestor_users; previous gestor_users; updated gestor_users;
BEGIN
 SELECT * INTO administrator FROM gestor_users WHERE id=actor FOR UPDATE;
 IF NOT FOUND OR NOT administrator.active OR administrator.role<>'Administrador' OR administrator.session_version<>actor_version THEN RETURN jsonb_build_object('forbidden',true); END IF;
 -- Serializing administrators prevents concurrently removing the last one.
 PERFORM id FROM gestor_users WHERE role='Administrador' ORDER BY id FOR UPDATE;
 SELECT * INTO previous FROM gestor_users WHERE id=target FOR UPDATE;
 IF operation='create' THEN
  INSERT INTO gestor_users(id,username,full_name,password_hash,role) VALUES(target,uname,fullname,secret_hash,access_role) RETURNING * INTO updated;
 ELSIF operation='update' AND previous.id IS NOT NULL THEN
  IF previous.role='Administrador' AND previous.active AND (NOT enabled OR access_role<>'Administrador') AND (SELECT count(*) FROM gestor_users WHERE role='Administrador' AND active)<=1 THEN RAISE EXCEPTION 'Last administrator'; END IF;
  UPDATE gestor_users SET full_name=fullname,role=access_role,active=enabled,session_version=session_version+CASE WHEN role<>access_role OR active<>enabled THEN 1 ELSE 0 END,updated_at=now() WHERE id=target RETURNING * INTO updated;
 ELSIF operation='reset' AND previous.id IS NOT NULL THEN
  INSERT INTO gestor_password_resets(token_hash,user_id,expires_at) VALUES(secret_hash,target,now()+interval '20 minutes');updated=previous;
 ELSE RAISE EXCEPTION 'Invalid user operation'; END IF;
 INSERT INTO gestor_audit(actor_id,action,module,entity_id,before_data,after_data,source,status) VALUES(actor,operation,'users',target::text,jsonb_build_object('role',previous.role,'active',previous.active),jsonb_build_object('role',updated.role,'active',updated.active),'web','success');
 RETURN jsonb_build_object('id',updated.id,'username',updated.username,'fullName',updated.full_name,'role',updated.role,'active',updated.active);
END $$;
CREATE OR REPLACE FUNCTION gestor_reset_password(uname text,reset_hash text,new_hash text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE person gestor_users; receipt gestor_password_resets;
BEGIN
 SELECT * INTO person FROM gestor_users WHERE username=uname AND active FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO receipt FROM gestor_password_resets WHERE token_hash=reset_hash AND user_id=person.id AND used_at IS NULL AND expires_at>now() FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 UPDATE gestor_password_resets SET used_at=now() WHERE token_hash=reset_hash;
 UPDATE gestor_users SET password_hash=new_hash,session_version=session_version+1,updated_at=now() WHERE id=person.id;
 DELETE FROM gestor_sessions WHERE user_id=person.id;
 INSERT INTO gestor_audit(actor_id,action,module,source,status) VALUES(person.id,'password_reset','auth','web','success');RETURN true;
END $$;
COMMIT;
