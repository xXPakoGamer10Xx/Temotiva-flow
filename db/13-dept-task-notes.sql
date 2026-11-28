-- ---------------------------------------------------------------------------
-- Migración idempotente: notas de seguimiento en las tareas de área (spec 006).
-- Se aplica en cada `npm run db:setup`, tras la 12.
--
-- Una fila por nota, en orden cronológico: añadir una nota nunca sobrescribe
-- otra. Editar guarda antes la versión anterior en `dept_task_note_revisions`
-- (append-only) y retirar es baja lógica (AGENTS.md §5.8). No altera ninguna
-- tabla existente.
--
-- La spec 006 también sube el máximo de la descripción de tareas y peticiones
-- a 5 000 caracteres: no necesita migración, porque `dept_tasks.description` y
-- `department_requests.description` ya son TEXT.
--
-- Los límites son idénticos a `src/domain/rules.ts` (MIN_TASK_NOTE, MAX_TASK_NOTE).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS dept_task_notes (
    id UUID PRIMARY KEY,
    task_id UUID NOT NULL REFERENCES dept_tasks(id),
    kind VARCHAR(10) NOT NULL CHECK (kind IN ('UPDATE', 'WAITING', 'BLOCKED')),
    body TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 3 AND 1000),
    author_id UUID NOT NULL REFERENCES users(id),
    author_department department_enum,              -- NULL = Dirección fuera del área de la tarea
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1), -- guarda de edición concurrente
    edited_at TIMESTAMPTZ,
    edited_by UUID REFERENCES users(id),
    is_removed BOOLEAN NOT NULL DEFAULT FALSE,
    removed_by UUID REFERENCES users(id),
    removed_at TIMESTAMPTZ,
    CONSTRAINT dtn_edit_documented CHECK ((edited_at IS NULL) = (edited_by IS NULL)),
    CONSTRAINT dtn_removal_documented CHECK (NOT is_removed OR (removed_by IS NOT NULL AND removed_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS dept_task_notes_task_idx ON dept_task_notes (task_id, created_at DESC);

-- Versión anterior de una nota, una fila por edición. Nunca se actualiza ni se borra.
CREATE TABLE IF NOT EXISTS dept_task_note_revisions (
    id UUID PRIMARY KEY,
    note_id UUID NOT NULL REFERENCES dept_task_notes(id),
    version INTEGER NOT NULL,                       -- versión que fue reemplazada
    kind VARCHAR(10) NOT NULL CHECK (kind IN ('UPDATE', 'WAITING', 'BLOCKED')),
    body TEXT NOT NULL,
    replaced_by UUID NOT NULL REFERENCES users(id),
    replaced_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT dtnr_unique_version UNIQUE (note_id, version)
);
