import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const syncPullRequest = vi.fn(async () => ({ updated: 1, unknown: 0 }));
vi.mock('@/server/repositories', () => ({ getDataStore: () => ({ marker: 'store' }) }));
vi.mock('@/server/services/github-sync', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/services/github-sync')>()),
  syncPullRequest: (...args: unknown[]) => syncPullRequest(...(args as [])),
}));

const { POST, dynamic } = await import('./route');

const SECRET = 'b'.repeat(64);
const PAYLOAD = JSON.stringify({
  action: 'opened',
  repository: { full_name: 'temotiva/app' },
  pull_request: { number: 7, html_url: 'https://github.com/temotiva/app/pull/7', title: 'TEC-1', head: { ref: 'x' } },
});
const sign = (body: string, secret = SECRET): string => `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

function request(body: string, headers: Record<string, string>): Request {
  return new Request('https://flow.example/api/github/webhook', { method: 'POST', body, headers });
}

beforeEach(() => {
  vi.stubEnv('GITHUB_WEBHOOK_SECRET', SECRET);
  vi.stubEnv('GITHUB_REPOSITORIES', '');
  syncPullRequest.mockClear();
});
afterEach(() => vi.unstubAllEnvs());

describe('POST /api/github/webhook', () => {
  it('es dinámico', () => expect(dynamic).toBe('force-dynamic'));

  it('sin secreto configurado responde 503 y no toca nada', async () => {
    vi.stubEnv('GITHUB_WEBHOOK_SECRET', '');
    const response = await POST(request(PAYLOAD, { 'x-github-event': 'pull_request', 'x-hub-signature-256': sign(PAYLOAD) }));
    expect(response.status).toBe(503);
    expect(syncPullRequest).not.toHaveBeenCalled();
  });

  it('rechaza firmas ausentes, mal formadas o de otro secreto', async () => {
    for (const signature of [undefined, 'sha256=zz', sign(PAYLOAD, 'otro')]) {
      const headers: Record<string, string> = { 'x-github-event': 'pull_request' };
      if (signature) headers['x-hub-signature-256'] = signature;
      expect((await POST(request(PAYLOAD, headers))).status).toBe(401);
    }
    expect(syncPullRequest).not.toHaveBeenCalled();
  });

  it('con firma válida sincroniza y responde solo recuentos', async () => {
    const response = await POST(request(PAYLOAD, { 'x-github-event': 'pull_request', 'x-hub-signature-256': sign(PAYLOAD) }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ updated: 1, unknown: 0 });
    expect(syncPullRequest).toHaveBeenCalledOnce();
  });

  it('responde al ping e ignora otros eventos y repos fuera de la lista', async () => {
    expect((await POST(request('{}', { 'x-github-event': 'ping', 'x-hub-signature-256': sign('{}') }))).status).toBe(200);
    expect((await POST(request(PAYLOAD, { 'x-github-event': 'push', 'x-hub-signature-256': sign(PAYLOAD) }))).status).toBe(202);
    vi.stubEnv('GITHUB_REPOSITORIES', 'temotiva/otro');
    expect((await POST(request(PAYLOAD, { 'x-github-event': 'pull_request', 'x-hub-signature-256': sign(PAYLOAD) }))).status).toBe(202);
    expect(syncPullRequest).not.toHaveBeenCalled();
  });
});
