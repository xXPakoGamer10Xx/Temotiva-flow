import { describe, expect, it } from 'vitest';
import type { DepartmentRequest } from '@/domain/department-request';
import type { Dependency } from '@/domain/types';
import {
  createDepartmentRequest,
  getDepartmentRequestsView,
  resolveDepartmentRequest,
  startDepartmentRequest,
  type CreateDepartmentRequestInput,
} from './department-requests';
import { TEST_NOW, hoursBefore, makeInitiative, makeSession, makeTestStore, makeUser, sessionOf } from './test-utils';

/**
 * Buzón de Dependencias (spec 001). Need-to-Know en servidor: la proyección
 * solo devuelve lo que la sesión puede ver, antes de llegar al cliente.
 */

const legalMember = makeUser({ name: 'Lucía Legal', departments: ['LEGAL'], role: 'MEMBER' });
const cyberMember = makeUser({ name: 'Ciro Ciber', departments: ['CYBER'], role: 'MEMBER' });
const productRequester = makeUser({ name: 'Paula Producto', departments: ['PRODUCT'], role: 'MEMBER' });

function makeRequest(overrides: Partial<DepartmentRequest> = {}): DepartmentRequest {
  return {
    id: 'req-1',
    title: 'Revisión del cifrado de datos clínicos',
    description: 'Necesitamos validar el cifrado en reposo antes de firmar.',
    sourceDepartment: 'LEGAL',
    targetDepartment: 'CYBER',
    requestedBy: legalMember.id,
    helpType: 'VALIDATION',
    status: 'PENDING',
    blocksInitiative: false,
    initiativeId: null,
    assigneeId: null,
    resolutionNotes: null,
    resolvedBy: null,
    createdAt: hoursBefore(5),
    updatedAt: hoursBefore(5),
    resolvedAt: null,
    ...overrides,
  };
}

function makeDependency(overrides: Partial<Dependency> = {}): Dependency {
  return {
    id: 'dep-1',
    initiativeId: 'TEMO-500',
    requestedBy: productRequester.id,
    targetDepartment: 'LEGAL',
    helpType: 'DECISION',
    isBlocking: true,
    description: 'Dictamen sobre la base legal del tratamiento.',
    checklistItemId: null,
    status: 'PENDING',
    resolutionNotes: null,
    resolvedBy: null,
    createdAt: hoursBefore(3),
    resolvedAt: null,
    ...overrides,
  };
}

async function setup(options: { requests?: DepartmentRequest[]; dependencies?: Dependency[] } = {}) {
  const initiatives = [
    makeInitiative({ id: 'TEMO-500', title: 'Teleconsulta con historia clínica', ownerDepartment: 'PRODUCT' }),
    makeInitiative({ id: 'TEMO-501', title: 'Iniciativa archivada de prueba', ownerDepartment: 'PRODUCT', isArchived: true }),
    makeInitiative({ id: 'TEMO-502', title: 'Iniciativa entre áreas ajenas', ownerDepartment: 'FINANCE' }),
  ];
  const { store } = makeTestStore(initiatives, [legalMember, cyberMember, productRequester]);
  for (const request of options.requests ?? [makeRequest()]) await store.insertDepartmentRequest(request);
  for (const dependency of options.dependencies ?? []) await store.insertDependency(dependency);
  return store;
}

