import { describe, expect, it } from 'vitest';
import type { DepartmentRequest } from '@/domain/department-request';
import {
  addDepartmentRequestLinks,
  createDepartmentRequest,
  getDepartmentRequestsView,
  reassignDepartmentRequest,
  resolveDepartmentRequest,
  startDepartmentRequest,
  type CreateDepartmentRequestInput,
} from './department-requests';
import { TEST_NOW, hoursBefore, makeInitiative, makeSession, makeTestStore, makeUser, sessionOf } from './test-utils';

/**
 * Spec 004 — peticiones del buzón dirigidas a una persona (T-04).
 * Producto pide ayuda a Ana (Legal); Luis es otro miembro de Legal.
 */

const pedro = makeUser({ name: 'Pedro Producto', departments: ['PRODUCT'], role: 'MEMBER' });
const ana = makeUser({ name: 'Ana Abogada', departments: ['LEGAL', 'HR'], role: 'MEMBER' });
const luis = makeUser({ name: 'Luis Letrado', departments: ['LEGAL'], role: 'MEMBER' });
const legalLead = makeUser({ name: 'Lola Lead', departments: ['LEGAL'], role: 'LEAD' });
const cyberMember = makeUser({ name: 'Ciro Ciber', departments: ['CYBER'], role: 'MEMBER' });
const executive = makeSession([], 'EXECUTIVE');
const REASON = 'Ana está de vacaciones hasta el lunes.';

const REQUEST_ID = '22222222-2222-4222-8222-222222222222';

function makeRequest(overrides: Partial<DepartmentRequest> = {}): DepartmentRequest {
  return {
    id: REQUEST_ID,
    title: 'Revisión del consentimiento',
    description: 'Necesitamos validar el texto legal del consentimiento.',
    sourceDepartment: 'PRODUCT',
    targetDepartment: 'LEGAL',
    requestedBy: pedro.id,
    helpType: 'VALIDATION',
    status: 'PENDING',
    blocksInitiative: false,
    initiativeId: null,
    targetUserId: ana.id,
    assigneeId: null,
    resolutionNotes: null,
    resolvedBy: null,
    createdAt: hoursBefore(5),
    updatedAt: hoursBefore(5),
    resolvedAt: null,
    ...overrides,
  };
}

async function setup(request: DepartmentRequest | null = makeRequest()) {
  const { store } = makeTestStore([makeInitiative()], [pedro, ana, luis, legalLead, cyberMember]);
  if (request) await store.insertDepartmentRequest(request);
  return store;
}

function validInput(overrides: Partial<CreateDepartmentRequestInput> = {}): CreateDepartmentRequestInput {
  return {
    sourceDepartment: 'PRODUCT',
    targetDepartment: 'LEGAL',
    helpType: 'VALIDATION',
    title: 'Revisión del consentimiento',
    description: 'Necesitamos validar el texto legal del consentimiento.',
    blocksInitiative: false,
    targetUserId: ana.id,
    now: TEST_NOW,
    ...overrides,
  };
}

