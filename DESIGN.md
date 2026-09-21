# Temotiva Flow — Diseño de Arquitectura y Sistemas

**Versión:** V1 (MVP)
**Ámbito:** Sistema interno de gestión, trazabilidad y coordinación del flujo de iniciativas interdisciplinares entre departamentos.
**Empresa:** Temotiva (HealthTech / Salud Mental y Bienestar Emocional).

> Fuente de verdad funcional: `TemoFlow.md` (Especificación Funcional Definitiva). Este documento describe **cómo** se implementa esa especificación y las decisiones técnicas tomadas.

---

## 1. Resumen Ejecutivo

Temotiva Flow es un tablero de flujo (kanban) con gobernanza estricta de fases que permite a los departamentos de Temotiva mover **iniciativas** (`TEMO-XXX`) a través de 7 fases secuenciales cerradas, solicitar ayuda entre departamentos (**dependencias**), declarar **bloqueos**, y registrar cada evento en un **audit log inmutable** ("caja negra").

El MVP es un **prototipo funcional** de front-end completo con una **capa de datos en memoria** tipada (seam para migrar a PostgreSQL/Supabase), autenticación **real corporativa** (SSO Google Workspace) y las reglas de negocio implementadas como **servicios de dominio puros** con pruebas unitarias.

---

## 2. Objetivos y No-Objetivos

### Objetivos de V1
- Tablero Kanban de iniciativas con límites WIP, relojes SLE y badges de prioridad.
- Radar de Esperas (visión cruzada de bloqueos y dependencias).
- Modal de Iniciativa con 4 pestañas (General, Compuerta de Salida, Dependencias, Trazabilidad).
- Panel de Dirección (métricas de permanencia, causas de parada, tasa de overrides).
- Checklist de salida 100% obligatoria por fase + **Avance Excepcional** auditable.
- Centro de **notificaciones in-app** para solicitudes de ayuda recibidas.
- Administración de la **lista de acceso** y de los parámetros de fase (Dirección).
- Auditoría integral e inmutable (no repudio).
- Auth corporativa real desde el día uno (SSO + RBAC).

### No-Objetivos (fuera de V1)
- Integración bidireccional Slack/Teams.
- Sincronización automática de PRs de GitHub.
- Informes exportables en PDF.
- Notificaciones push móviles.
- Persistencia en base de datos (solo mock en memoria; el esquema PG queda definido y listo).

---

## 3. Decisiones de Diseño Registradas

| # | Tema | Decisión |
| --- | --- | --- |
| D1 | Entrega | Prototipo funcional con capa de datos mock en memoria, tipada e intercambiable por PostgreSQL/Supabase. |
| D2 | Autenticación | Auth real desde el diseño: NextAuth v5 + Google (OAuth 2.0/OIDC). **Revisado el 21/09/2026:** el equipo son colaboradores externos con cuentas de Google propias, así que la autorización es una **allowlist estricta** sobre la tabla `users` (`is_active`), no el dominio del correo. |
| D3 | RBAC | Sesión hidratada desde la tabla `users`; todas las mutaciones críticas validan rol y departamento en el servidor. |
| D4 | SLE | **SLE neto**: el reloj se pausa mientras `is_blocked == true`. |
| D5 | WIP | Informativo (advertencia `⚠️ Saturado`), nunca bloqueante. |
| D6 | Propiedad | Automática al transicionar de fase (dueño por defecto de la fase) + reasignación LEAD/EXECUTIVE con evento `OWNER_REASSIGNED`. |
| D7 | Idioma | UI en español, código/identificadores en inglés. |
| D8 | Pruebas | Unitarias con Vitest sobre los servicios de dominio. |
| D9 | Notificaciones | Centro in-app derivado del estado (dependencias pendientes recibidas). |
| D10 | Despliegue | Local / demostrativo; diseño compatible con Vercel a futuro. |
| D11 | Framework | Next.js 16.x estable (en lugar del 14 del documento original). |
| D12 | Ciclo de vida | Archivado como soft-delete (`is_archived`); nada se borra del audit log. |
| D13 | Firma override | Botón bloqueado hasta escribir `CONFIRMAR EXCEPCION` + validación de sesión en servidor con IP/User-Agent. |
| D14 | Acceso de desarrollo | `CredentialsProvider` limitado a `NODE_ENV=development` + `ALLOW_DEV_AUTH=true`, sujeto a la misma allowlist. Nunca se registra en producción. |
| D15 | Persistencia de trabajo | El store en memoria vuelca un snapshot JSON en `.data/` (desactivable con `DATA_SNAPSHOT=false`) para que las demos sobrevivan a reinicios y al hot-reload. No es la base de datos del sistema. |
| D16 | Unidad del SLE | V1 mide horas naturales **netas** (descontando la parada). El calendario laborable real queda para V2: "48 h laborables" se modela como 48 h de reloj neto. |
| D17 | Administración | Vista `/team` (solo EXECUTIVE) para la lista de acceso y para los parámetros de WIP y SLE por fase. |

