import { describe, expect, it } from 'vitest';
import { handleMcpMessage } from './handler';
import { MCP_TOOLS } from './tools';
import { makeInitiative, makeTestStore, makeUser, sessionOf } from '@/server/services/test-utils';

function setup() {
  const member = makeUser({ departments: ['CYBER'], role: 'MEMBER' });
  const ctx = makeTestStore([makeInitiative({ id: 'TEMO-500' })], [member]);
  return { ...ctx, session: sessionOf(member) };
}

const call = (s: ReturnType<typeof setup>, name: string, args: unknown = {}) =>
  handleMcpMessage(s.store, s.session, {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name, arguments: args },
  });

describe('servidor MCP', () => {
  it('negocia la versión y anuncia solo herramientas', async () => {
    const s = setup();
    const res = await handleMcpMessage(s.store, s.session, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-03-26' },
    });
    expect(res?.result).toMatchObject({ protocolVersion: '2025-03-26', capabilities: { tools: expect.anything() } });
  });

  it('las notificaciones no tienen respuesta', async () => {
    const s = setup();
    expect(await handleMcpMessage(s.store, s.session, { jsonrpc: '2.0', method: 'notifications/initialized' })).toBeNull();
  });

  it('todas las herramientas son de solo lectura y no exponen acciones críticas', async () => {
    const s = setup();
    const res = await handleMcpMessage(s.store, s.session, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
    const tools = (res?.result as { tools: { name: string; annotations: { readOnlyHint: boolean } }[] }).tools;
    expect(tools.length).toBe(MCP_TOOLS.length);
    expect(tools.every((tool) => tool.annotations.readOnlyHint)).toBe(true);
    expect(tools.map((tool) => tool.name).join(' ')).not.toMatch(/avanzar|override|alta|rol/);
  });

  it('quien_soy y ver_iniciativa responden con los datos de la sesión', async () => {
    const s = setup();
    const who = await call(s, 'quien_soy');
    expect(JSON.stringify(who?.result)).toContain(s.session.name);
    const detail = await call(s, 'ver_iniciativa', { id: 'TEMO-500' });
    expect((detail?.result as { isError: boolean }).isError).toBe(false);
  });

  it('valida argumentos y traduce errores de dominio sin trazas', async () => {
    const s = setup();
    const bad = await call(s, 'ver_iniciativa', { id: 'hola' });
    expect((bad?.result as { isError: boolean }).isError).toBe(true);
    const missing = await call(s, 'ver_iniciativa', { id: 'TEMO-999' });
    expect(JSON.stringify(missing?.result)).toContain('No existe la iniciativa TEMO-999');
  });

  it('rechaza herramientas y métodos desconocidos', async () => {
    const s = setup();
    expect((await call(s, 'avanzar_fase'))?.error?.code).toBe(-32602);
    expect((await handleMcpMessage(s.store, s.session, { jsonrpc: '2.0', id: 3, method: 'x' }))?.error?.code).toBe(-32601);
  });
});
