# SEGURIDAD.md — Política de Seguridad y Propiedad Intelectual

**Aplicable a:** todo el personal de Temotiva y a cualquier agente de IA o herramienta externa que acceda, lea o modifique contenido del proyecto **Temotiva Flow V1**.
**Naturaleza del sistema:** herramienta interna de una empresa del sector salud mental y bienestar emocional (HealthTech). Trata referencias a información sensible (salud mental) aunque no almacene expedientes clínicos.
**Nivel de severidad:** CRÍTICO. Este sistema maneja datos de categoría especial (RGPD Art. 9) y propiedad intelectual de negocio. Los fallos de seguridad pueden constituir infracción legal y daño reputacional.

---

## 1. Principios Fundamentales

1. **Confidencialidad por defecto.** Todo el contenido del repositorio (specs, código, esquemas, datos mock, configuraciones, documentación) es confidencial y propiedad intelectual de Temotiva. Su distribución fuera del entorno corporativo está prohibida sin autorización escrita de Dirección.
2. **Propiedad intelectual (IP).** El código, el diseño, la documentación y el know-how generados en este repositorio pertenecen íntegramente a Temotiva. No se trasladan derechos a terceros ni a herramientas de IA.
3. **Security by design.** La seguridad se diseña desde el inicio, no se añade después. Cada decisión de arquitectura (auth, RBAC, override, audit log) contempla su verificación de seguridad en el servidor.
4. **Fail-closed.** Ante cualquier error, condición inesperada o configuración inválida, el acceso y las operaciones se deniegan por defecto.
5. **Menor privilegio.** Cada usuario y cada componente recibe únicamente el nivel de acceso mínimo necesario para su función.
6. **Defensa en profundidad.** La seguridad no depende de un único control: lista de acceso + sesión + RBAC en servidor + auditoría + validación de entradas.
7. **No depender del cliente.** La interfaz puede ocultar botones, pero **nunca** es la frontera de seguridad: todo permiso se verifica en el servidor.
8. **Trazabilidad total.** Ninguna operación sensible carece de registro inmutable (caja negra).

---

## 2. Clasificación de la Información

| Nivel | Descripción | Ejemplos en el proyecto | Tratamiento |
| --- | --- | --- | --- |
| **Confidencial-Crítico** | Requiere el máximo nivel de protección. | Claves (`AUTH_SECRET`, `AUTH_GOOGLE_ID/SECRET`, `.env`), datos de configuración de infraestructura, credenciales. | Cifradas y nunca versionadas. Acceso solo quien lo necesite. |
| **Confidencial** | Dato de negocio y propiedad intelectual. | Specs (`TemoFlow.md`, `DESIGN.md`), código fuente, esquema de datos, datos mock, métricas internas. | Restringido al dominio corporativo. Prohibido fuera de él. |
| **Interno** | Información operativa no sensible. | Nombres de fases (públicos dentro de la empresa), referencias internas. | Uso interno con criterio. |
| **Dato personal (PII/PHI)** | Datos de personas físicas; referencia a salud = categoría especial (RGPD Art. 9). | Nombres y correos personales del equipo (incluidas personas colaboradoras externas) en la tabla `users`, descripciones de iniciativas que referencian a usuarios o pacientes. | Minimización, cifrado en tránsito, no volcado a logs. |

Regla práctica: **si cabe duda, trátalo como Confidencial**.

---

## 3. Autenticación (Auth)

### 3.1 Mecanismo
- Único mecanismo admitido en producción: **inicio de sesión con Google** (OAuth 2.0 / OpenID Connect) mediante NextAuth (Auth.js) v5.
- En el servidor se usa SIEMPRE `auth()`. **Prohibido** `getSession()` en Server Components (el Data Cache puede devolver la sesión de otro usuario).
- Las rutas de auth (`app/api/auth/[...nextauth]/route.ts`) declaran `export const dynamic = 'force-dynamic'`.
- El `proxy.ts` protege todas las rutas privadas y redirige a sesiones no autenticadas.

### 3.2 Lista de acceso (allowlist estricta)

> **Revisión de 21/09/2026.** La anterior restricción de dominio `@temotiva.com` queda sin efecto: el equipo son personas colaboradoras externas que trabajan con cuentas de Google propias. El dominio del correo deja de autorizar nada; autoriza **estar en la lista y estar activo**.

