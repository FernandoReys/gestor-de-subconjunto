-- Execute on a new, empty PostgreSQL database. No demonstration rows are inserted.
CREATE TABLE IF NOT EXISTS app_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS employees (
  id uuid PRIMARY KEY,
  name varchar(100) NOT NULL,
  sector text NOT NULL CHECK (sector IN ('Sala de máquinas', 'Linha de bolsa', 'Subconjunto', 'Embalagem final')),
  role text NOT NULL DEFAULT 'Operador' CHECK (role IN ('Operador', 'Assistente')),
  present boolean NOT NULL DEFAULT false,
  no_glue boolean NOT NULL DEFAULT false,
  allowed text[] NOT NULL DEFAULT ARRAY['20','30','40','50','60','70'],
  fixed text NOT NULL DEFAULT '',
  initial_station text NOT NULL DEFAULT '',
  support_preckoff boolean NOT NULL DEFAULT false,
  support_needle boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employee_stations CHECK (
    allowed <@ ARRAY['20','30','40','50','60','70']::text[]
    AND cardinality(allowed) > 0
    AND (fixed = '' OR fixed = ANY(allowed))
    AND (initial_station = '' OR initial_station = ANY(allowed))
    AND (NOT no_glue OR allowed = ARRAY['30']::text[])
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS employees_name_unique ON employees (lower(name));
CREATE INDEX IF NOT EXISTS employees_sector_present_idx ON employees (sector, present);