---

## 4. Stack Técnico

| Componente | Elección | Versión / Nota |
| --- | --- | --- |
| Framework | Next.js (App Router) | **16.3.5**. Turbopack es el bundler por defecto en dev y build. |
| React | React 19.2 | Incluido con Next 16. |
| Lenguaje | TypeScript | Modo *strict*. |
| Estilos | Tailwind CSS | v4. |
| Componentes | shadcn/ui (locales) sobre Radix | Solo las primitivas que se usan: diálogo, pestañas, checkbox, switch y menú. |
| Iconos | lucide-react | Única fuente de iconografía. |
| Auth | next-auth v5 (Auth.js) | `5.0.0-beta.32` (incluye el fix de fail-closed). Provider: Google (OIDC) + credenciales solo en desarrollo. |
| Formularios | Server Actions + zod | Validación de entradas en servidor. |
| Tests | Vitest 5 | Unitarios sobre los servicios de dominio. |
| Lint | ESLint 9 (flat config) | `next lint` fue eliminado en Next 16: se invoca ESLint directamente con `eslint-config-next/core-web-vitals` y `/typescript`. |
| Formato | Prettier | Opcional pero recomendado. |

### Advertencias de compatibilidad (Next.js 16)
- `middleware.ts` se renombra a **`proxy.ts`** (Node.js runtime). Auth.js v5 soporta ambos.
- En Server Components usar SIEMPRE `auth()` (lee la sesión del JWT/cookie directamente). **Nunca `getSession()`** en el servidor: hace un fetch a `/api/auth/session` que el Data Cache puede cachear y devolver la sesión de otro usuario.
- Las rutas de auth (`app/api/auth/[...nextauth]/route.ts`) deben declarar `export const dynamic = 'force-dynamic'`.
- `params`/`searchParams` son **async** en Server Components.

---

## 5. Arquitectura por Capas

```
┌──────────────────────────────────────────────────────────────────────┐
│  PRESENTACIÓN (App Router, src/app)                                  │
│  RSC (Server Components) + componentes cliente "use client"          │
│  Vistas: Tablero · Radar · Modal · Panel Dirección · Notificaciones  │
│  - Solo renderizan; recopilan input y delegan mutaciones a acciones  │
└──────────────────────────────┬───────────────────────────────────────┘
                               │ Server Actions (src/server/actions)
┌──────────────────────────────▼───────────────────────────────────────┐
│  SERVIDOR / MUTACIONES                                               │
│  - auth() → sesión y RBAC (usuario, email, departamento, rol)        │
│  - Validación zod de entradas                                        │
│  - Orquestan servicios de dominio                                    │
│  - Reglas de seguridad: rol/departamento SIEMPRE verificados aquí    │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────────────┐
│  SERVICIOS DE DOMINIO (src/server/services)                          │
│  Funciones puras e inyectables (sin I/O): compuertas, override,      │
│  bloqueo/desbloqueo automático, SLE neto, ownership, prioridad.      │
│  = las invariantes de negocio. Unit-testables.                       │
└──────────────────────────────┬───────────────────────────────────────┘
                               │ interfaz de repositorio (abstracción)
┌──────────────────────────────▼───────────────────────────────────────┐
│  REPOSITORIOS (src/server/repositories)                              │
│  - Interfaz: IniativeRepo, UserRepo, DependencyRepo, LogRepo...       │
│  - Impl V1: InMemoryRepo (seed con 7 iniciativas, en memoria)        │
│  - Impl futuro: PostgresRepo / SupabaseRepo (DDL ya definido)        │
└──────────────────────────────────────────────────────────────────────┘
```

