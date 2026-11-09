import 'server-only';
import { sendNotification, WebPushError } from 'web-push';
import { isKnownPushEndpoint, type PushSubscriptionRecord } from '@/domain/push';
import type { PushDeliveryResult, PushSender } from '@/server/services/push';

/**
 * Emisor real de notificaciones push con `web-push` (spec 002 §10).
 *
 * El payload va cifrado de extremo a extremo (RFC 8291); `web-push` lo hace por
 * defecto. Las claves VAPID se pasan en cada envío, sin estado global.
 * `VAPID_PRIVATE_KEY` es un secreto: no sale de aquí ni va a logs.
 */
export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  /** `mailto:` o `https:` de contacto que exigen los servicios push. */
  subject: string;
}

type SendFn = typeof sendNotification;

/** Un día: si el dispositivo está apagado más tiempo, el aviso ya no tiene sentido. */
const TTL_SECONDS = 24 * 60 * 60;

export function readVapidConfig(): VapidConfig | null {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

/** `null` sin claves: la app funciona igual, simplemente sin push (CA-11). */
export function getPushSender(): PushSender | null {
  const config = readVapidConfig();
  return config ? createWebPushSender(config) : null;
}

export function createWebPushSender(config: VapidConfig, send: SendFn = sendNotification): PushSender {
  return {
    async send(sub: PushSubscriptionRecord, payload: string): Promise<PushDeliveryResult> {
      // Defensa en profundidad: filas guardadas antes de la lista blanca no reciben ningún POST.
      if (!isKnownPushEndpoint(sub.endpoint)) return 'gone';
      try {
        await send({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, {
          TTL: TTL_SECONDS,
          urgency: 'normal',
          vapidDetails: { subject: config.subject, publicKey: config.publicKey, privateKey: config.privateKey },
        });
        return 'ok';
      } catch (error) {
        if (error instanceof WebPushError && (error.statusCode === 404 || error.statusCode === 410)) return 'gone';
        // Solo el código: el mensaje y el cuerpo pueden incluir el endpoint.
        const status = error instanceof WebPushError ? `HTTP ${error.statusCode}` : 'sin respuesta';
        console.error(`[push] El servicio push rechazó un aviso (${status}).`);
        return 'error';
      }
    },
  };
}
