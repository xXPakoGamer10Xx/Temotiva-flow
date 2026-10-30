-- ---------------------------------------------------------------------------
-- Migración idempotente: tokens personales para clientes de IA (MCP).
-- Se aplica en cada `npm run db:setup`.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS api_tokens (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id) NOT NULL,
    name VARCHAR(60) NOT NULL,
    token_hash CHAR(64) NOT NULL UNIQUE,           -- SHA-256 del token; el valor en claro no se guarda
    token_prefix VARCHAR(12) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    last_used_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ                          -- baja lógica (AGENTS.md §5.8)
);

CREATE INDEX IF NOT EXISTS api_tokens_user_idx ON api_tokens (user_id, created_at DESC);
