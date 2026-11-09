import { describe, expect, it } from 'vitest';
import type { PushSubscriptionRecord } from '@/domain/push';
import { anonymizeUser, setAccessActive } from './access';
import { TEST_NOW, makeTestStore, makeUser, sessionOf } from './test-utils';

/** Bajas de acceso y supresión frente a los dispositivos con avisos (spec 002, SEGURIDAD.md §5.3). */

const director = makeUser({ name: 'Dirección', role: 'EXECUTIVE', departments: ['PRODUCT'] });

function device(userId: string, id: string, overrides: Partial<PushSubscriptionRecord> = {}): PushSubscriptionRecord {
  return {
    id,
    userId,
    endpoint: `https://fcm.googleapis.com/fcm/send/${id}`,
    p256dh: 'clave-publica',
    auth: 'secreto-auth',
    userAgent: 'Chrome en Android',
    createdAt: TEST_NOW.toISOString(),
    lastUsedAt: null,
    revokedAt: null,
    ...overrides,
  };
}

describe('dispositivos con avisos al revocar acceso o anonimizar', () => {
  it('revocar el acceso da de baja todos los dispositivos de esa persona y de nadie más', async () => {
    const leaving = makeUser({ departments: ['HR'], isActive: true });
    const staying = makeUser({ departments: ['HR'], isActive: true });
    const { store } = makeTestStore([], [director, leaving, staying]);
    await store.upsertPushSubscription(device(leaving.id, 'movil'));
    await store.upsertPushSubscription(device(leaving.id, 'portatil'));
    await store.upsertPushSubscription(device(staying.id, 'otro'));

    await setAccessActive(store, sessionOf(director), { userId: leaving.id, isActive: false });

    expect(await store.listActivePushSubscriptions([leaving.id])).toEqual([]);
    expect(await store.listActivePushSubscriptions([staying.id])).toHaveLength(1);
  });

  it('dar acceso de nuevo no reactiva dispositivos antiguos', async () => {
    const person = makeUser({ departments: ['HR'], isActive: false });
    const { store } = makeTestStore([], [director, person]);
    await store.upsertPushSubscription(device(person.id, 'movil', { revokedAt: TEST_NOW.toISOString() }));

    await setAccessActive(store, sessionOf(director), { userId: person.id, isActive: true });

    expect(await store.listActivePushSubscriptions([person.id])).toEqual([]);
  });

  it('anonimizar conserva la fila de cada dispositivo pero sin endpoint, claves ni user-agent', async () => {
    const person = makeUser({ departments: ['HR'], isActive: false });
    const { store } = makeTestStore([], [director, person]);
    const original = device(person.id, 'movil', { revokedAt: TEST_NOW.toISOString() });
    await store.upsertPushSubscription(original);
    await store.upsertPushSubscription(device(person.id, 'portatil'));

    await anonymizeUser(store, sessionOf(director), { userId: person.id, reason: 'Ejercicio del derecho de supresión.' });

    expect(await store.pushSubscriptionByEndpoint(original.endpoint)).toBeNull();
    expect(await store.listActivePushSubscriptions([person.id])).toEqual([]);
    const kept = Object.values(store.snapshot().pushSubscriptions ?? []).filter((sub) => sub.userId === person.id);
    expect(kept).toHaveLength(2);
    for (const sub of kept) {
      expect(sub).toMatchObject({ p256dh: '', auth: '', userAgent: null });
      expect(sub.revokedAt).not.toBeNull();
      expect(sub.endpoint).toMatch(/^anonymized:/);
      expect(JSON.stringify(sub)).not.toMatch(/fcm\.googleapis|secreto-auth|Chrome/);
    }
  });
});
