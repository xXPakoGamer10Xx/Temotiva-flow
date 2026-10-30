import { afterEach, describe, expect, it } from 'vitest';
import {
  MAX_ACTIVE_API_TOKENS,
  createApiToken,
  hashApiToken,
  resolveApiToken,
  revokeApiToken,
} from './api-tokens';
import { TEST_NOW, makeTestStore, makeUser, sessionOf } from './test-utils';

const DAY = 24 * 60 * 60 * 1000;

afterEach(() => {
  delete process.env.MCP_BETA_EMAILS;
});

function setup() {
  const ana = makeUser({ departments: ['CYBER'], role: 'LEAD' });
  const luis = makeUser({ departments: ['LEGAL'], role: 'MEMBER' });
  const ctx = makeTestStore([], [ana, luis]);
  process.env.MCP_BETA_EMAILS = `${ana.email}, ${luis.email.toUpperCase()}`;
  return { ...ctx, ana, luis };
}

describe('tokens de acceso para IA', () => {
  it('guarda solo el hash y devuelve la sesión de su dueña con sus mismos privilegios', async () => {
    const s = setup();
    const { token, record } = await createApiToken(s.store, sessionOf(s.ana), { name: 'Claude', now: TEST_NOW });

    expect(record.tokenHash).toBe(hashApiToken(token));
    expect(JSON.stringify(await s.store.listApiTokens(s.ana.id))).not.toContain(token);

    const session = await resolveApiToken(s.store, token, TEST_NOW);
    expect(session).toMatchObject({ userId: s.ana.id, role: 'LEAD', departments: ['CYBER'] });
  });

  it('rechaza tokens inventados, revocados y caducados', async () => {
    const s = setup();
    expect(await resolveApiToken(s.store, 'tfm_inventado', TEST_NOW)).toBeNull();
    expect(await resolveApiToken(s.store, 'otra-cosa', TEST_NOW)).toBeNull();

    const { token, record } = await createApiToken(s.store, sessionOf(s.ana), { name: 'Claude', days: 1, now: TEST_NOW });
    expect(await resolveApiToken(s.store, token, new Date(TEST_NOW.getTime() + 2 * DAY))).toBeNull();

    await revokeApiToken(s.store, sessionOf(s.ana), { tokenId: record.id, now: TEST_NOW });
    expect(await resolveApiToken(s.store, token, TEST_NOW)).toBeNull();
  });

  it('una baja de la lista de acceso invalida el token al instante', async () => {
    const s = setup();
    const { token } = await createApiToken(s.store, sessionOf(s.luis), { name: 'Claude', now: TEST_NOW });
    await s.store.updateUser(s.luis.id, { isActive: false });
    expect(await resolveApiToken(s.store, token, TEST_NOW)).toBeNull();
  });

  it('el rol sale del perfil actual, no del momento en que se creó el token', async () => {
    const s = setup();
    const { token } = await createApiToken(s.store, sessionOf(s.ana), { name: 'Claude', now: TEST_NOW });
    await s.store.updateUser(s.ana.id, { role: 'MEMBER' });
    expect((await resolveApiToken(s.store, token, TEST_NOW))?.role).toBe('MEMBER');
  });

  it('nadie revoca el token de otra persona', async () => {
    const s = setup();
    const { record } = await createApiToken(s.store, sessionOf(s.ana), { name: 'Claude', now: TEST_NOW });
    await expect(revokeApiToken(s.store, sessionOf(s.luis), { tokenId: record.id })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('valida nombre, caducidad y número de tokens activos', async () => {
    const s = setup();
    const session = sessionOf(s.ana);
    await expect(createApiToken(s.store, session, { name: 'a' })).rejects.toThrow();
    await expect(createApiToken(s.store, session, { name: 'Claude', days: 0 })).rejects.toThrow();
    await expect(createApiToken(s.store, session, { name: 'Claude', days: 365 })).rejects.toThrow();

    for (let i = 0; i < MAX_ACTIVE_API_TOKENS; i += 1) {
      await createApiToken(s.store, session, { name: `Cliente ${i}`, now: TEST_NOW });
    }
    await expect(createApiToken(s.store, session, { name: 'Uno más', now: TEST_NOW })).rejects.toThrow();
  });

  it('crear y revocar dejan evento en la caja negra sin el valor del token', async () => {
    const s = setup();
    const { token, record } = await createApiToken(s.store, sessionOf(s.ana), { name: 'Claude', now: TEST_NOW });
    await revokeApiToken(s.store, sessionOf(s.ana), { tokenId: record.id, now: TEST_NOW });

    const log = await s.store.listActivityLog();
    expect(log.map((entry) => entry.actionType)).toEqual(
      expect.arrayContaining(['API_TOKEN_CREATED', 'API_TOKEN_REVOKED']),
    );
    expect(JSON.stringify(log)).not.toContain(token);
  });

  it('solo los correos autorizados crean o usan tokens; sin la variable no puede nadie', async () => {
    const s = setup();
    const { token } = await createApiToken(s.store, sessionOf(s.ana), { name: 'Claude', now: TEST_NOW });
    const outsider = makeUser({ departments: ['LEGAL'], role: 'EXECUTIVE' });
    await s.store.insertUser(outsider);

    await expect(createApiToken(s.store, sessionOf(outsider), { name: 'Claude', now: TEST_NOW })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });

    process.env.MCP_BETA_EMAILS = outsider.email;
    expect(await resolveApiToken(s.store, token, TEST_NOW)).toBeNull();

    delete process.env.MCP_BETA_EMAILS;
    await expect(createApiToken(s.store, sessionOf(outsider), { name: 'Claude', now: TEST_NOW })).rejects.toThrow();
  });
});
