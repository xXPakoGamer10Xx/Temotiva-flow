-- ---------------------------------------------------------------------------
-- Migración idempotente: adjuntos y enlaces de peticiones entre áreas
-- (spec 001, ampliación A). Se aplica en cada `npm run db:setup`, tras la 06.
--
-- Una fila por archivo o enlace, marcada con el lado al que pertenece: la
-- petición (área origen) o la respuesta (área destino). Los archivos viven en
-- el almacenamiento privado; aquí solo se guarda su clave, nunca una URL
-- pública. No altera ninguna tabla existente.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS department_request_attachments (
    id UUID PRIMARY KEY,
    request_id UUID REFERENCES department_requests(id) NOT NULL,
    side VARCHAR(10) NOT NULL CHECK (side IN ('REQUEST', 'RESPONSE')),
    kind VARCHAR(10) NOT NULL CHECK (kind IN ('FILE', 'LINK')),
    file_name VARCHAR(200),
    content_type VARCHAR(120),
    size_bytes INTEGER,
    storage_key VARCHAR(300),
    label VARCHAR(60),
    url VARCHAR(500),
    added_by UUID REFERENCES users(id) NOT NULL,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT dra_file_complete CHECK (kind <> 'FILE' OR (
        file_name IS NOT NULL AND
        content_type IS NOT NULL AND
        size_bytes IS NOT NULL AND
        storage_key IS NOT NULL
    )),
    CONSTRAINT dra_link_complete CHECK (kind <> 'LINK' OR (
        label IS NOT NULL AND
        url IS NOT NULL AND
        url LIKE 'https://%'
    ))
);

CREATE INDEX IF NOT EXISTS department_request_attachments_request_idx
    ON department_request_attachments (request_id, added_at);
