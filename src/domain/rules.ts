/**
 * Umbrales de las reglas de negocio, en un módulo sin dependencias de servidor
 * para que los puedan leer tanto los servicios de dominio como los formularios
 * del cliente (y así el texto de ayuda y la validación nunca se desincronizan).
 */

/** Texto exacto que hay que teclear para firmar un avance excepcional. */
export const OVERRIDE_SIGNATURE = 'CONFIRMAR EXCEPCION';

/** Longitudes mínimas exigidas por TemoFlow.md §2.2 y DESIGN.md §7.3. */
export const MIN_OVERRIDE_REASON = 30;
export const MIN_OVERRIDE_RISK = 30;

export const MIN_REASSIGN_REASON = 15;
export const MIN_ARCHIVE_REASON = 10;
/** Marcar una fase como "No aplica" pesa como un avance excepcional: mismo mínimo. */
export const MIN_STAGE_SKIP_REASON = 30;
export const MIN_DEPENDENCY_DESCRIPTION = 15;
export const MIN_RESOLUTION_NOTES = 5;
export const MIN_INITIATIVE_TITLE = 8;
export const MIN_BLOCK_DESCRIPTION = 10;

/** Umbral de riesgo del reloj de SLE: 75 % del objetivo consumido. */
export const AT_RISK_RATIO = 0.75;

/** Biblioteca de documentos. */
export const MAX_DOCUMENT_DESCRIPTION = 300;

/** Enlaces a documentos externos (Google Docs, Drive...). */
export const MIN_LINK_TITLE = 3;
export const MAX_LINK_TITLE = 120;
export const MAX_LINK_URL = 500;
/** Solo se aceptan enlaces https a estos hosts. */
export const ALLOWED_LINK_HOSTS = ['docs.google.com', 'drive.google.com', 'sheets.google.com', 'slides.google.com'] as const;

/** Tareas de área. */
export const MIN_TASK_TITLE = 3;
export const MAX_TASK_TITLE = 120;
export const MAX_TASK_DESCRIPTION = 500;
/** Horas estimadas de una tarea: de media en media hora, hasta una semana larga. */
export const MAX_TASK_HOURS = 80;
export const MAX_SPRINT_NAME = 60;
export const MAX_SPRINT_GOAL = 300;
/** Un sprint no se alarga más de cuatro semanas. */
export const MAX_SPRINT_DAYS = 28;
/** Cadencia por defecto del sprint de Tech: de miércoles a miércoles. */
export const SPRINT_START_WEEKDAY = 3;
export const SPRINT_DEFAULT_DAYS = 7;
/** Horas por persona y sprint que se proponen por defecto; el PM las ajusta. */
export const SPRINT_DEFAULT_CAPACITY = 30;
export const MAX_SPRINT_CAPACITY = 120;
/** Prefijo de las claves de tarea de Tech que se citan en ramas y PR (TEC-12). */
export const TECH_TASK_PREFIX = 'TEC';

/** Peticiones entre áreas (spec 001 — Dependencias). */
export const MIN_DEPARTMENT_REQUEST_TITLE = 8;
export const MAX_DEPARTMENT_REQUEST_TITLE = 120;
export const MIN_DEPARTMENT_REQUEST_DESCRIPTION = 15;
export const MIN_DEPARTMENT_REQUEST_RESOLUTION_NOTES = 5;
/** El buzón devuelve todas las abiertas, pero solo las N cerradas más recientes de cada fuente (spec §10). */
export const MAX_CLOSED_INBOX_ITEMS = 100;
/** Adjuntos y enlaces de una petición, por lado (petición / respuesta). Ampliación A. */
export const MAX_REQUEST_FILES_PER_SIDE = 5;
export const MAX_REQUEST_LINKS_PER_SIDE = 5;
export const MAX_REQUEST_FILE_BYTES = 4 * 1024 * 1024;
export const MIN_REQUEST_LINK_LABEL = 2;
export const MAX_REQUEST_LINK_LABEL = 60;
export const MAX_REQUEST_LINK_URL = 500;

/** Pasos propios (privados) de una persona en una iniciativa. */
export const MIN_PERSONAL_STEP_TITLE = 2;
export const MAX_PERSONAL_STEP_TITLE = 80;
export const MAX_PERSONAL_STEPS_PER_INITIATIVE = 20;

/** Imágenes de apoyo en un feedback (capturas, fotos). */
export const MAX_FEEDBACK_IMAGES = 3;
export const MAX_FEEDBACK_IMAGE_BYTES = 4 * 1024 * 1024;

/** Longitud del texto de feedback del equipo. */
export const MIN_FEEDBACK_MESSAGE = 10;
export const MAX_FEEDBACK_MESSAGE = 2000;
