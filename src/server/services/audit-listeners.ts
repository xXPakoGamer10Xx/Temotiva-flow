import type { ActivityLogEntry } from '@/domain/types';
import type { DataStore } from '@/server/repositories/types';

/**
 * Oyentes de la caja negra (spec 002 §9).
 *
 * `audit()` avisa aquí de cada entrada ya guardada. Hoy el único oyente es el
 * despachador de notificaciones push, que se registra al arrancar el servidor
 * (`src/instrumentation.ts`). Sin oyentes (tests, scripts) no ocurre nada.
 *
 * Garantías:
 *  - Un oyente nunca puede romper `audit()` ni la acción que lo llamó: los
 *    errores, síncronos o asíncronos, se capturan aquí.
 *  - Los oyentes no deben bloquear: el trabajo lento se programa aparte.
 *  - El error registrado no incluye la entrada (puede llevar PII/PHI).
 *
 * El registro vive en `globalThis` porque en desarrollo el bundler puede cargar
 * este módulo dos veces (instrumentación y rutas): ambas copias deben compartir
 * los mismos oyentes.
 */
export type AuditListener = (store: DataStore, entry: ActivityLogEntry) => void;

const REGISTRY_KEY = Symbol.for('temotiva-flow.audit-listeners');

function registry(): Set<AuditListener> {
  const scope = globalThis as typeof globalThis & { [REGISTRY_KEY]?: Set<AuditListener> };
  scope[REGISTRY_KEY] ??= new Set<AuditListener>();
  return scope[REGISTRY_KEY];
}

/** Registra un oyente y devuelve la función que lo desregistra. */
export function onAuditAppended(listener: AuditListener): () => void {
  registry().add(listener);
  return () => {
    registry().delete(listener);
  };
}

export function emitAuditAppended(store: DataStore, entry: ActivityLogEntry): void {
  for (const listener of registry()) {
    try {
      const result: unknown = listener(store, entry);
      if (result instanceof Promise) result.catch(reportListenerError);
    } catch (error) {
      reportListenerError(error);
    }
  }
}

function reportListenerError(error: unknown): void {
  // Solo el mensaje: ni la entrada ni la pila con valores de la petición.
  const message = error instanceof Error ? error.message : 'error desconocido';
  console.error(`[audit-listeners] Un oyente de la caja negra falló: ${message}`);
}