**Principios:**
1. **Sin mutación desde el cliente:** el mock en memoria se accede SIEMPRE desde el servidor (Server Actions). El navegador recibe estado de solo lectura. Esto garantiza que la migración a base de datos no cambie la interfaz.
2. **Reglas puras en dominio:** ningún servicio de dominio toca red/DB; recibe repositorios y contexto de sesión por inyección. Cada invariante tiene test unitario.
3. **Sesión como contexto de confianza:** los servicios de dominio reciben un `SessionContext` (userId, email, department, role) extraído con `auth()`, no parámetros confiados del cliente.

---

## 6. Modelo de Dominio

### 6.1 Entidades Nucleares

| Entidad | Descripción |
| --- | --- |
| **Iniciativa** | Unidad de valor transversal (`TEMO-104`). Un único `owner_department` activo por fase. Atributos inmutables: ID, creador, timestamp. Prioridad + **motivo obligatorio**. |
| **Fase (workflow_stage)** | 7 fases secuenciales con `default_owner_department`, `sle_hours`, `wip_limit`, `order_index`. |
| **Checklist de fase** | Items configurables por fase (`stage_checklists`). Por iniciativa, valores en `initiative_checklist_values` con autor y fecha de cierre. |
| **Dependencia** | Solicitud 🆘 de un departamento a otro. Tipos: INFORMACIÓN, VALIDACIÓN, DECISIÓN, RECURSO. `is_blocking` determina si disparó parada. **No transfiere propiedad.** |
| **Bloqueo** | Estado `is_blocked` + `stop_reason` de la iniciativa (p. ej. `ESPERANDO_DECISION`). |
| **Evento de auditoría** | Fila inmutable en `activity_log` (caja negra). |
| **Notificación (derivada)** | No es tabla: se calcula como dependencias `PENDING` cuyo `target_department` es el del usuario actual. |

### 6.2 Tipos (enums)

Identificadores en inglés, fieles al DDL del Bloque 4:

- `DEPARTMENT = PRODUCT | PSYCHOLOGY | LEGAL | DESIGN | TECH | QA | CYBER`
- `PRIORITY = LOW | NORMAL | HIGH | CRITICAL`
- `PRIORITY_REASON = REGULATORY_RISK | B2B_CLIENT | SECURITY_INCIDENT | ROADMAP | INTERNAL_IMPROVEMENT`
- `HELP_TYPE = INFORMATION | VALIDATION | DECISION | RESOURCE`
- `STOP_REASON = ESPERANDO_DECISION | ESPERANDO_VALIDACION | ESPERANDO_INFORMACION | FALTA_CAPACIDAD | BLOQUEO_TECNICO | EXTERNO`
- `USER_ROLE = MEMBER | LEAD | EXECUTIVE`
- `ACTION_TYPE = STAGE_TRANSITION | EXCEPTION_OVERRIDE | DEPENDENCY_CREATED | DEPENDENCY_RESOLVED | BLOCKED_SET | BLOCKED_CLEARED | OWNER_REASSIGNED | INITIATIVE_CREATED | INITIATIVE_ARCHIVED | CHECKLIST_UPDATED`

### 6.3 Mapeo al esquema relacional

Los tipos `src/domain/*` mapean 1:1 al DDL PostgreSQL definido en `TemoFlow.md` (Bloque 4). Extensiones V1 respecto al DDL original:

