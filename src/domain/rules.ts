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
