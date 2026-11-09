import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import type { DepartmentRequest, DepartmentRequestAttachment } from '@/domain/department-request';
import { buildSeedData } from '@/domain/seed';
import { InMemoryDataStore } from './in-memory';

// `postgres.ts` se declara solo-servidor; fuera de Next el marcador lanzaría.
vi.mock('server-only', () => ({}));

const { PostgresDataStore } = await import('./postgres');

/** Persistencia dual de peticiones entre áreas (spec 001, T-02). */

function makeRequest(overrides: Partial<DepartmentRequest> = {}): DepartmentRequest {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Revisión del consentimiento',
    description: 'Necesitamos validar el texto legal del consentimiento.',
    sourceDepartment: 'PRODUCT',
    targetDepartment: 'LEGAL',
    requestedBy: 'u-product',
    helpType: 'VALIDATION',
    status: 'PENDING',
    blocksInitiative: false,
    initiativeId: null,
    assigneeId: null,
    resolutionNotes: null,
    resolvedBy: null,
    createdAt: '2026-11-06T10:00:00.000Z',
    updatedAt: '2026-11-06T10:00:00.000Z',
    resolvedAt: null,
    ...overrides,
  };
}

describe('InMemoryDataStore — peticiones entre áreas', () => {
  it('arranca vacío con una semilla que no trae la colección (snapshots anteriores)', async () => {
    const seed = buildSeedData();
    delete seed.departmentRequests;
    const store = new InMemoryDataStore(seed);
    expect(await store.listDepartmentRequests()).toEqual([]);
  });

  it('inserta, lee por id y lista de la más reciente a la más antigua', async () => {
    const store = new InMemoryDataStore();
    const older = makeRequest({ id: 'a', createdAt: '2026-11-01T00:00:00.000Z' });
    const newer = makeRequest({ id: 'b', createdAt: '2026-11-05T00:00:00.000Z' });
    await store.insertDepartmentRequest(older);
    await store.insertDepartmentRequest(newer);

    expect(await store.departmentRequestById('a')).toEqual(older);
    expect(await store.departmentRequestById('missing')).toBeNull();
    expect((await store.listDepartmentRequests()).map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('devuelve copias defensivas: mutar el resultado no altera el store', async () => {
    const store = new InMemoryDataStore();
    const inserted = await store.insertDepartmentRequest(makeRequest());
    inserted.status = 'RESOLVED';
    const [listed] = await store.listDepartmentRequests();
    if (!listed) throw new Error('lista vacía');
    listed.title = 'manipulado';

    const stored = await store.departmentRequestById(inserted.id);
    expect(stored?.status).toBe('PENDING');
    expect(stored?.title).toBe('Revisión del consentimiento');
  });

  it('aplica solo los campos del parche y conserva el resto', async () => {
    const store = new InMemoryDataStore();
    const request = await store.insertDepartmentRequest(makeRequest());
    const updated = await store.updateDepartmentRequest(request.id, {
      status: 'IN_PROGRESS',
      assigneeId: 'u-legal',
      updatedAt: '2026-11-06T11:00:00.000Z',
    });

    expect(updated).toEqual({
      ...request,
      status: 'IN_PROGRESS',
      assigneeId: 'u-legal',
      updatedAt: '2026-11-06T11:00:00.000Z',
    });
    await expect(store.updateDepartmentRequest('missing', { status: 'RESOLVED' })).rejects.toThrow();
  });

  it('transiciona solo si la petición sigue en el estado esperado', async () => {
    const store = new InMemoryDataStore();
    const request = await store.insertDepartmentRequest(makeRequest());

    const first = await store.transitionDepartmentRequest(request.id, 'PENDING', {
      status: 'IN_PROGRESS',
      assigneeId: 'u-legal',
    });
    expect(first).toMatchObject({ status: 'IN_PROGRESS', assigneeId: 'u-legal' });

    // Segunda intención sobre el mismo estado de partida: no escribe nada.
    const second = await store.transitionDepartmentRequest(request.id, 'PENDING', {
      status: 'IN_PROGRESS',
      assigneeId: 'u-otra-persona',
    });
    expect(second).toBeNull();
    expect((await store.departmentRequestById(request.id))?.assigneeId).toBe('u-legal');
    await expect(store.transitionDepartmentRequest('missing', 'PENDING', { status: 'RESOLVED' })).rejects.toThrow();
  });

  it('avisa al snapshot en cada mutación', async () => {
    const store = new InMemoryDataStore();
    const listener = vi.fn();
    store.setChangeListener(listener);
    const request = await store.insertDepartmentRequest(makeRequest());
    await store.updateDepartmentRequest(request.id, { status: 'IN_PROGRESS', assigneeId: 'u-legal' });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('sobrevive a un ciclo snapshot → hidratación', async () => {
    const store = new InMemoryDataStore();
    const request = await store.insertDepartmentRequest(makeRequest({ blocksInitiative: true, initiativeId: 'TEMO-001' }));

    const restored = new InMemoryDataStore(store.snapshot());
    expect(await restored.departmentRequestById(request.id)).toEqual(request);
  });
});

/** Pool falso: registra cada consulta y responde con las filas preparadas. */
function fakePool(rows: Record<string, unknown>[] = [], rowCount: number = rows.length) {
  const calls: { sql: string; params: unknown[] }[] = [];
  const pool = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      return { rows, rowCount };
    }),
  };
  return { pool: pool as unknown as Pool, calls };
}

const ROW = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Revisión del consentimiento',
  description: 'Necesitamos validar el texto legal del consentimiento.',
  source_department: 'PRODUCT',
  target_department: 'LEGAL',
  requested_by: 'u-product',
  help_type: 'VALIDATION',
  status: 'IN_PROGRESS',
  blocks_initiative: true,
  initiative_id: 'TEMO-001',
  assignee_id: 'u-legal',
  resolution_notes: null,
  resolved_by: null,
  created_at: new Date('2026-11-06T10:00:00.000Z'),
  updated_at: new Date('2026-11-06T11:00:00.000Z'),
  resolved_at: null,
};

describe('PostgresDataStore — peticiones entre áreas', () => {
  it('mapea snake_case a camelCase y las fechas a ISO-8601', async () => {
    const { pool } = fakePool([ROW]);
    const store = new PostgresDataStore(pool);
    expect(await store.departmentRequestById(ROW.id)).toEqual(
      makeRequest({
        status: 'IN_PROGRESS',
        blocksInitiative: true,
        initiativeId: 'TEMO-001',
        assigneeId: 'u-legal',
        updatedAt: '2026-11-06T11:00:00.000Z',
      }),
    );
  });

  it('devuelve null si la petición no existe', async () => {
    const { pool } = fakePool([]);
    expect(await new PostgresDataStore(pool).departmentRequestById('x')).toBeNull();
  });

  it('lista desde department_requests ordenando por fecha de creación descendente', async () => {
    const { pool, calls } = fakePool([ROW]);
    const list = await new PostgresDataStore(pool).listDepartmentRequests();
    expect(list).toHaveLength(1);
    expect(nth(calls, 0).sql).toMatch(/FROM department_requests/);
    expect(nth(calls, 0).sql).toMatch(/ORDER BY created_at DESC/);
  });

  it('inserta con una consulta parametrizada, sin interpolar valores', async () => {
    const { pool, calls } = fakePool();
    const request = makeRequest({ title: "O'Brien; DROP TABLE users" });
    await new PostgresDataStore(pool).insertDepartmentRequest(request);

    expect(nth(calls, 0).sql).toMatch(/INSERT INTO department_requests/);
    expect(nth(calls, 0).sql).not.toContain("O'Brien");
    expect(nth(calls, 0).params).toContain("O'Brien; DROP TABLE users");
    expect(nth(calls, 0).params).toContain('VALIDATION');
  });

  it('actualiza solo las columnas del módulo y relee la fila', async () => {
    const { pool, calls } = fakePool([ROW]);
    await new PostgresDataStore(pool).updateDepartmentRequest(ROW.id, { status: 'IN_PROGRESS', assigneeId: 'u-legal' });

    expect(nth(calls, 0).sql).toMatch(/UPDATE department_requests SET/);
    expect(nth(calls, 0).sql).not.toMatch(/initiatives|initiative_dependencies/);
    expect(nth(calls, 1).sql).toMatch(/FROM department_requests WHERE id = \$1/);
  });
});

describe('PostgresDataStore — transición atómica de peticiones', () => {
  it('condiciona el UPDATE al estado esperado, en la misma sentencia', async () => {
    const { pool, calls } = fakePool([ROW]);
    const result = await new PostgresDataStore(pool).transitionDepartmentRequest(ROW.id, 'PENDING', {
      status: 'IN_PROGRESS',
      assigneeId: 'u-legal',
    });

    expect(result).not.toBeNull();
    expect(nth(calls, 0).sql).toMatch(/UPDATE department_requests SET[\s\S]*WHERE id = \$1 AND[\s\S]*status = \$12/);
    expect(nth(calls, 0).params).toContain('PENDING');
  });

  it('devuelve null y no relee como éxito si ninguna fila cumplía el estado', async () => {
    const { pool } = fakePool([ROW], 0);
    const result = await new PostgresDataStore(pool).transitionDepartmentRequest(ROW.id, 'PENDING', {
      status: 'IN_PROGRESS',
      assigneeId: 'u-legal',
    });
    expect(result).toBeNull();
  });
});

function nth<T>(items: T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`Falta la consulta ${index}`);
  return item;
}

