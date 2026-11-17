import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import type { DeptTaskReadCycle } from '@/domain/task-read';
import { buildSeedData } from '@/domain/seed';
import { InMemoryDataStore } from './in-memory';

vi.mock('server-only', () => ({}));
const { PostgresDataStore } = await import('./postgres');

/** Persistencia de los ciclos de lectura (spec 003, T-02). */

function cycle(overrides: Partial<DeptTaskReadCycle> = {}): DeptTaskReadCycle {
  return {
    id: 'c-1',
    taskId: 't-1',
    assigneeId: 'u-ana',
    assignedAt: '2026-11-13T10:00:00.000Z',
    readAt: null,
    readSource: null,
    resolvedAt: null,
    closedAt: null,
    ...overrides,
  };
}

describe('InMemoryDataStore — ciclos de lectura', () => {
  it('un snapshot sin la colección arranca vacío (CA-11)', async () => {
    const seed = buildSeedData();
    delete seed.deptTaskReads;
    expect(await new InMemoryDataStore(seed).listDeptTaskReads()).toEqual([]);
  });

  it('abre, lista por tarea y sobrevive al snapshot', async () => {
    const store = new InMemoryDataStore();
    await store.openDeptTaskRead(cycle());
    await store.openDeptTaskRead(cycle({ id: 'c-2', taskId: 't-2' }));
    expect((await store.listDeptTaskReads('t-1')).map((c) => c.id)).toEqual(['c-1']);
    const restored = new InMemoryDataStore(store.snapshot());
    expect(await restored.listDeptTaskReads()).toHaveLength(2);
  });

  it('nunca deja dos ciclos abiertos en la misma tarea (RF-02)', async () => {
    const store = new InMemoryDataStore();
    await store.openDeptTaskRead(cycle());
    await expect(store.openDeptTaskRead(cycle({ id: 'c-2' }))).rejects.toThrow();
    await store.updateDeptTaskRead('c-1', { closedAt: '2026-11-13T11:00:00.000Z' });
    await expect(store.openDeptTaskRead(cycle({ id: 'c-2' }))).resolves.toMatchObject({ id: 'c-2' });
  });

  it('el guard `unread` no pisa una lectura ya hecha', async () => {
    const store = new InMemoryDataStore();
    await store.openDeptTaskRead(cycle());
    const first = await store.updateDeptTaskRead('c-1', { readAt: '2026-11-13T10:05:00.000Z', readSource: 'MANUAL' }, { unread: true });
    expect(first?.readSource).toBe('MANUAL');
    const second = await store.updateDeptTaskRead('c-1', { readAt: '2026-11-13T10:09:00.000Z', readSource: 'AUTO' }, { unread: true });
    expect(second).toBeNull();
    expect((await store.listDeptTaskReads('t-1'))[0]).toMatchObject({ readAt: '2026-11-13T10:05:00.000Z', readSource: 'MANUAL' });
    await expect(store.updateDeptTaskRead('missing', { closedAt: null })).rejects.toThrow();
  });
});

function fakePool(responses: { rows: Record<string, unknown>[] }[]) {
  const calls: { sql: string; params: unknown[] }[] = [];
  const pool = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      return responses.shift() ?? { rows: [] };
    }),
  };
  return { pool: pool as unknown as Pool, calls };
}

const ROW = {
  id: 'c-1',
  task_id: 't-1',
  assignee_id: 'u-ana',
  assigned_at: new Date('2026-11-13T10:00:00.000Z'),
  read_at: new Date('2026-11-13T10:05:00.000Z'),
  read_source: 'AUTO',
  resolved_at: null,
  closed_at: null,
};

describe('PostgresDataStore — ciclos de lectura', () => {
  it('mapea la fila a camelCase e ISO', async () => {
    const { pool } = fakePool([{ rows: [ROW] }]);
    expect(await new PostgresDataStore(pool).listDeptTaskReads('t-1')).toEqual([
      cycle({ readAt: '2026-11-13T10:05:00.000Z', readSource: 'AUTO' }),
    ]);
  });

  it('inserta parametrizado', async () => {
    const { pool, calls } = fakePool([{ rows: [] }]);
    await new PostgresDataStore(pool).openDeptTaskRead(cycle());
    expect(calls[0]?.sql).toMatch(/INSERT INTO dept_task_reads/);
    expect(calls[0]?.params).toEqual(['c-1', 't-1', 'u-ana', '2026-11-13T10:00:00.000Z', null, null, null, null]);
  });

  it('el guard `unread` va en el mismo UPDATE y devuelve null si no ganó', async () => {
    const { pool, calls } = fakePool([{ rows: [] }, { rows: [{ '?column?': 1 }] }]);
    const result = await new PostgresDataStore(pool).updateDeptTaskRead(
      'c-1',
      { readAt: '2026-11-13T10:05:00.000Z', readSource: 'MANUAL' },
      { unread: true },
    );
    expect(result).toBeNull();
    expect(calls[0]?.sql).toMatch(/WHERE id = \$1 AND \(NOT \$10::boolean OR read_at IS NULL\)/);
    expect(calls[0]?.params.at(-1)).toBe(true);
  });

  it('lanza si el ciclo no existe', async () => {
    const { pool } = fakePool([{ rows: [] }, { rows: [] }]);
    await expect(new PostgresDataStore(pool).updateDeptTaskRead('x', { closedAt: null })).rejects.toThrow();
  });
});
