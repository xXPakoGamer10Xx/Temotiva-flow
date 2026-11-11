import { randomUUID } from 'node:crypto';
import type { Department } from '@/domain/enums';
import {
  MAX_SPRINT_CAPACITY,
  MAX_SPRINT_DAYS,
  MAX_SPRINT_GOAL,
  MAX_SPRINT_NAME,
  SPRINT_DEFAULT_CAPACITY,
  SPRINT_DEFAULT_DAYS,
  SPRINT_START_WEEKDAY,
} from '@/domain/rules';
import type { DeptTask, SessionContext, Sprint } from '@/domain/types';
import type { DataStore } from '@/server/repositories/types';
import { audit } from './audit';
import { type DeptTaskView, isValidDateKey, toDeptTaskView } from './dept-tasks';
import { forbidden, invalid, notFound } from './errors';
import { canManageDeptTasks, canWorkInArea } from './rbac';

/**
 * Sprint de Tech.
 *
 * Vista exclusiva del área Tech (y Dirección) sobre sus tareas de área: el
 * responsable abre sprints (por defecto de miércoles a miércoles, con fechas
 * editables), reparte horas estimadas y fechas límite, y ve la carga de cada
 * persona. Los pull requests de GitHub mueven las tareas (ver `github-sync.ts`).
 */

export const TECH: Department = 'TECH';

/** Ver el sprint: miembros de Tech o Dirección. */
export function canSeeTechSprint(session: SessionContext): boolean {
  return canWorkInArea(session, TECH);
}

/** Abrir y editar sprints, y planificar horas/fechas: LEAD de Tech o Dirección. */
export function canManageTechSprint(session: SessionContext): boolean {
  return canManageDeptTasks(session, TECH);
}

// --- Fechas (todas como `YYYY-MM-DD`, en UTC para no depender del huso) ----

const DAY_MS = 24 * 60 * 60 * 1000;

