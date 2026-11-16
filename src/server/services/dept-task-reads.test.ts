import { describe, expect, it } from 'vitest';
import type { DeptTask } from '@/domain/types';
import { markDeptTaskRead } from './dept-task-reads';
import { assignDeptTask, createDeptTask, getTasksView, moveDeptTask, removeDeptTask } from './dept-tasks';
import { type PullRequestEvent, syncPullRequest } from './github-sync';
import { TEST_NOW, makeInitiative, makeTestStore, makeUser, sessionOf } from './test-utils';

/**
 * Confirmación de lectura y tiempos de las tareas de área (spec 003, T-03).
 * Sesiones: MEMBER implicado (Ana), MEMBER del área sin la tarea (Luis),
 * LEAD, EXECUTIVE y MEMBER ajeno (Legal).
 */

const at = (minutes: number): Date => new Date(TEST_NOW.getTime() + minutes * 60 * 1000);

function setup() {
  const lead = makeUser({ name: 'Lola Lead', departments: ['CYBER'], role: 'LEAD' });
  const ana = makeUser({ name: 'Ana Analista', departments: ['CYBER'], role: 'MEMBER' });
  const luis = makeUser({ name: 'Luis Libre', departments: ['CYBER'], role: 'MEMBER' });
  const outsider = makeUser({ departments: ['LEGAL'], role: 'MEMBER' });
  const boss = makeUser({ departments: ['PRODUCT'], role: 'EXECUTIVE' });
  const ctx = makeTestStore([makeInitiative()], [lead, ana, luis, outsider, boss]);
  return { ...ctx, lead, ana, luis, outsider, boss };
}
type Setup = ReturnType<typeof setup>;

const createFor = (s: Setup, assigneeId: string | null = s.ana.id) =>
  createDeptTask(s.store, sessionOf(s.lead), { title: 'Revisar política', assigneeId, now: TEST_NOW });

const cyclesOf = (s: Setup, task: DeptTask) => s.store.listDeptTaskReads(task.id);
const readEvents = async (s: Setup) => (await s.store.listActivityLog()).filter((entry) => entry.actionType === 'TASK_READ');

describe('ciclos de asignación (RF-01, RF-02)', () => {
  it('crear con persona abre un ciclo sin leer con la hora de creación (CA-01)', async () => {
    const s = setup();
    const task = await createFor(s);
    expect(await cyclesOf(s, task)).toEqual([
      expect.objectContaining({ assigneeId: s.ana.id, assignedAt: TEST_NOW.toISOString(), readAt: null, closedAt: null }),
    ]);
  });

  it('crear sin persona no abre ciclo; tomarla sí', async () => {
    const s = setup();
    const task = await createFor(s, null);
    expect(await cyclesOf(s, task)).toEqual([]);
    await assignDeptTask(s.store, sessionOf(s.luis), { taskId: task.id, assigneeId: s.luis.id, now: at(5) });
    expect(await cyclesOf(s, task)).toEqual([expect.objectContaining({ assigneeId: s.luis.id, assignedAt: at(5).toISOString() })]);
  });

  it('reasignar cierra el ciclo y abre otro sin leer; el historial muestra el anterior (CA-07)', async () => {
    const s = setup();
    const task = await createFor(s);
    await markDeptTaskRead(s.store, sessionOf(s.ana), { taskId: task.id, now: at(3) });
    await assignDeptTask(s.store, sessionOf(s.lead), { taskId: task.id, assigneeId: s.luis.id, now: at(10) });

    const cycles = await cyclesOf(s, task);
    expect(cycles.filter((cycle) => cycle.closedAt === null)).toEqual([
      expect.objectContaining({ assigneeId: s.luis.id, readAt: null }),
    ]);
    const view = (await getTasksView(s.store, sessionOf(s.lead))).tasks.find((item) => item.id === task.id);
    expect(view?.readCycle).toMatchObject({ state: 'UNREAD', assignedAt: at(10).toISOString() });
    expect(view?.readHistory).toEqual([
      expect.objectContaining({ assigneeName: 'Ana Analista', readAt: at(3).toISOString(), readSource: 'MANUAL', closedAt: at(10).toISOString() }),
    ]);
  });

  it('desasignar o retirar cierra el ciclo sin abrir otro; nunca hay dos abiertos (CA-09)', async () => {
    const s = setup();
    const first = await createFor(s);
    await assignDeptTask(s.store, sessionOf(s.lead), { taskId: first.id, assigneeId: null, now: at(1) });
    expect((await cyclesOf(s, first)).every((cycle) => cycle.closedAt !== null)).toBe(true);

    const second = await createFor(s);
    await removeDeptTask(s.store, sessionOf(s.lead), { taskId: second.id, now: at(2) });
    expect((await cyclesOf(s, second))[0]?.closedAt).toBe(at(2).toISOString());
  });
});

