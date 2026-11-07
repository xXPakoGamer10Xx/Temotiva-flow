import { describe, expect, it, vi } from 'vitest';
import type { DepartmentRequest } from '@/domain/department-request';
import {
  addDepartmentRequestFile,
  addDepartmentRequestLinks,
  createDepartmentRequest,
  getDepartmentRequestFile,
  getDepartmentRequestsView,
  resolveDepartmentRequest,
  startDepartmentRequest,
  type AddDepartmentRequestFileInput,
} from './department-requests';
import { TEST_NOW, hoursBefore, makeInitiative, makeSession, makeTestStore, makeUser, sessionOf } from './test-utils';

/**
 * Ampliación A — adjuntos y enlaces de peticiones (spec 001 §13; RF-17 a RF-21,
 * AC-12 a AC-15). Legal pide a Ciberseguridad; Producto es un área ajena.
 */

const legal = makeUser({ name: 'Lucía Legal', departments: ['LEGAL'], role: 'MEMBER' });
const cyber = makeUser({ name: 'Ciro Ciber', departments: ['CYBER'], role: 'MEMBER' });
const REQUEST_ID = '7a1c2e4e-8b3d-4c5e-9f70-1a2b3c4d5e6f';

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);
const PDF = encode('%PDF-1.4\n% documento de prueba');
const DOCX = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...encode('[Content_Types].xml ... word/document.xml')]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const GIF = encode('GIF89a....');
const EXE = encode('MZ\x90\x00 ejecutable disfrazado');

