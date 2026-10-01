-- ---------------------------------------------------------------------------
-- Temotiva Flow V1 — esquema relacional (PostgreSQL / Supabase)
--
-- Es el DDL del Bloque 4.1 de TemoFlow.md más las extensiones V1 declaradas en
-- DESIGN.md §6.3, marcadas una a una con el comentario `EXTENSIÓN V1`.
--
-- Los tipos de `src/domain/types.ts` son el espejo exacto de estas tablas. El
-- día que se sustituya `InMemoryDataStore` por `PostgresDataStore`, este
-- archivo se aplica tal cual y ni los servicios de dominio ni las Server
-- Actions cambian.
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ENUMS ---------------------------------------------------------------------

-- EXTENSIÓN V1: RRHH, Finanzas y Marketing no son propietarias de ninguna fase,
-- pero reciben solicitudes de ayuda y tienen responsable propio.
CREATE TYPE department_enum AS ENUM (
    'PRODUCT', 'PSYCHOLOGY', 'LEGAL', 'DESIGN', 'TECH', 'QA', 'CYBER',
    'HR', 'FINANCE', 'MARKETING'
);
CREATE TYPE priority_level_enum AS ENUM ('LOW', 'NORMAL', 'HIGH', 'CRITICAL');
CREATE TYPE priority_reason_enum AS ENUM ('REGULATORY_RISK', 'B2B_CLIENT', 'SECURITY_INCIDENT', 'ROADMAP', 'INTERNAL_IMPROVEMENT');
CREATE TYPE help_type_enum AS ENUM ('INFORMATION', 'VALIDATION', 'DECISION', 'RESOURCE', 'REVIEW', 'UNBLOCK');
CREATE TYPE help_status_enum AS ENUM ('PENDING', 'RESOLVED', 'REJECTED');
CREATE TYPE stop_reason_enum AS ENUM ('ESPERANDO_DECISION', 'ESPERANDO_VALIDACION', 'ESPERANDO_INFORMACION', 'FALTA_CAPACIDAD', 'BLOQUEO_TECNICO', 'EXTERNO');
CREATE TYPE user_role_enum AS ENUM ('MEMBER', 'LEAD', 'EXECUTIVE');
CREATE TYPE link_kind_enum AS ENUM ('FIGMA', 'NOTION', 'REPO', 'OTHER'); -- EXTENSIÓN V1

-- 1. USUARIOS Y PERFILES ------------------------------------------------------
-- La tabla `users` ES la lista de acceso: no hay registro automático. Un correo
-- que no esté aquí, o que esté con `is_active = false`, no entra (SEGURIDAD.md §3.2).

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    role user_role_enum NOT NULL DEFAULT 'MEMBER',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,      -- EXTENSIÓN V1: allowlist fail-closed
    is_anonymized BOOLEAN NOT NULL DEFAULT FALSE, -- EXTENSIÓN V1: derecho de supresión (§5.3)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX users_email_lower_idx ON users (LOWER(email));

-- EXTENSIÓN V1: una persona puede llevar varias áreas a la vez (un responsable
-- de RRHH y Finanzas, o de Tech y Ciberseguridad). Sustituye a la antigua
-- columna `users.department`, que solo admitía una.
CREATE TABLE user_departments (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    department department_enum NOT NULL,
    PRIMARY KEY (user_id, department)
);

CREATE INDEX user_departments_department_idx ON user_departments (department);

-- Sin áreas no hay permisos posibles: la aplicación exige al menos una y esta
-- vista permite auditar que ninguna fila se quede huérfana.
CREATE VIEW users_without_department AS
SELECT u.id, u.email
FROM users u
LEFT JOIN user_departments d ON d.user_id = u.id
WHERE d.user_id IS NULL;

-- 2. FASES DEL WORKFLOW -------------------------------------------------------

