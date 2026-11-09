import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PushSender } from '@/server/services/push';

vi.mock('server-only', () => ({}));

const notifySleRisk = vi.fn(async () => ({ notified: 2 }));
const store = { marker: 'store' };
let sender: PushSender | null = { send: async () => 'ok' };

vi.mock('@/server/repositories', () => ({ getDataStore: () => store }));
vi.mock('@/server/push/web-push-sender', () => ({ getPushSender: () => sender }));
vi.mock('@/server/services/push', () => ({ notifySleRisk: (...args: unknown[]) => notifySleRisk(...(args as [])) }));

const { GET, dynamic } = await import('./route');

/** Endpoint que llama el crontab para el aviso de SLE en riesgo (spec 002 §8, T-09). */

const SECRET = 'a'.repeat(64);

function request(authorization?: string): Request {
  return new Request('https://flow.example/api/cron/sle-risk', {
    headers: authorization ? { authorization } : {},
  });
}

beforeEach(() => {
  vi.stubEnv('CRON_SECRET', SECRET);
  sender = { send: async () => 'ok' };
  notifySleRisk.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('GET /api/cron/sle-risk', () => {
  it('es dinámico y nunca se cachea', async () => {
    expect(dynamic).toBe('force-dynamic');
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('sin CRON_SECRET configurado responde 503 y no hace nada', async () => {
    vi.stubEnv('CRON_SECRET', '');
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(503);
    expect(notifySleRisk).not.toHaveBeenCalled();
  });

  it('sin cabecera, con otro esquema o con un secreto incorrecto responde 401', async () => {
    for (const header of [undefined, SECRET, `Basic ${SECRET}`, 'Bearer otro', `Bearer ${SECRET}x`, `Bearer ${SECRET.slice(1)}`]) {
      const response = await GET(request(header));
      expect(response.status).toBe(401);
    }
    expect(notifySleRisk).not.toHaveBeenCalled();
  });

  it('sin claves VAPID responde 503: no marca avisos que no podría enviar', async () => {
    sender = null;
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(503);
    expect(notifySleRisk).not.toHaveBeenCalled();
  });

  it('con el secreto correcto ejecuta el repaso y devuelve solo el recuento', async () => {
    const response = await GET(request(`bearer ${SECRET}`));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ notified: 2 });
    expect(notifySleRisk).toHaveBeenCalledWith(store, sender, expect.any(Date));
  });

  it('si el repaso falla responde 500 sin detalles internos', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    notifySleRisk.mockRejectedValueOnce(new Error('conexión perdida con postgres://user:pw@host'));
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('postgres');
    expect(JSON.stringify(error.mock.calls)).not.toContain('postgres://');
    error.mockRestore();
  });
});
