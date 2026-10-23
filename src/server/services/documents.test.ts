import { describe, expect, it } from 'vitest';
import { MAX_DOCUMENT_BYTES } from '@/domain/document-files';
import type { User } from '@/domain/types';
import {
  getDocumentsView,
  removeDocument,
  shareDocument,
  unshareDocument,
  uploadDocument,
} from './documents';
import { TEST_NOW, makeTestStore, makeUser, sessionOf } from './test-utils';

const bytes = (text: string): Uint8Array => new Uint8Array(Buffer.from(text, 'latin1'));
const PDF = bytes('%PDF-1.7\n1 0 obj\n');

function memoryStorage() {
  const files = new Map<string, Uint8Array>();
  return { files, put: async (key: string, data: Uint8Array) => void files.set(key, data) };
}

/** Un equipo mínimo: Ciberseguridad (jefa + miembro), Legal (jefa + miembro) y Dirección. */
function setup() {
  const cyberLead = makeUser({ departments: ['CYBER'], role: 'LEAD' });
  const cyberMember = makeUser({ departments: ['CYBER'], role: 'MEMBER' });
  const legalLead = makeUser({ departments: ['LEGAL'], role: 'LEAD' });
  const legalMember = makeUser({ departments: ['LEGAL'], role: 'MEMBER' });
  const boss = makeUser({ departments: ['PRODUCT'], role: 'EXECUTIVE' });
  const ctx = makeTestStore([], [cyberLead, cyberMember, legalLead, legalMember, boss]);
  return { ...ctx, cyberLead, cyberMember, legalLead, legalMember, boss, storage: memoryStorage() };
}

const upload = (
  s: ReturnType<typeof setup>,
  user: User,
  extra: { fileName?: string; bytes?: Uint8Array; department?: 'CYBER' | 'LEGAL' } = {},
) =>
  uploadDocument(s.store, sessionOf(user), s.storage.put, {
    fileName: extra.fileName ?? 'politica.pdf',
    bytes: extra.bytes ?? PDF,
    department: extra.department,
    now: TEST_NOW,
  });

const idsFor = async (s: ReturnType<typeof setup>, user: User): Promise<string[]> =>
  (await getDocumentsView(s.store, sessionOf(user))).documents.map((document) => document.id);

