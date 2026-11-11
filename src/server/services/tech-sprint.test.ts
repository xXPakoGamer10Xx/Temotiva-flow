import { describe, expect, it } from 'vitest';
import { createDeptTask, moveDeptTask, planDeptTask } from './dept-tasks';
import {
  activeSprint,
  carryOverSprint,
  createSprint,
  getTechSprintView,
  suggestNextSprint,
  updateSprint,
} from './tech-sprint';
import { TEST_NOW, makeTestStore, makeUser, sessionOf } from './test-utils';

function setup() {
  const techLead = makeUser({ departments: ['TECH'], role: 'LEAD' });
  const dev = makeUser({ departments: ['TECH'], role: 'MEMBER' });
  const dev2 = makeUser({ departments: ['TECH'], role: 'MEMBER' });
  const legal = makeUser({ departments: ['LEGAL'], role: 'MEMBER' });
  const legalLead = makeUser({ departments: ['LEGAL'], role: 'LEAD' });
  const boss = makeUser({ departments: ['PRODUCT'], role: 'EXECUTIVE' });
  const ctx = makeTestStore([], [techLead, dev, dev2, legal, legalLead, boss]);
  return { ...ctx, techLead, dev, dev2, legal, legalLead, boss };
}

// 2026-11-11 es miércoles.
const WED = '2026-11-11';
const sprintOf = (s: ReturnType<typeof setup>, extra = {}) =>
  createSprint(s.store, sessionOf(s.techLead), { startDate: WED, endDate: '2026-11-18', now: TEST_NOW, ...extra });
const techTask = (s: ReturnType<typeof setup>, extra = {}) =>
  createDeptTask(s.store, sessionOf(s.techLead), { title: 'Login con Google', department: 'TECH', now: TEST_NOW, ...extra });
const view = (s: ReturnType<typeof setup>, user = s.techLead, today = '2026-11-14', sprintId?: string) =>
  getTechSprintView(s.store, sessionOf(user), { today, sprintId, githubConfigured: false });