/** Ampliación A — persistencia de adjuntos y enlaces (T-12). */
const REQ_ID = '11111111-1111-4111-8111-111111111111';

const fileItem = (overrides: Partial<DepartmentRequestAttachment> = {}): DepartmentRequestAttachment =>
  ({
    id: 'att-file',
    requestId: REQ_ID,
    side: 'REQUEST',
    kind: 'FILE',
    fileName: 'borrador.pdf',
    contentType: 'application/pdf',
    sizeBytes: 1234,
    storageKey: `department-requests/${REQ_ID}/att-file.pdf`,
    addedBy: 'u-legal',
    addedAt: '2026-11-07T10:00:00.000Z',
    isRemoved: false,
    removedBy: null,
    removedAt: null,
    ...overrides,
  }) as DepartmentRequestAttachment;

const linkItem = (overrides: Partial<DepartmentRequestAttachment> = {}): DepartmentRequestAttachment =>
  ({
    id: 'att-link',
    requestId: REQ_ID,
    side: 'RESPONSE',
    kind: 'LINK',
    label: 'Informe en Notion',
    url: 'https://notion.so/informe',
    addedBy: 'u-cyber',
    addedAt: '2026-11-07T11:00:00.000Z',
    isRemoved: false,
    removedBy: null,
    removedAt: null,
    ...overrides,
  }) as DepartmentRequestAttachment;

