# AGENTS.md — Guía operativa para agentes de código

Este archivo instruye a agentes de IA (Claude, opencode, etc.) que trabajen en el repositorio de **Temotiva Flow V1**, sistema interno de Temotiva (HealthTech). Léelo completo antes de tocar código.

Documentos de referencia:
- `TemoFlow.md` — especificación funcional definitiva (fuente de verdad de las reglas de negocio).
- `DESIGN.md` — arquitectura y diseño de sistemas (cómo se implementa).
- `SEGURIDAD.md` — política de seguridad y propiedad intelectual (OBLIGATORIO cumplirla).

---

## 1. Contexto del proyecto

Sistema de gestión, trazabilidad y coordinación de **iniciativas** interdepartamentales (`TEMO-XXX`) a través de 7 fases secuenciales cerradas, con dependencias entre departamentos (🆘), bloqueos, checklist de salida obligatoria por fase, avance excepcional auditable y caja negra (audit log inmutable).

- Front-end con App Router (Next.js 16), capa de datos en memoria tras la interfaz `DataStore` (con snapshot opcional en `.data/`), y autenticación real con Google contra una **lista de acceso** en la tabla `users`.
- **UI en español, código en inglés.**

---

## 2. Stack y comandos

| Herramienta | Versión/Nota |
| --- | --- |
| Next.js | 16.x (App Router, Turbopack por defecto) |
| React | 19.2 |
| TypeScript | strict |
| Tailwind CSS | v4 |
| shadcn/ui | componentes locales |
| lucide-react | iconos |
| next-auth (Auth.js) | v5 beta (`next-auth@5.0.0-beta.32`), Google + allowlist en `users` |
| Vitest | unit tests |
| ESLint | 9, configuración plana (`eslint-config-next/core-web-vitals` + `/typescript`); `next lint` ya no existe |

```bash
npm install
npm run dev        # desarrollo Turbopack
npm run build      # producción
npm run lint       # ESLint 9
npm run typecheck  # TypeScript strict
npm run test       # Vitest: un test por invariante
```

Variables de entorno en `.env.example`; la puesta en marcha está en `README.md`.

---

## 3. Estructura de carpetas

```
src/
├── app/                  # Rutas del App Router (Server Components)
│   ├── api/auth/[...nextauth]/route.ts   # handlers NextAuth + force-dynamic
│   ├── board/            # Vista 1: Tablero Kanban
│   ├── radar/            # Vista 2: Radar de Esperas
│   ├── executive/        # Vista 4: Panel de Dirección
│   ├── notifications/    # Centro in-app
│   ├── team/             # Lista de acceso y parámetros (solo EXECUTIVE)
│   └── login/            # Acceso
├── components/           # UI (shadcn/ui + lucide), "use client" solo cuando haga falta
├── domain/               # Tipos/enums/mocks REPLICANDO el DDL del Bloque 4 (§6)
├── lib/
│   ├── auth.ts           # NextAuth (auth, signIn, signOut, handlers)
│   └── session.ts        # SessionContext de confianza + contexto de petición
├── proxy.ts              # Protección de rutas (Next 16; antes middleware.ts)
└── server/
    ├── actions/          # Server Actions (mutaciones únicas de entrada)
    ├── services/         # Reglas de negocio puras (testeables) + *.test.ts
    └── repositories/     # Interfaz DataStore + impl InMemory + snapshot

db/01-schema.sql          # DDL PostgreSQL con las extensiones V1 marcadas
```

---

## 4. Convenciones de código

