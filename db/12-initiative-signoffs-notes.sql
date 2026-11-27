-- ---------------------------------------------------------------------------
-- Migración idempotente: aprobaciones por área, notas de avance, casillas
-- personalizadas y finalización de iniciativas (spec 005).
-- Se aplica en cada `npm run db:setup`.
--
-- No altera ni borra ninguna columna existente: añade tres tablas, dos columnas
-- anulables en `initiatives` y renombra el nombre visible de la fase CO_DESIGN
-- (la clave se conserva).
-- ---------------------------------------------------------------------------

-- Talla de esfuerzo que fija Desarrollo (Tech) en Viabilidad.
DO $$ BEGIN
    CREATE TYPE tshirt_size_enum AS ENUM ('XS', 'S', 'M', 'L', 'XL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Aprobación de un área en una fase de una iniciativa: una fila viva por
-- (iniciativa, fase, área). El historial de cambios vive en la caja negra.
-- Solo se guarda el UUID de quien aprueba: el nombre se resuelve al pintar,
-- así la anonimización (§5.3) no deja el nombre copiado en otra tabla.
CREATE TABLE IF NOT EXISTS initiative_stage_signoffs (
    initiative_id VARCHAR(20) NOT NULL REFERENCES initiatives(id),
    stage_id INT NOT NULL REFERENCES workflow_stages(id),
    department department_enum NOT NULL,
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    note TEXT CHECK (note IS NULL OR char_length(note) BETWEEN 10 AND 1000),
    no_observations BOOLEAN NOT NULL DEFAULT FALSE,
    tshirt_size tshirt_size_enum,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (initiative_id, stage_id, department),
    CONSTRAINT signoff_is_attributed
        CHECK (NOT is_approved OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
    CONSTRAINT signoff_note_xor_no_observations
        CHECK (NOT (no_observations AND note IS NOT NULL))
);

-- Nota de cierre de fase. Append-only, como la caja negra.
CREATE TABLE IF NOT EXISTS initiative_stage_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    initiative_id VARCHAR(20) NOT NULL REFERENCES initiatives(id),
    from_stage_id INT NOT NULL REFERENCES workflow_stages(id),
    to_stage_id INT REFERENCES workflow_stages(id),          -- NULL = finalización
    note TEXT NOT NULL CHECK (char_length(note) BETWEEN 20 AND 2000),
    author_id UUID NOT NULL REFERENCES users(id),
    author_departments department_enum[] NOT NULL,
    is_override BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS stage_notes_initiative_idx ON initiative_stage_notes (initiative_id, created_at);

-- Reutiliza la función append-only de la caja negra (01-schema.sql).
DROP TRIGGER IF EXISTS initiative_stage_notes_no_update ON initiative_stage_notes;
CREATE TRIGGER initiative_stage_notes_no_update
    BEFORE UPDATE OR DELETE ON initiative_stage_notes
    FOR EACH ROW EXECUTE FUNCTION activity_log_is_append_only();

-- Casillas extra opcionales de una iniciativa en una fase. Nunca bloquean.
CREATE TABLE IF NOT EXISTS initiative_custom_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    initiative_id VARCHAR(20) NOT NULL REFERENCES initiatives(id),
    stage_id INT NOT NULL REFERENCES workflow_stages(id),
    label VARCHAR(120) NOT NULL CHECK (char_length(label) >= 3),
    note VARCHAR(300),
    is_completed BOOLEAN NOT NULL DEFAULT FALSE,
    completed_by UUID REFERENCES users(id),
    completed_at TIMESTAMPTZ,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_removed BOOLEAN NOT NULL DEFAULT FALSE,               -- baja lógica (AGENTS.md §5.8)
    removed_by UUID REFERENCES users(id),
    removed_at TIMESTAMPTZ,
    CONSTRAINT custom_check_completion_is_attributed
        CHECK (NOT is_completed OR (completed_by IS NOT NULL AND completed_at IS NOT NULL)),
    CONSTRAINT custom_check_removal_is_attributed
        CHECK (NOT is_removed OR (removed_by IS NOT NULL AND removed_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS custom_checks_initiative_idx
    ON initiative_custom_checks (initiative_id, stage_id) WHERE NOT is_removed;

-- Finalización: sale del tablero operativo y pasa a "Iniciativas finalizadas".
ALTER TABLE initiatives ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMPTZ;
ALTER TABLE initiatives ADD COLUMN IF NOT EXISTS finalized_by UUID REFERENCES users(id);

DO $$ BEGIN
    ALTER TABLE initiatives ADD CONSTRAINT initiatives_finalization_is_attributed
        CHECK ((finalized_at IS NULL) = (finalized_by IS NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS initiatives_finalized_idx
    ON initiatives (finalized_at DESC) WHERE finalized_at IS NOT NULL;

-- Renombrado visible: solo si conserva el nombre de fábrica (respeta uno puesto a mano).
UPDATE workflow_stages SET name = 'Diseño' WHERE key = 'CO_DESIGN' AND name = 'Co-Diseño';