describe('InMemoryDataStore — adjuntos de peticiones', () => {
  it('arranca vacío con semillas que no traen la colección', async () => {
    const seed = buildSeedData();
    delete seed.departmentRequestAttachments;
    expect(await new InMemoryDataStore(seed).listDepartmentRequestAttachments()).toEqual([]);
  });

  it('inserta, lee por id y lista por petición en orden de llegada', async () => {
    const store = new InMemoryDataStore();
    await store.insertDepartmentRequestAttachment(linkItem());
    await store.insertDepartmentRequestAttachment(fileItem());
    await store.insertDepartmentRequestAttachment(fileItem({ id: 'other', requestId: 'otra-peticion' }));

    expect(await store.departmentRequestAttachmentById('att-link')).toEqual(linkItem());
    expect(await store.departmentRequestAttachmentById('missing')).toBeNull();
    expect((await store.listDepartmentRequestAttachments(REQ_ID)).map((a) => a.id)).toEqual(['att-file', 'att-link']);
    expect(await store.listDepartmentRequestAttachments()).toHaveLength(3);
  });

  it('devuelve copias defensivas, avisa al snapshot y sobrevive a la hidratación', async () => {
    const store = new InMemoryDataStore();
    const listener = vi.fn();
    store.setChangeListener(listener);
    const inserted = await store.insertDepartmentRequestAttachment(fileItem());
    (inserted as { fileName: string }).fileName = 'manipulado.exe';

    expect(listener).toHaveBeenCalledTimes(1);
    const restored = new InMemoryDataStore(store.snapshot());
    expect(await restored.departmentRequestAttachmentById('att-file')).toEqual(fileItem());
  });
});

const FILE_ROW = {
  id: 'att-file',
  request_id: REQ_ID,
  side: 'REQUEST',
  kind: 'FILE',
  file_name: 'borrador.pdf',
  content_type: 'application/pdf',
  size_bytes: 1234,
  storage_key: `department-requests/${REQ_ID}/att-file.pdf`,
  label: null,
  url: null,
  added_by: 'u-legal',
  added_at: new Date('2026-11-07T10:00:00.000Z'),
  is_removed: false,
  removed_by: null,
  removed_at: null,
};

const LINK_ROW = {
  ...FILE_ROW,
  id: 'att-link',
  side: 'RESPONSE',
  kind: 'LINK',
  file_name: null,
  content_type: null,
  size_bytes: null,
  storage_key: null,
  label: 'Informe en Notion',
  url: 'https://notion.so/informe',
  added_by: 'u-cyber',
  added_at: new Date('2026-11-07T11:00:00.000Z'),
};

