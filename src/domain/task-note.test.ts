import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ACTION_TYPES, TASK_NOTE_KINDS } from './enums';
import { ACTION_TYPE_LABELS, TASK_NOTE_KIND_GLYPHS, TASK_NOTE_KIND_LABELS } from './labels';
import { MAX_TASK_DESCRIPTION, MAX_TASK_NOTE, MIN_TASK_NOTE, TASK_NOTE_RECENT_HOURS } from './rules';
import {
  type DeptTaskNote,
  TASK_NOTE_BODY_ERROR,
  activeNotesNewestFirst,
  isRecentNote,
  noteLength,
  taskNoteSignal,
  validateTaskNoteBody,
} from './task-note';

/** Contrato de dominio de la spec 006 (T-02). */

const HOUR = 60 * 60 * 1000;

function note(overrides: Partial<DeptTaskNote> & Pick<DeptTaskNote, 'id' | 'createdAt'>): DeptTaskNote {
  return {
    taskId: 'task-1',
    kind: 'UPDATE',
    body: 'Nota de prueba',
    authorId: 'user-a',
    authorDepartment: 'TECH',
    version: 1,
    editedAt: null,
    editedBy: null,
    isRemoved: false,
    removedBy: null,
    removedAt: null,
    ...overrides,
  };
}

describe('validateTaskNoteBody (RF-3)', () => {
  it.each([
    ['ab', false],
    ['abc', true],
    ['   abc   ', true],
    ['      ', false],
    ['a'.repeat(MAX_TASK_NOTE), true],
    ['a'.repeat(MAX_TASK_NOTE + 1), false],
  ])('%j → válida: %s', (raw, valid) => {
    expect(validateTaskNoteBody(raw).ok).toBe(valid);
  });

  it('devuelve el texto recortado y el mensaje en español', () => {
    expect(validateTaskNoteBody('  hola \n')).toEqual({ ok: true, value: 'hola' });
    expect(validateTaskNoteBody('x')).toEqual({ ok: false, message: TASK_NOTE_BODY_ERROR });
  });

  it('cuenta caracteres como PostgreSQL, no unidades UTF-16', () => {
    // «👍a» son 3 unidades UTF-16 pero 2 caracteres: el CHECK de la BD la rechazaría.
    expect(noteLength('👍a')).toBe(2);
    expect(validateTaskNoteBody('👍a').ok).toBe(false);
    expect(validateTaskNoteBody('👍'.repeat(MAX_TASK_NOTE)).ok).toBe(true);
  });
});

describe('taskNoteSignal (§4.1)', () => {
  it('sin notas no hay señal', () => {
    expect(taskNoteSignal([])).toBeNull();
  });

  it('la última nota vigente decide, sin importar el orden de entrada', () => {
    const notes = [
      note({ id: 'b', createdAt: '2026-11-20T10:00:00.000Z', kind: 'BLOCKED' }),
      note({ id: 'a', createdAt: '2026-11-20T09:00:00.000Z', kind: 'UPDATE' }),
    ];
    expect(taskNoteSignal(notes)).toBe('BLOCKED');
  });

  it('una nota de seguimiento posterior despeja la espera', () => {
    const notes = [
      note({ id: 'a', createdAt: '2026-11-20T09:00:00.000Z', kind: 'WAITING' }),
      note({ id: 'b', createdAt: '2026-11-20T10:00:00.000Z', kind: 'UPDATE' }),
    ];
    expect(taskNoteSignal(notes)).toBeNull();
  });

  it('retirar la nota que causaba la señal la recalcula con las restantes', () => {
    const notes = [
      note({ id: 'a', createdAt: '2026-11-20T09:00:00.000Z', kind: 'WAITING' }),
      note({ id: 'b', createdAt: '2026-11-20T10:00:00.000Z', kind: 'BLOCKED', isRemoved: true, removedBy: 'x', removedAt: 'y' }),
    ];
    expect(taskNoteSignal(notes)).toBe('WAITING');
  });

  it('ordena de la más reciente a la más antigua y deja fuera las retiradas', () => {
    const notes = [
      note({ id: 'a', createdAt: '2026-11-20T09:00:00.000Z' }),
      note({ id: 'c', createdAt: '2026-11-20T11:00:00.000Z', isRemoved: true, removedBy: 'x', removedAt: 'y' }),
      note({ id: 'b', createdAt: '2026-11-20T10:00:00.000Z' }),
    ];
    expect(activeNotesNewestFirst(notes).map((n) => n.id)).toEqual(['b', 'a']);
  });
});

describe('isRecentNote (§4.3)', () => {
  const now = new Date('2026-11-27T12:00:00.000Z');

  it('una nota ajena dentro de la ventana es nueva; fuera, no', () => {
    const fresh = note({ id: 'a', createdAt: new Date(now.getTime() - HOUR).toISOString() });
    const old = note({ id: 'b', createdAt: new Date(now.getTime() - (TASK_NOTE_RECENT_HOURS + 1) * HOUR).toISOString() });
    expect(isRecentNote(fresh, 'viewer', now)).toBe(true);
    expect(isRecentNote(old, 'viewer', now)).toBe(false);
  });

  it('las notas propias nunca son nuevas', () => {
    const own = note({ id: 'a', createdAt: now.toISOString(), authorId: 'viewer' });
    expect(isRecentNote(own, 'viewer', now)).toBe(false);
  });
});

describe('contrato con la migración y las etiquetas', () => {
  const sql = readFileSync(join(process.cwd(), 'db', '13-dept-task-notes.sql'), 'utf8');

  it('los límites del texto coinciden con el CHECK', () => {
    expect(sql).toContain(`BETWEEN ${MIN_TASK_NOTE} AND ${MAX_TASK_NOTE}`);
  });

  it('los tipos coinciden con el CHECK', () => {
    expect(sql).toContain(`kind IN (${TASK_NOTE_KINDS.map((kind) => `'${kind}'`).join(', ')})`);
  });

  it('los eventos nuevos existen y tienen etiqueta', () => {
    for (const action of ['TASK_NOTE_ADDED', 'TASK_NOTE_EDITED', 'TASK_NOTE_REMOVED'] as const) {
      expect(ACTION_TYPES).toContain(action);
      expect(ACTION_TYPE_LABELS[action]).toBeTruthy();
    }
  });

  it('cada tipo tiene etiqueta y solo espera y bloqueo llevan pictograma', () => {
    for (const kind of TASK_NOTE_KINDS) expect(TASK_NOTE_KIND_LABELS[kind]).toBeTruthy();
    expect(TASK_NOTE_KIND_GLYPHS).toEqual({ UPDATE: null, WAITING: '⏳', BLOCKED: '⛔' });
  });

  it('la descripción de tarea admite 5 000 caracteres (P-5)', () => {
    expect(MAX_TASK_DESCRIPTION).toBe(5000);
  });
});
