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

  it('solo las tareas y el sprint de Tech escriben y no se exponen acciones críticas', async () => {
    const s = setup();
    const res = await handleMcpMessage(s.store, s.session, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
    const tools = (res?.result as { tools: { name: string; annotations: { readOnlyHint: boolean } }[] }).tools;
    expect(tools.length).toBe(MCP_TOOLS.length);
    const writers = tools.filter((tool) => !tool.annotations.readOnlyHint).map((tool) => tool.name);
    expect(writers.sort()).toEqual([
      'asignar_tarea',
      'crear_sprint',
      'crear_tarea',
      'editar_sprint',
      'mover_tarea',
      'pasar_pendientes',
      'planificar_tarea',
    ]);
    expect(tools.map((tool) => tool.name).join(' ')).not.toMatch(/avanzar|override|alta|rol|retirar/);
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

    it('el equipo del área mueve la tarea; quien es de otra área no puede', async () => {
      const s = leadSetup();
      const { id } = parse(await call(s, 'crear_tarea', { title: 'Tarea para mover' }));

      const moved = await call(s, 'mover_tarea', { taskId: id, status: 'DONE' });
      expect((moved?.result as { isError: boolean }).isError).toBe(false);
      expect(parse(moved)).toMatchObject({ id, status: 'DONE' });
      expect(parse(await call(s, 'tareas')).doneCount).toBe(1);

      const stranger = { ...s, session: sessionOf(s.outsider) };
      const denied = await call(stranger, 'mover_tarea', { taskId: id, status: 'TODO' });
      expect((denied?.result as { isError: boolean }).isError).toBe(true);
      const invalid = await call(s, 'mover_tarea', { taskId: id, status: 'HECHA' });
      expect((invalid?.result as { isError: boolean }).isError).toBe(true);
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

  describe('sprint de Tech', () => {
    function techSetup() {
      const lead = makeUser({ departments: ['TECH'], role: 'LEAD' });
      const dev = makeUser({ departments: ['TECH'], role: 'MEMBER' });
      const outsider = makeUser({ departments: ['PRODUCT'], role: 'MEMBER' });
      const ctx = makeTestStore([makeInitiative({ id: 'TEMO-500' })], [lead, dev, outsider]);
      return { ...ctx, session: sessionOf(lead), dev, outsider };
    }
    const parse = (res: Awaited<ReturnType<typeof call>>) =>
      JSON.parse((res?.result as { content: { text: string }[] }).content[0]?.text ?? 'null');
    const failed = (res: Awaited<ReturnType<typeof call>>) => (res?.result as { isError: boolean }).isError;

    it('el responsable abre un sprint, planifica una tarea y la ve en `sprint_tech`', async () => {
      const s = techSetup();
      const sprint = parse(await call(s, 'crear_sprint', { startDate: '2026-11-06', endDate: '2026-11-13', capacityHours: 20 }));
      expect(sprint).toMatchObject({ name: 'Sprint 1', capacityHours: 20 });

      const task = parse(await call(s, 'crear_tarea', { title: 'Pantalla post check-in', department: 'TECH', assigneeId: s.dev.id }));
      expect(task.code).toMatch(/^TEC-\d+$/);

      const planned = parse(await call(s, 'planificar_tarea', { taskId: task.id, estimatedHours: 6.5, sprintId: sprint.id, dueDate: '2026-11-12' }));
      expect(planned).toMatchObject({ estimatedHours: 6.5, sprintId: sprint.id, dueDate: '2026-11-12' });

      const view = parse(await call(s, 'sprint_tech', { sprintId: sprint.id }));
      expect(view.tasks).toHaveLength(1);
      expect(view.tasks[0]).toMatchObject({ code: task.code, estimatedHours: 6.5 });
      expect(view.load.find((row: { userId: string | null }) => row.userId === s.dev.id)).toMatchObject({ hours: 6.5, capacity: 20 });
    });

    it('`tareas` filtra por sprint y por área', async () => {
      const s = techSetup();
      const sprint = parse(await call(s, 'crear_sprint', { startDate: '2026-11-06', endDate: '2026-11-13' }));
      const inSprint = parse(await call(s, 'crear_tarea', { title: 'Dentro del sprint', department: 'TECH', sprintId: sprint.id }));
      await call(s, 'crear_tarea', { title: 'En el backlog', department: 'TECH' });

      const only = parse(await call(s, 'tareas', { sprintId: sprint.id }));
      expect(only.tasks.map((task: { id: string }) => task.id)).toEqual([inSprint.id]);
      const none = parse(await call(s, 'tareas', { sprintId: 'ninguno' }));
      expect(none.tasks.map((task: { title: string }) => task.title)).toEqual(['En el backlog']);
    });

    it('quien no es del área no ve ni cambia el sprint, y un miembro de Tech no planifica', async () => {
      const s = techSetup();
      const sprint = parse(await call(s, 'crear_sprint', { startDate: '2026-11-06', endDate: '2026-11-13' }));
      const task = parse(await call(s, 'crear_tarea', { title: 'Tarea', department: 'TECH', assigneeId: s.dev.id }));

      const outsider = { ...s, session: sessionOf(s.outsider) };
      expect(failed(await call(outsider, 'sprint_tech'))).toBe(true);
      expect(failed(await call(outsider, 'crear_sprint', { startDate: '2026-11-20', endDate: '2026-11-27' }))).toBe(true);

      const dev = { ...s, session: sessionOf(s.dev) };
      expect(failed(await call(dev, 'sprint_tech'))).toBe(false);
      expect(failed(await call(dev, 'planificar_tarea', { taskId: task.id, sprintId: sprint.id }))).toBe(true);
      expect(failed(await call(dev, 'crear_sprint', { startDate: '2026-11-20', endDate: '2026-11-27' }))).toBe(true);
    });

    it('rechaza fechas y horas fuera de rango', async () => {
      const s = techSetup();
      expect(failed(await call(s, 'crear_sprint', { startDate: '2026-11-13', endDate: '2026-11-06' }))).toBe(true);
      expect(failed(await call(s, 'crear_sprint', { startDate: '13/11/2026', endDate: '2026-11-20' }))).toBe(true);
      const task = parse(await call(s, 'crear_tarea', { title: 'Tarea', department: 'TECH' }));
      expect(failed(await call(s, 'planificar_tarea', { taskId: task.id, estimatedHours: 200 }))).toBe(true);
      expect(failed(await call(s, 'planificar_tarea', { taskId: task.id, estimatedHours: 2.3 }))).toBe(true);
    });

    it('pasa los pendientes al siguiente sprint', async () => {
      const s = techSetup();
      const one = parse(await call(s, 'crear_sprint', { startDate: '2026-10-30', endDate: '2026-11-06' }));
      const two = parse(await call(s, 'crear_sprint', { startDate: '2026-11-06', endDate: '2026-11-13' }));
      await call(s, 'crear_tarea', { title: 'Pendiente', department: 'TECH', sprintId: one.id });
      expect(parse(await call(s, 'pasar_pendientes', { fromSprintId: one.id, toSprintId: two.id }))).toEqual({ moved: 1 });
    });
  });

  it('rechaza herramientas y métodos desconocidos', async () => {
    const s = setup();
    expect((await call(s, 'avanzar_fase'))?.error?.code).toBe(-32602);
    expect((await handleMcpMessage(s.store, s.session, { jsonrpc: '2.0', id: 3, method: 'x' }))?.error?.code).toBe(-32601);
  });
});
