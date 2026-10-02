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
| D18 | Sistema visual | **Revisado el 01/10/2026:** identidad de marca Temotiva (Brandbook 2026 de la web): Roboto, neutros lavanda teñidos del violeta `#7B5CFF`, bordes de 1 px, etiquetas translúcidas `.tone-*`, esquinas de 10 px y elevación solo al pasar por encima. Base de 14 px y mínimo de 12 px por accesibilidad (WCAG 2.2 AA). Los emoji que fija la especificación se conservan. Ver §10. |
| D19 | Navegación | Barra lateral plegable en lugar de barra superior, paleta de comandos `⌘K` y atajos de una tecla. La ficha de iniciativa es un **panel lateral** (Sheet), no un modal centrado: no tapa el tablero. |
| D25 | Ámbito del trabajo | Avanzar fase, asignar persona y declarar parada quedan abiertos a los tres roles (matriz §2.1) pero **acotados al área propietaria** o a Dirección: la capacidad es de oficio, no de jerarquía, y nadie mueve el trabajo de otro departamento. La prioridad, que ordena el trabajo ajeno, exige responsable del área o Dirección. |
| D26 | Orígenes de la parada | El estado de parada se **recalcula** a partir de dos orígenes que pueden coexistir (manual y dependencias bloqueantes pendientes) en un único sitio, `recomputeBlockState`. Solo se registra evento cuando el estado cambia de verdad. |
| D27 | Antigüedad de la parada | `blocked_since` es el ancla de contabilidad de la fase en curso y se reinicia al transicionar (cada fase descuenta solo lo suyo); `blocked_started_at` conserva el inicio real de la parada para mostrarla y medirla sin truncar. |
| D28 | PII en la caja negra | Los eventos de acceso referencian a la persona por `user_id`, nunca por su correo: así la anonimización puede borrar el correo de verdad sin dejar copias en un log que es inmutable. |
| D21 | Áreas | Una persona puede pertenecer a **varias áreas** (`user_departments`), porque hay responsables que llevan más de un departamento. Toda comprobación de área es pertenencia, no igualdad. Se añaden RRHH, Finanzas y Marketing: no son propietarias de ninguna fase, pero reciben solicitudes y tienen responsable. |
| D22 | Altas | Jerarquía descendente: Dirección da de alta a cualquiera con cualquier rol y áreas; un responsable suma **miembros** dentro de las áreas que lleva; un miembro no da de alta a nadie. Nadie otorga lo que no tiene. |
| D23 | Supresión | "Eliminar" es baja lógica; la anonimización (Dirección) sustituye nombre y correo por un identificador opaco y conserva la fila, para no romper la atribución de la caja negra. |
| D24 | Cuenta propia | Cualquier rol edita su nombre visible en `/cuenta`. El correo no se cambia ahí (es la llave de acceso) y no hay contraseña que gestionar: la custodia Google (D2). |
| D20 | Filtros | Los filtros del tablero (departamento, estado de flujo, texto, archivadas) viven en la URL, así que una vista filtrada es compartible; el WIP y la media siguen describiendo la fase entera, no lo filtrado. |

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

- Abrir dependencia **no** cambia el propietario, y siempre apunta a **otro** departamento: pedirse ayuda a uno mismo no es una dependencia y permitía autoinducirse paradas.
- El estado de parada tiene **dos orígenes que pueden coexistir** (D26): la causa declarada a mano y las dependencias bloqueantes pendientes. `recomputeBlockState` es la única función que escribe `is_blocked`, y solo emite evento cuando el estado cambia:
  - primera causa viva → `BLOCKED_SET`; una segunda dependencia bloqueante **no** vuelve a registrarla (contarla dos veces inflaba el recuento y sumaba intervalos solapados en el panel);
  - resolver la última dependencia bloqueante levanta la parada **solo si no queda causa manual**;
  - levantar la causa manual la mantiene parada si aún hay dependencias bloqueantes abiertas.
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
| Dar de alta miembros en sus áreas | ❌ | ✅ | ✅ |
| Editar rol y áreas de cualquiera | ❌ | ❌ | ✅ |
| Crear responsables o dirección | ❌ | ❌ | ✅ |
| Dar de baja a alguien de sus áreas | ❌ | ✅ (miembros) | ✅ |
| Anonimizar un perfil (RGPD) | ❌ | ❌ | ✅ |
| Editar su propio nombre visible | ✅ | ✅ | ✅ |

