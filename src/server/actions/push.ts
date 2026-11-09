'use server';

import { headers } from 'next/headers';
import { z } from 'zod';
import { getPushSender } from '@/server/push/web-push-sender';
import { invalidState } from '@/server/services/errors';
import { sendTestPush, subscribeDevice, unsubscribeDevice } from '@/server/services/push';
import { subscribePushSchema, unsubscribePushSchema } from './push-schemas';
import { type ActionResult, runAction } from './shared';

/**
 * Avisos push en este dispositivo (spec 002, RF-06 a RF-10). Cada acción
 * resuelve la sesión con `auth()`, valida con Zod y delega. El dispositivo
 * siempre queda ligado a la persona de la sesión, nunca a un id del cliente.
 * Ninguna cambia vistas, así que no revalidan.
 */

export async function subscribePushAction(input: unknown): Promise<ActionResult<undefined>> {
  // El user-agent lo pone el servidor desde la cabecera, no el cliente.
  const userAgent = (await headers()).get('user-agent');
  return runAction({
    schema: subscribePushSchema,
    input,
    revalidate: false,
    handler: async ({ store, session, input: data }) => {
      await subscribeDevice(store, session, {
        endpoint: data.endpoint,
        p256dh: data.keys.p256dh,
        auth: data.keys.auth,
        userAgent,
      });
      return undefined;
    },
  });
}

export async function unsubscribePushAction(input: unknown): Promise<ActionResult<undefined>> {
  return runAction({
    schema: unsubscribePushSchema,
    input,
    revalidate: false,
    handler: async ({ store, session, input: data }) => {
      await unsubscribeDevice(store, session, { endpoint: data.endpoint });
      return undefined;
    },
  });
}

/** Devuelve cuántos dispositivos recibieron el aviso de prueba. */
export async function sendTestPushAction(): Promise<ActionResult<{ sent: number }>> {
  return runAction({
    schema: z.undefined(),
    input: undefined,
    revalidate: false,
    handler: async ({ store, session }) => {
      const sender = getPushSender();
      if (!sender) throw invalidState('Los avisos no están disponibles en este entorno.');
      const report = await sendTestPush(store, sender, session, new Date());
      if (report.sent === 0 && report.failed > 0) {
        throw invalidState('El servicio de avisos no ha respondido. Inténtalo de nuevo en unos minutos.');
      }
      if (report.sent === 0) {
        throw invalidState('No hay ningún dispositivo con avisos activos. Actívalos primero en este dispositivo.');
      }
      return { sent: report.sent };
    },
  });
}
