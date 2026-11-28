import { z } from 'zod';
import { TASK_NOTE_KINDS } from '@/domain/enums';
import { TASK_NOTE_BODY_ERROR, validateTaskNoteBody } from '@/domain/task-note';

/**
 * Esquemas de entrada de las notas de seguimiento (spec 006). Viven fuera del
 * archivo `'use server'` para poder probarlos sin sesión ni Next.
 *
 * El autor, su área y la hora nunca viajan en la entrada: los pone el servidor.
 */

const id = (message: string) => z.string({ error: message }).trim().min(1, message).max(64, message);

/** Mismo criterio que el CHECK de la BD (caracteres, no unidades UTF-16): una sola función en el dominio. */
const noteBodySchema = z
  .string({ error: 'Escribe la nota.' })
  .refine((value) => validateTaskNoteBody(value).ok, TASK_NOTE_BODY_ERROR)
  .transform((value) => value.trim());

const noteKindSchema = z.enum(TASK_NOTE_KINDS, { error: 'Elige el tipo de nota.' });

export const addTaskNoteSchema = z.object({
  taskId: id('La tarea no existe.'),
  kind: noteKindSchema,
  body: noteBodySchema,
});

export const editTaskNoteSchema = z.object({
  noteId: id('La nota no existe.'),
  expectedVersion: z.number({ error: 'Versión de la nota no válida.' }).int('Versión de la nota no válida.').min(1, 'Versión de la nota no válida.'),
  kind: noteKindSchema,
  body: noteBodySchema,
});

export const taskNoteIdSchema = z.object({ noteId: id('La nota no existe.') });