describe('getDepartmentRequestsView — peticiones entre áreas (RF-4, RF-5, AC-1, AC-9)', () => {
  it('el área origen la ve como saliente y no puede gestionarla', async () => {
    const store = await setup();
    const view = await getDepartmentRequestsView(store, sessionOf(legalMember));

    expect(view.requests).toHaveLength(1);
    expect(view.requests[0]).toMatchObject({
      id: 'req-1',
      isOutgoing: true,
      isIncoming: false,
      canStart: false,
      canResolve: false,
      requestedByName: 'Lucía Legal',
      helpType: 'VALIDATION',
    });
  });

  it('el área destino la ve como entrante y puede tomarla o resolverla', async () => {
    const store = await setup();
    const view = await getDepartmentRequestsView(store, sessionOf(cyberMember));

    expect(view.requests[0]).toMatchObject({ isIncoming: true, isOutgoing: false, canStart: true, canResolve: true });
  });

  it('un MEMBER o LEAD de un área ajena no recibe ninguna fila (ni por conteo)', async () => {
    const store = await setup();
    for (const session of [makeSession('PRODUCT', 'MEMBER'), makeSession('PRODUCT', 'LEAD')]) {
      const view = await getDepartmentRequestsView(store, session);
      expect(view.requests).toEqual([]);
      expect(JSON.stringify(view)).not.toContain('cifrado');
    }
  });

  it('un LEAD de un área implicada la ve', async () => {
    const store = await setup();
    const view = await getDepartmentRequestsView(store, makeSession('CYBER', 'LEAD'));
    expect(view.requests.map((r) => r.id)).toEqual(['req-1']);
  });

  it('EXECUTIVE ve todas y puede gestionarlas aunque no sean de sus áreas', async () => {
    const store = await setup({
      requests: [makeRequest(), makeRequest({ id: 'req-2', sourceDepartment: 'HR', targetDepartment: 'FINANCE' })],
    });
    const view = await getDepartmentRequestsView(store, makeSession([], 'EXECUTIVE'));

    expect(view.requests.map((r) => r.id).sort()).toEqual(['req-1', 'req-2']);
    expect(view.requests.every((r) => r.canResolve && !r.isIncoming && !r.isOutgoing)).toBe(true);
  });

  it('las acciones dependen del estado: en curso solo se resuelve; resuelta, ninguna (RF-13)', async () => {
    const store = await setup({
      requests: [
        makeRequest({ id: 'doing', status: 'IN_PROGRESS', assigneeId: cyberMember.id }),
        makeRequest({
          id: 'done',
          status: 'RESOLVED',
          assigneeId: cyberMember.id,
          resolutionNotes: 'Cifrado validado.',
          resolvedBy: cyberMember.id,
          resolvedAt: TEST_NOW.toISOString(),
        }),
      ],
    });
    const view = await getDepartmentRequestsView(store, sessionOf(cyberMember));
    const byId = Object.fromEntries(view.requests.map((r) => [r.id, r]));

    expect(byId.doing).toMatchObject({ canStart: false, canResolve: true, assigneeName: 'Ciro Ciber' });
    expect(byId.done).toMatchObject({ canStart: false, canResolve: false, resolvedByName: 'Ciro Ciber' });
  });

  it('resuelve el título de la iniciativa asociada', async () => {
    const store = await setup({ requests: [makeRequest({ initiativeId: 'TEMO-500', blocksInitiative: true })] });
    const view = await getDepartmentRequestsView(store, sessionOf(legalMember));
    expect(view.requests[0]).toMatchObject({
      initiativeId: 'TEMO-500',
      initiativeTitle: 'Teleconsulta con historia clínica',
      blocksInitiative: true,
    });
  });
});

