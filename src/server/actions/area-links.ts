'use server';

import { z } from 'zod';
import { DEPARTMENTS } from '@/domain/enums';
import { MAX_LINK_TITLE, MAX_LINK_URL, MIN_LINK_TITLE } from '@/domain/rules';
import { addAreaLink, removeAreaLink } from '@/server/services/area-links';
import { type ActionResult, runAction } from './shared';

const addSchema = z.object({
  title: z.string().trim().min(MIN_LINK_TITLE, 'Ponle un título al documento.').max(MAX_LINK_TITLE),
  url: z.string().trim().min(1, 'Pega la dirección del documento.').max(MAX_LINK_URL),
  department: z.enum(DEPARTMENTS).optional(),
});

export async function addAreaLinkAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction({
    schema: addSchema,
    input,
    handler: async ({ store, session, input: data }) => ({ id: (await addAreaLink(store, session, data)).id }),
  });
}

export async function removeAreaLinkAction(input: unknown): Promise<ActionResult<undefined>> {
  return runAction({
    schema: z.object({ linkId: z.string().min(1) }),
    input,
    handler: async ({ store, session, input: data }) => {
      await removeAreaLink(store, session, data);
      return undefined;
    },
  });
}
