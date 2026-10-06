-- Non-destructive pilot migration. Run in a transaction after taking a backup.
-- Existing employees and app_settings remain intact; no sample rows are inserted.
CREATE TABLE IF NOT EXISTS sectors (
  id uuid PRIMARY KEY, name text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY, external_subject text UNIQUE NOT NULL,
  display_name text NOT NULL, role text NOT NULL CHECK (role IN ('Administrador','Assistente','Visualização')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_sector_check;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS registration text;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT '';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS sector_id uuid REFERENCES sectors(id);
INSERT INTO sectors(id,name)
SELECT gen_random_uuid(), name FROM (VALUES ('Sala de máquinas'),('Linha de bolsa'),('Linha de Bolsas'),('Subconjunto'),('Embalagem final'),('Outros')) AS initial(name)
ON CONFLICT (name) DO NOTHING;
UPDATE employees AS e SET sector_id=s.id FROM sectors AS s WHERE e.sector=s.name AND e.sector_id IS NULL;
ALTER TABLE employees ALTER COLUMN sector_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS employees_registration_unique ON employees (registration) WHERE registration IS NOT NULL;
CREATE TABLE IF NOT EXISTS employee_skills (
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  station_id text NOT NULL CHECK (station_id IN ('20','30','40','50','60','70')),
  PRIMARY KEY (employee_id, station_id)
);
INSERT INTO employee_skills(employee_id,station_id)
SELECT e.id, unnest(e.allowed) FROM employees AS e ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS employee_restrictions (
  id uuid PRIMARY KEY, employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  station_id text CHECK (station_id IS NULL OR station_id IN ('20','30','40','50','60','70')),
  reason text NOT NULL, expires_on date,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS employee_restrictions_employee_idx ON employee_restrictions(employee_id);
CREATE TABLE IF NOT EXISTS fps (
  id uuid PRIMARY KEY, code text NOT NULL UNIQUE, name text NOT NULL,
  market text NOT NULL CHECK (market IN ('Nacional','Internacional')),
  variation text NOT NULL, product text NOT NULL, revision text NOT NULL,
  notes text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'Ativa' CHECK (status IN ('Ativa','Arquivada')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS fp_stations (
  fp_id uuid NOT NULL REFERENCES fps(id) ON DELETE CASCADE,
  station_id text NOT NULL, process text NOT NULL, required_count integer NOT NULL CHECK (required_count BETWEEN 1 AND 20),
  notes text NOT NULL DEFAULT '', position integer NOT NULL,
  PRIMARY KEY(fp_id,station_id), UNIQUE(fp_id,position)
);
CREATE TABLE IF NOT EXISTS shifts (
  id uuid PRIMARY KEY, name text NOT NULL UNIQUE,
  start_time time NOT NULL, end_time time NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_time > start_time)
);
CREATE TABLE IF NOT EXISTS schedules (
  id uuid PRIMARY KEY, work_date date NOT NULL, shift_id uuid REFERENCES shifts(id),
  shift_name text NOT NULL, fp_id uuid REFERENCES fps(id) ON DELETE RESTRICT,
  fp_code text NOT NULL, product text NOT NULL,
  status text NOT NULL CHECK (status IN ('Rascunho','Incompleta','Pronta','Finalizada','Cancelada')),
  notes text NOT NULL DEFAULT '', snapshot jsonb NOT NULL,
  created_by uuid REFERENCES users(id), updated_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS schedules_date_idx ON schedules(work_date DESC,created_at DESC);
CREATE INDEX IF NOT EXISTS schedules_fp_idx ON schedules(fp_id,work_date DESC);
CREATE TABLE IF NOT EXISTS schedule_stations (
  id uuid PRIMARY KEY, schedule_id uuid NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  station_id text NOT NULL, process text NOT NULL, required_count integer NOT NULL CHECK(required_count BETWEEN 1 AND 20),
  notes text NOT NULL DEFAULT '', UNIQUE(schedule_id,station_id)
);
CREATE TABLE IF NOT EXISTS schedule_employees (
  id uuid PRIMARY KEY, schedule_station_id uuid NOT NULL REFERENCES schedule_stations(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  employee_name text NOT NULL, start_time time NOT NULL, end_time time NOT NULL,
  fixed boolean NOT NULL DEFAULT false,
  CHECK(end_time > start_time)
);
CREATE INDEX IF NOT EXISTS schedule_employees_station_idx ON schedule_employees(schedule_station_id);
CREATE UNIQUE INDEX IF NOT EXISTS schedule_employees_unique_assignment ON schedule_employees(schedule_station_id,start_time,end_time,employee_name);
CREATE TABLE IF NOT EXISTS schedule_organizers (
  schedule_id uuid NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  employee_name text NOT NULL,
  PRIMARY KEY(schedule_id,employee_name)
);
CREATE TABLE IF NOT EXISTS settings (
  key text PRIMARY KEY, value jsonb NOT NULL,
  updated_by uuid REFERENCES users(id), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY, user_id uuid REFERENCES users(id), action text NOT NULL,
  entity_type text NOT NULL, entity_id text NOT NULL,
  before_data jsonb, after_data jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON audit_logs(entity_type,entity_id,occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_time_idx ON audit_logs(occurred_at DESC);
