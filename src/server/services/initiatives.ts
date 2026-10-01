import type { Department, PriorityLevel, PriorityReason } from '@/domain/enums';
import type { JsonValue } from '@/domain/types';
import type {
  Initiative,
  InitiativeLink,
  OverrideMetadata,
  RequestContext,
  SessionContext,
  WorkflowStage,
} from '@/domain/types';
import type { DataStore } from '@/server/repositories/types';
import { audit } from './audit';
import { consolidateBlockedTime, loadInitiative } from './blocking';
import { forbidden, invalid, invalidState, notFound } from './errors';
import { evaluateGate, type GateEvaluation } from './gate';
import {
  assertPermission,
  canAdvanceInitiative,
  canArchiveInitiative,
  canAssignInitiative,
  canChangePriority,
  canOverrideGate,
  canReassignOwner,
} from './rbac';
import { DEPARTMENT_LABELS } from '@/domain/labels';

/**
 * Ciclo de vida de la iniciativa: alta, edición, avance de fase, avance
 * excepcional, reasignación de propiedad y archivado.
 *
 * Todas las mutaciones registran su evento en la caja negra: no existen
 * mutaciones mudas (SEGURIDAD.md §8.6).
 */

import {
  MIN_ARCHIVE_REASON,
  MIN_INITIATIVE_TITLE,
  MIN_OVERRIDE_REASON,
  MIN_OVERRIDE_RISK,
  MIN_REASSIGN_REASON,
  OVERRIDE_SIGNATURE,
} from '@/domain/rules';

export interface CreateInitiativeInput {
  title: string;
  description: string;
  priority: PriorityLevel;
  priorityReason: PriorityReason;
  currentTask?: string | null;
  links?: InitiativeLink[];
  now?: Date;
}

