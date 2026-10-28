import { randomUUID } from 'node:crypto';
import { DEPARTMENTS, TASK_STATUSES } from '@/domain/enums';
import type { Department, TaskStatus } from '@/domain/enums';
import { MAX_TASK_DESCRIPTION, MAX_TASK_TITLE, MIN_TASK_TITLE } from '@/domain/rules';
import type { DeptTask, SessionContext } from '@/domain/types';
import { belongsTo } from '@/domain/types';
import type { DataStore } from '@/server/repositories/types';
import { audit } from './audit';
import { forbidden, invalid, notFound } from './errors';
import { canManageDeptTasks, canMoveDeptTask, canWorkInArea } from './rbac';

/**
 * Tareas de área.
 *
 * El LEAD de un área (o Dirección) crea, asigna y retira tareas para su equipo;
 * cualquier miembro del área las mueve entre Por hacer / En curso / Hecha y puede
 * tomar una que nadie lleve. Son independientes de la compuerta, el SLE y el WIP;
 * se vinculan opcionalmente a una iniciativa. Baja lógica; cada decisión va a la
 * caja negra.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function loadTask(store: DataStore, session: SessionContext, taskId: string): Promise<DeptTask> {
  const task = await store.deptTaskById(taskId);
  // Sin acceso se responde "no existe".
  if (!task || task.isArchived || !canWorkInArea(session, task.department)) {
    throw notFound('La tarea no existe o ya se retiró.');
  }
  return task;
}

async function assertAssignee(store: DataStore, department: Department, userId: string): Promise<void> {
  const user = await store.userById(userId);
  if (!user || !user.isActive || user.isAnonymized || !user.departments.includes(department)) {
    throw invalid('La persona asignada debe ser un miembro activo del área.');
  }
}

export interface CreateDeptTaskInput {
  title: string;
  description?: string;
  department?: Department;
  assigneeId?: string | null;
  initiativeId?: string | null;
  dueDate?: string | null;
  now?: Date;
}

export async function createDeptTask(
  store: DataStore,
  session: SessionContext,
  input: CreateDeptTaskInput,
): Promise<DeptTask> {
  const now = input.now ?? new Date();
  const department = input.department ?? session.departments[0];
  if (!department || !DEPARTMENTS.includes(department)) throw invalid('Elige el área de la tarea.');
  if (!canManageDeptTasks(session, department)) {
    throw forbidden('Solo el responsable del área o Dirección pueden crear tareas.');
  }

  const title = input.title.trim();
  if (title.length < MIN_TASK_TITLE) throw invalid('Ponle un título a la tarea.');
  if (title.length > MAX_TASK_TITLE) throw invalid(`El título no puede superar ${MAX_TASK_TITLE} caracteres.`);
  const description = (input.description ?? '').trim();
  if (description.length > MAX_TASK_DESCRIPTION) {
    throw invalid(`La descripción admite hasta ${MAX_TASK_DESCRIPTION} caracteres.`);
  }
  const dueDate = input.dueDate ?? null;
  if (dueDate !== null && (!DATE_RE.test(dueDate) || Number.isNaN(Date.parse(dueDate)))) {
    throw invalid('La fecha límite no es válida.');
  }
  const assigneeId = input.assigneeId ?? null;
  if (assigneeId) await assertAssignee(store, department, assigneeId);
  const initiativeId = input.initiativeId ?? null;
  if (initiativeId && !(await store.initiativeById(initiativeId))) throw invalid('La iniciativa indicada no existe.');

  const task = await store.insertDeptTask({
    id: randomUUID(),
    title,
    description,
    department,
    status: 'TODO',
    assigneeId,
    initiativeId,
    dueDate,
    createdBy: session.userId,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    isArchived: false,
  });
  await audit(store, {
    initiativeId,
    session,
    actionType: 'TASK_CREATED',
    fieldName: 'dept_tasks',
    newValue: { taskId: task.id, title, department, assigneeId },
    at: now,
  });
  return task;
}

export async function moveDeptTask(
  store: DataStore,
  session: SessionContext,
  input: { taskId: string; status: TaskStatus; now?: Date },
): Promise<DeptTask> {
  const now = input.now ?? new Date();
  if (!TASK_STATUSES.includes(input.status)) throw invalid('El estado indicado no existe.');
  const task = await loadTask(store, session, input.taskId);
  if (!canMoveDeptTask(session, task)) throw forbidden('Solo el equipo del área puede mover sus tareas.');
  if (task.status === input.status) return task;

  const updated = await store.updateDeptTask(task.id, { status: input.status, updatedAt: now.toISOString() });
  await audit(store, {
    initiativeId: task.initiativeId,
    session,
    actionType: 'TASK_MOVED',
    fieldName: 'dept_tasks.status',
    oldValue: { taskId: task.id, status: task.status },
    newValue: { taskId: task.id, status: input.status },
    at: now,
  });
  return updated;
}

/**
 * Asigna (o desasigna con `null`). El responsable del área asigna a cualquiera
 * del área; un miembro solo puede tomar para sí una tarea que nadie lleve.
 */
