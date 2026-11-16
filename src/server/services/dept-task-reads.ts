import { randomUUID } from 'node:crypto';
import type { TaskStatus } from '@/domain/enums';
import type { DeptTaskReadCycle, TaskReadSource } from '@/domain/task-read';
import type { DeptTask, SessionContext } from '@/domain/types';
import type { DataStore } from '@/server/repositories/types';
import { audit } from './audit';
import { forbidden, notFound } from './errors';
import { canWorkInArea } from './rbac';

/**
 * Confirmación de lectura y tiempos de las tareas de área (spec 003).
 *
 * Un ciclo por cada vez que una tarea pasa a manos de una persona: se abre al
 * asignar, se cierra al reasignar, desasignar o retirar, y guarda cuándo se
 * leyó y cuándo se resolvió. `dept-tasks.ts` y el webhook de GitHub llaman a
 * los `track*` al final de sus mutaciones; así la regla se cumple también
 * desde MCP. Los ciclos no se borran: solo se cierran.
 */

const RETIRED_PERSON = 'Persona retirada';

async function openCycleOf(store: DataStore, taskId: string): Promise<DeptTaskReadCycle | null> {
  return (await store.listDeptTaskReads(taskId)).find((cycle) => cycle.closedAt === null) ?? null;
}

/** RF-09: tarea asignada antes de esta versión. Se abre el ciclo al leerla, sin hora de asignación. */
function openLegacyCycle(store: DataStore, taskId: string, assigneeId: string): Promise<DeptTaskReadCycle> {
  return store.openDeptTaskRead({
    id: randomUUID(),
    taskId,
    assigneeId,
    assignedAt: null,
    readAt: null,
    readSource: null,
    resolvedAt: null,
    closedAt: null,
  });
}

/** Marca leído con guard: si otra petición se adelantó, ni se escribe ni se audita (RF-04). */
async function markRead(
  store: DataStore,
  session: SessionContext,
  task: Pick<DeptTask, 'id' | 'initiativeId'>,
  cycle: DeptTaskReadCycle,
  source: TaskReadSource,
  now: Date,
): Promise<DeptTaskReadCycle> {
  const updated = await store.updateDeptTaskRead(cycle.id, { readAt: now.toISOString(), readSource: source }, { unread: true });
  if (!updated) return (await store.listDeptTaskReads(task.id)).find((item) => item.id === cycle.id) ?? cycle;
  await audit(store, {
    initiativeId: task.initiativeId,
    session,
    actionType: 'TASK_READ',
    fieldName: 'dept_task_reads',
    newValue: { taskId: task.id, source },
    at: now,
  });
  return updated;
}

// --- Seguimiento (lo llaman las mutaciones de tareas) ------------------------------

/** RF-01/RF-02: cierra el ciclo abierto y, si hay persona, abre uno nuevo sin leer. */
export async function trackAssignment(
  store: DataStore,
  task: Pick<DeptTask, 'id'>,
  assigneeId: string | null,
  now: Date,
): Promise<void> {
  const open = await openCycleOf(store, task.id);
  if (open) await store.updateDeptTaskRead(open.id, { closedAt: now.toISOString() });
  if (!assigneeId) return;
  await store.openDeptTaskRead({
    id: randomUUID(),
    taskId: task.id,
    assigneeId,
    assignedAt: now.toISOString(),
    readAt: null,
    readSource: null,
    resolvedAt: null,
    closedAt: null,
  });
}

/**
 * Cambio de estado (`task` es la tarea **antes** de moverla).
 *  - RF-05: si quien la mueve es la persona asignada y la saca de «Por hacer» sin
 *    leerla, queda leída `AUTO`. Con `session = null` (webhook de GitHub) nunca.
 *  - RF-07/RF-08: al entrar en «Hecha» se guarda la resolución; al salir, se borra.
 */
export async function trackMove(
  store: DataStore,
  session: SessionContext | null,
  task: DeptTask,
  to: TaskStatus,
  now: Date,
): Promise<void> {
  let open = await openCycleOf(store, task.id);
  const movedByAssignee = session !== null && task.assigneeId !== null && task.assigneeId === session.userId;
  if (movedByAssignee && to !== 'TODO') {
    if (!open) open = await openLegacyCycle(store, task.id, session.userId);
    if (open.assigneeId === session.userId && open.readAt === null) {
      open = await markRead(store, session, task, open, 'AUTO', now);
    }
  }
  if (!open) return;
  if (to === 'DONE') await store.updateDeptTaskRead(open.id, { resolvedAt: now.toISOString() });
  else if (task.status === 'DONE') await store.updateDeptTaskRead(open.id, { resolvedAt: null });
}

