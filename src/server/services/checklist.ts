import { randomUUID } from 'node:crypto';
import type { Department } from '@/domain/enums';
import type { ChecklistValue, SessionContext, StageChecklistItem } from '@/domain/types';
import { DEPARTMENT_LABELS } from '@/domain/labels';
import type { DataStore } from '@/server/repositories/types';
import { audit } from './audit';
import { loadInitiative } from './blocking';
import { invalid, invalidState, notFound } from './errors';
import { assertPermission, canConfigureChecklistItem, canToggleChecklistItem } from './rbac';

/**
 * Compuerta interactiva: marcar y desmarcar items, y configurar la plantilla de
 * items por fase (capacidad de LEAD sobre su área / EXECUTIVE).
 */

export interface ToggleChecklistInput {
  initiativeId: string;
  checklistItemId: string;
  isCompleted: boolean;
  now?: Date;
}

export async function setChecklistItemState(
  store: DataStore,
  session: SessionContext,
  input: ToggleChecklistInput,
): Promise<ChecklistValue> {
  const now = input.now ?? new Date();
  const initiative = await loadInitiative(store, input.initiativeId);
  if (initiative.isArchived) throw invalidState('La iniciativa está archivada.');

  const item = await store.checklistItemById(input.checklistItemId);
  if (!item) throw notFound('El requisito de la compuerta no existe.');
  if (item.stageId !== initiative.currentStageId) {
    throw invalid('Solo se pueden marcar los requisitos de la fase actual.');
  }

  assertPermission(
    canToggleChecklistItem(session, item),
    `Este requisito lo marca ${DEPARTMENT_LABELS[item.responsibleDepartment]}.`,
  );

  const value: ChecklistValue = {
    initiativeId: initiative.id,
    checklistId: item.id,
    isCompleted: input.isCompleted,
    completedBy: input.isCompleted ? session.userId : null,
    completedAt: input.isCompleted ? now.toISOString() : null,
  };

  await store.upsertChecklistValue(value);
  await store.updateInitiative(initiative.id, { updatedAt: now.toISOString() });

  await audit(store, {
    initiativeId: initiative.id,
    session,
    actionType: 'CHECKLIST_UPDATED',
    fieldName: 'is_completed',
    oldValue: { checklistId: item.id, isCompleted: !input.isCompleted },
    newValue: { checklistId: item.id, isCompleted: input.isCompleted, label: item.label },
    at: now,
  });

  return value;
}

export interface CreateChecklistItemInput {
  stageId: number;
  label: string;
  description?: string;
  responsibleDepartment: Department;
  isMandatory?: boolean;
}

/** Alta de un requisito configurable de la compuerta de una fase. */
export async function createChecklistItem(
  store: DataStore,
  session: SessionContext,
  input: CreateChecklistItemInput,
): Promise<StageChecklistItem> {
  assertPermission(
    canConfigureChecklistItem(session, input.responsibleDepartment),
    'Solo un responsable de área puede configurar los requisitos de su departamento.',
  );

  const stage = await store.stageById(input.stageId);
  if (!stage) throw notFound('La fase indicada no existe.');

  const label = input.label.trim();
  if (label.length < 6) throw invalid('El requisito necesita un enunciado de al menos 6 caracteres.');

  const siblings = await store.listChecklistItems(input.stageId);
  const item: StageChecklistItem = {
    id: randomUUID(),
    stageId: input.stageId,
    label,
    description: input.description?.trim() || null,
    orderIndex: siblings.length + 1,
    isMandatory: input.isMandatory ?? true,
    responsibleDepartment: input.responsibleDepartment,
    createdAt: new Date().toISOString(),
  };

  await store.insertChecklistItem(item);
  return item;
}

/** Baja de un requisito configurable. No toca el historial ya registrado. */
export async function deleteChecklistItem(
  store: DataStore,
  session: SessionContext,
  checklistItemId: string,
): Promise<void> {
  const item = await store.checklistItemById(checklistItemId);
  if (!item) throw notFound('El requisito de la compuerta no existe.');

  assertPermission(
    canConfigureChecklistItem(session, item.responsibleDepartment),
    'Solo un responsable de área puede retirar los requisitos de su departamento.',
  );

  await store.deleteChecklistItem(checklistItemId);
}
