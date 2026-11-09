import { describe, expect, it, vi } from 'vitest';
import type { PushMessage, PushSubscriptionRecord } from '@/domain/push';
import type { User } from '@/domain/types';
import { STAGE_ID_BY_KEY } from '@/domain/workflow';
import type { InMemoryDataStore } from '@/server/repositories/in-memory';
import {
  deliver,
  notifySleRisk,
  sendTestPush,
  subscribeDevice,
  unsubscribeDevice,
  type PushDeliveryResult,
  type PushSender,
} from './push';
import { HOUR, TEST_NOW, hoursBefore, makeInitiative, makeTestStore, makeUser, sessionOf } from './test-utils';

/** Entrega, alta/baja de dispositivos y SLE en riesgo (spec 002, T-06). Sin red. */

class FakePushSender implements PushSender {
  readonly sent: { endpoint: string; message: PushMessage }[] = [];
  constructor(private readonly results: Record<string, PushDeliveryResult | 'throw'> = {}) {}

  async send(sub: PushSubscriptionRecord, payload: string): Promise<PushDeliveryResult> {
    const result = this.results[sub.endpoint] ?? 'ok';
    if (result === 'throw') throw new Error(`fallo de red en ${sub.endpoint}`);
    this.sent.push({ endpoint: sub.endpoint, message: JSON.parse(payload) as PushMessage });
    return result;
  }
}

const MESSAGE: PushMessage = { kind: 'BLOCKED', title: '⛔ TEMO-500 está parada', body: 'Legal / DPO', url: '/board?iniciativa=TEMO-500', tag: 'BLOCKED:TEMO-500' };

let deviceSequence = 0;
async function addDevice(store: InMemoryDataStore, user: User, overrides: Partial<PushSubscriptionRecord> = {}) {
  deviceSequence += 1;
  return store.upsertPushSubscription({
    id: `00000000-0000-4000-9000-${String(deviceSequence).padStart(12, '0')}`,
    userId: user.id,
    endpoint: `https://push.example/device-${deviceSequence}`,
    p256dh: 'p256dh',
    auth: 'auth',
    userAgent: null,
    createdAt: TEST_NOW.toISOString(),
    lastUsedAt: null,
    revokedAt: null,
    ...overrides,
  });
}

function setup(initiatives = [makeInitiative()]) {
  const ana = makeUser({ departments: ['LEGAL'], role: 'MEMBER' });
  const leo = makeUser({ departments: ['LEGAL'], role: 'LEAD' });
  const otherLead = makeUser({ departments: ['TECH'], role: 'LEAD' });
  const exLead = makeUser({ departments: ['LEGAL'], role: 'LEAD', isActive: false });
  const { store } = makeTestStore(initiatives, [ana, leo, otherLead, exLead]);
  return { store, ana, leo, otherLead, exLead };
}