export function addDays(dateKey: string, days: number): string {
  return new Date(Date.parse(`${dateKey}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / DAY_MS);
}

/** Último miércoles (o el propio día, si lo es). */
export function sprintWeekdayOnOrBefore(dateKey: string): string {
  const weekday = new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
  return addDays(dateKey, -((weekday - SPRINT_START_WEEKDAY + 7) % 7));
}

/**
 * Sprint vigente: el más reciente que ya empezó. Como la cadencia es de
 * miércoles a miércoles, el miércoles de relevo pertenece al sprint nuevo.
 */
export function activeSprint(sprints: Sprint[], today: string): Sprint | null {
  return (
    sprints
      .filter((sprint) => !sprint.isArchived && sprint.startDate <= today)
      .sort((a, b) => b.startDate.localeCompare(a.startDate))[0] ?? null
  );
}

/** Propuesta para el siguiente sprint: encadena con el último o arranca el miércoles en curso. */
export function suggestNextSprint(sprints: Sprint[], today: string): { name: string; startDate: string; endDate: string } {
  const live = sprints.filter((sprint) => !sprint.isArchived);
  const latest = [...live].sort((a, b) => b.endDate.localeCompare(a.endDate))[0];
  const startDate = latest && latest.endDate >= today ? latest.endDate : sprintWeekdayOnOrBefore(today);
  return { name: `Sprint ${live.length + 1}`, startDate, endDate: addDays(startDate, SPRINT_DEFAULT_DAYS) };
}

function checkWindow(startDate: string, endDate: string): void {
  if (!isValidDateKey(startDate) || !isValidDateKey(endDate)) throw invalid('Las fechas del sprint no son válidas.');
  const days = daysBetween(startDate, endDate);
  if (days < 1) throw invalid('El sprint debe terminar después de empezar.');
  if (days > MAX_SPRINT_DAYS) throw invalid(`Un sprint dura como máximo ${MAX_SPRINT_DAYS} días.`);
}

function checkCapacity(hours: number): void {
  if (!Number.isFinite(hours) || hours < 0 || hours > MAX_SPRINT_CAPACITY || Math.round(hours * 2) !== hours * 2) {
    throw invalid(`La capacidad va de 0 a ${MAX_SPRINT_CAPACITY} horas por persona, en tramos de media hora.`);
  }
}

function checkText(name: string, goal: string): void {
  if (name.length < 1) throw invalid('Ponle un nombre al sprint.');
  if (name.length > MAX_SPRINT_NAME) throw invalid(`El nombre admite hasta ${MAX_SPRINT_NAME} caracteres.`);
  if (goal.length > MAX_SPRINT_GOAL) throw invalid(`El objetivo admite hasta ${MAX_SPRINT_GOAL} caracteres.`);
}

async function loadSprint(store: DataStore, session: SessionContext, sprintId: string): Promise<Sprint> {
  const sprint = await store.sprintById(sprintId);
  if (!sprint || sprint.isArchived || !canWorkInArea(session, sprint.department)) {
    throw notFound('El sprint no existe.');
  }
  return sprint;
}

// --- Mutaciones ---------------------------------------------------------------

export interface CreateSprintInput {
  name?: string;
  goal?: string;
  startDate: string;
  endDate: string;
  /** Horas disponibles por persona. Por defecto, las del sprint anterior. */
  capacityHours?: number;
  now?: Date;
}

export async function createSprint(store: DataStore, session: SessionContext, input: CreateSprintInput): Promise<Sprint> {
  const now = input.now ?? new Date();
  if (!canManageTechSprint(session)) throw forbidden('Solo el responsable de Tech o Dirección abren sprints.');
  checkWindow(input.startDate, input.endDate);
  const existing = (await store.listSprints()).filter((sprint) => sprint.department === TECH && !sprint.isArchived);
  const name = (input.name ?? '').trim() || `Sprint ${existing.length + 1}`;
  const goal = (input.goal ?? '').trim();
  checkText(name, goal);
  const previous = [...existing].sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
  const capacityHours = input.capacityHours ?? previous?.capacityHours ?? SPRINT_DEFAULT_CAPACITY;
  checkCapacity(capacityHours);

  const sprint = await store.insertSprint({
    id: randomUUID(),
    department: TECH,
    name,
    goal,
    startDate: input.startDate,
    endDate: input.endDate,
    capacityHours,
    createdBy: session.userId,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    isArchived: false,
  });
  await audit(store, {
    initiativeId: null,
    session,
    actionType: 'SPRINT_CREATED',
    fieldName: 'sprints',
    newValue: { sprintId: sprint.id, name, startDate: sprint.startDate, endDate: sprint.endDate, capacityHours },
    at: now,
  });
  return sprint;
}

export interface UpdateSprintInput {
  sprintId: string;
  name?: string;
  goal?: string;
  startDate?: string;
  endDate?: string;
  capacityHours?: number;
  /**
   * Al mover el cierre, las tareas abiertas cuya fecha límite era el cierre
   * anterior lo siguen (es la fecha que se les puso por defecto).
   */
  shiftDueDates?: boolean;
  now?: Date;
}

export async function updateSprint(
  store: DataStore,
  session: SessionContext,
  input: UpdateSprintInput,
): Promise<{ sprint: Sprint; shiftedTasks: number }> {
  const now = input.now ?? new Date();
  const sprint = await loadSprint(store, session, input.sprintId);
  if (!canManageDeptTasks(session, sprint.department)) {
    throw forbidden('Solo el responsable de Tech o Dirección modifican el sprint.');
  }
  const next = {
    name: input.name !== undefined ? input.name.trim() : sprint.name,
    goal: input.goal !== undefined ? input.goal.trim() : sprint.goal,
    startDate: input.startDate ?? sprint.startDate,
    endDate: input.endDate ?? sprint.endDate,
    capacityHours: input.capacityHours ?? sprint.capacityHours,
  };
  checkWindow(next.startDate, next.endDate);
  checkText(next.name, next.goal);
  checkCapacity(next.capacityHours);

  const changed = (Object.keys(next) as (keyof typeof next)[]).filter((field) => next[field] !== sprint[field]);
  if (changed.length === 0) return { sprint, shiftedTasks: 0 };

  const updated = await store.updateSprint(sprint.id, { ...next, updatedAt: now.toISOString() });

  let shiftedTasks = 0;
  if (next.endDate !== sprint.endDate && (input.shiftDueDates ?? true)) {
    const followers = (await store.listDeptTasks()).filter(
      (task) => task.sprintId === sprint.id && !task.isArchived && task.status !== 'DONE' && task.dueDate === sprint.endDate,
    );
    for (const task of followers) {
      await store.updateDeptTask(task.id, { dueDate: next.endDate, updatedAt: now.toISOString() });
      await audit(store, {
        initiativeId: task.initiativeId,
        session,
        actionType: 'TASK_PLANNED',
        fieldName: 'dept_tasks.dueDate',
        oldValue: { taskId: task.id, dueDate: task.dueDate },
        newValue: { taskId: task.id, dueDate: next.endDate, reason: 'sprint_end_moved' },
        at: now,
      });
    }
    shiftedTasks = followers.length;
  }

  await audit(store, {
    initiativeId: null,
    session,
    actionType: 'SPRINT_UPDATED',
    fieldName: `sprints.${changed.join(',')}`,
    oldValue: { sprintId: sprint.id, ...Object.fromEntries(changed.map((field) => [field, sprint[field]])) },
    newValue: { sprintId: sprint.id, ...Object.fromEntries(changed.map((field) => [field, next[field]])), shiftedTasks },
    at: now,
  });
  return { sprint: updated, shiftedTasks };
}

/**
 * Pasa al sprint destino todo lo que no está hecho. Las fechas límite que eran
 * el cierre del sprint de origen pasan al cierre del destino.
 */
export async function carryOverSprint(
  store: DataStore,
  session: SessionContext,
  input: { fromSprintId: string; toSprintId: string; now?: Date },
): Promise<{ moved: number }> {
  const now = input.now ?? new Date();
  if (input.fromSprintId === input.toSprintId) throw invalid('Elige un sprint distinto.');
  const from = await loadSprint(store, session, input.fromSprintId);
  const to = await loadSprint(store, session, input.toSprintId);
  if (!canManageDeptTasks(session, from.department) || to.department !== from.department) {
    throw forbidden('Solo el responsable de Tech o Dirección mueven tareas entre sprints.');
  }

  const pending = (await store.listDeptTasks()).filter(
    (task) => task.sprintId === from.id && !task.isArchived && task.status !== 'DONE',
  );
  for (const task of pending) {
    const dueDate = task.dueDate === from.endDate ? to.endDate : task.dueDate;
    await store.updateDeptTask(task.id, { sprintId: to.id, dueDate, updatedAt: now.toISOString() });
    await audit(store, {
      initiativeId: task.initiativeId,
      session,
      actionType: 'TASK_PLANNED',
      fieldName: 'dept_tasks.sprintId',
      oldValue: { taskId: task.id, sprintId: from.id, dueDate: task.dueDate },
      newValue: { taskId: task.id, sprintId: to.id, dueDate, reason: 'carry_over' },
      at: now,
    });
  }
  return { moved: pending.length };
}

// --- Proyección de solo lectura (vista de project manager) ------------------

export interface SprintOption {
  id: string;
  name: string;
  goal: string;
  startDate: string;
  endDate: string;
  capacityHours: number;
  isActive: boolean;
}

export interface PersonLoad {
  /** `null` = sin asignar. */
  userId: string | null;
  name: string;
  /** Horas estimadas de todo lo asignado en el sprint. */
  hours: number;
  doneHours: number;
  /** Horas de lo que aún no está hecho. */
  openHours: number;
  tasks: number;
  doneTasks: number;
  /** Tareas sin horas estimadas: la carga real es mayor que la cifra. */
  unestimated: number;
  overdue: number;
  /** Horas disponibles en el sprint (0 para "Sin asignar"). */
  capacity: number;
  /** Asignado por encima de su capacidad. */
  overloaded: boolean;
}

/** Ritmo: avance del trabajo frente al tiempo transcurrido del sprint. */
export type SprintPace = 'NOT_STARTED' | 'ON_TRACK' | 'AT_RISK' | 'BEHIND' | 'FINISHED';

export interface SprintHealth {
  daysTotal: number;
  daysElapsed: number;
  daysLeft: number;
  /** 0..1 del calendario consumido. */
  timeProgress: number;
  /** 0..1 del trabajo hecho (por horas; por número de tareas si nada está estimado). */
  workProgress: number;
  pace: SprintPace;
  hours: number;
  doneHours: number;
  tasks: number;
  doneTasks: number;
  /** Capacidad total del equipo (personas de Tech × horas por persona). */
  teamCapacity: number;
}

export interface SprintRisks {
  overdue: number;
  unestimated: number;
  unassigned: number;
  /** Tareas con PR esperando revisión. */
  inReview: number;
  overloadedPeople: number;
}

export interface TechSprintView {
  today: string;
  canManage: boolean;
  sprints: SprintOption[];
  selected: SprintOption | null;
  suggestion: { name: string; startDate: string; endDate: string; capacityHours: number };
  tasks: DeptTaskView[];
  /** Tareas de Tech sin sprint y sin terminar. */
  backlog: DeptTaskView[];
  people: { id: string; name: string }[];
  load: PersonLoad[];
  health: SprintHealth | null;
  risks: SprintRisks;
  /** El webhook de GitHub tiene secreto configurado. No revela el secreto. */
  githubConfigured: boolean;
}

const isOverdue = (task: DeptTask, today: string): boolean =>
  task.dueDate !== null && task.status !== 'DONE' && task.dueDate < today;

export function computeLoad(
  tasks: DeptTask[],
  people: { id: string; name: string }[],
  userName: Map<string, string>,
  capacity: number,
  today: string,
): PersonLoad[] {
  const rows = new Map<string | null, PersonLoad>();
  const row = (userId: string | null): PersonLoad => {
    let current = rows.get(userId);
    if (!current) {
      const name = userId === null ? 'Sin asignar' : (userName.get(userId) ?? 'Persona retirada');
      current = {
        userId,
        name,
        hours: 0,
        doneHours: 0,
        openHours: 0,
        tasks: 0,
        doneTasks: 0,
        unestimated: 0,
        overdue: 0,
        capacity: userId === null ? 0 : capacity,
        overloaded: false,
      };
      rows.set(userId, current);
    }
    return current;
  };
  for (const person of people) row(person.id);
  for (const task of tasks) {
    const current = row(task.assigneeId);
    const hours = task.estimatedHours ?? 0;
    current.tasks += 1;
    current.hours += hours;
    if (task.estimatedHours === null) current.unestimated += 1;
    if (isOverdue(task, today)) current.overdue += 1;
    if (task.status === 'DONE') {
      current.doneTasks += 1;
      current.doneHours += hours;
    } else {
      current.openHours += hours;
    }
  }
  for (const item of rows.values()) item.overloaded = item.userId !== null && item.hours > item.capacity;
  return [...rows.values()]
    .filter((item) => item.userId !== null || item.tasks > 0)
    .sort((a, b) => (a.userId === null ? 1 : b.userId === null ? -1 : b.hours - a.hours || a.name.localeCompare(b.name)));
}

export function computeHealth(sprint: Sprint, tasks: DeptTask[], teamSize: number, today: string): SprintHealth {
  const daysTotal = Math.max(1, daysBetween(sprint.startDate, sprint.endDate));
  const daysElapsed = Math.min(daysTotal, Math.max(0, daysBetween(sprint.startDate, today)));
  const timeProgress = daysElapsed / daysTotal;

  const hours = tasks.reduce((sum, task) => sum + (task.estimatedHours ?? 0), 0);
  const doneTasksList = tasks.filter((task) => task.status === 'DONE');
  const doneHours = doneTasksList.reduce((sum, task) => sum + (task.estimatedHours ?? 0), 0);
  const workProgress =
    hours > 0 ? doneHours / hours : tasks.length > 0 ? doneTasksList.length / tasks.length : 0;

  let pace: SprintPace;
  if (today < sprint.startDate) pace = 'NOT_STARTED';
  else if (tasks.length > 0 && doneTasksList.length === tasks.length) pace = 'FINISHED';
  else {
    const gap = timeProgress - workProgress;
    pace = gap > 0.25 ? 'BEHIND' : gap > 0.1 ? 'AT_RISK' : 'ON_TRACK';
  }

  return {
    daysTotal,
    daysElapsed,
    daysLeft: daysTotal - daysElapsed,
    timeProgress,
    workProgress,
    pace,
    hours,
    doneHours,
    tasks: tasks.length,
    doneTasks: doneTasksList.length,
    teamCapacity: teamSize * sprint.capacityHours,
  };
}

export async function getTechSprintView(
  store: DataStore,
  session: SessionContext,
  input: { sprintId?: string | null; today: string; githubConfigured: boolean },
): Promise<TechSprintView> {
  if (!canSeeTechSprint(session)) throw notFound('Esta vista es solo para el área de Tech.');

  const [allSprints, allTasks, users] = await Promise.all([store.listSprints(), store.listDeptTasks(), store.listUsers()]);
  const sprints = allSprints.filter((sprint) => sprint.department === TECH && !sprint.isArchived);
  const active = activeSprint(sprints, input.today);
  const toOption = (sprint: Sprint): SprintOption => ({
    id: sprint.id,
    name: sprint.name,
    goal: sprint.goal,
    startDate: sprint.startDate,
    endDate: sprint.endDate,
    capacityHours: sprint.capacityHours,
    isActive: sprint.id === active?.id,
  });
  const selectedSprint =
    (input.sprintId ? sprints.find((sprint) => sprint.id === input.sprintId) : undefined) ?? active ?? sprints[0] ?? null;

  const userName = new Map(users.map((user) => [user.id, user.name]));
  const techTasks = allTasks.filter((task) => task.department === TECH && !task.isArchived);
  const inSprint = selectedSprint ? techTasks.filter((task) => task.sprintId === selectedSprint.id) : [];
  const backlog = techTasks.filter((task) => task.sprintId === null && task.status !== 'DONE');

  const people = users
    .filter((user) => user.isActive && !user.isAnonymized && user.departments.includes(TECH))
    .map((user) => ({ id: user.id, name: user.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const load = selectedSprint ? computeLoad(inSprint, people, userName, selectedSprint.capacityHours, input.today) : [];
  const open = inSprint.filter((task) => task.status !== 'DONE');

  const latestCapacity = [...sprints].sort((a, b) => b.startDate.localeCompare(a.startDate))[0]?.capacityHours;
  return {
    today: input.today,
    canManage: canManageTechSprint(session),
    sprints: [...sprints].sort((a, b) => b.startDate.localeCompare(a.startDate)).map(toOption),
    selected: selectedSprint ? toOption(selectedSprint) : null,
    suggestion: { ...suggestNextSprint(sprints, input.today), capacityHours: latestCapacity ?? SPRINT_DEFAULT_CAPACITY },
    tasks: inSprint.map((task) => toDeptTaskView(task, session, userName)),
    backlog: backlog.map((task) => toDeptTaskView(task, session, userName)),
    people,
    load,
    health: selectedSprint ? computeHealth(selectedSprint, inSprint, people.length, input.today) : null,
    risks: {
      overdue: open.filter((task) => isOverdue(task, input.today)).length,
      unestimated: open.filter((task) => task.estimatedHours === null).length,
      unassigned: open.filter((task) => task.assigneeId === null).length,
      inReview: inSprint.filter((task) => task.status === 'REVIEW').length,
      overloadedPeople: load.filter((item) => item.overloaded).length,
    },
    githubConfigured: input.githubConfigured,
  };
}