1. `initiatives.is_archived BOOLEAN DEFAULT FALSE` — archivado (soft-delete) para ocultar del tablero conservando el audit log.
2. `activity_log.action_type` ampliado: `OWNER_REASSIGNED`, `ASSIGNEE_CHANGED`, `INITIATIVE_CREATED`, `INITIATIVE_UPDATED`, `INITIATIVE_ARCHIVED`, `INITIATIVE_RESTORED`, `CHECKLIST_UPDATED`, `DEPENDENCY_REJECTED`, `ACCESS_GRANTED`, `ACCESS_UPDATED`, `ACCESS_REVOKED`, `SYSTEM_SETTINGS_UPDATED`.
3. `activity_log` es **append-only**: en el mock no existen operaciones de update/delete; en SQL, un trigger `BEFORE UPDATE OR DELETE` las rechaza (`db/01-schema.sql`).
4. `activity_log.initiative_id` admite `NULL` para eventos de sistema sin iniciativa (altas y bajas de acceso, cambios de WIP/SLE).
5. `users.is_active BOOLEAN DEFAULT TRUE` — la tabla `users` es la lista de acceso; sin perfil activo no hay sesión.
6. `stage_checklists.responsible_department` — sin ella el panel de pendientes no puede ofrecer "Solicitar a Departamento Responsable" en un clic.
7. `initiatives.blocked_since` y `initiatives.blocked_ms_in_stage` — sostienen el SLE neto (tiempo de parada abierto y consolidado).
8. `initiatives.current_task` (columna "Tarea en curso" del Radar) y `initiatives.links JSONB` (Figma/Notion/repositorio).
9. `workflow_stages.purpose` — propósito de la fase, mostrado en la pestaña de compuerta.
10. El `help_type` mantiene los 4 tipos del documento funcional (el DDL original incluye `REVIEW`/`UNBLOCK`; en V1 no se ofrecen, pero el enum los tolera para compatibilidad futura).

El DDL completo con estas extensiones marcadas está en `db/01-schema.sql`.

---

## 7. Reglas de Negocio Mecánicas

### 7.1 Ciclo de fases

```
[1. IDEACIÓN] → [2. VIABILIDAD] → [3. CO-DISEÑO] → [4. READY (DoR)] → [5. DESARROLLO] → [6. QA & STAGING] → [7. PRODUCCIÓN]
```

| Fase | Dueño por defecto | SLE objetivo | Propósito |
| --- | --- | --- | --- |
| IDEACIÓN | Producto / Psicología | 7 días naturales | Concept Brief de 1 página. |
| VIABILIDAD | Legal / DPO | 48 h laborables | Dictamen RGPD Art. 9 + factibilidad técnica. |
| CO-DISEÑO | Diseño | 5 días laborables | Prototipo Figma + microcopy clínica + system prompts. |
| READY (DoR) | Producto / Tech Leads | 3 días laborables | OpenAPI/Swagger, criterios QA, privacidad validada. |
| DESARROLLO | Tech | 10 días laborables | Código, tests unitarios, despliegue a Staging. |
| QA & STAGING | QA | 48 h laborables | Regresión E2E, validación salud/pagos, sin logs PII/PHI. |
| PRODUCCIÓN | Tech | Hito final | Despliegue verificado y apertura a usuarios. |

No se permiten saltos arbitrarios de etapa sin compuerta.

### 7.2 Compuertas de salida (Exit Gates)

- `avanzarFase(initiative, session)`:
  1. Verifica checklist de la fase actual al 100%. Si incompleta → devuelve panel con los pendientes (item → botón "Solicitar a Departamento Responsable" que crea la dependencia en un clic, y botón "Solicitar Avance Excepcional").
  2. **Nunca lanza un error pasivo**: la UI siempre muestra la ruta de acción.
  3. Si completa → transición: calcula `duracion_horas`, registra `STAGE_TRANSITION`, resetea `stage_entered_at`, asigna dueño por defecto de la nueva fase y resetea `current_assignee_id = NULL`.

### 7.3 Avance Excepcional (Override)

- Disponible solo para `LEAD` (su área) y `EXECUTIVE` (total).
- Formulario bloqueante: requisitos incumplidos (multiselect), motivo (≥30 caracteres), riesgo asumido (≥30 caracteres) y **firma**:
  - Botón "Firmar y Forzar Avance" deshabilitado hasta escribir textualmente `CONFIRMAR EXCEPCION`.
  - En servidor: validar rol vía `auth()`, extraer `user_id`, `email`, IP y User-Agent, e insertar `EXCEPTION_OVERRIDE` con `override_metadata`.
