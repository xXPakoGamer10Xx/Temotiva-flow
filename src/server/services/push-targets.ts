import { DEPARTMENTS, STAGE_KEYS, type Department, type StageKey } from '@/domain/enums';
import type { PushMessage } from '@/domain/push';
import type { ActivityLogEntry, Initiative, JsonValue, User } from '@/domain/types';
import type { DataStore } from '@/server/repositories/types';
import { buildPushMessage } from './push-messages';

/**
 * Quién recibe cada aviso push y con qué texto (spec 002 §6 y §7).
 *
 * Función pura sobre el `DataStore`: no envía nada. Lee la entrada de la caja
 * negra y relee del store solo lo necesario.
 *
 *  - Need-to-Know: los destinatarios salen de las áreas implicadas en el evento
 *    (`departments.includes`), o de EXECUTIVE solo en los avance excepcionales.
 *  - Decisión D1: recibir push lo decide cada persona con sus dispositivos; aquí
 *    no se consultan `notification_prefs` ni `department_notification_settings`.
 *  - Nunca lanza por datos raros: un evento que no encaja simplemente no avisa.
 */
export interface PushTargets {
  userIds: string[];
  message: PushMessage;
}

type Draft = { userIds: string[]; message: PushMessage } | null;

export async function resolvePushTargets(store: DataStore, entry: ActivityLogEntry): Promise<PushTargets | null> {
  let initiative: Initiative | null = null;
  if (entry.initiativeId) {
    initiative = await store.initiativeById(entry.initiativeId);
    // Iniciativa archivada o inexistente: no se avisa de nada sobre ella.
    if (!initiative || initiative.isArchived) return null;
  }

  const draft = await draftFor(store, entry, initiative);
  if (!draft) return null;

  // Reglas comunes: sin el autor (RF-14), solo perfiles activos (RF-12), sin duplicados.
  const active = new Set((await store.listUsers()).filter(isReachable).map((user) => user.id));
  const userIds = [...new Set(draft.userIds)].filter((id) => id !== entry.userId && active.has(id));
  return userIds.length === 0 ? null : { userIds, message: draft.message };
}