describe('marcar como leída (RF-03, RF-04, RF-06, CA-02..CA-04)', () => {
  it('la persona asignada la marca: MANUAL, un TASK_READ con su user_id y la vista pasa a leída', async () => {
    const s = setup();
    const task = await createFor(s);
    const cycle = await markDeptTaskRead(s.store, sessionOf(s.ana), { taskId: task.id, now: at(12) });
    expect(cycle).toMatchObject({ readAt: at(12).toISOString(), readSource: 'MANUAL' });

    const events = await readEvents(s);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ userId: s.ana.id, newValue: { taskId: task.id, source: 'MANUAL' } });

    const view = (await getTasksView(s.store, sessionOf(s.ana))).tasks.find((item) => item.id === task.id);
    expect(view?.readCycle).toMatchObject({ state: 'READ', readSource: 'MANUAL' });
  });

  it('volver a marcar no cambia la hora ni registra otro evento', async () => {
    const s = setup();
    const task = await createFor(s);
    await markDeptTaskRead(s.store, sessionOf(s.ana), { taskId: task.id, now: at(12) });
    const again = await markDeptTaskRead(s.store, sessionOf(s.ana), { taskId: task.id, now: at(30) });
    expect(again.readAt).toBe(at(12).toISOString());
    expect(await readEvents(s)).toHaveLength(1);
  });

  it('ni otro miembro del área, ni el LEAD, ni Dirección pueden marcar por ella; un área ajena recibe «no existe»', async () => {
    const s = setup();
    const task = await createFor(s);
    for (const user of [s.luis, s.lead, s.boss]) {
      await expect(markDeptTaskRead(s.store, sessionOf(user), { taskId: task.id, now: at(1) })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    }
    await expect(markDeptTaskRead(s.store, sessionOf(s.outsider), { taskId: task.id, now: at(1) })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'La tarea no existe o ya se retiró.',
    });
    expect(await readEvents(s)).toHaveLength(0);
  });

  it('una tarea retirada «no existe»', async () => {
    const s = setup();
    const task = await createFor(s);
    await removeDeptTask(s.store, sessionOf(s.lead), { taskId: task.id, now: at(1) });
    await expect(markDeptTaskRead(s.store, sessionOf(s.ana), { taskId: task.id })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('lectura automática (RF-05, CA-05, CA-06)', () => {
  it.each(['DOING', 'REVIEW', 'DONE'] as const)('la persona asignada la saca de «Por hacer» a %s: queda leída AUTO', async (status) => {
    const s = setup();
    const task = await createFor(s);
    await moveDeptTask(s.store, sessionOf(s.ana), { taskId: task.id, status, now: at(7) });
    expect((await cyclesOf(s, task))[0]).toMatchObject({ readAt: at(7).toISOString(), readSource: 'AUTO' });
    expect((await readEvents(s))[0]).toMatchObject({ userId: s.ana.id, newValue: { taskId: task.id, source: 'AUTO' } });
  });

  it('si la mueve otra persona no se marca; a «Hecha» guarda la resolución igualmente (CA-06)', async () => {
    const s = setup();
    const task = await createFor(s);
    await moveDeptTask(s.store, sessionOf(s.luis), { taskId: task.id, status: 'DONE', now: at(20) });
    expect((await cyclesOf(s, task))[0]).toMatchObject({ readAt: null, resolvedAt: at(20).toISOString() });
    expect(await readEvents(s)).toHaveLength(0);
  });

  it('una tarea ya leída no vuelve a marcarse al moverla', async () => {
    const s = setup();
    const task = await createFor(s);
    await markDeptTaskRead(s.store, sessionOf(s.ana), { taskId: task.id, now: at(2) });
    await moveDeptTask(s.store, sessionOf(s.ana), { taskId: task.id, status: 'DOING', now: at(9) });
    expect((await cyclesOf(s, task))[0]).toMatchObject({ readAt: at(2).toISOString(), readSource: 'MANUAL' });
    expect(await readEvents(s)).toHaveLength(1);
  });
});

describe('resolución (RF-07, RF-08, CA-08)', () => {
  it('reabrir desde «Hecha» borra la resolución y volver a «Hecha» la guarda de nuevo', async () => {
    const s = setup();
    const task = await createFor(s);
    await moveDeptTask(s.store, sessionOf(s.ana), { taskId: task.id, status: 'DONE', now: at(30) });
    await moveDeptTask(s.store, sessionOf(s.lead), { taskId: task.id, status: 'DOING', now: at(40) });
    expect((await cyclesOf(s, task))[0]?.resolvedAt).toBeNull();
    await moveDeptTask(s.store, sessionOf(s.ana), { taskId: task.id, status: 'DONE', now: at(55) });
    expect((await cyclesOf(s, task))[0]?.resolvedAt).toBe(at(55).toISOString());
  });

  it('el webhook de GitHub guarda la resolución pero nunca marca lectura (CA-05b)', async () => {
    const techLead = makeUser({ departments: ['TECH'], role: 'LEAD' });
    const dev = makeUser({ departments: ['TECH'], role: 'MEMBER' });
    const { store } = makeTestStore([], [techLead, dev]);
    const task = await createDeptTask(store, sessionOf(techLead), { title: 'Login con Google', assigneeId: dev.id, now: TEST_NOW });
    const pr: PullRequestEvent = {
      action: 'closed',
      repo: 'temotiva/app',
      number: 34,
      url: 'https://github.com/temotiva/app/pull/34',
      title: 'Login con Google',
      body: '',
      branch: `feat/${task.code}-login`,
      draft: false,
      merged: true,
    };
    await syncPullRequest(store, pr, at(90));
    expect((await store.listDeptTaskReads(task.id))[0]).toMatchObject({ readAt: null, resolvedAt: at(90).toISOString() });
    expect((await store.listActivityLog()).some((entry) => entry.actionType === 'TASK_READ')).toBe(false);
  });
});

describe('tareas anteriores a esta versión (RF-09, CA-10)', () => {
  async function legacyTask(s: Setup): Promise<DeptTask> {
    // Insertada directamente, como las tareas creadas antes de los ciclos.
    return s.store.insertDeptTask({
      id: '99999999-9999-4999-8999-999999999999',
      title: 'Tarea antigua',
      description: '',
      department: 'CYBER',
      status: 'TODO',
      assigneeId: s.ana.id,
      initiativeId: null,
      dueDate: null,
      createdBy: s.lead.id,
      createdAt: TEST_NOW.toISOString(),
      updatedAt: TEST_NOW.toISOString(),
      isArchived: false,
      code: null,
      estimatedHours: null,
      sprintId: null,
      pullRequest: null,
    });
  }

  it('muestra «Sin datos de lectura» y al marcarla abre un ciclo sin hora de asignación', async () => {
    const s = setup();
    const task = await legacyTask(s);
    const before = (await getTasksView(s.store, sessionOf(s.ana))).tasks.find((item) => item.id === task.id);
    expect(before?.readCycle).toEqual({ state: 'NO_DATA' });

    await markDeptTaskRead(s.store, sessionOf(s.ana), { taskId: task.id, now: at(4) });
    expect(await cyclesOf(s, task)).toEqual([
      expect.objectContaining({ assignedAt: null, readAt: at(4).toISOString(), readSource: 'MANUAL' }),
    ]);
  });

  it('sacarla de «Por hacer» siendo su persona también abre el ciclo, y la resolución se mide normal', async () => {
    const s = setup();
    const task = await legacyTask(s);
    await moveDeptTask(s.store, sessionOf(s.ana), { taskId: task.id, status: 'DOING', now: at(4) });
    await moveDeptTask(s.store, sessionOf(s.ana), { taskId: task.id, status: 'DONE', now: at(64) });
    expect((await cyclesOf(s, task))[0]).toMatchObject({ assignedAt: null, readSource: 'AUTO', resolvedAt: at(64).toISOString() });
  });
});

describe('Need-to-Know de la proyección (spec §6)', () => {
  it('sin persona no hay indicador; un área ajena no recibe la tarea ni su historial', async () => {
    const s = setup();
    const free = await createFor(s, null);
    const lead = (await getTasksView(s.store, sessionOf(s.lead))).tasks.find((item) => item.id === free.id);
    expect(lead?.readCycle).toBeNull();
    expect((await getTasksView(s.store, sessionOf(s.outsider))).tasks).toEqual([]);
  });
});
