-- ---------------------------------------------------------------------------
-- Migración idempotente: biblioteca de documentos por área.
-- Se aplica en cada `npm run db:setup`.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY,
    file_name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    content_type VARCHAR(150) NOT NULL,
    size_bytes INT NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
    storage_key TEXT NOT NULL,                     -- pathname en el almacén privado; nunca una URL pública
    department department_enum NOT NULL,           -- área dueña
    uploaded_by UUID REFERENCES users(id) NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_removed BOOLEAN NOT NULL DEFAULT FALSE,     -- baja lógica: nada se borra (AGENTS.md §5.8)
    removed_by UUID REFERENCES users(id),
    removed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS documents_department_idx ON documents (department) WHERE NOT is_removed;

CREATE TABLE IF NOT EXISTS document_shares (
    id UUID PRIMARY KEY,
    document_id UUID REFERENCES documents(id) NOT NULL,
    target_type VARCHAR(20) NOT NULL CHECK (target_type IN ('USER', 'DEPARTMENT', 'LEADS', 'ALL')),
    target_user_id UUID REFERENCES users(id),
    target_department department_enum,
    shared_by UUID REFERENCES users(id) NOT NULL,
    shared_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (
        (target_type = 'USER' AND target_user_id IS NOT NULL AND target_department IS NULL) OR
        (target_type = 'DEPARTMENT' AND target_department IS NOT NULL AND target_user_id IS NULL) OR
        (target_type IN ('LEADS', 'ALL') AND target_user_id IS NULL AND target_department IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS document_shares_document_idx ON document_shares (document_id);