- La tarjeta queda con marca permanente:

  > ⚠️ AVANCE EXCEPCIONAL REGISTRADO — Fase, pendiente, autorizado por, motivo, riesgo, fecha/hora.

### 7.4 Dependencias y bloqueo automático

- Abrir dependencia **no** cambia el propietario.
- Si `is_blocking == true` → la iniciativa pasa a `is_blocked = true` con `stop_reason` automático (trigger).
- Al resolver la **última** dependencia bloqueante pendiente → `is_blocked = false` automático.
- Resolver exige nota de respuesta y registra `DEPENDENCY_RESOLVED`.
- Dependencia no bloqueante: la iniciativa sigue avanzando en paralelo (led amarillo "Avanzando en paralelo").

### 7.5 SLE neto (tiempo en fase)

- `sle_consumed = SUM(tiempo en fase con is_blocked == false)`. El reloj mostrado es el **neto**; el tiempo bloqueado se descuenta y se acumula (para métricas) como `blocked_time` en el evento de transición.
- Estados del reloj en la tarjeta: 🟢 En tiempo, 🟡 Riesgo (≥75% del SLE), 🔴 Objetivo excedido (formato sobrio, sin parpadeos).
- Unidad (D16): horas naturales netas. `sle_hours` por fase: Ideación 168, Viabilidad 48, Co-Diseño 120, Ready 72, Desarrollo 240, QA 48, Producción 24.
- La columna muestra el SLE medio real de permanencia.

### 7.6 Propiedad (ownership)

- **Asignación automática** al transicionar: `owner_department = default_owner_department` de la nueva fase; `current_assignee_id = NULL` (el equipo receptor asigna a la persona).
- **Reasignación excepcional:** LEAD del departamento actual o destino, y EXECUTIVE, pueden reasignar dentro de la misma fase con motivo obligatorio → registro `OWNER_REASSIGNED` (old/new en JSON).

### 7.7 Prioridad y motivo

- Toda iniciativa exige `priority` + `priority_reason` (obligatorio). Badge en tarjeta: `🔴 Alta: Cliente B2B`, etc.

### 7.8 WIP y archivado

- WIP informativo: cabecera `Co-Diseño: 4/4`; si se excede, fondo ámbar + `⚠️ Saturado (+2)`.
- Iniciativas en PRODUCCIÓN cerradas o en desuso → `archive()` (soft-delete): ocultas del tablero, visibles en filtros y siempre en audit log.

---

## 8. Autenticación, Sesión y RBAC

### 8.1 Flujo

1. `next-auth` v5 con provider Google (OIDC). `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` y `AUTH_SECRET` en entorno.
2. **Allowlist estricta (D2):** el callback `signIn` busca el correo autenticado en `users`. Si no existe o tiene `is_active = false`, se deniega (fail-closed). El dominio del correo no autoriza nada.
3. El callback `jwt` **rehidrata el token desde `users` en cada petición** y devuelve `null` si el perfil desaparece o se desactiva: una baja corta el acceso al instante, sin esperar a que caduque la sesión.
4. `proxy.ts` protege todas las rutas de la app salvo login y assets; además, cada Server Component y cada Server Action revalidan la sesión con `getSessionContext()`.
5. En el servidor, `auth()` alimenta el `SessionContext` inmutable (userId, email, department, role) usado por services y actions.
6. **Acceso de desarrollo (D14):** un `CredentialsProvider` que solo se registra con `NODE_ENV=development` y `ALLOW_DEV_AUTH=true`, y que también pasa por la allowlist. El secreto de firma en desarrollo se deriva del proyecto (determinista, porque `proxy.ts` y el servidor se compilan por separado); en producción `AUTH_SECRET` es obligatorio.

### 8.2 Matriz de permisos

