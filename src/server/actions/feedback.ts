'use server';

import { z } from 'zod';
import { FEEDBACK_CATEGORIES, FEEDBACK_STATUSES } from '@/domain/enums';
import { MAX_FEEDBACK_MESSAGE, MIN_FEEDBACK_MESSAGE } from '@/domain/rules';
import { createFeedback, setFeedbackStatus } from '@/server/services/feedback';
import { type ActionResult, runAction } from './shared';

const createSchema = z.object({
  category: z.enum(FEEDBACK_CATEGORIES, { message: 'Elige si es de la app, la web o la plataforma.' }),
  message: z
    .string()
    .trim()
    .min(MIN_FEEDBACK_MESSAGE, `Cuéntanos un poco más (mínimo ${MIN_FEEDBACK_MESSAGE} caracteres).`)
    .max(MAX_FEEDBACK_MESSAGE),
});

export async function createFeedbackAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction({
    schema: createSchema,
    input,
    handler: async ({ store, session, input: data }) => {
      const item = await createFeedback(store, session, data);
      return { id: item.id };
    },
  });
}

const statusSchema = z.object({
  feedbackId: z.string().min(1),
  status: z.enum(FEEDBACK_STATUSES),
});

export async function setFeedbackStatusAction(input: unknown): Promise<ActionResult<undefined>> {
  return runAction({
    schema: statusSchema,
    input,
    handler: async ({ store, session, input: data }) => {
      await setFeedbackStatus(store, session, data);
      return undefined;
    },
  });
}
