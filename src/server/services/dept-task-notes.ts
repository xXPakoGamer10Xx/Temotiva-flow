import { randomUUID } from 'node:crypto';
import type { TaskNoteKind } from '@/domain/enums';
import { MAX_TASK_NOTES_PER_TASK } from '@/domain/rules';
import { DEPARTMENT_LABELS } from '@/domain/labels';
import {
  type DeptTaskNote,
  type DeptTaskNoteRevision,
  activeNotesNewestFirst,
  isRecentNote,
  noteLength,
  taskNoteSignal,
  validateTaskNoteBody,
} from '@/domain/task-note';
import type { DeptTask, SessionContext } from '@/domain/types';
import { belongsTo } from '@/domain/types';
import type { DataStore } from '@/server/repositories/types';
import { audit } from './audit';
import { forbidden, invalid, invalidState, notFound } from './errors';
import { canAddTaskNote, canEditTaskNote, canRemoveTaskNote, canWorkInArea } from './rbac';

/**
 * Notas de seguimiento de las tareas de área (spec 006).
 *
 * Las notas se acumulan: añadir una nunca sobrescribe otra. Editar guarda antes
 * la versión anterior y retirar es baja lógica. La señal de espera o bloqueo
 * que derivan es solo informativa: aquí nunca se toca el bloqueo de una
 * iniciativa ni su SLE (AGENTS.md §5.4, §5.15).
 *
 * El texto de una nota no va a la caja negra: puede contener datos personales
 * y ya vive en sus tablas. La auditoría guarda ids, tipo y longitud.
 */

export const TASK_NOTE_CONFLICT_ERROR = 'La nota cambió mientras la editabas. Vuelve a abrirla.';
const NOTE_NOT_FOUND = 'La nota no existe o ya se retiró.';
const DONE_READ_ONLY = 'La tarea está hecha: sus notas son de solo lectura.';

/** Tarea visible para la sesión; para cualquier otra persona «no existe». */
async function loadVisibleTask(store: DataStore, session: SessionContext, taskId: string): Promise<DeptTask> {
  const task = await store.deptTaskById(taskId);
  if (!task || task.isArchived || !canWorkInArea(session, task.department)) {
    throw notFound('La tarea no existe o ya se retiró.');
  }
  return task;
}

/** Nota vigente de una tarea visible. Una nota de una tarea ajena responde igual que una inventada. */
async function loadVisibleNote(
  store: DataStore,
  session: SessionContext,
  noteId: string,
): Promise<{ note: DeptTaskNote; task: DeptTask }> {
  const note = await store.deptTaskNoteById(noteId);
  if (!note || note.isRemoved) throw notFound(NOTE_NOT_FOUND);
  try {
    return { note, task: await loadVisibleTask(store, session, note.taskId) };
  } catch {
    throw notFound(NOTE_NOT_FOUND);
  }
}

function parseBody(raw: string): string {
  const result = validateTaskNoteBody(raw);
  if (!result.ok) throw invalid(result.message);
  return result.value;
}

const auditValue = (note: Pick<DeptTaskNote, 'id' | 'taskId' | 'kind' | 'body'>) => ({
  taskId: note.taskId,
  noteId: note.id,
  kind: note.kind,
  length: noteLength(note.body),
});

export interface AddTaskNoteInput {
  taskId: string;
  kind: TaskNoteKind;
  body: string;
  now?: Date;
}

/** RF-1…RF-4: añade una nota con autor, área y hora tomados del servidor. */
export async function addTaskNote(store: DataStore, session: SessionContext, input: AddTaskNoteInput): Promise<DeptTaskNote> {
  const now = input.now ?? new Date();
  const task = await loadVisibleTask(store, session, input.taskId);
  if (!canAddTaskNote(session, task)) throw invalidState(DONE_READ_ONLY);
  const body = parseBody(input.body);

  const active = (await store.listDeptTaskNotes(task.id)).filter((note) => !note.isRemoved).length;
  if (active >= MAX_TASK_NOTES_PER_TASK) {
    throw invalid(`Esta tarea ya tiene ${MAX_TASK_NOTES_PER_TASK} notas. Retira alguna antes de añadir otra.`);
  }

  const note = await store.insertDeptTaskNote({
    id: randomUUID(),
    taskId: task.id,
    kind: input.kind,
    body,
    authorId: session.userId,
    // RF-2: su área si pertenece a la de la tarea; Dirección de fuera queda en null.
    authorDepartment: belongsTo(session, task.department) ? task.department : null,
    createdAt: now.toISOString(),
    version: 1,
    editedAt: null,
    editedBy: null,
    isRemoved: false,
    removedBy: null,
    removedAt: null,
  });

  await audit(store, {
    initiativeId: task.initiativeId,
    session,
    actionType: 'TASK_NOTE_ADDED',
    fieldName: 'dept_task_notes',
    newValue: auditValue(note),
    at: now,
  });
  return note;
}

export interface EditTaskNoteInput {
  noteId: string;
  expectedVersion: number;
  kind: TaskNoteKind;
  body: string;
  now?: Date;
}