export async function createInitiative(
  store: DataStore,
  session: SessionContext,
  input: CreateInitiativeInput,
): Promise<Initiative> {
  const now = input.now ?? new Date();
  const title = input.title.trim();
  if (title.length < MIN_INITIATIVE_TITLE) throw invalid(`El título debe tener al menos ${MIN_INITIATIVE_TITLE} caracteres.`);

  // Prioridad y motivo son obligatorios por contrato de tipos; se revalida aquí
  // porque el dominio no confía en que la capa de entrada lo haya hecho.
  if (!input.priority || !input.priorityReason) {
    throw invalid('La prioridad y su motivo son obligatorios.');
  }

  const stages = await store.listStages();
  const firstStage = stages.find((stage) => stage.orderIndex === 1);
  if (!firstStage) throw notFound('No hay fase inicial configurada.');

  const initiative: Initiative = {
    id: await store.nextInitiativeId(),
    title,
    description: input.description.trim(),
    priority: input.priority,
    priorityReason: input.priorityReason,
    currentStageId: firstStage.id,
    ownerDepartment: firstStage.defaultOwnerDepartment,
    currentAssigneeId: null,
    createdBy: session.userId,
    isBlocked: false,
    stopReason: null,
    blockedDescription: null,
    manualStopReason: null,
    manualStopDescription: null,
    blockedSince: null,
    blockedStartedAt: null,
    blockedMsInStage: 0,
    currentTask: input.currentTask?.trim() || null,
    links: input.links ?? [],
    isArchived: false,
    stageEnteredAt: now.toISOString(),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  await store.insertInitiative(initiative);
  await audit(store, {
    initiativeId: initiative.id,
    session,
    actionType: 'INITIATIVE_CREATED',
    toStageId: firstStage.id,
    newValue: {
      title: initiative.title,
      priority: initiative.priority,
      priorityReason: initiative.priorityReason,
      ownerDepartment: initiative.ownerDepartment,
    },
    at: now,
  });

  return initiative;
}

export interface UpdateInitiativeInput {
  initiativeId: string;
  title?: string;
  description?: string;
  currentTask?: string | null;
  links?: InitiativeLink[];
  priority?: PriorityLevel;
  priorityReason?: PriorityReason;
  now?: Date;
}

/**
 * Principio de operación continua: los campos descriptivos y los enlaces se
 * pueden editar en cualquier momento, sin compuerta (TemoFlow.md §1.3).
 */
export async function updateInitiative(
  store: DataStore,
  session: SessionContext,
  input: UpdateInitiativeInput,
): Promise<Initiative> {
  const now = input.now ?? new Date();
  const initiative = await loadInitiative(store, input.initiativeId);
  if (initiative.isArchived) throw invalidState('La iniciativa está archivada.');

  if (input.title !== undefined && input.title.trim().length < MIN_INITIATIVE_TITLE) {
    throw invalid(`El título debe tener al menos ${MIN_INITIATIVE_TITLE} caracteres.`);
  }

  // La prioridad ordena el trabajo de otros departamentos: no viaja con el
  // resto de campos descriptivos, que sí son de edición continua (§1.3).
  const touchesPriority =
    (input.priority !== undefined && input.priority !== initiative.priority) ||
    (input.priorityReason !== undefined && input.priorityReason !== initiative.priorityReason);
  if (touchesPriority) {
    assertPermission(
      canChangePriority(session, initiative),
      `La prioridad la decide el responsable de ${DEPARTMENT_LABELS[initiative.ownerDepartment]} o Dirección.`,
    );
  }

  const patch: Partial<Initiative> = { updatedAt: now.toISOString() };
  const changes: Record<string, { from: JsonValue; to: JsonValue }> = {};

  if (input.title !== undefined && input.title.trim() !== initiative.title) {
    patch.title = input.title.trim();
    changes.title = { from: initiative.title, to: patch.title };
  }
  if (input.description !== undefined && input.description.trim() !== initiative.description) {
    patch.description = input.description.trim();
    changes.description = { from: initiative.description, to: patch.description };
  }
  if (input.currentTask !== undefined) {
    const next = input.currentTask?.trim() || null;
    if (next !== initiative.currentTask) {
      patch.currentTask = next;
      changes.currentTask = { from: initiative.currentTask, to: next };
    }
  }
  if (input.links !== undefined) {
    // Se compara por contenido, no por longitud: el log tiene que poder decir
    // qué enlace entró y cuál salió.
    const before = initiative.links.map((link) => link.url);
    const after = input.links.map((link) => link.url);
    const added = after.filter((url) => !before.includes(url));
    const removed = before.filter((url) => !after.includes(url));
    if (added.length > 0 || removed.length > 0) {
      patch.links = input.links;
      changes.links = { from: removed, to: added };
    }
  }
  if (input.priority !== undefined && input.priority !== initiative.priority) {
    patch.priority = input.priority;
    changes.priority = { from: initiative.priority, to: input.priority };
  }
  if (input.priorityReason !== undefined && input.priorityReason !== initiative.priorityReason) {
    patch.priorityReason = input.priorityReason;
    changes.priorityReason = { from: initiative.priorityReason, to: input.priorityReason };
  }

  if (Object.keys(changes).length === 0) return initiative;

  const updated = await store.updateInitiative(initiative.id, patch);
  await audit(store, {
    initiativeId: initiative.id,
    session,
    actionType: 'INITIATIVE_UPDATED',
    fieldName: Object.keys(changes).join(','),
    // Los valores viajan con su tipo original (el log es JSONB): convertirlos a
    // texto dejaba la auditoría sin forma de reconstruir el cambio real.
    oldValue: Object.fromEntries(Object.entries(changes).map(([key, value]) => [key, value.from])),
    newValue: Object.fromEntries(Object.entries(changes).map(([key, value]) => [key, value.to])),
    at: now,
  });

  return updated;
}

/** Asigna la persona responsable dentro del departamento propietario. */
export async function assignInitiative(
  store: DataStore,
  session: SessionContext,
  input: { initiativeId: string; assigneeId: string | null; now?: Date },
): Promise<Initiative> {
  const now = input.now ?? new Date();
  const initiative = await loadInitiative(store, input.initiativeId);
  if (initiative.isArchived) throw invalidState('La iniciativa está archivada.');

  assertPermission(
    canAssignInitiative(session, initiative),
    `Solo ${DEPARTMENT_LABELS[initiative.ownerDepartment]}, que tiene el trabajo, o Dirección pueden asignarla.`,
  );

  if (input.assigneeId) {
    const assignee = await store.userById(input.assigneeId);
    if (!assignee || !assignee.isActive) throw notFound('La persona seleccionada no tiene acceso activo.');
    if (!assignee.departments.includes(initiative.ownerDepartment)) {
      throw invalid('Solo se puede asignar a alguien del departamento propietario de la fase actual.');
    }
  }

  const updated = await store.updateInitiative(initiative.id, {
    currentAssigneeId: input.assigneeId,
    updatedAt: now.toISOString(),
  });

  await audit(store, {
    initiativeId: initiative.id,
    session,
    actionType: 'ASSIGNEE_CHANGED',
    fieldName: 'current_assignee_id',
    oldValue: { assigneeId: initiative.currentAssigneeId },
    newValue: { assigneeId: input.assigneeId },
    at: now,
  });

  return updated;
}

/** Reasignación excepcional de propiedad dentro de la misma fase. */
export async function reassignOwner(
  store: DataStore,
  session: SessionContext,
  input: { initiativeId: string; targetDepartment: Department; reason: string; now?: Date },
): Promise<Initiative> {
  const now = input.now ?? new Date();
  const initiative = await loadInitiative(store, input.initiativeId);
  if (initiative.isArchived) throw invalidState('La iniciativa está archivada.');

  assertPermission(
    canReassignOwner(session, initiative, input.targetDepartment),
    'Solo un responsable de área implicada o Dirección puede reasignar la propiedad.',
  );

  const reason = input.reason.trim();
  if (reason.length < MIN_REASSIGN_REASON) {
    throw invalid(`El motivo de la reasignación debe tener al menos ${MIN_REASSIGN_REASON} caracteres.`);
  }
  if (input.targetDepartment === initiative.ownerDepartment) {
    throw invalid('La iniciativa ya pertenece a ese departamento.');
  }

  const updated = await store.updateInitiative(initiative.id, {
    ownerDepartment: input.targetDepartment,
    currentAssigneeId: null,
    updatedAt: now.toISOString(),
  });

  await audit(store, {
    initiativeId: initiative.id,
    session,
    actionType: 'OWNER_REASSIGNED',
    fieldName: 'owner_department',
    oldValue: { ownerDepartment: initiative.ownerDepartment },
    newValue: { ownerDepartment: input.targetDepartment, reason },
    at: now,
  });

  return updated;
}

export interface OverrideInput {
  reason: string;
  riskAccepted: string;
  signature: string;
  /** Items pendientes que se reconocen explícitamente como incumplidos. */
  acknowledgedPendingIds: string[];
}

export type AdvanceResult =
  | { status: 'ADVANCED'; initiative: Initiative; fromStage: WorkflowStage; toStage: WorkflowStage; overridden: boolean }
  | { status: 'GATE_BLOCKED'; gate: GateEvaluation; nextStage: WorkflowStage };

export interface AdvanceStageInput {
  initiativeId: string;
  override?: OverrideInput;
  request?: RequestContext;
  now?: Date;
}

/**
 * Avanzar de fase (DESIGN.md §7.2 y §7.3).
 *
 * Con la compuerta incompleta y sin override NO lanza error: devuelve
 * `GATE_BLOCKED` con los pendientes para que la interfaz despliegue el panel de
 * acciones. Con override, exige rol, motivo, riesgo y firma literal, y deja el
 * evento `EXCEPTION_OVERRIDE` en la caja negra con IP y User-Agent.
 */
export async function advanceStage(
  store: DataStore,
  session: SessionContext,
  input: AdvanceStageInput,
): Promise<AdvanceResult> {
  const now = input.now ?? new Date();
  const initiative = await loadInitiative(store, input.initiativeId);
  if (initiative.isArchived) throw invalidState('La iniciativa está archivada.');

  // La matriz abre el avance a los tres roles, pero siempre dentro del área que
  // tiene el trabajo: sin esto, cualquiera movería la iniciativa de otro
  // departamento (SEGURIDAD.md §4.2.1).
  assertPermission(
    canAdvanceInitiative(session, initiative),
    `Esta iniciativa la avanza ${DEPARTMENT_LABELS[initiative.ownerDepartment]}, propietaria de la fase, o Dirección.`,
  );

  const stages = await store.listStages();
  const fromStage = stages.find((stage) => stage.id === initiative.currentStageId);
  if (!fromStage) throw notFound('La fase actual de la iniciativa no existe.');

  const toStage = stages.find((stage) => stage.orderIndex === fromStage.orderIndex + 1);
  if (!toStage) throw invalidState('La iniciativa ya está en la última fase del ciclo.');

  const gate = await evaluateGate(store, initiative);

  let overrideMetadata: OverrideMetadata | null = null;

  if (!gate.isComplete) {
    if (!input.override) {
      return { status: 'GATE_BLOCKED', gate, nextStage: toStage };
    }
    // LEAD solo sobre su área, EXECUTIVE sobre todo; se comprueba contra la
    // sesión validada antes de tocar nada.
    assertCanOverride(session, initiative);
    overrideMetadata = buildOverrideMetadata(session, gate, input.override, input.request);
  }

  const elapsedMs = Math.max(0, now.getTime() - new Date(initiative.stageEnteredAt).getTime());
  const blockedMs = Math.min(elapsedMs, consolidateBlockedTime(initiative, now));

  if (overrideMetadata) {
    await audit(store, {
      initiativeId: initiative.id,
      session,
      actionType: 'EXCEPTION_OVERRIDE',
      fromStageId: fromStage.id,
      toStageId: toStage.id,
      fieldName: 'current_stage_id',
      oldValue: { stageKey: fromStage.key },
      newValue: { stageKey: toStage.key },
      overrideMetadata,
      at: now,
    });
  }

  const updated = await store.updateInitiative(initiative.id, {
    currentStageId: toStage.id,
    // La propiedad viaja con la fase y la asignación individual se limpia
    // para que el equipo receptor decida quién la toma (DESIGN.md §7.6).
    ownerDepartment: toStage.defaultOwnerDepartment,
    currentAssigneeId: null,
    stageEnteredAt: now.toISOString(),
    blockedMsInStage: 0,
    // Una parada vigente sobrevive al cambio de fase. El ancla de contabilidad
    // sí se reinicia (cada fase descuenta solo su propio tiempo parado), pero
    // `blockedStartedAt` se conserva para no truncar la duración real de la
    // parada en el radar ni en las métricas.
    blockedSince: initiative.isBlocked ? now.toISOString() : null,
    updatedAt: now.toISOString(),
  });

  await audit(store, {
    initiativeId: initiative.id,
    session,
    actionType: 'STAGE_TRANSITION',
    fromStageId: fromStage.id,
    toStageId: toStage.id,
    fieldName: 'current_stage_id',
    oldValue: { stageKey: fromStage.key },
    newValue: {
      stageKey: toStage.key,
      durationMs: elapsedMs,
      blockedMs,
      netDurationMs: elapsedMs - blockedMs,
      overridden: overrideMetadata !== null,
      ownerDepartment: toStage.defaultOwnerDepartment,
    },
    at: now,
  });

  return {
    status: 'ADVANCED',
    initiative: updated,
    fromStage,
    toStage,
    overridden: overrideMetadata !== null,
  };
}

function buildOverrideMetadata(
  session: SessionContext,
  gate: GateEvaluation,
  override: OverrideInput,
  request?: RequestContext,
): OverrideMetadata {
  // El rol se comprueba contra la sesión validada, nunca contra el formulario.
  if (session.role === 'MEMBER') {
    throw forbidden('El avance excepcional está reservado a responsables de área y Dirección.');
  }

  const reason = override.reason.trim();
  const riskAccepted = override.riskAccepted.trim();

  if (reason.length < MIN_OVERRIDE_REASON) {
    throw invalid(`El motivo de la excepción debe tener al menos ${MIN_OVERRIDE_REASON} caracteres.`);
  }
  if (riskAccepted.length < MIN_OVERRIDE_RISK) {
    throw invalid(`El riesgo asumido debe describirse con al menos ${MIN_OVERRIDE_RISK} caracteres.`);
  }
  if (override.signature.trim().toUpperCase() !== OVERRIDE_SIGNATURE) {
    throw invalid(`Escribe ${OVERRIDE_SIGNATURE} para firmar el avance excepcional.`);
  }

  const pendingIds = gate.pending.map((item) => item.id).sort();
  const acknowledged = [...new Set(override.acknowledgedPendingIds)].sort();
  const sameSet =
    pendingIds.length === acknowledged.length && pendingIds.every((id, index) => id === acknowledged[index]);
  if (!sameSet) {
    throw invalid('Debes reconocer exactamente los requisitos que quedan incumplidos.');
  }

  return {
    reason,
    riskAccepted,
    authorizedBy: session.name,
    authorizedByEmail: session.email,
    authorizedByRole: session.role,
    pendingItems: gate.pending.map((item) => ({
      id: item.id,
      label: item.label,
      responsibleDepartment: item.responsibleDepartment,
    })),
    signature: OVERRIDE_SIGNATURE,
    ip: request?.ip ?? null,
    ipChain: request?.ipChain ?? null,
    userAgent: request?.userAgent ?? null,
  };
}

/** Comprobación de rol para pintar (o no) el botón de avance excepcional. */
export function assertCanOverride(session: SessionContext, initiative: Initiative): void {
  assertPermission(
    canOverrideGate(session, initiative),
    'El avance excepcional está reservado al responsable del área propietaria y a Dirección.',
  );
}

/** Archivado = soft-delete: nada se borra y la caja negra permanece intacta. */
export async function archiveInitiative(
  store: DataStore,
  session: SessionContext,
  input: { initiativeId: string; reason: string; now?: Date },
): Promise<Initiative> {
  const now = input.now ?? new Date();
  const initiative = await loadInitiative(store, input.initiativeId);
  assertPermission(
    canArchiveInitiative(session, initiative),
    'Solo el responsable del área propietaria o Dirección pueden archivar una iniciativa.',
  );
  if (initiative.isArchived) throw invalidState('La iniciativa ya estaba archivada.');

  const reason = input.reason.trim();
  if (reason.length < MIN_ARCHIVE_REASON) {
    throw invalid(`Indica el motivo del archivado (mínimo ${MIN_ARCHIVE_REASON} caracteres).`);
  }

  const updated = await store.updateInitiative(initiative.id, {
    isArchived: true,
    updatedAt: now.toISOString(),
  });

  await audit(store, {
    initiativeId: initiative.id,
    session,
    actionType: 'INITIATIVE_ARCHIVED',
    fieldName: 'is_archived',
    oldValue: { isArchived: false },
    newValue: { isArchived: true, reason },
    at: now,
  });

  return updated;
}

export async function restoreInitiative(
  store: DataStore,
  session: SessionContext,
  input: { initiativeId: string; now?: Date },
): Promise<Initiative> {
  const now = input.now ?? new Date();
  const initiative = await loadInitiative(store, input.initiativeId);
  assertPermission(
    canArchiveInitiative(session, initiative),
    'Solo el responsable del área propietaria o Dirección pueden restaurar una iniciativa.',
  );
  if (!initiative.isArchived) return initiative;

  const updated = await store.updateInitiative(initiative.id, {
    isArchived: false,
    updatedAt: now.toISOString(),
  });

  await audit(store, {
    initiativeId: initiative.id,
    session,
    actionType: 'INITIATIVE_RESTORED',
    fieldName: 'is_archived',
    oldValue: { isArchived: true },
    newValue: { isArchived: false },
    at: now,
  });

  return updated;
}
