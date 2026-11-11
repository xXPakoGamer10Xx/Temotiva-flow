'use server';

import { z } from 'zod';
import { MAX_SPRINT_CAPACITY, MAX_SPRINT_GOAL, MAX_SPRINT_NAME } from '@/domain/rules';
import { carryOverSprint, createSprint, updateSprint } from '@/server/services/tech-sprint';
import { type ActionResult, runAction } from './shared';

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha no es válida.');

export async function createSprintAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction({
    schema: z.object({
      name: z.string().trim().max(MAX_SPRINT_NAME).optional(),
      goal: z.string().trim().max(MAX_SPRINT_GOAL).optional(),
      startDate: dateKey,
      endDate: dateKey,
      capacityHours: z.number().min(0).max(MAX_SPRINT_CAPACITY).optional(),
    }),
    input,
    handler: async ({ store, session, input: data }) => ({ id: (await createSprint(store, session, data)).id }),
  });
}

export async function updateSprintAction(input: unknown): Promise<ActionResult<{ shiftedTasks: number }>> {
  return runAction({
    schema: z.object({
      sprintId: z.string().min(1),
      name: z.string().trim().max(MAX_SPRINT_NAME).optional(),
      goal: z.string().trim().max(MAX_SPRINT_GOAL).optional(),
      startDate: dateKey.optional(),
      endDate: dateKey.optional(),
      capacityHours: z.number().min(0).max(MAX_SPRINT_CAPACITY).optional(),
      shiftDueDates: z.boolean().optional(),
    }),
    input,
    handler: async ({ store, session, input: data }) => ({
      shiftedTasks: (await updateSprint(store, session, data)).shiftedTasks,
    }),
  });
}

export async function carryOverSprintAction(input: unknown): Promise<ActionResult<{ moved: number }>> {
  return runAction({
    schema: z.object({ fromSprintId: z.string().min(1), toSprintId: z.string().min(1) }),
    input,
    handler: async ({ store, session, input: data }) => carryOverSprint(store, session, data),
  });
}
