import { afterEach, describe, expect, it } from 'vitest';
import type { DepartmentRequest } from '@/domain/department-request';
import type { ActionType } from '@/domain/enums';
import type { ActivityLogEntry, Dependency, DeptTask, JsonValue, User } from '@/domain/types';
import { STAGE_ID_BY_KEY } from '@/domain/workflow';
import { onAuditAppended } from './audit-listeners';
import { setManualStop } from './blocking';
import { createDependency } from './dependencies';
import { advanceStage } from './initiatives';
import { resolvePushTargets } from './push-targets';
import { TEST_NOW, completeGate, makeInitiative, makeTestStore, makeUser, sessionOf } from './test-utils';

/**
 * Quién recibe cada aviso push E1–E10 (spec 002 §6 y §7, T-05).
 *
 * Reparto: la iniciativa TEMO-500 está en VIABILIDAD con Legal como área dueña.
 */
function people() {
  return {
    legalMember: makeUser({ departments: ['LEGAL'], role: 'MEMBER' }),
    legalLead: makeUser({ departments: ['LEGAL'], role: 'LEAD' }),
    techMember: makeUser({ departments: ['TECH'], role: 'MEMBER' }),
    techLead: makeUser({ departments: ['TECH'], role: 'LEAD' }),
    designMember: makeUser({ departments: ['DESIGN'], role: 'MEMBER' }),
    designLead: makeUser({ departments: ['DESIGN'], role: 'LEAD' }),
    productMember: makeUser({ departments: ['PRODUCT'], role: 'MEMBER' }),
    executive: makeUser({ departments: ['PRODUCT'], role: 'EXECUTIVE' }),
    multiArea: makeUser({ departments: ['FINANCE', 'LEGAL'], role: 'MEMBER' }),
    outsider: makeUser({ departments: ['FINANCE'], role: 'MEMBER' }),
    inactive: makeUser({ departments: ['LEGAL'], role: 'MEMBER', isActive: false }),
    anonymized: makeUser({ departments: ['LEGAL'], role: 'MEMBER', isAnonymized: true }),
  };
}

type People = ReturnType<typeof people>;

function setup(initiative = makeInitiative()) {
  const p = people();
  const { store } = makeTestStore([initiative], Object.values(p));
  return { store, p };
}

let sequence = 0;
function entryOf(
  actionType: ActionType,
  actor: User,
  values: { initiativeId?: string | null; newValue?: JsonValue; oldValue?: JsonValue; fromStageId?: number; toStageId?: number } = {},
): ActivityLogEntry {
  sequence += 1;
  return {
    id: `entry-${sequence}`,
    initiativeId: values.initiativeId === undefined ? 'TEMO-500' : values.initiativeId,
    userId: actor.id,
    actionType,
    fromStageId: values.fromStageId ?? null,
    toStageId: values.toStageId ?? null,
    fieldName: null,
    oldValue: values.oldValue ?? null,
    newValue: values.newValue ?? null,
    overrideMetadata: null,
    createdAt: TEST_NOW.toISOString(),
  };
}

const sorted = (ids: string[] | undefined): string[] => [...(ids ?? [])].sort();
const idsOf = (...users: User[]): string[] => users.map((user) => user.id).sort();

/** Los que pertenecen a Legal y están activos: MEMBER, LEAD y la persona multi-área. */
const legalTeam = (p: People) => idsOf(p.legalMember, p.legalLead, p.multiArea);

function makeTask(overrides: Partial<DeptTask> = {}): DeptTask {
  return {
    id: '66666666-6666-4666-8666-666666666666',
    title: 'CENTINELA tarea',
    description: 'CENTINELA descripción',
    department: 'TECH',
    status: 'TODO',
    assigneeId: null,
    initiativeId: null,
    dueDate: null,
    createdBy: 'x',
    createdAt: TEST_NOW.toISOString(),
    updatedAt: TEST_NOW.toISOString(),
    isArchived: false,
    ...overrides,
  };
}