1. **Idioma:** código, identificadores, enums, comentarios en **inglés**. Todos los **strings visibles al usuario en español** (labels, toasts, botones como "Avanzar Fase", "Solicitar Ayuda", "🔒", "⚠️", "🚨", "🆘", "⛔" tal como instruye la spec).
2. **Mutaciones:** Únicamente vía Server Actions. Nunca mutar el estado mock desde el cliente; el navegador solo recibe datos de solo lectura.
3. **Seguridad en servidor:** toda mutación crítica valida rol y departamento con `auth()` en el servidor. La UI solo oculta botones; nunca es la frontera de seguridad.
4. **Reglas de negocio** en `server/services` como funciones puras que reciben el `DataStore` y el `SessionContext` inyectados. Sin I/O dentro de los servicios.
5. **Tipos:** los tipos/enums de `src/domain/` son el espejo exacto del DDL PostgreSQL de `TemoFlow.md` (Bloque 4) y sus extensiones V1 (§6.3 de `DESIGN.md`).
6. **Entradas:** validar formularios con `zod` dentro de la Server Action antes de llamar al servicio.
7. **Next 16:** usar `auth()` en Server Components (nunca `getSession()`). Rutas auth con `export const dynamic = 'force-dynamic'`. `params`/`searchParams` async. `proxy.ts` para proteger rutas.
8. **Audit log:** todo evento se inserta (append-only) con `user_id` de la sesión criptográficamente validada. No reescribir ni borrar entradas del log.
9. **Estilo:** Tailwind v4 + primitivas locales sobre Radix. Iconografía lucide-react a 14 px. Código modular, tipado fuerte, sin dependencias innecesarias.
10. **Sistema visual:** los colores se usan **siempre** por token (`bg-surface`, `text-fg-muted`, `border-border`, `text-accent`, `--success/--warning/--danger/--info`). Prohibido escribir un color literal de Tailwind (`bg-zinc-100`, `text-red-500`) fuera de los puntos de departamento. El estado se pinta con las clases `.tone-*` de `globals.css`, nunca componiendo fondo, borde y texto a mano.
11. **Tipografía:** Roboto, base de 14 px. `text-sm` para contenido, `text-xs` (12 px) para apoyo y metadatos; `text-[11px]` solo para glifos y teclas. Cifras comparables con `tabular-nums`.
12. **Pictogramas:** se conservan los emoji que la especificación fija literalmente (⛔ 🔗 ⏳ ✅ ⚠️ 🔒 🚨 🆘 🟢 🟡), siempre dentro de una etiqueta y con `aria-hidden`. Cualquier otro icono es lucide.
13. **Teclado:** toda acción nueva que merezca atajo se registra en la paleta (`command-center.tsx`) y, si lleva tecla propia, también en la ayuda `?`. Los atajos de una tecla nunca deben dispararse escribiendo en un campo (`isTypingTarget`).

---

## 5. Reglas de negocio invariantes (no violarlas)

