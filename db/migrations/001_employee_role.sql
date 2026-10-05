-- Apply once to an existing Gestor de Subconjunto database; preserves rows.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'Operador' CHECK (role IN ('Operador', 'Assistente'));