function makeDependency(requestedBy: string, overrides: Partial<Dependency> = {}): Dependency {
  return {
    id: '77777777-7777-4777-8777-777777777777',
    initiativeId: 'TEMO-500',
    requestedBy,
    targetDepartment: 'TECH',
    helpType: 'INFORMATION',
    isBlocking: false,
    description: 'CENTINELA descripción de la dependencia',
    checklistItemId: null,
    status: 'RESOLVED',
    resolutionNotes: 'CENTINELA notas',
    resolvedBy: null,
    createdAt: TEST_NOW.toISOString(),
    resolvedAt: TEST_NOW.toISOString(),
    ...overrides,
  };
}

function makeRequest(requestedBy: string, overrides: Partial<DepartmentRequest> = {}): DepartmentRequest {
  return {
    id: '88888888-8888-4888-8888-888888888888',
    title: 'CENTINELA petición',
    description: 'CENTINELA descripción de la petición',
    sourceDepartment: 'PRODUCT',
    targetDepartment: 'LEGAL',
    requestedBy,
    helpType: 'VALIDATION',
    status: 'PENDING',
    blocksInitiative: false,
    initiativeId: null,
    assigneeId: null,
    resolutionNotes: null,
    resolvedBy: null,
    createdAt: TEST_NOW.toISOString(),
    updatedAt: TEST_NOW.toISOString(),
    resolvedAt: null,
    ...overrides,
  };
}