async function draftFor(store: DataStore, entry: ActivityLogEntry, initiative: Initiative | null): Promise<Draft> {
  const value = asRecord(entry.newValue);

  switch (entry.actionType) {
    // E1 · tarea asignada a mí.
    case 'TASK_ASSIGNED': {
      const assigneeId = text(value.assigneeId);
      const taskId = text(value.taskId);
      if (!assigneeId || !taskId) return null;
      const task = await store.deptTaskById(taskId);
      if (!task || task.isArchived) return null;
      return {
        userIds: [assigneeId],
        message: buildPushMessage('TASK_ASSIGNED', { taskId, department: task.department, initiativeId: task.initiativeId }),
      };
    }

    // E2 · iniciativa asignada a mí.
    case 'ASSIGNEE_CHANGED': {
      const assigneeId = text(value.assigneeId);
      if (!assigneeId || !initiative) return null;
      return { userIds: [assigneeId], message: buildPushMessage('INITIATIVE_ASSIGNED', { initiativeId: initiative.id }) };
    }

    // E3 · 🆘 de iniciativa dirigida a mi área.
    case 'DEPENDENCY_CREATED': {
      const target = department(value.targetDepartment);
      const dependencyId = text(value.dependencyId);
      if (!target || !dependencyId || !initiative) return null;
      return {
        userIds: await membersOf(store, target),
        message: buildPushMessage('DEPENDENCY_INCOMING', {
          dependencyId,
          initiativeId: initiative.id,
          fromDepartment: initiative.ownerDepartment,
          toDepartment: target,
        }),
      };
    }

    // E4 · petición del buzón dirigida a mi área.
    case 'DEPARTMENT_REQUEST_CREATED': {
      const requestId = text(value.requestId);
      const request = requestId ? await store.departmentRequestById(requestId) : null;
      if (!request) return null;
      return {
        userIds: await membersOf(store, request.targetDepartment),
        message: buildPushMessage('REQUEST_INCOMING', {
          requestId: request.id,
          fromDepartment: request.sourceDepartment,
          toDepartment: request.targetDepartment,
        }),
      };
    }

    // E5 · resolvieron la 🆘 que pedí.
    case 'DEPENDENCY_RESOLVED': {
      const dependencyId = text(value.dependencyId);
      const dependency = dependencyId ? await store.dependencyById(dependencyId) : null;
      if (!dependency || !initiative) return null;
      return {
        userIds: [dependency.requestedBy],
        message: buildPushMessage('DEPENDENCY_RESOLVED', {
          dependencyId: dependency.id,
          initiativeId: initiative.id,
          byDepartment: dependency.targetDepartment,
        }),
      };
    }

    // E6 · resolvieron la petición del buzón que creé.
    case 'DEPARTMENT_REQUEST_RESOLVED': {
      const requestId = text(value.requestId);
      const request = requestId ? await store.departmentRequestById(requestId) : null;
      if (!request) return null;
      return {
        userIds: [request.requestedBy],
        message: buildPushMessage('REQUEST_RESOLVED', { requestId: request.id, byDepartment: request.targetDepartment }),
      };
    }

    // E7 · la iniciativa entra en una fase cuya área dueña es la mía.
    case 'STAGE_TRANSITION': {
      const owner = department(value.ownerDepartment);
      const stageKey = stage(value.stageKey);
      if (!owner || !stageKey || !initiative) return null;
      return {
        userIds: await membersOf(store, owner),
        message: buildPushMessage('ENTERED_BOARD', { initiativeId: initiative.id, stageKey, department: owner }),
      };
    }

    // E7 · la iniciativa se reasigna a mi área.
    case 'OWNER_REASSIGNED': {
      const owner = department(value.ownerDepartment);
      if (!owner || !initiative) return null;
      const current = await store.stageById(initiative.currentStageId);
      if (!current) return null;
      return {
        userIds: await membersOf(store, owner),
        message: buildPushMessage('ENTERED_BOARD', { initiativeId: initiative.id, stageKey: current.key, department: owner }),
      };
    }

    // E8 · nace una iniciativa en mi área.
    case 'INITIATIVE_CREATED': {
      const owner = department(value.ownerDepartment);
      if (!owner || !initiative) return null;
      return {
        userIds: await membersOf(store, owner),
        message: buildPushMessage('INITIATIVE_CREATED', { initiativeId: initiative.id, department: owner }),
      };
    }

    // E9 · avance excepcional: LEAD del área que recibe la iniciativa (dueña de
    // la fase nueva, determinista desde el evento) y Dirección.
    case 'EXCEPTION_OVERRIDE': {
      if (!initiative || entry.toStageId === null) return null;
      const toStage = await store.stageById(entry.toStageId);
      if (!toStage) return null;
      const owner = toStage.defaultOwnerDepartment;
      const users = (await store.listUsers()).filter(isReachable);
      const leads = users.filter((user) => user.role === 'LEAD' && user.departments.includes(owner));
      const executives = users.filter((user) => user.role === 'EXECUTIVE');
      return {
        userIds: [...leads, ...executives].map((user) => user.id),
        message: buildPushMessage('OVERRIDE', { initiativeId: initiative.id, department: owner }),
      };
    }

    // E10 · se para una iniciativa de mi área (toda el área, decisión D2).
    case 'BLOCKED_SET': {
      if (!initiative) return null;
      return {
        userIds: await membersOf(store, initiative.ownerDepartment),
        message: buildPushMessage('BLOCKED', { initiativeId: initiative.id, department: initiative.ownerDepartment }),
      };
    }

    default:
      return null;
  }
}

/** Personas activas de un área (multi-área incluida). */
async function membersOf(store: DataStore, area: Department): Promise<string[]> {
  return (await store.listUsers())
    .filter((user) => isReachable(user) && user.departments.includes(area))
    .map((user) => user.id);
}

function isReachable(user: User): boolean {
  return user.isActive && !user.isAnonymized;
}

// --- Lectura defensiva del JSON del log -------------------------------------

function asRecord(value: JsonValue | null): Record<string, JsonValue> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function text(value: JsonValue | undefined): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function department(value: JsonValue | undefined): Department | null {
  return typeof value === 'string' && (DEPARTMENTS as readonly string[]).includes(value) ? (value as Department) : null;
}

function stage(value: JsonValue | undefined): StageKey | null {
  return typeof value === 'string' && (STAGE_KEYS as readonly string[]).includes(value) ? (value as StageKey) : null;
}
