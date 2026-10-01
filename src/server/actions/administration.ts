'use server';

import { z } from 'zod';
import { DEPARTMENTS, USER_ROLES } from '@/domain/enums';
import {
  MIN_PERSON_NAME,
  anonymizeUser,
  grantAccess,
  setAccessActive,
  updateAccess,
  updateOwnProfile,
} from '@/server/services/access';
import { audit } from '@/server/services/audit';
import { assertPermission, canConfigureSystem } from '@/server/services/rbac';
import { notFound } from '@/server/services/errors';
import { type ActionResult, runAction } from './shared';

/**
 * Administración del sistema: personas y accesos (Dirección y responsables,
 * cada uno en su alcance), parámetros de WIP y SLE (Dirección) y la cuenta
 * propia (cualquier rol).
 *
 * Aquí solo se valida la forma de los datos; quién puede hacer qué lo decide el
 * servicio de dominio con la sesión ya verificada.
 */

const nameSchema = z
  .string()
  .trim()
  .min(MIN_PERSON_NAME, 'Indica el nombre completo de la persona.')
  .max(100);

const departmentsSchema = z
  .array(z.enum(DEPARTMENTS))
  .min(1, 'Asigna al menos un área a la persona.')
  .max(DEPARTMENTS.length);

const grantSchema = z.object({
  name: nameSchema,
  email: z.string().trim().email('El correo no tiene un formato válido.').max(150),
  departments: departmentsSchema,
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
      name: nameSchema.optional(),
      departments: departmentsSchema.optional(),
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

/** Derecho de supresión: irreversible y solo para Dirección. */
export async function anonymizeUserAction(input: unknown): Promise<ActionResult<undefined>> {
  return runAction({
    schema: z.object({
      userId: z.string().min(1),
      reason: z.string().trim().min(10, 'Indica el motivo de la anonimización (mínimo 10 caracteres).').max(500),
    }),
    input,
    handler: async ({ store, session, input: data }) => {
      await anonymizeUser(store, session, data);
      return undefined;
    },
  });
}

/** Panel de cuenta: cualquier rol puede corregir su propio nombre visible. */
export async function updateOwnProfileAction(input: unknown): Promise<ActionResult<undefined>> {
  return runAction({
    schema: z.object({ name: nameSchema }),
    input,
    handler: async ({ store, session, input: data }) => {
      await updateOwnProfile(store, session, data);
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
      // Sin este corte, un identificador inválido devolvía "Guardado" sin
      // guardar nada: un no-op silencioso disfrazado de éxito.
      if (!stage) throw notFound('La fase indicada no existe.');

      await store.updateStage(data.stageId, { sleHours: data.sleHours, wipLimit: data.wipLimit });
      await audit(store, {
        initiativeId: null,
        session,
        actionType: 'SYSTEM_SETTINGS_UPDATED',
        fieldName: 'workflow_stages',
        oldValue: { stage: stage.key, sleHours: stage.sleHours, wipLimit: stage.wipLimit },
        newValue: { stage: stage.key, sleHours: data.sleHours, wipLimit: data.wipLimit },
      });

      return undefined;
    },
  });
}