**Regla de oro:** la matriz se valida en el servidor (services + actions). La UI solo oculta/deshabilita botones; nunca es la frontera de seguridad.

### 8.3 Jerarquía de gestión de personas (D22)

```
Dirección (EXECUTIVE)
  ├── crea, edita y da de baja a cualquiera, con cualquier rol y cualquier área
  ├── reparte las áreas de cada responsable (una o varias)
  └── anonimiza perfiles dados de baja (derecho de supresión)
        │
   Responsable de área (LEAD) — una o varias áreas
        ├── da de alta MIEMBROS dentro de las áreas que lleva
        ├── edita nombre y áreas de esos miembros (sin salirse de las suyas)
        └── les da de baja
              │
         Miembro (MEMBER)
              └── solo su propia cuenta
```

Dos reglas sostienen la jerarquía y las dos viven en `rbac.ts`:

1. **Nadie otorga lo que no tiene.** `canGrantAccess` exige que el rol resultante sea otorgable por quien edita y que **todas** las áreas resultantes estén entre las suyas. Un responsable no puede ascender a nadie ni colocarlo en un área ajena.
2. **El alcance se mide sobre la persona entera.** `canManageUser` exige cubrir **todas** las áreas de quien se edita: si alguien pertenece a Tech y a Finanzas, quien solo lleva Tech no decide por esa persona.

Además, nadie puede revocarse el acceso ni cambiarse el rol a sí mismo: evita quedarse fuera del sistema y evita la autoconcesión de permisos.

---

## 9. UI/UX — Vistas y Modales

### Vista 1 — Tablero de Flujo (Kanban)
- Barra de filtros rápidos en la cabecera: texto, estado de flujo (todas / paradas / en riesgo), departamento (propietario o destinatario de una solicitud abierta) y archivadas. Todo en la URL.
- Columna por fase: nombre, WIP (`Co-Diseño: 4/4`) con estado ámbar si saturado, SLE medio real. Si el filtro esconde tarjetas, la columna lo dice.
- Tarjeta: ID + badge de prioridad con motivo · título · propietario (avatar + departamento) · reloj SLE (verde/amarillo/rojo) · satélites de dependencia (`🔗 [Legal: ✅ Resuelto]`, `🔗 [Psicología: ⏳ Pendiente]`) · franja de bloqueo (`⛔ PARADA: ...`) · progreso `Checklist: 3/5`.

### Vista 2 — Radar de Esperas
- Tabla interactiva con filtros por departamento: Iniciativa · Fase actual · Propietario · Tarea en curso · Dependencias activas · Estado de flujo (`⛔ Parada`, `🟢 Avanzando`, `🟡 Avanzando en paralelo`).

### Vista 3 — Ficha de Iniciativa (panel lateral, 4 pestañas)
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

### Sistema visual (D18)

Referencia estética: herramientas de trabajo densas tipo Linear o Vercel. Sobrio, tipografía pequeña y mucho aire entre bloques, no entre líneas.