describe('sprint de Tech: acceso', () => {
  it('solo Tech y Dirección ven el sprint; otras áreas reciben "no existe"', async () => {
    const s = setup();
    await expect(view(s, s.legal)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(view(s, s.legalLead)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await view(s, s.dev)).canManage).toBe(false);
    expect((await view(s, s.techLead)).canManage).toBe(true);
    expect((await view(s, s.boss)).canManage).toBe(true);
  });

  it('solo el LEAD de Tech o Dirección abren y editan sprints', async () => {
    const s = setup();
    await expect(createSprint(s.store, sessionOf(s.dev), { startDate: WED, endDate: '2026-11-18' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(createSprint(s.store, sessionOf(s.legalLead), { startDate: WED, endDate: '2026-11-18' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const sprint = await sprintOf(s);
    await expect(updateSprint(s.store, sessionOf(s.dev), { sprintId: sprint.id, name: 'X' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(updateSprint(s.store, sessionOf(s.legal), { sprintId: sprint.id, name: 'X' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await createSprint(s.store, sessionOf(s.boss), { startDate: '2026-11-18', endDate: '2026-11-25' })).department).toBe('TECH');
  });

  it('el equipo no planifica horas ni fechas; el LEAD sí', async () => {
    const s = setup();
    const task = await techTask(s);
    await expect(planDeptTask(s.store, sessionOf(s.dev), { taskId: task.id, estimatedHours: 3 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const planned = await planDeptTask(s.store, sessionOf(s.techLead), { taskId: task.id, estimatedHours: 3, dueDate: '2026-11-18' });
    expect(planned).toMatchObject({ estimatedHours: 3, dueDate: '2026-11-18' });
    expect((await s.store.listActivityLog()).map((e) => e.actionType)).toContain('TASK_PLANNED');
  });
});

describe('sprint de Tech: fechas', () => {
  it('propone de miércoles a miércoles y encadena con el anterior', async () => {
    expect(suggestNextSprint([], '2026-11-14')).toMatchObject({ startDate: WED, endDate: '2026-11-18', name: 'Sprint 1' });
    expect(suggestNextSprint([], WED)).toMatchObject({ startDate: WED });
    const s = setup();
    const first = await sprintOf(s);
    expect(suggestNextSprint([first], '2026-11-14')).toMatchObject({ startDate: '2026-11-18', endDate: '2026-11-25', name: 'Sprint 2' });
  });

  it('las fechas se editan libremente dentro de los límites', async () => {
    const s = setup();
    await expect(sprintOf(s, { endDate: WED })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(sprintOf(s, { endDate: '2026-12-31' })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(sprintOf(s, { startDate: '2026-02-31' })).rejects.toMatchObject({ code: 'VALIDATION' });
    const sprint = await sprintOf(s, { startDate: '2026-11-12', endDate: '2026-11-19' });
    expect(sprint).toMatchObject({ startDate: '2026-11-12', endDate: '2026-11-19', capacityHours: 30 });
  });

  it('el miércoles de relevo pertenece al sprint nuevo', async () => {
    const s = setup();
    const first = await sprintOf(s);
    const second = await sprintOf(s, { startDate: '2026-11-18', endDate: '2026-11-25' });
    expect(activeSprint([first, second], '2026-11-17')?.id).toBe(first.id);
    expect(activeSprint([first, second], '2026-11-18')?.id).toBe(second.id);
  });

  it('mover el cierre arrastra las fechas límite que eran el cierre anterior', async () => {
    const s = setup();
    const sprint = await sprintOf(s);
    const follows = await techTask(s, { sprintId: sprint.id, dueDate: '2026-11-18' });
    const own = await techTask(s, { sprintId: sprint.id, dueDate: '2026-11-13' });
    const { shiftedTasks } = await updateSprint(s.store, sessionOf(s.techLead), { sprintId: sprint.id, endDate: '2026-11-19' });
    expect(shiftedTasks).toBe(1);
    expect((await s.store.deptTaskById(follows.id))?.dueDate).toBe('2026-11-19');
    expect((await s.store.deptTaskById(own.id))?.dueDate).toBe('2026-11-13');
  });

  it('pasar pendientes mueve lo no hecho al otro sprint con su nuevo cierre', async () => {
    const s = setup();
    const first = await sprintOf(s);
    const second = await sprintOf(s, { startDate: '2026-11-18', endDate: '2026-11-25' });
    const open = await techTask(s, { sprintId: first.id, dueDate: '2026-11-18' });
    const done = await techTask(s, { sprintId: first.id });
    await moveDeptTask(s.store, sessionOf(s.dev), { taskId: done.id, status: 'DONE' });
    expect(await carryOverSprint(s.store, sessionOf(s.techLead), { fromSprintId: first.id, toSprintId: second.id })).toEqual({ moved: 1 });
    expect(await s.store.deptTaskById(open.id)).toMatchObject({ sprintId: second.id, dueDate: '2026-11-25' });
    expect((await s.store.deptTaskById(done.id))?.sprintId).toBe(first.id);
  });
});

describe('sprint de Tech: claves, horas y vista de PM', () => {
  it('las tareas de Tech reciben clave TEC-n correlativa; las de otras áreas no', async () => {
    const s = setup();
    expect((await techTask(s)).code).toBe('TEC-1');
    expect((await techTask(s)).code).toBe('TEC-2');
    const legal = await createDeptTask(s.store, sessionOf(s.legalLead), { title: 'Revisar contrato', now: TEST_NOW });
    expect(legal.code).toBeNull();
  });

  it('las horas van en tramos de media hora y el sprint debe ser del área', async () => {
    const s = setup();
    await expect(techTask(s, { estimatedHours: 1.3 })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(techTask(s, { estimatedHours: 81 })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(techTask(s, { sprintId: 'no-existe' })).rejects.toMatchObject({ code: 'VALIDATION' });
    expect((await techTask(s, { estimatedHours: 2.5 })).estimatedHours).toBe(2.5);
  });

  it('calcula carga frente a capacidad, ritmo y riesgos', async () => {
    const s = setup();
    const sprint = await sprintOf(s, { capacityHours: 10 });
    await techTask(s, { sprintId: sprint.id, assigneeId: s.dev.id, estimatedHours: 8, dueDate: '2026-11-12' });
    await techTask(s, { sprintId: sprint.id, assigneeId: s.dev.id, estimatedHours: 4 });
    const finished = await techTask(s, { sprintId: sprint.id, assigneeId: s.dev2.id, estimatedHours: 4 });
    await techTask(s, { sprintId: sprint.id });
    await techTask(s); // backlog
    await moveDeptTask(s.store, sessionOf(s.dev2), { taskId: finished.id, status: 'DONE' });

    const v = await view(s, s.techLead, '2026-11-15');
    const dev = v.load.find((row) => row.userId === s.dev.id);
    expect(dev).toMatchObject({ hours: 12, capacity: 10, overloaded: true, overdue: 1 });
    expect(v.load.at(-1)).toMatchObject({ userId: null, unestimated: 1 });
    expect(v.health).toMatchObject({ daysTotal: 7, daysElapsed: 4, hours: 16, doneHours: 4, pace: 'BEHIND' });
    expect(v.risks).toMatchObject({ overdue: 1, unestimated: 1, unassigned: 1, overloadedPeople: 1 });
    expect(v.backlog).toHaveLength(1);
    expect(v.tasks).toHaveLength(4);
  });
});