describe('destinatarios por evento (E1–E10)', () => {
  it('E1 · tarea asignada: solo la persona asignada', async () => {
    const { store, p } = setup();
    await store.insertDeptTask(makeTask({ assigneeId: p.techMember.id, initiativeId: 'TEMO-500' }));
    const entry = entryOf('TASK_ASSIGNED', p.techLead, {
      newValue: { taskId: makeTask().id, assigneeId: p.techMember.id },
    });

    const targets = await resolvePushTargets(store, entry);
    expect(targets?.userIds).toEqual([p.techMember.id]);
    expect(targets?.message).toMatchObject({ kind: 'TASK_ASSIGNED', body: 'Tech · TEMO-500', url: '/tareas' });
  });

  it('E1 · quitar la asignación (assigneeId nulo) no avisa a nadie', async () => {
    const { store, p } = setup();
    await store.insertDeptTask(makeTask());
    const entry = entryOf('TASK_ASSIGNED', p.techLead, { newValue: { taskId: makeTask().id, assigneeId: null } });
    expect(await resolvePushTargets(store, entry)).toBeNull();
  });

  it('E1 · una tarea archivada no avisa', async () => {
    const { store, p } = setup();
    await store.insertDeptTask(makeTask({ isArchived: true }));
    const entry = entryOf('TASK_ASSIGNED', p.techLead, {
      initiativeId: null,
      newValue: { taskId: makeTask().id, assigneeId: p.techMember.id },
    });
    expect(await resolvePushTargets(store, entry)).toBeNull();
  });

  it('E2 · iniciativa asignada: solo la persona asignada', async () => {
    const { store, p } = setup();
    const entry = entryOf('ASSIGNEE_CHANGED', p.legalLead, { newValue: { assigneeId: p.legalMember.id } });
    const targets = await resolvePushTargets(store, entry);
    expect(targets?.userIds).toEqual([p.legalMember.id]);
    expect(targets?.message.kind).toBe('INITIATIVE_ASSIGNED');
  });

  it('E3 · nueva 🆘 de iniciativa: todo el área destino, nadie más', async () => {
    const { store, p } = setup();
    const entry = entryOf('DEPENDENCY_CREATED', p.legalMember, {
      newValue: { dependencyId: makeDependency(p.legalMember.id).id, targetDepartment: 'TECH', description: 'CENTINELA' },
    });
    const targets = await resolvePushTargets(store, entry);
    expect(sorted(targets?.userIds)).toEqual(idsOf(p.techMember, p.techLead));
    expect(targets?.message).toMatchObject({ kind: 'DEPENDENCY_INCOMING', title: '🆘 Petición de Legal / DPO · TEMO-500' });
  });

  it('E4 · nueva petición del buzón: todo el área destino', async () => {
    const { store, p } = setup();
    await store.insertDepartmentRequest(makeRequest(p.productMember.id));
    const entry = entryOf('DEPARTMENT_REQUEST_CREATED', p.productMember, {
      initiativeId: null,
      newValue: { requestId: makeRequest('x').id, sourceDepartment: 'PRODUCT', targetDepartment: 'LEGAL' },
    });
    const targets = await resolvePushTargets(store, entry);
    expect(sorted(targets?.userIds)).toEqual(legalTeam(p));
    expect(targets?.message).toMatchObject({ kind: 'REQUEST_INCOMING', url: '/dependencias' });
  });

  it('E5 · 🆘 resuelta: solo quien la pidió', async () => {
    const { store, p } = setup();
    await store.insertDependency(makeDependency(p.legalMember.id));
    const entry = entryOf('DEPENDENCY_RESOLVED', p.techMember, {
      newValue: { dependencyId: makeDependency('x').id, status: 'RESOLVED', targetDepartment: 'TECH' },
    });
    const targets = await resolvePushTargets(store, entry);
    expect(targets?.userIds).toEqual([p.legalMember.id]);
    expect(targets?.message).toMatchObject({ kind: 'DEPENDENCY_RESOLVED', title: '✅ Tech resolvió tu petición · TEMO-500' });
  });

  it('E6 · petición del buzón resuelta: solo quien la creó', async () => {
    const { store, p } = setup();
    await store.insertDepartmentRequest(makeRequest(p.productMember.id, { status: 'RESOLVED' }));
    const entry = entryOf('DEPARTMENT_REQUEST_RESOLVED', p.legalMember, {
      initiativeId: null,
      newValue: { requestId: makeRequest('x').id, status: 'RESOLVED', targetDepartment: 'LEGAL' },
    });
    const targets = await resolvePushTargets(store, entry);
    expect(targets?.userIds).toEqual([p.productMember.id]);
    expect(targets?.message.kind).toBe('REQUEST_RESOLVED');
  });

  it('E7 · cambio de fase: todo el área dueña de la fase nueva', async () => {
    const { store, p } = setup();
    const entry = entryOf('STAGE_TRANSITION', p.legalMember, {
      fromStageId: STAGE_ID_BY_KEY.FEASIBILITY,
      toStageId: STAGE_ID_BY_KEY.CO_DESIGN,
      newValue: { stageKey: 'CO_DESIGN', ownerDepartment: 'DESIGN' },
    });
    const targets = await resolvePushTargets(store, entry);
    expect(sorted(targets?.userIds)).toEqual(idsOf(p.designMember, p.designLead));
    expect(targets?.message).toMatchObject({ kind: 'ENTERED_BOARD', body: 'Co-Diseño · Diseño' });
  });

  it('E7 · reasignación de área: todo el área que la recibe', async () => {
    const { store, p } = setup(makeInitiative({ ownerDepartment: 'TECH' }));
    const entry = entryOf('OWNER_REASSIGNED', p.legalLead, {
      oldValue: { ownerDepartment: 'LEGAL' },
      newValue: { ownerDepartment: 'TECH', reason: 'CENTINELA motivo' },
    });
    const targets = await resolvePushTargets(store, entry);
    expect(sorted(targets?.userIds)).toEqual(idsOf(p.techMember, p.techLead));
    expect(targets?.message).toMatchObject({ kind: 'ENTERED_BOARD', body: 'Viabilidad · Tech' });
  });

  it('E8 · iniciativa nueva: todo el área dueña inicial', async () => {
    const { store, p } = setup(makeInitiative({ currentStageId: STAGE_ID_BY_KEY.IDEATION, ownerDepartment: 'LEGAL' }));
    const entry = entryOf('INITIATIVE_CREATED', p.productMember, {
      newValue: { title: 'CENTINELA título', ownerDepartment: 'LEGAL' },
    });
    const targets = await resolvePushTargets(store, entry);
    expect(sorted(targets?.userIds)).toEqual(legalTeam(p));
    expect(targets?.message.kind).toBe('INITIATIVE_CREATED');
  });

  it('E9 · avance excepcional: LEAD del área dueña de la fase nueva y EXECUTIVE', async () => {
    const { store, p } = setup();
    const entry = entryOf('EXCEPTION_OVERRIDE', p.legalLead, {
      fromStageId: STAGE_ID_BY_KEY.FEASIBILITY,
      toStageId: STAGE_ID_BY_KEY.CO_DESIGN,
      newValue: { stageKey: 'CO_DESIGN' },
    });
    const targets = await resolvePushTargets(store, entry);
    expect(sorted(targets?.userIds)).toEqual(idsOf(p.designLead, p.executive));
    expect(targets?.message).toMatchObject({ kind: 'OVERRIDE', body: 'Diseño' });
  });

  it('E10 · parada: todo el área dueña, LEAD incluidos', async () => {
    const { store, p } = setup();
    const entry = entryOf('BLOCKED_SET', p.techMember, {
      newValue: { isBlocked: true, stopReason: 'FALTA_CAPACIDAD', description: 'CENTINELA' },
    });
    const targets = await resolvePushTargets(store, entry);
    expect(sorted(targets?.userIds)).toEqual(legalTeam(p));
    expect(targets?.message.kind).toBe('BLOCKED');
  });

  it('el resto de eventos no genera avisos', async () => {
    const { store, p } = setup();
    for (const actionType of ['INITIATIVE_UPDATED', 'CHECKLIST_UPDATED', 'BLOCKED_CLEARED', 'DEPENDENCY_REJECTED'] as const) {
      expect(await resolvePushTargets(store, entryOf(actionType, p.legalMember))).toBeNull();
    }
  });
});

