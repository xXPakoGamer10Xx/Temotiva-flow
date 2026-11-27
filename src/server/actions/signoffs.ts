'use server';

import { addCustomCheck, removeCustomCheck, setCustomCheckState } from '@/server/services/custom-checks';
import { setStageSignoff } from '@/server/services/signoffs';
import { type ActionResult, runAction } from './shared';
import {
  addCustomCheckSchema,
  removeCustomCheckSchema,
  setCustomCheckStateSchema,
  setStageSignoffSchema,
} from './signoff-schemas';

/**
 * Aprobaciones por área y casillas adicionales de la compuerta (spec 005).
 * La identidad de quien aprueba o marca sale de la sesión, nunca de la entrada.
 */

export async function setStageSignoffAction(input: unknown): Promise<ActionResult<undefined>> {
  return runAction({
    schema: setStageSignoffSchema,
    input,
    handler: async ({ store, session, input: data }) => {
      await setStageSignoff(store, session, data);
      return undefined;
    },
  });
}

export async function addCustomCheckAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction({
    schema: addCustomCheckSchema,
    input,
    handler: async ({ store, session, input: data }) => {
      const check = await addCustomCheck(store, session, data);
      return { id: check.id };
    },
  });
}

export async function setCustomCheckStateAction(input: unknown): Promise<ActionResult<undefined>> {
  return runAction({
    schema: setCustomCheckStateSchema,
    input,
    handler: async ({ store, session, input: data }) => {
      await setCustomCheckState(store, session, data);
      return undefined;
    },
  });
}

export async function removeCustomCheckAction(input: unknown): Promise<ActionResult<undefined>> {
  return runAction({
    schema: removeCustomCheckSchema,
    input,
    handler: async ({ store, session, input: data }) => {
      await removeCustomCheck(store, session, data);
      return undefined;
    },
  });
}