CREATE TABLE workflow_stages (
    id SERIAL PRIMARY KEY,
    key VARCHAR(50) UNIQUE NOT NULL, -- 'IDEATION', 'FEASIBILITY', 'CO_DESIGN', 'READY', 'DEV', 'QA', 'PROD'
    name VARCHAR(100) NOT NULL,
    order_index INT NOT NULL UNIQUE,
    default_owner_department department_enum NOT NULL,
    sle_hours INT NOT NULL,          -- horas naturales netas (el tiempo en parada no cuenta)
    wip_limit INT DEFAULT 5,
    is_active BOOLEAN DEFAULT TRUE,
    purpose TEXT NOT NULL DEFAULT '' -- EXTENSIÓN V1: propósito mostrado en la ficha
);

-- 3. CHECKLISTS CONFIGURABLES POR FASE ----------------------------------------

CREATE TABLE stage_checklists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stage_id INT REFERENCES workflow_stages(id) ON DELETE CASCADE,
    label VARCHAR(255) NOT NULL,
    description TEXT,
    order_index INT NOT NULL,
    is_mandatory BOOLEAN DEFAULT TRUE,
    -- EXTENSIÓN V1: sin esto el panel de pendientes no puede ofrecer
    -- "Solicitar a Departamento Responsable" en un clic (TemoFlow.md §1.3).
    responsible_department department_enum NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX stage_checklists_stage_idx ON stage_checklists (stage_id, order_index);

-- 4. INICIATIVAS (CORE) -------------------------------------------------------

CREATE TABLE initiatives (
    id VARCHAR(20) PRIMARY KEY, -- 'TEMO-101'
    title VARCHAR(255) NOT NULL,
    description TEXT,
    priority priority_level_enum NOT NULL DEFAULT 'NORMAL',
    priority_reason priority_reason_enum NOT NULL DEFAULT 'ROADMAP',
    current_stage_id INT REFERENCES workflow_stages(id) NOT NULL,
    owner_department department_enum NOT NULL,
    current_assignee_id UUID REFERENCES users(id),
    created_by UUID REFERENCES users(id) NOT NULL,

    -- Control de parada.
    -- El estado efectivo (`is_blocked`, `stop_reason`, `blocked_description`) se
    -- recalcula a partir de dos orígenes que pueden coexistir: la parada
    -- declarada a mano y las dependencias bloqueantes pendientes. Por eso el
    -- origen manual se guarda aparte: resolver la última dependencia no debe
    -- levantar una causa manual que sigue viva.
    is_blocked BOOLEAN DEFAULT FALSE,
    stop_reason stop_reason_enum,
    blocked_description TEXT,
    manual_stop_reason stop_reason_enum,             -- EXTENSIÓN V1: causa declarada a mano
    manual_stop_description TEXT,                    -- EXTENSIÓN V1
    blocked_since TIMESTAMPTZ,                       -- EXTENSIÓN V1: ancla de contabilidad de ESTA fase
    blocked_started_at TIMESTAMPTZ,                  -- EXTENSIÓN V1: inicio real de la parada, cruzando fases
    blocked_ms_in_stage BIGINT NOT NULL DEFAULT 0,   -- EXTENSIÓN V1: parada consolidada de la fase

    current_task VARCHAR(255),                       -- EXTENSIÓN V1: columna del Radar de Esperas
    links JSONB NOT NULL DEFAULT '[]'::jsonb,        -- EXTENSIÓN V1: [{kind,label,url}]
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,      -- EXTENSIÓN V1: archivado = borrado lógico

    stage_entered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Una parada siempre declara su causa.
    CONSTRAINT initiatives_stop_reason_required CHECK (NOT is_blocked OR stop_reason IS NOT NULL),
    -- Si hay causa manual, la iniciativa está necesariamente parada.
    CONSTRAINT initiatives_manual_stop_implies_blocked CHECK (manual_stop_reason IS NULL OR is_blocked)
);

CREATE INDEX initiatives_stage_idx ON initiatives (current_stage_id) WHERE NOT is_archived;
CREATE INDEX initiatives_owner_idx ON initiatives (owner_department) WHERE NOT is_archived;

-- 5. VALORES DE CHECKLIST POR INICIATIVA --------------------------------------

