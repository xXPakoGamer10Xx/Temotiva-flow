import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebPushError } from 'web-push';
import type { PushSubscriptionRecord } from '@/domain/push';

vi.mock('server-only', () => ({}));

const { createWebPushSender, getPushSender, readVapidConfig } = await import('./web-push-sender');

/** Adaptador real de envío con `web-push` (spec 002, T-07). Sin red: `send` inyectado. */

const SUB: PushSubscriptionRecord = {
  id: 'id',
  userId: 'u',
  endpoint: 'https://fcm.googleapis.com/fcm/send/device',
  p256dh: 'p256dh',
  auth: 'auth',
  userAgent: null,
  createdAt: '2026-11-08T10:00:00.000Z',
  lastUsedAt: null,
  revokedAt: null,
};

const CONFIG = { publicKey: 'pub', privateKey: 'priv', subject: 'mailto:soporte@temotiva.com' };

function webPushError(statusCode: number): WebPushError {
  return new WebPushError('falló', statusCode, {}, '', SUB.endpoint);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('configuración VAPID', () => {
  it('sin las tres variables no hay emisor (CA-11)', () => {
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', '');
    vi.stubEnv('VAPID_PRIVATE_KEY', 'priv');
    vi.stubEnv('VAPID_SUBJECT', 'mailto:a@b.c');
    expect(readVapidConfig()).toBeNull();
    expect(getPushSender()).toBeNull();
  });

  it('con las tres variables hay emisor', () => {
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'pub');
    vi.stubEnv('VAPID_PRIVATE_KEY', 'priv');
    vi.stubEnv('VAPID_SUBJECT', 'mailto:a@b.c');
    expect(readVapidConfig()).toEqual({ publicKey: 'pub', privateKey: 'priv', subject: 'mailto:a@b.c' });
    expect(getPushSender()).not.toBeNull();
  });
});

describe('envío con web-push', () => {
  it('pasa la suscripción, el payload y las claves VAPID por petición, con TTL de 24 h', async () => {
    const send = vi.fn().mockResolvedValue({ statusCode: 201 });
    const sender = createWebPushSender(CONFIG, send);

    expect(await sender.send(SUB, '{"x":1}')).toBe('ok');
    expect(send).toHaveBeenCalledWith(
      { endpoint: SUB.endpoint, keys: { p256dh: 'p256dh', auth: 'auth' } },
      '{"x":1}',
      expect.objectContaining({
        TTL: 24 * 60 * 60,
        urgency: 'normal',
        vapidDetails: { subject: CONFIG.subject, publicKey: 'pub', privateKey: 'priv' },
      }),
    );
  });

  it('no envía nada a un endpoint fuera de los servicios push conocidos', async () => {
    const send = vi.fn();
    const sender = createWebPushSender(CONFIG, send);
    for (const endpoint of ['https://intranet.local/x', 'https://169.254.169.254/latest', 'https://evil.example/fcm.googleapis.com']) {
      expect(await sender.send({ ...SUB, endpoint }, '{}')).toBe('gone');
    }
    expect(send).not.toHaveBeenCalled();
  });

  it('404 y 410 significan suscripción caducada', async () => {
    for (const status of [404, 410]) {
      const sender = createWebPushSender(CONFIG, vi.fn().mockRejectedValue(webPushError(status)));
      expect(await sender.send(SUB, '{}')).toBe('gone');
    }
  });

  it('cualquier otro fallo es un error registrado sin el endpoint', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const failure of [webPushError(500), webPushError(429), new Error(`ECONNRESET ${SUB.endpoint}`)]) {
      const sender = createWebPushSender(CONFIG, vi.fn().mockRejectedValue(failure));
      expect(await sender.send(SUB, '{}')).toBe('error');
    }
    expect(JSON.stringify(error.mock.calls)).not.toContain('push.example');
    error.mockRestore();
  });
});
