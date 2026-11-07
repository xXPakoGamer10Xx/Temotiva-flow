'use server';

import {
  createDepartmentRequest,
  resolveDepartmentRequest,
  startDepartmentRequest,
} from '@/server/services/department-requests';
import {
  createDepartmentRequestSchema,
  resolveDepartmentRequestSchema,
  startDepartmentRequestSchema,
} from './department-requests-schemas';
import { type ActionResult, runAction } from './shared';

/**
 * Buzón de Dependencias (spec 001). Cada acción resuelve la sesión con
 * `auth()`, valida con Zod y delega: los permisos y las reglas viven en el
 * servicio, con la sesión ya validada.
 */

export async function createDepartmentRequestAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction({
    schema: createDepartmentRequestSchema,
    input,
    handler: async ({ store, session, input: data }) => ({
      id: (await createDepartmentRequest(store, session, data)).id,
    }),
  });
}

export async function startDepartmentRequestAction(input: unknown): Promise<ActionResult<undefined>> {
  return runAction({
    schema: startDepartmentRequestSchema,
    input,
    handler: async ({ store, session, input: data }) => {
      await startDepartmentRequest(store, session, data);
      return undefined;
    },
  });
}

export async function resolveDepartmentRequestAction(input: unknown): Promise<ActionResult<undefined>> {
  return runAction({
    schema: resolveDepartmentRequestSchema,
    input,
    handler: async ({ store, session, input: data }) => {
      await resolveDepartmentRequest(store, session, data);
      return undefined;
    },
  });
}
