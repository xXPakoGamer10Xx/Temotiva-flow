-- ---------------------------------------------------------------------------
-- Migración idempotente: notificaciones push (spec 002). Se aplica en cada
-- `npm run db:setup`, tras la 07.
--
-- push_subscriptions: un dispositivo (navegador) por fila, ligado a la persona
-- que activó los avisos en él. Darse de baja es lógico (`revoked_at`), igual
-- que el resto del sistema (AGENTS.md §5.8). Los campos `endpoint`, `p256dh` y
-- `auth` identifican un dispositivo: nunca se escriben en logs.
--
-- sle_risk_notices: marca de «ya se avisó» del SLE en riesgo, una por
-- iniciativa y fase, para que el crontab no repita el aviso.
--
-- No altera ninguna tabla ni tipo existente.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id) NOT NULL,
    endpoint TEXT UNIQUE NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent VARCHAR(200),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx
    ON push_subscriptions (user_id) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS sle_risk_notices (
    initiative_id VARCHAR(20) REFERENCES initiatives(id) NOT NULL,
    stage_id INT REFERENCES workflow_stages(id) NOT NULL,
    notified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (initiative_id, stage_id)
);
