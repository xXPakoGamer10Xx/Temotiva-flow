import { randomUUID } from 'node:crypto';
import type { CustomCheck, Initiative, SessionContext, WorkflowStage } from '@/domain/types';
import {
  MAX_CUSTOM_CHECK_LABEL,
  MAX_CUSTOM_CHECK_NOTE,
  MAX_CUSTOM_CHECKS_PER_STAGE,
  MIN_CUSTOM_CHECK_LABEL,
} from '@/domain/rules';
import type { DataStore } from '@/server/repositories/types';
import { audit } from './audit';
import { assertInitiativeOpen, loadInitiative } from './blocking';
import { invalid, notFound } from './errors';
import { assertPermission, canManageCustomCheck } from './rbac';

/**
 * Casillas adicionales de una fase (spec 005 §5.6): checks opcionales que un
 * área añade a una iniciativa concreta, con una nota corta. Nunca bloquean la
 * compuerta y solo se tocan en la fase actual.
 */

const FORBIDDEN_MESSAGE = 'Solo el área propietaria, las áreas que aprueban esta fase o Dirección gestionan sus casillas.';

async function currentStageOf(store: DataStore, initiative: Initiative): Promise<WorkflowStage> {
  const stage = await store.stageById(initiative.currentStageId);
  if (!stage) throw notFound('La fase actual de la iniciativa no existe.');
  return stage;
}

export async function addCustomCheck(
  store: DataStore,
  session: SessionContext,
  input: { initiativeId: string; label: string; note?: string | null; now?: Date },
): Promise<CustomCheck> {
  const now = input.now ?? new Date();
  const initiative = await loadInitiative(store, input.initiativeId);
  assertInitiativeOpen(initiative);
  const stage = await currentStageOf(store, initiative);
  assertPermission(canManageCustomCheck(session, initiative, stage.key), FORBIDDEN_MESSAGE);

  const label = input.label.trim();
  if (label.length < MIN_CUSTOM_CHECK_LABEL || label.length > MAX_CUSTOM_CHECK_LABEL) {
    throw invalid(`La casilla necesita un enunciado de ${MIN_CUSTOM_CHECK_LABEL} a ${MAX_CUSTOM_CHECK_LABEL} caracteres.`);
  }
  const note = input.note?.trim() || null;
  if (note && note.length > MAX_CUSTOM_CHECK_NOTE) {
    throw invalid(`La nota de la casilla admite como máximo ${MAX_CUSTOM_CHECK_NOTE} caracteres.`);
  }

  const live = (await store.listCustomChecks(initiative.id)).filter(
    (check) => check.stageId === stage.id && !check.isRemoved,
  );
  if (live.length >= MAX_CUSTOM_CHECKS_PER_STAGE) {
    throw invalid(`Una fase admite como máximo ${MAX_CUSTOM_CHECKS_PER_STAGE} casillas adicionales.`);
  }

  const check: CustomCheck = {
    id: randomUUID(),
    initiativeId: initiative.id,
    stageId: stage.id,
    label,
    note,
    isCompleted: false,
    completedBy: null,
    completedAt: null,
    createdBy: session.userId,
    createdAt: now.toISOString(),
    isRemoved: false,
    removedBy: null,
    removedAt: null,
  };
  await store.insertCustomCheck(check);
  await audit(store, {
    initiativeId: initiative.id,
    session,
    actionType: 'CUSTOM_CHECK_ADDED',
    fromStageId: stage.id,
    fieldName: 'custom_check',
    newValue: { checkId: check.id, stageKey: stage.key, label, hasNote: note !== null },
    at: now,
  });
  return check;
}

/** Carga la casilla y comprueba que se puede tocar: viva, de la fase actual y con permiso. */
async function loadEditableCheck(
  store: DataStore,
  session: SessionContext,
  checkId: string,
): Promise<{ check: CustomCheck; initiative: Initiative; stage: WorkflowStage }> {
  const check = await store.customCheckById(checkId);
  if (!check || check.isRemoved) throw notFound('La casilla no existe.');
  const initiative = await loadInitiative(store, check.initiativeId);
  assertInitiativeOpen(initiative);
  if (check.stageId !== initiative.currentStageId) {
    throw invalid('Solo se tocan las casillas de la fase actual.');
  }
  const stage = await currentStageOf(store, initiative);
  assertPermission(canManageCustomCheck(session, initiative, stage.key), FORBIDDEN_MESSAGE);
  return { check, initiative, stage };
}

export async function setCustomCheckState(
  store: DataStore,
  session: SessionContext,
  input: { checkId: string; isCompleted: boolean; now?: Date },
): Promise<CustomCheck> {
  const now = input.now ?? new Date();
  const { check, initiative, stage } = await loadEditableCheck(store, session, input.checkId);
  if (check.isCompleted === input.isCompleted) return check;

  const updated = await store.updateCustomCheck(check.id, {
    isCompleted: input.isCompleted,
    completedBy: input.isCompleted ? session.userId : null,
    completedAt: input.isCompleted ? now.toISOString() : null,
  });
  await audit(store, {
    initiativeId: initiative.id,
    session,
    actionType: 'CUSTOM_CHECK_UPDATED',
    fromStageId: stage.id,
    fieldName: 'is_completed',
    oldValue: { checkId: check.id, isCompleted: check.isCompleted },
    newValue: { checkId: check.id, isCompleted: input.isCompleted, label: check.label },
    at: now,
  });
  return updated;
}

/** Baja lógica: la fila y su rastro se conservan (AGENTS.md §5.8). */
export async function removeCustomCheck(
  store: DataStore,
  session: SessionContext,
  input: { checkId: string; now?: Date },
): Promise<CustomCheck> {
  const now = input.now ?? new Date();
  const { check, initiative, stage } = await loadEditableCheck(store, session, input.checkId);

  const updated = await store.updateCustomCheck(check.id, {
    isRemoved: true,
    removedBy: session.userId,
    removedAt: now.toISOString(),
  });
  await audit(store, {
    initiativeId: initiative.id,
    session,
    actionType: 'CUSTOM_CHECK_REMOVED',
    fromStageId: stage.id,
    fieldName: 'is_removed',
    oldValue: { checkId: check.id, isRemoved: false },
    newValue: { checkId: check.id, isRemoved: true, label: check.label },
    at: now,
  });
  return updated;
}
