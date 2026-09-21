import { describe, expect, it } from 'vitest';
import { buildSeedData } from '@/domain/seed';
import { InMemoryDataStore } from '@/server/repositories/in-memory';
import { updateInitiative } from './initiatives';
import { getFlowMetrics } from './metrics';
import { getBoardView, getNotifications, getRadarRows } from './views';
import { TEST_NOW, makeSession, makeTestStore } from './test-utils';

/**
 * Caja negra (SEGURIDAD.md §6) y proyecciones de lectura sobre el estado
 * semilla completo.
 */
describe('caja negra', () => {
  it('el store no expone ninguna forma de reescribir ni borrar el log', () => {
    const store = new InMemoryDataStore(buildSeedData(TEST_NOW));
    const surface = Object.getOwnPropertyNames(Object.getPrototypeOf(store));

    expect(surface).toContain('appendActivityLog');
    expect(surface.filter((name) => /activityLog/i.test(name))).toEqual(['listActivityLog', 'appendActivityLog']);
  });

  it('las entradas registradas quedan congeladas', async () => {
    const { store } = makeTestStore();
    const session = makeSession('LEGAL', 'LEAD');

    await updateInitiative(store, session, {
      initiativeId: 'TEMO-500',
      title: 'Título revisado por el comité',
      now: TEST_NOW,
    });

    const [entry] = await store.listActivityLog('TEMO-500');
    expect(entry).toBeDefined();
    const original = await store.appendActivityLog({
      initiativeId: 'TEMO-500',
      userId: session.userId,
      actionType: 'INITIATIVE_UPDATED',
      fromStageId: null,
      toStageId: null,
      fieldName: null,
      oldValue: null,
      newValue: null,
      overrideMetadata: null,
      createdAt: TEST_NOW.toISOString(),
    });

    expect(Object.isFrozen(original)).toBe(true);
  });

  it('una copia devuelta por el store no altera el estado interno', async () => {
    const { store } = makeTestStore();
    const initiative = await store.initiativeById('TEMO-500');
    if (!initiative) throw new Error('iniciativa no encontrada');

    initiative.title = 'Intento de mutación externa';

    expect((await store.initiativeById('TEMO-500'))?.title).not.toBe('Intento de mutación externa');
  });
});

describe('proyecciones de lectura sobre el estado semilla', () => {
  it('el tablero reparte las iniciativas por fase y marca la saturación', async () => {
    const store = new InMemoryDataStore(buildSeedData(TEST_NOW));
    const columns = await getBoardView(store, { now: TEST_NOW });

    expect(columns).toHaveLength(7);
    const total = columns.reduce((count, column) => count + column.cards.length, 0);
    expect(total).toBe((await store.listInitiatives()).length);
    for (const column of columns) {
      expect(column.isSaturated).toBe(column.wipCount > column.wipLimit);
    }
  });

  it('el radar clasifica el estado de flujo de cada iniciativa', async () => {
    const store = new InMemoryDataStore(buildSeedData(TEST_NOW));
    const rows = await getRadarRows(store, { now: TEST_NOW });

    const blocked = rows.find((row) => row.initiativeId === 'TEMO-104');
    expect(blocked?.flowState).toBe('BLOCKED');
    expect(blocked?.stopReason).toBe('ESPERANDO_DECISION');

    const parallel = rows.find((row) => row.initiativeId === 'TEMO-98');
    expect(parallel?.flowState).toBe('PARALLEL');

    const moving = rows.find((row) => row.initiativeId === 'TEMO-109');
    expect(moving?.flowState).toBe('MOVING');
  });

  it('las notificaciones son las solicitudes pendientes del departamento de quien mira', async () => {
    const store = new InMemoryDataStore(buildSeedData(TEST_NOW));
    const { received } = await getNotifications(store, makeSession('PRODUCT', 'LEAD'));

    expect(received.length).toBeGreaterThan(0);
    expect(received.every((item) => item.dependency.targetDepartment === 'PRODUCT')).toBe(true);
    expect(received.every((item) => item.dependency.status === 'PENDING')).toBe(true);
  });

  it('las métricas de dirección no agregan por persona', async () => {
    const store = new InMemoryDataStore(buildSeedData(TEST_NOW));
    const metrics = await getFlowMetrics(store, { now: TEST_NOW });

    expect(metrics.stages).toHaveLength(7);
    expect(metrics.overrides.total).toBeGreaterThan(0);
    expect(metrics.overrides.rate).toBeGreaterThan(0);
    expect(metrics.stopCauses.reduce((total, cause) => total + cause.share, 0)).toBeCloseTo(1, 5);
    expect(metrics.headline.blockedInitiatives).toBeGreaterThan(0);
  });
});
