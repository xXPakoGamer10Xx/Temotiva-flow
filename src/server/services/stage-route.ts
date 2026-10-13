import type { Initiative, SessionContext, WorkflowStage } from '@/domain/types';
import { DEPARTMENT_LABELS } from '@/domain/labels';
import { MIN_STAGE_SKIP_REASON } from '@/domain/rules';
import type { DataStore } from '@/server/repositories/types';
import { audit } from './audit';
import { loadInitiative } from './blocking';
import { forbidden, invalid, invalidState, notFound } from './errors';
import { canSkipStage } from './rbac';

/**
 * Ruta de fases (AGENTS.md §5.9). Las 7 fases siguen siendo cerradas y
 * secuenciales, pero una fase **futura** que no aplica a una iniciativa se puede
 * marcar "No aplica": el avance la salta. No es un atajo de la compuerta:
 *
 * - la fase actual nunca se omite (sale por compuerta u override);
 * - Ideación y Producción (inicio y hito final) nunca se omiten;
 * - solo lo decide el LEAD del área dueña de esa fase, o Dirección;
 * - exige motivo y deja `STAGE_SKIPPED` / `STAGE_RESTORED` en la caja negra.
 */

/** Siguiente fase activa por orden que no esté marcada "No aplica". */
export function nextApplicableStage(
  stages: WorkflowStage[],
  from: WorkflowStage,
  skippedStageIds: number[],
): WorkflowStage | null {
  return (
    stages
      .filter((stage) => stage.orderIndex > from.orderIndex && stage.isActive && !skippedStageIds.includes(stage.id))
      .sort((a, b) => a.orderIndex - b.orderIndex)[0] ?? null
  );
}

/** Fases que se saltarían al avanzar desde `from` hasta `to`. */
export function stagesSkippedBetween(stages: WorkflowStage[], from: WorkflowStage, to: WorkflowStage): WorkflowStage[] {
  return stages
    .filter((stage) => stage.orderIndex > from.orderIndex && stage.orderIndex < to.orderIndex)
    .sort((a, b) => a.orderIndex - b.orderIndex);
}

/** ¿Puede omitirse esta fase por su posición? (con independencia de quién lo pida) */
export function isSkippablePosition(stages: WorkflowStage[], stage: WorkflowStage, current: WorkflowStage): boolean {
  const orders = stages.map((candidate) => candidate.orderIndex);
  const first = Math.min(...orders);
  const last = Math.max(...orders);
  return stage.orderIndex > current.orderIndex && stage.orderIndex !== first && stage.orderIndex !== last;
}

/**
 * Valida que `session` puede marcar `stage` como "No aplica" en una iniciativa
 * que está en `current`. Lanza el error de dominio con el texto para la UI.
 */
export function assertCanSkip(
  session: SessionContext,
  stages: WorkflowStage[],
  stage: WorkflowStage,
  current: WorkflowStage,
): void {
  if (!isSkippablePosition(stages, stage, current)) {
    throw invalid(
      stage.orderIndex <= current.orderIndex
        ? `${stage.name} ya no es una fase futura: la actual sale por compuerta o avance excepcional.`
        : `${stage.name} no se puede omitir: el inicio y el hito final forman parte de toda ruta.`,
    );
  }
  if (!canSkipStage(session, stage)) {
    throw forbidden(
      `${stage.name} solo la puede marcar como No aplica ${DEPARTMENT_LABELS[stage.defaultOwnerDepartment]} (responsable) o Dirección.`,
    );
  }
}

export function assertSkipReason(reason: string): string {
  const trimmed = reason.trim();
  if (trimmed.length < MIN_STAGE_SKIP_REASON) {
    throw invalid(`Explica por qué no aplica (mínimo ${MIN_STAGE_SKIP_REASON} caracteres).`);
  }
  return trimmed;
}

interface RouteChangeInput {
  initiativeId: string;
  stageId: number;
  reason: string;
  now?: Date;
}

async function loadRouteContext(
  store: DataStore,
  input: RouteChangeInput,
): Promise<{ initiative: Initiative; stages: WorkflowStage[]; stage: WorkflowStage; current: WorkflowStage }> {
  const initiative = await loadInitiative(store, input.initiativeId);
  if (initiative.isArchived) throw invalidState('La iniciativa está archivada.');
  const stages = await store.listStages();
  const stage = stages.find((candidate) => candidate.id === input.stageId);
  const current = stages.find((candidate) => candidate.id === initiative.currentStageId);
  if (!stage || !current) throw notFound('La fase indicada no existe.');
  return { initiative, stages, stage, current };
}

/** Marca una fase futura como "No aplica". */
export async function skipStage(store: DataStore, session: SessionContext, input: RouteChangeInput): Promise<Initiative> {
  const now = input.now ?? new Date();
  const { initiative, stages, stage, current } = await loadRouteContext(store, input);
  assertCanSkip(session, stages, stage, current);
  const reason = assertSkipReason(input.reason);
  if (initiative.skippedStageIds.includes(stage.id)) return initiative;

  const updated = await store.updateInitiative(initiative.id, {
    skippedStageIds: [...initiative.skippedStageIds, stage.id].sort((a, b) => a - b),
    updatedAt: now.toISOString(),
  });
  await audit(store, {
    initiativeId: initiative.id,
    session,
    actionType: 'STAGE_SKIPPED',
    fieldName: 'skipped_stage_ids',
    newValue: { stageKey: stage.key, reason },
    at: now,
  });
  return updated;
}

/** Vuelve a incluir en la ruta una fase futura marcada "No aplica". */
export async function restoreStage(
  store: DataStore,
  session: SessionContext,
  input: RouteChangeInput,
): Promise<Initiative> {
  const now = input.now ?? new Date();
  const { initiative, stages, stage, current } = await loadRouteContext(store, input);
  // Mismo ámbito que omitir: quien puede quitar una fase puede devolverla.
  assertCanSkip(session, stages, stage, current);
  const reason = assertSkipReason(input.reason);
  if (!initiative.skippedStageIds.includes(stage.id)) return initiative;

  const updated = await store.updateInitiative(initiative.id, {
    skippedStageIds: initiative.skippedStageIds.filter((id) => id !== stage.id),
    updatedAt: now.toISOString(),
  });
  await audit(store, {
    initiativeId: initiative.id,
    session,
    actionType: 'STAGE_RESTORED',
    fieldName: 'skipped_stage_ids',
    newValue: { stageKey: stage.key, reason },
    at: now,
  });
  return updated;
}