describe('crear una petición para una persona (RF-1..RF-3, AC-1, AC-4)', () => {
  it('guarda la persona junto al área destino y la audita solo con su id', async () => {
    const store = await setup(null);
    const request = await createDepartmentRequest(store, sessionOf(pedro), validInput());
    expect(request).toMatchObject({ targetDepartment: 'LEGAL', targetUserId: ana.id, status: 'PENDING' });

    const event = (await store.listActivityLog()).find((entry) => entry.actionType === 'DEPARTMENT_REQUEST_CREATED');
    expect(event?.newValue).toMatchObject({ targetUserId: ana.id, targetDepartment: 'LEGAL' });
    expect(JSON.stringify(event)).not.toContain(ana.email);
    expect(JSON.stringify(event)).not.toContain(ana.name);
  });

  it('sin persona sigue siendo una petición al área', async () => {
    const store = await setup(null);
    const request = await createDepartmentRequest(store, sessionOf(pedro), validInput({ targetUserId: null }));
    expect(request.targetUserId).toBeNull();
  });

  it('una persona multiárea se elige en cualquiera de sus áreas', async () => {
    const store = await setup(null);
    const request = await createDepartmentRequest(store, sessionOf(pedro), validInput({ targetDepartment: 'HR' }));
    expect(request).toMatchObject({ targetDepartment: 'HR', targetUserId: ana.id });
  });

  it.each([
    ['fuera del área destino', { targetDepartment: 'CYBER' as const }],
    ['inexistente', { targetUserId: '99999999-9999-4999-8999-999999999999' }],
  ])('rechaza a una persona %s sin persistir', async (_label, overrides) => {
    const store = await setup(null);
    await expect(createDepartmentRequest(store, sessionOf(pedro), validInput(overrides))).rejects.toMatchObject({
      code: 'VALIDATION',
      message: 'La persona elegida no puede recibir esta petición.',
    });
    expect(await store.listDepartmentRequests()).toEqual([]);
  });

  it('rechaza a una persona inactiva o anonimizada', async () => {
    for (const patch of [{ isActive: false }, { isAnonymized: true }]) {
      const store = await setup(null);
      await store.updateUser(ana.id, patch);
      await expect(createDepartmentRequest(store, sessionOf(pedro), validInput())).rejects.toMatchObject({ code: 'VALIDATION' });
      expect(await store.listDepartmentRequests()).toEqual([]);
    }
  });

  it('no se puede dirigir a uno mismo', async () => {
    const multi = makeUser({ departments: ['PRODUCT', 'LEGAL'], role: 'MEMBER' });
    const { store } = makeTestStore([makeInitiative()], [multi]);
    await expect(
      createDepartmentRequest(store, sessionOf(multi), validInput({ targetUserId: multi.id })),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
  });
});

describe('visibilidad y proyección (RF-4, AC-2, AC-10)', () => {
  it('todo Legal la ve con «Para: Ana»; Ana la ve como suya; Ciberseguridad no la ve', async () => {
    const store = await setup();
    const luisView = await getDepartmentRequestsView(store, sessionOf(luis));
    expect(luisView.requests[0]).toMatchObject({ targetUserId: ana.id, targetPersonName: ana.name, isForMe: false });
    const anaView = await getDepartmentRequestsView(store, sessionOf(ana));
    expect(anaView.requests[0]).toMatchObject({ isForMe: true, canStart: true });
    expect((await getDepartmentRequestsView(store, sessionOf(cyberMember))).requests).toEqual([]);
  });

  it('el listado de personas solo trae activas no anonimizadas, con nombre y áreas', async () => {
    const store = await setup();
    await store.updateUser(luis.id, { isActive: false });
    await store.updateUser(cyberMember.id, { isAnonymized: true });
    const view = await getDepartmentRequestsView(store, sessionOf(pedro));
    const ids = view.people.map((person) => person.id);
    expect(ids).toContain(ana.id);
    expect(ids).not.toContain(luis.id);
    expect(ids).not.toContain(cyberMember.id);
    for (const person of view.people) expect(Object.keys(person).sort()).toEqual(['departments', 'id', 'name']);
    expect(JSON.stringify(view.people)).not.toContain('@');
  });

  it('sin área ni permiso de reasignar no recibe el listado', async () => {
    const store = await setup();
    const noArea = makeUser({ departments: [], role: 'MEMBER' });
    await store.insertUser(noArea);
    expect((await getDepartmentRequestsView(store, sessionOf(noArea))).people).toEqual([]);
  });
});

describe('quién atiende una petición dirigida a una persona (RF-5, AC-3)', () => {
  it('otro miembro del área no puede tomarla ni resolverla', async () => {
    const store = await setup();
    await expect(startDepartmentRequest(store, sessionOf(luis), { requestId: REQUEST_ID, now: TEST_NOW })).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: expect.stringContaining('Esta petición es para Ana Abogada'),
    });
    await expect(
      resolveDepartmentRequest(store, sessionOf(luis), { requestId: REQUEST_ID, resolutionNotes: 'Lo miro yo.', now: TEST_NOW }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      addDepartmentRequestLinks(store, sessionOf(luis), {
        requestId: REQUEST_ID,
        side: 'RESPONSE',
        links: [{ label: 'Borrador', url: 'https://ejemplo.com/borrador' }],
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const view = await getDepartmentRequestsView(store, sessionOf(luis));
    expect(view.requests[0]).toMatchObject({ canStart: false, canResolve: false, canAttachResponse: false });
  });

  it('Ana la toma y queda asignada a ella', async () => {
    const store = await setup();
    const started = await startDepartmentRequest(store, sessionOf(ana), { requestId: REQUEST_ID, now: TEST_NOW });
    expect(started).toMatchObject({ status: 'IN_PROGRESS', assigneeId: ana.id, targetUserId: ana.id });
  });

  it('el LEAD del área y Dirección también pueden atenderla', async () => {
    const store = await setup();
    const started = await startDepartmentRequest(store, sessionOf(legalLead), { requestId: REQUEST_ID, now: TEST_NOW });
    expect(started.assigneeId).toBe(legalLead.id);
    const resolved = await resolveDepartmentRequest(store, executive, {
      requestId: REQUEST_ID,
      resolutionNotes: 'Revisado por Dirección.',
      now: TEST_NOW,
    });
    expect(resolved.status).toBe('RESOLVED');
  });
});

describe('persona que deja de poder recibirla (RF-6, AC-5)', () => {
  it.each([
    ['se da de baja', { isActive: false }],
    ['se anonimiza', { isAnonymized: true }],
    ['pierde el área', { departments: ['HR' as const] }],
  ])('si Ana %s, cualquiera de Legal puede tomarla y la fila no cambia', async (_label, patch) => {
    const store = await setup();
    await store.updateUser(ana.id, patch);
    const view = await getDepartmentRequestsView(store, sessionOf(luis));
    expect(view.requests[0]).toMatchObject({ targetUserId: null, targetPersonUnavailable: true, canStart: true });
    expect((await store.departmentRequestById(REQUEST_ID))?.targetUserId).toBe(ana.id);
    const started = await startDepartmentRequest(store, sessionOf(luis), { requestId: REQUEST_ID, now: TEST_NOW });
    expect(started.assigneeId).toBe(luis.id);
  });
});

describe('reasignar (RF-7, AC-6, AC-7)', () => {
  it('el LEAD la pasa a Luis con motivo y queda en la caja negra', async () => {
    const store = await setup();
    const updated = await reassignDepartmentRequest(store, sessionOf(legalLead), {
      requestId: REQUEST_ID,
      targetUserId: luis.id,
      reason: REASON,
      now: TEST_NOW,
    });
    expect(updated).toMatchObject({ targetUserId: luis.id, status: 'PENDING', assigneeId: null });

    const event = (await store.listActivityLog()).find((entry) => entry.actionType === 'DEPARTMENT_REQUEST_REASSIGNED');
    expect(event).toMatchObject({
      initiativeId: null,
      userId: legalLead.id,
      oldValue: { targetUserId: ana.id, assigneeId: null },
      newValue: { requestId: REQUEST_ID, targetUserId: luis.id, targetDepartment: 'LEGAL', reason: REASON },
    });

    // A partir de aquí, Ana ya no la atiende y Luis sí.
    await expect(startDepartmentRequest(store, sessionOf(ana), { requestId: REQUEST_ID, now: TEST_NOW })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect((await startDepartmentRequest(store, sessionOf(luis), { requestId: REQUEST_ID, now: TEST_NOW })).assigneeId).toBe(luis.id);
  });

  it('si estaba en curso, el trabajo pasa también a la nueva persona', async () => {
    const store = await setup(makeRequest({ status: 'IN_PROGRESS', assigneeId: ana.id }));
    const updated = await reassignDepartmentRequest(store, executive, {
      requestId: REQUEST_ID,
      targetUserId: luis.id,
      reason: REASON,
      now: TEST_NOW,
    });
    expect(updated).toMatchObject({ status: 'IN_PROGRESS', targetUserId: luis.id, assigneeId: luis.id });
  });

  it('dirige a una persona una petición que llegó al área (AC-7)', async () => {
    const store = await setup(makeRequest({ targetUserId: null }));
    await reassignDepartmentRequest(store, sessionOf(legalLead), {
      requestId: REQUEST_ID,
      targetUserId: luis.id,
      reason: REASON,
      now: TEST_NOW,
    });
    await expect(startDepartmentRequest(store, sessionOf(ana), { requestId: REQUEST_ID, now: TEST_NOW })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('el LEAD puede quedársela él mismo', async () => {
    const store = await setup();
    const updated = await reassignDepartmentRequest(store, sessionOf(legalLead), {
      requestId: REQUEST_ID,
      targetUserId: legalLead.id,
      reason: REASON,
      now: TEST_NOW,
    });
    expect(updated.targetUserId).toBe(legalLead.id);
  });

  it('ni un miembro del área destino, ni la destinataria, ni el área origen pueden reasignar', async () => {
    const store = await setup();
    for (const session of [sessionOf(luis), sessionOf(ana), sessionOf(pedro)]) {
      await expect(
        reassignDepartmentRequest(store, session, { requestId: REQUEST_ID, targetUserId: luis.id, reason: REASON, now: TEST_NOW }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    }
    // Un área ajena ni siquiera la ve.
    await expect(
      reassignDepartmentRequest(store, sessionOf(cyberMember), { requestId: REQUEST_ID, targetUserId: luis.id, reason: REASON }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rechaza motivo corto, persona fuera del área, la misma persona y peticiones resueltas', async () => {
    const store = await setup();
    const base = { requestId: REQUEST_ID, targetUserId: luis.id, reason: REASON, now: TEST_NOW };
    await expect(reassignDepartmentRequest(store, sessionOf(legalLead), { ...base, reason: 'corto' })).rejects.toMatchObject({
      code: 'VALIDATION',
    });
    await expect(
      reassignDepartmentRequest(store, sessionOf(legalLead), { ...base, targetUserId: cyberMember.id }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(reassignDepartmentRequest(store, sessionOf(legalLead), { ...base, targetUserId: ana.id })).rejects.toMatchObject({
      code: 'VALIDATION',
    });

    const resolvedStore = await setup(
      makeRequest({ status: 'RESOLVED', resolutionNotes: 'Hecho.', resolvedBy: ana.id, resolvedAt: hoursBefore(1) }),
    );
    await expect(reassignDepartmentRequest(resolvedStore, sessionOf(legalLead), base)).rejects.toMatchObject({
      code: 'INVALID_STATE',
    });
    expect((await store.listActivityLog()).some((entry) => entry.actionType === 'DEPARTMENT_REQUEST_REASSIGNED')).toBe(false);
  });

  it('la proyección marca canReassign solo para el LEAD del área destino y Dirección', async () => {
    const store = await setup();
    expect((await getDepartmentRequestsView(store, sessionOf(legalLead))).requests[0]?.canReassign).toBe(true);
    expect((await getDepartmentRequestsView(store, executive)).requests[0]?.canReassign).toBe(true);
    expect((await getDepartmentRequestsView(store, sessionOf(luis))).requests[0]?.canReassign).toBe(false);
    expect((await getDepartmentRequestsView(store, sessionOf(pedro))).requests[0]?.canReassign).toBe(false);
  });
});

describe('carreras (atomicidad)', () => {
  it('si la reasignan mientras Ana la abría, Ana no la toma', async () => {
    const store = await setup();
    // Simula que la reasignación gana entre la lectura de Ana y su escritura.
    const original = store.transitionDepartmentRequest.bind(store);
    store.transitionDepartmentRequest = async (id, from, patch, guard) => {
      await store.reassignDepartmentRequest(
        id,
        { status: 'PENDING', targetUserId: ana.id },
        { targetUserId: luis.id, updatedAt: TEST_NOW.toISOString() },
      );
      return original(id, from, patch, guard);
    };
    await expect(startDepartmentRequest(store, sessionOf(ana), { requestId: REQUEST_ID, now: TEST_NOW })).rejects.toMatchObject({
      code: 'INVALID_STATE',
    });
    expect((await store.departmentRequestById(REQUEST_ID))?.status).toBe('PENDING');
  });
});