describe('biblioteca de documentos', () => {
  it('cada persona solo ve los documentos de su área', async () => {
    const s = setup();
    const doc = await upload(s, s.cyberMember);
    expect(await idsFor(s, s.cyberLead)).toEqual([doc.id]);
    expect(await idsFor(s, s.legalMember)).toEqual([]);
    expect(await idsFor(s, s.legalLead)).toEqual([]);
    // Dirección ve todo.
    expect(await idsFor(s, s.boss)).toEqual([doc.id]);
  });

  it('solo se sube a las propias áreas', async () => {
    const s = setup();
    await expect(upload(s, s.legalMember, { department: 'CYBER' })).rejects.toThrow(/propias áreas/);
    expect(s.storage.files.size).toBe(0);
  });

  it('compartir con una persona le da acceso solo a ella', async () => {
    const s = setup();
    const doc = await upload(s, s.cyberMember);
    await shareDocument(s.store, sessionOf(s.cyberLead), { documentId: doc.id, targetType: 'USER', targetUserId: s.legalMember.id });
    expect(await idsFor(s, s.legalMember)).toEqual([doc.id]);
    expect(await idsFor(s, s.legalLead)).toEqual([]);
  });

  it('"todos los responsables" llega solo a los LEAD', async () => {
    const s = setup();
    const doc = await upload(s, s.cyberMember);
    await shareDocument(s.store, sessionOf(s.cyberLead), { documentId: doc.id, targetType: 'LEADS' });
    expect(await idsFor(s, s.legalLead)).toEqual([doc.id]);
    expect(await idsFor(s, s.legalMember)).toEqual([]);
  });

  it('"toda la empresa" llega a todo el mundo, también a quien entre después', async () => {
    const s = setup();
    const doc = await upload(s, s.cyberMember);
    await shareDocument(s.store, sessionOf(s.cyberLead), { documentId: doc.id, targetType: 'ALL' });
    const newcomer = makeUser({ departments: ['DESIGN'], role: 'MEMBER' });
    await s.store.insertUser(newcomer);
    expect(await idsFor(s, s.legalMember)).toEqual([doc.id]);
    expect(await idsFor(s, newcomer)).toEqual([doc.id]);
  });

  it('compartir con un área llega a todo su equipo', async () => {
    const s = setup();
    const doc = await upload(s, s.cyberMember);
    await shareDocument(s.store, sessionOf(s.cyberLead), { documentId: doc.id, targetType: 'DEPARTMENT', targetDepartment: 'LEGAL' });
    expect(await idsFor(s, s.legalMember)).toEqual([doc.id]);
    expect(await idsFor(s, s.legalLead)).toEqual([doc.id]);
  });

  it('un miembro no puede compartir y un LEAD ajeno tampoco', async () => {
    const s = setup();
    const doc = await upload(s, s.cyberMember);
    const attempt = { documentId: doc.id, targetType: 'ALL' as const };
    await expect(shareDocument(s.store, sessionOf(s.cyberMember), attempt)).rejects.toThrow(/responsable/);
    await expect(shareDocument(s.store, sessionOf(s.legalLead), attempt)).rejects.toThrow(/responsable/);
    await expect(shareDocument(s.store, sessionOf(s.boss), attempt)).resolves.toBeDefined();
  });

  it('no se comparte con una persona inexistente o inactiva', async () => {
    const s = setup();
    const doc = await upload(s, s.cyberMember);
    const inactive = makeUser({ isActive: false });
    await s.store.insertUser(inactive);
    const lead = sessionOf(s.cyberLead);
    await expect(shareDocument(s.store, lead, { documentId: doc.id, targetType: 'USER', targetUserId: inactive.id })).rejects.toThrow(/no existe/);
    await expect(shareDocument(s.store, lead, { documentId: doc.id, targetType: 'USER' })).rejects.toThrow(/no existe/);
  });

  it('compartir dos veces lo mismo no duplica', async () => {
    const s = setup();
    const doc = await upload(s, s.cyberMember);
    const lead = sessionOf(s.cyberLead);
    await shareDocument(s.store, lead, { documentId: doc.id, targetType: 'ALL' });
    await shareDocument(s.store, lead, { documentId: doc.id, targetType: 'ALL' });
    expect(await s.store.listDocumentShares(doc.id)).toHaveLength(1);
  });

  it('quitar un acceso lo cierra y queda en el log', async () => {
    const s = setup();
    const doc = await upload(s, s.cyberMember);
    const share = await shareDocument(s.store, sessionOf(s.cyberLead), { documentId: doc.id, targetType: 'ALL' });
    await expect(unshareDocument(s.store, sessionOf(s.legalMember), { shareId: share.id })).rejects.toThrow(/responsable/);
    await unshareDocument(s.store, sessionOf(s.cyberLead), { shareId: share.id });
    expect(await idsFor(s, s.legalMember)).toEqual([]);
    const log = (await s.store.listActivityLog()).map((entry) => entry.actionType);
    expect(log).toEqual(['DOCUMENT_UPLOADED', 'DOCUMENT_SHARED', 'DOCUMENT_UNSHARED']);
  });

  it('quien no gestiona el documento no ve con quién se comparte, y la lista de personas va vacía', async () => {
    const s = setup();
    const doc = await upload(s, s.cyberMember);
    await shareDocument(s.store, sessionOf(s.cyberLead), { documentId: doc.id, targetType: 'ALL' });
    const memberView = await getDocumentsView(s.store, sessionOf(s.cyberMember));
    expect(memberView.documents[0]?.shares).toEqual([]);
    expect(memberView.people).toEqual([]);
    const leadView = await getDocumentsView(s.store, sessionOf(s.cyberLead));
    expect(leadView.documents[0]?.shares.map((share) => share.label)).toEqual(['Toda la empresa']);
    expect(leadView.people.some((person) => person.id === s.cyberLead.id)).toBe(false);
    expect(leadView.people).not.toHaveProperty('0.email');
  });

  describe('archivos', () => {
    it.each(['programa.exe', 'script.bat', 'run.sh', 'informe.pdf.exe', 'virus.exe.pdf'])('rechaza %s', async (fileName) => {
      const s = setup();
      await expect(upload(s, s.cyberMember, { fileName })).rejects.toThrow(/ejecutables/);
      expect(s.storage.files.size).toBe(0);
    });

    it('rechaza un binario ejecutable renombrado a .pdf', async () => {
      const s = setup();
      await expect(upload(s, s.cyberMember, { fileName: 'informe.pdf', bytes: bytes('MZ\u0090\u0000') })).rejects.toThrow(/ejecutables/);
      await expect(upload(s, s.cyberMember, { fileName: 'nota.txt', bytes: bytes('#!/bin/sh\nrm -rf /') })).rejects.toThrow(/ejecutables/);
    });

    it('admite otros formatos (hoja de cálculo, imagen, texto)', async () => {
      const s = setup();
      await expect(upload(s, s.cyberMember, { fileName: 'datos.xlsx', bytes: bytes('PK\u0003\u0004xl/') })).resolves.toBeDefined();
      await expect(upload(s, s.cyberMember, { fileName: 'notas.txt', bytes: bytes('hola') })).resolves.toBeDefined();
    });

    it('sirve como binario opaco lo que no es un tipo conocido', async () => {
      const s = setup();
      const doc = await upload(s, s.cyberMember, { fileName: 'pagina.html', bytes: bytes('<script>alert(1)</script>') });
      expect(doc.contentType).toBe('application/octet-stream');
    });

    it('rechaza vacíos y de más de 4 MB', async () => {
      const s = setup();
      await expect(upload(s, s.cyberMember, { bytes: new Uint8Array(0) })).rejects.toThrow(/vacío/);
      await expect(upload(s, s.cyberMember, { bytes: new Uint8Array(MAX_DOCUMENT_BYTES + 1) })).rejects.toThrow(/4 MB/);
    });

    it('limpia el nombre y no lo usa en la clave de almacenamiento', async () => {
      const s = setup();
      const doc = await upload(s, s.cyberMember, { fileName: '../../etc/pass:wd.pdf' });
      expect(doc.fileName).toBe('passwd.pdf');
      expect(doc.storageKey).toBe(`documents/CYBER/${doc.id}`);
    });
  });

  describe('retirar', () => {
    it('lo retira quien lo subió, el LEAD del área o Dirección; no otro miembro', async () => {
      const s = setup();
      const doc = await upload(s, s.cyberMember);
      const other = makeUser({ departments: ['CYBER'], role: 'MEMBER' });
      await s.store.insertUser(other);
      await expect(removeDocument(s.store, sessionOf(other), { documentId: doc.id })).rejects.toThrow(/Solo quien subió/);
      await removeDocument(s.store, sessionOf(s.cyberLead), { documentId: doc.id, now: TEST_NOW });

      const second = await upload(s, s.cyberMember);
      await removeDocument(s.store, sessionOf(s.cyberMember), { documentId: second.id });
      const third = await upload(s, s.cyberMember);
      await removeDocument(s.store, sessionOf(s.boss), { documentId: third.id });
    });

    it('es baja lógica: la fila queda, desaparece de la vista y el log se conserva', async () => {
      const s = setup();
      const doc = await upload(s, s.cyberMember);
      await removeDocument(s.store, sessionOf(s.cyberMember), { documentId: doc.id });
      expect((await s.store.documentById(doc.id))?.isRemoved).toBe(true);
      expect(await idsFor(s, s.cyberMember)).toEqual([]);
      const log = (await s.store.listActivityLog()).map((entry) => entry.actionType);
      expect(log).toEqual(['DOCUMENT_UPLOADED', 'DOCUMENT_REMOVED']);
    });

    it('quien no lo ve no puede retirarlo (responde "no existe")', async () => {
      const s = setup();
      const doc = await upload(s, s.cyberMember);
      await expect(removeDocument(s.store, sessionOf(s.legalLead), { documentId: doc.id })).rejects.toThrow(/no existe/);
    });
  });
});
