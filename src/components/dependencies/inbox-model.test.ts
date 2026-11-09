import { describe, expect, it } from 'vitest';
import type {
  DepartmentRequestView,
  DepartmentRequestsView,
  InitiativeDependencyView,
} from '@/server/services/department-requests';
import {
  DEFAULT_INBOX_FILTERS,
  buildInboxItems,
  countByTab,
  filterInboxItems,
  involvedDepartments,
  requestBlockingLabel,
  type InboxFilters,
} from './inbox-model';

/** Lógica de presentación del buzón (spec 001, T-08; RF-4, RF-9, RF-12, RF-16). */

function request(overrides: Partial<DepartmentRequestView> = {}): DepartmentRequestView {
  return {
    id: 'req-1',
    title: 'Revisión del cifrado de datos clínicos',
    description: 'Validar el cifrado en reposo.',
    sourceDepartment: 'LEGAL',
    targetDepartment: 'CYBER',
    requestedByName: 'Lucía',
    helpType: 'VALIDATION',
    status: 'PENDING',
    blocksInitiative: false,
    initiativeId: null,
    initiativeTitle: null,
    assigneeId: null,
    assigneeName: null,
    resolutionNotes: null,
    resolvedByName: null,
    createdAt: '2026-11-06T10:00:00.000Z',
    updatedAt: '2026-11-06T10:00:00.000Z',
    resolvedAt: null,
    isIncoming: true,
    isOutgoing: false,
    canStart: true,
    canResolve: true,
    attachments: [],
    canAttachRequest: false,
    canAttachResponse: true,
    ...overrides,
  };
}

function dependency(overrides: Partial<InitiativeDependencyView> = {}): InitiativeDependencyView {
  return {
    id: 'dep-1',
    initiativeId: 'TEMO-012',
    initiativeTitle: 'Teleconsulta con historia clínica',
    ownerDepartment: 'PRODUCT',
    targetDepartment: 'CYBER',
    helpType: 'DECISION',
    isBlocking: true,
    status: 'PENDING',
    description: 'Dictamen sobre el proveedor de vídeo.',
    requestedByName: 'Paula',
    createdAt: '2026-11-06T12:00:00.000Z',
    resolvedAt: null,
    isIncoming: false,
    isOutgoing: true,
    ...overrides,
  };
}

function view(
  requests: DepartmentRequestView[],
  initiativeDependencies: InitiativeDependencyView[] = [],
): Pick<DepartmentRequestsView, 'requests' | 'initiativeDependencies'> {
  return { requests, initiativeDependencies };
}

const filters = (overrides: Partial<InboxFilters> = {}): InboxFilters => ({ ...DEFAULT_INBOX_FILTERS, ...overrides });

describe('buildInboxItems', () => {
  it('une peticiones y dependencias de iniciativa, de la más reciente a la más antigua', () => {
    const items = buildInboxItems(view([request()], [dependency()]));
    expect(items.map((item) => `${item.kind}:${item.id}`)).toEqual(['initiative:dep-1', 'request:req-1']);
  });
});