describe('deliver', () => {
  it('envía a todos los dispositivos activos de cada persona y registra el último uso', async () => {
    const { store, ana, leo } = setup();
    const a1 = await addDevice(store, ana);
    const a2 = await addDevice(store, ana);
    const l1 = await addDevice(store, leo);
    const sender = new FakePushSender();

    const result = await deliver(store, sender, [ana.id, leo.id], MESSAGE, TEST_NOW);

    expect(result).toEqual({ sent: 3, revoked: 0, failed: 0 });
    expect(sender.sent.map((s) => s.endpoint).sort()).toEqual([a1.endpoint, a2.endpoint, l1.endpoint].sort());
    expect(sender.sent[0]?.message).toEqual(MESSAGE);
    expect((await store.pushSubscriptionByEndpoint(a1.endpoint))?.lastUsedAt).toBe(TEST_NOW.toISOString());
  });

  it('no envía a dispositivos dados de baja ni a personas no pedidas', async () => {
    const { store, ana, leo } = setup();
    await addDevice(store, ana, { revokedAt: TEST_NOW.toISOString() });
    await addDevice(store, leo);
    const sender = new FakePushSender();

    expect(await deliver(store, sender, [ana.id], MESSAGE, TEST_NOW)).toEqual({ sent: 0, revoked: 0, failed: 0 });
    expect(sender.sent).toEqual([]);
  });

  it('una suscripción caducada (404/410) queda dada de baja y no se vuelve a usar (CA-08)', async () => {
    const { store, ana } = setup();
    const gone = await addDevice(store, ana);
    const fine = await addDevice(store, ana);
    const sender = new FakePushSender({ [gone.endpoint]: 'gone' });

    expect(await deliver(store, sender, [ana.id], MESSAGE, TEST_NOW)).toEqual({ sent: 1, revoked: 1, failed: 0 });
    expect((await store.pushSubscriptionByEndpoint(gone.endpoint))?.revokedAt).toBe(TEST_NOW.toISOString());

    const second = new FakePushSender();
    await deliver(store, second, [ana.id], MESSAGE, TEST_NOW);
    expect(second.sent.map((s) => s.endpoint)).toEqual([fine.endpoint]);
  });

  it('un error o una excepción del servicio push no lanza ni da de baja (CA-10)', async () => {
    const { store, ana } = setup();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const flaky = await addDevice(store, ana);
    const broken = await addDevice(store, ana);
    const sender = new FakePushSender({ [flaky.endpoint]: 'error', [broken.endpoint]: 'throw' });

    await expect(deliver(store, sender, [ana.id], MESSAGE, TEST_NOW)).resolves.toEqual({ sent: 0, revoked: 0, failed: 2 });
    expect((await store.pushSubscriptionByEndpoint(flaky.endpoint))?.revokedAt).toBeNull();
    expect((await store.pushSubscriptionByEndpoint(broken.endpoint))?.revokedAt).toBeNull();

    // Los logs no llevan el endpoint (identifica el dispositivo).
    expect(JSON.stringify(error.mock.calls)).not.toContain('push.example');
    error.mockRestore();
  });

  it('sin destinatarios no consulta ni envía nada', async () => {
    const { store } = setup();
    const sender = new FakePushSender();
    expect(await deliver(store, sender, [], MESSAGE, TEST_NOW)).toEqual({ sent: 0, revoked: 0, failed: 0 });
  });
});

describe('alta y baja de dispositivos', () => {
  it('el alta liga el dispositivo a la persona de la sesión', async () => {
    const { store, ana } = setup();
    const sub = await subscribeDevice(store, sessionOf(ana), {
      endpoint: 'https://push.example/mio',
      p256dh: 'k',
      auth: 'a',
      userAgent: 'Mozilla/5.0 (Linux; Android 14)',
      now: TEST_NOW,
    });
    expect(sub).toMatchObject({ userId: ana.id, endpoint: 'https://push.example/mio', revokedAt: null, createdAt: TEST_NOW.toISOString() });
    expect(await store.listActivePushSubscriptions([ana.id])).toHaveLength(1);
  });

  it('el user-agent se recorta a 200 caracteres', async () => {
    const { store, ana } = setup();
    const sub = await subscribeDevice(store, sessionOf(ana), {
      endpoint: 'https://push.example/largo',
      p256dh: 'k',
      auth: 'a',
      userAgent: 'x'.repeat(500),
      now: TEST_NOW,
    });
    expect(sub.userAgent).toHaveLength(200);
  });

  it('la baja solo afecta a un dispositivo de la propia sesión', async () => {
    const { store, ana, leo } = setup();
    const mine = await addDevice(store, ana);
    const theirs = await addDevice(store, leo);

    await unsubscribeDevice(store, sessionOf(ana), { endpoint: mine.endpoint, now: TEST_NOW });
    // Intentar dar de baja el de otra persona no hace nada y no revela si existe.
    await expect(unsubscribeDevice(store, sessionOf(ana), { endpoint: theirs.endpoint, now: TEST_NOW })).resolves.toBeUndefined();
    await expect(unsubscribeDevice(store, sessionOf(ana), { endpoint: 'https://push.example/nada', now: TEST_NOW })).resolves.toBeUndefined();

    expect((await store.pushSubscriptionByEndpoint(mine.endpoint))?.revokedAt).toBe(TEST_NOW.toISOString());
    expect((await store.pushSubscriptionByEndpoint(theirs.endpoint))?.revokedAt).toBeNull();
  });

  it('el aviso de prueba solo llega a los dispositivos de quien lo pide', async () => {
    const { store, ana, leo } = setup();
    const mine = await addDevice(store, ana);
    await addDevice(store, leo);
    const sender = new FakePushSender();

    const result = await sendTestPush(store, sender, sessionOf(ana), TEST_NOW);

    expect(result.sent).toBe(1);
    expect(sender.sent.map((s) => s.endpoint)).toEqual([mine.endpoint]);
    expect(sender.sent[0]?.message).toMatchObject({ kind: 'TEST', url: '/notifications' });
  });
});