1. **Compuerta de salida:** `Avanzar Fase` exige checklist de la fase actual al 100%. Si falta → mostrar panel con los pendientes y acciones: `[Solicitar a Departamento Responsable]` (crea dependencia en un clic) y `[🚨 Solicitar Avance Excepcional]`. Nunca un error pasivo.
2. **Override:** solo `LEAD` (su área) / `EXECUTIVE` (total). Formulario bloqueante: pendientes, motivo (≥30), riesgo (≥30) y el botón se habilita solo al escribir `CONFIRMAR EXCEPCION`. Servidor: validar rol, registrar `EXCEPTION_OVERRIDE` con IP/User-Agent en `override_metadata`, dejar marca permanente ⚠️ en la tarjeta.
3. **No-ping-pong:** abrir una dependencia NO cambia `owner_department`. Si `is_blocking == true` → `is_blocked = true` automático; al resolver la última bloqueante → `is_blocked = false`.
4. **SLE neto:** el tiempo con `is_blocked == true` no cuenta contra el SLE.
5. **WIP:** informativo (advertencia `⚠️ Saturado`); nunca bloquea mover una iniciativa.
6. **Propiedad:** al avanzar de fase, `owner_department = default_owner_department` de la nueva fase y `current_assignee_id = NULL`. Reasignación solo LEAD/EXECUTIVE con motivo → evento `OWNER_REASSIGNED`.
7. **Prioridad:** crear iniciativa exige `priority` + `priority_reason` (motivo obligatorio).
8. **Ciclo de vida:** archivado = soft-delete (`is_archived`); las entidades nunca se borran físicamente y el audit log permanece intacto.
9. **Fases:** 7 cerradas y secuenciales: IDEACIÓN → VIABILIDAD → CO-DISEÑO → READY → DESARROLLO → QA & STAGING → PRODUCCIÓN. Sin saltos sin compuerta.
10. **Compuerta por departamento:** cada item de checklist lo marca su `responsible_department` (EXECUTIVE puede sobre cualquiera). No se marcan items de otra fase.
11. **Acceso:** la tabla `users` es la lista de acceso; sin perfil activo no hay sesión.
12. **Áreas múltiples:** una persona puede llevar varias. Toda comprobación es `session.departments.includes(x)` (o `belongsTo`), **nunca** `session.department === x`.
13. **Jerarquía de altas:** EXECUTIVE crea a cualquiera; LEAD solo miembros y solo dentro de sus áreas; MEMBER a nadie. Nadie otorga rol ni área que no tenga, ni se revoca o asciende a sí mismo.
14. **Ámbito del trabajo:** avanzar fase, asignar y parar exigen pertenecer al `owner_department` (o ser EXECUTIVE). La prioridad exige LEAD del área o EXECUTIVE. Los campos descriptivos siguen abiertos a todos (§1.3).
15. **Parada:** nunca se escribe `is_blocked` a mano desde un servicio; se llama a `recomputeBlockState`, que concilia la causa manual con las dependencias bloqueantes y decide si hay evento.
16. **Supresión:** "eliminar" es baja lógica; la anonimización conserva la fila y no filtra el correo al log. Nunca se borra físicamente una persona.

---

## 6. Líneas rojas (PROHIBIDO)

- Sustituir el inicio de sesión real (NextAuth + Google + allowlist) por selectores de rol, usuarios mock "logueados" o cualquier atajo de sesión. El único acceso alternativo admitido es el proveedor de desarrollo descrito en `SEGURIDAD.md` §3.3, que exige `NODE_ENV=development` + `ALLOW_DEV_AUTH=true` y pasa igualmente por la lista de acceso.
- Ejecutar mutaciones críticas validando permisos solo en el cliente.
- Avanzar de fase sin compuerta completa y sin override registrado.
- Comitear `.env`, `AUTH_SECRET`, `AUTH_GOOGLE_ID/SECRET` o cualquier secreto; loggear secretos o datos personales (PII/PHI).
- Escribir strings de interfaz en inglés o identificadores en español.
- Mutar el audit log (solo append).
- Dar acceso a un correo que no esté en la tabla `users` o esté con `is_active = false`: la autorización es la lista, no el dominio del correo (`SEGURIDAD.md` §3.2).

---

## 7. Pruebas

- Hay un test por invariante de §5 en `src/server/services/*.test.ts`, sobre `InMemoryDataStore` y sesiones stub por rol (`MEMBER`, `LEAD`, `EXECUTIVE`). Las utilidades comunes están en `test-utils.ts`.
- Toda regla nueva o modificada llega con su test. Los tests no requieren red, base de datos ni login real.
- `npm run test`, `npm run lint` y `npm run typecheck` deben pasar antes de considerar completa una tarea.

---

## 8. Seguridad (resumen)

La política completa está en `SEGURIDAD.md`. Reglas mínimas aquí:
- Todo el contenido (specs, código, datos mock, configuraciones) es **confidencial y propiedad intelectual de Temotiva**.
- No extraer, copiar ni enviar contenido del repo fuera del dominio corporativo.
- Cambios sensibles (auth, RBAC, override, log) requieren lectura previa de `SEGURIDAD.md` §5-§8.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