describe('getDepartmentRequestsView — dependencias de iniciativa en solo lectura (RF-16, AC-11)', () => {
  it('entrante para el área destino, con su bloqueo y estado reales', async () => {
    const store = await setup({ requests: [], dependencies: [makeDependency()] });
    const view = await getDepartmentRequestsView(store, sessionOf(legalMember));

    expect(view.initiativeDependencies).toHaveLength(1);
    expect(view.initiativeDependencies[0]).toMatchObject({
      id: 'dep-1',
      initiativeId: 'TEMO-500',
      initiativeTitle: 'Teleconsulta con historia clínica',
      ownerDepartment: 'PRODUCT',
      targetDepartment: 'LEGAL',
      isBlocking: true,
      status: 'PENDING',
      isIncoming: true,
      isOutgoing: false,
      requestedByName: 'Paula Producto',
    });
  });

  it('saliente para el área dueña actual', async () => {
    const store = await setup({ requests: [], dependencies: [makeDependency()] });
    const view = await getDepartmentRequestsView(store, makeSession('PRODUCT', 'LEAD'));
    expect(view.initiativeDependencies[0]).toMatchObject({ isOutgoing: true, isIncoming: false });
  });

  it('quien la abrió la sigue viendo como saliente si la iniciativa cambia de área dueña', async () => {
    const store = await setup({ requests: [], dependencies: [makeDependency({ initiativeId: 'TEMO-502' })] });

    const author = await getDepartmentRequestsView(store, sessionOf(productRequester));
    expect(author.initiativeDependencies[0]).toMatchObject({ isOutgoing: true });

    const colleague = await getDepartmentRequestsView(store, makeSession('PRODUCT', 'MEMBER'));
    expect(colleague.initiativeDependencies).toEqual([]);
  });

  it('excluye las de iniciativas archivadas y las de áreas ajenas', async () => {
    const store = await setup({
      requests: [],
      dependencies: [
        makeDependency({ id: 'archived', initiativeId: 'TEMO-501' }),
        makeDependency({ id: 'foreign', initiativeId: 'TEMO-502', targetDepartment: 'HR', requestedBy: 'otra-persona' }),
      ],
    });
    const view = await getDepartmentRequestsView(store, makeSession(['PRODUCT', 'LEGAL'], 'LEAD'));
    expect(view.initiativeDependencies).toEqual([]);
  });

  it('EXECUTIVE las ve todas salvo las archivadas', async () => {
    const store = await setup({
      requests: [],
      dependencies: [
        makeDependency(),
        makeDependency({ id: 'archived', initiativeId: 'TEMO-501' }),
        makeDependency({ id: 'foreign', initiativeId: 'TEMO-502', targetDepartment: 'HR', requestedBy: 'otra-persona' }),
      ],
    });
    const view = await getDepartmentRequestsView(store, makeSession([], 'EXECUTIVE'));
    expect(view.initiativeDependencies.map((d) => d.id).sort()).toEqual(['dep-1', 'foreign']);
  });
});

describe('getDepartmentRequestsView — datos del formulario de creación', () => {
  it('ofrece como origen solo las áreas de la sesión y como contexto solo iniciativas vivas', async () => {
    const store = await setup();
    const view = await getDepartmentRequestsView(store, makeSession(['LEGAL', 'HR'], 'MEMBER'));

    expect(view.canCreate).toBe(true);
    expect(view.sourceDepartments).toEqual(['LEGAL', 'HR']);
    expect(view.targetDepartments).toContain('CYBER');
    expect(view.initiatives.map((i) => i.id)).toEqual(['TEMO-500', 'TEMO-502']);
  });

  it('sin áreas no se puede crear', async () => {
    const store = await setup();
    const view = await getDepartmentRequestsView(store, makeSession([], 'MEMBER'));
    expect(view.canCreate).toBe(false);
    expect(view.sourceDepartments).toEqual([]);
  });
});

