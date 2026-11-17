-- ---------------------------------------------------------------------------
-- Migración idempotente: peticiones del buzón dirigidas a una persona (spec 004).
-- Se aplica en cada `npm run db:setup`.
--
-- `target_user_id` es opcional: NULL = petición al área (comportamiento de la
-- spec 001). Que la persona pertenezca a `target_department` y siga activa no
-- cabe en un CHECK (otra tabla): lo valida el servicio, y si deja de cumplirse
-- la petición vuelve a comportarse como dirigida al área.
-- ---------------------------------------------------------------------------

ALTER TABLE department_requests ADD COLUMN IF NOT EXISTS target_user_id UUID REFERENCES users(id);

CREATE INDEX IF NOT EXISTS department_requests_target_user_idx
    ON department_requests (target_user_id, created_at DESC) WHERE target_user_id IS NOT NULL;
