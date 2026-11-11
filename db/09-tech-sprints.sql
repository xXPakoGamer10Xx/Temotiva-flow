-- ---------------------------------------------------------------------------
-- Migración idempotente: sprint de Tech.
--   * Tabla `sprints` (por defecto de miércoles a miércoles, fechas editables).
--   * Planificación en `dept_tasks`: clave TEC-n, horas estimadas y sprint.
--   * Último pull request de GitHub enlazado a la tarea (lo escribe el webhook).
--   * Nuevo estado REVIEW ("En revisión") para las tareas con PR abierto.
-- Se aplica en cada `npm run db:setup`.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS sprints (
    id UUID PRIMARY KEY,
    department department_enum NOT NULL,
    name VARCHAR(60) NOT NULL,
    goal VARCHAR(300) NOT NULL DEFAULT '',
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    capacity_hours NUMERIC(5, 1) NOT NULL DEFAULT 30 CHECK (capacity_hours >= 0 AND capacity_hours <= 120),
    created_by UUID REFERENCES users(id) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,     -- baja lógica (AGENTS.md §5.8)
    CHECK (end_date > start_date)
);

CREATE INDEX IF NOT EXISTS sprints_department_idx ON sprints (department, start_date DESC) WHERE NOT is_archived;

ALTER TABLE dept_tasks ADD COLUMN IF NOT EXISTS code VARCHAR(20);
ALTER TABLE dept_tasks ADD COLUMN IF NOT EXISTS estimated_hours NUMERIC(5, 1)
    CHECK (estimated_hours IS NULL OR (estimated_hours >= 0 AND estimated_hours <= 80));
ALTER TABLE dept_tasks ADD COLUMN IF NOT EXISTS sprint_id UUID REFERENCES sprints(id);
ALTER TABLE dept_tasks ADD COLUMN IF NOT EXISTS pr_repo VARCHAR(200);
ALTER TABLE dept_tasks ADD COLUMN IF NOT EXISTS pr_number INT;
ALTER TABLE dept_tasks ADD COLUMN IF NOT EXISTS pr_url VARCHAR(500);
ALTER TABLE dept_tasks ADD COLUMN IF NOT EXISTS pr_title VARCHAR(300);
ALTER TABLE dept_tasks ADD COLUMN IF NOT EXISTS pr_state VARCHAR(10)
    CHECK (pr_state IS NULL OR pr_state IN ('DRAFT', 'OPEN', 'MERGED', 'CLOSED'));
ALTER TABLE dept_tasks ADD COLUMN IF NOT EXISTS pr_updated_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS dept_tasks_code_idx ON dept_tasks (code) WHERE code IS NOT NULL;
CREATE INDEX IF NOT EXISTS dept_tasks_sprint_idx ON dept_tasks (sprint_id) WHERE NOT is_archived;

-- El CHECK original de 04 solo admitía TODO/DOING/DONE.
ALTER TABLE dept_tasks DROP CONSTRAINT IF EXISTS dept_tasks_status_check;
ALTER TABLE dept_tasks ADD CONSTRAINT dept_tasks_status_check CHECK (status IN ('TODO', 'DOING', 'REVIEW', 'DONE'));

-- Las tareas de Tech anteriores reciben su clave TEC-n por orden de creación.
WITH base AS (
    SELECT COALESCE(MAX(SUBSTRING(code FROM 5)::INT), 0) AS top
    FROM dept_tasks WHERE code ~ '^TEC-[0-9]+$'
), numbered AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS n
    FROM dept_tasks WHERE department = 'TECH' AND code IS NULL
)
UPDATE dept_tasks t SET code = 'TEC-' || (base.top + numbered.n)
FROM numbered, base
WHERE t.id = numbered.id;