| Capacidad | MEMBER | LEAD | EXECUTIVE |
| --- | --- | --- | --- |
| Crear iniciativa | ✅ | ✅ | ✅ |
| Editar campos/enlaces de la iniciativa en curso | ✅ | ✅ | ✅ |
| Marcar items de checklist de su departamento | ✅ | ✅ | ✅ |
| Abrir/resolver solicitudes de ayuda (🆘) | ✅ | ✅ | ✅ |
| Activar/desactivar bloqueo | ✅ | ✅ | ✅ |
| Avanzar de fase con checklist 100% | ✅ | ✅ | ✅ |
| Reasignar propietario (mismo departamento actual/destino) | ❌ | ✅ | ✅ |
| Modificar checklist configurables de su área | ❌ | ✅ | ✅ |
| Modificar WIP/SLE del sistema | ❌ | ❌ | ✅ |
| **Avance Excepcional (override)** | ❌ | ✅ (su área) | ✅ (total) |
| Archivar iniciativa | ❌ | ✅ (su área) | ✅ |
| Administrar la lista de acceso (altas, bajas, rol) | ❌ | ❌ | ✅ |

**Regla de oro:** la matriz se valida en el servidor (services + actions). La UI solo oculta/deshabilita botones; nunca es la frontera de seguridad.

---

## 9. UI/UX — Vistas y Modales

### Vista 1 — Tablero de Flujo (Kanban)
- Columna por fase: nombre, WIP (`Co-Diseño: 4/4`) con estado ámbar si saturado, SLE medio real.
- Tarjeta: ID + badge de prioridad con motivo · título · propietario (avatar + departamento) · reloj SLE (verde/amarillo/rojo) · satélites de dependencia (`🔗 [Legal: ✅ Resuelto]`, `🔗 [Psicología: ⏳ Pendiente]`) · franja de bloqueo (`⛔ PARADA: ...`) · progreso `Checklist: 3/5`.

### Vista 2 — Radar de Esperas
- Tabla interactiva con filtros por departamento: Iniciativa · Fase actual · Propietario · Tarea en curso · Dependencias activas · Estado de flujo (`⛔ Parada`, `🟢 Avanzando`, `🟡 Avanzando en paralelo`).

### Vista 3 — Modal de Iniciativa (4 pestañas)
1. General (título, descripción, enlaces Figma/Notion/Repo, propietario, asignado).
2. Compuerta de Salida (checklist interactiva con autor + fecha por item).
3. Dependencias (🆘 → formulario: departamento, tipo, descripción, `¿Bloquea totalmente? Sí/No`; historial con responder/cerrar).
4. Trazabilidad (audit log cronológico inverso).

### Vista 4 — Panel de Dirección
- Tiempo medio por fase vs SLE (cuellos de botella estructurales).
- Distribución de causas de parada (p. ej. `42% Esperando decisión`).
- Tasa de overrides (síntoma de burocracia desajustada).

### Centro de Notificaciones (in-app)
- Derivado del estado: dependencias `PENDING` con `target_department == session.department`.
- Contador en la barra → página con "Recibidas" (responder) y "Enviadas" (estado).

### Accesos y parámetros (`/team`, solo Dirección)
- Lista de acceso: alta por correo con departamento y rol, cambio de ambos y revocación (baja lógica). Nadie puede revocarse a sí mismo.
- Parámetros de fase: objetivo de SLE (horas netas) y límite de WIP.
- Ambas capacidades se revalidan en el servidor dentro de cada Server Action, no solo al pintar la página.

### Sistema visual
- Tokens de color en `src/app/globals.css` con tema claro y oscuro; el tema se aplica antes de pintar para evitar parpadeo y se recuerda en el navegador.
- Base neutra y un único acento de marca: el color saturado queda reservado a la señal operativa (prioridad, reloj de SLE, parada, saturación de WIP).
- Los gráficos de dirección son tablas reales con una barra dibujada en una celda: legibles con lector de pantalla y sin depender del color.

---

## 10. Diseño de la Capa de Datos (Mock)

### 10.1 Interfaz repositorio

```ts
// src/server/repositories/types.ts
export interface DataStore {
  initiatives(): Promise<Initiative[]>;
  initiativeById(id: string): Promise<Initiative | null>;
  dependenciesFor(initiativeId: string): Promise<Dependency[]>;
  users(): Promise<User[]>;
  stageByKey(key: string): Promise<WorkflowStage | null>;
  // ... + métodos para crear/actualizar, siempre append-only en logs
}
```

