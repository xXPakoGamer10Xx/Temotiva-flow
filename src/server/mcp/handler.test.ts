import { describe, expect, it } from 'vitest';
import { handleMcpMessage } from './handler';
import { MCP_TOOLS } from './tools';
import { moveDeptTask } from '@/server/services/dept-tasks';
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

  it('solo crear_tarea y asignar_tarea escriben y no se exponen acciones críticas', async () => {
    const s = setup();
    const res = await handleMcpMessage(s.store, s.session, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
    const tools = (res?.result as { tools: { name: string; annotations: { readOnlyHint: boolean } }[] }).tools;
    expect(tools.length).toBe(MCP_TOOLS.length);
    const writers = tools.filter((tool) => !tool.annotations.readOnlyHint).map((tool) => tool.name);
    expect(writers.sort()).toEqual(['asignar_tarea', 'crear_tarea']);
    expect(tools.map((tool) => tool.name).join(' ')).not.toMatch(/avanzar|override|alta|rol|mover|retirar/);
  });

  describe('tareas de área', () => {
    function leadSetup() {
      const lead = makeUser({ departments: ['CYBER'], role: 'LEAD' });
      const colleague = makeUser({ departments: ['CYBER'], role: 'MEMBER' });
      const outsider = makeUser({ departments: ['PRODUCT'], role: 'MEMBER' });
      const ctx = makeTestStore([makeInitiative({ id: 'TEMO-500' })], [lead, colleague, outsider]);
      return { ...ctx, session: sessionOf(lead), colleague, outsider };
    }
    const parse = (res: Awaited<ReturnType<typeof call>>) =>
      JSON.parse((res?.result as { content: { text: string }[] }).content[0]?.text ?? 'null');

    it('el responsable del área crea una tarea, la asigna y la ve en `tareas`', async () => {
      const s = leadSetup();
      const created = await call(s, 'crear_tarea', { title: 'Revisar CSP', assigneeId: s.colleague.id });
      expect((created?.result as { isError: boolean }).isError).toBe(false);
      const { id } = parse(created);

      const reassigned = await call(s, 'asignar_tarea', { taskId: id, assigneeId: null });
      expect((reassigned?.result as { isError: boolean }).isError).toBe(false);

      const view = parse(await call(s, 'tareas'));
      expect(view.tasks).toHaveLength(1);
      expect(view.tasks[0]).toMatchObject({ title: 'Revisar CSP', assigneeId: null, status: 'TODO' });
      expect(view.people.map((person: { id: string }) => person.id)).toContain(s.colleague.id);
    });

    it('`tareas` pone a las personas primero y resume las tareas hechas', async () => {
      const s = leadSetup();
      const long = 'x'.repeat(400);
      const open = parse(await call(s, 'crear_tarea', { title: 'Tarea abierta', description: long }));
      const done = parse(await call(s, 'crear_tarea', { title: 'Tarea hecha' }));
      await moveDeptTask(s.store, s.session, { taskId: done.id, status: 'DONE' });

      const res = await call(s, 'tareas');
      const text = (res?.result as { content: { text: string }[] }).content[0]?.text ?? '';
      expect(text.indexOf('"people"')).toBeLessThan(text.indexOf('"tasks"'));
      const view = parse(res);
      expect(view.doneCount).toBe(1);
      expect(view.tasks.map((task: { id: string }) => task.id)).toEqual([open.id]);
      expect(view.tasks[0].description.length).toBeLessThan(long.length);
    });

    it('un miembro sin rol de responsable no puede crear tareas', async () => {
      const s = leadSetup();
      const member = { ...s, session: sessionOf(s.colleague) };
      const res = await call(member, 'crear_tarea', { title: 'Intento sin permiso' });
      expect((res?.result as { isError: boolean }).isError).toBe(true);
      expect(JSON.stringify(res?.result)).toContain('Solo el responsable del área');
      expect(parse(await call(s, 'tareas')).tasks).toHaveLength(0);
    });

    it('no asigna a alguien de otra área y valida los argumentos', async () => {
      const s = leadSetup();
      const wrongArea = await call(s, 'crear_tarea', { title: 'Tarea válida', assigneeId: s.outsider.id });
      expect((wrongArea?.result as { isError: boolean }).isError).toBe(true);
      const badDate = await call(s, 'crear_tarea', { title: 'Tarea válida', dueDate: '04/11/2026' });
      expect((badDate?.result as { isError: boolean }).isError).toBe(true);
      const badInitiative = await call(s, 'crear_tarea', { title: 'Tarea válida', initiativeId: 'hola' });
      expect((badInitiative?.result as { isError: boolean }).isError).toBe(true);
    });
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
