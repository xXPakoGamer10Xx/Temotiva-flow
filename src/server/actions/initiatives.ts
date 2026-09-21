'use server';

import { z } from 'zod';
import { DEPARTMENTS, LINK_KINDS, PRIORITY_LEVELS, PRIORITY_REASONS } from '@/domain/enums';
import { getRequestContext } from '@/lib/session';
import { MIN_ARCHIVE_REASON, MIN_OVERRIDE_REASON, MIN_OVERRIDE_RISK, MIN_REASSIGN_REASON } from '@/domain/rules';
import {
  advanceStage,
  archiveInitiative,
  assignInitiative,
  createInitiative,
  reassignOwner,
  restoreInitiative,
  updateInitiative,
} from '@/server/services/initiatives';
import { type ActionResult, initiativeIdSchema, runAction } from './shared';

const linkSchema = z.object({
  kind: z.enum(LINK_KINDS),
  label: z.string().trim().min(2, 'La etiqueta del enlace es demasiado corta.').max(60),
  url: z.string().trim().url('El enlace debe ser una URL válida.'),
});

const createSchema = z.object({
  title: z.string().trim().min(8, 'El título debe tener al menos 8 caracteres.').max(255),
  description: z.string().trim().max(4000).default(''),
  priority: z.enum(PRIORITY_LEVELS),
  // Motivo de prioridad obligatorio (TemoFlow.md §1.1.A).
  priorityReason: z.enum(PRIORITY_REASONS),
  currentTask: z.string().trim().max(255).optional(),
  links: z.array(linkSchema).max(10).optional(),
});

export async function createInitiativeAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction({
    schema: createSchema,
    input,
    handler: async ({ store, session, input: data }) => {
      const initiative = await createInitiative(store, session, data);
      return { id: initiative.id };
    },
  });
}

const updateSchema = z.object({
  initiativeId: initiativeIdSchema,
  title: z.string().trim().min(8).max(255).optional(),
  description: z.string().trim().max(4000).optional(),
  currentTask: z.string().trim().max(255).nullable().optional(),
  links: z.array(linkSchema).max(10).optional(),
  priority: z.enum(PRIORITY_LEVELS).optional(),
  priorityReason: z.enum(PRIORITY_REASONS).optional(),
});

export async function updateInitiativeAction(input: unknown): Promise<ActionResult<undefined>> {
  return runAction({
    schema: updateSchema,
    input,
    handler: async ({ store, session, input: data }) => {
      await updateInitiative(store, session, data);
      return undefined;
    },
  });
}

const assignSchema = z.object({
  initiativeId: initiativeIdSchema,
  assigneeId: z.string().uuid().nullable(),
});

export async function assignInitiativeAction(input: unknown): Promise<ActionResult<undefined>> {
  return runAction({
    schema: assignSchema,
    input,
    handler: async ({ store, session, input: data }) => {
      await assignInitiative(store, session, data);
      return undefined;
    },
  });
}

const reassignSchema = z.object({
  initiativeId: initiativeIdSchema,
  targetDepartment: z.enum(DEPARTMENTS),
  reason: z
    .string()
    .trim()
    .min(MIN_REASSIGN_REASON, `El motivo debe tener al menos ${MIN_REASSIGN_REASON} caracteres.`)
    .max(1000),
});

export async function reassignOwnerAction(input: unknown): Promise<ActionResult<undefined>> {
  return runAction({
    schema: reassignSchema,
    input,
    handler: async ({ store, session, input: data }) => {
      await reassignOwner(store, session, data);
      return undefined;
    },
  });
}

const advanceSchema = z.object({
  initiativeId: initiativeIdSchema,
  override: z
    .object({
      reason: z
        .string()
        .trim()
        .min(MIN_OVERRIDE_REASON, `El motivo debe tener al menos ${MIN_OVERRIDE_REASON} caracteres.`)
        .max(2000),
      riskAccepted: z
        .string()
        .trim()
        .min(MIN_OVERRIDE_RISK, `El riesgo asumido debe tener al menos ${MIN_OVERRIDE_RISK} caracteres.`)
        .max(2000),
      signature: z.string().trim(),
      acknowledgedPendingIds: z.array(z.string()).min(1),
    })
    .optional(),
});

export interface AdvanceActionResult {
  status: 'ADVANCED' | 'GATE_BLOCKED';
  overridden?: boolean;
  toStageName?: string;
  pending?: { id: string; label: string; responsibleDepartment: string }[];
}

/**
 * Avanzar de fase. Con la compuerta incompleta devuelve `GATE_BLOCKED` con los
 * pendientes para que la interfaz abra el panel de acciones: nunca un error
 * pasivo (TemoFlow.md §1.3).
 */
export async function advanceStageAction(input: unknown): Promise<ActionResult<AdvanceActionResult>> {
  const request = await getRequestContext();

  return runAction({
    schema: advanceSchema,
    input,
    handler: async ({ store, session, input: data }) => {
      const result = await advanceStage(store, session, {
        initiativeId: data.initiativeId,
        override: data.override,
        request,
      });

      if (result.status === 'GATE_BLOCKED') {
        return {
          status: 'GATE_BLOCKED' as const,
          pending: result.gate.pending.map((item) => ({
            id: item.id,
            label: item.label,
            responsibleDepartment: item.responsibleDepartment,
          })),
        };
      }

      return {
        status: 'ADVANCED' as const,
        overridden: result.overridden,
        toStageName: result.toStage.name,
      };
    },
  });
}

const archiveSchema = z.object({
  initiativeId: initiativeIdSchema,
  reason: z
    .string()
    .trim()
    .min(MIN_ARCHIVE_REASON, `Indica el motivo del archivado (mínimo ${MIN_ARCHIVE_REASON} caracteres).`)
    .max(1000),
});

export async function archiveInitiativeAction(input: unknown): Promise<ActionResult<undefined>> {
  return runAction({
    schema: archiveSchema,
    input,
    handler: async ({ store, session, input: data }) => {
      await archiveInitiative(store, session, data);
      return undefined;
    },
  });
}

export async function restoreInitiativeAction(input: unknown): Promise<ActionResult<undefined>> {
  return runAction({
    schema: z.object({ initiativeId: initiativeIdSchema }),
    input,
    handler: async ({ store, session, input: data }) => {
      await restoreInitiative(store, session, data);
      return undefined;
    },
  });
}
