import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import type { DeptTaskNote, DeptTaskNoteRevision } from '@/domain/task-note';
import type { DeptTask } from '@/domain/types';
import { buildSeedData } from '@/domain/seed';
import { MAX_TASK_DESCRIPTION } from '@/domain/rules';
import { InMemoryDataStore } from './in-memory';

vi.mock('server-only', () => ({}));
const { PostgresDataStore } = await import('./postgres');

/** Persistencia de las notas de seguimiento de tareas (spec 006, T-03). */

function note(overrides: Partial<DeptTaskNote> = {}): DeptTaskNote {
  return {
    id: 'n-1',
    taskId: 't-1',
    kind: 'WAITING',
    body: 'Esperando la validación de Legal.',
    authorId: 'u-ana',
    authorDepartment: 'TECH',
    createdAt: '2026-11-27T10:00:00.000Z',
    version: 1,
    editedAt: null,
    editedBy: null,
    isRemoved: false,
    removedBy: null,
    removedAt: null,
    ...overrides,
  };
}

function revisionOf(current: DeptTaskNote, overrides: Partial<DeptTaskNoteRevision> = {}): DeptTaskNoteRevision {
  return {
    id: `r-${current.id}-${current.version}`,
    noteId: current.id,
    version: current.version,
    kind: current.kind,
    body: current.body,
    replacedBy: 'u-ana',
    replacedAt: '2026-11-27T11:00:00.000Z',
    ...overrides,
  };
}

const EDIT = { kind: 'UPDATE' as const, body: 'Ya llegó la validación.', editedAt: '2026-11-27T11:00:00.000Z', editedBy: 'u-ana' };

function emptyStore(): InMemoryDataStore {
  return new InMemoryDataStore({ ...buildSeedData(), deptTaskNotes: [], deptTaskNoteRevisions: [] });
}

describe('InMemoryDataStore — notas de tarea', () => {
  it('un snapshot anterior a la spec 006 arranca sin notas', async () => {
    const seed = buildSeedData();
    delete seed.deptTaskNotes;
    delete seed.deptTaskNoteRevisions;
    const store = new InMemoryDataStore(seed);
    expect(await store.listDeptTaskNotes()).toEqual([]);
    expect(await store.listDeptTaskNoteRevisions('n-1')).toEqual([]);
  });

  it('lista en orden cronológico, filtra por tarea y devuelve copias', async () => {
    const store = emptyStore();
    await store.insertDeptTaskNote(note({ id: 'n-2', createdAt: '2026-11-27T12:00:00.000Z' }));
    await store.insertDeptTaskNote(note({ id: 'n-1' }));
    await store.insertDeptTaskNote(note({ id: 'n-3', taskId: 't-2' }));
    expect((await store.listDeptTaskNotes('t-1')).map((n) => n.id)).toEqual(['n-1', 'n-2']);
    const [first] = await store.listDeptTaskNotes('t-1');
    first!.body = 'mutada';
    expect((await store.deptTaskNoteById('n-1'))?.body).toBe('Esperando la validación de Legal.');
    await expect(store.insertDeptTaskNote(note({ id: 'n-1' }))).rejects.toThrow();
  });

  it('editar guarda la versión anterior y sube la versión', async () => {
    const store = emptyStore();
    const original = await store.insertDeptTaskNote(note());
    const edited = await store.editDeptTaskNote('n-1', 1, EDIT, revisionOf(original));
    expect(edited).toMatchObject({ kind: 'UPDATE', body: 'Ya llegó la validación.', version: 2, editedBy: 'u-ana' });
    expect(await store.listDeptTaskNoteRevisions('n-1')).toEqual([revisionOf(original)]);
  });

  it('dos ediciones con la misma versión: solo gana una (RF-8)', async () => {
    const store = emptyStore();
    const original = await store.insertDeptTaskNote(note());
    const [a, b] = await Promise.all([
      store.editDeptTaskNote('n-1', 1, EDIT, revisionOf(original, { id: 'r-a' })),
      store.editDeptTaskNote('n-1', 1, { ...EDIT, body: 'Otra versión.' }, revisionOf(original, { id: 'r-b' })),
    ]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    expect(await store.listDeptTaskNoteRevisions('n-1')).toHaveLength(1);
  });

  it('no edita una nota retirada ni una que no existe', async () => {
    const store = emptyStore();
    const original = await store.insertDeptTaskNote(note());
    expect(await store.removeDeptTaskNote('n-1', 'u-ana', '2026-11-27T11:00:00.000Z')).toMatchObject({ isRemoved: true });
    expect(await store.editDeptTaskNote('n-1', 1, EDIT, revisionOf(original))).toBeNull();
    expect(await store.editDeptTaskNote('nope', 1, EDIT, revisionOf(original))).toBeNull();
    expect(await store.listDeptTaskNoteRevisions('n-1')).toEqual([]);
  });

  it('retirar es baja lógica y solo una vez', async () => {
    const store = emptyStore();
    await store.insertDeptTaskNote(note());
    expect(await store.removeDeptTaskNote('n-1', 'u-ana', '2026-11-27T11:00:00.000Z')).not.toBeNull();
    expect(await store.removeDeptTaskNote('n-1', 'u-ana', '2026-11-27T11:05:00.000Z')).toBeNull();
    expect(await store.deptTaskNoteById('n-1')).toMatchObject({ isRemoved: true, removedAt: '2026-11-27T11:00:00.000Z' });
  });

  it('el snapshot incluye notas y revisiones', async () => {
    const store = emptyStore();
    const original = await store.insertDeptTaskNote(note());
    await store.editDeptTaskNote('n-1', 1, EDIT, revisionOf(original));
    const restored = new InMemoryDataStore(store.snapshot());
    expect(await restored.deptTaskNoteById('n-1')).toMatchObject({ version: 2 });
    expect(await restored.listDeptTaskNoteRevisions('n-1')).toHaveLength(1);
  });

  it('una descripción de tarea de 5 000 caracteres se relee entera (RF-14)', async () => {
    const store = emptyStore();
    const long = 'x'.repeat(MAX_TASK_DESCRIPTION);
    const task: DeptTask = {
      id: 't-long',
      title: 'Tarea larga',
      description: long,
      department: 'TECH',
      status: 'TODO',
      assigneeId: null,
      initiativeId: null,
      dueDate: null,
      createdBy: 'u-ana',
      createdAt: '2026-11-27T10:00:00.000Z',
      updatedAt: '2026-11-27T10:00:00.000Z',
      isArchived: false,
      code: null,
      estimatedHours: null,
      sprintId: null,
      pullRequest: null,
    };
    await store.insertDeptTask(task);
    expect((await new InMemoryDataStore(store.snapshot()).deptTaskById('t-long'))?.description).toHaveLength(5000);
  });
});

function fakePool(responses: { rows: Record<string, unknown>[]; rowCount?: number }[]) {
  const calls: { sql: string; params: unknown[] }[] = [];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    return responses.shift() ?? { rows: [], rowCount: 0 };
  });
  const client = { query, release: vi.fn() };
  const pool = { query, connect: vi.fn(async () => client) };
  return { pool: pool as unknown as Pool, calls };
}

