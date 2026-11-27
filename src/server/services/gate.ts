import type { Department } from '@/domain/enums';
import type { ChecklistValue, Initiative, StageChecklistItem, StageSignoff, WorkflowStage } from '@/domain/types';
import { DEPARTMENT_LABELS } from '@/domain/labels';
import { isSignoffSatisfied, signoffId, signoffsFor, type SignoffRequirementKind } from '@/domain/signoffs';
import type { DataStore } from '@/server/repositories/types';
import { notFound } from './errors';

/**
 * Compuerta de salida (TemoFlow.md §1.3, DESIGN.md §7.2, spec 005 §5.3).
 *
 * `Avanzar Fase` solo se ejecuta con **todas las aprobaciones de área** de la
 * fase actual registradas y con su requisito extra cumplido (nota, «Sin
 * observaciones» o talla T-shirt). Cuando falta algo, el sistema nunca devuelve
 * un error pasivo: devuelve los pendientes con su departamento para que la
 * interfaz ofrezca "Solicitar a Departamento Responsable" en un clic.
 *
 * Los requisitos configurables de `stage_checklists` siguen visibles y
 * marcables como **guía no bloqueante** (decisión P-3 de la spec 005).
 */

export interface GateItemState {
  item: StageChecklistItem;
  isCompleted: boolean;
  completedBy: string | null;
  completedAt: string | null;
}

/** Aprobación exigida por la matriz y su estado en la iniciativa. */
export interface SignoffState {
  /** `SIGNOFF:<STAGE_KEY>:<DEPARTMENT>`: estable, viaja en pendientes y override. */
  id: string;
  department: Department;
  requirement: SignoffRequirementKind;
  signoff: StageSignoff | null;
  /** Aprobada y con su requisito extra cumplido. */
  isSatisfied: boolean;
}

/** Lo que bloquea el avance, con a quién pedírselo. */
export interface GatePendingItem {
  id: string;
  label: string;
  responsibleDepartment: Department;
}

export interface GateEvaluation {
  stage: WorkflowStage;
  /** Guía no bloqueante: los requisitos configurables de la fase. */
  items: GateItemState[];
  signoffs: SignoffState[];
  /** Aprobaciones pendientes: lo que bloquea el avance. */
  pending: GatePendingItem[];
  completedCount: number;
  mandatoryCount: number;
  isComplete: boolean;
}

/** Rótulo de una aprobación pendiente en el panel y en el override. */
export function signoffPendingLabel(department: Department): string {
  return `Aprobación de ${DEPARTMENT_LABELS[department]}`;
}

export async function evaluateGate(store: DataStore, initiative: Initiative): Promise<GateEvaluation> {
  const stage = await store.stageById(initiative.currentStageId);
  if (!stage) throw notFound('La fase actual de la iniciativa no existe.');

  const [items, values, signoffRows] = await Promise.all([
    store.listChecklistItems(stage.id),
    store.listChecklistValues(initiative.id),
    store.listStageSignoffs(initiative.id),
  ]);

  const valueByChecklistId = new Map<string, ChecklistValue>(values.map((value) => [value.checklistId, value]));
  const guide: GateItemState[] = items.map((item) => {
    const value = valueByChecklistId.get(item.id);
    return {
      item,
      isCompleted: value?.isCompleted ?? false,
      completedBy: value?.completedBy ?? null,
      completedAt: value?.completedAt ?? null,
    };
  });

  const signoffByDepartment = new Map(
    signoffRows.filter((row) => row.stageId === stage.id).map((row) => [row.department, row]),
  );
  const signoffs: SignoffState[] = signoffsFor(stage.key).map(({ department, requirement }) => {
    const signoff = signoffByDepartment.get(department) ?? null;
    return {
      id: signoffId(stage.key, department),
      department,
      requirement,
      signoff,
      isSatisfied: isSignoffSatisfied(requirement, signoff ?? undefined),
    };
  });

  const pending: GatePendingItem[] = signoffs
    .filter((state) => !state.isSatisfied)
    .map((state) => ({
      id: state.id,
      label: signoffPendingLabel(state.department),
      responsibleDepartment: state.department,
    }));

  return {
    stage,
    items: guide,
    signoffs,
    pending,
    completedCount: signoffs.length - pending.length,
    mandatoryCount: signoffs.length,
    isComplete: pending.length === 0,
  };
}
