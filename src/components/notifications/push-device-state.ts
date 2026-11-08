/**
 * Lógica pura de la tarjeta «Avisos en este dispositivo» (spec 002 RF-05, RF-06).
 * Sin navegador: el componente reúne el entorno y aquí se decide qué mostrar.
 */
export type PushCardState = 'unsupported' | 'ios-install' | 'unavailable' | 'blocked' | 'inactive' | 'active';

export interface PushEnvironment {
  /** Hay `serviceWorker`, `PushManager` y `Notification`. */
  supported: boolean;
  isIos: boolean;
  /** La app se está usando instalada. */
  standalone: boolean;
  /** El servidor tiene clave pública VAPID. */
  hasKey: boolean;
  permission: NotificationPermission;
  /** Este navegador ya tiene una suscripción push. */
  subscribed: boolean;
}

export function pushCardState(env: PushEnvironment): PushCardState {
  // iOS solo admite push en la app instalada (iOS 16.4+).
  if (env.isIos && !env.standalone) return 'ios-install';
  if (!env.supported) return 'unsupported';
  if (!env.hasKey) return 'unavailable';
  if (env.permission === 'denied') return 'blocked';
  return env.subscribed && env.permission === 'granted' ? 'active' : 'inactive';
}

/** La clave VAPID llega en base64url sin relleno; `pushManager.subscribe` la quiere en bytes. */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = `${base64}${'='.repeat((4 - (base64.length % 4)) % 4)}`.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

/** «Chrome en Android»: lo justo para reconocer el dispositivo. */
export function describeDevice(userAgent: string): string {
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /Firefox\/|FxiOS\//.test(userAgent)
      ? 'Firefox'
      : /Chrome\/|CriOS\//.test(userAgent)
        ? 'Chrome'
        : /Safari\//.test(userAgent)
          ? 'Safari'
          : null;
  const system = /iPhone/.test(userAgent)
    ? 'iPhone'
    : /iPad/.test(userAgent)
      ? 'iPad'
      : /Android/.test(userAgent)
        ? 'Android'
        : /Windows/.test(userAgent)
          ? 'Windows'
          : /Mac OS X|Macintosh/.test(userAgent)
            ? 'Mac'
            : /Linux/.test(userAgent)
              ? 'Linux'
              : null;
  if (!browser || !system) return 'este navegador';
  return `${browser} en ${system}`;
}