describe('reglas comunes', () => {
  it('quien provoca el evento nunca recibe su propio aviso', async () => {
    const { store, p } = setup();
    const entry = entryOf('BLOCKED_SET', p.legalLead, { newValue: { isBlocked: true } });
    const targets = await resolvePushTargets(store, entry);
    expect(targets?.userIds).not.toContain(p.legalLead.id);
    expect(sorted(targets?.userIds)).toEqual(idsOf(p.legalMember, p.multiArea));
  });

  it('asignarse a sí mismo no genera aviso', async () => {
    const { store, p } = setup();
    const entry = entryOf('ASSIGNEE_CHANGED', p.legalMember, { newValue: { assigneeId: p.legalMember.id } });
    expect(await resolvePushTargets(store, entry)).toBeNull();
  });

  it('perfiles revocados o anonimizados no reciben nada', async () => {
    const { store, p } = setup();
    const entry = entryOf('BLOCKED_SET', p.techMember, { newValue: { isBlocked: true } });
    const ids = (await resolvePushTargets(store, entry))?.userIds ?? [];
    expect(ids).not.toContain(p.inactive.id);
    expect(ids).not.toContain(p.anonymized.id);

    const toInactive = entryOf('ASSIGNEE_CHANGED', p.legalLead, { newValue: { assigneeId: p.inactive.id } });
    expect(await resolvePushTargets(store, toInactive)).toBeNull();
  });

  it('una iniciativa archivada no genera avisos', async () => {
    const { store, p } = setup(makeInitiative({ isArchived: true }));
    const entry = entryOf('BLOCKED_SET', p.techMember, { newValue: { isBlocked: true } });
    expect(await resolvePushTargets(store, entry)).toBeNull();
  });

  it('una iniciativa inexistente no genera avisos', async () => {
    const { store, p } = setup();
    const entry = entryOf('BLOCKED_SET', p.techMember, { initiativeId: 'TEMO-999', newValue: { isBlocked: true } });
    expect(await resolvePushTargets(store, entry)).toBeNull();
  });

  it('una persona con varias áreas recibe un único aviso', async () => {
    const { store, p } = setup();
    const entry = entryOf('BLOCKED_SET', p.techMember, { newValue: { isBlocked: true } });
    const ids = (await resolvePushTargets(store, entry))?.userIds ?? [];
    expect(ids.filter((id) => id === p.multiArea.id)).toHaveLength(1);
  });

  it('si no queda nadie tras los filtros, no hay aviso', async () => {
    const { store, p } = setup();
    const entry = entryOf('DEPENDENCY_CREATED', p.legalMember, {
      newValue: { dependencyId: 'd', targetDepartment: 'MARKETING' },
    });
    expect(await resolvePushTargets(store, entry)).toBeNull();
  });

  it('datos mal formados en el evento no lanzan: simplemente no avisan', async () => {
    const { store, p } = setup();
    const broken = [
      entryOf('DEPENDENCY_CREATED', p.legalMember, { newValue: { targetDepartment: 'NO_EXISTE' } }),
      entryOf('STAGE_TRANSITION', p.legalMember, { newValue: { stageKey: 'NO_EXISTE', ownerDepartment: 'DESIGN' } }),
      entryOf('TASK_ASSIGNED', p.legalMember, { newValue: 'texto' }),
      entryOf('DEPARTMENT_REQUEST_RESOLVED', p.legalMember, { initiativeId: null, newValue: { requestId: 'no-existe' } }),
      entryOf('EXCEPTION_OVERRIDE', p.legalMember, {}),
    ];
    for (const entry of broken) {
      await expect(resolvePushTargets(store, entry)).resolves.toBeNull();
    }
  });
});

