-- ---------------------------------------------------------------------------
-- Migración idempotente: enlaces de documentos por área y tareas de área.
-- Se aplica en cada `npm run db:setup`.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS area_links (
    id UUID PRIMARY KEY,
    title VARCHAR(120) NOT NULL,
    url VARCHAR(500) NOT NULL,
    department department_enum NOT NULL,
    created_by UUID REFERENCES users(id) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_removed BOOLEAN NOT NULL DEFAULT FALSE,     -- baja lógica (AGENTS.md §5.8)
    removed_by UUID REFERENCES users(id),
    removed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS area_links_department_idx ON area_links (department) WHERE NOT is_removed;

CREATE TABLE IF NOT EXISTS dept_tasks (
    id UUID PRIMARY KEY,
    title VARCHAR(120) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    department department_enum NOT NULL,
    status VARCHAR(10) NOT NULL DEFAULT 'TODO' CHECK (status IN ('TODO', 'DOING', 'DONE')),
    assignee_id UUID REFERENCES users(id),
    initiative_id VARCHAR(20) REFERENCES initiatives(id),
    due_date DATE,
    created_by UUID REFERENCES users(id) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_archived BOOLEAN NOT NULL DEFAULT FALSE     -- baja lógica (AGENTS.md §5.8)
);

CREATE INDEX IF NOT EXISTS dept_tasks_department_idx ON dept_tasks (department) WHERE NOT is_archived;