/** CA-09: retirar la tarea cierra el ciclo abierto sin abrir otro. */
export async function trackRemoval(store: DataStore, task: Pick<DeptTask, 'id'>, now: Date): Promise<void> {
  const open = await openCycleOf(store, task.id);
  if (open) await store.updateDeptTaskRead(open.id, { closedAt: now.toISOString() });
}

// --- Marcar como leída (RF-03, RF-04, RF-06, RF-09) --------------------------------

export async function markDeptTaskRead(
  store: DataStore,
  session: SessionContext,
  input: { taskId: string; now?: Date },
): Promise<DeptTaskReadCycle> {
  const now = input.now ?? new Date();
  const task = await store.deptTaskById(input.taskId);
  // Mismo Need-to-Know y mensaje que el resto de tareas: sin acceso, «no existe».
  if (!task || task.isArchived || !canWorkInArea(session, task.department)) {
    throw notFound('La tarea no existe o ya se retiró.');
  }
  if (task.assigneeId !== session.userId) {
    throw forbidden('Solo la persona asignada puede marcar la tarea como leída.');
  }

  let open = await openCycleOf(store, task.id);
  if (open && open.assigneeId !== session.userId) {
    // Ciclo de otra persona (dato antiguo desalineado): se cierra y se empieza el propio.
    await store.updateDeptTaskRead(open.id, { closedAt: now.toISOString() });
    open = null;
  }
  if (!open) open = await openLegacyCycle(store, task.id, session.userId);
  if (open.readAt !== null) return open;
  return markRead(store, session, task, open, 'MANUAL', now);
}

// --- Proyección para la tarjeta (RF-10..RF-12) --------------------------------------

/** Ciclo de la persona que lleva la tarea ahora. `NO_DATA`: tarea previa a esta versión. */
export type ReadCycleView =
  | { state: 'NO_DATA' }
  | {
      state: 'UNREAD' | 'READ';
      assignedAt: string | null;
      readAt: string | null;
      readSource: TaskReadSource | null;
      resolvedAt: string | null;
    };

export interface ReadHistoryItem {
  id: string;
  assigneeName: string;
  assignedAt: string | null;
  readAt: string | null;
  readSource: TaskReadSource | null;
  resolvedAt: string | null;
  closedAt: string;
}

/**
 * `cycles` son los de esta tarea. Sin persona asignada no hay indicador
 * (`readCycle = null`). El historial va del ciclo cerrado más reciente al más antiguo.
 */
export function readCycleViews(
  task: Pick<DeptTask, 'assigneeId'>,
  cycles: DeptTaskReadCycle[],
  userName: ReadonlyMap<string, string>,
): { readCycle: ReadCycleView | null; readHistory: ReadHistoryItem[] } {
  const open = cycles.find((cycle) => cycle.closedAt === null) ?? null;
  let readCycle: ReadCycleView | null = null;
  if (task.assigneeId) {
    readCycle =
      open && open.assigneeId === task.assigneeId
        ? {
            state: open.readAt ? 'READ' : 'UNREAD',
            assignedAt: open.assignedAt,
            readAt: open.readAt,
            readSource: open.readSource,
            resolvedAt: open.resolvedAt,
          }
        : { state: 'NO_DATA' };
  }
  const readHistory = cycles
    .filter((cycle): cycle is DeptTaskReadCycle & { closedAt: string } => cycle.closedAt !== null)
    .sort((a, b) => b.closedAt.localeCompare(a.closedAt))
    .map((cycle) => ({
      id: cycle.id,
      assigneeName: userName.get(cycle.assigneeId) ?? RETIRED_PERSON,
      assignedAt: cycle.assignedAt,
      readAt: cycle.readAt,
      readSource: cycle.readSource,
      resolvedAt: cycle.resolvedAt,
      closedAt: cycle.closedAt,
    }));
  return { readCycle, readHistory };
}
