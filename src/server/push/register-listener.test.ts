import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PushMessage, PushSubscriptionRecord } from '@/domain/push';
import { audit } from '@/server/services/audit';
import type { PushDeliveryResult, PushSender } from '@/server/services/push';
import { TEST_NOW, makeInitiative, makeTestStore, makeUser, sessionOf } from '@/server/services/test-utils';

vi.mock('server-only', () => ({}));

// Fuera de una petición de Next, `after()` lanza: se simula para probar el respaldo.
const afterMock = vi.fn((_job: () => Promise<void>): void => {
  throw new Error('`after` was called outside a request scope.');
});
vi.mock('next/server', () => ({ after: (job: () => Promise<void>) => afterMock(job) }));

const { registerPushListener, unregisterPushListenerForTests } = await import('./register-listener');

/** Registro del despachador push como oyente de la caja negra (spec 002, T-07). */

class FakePushSender implements PushSender {
  readonly sent: { endpoint: string; message: PushMessage }[] = [];
  async send(sub: PushSubscriptionRecord, payload: string): Promise<PushDeliveryResult> {
    this.sent.push({ endpoint: sub.endpoint, message: JSON.parse(payload) as PushMessage });
    return 'ok';
  }
}

afterEach(() => {
  unregisterPushListenerForTests();
  afterMock.mockClear();
});

async function scenario() {
  const legal = makeUser({ departments: ['LEGAL'], role: 'MEMBER' });
  const tech = makeUser({ departments: ['TECH'], role: 'LEAD' });
  const { store } = makeTestStore([makeInitiative()], [legal, tech]);
  await store.upsertPushSubscription({
    id: 'sub',
    userId: legal.id,
    endpoint: 'https://push.example/legal',
    p256dh: 'k',
    auth: 'a',
    userAgent: null,
    createdAt: TEST_NOW.toISOString(),
    lastUsedAt: null,
    revokedAt: null,
  });
  return { store, legal, tech };
}

/** Espera a que terminen las promesas lanzadas en segundo plano. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('registerPushListener', () => {
  it('sin emisor (sin claves VAPID) no registra nada', async () => {
    expect(registerPushListener(null)).toBe(false);
    const { store, tech } = await scenario();
    await audit(store, { initiativeId: 'TEMO-500', session: sessionOf(tech), actionType: 'BLOCKED_SET', at: TEST_NOW });
    expect(afterMock).not.toHaveBeenCalled();
  });

  it('con emisor, un evento de la caja negra acaba en un push al destinatario', async () => {
    const sender = new FakePushSender();
    expect(registerPushListener(sender)).toBe(true);
    const { store, tech } = await scenario();

    await audit(store, { initiativeId: 'TEMO-500', session: sessionOf(tech), actionType: 'BLOCKED_SET', at: TEST_NOW });
    await flush();

    expect(sender.sent).toEqual([
      { endpoint: 'https://push.example/legal', message: expect.objectContaining({ kind: 'BLOCKED' }) },
    ]);
  });

  it('dentro de una petición delega en after(); fuera de ella, envía en segundo plano', async () => {
    const sender = new FakePushSender();
    registerPushListener(sender);
    const { store, tech } = await scenario();

    afterMock.mockImplementationOnce((job) => {
      void job();
    });
    await audit(store, { initiativeId: 'TEMO-500', session: sessionOf(tech), actionType: 'BLOCKED_SET', at: TEST_NOW });
    await flush();

    expect(afterMock).toHaveBeenCalledTimes(1);
    expect(sender.sent).toHaveLength(1);
  });

  it('es idempotente: registrar dos veces no duplica avisos', async () => {
    const sender = new FakePushSender();
    registerPushListener(sender);
    registerPushListener(sender);
    const { store, tech } = await scenario();

    await audit(store, { initiativeId: 'TEMO-500', session: sessionOf(tech), actionType: 'BLOCKED_SET', at: TEST_NOW });
    await flush();
    expect(sender.sent).toHaveLength(1);
  });

  it('un fallo del despacho no rompe audit() y se registra sin datos', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const broken: PushSender = {
      send: () => {
        throw new Error('https://push.example/legal');
      },
    };
    registerPushListener(broken);
    const { store, tech } = await scenario();

    await expect(
      audit(store, { initiativeId: 'TEMO-500', session: sessionOf(tech), actionType: 'BLOCKED_SET', at: TEST_NOW }),
    ).resolves.toMatchObject({ actionType: 'BLOCKED_SET' });
    await flush();
    expect(JSON.stringify(error.mock.calls)).not.toContain('push.example');
    error.mockRestore();
  });
});