- La tabla `users` **es** la lista de acceso. No existe registro automático: alguien de Dirección da de alta cada persona con su correo exacto, su departamento y su rol.
- En el callback `signIn` se busca el correo autenticado en `users`. Si no existe o tiene `is_active = false`, el acceso se **deniega** (fail-closed). Si existe, se inyectan `id`, `department` y `role` en el token.
- El token se **rehidrata desde `users` en cada petición**: una baja o un cambio de rol surten efecto de inmediato, sin esperar a que caduque la sesión. Si el perfil desaparece o se desactiva, la sesión se invalida.
- Las Server Actions y los Server Components vuelven a comprobar la lista por su cuenta (`getSessionContext`), no solo `proxy.ts`.
- Solo `EXECUTIVE` administra la lista (altas, bajas, rol y departamento), desde la vista `/team`, y cada cambio queda auditado (`ACCESS_GRANTED`, `ACCESS_UPDATED`, `ACCESS_REVOKED`).

### 3.3 Acceso de desarrollo

- Existe un proveedor de credenciales **exclusivo de desarrollo** que permite entrar como un perfil de la semilla sin Google.
- Solo se registra si `NODE_ENV === 'development'` **y** `ALLOW_DEV_AUTH === 'true'`. En producción no se construye jamás, esté como esté la variable.
- Aun así pasa por la misma lista de acceso: solo entran perfiles existentes y activos.
- **Prohibido** habilitarlo en cualquier entorno accesible por red, y prohibido ampliarlo (no se añaden selectores de rol, usuarios "logueados" por defecto ni saltos de la allowlist).

### 3.4 Sesión y no-repudio
- La sesión hidrata, desde `users`: `userId`, `email`, `department`, `role`.
- Las mutaciones críticas extraen el `user_id` **de la sesión criptográficamente validada**, nunca de parámetros del cliente. Esto garantiza el no-repudio de firmas y excepciones.

---

## 4. Autorización (RBAC)

### 4.1 Roles
- `MEMBER` (técnico/especialista), `LEAD` (responsable de área), `EXECUTIVE` (CTO/CEO/Dirección).
- Matriz de permisos completa en `DESIGN.md` §8.2.

### 4.2 Reglas de autorización
1. Toda capacidad sensible (avanzar fase, override, reasignación, resolución, archivado) se valida en el **servidor** (Server Action + servicio de dominio).
2. El override exige rol `LEAD` (solo su área) o `EXECUTIVE` (total) verificado por `auth()`.
3. La reasignación de propietario exige ser `LEAD` del departamento actual o destino, o `EXECUTIVE`, con motivo obligatorio.
4. El control de acceso dinámico (a nivel de FASE y de DEPARTAMENTO) se aplica tanto a la lectura como a la mutación.
5. Sesiones stub en tests: solo para verificar reglas puras; **prohibido** usarlas como mecanismo de login en la aplicación.

---

## 5. Protección de Datos y Privacidad

### 5.1 Contexto normativo
- Reglamento Europeo RGPD (UE) 2016/679 y normativa nacional aplicable (LOPDGDD en España).
- Por ser empresa del sector salud: **categorías especiales de datos (RGPD Art. 9)** — datos relativos a la salud mental. El sistema debe tratar solo referencias (IDs, estados) y evitar almacenar datos clínicos directos.
- Tratamiento justificado por fines de gestión interna; debe constar en el registro de actividades de tratamiento y con evaluación de impacto si aplica.

### 5.2 Principios de minimización
- La aplicación **no almacena** expedientes clínicos, notas de paciente ni datos biométricos.
- Las descripciones de iniciativas no deben contener datos personales de pacientes innecesarios; se usan identificadores cuando sea posible.
- Los strings mostrados/logueados no deben volcar PII/PHI: prohibido loggear nombres de pacientes, correos ajenos o contenido clínico.

### 5.3 Ciclo de vida del dato
- **Reducción:** no se piden datos personales que no se necesiten.
- **Retención:** definida por Dirección/DPO; el archivado (soft-delete) oculta del tablero pero conserva metadatos y audit log.
- **Supresión:** si existieran datos personales sujetos a derecho de supresión, se gestionan por procedimiento documentado sin romper la inmutabilidad del audit log (anónimizar referencias).
- **Seguridad en tránsito:** HTTPS obligatorio en cualquier entorno accesible por red (desarrollo incluido si no es solo localhost).