/** RF-5, RF-8: edita una nota propia (o cualquiera, si es Dirección) guardando la versión anterior. */
export async function editTaskNote(store: DataStore, session: SessionContext, input: EditTaskNoteInput): Promise<DeptTaskNote> {
  const now = input.now ?? new Date();
  const { note, task } = await loadVisibleNote(store, session, input.noteId);
  if (!canEditTaskNote(session, note)) throw forbidden('Solo quien escribió la nota o Dirección pueden editarla.');
  if (task.status === 'DONE') throw invalidState(DONE_READ_ONLY);
  if (note.version !== input.expectedVersion) throw invalidState(TASK_NOTE_CONFLICT_ERROR);
  const body = parseBody(input.body);
  if (body === note.body && input.kind === note.kind) return note;

  const revision: DeptTaskNoteRevision = {
    id: randomUUID(),
    noteId: note.id,
    version: note.version,
    kind: note.kind,
    body: note.body,
    replacedBy: session.userId,
    replacedAt: now.toISOString(),
  };
  const updated = await store.editDeptTaskNote(
    note.id,
    input.expectedVersion,
    { kind: input.kind, body, editedAt: now.toISOString(), editedBy: session.userId },
    revision,
  );
  if (!updated) throw invalidState(TASK_NOTE_CONFLICT_ERROR);

  await audit(store, {
    initiativeId: task.initiativeId,
    session,
    actionType: 'TASK_NOTE_EDITED',
    fieldName: 'dept_task_notes',
    oldValue: auditValue(note),
    newValue: { ...auditValue(updated), version: updated.version },
    at: now,
  });
  return updated;
}

export interface RemoveTaskNoteInput {
  noteId: string;
  now?: Date;
}

/** RF-6, RF-7: baja lógica de una nota propia (o cualquiera, si es Dirección). */
export async function removeTaskNote(store: DataStore, session: SessionContext, input: RemoveTaskNoteInput): Promise<void> {
  const now = input.now ?? new Date();
  const { note, task } = await loadVisibleNote(store, session, input.noteId);
  if (!canRemoveTaskNote(session, note)) throw forbidden('Solo quien escribió la nota o Dirección pueden retirarla.');
  if (task.status === 'DONE') throw invalidState(DONE_READ_ONLY);

  const removed = await store.removeDeptTaskNote(note.id, session.userId, now.toISOString());
  if (!removed) throw notFound(NOTE_NOT_FOUND);

  await audit(store, {
    initiativeId: task.initiativeId,
    session,
    actionType: 'TASK_NOTE_REMOVED',
    fieldName: 'dept_task_notes',
    oldValue: auditValue(note),
    at: now,
  });
}

export interface TaskNoteRevisionView {
  version: number;
  kind: TaskNoteKind;
  body: string;
  replacedAt: string;
  replacedByName: string;
}

/** Versiones anteriores de una nota vigente, bajo demanda y con las mismas reglas de visibilidad. */
export async function listTaskNoteRevisions(
  store: DataStore,
  session: SessionContext,
  noteId: string,
): Promise<TaskNoteRevisionView[]> {
  const { note } = await loadVisibleNote(store, session, noteId);
  const [revisions, users] = await Promise.all([store.listDeptTaskNoteRevisions(note.id), store.listUsers()]);
  const userName = new Map(users.map((user) => [user.id, user.name]));
  return revisions
    .map((revision) => ({
      version: revision.version,
      kind: revision.kind,
      body: revision.body,
      replacedAt: revision.replacedAt,
      replacedByName: userName.get(revision.replacedBy) ?? 'Persona desconocida',
    }))
    .reverse();
}

// --- Proyección para la interfaz -------------------------------------------------

export interface DeptTaskNoteView {
  id: string;
  kind: TaskNoteKind;
  body: string;
  authorName: string;
  /** Área desde la que escribió, o «Dirección» si escribió desde fuera del área. */
  authorDepartmentLabel: string;
  createdAt: string;
  /** Versión actual: la que hay que mandar al editar. */
  version: number;
  isEdited: boolean;
  editedAt: string | null;
  /** Versiones anteriores guardadas (una por edición). */
  revisionsCount: number;
  isMine: boolean;
  canEdit: boolean;
  canRemove: boolean;
}

export interface TaskNotesProjection {
  /** Vigentes, de la más reciente a la más antigua. */
  notes: DeptTaskNoteView[];
  noteSignal: Exclude<TaskNoteKind, 'UPDATE'> | null;
  noteCount: number;
  /** La última nota es ajena y de las últimas horas (§4.3). */
  hasRecentNote: boolean;
  canAddNote: boolean;
}

/** Notas de una tarea que ya pasó el Need-to-Know de quien consulta. */
export function projectTaskNotes(
  task: DeptTask,
  session: SessionContext,
  notes: readonly DeptTaskNote[],
  userName: Map<string, string>,
  now: Date,
): TaskNotesProjection {
  const active = activeNotesNewestFirst(notes.filter((note) => note.taskId === task.id));
  const writable = task.status !== 'DONE';
  const latest = active[0];
  return {
    notes: active.map((note) => ({
      id: note.id,
      kind: note.kind,
      body: note.body,
      authorName: userName.get(note.authorId) ?? 'Persona retirada',
      authorDepartmentLabel: note.authorDepartment ? DEPARTMENT_LABELS[note.authorDepartment] : 'Dirección',
      createdAt: note.createdAt,
      version: note.version,
      isEdited: note.editedAt !== null,
      editedAt: note.editedAt,
      revisionsCount: note.version - 1,
      isMine: note.authorId === session.userId,
      canEdit: writable && canEditTaskNote(session, note),
      canRemove: writable && canRemoveTaskNote(session, note),
    })),
    // Una tarea hecha ya no espera ni está bloqueada: la tarjeta solo muestra el contador.
    // Las notas siguen intactas en el detalle.
    noteSignal: writable ? taskNoteSignal(active) : null,
    noteCount: active.length,
    hasRecentNote: latest ? isRecentNote(latest, session.userId, now) : false,
    canAddNote: canAddTaskNote(session, task),
  };
}
