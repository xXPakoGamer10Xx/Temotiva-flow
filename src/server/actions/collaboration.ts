'use server';

import { z } from 'zod';
import { DEPARTMENTS, HELP_TYPES_V1, STOP_REASONS } from '@/domain/enums';
import { MIN_BLOCK_DESCRIPTION, MIN_DEPENDENCY_DESCRIPTION, MIN_RESOLUTION_NOTES } from '@/domain/rules';
import { clearManualStop, setManualStop } from '@/server/services/blocking';
import { setChecklistItemState } from '@/server/services/checklist';
import { createDependency, rejectDependency, resolveDependency } from '@/server/services/dependencies';
import { type ActionResult, initiativeIdSchema, runAction } from './shared';

/**
 * Acciones de colaboración: solicitudes de ayuda 🆘, estado de parada y
 * marcado de la compuerta de salida.
 */

const createDependencySchema = z.object({
  initiativeId: initiativeIdSchema,
  targetDepartment: z.enum(DEPARTMENTS),
  helpType: z.enum(HELP_TYPES_V1),
  description: z
    .string()
    .trim()
    .min(MIN_DEPENDENCY_DESCRIPTION, `Describe la petición con al menos ${MIN_DEPENDENCY_DESCRIPTION} caracteres.`)
    .max(2000),
  isBlocking: z.boolean(),
  stopReason: z.enum(STOP_REASONS).optional(),
  checklistItemId: z.string().optional(),
});

export async function createDependencyAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction({
    schema: createDependencySchema,
    input,
    handler: async ({ store, session, input: data }) => {
      const { dependency } = await createDependency(store, session, data);
      return { id: dependency.id };
    },
  });
}

const closeDependencySchema = z.object({
  dependencyId: z.string().min(1),
  resolutionNotes: z
    .string()
    .trim()
    .min(MIN_RESOLUTION_NOTES, `Escribe una respuesta de al menos ${MIN_RESOLUTION_NOTES} caracteres.`)
    .max(2000),
});

export async function resolveDependencyAction(input: unknown): Promise<ActionResult<undefined>> {
  return runAction({
    schema: closeDependencySchema,
    input,
    handler: async ({ store, session, input: data }) => {
      await resolveDependency(store, session, data);
      return undefined;
    },
  });
}

export async function rejectDependencyAction(input: unknown): Promise<ActionResult<undefined>> {
  return runAction({
    schema: closeDependencySchema,
    input,
    handler: async ({ store, session, input: data }) => {
      await rejectDependency(store, session, data);
      return undefined;
    },
  });
}

const setManualStopSchema = z.object({
  initiativeId: initiativeIdSchema,
  stopReason: z.enum(STOP_REASONS),
  description: z
    .string()
    .trim()
    .min(MIN_BLOCK_DESCRIPTION, `Explica la parada con al menos ${MIN_BLOCK_DESCRIPTION} caracteres.`)
    .max(1000),
});

export async function setBlockedAction(input: unknown): Promise<ActionResult<undefined>> {
  return runAction({
    schema: setManualStopSchema,
    input,
    handler: async ({ store, session, input: data }) => {
      await setManualStop(store, session, data);
      return undefined;
    },
  });
}

export async function clearBlockedAction(input: unknown): Promise<ActionResult<undefined>> {
  return runAction({
    schema: z.object({
      initiativeId: initiativeIdSchema,
      note: z.string().trim().max(1000).optional(),
    }),
    input,
    handler: async ({ store, session, input: data }) => {
      await clearManualStop(store, session, data);
      return undefined;
    },
  });
}

const toggleChecklistSchema = z.object({
  initiativeId: initiativeIdSchema,
  checklistItemId: z.string().min(1),
  isCompleted: z.boolean(),
});

export async function toggleChecklistItemAction(input: unknown): Promise<ActionResult<undefined>> {
  return runAction({
    schema: toggleChecklistSchema,
    input,
    handler: async ({ store, session, input: data }) => {
      await setChecklistItemState(store, session, data);
      return undefined;
    },
  });
}