function makeRequest(overrides: Partial<DepartmentRequest> = {}): DepartmentRequest {
  return {
    id: REQUEST_ID,
    title: 'Revisión del cifrado de datos clínicos',
    description: 'Necesitamos validar el cifrado en reposo antes de firmar.',
    sourceDepartment: 'LEGAL',
    targetDepartment: 'CYBER',
    requestedBy: legal.id,
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

async function setup(request: DepartmentRequest | null = makeRequest()) {
  const { store } = makeTestStore([makeInitiative()], [legal, cyber]);
  if (request) await store.insertDepartmentRequest(request);
  const put = vi.fn(async () => undefined);
  return { store, put };
}

const fileInput = (overrides: Partial<AddDepartmentRequestFileInput> = {}): AddDepartmentRequestFileInput => ({
  requestId: REQUEST_ID,
  side: 'REQUEST',
  fileName: 'borrador.pdf',
  bytes: PDF,
  now: TEST_NOW,
  ...overrides,
});

const LINK = { label: 'Diseño en Figma', url: 'https://figma.com/file/abc' };

describe('enlaces al crear y al resolver (RF-17, RF-18, RF-20)', () => {
  it('crea la petición con sus enlaces como «de la petición» y los audita sin URL', async () => {
    const { store } = await setup(null);
    const request = await createDepartmentRequest(store, sessionOf(legal), {
      sourceDepartment: 'LEGAL',
      targetDepartment: 'CYBER',
      helpType: 'VALIDATION',
      title: 'Revisión del cifrado de datos clínicos',
      description: 'Necesitamos validar el cifrado en reposo antes de firmar.',
      blocksInitiative: false,
      links: [{ label: '  Diseño en Figma ', url: ' https://figma.com/file/abc ' }],
      now: TEST_NOW,
    });

    const items = await store.listDepartmentRequestAttachments(request.id);
    expect(items).toEqual([
      expect.objectContaining({ side: 'REQUEST', kind: 'LINK', label: 'Diseño en Figma', url: 'https://figma.com/file/abc', addedBy: legal.id }),
    ]);
    const events = (await store.listActivityLog()).filter((e) => e.actionType === 'DEPARTMENT_REQUEST_ATTACHMENT_ADDED');
    expect(events).toEqual([
      expect.objectContaining({ initiativeId: null, userId: legal.id, newValue: expect.objectContaining({ side: 'REQUEST', kind: 'LINK' }) }),
    ]);
    expect(JSON.stringify(events)).not.toMatch(/figma/);
  });

  it.each([
    ['http://', { label: 'Inseguro', url: 'http://figma.com/file' }],
    ['javascript:', { label: 'Truco', url: 'javascript:alert(1)' }],
    ['con credenciales', { label: 'Credenciales', url: 'https://user:pass@x.test/' }],
    ['nombre corto', { label: 'x', url: 'https://x.test/' }],
    ['URL demasiado larga', { label: 'Larga', url: `https://x.test/${'a'.repeat(500)}` }],
  ])('rechaza un enlace %s al crear y no persiste ni la petición (AC-14)', async (_label, link) => {
    const { store } = await setup(null);
    await expect(
      createDepartmentRequest(store, sessionOf(legal), {
        sourceDepartment: 'LEGAL',
        targetDepartment: 'CYBER',
        helpType: 'VALIDATION',
        title: 'Revisión del cifrado de datos clínicos',
        description: 'Necesitamos validar el cifrado en reposo antes de firmar.',
        blocksInitiative: false,
        links: [link],
        now: TEST_NOW,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(await store.listDepartmentRequests()).toEqual([]);
    expect(await store.listDepartmentRequestAttachments()).toEqual([]);
  });

  it('el área destino resuelve con enlaces «de la respuesta»; los enlaces se guardan antes de cerrar', async () => {
    const { store } = await setup();
    await resolveDepartmentRequest(store, sessionOf(cyber), {
      requestId: REQUEST_ID,
      resolutionNotes: 'Cifrado validado.',
      links: [{ label: 'Informe', url: 'https://notion.so/informe' }],
      now: TEST_NOW,
    });
    expect(await store.listDepartmentRequestAttachments(REQUEST_ID)).toEqual([
      expect.objectContaining({ side: 'RESPONSE', kind: 'LINK', addedBy: cyber.id }),
    ]);
  });

  it('un enlace inválido al resolver no resuelve ni guarda nada', async () => {
    const { store } = await setup();
    await expect(
      resolveDepartmentRequest(store, sessionOf(cyber), {
        requestId: REQUEST_ID,
        resolutionNotes: 'Cifrado validado.',
        links: [{ label: 'Malo', url: 'ftp://x.test/' }],
        now: TEST_NOW,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    expect((await store.departmentRequestById(REQUEST_ID))?.status).toBe('PENDING');
    expect(await store.listDepartmentRequestAttachments()).toEqual([]);
  });

  it('respeta el cupo de 5 enlaces por lado contando los ya añadidos', async () => {
    const { store } = await setup();
    const four = Array.from({ length: 4 }, (_, i) => ({ label: `Enlace ${i}`, url: `https://x.test/${i}` }));
    await addDepartmentRequestLinks(store, sessionOf(legal), { requestId: REQUEST_ID, side: 'REQUEST', links: four, now: TEST_NOW });
    await expect(
      addDepartmentRequestLinks(store, sessionOf(legal), {
        requestId: REQUEST_ID,
        side: 'REQUEST',
        links: [LINK, { label: 'Sexto', url: 'https://x.test/6' }],
        now: TEST_NOW,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(await store.listDepartmentRequestAttachments(REQUEST_ID)).toHaveLength(4);
  });
});

describe('archivos (RF-17 a RF-19, AC-14)', () => {
  it.each([
    ['PDF', 'borrador.pdf', PDF, 'application/pdf', 'pdf'],
    ['Word', 'acta.docx', DOCX, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx'],
    ['PNG', 'captura.png', PNG, 'image/png', 'png'],
  ])('acepta %s por sus bytes y lo guarda en el almacenamiento privado', async (_label, fileName, bytes, contentType, extension) => {
    const { store, put } = await setup();
    const item = await addDepartmentRequestFile(store, sessionOf(legal), put, fileInput({ fileName, bytes }));

    expect(item).toMatchObject({ kind: 'FILE', side: 'REQUEST', fileName, contentType, sizeBytes: bytes.byteLength });
    expect(put).toHaveBeenCalledWith(`department-requests/${REQUEST_ID}/${item.id}.${extension}`, bytes, contentType);
    const [event] = await store.listActivityLog();
    expect(event).toMatchObject({
      actionType: 'DEPARTMENT_REQUEST_ATTACHMENT_ADDED',
      initiativeId: null,
      newValue: { requestId: REQUEST_ID, attachmentId: item.id, side: 'REQUEST', kind: 'FILE', contentType, sizeBytes: bytes.byteLength },
    });
    expect(JSON.stringify(event)).not.toContain(fileName);
  });

  it.each([
    ['un GIF', 'animacion.gif', GIF],
    ['un ejecutable renombrado a .pdf', 'factura.pdf', EXE],
    ['un archivo vacío', 'vacio.pdf', new Uint8Array()],
    ['un archivo de más de 4 MB', 'grande.pdf', new Uint8Array([...PDF, ...new Uint8Array(4 * 1024 * 1024)])],
  ])('rechaza %s sin guardar nada', async (_label, fileName, bytes) => {
    const { store, put } = await setup();
    await expect(
      addDepartmentRequestFile(store, sessionOf(legal), put, fileInput({ fileName, bytes })),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(put).not.toHaveBeenCalled();
    expect(await store.listDepartmentRequestAttachments()).toEqual([]);
  });

  it('limita a 5 archivos por lado, sin contar los del otro lado', async () => {
    const { store, put } = await setup();
    for (let i = 0; i < 5; i += 1) {
      await addDepartmentRequestFile(store, sessionOf(legal), put, fileInput({ fileName: `doc-${i}.pdf` }));
    }
    await expect(
      addDepartmentRequestFile(store, sessionOf(legal), put, fileInput({ fileName: 'sexto.pdf' })),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    // El lado de la respuesta tiene su propio cupo.
    await addDepartmentRequestFile(store, sessionOf(cyber), put, fileInput({ side: 'RESPONSE', fileName: 'respuesta.pdf' }));
    expect(await store.listDepartmentRequestAttachments(REQUEST_ID)).toHaveLength(6);
  });

  it('limpia el nombre del archivo (sin rutas ni caracteres de control)', async () => {
    const { store, put } = await setup();
    const item = await addDepartmentRequestFile(store, sessionOf(legal), put, fileInput({ fileName: '..\\..\\secreto<1>.pdf' }));
    expect(item).toMatchObject({ fileName: 'secreto1.pdf' });
  });
});

describe('quién adjunta y cuándo (RF-17, RF-18, AC-15)', () => {
  it('el área origen no adjunta como respuesta, ni el área destino como petición', async () => {
    const { store, put } = await setup();
    await expect(
      addDepartmentRequestFile(store, sessionOf(legal), put, fileInput({ side: 'RESPONSE' })),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      addDepartmentRequestLinks(store, sessionOf(cyber), { requestId: REQUEST_ID, side: 'REQUEST', links: [LINK], now: TEST_NOW }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(await store.listDepartmentRequestAttachments()).toEqual([]);
  });

  it('para un área ajena la petición no existe', async () => {
    const { store, put } = await setup();
    await expect(
      addDepartmentRequestFile(store, makeSession('PRODUCT', 'LEAD'), put, fileInput()),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', message: 'La petición no existe.' });
  });

  it('el lado de la petición se cierra al tomarla; el de la respuesta, al resolverla', async () => {
    const { store, put } = await setup();
    await startDepartmentRequest(store, sessionOf(cyber), { requestId: REQUEST_ID, now: TEST_NOW });
    await expect(
      addDepartmentRequestFile(store, sessionOf(legal), put, fileInput()),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });

    await addDepartmentRequestFile(store, sessionOf(cyber), put, fileInput({ side: 'RESPONSE', fileName: 'avance.pdf' }));
    await resolveDepartmentRequest(store, sessionOf(cyber), { requestId: REQUEST_ID, resolutionNotes: 'Listo.', now: TEST_NOW });
    await expect(
      addDepartmentRequestFile(store, sessionOf(cyber), put, fileInput({ side: 'RESPONSE', fileName: 'tarde.pdf' })),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });

  it('Dirección puede adjuntar a la respuesta de cualquier petición', async () => {
    const { store, put } = await setup();
    const item = await addDepartmentRequestFile(store, makeSession([], 'EXECUTIVE'), put, fileInput({ side: 'RESPONSE' }));
    expect(item.side).toBe('RESPONSE');
  });
});

describe('descarga con Need-to-Know (RF-21, AC-12)', () => {
  it('lo descargan las áreas implicadas; para las demás el archivo no existe', async () => {
    const { store, put } = await setup();
    const item = await addDepartmentRequestFile(store, sessionOf(legal), put, fileInput());

    expect(await getDepartmentRequestFile(store, sessionOf(cyber), item.id)).toMatchObject({ id: item.id, storageKey: item.storageKey });
    expect(await getDepartmentRequestFile(store, makeSession([], 'EXECUTIVE'), item.id)).toMatchObject({ id: item.id });
    for (const attempt of [
      getDepartmentRequestFile(store, makeSession('PRODUCT', 'LEAD'), item.id),
      getDepartmentRequestFile(store, sessionOf(cyber), '00000000-0000-4000-8000-000000000000'),
    ]) {
      await expect(attempt).rejects.toMatchObject({ code: 'NOT_FOUND', message: 'El archivo no existe.' });
    }
  });

  it('un enlace no se «descarga»', async () => {
    const { store } = await setup();
    await addDepartmentRequestLinks(store, sessionOf(legal), { requestId: REQUEST_ID, side: 'REQUEST', links: [LINK], now: TEST_NOW });
    const [link] = await store.listDepartmentRequestAttachments(REQUEST_ID);
    await expect(getDepartmentRequestFile(store, sessionOf(legal), link!.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('proyección de adjuntos en la vista', () => {
  it('agrupa por petición y lado, con enlace de descarga y sin clave de almacenamiento', async () => {
    const { store, put } = await setup();
    const file = await addDepartmentRequestFile(store, sessionOf(legal), put, fileInput());
    await addDepartmentRequestLinks(store, sessionOf(cyber), { requestId: REQUEST_ID, side: 'RESPONSE', links: [LINK], now: TEST_NOW });

    const view = await getDepartmentRequestsView(store, sessionOf(cyber));
    const [request] = view.requests;
    expect(request?.attachments).toEqual([
      expect.objectContaining({
        id: file.id,
        side: 'REQUEST',
        kind: 'FILE',
        fileName: 'borrador.pdf',
        addedByName: 'Lucía Legal',
        downloadUrl: `/api/department-requests/attachments/${file.id}`,
      }),
      expect.objectContaining({ side: 'RESPONSE', kind: 'LINK', label: 'Diseño en Figma', url: 'https://figma.com/file/abc', addedByName: 'Ciro Ciber' }),
    ]);
    // La clave del almacenamiento privado nunca llega al cliente; solo la ruta con Need-to-Know.
    expect(JSON.stringify(view)).not.toContain(file.storageKey);
    expect(JSON.stringify(view)).not.toContain('storageKey');
  });

  it('indica en qué lado puede adjuntar cada sesión', async () => {
    const { store } = await setup();
    const asLegal = (await getDepartmentRequestsView(store, sessionOf(legal))).requests[0];
    const asCyber = (await getDepartmentRequestsView(store, sessionOf(cyber))).requests[0];
    expect(asLegal).toMatchObject({ canAttachRequest: true, canAttachResponse: false });
    expect(asCyber).toMatchObject({ canAttachRequest: false, canAttachResponse: true });
  });

  it('un área ajena no recibe ni la petición ni sus adjuntos', async () => {
    const { store, put } = await setup();
    await addDepartmentRequestFile(store, sessionOf(legal), put, fileInput());
    const view = await getDepartmentRequestsView(store, makeSession('PRODUCT', 'MEMBER'));
    expect(view.requests).toEqual([]);
    expect(JSON.stringify(view)).not.toContain('borrador');
  });
});
