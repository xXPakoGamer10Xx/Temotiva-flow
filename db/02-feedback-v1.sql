-- ---------------------------------------------------------------------------
-- Migración idempotente: feedback de la primera prueba (V1.1).
-- Se aplica en cada `npm run db:setup`; sobre una base recién creada con
-- 01-schema.sql no cambia nada.
-- ---------------------------------------------------------------------------

-- Ruta de fases: fases marcadas "No aplica" (AGENTS.md §5.9).
ALTER TABLE initiatives
    ADD COLUMN IF NOT EXISTS skipped_stage_ids INT[] NOT NULL DEFAULT '{}';

-- Tiempo estimado opcional (en días) por iniciativa.
ALTER TABLE initiatives
    ADD COLUMN IF NOT EXISTS estimated_duration_days INT
    CHECK (estimated_duration_days IS NULL OR estimated_duration_days > 0);

-- Documentos adjuntos (PDF/DOCX) a una iniciativa.
CREATE TABLE IF NOT EXISTS initiative_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    initiative_id VARCHAR(20) REFERENCES initiatives(id) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    content_type VARCHAR(100) NOT NULL CHECK (content_type IN (
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
    size_bytes INT NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
    storage_key TEXT NOT NULL,                     -- pathname en el almacén privado; nunca una URL pública
    uploaded_by UUID REFERENCES users(id) NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_removed BOOLEAN NOT NULL DEFAULT FALSE,     -- baja lógica: nada se borra (AGENTS.md §5.8)
    removed_by UUID REFERENCES users(id),
    removed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS attachments_initiative_idx ON initiative_attachments (initiative_id) WHERE NOT is_removed;

-- Feedback del equipo sobre la app, la web o la plataforma.
CREATE TABLE IF NOT EXISTS feedback_items (
    id UUID PRIMARY KEY,
    category VARCHAR(20) NOT NULL CHECK (category IN ('APP', 'WEB', 'PLATFORM')),
    message TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'IN_PROGRESS', 'DONE')),
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID REFERENCES users(id),
    updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_feedback_items_created_at ON feedback_items (created_at DESC);

-- Preferencias de notificación: sin fila, todo el mundo las recibe.
CREATE TABLE IF NOT EXISTS notification_prefs (
    user_id UUID PRIMARY KEY REFERENCES users(id),
    enabled BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS department_notification_settings (
    department department_enum PRIMARY KEY,
    team_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    updated_by UUID NOT NULL REFERENCES users(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Pasos propios (privados) en la ruta de una iniciativa: solo los ve quien los crea.
CREATE TABLE IF NOT EXISTS personal_steps (
    id UUID PRIMARY KEY,
    initiative_id VARCHAR(20) NOT NULL REFERENCES initiatives(id),
    user_id UUID NOT NULL REFERENCES users(id),
    title VARCHAR(80) NOT NULL,
    after_stage_id INT NOT NULL REFERENCES workflow_stages(id),
    is_done BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_personal_steps_owner ON personal_steps (initiative_id, user_id);
