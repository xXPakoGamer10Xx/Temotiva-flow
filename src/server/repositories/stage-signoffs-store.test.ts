import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import type { CustomCheck, StageNote, StageSignoff } from '@/domain/types';
import { buildSeedData } from '@/domain/seed';
import { STAGE_ID_BY_KEY } from '@/domain/workflow';
import { makeInitiative, makeTestStore } from '@/server/services/test-utils';
import { InMemoryDataStore } from './in-memory';

vi.mock('server-only', () => ({}));
const { PostgresDataStore } = await import('./postgres');

/** Persistencia de aprobaciones, notas de avance y casillas propias (spec 005, T-03). */

const FEASIBILITY = STAGE_ID_BY_KEY.FEASIBILITY;
const CO_DESIGN = STAGE_ID_BY_KEY.CO_DESIGN;

function signoff(overrides: Partial<StageSignoff> = {}): StageSignoff {
  return {
    initiativeId: 'TEMO-500',
    stageId: FEASIBILITY,
    department: 'LEGAL',
    isApproved: true,
    approvedBy: 'u-rosa',
    approvedAt: '2026-11-26T10:00:00.000Z',
    note: null,
    noObservations: true,
    tshirtSize: null,
    updatedAt: '2026-11-26T10:00:00.000Z',
    ...overrides,
  };
}

function note(overrides: Partial<StageNote> = {}): StageNote {
  return {
    id: 'n-1',
    initiativeId: 'TEMO-500',
    fromStageId: FEASIBILITY,
    toStageId: CO_DESIGN,
    note: 'Viabilidad cerrada con dictamen favorable.',
    authorId: 'u-rosa',
    authorDepartments: ['LEGAL'],
    isOverride: false,
    createdAt: '2026-11-26T11:00:00.000Z',
    ...overrides,
  };
}

function check(overrides: Partial<CustomCheck> = {}): CustomCheck {
  return {
    id: 'cc-1',
    initiativeId: 'TEMO-500',
    stageId: FEASIBILITY,
    label: 'Revisar contrato marco',
    note: null,
    isCompleted: false,
    completedBy: null,
    completedAt: null,
    createdBy: 'u-rosa',
    createdAt: '2026-11-26T09:00:00.000Z',
    isRemoved: false,
    removedBy: null,
    removedAt: null,
    ...overrides,
  };
}

