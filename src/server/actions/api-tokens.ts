'use server';

import { z } from 'zod';
import { MAX_API_TOKEN_DAYS, createApiToken, revokeApiToken } from '@/server/services/api-tokens';
import { type ActionResult, runAction } from './shared';

const createSchema = z.object({
  name: z.string().trim().min(3, 'Ponle un nombre al token (mínimo 3 caracteres).').max(60),
  days: z.number().int().min(1).max(MAX_API_TOKEN_DAYS),
});

/** El valor del token solo viaja en esta respuesta: no se vuelve a poder consultar. */
export async function createApiTokenAction(input: unknown): Promise<ActionResult<{ token: string }>> {
  return runAction({
    schema: createSchema,
    input,
    handler: async ({ store, session, input: data }) => ({
      token: (await createApiToken(store, session, data)).token,
    }),
  });
}

export async function revokeApiTokenAction(input: unknown): Promise<ActionResult<undefined>> {
  return runAction({
    schema: z.object({ tokenId: z.string().min(1) }),
    input,
    handler: async ({ store, session, input: data }) => {
      await revokeApiToken(store, session, data);
      return undefined;
    },
  });
}
