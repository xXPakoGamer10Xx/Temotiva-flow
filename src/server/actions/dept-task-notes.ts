'use server';

import {
  type TaskNoteRevisionView,
  addTaskNote,
  editTaskNote,
  listTaskNoteRevisions,
  removeTaskNote,
} from '@/server/services/dept-task-notes';
import { addTaskNoteSchema, editTaskNoteSchema, taskNoteIdSchema } from './dept-task-notes-schemas';
import { type ActionResult, runAction } from './shared';

/** Spec 006: notas de seguimiento de las tareas. Permisos y reglas, en el servicio. */

export async function addTaskNoteAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction({
    schema: addTaskNoteSchema,
    input,
    handler: async ({ store, session, input: data }) => ({ id: (await addTaskNote(store, session, data)).id }),
  });
}

export async function editTaskNoteAction(input: unknown): Promise<ActionResult<undefined>> {
  return runAction({
    schema: editTaskNoteSchema,
    input,
    handler: async ({ store, session, input: data }) => {
      await editTaskNote(store, session, data);
      return undefined;
    },
  });
}

export async function removeTaskNoteAction(input: unknown): Promise<ActionResult<undefined>> {
  return runAction({
    schema: taskNoteIdSchema,
    input,
    handler: async ({ store, session, input: data }) => {
      await removeTaskNote(store, session, data);
      return undefined;
    },
  });
}

/** Versiones anteriores de una nota, bajo demanda. Solo lectura: no revalida. */
export async function listTaskNoteRevisionsAction(input: unknown): Promise<ActionResult<TaskNoteRevisionView[]>> {
  return runAction({
    schema: taskNoteIdSchema,
    input,
    revalidate: false,
    handler: async ({ store, session, input: data }) => listTaskNoteRevisions(store, session, data.noteId),
  });
}
