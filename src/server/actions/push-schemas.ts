import { z } from 'zod';
import { isKnownPushEndpoint } from '@/domain/push';

/**
 * Esquemas de entrada de las Server Actions de push (spec 002, constitución §4).
 *
 * Viven fuera del archivo `'use server'` para poder probarlos sin sesión ni
 * Next. La persona dueña del dispositivo sale siempre de la sesión: un
 * `userId` enviado por el cliente se descarta aquí y nunca llega al servicio.
 */

const ENDPOINT_MESSAGE = 'El dispositivo no ha dado una dirección de avisos válida.';
const KEYS_MESSAGE = 'Las claves de cifrado del dispositivo no son válidas.';

const MAX_ENDPOINT = 1000;
const MAX_P256DH = 200;
const MAX_AUTH = 100;
const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/;

const endpointSchema = z
  .string({ message: ENDPOINT_MESSAGE })
  .max(MAX_ENDPOINT, ENDPOINT_MESSAGE)
  .refine(isKnownPushEndpoint, ENDPOINT_MESSAGE);

const keySchema = (max: number) => z.string({ message: KEYS_MESSAGE }).min(1, KEYS_MESSAGE).max(max, KEYS_MESSAGE).regex(BASE64URL, KEYS_MESSAGE);

/** Forma de `PushSubscription.toJSON()`; `expirationTime` y extras se descartan. */
export const subscribePushSchema = z.object(
  {
    endpoint: endpointSchema,
    keys: z.object({ p256dh: keySchema(MAX_P256DH), auth: keySchema(MAX_AUTH) }, { message: KEYS_MESSAGE }),
  },
  { message: ENDPOINT_MESSAGE },
);

export const unsubscribePushSchema = z.object({ endpoint: endpointSchema }, { message: ENDPOINT_MESSAGE });

export type SubscribePushInput = z.infer<typeof subscribePushSchema>;
export type UnsubscribePushInput = z.infer<typeof unsubscribePushSchema>;