describe('Need-to-Know por rol (constitución §3)', () => {
  it('MEMBER implicado sí, MEMBER ajeno no, LEAD de su área sí, EXECUTIVE solo en overrides', async () => {
    const { store, p } = setup();
    const created = await resolvePushTargets(
      store,
      entryOf('DEPENDENCY_CREATED', p.legalMember, { newValue: { dependencyId: 'd', targetDepartment: 'TECH' } }),
    );
    expect(created?.userIds).toContain(p.techMember.id);
    expect(created?.userIds).toContain(p.techLead.id);
    expect(created?.userIds).not.toContain(p.outsider.id);
    expect(created?.userIds).not.toContain(p.executive.id);
    expect(created?.userIds).not.toContain(p.legalLead.id);
  });

  it('las preferencias de equipo e individuales no cambian a quién llega el push (decisión D1)', async () => {
    const { store, p } = setup();
    const entry = entryOf('BLOCKED_SET', p.techMember, { newValue: { isBlocked: true } });
    const before = sorted((await resolvePushTargets(store, entry))?.userIds);

    await store.setDepartmentNotificationSetting({
      department: 'LEGAL',
      teamEnabled: false,
      updatedBy: p.legalLead.id,
      updatedAt: TEST_NOW.toISOString(),
    });
    await store.setNotificationPref({ userId: p.legalLead.id, enabled: false });

    expect(sorted((await resolvePushTargets(store, entry))?.userIds)).toEqual(before);
  });
});

describe('integración con los servicios reales (la forma de los eventos no se desvía)', () => {
  const captured: ActivityLogEntry[] = [];
  let off: (() => void) | null = null;
  function capture() {
    captured.length = 0;
    off = onAuditAppended((_store, entry) => {
      captured.push(entry);
    });
  }
  afterEach(() => {
    off?.();
    off = null;
  });

  it('createDependency → E3 al área destino', async () => {
    const { store, p } = setup();
    capture();
    await createDependency(store, sessionOf(p.legalMember), {
      initiativeId: 'TEMO-500',
      targetDepartment: 'TECH',
      helpType: 'INFORMATION',
      description: 'Necesitamos el inventario de tablas con datos personales.',
      isBlocking: false,
      now: TEST_NOW,
    });
    const entry = captured.find((e) => e.actionType === 'DEPENDENCY_CREATED');
    if (!entry) throw new Error('sin evento');
    const targets = await resolvePushTargets(store, entry);
    expect(sorted(targets?.userIds)).toEqual(idsOf(p.techMember, p.techLead));
  });

  it('advanceStage → E7 al área dueña de la fase nueva', async () => {
    const { store, p } = setup();
    await completeGate(store, 'TEMO-500', 'FEASIBILITY', p.legalMember.id);
    capture();
    await advanceStage(store, sessionOf(p.legalMember), { initiativeId: 'TEMO-500', now: TEST_NOW });
    const entry = captured.find((e) => e.actionType === 'STAGE_TRANSITION');
    if (!entry) throw new Error('sin evento');
    const targets = await resolvePushTargets(store, entry);
    expect(sorted(targets?.userIds)).toEqual(idsOf(p.designMember, p.designLead));
  });

  it('setManualStop → E10 al área dueña', async () => {
    const { store, p } = setup();
    capture();
    await setManualStop(store, sessionOf(p.legalLead), {
      initiativeId: 'TEMO-500',
      stopReason: 'FALTA_CAPACIDAD',
      description: 'Sin capacidad en el equipo hasta el próximo sprint.',
      now: TEST_NOW,
    });
    const entry = captured.find((e) => e.actionType === 'BLOCKED_SET');
    if (!entry) throw new Error('sin evento');
    const targets = await resolvePushTargets(store, entry);
    expect(sorted(targets?.userIds)).toEqual(idsOf(p.legalMember, p.multiArea));
  });
});
