import { describe, expect, it } from 'vitest';
import { MAX_ATTACHMENT_BYTES, DOCX_MIME, PDF_MIME, addAttachment, detectDocumentType, removeAttachment } from './attachments';
import { TEST_NOW, makeInitiative, makeSession, makeTestStore } from './test-utils';

const bytes = (text: string): Uint8Array => new Uint8Array(Buffer.from(text, 'latin1'));
const PDF = bytes('%PDF-1.7\n1 0 obj\n');
const DOCX = bytes('PK\u0003\u0004[Content_Types].xmlword/document.xml');

function memoryStorage() {
  const files = new Map<string, Uint8Array>();
  return { files, put: async (key: string, data: Uint8Array) => void files.set(key, data) };
}

describe('documentos adjuntos', () => {
  it('detecta PDF y DOCX por los bytes, no por el nombre', () => {
    expect(detectDocumentType(PDF)).toBe(PDF_MIME);
    expect(detectDocumentType(DOCX)).toBe(DOCX_MIME);
    expect(detectDocumentType(bytes('MZ\u0090\u0000 ejecutable'))).toBeNull();
    // Un ZIP cualquiera no es un DOCX.
    expect(detectDocumentType(bytes('PK\u0003\u0004otro.txt'))).toBeNull();
  });

  it('un .exe renombrado a .pdf se rechaza', async () => {
    const { store } = makeTestStore();
    const storage = memoryStorage();
    await expect(
      addAttachment(store, makeSession('LEGAL', 'MEMBER'), storage.put, {
        initiativeId: 'TEMO-500',
        fileName: 'informe.pdf',
        bytes: bytes('MZ\u0090\u0000'),
      }),
    ).rejects.toThrow(/PDF o Word/);
    expect(storage.files.size).toBe(0);
  });

  it('rechaza archivos vacíos o de más de 4 MB', async () => {
    const { store } = makeTestStore();
    const storage = memoryStorage();
    const session = makeSession('LEGAL', 'MEMBER');
    const big = new Uint8Array(MAX_ATTACHMENT_BYTES + 1);
    big.set(PDF);
    await expect(addAttachment(store, session, storage.put, { initiativeId: 'TEMO-500', fileName: 'a.pdf', bytes: big })).rejects.toThrow(/4 MB/);
    await expect(addAttachment(store, session, storage.put, { initiativeId: 'TEMO-500', fileName: 'a.pdf', bytes: new Uint8Array() })).rejects.toThrow(/vacío/);
  });

  it('adjunta, registra el evento y normaliza el nombre', async () => {
    const { store } = makeTestStore();
    const storage = memoryStorage();
    const session = makeSession('LEGAL', 'MEMBER');
    const attachment = await addAttachment(store, session, storage.put, {
      initiativeId: 'TEMO-500',
      fileName: '..\\..\\etc/passwd',
      bytes: PDF,
      now: TEST_NOW,
    });
    expect(attachment.fileName).toBe('passwd.pdf');
    expect(attachment.storageKey).toMatch(/^initiatives\/TEMO-500\/.+\.pdf$/);
    expect(storage.files.has(attachment.storageKey)).toBe(true);
    const log = await store.listActivityLog('TEMO-500');
    expect(log.map((entry) => entry.actionType)).toEqual(['ATTACHMENT_ADDED']);
  });

  it('no se adjunta a una iniciativa archivada', async () => {
    const { store } = makeTestStore([makeInitiative({ isArchived: true })]);
    await expect(
      addAttachment(store, makeSession('LEGAL', 'MEMBER'), memoryStorage().put, {
        initiativeId: 'TEMO-500',
        fileName: 'a.pdf',
        bytes: PDF,
      }),
    ).rejects.toThrow(/archivada/);
  });

  it('retirar es baja lógica y respeta los permisos', async () => {
    const { store } = makeTestStore([makeInitiative({ ownerDepartment: 'LEGAL' })]);
    const storage = memoryStorage();
    const uploader = makeSession('PRODUCT', 'MEMBER');
    const attachment = await addAttachment(store, uploader, storage.put, { initiativeId: 'TEMO-500', fileName: 'a.pdf', bytes: PDF, now: TEST_NOW });

    await expect(removeAttachment(store, makeSession('PRODUCT', 'MEMBER'), { attachmentId: attachment.id })).rejects.toThrow(/Solo quien subió/);
    await expect(removeAttachment(store, makeSession('TECH', 'LEAD'), { attachmentId: attachment.id })).rejects.toThrow(/Solo quien subió/);

    await removeAttachment(store, makeSession('LEGAL', 'LEAD'), { attachmentId: attachment.id, now: TEST_NOW });
    const rows = await store.listAttachments('TEMO-500');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.isRemoved).toBe(true);
    expect(storage.files.has(attachment.storageKey)).toBe(true);
    await expect(removeAttachment(store, makeSession('LEGAL', 'LEAD'), { attachmentId: attachment.id })).rejects.toThrow(/ya se retiró/);
  });

  it('quien subió el documento puede retirarlo', async () => {
    const { store } = makeTestStore();
    const storage = memoryStorage();
    const uploader = makeSession('PRODUCT', 'MEMBER');
    const attachment = await addAttachment(store, uploader, storage.put, { initiativeId: 'TEMO-500', fileName: 'a.pdf', bytes: PDF });
    await removeAttachment(store, uploader, { attachmentId: attachment.id });
    expect((await store.attachmentById(attachment.id))?.isRemoved).toBe(true);
  });
});