describe('createDepartmentRequest (RF-2, RF-3, RF-9, RF-10, RF-11, RF-14)', () => {
  const validInput = (overrides: Partial<CreateDepartmentRequestInput> = {}): CreateDepartmentRequestInput => ({
    sourceDepartment: 'LEGAL',
    targetDepartment: 'CYBER',
    helpType: 'VALIDATION',
    title: '  Revisión del cifrado de datos clínicos  ',
    description: '  Necesitamos validar el cifrado en reposo antes de firmar.  ',
    blocksInitiative: false,
    initiativeId: null,
    now: TEST_NOW,
    ...overrides,
  });

  it('crea la petición PENDING con autor y fechas de servidor, y la deja visible', async () => {
    const store = await setup({ requests: [] });
    const request = await createDepartmentRequest(store, sessionOf(legalMember), validInput());

    expect(request).toMatchObject({
      status: 'PENDING',
      requestedBy: legalMember.id,
      sourceDepartment: 'LEGAL',
      targetDepartment: 'CYBER',
      helpType: 'VALIDATION',
      title: 'Revisión del cifrado de datos clínicos',
      description: 'Necesitamos validar el cifrado en reposo antes de firmar.',
      assigneeId: null,
      createdAt: TEST_NOW.toISOString(),
      updatedAt: TEST_NOW.toISOString(),
      resolvedAt: null,
    });
    expect(await store.departmentRequestById(request.id)).toEqual(request);
    const cyberView = await getDepartmentRequestsView(store, sessionOf(cyberMember));
    expect(cyberView.requests.map((r) => r.id)).toEqual([request.id]);
  });

  it('audita DEPARTMENT_REQUEST_CREATED con el user_id de la sesión, sin volcar textos (AC-6)', async () => {
    const store = await setup({ requests: [] });
    const request = await createDepartmentRequest(store, sessionOf(legalMember), validInput());

    const events = (await store.listActivityLog()).filter((e) => e.actionType === 'DEPARTMENT_REQUEST_CREATED');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      userId: legalMember.id,
      initiativeId: null,
      fieldName: 'department_requests',
      newValue: {
        requestId: request.id,
        sourceDepartment: 'LEGAL',
        targetDepartment: 'CYBER',
        helpType: 'VALIDATION',
        status: 'PENDING',
        blocksInitiative: false,
        initiativeId: null,
      },
    });
    expect(JSON.stringify(events[0])).not.toMatch(/cifrado/);
  });

  it('rechaza un origen que no es de la sesión, sin persistir nada (RF-14, AC-8)', async () => {
    const store = await setup({ requests: [] });
    await expect(
      createDepartmentRequest(store, sessionOf(legalMember), validInput({ sourceDepartment: 'PRODUCT' })),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    // Ni siquiera Dirección pide en nombre de un área que no lleva.
    await expect(
      createDepartmentRequest(store, makeSession([], 'EXECUTIVE'), validInput()),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(await store.listDepartmentRequests()).toEqual([]);
    expect(await store.listActivityLog()).toEqual([]);
  });

  it('rechaza pedirse ayuda a la propia área', async () => {
    const store = await setup({ requests: [] });
    await expect(
      createDepartmentRequest(store, sessionOf(legalMember), validInput({ targetDepartment: 'LEGAL' })),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(await store.listDepartmentRequests()).toEqual([]);
  });

  it.each([
    ['título corto', { title: 'Corto' }],
    ['título largo', { title: 'x'.repeat(121) }],
    ['descripción corta', { description: 'Poco texto.' }],
    ['tipo fuera de HELP_TYPES_V1 (AC-10)', { helpType: 'UNBLOCK' as const }],
  ])('rechaza %s', async (_label, overrides) => {
    const store = await setup({ requests: [] });
    await expect(
      createDepartmentRequest(store, sessionOf(legalMember), validInput(overrides)),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(await store.listDepartmentRequests()).toEqual([]);
  });

  it.each([
    ['inexistente', 'TEMO-999'],
    ['archivada', 'TEMO-501'],
  ])('rechaza una iniciativa %s con el mismo mensaje', async (_label, initiativeId) => {
    const store = await setup({ requests: [] });
    await expect(
      createDepartmentRequest(store, sessionOf(legalMember), validInput({ initiativeId })),
    ).rejects.toThrow('La iniciativa indicada no existe o está archivada.');
    expect(await store.listDepartmentRequests()).toEqual([]);
  });

  it('el bloqueo es informativo: la iniciativa conserva parada y SLE intactos (AC-5)', async () => {
    const store = await setup({ requests: [] });
    const before = await store.initiativeById('TEMO-500');

    await createDepartmentRequest(
      store,
      sessionOf(legalMember),
      validInput({ initiativeId: 'TEMO-500', blocksInitiative: true }),
    );

    const after = await store.initiativeById('TEMO-500');
    expect(after).toEqual(before);
    expect(after).toMatchObject({ isBlocked: false, stopReason: null, blockedSince: null });
    const blockEvents = (await store.listActivityLog()).filter((e) => e.actionType === 'BLOCKED_SET');
    expect(blockEvents).toEqual([]);
  });

  it('con iniciativa, el evento es global y no aparece en la caja negra de la ficha (Need-to-Know)', async () => {
    const store = await setup({ requests: [] });
    await createDepartmentRequest(store, sessionOf(legalMember), validInput({ initiativeId: 'TEMO-500' }));

    expect(await store.listActivityLog('TEMO-500')).toEqual([]);
    const [event] = await store.listActivityLog();
    expect(event).toMatchObject({ initiativeId: null, newValue: { initiativeId: 'TEMO-500' } });
  });
});

describe('startDepartmentRequest y resolveDepartmentRequest (RF-6, RF-7, RF-8, RF-13, AC-3, AC-4)', () => {
  const LATER = new Date(TEST_NOW.getTime() + 60 * 60 * 1000);

  it('el área destino la toma: queda En curso, asignada a quien la toma y auditada', async () => {
    const store = await setup();
    const started = await startDepartmentRequest(store, sessionOf(cyberMember), { requestId: 'req-1', now: TEST_NOW });

    expect(started).toMatchObject({ status: 'IN_PROGRESS', assigneeId: cyberMember.id, updatedAt: TEST_NOW.toISOString() });
    const [event] = await store.listActivityLog();
    expect(event).toMatchObject({
      actionType: 'DEPARTMENT_REQUEST_STARTED',
      userId: cyberMember.id,
      initiativeId: null,
      fieldName: 'department_requests',
      oldValue: { status: 'PENDING' },
      newValue: { requestId: 'req-1', status: 'IN_PROGRESS', assigneeId: cyberMember.id, targetDepartment: 'CYBER' },
    });
  });

  it('solo se toma una petición Pendiente', async () => {
    const store = await setup();
    await startDepartmentRequest(store, sessionOf(cyberMember), { requestId: 'req-1', now: TEST_NOW });
    await expect(
      startDepartmentRequest(store, makeSession('CYBER', 'LEAD'), { requestId: 'req-1', now: LATER }),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
    expect(await store.listActivityLog()).toHaveLength(1);
  });

  /** Simula la carrera: el servicio lee la petición Pendiente, pero otra persona la resuelve antes de que escriba. */
  async function withStaleRead(store: Awaited<ReturnType<typeof setup>>, otherId: string) {
    const stale = await store.departmentRequestById('req-1');
    await store.updateDepartmentRequest('req-1', {
      status: 'RESOLVED',
      assigneeId: otherId,
      resolutionNotes: 'Respuesta de otra persona.',
      resolvedBy: otherId,
      resolvedAt: TEST_NOW.toISOString(),
    });
    store.departmentRequestById = async () => (stale ? { ...stale } : null);
  }

  it('tomar no pisa una petición que otra persona resolvió entre la lectura y la escritura', async () => {
    const store = await setup();
    await withStaleRead(store, legalMember.id);

    await expect(
      startDepartmentRequest(store, sessionOf(cyberMember), { requestId: 'req-1', now: LATER }),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });

    const [stored] = await store.listDepartmentRequests();
    expect(stored).toMatchObject({ status: 'RESOLVED', assigneeId: legalMember.id, resolvedBy: legalMember.id });
    expect(await store.listActivityLog()).toHaveLength(0);
  });

  it('resolver no pisa la respuesta de otra persona ni deja enlaces ni eventos de quien pierde', async () => {
    const store = await setup();
    await withStaleRead(store, legalMember.id);

    await expect(
      resolveDepartmentRequest(store, sessionOf(cyberMember), {
        requestId: 'req-1',
        resolutionNotes: 'Mi respuesta llegó tarde y no debe sobrescribir.',
        links: [{ label: 'Informe', url: 'https://example.com/informe' }],
        now: LATER,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });

    const [stored] = await store.listDepartmentRequests();
    expect(stored).toMatchObject({ status: 'RESOLVED', resolutionNotes: 'Respuesta de otra persona.' });
    expect(await store.listDepartmentRequestAttachments('req-1')).toHaveLength(0);
    expect(await store.listActivityLog()).toHaveLength(0);
  });

  it('el área destino la resuelve con notas: queda Resuelta, con autor y fecha, sin volcar las notas al log', async () => {
    const store = await setup();
    await startDepartmentRequest(store, sessionOf(cyberMember), { requestId: 'req-1', now: TEST_NOW });
    const resolved = await resolveDepartmentRequest(store, sessionOf(cyberMember), {
      requestId: 'req-1',
      resolutionNotes: '  Cifrado AES-256 validado en reposo.  ',
      now: LATER,
    });

    expect(resolved).toMatchObject({
      status: 'RESOLVED',
      assigneeId: cyberMember.id,
      resolutionNotes: 'Cifrado AES-256 validado en reposo.',
      resolvedBy: cyberMember.id,
      resolvedAt: LATER.toISOString(),
      updatedAt: LATER.toISOString(),
    });
    const resolvedEvent = (await store.listActivityLog()).find((e) => e.actionType === 'DEPARTMENT_REQUEST_RESOLVED');
    expect(resolvedEvent).toMatchObject({
      userId: cyberMember.id,
      initiativeId: null,
      oldValue: { status: 'IN_PROGRESS' },
      newValue: { requestId: 'req-1', status: 'RESOLVED', targetDepartment: 'CYBER' },
    });
    expect(JSON.stringify(resolvedEvent)).not.toMatch(/AES/);
  });

  it('también se resuelve directamente desde Pendiente', async () => {
    const store = await setup();
    const resolved = await resolveDepartmentRequest(store, makeSession('CYBER', 'MEMBER'), {
      requestId: 'req-1',
      resolutionNotes: 'Ya estaba validado.',
      now: TEST_NOW,
    });
    expect(resolved).toMatchObject({ status: 'RESOLVED', assigneeId: null });
  });

  it('exige notas de al menos 5 caracteres y no cambia nada si faltan', async () => {
    const store = await setup();
    await expect(
      resolveDepartmentRequest(store, sessionOf(cyberMember), { requestId: 'req-1', resolutionNotes: '  ok  ', now: TEST_NOW }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    expect((await store.departmentRequestById('req-1'))?.status).toBe('PENDING');
    expect(await store.listActivityLog()).toEqual([]);
  });

  it('el área origen la ve pero no puede tomarla ni resolverla: error de autorización (AC-4)', async () => {
    const store = await setup();
    await expect(
      startDepartmentRequest(store, sessionOf(legalMember), { requestId: 'req-1', now: TEST_NOW }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      resolveDepartmentRequest(store, makeSession('LEGAL', 'LEAD'), {
        requestId: 'req-1',
        resolutionNotes: 'Me doy por atendido.',
        now: TEST_NOW,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect((await store.departmentRequestById('req-1'))?.status).toBe('PENDING');
  });

  it('para un área ajena la petición no existe: mismo error que un id inventado (RF-8)', async () => {
    const store = await setup();
    const outsider = makeSession('PRODUCT', 'LEAD');

    await expect(
      startDepartmentRequest(store, outsider, { requestId: 'req-1', now: TEST_NOW }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', message: 'La petición no existe.' });
    await expect(
      resolveDepartmentRequest(store, outsider, { requestId: 'req-1', resolutionNotes: 'Intento ajeno.', now: TEST_NOW }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', message: 'La petición no existe.' });
    await expect(
      startDepartmentRequest(store, sessionOf(cyberMember), { requestId: 'no-such-id', now: TEST_NOW }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', message: 'La petición no existe.' });
  });

  it('una petición Resuelta queda en solo lectura (RF-13)', async () => {
    const store = await setup();
    await resolveDepartmentRequest(store, sessionOf(cyberMember), {
      requestId: 'req-1',
      resolutionNotes: 'Resuelta a la primera.',
      now: TEST_NOW,
    });
    await expect(
      startDepartmentRequest(store, sessionOf(cyberMember), { requestId: 'req-1', now: LATER }),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
    await expect(
      resolveDepartmentRequest(store, sessionOf(cyberMember), {
        requestId: 'req-1',
        resolutionNotes: 'Reescribo la respuesta.',
        now: LATER,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
    expect((await store.departmentRequestById('req-1'))?.resolutionNotes).toBe('Resuelta a la primera.');
  });

  it('EXECUTIVE puede cerrar una petición de áreas ajenas y queda rastro con su user_id (AC-2)', async () => {
    const store = await setup();
    const executive = makeSession([], 'EXECUTIVE');
    await resolveDepartmentRequest(store, executive, {
      requestId: 'req-1',
      resolutionNotes: 'Cerrada por Dirección.',
      now: TEST_NOW,
    });
    const [event] = await store.listActivityLog();
    expect(event).toMatchObject({ actionType: 'DEPARTMENT_REQUEST_RESOLVED', userId: executive.userId });
  });

  it('tomar y resolver una petición bloqueante no altera la iniciativa (AC-5)', async () => {
    const store = await setup({ requests: [makeRequest({ initiativeId: 'TEMO-500', blocksInitiative: true })] });
    const before = await store.initiativeById('TEMO-500');
    await startDepartmentRequest(store, sessionOf(cyberMember), { requestId: 'req-1', now: TEST_NOW });
    await resolveDepartmentRequest(store, sessionOf(cyberMember), {
      requestId: 'req-1',
      resolutionNotes: 'Hecho y validado.',
      now: LATER,
    });
    expect(await store.initiativeById('TEMO-500')).toEqual(before);
    expect(await store.listActivityLog('TEMO-500')).toEqual([]);
  });
});

describe('getDepartmentRequestsView — listados acotados (spec §10, rendimiento)', () => {
  const minutesAgo = (minutes: number): string => new Date(TEST_NOW.getTime() - minutes * 60_000).toISOString();

  it('devuelve todas las abiertas y solo las 100 cerradas más recientes de cada fuente', async () => {
    const closedRequests = Array.from({ length: 102 }, (_, index) =>
      makeRequest({
        id: `closed-${index}`,
        status: 'RESOLVED',
        resolutionNotes: 'Atendida.',
        resolvedBy: cyberMember.id,
        resolvedAt: minutesAgo(index),
        createdAt: minutesAgo(index + 1000),
      }),
    );
    const openRequests = [
      makeRequest({ id: 'open-old', createdAt: minutesAgo(99_999) }),
      makeRequest({ id: 'open-new', status: 'IN_PROGRESS', assigneeId: cyberMember.id }),
    ];
    const closedDependencies = Array.from({ length: 101 }, (_, index) =>
      makeDependency({ id: `dep-closed-${index}`, status: 'RESOLVED', createdAt: minutesAgo(index) }),
    );
    const store = await setup({
      requests: [...closedRequests, ...openRequests],
      dependencies: [...closedDependencies, makeDependency({ id: 'dep-open', createdAt: minutesAgo(99_999) })],
    });

    const view = await getDepartmentRequestsView(store, sessionOf(legalMember));
    const ids = view.requests.map((r) => r.id);

    expect(view.requests.filter((r) => r.status === 'RESOLVED')).toHaveLength(100);
    expect(ids).toEqual(expect.arrayContaining(['open-old', 'open-new', 'closed-0', 'closed-99']));
    expect(ids).not.toContain('closed-100');
    expect(ids).not.toContain('closed-101');

    const depIds = view.initiativeDependencies.map((d) => d.id);
    expect(depIds).toHaveLength(101);
    expect(depIds).toContain('dep-open');
    expect(depIds).not.toContain('dep-closed-100');

    expect(view.closedTruncated).toBe(true);
  });

  it('no avisa de recorte cuando no lo hay', async () => {
    const store = await setup();
    const view = await getDepartmentRequestsView(store, sessionOf(legalMember));
    expect(view.closedTruncated).toBe(false);
  });
});
