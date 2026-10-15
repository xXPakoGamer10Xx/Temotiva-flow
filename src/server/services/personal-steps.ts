import { randomUUID } from 'node:crypto';
import type { PersonalStep, SessionContext } from '@/domain/types';
import {
  MAX_PERSONAL_STEPS_PER_INITIATIVE,
  MAX_PERSONAL_STEP_TITLE,
  MIN_PERSONAL_STEP_TITLE,
} from '@/domain/rules';
import type { DataStore } from '@/server/repositories/types';
import { loadInitiative } from './blocking';
import { invalid, notFound } from './errors';

/**
 * Pasos propios en la ruta de una iniciativa.
 *
 * Son privados: cada operación se acota a `session.userId`, y un paso ajeno se
 * trata como inexistente (no se confirma ni que exista). No tocan la compuerta,
 * el SLE ni el WIP, y por eso tampoco generan eventos en la caja negra, que
 * registra decisiones de negocio y no notas personales.
 */

export interface PersonalStepView {
  id: string;
  afterStageId: number;
  title: string;
  isDone: boolean;
}

const toView = (step: PersonalStep): PersonalStepView => ({
  id: step.id,
  afterStageId: step.afterStageId,
  title: step.title,
  isDone: step.isDone,
});

export async function listMyPersonalSteps(
  store: DataStore,
  session: SessionContext,
  initiativeId: string,
): Promise<PersonalStepView[]> {
  return (await store.listPersonalSteps(initiativeId, session.userId)).map(toView);
}

export async function addPersonalStep(
  store: DataStore,
  session: SessionContext,
  input: { initiativeId: string; afterStageId: number; title: string; now?: Date },
): Promise<PersonalStepView> {
  await loadInitiative(store, input.initiativeId);
  const title = input.title.trim();
  if (title.length < MIN_PERSONAL_STEP_TITLE) throw invalid('Ponle un nombre al paso.');
  if (title.length > MAX_PERSONAL_STEP_TITLE) {
    throw invalid(`El nombre del paso no puede superar ${MAX_PERSONAL_STEP_TITLE} caracteres.`);
  }
  if (!(await store.stageById(input.afterStageId))) throw invalid('La fase indicada no existe.');

  const existing = await store.listPersonalSteps(input.initiativeId, session.userId);
  if (existing.length >= MAX_PERSONAL_STEPS_PER_INITIATIVE) {
    throw invalid(`Máximo ${MAX_PERSONAL_STEPS_PER_INITIATIVE} pasos propios por iniciativa.`);
  }

  const step = await store.insertPersonalStep({
    id: randomUUID(),
    initiativeId: input.initiativeId,
    userId: session.userId,
    title,
    afterStageId: input.afterStageId,
    isDone: false,
    createdAt: (input.now ?? new Date()).toISOString(),
  });
  return toView(step);
}

async function ownedStep(store: DataStore, session: SessionContext, stepId: string): Promise<PersonalStep> {
  const step = await store.personalStepById(stepId);
  // Un paso de otra persona es, a todos los efectos, uno que no existe.
  if (!step || step.userId !== session.userId) throw notFound('El paso indicado no existe.');
  return step;
}

export async function setPersonalStepDone(
  store: DataStore,
  session: SessionContext,
  input: { stepId: string; isDone: boolean },
): Promise<PersonalStepView> {
  const step = await ownedStep(store, session, input.stepId);
  return toView(await store.setPersonalStepDone(step.id, input.isDone));
}

export async function removePersonalStep(
  store: DataStore,
  session: SessionContext,
  input: { stepId: string },
): Promise<void> {
  const step = await ownedStep(store, session, input.stepId);
  await store.deletePersonalStep(step.id);
}
