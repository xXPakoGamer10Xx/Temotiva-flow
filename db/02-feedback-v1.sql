-- ---------------------------------------------------------------------------
-- Migración idempotente: feedback de la primera prueba (V1.1).
-- Se aplica en cada `npm run db:setup`; sobre una base recién creada con
-- 01-schema.sql no cambia nada.
-- ---------------------------------------------------------------------------

-- Ruta de fases: fases marcadas "No aplica" (AGENTS.md §5.9).
ALTER TABLE initiatives
    ADD COLUMN IF NOT EXISTS skipped_stage_ids INT[] NOT NULL DEFAULT '{}';

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
