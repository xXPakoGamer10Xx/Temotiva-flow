/**
 * Dominio de la PWA y las notificaciones push (spec 002).
 *
 * Espejo de `db/08-push-subscriptions.sql`. Recibir push lo decide cada persona
 * activando sus dispositivos: no depende de las preferencias de equipo (spec
 * 002 §7, decisión D1).
 */

/** Tabla `push_subscriptions`: un navegador/dispositivo con avisos activados. */
export interface PushSubscriptionRecord {
  id: string;
  userId: string;
  /** URL del servicio push del navegador. Identifica el dispositivo: nunca va a logs. */
  endpoint: string;
  p256dh: string;
  auth: string;
  /** Solo para mostrar «Chrome en Android»; truncado a 200 caracteres. */
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  /** Baja lógica: desactivado por la persona, caducado (404/410) o perfil revocado. */
  revokedAt: string | null;
}

/** Tabla `sle_risk_notices`: el aviso de SLE en riesgo ya se envió para esta fase. */
export interface SleRiskNotice {
  initiativeId: string;
  stageId: number;
  notifiedAt: string;
}

/** Tipos de aviso, uno por evento E1–E11 del catálogo (spec 002 §6), en orden. */
export const PUSH_EVENT_KINDS = [
  'TASK_ASSIGNED',
  'INITIATIVE_ASSIGNED',
  'DEPENDENCY_INCOMING',
  'REQUEST_INCOMING',
  'DEPENDENCY_RESOLVED',
  'REQUEST_RESOLVED',
  'ENTERED_BOARD',
  'INITIATIVE_CREATED',
  'OVERRIDE',
  'BLOCKED',
  'SLE_AT_RISK',
] as const;
export type PushEventKind = (typeof PUSH_EVENT_KINDS)[number];

/** Aviso de prueba que la persona se manda a sí misma (RF-10). No es un evento. */
export const PUSH_TEST_KIND = 'TEST';
export type PushMessageKind = PushEventKind | typeof PUSH_TEST_KIND;

/**
 * Lo que viaja al dispositivo. Contenido mínimo (spec 002 §10): tipo de aviso,
 * área y `TEMO-XXX`; nunca títulos, descripciones ni nombres de personas.
 */
export interface PushMessage {
  kind: PushMessageKind;
  title: string;
  body: string;
  /** Ruta relativa del mismo origen que se abre al tocar el aviso. */
  url: string;
  /** `${kind}:${entityId}`: el sistema sustituye avisos del mismo objeto en vez de apilarlos. */
  tag: string;
}

/**
 * Servicios push de los navegadores, los únicos a los que el servidor envía.
 *
 * El `endpoint` lo manda el cliente y el servidor le hace POST: sin esta lista
 * cualquier sesión podría apuntar el envío a un host interno (SSRF). Cubre
 * Chrome, Edge, Brave, Opera y Samsung (FCM), Firefox, Safari/iOS y el WNS de
 * Windows. Un navegador nuevo exige añadir su host aquí, a propósito.
 */
const PUSH_SERVICE_EXACT_HOSTS = new Set([
  'fcm.googleapis.com',
  'android.googleapis.com',
  'updates.push.services.mozilla.com',
]);
const PUSH_SERVICE_HOST_SUFFIXES = ['.push.apple.com', '.notify.windows.com'];

export function isKnownPushEndpoint(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  // Puerto por defecto, sin credenciales, y host por nombre: ni IP ni `localhost` pasan la lista.
  if (url.protocol !== 'https:' || url.username || url.password || url.port !== '') return false;
  const host = url.hostname.toLowerCase();
  return PUSH_SERVICE_EXACT_HOSTS.has(host) || PUSH_SERVICE_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix) && host.length > suffix.length);
}