describe('SLE en riesgo (E11)', () => {
  // VIABILIDAD tiene un SLE de 48 h: 36 h netas = 75 %.
  const atRisk = (overrides = {}) =>
    makeInitiative({ stageEnteredAt: hoursBefore(40), currentStageId: STAGE_ID_BY_KEY.FEASIBILITY, ...overrides });

  it('avisa a la persona asignada cuando el SLE neto cruza el 75 %', async () => {
    const { store, ana } = setup([atRisk()]);
    await store.updateInitiative('TEMO-500', { currentAssigneeId: ana.id });
    await addDevice(store, ana);
    const sender = new FakePushSender();

    expect(await notifySleRisk(store, sender, TEST_NOW)).toEqual({ notified: 1 });
    expect(sender.sent[0]?.message).toMatchObject({ kind: 'SLE_AT_RISK', title: '⏳ TEMO-500 al 83 % de su SLE', body: 'Viabilidad' });
  });

  it('sin persona asignada avisa a los LEAD activos del área dueña', async () => {
    const { store, leo, otherLead, exLead } = setup([atRisk()]);
    const leoDevice = await addDevice(store, leo);
    await addDevice(store, otherLead);
    await addDevice(store, exLead);
    const sender = new FakePushSender();

    await notifySleRisk(store, sender, TEST_NOW);
    expect(sender.sent.map((s) => s.endpoint)).toEqual([leoDevice.endpoint]);
  });

  it('avisa una sola vez por iniciativa y fase aunque el cron se repita (CA-09)', async () => {
    const { store, leo } = setup([atRisk()]);
    await addDevice(store, leo);
    const sender = new FakePushSender();

    expect(await notifySleRisk(store, sender, TEST_NOW)).toEqual({ notified: 1 });
    expect(await notifySleRisk(store, sender, new Date(TEST_NOW.getTime() + HOUR))).toEqual({ notified: 0 });
    expect(sender.sent).toHaveLength(1);
  });

  it('tras cambiar de fase, el reloj de la nueva fase puede volver a avisar', async () => {
    const { store, leo } = setup([atRisk()]);
    await addDevice(store, leo);
    const sender = new FakePushSender();
    await notifySleRisk(store, sender, TEST_NOW);

    // Pasa a READY (72 h, dueña Producto → sin LEAD de Producto), luego vuelve el reloj.
    await store.updateInitiative('TEMO-500', {
      currentStageId: STAGE_ID_BY_KEY.READY,
      ownerDepartment: 'LEGAL',
      stageEnteredAt: hoursBefore(60),
    });
    expect(await notifySleRisk(store, sender, TEST_NOW)).toEqual({ notified: 1 });
    expect(sender.sent).toHaveLength(2);
  });

  it('el tiempo en parada no cuenta: 40 h en fase con 10 h parada no llega al 75 %', async () => {
    const { store, leo } = setup([atRisk({ blockedMsInStage: 10 * HOUR })]);
    await addDevice(store, leo);
    const sender = new FakePushSender();

    expect(await notifySleRisk(store, sender, TEST_NOW)).toEqual({ notified: 0 });
    expect(sender.sent).toEqual([]);
  });

  it('por debajo del umbral no avisa, y una iniciativa archivada tampoco', async () => {
    const { store, leo } = setup([
      makeInitiative({ id: 'TEMO-501', stageEnteredAt: hoursBefore(10) }),
      atRisk({ id: 'TEMO-502', isArchived: true }),
    ]);
    await addDevice(store, leo);
    const sender = new FakePushSender();

    expect(await notifySleRisk(store, sender, TEST_NOW)).toEqual({ notified: 0 });
  });

  it('un SLE ya excedido también avisa una vez, con el texto topado al 100 %', async () => {
    const { store, leo } = setup([atRisk({ stageEnteredAt: hoursBefore(100) })]);
    await addDevice(store, leo);
    const sender = new FakePushSender();

    await notifySleRisk(store, sender, TEST_NOW);
    expect(sender.sent[0]?.message.title).toBe('⏳ TEMO-500 al 100 % de su SLE');
  });

  it('si el envío falla, la marca queda puesta: no se reintenta en bucle', async () => {
    const { store, leo } = setup([atRisk()]);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const device = await addDevice(store, leo);
    const sender = new FakePushSender({ [device.endpoint]: 'error' });

    expect(await notifySleRisk(store, sender, TEST_NOW)).toEqual({ notified: 1 });
    expect(await notifySleRisk(store, sender, TEST_NOW)).toEqual({ notified: 0 });
    error.mockRestore();
  });
});