### 10.2 Implementación V1: `InMemoryDataStore`

- Colecciones en memoria (Map) iniciadas con el **seed** del documento: 7 iniciativas distribuidas en fases, con dependencias activas, bloqueos y audit log preexistente.
- Los servicios de dominio reciben el store inyectado; cada Server Action opera una instancia **singleton por proceso de servidor**.
- Persistencia de trabajo (D15): el estado se vuelca a `.data/store.json` del lado servidor tras cada mutación (con debounce) y se recarga al arrancar. `DATA_SNAPSHOT=false` lo desactiva; borrar `.data/` vuelve a la semilla. El navegador nunca guarda estado de dominio.

### 10.3 Migración futura a PostgreSQL/Supabase

1. El DDL del Bloque 4 se aplica tal cual (`01-schema.sql`) + extensiones V1 (8.5 / §6.3).
2. Se implementa `PostgresDataStore` implementando la misma interfaz.
3. Server Actions y services NO cambian.
4. Auth.js ya usa sesión JWT stateless → el switch no toca sesiones.

---

## 11. Estrategia de Pruebas (Vitest)

| Área | Qué se prueba |
| --- | --- |
| Compuertas | Avanzar con checklist < 100% devuelve pendientes y panel; == 100% transiciona y asigna dueño. |
| Override | Solo LEAD/EXECUTIVE; motivo/riesgo ≥ 30 chars; exige `CONFIRMAR EXCEPCION`; registra evento con metadata. |
| Bloqueo | Crear dependencia bloqueante → `is_blocked`; resolver última → desbloqueo automático. |
| SLE neto | Tiempo bloqueado no cuenta; cálculo de reloj (verde/amarillo/rojo). |
| Ownership | Transición asigna `default_owner_department`; reasignación exige motivo y registra `OWNER_REASSIGNED`. |
| RBAC | Acciones denegadas por rol/departamento en el servidor (sesiones stub por rol). |
| No-ping-pong | Abrir dependencia no cambia `owner_department`. |
| Prioridad | Crear iniciativa sin `priority_reason` falla. |

Los tests ejercitan **servicios puros** con `InMemoryDataStore`; no requieren red, DB ni login real. Están en `src/server/services/*.test.ts` (49 pruebas en 7 archivos) y cubren además la allowlist de acceso, la inmutabilidad de la caja negra y las proyecciones de lectura de las cuatro vistas sobre la semilla.

---

## 12. Roadmap V1 → V2

| Funcionalidad | V1 | V2 |
| --- | --- | --- |
| Tablero Kanban y Radar de Esperas | ✅ | — |
| Checklists configurables por fase | ✅ | — |
| Botón 🆘 Solicitar Ayuda | ✅ | — |
| Modal de Avance Excepcional con registro forzoso | ✅ | — |
| Audit Log completo | ✅ | — |
| Panel de métricas de permanencia y paradas | ✅ | — |
| Centro de notificaciones in-app | ✅ | — |
| Persistencia PostgreSQL/Supabase | ❌ (mock) | ✅ |
| Integración Slack/Teams | ❌ | ✅ |
| Sync de PRs de GitHub | ❌ | ✅ |
| Informes PDF exportables | ❌ | ✅ |
| Push móvil | ❌ | ✅ |

---

## 13. Glosario

| Término | Definición |
| --- | --- |
| SLE | Standard Lead Time: objetivo de permanencia en una fase. |
| SLE neto | Tiempo en fase excluyendo periodos con `is_blocked = true`. |
| Checkpoint/Compuerta | Condición 100% de checklist para Avanzar de Fase. |
| Override | Avance excepcional auditado que salta una compuerta. |
| Caja negra | `activity_log`, registro inmutable y append-only. |
| DoR | Definition of Ready (fase 4). |
| WIP | Work In Progress (límite informativo por fase). |
| Soft-delete | Archivado lógico; la entidad permanece en datos y logs. |
| No-ping-pong | Una dependencia no transfiere la propiedad de la iniciativa. |