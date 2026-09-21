import type { ChecklistValue, Initiative, StageChecklistItem, WorkflowStage } from '@/domain/types';
import type { DataStore } from '@/server/repositories/types';
import { notFound } from './errors';

/**
 * Compuerta de salida (TemoFlow.md §1.3, DESIGN.md §7.2).
 *
 * `Avanzar Fase` solo se ejecuta con los items obligatorios de la fase actual
 * al 100 %. Cuando falta algo, el sistema nunca devuelve un error pasivo:
 * devuelve la lista de pendientes con su departamento responsable para que la
 * interfaz ofrezca "Solicitar a Departamento Responsable" en un clic.
 */

export interface GateItemState {
  item: StageChecklistItem;
  isCompleted: boolean;
  completedBy: string | null;
  completedAt: string | null;
}

export interface GateEvaluation {
  stage: WorkflowStage;
  items: GateItemState[];
  /** Items obligatorios pendientes: lo que bloquea el avance. */
  pending: StageChecklistItem[];
  completedCount: number;
  mandatoryCount: number;
  isComplete: boolean;
}

export async function evaluateGate(store: DataStore, initiative: Initiative): Promise<GateEvaluation> {
  const stage = await store.stageById(initiative.currentStageId);
  if (!stage) throw notFound('La fase actual de la iniciativa no existe.');

  const [items, values] = await Promise.all([
    store.listChecklistItems(stage.id),
    store.listChecklistValues(initiative.id),
  ]);

  const valueByChecklistId = new Map<string, ChecklistValue>(values.map((value) => [value.checklistId, value]));

  const states: GateItemState[] = items.map((item) => {
    const value = valueByChecklistId.get(item.id);
    return {
      item,
      isCompleted: value?.isCompleted ?? false,
      completedBy: value?.completedBy ?? null,
      completedAt: value?.completedAt ?? null,
    };
  });

  const mandatory = states.filter((state) => state.item.isMandatory);
  const pending = mandatory.filter((state) => !state.isCompleted).map((state) => state.item);

  return {
    stage,
    items: states,
    pending,
    completedCount: mandatory.length - pending.length,
    mandatoryCount: mandatory.length,
    isComplete: pending.length === 0,
  };
}
