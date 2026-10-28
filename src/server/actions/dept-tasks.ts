'use server';

import { z } from 'zod';
import { DEPARTMENTS, TASK_STATUSES } from '@/domain/enums';
import { MAX_TASK_DESCRIPTION, MAX_TASK_TITLE, MIN_TASK_TITLE } from '@/domain/rules';
import { assignDeptTask, createDeptTask, moveDeptTask, removeDeptTask } from '@/server/services/dept-tasks';
import { type ActionResult, runAction } from './shared';

const createSchema = z.object({
  title: z.string().trim().min(MIN_TASK_TITLE, 'Ponle un título a la tarea.').max(MAX_TASK_TITLE),
  description: z.string().trim().max(MAX_TASK_DESCRIPTION).optional(),
  department: z.enum(DEPARTMENTS).optional(),
  assigneeId: z.string().min(1).nullish(),
  initiativeId: z.string().min(1).nullish(),
  dueDate: z.string().min(1).nullish(),
});

export async function createDeptTaskAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction({
    schema: createSchema,
    input,
    handler: async ({ store, session, input: data }) => ({ id: (await createDeptTask(store, session, data)).id }),
  });
}

export async function moveDeptTaskAction(input: unknown): Promise<ActionResult<undefined>> {
  return runAction({
    schema: z.object({ taskId: z.string().min(1), status: z.enum(TASK_STATUSES) }),
    input,
    handler: async ({ store, session, input: data }) => {
      await moveDeptTask(store, session, data);
      return undefined;
    },
  });
}

export async function assignDeptTaskAction(input: unknown): Promise<ActionResult<undefined>> {
  return runAction({
    schema: z.object({ taskId: z.string().min(1), assigneeId: z.string().min(1).nullable() }),
    input,
    handler: async ({ store, session, input: data }) => {
      await assignDeptTask(store, session, data);
      return undefined;
    },
  });
}

export async function removeDeptTaskAction(input: unknown): Promise<ActionResult<undefined>> {
  return runAction({
    schema: z.object({ taskId: z.string().min(1) }),
    input,
    handler: async ({ store, session, input: data }) => {
      await removeDeptTask(store, session, data);
      return undefined;
    },
  });
}
