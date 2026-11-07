-- ---------------------------------------------------------------------------
-- Migración idempotente: peticiones entre áreas (spec 001 — Dependencias).
-- Se aplica en cada `npm run db:setup`.
--
-- Tabla independiente de `initiative_dependencies`: no altera ninguna tabla
-- ni tipo existente. `help_type` reutiliza `help_type_enum` (01-schema.sql).
-- `blocks_initiative` es informativo: no toca `initiatives.is_blocked`.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS department_requests (
    id UUID PRIMARY KEY,
    title VARCHAR(120) NOT NULL,
    description TEXT NOT NULL,
    source_department department_enum NOT NULL,
    target_department department_enum NOT NULL,
    requested_by UUID REFERENCES users(id) NOT NULL,
    help_type help_type_enum NOT NULL,             -- la app lo limita a HELP_TYPES_V1
    status VARCHAR(12) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'IN_PROGRESS', 'RESOLVED')),
    blocks_initiative BOOLEAN NOT NULL DEFAULT FALSE, -- informativo: no toca initiatives
    initiative_id VARCHAR(20) REFERENCES initiatives(id) ON DELETE SET NULL,
    assignee_id UUID REFERENCES users(id),
    resolution_notes TEXT,
    resolved_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    CONSTRAINT department_request_distinct_departments
        CHECK (source_department <> target_department),
    CONSTRAINT department_request_in_progress_assigned
        CHECK (status <> 'IN_PROGRESS' OR assignee_id IS NOT NULL), -- spec §7
    CONSTRAINT department_request_resolution_documented
        CHECK (status <> 'RESOLVED' OR (
            resolution_notes IS NOT NULL AND
            resolved_by IS NOT NULL AND
            resolved_at IS NOT NULL
        ))
);

CREATE INDEX IF NOT EXISTS department_requests_source_idx
    ON department_requests (source_department, created_at DESC);
CREATE INDEX IF NOT EXISTS department_requests_target_idx
    ON department_requests (target_department, created_at DESC);
CREATE INDEX IF NOT EXISTS department_requests_status_idx
    ON department_requests (status, created_at DESC);