describe('PostgresDataStore — adjuntos de peticiones', () => {
  it('mapea archivos y enlaces sin campos de la otra clase', async () => {
    const { pool } = fakePool([FILE_ROW, LINK_ROW]);
    const list = await new PostgresDataStore(pool).listDepartmentRequestAttachments(REQ_ID);
    expect(list).toEqual([fileItem(), linkItem()]);
  });

  it('filtra por petición con parámetro y ordena por llegada', async () => {
    const { pool, calls } = fakePool([]);
    const store = new PostgresDataStore(pool);
    await store.listDepartmentRequestAttachments(REQ_ID);
    await store.listDepartmentRequestAttachments();
    expect(nth(calls, 0).sql).toMatch(/FROM department_request_attachments WHERE request_id = \$1/);
    expect(nth(calls, 0).params).toEqual([REQ_ID]);
    expect(nth(calls, 0).sql).toMatch(/ORDER BY added_at/);
    expect(nth(calls, 1).sql).not.toMatch(/WHERE/);
  });

  it('inserta con consulta parametrizada y devuelve null si no existe', async () => {
    const { pool, calls } = fakePool([]);
    const store = new PostgresDataStore(pool);
    await store.insertDepartmentRequestAttachment(linkItem({ url: "https://x.test/?q=';DROP TABLE users" }));
    expect(nth(calls, 0).sql).toMatch(/INSERT INTO department_request_attachments/);
    expect(nth(calls, 0).sql).not.toContain('DROP TABLE');
    expect(nth(calls, 0).params).toContain("https://x.test/?q=';DROP TABLE users");
    expect(await store.departmentRequestAttachmentById('x')).toBeNull();
  });
});

/** Ampliación B — baja lógica de adjuntos (T-18). */
describe('retirada de adjuntos en la persistencia', () => {
  it('InMemory: marca la baja lógica sin borrar la fila y avisa al snapshot', async () => {
    const store = new InMemoryDataStore();
    await store.insertDepartmentRequestAttachment(fileItem());
    const listener = vi.fn();
    store.setChangeListener(listener);

    const removed = await store.markDepartmentRequestAttachmentRemoved('att-file', 'u-lead', '2026-11-07T12:00:00.000Z');
    expect(removed).toMatchObject({ isRemoved: true, removedBy: 'u-lead', removedAt: '2026-11-07T12:00:00.000Z' });
    expect(await store.listDepartmentRequestAttachments(REQ_ID)).toHaveLength(1);
    expect(listener).toHaveBeenCalledTimes(1);
    await expect(store.markDepartmentRequestAttachmentRemoved('missing', 'u', 'x')).rejects.toThrow();
  });

  it('InMemory: los snapshots de la ampliación A (sin campos de baja) arrancan como no retirados', async () => {
    const seed = buildSeedData();
    const legacy = { ...fileItem() } as Record<string, unknown>;
    delete legacy.isRemoved;
    delete legacy.removedBy;
    delete legacy.removedAt;
    seed.departmentRequestAttachments = [legacy as unknown as DepartmentRequestAttachment];
    const restored = await new InMemoryDataStore(seed).departmentRequestAttachmentById('att-file');
    expect(restored).toMatchObject({ isRemoved: false, removedBy: null, removedAt: null });
  });

  it('Postgres: mapea la baja y la escribe con consulta parametrizada', async () => {
    const removedRow = { ...FILE_ROW, is_removed: true, removed_by: 'u-lead', removed_at: new Date('2026-11-07T12:00:00.000Z') };
    const { pool, calls } = fakePool([removedRow]);
    const store = new PostgresDataStore(pool);

    const removed = await store.markDepartmentRequestAttachmentRemoved('att-file', 'u-lead', '2026-11-07T12:00:00.000Z');
    expect(removed).toMatchObject({ isRemoved: true, removedBy: 'u-lead', removedAt: '2026-11-07T12:00:00.000Z' });
    expect(nth(calls, 0).sql).toMatch(/UPDATE department_request_attachments SET is_removed = TRUE/);
    expect(nth(calls, 0).params).toEqual(['att-file', 'u-lead', '2026-11-07T12:00:00.000Z']);
    expect(nth(calls, 1).sql).toMatch(/FROM department_request_attachments WHERE id = \$1/);
  });

  it('Postgres: un adjunto activo se mapea como no retirado', async () => {
    const { pool } = fakePool([FILE_ROW]);
    expect(await new PostgresDataStore(pool).departmentRequestAttachmentById('att-file')).toEqual(fileItem());
  });
});