export async function assignDeptTask(
  store: DataStore,
  session: SessionContext,
  input: { taskId: string; assigneeId: string | null; now?: Date },
): Promise<DeptTask> {
  const now = input.now ?? new Date();
  const task = await loadTask(store, session, input.taskId);
  const manages = canManageDeptTasks(session, task.department);
  const takesFree = task.assigneeId === null && input.assigneeId === session.userId && belongsTo(session, task.department);
  if (!manages && !takesFree) {
    throw forbidden('Solo el responsable del área puede asignar; tú puedes tomar una tarea libre.');
  }
  if (input.assigneeId) await assertAssignee(store, task.department, input.assigneeId);
  if (task.assigneeId === input.assigneeId) return task;

  const updated = await store.updateDeptTask(task.id, { assigneeId: input.assigneeId, updatedAt: now.toISOString() });
  await audit(store, {
    initiativeId: task.initiativeId,
    session,
    actionType: 'TASK_ASSIGNED',
    fieldName: 'dept_tasks.assignee',
    oldValue: { taskId: task.id, assigneeId: task.assigneeId },
    newValue: { taskId: task.id, assigneeId: input.assigneeId },
    at: now,
  });
  return updated;
}

/** Baja lógica: el responsable del área o Dirección. */
export async function removeDeptTask(
  store: DataStore,
  session: SessionContext,
  input: { taskId: string; now?: Date },
): Promise<void> {
  const now = input.now ?? new Date();
  const task = await loadTask(store, session, input.taskId);
  if (!canManageDeptTasks(session, task.department)) {
    throw forbidden('Solo el responsable del área o Dirección pueden retirar tareas.');
  }
  await store.updateDeptTask(task.id, { isArchived: true, updatedAt: now.toISOString() });
  await audit(store, {
    initiativeId: task.initiativeId,
    session,
    actionType: 'TASK_REMOVED',
    fieldName: 'dept_tasks',
    oldValue: { taskId: task.id, title: task.title },
    at: now,
  });
}

// --- Proyecciones de solo lectura para la interfaz ---------------------------

export interface DeptTaskView {
  id: string;
  title: string;
  description: string;
  department: Department;
  status: TaskStatus;
  assigneeId: string | null;
  assigneeName: string | null;
  initiativeId: string | null;
  dueDate: string | null;
  createdByName: string;
  isMine: boolean;
  canManage: boolean;
  canMove: boolean;
  canTake: boolean;
}

export interface TeamMemberOption {
  id: string;
  name: string;
  departments: Department[];
}

export interface TasksPageView {
  tasks: DeptTaskView[];
  /** Áreas donde quien consulta puede crear tareas. */
  manageableDepartments: Department[];
  /** Vacío si no puede asignar (no se envían nombres de más). */
  people: TeamMemberOption[];
  initiatives: { id: string; title: string }[];
}

export async function getTasksView(store: DataStore, session: SessionContext): Promise<TasksPageView> {
  const [tasks, users, initiatives] = await Promise.all([
    store.listDeptTasks(),
    store.listUsers(),
    store.listInitiatives(),
  ]);
  const userName = new Map(users.map((user) => [user.id, user.name]));

  const views: DeptTaskView[] = tasks
    .filter((task) => !task.isArchived && canWorkInArea(session, task.department))
    .map((task) => ({
      id: task.id,
      title: task.title,
      description: task.description,
      department: task.department,
      status: task.status,
      assigneeId: task.assigneeId,
      assigneeName: task.assigneeId ? (userName.get(task.assigneeId) ?? 'Persona retirada') : null,
      initiativeId: task.initiativeId,
      dueDate: task.dueDate,
      createdByName: userName.get(task.createdBy) ?? 'Persona retirada',
      isMine: task.assigneeId === session.userId,
      canManage: canManageDeptTasks(session, task.department),
      canMove: canMoveDeptTask(session, task),
      canTake: task.assigneeId === null && belongsTo(session, task.department),
    }));

  const manageableDepartments =
    session.role === 'EXECUTIVE' ? [...DEPARTMENTS] : session.role === 'LEAD' ? [...session.departments] : [];
  const people =
    manageableDepartments.length > 0
      ? users
          .filter(
            (user) =>
              user.isActive &&
              !user.isAnonymized &&
              user.departments.some((department) => manageableDepartments.includes(department)),
          )
          .map((user) => ({ id: user.id, name: user.name, departments: user.departments }))
      : [];
  return {
    tasks: views,
    manageableDepartments,
    people,
    initiatives:
      manageableDepartments.length > 0
        ? initiatives.filter((i) => !i.isArchived).map((i) => ({ id: i.id, title: i.title }))
        : [],
  };
}
