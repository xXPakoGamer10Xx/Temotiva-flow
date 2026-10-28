import { describe, expect, it } from 'vitest';
import { assignDeptTask, createDeptTask, getTasksView, moveDeptTask, removeDeptTask } from './dept-tasks';
import { TEST_NOW, makeInitiative, makeTestStore, makeUser, sessionOf } from './test-utils';

function setup() {
  const cyberLead = makeUser({ departments: ['CYBER'], role: 'LEAD' });
  const cyberMember = makeUser({ departments: ['CYBER'], role: 'MEMBER' });
  const cyberOther = makeUser({ departments: ['CYBER'], role: 'MEMBER' });
  const legalMember = makeUser({ departments: ['LEGAL'], role: 'MEMBER' });
  const boss = makeUser({ departments: ['PRODUCT'], role: 'EXECUTIVE' });
  const ctx = makeTestStore([makeInitiative()], [cyberLead, cyberMember, cyberOther, legalMember, boss]);
  return { ...ctx, cyberLead, cyberMember, cyberOther, legalMember, boss };
}

const create = (s: ReturnType<typeof setup>, user = s.cyberLead, extra = {}) =>
  createDeptTask(s.store, sessionOf(user), { title: 'Revisar política', now: TEST_NOW, ...extra });

describe('tareas de área', () => {
  it('solo el LEAD del área o Dirección crean tareas', async () => {
    const s = setup();
    await expect(create(s, s.cyberMember)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(create(s, s.cyberLead, { department: 'LEGAL' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect((await create(s, s.cyberLead)).department).toBe('CYBER');
    expect((await create(s, s.boss, { department: 'LEGAL' })).department).toBe('LEGAL');
  });

  it('valida título, fecha, asignado e iniciativa', async () => {
    const s = setup();
    await expect(create(s, s.cyberLead, { title: 'a' })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(create(s, s.cyberLead, { dueDate: '31/12/2026' })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(create(s, s.cyberLead, { assigneeId: s.legalMember.id })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(create(s, s.cyberLead, { initiativeId: 'TEMO-999' })).rejects.toMatchObject({ code: 'VALIDATION' });
    const ok = await create(s, s.cyberLead, { assigneeId: s.cyberMember.id, initiativeId: 'TEMO-500', dueDate: '2026-12-31' });
    expect(ok.assigneeId).toBe(s.cyberMember.id);
  });

  it('cualquier miembro del área mueve la tarea; otra área ni la ve', async () => {
    const s = setup();
    const task = await create(s);
    const moved = await moveDeptTask(s.store, sessionOf(s.cyberOther), { taskId: task.id, status: 'DOING', now: TEST_NOW });
    expect(moved.status).toBe('DOING');
    await expect(
      moveDeptTask(s.store, sessionOf(s.legalMember), { taskId: task.id, status: 'DONE' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await getTasksView(s.store, sessionOf(s.legalMember))).tasks).toEqual([]);
    expect((await getTasksView(s.store, sessionOf(s.cyberOther))).tasks).toHaveLength(1);
    expect((await getTasksView(s.store, sessionOf(s.boss))).tasks).toHaveLength(1);
  });

  it('el LEAD asigna; un miembro solo toma una tarea libre', async () => {
    const s = setup();
    const task = await create(s);
    await expect(
      assignDeptTask(s.store, sessionOf(s.cyberMember), { taskId: task.id, assigneeId: s.cyberOther.id }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await assignDeptTask(s.store, sessionOf(s.cyberMember), { taskId: task.id, assigneeId: s.cyberMember.id });
    // Ya la lleva alguien: otro miembro no se la quita.
    await expect(
      assignDeptTask(s.store, sessionOf(s.cyberOther), { taskId: task.id, assigneeId: s.cyberOther.id }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const reassigned = await assignDeptTask(s.store, sessionOf(s.cyberLead), { taskId: task.id, assigneeId: s.cyberOther.id });
    expect(reassigned.assigneeId).toBe(s.cyberOther.id);
  });

  it('retirar es baja lógica, solo del LEAD, y todo queda en la caja negra', async () => {
    const s = setup();
    const task = await create(s);
    await moveDeptTask(s.store, sessionOf(s.cyberMember), { taskId: task.id, status: 'DONE' });
    await expect(removeDeptTask(s.store, sessionOf(s.cyberMember), { taskId: task.id })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await removeDeptTask(s.store, sessionOf(s.cyberLead), { taskId: task.id });
    expect((await s.store.deptTaskById(task.id))?.isArchived).toBe(true);
    expect((await getTasksView(s.store, sessionOf(s.cyberLead))).tasks).toEqual([]);
    const log = (await s.store.listActivityLog()).map((e) => e.actionType);
    expect(log).toEqual(expect.arrayContaining(['TASK_CREATED', 'TASK_MOVED', 'TASK_REMOVED']));
  });
});
