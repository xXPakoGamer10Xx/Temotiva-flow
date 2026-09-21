'use server';

import { z } from 'zod';
import { DEPARTMENTS, USER_ROLES } from '@/domain/enums';
import { grantAccess, setAccessActive, updateAccess } from '@/server/services/access';
import { audit } from '@/server/services/audit';
import { assertPermission, canConfigureSystem } from '@/server/services/rbac';
import { type ActionResult, runAction } from './shared';

/**
 * Administración del sistema: allowlist de acceso (Dirección) y parámetros de
 * WIP y SLE de las fases (Dirección).
 */

const grantSchema = z.object({
  name: z.string().trim().min(3, 'Indica el nombre completo de la persona.').max(100),
  email: z.string().trim().email('El correo no tiene un formato válido.').max(150),
  department: z.enum(DEPARTMENTS),
  role: z.enum(USER_ROLES),
});

export async function grantAccessAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction({
    schema: grantSchema,
    input,
    handler: async ({ store, session, input: data }) => {
      const user = await grantAccess(store, session, data);
      return { id: user.id };
    },
  });
}

export async function updateAccessAction(input: unknown): Promise<ActionResult<undefined>> {
  return runAction({
    schema: z.object({
      userId: z.string().min(1),
      department: z.enum(DEPARTMENTS).optional(),
      role: z.enum(USER_ROLES).optional(),
    }),
    input,
    handler: async ({ store, session, input: data }) => {
      await updateAccess(store, session, data);
      return undefined;
    },
  });
}

export async function setAccessActiveAction(input: unknown): Promise<ActionResult<undefined>> {
  return runAction({
    schema: z.object({ userId: z.string().min(1), isActive: z.boolean() }),
    input,
    handler: async ({ store, session, input: data }) => {
      await setAccessActive(store, session, data);
      return undefined;
    },
  });
}

const stageSettingsSchema = z.object({
  stageId: z.number().int().positive(),
  sleHours: z.number().int().min(1, 'El SLE debe ser de al menos 1 hora.').max(2000),
  wipLimit: z.number().int().min(1, 'El límite de WIP debe ser de al menos 1.').max(50),
});

/** Solo Dirección puede tocar los tiempos objetivo y los límites de WIP. */
export async function updateStageSettingsAction(input: unknown): Promise<ActionResult<undefined>> {
  return runAction({
    schema: stageSettingsSchema,
    input,
    handler: async ({ store, session, input: data }) => {
      assertPermission(
        canConfigureSystem(session),
        'Solo Dirección puede modificar los límites de WIP y los objetivos de SLE.',
      );

      const stage = await store.stageById(data.stageId);
      if (stage) {
        await store.updateStage(data.stageId, { sleHours: data.sleHours, wipLimit: data.wipLimit });
        await audit(store, {
          initiativeId: null,
          session,
          actionType: 'SYSTEM_SETTINGS_UPDATED',
          fieldName: 'workflow_stages',
          oldValue: { stage: stage.key, sleHours: stage.sleHours, wipLimit: stage.wipLimit },
          newValue: { stage: stage.key, sleHours: data.sleHours, wipLimit: data.wipLimit },
        });
      }

      return undefined;
    },
  });
}
