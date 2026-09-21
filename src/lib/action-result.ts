/**
 * Contrato de resultado de las Server Actions, en un módulo neutro para que lo
 * puedan importar tanto el servidor como los formularios del cliente.
 */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; message: string; code?: string };
