-- ---------------------------------------------------------------------------
-- Migración idempotente: confirmación de lectura de las tareas de área (spec 003).
-- Se aplica en cada `npm run db:setup`.
--
-- Un ciclo por cada vez que una tarea pasa a manos de una persona. Los ciclos
-- no se borran: solo se cierran (`closed_at`). No altera ninguna tabla existente.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS dept_task_reads (
    id UUID PRIMARY KEY,
    task_id UUID NOT NULL REFERENCES dept_tasks(id),
    assignee_id UUID NOT NULL REFERENCES users(id),
    assigned_at TIMESTAMPTZ,                  -- NULL solo en tareas previas (RF-09)
    read_at TIMESTAMPTZ,
    read_source VARCHAR(10) CHECK (read_source IN ('MANUAL', 'AUTO')),
    resolved_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,                    -- NULL = ciclo abierto
    CONSTRAINT dept_task_read_source_documented CHECK ((read_at IS NULL) = (read_source IS NULL))
);

-- Como máximo un ciclo abierto por tarea (RF-02).
CREATE UNIQUE INDEX IF NOT EXISTS dept_task_reads_open_idx ON dept_task_reads (task_id) WHERE closed_at IS NULL;
CREATE INDEX IF NOT EXISTS dept_task_reads_task_idx ON dept_task_reads (task_id);