const NOTE_ROW = {
  id: 'n-1',
  task_id: 't-1',
  kind: 'UPDATE',
  body: 'Ya llegó la validación.',
  author_id: 'u-ana',
  author_department: null,
  created_at: new Date('2026-11-27T10:00:00.000Z'),
  version: 2,
  edited_at: new Date('2026-11-27T11:00:00.000Z'),
  edited_by: 'u-ana',
  is_removed: false,
  removed_by: null,
  removed_at: null,
};

describe('PostgresDataStore — notas de tarea', () => {
  it('la edición hace rollback sin guardar revisión si la versión ya cambió', async () => {
    const { pool, calls } = fakePool([{ rows: [] }, { rows: [], rowCount: 0 }, { rows: [] }]);
    expect(await new PostgresDataStore(pool).editDeptTaskNote('n-1', 1, EDIT, revisionOf(note()))).toBeNull();
    expect(calls.map((call) => call.sql.trim().split(/\s+/)[0])).toEqual(['BEGIN', 'UPDATE', 'ROLLBACK']);
    expect(calls[1]?.sql).toMatch(/WHERE id = \$1 AND version = \$2 AND NOT is_removed/);
  });

  it('la edición actualiza e inserta la revisión en la misma transacción', async () => {
    const { pool, calls } = fakePool([{ rows: [] }, { rows: [NOTE_ROW], rowCount: 1 }, { rows: [] }, { rows: [] }]);
    const result = await new PostgresDataStore(pool).editDeptTaskNote('n-1', 1, EDIT, revisionOf(note()));
    expect(calls.map((call) => call.sql.trim().split(/\s+/)[0])).toEqual(['BEGIN', 'UPDATE', 'INSERT', 'COMMIT']);
    expect(result).toMatchObject({ id: 'n-1', version: 2, authorDepartment: null, editedAt: '2026-11-27T11:00:00.000Z' });
  });

  it('la retirada lleva el guard en la misma sentencia', async () => {
    const { pool, calls } = fakePool([{ rows: [], rowCount: 0 }]);
    expect(await new PostgresDataStore(pool).removeDeptTaskNote('n-1', 'u-ana', '2026-11-27T11:00:00.000Z')).toBeNull();
    expect(calls[0]?.sql).toMatch(/WHERE id = \$1 AND NOT is_removed/);
  });
});