---

## 6. Auditoría y Caja Negra (Integridad del Log)

- `activity_log` es **append-only e inmutable**: no existen UPDATE ni DELETE. El código no expone operaciones de reescritura o borrado.
- Cada evento registra `user_id` de la sesión validada + timestamp + valores old/new (JSON) + metadata.
- Eventos críticos (`EXCEPTION_OVERRIDE`) incluyen `reason`, `risk_accepted`, `authorized_by` y recogen `IP` y `User-Agent` del contexto HTTP en `override_metadata`.
- El log se expone en la pestaña Trazabilidad en orden cronológico inverso; la UI solo lee.
- Cualquier intento de mutar el log (incluso por mantenimiento) debe pasar por procedimiento de excepción aprobado por EXECUTIVE y quedar igualmente registrado.

---

## 7. Gestión de Secretos

- Los secretos viven **solo en variables de entorno**, nunca en el código fuente.
- `.env`, `.env.local`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` y archivos de configuración que los contengan deben estar en `.gitignore`. **Prohibido comitearlos.**
- No loggear, imprimir ni mostrar secretos en consolas de desarrollo, tests o errores internos.
- No incluir secretos en datos mock, seeds ni documentación.
- Rotación de `AUTH_SECRET` y credenciales OAuth de Google con periodicidad definida por Dirección, y siempre tras un incidente o posible fuga.
- Mantener actualizados los paquetes de auth ante advisories de seguridad (mínimo `next-auth@5.0.0-beta.32`; ver advisories del proyecto Auth.js).

---

## 8. Desarrollo Seguro (SDLC)

1. **Revisión de código:** todo cambio sensible (auth, RBAC, override, log, acciones de mutación) es revisado antes de integrarse, con ojo específico a las invariantes de `AGENTS.md` §5.
2. **Validación de entradas:** todo formulario se valida con `zod` en la Server Action antes de llegar al servicio de dominio (longitudes, enums, formatos, dominios).
3. **Dependencias:** se auditan (`npm audit`) en ciclos regulares; no se introducen dependencias innecesarias; se registran en `package-lock.json`.
4. **Pruebas de seguridad en CI/local:** tests de reglas de negocio (Vitest) cubren: compuerta 100%, override (rol, longitud, marcador CONFIRMAR EXCEPCION), bloqueo/desbloqueo automático, no-ping-pong, SLE neto, prioridad obligatoria, archivado soft-delete.
5. **No secretos en código/logs/errores:** los mensajes de error no exponen trazabilidad interna ni datos de sesión.
6. **Registro de actividad:** cada mutación del sistema genera su evento correspondiente; no existen mutaciones "mudas".
7. **Nada de auth simulada:** prohibido cualquier atajo de sesión más allá del proveedor de desarrollo descrito en §3.3 (que exige `NODE_ENV=development`, `ALLOW_DEV_AUTH=true` y perfil activo en la lista de acceso). Ningún selector de rol, ningún usuario "logueado" por defecto, ninguna sesión sin pasar por la allowlist.

---

## 9. Propiedad Intelectual y Uso de Herramientas de IA

1. **Soberanía del código:** agentes de IA y desarrolladores generan código en **nombre de Temotiva**; la IP resultante pertenece a Temotiva sin excepción.
2. **No filtrado:** **prohibido** pegar, publicar o compartir contenido de este repositorio (total o parcial) en servicios públicos, foros, repositorios externos, prompts compartidos o cualquier canal fuera del dominio corporativo, incluso de forma anónima o "desnaturalizada".
3. **Herramientas externas:** solo se pueden usar herramientas de IA o SaaS previamente aprobadas por Dirección, con acuerdos de confidencialidad y tratamiento adecuados. No se suben specs ni datos reales a herramientas no aprobadas.
4. **Datos de demostración:** las demos usan **datos mock ficticios** (los del seed), nunca datos reales de pacientes ni empleados.
5. **Marca y confidencialidad:** no se revelan a terceros la existencia, funcionalidades o métricas del sistema sin autorización de Dirección.

---

## 10. Gestión de Incidentes

| Fase | Acción |
| --- | --- |
| **Detección** | Reportar cualquier sospecha (acceso no autorizado, filtración, brecha, comportamiento anómalo del log, fuga de secretos, hallazgo de dependencia vulnerable). |
| **Reporte inmediato** | Notificar a **CTO/EXECUTIVE** y al **DPO** en el menor tiempo posible. No "arreglar en silencio". |
| **Contención** | Revocar accesos/sesiones comprometidas, rotar secretos, aislar el entorno afectado. |
| **Análisis (forense)** | Usar la caja negra (`activity_log`, `override_metadata` con IP/User-Agent) como fuente de la reconstrucción. |
| **Notificación legal** | Si existen datos personales/PHI: evaluar notificación a la autoridad de control en el plazo del RGPD (72 h) y comunicación a afectados. |
| **Recuperación y mejora** | Acción correctiva + revisión post-incidente + actualización de esta política y de los tests. |

Severidad: SEV1 (exposición de datos personales/salud o de secretos), SEV2 (acceso no autorizado sin datos), SEV3 (indisponibilidad o degradación menor). SEV1/SEV2 escalan a EXECUTIVE inmediatamente.

---

## 11. Entornos y Despliegue

- **V1 (actual):** entorno local/demostrativo. Sin exponer la app en redes públicas; si se publica en cualquier host (nube o local), debe ir por HTTPS y con la autenticación real activa.
- **Reglas de entorno:** ningún entorno sin inicio de sesión real, sin lista de acceso y sin `activity_log`. Si un entorno no puede cumplirlas, queda **prohibido** poblarlo con datos reales.
- **A futuro (V2):** despliegue gestionado (p. ej. Vercel) con variables de entorno cifradas, logs de plataforma sin PII y acceso administrativo restringido.

---

## 12. Responsabilidades por Rol

| Rol | Responsabilidad |
| --- | --- |
| **MEMBER** | Usar el sistema según su permiso, no intentar omitir controles, reportar sospechas. |
| **LEAD** | Supervisar la correcta aplicación de compuertas y overrides en su área; validar reasignaciones. |
| **EXECUTIVE** | Aprobar overrides totales y excepciones de política; decidir retención/rotación de secretos; respuesta de SEV1/SEV2. |
| **DPO** | Supervisión de privacidad, evaluación de impacto, contacto con autoridad de control. |
| **Desarrolladores y agentes de IA** | Cumplir esta política, no filtrar IP, no comitear secretos, no romper invariantes de negocio, mantener el log inmutable. |

---

## 13. Lista de Verificación de Cumplimiento (Checklist)

- [ ] Inicio de sesión con Google activo; lista de acceso (`users`) al día y bloqueado todo correo que no esté en ella o esté de baja.
- [ ] `ALLOW_DEV_AUTH` sin definir o en `false` en cualquier entorno que no sea el portátil de desarrollo.
- [ ] `auth()` en servidor; sin `getSession()` en Server Components; rutas auth `force-dynamic`.
- [ ] Mutaciones críticas validadas por rol/departamento en el servidor.
- [ ] Override registrado con `EXCEPTION_OVERRIDE`, IP/User-Agent, motivo y riesgo; botón bloqueado hasta `CONFIRMAR EXCEPCION`.
- [ ] Checklist 100% exigida para `Avanzar Fase` sin pasividad de UI.
- [ ] `activity_log` append-only; sin operaciones de update/delete.
- [ ] Sin secretos versionados; `.env*` en `.gitignore`.
- [ ] Zod en todas las entradas de Server Actions.
- [ ] `npm audit` sin hallazgos críticos; paquetes de auth con fix de seguridad.
- [ ] Datos mock ficticios; sin PII/PHI real en demos, logs ni seeds.
- [ ] Tests de invariantes (Vitest) en verde antes de integrar.
- [ ] Política de retención y supresión definida por DPO.
- [ ] Procedimiento de incidentes conocido por el equipo (reporte a CTO/DPO, plazos).

---

## 14. Referencias Cruzadas

| Documento | Uso |
| --- | --- |
| `DESIGN.md` | Arquitectura, stack, capas, RBAC, modelo de datos. |
| `AGENTS.md` | Instrucciones y líneas rojas para agentes y desarrolladores. |
| `TemoFlow.md` | Reglas de negocio y esquema relacional (Bloque 4). |

**Vigencia:** revisión obligatoria ante cambios de arquitectura, normativa o tras incidentes. Este documento es parte del repositorio y de su propiedad intelectual; no se distribuye fuera del dominio corporativo.