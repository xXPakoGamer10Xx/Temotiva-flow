import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import type { PushSubscriptionRecord } from '@/domain/push';
import { buildSeedData } from '@/domain/seed';
import { InMemoryDataStore } from './in-memory';

// `postgres.ts` se declara solo-servidor; fuera de Next el marcador lanzaría.
vi.mock('server-only', () => ({}));

const { PostgresDataStore } = await import('./postgres');

/** Persistencia dual de suscripciones push y marcas de SLE (spec 002, T-02). */

const USER_A = '7b1f9c2e-0a31-4d56-9c11-2f4a6d8e0101';
const USER_B = '7b1f9c2e-0a31-4d56-9c11-2f4a6d8e0102';

function makeSub(overrides: Partial<PushSubscriptionRecord> = {}): PushSubscriptionRecord {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    userId: USER_A,
    endpoint: 'https://push.example/device-1',
    p256dh: 'p256dh-key',
    auth: 'auth-secret',
    userAgent: 'Chrome en Android',
    createdAt: '2026-11-08T10:00:00.000Z',
    lastUsedAt: null,
    revokedAt: null,
    ...overrides,
  };
}

function emptyStore(): InMemoryDataStore {
  const seed = buildSeedData();
  delete seed.pushSubscriptions;
  delete seed.sleRiskNotices;
  return new InMemoryDataStore(seed);
}

describe('InMemoryDataStore — suscripciones push', () => {
  it('arranca vacío con una semilla que no trae las colecciones (snapshots anteriores)', async () => {
    const store = emptyStore();
    expect(await store.listActivePushSubscriptions([USER_A, USER_B])).toEqual([]);
    expect(store.snapshot().pushSubscriptions).toEqual([]);
    expect(store.snapshot().sleRiskNotices).toEqual([]);
  });

  it('guarda una suscripción nueva y la encuentra por endpoint', async () => {
    const store = emptyStore();
    const stored = await store.upsertPushSubscription(makeSub());
    expect(stored).toEqual(makeSub());
    expect(await store.pushSubscriptionByEndpoint(makeSub().endpoint)).toEqual(makeSub());
    expect(await store.pushSubscriptionByEndpoint('https://push.example/otro')).toBeNull();
  });

  it('volver a suscribir el mismo dispositivo actualiza la fila y conserva id y fecha de alta', async () => {
    const store = emptyStore();
    await store.upsertPushSubscription(makeSub());
    const again = await store.upsertPushSubscription(
      makeSub({ id: 'otro-id', p256dh: 'nueva', auth: 'nuevo', createdAt: '2026-11-09T10:00:00.000Z' }),
    );
    expect(again.id).toBe(makeSub().id);
    expect(again.createdAt).toBe(makeSub().createdAt);
    expect(again.p256dh).toBe('nueva');
    expect(await store.listActivePushSubscriptions([USER_A])).toHaveLength(1);
  });

  it('si el dispositivo cambia de cuenta, la fila pasa a la nueva persona y se reactiva', async () => {
    const store = emptyStore();
    await store.upsertPushSubscription(makeSub());
    await store.revokePushSubscription(makeSub().endpoint, '2026-11-08T11:00:00.000Z');
    const moved = await store.upsertPushSubscription(makeSub({ userId: USER_B }));
    expect(moved.userId).toBe(USER_B);
    expect(moved.revokedAt).toBeNull();
    expect(await store.listActivePushSubscriptions([USER_A])).toEqual([]);
    expect(await store.listActivePushSubscriptions([USER_B])).toHaveLength(1);
  });

  it('lista solo las activas de las personas pedidas', async () => {
    const store = emptyStore();
    await store.upsertPushSubscription(makeSub());
    await store.upsertPushSubscription(makeSub({ id: 'b', endpoint: 'https://push.example/device-2' }));
    await store.upsertPushSubscription(makeSub({ id: 'c', endpoint: 'https://push.example/device-3', userId: USER_B }));
    await store.revokePushSubscription('https://push.example/device-2', '2026-11-08T11:00:00.000Z');

    const forA = await store.listActivePushSubscriptions([USER_A]);
    expect(forA.map((s) => s.endpoint)).toEqual(['https://push.example/device-1']);
    expect(await store.listActivePushSubscriptions([])).toEqual([]);
  });

  it('la baja es lógica: la fila se conserva con su fecha de baja', async () => {
    const store = emptyStore();
    await store.upsertPushSubscription(makeSub());
    await store.revokePushSubscription(makeSub().endpoint, '2026-11-08T11:00:00.000Z');
    expect((await store.pushSubscriptionByEndpoint(makeSub().endpoint))?.revokedAt).toBe('2026-11-08T11:00:00.000Z');
    expect(store.snapshot().pushSubscriptions).toHaveLength(1);
  });

  it('dar de baja dos veces no cambia la fecha original; un endpoint desconocido no falla', async () => {
    const store = emptyStore();
    await store.upsertPushSubscription(makeSub());
    await store.revokePushSubscription(makeSub().endpoint, '2026-11-08T11:00:00.000Z');
    await store.revokePushSubscription(makeSub().endpoint, '2026-11-08T12:00:00.000Z');
    expect((await store.pushSubscriptionByEndpoint(makeSub().endpoint))?.revokedAt).toBe('2026-11-08T11:00:00.000Z');
    await expect(store.revokePushSubscription('https://push.example/nada', '2026-11-08T12:00:00.000Z')).resolves.toBeUndefined();
  });

  it('registra el último envío correcto', async () => {
    const store = emptyStore();
    await store.upsertPushSubscription(makeSub());
    await store.touchPushSubscription(makeSub().endpoint, '2026-11-08T12:00:00.000Z');
    expect((await store.pushSubscriptionByEndpoint(makeSub().endpoint))?.lastUsedAt).toBe('2026-11-08T12:00:00.000Z');
  });

  it('las copias son defensivas', async () => {
    const store = emptyStore();
    const stored = await store.upsertPushSubscription(makeSub());
    stored.userId = USER_B;
    expect((await store.pushSubscriptionByEndpoint(makeSub().endpoint))?.userId).toBe(USER_A);
  });

  it('avisa del cambio para el snapshot y sobrevive a un reinicio', async () => {
    const store = emptyStore();
    const onChange = vi.fn();
    store.setChangeListener(onChange);
    await store.upsertPushSubscription(makeSub());
    await store.insertSleRiskNotice({ initiativeId: 'TEMO-001', stageId: 2, notifiedAt: '2026-11-08T10:00:00.000Z' });
    expect(onChange).toHaveBeenCalledTimes(2);

    const restored = new InMemoryDataStore(store.snapshot());
    expect(await restored.pushSubscriptionByEndpoint(makeSub().endpoint)).toEqual(makeSub());
    expect(await restored.insertSleRiskNotice({ initiativeId: 'TEMO-001', stageId: 2, notifiedAt: '2026-11-08T11:00:00.000Z' })).toBe(false);
  });
});