- **Tipografía:** Geist Sans y Geist Mono (`geist` + `next/font`), 13 px de base. Cifras tabulares en todo dato comparable (relojes, contadores, porcentajes).
- **Color:** escala neutra fría (zinc) en cuatro superficies (`--bg`, `--surface`, `--surface-2`, `--surface-3`), bordes de 1 px en dos intensidades y **un único acento** de marca. El color saturado queda reservado a la señal operativa.
- **Etiquetas translúcidas:** las clases `.tone-*` de `globals.css` son la única receta de color de estado — fondo del tono al 12 %, anillo interior al 22 % y texto del tono. Badges, franjas de parada, filtros activos y barras comparten esa receta, así que nunca se desalinean entre sí.
- **Elevación:** las tarjetas usan `.card-hover`: al pasar por encima el borde se afirma, aparece una sombra corta y la tarjeta sube 1 px. Nada de sombras permanentes.
- **Movimiento:** 150-260 ms con curva de salida, enganchado al `data-state` de Radix vía `data-motion`; se anula entero bajo `prefers-reduced-motion`.
- **Pictogramas:** los emoji que la especificación fija (⛔ 🔗 ⏳ ✅ ⚠️ 🔒 🚨 🆘 🟢 🟡) se conservan, siempre dentro de una etiqueta translúcida y a tamaño fijo; el resto de iconografía es lucide a 14 px.
- **Gráficos:** el panel de dirección son tablas reales con una barra dibujada en una celda: legibles con lector de pantalla y sin depender del color.

### Navegación y teclado (D19)

- **Barra lateral plegable** con las vistas, el contador de notificaciones, el tema y la sesión. El plegado vive como clase en `<html>` (la aplica el script del layout antes de pintar), no como estado de React: así el servidor y el cliente no discrepan al hidratar. En pantallas estrechas se sustituye por una barra superior.
- **Paleta de comandos** (`⌘K` / `Ctrl+K`): salta a cualquier iniciativa por ID o título — con búsqueda insensible a acentos —, cambia de vista y lanza acciones.
- **Atajos:** `C` nueva iniciativa, `/` filtrar el tablero, `G`+`B`/`R`/`D`/`N`/`A` para cambiar de vista, `Esc` cerrar, `?` ayuda. Se desactivan mientras el foco está en un campo de texto.
- La paleta y los atajos hablan con el resto de la interfaz por eventos de `window` (`src/components/command/command-bus.ts`) en vez de subir estado hasta la raíz.

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

### 10.1.1 Limitación conocida de V1

`nextInitiativeId` deriva el siguiente `TEMO-XXX` del máximo presente en el store. Con una sola instancia y su snapshot es correcto, pero **dos procesos sembrados a la vez generarían identificadores duplicados**. La numeración pasa a la base de datos (secuencia o `SELECT … FOR UPDATE`) cuando llegue `PostgresDataStore`; V1 no contempla multi-instancia.

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

---

## 10. Sistema visual (marca Temotiva)

**Modo:** Operate. La marca fija el mundo; la interfaz sigue siendo una herramienta de trabajo diario, así que la expresión nunca tapa la tarea.

- **Tipografía:** Roboto (400/500/700) y Roboto Mono para los ID `TEMO-XXX`. Base de 14 px (`text-sm`), apoyo de 12 px (`text-xs`), metadatos de 11 px solo para glifos y teclas. Cifras comparables con `tabular-nums`.
- **Color:** acento único `--accent` (`#7B5CFF` claro, `#9B85FF` oscuro). El texto pequeño de acento usa `--accent-text` (`#5A3ED9` / `#B7A6FF`) para llegar a 4,5:1. Fondos `#F7F6FB` y blanco; oscuro `#110E1A` / `#1A1525`. Los tonos de señal (`--success`, `--warning`, `--danger`, `--info`) son tonos de texto ya oscurecidos; los fondos se derivan en `.tone-*`.
- **Forma:** `--radius` 10 px; sombras teñidas de violeta, solo al elevar.
- **Logo:** cerebro de línea (`public/brand/temotiva-brain.png`, `BrandMark`), invertido en tema oscuro. Mascota «Cerebrín» (`public/brand/cerebrin-saludando.png`) reservada a estados vacíos y a la guía de bienvenida.
- **Objetivos táctiles:** 44 px con puntero grueso (`@media (pointer: coarse)` en `globals.css`).
- **Responsive:** prioridad portátil y tablet (≥768 px); en móvil, consulta.
- **Movimiento:** 150-260 ms, sin rebotes, y alternativa para `prefers-reduced-motion`.
