# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Personas de todos los departamentos de Temotiva (Producto, Psicología, Legal/DPO, Diseño, Tech, QA, Ciberseguridad, RRHH, Finanzas, Marketing), muchas de ellas colaboradoras externas y no técnicas, sin formación previa en kanban. La abren varias veces al día para saber qué les toca, pedir ayuda a otro departamento o desbloquear a alguien. Dirección la revisa cada semana para ver dónde se atasca el flujo. Se usa sobre todo en portátil y tablet; en el móvil, para consultar.

## Product Purpose
Sistema interno que da trazabilidad y coordina las iniciativas interdepartamentales (`TEMO-XXX`) a través de 7 fases secuenciales cerradas, con dependencias entre departamentos, paradas, checklist de salida obligatoria, avance excepcional auditable y un registro de auditoría inmutable. Éxito: nadie pregunta «¿en qué punto está esto y quién lo espera?»; la respuesta se ve de un vistazo.

## Positioning
Un tablero de flujo con gobernanza estricta: las fases se cierran con compuerta, pedir ayuda no cambia de dueño (no hay ping-pong) y todo evento queda en una caja negra. Ningún tablero kanban genérico impone esto.

## Operating Context
Empresa HealthTech de salud mental y bienestar emocional. Los datos son confidenciales. El acceso es solo por Google contra una lista de acceso (tabla `users`). Roles MEMBER, LEAD y EXECUTIVE; una persona puede llevar varias áreas.

## Capabilities and Constraints
- UI en español, código en inglés. Emoji fijados por la especificación (⛔ 🔗 ⏳ ✅ ⚠️ 🔒 🚨 🆘 🟢 🟡), siempre dentro de una etiqueta y con `aria-hidden`.
- Reglas de negocio invariantes en `AGENTS.md` §5; líneas rojas en §6. Las mutaciones solo van por Server Actions y la UI nunca es la frontera de seguridad.
- Datos en memoria con snapshot; esquema PostgreSQL definido para V2.
- `TemoFlow.md` (especificación funcional) no está en el repositorio; el PDF «Propuesta Operativa» sí.

## Brand Commitments
Marca Temotiva (Brandbook 2026 de la web, `/Users/franciscotapia/Documents/Temotiva/Web`): logo de cerebro en línea con la palabra TEMOTIVA, violeta `#7B5CFF`, fondos lavanda `#F7F6FB`/`#EDE9F4`, tipografía Roboto, esquinas redondeadas y sombras teñidas de violeta, mascota «Cerebrín». Activos copiados a `public/brand/`. El logo solo existe en PNG.

## Evidence on Hand
Logo y mascota en `public/brand/`. Hay 10 iniciativas de ejemplo en el seed. No hay testimonios ni métricas reales: no se inventan.

## Product Principles
1. Salud del proceso, no vigilancia de las personas.
2. Nunca un error pasivo: cada bloqueo ofrece la acción siguiente.
3. Lo que importa se ve de un vistazo; el detalle, a un clic.
4. La interfaz se explica sola, sin manual.
5. La seguridad vive en el servidor.

## Accessibility & Inclusion
WCAG 2.2 AA: contraste, teclado completo, lector de pantalla, objetivos táctiles de 44 px, `prefers-reduced-motion`. Estado nunca solo por color ni por emoji.