describe('InMemoryDataStore — marcas de SLE en riesgo', () => {
  it('la primera marca de una iniciativa y fase se inserta; las siguientes no', async () => {
    const store = emptyStore();
    const notice = { initiativeId: 'TEMO-001', stageId: 2, notifiedAt: '2026-11-08T10:00:00.000Z' };
    expect(await store.insertSleRiskNotice(notice)).toBe(true);
    expect(await store.insertSleRiskNotice({ ...notice, notifiedAt: '2026-11-08T11:00:00.000Z' })).toBe(false);
    expect(await store.insertSleRiskNotice({ ...notice, stageId: 3 })).toBe(true);
    expect(store.snapshot().sleRiskNotices).toHaveLength(2);
  });
});

/** Pool falso: registra cada consulta y responde con las filas preparadas. */
function fakePool(rows: Record<string, unknown>[] = []) {
  const calls: { sql: string; params: unknown[] }[] = [];
  const pool = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      return { rows, rowCount: rows.length };
    }),
  };
  return { pool: pool as unknown as Pool, calls };
}

function nth<T>(list: T[], index: number): T {
  const item = list[index];
  if (item === undefined) throw new Error(`Sin llamada ${index}`);
  return item;
}

const ROW = {
  id: '22222222-2222-4222-8222-222222222222',
  user_id: USER_A,
  endpoint: 'https://push.example/device-1',
  p256dh: 'p256dh-key',
  auth: 'auth-secret',
  user_agent: 'Chrome en Android',
  created_at: new Date('2026-11-08T10:00:00.000Z'),
  last_used_at: null,
  revoked_at: null,
};

