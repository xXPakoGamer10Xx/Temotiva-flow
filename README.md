# Temotiva Flow V1

Sistema interno de gestión, trazabilidad y coordinación del flujo de **iniciativas**
interdisciplinares de Temotiva (HealthTech · salud mental y bienestar emocional).

Una iniciativa (`TEMO-104`) recorre 7 fases secuenciales cerradas con una compuerta de
salida obligatoria en cada una, puede pedir ayuda a otros departamentos sin perder su
propietario, puede declararse en parada (y entonces su reloj se detiene), y todo lo que le
pasa queda en una caja negra inmutable.

> Documentación de referencia: `TemoFlow.md` (qué hace el sistema), `DESIGN.md` (cómo está
> construido), `SEGURIDAD.md` (política de seguridad y propiedad intelectual) y `AGENTS.md`
> (reglas para quien toque el código, persona o agente).

---

## Puesta en marcha

```bash
npm install
cp .env.example .env.local   # y rellena las variables de abajo
npm run dev                  # http://localhost:3000
```

### Variables de entorno

| Variable | Para qué | Obligatoria |
| --- | --- | --- |
| `AUTH_SECRET` | Firma de la sesión. Genérala con `npx auth secret`. | Sí en producción |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Credenciales OAuth de Google. | Para entrar con Google |
| `ALLOW_DEV_AUTH` | Habilita el acceso local sin Google (solo desarrollo). | No |
| `DATA_SNAPSHOT` | `false` para no persistir el estado en `.data/`. | No |

En desarrollo, si falta `AUTH_SECRET` se usa una clave local derivada del proyecto y se
avisa por consola. En producción no hay sustituto: sin secreto no se firma ninguna sesión.

### Configurar Google OAuth

1. En Google Cloud Console → **APIs y servicios → Credenciales → Crear ID de cliente OAuth**
   (tipo *Aplicación web*).
2. Orígenes autorizados: `http://localhost:3000`.
   URI de redirección: `http://localhost:3000/api/auth/callback/google`.
3. Copia el ID y el secreto a `.env.local`.

No hace falta que las cuentas sean del dominio corporativo: el equipo trabaja con cuentas
de Google propias. **Quien autoriza es la lista de acceso**, no el dominio del correo.

### Acceso de desarrollo

Con `NODE_ENV=development` y `ALLOW_DEV_AUTH=true`, la pantalla de acceso ofrece entrar
como cualquiera de los perfiles de la semilla, sin Google. Sirve para ver la aplicación
antes de tener credenciales OAuth y para probar cada rol. Pasa por la misma lista de
acceso y **no se registra nunca en producción**, aunque la variable esté puesta.

---

## Cómo se entra: lista de acceso

`users` es la puerta. Al iniciar sesión, el correo autenticado se busca en esa tabla:

- si no existe, o si está con `is_active = false` → **acceso denegado** (fail-closed);
- si existe → su `id`, `department` y `role` se inyectan en el token y sostienen todo el
  control de permisos del servidor.

El token se rehidrata desde la tabla en cada petición, así que una baja o un cambio de rol
surten efecto de inmediato, sin esperar a que caduque la sesión.

Dirección administra la lista desde **Accesos** (`/team`), donde también se ajustan los
objetivos de SLE y los límites de WIP de cada fase.

---

## Comandos

```bash
npm run dev        # desarrollo (Turbopack)
npm run build      # build de producción
npm run start      # servir el build
npm run lint       # ESLint 9 (next lint ya no existe en Next 16)
npm run typecheck  # TypeScript en modo strict
npm run test       # Vitest: una prueba por invariante de negocio
```

---

## Mapa del código

```
src/
├── app/                    # Rutas (App Router, Server Components)
│   ├── board/              # Vista 1 · Tablero de flujo (Kanban)
│   ├── radar/              # Vista 2 · Radar de esperas
│   ├── executive/          # Vista 4 · Panel de dirección
│   ├── notifications/      # Centro de notificaciones
│   ├── team/               # Lista de acceso y parámetros (solo Dirección)
│   └── login/
├── components/             # Interfaz (tarjetas, ficha 360°, gráficos, primitivas)
├── domain/                 # Tipos, enums, reglas y semilla — espejo del DDL
├── lib/                    # Auth, sesión, utilidades
├── proxy.ts                # Protección de rutas (antes middleware.ts)
└── server/
    ├── actions/            # Server Actions: única vía de mutación, validadas con zod
    ├── services/           # Reglas de negocio puras y testeables
    └── repositories/       # Interfaz DataStore + implementación en memoria
db/01-schema.sql            # Esquema PostgreSQL listo para migrar
```

**Cómo fluye una mutación:** el componente recoge el formulario → llama a una Server Action
→ la acción resuelve la sesión con `auth()` y valida la entrada con zod → el servicio de
dominio comprueba el permiso y aplica la regla → el repositorio guarda → se registra el
evento en la caja negra → se revalidan las vistas.

La interfaz oculta botones por comodidad, pero **nunca** es la frontera de seguridad: cada
permiso se verifica otra vez en el servidor.

---

## Datos

V1 funciona con una capa de datos en memoria detrás de la interfaz `DataStore`, sembrada
con diez iniciativas ficticias repartidas por las siete fases, con dependencias abiertas,
paradas, un avance excepcional ya firmado y su historial completo. Con `DATA_SNAPSHOT`
activo, el estado se vuelca a `.data/store.json` para que las sesiones de trabajo
sobrevivan a los reinicios; borra esa carpeta para volver a la semilla.

Migrar a PostgreSQL/Supabase es aplicar `db/01-schema.sql` e implementar `PostgresDataStore`
con la misma interfaz. Ni los servicios ni las Server Actions cambian.

---

## Qué está y qué no

**En V1:** tablero, radar, ficha 360° con sus cuatro pestañas, panel de dirección,
compuertas por fase, avance excepcional auditado, dependencias y paradas, centro de
notificaciones, lista de acceso y caja negra.

**Fuera de V1:** integración con Slack/Teams, sincronización de PRs de GitHub, informes PDF
y notificaciones push (ver `DESIGN.md` §12).

---

Contenido confidencial y propiedad intelectual de Temotiva. No distribuir fuera del entorno
corporativo (`SEGURIDAD.md`).