CREATE TABLE initiative_checklist_values (
    initiative_id VARCHAR(20) REFERENCES initiatives(id) ON DELETE CASCADE,
    checklist_id UUID REFERENCES stage_checklists(id) ON DELETE CASCADE,
    is_completed BOOLEAN DEFAULT FALSE,
    completed_by UUID REFERENCES users(id),
    completed_at TIMESTAMPTZ,
    PRIMARY KEY (initiative_id, checklist_id),

    -- Un item marcado siempre sabe quién y cuándo (trazabilidad de la compuerta).
    CONSTRAINT checklist_completion_is_attributed
        CHECK (NOT is_completed OR (completed_by IS NOT NULL AND completed_at IS NOT NULL))
);

-- 6. DEPENDENCIAS / SOLICITUDES SATÉLITE ("🆘 SOLICITAR AYUDA") ----------------
-- Una solicitud siempre apunta a OTRO departamento: pedirse ayuda a uno mismo
-- no es una dependencia y permitía autoinducirse paradas.

CREATE TABLE initiative_dependencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    initiative_id VARCHAR(20) REFERENCES initiatives(id) ON DELETE CASCADE,
    requested_by UUID REFERENCES users(id) NOT NULL,
    target_department department_enum NOT NULL,
    help_type help_type_enum NOT NULL,
    is_blocking BOOLEAN DEFAULT FALSE, -- determina si disparó un estado de parada
    description TEXT NOT NULL,
    -- EXTENSIÓN V1: requisito de compuerta que originó la petición. Permite
    -- saber si un pendiente concreto ya está solicitado, en lugar de dar por
    -- cubierto todo el departamento.
    checklist_item_id UUID REFERENCES stage_checklists(id) ON DELETE SET NULL,
    status help_status_enum DEFAULT 'PENDING',
    resolution_notes TEXT,
    resolved_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,

    -- Cerrar una solicitud exige respuesta escrita y autoría.
    CONSTRAINT dependency_closure_is_documented
        CHECK (status = 'PENDING' OR (resolution_notes IS NOT NULL AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL))
);

CREATE INDEX dependencies_pending_idx ON initiative_dependencies (target_department) WHERE status = 'PENDING';
CREATE INDEX dependencies_initiative_idx ON initiative_dependencies (initiative_id);

-- 7. AUDIT LOG (LA CAJA NEGRA INMUTABLE) --------------------------------------

CREATE TABLE activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- EXTENSIÓN V1: admite NULL para eventos de sistema sin iniciativa
    -- (altas y bajas de la lista de acceso, cambios de WIP/SLE).
    initiative_id VARCHAR(20) REFERENCES initiatives(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) NOT NULL,
    action_type VARCHAR(50) NOT NULL,
    from_stage_id INT REFERENCES workflow_stages(id),
    to_stage_id INT REFERENCES workflow_stages(id),
    field_name VARCHAR(100),
    old_value JSONB,
    new_value JSONB,
    override_metadata JSONB, -- { reason, riskAccepted, authorizedBy, pendingItems, ip, userAgent }
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX activity_log_initiative_idx ON activity_log (initiative_id, created_at DESC);
CREATE INDEX activity_log_action_idx ON activity_log (action_type, created_at DESC);

-- ---------------------------------------------------------------------------
-- Inmutabilidad de la caja negra (SEGURIDAD.md §6).
-- La política de solo-inserción se refuerza en la base de datos, no solo en la
-- aplicación: ni un UPDATE ni un DELETE pasan, vengan de donde vengan.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION activity_log_is_append_only() RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'activity_log es append-only: no se permite % (SEGURIDAD.md §6)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER activity_log_no_update
    BEFORE UPDATE OR DELETE ON activity_log
    FOR EACH ROW EXECUTE FUNCTION activity_log_is_append_only();

-- ---------------------------------------------------------------------------
-- Nota sobre los "triggers del sistema" (TemoFlow.md §4.2).
--
-- El cálculo de duración en fase, el bloqueo automático al abrir una
-- dependencia bloqueante, el desbloqueo al cerrarse la última y el registro de
-- la excepción viven en los servicios de dominio (`src/server/services`), no en
-- la base de datos: ahí son funciones puras con test unitario y con acceso al
-- contexto de sesión (quién firma, desde qué IP), que un trigger de PostgreSQL
-- no tiene. La base de datos guarda las invariantes que sí puede garantizar por
-- sí misma: las de arriba.
-- ---------------------------------------------------------------------------
