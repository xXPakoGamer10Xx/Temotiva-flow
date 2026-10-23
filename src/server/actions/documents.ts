'use server';

import { z } from 'zod';
import { DEPARTMENTS, DOCUMENT_SHARE_TARGETS } from '@/domain/enums';
import { removeDocument, shareDocument, unshareDocument } from '@/server/services/documents';
import { type ActionResult, runAction } from './shared';

const shareSchema = z.object({
  documentId: z.string().uuid('Documento no válido.'),
  targetType: z.enum(DOCUMENT_SHARE_TARGETS, { message: 'Elige con quién compartir el documento.' }),
  targetUserId: z.string().uuid().optional(),
  targetDepartment: z.enum(DEPARTMENTS).optional(),
});

export async function shareDocumentAction(input: unknown): Promise<ActionResult<undefined>> {
  return runAction({
    schema: shareSchema,
    input,
    handler: async ({ store, session, input: data }) => {
      await shareDocument(store, session, data);
      return undefined;
    },
  });
}

export async function unshareDocumentAction(input: unknown): Promise<ActionResult<undefined>> {
  return runAction({
    schema: z.object({ shareId: z.string().uuid('Acceso no válido.') }),
    input,
    handler: async ({ store, session, input: data }) => {
      await unshareDocument(store, session, data);
      return undefined;
    },
  });
}

export async function removeDocumentAction(input: unknown): Promise<ActionResult<undefined>> {
  return runAction({
    schema: z.object({ documentId: z.string().uuid('Documento no válido.') }),
    input,
    handler: async ({ store, session, input: data }) => {
      await removeDocument(store, session, data);
      return undefined;
    },
  });
}
