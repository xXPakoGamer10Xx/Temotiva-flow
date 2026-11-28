/**
 * Notas de seguimiento de las tareas de área (spec 006).
 *
 * Espejo de `dept_task_notes` y `dept_task_note_revisions`
 * (`db/13-dept-task-notes.sql`). Las notas se acumulan en orden cronológico:
 * añadir una nunca sobrescribe otra. Editar guarda antes la versión anterior y
 * retirar es baja lógica.
 */

import type { Department, TaskNoteKind, TaskStatus } from './enums';
import { MAX_TASK_NOTE, MIN_TASK_NOTE, TASK_NOTE_RECENT_HOURS } from './rules';

export interface DeptTaskNote {
  id: string;
  taskId: string;
  kind: TaskNoteKind;
  body: string;
  authorId: string;
  /** Área desde la que escribe; `null` = Dirección fuera del área de la tarea. */
  authorDepartment: Department | null;
  createdAt: string;
  /** Sube en cada edición; guarda contra ediciones concurrentes. */
  version: number;
  editedAt: string | null;
  editedBy: string | null;
  isRemoved: boolean;
  removedBy: string | null;
  removedAt: string | null;
}

/** Versión reemplazada de una nota. Nunca se actualiza ni se borra. */
export interface DeptTaskNoteRevision {
  id: string;
  noteId: string;
  /** La versión que fue reemplazada. */
  version: number;
  kind: TaskNoteKind;
  body: string;
  replacedBy: string;
  replacedAt: string;
}

/** Estados en los que se pueden añadir notas (P-3). En «Hecha» son de solo lectura. */
export const TASK_NOTE_OPEN_STATUSES: readonly TaskStatus[] = ['TODO', 'DOING', 'REVIEW'];

export const TASK_NOTE_BODY_ERROR = `La nota debe tener entre ${MIN_TASK_NOTE} y ${MAX_TASK_NOTE} caracteres.`;

/**
 * Longitud como la cuenta PostgreSQL (`char_length`): por caracteres, no por
 * unidades UTF-16, para que un emoji no haga pasar en el servidor lo que el
 * CHECK rechazaría.
 */
export function noteLength(text: string): number {
  return [...text].length;
}

/** Única validación del texto de una nota, compartida por Zod y el servicio. */
export function validateTaskNoteBody(raw: string): { ok: true; value: string } | { ok: false; message: string } {
  const value = raw.trim();
  const length = noteLength(value);
  if (length < MIN_TASK_NOTE || length > MAX_TASK_NOTE) return { ok: false, message: TASK_NOTE_BODY_ERROR };
  return { ok: true, value };
}

/** Notas vigentes, de la más reciente a la más antigua. */
export function activeNotesNewestFirst(notes: readonly DeptTaskNote[]): DeptTaskNote[] {
  return notes
    .filter((note) => !note.isRemoved)
    .sort((a, b) => (a.createdAt === b.createdAt ? b.id.localeCompare(a.id) : b.createdAt.localeCompare(a.createdAt)));
}

/**
 * Señal de la tarea: el tipo de la última nota vigente si es una espera o un
 * bloqueo. Una nota de seguimiento posterior la despeja. Es solo informativa:
 * nunca toca el bloqueo de la iniciativa ni su SLE.
 */
export function taskNoteSignal(notes: readonly DeptTaskNote[]): Exclude<TaskNoteKind, 'UPDATE'> | null {
  const latest = activeNotesNewestFirst(notes)[0];
  return latest && latest.kind !== 'UPDATE' ? latest.kind : null;
}

/** ¿Es una nota ajena de las últimas `TASK_NOTE_RECENT_HOURS` horas? Las propias nunca son «nuevas». */
export function isRecentNote(note: DeptTaskNote, viewerId: string, now: Date): boolean {
  if (note.authorId === viewerId) return false;
  const age = now.getTime() - new Date(note.createdAt).getTime();
  return age >= 0 && age <= TASK_NOTE_RECENT_HOURS * 60 * 60 * 1000;
}
