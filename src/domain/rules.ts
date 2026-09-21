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
export const MIN_DEPENDENCY_DESCRIPTION = 15;
export const MIN_RESOLUTION_NOTES = 5;
export const MIN_INITIATIVE_TITLE = 8;
export const MIN_BLOCK_DESCRIPTION = 10;

/** Umbral de riesgo del reloj de SLE: 75 % del objetivo consumido. */
export const AT_RISK_RATIO = 0.75;