describe('filterInboxItems', () => {
  const items = buildInboxItems(
    view(
      [
        request({ id: 'in-open' }),
        request({ id: 'out-open', isIncoming: false, isOutgoing: true, sourceDepartment: 'CYBER', targetDepartment: 'HR' }),
        request({ id: 'in-doing', status: 'IN_PROGRESS' }),
        request({ id: 'in-done', status: 'RESOLVED' }),
        request({ id: 'in-blocking', blocksInitiative: true, title: 'Firma urgente del DPA' }),
      ],
      [dependency({ id: 'dep-out' }), dependency({ id: 'dep-closed', status: 'REJECTED' })],
    ),
  );
  const ids = (f: InboxFilters) => filterInboxItems(items, f).map((item) => item.id).sort();

  it('por defecto muestra las entrantes abiertas', () => {
    expect(DEFAULT_INBOX_FILTERS).toMatchObject({ tab: 'INCOMING', status: 'OPEN', onlyBlocking: false });
    expect(ids(filters())).toEqual(['in-blocking', 'in-doing', 'in-open']);
  });

  it('separa las bandejas entrantes y salientes', () => {
    expect(ids(filters({ tab: 'OUTGOING' }))).toEqual(['dep-out', 'out-open']);
    expect(ids(filters({ tab: 'ALL', status: 'ALL' }))).toHaveLength(7);
  });

  it('filtra por estado; las dependencias rechazadas cuentan como cerradas', () => {
    expect(ids(filters({ tab: 'ALL', status: 'IN_PROGRESS' }))).toEqual(['in-doing']);
    expect(ids(filters({ tab: 'ALL', status: 'CLOSED' }))).toEqual(['dep-closed', 'in-done']);
    expect(ids(filters({ tab: 'ALL', status: 'PENDING' }))).toEqual(['dep-out', 'in-blocking', 'in-open', 'out-open']);
  });

  it('«Solo bloqueantes» combina el indicador informativo y el bloqueo real', () => {
    expect(ids(filters({ tab: 'ALL', onlyBlocking: true }))).toEqual(['dep-out', 'in-blocking']);
  });

  it('filtra por área implicada (origen o destino)', () => {
    expect(ids(filters({ tab: 'ALL', department: 'HR' }))).toEqual(['out-open']);
    expect(ids(filters({ tab: 'ALL', department: 'PRODUCT' }))).toEqual(['dep-out']);
  });

  it('busca en título, descripción e iniciativa sin distinguir mayúsculas ni tildes', () => {
    expect(ids(filters({ tab: 'ALL', query: 'FIRMA' }))).toEqual(['in-blocking']);
    // «clínicos» en el título de las peticiones abiertas por defecto.
    expect(ids(filters({ tab: 'ALL', query: 'CLINICOS' }))).toEqual(['in-doing', 'in-open', 'out-open']);
    // «clínica» en el título de la iniciativa; la rechazada queda fuera por estar cerrada.
    expect(ids(filters({ tab: 'ALL', query: 'clinica' }))).toEqual(['dep-out']);
    expect(ids(filters({ tab: 'ALL', query: 'temo-012' }))).toEqual(['dep-out']);
    expect(ids(filters({ tab: 'ALL', query: '   ' }))).toHaveLength(5);
  });
});

describe('countByTab', () => {
  it('cuenta cada bandeja con el resto de filtros aplicados, solo sobre filas autorizadas', () => {
    const items = buildInboxItems(
      view([request(), request({ id: 'out', isIncoming: false, isOutgoing: true })], [dependency()]),
    );
    expect(countByTab(items, filters())).toEqual({ INCOMING: 1, OUTGOING: 2, ALL: 3 });
    expect(countByTab(items, filters({ onlyBlocking: true }))).toEqual({ INCOMING: 0, OUTGOING: 1, ALL: 1 });
  });
});

describe('involvedDepartments', () => {
  it('lista solo las áreas presentes en las filas visibles, sin repetir', () => {
    const items = buildInboxItems(view([request()], [dependency()]));
    expect(involvedDepartments(items)).toEqual(['PRODUCT', 'LEGAL', 'CYBER']);
  });
});

describe('requestBlockingLabel (RF-9)', () => {
  it('sin iniciativa: Prioridad Alta; con iniciativa: Bloquea iniciativa; nunca promete parar el SLE', () => {
    expect(requestBlockingLabel(request({ blocksInitiative: true }))).toBe('Prioridad Alta (No altera SLE)');
    expect(requestBlockingLabel(request({ blocksInitiative: true, initiativeId: 'TEMO-012' }))).toBe(
      'Bloquea iniciativa (No altera SLE)',
    );
    expect(requestBlockingLabel(request({ blocksInitiative: false }))).toBeNull();
  });
});