describe('PostgresDataStore — suscripciones push', () => {
  it('mapea snake_case a camelCase y las fechas a ISO-8601', async () => {
    const { pool } = fakePool([ROW]);
    expect(await new PostgresDataStore(pool).pushSubscriptionByEndpoint(ROW.endpoint)).toEqual(makeSub());
  });

  it('devuelve null si el endpoint no existe', async () => {
    const { pool } = fakePool([]);
    expect(await new PostgresDataStore(pool).pushSubscriptionByEndpoint('x')).toBeNull();
  });

  it('lista activas por personas con un parámetro de array, y no consulta si no hay personas', async () => {
    const { pool, calls } = fakePool([ROW]);
    const store = new PostgresDataStore(pool);
    expect(await store.listActivePushSubscriptions([])).toEqual([]);
    expect(calls).toHaveLength(0);

    await store.listActivePushSubscriptions([USER_A, USER_B]);
    expect(nth(calls, 0).sql).toMatch(/FROM push_subscriptions/);
    expect(nth(calls, 0).sql).toMatch(/user_id = ANY\(\$1::uuid\[\]\)/);
    expect(nth(calls, 0).sql).toMatch(/revoked_at IS NULL/);
    expect(nth(calls, 0).params).toEqual([[USER_A, USER_B]]);
  });

  it('el alta es un upsert por endpoint que reasigna la persona y reactiva, sin interpolar valores', async () => {
    const { pool, calls } = fakePool([ROW]);
    const stored = await new PostgresDataStore(pool).upsertPushSubscription(makeSub({ userAgent: "O'Brien; DROP" }));
    const { sql, params } = nth(calls, 0);
    expect(sql).toMatch(/INSERT INTO push_subscriptions/);
    expect(sql).toMatch(/ON CONFLICT \(endpoint\) DO UPDATE SET/);
    expect(sql).toMatch(/user_id = EXCLUDED\.user_id/);
    expect(sql).toMatch(/revoked_at = NULL/);
    expect(sql).toMatch(/RETURNING/);
    expect(sql).not.toContain("O'Brien");
    expect(params).toContain("O'Brien; DROP");
    expect(stored).toEqual(makeSub());
  });

  it('la baja solo marca las activas y no borra filas', async () => {
    const { pool, calls } = fakePool();
    await new PostgresDataStore(pool).revokePushSubscription(ROW.endpoint, '2026-11-08T11:00:00.000Z');
    expect(nth(calls, 0).sql).toMatch(/UPDATE push_subscriptions SET revoked_at = \$2/);
    expect(nth(calls, 0).sql).toMatch(/revoked_at IS NULL/);
    expect(nth(calls, 0).sql).not.toMatch(/DELETE/);
    expect(nth(calls, 0).params).toEqual([ROW.endpoint, '2026-11-08T11:00:00.000Z']);
  });

  it('registra el último envío', async () => {
    const { pool, calls } = fakePool();
    await new PostgresDataStore(pool).touchPushSubscription(ROW.endpoint, '2026-11-08T12:00:00.000Z');
    expect(nth(calls, 0).sql).toMatch(/UPDATE push_subscriptions SET last_used_at = \$2 WHERE endpoint = \$1/);
  });
});

describe('PostgresDataStore — marcas de SLE en riesgo', () => {
  it('inserta sin pisar y devuelve si la marca era nueva', async () => {
    const notice = { initiativeId: 'TEMO-001', stageId: 2, notifiedAt: '2026-11-08T10:00:00.000Z' };

    const inserted = fakePool([{ initiative_id: 'TEMO-001' }]);
    expect(await new PostgresDataStore(inserted.pool).insertSleRiskNotice(notice)).toBe(true);
    expect(nth(inserted.calls, 0).sql).toMatch(/INSERT INTO sle_risk_notices/);
    expect(nth(inserted.calls, 0).sql).toMatch(/ON CONFLICT DO NOTHING/);
    expect(nth(inserted.calls, 0).params).toEqual(['TEMO-001', 2, '2026-11-08T10:00:00.000Z']);

    const existing = fakePool([]);
    expect(await new PostgresDataStore(existing.pool).insertSleRiskNotice(notice)).toBe(false);
  });
});
