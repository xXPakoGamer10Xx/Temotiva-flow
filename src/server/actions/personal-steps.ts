'use server';

import { z } from 'zod';
import { MAX_PERSONAL_STEP_TITLE, MIN_PERSONAL_STEP_TITLE } from '@/domain/rules';
import { addPersonalStep, removePersonalStep, setPersonalStepDone } from '@/server/services/personal-steps';
import { type ActionResult, initiativeIdSchema, runAction } from './shared';

const addSchema = z.object({
  initiativeId: initiativeIdSchema,
  afterStageId: z.number().int().positive(),
  title: z
    .string()
    .trim()
    .min(MIN_PERSONAL_STEP_TITLE, 'Ponle un nombre al paso.')
    .max(MAX_PERSONAL_STEP_TITLE),
});

export async function addPersonalStepAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction({
    schema: addSchema,
    input,
    handler: async ({ store, session, input: data }) => ({ id: (await addPersonalStep(store, session, data)).id }),
  });
}

export async function setPersonalStepDoneAction(input: unknown): Promise<ActionResult<undefined>> {
  return runAction({
    schema: z.object({ stepId: z.string().min(1), isDone: z.boolean() }),
    input,
    handler: async ({ store, session, input: data }) => {
      await setPersonalStepDone(store, session, data);
      return undefined;
    },
  });
}

export async function removePersonalStepAction(input: unknown): Promise<ActionResult<undefined>> {
  return runAction({
    schema: z.object({ stepId: z.string().min(1) }),
    input,
    handler: async ({ store, session, input: data }) => {
      await removePersonalStep(store, session, data);
      return undefined;
    },
  });
}