describe('InMemoryDataStore — spec 005', () => {
  it('un snapshot antiguo arranca sin colecciones nuevas y con la fase renombrada', async () => {
    const seed = buildSeedData();
    delete seed.stageSignoffs;
    delete seed.stageNotes;
    delete seed.customChecks;
    seed.stages = seed.stages.map((stage) => (stage.key === 'CO_DESIGN' ? { ...stage, name: 'Co-Diseño' } : stage));
    const store = new InMemoryDataStore(seed);
    expect(await store.listStageNotes()).toEqual([]);
    expect((await store.stageByKey('CO_DESIGN'))?.name).toBe('Diseño');
  });

  it('respeta un nombre de fase puesto a mano', async () => {
    const seed = buildSeedData();
    seed.stages = seed.stages.map((stage) => (stage.key === 'CO_DESIGN' ? { ...stage, name: 'Diseño UX' } : stage));
    expect((await new InMemoryDataStore(seed).stageByKey('CO_DESIGN'))?.name).toBe('Diseño UX');
  });

  it('upsert de aprobación: inserta, reemplaza y sobrevive al snapshot', async () => {
    const { store } = makeTestStore();
    expect(await store.upsertStageSignoff(signoff(), { expectedStageId: FEASIBILITY })).not.toBeNull();
    await store.upsertStageSignoff(signoff({ isApproved: false, approvedBy: null, approvedAt: null }), {
      expectedStageId: FEASIBILITY,
    });
    const restored = new InMemoryDataStore(store.snapshot());
    expect(await restored.listStageSignoffs('TEMO-500')).toEqual([
      signoff({ isApproved: false, approvedBy: null, approvedAt: null }),
    ]);
  });

  it('la aprobación no se escribe fuera de la fase actual ni en iniciativas cerradas', async () => {
    const { store } = makeTestStore([
      makeInitiative(),
      makeInitiative({ id: 'TEMO-501', isArchived: true }),
      makeInitiative({ id: 'TEMO-502', finalizedAt: '2026-11-26T08:00:00.000Z', finalizedBy: 'u-x' }),
    ]);
    expect(await store.upsertStageSignoff(signoff({ stageId: CO_DESIGN }), { expectedStageId: CO_DESIGN })).toBeNull();
    expect(await store.upsertStageSignoff(signoff({ initiativeId: 'TEMO-501' }), { expectedStageId: FEASIBILITY })).toBeNull();
    expect(await store.upsertStageSignoff(signoff({ initiativeId: 'TEMO-502' }), { expectedStageId: FEASIBILITY })).toBeNull();
    expect(await store.listStageSignoffs('TEMO-500')).toEqual([]);
  });

  it('avance con nota: dos avances simultáneos dejan una sola nota', async () => {
    const { store } = makeTestStore();
    const input = { initiativeId: 'TEMO-500', expectedStageId: FEASIBILITY, patch: { currentStageId: CO_DESIGN } };
    const [first, second] = await Promise.all([
      store.advanceInitiativeWithNote({ ...input, note: note() }),
      store.advanceInitiativeWithNote({ ...input, note: note({ id: 'n-2' }) }),
    ]);
    expect([first, second].filter(Boolean)).toHaveLength(1);
    expect((await store.listStageNotes('TEMO-500')).map((item) => item.id)).toEqual(['n-1']);
    expect((await store.initiativeById('TEMO-500'))?.currentStageId).toBe(CO_DESIGN);
  });

  it('casillas propias: alta, marcar, baja lógica', async () => {
    const { store } = makeTestStore();
    await store.insertCustomCheck(check());
    await store.updateCustomCheck('cc-1', { isCompleted: true, completedBy: 'u-rosa', completedAt: '2026-11-26T10:00:00.000Z' });
    await store.updateCustomCheck('cc-1', { isRemoved: true, removedBy: 'u-rosa', removedAt: '2026-11-26T10:30:00.000Z' });
    const [stored] = await store.listCustomChecks('TEMO-500');
    expect(stored).toMatchObject({ isCompleted: true, isRemoved: true, removedBy: 'u-rosa' });
    await expect(store.updateCustomCheck('nope', { isCompleted: true })).rejects.toThrow();
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

describe('PostgresDataStore — spec 005', () => {
  it('la guarda de la aprobación va en la misma sentencia y devuelve null si no ganó', async () => {
    const { pool, calls } = fakePool([{ rows: [], rowCount: 0 }]);
    expect(await new PostgresDataStore(pool).upsertStageSignoff(signoff(), { expectedStageId: FEASIBILITY })).toBeNull();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.sql).toMatch(/current_stage_id = \$11 AND NOT is_archived AND finalized_at IS NULL/);
  });

  it('el avance hace rollback sin insertar nota si la iniciativa ya cambió', async () => {
    const { pool, calls } = fakePool([{ rows: [] }, { rows: [], rowCount: 0 }, { rows: [] }]);
    const result = await new PostgresDataStore(pool).advanceInitiativeWithNote({
      initiativeId: 'TEMO-500',
      expectedStageId: FEASIBILITY,
      patch: { currentStageId: CO_DESIGN },
      note: note(),
    });
    expect(result).toBeNull();
    expect(calls.map((call) => call.sql.trim().split(/\s+/)[0])).toEqual(['BEGIN', 'UPDATE', 'ROLLBACK']);
  });

  it('mapea la aprobación a camelCase', async () => {
    const { pool } = fakePool([
      {
        rows: [
          {
            initiative_id: 'TEMO-500',
            stage_id: FEASIBILITY,
            department: 'TECH',
            is_approved: true,
            approved_by: 'u-victor',
            approved_at: new Date('2026-11-26T10:00:00.000Z'),
            note: null,
            no_observations: false,
            tshirt_size: 'M',
            updated_at: new Date('2026-11-26T10:00:00.000Z'),
          },
        ],
      },
    ]);
    expect(await new PostgresDataStore(pool).listStageSignoffs('TEMO-500')).toEqual([
      signoff({ department: 'TECH', approvedBy: 'u-victor', noObservations: false, tshirtSize: 'M' }),
    ]);
  });
});
